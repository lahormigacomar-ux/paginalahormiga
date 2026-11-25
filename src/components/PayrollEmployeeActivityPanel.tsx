import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Calendar,
  ClipboardList,
  RefreshCw,
  UserCheck,
  AlertCircle,
  Truck,
  MapPin,
  X,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { Employee, ParteDiario, SupabaseRegistro, SupabaseUsuario } from '../types';
import { EmployeePayrollSlip, matchPayrollSlipToEmployee } from '../utils/payrollParser';
import { fetchSupabaseRegistrosByDateRange, fetchSupabaseUsuarios } from '../services/supabase';

interface PayrollEmployeeActivityPanelProps {
  slip: EmployeePayrollSlip;
  periodName?: string;
  employees: Employee[];
  matchedEmployee: Employee | null;
  partesDiarios: ParteDiario[];
  supabaseRegistros: SupabaseRegistro[];
  supabaseUsuarios: SupabaseUsuario[];
  isAttendanceLoading?: boolean;
  onClose?: () => void;
}

const SPANISH_MONTHS: Record<string, number> = {
  ENERO: 1,
  ENE: 1,
  FEBRERO: 2,
  FEB: 2,
  MARZO: 3,
  MAR: 3,
  ABRIL: 4,
  ABR: 4,
  MAYO: 5,
  MAY: 5,
  JUNIO: 6,
  JUN: 6,
  JULIO: 7,
  JUL: 7,
  AGOSTO: 8,
  AGO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  SEP: 9,
  SET: 9,
  OCTUBRE: 10,
  OCT: 10,
  NOVIEMBRE: 11,
  NOV: 11,
  DICIEMBRE: 12,
  DIC: 12,
};

const DAY_NAMES_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function normalizeNameText(raw?: string | null): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCleanNameTokens(raw?: string | null): string[] {
  const stopWords = new Set([
    '1era',
    '2da',
    '3era',
    '4ta',
    '5ta',
    'semana',
    'la',
    'hormiga',
    'ingreso',
    'f',
    'i',
    'fi',
    'hs',
    'de',
    'del',
    's',
    'al',
  ]);
  return normalizeNameText(raw)
    .split(' ')
    .filter(t => t.length >= 2 && !/^\d+$/.test(t) && !/^\d+a\d+$/.test(t) && !stopWords.has(t));
}

function scoreNameSimilarity(a: string, b: string): number {
  const normA = normalizeNameText(a);
  const normB = normalizeNameText(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 100;

  const tokensA = extractCleanNameTokens(a);
  const tokensB = extractCleanNameTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  let matches = 0;
  for (const ta of tokensA) {
    if (tokensB.some(tb => tb === ta || (ta.length >= 4 && tb.startsWith(ta)) || (tb.length >= 4 && ta.startsWith(tb)))) {
      matches++;
    }
  }
  if (matches === 0) return 0;
  const ratio = matches / Math.min(tokensA.length, tokensB.length);
  return Math.round(ratio * 80 + matches * 5);
}

/**
 * Parsea el texto "RANGO DE FECHAS" de la ficha (ej: "15.09 AL 14.10", "01 AL 31", "01/10/2026 AL 15/10/2026")
 * combinado con el nombre del período (ej: "OCTUBRE 2026") para inicializar Desde y Hasta en YYYY-MM-DD.
 */
function parsePayrollRangeToDates(rangoFecha?: string, periodName?: string): { from: string; to: string } {
  const now = new Date();
  let refYear = now.getFullYear();
  let refMonth = now.getMonth() + 1;

  if (periodName) {
    const upperPeriod = periodName
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const yearMatch = upperPeriod.match(/\b(20\d{2})\b/);
    if (yearMatch) refYear = Number(yearMatch[1]);

    for (const [mName, mNum] of Object.entries(SPANISH_MONTHS)) {
      if (new RegExp(`\\b${mName}\\b`).test(upperPeriod)) {
        refMonth = mNum;
        break;
      }
    }
  }

  const raw = String(rangoFecha || '').trim().toUpperCase();

  // Caso 1: DD/MM/YYYY AL DD/MM/YYYY (o con puntos/guiones)
  const fullDates = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\s*(?:AL|A|-|HASTA)\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (fullDates) {
    const d1 = Math.min(31, Math.max(1, Number(fullDates[1])));
    const m1 = Math.min(12, Math.max(1, Number(fullDates[2])));
    const y1 = Number(fullDates[3]) < 100 ? 2000 + Number(fullDates[3]) : Number(fullDates[3]);
    const d2 = Math.min(31, Math.max(1, Number(fullDates[4])));
    const m2 = Math.min(12, Math.max(1, Number(fullDates[5])));
    const y2 = Number(fullDates[6]) < 100 ? 2000 + Number(fullDates[6]) : Number(fullDates[6]);
    return {
      from: `${y1}-${pad2(m1)}-${pad2(d1)}`,
      to: `${y2}-${pad2(m2)}-${pad2(d2)}`,
    };
  }

  // Caso 2: DD.MM AL DD.MM (ej: "15.09 AL 14.10" o "15/09 AL 14/10")
  const dayMonthRange = raw.match(/(\d{1,2})[./-](\d{1,2})\s*(?:AL|A|-|HASTA)\s*(\d{1,2})[./-](\d{1,2})/);
  if (dayMonthRange) {
    const d1 = Math.min(31, Math.max(1, Number(dayMonthRange[1])));
    const m1 = Math.min(12, Math.max(1, Number(dayMonthRange[2])));
    const d2 = Math.min(31, Math.max(1, Number(dayMonthRange[3])));
    const m2 = Math.min(12, Math.max(1, Number(dayMonthRange[4])));
    const y2 = refYear;
    const y1 = m1 > m2 ? refYear - 1 : refYear;
    const maxD1 = new Date(y1, m1, 0).getDate();
    const maxD2 = new Date(y2, m2, 0).getDate();
    return {
      from: `${y1}-${pad2(m1)}-${pad2(Math.min(d1, maxD1))}`,
      to: `${y2}-${pad2(m2)}-${pad2(Math.min(d2, maxD2))}`,
    };
  }

  // Caso 3: DD AL DD (ej: "01 AL 31" o "01 AL 15")
  const dayOnlyRange = raw.match(/(\d{1,2})\s*(?:AL|A|-|HASTA)\s*(\d{1,2})/);
  if (dayOnlyRange) {
    const maxDay = new Date(refYear, refMonth, 0).getDate();
    const d1 = Math.min(maxDay, Math.max(1, Number(dayOnlyRange[1])));
    const d2 = Math.min(maxDay, Math.max(1, Number(dayOnlyRange[2])));
    return {
      from: `${refYear}-${pad2(refMonth)}-${pad2(d1)}`,
      to: `${refYear}-${pad2(refMonth)}-${pad2(d2)}`,
    };
  }

  // Fallback: mes completo del período
  const lastDay = new Date(refYear, refMonth, 0).getDate();
  return {
    from: `${refYear}-${pad2(refMonth)}-01`,
    to: `${refYear}-${pad2(refMonth)}-${pad2(lastDay)}`,
  };
}

/**
 * Extrae YYYY-MM-DD en hora local de una marca temporal ISO de Supabase.
 */
function getLocalDateKey(isoStr?: string): string {
  if (!isoStr) return '';
  const dt = new Date(isoStr);
  if (isNaN(dt.getTime())) {
    return isoStr.slice(0, 10);
  }
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function formatTimeHHMM(isoStr?: string): string {
  if (!isoStr) return '--:--';
  const dt = new Date(isoStr);
  if (isNaN(dt.getTime())) return isoStr.slice(11, 16) || '--:--';
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function formatHoursDecimal(hours: number): string {
  return hours.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatHoursHM(hours: number): string {
  const totalMins = Math.round(Math.max(0, hours) * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${pad2(m)}m`;
}

/**
 * Calcula las horas trabajadas en un día a partir de sus marcaciones ordenadas cronológicamente.
 * - Soporta turno corrido (1 Entrada -> 1 Salida) y turno cortado (ej: 08:00-13:00 y 14:00-19:00)
 *   sumando cada par Entrada -> Salida sin contar el corte del mediodía.
 * - Si quedaron pares desalineados pero existen al menos 1 Entrada y 1 Salida, hace fallback a última Salida - primera Entrada.
 */
function calculateDayHoursFromPunches(sortedPunches: SupabaseRegistro[]): {
  hours: number;
  status: 'COMPLETA' | 'INCOMPLETA' | 'SOLO_SALIDA' | 'SIN_DATOS';
} {
  if (sortedPunches.length === 0) return { hours: 0, status: 'SIN_DATOS' };

  const entradas = sortedPunches.filter(p => p.tipo === 'Entrada');
  const salidas = sortedPunches.filter(p => p.tipo === 'Salida');

  if (entradas.length === 0 && salidas.length > 0) {
    return { hours: 0, status: 'SOLO_SALIDA' };
  }
  if (entradas.length > 0 && salidas.length === 0) {
    return { hours: 0, status: 'INCOMPLETA' };
  }

  let totalMs = 0;
  let openEntradaMs: number | null = null;
  let pairedCount = 0;

  for (const punch of sortedPunches) {
    const ts = new Date(punch.fecha).getTime();
    if (isNaN(ts)) continue;
    if (punch.tipo === 'Entrada') {
      if (openEntradaMs === null) {
        openEntradaMs = ts;
      }
    } else if (punch.tipo === 'Salida') {
      if (openEntradaMs !== null && ts > openEntradaMs) {
        totalMs += ts - openEntradaMs;
        pairedCount++;
        openEntradaMs = null;
      }
    }
  }

  if (pairedCount === 0 && entradas.length > 0 && salidas.length > 0) {
    const firstIn = new Date(entradas[0].fecha).getTime();
    const lastOut = new Date(salidas[salidas.length - 1].fecha).getTime();
    if (!isNaN(firstIn) && !isNaN(lastOut) && lastOut > firstIn) {
      totalMs = lastOut - firstIn;
    }
  }

  const hours = Math.max(0, totalMs / (1000 * 60 * 60));
  const status = openEntradaMs !== null ? 'INCOMPLETA' : 'COMPLETA';
  return { hours, status };
}

export const PayrollEmployeeActivityPanel: React.FC<PayrollEmployeeActivityPanelProps> = ({
  slip,
  periodName,
  employees,
  matchedEmployee,
  partesDiarios,
  supabaseRegistros,
  supabaseUsuarios,
  isAttendanceLoading = false,
  onClose,
}) => {
  // Usuarios locales si el prop vino vacío (fallback directo a Supabase)
  const [localUsuarios, setLocalUsuarios] = useState<SupabaseUsuario[]>(supabaseUsuarios);
  useEffect(() => {
    if (supabaseUsuarios.length > 0) {
      setLocalUsuarios(supabaseUsuarios);
      return;
    }
    let cancelled = false;
    fetchSupabaseUsuarios()
      .then(users => {
        if (!cancelled && Array.isArray(users) && users.length > 0) {
          setLocalUsuarios(users);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supabaseUsuarios]);

  const effectiveUsuarios = supabaseUsuarios.length > 0 ? supabaseUsuarios : localUsuarios;

  // Rango de fechas independiente dentro del popup (auto-inicializado según la ficha)
  const initialRange = useMemo(
    () => parsePayrollRangeToDates(slip.rangoFecha, periodName),
    [slip.rangoFecha, periodName]
  );

  const [dateFrom, setDateFrom] = useState<string>(initialRange.from);
  const [dateTo, setDateTo] = useState<string>(initialRange.to);
  const [sectionTab, setSectionTab] = useState<'ambos' | 'marcaciones' | 'partes'>('ambos');
  const [showEmptyDays, setShowEmptyDays] = useState<boolean>(false);

  // Re-sincronizar rango cuando cambia la ficha abierta
  useEffect(() => {
    const next = parsePayrollRangeToDates(slip.rangoFecha, periodName);
    setDateFrom(next.from);
    setDateTo(next.to);
  }, [slip.id, slip.rangoFecha, periodName]);

  const normalizedRange = useMemo(() => {
    const d1 = dateFrom || initialRange.from;
    const d2 = dateTo || d1;
    return d1 <= d2 ? { start: d1, end: d2 } : { start: d2, end: d1 };
  }, [dateFrom, dateTo, initialRange.from]);

  // Resolver automáticamente el usuario de Supabase (Marcaciones) para este empleado
  const autoMatchedUsuario = useMemo<SupabaseUsuario | null>(() => {
    if (effectiveUsuarios.length === 0) return null;

    if (matchedEmployee) {
      const byId = effectiveUsuarios.find(u => u.id === matchedEmployee.id);
      if (byId) return byId;

      const empLeg = String(matchedEmployee.legajo || matchedEmployee.codigoEmpleado || '').replace(/\D/g, '');
      if (empLeg) {
        const byLeg = effectiveUsuarios.find(u => String(u.legajo || '').replace(/\D/g, '') === empLeg);
        if (byLeg) return byLeg;
      }
    }

    const candidateNames = [
      matchedEmployee?.nombreApellido,
      matchedEmployee?.nombre,
      slip.empleadoNombre,
    ].filter(Boolean) as string[];

    let bestUser: SupabaseUsuario | null = null;
    let bestScore = 0;

    for (const u of effectiveUsuarios) {
      for (const name of candidateNames) {
        const score = scoreNameSimilarity(name, u.nombre || '');
        if (score > bestScore) {
          bestScore = score;
          bestUser = u;
        }
      }
    }

    return bestScore >= 60 ? bestUser : null;
  }, [effectiveUsuarios, matchedEmployee, slip.empleadoNombre]);

  // Permite elegir manualmente otro usuario de marcaciones si el nombre del reloj difiere
  const [manualUsuarioId, setManualUsuarioId] = useState<string>('');
  useEffect(() => {
    setManualUsuarioId('');
  }, [slip.id]);

  const activeUsuario = useMemo<SupabaseUsuario | null>(() => {
    if (manualUsuarioId) {
      return effectiveUsuarios.find(u => u.id === manualUsuarioId) || null;
    }
    return autoMatchedUsuario;
  }, [manualUsuarioId, effectiveUsuarios, autoMatchedUsuario]);

  // Carga en vivo desde Supabase para el rango seleccionado (sin límite de 60 días)
  const [rangeRegistros, setRangeRegistros] = useState<SupabaseRegistro[]>([]);
  const [isFetchingRange, setIsFetchingRange] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadRangeFromSupabase = useCallback(async () => {
    if (!activeUsuario?.id || !normalizedRange.start || !normalizedRange.end) {
      setRangeRegistros([]);
      return;
    }
    setIsFetchingRange(true);
    setFetchError(null);
    try {
      const rows = await fetchSupabaseRegistrosByDateRange(
        normalizedRange.start,
        normalizedRange.end,
        activeUsuario.id
      );
      setRangeRegistros(rows);
    } catch (err: any) {
      setFetchError(err?.message || 'No se pudieron consultar las marcaciones en Supabase.');
    } finally {
      setIsFetchingRange(false);
    }
  }, [activeUsuario?.id, normalizedRange.start, normalizedRange.end]);

  useEffect(() => {
    loadRangeFromSupabase();
  }, [loadRangeFromSupabase]);

  // Unir registros recibidos por props + registros consultados por rango (deduplicados por id)
  const mergedRegistrosForUser = useMemo<SupabaseRegistro[]>(() => {
    if (!activeUsuario?.id) return [];
    const byId = new Map<string, SupabaseRegistro>();
    for (const r of supabaseRegistros) {
      if (r.usuario_id === activeUsuario.id) {
        byId.set(String(r.id), r);
      }
    }
    for (const r of rangeRegistros) {
      if (r.usuario_id === activeUsuario.id) {
        byId.set(String(r.id), r);
      }
    }
    return Array.from(byId.values()).filter(r => {
      const dk = getLocalDateKey(r.fecha);
      return dk >= normalizedRange.start && dk <= normalizedRange.end;
    });
  }, [activeUsuario?.id, supabaseRegistros, rangeRegistros, normalizedRange]);

  // Agrupar marcaciones por día (1 sola línea por día + total en horas)
  const dailyMarcaciones = useMemo(() => {
    const byDate = new Map<string, SupabaseRegistro[]>();
    for (const r of mergedRegistrosForUser) {
      const dk = getLocalDateKey(r.fecha);
      if (!dk) continue;
      const arr = byDate.get(dk);
      if (arr) arr.push(r);
      else byDate.set(dk, [r]);
    }

    const datesList: string[] = [];
    if (showEmptyDays) {
      const startObj = new Date(`${normalizedRange.start}T12:00:00`);
      const endObj = new Date(`${normalizedRange.end}T12:00:00`);
      const cur = new Date(startObj);
      let safety = 0;
      while (cur <= endObj && safety < 120) {
        datesList.push(`${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`);
        cur.setDate(cur.getDate() + 1);
        safety++;
      }
    } else {
      datesList.push(...Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b)));
    }

    return datesList.map(dateKey => {
      const punches = (byDate.get(dateKey) || [])
        .slice()
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      const { hours, status } = calculateDayHoursFromPunches(punches);
      const dt = new Date(`${dateKey}T12:00:00`);
      const dayLabel = isNaN(dt.getTime()) ? '' : DAY_NAMES_ES[dt.getDay()];
      const shortDate = `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;

      return {
        dateKey,
        dayLabel,
        shortDate,
        punches,
        hours,
        status,
      };
    });
  }, [mergedRegistrosForUser, showEmptyDays, normalizedRange]);

  const marcacionesSummary = useMemo(() => {
    let totalHours = 0;
    let daysWithPunches = 0;
    let completeDays = 0;
    let incompleteDays = 0;
    for (const row of dailyMarcaciones) {
      if (row.punches.length > 0) {
        daysWithPunches++;
        totalHours += row.hours;
        if (row.status === 'COMPLETA') completeDays++;
        else incompleteDays++;
      }
    }
    return { totalHours, daysWithPunches, completeDays, incompleteDays };
  }, [dailyMarcaciones]);

  // Filtrar Partes Diarios trabajados para este empleado en el rango seleccionado
  const employeePartesInRange = useMemo(() => {
    const candidateNames = [
      matchedEmployee?.nombreApellido,
      matchedEmployee?.nombre,
      activeUsuario?.nombre,
      slip.empleadoNombre,
    ].filter(Boolean) as string[];

    const candidateLegajos = new Set<string>(
      [
        matchedEmployee?.legajo,
        matchedEmployee?.codigoEmpleado,
        activeUsuario?.legajo,
      ]
        .map(v => String(v || '').replace(/\D/g, ''))
        .filter(Boolean)
    );

    return partesDiarios
      .filter(p => {
        const pDate = String(p.fecha || '').slice(0, 10);
        if (!pDate || pDate < normalizedRange.start || pDate > normalizedRange.end) return false;

        // 1. Match por código/legajo numérico
        const pCodeDigits = String(p.codigoEmpleado || '').replace(/\D/g, '');
        if (pCodeDigits && candidateLegajos.has(pCodeDigits)) return true;

        // 2. Match directo con Employee a través del parser de nómina
        const resp = (p.nombreApellido || p.codigoEmpleado || '').trim();
        if (matchedEmployee && resp) {
          const m = matchPayrollSlipToEmployee(resp, employees);
          if (m.employee && m.employee.id === matchedEmployee.id) return true;
        }

        // 3. Similitud por nombre
        if (resp) {
          for (const cname of candidateNames) {
            if (scoreNameSimilarity(resp, cname) >= 65) return true;
          }
        }
        return false;
      })
      .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
  }, [partesDiarios, normalizedRange, matchedEmployee, activeUsuario, slip.empleadoNombre, employees]);

  const partesSummary = useMemo(() => {
    let totalHours = 0;
    let totalViajes = 0;
    let totalDias = 0;
    for (const p of employeePartesInRange) {
      totalHours += Number(p.horasTrabajadas || p.hsCantidad || 0);
      totalViajes += Number(p.viajesCantidad || 0);
      totalDias += Number(p.cantidadDias || 0);
    }
    return {
      count: employeePartesInRange.length,
      totalHours,
      totalViajes,
      totalDias,
    };
  }, [employeePartesInRange]);

  const applyPreset = (preset: 'ficha' | '7d' | 'q1' | 'q2' | 'mes' | 'mes_ant') => {
    if (preset === 'ficha') {
      const r = parsePayrollRangeToDates(slip.rangoFecha, periodName);
      setDateFrom(r.from);
      setDateTo(r.to);
      return;
    }
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = pad2(now.getMonth() + 1);
    const todayStr = `${yyyy}-${mm}-${pad2(now.getDate())}`;

    if (preset === '7d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      setDateFrom(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
      setDateTo(todayStr);
    } else if (preset === 'q1') {
      const refMonth = dateFrom && dateFrom.length >= 7 ? dateFrom.slice(0, 7) : `${yyyy}-${mm}`;
      setDateFrom(`${refMonth}-01`);
      setDateTo(`${refMonth}-15`);
    } else if (preset === 'q2') {
      const refMonth = dateFrom && dateFrom.length >= 7 ? dateFrom.slice(0, 7) : `${yyyy}-${mm}`;
      const [yNum, mNum] = refMonth.split('-').map(Number);
      const lastDay = new Date(yNum, mNum, 0).getDate();
      setDateFrom(`${refMonth}-16`);
      setDateTo(`${refMonth}-${pad2(lastDay)}`);
    } else if (preset === 'mes') {
      const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
      setDateFrom(`${yyyy}-${mm}-01`);
      setDateTo(`${yyyy}-${mm}-${pad2(lastDay)}`);
    } else if (preset === 'mes_ant') {
      const prev = new Date(yyyy, now.getMonth() - 1, 1);
      const py = prev.getFullYear();
      const pm = pad2(prev.getMonth() + 1);
      const lastDay = new Date(py, prev.getMonth() + 1, 0).getDate();
      setDateFrom(`${py}-${pm}-01`);
      setDateTo(`${py}-${pm}-${pad2(lastDay)}`);
    }
  };

  const sortedUsuarios = useMemo(
    () => [...effectiveUsuarios].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')),
    [effectiveUsuarios]
  );

  return (
    <div className="bg-[#161616] border border-[#F0C800]/30 rounded-2xl w-full lg:w-[440px] xl:w-[530px] 2xl:w-[600px] shrink-0 max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
      {/* Header del Popup Derecho */}
      <div className="px-4 py-3.5 bg-black/60 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#F0C800]/15 border border-[#F0C800]/40 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-[#F0C800]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black uppercase text-white truncate">
              Marcaciones y Partes Trabajados
            </h3>
            <p className="text-[11px] text-gray-400 truncate">
              {matchedEmployee?.nombreApellido || activeUsuario?.nombre || slip.empleadoNombre}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={loadRangeFromSupabase}
            disabled={isFetchingRange}
            title="Actualizar marcaciones desde Supabase"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetchingRange || isAttendanceLoading ? 'animate-spin text-[#F0C800]' : ''}`} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Ocultar panel de marcaciones y partes"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Controles de Rango de Fechas + Selector de Usuario de Marcaciones */}
      <div className="px-4 py-3 bg-black/35 border-b border-white/10 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-[#F0C800]" />
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full bg-[#121212] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:border-[#F0C800] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-[#F0C800]" />
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full bg-[#121212] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:border-[#F0C800] focus:outline-none"
            />
          </div>
        </div>

        {/* Presets rápidos de fechas */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ficha' as const, label: 'Rango Ficha' },
            { id: '7d' as const, label: '7 días' },
            { id: 'q1' as const, label: '1° Quinc.' },
            { id: 'q2' as const, label: '2° Quinc.' },
            { id: 'mes' as const, label: 'Mes actual' },
            { id: 'mes_ant' as const, label: 'Mes ant.' },
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className="px-2 py-1 rounded-md text-[10px] font-bold bg-white/5 hover:bg-[#F0C800]/20 text-gray-300 hover:text-[#F0C800] border border-white/10 transition cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Selector de Usuario en Reloj Biométrico (preseleccionado automáticamente) */}
        <div className="flex items-center gap-2">
          <UserCheck className={`w-3.5 h-3.5 shrink-0 ${activeUsuario ? 'text-emerald-400' : 'text-amber-400'}`} />
          <select
            value={activeUsuario?.id || ''}
            onChange={e => setManualUsuarioId(e.target.value)}
            className="flex-1 bg-[#121212] border border-white/15 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white focus:border-[#F0C800] focus:outline-none"
            title="Empleado en el sistema de Marcaciones (Supabase)"
          >
            <option value="">
              {sortedUsuarios.length === 0
                ? 'Cargando usuarios de marcaciones...'
                : '— Sin vincular a reloj biométrico (elegir empleado) —'}
            </option>
            {sortedUsuarios.map(u => (
              <option key={u.id} value={u.id}>
                {u.nombre} {u.legajo ? `(Leg. ${u.legajo})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* KPI Strip: Totales del Rango */}
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-2.5 py-2">
            <div className="text-[9px] font-bold uppercase text-emerald-300/80">Total Marcación</div>
            <div className="text-sm font-black font-mono text-emerald-300 leading-tight">
              {formatHoursDecimal(marcacionesSummary.totalHours)} hs
            </div>
            <div className="text-[10px] text-emerald-200/70 font-mono">
              {formatHoursHM(marcacionesSummary.totalHours)}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-2">
            <div className="text-[9px] font-bold uppercase text-gray-400">Días Marcados</div>
            <div className="text-sm font-black font-mono text-white leading-tight">
              {marcacionesSummary.daysWithPunches} días
            </div>
            <div className="text-[10px] text-gray-400">
              {marcacionesSummary.completeDays} comp.
              {marcacionesSummary.incompleteDays > 0 ? ` · ${marcacionesSummary.incompleteDays} inc.` : ''}
            </div>
          </div>
          <div className="bg-[#F0C800]/10 border border-[#F0C800]/30 rounded-xl px-2.5 py-2">
            <div className="text-[9px] font-bold uppercase text-[#F0C800]/90">Partes Trabajados</div>
            <div className="text-sm font-black font-mono text-[#F0C800] leading-tight">
              {formatHoursDecimal(partesSummary.totalHours)} hs
            </div>
            <div className="text-[10px] text-[#F0C800]/80">
              {partesSummary.count} {partesSummary.count === 1 ? 'parte' : 'partes'}
              {partesSummary.totalViajes > 0 ? ` · ${partesSummary.totalViajes} vj.` : ''}
            </div>
          </div>
        </div>

        {/* Selector de Vista: Ambos / Solo Marcaciones / Solo Partes */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="inline-flex bg-black/50 p-0.5 rounded-lg border border-white/10">
            {[
              { id: 'ambos' as const, label: 'Ambos' },
              { id: 'marcaciones' as const, label: `Marcaciones (${marcacionesSummary.daysWithPunches})` },
              { id: 'partes' as const, label: `Partes (${partesSummary.count})` },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSectionTab(tab.id)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition cursor-pointer ${
                  sectionTab === tab.id
                    ? 'bg-[#F0C800] text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {sectionTab !== 'partes' && (
            <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showEmptyDays}
                onChange={e => setShowEmptyDays(e.target.checked)}
                className="accent-[#F0C800] rounded"
              />
              Ver días sin marca
            </label>
          )}
        </div>
      </div>

      {/* Cuerpo Scrolleable: Marcaciones (1 línea/día) + Partes Trabajados */}
      <div className="p-4 overflow-y-auto space-y-5 flex-1">
        {fetchError && (
          <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/35 text-red-200 text-[11px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{fetchError}</span>
          </div>
        )}

        {/* SECCIÓN 1: MARCACIONES POR DÍA EN UNA SOLA LÍNEA */}
        {sectionTab !== 'partes' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black uppercase text-emerald-400 tracking-wide flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Marcaciones por Día (1 línea por día)
              </h4>
              <span className="text-[11px] font-mono font-bold text-emerald-300">
                Total: {formatHoursDecimal(marcacionesSummary.totalHours)} hs
              </span>
            </div>

            {!activeUsuario ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                No se encontró coincidencia automática en el reloj biométrico para{' '}
                <strong>{slip.empleadoNombre}</strong>. Elegilo arriba en el selector de empleado para ver sus marcaciones.
              </div>
            ) : isFetchingRange && dailyMarcaciones.length === 0 ? (
              <div className="p-4 rounded-xl bg-black/30 border border-white/10 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#F0C800]" />
                Consultando marcaciones en Supabase...
              </div>
            ) : dailyMarcaciones.length === 0 ? (
              <div className="p-4 rounded-xl bg-black/30 border border-white/10 text-center text-xs text-gray-400">
                No hay marcaciones registradas entre{' '}
                <span className="font-mono text-gray-200">{normalizedRange.start.split('-').reverse().join('/')}</span> y{' '}
                <span className="font-mono text-gray-200">{normalizedRange.end.split('-').reverse().join('/')}</span>.
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden divide-y divide-white/5">
                {dailyMarcaciones.map(row => (
                  <div
                    key={row.dateKey}
                    className={`px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] ${
                      row.punches.length === 0
                        ? 'opacity-45 bg-black/20'
                        : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    {/* Fecha en formato compacto */}
                    <div className="w-[74px] shrink-0 font-mono font-bold text-gray-200 whitespace-nowrap">
                      <span className="text-gray-500 mr-1">{row.dayLabel}</span>
                      <span>{row.shortDate}</span>
                    </div>

                    {/* Todas las marcaciones del día en UNA sola línea */}
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
                      {row.punches.length === 0 ? (
                        <span className="text-[10px] text-gray-500 italic">Sin marcación</span>
                      ) : (
                        row.punches.map((punch, idx) => {
                          const isIn = punch.tipo === 'Entrada';
                          return (
                            <span
                              key={punch.id || idx}
                              title={`${punch.tipo} ${formatTimeHHMM(punch.fecha)}${punch.observacion ? ` · ${punch.observacion}` : ''}`}
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                                isIn
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              }`}
                            >
                              {isIn ? (
                                <ArrowDownLeft className="w-2.5 h-2.5 shrink-0" />
                              ) : (
                                <ArrowUpRight className="w-2.5 h-2.5 shrink-0" />
                              )}
                              {formatTimeHHMM(punch.fecha)}
                            </span>
                          );
                        })
                      )}
                    </div>

                    {/* Total horas del día */}
                    <div className="w-[78px] shrink-0 text-right font-mono font-black whitespace-nowrap">
                      {row.hours > 0 ? (
                        <span className={row.status === 'INCOMPLETA' ? 'text-amber-300' : 'text-emerald-300'}>
                          {formatHoursDecimal(row.hours)} hs
                        </span>
                      ) : row.punches.length > 0 ? (
                        <span className="text-[10px] text-amber-400 font-bold">Incomp.</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Fila Totalizador de Marcaciones */}
                <div className="px-3 py-2 bg-emerald-500/10 flex items-center justify-between text-xs font-black">
                  <span className="text-emerald-200 uppercase">
                    Total Marcaciones ({marcacionesSummary.daysWithPunches} días)
                  </span>
                  <span className="font-mono text-emerald-300">
                    {formatHoursDecimal(marcacionesSummary.totalHours)} hs{' '}
                    <span className="text-[10px] font-semibold text-emerald-200/80">
                      ({formatHoursHM(marcacionesSummary.totalHours)})
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECCIÓN 2: PARTES DIARIOS TRABAJADOS */}
        {sectionTab !== 'marcaciones' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black uppercase text-[#F0C800] tracking-wide flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" />
                Partes Diarios Trabajados ({partesSummary.count})
              </h4>
              <span className="text-[11px] font-mono font-bold text-[#F0C800]">
                Total: {formatHoursDecimal(partesSummary.totalHours)} hs
              </span>
            </div>

            {employeePartesInRange.length === 0 ? (
              <div className="p-4 rounded-xl bg-black/30 border border-white/10 text-center text-xs text-gray-400">
                No se encontraron partes trabajados para este empleado entre{' '}
                <span className="font-mono text-gray-200">{normalizedRange.start.split('-').reverse().join('/')}</span> y{' '}
                <span className="font-mono text-gray-200">{normalizedRange.end.split('-').reverse().join('/')}</span>.
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden divide-y divide-white/5">
                {employeePartesInRange.map(p => {
                  const pDate = String(p.fecha || '').slice(0, 10);
                  const shortDate = pDate ? `${pDate.slice(8, 10)}/${pDate.slice(5, 7)}` : '--/--';
                  const dt = pDate ? new Date(`${pDate}T12:00:00`) : null;
                  const dayLabel = dt && !isNaN(dt.getTime()) ? DAY_NAMES_ES[dt.getDay()] : '';
                  const hrs = Number(p.horasTrabajadas || p.hsCantidad || 0);
                  const morningSchedule =
                    p.horaInicioMañana || p.horaFinMañana
                      ? `${p.horaInicioMañana || '?'}–${p.horaFinMañana || '?'}`
                      : '';
                  const afternoonSchedule =
                    p.horaInicioTarde || p.horaFinTarde
                      ? `${p.horaInicioTarde || '?'}–${p.horaFinTarde || '?'}`
                      : '';
                  const scheduleText = [morningSchedule, afternoonSchedule].filter(Boolean).join(' / ');

                  return (
                    <div key={p.id} className="px-3 py-2 hover:bg-white/[0.04] space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono font-bold text-gray-200 whitespace-nowrap">
                            <span className="text-gray-500 mr-1">{dayLabel}</span>
                            {shortDate}
                          </span>
                          {p.numParte && (
                            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-gray-300 shrink-0">
                              #{p.numParte}
                            </span>
                          )}
                          <span className="text-gray-300 font-semibold truncate flex items-center gap-1">
                            <Truck className="w-3 h-3 text-[#F0C800]/80 shrink-0" />
                            {p.marcaModelo || p.codigoEquipo || 'Sin equipo'}
                          </span>
                        </div>
                        <div className="shrink-0 font-mono font-black text-[#F0C800] whitespace-nowrap">
                          {hrs > 0
                            ? `${formatHoursDecimal(hrs)} hs`
                            : p.viajesCantidad > 0
                              ? `${p.viajesCantidad} vj.`
                              : p.cantidadDias
                                ? `${p.cantidadDias} d.`
                                : p.tipo || '—'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[10px] text-gray-400">
                        <span className="flex items-center gap-1 truncate max-w-[65%]">
                          <MapPin className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                          <span className="truncate">{p.obra || p.ubicacion || 'Sin obra'}</span>
                        </span>
                        {scheduleText && (
                          <span className="font-mono text-gray-300">{scheduleText}</span>
                        )}
                      </div>

                      {(p.detalleTipo || p.novedades) && (
                        <div className="text-[10px] text-gray-400/90 truncate">
                          {p.detalleTipo || p.novedades}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Fila Totalizador de Partes */}
                <div className="px-3 py-2 bg-[#F0C800]/10 flex items-center justify-between text-xs font-black">
                  <span className="text-[#F0C800] uppercase">
                    Total Partes ({partesSummary.count})
                    {partesSummary.totalViajes > 0 ? ` · ${partesSummary.totalViajes} viajes` : ''}
                  </span>
                  <span className="font-mono text-[#F0C800]">
                    {formatHoursDecimal(partesSummary.totalHours)} hs
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
