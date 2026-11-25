import React, { useState, useMemo, useEffect } from 'react';
import {
  Obra,
  ParteDiario,
  ArcaInvoice,
  CustomerPaymentReceipt,
  RentalContract,
  Quotation,
  Vehicle,
  FuelDispensary,
  StockMovement,
  StockItem,
  VehicleServiceLog,
  VehicleExpenseLog,
  Employee,
  SupabaseUsuario,
  SupabaseCategoria,
  PurchaseInvoice,
  PreselectedResumenForArca
} from '../types';
import {
  X,
  Building2,
  MapPin,
  DollarSign,
  Calendar,
  UserCheck,
  FileText,
  Clock,
  ClipboardList,
  Archive,
  ArchiveRestore,
  Receipt,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  Edit3,
  Users,
  Fuel,
  FolderOpen,
  FileSpreadsheet,
  Banknote,
  CheckCircle2,
  Eye
} from 'lucide-react';
import { formatCurrency, loadFuelPrices } from '../services/storage';
import { apiFetchSetting, apiSaveSettingStrict } from '../services/api';
import { computeObraRentabilidad } from '../utils/obraCostosEngine';
import { formatInvoiceLabel } from '../utils/crossLinks';
import {
  isArcaInvoiceFullyPaid,
  isAutoDetectedObra,
  resolveObraFullLegajo
} from '../utils/obraLegajoResolver';
import {
  MacheoToleranceConfig,
  DEFAULT_MACHEO_TOLERANCE_CONFIG,
  normalizeMacheoToleranceConfig
} from '../utils/parteKilometrajeCross';
import { PayrollPeriodRecord } from '../utils/payrollParser';
import { ObraFacturacionLegajosTab } from './Obras/ObraFacturacionLegajosTab';
import { ObraContenedoresTab } from './Obras/ObraContenedoresTab';
import { ObraCostosRentabilidadTab } from './Obras/ObraCostosRentabilidadTab';
import { ObraPersonalTab } from './Obras/ObraPersonalTab';
import { ObraCombustibleTab } from './Obras/ObraCombustibleTab';
import { ObraPartesMacheoTab } from './Obras/ObraPartesMacheoTab';
import { ObraResumenCascadaTable } from './Obras/ObraResumenCascadaTable';
import { ObraResumenValorizadoTab } from './Obras/ObraResumenValorizadoTab';
import {
  ObraFacturaPreviewModal,
  ObraReceiptPreviewModal
} from './Obras/ObraLegajoFacturaPagoModals';

interface ObraDetailModalProps {
  obra: Obra | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (obra: Obra) => void;
  onArchive?: (obra: Obra) => void;
  onSaveObraLegajo: (updatedObra: Obra) => Promise<{ ok: boolean; error?: string }>;
  partesDiarios?: ParteDiario[];
  arcaInvoices?: ArcaInvoice[];
  customerReceipts?: CustomerPaymentReceipt[];
  rentals?: RentalContract[];
  quotations?: Quotation[];
  fleet?: Vehicle[];
  fuelVouchers?: FuelDispensary[];
  stockMovements?: StockMovement[];
  stockItems?: StockItem[];
  servicesLogs?: VehicleServiceLog[];
  expensesLogs?: VehicleExpenseLog[];
  employees?: Employee[];
  supabaseUsuarios?: SupabaseUsuario[];
  supabaseCategorias?: SupabaseCategoria[];
  purchaseInvoices?: PurchaseInvoice[];
  initialTab?: 'info' | 'valorizado' | 'facturas' | 'contenedores' | 'personal' | 'combustible' | 'costos' | 'partes';
  layoutMode?: 'modal' | 'workspace';
  onSaveRental?: (contract: RentalContract, linkedQuotationId?: string) => Promise<void> | void;
  onInvoiceRentalInArca?: (
    contract: RentalContract,
    context?: { obraId: string; periodoId?: string }
  ) => void;
  onInvoiceResumenInArca?: (payload: PreselectedResumenForArca) => void;
  onNavigateToArca?: (invoice: ArcaInvoice) => void;
  onNavigateToCobranzas?: () => void;
}

export const ObraDetailModal: React.FC<ObraDetailModalProps> = ({
  obra,
  isOpen,
  onClose,
  onEdit,
  onArchive,
  onSaveObraLegajo,
  partesDiarios = [],
  arcaInvoices = [],
  customerReceipts = [],
  rentals = [],
  quotations = [],
  fleet = [],
  fuelVouchers = [],
  stockMovements = [],
  stockItems = [],
  servicesLogs = [],
  expensesLogs = [],
  employees = [],
  supabaseUsuarios = [],
  supabaseCategorias = [],
  purchaseInvoices = [],
  initialTab = 'info',
  layoutMode = 'modal',
  onSaveRental,
  onInvoiceRentalInArca,
  onInvoiceResumenInArca,
  onNavigateToArca,
  onNavigateToCobranzas
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'valorizado' | 'facturas' | 'contenedores' | 'personal' | 'combustible' | 'costos' | 'partes'>(initialTab);
  const [selectedContenedorId, setSelectedContenedorId] = useState<string>('ALL');
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriodRecord[]>([]);
  const [payrollDirectoryLinks, setPayrollDirectoryLinks] = useState<Record<string, string>>({});
  const [macheoTolerance, setMacheoTolerance] = useState<MacheoToleranceConfig>(
    DEFAULT_MACHEO_TOLERANCE_CONFIG
  );
  const [previewArcaInvoice, setPreviewArcaInvoice] = useState<ArcaInvoice | null>(null);
  const [previewPaymentReceipt, setPreviewPaymentReceipt] = useState<CustomerPaymentReceipt | null>(null);
  const [isMaterializingObra, setIsMaterializingObra] = useState(false);

  useEffect(() => {
    setSelectedContenedorId('ALL');
  }, [obra?.id]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      Promise.all([
        fetch('/api/settings/payroll_periods_data').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/settings/payroll_sheets_config').then((r) => (r.ok ? r.json() : null)),
        apiFetchSetting<Partial<MacheoToleranceConfig>>('obra_macheo_tolerances')
      ])
        .then(([rawPeriods, rawCfg, rawTolerance]) => {
          const list = Array.isArray(rawPeriods)
            ? rawPeriods
            : Array.isArray(rawPeriods?.value)
            ? rawPeriods.value
            : [];
          setPayrollPeriods(list);
          const cfg = rawCfg?.value || rawCfg || {};
          if (cfg?.employeeDirectoryLinks && typeof cfg.employeeDirectoryLinks === 'object') {
            setPayrollDirectoryLinks(cfg.employeeDirectoryLinks);
          }
          if (rawTolerance && typeof rawTolerance === 'object') {
            setMacheoTolerance(normalizeMacheoToleranceConfig(rawTolerance));
          }
        })
        .catch(() => {});
    }
  }, [isOpen, obra?.id, initialTab]);

  const handleSaveMacheoTolerance = async (
    nextCfg: MacheoToleranceConfig
  ): Promise<{ ok: boolean; error?: string }> => {
    const normalized = normalizeMacheoToleranceConfig(nextCfg);
    const res = await apiSaveSettingStrict('obra_macheo_tolerances', normalized);
    if (!res.ok) {
      return {
        ok: false,
        error: res.error || 'No se pudieron guardar las tolerancias en Supabase.'
      };
    }
    setMacheoTolerance(normalized);
    return { ok: true };
  };

  const fuelPricesCatalog = useMemo(() => loadFuelPrices(), []);

  const rentabilidadQuick = useMemo(() => {
    if (!obra) return null;
    return computeObraRentabilidad({
      obra,
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
  }, [
    obra,
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
  ]);

  const fullLegajo = useMemo(() => {
    if (!obra) return null;
    return resolveObraFullLegajo({
      obra,
      partesDiarios,
      rentals,
      arcaInvoices,
      customerReceipts,
      quotations
    });
  }, [obra, partesDiarios, rentals, arcaInvoices, customerReceipts, quotations]);

  const obraPartes = useMemo(() => {
    if (!obra) return [];
    if (fullLegajo) return fullLegajo.obraPartes;
    return [];
  }, [obra, fullLegajo]);

  const effectiveContenedorId = useMemo(() => {
    if (!obra || selectedContenedorId === 'ALL') return 'ALL';
    const exists = (obra.periodosLegajo || []).some((per) => per.id === selectedContenedorId);
    return exists ? selectedContenedorId : 'ALL';
  }, [obra, selectedContenedorId]);

  const rentabilidadActive = useMemo(() => {
    if (!obra) return null;
    if (effectiveContenedorId === 'ALL') return rentabilidadQuick;
    return computeObraRentabilidad({
      obra,
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
      contenedorId: effectiveContenedorId,
      arcaInvoices,
      customerReceipts
    });
  }, [
    effectiveContenedorId,
    rentabilidadQuick,
    obra,
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
  ]);

  const scopedObraPartes = useMemo(() => {
    if (!obra || effectiveContenedorId === 'ALL') return obraPartes;
    return rentabilidadActive?.partesVinculados || obraPartes;
  }, [obra, effectiveContenedorId, obraPartes, rentabilidadActive]);

  if (!isOpen || !obra) return null;

  const periodosList = obra.periodosLegajo || [];
  const activeContenedor =
    effectiveContenedorId !== 'ALL'
      ? periodosList.find((per) => per.id === effectiveContenedorId)
      : undefined;

  const totalHoras = scopedObraPartes.reduce((acc, p) => acc + (p.horasTrabajadas || p.hsCantidad || 0), 0);
  const totalViajes = scopedObraPartes.reduce((acc, p) => acc + (p.viajesCantidad || p.cantidad || 0), 0);
  const equiposUnicos = Array.from(new Set(scopedObraPartes.map((p) => p.codigoEquipo).filter(Boolean)));
  const facturasCount = (obra.facturasLegajo || []).length;
  const scopedFacturasCount = activeContenedor
    ? (obra.facturasLegajo || []).filter((f) => f.periodoId === activeContenedor.id).length
    : facturasCount;
  const resumenesCount = (obra.resumenesValorizados || []).length;
  const scopedResumenesCount = activeContenedor
    ? (obra.resumenesValorizados || []).filter((r) => r.periodoId === activeContenedor.id).length
    : resumenesCount;
  const periodosCount = periodosList.length;
  const personalCount = rentabilidadActive?.sueldosAuto.filter((s) => !s.excluded).length || 0;
  const combustibleCount = rentabilidadActive?.combustiblesAuto.filter((c) => !c.excluded).length || 0;
  const partesCountBadge = effectiveContenedorId !== 'ALL' ? scopedObraPartes.length : obraPartes.length;

  const isWorkspace = layoutMode === 'workspace';

  return (
    <div
      className={
        isWorkspace
          ? 'w-full space-y-4 animate-fade-in'
          : 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in'
      }
    >
      <div
        className={
          isWorkspace
            ? 'bg-[#16191F] border border-slate-800 rounded-2xl w-full shadow-2xl flex flex-col overflow-hidden'
            : 'bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]'
        }
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {isWorkspace && (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                title="Volver al listado de Obras"
              >
                <ArrowLeft className="w-4 h-4 text-amber-400" />
                <span>Volver a Obras</span>
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-amber-400 font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  {obra.numero}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    obra.archivado
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : obra.activa
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {obra.archivado ? 'ARCHIVADA' : obra.activa ? 'ACTIVA' : 'INACTIVA'}
                </span>
                {fullLegajo?.estadoLegajo === 'TERMINADA_PAGADA' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/45">
                    <CheckCircle2 className="w-3 h-3" />
                    OBRA TERMINADA (PAGADA 100%)
                  </span>
                )}
                {fullLegajo && fullLegajo.estadoLegajo !== 'TERMINADA_PAGADA' && fullLegajo.estadoLegajo !== 'SIN_MOVIMIENTOS' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/35">
                    {fullLegajo.estadoLabel}
                  </span>
                )}
                {(() => {
                  const cat = obra.categoriaDuracion || 'LARGA';
                  return (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        cat === 'ESPORADICA'
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                          : cat === 'CORTA'
                          ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35'
                          : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                      }`}
                    >
                      {cat === 'ESPORADICA' ? '⚡ OBRA ESPORÁDICA' : cat === 'CORTA' ? '⏱️ OBRA CORTA' : '🏗️ OBRA LARGA'}
                    </span>
                  );
                })()}
                {(obra.clienteNombre || obra.pertenece) && (
                  <span className="text-xs text-slate-300 truncate flex items-center gap-1">
                    • {obra.clienteNombre || obra.pertenece}
                    {obra.clienteCodigo && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                        {obra.clienteCodigo}
                      </span>
                    )}
                  </span>
                )}
              </div>
              <h3 className="text-white font-bold text-lg sm:text-xl mt-0.5 truncate">{obra.nombreObra}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {isWorkspace && (
              <button
                type="button"
                onClick={() => onEdit(obra)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span>Editar Datos</span>
              </button>
            )}
            {onArchive && (
              <button
                onClick={() => onArchive(obra)}
                className={`p-2 rounded-lg transition border cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                  obra.archivado
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500 hover:text-black'
                    : 'bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 text-slate-300 border-slate-700'
                }`}
                title={
                  obra.archivado
                    ? 'Desarchivar y reincorporar a obras vigentes'
                    : 'Archivar obra (conserva partes diarios e historiales)'
                }
              >
                {obra.archivado ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                {isWorkspace && <span className="hidden sm:inline">{obra.archivado ? 'Desarchivar' : 'Archivar'}</span>}
              </button>
            )}
            {!isWorkspace && (
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Top Scope Selector: Toda la obra vs Por contenedor */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-950/85 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-semibold text-slate-400 whitespace-nowrap shrink-0">
              Analizar:
            </span>
            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setSelectedContenedorId('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  effectiveContenedorId === 'ALL'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Toda la obra</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (periodosList.length > 0) {
                    setSelectedContenedorId(
                      effectiveContenedorId !== 'ALL' ? effectiveContenedorId : periodosList[0].id
                    );
                  } else {
                    setActiveTab('contenedores');
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  effectiveContenedorId !== 'ALL'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Por contenedor</span>
              </button>
            </div>

            {periodosList.length > 0 ? (
              <select
                value={effectiveContenedorId}
                onChange={(e) => setSelectedContenedorId(e.target.value)}
                aria-label="Seleccionar alcance de análisis de la obra"
                className={`bg-slate-900 border rounded-xl px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-amber-500 cursor-pointer max-w-[320px] ${
                  effectiveContenedorId !== 'ALL'
                    ? 'border-amber-500/50 text-amber-200'
                    : 'border-slate-700 text-slate-200'
                }`}
              >
                <option value="ALL">Toda la obra (todos los contenedores)</option>
                {periodosList.map((per) => (
                  <option key={per.id} value={per.id}>
                    {per.titulo}
                    {per.fechaDesde || per.fechaHasta
                      ? ` (${per.fechaDesde || '...'} → ${per.fechaHasta || '...'})`
                      : ''}
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('contenedores')}
                className="text-xs text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline cursor-pointer whitespace-nowrap shrink-0"
              >
                Crear primer contenedor para filtrar por período
              </button>
            )}
          </div>

          {activeContenedor ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="text-amber-300 font-semibold">{activeContenedor.titulo}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{scopedFacturasCount} fact.</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{partesCountBadge} partes</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{personalCount} op.</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{combustibleCount} cargas</span>
              <button
                type="button"
                onClick={() => setSelectedContenedorId('ALL')}
                className="ml-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
              >
                Ver toda la obra
              </button>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
              <span>Mostrando acumulados completos de la obra</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{facturasCount} fact.</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{obraPartes.length} partes</span>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/50 px-6 gap-5 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('info')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'info'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Resumen</span>
          </button>

          <button
            onClick={() => setActiveTab('valorizado')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'valorizado'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
            title="Planilla opcional previa a facturación (tipo Excel) con partes diarios y precios editables"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Resumen Valorizado ({scopedResumenesCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('facturas')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'facturas'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Facturación & Legajos ({scopedFacturasCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('contenedores')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'contenedores'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Contenedores ({periodosCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('personal')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'personal'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Personal ({personalCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('combustible')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'combustible'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Fuel className="w-4 h-4" />
            <span>Combustible ({combustibleCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('costos')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'costos'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Costos & Rentabilidad</span>
          </button>

          <button
            onClick={() => setActiveTab('partes')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'partes'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Partes & Odómetro ({partesCountBadge})</span>
          </button>
        </div>

        {/* Content */}
        <div className={isWorkspace ? 'p-4 sm:p-6 space-y-5 flex-1' : 'p-6 space-y-5 overflow-y-auto flex-1'}>
          {isAutoDetectedObra(obra) && (
            <div className="bg-cyan-500/10 border border-cyan-500/35 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-cyan-200">
              <div>
                <p className="text-xs font-bold text-white">
                  Obra detectada automáticamente desde Partes Diarios / Contratos
                </p>
                <p className="text-[11px] text-cyan-200/80">
                  Ya podés consultar todos sus partes, facturas y recibos de pago. Si querés fijar su ficha permanente en la base de Obras, guardala en 1 clic.
                </p>
              </div>
              <button
                type="button"
                disabled={isMaterializingObra}
                onClick={async () => {
                  setIsMaterializingObra(true);
                  const cleanObra: Obra = { ...obra };
                  delete (cleanObra as any).esDetectadaDesdePartes;
                  await onSaveObraLegajo(cleanObra);
                  setIsMaterializingObra(false);
                }}
                className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black shrink-0 cursor-pointer disabled:opacity-50"
              >
                {isMaterializingObra ? 'Guardando...' : 'Guardar Ficha en Obras'}
              </button>
            </div>
          )}

          {obra.archivado && (
            <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-300">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <Archive className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Obra Archivada / Histórica</p>
                  <p className="text-[11px] text-amber-300/80">
                    Todos los partes diarios, facturas, legajos y costos se encuentran resguardados en Supabase.
                  </p>
                </div>
              </div>
              {onArchive && (
                <button
                  onClick={() => onArchive(obra)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <ArchiveRestore className="w-3.5 h-3.5" />
                  <span>Desarchivar</span>
                </button>
              )}
            </div>
          )}

          {activeTab === 'info' && (
            <div className="space-y-5 animate-fade-in">
              {/* Legajo Integral: Estado de Obra, Partes, Facturas y Pagos */}
              {fullLegajo && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FolderOpen className="w-4 h-4 text-amber-400" />
                      <h4 className="text-sm font-black text-white">
                        Legajo Integral de la Obra (Partes · Facturas · Pagos)
                      </h4>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          fullLegajo.estadoLegajo === 'TERMINADA_PAGADA'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/45'
                            : fullLegajo.estadoLegajo === 'FACTURADA_PENDIENTE'
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                            : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35'
                        }`}
                      >
                        {fullLegajo.estadoLegajo === 'TERMINADA_PAGADA' && <CheckCircle2 className="w-3 h-3" />}
                        {fullLegajo.estadoLabel}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{fullLegajo.estadoSubtitle}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Col 1: Partes */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-amber-300 flex items-center gap-1.5">
                          <ClipboardList className="w-3.5 h-3.5" />
                          Partes Diarios ({fullLegajo.obraPartes.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('partes')}
                          className="text-[11px] font-bold text-amber-400 hover:underline cursor-pointer"
                        >
                          Ver Partes →
                        </button>
                      </div>
                      <div className="text-xs text-slate-300 font-mono">
                        {fullLegajo.totalHoras.toFixed(1)} hs · {fullLegajo.totalViajes} viajes
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {fullLegajo.invoicedPartesCount} facturado(s) · {fullLegajo.unbilledPartesCount} pendiente(s)
                      </div>
                    </div>

                    {/* Col 2: Facturas */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-white flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-amber-400" />
                          Facturas ({fullLegajo.activeBillingInvoices.length + fullLegajo.manualOnlyLegajos.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('facturas')}
                          className="text-[11px] font-bold text-amber-400 hover:underline cursor-pointer"
                        >
                          Ver Legajos →
                        </button>
                      </div>
                      <div className="text-sm font-mono font-bold text-white">
                        {formatCurrency(fullLegajo.totalFacturado)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {fullLegajo.activeBillingInvoices.slice(0, 4).map((inv) => {
                          const paid = isArcaInvoiceFullyPaid(inv, customerReceipts);
                          return (
                            <button
                              key={inv.id}
                              type="button"
                              onClick={() => setPreviewArcaInvoice(inv)}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border cursor-pointer flex items-center gap-1 ${
                                paid
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 hover:bg-emerald-500/25'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/35 hover:bg-amber-500/25'
                              }`}
                            >
                              <Eye className="w-3 h-3" />
                              {formatInvoiceLabel(inv)}
                            </button>
                          );
                        })}
                        {fullLegajo.activeBillingInvoices.length === 0 && (
                          <span className="text-[11px] text-slate-500">Sin facturas ARCA vinculadas aún</span>
                        )}
                      </div>
                    </div>

                    {/* Col 3: Pagos / Recibos */}
                    <div className="bg-slate-950/70 border border-emerald-500/25 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-emerald-300 flex items-center gap-1.5">
                          <Banknote className="w-3.5 h-3.5" />
                          Pagos / Recibos ({fullLegajo.linkedReceipts.length})
                        </span>
                        {onNavigateToCobranzas && (
                          <button
                            type="button"
                            onClick={onNavigateToCobranzas}
                            className="text-[11px] font-bold text-emerald-400 hover:underline cursor-pointer"
                          >
                            Cobranzas →
                          </button>
                        )}
                      </div>
                      <div className="text-sm font-mono font-bold text-emerald-400">
                        Cobrado: {formatCurrency(fullLegajo.totalCobrado)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {fullLegajo.linkedReceipts.slice(0, 4).map((rec) => (
                          <button
                            key={rec.id}
                            type="button"
                            onClick={() => setPreviewPaymentReceipt(rec)}
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 cursor-pointer flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            Rec #{rec.numeroRecibo} ({rec.fecha})
                          </button>
                        ))}
                        {fullLegajo.linkedReceipts.length === 0 && (
                          <span className="text-[11px] text-slate-500">
                            {fullLegajo.saldoPendiente > 0.5
                              ? `Saldo pendiente: ${formatCurrency(fullLegajo.saldoPendiente)}`
                              : 'Sin recibos de cobranza imputados'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Quick Financial Snapshot */}
              {rentabilidadActive && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pb-2 border-b border-slate-800/80">
                    <span>
                      Resumen financiero:{' '}
                      <strong className="text-slate-200">
                        {activeContenedor ? `Contenedor «${activeContenedor.titulo}»` : 'Toda la obra'}
                      </strong>
                    </span>
                    {activeContenedor && (activeContenedor.fechaDesde || activeContenedor.fechaHasta) && (
                      <span className="font-mono tabular-nums text-slate-400">
                        {activeContenedor.fechaDesde || '...'} / {activeContenedor.fechaHasta || '...'}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <span className="text-[11px] uppercase text-slate-400 font-bold block">
                        Facturado en Legajos ({scopedFacturasCount})
                      </span>
                      <span className="text-base font-mono tabular-nums font-bold text-white">
                        {formatCurrency(rentabilidadActive.baseIngresosEvaluacion)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase text-slate-400 font-bold block">
                        Costo Total (Directos + Admin + Amort.)
                      </span>
                      <span className="text-base font-mono tabular-nums font-bold text-amber-400">
                        {formatCurrency(rentabilidadActive.costoTotalObra)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase text-slate-400 font-bold block">
                        Resultado Neto / Margen
                      </span>
                      <div className="flex items-center gap-1.5">
                        {rentabilidadActive.resultadoNeto >= 0 ? (
                          <TrendingUp className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-400" />
                        )}
                        <span
                          className={`text-base font-mono tabular-nums font-bold ${
                            rentabilidadActive.resultadoNeto >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {formatCurrency(rentabilidadActive.resultadoNeto)} ({rentabilidadActive.margenPorcentaje}%)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-start sm:justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('facturas')}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-xs font-black cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Cargar Facturas
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('costos')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Ver Costos
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Compact Waterfall Summary Table */}
              {rentabilidadActive && (
                <ObraResumenCascadaTable
                  obra={obra}
                  summary={rentabilidadActive}
                  activeContenedorTitulo={activeContenedor?.titulo}
                  onSaveObra={onSaveObraLegajo}
                  onNavigateTab={setActiveTab}
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    <span>Ubicación</span>
                  </div>
                  <div className="text-white font-medium text-sm">
                    {obra.ubicacion || 'Sin ubicación especificada'}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <UserCheck className="w-4 h-4 text-amber-400" />
                    <span>Cliente Vinculado / Comitente</span>
                  </div>
                  <div className="text-white font-medium text-sm flex flex-wrap items-center gap-2">
                    <span>{obra.clienteNombre || obra.pertenece || 'Empresa Principal'}</span>
                    {obra.clienteCodigo && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {obra.clienteCodigo}
                      </span>
                    )}
                    {obra.clienteCuit && (
                      <span className="text-[11px] font-mono text-emerald-400">
                        CUIT: {obra.clienteCuit}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    <span>Plazo Estimado</span>
                  </div>
                  <div className="text-white font-mono text-sm font-semibold">{obra.plazo || 'N/D'}</div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    <span>Monto Estimado</span>
                  </div>
                  <div className="text-emerald-400 font-mono text-base font-bold">
                    {formatCurrency(obra.montoEstimado)}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Fecha de Alta</span>
                  </div>
                  <div className="text-slate-300 font-mono text-sm">{obra.fechaAlta || 'N/D'}</div>
                </div>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-2.5">
                <div className="text-xs text-slate-400">
                  Métricas operativas:{' '}
                  <strong className="text-amber-300">
                    {activeContenedor ? `Contenedor «${activeContenedor.titulo}»` : 'Toda la obra'}
                  </strong>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <span className="text-xs text-slate-400 block">Total Horas Trabajadas</span>
                    <span className="text-lg font-mono tabular-nums font-bold text-amber-400">
                      {totalHoras.toFixed(1)} hs
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Total Viajes / Cargas</span>
                    <span className="text-lg font-mono tabular-nums font-bold text-blue-400">
                      {totalViajes}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Equipos / Máquinas Asignadas</span>
                    <span className="text-lg font-mono tabular-nums font-bold text-white">
                      {equiposUnicos.length} equipos
                    </span>
                  </div>
                </div>
              </div>

              {obra.observaciones && (
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span>Observaciones / Notas</span>
                  </div>
                  <p className="text-slate-300 text-sm whitespace-pre-line leading-relaxed">
                    {obra.observaciones}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'valorizado' && (
            <ObraResumenValorizadoTab
              obra={obra}
              obraPartes={obraPartes}
              allPartes={partesDiarios}
              rentals={rentals}
              arcaInvoices={arcaInvoices}
              customerReceipts={customerReceipts}
              fleet={fleet}
              selectedContenedorId={effectiveContenedorId}
              onChangeContenedorId={setSelectedContenedorId}
              onSaveObra={onSaveObraLegajo}
              onNavigateToFacturas={() => setActiveTab('facturas')}
              onInvoiceResumenInArca={onInvoiceResumenInArca}
              onNavigateToArca={onNavigateToArca}
              onNavigateToCobranzas={onNavigateToCobranzas}
            />
          )}

          {activeTab === 'facturas' && (
            <ObraFacturacionLegajosTab
              obra={obra}
              arcaInvoices={arcaInvoices}
              customerReceipts={customerReceipts}
              rentals={rentals}
              quotations={quotations}
              partesDiarios={partesDiarios}
              selectedContenedorId={effectiveContenedorId}
              onChangeContenedorId={setSelectedContenedorId}
              onSaveObra={onSaveObraLegajo}
              onNavigateToArca={onNavigateToArca}
              onNavigateToCobranzas={onNavigateToCobranzas}
            />
          )}

          {activeTab === 'contenedores' && (
            <ObraContenedoresTab
              obra={obra}
              arcaInvoices={arcaInvoices}
              customerReceipts={customerReceipts}
              rentals={rentals}
              quotations={quotations}
              partesDiarios={partesDiarios}
              fleet={fleet}
              fuelVouchers={fuelVouchers}
              stockMovements={stockMovements}
              stockItems={stockItems}
              servicesLogs={servicesLogs}
              expensesLogs={expensesLogs}
              employees={employees}
              supabaseUsuarios={supabaseUsuarios}
              supabaseCategorias={supabaseCategorias}
              payrollPeriods={payrollPeriods}
              payrollDirectoryLinks={payrollDirectoryLinks}
              onSaveObra={onSaveObraLegajo}
              onSaveRental={onSaveRental}
              onInvoiceRentalInArca={onInvoiceRentalInArca}
            />
          )}

          {activeTab === 'personal' && rentabilidadActive && (
            <ObraPersonalTab
              obra={obra}
              summary={rentabilidadActive}
              obraPartes={scopedObraPartes}
              selectedContenedorId={effectiveContenedorId}
              onChangeContenedorId={setSelectedContenedorId}
              onSaveObra={onSaveObraLegajo}
            />
          )}

          {activeTab === 'combustible' && rentabilidadActive && (
            <ObraCombustibleTab
              obra={obra}
              summary={rentabilidadActive}
              fuelVouchers={fuelVouchers}
              selectedContenedorId={effectiveContenedorId}
              onChangeContenedorId={setSelectedContenedorId}
              onSaveObra={onSaveObraLegajo}
            />
          )}

          {activeTab === 'costos' && (
            <ObraCostosRentabilidadTab
              obra={obra}
              partesDiarios={partesDiarios}
              rentals={rentals}
              fleet={fleet}
              fuelVouchers={fuelVouchers}
              stockMovements={stockMovements}
              stockItems={stockItems}
              servicesLogs={servicesLogs}
              expensesLogs={expensesLogs}
              employees={employees}
              supabaseUsuarios={supabaseUsuarios}
              supabaseCategorias={supabaseCategorias}
              purchaseInvoices={purchaseInvoices}
              arcaInvoices={arcaInvoices}
              customerReceipts={customerReceipts}
              payrollPeriods={payrollPeriods}
              payrollDirectoryLinks={payrollDirectoryLinks}
              selectedContenedorId={effectiveContenedorId}
              onChangeContenedorId={setSelectedContenedorId}
              onSaveObra={onSaveObraLegajo}
            />
          )}

          {activeTab === 'partes' && (
            <ObraPartesMacheoTab
              obra={obra}
              allPartesDiarios={partesDiarios}
              obraPartes={obraPartes}
              rentals={rentals}
              fuelVouchers={fuelVouchers}
              fleet={fleet}
              selectedContenedorId={effectiveContenedorId}
              onChangeContenedorId={setSelectedContenedorId}
              toleranceConfig={macheoTolerance}
              onSaveToleranceConfig={handleSaveMacheoTolerance}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!isWorkspace) onClose();
                onEdit(obra);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-2"
            >
              Editar Datos Obra
            </button>
            {onArchive && (
              <button
                onClick={() => onArchive(obra)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border ${
                  obra.archivado
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500 hover:text-black'
                    : 'bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border-slate-700'
                }`}
              >
                {obra.archivado ? (
                  <ArchiveRestore className="w-3.5 h-3.5" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
                <span>{obra.archivado ? 'Desarchivar Obra' : 'Archivar Obra'}</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
          >
            {isWorkspace && <ArrowLeft className="w-3.5 h-3.5" />}
            <span>{isWorkspace ? 'Volver a Obras' : 'Cerrar'}</span>
          </button>
        </div>
      </div>

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
    </div>
  );
};
