import React, { useState, useMemo } from 'react';
import { 
  Clock, 
  UserCheck, 
  UserX, 
  Calendar, 
  Search, 
  Download, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Filter, 
  Users, 
  Building2, 
  Briefcase, 
  DollarSign, 
  ShieldCheck, 
  CalendarDays, 
  Activity, 
  Sparkles,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Layers,
  FileSpreadsheet,
  Trash2,
  MessageSquare,
  MessageCircle
} from 'lucide-react';
import { 
  SupabaseRegistro, 
  SupabaseUsuario, 
  SupabaseLicencia, 
  SupabaseSector, 
  SupabaseEmpresa, 
  SupabaseCategoria,
  Employee,
  ParteDiario,
  JornadaEmpleadoCalculada,
  EstadoPresenciaDiaria
} from '../types';
import { createSupabaseRegistro, updateSupabaseRegistro, deleteSupabaseRegistro } from '../services/supabase';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface AttendanceSectionProps {
  registros: SupabaseRegistro[];
  usuarios: SupabaseUsuario[];
  licencias: SupabaseLicencia[];
  sectores?: SupabaseSector[];
  empresas?: SupabaseEmpresa[];
  categorias?: SupabaseCategoria[];
  employees: Employee[];
  partesDiarios: ParteDiario[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
  onLoadFullHistory?: () => Promise<void>;
  onSyncUsersToEmployees: (users: SupabaseUsuario[]) => void;
  onViewEmployeeDetail?: (employeeId: string) => void;
  onShowToast: (msg: string) => void;
}

export const AttendanceSection: React.FC<AttendanceSectionProps> = ({
  registros,
  usuarios,
  licencias,
  sectores = [],
  empresas = [],
  categorias = [],
  employees,
  partesDiarios,
  isLoading,
  onRefresh,
  onLoadFullHistory,
  onSyncUsersToEmployees,
  onViewEmployeeDetail,
  onShowToast
}) => {
  const [activeTab, setActiveTab] = useState<'diario' | 'historial' | 'resumen' | 'licencias' | 'nomina'>('diario');
  const [dateFrom, setDateFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [historialUseDateRange, setHistorialUseDateRange] = useState<boolean>(false);
  const [empleadoFilter, setEmpleadoFilter] = useState<string>('TODOS');
  const [rangeViewMode, setRangeViewMode] = useState<'detalle' | 'resumen_empleado'>('detalle');
  const [onlyDaysWithActivityInRange, setOnlyDaysWithActivityInRange] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sectorFilter, setSectorFilter] = useState('TODOS');
  const [empresaFilter, setEmpresaFilter] = useState('TODOS');
  const [tipoFilter, setTipoFilter] = useState<'TODOS' | 'Entrada' | 'Salida'>('TODOS');

  // Fecha de referencia cuando se opera sobre un único día
  const selectedDate = dateFrom || new Date().toISOString().slice(0, 10);
  const normalizedRange = useMemo(() => {
    const d1 = dateFrom || new Date().toISOString().slice(0, 10);
    const d2 = dateTo || d1;
    return d1 <= d2 ? { start: d1, end: d2 } : { start: d2, end: d1 };
  }, [dateFrom, dateTo]);
  const isMultiDayRange = normalizedRange.start !== normalizedRange.end;

  // Paginación para historial
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Modal para nueva fichada
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalUsuarioId, setModalUsuarioId] = useState('');
  const [modalTipo, setModalTipo] = useState<'Entrada' | 'Salida'>('Entrada');
  const [modalFechaHora, setModalFechaHora] = useState(() => new Date().toISOString().slice(0, 16));
  const [modalObservacion, setModalObservacion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mapeos rápidos para O(1)
  const userMap = useMemo(() => {
    const map = new Map<string, SupabaseUsuario>();
    usuarios.forEach(u => map.set(u.id, u));
    return map;
  }, [usuarios]);

  const categoriaMap = useMemo(() => {
    const map = new Map<number, SupabaseCategoria>();
    categorias.forEach(c => map.set(c.id, c));
    return map;
  }, [categorias]);

  // Conjunto de IDs de usuarios de Supabase habilitados para salir en Entradas y Salidas
  const visibleUserIdsSet = useMemo(() => {
    const set = new Set<string>();

    const empByLegajo = new Map<string, Employee>();
    const empByName = new Map<string, Employee>();

    employees.forEach(e => {
      if (!e) return;
      const cleanLeg = (e.legajo || e.codigoEmpleado || '').replace(/\D/g, '');
      if (cleanLeg) empByLegajo.set(cleanLeg, e);

      const cleanName = (e.nombreApellido || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');
      if (cleanName) empByName.set(cleanName, e);
    });

    usuarios.forEach(u => {
      if (!u) return;

      let matchedEmp = employees.find(e => e.id === u.id);

      if (!matchedEmp && u.legajo) {
        const cleanLeg = u.legajo.replace(/\D/g, '');
        if (cleanLeg) matchedEmp = empByLegajo.get(cleanLeg);
      }

      if (!matchedEmp && u.nombre) {
        const cleanName = u.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');
        if (cleanName) matchedEmp = empByName.get(cleanName);
      }

      const isVisible = matchedEmp ? (matchedEmp.mostrarEnAsistencia !== false) : true;
      if (isVisible) {
        set.add(u.id);
      }
    });

    return set;
  }, [usuarios, employees]);

  // Lista ordenada de empleados visibles para el selector
  const visibleUsuariosSorted = useMemo(() => {
    return usuarios
      .filter(u => visibleUserIdsSet.has(u.id))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }, [usuarios, visibleUserIdsSet]);

  // Lista de fechas YYYY-MM-DD dentro del rango seleccionado (máx 120 días para rendimiento inmediato)
  const datesInRange = useMemo(() => {
    const list: string[] = [];
    const startObj = new Date(`${normalizedRange.start}T12:00:00`);
    const endObj = new Date(`${normalizedRange.end}T12:00:00`);
    if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
      return [selectedDate];
    }
    const cur = new Date(startObj);
    let safety = 0;
    while (cur <= endObj && safety < 120) {
      list.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
      safety++;
    }
    return list.length > 0 ? list : [selectedDate];
  }, [normalizedRange, selectedDate]);

  // Presets rápidos de fechas
  const applyDatePreset = (preset: 'hoy' | 'ayer' | '7dias' | 'q1' | 'q2' | 'mes' | 'mes_ant') => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === 'hoy') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === 'ayer') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      setDateFrom(yStr);
      setDateTo(yStr);
    } else if (preset === '7dias') {
      const p = new Date(now);
      p.setDate(p.getDate() - 6);
      setDateFrom(p.toISOString().slice(0, 10));
      setDateTo(todayStr);
      setHistorialUseDateRange(true);
    } else if (preset === 'q1') {
      const refMonth = (dateFrom && dateFrom.length >= 7) ? dateFrom.slice(0, 7) : `${yyyy}-${mm}`;
      setDateFrom(`${refMonth}-01`);
      setDateTo(`${refMonth}-15`);
      setHistorialUseDateRange(true);
    } else if (preset === 'q2') {
      const refMonth = (dateFrom && dateFrom.length >= 7) ? dateFrom.slice(0, 7) : `${yyyy}-${mm}`;
      const [yNum, mNum] = refMonth.split('-').map(Number);
      const lastDay = new Date(yNum, mNum, 0).getDate();
      setDateFrom(`${refMonth}-16`);
      setDateTo(`${refMonth}-${String(lastDay).padStart(2, '0')}`);
      setHistorialUseDateRange(true);
    } else if (preset === 'mes') {
      const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
      setDateFrom(`${yyyy}-${mm}-01`);
      setDateTo(`${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`);
      setHistorialUseDateRange(true);
    } else if (preset === 'mes_ant') {
      const prev = new Date(yyyy, now.getMonth() - 1, 1);
      const py = prev.getFullYear();
      const pm = String(prev.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(py, prev.getMonth() + 1, 0).getDate();
      setDateFrom(`${py}-${pm}-01`);
      setDateTo(`${py}-${pm}-${String(lastDay).padStart(2, '0')}`);
      setHistorialUseDateRange(true);
    }
    setCurrentPage(1);
  };

  // Cálculo de jornadas diarias agrupadas por fecha y usuario dentro del rango seleccionado
  const jornadasPorFechaTodas = useMemo(() => {
    const results: JornadaEmpleadoCalculada[] = [];
    const todayIso = new Date().toISOString().slice(0, 10);

    // Pre-indexar fichadas por fecha (YYYY-MM-DD) y usuario_id para O(1)
    const registrosByDateAndUser = new Map<string, SupabaseRegistro[]>();
    registros.forEach(r => {
      const d = r.fecha ? r.fecha.slice(0, 10) : '';
      if (!d || d < normalizedRange.start || d > normalizedRange.end) return;
      const key = `${d}__${r.usuario_id}`;
      const arr = registrosByDateAndUser.get(key);
      if (arr) arr.push(r);
      else registrosByDateAndUser.set(key, [r]);
    });

    // Filtrar usuarios candidatos primero
    const matchingUsers = usuarios.filter(usuario => {
      if (!visibleUserIdsSet.has(usuario.id)) return false;
      if (empleadoFilter !== 'TODOS' && usuario.id !== empleadoFilter) return false;
      if (sectorFilter !== 'TODOS' && usuario.sector !== sectorFilter) return false;
      if (empresaFilter !== 'TODOS' && usuario.empresa !== empresaFilter) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchName = (usuario.nombre || '').toLowerCase().includes(term);
        const matchLegajo = (usuario.legajo || '').toLowerCase().includes(term);
        const matchSector = (usuario.sector || '').toLowerCase().includes(term);
        if (!matchName && !matchLegajo && !matchSector) return false;
      }
      return true;
    });

    datesInRange.forEach(targetDate => {
      matchingUsers.forEach(usuario => {
        const userFichadas = (registrosByDateAndUser.get(`${targetDate}__${usuario.id}`) || [])
          .slice()
          .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        // Verificar si tiene licencia en esta fecha
        const licenciaActiva = licencias.find(l => {
          if (l.usuario_id !== usuario.id || l.estado === 'Rechazado') return false;
          return targetDate >= l.fecha_inicio && targetDate <= l.fecha_fin;
        });

        const entradas = userFichadas.filter(f => f.tipo === 'Entrada');
        const salidas = userFichadas.filter(f => f.tipo === 'Salida');

        let primeraEntradaStr: string | undefined;
        let ultimaSalidaStr: string | undefined;
        let horasTrabajadas = 0;
        let estado: EstadoPresenciaDiaria = 'SIN_REGISTRO';

        if (licenciaActiva) {
          estado = 'EN_LICENCIA';
        } else if (entradas.length > 0 && salidas.length > 0) {
          const primEntrada = new Date(entradas[0].fecha);
          const ultSalida = new Date(salidas[salidas.length - 1].fecha);
          primeraEntradaStr = primEntrada.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          ultimaSalidaStr = ultSalida.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          const diffMs = ultSalida.getTime() - primEntrada.getTime();
          horasTrabajadas = Math.max(0, diffMs / (1000 * 60 * 60));
          estado = 'JORNADA_COMPLETA';
        } else if (entradas.length > 0) {
          const primEntrada = new Date(entradas[0].fecha);
          primeraEntradaStr = primEntrada.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          // Si es el día de hoy, calcular horas transcurridas
          if (targetDate === todayIso) {
            const now = new Date();
            const diffMs = now.getTime() - primEntrada.getTime();
            horasTrabajadas = Math.max(0, diffMs / (1000 * 60 * 60));
          }
          estado = 'PRESENTE_ACTIVO';
        } else if (salidas.length > 0) {
          const ultSalida = new Date(salidas[salidas.length - 1].fecha);
          ultimaSalidaStr = ultSalida.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          estado = 'SOLO_SALIDA';
        }

        // Cruce con partes diarios de trabajo
        const partesDelDia = partesDiarios.filter(p => {
          const matchesDate = p.fecha === targetDate;
          const matchesDriver = p.nombreApellido?.toLowerCase().trim() === usuario.nombre.toLowerCase().trim() ||
                                p.codigoEmpleado?.includes(usuario.legajo || 'XYZ99');
          return matchesDate && matchesDriver;
        });
        const horasPartes = partesDelDia.reduce((sum, p) => sum + (p.horasTrabajadas || p.hsCantidad || 0), 0);

        const cat = usuario.categoria_id ? categoriaMap.get(usuario.categoria_id) : undefined;

        results.push({
          fechaKey: targetDate,
          usuarioId: usuario.id,
          usuarioNombre: usuario.nombre,
          legajo: usuario.legajo || '-',
          sector: usuario.sector || 'Sin sector',
          empresa: usuario.empresa || 'La Hormiga',
          categoriaNombre: cat?.nombre || 'General',
          valorHora: cat?.valor_hora || 0,
          primeraEntrada: primeraEntradaStr,
          ultimaSalida: ultimaSalidaStr,
          entradasCount: entradas.length,
          salidasCount: salidas.length,
          totalHorasTrabajadas: horasTrabajadas,
          estadoPresencia: estado,
          observaciones: userFichadas.map(f => f.observacion).filter(Boolean) as string[],
          fichadasOriginales: userFichadas,
          licenciaVinculada: licenciaActiva,
          horasPartesTrabajo: horasPartes
        });
      });
    });

    const orderScore: Record<EstadoPresenciaDiaria, number> = {
      'PRESENTE_ACTIVO': 1,
      'JORNADA_COMPLETA': 2,
      'SOLO_SALIDA': 3,
      'EN_LICENCIA': 4,
      'SIN_REGISTRO': 5
    };

    return results.sort((a, b) => {
      if (isMultiDayRange) {
        // Si hay un empleado seleccionado, ordenar cronológicamente por fecha (más reciente primero o ascendente)
        if (a.fechaKey !== b.fechaKey) return b.fechaKey.localeCompare(a.fechaKey);
      }
      const scoreA = orderScore[a.estadoPresencia] || 9;
      const scoreB = orderScore[b.estadoPresencia] || 9;
      if (scoreA !== scoreB) return scoreA - scoreB;
      return a.usuarioNombre.localeCompare(b.usuarioNombre);
    });
  }, [datesInRange, normalizedRange, isMultiDayRange, registros, usuarios, licencias, empleadoFilter, sectorFilter, empresaFilter, searchTerm, partesDiarios, categoriaMap, visibleUserIdsSet]);

  // En modo rango de varios días, permitir ocultar filas sin fichadas si el usuario así lo prefiere
  const jornadasPorFecha = useMemo(() => {
    if (!isMultiDayRange) return jornadasPorFechaTodas;
    // Si eligió un empleado específico y el rango es corto (<= 31 días), o si desactivó el filtro de "solo con actividad"
    if (!onlyDaysWithActivityInRange) return jornadasPorFechaTodas;
    return jornadasPorFechaTodas.filter(j => j.estadoPresencia !== 'SIN_REGISTRO' || (j.horasPartesTrabajo || 0) > 0);
  }, [jornadasPorFechaTodas, isMultiDayRange, onlyDaysWithActivityInRange]);

  // Resumen acumulado por empleado dentro del rango de fechas seleccionado
  const resumenPorEmpleadoEnRango = useMemo(() => {
    const map = new Map<string, {
      usuarioId: string;
      usuarioNombre: string;
      legajo: string;
      sector: string;
      empresa: string;
      diasConFichada: number;
      jornadasCompletas: number;
      diasEnLicencia: number;
      totalEntradas: number;
      totalSalidas: number;
      totalHorasFichadas: number;
      totalHorasPartes: number;
      observacionesCount: number;
    }>();

    jornadasPorFechaTodas.forEach(j => {
      let item = map.get(j.usuarioId);
      if (!item) {
        item = {
          usuarioId: j.usuarioId,
          usuarioNombre: j.usuarioNombre,
          legajo: j.legajo,
          sector: j.sector,
          empresa: j.empresa,
          diasConFichada: 0,
          jornadasCompletas: 0,
          diasEnLicencia: 0,
          totalEntradas: 0,
          totalSalidas: 0,
          totalHorasFichadas: 0,
          totalHorasPartes: 0,
          observacionesCount: 0,
        };
        map.set(j.usuarioId, item);
      }

      if (j.fichadasOriginales.length > 0) item.diasConFichada += 1;
      if (j.estadoPresencia === 'JORNADA_COMPLETA') item.jornadasCompletas += 1;
      if (j.estadoPresencia === 'EN_LICENCIA') item.diasEnLicencia += 1;
      item.totalEntradas += j.entradasCount;
      item.totalSalidas += j.salidasCount;
      item.totalHorasFichadas += j.totalHorasTrabajadas || 0;
      item.totalHorasPartes += j.horasPartesTrabajo || 0;
      item.observacionesCount += j.observaciones.length;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.totalHorasFichadas !== a.totalHorasFichadas) return b.totalHorasFichadas - a.totalHorasFichadas;
      if (b.diasConFichada !== a.diasConFichada) return b.diasConFichada - a.diasConFichada;
      return a.usuarioNombre.localeCompare(b.usuarioNombre);
    });
  }, [jornadasPorFechaTodas]);

  // Totales del período/filtro activo para mostrar en la barra superior de la tabla
  const rangoTotals = useMemo(() => {
    let diasActivos = 0;
    let totalHoras = 0;
    let totalPartesHs = 0;
    let totalEntradas = 0;
    let totalSalidas = 0;
    let totalLicencias = 0;

    jornadasPorFechaTodas.forEach(j => {
      if (j.fichadasOriginales.length > 0) diasActivos++;
      if (j.estadoPresencia === 'EN_LICENCIA') totalLicencias++;
      totalHoras += j.totalHorasTrabajadas || 0;
      totalPartesHs += j.horasPartesTrabajo || 0;
      totalEntradas += j.entradasCount;
      totalSalidas += j.salidasCount;
    });

    return {
      diasEnRango: datesInRange.length,
      diasActivos,
      totalHoras,
      totalPartesHs,
      totalEntradas,
      totalSalidas,
      totalLicencias
    };
  }, [jornadasPorFechaTodas, datesInRange]);

  const formatHoursMinutes = (hoursDecimal: number): string => {
    const totalMins = Math.round((hoursDecimal || 0) * 60);
    if (totalMins <= 0) return '-';
    const hh = Math.floor(totalMins / 60);
    const mm = totalMins % 60;
    return `${hh}:${String(mm).padStart(2, '0')} hs`;
  };

  const formatDateDisplay = (yyyyMmDd: string): string => {
    if (!yyyyMmDd) return '-';
    const [y, m, d] = yyyyMmDd.split('-');
    if (!y || !m || !d) return yyyyMmDd;
    const dateObj = new Date(`${yyyyMmDd}T12:00:00`);
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dayName = !isNaN(dateObj.getTime()) ? dayNames[dateObj.getDay()] : '';
    return `${dayName ? dayName + ' ' : ''}${d}/${m}/${y}`;
  };

  // Resumen estadístico global
  const stats = useMemo(() => {
    const hoyStr = new Date().toISOString().slice(0, 10);
    const fichadasHoy = registros.filter(r => r.fecha?.slice(0, 10) === hoyStr);
    
    const presentes = new Set<string>();
    const completados = new Set<string>();

    usuarios.forEach(u => {
      if (!visibleUserIdsSet.has(u.id)) return;
      const userFichadasHoy = fichadasHoy.filter(r => r.usuario_id === u.id);
      const hasEntrada = userFichadasHoy.some(r => r.tipo === 'Entrada');
      const hasSalida = userFichadasHoy.some(r => r.tipo === 'Salida');

      if (hasEntrada && !hasSalida) presentes.add(u.id);
      if (hasEntrada && hasSalida) completados.add(u.id);
    });

    const licenciasHoy = licencias.filter(l => {
      if (l.estado === 'Rechazado') return false;
      if (!visibleUserIdsSet.has(l.usuario_id)) return false;
      return hoyStr >= l.fecha_inicio && hoyStr <= l.fecha_fin;
    }).length;

    return {
      totalFichadas: registros.length,
      totalUsuarios: visibleUserIdsSet.size,
      presentesHoy: presentes.size,
      completadosHoy: completados.size,
      enLicenciaHoy: licenciasHoy
    };
  }, [registros, usuarios, licencias, visibleUserIdsSet]);

  // Registros filtrados para la pestaña de historial
  const filteredHistorial = useMemo(() => {
    return registros.filter(r => {
      if (!visibleUserIdsSet.has(r.usuario_id)) return false;
      if (empleadoFilter !== 'TODOS' && r.usuario_id !== empleadoFilter) return false;
      if (historialUseDateRange || isMultiDayRange) {
        const d = r.fecha ? r.fecha.slice(0, 10) : '';
        if (d < normalizedRange.start || d > normalizedRange.end) return false;
      }
      const user = userMap.get(r.usuario_id);
      if (tipoFilter !== 'TODOS' && r.tipo !== tipoFilter) return false;
      if (sectorFilter !== 'TODOS' && user?.sector !== sectorFilter) return false;
      if (empresaFilter !== 'TODOS' && user?.empresa !== empresaFilter) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const userName = (user?.nombre || '').toLowerCase();
        const userLegajo = (user?.legajo || '').toLowerCase();
        const obs = (r.observacion || '').toLowerCase();
        const dateStr = (r.fecha || '').toLowerCase();
        if (!userName.includes(term) && !userLegajo.includes(term) && !obs.includes(term) && !dateStr.includes(term)) {
          return false;
        }
      }
      return true;
    });
  }, [registros, userMap, empleadoFilter, historialUseDateRange, isMultiDayRange, normalizedRange, tipoFilter, sectorFilter, empresaFilter, searchTerm, visibleUserIdsSet]);

  const totalPages = Math.ceil(filteredHistorial.length / pageSize) || 1;
  const paginatedHistorial = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHistorial.slice(start, start + pageSize);
  }, [filteredHistorial, currentPage, pageSize]);

  // Helper seguro para fechas e ISO Strings sin causar "Invalid time value"
  const parseToIsoDate = (dateStr: string, timeStr: string): string => {
    if (!dateStr) dateStr = selectedDate || new Date().toISOString().slice(0, 10);
    if (!timeStr) timeStr = '12:00';
    
    const parts = timeStr.trim().split(':');
    const hh = (parts[0] || '00').padStart(2, '0');
    const mm = (parts[1] || '00').padStart(2, '0');
    const ss = (parts[2] || '00').padStart(2, '0');

    const isoFormatted = `${dateStr}T${hh}:${mm}:${ss}`;
    const d = new Date(isoFormatted);
    if (isNaN(d.getTime())) {
      return new Date().toISOString();
    }
    return d.toISOString();
  };

  // Modal de Marcación Rápida con Hora y Observación editable
  const [quickPunchUser, setQuickPunchUser] = useState<{ id: string; nombre: string; legajo: string } | null>(null);
  const [quickPunchTipo, setQuickPunchTipo] = useState<'Entrada' | 'Salida'>('Entrada');
  const [quickPunchDate, setQuickPunchDate] = useState<string>(selectedDate);
  const [quickPunchTime, setQuickPunchTime] = useState<string>(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [quickPunchObs, setQuickPunchObs] = useState<string>('');

  // Modal de Comentarios / Observaciones de Jornada
  const [commentJornada, setCommentJornada] = useState<JornadaEmpleadoCalculada | null>(null);
  const [newObsText, setNewObsText] = useState<string>('');

  // Modal de Edición / Eliminación de Fichada Preexistente
  const [editingPunch, setEditingPunch] = useState<{
    id: number;
    usuarioNombre: string;
    legajo: string;
    tipo: 'Entrada' | 'Salida';
    fecha: string;
    hora: string;
    observacion: string;
  } | null>(null);

  // Manejo de marcación rápida con hora y comentario
  const handleSaveQuickPunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPunchUser) return;

    try {
      setIsSubmitting(true);
      const isoDate = parseToIsoDate(quickPunchDate, quickPunchTime);
      await createSupabaseRegistro({
        usuario_id: quickPunchUser.id,
        tipo: quickPunchTipo,
        fecha: isoDate,
        observacion: quickPunchObs || null
      });

      onShowToast(`Fichada de ${quickPunchTipo} (${quickPunchTime} hs) guardada con éxito para ${quickPunchUser.nombre}.`);
      setQuickPunchUser(null);
      setQuickPunchObs('');
      await onRefresh();
    } catch (err: any) {
      onShowToast(`Error al registrar en Supabase: ${err.message || 'Fallo de conexión'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPunch) return;

    try {
      setIsSubmitting(true);
      const isoDate = parseToIsoDate(editingPunch.fecha, editingPunch.hora);
      await updateSupabaseRegistro(editingPunch.id, {
        tipo: editingPunch.tipo,
        fecha: isoDate,
        observacion: editingPunch.observacion || null
      });

      onShowToast(`Fichada #${editingPunch.id} actualizada correctamente a las ${editingPunch.hora} hs.`);
      setEditingPunch(null);
      await onRefresh();
    } catch (err: any) {
      onShowToast(`Error al actualizar en Supabase: ${err.message || 'Fallo de conexión'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isConfirmDeletePunchOpen, setIsConfirmDeletePunchOpen] = useState(false);

  const handleDeletePunch = () => {
    if (!editingPunch) return;
    setIsConfirmDeletePunchOpen(true);
  };

  const confirmDeletePunch = async () => {
    if (!editingPunch) return;
    setIsConfirmDeletePunchOpen(false);
    try {
      setIsSubmitting(true);
      await deleteSupabaseRegistro(editingPunch.id);
      onShowToast(`Fichada de ${editingPunch.tipo} eliminada de Supabase.`);
      setEditingPunch(null);
      await onRefresh();
    } catch (err: any) {
      onShowToast(`Error al eliminar fichada: ${err.message || 'Fallo de conexión'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCommentToJornada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentJornada || !newObsText.trim()) return;

    try {
      setIsSubmitting(true);
      const latestPunch = commentJornada.fichadasOriginales[commentJornada.fichadasOriginales.length - 1];
      if (latestPunch) {
        const updatedObs = latestPunch.observacion ? `${latestPunch.observacion} | ${newObsText.trim()}` : newObsText.trim();
        await updateSupabaseRegistro(latestPunch.id, { observacion: updatedObs });
      } else {
        const targetDay = commentJornada.fechaKey || selectedDate;
        const isoDate = new Date(`${targetDay}T12:00:00`).toISOString();
        await createSupabaseRegistro({
          usuario_id: commentJornada.usuarioId,
          tipo: 'Entrada',
          fecha: isoDate,
          observacion: newObsText.trim()
        });
      }

      onShowToast(`Observación registrada para ${commentJornada.usuarioNombre}.`);
      setNewObsText('');
      setCommentJornada(null);
      await onRefresh();
    } catch (err: any) {
      onShowToast(`Error al guardar observación: ${err.message || 'Fallo de conexión'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manejo de nueva fichada manual en Supabase
  const handleSaveFichada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalUsuarioId) {
      onShowToast('Por favor selecciona un chofer / empleado.');
      return;
    }

    try {
      setIsSubmitting(true);
      const isoDate = parseToIsoDate(modalFechaHora.slice(0, 10), modalFechaHora.slice(11, 16) || '12:00');
      await createSupabaseRegistro({
        usuario_id: modalUsuarioId,
        tipo: modalTipo,
        fecha: isoDate,
        observacion: modalObservacion || null
      });

      onShowToast(`Fichada de ${modalTipo} registrada con éxito en Supabase.`);
      setIsModalOpen(false);
      setModalObservacion('');
      await onRefresh();
    } catch (err: any) {
      onShowToast(`Error al guardar en Supabase: ${err.message || 'Fallo de conexión'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Exportar a CSV (respeta si está en Control Diario/Rango o en Historial)
  const handleExportCSV = () => {
    if (activeTab === 'diario') {
      const headers = ['Fecha', 'Estado', 'Legajo', 'Chofer / Empleado', 'Sector', 'Empresa', 'Primera Entrada', 'Última Salida', 'Total Horas', 'Horas Partes', 'Fichadas del Día', 'Observaciones'];
      const rows = jornadasPorFecha.map(j => {
        const fichadasStr = j.fichadasOriginales.map(f => {
          const d = new Date(f.fecha);
          const t = !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          return `${f.tipo}: ${t}`;
        }).join(' | ');
        return [
          `"${j.fechaKey}"`,
          `"${j.estadoPresencia}"`,
          `"${j.legajo}"`,
          `"${j.usuarioNombre}"`,
          `"${j.sector}"`,
          `"${j.empresa}"`,
          `"${j.primeraEntrada || ''}"`,
          `"${j.ultimaSalida || ''}"`,
          `"${formatHoursMinutes(j.totalHorasTrabajadas)}"`,
          `"${j.horasPartesTrabajo || 0}"`,
          `"${fichadasStr.replace(/"/g, '""')}"`,
          `"${(j.observaciones || []).join(' | ').replace(/"/g, '""')}"`
        ].join(',');
      });
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Asistencia_${normalizedRange.start}_al_${normalizedRange.end}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onShowToast('Reporte de asistencia por rango exportado a CSV.');
      return;
    }

    const headers = ['ID', 'Fecha', 'Hora', 'Tipo', 'Legajo', 'Nombre Chofer / Empleado', 'Sector', 'Empresa', 'Observación'];
    const rows = filteredHistorial.map(r => {
      const user = userMap.get(r.usuario_id);
      const dateObj = new Date(r.fecha);
      const fecha = isNaN(dateObj.getTime()) ? r.fecha : dateObj.toLocaleDateString();
      const hora = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleTimeString();
      return [
        r.id,
        `"${fecha}"`,
        `"${hora}"`,
        `"${r.tipo}"`,
        `"${user?.legajo || ''}"`,
        `"${user?.nombre || 'Usuario Desconocido'}"`,
        `"${user?.sector || ''}"`,
        `"${user?.empresa || ''}"`,
        `"${(r.observacion || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Fichadas_Entradas_Salidas_La_Hormiga_${normalizedRange.start}_al_${normalizedRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('Archivo CSV exportado exitosamente.');
  };

  // Sectores y empresas únicos para filtros
  const uniqueSectores = useMemo(() => {
    const set = new Set<string>();
    usuarios.forEach(u => { if (u.sector) set.add(u.sector); });
    return Array.from(set).sort();
  }, [usuarios]);

  const uniqueEmpresas = useMemo(() => {
    const set = new Set<string>();
    usuarios.forEach(u => { if (u.empresa) set.add(u.empresa); });
    return Array.from(set).sort();
  }, [usuarios]);

  const selectedEmpleadoObj = useMemo(() => {
    if (empleadoFilter === 'TODOS') return null;
    return userMap.get(empleadoFilter) || null;
  }, [empleadoFilter, userMap]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-[#F0C800]/10 border border-[#F0C800]/30 rounded-2xl text-[#F0C800] shrink-0">
              <Clock className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-black text-white tracking-tight font-display">
                  Control de Entradas y Salidas
                </h1>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Supabase En Vivo ({registros.length} fichadas)
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                Base de datos de fichadas, horarios de ingreso/egreso de choferes, cálculo de horas efectivas y cruce con partes de trabajo.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => onRefresh()}
              disabled={isLoading}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-[#1F2228] hover:bg-[#2D2D2D] text-slate-200 font-bold text-xs rounded-xl border border-[#2D2D2D] transition cursor-pointer disabled:opacity-50"
              title="Sincronizar últimos 60 días en vivo con Supabase"
            >
              <RefreshCw className={`w-4 h-4 text-[#F0C800] ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Sincronizando...' : 'Refrescar (60d)'}</span>
            </button>

            {onLoadFullHistory && (
              <button
                onClick={() => onLoadFullHistory()}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-[#1F2228] hover:bg-[#2D2D2D] text-slate-300 font-bold text-xs rounded-xl border border-[#2D2D2D] transition cursor-pointer disabled:opacity-50"
                title="Traer hasta 4.000 fichadas históricas desde Supabase"
              >
                <CalendarDays className="w-4 h-4 text-sky-400" />
                <span>Histórico Completo</span>
              </button>
            )}

            <button
              onClick={() => onSyncUsersToEmployees(usuarios)}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-[#1F2228] hover:bg-[#2D2D2D] text-[#F0C800] font-black text-xs rounded-xl border border-[#F0C800]/30 transition cursor-pointer"
              title="Sincronizar los usuarios de Supabase a la nómina de empleados general"
            >
              <Users className="w-4 h-4 text-[#F0C800]" />
              <span>Vincular con Nómina ({usuarios.length})</span>
            </button>

            <button
              onClick={() => {
                setModalUsuarioId(empleadoFilter !== 'TODOS' ? empleadoFilter : (visibleUsuariosSorted[0]?.id || usuarios[0]?.id || ''));
                setModalTipo('Entrada');
                setModalFechaHora(`${selectedDate}T${new Date().toTimeString().slice(0, 5)}`);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#F0C800] hover:bg-[#F6D84C] active:bg-[#DDA800] text-[#2D2D2D] font-black text-xs rounded-xl shadow-md shadow-[#F0C800]/20 transition cursor-pointer border border-[#DDA800]"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ Registrar Fichada</span>
            </button>
          </div>
        </div>

        {/* Bento Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-[#1F2228] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Presentes Hoy</div>
              <div className="text-2xl font-black text-emerald-400 font-mono mt-1">{stats.presentesHoy}</div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-medium">En jornada laboral activa</div>
            </div>
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#1F2228] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jornadas Completas</div>
              <div className="text-2xl font-black text-blue-400 font-mono mt-1">{stats.completadosHoy}</div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Entrada y salida registradas</div>
            </div>
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#1F2228] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">En Licencia / Ausentes</div>
              <div className="text-2xl font-black text-purple-400 font-mono mt-1">{stats.enLicenciaHoy}</div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Vacaciones o enfermedad</div>
            </div>
            <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400">
              <CalendarDays className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#1F2228] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nómina Supabase</div>
              <div className="text-2xl font-black text-[#F0C800] font-mono mt-1">{stats.totalUsuarios}</div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Personal activo en sistema</div>
            </div>
            <div className="p-2.5 bg-[#F0C800]/10 border border-[#F0C800]/20 rounded-xl text-[#F0C800]">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between gap-4 border-b border-[#2D2D2D] pb-3 flex-wrap">
        <div className="flex items-center gap-2 bg-[#16191F] border border-[#2D2D2D] p-1.5 rounded-xl flex-wrap">
          <button
            onClick={() => setActiveTab('diario')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition cursor-pointer ${
              activeTab === 'diario'
                ? 'bg-[#F0C800] text-[#2D2D2D] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>{isMultiDayRange ? `Control por Rango (${jornadasPorFecha.length})` : `Control Diario (${jornadasPorFecha.length})`}</span>
          </button>

          <button
            onClick={() => setActiveTab('historial')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition cursor-pointer ${
              activeTab === 'historial'
                ? 'bg-[#F0C800] text-[#2D2D2D] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Historial de Fichadas ({filteredHistorial.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('licencias')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition cursor-pointer ${
              activeTab === 'licencias'
                ? 'bg-[#F0C800] text-[#2D2D2D] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Licencias & Ausencias ({licencias.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('nomina')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition cursor-pointer ${
              activeTab === 'nomina'
                ? 'bg-[#F0C800] text-[#2D2D2D] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Personal & Categorías ({usuarios.length})</span>
          </button>
        </div>

        {/* Global Search and CSV Export */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar por chofer, legajo, sector..."
              className="bg-[#16191F] border border-[#2D2D2D] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F0C800] w-64"
            />
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1F2228] hover:bg-[#2D2D2D] text-slate-200 font-bold text-xs rounded-xl border border-[#2D2D2D] transition cursor-pointer"
            title="Exportar vista filtrada a CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Bar: Rango de Fechas + Empleado + Sector + Empresa */}
      <div className="bg-[#16191F] border border-[#2D2D2D] p-3.5 rounded-xl space-y-3 text-xs">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Rango de Fechas Desde / Hasta */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-[#1F2228] border border-[#2D2D2D] px-2.5 py-1.5 rounded-xl">
              <Calendar className="w-3.5 h-3.5 text-[#F0C800]" />
              <span className="text-slate-400 font-bold">Desde:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  const val = e.target.value;
                  setDateFrom(val);
                  if (!dateTo || val > dateTo) {
                    setDateTo(val);
                  }
                  setCurrentPage(1);
                }}
                className="bg-[#16191F] border border-[#2D2D2D] rounded-lg px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-[#F0C800]"
              />
              <span className="text-slate-400 font-bold ml-1">Hasta:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  const val = e.target.value;
                  setDateTo(val);
                  if (val && dateFrom && val !== dateFrom) {
                    setHistorialUseDateRange(true);
                  }
                  setCurrentPage(1);
                }}
                className="bg-[#16191F] border border-[#2D2D2D] rounded-lg px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-[#F0C800]"
              />
            </div>

            {/* Botones rápidos de período */}
            <div className="flex items-center gap-1 bg-[#1F2228] border border-[#2D2D2D] p-1 rounded-xl flex-wrap">
              <button
                type="button"
                onClick={() => applyDatePreset('hoy')}
                className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                  !isMultiDayRange && dateFrom === new Date().toISOString().slice(0, 10)
                    ? 'bg-[#F0C800] text-[#2D2D2D]'
                    : 'text-slate-300 hover:bg-[#2D2D2D]'
                }`}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('ayer')}
                className="px-2 py-1 rounded-lg font-bold text-slate-300 hover:bg-[#2D2D2D] transition cursor-pointer"
              >
                Ayer
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('7dias')}
                className="px-2 py-1 rounded-lg font-bold text-slate-300 hover:bg-[#2D2D2D] transition cursor-pointer"
              >
                7 Días
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('q1')}
                className="px-2 py-1 rounded-lg font-bold text-slate-300 hover:bg-[#2D2D2D] transition cursor-pointer"
                title="1 al 15 del mes seleccionado"
              >
                1ª Quincena
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('q2')}
                className="px-2 py-1 rounded-lg font-bold text-slate-300 hover:bg-[#2D2D2D] transition cursor-pointer"
                title="16 al fin del mes seleccionado"
              >
                2ª Quincena
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('mes')}
                className="px-2 py-1 rounded-lg font-bold text-slate-300 hover:bg-[#2D2D2D] transition cursor-pointer"
              >
                Este Mes
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('mes_ant')}
                className="px-2 py-1 rounded-lg font-bold text-slate-300 hover:bg-[#2D2D2D] transition cursor-pointer"
              >
                Mes Ant.
              </button>
            </div>
          </div>

          {activeTab === 'historial' && (
            <label className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#1F2228] border border-[#2D2D2D] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={historialUseDateRange || isMultiDayRange}
                onChange={(e) => {
                  setHistorialUseDateRange(e.target.checked);
                  if (!e.target.checked && isMultiDayRange) {
                    setDateTo(dateFrom);
                  }
                  setCurrentPage(1);
                }}
                className="accent-[#F0C800]"
              />
              <span className="font-bold">Filtrar historial por este rango de fechas</span>
            </label>
          )}
        </div>

        {/* Segunda fila de filtros: Empleado, Sector, Empresa, Tipo y Opciones de Rango */}
        <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-[#2D2D2D]/70">
          {/* Selector de Chofer / Empleado */}
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-[#F0C800]" />
            <span className="font-bold text-slate-300">Empleado:</span>
            <select
              value={empleadoFilter}
              onChange={(e) => {
                const val = e.target.value;
                setEmpleadoFilter(val);
                if (val !== 'TODOS') {
                  // Cuando elige un empleado específico, mostrar todos sus días en el rango por defecto
                  setOnlyDaysWithActivityInRange(false);
                  setRangeViewMode('detalle');
                } else {
                  setOnlyDaysWithActivityInRange(true);
                }
                setCurrentPage(1);
              }}
              className="bg-[#1F2228] border border-[#F0C800]/40 rounded-lg px-2.5 py-1 text-white font-bold focus:outline-none focus:border-[#F0C800] min-w-[220px]"
            >
              <option value="TODOS">Todos los empleados ({visibleUsuariosSorted.length})</option>
              {visibleUsuariosSorted.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nombre} {u.legajo ? `(Leg. ${u.legajo})` : ''}
                </option>
              ))}
            </select>
            {empleadoFilter !== 'TODOS' && (
              <button
                type="button"
                onClick={() => {
                  setEmpleadoFilter('TODOS');
                  setOnlyDaysWithActivityInRange(true);
                  setCurrentPage(1);
                }}
                className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold text-[11px] cursor-pointer"
                title="Quitar filtro de empleado"
              >
                ✕ Todos
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#F0C800]" />
            <span className="font-bold text-slate-300">Sector:</span>
            <select
              value={sectorFilter}
              onChange={(e) => {
                setSectorFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[#1F2228] border border-[#2D2D2D] rounded-lg px-2.5 py-1 text-white font-medium focus:outline-none focus:border-[#F0C800]"
            >
              <option value="TODOS">Todos los sectores</option>
              {uniqueSectores.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-[#F0C800]" />
            <span className="font-bold text-slate-300">Empresa:</span>
            <select
              value={empresaFilter}
              onChange={(e) => {
                setEmpresaFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[#1F2228] border border-[#2D2D2D] rounded-lg px-2.5 py-1 text-white font-medium focus:outline-none focus:border-[#F0C800]"
            >
              <option value="TODOS">Todas las empresas</option>
              {uniqueEmpresas.map(emp => (
                <option key={emp} value={emp}>{emp}</option>
              ))}
            </select>
          </div>

          {activeTab === 'diario' && isMultiDayRange && (
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <div className="flex items-center gap-1 bg-[#1F2228] p-0.5 rounded-lg border border-[#2D2D2D]">
                <button
                  type="button"
                  onClick={() => setRangeViewMode('detalle')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                    rangeViewMode === 'detalle' ? 'bg-[#F0C800] text-[#2D2D2D]' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Detalle Día por Día
                </button>
                <button
                  type="button"
                  onClick={() => setRangeViewMode('resumen_empleado')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                    rangeViewMode === 'resumen_empleado' ? 'bg-[#F0C800] text-[#2D2D2D]' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Resumen por Empleado ({resumenPorEmpleadoEnRango.length})
                </button>
              </div>

              {rangeViewMode === 'detalle' && (
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1F2228] border border-[#2D2D2D] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyDaysWithActivityInRange}
                    onChange={(e) => setOnlyDaysWithActivityInRange(e.target.checked)}
                    className="accent-[#F0C800]"
                  />
                  <span>Solo días con fichada/licencia</span>
                </label>
              )}
            </div>
          )}

          {activeTab === 'historial' && (
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-300">Tipo de Fichada:</span>
              <div className="flex items-center gap-1 bg-[#1F2228] p-0.5 rounded-lg border border-[#2D2D2D]">
                {(['TODOS', 'Entrada', 'Salida'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setTipoFilter(t);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-0.5 rounded text-xs font-bold transition cursor-pointer ${
                      tipoFilter === t ? 'bg-[#F0C800] text-[#2D2D2D]' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: CONTROL DIARIO & POR RANGO DE FECHAS */}
      {activeTab === 'diario' && (
        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Activity className="w-4 h-4 text-[#F0C800]" />
              <h2 className="font-bold text-white text-sm">
                {isMultiDayRange
                  ? `Asistencia del ${normalizedRange.start} al ${normalizedRange.end} (${rangoTotals.diasEnRango} días)`
                  : `Asistencia y Estado de Personal para el ${selectedDate}`}
              </h2>
              {selectedEmpleadoObj && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black bg-[#F0C800]/20 text-[#F0C800] border border-[#F0C800]/40">
                  {selectedEmpleadoObj.nombre} (Leg. {selectedEmpleadoObj.legajo || '-'})
                </span>
              )}
            </div>

            {/* KPIs rápidos del rango / empleado seleccionado */}
            <div className="flex items-center gap-3 flex-wrap text-xs font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-[#16191F] border border-[#2D2D2D] text-slate-300">
                Días c/ fichada: <strong className="text-emerald-400">{rangoTotals.diasActivos}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#16191F] border border-[#2D2D2D] text-slate-300">
                Marcaciones: <strong className="text-emerald-400">{rangoTotals.totalEntradas}E</strong> / <strong className="text-rose-400">{rangoTotals.totalSalidas}S</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#16191F] border border-[#F0C800]/30 text-slate-200">
                Total Horas: <strong className="text-[#F0C800]">{formatHoursMinutes(rangoTotals.totalHoras)}</strong>
              </span>
              {rangoTotals.totalPartesHs > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-[#16191F] border border-sky-500/30 text-slate-200">
                  Hs Partes: <strong className="text-sky-400">{rangoTotals.totalPartesHs.toFixed(1)} hs</strong>
                </span>
              )}
            </div>
          </div>

          {/* SUB-VISTA A: RESUMEN ACUMULADO POR EMPLEADO EN EL RANGO */}
          {isMultiDayRange && rangeViewMode === 'resumen_empleado' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#1F2228]/80 text-slate-400 border-b border-[#2D2D2D] font-mono uppercase tracking-wider">
                    <th className="p-3 pl-4">Legajo</th>
                    <th className="p-3">Chofer / Empleado</th>
                    <th className="p-3 text-center">Días con Fichada</th>
                    <th className="p-3 text-center">Jornadas Completas</th>
                    <th className="p-3 text-center">Licencias</th>
                    <th className="p-3 text-center">Entradas / Salidas</th>
                    <th className="p-3 text-right">Total Horas Rango</th>
                    <th className="p-3 text-right">Hs en Partes</th>
                    <th className="p-3 text-right pr-4">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2D2D2D]">
                  {resumenPorEmpleadoEnRango.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">
                        No hay datos de empleados para el rango seleccionado.
                      </td>
                    </tr>
                  ) : (
                    resumenPorEmpleadoEnRango.map(emp => (
                      <tr key={emp.usuarioId} className="hover:bg-[#1F2228]/50 transition">
                        <td className="p-3 pl-4 font-mono text-[#F0C800] font-bold">{emp.legajo}</td>
                        <td className="p-3">
                          <div className="font-bold text-white text-xs">{emp.usuarioNombre}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{emp.sector} • {emp.empresa}</div>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-400">
                          {emp.diasConFichada} / {rangoTotals.diasEnRango}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-blue-400">
                          {emp.jornadasCompletas}
                        </td>
                        <td className="p-3 text-center font-mono text-purple-300">
                          {emp.diasEnLicencia > 0 ? `${emp.diasEnLicencia} d` : '-'}
                        </td>
                        <td className="p-3 text-center font-mono">
                          <span className="text-emerald-400 font-bold">{emp.totalEntradas}E</span>
                          {' / '}
                          <span className="text-rose-400 font-bold">{emp.totalSalidas}S</span>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-[#F0C800] text-sm">
                          {formatHoursMinutes(emp.totalHorasFichadas)}
                        </td>
                        <td className="p-3 text-right font-mono text-sky-400 font-bold">
                          {emp.totalHorasPartes > 0 ? `${emp.totalHorasPartes.toFixed(1)} hs` : '-'}
                        </td>
                        <td className="p-3 text-right pr-4">
                          <button
                            type="button"
                            onClick={() => {
                              setEmpleadoFilter(emp.usuarioId);
                              setRangeViewMode('detalle');
                              setOnlyDaysWithActivityInRange(false);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#F0C800]/20 hover:bg-[#F0C800]/30 text-[#F0C800] border border-[#F0C800]/40 font-bold text-xs transition cursor-pointer"
                          >
                            Ver día por día
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* SUB-VISTA B: DETALLE DÍA POR DÍA (1 DÍA O RANGO DE FECHAS) */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#1F2228]/80 text-slate-400 border-b border-[#2D2D2D] font-mono uppercase tracking-wider">
                    {(isMultiDayRange || empleadoFilter !== 'TODOS') && (
                      <th className="p-3 pl-4">Fecha</th>
                    )}
                    <th className={`p-3 ${!(isMultiDayRange || empleadoFilter !== 'TODOS') ? 'pl-4' : ''}`}>Estado</th>
                    <th className="p-3">Legajo</th>
                    <th className="p-3">Chofer / Empleado</th>
                    <th className="p-3 text-right">Total Horas</th>
                    <th className="p-3 text-center">Fichadas del Día (Entradas / Salidas)</th>
                    <th className="p-3 text-center">Observaciones</th>
                    <th className="p-3 text-right pr-4">Acciones Rápida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2D2D2D]">
                  {jornadasPorFecha.length === 0 ? (
                    <tr>
                      <td colSpan={(isMultiDayRange || empleadoFilter !== 'TODOS') ? 8 : 7} className="p-8 text-center text-slate-500 font-medium">
                        {isMultiDayRange && onlyDaysWithActivityInRange
                          ? 'No hay fichadas registradas en este rango de fechas para los filtros actuales. Desmarca "Solo días con fichada/licencia" si quieres ver todos los días vacíos.'
                          : 'No se encontraron empleados ni registros de asistencia para los filtros seleccionados.'}
                      </td>
                    </tr>
                  ) : (
                    jornadasPorFecha.map((jornada) => {
                      const isPresente = jornada.estadoPresencia === 'PRESENTE_ACTIVO';
                      const isCompleto = jornada.estadoPresencia === 'JORNADA_COMPLETA';
                      const isLicencia = jornada.estadoPresencia === 'EN_LICENCIA';
                      const hasObs = jornada.observaciones && jornada.observaciones.length > 0;
                      const showFechaCol = isMultiDayRange || empleadoFilter !== 'TODOS';

                      return (
                        <tr 
                          key={`${jornada.fechaKey}__${jornada.usuarioId}`}
                          className={`hover:bg-[#1F2228]/50 transition ${
                            isPresente ? 'bg-emerald-500/5' : isCompleto ? 'bg-blue-500/5' : isLicencia ? 'bg-purple-500/5' : ''
                          }`}
                        >
                          {showFechaCol && (
                            <td className="p-3 pl-4 font-mono text-slate-200 font-bold whitespace-nowrap">
                              {formatDateDisplay(jornada.fechaKey)}
                            </td>
                          )}

                          <td className={`p-3 ${!showFechaCol ? 'pl-4' : ''}`}>
                            {isPresente && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                TRABAJANDO
                              </span>
                            )}
                            {isCompleto && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                FINALIZADO
                              </span>
                            )}
                            {isLicencia && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                <CalendarDays className="w-3 h-3" />
                                LICENCIA ({jornada.licenciaVinculada?.tipo})
                              </span>
                            )}
                            {jornada.estadoPresencia === 'SOLO_SALIDA' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                SOLO SALIDA
                              </span>
                            )}
                            {jornada.estadoPresencia === 'SIN_REGISTRO' && (
                              <span className="text-slate-500 text-[11px] font-mono">
                                Sin fichada
                              </span>
                            )}
                          </td>

                          <td className="p-3 font-mono text-slate-400 font-bold">
                            {jornada.legajo}
                          </td>

                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (empleadoFilter === jornada.usuarioId) {
                                  setEmpleadoFilter('TODOS');
                                  setOnlyDaysWithActivityInRange(true);
                                } else {
                                  setEmpleadoFilter(jornada.usuarioId);
                                  setOnlyDaysWithActivityInRange(false);
                                }
                              }}
                              className="text-left group cursor-pointer"
                              title="Clic para filtrar por este empleado"
                            >
                              <div className="font-bold text-white group-hover:text-[#F0C800] transition font-sans text-xs">
                                {jornada.usuarioNombre}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {jornada.sector} • {jornada.empresa}
                              </div>
                            </button>
                          </td>

                          <td className="p-3 text-right font-mono font-black text-[#F0C800] text-sm">
                            <div>{formatHoursMinutes(jornada.totalHorasTrabajadas)}</div>
                            {(jornada.horasPartesTrabajo || 0) > 0 && (
                              <div className="text-[10px] text-sky-400 font-bold">
                                Parte: {jornada.horasPartesTrabajo} hs
                              </div>
                            )}
                          </td>

                          {/* Secuencia de Badges de Marcaciones (Verde Entrada / Rojo Salida) */}
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {jornada.fichadasOriginales.length === 0 ? (
                                <span className="text-slate-600 font-mono text-[11px]">-</span>
                              ) : (
                                jornada.fichadasOriginales.map((fichada) => {
                                  const dObj = new Date(fichada.fecha);
                                  const dateStr = !isNaN(dObj.getTime()) ? dObj.toISOString().slice(0, 10) : jornada.fechaKey;
                                  const timeStr = !isNaN(dObj.getTime()) ? dObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '12:00';
                                  const isEntrada = fichada.tipo === 'Entrada';

                                  return (
                                    <button
                                      key={fichada.id}
                                      type="button"
                                      onClick={() => {
                                        setEditingPunch({
                                          id: fichada.id,
                                          usuarioNombre: jornada.usuarioNombre,
                                          legajo: jornada.legajo,
                                          tipo: fichada.tipo,
                                          fecha: dateStr,
                                          hora: timeStr,
                                          observacion: fichada.observacion || ''
                                        });
                                      }}
                                      title={`Haz clic para modificar o cambiar el horario de esta fichada #${fichada.id} (${fichada.tipo}: ${timeStr})`}
                                      className={`px-2 py-0.5 rounded font-mono font-bold text-xs border transition cursor-pointer hover:scale-105 active:scale-95 ${
                                        isEntrada
                                          ? 'bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border-emerald-500/40'
                                          : 'bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 border-rose-500/40'
                                      }`}
                                    >
                                      {timeStr}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </td>

                          {/* Observaciones y Comentarios */}
                          <td className="p-3 text-center">
                            <button
                              onClick={() => setCommentJornada(jornada)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                                hasObs
                                  ? 'bg-[#F0C800]/20 text-[#F0C800] border border-[#F0C800]/40 hover:bg-[#F0C800]/30'
                                  : 'bg-[#1F2228] text-slate-400 border border-[#2D2D2D] hover:text-white hover:border-slate-500'
                              }`}
                              title="Ver o añadir observaciones"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              {hasObs ? <span>{jornada.observaciones.length} obs</span> : <span>+ Comentario</span>}
                            </button>
                          </td>

                          {/* Acciones Rápida: + Entrada / + Salida con Hora y Comentario */}
                          <td className="p-3 text-right pr-4">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setQuickPunchUser({ id: jornada.usuarioId, nombre: jornada.usuarioNombre, legajo: jornada.legajo });
                                  setQuickPunchTipo('Entrada');
                                  const now = new Date();
                                  setQuickPunchTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
                                  setQuickPunchDate(jornada.fechaKey);
                                  setQuickPunchObs('');
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition cursor-pointer"
                                title="Marcar Entrada manual asignando hora exacta y comentario"
                              >
                                + Entrada
                              </button>

                              <button
                                onClick={() => {
                                  setQuickPunchUser({ id: jornada.usuarioId, nombre: jornada.usuarioNombre, legajo: jornada.legajo });
                                  setQuickPunchTipo('Salida');
                                  const now = new Date();
                                  setQuickPunchTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
                                  setQuickPunchDate(jornada.fechaKey);
                                  setQuickPunchObs('');
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-black bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                                title="Marcar Salida manual asignando hora exacta y comentario"
                              >
                                + Salida
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HISTORIAL COMPLETO DE FICHADAS (3.171+ REGISTROS) */}
      {activeTab === 'historial' && (
        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Clock className="w-4 h-4 text-[#F0C800]" />
              <h2 className="font-bold text-white text-sm">
                Historial de Registros en Supabase ({filteredHistorial.length} encontrados)
              </h2>
              {(historialUseDateRange || isMultiDayRange) && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/30">
                  {normalizedRange.start} → {normalizedRange.end}
                </span>
              )}
              {selectedEmpleadoObj && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {selectedEmpleadoObj.nombre}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">Filas por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-[#16191F] border border-[#2D2D2D] rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-[#F0C800]"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1F2228]/80 text-slate-400 border-b border-[#2D2D2D] font-mono uppercase tracking-wider">
                  <th className="p-3 pl-4">ID</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Hora</th>
                  <th className="p-3">Legajo</th>
                  <th className="p-3">Chofer / Empleado</th>
                  <th className="p-3">Sector</th>
                  <th className="p-3">Empresa</th>
                  <th className="p-3 pr-4">Observación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2D2D2D]">
                {paginatedHistorial.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">
                      No se encontraron registros de fichadas con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  paginatedHistorial.map((reg) => {
                    const user = userMap.get(reg.usuario_id);
                    const isEntrada = reg.tipo === 'Entrada';
                    const dateObj = new Date(reg.fecha);
                    const fechaStr = isNaN(dateObj.getTime()) ? reg.fecha : dateObj.toLocaleDateString();
                    const horaStr = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                    return (
                      <tr key={reg.id} className="hover:bg-[#1F2228]/50 transition">
                        <td className="p-3 pl-4 font-mono text-slate-500 text-[11px]">
                          #{reg.id}
                        </td>

                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            isEntrada 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          }`}>
                            {isEntrada ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                            {reg.tipo}
                          </span>
                        </td>

                        <td className="p-3 font-mono text-slate-200">
                          {fechaStr}
                        </td>

                        <td className="p-3 font-mono font-bold text-white">
                          {horaStr}
                        </td>

                        <td className="p-3 font-mono text-[#F0C800] font-bold">
                          {user?.legajo || '-'}
                        </td>

                        <td className="p-3">
                          <div className="font-bold text-white font-sans">
                            {user?.nombre || 'Usuario ID: ' + reg.usuario_id.slice(0, 8)}
                          </div>
                          {user?.email && (
                            <div className="text-[10px] text-slate-500">{user.email}</div>
                          )}
                        </td>

                        <td className="p-3 text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-[#1F2228] border border-[#2D2D2D] text-[10px]">
                            {user?.sector || '-'}
                          </span>
                        </td>

                        <td className="p-3 text-slate-400">
                          {user?.empresa || '-'}
                        </td>

                        <td className="p-3 pr-4 text-slate-400 font-mono text-[11px] max-w-xs truncate">
                          {reg.observacion || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 bg-[#1F2228] border-t border-[#2D2D2D] flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-mono">
            <div>
              Mostrando {filteredHistorial.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} al {Math.min(currentPage * pageSize, filteredHistorial.length)} de {filteredHistorial.length} registros ({registros.length} total)
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2.5 py-1 bg-[#16191F] hover:bg-[#2D2D2D] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded border border-[#2D2D2D] transition cursor-pointer"
              >
                « Primero
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 bg-[#16191F] hover:bg-[#2D2D2D] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded border border-[#2D2D2D] transition cursor-pointer"
              >
                ‹ Anterior
              </button>
              <span className="px-3 py-1 bg-[#16191F] text-[#F0C800] font-bold rounded border border-[#2D2D2D]">
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-2.5 py-1 bg-[#16191F] hover:bg-[#2D2D2D] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded border border-[#2D2D2D] transition cursor-pointer"
              >
                Siguiente ›
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="px-2.5 py-1 bg-[#16191F] hover:bg-[#2D2D2D] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded border border-[#2D2D2D] transition cursor-pointer"
              >
                Último »
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LICENCIAS Y AUSENCIAS */}
      {activeTab === 'licencias' && (
        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-[#F0C800]" />
              <h2 className="font-bold text-white text-sm">
                Registro de Licencias Médicas, Vacaciones y Ausencias ({licencias.length})
              </h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1F2228]/80 text-slate-400 border-b border-[#2D2D2D] font-mono uppercase tracking-wider">
                  <th className="p-3 pl-4">ID</th>
                  <th className="p-3">Empleado / Chofer</th>
                  <th className="p-3">Tipo de Licencia</th>
                  <th className="p-3">Fecha Inicio</th>
                  <th className="p-3">Fecha Fin</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 pr-4">Observación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2D2D2D]">
                {licencias.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">
                      No hay licencias registradas en Supabase.
                    </td>
                  </tr>
                ) : (
                  licencias.map((lic) => {
                    const user = userMap.get(lic.usuario_id);
                    return (
                      <tr key={lic.id} className="hover:bg-[#1F2228]/50 transition">
                        <td className="p-3 pl-4 font-mono text-slate-500">#{lic.id}</td>
                        <td className="p-3">
                          <div className="font-bold text-white">{user?.nombre || lic.usuario_id}</div>
                          <div className="text-[10px] text-slate-500 font-mono">Legajo: {user?.legajo || '-'}</div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                            {lic.tipo}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-200">{lic.fecha_inicio}</td>
                        <td className="p-3 font-mono text-slate-200">{lic.fecha_fin}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                            {lic.estado}
                          </span>
                        </td>
                        <td className="p-3 pr-4 text-slate-400">{lic.observacion || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: NÓMINA SUPABASE Y CATEGORÍAS */}
      {activeTab === 'nomina' && (
        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#F0C800]" />
              <div>
                <h2 className="font-bold text-white text-sm">
                  Personal Vinculado desde Supabase ({usuarios.length} usuarios)
                </h2>
                <p className="text-xs text-slate-400">
                  Tabla de personal activa en la base de datos de Supabase con asignación de categoría y tarifa horaria.
                </p>
              </div>
            </div>

            <button
              onClick={() => onSyncUsersToEmployees(usuarios)}
              className="flex items-center gap-2 px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] font-black text-xs rounded-xl shadow-md transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#2D2D2D]" />
              <span>Sincronizar a Nómina General ({usuarios.length})</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1F2228]/80 text-slate-400 border-b border-[#2D2D2D] font-mono uppercase tracking-wider">
                  <th className="p-3 pl-4">Legajo</th>
                  <th className="p-3">Nombre y Apellido</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Sector</th>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Categoría</th>
                  <th className="p-3 text-right">Valor Hora</th>
                  <th className="p-3 text-center">Frecuencia</th>
                  <th className="p-3 pr-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2D2D2D]">
                {usuarios.map((u) => {
                  const cat = u.categoria_id ? categoriaMap.get(u.categoria_id) : undefined;
                  return (
                    <tr key={u.id} className="hover:bg-[#1F2228]/50 transition">
                      <td className="p-3 pl-4 font-mono font-bold text-[#F0C800]">{u.legajo || '-'}</td>
                      <td className="p-3 font-bold text-white">{u.nombre}</td>
                      <td className="p-3 text-slate-400 font-mono">{u.email || '-'}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-[#1F2228] border border-[#2D2D2D] text-slate-300">
                          {u.sector || 'General'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">{u.empresa || 'La Hormiga'}</td>
                      <td className="p-3 font-bold text-blue-400">{cat?.nombre || '-'}</td>
                      <td className="p-3 text-right font-mono font-black text-[#F0C800]">
                        {cat?.valor_hora ? `$${cat.valor_hora.toLocaleString()}` : '-'}
                      </td>
                      <td className="p-3 text-center text-slate-400">{u.frecuencia_pago || 'Mensual'}</td>
                      <td className="p-3 pr-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.aprobado !== false 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {u.aprobado !== false ? 'ACTIVO' : 'INACTIVO'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL PARA NUEVA FICHADA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2D2D2D] pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#F0C800]" />
                <h3 className="font-bold text-white text-base">Registrar Fichada en Supabase</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1F2228]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveFichada} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Chofer / Empleado (*)</label>
                <select
                  value={modalUsuarioId}
                  onChange={(e) => setModalUsuarioId(e.target.value)}
                  className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-[#F0C800]"
                  required
                >
                  <option value="">Seleccione un empleado...</option>
                  {usuarios.filter(u => visibleUserIdsSet.has(u.id)).map(u => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} (Legajo: {u.legajo || 'N/A'} - {u.sector || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Tipo de Fichada (*)</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setModalTipo('Entrada')}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl font-black transition cursor-pointer border ${
                      modalTipo === 'Entrada'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                        : 'bg-[#1F2228] text-slate-400 border-[#2D2D2D]'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    <span>ENTRADA / INGRESO</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalTipo('Salida')}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl font-black transition cursor-pointer border ${
                      modalTipo === 'Salida'
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500'
                        : 'bg-[#1F2228] text-slate-400 border-[#2D2D2D]'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>SALIDA / EGRESO</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Fecha y Hora (*)</label>
                <input
                  type="datetime-local"
                  value={modalFechaHora}
                  onChange={(e) => setModalFechaHora(e.target.value)}
                  className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-[#F0C800]"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Observación u Obra (Opcional)</label>
                <textarea
                  value={modalObservacion}
                  onChange={(e) => setModalObservacion(e.target.value)}
                  placeholder="Ej: Ingreso puntual a base central, salida a Obra Tigre..."
                  rows={2}
                  className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl p-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-[#1F2228] hover:bg-[#2D2D2D] text-slate-300 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#F0C800] hover:bg-[#F6D84C] active:bg-[#DDA800] text-[#2D2D2D] font-black rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar en Supabase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE MARCACIÓN RÁPIDA CON HORA EDITABLE Y OBSERVACIÓN */}
      {quickPunchUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2D2D2D] pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#F0C800]" />
                <h3 className="font-bold text-white text-base">
                  Registrar Fichada de {quickPunchTipo}
                </h3>
              </div>
              <button
                onClick={() => setQuickPunchUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1F2228] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveQuickPunch} className="space-y-4 text-xs">
              <div className="bg-[#1F2228] p-3 rounded-xl border border-[#2D2D2D] flex items-center justify-between">
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Empleado / Chofer</div>
                  <div className="text-white font-bold text-sm mt-0.5">{quickPunchUser.nombre}</div>
                  <div className="text-slate-500 font-mono text-[11px]">Legajo: {quickPunchUser.legajo}</div>
                </div>
                <div className={`px-2.5 py-1 rounded-lg font-black text-xs border ${
                  quickPunchTipo === 'Entrada' 
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                }`}>
                  {quickPunchTipo.toUpperCase()}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Fecha (*)</label>
                  <input
                    type="date"
                    value={quickPunchDate}
                    onChange={(e) => setQuickPunchDate(e.target.value)}
                    className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-[#F0C800]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Hora Exacta (*)</label>
                  <input
                    type="time"
                    step="1"
                    value={quickPunchTime}
                    onChange={(e) => setQuickPunchTime(e.target.value)}
                    className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl px-3 py-2 text-white font-mono font-bold text-sm focus:outline-none focus:border-[#F0C800]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Observaciones / Comentario (Opcional)</label>
                <textarea
                  value={quickPunchObs}
                  onChange={(e) => setQuickPunchObs(e.target.value)}
                  placeholder="Ej: Marcación manual autorizada por capataz, ingreso directo a Obra Pilar, etc."
                  rows={3}
                  className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl p-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickPunchUser(null)}
                  className="px-4 py-2 bg-[#1F2228] hover:bg-[#2D2D2D] text-slate-300 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-5 py-2 font-black rounded-xl text-slate-900 transition cursor-pointer ${
                    quickPunchTipo === 'Entrada'
                      ? 'bg-emerald-400 hover:bg-emerald-300'
                      : 'bg-rose-400 hover:bg-rose-300'
                  }`}
                >
                  {isSubmitting ? 'Guardando...' : `Confirmar ${quickPunchTipo}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE COMENTARIOS Y OBSERVACIONES DE JORNADA */}
      {commentJornada && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2D2D2D] pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#F0C800]" />
                <h3 className="font-bold text-white text-base">Observaciones y Comentarios</h3>
              </div>
              <button
                onClick={() => setCommentJornada(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1F2228] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#1F2228] p-3 rounded-xl border border-[#2D2D2D]">
              <div className="text-white font-bold text-sm">{commentJornada.usuarioNombre}</div>
              <div className="text-slate-400 text-xs font-mono">
                Legajo: {commentJornada.legajo} | Sector: {commentJornada.sector} | Fecha: {commentJornada.fechaKey || selectedDate}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-slate-300 font-bold text-xs">Comentarios Registrados en el Día:</label>
              {commentJornada.observaciones && commentJornada.observaciones.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {commentJornada.observaciones.map((obs, idx) => (
                    <div key={idx} className="bg-[#1F2228] border border-[#2D2D2D] p-2.5 rounded-xl text-xs text-slate-200 flex items-start gap-2">
                      <MessageCircle className="w-4 h-4 text-[#F0C800] shrink-0 mt-0.5" />
                      <span>{obs}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-slate-500 text-xs italic bg-[#1F2228] p-3 rounded-xl border border-[#2D2D2D]">
                  No hay comentarios u observaciones anotadas para esta jornada.
                </div>
              )}
            </div>

            <form onSubmit={handleAddCommentToJornada} className="space-y-3 pt-2">
              <label className="block text-slate-300 font-bold text-xs">Añadir Nuevo Comentario / Observación:</label>
              <textarea
                value={newObsText}
                onChange={(e) => setNewObsText(e.target.value)}
                placeholder="Escribe aquí un comentario u observación para la jornada de hoy..."
                rows={3}
                className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl p-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F0C800]"
                required
              />

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setCommentJornada(null)}
                  className="px-4 py-2 bg-[#1F2228] hover:bg-[#2D2D2D] text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] font-black text-xs rounded-xl transition cursor-pointer"
                >
                  {isSubmitting ? 'Guardando...' : 'Añadir Comentario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE EDICIÓN / ELIMINACIÓN DE FICHADA EXISTENTE */}
      {editingPunch && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2D2D2D] pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#F0C800]" />
                <h3 className="font-bold text-white text-base">
                  Editar Fichada de {editingPunch.tipo}
                </h3>
              </div>
              <button
                onClick={() => setEditingPunch(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1F2228] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdatePunch} className="space-y-4 text-xs">
              <div className="bg-[#1F2228] p-3 rounded-xl border border-[#2D2D2D] flex items-center justify-between">
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Empleado / Chofer</div>
                  <div className="text-white font-bold text-sm mt-0.5">{editingPunch.usuarioNombre}</div>
                  <div className="text-slate-500 font-mono text-[11px]">Legajo: {editingPunch.legajo} | ID Registro: #{editingPunch.id}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Tipo de Fichada</label>
                  <select
                    value={editingPunch.tipo}
                    onChange={(e) => setEditingPunch({ ...editingPunch, tipo: e.target.value as 'Entrada' | 'Salida' })}
                    className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-[#F0C800]"
                  >
                    <option value="Entrada">ENTRADA</option>
                    <option value="Salida">SALIDA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Hora Exacta (*)</label>
                  <input
                    type="time"
                    step="1"
                    value={editingPunch.hora}
                    onChange={(e) => setEditingPunch({ ...editingPunch, hora: e.target.value })}
                    className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl px-3 py-2 text-white font-mono font-bold text-sm focus:outline-none focus:border-[#F0C800]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Fecha (*)</label>
                <input
                  type="date"
                  value={editingPunch.fecha}
                  onChange={(e) => setEditingPunch({ ...editingPunch, fecha: e.target.value })}
                  className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-[#F0C800]"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Observaciones / Comentarios</label>
                <textarea
                  value={editingPunch.observacion}
                  onChange={(e) => setEditingPunch({ ...editingPunch, observacion: e.target.value })}
                  placeholder="Escribe comentarios u observaciones adicionales..."
                  rows={2}
                  className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl p-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#2D2D2D]">
                <button
                  type="button"
                  onClick={handleDeletePunch}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold rounded-xl transition cursor-pointer border border-rose-500/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Fichada</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPunch(null)}
                    className="px-3 py-2 bg-[#1F2228] hover:bg-[#2D2D2D] text-slate-300 font-bold rounded-xl transition cursor-pointer"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] font-black rounded-xl transition cursor-pointer"
                  >
                    {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={isConfirmDeletePunchOpen && !!editingPunch}
        title="¿Realmente desea eliminar esta fichada de asistencia?"
        itemName={editingPunch ? `Fichada de ${editingPunch.tipo} (${editingPunch.hora} hs) - ${editingPunch.usuarioNombre}` : ''}
        onConfirm={confirmDeletePunch}
        onCancel={() => setIsConfirmDeletePunchOpen(false)}
      />
    </div>
  );
};
