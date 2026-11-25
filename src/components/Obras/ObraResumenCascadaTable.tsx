import React, { useState, useMemo } from 'react';
import {
  Obra,
  ObraCostosConfig,
  ObraGastoManual
} from '../../types';
import {
  ObraRentabilidadSummary,
  getDefaultObraCostosConfig,
  normalizeObraDateKey
} from '../../utils/obraCostosEngine';
import { formatCurrency } from '../../services/storage';
import {
  Fuel,
  Users,
  Wrench,
  Percent,
  Truck,
  TrendingUp,
  TrendingDown,
  Edit3,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Sliders,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

interface ObraResumenCascadaTableProps {
  obra: Obra;
  summary: ObraRentabilidadSummary;
  activeContenedorTitulo?: string;
  onSaveObra: (updatedObra: Obra) => Promise<{ ok: boolean; error?: string }>;
  onNavigateTab?: (
    tab: 'info' | 'facturas' | 'contenedores' | 'personal' | 'combustible' | 'costos' | 'partes'
  ) => void;
}

export const ObraResumenCascadaTable: React.FC<ObraResumenCascadaTableProps> = ({
  obra,
  summary,
  activeContenedorTitulo,
  onSaveObra,
  onNavigateTab
}) => {
  const [showFuelDetailLoads, setShowFuelDetailLoads] = useState(false);
  const [isQuickConfigOpen, setIsQuickConfigOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Inline Employee rate editor
  const [editingEmpKey, setEditingEmpKey] = useState<string | null>(null);
  const [editEmpModo, setEditEmpModo] = useState<'DIA' | 'HORA'>('DIA');
  const [editEmpVal, setEditEmpVal] = useState<number>(0);

  // Inline Vehicle Amortization editor
  const [editingAmortKey, setEditingAmortKey] = useState<string | null>(null);
  const [editAmortModo, setEditAmortModo] = useState<'HORA' | 'DIA' | 'FIJO'>('DIA');
  const [editAmortVal, setEditAmortVal] = useState<number>(0);

  // Inline General / Administrative Expense editor
  const [isEditingAdminRow, setIsEditingAdminRow] = useState(false);

  // Quick General Expenses + Default Amortization config
  const cfg = useMemo(() => getDefaultObraCostosConfig(obra.costosConfig), [obra.costosConfig]);
  const [pctGastosGrales, setPctGastosGrales] = useState<number>(cfg.porcentajeGastosGenerales ?? 10);
  const [baseGastosGralesMode, setBaseGastosGralesMode] = useState<'COSTOS_DIRECTOS' | 'FACTURACION_NETA'>(
    cfg.baseCalculoGastosGenerales || 'COSTOS_DIRECTOS'
  );
  const [fijoAdmin, setFijoAdmin] = useState<number>(cfg.montoFijoAdministrativo ?? 0);
  const [descAdmin, setDescAdmin] = useState<string>(
    cfg.descripcionPaqueteAdmin || 'Paquete Administrativo, Estructura, Seguros y Gastos Generales'
  );
  const [pctAmortGlobal, setPctAmortGlobal] = useState<number>(cfg.porcentajeAmortizacionVehiculos ?? 0);
  const [amortHoraRef, setAmortHoraRef] = useState<number>(cfg.amortizacionPorHoraDefault ?? 0);
  const [amortDiaRef, setAmortDiaRef] = useState<number>(cfg.amortizacionPorDiaDefault ?? 0);

  const persistConfigChange = async (nextConfig: ObraCostosConfig, okText: string) => {
    setIsSaving(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    const res = await onSaveObra({
      ...obra,
      costosConfig: nextConfig
    });
    setIsSaving(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'No se pudo guardar en Supabase.');
      return false;
    }
    setFeedbackMsg(okText);
    return true;
  };

  const handleSaveEmpOverride = async (empleadoKey: string) => {
    const val = Math.max(0, Number(editEmpVal) || 0);
    const nextOverrides = {
      ...(cfg.tarifasEmpleadoOverride || {}),
      [empleadoKey]: {
        modo: editEmpModo,
        costoPorDia: editEmpModo === 'DIA' ? val : undefined,
        costoPorHora: editEmpModo === 'HORA' ? val : undefined
      }
    };
    const ok = await persistConfigChange(
      { ...cfg, tarifasEmpleadoOverride: nextOverrides },
      'Tarifa de personal actualizada en Supabase.'
    );
    if (ok) setEditingEmpKey(null);
  };

  const handleSaveAmortOverride = async (equipoKey: string) => {
    const val = Math.max(0, Number(editAmortVal) || 0);
    const nextOverrides = {
      ...(cfg.tarifasAmortizacionOverride || {}),
      [equipoKey]: {
        modo: editAmortModo,
        costoPorHora: editAmortModo === 'HORA' ? val : undefined,
        costoPorDia: editAmortModo === 'DIA' ? val : undefined,
        montoFijo: editAmortModo === 'FIJO' ? val : undefined
      }
    };
    const ok = await persistConfigChange(
      { ...cfg, tarifasAmortizacionOverride: nextOverrides },
      'Amortización de vehículo guardada en Supabase.'
    );
    if (ok) setEditingAmortKey(null);
  };

  const openAdminInlineEditor = () => {
    setPctGastosGrales(cfg.porcentajeGastosGenerales ?? 10);
    setBaseGastosGralesMode(cfg.baseCalculoGastosGenerales || 'COSTOS_DIRECTOS');
    setFijoAdmin(cfg.montoFijoAdministrativo ?? 0);
    setDescAdmin(
      cfg.descripcionPaqueteAdmin || 'Paquete Administrativo, Estructura, Seguros y Gastos Generales'
    );
    setIsEditingAdminRow(true);
  };

  const handleSaveAdminInline = async () => {
    const ok = await persistConfigChange(
      {
        ...cfg,
        porcentajeGastosGenerales: Math.max(0, Number(pctGastosGrales) || 0),
        baseCalculoGastosGenerales: baseGastosGralesMode,
        montoFijoAdministrativo: Math.max(0, Number(fijoAdmin) || 0),
        descripcionPaqueteAdmin:
          descAdmin.trim() || 'Paquete Administrativo, Estructura, Seguros y Gastos Generales'
      },
      'Gasto administrativo y paquete general actualizado en Supabase.'
    );
    if (ok) setIsEditingAdminRow(false);
  };

  const handleSaveQuickGlobalParams = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await persistConfigChange(
      {
        ...cfg,
        porcentajeGastosGenerales: Math.max(0, Number(pctGastosGrales) || 0),
        baseCalculoGastosGenerales: baseGastosGralesMode,
        montoFijoAdministrativo: Math.max(0, Number(fijoAdmin) || 0),
        porcentajeAmortizacionVehiculos: Math.max(0, Number(pctAmortGlobal) || 0),
        amortizacionPorHoraDefault: Math.max(0, Number(amortHoraRef) || 0),
        amortizacionPorDiaDefault: Math.max(0, Number(amortDiaRef) || 0)
      },
      'Parámetros de Gastos Generales y Amortización guardados en Supabase.'
    );
    if (ok) setIsQuickConfigOpen(false);
  };

  // Filter manual expenses for the active date range
  const manualGastosFiltered = useMemo(() => {
    return (obra.gastosManuales || []).filter((g: ObraGastoManual) => {
      const dKey = normalizeObraDateKey(g.fecha);
      if (!dKey) return true;
      if (cfg.fechaDesdeFiltro && dKey < cfg.fechaDesdeFiltro) return false;
      if (cfg.fechaHastaFiltro && dKey > cfg.fechaHastaFiltro) return false;
      return true;
    });
  }, [obra.gastosManuales, cfg.fechaDesdeFiltro, cfg.fechaHastaFiltro]);

  // Build sequential cascade rows with running cumulative sum (∑ Acumulado)
  const cascadeData = useMemo(() => {
    let runningSum = 0;

    // 1. COMBUSTIBLE (por tipo)
    const fuelRows = summary.combustiblesPorTipo.map((f) => {
      runningSum = Number((runningSum + f.montoTotal).toFixed(2));
      return {
        ...f,
        acumulado: runningSum
      };
    });
    const subtotalCombustibleAcum = runningSum;

    // 2. PERSONAL (cada empleado cuánto costó)
    const activeEmployees = summary.sueldosAuto.filter((s) => !s.excluded);
    const manualSueldos = manualGastosFiltered.filter((g) => g.categoria === 'SUELDOS_JORNALES');

    const employeeRows = activeEmployees.map((emp) => {
      runningSum = Number((runningSum + emp.montoTotal).toFixed(2));
      return {
        ...emp,
        acumulado: runningSum
      };
    });

    const manualSueldoRows = manualSueldos.map((g) => {
      const m = Number(g.monto || 0);
      runningSum = Number((runningSum + m).toFixed(2));
      return {
        id: g.id,
        fecha: g.fecha,
        descripcion: g.descripcion,
        empleadoNombre: g.empleadoNombre || 'Jornal / Viático Manual',
        monto: m,
        acumulado: runningSum
      };
    });
    const subtotalPersonalAcum = runningSum;

    // 3. MANTENIMIENTO, TALLER, LUBRICANTES Y OTROS DIRECTOS
    type MaintCascadeRow = {
      key: string;
      tipoBadge: string;
      fecha: string;
      equipoLabel: string;
      concepto: string;
      cantidadLabel: string;
      monto: number;
      acumulado: number;
    };

    const maintRaw: Omit<MaintCascadeRow, 'acumulado'>[] = [];

    summary.lubricantesGrasasAuto
      .filter((l) => !l.excluded)
      .forEach((l) => {
        maintRaw.push({
          key: l.excludeKey,
          tipoBadge: 'LUBRICANTE / PAÑOL',
          fecha: l.fecha,
          equipoLabel: l.equipoLabel,
          concepto: l.descripcion,
          cantidadLabel: `${l.cantidad} ${l.unidad}`,
          monto: l.monto
        });
      });

    summary.reparacionesAuto
      .filter((r) => !r.excluded)
      .forEach((r) => {
        maintRaw.push({
          key: r.excludeKey,
          tipoBadge: r.source === 'SERVICE_TALLER' ? 'SERVICE TALLER' : 'REPARACIÓN',
          fecha: r.fecha,
          equipoLabel: r.equipoLabel,
          concepto: r.concepto,
          cantidadLabel: r.proveedorOrMecanico || 'Taller',
          monto: r.monto
        });
      });

    manualGastosFiltered
      .filter((g) => g.categoria !== 'COMBUSTIBLE' && g.categoria !== 'SUELDOS_JORNALES')
      .forEach((g) => {
        maintRaw.push({
          key: `MAN:${g.id}`,
          tipoBadge:
            g.categoria === 'LUBRICANTES_GRASA_ACEITE'
              ? 'LUBRICANTE MANUAL'
              : g.categoria === 'REPARACION_MANTENIMIENTO'
                ? 'TALLER MANUAL'
                : g.categoria.replace(/_/g, ' '),
          fecha: g.fecha,
          equipoLabel: g.equipoCodigo || 'Obra Gral.',
          concepto: g.descripcion,
          cantidadLabel: g.proveedor || g.nroComprobante || 'Gasto Directo',
          monto: Number(g.monto || 0)
        });
      });

    const maintRows: MaintCascadeRow[] = maintRaw.map((item) => {
      runningSum = Number((runningSum + item.monto).toFixed(2));
      return {
        ...item,
        acumulado: runningSum
      };
    });

    const totalMantenimientoYOtros = Number(
      (summary.totalLubricantes + summary.totalReparaciones + summary.totalOtrosDirectos).toFixed(2)
    );
    const subtotalDirectosAcum = runningSum; // = summary.totalCostosDirectos

    // 4. GASTOS GENERALES / PAQUETE ADMINISTRATIVO
    const baseGastosGrales =
      summary.baseCalculoGastosGenerales === 'FACTURACION_NETA'
        ? summary.facturadoNetoSinIva
        : summary.totalCostosDirectos;
    const montoPorcentajeAdmin = Number(
      ((baseGastosGrales * summary.porcentajeGastosGenerales) / 100).toFixed(2)
    );
    runningSum = Number((runningSum + montoPorcentajeAdmin).toFixed(2));
    const acumAfterPctAdmin = runningSum;

    const montoFijoAdmin = Number((summary.montoFijoAdministrativo || 0).toFixed(2));
    if (montoFijoAdmin > 0) {
      runningSum = Number((runningSum + montoFijoAdmin).toFixed(2));
    }
    const subtotalConGastosGralesAcum = runningSum;

    // 5. AMORTIZACIÓN DE VEHÍCULOS / EQUIPOS
    const activeAmortEquipos = summary.amortizacionesAuto.filter((a) => !a.excluded);
    const amortEquipoRows = activeAmortEquipos.map((a) => {
      runningSum = Number((runningSum + a.montoTotal).toFixed(2));
      return {
        ...a,
        acumulado: runningSum
      };
    });

    const baseAmort =
      summary.baseCalculoAmortizacion === 'FACTURACION_NETA'
        ? summary.facturadoNetoSinIva
        : summary.totalCostosDirectos;
    const montoPorcentajeAmort = Number(
      ((baseAmort * (summary.porcentajeAmortizacionVehiculos || 0)) / 100).toFixed(2)
    );
    let acumAfterPctAmort = runningSum;
    if (montoPorcentajeAmort > 0) {
      runningSum = Number((runningSum + montoPorcentajeAmort).toFixed(2));
      acumAfterPctAmort = runningSum;
    }

    const montoFijoAmort = Number((summary.montoFijoAmortizacionVehiculos || 0).toFixed(2));
    let acumAfterFijoAmort = runningSum;
    if (montoFijoAmort > 0) {
      runningSum = Number((runningSum + montoFijoAmort).toFixed(2));
      acumAfterFijoAmort = runningSum;
    }

    const totalFinalAcumulado = runningSum;

    return {
      fuelRows,
      subtotalCombustibleAcum,
      employeeRows,
      manualSueldoRows,
      subtotalPersonalAcum,
      maintRows,
      totalMantenimientoYOtros,
      subtotalDirectosAcum,
      baseGastosGrales,
      montoPorcentajeAdmin,
      acumAfterPctAdmin,
      montoFijoAdmin,
      subtotalConGastosGralesAcum,
      amortEquipoRows,
      baseAmort,
      montoPorcentajeAmort,
      acumAfterPctAmort,
      montoFijoAmort,
      acumAfterFijoAmort,
      totalFinalAcumulado
    };
  }, [summary, manualGastosFiltered]);

  const totalBaseForPct = Math.max(1, summary.costoTotalObra);
  const fmtPct = (amount: number) => `${((amount / totalBaseForPct) * 100).toFixed(1)}%`;

  const handleExportCascadeCSV = () => {
    const csvRows: string[][] = [
      ['OBRA', `${obra.numero} - ${obra.nombreObra}`],
      ['ALCANCE', activeContenedorTitulo ? `Contenedor: ${activeContenedorTitulo}` : 'Toda la obra'],
      [''],
      ['ETAPA / RUBRO', 'DETALLE / ÍTEM', 'CANTIDAD / BASE', 'PRECIO / TARIFA UNIT.', 'IMPORTE ($)', 'ACUMULADO CASCADA ($)', '% S/ COSTO TOTAL']
    ];

    // 1. Combustible
    cascadeData.fuelRows.forEach((f) => {
      csvRows.push([
        '1. COMBUSTIBLE',
        f.tipoCombustible,
        `${f.litrosTotal} L (${f.cargasCount} cargas)`,
        `${f.precioPromedioLitro} $/L`,
        String(f.montoTotal),
        String(f.acumulado),
        fmtPct(f.montoTotal)
      ]);
    });
    csvRows.push([
      'SUBTOTAL 1',
      'Total Combustible',
      '',
      '',
      String(summary.totalCombustible),
      String(cascadeData.subtotalCombustibleAcum),
      fmtPct(summary.totalCombustible)
    ]);

    // 2. Personal
    cascadeData.employeeRows.forEach((emp) => {
      csvRows.push([
        '2. PERSONAL',
        `${emp.empleadoNombre} (${emp.categoriaNombre})`,
        `${emp.diasTrabajados} d / ${emp.horasTrabajadas} hs`,
        `${emp.tarifaAplicada} $/${emp.modoCalculo === 'HORA' ? 'hs' : 'día'}`,
        String(emp.montoTotal),
        String(emp.acumulado),
        fmtPct(emp.montoTotal)
      ]);
    });
    cascadeData.manualSueldoRows.forEach((ms) => {
      csvRows.push([
        '2. PERSONAL (MANUAL)',
        `${ms.empleadoNombre} - ${ms.descripcion}`,
        ms.fecha,
        'Manual',
        String(ms.monto),
        String(ms.acumulado),
        fmtPct(ms.monto)
      ]);
    });
    csvRows.push([
      'SUBTOTAL 2',
      'Total Personal (Acum. Combustible + Personal)',
      '',
      '',
      String(summary.totalSueldos),
      String(cascadeData.subtotalPersonalAcum),
      fmtPct(summary.totalSueldos)
    ]);

    // 3. Mantenimiento
    cascadeData.maintRows.forEach((m) => {
      csvRows.push([
        `3. MANTENIMIENTO (${m.tipoBadge})`,
        `${m.equipoLabel} — ${m.concepto}`,
        `${m.fecha} · ${m.cantidadLabel}`,
        '',
        String(m.monto),
        String(m.acumulado),
        fmtPct(m.monto)
      ]);
    });
    csvRows.push([
      'SUBTOTAL 3 (COSTOS DIRECTOS)',
      'Total Costos Directos (Combustible + Personal + Mantenimiento)',
      '',
      '',
      String(summary.totalCostosDirectos),
      String(cascadeData.subtotalDirectosAcum),
      fmtPct(summary.totalCostosDirectos)
    ]);

    // 4. Gastos Generales
    csvRows.push([
      '4. GASTOS GENERALES',
      `Paquete Administrativo (${summary.porcentajeGastosGenerales}%)`,
      summary.baseCalculoGastosGenerales === 'FACTURACION_NETA' ? 's/ Facturación Neta' : 's/ Costos Directos',
      `${summary.porcentajeGastosGenerales}%`,
      String(cascadeData.montoPorcentajeAdmin),
      String(cascadeData.acumAfterPctAdmin),
      fmtPct(cascadeData.montoPorcentajeAdmin)
    ]);
    if (cascadeData.montoFijoAdmin > 0) {
      csvRows.push([
        '4. GASTOS GENERALES (FIJO)',
        'Monto Fijo Administrativo',
        'Fijo',
        '',
        String(cascadeData.montoFijoAdmin),
        String(cascadeData.subtotalConGastosGralesAcum),
        fmtPct(cascadeData.montoFijoAdmin)
      ]);
    }

    // 5. Amortización Vehículos
    cascadeData.amortEquipoRows.forEach((a) => {
      csvRows.push([
        '5. AMORTIZACIÓN VEHÍCULOS',
        `${a.codigoInterno ? `[${a.codigoInterno}] ` : ''}${a.equipoLabel}`,
        `${a.diasTrabajados} d · ${a.horasTrabajadas} hs`,
        `${a.tarifaAplicada} $/${a.modoCalculo === 'HORA' ? 'hs' : a.modoCalculo === 'DIA' ? 'día' : 'fijo'}`,
        String(a.montoTotal),
        String(a.acumulado),
        fmtPct(a.montoTotal)
      ]);
    });
    if (cascadeData.montoPorcentajeAmort > 0) {
      csvRows.push([
        '5. AMORTIZACIÓN (%)',
        `Amortización porcentual (${summary.porcentajeAmortizacionVehiculos}%)`,
        '',
        `${summary.porcentajeAmortizacionVehiculos}%`,
        String(cascadeData.montoPorcentajeAmort),
        String(cascadeData.acumAfterPctAmort),
        fmtPct(cascadeData.montoPorcentajeAmort)
      ]);
    }

    csvRows.push([
      'TOTAL CASCADA DE COSTOS',
      'COSTO TOTAL ACUMULADO DE LA OBRA',
      '',
      '',
      String(summary.costoTotalObra),
      String(summary.costoTotalObra),
      '100%'
    ]);
    csvRows.push([
      'INGRESOS FACTURADOS',
      summary.evaluarSobreNetoSinIva ? 'Facturación Neta s/ IVA' : 'Facturación Total c/ IVA',
      '',
      '',
      String(summary.baseIngresosEvaluacion),
      '',
      ''
    ]);
    csvRows.push([
      'RESULTADO NETO',
      `Margen: ${summary.margenPorcentaje}%`,
      '',
      '',
      String(summary.resultadoNeto),
      '',
      ''
    ]);

    const csv = csvRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resumen_Cascada_Obra_${(obra.numero || obra.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Top Bar of Waterfall Table */}
      <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs">
            ∑
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                Tabla Resumen de Gastos en Cascada
              </h4>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {activeContenedorTitulo ? `Contenedor: ${activeContenedorTitulo}` : 'Toda la obra'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Suma acumulativa paso a paso: Combustible → Personal → Mantenimiento → Gastos Generales → Amortización de Vehículos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setPctGastosGrales(cfg.porcentajeGastosGenerales ?? 10);
              setBaseGastosGralesMode(cfg.baseCalculoGastosGenerales || 'COSTOS_DIRECTOS');
              setFijoAdmin(cfg.montoFijoAdministrativo ?? 0);
              setDescAdmin(
                cfg.descripcionPaqueteAdmin ||
                  'Paquete Administrativo, Estructura, Seguros y Gastos Generales'
              );
              setPctAmortGlobal(cfg.porcentajeAmortizacionVehiculos ?? 0);
              setAmortHoraRef(cfg.amortizacionPorHoraDefault ?? 0);
              setAmortDiaRef(cfg.amortizacionPorDiaDefault ?? 0);
              setIsQuickConfigOpen((prev) => !prev);
            }}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer border transition ${
              isQuickConfigOpen
                ? 'bg-amber-500 text-black border-amber-400'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configurar % Gastos Grales / Amortización</span>
          </button>

          <button
            type="button"
            onClick={handleExportCascadeCSV}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Exportar Cascada CSV</span>
          </button>
        </div>
      </div>

      {/* Feedback / Error banners */}
      {errorMsg && (
        <div className="mx-4 mt-3 bg-red-500/15 border border-red-500/40 text-red-200 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-300 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {feedbackMsg && (
        <div className="mx-4 mt-3 bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-emerald-300 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Quick Inline Config Panel for General Expenses & Vehicle Amortization */}
      {isQuickConfigOpen && (
        <form
          onSubmit={handleSaveQuickGlobalParams}
          className="mx-4 mt-3 p-3 bg-slate-950 border border-amber-500/30 rounded-xl space-y-2.5 text-xs"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">
              Ajuste Rápido de Gastos Generales y Amortización de Equipos (Persistido en Supabase)
            </span>
            <button
              type="button"
              onClick={() => setIsQuickConfigOpen(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase text-purple-300 mb-1">
                % Gastos Generales
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={pctGastosGrales}
                onChange={(e) => setPctGastosGrales(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-purple-300 mb-1">
                Base del % Admin
              </label>
              <select
                value={baseGastosGralesMode}
                onChange={(e) =>
                  setBaseGastosGralesMode(e.target.value as 'COSTOS_DIRECTOS' | 'FACTURACION_NETA')
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px]"
              >
                <option value="COSTOS_DIRECTOS">s/ Costos Directos</option>
                <option value="FACTURACION_NETA">s/ Fact. Neta</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Monto Fijo Admin ($)
              </label>
              <input
                type="number"
                step="1000"
                min="0"
                value={fijoAdmin}
                onChange={(e) => setFijoAdmin(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-cyan-300 mb-1">
                Amort. Default ($/Hora)
              </label>
              <input
                type="number"
                step="500"
                min="0"
                value={amortHoraRef}
                onChange={(e) => setAmortHoraRef(Number(e.target.value))}
                placeholder="Ej: 8000"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-cyan-300 mb-1">
                Amort. Default ($/Día)
              </label>
              <input
                type="number"
                step="1000"
                min="0"
                value={amortDiaRef}
                onChange={(e) => setAmortDiaRef(Number(e.target.value))}
                placeholder="Ej: 25000"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-cyan-300 mb-1">
                % Amort. Adicional
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={pctAmortGlobal}
                onChange={(e) => setPctAmortGlobal(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              También podés ajustar la tarifa individual de cada empleado o vehículo haciendo clic en el lápiz de su fila.
            </span>
            <button
              type="submit"
              disabled={isSaving}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Guardar en Supabase</span>
            </button>
          </div>
        </form>
      )}

      {/* Compact Waterfall Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-950/80 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
              <th className="py-2 px-3 font-bold">Rubro / Concepto en Cascada</th>
              <th className="py-2 px-2.5 font-bold">Cantidad / Base</th>
              <th className="py-2 px-2.5 text-right font-bold">Precio / Tarifa Unit.</th>
              <th className="py-2 px-2.5 text-right font-bold">Gasto del Ítem ($)</th>
              <th className="py-2 px-3 text-right font-bold text-amber-300 bg-amber-500/5">
                ∑ Acumulado Cascada ($)
              </th>
              <th className="py-2 px-2.5 text-right font-bold w-20">% Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {/* ========================================================================= */}
            {/* 1. COMBUSTIBLE */}
            {/* ========================================================================= */}
            <tr className="bg-amber-500/10 border-t border-amber-500/20">
              <td colSpan={3} className="py-1.5 px-3">
                <div className="flex items-center gap-2">
                  <Fuel className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-black uppercase tracking-wider text-[11px] text-amber-300">
                    1. Combustible (Por Tipo de Combustible)
                  </span>
                  {summary.combustiblesAuto.filter((c) => !c.excluded).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowFuelDetailLoads((prev) => !prev)}
                      className="text-[10px] font-semibold text-amber-200/90 hover:text-white bg-slate-900/80 border border-amber-500/30 rounded px-1.5 py-0.5 flex items-center gap-0.5 cursor-pointer"
                    >
                      {showFuelDetailLoads ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      <span>
                        {showFuelDetailLoads ? 'Ocultar cargas' : `Ver ${summary.combustiblesAuto.filter((c) => !c.excluded).length} cargas`}
                      </span>
                    </button>
                  )}
                </div>
              </td>
              <td className="py-1.5 px-2.5 text-right font-mono font-bold text-amber-300">
                {formatCurrency(summary.totalCombustible)}
              </td>
              <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200 bg-amber-500/5">
                {formatCurrency(cascadeData.subtotalCombustibleAcum)}
              </td>
              <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-amber-300/90">
                {fmtPct(summary.totalCombustible)}
              </td>
            </tr>

            {cascadeData.fuelRows.length === 0 ? (
              <tr className="text-slate-500">
                <td colSpan={6} className="py-1.5 px-6 text-[11px] italic">
                  Sin consumo de combustible registrado en este alcance.
                </td>
              </tr>
            ) : (
              cascadeData.fuelRows.map((f) => (
                <tr key={f.tipoCombustible} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-1.5 pl-6 pr-3 text-slate-200 font-medium">
                    <span className="text-amber-400/80 mr-1.5">↳</span>
                    {f.tipoCombustible}
                  </td>
                  <td className="py-1.5 px-2.5 font-mono text-[11px] text-slate-300">
                    {f.litrosTotal > 0 ? (
                      <>
                        <strong className="text-amber-300">{f.litrosTotal.toLocaleString('es-AR')} L</strong>{' '}
                        <span className="text-slate-500">({f.cargasCount} {f.cargasCount === 1 ? 'carga' : 'cargas'})</span>
                      </>
                    ) : (
                      <span>{f.cargasCount} comp. directo</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-300">
                    {f.litrosTotal > 0 ? `${formatCurrency(f.precioPromedioLitro)} / L` : '—'}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-white">
                    + {formatCurrency(f.montoTotal)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200/90 bg-amber-500/5">
                    {formatCurrency(f.acumulado)}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">
                    {fmtPct(f.montoTotal)}
                  </td>
                </tr>
              ))
            )}

            {/* Optional expandable individual fuel loads */}
            {showFuelDetailLoads &&
              summary.combustiblesAuto
                .filter((c) => !c.excluded)
                .map((c) => (
                  <tr key={c.excludeKey} className="bg-slate-950/60 text-[11px] text-slate-400">
                    <td className="py-1 pl-10 pr-3 truncate max-w-xs">
                      • {c.fecha} · <span className="text-slate-300">{c.equipoLabel}</span> ({c.tipoCombustible})
                    </td>
                    <td className="py-1 px-2.5 font-mono">
                      {c.litros} L
                      {c.proporcionObra !== undefined && c.proporcionObra < 0.999
                        ? ` (${Math.round(c.proporcionObra * 100)}% de ${c.litrosTotalesCarga} L)`
                        : ''}
                    </td>
                    <td className="py-1 px-2.5 text-right font-mono">
                      {formatCurrency(c.precioUnitario)} / L
                    </td>
                    <td className="py-1 px-2.5 text-right font-mono text-slate-300">
                      {formatCurrency(c.monto)}
                    </td>
                    <td className="py-1 px-3 text-right font-mono text-slate-500 bg-amber-500/5">
                      —
                    </td>
                    <td className="py-1 px-2.5 text-right font-mono text-slate-500">
                      {fmtPct(c.monto)}
                    </td>
                  </tr>
                ))}

            {/* ========================================================================= */}
            {/* 2. PERSONAL / MANO DE OBRA */}
            {/* ========================================================================= */}
            <tr className="bg-blue-500/10 border-t border-blue-500/20">
              <td colSpan={3} className="py-1.5 px-3">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="font-black uppercase tracking-wider text-[11px] text-blue-300">
                    2. Personal y Mano de Obra (Costo por Empleado)
                  </span>
                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab('personal')}
                      className="text-[10px] text-blue-300 hover:underline cursor-pointer"
                    >
                      Ver legajos →
                    </button>
                  )}
                </div>
              </td>
              <td className="py-1.5 px-2.5 text-right font-mono font-bold text-blue-300">
                + {formatCurrency(summary.totalSueldos)}
              </td>
              <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200 bg-amber-500/5">
                {formatCurrency(cascadeData.subtotalPersonalAcum)}
              </td>
              <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-blue-300/90">
                {fmtPct(summary.totalSueldos)}
              </td>
            </tr>

            {cascadeData.employeeRows.length === 0 && cascadeData.manualSueldoRows.length === 0 ? (
              <tr className="text-slate-500">
                <td colSpan={6} className="py-1.5 px-6 text-[11px] italic">
                  Sin personal registrado en partes o contratos para este alcance.
                </td>
              </tr>
            ) : (
              <>
                {cascadeData.employeeRows.map((emp) => {
                  const isEditing = editingEmpKey === emp.empleadoKey;
                  return (
                    <tr key={emp.excludeKey} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-1.5 pl-6 pr-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-blue-400/80">↳</span>
                          <span className="text-slate-100 font-semibold">{emp.empleadoNombre}</span>
                          <span className="text-[10px] text-slate-400">({emp.categoriaNombre})</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-2.5 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                        <strong className="text-blue-300">{emp.diasTrabajados} d</strong>
                        <span className="text-slate-500"> · {emp.horasTrabajadas} hs</span>
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-300 whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <select
                              value={editEmpModo}
                              onChange={(e) => setEditEmpModo(e.target.value as 'DIA' | 'HORA')}
                              className="bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-white"
                            >
                              <option value="DIA">$/d</option>
                              <option value="HORA">$/h</option>
                            </select>
                            <input
                              type="number"
                              value={editEmpVal}
                              onChange={(e) => setEditEmpVal(Number(e.target.value))}
                              className="w-20 bg-slate-950 border border-blue-500 rounded px-1.5 py-0.5 text-right text-white font-mono text-[11px]"
                            />
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleSaveEmpOverride(emp.empleadoKey)}
                              className="p-0.5 bg-blue-500 text-white rounded hover:bg-blue-400 cursor-pointer"
                              title="Guardar en Supabase"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingEmpKey(null)}
                              className="p-0.5 bg-slate-800 text-slate-300 rounded cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <span title={emp.fuenteTarifa}>
                              {formatCurrency(emp.tarifaAplicada)} / {emp.modoCalculo === 'HORA' ? 'hs' : 'día'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEmpKey(emp.empleadoKey);
                                setEditEmpModo(emp.modoCalculo);
                                setEditEmpVal(emp.tarifaAplicada);
                              }}
                              className="text-slate-500 hover:text-blue-300 cursor-pointer"
                              title={`Ajustar tarifa (${emp.fuenteTarifa})`}
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-white whitespace-nowrap">
                        + {formatCurrency(emp.montoTotal)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200/90 bg-amber-500/5 whitespace-nowrap">
                        {formatCurrency(emp.acumulado)}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">
                        {fmtPct(emp.montoTotal)}
                      </td>
                    </tr>
                  );
                })}
                {cascadeData.manualSueldoRows.map((ms) => (
                  <tr key={ms.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-1.5 pl-6 pr-3 text-slate-200">
                      <span className="text-blue-400/80 mr-1.5">↳</span>
                      {ms.empleadoNombre} — <span className="text-slate-400">{ms.descripcion}</span>
                    </td>
                    <td className="py-1.5 px-2.5 font-mono text-[11px] text-slate-400">{ms.fecha}</td>
                    <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">Manual</td>
                    <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-white">
                      + {formatCurrency(ms.monto)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200/90 bg-amber-500/5">
                      {formatCurrency(ms.acumulado)}
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">
                      {fmtPct(ms.monto)}
                    </td>
                  </tr>
                ))}
              </>
            )}

            {/* ========================================================================= */}
            {/* 3. MANTENIMIENTO, TALLER, LUBRICANTES Y OTROS DIRECTOS */}
            {/* ========================================================================= */}
            <tr className="bg-rose-500/10 border-t border-rose-500/20">
              <td colSpan={3} className="py-1.5 px-3">
                <div className="flex items-center gap-2">
                  <Wrench className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="font-black uppercase tracking-wider text-[11px] text-rose-300">
                    3. Mantenimiento, Taller, Lubricantes y Otros Directos
                  </span>
                </div>
              </td>
              <td className="py-1.5 px-2.5 text-right font-mono font-bold text-rose-300">
                + {formatCurrency(cascadeData.totalMantenimientoYOtros)}
              </td>
              <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200 bg-amber-500/5">
                {formatCurrency(cascadeData.subtotalDirectosAcum)}
              </td>
              <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-rose-300/90">
                {fmtPct(cascadeData.totalMantenimientoYOtros)}
              </td>
            </tr>

            {cascadeData.maintRows.length === 0 ? (
              <tr className="text-slate-500">
                <td colSpan={6} className="py-1.5 px-6 text-[11px] italic">
                  Sin gastos de mantenimiento, taller, lubricantes ni otros directos en este período.
                </td>
              </tr>
            ) : (
              cascadeData.maintRows.map((m) => (
                <tr key={m.key} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-1.5 pl-6 pr-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-rose-400/80">↳</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-rose-300 border border-slate-700">
                        {m.tipoBadge}
                      </span>
                      <span className="text-slate-200 font-medium">{m.equipoLabel}</span>
                      <span className="text-slate-400 truncate max-w-xs">— {m.concepto}</span>
                    </div>
                  </td>
                  <td className="py-1.5 px-2.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                    {m.fecha}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400 truncate max-w-[140px]">
                    {m.cantidadLabel}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-white whitespace-nowrap">
                    + {formatCurrency(m.monto)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200/90 bg-amber-500/5 whitespace-nowrap">
                    {formatCurrency(m.acumulado)}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">
                    {fmtPct(m.monto)}
                  </td>
                </tr>
              ))
            )}

            {/* SUBTOTAL COSTOS DIRECTOS OPERATIVOS */}
            <tr className="bg-slate-950/90 border-y border-slate-700">
              <td colSpan={3} className="py-2 px-3 font-black uppercase tracking-wider text-[11px] text-slate-200">
                = Subtotal Costos Directos Operativos (Combustible + Personal + Mantenimiento)
              </td>
              <td className="py-2 px-2.5 text-right font-mono font-black text-white">
                {formatCurrency(summary.totalCostosDirectos)}
              </td>
              <td className="py-2 px-3 text-right font-mono font-black text-amber-300 bg-amber-500/10">
                {formatCurrency(cascadeData.subtotalDirectosAcum)}
              </td>
              <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-300">
                {fmtPct(summary.totalCostosDirectos)}
              </td>
            </tr>

            {/* ========================================================================= */}
            {/* 4. GASTOS GENERALES / PAQUETE ADMINISTRATIVO */}
            {/* ========================================================================= */}
            <tr className="bg-purple-500/10 border-t border-purple-500/20">
              <td colSpan={3} className="py-1.5 px-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Percent className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="font-black uppercase tracking-wider text-[11px] text-purple-300">
                    4. Gastos Generales y Estructura Administrativa
                  </span>
                  {!isEditingAdminRow && (
                    <button
                      type="button"
                      onClick={openAdminInlineEditor}
                      className="text-[10px] font-bold text-purple-200 hover:text-white bg-purple-500/20 hover:bg-purple-500/35 border border-purple-500/40 rounded px-2 py-0.5 flex items-center gap-1 cursor-pointer transition"
                      title="Editar porcentaje, monto fijo o base de gastos administrativos"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                      <span>Editar Gasto Admin.</span>
                    </button>
                  )}
                </div>
              </td>
              <td className="py-1.5 px-2.5 text-right font-mono font-bold text-purple-300">
                + {formatCurrency(summary.totalGastosGenerales)}
              </td>
              <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200 bg-amber-500/5">
                {formatCurrency(cascadeData.subtotalConGastosGralesAcum)}
              </td>
              <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-purple-300/90">
                {fmtPct(summary.totalGastosGenerales)}
              </td>
            </tr>

            {isEditingAdminRow ? (
              <tr className="bg-purple-950/30 border-y border-purple-500/40">
                <td colSpan={6} className="p-3">
                  <div className="flex flex-col gap-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase text-purple-300 mb-1">
                          Concepto / Descripción
                        </label>
                        <input
                          type="text"
                          value={descAdmin}
                          onChange={(e) => setDescAdmin(e.target.value)}
                          placeholder="Paquete Administrativo, Estructura, Seguros y Gastos Generales"
                          className="w-full bg-slate-950 border border-purple-500/40 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-purple-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-purple-300 mb-1">
                          % Gastos Administrativos
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPctGastosGrales((p) => Math.max(0, Number((Number(p || 0) - 1).toFixed(1))))}
                            className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-bold cursor-pointer"
                            title="Bajar 1%"
                          >
                            -1%
                          </button>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="100"
                            value={pctGastosGrales}
                            onChange={(e) => setPctGastosGrales(Math.max(0, Number(e.target.value)))}
                            className="w-full bg-slate-950 border border-purple-500 rounded-lg px-2 py-1.5 text-white font-mono text-right font-bold focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setPctGastosGrales((p) => Number((Number(p || 0) + 1).toFixed(1)))}
                            className="px-2 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold cursor-pointer"
                            title="Subir 1%"
                          >
                            +1%
                          </button>
                          <button
                            type="button"
                            onClick={() => setPctGastosGrales((p) => Number((Number(p || 0) + 5).toFixed(1)))}
                            className="px-2 py-1.5 bg-purple-600/80 hover:bg-purple-500 text-white rounded-lg font-bold cursor-pointer"
                            title="Subir 5%"
                          >
                            +5%
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-purple-300 mb-1">
                          Cargo Fijo Adicional ($)
                        </label>
                        <input
                          type="number"
                          step="5000"
                          min="0"
                          value={fijoAdmin}
                          onChange={(e) => setFijoAdmin(Math.max(0, Number(e.target.value)))}
                          placeholder="0"
                          className="w-full bg-slate-950 border border-purple-500/40 rounded-lg px-2.5 py-1.5 text-white font-mono text-right focus:outline-none focus:border-purple-400"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-purple-500/20">
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="text-slate-400 font-semibold">Aplicar % sobre:</span>
                        <select
                          value={baseGastosGralesMode}
                          onChange={(e) =>
                            setBaseGastosGralesMode(
                              e.target.value as 'COSTOS_DIRECTOS' | 'FACTURACION_NETA'
                            )
                          }
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px]"
                        >
                          <option value="COSTOS_DIRECTOS">
                            Costos Directos ({formatCurrency(summary.totalCostosDirectos)})
                          </option>
                          <option value="FACTURACION_NETA">
                            Facturación Neta ({formatCurrency(summary.facturadoNetoSinIva)})
                          </option>
                        </select>
                        <span className="font-mono text-purple-200 ml-1">
                          Vista previa:{' '}
                          <strong className="text-white">
                            {formatCurrency(
                              ((baseGastosGralesMode === 'FACTURACION_NETA'
                                ? summary.facturadoNetoSinIva
                                : summary.totalCostosDirectos) *
                                (Number(pctGastosGrales) || 0)) /
                                100 +
                                (Number(fijoAdmin) || 0)
                            )}
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsEditingAdminRow(false)}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={handleSaveAdminInline}
                          className="px-3.5 py-1 bg-purple-500 hover:bg-purple-400 text-white rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer"
                        >
                          {isSaving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Guardar en Supabase</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                <tr className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-1.5 pl-6 pr-3 text-slate-200">
                    <span className="text-purple-400/80 mr-1.5">↳</span>
                    {cfg.descripcionPaqueteAdmin || 'Paquete Administrativo y Gastos Generales'}
                  </td>
                  <td className="py-1.5 px-2.5 font-mono text-[11px] text-slate-300">
                    <button
                      type="button"
                      onClick={openAdminInlineEditor}
                      className="inline-flex items-center gap-1.5 hover:text-purple-300 cursor-pointer group"
                      title="Clic para subir o editar el % administrativo"
                    >
                      <span>
                        {summary.porcentajeGastosGenerales}% s/{' '}
                        {summary.baseCalculoGastosGenerales === 'FACTURACION_NETA'
                          ? 'Fact. Neta'
                          : 'Costos Directos'}
                      </span>
                      <Edit3 className="w-3 h-3 text-slate-500 group-hover:text-purple-300" />
                    </button>
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-300">
                    Base: {formatCurrency(cascadeData.baseGastosGrales)}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-white">
                    + {formatCurrency(cascadeData.montoPorcentajeAdmin)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200/90 bg-amber-500/5">
                    {formatCurrency(cascadeData.acumAfterPctAdmin)}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">
                    {fmtPct(cascadeData.montoPorcentajeAdmin)}
                  </td>
                </tr>

                {cascadeData.montoFijoAdmin > 0 && (
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-1.5 pl-6 pr-3 text-slate-200">
                      <span className="text-purple-400/80 mr-1.5">↳</span>
                      Cargo Fijo Administrativo de Obra
                    </td>
                    <td className="py-1.5 px-2.5 font-mono text-[11px] text-slate-400">Monto fijo</td>
                    <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">
                      <button
                        type="button"
                        onClick={openAdminInlineEditor}
                        className="inline-flex items-center gap-1.5 hover:text-purple-300 cursor-pointer group"
                        title="Editar cargo fijo administrativo"
                      >
                        <span>Fijo</span>
                        <Edit3 className="w-3 h-3 text-slate-500 group-hover:text-purple-300" />
                      </button>
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-white">
                      + {formatCurrency(cascadeData.montoFijoAdmin)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200/90 bg-amber-500/5">
                      {formatCurrency(cascadeData.subtotalConGastosGralesAcum)}
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">
                      {fmtPct(cascadeData.montoFijoAdmin)}
                    </td>
                  </tr>
                )}
              </>
            )}

            {/* ========================================================================= */}
            {/* 5. AMORTIZACIÓN DE VEHÍCULOS / EQUIPOS */}
            {/* ========================================================================= */}
            <tr className="bg-cyan-500/10 border-t border-cyan-500/20">
              <td colSpan={3} className="py-1.5 px-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Truck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="font-black uppercase tracking-wider text-[11px] text-cyan-300">
                    5. Amortización de Vehículos y Maquinaria ({cascadeData.amortEquipoRows.length} eq.)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    (Clic en el lápiz para fijar $/hs, $/día o monto fijo de cada equipo)
                  </span>
                </div>
              </td>
              <td className="py-1.5 px-2.5 text-right font-mono font-bold text-cyan-300">
                + {formatCurrency(summary.totalAmortizacionVehiculos)}
              </td>
              <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200 bg-amber-500/5">
                {formatCurrency(cascadeData.totalFinalAcumulado)}
              </td>
              <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-cyan-300/90">
                {fmtPct(summary.totalAmortizacionVehiculos)}
              </td>
            </tr>

            {cascadeData.amortEquipoRows.length === 0 ? (
              <tr className="text-slate-500">
                <td colSpan={6} className="py-1.5 px-6 text-[11px] italic">
                  Sin vehículos ni máquinas vinculadas en este período.
                </td>
              </tr>
            ) : (
              cascadeData.amortEquipoRows.map((a) => {
                const isEditing = editingAmortKey === a.equipoKey;
                return (
                  <tr key={a.excludeKey} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-1.5 pl-6 pr-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-cyan-400/80">↳</span>
                        {a.codigoInterno && (
                          <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                            {a.codigoInterno}
                          </span>
                        )}
                        <span className="text-slate-100 font-semibold">{a.equipoLabel}</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2.5 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                      <strong className="text-cyan-300">{a.diasTrabajados} d</strong>
                      <span className="text-slate-400"> · {a.horasTrabajadas} hs</span>
                      {a.horasHorometroReal ? (
                        <span className="text-emerald-400/90 text-[10px] ml-1">
                          ({a.horasHorometroReal} hs horóm.)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-300 whitespace-nowrap">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-1">
                          <select
                            value={editAmortModo}
                            onChange={(e) => setEditAmortModo(e.target.value as 'HORA' | 'DIA' | 'FIJO')}
                            className="bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-white"
                          >
                            <option value="HORA">$/hs</option>
                            <option value="DIA">$/día</option>
                            <option value="FIJO">$ fijo</option>
                          </select>
                          <input
                            type="number"
                            value={editAmortVal}
                            onChange={(e) => setEditAmortVal(Number(e.target.value))}
                            className="w-20 bg-slate-950 border border-cyan-500 rounded px-1.5 py-0.5 text-right text-white font-mono text-[11px]"
                          />
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSaveAmortOverride(a.equipoKey)}
                            className="p-0.5 bg-cyan-500 text-black rounded hover:bg-cyan-400 cursor-pointer"
                            title="Guardar en Supabase"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAmortKey(null)}
                            className="p-0.5 bg-slate-800 text-slate-300 rounded cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <span title={a.fuenteTarifa}>
                            {a.tarifaAplicada > 0
                              ? `${formatCurrency(a.tarifaAplicada)} / ${
                                  a.modoCalculo === 'HORA' ? 'hs' : a.modoCalculo === 'DIA' ? 'día' : 'fijo'
                                }`
                              : 'Sin tarifa ($ 0)'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAmortKey(a.equipoKey);
                              setEditAmortModo(a.modoCalculo);
                              setEditAmortVal(a.tarifaAplicada);
                            }}
                            className="text-slate-500 hover:text-cyan-300 cursor-pointer"
                            title={`Configurar amortización (${a.fuenteTarifa})`}
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-white whitespace-nowrap">
                      + {formatCurrency(a.montoTotal)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200/90 bg-amber-500/5 whitespace-nowrap">
                      {formatCurrency(a.acumulado)}
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">
                      {fmtPct(a.montoTotal)}
                    </td>
                  </tr>
                );
              })
            )}

            {cascadeData.montoPorcentajeAmort > 0 && (
              <tr className="hover:bg-slate-800/40 transition-colors">
                <td className="py-1.5 pl-6 pr-3 text-slate-200">
                  <span className="text-cyan-400/80 mr-1.5">↳</span>
                  Amortización Global Porcentual de Flota
                </td>
                <td className="py-1.5 px-2.5 font-mono text-[11px] text-slate-300">
                  {summary.porcentajeAmortizacionVehiculos}% s/{' '}
                  {summary.baseCalculoAmortizacion === 'FACTURACION_NETA'
                    ? 'Fact. Neta'
                    : 'Costos Directos'}
                </td>
                <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-300">
                  Base: {formatCurrency(cascadeData.baseAmort)}
                </td>
                <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-white">
                  + {formatCurrency(cascadeData.montoPorcentajeAmort)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200/90 bg-amber-500/5">
                  {formatCurrency(cascadeData.acumAfterPctAmort)}
                </td>
                <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">
                  {fmtPct(cascadeData.montoPorcentajeAmort)}
                </td>
              </tr>
            )}

            {cascadeData.montoFijoAmort > 0 && (
              <tr className="hover:bg-slate-800/40 transition-colors">
                <td className="py-1.5 pl-6 pr-3 text-slate-200">
                  <span className="text-cyan-400/80 mr-1.5">↳</span>
                  Cargo Fijo de Amortización de Equipos
                </td>
                <td className="py-1.5 px-2.5 font-mono text-[11px] text-slate-400">Monto fijo</td>
                <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">Fijo</td>
                <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-white">
                  + {formatCurrency(cascadeData.montoFijoAmort)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-200/90 bg-amber-500/5">
                  {formatCurrency(cascadeData.acumAfterFijoAmort)}
                </td>
                <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-slate-400">
                  {fmtPct(cascadeData.montoFijoAmort)}
                </td>
              </tr>
            )}

            {/* ========================================================================= */}
            {/* FILA FINAL: COSTO TOTAL ACUMULADO DE LA OBRA + RESULTADO FRENTE A INGRESOS */}
            {/* ========================================================================= */}
            <tr className="bg-amber-500/15 border-t-2 border-amber-500/50">
              <td colSpan={3} className="py-2.5 px-3 font-black uppercase tracking-wider text-xs text-white">
                = COSTO TOTAL ACUMULADO DE LA OBRA (1 + 2 + 3 + 4 + 5)
              </td>
              <td className="py-2.5 px-2.5 text-right font-mono font-black text-sm text-amber-300">
                {formatCurrency(summary.costoTotalObra)}
              </td>
              <td className="py-2.5 px-3 text-right font-mono font-black text-sm text-amber-300 bg-amber-500/20">
                {formatCurrency(summary.costoTotalObra)}
              </td>
              <td className="py-2.5 px-2.5 text-right font-mono font-black text-xs text-amber-300">
                100%
              </td>
            </tr>

            <tr className="bg-slate-950/90 border-t border-slate-800">
              <td colSpan={3} className="py-2 px-3 font-bold uppercase tracking-wider text-[11px] text-slate-300">
                Ingresos Facturados en Legajos ({summary.evaluarSobreNetoSinIva ? 'Neto s/ IVA' : 'Total c/ IVA'})
                {summary.cobradoTotal > 0 ? (
                  <span className="ml-2 text-[10px] font-mono text-emerald-400">
                    (Cobrado: {formatCurrency(summary.cobradoTotal)})
                  </span>
                ) : null}
              </td>
              <td className="py-2 px-2.5 text-right font-mono font-bold text-sm text-white">
                {formatCurrency(summary.baseIngresosEvaluacion)}
              </td>
              <td
                colSpan={2}
                className="py-2 px-3 text-right font-mono text-[11px] text-slate-400"
              >
                {summary.facturadoTotalConIva > 0 && summary.evaluarSobreNetoSinIva
                  ? `Total c/ IVA: ${formatCurrency(summary.facturadoTotalConIva)}`
                  : ''}
              </td>
            </tr>

            <tr
              className={
                summary.resultadoNeto >= 0
                  ? 'bg-emerald-950/40 border-t border-emerald-500/40'
                  : 'bg-red-950/40 border-t border-red-500/40'
              }
            >
              <td colSpan={3} className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  {summary.resultadoNeto >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span className="font-black uppercase tracking-wider text-xs text-white">
                    = RESULTADO NETO DE LA OBRA (Ingresos − Costo Total en Cascada)
                  </span>
                </div>
              </td>
              <td
                className={`py-2.5 px-2.5 text-right font-mono font-black text-sm ${
                  summary.resultadoNeto >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {formatCurrency(summary.resultadoNeto)}
              </td>
              <td
                colSpan={2}
                className={`py-2.5 px-3 text-right font-mono font-black text-xs ${
                  summary.resultadoNeto >= 0 ? 'text-emerald-300' : 'text-red-300'
                }`}
              >
                Margen: {summary.margenPorcentaje}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
