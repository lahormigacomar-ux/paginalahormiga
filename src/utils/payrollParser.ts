export interface PayrollBasicItem {
  id: string;
  concepto: string;
  unidades: number; // ej. 17 días, 2 presentismo, 1.5 almuerzo
  ingreso: number;  // ej. unidades * valorBase (o monto manual como redondeo)
  egreso: number;
  manualMonto?: boolean;
  referenciaBase?: string; // ej. "$ 940,000.00" en la columna FECHA al lado de AGUINALDO
  sheetRowIndex?: number; // 0-indexed row in Google Sheet
}

export type PayrollMovementCategory =
  | 'HORA_EXTRA'
  | 'DESCUENTO'
  | 'ANTICIPO'
  | 'TRANSFERENCIA';

export interface PayrollExtraItem {
  id: string;
  fechaDetalle?: string; // ej. "17/10/2025", "24/10/2025", "10.10"
  cantidad: number; // ej. 2 hs, 12 hs, 32.5 hs
  concepto: string; // ej. HORA 8 HS, COMBUSTIBLE, TRANSFERENCIA A CTA, CANCELACION
  tarifaUnitaria: number; // ej. 4000, 4250, 5000
  ingreso: number;
  egreso: number;
  manualMonto?: boolean;
  sheetRowIndex?: number; // 0-indexed row in Google Sheet
  tipoMovimiento?: PayrollMovementCategory;
}

export function classifyPayrollExtraItem(
  item: Pick<
    PayrollExtraItem,
    'concepto' | 'tarifaUnitaria' | 'ingreso' | 'egreso' | 'tipoMovimiento'
  >
): PayrollMovementCategory {
  const concept = String(item.concepto || '').trim().toUpperCase();
  const hasIngreso = (Number(item.ingreso) || 0) > 0;
  const hasEgreso = (Number(item.egreso) || 0) > 0;
  const hasRate = (Number(item.tarifaUnitaria) || 0) > 0;

  if (hasIngreso && !hasEgreso) {
    return 'HORA_EXTRA';
  }

  // Explicit transfer detection by keyword or stored category (always stays at bottom before TOTAL EXTRA)
  if (
    item.tipoMovimiento === 'TRANSFERENCIA' ||
    (/(TRANSFERENCIA|TRASNFERENCIA|TRASFERENCIA|\bTRANSF\.?|\bTRASF\.?|\bTRANF\.?|CANCELACION|DEPOSITO\s*(CTA|BANC)|\bA\s*CTA\b|MERCADO\s*PAGO)/.test(
      concept
    ) &&
      (hasEgreso || (!hasIngreso && !hasRate)))
  ) {
    return 'TRANSFERENCIA';
  }

  // Explicit anticipo detection (grouped above transfers)
  if (
    item.tipoMovimiento === 'ANTICIPO' ||
    (/\bANTICIPO|\bADELANTO/.test(concept) && (hasEgreso || (!hasIngreso && !hasRate)))
  ) {
    return 'ANTICIPO';
  }

  // Explicit discount detection (grouped above transfers)
  if (item.tipoMovimiento === 'DESCUENTO' || hasEgreso) {
    return 'DESCUENTO';
  }

  if (item.tipoMovimiento === 'HORA_EXTRA' || hasRate || hasIngreso || /\bHORA\b|DESARRAIGO|FONDO\s+DE\s+CESE/.test(concept)) {
    return 'HORA_EXTRA';
  }

  return 'HORA_EXTRA';
}

export function orderPayrollExtraItems(items: PayrollExtraItem[]): PayrollExtraItem[] {
  const rankOf = (it: PayrollExtraItem): number => {
    const cat = classifyPayrollExtraItem(it);
    if (cat === 'HORA_EXTRA') return 0;
    if (cat === 'DESCUENTO' || cat === 'ANTICIPO') return 1;
    return 2; // TRANSFERENCIA goes last (abajo)
  };
  return items
    .map((item, originalIndex) => ({ item, originalIndex, rank: rankOf(item) }))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.originalIndex - b.originalIndex))
    .map(entry => entry.item);
}

export interface RSheetCellSource {
  tabTitle: string;
  rowIndex: number; // 0-indexed row in Google Sheet R-XX.YYYY
  colMap: {
    empleado: number;
    basico?: number;
    extras?: number;
    total?: number;
    descuentos?: number;
    totalACobrar?: number;
    transf?: number;
    efectivo?: number;
    saldo?: number;
    obs?: number;
    alias?: number;
    cbu?: number;
  };
}

export interface RSheetRowValues {
  basico?: number;
  extras?: number;
  total?: number;
  descuentos?: number;
  totalACobrar?: number;
}

export interface EmployeePayrollSlip {
  id: string;
  empleadoNombre: string;
  empleadoId?: string;
  grupoSemana: string; // ej. "1ERA SEMANA - LA HORMIGA", "2DA SEMANA - LA HORMIGA", "3 ERA SEMANA - LA HORMIGA", "4TA SEMANA - LA HORMIGA"
  numeroSemana?: number; // 1, 2, 3, 4, 5
  mesTexto: string;    // ej. "OCTUBRE", "SEP - OCT", "OCT-NOV"
  rangoFecha: string;  // ej. "01.10 AL 31.10", "15.09 AL 14.10", "20.09 AL 21.10", "25.09 AL 26.10"
  valorBaseJornal: number; // ej. 60000
  codigoCabecera?: string; // ej. "1.000", "0", "0.000", "0.167", "1.120"
  basicItems: PayrollBasicItem[];
  extraItems: PayrollExtraItem[];
  totalBasicoIngresos: number;
  totalBasicoEgresos: number;
  totalExtraIngresos: number;
  totalExtraEgresos: number;
  totalIngresos: number; // TOTAL LIQUIDADO (Básico + Extras)
  totalEgresos: number;  // TOTAL DESCUENTOS + ANTICIPOS + TRANSFERENCIAS A CTA
  netoACobrar: number;   // SALDO A COBRAR (totalIngresos - totalEgresos)
  etiquetaNeto?: string; // ej. "A COBRAR" o "PAGADO DEMAS"
  observaciones?: string;
  // Campos de la hoja resumen (R-XX.YYYY): pagos, saldo real, alias y CBU
  pagoTransferencia?: number;
  pagoEfectivo?: number;
  observacionesPago?: string;
  aliasBancario?: string;
  cbuBancario?: string;
  rSheetSource?: RSheetCellSource;
  rSheetValues?: RSheetRowValues;
  sheetSource?: {
    tabTitle: string;
    headerRowIndex: number;
    startColIndex: number;
    totalBasicoRowIndex?: number;
    totalExtraRowIndex?: number;
  };
}

export interface PayrollPeriodRecord {
  id: string; // ej. "PER-2026-10"
  nombrePeriodo: string; // ej. "OCTUBRE 2026"
  rangoDefault: string; // ej. "01.10 AL 31.10"
  grupoDefault: string; // ej. "1ERA SEMANA - LA HORMIGA"
  sheetTabName?: string;
  companionRSheetTabName?: string;
  slips: EmployeePayrollSlip[];
  updatedAt: string;
}

export interface WeeklyPayrollSummary {
  numeroSemana: number;
  grupoSemana: string;
  fichasCount: number;
  totalBasico: number;
  totalExtras: number;
  totalIngresos: number; // Total Liquidado en la semana (Básico + Extras)
  totalDescuentos: number; // Total Egresos / Transferencias / Anticipos
  totalNeto: number; // Saldo A Cobrar pendiente
  slips: EmployeePayrollSlip[];
}

export interface ConsolidatedEmployeeMonthlySummary {
  empleadoKey: string;
  empleadoNombre: string;
  valorBaseJornal: number;
  fichasCount: number;
  porSemana: Record<
    number,
    {
      ingresos: number;
      neto: number;
      basico: number;
      extras: number;
      descuentos: number;
      descuentosReales: number;
      totalACobrar: number;
      pagoTransferencia: number;
      pagoEfectivo: number;
      saldo: number;
      horasExtrasCant: number;
      slipId?: string;
    }
  >;
  totalBasicoMes: number;
  totalExtrasMes: number;
  totalHorasExtrasCantMes: number;
  totalIngresosMes: number;
  totalDescuentosMes: number;
  totalDescuentosRealesMes: number;
  totalACobrarMes: number;
  totalTransfMes: number;
  totalEfectivoMes: number;
  totalSaldoMes: number;
  totalNetoMes: number;
  aliasBancario?: string;
  cbuBancario?: string;
  observacionesMes?: string;
  slips: EmployeePayrollSlip[];
}

export interface SlipSummaryBreakdown {
  basico: number;
  extras: number;
  total: number;
  descuentos: number; // Solo descuentos y anticipos (sin transferencias)
  transferenciasEnFicha: number;
  totalACobrar: number; // Total - Descuentos
  pagoTransferencia: number;
  pagoEfectivo: number;
  saldo: number; // Total a Cobrar - Transf. - Efectivo
}

export function getSlipSummaryBreakdown(slip: EmployeePayrollSlip): SlipSummaryBreakdown {
  const calcBasico = Math.round((Number(slip.totalBasicoIngresos) || 0) * 100) / 100;
  const calcExtras = Math.round((Number(slip.totalExtraIngresos) || 0) * 100) / 100;

  let transferenciasEnFicha = 0;
  let efectivoEnFicha = 0;
  let descuentosExtra = 0;
  for (const it of slip.extraItems || []) {
    const eg = Number(it.egreso) || 0;
    if (eg <= 0) continue;
    const conceptUp = String(it.concepto || '').trim().toUpperCase();
    if (classifyPayrollExtraItem(it) === 'TRANSFERENCIA') {
      transferenciasEnFicha += eg;
    } else if (/^(PAGO\s+(EN\s+)?|CANCELACION\s+(EN\s+)?)?EFECTIVO$/i.test(conceptUp)) {
      efectivoEnFicha += eg;
    } else {
      descuentosExtra += eg;
    }
  }
  const calcDescuentos =
    Math.round(((Number(slip.totalBasicoEgresos) || 0) + descuentosExtra) * 100) / 100;
  transferenciasEnFicha = Math.round(transferenciasEnFicha * 100) / 100;
  efectivoEnFicha = Math.round(efectivoEnFicha * 100) / 100;

  const rawRv = slip.rSheetValues;
  const rvIsCorruptEmpty =
    rawRv !== undefined &&
    rawRv.basico === undefined &&
    rawRv.total === 0 &&
    (calcBasico > 0 || calcExtras > 0);
  const rv = rvIsCorruptEmpty ? undefined : rawRv;
  const basico =
    rv?.basico !== undefined ? Math.round((Number(rv.basico) || 0) * 100) / 100 : calcBasico;
  const extras =
    rv?.extras !== undefined ? Math.round((Number(rv.extras) || 0) * 100) / 100 : calcExtras;
  const total =
    rv?.total !== undefined
      ? Math.round((Number(rv.total) || 0) * 100) / 100
      : Math.round((basico + extras) * 100) / 100;
  const descuentos =
    rv?.descuentos !== undefined
      ? Math.round((Number(rv.descuentos) || 0) * 100) / 100
      : calcDescuentos;
  const totalACobrar =
    rv?.totalACobrar !== undefined
      ? Math.round((Number(rv.totalACobrar) || 0) * 100) / 100
      : Math.round((total - descuentos) * 100) / 100;

  const pagoTransferencia =
    slip.pagoTransferencia !== undefined
      ? Math.round((Number(slip.pagoTransferencia) || 0) * 100) / 100
      : transferenciasEnFicha;
  const pagoEfectivo =
    slip.pagoEfectivo !== undefined
      ? Math.round((Number(slip.pagoEfectivo) || 0) * 100) / 100
      : efectivoEnFicha;
  const saldo = Math.round((totalACobrar - pagoTransferencia - pagoEfectivo) * 100) / 100;

  return {
    basico,
    extras,
    total,
    descuentos,
    transferenciasEnFicha,
    totalACobrar,
    pagoTransferencia,
    pagoEfectivo,
    saldo,
  };
}

export type PayrollCompanyGroup = 'LA_HORMIGA' | 'TUBOMUNDO' | 'GRUPO_IDN';

export const PAYROLL_COMPANY_GROUPS: {
  id: PayrollCompanyGroup;
  label: string;
  shortLabel: string;
  defaultSuffix: string;
}[] = [
  {
    id: 'LA_HORMIGA',
    label: 'LA HORMIGA',
    shortLabel: 'La Hormiga',
    defaultSuffix: 'LA HORMIGA',
  },
  {
    id: 'TUBOMUNDO',
    label: 'TUBOMUNDO',
    shortLabel: 'Tubomundo',
    defaultSuffix: 'TUBOMUNDO',
  },
  {
    id: 'GRUPO_IDN',
    label: 'GRUPO IDN',
    shortLabel: 'Grupo IDN (Admin / Maestranza)',
    defaultSuffix: 'GRUPO IDN',
  },
];

export function classifyPayrollGroupFromBanner(grupoSemana?: string): PayrollCompanyGroup {
  const upper = String(grupoSemana || '').toUpperCase().trim();
  if (/TUBOMUNDO/.test(upper)) return 'TUBOMUNDO';
  if (/LA\s*HORMIGA/.test(upper)) return 'LA_HORMIGA';
  // Todo lo demás en el libro de sueldos (ADMINISTRATIVOS, MAESTRANZA, GRUPO IDN, IDN, etc.) pertenece a GRUPO IDN
  if (/GRUPO\s*IDN|\bIDN\b|ADMINISTRATIVO|MAESTRANZA|GERENCIA|COMERCIAL/.test(upper)) {
    return 'GRUPO_IDN';
  }
  return 'LA_HORMIGA';
}

export function getPayrollGroupDisplayName(group: PayrollCompanyGroup | 'ALL'): string {
  if (group === 'ALL') return 'TODOS LOS GRUPOS';
  const found = PAYROLL_COMPANY_GROUPS.find(g => g.id === group);
  return found ? found.label : 'LA HORMIGA';
}

export const STANDARD_WEEKS = [
  { num: 1, label: '1ERA SEMANA - LA HORMIGA', shortLabel: '1° Semana' },
  { num: 2, label: '2DA SEMANA - LA HORMIGA', shortLabel: '2° Semana' },
  { num: 3, label: '3 ERA SEMANA - LA HORMIGA', shortLabel: '3° Semana' },
  { num: 4, label: '4TA SEMANA - LA HORMIGA', shortLabel: '4° Semana' },
  { num: 5, label: '5TA SEMANA - LA HORMIGA', shortLabel: '5° Semana' },
];

export function getStandardWeeksForGroup(
  group: PayrollCompanyGroup | 'ALL' = 'LA_HORMIGA'
): { num: number; label: string; shortLabel: string }[] {
  const suffix =
    group === 'TUBOMUNDO'
      ? 'TUBOMUNDO'
      : group === 'GRUPO_IDN'
      ? 'GRUPO IDN'
      : 'LA HORMIGA';
  return [
    { num: 1, label: `1ERA SEMANA - ${suffix}`, shortLabel: '1° Semana' },
    { num: 2, label: `2DA SEMANA - ${suffix}`, shortLabel: '2° Semana' },
    { num: 3, label: `3 ERA SEMANA - ${suffix}`, shortLabel: '3° Semana' },
    { num: 4, label: `4TA SEMANA - ${suffix}`, shortLabel: '4° Semana' },
    { num: 5, label: `5TA SEMANA - ${suffix}`, shortLabel: '5° Semana' },
  ];
}

export function detectWeekNumberFromText(raw: string): number {
  const upper = String(raw || '').toUpperCase().trim();
  if (/1\s*ERA|1\s*RA|1\s*ER\b|1°|1º|PRIMERA|SEMANA\s*1\b/.test(upper)) return 1;
  if (/2\s*DA|2°|2º|SEGUNDA|SEMANA\s*2\b/.test(upper)) return 2;
  if (/3\s*ERA|3\s*RA|3\s*ER|3°|3º|TERCERA|SEMANA\s*3\b/.test(upper)) return 3;
  if (/4\s*TA|4°|4º|CUARTA|SEMANA\s*4\b/.test(upper)) return 4;
  if (/5\s*TA|5°|5º|QUINTA|SEMANA\s*5\b/.test(upper)) return 5;
  return 1;
}

export function getCanonicalWeekBanner(
  weekNum: number,
  customText?: string,
  group?: PayrollCompanyGroup | 'ALL'
): string {
  const cleaned = String(customText || '').trim().toUpperCase();
  if (cleaned && /TUBOMUNDO|ADMINISTRATIVOS|MAESTRANZA|GRUPO\s*IDN|\bIDN\b|LA\s*HORMIGA/i.test(cleaned)) {
    return cleaned.replace(/\s+/g, ' ');
  }
  const weeksList = getStandardWeeksForGroup(group && group !== 'ALL' ? group : 'LA_HORMIGA');
  const found = weeksList.find(w => w.num === weekNum);
  if (found) return found.label;
  return cleaned || weeksList[0].label;
}

export function normalizeEmployeeKey(name: string): string {
  return String(name || '')
    .toUpperCase()
    .replace(/^\s*((?:1\s*ERA|1\s*RA|1\s*ER|2\s*DA|3\s*ERA|3\s*RA|3\s*ER|4\s*TA|5\s*TA)(?:\s+SEMANA)?)\s*[-–:]*\s*/i, '')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, '')
    .replace(/\s*[-–—]\s*(?:MAESTRANZA|ADMINISTRATIVOS?|CONTADORA?)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseCurrencyNumber(raw: any): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const str = String(raw ?? '').trim();
  if (!str || str === '-' || str === '$-' || str === '$ -') return 0;

  const cleaned = str.replace(/[^0-9.,-]/g, '');
  if (!cleaned || cleaned === '-') return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastDot > lastComma) {
      return parseFloat(cleaned.replace(/,/g, '')) || 0;
    } else {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
  }

  if (lastComma > -1) {
    const parts = cleaned.split(',');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      return parseFloat(cleaned.replace(/,/g, '')) || 0;
    }
    return parseFloat(cleaned.replace(',', '.')) || 0;
  }

  return parseFloat(cleaned) || 0;
}

export function isLikelyDateString(raw: string): boolean {
  const s = String(raw || '').trim();
  if (!s) return false;
  // Matches "17/10/2025", "24/10/2025", "30/11/25", "4/11/2025", "1-10", "31-10", "02-11"
  if (/^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(s)) return true;
  // Matches "10.10", "24.10", "25.9", "17.10" (day.month format) — avoid matching decimal hours like "1.5"
  if (/^\d{1,2}\.(0[1-9]|1[0-2])$/.test(s)) return true;
  return false;
}

export function recalculatePayrollSlip(slip: EmployeePayrollSlip): EmployeePayrollSlip {
  const valorBase = Number(slip.valorBaseJornal) || 0;
  const numeroSemana = slip.numeroSemana || detectWeekNumberFromText(slip.grupoSemana);

  const basicItems = slip.basicItems.map(it => {
    const unidades = Number(it.unidades) || 0;
    const isRedondeo = /REDONDEO|AGUINALDO/i.test(it.concepto);
    const ingreso =
      it.manualMonto || isRedondeo
        ? Number(it.ingreso) || 0
        : unidades > 0 && valorBase > 0
          ? Math.round(unidades * valorBase * 100) / 100
          : Number(it.ingreso) || 0;
    return {
      ...it,
      unidades,
      ingreso,
      egreso: Number(it.egreso) || 0,
    };
  });

  const extraItems = slip.extraItems.map(it => {
    const cantidad = Number(it.cantidad) || 0;
    const tarifa = Number(it.tarifaUnitaria) || 0;
    const egreso = Number(it.egreso) || 0;
    const currentIngreso = Number(it.ingreso) || 0;
    const ingreso = it.manualMonto
      ? currentIngreso
      : currentIngreso > 0
        ? currentIngreso
        : egreso === 0 && cantidad > 0 && tarifa > 0
          ? Math.round(cantidad * tarifa * 100) / 100
          : 0;
    return {
      ...it,
      cantidad,
      tarifaUnitaria: tarifa,
      ingreso,
      egreso,
    };
  });

  const totalBasicoIngresos =
    Math.round(basicItems.reduce((acc, it) => acc + (Number(it.ingreso) || 0), 0) * 100) / 100;
  const totalBasicoEgresos =
    Math.round(basicItems.reduce((acc, it) => acc + (Number(it.egreso) || 0), 0) * 100) / 100;
  const totalExtraIngresos =
    Math.round(extraItems.reduce((acc, it) => acc + (Number(it.ingreso) || 0), 0) * 100) / 100;
  const totalExtraEgresos =
    Math.round(extraItems.reduce((acc, it) => acc + (Number(it.egreso) || 0), 0) * 100) / 100;

  const totalIngresos = Math.round((totalBasicoIngresos + totalExtraIngresos) * 100) / 100;
  const totalEgresos = Math.round((totalBasicoEgresos + totalExtraEgresos) * 100) / 100;
  const netoACobrar = Math.round((totalIngresos - totalEgresos) * 100) / 100;

  return {
    ...slip,
    numeroSemana,
    grupoSemana: slip.grupoSemana || getCanonicalWeekBanner(numeroSemana),
    basicItems,
    extraItems,
    totalBasicoIngresos,
    totalBasicoEgresos,
    totalExtraIngresos,
    totalExtraEgresos,
    totalIngresos,
    totalEgresos,
    netoACobrar,
  };
}

export function createDefaultSlipTemplate(
  empleadoNombre: string,
  mesTexto = 'OCTUBRE',
  rangoFecha = '01.10 AL 31.10',
  grupoSemana = '1ERA SEMANA - LA HORMIGA',
  valorBaseJornal = 60000
): EmployeePayrollSlip {
  const numeroSemana = detectWeekNumberFromText(grupoSemana);
  const slip: EmployeePayrollSlip = {
    id: `SLIP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    empleadoNombre: empleadoNombre.toUpperCase(),
    grupoSemana,
    numeroSemana,
    mesTexto,
    rangoFecha,
    valorBaseJornal,
    codigoCabecera: '1.000',
    basicItems: [
      { id: 'b-1', concepto: 'BASICO', unidades: 17, ingreso: 17 * valorBaseJornal, egreso: 0 },
      { id: 'b-2', concepto: 'PRESENTISMO', unidades: 2, ingreso: 2 * valorBaseJornal, egreso: 0 },
      { id: 'b-3', concepto: 'PAGO POR ALMUERZO', unidades: 1.5, ingreso: 1.5 * valorBaseJornal, egreso: 0 },
      { id: 'b-4', concepto: 'AGUINALDO', unidades: 0, ingreso: 0, egreso: 0 },
      { id: 'b-5', concepto: 'SIEMPRE LISTO 1', unidades: 1.5, ingreso: 1.5 * valorBaseJornal, egreso: 0 },
      { id: 'b-6', concepto: 'TRANSPORTE', unidades: 1.1, ingreso: 1.1 * valorBaseJornal, egreso: 0 },
      { id: 'b-7', concepto: 'ROTURA', unidades: 1.0, ingreso: 1.0 * valorBaseJornal, egreso: 0 },
      { id: 'b-8', concepto: 'REDONDEO', unidades: 0, ingreso: 0, egreso: 0, manualMonto: true },
    ],
    extraItems: [
      { id: 'e-1', cantidad: 0, concepto: 'HORA 8 HS VENDIDAAAA COBRADA', tarifaUnitaria: 4000, ingreso: 0, egreso: 0 },
      { id: 'e-2', cantidad: 0, concepto: 'HORA 9 HS', tarifaUnitaria: 4250, ingreso: 0, egreso: 0 },
      { id: 'e-3', cantidad: 0, concepto: 'HORA 10 HS', tarifaUnitaria: 4750, ingreso: 0, egreso: 0 },
      { id: 'e-4', cantidad: 0, concepto: 'HORA EXTRA LUNES A VIERNES', tarifaUnitaria: 5000, ingreso: 0, egreso: 0 },
      { id: 'e-5', cantidad: 0, concepto: 'HORA NOCTURNA O DOMINGO/FERIADO', tarifaUnitaria: 7000, ingreso: 0, egreso: 0 },
      { id: 'e-6', cantidad: 0, concepto: 'DESARRAIGO', tarifaUnitaria: 15000, ingreso: 0, egreso: 0 },
      { id: 'e-7', cantidad: 0, concepto: 'HORA SABADO MAQUINA', tarifaUnitaria: 5000, ingreso: 0, egreso: 0 },
    ],
    totalBasicoIngresos: 0,
    totalBasicoEgresos: 0,
    totalExtraIngresos: 0,
    totalExtraEgresos: 0,
    totalIngresos: 0,
    totalEgresos: 0,
    netoACobrar: 0,
    etiquetaNeto: 'A COBRAR',
  };

  return recalculatePayrollSlip(slip);
}

/**
 * Summarizes all slips in a period grouped by week separator
 * (1ERA SEMANA, 2DA SEMANA, 3 ERA SEMANA, 4TA SEMANA).
 */
export function summarizeSlipsByWeek(
  slips: EmployeePayrollSlip[],
  activeGroup: PayrollCompanyGroup | 'ALL' = 'LA_HORMIGA'
): WeeklyPayrollSummary[] {
  const map = new Map<number, WeeklyPayrollSummary>();

  for (let w = 1; w <= 4; w++) {
    map.set(w, {
      numeroSemana: w,
      grupoSemana:
        activeGroup === 'ALL'
          ? `${w}° SEMANA — TODOS LOS GRUPOS`
          : getCanonicalWeekBanner(w, undefined, activeGroup),
      fichasCount: 0,
      totalBasico: 0,
      totalExtras: 0,
      totalIngresos: 0,
      totalDescuentos: 0,
      totalNeto: 0,
      slips: [],
    });
  }

  for (const slip of slips) {
    const wNum = slip.numeroSemana || detectWeekNumberFromText(slip.grupoSemana);
    if (!map.has(wNum)) {
      map.set(wNum, {
        numeroSemana: wNum,
        grupoSemana:
          activeGroup === 'ALL'
            ? `${wNum}° SEMANA — TODOS LOS GRUPOS`
            : slip.grupoSemana || getCanonicalWeekBanner(wNum, undefined, activeGroup),
        fichasCount: 0,
        totalBasico: 0,
        totalExtras: 0,
        totalIngresos: 0,
        totalDescuentos: 0,
        totalNeto: 0,
        slips: [],
      });
    }
    const bucket = map.get(wNum)!;
    // When filtered to a specific group and bucket still has the generic fallback banner, adopt the actual banner from the sheet (e.g. "1ERA SEMANA - ADMINISTRATIVOS")
    if (
      activeGroup !== 'ALL' &&
      bucket.fichasCount === 0 &&
      slip.grupoSemana &&
      classifyPayrollGroupFromBanner(slip.grupoSemana) === activeGroup
    ) {
      bucket.grupoSemana = slip.grupoSemana;
    } else if (
      activeGroup !== 'ALL' &&
      bucket.fichasCount > 0 &&
      slip.grupoSemana &&
      bucket.grupoSemana !== slip.grupoSemana &&
      !bucket.grupoSemana.includes(' / ')
    ) {
      const subA = bucket.grupoSemana.replace(/^.*SEMANA\s*-\s*/i, '').trim();
      const subB = slip.grupoSemana.replace(/^.*SEMANA\s*-\s*/i, '').trim();
      if (subA && subB && subA !== subB && !bucket.grupoSemana.includes(subB)) {
        bucket.grupoSemana = `${bucket.grupoSemana} / ${subB}`;
      }
    }
    bucket.fichasCount += 1;
    bucket.totalBasico = Math.round((bucket.totalBasico + (Number(slip.totalBasicoIngresos) || 0)) * 100) / 100;
    bucket.totalExtras = Math.round((bucket.totalExtras + (Number(slip.totalExtraIngresos) || 0)) * 100) / 100;
    bucket.totalIngresos = Math.round((bucket.totalIngresos + (Number(slip.totalIngresos) || 0)) * 100) / 100;
    bucket.totalDescuentos = Math.round((bucket.totalDescuentos + (Number(slip.totalEgresos) || 0)) * 100) / 100;
    bucket.totalNeto = Math.round((bucket.totalNeto + (Number(slip.netoACobrar) || 0)) * 100) / 100;
    bucket.slips.push(slip);
  }

  return Array.from(map.values()).sort((a, b) => a.numeroSemana - b.numeroSemana);
}

/**
 * Consolidates and sums employee slips across all weeks (1era + 2da + 3era + 4ta Semana).
 */
export function consolidateSlipsByEmployee(
  slips: EmployeePayrollSlip[]
): ConsolidatedEmployeeMonthlySummary[] {
  const map = new Map<string, ConsolidatedEmployeeMonthlySummary>();

  for (const slip of slips) {
    const key = normalizeEmployeeKey(slip.empleadoNombre);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        empleadoKey: key,
        empleadoNombre: slip.empleadoNombre,
        valorBaseJornal: slip.valorBaseJornal,
        fichasCount: 0,
        porSemana: {},
        totalBasicoMes: 0,
        totalExtrasMes: 0,
        totalHorasExtrasCantMes: 0,
        totalIngresosMes: 0,
        totalDescuentosMes: 0,
        totalDescuentosRealesMes: 0,
        totalACobrarMes: 0,
        totalTransfMes: 0,
        totalEfectivoMes: 0,
        totalSaldoMes: 0,
        totalNetoMes: 0,
        aliasBancario: undefined,
        cbuBancario: undefined,
        observacionesMes: undefined,
        slips: [],
      });
    }

    const rec = map.get(key)!;
    const wNum = slip.numeroSemana || detectWeekNumberFromText(slip.grupoSemana);
    const hsCant = slip.extraItems.reduce(
      (acc, it) => acc + (it.ingreso > 0 ? Number(it.cantidad) || 0 : 0),
      0
    );
    const bd = getSlipSummaryBreakdown(slip);

    const prevWeek = rec.porSemana[wNum] || {
      ingresos: 0,
      neto: 0,
      basico: 0,
      extras: 0,
      descuentos: 0,
      descuentosReales: 0,
      totalACobrar: 0,
      pagoTransferencia: 0,
      pagoEfectivo: 0,
      saldo: 0,
      horasExtrasCant: 0,
    };

    rec.porSemana[wNum] = {
      ingresos: prevWeek.ingresos + (Number(slip.totalIngresos) || 0),
      neto: prevWeek.neto + (Number(slip.netoACobrar) || 0),
      basico: prevWeek.basico + (Number(slip.totalBasicoIngresos) || 0),
      extras: prevWeek.extras + (Number(slip.totalExtraIngresos) || 0),
      descuentos: prevWeek.descuentos + (Number(slip.totalEgresos) || 0),
      descuentosReales: prevWeek.descuentosReales + bd.descuentos,
      totalACobrar: prevWeek.totalACobrar + bd.totalACobrar,
      pagoTransferencia: prevWeek.pagoTransferencia + bd.pagoTransferencia,
      pagoEfectivo: prevWeek.pagoEfectivo + bd.pagoEfectivo,
      saldo: prevWeek.saldo + bd.saldo,
      horasExtrasCant: prevWeek.horasExtrasCant + hsCant,
      slipId: slip.id,
    };

    rec.fichasCount += 1;
    rec.totalBasicoMes += Number(slip.totalBasicoIngresos) || 0;
    rec.totalExtrasMes += Number(slip.totalExtraIngresos) || 0;
    rec.totalHorasExtrasCantMes += hsCant;
    rec.totalIngresosMes += Number(slip.totalIngresos) || 0;
    rec.totalDescuentosMes += Number(slip.totalEgresos) || 0;
    rec.totalDescuentosRealesMes += bd.descuentos;
    rec.totalACobrarMes += bd.totalACobrar;
    rec.totalTransfMes += bd.pagoTransferencia;
    rec.totalEfectivoMes += bd.pagoEfectivo;
    rec.totalSaldoMes += bd.saldo;
    rec.totalNetoMes += Number(slip.netoACobrar) || 0;
    if (slip.aliasBancario && !rec.aliasBancario) rec.aliasBancario = slip.aliasBancario;
    if (slip.cbuBancario && !rec.cbuBancario) rec.cbuBancario = slip.cbuBancario;
    if (slip.observacionesPago) {
      rec.observacionesMes = rec.observacionesMes
        ? `${rec.observacionesMes} | ${wNum}°S: ${slip.observacionesPago}`
        : `${wNum}°S: ${slip.observacionesPago}`;
    }
    rec.slips.push(slip);
  }

  return Array.from(map.values());
}

const SPANISH_MONTH_TO_NUM: Record<string, string> = {
  ENERO: '01',
  FEBRERO: '02',
  MARZO: '03',
  ABRIL: '04',
  MAYO: '05',
  JUNIO: '06',
  JULIO: '07',
  AGOSTO: '08',
  SEPTIEMBRE: '09',
  SETIEMBRE: '09',
  OCTUBRE: '10',
  NOVIEMBRE: '11',
  DICIEMBRE: '12',
};

export function extractMonthAndYearFromTabTitle(title: string): {
  monthNum: string | null;
  year: string | null;
} {
  const up = String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  const yearMatch = up.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;

  for (const [mName, mCode] of Object.entries(SPANISH_MONTH_TO_NUM)) {
    if (up.includes(mName)) {
      return { monthNum: mCode, year };
    }
  }

  // Numeric pattern in R-sheets like "R-09.2026", "R-08-2026", "R 10.2026", "09.2026"
  const numMatch =
    up.match(/^R[\s._-]*0?(\d{1,2})(?:[^0-9]|$)/) ||
    up.match(/(?:^|[^0-9])0?(\d{1,2})[./-]20\d{2}\b/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (n >= 1 && n <= 12) {
      return { monthNum: String(n).padStart(2, '0'), year };
    }
  }

  return { monthNum: null, year };
}

/**
 * Checks whether an R-summary tab (e.g. "R-09.2026") matches a month period tab (e.g. "OCTUBRE 2026").
 * Prevents loading September's R-09.2026 payments on top of October's slips.
 */
export function doesRSheetMatchMonthPeriod(
  rTabTitle: string,
  monthTabTitle: string
): boolean {
  if (!rTabTitle || !monthTabTitle) return true;
  const rInfo = extractMonthAndYearFromTabTitle(rTabTitle);
  const mInfo = extractMonthAndYearFromTabTitle(monthTabTitle);

  if (rInfo.year && mInfo.year && rInfo.year !== mInfo.year) {
    return false;
  }
  if (rInfo.monthNum && mInfo.monthNum && rInfo.monthNum !== mInfo.monthNum) {
    return false;
  }
  return true;
}

/**
 * Given an R-tab like "R-09.2026", finds the corresponding month sheet tab (e.g. "SEPTIEMBRE 2026").
 */
export function findMonthTabForRSheet(
  rTabTitle: string,
  allTabs: Array<{ title: string; index?: number }>
): string | null {
  if (!rTabTitle || !allTabs || allTabs.length === 0) return null;
  const rInfo = extractMonthAndYearFromTabTitle(rTabTitle);
  const nonRTabs = allTabs.filter(t => !/^(R[\s._-]|RESUMEN\b)/i.test(t.title.trim()));

  if (rInfo.monthNum) {
    const exact = nonRTabs.find(t => {
      const tInfo = extractMonthAndYearFromTabTitle(t.title);
      if (tInfo.monthNum !== rInfo.monthNum) return false;
      if (rInfo.year && tInfo.year && tInfo.year !== rInfo.year) return false;
      return true;
    });
    if (exact) return exact.title;
  }

  // Adjacent preceding tab heuristic in case month name is unconventional
  const rIdx = allTabs.findIndex(
    t => t.title.toUpperCase().trim() === rTabTitle.toUpperCase().trim()
  );
  if (rIdx > 0) {
    const prevTab = allTabs[rIdx - 1];
    if (
      prevTab &&
      !/^(R[\s._-]|RESUMEN\b)/i.test(prevTab.title.trim()) &&
      doesRSheetMatchMonthPeriod(rTabTitle, prevTab.title)
    ) {
      return prevTab.title;
    }
  }

  return null;
}

/**
 * Finds the companion R-summary tab next to a month tab (e.g. "OCTUBRE 2026" -> "R-10.2026").
 */
export function findCompanionSummaryTabTitle(
  monthTabTitle: string,
  allTabs: Array<{ title: string; index?: number }>
): string | null {
  if (!allTabs || allTabs.length === 0) return null;
  const upperMonth = String(monthTabTitle || '').toUpperCase().trim();
  const { monthNum, year } = extractMonthAndYearFromTabTitle(upperMonth);

  // 1. Exact pattern match like "R-10.2026", "R-10-2026", "R 10.2026", "R-10"
  if (monthNum) {
    const numNoZero = String(Number(monthNum));
    const exactMatch = allTabs.find(t => {
      const up = t.title.toUpperCase().trim();
      if (!/^R[\s._-]/.test(up)) return false;
      const hasMonth = new RegExp(`(^|[^0-9])0?${numNoZero}([^0-9]|$)`).test(up);
      if (!hasMonth) return false;
      if (year && /\b20\d{2}\b/.test(up)) {
        return up.includes(year);
      }
      return true;
    });
    if (exactMatch) return exactMatch.title;
  }

  // 2. Adjacent tab in Google Sheets right next to monthTabTitle whose title starts with "R-" / "RESUMEN"
  // Strictly reject if it carries a different explicit month/year
  const monthIdx = allTabs.findIndex(t => t.title.toUpperCase().trim() === upperMonth);
  if (monthIdx >= 0) {
    const nextTab = allTabs[monthIdx + 1];
    if (
      nextTab &&
      /^(R[\s._-]|RESUMEN\b)/i.test(nextTab.title.trim()) &&
      doesRSheetMatchMonthPeriod(nextTab.title, monthTabTitle)
    ) {
      return nextTab.title;
    }
  }

  // 3. Any "R-" tab matching month name (e.g. "R-OCTUBRE 2026")
  const firstWord = upperMonth.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 4) {
    const byName = allTabs.find(t => {
      const up = t.title.toUpperCase();
      return (
        /^(R[\s._-]|RESUMEN\b)/.test(up) &&
        up.includes(firstWord) &&
        doesRSheetMatchMonthPeriod(t.title, monthTabTitle)
      );
    });
    if (byName) return byName.title;
  }

  return null;
}

/**
 * Strips payment fields that came from a mismatched month's R-sheet (e.g. R-09.2026 saved onto OCTUBRE 2026).
 */
export function stripMismatchedRSheetData(
  slips: EmployeePayrollSlip[],
  periodTabName: string
): { slips: EmployeePayrollSlip[]; changed: boolean } {
  let changed = false;
  const cleaned = slips.map(s => {
    if (s.rSheetSource?.tabTitle && !doesRSheetMatchMonthPeriod(s.rSheetSource.tabTitle, periodTabName)) {
      changed = true;
      return {
        ...s,
        pagoTransferencia: undefined,
        pagoEfectivo: undefined,
        observacionesPago: undefined,
        rSheetSource: undefined,
        rSheetValues: undefined,
      };
    }
    const rv = s.rSheetValues;
    const calcBasico = Number(s.totalBasicoIngresos) || 0;
    const calcExtras = Number(s.totalExtraIngresos) || 0;
    if (rv && rv.basico === undefined && rv.total === 0 && (calcBasico > 0 || calcExtras > 0)) {
      changed = true;
      return {
        ...s,
        pagoTransferencia: undefined,
        pagoEfectivo: undefined,
        observacionesPago: undefined,
        rSheetSource: undefined,
        rSheetValues: undefined,
      };
    }
    return s;
  });
  return { slips: cleaned, changed };
}

function tokenizeEmployeeForMatch(raw: string): string[] {
  const cleaned = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?(HS?)?\b/g, ' ')
    .replace(/\b\d{1,2}\s*A\s*\d{1,2}(HS?)?\b/g, ' ')
    .replace(/\b\d+\s*HS?\b/g, ' ')
    .replace(/\b(1\s*ERA|1\s*RA|1\s*ER|2\s*DA|3\s*ERA|3\s*RA|3\s*ER|4\s*TA|5\s*TA)\b/g, ' ')
    .replace(/\b(F\.?I\.?|INGRESO|CAT|UOC|SEMANA|LA|HORMIGA|TUBOMUNDO|MAESTRANZA|ADMINISTRATIVOS|ADMINISTRATIVO|CONTADORA|CONTADOR)\b/g, ' ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stopWords = new Set(['DE', 'DEL', 'LA', 'EL', 'AL', 'Y']);
  return cleaned
    .split(' ')
    .filter(tok => tok.length >= 2 && !/^\d+$/.test(tok) && !stopWords.has(tok));
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let diffs = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        diffs++;
        if (diffs > 1) return false;
      }
    }
    return diffs <= 1;
  }
  const shorter = la < lb ? a : b;
  const longer = la < lb ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] !== longer[j]) {
      if (skipped) return false;
      skipped = true;
      j++;
    } else {
      i++;
      j++;
    }
  }
  return true;
}

function tokensMatchFuzzy(a: string, b: string): 'exact' | 'fuzzy' | null {
  if (a === b) return 'exact';
  const minL = Math.min(a.length, b.length);
  if (minL >= 4 && (a + 'S' === b || b + 'S' === a)) return 'fuzzy';
  if (minL >= 5 && editDistanceAtMostOne(a, b)) return 'fuzzy';
  if (minL >= 4 && (a.startsWith(b) || b.startsWith(a))) return 'fuzzy';
  return null;
}

export function employeeNameMatchScore(nameA: string, nameB: string): number {
  const tokensA = tokenizeEmployeeForMatch(nameA);
  const tokensB = tokenizeEmployeeForMatch(nameB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  let weightedOverlap = 0;
  let matchedCount = 0;
  const usedBIdx = new Set<number>();

  for (const ta of tokensA) {
    let bestKind: 'exact' | 'fuzzy' | null = null;
    let bestIdx = -1;
    for (let j = 0; j < tokensB.length; j++) {
      if (usedBIdx.has(j)) continue;
      const kind = tokensMatchFuzzy(ta, tokensB[j]);
      if (kind === 'exact') {
        bestKind = 'exact';
        bestIdx = j;
        break;
      }
      if (kind === 'fuzzy' && bestKind === null) {
        bestKind = 'fuzzy';
        bestIdx = j;
      }
    }
    if (bestIdx >= 0 && bestKind) {
      usedBIdx.add(bestIdx);
      matchedCount++;
      weightedOverlap += bestKind === 'exact' ? 1 : 0.9;
    }
  }

  const maxLen = Math.max(tokensA.length, tokensB.length);
  if (matchedCount === 0) return 0;
  if (maxLen >= 2 && matchedCount < 2) return 0;
  return weightedOverlap / maxLen + weightedOverlap * 0.1;
}

export interface ParsedPayrollHeaderMetadata {
  rawHeader: string;
  cleanName: string;
  fechaIngresoISO?: string;
  fechaIngresoDisplay?: string;
  horarioTexto?: string;
  prefijoSemana?: string;
}

/**
 * Separa el encabezado crudo de una ficha de sueldos (ej. "ANDRES ACOSTAS ROJAS 3/8/26 8A13 14/19 S 8/14HS",
 * "CALEB SEPULVEDA - INGRESO: 11/06/2024", "GARCIA DANIEL F.I: 11/09/25", "2DA JUAN CALAPEÑA")
 * en Nombre Limpio, Fecha de Ingreso (ISO y DD/MM/YYYY) y Horario.
 */
export function parsePayrollHeaderMetadata(rawHeader: string): ParsedPayrollHeaderMetadata {
  const raw = String(rawHeader || '').trim();
  let working = raw;

  // 1. Detect week prefix (e.g. "2DA ", "1ER SEMANA ", "1 ER SEMANA - ", "3ra SEMANA- ", "4TA SEMANA ")
  let prefijoSemana: string | undefined;
  const weekPrefixMatch = working.match(
    /^\s*((?:1\s*ERA|1\s*RA|1\s*ER|2\s*DA|3\s*ERA|3\s*RA|3\s*ER|4\s*TA|5\s*TA)(?:\s+SEMANA)?)\s*[-–:]*\s*/i
  );
  if (weekPrefixMatch) {
    prefijoSemana = weekPrefixMatch[1].toUpperCase().replace(/\s+/g, ' ').trim();
    working = working.slice(weekPrefixMatch[0].length);
  }

  // 2. Detect Fecha de Ingreso (3-part date D/M/YY or D/M/YYYY, optionally preceded by F.I: or INGRESO:)
  let fechaIngresoISO: string | undefined;
  let fechaIngresoDisplay: string | undefined;
  const dateRegex =
    /(?:[-–—]?\s*(?:F\.?\s*I\.?|INGRESO)\s*:?\s*)?\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b(?!\s*HS?\b)/i;
  const dateMatch = working.match(dateRegex);
  if (dateMatch) {
    const dNum = parseInt(dateMatch[1], 10);
    const mNum = parseInt(dateMatch[2], 10);
    let yNum = parseInt(dateMatch[3], 10);
    if (yNum < 100) {
      yNum += 2000;
    }
    if (dNum >= 1 && dNum <= 31 && mNum >= 1 && mNum <= 12 && yNum >= 1990 && yNum <= 2100) {
      const dd = String(dNum).padStart(2, '0');
      const mm = String(mNum).padStart(2, '0');
      fechaIngresoISO = `${yNum}-${mm}-${dd}`;
      fechaIngresoDisplay = `${dd}/${mm}/${yNum}`;
      working = working.replace(dateMatch[0], ' ');
    }
  }

  // 3. Detect schedule / horario patterns (e.g. "8A13 14/19 S 8/14HS")
  let horarioTexto: string | undefined;
  const scheduleParts: string[] = [];
  const scheduleRegex =
    /\b(?:\d{1,2}\s*A\s*\d{1,2}(?:\s*HS?)?|[SLMVJDF]\s+\d{1,2}[/-]\d{1,2}(?:\s*HS?)?|\d{1,2}[/-]\d{1,2}\s*HS?|\d{1,2}[/-]\d{1,2})\b/gi;
  let schedMatch: RegExpExecArray | null;
  while ((schedMatch = scheduleRegex.exec(working)) !== null) {
    scheduleParts.push(schedMatch[0].toUpperCase().trim());
  }
  if (scheduleParts.length > 0) {
    horarioTexto = scheduleParts.join(' ');
    working = working.replace(scheduleRegex, ' ');
  }

  // 4. Clean remaining name
  const cleanName = working
    .replace(/\b(?:F\.?\s*I\.?|INGRESO)\s*:?/gi, ' ')
    .replace(/\s*[-–—]\s*(?:MAESTRANZA|ADMINISTRATIVOS?|CONTADORA?)\s*$/gi, ' ')
    .replace(/^[\s\-–—:.,]+|[\s\-–—:.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  return {
    rawHeader: raw,
    cleanName: cleanName || raw.toUpperCase(),
    fechaIngresoISO,
    fechaIngresoDisplay,
    horarioTexto,
    prefijoSemana,
  };
}

export interface PayrollNominaMatchResult<T = any> {
  employee: T | null;
  matchType: 'manual' | 'auto' | 'none';
  score: number;
  tokenKey: string;
  metadata: ParsedPayrollHeaderMetadata;
}

/**
 * Cruza una ficha de liquidación con la Nómina de Personal (`drivers` en Supabase),
 * respetando primero vínculos explícitos guardados y luego coincidencia inteligente por tokens de nombre.
 */
export function matchPayrollSlipToEmployee<
  T extends { id: string; nombreApellido?: string; nombre?: string; codigoEmpleado?: string; costoPorDia?: number; fechaAlta?: string }
>(
  empleadoNombreOrSlip: string | Pick<EmployeePayrollSlip, 'empleadoNombre' | 'empleadoId'>,
  employees: T[],
  directoryLinks?: Record<string, string>
): PayrollNominaMatchResult<T> {
  const rawName =
    typeof empleadoNombreOrSlip === 'string'
      ? empleadoNombreOrSlip
      : empleadoNombreOrSlip.empleadoNombre;
  const explicitId =
    typeof empleadoNombreOrSlip === 'string' ? undefined : empleadoNombreOrSlip.empleadoId;

  const metadata = parsePayrollHeaderMetadata(rawName);
  const tokenKey = getEmployeeBankTokenKey(rawName);
  const normKey = normalizeEmployeeKey(rawName);

  const linkedId =
    explicitId ||
    (directoryLinks && tokenKey ? directoryLinks[tokenKey] : undefined) ||
    (directoryLinks && normKey ? directoryLinks[normKey] : undefined);

  if (linkedId === '__UNLINKED__') {
    return {
      employee: null,
      matchType: 'none',
      score: 0,
      tokenKey,
      metadata,
    };
  }

  if (linkedId) {
    const manualEmp = employees.find(e => e.id === linkedId);
    if (manualEmp) {
      return {
        employee: manualEmp,
        matchType: 'manual',
        score: 2,
        tokenKey,
        metadata,
      };
    }
  }

  let bestEmp: T | null = null;
  let bestScore = 0;

  for (const emp of employees) {
    const empName = emp.nombreApellido || emp.nombre || '';
    const sc = employeeNameMatchScore(rawName, empName);
    if (sc <= 0) continue;
    // Tie-breaker: prefer employee records with costoPorDia or fechaAlta already configured
    const bonus = (emp.costoPorDia ? 0.02 : 0) + (emp.fechaAlta ? 0.01 : 0);
    const totalSc = sc + bonus;
    if (totalSc > bestScore) {
      bestScore = totalSc;
      bestEmp = emp;
    }
  }

  if (bestEmp && bestScore >= 0.75) {
    return {
      employee: bestEmp,
      matchType: 'auto',
      score: bestScore,
      tokenKey,
      metadata,
    };
  }

  return {
    employee: null,
    matchType: 'none',
    score: 0,
    tokenKey,
    metadata,
  };
}

export interface ParsedRSummarySlipUpdate {
  slipId: string;
  weekNumber: number;
  empleadoNombreRSheet: string;
  pagoTransferencia?: number;
  pagoEfectivo?: number;
  observacionesPago?: string;
  aliasBancario?: string;
  cbuBancario?: string;
  rSheetSource: RSheetCellSource;
  rSheetValues?: RSheetRowValues;
}

export function parseRSummaryGridIntoUpdates(
  grid: string[][],
  tabTitle: string,
  existingSlips: EmployeePayrollSlip[]
): {
  updates: ParsedRSummarySlipUpdate[];
  bankDirectory: Record<string, { alias?: string; cbu?: string }>;
  scannedRowsCount: number;
} {
  const updates: ParsedRSummarySlipUpdate[] = [];
  const bankDirectory: Record<string, { alias?: string; cbu?: string }> = {};
  if (!Array.isArray(grid) || grid.length < 2) {
    return { updates, bankDirectory, scannedRowsCount: 0 };
  }

  let currentWeek = 1;
  let activeColMap: RSheetCellSource['colMap'] | null = null;
  let scannedRowsCount = 0;
  const usedSlipIds = new Set<string>();

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    if (row.every(c => !String(c || '').trim())) continue;

    // Detect table header rows like: PRIMERA SEMANA | BASICO | EXTRAS | TOTAL | DESCUENTOS | TOTAL A COBRAR | TRANSF. | EFECTIVO | SALDO | OBSERVACIONES | ALIAS | CBU
    let foundBasico = -1;
    let foundTransf = -1;
    let foundSemanaCol = -1;
    const tempColMap: Partial<RSheetCellSource['colMap']> = {};

    for (let c = 0; c < row.length; c++) {
      const up = String(row[c] || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
      if (!up) continue;

      if (/(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|1ERA|2DA|3ERA|4TA|5TA)\s+SEMANA/.test(up) || up === 'EMPLEADO' || up === 'NOMBRE') {
        foundSemanaCol = c;
        tempColMap.empleado = c;
      } else if (up === 'BASICO') {
        foundBasico = c;
        tempColMap.basico = c;
      } else if (up === 'EXTRAS' || up === 'EXTRA') {
        tempColMap.extras = c;
      } else if (up === 'TOTAL' || up.startsWith('TOTAL A SIG')) {
        tempColMap.total = c;
      } else if (up.includes('DESCUENTO')) {
        tempColMap.descuentos = c;
      } else if (up.includes('TOTAL A COBRAR') || up === 'A COBRAR') {
        tempColMap.totalACobrar = c;
      } else if (up.startsWith('TRANSF')) {
        foundTransf = c;
        tempColMap.transf = c;
      } else if (up.startsWith('EFECT')) {
        tempColMap.efectivo = c;
      } else if (up === 'SALDO') {
        tempColMap.saldo = c;
      } else if (up.startsWith('OBSERV')) {
        tempColMap.obs = c;
      } else if (up.includes('ALIAS')) {
        tempColMap.alias = c;
      } else if (up.includes('CBU') || up.includes('CVU')) {
        tempColMap.cbu = c;
      }
    }

    if (foundSemanaCol !== -1 && (foundBasico !== -1 || foundTransf !== -1)) {
      const hdrText = String(row[foundSemanaCol] || '').toUpperCase();
      currentWeek = detectWeekNumberFromText(hdrText);
      activeColMap = {
        empleado: tempColMap.empleado ?? foundSemanaCol,
        basico: tempColMap.basico,
        extras: tempColMap.extras,
        total: tempColMap.total,
        descuentos: tempColMap.descuentos,
        totalACobrar: tempColMap.totalACobrar,
        transf: tempColMap.transf,
        efectivo: tempColMap.efectivo,
        saldo: tempColMap.saldo,
        obs: tempColMap.obs,
        alias: tempColMap.alias,
        cbu: tempColMap.cbu,
      };
      continue;
    }

    // Standalone week banner line without repeating headers
    const firstNonEmptyIdx = row.findIndex(c => String(c || '').trim() !== '');
    if (firstNonEmptyIdx >= 0) {
      const firstCellUp = String(row[firstNonEmptyIdx] || '').toUpperCase().trim();
      if (/^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|1\s*ERA|2\s*DA|3\s*ERA|4\s*TA|5\s*TA)\s+SEMANA\b/.test(firstCellUp) && row.filter(c => String(c || '').trim()).length <= 2) {
        currentWeek = detectWeekNumberFromText(firstCellUp);
        continue;
      }
    }

    if (!activeColMap) continue;

    const rawEmpName = String(row[activeColMap.empleado] || '').trim();
    const upperEmp = rawEmpName.toUpperCase();
    if (
      !upperEmp ||
      upperEmp === 'TOTALES' ||
      upperEmp === 'TOTAL' ||
      upperEmp.startsWith('TOTAL ')
    ) {
      continue;
    }

    const rawTransf = activeColMap.transf !== undefined ? String(row[activeColMap.transf] || '').trim() : '';
    const rawEfec = activeColMap.efectivo !== undefined ? String(row[activeColMap.efectivo] || '').trim() : '';
    const rawObs = activeColMap.obs !== undefined ? String(row[activeColMap.obs] || '').trim() : '';
    const rawAlias = activeColMap.alias !== undefined ? String(row[activeColMap.alias] || '').trim() : '';
    const rawCbu = activeColMap.cbu !== undefined ? String(row[activeColMap.cbu] || '').trim() : '';

    if (rawAlias || rawCbu) {
      const tokenKey = tokenizeEmployeeForMatch(rawEmpName).sort().join(' ');
      if (tokenKey) {
        bankDirectory[tokenKey] = {
          alias: rawAlias || bankDirectory[tokenKey]?.alias,
          cbu: rawCbu || bankDirectory[tokenKey]?.cbu,
        };
      }
    }

    scannedRowsCount++;

    // Find best matching slip in currentWeek first, then any week
    const weekSlips = existingSlips.filter(
      s => !usedSlipIds.has(s.id) && (s.numeroSemana || detectWeekNumberFromText(s.grupoSemana)) === currentWeek
    );
    let bestSlip: EmployeePayrollSlip | null = null;
    let bestScore = 0;

    for (const candidate of weekSlips) {
      const sc = employeeNameMatchScore(rawEmpName, candidate.empleadoNombre);
      if (sc > bestScore) {
        bestScore = sc;
        bestSlip = candidate;
      }
    }

    if (!bestSlip) continue;
    usedSlipIds.add(bestSlip.id);

    const rawBasico =
      activeColMap.basico !== undefined ? String(row[activeColMap.basico] || '').trim() : '';
    const rawExtras =
      activeColMap.extras !== undefined ? String(row[activeColMap.extras] || '').trim() : '';
    const rawTotal =
      activeColMap.total !== undefined ? String(row[activeColMap.total] || '').trim() : '';
    const rawDescuentos =
      activeColMap.descuentos !== undefined
        ? String(row[activeColMap.descuentos] || '').trim()
        : '';
    const rawTotalACobrar =
      activeColMap.totalACobrar !== undefined
        ? String(row[activeColMap.totalACobrar] || '').trim()
        : '';

    const parsedBasico =
      activeColMap.basico !== undefined && rawBasico !== '' ? parseCurrencyNumber(rawBasico) : 0;
    const parsedExtras =
      activeColMap.extras !== undefined && rawExtras !== '' ? parseCurrencyNumber(rawExtras) : 0;
    const parsedTotal =
      activeColMap.total !== undefined && rawTotal !== '' ? parseCurrencyNumber(rawTotal) : 0;
    const parsedDescuentos =
      activeColMap.descuentos !== undefined && rawDescuentos !== ''
        ? parseCurrencyNumber(rawDescuentos)
        : 0;
    const parsedTotalACobrar =
      activeColMap.totalACobrar !== undefined && rawTotalACobrar !== ''
        ? parseCurrencyNumber(rawTotalACobrar)
        : 0;

    // If the companion R-sheet row isn't filled yet (e.g. BASICO blank and TOTAL = "$ -"),
    // DO NOT create rSheetValues — otherwise it zeroes out TOTAL, EXTRAS and TOTAL A COBRAR!
    const hasActiveRSheetWages =
      parsedBasico > 0 || parsedExtras > 0 || parsedTotal > 0 || parsedTotalACobrar > 0;

    const rSheetValues: RSheetRowValues = {};
    if (hasActiveRSheetWages) {
      if (activeColMap.basico !== undefined && rawBasico !== '') {
        rSheetValues.basico = parsedBasico;
      }
      if (activeColMap.extras !== undefined) {
        rSheetValues.extras = parsedExtras;
      }
      if (activeColMap.total !== undefined && rawTotal !== '') {
        rSheetValues.total = parsedTotal;
      }
      if (activeColMap.descuentos !== undefined) {
        rSheetValues.descuentos = parsedDescuentos;
      }
      if (activeColMap.totalACobrar !== undefined && rawTotalACobrar !== '') {
        rSheetValues.totalACobrar = parsedTotalACobrar;
      }
    }

    const parsedTransf =
      rawTransf !== ''
        ? parseCurrencyNumber(rawTransf)
        : rawEfec !== ''
        ? 0
        : undefined;
    const parsedEfec =
      rawEfec !== ''
        ? parseCurrencyNumber(rawEfec)
        : rawTransf !== ''
        ? 0
        : undefined;

    updates.push({
      slipId: bestSlip.id,
      weekNumber: currentWeek,
      empleadoNombreRSheet: rawEmpName,
      pagoTransferencia: parsedTransf,
      pagoEfectivo: parsedEfec,
      observacionesPago: rawObs || undefined,
      aliasBancario: rawAlias || undefined,
      cbuBancario: rawCbu || undefined,
      rSheetSource: {
        tabTitle,
        rowIndex: r,
        colMap: activeColMap,
      },
      rSheetValues: Object.keys(rSheetValues).length > 0 ? rSheetValues : undefined,
    });
  }

  return { updates, bankDirectory, scannedRowsCount };
}

export function getEmployeeBankTokenKey(name: string): string {
  return tokenizeEmployeeForMatch(name).sort().join(' ');
}

export function mergeCompanionRSheetFields(
  freshSlips: EmployeePayrollSlip[],
  previousSlips: EmployeePayrollSlip[],
  bankDirectory?: Record<string, { alias?: string; cbu?: string }>
): EmployeePayrollSlip[] {
  return freshSlips.map(slip => {
    const slipWeek = slip.numeroSemana || detectWeekNumberFromText(slip.grupoSemana);
    const prevById = previousSlips.find(p => p.id === slip.id);
    let matchedPrev = prevById;
    if (!matchedPrev) {
      let bestScore = 0;
      for (const p of previousSlips) {
        const pw = p.numeroSemana || detectWeekNumberFromText(p.grupoSemana);
        if (pw !== slipWeek) continue;
        const sc = employeeNameMatchScore(slip.empleadoNombre, p.empleadoNombre);
        if (sc > bestScore) {
          bestScore = sc;
          matchedPrev = p;
        }
      }
    }

    const tokenKey = getEmployeeBankTokenKey(slip.empleadoNombre);
    const dirBank = tokenKey && bankDirectory ? bankDirectory[tokenKey] : undefined;
    const anyPrevBank = previousSlips.find(
      p =>
        (p.aliasBancario || p.cbuBancario) &&
        employeeNameMatchScore(slip.empleadoNombre, p.empleadoNombre) > 0
    );

    return {
      ...slip,
      pagoTransferencia: matchedPrev?.pagoTransferencia ?? slip.pagoTransferencia,
      pagoEfectivo: matchedPrev?.pagoEfectivo ?? slip.pagoEfectivo,
      observacionesPago: matchedPrev?.observacionesPago ?? slip.observacionesPago,
      aliasBancario:
        matchedPrev?.aliasBancario ??
        slip.aliasBancario ??
        dirBank?.alias ??
        anyPrevBank?.aliasBancario,
      cbuBancario:
        matchedPrev?.cbuBancario ??
        slip.cbuBancario ??
        dirBank?.cbu ??
        anyPrevBank?.cbuBancario,
      rSheetSource: matchedPrev?.rSheetSource ?? slip.rSheetSource,
      rSheetValues: matchedPrev?.rSheetValues ?? slip.rSheetValues,
    };
  });
}

/**
 * Checks if a cell is a full-width yellow Week Separator Banner
 * (e.g. "1ERA SEMANA - LA HORMIGA", "2DA SEMANA - LA HORMIGA", "3 ERA SEMANA - LA HORMIGA", "4TA SEMANA - LA HORMIGA")
 * vs an employee name that happens to contain "3er SEMANA HUMBERTO VILLA".
 */
function isSeparatorBannerCell(cellText: string, row: string[], colIndex: number): boolean {
  const upper = String(cellText || '').trim().toUpperCase();
  if (!upper || upper.length < 6) return false;
  // If the row also has "$ 60,000.00" in colIndex + 2, it's an employee top row, NOT a section separator!
  const possibleBase = parseCurrencyNumber(row[colIndex + 2]);
  if (possibleBase >= 10000) return false;

  if (/(LA HORMIGA|TUBOMUNDO|ADMINISTRATIVOS|MAESTRANZA|GRUPO\s*IDN|\bIDN\b)/i.test(upper) && /SEMANA/i.test(upper)) return true;
  if (/^(1\s*ERA|1\s*RA|2\s*DA|3\s*ERA|3\s*RA|4\s*TA|5\s*TA|PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA)\s+SEMANA\s*($|-)/i.test(upper)) {
    return true;
  }
  return false;
}

/**
 * Parses a 2D Google Sheet / Excel grid (where multiple employee liquidation tables
 * sit side-by-side in columns AND stacked vertically in multiple tiers under each
 * yellow separator: 1ERA SEMANA, 2DA SEMANA, 3 ERA SEMANA, 4TA SEMANA for LA HORMIGA,
 * TUBOMUNDO, and GRUPO IDN / ADMINISTRATIVOS / MAESTRANZA).
 */
export function parseSheetGridIntoPayrollSlips(
  grid: string[][],
  tabTitle = 'OCTUBRE',
  options: { onlyLaHormiga?: boolean } = { onlyLaHormiga: false }
): EmployeePayrollSlip[] {
  const slips: EmployeePayrollSlip[] = [];
  if (!Array.isArray(grid) || grid.length < 4) return slips;

  const onlyLaHormiga = options?.onlyLaHormiga === true;
  let currentBanner = '1ERA SEMANA - LA HORMIGA';
  let currentWeekNumber = 1;

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];

    // 1. Detect yellow separator banners ("1ERA SEMANA - LA HORMIGA", "1ERA SEMANA - TUBOMUNDO", "1ERA SEMANA - ADMINISTRATIVOS", etc.)
    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || '').trim();
      if (isSeparatorBannerCell(cellText, row, c)) {
        const detectedNum = detectWeekNumberFromText(cellText);
        currentWeekNumber = detectedNum;
        currentBanner = getCanonicalWeekBanner(detectedNum, cellText.toUpperCase());
      }
    }

    // Only skip other companies if caller explicitly requested onlyLaHormiga: true
    if (onlyLaHormiga && !/LA\s*HORMIGA/i.test(currentBanner)) {
      continue;
    }

    // 2. Scan horizontally across this row for each employee block header ("FECHA | CONCEPTO | ... | INGRESOS | EGRESOS" or " | CONCEPTO | ... | INGRESOS | EGRESOS")
    for (let c = 0; c < row.length - 3; c++) {
      const col0 = String(row[c] || '').trim().toUpperCase();
      const col1 = String(row[c + 1] || '').trim().toUpperCase();
      const col3 = String(row[c + 3] || '').trim().toUpperCase();
      const col4 = String(row[c + 4] || '').trim().toUpperCase();

      const isBlockHeader =
        col1 === 'CONCEPTO' &&
        /INGRESO/.test(col3) &&
        (col0 === 'FECHA' || (col0 === '' && /EGRESO/.test(col4)));

      if (isBlockHeader) {
        const topRow = grid[r - 1] || [];
        const rawCol0 = String(topRow[c] || '').trim();
        const rawCol1 = String(topRow[c + 1] || '').trim();
        const codigoCabecera = rawCol1 ? rawCol0 : '';
        let empleadoNombre = (rawCol1 || rawCol0).trim();
        const parsedRate = parseCurrencyNumber(topRow[c + 3]);
        const valorBaseJornal = parsedRate >= 1000 ? parsedRate : 60000;
        if (
          empleadoNombre &&
          parsedRate < 1000 &&
          /^(1\s*ERA|1\s*RA|1\s*ER|2\s*DA|3\s*ERA|3\s*RA|3\s*ER|4\s*TA|5\s*TA)\s+SEMANA\s*-\s*(LA HORMIGA|TUBOMUNDO|ADMINISTRATIVOS|MAESTRANZA|GRUPO\s*IDN|IDN)/i.test(
            empleadoNombre
          )
        ) {
          empleadoNombre = '';
        }

        // Skip empty template blocks (where employee name cell is blank)
        if (!empleadoNombre) continue;

        let mesTexto = tabTitle.toUpperCase();
        let rangoFecha = '';
        const basicItems: PayrollBasicItem[] = [];
        const extraItems: PayrollExtraItem[] = [];
        let stage: 'BASIC' | 'EXTRA' | 'DONE' = 'BASIC';
        let etiquetaNeto = 'A COBRAR';
        let runningBasicIngresos = 0;
        let totalBasicoRowIndex: number | undefined;
        let totalExtraRowIndex: number | undefined;

        for (let rr = r + 1; rr < Math.min(grid.length, r + 50); rr++) {
          const line = grid[rr] || [];
          const cFecha = String(line[c] || '').trim();
          const cConcepto = String(line[c + 1] || '').trim();
          const cCol2 = String(line[c + 2] || '').trim();
          const cIngreso = String(line[c + 3] || '').trim();
          const cEgreso = String(line[c + 4] || '').trim();

          const upperFecha = cFecha.toUpperCase();
          const upperConcepto = cConcepto.toUpperCase();
          const upperCol2 = cCol2.toUpperCase();
          const upperIngreso = cIngreso.toUpperCase();
          const upperEgreso = cEgreso.toUpperCase();

          // Stop if we hit a new employee block below, "FIN", or a new week separator banner
          if (
            (upperConcepto === 'CONCEPTO' &&
              (upperFecha === 'FECHA' ||
                (upperFecha === '' && /INGRESO/.test(upperIngreso) && /EGRESO/.test(upperEgreso)))) ||
            upperFecha === 'FIN' ||
            upperConcepto === 'FIN' ||
            isSeparatorBannerCell(cFecha, line, c) ||
            isSeparatorBannerCell(cConcepto, line, c + 1)
          ) {
            break;
          }

          if (rr === r + 1 && cFecha) {
            mesTexto = cFecha.toUpperCase();
          } else if (rr === r + 2 && cFecha) {
            rangoFecha = cFecha.toUpperCase();
          }

          // End-of-block summary markers can appear in cConcepto OR cFecha (especially in Administrativos)
          if (
            upperFecha === 'A COBRAR' ||
            upperConcepto === 'A COBRAR' ||
            upperFecha.includes('PAGADO DEMAS') ||
            upperConcepto.includes('PAGADO DEMAS') ||
            upperFecha.includes('PAGADO DE MAS') ||
            upperConcepto.includes('PAGADO DE MAS')
          ) {
            etiquetaNeto =
              upperFecha.includes('PAGADO') || upperConcepto.includes('PAGADO')
                ? 'PAGADO DEMAS'
                : 'A COBRAR';
            break;
          }

          if (upperFecha === 'TOTALES' || upperConcepto === 'TOTALES') {
            stage = 'DONE';
            continue;
          }

          if (
            upperConcepto.includes('TOTAL BASICO') ||
            upperConcepto.includes('TOTAL BÁSICO') ||
            upperFecha.includes('TOTAL BASICO')
          ) {
            totalBasicoRowIndex = rr;
            stage = 'EXTRA';
            continue;
          }

          if (
            upperCol2.includes('TOTAL EXTRA') ||
            upperConcepto.includes('TOTAL EXTRA') ||
            upperFecha.includes('TOTAL EXTRA')
          ) {
            totalExtraRowIndex = rr;
            stage = 'DONE';
            continue;
          }

          if (stage === 'DONE') {
            continue;
          }

          const ingreso = parseCurrencyNumber(cIngreso);
          const egreso = parseCurrencyNumber(cEgreso);

          if (stage === 'BASIC') {
            // Detect unlabeled TOTAL BASICO row (e.g. Tubomundo/Admin where CONCEPTO is empty and INGRESOS equals sum of basic rows)
            if (
              !cConcepto &&
              !cFecha &&
              !cCol2 &&
              basicItems.length > 0 &&
              (ingreso === 0 || Math.abs(ingreso - runningBasicIngresos) <= 2)
            ) {
              if (ingreso > 0 && Math.abs(ingreso - runningBasicIngresos) <= 2) {
                totalBasicoRowIndex = rr;
                stage = 'EXTRA';
              }
              continue;
            }

            if (!cConcepto && ingreso === 0 && egreso === 0) {
              continue;
            }

            const unidades = parseCurrencyNumber(cCol2);
            runningBasicIngresos += ingreso;
            // Always preserve exact cell value from the sheet so rounded unit display never alters the amount
            basicItems.push({
              id: `b-${rr}-${c}`,
              concepto: cConcepto || 'AJUSTE / ADICIONAL BÁSICO',
              unidades,
              ingreso,
              egreso,
              manualMonto: true,
              referenciaBase: rr > r + 2 && cFecha ? cFecha : undefined,
              sheetRowIndex: rr,
            });
          } else if (stage === 'EXTRA') {
            // In EXTRA stage, unlabeled rows (empty CONCEPTO & empty FECHA) are empty spacers or unlabeled TOTAL EXTRA summary rows
            if (!cConcepto && !cFecha) {
              const nextLine = grid[rr + 1] || [];
              const nextCol0 = String(nextLine[c] || '').trim().toUpperCase();
              const nextCol1 = String(nextLine[c + 1] || '').trim().toUpperCase();
              if (
                nextCol0 === 'TOTALES' ||
                nextCol1 === 'TOTALES' ||
                nextCol0 === 'A COBRAR' ||
                nextCol1 === 'A COBRAR'
              ) {
                totalExtraRowIndex = rr;
                stage = 'DONE';
              }
              continue;
            }

            const tarifaUnitaria = parseCurrencyNumber(cCol2);
            const isDate =
              egreso > 0 ||
              isLikelyDateString(cFecha) ||
              (egreso > 0 && ingreso === 0 && /TRANSFERENCIA|CANCELACION|ANTICIPO|A CTA/i.test(upperConcepto));

            const cantidad =
              tarifaUnitaria > 0 && ingreso > 0 && egreso === 0
                ? parseCurrencyNumber(cFecha)
                : isDate
                  ? 0
                  : parseCurrencyNumber(cFecha);
            const fechaDetalle =
              !(tarifaUnitaria > 0 && ingreso > 0 && egreso === 0) && isDate && cFecha
                ? cFecha
                : undefined;

            const parsedConcepto = cConcepto || 'CONCEPTO ADICIONAL';
            extraItems.push({
              id: `e-${rr}-${c}`,
              fechaDetalle,
              cantidad,
              concepto: parsedConcepto,
              tarifaUnitaria,
              ingreso,
              egreso,
              manualMonto: true,
              sheetRowIndex: rr,
              tipoMovimiento: classifyPayrollExtraItem({
                concepto: parsedConcepto,
                tarifaUnitaria,
                ingreso,
                egreso,
              }),
            });
          }
        }

        const parsedSlip = recalculatePayrollSlip({
          id: `SLIP-${tabTitle}-W${currentWeekNumber}-${r}-${c}`,
          empleadoNombre,
          grupoSemana: currentBanner,
          numeroSemana: currentWeekNumber,
          mesTexto: mesTexto || tabTitle,
          rangoFecha: rangoFecha || '01 AL 31',
          valorBaseJornal,
          codigoCabecera,
          basicItems,
          extraItems,
          totalBasicoIngresos: 0,
          totalBasicoEgresos: 0,
          totalExtraIngresos: 0,
          totalExtraEgresos: 0,
          totalIngresos: 0,
          totalEgresos: 0,
          netoACobrar: 0,
          etiquetaNeto,
          sheetSource: {
            tabTitle,
            headerRowIndex: r - 1,
            startColIndex: c,
            totalBasicoRowIndex,
            totalExtraRowIndex,
          },
        });

        // Skip completely empty template blocks with $0 ingresos and $0 egresos
        if (parsedSlip.totalIngresos === 0 && parsedSlip.totalEgresos === 0) {
          continue;
        }

        slips.push(parsedSlip);
      }
    }
  }

  return slips;
}

export const INITIAL_LA_HORMIGA_PAYROLL_PERIODS: PayrollPeriodRecord[] = [];
