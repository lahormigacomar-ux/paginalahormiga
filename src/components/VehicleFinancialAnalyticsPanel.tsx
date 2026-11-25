import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Fuel,
  Wrench,
  Users,
  Receipt,
  Repeat,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  AlertTriangle,
  Sparkles,
  Calendar,
  FileText,
  RefreshCw,
  ArrowUpRight,
  ToggleLeft,
  ToggleRight,
  HelpCircle,
  Layers,
  Filter,
  Search,
  Clock,
  CheckCircle2,
  Loader2,
  Building2
} from 'lucide-react';
import {
  Vehicle,
  Driver,
  ParteDiario,
  RentalContract,
  Obra,
  ArcaInvoice,
  VehicleServiceLog,
  VehicleExpenseLog,
  FuelDispensary,
  PurchaseInvoice,
  CajaDiariaSession,
  VehicleFixedExpense,
  VehicleFixedExpenseCategory,
  VehicleFixedExpenseFrequency,
  VehicleSalePriceEntry,
  VehicleSalePriceOrigin,
  VehicleSalePriceUnit,
  VehicleDocumentPricePolicy,
  VehicleSueldosConfig
} from '../types';
import {
  PayrollPeriodRecord,
  matchPayrollSlipToEmployee,
  getEmployeeBankTokenKey
} from '../utils/payrollParser';
import { formatCurrency, loadFuelPrices } from '../services/storage';
import { apiFetchSetting } from '../services/api';

interface VehicleFinancialAnalyticsPanelProps {
  vehicle: Vehicle;
  assignedDriver?: Driver | null;
  drivers: Driver[];
  partesDiarios: ParteDiario[];
  rentals: RentalContract[];
  obras: Obra[];
  arcaInvoices: ArcaInvoice[];
  servicesLogs: VehicleServiceLog[];
  expensesLogs: VehicleExpenseLog[];
  fuelVouchers: FuelDispensary[];
  purchaseInvoices: PurchaseInvoice[];
  cajaSessions: CajaDiariaSession[];
  onUpdateVehicle: (updated: Vehicle) => Promise<void> | void;
}

type ExpenseBucket = 'SUELDOS' | 'MANTENIMIENTO' | 'COMBUSTIBLE' | 'GENERALES' | 'FIJOS';

interface UnifiedExpenseItem {
  id: string;
  fecha: string; // YYYY-MM-DD
  mes: string; // YYYY-MM
  bucket: ExpenseBucket;
  subcategoria: string;
  concepto: string;
  referencia?: string;
  monto: number;
  estimado?: boolean;
  isFixed?: boolean;
  fixedId?: string;
}

type RevenueSourceType =
  | 'RESUMEN_VALORIZADO'
  | 'CONTRATO_ALQUILER'
  | 'FACTURA_ARCA'
  | 'PARTE_VALORIZADO'
  | 'PARTE_SIN_PRECIO';

interface UnifiedRevenueItem {
  docKey: string;
  fecha: string; // YYYY-MM-DD
  mes: string; // YYYY-MM
  sourceType: RevenueSourceType;
  documentoRef: string;
  clienteObra: string;
  detalle: string;
  unidad: VehicleSalePriceUnit;
  cantidad: number;
  docUnitPrice: number;
  docTotal: number;
  generalUnitPrice: number;
  generalPriceLabel: string;
  generalTotal: number;
  hasConflict: boolean;
  effectiveMode: 'DOCUMENTO' | 'GENERAL';
  effectiveUnitPrice: number;
  effectiveTotal: number;
  linkedFacturaNum?: string;
}

interface DetectedDocumentPrice {
  key: string;
  fecha: string;
  unidad: VehicleSalePriceUnit;
  precioUnitario: number;
  origen: VehicleSalePriceOrigin;
  documentoRef: string;
  clienteObra: string;
}

interface MachinePayrollMonthBreakdown {
  ym: string;
  monto: number;
  dias: number;
  horas: number;
  periodName: string;
  fuente: string;
}

interface MachinePayrollRow {
  excludeKey: string;
  empleadoKey: string;
  empleadoNombre: string;
  categoriaNombre: string;
  diasTrabajados: number;
  fechas: string[];
  horasTrabajadas: number;
  viajes: number;
  obrasOperadas: string[];
  minDate: string;
  maxDate: string;
  modoCalculo: 'DIA' | 'HORA';
  tarifaAplicada: number;
  fuenteTarifa: string;
  montoTotal: number;
  montoByYm: MachinePayrollMonthBreakdown[];
  excluded: boolean;
  hasOverride: boolean;
  sueldoMensualLiquidado?: number;
  sueldoBasicoPlanilla?: number;
  periodoLiquidacionLabel?: string;
}

const FIXED_CATEGORY_LABELS: Record<VehicleFixedExpenseCategory, string> = {
  LAVADERO: 'Lavadero',
  SEGURO: 'Seguro',
  PATENTE: 'Patente / Impuestos',
  GPS_RASTREO: 'GPS / Rastreo',
  COCHERA: 'Cochera / Depósito',
  FINANCIERO: 'Cuota / Leasing',
  MANTENIMIENTO_FIJO: 'Mant. Preventivo Fijo',
  OTRO: 'Otro Fijo'
};

const FIXED_FREQ_LABELS: Record<VehicleFixedExpenseFrequency, string> = {
  MENSUAL: 'Mensual (todos los meses)',
  QUINCENAL: 'Quincenal (×2 / mes)',
  SEMANAL: 'Semanal (×4.33 / mes)',
  ANUAL: 'Anual (prorrateado /12)',
  UNICO: 'Único (solo mes inicio)'
};

const BUCKET_META: Record<
  ExpenseBucket,
  { label: string; color: string; bg: string; border: string; text: string }
> = {
  SUELDOS: {
    label: 'Sueldos Personal',
    color: '#38BDF8',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    text: 'text-sky-400'
  },
  MANTENIMIENTO: {
    label: 'Mantenimiento',
    color: '#F97316',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-400'
  },
  COMBUSTIBLE: {
    label: 'Combustible',
    color: '#EAB308',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400'
  },
  GENERALES: {
    label: 'Gastos Generales',
    color: '#A855F7',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    text: 'text-purple-400'
  },
  FIJOS: {
    label: 'Fijos / Recurrentes',
    color: '#EC4899',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/30',
    text: 'text-pink-400'
  }
};

const SOURCE_BADGE: Record<RevenueSourceType, { label: string; cls: string }> = {
  RESUMEN_VALORIZADO: {
    label: 'Resumen Valorizado',
    cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
  },
  CONTRATO_ALQUILER: {
    label: 'Contrato Alquiler',
    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  },
  FACTURA_ARCA: {
    label: 'Factura ARCA',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  },
  PARTE_VALORIZADO: {
    label: 'Parte Valorizado',
    cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30'
  },
  PARTE_SIN_PRECIO: {
    label: 'Parte (Escala Gral)',
    cls: 'bg-slate-700/60 text-slate-300 border-slate-600'
  }
};

const MONTH_NAMES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const SPANISH_MONTH_MAP: Record<string, string> = {
  ENERO: '01', ENE: '01',
  FEBRERO: '02', FEB: '02',
  MARZO: '03', MAR: '03',
  ABRIL: '04', ABR: '04',
  MAYO: '05', MAY: '05',
  JUNIO: '06', JUN: '06',
  JULIO: '07', JUL: '07',
  AGOSTO: '08', AGO: '08',
  SEPTIEMBRE: '09', SETIEMBRE: '09', SEP: '09', SET: '09',
  OCTUBRE: '10', OCT: '10',
  NOVIEMBRE: '11', NOV: '11',
  DICIEMBRE: '12', DIC: '12'
};

function normText(s?: string | null): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normCompact(s?: string | null): string {
  return normText(s).replace(/[^A-Z0-9]/g, '');
}

function normalizeToIsoDate(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // YYYY-MM-DD or ISO timestamp
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY-MM
  const ymMatch = s.match(/^(\d{4})-(\d{1,2})$/);
  if (ymMatch) {
    return `${ymMatch[1]}-${ymMatch[2].padStart(2, '0')}-01`;
  }

  // DD/MM/YYYY or D/M/YY
  const dmyMatch = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    let y = dmyMatch[3];
    if (y.length === 2) y = Number(y) >= 70 ? `19${y}` : `20${y}`;
    return `${y}-${m}-${d}`;
  }

  return null;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return ym;
  return `${MONTH_NAMES_SHORT[idx]} ${y.slice(-2)}`;
}

function formatDateAr(iso?: string): string {
  if (!iso) return '-';
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return iso;
}

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(ym: string, delta: number): string {
  const [yStr, mStr] = ym.split('-');
  const d = new Date(Number(yStr), Number(mStr) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function enumerateMonths(startYm: string, endYm: string): string[] {
  if (!startYm || !endYm || startYm > endYm) return [];
  const list: string[] = [];
  let cursor = startYm;
  let guard = 0;
  while (cursor <= endYm && guard < 120) {
    list.push(cursor);
    cursor = addMonths(cursor, 1);
    guard += 1;
  }
  return list;
}

function extractPayrollPeriodYearMonth(p: PayrollPeriodRecord): string {
  const idMatch = String(p.id || '').match(/(\d{4})-(\d{2})/);
  if (idMatch) return `${idMatch[1]}-${idMatch[2]}`;

  const raw = normText(p.sheetTabName || p.nombrePeriodo || '');
  let monthNum = '';
  for (const [k, mm] of Object.entries(SPANISH_MONTH_MAP)) {
    if (k.length >= 4 && raw.includes(k)) {
      monthNum = mm;
      break;
    }
  }
  if (!monthNum) {
    for (const [k, mm] of Object.entries(SPANISH_MONTH_MAP)) {
      if (new RegExp(`\\b${k}\\b`).test(raw)) {
        monthNum = mm;
        break;
      }
    }
  }
  const yearMatch = raw.match(/\b(20\d{2})\b/);
  if (monthNum) {
    const year = yearMatch ? yearMatch[1] : '2026';
    return `${year}-${monthNum}`;
  }
  const mmMatch = raw.match(/(?:^|[^0-9])(0?[1-9]|1[0-2])[.\-\/](20\d{2})/);
  if (mmMatch) {
    return `${mmMatch[2]}-${mmMatch[1].padStart(2, '0')}`;
  }
  return '';
}

function normalizeUnit(raw?: string | null): VehicleSalePriceUnit {
  const u = normText(raw);
  if (u.includes('VIAJ') || u.includes('FLETE') || u.includes('M3')) return 'VIAJE';
  if (u.includes('DIA') || u.includes('JORN')) return 'DIA';
  return 'HORA';
}

function formatCompactMoney(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function buildVehicleMatcher(vehicle: Vehicle) {
  const vId = normText(vehicle.id);
  const vCode = normText(vehicle.codigoInterno);
  const vCodeCompact = normCompact(vehicle.codigoInterno);
  const vCodigoEq = normText(vehicle.codigoEquipo || vehicle.codigo);
  const vModelo = normText(vehicle.modeloMarca);
  const vPatenteRaw = normText(vehicle.patente);
  const vPatenteCompact =
    vPatenteRaw &&
    !vPatenteRaw.includes('SIN PATENTE') &&
    vPatenteRaw !== 'S/P' &&
    vPatenteRaw !== '-' &&
    normCompact(vPatenteRaw).length >= 5
      ? normCompact(vPatenteRaw)
      : '';

  const exactIdTokens = new Set<string>(
    [vId, vCode, vCodigoEq].filter((t) => t.length > 0)
  );

  const matchesStructured = (cand: {
    id?: string;
    code?: string;
    patente?: string;
    name?: string;
  }): boolean => {
    const cId = normText(cand.id);
    const cCode = normText(cand.code);
    const cCodeCompact = normCompact(cand.code);
    const cPatCompact = normCompact(cand.patente);
    const cName = normText(cand.name);

    if (cId && exactIdTokens.has(cId)) return true;
    if (cCode && exactIdTokens.has(cCode)) return true;
    if (vCodeCompact && vCodeCompact.length >= 3 && cCodeCompact && cCodeCompact === vCodeCompact) return true;
    if (vPatenteCompact && cPatCompact && cPatCompact === vPatenteCompact) return true;
    if (vPatenteCompact && cCode && normCompact(cCode).includes(vPatenteCompact)) return true;
    if (vPatenteCompact && cName && normCompact(cName).includes(vPatenteCompact)) return true;

    if (vModelo && vModelo.length >= 5) {
      if (cName && (cName === vModelo || cName.includes(vModelo) || (cName.length >= 7 && vModelo.includes(cName)))) {
        return true;
      }
      if (cCode && (cCode === vModelo || cCode.includes(vModelo))) {
        return true;
      }
    }

    // Match formats like "[EQ-24] Minicargadora" or "EXC.VOLVO EC55B - 10"
    if (vCode && vCode.length >= 4 && cName && cName.includes(vCode)) return true;
    if (vId && vId.length >= 4 && cName && cName.includes(vId)) return true;

    return false;
  };

  const matchesFreeText = (text?: string): boolean => {
    const t = normText(text);
    if (!t) return false;
    const tCompact = normCompact(text);
    if (vPatenteCompact && tCompact.includes(vPatenteCompact)) return true;
    if (vCode && vCode.length >= 4 && t.includes(vCode)) return true;
    if (vId && vId.length >= 5 && t.includes(vId)) return true;
    if (vModelo && vModelo.length >= 6 && t.includes(vModelo)) return true;
    return false;
  };

  return { matchesStructured, matchesFreeText };
}

function resolveFuelUnitPrice(tipoComb: string | undefined, catalog: Record<string, number>): { price: number; estimated: boolean } {
  const key = normText(tipoComb);
  const entries = Object.entries(catalog || {}).filter(([, val]) => Number(val) > 0);
  if (key && entries.length > 0) {
    const exact = entries.find(([k]) => normText(k) === key);
    if (exact) return { price: Number(exact[1]), estimated: false };

    const partial = entries.find(([k]) => {
      const nk = normText(k);
      return key.includes(nk) || nk.includes(key);
    });
    if (partial) return { price: Number(partial[1]), estimated: false };

    if (key.includes('INFINIA') && key.includes('DIESEL')) {
      const found = entries.find(([k]) => normText(k).includes('INFINIA') && normText(k).includes('DIESEL'));
      if (found) return { price: Number(found[1]), estimated: false };
    }
    if (key.includes('DIESEL') || key.includes('GASOIL') || key.includes('500')) {
      const found = entries.find(([k]) => normText(k).includes('DIESEL') || normText(k).includes('GASOIL'));
      if (found) return { price: Number(found[1]), estimated: false };
    }
    if (key.includes('NAFTA') || key.includes('SUPER')) {
      const found = entries.find(([k]) => normText(k).includes('NAFTA') || normText(k).includes('SUPER'));
      if (found) return { price: Number(found[1]), estimated: false };
    }
  }
  if (entries.length > 0) {
    const avg = entries.reduce((acc, [, v]) => acc + Number(v), 0) / entries.length;
    return { price: Math.round(avg), estimated: true };
  }
  return { price: 1350, estimated: true };
}

function getGeneralPriceForDate(
  dateIso: string,
  unit: VehicleSalePriceUnit,
  schedule: VehicleSalePriceEntry[],
  vehicle: Vehicle
): { price: number; label: string; entry?: VehicleSalePriceEntry } {
  const sorted = [...schedule].sort((a, b) => a.fechaDesde.localeCompare(b.fechaDesde));

  // 1. Latest entry matching the same unit with fechaDesde <= dateIso
  const matchingUnit = sorted.filter((e) => e.unidad === unit && e.fechaDesde <= dateIso);
  if (matchingUnit.length > 0) {
    const picked = matchingUnit[matchingUnit.length - 1];
    return {
      price: picked.precioUnitario,
      label: `Escala desde ${formatDateAr(picked.fechaDesde)} (${picked.unidad})`,
      entry: picked
    };
  }

  // 2. Latest entry of any unit with fechaDesde <= dateIso
  const anyUnit = sorted.filter((e) => e.fechaDesde <= dateIso);
  if (anyUnit.length > 0) {
    const picked = anyUnit[anyUnit.length - 1];
    return {
      price: picked.precioUnitario,
      label: `Escala desde ${formatDateAr(picked.fechaDesde)} (${picked.unidad})`,
      entry: picked
    };
  }

  // 3. Fallback to vehicle ficha tariff
  if (unit === 'HORA' && vehicle.precioSugeridoHora && vehicle.precioSugeridoHora > 0) {
    return { price: vehicle.precioSugeridoHora, label: 'Tarifa Ficha (Hora)' };
  }
  if (vehicle.precioSugerido && vehicle.precioSugerido > 0) {
    return { price: vehicle.precioSugerido, label: 'Tarifa Ficha (Día)' };
  }
  if (vehicle.precioSugeridoHora && vehicle.precioSugeridoHora > 0) {
    return { price: vehicle.precioSugeridoHora, label: 'Tarifa Ficha (Hora)' };
  }
  return { price: 0, label: 'Sin precio cargado' };
}

export const VehicleFinancialAnalyticsPanel: React.FC<VehicleFinancialAnalyticsPanelProps> = ({
  vehicle,
  assignedDriver,
  drivers,
  partesDiarios,
  rentals,
  obras,
  arcaInvoices,
  servicesLogs,
  expensesLogs,
  fuelVouchers,
  purchaseInvoices,
  cajaSessions,
  onUpdateVehicle
}) => {
  const [innerTab, setInnerTab] = useState<'CURVA' | 'SUELDOS' | 'GASTOS' | 'PRECIOS'>('CURVA');
  const [rangePreset, setRangePreset] = useState<'6M' | '12M' | 'YTD' | 'ALL' | 'CUSTOM'>('12M');
  const [customFrom, setCustomFrom] = useState<string>(() => addMonths(getCurrentYearMonth(), -11));
  const [customTo, setCustomTo] = useState<string>(() => getCurrentYearMonth());

  // Loaded from Supabase system_settings
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriodRecord[]>([]);
  const [employeeDirectoryLinks, setEmployeeDirectoryLinks] = useState<Record<string, string>>({});
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>(() => loadFuelPrices());
  const [loadingRemote, setLoadingRemote] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Filters & inline edit state for Obras-style Personal / Sueldos view
  const [payrollSearch, setPayrollSearch] = useState<string>('');
  const [editingPayrollKey, setEditingPayrollKey] = useState<string | null>(null);
  const [editPayrollModo, setEditPayrollModo] = useState<'DIA' | 'HORA'>('DIA');
  const [editPayrollValor, setEditPayrollValor] = useState<number>(0);
  const [payrollFeedback, setPayrollFeedback] = useState<string | null>(null);

  // Filters on Gastos tab
  const [bucketFilter, setBucketFilter] = useState<'ALL' | ExpenseBucket>('ALL');
  const [expenseSearch, setExpenseSearch] = useState<string>('');

  // Form for adding/editing recurring fixed expenses
  const [showFixedForm, setShowFixedForm] = useState<boolean>(false);
  const [editingFixedId, setEditingFixedId] = useState<string | null>(null);
  const [fixedConcepto, setFixedConcepto] = useState<string>('');
  const [fixedCategoria, setFixedCategoria] = useState<VehicleFixedExpenseCategory>('LAVADERO');
  const [fixedMonto, setFixedMonto] = useState<string>('');
  const [fixedFrecuencia, setFixedFrecuencia] = useState<VehicleFixedExpenseFrequency>('MENSUAL');
  const [fixedInicio, setFixedInicio] = useState<string>(() => getCurrentYearMonth());
  const [fixedFin, setFixedFin] = useState<string>('');
  const [fixedObs, setFixedObs] = useState<string>('');

  // Form for adding/editing general sale price schedule
  const [priceFechaDesde, setPriceFechaDesde] = useState<string>(() => `${getCurrentYearMonth()}-01`);
  const [priceValor, setPriceValor] = useState<string>('');
  const [priceUnidad, setPriceUnidad] = useState<VehicleSalePriceUnit>(
    vehicle.modalidadTarifa === 'DIAS' ? 'DIA' : 'HORA'
  );
  const [priceNota, setPriceNota] = useState<string>('');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);

  // Interactive conflict prompt when saving a new general sale price
  const [pendingPriceConfirmation, setPendingPriceConfirmation] = useState<{
    entry: VehicleSalePriceEntry;
    isEdit: boolean;
    affectedDocs: UnifiedRevenueItem[];
  } | null>(null);

  // Fetch payroll periods + employee links + fuel prices from Supabase
  useEffect(() => {
    let alive = true;
    setLoadingRemote(true);
    Promise.all([
      fetch('/api/settings/payroll_periods_data').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/settings/payroll_sheets_config').then((r) => (r.ok ? r.json() : null)),
      apiFetchSetting<Record<string, number>>('fuel_prices_catalog').catch(() => null)
    ])
      .then(([rawPeriods, rawCfg, cloudFuel]) => {
        if (!alive) return;
        const list: PayrollPeriodRecord[] = Array.isArray(rawPeriods)
          ? rawPeriods
          : Array.isArray(rawPeriods?.value)
          ? rawPeriods.value
          : [];
        setPayrollPeriods(list);
        const cfg = rawCfg?.value || rawCfg || {};
        if (cfg?.employeeDirectoryLinks && typeof cfg.employeeDirectoryLinks === 'object') {
          setEmployeeDirectoryLinks(cfg.employeeDirectoryLinks);
        }
        if (cloudFuel && typeof cloudFuel === 'object' && Object.keys(cloudFuel).length > 0) {
          setFuelPrices(cloudFuel);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingRemote(false);
      });
    return () => {
      alive = false;
    };
  }, [vehicle.id]);

  const matcher = useMemo(() => buildVehicleMatcher(vehicle), [vehicle]);

  const fixedExpensesList: VehicleFixedExpense[] = useMemo(
    () => (Array.isArray(vehicle.gastosFijosRecurrentes) ? vehicle.gastosFijosRecurrentes : []),
    [vehicle.gastosFijosRecurrentes]
  );

  const priceSchedule: VehicleSalePriceEntry[] = useMemo(
    () =>
      [...(Array.isArray(vehicle.historialPreciosVenta) ? vehicle.historialPreciosVenta : [])].sort(
        (a, b) => a.fechaDesde.localeCompare(b.fechaDesde)
      ),
    [vehicle.historialPreciosVenta]
  );

  const policy: VehicleDocumentPricePolicy = vehicle.politicaPrecioDocumentos || 'DOCUMENTO';
  const overrides: Record<string, 'GENERAL' | 'DOCUMENTO'> = vehicle.overridesPrecioDocumentos || {};

  const sueldosCfg = useMemo<Required<Pick<VehicleSueldosConfig, 'modoCalculoSueldos' | 'diasLaborablesMes' | 'sueldoMensualDefault'>> & Pick<VehicleSueldosConfig, 'tarifasEmpleadoOverride' | 'itemsExcluidosIds'>>(
    () => ({
      modoCalculoSueldos: vehicle.sueldosConfig?.modoCalculoSueldos || 'LIQUIDACION_TOTAL',
      diasLaborablesMes: Math.max(1, Number(vehicle.sueldosConfig?.diasLaborablesMes || 24)),
      sueldoMensualDefault: Number(vehicle.sueldosConfig?.sueldoMensualDefault || 950000),
      tarifasEmpleadoOverride: vehicle.sueldosConfig?.tarifasEmpleadoOverride || {},
      itemsExcluidosIds: vehicle.sueldosConfig?.itemsExcluidosIds || []
    }),
    [vehicle.sueldosConfig]
  );

  // 1. Compute all non-fixed, non-payroll expenses (Mantenimiento, Combustible, Generales, Compras, Caja)
  const nonFixedExpenses = useMemo<UnifiedExpenseItem[]>(() => {
    const items: UnifiedExpenseItem[] = [];

    // B) MANTENIMIENTO & TALLER: VehicleServiceLog
    const includedServiceIds = new Set<string>();
    servicesLogs.forEach((srv) => {
      const matches = matcher.matchesStructured({
        id: srv.equipoId,
        code: srv.equipoPatenteOrCodigo,
        patente: srv.equipoPatenteOrCodigo,
        name: srv.equipoModeloMarca
      });
      if (!matches) return;
      const iso = normalizeToIsoDate(srv.fecha);
      if (!iso) return;
      const monto = Number(srv.costoTotalService || 0);
      if (monto <= 0) return;
      includedServiceIds.add(srv.id);
      items.push({
        id: `SRV-${srv.id}`,
        fecha: iso,
        mes: iso.slice(0, 7),
        bucket: 'MANTENIMIENTO',
        subcategoria: srv.tipoService || 'Service Taller',
        concepto: srv.trabajosRealizados || `Service ${srv.tipoService}`,
        referencia: srv.comprobanteFacturaNum || srv.proveedor || srv.tallerLugar,
        monto
      });
    });

    // C) VEHICLE EXPENSE LOGS (categorized into Mantenimiento, Combustible, Generales)
    expensesLogs.forEach((exp) => {
      const matches = matcher.matchesStructured({
        id: exp.equipoId,
        code: exp.equipoPatenteOrCodigo,
        patente: exp.equipoPatenteOrCodigo,
        name: exp.equipoModeloMarca
      });
      if (!matches) return;
      if (exp.vinculadoAServiceId && includedServiceIds.has(exp.vinculadoAServiceId)) return;
      const iso = normalizeToIsoDate(exp.fecha);
      if (!iso) return;
      const monto = Number(exp.montoTotal || 0);
      if (monto <= 0) return;

      let bucket: ExpenseBucket = 'GENERALES';
      if (exp.categoria === 'COMBUSTIBLE_DIRECTO') {
        bucket = 'COMBUSTIBLE';
      } else if (
        exp.categoria === 'LUBRICANTES_ACEITES' ||
        exp.categoria === 'REPUESTOS_CONSUMIBLES' ||
        exp.categoria === 'MANO_OBRA_TALLER' ||
        exp.categoria === 'NEUMATICOS_ORUGAS'
      ) {
        bucket = 'MANTENIMIENTO';
      }

      items.push({
        id: `EXP-${exp.id}`,
        fecha: iso,
        mes: iso.slice(0, 7),
        bucket,
        subcategoria:
          exp.categoria === 'MULTAS_INFRACCIONES'
            ? `Multa / Infracción${exp.multaEstadoPago ? ` (${exp.multaEstadoPago.replace(/_/g, ' ')})` : ''}`
            : exp.subcategoriaOriginal || exp.categoria.replace(/_/g, ' '),
        concepto: exp.concepto || 'Gasto de equipo',
        referencia: [exp.proveedor, exp.numeroComprobante].filter(Boolean).join(' • '),
        monto
      });
    });

    // D) COMBUSTIBLE (FuelDispensary EGRESO)
    fuelVouchers.forEach((fv) => {
      if (normText(fv.tipo) === 'INGRESO') return;
      const matches = matcher.matchesStructured({
        code: fv.codigoEquipo,
        patente: fv.patente,
        name: fv.marcaModelo
      });
      if (!matches) return;
      const iso = normalizeToIsoDate(fv.fecha || fv.fechaEmision);
      if (!iso) return;
      const liters = Math.abs(Number(fv.cantidad || fv.cantCarga || 0));
      let monto = Number(fv.totalImporte || 0);
      let estimado = false;

      if (monto <= 0 && liters > 0) {
        if (fv.precioUnitario && Number(fv.precioUnitario) > 0) {
          monto = Math.round(liters * Number(fv.precioUnitario));
        } else {
          const resolved = resolveFuelUnitPrice(fv.tipoComb || fv.combustible, fuelPrices);
          monto = Math.round(liters * resolved.price);
          estimado = resolved.estimated;
        }
      }
      if (monto <= 0) return;

      items.push({
        id: `FUEL-${fv.id}`,
        fecha: iso,
        mes: iso.slice(0, 7),
        bucket: 'COMBUSTIBLE',
        subcategoria: fv.tipoComb || fv.combustible || 'Combustible',
        concepto: `${liters.toFixed(1)} Lts — ${fv.deposito || 'Expendio'}${fv.nombreApellido ? ` (${fv.nombreApellido})` : ''}`,
        referencia: fv.numVale || fv.numTicket || fv.numOrden,
        monto,
        estimado
      });
    });

    // E) FACTURAS DE COMPRA CON ITEMS IMPUTADOS DIRECTAMENTE AL EQUIPO
    purchaseInvoices.forEach((inv) => {
      if (String(inv.tipoComprobante || '').startsWith('NOTA_CREDITO')) return;
      const iso = normalizeToIsoDate(inv.fechaEmision);
      if (!iso) return;
      (inv.items || []).forEach((it, idx) => {
        const matches = matcher.matchesStructured({
          id: it.equipoId,
          code: it.equipoId,
          name: it.equipoLabel
        });
        if (!matches) return;
        const monto = Number(it.subtotal || (it.cantidad || 0) * (it.precioUnitario || 0));
        if (monto <= 0) return;

        let bucket: ExpenseBucket = 'GENERALES';
        if (it.tipoItem === 'COMBUSTIBLE') bucket = 'COMBUSTIBLE';
        else if (
          it.tipoItem === 'LUBRICANTE' ||
          it.tipoItem === 'MANTENIMIENTO_FILTROS' ||
          it.tipoItem === 'REPUESTO' ||
          it.tipoItem === 'SERVICE'
        ) {
          bucket = 'MANTENIMIENTO';
        }

        items.push({
          id: `PUR-${inv.id}-${it.id || idx}`,
          fecha: iso,
          mes: iso.slice(0, 7),
          bucket,
          subcategoria: `Compra ${it.tipoItem.replace(/_/g, ' ')}`,
          concepto: `${it.descripcion} (${it.cantidad} ${it.unidadMedida || 'u'})`,
          referencia: `${inv.proveedorNombre} • ${inv.nroComprobanteCompleto}`,
          monto
        });
      });
    });

    // F) GASTOS MANUALES DE OBRAS IMPUTADOS AL EQUIPO
    obras.forEach((obra) => {
      (obra.gastosManuales || []).forEach((g) => {
        if (!g.equipoCodigo) return;
        const matches = matcher.matchesStructured({ code: g.equipoCodigo, name: g.equipoCodigo });
        if (!matches) return;
        const iso = normalizeToIsoDate(g.fecha);
        if (!iso) return;
        const monto = Number(g.monto || 0);
        if (monto <= 0) return;

        let bucket: ExpenseBucket = 'GENERALES';
        if (g.categoria === 'COMBUSTIBLE') bucket = 'COMBUSTIBLE';
        else if (g.categoria === 'LUBRICANTES_GRASA_ACEITE' || g.categoria === 'REPARACION_MANTENIMIENTO') {
          bucket = 'MANTENIMIENTO';
        } else if (g.categoria === 'SUELDOS_JORNALES') {
          bucket = 'SUELDOS';
        }

        items.push({
          id: `OBRA-GASTO-${obra.id}-${g.id}`,
          fecha: iso,
          mes: iso.slice(0, 7),
          bucket,
          subcategoria: `Obra ${obra.nombreObra}`,
          concepto: g.descripcion,
          referencia: g.nroComprobante || g.proveedor,
          monto
        });
      });
    });

    // G) CAJA DIARIA EGRESOS QUE REFERENCIAN EXPLICITAMENTE ESTA MAQUINA
    cajaSessions.forEach((sess) => {
      (sess.entradas || []).forEach((ent) => {
        if (ent.tipoMovimiento !== 'EGRESO') return;
        const text = `${ent.concepto || ''} ${ent.observaciones || ''}`;
        if (!matcher.matchesFreeText(text)) return;
        const iso = normalizeToIsoDate(ent.fecha || sess.fecha);
        if (!iso) return;
        const monto = Number(ent.montoGasto || ent.montoTotal || 0);
        if (monto <= 0) return;

        const up = normText(text);
        let bucket: ExpenseBucket = 'GENERALES';
        if (up.includes('COMBUSTIBLE') || up.includes('GASOIL') || up.includes('NAFTA') || up.includes('DIESEL')) {
          bucket = 'COMBUSTIBLE';
        } else if (up.includes('TALLER') || up.includes('REPUEST') || up.includes('FILTRO') || up.includes('ACEITE') || up.includes('GOMER')) {
          bucket = 'MANTENIMIENTO';
        }

        items.push({
          id: `CAJA-${sess.id}-${ent.id}`,
          fecha: iso,
          mes: iso.slice(0, 7),
          bucket,
          subcategoria: 'Caja Diaria',
          concepto: ent.concepto,
          referencia: ent.comprobante || ent.proveedorCliente,
          monto
        });
      });
    });

    return items.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [
    servicesLogs,
    expensesLogs,
    fuelVouchers,
    fuelPrices,
    purchaseInvoices,
    obras,
    cajaSessions,
    matcher
  ]);

  // 2. Compute Revenue Items: SOLO PARTES DIARIOS de esta máquina.
  // Los Resúmenes Valorizados, Contratos de Alquiler y Facturas ARCA NO se suman aparte como ingresos;
  // se utilizan únicamente para asignar/detectar el precio unitario de cada Parte Diario.
  const { revenueItems, detectedDocPrices } = useMemo(() => {
    const revList: UnifiedRevenueItem[] = [];
    const detectedList: DetectedDocumentPrice[] = [];

    // Identify ARCA invoices annulled by a matching Credit Note
    const creditNotes = arcaInvoices.filter((inv) =>
      String(inv.tipoComprobante || '').startsWith('NOTA_CREDITO')
    );
    const annulledInvoiceIds = new Set<string>();
    const arcaById = new Map<string, ArcaInvoice>();
    const arcaByParteId = new Map<string, ArcaInvoice>();

    const formatArcaRef = (inv: ArcaInvoice) => {
      const pvStr = String(inv.puntoVenta || 0).padStart(4, '0');
      const numStr = String(inv.numeroComprobante || 0).padStart(8, '0');
      return `${inv.tipoComprobante.replace('_', ' ')} ${pvStr}-${numStr}`;
    };

    arcaInvoices.forEach((inv) => {
      if (String(inv.tipoComprobante || '').startsWith('NOTA_CREDITO')) return;
      const matchedNcs = creditNotes.filter((nc) => {
        const assoc = nc.cbteAsociadoInfo;
        if (!assoc) return false;
        if (assoc.idInvoice && assoc.idInvoice === inv.id) return true;
        return (
          assoc.tipoComprobante === inv.tipoComprobante &&
          Number(assoc.puntoVenta) === Number(inv.puntoVenta) &&
          Number(assoc.numeroComprobante) === Number(inv.numeroComprobante)
        );
      });
      const ncTotal = matchedNcs.reduce(
        (acc, nc) => acc + Math.abs(Number(nc.importeTotal || nc.impTotal || 0)),
        0
      );
      const invTotal = Number(inv.importeTotal || inv.impTotal || 0);
      if (invTotal > 0 && ncTotal >= invTotal * 0.99) {
        annulledInvoiceIds.add(inv.id);
        return;
      }
      arcaById.set(inv.id, inv);
      (inv.partesDiariosIds || []).forEach((pid) => {
        if (!arcaByParteId.has(pid)) arcaByParteId.set(pid, inv);
      });
    });

    // Index Resúmenes Valorizados rows by parteDiarioId AND by (numParte + fecha) to price linked Partes
    interface ResumenPriceMatch {
      precioUnitario: number;
      unidad: VehicleSalePriceUnit;
      resumenNumero: string;
      obraNombre: string;
      facturaArcaNumero?: string;
      fecha: string;
    }
    const resumenByParteId = new Map<string, ResumenPriceMatch>();
    const resumenByNumFecha = new Map<string, ResumenPriceMatch>();

    obras.forEach((obra) => {
      (obra.resumenesValorizados || []).forEach((res) => {
        (res.filas || []).forEach((row) => {
          const docUnit = Number(row.precioUnitario || 0);
          const iso = normalizeToIsoDate(row.fecha || res.fechaEmision) || '';
          const unidad = normalizeUnit(row.unidad || row.detalle);
          const matchObj: ResumenPriceMatch = {
            precioUnitario: docUnit,
            unidad,
            resumenNumero: res.numero,
            obraNombre: obra.nombreObra || obra.pertenece || 'Obra',
            facturaArcaNumero: res.facturaArcaNumero,
            fecha: iso
          };

          if (row.parteDiarioId) {
            resumenByParteId.set(row.parteDiarioId, matchObj);
          }
          const matchesRowVehicle = matcher.matchesStructured({
            code: row.equipoCodigo,
            name: row.equipo
          });
          if (matchesRowVehicle && row.numero && iso) {
            resumenByNumFecha.set(`${normCompact(row.numero)}::${iso}`, matchObj);
          }

          // Detect unit price milestone for this vehicle from Resumen Valorizado
          if (matchesRowVehicle && docUnit > 0 && iso) {
            const g = getGeneralPriceForDate(iso, unidad, priceSchedule, vehicle);
            const alreadyInSchedule =
              g.entry && Math.abs(g.entry.precioUnitario - docUnit) < 1 && g.entry.unidad === unidad;
            if (!alreadyInSchedule) {
              detectedList.push({
                key: `RES-${res.id}-${unidad}-${Math.round(docUnit)}`,
                fecha: iso,
                unidad,
                precioUnitario: docUnit,
                origen: 'RESUMEN_VALORIZADO',
                documentoRef: `Resumen #${res.numero}`,
                clienteObra: matchObj.obraNombre
              });
            }
          }
        });
      });
    });

    // Index Contratos de Alquiler by id & parteDiarioId to price linked Partes
    const rentalById = new Map<string, RentalContract>();
    const rentalByParteId = new Map<string, RentalContract>();

    rentals.forEach((r) => {
      if (r.estado === 'CANCELADO') return;
      rentalById.set(r.id, r);
      (r.partesDiariosIds || []).forEach((pid) => {
        if (!rentalByParteId.has(pid)) rentalByParteId.set(pid, r);
      });

      const matchesRentalVehicle = matcher.matchesStructured({
        id: r.equipoId,
        code: r.equipoCodigoInterno || r.equipoCodigo,
        patente: r.equipoPatenteOrCodigo,
        name: r.equipoModelo
      });
      const rIso = normalizeToIsoDate(r.fechaInicio);
      const rUnit: VehicleSalePriceUnit = r.modalidad === 'HORAS' ? 'HORA' : 'DIA';
      const rPrice = Number(r.tarifaEquipoUnitaria || 0);
      if (matchesRentalVehicle && rIso && rPrice > 0) {
        const g = getGeneralPriceForDate(rIso, rUnit, priceSchedule, vehicle);
        const alreadyInSchedule =
          g.entry && Math.abs(g.entry.precioUnitario - rPrice) < 1 && g.entry.unidad === rUnit;
        if (!alreadyInSchedule) {
          detectedList.push({
            key: `RENT-${r.id}-${rUnit}-${Math.round(rPrice)}`,
            fecha: rIso,
            unidad: rUnit,
            precioUnitario: rPrice,
            origen: 'CONTRATO_ALQUILER',
            documentoRef: r.numeroContrato || r.id,
            clienteObra: r.clienteNombre || r.obraDestino || 'Contrato Alquiler'
          });
        }
      }
    });

    // Iterate STRICTLY over Partes Diarios belonging to this machine
    partesDiarios.forEach((p) => {
      const isThisVehicle = matcher.matchesStructured({
        id: p.vehicleId,
        code: p.codigoEquipo,
        patente: p.patenteOrCodigo,
        name: p.marcaModelo || p.vehicleName
      });
      if (!isThisVehicle) return;

      const iso = normalizeToIsoDate(p.fecha);
      if (!iso) return;

      // 1. Determine quantity & unit strictly from the Parte Diario
      let unidad: VehicleSalePriceUnit = 'HORA';
      let cantidad = 1;
      const tipoNorm = normText(p.tipo);
      if (tipoNorm.includes('VIAJ') || (Number(p.viajesCantidad || 0) > 0 && Number(p.horasTrabajadas || 0) <= 0)) {
        unidad = 'VIAJE';
        cantidad = Number(p.viajesCantidad || p.cantidad || 1);
      } else if (tipoNorm.includes('DIA') || (Number(p.cantidadDias || 0) > 0 && Number(p.horasTrabajadas || 0) <= 0)) {
        unidad = 'DIA';
        cantidad = Number(p.cantidadDias || 1);
      } else {
        unidad = 'HORA';
        cantidad =
          Number(p.horasTrabajadas || p.hsCantidad || 0) > 0
            ? Number(p.horasTrabajadas || p.hsCantidad)
            : 1;
      }
      if (cantidad <= 0) cantidad = 1;

      // 2. Look up linked documents strictly to obtain the unit price for THIS parte
      const linkedResumen =
        resumenByParteId.get(p.id) ||
        (p.numParte ? resumenByNumFecha.get(`${normCompact(p.numParte)}::${iso}`) : undefined);
      const linkedRental =
        (p.rentalId ? rentalById.get(p.rentalId) : undefined) || rentalByParteId.get(p.id);
      const linkedArca =
        (p.facturaId && !annulledInvoiceIds.has(p.facturaId) ? arcaById.get(p.facturaId) : undefined) ||
        arcaByParteId.get(p.id);

      const linkedFacturaNum =
        linkedResumen?.facturaArcaNumero ||
        (linkedArca ? formatArcaRef(linkedArca) : undefined) ||
        linkedRental?.facturaNumero ||
        p.facturaNumero;

      let docUnitPrice = 0;
      let sourceType: RevenueSourceType = 'PARTE_SIN_PRECIO';
      let originForSchedule: VehicleSalePriceOrigin = 'PARTE_DIARIO';
      let priceOriginNote = '';

      // Priority A: Resumen Valorizado linked to this parte
      if (linkedResumen && linkedResumen.precioUnitario > 0) {
        docUnitPrice = linkedResumen.precioUnitario;
        sourceType = 'RESUMEN_VALORIZADO';
        originForSchedule = 'RESUMEN_VALORIZADO';
        priceOriginNote = `Precio de Resumen #${linkedResumen.resumenNumero}`;
      }
      // Priority B: Contrato de Alquiler linked to this parte
      else if (linkedRental && Number(linkedRental.tarifaEquipoUnitaria || 0) > 0) {
        docUnitPrice = Number(linkedRental.tarifaEquipoUnitaria);
        sourceType = 'CONTRATO_ALQUILER';
        originForSchedule = 'CONTRATO_ALQUILER';
        priceOriginNote = `Precio de Contrato ${linkedRental.numeroContrato || linkedRental.id}`;
      }
      // Priority C: Parte Valorizado (precio cargado directamente en el parte)
      else {
        const rawTotal = Number(p.totalSheet || 0);
        const parteOwnUnit =
          Number(p.precioUnitario || 0) > 0
            ? Number(p.precioUnitario)
            : Number(p.valorViajeEquipo || 0) > 0
            ? Number(p.valorViajeEquipo)
            : rawTotal > 0 && cantidad > 0
            ? rawTotal / cantidad
            : 0;

        if (parteOwnUnit > 0) {
          docUnitPrice = parteOwnUnit;
          sourceType = 'PARTE_VALORIZADO';
          originForSchedule = 'PARTE_DIARIO';
          priceOriginNote = 'Precio del Parte';
        }
        // Priority D: Factura ARCA ONLY if it has a real per-unit rate (NOT a lump-sum cantidad=1 multi-parte invoice)
        else if (linkedArca) {
          const isSingleParteInvoice = (linkedArca.partesDiariosIds || []).length <= 1;
          const matchedItem = (linkedArca.items || []).find((it) => {
            const itUnitPrice = Number(it.precioUnitario || 0);
            const itQty = Number(it.cantidad || 0);
            if (itUnitPrice <= 0) return false;
            const unitMatches = normalizeUnit(it.unidadMedida || it.descripcion) === unidad;
            const descMatches = matcher.matchesFreeText(it.descripcion);
            // Only treat as per-unit rate if qty > 1 (e.g. hours/days) or single-parte invoice matching quantity
            if (itQty > 1 && (descMatches || unitMatches)) return true;
            if (isSingleParteInvoice && Math.abs(itQty - cantidad) < 0.01 && (descMatches || linkedArca.items.length === 1)) {
              return true;
            }
            return false;
          });
          if (matchedItem && Number(matchedItem.precioUnitario) > 0) {
            docUnitPrice = Number(matchedItem.precioUnitario);
            sourceType = 'FACTURA_ARCA';
            originForSchedule = 'FACTURA_ARCA';
            priceOriginNote = `Precio de ${formatArcaRef(linkedArca)}`;
          }
        }
      }

      const docTotal = Math.round(cantidad * docUnitPrice);
      const generalLookup = getGeneralPriceForDate(iso, unidad, priceSchedule, vehicle);
      const generalUnitPrice = generalLookup.price;
      const generalTotal = Math.round(cantidad * generalUnitPrice);

      const hasConflict =
        docUnitPrice > 0 &&
        generalUnitPrice > 0 &&
        Math.abs(docUnitPrice - generalUnitPrice) >= 1;

      const docKey = `PARTE:${p.id}`;
      let effectiveMode: 'DOCUMENTO' | 'GENERAL' = 'DOCUMENTO';
      if (docUnitPrice <= 0) {
        effectiveMode = 'GENERAL';
      } else if (overrides[docKey]) {
        effectiveMode = overrides[docKey];
      } else if (policy === 'GENERAL' && generalUnitPrice > 0) {
        effectiveMode = 'GENERAL';
      } else {
        effectiveMode = 'DOCUMENTO';
      }

      const effectiveUnitPrice = effectiveMode === 'GENERAL' ? generalUnitPrice : docUnitPrice;
      const effectiveTotal = effectiveMode === 'GENERAL' ? generalTotal : docTotal;

      const parteRef = p.numParte ? `Parte #${p.numParte}` : `Parte ${p.id.slice(0, 6)}`;
      const detalleText = [
        p.servMant || 'Trabajo',
        p.nombreApellido || p.driverName || 'Operador',
        priceOriginNote
      ]
        .filter(Boolean)
        .join(' — ');

      revList.push({
        docKey,
        fecha: iso,
        mes: iso.slice(0, 7),
        sourceType,
        documentoRef: parteRef,
        clienteObra: p.obra || linkedResumen?.obraNombre || linkedRental?.clienteNombre || 'Obra / Trabajo Diario',
        detalle: detalleText,
        unidad,
        cantidad,
        docUnitPrice,
        docTotal,
        generalUnitPrice,
        generalPriceLabel: generalLookup.label,
        generalTotal,
        hasConflict,
        effectiveMode,
        effectiveUnitPrice,
        effectiveTotal,
        linkedFacturaNum
      });

      if (docUnitPrice > 0) {
        const alreadyInSchedule =
          generalLookup.entry &&
          Math.abs(generalLookup.entry.precioUnitario - docUnitPrice) < 1 &&
          generalLookup.entry.unidad === unidad;
        if (!alreadyInSchedule) {
          detectedList.push({
            key: `${iso}-${unidad}-${Math.round(docUnitPrice)}-${parteRef}`,
            fecha: iso,
            unidad,
            precioUnitario: docUnitPrice,
            origen: originForSchedule,
            documentoRef: priceOriginNote || parteRef,
            clienteObra: p.obra || 'Obra'
          });
        }
      }
    });

    // Deduplicate detected doc prices by month + unit + rounded price
    const uniqueDetectedMap = new Map<string, DetectedDocumentPrice>();
    detectedList.forEach((d) => {
      const sig = `${d.fecha.slice(0, 7)}::${d.unidad}::${Math.round(d.precioUnitario)}`;
      if (!uniqueDetectedMap.has(sig)) {
        uniqueDetectedMap.set(sig, d);
      }
    });

    return {
      revenueItems: revList.sort((a, b) => b.fecha.localeCompare(a.fecha)),
      detectedDocPrices: Array.from(uniqueDetectedMap.values()).sort((a, b) => b.fecha.localeCompare(a.fecha))
    };
  }, [obras, rentals, arcaInvoices, partesDiarios, matcher, priceSchedule, vehicle, policy, overrides]);

  // 3. Determine active month window based on rangePreset
  const activeMonths = useMemo<string[]>(() => {
    const nowYm = getCurrentYearMonth();
    const allRecordedMonths = new Set<string>([nowYm]);
    nonFixedExpenses.forEach((e) => allRecordedMonths.add(e.mes));
    revenueItems.forEach((r) => allRecordedMonths.add(r.mes));
    fixedExpensesList.forEach((f) => {
      if (f.fechaInicio) allRecordedMonths.add(f.fechaInicio);
      if (f.fechaFin) allRecordedMonths.add(f.fechaFin);
    });
    const sorted = Array.from(allRecordedMonths).sort();
    const minYm = sorted[0] || addMonths(nowYm, -5);
    const maxYm = sorted[sorted.length - 1] || nowYm;

    if (rangePreset === '6M') {
      return enumerateMonths(addMonths(nowYm, -5), nowYm);
    }
    if (rangePreset === '12M') {
      return enumerateMonths(addMonths(nowYm, -11), nowYm);
    }
    if (rangePreset === 'YTD') {
      const yr = nowYm.slice(0, 4);
      return enumerateMonths(`${yr}-01`, nowYm);
    }
    if (rangePreset === 'CUSTOM') {
      const from = customFrom || addMonths(nowYm, -5);
      const to = customTo || nowYm;
      return from <= to ? enumerateMonths(from, to) : enumerateMonths(to, from);
    }
    return enumerateMonths(minYm, maxYm);
  }, [rangePreset, customFrom, customTo, nonFixedExpenses, revenueItems, fixedExpensesList]);

  const activeMonthSet = useMemo(() => new Set(activeMonths), [activeMonths]);

  // 4. Expand recurring fixed expenses across activeMonths
  const expandedFixedExpenses = useMemo<UnifiedExpenseItem[]>(() => {
    const list: UnifiedExpenseItem[] = [];
    fixedExpensesList.forEach((fx) => {
      if (!fx.activo || !fx.monto || fx.monto <= 0) return;
      activeMonths.forEach((ym) => {
        if (fx.fechaInicio && ym < fx.fechaInicio) return;
        if (fx.fechaFin && ym > fx.fechaFin) return;
        if (fx.frecuencia === 'UNICO' && ym !== fx.fechaInicio) return;

        let monthlyAmount = fx.monto;
        let freqDetail = 'Fijo mensual';
        if (fx.frecuencia === 'QUINCENAL') {
          monthlyAmount = Math.round(fx.monto * 2);
          freqDetail = `Quincenal (${formatCurrency(fx.monto)} × 2)`;
        } else if (fx.frecuencia === 'SEMANAL') {
          monthlyAmount = Math.round(fx.monto * 4.33);
          freqDetail = `Semanal (${formatCurrency(fx.monto)} × 4.33)`;
        } else if (fx.frecuencia === 'ANUAL') {
          monthlyAmount = Math.round(fx.monto / 12);
          freqDetail = `Anual prorrateado (${formatCurrency(fx.monto)} / 12)`;
        } else if (fx.frecuencia === 'UNICO') {
          freqDetail = 'Gasto fijo único';
        }

        list.push({
          id: `FIXED-${fx.id}-${ym}`,
          fecha: `${ym}-01`,
          mes: ym,
          bucket: 'FIJOS',
          subcategoria: FIXED_CATEGORY_LABELS[fx.categoria] || fx.categoria,
          concepto: `${fx.concepto} — ${freqDetail}`,
          referencia: fx.fechaFin ? `Hasta ${fx.fechaFin}` : 'Se repite cada mes',
          monto: monthlyAmount,
          isFixed: true,
          fixedId: fx.id
        });
      });
    });
    return list;
  }, [fixedExpensesList, activeMonths]);

  // 4b. Compute SUELDOS DEL PERSONAL using the EXACT Obras engine (obraCostosEngine.ts):
  //     matchPayrollSlipToEmployee + getEmployeeBankTokenKey + Liquidación Real ÷ diasMes (default 24d)
  const { machinePayrollRows, payrollMonthlyExpenses } = useMemo<{
    machinePayrollRows: MachinePayrollRow[];
    payrollMonthlyExpenses: UnifiedExpenseItem[];
  }>(() => {
    const excludedSet = new Set<string>(sueldosCfg.itemsExcluidosIds || []);
    const diasMes = Math.max(1, Number(sueldosCfg.diasLaborablesMes || 24));
    const defaultDiaFromMensual = Math.round(Number(sueldosCfg.sueldoMensualDefault || 950000) / diasMes);
    const modoSueldosGlobal = sueldosCfg.modoCalculoSueldos || 'LIQUIDACION_TOTAL';

    const matchEmployeeObj = (code?: string, name?: string): Driver | undefined => {
      const cN = normText(code);
      const nN = normText(name);
      const nA = normCompact(name);
      const exact = drivers.find(
        (e) =>
          (cN && (normText(e.id) === cN || normText(e.codigoEmpleado) === cN || normText(e.legajo) === cN)) ||
          (nN && normText(e.nombreApellido) === nN) ||
          (nA && nA.length >= 4 && normCompact(e.nombreApellido) === nA)
      );
      if (exact) return exact;
      const rawCandidate = name || code || '';
      if (!rawCandidate.trim()) return undefined;
      const smart = matchPayrollSlipToEmployee(rawCandidate, drivers, employeeDirectoryLinks);
      return smart.employee || undefined;
    };

    type EmpGroup = {
      empleadoKey: string;
      nombre: string;
      empObj?: Driver;
      fechas: Set<string>;
      horas: number;
      horasByYm: Map<string, number>;
      viajes: number;
      obras: Set<string>;
      minDate: string;
      maxDate: string;
    };

    const empGroupMap = new Map<string, EmpGroup>();

    partesDiarios.forEach((p) => {
      const isThisVehicle = matcher.matchesStructured({
        id: p.vehicleId,
        code: p.codigoEquipo,
        patente: p.patenteOrCodigo,
        name: p.marcaModelo || p.vehicleName
      });
      if (!isThisVehicle) return;

      const dKey = normalizeToIsoDate(p.fecha);
      if (!dKey) return;
      const ym = dKey.slice(0, 7);
      if (!activeMonthSet.has(ym)) return;

      const rawName = p.nombreApellido || p.driverName || '';
      const empObj = matchEmployeeObj(p.codigoEmpleado, rawName);
      const empKey = empObj ? empObj.id : normText(rawName || p.codigoEmpleado || '');
      if (!empKey) return;

      let g = empGroupMap.get(empKey);
      if (!g) {
        g = {
          empleadoKey: empKey,
          nombre: empObj?.nombreApellido || rawName || p.codigoEmpleado || 'Operario',
          empObj,
          fechas: new Set<string>(),
          horas: 0,
          horasByYm: new Map<string, number>(),
          viajes: 0,
          obras: new Set<string>(),
          minDate: '',
          maxDate: ''
        };
        empGroupMap.set(empKey, g);
      }

      g.fechas.add(dKey);
      const hrs = Number(p.horasTrabajadas || p.hsCantidad || 0);
      g.horas += hrs;
      g.horasByYm.set(ym, (g.horasByYm.get(ym) || 0) + hrs);
      if (normText(p.tipo).includes('VIAJ')) {
        g.viajes += Number(p.viajesCantidad || p.cantidad || 1);
      }
      if (p.obra && p.obra.trim()) {
        g.obras.add(p.obra.trim());
      }
      if (!g.minDate || dKey < g.minDate) g.minDate = dKey;
      if (!g.maxDate || dKey > g.maxDate) g.maxDate = dKey;
    });

    type MonthlyPayrollEntry = {
      ym: string;
      periodName: string;
      basico: number;
      extras: number;
      totalRemunerativo: number;
      valorBaseJornal: number;
    };

    const findEmployeePayrollSlips = (emp: Driver | undefined, rawName: string): MonthlyPayrollEntry[] => {
      const entriesByPeriod = new Map<string, MonthlyPayrollEntry>();
      const targetTokenKey = getEmployeeBankTokenKey(emp?.nombreApellido || rawName);

      for (const period of payrollPeriods) {
        const ym = extractPayrollPeriodYearMonth(period);
        const periodKey = ym || period.id;
        const periodLabel = (period.sheetTabName || period.nombrePeriodo || ym || '').trim();

        for (const slip of period.slips || []) {
          let isMatch = false;
          if (emp && slip.empleadoId && slip.empleadoId === emp.id) {
            isMatch = true;
          } else if (emp) {
            const m = matchPayrollSlipToEmployee(slip, [emp], employeeDirectoryLinks);
            if (m.employee && m.employee.id === emp.id) {
              isMatch = true;
            }
          } else if (targetTokenKey) {
            const slipTokenKey = getEmployeeBankTokenKey(slip.empleadoNombre);
            if (slipTokenKey && slipTokenKey === targetTokenKey) {
              isMatch = true;
            }
          }

          if (!isMatch) continue;

          const basico = Number(slip.totalBasicoIngresos) || 0;
          const extras = Number(slip.totalExtraIngresos) || 0;
          const totalRem = basico + extras > 0 ? basico + extras : Number(slip.totalIngresos) || 0;
          const baseJ = Number(slip.valorBaseJornal) || 0;

          const prev = entriesByPeriod.get(periodKey);
          if (!prev) {
            entriesByPeriod.set(periodKey, {
              ym,
              periodName: periodLabel,
              basico,
              extras,
              totalRemunerativo: totalRem,
              valorBaseJornal: baseJ
            });
          } else {
            prev.basico += basico;
            prev.extras += extras;
            prev.totalRemunerativo += totalRem;
            if (baseJ > prev.valorBaseJornal) prev.valorBaseJornal = baseJ;
          }
        }
      }

      return Array.from(entriesByPeriod.values()).sort((a, b) => (b.ym || '').localeCompare(a.ym || ''));
    };

    const rows: MachinePayrollRow[] = Array.from(empGroupMap.values()).map((g) => {
      const emp = g.empObj;
      const override = sueldosCfg.tarifasEmpleadoOverride?.[g.empleadoKey];
      const realSlips = findEmployeePayrollSlips(emp, g.nombre);
      const latestSlip = realSlips[0];

      const diasTrabajados = g.fechas.size;
      const horasTrabajadas = Number(g.horas.toFixed(2));
      const sortedDates = Array.from(g.fechas).sort();

      // Count distinct worked dates per month YYYY-MM
      const datesByYm = new Map<string, string[]>();
      sortedDates.forEach((dStr) => {
        const ym = dStr.slice(0, 7);
        const list = datesByYm.get(ym) || [];
        list.push(dStr);
        datesByYm.set(ym, list);
      });

      let modoCalculo: 'DIA' | 'HORA' = override?.modo || 'DIA';
      let tarifaAplicada = defaultDiaFromMensual;
      let fuenteTarifa = `Proporcional Ref. (${diasMes} días/mes)`;
      let montoTotal = 0;
      let sueldoMensualLiquidado: number | undefined = latestSlip?.totalRemunerativo;
      let sueldoBasicoPlanilla: number | undefined = latestSlip?.basico;
      let periodoLiquidacionLabel: string | undefined = latestSlip?.periodName;
      let hasOverride = false;
      const montoByYm: MachinePayrollMonthBreakdown[] = [];

      // 1. Explicit per-employee override on this Machine
      if (override?.modo === 'HORA' && (override.costoPorHora ?? 0) > 0) {
        hasOverride = true;
        modoCalculo = 'HORA';
        tarifaAplicada = Number(override.costoPorHora);
        fuenteTarifa = 'Tarifa manual por hora';
        montoTotal = Number((horasTrabajadas * tarifaAplicada).toFixed(2));
        datesByYm.forEach((dates, ym) => {
          const hrsYm = g.horasByYm.get(ym) || 0;
          montoByYm.push({
            ym,
            monto: Math.round(hrsYm * tarifaAplicada),
            dias: dates.length,
            horas: hrsYm,
            periodName: ym,
            fuente: fuenteTarifa
          });
        });
      } else if ((override?.costoPorDia ?? 0) > 0) {
        hasOverride = true;
        modoCalculo = 'DIA';
        tarifaAplicada = Number(override!.costoPorDia);
        fuenteTarifa = 'Tarifa manual por día';
        montoTotal = Number((diasTrabajados * tarifaAplicada).toFixed(2));
        datesByYm.forEach((dates, ym) => {
          montoByYm.push({
            ym,
            monto: Math.round(dates.length * tarifaAplicada),
            dias: dates.length,
            horas: g.horasByYm.get(ym) || 0,
            periodName: ym,
            fuente: fuenteTarifa
          });
        });
      } else if (realSlips.length > 0 && modoSueldosGlobal !== 'REFERENCIA_MANUAL') {
        // 2. Real Payroll Slips from Liquidación de Sueldos (payroll_periods_data in Supabase)
        modoCalculo = 'DIA';
        if (modoSueldosGlobal === 'JORNAL_BASE_SHEET' && latestSlip.valorBaseJornal > 0) {
          tarifaAplicada = Math.round(latestSlip.valorBaseJornal);
          montoTotal = Number((diasTrabajados * tarifaAplicada).toFixed(2));
          fuenteTarifa = `Jornal Base Planilla (${latestSlip.periodName})`;
          datesByYm.forEach((dates, ym) => {
            montoByYm.push({
              ym,
              monto: Math.round(dates.length * tarifaAplicada),
              dias: dates.length,
              horas: g.horasByYm.get(ym) || 0,
              periodName: latestSlip.periodName,
              fuente: fuenteTarifa
            });
          });
        } else {
          const byYm = new Map<string, MonthlyPayrollEntry>();
          realSlips.forEach((rs) => {
            if (rs.ym) byYm.set(rs.ym, rs);
          });

          let accumulatedCost = 0;
          let accumulatedMonthlyRef = 0;
          let accumulatedBasicoRef = 0;
          const usedPeriods = new Set<string>();

          datesByYm.forEach((dates, ym) => {
            const slipForMonth = byYm.get(ym) || latestSlip;
            usedPeriods.add(slipForMonth.periodName);
            const monthlyBase =
              modoSueldosGlobal === 'LIQUIDACION_BASICO'
                ? slipForMonth.basico
                : slipForMonth.totalRemunerativo;
            const dayCost = monthlyBase / diasMes;
            const monthCost = dayCost * dates.length;
            accumulatedCost += monthCost;
            accumulatedMonthlyRef += slipForMonth.totalRemunerativo * dates.length;
            accumulatedBasicoRef += slipForMonth.basico * dates.length;

            const monthFuente =
              modoSueldosGlobal === 'LIQUIDACION_BASICO'
                ? `Liquidación Real Básico (${slipForMonth.periodName} ÷ ${diasMes}d)`
                : `Liquidación Real c/Extras (${slipForMonth.periodName} ÷ ${diasMes}d)`;

            montoByYm.push({
              ym,
              monto: Math.round(monthCost),
              dias: dates.length,
              horas: g.horasByYm.get(ym) || 0,
              periodName: slipForMonth.periodName,
              fuente: monthFuente
            });
          });

          montoTotal = Math.round(accumulatedCost);
          tarifaAplicada = diasTrabajados > 0 ? Math.round(accumulatedCost / diasTrabajados) : 0;
          sueldoMensualLiquidado =
            diasTrabajados > 0 ? Math.round(accumulatedMonthlyRef / diasTrabajados) : latestSlip.totalRemunerativo;
          sueldoBasicoPlanilla =
            diasTrabajados > 0 ? Math.round(accumulatedBasicoRef / diasTrabajados) : latestSlip.basico;
          const periodsList = Array.from(usedPeriods);
          periodoLiquidacionLabel =
            periodsList.length <= 2
              ? periodsList.join(' / ')
              : `${periodsList[0]} (+${periodsList.length - 1} meses)`;
          fuenteTarifa =
            modoSueldosGlobal === 'LIQUIDACION_BASICO'
              ? `Liquidación Real Básico (${periodoLiquidacionLabel} ÷ ${diasMes}d)`
              : `Liquidación Real c/Extras (${periodoLiquidacionLabel} ÷ ${diasMes}d)`;
        }
      } else if (emp && Number(emp.costoPorDia || 0) > 0) {
        modoCalculo = 'DIA';
        const rawCostoDia = Number(emp.costoPorDia);
        tarifaAplicada = rawCostoDia > 300000 ? Math.round(rawCostoDia / diasMes) : rawCostoDia;
        fuenteTarifa = 'Nómina empleado ($/día)';
        montoTotal = Number((diasTrabajados * tarifaAplicada).toFixed(2));
        datesByYm.forEach((dates, ym) => {
          montoByYm.push({
            ym,
            monto: Math.round(dates.length * tarifaAplicada),
            dias: dates.length,
            horas: g.horasByYm.get(ym) || 0,
            periodName: ym,
            fuente: fuenteTarifa
          });
        });
      } else if (emp && Number(emp.costoPorHora || 0) > 0 && g.horas > 0) {
        modoCalculo = 'HORA';
        tarifaAplicada = Number(emp.costoPorHora);
        fuenteTarifa = 'Nómina empleado ($/hs)';
        montoTotal = Number((horasTrabajadas * tarifaAplicada).toFixed(2));
        datesByYm.forEach((dates, ym) => {
          const hrsYm = g.horasByYm.get(ym) || 0;
          montoByYm.push({
            ym,
            monto: Math.round(hrsYm * tarifaAplicada),
            dias: dates.length,
            horas: hrsYm,
            periodName: ym,
            fuente: fuenteTarifa
          });
        });
      } else {
        montoTotal =
          modoCalculo === 'HORA'
            ? Number((horasTrabajadas * tarifaAplicada).toFixed(2))
            : Number((diasTrabajados * tarifaAplicada).toFixed(2));
        datesByYm.forEach((dates, ym) => {
          const hrsYm = g.horasByYm.get(ym) || 0;
          montoByYm.push({
            ym,
            monto: Math.round((modoCalculo === 'HORA' ? hrsYm : dates.length) * tarifaAplicada),
            dias: dates.length,
            horas: hrsYm,
            periodName: ym,
            fuente: fuenteTarifa
          });
        });
      }

      const excludeKey = `PAY:${g.empleadoKey}`;
      return {
        excludeKey,
        empleadoKey: g.empleadoKey,
        empleadoNombre: g.nombre,
        categoriaNombre: emp?.categoria || 'Operario / Chofer',
        diasTrabajados,
        fechas: sortedDates,
        horasTrabajadas,
        viajes: g.viajes,
        obrasOperadas: Array.from(g.obras),
        minDate: g.minDate,
        maxDate: g.maxDate,
        modoCalculo,
        tarifaAplicada,
        fuenteTarifa,
        montoTotal,
        montoByYm,
        excluded: excludedSet.has(excludeKey),
        hasOverride,
        sueldoMensualLiquidado,
        sueldoBasicoPlanilla,
        periodoLiquidacionLabel
      };
    });

    // Sort by montoTotal desc so highest-impact operators appear first
    rows.sort((a, b) => b.montoTotal - a.montoTotal);

    // Emit monthly SUELDOS expense items for non-excluded operators (feeds Curva & Gastos ledger)
    const monthlyItems: UnifiedExpenseItem[] = [];
    rows.forEach((row) => {
      if (row.excluded) return;
      row.montoByYm.forEach((mb) => {
        if (mb.monto <= 0) return;
        const unitLabel = row.modoCalculo === 'HORA' ? 'hs' : 'día';
        monthlyItems.push({
          id: `SUELDO-${mb.ym}-${row.empleadoKey}`,
          fecha: `${mb.ym}-28`,
          mes: mb.ym,
          bucket: 'SUELDOS',
          subcategoria: mb.fuente,
          concepto: `${row.empleadoNombre} (${mb.dias} d / ${mb.horas.toFixed(1)} hs • ${formatCurrency(row.tarifaAplicada)}/${unitLabel})`,
          referencia: mb.periodName || mb.fuente,
          monto: mb.monto,
          estimado: !row.sueldoMensualLiquidado && !row.hasOverride
        });
      });
    });

    return { machinePayrollRows: rows, payrollMonthlyExpenses: monthlyItems };
  }, [partesDiarios, drivers, payrollPeriods, employeeDirectoryLinks, matcher, activeMonthSet, sueldosCfg]);

  // 5. Filtered Expenses & Revenues within activeMonths
  const allExpensesInPeriod = useMemo<UnifiedExpenseItem[]>(() => {
    const filtered = nonFixedExpenses.filter((e) => activeMonthSet.has(e.mes));
    return [...filtered, ...payrollMonthlyExpenses, ...expandedFixedExpenses].sort((a, b) =>
      b.fecha.localeCompare(a.fecha)
    );
  }, [nonFixedExpenses, payrollMonthlyExpenses, expandedFixedExpenses, activeMonthSet]);

  const allRevenuesInPeriod = useMemo<UnifiedRevenueItem[]>(
    () => revenueItems.filter((r) => activeMonthSet.has(r.mes)),
    [revenueItems, activeMonthSet]
  );

  // 6. Monthly series for Recharts & Table
  const monthlySeries = useMemo(() => {
    return activeMonths.map((ym) => {
      const mExp = allExpensesInPeriod.filter((e) => e.mes === ym);
      const mRev = allRevenuesInPeriod.filter((r) => r.mes === ym);

      const sueldos = mExp.filter((e) => e.bucket === 'SUELDOS').reduce((a, b) => a + b.monto, 0);
      const mantenimiento = mExp.filter((e) => e.bucket === 'MANTENIMIENTO').reduce((a, b) => a + b.monto, 0);
      const combustible = mExp.filter((e) => e.bucket === 'COMBUSTIBLE').reduce((a, b) => a + b.monto, 0);
      const generales = mExp.filter((e) => e.bucket === 'GENERALES').reduce((a, b) => a + b.monto, 0);
      const fijos = mExp.filter((e) => e.bucket === 'FIJOS').reduce((a, b) => a + b.monto, 0);
      const totalGastos = sueldos + mantenimiento + combustible + generales + fijos;
      const ingresos = mRev.reduce((a, b) => a + b.effectiveTotal, 0);
      const resultadoNeto = ingresos - totalGastos;
      const margen = ingresos > 0 ? Math.round((resultadoNeto / ingresos) * 100) : totalGastos > 0 ? -100 : 0;

      return {
        ym,
        mesLabel: formatMonthLabel(ym),
        ingresos,
        totalGastos,
        resultadoNeto,
        margen,
        sueldos,
        mantenimiento,
        combustible,
        generales,
        fijos,
        docsCount: mRev.length
      };
    });
  }, [activeMonths, allExpensesInPeriod, allRevenuesInPeriod]);

  // 7. Totals & KPIs
  const totals = useMemo(() => {
    const ingresos = monthlySeries.reduce((a, m) => a + m.ingresos, 0);
    const gastos = monthlySeries.reduce((a, m) => a + m.totalGastos, 0);
    const sueldos = monthlySeries.reduce((a, m) => a + m.sueldos, 0);
    const mantenimiento = monthlySeries.reduce((a, m) => a + m.mantenimiento, 0);
    const combustible = monthlySeries.reduce((a, m) => a + m.combustible, 0);
    const generales = monthlySeries.reduce((a, m) => a + m.generales, 0);
    const fijos = monthlySeries.reduce((a, m) => a + m.fijos, 0);
    const neto = ingresos - gastos;
    const margen = ingresos > 0 ? Math.round((neto / ingresos) * 100) : gastos > 0 ? -100 : 0;
    const conflictosCount = revenueItems.filter((r) => r.hasConflict).length;

    const todayIso = new Date().toISOString().slice(0, 10);
    const currentUnit: VehicleSalePriceUnit = vehicle.modalidadTarifa === 'DIAS' ? 'DIA' : 'HORA';
    const currentGeneralPrice = getGeneralPriceForDate(todayIso, currentUnit, priceSchedule, vehicle);

    return {
      ingresos,
      gastos,
      sueldos,
      mantenimiento,
      combustible,
      generales,
      fijos,
      neto,
      margen,
      conflictosCount,
      currentGeneralPrice
    };
  }, [monthlySeries, revenueItems, vehicle, priceSchedule]);

  // Helper to persist any Vehicle update cleanly to Supabase
  const persistVehiclePatch = async (patch: Partial<Vehicle>) => {
    setSaving(true);
    try {
      const updated: Vehicle = { ...vehicle, ...patch };
      await onUpdateVehicle(updated);
    } finally {
      setSaving(false);
    }
  };

  // --- Handlers for Obras-style Personal / Sueldos ---
  const persistSueldosConfig = async (nextCfg: VehicleSueldosConfig, okMsg: string) => {
    setPayrollFeedback(null);
    await persistVehiclePatch({ sueldosConfig: nextCfg });
    setPayrollFeedback(okMsg);
  };

  const handleTogglePayrollExclude = async (excludeKey: string) => {
    const current = sueldosCfg.itemsExcluidosIds || [];
    const nextExcluded = current.includes(excludeKey)
      ? current.filter((id) => id !== excludeKey)
      : [...current, excludeKey];
    await persistSueldosConfig(
      { ...sueldosCfg, itemsExcluidosIds: nextExcluded },
      'Inclusión de operario actualizada en Supabase.'
    );
  };

  const handleSavePayrollOverride = async (empleadoKey: string) => {
    const val = Number(editPayrollValor) || 0;
    const prevOverrides = sueldosCfg.tarifasEmpleadoOverride || {};
    const nextOverrides = {
      ...prevOverrides,
      [empleadoKey]: {
        modo: editPayrollModo,
        costoPorDia: editPayrollModo === 'DIA' ? val : undefined,
        costoPorHora: editPayrollModo === 'HORA' ? val : undefined
      }
    };
    await persistSueldosConfig(
      { ...sueldosCfg, tarifasEmpleadoOverride: nextOverrides },
      'Tarifa de operario guardada en Supabase.'
    );
    setEditingPayrollKey(null);
  };

  const handleClearPayrollOverride = async (empleadoKey: string) => {
    const nextOverrides = { ...(sueldosCfg.tarifasEmpleadoOverride || {}) };
    delete nextOverrides[empleadoKey];
    await persistSueldosConfig(
      { ...sueldosCfg, tarifasEmpleadoOverride: nextOverrides },
      'Tarifa restaurada a Liquidación Real en Supabase.'
    );
    setEditingPayrollKey(null);
  };

  const activePayrollRows = useMemo(
    () => machinePayrollRows.filter((r) => !r.excluded),
    [machinePayrollRows]
  );

  const payrollTotals = useMemo(() => {
    const dias = activePayrollRows.reduce((acc, r) => acc + r.diasTrabajados, 0);
    const horas = activePayrollRows.reduce((acc, r) => acc + r.horasTrabajadas, 0);
    const costo = activePayrollRows.reduce((acc, r) => acc + r.montoTotal, 0);
    return { dias, horas, costo };
  }, [activePayrollRows]);

  const filteredPayrollRows = useMemo(() => {
    const q = payrollSearch.trim().toLowerCase();
    if (!q) return machinePayrollRows;
    return machinePayrollRows.filter(
      (r) =>
        r.empleadoNombre.toLowerCase().includes(q) ||
        r.categoriaNombre.toLowerCase().includes(q) ||
        r.fuenteTarifa.toLowerCase().includes(q) ||
        r.obrasOperadas.some((o) => o.toLowerCase().includes(q))
    );
  }, [machinePayrollRows, payrollSearch]);

  // --- Handlers for Fixed Expenses ---
  const resetFixedForm = () => {
    setEditingFixedId(null);
    setFixedConcepto('');
    setFixedCategoria('LAVADERO');
    setFixedMonto('');
    setFixedFrecuencia('MENSUAL');
    setFixedInicio(getCurrentYearMonth());
    setFixedFin('');
    setFixedObs('');
    setShowFixedForm(false);
  };

  const handleEditFixed = (fx: VehicleFixedExpense) => {
    setEditingFixedId(fx.id);
    setFixedConcepto(fx.concepto);
    setFixedCategoria(fx.categoria);
    setFixedMonto(String(fx.monto));
    setFixedFrecuencia(fx.frecuencia);
    setFixedInicio(fx.fechaInicio);
    setFixedFin(fx.fechaFin || '');
    setFixedObs(fx.observaciones || '');
    setShowFixedForm(true);
  };

  const handleSaveFixedExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = Number(fixedMonto);
    if (!fixedConcepto.trim() || !montoNum || montoNum <= 0 || !fixedInicio) return;

    const newEntry: VehicleFixedExpense = {
      id: editingFixedId || `FIX-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      concepto: fixedConcepto.trim(),
      categoria: fixedCategoria,
      monto: montoNum,
      frecuencia: fixedFrecuencia,
      fechaInicio: fixedInicio,
      fechaFin: fixedFin.trim() || undefined,
      activo: true,
      observaciones: fixedObs.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    const nextList = editingFixedId
      ? fixedExpensesList.map((item) => (item.id === editingFixedId ? newEntry : item))
      : [newEntry, ...fixedExpensesList];

    await persistVehiclePatch({ gastosFijosRecurrentes: nextList });
    resetFixedForm();
  };

  const handleToggleFixedActive = async (id: string) => {
    const nextList = fixedExpensesList.map((item) =>
      item.id === id ? { ...item, activo: !item.activo } : item
    );
    await persistVehiclePatch({ gastosFijosRecurrentes: nextList });
  };

  const handleDeleteFixed = async (id: string) => {
    const nextList = fixedExpensesList.filter((item) => item.id !== id);
    await persistVehiclePatch({ gastosFijosRecurrentes: nextList });
  };

  // --- Handlers for Sale Price Schedule & Conflict Resolution ---
  const commitSalePriceEntry = async (
    entry: VehicleSalePriceEntry,
    isEdit: boolean,
    overrideModeForAffected?: 'GENERAL' | 'DOCUMENTO',
    affectedDocs?: UnifiedRevenueItem[]
  ) => {
    const nextSchedule = isEdit
      ? priceSchedule.map((p) => (p.id === entry.id ? entry : p))
      : [...priceSchedule, entry];

    const nextOverrides = { ...overrides };
    if (overrideModeForAffected && affectedDocs && affectedDocs.length > 0) {
      affectedDocs.forEach((doc) => {
        nextOverrides[doc.docKey] = overrideModeForAffected;
      });
    }

    // Also update current ficha price if this entry is the latest active price
    const sorted = [...nextSchedule].sort((a, b) => a.fechaDesde.localeCompare(b.fechaDesde));
    const latest = sorted[sorted.length - 1];
    const patch: Partial<Vehicle> = {
      historialPreciosVenta: sorted,
      overridesPrecioDocumentos: nextOverrides
    };
    if (latest && latest.id === entry.id) {
      if (entry.unidad === 'HORA') patch.precioSugeridoHora = entry.precioUnitario;
      if (entry.unidad === 'DIA') patch.precioSugerido = entry.precioUnitario;
    }

    await persistVehiclePatch(patch);
    setPendingPriceConfirmation(null);
    setEditingPriceId(null);
    setPriceValor('');
    setPriceNota('');
  };

  const handleSubmitSalePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const valorNum = Number(priceValor);
    const iso = normalizeToIsoDate(priceFechaDesde);
    if (!iso || !valorNum || valorNum <= 0) return;

    const entry: VehicleSalePriceEntry = {
      id: editingPriceId || `PRC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fechaDesde: iso,
      precioUnitario: valorNum,
      unidad: priceUnidad,
      origen: 'MANUAL',
      nota: priceNota.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    // Check if there are valorized documents/partes on or after `iso` with a different document price
    const affectedDocs = revenueItems.filter(
      (r) =>
        r.fecha >= iso &&
        r.docUnitPrice > 0 &&
        Math.abs(r.docUnitPrice - valorNum) >= 1
    );

    if (affectedDocs.length > 0) {
      setPendingPriceConfirmation({
        entry,
        isEdit: Boolean(editingPriceId),
        affectedDocs
      });
      return;
    }

    await commitSalePriceEntry(entry, Boolean(editingPriceId));
  };

  const handleAdoptDocumentPrice = async (det: DetectedDocumentPrice) => {
    const entry: VehicleSalePriceEntry = {
      id: `PRC-DOC-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      fechaDesde: det.fecha,
      precioUnitario: det.precioUnitario,
      unidad: det.unidad,
      origen: det.origen,
      documentoRef: det.documentoRef,
      nota: `Sincronizado desde ${det.documentoRef} (${det.clienteObra})`,
      createdAt: new Date().toISOString()
    };
    await commitSalePriceEntry(entry, false);
  };

  const handleSyncAllDetectedPrices = async () => {
    if (detectedDocPrices.length === 0) return;
    const newEntries: VehicleSalePriceEntry[] = detectedDocPrices.map((det, idx) => ({
      id: `PRC-SYNC-${Date.now()}-${idx}`,
      fechaDesde: det.fecha,
      precioUnitario: det.precioUnitario,
      unidad: det.unidad,
      origen: det.origen,
      documentoRef: det.documentoRef,
      nota: `Sincronizado desde ${det.documentoRef}`,
      createdAt: new Date().toISOString()
    }));
    const merged = [...priceSchedule, ...newEntries].sort((a, b) => a.fechaDesde.localeCompare(b.fechaDesde));
    await persistVehiclePatch({ historialPreciosVenta: merged });
  };

  const handleDeleteSalePrice = async (id: string) => {
    const nextSchedule = priceSchedule.filter((p) => p.id !== id);
    await persistVehiclePatch({ historialPreciosVenta: nextSchedule });
  };

  const handleChangePolicy = async (nextPolicy: VehicleDocumentPricePolicy) => {
    await persistVehiclePatch({ politicaPrecioDocumentos: nextPolicy });
  };

  const handleToggleDocOverride = async (docKey: string, mode: 'GENERAL' | 'DOCUMENTO') => {
    const nextOverrides = { ...overrides, [docKey]: mode };
    await persistVehiclePatch({ overridesPrecioDocumentos: nextOverrides });
  };

  const handleApplyAllConflicts = async (mode: 'GENERAL' | 'DOCUMENTO') => {
    const nextOverrides = { ...overrides };
    revenueItems.filter((r) => r.hasConflict).forEach((r) => {
      nextOverrides[r.docKey] = mode;
    });
    await persistVehiclePatch({
      politicaPrecioDocumentos: mode,
      overridesPrecioDocumentos: nextOverrides
    });
  };

  // Filtered expense table rows
  const filteredExpenses = useMemo(() => {
    const q = normText(expenseSearch);
    return allExpensesInPeriod.filter((e) => {
      if (bucketFilter !== 'ALL' && e.bucket !== bucketFilter) return false;
      if (q) {
        const hay = normText(`${e.concepto} ${e.subcategoria} ${e.referencia || ''} ${e.fecha}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allExpensesInPeriod, bucketFilter, expenseSearch]);

  const conflictingRevenues = useMemo(
    () => revenueItems.filter((r) => r.hasConflict),
    [revenueItems]
  );

  return (
    <div className="space-y-5">
      {/* Top Controls Bar: Inner Sub-tabs + Period Range Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#0F1115] p-3 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setInnerTab('CURVA')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              innerTab === 'CURVA'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'bg-[#16191F] text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Curva & Rentabilidad</span>
          </button>
          <button
            type="button"
            onClick={() => setInnerTab('SUELDOS')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              innerTab === 'SUELDOS'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'bg-[#16191F] text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Personal / Sueldos ({machinePayrollRows.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setInnerTab('GASTOS')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              innerTab === 'GASTOS'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'bg-[#16191F] text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Gastos & Fijos ({allExpensesInPeriod.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setInnerTab('PRECIOS')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              innerTab === 'PRECIOS'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'bg-[#16191F] text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Precios de Venta & Ingresos</span>
            {totals.conflictosCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-mono">
                {totals.conflictosCount}
              </span>
            )}
          </button>
        </div>

        {/* Period Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
          {(
            [
              { id: '6M', label: '6 Meses' },
              { id: '12M', label: '12 Meses' },
              { id: 'YTD', label: 'Este Año' },
              { id: 'ALL', label: 'Todo' },
              { id: 'CUSTOM', label: 'Rango' }
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRangePreset(opt.id)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                rangePreset === opt.id
                  ? 'bg-slate-700 text-amber-400 border border-amber-500/40'
                  : 'bg-[#16191F] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {rangePreset === 'CUSTOM' && (
            <div className="flex items-center gap-1.5 ml-1">
              <input
                type="month"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-[#16191F] border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
              />
              <span className="text-slate-500 text-xs">a</span>
              <input
                type="month"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-[#16191F] border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-[#0F1115] border border-emerald-500/25 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Ingresos Período
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-lg font-bold font-mono text-emerald-400 mt-1">
            {formatCurrency(totals.ingresos)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {allRevenuesInPeriod.length} mov. valorizados
          </p>
        </div>

        <div className="bg-[#0F1115] border border-rose-500/25 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Gastos Totales
            </span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-lg font-bold font-mono text-rose-400 mt-1">
            {formatCurrency(totals.gastos)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {loadingRemote ? 'Cargando sueldos...' : `${allExpensesInPeriod.length} ítems en período`}
          </p>
        </div>

        <div
          className={`bg-[#0F1115] border rounded-xl p-3.5 ${
            totals.neto >= 0 ? 'border-amber-500/35' : 'border-rose-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Resultado Neto
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                totals.neto >= 0
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-rose-500/15 text-rose-400'
              }`}
            >
              {totals.margen >= 0 ? `+${totals.margen}%` : `${totals.margen}%`}
            </span>
          </div>
          <p
            className={`text-lg font-bold font-mono mt-1 ${
              totals.neto >= 0 ? 'text-amber-400' : 'text-rose-400'
            }`}
          >
            {formatCurrency(totals.neto)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Ingresos menos gastos
          </p>
        </div>

        <div className="bg-[#0F1115] border border-pink-500/25 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Fijos Recurrentes
            </span>
            <Repeat className="w-4 h-4 text-pink-400" />
          </div>
          <p className="text-lg font-bold font-mono text-pink-300 mt-1">
            {formatCurrency(totals.fijos)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {fixedExpensesList.filter((f) => f.activo).length} conceptos activos
          </p>
        </div>

        <div className="bg-[#0F1115] border border-slate-800 rounded-xl p-3.5 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Precio Venta Vigente
            </span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-lg font-bold font-mono text-white mt-1">
            {totals.currentGeneralPrice.price > 0
              ? formatCurrency(totals.currentGeneralPrice.price)
              : 'Sin definir'}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate" title={totals.currentGeneralPrice.label}>
            {totals.currentGeneralPrice.label}
          </p>
        </div>
      </div>

      {/* Global Conflict Banner (always visible if there are conflicts between General Price and Document Prices) */}
      {conflictingRevenues.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-white">
                Hay {conflictingRevenues.length} comprobante{conflictingRevenues.length > 1 ? 's' : ''} / parte{conflictingRevenues.length > 1 ? 's' : ''} valorizado{conflictingRevenues.length > 1 ? 's' : ''} con precio distinto a tu Escala General
              </p>
              <p className="text-[11px] text-amber-200/80 mt-0.5">
                ¿Querés que la curva use el <strong>Precio del Documento</strong> o el <strong>Precio General</strong> que cargaste? Podés elegir una regla general o decidir uno por uno.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleApplyAllConflicts('DOCUMENTO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                policy === 'DOCUMENTO'
                  ? 'bg-emerald-500 text-black border-emerald-400'
                  : 'bg-[#16191F] text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20'
              }`}
            >
              Usar Precio del Documento
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleApplyAllConflicts('GENERAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                policy === 'GENERAL'
                  ? 'bg-amber-500 text-black border-amber-400'
                  : 'bg-[#16191F] text-amber-300 border-amber-500/40 hover:bg-amber-500/20'
              }`}
            >
              Usar Precio General
            </button>
            <button
              type="button"
              onClick={() => setInnerTab('PRECIOS')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition cursor-pointer"
            >
              Revisar uno por uno
            </button>
          </div>
        </div>
      )}

      {/* ==================== TAB 1: CURVA & RENTABILIDAD ==================== */}
      {innerTab === 'CURVA' && (
        <div className="space-y-5">
          {/* Category Breakdown Mini Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {(
              [
                { bucket: 'SUELDOS' as ExpenseBucket, amount: totals.sueldos, icon: Users },
                { bucket: 'MANTENIMIENTO' as ExpenseBucket, amount: totals.mantenimiento, icon: Wrench },
                { bucket: 'COMBUSTIBLE' as ExpenseBucket, amount: totals.combustible, icon: Fuel },
                { bucket: 'GENERALES' as ExpenseBucket, amount: totals.generales, icon: Receipt },
                { bucket: 'FIJOS' as ExpenseBucket, amount: totals.fijos, icon: Repeat }
              ]
            ).map(({ bucket, amount, icon: Icon }) => {
              const meta = BUCKET_META[bucket];
              const pct = totals.gastos > 0 ? Math.round((amount / totals.gastos) * 100) : 0;
              return (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => {
                    if (bucket === 'SUELDOS') {
                      setInnerTab('SUELDOS');
                    } else {
                      setBucketFilter(bucket);
                      setInnerTab('GASTOS');
                    }
                  }}
                  className={`text-left p-3 rounded-xl border transition hover:brightness-110 cursor-pointer ${meta.bg} ${meta.border}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-bold uppercase ${meta.text}`}>{meta.label}</span>
                    <Icon className={`w-3.5 h-3.5 ${meta.text}`} />
                  </div>
                  <p className="text-sm font-bold font-mono text-white">{formatCurrency(amount)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{pct}% del gasto total</p>
                </button>
              );
            })}
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Main Curve: Gastos vs Ingresos */}
            <div className="xl:col-span-7 bg-[#0F1115] border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <span>Curva Mensual: Ingresos vs Gastos Totales</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Evolución mensual de facturación/partes valorizados frente a todos los costos de la máquina
                  </p>
                </div>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlySeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="mesLabel" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94A3B8" tick={{ fontSize: 11 }} tickFormatter={formatCompactMoney} width={62} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111827',
                        borderColor: '#334155',
                        borderRadius: '10px',
                        fontSize: '12px'
                      }}
                      formatter={(value: unknown, name: unknown) => [
                        formatCurrency(Number(value || 0)),
                        String(name || '')
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Area
                      type="monotone"
                      dataKey="ingresos"
                      name="Ingresos"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      fill="url(#gradIngresos)"
                    />
                    <Area
                      type="monotone"
                      dataKey="totalGastos"
                      name="Gastos Totales"
                      stroke="#F43F5E"
                      strokeWidth={2.5}
                      fill="url(#gradGastos)"
                    />
                    <Line
                      type="monotone"
                      dataKey="resultadoNeto"
                      name="Resultado Neto"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={{ r: 3, fill: '#F59E0B' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Stacked Bar: Composición Mensual de Gastos */}
            <div className="xl:col-span-5 bg-[#0F1115] border border-slate-800 rounded-xl p-4">
              <div className="mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <span>Composición de Gastos por Mes</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Sueldos, Mantenimiento, Combustible, Generales y Fijos
                </p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlySeries} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="mesLabel" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94A3B8" tick={{ fontSize: 11 }} tickFormatter={formatCompactMoney} width={58} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111827',
                        borderColor: '#334155',
                        borderRadius: '10px',
                        fontSize: '12px'
                      }}
                      formatter={(value: unknown, name: unknown) => [
                        formatCurrency(Number(value || 0)),
                        String(name || '')
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="sueldos" name="Sueldos" stackId="g" fill="#38BDF8" />
                    <Bar dataKey="mantenimiento" name="Mantenimiento" stackId="g" fill="#F97316" />
                    <Bar dataKey="combustible" name="Combustible" stackId="g" fill="#EAB308" />
                    <Bar dataKey="generales" name="Generales" stackId="g" fill="#A855F7" />
                    <Bar dataKey="fijos" name="Fijos" stackId="g" fill="#EC4899" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Monthly Consolidated Table */}
          <div className="bg-[#0F1115] border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Detalle Mensual Consolidado
              </h4>
              {assignedDriver && (
                <span className="text-[11px] text-slate-400">
                  Operador titular: <strong className="text-amber-400">{assignedDriver.nombreApellido}</strong>
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#16191F] text-slate-400 text-[10px] uppercase border-b border-slate-800">
                    <th className="py-2.5 px-3 text-left">Mes</th>
                    <th className="py-2.5 px-2.5 text-right text-emerald-400">Ingresos</th>
                    <th className="py-2.5 px-2.5 text-right text-sky-400">Sueldos</th>
                    <th className="py-2.5 px-2.5 text-right text-orange-400">Mant.</th>
                    <th className="py-2.5 px-2.5 text-right text-yellow-400">Combust.</th>
                    <th className="py-2.5 px-2.5 text-right text-purple-400">Generales</th>
                    <th className="py-2.5 px-2.5 text-right text-pink-400">Fijos</th>
                    <th className="py-2.5 px-2.5 text-right text-rose-400">Total Gastos</th>
                    <th className="py-2.5 px-3 text-right text-amber-400">Neto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {[...monthlySeries].reverse().map((row) => (
                    <tr key={row.ym} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-sans font-bold text-white">{row.mesLabel}</td>
                      <td className="py-2 px-2.5 text-right text-emerald-400 font-semibold">
                        {formatCurrency(row.ingresos)}
                      </td>
                      <td className="py-2 px-2.5 text-right text-slate-300">{formatCurrency(row.sueldos)}</td>
                      <td className="py-2 px-2.5 text-right text-slate-300">{formatCurrency(row.mantenimiento)}</td>
                      <td className="py-2 px-2.5 text-right text-slate-300">{formatCurrency(row.combustible)}</td>
                      <td className="py-2 px-2.5 text-right text-slate-300">{formatCurrency(row.generales)}</td>
                      <td className="py-2 px-2.5 text-right text-pink-300">{formatCurrency(row.fijos)}</td>
                      <td className="py-2 px-2.5 text-right text-rose-400 font-semibold">
                        {formatCurrency(row.totalGastos)}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-bold ${
                          row.resultadoNeto >= 0 ? 'text-amber-400' : 'text-rose-400'
                        }`}
                      >
                        {formatCurrency(row.resultadoNeto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 1b: PERSONAL / SUELDOS (ESTILO OBRAS) ==================== */}
      {innerTab === 'SUELDOS' && (
        <div className="space-y-4">
          {payrollFeedback && (
            <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{payrollFeedback}</span>
              </div>
              <button type="button" onClick={() => setPayrollFeedback(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* KPI Cards (Idéntico a Obras > Personal) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                Operarios en Máquina
              </span>
              <span className="text-xl font-mono font-bold text-white mt-1 block">
                {activePayrollRows.length}
                {machinePayrollRows.length !== activePayrollRows.length && (
                  <span className="text-xs text-slate-500 font-normal ml-1">
                    / {machinePayrollRows.length}
                  </span>
                )}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Jornadas / Días
              </span>
              <span className="text-xl font-mono font-bold text-amber-300 mt-1 block">
                {payrollTotals.dias} d
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                Horas Trabajadas
              </span>
              <span className="text-xl font-mono font-bold text-cyan-300 mt-1 block">
                {payrollTotals.horas.toFixed(1)} hs
              </span>
            </div>

            <div className="bg-slate-900/80 border border-blue-500/30 rounded-xl p-3.5">
              <span className="text-[11px] uppercase tracking-wider text-blue-300 font-bold block">
                Costo Proporcional Máquina
              </span>
              <span className="text-xl font-mono font-bold text-blue-400 mt-1 block">
                {formatCurrency(payrollTotals.costo)}
              </span>
            </div>
          </div>

          {/* Search & Base Sueldos Selector */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={payrollSearch}
                onChange={(e) => setPayrollSearch(e.target.value)}
                placeholder="Buscar operario, categoría u obra operada..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Base Sueldos:</span>
              <select
                value={sueldosCfg.modoCalculoSueldos}
                disabled={saving}
                onChange={(e) =>
                  persistSueldosConfig(
                    {
                      ...sueldosCfg,
                      modoCalculoSueldos: e.target.value as NonNullable<
                        VehicleSueldosConfig['modoCalculoSueldos']
                      >
                    },
                    'Modo de cálculo de sueldos actualizado en Supabase.'
                  )
                }
                className="bg-slate-950 border border-blue-500/40 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-200 cursor-pointer"
              >
                <option value="LIQUIDACION_TOTAL">
                  Liquidación Real Total ÷ {sueldosCfg.diasLaborablesMes} días
                </option>
                <option value="LIQUIDACION_BASICO">
                  Solo Básico Planilla ÷ {sueldosCfg.diasLaborablesMes} días
                </option>
                <option value="JORNAL_BASE_SHEET">Valor Base Unidad ($60.000/día)</option>
                <option value="REFERENCIA_MANUAL">
                  Referencia Manual ({formatCurrency(sueldosCfg.sueldoMensualDefault)})
                </option>
              </select>
              {saving && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
            </div>
          </div>

          {/* Obras-Style Personal Table */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
            {filteredPayrollRows.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No se encontraron operarios registrados en los partes de esta máquina para el período seleccionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/90 border-b border-slate-800 text-[11px] uppercase text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">Inc.</th>
                      <th className="py-2.5 px-3">Operario / Categoría</th>
                      <th className="py-2.5 px-3">Obras Operadas</th>
                      <th className="py-2.5 px-3 text-center">Días / Hs / Viajes</th>
                      <th className="py-2.5 px-3">Fuente Tarifa (Liquidación Real)</th>
                      <th className="py-2.5 px-3 text-right">Valor Aplicado</th>
                      <th className="py-2.5 px-3 text-right">Proporcional Máquina</th>
                      <th className="py-2.5 px-3 text-right">Ajustar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredPayrollRows.map((s) => {
                      const isEditing = editingPayrollKey === s.empleadoKey;
                      return (
                        <tr
                          key={s.excludeKey}
                          className={`hover:bg-slate-800/30 transition ${
                            s.excluded ? 'opacity-40 line-through' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={!s.excluded}
                              disabled={saving}
                              onChange={() => handleTogglePayrollExclude(s.excludeKey)}
                              className="accent-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="text-white font-semibold">{s.empleadoNombre}</div>
                            <div className="text-[10px] text-slate-400">{s.categoriaNombre}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            {s.obrasOperadas.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {s.obrasOperadas.slice(0, 3).map((ob) => (
                                  <span
                                    key={ob}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-200"
                                  >
                                    <Building2 className="w-2.5 h-2.5 text-amber-400" />
                                    {ob}
                                  </span>
                                ))}
                                {s.obrasOperadas.length > 3 && (
                                  <span className="text-[10px] text-slate-400">
                                    +{s.obrasOperadas.length - 3} más
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Sin obra asignada</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                            <div>
                              <span className="text-amber-300 font-bold">{s.diasTrabajados} d</span>
                              <span className="text-slate-500"> / {s.horasTrabajadas.toFixed(1)} hs</span>
                              {s.viajes > 0 && (
                                <span className="text-blue-300 ml-1">• {s.viajes} vj</span>
                              )}
                            </div>
                            {s.minDate && (
                              <div className="text-[10px] text-slate-500">
                                {s.minDate === s.maxDate
                                  ? s.minDate
                                  : `${s.minDate} → ${s.maxDate}`}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="text-emerald-300 font-semibold">{s.fuenteTarifa}</div>
                            {(s.sueldoMensualLiquidado || s.sueldoBasicoPlanilla) && (
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                {s.sueldoBasicoPlanilla
                                  ? `Básico: ${formatCurrency(s.sueldoBasicoPlanilla)}/mes`
                                  : ''}
                                {s.sueldoMensualLiquidado &&
                                s.sueldoMensualLiquidado !== s.sueldoBasicoPlanilla
                                  ? ` • Total: ${formatCurrency(s.sueldoMensualLiquidado)}/mes`
                                  : ''}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-200 whitespace-nowrap">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <select
                                  value={editPayrollModo}
                                  onChange={(e) => setEditPayrollModo(e.target.value as 'DIA' | 'HORA')}
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
                                {formatCurrency(s.tarifaAplicada)} /{' '}
                                {s.modoCalculo === 'HORA' ? 'hs' : 'día'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-300 whitespace-nowrap">
                            {formatCurrency(s.montoTotal)}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => handleSavePayrollOverride(s.empleadoKey)}
                                  className="px-2 py-1 bg-blue-500 hover:bg-blue-400 text-white rounded text-[11px] font-bold cursor-pointer"
                                >
                                  Guardar
                                </button>
                                {s.hasOverride && (
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => handleClearPayrollOverride(s.empleadoKey)}
                                    title="Volver a Liquidación Real"
                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded text-[11px] cursor-pointer"
                                  >
                                    Auto
                                  </button>
                                )}
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
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
                              >
                                Editar tarifa
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
        </div>
      )}

      {/* ==================== TAB 2: GASTOS & FIJOS MENSUALES ==================== */}
      {innerTab === 'GASTOS' && (
        <div className="space-y-5">
          {/* Gastos Fijos / Recurrentes Manager */}
          <div className="bg-[#0F1115] border border-pink-500/30 rounded-xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-pink-400 flex items-center gap-2">
                  <Repeat className="w-4 h-4" />
                  <span>Gastos Fijos y Recurrentes de esta Máquina</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Agregá gastos fijos como Lavadero, Seguro, GPS, Patente o Cochera. Si dejás &quot;Hasta&quot; vacío, se repiten automáticamente todos los meses.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (showFixedForm) resetFixedForm();
                  else setShowFixedForm(true);
                }}
                className="px-3.5 py-2 rounded-lg bg-pink-500 hover:bg-pink-400 text-black font-bold text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {showFixedForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{showFixedForm ? 'Cancelar' : 'Agregar Gasto Fijo'}</span>
              </button>
            </div>

            {/* Add / Edit Fixed Expense Form */}
            {showFixedForm && (
              <form
                onSubmit={handleSaveFixedExpense}
                className="bg-[#16191F] border border-slate-700 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
              >
                <div className="lg:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Concepto *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Lavadero completo, Seguro, GPS..."
                    value={fixedConcepto}
                    onChange={(e) => setFixedConcepto(e.target.value)}
                    className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-pink-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Categoría
                  </label>
                  <select
                    value={fixedCategoria}
                    onChange={(e) => setFixedCategoria(e.target.value as VehicleFixedExpenseCategory)}
                    className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-pink-500 outline-none"
                  >
                    {(Object.keys(FIXED_CATEGORY_LABELS) as VehicleFixedExpenseCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {FIXED_CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Monto ($) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    placeholder="Ej: 45000"
                    value={fixedMonto}
                    onChange={(e) => setFixedMonto(e.target.value)}
                    className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:border-pink-500 outline-none"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Frecuencia / Repetición
                  </label>
                  <select
                    value={fixedFrecuencia}
                    onChange={(e) => setFixedFrecuencia(e.target.value as VehicleFixedExpenseFrequency)}
                    className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-pink-500 outline-none"
                  >
                    {(Object.keys(FIXED_FREQ_LABELS) as VehicleFixedExpenseFrequency[]).map((f) => (
                      <option key={f} value={f}>
                        {FIXED_FREQ_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Desde (Mes) *
                  </label>
                  <input
                    type="month"
                    required
                    value={fixedInicio}
                    onChange={(e) => setFixedInicio(e.target.value)}
                    className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-pink-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Hasta (Opcional)
                  </label>
                  <input
                    type="month"
                    value={fixedFin}
                    onChange={(e) => setFixedFin(e.target.value)}
                    className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-pink-500 outline-none"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Observaciones (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Proveedor, póliza o nota..."
                    value={fixedObs}
                    onChange={(e) => setFixedObs(e.target.value)}
                    className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-pink-500 outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{editingFixedId ? 'Actualizar' : 'Guardar Fijo'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Existing Fixed Expenses List */}
            {fixedExpensesList.length === 0 ? (
              <div className="text-xs text-slate-400 bg-[#16191F] border border-dashed border-slate-800 rounded-lg p-3.5 text-center">
                Todavía no cargaste gastos fijos recurrentes para esta máquina (ej. Lavadero, Seguro, GPS).
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {fixedExpensesList.map((fx) => (
                  <div
                    key={fx.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                      fx.activo
                        ? 'bg-[#16191F] border-slate-700'
                        : 'bg-[#16191F]/40 border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white truncate">{fx.concepto}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-300 border border-pink-500/30">
                          {FIXED_CATEGORY_LABELS[fx.categoria]}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        <span className="font-mono font-bold text-pink-300">{formatCurrency(fx.monto)}</span>
                        {' • '}
                        {FIXED_FREQ_LABELS[fx.frecuencia]}
                        {' • '}
                        Desde <span className="font-mono text-slate-300">{fx.fechaInicio}</span>
                        {fx.fechaFin ? ` hasta ${fx.fechaFin}` : ' (en adelante)'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleFixedActive(fx.id)}
                        title={fx.activo ? 'Pausar gasto fijo' : 'Activar gasto fijo'}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                      >
                        {fx.activo ? (
                          <ToggleRight className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-4 h-4 text-slate-500" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditFixed(fx)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-black text-slate-300 cursor-pointer"
                        title="Editar"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFixed(fx.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500 hover:text-white text-slate-300 cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All Associated Expenses Ledger */}
          <div className="bg-[#0F1115] border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-3.5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
                <button
                  type="button"
                  onClick={() => setBucketFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                    bucketFilter === 'ALL'
                      ? 'bg-amber-500 text-black'
                      : 'bg-[#16191F] text-slate-300 border border-slate-800'
                  }`}
                >
                  Todos ({allExpensesInPeriod.length})
                </button>
                {(Object.keys(BUCKET_META) as ExpenseBucket[]).map((b) => {
                  const count =
                    b === 'SUELDOS'
                      ? machinePayrollRows.length
                      : allExpensesInPeriod.filter((e) => e.bucket === b).length;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBucketFilter(b)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border ${
                        bucketFilter === b
                          ? `${BUCKET_META[b].bg} ${BUCKET_META[b].text} ${BUCKET_META[b].border}`
                          : 'bg-[#16191F] text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {BUCKET_META[b].label} ({count})
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                placeholder="Buscar concepto, operario o comprobante..."
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                className="bg-[#16191F] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white w-full md:w-64 outline-none focus:border-amber-500"
              />
            </div>

            {bucketFilter === 'SUELDOS' ? (
              <div className="p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-3.5 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Users className="w-4 h-4 text-sky-400" />
                    <span>
                      Total Sueldos Proporcionales en período:{' '}
                      <strong className="font-mono text-blue-300">{formatCurrency(payrollTotals.costo)}</strong>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Base Sueldos:</span>
                    <select
                      value={sueldosCfg.modoCalculoSueldos}
                      disabled={saving}
                      onChange={(e) =>
                        persistSueldosConfig(
                          {
                            ...sueldosCfg,
                            modoCalculoSueldos: e.target.value as NonNullable<
                              VehicleSueldosConfig['modoCalculoSueldos']
                            >
                          },
                          'Modo de cálculo de sueldos actualizado en Supabase.'
                        )
                      }
                      className="bg-slate-950 border border-blue-500/40 rounded-lg px-2.5 py-1 text-xs font-bold text-blue-200 cursor-pointer"
                    >
                      <option value="LIQUIDACION_TOTAL">
                        Liquidación Real Total ÷ {sueldosCfg.diasLaborablesMes} días
                      </option>
                      <option value="LIQUIDACION_BASICO">
                        Solo Básico Planilla ÷ {sueldosCfg.diasLaborablesMes} días
                      </option>
                      <option value="JORNAL_BASE_SHEET">Valor Base Unidad ($60.000/día)</option>
                      <option value="REFERENCIA_MANUAL">
                        Referencia Manual ({formatCurrency(sueldosCfg.sueldoMensualDefault)})
                      </option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/90 border-b border-slate-800 text-[11px] uppercase text-slate-400">
                      <tr>
                        <th className="py-2.5 px-3">Inc.</th>
                        <th className="py-2.5 px-3">Operario / Categoría</th>
                        <th className="py-2.5 px-3">Obras Operadas</th>
                        <th className="py-2.5 px-3 text-center">Días / Hs / Viajes</th>
                        <th className="py-2.5 px-3">Fuente Tarifa (Liquidación Real)</th>
                        <th className="py-2.5 px-3 text-right">Valor Aplicado</th>
                        <th className="py-2.5 px-3 text-right">Proporcional Máquina</th>
                        <th className="py-2.5 px-3 text-right">Ajustar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {machinePayrollRows
                        .filter((r) => {
                          const q = normText(expenseSearch);
                          if (!q) return true;
                          return normText(
                            `${r.empleadoNombre} ${r.categoriaNombre} ${r.fuenteTarifa} ${r.obrasOperadas.join(' ')}`
                          ).includes(q);
                        })
                        .map((s) => {
                          const isEditing = editingPayrollKey === s.empleadoKey;
                          return (
                            <tr
                              key={s.excludeKey}
                              className={`hover:bg-slate-800/30 transition ${
                                s.excluded ? 'opacity-40 line-through' : ''
                              }`}
                            >
                              <td className="py-2.5 px-3">
                                <input
                                  type="checkbox"
                                  checked={!s.excluded}
                                  disabled={saving}
                                  onChange={() => handleTogglePayrollExclude(s.excludeKey)}
                                  className="accent-blue-500 cursor-pointer"
                                />
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="text-white font-semibold">{s.empleadoNombre}</div>
                                <div className="text-[10px] text-slate-400">{s.categoriaNombre}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                {s.obrasOperadas.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {s.obrasOperadas.slice(0, 3).map((ob) => (
                                      <span
                                        key={ob}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-200"
                                      >
                                        <Building2 className="w-2.5 h-2.5 text-amber-400" />
                                        {ob}
                                      </span>
                                    ))}
                                    {s.obrasOperadas.length > 3 && (
                                      <span className="text-[10px] text-slate-400">
                                        +{s.obrasOperadas.length - 3} más
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-500 text-[11px]">Sin obra asignada</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                                <div>
                                  <span className="text-amber-300 font-bold">{s.diasTrabajados} d</span>
                                  <span className="text-slate-500"> / {s.horasTrabajadas.toFixed(1)} hs</span>
                                  {s.viajes > 0 && (
                                    <span className="text-blue-300 ml-1">• {s.viajes} vj</span>
                                  )}
                                </div>
                                {s.minDate && (
                                  <div className="text-[10px] text-slate-500">
                                    {s.minDate === s.maxDate
                                      ? s.minDate
                                      : `${s.minDate} → ${s.maxDate}`}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="text-emerald-300 font-semibold">{s.fuenteTarifa}</div>
                                {(s.sueldoMensualLiquidado || s.sueldoBasicoPlanilla) && (
                                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                    {s.sueldoBasicoPlanilla
                                      ? `Básico: ${formatCurrency(s.sueldoBasicoPlanilla)}/mes`
                                      : ''}
                                    {s.sueldoMensualLiquidado &&
                                    s.sueldoMensualLiquidado !== s.sueldoBasicoPlanilla
                                      ? ` • Total: ${formatCurrency(s.sueldoMensualLiquidado)}/mes`
                                      : ''}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-200 whitespace-nowrap">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <select
                                      value={editPayrollModo}
                                      onChange={(e) => setEditPayrollModo(e.target.value as 'DIA' | 'HORA')}
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
                                    {formatCurrency(s.tarifaAplicada)} /{' '}
                                    {s.modoCalculo === 'HORA' ? 'hs' : 'día'}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-300 whitespace-nowrap">
                                {formatCurrency(s.montoTotal)}
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() => handleSavePayrollOverride(s.empleadoKey)}
                                      className="px-2 py-1 bg-blue-500 hover:bg-blue-400 text-white rounded text-[11px] font-bold cursor-pointer"
                                    >
                                      Guardar
                                    </button>
                                    {s.hasOverride && (
                                      <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => handleClearPayrollOverride(s.empleadoKey)}
                                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded text-[11px] cursor-pointer"
                                      >
                                        Auto
                                      </button>
                                    )}
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
                                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
                                  >
                                    Editar tarifa
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      {machinePayrollRows.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500">
                            No se encontraron operarios registrados en los partes de esta máquina en el período seleccionado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#16191F] z-10">
                    <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                      <th className="py-2.5 px-3 text-left">Fecha</th>
                      <th className="py-2.5 px-3 text-left">Rubro</th>
                      <th className="py-2.5 px-3 text-left">Detalle / Concepto</th>
                      <th className="py-2.5 px-3 text-left">Referencia</th>
                      <th className="py-2.5 px-3 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No se encontraron gastos asociados a esta máquina en el período seleccionado.
                        </td>
                      </tr>
                    ) : (
                      filteredExpenses.map((e) => {
                        const meta = BUCKET_META[e.bucket];
                        return (
                          <tr key={e.id} className="hover:bg-slate-800/30">
                            <td className="py-2 px-3 font-mono text-slate-300 whitespace-nowrap">
                              {formatDateAr(e.fecha)}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${meta.bg} ${meta.text} ${meta.border}`}
                              >
                                {meta.label}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-200">
                              <span className="font-medium">{e.concepto}</span>
                              {e.estimado && (
                                <span className="ml-1.5 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  Estimado
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-400 text-[11px]">{e.referencia || e.subcategoria}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-rose-400 whitespace-nowrap">
                              {formatCurrency(e.monto)}
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
        </div>
      )}

      {/* ==================== TAB 3: PRECIOS DE VENTA & INGRESOS ==================== */}
      {innerTab === 'PRECIOS' && (
        <div className="space-y-5">
          {/* Interactive Confirmation Modal/Prompt when saving a new General Sale Price with existing valorized docs */}
          {pendingPriceConfirmation && (
            <div className="bg-amber-950/50 border-2 border-amber-500 rounded-xl p-4 space-y-3 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500 text-black flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-white">
                    ¿Querés usar el Precio General nuevo o mantener el Precio de cada Documento?
                  </h4>
                  <p className="text-xs text-amber-200/90 mt-1">
                    Estás cargando un Precio General de{' '}
                    <strong className="font-mono text-amber-300">
                      {formatCurrency(pendingPriceConfirmation.entry.precioUnitario)} / {pendingPriceConfirmation.entry.unidad}
                    </strong>{' '}
                    vigente desde <strong className="font-mono">{formatDateAr(pendingPriceConfirmation.entry.fechaDesde)}</strong>.
                    Detectamos <strong>{pendingPriceConfirmation.affectedDocs.length}</strong> documentos o partes valorizados desde esa fecha que ya tienen un precio propio cargado (Resúmenes Valorizados, Contratos, Facturas o Partes).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingPriceConfirmation(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    commitSalePriceEntry(
                      pendingPriceConfirmation.entry,
                      pendingPriceConfirmation.isEdit,
                      'GENERAL',
                      pendingPriceConfirmation.affectedDocs
                    )
                  }
                  className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition cursor-pointer"
                >
                  Aplicar Precio General ({formatCurrency(pendingPriceConfirmation.entry.precioUnitario)}) en esos {pendingPriceConfirmation.affectedDocs.length} docs
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    commitSalePriceEntry(
                      pendingPriceConfirmation.entry,
                      pendingPriceConfirmation.isEdit,
                      'DOCUMENTO',
                      pendingPriceConfirmation.affectedDocs
                    )
                  }
                  className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition cursor-pointer"
                >
                  Mantener Precio del Documento en esos {pendingPriceConfirmation.affectedDocs.length} docs
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    commitSalePriceEntry(pendingPriceConfirmation.entry, pendingPriceConfirmation.isEdit)
                  }
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition cursor-pointer"
                >
                  Guardar y decidir uno por uno abajo
                </button>
              </div>
            </div>
          )}

          {/* Price History Schedule Builder */}
          <div className="bg-[#0F1115] border border-amber-500/30 rounded-xl p-4 space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                <span>Escala Histórica de Precio de Venta por Vigencia</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Ej: cargás $80.000 en Marzo (rige de Marzo en adelante) y luego $85.000 en Junio (rige de Junio en adelante). También se puede actualizar directo desde Resúmenes Valorizados, Contratos y Facturas.
              </p>
            </div>

            <form
              onSubmit={handleSubmitSalePrice}
              className="bg-[#16191F] border border-slate-800 rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3"
            >
              <div className="lg:col-span-3">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Vigente Desde (Fecha) *
                </label>
                <input
                  type="date"
                  required
                  value={priceFechaDesde}
                  onChange={(e) => setPriceFechaDesde(e.target.value)}
                  className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Precio de Venta ($) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="Ej: 80000"
                  value={priceValor}
                  onChange={(e) => setPriceValor(e.target.value)}
                  className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Unidad
                </label>
                <select
                  value={priceUnidad}
                  onChange={(e) => setPriceUnidad(e.target.value as VehicleSalePriceUnit)}
                  className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:border-amber-500 outline-none"
                >
                  <option value="HORA">Por Hora</option>
                  <option value="DIA">Por Día</option>
                  <option value="VIAJE">Por Viaje</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Nota (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Ajuste Junio"
                  value={priceNota}
                  onChange={(e) => setPriceNota(e.target.value)}
                  className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="lg:col-span-2 flex items-end gap-1.5">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editingPriceId ? 'Actualizar' : 'Cargar Precio'}</span>
                </button>
                {editingPriceId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPriceId(null);
                      setPriceValor('');
                      setPriceNota('');
                    }}
                    className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </form>

            {/* Step-function Validity Timeline */}
            {priceSchedule.length === 0 ? (
              <div className="text-xs text-slate-400 bg-[#16191F] border border-dashed border-slate-800 rounded-lg p-3.5 text-center">
                No hay escala histórica cargada todavía. Se está usando la tarifa base de la ficha ({formatCurrency(vehicle.precioSugeridoHora || vehicle.precioSugerido || 0)}).
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {priceSchedule.map((entry, idx) => {
                  const nextSameUnit = priceSchedule.slice(idx + 1).find((n) => n.unidad === entry.unidad);
                  return (
                    <div
                      key={entry.id}
                      className="p-3 rounded-xl bg-[#16191F] border border-slate-700/80 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-sm font-bold text-amber-400">
                            {formatCurrency(entry.precioUnitario)}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            / {entry.unidad}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            {entry.origen === 'MANUAL' ? 'Manual' : entry.origen.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-1 font-mono">
                          {formatDateAr(entry.fechaDesde)} →{' '}
                          {nextSameUnit ? (
                            <span className="text-slate-400">antes de {formatDateAr(nextSameUnit.fechaDesde)}</span>
                          ) : (
                            <span className="text-emerald-400 font-bold">Vigente hoy</span>
                          )}
                        </p>
                        {(entry.nota || entry.documentoRef) && (
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {entry.documentoRef ? `${entry.documentoRef} • ` : ''}
                            {entry.nota || ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPriceId(entry.id);
                            setPriceFechaDesde(entry.fechaDesde);
                            setPriceValor(String(entry.precioUnitario));
                            setPriceUnidad(entry.unidad);
                            setPriceNota(entry.nota || '');
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-black text-slate-300 cursor-pointer"
                          title="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSalePrice(entry.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500 hover:text-white text-slate-300 cursor-pointer"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Auto-Detected Prices from Resúmenes Valorizados, Contratos, Facturas ARCA */}
          {detectedDocPrices.length > 0 && (
            <div className="bg-[#0F1115] border border-cyan-500/30 rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    <span>Precios Detectados en Documentos ({detectedDocPrices.length})</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Encontramos tarifas reales en Resúmenes Valorizados, Contratos de Alquiler, Facturas ARCA o Partes que aún no están en tu escala general.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSyncAllDetectedPrices}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sincronizar Todos a la Escala</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {detectedDocPrices.slice(0, 9).map((det) => (
                  <div
                    key={det.key}
                    className="p-2.5 rounded-lg bg-[#16191F] border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-cyan-300">
                          {formatCurrency(det.precioUnitario)} / {det.unidad}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {formatDateAr(det.fecha)}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        {det.documentoRef} • {det.clienteObra}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleAdoptDocumentPrice(det)}
                      className="px-2 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500 hover:text-black text-cyan-300 border border-cyan-500/40 text-[10px] font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                      <span>Adoptar</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Revenue Documents Ledger with Per-Row "Precio del Documento vs Precio General" Toggle */}
          <div className="bg-[#0F1115] border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-3.5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Partes Diarios Valorizados de la Máquina ({allRevenuesInPeriod.length})</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Solo se contabilizan los <strong>Partes Diarios</strong> de esta máquina. Los Resúmenes Valorizados, Contratos y Facturas se usan únicamente para tomar el precio de cada parte (elegí entre <strong>Precio del Documento</strong> o <strong>Precio General</strong>).
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Regla Default:</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleChangePolicy('DOCUMENTO')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border ${
                    policy === 'DOCUMENTO'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                      : 'bg-[#16191F] text-slate-400 border-slate-800'
                  }`}
                >
                  Documento
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleChangePolicy('GENERAL')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border ${
                    policy === 'GENERAL'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-[#16191F] text-slate-400 border-slate-800'
                  }`}
                >
                  Precio General
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#16191F] z-10">
                  <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                    <th className="py-2.5 px-3 text-left">Fecha</th>
                    <th className="py-2.5 px-3 text-left">Parte / Origen Precio</th>
                    <th className="py-2.5 px-3 text-left">Cliente / Obra</th>
                    <th className="py-2.5 px-2 text-right">Cant.</th>
                    <th className="py-2.5 px-3 text-center">¿Precio Doc o General?</th>
                    <th className="py-2.5 px-3 text-right">Total Aplicado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {allRevenuesInPeriod.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No hay partes diarios registrados para esta máquina en el período seleccionado.
                      </td>
                    </tr>
                  ) : (
                    allRevenuesInPeriod.map((r) => {
                      const badge = SOURCE_BADGE[r.sourceType];
                      return (
                        <tr
                          key={r.docKey}
                          className={`hover:bg-slate-800/30 ${
                            r.hasConflict ? 'bg-amber-500/[0.03]' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                            {formatDateAr(r.fecha)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badge.cls}`}>
                                {badge.label}
                              </span>
                              <span className="font-mono text-[11px] text-white font-semibold">
                                {r.documentoRef}
                              </span>
                            </div>
                            {r.linkedFacturaNum && (
                              <span className="text-[10px] text-emerald-400 block mt-0.5">
                                Factura: {r.linkedFacturaNum}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-slate-200 truncate max-w-[200px]">{r.clienteObra}</p>
                            <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{r.detalle}</p>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-300 whitespace-nowrap">
                            {Number(r.cantidad.toFixed(2))} {r.unidad === 'HORA' ? 'h' : r.unidad === 'DIA' ? 'd' : 'v'}
                          </td>
                          <td className="py-2.5 px-3">
                            {r.docUnitPrice > 0 ? (
                              <div className="flex items-center justify-center gap-1 flex-wrap">
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => handleToggleDocOverride(r.docKey, 'DOCUMENTO')}
                                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold border transition cursor-pointer ${
                                    r.effectiveMode === 'DOCUMENTO'
                                      ? 'bg-emerald-500 text-black border-emerald-400'
                                      : 'bg-[#16191F] text-slate-400 border-slate-700 hover:text-white'
                                  }`}
                                  title="Usar precio propio del documento"
                                >
                                  Doc: {formatCurrency(r.docUnitPrice)}
                                </button>
                                <button
                                  type="button"
                                  disabled={saving || r.generalUnitPrice <= 0}
                                  onClick={() => handleToggleDocOverride(r.docKey, 'GENERAL')}
                                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold border transition cursor-pointer disabled:opacity-40 ${
                                    r.effectiveMode === 'GENERAL'
                                      ? 'bg-amber-500 text-black border-amber-400'
                                      : 'bg-[#16191F] text-slate-400 border-slate-700 hover:text-white'
                                  }`}
                                  title={r.generalPriceLabel}
                                >
                                  Gral: {r.generalUnitPrice > 0 ? formatCurrency(r.generalUnitPrice) : 'S/D'}
                                </button>
                              </div>
                            ) : (
                              <div className="text-center">
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                  Gral: {r.generalUnitPrice > 0 ? formatCurrency(r.generalUnitPrice) : 'Sin precio'}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                            {formatCurrency(r.effectiveTotal)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
