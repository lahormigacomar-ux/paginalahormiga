import React, { useState, useMemo } from 'react';
import {
  Obra,
  ObraFacturaLegajo,
  ObraFacturaOrigen,
  ObraLegajoAdjunto,
  ArcaInvoice,
  CustomerPaymentReceipt,
  RentalContract,
  Quotation,
  ParteDiario
} from '../../types';
import { formatCurrency } from '../../services/storage';
import { uploadFileToCloudflareR2 } from '../../services/api';
import {
  resolveArcaInvoiceLinks,
  resolveRentalContractLinks,
  isExternalMigratedInvoice,
  formatInvoiceNumber,
  formatInvoiceLabel
} from '../../utils/crossLinks';
import {
  isArcaInvoiceFullyPaid,
  resolveFacturaLegajoLiveStatus,
  resolveObraFullLegajo
} from '../../utils/obraLegajoResolver';
import {
  ObraFacturaPreviewModal,
  ObraReceiptPreviewModal
} from './ObraLegajoFacturaPagoModals';
import {
  Receipt,
  Plus,
  Search,
  FileText,
  Truck,
  ClipboardList,
  Paperclip,
  Trash2,
  Edit3,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Download,
  Eye,
  X,
  Link2,
  ChevronDown,
  ChevronUp,
  Upload,
  Banknote
} from 'lucide-react';

interface ObraFacturacionLegajosTabProps {
  obra: Obra;
  arcaInvoices: ArcaInvoice[];
  customerReceipts?: CustomerPaymentReceipt[];
  rentals: RentalContract[];
  quotations: Quotation[];
  partesDiarios: ParteDiario[];
  selectedContenedorId?: string;
  onChangeContenedorId?: (id: string) => void;
  onSaveObra: (updatedObra: Obra) => Promise<{ ok: boolean; error?: string }>;
  onNavigateToArca?: (invoice: ArcaInvoice) => void;
  onNavigateToCobranzas?: () => void;
}

const ORIGEN_LABELS: Record<ObraFacturaOrigen, { label: string; color: string }> = {
  ALQUILER_MAQUINA: {
    label: 'Alquiler de Máquina',
    color: 'bg-blue-500/15 text-blue-300 border-blue-500/30'
  },
  PARTES_DIARIOS: {
    label: 'Partes Diarios',
    color: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  },
  MIXTO: {
    label: 'Mixto (Alquiler + Partes)',
    color: 'bg-purple-500/15 text-purple-300 border-purple-500/30'
  },
  CERTIFICADO_OBRA: {
    label: 'Certificado de Obra',
    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  },
  OTRO: {
    label: 'Otro Concepto',
    color: 'bg-slate-700/60 text-slate-300 border-slate-600'
  }
};

const pad4 = (n: number | string) => String(n || 1).padStart(4, '0');
const pad8 = (n: number | string) => String(n || 0).padStart(8, '0');

export const ObraFacturacionLegajosTab: React.FC<ObraFacturacionLegajosTabProps> = ({
  obra,
  arcaInvoices,
  customerReceipts = [],
  rentals,
  quotations,
  partesDiarios,
  selectedContenedorId = 'ALL',
  onChangeContenedorId,
  onSaveObra,
  onNavigateToArca,
  onNavigateToCobranzas
}) => {
  const facturas = obra.facturasLegajo || [];
  const periodos = obra.periodosLegajo || [];

  const fullLegajoSummary = useMemo(
    () =>
      resolveObraFullLegajo({
        obra,
        partesDiarios,
        rentals,
        arcaInvoices,
        customerReceipts,
        quotations
      }),
    [obra, partesDiarios, rentals, arcaInvoices, customerReceipts, quotations]
  );

  const activeContenedor = useMemo(() => {
    if (!selectedContenedorId || selectedContenedorId === 'ALL') return undefined;
    return periodos.find((p) => p.id === selectedContenedorId);
  }, [periodos, selectedContenedorId]);

  const activeContenedorId = activeContenedor?.id || 'ALL';

  const visibleFacturas = useMemo(() => {
    if (activeContenedorId === 'ALL') return facturas;
    return facturas.filter((f) => f.periodoId === activeContenedorId);
  }, [facturas, activeContenedorId]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFacturaId, setEditingFacturaId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedLegajoId, setExpandedLegajoId] = useState<string | null>(null);
  const [previewAdjunto, setPreviewAdjunto] = useState<ObraLegajoAdjunto | null>(null);
  const [previewArcaInvoice, setPreviewArcaInvoice] = useState<ArcaInvoice | null>(null);
  const [previewPaymentReceipt, setPreviewPaymentReceipt] = useState<CustomerPaymentReceipt | null>(null);

  // Form State
  const [arcaInvoiceId, setArcaInvoiceId] = useState<string>('');
  const [selectedImportRentalId, setSelectedImportRentalId] = useState<string>('');
  const [selectedPeriodoId, setSelectedPeriodoId] = useState<string>('');
  const [tipoComprobante, setTipoComprobante] = useState<string>('FACTURA A');
  const [nroComprobante, setNroComprobante] = useState<string>('');
  const [fecha, setFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [concepto, setConcepto] = useState<string>('');
  const [origen, setOrigen] = useState<ObraFacturaOrigen>('ALQUILER_MAQUINA');
  const [rentalIds, setRentalIds] = useState<string[]>([]);
  const [quotationIds, setQuotationIds] = useState<string[]>([]);
  const [parteDiarioIds, setParteDiarioIds] = useState<string[]>([]);
  const [netoGravado, setNetoGravado] = useState<number>(0);
  const [ivaMonto, setIvaMonto] = useState<number>(0);
  const [importeTotal, setImporteTotal] = useState<number>(0);
  const [estadoCobro, setEstadoCobro] = useState<'PENDIENTE' | 'COBRADO_PARCIAL' | 'COBRADO'>('PENDIENTE');
  const [pendienteFacturacion, setPendienteFacturacion] = useState<boolean>(false);
  const [observaciones, setObservaciones] = useState<string>('');
  const [adjuntos, setAdjuntos] = useState<ObraLegajoAdjunto[]>([]);
  const [newAdjuntoTipo, setNewAdjuntoTipo] = useState<ObraLegajoAdjunto['tipo']>('FACTURA');
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Search filters inside modal form
  const [rentalSearch, setRentalSearch] = useState('');
  const [quotationSearch, setQuotationSearch] = useState('');
  const [parteSearch, setParteSearch] = useState('');
  const [showAllPartes, setShowAllPartes] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const obraPartes = useMemo(() => {
    const oNom = (obra.nombreObra || '').toLowerCase().trim();
    const oNum = (obra.numero || '').toLowerCase().trim();
    return partesDiarios.filter(
      (p) =>
        (oNom && (p.obra || '').toLowerCase().trim() === oNom) ||
        (oNum && (p.codigoObra || '').toLowerCase().trim() === oNum)
    );
  }, [partesDiarios, obra]);

  const isLegajoSinFacturar = (f: ObraFacturaLegajo) =>
    Boolean(
      f.pendienteFacturacion ||
        f.tipoComprobante === 'CONTRATO DE ALQUILER' ||
        !f.nroComprobante ||
        f.nroComprobante === 'SIN FACTURAR'
    );

  const totals = useMemo(() => {
    const emitidas = visibleFacturas.filter((f) => !isLegajoSinFacturar(f));
    const sinFacturarCount = visibleFacturas.length - emitidas.length;
    const neto = emitidas.reduce((acc, f) => acc + Number(f.netoGravado || 0), 0);
    const iva = emitidas.reduce((acc, f) => acc + Number(f.ivaMonto || 0), 0);
    const total = emitidas.reduce((acc, f) => acc + Number(f.importeTotal || 0), 0);
    const cobrado = emitidas.reduce((acc, f) => {
      const live = resolveFacturaLegajoLiveStatus(
        f,
        arcaInvoices,
        customerReceipts,
        rentals,
        partesDiarios
      );
      return acc + live.montoCobrado;
    }, 0);
    const pendiente = Math.max(0, total - cobrado);
    return { neto, iva, total, cobrado, pendiente, emitidasCount: emitidas.length, sinFacturarCount };
  }, [visibleFacturas, arcaInvoices, customerReceipts, rentals, partesDiarios]);

  const resetForm = () => {
    setEditingFacturaId(null);
    setArcaInvoiceId('');
    setSelectedImportRentalId('');
    setSelectedPeriodoId('');
    setTipoComprobante('FACTURA A');
    setNroComprobante('');
    setFecha(new Date().toISOString().slice(0, 10));
    setConcepto('');
    setOrigen('ALQUILER_MAQUINA');
    setRentalIds([]);
    setQuotationIds([]);
    setParteDiarioIds([]);
    setNetoGravado(0);
    setIvaMonto(0);
    setImporteTotal(0);
    setEstadoCobro('PENDIENTE');
    setPendienteFacturacion(false);
    setObservaciones('');
    setAdjuntos([]);
    setRentalSearch('');
    setQuotationSearch('');
    setParteSearch('');
    setShowAllPartes(false);
    setImportNotice(null);
    setSaveError(null);
  };

  const openNewForm = (asPendingContract = false) => {
    resetForm();
    if (activeContenedorId !== 'ALL') {
      setSelectedPeriodoId(activeContenedorId);
    }
    if (asPendingContract) {
      setPendienteFacturacion(true);
      setTipoComprobante('CONTRATO DE ALQUILER');
      setOrigen('ALQUILER_MAQUINA');
    }
    setIsFormOpen(true);
  };

  const openEditForm = (f: ObraFacturaLegajo, forceConvertToInvoice = false) => {
    const currentlyPending = isLegajoSinFacturar(f);
    setEditingFacturaId(f.id);
    setArcaInvoiceId(f.arcaInvoiceId || '');
    setSelectedImportRentalId(f.rentalIds?.[0] || '');
    setSelectedPeriodoId(f.periodoId || '');
    if (forceConvertToInvoice && currentlyPending) {
      setPendienteFacturacion(false);
      setTipoComprobante('FACTURA A');
      setNroComprobante(
        f.nroComprobante && f.nroComprobante !== 'SIN FACTURAR' && !f.nroComprobante.startsWith('ALQ-')
          ? f.nroComprobante
          : ''
      );
      setImportNotice(
        'Seleccioná arriba la Factura ARCA emitida o completá el número e importes para pasar este contrato a Facturado.'
      );
    } else {
      setPendienteFacturacion(currentlyPending);
      setTipoComprobante(f.tipoComprobante || (currentlyPending ? 'CONTRATO DE ALQUILER' : 'FACTURA A'));
      setNroComprobante(f.nroComprobante || '');
      setImportNotice(null);
    }
    setFecha(f.fecha || new Date().toISOString().slice(0, 10));
    setConcepto(f.concepto || '');
    setOrigen(f.origen || 'ALQUILER_MAQUINA');
    setRentalIds(f.rentalIds || []);
    setQuotationIds(f.quotationIds || []);
    setParteDiarioIds(f.parteDiarioIds || []);
    setNetoGravado(Number(f.netoGravado || 0));
    setIvaMonto(Number(f.ivaMonto || 0));
    setImporteTotal(Number(f.importeTotal || 0));
    setEstadoCobro(f.estadoCobro || 'PENDIENTE');
    setObservaciones(f.observaciones || '');
    setAdjuntos(f.adjuntos || []);
    setSaveError(null);
    setIsFormOpen(true);
  };


  const handleImportArcaInvoice = (invId: string) => {
    setArcaInvoiceId(invId);
    setImportNotice(null);
    if (!invId) return;
    const inv = arcaInvoices.find((i) => i.id === invId);
    if (!inv) return;

    setPendienteFacturacion(false);
    const normalizedTipo = inv.tipoComprobante
      .replace('NOTA_CREDITO_', 'NOTA DE CRÉDITO ')
      .replace(/_/g, ' ');
    setTipoComprobante(normalizedTipo);
    setNroComprobante(formatInvoiceNumber(inv));
    setFecha(inv.fecha || new Date().toISOString().slice(0, 10));
    const itemsDesc = (inv.items || [])
      .map((it) => it.descripcion)
      .filter(Boolean)
      .slice(0, 3)
      .join(' / ');
    setConcepto(itemsDesc || `Facturación a ${inv.razonSocialReceptor}`);
    setNetoGravado(Number(inv.netoGravado || 0));
    setIvaMonto(Number(inv.ivaTotal || 0));
    setImporteTotal(Number(inv.importeTotal || inv.impTotal || 0));

    // Resolver todos los vínculos de la factura (Contratos de Alquiler, Partes Diarios directos/absorbidos y Estado de Cobro)
    const resolved = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
    const linkedRentalIds = resolved.linkedRentals.map((r) => r.id);
    const linkedParteIds = resolved.linkedPartes.map((p) => p.id);

    // También capturar cotizaciones asociadas a los contratos vinculados o al remito/referencia de la factura
    const cotIdsSet = new Set<string>();
    resolved.linkedRentals.forEach((r) => {
      if (r.cotizacionId) cotIdsSet.add(r.cotizacionId);
    });
    if (inv.remitoPedido) {
      const remitoUp = inv.remitoPedido.toUpperCase();
      quotations.forEach((q) => {
        const qNum = `${pad4(q.puntoVenta)}-${pad8(q.numeroComprobante)}`.toUpperCase();
        if (remitoUp.includes(qNum) || remitoUp.includes(q.id.toUpperCase())) {
          cotIdsSet.add(q.id);
        }
      });
    }
    const linkedCotIds = Array.from(cotIdsSet);

    setRentalIds(linkedRentalIds);
    setQuotationIds(linkedCotIds);
    setParteDiarioIds(linkedParteIds);

    // Estado de cobro desde la factura
    if (resolved.estadoCobro === 'PAGADO') {
      setEstadoCobro('COBRADO');
    } else if (resolved.estadoCobro === 'COBRADO_PARCIAL' || resolved.estadoCobro === 'PARCIAL') {
      setEstadoCobro('COBRADO_PARCIAL');
    } else {
      setEstadoCobro('PENDIENTE');
    }

    // Origen sugerido según lo traído
    if (linkedRentalIds.length > 0 && linkedParteIds.length > 0) {
      setOrigen('MIXTO');
    } else if (linkedParteIds.length > 0) {
      setOrigen('PARTES_DIARIOS');
    } else if (linkedRentalIds.length > 0 || inv.vinculadoTipo === 'ALQUILER') {
      setOrigen('ALQUILER_MAQUINA');
    }

    if (isExternalMigratedInvoice(inv) && !observaciones.trim()) {
      setObservaciones(`Factura cargada de otro sistema (${inv.sistemaOrigenNombre || 'Migración'}).`);
    }

    setImportNotice(
      `✓ Factura importada con ${linkedParteIds.length} parte(s) diario(s), ${linkedRentalIds.length} contrato(s) de alquiler y ${linkedCotIds.length} cotización(es) vinculada(s).`
    );
  };

  const handleImportFromRental = (rId: string) => {
    setSelectedImportRentalId(rId);
    setImportNotice(null);
    if (!rId) return;
    const rental = rentals.find((r) => r.id === rId);
    if (!rental) return;

    const rLinks = resolveRentalContractLinks(rental, partesDiarios, arcaInvoices);
    if (rLinks.primaryInvoice) {
      handleImportArcaInvoice(rLinks.primaryInvoice.id);
      setRentalIds((prev) => Array.from(new Set([...prev, rental.id])));
      if (rental.cotizacionId) {
        setQuotationIds((prev) => Array.from(new Set([...prev, rental.cotizacionId!])));
      }
      setImportNotice(
        `✓ El contrato ${rental.numeroContrato} ya tiene la Factura ${rLinks.facturaNumero} vinculada — se importaron automáticamente sus datos e importes junto con ${rLinks.linkedPartes.length} parte(s).`
      );
      return;
    }

    setArcaInvoiceId('');
    setPendienteFacturacion(true);
    setTipoComprobante('CONTRATO DE ALQUILER');
    setNroComprobante(rental.numeroContrato || 'SIN FACTURAR');
    setRentalIds([rental.id]);
    setQuotationIds(rental.cotizacionId ? [rental.cotizacionId] : []);
    setParteDiarioIds(rLinks.linkedPartes.map((p) => p.id));
    setOrigen(rLinks.linkedPartes.length > 0 ? 'MIXTO' : 'ALQUILER_MAQUINA');

    const descItems = (rental.items || []).map((it) => it.descripcion).filter(Boolean).slice(0, 2).join(' + ');
    setConcepto(
      (
        (rental.titulo ? `${rental.titulo} — ` : '') +
        (descItems ||
          `Alquiler ${rental.equipoCodigoInterno ? `[${rental.equipoCodigoInterno}] ` : ''}${rental.equipoModelo || ''} · Contrato ${rental.numeroContrato}`)
      ).trim()
    );
    const neto = Number(rental.subtotalNeto ?? rental.totalAlquiler ?? 0);
    const iva = Number(rental.ivaTotal ?? 0);
    setNetoGravado(neto);
    setIvaMonto(iva);
    setImporteTotal(Number(rental.totalAlquiler || neto + iva));
    setImportNotice(
      `✓ Contrato ${rental.numeroContrato} cargado (${rLinks.linkedPartes.length} parte(s) vinculados) en modo Pendiente de Facturar. No hace falta cargar factura todavía; cuando factures, editás este legajo o emitís la factura desde Alquileres y se vincula.`
    );
  };

  const toggleRentalSelection = (rental: RentalContract) => {
    const exists = rentalIds.includes(rental.id);
    if (exists) {
      setRentalIds((prev) => prev.filter((id) => id !== rental.id));
    } else {
      setRentalIds((prev) => [...prev, rental.id]);
      if (rental.cotizacionId && !quotationIds.includes(rental.cotizacionId)) {
        setQuotationIds((prev) => [...prev, rental.cotizacionId!]);
      }
      const rLinks = resolveRentalContractLinks(rental, partesDiarios, arcaInvoices);
      if (rLinks.linkedPartes.length > 0) {
        const rParteIds = rLinks.linkedPartes.map((p) => p.id);
        setParteDiarioIds((prev) => Array.from(new Set([...prev, ...rParteIds])));
      }
    }
  };

  const toggleQuotationSelection = (qId: string) => {
    setQuotationIds((prev) => (prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]));
  };

  const toggleParteSelection = (pId: string) => {
    setParteDiarioIds((prev) => (prev.includes(pId) ? prev.filter((id) => id !== pId) : [...prev, pId]));
  };

  const handleNetoChange = (val: number) => {
    const n = Number(val) || 0;
    setNetoGravado(n);
    setImporteTotal(Number((n + ivaMonto).toFixed(2)));
  };

  const handleIvaChange = (val: number) => {
    const v = Number(val) || 0;
    setIvaMonto(v);
    setImporteTotal(Number((netoGravado + v).toFixed(2)));
  };

  const handleAutoIva21 = () => {
    const calcIva = Number((netoGravado * 0.21).toFixed(2));
    setIvaMonto(calcIva);
    setImporteTotal(Number((netoGravado + calcIva).toFixed(2)));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setSaveError('El archivo supera los 15 MB permitidos para subir a Cloudflare R2.');
      return;
    }

    setIsUploadingFile(true);
    setSaveError(null);
    try {
      const res = await uploadFileToCloudflareR2(
        file,
        file.name,
        file.type || 'application/octet-stream',
        'obras-legajos'
      );
      if (!res.success || !res.url) {
        throw new Error(res.error || 'No se pudo subir el archivo a Cloudflare R2.');
      }

      const sizeKB = Math.max(1, Math.round(file.size / 1024));
      const newAtt: ObraLegajoAdjunto = {
        id: `ADJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        nombre: file.name,
        url: res.url,
        tipo: newAdjuntoTipo,
        fechaSubida: new Date().toISOString().slice(0, 10),
        tamanio: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`
      };
      setAdjuntos((prev) => [...prev, newAtt]);
    } catch (err: any) {
      setSaveError(err?.message || 'Error al subir archivo a Cloudflare R2. No se guardó en base de datos.');
    } finally {
      setIsUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleSubmitFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveFeedback(null);

    const isSinFacturar = pendienteFacturacion || tipoComprobante === 'CONTRATO DE ALQUILER';
    const firstSelectedRental = rentals.find((r) => rentalIds.includes(r.id));

    let resolvedNro = nroComprobante.trim();
    let resolvedConcepto = concepto.trim();

    if (isSinFacturar) {
      if (!resolvedNro) {
        resolvedNro = firstSelectedRental?.numeroContrato || 'SIN FACTURAR';
      }
      if (!resolvedConcepto) {
        if (firstSelectedRental) {
          resolvedConcepto = `${firstSelectedRental.titulo ? `${firstSelectedRental.titulo} — ` : ''}Contrato ${firstSelectedRental.numeroContrato} · ${firstSelectedRental.equipoModelo || 'Alquiler de equipo'}`;
        } else if (parteDiarioIds.length > 0) {
          resolvedConcepto = `Legajo de ${parteDiarioIds.length} parte(s) diarios (pendiente de facturar)`;
        } else {
          setSaveError('Seleccioná al menos un contrato de alquiler, partes diarios o ingresá un concepto.');
          return;
        }
      }
    } else {
      if (!resolvedNro) {
        setSaveError(
          'Ingresá el número de comprobante / factura (o activá el modo "Contrato / Sin facturar aún" arriba si todavía no facturaste).'
        );
        return;
      }
      if (!resolvedConcepto) {
        setSaveError('Ingresá el concepto o detalle de la factura.');
        return;
      }
    }

    const resolvedPeriodObj = selectedPeriodoId
      ? periodos.find((p) => p.id === selectedPeriodoId)
      : undefined;

    const newRecord: ObraFacturaLegajo = {
      id: editingFacturaId || `OFAC-${Date.now()}`,
      arcaInvoiceId: isSinFacturar ? undefined : (arcaInvoiceId || undefined),
      periodoId: resolvedPeriodObj?.id || undefined,
      periodoTitulo: resolvedPeriodObj?.titulo || undefined,
      tipoComprobante: isSinFacturar ? 'CONTRATO DE ALQUILER' : (tipoComprobante.trim() || 'FACTURA A'),
      nroComprobante: resolvedNro,
      fecha: fecha || new Date().toISOString().slice(0, 10),
      concepto: resolvedConcepto,
      origen,
      rentalIds,
      quotationIds,
      parteDiarioIds,
      netoGravado: Number(netoGravado) || 0,
      ivaMonto: Number(ivaMonto) || 0,
      importeTotal: Number(importeTotal) || Number(netoGravado) + Number(ivaMonto),
      estadoCobro,
      pendienteFacturacion: isSinFacturar,
      observaciones: observaciones.trim() || undefined,
      adjuntos,
      createdAt:
        facturas.find((f) => f.id === editingFacturaId)?.createdAt || new Date().toISOString()
    };

    const nextFacturas = editingFacturaId
      ? facturas.map((f) => (f.id === editingFacturaId ? newRecord : f))
      : [newRecord, ...facturas];

    const updatedObra: Obra = {
      ...obra,
      facturasLegajo: nextFacturas
    };

    setIsSaving(true);
    const result = await onSaveObra(updatedObra);
    setIsSaving(false);

    if (!result.ok) {
      setSaveError(result.error || 'No se pudo guardar el legajo en Supabase.');
      return;
    }

    setSaveFeedback(
      isSinFacturar
        ? `Contrato / Legajo ${newRecord.nroComprobante} guardado como Pendiente de Facturar en Supabase.`
        : editingFacturaId
          ? `Legajo de ${newRecord.tipoComprobante} ${newRecord.nroComprobante} actualizado en Supabase.`
          : `Factura ${newRecord.tipoComprobante} ${newRecord.nroComprobante} y su legajo guardados en Supabase.`
    );
    setIsFormOpen(false);
    resetForm();
  };

  const handleToggleCobro = async (f: ObraFacturaLegajo) => {
    const nextEstado: ObraFacturaLegajo['estadoCobro'] =
      f.estadoCobro === 'COBRADO' ? 'PENDIENTE' : 'COBRADO';
    const nextFacturas = facturas.map((item) =>
      item.id === f.id ? { ...item, estadoCobro: nextEstado } : item
    );
    setIsSaving(true);
    setSaveError(null);
    const res = await onSaveObra({ ...obra, facturasLegajo: nextFacturas });
    setIsSaving(false);
    if (!res.ok) {
      setSaveError(res.error || 'Error al actualizar el estado de cobro en Supabase.');
    } else {
      setSaveFeedback(`Estado de cobro actualizado a ${nextEstado} en Supabase.`);
    }
  };

  const handleDeleteFactura = async (id: string) => {
    const nextFacturas = facturas.filter((f) => f.id !== id);
    setIsSaving(true);
    setSaveError(null);
    const res = await onSaveObra({ ...obra, facturasLegajo: nextFacturas });
    setIsSaving(false);
    setConfirmDeleteId(null);
    if (!res.ok) {
      setSaveError(res.error || 'Error al eliminar la factura en Supabase.');
    } else {
      setSaveFeedback('Factura y legajo eliminados de la obra en Supabase.');
    }
  };

  const filteredRentals = useMemo(() => {
    const q = rentalSearch.trim().toLowerCase();
    return rentals
      .filter((r) => {
        if (!q) return true;
        return (
          (r.numeroContrato || '').toLowerCase().includes(q) ||
          (r.titulo || '').toLowerCase().includes(q) ||
          (r.clienteNombre || '').toLowerCase().includes(q) ||
          (r.equipoModelo || '').toLowerCase().includes(q) ||
          (r.direccionObra || '').toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => Number(rentalIds.includes(b.id)) - Number(rentalIds.includes(a.id)));
  }, [rentals, rentalSearch, rentalIds]);

  const filteredQuotations = useMemo(() => {
    const q = quotationSearch.trim().toLowerCase();
    return quotations
      .filter((qt) => {
        if (!q) return true;
        const num = `${pad4(qt.puntoVenta)}-${pad8(qt.numeroComprobante)}`;
        return (
          num.toLowerCase().includes(q) ||
          (qt.razonSocialReceptor || '').toLowerCase().includes(q) ||
          qt.items?.some((it) => (it.descripcion || '').toLowerCase().includes(q))
        );
      })
      .slice()
      .sort((a, b) => Number(quotationIds.includes(b.id)) - Number(quotationIds.includes(a.id)));
  }, [quotations, quotationSearch, quotationIds]);

  const basePartesList = useMemo(() => {
    if (showAllPartes) return partesDiarios;
    const selectedSet = new Set(parteDiarioIds);
    const obraSet = new Set(obraPartes.map((p) => p.id));
    const extraSelected = partesDiarios.filter((p) => selectedSet.has(p.id) && !obraSet.has(p.id));
    return [...extraSelected, ...obraPartes];
  }, [showAllPartes, partesDiarios, obraPartes, parteDiarioIds]);

  const filteredPartes = useMemo(() => {
    const q = parteSearch.trim().toLowerCase();
    return basePartesList
      .filter((p) => {
        if (!q) return true;
        return (
          (p.numParte || '').toLowerCase().includes(q) ||
          (p.fecha || '').toLowerCase().includes(q) ||
          (p.codigoEquipo || '').toLowerCase().includes(q) ||
          (p.marcaModelo || '').toLowerCase().includes(q) ||
          (p.nombreApellido || '').toLowerCase().includes(q) ||
          (p.obra || '').toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => Number(parteDiarioIds.includes(b.id)) - Number(parteDiarioIds.includes(a.id)));
  }, [basePartesList, parteSearch, parteDiarioIds]);


  return (
    <div className="space-y-5 animate-fade-in">
      {/* Feedback & Errors */}
      {saveError && (
        <div className="bg-red-500/15 border border-red-500/40 text-red-200 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{saveError}</span>
          </div>
          <button onClick={() => setSaveError(null)} className="text-red-300 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {saveFeedback && (
        <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveFeedback}</span>
          </div>
          <button onClick={() => setSaveFeedback(null)} className="text-emerald-300 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
            Facturas / Contratos
          </span>
          <span className="text-xl font-mono tabular-nums font-bold text-white mt-1 block">
            {visibleFacturas.length}
          </span>
          {totals.sinFacturarCount > 0 && (
            <span className="text-[10px] font-bold text-cyan-300 mt-0.5 block">
              {totals.emitidasCount} fact. · {totals.sinFacturarCount} sin facturar
            </span>
          )}
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
            Facturado Neto
          </span>
          <span className="text-lg font-mono tabular-nums font-bold text-amber-400 mt-1 block">
            {formatCurrency(totals.neto)}
          </span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
            Total c/ IVA
          </span>
          <span className="text-lg font-mono tabular-nums font-bold text-white mt-1 block">
            {formatCurrency(totals.total)}
          </span>
        </div>
        <div className="bg-slate-900/80 border border-emerald-500/20 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-emerald-400/80 font-bold block">
            Cobrado
          </span>
          <span className="text-lg font-mono tabular-nums font-bold text-emerald-400 mt-1 block">
            {formatCurrency(totals.cobrado)}
          </span>
        </div>
        <div className="bg-slate-900/80 border border-amber-500/20 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-amber-400/80 font-bold block">
            Pendiente Cobro
          </span>
          <span className="text-lg font-mono tabular-nums font-bold text-amber-300 mt-1 block">
            {formatCurrency(totals.pendiente)}
          </span>
        </div>
      </div>

      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div>
          <h4 className="text-white font-bold text-sm flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-400" />
            <span>Legajos de Facturación de la Obra</span>
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            {activeContenedor
              ? `Mostrando facturas del contenedor «${activeContenedor.titulo}» (${visibleFacturas.length} de ${facturas.length}).`
              : 'Cada factura vincula sus contratos de alquiler, cotizaciones, partes diarios y comprobantes escaneados (para agrupar por quincena o mes usá la pestaña Contenedores).'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {periodos.length > 0 && onChangeContenedorId && (
            <select
              value={activeContenedorId}
              onChange={(e) => onChangeContenedorId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              aria-label="Filtrar facturas por contenedor"
            >
              <option value="ALL">Todos los contenedores ({facturas.length})</option>
              {periodos.map((per) => (
                <option key={per.id} value={per.id}>
                  {per.titulo} ({facturas.filter((f) => f.periodoId === per.id).length})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => openNewForm(true)}
            disabled={isSaving}
            className="px-3.5 py-2.5 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 disabled:opacity-50 text-blue-200 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-2 shrink-0 whitespace-nowrap"
          >
            <Truck className="w-4 h-4" />
            <span>Cargar Contrato (Sin Facturar)</span>
          </button>
          <button
            type="button"
            onClick={() => openNewForm(false)}
            disabled={isSaving}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-2 shadow-md shadow-amber-500/15 shrink-0 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Cargar Factura + Legajo</span>
          </button>
        </div>
      </div>

      {/* Add / Edit Factura Legajo Form */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmitFactura}
          className="bg-[#111318] border border-amber-500/40 rounded-2xl p-5 space-y-5 shadow-2xl"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              {pendienteFacturacion ? (
                <Truck className="w-5 h-5 text-blue-400" />
              ) : (
                <FileText className="w-5 h-5 text-amber-400" />
              )}
              <h5 className="text-white font-bold text-sm">
                {editingFacturaId
                  ? pendienteFacturacion
                    ? 'Editar Contrato / Legajo (Sin Facturar)'
                    : 'Editar Factura y Legajo'
                  : pendienteFacturacion
                    ? 'Nuevo Contrato / Legajo de Obra (Pendiente de Facturar)'
                    : 'Nueva Factura con Legajo de Obra'}
              </h5>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-xl bg-slate-900 border border-slate-700 p-0.5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setPendienteFacturacion(false);
                    if (tipoComprobante === 'CONTRATO DE ALQUILER') {
                      setTipoComprobante('FACTURA A');
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    !pendienteFacturacion
                      ? 'bg-amber-500 text-black font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Factura / Certificado
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendienteFacturacion(true);
                    setTipoComprobante('CONTRATO DE ALQUILER');
                    setArcaInvoiceId('');
                  }}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    pendienteFacturacion
                      ? 'bg-blue-500 text-white font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Contrato sin Facturar
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  resetForm();
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {periodos.length > 0 && (
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Contenedor / Período Asignado (Opcional)
              </label>
              <select
                value={selectedPeriodoId}
                onChange={(e) => setSelectedPeriodoId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">-- Sin contenedor asignado --</option>
                {periodos.map((per) => (
                  <option key={per.id} value={per.id}>
                    {per.titulo}
                    {per.fechaDesde || per.fechaHasta
                      ? ` (${per.fechaDesde || '...'} / ${per.fechaHasta || '...'})`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Import from ARCA Invoices or Rental Contracts */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Importar desde Facturas ARCA emitidas (Opcional)</span>
                </label>
                <select
                  value={arcaInvoiceId}
                  onChange={(e) => handleImportArcaInvoice(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Carga manual / Seleccionar factura ARCA para autocompletar --</option>
                  {arcaInvoices.map((inv) => {
                    const resolvedInv = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
                    const pCount = resolvedInv.linkedPartes.length;
                    const rCount = resolvedInv.linkedRentals.length;
                    const extPrefix = isExternalMigratedInvoice(inv) ? '[OTRO SISTEMA] ' : '';
                    const linksTag = (pCount > 0 || rCount > 0)
                      ? ` [${[rCount > 0 ? `${rCount} contr.` : '', pCount > 0 ? `${pCount} parte${pCount !== 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')}]`
                      : '';
                    return (
                      <option key={inv.id} value={inv.id}>
                        {extPrefix}{inv.fecha} | {inv.tipoComprobante.replace(/_/g, ' ')} {pad4(inv.puntoVenta)}-
                        {pad8(inv.numeroComprobante)} | {inv.razonSocialReceptor} | {formatCurrency(inv.importeTotal)}{linksTag}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" />
                  <span>O llamar por Contrato de Alquiler (trae factura vinculada)</span>
                </label>
                <select
                  value={selectedImportRentalId}
                  onChange={(e) => handleImportFromRental(e.target.value)}
                  className="w-full bg-slate-950 border border-blue-500/35 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-400"
                >
                  <option value="">-- Elegir contrato de alquiler (llama factura si existe) --</option>
                  {rentals.map((r) => {
                    const rLinks = resolveRentalContractLinks(r, partesDiarios, arcaInvoices);
                    const invTag = rLinks.primaryInvoice ? `✓ Factura ${rLinks.facturaNumero}` : 'Sin facturar';
                    return (
                      <option key={r.id} value={r.id}>
                        {r.numeroContrato}{r.titulo ? ` · ${r.titulo}` : ''} | {r.equipoModelo} | {r.clienteNombre} | {formatCurrency(r.totalAlquiler)} ({invTag})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            {importNotice && (
              <div className="text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5">
                {importNotice}
              </div>
            )}
          </div>

          {/* Basic Invoice / Contract Data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Tipo Comprobante / Legajo
              </label>
              <select
                value={tipoComprobante}
                onChange={(e) => {
                  const val = e.target.value;
                  setTipoComprobante(val);
                  if (val === 'CONTRATO DE ALQUILER') {
                    setPendienteFacturacion(true);
                    setArcaInvoiceId('');
                  } else {
                    setPendienteFacturacion(false);
                  }
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="CONTRATO DE ALQUILER">CONTRATO DE ALQUILER (SIN FACTURAR)</option>
                <option value="FACTURA A">FACTURA A</option>
                <option value="FACTURA B">FACTURA B</option>
                <option value="FACTURA C">FACTURA C</option>
                <option value="FACTURA X">FACTURA X / INTERNA</option>
                <option value="CERTIFICADO DE OBRA">CERTIFICADO DE OBRA</option>
                <option value="NOTA DE CRÉDITO A">NOTA DE CRÉDITO A</option>
                <option value="NOTA DE CRÉDITO B">NOTA DE CRÉDITO B</option>
                <option value="NOTA DE CRÉDITO C">NOTA DE CRÉDITO C</option>
                <option value="NOTA DE CRÉDITO X">NOTA DE CRÉDITO X</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                {pendienteFacturacion ? 'Nro. Contrato / Ref. (Opcional)' : 'Nro. Comprobante *'}
              </label>
              <input
                type="text"
                required={!pendienteFacturacion}
                value={nroComprobante}
                onChange={(e) => setNroComprobante(e.target.value)}
                placeholder={pendienteFacturacion ? 'Opcional (ej. ALQ-0006)' : 'Ej. 0001-00000142'}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                {pendienteFacturacion ? 'Fecha de Carga / Contrato' : 'Fecha Emisión'}
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Estado de Cobro
              </label>
              {pendienteFacturacion ? (
                <div className="w-full bg-blue-500/10 border border-blue-500/35 rounded-xl px-3 py-2 text-xs text-blue-300 font-bold">
                  PENDIENTE DE FACTURAR
                </div>
              ) : (
                <select
                  value={estadoCobro}
                  onChange={(e) => setEstadoCobro(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="COBRADO_PARCIAL">COBRADO PARCIAL</option>
                  <option value="COBRADO">COBRADO</option>
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Origen / Tipo de Legajo
              </label>
              <select
                value={origen}
                onChange={(e) => setOrigen(e.target.value as ObraFacturaOrigen)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="ALQUILER_MAQUINA">Alquiler de Máquina (Contrato + Cotización)</option>
                <option value="PARTES_DIARIOS">Partes Diarios de Trabajo</option>
                <option value="MIXTO">Mixto (Alquiler + Partes Diarios)</option>
                <option value="CERTIFICADO_OBRA">Certificado de Obra</option>
                <option value="OTRO">Otro Concepto</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Concepto / Descripción {pendienteFacturacion ? '(Opcional)' : '*'}
              </label>
              <input
                type="text"
                required={!pendienteFacturacion}
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej. Alquiler Retroexcavadora + Certificación de horas primera quincena"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Importes */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
            {pendienteFacturacion && (
              <div className="text-[11px] text-blue-300/90 font-semibold">
                Importes opcionales mientras esté sin facturar (podés dejarlos en $ 0 y completarlos cuando cargues la factura).
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold uppercase text-slate-400">Neto Gravado ($)</label>
                  <button
                    type="button"
                    onClick={handleAutoIva21}
                    className="text-[10px] font-bold text-amber-400 hover:underline cursor-pointer"
                  >
                    + Calc IVA 21%
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={netoGravado}
                  onChange={(e) => handleNetoChange(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">IVA ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={ivaMonto}
                  onChange={(e) => handleIvaChange(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-emerald-400 mb-1">
                  Importe Total c/ IVA ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={importeTotal}
                  onChange={(e) => setImporteTotal(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-xs text-emerald-400 font-bold font-mono focus:outline-none focus:border-emerald-400"
                />
              </div>
            </div>
          </div>

          {/* LEGAJO LINKING: Contratos de Alquiler & Cotizaciones */}
          {(origen === 'ALQUILER_MAQUINA' || origen === 'MIXTO' || rentalIds.length > 0 || quotationIds.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Contratos de Alquiler */}
              <div className="bg-slate-900/70 border border-blue-500/30 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                    <Truck className="w-4 h-4" />
                    <span>Contratos de Alquiler ({rentalIds.length} seleccionados)</span>
                  </span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={rentalSearch}
                    onChange={(e) => setRentalSearch(e.target.value)}
                    placeholder="Buscar contrato, cliente o máquina..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {filteredRentals.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">Sin contratos coincidentes.</p>
                  ) : (
                    filteredRentals.map((r) => {
                      const checked = rentalIds.includes(r.id);
                      return (
                        <label
                          key={r.id}
                          className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                            checked
                              ? 'bg-blue-500/15 border-blue-500/50 text-white'
                              : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRentalSelection(r)}
                            className="mt-0.5 accent-blue-500 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-bold text-blue-300">
                                {r.numeroContrato}{r.titulo ? ` · ${r.titulo}` : ''}
                              </span>
                              <span className="font-mono text-emerald-400 font-bold">
                                {formatCurrency(r.totalAlquiler)}
                              </span>
                            </div>
                            <div className="truncate font-medium text-white">
                              {r.equipoCodigoInterno ? `[${r.equipoCodigoInterno}] ` : ''}
                              {r.equipoModelo}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {r.clienteNombre} • {r.fechaInicio} al {r.fechaDevolucionReal || r.fechaFinEstimada}
                              {r.cotizacionNumero ? ` • Cotiz. ${r.cotizacionNumero}` : ''}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Cotizaciones */}
              <div className="bg-slate-900/70 border border-purple-500/30 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <FileText className="w-4 h-4" />
                    <span>Cotizaciones Vinculadas ({quotationIds.length} seleccionadas)</span>
                  </span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={quotationSearch}
                    onChange={(e) => setQuotationSearch(e.target.value)}
                    placeholder="Buscar nro cotización, cliente o ítem..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {filteredQuotations.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">Sin cotizaciones coincidentes.</p>
                  ) : (
                    filteredQuotations.map((qt) => {
                      const checked = quotationIds.includes(qt.id);
                      const numFmt = `${pad4(qt.puntoVenta)}-${pad8(qt.numeroComprobante)}`;
                      return (
                        <label
                          key={qt.id}
                          className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                            checked
                              ? 'bg-purple-500/15 border-purple-500/50 text-white'
                              : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleQuotationSelection(qt.id)}
                            className="mt-0.5 accent-purple-500 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-bold text-purple-300">COT {numFmt}</span>
                              <span className="font-mono text-emerald-400 font-bold">
                                {formatCurrency(qt.importeTotal)}
                              </span>
                            </div>
                            <div className="truncate font-medium text-white">{qt.razonSocialReceptor}</div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {qt.fechaEmision} • {qt.items?.length || 0} ítems • Estado: {qt.estado}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* LEGAJO LINKING: Partes Diarios Adjuntos */}
          <div className="bg-slate-900/70 border border-amber-500/30 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4" />
                <span>Partes Diarios Adjuntos al Legajo ({parteDiarioIds.length} seleccionados)</span>
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowAllPartes((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition ${
                    showAllPartes
                      ? 'bg-amber-500 text-black border-amber-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  {showAllPartes
                    ? `Viendo todos (${partesDiarios.length})`
                    : `Solo de esta obra (${obraPartes.length}) — Ver todos`}
                </button>
                {filteredPartes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const visibleIds = filteredPartes.map((p) => p.id);
                      const allSelected = visibleIds.every((id) => parteDiarioIds.includes(id));
                      if (allSelected) {
                        setParteDiarioIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
                      } else {
                        setParteDiarioIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 cursor-pointer"
                  >
                    Seleccionar / Quitar visibles
                  </button>
                )}
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={parteSearch}
                onChange={(e) => setParteSearch(e.target.value)}
                placeholder="Filtrar partes por número, fecha, máquina u operario..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {filteredPartes.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  No se encontraron partes diarios {showAllPartes ? '' : 'asignados directamente a esta obra'}.
                </p>
              ) : (
                filteredPartes.map((p) => {
                  const checked = parteDiarioIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center justify-between gap-3 p-2 rounded-lg border text-xs cursor-pointer transition ${
                        checked
                          ? 'bg-amber-500/15 border-amber-500/50 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleParteSelection(p.id)}
                          className="accent-amber-500 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-amber-400">Parte #{p.numParte}</span>
                            <span className="font-mono text-slate-400">{p.fecha}</span>
                            <span className="text-white font-medium truncate">
                              {p.codigoEquipo} - {p.marcaModelo}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            Operario: {p.nombreApellido} • Obra: {p.obra || '-'}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-emerald-400 shrink-0">
                        {p.tipo === 'HORAS'
                          ? `${p.horasTrabajadas || p.hsCantidad || 0} hs`
                          : `${p.viajesCantidad || p.cantidad || 0} viajes`}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* LEGAJO DOCUMENTOS ADJUNTOS */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-amber-400" />
                <span>Documentación Adjunta al Legajo (PDF, Imágenes de Factura, Contratos, Remitos)</span>
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={newAdjuntoTipo}
                  onChange={(e) => setNewAdjuntoTipo(e.target.value as any)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="FACTURA">PDF/Foto Factura</option>
                  <option value="RESUMEN_VALORIZADO">Resumen Valorizado</option>
                  <option value="CONTRATO">Contrato Firmado</option>
                  <option value="COTIZACION">Cotización Aprobada</option>
                  <option value="PARTE_DIARIO">Parte Diario Escaneado</option>
                  <option value="REMITO">Remito</option>
                  <option value="OTRO">Otro Documento</option>
                </select>
                <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5">
                  {isUploadingFile ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>{isUploadingFile ? 'Subiendo...' : 'Adjuntar Archivo'}</span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isUploadingFile}
                  />
                </label>
              </div>
            </div>

            {(() => {
              const savedResumenes = (obra.resumenesValorizados || []).filter(
                (r) => r.pdfAdjunto?.url
              );
              if (savedResumenes.length === 0) return null;
              return (
                <div className="bg-slate-950/70 border border-amber-500/25 rounded-lg p-2.5 space-y-1.5">
                  <span className="text-[11px] font-bold text-amber-300 block">
                    Adjuntar Resumen Valorizado ya generado en esta obra (opcional):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {savedResumenes.map((res) => {
                      const pdf = res.pdfAdjunto!;
                      const alreadyLinked = adjuntos.some((a) => a.url === pdf.url);
                      return (
                        <button
                          key={res.id}
                          type="button"
                          disabled={alreadyLinked}
                          onClick={() => {
                            if (alreadyLinked) return;
                            setAdjuntos((prev) => [...prev, pdf]);
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                            alreadyLinked
                              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 cursor-default'
                              : 'bg-slate-900 hover:bg-amber-500/15 border-slate-700 hover:border-amber-500/40 text-slate-200 hover:text-amber-200'
                          }`}
                        >
                          <Paperclip className="w-3 h-3" />
                          <span>
                            {alreadyLinked ? '✓ Adjuntado: ' : '+ Adjuntar '}N° {res.numero} (
                            {formatCurrency(res.totalGeneral)})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {adjuntos.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {adjuntos.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 shrink-0">
                        {att.tipo}
                      </span>
                      {att.url.startsWith('http') && (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0">
                          R2
                        </span>
                      )}
                      <span className="text-slate-200 truncate">{att.nombre}</span>
                      {att.tamanio && <span className="text-slate-500 shrink-0">({att.tamanio})</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdjuntos((prev) => prev.filter((a) => a.id !== att.id))}
                      className="text-slate-400 hover:text-red-400 p-1 cursor-pointer"
                      title="Quitar adjunto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Observaciones del Legajo
            </label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas internas de facturación, certificación o condiciones..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                resetForm();
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`px-5 py-2 disabled:opacity-50 rounded-xl text-xs font-black cursor-pointer flex items-center gap-2 ${
                pendienteFacturacion
                  ? 'bg-blue-500 hover:bg-blue-400 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-black'
              }`}
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {editingFacturaId
                  ? 'Actualizar en Supabase'
                  : pendienteFacturacion
                    ? 'Guardar Contrato / Legajo (Sin Facturar)'
                    : 'Guardar Factura y Legajo'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* List of Period Containers & Factura Legajos */}
      {(() => {
        const renderFacturaCard = (f: ObraFacturaLegajo) => {
          const origenCfg = ORIGEN_LABELS[f.origen] || ORIGEN_LABELS.OTRO;
          const linkedRentals = rentals.filter((r) => (f.rentalIds || []).includes(r.id));
          const linkedQuotations = quotations.filter((q) => (f.quotationIds || []).includes(q.id));
          const linkedPartes = partesDiarios.filter((p) => (f.parteDiarioIds || []).includes(p.id));
          const isExpanded = expandedLegajoId === f.id;

          const sinFacturar = isLegajoSinFacturar(f);
          const liveStatus = resolveFacturaLegajoLiveStatus(
            f,
            arcaInvoices,
            customerReceipts,
            rentals,
            partesDiarios
          );
          const matchedArca = liveStatus.matchedArca;
          const isExtLegajo = isExternalMigratedInvoice(matchedArca || undefined);
          const invRecs = liveStatus.linkedReceipts;
          const effectiveEstadoCobro = liveStatus.estadoCobro;
          const isSyncedFromArca = Boolean(matchedArca || invRecs.length > 0);

          return (
            <div
              key={f.id}
              className={`bg-slate-900/80 border rounded-2xl p-4 space-y-3 transition ${
                sinFacturar
                  ? 'border-blue-500/40 hover:border-blue-400/60'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Header row */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-lg border ${
                          sinFacturar
                            ? 'text-blue-200 bg-blue-500/20 border-blue-400/50'
                            : isExtLegajo
                              ? 'text-orange-200 bg-orange-500/20 border-orange-400/50'
                              : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                        }`}>
                          {sinFacturar
                            ? `CONTRATO ${f.nroComprobante || 'SIN FACTURAR'}`
                            : `${f.tipoComprobante} ${f.nroComprobante}`}
                        </span>
                        {sinFacturar && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 uppercase">
                            PENDIENTE DE FACTURAR
                          </span>
                        )}
                        {isExtLegajo && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-orange-500/25 border border-orange-400/60 text-orange-200 uppercase">
                            ⚠️ OTRO SISTEMA
                          </span>
                        )}
                        <span className="font-mono text-xs text-slate-400">{f.fecha}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${origenCfg.color}`}>
                          {origenCfg.label}
                        </span>
                        {!sinFacturar && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isSyncedFromArca) {
                                if (invRecs.length > 0) setPreviewPaymentReceipt(invRecs[0]);
                                else if (matchedArca) setPreviewArcaInvoice(matchedArca);
                              } else {
                                handleToggleCobro(f);
                              }
                            }}
                            disabled={isSaving}
                            title={
                              isSyncedFromArca
                                ? 'Estado sincronizado automáticamente desde ARCA / Cobranzas (clic para ver detalle)'
                                : 'Clic para alternar Cobrado / Pendiente'
                            }
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded border cursor-pointer flex items-center gap-1 transition ${
                              effectiveEstadoCobro === 'COBRADO'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : effectiveEstadoCobro === 'COBRADO_PARCIAL'
                                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {effectiveEstadoCobro === 'COBRADO' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            <span>
                              {effectiveEstadoCobro === 'COBRADO'
                                ? 'PAGADO'
                                : effectiveEstadoCobro.replace('_', ' ')}
                            </span>
                          </button>
                        )}

                    {f.periodoTitulo && (
                      <span className="text-[11px] text-slate-400">
                        · Contenedor: <span className="text-slate-200 font-semibold">{f.periodoTitulo}</span>
                      </span>
                    )}
                  </div>
                  <h5 className="text-white font-semibold text-sm">{f.concepto}</h5>
                </div>

                <div className="flex items-center justify-between lg:justify-end gap-3">
                  <div className="text-right font-mono">
                    {sinFacturar ? (
                      <>
                        <div className="text-blue-300 font-bold text-sm">
                          {Number(f.importeTotal || 0) > 0
                            ? `${formatCurrency(f.importeTotal)} (Est.)`
                            : 'Sin facturar'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Aún sin factura emitida
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-emerald-400 font-bold text-base">
                          {formatCurrency(f.importeTotal)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Neto: {formatCurrency(f.netoGravado)} • IVA: {formatCurrency(f.ivaMonto)}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {matchedArca && (
                      <button
                        type="button"
                        onClick={() => setPreviewArcaInvoice(matchedArca)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-amber-300 border border-slate-700 hover:border-amber-500/40 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                        title="Consultar comprobante ARCA completo"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver Factura</span>
                      </button>
                    )}
                    {invRecs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPreviewPaymentReceipt(invRecs[0])}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                        title="Consultar Recibo de Pago"
                      >
                        <Banknote className="w-3.5 h-3.5" />
                        <span>{invRecs.length > 1 ? `Pagos (${invRecs.length})` : `Rec. ${invRecs[0].numeroRecibo}`}</span>
                      </button>
                    )}
                    {sinFacturar && (
                      <button
                        type="button"
                        onClick={() => openEditForm(f, true)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] font-black cursor-pointer flex items-center gap-1 whitespace-nowrap"
                        title="Cargar o vincular la factura emitida para este contrato"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Cargar Factura</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditForm(f, false)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-blue-500/20 text-slate-300 hover:text-blue-300 cursor-pointer"
                      title={sinFacturar ? 'Editar Contrato y Legajo' : 'Editar Factura y Legajo'}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {confirmDeleteId === f.id ? (
                      <div className="flex items-center gap-1 bg-red-500/20 border border-red-500/40 rounded-lg px-2 py-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteFactura(f.id)}
                          disabled={isSaving}
                          className="text-[11px] font-bold text-red-300 hover:text-white cursor-pointer"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[11px] text-slate-400 hover:text-white ml-1 cursor-pointer"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(f.id)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 cursor-pointer"
                        title="Eliminar Factura"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Legajo Badges Summary */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-xs">
                {linkedRentals.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 font-mono text-[11px]"
                  >
                    <Truck className="w-3 h-3" />
                    <span>
                      Contrato {r.numeroContrato} ({r.equipoCodigoInterno || r.equipoModelo})
                    </span>
                  </span>
                ))}

                {linkedQuotations.map((q) => (
                  <span
                    key={q.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 font-mono text-[11px]"
                  >
                    <FileText className="w-3 h-3" />
                    <span>
                      Cotización {pad4(q.puntoVenta)}-{pad8(q.numeroComprobante)}
                    </span>
                  </span>
                ))}

                {linkedPartes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedLegajoId(isExpanded ? null : f.id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[11px] hover:bg-amber-500/20 cursor-pointer"
                  >
                    <ClipboardList className="w-3 h-3" />
                    <span>{linkedPartes.length} Partes Diarios adjuntos</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}

                {(f.adjuntos || []).map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => setPreviewAdjunto(att)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:border-amber-500/40 text-[11px] cursor-pointer"
                  >
                    <Paperclip className="w-3 h-3 text-amber-400" />
                    <span>
                      {att.tipo}: {att.nombre}
                    </span>
                    <Eye className="w-3 h-3 text-slate-400" />
                  </button>
                ))}

                {linkedRentals.length === 0 &&
                  linkedQuotations.length === 0 &&
                  linkedPartes.length === 0 &&
                  (f.adjuntos || []).length === 0 && (
                    <span className="text-[11px] text-slate-500 italic">
                      Legajo sin respaldos vinculados aún (podés editar para adjuntar contratos, cotizaciones, partes o PDFs).
                    </span>
                  )}
              </div>

              {/* Expanded Attached Partes Diarios */}
              {isExpanded && linkedPartes.length > 0 && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <div className="text-[11px] font-bold uppercase text-amber-400 mb-1">
                    Detalle de Partes Diarios en este Legajo
                  </div>
                  {linkedPartes.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800/60 last:border-0"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-amber-300">#{p.numParte}</span>
                        <span className="font-mono text-slate-400">{p.fecha}</span>
                        <span className="text-white">
                          {p.codigoEquipo} - {p.marcaModelo}
                        </span>
                        <span className="text-slate-400">({p.nombreApellido})</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-400">
                        {p.tipo === 'HORAS'
                          ? `${p.horasTrabajadas || p.hsCantidad || 0} hs`
                          : `${p.viajesCantidad || p.cantidad || 0} viajes`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {f.observaciones && (
                <p className="text-xs text-slate-400 italic">Obs: {f.observaciones}</p>
              )}
            </div>
          );
        };

        return (
          <div className="space-y-5">
            {visibleFacturas.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-2">
                <Receipt className="w-9 h-9 text-slate-600 mx-auto mb-1" />
                <p className="text-slate-300 text-sm font-bold">
                  {activeContenedor
                    ? `No hay facturas asignadas manualmente al contenedor «${activeContenedor.titulo}».`
                    : 'No hay legajos manuales cargados todavía en esta obra.'}
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {fullLegajoSummary.linkedArcaInvoices.length > 0
                    ? `Se detectaron automáticamente ${fullLegajoSummary.linkedArcaInvoices.length} factura(s) y ${fullLegajoSummary.linkedReceipts.length} recibo(s) de pago vinculados por Partes Diarios / Contratos abajo.`
                    : 'Cargá una factura o importala desde ARCA vinculando partes diarios y contratos.'}
                </p>
                {activeContenedor && onChangeContenedorId && (
                  <button
                    type="button"
                    onClick={() => onChangeContenedorId('ALL')}
                    className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Ver toda la obra
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">{visibleFacturas.map(renderFacturaCard)}</div>
            )}

            {/* Sección Automática: Facturas ARCA y Pagos detectados vía Partes / Contratos / Legajo */}
            {(fullLegajoSummary.linkedArcaInvoices.length > 0 || fullLegajoSummary.linkedReceipts.length > 0) && (
              <div className="bg-slate-900/70 border border-emerald-500/30 rounded-2xl p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Banknote className="w-4 h-4 text-emerald-400" />
                      <h5 className="text-white font-bold text-sm">
                        Facturas y Pagos Detectados en el Circuito de la Obra
                      </h5>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          fullLegajoSummary.estadoLegajo === 'TERMINADA_PAGADA'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/45'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                        }`}
                      >
                        {fullLegajoSummary.estadoLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Comprobantes vinculados por Partes Diarios, Contratos de Alquiler o Legajo •{' '}
                      Facturado: <strong className="text-white font-mono">{formatCurrency(fullLegajoSummary.totalFacturado)}</strong> •{' '}
                      Cobrado: <strong className="text-emerald-400 font-mono">{formatCurrency(fullLegajoSummary.totalCobrado)}</strong> •{' '}
                      Saldo: <strong className={`font-mono ${fullLegajoSummary.saldoPendiente <= 0.5 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(fullLegajoSummary.saldoPendiente)}
                      </strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {onNavigateToCobranzas && (
                      <button
                        type="button"
                        onClick={onNavigateToCobranzas}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-xs font-bold cursor-pointer"
                      >
                        Ir a Cobranzas
                      </button>
                    )}
                  </div>
                </div>

                {/* Lista de Facturas ARCA Vinculadas */}
                {fullLegajoSummary.linkedArcaInvoices.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Facturas Vinculadas ({fullLegajoSummary.linkedArcaInvoices.length})
                    </div>
                    <div className="space-y-2">
                      {fullLegajoSummary.linkedArcaInvoices.map((inv) => {
                        const invNum = formatInvoiceNumber(inv);
                        const isPaid = isArcaInvoiceFullyPaid(inv, customerReceipts);
                        const isExt = isExternalMigratedInvoice(inv);
                        const invResolved = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
                        const invReceipts = fullLegajoSummary.linkedReceipts.filter(
                          (r) =>
                            (r.facturasIds || []).includes(inv.id) ||
                            (r.facturasNumeros || []).some(
                              (n) => String(n).trim().toUpperCase() === invNum.toUpperCase()
                            )
                        );
                        const invPartesCount = invResolved.linkedPartes.filter((p) =>
                          fullLegajoSummary.obraPartes.some((op) => op.id === p.id)
                        ).length;

                        return (
                          <div
                            key={inv.id}
                            className="bg-slate-950/75 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-black text-amber-300">
                                  {formatInvoiceLabel(inv)}
                                </span>
                                <span className="font-mono text-xs text-slate-400">{inv.fecha}</span>
                                {isExt && (
                                  <span className="px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-400/50 text-orange-200 text-[10px] font-bold">
                                    OTRO SISTEMA
                                  </span>
                                )}
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                    isPaid
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      : invResolved.montoCobrado > 0
                                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                      : 'bg-red-500/15 text-red-300 border-red-500/35'
                                  }`}
                                >
                                  {isPaid ? '✓ PAGADA 100%' : invResolved.montoCobrado > 0 ? 'COBRO PARCIAL' : 'PENDIENTE PAGO'}
                                </span>
                                {invPartesCount > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-mono font-bold">
                                    {invPartesCount} parte(s) de esta obra
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-300 truncate">
                                {inv.razonSocialReceptor || inv.receptorRazonSocial}
                                {inv.cae ? ` · CAE ${inv.cae}` : ''}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
                              <div className="text-right font-mono mr-1">
                                <div className="text-sm font-black text-white">
                                  {formatCurrency(inv.importeTotal || 0)}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {isPaid
                                    ? 'Saldo $ 0'
                                    : `Saldo: ${formatCurrency(invResolved.saldoPendiente)}`}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPreviewArcaInvoice(inv)}
                                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black cursor-pointer flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Consultar Factura</span>
                              </button>
                              {invReceipts.map((rec) => (
                                <button
                                  key={rec.id}
                                  type="button"
                                  onClick={() => setPreviewPaymentReceipt(rec)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold cursor-pointer flex items-center gap-1"
                                >
                                  <Banknote className="w-3.5 h-3.5" />
                                  <span>Rec. {rec.numeroRecibo}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Lista de Recibos de Cobranza Asociados */}
                {fullLegajoSummary.linkedReceipts.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                      Recibos de Pago / Cobranzas ({fullLegajoSummary.linkedReceipts.length})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {fullLegajoSummary.linkedReceipts.map((rec) => (
                        <div
                          key={rec.id}
                          className="bg-slate-950/75 border border-emerald-500/25 rounded-xl p-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-black text-emerald-300">
                                REC #{rec.numeroRecibo}
                              </span>
                              <span className="font-mono text-[11px] text-slate-400">{rec.fecha}</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-bold">
                                {rec.formaPago.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {rec.bancoReferencia || rec.cuentaDestinoNombre || rec.clienteNombre}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-black text-emerald-400 text-sm">
                              {formatCurrency(rec.totalImputado ?? rec.montoCobrado)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPreviewPaymentReceipt(rec)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-black cursor-pointer"
                            >
                              Ver Recibo
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Preview Factura ARCA & Recibo de Cobranza Modals */}
      <ObraFacturaPreviewModal
        invoice={previewArcaInvoice}
        allReceipts={customerReceipts}
        rentals={rentals}
        partesDiarios={partesDiarios}
        onClose={() => setPreviewArcaInvoice(null)}
        onInspectReceipt={(rec) => setPreviewPaymentReceipt(rec)}
        onNavigateToArca={onNavigateToArca}
        onNavigateToCobranzas={onNavigateToCobranzas}
      />

      <ObraReceiptPreviewModal
        receipt={previewPaymentReceipt}
        allInvoices={arcaInvoices}
        onClose={() => setPreviewPaymentReceipt(null)}
        onInspectInvoice={(inv) => {
          setPreviewPaymentReceipt(null);
          setPreviewArcaInvoice(inv);
        }}
        onNavigateToCobranzas={onNavigateToCobranzas}
      />

      {/* Preview Attachment Modal */}
      {previewAdjunto && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
            <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-sm font-bold text-white truncate">{previewAdjunto.nombre}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewAdjunto.url}
                  download={previewAdjunto.nombre}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Abrir / Descargar</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAdjunto(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-black/40 min-h-[360px]">
              {previewAdjunto.url.startsWith('data:application/pdf') ||
              previewAdjunto.nombre.toLowerCase().endsWith('.pdf') ||
              previewAdjunto.url.toLowerCase().includes('.pdf') ? (
                <iframe
                  src={previewAdjunto.url}
                  title={previewAdjunto.nombre}
                  className="w-full h-[65vh] rounded-lg border border-slate-800 bg-white"
                />
              ) : (
                <img
                  src={previewAdjunto.url}
                  alt={previewAdjunto.nombre}
                  className="max-w-full max-h-[65vh] object-contain rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
