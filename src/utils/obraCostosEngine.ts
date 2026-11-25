import {
  Obra,
  ObraCostosConfig,
  ObraFacturaLegajo,
  ObraPeriodoContenedor,
  ParteDiario,
  RentalContract,
  FuelDispensary,
  StockMovement,
  StockItem,
  VehicleServiceLog,
  VehicleExpenseLog,
  Vehicle,
  Employee,
  SupabaseUsuario,
  SupabaseCategoria,
  ArcaInvoice,
  CustomerPaymentReceipt
} from '../types';
import {
  PayrollPeriodRecord,
  matchPayrollSlipToEmployee,
  getEmployeeBankTokenKey
} from './payrollParser';
import { resolveFacturaLegajoLiveStatus } from './obraLegajoResolver';

const MONTH_NAME_TO_NUM: Record<string, string> = {
  ENERO: '01',
  FEBRERO: '02',
  MARZO: '03',
  ABRIL: '04',
  MAYO: '05',
  JUNIO: '06',
  JUNIOO: '06',
  JULIO: '07',
  AGOSTO: '08',
  SEPTIEMBRE: '09',
  SETIEMBRE: '09',
  OCTUBRE: '10',
  NOVIEMBRE: '11',
  DICIEMBRE: '12'
};

function extractYearMonthFromPeriodName(periodName?: string): string {
  const raw = (periodName || '').toUpperCase();
  let monthNum = '';
  for (const [mName, mNum] of Object.entries(MONTH_NAME_TO_NUM)) {
    if (raw.includes(mName)) {
      monthNum = mNum;
      break;
    }
  }
  const yearMatch = raw.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : '2026';
  return monthNum ? `${year}-${monthNum}` : '';
}

export const normalizeObraDateKey = (dStr?: string): string => {
  if (!dStr) return '';
  const clean = dStr.trim();
  if (!clean) return '';
  if (clean.includes('T')) {
    return clean.split('T')[0];
  }
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) year = `20${year}`;
      return `${year}-${month}-${day}`;
    }
  } else if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return clean;
};

const norm = (s?: string) => (s ? s.trim().toUpperCase().replace(/\s+/g, ' ') : '');
const alpha = (s?: string) => (s ? s.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '');

export const isSpecialPlate = (p?: string) => {
  const u = norm(p);
  return !u || u === 'S/P' || u === 'SP' || u === 'SIN PATENTE' || u === 'SINPATENTE' || u === '0000' || u === '000000';
};

export const expandDateRange = (startStr?: string, endStr?: string, maxDays = 180): string[] => {
  const sKey = normalizeObraDateKey(startStr);
  const eKey = normalizeObraDateKey(endStr) || sKey;
  if (!sKey || !/^\d{4}-\d{2}-\d{2}$/.test(sKey)) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eKey)) return [sKey];

  const start = new Date(`${sKey}T00:00:00`);
  const end = new Date(`${eKey}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [sKey];

  const dates: string[] = [];
  const cur = new Date(start);
  let guard = 0;
  while (cur <= end && guard < maxDays) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return dates;
};

export const findMatchingVehicle = (
  record: {
    vehicleId?: string;
    equipoId?: string;
    codigoEquipo?: string;
    equipoCodigoOrPatente?: string;
    marcaModelo?: string;
    equipoModeloMarca?: string;
    patente?: string;
    equipoPatenteOrCodigo?: string;
  },
  fleet: Vehicle[]
): Vehicle | undefined => {
  const rId = norm(record.vehicleId || record.equipoId);
  const rEq = norm(record.codigoEquipo || record.equipoCodigoOrPatente);
  const rModel = norm(record.marcaModelo || record.equipoModeloMarca);
  const rPat = norm(record.patente || record.equipoPatenteOrCodigo);
  const rEqA = alpha(rEq);
  const rPatA = alpha(rPat);

  return fleet.find((v) => {
    const vId = norm(v.id);
    const vCode = norm(v.codigoInterno);
    const vEqCode = norm(v.codigo || v.codigoEquipo);
    const vModel = norm(v.modeloMarca);
    const vPat = norm(v.patente);
    const vPatA = alpha(v.patente);

    if (rId && (rId === vId || alpha(rId) === alpha(vId))) return true;
    if (rEq && (rEq === vId || rEq === vCode || rEq === vEqCode || rEq === vModel)) return true;
    if (rModel && vModel && (rModel === vModel || rModel === vCode)) return true;
    if (!isSpecialPlate(vPat)) {
      if (rPat && !isSpecialPlate(rPat) && (rPat === vPat || (rPatA.length >= 4 && rPatA === vPatA))) return true;
      if (rEq && !isSpecialPlate(rEq) && (rEq === vPat || (rEqA.length >= 4 && rEqA === vPatA))) return true;
    }
    return false;
  });
};

export const matchRecordToVehicleKey = (
  record: {
    vehicleId?: string;
    equipoId?: string;
    codigoEquipo?: string;
    equipoCodigoOrPatente?: string;
    marcaModelo?: string;
    equipoModeloMarca?: string;
    patente?: string;
    equipoPatenteOrCodigo?: string;
  },
  targetKeys: Set<string>,
  fleet: Vehicle[]
): { matched: boolean; label: string } => {
  const matchedVeh = findMatchingVehicle(record, fleet);
  if (matchedVeh && targetKeys.has(`VEH:${matchedVeh.id}`)) {
    return {
      matched: true,
      label: `${matchedVeh.modeloMarca}${matchedVeh.codigoInterno ? ` (${matchedVeh.codigoInterno})` : ''}`
    };
  }
  const candidates = [
    norm(record.vehicleId),
    norm(record.equipoId),
    norm(record.codigoEquipo),
    norm(record.equipoCodigoOrPatente),
    norm(record.marcaModelo),
    norm(record.equipoModeloMarca),
    !isSpecialPlate(record.patente) ? norm(record.patente) : '',
    !isSpecialPlate(record.equipoPatenteOrCodigo) ? norm(record.equipoPatenteOrCodigo) : ''
  ].filter(Boolean);

  for (const c of candidates) {
    if (targetKeys.has(`RAW:${c}`) || (alpha(c).length >= 3 && targetKeys.has(`ALPHA:${alpha(c)}`))) {
      return {
        matched: true,
        label: record.marcaModelo || record.equipoModeloMarca || record.codigoEquipo || c
      };
    }
  }
  return { matched: false, label: '' };
};

export interface AutoDetectedFuelCost {
  excludeKey: string;
  voucherId: string;
  fecha: string;
  equipoLabel: string;
  tipoCombustible: string;
  litros: number;
  litrosTotalesCarga?: number;
  proporcionObra?: number;
  partesObraEnTramo?: number;
  partesTotalesEnTramo?: number;
  horasObraEnTramo?: number;
  horasTotalesEnTramo?: number;
  obrasEnTramo?: string[];
  horometroLectura?: number;
  horasHorometroCarga?: number;
  horasHorometroObra?: number;
  precioUnitario: number;
  monto: number;
  deposito: string;
  excluded: boolean;
}

export interface AutoDetectedLubricantOrInsumoCost {
  excludeKey: string;
  source: 'STOCK_PANOL' | 'GASTO_LUBRICANTE' | 'INSUMO_SERVICE';
  fecha: string;
  equipoLabel: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  monto: number;
  excluded: boolean;
}

export interface AutoDetectedRepairCost {
  excludeKey: string;
  source: 'SERVICE_TALLER' | 'GASTO_EQUIPO';
  fecha: string;
  equipoLabel: string;
  concepto: string;
  proveedorOrMecanico: string;
  monto: number;
  excluded: boolean;
}

export interface AutoDetectedPayrollCost {
  excludeKey: string;
  empleadoKey: string;
  empleadoNombre: string;
  categoriaNombre: string;
  diasTrabajados: number;
  fechas: string[];
  horasTrabajadas: number;
  modoCalculo: 'DIA' | 'HORA';
  tarifaAplicada: number;
  fuenteTarifa: string;
  montoTotal: number;
  excluded: boolean;
  sueldoMensualLiquidado?: number;
  sueldoBasicoPlanilla?: number;
  periodoLiquidacionLabel?: string;
}

export interface CombustiblePorTipoResumen {
  tipoCombustible: string;
  litrosTotal: number;
  cargasCount: number;
  precioPromedioLitro: number;
  montoTotal: number;
}

export interface AutoDetectedAmortizacionCost {
  excludeKey: string;
  equipoKey: string;
  equipoLabel: string;
  codigoInterno?: string;
  diasTrabajados: number;
  horasTrabajadas: number;
  horasHorometroReal?: number;
  modoCalculo: 'HORA' | 'DIA' | 'FIJO';
  tarifaAplicada: number;
  fuenteTarifa: string;
  montoTotal: number;
  excluded: boolean;
}

export interface ObraEquipoResumen {
  key: string;
  label: string;
  codigoInterno?: string;
  diasCount: number;
  horasTotal: number;
  viajesTotal: number;
  fuente: 'PARTES_DIARIOS' | 'CONTRATO_ALQUILER' | 'AMBOS';
  horasHorometroReal?: number;
  horometroInicial?: number;
  horometroFinal?: number;
  litrosAsignados?: number;
  cargasCount?: number;
  consumoLitrosHoraReal?: number;
}

export interface ObraRentabilidadSummary {
  // Periodo y presencia detectada
  diasObraUnicos: string[];
  equiposEnObra: ObraEquipoResumen[];
  partesVinculados: ParteDiario[];
  rentalsVinculados: RentalContract[];

  // Detalle de costos automáticos
  combustiblesAuto: AutoDetectedFuelCost[];
  combustiblesPorTipo: CombustiblePorTipoResumen[];
  lubricantesGrasasAuto: AutoDetectedLubricantOrInsumoCost[];
  reparacionesAuto: AutoDetectedRepairCost[];
  sueldosAuto: AutoDetectedPayrollCost[];
  amortizacionesAuto: AutoDetectedAmortizacionCost[];

  // Totales por categoría (incluyendo gastos manuales + automáticos activos)
  totalCombustibleAuto: number;
  totalLubricantesAuto: number;
  totalReparacionesAuto: number;
  totalSueldosAuto: number;

  totalManualCombustible: number;
  totalManualLubricantes: number;
  totalManualReparaciones: number;
  totalManualSueldos: number;
  totalManualOtros: number;

  totalCombustible: number;
  totalLubricantes: number;
  totalReparaciones: number;
  totalSueldos: number;
  totalOtrosDirectos: number;
  totalCostosDirectos: number;

  // Paquete Administrativo / Gastos Generales
  porcentajeGastosGenerales: number;
  baseCalculoGastosGenerales: 'COSTOS_DIRECTOS' | 'FACTURACION_NETA';
  montoFijoAdministrativo: number;
  totalGastosGenerales: number;

  // Amortización de Vehículos / Equipos
  totalAmortizacionEquipos: number;
  porcentajeAmortizacionVehiculos: number;
  baseCalculoAmortizacion: 'COSTOS_DIRECTOS' | 'FACTURACION_NETA';
  montoFijoAmortizacionVehiculos: number;
  totalAmortizacionVehiculos: number;

  costoTotalObra: number;

  // Facturación (Ingresos)
  facturadoNetoSinIva: number;
  facturadoIva: number;
  facturadoTotalConIva: number;
  cobradoTotal: number;
  pendienteCobroTotal: number;

  // Rentabilidad
  baseIngresosEvaluacion: number;
  evaluarSobreNetoSinIva: boolean;
  resultadoNeto: number;
  margenPorcentaje: number;
}

export const getDefaultObraCostosConfig = (config?: ObraCostosConfig): ObraCostosConfig => ({
  porcentajeGastosGenerales: config?.porcentajeGastosGenerales ?? 10,
  baseCalculoGastosGenerales: config?.baseCalculoGastosGenerales ?? 'COSTOS_DIRECTOS',
  montoFijoAdministrativo: config?.montoFijoAdministrativo ?? 0,
  descripcionPaqueteAdmin: config?.descripcionPaqueteAdmin ?? 'Paquete Administrativo, Estructura, Seguros y Gastos Generales',
  porcentajeAmortizacionVehiculos: config?.porcentajeAmortizacionVehiculos ?? 0,
  baseCalculoAmortizacion: config?.baseCalculoAmortizacion ?? 'COSTOS_DIRECTOS',
  montoFijoAmortizacionVehiculos: config?.montoFijoAmortizacionVehiculos ?? 0,
  amortizacionPorHoraDefault: config?.amortizacionPorHoraDefault ?? 0,
  amortizacionPorDiaDefault: config?.amortizacionPorDiaDefault ?? 0,
  tarifasAmortizacionOverride: config?.tarifasAmortizacionOverride ?? {},
  evaluarSobreNetoSinIva: config?.evaluarSobreNetoSinIva ?? true,
  precioCombustibleReferencia: config?.precioCombustibleReferencia ?? 1500,
  sueldoMensualDefault: config?.sueldoMensualDefault ?? 950000,
  diasLaborablesMes: config?.diasLaborablesMes ?? 24,
  horasJornadaDefault: config?.horasJornadaDefault ?? 8,
  modoCalculoSueldosObra: config?.modoCalculoSueldosObra ?? 'LIQUIDACION_TOTAL',
  tarifasEmpleadoOverride: config?.tarifasEmpleadoOverride ?? {},
  itemsExcluidosIds: config?.itemsExcluidosIds ?? [],
  fechaDesdeFiltro: config?.fechaDesdeFiltro ?? '',
  fechaHastaFiltro: config?.fechaHastaFiltro ?? ''
});

const lookupFuelPrice = (tipoComb: string | undefined, fuelPricesCatalog: Record<string, number>, fallbackPrice: number): number => {
  const t = norm(tipoComb);
  if (!t) return fallbackPrice;
  for (const [k, val] of Object.entries(fuelPricesCatalog || {})) {
    const uk = norm(k);
    if (uk === t || (t.includes('INFINIA') && uk.includes('INFINIA') && t.includes('DIESEL') === uk.includes('DIESEL'))) {
      if (Number(val) > 0) return Number(val);
    }
  }
  if (t.includes('INFINIA') && (t.includes('DIESEL') || t.includes('GASOIL'))) {
    return Number(fuelPricesCatalog['DIESEL INFINIA'] || fuelPricesCatalog['Infinia Diesel (Grado 3)'] || fallbackPrice);
  }
  if (t.includes('DIESEL') || t.includes('GASOIL') || t.includes('EURO')) {
    return Number(fuelPricesCatalog['DIESEL COMUN'] || fuelPricesCatalog['Diesel 500 (Grado 2)'] || fallbackPrice);
  }
  if (t.includes('NAFTA')) {
    return Number(fuelPricesCatalog['NAFTA SUPER'] || fuelPricesCatalog['Nafta Súper'] || fallbackPrice);
  }
  return fallbackPrice;
};

export interface ContenedorScope {
  contenedor?: ObraPeriodoContenedor;
  facturasScoped: ObraFacturaLegajo[];
  parteIdsScoped: Set<string> | null;
  rentalIdsScoped: Set<string>;
}

export function resolveContenedorScope(
  obra: Obra,
  contenedorId?: string,
  rentals: RentalContract[] = []
): ContenedorScope {
  const allFacturas = obra.facturasLegajo || [];
  if (!contenedorId || contenedorId === 'ALL') {
    return {
      facturasScoped: allFacturas,
      parteIdsScoped: null,
      rentalIdsScoped: new Set()
    };
  }

  const contenedor = (obra.periodosLegajo || []).find((p) => p.id === contenedorId);
  if (!contenedor) {
    return {
      facturasScoped: allFacturas,
      parteIdsScoped: null,
      rentalIdsScoped: new Set()
    };
  }

  const facturasScoped = allFacturas.filter((f) => f.periodoId === contenedor.id);

  const rentalIdsScoped = new Set<string>(contenedor.rentalIds || []);
  facturasScoped.forEach((f) => {
    (f.rentalIds || []).forEach((rid) => rentalIdsScoped.add(rid));
  });

  const explicitParteIds = new Set<string>(contenedor.parteDiarioIds || []);
  facturasScoped.forEach((f) => {
    (f.parteDiarioIds || []).forEach((pid) => explicitParteIds.add(pid));
  });
  rentals.forEach((r) => {
    if (rentalIdsScoped.has(r.id)) {
      (r.partesDiariosIds || []).forEach((pid) => explicitParteIds.add(pid));
    }
  });

  return {
    contenedor,
    facturasScoped,
    parteIdsScoped: explicitParteIds.size > 0 ? explicitParteIds : null,
    rentalIdsScoped
  };
}

export function computeObraRentabilidad(params: {
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
  fuelPricesCatalog: Record<string, number>;
  payrollPeriods?: PayrollPeriodRecord[];
  payrollDirectoryLinks?: Record<string, string>;
  contenedorId?: string;
  arcaInvoices?: ArcaInvoice[];
  customerReceipts?: CustomerPaymentReceipt[];
}): ObraRentabilidadSummary {
  const {
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
    payrollPeriods = [],
    payrollDirectoryLinks = {},
    contenedorId,
    arcaInvoices = [],
    customerReceipts = []
  } = params;

  const cfg = getDefaultObraCostosConfig(obra.costosConfig);
  const excludedSet = new Set(cfg.itemsExcluidosIds || []);
  const scope = resolveContenedorScope(obra, contenedorId, rentals);
  const facturas = scope.facturasScoped;

  const inManualDateFilter = (dateKey: string) => {
    if (!dateKey) return true;
    if (cfg.fechaDesdeFiltro && dateKey < cfg.fechaDesdeFiltro) return false;
    if (cfg.fechaHastaFiltro && dateKey > cfg.fechaHastaFiltro) return false;
    return true;
  };

  const inDateFilter = (dateKey: string) => {
    if (!inManualDateFilter(dateKey)) return false;
    if (scope.contenedor?.fechaDesde && dateKey && dateKey < scope.contenedor.fechaDesde) return false;
    if (scope.contenedor?.fechaHasta && dateKey && dateKey > scope.contenedor.fechaHasta) return false;
    return true;
  };

  const gastosManuales = (obra.gastosManuales || []).filter((g) =>
    inDateFilter(normalizeObraDateKey(g.fecha))
  );

  // 1. Collect all Partes Diarios belonging to this Obra (or active Contenedor)
  const attachedParteIds = new Set<string>();
  const attachedRentalIds = new Set<string>();
  if (scope.contenedor) {
    if (scope.parteIdsScoped) {
      scope.parteIdsScoped.forEach((id) => attachedParteIds.add(id));
    }
    scope.rentalIdsScoped.forEach((id) => attachedRentalIds.add(id));
  } else {
    facturas.forEach((f) => {
      (f.parteDiarioIds || []).forEach((id) => attachedParteIds.add(id));
      (f.rentalIds || []).forEach((id) => attachedRentalIds.add(id));
    });
    (obra.periodosLegajo || []).forEach((per) => {
      (per.parteDiarioIds || []).forEach((id) => attachedParteIds.add(id));
      (per.rentalIds || []).forEach((id) => attachedRentalIds.add(id));
    });
  }

  const obraNombreN = norm(obra.nombreObra);
  const obraNumN = norm(obra.numero);
  const obraIdN = norm(obra.id);

  const isParteFromTargetObra = (p: ParteDiario): boolean => {
    if (scope.contenedor && scope.parteIdsScoped) {
      return scope.parteIdsScoped.has(p.id);
    }
    const matchesObraName = Boolean(obraNombreN && norm(p.obra) === obraNombreN);
    const matchesObraCode = Boolean(obraNumN && norm(p.codigoObra) === obraNumN);
    const matchesObraId = Boolean(obraIdN && norm(p.codigoObra) === obraIdN);
    const matchesAttached = attachedParteIds.has(p.id);
    return matchesObraName || matchesObraCode || matchesObraId || matchesAttached;
  };

  const partesVinculados = partesDiarios.filter((p) => {
    if (!isParteFromTargetObra(p)) return false;
    const dKey = normalizeObraDateKey(p.fecha);
    return inDateFilter(dKey);
  });

  const rentalsVinculados = rentals.filter((r) => {
    if (attachedRentalIds.has(r.id)) return true;
    return false;
  });

  // 2. Build (fecha, equipo) map and equipment summaries
  const dateSet = new Set<string>();
  const equipmentDayMap = new Map<string, Set<string>>(); // dateKey -> Set<machineMatchTokens>
  const equipmentSummaryMap = new Map<string, {
    key: string;
    label: string;
    codigoInterno?: string;
    days: Set<string>;
    horas: number;
    viajes: number;
    hasParte: boolean;
    hasRental: boolean;
    matchTokens: Set<string>;
  }>();

  const registerEquipmentDay = (
    dateKey: string,
    veh: Vehicle | undefined,
    rawTokens: string[],
    labelFallback: string,
    horasAdd: number,
    viajesAdd: number,
    source: 'PARTE' | 'RENTAL'
  ) => {
    if (!dateKey || !inDateFilter(dateKey)) return;
    dateSet.add(dateKey);

    const summaryKey = veh ? `VEH:${veh.id}` : `RAW:${norm(rawTokens.find(Boolean) || labelFallback)}`;
    if (!equipmentDayMap.has(dateKey)) {
      equipmentDayMap.set(dateKey, new Set());
    }
    const dayTokens = equipmentDayMap.get(dateKey)!;

    const tokensToAdd: string[] = [];
    if (veh) {
      tokensToAdd.push(`VEH:${veh.id}`);
      if (veh.codigoInterno) tokensToAdd.push(`RAW:${norm(veh.codigoInterno)}`, `ALPHA:${alpha(veh.codigoInterno)}`);
      if (veh.modeloMarca) tokensToAdd.push(`RAW:${norm(veh.modeloMarca)}`);
      if (!isSpecialPlate(veh.patente)) tokensToAdd.push(`RAW:${norm(veh.patente)}`, `ALPHA:${alpha(veh.patente)}`);
      if (veh.codigo) tokensToAdd.push(`RAW:${norm(veh.codigo)}`);
    }
    rawTokens.forEach((t) => {
      const nt = norm(t);
      const at = alpha(t);
      if (nt && !isSpecialPlate(nt)) {
        tokensToAdd.push(`RAW:${nt}`);
        if (at.length >= 3) tokensToAdd.push(`ALPHA:${at}`);
      }
    });
    tokensToAdd.forEach((tok) => dayTokens.add(tok));

    if (!equipmentSummaryMap.has(summaryKey)) {
      equipmentSummaryMap.set(summaryKey, {
        key: summaryKey,
        label: veh ? veh.modeloMarca : labelFallback,
        codigoInterno: veh?.codigoInterno || rawTokens[0],
        days: new Set(),
        horas: 0,
        viajes: 0,
        hasParte: false,
        hasRental: false,
        matchTokens: new Set(tokensToAdd)
      });
    }
    const entry = equipmentSummaryMap.get(summaryKey)!;
    entry.days.add(dateKey);
    entry.horas += horasAdd;
    entry.viajes += viajesAdd;
    if (source === 'PARTE') entry.hasParte = true;
    if (source === 'RENTAL') entry.hasRental = true;
    tokensToAdd.forEach((tok) => entry.matchTokens.add(tok));
  };

  partesVinculados.forEach((p) => {
    const dKey = normalizeObraDateKey(p.fecha);
    const veh = findMatchingVehicle(p, fleet);
    const hrs = Number(p.horasTrabajadas || p.hsCantidad || 0);
    const viajes = Number(p.viajesCantidad || p.cantidad || 0);
    registerEquipmentDay(
      dKey,
      veh,
      [p.vehicleId || '', p.codigoEquipo || '', p.marcaModelo || '', p.patenteOrCodigo || ''],
      p.marcaModelo || p.codigoEquipo || 'Equipo',
      hrs,
      viajes,
      'PARTE'
    );
  });

  rentalsVinculados.forEach((r) => {
    const endD = r.fechaDevolucionReal || r.fechaFinEstimada || r.fechaInicio;
    const days = expandDateRange(r.fechaInicio, endD);
    // Collect machines from r.items and r.equipoId
    const rentalVehicles: { veh?: Vehicle; tokens: string[]; label: string }[] = [];
    if (r.equipoId) {
      const v = fleet.find((f) => f.id === r.equipoId);
      rentalVehicles.push({
        veh: v,
        tokens: [r.equipoId, r.equipoCodigoInterno || '', r.equipoCodigo || '', r.equipoModelo || '', r.equipoPatenteOrCodigo || ''],
        label: r.equipoModelo || r.equipoCodigoInterno || 'Equipo Alquilado'
      });
    }
    (r.items || []).forEach((it) => {
      if (it.equipoId) {
        const v = fleet.find((f) => f.id === it.equipoId);
        if (!rentalVehicles.some((rv) => rv.veh?.id === it.equipoId)) {
          rentalVehicles.push({
            veh: v,
            tokens: [it.equipoId, it.codigo || '', it.descripcion || ''],
            label: v?.modeloMarca || it.descripcion
          });
        }
      }
    });

    days.forEach((dKey) => {
      rentalVehicles.forEach((rv) => {
        registerEquipmentDay(dKey, rv.veh, rv.tokens, rv.label, 0, 0, 'RENTAL');
      });
    });
  });

  const diasObraUnicos = Array.from(dateSet).sort();
  // Helper to check if a record happened on an active Obra (date, equipment)
  const matchesObraDateAndEquipment = (
    dateStr: string | undefined,
    record: Parameters<typeof matchRecordToVehicleKey>[0]
  ): { matched: boolean; dateKey: string; equipoLabel: string } => {
    const dKey = normalizeObraDateKey(dateStr);
    if (!dKey || !equipmentDayMap.has(dKey)) {
      return { matched: false, dateKey: dKey, equipoLabel: '' };
    }
    const dayTokens = equipmentDayMap.get(dKey)!;
    const m = matchRecordToVehicleKey(record, dayTokens, fleet);
    return { matched: m.matched, dateKey: dKey, equipoLabel: m.label };
  };

  // Helper to shift an ISO YYYY-MM-DD date string by N days
  const shiftIsoDate = (isoDate: string, deltaDays: number): string => {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
    const d = new Date(`${isoDate}T00:00:00Z`);
    if (isNaN(d.getTime())) return isoDate;
    d.setUTCDate(d.getUTCDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  };

  // Resolve canonical equipment summary key for any ParteDiario or FuelDispensary record
  const resolveCanonicalEquipmentKey = (
    record: Parameters<typeof matchRecordToVehicleKey>[0]
  ): { key: string; label: string } => {
    const matchedVeh = findMatchingVehicle(record, fleet);
    if (matchedVeh) {
      const k = `VEH:${matchedVeh.id}`;
      return {
        key: k,
        label: `${matchedVeh.modeloMarca}${matchedVeh.codigoInterno ? ` (${matchedVeh.codigoInterno})` : ''}`
      };
    }
    for (const [entryKey, entryVal] of equipmentSummaryMap.entries()) {
      const m = matchRecordToVehicleKey(record, entryVal.matchTokens, fleet);
      if (m.matched) {
        return { key: entryKey, label: entryVal.label };
      }
    }
    const fallbackRaw = norm(
      record.codigoEquipo ||
        record.equipoCodigoOrPatente ||
        record.marcaModelo ||
        record.equipoModeloMarca ||
        record.patente ||
        record.equipoPatenteOrCodigo
    );
    return {
      key: fallbackRaw ? `RAW:${fallbackRaw}` : '',
      label:
        record.marcaModelo ||
        record.equipoModeloMarca ||
        record.codigoEquipo ||
        record.equipoCodigoOrPatente ||
        fallbackRaw
    };
  };

  // 3. Auto-detect COMBUSTIBLE por Tramo entre Cargas (prorrateo multi-obra por partes/horas + Horómetro Real)
  const combustiblesAuto: AutoDetectedFuelCost[] = [];
  const defaultJornadaHs = Math.max(1, Number(cfg.horasJornadaDefault || 8));

  // Index ALL partes diarios (across all obras) by canonical machine key
  type IndexedMachineParte = {
    parte: ParteDiario;
    dKey: string;
    isTargetObra: boolean;
    horasDeclaradas: number;
    pesoHoras: number;
    obraLabel: string;
  };
  const allPartesByMachine = new Map<string, IndexedMachineParte[]>();
  partesDiarios.forEach((p) => {
    const dKey = normalizeObraDateKey(p.fecha);
    if (!dKey) return;
    const resolved = resolveCanonicalEquipmentKey({
      vehicleId: p.vehicleId,
      codigoEquipo: p.codigoEquipo,
      marcaModelo: p.marcaModelo,
      equipoPatenteOrCodigo: p.patenteOrCodigo
    });
    if (!resolved.key || !equipmentSummaryMap.has(resolved.key)) return;
    const hrs = Math.max(0, Number(p.horasTrabajadas || p.hsCantidad || 0));
    const isTarget = isParteFromTargetObra(p);
    const obraLbl = isTarget
      ? obra.nombreObra || obra.numero || 'Esta Obra'
      : (p.obra || p.codigoObra || 'Otra Obra').trim();

    if (!allPartesByMachine.has(resolved.key)) {
      allPartesByMachine.set(resolved.key, []);
    }
    allPartesByMachine.get(resolved.key)!.push({
      parte: p,
      dKey,
      isTargetObra: isTarget,
      horasDeclaradas: hrs,
      pesoHoras: hrs > 0 ? hrs : defaultJornadaHs,
      obraLabel: obraLbl
    });
  });

  allPartesByMachine.forEach((list) => {
    list.sort((a, b) => a.dKey.localeCompare(b.dKey));
  });

  // Group all non-ingreso fuel vouchers by canonical machine key for machines active in this obra
  type IndexedMachineFuel = {
    voucher: FuelDispensary;
    dKey: string;
    horometro: number;
    litros: number;
    equipoLabel: string;
    explicitObraMatch: boolean;
  };
  const vouchersByMachine = new Map<string, IndexedMachineFuel[]>();
  const directUnlistedObraVouchers: Array<{
    voucher: FuelDispensary;
    dKey: string;
    horometro: number;
    litros: number;
    equipoLabel: string;
  }> = [];

  const targetObraNormName = norm(obra.nombreObra || '');

  fuelVouchers.forEach((v) => {
    if (norm(v.tipo) === 'INGRESO') return;
    const litros = Math.abs(Number(v.cantidad || v.cantCarga || 0));
    if (litros <= 0) return;
    const dKey = normalizeObraDateKey(v.fecha);
    if (!dKey) return;

    const explicitObraId = (v.obraId || '').trim();
    const explicitObraName = norm(v.obraNombre || '');
    const hasExplicitObra = Boolean(explicitObraId || explicitObraName);
    const explicitObraMatch =
      hasExplicitObra &&
      ((explicitObraId && explicitObraId === obra.id) ||
        (!explicitObraId && Boolean(targetObraNormName) && explicitObraName === targetObraNormName));

    // If the dispensary was explicitly assigned to a DIFFERENT obra, skip it here
    if (hasExplicitObra && !explicitObraMatch) return;

    const resolved = resolveCanonicalEquipmentKey(v);
    if (resolved.key && equipmentSummaryMap.has(resolved.key)) {
      const summaryEntry = equipmentSummaryMap.get(resolved.key)!;
      const eqLabel = summaryEntry.codigoInterno
        ? `${summaryEntry.label} (${summaryEntry.codigoInterno})`
        : summaryEntry.label || resolved.label;

      if (!vouchersByMachine.has(resolved.key)) {
        vouchersByMachine.set(resolved.key, []);
      }
      vouchersByMachine.get(resolved.key)!.push({
        voucher: v,
        dKey,
        horometro: Math.max(0, Number(v.kilometraje || v.kmsHs || 0)),
        litros,
        equipoLabel: eqLabel,
        explicitObraMatch
      });
    } else if (explicitObraMatch) {
      // Explicitly assigned to this Obra even if the machine/target wasn't in partes/contracts
      const fallbackLabel =
        v.marcaModelo ||
        v.codigoEquipo ||
        v.patente ||
        resolved.label ||
        'Expendio Directo a Obra';
      directUnlistedObraVouchers.push({
        voucher: v,
        dKey,
        horometro: Math.max(0, Number(v.kilometraje || v.kmsHs || 0)),
        litros,
        equipoLabel: fallbackLabel
      });
    }
  });

  // Stats accumulator per machine in this obra
  const machineFuelStatsMap = new Map<
    string,
    {
      horasHorometroReal: number;
      horometroMin: number;
      horometroMax: number;
      litrosAsignados: number;
      cargasCount: number;
    }
  >();

  vouchersByMachine.forEach((loads, eqKey) => {
    loads.sort(
      (a, b) =>
        a.dKey.localeCompare(b.dKey) ||
        a.horometro - b.horometro ||
        String(a.voucher.id).localeCompare(String(b.voucher.id))
    );

    const machinePartes = allPartesByMachine.get(eqKey) || [];
    const summaryEntry = equipmentSummaryMap.get(eqKey)!;

    for (let i = 0; i < loads.length; i++) {
      const cur = loads[i];
      const prev = i > 0 ? loads[i - 1] : undefined;
      const next = i + 1 < loads.length ? loads[i + 1] : undefined;

      // Calculate real horómetro engine hours consumed in this load
      const rawRec = Number(cur.voucher.kilometrosRec || 0);
      const diffHorometro =
        cur.horometro > 0 && prev && prev.horometro > 0 ? cur.horometro - prev.horometro : 0;
      let deltaHorometro = 0;
      if (rawRec > 0 && rawRec <= 150) {
        deltaHorometro = rawRec;
      } else if (diffHorometro > 0 && diffHorometro <= 150) {
        deltaHorometro = diffHorometro;
      }

      const applyFuelDateFilter = scope.parteIdsScoped ? inManualDateFilter : inDateFilter;
      if (!applyFuelDateFilter(cur.dKey)) continue;

      // Determine consumption window ("tramo") of partes covered by this fuel load
      let tramoPartes: IndexedMachineParte[] = [];
      if (prev) {
        if (cur.dKey === prev.dKey) {
          tramoPartes = machinePartes.filter((p) => p.dKey === cur.dKey);
        } else {
          tramoPartes = machinePartes.filter((p) => p.dKey > prev.dKey && p.dKey <= cur.dKey);
          if (tramoPartes.length === 0) {
            tramoPartes = machinePartes.filter((p) => p.dKey >= prev.dKey && p.dKey <= cur.dKey);
          }
        }
      } else {
        const minWindow = shiftIsoDate(cur.dKey, -14);
        tramoPartes = machinePartes.filter((p) => p.dKey >= minWindow && p.dKey <= cur.dKey);
      }

      // Proximity fallback (±3 days bounded by neighbor loads) if load was logged on weekend/before shift
      if (tramoPartes.length === 0) {
        const proxStart = prev ? prev.dKey : shiftIsoDate(cur.dKey, -3);
        const proxEnd = next ? next.dKey : shiftIsoDate(cur.dKey, 3);
        const minB = proxStart > shiftIsoDate(cur.dKey, -3) ? proxStart : shiftIsoDate(cur.dKey, -3);
        const maxB = proxEnd < shiftIsoDate(cur.dKey, 3) ? proxEnd : shiftIsoDate(cur.dKey, 3);
        tramoPartes = machinePartes.filter((p) => p.dKey >= minB && p.dKey <= maxB);
      }

      let proporcionObra = 0;
      let partesTotalesEnTramo = tramoPartes.length;
      let partesObraEnTramo = 0;
      let horasTotalesEnTramo = 0;
      let horasObraEnTramo = 0;
      let obrasEnTramo: string[] = [];

      if (cur.explicitObraMatch) {
        proporcionObra = 1;
        partesTotalesEnTramo = Math.max(1, partesTotalesEnTramo);
        partesObraEnTramo = Math.max(1, partesObraEnTramo);
        obrasEnTramo = [obra.nombreObra || obra.numero || 'Esta Obra'];
      } else if (tramoPartes.length > 0) {
        const obraPartes = tramoPartes.filter((p) => p.isTargetObra);
        partesObraEnTramo = obraPartes.length;
        horasTotalesEnTramo = Number(
          tramoPartes.reduce((acc, p) => acc + p.horasDeclaradas, 0).toFixed(2)
        );
        horasObraEnTramo = Number(
          obraPartes.reduce((acc, p) => acc + p.horasDeclaradas, 0).toFixed(2)
        );

        const pesoTotal = tramoPartes.reduce((acc, p) => acc + p.pesoHoras, 0);
        const pesoObra = obraPartes.reduce((acc, p) => acc + p.pesoHoras, 0);
        proporcionObra = pesoTotal > 0 ? pesoObra / pesoTotal : 0;
        obrasEnTramo = Array.from(new Set(tramoPartes.map((p) => p.obraLabel)));
      } else if (summaryEntry.days.has(cur.dKey)) {
        // Fallback when machine is linked by RentalContract without Partes Diarios
        proporcionObra = 1;
        partesTotalesEnTramo = 1;
        partesObraEnTramo = 1;
        obrasEnTramo = [obra.nombreObra || obra.numero || 'Esta Obra'];
      }

      if (proporcionObra <= 0) continue;

      const unitPrice =
        Number(cur.voucher.precioUnitario || 0) > 0
          ? Number(cur.voucher.precioUnitario)
          : lookupFuelPrice(
              cur.voucher.tipoComb || cur.voucher.combustible,
              fuelPricesCatalog,
              cfg.precioCombustibleReferencia || 1500
            );
      const montoTotalCarga =
        Number(cur.voucher.totalImporte || 0) > 0
          ? Number(cur.voucher.totalImporte)
          : Number((cur.litros * unitPrice).toFixed(2));

      const litrosAsignados = Number((cur.litros * proporcionObra).toFixed(2));
      const montoAsignado = Number((montoTotalCarga * proporcionObra).toFixed(2));
      const horasHorometroCarga =
        deltaHorometro > 0 ? Number(deltaHorometro.toFixed(2)) : undefined;
      const horasHorometroObra =
        deltaHorometro > 0 ? Number((deltaHorometro * proporcionObra).toFixed(2)) : undefined;

      const excludeKey = `FUEL:${cur.voucher.id}`;
      const isExcluded = excludedSet.has(excludeKey);

      combustiblesAuto.push({
        excludeKey,
        voucherId: cur.voucher.id,
        fecha: cur.dKey,
        equipoLabel: cur.equipoLabel,
        tipoCombustible: cur.voucher.tipoComb || cur.voucher.combustible || 'Combustible',
        litros: litrosAsignados,
        litrosTotalesCarga: Number(cur.litros.toFixed(2)),
        proporcionObra: Number(proporcionObra.toFixed(4)),
        partesObraEnTramo,
        partesTotalesEnTramo,
        horasObraEnTramo,
        horasTotalesEnTramo,
        obrasEnTramo,
        horometroLectura: cur.horometro > 0 ? cur.horometro : undefined,
        horasHorometroCarga,
        horasHorometroObra,
        precioUnitario: Number(unitPrice.toFixed(2)),
        monto: montoAsignado,
        deposito: cur.voucher.deposito || 'Estación / Depósito',
        excluded: isExcluded
      });

      if (!isExcluded) {
        if (!machineFuelStatsMap.has(eqKey)) {
          machineFuelStatsMap.set(eqKey, {
            horasHorometroReal: 0,
            horometroMin: Infinity,
            horometroMax: 0,
            litrosAsignados: 0,
            cargasCount: 0
          });
        }
        const st = machineFuelStatsMap.get(eqKey)!;
        st.litrosAsignados += litrosAsignados;
        st.cargasCount += 1;
        if (horasHorometroObra && horasHorometroObra > 0) {
          st.horasHorometroReal += horasHorometroObra;
        }
        if (cur.horometro > 0 && cur.horometro < 50000) {
          const startReading =
            deltaHorometro > 0 && cur.horometro > deltaHorometro
              ? cur.horometro - deltaHorometro
              : cur.horometro;
          if (startReading < st.horometroMin) st.horometroMin = startReading;
          if (cur.horometro > st.horometroMax) st.horometroMax = cur.horometro;
        }
      }
    }
  });

  // Include fuel/insumo dispensaries explicitly assigned to this Obra whose equipment isn't listed in partes/contracts
  const applyDirectFuelDateFilter = scope.parteIdsScoped ? inManualDateFilter : inDateFilter;
  directUnlistedObraVouchers.forEach((cur) => {
    if (!applyDirectFuelDateFilter(cur.dKey)) return;
    const unitPrice =
      Number(cur.voucher.precioUnitario || 0) > 0
        ? Number(cur.voucher.precioUnitario)
        : lookupFuelPrice(
            cur.voucher.tipoComb || cur.voucher.combustible,
            fuelPricesCatalog,
            cfg.precioCombustibleReferencia || 1500
          );
    const montoTotalCarga =
      Number(cur.voucher.totalImporte || 0) > 0
        ? Number(cur.voucher.totalImporte)
        : Number((cur.litros * unitPrice).toFixed(2));
    const excludeKey = `FUEL:${cur.voucher.id}`;
    const isExcluded = excludedSet.has(excludeKey);

    combustiblesAuto.push({
      excludeKey,
      voucherId: cur.voucher.id,
      fecha: cur.dKey,
      equipoLabel: cur.equipoLabel,
      tipoCombustible: cur.voucher.tipoComb || cur.voucher.combustible || 'Combustible',
      litros: Number(cur.litros.toFixed(2)),
      litrosTotalesCarga: Number(cur.litros.toFixed(2)),
      proporcionObra: 1,
      partesObraEnTramo: 1,
      partesTotalesEnTramo: 1,
      horasObraEnTramo: 0,
      horasTotalesEnTramo: 0,
      obrasEnTramo: [obra.nombreObra || obra.numero || 'Esta Obra'],
      horometroLectura: cur.horometro > 0 ? cur.horometro : undefined,
      precioUnitario: Number(unitPrice.toFixed(2)),
      monto: montoTotalCarga,
      deposito: cur.voucher.deposito || 'Estación / Depósito',
      excluded: isExcluded
    });
  });

  combustiblesAuto.sort((a, b) => b.fecha.localeCompare(a.fecha));

  const equiposEnObra: ObraEquipoResumen[] = Array.from(equipmentSummaryMap.values()).map((e) => {
    const fStats = machineFuelStatsMap.get(e.key);
    const hsReal = fStats ? Number(fStats.horasHorometroReal.toFixed(2)) : 0;
    const litrosAsig = fStats ? Number(fStats.litrosAsignados.toFixed(2)) : 0;
    const baseHorasConsumo = hsReal > 0 ? hsReal : e.horas;
    return {
      key: e.key,
      label: e.label,
      codigoInterno: e.codigoInterno,
      diasCount: e.days.size,
      horasTotal: Number(e.horas.toFixed(2)),
      viajesTotal: e.viajes,
      fuente: e.hasParte && e.hasRental ? 'AMBOS' : e.hasRental ? 'CONTRATO_ALQUILER' : 'PARTES_DIARIOS',
      horasHorometroReal: hsReal > 0 ? hsReal : undefined,
      horometroInicial:
        fStats && fStats.horometroMin < Infinity ? Number(fStats.horometroMin.toFixed(1)) : undefined,
      horometroFinal:
        fStats && fStats.horometroMax > 0 ? Number(fStats.horometroMax.toFixed(1)) : undefined,
      litrosAsignados: litrosAsig > 0 ? litrosAsig : undefined,
      cargasCount: fStats?.cargasCount || 0,
      consumoLitrosHoraReal:
        litrosAsig > 0 && baseHorasConsumo > 0
          ? Number((litrosAsig / baseHorasConsumo).toFixed(2))
          : undefined
    };
  });

  // 4. Auto-detect GRASA, ACEITE e INSUMOS DE PAÑOL (StockMovement + VehicleExpenseLog lubricants + ServiceItemUsed)
  const lubricantesGrasasAuto: AutoDetectedLubricantOrInsumoCost[] = [];
  stockMovements.forEach((m) => {
    if (m.tipo !== 'EGRESO_CONSUMO') return;
    const match = matchesObraDateAndEquipment(m.fecha, {
      equipoId: m.equipoId,
      equipoCodigoOrPatente: m.equipoCodigoOrPatente
    });
    if (!match.matched) return;
    const itemRef = stockItems.find((si) => si.id === m.stockItemId);
    const unitCost = Number(itemRef?.precioCostoUnitario || 0);
    const monto = Number(((Number(m.cantidad) || 0) * unitCost).toFixed(2));
    const excludeKey = `STOCK:${m.id}`;

    lubricantesGrasasAuto.push({
      excludeKey,
      source: 'STOCK_PANOL',
      fecha: match.dateKey,
      equipoLabel: match.equipoLabel,
      descripcion: `${m.stockItemNombre}${m.motivoConcepto ? ` — ${m.motivoConcepto}` : ''}`,
      cantidad: Number(m.cantidad || 0),
      unidad: String(m.unidad || 'UNI'),
      monto,
      excluded: excludedSet.has(excludeKey)
    });
  });

  // 5. Auto-detect REPARACIONES, SERVICES & GASTOS DE EQUIPO (servicesLogs + expensesLogs)
  const reparacionesAuto: AutoDetectedRepairCost[] = [];
  servicesLogs.forEach((s) => {
    const match = matchesObraDateAndEquipment(s.fecha, {
      equipoId: s.equipoId,
      equipoModeloMarca: s.equipoModeloMarca,
      equipoPatenteOrCodigo: s.equipoPatenteOrCodigo
    });
    if (!match.matched) return;

    const excludeKey = `SRV:${s.id}`;
    reparacionesAuto.push({
      excludeKey,
      source: 'SERVICE_TALLER',
      fecha: match.dateKey,
      equipoLabel: match.equipoLabel,
      concepto: `${s.tipoService.replace(/_/g, ' ')}: ${s.trabajosRealizados}`,
      proveedorOrMecanico: s.proveedor || s.mecanicoResponsable || 'Taller',
      monto: Number(s.costoTotalService || 0),
      excluded: excludedSet.has(excludeKey)
    });
  });

  expensesLogs.forEach((e) => {
    const match = matchesObraDateAndEquipment(e.fecha, {
      equipoId: e.equipoId,
      equipoModeloMarca: e.equipoModeloMarca,
      equipoPatenteOrCodigo: e.equipoPatenteOrCodigo
    });
    if (!match.matched) return;

    if (e.categoria === 'LUBRICANTES_ACEITES' || String(e.categoria).includes('LUBRICANTE')) {
      const excludeKey = `EXPLUB:${e.id}`;
      lubricantesGrasasAuto.push({
        excludeKey,
        source: 'GASTO_LUBRICANTE',
        fecha: match.dateKey,
        equipoLabel: match.equipoLabel,
        descripcion: `${e.concepto}${e.proveedor ? ` (${e.proveedor})` : ''}`,
        cantidad: 1,
        unidad: 'COMPR.',
        monto: Number(e.montoTotal || 0),
        excluded: excludedSet.has(excludeKey)
      });
    } else if (e.categoria === 'COMBUSTIBLE_DIRECTO') {
      const excludeKey = `EXPFUEL:${e.id}`;
      combustiblesAuto.push({
        excludeKey,
        voucherId: e.id,
        fecha: match.dateKey,
        equipoLabel: match.equipoLabel,
        tipoCombustible: `${e.concepto} (Gasto Directo)`,
        litros: 0,
        precioUnitario: 0,
        monto: Number(e.montoTotal || 0),
        deposito: e.proveedor || 'Compra Directa',
        excluded: excludedSet.has(excludeKey)
      });
    } else {
      const excludeKey = `EXP:${e.id}`;
      reparacionesAuto.push({
        excludeKey,
        source: 'GASTO_EQUIPO',
        fecha: match.dateKey,
        equipoLabel: match.equipoLabel,
        concepto: `[${e.categoria.replace(/_/g, ' ')}] ${e.concepto}`,
        proveedorOrMecanico: e.proveedor || e.numeroComprobante || '-',
        monto: Number(e.montoTotal || 0),
        excluded: excludedSet.has(excludeKey)
      });
    }
  });

  // 6. Auto-detect SUELDOS PROPORCIONALES por días trabajados de empleados en esta obra
  const empGroupMap = new Map<
    string,
    {
      empleadoKey: string;
      nombre: string;
      empObj?: Employee;
      fechas: Set<string>;
      horas: number;
    }
  >();

  const matchEmployeeObj = (code?: string, name?: string): Employee | undefined => {
    const cN = norm(code);
    const nN = norm(name);
    const nA = alpha(name);
    const exact = employees.find(
      (e) =>
        (cN && (norm(e.id) === cN || norm(e.codigoEmpleado) === cN || norm(e.legajo) === cN)) ||
        (nN && norm(e.nombreApellido) === nN) ||
        (nA && nA.length >= 4 && alpha(e.nombreApellido) === nA)
    );
    if (exact) return exact;
    const rawCandidate = name || code || '';
    if (!rawCandidate.trim()) return undefined;
    const smart = matchPayrollSlipToEmployee(rawCandidate, employees, payrollDirectoryLinks);
    return smart.employee || undefined;
  };

  partesVinculados.forEach((p) => {
    const dKey = normalizeObraDateKey(p.fecha);
    if (!dKey) return;
    const empObj = matchEmployeeObj(p.codigoEmpleado, p.nombreApellido);
    const empKey = empObj ? empObj.id : norm(p.nombreApellido || p.codigoEmpleado || 'OPERARIO');
    if (!empKey) return;

    if (!empGroupMap.has(empKey)) {
      empGroupMap.set(empKey, {
        empleadoKey: empKey,
        nombre: empObj?.nombreApellido || p.nombreApellido || p.codigoEmpleado || 'Operario',
        empObj,
        fechas: new Set(),
        horas: 0
      });
    }
    const g = empGroupMap.get(empKey)!;
    g.fechas.add(dKey);
    g.horas += Number(p.horasTrabajadas || p.hsCantidad || 0);
  });

  // Include operator days from linked Rentals if not already captured by partes
  rentalsVinculados.forEach((r) => {
    if (!r.operarioIncluido || !r.operarioNombre) return;
    const endD = r.fechaDevolucionReal || r.fechaFinEstimada || r.fechaInicio;
    const days = expandDateRange(r.fechaInicio, endD).filter(inDateFilter);
    const empObj = matchEmployeeObj(r.operarioId, r.operarioNombre);
    const empKey = empObj ? empObj.id : norm(r.operarioNombre);
    if (!empGroupMap.has(empKey)) {
      empGroupMap.set(empKey, {
        empleadoKey: empKey,
        nombre: empObj?.nombreApellido || r.operarioNombre,
        empObj,
        fechas: new Set(),
        horas: 0
      });
    }
    const g = empGroupMap.get(empKey)!;
    days.forEach((d) => g.fechas.add(d));
  });

  const diasMes = Math.max(1, Number(cfg.diasLaborablesMes || 24));
  const defaultDiaFromMensual = Math.round(Number(cfg.sueldoMensualDefault || 950000) / diasMes);
  const modoSueldosGlobal = cfg.modoCalculoSueldosObra || 'LIQUIDACION_TOTAL';

  // Pre-index real payroll slips per employee (grouped by YYYY-MM period)
  type MonthlyPayrollEntry = {
    ym: string;
    periodName: string;
    basico: number;
    extras: number;
    totalRemunerativo: number;
    valorBaseJornal: number;
  };

  const findEmployeePayrollSlips = (emp: Employee | undefined, rawName: string): MonthlyPayrollEntry[] => {
    const entriesByPeriod = new Map<string, MonthlyPayrollEntry>();
    const targetTokenKey = getEmployeeBankTokenKey(emp?.nombreApellido || rawName);

    for (const period of payrollPeriods) {
      const ym = extractYearMonthFromPeriodName(period.sheetTabName || period.nombrePeriodo);
      const periodKey = ym || period.id;
      const periodLabel = (period.sheetTabName || period.nombrePeriodo || '').trim();

      for (const slip of period.slips || []) {
        let isMatch = false;
        if (emp && slip.empleadoId && slip.empleadoId === emp.id) {
          isMatch = true;
        } else if (emp) {
          const m = matchPayrollSlipToEmployee(slip, [emp], payrollDirectoryLinks);
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
        const totalRem = basico + extras;
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

  const sueldosAuto: AutoDetectedPayrollCost[] = Array.from(empGroupMap.values()).map((g) => {
    const emp = g.empObj;
    const override = cfg.tarifasEmpleadoOverride?.[g.empleadoKey];
    const supUser = emp
      ? supabaseUsuarios.find(
          (u) =>
            u.id === emp.id ||
            (emp.legajo && u.legajo === emp.legajo) ||
            alpha(u.nombre) === alpha(emp.nombreApellido)
        )
      : supabaseUsuarios.find((u) => alpha(u.nombre) === alpha(g.nombre));
    const supCat = supUser?.categoria_id
      ? supabaseCategorias.find((c) => c.id === supUser.categoria_id)
      : undefined;

    const realSlips = findEmployeePayrollSlips(emp, g.nombre);
    const latestSlip = realSlips[0];

    const diasTrabajados = g.fechas.size;
    const horasTrabajadas = Number(g.horas.toFixed(2));
    const sortedDates = Array.from(g.fechas).sort();

    let modoCalculo: 'DIA' | 'HORA' = override?.modo || 'DIA';
    let tarifaAplicada = defaultDiaFromMensual;
    let fuenteTarifa = `Proporcional Ref. (${diasMes} días/mes)`;
    let montoTotal = 0;
    let sueldoMensualLiquidado: number | undefined = latestSlip?.totalRemunerativo;
    let sueldoBasicoPlanilla: number | undefined = latestSlip?.basico;
    let periodoLiquidacionLabel: string | undefined = latestSlip?.periodName;

    // 1. Explicit per-employee override in this Obra
    if (override?.modo === 'HORA' && (override.costoPorHora ?? 0) > 0) {
      modoCalculo = 'HORA';
      tarifaAplicada = Number(override.costoPorHora);
      fuenteTarifa = 'Tarifa manual por hora';
      montoTotal = Number((horasTrabajadas * tarifaAplicada).toFixed(2));
    } else if ((override?.costoPorDia ?? 0) > 0) {
      modoCalculo = 'DIA';
      tarifaAplicada = Number(override!.costoPorDia);
      fuenteTarifa = 'Tarifa manual por día';
      montoTotal = Number((diasTrabajados * tarifaAplicada).toFixed(2));
    } else if (
      realSlips.length > 0 &&
      modoSueldosGlobal !== 'REFERENCIA_MANUAL'
    ) {
      // 2. Real Payroll Slips from Liquidación de Sueldos (payroll_periods_data in Supabase)
      modoCalculo = 'DIA';
      if (modoSueldosGlobal === 'JORNAL_BASE_SHEET' && latestSlip.valorBaseJornal > 0) {
        tarifaAplicada = Math.round(latestSlip.valorBaseJornal);
        montoTotal = Number((diasTrabajados * tarifaAplicada).toFixed(2));
        fuenteTarifa = `Jornal Base Planilla (${latestSlip.periodName})`;
      } else {
        // Match each worked day (YYYY-MM) to its corresponding monthly payroll slip, or fallback to closest/latest real slip
        const byYm = new Map<string, MonthlyPayrollEntry>();
        realSlips.forEach((rs) => {
          if (rs.ym) byYm.set(rs.ym, rs);
        });

        let accumulatedCost = 0;
        let accumulatedMonthlyRef = 0;
        let accumulatedBasicoRef = 0;
        const usedPeriods = new Set<string>();

        for (const dStr of sortedDates) {
          const ym = dStr.slice(0, 7);
          const slipForMonth = byYm.get(ym) || latestSlip;
          usedPeriods.add(slipForMonth.periodName);
          const monthlyBase =
            modoSueldosGlobal === 'LIQUIDACION_BASICO'
              ? slipForMonth.basico
              : slipForMonth.totalRemunerativo;
          const dayCost = monthlyBase / diasMes;
          accumulatedCost += dayCost;
          accumulatedMonthlyRef += slipForMonth.totalRemunerativo;
          accumulatedBasicoRef += slipForMonth.basico;
        }

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
      // Guard: if costoPorDia in DB looks like a monthly salary (> 300,000), divide by diasMes
      const rawCostoDia = Number(emp.costoPorDia);
      tarifaAplicada = rawCostoDia > 300000 ? Math.round(rawCostoDia / diasMes) : rawCostoDia;
      fuenteTarifa = 'Nómina empleado ($/día)';
      montoTotal = Number((diasTrabajados * tarifaAplicada).toFixed(2));
    } else if (supCat && Number(supCat.valor_hora || 0) > 0 && g.horas > 0) {
      modoCalculo = 'HORA';
      tarifaAplicada = Number(supCat.valor_hora);
      fuenteTarifa = `Categoría ${supCat.nombre} ($/hs)`;
      montoTotal = Number((horasTrabajadas * tarifaAplicada).toFixed(2));
    } else if (emp && Number(emp.costoPorHora || 0) > 0 && g.horas > 0) {
      modoCalculo = 'HORA';
      tarifaAplicada = Number(emp.costoPorHora);
      fuenteTarifa = 'Nómina empleado ($/hs)';
      montoTotal = Number((horasTrabajadas * tarifaAplicada).toFixed(2));
    } else {
      montoTotal =
        modoCalculo === 'HORA'
          ? Number((horasTrabajadas * tarifaAplicada).toFixed(2))
          : Number((diasTrabajados * tarifaAplicada).toFixed(2));
    }

    const excludeKey = `PAY:${g.empleadoKey}`;
    return {
      excludeKey,
      empleadoKey: g.empleadoKey,
      empleadoNombre: g.nombre,
      categoriaNombre: supCat?.nombre || emp?.categoria || 'Operario / Chofer',
      diasTrabajados,
      fechas: sortedDates,
      horasTrabajadas,
      modoCalculo,
      tarifaAplicada,
      fuenteTarifa,
      montoTotal,
      excluded: excludedSet.has(excludeKey),
      sueldoMensualLiquidado,
      sueldoBasicoPlanilla,
      periodoLiquidacionLabel
    };
  });

  // 6b. Agrupar Combustible por Tipo de Combustible (para tabla resumen en cascada)
  const normalizeFuelTypeLabel = (rawTipo?: string): string => {
    const t = norm(rawTipo);
    if (!t) return 'Gasoil / Diesel';
    if (t.includes('INFINIA') && (t.includes('DIESEL') || t.includes('GASOIL') || !t.includes('NAFTA'))) {
      return 'Infinia Diesel (Grado 3)';
    }
    if (t.includes('DIESEL') || t.includes('GASOIL') || t.includes('ULTRA') || t.includes('500') || t.includes('EURO')) {
      return 'Diesel Común / Grado 2';
    }
    if (t.includes('NAFTA') && t.includes('INFINIA')) {
      return 'Nafta Infinia';
    }
    if (t.includes('NAFTA') || t.includes('SUPER')) {
      return 'Nafta Súper';
    }
    return rawTipo?.trim() || 'Combustible';
  };

  const fuelByTypeMap = new Map<
    string,
    { tipoCombustible: string; litrosTotal: number; cargasCount: number; montoTotal: number }
  >();
  combustiblesAuto
    .filter((c) => !c.excluded)
    .forEach((c) => {
      const label = normalizeFuelTypeLabel(c.tipoCombustible);
      if (!fuelByTypeMap.has(label)) {
        fuelByTypeMap.set(label, { tipoCombustible: label, litrosTotal: 0, cargasCount: 0, montoTotal: 0 });
      }
      const grp = fuelByTypeMap.get(label)!;
      grp.litrosTotal += Number(c.litros || 0);
      grp.cargasCount += 1;
      grp.montoTotal += Number(c.monto || 0);
    });

  gastosManuales
    .filter((g) => g.categoria === 'COMBUSTIBLE')
    .forEach((g) => {
      const label = 'Combustible Manual / Directo';
      if (!fuelByTypeMap.has(label)) {
        fuelByTypeMap.set(label, { tipoCombustible: label, litrosTotal: 0, cargasCount: 0, montoTotal: 0 });
      }
      const grp = fuelByTypeMap.get(label)!;
      grp.cargasCount += 1;
      grp.montoTotal += Number(g.monto || 0);
    });

  const combustiblesPorTipo: CombustiblePorTipoResumen[] = Array.from(fuelByTypeMap.values())
    .map((g) => ({
      tipoCombustible: g.tipoCombustible,
      litrosTotal: Number(g.litrosTotal.toFixed(2)),
      cargasCount: g.cargasCount,
      precioPromedioLitro:
        g.litrosTotal > 0 ? Number((g.montoTotal / g.litrosTotal).toFixed(2)) : Number(cfg.precioCombustibleReferencia || 1500),
      montoTotal: Number(g.montoTotal.toFixed(2))
    }))
    .sort((a, b) => b.montoTotal - a.montoTotal);

  // 6c. Amortización de Vehículos / Equipos activos en la obra
  const amortizacionesAuto: AutoDetectedAmortizacionCost[] = equiposEnObra.map((eq) => {
    const excludeKey = `AMORT:${eq.key}`;
    const isExcluded = excludedSet.has(excludeKey);
    const override = cfg.tarifasAmortizacionOverride?.[eq.key];
    const veh = eq.key.startsWith('VEH:')
      ? fleet.find((f) => f.id === eq.key.slice(4))
      : findMatchingVehicle({ codigoEquipo: eq.codigoInterno, marcaModelo: eq.label }, fleet);

    const dias = Math.max(0, eq.diasCount);
    const horas = Math.max(0, eq.horasTotal);
    const horasBase = horas > 0 ? horas : Math.max(0, eq.horasHorometroReal || 0);

    let modoCalculo: 'HORA' | 'DIA' | 'FIJO' = override?.modo || (horasBase > 0 ? 'HORA' : 'DIA');
    let tarifaAplicada = 0;
    let fuenteTarifa = 'Sin tarifa asignada';
    let montoTotal = 0;

    if (override?.modo === 'FIJO' && override.montoFijo !== undefined && override.montoFijo >= 0) {
      modoCalculo = 'FIJO';
      tarifaAplicada = Number(override.montoFijo);
      fuenteTarifa = 'Monto fijo manual en obra';
      montoTotal = Number(tarifaAplicada.toFixed(2));
    } else if (override?.modo === 'HORA' && override.costoPorHora !== undefined && override.costoPorHora >= 0) {
      modoCalculo = 'HORA';
      tarifaAplicada = Number(override.costoPorHora);
      fuenteTarifa = 'Tarifa amort. manual ($/hs)';
      montoTotal = Number((horasBase * tarifaAplicada).toFixed(2));
    } else if (override?.modo === 'DIA' && override.costoPorDia !== undefined && override.costoPorDia >= 0) {
      modoCalculo = 'DIA';
      tarifaAplicada = Number(override.costoPorDia);
      fuenteTarifa = 'Tarifa amort. manual ($/día)';
      montoTotal = Number((dias * tarifaAplicada).toFixed(2));
    } else if (veh && Number(veh.precioCostoHora || 0) > 0 && horasBase > 0) {
      modoCalculo = 'HORA';
      tarifaAplicada = Number(veh.precioCostoHora);
      fuenteTarifa = 'Ficha Vehículo ($/hs)';
      montoTotal = Number((horasBase * tarifaAplicada).toFixed(2));
    } else if (veh && Number(veh.precioCosto || 0) > 0) {
      if (veh.modalidadTarifa === 'HORAS' && horasBase > 0) {
        modoCalculo = 'HORA';
        tarifaAplicada = Number(veh.precioCosto);
        fuenteTarifa = 'Ficha Vehículo ($/hs)';
        montoTotal = Number((horasBase * tarifaAplicada).toFixed(2));
      } else {
        modoCalculo = 'DIA';
        tarifaAplicada = Number(veh.precioCosto);
        fuenteTarifa = 'Ficha Vehículo ($/día)';
        montoTotal = Number((dias * tarifaAplicada).toFixed(2));
      }
    } else if (Number(cfg.amortizacionPorHoraDefault || 0) > 0 && horasBase > 0) {
      modoCalculo = 'HORA';
      tarifaAplicada = Number(cfg.amortizacionPorHoraDefault);
      fuenteTarifa = 'Tarifa Ref. Obra ($/hs)';
      montoTotal = Number((horasBase * tarifaAplicada).toFixed(2));
    } else if (Number(cfg.amortizacionPorDiaDefault || 0) > 0) {
      modoCalculo = 'DIA';
      tarifaAplicada = Number(cfg.amortizacionPorDiaDefault);
      fuenteTarifa = 'Tarifa Ref. Obra ($/día)';
      montoTotal = Number((dias * tarifaAplicada).toFixed(2));
    }

    return {
      excludeKey,
      equipoKey: eq.key,
      equipoLabel: eq.label,
      codigoInterno: eq.codigoInterno,
      diasTrabajados: dias,
      horasTrabajadas: horas,
      horasHorometroReal: eq.horasHorometroReal,
      modoCalculo,
      tarifaAplicada,
      fuenteTarifa,
      montoTotal,
      excluded: isExcluded
    };
  });

  // 7. Sum totals (auto + manual)
  const totalCombustibleAuto = combustiblesAuto
    .filter((c) => !c.excluded)
    .reduce((acc, c) => acc + c.monto, 0);
  const totalLubricantesAuto = lubricantesGrasasAuto
    .filter((c) => !c.excluded)
    .reduce((acc, c) => acc + c.monto, 0);
  const totalReparacionesAuto = reparacionesAuto
    .filter((c) => !c.excluded)
    .reduce((acc, c) => acc + c.monto, 0);
  const totalSueldosAuto = sueldosAuto
    .filter((c) => !c.excluded)
    .reduce((acc, c) => acc + c.montoTotal, 0);

  const totalManualCombustible = gastosManuales
    .filter((g) => g.categoria === 'COMBUSTIBLE')
    .reduce((acc, g) => acc + Number(g.monto || 0), 0);
  const totalManualLubricantes = gastosManuales
    .filter((g) => g.categoria === 'LUBRICANTES_GRASA_ACEITE')
    .reduce((acc, g) => acc + Number(g.monto || 0), 0);
  const totalManualReparaciones = gastosManuales
    .filter((g) => g.categoria === 'REPARACION_MANTENIMIENTO')
    .reduce((acc, g) => acc + Number(g.monto || 0), 0);
  const totalManualSueldos = gastosManuales
    .filter((g) => g.categoria === 'SUELDOS_JORNALES')
    .reduce((acc, g) => acc + Number(g.monto || 0), 0);
  const totalManualOtros = gastosManuales
    .filter(
      (g) =>
        !['COMBUSTIBLE', 'LUBRICANTES_GRASA_ACEITE', 'REPARACION_MANTENIMIENTO', 'SUELDOS_JORNALES'].includes(
          g.categoria
        )
    )
    .reduce((acc, g) => acc + Number(g.monto || 0), 0);

  const totalCombustible = Number((totalCombustibleAuto + totalManualCombustible).toFixed(2));
  const totalLubricantes = Number((totalLubricantesAuto + totalManualLubricantes).toFixed(2));
  const totalReparaciones = Number((totalReparacionesAuto + totalManualReparaciones).toFixed(2));
  const totalSueldos = Number((totalSueldosAuto + totalManualSueldos).toFixed(2));
  const totalOtrosDirectos = Number(totalManualOtros.toFixed(2));
  const totalCostosDirectos = Number(
    (totalCombustible + totalLubricantes + totalReparaciones + totalSueldos + totalOtrosDirectos).toFixed(2)
  );

  // 8. Facturación (Ingresos) — excluir legajos de contrato aún pendientes de facturar
  const facturasEmitidas = facturas.filter(
    (f) => !f.pendienteFacturacion && f.tipoComprobante !== 'CONTRATO DE ALQUILER'
  );
  const facturadoNetoSinIva = Number(
    facturasEmitidas.reduce((acc, f) => acc + Number(f.netoGravado || 0), 0).toFixed(2)
  );
  const facturadoIva = Number(
    facturasEmitidas.reduce((acc, f) => acc + Number(f.ivaMonto || 0), 0).toFixed(2)
  );
  const facturadoTotalConIva = Number(
    facturasEmitidas.reduce((acc, f) => acc + Number(f.importeTotal || 0), 0).toFixed(2)
  );
  const cobradoTotal = Number(
    facturasEmitidas
      .reduce(
        (acc, f) =>
          acc +
          resolveFacturaLegajoLiveStatus(
            f,
            arcaInvoices,
            customerReceipts,
            rentals,
            partesDiarios
          ).montoCobrado,
        0
      )
      .toFixed(2)
  );
  const pendienteCobroTotal = Number(
    Math.max(0, facturadoTotalConIva - cobradoTotal).toFixed(2)
  );

  // 9. Paquete Administrativo / Gastos Generales
  const porcentajeGastosGenerales = Number(cfg.porcentajeGastosGenerales || 0);
  const baseCalculoGastosGenerales = cfg.baseCalculoGastosGenerales || 'COSTOS_DIRECTOS';
  const montoFijoAdministrativo = Number(cfg.montoFijoAdministrativo || 0);
  const basePaquete =
    baseCalculoGastosGenerales === 'FACTURACION_NETA' ? facturadoNetoSinIva : totalCostosDirectos;
  const totalGastosGenerales = Number(
    ((basePaquete * porcentajeGastosGenerales) / 100 + montoFijoAdministrativo).toFixed(2)
  );

  // 10. Amortización de Vehículos / Equipos
  const totalAmortizacionEquipos = Number(
    amortizacionesAuto
      .filter((a) => !a.excluded)
      .reduce((acc, a) => acc + a.montoTotal, 0)
      .toFixed(2)
  );
  const porcentajeAmortizacionVehiculos = Number(cfg.porcentajeAmortizacionVehiculos || 0);
  const baseCalculoAmortizacion = cfg.baseCalculoAmortizacion || 'COSTOS_DIRECTOS';
  const montoFijoAmortizacionVehiculos = Number(cfg.montoFijoAmortizacionVehiculos || 0);
  const baseAmort =
    baseCalculoAmortizacion === 'FACTURACION_NETA' ? facturadoNetoSinIva : totalCostosDirectos;
  const totalAmortizacionVehiculos = Number(
    (
      totalAmortizacionEquipos +
      (baseAmort * porcentajeAmortizacionVehiculos) / 100 +
      montoFijoAmortizacionVehiculos
    ).toFixed(2)
  );

  const costoTotalObra = Number(
    (totalCostosDirectos + totalGastosGenerales + totalAmortizacionVehiculos).toFixed(2)
  );

  const evaluarSobreNetoSinIva = cfg.evaluarSobreNetoSinIva !== false;
  const baseIngresosEvaluacion = evaluarSobreNetoSinIva ? facturadoNetoSinIva : facturadoTotalConIva;
  const resultadoNeto = Number((baseIngresosEvaluacion - costoTotalObra).toFixed(2));
  const margenPorcentaje =
    baseIngresosEvaluacion > 0
      ? Number(((resultadoNeto / baseIngresosEvaluacion) * 100).toFixed(1))
      : 0;

  return {
    diasObraUnicos,
    equiposEnObra,
    partesVinculados,
    rentalsVinculados,
    combustiblesAuto,
    combustiblesPorTipo,
    lubricantesGrasasAuto,
    reparacionesAuto,
    sueldosAuto,
    amortizacionesAuto,
    totalCombustibleAuto,
    totalLubricantesAuto,
    totalReparacionesAuto,
    totalSueldosAuto,
    totalManualCombustible,
    totalManualLubricantes,
    totalManualReparaciones,
    totalManualSueldos,
    totalManualOtros,
    totalCombustible,
    totalLubricantes,
    totalReparaciones,
    totalSueldos,
    totalOtrosDirectos,
    totalCostosDirectos,
    porcentajeGastosGenerales,
    baseCalculoGastosGenerales,
    montoFijoAdministrativo,
    totalGastosGenerales,
    totalAmortizacionEquipos,
    porcentajeAmortizacionVehiculos,
    baseCalculoAmortizacion,
    montoFijoAmortizacionVehiculos,
    totalAmortizacionVehiculos,
    costoTotalObra,
    facturadoNetoSinIva,
    facturadoIva,
    facturadoTotalConIva,
    cobradoTotal,
    pendienteCobroTotal,
    baseIngresosEvaluacion,
    evaluarSobreNetoSinIva,
    resultadoNeto,
    margenPorcentaje
  };
}
