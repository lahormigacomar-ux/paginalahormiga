import React, { useState } from 'react';
import { FuelDeposit, FuelVoucher, FuelDepositStockAdjustment } from '../types';
import { isVoucherIncomingToDeposit, isVoucherOutgoingFromDeposit, getVoucherLiters } from '../utils/fuelStockReconciliation';
import { AssignFuelsToStationModal } from './AssignFuelsToStationModal';
import { 
  X, 
  Fuel, 
  Truck, 
  Layers, 
  Ticket, 
  MapPin, 
  User, 
  Calendar, 
  Clock, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  Edit3, 
  PlusCircle, 
  FileText,
  Activity,
  History,
  ShieldCheck,
  Building2,
  Trash2,
  Scale,
  TrendingUp,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  Filter
} from 'lucide-react';

export interface MovementRow {
  id: string;
  fecha: string;
  tipo: 'INGRESO' | 'EGRESO' | 'AJUSTE';
  equipoOrDestino: string;
  choferOrResponsable: string;
  litros: number;
  litrosAbs: number;
  kmOrHoras: string | number;
  comprobante: string;
  badgeLabel: string;
  motivoOrNota?: string;
}

interface FuelDepositDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  deposit: FuelDeposit | null;
  vouchers: FuelVoucher[];
  deposits?: FuelDeposit[];
  onOpenEdit: (deposit: FuelDeposit) => void;
  onOpenRefill: (deposit: FuelDeposit) => void;
  onOpenStockAdjustment?: (deposit: FuelDeposit) => void;
  onNewDispensaryFromDeposit: (deposit: FuelDeposit) => void;
  onDelete: (id: string) => void;
  onSaveFuelAssignments?: (stationId: string, fuelNames: string[]) => void;
  onUpdateDeposit?: (deposit: FuelDeposit) => void;
  onDeleteVoucher?: (voucherId: string) => void;
}

export const FuelDepositDetailModal: React.FC<FuelDepositDetailModalProps> = ({
  isOpen,
  onClose,
  deposit,
  vouchers,
  deposits = [],
  onOpenEdit,
  onOpenRefill,
  onOpenStockAdjustment,
  onNewDispensaryFromDeposit,
  onDelete,
  onSaveFuelAssignments,
  onUpdateDeposit,
  onDeleteVoucher,
}) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isAssignFuelsModalOpen, setIsAssignFuelsModalOpen] = useState(false);
  const [movementFilter, setMovementFilter] = useState<'ALL' | 'INGRESOS' | 'EGRESOS' | 'AJUSTES'>('ALL');
  const [deletingMovement, setDeletingMovement] = useState<MovementRow | null>(null);

  if (!isOpen || !deposit) return null;

  const currentStock = deposit.stockActual || 0;
  const totalCap = deposit.capacidadTotal || 1;
  const rawPct = Math.round((currentStock / totalCap) * 100);
  const pct = Math.min(100, Math.max(0, rawPct));
  const isOverCap = deposit.modalidad !== 'VALES_ESTACION' && currentStock > totalCap;
  const isNegative = deposit.modalidad !== 'VALES_ESTACION' && currentStock < 0;

  const handleSaveFuelAssignments = (stationId: string, fuelNames: string[]) => {
    if (onSaveFuelAssignments) {
      onSaveFuelAssignments(stationId, fuelNames);
    } else if (onUpdateDeposit && deposit) {
      onUpdateDeposit({
        ...deposit,
        tiposCombustibles: fuelNames,
        tipoCombustible: fuelNames.length > 0 ? fuelNames.join(' / ') : deposit.tipoCombustible
      });
    }
    setIsAssignFuelsModalOpen(false);
  };

  // 1. Separate vouchers into INCOMING (Cargas a cisterna) and OUTGOING (Despachos a equipos)
  const incomingLoads = vouchers.filter(v => isVoucherIncomingToDeposit(v, deposit));
  const outgoingDispatches = vouchers.filter(v => isVoucherOutgoingFromDeposit(v, deposit));

  const totalCargasVouchersLiters = incomingLoads.reduce((sum, v) => sum + getVoucherLiters(v), 0);
  const totalDescargasVouchersLiters = outgoingDispatches.reduce((sum, v) => sum + getVoucherLiters(v), 0);

  // 2. Adjustments history
  const stockAdjustments: FuelDepositStockAdjustment[] = [...(deposit.historialAjustes || [])];

  // If there's an adjusted stock (e.g. set with varilla to 130 L), ensure it appears in the movements ledger
  const currentActualStock = Number((deposit.stockActual ?? 0).toFixed(3));
  const netFromVouchers = Number((totalCargasVouchersLiters - totalDescargasVouchersLiters).toFixed(3));

  if (stockAdjustments.length === 0 && (deposit.stockAjustadoManual !== undefined || deposit.ultimoAjusteLitros !== undefined)) {
    const diff = Number((currentActualStock - netFromVouchers).toFixed(3));
    if (diff !== 0 || deposit.ultimoAjusteLitros !== undefined) {
      stockAdjustments.push({
        id: `AJU-${deposit.id}`,
        fecha: deposit.ultimoAjusteFecha || new Date().toISOString().slice(0, 10),
        hora: '10:00',
        tipo: 'FIJAR_EXACTO',
        stockAnterior: netFromVouchers,
        stockNuevo: currentActualStock,
        diferenciaLitros: diff !== 0 ? diff : Number((deposit.ultimoAjusteDiferencia || 0).toFixed(3)),
        motivo: deposit.motivoUltimoAjuste || 'Medición física con varilla (Nivel real en cisterna)',
        responsable: deposit.responsableUltimoAjuste || deposit.responsableNombre || 'Sin asignar',
        observaciones: 'Ajuste de inventario en tanque'
      });
    }
  }

  const totalAjustesLiters = stockAdjustments.reduce((sum, a) => sum + a.diferenciaLitros, 0);

  // Movement Row Definition
  interface MovementRow {
    id: string;
    fecha: string;
    tipo: 'INGRESO' | 'EGRESO' | 'AJUSTE';
    equipoOrDestino: string;
    choferOrResponsable: string;
    litros: number; // positive or negative
    litrosAbs: number;
    kmOrHoras: string | number;
    comprobante: string;
    badgeLabel: string;
    motivoOrNota?: string;
  }

  const allMovements: MovementRow[] = [
    // Incoming loads into this cistern (Cargas)
    ...incomingLoads.map(v => ({
      id: v.id,
      fecha: v.fecha || '',
      tipo: 'INGRESO' as const,
      equipoOrDestino: `${deposit.nombre} (Carga / Reposición)`,
      choferOrResponsable: v.nombreApellido || 'Sin asignar',
      litros: getVoucherLiters(v),
      litrosAbs: getVoucherLiters(v),
      kmOrHoras: v.kilometraje ?? 0,
      comprobante: v.numTicket ? `Ticket ${v.numTicket}` : (v.numVale ? `Vale ${v.numVale}` : v.id),
      badgeLabel: '📥 Ingreso a Stock',
      motivoOrNota: 'Carga de combustible recibida en cisterna'
    })),
    // Outgoing dispatches from this cistern to fleet machines (Despachos)
    ...outgoingDispatches.map(v => ({
      id: v.id,
      fecha: v.fecha || '',
      tipo: 'EGRESO' as const,
      equipoOrDestino: `Equipo ${v.codigoEquipo || v.patente || ''} ${v.marcaModelo ? `(${v.marcaModelo})` : ''}`,
      choferOrResponsable: v.nombreApellido || 'Operario',
      litros: -getVoucherLiters(v),
      litrosAbs: getVoucherLiters(v),
      kmOrHoras: v.kilometraje || (v as any).horometro || '-',
      comprobante: v.id,
      badgeLabel: '📤 Despacho a Equipo',
      motivoOrNota: 'Suministro de combustible a máquina'
    })),
    // Physical Stock Adjustments (Varilla / Auditoría)
    ...stockAdjustments.map(a => ({
      id: a.id,
      fecha: a.fecha,
      tipo: 'AJUSTE' as const,
      equipoOrDestino: `Ajuste en Cisterna: ${a.motivo}`,
      choferOrResponsable: a.responsable || 'Auditor',
      litros: a.diferenciaLitros,
      litrosAbs: Math.abs(a.diferenciaLitros),
      kmOrHoras: `Nivel: ${a.stockNuevo} L`,
      comprobante: a.id,
      badgeLabel: a.diferenciaLitros >= 0 ? '⚖️ Ajuste (+) Varilla' : '📉 Ajuste (-) Varilla',
      motivoOrNota: `Stock fijado en ${a.stockNuevo} Lts (${a.diferenciaLitros >= 0 ? '+' : ''}${a.diferenciaLitros} L)`
    }))
  ].sort((a, b) => {
    const dc = (b.fecha || '').localeCompare(a.fecha || '');
    if (dc !== 0) return dc;
    return (b.id || '').localeCompare(a.id || '');
  });

  const handleDeleteMovement = (m: MovementRow) => {
    setDeletingMovement(m);
  };

  const handleConfirmDeleteMovement = (m: MovementRow) => {
    if (!deposit) return;

    if (m.tipo === 'AJUSTE') {
      const remainingAdjustments = (deposit.historialAjustes || []).filter(
        a => a.id !== m.id && a.id !== `AJU-${deposit.id}`
      );
      
      let updatedDeposit: FuelDeposit = {
        ...deposit,
        historialAjustes: remainingAdjustments
      };

      // Completely remove stock adjustment override properties
      delete updatedDeposit.stockAjustadoManual;
      delete updatedDeposit.ultimoAjusteFecha;
      delete updatedDeposit.ultimoAjusteLitros;
      delete updatedDeposit.ultimoAjusteDiferencia;
      delete updatedDeposit.motivoUltimoAjuste;
      delete updatedDeposit.responsableUltimoAjuste;

      if (remainingAdjustments.length > 0) {
        const latestAdj = remainingAdjustments[0];
        updatedDeposit.stockAjustadoManual = latestAdj.stockNuevo;
        updatedDeposit.ultimoAjusteFecha = latestAdj.fecha;
        updatedDeposit.ultimoAjusteLitros = latestAdj.stockNuevo;
        updatedDeposit.ultimoAjusteDiferencia = latestAdj.diferenciaLitros;
        updatedDeposit.motivoUltimoAjuste = latestAdj.motivo;
        updatedDeposit.responsableUltimoAjuste = latestAdj.responsable;
      }

      if (onUpdateDeposit) {
        onUpdateDeposit(updatedDeposit);
      }
    } else {
      if (onDeleteVoucher) {
        onDeleteVoucher(m.id);
      } else if (onDelete) {
        onDelete(m.id);
      }
    }

    setDeletingMovement(null);
  };

  const filteredMovements = allMovements.filter(m => {
    if (movementFilter === 'INGRESOS') return m.tipo === 'INGRESO';
    if (movementFilter === 'EGRESOS') return m.tipo === 'EGRESO';
    if (movementFilter === 'AJUSTES') return m.tipo === 'AJUSTE';
    return true;
  });

  const isLowStock = currentStock <= (deposit.nivelAlertaMinimo || 500);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#1E232D] border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              deposit.modalidad === 'DEPOSITO_AMBULANTE'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : deposit.modalidad === 'BIDONES'
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                  : 'bg-purple-500/20 border-purple-500/40 text-purple-400'
            }`}>
              {deposit.modalidad === 'DEPOSITO_AMBULANTE' && <Truck className="w-5 h-5" />}
              {deposit.modalidad === 'BIDONES' && <Layers className="w-5 h-5" />}
              {deposit.modalidad === 'VALES_ESTACION' && <Ticket className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white uppercase tracking-tight">
                  {deposit.nombre}
                </h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {deposit.id}
                </span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                  deposit.estado === 'OPERATIVO'
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                    : deposit.estado === 'BAJO_STOCK'
                      ? 'bg-amber-950/60 text-amber-400 border-amber-800'
                      : 'bg-rose-950/60 text-rose-400 border-rose-800'
                }`}>
                  {deposit.estado === 'OPERATIVO' && '🟢 OPERATIVO'}
                  {deposit.estado === 'BAJO_STOCK' && '🟡 BAJO STOCK'}
                  {deposit.estado === 'EN_REPOSICION' && '🔵 EN REPOSICIÓN'}
                  {deposit.estado === 'FUERA_SERVICIO' && '🔴 FUERA DE SERVICIO'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Modalidad: <span className="text-white font-semibold">{deposit.modalidadLabel}</span> • {deposit.tipoCombustible}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Level Gauge & Quick KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Level Card */}
            <div className="md:col-span-2 bg-[#0F1115] border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Fuel className="w-4 h-4 text-amber-500" />
                  {deposit.modalidad === 'VALES_ESTACION' 
                    ? 'Total Consumo en Estación (Solo suma cargas)' 
                    : deposit.modalidad === 'DEPOSITO_AMBULANTE'
                    ? 'Stock en Cisterna (Cargas vs Descargas)'
                    : 'Stock de Combustible Disponible'}
                </span>
                <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                  deposit.modalidad === 'VALES_ESTACION'
                    ? 'bg-purple-500/20 text-purple-300'
                    : pct > 40 ? 'bg-emerald-500/20 text-emerald-400' : pct > 20 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  {deposit.modalidad === 'VALES_ESTACION' ? 'Convenio Vales' : `${pct}% Lleno`}
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-3xl font-extrabold font-mono ${isNegative ? 'text-rose-400' : isOverCap ? 'text-cyan-300' : 'text-white'}`}>
                  {deposit.modalidad === 'VALES_ESTACION' 
                    ? (deposit.totalCargasLitros || totalCargasVouchersLiters).toLocaleString('es-AR', { maximumFractionDigits: 2 })
                    : currentStock.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                </span>
                <span className="text-sm font-semibold text-slate-400">
                  {deposit.modalidad === 'VALES_ESTACION' 
                    ? 'Litros cargados acumulados' 
                    : `/ ${totalCap.toLocaleString('es-AR')} Litros`}
                </span>
              </div>

              {/* Tank Progress bar (only for physical tanks) */}
              {deposit.modalidad !== 'VALES_ESTACION' ? (
                <>
                  <div className={`w-full h-4 rounded-full overflow-hidden p-0.5 border mb-3 ${isNegative ? 'bg-rose-950/70 border-rose-800' : 'bg-slate-800 border-slate-700'}`}>
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOverCap
                          ? 'bg-gradient-to-r from-cyan-500 to-sky-400'
                          : pct > 40
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                            : pct > 20
                              ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                              : 'bg-gradient-to-r from-rose-600 to-rose-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-slate-400 font-mono">
                    <span>Alerta Mínima: {deposit.nivelAlertaMinimo} Lts</span>
                    <span className={isNegative ? 'text-rose-400 font-bold' : isOverCap ? 'text-cyan-300 font-bold' : ''}>
                      {isOverCap
                        ? `Excedente sobre cap.: +${(currentStock - totalCap).toLocaleString('es-AR', { maximumFractionDigits: 2 })} Lts (${rawPct}%)`
                        : isNegative
                          ? `Saldo negativo: ${currentStock.toLocaleString('es-AR', { maximumFractionDigits: 2 })} Lts`
                          : `Espacio libre: ${(totalCap - currentStock).toLocaleString('es-AR', { maximumFractionDigits: 2 })} Lts`}
                    </span>
                  </div>
                </>
              ) : (
                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs text-purple-200 mb-2">
                  <p>
                    ⛽ <strong>Solo suma cargas:</strong> Los expendios realizados en esta estación se acumulan para control de consumo y facturación del convenio. No descuenta stock físico de tanques de la empresa.
                  </p>
                </div>
              )}

              {/* Detalle de Cargas, Descargas y Ajustes para Cisterna */}
              {deposit.modalidad === 'DEPOSITO_AMBULANTE' && (
                <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-[10px] text-emerald-400 uppercase font-bold flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-400" />
                      <span>1. Cargas (Entradas)</span>
                    </span>
                    <strong className="text-sm font-mono text-white mt-1 block">
                      +{totalCargasVouchersLiters.toLocaleString('es-AR', { maximumFractionDigits: 3 })} Lts
                    </strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Ingresos por Ticket ({incomingLoads.length})</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <span className="text-[10px] text-rose-400 uppercase font-bold flex items-center gap-1">
                      <TrendingDown className="w-3 h-3 text-rose-400" />
                      <span>2. Despachos (Salidas)</span>
                    </span>
                    <strong className="text-sm font-mono text-white mt-1 block">
                      -{totalDescargasVouchersLiters.toLocaleString('es-AR', { maximumFractionDigits: 3 })} Lts
                    </strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Egresos a equipos ({outgoingDispatches.length})</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-amber-300 uppercase font-bold flex items-center gap-1">
                      <Scale className="w-3 h-3 text-amber-400" />
                      <span>3. Ajustes de Varilla</span>
                    </span>
                    <strong className="text-sm font-mono text-amber-400 mt-1 block">
                      {totalAjustesLiters >= 0 ? `+${totalAjustesLiters.toLocaleString('es-AR', { maximumFractionDigits: 3 })}` : `${totalAjustesLiters.toLocaleString('es-AR', { maximumFractionDigits: 3 })}`} Lts
                    </strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Stock Físico: {currentStock} L</span>
                  </div>
                </div>
              )}

              {isLowStock && deposit.modalidad !== 'VALES_ESTACION' && (
                <div className="mt-3 p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>El stock está por debajo del umbral mínimo de seguridad. Se recomienda programar recarga inmediata.</span>
                </div>
              )}
            </div>

            {/* Quick Action Bento */}
            <div className="bg-[#0F1115] border border-slate-800 p-5 rounded-2xl flex flex-col justify-between space-y-3">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-1">
                  Acciones Operativas
                </span>
                <p className="text-[11px] text-slate-500">
                  Gestión de abastecimiento y despacho directo
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    onClose();
                    onOpenRefill(deposit);
                  }}
                  className="w-full py-2 px-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{deposit.modalidad === 'VALES_ESTACION' ? 'Acreditar Cupo Vales' : 'Cargar / Reabastecer (+)'}</span>
                </button>

                {deposit.modalidad !== 'VALES_ESTACION' && (
                  <button
                    onClick={() => {
                      onClose();
                      if (onOpenStockAdjustment) {
                        onOpenStockAdjustment(deposit);
                      } else {
                        onOpenRefill(deposit);
                      }
                    }}
                    className="w-full py-2 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Scale className="w-4 h-4 text-amber-400" />
                    <span>Ajuste de Stock Físico (Varilla)</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    onClose();
                    onNewDispensaryFromDeposit(deposit);
                  }}
                  className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm border border-slate-700"
                >
                  <Fuel className="w-4 h-4 text-amber-400" />
                  <span>Nuevo Expendio con este Depósito</span>
                </button>

                <button
                  onClick={() => {
                    onClose();
                    onOpenEdit(deposit);
                  }}
                  className="w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer border border-slate-800"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar Parámetros</span>
                </button>
              </div>
            </div>
          </div>

          {/* Detailed Specs depending on Modality */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Box 1: Technical specs */}
            <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Especificaciones Técnicas</span>
              </h3>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Modalidad Oficial:</span>
                  <span className="font-bold text-white">{deposit.modalidadLabel}</span>
                </div>
                <div className="py-2 border-b border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400">Combustibles Habilitados:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-amber-400 font-bold">
                        {deposit.tiposCombustibles?.length || 1} tipo(s)
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAssignFuelsModalOpen(true)}
                        className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition cursor-pointer flex items-center gap-1"
                        title="Asignar o editar los tipos de combustibles habilitados"
                      >
                        <Fuel className="w-2.5 h-2.5" />
                        <span>Editar</span>
                      </button>
                    </div>
                  </div>
                  {deposit.tiposCombustibles && deposit.tiposCombustibles.length > 0 ? (
                    <div className="flex flex-wrap gap-1 justify-end mt-1.5">
                      {deposit.tiposCombustibles.map(fuel => (
                        <span key={fuel} className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
                          ⛽ {fuel}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="font-mono text-amber-400 block text-right">{deposit.tipoCombustible || 'Sin asignar'}</span>
                  )}
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Ubicación / Base:</span>
                  <span className="text-white text-right">{deposit.ubicacion}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Responsable Asignado:</span>
                  <span className="text-white font-semibold">{deposit.responsableNombre || 'No asignado'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Costo Estimado $/Lt:</span>
                  <span className="font-mono text-emerald-400">${deposit.costoPorLitroEstimado?.toLocaleString()} ARS</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Última Recarga Registrada:</span>
                  <span className="font-mono text-white">{deposit.ultimaRecargaFecha || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Box 2: Modality specifics */}
            <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span>Detalle de la Modalidad ({deposit.modalidadLabel})</span>
              </h3>

              {deposit.modalidad === 'DEPOSITO_AMBULANTE' && (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Patente Vehículo Cisterna:</span>
                    <span className="font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                      {deposit.patenteVehiculo || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Código Flota Asignado:</span>
                    <span className="font-mono text-white">{deposit.codigoEquipo || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Modelo del Camión:</span>
                    <span className="text-white">{deposit.marcaModeloCamion || 'Sin especificar'}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                    🚚 Cisterna móvil habilitada para abastecer equipos en frentes de obra.
                  </p>
                </div>
              )}

              {deposit.modalidad === 'BIDONES' && (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Cantidad Total de Bidones:</span>
                    <span className="font-mono font-bold text-blue-400">{deposit.cantidadBidones ?? 0} unidades</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Capacidad por Unidad:</span>
                    <span className="font-mono text-white">{deposit.capacidadPorBidon ?? 0} Litros c/u</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Homologación:</span>
                    <span className="text-white">{deposit.tipoHomologacion || 'No especificado'}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                    🛢️ Lote de bidones para cargas auxiliares en obra y taller.
                  </p>
                </div>
              )}

              {deposit.modalidad === 'VALES_ESTACION' && (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Bandera Petrolera:</span>
                    <span className="font-bold text-white px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-300">
                      {deposit.empresaBandera || 'Sin especificar'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Nº de Estación:</span>
                    <span className="font-mono font-bold text-white">{deposit.numEstacionConvenio || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Establecimiento:</span>
                    <span className="text-white">{deposit.nombreEstacion || 'Sin especificar'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Nº Cuenta / Convenio:</span>
                    <span className="font-mono text-purple-400">{deposit.numeroCuentaConvenio || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Dirección:</span>
                    <span className="text-white text-right">{deposit.direccionEstacion || 'N/A'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Observations */}
          {deposit.observaciones && (
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
              <span className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Notas / Observaciones:</span>
              <p>{deposit.observaciones}</p>
            </div>
          )}

          {/* Historial de Movimientos: Ingresos, Despachos y Ajustes de Stock Físico */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-500" />
                  <span>Historial de Movimientos y Control de Stock ({filteredMovements.length})</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Trazabilidad real: Ingresos a cisterna, salidas a equipos y ajustes físicos de varilla.
                </p>
              </div>

              {/* Accounting summary badges */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono">
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold" title="Total combustible cargado a la cisterna">
                  Entradas: +{totalCargasVouchersLiters.toLocaleString('es-AR', { maximumFractionDigits: 3 })} L
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold" title="Total combustible despachado a máquinas">
                  Salidas: -{totalDescargasVouchersLiters.toLocaleString('es-AR', { maximumFractionDigits: 3 })} L
                </span>
                {totalAjustesLiters !== 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold" title="Variación neta por mediciones físicas de varilla">
                    Ajustes: {totalAjustesLiters >= 0 ? '+' : ''}{totalAjustesLiters.toLocaleString('es-AR', { maximumFractionDigits: 3 })} L
                  </span>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto">
              <button
                type="button"
                onClick={() => setMovementFilter('ALL')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                  movementFilter === 'ALL'
                    ? 'bg-amber-500 text-black shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos los Movimientos ({allMovements.length})
              </button>

              <button
                type="button"
                onClick={() => setMovementFilter('INGRESOS')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  movementFilter === 'INGRESOS'
                    ? 'bg-emerald-500 text-black shadow-xs'
                    : 'text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Ingresos / Cargas ({incomingLoads.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setMovementFilter('EGRESOS')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  movementFilter === 'EGRESOS'
                    ? 'bg-rose-500 text-white shadow-xs'
                    : 'text-rose-400 hover:bg-rose-500/10'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>Salidas / Despachos ({outgoingDispatches.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setMovementFilter('AJUSTES')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  movementFilter === 'AJUSTES'
                    ? 'bg-amber-500 text-black shadow-xs'
                    : 'text-amber-300 hover:bg-amber-500/10'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Ajustes de Varilla ({stockAdjustments.length})</span>
              </button>
            </div>

            {/* Table */}
            {filteredMovements.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-slate-500 text-xs">
                No hay movimientos registrados para el filtro seleccionado.
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider font-semibold sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">Comprobante</th>
                        <th className="p-2.5">Fecha</th>
                        <th className="p-2.5">Tipo de Movimiento</th>
                        <th className="p-2.5">Detalle / Equipo / Destino</th>
                        <th className="p-2.5">Chofer / Responsable</th>
                        <th className="p-2.5 text-right">Volumen</th>
                        <th className="p-2.5 text-right">Km / Horas</th>
                        <th className="p-2.5 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {filteredMovements.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-900/60 transition">
                          <td className="p-2.5 font-mono font-bold text-amber-400">
                            {m.comprobante}
                          </td>
                          <td className="p-2.5 font-mono text-slate-300 whitespace-nowrap">
                            {m.fecha}
                          </td>
                          <td className="p-2.5 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              m.tipo === 'INGRESO'
                                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                                : m.tipo === 'EGRESO'
                                  ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                                  : 'bg-amber-950/80 text-amber-300 border-amber-800'
                            }`}>
                              {m.badgeLabel}
                            </span>
                          </td>
                          <td className="p-2.5">
                            <div className="font-semibold text-white">{m.equipoOrDestino}</div>
                            {m.motivoOrNota && (
                              <div className="text-[10px] text-slate-400 truncate max-w-xs">{m.motivoOrNota}</div>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-300 whitespace-nowrap">
                            {m.choferOrResponsable}
                          </td>
                          <td className="p-2.5 font-mono font-black text-right whitespace-nowrap">
                            <span className={m.litros > 0 ? 'text-emerald-400' : m.litros < 0 ? 'text-rose-400' : 'text-slate-300'}>
                              {m.litros > 0 ? `+${m.litrosAbs.toLocaleString('es-AR', { maximumFractionDigits: 3 })}` : `-${m.litrosAbs.toLocaleString('es-AR', { maximumFractionDigits: 3 })}`} L
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-slate-400 text-right whitespace-nowrap">
                            {m.kmOrHoras}
                          </td>
                          <td className="p-2.5 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleDeleteMovement(m)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition cursor-pointer active:scale-95"
                              title={m.tipo === 'AJUSTE' ? 'Eliminar este ajuste de varilla' : 'Eliminar este comprobante'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#1E232D] border-t border-slate-700/80 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition cursor-pointer"
          >
            Cerrar Ficha
          </button>

          <div className="flex items-center gap-2">
            {confirmingDelete ? (
              <div className="flex items-center gap-2 bg-rose-950/80 border border-rose-500/50 px-3 py-1.5 rounded-lg">
                <span className="text-xs text-rose-200 font-medium">¿Eliminar depósito?</span>
                <button
                  onClick={() => {
                    onDelete(deposit.id);
                    onClose();
                  }}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded transition cursor-pointer"
                >
                  Sí, eliminar
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar</span>
              </button>
            )}

            {deposit.modalidad !== 'VALES_ESTACION' && (
              <button
                onClick={() => {
                  onClose();
                  if (onOpenStockAdjustment) {
                    onOpenStockAdjustment(deposit);
                  } else {
                    onOpenRefill(deposit);
                  }
                }}
                className="px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Ajuste de Stock Físico con varilla"
              >
                <Scale className="w-4 h-4 text-amber-400" />
                <span>Ajustar Stock</span>
              </button>
            )}

            <button
              onClick={() => setIsAssignFuelsModalOpen(true)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Asignar o editar los tipos de combustibles habilitados en esta estación"
            >
              <Fuel className="w-4 h-4 text-amber-400" />
              <span>Asignar Combustibles</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenEdit(deposit);
              }}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Modificar Depósito</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal to Assign Fuels to this station */}
      <AssignFuelsToStationModal
        isOpen={isAssignFuelsModalOpen}
        onClose={() => setIsAssignFuelsModalOpen(false)}
        deposits={deposits.length > 0 ? deposits : [deposit]}
        preselectedStationId={deposit.id}
        onSaveAssignments={handleSaveFuelAssignments}
      />

      {/* Confirmation Modal for Movement / Adjustment Deletion */}
      {deletingMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#181B22] border-2 border-rose-500/60 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 text-white animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-rose-400">
                  Confirmar Eliminación
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  {deletingMovement.tipo === 'AJUSTE'
                    ? `¿Está seguro de eliminar el ajuste de varilla "${deletingMovement.comprobante}" (${deletingMovement.motivoOrNota})?`
                    : `¿Está seguro de eliminar el comprobante "${deletingMovement.comprobante}"?`}
                </p>
                <p className="text-[11px] text-slate-400 mt-2 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 leading-relaxed">
                  {deletingMovement.tipo === 'AJUSTE'
                    ? 'ℹ️ Al eliminar este ajuste, el stock físico del tanque se recalculará automáticamente sumando todas las cargas e ingresos reales recibidos.'
                    : '⚠️ Esta acción eliminará el registro de movimiento del historial.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingMovement(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteMovement(deletingMovement)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-md transition cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, Eliminar Definitivamente</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
