import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title?: string;
  itemName: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title = '¿Realmente desea eliminar este registro?',
  itemName,
  description = 'Esta acción eliminará el registro de forma permanente en la base de datos de Supabase PostgreSQL y no se podrá deshacer.',
  confirmLabel = 'Aceptar y Eliminar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[#16191F] border border-rose-500/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Top Header */}
        <div className="bg-rose-950/40 border-b border-rose-500/20 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">
              Confirmación de Eliminación
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <h4 className="text-base font-black text-white leading-snug">
              {title}
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              {description}
            </p>
          </div>

          {itemName && (
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs font-bold text-amber-300 break-words">
                {itemName}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-lg shadow-rose-950/50 border border-rose-500 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{confirmLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
