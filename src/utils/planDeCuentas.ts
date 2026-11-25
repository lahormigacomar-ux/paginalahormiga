import {
  AccountingAccount,
  AccountingEntry,
  AccountingEntryLine,
  AccountingRubro,
  CustomerPaymentMethod,
  CustomerPaymentReceipt,
} from '../types';

export const RUBRO_ORDER: AccountingRubro[] = [
  'ACTIVO',
  'PASIVO',
  'PATRIMONIO_NETO',
  'INGRESOS',
  'EGRESOS',
];

export const RUBRO_META: Record<
  AccountingRubro,
  {
    numero: string;
    label: string;
    shortLabel: string;
    explicacion: string;
    naturaleza: 'DEBE' | 'HABER';
    badgeClass: string;
    headerBg: string;
    accentText: string;
    defaultSubrubro: string;
  }
> = {
  ACTIVO: {
    numero: '1',
    label: '1. ACTIVO',
    shortLabel: 'Activo',
    explicacion: 'Lo que tiene la empresa: Bancos, Caja, Cheques a depositar, Clientes a cobrar y Retenciones.',
    naturaleza: 'DEBE',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    headerBg: 'bg-emerald-950/35 border-emerald-500/30',
    accentText: 'text-emerald-400',
    defaultSubrubro: 'Disponibilidades y Tesorería',
  },
  PASIVO: {
    numero: '2',
    label: '2. PASIVO',
    shortLabel: 'Pasivo',
    explicacion: 'Lo que debe la empresa: Proveedores, Sueldos e Impuestos a pagar.',
    naturaleza: 'HABER',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
    headerBg: 'bg-rose-950/30 border-rose-500/30',
    accentText: 'text-rose-400',
    defaultSubrubro: 'Deudas y Obligaciones',
  },
  PATRIMONIO_NETO: {
    numero: '3',
    label: '3. PATRIMONIO NETO',
    shortLabel: 'Patrimonio',
    explicacion: 'Capital propio y resultados acumulados.',
    naturaleza: 'HABER',
    badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/35',
    headerBg: 'bg-violet-950/30 border-violet-500/30',
    accentText: 'text-violet-400',
    defaultSubrubro: 'Capital y Resultados',
  },
  INGRESOS: {
    numero: '4',
    label: '4. INGRESOS',
    shortLabel: 'Ingresos',
    explicacion: 'Facturación por alquiler de maquinaria, obras, ferretería y áridos.',
    naturaleza: 'HABER',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35',
    headerBg: 'bg-cyan-950/30 border-cyan-500/30',
    accentText: 'text-cyan-400',
    defaultSubrubro: 'Ventas y Servicios',
  },
  EGRESOS: {
    numero: '5',
    label: '5. EGRESOS / GASTOS',
    shortLabel: 'Egresos',
    explicacion: 'Combustible, mantenimiento, sueldos, gastos generales y descuentos otorgados.',
    naturaleza: 'DEBE',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
    headerBg: 'bg-amber-950/30 border-amber-500/30',
    accentText: 'text-amber-400',
    defaultSubrubro: 'Gastos Operativos',
  },
};

export const DEFAULT_ACCOUNTING_ACCOUNTS: AccountingAccount[] = [
  // 1.1 DISPONIBILIDADES Y TESORERÍA
  {
    id: 'CTA-1101',
    codigo: '1.1.01',
    nombre: 'Caja General (Efectivo)',
    rubro: 'ACTIVO',
    subrubro: '1.1 Disponibilidades y Tesorería',
    descripcion: 'Dinero en efectivo recibido en mostrador o caja diaria.',
    esCuentaTesoreria: true,
    tipoTesoreria: 'CAJA',
    mediosVinculados: ['EFECTIVO_CAJA'],
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-1102',
    codigo: '1.1.02',
    nombre: 'Banco Macro — Cuenta Corriente',
    rubro: 'ACTIVO',
    subrubro: '1.1 Disponibilidades y Tesorería',
    descripcion: 'Transferencias bancarias y depósitos acreditados en Banco Macro.',
    esCuentaTesoreria: true,
    tipoTesoreria: 'BANCO',
    mediosVinculados: ['TRANSFERENCIA', 'MIXTO'],
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-1103',
    codigo: '1.1.03',
    nombre: 'Banco Nación — Cuenta Corriente',
    rubro: 'ACTIVO',
    subrubro: '1.1 Disponibilidades y Tesorería',
    descripcion: 'Transferencias bancarias y depósitos acreditados en Banco Nación.',
    esCuentaTesoreria: true,
    tipoTesoreria: 'BANCO',
    mediosVinculados: ['TRANSFERENCIA'],
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-1104',
    codigo: '1.1.04',
    nombre: 'Otros Bancos (Transferencias)',
    rubro: 'ACTIVO',
    subrubro: '1.1 Disponibilidades y Tesorería',
    descripcion: 'Cuenta bancaria alternativa para otras transferencias o cuentas en pesos.',
    esCuentaTesoreria: true,
    tipoTesoreria: 'BANCO',
    mediosVinculados: ['TRANSFERENCIA'],
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-1105',
    codigo: '1.1.05',
    nombre: 'Valores a Depositar (Cheques / E-Cheq)',
    rubro: 'ACTIVO',
    subrubro: '1.1 Disponibilidades y Tesorería',
    descripcion: 'Cheques físicos y E-Cheqs recibidos de clientes hasta que se acreditan en Banco.',
    esCuentaTesoreria: true,
    tipoTesoreria: 'VALORES',
    mediosVinculados: ['CHEQUE_ECHEQ'],
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-1106',
    codigo: '1.1.06',
    nombre: 'Mercado Pago / Tarjetas a Acreditar',
    rubro: 'ACTIVO',
    subrubro: '1.1 Disponibilidades y Tesorería',
    descripcion: 'Cobros con tarjetas de débito/crédito, QR y billeteras virtuales.',
    esCuentaTesoreria: true,
    tipoTesoreria: 'BILLETERA',
    mediosVinculados: ['TARJETA'],
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },

  // 1.2 CRÉDITOS Y RETENCIONES
  {
    id: 'CTA-1201',
    codigo: '1.2.01',
    nombre: 'Clientes / Deudores por Ventas',
    rubro: 'ACTIVO',
    subrubro: '1.2 Créditos y Retenciones',
    descripcion: 'Facturas emitidas a clientes pendientes de cobro (se cancela al bajar cada factura).',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-1202',
    codigo: '1.2.02',
    nombre: 'Retenciones Sufridas (IIBB / Ganancias / SUSS / IVA)',
    rubro: 'ACTIVO',
    subrubro: '1.2 Créditos y Retenciones',
    descripcion: 'Certificados de retención impositiva descontados por los clientes al pagar facturas.',
    esCuentaTesoreria: true,
    tipoTesoreria: 'OTRO',
    mediosVinculados: ['RETENCIONES'],
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },

  // 2. PASIVO
  {
    id: 'CTA-2101',
    codigo: '2.1.01',
    nombre: 'Proveedores / Cuentas a Pagar',
    rubro: 'PASIVO',
    subrubro: '2.1 Deudas Comerciales',
    descripcion: 'Facturas de proveedores pendientes de pago y compensaciones/canjes.',
    esCuentaTesoreria: false,
    mediosVinculados: ['COMPENSACION_CANJE'],
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-2102',
    codigo: '2.1.02',
    nombre: 'Sueldos y Cargas Sociales a Pagar',
    rubro: 'PASIVO',
    subrubro: '2.2 Deudas Laborales y Fiscales',
    descripcion: 'Liquidaciones de sueldos y aportes patronales pendientes.',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-2103',
    codigo: '2.1.03',
    nombre: 'Impuestos a Pagar (IVA / IIBB / ARCA)',
    rubro: 'PASIVO',
    subrubro: '2.2 Deudas Laborales y Fiscales',
    descripcion: 'Saldos impositivos mensuales a ingresar.',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },

  // 3. PATRIMONIO NETO
  {
    id: 'CTA-3101',
    codigo: '3.1.01',
    nombre: 'Capital Social y Resultados',
    rubro: 'PATRIMONIO_NETO',
    subrubro: '3.1 Patrimonio',
    descripcion: 'Capital inicial de la empresa y resultados acumulados.',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },

  // 4. INGRESOS
  {
    id: 'CTA-4101',
    codigo: '4.1.01',
    nombre: 'Ingresos por Alquiler de Maquinaria y Obras',
    rubro: 'INGRESOS',
    subrubro: '4.1 Ventas y Servicios',
    descripcion: 'Servicios de alquiler de equipos, horas de máquina y certificados de obra.',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-4102',
    codigo: '4.1.02',
    nombre: 'Ventas de Ferretería y Áridos',
    rubro: 'INGRESOS',
    subrubro: '4.1 Ventas y Servicios',
    descripcion: 'Ventas de mostrador de ferretería, materiales y despacho de áridos.',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-4103',
    codigo: '4.1.03',
    nombre: 'Otros Ingresos',
    rubro: 'INGRESOS',
    subrubro: '4.1 Ventas y Servicios',
    descripcion: 'Ingresos extraordinarios o conceptos varios.',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },

  // 5. EGRESOS / GASTOS
  {
    id: 'CTA-5101',
    codigo: '5.1.01',
    nombre: 'Combustibles y Lubricantes',
    rubro: 'EGRESOS',
    subrubro: '5.1 Costos Operativos',
    descripcion: 'Gasoil, nafta, urea, aceites y grasas de flota.',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-5102',
    codigo: '5.1.02',
    nombre: 'Mantenimiento y Repuestos de Flota',
    rubro: 'EGRESOS',
    subrubro: '5.1 Costos Operativos',
    descripcion: 'Services, repuestos, cubiertas y mano de obra de taller.',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-5103',
    codigo: '5.1.03',
    nombre: 'Sueldos y Jornales',
    rubro: 'EGRESOS',
    subrubro: '5.1 Costos Operativos',
    descripcion: 'Haberes de choferes, maquinistas y personal administrativo.',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-5104',
    codigo: '5.1.04',
    nombre: 'Gastos Generales y Administración',
    rubro: 'EGRESOS',
    subrubro: '5.2 Gastos de Estructura',
    descripcion: 'Seguros, lavadero, servicios, alquileres de predio y gastos administrativos.',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
  {
    id: 'CTA-5105',
    codigo: '5.1.05',
    nombre: 'Descuentos y Redondeos Otorgados',
    rubro: 'EGRESOS',
    subrubro: '5.2 Gastos de Estructura',
    descripcion: 'Bonificaciones por pronto pago o ajustes de centavos al cobrar facturas.',
    esCuentaTesoreria: false,
    moneda: 'ARS',
    saldoInicial: 0,
    activa: true,
    esSistema: true,
  },
];

export function sortAccountsByCode(accounts: AccountingAccount[]): AccountingAccount[] {
  return [...accounts].sort((a, b) =>
    (a.codigo || '').localeCompare(b.codigo || '', undefined, { numeric: true })
  );
}

export function getEffectiveAccounts(accounts?: AccountingAccount[]): AccountingAccount[] {
  if (accounts && accounts.length > 0) {
    return sortAccountsByCode(accounts);
  }
  return sortAccountsByCode(DEFAULT_ACCOUNTING_ACCOUNTS);
}

/**
 * Sugiere la cuenta contable destino correcta según el medio de cobro elegido.
 * Ej: Transferencia -> Bancos (1.1.02), Efectivo -> Caja (1.1.01), Cheque/E-Cheq -> Valores a Depositar (1.1.05).
 */
export function resolveDefaultAccountForPaymentMethod(
  method: CustomerPaymentMethod,
  accountsInput?: AccountingAccount[]
): AccountingAccount {
  const accounts = getEffectiveAccounts(accountsInput).filter(a => a.activa !== false);

  // 1. Coincidencia directa por mediosVinculados
  const byLinked = accounts.find(a => a.mediosVinculados?.includes(method));
  if (byLinked) return byLinked;

  // 2. Coincidencia por tipo de tesorería
  if (method === 'TRANSFERENCIA' || method === 'MIXTO') {
    const bank = accounts.find(a => a.tipoTesoreria === 'BANCO' || a.nombre.toLowerCase().includes('banco'));
    if (bank) return bank;
  }
  if (method === 'EFECTIVO_CAJA') {
    const cash = accounts.find(a => a.tipoTesoreria === 'CAJA' || a.nombre.toLowerCase().includes('caja'));
    if (cash) return cash;
  }
  if (method === 'CHEQUE_ECHEQ') {
    const val = accounts.find(
      a => a.tipoTesoreria === 'VALORES' || a.nombre.toLowerCase().includes('valor') || a.nombre.toLowerCase().includes('cheque')
    );
    if (val) return val;
  }
  if (method === 'TARJETA') {
    const wallet = accounts.find(
      a => a.tipoTesoreria === 'BILLETERA' || a.nombre.toLowerCase().includes('tarjeta') || a.nombre.toLowerCase().includes('mercado')
    );
    if (wallet) return wallet;
  }
  if (method === 'RETENCIONES') {
    const ret = accounts.find(a => a.id === 'CTA-1202' || a.nombre.toLowerCase().includes('retenc'));
    if (ret) return ret;
  }
  if (method === 'COMPENSACION_CANJE') {
    const prov = accounts.find(a => a.id === 'CTA-2101' || a.nombre.toLowerCase().includes('proveedor'));
    if (prov) return prov;
  }

  return accounts[0] || DEFAULT_ACCOUNTING_ACCOUNTS[1];
}

/**
 * Define si por defecto debe tildarse "Impactar en Caja Diaria".
 * Solo el efectivo físico entra a Caja Diaria; transferencias, cheques y tarjetas van directo a Bancos / Valores.
 */
export function shouldDefaultImpactCajaDiaria(
  method: CustomerPaymentMethod,
  selectedAccount?: AccountingAccount | null
): boolean {
  if (selectedAccount) {
    if (selectedAccount.tipoTesoreria === 'CAJA') return true;
    if (selectedAccount.tipoTesoreria === 'BANCO' || selectedAccount.tipoTesoreria === 'VALORES' || selectedAccount.tipoTesoreria === 'BILLETERA') {
      return false;
    }
  }
  return method === 'EFECTIVO_CAJA';
}

/**
 * Construye el asiento contable balanceado (Debe = Haber) a partir de un Recibo de Cobranza.
 */
export function buildReceiptAccountingEntry(
  receipt: CustomerPaymentReceipt,
  accountsInput?: AccountingAccount[],
  entryId?: string
): AccountingEntry {
  const accounts = getEffectiveAccounts(accountsInput);
  const findByIdOrCode = (id?: string, code?: string) =>
    accounts.find(a => (id && a.id === id) || (code && a.codigo === code));

  const destAccount =
    findByIdOrCode(receipt.cuentaDestinoId, receipt.cuentaDestinoCodigo) ||
    resolveDefaultAccountForPaymentMethod(receipt.formaPago, accounts);

  const retAccount =
    findByIdOrCode('CTA-1202', '1.2.02') ||
    accounts.find(a => a.nombre.toLowerCase().includes('retenc')) ||
    DEFAULT_ACCOUNTING_ACCOUNTS.find(a => a.id === 'CTA-1202')!;

  const dtoAccount =
    findByIdOrCode('CTA-5105', '5.1.05') ||
    accounts.find(a => a.nombre.toLowerCase().includes('descuento')) ||
    DEFAULT_ACCOUNTING_ACCOUNTS.find(a => a.id === 'CTA-5105')!;

  const clientsAccount =
    findByIdOrCode('CTA-1201', '1.2.01') ||
    accounts.find(a => a.nombre.toLowerCase().includes('cliente') || a.nombre.toLowerCase().includes('deudores')) ||
    DEFAULT_ACCOUNTING_ACCOUNTS.find(a => a.id === 'CTA-1201')!;

  const lineas: AccountingEntryLine[] = [];
  const montoNeto = Number(receipt.montoCobrado || 0);
  const totalRet =
    Number(receipt.retencionesIibb || 0) +
    Number(receipt.retencionesGanancias || 0) +
    Number(receipt.retencionesSussIva || 0);
  const descuento = Number(receipt.descuentoProntoPago || 0);

  if (montoNeto > 0) {
    lineas.push({
      cuentaId: destAccount.id,
      cuentaCodigo: destAccount.codigo,
      cuentaNombre: destAccount.nombre,
      debe: Number(montoNeto.toFixed(2)),
      haber: 0,
      detalle: receipt.bancoReferencia
        ? `${receipt.formaPago.replace(/_/g, ' ')} • ${receipt.bancoReferencia}`
        : receipt.formaPago.replace(/_/g, ' '),
    });
  }

  if (totalRet > 0) {
    const retParts: string[] = [];
    if (receipt.retencionesIibb) retParts.push(`IIBB $${receipt.retencionesIibb.toLocaleString('es-AR')}`);
    if (receipt.retencionesGanancias) retParts.push(`Gan. $${receipt.retencionesGanancias.toLocaleString('es-AR')}`);
    if (receipt.retencionesSussIva) retParts.push(`SUSS/IVA $${receipt.retencionesSussIva.toLocaleString('es-AR')}`);
    lineas.push({
      cuentaId: retAccount.id,
      cuentaCodigo: retAccount.codigo,
      cuentaNombre: retAccount.nombre,
      debe: Number(totalRet.toFixed(2)),
      haber: 0,
      detalle: retParts.join(' · ') || 'Certificado de retenciones',
    });
  }

  if (descuento > 0) {
    lineas.push({
      cuentaId: dtoAccount.id,
      cuentaCodigo: dtoAccount.codigo,
      cuentaNombre: dtoAccount.nombre,
      debe: Number(descuento.toFixed(2)),
      haber: 0,
      detalle: 'Descuento / ajuste por redondeo',
    });
  }

  const totalDebe = Number(lineas.reduce((acc, l) => acc + l.debe, 0).toFixed(2));
  const facturasLabel =
    receipt.facturasNumeros && receipt.facturasNumeros.length > 0
      ? `Fact. ${receipt.facturasNumeros.join(', ')}`
      : receipt.rentalsNumeros && receipt.rentalsNumeros.length > 0
      ? `Alq. ${receipt.rentalsNumeros.join(', ')}`
      : 'Cobranza';

  if (totalDebe > 0) {
    lineas.push({
      cuentaId: clientsAccount.id,
      cuentaCodigo: clientsAccount.codigo,
      cuentaNombre: clientsAccount.nombre,
      debe: 0,
      haber: totalDebe,
      detalle: `Cancela ${facturasLabel} (${receipt.clienteNombre})`,
    });
  }

  return {
    id: entryId || receipt.asientoContableId || `AS-${receipt.id}`,
    numero: receipt.numeroRecibo,
    fecha: receipt.fecha,
    concepto: `Cobranza ${facturasLabel} — ${receipt.clienteNombre}`,
    origen: 'COBRANZA_FACTURA',
    referenciaId: receipt.id,
    referenciaNumero: `REC ${receipt.numeroRecibo}`,
    clienteProveedor: receipt.clienteNombre,
    moneda: receipt.moneda || 'ARS',
    lineas,
    totalDebe,
    totalHaber: totalDebe,
    observaciones: receipt.observaciones,
    createdAt: receipt.createdAt || new Date().toISOString(),
  };
}

export interface AccountLedgerRow {
  entryId: string;
  fecha: string;
  concepto: string;
  origen: AccountingEntry['origen'];
  referenciaNumero?: string;
  clienteProveedor?: string;
  detalle?: string;
  debe: number;
  haber: number;
  efectoSaldo: number;
  saldoAcumulado: number;
  esHistoricoAuto?: boolean;
}

export interface AccountBalanceSummary {
  account: AccountingAccount;
  saldoInicial: number;
  totalDebe: number;
  totalHaber: number;
  saldoActual: number;
  movimientosCount: number;
  movimientos: AccountLedgerRow[];
}

/**
 * Combina asientos guardados en Supabase + recibos históricos anteriores a la creación del Plan de Cuentas
 * (sin duplicar nunca) y calcula los saldos vivos y el mayor de cada cuenta.
 */
export function computeChartOfAccountsSummary(
  accountsInput: AccountingAccount[],
  persistedEntries: AccountingEntry[],
  customerReceipts: CustomerPaymentReceipt[] = []
): {
  allEntries: Array<AccountingEntry & { esHistoricoAuto?: boolean }>;
  byAccountId: Record<string, AccountBalanceSummary>;
} {
  const accounts = getEffectiveAccounts(accountsInput);
  const persistedReceiptIds = new Set(
    persistedEntries
      .filter(e => e.origen === 'COBRANZA_FACTURA' && e.referenciaId)
      .map(e => e.referenciaId!)
  );
  const persistedEntryIds = new Set(persistedEntries.map(e => e.id));

  const legacyEntries: Array<AccountingEntry & { esHistoricoAuto?: boolean }> = [];
  customerReceipts.forEach(rec => {
    if (persistedReceiptIds.has(rec.id)) return;
    if (rec.asientoContableId && persistedEntryIds.has(rec.asientoContableId)) return;
    const synthesized = buildReceiptAccountingEntry(rec, accounts, `AS-HIST-${rec.id}`);
    if (synthesized.totalDebe > 0) {
      legacyEntries.push({ ...synthesized, esHistoricoAuto: true });
    }
  });

  const allEntries: Array<AccountingEntry & { esHistoricoAuto?: boolean }> = [
    ...persistedEntries.map(e => ({ ...e, esHistoricoAuto: false })),
    ...legacyEntries,
  ].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));

  const byAccountId: Record<string, AccountBalanceSummary> = {};
  accounts.forEach(acc => {
    const saldoInicial = Number(acc.saldoInicial || 0);
    byAccountId[acc.id] = {
      account: acc,
      saldoInicial,
      totalDebe: 0,
      totalHaber: 0,
      saldoActual: saldoInicial,
      movimientosCount: 0,
      movimientos: [],
    };
  });

  // Orden cronológico ascendente para calcular saldo acumulado correctamente
  const chrono = [...allEntries].sort(
    (a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.createdAt || '').localeCompare(b.createdAt || '')
  );

  chrono.forEach(entry => {
    (entry.lineas || []).forEach(line => {
      const target =
        byAccountId[line.cuentaId] ||
        Object.values(byAccountId).find(s => s.account.codigo === line.cuentaCodigo);
      if (!target) return;

      const meta = RUBRO_META[target.account.rubro] || RUBRO_META.ACTIVO;
      const debe = Number(line.debe || 0);
      const haber = Number(line.haber || 0);
      const efectoSaldo = meta.naturaleza === 'DEBE' ? debe - haber : haber - debe;

      target.totalDebe = Number((target.totalDebe + debe).toFixed(2));
      target.totalHaber = Number((target.totalHaber + haber).toFixed(2));
      target.saldoActual = Number((target.saldoActual + efectoSaldo).toFixed(2));
      target.movimientosCount += 1;
      target.movimientos.push({
        entryId: entry.id,
        fecha: entry.fecha,
        concepto: entry.concepto,
        origen: entry.origen,
        referenciaNumero: entry.referenciaNumero,
        clienteProveedor: entry.clienteProveedor,
        detalle: line.detalle,
        debe,
        haber,
        efectoSaldo,
        saldoAcumulado: target.saldoActual,
        esHistoricoAuto: entry.esHistoricoAuto,
      });
    });
  });

  // Invertimos movimientos de cada cuenta para mostrar lo más reciente primero en el Mayor
  Object.values(byAccountId).forEach(summary => {
    summary.movimientos.reverse();
  });

  return { allEntries, byAccountId };
}

export function suggestNextAccountCode(
  rubro: AccountingRubro,
  accounts: AccountingAccount[],
  subPrefix?: string
): string {
  const rubroNum = RUBRO_META[rubro].numero;
  const prefix = subPrefix || `${rubroNum}.1`;
  const matching = accounts
    .map(a => a.codigo)
    .filter(c => c.startsWith(`${prefix}.`))
    .map(c => parseInt(c.split('.')[2] || '0', 10))
    .filter(n => !isNaN(n));
  const nextNum = matching.length > 0 ? Math.max(...matching) + 1 : 1;
  return `${prefix}.${String(nextNum).padStart(2, '0')}`;
}

export function buildChequeAcreditacionEntry(
  cheque: {
    id: string;
    numeroCheque: string;
    tipo: 'FISICO' | 'ECHEQ';
    bancoEmisor: string;
    importe: number;
    moneda?: 'ARS' | 'USD';
    clienteNombre?: string;
    cuentaValoresId?: string;
    boletaDeposito?: string;
  },
  bancoAccount: AccountingAccount,
  fechaAcreditacion: string,
  accountsInput?: AccountingAccount[],
  entryId?: string
): AccountingEntry {
  const accounts = getEffectiveAccounts(accountsInput);
  const valoresAccount =
    accounts.find(a => cheque.cuentaValoresId && a.id === cheque.cuentaValoresId) ||
    accounts.find(a => a.id === 'CTA-1105' || a.tipoTesoreria === 'VALORES') ||
    DEFAULT_ACCOUNTING_ACCOUNTS.find(a => a.id === 'CTA-1105')!;

  const monto = Number(Number(cheque.importe || 0).toFixed(2));
  const labelTipo = cheque.tipo === 'ECHEQ' ? 'E-Cheq' : 'Cheque';

  return {
    id: entryId || `AS-ACRED-${cheque.id}-${Date.now().toString().slice(-5)}`,
    numero: cheque.boletaDeposito || cheque.numeroCheque,
    fecha: fechaAcreditacion,
    concepto: `Acreditación ${labelTipo} #${cheque.numeroCheque} (${cheque.bancoEmisor}) → ${bancoAccount.nombre}`,
    origen: 'ACREDITACION_CHEQUE',
    referenciaId: cheque.id,
    referenciaNumero: `${labelTipo} #${cheque.numeroCheque}`,
    clienteProveedor: cheque.clienteNombre,
    moneda: cheque.moneda || 'ARS',
    lineas: [
      {
        cuentaId: bancoAccount.id,
        cuentaCodigo: bancoAccount.codigo,
        cuentaNombre: bancoAccount.nombre,
        debe: monto,
        haber: 0,
        detalle: `Acreditación ${labelTipo} #${cheque.numeroCheque}${cheque.boletaDeposito ? ` · Boleta ${cheque.boletaDeposito}` : ''}`,
      },
      {
        cuentaId: valoresAccount.id,
        cuentaCodigo: valoresAccount.codigo,
        cuentaNombre: valoresAccount.nombre,
        debe: 0,
        haber: monto,
        detalle: `Sale de Valores a Depositar (${cheque.bancoEmisor})`,
      },
    ],
    totalDebe: monto,
    totalHaber: monto,
    createdAt: new Date().toISOString(),
  };
}

export function buildChequeEndosoEntry(
  cheque: {
    id: string;
    numeroCheque: string;
    tipo: 'FISICO' | 'ECHEQ';
    bancoEmisor: string;
    importe: number;
    moneda?: 'ARS' | 'USD';
    cuentaValoresId?: string;
  },
  proveedorNombre: string,
  fechaEndoso: string,
  paymentRef?: string,
  accountsInput?: AccountingAccount[],
  entryId?: string
): AccountingEntry {
  const accounts = getEffectiveAccounts(accountsInput);
  const valoresAccount =
    accounts.find(a => cheque.cuentaValoresId && a.id === cheque.cuentaValoresId) ||
    accounts.find(a => a.id === 'CTA-1105' || a.tipoTesoreria === 'VALORES') ||
    DEFAULT_ACCOUNTING_ACCOUNTS.find(a => a.id === 'CTA-1105')!;
  const proveedoresAccount =
    accounts.find(a => a.id === 'CTA-2101' || a.codigo === '2.1.01') ||
    accounts.find(a => a.nombre.toLowerCase().includes('proveedor')) ||
    DEFAULT_ACCOUNTING_ACCOUNTS.find(a => a.id === 'CTA-2101')!;

  const monto = Number(Number(cheque.importe || 0).toFixed(2));
  const labelTipo = cheque.tipo === 'ECHEQ' ? 'E-Cheq' : 'Cheque';

  return {
    id: entryId || `AS-END-${cheque.id}-${Date.now().toString().slice(-5)}`,
    numero: paymentRef || cheque.numeroCheque,
    fecha: fechaEndoso,
    concepto: `Endoso ${labelTipo} #${cheque.numeroCheque} a ${proveedorNombre}`,
    origen: 'ENDOSO_CHEQUE',
    referenciaId: cheque.id,
    referenciaNumero: paymentRef ? `${paymentRef} · ${labelTipo} #${cheque.numeroCheque}` : `${labelTipo} #${cheque.numeroCheque}`,
    clienteProveedor: proveedorNombre,
    moneda: cheque.moneda || 'ARS',
    lineas: [
      {
        cuentaId: proveedoresAccount.id,
        cuentaCodigo: proveedoresAccount.codigo,
        cuentaNombre: proveedoresAccount.nombre,
        debe: monto,
        haber: 0,
        detalle: `Cancela deuda proveedor ${proveedorNombre} con ${labelTipo} #${cheque.numeroCheque}`,
      },
      {
        cuentaId: valoresAccount.id,
        cuentaCodigo: valoresAccount.codigo,
        cuentaNombre: valoresAccount.nombre,
        debe: 0,
        haber: monto,
        detalle: `Entrega ${labelTipo} #${cheque.numeroCheque} (${cheque.bancoEmisor})`,
      },
    ],
    totalDebe: monto,
    totalHaber: monto,
    createdAt: new Date().toISOString(),
  };
}

export function buildChequeRechazoEntry(
  cheque: {
    id: string;
    numeroCheque: string;
    tipo: 'FISICO' | 'ECHEQ';
    bancoEmisor: string;
    importe: number;
    moneda?: 'ARS' | 'USD';
    clienteNombre?: string;
    estadoPrevio?: string;
    cuentaValoresId?: string;
    bancoDestinoId?: string;
    bancoDestinoCodigo?: string;
    bancoDestinoNombre?: string;
    motivoRechazo?: string;
  },
  fechaRechazo: string,
  gastosRechazo: number = 0,
  accountsInput?: AccountingAccount[],
  entryId?: string
): AccountingEntry {
  const accounts = getEffectiveAccounts(accountsInput);
  const clientsAccount =
    accounts.find(a => a.id === 'CTA-1201' || a.codigo === '1.2.01') ||
    DEFAULT_ACCOUNTING_ACCOUNTS.find(a => a.id === 'CTA-1201')!;
  const valoresAccount =
    accounts.find(a => cheque.cuentaValoresId && a.id === cheque.cuentaValoresId) ||
    accounts.find(a => a.id === 'CTA-1105' || a.tipoTesoreria === 'VALORES') ||
    DEFAULT_ACCOUNTING_ACCOUNTS.find(a => a.id === 'CTA-1105')!;
  const bancoAccount =
    cheque.estadoPrevio === 'ACREDITADO' && cheque.bancoDestinoId
      ? accounts.find(a => a.id === cheque.bancoDestinoId) || valoresAccount
      : valoresAccount;
  const gastosAccount =
    accounts.find(a => a.rubro === 'EGRESOS' && a.nombre.toLowerCase().includes('bancar')) ||
    accounts.find(a => a.id === 'CTA-5105' || a.codigo === '5.1.05') ||
    accounts.find(a => a.rubro === 'EGRESOS') ||
    DEFAULT_ACCOUNTING_ACCOUNTS.find(a => a.id === 'CTA-5105')!;

  const monto = Number(Number(cheque.importe || 0).toFixed(2));
  const gastos = Math.max(0, Number(Number(gastosRechazo || 0).toFixed(2)));
  const total = Number((monto + gastos).toFixed(2));
  const labelTipo = cheque.tipo === 'ECHEQ' ? 'E-Cheq' : 'Cheque';

  const lineas: AccountingEntryLine[] = [
    {
      cuentaId: clientsAccount.id,
      cuentaCodigo: clientsAccount.codigo,
      cuentaNombre: clientsAccount.nombre,
      debe: monto,
      haber: 0,
      detalle: `Reabre deuda cliente por rechazo ${labelTipo} #${cheque.numeroCheque}`,
    },
  ];

  if (gastos > 0) {
    lineas.push({
      cuentaId: gastosAccount.id,
      cuentaCodigo: gastosAccount.codigo,
      cuentaNombre: gastosAccount.nombre,
      debe: gastos,
      haber: 0,
      detalle: `Comisión / gastos rechazo bancario ${labelTipo} #${cheque.numeroCheque}`,
    });
  }

  lineas.push({
    cuentaId: bancoAccount.id,
    cuentaCodigo: bancoAccount.codigo,
    cuentaNombre: bancoAccount.nombre,
    debe: 0,
    haber: total,
    detalle: `Reversión por rechazo (${cheque.motivoRechazo || 'Sin fondos / rechazado'})`,
  });

  return {
    id: entryId || `AS-RECH-${cheque.id}-${Date.now().toString().slice(-5)}`,
    numero: cheque.numeroCheque,
    fecha: fechaRechazo,
    concepto: `Rechazo ${labelTipo} #${cheque.numeroCheque} — ${cheque.clienteNombre || cheque.bancoEmisor}`,
    origen: 'RECHAZO_CHEQUE',
    referenciaId: cheque.id,
    referenciaNumero: `${labelTipo} #${cheque.numeroCheque}`,
    clienteProveedor: cheque.clienteNombre,
    moneda: cheque.moneda || 'ARS',
    lineas,
    totalDebe: total,
    totalHaber: total,
    observaciones: cheque.motivoRechazo,
    createdAt: new Date().toISOString(),
  };
}

