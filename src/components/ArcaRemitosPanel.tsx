import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import {
  ArcaRemito,
  ArcaRemitoItem,
  ArcaConfig,
  ArcaCondicionIva,
  RemitoMotivoTraslado,
  Quotation,
  RentalContract,
  ArcaInvoice,
  Vehicle,
  Employee,
  Obra,
  ClientRecord,
  HardwareProduct,
  CommercialModuleScope
} from '../types';
import { resolveInvoiceModule } from '../services/salonConfig';
import { Logo } from './Logo';
import { ClientDirectoryModal } from './ClientDirectoryModal';
import {
  Truck,
  PlusCircle,
  Search,
  FileDown,
  Printer,
  Eye,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  MapPin,
  UserCheck,
  ShieldCheck,
  Link2,
  X,
  Check,
  Save,
  Package,
  PackageCheck,
  Clock,
  Users,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface ArcaRemitosPanelProps {
  config: ArcaConfig;
  onUpdateConfig: (nextConfig: ArcaConfig) => void;
  quotations?: Quotation[];
  rentals?: RentalContract[];
  invoices?: ArcaInvoice[];
  onSaveInvoices?: (invoices: ArcaInvoice[]) => void;
  clients?: ClientRecord[];
  hardwareProducts?: HardwareProduct[];
  fleet?: Vehicle[];
  drivers?: Employee[];
  obras?: Obra[];
  activeModuleScope?: CommercialModuleScope;
  autoOpenEmitModal?: boolean;
  onAutoOpenHandled?: () => void;
  preselectedInvoiceForRemito?: ArcaInvoice | null;
  onClearPreselectedInvoiceForRemito?: () => void;
}

const MOTIVO_LABELS: Record<RemitoMotivoTraslado, string> = {
  ENTREGA_VENTA_ARTICULOS: 'Entrega de Artículos / Venta Salón',
  ALQUILER_MAQUINARIA_OBRA: 'Alquiler de Maquinaria / Equipo en Obra',
  TRASLADO_SERVICIO_VIAL: 'Traslado por Servicio de Movimiento de Suelo / Vial',
  RETIRO_DEVOLUCION_EQUIPO: 'Retiro / Devolución de Equipo a Base',
  ENTREGA_ARIDOS_MATERIALES: 'Entrega de Áridos / Materiales / Insumos',
  TRASLADO_INTERNO_TALLER: 'Traslado Interno entre Obras / Base / Taller'
};

export const ArcaRemitosPanel: React.FC<ArcaRemitosPanelProps> = ({
  config,
  onUpdateConfig,
  quotations = [],
  rentals = [],
  invoices = [],
  onSaveInvoices,
  clients = [],
  hardwareProducts = [],
  fleet = [],
  drivers = [],
  obras = [],
  activeModuleScope = 'ALQUILERES',
  autoOpenEmitModal = false,
  onAutoOpenHandled,
  preselectedInvoiceForRemito = null,
  onClearPreselectedInvoiceForRemito
}) => {
  const isVentasScope = activeModuleScope === 'VENTAS_SALON';
  const ptoVtaRemito = Number(config.puntoVentaRemito || 8);

  const [remitos, setRemitos] = useState<ArcaRemito[]>([]);
  const [nextNumber, setNextNumber] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterEstado, setFilterEstado] = useState<string>('ALL');
  const [deliveredTypeFilter, setDeliveredTypeFilter] = useState<'ALL' | 'CON_FACTURA' | 'CON_REMITO'>('ALL');
  const [panelTab, setPanelTab] = useState<'pendientes' | 'entregados' | 'remitos'>(
    isVentasScope ? 'pendientes' : 'remitos'
  );
  const [scopeFilter, setScopeFilter] = useState<CommercialModuleScope | 'ALL'>(activeModuleScope);
  const [showCaiConfig, setShowCaiConfig] = useState<boolean>(false);
  const [isClientPickerOpen, setIsClientPickerOpen] = useState<boolean>(false);
  const [showQuickClients, setShowQuickClients] = useState<boolean>(false);
  const [quickClientSearch, setQuickClientSearch] = useState<string>('');
  const [localClients, setLocalClients] = useState<ClientRecord[]>(clients);

  useEffect(() => {
    setScopeFilter(activeModuleScope);
    if (activeModuleScope === 'VENTAS_SALON') {
      setPanelTab('pendientes');
    }
  }, [activeModuleScope]);

  useEffect(() => {
    if (clients.length > 0) setLocalClients(clients);
  }, [clients]);

  // CAI quick configuration state
  const [caiInput, setCaiInput] = useState<string>(config.caiRemito || '');
  const [vtoCaiInput, setVtoCaiInput] = useState<string>(config.vencimientoCaiRemito || '');
  const [caiSavedFeedback, setCaiSavedFeedback] = useState<boolean>(false);

  useEffect(() => {
    setCaiInput(config.caiRemito || '');
    setVtoCaiInput(config.vencimientoCaiRemito || '');
  }, [config.caiRemito, config.vencimientoCaiRemito]);

  // Emit Modal State
  const [isEmitModalOpen, setIsEmitModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [emitError, setEmitError] = useState<string | null>(null);

  // Form fields
  const [puntoVenta, setPuntoVenta] = useState<number>(ptoVtaRemito);
  const [fecha, setFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [letra, setLetra] = useState<'R' | 'X'>('R');

  // Receptor / Destinatario
  const [tipoDocReceptor, setTipoDocReceptor] = useState<'CUIT' | 'DNI' | 'CONSUMIDOR_FINAL'>('CUIT');
  const [nroDocReceptor, setNroDocReceptor] = useState<string>('');
  const [razonSocialReceptor, setRazonSocialReceptor] = useState<string>('');
  const [condicionIvaReceptor, setCondicionIvaReceptor] = useState<ArcaCondicionIva>('RESPONSABLE_INSCRIPTO');
  const [domicilioReceptor, setDomicilioReceptor] = useState<string>('');
  const [localidadReceptor, setLocalidadReceptor] = useState<string>('SAN SALVADOR DE JUJUY');
  const [obraDestino, setObraDestino] = useState<string>('');
  const [lugarEntrega, setLugarEntrega] = useState<string>('');
  const [isSearchingCuit, setIsSearchingCuit] = useState<boolean>(false);

  // Transporte / Logística
  const [motivoTraslado, setMotivoTraslado] = useState<RemitoMotivoTraslado>('ALQUILER_MAQUINARIA_OBRA');
  const [origenTraslado, setOrigenTraslado] = useState<string>('ALTE. BROWN 1560 - SAN SALVADOR DE JUJUY (BASE LA HORMIGA)');
  const [transportistaNombre, setTransportistaNombre] = useState<string>(config.razonSocial || 'EL HORNOCAL S.R.L.');
  const [transportistaCuit, setTransportistaCuit] = useState<string>(config.cuit || '30-71499982-2');
  const [choferNombre, setChoferNombre] = useState<string>('');
  const [choferDni, setChoferDni] = useState<string>('');
  const [vehiculoTransporte, setVehiculoTransporte] = useState<string>('');
  const [patenteChasis, setPatenteChasis] = useState<string>('');
  const [patenteAcoplado, setPatenteAcoplado] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');

  // Cross-references
  const [comprobanteAsociadoTexto, setComprobanteAsociadoTexto] = useState<string>('');
  const [selectedRentalId, setSelectedRentalId] = useState<string>('');
  const [selectedQuotationId, setSelectedQuotationId] = useState<string>('');
  const [selectedFacturaId, setSelectedFacturaId] = useState<string>('');
  const [selectedFleetToAdd, setSelectedFleetToAdd] = useState<string>('');

  // Items
  const [items, setItems] = useState<ArcaRemitoItem[]>([
    {
      codigo: 'EQ-01',
      descripcion: 'TRASLADO / ENTREGA DE MAQUINARIA EN OBRA',
      cantidad: 1,
      unidadMedida: 'UNI',
      detalleSerieOrInterno: ''
    }
  ]);

  // Detail / PDF Viewer Modal
  const [selectedRemitoForView, setSelectedRemitoForView] = useState<ArcaRemito | null>(null);
  const [remitoToDelete, setRemitoToDelete] = useState<ArcaRemito | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  // Delivery Confirmation Modal
  const [remitoToDeliver, setRemitoToDeliver] = useState<ArcaRemito | null>(null);
  const [recibidoNombreInput, setRecibidoNombreInput] = useState<string>('');
  const [recibidoDniInput, setRecibidoDniInput] = useState<string>('');

  const fetchRemitos = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/remitos/next-number?puntoVenta=${ptoVtaRemito}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.remitos)) {
          setRemitos(data.remitos);
        }
        if (data.nextNumeroComprobante) {
          setNextNumber(Number(data.nextNumeroComprobante));
        }
      }
    } catch (err) {
      console.warn('Error cargando remitos digitales:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRemitos();
  }, [ptoVtaRemito]);

  useEffect(() => {
    if (autoOpenEmitModal) {
      handleOpenNewRemitoModal();
      if (onAutoOpenHandled) onAutoOpenHandled();
    }
  }, [autoOpenEmitModal]);

  useEffect(() => {
    if (preselectedInvoiceForRemito) {
      handleOpenRemitoForInvoice(preselectedInvoiceForRemito);
      if (onClearPreselectedInvoiceForRemito) onClearPreselectedInvoiceForRemito();
    }
  }, [preselectedInvoiceForRemito]);

  const handleSaveCaiConfig = () => {
    const nextCfg: ArcaConfig = {
      ...config,
      puntoVentaRemito: Number(puntoVenta || 8),
      caiRemito: caiInput.trim(),
      vencimientoCaiRemito: vtoCaiInput.trim()
    };
    onUpdateConfig(nextCfg);
    setCaiSavedFeedback(true);
    setTimeout(() => setCaiSavedFeedback(false), 3000);
  };

  const applyClientToRemito = (c: ClientRecord) => {
    const clean = String(c.cuit || '').replace(/\D/g, '');
    setTipoDocReceptor(clean.length === 11 ? 'CUIT' : clean.length >= 7 ? 'DNI' : 'CONSUMIDOR_FINAL');
    setNroDocReceptor(clean || c.cuit || '0');
    setRazonSocialReceptor(c.razonSocial || '');
    const rawIva = String(c.condicionIva || '').toUpperCase();
    const normIva: ArcaCondicionIva = rawIva.includes('INSCRIPTO')
      ? 'RESPONSABLE_INSCRIPTO'
      : rawIva.includes('MONOTRIB')
        ? 'MONOTRIBUTO'
        : rawIva.includes('EXENTO')
          ? 'EXENTO'
          : 'CONSUMIDOR_FINAL';
    setCondicionIvaReceptor(normIva);
    if (c.domicilio) setDomicilioReceptor(c.domicilio);
    if (c.localidad) setLocalidadReceptor(c.localidad);
    const fullAddr = [c.domicilio, c.localidad].filter(Boolean).join(' - ');
    if (fullAddr) setLugarEntrega(fullAddr);
    setShowQuickClients(false);
    setQuickClientSearch('');
  };

  const handleAddHardwareProductItem = (productId: string) => {
    const prod = hardwareProducts.find(p => p.id === productId);
    if (!prod) return;
    const newItem: ArcaRemitoItem = {
      codigo: prod.codigoInterno || prod.codigo || String(items.length + 1).padStart(2, '0'),
      descripcion: prod.nombre + (prod.marca ? ` (${prod.marca})` : ''),
      cantidad: 1,
      unidadMedida: prod.unidadMedida || 'UNI',
      detalleSerieOrInterno: '',
      hardwareProductId: prod.id
    };
    setItems(prev => {
      if (prev.length === 1 && !prev[0].descripcion.trim()) {
        return [newItem];
      }
      return [...prev, newItem];
    });
  };

  const handleOpenNewRemitoModal = () => {
    setEmitError(null);
    setShowQuickClients(false);
    setQuickClientSearch('');
    setPuntoVenta(Number(config.puntoVentaRemito || 8));
    setFecha(new Date().toISOString().slice(0, 10));
    setLetra('R');
    setSelectedRentalId('');
    setSelectedQuotationId('');
    setSelectedFacturaId('');
    setComprobanteAsociadoTexto('');
    setRazonSocialReceptor('');
    setNroDocReceptor('');
    setDomicilioReceptor('');
    setLocalidadReceptor('SAN SALVADOR DE JUJUY');
    setObraDestino('');
    setLugarEntrega(isVentasScope ? 'RETIRO EN SALÓN / ENTREGA A DOMICILIO' : '');
    setMotivoTraslado(isVentasScope ? 'ENTREGA_VENTA_ARTICULOS' : 'ALQUILER_MAQUINARIA_OBRA');
    setTransportistaNombre(config.razonSocial || 'EL HORNOCAL S.R.L.');
    setTransportistaCuit(config.cuit || '30-71499982-2');
    setChoferNombre('');
    setChoferDni('');
    setVehiculoTransporte('');
    setPatenteChasis('');
    setPatenteAcoplado('');
    setObservaciones('');
    setItems([
      {
        codigo: '01',
        descripcion: '',
        cantidad: 1,
        unidadMedida: 'UNI',
        detalleSerieOrInterno: ''
      }
    ]);
    setIsEmitModalOpen(true);
  };

  const handleOpenRemitoForInvoice = (inv: ArcaInvoice) => {
    handleOpenNewRemitoModal();
    applyInvoiceToRemito(inv, true);
  };

  // Padrón CUIT Lookup
  const handleCuitLookup = async (cuitRaw: string) => {
    const clean = cuitRaw.replace(/\D/g, '');
    if (clean.length < 7 || clean.length > 11) return;
    setIsSearchingCuit(true);
    try {
      const res = await fetch(`/api/arca/padron/${clean}`);
      const data = await res.json();
      if (data && data.found && data.razonSocial) {
        setRazonSocialReceptor(data.razonSocial);
        if (data.cuit && String(data.cuit).length === 11) {
          setNroDocReceptor(String(data.cuit));
          setTipoDocReceptor('CUIT');
        }
        if (data.domicilio) {
          setDomicilioReceptor(data.domicilio);
          if (!lugarEntrega) setLugarEntrega(data.domicilio);
        }
        if (data.localidad) {
          setLocalidadReceptor(data.localidad);
        }
        if (data.condicionIva) {
          setCondicionIvaReceptor(data.condicionIva as ArcaCondicionIva);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsSearchingCuit(false);
    }
  };

  // Import from Rental Contract
  const applyRentalToRemito = (r: RentalContract) => {
    setSelectedRentalId(r.id);
    setSelectedQuotationId(r.cotizacionId || '');
    const cleanDoc = String(r.clienteDocumento || '').replace(/\D/g, '');
    setTipoDocReceptor(cleanDoc.length === 11 ? 'CUIT' : cleanDoc.length >= 7 ? 'DNI' : 'CONSUMIDOR_FINAL');
    setNroDocReceptor(cleanDoc || r.clienteDocumento || '');
    setRazonSocialReceptor(r.clienteNombre || '');
    setCondicionIvaReceptor((r.clienteCondicionIva as ArcaCondicionIva) || 'RESPONSABLE_INSCRIPTO');
    setDomicilioReceptor(r.direccionObra || '');
    setLocalidadReceptor(r.localidadObra || 'SAN SALVADOR DE JUJUY');
    setObraDestino(r.zonaObra || r.direccionObra || '');
    setLugarEntrega([r.direccionObra, r.localidadObra].filter(Boolean).join(' - '));
    setMotivoTraslado('ALQUILER_MAQUINARIA_OBRA');
    setComprobanteAsociadoTexto(
      [r.numeroContrato, r.cotizacionNumero ? `COT ${r.cotizacionNumero}` : '', r.facturaNumero ? `FACT ${r.facturaNumero}` : '']
        .filter(Boolean)
        .join(' • ')
    );
    if (r.operarioNombre) {
      setChoferNombre(r.operarioNombre);
    }

    const builtItems: ArcaRemitoItem[] = [
      {
        codigo: r.equipoCodigoInterno || r.equipoCodigo || 'EQ-01',
        descripcion: `${r.equipoModelo} (${r.modalidad === 'DIAS' ? `${r.duracion} DÍAS` : `${r.duracion} HORAS`})`,
        cantidad: 1,
        unidadMedida: 'UNI',
        detalleSerieOrInterno: [
          r.equipoPatenteOrCodigo ? `Dominio/Cód: ${r.equipoPatenteOrCodigo}` : '',
          r.horometroSalida ? `Horómetro Salida: ${r.horometroSalida} hs` : ''
        ]
          .filter(Boolean)
          .join(' | ')
      }
    ];

    if (Array.isArray(r.items) && r.items.length > 0) {
      setItems(
        r.items.map((it, idx) => ({
          codigo: it.codigo || String(idx + 1).padStart(2, '0'),
          descripcion: it.observacionLinea ? `${it.descripcion} (${it.observacionLinea})` : it.descripcion,
          cantidad: Number(it.cantidad || 1),
          unidadMedida: it.unidadMedida || 'UNI',
          detalleSerieOrInterno: r.equipoPatenteOrCodigo || ''
        }))
      );
    } else {
      setItems(builtItems);
    }

    if (cleanDoc.length === 11) {
      handleCuitLookup(cleanDoc);
    }
  };

  // Import from Quotation
  const applyQuotationToRemito = (q: Quotation) => {
    setSelectedQuotationId(q.id);
    const numStr = `${String(q.puntoVenta).padStart(4, '0')}-${String(q.numeroComprobante).padStart(8, '0')}`;
    const cleanDoc = String(q.cuitReceptor || '').replace(/\D/g, '');
    setTipoDocReceptor(cleanDoc.length === 11 ? 'CUIT' : cleanDoc.length >= 7 ? 'DNI' : 'CONSUMIDOR_FINAL');
    setNroDocReceptor(cleanDoc || q.cuitReceptor || '');
    setRazonSocialReceptor(q.razonSocialReceptor || '');
    setDomicilioReceptor(q.domicilioReceptor || '');
    setLocalidadReceptor(q.localidadReceptor || 'SAN SALVADOR DE JUJUY');
    setObraDestino(q.zonaReceptor || '');
    setLugarEntrega([q.domicilioReceptor, q.localidadReceptor].filter(Boolean).join(' - '));
    setComprobanteAsociadoTexto(`COT ${numStr}`);

    if (Array.isArray(q.items) && q.items.length > 0) {
      setItems(
        q.items.map((it, idx) => ({
          codigo: it.codigo || String(idx + 1).padStart(2, '0'),
          descripcion: it.observacionLinea ? `${it.descripcion} (${it.observacionLinea})` : it.descripcion,
          cantidad: Number(it.cantidad || 1),
          unidadMedida: it.unidadMedida || 'UNI',
          detalleSerieOrInterno: ''
        }))
      );
    }

    if (cleanDoc.length === 11) {
      handleCuitLookup(cleanDoc);
    }
  };

  // Import from Invoice (if onlyPending=true, loads ONLY pending quantities)
  const applyInvoiceToRemito = (inv: ArcaInvoice, onlyPending = true) => {
    setSelectedFacturaId(inv.id);
    const numStr = `${String(inv.puntoVenta).padStart(4, '0')}-${String(inv.numeroComprobante).padStart(8, '0')}`;
    setTipoDocReceptor(inv.tipoDocReceptor);
    setNroDocReceptor(inv.nroDocReceptor);
    setRazonSocialReceptor(inv.razonSocialReceptor);
    setCondicionIvaReceptor(inv.condicionIvaReceptor);
    setDomicilioReceptor(inv.domicilioReceptor || '');
    setLugarEntrega(inv.domicilioReceptor || 'RETIRO EN SALÓN / ENTREGA');
    setComprobanteAsociadoTexto(`${inv.tipoComprobante.replace(/_/g, ' ')} ${numStr}`);
    if (resolveInvoiceModule(inv) === 'VENTAS_SALON') {
      setMotivoTraslado('ENTREGA_VENTA_ARTICULOS');
    }

    if (Array.isArray(inv.items) && inv.items.length > 0) {
      const invMode = inv.modalidadEntrega || 'ENTREGA_CON_FACTURA';
      const mapped = inv.items
        .map((it, idx) => {
          const totalQty = Number(it.cantidad || 0);
          const delivered =
            typeof it.cantidadEntregada === 'number'
              ? it.cantidadEntregada
              : invMode === 'ENTREGA_CON_REMITOS'
                ? 0
                : totalQty;
          const pending = Math.max(0, Number((totalQty - delivered).toFixed(2)));
          return {
            codigo: it.codigo || String(idx + 1).padStart(2, '0'),
            descripcion: it.descripcion,
            cantidad: onlyPending && pending > 0 ? pending : totalQty,
            unidadMedida: it.unidadMedida || 'UNI',
            detalleSerieOrInterno: pending > 0 && pending < totalQty ? `Pendiente: ${pending} de ${totalQty}` : '',
            invoiceItemIdx: idx,
            hardwareProductId: it.hardwareProductId,
            _pending: pending
          };
        });

      const pendingOnly = onlyPending ? mapped.filter(m => m._pending > 0.0001) : mapped;
      const finalRows = (pendingOnly.length > 0 ? pendingOnly : mapped).map(({ _pending, ...rest }) => rest);
      setItems(finalRows);
    }
  };

  const handleAddFleetEquipmentItem = (vehicleId: string) => {
    const v = fleet.find(eq => eq.id === vehicleId);
    if (!v) return;
    const newItem: ArcaRemitoItem = {
      codigo: v.codigoInterno || v.id,
      descripcion: `${v.modeloMarca} (${v.clasificacion || 'Maquinaria'})`,
      cantidad: 1,
      unidadMedida: 'UNI',
      detalleSerieOrInterno: [
        v.patente ? `Patente/Serie: ${v.patente}` : '',
        v.horometro ? `Horómetro: ${v.horometro} hs` : ''
      ]
        .filter(Boolean)
        .join(' | ')
    };
    setItems(prev => {
      if (prev.length === 1 && !prev[0].descripcion.trim()) {
        return [newItem];
      }
      return [...prev, newItem];
    });
    setSelectedFleetToAdd('');
  };

  const handleUpdateItem = (index: number, field: keyof ArcaRemitoItem, value: any) => {
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddItemRow = () => {
    setItems(prev => [
      ...prev,
      {
        codigo: String(prev.length + 1).padStart(2, '0'),
        descripcion: '',
        cantidad: 1,
        unidadMedida: 'UNI',
        detalleSerieOrInterno: ''
      }
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleEmitRemitoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmitError(null);

    const validItems = items.filter(it => it.descripcion.trim().length > 0);
    if (!razonSocialReceptor.trim() || validItems.length === 0) {
      setEmitError('Completá la Razón Social del destinatario y al menos un equipo o ítem a trasladar.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Save CAI in config if user entered/updated it
      if (caiInput.trim() !== (config.caiRemito || '') || vtoCaiInput.trim() !== (config.vencimientoCaiRemito || '')) {
        onUpdateConfig({
          ...config,
          puntoVentaRemito: Number(puntoVenta || 8),
          caiRemito: caiInput.trim(),
          vencimientoCaiRemito: vtoCaiInput.trim()
        });
      }

      const linkedInvoice = selectedFacturaId ? invoices.find(i => i.id === selectedFacturaId) : undefined;
      const linkedFacturaNumero = linkedInvoice
        ? `${String(linkedInvoice.puntoVenta).padStart(4, '0')}-${String(linkedInvoice.numeroComprobante).padStart(8, '0')}`
        : undefined;

      const payload: Partial<ArcaRemito> = {
        puntoVenta: Number(puntoVenta || 8),
        codigoAfip: letra === 'R' ? '091' : '000',
        letra,
        fecha,
        cuitEmisor: config.cuit || '30-71499982-2',
        razonSocialEmisor: config.razonSocial || 'EL HORNOCAL S.R.L.',
        condicionIvaEmisor: config.condicionIva || 'RESPONSABLE_INSCRIPTO',
        tipoDocReceptor,
        nroDocReceptor: nroDocReceptor.trim() || '0',
        razonSocialReceptor: razonSocialReceptor.trim().toUpperCase(),
        condicionIvaReceptor,
        domicilioReceptor: domicilioReceptor.trim().toUpperCase(),
        localidadReceptor: localidadReceptor.trim().toUpperCase(),
        obraDestino: obraDestino.trim().toUpperCase() || undefined,
        lugarEntrega: (lugarEntrega.trim() || domicilioReceptor.trim()).toUpperCase(),
        motivoTraslado,
        origenTraslado: origenTraslado.trim().toUpperCase(),
        transportistaNombre: transportistaNombre.trim().toUpperCase(),
        transportistaCuit: transportistaCuit.trim(),
        choferNombre: choferNombre.trim().toUpperCase(),
        choferDni: choferDni.trim(),
        vehiculoTransporte: vehiculoTransporte.trim().toUpperCase(),
        patenteChasis: patenteChasis.trim().toUpperCase(),
        patenteAcoplado: patenteAcoplado.trim().toUpperCase() || undefined,
        items: validItems,
        observaciones: observaciones.trim() || undefined,
        comprobanteAsociadoTexto: comprobanteAsociadoTexto.trim() || undefined,
        cotizacionId: selectedQuotationId || undefined,
        rentalId: selectedRentalId || undefined,
        facturaId: selectedFacturaId || undefined,
        facturaNumero: linkedFacturaNumero,
        origenModulo: linkedInvoice ? resolveInvoiceModule(linkedInvoice) : activeModuleScope,
        cai: caiInput.trim() || config.caiRemito || 'PENDIENTE-SOLICITUD-CAI',
        vencimientoCai: vtoCaiInput.trim() || config.vencimientoCaiRemito || new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
        estadoEntrega: 'EMITIDO_EN_TRANSITO',
        createdAt: new Date().toISOString()
      };

      const res = await fetch('/api/remitos/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remito: payload, isEdit: false })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setEmitError(data.error || 'No se pudo emitir el Remito Digital.');
        return;
      }

      if (Array.isArray(data.remitos)) {
        setRemitos(data.remitos);
      } else if (data.remito) {
        setRemitos(prev => [data.remito, ...prev]);
      }

      // Sync delivered item quantities back to the linked Invoice!
      const emittedRem: ArcaRemito | undefined = data.remito;
      if (emittedRem && linkedInvoice && onSaveInvoices) {
        const remNumFormatted = `${String(emittedRem.puntoVenta || 8).padStart(5, '0')}-${String(emittedRem.numeroComprobante).padStart(8, '0')}`;
        const invMode = linkedInvoice.modalidadEntrega || 'ENTREGA_CON_REMITOS';
        const nextItems = (linkedInvoice.items || []).map((invIt, idx) => {
          const matchedRemItem = validItems.find(
            ri =>
              (typeof ri.invoiceItemIdx === 'number' && ri.invoiceItemIdx === idx) ||
              (typeof ri.invoiceItemIdx !== 'number' &&
                ((invIt.codigo && ri.codigo && invIt.codigo === ri.codigo) ||
                  invIt.descripcion.trim().toUpperCase() === ri.descripcion.trim().toUpperCase()))
          );
          if (!matchedRemItem) return invIt;

          const prevDelivered =
            typeof invIt.cantidadEntregada === 'number'
              ? invIt.cantidadEntregada
              : invMode === 'ENTREGA_CON_REMITOS'
                ? 0
                : Number(invIt.cantidad || 0);
          const addedQty = Math.max(0, Number(matchedRemItem.cantidad || 0));
          const nextDelivered = Math.min(Number(invIt.cantidad || 0), Number((prevDelivered + addedQty).toFixed(2)));
          const prevRefs = Array.isArray(invIt.remitosEntrega) ? invIt.remitosEntrega : [];
          return {
            ...invIt,
            cantidadEntregada: nextDelivered,
            remitosEntrega: [
              ...prevRefs,
              {
                remitoId: emittedRem.id,
                remitoNumero: remNumFormatted,
                fecha: emittedRem.fecha,
                cantidad: addedQty
              }
            ]
          };
        });

        const allDelivered = nextItems.every(
          it => Number(it.cantidadEntregada ?? 0) >= Number(it.cantidad || 0) - 0.001
        );
        const anyDelivered = nextItems.some(it => Number(it.cantidadEntregada ?? 0) > 0.001);
        const nextStatus = allDelivered
          ? 'ENTREGADO_TOTAL'
          : anyDelivered
            ? 'ENTREGA_PARCIAL'
            : 'PENDIENTE_ENTREGA';

        const updatedInv: ArcaInvoice = {
          ...linkedInvoice,
          modalidadEntrega: 'ENTREGA_CON_REMITOS',
          items: nextItems,
          estadoEntregaMercaderia: nextStatus,
          remitosVinculadosIds: Array.from(new Set([...(linkedInvoice.remitosVinculadosIds || []), emittedRem.id]))
        };
        onSaveInvoices(invoices.map(i => (i.id === updatedInv.id ? updatedInv : i)));
      }

      setNextNumber(Number(data.remito?.numeroComprobante || nextNumber) + 1);
      setIsEmitModalOpen(false);
      if (data.remito) {
        setSelectedRemitoForView(data.remito);
      }
    } catch (err: any) {
      setEmitError(err?.message || 'Error de red al emitir el Remito Digital.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!remitoToDeliver) return;
    const updatedRemito: ArcaRemito = {
      ...remitoToDeliver,
      estadoEntrega: 'ENTREGADO_CONFORME',
      recibidoPorNombre: recibidoNombreInput.trim().toUpperCase() || 'RECIBIDO CONFORME',
      recibidoPorDni: recibidoDniInput.trim() || undefined,
      fechaHoraRecepcion: new Date().toISOString()
    };

    try {
      const res = await fetch('/api/remitos/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remito: updatedRemito, isEdit: true })
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.remitos)) {
        setRemitos(data.remitos);
      } else {
        setRemitos(prev => prev.map(r => (r.id === updatedRemito.id ? updatedRemito : r)));
      }

      // Stamp recibidoPor onto linked invoice delivery ref
      if (updatedRemito.facturaId && onSaveInvoices) {
        const targetInv = invoices.find(i => i.id === updatedRemito.facturaId);
        if (targetInv) {
          const nextItems = (targetInv.items || []).map(it => ({
            ...it,
            remitosEntrega: (it.remitosEntrega || []).map(ref =>
              ref.remitoId === updatedRemito.id
                ? { ...ref, recibidoPor: updatedRemito.recibidoPorNombre }
                : ref
            )
          }));
          onSaveInvoices(invoices.map(i => (i.id === targetInv.id ? { ...targetInv, items: nextItems } : i)));
        }
      }
    } catch {
      setRemitos(prev => prev.map(r => (r.id === updatedRemito.id ? updatedRemito : r)));
    } finally {
      setRemitoToDeliver(null);
      setRecibidoNombreInput('');
      setRecibidoDniInput('');
    }
  };

  const handleDeleteRemito = async (id: string) => {
    const remObj = remitos.find(r => r.id === id);
    try {
      await fetch(`/api/arca_remitos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
    setRemitos(prev => prev.filter(r => r.id !== id));

    // Roll back delivered quantities on linked invoice if any
    if (remObj?.facturaId && onSaveInvoices) {
      const targetInv = invoices.find(i => i.id === remObj.facturaId);
      if (targetInv) {
        const nextItems = (targetInv.items || []).map(it => {
          const refs = Array.isArray(it.remitosEntrega) ? it.remitosEntrega : [];
          const removedQty = refs
            .filter(ref => ref.remitoId === id)
            .reduce((sum, ref) => sum + Number(ref.cantidad || 0), 0);
          const remainingRefs = refs.filter(ref => ref.remitoId !== id);
          if (removedQty <= 0 && remainingRefs.length === refs.length) return it;
          const nextDelivered = Math.max(0, Number(((it.cantidadEntregada ?? 0) - removedQty).toFixed(2)));
          return {
            ...it,
            cantidadEntregada: nextDelivered,
            remitosEntrega: remainingRefs
          };
        });
        const allDelivered = nextItems.every(it => Number(it.cantidadEntregada ?? 0) >= Number(it.cantidad || 0) - 0.001);
        const anyDelivered = nextItems.some(it => Number(it.cantidadEntregada ?? 0) > 0.001);
        const updatedInv: ArcaInvoice = {
          ...targetInv,
          items: nextItems,
          remitosVinculadosIds: (targetInv.remitosVinculadosIds || []).filter(rid => rid !== id),
          estadoEntregaMercaderia: allDelivered
            ? 'ENTREGADO_TOTAL'
            : anyDelivered
              ? 'ENTREGA_PARCIAL'
              : 'PENDIENTE_ENTREGA'
        };
        onSaveInvoices(invoices.map(i => (i.id === updatedInv.id ? updatedInv : i)));
      }
    }
    setRemitoToDelete(null);
  };

  // Generate Official A4 PDF for Remito R (Cód. 091) - Punto de Venta 00008
  const handleDownloadRemitoPdf = async (rem: ArcaRemito) => {
    setIsGeneratingPdf(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1240;
      canvas.height = 1754;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D context');

      const W = canvas.width;
      const H = canvas.height;

      // White A4 background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // Outer border
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.strokeRect(40, 40, W - 80, H - 80);

      // Top "ORIGINAL / DUPLICADO" banner
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(40, 40, W - 80, 46);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ORIGINAL • REMITO DIGITAL DE TRASLADO (RG ARCA 1415 / RG 5678/2025)', W / 2, 70);

      // Header Box (Y: 86 to 310)
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 86, W - 80, 224);

      // Center Letter "R" Box
      const boxW = 130;
      const boxH = 130;
      const boxX = W / 2 - boxW / 2;
      const boxY = 86;
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Vertical divider below center box
      ctx.beginPath();
      ctx.moveTo(W / 2, boxY + boxH);
      ctx.lineTo(W / 2, 310);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 68px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rem.letra || 'R', W / 2, boxY + 68);
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`COD. ${rem.codigoAfip || '091'}`, W / 2, boxY + 98);
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('NO VÁLIDO C/FACTURA', W / 2, boxY + 118);

      // Left Header: Company Details
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(rem.razonSocialEmisor || 'EL HORNOCAL S.R.L.', 65, 138);
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#b45309';
      ctx.fillText('LA HORMIGA • MAQUINARIA VIAL, ALQUILERES Y OBRAS', 65, 168);
      ctx.fillStyle = '#334155';
      ctx.font = '18px sans-serif';
      ctx.fillText('Domicilio Comercial: ALTE. BROWN 1560', 65, 202);
      ctx.fillText('Localidad: SAN SALVADOR DE JUJUY - JUJUY', 65, 230);
      ctx.fillText('Tel / Cel: 388-5932763 • Email: lahormiga.com.ar@gmail.com', 65, 258);
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText('IVA RESPONSABLE INSCRIPTO', 65, 290);

      // Right Header: Remito Number & Fiscal Info
      const rightStartX = W / 2 + 85;
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText('REMITO', rightStartX, 135);

      const formattedNum = `${String(rem.puntoVenta || 8).padStart(5, '0')}-${String(rem.numeroComprobante).padStart(8, '0')}`;
      ctx.font = 'bold 28px monospace';
      ctx.fillStyle = '#047857';
      ctx.fillText(`Nº ${formattedNum}`, rightStartX, 174);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`FECHA DE EMISIÓN: ${rem.fecha.split('-').reverse().join('/')}`, rightStartX, 208);
      ctx.font = '18px monospace';
      ctx.fillText(`C.U.I.T.: ${rem.cuitEmisor || '30-71499982-2'}`, rightStartX, 236);
      ctx.fillText('INGRESOS BRUTOS: A-1-37050', rightStartX, 262);
      ctx.fillText('INICIO DE ACTIVIDADES: 10/08/2015', rightStartX, 288);

      // Section 1: Destinatario / Cliente & Obra (Y: 310 to 490)
      ctx.strokeRect(40, 310, W - 80, 180);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(42, 312, W - 84, 34);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('1. DATOS DEL DESTINATARIO / CLIENTE Y LUGAR DE ENTREGA (OBRA)', 60, 335);

      ctx.font = 'bold 19px sans-serif';
      ctx.fillText(`SEÑOR(ES) / RAZÓN SOCIAL: ${rem.razonSocialReceptor}`, 60, 375);
      ctx.font = '18px monospace';
      ctx.fillText(`${rem.tipoDocReceptor}: ${rem.nroDocReceptor}`, 820, 375);

      ctx.font = '18px sans-serif';
      ctx.fillText(`DOMICILIO FISCAL: ${rem.domicilioReceptor || '-'} (${rem.localidadReceptor || 'JUJUY'})`, 60, 410);
      ctx.fillText(`CONDICIÓN IVA: ${rem.condicionIvaReceptor.replace(/_/g, ' ')}`, 820, 410);

      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(`OBRA / LUGAR DE ENTREGA: ${rem.obraDestino ? `${rem.obraDestino} — ` : ''}${rem.lugarEntrega || rem.domicilioReceptor || '-'}`, 60, 445);

      if (rem.comprobanteAsociadoTexto) {
        ctx.font = 'bold 17px monospace';
        ctx.fillStyle = '#0369a1';
        ctx.fillText(`COMPROBANTE / CONTRATO VINCULADO: ${rem.comprobanteAsociadoTexto}`, 60, 476);
      }

      // Section 2: Datos del Transporte y Traslado (Y: 490 to 660)
      ctx.strokeStyle = '#0f172a';
      ctx.strokeRect(40, 490, W - 80, 170);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(42, 492, W - 84, 34);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('2. DATOS DEL TRANSPORTE, CHOFER Y MOTIVO DEL TRASLADO', 60, 515);

      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`MOTIVO DEL TRASLADO: ${MOTIVO_LABELS[rem.motivoTraslado] || rem.motivoTraslado}`, 60, 554);
      ctx.font = '17px sans-serif';
      ctx.fillText(`ORIGEN DE SALIDA: ${rem.origenTraslado || 'BASE OPERATIVA LA HORMIGA'}`, 60, 586);
      ctx.fillText(`EMPRESA TRANSPORTISTA: ${rem.transportistaNombre || 'EL HORNOCAL S.R.L.'} (CUIT: ${rem.transportistaCuit || rem.cuitEmisor})`, 60, 616);
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(
        `CHOFER: ${rem.choferNombre || 'A DESIGNAR'}${rem.choferDni ? ` (DNI/CUIT: ${rem.choferDni})` : ''}   •   VEHÍCULO: ${rem.vehiculoTransporte || '-'}   •   PATENTE: ${rem.patenteChasis || '-'}${rem.patenteAcoplado ? ` / ACOPLADO: ${rem.patenteAcoplado}` : ''}`,
        60,
        646
      );

      // Section 3: Items Table (Y: 660 to 1260)
      ctx.strokeRect(40, 660, W - 80, 600);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(40, 660, W - 80, 42);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText('CÓDIGO', 60, 687);
      ctx.fillText('CANT.', 200, 687);
      ctx.fillText('UNIDAD', 290, 687);
      ctx.fillText('DESCRIPCIÓN DE EQUIPOS / MAQUINARIAS / MATERIALES REMITIDOS', 400, 687);

      let rowY = 735;
      ctx.fillStyle = '#0f172a';
      rem.items.forEach((it, idx) => {
        if (idx % 2 === 1) {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(44, rowY - 26, W - 88, 54);
        }
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 18px monospace';
        ctx.fillText(it.codigo || String(idx + 1).padStart(2, '0'), 60, rowY);
        ctx.fillText(String(it.cantidad), 210, rowY);
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(it.unidadMedida || 'UNI', 290, rowY);
        ctx.font = 'bold 19px sans-serif';
        ctx.fillText(it.descripcion.toUpperCase().slice(0, 62), 400, rowY);
        if (it.detalleSerieOrInterno) {
          ctx.font = '16px monospace';
          ctx.fillStyle = '#475569';
          ctx.fillText(`↳ ${it.detalleSerieOrInterno}`, 400, rowY + 22);
        }
        rowY += 60;
      });

      if (rem.observaciones) {
        ctx.fillStyle = '#fefce8';
        ctx.fillRect(55, 1180, W - 110, 65);
        ctx.strokeStyle = '#fde047';
        ctx.strokeRect(55, 1180, W - 110, 65);
        ctx.fillStyle = '#713f12';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`OBSERVACIONES / ESTADO DE ENTREGA: ${rem.observaciones.toUpperCase()}`, 70, 1218);
      }

      // Section 4: Conformidad de Recepción en Obra (Y: 1260 to 1470)
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 1260, W - 80, 210);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(42, 1262, W - 84, 34);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('3. CONFORMIDAD DE RECEPCIÓN EN OBRA / DESTINO', 60, 1285);

      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#334155';
      ctx.fillText(
        'Recibí conforme de EL HORNOCAL S.R.L. (LA HORMIGA) los equipos/bienes detallados en el presente remito en perfecto estado operativo.',
        60,
        1322
      );

      // Signature boxes
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      // Box 1: Firma Entregó (Chofer)
      ctx.beginPath();
      ctx.moveTo(80, 1425);
      ctx.lineTo(390, 1425);
      ctx.stroke();
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(`ENTREGÓ (CHOFER: ${rem.choferNombre || 'LA HORMIGA'})`, 95, 1448);

      // Box 2: Firma Recibió
      ctx.beginPath();
      ctx.moveTo(450, 1425);
      ctx.lineTo(790, 1425);
      ctx.stroke();
      ctx.fillText(
        rem.recibidoPorNombre ? `RECIBIÓ CONFORME: ${rem.recibidoPorNombre}` : 'FIRMA Y ACLARACIÓN (QUIEN RECIBE EN OBRA)',
        460,
        1448
      );

      // Box 3: DNI y Fecha/Hora
      ctx.beginPath();
      ctx.moveTo(840, 1425);
      ctx.lineTo(1160, 1425);
      ctx.stroke();
      ctx.fillText(
        rem.recibidoPorDni ? `DNI: ${rem.recibidoPorDni} • ENTREGADO` : 'DNI Nº / FECHA Y HORA DE RECEPCIÓN',
        855,
        1448
      );

      // Section 5: ARCA / AFIP Footer with CAI, Barcode & QR (Y: 1470 to 1714)
      const cuitClean = (rem.cuitEmisor || '30714999822').replace(/\D/g, '');
      const ptoPadded = String(rem.puntoVenta || 8).padStart(5, '0');
      const caiDigits = (rem.cai || '').replace(/\D/g, '').padStart(14, '0');
      const vtoDigits = (rem.vencimientoCai || '').replace(/\D/g, '');
      const barcodeStr = `${cuitClean}091${ptoPadded}${caiDigits}${vtoDigits}`;

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('ARCA / AFIP', 65, 1525);
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#047857';
      ctx.fillText('REMITO DIGITAL AUTORIZADO (CÓD. 091 - CLASE R)', 65, 1552);
      ctx.fillStyle = '#334155';
      ctx.font = '15px sans-serif';
      ctx.fillText(`Punto de Venta #${ptoPadded} • Emisión Digital RG 5678/2025`, 65, 1578);

      // Barcode visual bars
      let barX = 65;
      for (let i = 0; i < barcodeStr.length; i++) {
        const digit = Number(barcodeStr[i]) || 1;
        const barW = (digit % 3) + 2;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(barX, 1600, barW, 48);
        barX += barW + 3;
        ctx.fillRect(barX, 1600, 2, 48);
        barX += 5;
      }
      ctx.font = '15px monospace';
      ctx.fillText(barcodeStr, 65, 1670);

      // Right side CAI & Vto
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(`C.A.I. Nº: ${rem.cai || 'PENDIENTE DE CARGA'}`, W - 65, 1545);
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`FECHA DE VTO. C.A.I.: ${rem.vencimientoCai ? rem.vencimientoCai.split('-').reverse().join('/') : '-'}`, W - 65, 1585);
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('DOCUMENTO NO VÁLIDO COMO FACTURA', W - 65, 1620);

      // Draw QR Code
      const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
        JSON.stringify({
          ver: 1,
          fecha: rem.fecha,
          cuit: Number(cuitClean),
          ptoVta: rem.puntoVenta || 8,
          tipoCmp: 91,
          nroCmp: rem.numeroComprobante,
          receptor: rem.razonSocialReceptor,
          cuitReceptor: rem.nroDocReceptor,
          cai: rem.cai,
          vtoCai: rem.vencimientoCai
        })
      )}`;

      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      qrImg.src = qrDataUrl;
      await new Promise(resolve => {
        qrImg.onload = resolve;
        qrImg.onerror = resolve;
      });
      if (qrImg.complete && qrImg.naturalWidth > 0) {
        ctx.drawImage(qrImg, 560, 1505, 155, 155);
      }

      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
      pdf.save(`Remito_R_${formattedNum}_${rem.razonSocialReceptor.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}.pdf`);
    } catch (err) {
      console.error('Error generando PDF de Remito:', err);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const scopedInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (inv.resultado === 'RECHAZADO') return false;
      if (inv.tipoComprobante.startsWith('NOTA_CREDITO')) return false;
      if (scopeFilter === 'ALL') return true;
      return resolveInvoiceModule(inv) === scopeFilter;
    });
  }, [invoices, scopeFilter]);

  const pendingInvoicesData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list: Array<{
      invoice: ArcaInvoice;
      invoiceLabel: string;
      totalFacturado: number;
      totalEntregado: number;
      totalPendiente: number;
      items: Array<{
        idx: number;
        codigo: string;
        descripcion: string;
        unidadMedida: string;
        facturado: number;
        entregado: number;
        pendiente: number;
      }>;
    }> = [];

    for (const inv of scopedInvoices) {
      const invItems = Array.isArray(inv.items) ? inv.items : [];
      if (invItems.length === 0) continue;

      const isRemitoMode = inv.modalidadEntrega === 'ENTREGA_CON_REMITOS';
      const mapped = invItems.map((it, idx) => {
        const facturado = Number(it.cantidad || 0);
        const entregado =
          typeof it.cantidadEntregada === 'number'
            ? Number(it.cantidadEntregada)
            : isRemitoMode
              ? 0
              : facturado;
        const pendiente = Math.max(0, Number((facturado - entregado).toFixed(4)));
        return {
          idx,
          codigo: it.codigo || String(idx + 1).padStart(2, '0'),
          descripcion: it.descripcion || 'Artículo',
          unidadMedida: it.unidadMedida || 'UNI',
          facturado,
          entregado,
          pendiente
        };
      });

      const totalFacturado = mapped.reduce((s, it) => s + it.facturado, 0);
      const totalEntregado = mapped.reduce((s, it) => s + it.entregado, 0);
      const totalPendiente = mapped.reduce((s, it) => s + it.pendiente, 0);

      if (totalPendiente <= 0.001) continue;

      const invoiceLabel = `${inv.tipoComprobante.replace(/_/g, ' ')} ${String(inv.puntoVenta).padStart(4, '0')}-${String(inv.numeroComprobante).padStart(8, '0')}`;
      if (q) {
        const match =
          invoiceLabel.toLowerCase().includes(q) ||
          (inv.razonSocialReceptor || '').toLowerCase().includes(q) ||
          (inv.nroDocReceptor || '').toLowerCase().includes(q) ||
          mapped.some(
            it => it.descripcion.toLowerCase().includes(q) || it.codigo.toLowerCase().includes(q)
          );
        if (!match) continue;
      }

      list.push({
        invoice: inv,
        invoiceLabel,
        totalFacturado,
        totalEntregado,
        totalPendiente,
        items: mapped
      });
    }

    return list.sort((a, b) => (b.invoice.fecha || '').localeCompare(a.invoice.fecha || ''));
  }, [scopedInvoices, searchQuery]);

  const totalPendingItemsCount = useMemo(
    () => pendingInvoicesData.reduce((acc, entry) => acc + entry.items.filter(i => i.pendiente > 0.001).length, 0),
    [pendingInvoicesData]
  );

  const deliveredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows: Array<{
      key: string;
      fecha: string;
      facturaId: string;
      facturaLabel: string;
      cliente: string;
      cuit: string;
      codigo: string;
      descripcion: string;
      unidadMedida: string;
      cantidadEntregada: number;
      cantidadFacturada: number;
      tipoEntrega: 'CON_FACTURA' | 'CON_REMITO';
      remitoNumero: string;
      remitoId?: string;
      recibidoPor?: string;
    }> = [];

    for (const inv of scopedInvoices) {
      const invItems = Array.isArray(inv.items) ? inv.items : [];
      const facturaLabel = `${inv.tipoComprobante.replace(/_/g, ' ')} ${String(inv.puntoVenta).padStart(4, '0')}-${String(inv.numeroComprobante).padStart(8, '0')}`;
      const isRemitoMode = inv.modalidadEntrega === 'ENTREGA_CON_REMITOS';

      invItems.forEach((it, idx) => {
        const facturado = Number(it.cantidad || 0);
        if (!isRemitoMode) {
          const deliveredQty =
            typeof it.cantidadEntregada === 'number' ? Number(it.cantidadEntregada) : facturado;
          if (deliveredQty > 0.001) {
            rows.push({
              key: `${inv.id}-f-${idx}`,
              fecha: inv.fecha,
              facturaId: inv.id,
              facturaLabel,
              cliente: inv.razonSocialReceptor,
              cuit: inv.nroDocReceptor,
              codigo: it.codigo || String(idx + 1).padStart(2, '0'),
              descripcion: it.descripcion,
              unidadMedida: it.unidadMedida || 'UNI',
              cantidadEntregada: deliveredQty,
              cantidadFacturada: facturado,
              tipoEntrega: 'CON_FACTURA',
              remitoNumero: 'Entregado c/ Factura'
            });
          }
        } else {
          const refs = Array.isArray(it.remitosEntrega) ? it.remitosEntrega : [];
          if (refs.length > 0) {
            refs.forEach((ref, rIdx) => {
              rows.push({
                key: `${inv.id}-r-${idx}-${ref.remitoId}-${rIdx}`,
                fecha: ref.fecha || inv.fecha,
                facturaId: inv.id,
                facturaLabel,
                cliente: inv.razonSocialReceptor,
                cuit: inv.nroDocReceptor,
                codigo: it.codigo || String(idx + 1).padStart(2, '0'),
                descripcion: it.descripcion,
                unidadMedida: it.unidadMedida || 'UNI',
                cantidadEntregada: Number(ref.cantidad || 0),
                cantidadFacturada: facturado,
                tipoEntrega: 'CON_REMITO',
                remitoNumero: ref.remitoNumero,
                remitoId: ref.remitoId,
                recibidoPor: ref.recibidoPor
              });
            });
          } else if (Number(it.cantidadEntregada || 0) > 0.001) {
            rows.push({
              key: `${inv.id}-r-fallback-${idx}`,
              fecha: inv.fecha,
              facturaId: inv.id,
              facturaLabel,
              cliente: inv.razonSocialReceptor,
              cuit: inv.nroDocReceptor,
              codigo: it.codigo || String(idx + 1).padStart(2, '0'),
              descripcion: it.descripcion,
              unidadMedida: it.unidadMedida || 'UNI',
              cantidadEntregada: Number(it.cantidadEntregada || 0),
              cantidadFacturada: facturado,
              tipoEntrega: 'CON_REMITO',
              remitoNumero: 'Entrega c/ Remito'
            });
          }
        }
      });
    }

    return rows
      .filter(row => {
        if (deliveredTypeFilter !== 'ALL' && row.tipoEntrega !== deliveredTypeFilter) return false;
        if (!q) return true;
        return (
          row.facturaLabel.toLowerCase().includes(q) ||
          row.cliente.toLowerCase().includes(q) ||
          row.cuit.toLowerCase().includes(q) ||
          row.descripcion.toLowerCase().includes(q) ||
          row.codigo.toLowerCase().includes(q) ||
          row.remitoNumero.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [scopedInvoices, deliveredTypeFilter, searchQuery]);

  const filteredRemitos = useMemo(() => {
    return remitos.filter(r => {
      if (scopeFilter !== 'ALL') {
        const linkedInv = r.facturaId ? invoices.find(i => i.id === r.facturaId) : undefined;
        const remScope: CommercialModuleScope = r.origenModulo
          ? r.origenModulo
          : r.motivoTraslado === 'ENTREGA_VENTA_ARTICULOS'
            ? 'VENTAS_SALON'
            : linkedInv
              ? resolveInvoiceModule(linkedInv)
              : 'ALQUILERES';
        if (remScope !== scopeFilter) return false;
      }
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        r.id.toLowerCase().includes(q) ||
        r.razonSocialReceptor.toLowerCase().includes(q) ||
        r.nroDocReceptor.toLowerCase().includes(q) ||
        (r.obraDestino || '').toLowerCase().includes(q) ||
        (r.choferNombre || '').toLowerCase().includes(q) ||
        (r.patenteChasis || '').toLowerCase().includes(q) ||
        (r.comprobanteAsociadoTexto || '').toLowerCase().includes(q) ||
        r.items.some(it => it.descripcion.toLowerCase().includes(q));
      const matchEstado = filterEstado === 'ALL' ? true : r.estadoEntrega === filterEstado;
      return matchSearch && matchEstado;
    });
  }, [remitos, invoices, scopeFilter, searchQuery, filterEstado]);

  const selectableInvoicesForRemito = useMemo(() => {
    const base = isVentasScope
      ? invoices.filter(inv => resolveInvoiceModule(inv) === 'VENTAS_SALON' && inv.resultado !== 'RECHAZADO')
      : invoices.filter(inv => inv.resultado !== 'RECHAZADO');
    return [...base].sort((a, b) => {
      const aPend = a.modalidadEntrega === 'ENTREGA_CON_REMITOS' && a.estadoEntregaMercaderia !== 'ENTREGADO_TOTAL' ? 1 : 0;
      const bPend = b.modalidadEntrega === 'ENTREGA_CON_REMITOS' && b.estadoEntregaMercaderia !== 'ENTREGADO_TOTAL' ? 1 : 0;
      if (bPend !== aPend) return bPend - aPend;
      return (b.fecha || '').localeCompare(a.fecha || '');
    });
  }, [invoices, isVentasScope]);

  const quickFilteredClients = useMemo(() => {
    const q = quickClientSearch.trim().toLowerCase();
    return localClients
      .filter(
        c =>
          !q ||
          (c.razonSocial || '').toLowerCase().includes(q) ||
          (c.cuit || '').toLowerCase().includes(q) ||
          (c.domicilio || '').toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [localClients, quickClientSearch]);

  return (
    <div className="space-y-5">
      {/* Top Status & Collapsible CAI Configuration Card */}
      <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-emerald-950/40 border border-[#F0C800]/40 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-xl bg-[#F0C800]/15 border border-[#F0C800]/40 text-[#F0C800] shrink-0">
              <Truck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-wide">
                  {isVentasScope
                    ? `REMITOS & ENTREGAS DE MERCADERÍA — PTO. VTA. #${String(ptoVtaRemito).padStart(5, '0')}`
                    : `PUNTO DE VENTA #${String(ptoVtaRemito).padStart(5, '0')} — REMITOS DIGITALES ARCA (CLASE "R" • CÓD. 091)`}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  REMITO R • CÓD. 091
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {isVentasScope ? (
                  <>
                    Control de <b>ítems pendientes de entrega</b>, <b>ítems entregados</b> (con Factura o con Remitos parciales/totales) y emisión de Remitos Digitales ARCA. Próximo correlativo:{' '}
                    <b className="text-[#F0C800] font-mono">
                      {String(ptoVtaRemito).padStart(5, '0')}-{String(nextNumber).padStart(8, '0')}
                    </b>
                  </>
                ) : (
                  <>
                    Emisión directa de Remitos Digitales bajo <b>RG ARCA 5678/2025</b> para traslado de maquinaria vial, equipos en alquiler y entregas de mercadería. Próximo correlativo:{' '}
                    <b className="text-[#F0C800] font-mono">
                      {String(ptoVtaRemito).padStart(5, '0')}-{String(nextNumber).padStart(8, '0')}
                    </b>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowCaiConfig(v => !v)}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              CAI Pto. Vta. {ptoVtaRemito}
              {showCaiConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleOpenNewRemitoModal}
              className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-[#F0C800] hover:bg-amber-400 text-slate-950 transition shadow-lg shadow-amber-950/50 flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              + Emitir Remito Digital
            </button>
          </div>
        </div>

        {/* Collapsible CAI Configuration Bar */}
        {showCaiConfig && (
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-5">
              <label className="block text-[11px] font-bold text-[#F0C800] uppercase mb-1">
                Nº de C.A.I. Vigente (Punto de Venta {String(ptoVtaRemito).padStart(5, '0')} - Cód. 091 Remito R)
              </label>
              <input
                type="text"
                value={caiInput}
                onChange={e => setCaiInput(e.target.value)}
                placeholder="Ej: 75192837461928 (14 dígitos otorgados por ARCA)"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#F0C800]"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                Fecha de Vencimiento C.A.I.
              </label>
              <input
                type="date"
                value={vtoCaiInput}
                onChange={e => setVtoCaiInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#F0C800]"
              />
            </div>

            <div className="lg:col-span-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveCaiConfig}
                className="w-full px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {caiSavedFeedback ? (
                  <>
                    <Check className="w-4 h-4" /> ¡CAI Guardado en Punto de Venta {ptoVtaRemito}!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Guardar CAI del Pto. Vta. {ptoVtaRemito}
                  </>
                )}
              </button>
            </div>

            <div className="lg:col-span-12 text-[11px] text-slate-400 flex items-center gap-2 pt-1 border-t border-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                En ARCA entrá a <b>"Autorización de Impresión de Comprobantes"</b> → <b>"Solicitud de CAI"</b> → Punto de Venta {ptoVtaRemito} y comprobante <b>091 - REMITOS R</b>. Pegá el CAI aquí para incluirlo con código de barras y QR oficial en los PDFs.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs + Module Scope Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelTab('pendientes')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              panelTab === 'pendientes'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-950/40'
                : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-amber-500/40'
            }`}
          >
            <Clock className="w-4 h-4" />
            Pendientes de Entrega
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                panelTab === 'pendientes'
                  ? 'bg-slate-950/20 text-slate-950'
                  : totalPendingItemsCount > 0
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-slate-800 text-slate-400'
              }`}
            >
              {pendingInvoicesData.length} fact. / {totalPendingItemsCount} ítems
            </span>
          </button>

          <button
            type="button"
            onClick={() => setPanelTab('entregados')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              panelTab === 'entregados'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-950/40'
                : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-emerald-500/40'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            Ítems Entregados
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                panelTab === 'entregados'
                  ? 'bg-slate-950/20 text-slate-950'
                  : 'bg-emerald-500/15 text-emerald-300'
              }`}
            >
              {deliveredRows.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setPanelTab('remitos')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              panelTab === 'remitos'
                ? 'bg-[#F0C800] text-slate-950 shadow-lg shadow-amber-950/40'
                : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-[#F0C800]/40'
            }`}
          >
            <Truck className="w-4 h-4" />
            Remitos Emitidos
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                panelTab === 'remitos' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {filteredRemitos.length}
            </span>
          </button>
        </div>

        {/* Module Scope Filter */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start lg:self-auto">
          {(
            [
              { id: 'VENTAS_SALON', label: 'Solo Ventas' },
              { id: 'ALQUILERES', label: 'Solo Alquileres' },
              { id: 'ALL', label: 'Ver Todo' }
            ] as const
          ).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setScopeFilter(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                scopeFilter === opt.id
                  ? 'bg-slate-800 text-[#F0C800] border border-[#F0C800]/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Container */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-4 shadow-xl">
        {/* Shared Search & Filter Header */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={
                panelTab === 'pendientes'
                  ? 'Buscar factura pendiente, cliente, CUIT o artículo por entregar...'
                  : panelTab === 'entregados'
                    ? 'Buscar ítem entregado, factura, cliente o Nº de remito...'
                    : 'Buscar remito por número, cliente, CUIT, factura vinculada, chofer o artículo...'
              }
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
            />
          </div>

          {panelTab === 'entregados' && (
            <div className="flex items-center gap-1.5 w-full md:w-auto">
              {(
                [
                  { id: 'ALL', label: 'Todos' },
                  { id: 'CON_FACTURA', label: 'Con Factura' },
                  { id: 'CON_REMITO', label: 'Con Remitos' }
                ] as const
              ).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDeliveredTypeFilter(f.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    deliveredTypeFilter === f.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {panelTab === 'remitos' && (
            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={filterEstado}
                onChange={e => setFilterEstado(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-[#F0C800]"
              >
                <option value="ALL">Todos los Estados ({filteredRemitos.length})</option>
                <option value="EMITIDO_EN_TRANSITO">En Tránsito / En Obra</option>
                <option value="ENTREGADO_CONFORME">Entregado Conforme</option>
                <option value="ANULADO">Anulados</option>
              </select>
            </div>
          )}
        </div>

        {/* TAB 1: ÍTEMS PENDIENTES DE ENTREGA */}
        {panelTab === 'pendientes' && (
          <div className="space-y-4">
            {pendingInvoicesData.length === 0 ? (
              <div className="py-12 px-6 text-center rounded-xl border border-dashed border-slate-800 bg-slate-950/60 space-y-2">
                <PackageCheck className="w-10 h-10 text-emerald-400 mx-auto" />
                <div className="text-sm font-bold text-white">No hay ítems pendientes de entrega</div>
                <p className="text-xs text-slate-400 max-w-lg mx-auto">
                  Cuando emitás una factura o cargues una factura de otro sistema eligiendo la modalidad{' '}
                  <b className="text-amber-300">"Entrega con Remitos"</b>, todos sus artículos pendientes aparecerán acá para despachar de forma total o parcial.
                </p>
              </div>
            ) : (
              pendingInvoicesData.map(entry => {
                const pct =
                  entry.totalFacturado > 0
                    ? Math.min(100, Math.round((entry.totalEntregado / entry.totalFacturado) * 100))
                    : 0;
                return (
                  <div
                    key={entry.invoice.id}
                    className="bg-slate-950/80 border border-amber-500/30 rounded-2xl overflow-hidden shadow-lg"
                  >
                    <div className="px-4 py-3.5 bg-gradient-to-r from-amber-500/10 via-slate-950 to-slate-950 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs font-black">
                            {entry.invoiceLabel}
                          </span>
                          <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-[#F0C800]" />
                            {entry.invoice.fecha}
                          </span>
                          {entry.invoice.esMigradaOtroSistema && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                              {entry.invoice.sistemaOrigenNombre || 'Otro Sistema'}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-800 text-slate-200">
                            Avance: {pct}% ({entry.totalEntregado}/{entry.totalFacturado})
                          </span>
                        </div>
                        <div className="text-sm font-black text-white">
                          {entry.invoice.razonSocialReceptor}{' '}
                          <span className="text-xs font-mono font-normal text-slate-400">
                            • {entry.invoice.tipoDocReceptor}: {entry.invoice.nroDocReceptor}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenRemitoForInvoice(entry.invoice)}
                        className="px-4 py-2.5 rounded-xl bg-[#F0C800] hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wide flex items-center gap-2 transition shadow-md cursor-pointer shrink-0"
                      >
                        <Truck className="w-4 h-4" />
                        Emitir Remito de Entrega
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-900/80 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                            <th className="py-2 px-4">Código</th>
                            <th className="py-2 px-4">Artículo / Descripción</th>
                            <th className="py-2 px-3 text-center">Facturado</th>
                            <th className="py-2 px-3 text-center">Entregado</th>
                            <th className="py-2 px-3 text-center">Pendiente</th>
                            <th className="py-2 px-4 text-right">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {entry.items.map(it => (
                            <tr key={it.idx} className="hover:bg-slate-900/50">
                              <td className="py-2.5 px-4 font-mono text-slate-400">{it.codigo}</td>
                              <td className="py-2.5 px-4 font-bold text-white">{it.descripcion}</td>
                              <td className="py-2.5 px-3 text-center font-mono text-slate-300">
                                {it.facturado} {it.unidadMedida}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono text-emerald-400 font-bold">
                                {it.entregado} {it.unidadMedida}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-amber-300">
                                {it.pendiente} {it.unidadMedida}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                {it.pendiente <= 0.001 ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    ENTREGADO
                                  </span>
                                ) : it.entregado > 0 ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                    PARCIAL
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    PENDIENTE
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: ÍTEMS ENTREGADOS */}
        {panelTab === 'entregados' && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                  <th className="py-3 px-4">FECHA</th>
                  <th className="py-3 px-4">FACTURA</th>
                  <th className="py-3 px-4">CLIENTE</th>
                  <th className="py-3 px-4">ARTÍCULO / DESCRIPCIÓN</th>
                  <th className="py-3 px-3 text-center">CANT. ENTREGADA</th>
                  <th className="py-3 px-4">MODALIDAD / REMITO</th>
                  <th className="py-3 px-4">RECIBIÓ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {deliveredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      Todavía no hay ítems entregados registrados para el filtro seleccionado.
                    </td>
                  </tr>
                ) : (
                  deliveredRows.map(row => {
                    const matchedRemito = row.remitoId
                      ? remitos.find(r => r.id === row.remitoId)
                      : undefined;
                    return (
                      <tr key={row.key} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">{row.fecha}</td>
                        <td className="py-3 px-4 font-mono font-bold text-white whitespace-nowrap">
                          {row.facturaLabel}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{row.cliente}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{row.cuit}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-100">{row.descripcion}</div>
                          <div className="text-[10px] text-slate-400 font-mono">Cód: {row.codigo}</div>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-black text-emerald-400 whitespace-nowrap">
                          {row.cantidadEntregada} {row.unidadMedida}
                          {row.cantidadEntregada < row.cantidadFacturada && (
                            <div className="text-[10px] font-normal text-slate-400">
                              de {row.cantidadFacturada} fact.
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {row.tipoEntrega === 'CON_FACTURA' ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
                              <FileText className="w-3 h-3" /> Entregado c/ Factura
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!matchedRemito}
                              onClick={() => matchedRemito && setSelectedRemitoForView(matchedRemito)}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-black bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/40 inline-flex items-center gap-1 ${
                                matchedRemito ? 'hover:bg-[#F0C800] hover:text-slate-950 cursor-pointer' : ''
                              }`}
                            >
                              <Truck className="w-3 h-3" /> {row.remitoNumero}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-300 text-[11px]">
                          {row.recibidoPor || (row.tipoEntrega === 'CON_FACTURA' ? 'Retiro inmediato' : '—')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: REMITOS EMITIDOS */}
        {panelTab === 'remitos' && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                  <th className="py-3 px-4">REMITO Nº</th>
                  <th className="py-3 px-3">FECHA</th>
                  <th className="py-3 px-4">{isVentasScope ? 'CLIENTE & ENTREGA' : 'DESTINATARIO & OBRA'}</th>
                  <th className="py-3 px-4">TRANSPORTE / CHOFER</th>
                  <th className="py-3 px-4">{isVentasScope ? 'ARTÍCULOS ENTREGADOS' : 'EQUIPOS / ÍTEMS TRASLADADOS'}</th>
                  <th className="py-3 px-3 text-center">ESTADO</th>
                  <th className="py-3 px-4 text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      Cargando remitos digitales del Punto de Venta {String(ptoVtaRemito).padStart(5, '0')}...
                    </td>
                  </tr>
                ) : filteredRemitos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      No hay remitos emitidos para el filtro actual. Hacé clic en{' '}
                      <b className="text-[#F0C800]">"+ Emitir Remito Digital"</b> o despachá desde{' '}
                      <b className="text-amber-300">Pendientes de Entrega</b>.
                    </td>
                  </tr>
                ) : (
                  filteredRemitos.map(rem => {
                    const formattedNum = `${String(rem.puntoVenta || 8).padStart(5, '0')}-${String(rem.numeroComprobante).padStart(8, '0')}`;
                    return (
                      <tr key={rem.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono">
                          <div className="flex items-center gap-1.5 font-bold text-white text-sm">
                            <span className="px-2 py-0.5 rounded text-xs bg-[#F0C800]/20 text-[#F0C800] border border-[#F0C800]/40 font-black">
                              REM {rem.letra || 'R'}
                            </span>
                            <span>{formattedNum}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Cód. AFIP {rem.codigoAfip || '091'} • CAI: {rem.cai}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-[#F0C800]" />
                            {rem.fecha}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white">{rem.razonSocialReceptor}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {rem.tipoDocReceptor}: {rem.nroDocReceptor}
                          </div>
                          {(rem.obraDestino || rem.lugarEntrega) && (
                            <div className="text-[11px] text-amber-300 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span>{[rem.obraDestino, rem.lugarEntrega].filter(Boolean).join(' • ')}</span>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-200 flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            {rem.choferNombre || 'Retira Cliente / Sin chofer'}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {rem.vehiculoTransporte || 'Transporte Propio'}{' '}
                            {rem.patenteChasis ? `• Dom: ${rem.patenteChasis}` : ''}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="text-white font-medium">
                            {rem.items[0] ? `${rem.items[0].cantidad} ${rem.items[0].unidadMedida} • ${rem.items[0].descripcion}` : 'Sin detalle'}
                          </div>
                          {rem.items.length > 1 && (
                            <span className="text-[10px] text-[#F0C800] font-bold">
                              + {rem.items.length - 1} ítem(s) adicional(es)
                            </span>
                          )}
                          {(rem.facturaNumero || rem.comprobanteAsociadoTexto) && (
                            <div className="text-[10px] text-cyan-400 font-mono mt-0.5">
                              Ref: {rem.comprobanteAsociadoTexto || `FACT ${rem.facturaNumero}`}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3 text-center">
                          {rem.estadoEntrega === 'ENTREGADO_CONFORME' ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Entregado
                            </span>
                          ) : rem.estadoEntrega === 'ANULADO' ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-500/20 text-red-400 border border-red-500/30">
                              Anulado
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              En Tránsito
                            </span>
                          )}
                          {rem.recibidoPorNombre && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              Recibió: {rem.recibidoPorNombre}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {rem.estadoEntrega === 'EMITIDO_EN_TRANSITO' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRemitoToDeliver(rem);
                                  setRecibidoNombreInput(rem.recibidoPorNombre || '');
                                  setRecibidoDniInput(rem.recibidoPorDni || '');
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-600 hover:text-white transition text-[11px] font-bold border border-emerald-500/30 cursor-pointer"
                                title="Registrar conformidad de entrega"
                              >
                                ✓ Recibido
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedRemitoForView(rem)}
                              className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition cursor-pointer"
                              title="Ver Remito A4 / Descargar PDF"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadRemitoPdf(rem)}
                              className="p-1.5 rounded-lg bg-[#F0C800]/15 text-[#F0C800] hover:bg-[#F0C800] hover:text-slate-950 transition cursor-pointer"
                              title="Descargar PDF Directo"
                            >
                              <FileDown className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemitoToDelete(rem)}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition cursor-pointer"
                              title="Eliminar Remito"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Emitir Remito Digital ARCA */}
      {isEmitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Truck className="w-5 h-5 text-[#F0C800]" />
                <div>
                  <h3 className="text-base font-black text-white">
                    {isVentasScope
                      ? `Emitir Remito de Entrega (Ventas) — Pto. Vta. #${String(puntoVenta).padStart(5, '0')}`
                      : `Emitir Remito Digital ARCA — Punto de Venta #${String(puntoVenta).padStart(5, '0')} (Cód. 091 - Remito R)`}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Próximo comprobante a emitir:{' '}
                    <b className="text-[#F0C800] font-mono">
                      {String(puntoVenta).padStart(5, '0')}-{String(nextNumber).padStart(8, '0')}
                    </b>
                  </p>
                </div>
              </div>
              <button onClick={() => setIsEmitModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEmitRemitoSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {/* 1-CLICK IMPORT FROM INVOICES, QUOTATIONS (AND RENTALS ONLY IN ALQUILERES) */}
              <div className="p-4 bg-gradient-to-r from-amber-500/10 via-slate-950 to-emerald-500/10 border border-[#F0C800]/40 rounded-xl space-y-3">
                <div className="text-xs font-black text-[#F0C800] flex items-center gap-1.5 uppercase tracking-wider">
                  <Link2 className="w-4 h-4" />
                  {isVentasScope
                    ? '1. Vincular con Factura de Venta (descuenta ítems pendientes) o Cotización'
                    : '1. Llamar Datos en 1 Clic (Desde Alquiler, Cotización o Factura Emitida)'}
                </div>

                <div className={`grid grid-cols-1 ${isVentasScope ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-3`}>
                  {!isVentasScope && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Importar desde Contrato de Alquiler:
                      </label>
                      <select
                        value={selectedRentalId}
                        onChange={e => {
                          const rId = e.target.value;
                          if (!rId) {
                            setSelectedRentalId('');
                            return;
                          }
                          const found = rentals.find(r => r.id === rId);
                          if (found) applyRentalToRemito(found);
                        }}
                        className="w-full bg-slate-900 border border-emerald-500/40 rounded-xl px-2.5 py-2 text-xs text-white font-bold"
                      >
                        <option value="">-- Seleccionar Alquiler ({rentals.length}) --</option>
                        {rentals.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.numeroContrato} — {r.clienteNombre} ({r.equipoModelo})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-cyan-300 uppercase mb-1">
                      Importar desde Factura (carga ítems pendientes):
                    </label>
                    <select
                      value={selectedFacturaId}
                      onChange={e => {
                        const fId = e.target.value;
                        if (!fId) {
                          setSelectedFacturaId('');
                          return;
                        }
                        const found = invoices.find(inv => inv.id === fId);
                        if (found) applyInvoiceToRemito(found, true);
                      }}
                      className="w-full bg-slate-900 border border-cyan-500/40 rounded-xl px-2.5 py-2 text-xs text-white font-bold"
                    >
                      <option value="">-- Seleccionar Factura ({selectableInvoicesForRemito.length}) --</option>
                      {selectableInvoicesForRemito.map(inv => {
                        const pendCount = (inv.items || []).reduce((acc, it) => {
                          const f = Number(it.cantidad || 0);
                          const e =
                            typeof it.cantidadEntregada === 'number'
                              ? it.cantidadEntregada
                              : inv.modalidadEntrega === 'ENTREGA_CON_REMITOS'
                                ? 0
                                : f;
                          return acc + Math.max(0, f - e);
                        }, 0);
                        return (
                          <option key={inv.id} value={inv.id}>
                            {pendCount > 0 ? `[PEND. ${pendCount} u.] ` : ''}
                            {inv.tipoComprobante.replace(/_/g, ' ')} #{String(inv.puntoVenta).padStart(4, '0')}-{String(inv.numeroComprobante).padStart(8, '0')} — {inv.razonSocialReceptor}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      Importar desde Cotización:
                    </label>
                    <select
                      value={selectedQuotationId}
                      onChange={e => {
                        const qId = e.target.value;
                        if (!qId) {
                          setSelectedQuotationId('');
                          return;
                        }
                        const found = quotations.find(q => q.id === qId);
                        if (found) applyQuotationToRemito(found);
                      }}
                      className="w-full bg-slate-900 border border-[#F0C800]/40 rounded-xl px-2.5 py-2 text-xs text-white font-bold"
                    >
                      <option value="">-- Seleccionar Cotización ({quotations.length}) --</option>
                      {quotations.map(q => (
                        <option key={q.id} value={q.id}>
                          COT #{String(q.puntoVenta).padStart(4, '0')}-{String(q.numeroComprobante).padStart(8, '0')} — {q.razonSocialReceptor}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Comprobante Header */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Tipo de Remito *</label>
                  <select
                    value={letra}
                    onChange={e => setLetra(e.target.value as 'R' | 'X')}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    <option value="R">REMITO "R" OFICIAL ARCA (Cód. 091)</option>
                    <option value="X">REMITO "X" INTERNO (Entrega / Traslado)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Punto de Venta ARCA *</label>
                  <input
                    type="number"
                    required
                    value={puntoVenta}
                    onChange={e => setPuntoVenta(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-[#F0C800] font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Fecha de Emisión *</label>
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Comprobante Asociado</label>
                  <input
                    type="text"
                    value={comprobanteAsociadoTexto}
                    onChange={e => setComprobanteAsociadoTexto(e.target.value)}
                    placeholder={isVentasScope ? 'Ej: FACTURA A 0005-00000623' : 'Ej: ALQ-0001 / COT 0001-00000003'}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Destinatario / Cliente con Llamar Cliente (BD) */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    {isVentasScope
                      ? '2. Datos del Cliente y Lugar de Entrega'
                      : '2. Datos del Destinatario / Cliente y Obra de Destino'}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsClientPickerOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-[#F0C800] hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Llamar Cliente (BD)
                    </button>
                    {localClients.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowQuickClients(v => !v)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold border border-emerald-500/30 cursor-pointer"
                      >
                        Buscar Rápido ({localClients.length})
                      </button>
                    )}
                  </div>
                </div>

                {showQuickClients && (
                  <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-3 space-y-2">
                    <input
                      type="text"
                      value={quickClientSearch}
                      onChange={e => setQuickClientSearch(e.target.value)}
                      placeholder="Filtrar cliente guardado por Razón Social o CUIT..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                    />
                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-800">
                      {quickFilteredClients.length === 0 ? (
                        <div className="py-2 text-center text-[11px] text-slate-500">Sin coincidencias</div>
                      ) : (
                        quickFilteredClients.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => applyClientToRemito(c)}
                            className="w-full text-left px-2.5 py-2 hover:bg-slate-800 flex items-center justify-between gap-2 text-xs cursor-pointer"
                          >
                            <span className="font-bold text-white truncate">{c.razonSocial}</span>
                            <span className="font-mono text-[11px] text-emerald-400 shrink-0">{c.cuit}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-400">CUIT / DNI Receptor *</label>
                      <button
                        type="button"
                        onClick={() => handleCuitLookup(nroDocReceptor)}
                        disabled={isSearchingCuit}
                        className="text-[10px] font-bold text-emerald-400 hover:underline cursor-pointer"
                      >
                        {isSearchingCuit ? 'Buscando...' : '🔍 Buscar Padrón ARCA'}
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={nroDocReceptor}
                      onChange={e => setNroDocReceptor(e.target.value)}
                      onBlur={e => {
                        if (e.target.value.replace(/\D/g, '').length >= 7) {
                          handleCuitLookup(e.target.value);
                        }
                      }}
                      placeholder="Ej: 30-70996180-9"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="md:col-span-5">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Cliente / Razón Social *</label>
                    <input
                      type="text"
                      required
                      value={razonSocialReceptor}
                      onChange={e => setRazonSocialReceptor(e.target.value)}
                      placeholder="Razón Social o Nombre del Cliente"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-bold"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Condición IVA</label>
                    <select
                      value={condicionIvaReceptor}
                      onChange={e => setCondicionIvaReceptor(e.target.value as ArcaCondicionIva)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                    >
                      <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                      <option value="MONOTRIBUTO">Monotributo</option>
                      <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
                      <option value="EXENTO">Exento</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Domicilio Fiscal Cliente</label>
                    <input
                      type="text"
                      value={domicilioReceptor}
                      onChange={e => setDomicilioReceptor(e.target.value)}
                      placeholder="Calle y Número"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold text-[#F0C800] mb-1">
                      {isVentasScope ? 'Referencia / Destino (Opcional)' : 'Obra de Destino (Seleccionar o escribir)'}
                    </label>
                    <div className="flex gap-1.5">
                      {!isVentasScope && (
                        <select
                          value=""
                          onChange={e => {
                            const found = obras.find(o => o.id === e.target.value);
                            if (found) {
                              setObraDestino(found.nombreObra);
                              setLugarEntrega(found.ubicacion || found.nombreObra);
                              if (!razonSocialReceptor && found.pertenece) {
                                setRazonSocialReceptor(found.pertenece);
                              }
                            }
                          }}
                          className="w-28 bg-slate-900 border border-[#F0C800]/40 rounded-lg px-2 py-2 text-[11px] text-[#F0C800] font-bold shrink-0"
                        >
                          <option value="">Obras BD...</option>
                          {obras.map(o => (
                            <option key={o.id} value={o.id}>
                              {o.nombreObra}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        type="text"
                        value={obraDestino}
                        onChange={e => setObraDestino(e.target.value)}
                        placeholder={isVentasScope ? 'Ej: Retiro Mostrador / Depósito Cliente' : 'Ej: Obra Parque Industrial'}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      {isVentasScope ? 'Lugar / Dirección de Entrega *' : 'Dirección Exacta de Entrega / Obra *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={lugarEntrega}
                      onChange={e => setLugarEntrega(e.target.value)}
                      placeholder={isVentasScope ? 'Retiro en Salón o Dirección de entrega' : 'Dirección de descarga en obra'}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Datos de Transporte y Chofer */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#F0C800] flex items-center gap-1.5">
                  <Truck className="w-4 h-4" />
                  3. Datos del Transporte, Chofer y Motivo del Traslado
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Motivo del Traslado *</label>
                    <select
                      value={motivoTraslado}
                      onChange={e => setMotivoTraslado(e.target.value as RemitoMotivoTraslado)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-bold"
                    >
                      {Object.entries(MOTIVO_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Lugar de Origen / Salida *</label>
                    <input
                      type="text"
                      value={origenTraslado}
                      onChange={e => setOrigenTraslado(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-5">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Chofer / Persona que Retira o Traslada</label>
                    <div className="flex gap-1.5">
                      <select
                        value=""
                        onChange={e => {
                          const d = drivers.find(dr => dr.id === e.target.value);
                          if (d) {
                            setChoferNombre(d.nombreApellido || d.nombre || '');
                            setChoferDni(d.dni || d.cuit || '');
                          }
                        }}
                        className="w-32 bg-slate-900 border border-emerald-500/40 rounded-lg px-2 py-2 text-[11px] text-emerald-400 font-bold shrink-0"
                      >
                        <option value="">Nómina BD...</option>
                        {drivers.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.nombreApellido || d.nombre}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={choferNombre}
                        onChange={e => setChoferNombre(e.target.value)}
                        placeholder="Nombre y Apellido"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">DNI / CUIT</label>
                    <input
                      type="text"
                      value={choferDni}
                      onChange={e => setChoferDni(e.target.value)}
                      placeholder="DNI / CUIT"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Vehículo / Transporte</label>
                    <div className="flex gap-1.5">
                      {!isVentasScope && (
                        <select
                          value=""
                          onChange={e => {
                            const v = fleet.find(eq => eq.id === e.target.value);
                            if (v) {
                              setVehiculoTransporte(v.modeloMarca);
                              setPatenteChasis(v.patente || v.codigoInterno || '');
                            }
                          }}
                          className="w-24 bg-slate-900 border border-[#F0C800]/40 rounded-lg px-1.5 py-2 text-[11px] text-[#F0C800] font-bold shrink-0"
                        >
                          <option value="">Flota...</option>
                          {fleet.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.modeloMarca} ({v.patente || v.id})
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        type="text"
                        value={vehiculoTransporte}
                        onChange={e => setVehiculoTransporte(e.target.value)}
                        placeholder={isVentasScope ? 'Ej: Retira Cliente / Flete' : 'Ej: Mercedes Benz 1720'}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Patente / Dominio</label>
                    <input
                      type="text"
                      value={patenteChasis}
                      onChange={e => setPatenteChasis(e.target.value)}
                      placeholder="Ej: AF 123 CD"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Detalle de Artículos / Equipos a Remitir */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-[#F0C800]" />
                    {isVentasScope
                      ? '4. Detalle de Artículos / Mercadería a Entregar (editá cantidad para entregas parciales)'
                      : '4. Detalle de Maquinarias, Equipos o Materiales Trasladados'}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isVentasScope ? (
                      hardwareProducts.length > 0 && (
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) handleAddHardwareProductItem(e.target.value);
                          }}
                          className="bg-slate-900 border border-emerald-500/50 rounded-lg px-3 py-1.5 text-xs text-emerald-300 font-bold max-w-[260px]"
                        >
                          <option value="">+ Agregar Artículo de Ventas ({hardwareProducts.length})...</option>
                          {hardwareProducts.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.codigoInterno || p.codigo} — {p.nombre}
                            </option>
                          ))}
                        </select>
                      )
                    ) : (
                      <select
                        value={selectedFleetToAdd}
                        onChange={e => handleAddFleetEquipmentItem(e.target.value)}
                        className="bg-slate-900 border border-[#F0C800]/50 rounded-lg px-3 py-1.5 text-xs text-[#F0C800] font-bold"
                      >
                        <option value="">+ Agregar Máquina / Equipo de la Flota...</option>
                        {fleet.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.modeloMarca} — Patente/Cód: {v.patente || v.codigoInterno || v.id}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white border border-slate-700 cursor-pointer"
                    >
                      + Agregar Renglón Libre
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                      <div className="col-span-2">
                        <label className="block text-[10px] text-slate-400">Código</label>
                        <input
                          type="text"
                          value={item.codigo}
                          onChange={e => handleUpdateItem(idx, 'codigo', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </div>

                      <div className="col-span-4">
                        <label className="block text-[10px] text-slate-400">
                          {isVentasScope ? 'Descripción del Artículo *' : 'Descripción del Equipo / Material *'}
                        </label>
                        <input
                          type="text"
                          required
                          value={item.descripcion}
                          onChange={e => handleUpdateItem(idx, 'descripcion', e.target.value)}
                          placeholder={isVentasScope ? 'Ej: Amoladora Angular 7" Bosch' : 'Ej: Minicargadora Bobcat S570 c/ balde'}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-bold"
                        />
                      </div>

                      <div className="col-span-1">
                        <label className="block text-[10px] text-slate-400">Cant.</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={item.cantidad}
                          onChange={e => handleUpdateItem(idx, 'cantidad', parseFloat(e.target.value) || 1)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </div>

                      <div className="col-span-1">
                        <label className="block text-[10px] text-slate-400">Unidad</label>
                        <input
                          type="text"
                          value={item.unidadMedida}
                          onChange={e => handleUpdateItem(idx, 'unidadMedida', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </div>

                      <div className="col-span-3">
                        <label className="block text-[10px] text-slate-400">
                          {isVentasScope ? 'Nota / Lote / Detalle' : 'Serie / Patente / Horómetro Salida'}
                        </label>
                        <input
                          type="text"
                          value={item.detalleSerieOrInterno || ''}
                          onChange={e => handleUpdateItem(idx, 'detalleSerieOrInterno', e.target.value)}
                          placeholder={isVentasScope ? 'Ej: Entrega parcial 1/2' : 'Ej: Patente AF123CD | Horóm: 3420 hs'}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-amber-300 font-mono"
                        />
                      </div>

                      <div className="col-span-1 flex justify-end pt-4">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          disabled={items.length <= 1}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    {isVentasScope
                      ? 'Observaciones de Entrega (Bultos, horario, persona autorizada a retirar)'
                      : 'Observaciones / Accesorios Entregados (Martillo, Balde, Nivel de Combustible, Estado General)'}
                  </label>
                  <input
                    type="text"
                    value={observaciones}
                    onChange={e => setObservaciones(e.target.value)}
                    placeholder={
                      isVentasScope
                        ? 'Ej: Retira mercadería en mostrador sin cargo de envío.'
                        : 'Ej: Se entrega equipo con tanque lleno, matafuegos vigente y balde estándar.'
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {emitError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{emitError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEmitModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl text-xs font-black uppercase bg-[#F0C800] hover:bg-amber-400 text-slate-950 transition shadow-lg shadow-amber-950/50 flex items-center gap-2 cursor-pointer"
                >
                  <Truck className="w-4 h-4" />
                  {isSubmitting
                    ? 'Emitiendo Remito...'
                    : `Emitir Remito Digital ${String(puntoVenta).padStart(5, '0')}-${String(nextNumber).padStart(8, '0')}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Vista Previa A4 y Descarga PDF de Remito Digital */}
      {selectedRemitoForView && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-300 my-8">
            {/* Top Action Bar */}
            <div className="bg-slate-900 text-white px-6 py-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-[#F0C800]" />
                <span className="font-bold text-sm">
                  REMITO DIGITAL ARCA Nº {String(selectedRemitoForView.puntoVenta || 8).padStart(5, '0')}-{String(selectedRemitoForView.numeroComprobante).padStart(8, '0')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadRemitoPdf(selectedRemitoForView)}
                  disabled={isGeneratingPdf}
                  className="px-3.5 py-1.5 rounded-xl bg-[#F0C800] hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  {isGeneratingPdf ? 'Generando PDF...' : 'Descargar PDF A4'}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRemitoForView(null)}
                  className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable A4 Sheet */}
            <div className="p-6 bg-white text-slate-900 space-y-4 font-sans text-xs">
              <div className="border-2 border-slate-900">
                <div className="bg-slate-900 text-white text-center py-1 font-bold text-[11px] uppercase tracking-wider">
                  ORIGINAL • REMITO DIGITAL DE TRASLADO (RG ARCA 1415 / RG 5678/2025) • DOCUMENTO NO VÁLIDO COMO FACTURA
                </div>

                {/* Header Grid */}
                <div className="grid grid-cols-12 border-b-2 border-slate-900">
                  <div className="col-span-5 p-3 border-r-2 border-slate-900 flex items-center gap-3">
                    <div className="w-16 shrink-0">
                      <Logo theme="light" variant="mascot" size="sm" />
                    </div>
                    <div className="space-y-0.5 text-[11px]">
                      <div className="font-black text-sm text-black">{selectedRemitoForView.razonSocialEmisor || 'EL HORNOCAL S.R.L.'}</div>
                      <div className="font-bold text-amber-700 text-[10px]">LA HORMIGA • MAQUINARIA VIAL</div>
                      <div>ALTE. BROWN 1560 - S.S. DE JUJUY</div>
                      <div>CEL: 388-5932763</div>
                      <div className="font-extrabold text-[10px] uppercase">IVA RESPONSABLE INSCRIPTO</div>
                    </div>
                  </div>

                  <div className="col-span-2 border-r-2 border-slate-900 flex flex-col items-center justify-center p-2 bg-amber-50">
                    <div className="border-2 border-slate-900 px-4 py-1 text-center bg-white">
                      <span className="text-3xl font-black block leading-none">{selectedRemitoForView.letra || 'R'}</span>
                      <span className="text-[10px] font-bold font-mono block mt-1">COD. {selectedRemitoForView.codigoAfip || '091'}</span>
                    </div>
                    <span className="text-[9px] font-bold text-center mt-1 uppercase">No válido c/factura</span>
                  </div>

                  <div className="col-span-5 p-3 text-right space-y-1">
                    <div className="text-xl font-black uppercase text-black">REMITO DIGITAL</div>
                    <div className="font-mono font-black text-sm text-emerald-700">
                      Nº {String(selectedRemitoForView.puntoVenta || 8).padStart(5, '0')} - {String(selectedRemitoForView.numeroComprobante).padStart(8, '0')}
                    </div>
                    <div className="text-[11px] font-mono space-y-0.5">
                      <div>FECHA: <b>{selectedRemitoForView.fecha.split('-').reverse().join('/')}</b></div>
                      <div>C.U.I.T.: <b>{selectedRemitoForView.cuitEmisor || '30-71499982-2'}</b></div>
                      <div>ING. BRUTOS: <b>A-1-37050</b></div>
                      <div>INICIO ACT.: <b>10/08/2015</b></div>
                    </div>
                  </div>
                </div>

                {/* Destinatario Box */}
                <div className="p-3 border-b-2 border-slate-900 space-y-1.5">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-8">
                      <span className="font-bold">DESTINATARIO / CLIENTE:</span>{' '}
                      <span className="font-black text-black">{selectedRemitoForView.razonSocialReceptor}</span>
                    </div>
                    <div className="col-span-4 font-mono text-right">
                      <span className="font-bold">{selectedRemitoForView.tipoDocReceptor}:</span> {selectedRemitoForView.nroDocReceptor}
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2 text-[11px]">
                    <div className="col-span-8">
                      <span className="font-bold">LUGAR DE ENTREGA / OBRA:</span>{' '}
                      <span className="font-bold text-black">
                        {[selectedRemitoForView.obraDestino, selectedRemitoForView.lugarEntrega || selectedRemitoForView.domicilioReceptor]
                          .filter(Boolean)
                          .join(' — ')}
                      </span>
                    </div>
                    <div className="col-span-4 text-right">
                      <span className="font-bold">IVA:</span> {selectedRemitoForView.condicionIvaReceptor.replace(/_/g, ' ')}
                    </div>
                  </div>

                  {selectedRemitoForView.comprobanteAsociadoTexto && (
                    <div className="text-[11px] font-mono text-sky-800 font-bold">
                      COMPROBANTE / CONTRATO VINCULADO: {selectedRemitoForView.comprobanteAsociadoTexto}
                    </div>
                  )}
                </div>

                {/* Transporte Box */}
                <div className="p-3 border-b-2 border-slate-900 bg-slate-50 space-y-1 text-[11px]">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-6">
                      <span className="font-bold">MOTIVO DEL TRASLADO:</span>{' '}
                      <span className="font-bold text-black">
                        {MOTIVO_LABELS[selectedRemitoForView.motivoTraslado] || selectedRemitoForView.motivoTraslado}
                      </span>
                    </div>
                    <div className="col-span-6">
                      <span className="font-bold">ORIGEN:</span> {selectedRemitoForView.origenTraslado}
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-5">
                      <span className="font-bold">CHOFER:</span> {selectedRemitoForView.choferNombre || 'A DESIGNAR'}{' '}
                      {selectedRemitoForView.choferDni ? `(DNI: ${selectedRemitoForView.choferDni})` : ''}
                    </div>
                    <div className="col-span-4">
                      <span className="font-bold">VEHÍCULO:</span> {selectedRemitoForView.vehiculoTransporte || '-'}
                    </div>
                    <div className="col-span-3 font-mono">
                      <span className="font-bold">DOMINIO:</span> {selectedRemitoForView.patenteChasis || '-'}
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="min-h-[200px]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-200 border-b-2 border-slate-900 text-[10px] font-bold uppercase">
                        <th className="py-2 px-3 border-r border-slate-900 w-20">Código</th>
                        <th className="py-2 px-2 border-r border-slate-900 w-16 text-center">Cant.</th>
                        <th className="py-2 px-2 border-r border-slate-900 w-20 text-center">Unidad</th>
                        <th className="py-2 px-3">Descripción del Equipo / Maquinaria / Material</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300 font-mono text-xs">
                      {selectedRemitoForView.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-2.5 px-3 border-r border-slate-300 font-bold">{it.codigo}</td>
                          <td className="py-2.5 px-2 border-r border-slate-300 text-center font-bold">{it.cantidad}</td>
                          <td className="py-2.5 px-2 border-r border-slate-300 text-center font-sans text-[11px]">{it.unidadMedida}</td>
                          <td className="py-2.5 px-3 font-sans">
                            <div className="font-bold text-black">{it.descripcion}</div>
                            {it.detalleSerieOrInterno && (
                              <div className="text-[11px] font-mono text-slate-600 mt-0.5">{it.detalleSerieOrInterno}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedRemitoForView.observaciones && (
                  <div className="p-2.5 bg-amber-50 border-t border-slate-300 text-[11px]">
                    <b>OBSERVACIONES:</b> {selectedRemitoForView.observaciones}
                  </div>
                )}

                {/* Signature Box */}
                <div className="border-t-2 border-slate-900 p-4 grid grid-cols-3 gap-4 text-center pt-10 bg-slate-50">
                  <div className="border-t border-slate-600 pt-1 text-[10px] font-bold">
                    ENTREGÓ CONFORME ({selectedRemitoForView.choferNombre || 'LA HORMIGA'})
                  </div>
                  <div className="border-t border-slate-600 pt-1 text-[10px] font-bold">
                    {selectedRemitoForView.recibidoPorNombre
                      ? `RECIBIÓ EN OBRA: ${selectedRemitoForView.recibidoPorNombre}`
                      : 'FIRMA Y ACLARACIÓN (RECIBE EN OBRA)'}
                  </div>
                  <div className="border-t border-slate-600 pt-1 text-[10px] font-bold">
                    {selectedRemitoForView.recibidoPorDni
                      ? `DNI: ${selectedRemitoForView.recibidoPorDni}`
                      : 'DNI / FECHA Y HORA DE RECEPCIÓN'}
                  </div>
                </div>

                {/* Fiscal Footer */}
                <div className="border-t-2 border-slate-900 p-3 flex items-center justify-between bg-white font-mono text-xs">
                  <div>
                    <div className="font-black text-slate-900 font-sans">
                      ARCA / AFIP • REMITO DIGITAL CLASE "{selectedRemitoForView.letra || 'R'}" (CÓD. {selectedRemitoForView.codigoAfip || '091'})
                    </div>
                    <div className="text-[10px] text-slate-500 font-sans">
                      Punto de Venta #{String(selectedRemitoForView.puntoVenta || 8).padStart(5, '0')} • Régimen RG 5678/2025
                    </div>
                  </div>
                  <div className="text-right font-bold">
                    <div>C.A.I. Nº: <span className="text-black">{selectedRemitoForView.cai}</span></div>
                    <div>VTO. C.A.I.: <span className="text-black">{selectedRemitoForView.vencimientoCai}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Registrar Conformidad de Entrega en Obra */}
      {remitoToDeliver && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/15 text-emerald-400 rounded-xl border border-emerald-500/30">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirmar Recepción en Obra</h3>
                <p className="text-xs text-slate-400">
                  Remito Nº {String(remitoToDeliver.puntoVenta || 8).padStart(5, '0')}-{String(remitoToDeliver.numeroComprobante).padStart(8, '0')} • {remitoToDeliver.razonSocialReceptor}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Nombre y Apellido de quien recibe en obra *</label>
                <input
                  type="text"
                  value={recibidoNombreInput}
                  onChange={e => setRecibidoNombreInput(e.target.value)}
                  placeholder="Ej: Ing. Roberto Gómez (Jefe de Obra)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">DNI de quien recibe (Opcional)</label>
                <input
                  type="text"
                  value={recibidoDniInput}
                  onChange={e => setRecibidoDniInput(e.target.value)}
                  placeholder="Ej: 28.451.992"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRemitoToDeliver(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelivery}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                ✓ Guardar Entrega Conforme
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Eliminar Remito */}
      {remitoToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">¿Eliminar Remito Digital?</h3>
            <p className="text-xs text-slate-400">
              Se eliminará el remito <b>{remitoToDelete.id}</b> ({remitoToDelete.razonSocialReceptor}) de la base de datos.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemitoToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteRemito(remitoToDelete.id)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: Directorio de Clientes BD */}
      <ClientDirectoryModal
        isOpen={isClientPickerOpen}
        onClose={() => setIsClientPickerOpen(false)}
        onClientsUpdated={list => setLocalClients(list)}
        onSelectClient={client => {
          applyClientToRemito(client);
          setIsClientPickerOpen(false);
        }}
      />
    </div>
  );
};
