import React, { useMemo, useState } from 'react';
import {
  Obra,
  FuelDispensary
} from '../../types';
import { formatCurrency } from '../../services/storage';
import {
  ObraRentabilidadSummary,
  getDefaultObraCostosConfig
} from '../../utils/obraCostosEngine';
import {
  Fuel,
  Search,
  Gauge,
  Truck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FolderOpen
} from 'lucide-react';

interface ObraCombustibleTabProps {
  obra: Obra;
  summary: ObraRentabilidadSummary;
  fuelVouchers: FuelDispensary[];
  selectedContenedorId?: string;
  onChangeContenedorId?: (id: string) => void;
  onSaveObra: (updatedObra: Obra) => Promise<{ ok: boolean; error?: string }>;
}

export const ObraCombustibleTab: React.FC<ObraCombustibleTabProps> = ({
  obra,
  summary,
  fuelVouchers,
  selectedContenedorId = 'ALL',
  onChangeContenedorId,
  onSaveObra
}) => {
  const periodos = obra.periodosLegajo || [];
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEquipo, setSelectedEquipo] = useState<string>('ALL');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cfg = useMemo(() => getDefaultObraCostosConfig(obra.costosConfig), [obra.costosConfig]);

  const vouchersById = useMemo(() => {
    const map = new Map<string, FuelDispensary>();
    fuelVouchers.forEach((v) => map.set(v.id, v));
    return map;
  }, [fuelVouchers]);

  const activeFuel = useMemo(
    () => summary.combustiblesAuto.filter((c) => !c.excluded),
    [summary.combustiblesAuto]
  );

  const totalLitros = useMemo(
    () => activeFuel.reduce((acc, c) => acc + c.litros, 0),
    [activeFuel]
  );
  const totalHsHorometro = useMemo(
    () => activeFuel.reduce((acc, c) => acc + (c.horasHorometroObra || 0), 0),
    [activeFuel]
  );
  const totalHsPartes = useMemo(
    () => summary.equiposEnObra.reduce((acc, e) => acc + e.horasTotal, 0),
    [summary.equiposEnObra]
  );

  const equipoOptions = useMemo(
    () => Array.from(new Set(summary.combustiblesAuto.map((c) => c.equipoLabel).filter(Boolean))),
    [summary.combustiblesAuto]
  );

  const filteredFuel = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return summary.combustiblesAuto.filter((c) => {
      if (selectedEquipo !== 'ALL' && c.equipoLabel !== selectedEquipo) return false;
      if (!q) return true;
      const voucher = vouchersById.get(c.voucherId);
      return (
        c.equipoLabel.toLowerCase().includes(q) ||
        c.tipoCombustible.toLowerCase().includes(q) ||
        c.deposito.toLowerCase().includes(q) ||
        (c.fecha || '').toLowerCase().includes(q) ||
        (voucher?.numTicket || voucher?.numComprobante || '').toLowerCase().includes(q) ||
        (voucher?.despachante || '').toLowerCase().includes(q)
      );
    });
  }, [summary.combustiblesAuto, selectedEquipo, searchTerm, vouchersById]);

  const equiposConCombustible = useMemo(
    () => summary.equiposEnObra.filter((e) => (e.litrosAsignados || 0) > 0 || (e.cargasCount || 0) > 0),
    [summary.equiposEnObra]
  );

  const handleToggleExclude = async (excludeKey: string) => {
    const current = cfg.itemsExcluidosIds || [];
    const nextExcluded = current.includes(excludeKey)
      ? current.filter((k) => k !== excludeKey)
      : [...current, excludeKey];
    setIsSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    const res = await onSaveObra({
      ...obra,
      costosConfig: { ...cfg, itemsExcluidosIds: nextExcluded }
    });
    setIsSaving(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'No se pudo actualizar en Supabase.');
    } else {
      setFeedback('Imputación de combustible actualizada en Supabase.');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {errorMsg && (
        <div className="bg-red-500/15 border border-red-500/40 text-red-200 rounded-xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {feedback && (
        <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
            <Fuel className="w-3.5 h-3.5 text-amber-400" />
            Cargas / Litros en Obra
          </span>
          <span className="text-xl font-mono font-bold text-amber-300 mt-1 block">
            {totalLitros.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L
          </span>
          <span className="text-[11px] text-slate-400">{activeFuel.length} cargas imputadas</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
            Hs Reales Horómetro
          </span>
          <span className="text-xl font-mono font-bold text-emerald-400 mt-1 block">
            +{totalHsHorometro.toFixed(1)} hs
          </span>
          <span className="text-[11px] text-slate-400">
            vs {totalHsPartes.toFixed(1)} hs en partes
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
            Promedio $/Litro
          </span>
          <span className="text-xl font-mono font-bold text-white mt-1 block">
            {totalLitros > 0 ? formatCurrency(summary.totalCombustible / totalLitros) : '—'}
          </span>
          <span className="text-[11px] text-slate-400">Incluye manuales si hay</span>
        </div>

        <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-amber-300 font-bold block">
            Costo Combustible Obra
          </span>
          <span className="text-xl font-mono font-bold text-amber-400 mt-1 block">
            {formatCurrency(summary.totalCombustible)}
          </span>
          <span className="text-[11px] text-slate-400">Prorrateado por tramo</span>
        </div>
      </div>

      {/* Equipment Fuel Breakdown */}
      {equiposConCombustible.length > 0 && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h5 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Truck className="w-4 h-4" />
              Consumo por Máquina / Camión en esta Obra
            </h5>
            <span className="text-[11px] text-slate-400">
              Cruce automático por tramos entre cargas y horas/días en obra
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {equiposConCombustible.map((eq) => (
              <div
                key={eq.key}
                className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="text-white font-bold truncate">{eq.label}</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {eq.cargasCount || 0} carga(s) • {eq.horasTotal.toFixed(1)} hs partes
                    {eq.horometroInicial && eq.horometroFinal
                      ? ` • Horóm. ${eq.horometroInicial}→${eq.horometroFinal}`
                      : ''}
                  </div>
                </div>
                <div className="text-right font-mono shrink-0">
                  <div className="text-amber-300 font-black">
                    {(eq.litrosAsignados || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })} L
                  </div>
                  {eq.consumoLitrosHoraReal ? (
                    <div className="text-[10px] text-emerald-400">
                      {eq.consumoLitrosHoraReal} L/h real
                    </div>
                  ) : eq.horasHorometroReal ? (
                    <div className="text-[10px] text-emerald-400">
                      +{eq.horasHorometroReal} hs horóm.
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Equipment Filter */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar equipo, depósito, ticket o fecha..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {periodos.length > 0 && onChangeContenedorId && (
            <div className="flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={selectedContenedorId}
                onChange={(e) => onChangeContenedorId(e.target.value)}
                className={`bg-slate-950 rounded-xl px-2.5 py-2 text-xs font-semibold cursor-pointer border ${
                  selectedContenedorId !== 'ALL'
                    ? 'border-amber-500/60 text-amber-200'
                    : 'border-slate-700 text-white'
                }`}
              >
                <option value="ALL">Contenedor: Toda la obra</option>
                {periodos.map((per) => (
                  <option key={per.id} value={per.id}>
                    📦 {per.titulo}
                  </option>
                ))}
              </select>
              {selectedContenedorId !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => onChangeContenedorId('ALL')}
                  title="Quitar filtro de contenedor"
                  className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <select
            value={selectedEquipo}
            onChange={(e) => setSelectedEquipo(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          >
            <option value="ALL">Todos los equipos ({summary.combustiblesAuto.length})</option>
            {equipoOptions.map((eq) => (
              <option key={eq} value={eq}>
                {eq}
              </option>
            ))}
          </select>
          {isSaving && <Loader2 className="w-4 h-4 animate-spin text-amber-400" />}
        </div>
      </div>

      {/* Fuel Loads Table */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
        {filteredFuel.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No se encontraron cargas de combustible vinculadas a las máquinas y fechas de esta obra.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/90 border-b border-slate-800 text-[11px] uppercase text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Inc.</th>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Equipo</th>
                  <th className="py-2.5 px-3">Depósito / Ticket</th>
                  <th className="py-2.5 px-3">Horómetro / Odómetro</th>
                  <th className="py-2.5 px-3">Prorrateo Obra</th>
                  <th className="py-2.5 px-3 text-right">Litros Obra</th>
                  <th className="py-2.5 px-3 text-right">$/L</th>
                  <th className="py-2.5 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredFuel.map((c) => {
                  const voucher = vouchersById.get(c.voucherId);
                  const isProrated =
                    c.proporcionObra !== undefined && c.proporcionObra < 0.999;
                  const pctLabel =
                    c.proporcionObra !== undefined ? Math.round(c.proporcionObra * 100) : 100;
                  return (
                    <tr
                      key={c.excludeKey}
                      className={`hover:bg-slate-800/30 transition ${
                        c.excluded ? 'opacity-40 line-through' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={!c.excluded}
                          disabled={isSaving}
                          onChange={() => handleToggleExclude(c.excludeKey)}
                          className="accent-amber-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                        {c.fecha}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-white font-semibold">{c.equipoLabel}</div>
                        <div className="text-[10px] text-slate-400">{c.tipoCombustible}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-200">{c.deposito || voucher?.deposito || '—'}</div>
                        {(voucher?.numTicket || voucher?.numComprobante || voucher?.despachante) && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {voucher?.numTicket
                              ? `Ticket ${voucher.numTicket}`
                              : voucher?.numComprobante
                              ? `Comp. ${voucher.numComprobante}`
                              : ''}
                            {voucher?.despachante ? ` • ${voucher.despachante}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        {c.horometroLectura ? (
                          <div className="space-y-0.5">
                            <span className="text-slate-200 block">
                              Lect.: <strong>{c.horometroLectura.toLocaleString('es-AR')}</strong>
                            </span>
                            {c.horasHorometroObra ? (
                              <span className="text-[10px] text-emerald-400 font-bold block">
                                +{c.horasHorometroObra} hs reales en obra
                                {isProrated && c.horasHorometroCarga
                                  ? ` (de ${c.horasHorometroCarga} hs)`
                                  : ''}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {isProrated ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono text-[10px] font-bold">
                              Prorrateo {pctLabel}% ({c.horasObraEnTramo}/{c.horasTotalesEnTramo} hs)
                            </span>
                            {c.obrasEnTramo && c.obrasEnTramo.length > 1 && (
                              <div
                                className="text-[10px] text-slate-400 truncate max-w-xs"
                                title={c.obrasEnTramo.join(' • ')}
                              >
                                Compartido: {c.obrasEnTramo.join(' / ')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-bold">
                            100% Exclusivo Obra
                            {c.partesObraEnTramo ? ` (${c.partesObraEnTramo} partes)` : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        <span className="text-amber-300 font-bold">{c.litros} L</span>
                        {isProrated && c.litrosTotalesCarga ? (
                          <span className="block text-[10px] text-slate-400">
                            de {c.litrosTotalesCarga} L
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400 whitespace-nowrap">
                        {formatCurrency(c.precioUnitario)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-white whitespace-nowrap">
                        {formatCurrency(c.monto)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
