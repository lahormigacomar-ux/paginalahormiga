import React, { useState, useEffect } from 'react';
import { 
  X, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Database, 
  Layers, 
  Fuel, 
  Users, 
  Truck, 
  FileText, 
  Ticket, 
  Building2, 
  ShieldCheck,
  Check
} from 'lucide-react';
import { EntityType } from '../services/importExportService';

type ClearScopeType = 'vales' | 'expendio' | 'both_fuel' | 'other_entity' | 'all';

interface ClearRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: string;
  counts: {
    flota: number;
    empleados: number;
    expendio: number;
    vales: number;
    partesDiarios: number;
    obras: number;
    depositos?: number;
    alquileres?: number;
    ferreteria?: number;
  };
  onClearEntity: (entity: EntityType) => Promise<void> | void;
  onClearAll: () => Promise<void> | void;
  onShowToast?: (msg: string) => void;
}

export const ClearRecordsModal: React.FC<ClearRecordsModalProps> = ({
  isOpen,
  onClose,
  currentView,
  counts,
  onClearEntity,
  onClearAll,
  onShowToast
}) => {
  // Determine initial scope based on current view
  const getInitialScope = (): ClearScopeType => {
    if (currentView === 'vales') return 'vales';
    if (currentView === 'combustible') return 'expendio';
    if (currentView === 'flota' || currentView === 'choferes' || currentView === 'partes-diarios' || currentView === 'obras') {
      return 'other_entity';
    }
    return 'vales'; // Default to fuel vouchers as requested
  };

  const [selectedScope, setSelectedScope] = useState<ClearScopeType>(getInitialScope);
  const [selectedOtherEntity, setSelectedOtherEntity] = useState<EntityType>('partesDiarios');
  const [confirmText, setConfirmText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sync initial scope on open
  useEffect(() => {
    if (isOpen) {
      if (currentView === 'vales') {
        setSelectedScope('vales');
      } else if (currentView === 'combustible') {
        setSelectedScope('expendio');
      } else if (currentView === 'flota') {
        setSelectedScope('other_entity');
        setSelectedOtherEntity('flota');
      } else if (currentView === 'choferes') {
        setSelectedScope('other_entity');
        setSelectedOtherEntity('empleados');
      } else if (currentView === 'partes-diarios') {
        setSelectedScope('other_entity');
        setSelectedOtherEntity('partesDiarios');
      } else if (currentView === 'obras') {
        setSelectedScope('other_entity');
        setSelectedOtherEntity('obras');
      } else {
        setSelectedScope('vales');
      }
      setConfirmText('');
      setFeedback(null);
    }
  }, [isOpen, currentView]);

  if (!isOpen) return null;

  const totalAllCount = 
    (counts.flota || 0) + 
    (counts.empleados || 0) + 
    (counts.expendio || 0) + 
    (counts.vales || 0) + 
    (counts.partesDiarios || 0) + 
    (counts.obras || 0) +
    (counts.depositos || 0) +
    (counts.alquileres || 0) +
    (counts.ferreteria || 0);

  // Determine current target label and count
  const getTargetInfo = () => {
    switch (selectedScope) {
      case 'vales':
        return {
          title: 'Vales de Combustible',
          count: counts.vales,
          unit: 'vales emitidos y rendidos',
          safeNote: 'Tus registros de Expendio, Flota, Empleados y Partes NO se modificarán.',
          badge: 'Solo Vales'
        };
      case 'expendio':
        return {
          title: 'Expendio / Cargas de Combustible (22 Cols)',
          count: counts.expendio,
          unit: 'tickets y cargas de combustible',
          safeNote: 'Los Vales emitidos, Flota, Empleados y Partes se mantendrán intactos.',
          badge: 'Solo Expendio'
        };
      case 'both_fuel':
        return {
          title: 'Todo Combustible (Vales + Expendio)',
          count: counts.vales + counts.expendio,
          unit: 'registros de combustible totales',
          safeNote: 'La Flota, Nómina de Empleados, Partes Diarios y Obras se mantendrán intactos.',
          badge: 'Vales + Expendio'
        };
      case 'other_entity': {
        const entLabel = 
          selectedOtherEntity === 'flota' ? 'Flota de Equipos' :
          selectedOtherEntity === 'empleados' ? 'Nómina de Empleados' :
          selectedOtherEntity === 'partesDiarios' ? 'Partes Diarios de Trabajo' :
          'Obras y Proyectos';
        const entCount = 
          selectedOtherEntity === 'flota' ? counts.flota :
          selectedOtherEntity === 'empleados' ? counts.empleados :
          selectedOtherEntity === 'partesDiarios' ? counts.partesDiarios :
          counts.obras;
        return {
          title: entLabel,
          count: entCount,
          unit: 'registros de este módulo',
          safeNote: 'Los demás módulos del sistema se mantendrán intactos.',
          badge: entLabel
        };
      }
      case 'all':
        return {
          title: 'TODO EL SISTEMA (100% Base de Datos)',
          count: totalAllCount,
          unit: 'registros en total',
          safeNote: '¡ADVERTENCIA! Se vaciarán todas las tablas en Supabase y local.',
          badge: 'Sistema Completo'
        };
    }
  };

  const targetInfo = getTargetInfo();
  const isConfirmed = confirmText.trim().toUpperCase() === 'LIMPIAR';

  const handleExecuteClear = async () => {
    if (!isConfirmed) return;
    setIsProcessing(true);
    setFeedback(null);

    try {
      if (selectedScope === 'vales') {
        await onClearEntity('vales');
        if (onShowToast) {
          onShowToast('¡Todos los Vales de Combustible han sido eliminados de la Base de Datos y memoria local!');
        }
      } else if (selectedScope === 'expendio') {
        await onClearEntity('expendio');
        if (onShowToast) {
          onShowToast('¡Registros de Expendio de Combustible eliminados correctamente!');
        }
      } else if (selectedScope === 'both_fuel') {
        await onClearEntity('vales');
        await onClearEntity('expendio');
        if (onShowToast) {
          onShowToast('¡Vales y tickets de Expendio de Combustible eliminados con éxito!');
        }
      } else if (selectedScope === 'other_entity') {
        await onClearEntity(selectedOtherEntity);
        if (onShowToast) {
          onShowToast(`¡Registros de ${targetInfo.title} eliminados correctamente!`);
        }
      } else if (selectedScope === 'all') {
        await onClearAll();
        if (onShowToast) {
          onShowToast('¡Todos los registros del sistema han sido eliminados de la Base de Datos y memoria!');
        }
      }

      setFeedback({
        type: 'success',
        message: `¡Limpieza exitosa! ${targetInfo.title} quedó en 0 registros en la nube (Supabase) y local.`
      });

      setTimeout(() => {
        setIsProcessing(false);
        setConfirmText('');
        onClose();
      }, 1300);
    } catch (err: any) {
      setIsProcessing(false);
      setFeedback({
        type: 'error',
        message: `Error al vaciar los registros: ${err?.message || 'Error de conexión'}`
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#16191F] border border-rose-500/40 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative space-y-5 text-slate-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 shadow-inner">
            <Trash2 className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-wider mb-1">
              <AlertTriangle className="w-3 h-3" />
              Limpieza Selectiva • 100% Sincronizado en la Base de Datos
            </div>
            <h3 className="text-xl font-black text-white tracking-tight font-display">
              Limpiar Registros de Combustible
            </h3>
            <p className="text-xs text-slate-400">
              Selecciona qué módulo deseas vaciar. Solo se borrarán los datos seleccionados sin tocar el resto.
            </p>
          </div>
        </div>

        {feedback && (
          <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 border ${
            feedback.type === 'success' 
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}>
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Scope Selection Options */}
        <div className="space-y-2.5">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>Selecciona qué deseas vaciar:</span>
            <span className="text-[10px] text-amber-400 font-normal">Elige la opción que necesitas</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            
            {/* Opción 1: SOLO VALES DE COMBUSTIBLE */}
            <div
              onClick={() => setSelectedScope('vales')}
              className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                selectedScope === 'vales'
                  ? 'bg-rose-500/20 border-rose-500 ring-2 ring-rose-500/50 shadow-md'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedScope === 'vales' ? 'bg-rose-500 text-white font-bold' : 'bg-slate-800 text-amber-400'
                }`}>
                  <Ticket className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white">
                      Solo Vales de Combustible
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                      Vales Emitidos / Rendidos
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Vacía únicamente el libro de vales emitidos a choferes y estaciones.
                  </p>
                </div>
              </div>
              <div className="text-right pl-3 shrink-0">
                <span className="text-sm font-black font-mono text-white block">
                  {counts.vales}
                </span>
                <span className="text-[10px] text-slate-400">vales</span>
              </div>
            </div>

            {/* Opción 2: SOLO EXPENDIO (CARGAS/TICKETS 22 COLS) */}
            <div
              onClick={() => setSelectedScope('expendio')}
              className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                selectedScope === 'expendio'
                  ? 'bg-rose-500/20 border-rose-500 ring-2 ring-rose-500/50 shadow-md'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedScope === 'expendio' ? 'bg-rose-500 text-white font-bold' : 'bg-slate-800 text-amber-400'
                }`}>
                  <Fuel className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white">
                      Solo Expendio de Combustible
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold">
                      22 Columnas
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Vacía los tickets y cargas de combustible por vehículo y fecha.
                  </p>
                </div>
              </div>
              <div className="text-right pl-3 shrink-0">
                <span className="text-sm font-black font-mono text-white block">
                  {counts.expendio}
                </span>
                <span className="text-[10px] text-slate-400">tickets</span>
              </div>
            </div>

            {/* Opción 3: AMBOS COMBUSTIBLES (VALES + EXPENDIO) */}
            <div
              onClick={() => setSelectedScope('both_fuel')}
              className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                selectedScope === 'both_fuel'
                  ? 'bg-rose-500/20 border-rose-500 ring-2 ring-rose-500/50 shadow-md'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedScope === 'both_fuel' ? 'bg-rose-500 text-white font-bold' : 'bg-slate-800 text-purple-400'
                }`}>
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white">
                      Todo Combustible (Vales + Expendio)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Vacía vales emitidos y tickets de expendio en simultáneo.
                  </p>
                </div>
              </div>
              <div className="text-right pl-3 shrink-0">
                <span className="text-sm font-black font-mono text-white block">
                  {counts.vales + counts.expendio}
                </span>
                <span className="text-[10px] text-slate-400">registros</span>
              </div>
            </div>

            {/* Opción 4: OTRO MÓDULO O TODO EL SISTEMA (Plegable / Secundario) */}
            <div className="pt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedScope('other_entity')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition text-left flex items-center justify-between ${
                  selectedScope === 'other_entity'
                    ? 'bg-rose-500/15 border-rose-500/80 text-rose-300 font-bold'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Otro módulo (Partes/Flota/Empleados)</span>
                {selectedScope === 'other_entity' && <Check className="w-3.5 h-3.5 text-rose-400" />}
              </button>

              <button
                type="button"
                onClick={() => setSelectedScope('all')}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition text-left flex items-center gap-1.5 ${
                  selectedScope === 'all'
                    ? 'bg-rose-500/25 border-rose-500 text-white font-black'
                    : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:text-rose-400'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Todo el sistema</span>
              </button>
            </div>

            {selectedScope === 'other_entity' && (
              <div className="mt-1 bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-3">
                <label className="text-xs text-slate-400 whitespace-nowrap">Módulo:</label>
                <select
                  value={selectedOtherEntity}
                  onChange={(e) => setSelectedOtherEntity(e.target.value as EntityType)}
                  className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 font-medium"
                >
                  <option value="partesDiarios">Partes Diarios de Trabajo ({counts.partesDiarios} reg.)</option>
                  <option value="flota">Flota de Vehículos ({counts.flota} reg.)</option>
                  <option value="empleados">Nómina de Empleados ({counts.empleados} reg.)</option>
                  <option value="obras">Obras y Proyectos ({counts.obras} reg.)</option>
                </select>
              </div>
            )}

          </div>
        </div>

        {/* Protection Assurance Banner */}
        <div className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-slate-300">
            <span className="font-bold text-emerald-300">Protección Activa: </span>
            {targetInfo.safeNote}
          </div>
        </div>

        {/* Security Confirmation Input */}
        <div className="space-y-2 bg-rose-950/20 border border-rose-900/40 p-3.5 rounded-xl">
          <label className="text-xs font-bold text-rose-300 block">
            Confirmación requerida para vaciar {targetInfo.title}:
          </label>
          <p className="text-[11px] text-slate-400">
            Escribe <span className="font-mono font-bold text-white bg-black/50 px-1.5 py-0.5 rounded border border-rose-500/40">LIMPIAR</span> para confirmar el vaciado de <strong className="text-rose-300 font-mono">{targetInfo.count} {targetInfo.unit}</strong>:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Escribe LIMPIAR aquí..."
            disabled={isProcessing}
            className="w-full bg-[#0F1115] border border-rose-800/60 focus:border-rose-400 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none uppercase"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleExecuteClear}
            disabled={!isConfirmed || isProcessing || targetInfo.count === 0}
            className={`px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer shadow-lg ${
              isConfirmed && !isProcessing && targetInfo.count > 0
                ? 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-rose-600/30 ring-2 ring-rose-400'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            <Trash2 className="w-4 h-4 stroke-[2.5]" />
            <span>
              {isProcessing 
                ? 'Eliminando de la base de datos...' 
                : `Confirmar y Vaciar (${targetInfo.count})`}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};
