import React, { useMemo, useState } from 'react';
import {
  Obra,
  ObraCostosConfig,
  ParteDiario
} from '../../types';
import { formatCurrency } from '../../services/storage';
import {
  ObraRentabilidadSummary,
  getDefaultObraCostosConfig,
  normalizeObraDateKey
} from '../../utils/obraCostosEngine';
import {
  Users,
  Search,
  Clock,
  Calendar,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FolderOpen
} from 'lucide-react';

interface ObraPersonalTabProps {
  obra: Obra;
  summary: ObraRentabilidadSummary;
  obraPartes: ParteDiario[];
  selectedContenedorId?: string;
  onChangeContenedorId?: (id: string) => void;
  onSaveObra: (updatedObra: Obra) => Promise<{ ok: boolean; error?: string }>;
}

const norm = (s?: string) => (s ? s.trim().toUpperCase().replace(/\s+/g, ' ') : '');

export const ObraPersonalTab: React.FC<ObraPersonalTabProps> = ({
  obra,
  summary,
  obraPartes,
  selectedContenedorId = 'ALL',
  onChangeContenedorId,
  onSaveObra
}) => {
  const periodos = obra.periodosLegajo || [];
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editModo, setEditModo] = useState<'DIA' | 'HORA'>('DIA');
  const [editValor, setEditValor] = useState<number>(0);

  const cfg = useMemo(() => getDefaultObraCostosConfig(obra.costosConfig), [obra.costosConfig]);

  // Agrupar partes de esta obra por operario para mostrar equipos operados, viajes y rango de fechas
  const partesStatsByEmployee = useMemo(() => {
    const map = new Map<
      string,
      {
        equipos: Set<string>;
        viajes: number;
        partesCount: number;
        minDate: string;
        maxDate: string;
      }
    >();

    obraPartes.forEach((p) => {
      const nameKey = norm(p.nombreApellido || p.driverName || '');
      const codeKey = norm(p.codigoEmpleado || '');
      const keys = [nameKey, codeKey].filter(Boolean);
      if (keys.length === 0) return;

      const eqLabel = p.marcaModelo || p.codigoEquipo || '';
      const dateKey = normalizeObraDateKey(p.fecha);
      const viajes = p.tipo === 'VIAJES' ? Number(p.viajesCantidad || p.cantidad || 1) : 0;

      keys.forEach((k) => {
        const cur = map.get(k) || {
          equipos: new Set<string>(),
          viajes: 0,
          partesCount: 0,
          minDate: '',
          maxDate: ''
        };
        if (eqLabel) cur.equipos.add(eqLabel);
        cur.viajes += viajes;
        cur.partesCount += 1;
        if (dateKey && (!cur.minDate || dateKey < cur.minDate)) cur.minDate = dateKey;
        if (dateKey && (!cur.maxDate || dateKey > cur.maxDate)) cur.maxDate = dateKey;
        map.set(k, cur);
      });
    });

    return map;
  }, [obraPartes]);

  const activeSueldos = useMemo(
    () => summary.sueldosAuto.filter((s) => !s.excluded),
    [summary.sueldosAuto]
  );

  const totalDias = useMemo(
    () => activeSueldos.reduce((acc, s) => acc + s.diasTrabajados, 0),
    [activeSueldos]
  );
  const totalHoras = useMemo(
    () => activeSueldos.reduce((acc, s) => acc + s.horasTrabajadas, 0),
    [activeSueldos]
  );

  const filteredSueldos = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return summary.sueldosAuto;
    return summary.sueldosAuto.filter((s) => {
      const empStats = partesStatsByEmployee.get(norm(s.empleadoNombre));
      const eqStr = empStats ? Array.from(empStats.equipos).join(' ').toLowerCase() : '';
      return (
        s.empleadoNombre.toLowerCase().includes(q) ||
        s.categoriaNombre.toLowerCase().includes(q) ||
        s.fuenteTarifa.toLowerCase().includes(q) ||
        eqStr.includes(q)
      );
    });
  }, [summary.sueldosAuto, searchTerm, partesStatsByEmployee]);

  const persistConfigPatch = async (nextCfg: ObraCostosConfig, okMsg: string) => {
    setIsSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    const res = await onSaveObra({ ...obra, costosConfig: nextCfg });
    setIsSaving(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'No se pudo guardar en Supabase.');
      return false;
    }
    setFeedback(okMsg);
    return true;
  };

  const handleToggleExclude = async (excludeKey: string) => {
    const current = cfg.itemsExcluidosIds || [];
    const nextExcluded = current.includes(excludeKey)
      ? current.filter((id) => id !== excludeKey)
      : [...current, excludeKey];
    await persistConfigPatch(
      { ...cfg, itemsExcluidosIds: nextExcluded },
      'Inclusión de operario actualizada en Supabase.'
    );
  };

  const handleSaveOverride = async (empleadoKey: string) => {
    const val = Number(editValor) || 0;
    const prevOverrides = cfg.tarifasEmpleadoOverride || {};
    const nextOverrides = {
      ...prevOverrides,
      [empleadoKey]: {
        modo: editModo,
        costoPorDia: editModo === 'DIA' ? val : undefined,
        costoPorHora: editModo === 'HORA' ? val : undefined
      }
    };
    const ok = await persistConfigPatch(
      { ...cfg, tarifasEmpleadoOverride: nextOverrides },
      'Tarifa de operario guardada en Supabase.'
    );
    if (ok) setEditingKey(null);
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
            <Users className="w-3.5 h-3.5 text-blue-400" />
            Operarios en Obra
          </span>
          <span className="text-xl font-mono font-bold text-white mt-1 block">
            {activeSueldos.length}
            {summary.sueldosAuto.length !== activeSueldos.length && (
              <span className="text-xs text-slate-500 font-normal ml-1">
                / {summary.sueldosAuto.length}
              </span>
            )}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            Jornadas / Días
          </span>
          <span className="text-xl font-mono font-bold text-amber-300 mt-1 block">
            {totalDias} d
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            Horas Trabajadas
          </span>
          <span className="text-xl font-mono font-bold text-cyan-300 mt-1 block">
            {totalHoras.toFixed(1)} hs
          </span>
        </div>

        <div className="bg-slate-900/80 border border-blue-500/30 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-blue-300 font-bold block">
            Costo Proporcional Obra
          </span>
          <span className="text-xl font-mono font-bold text-blue-400 mt-1 block">
            {formatCurrency(summary.totalSueldos)}
          </span>
        </div>
      </div>

      {/* Controls & Search */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar operario, categoría o máquina operada..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {periodos.length > 0 && onChangeContenedorId && (
            <div className="flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={selectedContenedorId}
                onChange={(e) => onChangeContenedorId(e.target.value)}
                className={`bg-slate-950 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer border ${
                  selectedContenedorId !== 'ALL'
                    ? 'border-amber-500/60 text-amber-200'
                    : 'border-slate-700 text-slate-200'
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
                  className="p-1 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <span className="text-[11px] font-bold text-slate-400 uppercase">Base Sueldos:</span>
          <select
            value={cfg.modoCalculoSueldosObra || 'LIQUIDACION_TOTAL'}
            disabled={isSaving}
            onChange={(e) =>
              persistConfigPatch(
                {
                  ...cfg,
                  modoCalculoSueldosObra: e.target.value as NonNullable<
                    ObraCostosConfig['modoCalculoSueldosObra']
                  >
                },
                'Modo de cálculo de sueldos actualizado en Supabase.'
              )
            }
            className="bg-slate-950 border border-blue-500/40 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-200 cursor-pointer"
          >
            <option value="LIQUIDACION_TOTAL">
              Liquidación Real Total ÷ {cfg.diasLaborablesMes || 24} días
            </option>
            <option value="LIQUIDACION_BASICO">
              Solo Básico Planilla ÷ {cfg.diasLaborablesMes || 24} días
            </option>
            <option value="JORNAL_BASE_SHEET">Valor Base Unidad ($60.000/día)</option>
            <option value="REFERENCIA_MANUAL">
              Referencia Manual ({formatCurrency(cfg.sueldoMensualDefault || 950000)})
            </option>
          </select>
          {isSaving && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
        {filteredSueldos.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No se encontraron operarios registrados en los partes o contratos de esta obra.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/90 border-b border-slate-800 text-[11px] uppercase text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Inc.</th>
                  <th className="py-2.5 px-3">Operario / Categoría</th>
                  <th className="py-2.5 px-3">Equipos Operados en Obra</th>
                  <th className="py-2.5 px-3 text-center">Días / Hs / Viajes</th>
                  <th className="py-2.5 px-3">Fuente Tarifa (Liquidación Real)</th>
                  <th className="py-2.5 px-3 text-right">Valor Aplicado</th>
                  <th className="py-2.5 px-3 text-right">Proporcional Obra</th>
                  <th className="py-2.5 px-3 text-right">Ajustar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredSueldos.map((s) => {
                  const isEditing = editingKey === s.empleadoKey;
                  const empStats = partesStatsByEmployee.get(norm(s.empleadoNombre));
                  const equiposList = empStats ? Array.from(empStats.equipos) : [];
                  return (
                    <tr
                      key={s.excludeKey}
                      className={`hover:bg-slate-800/30 transition ${
                        s.excluded ? 'opacity-40 line-through' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={!s.excluded}
                          disabled={isSaving}
                          onChange={() => handleToggleExclude(s.excludeKey)}
                          className="accent-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-white font-semibold">{s.empleadoNombre}</div>
                        <div className="text-[10px] text-slate-400">{s.categoriaNombre}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        {equiposList.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {equiposList.slice(0, 3).map((eq) => (
                              <span
                                key={eq}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-200"
                              >
                                <Wrench className="w-2.5 h-2.5 text-amber-400" />
                                {eq}
                              </span>
                            ))}
                            {equiposList.length > 3 && (
                              <span className="text-[10px] text-slate-400">
                                +{equiposList.length - 3} más
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Por contrato</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                        <div>
                          <span className="text-amber-300 font-bold">{s.diasTrabajados} d</span>
                          <span className="text-slate-500"> / {s.horasTrabajadas.toFixed(1)} hs</span>
                          {empStats && empStats.viajes > 0 && (
                            <span className="text-blue-300 ml-1">• {empStats.viajes} vj</span>
                          )}
                        </div>
                        {empStats?.minDate && (
                          <div className="text-[10px] text-slate-500">
                            {empStats.minDate === empStats.maxDate
                              ? empStats.minDate
                              : `${empStats.minDate} → ${empStats.maxDate}`}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-emerald-300 font-semibold">{s.fuenteTarifa}</div>
                        {(s.sueldoMensualLiquidado || s.sueldoBasicoPlanilla) && (
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {s.sueldoBasicoPlanilla
                              ? `Básico: ${formatCurrency(s.sueldoBasicoPlanilla)}/mes`
                              : ''}
                            {s.sueldoMensualLiquidado &&
                            s.sueldoMensualLiquidado !== s.sueldoBasicoPlanilla
                              ? ` • Total: ${formatCurrency(s.sueldoMensualLiquidado)}/mes`
                              : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200 whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <select
                              value={editModo}
                              onChange={(e) => setEditModo(e.target.value as 'DIA' | 'HORA')}
                              className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[11px]"
                            >
                              <option value="DIA">$/día</option>
                              <option value="HORA">$/hs</option>
                            </select>
                            <input
                              type="number"
                              value={editValor}
                              onChange={(e) => setEditValor(Number(e.target.value))}
                              className="w-24 bg-slate-950 border border-blue-500 rounded px-2 py-1 text-right text-white font-mono"
                            />
                          </div>
                        ) : (
                          <span>
                            {formatCurrency(s.tarifaAplicada)} /{' '}
                            {s.modoCalculo === 'HORA' ? 'hs' : 'día'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-300 whitespace-nowrap">
                        {formatCurrency(s.montoTotal)}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleSaveOverride(s.empleadoKey)}
                              className="px-2 py-1 bg-blue-500 hover:bg-blue-400 text-white rounded text-[11px] font-bold cursor-pointer"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingKey(null)}
                              className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[11px] cursor-pointer"
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKey(s.empleadoKey);
                              setEditModo(s.modoCalculo);
                              setEditValor(s.tarifaAplicada);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
                          >
                            Editar tarifa
                          </button>
                        )}
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
