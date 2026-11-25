import React, { useState, useEffect } from 'react';
import { FuelDeposit } from '../types';
import { 
  X, 
  Plus, 
  Fuel, 
  Truck, 
  Layers, 
  Ticket, 
  Calendar, 
  FileText, 
  DollarSign, 
  CheckCircle2,
  SlidersHorizontal,
  Scale,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Info
} from 'lucide-react';

export interface StockAdjustmentDetails {
  isAdjustment: boolean;
  adjustmentType: 'FIJAR_EXACTO' | 'DIFERENCIA' | 'RECARGA';
  differenceLiters: number;
  reason: string;
  responsible?: string;
}

interface FuelDepositRefillModalProps {
  isOpen: boolean;
  onClose: () => void;
  deposit: FuelDeposit | null;
  initialTab?: 'refill' | 'adjustment';
  onConfirmRefill: (
    depositId: string, 
    addedLiters: number, 
    newStock: number, 
    refillDate: string, 
    notes: string,
    adjustmentDetails?: StockAdjustmentDetails
  ) => void;
}

export const FuelDepositRefillModal: React.FC<FuelDepositRefillModalProps> = ({
  isOpen,
  onClose,
  deposit,
  initialTab = 'refill',
  onConfirmRefill,
}) => {
  if (!isOpen || !deposit) return null;

  const currentStock = Number((deposit.stockActual || 0).toFixed(3));
  const maxCap = deposit.capacidadTotal || 1;

  // Tabs: 'refill' (sumar litros) or 'adjustment' (ajuste físico de stock)
  const [activeTab, setActiveTab] = useState<'refill' | 'adjustment'>(initialTab);

  // --- State for REFILL Tab ---
  const [addedLiters, setAddedLiters] = useState<number>(
    deposit.modalidad === 'BIDONES' 
      ? Math.max(0, maxCap - currentStock) 
      : Math.min(2000, Math.max(0, maxCap - currentStock))
  );
  const [refillDate, setRefillDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [supplierNotes, setSupplierNotes] = useState<string>('');

  // --- State for ADJUSTMENT Tab ---
  // Sub-mode: 'EXACT' (fijar nivel real medido con varilla) or 'DELTA' (sumar/restar diferencia)
  const [adjustSubMode, setAdjustSubMode] = useState<'EXACT' | 'DELTA'>('EXACT');
  const [exactStockInput, setExactStockInput] = useState<number>(currentStock);
  const [deltaLitersInput, setDeltaLitersInput] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('Medición física con varilla (Nivel real en cisterna)');
  const [adjustResponsible, setAdjustResponsible] = useState<string>(deposit.responsableNombre || '');
  const [adjustDate, setAdjustDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [adjustNotes, setAdjustNotes] = useState<string>('');

  // Keep state synced when modal opens or deposit changes
  useEffect(() => {
    if (deposit) {
      setExactStockInput(Number((deposit.stockActual || 0).toFixed(3)));
      setDeltaLitersInput(0);
      setActiveTab(initialTab);
    }
  }, [deposit, initialTab, isOpen]);

  // Calculations for Refill mode (sin tope superior para permitir cargas fuera de orden)
  const refillNewCalculatedStock = Number((currentStock + Number(addedLiters || 0)).toFixed(3));

  // Calculations for Adjustment mode (permite negativos y valores sobre capacidad nominal)
  const adjustedStockValue = adjustSubMode === 'EXACT'
    ? Number(Number(exactStockInput || 0).toFixed(3))
    : Number((currentStock + Number(deltaLitersInput || 0)).toFixed(3));

  const differenceLitros = Number((adjustedStockValue - currentStock).toFixed(3));

  const handleRefillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addedLiters <= 0) return;

    onConfirmRefill(
      deposit.id,
      Number(addedLiters),
      refillNewCalculatedStock,
      refillDate,
      supplierNotes,
      {
        isAdjustment: false,
        adjustmentType: 'RECARGA',
        differenceLiters: Number(addedLiters),
        reason: 'Recarga de combustible ingresada',
        responsible: deposit.responsableNombre
      }
    );
    onClose();
  };

  const handleAdjustmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onConfirmRefill(
      deposit.id,
      differenceLitros,
      adjustedStockValue,
      adjustDate,
      adjustNotes,
      {
        isAdjustment: true,
        adjustmentType: adjustSubMode === 'EXACT' ? 'FIJAR_EXACTO' : 'DIFERENCIA',
        differenceLiters: differenceLitros,
        reason: adjustReason,
        responsible: adjustResponsible
      }
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-100 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#1E232D] border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              activeTab === 'adjustment'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
            }`}>
              {activeTab === 'adjustment' ? <Scale className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-tight">
                {activeTab === 'adjustment'
                  ? 'Ajuste de Stock Físico en Cisterna'
                  : deposit.modalidad === 'VALES_ESTACION' 
                    ? 'Acreditación / Renovación de Cupo' 
                    : 'Registrar Recarga de Combustible'}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {deposit.id} • {deposit.nombre}
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

        {/* Tab Selector: Recarga (+) vs Ajuste de Stock Físico (=) */}
        {deposit.modalidad !== 'VALES_ESTACION' && (
          <div className="px-5 pt-3 pb-0 bg-[#16191F] border-b border-slate-800">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('refill')}
                className={`flex-1 py-2 px-3 text-xs font-bold rounded-t-lg border-b-2 transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'refill'
                    ? 'text-emerald-400 border-emerald-500 bg-emerald-500/10'
                    : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>1. Carga / Recarga (+)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('adjustment')}
                className={`flex-1 py-2 px-3 text-xs font-bold rounded-t-lg border-b-2 transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'adjustment'
                    ? 'text-amber-400 border-amber-500 bg-amber-500/10'
                    : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>2. Ajuste Físico de Stock (Varilla)</span>
              </button>
            </div>
          </div>
        )}

        {/* ===================== TAB 1: RECARGA (+) ===================== */}
        {activeTab === 'refill' && (
          <form onSubmit={handleRefillSubmit} className="p-5 space-y-4">
            {/* Current Status Box */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Modalidad:</span>
                <span className="text-white font-bold">{deposit.modalidadLabel}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Stock Actual Disponible:</span>
                <span className="text-amber-400 font-mono font-bold">{currentStock.toLocaleString('es-AR', { maximumFractionDigits: 3 })} Lts</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Capacidad / Cupo Máximo:</span>
                <span className="text-white font-mono">{maxCap.toLocaleString('es-AR')} Lts</span>
              </div>

              {/* Progress Visual */}
              <div className="mt-2 space-y-1">
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden flex">
                  <div 
                    className="bg-amber-500 h-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, (currentStock / maxCap) * 100))}%` }}
                  />
                  <div 
                    className="bg-emerald-400 h-full transition-all"
                    style={{ width: `${Math.min(100 - Math.min(100, Math.max(0, (currentStock / maxCap) * 100)), Math.max(0, ((addedLiters || 0) / maxCap) * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>Stock Actual ({Math.round((currentStock / maxCap) * 100)}%)</span>
                  <span className={refillNewCalculatedStock > maxCap ? 'text-cyan-400 font-bold' : refillNewCalculatedStock < 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                    Nuevo: {refillNewCalculatedStock.toLocaleString('es-AR', { maximumFractionDigits: 3 })} Lts ({Math.round((refillNewCalculatedStock / maxCap) * 100)}%)
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                {deposit.modalidad === 'VALES_ESTACION' ? 'Litros a Acreditar en Vales' : 'Litros Despachados / Cargados a Cisterna'} <span className="text-amber-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  value={addedLiters}
                  onChange={(e) => setAddedLiters(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-lg text-white font-bold font-mono focus:border-emerald-500 outline-hidden"
                />
                <span className="absolute right-3 top-3 text-xs font-bold text-slate-500">LITROS</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Fecha de Carga / Recarga
                </label>
                <input
                  type="date"
                  value={refillDate}
                  onChange={(e) => setRefillDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:border-emerald-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Remito / Factura / Proveedor
                </label>
                <input
                  type="text"
                  value={supplierNotes}
                  onChange={(e) => setSupplierNotes(e.target.value)}
                  placeholder="ej: Remito / Factura Nº 0001-00001234"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:border-emerald-500 outline-hidden"
                />
              </div>
            </div>

            {/* Quick buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAddedLiters(Math.max(0, maxCap - currentStock))}
                className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-300 transition cursor-pointer"
              >
                Llenar al 100% (+{Math.max(0, maxCap - currentStock).toLocaleString('es-AR')} L)
              </button>
              {maxCap > 1000 && (
                <button
                  type="button"
                  onClick={() => setAddedLiters(1000)}
                  className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-300 transition cursor-pointer"
                >
                  +1.000 L
                </button>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black text-xs font-bold rounded-lg shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar Recarga</span>
              </button>
            </div>
          </form>
        )}

        {/* ===================== TAB 2: AJUSTE DE STOCK FÍSICO (=) ===================== */}
        {activeTab === 'adjustment' && (
          <form onSubmit={handleAdjustmentSubmit} className="p-5 space-y-4">
            
            {/* Method switcher */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setAdjustSubMode('EXACT')}
                className={`py-1.5 px-2 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  adjustSubMode === 'EXACT'
                    ? 'bg-amber-500 text-black shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Fijar Medición Real (Varilla)</span>
              </button>

              <button
                type="button"
                onClick={() => setAdjustSubMode('DELTA')}
                className={`py-1.5 px-2 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  adjustSubMode === 'DELTA'
                    ? 'bg-amber-500 text-black shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Ajustar por Diferencia (+ / -)</span>
              </button>
            </div>

            {/* Input according to SubMode */}
            {adjustSubMode === 'EXACT' ? (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Stock Físico Real Medido en Tanque <span className="text-amber-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Capacidad máx: {maxCap} Lts
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    value={exactStockInput}
                    onChange={(e) => setExactStockInput(parseFloat(e.target.value) || 0)}
                    placeholder="ej: 150 (admite negativo o sobre cap.)"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-amber-500/50 rounded-lg text-xl text-white font-black font-mono focus:border-amber-400 outline-hidden"
                  />
                  <span className="absolute right-3 top-3.5 text-xs font-bold text-amber-400 font-mono">LITROS</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Ingrese los litros exactos medidos con la varilla o visor de nivel.</span>
                </p>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Variación a Aplicar (+ o - Litros) <span className="text-amber-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Stock actual: {currentStock} Lts
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    value={deltaLitersInput}
                    onChange={(e) => setDeltaLitersInput(parseFloat(e.target.value) || 0)}
                    placeholder="ej: -15 o +20"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-amber-500/50 rounded-lg text-xl text-white font-black font-mono focus:border-amber-400 outline-hidden"
                  />
                  <span className="absolute right-3 top-3.5 text-xs font-bold text-amber-400 font-mono">LITROS (+/-)</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Use números negativos (-) para mermas o evaporación, y positivos (+) para sobrantes.
                </p>
              </div>
            )}

            {/* Live Comparison / Result Box */}
            <div className="p-3.5 rounded-xl bg-slate-900/95 border border-slate-800 space-y-2.5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Stock en Sistema</span>
                  <span className="text-sm font-bold font-mono text-slate-300">{currentStock.toLocaleString('es-AR', { maximumFractionDigits: 3 })} L</span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Diferencia Calculada</span>
                  <span className={`text-sm font-bold font-mono flex items-center justify-center gap-1 ${
                    differenceLitros > 0 ? 'text-emerald-400' : differenceLitros < 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {differenceLitros > 0 && <TrendingUp className="w-3 h-3" />}
                    {differenceLitros < 0 && <TrendingDown className="w-3 h-3" />}
                    {differenceLitros > 0 ? `+${differenceLitros}` : differenceLitros} L
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <span className="text-[10px] text-amber-300 uppercase font-bold block">Nuevo Stock Físico</span>
                  <span className="text-sm font-black font-mono text-amber-400">{adjustedStockValue.toLocaleString('es-AR', { maximumFractionDigits: 3 })} L</span>
                </div>
              </div>

              {/* Graphical level bar */}
              <div className="space-y-1 pt-1">
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                  <div 
                    className={`h-full transition-all rounded-full ${
                      adjustedStockValue < 0 ? 'bg-rose-500' : adjustedStockValue > maxCap ? 'bg-cyan-400' : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, (adjustedStockValue / maxCap) * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>Capacidad: {maxCap} Lts</span>
                  <span className={`font-bold ${
                    adjustedStockValue < 0 ? 'text-rose-400' : adjustedStockValue > maxCap ? 'text-cyan-400' : 'text-amber-400'
                  }`}>
                    {adjustedStockValue < 0
                      ? `Saldo negativo (${adjustedStockValue.toLocaleString('es-AR', { maximumFractionDigits: 2 })} L)`
                      : adjustedStockValue > maxCap
                        ? `${Math.round((adjustedStockValue / maxCap) * 100)}% (+${(adjustedStockValue - maxCap).toLocaleString('es-AR', { maximumFractionDigits: 2 })} L sobre cap.)`
                        : `${Math.round((adjustedStockValue / maxCap) * 100)}% Lleno`}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Accesos Rápidos de Ajuste:</span>
              <div className="flex flex-wrap gap-1.5">

                <button
                  type="button"
                  onClick={() => {
                    setAdjustSubMode('EXACT');
                    setExactStockInput(maxCap);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  Lleno ({maxCap} L)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAdjustSubMode('EXACT');
                    setExactStockInput(0);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  Tanque Vacío (0 L)
                </button>
              </div>
            </div>

            {/* Reason selector */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Motivo / Justificación del Ajuste <span className="text-amber-500">*</span>
              </label>
              <select
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-400 outline-hidden font-medium"
              >
                <option value="Medición física con varilla (Nivel real en cisterna)">
                  📏 Medición física con varilla (Nivel real en cisterna)
                </option>
                <option value="Corrección de inventario / Despachos no registrados">
                  📋 Corrección de inventario / Despachos no registrados
                </option>
                <option value="Merma operativa / Evaporación / Saldo no registrado">
                  📉 Merma operativa por evaporación, transporte o purga
                </option>
                <option value="Calibración de caudalímetro o surtidor interno">
                  ⚙️ Calibración de caudalímetro o surtidor interno
                </option>
                <option value="Carga directa en obra / Sin ticket fiscal oficial">
                  🚚 Carga directa recibida en obra sin ticket fiscal
                </option>
                <option value="Vaciado / Limpieza o mantenimiento de cisterna">
                  🧽 Vaciado por mantenimiento o limpieza de cisterna
                </option>
                <option value="Sobrante detectado en control de inventario">
                  📈 Sobrante detectado en control de inventario
                </option>
                <option value="Otro motivo justificado">
                  ✍️ Otro motivo justificado
                </option>
              </select>
            </div>

            {/* Date & Responsible in 2 cols */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Fecha de la Medición / Ajuste
                </label>
                <input
                  type="date"
                  value={adjustDate}
                  onChange={(e) => setAdjustDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-400 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Responsable / Medidor
                </label>
                <input
                  type="text"
                  value={adjustResponsible}
                  onChange={(e) => setAdjustResponsible(e.target.value)}
                  placeholder="ej: Encargado de depósito"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-400 outline-hidden"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Observaciones Adicionales (Opcional)
              </label>
              <input
                type="text"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                placeholder="ej: Medición física con varilla según tabla de aforo"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-400 outline-hidden"
              />
            </div>

            {/* Action buttons */}
            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black text-xs font-bold rounded-lg shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <Scale className="w-4 h-4" />
                <span>Aplicar Ajuste de Stock</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
