import React, { useMemo, useState } from 'react';
import {
  AccountingAccount,
  AccountingEntry,
  ChequeCarteraItem,
  ChequeEstado,
  ChequeTipo,
  Proveedor,
  PurchaseInvoice,
} from '../types';
import {
  Banknote,
  CheckCircle2,
  Eye,
  Landmark,
  Plus,
  Search,
  Send,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  buildChequeAcreditacionEntry,
  buildChequeEndosoEntry,
  getEffectiveAccounts,
} from '../utils/planDeCuentas';

export interface CarteraChequesSectionProps {
  cheques: ChequeCarteraItem[];
  accountingAccounts: AccountingAccount[];
  proveedores: Proveedor[];
  purchaseInvoices: PurchaseInvoice[];
  onSaveCheques: (items: ChequeCarteraItem[]) => Promise<boolean | void> | void;
  onDeleteCheque?: (id: string) => Promise<boolean | void> | void;
  onSaveAccountingEntry?: (entry: AccountingEntry) => Promise<void> | void;
  onEndorseChequeToSupplier?: (params: {
    cheques: ChequeCarteraItem[];
    proveedor: Proveedor;
    fechaEndoso: string;
    facturasCompraIds: string[];
    observaciones?: string;
  }) => Promise<boolean | void> | void;
  onRejectCheque?: (params: {
    cheque: ChequeCarteraItem;
    fechaRechazo: string;
    motivoRechazo: string;
    gastosRechazo: number;
  }) => Promise<boolean | void> | void;
  onNavigateToCobranzas?: () => void;
  onNavigateToPlanCuentas?: () => void;
  onNavigateToCompras?: () => void;
}

type ChequeFilterTab =
  | 'EN_CARTERA'
  | 'PARA_DEPOSITAR'
  | 'DEPOSITADO'
  | 'ACREDITADO'
  | 'ENDOSADO'
  | 'RECHAZADO'
  | 'TODOS';

const MOTIVOS_RECHAZO = [
  'Sin fondos suficientes',
  'Defecto formal / Error de firma',
  'Cuenta cerrada o embargada',
  'Orden de no pagar / Denuncia',
  'Fecha vencida / Fuera de término',
  'Otro motivo bancario',
];

const formatMoney = (val: number, currency: 'ARS' | 'USD' = 'ARS') => {
  const num = Number(val || 0);
  const formatted = num.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `US$ ${formatted}` : `$${formatted}`;
};

const getDaysDiffFromToday = (dateStr?: string): number | null => {
  if (!dateStr) return null;
  const clean = dateStr.slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);
  const d1 = new Date(`${clean}T00:00:00`);
  const d2 = new Date(`${todayStr}T00:00:00`);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
};

const ESTADO_META: Record<
  ChequeEstado,
  { label: string; className: string }
> = {
  EN_CARTERA: {
    label: 'En Cartera',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
  },
  DEPOSITADO: {
    label: 'Depositado (Clearing)',
    className: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
  },
  ACREDITADO: {
    label: 'Acreditado en Banco',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  },
  ENDOSADO: {
    label: 'Endosado a Proveedor',
    className: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35',
  },
  RECHAZADO: {
    label: 'Rechazado',
    className: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
  },
};

export const CarteraChequesSection: React.FC<CarteraChequesSectionProps> = ({
  cheques = [],
  accountingAccounts = [],
  proveedores = [],
  purchaseInvoices = [],
  onSaveCheques,
  onDeleteCheque,
  onSaveAccountingEntry,
  onEndorseChequeToSupplier,
  onRejectCheque,
  onNavigateToCobranzas,
  onNavigateToPlanCuentas,
  onNavigateToCompras,
}) => {
  const effectiveAccounts = useMemo(
    () => getEffectiveAccounts(accountingAccounts),
    [accountingAccounts]
  );

  const bankAccounts = useMemo(
    () => effectiveAccounts.filter((a) => a.activa && a.tipoTesoreria === 'BANCO'),
    [effectiveAccounts]
  );

  const [activeTab, setActiveTab] = useState<ChequeFilterTab>('EN_CARTERA');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modal: Depositar / Acreditar (individual o lote)
  const [depositModalCheques, setDepositModalCheques] = useState<ChequeCarteraItem[]>([]);
  const [depositBankId, setDepositBankId] = useState<string>(bankAccounts[0]?.id || 'CTA-1102');
  const [depositDate, setDepositDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [depositBoleta, setDepositBoleta] = useState<string>('');
  const [depositAutoAcreditar, setDepositAutoAcreditar] = useState<boolean>(false);

  // Modal: Confirmar Acreditación
  const [accreditModalCheques, setAccreditModalCheques] = useState<ChequeCarteraItem[]>([]);
  const [accreditDate, setAccreditDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [accreditBankId, setAccreditBankId] = useState<string>(bankAccounts[0]?.id || 'CTA-1102');

  // Modal: Endosar a Proveedor
  const [endorseModalCheques, setEndorseModalCheques] = useState<ChequeCarteraItem[]>([]);
  const [endorseProveedorId, setEndorseProveedorId] = useState<string>(proveedores[0]?.id || '');
  const [endorseDate, setEndorseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endorseInvoiceIds, setEndorseInvoiceIds] = useState<string[]>([]);
  const [endorseObs, setEndorseObs] = useState<string>('');

  // Modal: Marcar Rechazado
  const [rejectModalCheque, setRejectModalCheque] = useState<ChequeCarteraItem | null>(null);
  const [rejectDate, setRejectDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [rejectMotivo, setRejectMotivo] = useState<string>(MOTIVOS_RECHAZO[0]);
  const [rejectMotivoCustom, setRejectMotivoCustom] = useState<string>('');
  const [rejectGastos, setRejectGastos] = useState<number>(0);

  // Modal: Detalle Cheque
  const [detailCheque, setDetailCheque] = useState<ChequeCarteraItem | null>(null);

  // Modal: Cargar Cheque Manual
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manNumero, setManNumero] = useState('');
  const [manTipo, setManTipo] = useState<ChequeTipo>('FISICO');
  const [manBanco, setManBanco] = useState('');
  const [manFechaEmision, setManFechaEmision] = useState(new Date().toISOString().split('T')[0]);
  const [manFechaCobro, setManFechaCobro] = useState(new Date().toISOString().split('T')[0]);
  const [manImporte, setManImporte] = useState<number>(0);
  const [manLibrador, setManLibrador] = useState('');
  const [manCuit, setManCuit] = useState('');
  const [manObs, setManObs] = useState('');

  const [isBusy, setIsBusy] = useState(false);

  // KPIs calculados sobre la cartera real
  const kpis = useMemo(() => {
    let enCarteraCount = 0;
    let enCarteraMonto = 0;
    let listosCount = 0;
    let listosMonto = 0;
    let depositadosCount = 0;
    let depositadosMonto = 0;
    let acreditadosMonto = 0;
    let endosadosMonto = 0;
    let rechazadosCount = 0;
    let rechazadosMonto = 0;

    cheques.forEach((c) => {
      const imp = Number(c.importe || 0);
      const diff = getDaysDiffFromToday(c.fechaCobro);
      if (c.estado === 'EN_CARTERA') {
        enCarteraCount += 1;
        enCarteraMonto += imp;
        if (diff !== null && diff <= 0) {
          listosCount += 1;
          listosMonto += imp;
        }
      } else if (c.estado === 'DEPOSITADO') {
        depositadosCount += 1;
        depositadosMonto += imp;
      } else if (c.estado === 'ACREDITADO') {
        acreditadosMonto += imp;
      } else if (c.estado === 'ENDOSADO') {
        endosadosMonto += imp;
      } else if (c.estado === 'RECHAZADO') {
        rechazadosCount += 1;
        rechazadosMonto += imp;
      }
    });

    return {
      enCarteraCount,
      enCarteraMonto,
      listosCount,
      listosMonto,
      depositadosCount,
      depositadosMonto,
      acreditadosMonto,
      endosadosMonto,
      rechazadosCount,
      rechazadosMonto,
    };
  }, [cheques]);

  const filteredCheques = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cheques
      .filter((c) => {
        if (activeTab === 'PARA_DEPOSITAR') {
          const diff = getDaysDiffFromToday(c.fechaCobro);
          if (c.estado !== 'EN_CARTERA' || diff === null || diff > 3) return false;
        } else if (activeTab !== 'TODOS') {
          if (c.estado !== activeTab) return false;
        }

        if (dateFrom && (c.fechaCobro || '') < dateFrom) return false;
        if (dateTo && (c.fechaCobro || '') > dateTo) return false;

        if (!q) return true;
        return (
          (c.numeroCheque || '').toLowerCase().includes(q) ||
          (c.bancoEmisor || '').toLowerCase().includes(q) ||
          (c.libradorNombre || '').toLowerCase().includes(q) ||
          (c.clienteNombre || '').toLowerCase().includes(q) ||
          (c.proveedorNombre || '').toLowerCase().includes(q) ||
          (c.reciboNumero || '').toLowerCase().includes(q) ||
          (c.facturasNumeros || []).some((fn) => fn.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => (a.fechaCobro || '').localeCompare(b.fechaCobro || ''));
  }, [cheques, activeTab, searchQuery, dateFrom, dateTo]);

  const selectedCheques = useMemo(
    () => cheques.filter((c) => selectedIds.includes(c.id)),
    [cheques, selectedIds]
  );

  const openDepositModal = (items: ChequeCarteraItem[], autoAccredit = false) => {
    if (items.length === 0) return;
    setDepositModalCheques(items);
    setDepositBankId(bankAccounts[0]?.id || effectiveAccounts.find((a) => a.tipoTesoreria === 'BANCO')?.id || 'CTA-1102');
    setDepositDate(new Date().toISOString().split('T')[0]);
    setDepositBoleta('');
    setDepositAutoAcreditar(autoAccredit);
  };

  const handleConfirmDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (depositModalCheques.length === 0) return;
    const banco = effectiveAccounts.find((a) => a.id === depositBankId) || bankAccounts[0];
    if (!banco) return;

    setIsBusy(true);
    try {
      const targetState: ChequeEstado = depositAutoAcreditar ? 'ACREDITADO' : 'DEPOSITADO';
      const nowIso = new Date().toISOString();
      const updatedItems: ChequeCarteraItem[] = [];

      for (const ch of depositModalCheques) {
        const entryId = depositAutoAcreditar ? `AS-ACRED-${ch.id}-${Date.now().toString().slice(-4)}` : undefined;
        const nextItem: ChequeCarteraItem = {
          ...ch,
          estado: targetState,
          bancoDestinoId: banco.id,
          bancoDestinoCodigo: banco.codigo,
          bancoDestinoNombre: banco.nombre,
          fechaDeposito: depositDate,
          boletaDeposito: depositBoleta.trim() || undefined,
          fechaAcreditacion: depositAutoAcreditar ? depositDate : undefined,
          asientoAcreditacionId: entryId || ch.asientoAcreditacionId,
          updatedAt: nowIso,
          historial: [
            ...(ch.historial || []),
            {
              id: `hist-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
              fecha: depositDate,
              estado: targetState,
              detalle: depositAutoAcreditar
                ? `Depositado y acreditado directamente en ${banco.nombre}${depositBoleta ? ` (Boleta ${depositBoleta.trim()})` : ''}`
                : `Depositado en ${banco.nombre} esperando clearing${depositBoleta ? ` (Boleta ${depositBoleta.trim()})` : ''}`,
            },
          ],
        };
        updatedItems.push(nextItem);

        if (depositAutoAcreditar && onSaveAccountingEntry) {
          const entry = buildChequeAcreditacionEntry(
            nextItem,
            banco,
            depositDate,
            effectiveAccounts,
            entryId
          );
          await Promise.resolve(onSaveAccountingEntry(entry));
        }
      }

      await Promise.resolve(onSaveCheques(updatedItems));
      setSelectedIds([]);
      setDepositModalCheques([]);
    } finally {
      setIsBusy(false);
    }
  };

  const openAccreditModal = (items: ChequeCarteraItem[]) => {
    if (items.length === 0) return;
    setAccreditModalCheques(items);
    setAccreditDate(new Date().toISOString().split('T')[0]);
    setAccreditBankId(items[0]?.bancoDestinoId || bankAccounts[0]?.id || 'CTA-1102');
  };

  const handleConfirmAccreditation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accreditModalCheques.length === 0) return;
    const defaultBanco = effectiveAccounts.find((a) => a.id === accreditBankId) || bankAccounts[0];
    if (!defaultBanco) return;

    setIsBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const updatedItems: ChequeCarteraItem[] = [];

      for (const ch of accreditModalCheques) {
        const banco =
          effectiveAccounts.find((a) => a.id === (ch.bancoDestinoId || accreditBankId)) || defaultBanco;
        const entryId = ch.asientoAcreditacionId || `AS-ACRED-${ch.id}-${Date.now().toString().slice(-4)}`;
        const nextItem: ChequeCarteraItem = {
          ...ch,
          estado: 'ACREDITADO',
          bancoDestinoId: banco.id,
          bancoDestinoCodigo: banco.codigo,
          bancoDestinoNombre: banco.nombre,
          fechaAcreditacion: accreditDate,
          asientoAcreditacionId: entryId,
          updatedAt: nowIso,
          historial: [
            ...(ch.historial || []),
            {
              id: `hist-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
              fecha: accreditDate,
              estado: 'ACREDITADO',
              detalle: `Acreditación bancaria confirmada en ${banco.nombre}`,
            },
          ],
        };
        updatedItems.push(nextItem);

        if (onSaveAccountingEntry) {
          const entry = buildChequeAcreditacionEntry(
            nextItem,
            banco,
            accreditDate,
            effectiveAccounts,
            entryId
          );
          await Promise.resolve(onSaveAccountingEntry(entry));
        }
      }

      await Promise.resolve(onSaveCheques(updatedItems));
      setSelectedIds([]);
      setAccreditModalCheques([]);
    } finally {
      setIsBusy(false);
    }
  };

  const openEndorseModal = (items: ChequeCarteraItem[]) => {
    if (items.length === 0) return;
    setEndorseModalCheques(items);
    setEndorseProveedorId(proveedores[0]?.id || '');
    setEndorseDate(new Date().toISOString().split('T')[0]);
    setEndorseInvoiceIds([]);
    setEndorseObs('');
  };

  const pendingSupplierInvoices = useMemo(() => {
    if (!endorseProveedorId) return [];
    return purchaseInvoices.filter(
      (inv) => inv.proveedorId === endorseProveedorId && inv.estado !== 'PAGADO' && inv.saldoPendiente > 0
    );
  }, [purchaseInvoices, endorseProveedorId]);

  const handleConfirmEndorse = async (e: React.FormEvent) => {
    e.preventDefault();
    const prov = proveedores.find((p) => p.id === endorseProveedorId);
    if (!prov || endorseModalCheques.length === 0) return;

    setIsBusy(true);
    try {
      if (onEndorseChequeToSupplier) {
        await Promise.resolve(
          onEndorseChequeToSupplier({
            cheques: endorseModalCheques,
            proveedor: prov,
            fechaEndoso: endorseDate,
            facturasCompraIds: endorseInvoiceIds,
            observaciones: endorseObs.trim() || undefined,
          })
        );
      } else {
        const nowIso = new Date().toISOString();
        const updatedItems: ChequeCarteraItem[] = endorseModalCheques.map((ch) => ({
          ...ch,
          estado: 'ENDOSADO',
          proveedorId: prov.id,
          proveedorNombre: prov.razonSocial,
          facturasCompraIds: endorseInvoiceIds,
          fechaEndoso: endorseDate,
          updatedAt: nowIso,
          historial: [
            ...(ch.historial || []),
            {
              id: `hist-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
              fecha: endorseDate,
              estado: 'ENDOSADO',
              detalle: `Endosado a proveedor ${prov.razonSocial}`,
            },
          ],
        }));
        await Promise.resolve(onSaveCheques(updatedItems));
        if (onSaveAccountingEntry) {
          for (const ch of endorseModalCheques) {
            await Promise.resolve(
              onSaveAccountingEntry(
                buildChequeEndosoEntry(ch, prov.razonSocial, endorseDate, undefined, effectiveAccounts)
              )
            );
          }
        }
      }
      setSelectedIds([]);
      setEndorseModalCheques([]);
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalCheque) return;
    const motivoFinal =
      rejectMotivo === 'Otro motivo bancario' && rejectMotivoCustom.trim()
        ? rejectMotivoCustom.trim()
        : rejectMotivo;

    setIsBusy(true);
    try {
      if (onRejectCheque) {
        await Promise.resolve(
          onRejectCheque({
            cheque: rejectModalCheque,
            fechaRechazo: rejectDate,
            motivoRechazo: motivoFinal,
            gastosRechazo: Number(rejectGastos || 0),
          })
        );
      }
      setRejectModalCheque(null);
      setRejectGastos(0);
      setRejectMotivoCustom('');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveManualCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manNumero.trim() || !manBanco.trim() || Number(manImporte) <= 0) return;

    setIsBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      const item: ChequeCarteraItem = {
        id: `CHQ-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        numeroCheque: manNumero.trim(),
        tipo: manTipo,
        bancoEmisor: manBanco.trim(),
        fechaRecepcion: todayStr,
        fechaEmision: manFechaEmision || todayStr,
        fechaCobro: manFechaCobro || todayStr,
        importe: Number(manImporte),
        moneda: 'ARS',
        libradorNombre: manLibrador.trim() || 'Tercero / Manual',
        cuitLibrador: manCuit.trim() || undefined,
        clienteNombre: manLibrador.trim() || 'Carga Manual',
        estado: 'EN_CARTERA',
        cuentaValoresId: 'CTA-1105',
        observaciones: manObs.trim() || undefined,
        historial: [
          {
            id: `hist-${Date.now()}`,
            fecha: todayStr,
            estado: 'EN_CARTERA',
            detalle: `Ingresado manualmente en Cartera de Cheques`,
          },
        ],
        createdAt: nowIso,
      };
      await Promise.resolve(onSaveCheques([item]));
      setIsManualModalOpen(false);
      setManNumero('');
      setManBanco('');
      setManImporte(0);
      setManLibrador('');
      setManCuit('');
      setManObs('');
    } finally {
      setIsBusy(false);
    }
  };

  const tabs: Array<{ key: ChequeFilterTab; label: string; count: number }> = [
    { key: 'EN_CARTERA', label: 'En Cartera', count: kpis.enCarteraCount },
    { key: 'PARA_DEPOSITAR', label: 'Vencen Hoy / Próx. 3d', count: cheques.filter((c) => { const d = getDaysDiffFromToday(c.fechaCobro); return c.estado === 'EN_CARTERA' && d !== null && d <= 3; }).length },
    { key: 'DEPOSITADO', label: 'En Clearing', count: kpis.depositadosCount },
    { key: 'ACREDITADO', label: 'Acreditados', count: cheques.filter((c) => c.estado === 'ACREDITADO').length },
    { key: 'ENDOSADO', label: 'Endosados', count: cheques.filter((c) => c.estado === 'ENDOSADO').length },
    { key: 'RECHAZADO', label: 'Rechazados', count: kpis.rechazadosCount },
    { key: 'TODOS', label: 'Todos', count: cheques.length },
  ];

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Encabezado */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Banknote className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-black text-white tracking-tight">
              Cartera de Cheques & E-Cheq
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Control individual de cheques recibidos en cobranzas, agenda de vencimientos, clearing bancario, endosos a proveedores y rechazos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onNavigateToCobranzas && (
            <button
              type="button"
              onClick={onNavigateToCobranzas}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 transition cursor-pointer whitespace-nowrap"
            >
              Ir a Cobranzas
            </button>
          )}
          {onNavigateToPlanCuentas && (
            <button
              type="button"
              onClick={onNavigateToPlanCuentas}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-sky-300 transition cursor-pointer whitespace-nowrap"
            >
              Plan de Cuentas
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#F5D63D] text-black text-xs font-black flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Cargar Cheque Manual</span>
          </button>
        </div>
      </div>

      {/* KPIs de Tesorería de Cheques */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400">En Cartera (Valores a Depositar)</div>
          <div className="text-xl font-black font-mono tabular-nums text-amber-300">
            {formatMoney(kpis.enCarteraMonto)}
          </div>
          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
            {kpis.enCarteraCount} {kpis.enCarteraCount === 1 ? 'cheque pendiente' : 'cheques pendientes'}
          </div>
        </div>

        <div className={`bg-[#16191F] border rounded-xl p-4 space-y-1 ${kpis.listosCount > 0 ? 'border-amber-500/45' : 'border-slate-800'}`}>
          <div className="text-[11px] font-semibold text-slate-400">Listos / Vencidos para Depositar</div>
          <div className={`text-xl font-black font-mono tabular-nums ${kpis.listosCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
            {formatMoney(kpis.listosMonto)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
            {kpis.listosCount} con fecha de cobro ≤ hoy
          </div>
        </div>

        <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400">Depositados (En Clearing)</div>
          <div className="text-xl font-black font-mono tabular-nums text-sky-300">
            {formatMoney(kpis.depositadosMonto)}
          </div>
          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
            {kpis.depositadosCount} esperando acreditación bancaria
          </div>
        </div>

        <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400">Acreditados · Endosados · Rechazados</div>
          <div className="text-base font-black font-mono tabular-nums text-emerald-400">
            {formatMoney(kpis.acreditadosMonto)} <span className="text-[11px] font-normal text-slate-400">acred.</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums flex items-center gap-2">
            <span className="text-indigo-300">Endos: {formatMoney(kpis.endosadosMonto)}</span>
            {kpis.rechazadosCount > 0 && (
              <span className="text-rose-400 font-bold">· {kpis.rechazadosCount} rech.</span>
            )}
          </div>
        </div>
      </div>

      {/* Filtros y Búsqueda */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setActiveTab(t.key);
                setSelectedIds([]);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === t.key
                  ? 'bg-[#F0C800] text-black'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <span>{t.label}</span>
              <span className={`font-mono text-[10px] ${activeTab === t.key ? 'text-black/75' : 'text-slate-500'}`}>
                ({t.count})
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por N° cheque, banco, cliente, librador, proveedor o factura..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="Vencimiento desde"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="Vencimiento hasta"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
            />
            {(searchQuery || dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer shrink-0"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Barra de acciones masivas cuando hay seleccionados */}
        {selectedCheques.length > 0 && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/35 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-bold text-amber-200 font-mono tabular-nums">
              {selectedCheques.length} cheques seleccionados · Total:{' '}
              {formatMoney(selectedCheques.reduce((s, c) => s + Number(c.importe || 0), 0))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedCheques.every((c) => c.estado === 'EN_CARTERA') && (
                <>
                  <button
                    type="button"
                    onClick={() => openDepositModal(selectedCheques, false)}
                    className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black text-xs font-black cursor-pointer"
                  >
                    Depositar en Banco (Lote)
                  </button>
                  <button
                    type="button"
                    onClick={() => openDepositModal(selectedCheques, true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black cursor-pointer"
                  >
                    Depositar y Acreditar Hoy
                  </button>
                  {proveedores.length > 0 && (
                    <button
                      type="button"
                      onClick={() => openEndorseModal(selectedCheques)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-black cursor-pointer"
                    >
                      Endosar a Proveedor
                    </button>
                  )}
                </>
              )}
              {selectedCheques.every((c) => c.estado === 'DEPOSITADO') && (
                <button
                  type="button"
                  onClick={() => openAccreditModal(selectedCheques)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black cursor-pointer"
                >
                  Confirmar Acreditación (Lote)
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                Deseleccionar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabla principal */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl overflow-hidden">
        {filteredCheques.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Banknote className="w-10 h-10 text-slate-600 mx-auto" />
            <div className="text-sm font-bold text-slate-200">
              {cheques.length === 0
                ? 'Todavía no hay cheques cargados en la Cartera'
                : 'No hay cheques que coincidan con el filtro seleccionado'}
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Cuando registres una cobranza con medio Cheque / E-Cheq, cada cheque ingresará automáticamente aquí con su fecha de vencimiento.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              {onNavigateToCobranzas && (
                <button
                  type="button"
                  onClick={onNavigateToCobranzas}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white cursor-pointer"
                >
                  Registrar Cobranza
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsManualModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[#F0C800] hover:bg-[#F5D63D] text-black text-xs font-black cursor-pointer"
              >
                Cargar Cheque Manual
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900/90 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                <tr>
                  <th className="py-3 px-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredCheques.length > 0 &&
                        filteredCheques.every((c) => selectedIds.includes(c.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(filteredCheques.map((c) => c.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                      className="accent-amber-400 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3">Vencimiento</th>
                  <th className="py-3 px-3">Cheque / Tipo</th>
                  <th className="py-3 px-3">Banco Emisor & Librador</th>
                  <th className="py-3 px-3">Cliente / Recibo</th>
                  <th className="py-3 px-3">Estado</th>
                  <th className="py-3 px-3 text-right">Importe</th>
                  <th className="py-3 px-3">Destino / Trazabilidad</th>
                  <th className="py-3 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredCheques.map((ch) => {
                  const daysDiff = getDaysDiffFromToday(ch.fechaCobro);
                  const meta = ESTADO_META[ch.estado];
                  const isChecked = selectedIds.includes(ch.id);

                  let dueHint = '';
                  let dueCls = 'text-slate-400';
                  if (ch.estado === 'EN_CARTERA' && daysDiff !== null) {
                    if (daysDiff < 0) {
                      dueHint = `Vencido hace ${Math.abs(daysDiff)}d`;
                      dueCls = 'text-amber-400 font-bold';
                    } else if (daysDiff === 0) {
                      dueHint = 'Vence HOY';
                      dueCls = 'text-amber-300 font-black';
                    } else if (daysDiff <= 7) {
                      dueHint = `En ${daysDiff}d`;
                      dueCls = 'text-sky-300';
                    } else {
                      dueHint = `En ${daysDiff}d`;
                    }
                  }

                  return (
                    <tr
                      key={ch.id}
                      className={`hover:bg-slate-900/50 transition ${isChecked ? 'bg-amber-500/5' : ''}`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds((prev) => [...prev, ch.id]);
                            } else {
                              setSelectedIds((prev) => prev.filter((id) => id !== ch.id));
                            }
                          }}
                          className="accent-amber-400 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        <div className="font-bold text-white">{ch.fechaCobro}</div>
                        {dueHint && <div className={`text-[10px] ${dueCls}`}>{dueHint}</div>}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-amber-300">#{ch.numeroCheque}</div>
                        <div className="text-[10px] text-slate-400">
                          {ch.tipo === 'ECHEQ' ? 'E-Cheq Electrónico' : 'Cheque Físico'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-white">{ch.bancoEmisor}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                          {ch.libradorNombre}
                          {ch.cuitLibrador ? ` · ${ch.cuitLibrador}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-200 truncate max-w-[190px]">
                          {ch.clienteNombre || '-'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {ch.reciboNumero ? `REC ${ch.reciboNumero}` : 'Carga manual'}
                          {ch.facturasNumeros && ch.facturasNumeros.length > 0
                            ? ` · Fact. ${ch.facturasNumeros.join(', ')}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black tabular-nums text-white whitespace-nowrap">
                        {formatMoney(ch.importe, ch.moneda)}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-300">
                        {ch.estado === 'EN_CARTERA' && (
                          <span className="text-slate-500">1.1.05 Valores a Depositar</span>
                        )}
                        {(ch.estado === 'DEPOSITADO' || ch.estado === 'ACREDITADO') && (
                          <div>
                            <div className="font-semibold text-sky-300">{ch.bancoDestinoNombre || '-'}</div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {ch.fechaAcreditacion
                                ? `Acred. ${ch.fechaAcreditacion}`
                                : `Dep. ${ch.fechaDeposito || '-'}`}
                              {ch.boletaDeposito ? ` · Bol. ${ch.boletaDeposito}` : ''}
                            </div>
                          </div>
                        )}
                        {ch.estado === 'ENDOSADO' && (
                          <div>
                            <div className="font-semibold text-indigo-300">{ch.proveedorNombre || '-'}</div>
                            <div className="text-[10px] font-mono text-slate-400">
                              Endosado {ch.fechaEndoso || '-'}
                            </div>
                          </div>
                        )}
                        {ch.estado === 'RECHAZADO' && (
                          <div>
                            <div className="font-semibold text-rose-300 truncate max-w-[180px]">
                              {ch.motivoRechazo || 'Rechazado'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {ch.facturaReabierta ? 'Saldo factura reabierto' : `Rechazo ${ch.fechaRechazo || ''}`}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          {ch.estado === 'EN_CARTERA' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openDepositModal([ch], false)}
                                title="Depositar en Banco"
                                className="px-2 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 text-[10px] font-bold cursor-pointer"
                              >
                                Depositar
                              </button>
                              <button
                                type="button"
                                onClick={() => openDepositModal([ch], true)}
                                title="Depositar y Acreditar hoy en Banco"
                                className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[10px] font-bold cursor-pointer"
                              >
                                Acreditar
                              </button>
                              <button
                                type="button"
                                onClick={() => openEndorseModal([ch])}
                                title="Endosar a Proveedor"
                                className="px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/35 text-indigo-300 text-[10px] font-bold cursor-pointer"
                              >
                                Endosar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectModalCheque(ch);
                                  setRejectDate(new Date().toISOString().split('T')[0]);
                                }}
                                title="Marcar Rechazado"
                                className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-[10px] font-bold cursor-pointer"
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                          {ch.estado === 'DEPOSITADO' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openAccreditModal([ch])}
                                className="px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black cursor-pointer"
                              >
                                Confirmar Acreditación
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectModalCheque(ch);
                                  setRejectDate(new Date().toISOString().split('T')[0]);
                                }}
                                className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-[10px] font-bold cursor-pointer"
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                          {(ch.estado === 'ACREDITADO' || ch.estado === 'ENDOSADO') && (
                            <button
                              type="button"
                              onClick={() => {
                                setRejectModalCheque(ch);
                                setRejectDate(new Date().toISOString().split('T')[0]);
                              }}
                              title="Registrar rechazo posterior"
                              className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-bold cursor-pointer"
                            >
                              Rechazar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDetailCheque(ch)}
                            title="Ver detalle e historial"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {onDeleteCheque && !ch.reciboId && (
                            <button
                              type="button"
                              onClick={() => onDeleteCheque(ch.id)}
                              title="Eliminar cheque manual"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
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

      {/* MODAL: DEPOSITAR / ACREDITAR EN BANCO */}
      {depositModalCheques.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-black text-white">
                  {depositAutoAcreditar ? 'Depositar y Acreditar en Banco' : 'Depositar Cheques en Banco'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDepositModalCheques([])}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmDeposit} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>Cheques incluidos:</span>
                  <strong className="font-mono">{depositModalCheques.length}</strong>
                </div>
                <div className="flex justify-between text-white">
                  <span>Total a depositar:</span>
                  <strong className="font-mono text-emerald-400">
                    {formatMoney(depositModalCheques.reduce((s, c) => s + Number(c.importe || 0), 0))}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Cuenta Bancaria Destino *
                </label>
                <select
                  value={depositBankId}
                  onChange={(e) => setDepositBankId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-semibold"
                >
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.codigo} — {b.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    required
                    value={depositDate}
                    onChange={(e) => setDepositDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    N° Boleta / Lote (Opcional)
                  </label>
                  <input
                    type="text"
                    value={depositBoleta}
                    onChange={(e) => setDepositBoleta(e.target.value)}
                    placeholder="Ej: BOL-00412"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={depositAutoAcreditar}
                  onChange={(e) => setDepositAutoAcreditar(e.target.checked)}
                  className="mt-0.5 accent-emerald-500"
                />
                <div>
                  <div className="font-bold text-emerald-300">Confirmar acreditación inmediata en banco</div>
                  <div className="text-[11px] text-slate-400">
                    Si ya entró en tu extracto bancario, pasa directo de Valores a Depositar (1.1.05) al Banco elegido. Si todavía está en clearing, dejalo destildado.
                  </div>
                </div>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDepositModalCheques([])}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#F5D63D] text-black text-xs font-black cursor-pointer disabled:opacity-50"
                >
                  {isBusy ? 'Guardando...' : depositAutoAcreditar ? 'Depositar y Acreditar' : 'Confirmar Depósito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ACREDITACIÓN (DESDE DEPOSITADO) */}
      {accreditModalCheques.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-black text-white">Confirmar Acreditación Bancaria</h3>
              </div>
              <button
                type="button"
                onClick={() => setAccreditModalCheques([])}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmAccreditation} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>Cheques a acreditar:</span>
                  <strong className="font-mono">{accreditModalCheques.length}</strong>
                </div>
                <div className="flex justify-between text-white">
                  <span>Importe acreditado:</span>
                  <strong className="font-mono text-emerald-400">
                    {formatMoney(accreditModalCheques.reduce((s, c) => s + Number(c.importe || 0), 0))}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Banco donde se acreditó *
                </label>
                <select
                  value={accreditBankId}
                  onChange={(e) => setAccreditBankId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-semibold"
                >
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.codigo} — {b.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Fecha de Acreditación *
                </label>
                <input
                  type="date"
                  required
                  value={accreditDate}
                  onChange={(e) => setAccreditDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAccreditModalCheques([])}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black cursor-pointer disabled:opacity-50"
                >
                  {isBusy ? 'Acreditando...' : 'Confirmar Acreditación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ENDOSAR CHEQUE A PROVEEDOR */}
      {endorseModalCheques.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black text-white">Endosar Cheques a Proveedor</h3>
              </div>
              <button
                type="button"
                onClick={() => setEndorseModalCheques([])}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmEndorse} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>Cheques a endosar:</span>
                  <strong className="font-mono">
                    {endorseModalCheques.map((c) => `#${c.numeroCheque}`).join(', ')}
                  </strong>
                </div>
                <div className="flex justify-between text-white">
                  <span>Monto total del endoso:</span>
                  <strong className="font-mono text-indigo-300">
                    {formatMoney(endorseModalCheques.reduce((s, c) => s + Number(c.importe || 0), 0))}
                  </strong>
                </div>
              </div>

              {proveedores.length === 0 ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-2">
                  <span>No tenés proveedores cargados todavía en Compras.</span>
                  {onNavigateToCompras && (
                    <button
                      type="button"
                      onClick={() => {
                        setEndorseModalCheques([]);
                        onNavigateToCompras();
                      }}
                      className="px-2.5 py-1 rounded bg-amber-500 text-black font-bold cursor-pointer"
                    >
                      Ir a Compras
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                        Proveedor Destino *
                      </label>
                      <select
                        value={endorseProveedorId}
                        onChange={(e) => {
                          setEndorseProveedorId(e.target.value);
                          setEndorseInvoiceIds([]);
                        }}
                        required
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-semibold"
                      >
                        {proveedores.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.razonSocial}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                        Fecha de Endoso *
                      </label>
                      <input
                        type="date"
                        required
                        value={endorseDate}
                        onChange={(e) => setEndorseDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white"
                      />
                    </div>
                  </div>

                  {pendingSupplierInvoices.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-300 uppercase">
                        Imputar a Facturas de Compra Pendientes (Opcional)
                      </label>
                      <div className="max-h-36 overflow-y-auto space-y-1.5 bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                        {pendingSupplierInvoices.map((inv) => {
                          const checked = endorseInvoiceIds.includes(inv.id);
                          return (
                            <label
                              key={inv.id}
                              className="flex items-center justify-between gap-2 text-xs p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setEndorseInvoiceIds((prev) => [...prev, inv.id]);
                                    } else {
                                      setEndorseInvoiceIds((prev) => prev.filter((id) => id !== inv.id));
                                    }
                                  }}
                                  className="accent-indigo-500"
                                />
                                <span className="font-mono text-white font-bold">
                                  {inv.nroComprobanteCompleto}
                                </span>
                                <span className="text-slate-400">{inv.fechaEmision}</span>
                              </div>
                              <span className="font-mono font-bold text-amber-300">
                                Saldo {formatMoney(inv.saldoPendiente)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                      Observaciones
                    </label>
                    <input
                      type="text"
                      value={endorseObs}
                      onChange={(e) => setEndorseObs(e.target.value)}
                      placeholder="Ej: Pago parcial factura repuestos..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEndorseModalCheques([])}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isBusy || proveedores.length === 0}
                  className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-black cursor-pointer disabled:opacity-50"
                >
                  {isBusy ? 'Endosando...' : 'Confirmar Endoso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECHAZO DE CHEQUE + REAPERTURA DE DEUDA */}
      {rejectModalCheque && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-rose-500/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-5 py-4 bg-rose-950/30 border-b border-rose-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-black text-white">Marcar Cheque Rechazado</h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalCheque(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmReject} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs space-y-1">
                <div className="font-bold text-rose-200">
                  Cheque #{rejectModalCheque.numeroCheque} · {rejectModalCheque.bancoEmisor}
                </div>
                <div className="text-slate-300">
                  Cliente: <strong>{rejectModalCheque.clienteNombre || rejectModalCheque.libradorNombre}</strong> · Importe:{' '}
                  <strong className="font-mono text-white">{formatMoney(rejectModalCheque.importe)}</strong>
                </div>
                {rejectModalCheque.facturasNumeros && rejectModalCheque.facturasNumeros.length > 0 && (
                  <div className="text-[11px] text-amber-300 pt-1">
                    Se reabrirá automáticamente el saldo pendiente de: {rejectModalCheque.facturasNumeros.join(', ')}.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Fecha de Rechazo *
                  </label>
                  <input
                    type="date"
                    required
                    value={rejectDate}
                    onChange={(e) => setRejectDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Gastos Bancarios ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rejectGastos || ''}
                    onChange={(e) => setRejectGastos(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Motivo del Rechazo *
                </label>
                <select
                  value={rejectMotivo}
                  onChange={(e) => setRejectMotivo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  {MOTIVOS_RECHAZO.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {rejectMotivo === 'Otro motivo bancario' && (
                  <input
                    type="text"
                    required
                    value={rejectMotivoCustom}
                    onChange={(e) => setRejectMotivoCustom(e.target.value)}
                    placeholder="Detalle el motivo..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white mt-2"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalCheque(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-black cursor-pointer disabled:opacity-50"
                >
                  {isBusy ? 'Procesando...' : 'Confirmar Rechazo y Reabrir Deuda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CARGAR CHEQUE MANUAL */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black text-white">Cargar Cheque Manual a Cartera</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveManualCheque} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Tipo *
                  </label>
                  <select
                    value={manTipo}
                    onChange={(e) => setManTipo(e.target.value as ChequeTipo)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                  >
                    <option value="FISICO">Cheque Físico</option>
                    <option value="ECHEQ">E-Cheq</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    N° Cheque *
                  </label>
                  <input
                    type="text"
                    required
                    value={manNumero}
                    onChange={(e) => setManNumero(e.target.value)}
                    placeholder="Ej: 48291033"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Banco Emisor *
                  </label>
                  <input
                    type="text"
                    required
                    value={manBanco}
                    onChange={(e) => setManBanco(e.target.value)}
                    placeholder="Ej: Banco Macro"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-300 uppercase mb-1">
                    Importe ($) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={manImporte || ''}
                    onChange={(e) => setManImporte(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-sm font-mono font-bold text-emerald-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Fecha de Emisión
                  </label>
                  <input
                    type="date"
                    value={manFechaEmision}
                    onChange={(e) => setManFechaEmision(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-300 uppercase mb-1">
                    Fecha de Cobro / Vto *
                  </label>
                  <input
                    type="date"
                    required
                    value={manFechaCobro}
                    onChange={(e) => setManFechaCobro(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-sm font-mono text-amber-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Librador / Cliente
                  </label>
                  <input
                    type="text"
                    value={manLibrador}
                    onChange={(e) => setManLibrador(e.target.value)}
                    placeholder="Razón social / titular"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    CUIT Librador
                  </label>
                  <input
                    type="text"
                    value={manCuit}
                    onChange={(e) => setManCuit(e.target.value)}
                    placeholder="Opcional"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Observaciones
                </label>
                <input
                  type="text"
                  value={manObs}
                  onChange={(e) => setManObs(e.target.value)}
                  placeholder="Nota opcional..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#F5D63D] text-black text-xs font-black cursor-pointer disabled:opacity-50"
                >
                  Guardar en Cartera
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DETALLE E HISTORIAL DEL CHEQUE */}
      {detailCheque && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">
                  {detailCheque.tipo === 'ECHEQ' ? 'E-Cheq Electrónico' : 'Cheque Físico'}
                </div>
                <h3 className="text-base font-black text-white font-mono">
                  #{detailCheque.numeroCheque} · {detailCheque.bancoEmisor}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailCheque(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <span className="text-slate-400 block">Importe</span>
                  <strong className="text-base font-mono text-emerald-400">
                    {formatMoney(detailCheque.importe, detailCheque.moneda)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Fecha de Cobro / Vto</span>
                  <strong className="text-base font-mono text-amber-300">{detailCheque.fechaCobro}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Librador</span>
                  <span className="text-white font-semibold">{detailCheque.libradorNombre}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Estado Actual</span>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold mt-0.5 ${
                      ESTADO_META[detailCheque.estado].className
                    }`}
                  >
                    {ESTADO_META[detailCheque.estado].label}
                  </span>
                </div>
              </div>

              {(detailCheque.reciboNumero || detailCheque.clienteNombre) && (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Origen en Cobranzas</div>
                  <div className="text-white">
                    Cliente: <strong>{detailCheque.clienteNombre}</strong>
                  </div>
                  {detailCheque.reciboNumero && (
                    <div className="font-mono text-slate-300">
                      Recibo: {detailCheque.reciboNumero}
                      {detailCheque.facturasNumeros && detailCheque.facturasNumeros.length > 0
                        ? ` · Facturas: ${detailCheque.facturasNumeros.join(', ')}`
                        : ''}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold text-slate-400">
                  Historial de Movimientos del Cheque
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {(detailCheque.historial || []).length === 0 ? (
                    <div className="text-slate-500 italic">Sin movimientos registrados.</div>
                  ) : (
                    detailCheque.historial!.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800/80"
                      >
                        <div>
                          <div className="font-bold text-white">{h.detalle}</div>
                          <div className="text-[10px] text-slate-400">{ESTADO_META[h.estado]?.label || h.estado}</div>
                        </div>
                        <span className="font-mono text-[11px] text-slate-400 shrink-0">{h.fecha}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setDetailCheque(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-white cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
