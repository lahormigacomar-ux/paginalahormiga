import React, { useEffect, useMemo, useState } from 'react';
import { ClothingDeliveryReason, Employee, StockItem } from '../../types';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  Shirt,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';

export interface ClothingDeliveryLineInput {
  stockItemId: string;
  cantidad: number;
  talle: string;
}

export interface ClothingDeliverySubmitPayload {
  receiverName: string;
  receiverLegajo?: string;
  receiverDni?: string;
  receiverSector?: string;
  fecha: string;
  hora: string;
  motivoEntrega: ClothingDeliveryReason;
  devuelveAnterior: boolean;
  responsableEntrega: string;
  observaciones: string;
  downloadPdfAfter: boolean;
  lines: ClothingDeliveryLineInput[];
}

interface IndumentariaDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: StockItem[];
  employees: Employee[];
  defaultItem?: StockItem | null;
  defaultResponsable?: string;
  onConfirmDelivery: (payload: ClothingDeliverySubmitPayload) => void;
}

export const CLOTHING_MOTIVO_LABELS: Record<ClothingDeliveryReason, string> = {
  INGRESO_INICIAL: 'Dotación Inicial / Ingreso',
  REPOSICION_DESGASTE: 'Reposición por desgaste',
  CAMBIO_TALLE: 'Cambio de talle',
  ESTACIONAL: 'Cambio estacional (Invierno/Verano)',
  EXTRAVIO: 'Reposición por extravío / rotura',
  OTRO: 'Otro motivo',
};

export const IndumentariaDeliveryModal: React.FC<IndumentariaDeliveryModalProps> = ({
  isOpen,
  onClose,
  items,
  employees,
  defaultItem,
  defaultResponsable = 'Encargado de Depósito',
  onConfirmDelivery,
}) => {
  const [receiverMode, setReceiverMode] = useState<'ROSTER' | 'MANUAL'>('ROSTER');
  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualDni, setManualDni] = useState('');
  const [manualSector, setManualSector] = useState('Obra / Campo');

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState(() => new Date().toTimeString().slice(0, 5));
  const [motivoEntrega, setMotivoEntrega] = useState<ClothingDeliveryReason>('INGRESO_INICIAL');
  const [devuelveAnterior, setDevuelveAnterior] = useState(false);
  const [responsableEntrega, setResponsableEntrega] = useState(defaultResponsable);
  const [observaciones, setObservaciones] = useState('');
  const [downloadPdfAfter, setDownloadPdfAfter] = useState(true);
  const [formError, setFormError] = useState('');

  const [lines, setLines] = useState<ClothingDeliveryLineInput[]>([]);

  const sortedEmployees = useMemo(() => {
    const activeFirst = [...employees].sort((a, b) => {
      if (Boolean(a.archivado) !== Boolean(b.archivado)) {
        return a.archivado ? 1 : -1;
      }
      return (a.nombreApellido || '').localeCompare(b.nombreApellido || '');
    });
    const q = empSearch.trim().toLowerCase();
    if (!q) return activeFirst;
    return activeFirst.filter(e =>
      (e.nombreApellido || '').toLowerCase().includes(q) ||
      (e.legajo || '').toLowerCase().includes(q) ||
      (e.dni || '').toLowerCase().includes(q) ||
      (e.sector || '').toLowerCase().includes(q)
    );
  }, [employees, empSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const now = new Date();
    setFecha(now.toISOString().slice(0, 10));
    setHora(now.toTimeString().slice(0, 5));
    setReceiverMode('ROSTER');
    setEmpSearch('');
    setSelectedEmpId('');
    setManualName('');
    setManualDni('');
    setManualSector('Obra / Campo');
    setMotivoEntrega('INGRESO_INICIAL');
    setDevuelveAnterior(false);
    setResponsableEntrega(defaultResponsable || 'Encargado de Depósito');
    setObservaciones('');
    setDownloadPdfAfter(true);
    setFormError('');

    const initialItem = defaultItem || items[0];
    if (initialItem) {
      setLines([
        {
          stockItemId: initialItem.id,
          cantidad: 1,
          talle: initialItem.talle || '',
        },
      ]);
    } else {
      setLines([]);
    }
  }, [isOpen, defaultItem, items, defaultResponsable]);

  if (!isOpen) return null;

  const selectedEmployee = employees.find(e => e.id === selectedEmpId || e.legajo === selectedEmpId);

  const handleAddLine = () => {
    const usedIds = new Set(lines.map(l => l.stockItemId));
    const nextItem = items.find(i => !usedIds.has(i.id)) || items[0];
    if (!nextItem) return;
    setLines(prev => [
      ...prev,
      {
        stockItemId: nextItem.id,
        cantidad: 1,
        talle: nextItem.talle || '',
      },
    ]);
  };

  const handleChangeLineItem = (idx: number, newItemId: string) => {
    const target = items.find(i => i.id === newItemId);
    setLines(prev =>
      prev.map((l, i) =>
        i === idx
          ? { ...l, stockItemId: newItemId, talle: target?.talle || l.talle || '' }
          : l
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    let receiverName = '';
    let receiverLegajo: string | undefined;
    let receiverDni: string | undefined;
    let receiverSector: string | undefined;

    if (receiverMode === 'ROSTER') {
      if (!selectedEmployee) {
        setFormError('Seleccioná el empleado que recibe la indumentaria o usá Carga Manual.');
        return;
      }
      receiverName = selectedEmployee.nombreApellido;
      receiverLegajo = selectedEmployee.legajo;
      receiverDni = selectedEmployee.dni || selectedEmployee.cuit;
      receiverSector = selectedEmployee.sector || selectedEmployee.categoria;
    } else {
      if (!manualName.trim()) {
        setFormError('Ingresá el nombre y apellido de quien recibe la indumentaria.');
        return;
      }
      receiverName = manualName.trim();
      receiverLegajo = 'EVENTUAL';
      receiverDni = manualDni.trim() || undefined;
      receiverSector = manualSector.trim() || undefined;
    }

    const validLines = lines.filter(l => l.stockItemId && Number(l.cantidad) > 0);
    if (validLines.length === 0) {
      setFormError('Agregá al menos una prenda o EPP con cantidad mayor a cero.');
      return;
    }

    onConfirmDelivery({
      receiverName,
      receiverLegajo,
      receiverDni,
      receiverSector,
      fecha,
      hora,
      motivoEntrega,
      devuelveAnterior,
      responsableEntrega: responsableEntrega.trim() || 'Encargado de Depósito',
      observaciones: observaciones.trim(),
      downloadPdfAfter,
      lines: validLines.map(l => ({
        stockItemId: l.stockItemId,
        cantidad: Number(l.cantidad),
        talle: l.talle.trim(),
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-[#0F1115] px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Shirt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-tight">
                Entregar Ropa / Indumentaria / EPP al Personal
              </h3>
              <p className="text-xs text-slate-400">
                Descuenta del stock del depósito y registra la entrega en el legajo del trabajador.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{formError}</span>
            </div>
          )}

          {/* Receiver Selection */}
          <div className="bg-[#0F1115] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                Trabajador / Empleado Receptor *
              </span>

              <div className="inline-flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setReceiverMode('ROSTER')}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                    receiverMode === 'ROSTER'
                      ? 'bg-[#F0C800] text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Nómina de Personal
                </button>
                <button
                  type="button"
                  onClick={() => setReceiverMode('MANUAL')}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                    receiverMode === 'MANUAL'
                      ? 'bg-[#F0C800] text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  A Prueba / Eventual
                </button>
              </div>
            </div>

            {receiverMode === 'ROSTER' ? (
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="Filtrar empleado por nombre, legajo, DNI o sector..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                  />
                </div>

                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white font-semibold focus:outline-none focus:border-[#F0C800]"
                >
                  <option value="">-- Seleccionar empleado ({sortedEmployees.length} disponibles) --</option>
                  {sortedEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombreApellido} — Leg: {emp.legajo || 'S/D'} ({emp.sector || emp.categoria}){emp.archivado ? ' [ARCHIVADO]' : ''}
                    </option>
                  ))}
                </select>

                {selectedEmployee && (
                  <div className="flex flex-wrap items-center gap-4 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                    <span>Legajo: <strong className="font-mono text-amber-400">{selectedEmployee.legajo || 'S/D'}</strong></span>
                    <span>DNI: <strong className="font-mono text-white">{selectedEmployee.dni || selectedEmployee.cuit || 'S/D'}</strong></span>
                    <span>Sector: <strong className="text-white">{selectedEmployee.sector || selectedEmployee.categoria}</strong></span>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-[11px] text-slate-400 mb-1">Nombre y Apellido *</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="ej: Juan Pérez (Prueba)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">DNI (Opcional)</label>
                  <input
                    type="text"
                    value={manualDni}
                    onChange={(e) => setManualDni(e.target.value)}
                    placeholder="ej: 35.123.456"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#F0C800]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Sector / Obra</label>
                  <input
                    type="text"
                    value={manualSector}
                    onChange={(e) => setManualSector(e.target.value)}
                    placeholder="ej: Obra / Taller"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Delivery Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Fecha *</label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-white focus:outline-none focus:border-[#F0C800]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Hora</label>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-white focus:outline-none focus:border-[#F0C800]"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Motivo de Entrega *</label>
              <select
                value={motivoEntrega}
                onChange={(e) => setMotivoEntrega(e.target.value as ClothingDeliveryReason)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-[#F0C800]"
              >
                {Object.entries(CLOTHING_MOTIVO_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Garment / EPP Lines */}
          <div className="bg-[#0F1115] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Prendas / Calzado / EPP a Entregar ({lines.length})
              </span>
              <button
                type="button"
                onClick={handleAddLine}
                disabled={items.length === 0}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 transition flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar otra prenda
              </button>
            </div>

            {items.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-slate-700 text-center text-slate-400">
                Todavía no hay prendas ni EPP cargados en el Depósito de Indumentaria. Cargá primero un artículo desde "+ Nueva Prenda / EPP".
              </div>
            ) : (
              <div className="space-y-2.5">
                {lines.map((line, idx) => {
                  const selectedItem = items.find(i => i.id === line.stockItemId);
                  const exceedsStock = selectedItem ? Number(line.cantidad) > selectedItem.stockActual : false;

                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-slate-950/90 border border-slate-800 rounded-lg p-2.5">
                      <div className="col-span-12 sm:col-span-6">
                        <label className="block text-[10px] text-slate-500 mb-1">Prenda / EPP *</label>
                        <select
                          value={line.stockItemId}
                          onChange={(e) => handleChangeLineItem(idx, e.target.value)}
                          className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-semibold focus:outline-none focus:border-[#F0C800]"
                        >
                          {items.map(it => (
                            <option key={it.id} value={it.id}>
                              [{it.codigo}] {it.nombre}{it.talle ? ` (Talle ${it.talle})` : ''} — Stock: {it.stockActual} {it.unidad}
                            </option>
                          ))}
                        </select>
                        {exceedsStock && selectedItem && (
                          <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            Supera stock actual ({selectedItem.stockActual} {selectedItem.unidad}); quedará en 0.
                          </p>
                        )}
                      </div>

                      <div className="col-span-5 sm:col-span-3">
                        <label className="block text-[10px] text-slate-500 mb-1">Talle / Medida</label>
                        <input
                          type="text"
                          value={line.talle}
                          onChange={(e) =>
                            setLines(prev =>
                              prev.map((l, i) => (i === idx ? { ...l, talle: e.target.value } : l))
                            )
                          }
                          placeholder="ej: L, 42, Único"
                          className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-[#F0C800]"
                        />
                      </div>

                      <div className="col-span-5 sm:col-span-2">
                        <label className="block text-[10px] text-slate-500 mb-1">Cant.</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={line.cantidad}
                          onChange={(e) =>
                            setLines(prev =>
                              prev.map((l, i) =>
                                i === idx ? { ...l, cantidad: Math.max(1, parseInt(e.target.value, 10) || 1) } : l
                              )
                            )
                          }
                          className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-mono font-bold tabular-nums text-white text-right focus:outline-none focus:border-[#F0C800]"
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-1 flex justify-end pt-5">
                        <button
                          type="button"
                          onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                          disabled={lines.length <= 1}
                          className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                          title="Quitar línea"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Extra fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Responsable que Entrega</label>
              <input
                type="text"
                value={responsableEntrega}
                onChange={(e) => setResponsableEntrega(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                placeholder="ej: Pañolero / Seguridad e Higiene"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-200 select-none bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 w-full">
                <input
                  type="checkbox"
                  checked={devuelveAnterior}
                  onChange={(e) => setDevuelveAnterior(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900 text-[#F0C800] focus:ring-0"
                />
                <span>El trabajador devuelve prenda / EPP usado anterior</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Observaciones</label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="ej: Entrega de invierno completa / Firmó planilla física..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
            />
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
              <input
                type="checkbox"
                checked={downloadPdfAfter}
                onChange={(e) => setDownloadPdfAfter(e.target.checked)}
                className="rounded border-slate-600 bg-slate-900 text-[#F0C800] focus:ring-0"
              />
              <span>Descargar Constancia de Entrega (PDF Res. SRT 299/11) al guardar</span>
            </label>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={items.length === 0}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] transition shadow-lg shadow-[#F0C800]/15 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Entrega al Personal
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
