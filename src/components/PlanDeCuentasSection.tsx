import React, { useMemo, useState } from 'react';
import {
  AccountingAccount,
  AccountingEntry,
  AccountingRubro,
  AccountingTreasuryKind,
  CustomerPaymentMethod,
  CustomerPaymentReceipt,
} from '../types';
import {
  DEFAULT_ACCOUNTING_ACCOUNTS,
  RUBRO_META,
  RUBRO_ORDER,
  computeChartOfAccountsSummary,
  getEffectiveAccounts,
  suggestNextAccountCode,
} from '../utils/planDeCuentas';
import {
  Landmark,
  Wallet,
  CreditCard,
  Receipt,
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  X,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
} from 'lucide-react';

interface PlanDeCuentasSectionProps {
  accounts: AccountingAccount[];
  entries: AccountingEntry[];
  customerReceipts: CustomerPaymentReceipt[];
  onSaveAccount: (account: AccountingAccount) => Promise<void> | void;
  onDeleteAccount: (accountId: string) => Promise<void> | void;
  onSaveEntry: (entry: AccountingEntry) => Promise<void> | void;
  onDeleteEntry: (entryId: string) => Promise<void> | void;
  onInitializeDefaultAccounts?: (defaults: AccountingAccount[]) => Promise<void> | void;
  onNavigateToCobranzas?: () => void;
}

const formatMoney = (amount: number) => {
  const val = Number(amount || 0);
  const abs = Math.abs(val);
  const formatted = abs.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `-$ ${formatted}` : `$ ${formatted}`;
};

const TREASURY_BADGE: Record<
  AccountingTreasuryKind,
  { label: string; className: string }
> = {
  BANCO: {
    label: 'Banco',
    className: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
  },
  CAJA: {
    label: 'Caja Efectivo',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  },
  VALORES: {
    label: 'Cheques / E-Cheq',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
  },
  BILLETERA: {
    label: 'Billetera / Tarjetas',
    className: 'bg-violet-500/15 text-violet-300 border-violet-500/35',
  },
  OTRO: {
    label: 'Crédito / Retención',
    className: 'bg-slate-700/60 text-slate-300 border-slate-600',
  },
};

export const PlanDeCuentasSection: React.FC<PlanDeCuentasSectionProps> = ({
  accounts,
  entries,
  customerReceipts,
  onSaveAccount,
  onDeleteAccount,
  onSaveEntry,
  onDeleteEntry,
  onInitializeDefaultAccounts,
  onNavigateToCobranzas,
}) => {
  const effectiveAccounts = useMemo(() => getEffectiveAccounts(accounts), [accounts]);
  const isUsingUnsavedDefaults = accounts.length === 0;

  const [activeTab, setActiveTab] = useState<'plan' | 'movimientos'>('plan');
  const [searchQuery, setSearchQuery] = useState('');
  const [rubroFilter, setRubroFilter] = useState<'ALL' | 'TESORERIA' | AccountingRubro>('ALL');
  const [onlyWithActivity, setOnlyWithActivity] = useState(false);
  const [collapsedRubros, setCollapsedRubros] = useState<Record<string, boolean>>({});

  // Modal Crear / Editar Cuenta
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountingAccount | null>(null);
  const [accCodigo, setAccCodigo] = useState('');
  const [accNombre, setAccNombre] = useState('');
  const [accRubro, setAccRubro] = useState<AccountingRubro>('ACTIVO');
  const [accSubrubro, setAccSubrubro] = useState('1.1 Disponibilidades y Tesorería');
  const [accDescripcion, setAccDescripcion] = useState('');
  const [accEsTesoreria, setAccEsTesoreria] = useState(false);
  const [accTipoTesoreria, setAccTipoTesoreria] = useState<AccountingTreasuryKind>('BANCO');
  const [accCbuAlias, setAccCbuAlias] = useState('');
  const [accSaldoInicial, setAccSaldoInicial] = useState<number>(0);

  // Modal Ver Mayor de Cuenta
  const [inspectAccountId, setInspectAccountId] = useState<string | null>(null);

  // Modal Nuevo Movimiento / Transferencia entre Cuentas
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movMode, setMovMode] = useState<'TRANSFERENCIA' | 'MANUAL'>('TRANSFERENCIA');
  const [movFecha, setMovFecha] = useState(new Date().toISOString().split('T')[0]);
  const [movOrigenId, setMovOrigenId] = useState('CTA-1105');
  const [movDestinoId, setMovDestinoId] = useState('CTA-1102');
  const [movMonto, setMovMonto] = useState<number>(0);
  const [movConcepto, setMovConcepto] = useState('');
  const [movObservaciones, setMovObservaciones] = useState('');

  // Filtro de movimientos
  const [movAccountFilter, setMovAccountFilter] = useState<string>('ALL');

  const { allEntries, byAccountId } = useMemo(
    () => computeChartOfAccountsSummary(effectiveAccounts, entries, customerReceipts),
    [effectiveAccounts, entries, customerReceipts]
  );

  // KPIs de Tesorería
  const kpis = useMemo(() => {
    let totalBancos = 0;
    let totalCaja = 0;
    let totalValoresBilleteras = 0;
    let totalRetenciones = 0;

    Object.values(byAccountId).forEach(summary => {
      const acc = summary.account;
      if (acc.tipoTesoreria === 'BANCO') totalBancos += summary.saldoActual;
      else if (acc.tipoTesoreria === 'CAJA') totalCaja += summary.saldoActual;
      else if (acc.tipoTesoreria === 'VALORES' || acc.tipoTesoreria === 'BILLETERA') {
        totalValoresBilleteras += summary.saldoActual;
      } else if (acc.id === 'CTA-1202' || acc.nombre.toLowerCase().includes('retenc')) {
        totalRetenciones += summary.saldoActual;
      }
    });

    return {
      totalBancos,
      totalCaja,
      totalValoresBilleteras,
      totalRetenciones,
    };
  }, [byAccountId]);

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return effectiveAccounts.filter(acc => {
      if (rubroFilter === 'TESORERIA' && !acc.esCuentaTesoreria) return false;
      if (rubroFilter !== 'ALL' && rubroFilter !== 'TESORERIA' && acc.rubro !== rubroFilter) {
        return false;
      }
      if (onlyWithActivity) {
        const s = byAccountId[acc.id];
        if (!s || (s.movimientosCount === 0 && s.saldoActual === 0)) return false;
      }
      if (!q) return true;
      return (
        acc.codigo.toLowerCase().includes(q) ||
        acc.nombre.toLowerCase().includes(q) ||
        (acc.subrubro || '').toLowerCase().includes(q) ||
        (acc.descripcion || '').toLowerCase().includes(q) ||
        (acc.cbuAlias || '').toLowerCase().includes(q)
      );
    });
  }, [effectiveAccounts, rubroFilter, onlyWithActivity, searchQuery, byAccountId]);

  const groupedByRubro = useMemo(() => {
    const groups: Array<{
      rubro: AccountingRubro;
      items: AccountingAccount[];
      subtotal: number;
    }> = [];

    RUBRO_ORDER.forEach(rubro => {
      const items = filteredAccounts.filter(a => a.rubro === rubro);
      if (items.length === 0) return;
      const subtotal = items.reduce((acc, item) => acc + (byAccountId[item.id]?.saldoActual || 0), 0);
      groups.push({ rubro, items, subtotal });
    });
    return groups;
  }, [filteredAccounts, byAccountId]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allEntries.filter(entry => {
      if (movAccountFilter !== 'ALL') {
        const touches = (entry.lineas || []).some(l => l.cuentaId === movAccountFilter);
        if (!touches) return false;
      }
      if (!q) return true;
      return (
        (entry.concepto || '').toLowerCase().includes(q) ||
        (entry.referenciaNumero || '').toLowerCase().includes(q) ||
        (entry.clienteProveedor || '').toLowerCase().includes(q) ||
        (entry.lineas || []).some(
          l =>
            l.cuentaCodigo.toLowerCase().includes(q) ||
            l.cuentaNombre.toLowerCase().includes(q) ||
            (l.detalle || '').toLowerCase().includes(q)
        )
      );
    });
  }, [allEntries, movAccountFilter, searchQuery]);

  const openNewAccountModal = (preset?: 'BANCO' | 'CAJA' | 'GASTO' | 'INGRESO') => {
    setEditingAccount(null);
    if (preset === 'BANCO') {
      setAccRubro('ACTIVO');
      setAccSubrubro('1.1 Disponibilidades y Tesorería');
      setAccCodigo(suggestNextAccountCode('ACTIVO', effectiveAccounts, '1.1'));
      setAccNombre('');
      setAccDescripcion('Cuenta bancaria para recibir transferencias y realizar pagos.');
      setAccEsTesoreria(true);
      setAccTipoTesoreria('BANCO');
    } else if (preset === 'CAJA') {
      setAccRubro('ACTIVO');
      setAccSubrubro('1.1 Disponibilidades y Tesorería');
      setAccCodigo(suggestNextAccountCode('ACTIVO', effectiveAccounts, '1.1'));
      setAccNombre('');
      setAccDescripcion('Caja de efectivo para movimientos diarios o de obra.');
      setAccEsTesoreria(true);
      setAccTipoTesoreria('CAJA');
    } else if (preset === 'GASTO') {
      setAccRubro('EGRESOS');
      setAccSubrubro('5.2 Gastos de Estructura');
      setAccCodigo(suggestNextAccountCode('EGRESOS', effectiveAccounts, '5.1'));
      setAccNombre('');
      setAccDescripcion('');
      setAccEsTesoreria(false);
      setAccTipoTesoreria('OTRO');
    } else if (preset === 'INGRESO') {
      setAccRubro('INGRESOS');
      setAccSubrubro('4.1 Ventas y Servicios');
      setAccCodigo(suggestNextAccountCode('INGRESOS', effectiveAccounts, '4.1'));
      setAccNombre('');
      setAccDescripcion('');
      setAccEsTesoreria(false);
      setAccTipoTesoreria('OTRO');
    } else {
      setAccRubro('ACTIVO');
      setAccSubrubro('1.1 Disponibilidades y Tesorería');
      setAccCodigo(suggestNextAccountCode('ACTIVO', effectiveAccounts, '1.1'));
      setAccNombre('');
      setAccDescripcion('');
      setAccEsTesoreria(false);
      setAccTipoTesoreria('BANCO');
    }
    setAccCbuAlias('');
    setAccSaldoInicial(0);
    setIsAccountModalOpen(true);
  };

  const openEditAccountModal = (acc: AccountingAccount) => {
    setEditingAccount(acc);
    setAccCodigo(acc.codigo);
    setAccNombre(acc.nombre);
    setAccRubro(acc.rubro);
    setAccSubrubro(acc.subrubro || RUBRO_META[acc.rubro].defaultSubrubro);
    setAccDescripcion(acc.descripcion || '');
    setAccEsTesoreria(Boolean(acc.esCuentaTesoreria));
    setAccTipoTesoreria(acc.tipoTesoreria || 'BANCO');
    setAccCbuAlias(acc.cbuAlias || '');
    setAccSaldoInicial(Number(acc.saldoInicial || 0));
    setIsAccountModalOpen(true);
  };

  const handleSaveAccountForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accCodigo.trim() || !accNombre.trim()) return;

    // Si todavía no se habían persistido las cuentas base en Supabase, las guardamos primero
    if (isUsingUnsavedDefaults && onInitializeDefaultAccounts) {
      await Promise.resolve(onInitializeDefaultAccounts(DEFAULT_ACCOUNTING_ACCOUNTS));
    }

    const linkedMethods: CustomerPaymentMethod[] | undefined = accEsTesoreria
      ? accTipoTesoreria === 'BANCO'
        ? ['TRANSFERENCIA']
        : accTipoTesoreria === 'CAJA'
        ? ['EFECTIVO_CAJA']
        : accTipoTesoreria === 'VALORES'
        ? ['CHEQUE_ECHEQ']
        : accTipoTesoreria === 'BILLETERA'
        ? ['TARJETA']
        : editingAccount?.mediosVinculados
      : undefined;

    const now = new Date().toISOString();
    const nextAcc: AccountingAccount = {
      id: editingAccount?.id || `CTA-${accCodigo.replace(/[^0-9A-Za-z]/g, '')}-${Date.now().toString().slice(-4)}`,
      codigo: accCodigo.trim(),
      nombre: accNombre.trim(),
      rubro: accRubro,
      subrubro: accSubrubro.trim() || RUBRO_META[accRubro].defaultSubrubro,
      descripcion: accDescripcion.trim() || undefined,
      esCuentaTesoreria: accEsTesoreria,
      tipoTesoreria: accEsTesoreria ? accTipoTesoreria : undefined,
      mediosVinculados: editingAccount?.mediosVinculados || linkedMethods,
      cbuAlias: accCbuAlias.trim() || undefined,
      moneda: editingAccount?.moneda || 'ARS',
      saldoInicial: Number(accSaldoInicial || 0),
      activa: true,
      esSistema: editingAccount?.esSistema,
      createdAt: editingAccount?.createdAt || now,
      updatedAt: now,
    };

    await Promise.resolve(onSaveAccount(nextAcc));
    setIsAccountModalOpen(false);
  };

  const handleSaveMovementForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const monto = Number(movMonto || 0);
    if (monto <= 0) return;
    if (!movOrigenId || !movDestinoId || movOrigenId === movDestinoId) return;

    const origenAcc = effectiveAccounts.find(a => a.id === movOrigenId);
    const destinoAcc = effectiveAccounts.find(a => a.id === movDestinoId);
    if (!origenAcc || !destinoAcc) return;

    if (isUsingUnsavedDefaults && onInitializeDefaultAccounts) {
      await Promise.resolve(onInitializeDefaultAccounts(DEFAULT_ACCOUNTING_ACCOUNTS));
    }

    const newEntry: AccountingEntry = {
      id: `AS-MAN-${Date.now()}`,
      fecha: movFecha,
      concepto:
        movConcepto.trim() ||
        (movMode === 'TRANSFERENCIA'
          ? `Pase de ${origenAcc.nombre} a ${destinoAcc.nombre}`
          : `Movimiento ${destinoAcc.nombre}`),
      origen: movMode === 'TRANSFERENCIA' ? 'TRANSFERENCIA_INTERNA' : 'MANUAL',
      moneda: 'ARS',
      lineas: [
        {
          cuentaId: destinoAcc.id,
          cuentaCodigo: destinoAcc.codigo,
          cuentaNombre: destinoAcc.nombre,
          debe: Number(monto.toFixed(2)),
          haber: 0,
          detalle: movMode === 'TRANSFERENCIA' ? `Ingresa desde ${origenAcc.codigo} ${origenAcc.nombre}` : 'Débito manual',
        },
        {
          cuentaId: origenAcc.id,
          cuentaCodigo: origenAcc.codigo,
          cuentaNombre: origenAcc.nombre,
          debe: 0,
          haber: Number(monto.toFixed(2)),
          detalle: movMode === 'TRANSFERENCIA' ? `Sale hacia ${destinoAcc.codigo} ${destinoAcc.nombre}` : 'Crédito manual',
        },
      ],
      totalDebe: Number(monto.toFixed(2)),
      totalHaber: Number(monto.toFixed(2)),
      observaciones: movObservaciones.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    await Promise.resolve(onSaveEntry(newEntry));
    setIsMovementModalOpen(false);
    setMovMonto(0);
    setMovConcepto('');
    setMovObservaciones('');
  };

  const inspectedSummary = inspectAccountId ? byAccountId[inspectAccountId] : null;

  return (
    <div className="space-y-5 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-950/90 via-slate-900 to-emerald-950/45 p-5 border border-sky-500/30 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-sky-500/20 rounded-xl border border-sky-500/40 text-sky-300 shrink-0">
              <Landmark className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                  CONTABILIDAD SIMPLE & TESORERÍA
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                  {effectiveAccounts.length} CUENTAS • {allEntries.length} MOVIMIENTOS
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1">
                Plan de Cuentas, Bancos & Movimientos
              </h1>
              <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
                Estructura ordenada y ampliable. Al cobrar una factura, las <strong className="text-sky-300">transferencias</strong> van directo a <strong className="text-white">Bancos</strong>, el <strong className="text-emerald-300">efectivo</strong> a <strong className="text-white">Caja</strong>, los <strong className="text-amber-300">cheques/E-Cheq</strong> a <strong className="text-white">Valores a Depositar</strong> y las <strong className="text-violet-300">retenciones</strong> a <strong className="text-white">Créditos Fiscales</strong>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onNavigateToCobranzas && (
              <button
                type="button"
                onClick={onNavigateToCobranzas}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Receipt className="w-4 h-4 text-emerald-400" />
                Ir a Cobranzas
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMovMode('TRANSFERENCIA');
                setMovFecha(new Date().toISOString().split('T')[0]);
                setMovMonto(0);
                setMovConcepto('');
                setMovObservaciones('');
                setIsMovementModalOpen(true);
              }}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40 transition flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
              Pase / Movimiento
            </button>
            <button
              type="button"
              onClick={() => openNewAccountModal('BANCO')}
              className="px-4 py-2.5 rounded-xl text-xs font-black bg-[#F0C800] hover:bg-amber-400 text-slate-950 transition shadow-lg shadow-amber-900/25 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Nueva Cuenta
            </button>
          </div>
        </div>
      </div>

      {/* KPIs Principales de Tesorería */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#16191F] border border-sky-500/30 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
              Total en Bancos
            </span>
            <Landmark className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {formatMoney(kpis.totalBancos)}
          </div>
          <p className="text-[11px] text-slate-400">
            Transferencias y depósitos acreditados
          </p>
        </div>

        <div className="bg-[#16191F] border border-emerald-500/30 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              Caja General (Efectivo)
            </span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {formatMoney(kpis.totalCaja)}
          </div>
          <p className="text-[11px] text-slate-400">
            Cobros e ingresos en efectivo físico
          </p>
        </div>

        <div className="bg-[#16191F] border border-amber-500/30 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
              Cheques & Billeteras
            </span>
            <CreditCard className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {formatMoney(kpis.totalValoresBilleteras)}
          </div>
          <p className="text-[11px] text-slate-400">
            Valores a depositar, E-Cheq y tarjetas
          </p>
        </div>

        <div className="bg-[#16191F] border border-violet-500/30 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-violet-300">
              Retenciones Sufridas
            </span>
            <FileSpreadsheet className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {formatMoney(kpis.totalRetenciones)}
          </div>
          <p className="text-[11px] text-slate-400">
            Créditos fiscales (IIBB, Ganancias, SUSS/IVA)
          </p>
        </div>
      </div>

      {/* Tabs + Buscador */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('plan')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'plan'
                ? 'bg-[#F0C800] text-slate-950 shadow'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Plan de Cuentas ({effectiveAccounts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('movimientos')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'movimientos'
                ? 'bg-sky-500 text-slate-950 shadow'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            Movimientos / Asientos ({allEntries.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-1 lg:justify-end">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'plan'
                  ? 'Buscar por código (1.1.02), banco o nombre...'
                  : 'Buscar movimiento, cliente, factura o cuenta...'
              }
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          {activeTab === 'plan' && (
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyWithActivity}
                onChange={e => setOnlyWithActivity(e.target.checked)}
                className="accent-emerald-500"
              />
              <span>Solo con saldo/movs.</span>
            </label>
          )}

          {activeTab === 'movimientos' && (
            <select
              value={movAccountFilter}
              onChange={e => setMovAccountFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-semibold"
            >
              <option value="ALL">Todas las cuentas</option>
              {effectiveAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.codigo} — {acc.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* TAB 1: PLAN DE CUENTAS ORDENADO */}
      {activeTab === 'plan' && (
        <div className="space-y-4">
          {/* Filtros rápidos por Rubro */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'ALL', label: 'Todos los Rubros' },
                { key: 'TESORERIA', label: '🏦 Solo Tesorería (Bancos / Caja / Cheques)' },
                ...RUBRO_ORDER.map(r => ({ key: r, label: RUBRO_META[r].label })),
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRubroFilter(tab.key as any)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    rubroFilter === tab.key
                      ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                      : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openNewAccountModal('BANCO')}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 cursor-pointer"
              >
                + Agregar Banco
              </button>
              <button
                type="button"
                onClick={() => openNewAccountModal('GASTO')}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-pointer"
              >
                + Agregar Gasto
              </button>
            </div>
          </div>

          {/* Nota guía súper clara */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-2.5 text-xs text-slate-300">
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">Cómo está ordenado:</strong> las cuentas <span className="font-mono text-emerald-300 font-bold">1.1.xx</span> son adonde entra o sale la plata (Caja, Bancos, Cheques, Billeteras). Al registrar una cobranza, el sistema elige automáticamente la cuenta según el medio de cobro y genera el movimiento contable solo. Podés hacer clic en cualquier cuenta para ver su <strong>Mayor (historial)</strong> o tocar el lápiz para renombrarla o cargar su saldo inicial.
            </div>
          </div>

          {groupedByRubro.length === 0 ? (
            <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
              No se encontraron cuentas con ese filtro.
            </div>
          ) : (
            groupedByRubro.map(group => {
              const meta = RUBRO_META[group.rubro];
              const isCollapsed = Boolean(collapsedRubros[group.rubro]);

              return (
                <div
                  key={group.rubro}
                  className="bg-[#16191F] border border-slate-800 rounded-2xl overflow-hidden shadow-lg"
                >
                  {/* Header del Rubro */}
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedRubros(prev => ({ ...prev, [group.rubro]: !prev[group.rubro] }))
                    }
                    className={`w-full px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 text-left cursor-pointer transition ${meta.headerBg}`}
                  >
                    <div className="flex items-center gap-2.5">
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-black tracking-wide ${meta.accentText}`}>
                            {meta.label}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-slate-300 border border-slate-700/80">
                            {group.items.length} cuenta{group.items.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{meta.explicacion}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase text-slate-400 block">Saldo Rubro</span>
                      <span className="text-sm font-black font-mono text-white">
                        {formatMoney(group.subtotal)}
                      </span>
                    </div>
                  </button>

                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/70 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800/80">
                          <tr>
                            <th className="py-2.5 px-4 w-24">Código</th>
                            <th className="py-2.5 px-4">Cuenta & Descripción</th>
                            <th className="py-2.5 px-4 hidden md:table-cell">Subrubro</th>
                            <th className="py-2.5 px-3 text-center w-20">Movs.</th>
                            <th className="py-2.5 px-4 text-right w-40">Saldo Actual</th>
                            <th className="py-2.5 px-4 text-right w-32">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {group.items.map(acc => {
                            const summary = byAccountId[acc.id];
                            const saldo = summary?.saldoActual || 0;
                            const movs = summary?.movimientosCount || 0;
                            const treasuryBadge =
                              acc.esCuentaTesoreria && acc.tipoTesoreria
                                ? TREASURY_BADGE[acc.tipoTesoreria]
                                : null;

                            return (
                              <tr
                                key={acc.id}
                                className="hover:bg-slate-900/70 transition group"
                              >
                                <td className="py-3 px-4 align-top">
                                  <span className="inline-block font-mono font-black text-xs px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-amber-300">
                                    {acc.codigo}
                                  </span>
                                </td>
                                <td className="py-3 px-4 align-top">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setInspectAccountId(acc.id)}
                                      className="font-bold text-white hover:text-sky-300 transition text-left cursor-pointer"
                                    >
                                      {acc.nombre}
                                    </button>
                                    {treasuryBadge && (
                                      <span
                                        className={`text-[10px] px-2 py-0.5 rounded border font-bold ${treasuryBadge.className}`}
                                      >
                                        {treasuryBadge.label}
                                      </span>
                                    )}
                                  </div>
                                  {acc.descripcion && (
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                      {acc.descripcion}
                                    </p>
                                  )}
                                  {acc.cbuAlias && (
                                    <p className="text-[10px] font-mono text-sky-300/90 mt-0.5">
                                      CBU / Alias: {acc.cbuAlias}
                                    </p>
                                  )}
                                </td>
                                <td className="py-3 px-4 align-top text-slate-400 hidden md:table-cell">
                                  {acc.subrubro}
                                </td>
                                <td className="py-3 px-3 align-top text-center">
                                  <button
                                    type="button"
                                    onClick={() => setInspectAccountId(acc.id)}
                                    className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold border transition cursor-pointer ${
                                      movs > 0
                                        ? 'bg-sky-500/15 text-sky-300 border-sky-500/35 hover:bg-sky-500/25'
                                        : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                                    }`}
                                    title="Ver mayor / movimientos de esta cuenta"
                                  >
                                    {movs}
                                  </button>
                                </td>
                                <td className="py-3 px-4 align-top text-right font-mono font-black text-sm">
                                  <span
                                    className={
                                      saldo > 0
                                        ? 'text-emerald-400'
                                        : saldo < 0
                                        ? 'text-rose-400'
                                        : 'text-slate-500'
                                    }
                                  >
                                    {formatMoney(saldo)}
                                  </span>
                                  {Number(acc.saldoInicial || 0) !== 0 && (
                                    <span className="block text-[10px] font-normal text-slate-500">
                                      Inicial: {formatMoney(acc.saldoInicial || 0)}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 align-top text-right">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setInspectAccountId(acc.id)}
                                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-slate-800 transition cursor-pointer"
                                      title="Ver Mayor / Movimientos"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openEditAccountModal(acc)}
                                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-800 transition cursor-pointer"
                                      title="Editar nombre, código o saldo inicial"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    {!acc.esSistema && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (movs > 0) return;
                                          onDeleteAccount(acc.id);
                                        }}
                                        disabled={movs > 0}
                                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                        title={
                                          movs > 0
                                            ? 'No se puede eliminar una cuenta con movimientos'
                                            : 'Eliminar cuenta'
                                        }
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: MOVIMIENTOS / LIBRO DIARIO */}
      {activeTab === 'movimientos' && (
        <div className="space-y-3">
          {filteredEntries.length === 0 ? (
            <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <p className="text-sm font-bold text-slate-300">
                Todavía no hay movimientos contables registrados.
              </p>
              <p className="text-xs text-slate-400">
                Cada vez que bajes una factura en Cobranzas o registres un pase entre cuentas, aparecerá automáticamente aquí ordenado por fecha.
              </p>
            </div>
          ) : (
            filteredEntries.map(entry => (
              <div
                key={entry.id}
                className="bg-[#16191F] border border-slate-800 rounded-2xl p-4 space-y-3 hover:border-slate-700 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {entry.fecha}
                    </span>
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                        entry.origen === 'COBRANZA_FACTURA'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                          : entry.origen === 'TRANSFERENCIA_INTERNA' || entry.origen === 'ACREDITACION_CHEQUE'
                          ? 'bg-sky-500/15 text-sky-300 border-sky-500/35'
                          : entry.origen === 'ENDOSO_CHEQUE' || entry.origen === 'PAGO_PROVEEDOR'
                          ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35'
                          : entry.origen === 'RECHAZO_CHEQUE'
                          ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                      }`}
                    >
                      {entry.origen === 'COBRANZA_FACTURA'
                        ? 'Cobranza Factura'
                        : entry.origen === 'TRANSFERENCIA_INTERNA'
                        ? 'Transferencia Interna'
                        : entry.origen === 'ACREDITACION_CHEQUE'
                        ? 'Acreditación Cheque'
                        : entry.origen === 'ENDOSO_CHEQUE'
                        ? 'Endoso Cheque'
                        : entry.origen === 'RECHAZO_CHEQUE'
                        ? 'Rechazo Cheque'
                        : entry.origen === 'PAGO_PROVEEDOR'
                        ? 'Pago Proveedor'
                        : 'Movimiento Manual'}
                    </span>
                    {entry.referenciaNumero && (
                      <span className="text-[11px] font-mono text-amber-300 font-bold">
                        {entry.referenciaNumero}
                      </span>
                    )}
                    <span className="text-xs font-bold text-white">{entry.concepto}</span>
                    {entry.esHistoricoAuto && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        Auto-imputado de recibo anterior
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm text-emerald-400">
                      {formatMoney(entry.totalDebe)}
                    </span>
                    {!entry.esHistoricoAuto && entry.origen !== 'COBRANZA_FACTURA' && (
                      <button
                        type="button"
                        onClick={() => onDeleteEntry(entry.id)}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 cursor-pointer"
                        title="Eliminar movimiento manual"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {(entry.lineas || []).map((line, idx) => (
                    <div
                      key={`${entry.id}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800/60"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {line.debe > 0 ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        )}
                        <span className="font-mono text-[11px] font-bold text-amber-300 shrink-0">
                          {line.cuentaCodigo}
                        </span>
                        <button
                          type="button"
                          onClick={() => setInspectAccountId(line.cuentaId)}
                          className="font-semibold text-white hover:text-sky-300 truncate cursor-pointer"
                        >
                          {line.cuentaNombre}
                        </button>
                        {line.detalle && (
                          <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
                            • {line.detalle}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 font-mono text-xs shrink-0">
                        <span className={line.debe > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                          Debe: {line.debe > 0 ? formatMoney(line.debe) : '-'}
                        </span>
                        <span className={line.haber > 0 ? 'text-sky-300 font-bold' : 'text-slate-600'}>
                          Haber: {line.haber > 0 ? formatMoney(line.haber) : '-'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MODAL 1: CREAR / EDITAR CUENTA */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-5 py-4 bg-black/70 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Landmark className="w-5 h-5 text-[#F0C800]" />
                <h3 className="text-sm font-black text-white">
                  {editingAccount ? `Editar Cuenta ${editingAccount.codigo}` : 'Nueva Cuenta en el Plan'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccountForm} className="p-5 space-y-4">
              {!editingAccount && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-slate-400 uppercase font-bold w-full">
                    Plantillas rápidas:
                  </span>
                  {[
                    { key: 'BANCO', label: '🏦 Cuenta Bancaria' },
                    { key: 'CAJA', label: '💵 Caja Efectivo' },
                    { key: 'GASTO', label: '💸 Cuenta de Gasto' },
                    { key: 'INGRESO', label: '📈 Cuenta de Ingreso' },
                  ].map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => openNewAccountModal(p.key as any)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-bold cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Código *
                  </label>
                  <input
                    type="text"
                    required
                    value={accCodigo}
                    onChange={e => setAccCodigo(e.target.value)}
                    placeholder="Ej: 1.1.07"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-300 focus:border-[#F0C800] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Rubro Principal *
                  </label>
                  <select
                    value={accRubro}
                    onChange={e => {
                      const nextRubro = e.target.value as AccountingRubro;
                      setAccRubro(nextRubro);
                      setAccSubrubro(RUBRO_META[nextRubro].defaultSubrubro);
                      if (!editingAccount) {
                        setAccCodigo(suggestNextAccountCode(nextRubro, effectiveAccounts));
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
                  >
                    {RUBRO_ORDER.map(r => (
                      <option key={r} value={r}>
                        {RUBRO_META[r].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Nombre de la Cuenta *
                </label>
                <input
                  type="text"
                  required
                  value={accNombre}
                  onChange={e => setAccNombre(e.target.value)}
                  placeholder="Ej: Banco Galicia — Cuenta Corriente, Caja Chica Obra, etc."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-[#F0C800] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Subrubro
                  </label>
                  <input
                    type="text"
                    value={accSubrubro}
                    onChange={e => setAccSubrubro(e.target.value)}
                    placeholder="Ej: 1.1 Disponibilidades y Tesorería"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Saldo Inicial ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={accSaldoInicial}
                    onChange={e => setAccSaldoInicial(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Descripción breve (para que se entienda fácil)
                </label>
                <input
                  type="text"
                  value={accDescripcion}
                  onChange={e => setAccDescripcion(e.target.value)}
                  placeholder="Ej: Transferencias recibidas de clientes en Banco Galicia"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              {/* Opción de Tesorería */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Es cuenta de Tesorería (recibe cobros de facturas)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Aparecerá destacada en el selector al cobrar facturas (Bancos, Caja, Cheques, Billeteras)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={accEsTesoreria}
                    onChange={e => setAccEsTesoreria(e.target.checked)}
                    className="w-4 h-4 accent-sky-500"
                  />
                </label>

                {accEsTesoreria && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Tipo de Tesorería
                      </label>
                      <select
                        value={accTipoTesoreria}
                        onChange={e => setAccTipoTesoreria(e.target.value as AccountingTreasuryKind)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold"
                      >
                        <option value="BANCO">Banco (Transferencias)</option>
                        <option value="CAJA">Caja (Efectivo)</option>
                        <option value="VALORES">Valores a Depositar (Cheques / E-Cheq)</option>
                        <option value="BILLETERA">Billetera Virtual / Tarjetas</option>
                        <option value="OTRO">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        CBU / Alias (opcional)
                      </label>
                      <input
                        type="text"
                        value={accCbuAlias}
                        onChange={e => setAccCbuAlias(e.target.value)}
                        placeholder="Ej: LA.HORMIGA.MACRO"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-sky-300"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-black bg-[#F0C800] hover:bg-amber-400 text-slate-950 cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Guardar Cuenta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PASE / MOVIMIENTO ENTRE CUENTAS */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-5 py-4 bg-black/70 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ArrowLeftRight className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-black text-white">
                  Registrar Pase o Movimiento Contable
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMovementModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMovementForm} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setMovMode('TRANSFERENCIA')}
                  className={`py-2 rounded-lg text-xs font-bold cursor-pointer transition ${
                    movMode === 'TRANSFERENCIA'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pase entre Cuentas
                </button>
                <button
                  type="button"
                  onClick={() => setMovMode('MANUAL')}
                  className={`py-2 rounded-lg text-xs font-bold cursor-pointer transition ${
                    movMode === 'MANUAL'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Asiento Manual
                </button>
              </div>

              <p className="text-[11px] text-slate-400 bg-slate-900/70 p-2.5 rounded-lg border border-slate-800">
                {movMode === 'TRANSFERENCIA'
                  ? 'Ejemplos: depositar un cheque de Valores a Depositar → Banco Macro, o retirar efectivo de Banco → Caja General.'
                  : 'Registrá un débito (entra/gasto) y su contrapartida de crédito (sale/banco/caja) entre cualquier par de cuentas.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    required
                    value={movFecha}
                    onChange={e => setMovFecha(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-emerald-400 uppercase mb-1">
                    Importe ($) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={movMonto || ''}
                    onChange={e => setMovMonto(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-sm font-mono font-black text-emerald-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-rose-300 uppercase mb-1">
                  {movMode === 'TRANSFERENCIA' ? 'Sale de (Cuenta Origen / Haber) *' : 'Cuenta que Acredita (Haber) *'}
                </label>
                <select
                  value={movOrigenId}
                  onChange={e => setMovOrigenId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
                >
                  {effectiveAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.codigo} — {acc.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-emerald-300 uppercase mb-1">
                  {movMode === 'TRANSFERENCIA' ? 'Entra a (Cuenta Destino / Debe) *' : 'Cuenta que Debita (Debe) *'}
                </label>
                <select
                  value={movDestinoId}
                  onChange={e => setMovDestinoId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
                >
                  {effectiveAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.codigo} — {acc.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {movOrigenId === movDestinoId && (
                <div className="text-[11px] text-rose-400 font-bold">
                  Elegí dos cuentas distintas para registrar el movimiento.
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Concepto / Detalle
                </label>
                <input
                  type="text"
                  value={movConcepto}
                  onChange={e => setMovConcepto(e.target.value)}
                  placeholder="Ej: Depósito E-Cheq #88122 en Banco Macro"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMovementModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={movOrigenId === movDestinoId || movMonto <= 0}
                  className="px-5 py-2 rounded-xl text-xs font-black bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer disabled:opacity-40"
                >
                  Guardar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: MAYOR DE LA CUENTA (HISTORIAL DETALLADO) */}
      {inspectedSummary && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-4 bg-black/80 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35">
                    {inspectedSummary.account.codigo}
                  </span>
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    {RUBRO_META[inspectedSummary.account.rubro].label}
                  </span>
                </div>
                <h3 className="text-lg font-black text-white mt-0.5">
                  Mayor de Cuenta: {inspectedSummary.account.nombre}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectAccountId(null)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-950/60 border-b border-slate-800 shrink-0 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] uppercase text-slate-400 block">Saldo Inicial</span>
                <strong className="text-sm font-mono text-white">
                  {formatMoney(inspectedSummary.saldoInicial)}
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] uppercase text-emerald-400 block">Total Debe (Entradas)</span>
                <strong className="text-sm font-mono text-emerald-300">
                  {formatMoney(inspectedSummary.totalDebe)}
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] uppercase text-sky-400 block">Total Haber (Salidas)</span>
                <strong className="text-sm font-mono text-sky-300">
                  {formatMoney(inspectedSummary.totalHaber)}
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/40">
                <span className="text-[10px] uppercase text-amber-300 block">Saldo Actual</span>
                <strong className="text-base font-mono font-black text-white">
                  {formatMoney(inspectedSummary.saldoActual)}
                </strong>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {inspectedSummary.movimientos.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Esta cuenta todavía no tiene movimientos registrados.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-[10px] uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Fecha</th>
                        <th className="py-2.5 px-3">Concepto / Comprobante</th>
                        <th className="py-2.5 px-3 text-right">Debe</th>
                        <th className="py-2.5 px-3 text-right">Haber</th>
                        <th className="py-2.5 px-3 text-right">Saldo Acum.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {inspectedSummary.movimientos.map((m, i) => (
                        <tr key={`${m.entryId}-${i}`} className="hover:bg-slate-900/60">
                          <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                            {m.fecha}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-white">{m.concepto}</div>
                            <div className="text-[11px] text-slate-400">
                              {m.referenciaNumero ? `${m.referenciaNumero} • ` : ''}
                              {m.detalle || ''}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-bold">
                            {m.debe > 0 ? formatMoney(m.debe) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-sky-300 font-bold">
                            {m.haber > 0 ? formatMoney(m.haber) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-white">
                            {formatMoney(m.saldoAcumulado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
