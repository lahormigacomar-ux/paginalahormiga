import React, { useState, useMemo, useEffect } from 'react';
import {
  Obra,
  ObraCostosConfig,
  ObraGastoCategoria,
  ObraGastoManual,
  ObraLegajoAdjunto,
  ParteDiario,
  RentalContract,
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
  ArcaInvoice,
  CustomerPaymentReceipt
} from '../../types';
import { formatCurrency, loadFuelPrices } from '../../services/storage';
import { uploadFileToCloudflareR2 } from '../../services/api';
import {
  computeObraRentabilidad,
  getDefaultObraCostosConfig,
  normalizeObraDateKey
} from '../../utils/obraCostosEngine';
import { PayrollPeriodRecord } from '../../utils/payrollParser';
import { ObraResumenCascadaTable } from './ObraResumenCascadaTable';
import {
  TrendingUp,
  TrendingDown,
  Fuel,
  Droplets,
  Wrench,
  Users,
  Percent,
  Plus,
  Trash2,
  Download,
  Calendar,
  Truck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Save,
  Sliders,
  FileSpreadsheet,
  Paperclip,
  Upload,
  ShoppingBag,
  Eye,
  FolderOpen
} from 'lucide-react';

interface ObraCostosRentabilidadTabProps {
  obra: Obra;
  partesDiarios: ParteDiario[];
  rentals: RentalContract[];
  fleet: Vehicle[];
  fuelVouchers: FuelDispensary[];
  stockMovements: StockMovement[];
  stockItems: StockItem[];
  servicesLogs: VehicleServiceLog[];
  expensesLogs: VehicleExpenseLog[];
  employees: Employee[];
  supabaseUsuarios: SupabaseUsuario[];
  supabaseCategorias: SupabaseCategoria[];
  purchaseInvoices: PurchaseInvoice[];
  arcaInvoices?: ArcaInvoice[];
  customerReceipts?: CustomerPaymentReceipt[];
  payrollPeriods?: PayrollPeriodRecord[];
  payrollDirectoryLinks?: Record<string, string>;
  selectedContenedorId?: string;
  onChangeContenedorId?: (id: string) => void;
  onSaveObra: (updatedObra: Obra) => Promise<{ ok: boolean; error?: string }>;
}

const GASTO_CATEGORIAS: { value: ObraGastoCategoria; label: string }[] = [
  { value: 'COMBUSTIBLE', label: 'Combustible' },
  { value: 'LUBRICANTES_GRASA_ACEITE', label: 'Grasa, Aceite y Lubricantes' },
  { value: 'REPARACION_MANTENIMIENTO', label: 'Reparación / Taller / Repuesto' },
  { value: 'SUELDOS_JORNALES', label: 'Sueldos / Jornales / Viáticos' },
  { value: 'FLETE_TRASLADO', label: 'Flete / Traslado de Máquina' },
  { value: 'INSUMOS_OBRA', label: 'Insumos de Obra' },
  { value: 'SUBCONTRATO', label: 'Subcontrato / Terceros' },
  { value: 'VARIOS', label: 'Varios / Otros Directos' }
];

export const ObraCostosRentabilidadTab: React.FC<ObraCostosRentabilidadTabProps> = ({
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
  purchaseInvoices,
  arcaInvoices = [],
  customerReceipts = [],
  payrollPeriods = [],
  payrollDirectoryLinks = {},
  selectedContenedorId,
  onChangeContenedorId,
  onSaveObra
}) => {
  const fuelPricesCatalog = useMemo(() => loadFuelPrices(), []);
  const periodos = obra.periodosLegajo || [];
  const [internalContenedorId, setInternalContenedorId] = useState<string>('ALL');
  const activeContenedorId = selectedContenedorId ?? internalContenedorId;
  const setActiveContenedorId = (id: string) => {
    setInternalContenedorId(id);
    onChangeContenedorId?.(id);
  };
  const activeContenedor = useMemo(
    () =>
      activeContenedorId !== 'ALL'
        ? periodos.find((p) => p.id === activeContenedorId)
        : undefined,
    [periodos, activeContenedorId]
  );

  const [draftConfig, setDraftConfig] = useState<ObraCostosConfig>(() =>
    getDefaultObraCostosConfig(obra.costosConfig)
  );
  const [activeRubroTab, setActiveRubroTab] = useState<
    'RESUMEN' | 'COMBUSTIBLE' | 'LUBRICANTES' | 'REPARACIONES' | 'SUELDOS' | 'MANUALES'
  >('RESUMEN');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Manual expense form state
  const [isManualFormOpen, setIsManualFormOpen] = useState(false);
  const [manualFecha, setManualFecha] = useState(new Date().toISOString().slice(0, 10));
  const [manualCategoria, setManualCategoria] = useState<ObraGastoCategoria>('LUBRICANTES_GRASA_ACEITE');
  const [manualEquipo, setManualEquipo] = useState('');
  const [manualEmpleado, setManualEmpleado] = useState('');
  const [manualProveedor, setManualProveedor] = useState('');
  const [manualNroComp, setManualNroComp] = useState('');
  const [manualDescripcion, setManualDescripcion] = useState('');
  const [manualMonto, setManualMonto] = useState<number>(0);
  const [manualPurchaseId, setManualPurchaseId] = useState('');
  const [manualAdjuntos, setManualAdjuntos] = useState<ObraLegajoAdjunto[]>([]);
  const [isUploadingAtt, setIsUploadingAtt] = useState(false);
  const [previewAdjunto, setPreviewAdjunto] = useState<ObraLegajoAdjunto | null>(null);

  // Inline payroll rate editor state
  const [editingPayrollKey, setEditingPayrollKey] = useState<string | null>(null);
  const [editPayrollModo, setEditPayrollModo] = useState<'DIA' | 'HORA'>('DIA');
  const [editPayrollValor, setEditPayrollValor] = useState<number>(0);

  useEffect(() => {
    setDraftConfig(getDefaultObraCostosConfig(obra.costosConfig));
  }, [obra.id, obra.costosConfig]);

  // Live preview using draftConfig + activeContenedorId so user sees immediate impact
  const summary = useMemo(() => {
    return computeObraRentabilidad({
      obra: { ...obra, costosConfig: draftConfig },
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
      contenedorId: activeContenedorId !== 'ALL' ? activeContenedorId : undefined,
      arcaInvoices,
      customerReceipts
    });
  }, [
    obra,
    draftConfig,
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
    activeContenedorId,
    arcaInvoices,
    customerReceipts
  ]);

  const hasUnsavedConfigChanges = useMemo(() => {
    const saved = getDefaultObraCostosConfig(obra.costosConfig);
    return JSON.stringify(saved) !== JSON.stringify(draftConfig);
  }, [obra.costosConfig, draftConfig]);

  const persistObraPatch = async (nextObra: Obra, successMsg: string) => {
    setIsSaving(true);
    setSaveError(null);
    setSaveFeedback(null);
    const res = await onSaveObra(nextObra);
    setIsSaving(false);
    if (!res.ok) {
      setSaveError(res.error || 'No se pudo guardar en Supabase.');
      return false;
    }
    setSaveFeedback(successMsg);
    return true;
  };

  const handleSaveConfig = async () => {
    await persistObraPatch(
      { ...obra, costosConfig: draftConfig },
      'Parámetros de costos y paquete administrativo guardados en Supabase.'
    );
  };

  const handleToggleEvaluarNeto = async (evaluarNeto: boolean) => {
    const nextCfg = { ...draftConfig, evaluarSobreNetoSinIva: evaluarNeto };
    setDraftConfig(nextCfg);
    await persistObraPatch(
      { ...obra, costosConfig: nextCfg },
      `Base de rentabilidad actualizada a ${evaluarNeto ? 'Neto sin IVA' : 'Total c/ IVA'} en Supabase.`
    );
  };

  const handleToggleExcludeItem = async (excludeKey: string) => {
    const current = draftConfig.itemsExcluidosIds || [];
    const nextExcluded = current.includes(excludeKey)
      ? current.filter((k) => k !== excludeKey)
      : [...current, excludeKey];
    const nextCfg = { ...draftConfig, itemsExcluidosIds: nextExcluded };
    setDraftConfig(nextCfg);
    await persistObraPatch(
      { ...obra, costosConfig: nextCfg },
      'Inclusión de ítem de costo actualizada en Supabase.'
    );
  };

  const handleSavePayrollOverride = async (empleadoKey: string) => {
    const val = Number(editPayrollValor) || 0;
    const prevOverrides = draftConfig.tarifasEmpleadoOverride || {};
    const nextOverrides = {
      ...prevOverrides,
      [empleadoKey]: {
        modo: editPayrollModo,
        costoPorDia: editPayrollModo === 'DIA' ? val : undefined,
        costoPorHora: editPayrollModo === 'HORA' ? val : undefined
      }
    };
    const nextCfg = { ...draftConfig, tarifasEmpleadoOverride: nextOverrides };
    setDraftConfig(nextCfg);
    const ok = await persistObraPatch(
      { ...obra, costosConfig: nextCfg },
      'Tarifa de operario actualizada en Supabase.'
    );
    if (ok) {
      setEditingPayrollKey(null);
    }
  };

  const handleImportPurchaseInvoice = (purId: string) => {
    setManualPurchaseId(purId);
    if (!purId) return;
    const pur = purchaseInvoices.find((p) => p.id === purId);
    if (!pur) return;
    setManualFecha(pur.fechaEmision || new Date().toISOString().slice(0, 10));
    setManualProveedor(pur.proveedorNombre || '');
    setManualNroComp(pur.nroComprobanteCompleto || '');
    const itemsText = (pur.items || [])
      .map((it) => it.descripcion)
      .filter(Boolean)
      .slice(0, 3)
      .join(' / ');
    setManualDescripcion(itemsText || `Compra ${pur.proveedorNombre}`);
    setManualMonto(Number(pur.netoGravado || pur.montoTotal || 0));
    const firstTipo = pur.items?.[0]?.tipoItem;
    if (firstTipo === 'COMBUSTIBLE') setManualCategoria('COMBUSTIBLE');
    else if (firstTipo === 'LUBRICANTE') setManualCategoria('LUBRICANTES_GRASA_ACEITE');
    else if (firstTipo === 'SERVICE' || firstTipo === 'REPUESTO')
      setManualCategoria('REPARACION_MANTENIMIENTO');
  };

  const handleManualFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setSaveError('El comprobante supera el límite de 15 MB permitidos para Cloudflare R2.');
      return;
    }
    setIsUploadingAtt(true);
    setSaveError(null);
    try {
      const res = await uploadFileToCloudflareR2(
        file,
        file.name,
        file.type || 'application/octet-stream',
        'obras-legajos'
      );
      if (!res.success || !res.url) {
        throw new Error(res.error || 'No se pudo subir el comprobante a Cloudflare R2.');
      }
      setManualAdjuntos((prev) => [
        ...prev,
        {
          id: `GADJ-${Date.now()}`,
          nombre: file.name,
          url: res.url!,
          tipo: 'COMPROBANTE_GASTO',
          fechaSubida: new Date().toISOString().slice(0, 10)
        }
      ]);
    } catch (err: any) {
      setSaveError(err?.message || 'Error al subir comprobante a Cloudflare R2.');
    } finally {
      setIsUploadingAtt(false);
      e.target.value = '';
    }
  };

  const handleAddManualGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDescripcion.trim() || Number(manualMonto) <= 0) {
      setSaveError('Ingresá una descripción y un monto mayor a 0.');
      return;
    }

    const newGasto: ObraGastoManual = {
      id: `OGAS-${Date.now()}`,
      fecha: manualFecha,
      categoria: manualCategoria,
      equipoCodigo: manualEquipo || undefined,
      empleadoNombre: manualEmpleado || undefined,
      proveedor: manualProveedor.trim() || undefined,
      nroComprobante: manualNroComp.trim() || undefined,
      descripcion: manualDescripcion.trim(),
      monto: Number(manualMonto) || 0,
      purchaseInvoiceId: manualPurchaseId || undefined,
      adjuntos: manualAdjuntos
    };

    const nextGastos = [newGasto, ...(obra.gastosManuales || [])];
    const ok = await persistObraPatch(
      { ...obra, gastosManuales: nextGastos },
      'Gasto de obra guardado en Supabase.'
    );
    if (ok) {
      setIsManualFormOpen(false);
      setManualDescripcion('');
      setManualMonto(0);
      setManualProveedor('');
      setManualNroComp('');
      setManualPurchaseId('');
      setManualAdjuntos([]);
    }
  };

  const handleDeleteManualGasto = async (gastoId: string) => {
    const nextGastos = (obra.gastosManuales || []).filter((g) => g.id !== gastoId);
    await persistObraPatch(
      { ...obra, gastosManuales: nextGastos },
      'Gasto manual eliminado de la obra en Supabase.'
    );
  };

  const handleExportBalanceCSV = () => {
    const rows = [
      ['OBRA', `${obra.numero} - ${obra.nombreObra}`],
      ...(activeContenedor ? [['CONTENEDOR / PERÍODO', activeContenedor.titulo]] : []),
      ['COMITENTE', obra.pertenece || '-'],
      ['DIAS OPERATIVOS DETECTADOS', String(summary.diasObraUnicos.length)],
      ['FACTURADO NETO SIN IVA', String(summary.facturadoNetoSinIva)],
      ['FACTURADO TOTAL CON IVA', String(summary.facturadoTotalConIva)],
      ['COBRADO', String(summary.cobradoTotal)],
      ['COSTO COMBUSTIBLE', String(summary.totalCombustible)],
      ['COSTO GRASA ACEITE E INSUMOS', String(summary.totalLubricantes)],
      ['COSTO REPARACIONES Y TALLER', String(summary.totalReparaciones)],
      ['SUELDOS PROPORCIONALES', String(summary.totalSueldos)],
      ['OTROS COSTOS DIRECTOS', String(summary.totalOtrosDirectos)],
      ['TOTAL COSTOS DIRECTOS', String(summary.totalCostosDirectos)],
      [
        `PAQUETE ADMINISTRATIVO (${summary.porcentajeGastosGenerales}% + FIJO)`,
        String(summary.totalGastosGenerales)
      ],
      ['AMORTIZACIÓN VEHÍCULOS Y EQUIPOS', String(summary.totalAmortizacionVehiculos)],
      ['COSTO TOTAL OBRA', String(summary.costoTotalObra)],
      ['RESULTADO NETO', String(summary.resultadoNeto)],
      ['MARGEN RENTABILIDAD %', `${summary.margenPorcentaje}%`]
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const containerSlug = activeContenedor
      ? `_${activeContenedor.titulo.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : '';
    a.download = `Balance_Obra_${(obra.numero || obra.id).replace(/[^a-zA-Z0-9_-]/g, '_')}${containerSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isRentable = summary.resultadoNeto > 0;
  const isBreakEven = summary.resultadoNeto === 0;
  const gastosManuales = useMemo(() => {
    return (obra.gastosManuales || []).filter((g) => {
      const dKey = normalizeObraDateKey(g.fecha);
      if (!dKey) return true;
      if (draftConfig.fechaDesdeFiltro && dKey < draftConfig.fechaDesdeFiltro) return false;
      if (draftConfig.fechaHastaFiltro && dKey > draftConfig.fechaHastaFiltro) return false;
      if (activeContenedor?.fechaDesde && dKey < activeContenedor.fechaDesde) return false;
      if (activeContenedor?.fechaHasta && dKey > activeContenedor.fechaHasta) return false;
      return true;
    });
  }, [obra.gastosManuales, draftConfig.fechaDesdeFiltro, draftConfig.fechaHastaFiltro, activeContenedor]);

  const totalCostForBar = Math.max(1, summary.costoTotalObra);
  const pctComb = (summary.totalCombustible / totalCostForBar) * 100;
  const pctLub = (summary.totalLubricantes / totalCostForBar) * 100;
  const pctRep = (summary.totalReparaciones / totalCostForBar) * 100;
  const pctSue = (summary.totalSueldos / totalCostForBar) * 100;
  const pctOtr = (summary.totalOtrosDirectos / totalCostForBar) * 100;
  const pctAdm = (summary.totalGastosGenerales / totalCostForBar) * 100;
  const pctAmo = (summary.totalAmortizacionVehiculos / totalCostForBar) * 100;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Feedback Banners */}
      {saveError && (
        <div className="bg-red-500/15 border border-red-500/40 text-red-200 rounded-xl p-3 flex items-center justify-between text-xs">
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
        <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveFeedback}</span>
          </div>
          <button onClick={() => setSaveFeedback(null)} className="text-emerald-300 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Controls: Container Filter + Date Range + Evaluation Mode + Export */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {periodos.length > 0 && (
            <div className="flex items-center gap-1.5 pr-2 border-r border-slate-800">
              <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-bold text-slate-300">Contenedor:</span>
              <select
                value={activeContenedorId}
                onChange={(e) => setActiveContenedorId(e.target.value)}
                className={`bg-slate-950 rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer border ${
                  activeContenedorId !== 'ALL'
                    ? 'border-amber-500/60 text-amber-200'
                    : 'border-slate-700 text-white'
                }`}
              >
                <option value="ALL">Toda la obra</option>
                {periodos.map((per) => (
                  <option key={per.id} value={per.id}>
                    📦 {per.titulo}
                  </option>
                ))}
              </select>
              {activeContenedorId !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setActiveContenedorId('ALL')}
                  className="text-amber-400 hover:underline font-bold cursor-pointer"
                >
                  Quitar
                </button>
              )}
            </div>
          )}

          <Calendar className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-slate-300">Período de Análisis:</span>
          <input
            type="date"
            value={draftConfig.fechaDesdeFiltro || ''}
            onChange={(e) => setDraftConfig((prev) => ({ ...prev, fechaDesdeFiltro: e.target.value }))}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono text-xs"
          />
          <span className="text-slate-500">al</span>
          <input
            type="date"
            value={draftConfig.fechaHastaFiltro || ''}
            onChange={(e) => setDraftConfig((prev) => ({ ...prev, fechaHastaFiltro: e.target.value }))}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono text-xs"
          />
          {(draftConfig.fechaDesdeFiltro || draftConfig.fechaHastaFiltro) && (
            <button
              type="button"
              onClick={() =>
                setDraftConfig((prev) => ({ ...prev, fechaDesdeFiltro: '', fechaHastaFiltro: '' }))
              }
              className="text-amber-400 hover:underline font-bold cursor-pointer"
            >
              Limpiar fechas
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => handleToggleEvaluarNeto(true)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                summary.evaluarSobreNetoSinIva
                  ? 'bg-amber-500 text-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sobre Neto sin IVA
            </button>
            <button
              type="button"
              onClick={() => handleToggleEvaluarNeto(false)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                !summary.evaluarSobreNetoSinIva
                  ? 'bg-amber-500 text-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sobre Total c/ IVA
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportBalanceCSV}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Exportar Balance CSV</span>
          </button>
        </div>
      </div>

      {/* Executive P&L Dashboard ("¿Me rindió la Obra?") */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] uppercase font-bold text-slate-400 block">
            Ingresos Facturados ({summary.evaluarSobreNetoSinIva ? 'Neto s/ IVA' : 'Total c/ IVA'})
          </span>
          <div className="text-xl font-mono font-black text-white mt-1">
            {formatCurrency(summary.baseIngresosEvaluacion)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            Cobrado: <span className="text-emerald-400">{formatCurrency(summary.cobradoTotal)}</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] uppercase font-bold text-slate-400 block">
            Costos Directos Operativos
          </span>
          <div className="text-xl font-mono font-black text-amber-400 mt-1">
            {formatCurrency(summary.totalCostosDirectos)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Comb. + Grasa/Aceite + Taller + Sueldos + Manuales
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] uppercase font-bold text-slate-400 block">
            Paquete Admin. / Gastos Grales ({summary.porcentajeGastosGenerales}%)
          </span>
          <div className="text-xl font-mono font-black text-purple-300 mt-1">
            {formatCurrency(summary.totalGastosGenerales)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            Costo Total Obra: <span className="text-white">{formatCurrency(summary.costoTotalObra)}</span>
          </div>
        </div>

        <div
          className={`rounded-2xl p-4 border ${
            isRentable
              ? 'bg-emerald-950/30 border-emerald-500/40'
              : isBreakEven
                ? 'bg-slate-900 border-slate-700'
                : 'bg-red-950/30 border-red-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold text-slate-300">
              Resultado Neto ("¿Rindió?")
            </span>
            {isRentable ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
          </div>
          <div
            className={`text-xl font-mono font-black mt-1 ${
              isRentable ? 'text-emerald-400' : isBreakEven ? 'text-slate-200' : 'text-red-400'
            }`}
          >
            {formatCurrency(summary.resultadoNeto)}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded ${
                isRentable
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : isBreakEven
                    ? 'bg-slate-800 text-slate-300'
                    : 'bg-red-500/20 text-red-300'
              }`}
            >
              {isRentable ? 'OBRA RENTABLE' : isBreakEven ? 'EQUILIBRIO' : 'OBRA CON DÉFICIT'}
            </span>
            <span className="text-xs font-mono font-bold text-white">
              Margen: {summary.margenPorcentaje}%
            </span>
          </div>
        </div>
      </div>

      {/* Cost Composition Breakdown Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white uppercase tracking-wider">
            Composición del Costo Total de Obra ({formatCurrency(summary.costoTotalObra)})
          </span>
        </div>
        <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
          {pctComb > 0 && <div style={{ width: `${pctComb}%` }} className="bg-amber-500" title="Combustible" />}
          {pctLub > 0 && <div style={{ width: `${pctLub}%` }} className="bg-cyan-400" title="Grasa y Aceites" />}
          {pctRep > 0 && <div style={{ width: `${pctRep}%` }} className="bg-rose-500" title="Reparaciones" />}
          {pctSue > 0 && <div style={{ width: `${pctSue}%` }} className="bg-blue-500" title="Sueldos" />}
          {pctOtr > 0 && <div style={{ width: `${pctOtr}%` }} className="bg-emerald-500" title="Otros Directos" />}
          {pctAdm > 0 && <div style={{ width: `${pctAdm}%` }} className="bg-purple-500" title="Paquete Administrativo" />}
          {pctAmo > 0 && <div style={{ width: `${pctAmo}%` }} className="bg-teal-400" title="Amortización Vehículos" />}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shrink-0" />
            <span>Combustible:</span>
            <strong className="font-mono text-white">{formatCurrency(summary.totalCombustible)}</strong>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 shrink-0" />
            <span>Grasa/Aceite:</span>
            <strong className="font-mono text-white">{formatCurrency(summary.totalLubricantes)}</strong>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 shrink-0" />
            <span>Reparaciones:</span>
            <strong className="font-mono text-white">{formatCurrency(summary.totalReparaciones)}</strong>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0" />
            <span>Sueldos:</span>
            <strong className="font-mono text-white">{formatCurrency(summary.totalSueldos)}</strong>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
            <span>Otros Directos:</span>
            <strong className="font-mono text-white">{formatCurrency(summary.totalOtrosDirectos)}</strong>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-500 shrink-0" />
            <span>Admin ({summary.porcentajeGastosGenerales}%):</span>
            <strong className="font-mono text-purple-300">{formatCurrency(summary.totalGastosGenerales)}</strong>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-teal-400 shrink-0" />
            <span>Amortización:</span>
            <strong className="font-mono text-teal-300">{formatCurrency(summary.totalAmortizacionVehiculos)}</strong>
          </div>
        </div>
      </div>

      {/* Detected Days & Machines from Partes + Rentals + Real Horómetro Comparison */}
      <div className="bg-amber-500/5 border border-amber-500/25 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <Truck className="w-4 h-4" />
            <span>
              Cruce Inteligente de Equipos, Combustible por Tramos y Horómetro Real:{' '}
              {summary.diasObraUnicos.length} días operativos y {summary.equiposEnObra.length}{' '}
              equipos detectados
            </span>
          </div>
          {summary.diasObraUnicos.length > 0 && (
            <span className="text-[11px] font-mono text-slate-400">
              Desde {summary.diasObraUnicos[0]} hasta{' '}
              {summary.diasObraUnicos[summary.diasObraUnicos.length - 1]}
            </span>
          )}
        </div>
        {summary.equiposEnObra.length === 0 ? (
          <p className="text-xs text-slate-400">
            No se detectaron partes diarios ni contratos vinculados a esta obra todavía. Cargá una factura vinculada a un contrato/partes o registrá partes diarios con el nombre o número de esta obra para cruzar gastos automáticamente.
          </p>
        ) : (
          <div className="overflow-x-auto bg-slate-950/70 border border-slate-800/90 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="py-2 px-3">Equipo / Máquina</th>
                  <th className="py-2 px-2 text-center">Días Obra</th>
                  <th className="py-2 px-2 text-right" title="Horas declaradas en los Partes Diarios de la obra">
                    Hs Partes (Declaradas)
                  </th>
                  <th className="py-2 px-2 text-right" title="Horas reales de motor calculadas según el horómetro de las cargas de combustible asignadas a esta obra">
                    Hs Reales (Horómetro Comb.)
                  </th>
                  <th className="py-2 px-2 text-center" title="Relación entre horas reales de motor encendido (horómetro) y horas declaradas en partes">
                    % Uso Motor / Rango Horómetro
                  </th>
                  <th className="py-2 px-2 text-right">Combustible Imputado</th>
                  <th className="py-2 px-3 text-right">Consumo Real</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {summary.equiposEnObra.map((eq) => {
                  const pctMotor =
                    eq.horasHorometroReal && eq.horasTotal > 0
                      ? Math.round((eq.horasHorometroReal / eq.horasTotal) * 100)
                      : null;
                  const diffHs =
                    eq.horasHorometroReal && eq.horasTotal > 0
                      ? Number((eq.horasHorometroReal - eq.horasTotal).toFixed(1))
                      : null;
                  return (
                    <tr key={eq.key} className="hover:bg-slate-900/60">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-[11px]">
                            {eq.codigoInterno || 'EQ'}
                          </span>
                          <span className="text-white font-semibold">{eq.label}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-slate-300">
                        {eq.diasCount} d
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-200">
                        {eq.horasTotal > 0 ? `${eq.horasTotal} hs` : '—'}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {eq.horasHorometroReal && eq.horasHorometroReal > 0 ? (
                          <span className="font-bold text-emerald-400">
                            {eq.horasHorometroReal} hs
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Sin horómetro</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          {pctMotor !== null ? (
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                pctMotor >= 75 && pctMotor <= 115
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {pctMotor}% motor ({diffHs && diffHs > 0 ? `+${diffHs}` : diffHs} hs)
                            </span>
                          ) : null}
                          {eq.horometroInicial && eq.horometroFinal ? (
                            <span className="text-[10px] font-mono text-slate-400">
                              Horóm.: {eq.horometroInicial} → {eq.horometroFinal}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {eq.litrosAsignados && eq.litrosAsignados > 0 ? (
                          <div>
                            <span className="text-amber-300 font-bold">{eq.litrosAsignados} L</span>
                            <span className="text-[10px] text-slate-400 block">
                              {eq.cargasCount} {eq.cargasCount === 1 ? 'carga' : 'cargas'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {eq.consumoLitrosHoraReal ? (
                          <span className="text-cyan-300 font-bold">
                            {eq.consumoLitrosHoraReal} L/h
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
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

      {/* Paquete Administrativo / Gastos Generales & Parameters Config */}
      <div className="bg-slate-900/80 border border-purple-500/30 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-purple-400" />
            <h5 className="text-white font-bold text-xs uppercase tracking-wider">
              Paquete Administrativo / Gastos Generales y Parámetros de Cálculo
            </h5>
          </div>
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={isSaving}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition ${
              hasUnsavedConfigChanges
                ? 'bg-purple-500 hover:bg-purple-400 text-white shadow-md shadow-purple-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{hasUnsavedConfigChanges ? 'Guardar Configuración*' : 'Guardado en Supabase'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <label className="block text-[10px] font-bold uppercase text-purple-300 mb-1">
              % Gastos Generales
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={draftConfig.porcentajeGastosGenerales}
              onChange={(e) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  porcentajeGastosGenerales: Number(e.target.value) || 0
                }))
              }
              className="w-full bg-slate-950 border border-purple-500/40 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Base de Aplicación del %
            </label>
            <select
              value={draftConfig.baseCalculoGastosGenerales}
              onChange={(e) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  baseCalculoGastosGenerales: e.target.value as any
                }))
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
            >
              <option value="COSTOS_DIRECTOS">% sobre Costos Directos</option>
              <option value="FACTURACION_NETA">% sobre Facturación Neta</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Monto Fijo Admin ($)
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={draftConfig.montoFijoAdministrativo || 0}
              onChange={(e) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  montoFijoAdministrativo: Number(e.target.value) || 0
                }))
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Sueldo Mensual Ref. ($)
            </label>
            <input
              type="number"
              min="0"
              step="10000"
              value={draftConfig.sueldoMensualDefault || 950000}
              onChange={(e) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  sueldoMensualDefault: Number(e.target.value) || 0
                }))
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Días Lab./Mes • $/L Ref
            </label>
            <div className="flex gap-1.5">
              <input
                type="number"
                min="1"
                max="31"
                value={draftConfig.diasLaborablesMes || 24}
                onChange={(e) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    diasLaborablesMes: Math.max(1, Number(e.target.value) || 24)
                  }))
                }
                title="Días laborables por mes para prorrateo de sueldo"
                className="w-1/2 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
              />
              <input
                type="number"
                min="0"
                step="50"
                value={draftConfig.precioCombustibleReferencia || 1500}
                onChange={(e) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    precioCombustibleReferencia: Number(e.target.value) || 0
                  }))
                }
                title="Precio de referencia ($/L) si el vale no tiene importe"
                className="w-1/2 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
              />
            </div>
          </div>
        </div>

        <input
          type="text"
          value={draftConfig.descripcionPaqueteAdmin || ''}
          onChange={(e) =>
            setDraftConfig((prev) => ({ ...prev, descripcionPaqueteAdmin: e.target.value }))
          }
          placeholder="Concepto del paquete administrativo (ej: Estructura administrativa, seguros ART, contador, oficina)..."
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300"
        />
      </div>

      {/* Sub-navigation for Auto-detected Rubros + Gastos Manuales */}
      <div className="flex flex-wrap gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1.5">
        <button
          type="button"
          onClick={() => setActiveRubroTab('RESUMEN')}
          className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
            activeRubroTab === 'RESUMEN'
              ? 'bg-amber-500 text-black'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Resumen (Cascada)</span>
          <span className="font-mono opacity-80">{formatCurrency(summary.costoTotalObra)}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveRubroTab('COMBUSTIBLE')}
          className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
            activeRubroTab === 'COMBUSTIBLE'
              ? 'bg-amber-500 text-black'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Fuel className="w-3.5 h-3.5" />
          <span>Combustible ({summary.combustiblesAuto.length})</span>
          <span className="font-mono opacity-80">{formatCurrency(summary.totalCombustibleAuto)}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveRubroTab('LUBRICANTES')}
          className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
            activeRubroTab === 'LUBRICANTES'
              ? 'bg-cyan-500 text-black'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Droplets className="w-3.5 h-3.5" />
          <span>Grasa / Aceites / Pañol ({summary.lubricantesGrasasAuto.length})</span>
          <span className="font-mono opacity-80">{formatCurrency(summary.totalLubricantesAuto)}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveRubroTab('REPARACIONES')}
          className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
            activeRubroTab === 'REPARACIONES'
              ? 'bg-rose-500 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Reparaciones / Taller ({summary.reparacionesAuto.length})</span>
          <span className="font-mono opacity-80">{formatCurrency(summary.totalReparacionesAuto)}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveRubroTab('SUELDOS')}
          className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
            activeRubroTab === 'SUELDOS'
              ? 'bg-blue-500 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Sueldos Proporcionales ({summary.sueldosAuto.length})</span>
          <span className="font-mono opacity-80">{formatCurrency(summary.totalSueldosAuto)}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveRubroTab('MANUALES')}
          className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
            activeRubroTab === 'MANUALES'
              ? 'bg-emerald-500 text-black'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Gastos Manuales / Compras ({gastosManuales.length})</span>
        </button>
      </div>

      {/* Active Rubro Content */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
        {activeRubroTab === 'RESUMEN' && (
          <ObraResumenCascadaTable
            obra={{ ...obra, costosConfig: draftConfig }}
            summary={summary}
            activeContenedorTitulo={activeContenedor?.titulo}
            onSaveObra={onSaveObra}
          />
        )}

        {activeRubroTab === 'COMBUSTIBLE' && (
          <div className="space-y-3">
            <div className="bg-slate-950/80 border border-amber-500/20 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-amber-300">
                  Imputación por Tramo entre Cargas + Prorrateo Multi-Obra + Horómetro Real
                </p>
                <p className="text-[11px] text-slate-400">
                  Si una máquina tiene partes seguidos en esta obra, se imputa el 100% de cada carga. Si en el tramo de una carga trabajó en 2 o más obras, los litros, costo y horas de horómetro se dividen proporcionalmente según las horas trabajadas en cada obra.
                </p>
              </div>
              {summary.combustiblesAuto.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <div className="bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg">
                    <span className="text-slate-400 text-[10px] block uppercase">Litros Obra</span>
                    <strong className="text-amber-300">
                      {summary.combustiblesAuto
                        .filter((c) => !c.excluded)
                        .reduce((acc, c) => acc + c.litros, 0)
                        .toFixed(1)}{' '}
                      L
                    </strong>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg">
                    <span className="text-slate-400 text-[10px] block uppercase">Hs Reales Horómetro</span>
                    <strong className="text-emerald-400">
                      {summary.combustiblesAuto
                        .filter((c) => !c.excluded)
                        .reduce((acc, c) => acc + (c.horasHorometroObra || 0), 0)
                        .toFixed(1)}{' '}
                      hs
                    </strong>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg">
                    <span className="text-slate-400 text-[10px] block uppercase">Hs Partes Obra</span>
                    <strong className="text-slate-200">
                      {summary.equiposEnObra.reduce((acc, e) => acc + e.horasTotal, 0).toFixed(1)} hs
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {summary.combustiblesAuto.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No se encontraron cargas de combustible cruzadas con los tramos/máquinas de esta obra.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] uppercase text-slate-400">
                      <th className="py-2 px-2">Inc.</th>
                      <th className="py-2 px-2">Fecha Carga</th>
                      <th className="py-2 px-2">Equipo</th>
                      <th className="py-2 px-2">Horómetro (Hs Motor)</th>
                      <th className="py-2 px-2">Tramo / Prorrateo en Obras</th>
                      <th className="py-2 px-2 text-right">Litros Obra</th>
                      <th className="py-2 px-2 text-right">$/L</th>
                      <th className="py-2 px-2 text-right">Subtotal Obra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {summary.combustiblesAuto.map((c) => {
                      const isProrated =
                        c.proporcionObra !== undefined && c.proporcionObra < 0.999;
                      const pctLabel =
                        c.proporcionObra !== undefined
                          ? Math.round(c.proporcionObra * 100)
                          : 100;
                      return (
                        <tr key={c.excludeKey} className={c.excluded ? 'opacity-40 line-through' : ''}>
                          <td className="py-2 px-2">
                            <input
                              type="checkbox"
                              checked={!c.excluded}
                              disabled={isSaving}
                              onChange={() => handleToggleExcludeItem(c.excludeKey)}
                              className="accent-amber-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-2 font-mono text-slate-300 whitespace-nowrap">
                            {c.fecha}
                          </td>
                          <td className="py-2 px-2">
                            <div className="text-white font-medium">{c.equipoLabel}</div>
                            <div className="text-[10px] text-slate-400">{c.tipoCombustible}</div>
                          </td>
                          <td className="py-2 px-2 font-mono">
                            {c.horometroLectura ? (
                              <div className="space-y-0.5">
                                <span className="text-slate-200 block">
                                  Lect.: <strong>{c.horometroLectura}</strong>
                                </span>
                                {c.horasHorometroObra ? (
                                  <span className="text-[10px] text-emerald-400 font-bold block">
                                    +{c.horasHorometroObra} hs reales en obra
                                    {isProrated && c.horasHorometroCarga
                                      ? ` (de ${c.horasHorometroCarga} hs)`
                                      : ''}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            {isProrated ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono text-[10px] font-bold">
                                  Prorrateo {pctLabel}% ({c.horasObraEnTramo}/{c.horasTotalesEnTramo} hs •{' '}
                                  {c.partesObraEnTramo}/{c.partesTotalesEnTramo} partes)
                                </span>
                                {c.obrasEnTramo && c.obrasEnTramo.length > 1 && (
                                  <div
                                    className="text-[10px] text-slate-400 truncate max-w-xs"
                                    title={c.obrasEnTramo.join(' • ')}
                                  >
                                    Compartido: {c.obrasEnTramo.join(' / ')}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-bold">
                                100% Exclusivo Obra
                                {c.partesObraEnTramo
                                  ? ` (${c.partesObraEnTramo} ${
                                      c.partesObraEnTramo === 1 ? 'parte' : 'partes'
                                    }${c.horasObraEnTramo ? ` • ${c.horasObraEnTramo} hs` : ''})`
                                  : ''}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            <span className="text-amber-300 font-bold">{c.litros} L</span>
                            {isProrated && c.litrosTotalesCarga ? (
                              <span className="block text-[10px] text-slate-400">
                                de {c.litrosTotalesCarga} L carga
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-slate-400">
                            {formatCurrency(c.precioUnitario)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-white">
                            {formatCurrency(c.monto)}
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

        {activeRubroTab === 'LUBRICANTES' && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400 mb-2">
              Egresos de Pañol (grasa, aceite, filtros, insumos) y gastos de lubricantes imputados a las máquinas en sus días de obra.
            </p>
            {summary.lubricantesGrasasAuto.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No se detectaron entregas de grasa, aceite o insumos de pañol en esos días/equipos. Podés cargar un gasto manual en la pestaña "Gastos Manuales / Compras".
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] uppercase text-slate-400">
                      <th className="py-2 px-2">Inc.</th>
                      <th className="py-2 px-2">Fecha</th>
                      <th className="py-2 px-2">Equipo</th>
                      <th className="py-2 px-2">Origen</th>
                      <th className="py-2 px-2">Descripción</th>
                      <th className="py-2 px-2 text-right">Cant.</th>
                      <th className="py-2 px-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {summary.lubricantesGrasasAuto.map((item) => (
                      <tr key={item.excludeKey} className={item.excluded ? 'opacity-40 line-through' : ''}>
                        <td className="py-2 px-2">
                          <input
                            type="checkbox"
                            checked={!item.excluded}
                            disabled={isSaving}
                            onChange={() => handleToggleExcludeItem(item.excludeKey)}
                            className="accent-cyan-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-2 font-mono text-slate-300">{item.fecha}</td>
                        <td className="py-2 px-2 text-white font-medium">{item.equipoLabel}</td>
                        <td className="py-2 px-2 text-[10px] font-mono text-cyan-300">{item.source}</td>
                        <td className="py-2 px-2 text-slate-200">{item.descripcion}</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-300">
                          {item.cantidad} {item.unidad}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-white">
                          {formatCurrency(item.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeRubroTab === 'REPARACIONES' && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400 mb-2">
              Services de taller y gastos directos de reparación imputados a las máquinas durante sus días en obra.
            </p>
            {summary.reparacionesAuto.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No se detectaron reparaciones ni services en las fechas trabajadas por los equipos.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] uppercase text-slate-400">
                      <th className="py-2 px-2">Inc.</th>
                      <th className="py-2 px-2">Fecha</th>
                      <th className="py-2 px-2">Equipo</th>
                      <th className="py-2 px-2">Concepto</th>
                      <th className="py-2 px-2">Taller / Prov.</th>
                      <th className="py-2 px-2 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {summary.reparacionesAuto.map((rep) => (
                      <tr key={rep.excludeKey} className={rep.excluded ? 'opacity-40 line-through' : ''}>
                        <td className="py-2 px-2">
                          <input
                            type="checkbox"
                            checked={!rep.excluded}
                            disabled={isSaving}
                            onChange={() => handleToggleExcludeItem(rep.excludeKey)}
                            className="accent-rose-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-2 font-mono text-slate-300">{rep.fecha}</td>
                        <td className="py-2 px-2 text-white font-medium">{rep.equipoLabel}</td>
                        <td className="py-2 px-2 text-slate-200">{rep.concepto}</td>
                        <td className="py-2 px-2 text-slate-400">{rep.proveedorOrMecanico}</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-white">
                          {formatCurrency(rep.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeRubroTab === 'SUELDOS' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 border border-blue-500/30 rounded-xl px-3 py-2">
              <div className="text-xs text-slate-300">
                <span className="font-bold text-blue-300">Cálculo conectado a Liquidación Real (Planillas de Sueldos en Supabase):</span>{' '}
                toma lo liquidado a cada empleado en los meses trabajados y lo prorratea por los{' '}
                <strong className="text-white">{draftConfig.diasLaborablesMes || 24} días/mes</strong>.
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase text-slate-400">Modo Tarifa:</span>
                <select
                  value={draftConfig.modoCalculoSueldosObra || 'LIQUIDACION_TOTAL'}
                  disabled={isSaving}
                  onChange={async (e) => {
                    const nextModo = e.target.value as NonNullable<ObraCostosConfig['modoCalculoSueldosObra']>;
                    const nextCfg = { ...draftConfig, modoCalculoSueldosObra: nextModo };
                    setDraftConfig(nextCfg);
                    await persistObraPatch(
                      { ...obra, costosConfig: nextCfg },
                      'Modo de cálculo de sueldos en obra actualizado en Supabase.'
                    );
                  }}
                  className="bg-slate-900 border border-blue-500/40 rounded-lg px-2.5 py-1 text-xs font-bold text-blue-200 focus:outline-none cursor-pointer"
                >
                  <option value="LIQUIDACION_TOTAL">
                    Liquidación Real Total (Básico + Extras ÷ {draftConfig.diasLaborablesMes || 24} días)
                  </option>
                  <option value="LIQUIDACION_BASICO">
                    Liquidación Real Solo Básico (Básico Planilla ÷ {draftConfig.diasLaborablesMes || 24} días)
                  </option>
                  <option value="JORNAL_BASE_SHEET">
                    Valor Base Unidad Planilla ($ 60.000 / día)
                  </option>
                  <option value="REFERENCIA_MANUAL">
                    Sueldo Mensual Ref. Manual ({formatCurrency(draftConfig.sueldoMensualDefault || 950000)} ÷ {draftConfig.diasLaborablesMes || 24}d)
                  </option>
                </select>
              </div>
            </div>

            {summary.sueldosAuto.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No hay operarios detectados en partes diarios o contratos vinculados a esta obra.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] uppercase text-slate-400">
                      <th className="py-2 px-2">Inc.</th>
                      <th className="py-2 px-2">Operario</th>
                      <th className="py-2 px-2 text-center">Días / Hs</th>
                      <th className="py-2 px-2">Fuente Tarifa (Liquidación Real)</th>
                      <th className="py-2 px-2 text-right">Valor Aplicado</th>
                      <th className="py-2 px-2 text-right">Proporcional</th>
                      <th className="py-2 px-2 text-right">Ajustar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {summary.sueldosAuto.map((s) => {
                      const isEditing = editingPayrollKey === s.empleadoKey;
                      return (
                        <tr key={s.excludeKey} className={s.excluded ? 'opacity-40 line-through' : ''}>
                          <td className="py-2 px-2">
                            <input
                              type="checkbox"
                              checked={!s.excluded}
                              disabled={isSaving}
                              onChange={() => handleToggleExcludeItem(s.excludeKey)}
                              className="accent-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <div className="text-white font-semibold">{s.empleadoNombre}</div>
                            <div className="text-[10px] text-slate-400">{s.categoriaNombre}</div>
                          </td>
                          <td className="py-2 px-2 text-center font-mono">
                            <span className="text-amber-300 font-bold">{s.diasTrabajados} d</span>
                            <span className="text-slate-500"> / {s.horasTrabajadas} hs</span>
                          </td>
                          <td className="py-2 px-2">
                            <div className="text-emerald-300 font-semibold">{s.fuenteTarifa}</div>
                            {(s.sueldoMensualLiquidado || s.sueldoBasicoPlanilla) && (
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                {s.sueldoBasicoPlanilla ? `Básico Planilla: ${formatCurrency(s.sueldoBasicoPlanilla)}/mes` : ''}
                                {s.sueldoMensualLiquidado && s.sueldoMensualLiquidado !== s.sueldoBasicoPlanilla
                                  ? ` • Total c/Extras: ${formatCurrency(s.sueldoMensualLiquidado)}/mes`
                                  : ''}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-slate-200">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <select
                                  value={editPayrollModo}
                                  onChange={(e) => setEditPayrollModo(e.target.value as any)}
                                  className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[11px]"
                                >
                                  <option value="DIA">$/día</option>
                                  <option value="HORA">$/hs</option>
                                </select>
                                <input
                                  type="number"
                                  value={editPayrollValor}
                                  onChange={(e) => setEditPayrollValor(Number(e.target.value))}
                                  className="w-24 bg-slate-950 border border-blue-500 rounded px-2 py-1 text-right text-white font-mono"
                                />
                              </div>
                            ) : (
                              <span>
                                {formatCurrency(s.tarifaAplicada)} / {s.modoCalculo === 'HORA' ? 'hs' : 'día'}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-blue-300">
                            {formatCurrency(s.montoTotal)}
                          </td>
                          <td className="py-2 px-2 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => handleSavePayrollOverride(s.empleadoKey)}
                                  className="px-2 py-1 bg-blue-500 hover:bg-blue-400 text-white rounded text-[11px] font-bold cursor-pointer"
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPayrollKey(null)}
                                  className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[11px] cursor-pointer"
                                >
                                  X
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPayrollKey(s.empleadoKey);
                                  setEditPayrollModo(s.modoCalculo);
                                  setEditPayrollValor(s.tarifaAplicada);
                                }}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
                              >
                                Ajustar
                              </button>
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

        {activeRubroTab === 'MANUALES' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-400">
                Cargá gastos adicionales de la obra (combustible extra, grasa/aceite, reparaciones externas, fletes, viáticos o importá facturas de Compras).
              </p>
              <button
                type="button"
                onClick={() => setIsManualFormOpen((prev) => !prev)}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>{isManualFormOpen ? 'Cerrar Formulario' : 'Agregar Gasto de Obra'}</span>
              </button>
            </div>

            {isManualFormOpen && (
              <form
                onSubmit={handleAddManualGasto}
                className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 space-y-3"
              >
                {/* Optional import from PurchaseInvoices */}
                {purchaseInvoices.length > 0 && (
                  <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
                    <label className="text-[10px] font-bold uppercase text-emerald-400 flex items-center gap-1 mb-1">
                      <ShoppingBag className="w-3 h-3" />
                      <span>Importar desde Factura de Compra cargada (Opcional)</span>
                    </label>
                    <select
                      value={manualPurchaseId}
                      onChange={(e) => handleImportPurchaseInvoice(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="">-- Carga manual / Seleccionar comprobante de Compras --</option>
                      {purchaseInvoices.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fechaEmision} | {p.proveedorNombre} | {p.nroComprobanteCompleto} | Neto{' '}
                          {formatCurrency(p.netoGravado || p.montoTotal)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={manualFecha}
                      onChange={(e) => setManualFecha(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Categoría de Costo
                    </label>
                    <select
                      value={manualCategoria}
                      onChange={(e) => setManualCategoria(e.target.value as ObraGastoCategoria)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    >
                      {GASTO_CATEGORIAS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Máquina / Equipo (Opcional)
                    </label>
                    <select
                      value={manualEquipo}
                      onChange={(e) => setManualEquipo(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    >
                      <option value="">-- General de Obra --</option>
                      {fleet.map((v) => (
                        <option key={v.id} value={`${v.codigoInterno || v.patente} - ${v.modeloMarca}`}>
                          [{v.codigoInterno || v.patente}] {v.modeloMarca}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-emerald-400 mb-1">
                      Monto Neto ($) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={manualMonto}
                      onChange={(e) => setManualMonto(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-emerald-500/40 rounded-lg px-2.5 py-1.5 text-emerald-300 font-bold font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Descripción / Concepto *
                    </label>
                    <input
                      type="text"
                      required
                      value={manualDescripcion}
                      onChange={(e) => setManualDescripcion(e.target.value)}
                      placeholder="Ej. Balde grasa litio 18kg + Cambio manguera hidráulica"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Proveedor / Nro Comp.
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={manualProveedor}
                        onChange={(e) => setManualProveedor(e.target.value)}
                        placeholder="Proveedor"
                        className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white"
                      />
                      <input
                        type="text"
                        value={manualNroComp}
                        onChange={(e) => setManualNroComp(e.target.value)}
                        placeholder="Comp."
                        className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5">
                      {isUploadingAtt ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>Adjuntar Ticket/Factura</span>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={handleManualFileUpload}
                        className="hidden"
                        disabled={isUploadingAtt}
                      />
                    </label>
                    {manualAdjuntos.map((a) => (
                      <span
                        key={a.id}
                        className="text-[11px] bg-slate-800 text-amber-300 px-2 py-1 rounded flex items-center gap-1"
                      >
                        <Paperclip className="w-3 h-3" />
                        {a.nombre}
                      </span>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg text-xs font-black cursor-pointer flex items-center gap-1.5"
                  >
                    {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Guardar Gasto en Supabase</span>
                  </button>
                </div>
              </form>
            )}

            {gastosManuales.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No hay gastos manuales cargados para esta obra.
              </div>
            ) : (
              <div className="space-y-2">
                {gastosManuales.map((g) => (
                  <div
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-slate-400">{g.fecha}</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                          {GASTO_CATEGORIAS.find((c) => c.value === g.categoria)?.label || g.categoria}
                        </span>
                        {g.equipoCodigo && (
                          <span className="text-amber-300 font-mono text-[11px]">{g.equipoCodigo}</span>
                        )}
                      </div>
                      <div className="text-white font-semibold">{g.descripcion}</div>
                      {(g.proveedor || g.nroComprobante) && (
                        <div className="text-[11px] text-slate-400">
                          {g.proveedor} {g.nroComprobante ? `• Comp: ${g.nroComprobante}` : ''}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {(g.adjuntos || []).map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          onClick={() => setPreviewAdjunto(att)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg cursor-pointer"
                          title={`Ver ${att.nombre}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      ))}
                      <span className="font-mono font-bold text-white text-sm">
                        {formatCurrency(g.monto)}
                      </span>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleDeleteManualGasto(g.id)}
                        className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg cursor-pointer"
                        title="Eliminar gasto"
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

      {/* Preview Attachment Modal */}
      {previewAdjunto && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
            <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white truncate">{previewAdjunto.nombre}</span>
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
