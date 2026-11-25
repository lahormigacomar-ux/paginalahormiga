import React, { useState, useEffect, useMemo } from 'react';
import {
  RentalContract,
  RentalContractStatus,
  RentalAttachment,
  RentalAttachmentCategory,
  Vehicle,
  Employee,
  EquipmentCategory,
  Quotation,
  QuotationItem,
  ArcaCondicionIva,
  ParteDiario,
  ArcaInvoice
} from '../../types';
import { formatCurrency } from '../../services/storage';
import { uploadFileToCloudflareR2 } from '../../services/api';
import { formatInvoiceNumber, resolveRentalContractLinks } from '../../utils/crossLinks';
import { ClientDirectoryModal } from '../ClientDirectoryModal';
import {
  X,
  Truck,
  UserCheck,
  Building2,
  Calendar,
  Check,
  Wrench,
  FileText,
  Search,
  Link2,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  Camera,
  Paperclip,
  Upload,
  Eye,
  Download,
  FileCheck2,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users
} from 'lucide-react';

interface RentalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contract: RentalContract, linkedQuotationId?: string) => void;
  contractToEdit?: RentalContract | null;
  fleet: Vehicle[];
  employees: Employee[];
  existingCount: number;
  quotations?: Quotation[];
  preselectedQuotation?: Quotation | null;
  partesDiarios?: ParteDiario[];
  invoices?: ArcaInvoice[];
  defaultObra?: {
    id: string;
    numero?: string;
    nombreObra: string;
    ubicacion?: string;
    pertenece?: string;
  } | null;
  defaultPeriodRange?: {
    fechaDesde?: string;
    fechaHasta?: string;
    titulo?: string;
  } | null;
}

interface DbClientRecord {
  cuit: string;
  razonSocial: string;
  condicionIva: string;
  condicionVenta: string;
  domicilio: string;
  localidad: string;
  zona: string;
  telefono: string;
  email: string;
  fuente: string;
  ultimoComprobante?: string;
}

// Helper to format clean equipment number & internal code (avoids showing raw random hex UUIDs)
export function getCleanEquipmentCodes(v: Vehicle): {
  numeroEquipo: string;
  codigoInterno: string;
  shortCode: string;
  cleanSearchString: string;
} {
  const rawInterno = String(v.codigoInterno || '').trim();
  const rawCodigo = String(v.codigo || v.codigoEquipo || '').trim();
  const rawId = String(v.id || '').trim();

  const cleanInterno =
    rawInterno && rawInterno !== 'INT--' && rawInterno !== 'INT-0' ? rawInterno : '';

  const isHexUuid = /^[0-9a-f]{7,}/i.test(rawId);

  let numeroEquipo = '';
  if (rawCodigo && !/^[0-9a-f]{7,}/i.test(rawCodigo)) {
    numeroEquipo = rawCodigo;
  } else if (!isHexUuid && rawId) {
    numeroEquipo = rawId;
  } else if (cleanInterno) {
    const digits = cleanInterno.replace(/\D/g, '');
    numeroEquipo = digits ? `EQ-${digits.padStart(2, '0')}` : cleanInterno;
  } else {
    numeroEquipo = `EQ-${rawId.slice(0, 4).toUpperCase()}`;
  }

  const codigoInternoDisplay = cleanInterno || numeroEquipo;
  const shortCode =
    cleanInterno.replace(/^INT-/i, '').trim() ||
    numeroEquipo.replace(/^EQ-/i, '').trim() ||
    codigoInternoDisplay;

  return {
    numeroEquipo,
    codigoInterno: codigoInternoDisplay,
    shortCode,
    cleanSearchString: `${shortCode} ${numeroEquipo} ${codigoInternoDisplay} ${v.modeloMarca || ''} ${v.patente || ''} ${v.clasificacion || ''}`.toLowerCase()
  };
}

const EMPTY_QUOTATIONS: Quotation[] = [];
const EMPTY_PARTES: ParteDiario[] = [];
const EMPTY_INVOICES: ArcaInvoice[] = [];

export const RentalFormModal: React.FC<RentalFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  contractToEdit,
  fleet,
  employees,
  existingCount,
  quotations = EMPTY_QUOTATIONS,
  preselectedQuotation = null,
  partesDiarios = EMPTY_PARTES,
  invoices = EMPTY_INVOICES,
  defaultObra = null,
  defaultPeriodRange = null
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // Live Quotations & Client Directory from Supabase PostgreSQL
  const [dbQuotations, setDbQuotations] = useState<Quotation[]>(quotations);
  const [dbClients, setDbClients] = useState<DbClientRecord[]>([]);
  const [quotationSearchTerm, setQuotationSearchTerm] = useState<string>('');

  // Linked Quotation, Invoice, Partes Diarios & Billing/Payment State
  const [cotizacionId, setCotizacionId] = useState<string>('');
  const [cotizacionNumero, setCotizacionNumero] = useState<string>('');
  const [facturaId, setFacturaId] = useState<string>('');
  const [facturaNumero, setFacturaNumero] = useState<string>('');
  const [partesDiariosIds, setPartesDiariosIds] = useState<string[]>([]);
  const [estadoFacturacion, setEstadoFacturacion] = useState<'SIN_FACTURAR' | 'FACTURADO_PARCIAL' | 'FACTURADO'>('SIN_FACTURAR');
  const [estadoCobro, setEstadoCobro] = useState<'PENDIENTE_PAGO' | 'COBRADO_PARCIAL' | 'PAGADO'>('PENDIENTE_PAGO');
  const [parteSearchTerm, setParteSearchTerm] = useState<string>('');
  const [onlyMatchingEquipmentPartes, setOnlyMatchingEquipmentPartes] = useState<boolean>(false);

  // Contract Number, Optional Title & Status
  const [numeroContrato, setNumeroContrato] = useState<string>('');
  const [titulo, setTitulo] = useState<string>('');
  const [estado, setEstado] = useState<RentalContractStatus>('ACTIVO');

  // 1. Customer & Fiscal Data (Ordered 1:1 with Cotizador & Facturación ARCA)
  const [clienteDocumento, setClienteDocumento] = useState<string>('');
  const [clienteNombre, setClienteNombre] = useState<string>('');
  const [clienteCondicionIva, setClienteCondicionIva] = useState<ArcaCondicionIva>('RESPONSABLE_INSCRIPTO');
  const [condicionVenta, setCondicionVenta] = useState<string>('CONTADO / TRANSFERENCIA');
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
  const [cotizacionDolar, setCotizacionDolar] = useState<number>(0);
  const [clienteTelefono, setClienteTelefono] = useState<string>('');
  const [clienteEmail, setClienteEmail] = useState<string>('');
  const [direccionObra, setDireccionObra] = useState<string>('');
  const [localidadObra, setLocalidadObra] = useState<string>('SAN SALVADOR DE JUJUY');
  const [zonaObra, setZonaObra] = useState<string>('');

  // Client Autocomplete / Padrón Lookup UI state
  const [isSearchingPadron, setIsSearchingPadron] = useState<boolean>(false);
  const [padronBadge, setPadronBadge] = useState<string | null>(null);
  const [padronAddressHint, setPadronAddressHint] = useState<string | null>(null);
  const [showClientSuggestions, setShowClientSuggestions] = useState<boolean>(false);
  const [isClientDirectoryOpen, setIsClientDirectoryOpen] = useState<boolean>(false);

  // 2. Compact Equipment Search & Multi-Line Rental Items (Renglones por Máquina + Aditamento/Observación por línea)
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState<string>('');
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState<boolean>(false);
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [activeRowIndexForSearch, setActiveRowIndexForSearch] = useState<number | null>(null);

  const [lines, setLines] = useState<QuotationItem[]>([
    {
      id: 'LINE-1',
      equipoId: '',
      codigo: '',
      descripcion: '',
      observacionLinea: '',
      cantidad: 1,
      unidadMedida: 'DÍAS',
      precioUnitario: 0,
      bonificacionPorcentaje: 0,
      importe: 0,
      alicuotaIva: 21
    }
  ]);

  // 3. Dates, Operator & Additional Conditions
  const [horometroSalida, setHorometroSalida] = useState<number>(0);
  const [operarioIncluido, setOperarioIncluido] = useState<boolean>(false);
  const [operarioId, setOperarioId] = useState<string>('');
  const [tarifaOperarioUnitaria, setTarifaOperarioUnitaria] = useState<number>(0);

  const [fechaInicio, setFechaInicio] = useState<string>(today);
  const [horaInicio, setHoraInicio] = useState<string>('08:00');
  const [fechaFinEstimada, setFechaFinEstimada] = useState<string>(nextWeek);
  const [horaFinEstimada, setHoraFinEstimada] = useState<string>('18:00');

  const [costoTrasladoFlete, setCostoTrasladoFlete] = useState<number>(0);
  const [depositoGarantia, setDepositoGarantia] = useState<number>(0);
  const [descuento, setDescuento] = useState<number>(0);

  const [condicionEntrega, setCondicionEntrega] = useState<string>(
    'Equipo entregado en óptimas condiciones operativas, control de fluidos completo.'
  );
  const [observaciones, setObservaciones] = useState<string>('');

  // 4. Fotos de Salida, Contrato Firmado y Documentos Adjuntos (Compresión automática WebP + Cloudflare R2)
  const [adjuntos, setAdjuntos] = useState<RentalAttachment[]>([]);
  const [defaultAttachmentCategory, setDefaultAttachmentCategory] =
    useState<RentalAttachmentCategory>('FOTO_SALIDA');
  const [isUploadingAttachments, setIsUploadingAttachments] = useState<boolean>(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<RentalAttachment | null>(null);

  // Fetch live quotations, next rental number, and client directory from Supabase when modal opens
  const fetchLiveDatabaseContext = async () => {
    try {
      const [rentRes, clientRes] = await Promise.all([
        fetch('/api/rentals/next-number'),
        fetch('/api/clients/search')
      ]);
      if (rentRes.ok) {
        const rentData = await rentRes.json();
        if (!contractToEdit && rentData.numeroContrato) {
          setNumeroContrato(rentData.numeroContrato);
        }
        if (Array.isArray(rentData.quotations) && rentData.quotations.length > 0) {
          setDbQuotations(rentData.quotations);
        }
      }
      if (clientRes.ok) {
        const clientData = await clientRes.json();
        if (Array.isArray(clientData.clients)) {
          setDbClients(clientData.clients);
        }
      }
    } catch (e) {
      console.warn('Error cargando contexto de alquileres desde BD:', e);
    }
  };

  useEffect(() => {
    if (quotations && quotations.length > 0) {
      setDbQuotations(prev => (JSON.stringify(prev) !== JSON.stringify(quotations) ? quotations : prev));
    }
  }, [quotations]);

  // Helper: Match a vehicle in fleet by code or description
  const findVehicleByCodeOrDesc = (codeRaw?: string, descRaw?: string): Vehicle | undefined => {
    const cleanCode = String(codeRaw || '')
      .replace(/^INT-/i, '')
      .replace(/^EQ-/i, '')
      .trim()
      .toUpperCase();
    const cleanDesc = String(descRaw || '').trim().toUpperCase();

    return fleet.find(v => {
      if (v.archivado) return false;
      const codes = getCleanEquipmentCodes(v);
      if (
        cleanCode &&
        (codes.shortCode.toUpperCase() === cleanCode ||
          codes.codigoInterno.toUpperCase() === cleanCode ||
          codes.numeroEquipo.toUpperCase() === cleanCode)
      ) {
        return true;
      }
      const modelUpper = String(v.modeloMarca || '').toUpperCase();
      if (cleanDesc && modelUpper.length > 4 && cleanDesc.includes(modelUpper)) {
        return true;
      }
      return false;
    });
  };

  // Helper: Apply a Quotation to fill all Rental Contract fields and lines automatically
  const applyQuotationToForm = (q: Quotation) => {
    const pto = String(q.puntoVenta || 1).padStart(4, '0');
    const nro = String(q.numeroComprobante || 1).padStart(8, '0');
    const formattedNum = `${pto}-${nro}`;

    setCotizacionId(q.id);
    setCotizacionNumero(formattedNum);

    const cleanCuit = String(q.cuitReceptor || '').replace(/\D/g, '');
    setClienteDocumento(cleanCuit || q.cuitReceptor || '');
    setClienteNombre(q.razonSocialReceptor || '');
    const prefix = cleanCuit.slice(0, 2);
    const inferredIva: ArcaCondicionIva =
      prefix === '30' || prefix === '33' || prefix === '34'
        ? 'RESPONSABLE_INSCRIPTO'
        : 'CONSUMIDOR_FINAL';
    setClienteCondicionIva(inferredIva);
    setCondicionVenta(q.condicionVenta || 'CONTADO / TRANSFERENCIA');
    setMoneda(/USD|D[OÓ]LAR/i.test(q.monedaExpresada || '') ? 'USD' : 'ARS');
    setClienteTelefono(q.telefonoReceptor || '');
    setDireccionObra(q.domicilioReceptor || '');
    setLocalidadObra(q.localidadReceptor || 'SAN SALVADOR DE JUJUY');
    setZonaObra(q.zonaReceptor || '');
    setObservaciones(q.observaciones || '');
    setDescuento(Number(q.bonificacionTotal || 0));
    setPadronBadge(`Cotización #${formattedNum}`);

    if (Array.isArray(q.items) && q.items.length > 0) {
      const mappedLines: QuotationItem[] = q.items.map((it, idx) => {
        const matchedV = findVehicleByCodeOrDesc(it.codigo, it.descripcion);
        const codes = matchedV ? getCleanEquipmentCodes(matchedV) : null;
        const cant = Number(it.cantidad || 1);
        const unitPrice = Number(it.precioUnitario || 0);
        return {
          id: it.id || `LINE-${Date.now()}-${idx}`,
          equipoId: matchedV?.id || it.equipoId || '',
          codigo: it.codigo || codes?.shortCode || String(idx + 1).padStart(2, '0'),
          descripcion: it.descripcion || (matchedV ? `ALQUILER ${matchedV.modeloMarca.toUpperCase()}` : ''),
          observacionLinea: it.observacionLinea || '',
          cantidad: cant,
          unidadMedida: it.unidadMedida || 'DÍAS',
          precioUnitario: unitPrice,
          bonificacionPorcentaje: Number(it.bonificacionPorcentaje || 0),
          importe: Number(it.importe || cant * unitPrice),
          alicuotaIva: Number(it.alicuotaIva ?? 21)
        };
      });
      setLines(mappedLines);

      const firstVeh = findVehicleByCodeOrDesc(q.items[0]?.codigo, q.items[0]?.descripcion);
      if (firstVeh) {
        setHorometroSalida(firstVeh.horometro || firstVeh.odometro || 0);
      }
    }
  };

  // Initialize form state when modal opens
  useEffect(() => {
    if (!isOpen) return;
    fetchLiveDatabaseContext();

    if (contractToEdit) {
      setNumeroContrato(contractToEdit.numeroContrato);
      setTitulo(contractToEdit.titulo || '');
      setEstado(contractToEdit.estado);
      setCotizacionId(contractToEdit.cotizacionId || '');
      setCotizacionNumero(contractToEdit.cotizacionNumero || '');

      setClienteNombre(contractToEdit.clienteNombre || '');
      setClienteDocumento(contractToEdit.clienteDocumento || '');
      setClienteCondicionIva(
        (contractToEdit.clienteCondicionIva as ArcaCondicionIva) || 'RESPONSABLE_INSCRIPTO'
      );
      setCondicionVenta(contractToEdit.condicionVenta || 'CONTADO / TRANSFERENCIA');
      setMoneda(contractToEdit.moneda === 'USD' ? 'USD' : 'ARS');
      setCotizacionDolar(Number(contractToEdit.cotizacionDolar || 0));
      setClienteTelefono(contractToEdit.clienteTelefono || '');
      setClienteEmail(contractToEdit.clienteEmail || '');
      setDireccionObra(contractToEdit.direccionObra || '');
      setLocalidadObra(contractToEdit.localidadObra || 'SAN SALVADOR DE JUJUY');
      setZonaObra(contractToEdit.zonaObra || '');

      if (Array.isArray(contractToEdit.items) && contractToEdit.items.length > 0) {
        setLines(
          contractToEdit.items.map((it, idx) => ({
            ...it,
            id: it.id || `LINE-${idx}`,
            observacionLinea: it.observacionLinea || ''
          }))
        );
      } else {
        setLines([
          {
            id: 'LINE-1',
            equipoId: contractToEdit.equipoId || '',
            codigo:
              contractToEdit.equipoCodigoInterno?.replace(/^INT-/i, '') ||
              contractToEdit.equipoCodigo ||
              '01',
            descripcion: `ALQUILER ${(contractToEdit.equipoModelo || 'EQUIPO').toUpperCase()}`,
            observacionLinea: '',
            cantidad: contractToEdit.duracion || 1,
            unidadMedida: contractToEdit.modalidad === 'HORAS' ? 'HS' : 'DÍAS',
            precioUnitario: contractToEdit.tarifaEquipoUnitaria || 0,
            bonificacionPorcentaje: 0,
            importe: contractToEdit.subtotalEquipo || 0,
            alicuotaIva: contractToEdit.alicuotaIva ?? 21
          }
        ]);
      }

      setHorometroSalida(contractToEdit.horometroSalida || 0);
      setOperarioIncluido(contractToEdit.operarioIncluido);
      setOperarioId(contractToEdit.operarioId || '');
      setTarifaOperarioUnitaria(contractToEdit.tarifaOperarioUnitaria || 0);

      setFechaInicio(contractToEdit.fechaInicio);
      setHoraInicio(contractToEdit.horaInicio || '08:00');
      setFechaFinEstimada(contractToEdit.fechaFinEstimada);
      setHoraFinEstimada(contractToEdit.horaFinEstimada || '18:00');

      setCostoTrasladoFlete(contractToEdit.costoTrasladoFlete || 0);
      setDepositoGarantia(contractToEdit.depositoGarantia || 0);
      setDescuento(contractToEdit.descuento || 0);

      setCondicionEntrega(contractToEdit.condicionEntrega || '');
      setObservaciones(contractToEdit.observaciones || '');
      setAdjuntos(Array.isArray(contractToEdit.adjuntos) ? contractToEdit.adjuntos : []);

      const resolved = resolveRentalContractLinks(contractToEdit, partesDiarios, invoices);
      setFacturaId(resolved.primaryInvoice?.id || contractToEdit.facturaId || '');
      setFacturaNumero(resolved.facturaNumero || contractToEdit.facturaNumero || '');
      setPartesDiariosIds(resolved.linkedPartes.map(p => p.id));
      setEstadoFacturacion(resolved.estadoFacturacion as any);
      setEstadoCobro(resolved.estadoCobro as any);

      setUploadStatusMsg(null);
      setUploadErrorMsg(null);
      setPadronBadge(null);
    } else if (preselectedQuotation) {
      setNumeroContrato(`ALQ-${String(existingCount + 1).padStart(4, '0')}`);
      setTitulo('');
      setEstado('ACTIVO');
      setFechaInicio(today);
      setHoraInicio('08:00');
      setFechaFinEstimada(nextWeek);
      setHoraFinEstimada('18:00');
      setAdjuntos([]);
      setFacturaId('');
      setFacturaNumero('');
      setPartesDiariosIds([]);
      setEstadoFacturacion('SIN_FACTURAR');
      setEstadoCobro('PENDIENTE_PAGO');
      setUploadStatusMsg(null);
      setUploadErrorMsg(null);
      applyQuotationToForm(preselectedQuotation);
    } else {
      setNumeroContrato(`ALQ-${String(existingCount + 1).padStart(4, '0')}`);
      setTitulo(defaultPeriodRange?.titulo || '');
      setEstado('ACTIVO');
      setCotizacionId('');
      setCotizacionNumero('');
      setFacturaId('');
      setFacturaNumero('');
      setPartesDiariosIds([]);
      setEstadoFacturacion('SIN_FACTURAR');
      setEstadoCobro('PENDIENTE_PAGO');

      setClienteNombre(
        defaultObra?.pertenece && defaultObra.pertenece.toLowerCase() !== 'empresa principal'
          ? defaultObra.pertenece
          : ''
      );
      setClienteDocumento('');
      setClienteCondicionIva('RESPONSABLE_INSCRIPTO');
      setCondicionVenta('CONTADO / TRANSFERENCIA');
      setMoneda('ARS');
      setCotizacionDolar(0);
      setClienteTelefono('');
      setClienteEmail('');
      setDireccionObra(defaultObra?.ubicacion || '');
      setLocalidadObra('SAN SALVADOR DE JUJUY');
      setZonaObra('');
      setPadronBadge(defaultObra ? `Obra #${defaultObra.numero || ''} · ${defaultObra.nombreObra}` : null);

      const firstAvailable = fleet.find(v => !v.archivado && v.estado === 'DISPONIBLE') || fleet[0];
      if (firstAvailable) {
        const codes = getCleanEquipmentCodes(firstAvailable);
        const rate = firstAvailable.precioSugerido || 0;
        setLines([
          {
            id: `LINE-${Date.now()}`,
            equipoId: firstAvailable.id,
            codigo: codes.shortCode,
            descripcion: `ALQUILER ${firstAvailable.modeloMarca.toUpperCase()}`,
            observacionLinea: '',
            cantidad: 1,
            unidadMedida: 'DÍAS',
            precioUnitario: rate,
            bonificacionPorcentaje: 0,
            importe: rate,
            alicuotaIva: 21
          }
        ]);
        setHorometroSalida(firstAvailable.horometro || firstAvailable.odometro || 0);
      } else {
        setLines([
          {
            id: `LINE-${Date.now()}`,
            equipoId: '',
            codigo: '01',
            descripcion: '',
            observacionLinea: '',
            cantidad: 1,
            unidadMedida: 'DÍAS',
            precioUnitario: 0,
            bonificacionPorcentaje: 0,
            importe: 0,
            alicuotaIva: 21
          }
        ]);
      }

      setOperarioIncluido(false);
      setOperarioId(employees[0]?.id || '');
      setTarifaOperarioUnitaria(0);
      setFechaInicio(defaultPeriodRange?.fechaDesde || today);
      setHoraInicio('08:00');
      setFechaFinEstimada(defaultPeriodRange?.fechaHasta || nextWeek);
      setHoraFinEstimada('18:00');
      setCostoTrasladoFlete(0);
      setDepositoGarantia(0);
      setDescuento(0);
      setCondicionEntrega('Equipo entregado en óptimas condiciones operativas, control de fluidos completo.');
      setObservaciones(
        defaultObra
          ? `Obra: ${defaultObra.nombreObra}${defaultObra.numero ? ` (#${defaultObra.numero})` : ''}${
              defaultPeriodRange?.titulo ? ` · Período: ${defaultPeriodRange.titulo}` : ''
            }`
          : ''
      );
      setAdjuntos([]);
      setUploadStatusMsg(null);
      setUploadErrorMsg(null);
    }
  }, [isOpen, contractToEdit, preselectedQuotation, defaultObra, defaultPeriodRange]);

  // Upload & Auto-Compress Photos (WebP 1280px) or PDFs/Docs to Cloudflare R2
  const handleUploadRentalFiles = async (
    fileList: FileList | File[],
    forcedCategory?: RentalAttachmentCategory
  ) => {
    const filesArray = Array.from(fileList || []);
    if (filesArray.length === 0) return;

    setIsUploadingAttachments(true);
    setUploadErrorMsg(null);
    setUploadStatusMsg(
      `Procesando y comprimiendo ${filesArray.length} ${filesArray.length === 1 ? 'archivo' : 'archivos'}...`
    );

    const categoryToUse = forcedCategory || defaultAttachmentCategory;
    const newlyUploaded: RentalAttachment[] = [];
    let totalSavedKB = 0;

    try {
      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        const mime = (file.type || '').toLowerCase();
        const isImg = mime.startsWith('image/');
        const isPdf = mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const tipoArchivo: 'IMAGE' | 'PDF' | 'DOC' = isImg ? 'IMAGE' : isPdf ? 'PDF' : 'DOC';

        setUploadStatusMsg(
          isImg
            ? `Reduciendo foto (${i + 1}/${filesArray.length}): ${file.name}...`
            : `Subiendo documento (${i + 1}/${filesArray.length}): ${file.name}...`
        );

        const res = await uploadFileToCloudflareR2(
          file,
          file.name || `adjunto_${Date.now()}`,
          file.type || (isImg ? 'image/jpeg' : isPdf ? 'application/pdf' : 'application/octet-stream'),
          'alquileres',
          {
            maxWidth: 1280,
            maxHeight: 1280,
            quality: 0.78,
            format: 'image/webp'
          }
        );

        if (!res.success || !res.url) {
          throw new Error(res.error || `No se pudo subir "${file.name}" a Cloudflare R2.`);
        }

        if (res.originalSizeKB && res.optimizedSizeKB && res.originalSizeKB > res.optimizedSizeKB) {
          totalSavedKB += res.originalSizeKB - res.optimizedSizeKB;
        }

        newlyUploaded.push({
          id: `ATT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url: res.url,
          nombre: file.name || `Adjunto ${adjuntos.length + i + 1}`,
          categoria: categoryToUse,
          tipoArchivo,
          nota: '',
          originalSizeKB: res.originalSizeKB,
          optimizedSizeKB: res.optimizedSizeKB,
          reductionPercentage: res.reductionPercentage,
          fechaSubida: new Date().toISOString()
        });
      }

      setAdjuntos(prev => [...prev, ...newlyUploaded]);
      if (totalSavedKB > 0) {
        setUploadStatusMsg(
          `✓ ${newlyUploaded.length} adjunto(s) subidos a Cloudflare R2 • Ahorro de peso: ${(
            totalSavedKB / 1024
          ).toFixed(2)} MB`
        );
      } else {
        setUploadStatusMsg(`✓ ${newlyUploaded.length} documento(s) subidos a Cloudflare R2`);
      }
    } catch (err: any) {
      setUploadErrorMsg(err?.message || 'Error al comprimir o subir archivo.');
      setUploadStatusMsg(null);
    } finally {
      setIsUploadingAttachments(false);
    }
  };

  const handlePasteAttachment = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleUploadRentalFiles(files);
    }
  };

  const handleUpdateAttachment = (
    id: string,
    patch: Partial<Pick<RentalAttachment, 'categoria' | 'nota' | 'nombre'>>
  ) => {
    setAdjuntos(prev => prev.map(att => (att.id === id ? { ...att, ...patch } : att)));
  };

  const handleRemoveAttachment = (id: string) => {
    setAdjuntos(prev => prev.filter(att => att.id !== id));
  };

  // Lookup CUIT/DNI in local DB cache + Padrón Oficial BCRA/ARCA + Supabase DB
  const handleLookupCuitOrPadron = async (inputVal?: string, forceRefresh = false) => {
    const raw = String(inputVal ?? clienteDocumento).replace(/\D/g, '');
    if (raw.length < 7 || raw.length > 11) return;

    if (!forceRefresh) {
      const localMatch = dbClients.find(c => {
        const cDigits = String(c.cuit || '').replace(/\D/g, '');
        if (!cDigits) return false;
        if (cDigits === raw) return true;
        return raw.length <= 8 && cDigits.length === 11 && cDigits.slice(2, 10) === raw.padStart(8, '0');
      });
      if (localMatch && localMatch.razonSocial && localMatch.domicilio) {
        handleSelectDbClient(localMatch);
        return;
      }
    }

    setIsSearchingPadron(true);
    setPadronBadge(null);
    setPadronAddressHint(null);
    try {
      const res = await fetch(`/api/arca/padron/${raw}${forceRefresh ? '?refresh=1' : ''}`);
      const data = await res.json();
      if (data && data.found && data.razonSocial) {
        setClienteNombre(data.razonSocial);
        if (data.cuit) setClienteDocumento(String(data.cuit));
        if (data.condicionIva) setClienteCondicionIva(data.condicionIva as ArcaCondicionIva);
        if (data.domicilio) setDireccionObra(data.domicilio);
        if (data.localidad) setLocalidadObra(data.localidad);
        if (data.zona) setZonaObra(data.zona);
        if (data.telefono) setClienteTelefono(data.telefono);
        const badgeLabel =
          data.fuente === 'BASE_DE_DATOS'
            ? 'Cliente en BD'
            : String(data.fuente || '').includes('ARCA_A')
              ? 'Padrón Oficial ARCA'
              : 'Padrón ARCA / BCRA';
        setPadronBadge(badgeLabel);
        if (!data.domicilio && data.addressUnavailableReason) {
          setPadronAddressHint(data.addressUnavailableReason);
        }
      }
    } catch (err) {
      console.warn('Error consultando padrón:', err);
    } finally {
      setIsSearchingPadron(false);
    }
  };

  const handleSelectDbClient = (client: DbClientRecord) => {
    setClienteNombre(client.razonSocial);
    if (client.cuit) setClienteDocumento(client.cuit);
    if (client.condicionIva) setClienteCondicionIva(client.condicionIva as ArcaCondicionIva);
    if (client.condicionVenta) setCondicionVenta(client.condicionVenta);
    if (client.domicilio) {
      setDireccionObra(client.domicilio);
      setPadronAddressHint(null);
    }
    if (client.localidad) setLocalidadObra(client.localidad);
    if (client.zona) setZonaObra(client.zona);
    if (client.telefono) setClienteTelefono(client.telefono);
    if (client.email) setClienteEmail(client.email);
    setPadronBadge(`BD (${client.fuente})`);
    setShowClientSuggestions(false);
  };

  const matchingClients = useMemo(() => {
    const nameQ = clienteNombre.trim().toUpperCase();
    const docQ = clienteDocumento.replace(/\D/g, '');
    if (!nameQ && !docQ) return dbClients.slice(0, 6);
    return dbClients
      .filter(c => {
        const matchName = nameQ.length >= 1 && c.razonSocial.includes(nameQ);
        const matchDoc = docQ.length >= 2 && c.cuit.includes(docQ);
        return matchName || matchDoc;
      })
      .slice(0, 6);
  }, [dbClients, clienteNombre, clienteDocumento]);

  const filteredQuotations = useMemo(() => {
    const q = quotationSearchTerm.trim().toUpperCase();
    if (!q) return dbQuotations;
    return dbQuotations.filter(item => {
      const num = `${String(item.puntoVenta).padStart(4, '0')}-${String(item.numeroComprobante).padStart(8, '0')}`;
      return (
        num.includes(q) ||
        String(item.razonSocialReceptor || '').toUpperCase().includes(q) ||
        String(item.cuitReceptor || '').includes(q) ||
        item.items?.some(
          it =>
            String(it.descripcion || '').toUpperCase().includes(q) ||
            String(it.codigo || '').toUpperCase().includes(q)
        )
      );
    });
  }, [dbQuotations, quotationSearchTerm]);

  // Filtered Fleet for Compact Line Picker
  const filteredFleet = useMemo(() => {
    const q = equipmentSearchQuery.trim().toLowerCase();
    return fleet
      .filter(v => !v.archivado)
      .filter(v => {
        if (onlyAvailable && v.estado !== 'DISPONIBLE') return false;
        if (!q) return true;
        const codes = getCleanEquipmentCodes(v);
        return codes.cleanSearchString.includes(q);
      })
      .slice(0, 25);
  }, [fleet, onlyAvailable, equipmentSearchQuery]);

  // Line Item Handlers (Multi-line like QuotationSection)
  const handleAddBlankLine = () => {
    setLines(prev => [
      ...prev,
      {
        id: `LINE-${Date.now()}-${prev.length + 1}`,
        equipoId: '',
        codigo: String(prev.length + 1).padStart(2, '0'),
        descripcion: '',
        observacionLinea: '',
        cantidad: 1,
        unidadMedida: 'DÍAS',
        precioUnitario: 0,
        bonificacionPorcentaje: 0,
        importe: 0,
        alicuotaIva: 21
      }
    ]);
  };

  const handleAssignVehicleToLine = (v: Vehicle, targetIndex?: number | null) => {
    const codes = getCleanEquipmentCodes(v);
    const rate = v.precioSugerido || v.precioCosto || 0;

    setLines(prev => {
      // If a target row is specified, or if the first line is empty, update that row; otherwise append a new row
      const idxToUpdate =
        targetIndex !== undefined && targetIndex !== null && targetIndex >= 0 && targetIndex < prev.length
          ? targetIndex
          : prev.length === 1 && !prev[0].descripcion.trim()
            ? 0
            : -1;

      if (idxToUpdate >= 0) {
        const updated = [...prev];
        const current = updated[idxToUpdate];
        const cant = Number(current.cantidad || 1);
        const unit = current.unidadMedida || 'DÍAS';
        const chosenRate =
          unit === 'HS' && v.precioSugeridoHora ? v.precioSugeridoHora : rate;
        updated[idxToUpdate] = {
          ...current,
          equipoId: v.id,
          codigo: codes.shortCode,
          descripcion: `ALQUILER ${v.modeloMarca.toUpperCase()}`,
          precioUnitario: chosenRate,
          importe: cant * chosenRate
        };
        return updated;
      }

      return [
        ...prev,
        {
          id: `LINE-${Date.now()}-${prev.length + 1}`,
          equipoId: v.id,
          codigo: codes.shortCode,
          descripcion: `ALQUILER ${v.modeloMarca.toUpperCase()}`,
          observacionLinea: '',
          cantidad: 1,
          unidadMedida: 'DÍAS',
          precioUnitario: rate,
          bonificacionPorcentaje: 0,
          importe: rate,
          alicuotaIva: 21
        }
      ];
    });

    if (v.horometro || v.odometro) {
      setHorometroSalida(v.horometro || v.odometro || 0);
    }
    setShowEquipmentDropdown(false);
    setActiveRowIndexForSearch(null);
    setEquipmentSearchQuery('');
  };

  const handleUpdateLine = (index: number, field: keyof QuotationItem, value: any) => {
    setLines(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      // If user typed a machine code (e.g. "43" or "47") in the "codigo" column, auto-match vehicle
      if (field === 'codigo') {
        const matched = findVehicleByCodeOrDesc(String(value), '');
        if (matched) {
          const rate =
            item.unidadMedida === 'HS' && matched.precioSugeridoHora
              ? matched.precioSugeridoHora
              : matched.precioSugerido || matched.precioCosto || item.precioUnitario || 0;
          item.equipoId = matched.id;
          item.descripcion = `ALQUILER ${matched.modeloMarca.toUpperCase()}`;
          if (!item.precioUnitario || item.precioUnitario === 0) {
            item.precioUnitario = rate;
          }
        }
      }

      const cant = Number(item.cantidad || 0);
      const precio = Number(item.precioUnitario || 0);
      const bonif = Number(item.bonificacionPorcentaje || 0);
      item.importe = Math.round(cant * precio * (1 - bonif / 100) * 100) / 100;

      updated[index] = item;
      return updated;
    });
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const selectedEmployee = useMemo(
    () => employees.find(e => e.id === operarioId),
    [employees, operarioId]
  );

  // Financial & Fiscal Totals across all lines
  const primaryDuration = useMemo(() => Number(lines[0]?.cantidad || 1), [lines]);
  const primaryModalidad: 'DIAS' | 'HORAS' = useMemo(
    () => (lines[0]?.unidadMedida === 'HS' ? 'HORAS' : 'DIAS'),
    [lines]
  );

  const subtotalEquipos = useMemo(
    () => lines.reduce((acc, it) => acc + (Number(it.importe) || 0), 0),
    [lines]
  );

  const subtotalOperario = useMemo(
    () => (operarioIncluido ? Number(tarifaOperarioUnitaria || 0) * primaryDuration : 0),
    [operarioIncluido, tarifaOperarioUnitaria, primaryDuration]
  );

  const subtotalNeto = useMemo(
    () => Math.max(0, subtotalEquipos + subtotalOperario + Number(costoTrasladoFlete || 0) - Number(descuento || 0)),
    [subtotalEquipos, subtotalOperario, costoTrasladoFlete, descuento]
  );

  const ivaTotal = useMemo(() => {
    const linesIva = lines.reduce((sum, it) => {
      const alic = Number(it.alicuotaIva ?? 21);
      return sum + (Number(it.importe || 0) * alic) / 100;
    }, 0);
    const extraBase = Math.max(0, subtotalOperario + Number(costoTrasladoFlete || 0) - Number(descuento || 0));
    const extraIva = extraBase * 0.21;
    return Math.round(Math.max(0, linesIva + extraIva) * 100) / 100;
  }, [lines, subtotalOperario, costoTrasladoFlete, descuento]);

  const totalAlquiler = useMemo(() => subtotalNeto + ivaTotal, [subtotalNeto, ivaTotal]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNombre.trim() || lines.length === 0) return;

    const firstLine = lines[0];
    const matchedFirstVehicle =
      fleet.find(v => v.id === firstLine.equipoId) ||
      findVehicleByCodeOrDesc(firstLine.codigo, firstLine.descripcion);
    const firstCodes = matchedFirstVehicle ? getCleanEquipmentCodes(matchedFirstVehicle) : null;

    // Build summary display name if multiple machines are rented
    const equipoSummaryModel =
      lines.length === 1
        ? firstLine.descripcion.replace(/^ALQUILER\s+/i, '').trim() ||
          matchedFirstVehicle?.modeloMarca ||
          'Equipo Alquilado'
        : `${firstLine.descripcion.replace(/^ALQUILER\s+/i, '').trim()} (+${lines.length - 1} ítem/s)`;

    const finalLines: QuotationItem[] = lines.map((it, idx) => ({
      ...it,
      id: it.id || `ITEM-${Date.now()}-${idx}`,
      codigo: it.codigo || String(idx + 1).padStart(2, '0'),
      descripcion: it.descripcion.trim().toUpperCase() || 'ALQUILER DE EQUIPO',
      observacionLinea: (it.observacionLinea || '').trim()
    }));

    if (operarioIncluido && subtotalOperario > 0) {
      finalLines.push({
        id: `ITEM-${Date.now()}-OP`,
        codigo: 'OP-01',
        descripcion: `SERVICIO DE OPERADOR / MAQUINISTA (${selectedEmployee?.nombreApellido || 'ASIGNADO'})`,
        observacionLinea: '',
        cantidad: primaryDuration,
        unidadMedida: primaryModalidad === 'HORAS' ? 'HS' : 'DÍAS',
        precioUnitario: Number(tarifaOperarioUnitaria) || 0,
        bonificacionPorcentaje: 0,
        importe: subtotalOperario,
        alicuotaIva: 21
      });
    }

    if (costoTrasladoFlete > 0) {
      finalLines.push({
        id: `ITEM-${Date.now()}-FL`,
        codigo: 'FLETE',
        descripcion: 'SERVICIO DE CARRETÓN / FLETE Y TRASLADO A OBRA',
        observacionLinea: '',
        cantidad: 1,
        unidadMedida: 'SERVICIO',
        precioUnitario: Number(costoTrasladoFlete) || 0,
        bonificacionPorcentaje: 0,
        importe: Number(costoTrasladoFlete) || 0,
        alicuotaIva: 21
      });
    }

    const newContract: RentalContract = {
      id: contractToEdit ? contractToEdit.id : `ALQ-${Date.now()}`,
      numeroContrato: numeroContrato.trim() || `ALQ-${String(existingCount + 1).padStart(4, '0')}`,
      titulo: titulo.trim() || undefined,
      obraDestino: contractToEdit?.obraDestino || defaultObra?.nombreObra || undefined,
      fechaInicio,
      horaInicio,
      fechaFinEstimada,
      horaFinEstimada,
      modalidad: primaryModalidad,
      duracion: primaryDuration,

      cotizacionId: cotizacionId || undefined,
      cotizacionNumero: cotizacionNumero || undefined,
      facturaId: facturaId || undefined,
      facturaNumero: facturaNumero || undefined,
      partesDiariosIds,
      estadoFacturacion: facturaId || facturaNumero ? 'FACTURADO' : estadoFacturacion,
      estadoCobro,
      montoCobrado: estadoCobro === 'PAGADO' ? totalAlquiler : contractToEdit?.montoCobrado,
      fechaCobro:
        estadoCobro === 'PAGADO'
          ? contractToEdit?.fechaCobro || new Date().toISOString().slice(0, 10)
          : contractToEdit?.fechaCobro,

      equipoId: matchedFirstVehicle?.id || firstLine.equipoId || firstLine.codigo || 'EQ-ALQ',
      equipoCodigo: firstCodes?.numeroEquipo || firstLine.codigo || 'EQ-01',
      equipoCodigoInterno: firstCodes?.codigoInterno || `INT-${firstLine.codigo || '01'}`,
      equipoModelo: equipoSummaryModel,
      equipoPatenteOrCodigo: firstLine.observacionLinea
        ? `Cód: ${firstLine.codigo} • Adit: ${firstLine.observacionLinea}`
        : `Cód: ${firstLine.codigo}`,
      equipoCategoria: matchedFirstVehicle?.categoriaEquipo || 'VIAL_PESADA',

      operarioIncluido,
      operarioId: operarioIncluido ? operarioId : undefined,
      operarioNombre: operarioIncluido ? selectedEmployee?.nombreApellido : 'Sin Operador',

      clienteNombre: clienteNombre.trim().toUpperCase(),
      clienteDocumento: clienteDocumento.trim(),
      clienteCondicionIva,
      condicionVenta: condicionVenta.trim().toUpperCase(),
      clienteTelefono: clienteTelefono.trim(),
      clienteEmail: clienteEmail.trim(),
      direccionObra: direccionObra.trim().toUpperCase(),
      localidadObra: localidadObra.trim().toUpperCase(),
      zonaObra: zonaObra.trim().toUpperCase(),

      items: finalLines,
      tarifaEquipoUnitaria: Number(firstLine.precioUnitario || 0),
      subtotalEquipo: subtotalEquipos,
      tarifaOperarioUnitaria: operarioIncluido ? Number(tarifaOperarioUnitaria) || 0 : 0,
      subtotalOperario,
      costoTrasladoFlete: Number(costoTrasladoFlete) || 0,
      depositoGarantia: Number(depositoGarantia) || 0,
      descuento: Number(descuento) || 0,
      subtotalNeto,
      alicuotaIva: Number(firstLine.alicuotaIva ?? 21),
      ivaTotal,
      totalAlquiler,
      moneda,
      cotizacionDolar: moneda === 'USD' && cotizacionDolar > 0 ? Number(cotizacionDolar) : undefined,

      estado,
      horometroSalida: Number(horometroSalida) || 0,
      condicionEntrega: condicionEntrega.trim(),
      observaciones: observaciones.trim(),
      adjuntos,
      fechaCreacion: contractToEdit?.fechaCreacion || new Date().toISOString()
    };

    onSave(newContract, cotizacionId || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#16191F] border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden text-zinc-100">
        {/* Compact Header */}
        <div className="bg-zinc-950 px-5 py-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F0C800] flex items-center justify-center text-zinc-950 shadow">
              <FileText className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black text-white">
                  {contractToEdit ? 'Editar Contrato de Alquiler' : 'Nuevo Contrato de Alquiler'}
                </h3>
                <span className="px-2 py-0.5 rounded bg-[#F0C800]/15 border border-[#F0C800]/40 text-[#F0C800] font-mono text-xs font-black">
                  {numeroContrato}
                </span>
                {titulo.trim() && (
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/35 text-cyan-200 text-xs font-bold max-w-[260px] truncate">
                    {titulo.trim()}
                  </span>
                )}
                {cotizacionNumero && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-mono text-xs font-bold flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    Cotización #{cotizacionNumero}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">
                Formato compacto por líneas con aditamentos/observaciones por equipo — Conectado a Cotizador y Facturación ARCA
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compact Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 text-xs">
          {/* 0. BARRA COMPACTA: LLAMAR COTIZACIÓN EMITIDA (BD) */}
          <div className="bg-zinc-950/90 border border-[#F0C800]/40 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center gap-2.5">
            <div className="flex items-center gap-2 shrink-0">
              <Link2 className="w-4 h-4 text-[#F0C800]" />
              <span className="font-black uppercase tracking-wider text-[#F0C800] text-[11px]">
                Llamar Cotización (BD):
              </span>
            </div>

            <div className="relative w-full lg:w-56 shrink-0">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={quotationSearchTerm}
                onChange={e => setQuotationSearchTerm(e.target.value)}
                placeholder="Filtrar por cliente o N°..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#F0C800]"
              />
            </div>

            <select
              value={cotizacionId}
              onChange={e => {
                const qId = e.target.value;
                if (!qId) {
                  setCotizacionId('');
                  setCotizacionNumero('');
                  return;
                }
                const found = dbQuotations.find(q => q.id === qId);
                if (found) applyQuotationToForm(found);
              }}
              className="flex-1 bg-zinc-900 border border-[#F0C800]/50 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-[#F0C800] cursor-pointer"
            >
              <option value="">
                -- Seleccionar Cotización Emitida ({filteredQuotations.length} disponibles en BD) --
              </option>
              {filteredQuotations.map(q => {
                const num = `${String(q.puntoVenta).padStart(4, '0')}-${String(q.numeroComprobante).padStart(8, '0')}`;
                const firstItem = q.items?.[0];
                return (
                  <option key={q.id} value={q.id}>
                    COT #{num} — {q.razonSocialReceptor} ({q.cuitReceptor || 'S/C'}) —{' '}
                    {firstItem ? `[Cód: ${firstItem.codigo}] ${firstItem.descripcion}` : 'Varios'} —{' '}
                    {formatCurrency(q.importeTotal)}
                  </option>
                );
              })}
            </select>

            {cotizacionId && (
              <button
                type="button"
                onClick={() => {
                  setCotizacionId('');
                  setCotizacionNumero('');
                  setPadronBadge(null);
                }}
                className="text-[11px] font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer shrink-0"
              >
                Desvincular
              </button>
            )}
          </div>

          {/* TÍTULO / REFERENCIA OPCIONAL DEL CONTRATO */}
          <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2.5">
            <label
              htmlFor="rental-contract-titulo"
              className="flex items-center gap-1.5 shrink-0 font-black uppercase tracking-wider text-[11px] text-zinc-300"
            >
              <FileText className="w-3.5 h-3.5 text-[#F0C800]" />
              <span>Título del Contrato</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[9px] font-bold">
                OPCIONAL
              </span>
            </label>
            <input
              id="rental-contract-titulo"
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ej: 1era Quincena de Enero, 2da Quincena Octubre, Excavación Sector Norte..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-[#F0C800]"
            />
            {titulo.trim() && (
              <button
                type="button"
                onClick={() => setTitulo('')}
                className="text-[11px] text-zinc-400 hover:text-white cursor-pointer shrink-0"
                title="Borrar título"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* 1. DATOS DEL CLIENTE / RAZÓN SOCIAL & OBRA (COMPACTO) */}
          <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#F0C800]" />
                <span className="font-black uppercase tracking-wider text-white text-[11px]">
                  1. Datos del Cliente / Razón Social & Ubicación de Obra
                </span>
              </div>
              <div className="flex items-center gap-2">
                {padronBadge && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {padronBadge}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsClientDirectoryOpen(true)}
                  className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 text-[10px] font-bold cursor-pointer flex items-center gap-1"
                >
                  <Users className="w-3 h-3" />
                  Alta / Agenda Clientes
                </button>
                <button
                  type="button"
                  onClick={() => setShowClientSuggestions(prev => !prev)}
                  className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-[#F0C800] border border-zinc-700 text-[10px] font-bold cursor-pointer flex items-center gap-1"
                >
                  <Search className="w-3 h-3" />
                  {showClientSuggestions ? 'Ocultar Clientes BD' : `Clientes en BD (${dbClients.length})`}
                </button>
              </div>
            </div>

            {showClientSuggestions && matchingClients.length > 0 && (
              <div className="bg-zinc-900 border border-[#F0C800]/40 rounded-lg p-1.5 space-y-1 max-h-36 overflow-y-auto">
                {matchingClients.map((c, idx) => (
                  <button
                    key={`${c.cuit}-${c.razonSocial}-${idx}`}
                    type="button"
                    onClick={() => handleSelectDbClient(c)}
                    className="w-full text-left px-2.5 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-between gap-2 cursor-pointer text-[11px]"
                  >
                    <div className="truncate">
                      <span className="font-black text-white">{c.razonSocial}</span>
                      {c.cuit && <span className="ml-2 font-mono text-[#F0C800]">CUIT: {c.cuit}</span>}
                      {c.domicilio && <span className="ml-2 text-zinc-400">• {c.domicilio}</span>}
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 shrink-0">Cargar</span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                  CUIT / DNI (Padrón)
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={clienteDocumento}
                    onChange={e => {
                      const val = e.target.value;
                      setClienteDocumento(val);
                      const clean = val.replace(/\D/g, '');
                      if (clean.length === 11) handleLookupCuitOrPadron(clean);
                    }}
                    onBlur={e => {
                      const clean = e.target.value.replace(/\D/g, '');
                      if (clean.length >= 7 && clean.length <= 11 && !clienteNombre.trim()) {
                        handleLookupCuitOrPadron(clean);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleLookupCuitOrPadron(clienteDocumento, true);
                      }
                    }}
                    placeholder="CUIT o DNI (Enter / Padrón)"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-[#F0C800]"
                  />
                  <button
                    type="button"
                    onClick={() => handleLookupCuitOrPadron(clienteDocumento, true)}
                    disabled={isSearchingPadron}
                    className="px-2.5 py-1.5 bg-[#F0C800]/15 hover:bg-[#F0C800]/25 border border-[#F0C800]/40 text-[#F0C800] rounded-lg text-[11px] font-black cursor-pointer shrink-0"
                  >
                    {isSearchingPadron ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Padrón'}
                  </button>
                </div>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                  Razón Social / Apellido y Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={clienteNombre}
                  onChange={e => {
                    const val = e.target.value;
                    setClienteNombre(val);
                    setShowClientSuggestions(true);
                    const exact = dbClients.find(
                      c => c.razonSocial.toUpperCase() === val.trim().toUpperCase()
                    );
                    if (exact) handleSelectDbClient(exact);
                  }}
                  placeholder="NOMBRE O EMPRESA (BUSCA EN BD)"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white font-bold uppercase focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                  Condición IVA
                </label>
                <select
                  value={clienteCondicionIva}
                  onChange={e => setClienteCondicionIva(e.target.value as ArcaCondicionIva)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white font-bold focus:outline-none focus:border-[#F0C800]"
                >
                  <option value="RESPONSABLE_INSCRIPTO">Resp. Inscripto (Fact. A)</option>
                  <option value="MONOTRIBUTO">Monotributo (Fact. B)</option>
                  <option value="CONSUMIDOR_FINAL">Consumidor Final (Fact. B)</option>
                  <option value="EXENTO">IVA Exento (Fact. B)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                  Teléfono *
                </label>
                <input
                  type="text"
                  required
                  value={clienteTelefono}
                  onChange={e => setClienteTelefono(e.target.value)}
                  placeholder="3885 26-8683"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                  Domicilio / Dirección de Obra *
                </label>
                <input
                  type="text"
                  required
                  value={direccionObra}
                  onChange={e => {
                    setDireccionObra(e.target.value);
                    if (e.target.value.trim()) setPadronAddressHint(null);
                  }}
                  placeholder="CALLE, NÚMERO, BARRIO O RUTA"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white uppercase focus:outline-none focus:border-[#F0C800]"
                />
                {padronAddressHint && !direccionObra && (
                  <p className="mt-1 text-[10px] text-zinc-400 leading-tight" title={padronAddressHint}>
                    Dirección no informada por padrón público (completar para cliente nuevo; los guardados se autocompletan).
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">Zona</label>
                <input
                  type="text"
                  value={zonaObra}
                  onChange={e => setZonaObra(e.target.value)}
                  placeholder="CENTRO / OBRA"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white uppercase focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                  Localidad
                </label>
                <input
                  type="text"
                  value={localidadObra}
                  onChange={e => setLocalidadObra(e.target.value)}
                  placeholder="SAN SALVADOR DE JUJUY"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white uppercase focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                  Condición Venta
                </label>
                <input
                  type="text"
                  value={condicionVenta}
                  onChange={e => setCondicionVenta(e.target.value)}
                  placeholder="CONTADO"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white font-bold uppercase focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                  Moneda
                </label>
                <select
                  value={moneda}
                  onChange={e => setMoneda(e.target.value === 'USD' ? 'USD' : 'ARS')}
                  className={`w-full bg-zinc-900 border rounded-lg px-2.5 py-1.5 font-black focus:outline-none focus:border-[#F0C800] ${
                    moneda === 'USD'
                      ? 'border-emerald-500/50 text-emerald-400'
                      : 'border-zinc-800 text-white'
                  }`}
                >
                  <option value="ARS">PESOS ($ ARS)</option>
                  <option value="USD">DÓLAR (US$ USD)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. DETALLE DE MÁQUINAS / EQUIPOS POR LÍNEA + ADITAMENTOS / OBSERVACIÓN POR LÍNEA (FORMATO COMPACTO SIMILAR A COTIZACIÓN) */}
          <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[#F0C800]" />
                <span className="font-black uppercase tracking-wider text-white text-[11px]">
                  2. Detalle de Equipos / Máquinas por Línea y Aditamentos (Similar a Cotización)
                </span>
              </div>

              {/* Compact Machine Finder Bar + Add Line Button */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-80">
                  <Search className="w-3.5 h-3.5 text-[#F0C800] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={equipmentSearchQuery}
                    onFocus={() => setShowEquipmentDropdown(true)}
                    onChange={e => {
                      setEquipmentSearchQuery(e.target.value);
                      setShowEquipmentDropdown(true);
                    }}
                    placeholder="Buscar máquina por Cód. Int (ej: 43, 47) o nombre..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-6 py-1.5 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-[#F0C800]"
                  />
                  {equipmentSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setEquipmentSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyAvailable}
                    onChange={e => setOnlyAvailable(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-[#F0C800]"
                  />
                  <span>Disponibles</span>
                </label>

                <button
                  type="button"
                  onClick={() => setShowEquipmentDropdown(prev => !prev)}
                  className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg font-bold text-[11px] cursor-pointer"
                >
                  {showEquipmentDropdown ? 'Ocultar Lista' : 'Ver Flota'}
                </button>

                <button
                  type="button"
                  onClick={handleAddBlankLine}
                  className="px-3 py-1.5 bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] border border-[#F0C800]/40 rounded-lg font-black text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> + Agregar Línea
                </button>
              </div>
            </div>

            {/* Compact Single-Line Equipment Picker List (Only visible when searching or toggled) */}
            {showEquipmentDropdown && (
              <div className="bg-zinc-900 border border-[#F0C800]/40 rounded-xl overflow-hidden shadow-lg">
                <div className="bg-zinc-950 px-3 py-1.5 border-b border-zinc-800 flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase">
                  <span>
                    Seleccionar Máquina para cargar en{' '}
                    {activeRowIndexForSearch !== null
                      ? `Línea #${activeRowIndexForSearch + 1}`
                      : 'el contrato'}{' '}
                    ({filteredFleet.length} resultados)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEquipmentDropdown(false);
                      setActiveRowIndexForSearch(null);
                    }}
                    className="text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Cerrar ✕
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-zinc-800/70">
                  {filteredFleet.map(v => {
                    const codes = getCleanEquipmentCodes(v);
                    const isDisp = v.estado === 'DISPONIBLE';
                    return (
                      <div
                        key={v.id}
                        onClick={() => handleAssignVehicleToLine(v, activeRowIndexForSearch)}
                        className="px-3 py-1.5 hover:bg-zinc-800/80 transition flex items-center justify-between gap-2 cursor-pointer text-[11px]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-[#F0C800] text-zinc-950 font-mono text-[10px] font-black shrink-0">
                            CÓD. INT: {codes.shortCode}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px] border border-zinc-700 shrink-0">
                            N° EQ: {codes.numeroEquipo}
                          </span>
                          <span className="font-bold text-white truncate">{v.modeloMarca}</span>
                          {v.patente && v.patente !== '0000' && (
                            <span className="text-zinc-400 font-mono text-[10px] shrink-0">
                              ({v.patente})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {v.precioSugerido > 0 && (
                            <span className="font-mono font-bold text-emerald-400">
                              {formatCurrency(v.precioSugerido)}/día
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              isDisp
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-amber-500/15 text-amber-400'
                            }`}
                          >
                            {v.estado.replace(/_/g, ' ')}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#F0C800]/20 text-[#F0C800] font-black text-[10px]">
                            + Cargar
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Table Header (Matching Quotation Layout + Aditamento/Observación column) */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-400 px-2">
              <div className="col-span-1">Cód. Int</div>
              <div className="col-span-3">Máquina / Equipo / Servicio</div>
              <div className="col-span-3 text-[#F0C800]">Aditamento / Observación de Línea</div>
              <div className="col-span-1 text-center">Cant.</div>
              <div className="col-span-1">Unidad</div>
              <div className="col-span-1 text-right">Precio ({moneda === 'USD' ? 'US$' : '$'})</div>
              <div className="col-span-1 text-center">IVA %</div>
              <div className="col-span-1 text-right">Importe</div>
            </div>

            {/* Lines Rows */}
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div
                  key={line.id || idx}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-center bg-zinc-900/90 p-2 rounded-xl border border-zinc-800 hover:border-zinc-700 transition"
                >
                  {/* Código Interno / Equipo */}
                  <div className="lg:col-span-1">
                    <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">
                      Cód. Int / Equipo
                    </label>
                    <input
                      type="text"
                      value={line.codigo}
                      onChange={e => handleUpdateLine(idx, 'codigo', e.target.value)}
                      placeholder="Ej: 43"
                      title="Escriba el código interno (ej: 43, 47) para autocompletar la máquina"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-[#F0C800] font-mono font-black text-xs text-center focus:outline-none focus:border-[#F0C800]"
                    />
                  </div>

                  {/* Máquina / Descripción con botón de búsqueda en fila */}
                  <div className="lg:col-span-3">
                    <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">
                      Máquina / Equipo / Servicio
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        required
                        value={line.descripcion}
                        onChange={e => handleUpdateLine(idx, 'descripcion', e.target.value)}
                        placeholder="Nombre de máquina o servicio..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-2.5 pr-7 py-1.5 text-white font-bold uppercase text-xs focus:outline-none focus:border-[#F0C800]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setActiveRowIndexForSearch(idx);
                          setShowEquipmentDropdown(true);
                        }}
                        title="Buscar máquina de la flota para esta línea"
                        className="absolute right-1.5 text-zinc-400 hover:text-[#F0C800] cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Aditamento / Observación por Línea */}
                  <div className="lg:col-span-3">
                    <label className="block lg:hidden text-[10px] font-bold text-[#F0C800] mb-0.5">
                      Aditamento / Observación de Línea
                    </label>
                    <div className="relative flex items-center">
                      <Wrench className="w-3 h-3 text-amber-400/80 absolute left-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={line.observacionLinea || ''}
                        onChange={e => handleUpdateLine(idx, 'observacionLinea', e.target.value)}
                        placeholder="Ej: C/ disco, martillo, hoyadora, 2 puntas, c/ operario..."
                        className="w-full bg-zinc-950 border border-amber-500/30 rounded-lg pl-7 pr-2 py-1.5 text-amber-200 placeholder-zinc-500 text-xs focus:outline-none focus:border-[#F0C800]"
                      />
                    </div>
                  </div>

                  {/* Cantidad */}
                  <div className="lg:col-span-1">
                    <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">
                      Cantidad
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={line.cantidad}
                      onChange={e =>
                        handleUpdateLine(idx, 'cantidad', parseFloat(e.target.value) || 0)
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-1.5 py-1.5 text-white font-mono font-bold text-center text-xs focus:outline-none focus:border-[#F0C800]"
                    />
                  </div>

                  {/* Unidad de Medida */}
                  <div className="lg:col-span-1">
                    <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">
                      Unidad
                    </label>
                    <select
                      value={line.unidadMedida || 'DÍAS'}
                      onChange={e => handleUpdateLine(idx, 'unidadMedida', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-1.5 py-1.5 text-white font-bold text-xs focus:outline-none focus:border-[#F0C800]"
                    >
                      <option value="DÍAS">DÍAS</option>
                      <option value="HS">HS</option>
                      <option value="JORNADA">JORNADA</option>
                      <option value="MES">MES</option>
                      <option value="VIAJES">VIAJES</option>
                      <option value="SERVICIO">SERVICIO</option>
                      <option value="UNI">UNI</option>
                    </select>
                  </div>

                  {/* Precio Unitario */}
                  <div className="lg:col-span-1">
                    <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">
                      Precio Unit. ({moneda === 'USD' ? 'US$' : '$'})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.precioUnitario}
                      onChange={e =>
                        handleUpdateLine(idx, 'precioUnitario', parseFloat(e.target.value) || 0)
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-white font-mono text-right text-xs focus:outline-none focus:border-[#F0C800]"
                    />
                  </div>

                  {/* IVA % */}
                  <div className="lg:col-span-1">
                    <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">
                      IVA %
                    </label>
                    <select
                      value={line.alicuotaIva}
                      onChange={e =>
                        handleUpdateLine(idx, 'alicuotaIva', parseFloat(e.target.value))
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-1 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-[#F0C800]"
                    >
                      <option value={21}>21%</option>
                      <option value={10.5}>10.5%</option>
                      <option value={27}>27%</option>
                      <option value={0}>0%</option>
                    </select>
                  </div>

                  {/* Importe + Eliminar */}
                  <div className="lg:col-span-1 flex items-center justify-end gap-1">
                    <span className="font-mono font-bold text-emerald-400 text-xs whitespace-nowrap">
                      {formatCurrency(line.importe, moneda)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      disabled={lines.length <= 1}
                      className="p-1 text-zinc-500 hover:text-rose-400 disabled:opacity-30 cursor-pointer shrink-0"
                      title="Quitar línea"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. PIE COMPACTO (SIMILAR A COTIZACIÓN): IZQUIERDA (FECHAS, OPERARIO Y CONDICIONES) + DERECHA (RESUMEN DE TOTALES) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            {/* Left Side: Fechas, Operario, Horómetro y Observaciones Generales */}
            <div className="lg:col-span-7 bg-zinc-950/70 border border-zinc-800 rounded-xl p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                <span className="font-black uppercase tracking-wider text-white text-[11px] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#F0C800]" />
                  3. Plazos de Entrega, Operario y Condiciones
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-zinc-400">Estado:</span>
                  <select
                    value={estado}
                    onChange={e => setEstado(e.target.value as RentalContractStatus)}
                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-0.5 text-[11px] font-black text-[#F0C800]"
                  >
                    <option value="ACTIVO">ACTIVO (En Obra)</option>
                    <option value="PENDIENTE_ENTREGA">RESERVADO</option>
                    <option value="FINALIZADO">FINALIZADO</option>
                    <option value="CANCELADO">CANCELADO</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                    Fecha Salida *
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaInicio}
                    onChange={e => setFechaInicio(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                    Devolución Est. *
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaFinEstimada}
                    onChange={e => setFechaFinEstimada(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                    Horómetro / Km Salida
                  </label>
                  <input
                    type="number"
                    value={horometroSalida}
                    onChange={e => setHorometroSalida(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                    Modalidad Operario
                  </label>
                  <button
                    type="button"
                    onClick={() => setOperarioIncluido(prev => !prev)}
                    className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-black border transition cursor-pointer flex items-center justify-center gap-1 ${
                      operarioIncluido
                        ? 'bg-[#F0C800] text-zinc-950 border-[#F0C800]'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    {operarioIncluido ? 'CON Operario' : 'SIN Operario'}
                  </button>
                </div>
              </div>

              {operarioIncluido && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                      Chofer / Maquinista Asignado
                    </label>
                    <select
                      value={operarioId}
                      onChange={e => setOperarioId(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white font-semibold text-xs"
                    >
                      <option value="">-- Seleccionar Operario --</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.nombreApellido} (Leg: {emp.legajo || emp.id}) —{' '}
                          {emp.sector || emp.categoria || 'Operador'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                      Costo Adicional Operario ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={tarifaOperarioUnitaria}
                      onChange={e => setTarifaOperarioUnitaria(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                    Checklist / Condición de Entrega
                  </label>
                  <input
                    type="text"
                    value={condicionEntrega}
                    onChange={e => setCondicionEntrega(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-0.5">
                    Observaciones Generales del Contrato
                  </label>
                  <input
                    type="text"
                    value={observaciones}
                    onChange={e => setObservaciones(e.target.value)}
                    placeholder="Ej: Combustible a cargo del cliente, entrega en obra..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Right Side: Resumen de Totales (Exact match to Cotizador) */}
            <div className="lg:col-span-5 bg-zinc-950/70 border border-zinc-800 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between font-black text-white uppercase tracking-wider text-[11px] border-b border-zinc-800 pb-2">
                <span>Resumen de Totales ({moneda === 'USD' ? 'US$ USD' : '$ ARS'})</span>
                {moneda === 'USD' && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px]">
                    DÓLARES USD
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-zinc-300">
                <span>Subtotal Equipos ({lines.length} {lines.length === 1 ? 'línea' : 'líneas'}):</span>
                <span className="font-mono font-bold">{formatCurrency(subtotalEquipos, moneda)}</span>
              </div>

              <div className="flex items-center justify-between text-zinc-300 gap-2">
                <span>Flete / Carretón ({moneda === 'USD' ? 'US$' : '$'}):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costoTrasladoFlete}
                  onChange={e => setCostoTrasladoFlete(parseFloat(e.target.value) || 0)}
                  className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-right text-white font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-between text-zinc-300 gap-2">
                <span>Bonificación / Descuento ({moneda === 'USD' ? 'US$' : '$'}):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={descuento}
                  onChange={e => setDescuento(parseFloat(e.target.value) || 0)}
                  className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-right text-rose-400 font-mono text-xs"
                />
              </div>

              {moneda === 'USD' && (
                <div className="flex items-center justify-between text-zinc-300 gap-2">
                  <span>Cotización Ref. ($ ARS / USD):</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Opcional"
                    value={cotizacionDolar || ''}
                    onChange={e => setCotizacionDolar(parseFloat(e.target.value) || 0)}
                    className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-right text-emerald-300 font-mono text-xs"
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-zinc-200 font-bold pt-1 border-t border-zinc-800/80">
                <span>Subtotal Neto Gravado:</span>
                <span className="font-mono">{formatCurrency(subtotalNeto, moneda)}</span>
              </div>

              <div className="flex items-center justify-between text-amber-400">
                <span>IVA Discriminado:</span>
                <span className="font-mono font-bold">{formatCurrency(ivaTotal, moneda)}</span>
              </div>

              <div className="flex items-center justify-between text-base font-black text-[#F0C800] border-t border-zinc-800 pt-2">
                <span>Importe Total:</span>
                <span className="font-mono text-emerald-400">{formatCurrency(totalAlquiler, moneda)}</span>
              </div>
              {moneda === 'USD' && cotizacionDolar > 0 && (
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Equivalente ref. en Pesos (TC ${cotizacionDolar}):</span>
                  <span className="font-mono font-bold text-zinc-200">
                    {formatCurrency(totalAlquiler * cotizacionDolar, 'ARS')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 4. Fotos de Salida del Equipo, Contrato Firmado y Documentos Adjuntos (Compresión WebP + R2) */}
          <div
            onPaste={handlePasteAttachment}
            className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-3.5 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#F0C800]/15 border border-[#F0C800]/40 flex items-center justify-center text-[#F0C800]">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-black text-[#F0C800] uppercase tracking-wider flex items-center gap-2">
                    4. Fotos de Salida del Equipo, Contrato Firmado y Documentos Adjuntos
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                      Compresión Automática WebP (-90% peso)
                    </span>
                  </h4>
                  <p className="text-[10px] text-zinc-400">
                    Subí fotos de cómo sale la máquina, tablero/horómetro, DNI o el contrato/remito firmado (PDF o foto). También podés pegar imágenes con <span className="text-zinc-200 font-mono">Ctrl+V</span>.
                  </p>
                </div>
              </div>

              {/* Action Buttons: Categoría por defecto + Subir Fotos/ Cámara / PDF */}
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={defaultAttachmentCategory}
                  onChange={e => setDefaultAttachmentCategory(e.target.value as RentalAttachmentCategory)}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 focus:outline-none focus:border-[#F0C800]"
                  title="Categoría para los próximos archivos a subir"
                >
                  <option value="FOTO_SALIDA">📸 Foto Estado de Salida</option>
                  <option value="HOROMETRO_TABLERO">⏱️ Foto Horómetro / Tablero</option>
                  <option value="CONTRATO_FIRMADO">✍️ Contrato / Remito Firmado</option>
                  <option value="DOCUMENTACION_CLIENTE">🪪 DNI / Seguro / Orden Compra</option>
                  <option value="ESTADO_DEVOLUCION">🔄 Foto Devolución / Recepción</option>
                  <option value="OTRO">📎 Otro Documento / Adjunto</option>
                </select>

                <label
                  className={`px-3 py-1.5 rounded-lg bg-[#F0C800] hover:bg-amber-400 text-zinc-950 font-black text-[11px] flex items-center gap-1.5 transition cursor-pointer shadow ${
                    isUploadingAttachments ? 'opacity-60 pointer-events-none' : ''
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  + Cargar Fotos / PDF
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    disabled={isUploadingAttachments}
                    onChange={e => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleUploadRentalFiles(e.target.files);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>

                <label
                  className={`px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-emerald-500/30 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer ${
                    isUploadingAttachments ? 'opacity-60 pointer-events-none' : ''
                  }`}
                  title="Subir directamente como Contrato o Remito Firmado"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  + Doc. Firmado
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.pdf"
                    className="hidden"
                    disabled={isUploadingAttachments}
                    onChange={e => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleUploadRentalFiles(e.target.files, 'CONTRATO_FIRMADO');
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Status / Error Banner */}
            {(isUploadingAttachments || uploadStatusMsg || uploadErrorMsg) && (
              <div
                className={`px-3 py-2 rounded-lg text-[11px] font-bold flex items-center justify-between gap-2 border ${
                  uploadErrorMsg
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : isUploadingAttachments
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isUploadingAttachments && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{uploadErrorMsg || uploadStatusMsg}</span>
                </div>
                {!isUploadingAttachments && (
                  <button
                    type="button"
                    onClick={() => {
                      setUploadStatusMsg(null);
                      setUploadErrorMsg(null);
                    }}
                    className="text-zinc-400 hover:text-white text-[10px]"
                  >
                    Cerrar
                  </button>
                )}
              </div>
            )}

            {/* Empty State Dropzone or Grid of Uploaded Attachments */}
            {adjuntos.length === 0 ? (
              <label className="border border-dashed border-zinc-700 hover:border-[#F0C800]/60 bg-zinc-900/40 hover:bg-zinc-900/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-center gap-3 cursor-pointer transition text-center sm:text-left">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[#F0C800] shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-zinc-200">
                    Hacé clic acá para seleccionar varias fotos de salida del equipo o documentos PDF
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Las fotos pesadas de celular (4 a 12 MB) se reducen automáticamente a ~120 KB en formato WebP de alta nitidez antes de subirse a Cloudflare R2.
                  </p>
                </div>
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  disabled={isUploadingAttachments}
                  onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleUploadRentalFiles(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {adjuntos.map(att => {
                  const isImage =
                    att.tipoArchivo === 'IMAGE' ||
                    /\.(webp|jpg|jpeg|png|gif)(\?|$)/i.test(att.url);
                  return (
                    <div
                      key={att.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 flex gap-2.5 items-start group hover:border-zinc-700 transition"
                    >
                      {/* Thumbnail or Document Icon */}
                      <div
                        onClick={() => setPreviewAttachment(att)}
                        className="w-16 h-16 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer relative group/thumb"
                        title="Clic para ampliar o abrir documento"
                      >
                        {isImage ? (
                          <img
                            src={att.url}
                            alt={att.nombre}
                            className="w-full h-full object-cover group-hover/thumb:scale-105 transition"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-amber-400">
                            <FileText className="w-6 h-6" />
                            <span className="text-[9px] font-black uppercase mt-0.5">
                              {att.tipoArchivo}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition">
                          <Eye className="w-4 h-4 text-white" />
                        </div>
                      </div>

                      {/* Metadata & Controls */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <select
                            value={att.categoria}
                            onChange={e =>
                              handleUpdateAttachment(att.id, {
                                categoria: e.target.value as RentalAttachmentCategory
                              })
                            }
                            className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-[10px] font-bold text-[#F0C800] focus:outline-none focus:border-[#F0C800] max-w-[165px] truncate"
                          >
                            <option value="FOTO_SALIDA">📸 Salida Equipo</option>
                            <option value="HOROMETRO_TABLERO">⏱️ Horómetro/Tablero</option>
                            <option value="CONTRATO_FIRMADO">✍️ Contrato Firmado</option>
                            <option value="DOCUMENTACION_CLIENTE">🪪 Doc. / DNI / OC</option>
                            <option value="ESTADO_DEVOLUCION">🔄 Devolución</option>
                            <option value="OTRO">📎 Otro Adjunto</option>
                          </select>

                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir / Descargar original"
                              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                            >
                              <Download className="w-3 h-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(att.id)}
                              title="Quitar adjunto"
                              className="p-1 rounded bg-zinc-800 hover:bg-rose-950/80 text-rose-400 transition cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          value={att.nota || ''}
                          onChange={e => handleUpdateAttachment(att.id, { nota: e.target.value })}
                          placeholder="Nota (ej: Lateral der., remito firmado...)"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#F0C800]"
                        />

                        <div className="flex items-center justify-between gap-1 text-[9px] text-zinc-500 font-mono">
                          <span className="truncate max-w-[110px]" title={att.nombre}>
                            {att.nombre}
                          </span>
                          {att.optimizedSizeKB ? (
                            <span className="text-emerald-400 font-bold shrink-0">
                              {att.originalSizeKB && att.originalSizeKB > att.optimizedSizeKB
                                ? `${att.originalSizeKB}KB → ${att.optimizedSizeKB}KB (-${
                                    att.reductionPercentage ||
                                    Math.round(
                                      ((att.originalSizeKB - att.optimizedSizeKB) /
                                        att.originalSizeKB) *
                                        100
                                    )
                                  }%)`
                                : `${att.optimizedSizeKB} KB`}
                            </span>
                          ) : (
                            <span className="text-zinc-400 shrink-0">Cloudflare R2</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lightbox / Document Preview Modal inside Form */}
          {previewAttachment && (
            <div
              onClick={() => setPreviewAttachment(null)}
              className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <div
                onClick={e => e.stopPropagation()}
                className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
              >
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-white uppercase">
                      {previewAttachment.nota || previewAttachment.nombre}
                    </h4>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      {previewAttachment.categoria} • {previewAttachment.nombre}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={previewAttachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-[#F0C800] text-zinc-950 font-black text-xs flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Abrir / Descargar
                    </a>
                    <button
                      type="button"
                      onClick={() => setPreviewAttachment(null)}
                      className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-black/60 min-h-[320px]">
                  {previewAttachment.tipoArchivo === 'IMAGE' ||
                  /\.(webp|jpg|jpeg|png|gif)(\?|$)/i.test(previewAttachment.url) ? (
                    <img
                      src={previewAttachment.url}
                      alt={previewAttachment.nombre}
                      className="max-h-[75vh] max-w-full object-contain rounded-lg"
                    />
                  ) : (
                    <iframe
                      src={previewAttachment.url}
                      title={previewAttachment.nombre}
                      className="w-full h-[70vh] rounded-lg bg-white"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 5. VINCULACIÓN CON PARTES DIARIOS, FACTURAS ARCA Y ESTADO DE COBRO */}
          <div className="bg-zinc-950/80 border border-cyan-500/30 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-black text-cyan-300 uppercase tracking-wider">
                    5. Vinculación con Partes Diarios, Factura ARCA y Estado de Cobro
                  </h4>
                  <p className="text-[10px] text-zinc-400">
                    Asociá partes diarios de trabajo y facturas emitidas para trazabilidad bidireccional en Partes, Alquileres, Facturación y Cobranzas.
                  </p>
                </div>
              </div>
              {partesDiariosIds.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-mono font-bold">
                  📋 {partesDiariosIds.length} Parte(s) Diario(s) Vinculado(s)
                </span>
              )}
            </div>

            {/* Factura ARCA + Estado Facturación + Estado de Pago */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                  Factura ARCA Vinculada
                </label>
                <select
                  value={facturaId}
                  onChange={e => {
                    const invId = e.target.value;
                    setFacturaId(invId);
                    const found = invoices.find(i => i.id === invId);
                    if (found) {
                      setFacturaNumero(formatInvoiceNumber(found));
                      setEstadoFacturacion('FACTURADO');
                      if (found.estadoCobro) setEstadoCobro(found.estadoCobro as any);
                    } else {
                      setFacturaNumero('');
                    }
                  }}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                >
                  <option value="">-- Sin Factura Vinculada --</option>
                  {invoices
                    .filter(i => !i.tipoComprobante.startsWith('NOTA_CREDITO'))
                    .map(inv => {
                      const num = formatInvoiceNumber(inv);
                      return (
                        <option key={inv.id} value={inv.id}>
                          {inv.tipoComprobante.replace('FACTURA_', 'FACT ')} #{num} — {inv.razonSocialReceptor} ({formatCurrency(inv.importeTotal, inv.moneda)})
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                  Estado de Facturación
                </label>
                <select
                  value={facturaId ? 'FACTURADO' : estadoFacturacion}
                  onChange={e => setEstadoFacturacion(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-cyan-300"
                >
                  <option value="SIN_FACTURAR">SIN FACTURAR</option>
                  <option value="FACTURADO_PARCIAL">FACTURADO PARCIAL</option>
                  <option value="FACTURADO">FACTURADO</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                  Estado de Cobro / Pago
                </label>
                <select
                  value={estadoCobro}
                  onChange={e => setEstadoCobro(e.target.value as any)}
                  className={`w-full bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-xs font-black ${
                    estadoCobro === 'PAGADO'
                      ? 'border-emerald-500/50 text-emerald-400'
                      : estadoCobro === 'COBRADO_PARCIAL'
                        ? 'border-amber-500/50 text-amber-300'
                        : 'border-rose-500/50 text-rose-300'
                  }`}
                >
                  <option value="PENDIENTE_PAGO">PENDIENTE DE PAGO</option>
                  <option value="COBRADO_PARCIAL">PAGO PARCIAL</option>
                  <option value="PAGADO">PAGADO (COBRADO)</option>
                </select>
              </div>
            </div>

            {/* Selector de Partes Diarios */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={parteSearchTerm}
                    onChange={e => setParteSearchTerm(e.target.value)}
                    placeholder="Buscar Parte Diario por Nº de parte, máquina, chofer, obra o fecha..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyMatchingEquipmentPartes}
                    onChange={e => setOnlyMatchingEquipmentPartes(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  Solo partes de los equipos de este contrato
                </label>
              </div>

              <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/70 divide-y divide-zinc-800/70">
                {partesDiarios
                  .filter(p => {
                    if (partesDiariosIds.includes(p.id)) return true;
                    if (onlyMatchingEquipmentPartes) {
                      const eqModels = lines.map(l => (l.descripcion || '').toLowerCase());
                      const pModel = (p.marcaModelo || p.codigoEquipo || '').toLowerCase();
                      if (pModel && !eqModels.some(m => m.includes(pModel) || pModel.includes(m.replace('alquiler ', '')))) {
                        return false;
                      }
                    }
                    if (!parteSearchTerm.trim()) return true;
                    const q = parteSearchTerm.toLowerCase();
                    return (
                      (p.numParte || '').toLowerCase().includes(q) ||
                      (p.marcaModelo || '').toLowerCase().includes(q) ||
                      (p.codigoEquipo || '').toLowerCase().includes(q) ||
                      (p.nombreApellido || '').toLowerCase().includes(q) ||
                      (p.obra || '').toLowerCase().includes(q) ||
                      (p.fecha || '').toLowerCase().includes(q)
                    );
                  })
                  .slice(0, 40)
                  .map(p => {
                    const isLinked = partesDiariosIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center justify-between px-3 py-1.5 text-[11px] cursor-pointer hover:bg-zinc-800/70 ${
                          isLinked ? 'bg-cyan-950/30 text-cyan-200' : 'text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={isLinked}
                            onChange={e => {
                              if (e.target.checked) {
                                setPartesDiariosIds(prev => [...prev, p.id]);
                              } else {
                                setPartesDiariosIds(prev => prev.filter(id => id !== p.id));
                              }
                            }}
                            className="accent-cyan-400"
                          />
                          <span className="font-mono font-bold text-[#F0C800]">Parte #{p.numParte}</span>
                          <span className="font-mono text-zinc-400">{p.fecha}</span>
                          <span className="font-bold text-white truncate">{p.marcaModelo || p.codigoEquipo}</span>
                          <span className="text-zinc-400 truncate">• {p.obra}</span>
                        </div>
                        <span className="font-mono font-bold text-cyan-300 shrink-0 ml-2">
                          {p.tipo === 'VIAJES'
                            ? `${p.viajesCantidad || 1} vjs`
                            : `${Number(p.horasTrabajadas || p.hsCantidad || 0).toFixed(1)} hs`}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-300 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isUploadingAttachments}
              className="px-5 py-2 rounded-xl bg-[#F0C800] hover:bg-amber-400 disabled:opacity-50 text-zinc-950 text-xs font-black shadow-lg shadow-[#F0C800]/20 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              {contractToEdit
                ? 'Guardar Cambios en Base de Datos'
                : 'Confirmar y Registrar Alquiler en BD'}
            </button>
          </div>
        </form>
      </div>

      <ClientDirectoryModal
        isOpen={isClientDirectoryOpen}
        onClose={() => setIsClientDirectoryOpen(false)}
        onClientsUpdated={(list) => setDbClients(list as DbClientRecord[])}
        onSelectClient={(c) => {
          handleSelectDbClient({
            cuit: c.cuit || '',
            razonSocial: c.razonSocial || '',
            condicionIva: c.condicionIva || 'RESPONSABLE_INSCRIPTO',
            condicionVenta: c.condicionVenta || 'CONTADO / TRANSFERENCIA',
            domicilio: c.domicilio || '',
            localidad: c.localidad || 'SAN SALVADOR DE JUJUY',
            zona: c.zona || '',
            telefono: c.telefono || '',
            email: c.email || '',
            fuente: c.fuente || 'CLIENTES',
            ultimoComprobante: c.ultimoComprobante,
          });
        }}
      />
    </div>
  );
};
