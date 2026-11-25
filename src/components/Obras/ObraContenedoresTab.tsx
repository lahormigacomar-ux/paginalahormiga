import React, { useMemo, useState } from 'react';
import {
  Obra,
  ObraFacturaLegajo,
  ObraFacturaOrigen,
  ObraLegajoAdjunto,
  ObraPeriodoContenedor,
  ArcaInvoice,
  CustomerPaymentReceipt,
  RentalContract,
  Quotation,
  ParteDiario,
  Vehicle,
  FuelDispensary,
  StockMovement,
  StockItem,
  VehicleServiceLog,
  VehicleExpenseLog,
  Employee,
  SupabaseUsuario,
  SupabaseCategoria
} from '../../types';
import { formatCurrency, loadFuelPrices } from '../../services/storage';
import { uploadFileToCloudflareR2 } from '../../services/api';
import {
  resolveArcaInvoiceLinks,
  resolveRentalContractLinks,
  isExternalMigratedInvoice,
  formatInvoiceNumber
} from '../../utils/crossLinks';
import { resolveFacturaLegajoLiveStatus } from '../../utils/obraLegajoResolver';
import {
  computeObraRentabilidad,
  normalizeObraDateKey
} from '../../utils/obraCostosEngine';
import { PayrollPeriodRecord } from '../../utils/payrollParser';
import {
  FolderOpen,
  FolderPlus,
  ArrowLeft,
  Plus,
  Search,
  Receipt,
  ClipboardList,
  Truck,
  FileText,
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
  Upload,
  TrendingUp,
  ChevronRight,
  Calendar,
  Link2,
  Sparkles,
  ArrowUpRight
} from 'lucide-react';
import { RentalFormModal } from '../RentalManagement/RentalFormModal';

interface ObraContenedoresTabProps {
  obra: Obra;
  arcaInvoices: ArcaInvoice[];
  customerReceipts?: CustomerPaymentReceipt[];
  rentals: RentalContract[];
  quotations: Quotation[];
  partesDiarios: ParteDiario[];
  fleet?: Vehicle[];
  fuelVouchers?: FuelDispensary[];
  stockMovements?: StockMovement[];
  stockItems?: StockItem[];
  servicesLogs?: VehicleServiceLog[];
  expensesLogs?: VehicleExpenseLog[];
  employees?: Employee[];
  supabaseUsuarios?: SupabaseUsuario[];
  supabaseCategorias?: SupabaseCategoria[];
  payrollPeriods?: PayrollPeriodRecord[];
  payrollDirectoryLinks?: Record<string, string>;
  onSaveObra: (updatedObra: Obra) => Promise<{ ok: boolean; error?: string }>;
  onSaveRental?: (contract: RentalContract, linkedQuotationId?: string) => Promise<void> | void;
  onInvoiceRentalInArca?: (
    contract: RentalContract,
    context?: { obraId: string; periodoId?: string }
  ) => void;
}

type InnerContainerSection = 'facturas' | 'partes' | 'contratos' | 'documentos';

const pad4 = (n: number | string) => String(n || 1).padStart(4, '0');
const pad8 = (n: number | string) => String(n || 0).padStart(8, '0');

export const ObraContenedoresTab: React.FC<ObraContenedoresTabProps> = ({
  obra,
  arcaInvoices,
  customerReceipts = [],
  rentals,
  quotations,
  partesDiarios,
  fleet = [],
  fuelVouchers = [],
  stockMovements = [],
  stockItems = [],
  servicesLogs = [],
  expensesLogs = [],
  employees = [],
  supabaseUsuarios = [],
  supabaseCategorias = [],
  payrollPeriods = [],
  payrollDirectoryLinks = {},
  onSaveObra,
  onSaveRental,
  onInvoiceRentalInArca
}) => {
  const facturas = obra.facturasLegajo || [];
  const periodos = obra.periodosLegajo || [];
  const fuelPricesCatalog = useMemo(() => loadFuelPrices(), []);

  // Navigation inside Contenedores: null = List view, string = Inside Container view
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [innerSection, setInnerSection] = useState<InnerContainerSection>('facturas');

  // General save feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Create / Edit Container metadata modal/drawer form
  const [isPeriodFormOpen, setIsPeriodFormOpen] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [periodTitulo, setPeriodTitulo] = useState('');
  const [periodFechaDesde, setPeriodFechaDesde] = useState('');
  const [periodFechaHasta, setPeriodFechaHasta] = useState('');
  const [periodDescripcion, setPeriodDescripcion] = useState('');
  const [confirmDeletePeriodId, setConfirmDeletePeriodId] = useState<string | null>(null);

  // Inside Container: Link Existing Invoice Picker / New Invoice form
  const [showLinkFacturaPicker, setShowLinkFacturaPicker] = useState(false);
  const [facturaSearch, setFacturaSearch] = useState('');
  const [showNewFacturaForm, setShowNewFacturaForm] = useState(false);
  const [newFacArcaId, setNewFacArcaId] = useState('');
  const [newFacTipo, setNewFacTipo] = useState('FACTURA A');
  const [newFacNro, setNewFacNro] = useState('');
  const [newFacFecha, setNewFacFecha] = useState(new Date().toISOString().slice(0, 10));
  const [newFacConcepto, setNewFacConcepto] = useState('');
  const [newFacOrigen, setNewFacOrigen] = useState<ObraFacturaOrigen>('PARTES_DIARIOS');
  const [newFacNeto, setNewFacNeto] = useState<number>(0);
  const [newFacIva, setNewFacIva] = useState<number>(0);
  const [newFacTotal, setNewFacTotal] = useState<number>(0);
  const [newFacCobro, setNewFacCobro] = useState<'PENDIENTE' | 'COBRADO_PARCIAL' | 'COBRADO'>('PENDIENTE');
  const [newFacRentalIds, setNewFacRentalIds] = useState<string[]>([]);
  const [newFacQuotationIds, setNewFacQuotationIds] = useState<string[]>([]);
  const [newFacParteIds, setNewFacParteIds] = useState<string[]>([]);
  const [newFacObs, setNewFacObs] = useState('');

  // Inside Container: Partes picker
  const [showPartesPicker, setShowPartesPicker] = useState(false);
  const [parteSearch, setParteSearch] = useState('');
  const [showAllPartes, setShowAllPartes] = useState(false);

  // Inside Container: Rentals & Quotations picker
  const [rentalSearch, setRentalSearch] = useState('');
  const [quotationSearch, setQuotationSearch] = useState('');

  // Inside Container: Attachments upload & preview
  const [newAdjuntoTipo, setNewAdjuntoTipo] = useState<ObraLegajoAdjunto['tipo']>('FACTURA');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [previewAdjunto, setPreviewAdjunto] = useState<ObraLegajoAdjunto | null>(null);

  // Inside Container: Create / Edit Rental Contract modal & import from rental inside New Factura
  const [isRentalModalOpen, setIsRentalModalOpen] = useState(false);
  const [rentalToEditInContainer, setRentalToEditInContainer] = useState<RentalContract | null>(null);
  const [attachSavedRentalToNewFactura, setAttachSavedRentalToNewFactura] = useState(false);
  const [newFacSelectedRentalId, setNewFacSelectedRentalId] = useState('');
  const [newFacImportNotice, setNewFacImportNotice] = useState<{
    tone: 'emerald' | 'amber';
    text: string;
  } | null>(null);

  const obraPartes = useMemo(() => {
    const oNom = (obra.nombreObra || '').toLowerCase().trim();
    const oNum = (obra.numero || '').toLowerCase().trim();
    return partesDiarios.filter(
      (p) =>
        (oNom && (p.obra || '').toLowerCase().trim() === oNom) ||
        (oNum && (p.codigoObra || '').toLowerCase().trim() === oNum)
    );
  }, [partesDiarios, obra]);

  // Compute full metrics per Container (facturas, direct+absorbed partes, rentals, quotations, adjuntos, costs & margin)
  const periodMetricsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        facturas: ObraFacturaLegajo[];
        directParteIds: Set<string>;
        absorbedParteIds: Set<string>;
        partes: ParteDiario[];
        rentals: RentalContract[];
        quotations: Quotation[];
        adjuntos: ObraLegajoAdjunto[];
        neto: number;
        total: number;
        cobrado: number;
        horas: number;
        viajes: number;
        costoOperativo?: number;
        resultadoNeto?: number;
        margenPct?: number;
      }
    >();

    periodos.forEach((per) => {
      const perFacturas = facturas.filter((f) => f.periodoId === per.id);
      const directParteIds = new Set<string>(per.parteDiarioIds || []);
      const absorbedParteIds = new Set<string>();
      const rentalIdSet = new Set<string>(per.rentalIds || []);
      const quotationIdSet = new Set<string>(per.cotizacionIds || []);

      perFacturas.forEach((f) => {
        (f.parteDiarioIds || []).forEach((id) => absorbedParteIds.add(id));
        (f.rentalIds || []).forEach((id) => rentalIdSet.add(id));
        (f.quotationIds || []).forEach((id) => quotationIdSet.add(id));
      });

      const perRentals = rentals.filter((r) => rentalIdSet.has(r.id));
      perRentals.forEach((r) => {
        (r.partesDiariosIds || []).forEach((id) => absorbedParteIds.add(id));
        if (r.cotizacionId) quotationIdSet.add(r.cotizacionId);
      });

      const allParteIdSet = new Set<string>([...directParteIds, ...absorbedParteIds]);
      const perPartes = partesDiarios.filter((p) => allParteIdSet.has(p.id));
      const perQuotations = quotations.filter((q) => quotationIdSet.has(q.id));
      const perAdjuntos = per.adjuntos || [];

      const neto = perFacturas.reduce((acc, f) => acc + Number(f.netoGravado || 0), 0);
      const total = perFacturas.reduce((acc, f) => acc + Number(f.importeTotal || 0), 0);
      const cobrado = perFacturas.reduce(
        (acc, f) =>
          acc +
          resolveFacturaLegajoLiveStatus(f, arcaInvoices, customerReceipts, rentals, partesDiarios)
            .montoCobrado,
        0
      );
      const horas = perPartes.reduce(
        (acc, p) => acc + Number(p.horasTrabajadas || p.hsCantidad || 0),
        0
      );
      const viajes = perPartes.reduce(
        (acc, p) => acc + (p.tipo === 'VIAJES' ? Number(p.viajesCantidad || p.cantidad || 1) : 0),
        0
      );

      let minD = per.fechaDesde || '';
      let maxD = per.fechaHasta || '';
      if (!minD || !maxD) {
        const dates = perPartes.map((p) => normalizeObraDateKey(p.fecha)).filter(Boolean).sort();
        if (dates.length > 0) {
          if (!minD) minD = dates[0];
          if (!maxD) maxD = dates[dates.length - 1];
        }
      }

      let costoOperativo: number | undefined;
      let resultadoNeto: number | undefined;
      let margenPct: number | undefined;

      if (minD && maxD) {
        const periodRent = computeObraRentabilidad({
          obra: {
            ...obra,
            facturasLegajo: perFacturas,
            costosConfig: {
              ...(obra.costosConfig || {
                porcentajeGastosGenerales: 10,
                baseCalculoGastosGenerales: 'COSTOS_DIRECTOS'
              }),
              fechaDesdeFiltro: minD,
              fechaHastaFiltro: maxD
            }
          },
          partesDiarios,
          rentals,
          fleet,
          fuelVouchers,
          stockMovements,
          stockItems,
          servicesLogs,
          expensesLogs,
          employees,
          supabaseUsuarios,
          supabaseCategorias,
          fuelPricesCatalog,
          payrollPeriods,
          payrollDirectoryLinks,
          arcaInvoices,
          customerReceipts
        });
        costoOperativo = periodRent.costoTotalObra;
        resultadoNeto = neto - costoOperativo;
        margenPct = neto > 0 ? Number(((resultadoNeto / neto) * 100).toFixed(1)) : 0;
      }

      map.set(per.id, {
        facturas: perFacturas,
        directParteIds,
        absorbedParteIds,
        partes: perPartes,
        rentals: perRentals,
        quotations: perQuotations,
        adjuntos: perAdjuntos,
        neto,
        total,
        cobrado,
        horas,
        viajes,
        costoOperativo,
        resultadoNeto,
        margenPct
      });
    });

    return map;
  }, [
    periodos,
    facturas,
    partesDiarios,
    rentals,
    quotations,
    obra,
    fleet,
    fuelVouchers,
    stockMovements,
    stockItems,
    servicesLogs,
    expensesLogs,
    employees,
    supabaseUsuarios,
    supabaseCategorias,
    fuelPricesCatalog,
    payrollPeriods,
    payrollDirectoryLinks,
    arcaInvoices,
    customerReceipts
  ]);

  const activePeriod = useMemo(
    () => (selectedPeriodId ? periodos.find((p) => p.id === selectedPeriodId) || null : null),
    [selectedPeriodId, periodos]
  );

  const activeMetrics = activePeriod ? periodMetricsMap.get(activePeriod.id) : undefined;

  const pendingLinkedRentalInvoices = useMemo(() => {
    if (!activePeriod || !activeMetrics) return [];
    const existingArcaIds = new Set(
      activeMetrics.facturas.map((f) => f.arcaInvoiceId).filter(Boolean) as string[]
    );
    const seenInvIds = new Set<string>();
    const list: Array<{ inv: ArcaInvoice; sourceRental: RentalContract }> = [];

    activeMetrics.rentals.forEach((r) => {
      const rLinks = resolveRentalContractLinks(r, partesDiarios, arcaInvoices);
      rLinks.linkedInvoices.forEach((inv) => {
        if (!existingArcaIds.has(inv.id) && !seenInvIds.has(inv.id)) {
          seenInvIds.add(inv.id);
          list.push({ inv, sourceRental: r });
        }
      });
    });
    return list;
  }, [activePeriod, activeMetrics, partesDiarios, arcaInvoices]);

  const ungroupedFacturasCount = useMemo(() => {
    const validIds = new Set(periodos.map((p) => p.id));
    return facturas.filter((f) => !f.periodoId || !validIds.has(f.periodoId)).length;
  }, [facturas, periodos]);

  // ==================== CONTAINER CRUD HANDLERS ====================
  const resetPeriodForm = () => {
    setEditingPeriodId(null);
    setPeriodTitulo('');
    setPeriodFechaDesde('');
    setPeriodFechaHasta('');
    setPeriodDescripcion('');
    setSaveError(null);
  };

  const openNewPeriodForm = () => {
    resetPeriodForm();
    setIsPeriodFormOpen(true);
  };

  const openEditPeriodForm = (per: ObraPeriodoContenedor) => {
    setEditingPeriodId(per.id);
    setPeriodTitulo(per.titulo);
    setPeriodFechaDesde(per.fechaDesde || '');
    setPeriodFechaHasta(per.fechaHasta || '');
    setPeriodDescripcion(per.descripcion || '');
    setSaveError(null);
    setIsPeriodFormOpen(true);
  };

  const handleSavePeriodMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveFeedback(null);
    if (!periodTitulo.trim()) {
      setSaveError('Ingresá un título general para el contenedor (ej: 1era Quincena Octubre).');
      return;
    }

    const existing = editingPeriodId ? periodos.find((p) => p.id === editingPeriodId) : undefined;
    const nextPeriod: ObraPeriodoContenedor = {
      ...(existing || {
        id: `PER-${Date.now()}`,
        createdAt: new Date().toISOString()
      }),
      titulo: periodTitulo.trim(),
      fechaDesde: periodFechaDesde || undefined,
      fechaHasta: periodFechaHasta || undefined,
      descripcion: periodDescripcion.trim() || undefined
    };

    const nextPeriodos = editingPeriodId
      ? periodos.map((p) => (p.id === editingPeriodId ? nextPeriod : p))
      : [nextPeriod, ...periodos];

    const nextFacturas = facturas.map((f) =>
      f.periodoId === nextPeriod.id ? { ...f, periodoTitulo: nextPeriod.titulo } : f
    );

    setIsSaving(true);
    const res = await onSaveObra({
      ...obra,
      periodosLegajo: nextPeriodos,
      facturasLegajo: nextFacturas
    });
    setIsSaving(false);

    if (!res.ok) {
      setSaveError(res.error || 'No se pudo guardar el contenedor en Supabase.');
      return;
    }

    setSaveFeedback(
      editingPeriodId
        ? `Contenedor "${nextPeriod.titulo}" actualizado.`
        : `Contenedor "${nextPeriod.titulo}" creado. Ya podés sumar facturas, partes y documentos adentro.`
    );
    setIsPeriodFormOpen(false);
    resetPeriodForm();
    if (!editingPeriodId) {
      setSelectedPeriodId(nextPeriod.id);
      setInnerSection('facturas');
    }
  };

  const handleDeletePeriodContainer = async (perId: string) => {
    const nextPeriodos = periodos.filter((p) => p.id !== perId);
    const nextFacturas = facturas.map((f) =>
      f.periodoId === perId ? { ...f, periodoId: undefined, periodoTitulo: undefined } : f
    );
    setIsSaving(true);
    setSaveError(null);
    const res = await onSaveObra({
      ...obra,
      periodosLegajo: nextPeriodos,
      facturasLegajo: nextFacturas
    });
    setIsSaving(false);
    setConfirmDeletePeriodId(null);
    if (!res.ok) {
      setSaveError(res.error || 'Error al eliminar el contenedor.');
      return;
    }
    if (selectedPeriodId === perId) setSelectedPeriodId(null);
    setSaveFeedback('Contenedor eliminado. Las facturas permanecieron en Facturación & Legajos.');
  };

  const updatePeriodItem = async (
    perId: string,
    updater: (per: ObraPeriodoContenedor) => ObraPeriodoContenedor,
    msg: string
  ) => {
    const nextPeriodos = periodos.map((p) => (p.id === perId ? updater(p) : p));
    setIsSaving(true);
    setSaveError(null);
    const res = await onSaveObra({ ...obra, periodosLegajo: nextPeriodos });
    setIsSaving(false);
    if (!res.ok) {
      setSaveError(res.error || 'No se pudo actualizar en Supabase.');
    } else {
      setSaveFeedback(msg);
    }
  };

  // ==================== INSIDE CONTAINER: FACTURAS ====================
  const handleToggleFacturaInContainer = async (facId: string, assign: boolean) => {
    if (!activePeriod) return;
    const nextFacturas = facturas.map((f) =>
      f.id === facId
        ? {
            ...f,
            periodoId: assign ? activePeriod.id : undefined,
            periodoTitulo: assign ? activePeriod.titulo : undefined
          }
        : f
    );
    setIsSaving(true);
    setSaveError(null);
    const res = await onSaveObra({ ...obra, facturasLegajo: nextFacturas });
    setIsSaving(false);
    if (!res.ok) {
      setSaveError(res.error || 'Error al actualizar factura.');
    } else {
      setSaveFeedback(
        assign
          ? `Factura agregada al contenedor "${activePeriod.titulo}".`
          : `Factura quitada del contenedor.`
      );
    }
  };

  const handleImportArcaInsideContainer = (invId: string) => {
    setNewFacArcaId(invId);
    setNewFacImportNotice(null);
    if (!invId) return;
    const inv = arcaInvoices.find((i) => i.id === invId);
    if (!inv) return;

    setNewFacTipo(inv.tipoComprobante.replace('NOTA_CREDITO_', 'NOTA DE CRÉDITO ').replace(/_/g, ' '));
    setNewFacNro(formatInvoiceNumber(inv));
    setNewFacFecha(inv.fecha || new Date().toISOString().slice(0, 10));
    const desc = (inv.items || []).map((it) => it.descripcion).filter(Boolean).slice(0, 3).join(' / ');
    setNewFacConcepto(desc || `Facturación a ${inv.razonSocialReceptor}`);
    setNewFacNeto(Number(inv.netoGravado || 0));
    setNewFacIva(Number(inv.ivaTotal || 0));
    setNewFacTotal(Number(inv.importeTotal || inv.impTotal || 0));

    const resolved = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
    setNewFacRentalIds(resolved.linkedRentals.map((r) => r.id));
    if (resolved.linkedRentals.length > 0 && !newFacSelectedRentalId) {
      setNewFacSelectedRentalId(resolved.linkedRentals[0].id);
    }
    setNewFacParteIds(resolved.linkedPartes.map((p) => p.id));

    const cotSet = new Set<string>();
    resolved.linkedRentals.forEach((r) => {
      if (r.cotizacionId) cotSet.add(r.cotizacionId);
    });
    setNewFacQuotationIds(Array.from(cotSet));

    if (resolved.estadoCobro === 'PAGADO') setNewFacCobro('COBRADO');
    else if (resolved.estadoCobro === 'COBRADO_PARCIAL' || resolved.estadoCobro === 'PARCIAL')
      setNewFacCobro('COBRADO_PARCIAL');
    else setNewFacCobro('PENDIENTE');

    if (resolved.linkedRentals.length > 0 && resolved.linkedPartes.length > 0) setNewFacOrigen('MIXTO');
    else if (resolved.linkedPartes.length > 0) setNewFacOrigen('PARTES_DIARIOS');
    else if (resolved.linkedRentals.length > 0 || inv.vinculadoTipo === 'ALQUILER')
      setNewFacOrigen('ALQUILER_MAQUINA');

    if (isExternalMigratedInvoice(inv)) {
      setNewFacObs(`Factura cargada de otro sistema (${inv.sistemaOrigenNombre || 'Migración'}).`);
    }

    setNewFacImportNotice({
      tone: 'emerald',
      text: `Factura ${formatInvoiceNumber(inv)} importada con ${resolved.linkedRentals.length} contrato(s) y ${resolved.linkedPartes.length} parte(s).`
    });
  };

  const applyRentalToNewFacturaForm = (r: RentalContract) => {
    setNewFacSelectedRentalId(r.id);
    const rLinks = resolveRentalContractLinks(r, partesDiarios, arcaInvoices);

    if (rLinks.primaryInvoice) {
      handleImportArcaInsideContainer(rLinks.primaryInvoice.id);
      setNewFacRentalIds((prev) => Array.from(new Set([...prev, r.id])));
      if (r.cotizacionId) {
        setNewFacQuotationIds((prev) => Array.from(new Set([...prev, r.cotizacionId!])));
      }
      setNewFacImportNotice({
        tone: 'emerald',
        text: `El contrato ${r.numeroContrato} ya tiene vinculada la Factura ${rLinks.facturaNumero} — se importaron automáticamente importes, datos fiscales y ${rLinks.linkedPartes.length} parte(s).`
      });
      return;
    }

    setNewFacArcaId('');
    setNewFacRentalIds([r.id]);
    setNewFacQuotationIds(r.cotizacionId ? [r.cotizacionId] : []);
    setNewFacParteIds(rLinks.linkedPartes.map((p) => p.id));
    setNewFacOrigen(rLinks.linkedPartes.length > 0 ? 'MIXTO' : 'ALQUILER_MAQUINA');

    const descItems = (r.items || []).map((it) => it.descripcion).filter(Boolean).slice(0, 2).join(' + ');
    const defaultConcept =
      descItems ||
      `Alquiler ${r.equipoCodigoInterno ? `[${r.equipoCodigoInterno}] ` : ''}${r.equipoModelo || ''} · Contrato ${r.numeroContrato}`;
    setNewFacConcepto(defaultConcept.trim());

    const neto = Number(r.subtotalNeto ?? r.totalAlquiler ?? 0);
    const iva = Number(r.ivaTotal ?? 0);
    const total = Number(r.totalAlquiler || neto + iva);
    setNewFacNeto(neto);
    setNewFacIva(iva);
    setNewFacTotal(total);
    setNewFacObs(
      `Contrato de alquiler ${r.numeroContrato}${r.obraDestino ? ` · Obra: ${r.obraDestino}` : ''}`
    );
    setNewFacImportNotice({
      tone: 'amber',
      text: `Contrato ${r.numeroContrato} vinculado (${rLinks.linkedPartes.length} parte(s)). Todavía no tiene factura ARCA emitida — cuando lo factures desde ARCA o desde acá, quedará asociada automáticamente.`
    });
  };

  const handleImportRentalInsideContainer = (rentalId: string) => {
    setNewFacSelectedRentalId(rentalId);
    setNewFacImportNotice(null);
    if (!rentalId) return;
    const found = rentals.find((r) => r.id === rentalId);
    if (!found) return;
    applyRentalToNewFacturaForm(found);
  };

  const handleBringInvoicesToContainer = async (
    items: Array<{ inv: ArcaInvoice; sourceRental?: RentalContract }>
  ) => {
    if (!activePeriod || items.length === 0) return;
    let nextFacturas = [...facturas];
    let addedCount = 0;
    let movedCount = 0;

    items.forEach(({ inv, sourceRental }) => {
      const existingIdx = nextFacturas.findIndex((f) => f.arcaInvoiceId === inv.id);
      if (existingIdx >= 0) {
        if (nextFacturas[existingIdx].periodoId !== activePeriod.id) {
          nextFacturas[existingIdx] = {
            ...nextFacturas[existingIdx],
            periodoId: activePeriod.id,
            periodoTitulo: activePeriod.titulo,
            rentalIds: sourceRental
              ? Array.from(new Set([...(nextFacturas[existingIdx].rentalIds || []), sourceRental.id]))
              : nextFacturas[existingIdx].rentalIds
          };
          movedCount++;
        }
        return;
      }

      const resolved = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
      const mergedRentalIds = Array.from(
        new Set([
          ...resolved.linkedRentals.map((r) => r.id),
          ...(sourceRental ? [sourceRental.id] : [])
        ])
      );
      const cotSet = new Set<string>();
      resolved.linkedRentals.forEach((r) => {
        if (r.cotizacionId) cotSet.add(r.cotizacionId);
      });
      if (sourceRental?.cotizacionId) cotSet.add(sourceRental.cotizacionId);

      const estadoCobro: ObraFacturaLegajo['estadoCobro'] =
        resolved.estadoCobro === 'PAGADO'
          ? 'COBRADO'
          : resolved.estadoCobro === 'COBRADO_PARCIAL' || resolved.estadoCobro === 'PARCIAL'
            ? 'COBRADO_PARCIAL'
            : 'PENDIENTE';

      const origen: ObraFacturaOrigen =
        mergedRentalIds.length > 0 && resolved.linkedPartes.length > 0
          ? 'MIXTO'
          : resolved.linkedPartes.length > 0
            ? 'PARTES_DIARIOS'
            : mergedRentalIds.length > 0 || inv.vinculadoTipo === 'ALQUILER'
              ? 'ALQUILER_MAQUINA'
              : 'OTRO';

      const desc = (inv.items || [])
        .map((it) => it.descripcion)
        .filter(Boolean)
        .slice(0, 3)
        .join(' / ');

      const newRecord: ObraFacturaLegajo = {
        id: `OFAC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        arcaInvoiceId: inv.id,
        periodoId: activePeriod.id,
        periodoTitulo: activePeriod.titulo,
        tipoComprobante: inv.tipoComprobante
          .replace('NOTA_CREDITO_', 'NOTA DE CRÉDITO ')
          .replace(/_/g, ' '),
        nroComprobante: formatInvoiceNumber(inv),
        fecha: inv.fecha || new Date().toISOString().slice(0, 10),
        concepto: desc || `Facturación a ${inv.razonSocialReceptor}`,
        origen,
        rentalIds: mergedRentalIds,
        quotationIds: Array.from(cotSet),
        parteDiarioIds: resolved.linkedPartes.map((p) => p.id),
        netoGravado: Number(inv.netoGravado || 0),
        ivaMonto: Number(inv.ivaTotal || 0),
        importeTotal: Number(inv.importeTotal || inv.impTotal || 0),
        estadoCobro,
        observaciones: sourceRental
          ? `Importada desde Contrato ${sourceRental.numeroContrato}`
          : undefined,
        adjuntos: [],
        createdAt: new Date().toISOString()
      };

      nextFacturas = [newRecord, ...nextFacturas];
      addedCount++;
    });

    if (addedCount === 0 && movedCount === 0) return;

    setIsSaving(true);
    setSaveError(null);
    const res = await onSaveObra({ ...obra, facturasLegajo: nextFacturas });
    setIsSaving(false);
    if (!res.ok) {
      setSaveError(res.error || 'No se pudo incorporar la factura vinculada al contenedor.');
      return;
    }
    setSaveFeedback(
      `Se incorporaron ${addedCount + movedCount} factura(s) vinculada(s) al contenedor "${activePeriod.titulo}".`
    );
  };

  const openRentalModalInContainer = (
    contract: RentalContract | null,
    attachToNewFactura = false
  ) => {
    setRentalToEditInContainer(contract);
    setAttachSavedRentalToNewFactura(attachToNewFactura);
    setIsRentalModalOpen(true);
  };

  const handleSaveRentalFromContainer = async (
    savedContract: RentalContract,
    linkedQuotationId?: string
  ) => {
    if (onSaveRental) {
      await onSaveRental(savedContract, linkedQuotationId);
    }

    if (activePeriod) {
      const nextRentalIds = Array.from(
        new Set([...(activePeriod.rentalIds || []), savedContract.id])
      );
      const nextCotIds = savedContract.cotizacionId
        ? Array.from(new Set([...(activePeriod.cotizacionIds || []), savedContract.cotizacionId]))
        : activePeriod.cotizacionIds || [];

      const nextPeriodos = periodos.map((per) =>
        per.id === activePeriod.id
          ? { ...per, rentalIds: nextRentalIds, cotizacionIds: nextCotIds }
          : per
      );

      setIsSaving(true);
      const res = await onSaveObra({ ...obra, periodosLegajo: nextPeriodos });
      setIsSaving(false);
      if (!res.ok) {
        setSaveError(
          res.error ||
            'El contrato se guardó, pero hubo un problema al vincularlo automáticamente al contenedor.'
        );
      } else {
        setSaveFeedback(
          rentalToEditInContainer
            ? `Contrato ${savedContract.numeroContrato} actualizado dentro de "${activePeriod.titulo}".`
            : `Contrato ${savedContract.numeroContrato} creado y vinculado dentro de "${activePeriod.titulo}".`
        );
      }
    }

    if (attachSavedRentalToNewFactura) {
      applyRentalToNewFacturaForm(savedContract);
      setAttachSavedRentalToNewFactura(false);
    }

    setIsRentalModalOpen(false);
    setRentalToEditInContainer(null);
  };

  const handleLinkOnlyRentalsToContainer = async (
    rentalIdsToLink?: string[],
    quotationIdsToLink?: string[]
  ) => {
    if (!activePeriod) return;
    const ids = Array.from(
      new Set(
        (rentalIdsToLink && rentalIdsToLink.length > 0
          ? rentalIdsToLink
          : newFacSelectedRentalId
            ? [newFacSelectedRentalId]
            : newFacRentalIds
        ).filter(Boolean)
      )
    );
    if (ids.length === 0) {
      setSaveError('Seleccioná al menos un contrato de alquiler para vincular.');
      return;
    }

    const extraCotIds = Array.from(
      new Set([
        ...(quotationIdsToLink || newFacQuotationIds),
        ...ids
          .map((id) => rentals.find((r) => r.id === id)?.cotizacionId)
          .filter((x): x is string => Boolean(x))
      ])
    );

    const nextPeriodos = periodos.map((per) =>
      per.id === activePeriod.id
        ? {
            ...per,
            rentalIds: Array.from(new Set([...(per.rentalIds || []), ...ids])),
            cotizacionIds: Array.from(new Set([...(per.cotizacionIds || []), ...extraCotIds]))
          }
        : per
    );

    setIsSaving(true);
    setSaveError(null);
    const res = await onSaveObra({ ...obra, periodosLegajo: nextPeriodos });
    setIsSaving(false);
    if (!res.ok) {
      setSaveError(res.error || 'No se pudo vincular el contrato al contenedor.');
      return;
    }

    const nums = ids
      .map((id) => rentals.find((r) => r.id === id)?.numeroContrato || id)
      .join(', ');
    setSaveFeedback(
      `Contrato ${nums} guardado dentro de "${activePeriod.titulo}" (sin factura aún — cuando lo factures en ARCA, se vinculará automáticamente).`
    );
    setShowNewFacturaForm(false);
    setNewFacArcaId('');
    setNewFacSelectedRentalId('');
    setNewFacImportNotice(null);
    setNewFacNro('');
    setNewFacConcepto('');
    setNewFacNeto(0);
    setNewFacIva(0);
    setNewFacTotal(0);
    setNewFacRentalIds([]);
    setNewFacQuotationIds([]);
    setNewFacParteIds([]);
    setNewFacObs('');
  };

  const handleCreateFacturaInsideContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePeriod) return;

    // Si eligió un contrato sin factura ARCA y dejó vacío el Nro. de Comprobante, vincula solo el Contrato
    if ((newFacSelectedRentalId || newFacRentalIds.length > 0) && !newFacArcaId && !newFacNro.trim()) {
      await handleLinkOnlyRentalsToContainer();
      return;
    }

    if (!newFacNro.trim() || !newFacConcepto.trim()) {
      setSaveError('Completá número de comprobante y concepto.');
      return;
    }
    const newRecord: ObraFacturaLegajo = {
      id: `OFAC-${Date.now()}`,
      arcaInvoiceId: newFacArcaId || undefined,
      periodoId: activePeriod.id,
      periodoTitulo: activePeriod.titulo,
      tipoComprobante: newFacTipo.trim() || 'FACTURA A',
      nroComprobante: newFacNro.trim(),
      fecha: newFacFecha || new Date().toISOString().slice(0, 10),
      concepto: newFacConcepto.trim(),
      origen: newFacOrigen,
      rentalIds: newFacRentalIds,
      quotationIds: newFacQuotationIds,
      parteDiarioIds: newFacParteIds,
      netoGravado: Number(newFacNeto) || 0,
      ivaMonto: Number(newFacIva) || 0,
      importeTotal: Number(newFacTotal) || Number(newFacNeto) + Number(newFacIva),
      estadoCobro: newFacCobro,
      observaciones: newFacObs.trim() || undefined,
      adjuntos: [],
      createdAt: new Date().toISOString()
    };

    const nextPeriodos =
      newFacRentalIds.length > 0
        ? periodos.map((per) =>
            per.id === activePeriod.id
              ? {
                  ...per,
                  rentalIds: Array.from(new Set([...(per.rentalIds || []), ...newFacRentalIds])),
                  cotizacionIds: Array.from(
                    new Set([...(per.cotizacionIds || []), ...newFacQuotationIds])
                  )
                }
              : per
          )
        : periodos;

    setIsSaving(true);
    setSaveError(null);
    const res = await onSaveObra({
      ...obra,
      periodosLegajo: nextPeriodos,
      facturasLegajo: [newRecord, ...facturas]
    });
    setIsSaving(false);
    if (!res.ok) {
      setSaveError(res.error || 'No se pudo guardar la factura.');
      return;
    }
    setSaveFeedback(`Factura ${newRecord.nroComprobante} guardada dentro de "${activePeriod.titulo}".`);
    setShowNewFacturaForm(false);
    setNewFacArcaId('');
    setNewFacSelectedRentalId('');
    setNewFacImportNotice(null);
    setNewFacNro('');
    setNewFacConcepto('');
    setNewFacNeto(0);
    setNewFacIva(0);
    setNewFacTotal(0);
    setNewFacRentalIds([]);
    setNewFacQuotationIds([]);
    setNewFacParteIds([]);
    setNewFacObs('');
  };

  // ==================== INSIDE CONTAINER: PARTES ====================
  const handlePullPartesByDates = async () => {
    if (!activePeriod) return;
    const matchedIds = obraPartes
      .filter((p) => {
        const dk = normalizeObraDateKey(p.fecha);
        if (!dk) return false;
        if (activePeriod.fechaDesde && dk < activePeriod.fechaDesde) return false;
        if (activePeriod.fechaHasta && dk > activePeriod.fechaHasta) return false;
        return true;
      })
      .map((p) => p.id);

    if (matchedIds.length === 0) {
      setSaveError('No se encontraron partes diarios de la obra en ese rango de fechas.');
      return;
    }
    const merged = Array.from(new Set([...(activePeriod.parteDiarioIds || []), ...matchedIds]));
    await updatePeriodItem(
      activePeriod.id,
      (per) => ({ ...per, parteDiarioIds: merged }),
      `${matchedIds.length} partes del rango de fechas incorporados al contenedor.`
    );
  };

  const handleToggleDirectParte = async (parteId: string) => {
    if (!activePeriod) return;
    const cur = activePeriod.parteDiarioIds || [];
    const exists = cur.includes(parteId);
    const next = exists ? cur.filter((id) => id !== parteId) : [...cur, parteId];
    await updatePeriodItem(
      activePeriod.id,
      (per) => ({ ...per, parteDiarioIds: next }),
      exists ? 'Parte quitado de los directos del contenedor.' : 'Parte agregado al contenedor.'
    );
  };

  // ==================== INSIDE CONTAINER: RENTALS & QUOTATIONS ====================
  const handleToggleContainerRental = async (rental: RentalContract) => {
    if (!activePeriod) return;
    const cur = activePeriod.rentalIds || [];
    const exists = cur.includes(rental.id);
    const nextRentals = exists ? cur.filter((id) => id !== rental.id) : [...cur, rental.id];
    const nextCotIds = !exists && rental.cotizacionId
      ? Array.from(new Set([...(activePeriod.cotizacionIds || []), rental.cotizacionId]))
      : activePeriod.cotizacionIds || [];

    await updatePeriodItem(
      activePeriod.id,
      (per) => ({ ...per, rentalIds: nextRentals, cotizacionIds: nextCotIds }),
      exists
        ? `Contrato ${rental.numeroContrato} quitado del contenedor.`
        : `Contrato ${rental.numeroContrato} vinculado al contenedor.`
    );
  };

  const handleToggleContainerQuotation = async (qId: string) => {
    if (!activePeriod) return;
    const cur = activePeriod.cotizacionIds || [];
    const exists = cur.includes(qId);
    const next = exists ? cur.filter((id) => id !== qId) : [...cur, qId];
    await updatePeriodItem(
      activePeriod.id,
      (per) => ({ ...per, cotizacionIds: next }),
      exists ? 'Cotización quitada del contenedor.' : 'Cotización vinculada al contenedor.'
    );
  };

  // ==================== INSIDE CONTAINER: DOCUMENTOS ADJUNTOS ====================
  const handleContainerFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activePeriod) return;
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
        'obras-contenedores'
      );
      if (!res.success || !res.url) {
        throw new Error(res.error || 'No se pudo subir el archivo.');
      }

      const sizeKB = Math.max(1, Math.round(file.size / 1024));
      const newAtt: ObraLegajoAdjunto = {
        id: `PERADJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        nombre: file.name,
        url: res.url,
        tipo: newAdjuntoTipo,
        fechaSubida: new Date().toISOString().slice(0, 10),
        tamanio: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`
      };
      await updatePeriodItem(
        activePeriod.id,
        (per) => ({ ...per, adjuntos: [...(per.adjuntos || []), newAtt] }),
        `Documento "${file.name}" guardado dentro del contenedor.`
      );
    } catch (err: any) {
      setSaveError(err?.message || 'Error al subir archivo a Cloudflare R2.');
    } finally {
      setIsUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleRemoveContainerAdjunto = async (attId: string) => {
    if (!activePeriod) return;
    await updatePeriodItem(
      activePeriod.id,
      (per) => ({
        ...per,
        adjuntos: (per.adjuntos || []).filter((a) => a.id !== attId)
      }),
      'Documento eliminado del contenedor.'
    );
  };

  // Filtered pickers inside open container
  const pickerFacturas = useMemo(() => {
    const q = facturaSearch.trim().toLowerCase();
    return facturas.filter((f) => {
      if (!q) return true;
      return (
        (f.nroComprobante || '').toLowerCase().includes(q) ||
        (f.concepto || '').toLowerCase().includes(q) ||
        (f.fecha || '').toLowerCase().includes(q)
      );
    });
  }, [facturas, facturaSearch]);

  const pickerPartes = useMemo(() => {
    const base = showAllPartes ? partesDiarios : obraPartes;
    const q = parteSearch.trim().toLowerCase();
    const directSet = activeMetrics?.directParteIds || new Set<string>();
    return base
      .filter((p) => {
        if (!q) return true;
        return (
          (p.numParte || '').toLowerCase().includes(q) ||
          (p.fecha || '').toLowerCase().includes(q) ||
          (p.codigoEquipo || '').toLowerCase().includes(q) ||
          (p.marcaModelo || '').toLowerCase().includes(q) ||
          (p.nombreApellido || '').toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => Number(directSet.has(b.id)) - Number(directSet.has(a.id)));
  }, [showAllPartes, partesDiarios, obraPartes, parteSearch, activeMetrics]);

  const pickerRentals = useMemo(() => {
    const q = rentalSearch.trim().toLowerCase();
    const selectedSet = new Set(activePeriod?.rentalIds || []);
    return rentals
      .filter((r) => {
        if (!q) return true;
        return (
          (r.numeroContrato || '').toLowerCase().includes(q) ||
          (r.clienteNombre || '').toLowerCase().includes(q) ||
          (r.equipoModelo || '').toLowerCase().includes(q) ||
          (r.obraDestino || '').toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => Number(selectedSet.has(b.id)) - Number(selectedSet.has(a.id)));
  }, [rentals, rentalSearch, activePeriod]);

  const pickerQuotations = useMemo(() => {
    const q = quotationSearch.trim().toLowerCase();
    const selectedSet = new Set(activePeriod?.cotizacionIds || []);
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
      .sort((a, b) => Number(selectedSet.has(b.id)) - Number(selectedSet.has(a.id)));
  }, [quotations, quotationSearch, activePeriod]);

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

      {/* Modal / Inline Form to Create or Edit Container Metadata */}
      {isPeriodFormOpen && (
        <form
          onSubmit={handleSavePeriodMetadata}
          className="bg-[#111318] border border-amber-500/40 rounded-2xl p-5 space-y-4 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-amber-400" />
              <h5 className="text-white font-bold text-sm">
                {editingPeriodId
                  ? 'Editar Contenedor de Período'
                  : 'Nuevo Contenedor de Período (Ej: 1era Quincena Mes)'}
              </h5>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsPeriodFormOpen(false);
                resetPeriodForm();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-amber-300 mb-1">
                Título General del Contenedor *
              </label>
              <input
                type="text"
                required
                value={periodTitulo}
                onChange={(e) => setPeriodTitulo(e.target.value)}
                placeholder="Ej. 1era Quincena Octubre 2026 / Certificado N° 2"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Fecha Desde (Opcional)
              </label>
              <input
                type="date"
                value={periodFechaDesde}
                onChange={(e) => setPeriodFechaDesde(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Fecha Hasta (Opcional)
              </label>
              <input
                type="date"
                value={periodFechaHasta}
                onChange={(e) => setPeriodFechaHasta(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              Descripción / Alcance del Período (Opcional)
            </label>
            <input
              type="text"
              value={periodDescripcion}
              onChange={(e) => setPeriodDescripcion(e.target.value)}
              placeholder="Ej. Certificación movimiento de suelo tramo norte y traslado de máquinas..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsPeriodFormOpen(false);
                resetPeriodForm();
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-xl text-xs font-black cursor-pointer flex items-center gap-2"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{editingPeriodId ? 'Guardar Cambios' : 'Crear y Abrir Contenedor'}</span>
            </button>
          </div>
        </form>
      )}

      {/* ==================== VIEW A: DIRECTORY / LIST OF CONTAINERS ==================== */}
      {!activePeriod && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <div>
              <h4 className="text-white font-bold text-sm flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-amber-400" />
                <span>Contenedores por Período</span>
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Creá carpetas por quincena, mes o certificado y meté adentro sus facturas, partes diarios, contratos y documentos para analizar cada período por separado.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewPeriodForm}
              disabled={isSaving}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Nuevo Contenedor / Período</span>
            </button>
          </div>

          {periodos.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-3">
              <FolderOpen className="w-10 h-10 text-slate-600 mx-auto" />
              <div>
                <p className="text-slate-200 text-sm font-bold">
                  Todavía no creaste contenedores de período en esta obra
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
                  Creá un contenedor (por ejemplo "1era Quincena Octubre 2026") y adentro vas a poder agrupar las facturas, partes diarios, contratos y archivos PDF/fotos correspondientes a ese período.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewPeriodForm}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black cursor-pointer inline-flex items-center gap-2"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Crear Primer Contenedor</span>
              </button>
            </div>
          ) : (
            <>
              {/* Comparative Table across all Containers */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <span>Análisis Comparativo por Períodos ({periodos.length})</span>
                  </div>
                  {ungroupedFacturasCount > 0 && (
                    <span className="text-[11px] text-slate-400">
                      Hay {ungroupedFacturasCount} factura(s) aún sin asignar a ningún contenedor
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                        <th className="py-2.5 px-3 font-semibold">Contenedor / Período</th>
                        <th className="py-2.5 px-3 font-semibold">Rango Fechas</th>
                        <th className="py-2.5 px-3 font-semibold text-center">Facturas</th>
                        <th className="py-2.5 px-3 font-semibold text-center">Partes / Hs</th>
                        <th className="py-2.5 px-3 font-semibold text-center">Docs / Contr.</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Facturado Neto</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Costo Est.</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Resultado / Margen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                      {periodos.map((per) => {
                        const m = periodMetricsMap.get(per.id);
                        return (
                          <tr
                            key={per.id}
                            onClick={() => {
                              setSelectedPeriodId(per.id);
                              setInnerSection('facturas');
                            }}
                            className="hover:bg-slate-800/40 transition cursor-pointer"
                          >
                            <td className="py-2.5 px-3 font-sans font-bold text-white">
                              {per.titulo}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] text-slate-400 whitespace-nowrap">
                              {per.fechaDesde || per.fechaHasta
                                ? `${per.fechaDesde || '...'} / ${per.fechaHasta || '...'}`
                                : 'Sin rango'}
                            </td>
                            <td className="py-2.5 px-3 text-center text-amber-300 font-bold">
                              {m?.facturas.length || 0}
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-200 whitespace-nowrap">
                              {m?.partes.length || 0} ({(m?.horas || 0).toFixed(1)} hs)
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-300 whitespace-nowrap">
                              {(m?.adjuntos.length || 0) + (m?.rentals.length || 0) + (m?.quotations.length || 0)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-amber-300 font-bold whitespace-nowrap">
                              {formatCurrency(m?.neto || 0)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-300 whitespace-nowrap">
                              {m?.costoOperativo !== undefined
                                ? formatCurrency(m.costoOperativo)
                                : '—'}
                            </td>
                            <td
                              className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                                m?.resultadoNeto === undefined
                                  ? 'text-slate-500'
                                  : m.resultadoNeto >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                              }`}
                            >
                              {m?.resultadoNeto !== undefined
                                ? `${formatCurrency(m.resultadoNeto)} (${m.margenPct}%)`
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Clean Folder Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {periodos.map((per) => {
                  const m = periodMetricsMap.get(per.id);
                  return (
                    <div
                      key={per.id}
                      className="bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-5 flex flex-col justify-between gap-4 transition"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h5 className="text-base font-bold text-white truncate">{per.titulo}</h5>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap font-mono tabular-nums">
                              <span>
                                {per.fechaDesde || per.fechaHasta
                                  ? `${per.fechaDesde || '...'} / ${per.fechaHasta || '...'}`
                                  : 'Sin fechas definidas'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{m?.facturas.length || 0} facturas</span>
                              <span aria-hidden="true">·</span>
                              <span>{m?.partes.length || 0} partes</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {(m?.adjuntos.length || 0) + (m?.rentals.length || 0)} docs/contr.
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditPeriodForm(per)}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                              title="Editar título o fechas"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {confirmDeletePeriodId === per.id ? (
                              <div className="flex items-center gap-1 bg-red-500/20 border border-red-500/40 rounded-lg px-2 py-1 text-[11px]">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePeriodContainer(per.id)}
                                  className="text-red-300 font-bold cursor-pointer"
                                >
                                  Borrar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeletePeriodId(null)}
                                  className="text-slate-300 ml-1 cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePeriodId(per.id)}
                                className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 cursor-pointer"
                                title="Eliminar contenedor"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {per.descripcion && (
                          <p className="text-xs text-slate-400 leading-relaxed">{per.descripcion}</p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
                          <div>
                            <span className="text-slate-400 block text-[11px]">Facturado Neto</span>
                            <span className="text-amber-300 font-bold">{formatCurrency(m?.neto || 0)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Horas Partes</span>
                            <span className="text-white font-bold">{(m?.horas || 0).toFixed(1)} hs</span>
                          </div>
                          {m?.resultadoNeto !== undefined && (
                            <div>
                              <span className="text-slate-400 block text-[11px]">Margen</span>
                              <span
                                className={`font-bold ${
                                  m.resultadoNeto >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {m.margenPct}%
                              </span>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPeriodId(per.id);
                            setInnerSection('facturas');
                          }}
                          className="px-4 py-2 bg-slate-800 hover:bg-amber-500 text-white hover:text-black rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <span>Abrir Contenedor</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ==================== VIEW B: INSIDE SELECTED CONTAINER ==================== */}
      {activePeriod && activeMetrics && (
        <div className="space-y-5">
          {/* Container Top Breadcrumb & Actions */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setSelectedPeriodId(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4 text-amber-400" />
                <span>Todos los Contenedores</span>
              </button>
              <div className="min-w-0">
                <h4 className="text-white font-bold text-base sm:text-lg truncate">{activePeriod.titulo}</h4>
                <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap font-mono tabular-nums">
                  <span>
                    {activePeriod.fechaDesde || activePeriod.fechaHasta
                      ? `${activePeriod.fechaDesde || '...'} / ${activePeriod.fechaHasta || '...'}`
                      : 'Sin rango de fechas'}
                  </span>
                  {activePeriod.descripcion && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-sans text-slate-400 truncate">{activePeriod.descripcion}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openEditPeriodForm(activePeriod)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span>Editar Período</span>
              </button>
            </div>
          </div>

          {/* Period KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono tabular-nums">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <span className="font-sans text-[11px] font-bold text-slate-400 block">Facturado Neto</span>
              <span className="text-lg font-bold text-amber-300 mt-1 block">
                {formatCurrency(activeMetrics.neto)}
              </span>
              <span className="font-sans text-[11px] text-slate-400">
                {activeMetrics.facturas.length} factura(s) · Total c/IVA {formatCurrency(activeMetrics.total)}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <span className="font-sans text-[11px] font-bold text-slate-400 block">Cobrado en Período</span>
              <span className="text-lg font-bold text-emerald-400 mt-1 block">
                {formatCurrency(activeMetrics.cobrado)}
              </span>
              <span className="font-sans text-[11px] text-slate-400">
                Pendiente: {formatCurrency(Math.max(0, activeMetrics.total - activeMetrics.cobrado))}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <span className="font-sans text-[11px] font-bold text-slate-400 block">Actividad de Partes</span>
              <span className="text-lg font-bold text-white mt-1 block">
                {activeMetrics.horas.toFixed(1)} hs
                {activeMetrics.viajes > 0 ? ` · ${activeMetrics.viajes} vj` : ''}
              </span>
              <span className="font-sans text-[11px] text-slate-400">
                {activeMetrics.partes.length} parte(s) · {activeMetrics.rentals.length} contrato(s)
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <span className="font-sans text-[11px] font-bold text-slate-400 block">
                Resultado Est. Período
              </span>
              <span
                className={`text-lg font-bold mt-1 block ${
                  activeMetrics.resultadoNeto === undefined
                    ? 'text-slate-400'
                    : activeMetrics.resultadoNeto >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                }`}
              >
                {activeMetrics.resultadoNeto !== undefined
                  ? `${formatCurrency(activeMetrics.resultadoNeto)} (${activeMetrics.margenPct}%)`
                  : 'Definí fechas o partes'}
              </span>
              <span className="font-sans text-[11px] text-slate-400">
                {activeMetrics.costoOperativo !== undefined
                  ? `Costo est.: ${formatCurrency(activeMetrics.costoOperativo)}`
                  : 'Requiere rango de fechas'}
              </span>
            </div>
          </div>

          {/* Segmented Inner Document Navigation */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setInnerSection('facturas')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                innerSection === 'facturas'
                  ? 'bg-amber-500 text-black'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Facturas ({activeMetrics.facturas.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setInnerSection('partes')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                innerSection === 'partes'
                  ? 'bg-amber-500 text-black'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Partes Diarios ({activeMetrics.partes.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setInnerSection('contratos')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                innerSection === 'contratos'
                  ? 'bg-amber-500 text-black'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>
                Contratos & Cotizaciones ({activeMetrics.rentals.length + activeMetrics.quotations.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setInnerSection('documentos')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                innerSection === 'documentos'
                  ? 'bg-amber-500 text-black'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span>Documentos / Archivos ({activeMetrics.adjuntos.length})</span>
            </button>
          </div>

          {/* SECTION 1: FACTURAS INSIDE CONTAINER */}
          {innerSection === 'facturas' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-400">
                  Facturas incluidas en "{activePeriod.titulo}"
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {onSaveRental && (
                    <button
                      type="button"
                      onClick={() => openRentalModalInContainer(null, false)}
                      className="px-3.5 py-2 bg-blue-500/15 hover:bg-blue-500/25 text-blue-200 border border-blue-500/35 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Truck className="w-3.5 h-3.5 text-blue-300" />
                      <span>+ Cargar Contrato de Alquiler</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowLinkFacturaPicker((v) => !v);
                      setShowNewFacturaForm(false);
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Link2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>{showLinkFacturaPicker ? 'Cerrar Selector' : 'Vincular Facturas de la Obra'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewFacturaForm((v) => !v);
                      setShowLinkFacturaPicker(false);
                    }}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Cargar Nueva Factura Aquí</span>
                  </button>
                </div>
              </div>

              {/* Banner: Auto-detect ARCA invoices already linked to Rentals inside this Container */}
              {pendingLinkedRentalInvoices.length > 0 && (
                <div className="bg-emerald-500/12 border border-emerald-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>
                        Hay {pendingLinkedRentalInvoices.length} factura(s) ARCA vinculada(s) a contratos de este contenedor
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      {pendingLinkedRentalInvoices
                        .map(
                          ({ inv, sourceRental }) =>
                            `${formatInvoiceNumber(inv)} (${sourceRental.numeroContrato} · ${formatCurrency(inv.importeTotal)})`
                        )
                        .join(' | ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleBringInvoicesToContainer(pendingLinkedRentalInvoices)}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black rounded-xl text-xs font-black cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Traer Factura(s) al Contenedor</span>
                  </button>
                </div>
              )}

              {/* Link Existing Factura Picker */}
              {showLinkFacturaPicker && (
                <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      Seleccioná facturas de la obra para meter dentro de este contenedor
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLinkFacturaPicker(false)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={facturaSearch}
                      onChange={(e) => setFacturaSearch(e.target.value)}
                      placeholder="Buscar por nro comprobante, concepto o fecha..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/70">
                    {pickerFacturas.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">
                        No hay facturas cargadas en la obra aún.
                      </p>
                    ) : (
                      pickerFacturas.map((f) => {
                        const inThis = f.periodoId === activePeriod.id;
                        const inOther = f.periodoId && f.periodoId !== activePeriod.id;
                        return (
                          <div key={f.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 font-mono text-slate-300">
                                <span className="font-bold text-amber-300">
                                  {f.tipoComprobante} {f.nroComprobante}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{f.fecha}</span>
                                {inOther && f.periodoTitulo && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-sans text-slate-400">En: {f.periodoTitulo}</span>
                                  </>
                                )}
                              </div>
                              <div className="text-white truncate">{f.concepto}</div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                              <span className="text-emerald-400 font-bold">{formatCurrency(f.importeTotal)}</span>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleToggleFacturaInContainer(f.id, !inThis)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
                                  inThis
                                    ? 'bg-slate-800 text-rose-300 hover:bg-rose-500/20'
                                    : 'bg-amber-500 text-black hover:bg-amber-400'
                                }`}
                              >
                                {inThis ? 'Quitar' : inOther ? 'Mover aquí' : 'Agregar'}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Quick Create / Import ARCA Invoice or Rental Contract inside Container */}
              {showNewFacturaForm && (
                <form
                  onSubmit={handleCreateFacturaInsideContainer}
                  className="bg-[#111318] border border-amber-500/40 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-xs font-bold text-white">
                      Nueva Factura dentro de "{activePeriod.titulo}"
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNewFacturaForm(false)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-amber-400 mb-1">
                        Importar desde Facturas ARCA emitidas (Opcional - trae contratos y partes)
                      </label>
                      <select
                        value={newFacArcaId}
                        onChange={(e) => handleImportArcaInsideContainer(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="">-- Carga manual / Elegir factura ARCA --</option>
                        {arcaInvoices.map((inv) => {
                          const res = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
                          return (
                            <option key={inv.id} value={inv.id}>
                              {isExternalMigratedInvoice(inv) ? '[OTRO SISTEMA] ' : ''}
                              {inv.fecha} | {inv.tipoComprobante.replace(/_/g, ' ')} {pad4(inv.puntoVenta)}-
                              {pad8(inv.numeroComprobante)} | {inv.razonSocialReceptor} | {formatCurrency(inv.importeTotal)}
                              {res.linkedPartes.length > 0 ? ` (${res.linkedPartes.length} partes)` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="block text-[11px] font-bold text-blue-300">
                          O llamar desde Contrato de Alquiler (si ya está facturado, trae su factura)
                        </label>
                        {onSaveRental && (
                          <button
                            type="button"
                            onClick={() => openRentalModalInContainer(null, true)}
                            className="text-[11px] font-bold text-amber-400 hover:text-amber-300 cursor-pointer whitespace-nowrap"
                          >
                            + Cargar Nuevo Contrato
                          </button>
                        )}
                      </div>
                      <select
                        value={newFacSelectedRentalId}
                        onChange={(e) => handleImportRentalInsideContainer(e.target.value)}
                        className="w-full bg-slate-950 border border-blue-500/35 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="">-- Elegir contrato de alquiler (abierto o facturado) --</option>
                        {pickerRentals.map((r) => {
                          const rLinks = resolveRentalContractLinks(r, partesDiarios, arcaInvoices);
                          const inThis = activeMetrics.rentals.some((mr) => mr.id === r.id);
                          const factLabel = rLinks.primaryInvoice
                            ? `✓ Factura ${rLinks.facturaNumero}`
                            : 'Sin facturar';
                          return (
                            <option key={r.id} value={r.id}>
                              {inThis ? '[EN CONTENEDOR] ' : ''}
                              {r.numeroContrato} | {r.equipoModelo} | {r.clienteNombre} | {formatCurrency(r.totalAlquiler)} ({factLabel})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {newFacImportNotice && (
                    <div
                      className={`rounded-xl px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 border ${
                        newFacImportNotice.tone === 'emerald'
                          ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-200'
                          : 'bg-amber-500/12 border-amber-500/35 text-amber-200'
                      }`}
                    >
                      <span>{newFacImportNotice.text}</span>
                      {newFacImportNotice.tone === 'amber' &&
                        newFacSelectedRentalId && (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleLinkOnlyRentalsToContainer()}
                              className="px-3 py-1 bg-blue-500 hover:bg-blue-400 text-black rounded-lg text-[11px] font-black cursor-pointer flex items-center gap-1 whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Solo Guardar Contrato</span>
                            </button>
                            {onInvoiceRentalInArca && (() => {
                              const targetRental = rentals.find((r) => r.id === newFacSelectedRentalId);
                              if (!targetRental) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onInvoiceRentalInArca(targetRental, {
                                      obraId: obra.id,
                                      periodoId: activePeriod.id
                                    })
                                  }
                                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-[11px] font-black cursor-pointer flex items-center gap-1 whitespace-nowrap"
                                >
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                  <span>Facturar este Contrato en ARCA</span>
                                </button>
                              );
                            })()}
                          </div>
                        )}
                    </div>
                  )}

                  {(() => {
                    const isContractOnlyMode = Boolean(
                      (newFacSelectedRentalId || newFacRentalIds.length > 0) && !newFacArcaId
                    );
                    return (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Tipo</label>
                            <select
                              value={newFacTipo}
                              onChange={(e) => setNewFacTipo(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                            >
                              <option value="FACTURA A">FACTURA A</option>
                              <option value="FACTURA B">FACTURA B</option>
                              <option value="FACTURA C">FACTURA C</option>
                              <option value="CERTIFICADO DE OBRA">CERTIFICADO DE OBRA</option>
                              <option value="NOTA DE CRÉDITO A">NOTA DE CRÉDITO A</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              {isContractOnlyMode
                                ? 'Nro. Comprobante (opcional si solo ponés el contrato)'
                                : 'Nro. Comprobante *'}
                            </label>
                            <input
                              type="text"
                              required={!isContractOnlyMode}
                              value={newFacNro}
                              onChange={(e) => setNewFacNro(e.target.value)}
                              placeholder={
                                isContractOnlyMode
                                  ? 'Dejar vacío para guardar solo el contrato'
                                  : '0005-00000123'
                              }
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Fecha</label>
                            <input
                              type="date"
                              value={newFacFecha}
                              onChange={(e) => setNewFacFecha(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Estado Cobro</label>
                            <select
                              value={newFacCobro}
                              onChange={(e) => setNewFacCobro(e.target.value as any)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                            >
                              <option value="PENDIENTE">PENDIENTE</option>
                              <option value="COBRADO_PARCIAL">COBRADO PARCIAL</option>
                              <option value="COBRADO">COBRADO</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            {isContractOnlyMode ? 'Concepto / Descripción' : 'Concepto / Descripción *'}
                          </label>
                          <input
                            type="text"
                            required={!isContractOnlyMode}
                            value={newFacConcepto}
                            onChange={(e) => setNewFacConcepto(e.target.value)}
                            placeholder="Detalle de trabajos, horas o certificación del período"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                          />
                        </div>
                      </>
                    );
                  })()}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono tabular-nums">
                    <div>
                      <label className="font-sans block text-[11px] text-slate-400 mb-1">Neto Gravado ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newFacNeto}
                        onChange={(e) => {
                          const n = Number(e.target.value) || 0;
                          setNewFacNeto(n);
                          setNewFacTotal(Number((n + newFacIva).toFixed(2)));
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="font-sans block text-[11px] text-slate-400 mb-1">IVA ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newFacIva}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          setNewFacIva(v);
                          setNewFacTotal(Number((newFacNeto + v).toFixed(2)));
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="font-sans block text-[11px] text-emerald-400 mb-1">Total c/ IVA ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newFacTotal}
                        onChange={(e) => setNewFacTotal(Number(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-emerald-500/40 rounded-xl px-3 py-2 text-xs text-emerald-400 font-bold"
                      />
                    </div>
                  </div>

                  {(newFacParteIds.length > 0 || newFacRentalIds.length > 0) && (
                    <div className="text-xs text-emerald-300 font-mono">
                      Se importarán automáticamente {newFacParteIds.length} parte(s) diario(s) y{' '}
                      {newFacRentalIds.length} contrato(s) de alquiler vinculados.
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowNewFacturaForm(false)}
                      className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    {(newFacSelectedRentalId || newFacRentalIds.length > 0) && !newFacArcaId && !newFacNro.trim() ? (
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black cursor-pointer"
                      >
                        Solo Guardar Contrato en Contenedor
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black cursor-pointer"
                      >
                        Guardar en Contenedor
                      </button>
                    )}
                  </div>
                </form>
              )}

              {/* Contratos vinculados en este contenedor (visibles incluso antes de facturarse) */}
              {activeMetrics.rentals.length > 0 && (
                <div className="bg-slate-900/70 border border-blue-500/30 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                      <Truck className="w-4 h-4" />
                      <span>Contratos de Alquiler en este Contenedor ({activeMetrics.rentals.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setInnerSection('contratos')}
                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300 cursor-pointer"
                    >
                      Administrar en Contratos & Cotizaciones →
                    </button>
                  </div>
                  <div className="divide-y divide-slate-800/70">
                    {activeMetrics.rentals.map((r) => {
                      const rLinks = resolveRentalContractLinks(r, partesDiarios, arcaInvoices);
                      const invInContainer = rLinks.primaryInvoice
                        ? activeMetrics.facturas.some((f) => f.arcaInvoiceId === rLinks.primaryInvoice!.id)
                        : false;
                      const inContainerDirect = (activePeriod.rentalIds || []).includes(r.id);

                      return (
                        <div
                          key={r.id}
                          className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap font-mono tabular-nums">
                              <span className="font-bold text-amber-300">{r.numeroContrato}</span>
                              <span className="text-white font-sans font-semibold truncate">
                                {r.equipoCodigoInterno ? `[${r.equipoCodigoInterno}] ` : ''}
                                {r.equipoModelo}
                              </span>
                              <span className="text-slate-400 font-sans">· {r.clienteNombre}</span>
                              {rLinks.linkedPartes.length > 0 && (
                                <span className="text-slate-300">· {rLinks.linkedPartes.length} partes</span>
                              )}
                            </div>
                            <div className="text-[11px] mt-0.5">
                              {rLinks.primaryInvoice ? (
                                <span className="text-emerald-300 font-mono font-semibold">
                                  ✓ Factura ARCA vinculada: {rLinks.facturaNumero} ({formatCurrency(rLinks.primaryInvoice.importeTotal)})
                                </span>
                              ) : (
                                <span className="text-amber-300/90">
                                  Contrato abierto sin facturar (se sumará la factura automáticamente al emitirla)
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                            {onSaveRental && (
                              <button
                                type="button"
                                onClick={() => openRentalModalInContainer(r, false)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold cursor-pointer flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3 text-amber-400" />
                                <span>Editar / Cargar</span>
                              </button>
                            )}
                            {rLinks.primaryInvoice && !invInContainer && (
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  handleBringInvoicesToContainer([
                                    { inv: rLinks.primaryInvoice!, sourceRental: r }
                                  ])
                                }
                                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-black cursor-pointer flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                <span>Traer Factura</span>
                              </button>
                            )}
                            {!rLinks.primaryInvoice && onInvoiceRentalInArca && (
                              <button
                                type="button"
                                onClick={() =>
                                  onInvoiceRentalInArca(r, {
                                    obraId: obra.id,
                                    periodoId: activePeriod.id
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/40 text-[11px] font-bold cursor-pointer flex items-center gap-1 transition"
                              >
                                <ArrowUpRight className="w-3 h-3" />
                                <span>Facturar en ARCA</span>
                              </button>
                            )}
                            {inContainerDirect && (
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleToggleContainerRental(r)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 text-[11px] font-semibold cursor-pointer"
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Invoices List inside this Container */}
              {activeMetrics.facturas.length === 0 ? (
                <div className="p-10 text-center bg-slate-900/40 border border-slate-800 rounded-2xl text-xs text-slate-400">
                  No hay facturas asignadas dentro de este contenedor todavía. Usá "Vincular Facturas de la Obra" o "Cargar Nueva Factura Aquí".
                </div>
              ) : (
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl divide-y divide-slate-800/80">
                  {activeMetrics.facturas.map((f) => {
                    const matchedArca = f.arcaInvoiceId
                      ? arcaInvoices.find((inv) => inv.id === f.arcaInvoiceId)
                      : undefined;
                    const isExt = isExternalMigratedInvoice(matchedArca);
                    const pCount = (f.parteDiarioIds || []).length;
                    const rCount = (f.rentalIds || []).length;
                    return (
                      <div key={f.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs flex-wrap font-mono tabular-nums">
                            <span className="font-bold text-amber-400">
                              {f.tipoComprobante} {f.nroComprobante}
                            </span>
                            {isExt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-orange-300 font-bold">Otro Sistema</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-400">{f.fecha}</span>
                            <span aria-hidden="true">·</span>
                            {(() => {
                              const live = resolveFacturaLegajoLiveStatus(
                                f,
                                arcaInvoices,
                                customerReceipts,
                                rentals,
                                partesDiarios
                              );
                              return (
                                <span
                                  className={
                                    live.estadoCobro === 'COBRADO'
                                      ? 'text-emerald-400 font-bold'
                                      : live.estadoCobro === 'COBRADO_PARCIAL'
                                        ? 'text-blue-400 font-bold'
                                        : 'text-amber-300'
                                  }
                                >
                                  {live.estadoCobro === 'COBRADO'
                                    ? 'PAGADO'
                                    : live.estadoCobro.replace('_', ' ')}
                                </span>
                              );
                            })()}
                            {pCount > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-300">{pCount} partes</span>
                              </>
                            )}
                            {rCount > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-300">{rCount} contratos</span>
                              </>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-white">{f.concepto}</div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right font-mono tabular-nums">
                            <div className="text-emerald-400 font-bold text-sm">
                              {formatCurrency(f.importeTotal)}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Neto: {formatCurrency(f.netoGravado)}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleToggleFacturaInContainer(f.id, false)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            Sacar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: PARTES DIARIOS INSIDE CONTAINER */}
          {innerSection === 'partes' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-400">
                  Incluye partes agregados directamente al contenedor y los absorbidos por sus facturas o contratos.
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {(activePeriod.fechaDesde || activePeriod.fechaHasta) && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handlePullPartesByDates}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Traer Partes por Fechas del Contenedor</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowPartesPicker((v) => !v)}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>{showPartesPicker ? 'Cerrar Selector' : 'Seleccionar Partes Manualmente'}</span>
                  </button>
                </div>
              </div>

              {showPartesPicker && (
                <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white">
                      Tildá o destildá partes diarios para este período
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAllPartes((v) => !v)}
                      className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                    >
                      {showAllPartes ? 'Ver solo de esta obra' : `Ver todos (${partesDiarios.length})`}
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={parteSearch}
                      onChange={(e) => setParteSearch(e.target.value)}
                      placeholder="Buscar por nro parte, fecha, equipo o operario..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/70">
                    {pickerPartes.map((p) => {
                      const isDirect = activeMetrics.directParteIds.has(p.id);
                      const isAbsorbed = activeMetrics.absorbedParteIds.has(p.id);
                      return (
                        <label
                          key={p.id}
                          className="py-2 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-slate-800/30 px-2 rounded"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isDirect}
                              disabled={isSaving}
                              onChange={() => handleToggleDirectParte(p.id)}
                              className="accent-amber-500 cursor-pointer"
                            />
                            <div className="min-w-0 truncate font-mono">
                              <span className="font-bold text-amber-400 mr-2">#{p.numParte}</span>
                              <span className="text-slate-400 mr-2">{p.fecha}</span>
                              <span className="font-sans text-white">{p.marcaModelo || p.codigoEquipo}</span>
                              <span className="font-sans text-slate-400 ml-2">({p.nombreApellido})</span>
                              {isAbsorbed && !isDirect && (
                                <span className="font-sans text-emerald-400 ml-2">· vía Factura/Contrato</span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono font-bold text-emerald-400 shrink-0">
                            {p.tipo === 'HORAS'
                              ? `${p.horasTrabajadas || p.hsCantidad || 0} hs`
                              : `${p.viajesCantidad || p.cantidad || 0} vj`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeMetrics.partes.length === 0 ? (
                <div className="p-10 text-center bg-slate-900/40 border border-slate-800 rounded-2xl text-xs text-slate-400">
                  No hay partes diarios dentro de este contenedor todavía.
                </div>
              ) : (
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-[11px] text-slate-400">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Parte / Fecha</th>
                        <th className="py-2.5 px-3 font-semibold">Equipo</th>
                        <th className="py-2.5 px-3 font-semibold">Operario</th>
                        <th className="py-2.5 px-3 font-semibold">Origen en Contenedor</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Trabajo</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 tabular-nums">
                      {activeMetrics.partes.map((p) => {
                        const isDirect = activeMetrics.directParteIds.has(p.id);
                        const isAbsorbed = activeMetrics.absorbedParteIds.has(p.id);
                        return (
                          <tr key={p.id} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                              <span className="font-bold text-amber-400">#{p.numParte}</span>
                              <span className="text-slate-400 ml-2">{p.fecha}</span>
                            </td>
                            <td className="py-2.5 px-3 text-white font-medium">
                              {p.codigoEquipo} · {p.marcaModelo}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">{p.nombreApellido}</td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {isDirect && isAbsorbed
                                ? 'Directo + Factura/Contrato'
                                : isDirect
                                  ? 'Directo en contenedor'
                                  : 'Vía Factura / Contrato'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                              {p.tipo === 'HORAS'
                                ? `${p.horasTrabajadas || p.hsCantidad || 0} hs`
                                : `${p.viajesCantidad || p.cantidad || 1} vj`}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {isDirect ? (
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => handleToggleDirectParte(p.id)}
                                  className="text-xs text-rose-300 hover:text-rose-200 font-semibold cursor-pointer"
                                >
                                  Quitar
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-500">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: CONTRATOS & COTIZACIONES INSIDE CONTAINER */}
          {innerSection === 'contratos' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Contratos de Alquiler */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Truck className="w-4 h-4 text-amber-400" />
                    <span>Contratos de Alquiler ({activeMetrics.rentals.length} en este período)</span>
                  </span>
                  {onSaveRental && (
                    <button
                      type="button"
                      onClick={() => openRentalModalInContainer(null, false)}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-[11px] font-black cursor-pointer flex items-center gap-1 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Nuevo Contrato de Alquiler</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={rentalSearch}
                    onChange={(e) => setRentalSearch(e.target.value)}
                    placeholder="Buscar contrato, máquina o cliente..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/70">
                  {pickerRentals.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">
                      Sin contratos coincidentes. Podés cargar uno nuevo con "+ Nuevo Contrato de Alquiler".
                    </p>
                  ) : (
                    pickerRentals.map((r) => {
                      const inContainer = (activePeriod.rentalIds || []).includes(r.id);
                      const fromFactura = activeMetrics.rentals.some((mr) => mr.id === r.id) && !inContainer;
                      const rLinks = resolveRentalContractLinks(r, partesDiarios, arcaInvoices);
                      const linkedInvInContainer = rLinks.primaryInvoice
                        ? activeMetrics.facturas.some((f) => f.arcaInvoiceId === rLinks.primaryInvoice!.id)
                        : false;

                      return (
                        <div
                          key={r.id}
                          className="py-3 flex flex-col gap-2 text-xs hover:bg-slate-800/30 px-2 rounded transition"
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={inContainer}
                              disabled={isSaving}
                              onChange={() => handleToggleContainerRental(r)}
                              aria-label={`Vincular contrato ${r.numeroContrato}`}
                              className="mt-0.5 accent-amber-500 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                                <span className="font-bold text-amber-300">
                                  {r.numeroContrato}
                                  {r.estado === 'ACTIVO' && (
                                    <span className="ml-2 font-sans text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                      ABIERTO
                                    </span>
                                  )}
                                </span>
                                <span className="text-emerald-400 font-bold">
                                  {formatCurrency(r.totalAlquiler)}
                                </span>
                              </div>
                              <div className="text-white font-medium truncate">
                                {r.equipoCodigoInterno ? `[${r.equipoCodigoInterno}] ` : ''}
                                {r.equipoModelo}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {r.clienteNombre} · {r.fechaInicio} / {r.fechaDevolucionReal || r.fechaFinEstimada}
                                {rLinks.linkedPartes.length > 0 ? ` · ${rLinks.linkedPartes.length} parte(s)` : ''}
                                {fromFactura ? ' · (Ya incluido vía Factura)' : ''}
                              </div>
                            </div>
                          </div>

                          <div className="pl-6 flex flex-wrap items-center justify-between gap-2">
                            {rLinks.primaryInvoice ? (
                              <span className="text-[11px] font-mono text-emerald-300 font-semibold">
                                ✓ Factura ARCA: {rLinks.facturaNumero} ({formatCurrency(rLinks.primaryInvoice.importeTotal)})
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                Sin factura ARCA vinculada todavía
                              </span>
                            )}

                            <div className="flex items-center gap-1.5 flex-wrap">
                              {onSaveRental && (
                                <button
                                  type="button"
                                  onClick={() => openRentalModalInContainer(r, false)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold cursor-pointer flex items-center gap-1"
                                  title="Editar contrato / seguir cargando ítems o horas"
                                >
                                  <Edit3 className="w-3 h-3 text-amber-400" />
                                  <span>Editar / Cargar</span>
                                </button>
                              )}

                              {rLinks.primaryInvoice && !linkedInvInContainer && (
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() =>
                                    handleBringInvoicesToContainer([
                                      { inv: rLinks.primaryInvoice!, sourceRental: r }
                                    ])
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-black cursor-pointer flex items-center gap-1"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Traer Factura</span>
                                </button>
                              )}

                              {!rLinks.primaryInvoice && onInvoiceRentalInArca && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onInvoiceRentalInArca(r, {
                                      obraId: obra.id,
                                      periodoId: activePeriod.id
                                    })
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/40 text-[11px] font-bold cursor-pointer flex items-center gap-1 transition"
                                >
                                  <ArrowUpRight className="w-3 h-3" />
                                  <span>Facturar en ARCA</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Cotizaciones */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span>Cotizaciones ({activeMetrics.quotations.length} en este período)</span>
                  </span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={quotationSearch}
                    onChange={(e) => setQuotationSearch(e.target.value)}
                    placeholder="Buscar cotización, cliente o ítem..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/70">
                  {pickerQuotations.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">Sin cotizaciones coincidentes.</p>
                  ) : (
                    pickerQuotations.map((qt) => {
                      const inContainer = (activePeriod.cotizacionIds || []).includes(qt.id);
                      const fromLinked =
                        activeMetrics.quotations.some((mq) => mq.id === qt.id) && !inContainer;
                      const numFmt = `${pad4(qt.puntoVenta)}-${pad8(qt.numeroComprobante)}`;
                      return (
                        <label
                          key={qt.id}
                          className="py-2.5 flex items-start gap-2.5 text-xs cursor-pointer hover:bg-slate-800/30 px-2 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={inContainer}
                            disabled={isSaving}
                            onChange={() => handleToggleContainerQuotation(qt.id)}
                            className="mt-0.5 accent-amber-500 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                              <span className="font-bold text-amber-300">COT {numFmt}</span>
                              <span className="text-emerald-400 font-bold">{formatCurrency(qt.importeTotal)}</span>
                            </div>
                            <div className="text-white font-medium truncate">{qt.razonSocialReceptor}</div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {qt.fechaEmision} · {qt.items?.length || 0} ítems
                              {fromLinked ? ' · (Ya incluida vía Factura/Contrato)' : ''}
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

          {/* SECTION 4: DOCUMENTOS / ARCHIVOS ADJUNTOS INSIDE CONTAINER */}
          {innerSection === 'documentos' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h5 className="text-sm font-bold text-white flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-amber-400" />
                    <span>Documentos y Archivos del Contenedor</span>
                  </h5>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Subí PDFs de certificados, remitos firmados, planillas, contratos o comprobantes de este período.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={newAdjuntoTipo}
                    onChange={(e) => setNewAdjuntoTipo(e.target.value as any)}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="FACTURA">PDF / Foto Factura</option>
                    <option value="RESUMEN_VALORIZADO">Resumen Valorizado</option>
                    <option value="PARTE_DIARIO">Parte Diario / Planilla</option>
                    <option value="CONTRATO">Contrato Firmado</option>
                    <option value="COTIZACION">Cotización / Certificado</option>
                    <option value="REMITO">Remito</option>
                    <option value="OTRO">Otro Documento</option>
                  </select>

                  <label className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black cursor-pointer flex items-center gap-2 whitespace-nowrap">
                    {isUploadingFile ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>{isUploadingFile ? 'Subiendo...' : 'Subir Documento'}</span>
                    <input
                      type="file"
                      accept="application/pdf,image/*,.xlsx,.xls,.csv,.doc,.docx"
                      onChange={handleContainerFileUpload}
                      className="hidden"
                      disabled={isUploadingFile}
                    />
                  </label>
                </div>
              </div>

              {activeMetrics.adjuntos.length === 0 ? (
                <div className="p-10 text-center bg-slate-950/50 border border-slate-800 rounded-xl text-xs text-slate-400">
                  No hay archivos subidos directamente a este contenedor todavía.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeMetrics.adjuntos.map((att) => (
                    <div
                      key={att.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="text-white font-semibold truncate">{att.nombre}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                          <span>{att.tipo}</span>
                          <span aria-hidden="true">·</span>
                          <span>{att.fechaSubida}</span>
                          {att.tamanio && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{att.tamanio}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewAdjunto(att)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                          title="Ver documento"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={att.url}
                          download={att.nombre}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300"
                          title="Descargar"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleRemoveContainerAdjunto(att.id)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 cursor-pointer"
                          title="Quitar documento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[65vh] object-contain rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rental Contract Create / Edit Modal inside Obra Container */}
      {onSaveRental && (
        <RentalFormModal
          isOpen={isRentalModalOpen}
          onClose={() => {
            setIsRentalModalOpen(false);
            setRentalToEditInContainer(null);
            setAttachSavedRentalToNewFactura(false);
          }}
          onSave={handleSaveRentalFromContainer}
          contractToEdit={rentalToEditInContainer}
          fleet={fleet}
          employees={employees}
          existingCount={rentals.length}
          quotations={quotations}
          partesDiarios={partesDiarios}
          invoices={arcaInvoices}
          defaultObra={{
            id: obra.id,
            numero: obra.numero,
            nombreObra: obra.nombreObra,
            ubicacion: obra.ubicacion,
            pertenece: obra.pertenece
          }}
          defaultPeriodRange={
            activePeriod
              ? {
                  fechaDesde: activePeriod.fechaDesde,
                  fechaHasta: activePeriod.fechaHasta,
                  titulo: activePeriod.titulo
                }
              : null
          }
        />
      )}
    </div>
  );
};
