import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Calendar,
  Check,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Truck,
  Users,
  Warehouse,
  Wrench,
  X,
} from 'lucide-react';
import {
  DispatchAssignment,
  DispatchBoardPlace,
  DispatchBoardState,
  DispatchDailySegment,
  DispatchEventType,
  DispatchMovementLog,
  DispatchTimeSlot,
  Employee,
  Obra,
  UserSession,
  Vehicle,
} from '../types';

export { DEFAULT_DISPATCH_PLACES, createInitialDispatchBoardState } from '../utils/dispatchBoardInit';
import { DEFAULT_DISPATCH_PLACES } from '../utils/dispatchBoardInit';

interface PizarraDespachoSectionProps {
  boardState: DispatchBoardState;
  obras: Obra[];
  employees: Employee[];
  fleet: Vehicle[];
  userSession?: UserSession | null;
  isSaving?: boolean;
  saveError?: string | null;
  onSaveBoardState: (nextState: DispatchBoardState) => Promise<boolean> | void;
  onCreateObra: (obra: Obra) => Promise<boolean> | void;
  onOpenObraDetail?: (obra: Obra) => void;
}

type DragPayload =
  | { kind: 'EMPLOYEE'; employeeId: string }
  | { kind: 'VEHICLE'; vehicleId: string }
  | { kind: 'ASSIGNMENT'; assignmentId: string }
  | { kind: 'ARROW_EVENT'; assignmentId: string };

interface LocationTarget {
  locationType: 'OBRA' | 'LUGAR';
  locationId: string;
  nombre: string;
  numero?: string;
  place?: DispatchBoardPlace;
  obra?: Obra;
}

const getTodayLocalISO = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getCurrentLocalHHMM = (): string => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const inferTurnoFromHHMM = (hhmm?: string): DispatchTimeSlot => {
  if (!hhmm) return 'MAÑANA';
  const [hStr, mStr] = hhmm.split(':');
  const mins = (parseInt(hStr, 10) || 0) * 60 + (parseInt(mStr, 10) || 0);
  if (mins < 12 * 60 + 30) return 'MAÑANA';
  if (mins < 14 * 60) return 'MEDIODIA';
  return 'TARDE';
};

const getVehicleCode = (v?: Vehicle | null): string => {
  if (!v) return '';
  return (v.codigoInterno || v.codigoEquipo || v.codigo || v.id || '').trim();
};

const getEmployeeName = (e?: Employee | null): string => {
  if (!e) return 'Sin nombre';
  return (e.nombreApellido || e.nombre || 'Sin nombre').trim();
};

const getEventShortBadge = (eventType: DispatchEventType) => {
  switch (eventType) {
    case 'DETENIDO_ROTURA':
      return { text: '🛑 Detenido x Rotura', cls: 'bg-rose-500/25 text-rose-200 border-rose-500/50' };
    case 'ROTURA':
      return { text: '⚠️ Máq. con Rotura', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    case 'FLETE':
      return { text: '🚚 Flete', cls: 'bg-amber-500/20 text-amber-200 border-amber-500/40' };
    case 'CAMBIO_EQUIPO':
      return { text: '🔄 Cambio Equipo', cls: 'bg-purple-500/20 text-purple-200 border-purple-500/40' };
    case 'TALLER':
      return { text: '🔧 Taller', cls: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40' };
    case 'TRASLADO':
      return { text: '🏗️ Cambio Obra', cls: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40' };
    default:
      return { text: '📍 Inicio', cls: 'bg-slate-800 text-slate-300 border-slate-700' };
  }
};

export const PizarraDespachoSection: React.FC<PizarraDespachoSectionProps> = ({
  boardState,
  obras,
  employees,
  fleet,
  userSession,
  isSaving = false,
  saveError = null,
  onSaveBoardState,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayLocalISO());
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyFreeInTopBar, setShowOnlyFreeInTopBar] = useState(false);

  // Top Popover Drawer: 'NONE' | 'VISIBILITY' | 'OBRAS_REALES' | 'NEW_LUGAR'
  const [topDrawer, setTopDrawer] = useState<'NONE' | 'VISIBILITY' | 'OBRAS_REALES' | 'NEW_LUGAR'>('NONE');
  const [visibilityTab, setVisibilityTab] = useState<'EQUIPOS' | 'PERSONAL'>('EQUIPOS');
  const [drawerSearch, setDrawerSearch] = useState('');

  // Quick New Lugar (without creating formal Obra in DB)
  const [newPlaceName, setNewPlaceName] = useState('');
  const [newPlaceTipo, setNewPlaceTipo] = useState<DispatchBoardPlace['tipo']>('OBRA_TEMPORAL');

  // 1-Click selection from top strip (click Machine and/or Person, then click container)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // Drag & Drop state
  const dragPayloadRef = useRef<DragPayload | null>(null);
  const [hoverLocationKey, setHoverLocationKey] = useState<string | null>(null);
  const [hoverAssignmentId, setHoverAssignmentId] = useState<string | null>(null);

  // Live SVG Arrow while dragging "➔" from a row
  const cardRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const [arrowDragState, setArrowDragState] = useState<{
    assignmentId: string;
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  } | null>(null);

  // Active "➔" Event Popover on a row
  const [activeArrowCardId, setActiveArrowCardId] = useState<string | null>(null);
  const [arrowEventType, setArrowEventType] = useState<DispatchEventType>('DETENIDO_ROTURA');
  const [arrowTargetLocationKey, setArrowTargetLocationKey] = useState<string>('SAME');
  const [arrowNewVehicleId, setArrowNewVehicleId] = useState<string>('');
  const [arrowHora, setArrowHora] = useState<string>(() => getCurrentLocalHHMM());
  const [arrowDetalle, setArrowDetalle] = useState<string>('');

  // Quick "+ Agregar" inline inside a container
  const [quickAddLocKey, setQuickAddLocKey] = useState<string | null>(null);
  const [quickAddVehId, setQuickAddVehId] = useState<string>('');
  const [quickAddEmpId, setQuickAddEmpId] = useState<string>('');

  useEffect(() => {
    if (!arrowDragState) return;
    const handleDragOverWindow = (e: DragEvent) => {
      if (e.clientX === 0 && e.clientY === 0) return;
      setArrowDragState((prev) =>
        prev ? { ...prev, currX: e.clientX, currY: e.clientY } : null
      );
    };
    window.addEventListener('dragover', handleDragOverWindow);
    return () => window.removeEventListener('dragover', handleDragOverWindow);
  }, [arrowDragState]);

  // Active company employees & vehicles
  const activeEmployees = useMemo(
    () =>
      employees
        .filter((e) => !e.archivado && e.estado !== 'INACTIVO')
        .sort((a, b) => getEmployeeName(a).localeCompare(getEmployeeName(b))),
    [employees]
  );

  const activeVehicles = useMemo(
    () =>
      fleet
        .filter((v) => !v.archivado && v.estado !== 'FUERA_DE_SERVICIO')
        .sort((a, b) =>
          getVehicleCode(a).localeCompare(getVehicleCode(b), 'es', { numeric: true })
        ),
    [fleet]
  );

  const employeeMap = useMemo(() => {
    const m = new Map<string, Employee>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  const vehicleMap = useMemo(() => {
    const m = new Map<string, Vehicle>();
    fleet.forEach((v) => m.set(v.id, v));
    return m;
  }, [fleet]);

  const customPlaces = useMemo(() => boardState.places || [], [boardState.places]);
  const assignments = useMemo(() => boardState.assignments || [], [boardState.assignments]);
  const dailySegments = useMemo(() => boardState.dailySegments || [], [boardState.dailySegments]);
  const hiddenObraIds = useMemo(() => new Set(boardState.hiddenObraIds || []), [boardState.hiddenObraIds]);
  const hiddenEmployeeIds = useMemo(
    () => new Set(boardState.hiddenEmployeeIds || []),
    [boardState.hiddenEmployeeIds]
  );
  const hiddenVehicleIds = useMemo(
    () => new Set(boardState.hiddenVehicleIds || []),
    [boardState.hiddenVehicleIds]
  );

  const employeeAssignmentMap = useMemo(() => {
    const m = new Map<string, DispatchAssignment>();
    assignments.forEach((a) => {
      if (a.employeeId) m.set(a.employeeId, a);
    });
    return m;
  }, [assignments]);

  const vehicleAssignmentMap = useMemo(() => {
    const m = new Map<string, DispatchAssignment>();
    assignments.forEach((a) => {
      if (a.vehicleId) m.set(a.vehicleId, a);
    });
    return m;
  }, [assignments]);

  // Visible Equipos & Visible Personal configured by user
  const visibleVehicles = useMemo(
    () =>
      activeVehicles.filter(
        (v) => !hiddenVehicleIds.has(v.id) || vehicleAssignmentMap.has(v.id)
      ),
    [activeVehicles, hiddenVehicleIds, vehicleAssignmentMap]
  );

  const visibleEmployees = useMemo(
    () =>
      activeEmployees.filter(
        (e) => !hiddenEmployeeIds.has(e.id) || employeeAssignmentMap.has(e.id)
      ),
    [activeEmployees, hiddenEmployeeIds, employeeAssignmentMap]
  );

  // All containers on the board (Places + Called Real Obras)
  const allLocationTargets = useMemo<LocationTarget[]>(() => {
    const placeTargets: LocationTarget[] = customPlaces.map((p) => ({
      locationType: 'LUGAR',
      locationId: p.id,
      nombre: p.nombre,
      place: p,
    }));

    const assignedObraIds = new Set(
      assignments.filter((a) => a.locationType === 'OBRA').map((a) => a.locationId)
    );

    const obraTargets: LocationTarget[] = obras
      .filter((o) => {
        if (assignedObraIds.has(o.id)) return true;
        if (o.archivado || o.activa === false) return false;
        if (hiddenObraIds.has(o.id)) return false;
        return true;
      })
      .sort((a, b) => (a.nombreObra || '').localeCompare(b.nombreObra || ''))
      .map((o) => ({
        locationType: 'OBRA',
        locationId: o.id,
        nombre: o.nombreObra,
        numero: o.numero,
        obra: o,
      }));

    return [...placeTargets, ...obraTargets];
  }, [customPlaces, obras, assignments, hiddenObraIds]);

  const locationLookup = useMemo(() => {
    const map = new Map<string, LocationTarget>();
    allLocationTargets.forEach((t) => map.set(`${t.locationType}:${t.locationId}`, t));
    obras.forEach((o) => {
      const k = `OBRA:${o.id}`;
      if (!map.has(k)) {
        map.set(k, {
          locationType: 'OBRA',
          locationId: o.id,
          nombre: o.nombreObra,
          numero: o.numero,
          obra: o,
        });
      }
    });
    return map;
  }, [allLocationTargets, obras]);

  const getLocationLabel = (locationType: 'OBRA' | 'LUGAR', locationId: string): string => {
    return locationLookup.get(`${locationType}:${locationId}`)?.nombre || 'Ubicación';
  };

  // Top strip filtered pills
  const topStripVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleVehicles.filter((v) => {
      if (showOnlyFreeInTopBar && vehicleAssignmentMap.has(v.id)) return false;
      if (!q) return true;
      return `${getVehicleCode(v)} ${v.modeloMarca || ''} ${v.patente || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [visibleVehicles, showOnlyFreeInTopBar, vehicleAssignmentMap, searchQuery]);

  const topStripEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleEmployees.filter((e) => {
      if (showOnlyFreeInTopBar && employeeAssignmentMap.has(e.id)) return false;
      if (!q) return true;
      return `${getEmployeeName(e)} ${e.legajo || ''}`.toLowerCase().includes(q);
    });
  }, [visibleEmployees, showOnlyFreeInTopBar, employeeAssignmentMap, searchQuery]);

  // Daily segments for a card on selectedDate
  const getDailySegmentsForResource = (empId?: string, vehId?: string): DispatchDailySegment[] => {
    if (!empId && !vehId) return [];
    return dailySegments
      .filter(
        (s) =>
          s.fecha === selectedDate &&
          ((empId && s.employeeId === empId) || (vehId && s.vehicleId === vehId))
      )
      .slice()
      .sort(
        (a, b) =>
          (a.horaInicio || '').localeCompare(b.horaInicio || '') ||
          (a.createdAt || '').localeCompare(b.createdAt || '')
      );
  };

  // Save state to Supabase
  const commitBoardMutation = (
    nextAssignments: DispatchAssignment[],
    logEntry?: Omit<DispatchMovementLog, 'id' | 'timestamp' | 'usuario'>,
    extraPatch?: Partial<DispatchBoardState>
  ) => {
    const now = new Date().toISOString();
    const cleaned = nextAssignments.filter((a) => Boolean(a.employeeId || a.vehicleId));
    const usuario = userSession?.nombre || userSession?.username || 'Usuario';
    const nextHistory = logEntry
      ? [
          {
            id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: now,
            fecha: logEntry.fecha || selectedDate,
            usuario,
            ...logEntry,
          },
          ...(boardState.history || []),
        ].slice(0, 150)
      : boardState.history || [];

    onSaveBoardState({
      ...boardState,
      ...extraPatch,
      assignments: cleaned,
      history: nextHistory,
      updatedAt: now,
    });
  };

  // Append step to daily chain
  const appendSegmentToDailyChain = (params: {
    fecha: string;
    horaInicio: string;
    eventType: DispatchEventType;
    employeeId?: string;
    vehicleId?: string;
    replacedVehicleId?: string;
    replacedVehicleLabel?: string;
    prevAssignment?: DispatchAssignment;
    toLocationType?: 'OBRA' | 'LUGAR';
    toLocationId?: string;
    toLocationLabel: string;
    tituloEvento?: string;
  }): DispatchDailySegment[] => {
    const {
      fecha,
      horaInicio,
      eventType,
      employeeId,
      vehicleId,
      replacedVehicleId,
      replacedVehicleLabel,
      prevAssignment,
      toLocationType,
      toLocationId,
      toLocationLabel,
      tituloEvento,
    } = params;

    const nowISO = new Date().toISOString();
    const usuario = userSession?.nombre || userSession?.username || 'Usuario';
    const list = [...dailySegments];

    const matchesResource = (s: DispatchDailySegment) =>
      s.fecha === fecha &&
      ((employeeId && s.employeeId === employeeId) ||
        (vehicleId && s.vehicleId === vehicleId) ||
        (replacedVehicleId && s.vehicleId === replacedVehicleId));

    const existingToday = list.filter(matchesResource);

    if (prevAssignment && existingToday.length === 0) {
      const prevLocLabel = getLocationLabel(prevAssignment.locationType, prevAssignment.locationId);
      const prevStart = prevAssignment.horaInicioTramo || '08:00';
      list.push({
        id: `seg-init-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        fecha,
        horaInicio: prevStart,
        horaFin: horaInicio,
        turno: prevAssignment.turno || inferTurnoFromHHMM(prevStart),
        eventType: 'ASIGNACION',
        locationType: prevAssignment.locationType,
        locationId: prevAssignment.locationId,
        locationLabel: prevLocLabel,
        nextLocationLabel: toLocationLabel !== prevLocLabel ? toLocationLabel : undefined,
        employeeId: prevAssignment.employeeId || employeeId,
        vehicleId: prevAssignment.vehicleId || replacedVehicleId || vehicleId,
        createdAt: prevAssignment.assignedAt || nowISO,
        usuario,
      });
    } else {
      for (let i = list.length - 1; i >= 0; i--) {
        const seg = list[i];
        if (matchesResource(seg) && !seg.horaFin) {
          list[i] = {
            ...seg,
            horaFin: horaInicio,
            nextLocationLabel:
              toLocationLabel && toLocationLabel !== seg.locationLabel
                ? toLocationLabel
                : seg.nextLocationLabel,
          };
          break;
        }
      }
    }

    list.push({
      id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fecha,
      horaInicio,
      turno: inferTurnoFromHHMM(horaInicio),
      eventType,
      locationType: toLocationType,
      locationId: toLocationId,
      locationLabel: toLocationLabel,
      fromLocationType: prevAssignment?.locationType,
      fromLocationId: prevAssignment?.locationId,
      employeeId,
      vehicleId,
      replacedVehicleId,
      replacedVehicleLabel,
      tituloEvento: tituloEvento?.trim() || undefined,
      createdAt: nowISO,
      usuario,
    });

    return list;
  };

  // Assign Employee and/or Vehicle to a Container
  const assignResourcesToLocation = (
    target: { locationType: 'OBRA' | 'LUGAR'; locationId: string },
    opts: { employeeId?: string; vehicleId?: string }
  ) => {
    const now = new Date().toISOString();
    const empId = opts.employeeId || undefined;
    const vehId = opts.vehicleId || undefined;
    if (!empId && !vehId) return;

    const prevAsg =
      (empId ? employeeAssignmentMap.get(empId) : undefined) ||
      (vehId ? vehicleAssignmentMap.get(vehId) : undefined);

    const horaInicio = getCurrentLocalHHMM();
    const toLabel = getLocationLabel(target.locationType, target.locationId);
    const isMoving = Boolean(
      prevAsg &&
        (prevAsg.locationType !== target.locationType || prevAsg.locationId !== target.locationId)
    );
    const eventType: DispatchEventType =
      target.locationId === 'place-taller'
        ? 'TALLER'
        : isMoving
        ? 'TRASLADO'
        : 'ASIGNACION';

    const updated = assignments.map((a) => {
      const nextEmp = empId && a.employeeId === empId ? undefined : a.employeeId;
      const nextVeh = vehId && a.vehicleId === vehId ? undefined : a.vehicleId;
      if (nextEmp !== a.employeeId || nextVeh !== a.vehicleId) {
        return { ...a, employeeId: nextEmp, vehicleId: nextVeh, updatedAt: now };
      }
      return a;
    });

    const newAssignment: DispatchAssignment = {
      id: `asg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      locationType: target.locationType,
      locationId: target.locationId,
      employeeId: empId,
      vehicleId: vehId,
      turno: inferTurnoFromHHMM(horaInicio),
      horaInicioTramo: horaInicio,
      estadoOperativo: target.locationId === 'place-taller' ? 'EN_REPARACION' : 'OPERATIVO',
      assignedAt: now,
      updatedAt: now,
    };

    const nextDailySegments = appendSegmentToDailyChain({
      fecha: selectedDate,
      horaInicio,
      eventType,
      employeeId: empId,
      vehicleId: vehId,
      prevAssignment: prevAsg,
      toLocationType: target.locationType,
      toLocationId: target.locationId,
      toLocationLabel: toLabel,
    });

    commitBoardMutation([newAssignment, ...updated], undefined, {
      dailySegments: nextDailySegments,
    });
  };

  // Editing "1° Empezó en..." origin picker for a card
  const [editingOriginCardId, setEditingOriginCardId] = useState<string | null>(null);

  // Pair onto existing row
  const pairOntoAssignment = (
    targetAssignmentId: string,
    incoming: { employeeId?: string; vehicleId?: string }
  ) => {
    const targetCard = assignments.find((a) => a.id === targetAssignmentId);
    if (!targetCard) return;

    const now = new Date().toISOString();
    const horaInicio = getCurrentLocalHHMM();
    const empId = incoming.employeeId || targetCard.employeeId;
    const vehId = incoming.vehicleId || targetCard.vehicleId;

    const isSwappingMachine = Boolean(
      incoming.vehicleId && targetCard.vehicleId && incoming.vehicleId !== targetCard.vehicleId
    );
    const newVeh = incoming.vehicleId ? vehicleMap.get(incoming.vehicleId) : undefined;
    const newVehLabel = newVeh ? `${getVehicleCode(newVeh)} ${newVeh.modeloMarca}` : undefined;

    const stripped = assignments.map((a) => {
      if (a.id === targetAssignmentId) {
        return {
          ...a,
          employeeId: empId,
          vehicleId: vehId,
          ultimoEvento: isSwappingMachine
            ? {
                tipo: 'CAMBIO_EQUIPO' as const,
                titulo: `Cambió a ${newVehLabel || 'nuevo equipo'}`,
                hora: horaInicio,
              }
            : a.ultimoEvento,
          updatedAt: now,
        };
      }
      const nextEmp =
        incoming.employeeId && a.employeeId === incoming.employeeId ? undefined : a.employeeId;
      const nextVeh =
        incoming.vehicleId && a.vehicleId === incoming.vehicleId ? undefined : a.vehicleId;
      if (nextEmp !== a.employeeId || nextVeh !== a.vehicleId) {
        return { ...a, employeeId: nextEmp, vehicleId: nextVeh, updatedAt: now };
      }
      return a;
    });

    const toLabel = getLocationLabel(targetCard.locationType, targetCard.locationId);
    let nextDailySegments = [...dailySegments];

    if (isSwappingMachine) {
      nextDailySegments = appendSegmentToDailyChain({
        fecha: selectedDate,
        horaInicio,
        eventType: 'CAMBIO_EQUIPO',
        employeeId: empId,
        vehicleId: vehId,
        prevAssignment: targetCard,
        toLocationType: targetCard.locationType,
        toLocationId: targetCard.locationId,
        toLocationLabel: toLabel,
        tituloEvento: `Cambió a ${newVehLabel || 'equipo'}`,
      });
    } else {
      // Just pairing driver + machine in the same place: attach both IDs to the active segment for today
      let foundToday = false;
      for (let i = nextDailySegments.length - 1; i >= 0; i--) {
        const s = nextDailySegments[i];
        if (
          s.fecha === selectedDate &&
          ((targetCard.employeeId && s.employeeId === targetCard.employeeId) ||
            (targetCard.vehicleId && s.vehicleId === targetCard.vehicleId))
        ) {
          nextDailySegments[i] = {
            ...s,
            employeeId: empId,
            vehicleId: vehId,
          };
          foundToday = true;
          break;
        }
      }
      if (!foundToday) {
        nextDailySegments = appendSegmentToDailyChain({
          fecha: selectedDate,
          horaInicio: targetCard.horaInicioTramo || '08:00',
          eventType: targetCard.locationId === 'place-taller' ? 'TALLER' : 'ASIGNACION',
          employeeId: empId,
          vehicleId: vehId,
          toLocationType: targetCard.locationType,
          toLocationId: targetCard.locationId,
          toLocationLabel: toLabel,
        });
      }
    }

    commitBoardMutation(stripped, undefined, { dailySegments: nextDailySegments });
  };

  // Set or change "1° Empezó hoy en: ..." for a card (e.g. mark that it started in Taller)
  const handleSetCardOriginLocation = (card: DispatchAssignment, originTargetKey: string) => {
    const [oType, ...rest] = originTargetKey.split(':');
    const oId = rest.join(':');
    if (oType !== 'OBRA' && oType !== 'LUGAR') return;

    const now = new Date().toISOString();
    const usuario = userSession?.nombre || userSession?.username || 'Usuario';
    const originLabel = getLocationLabel(oType, oId);
    const currentLabel = getLocationLabel(card.locationType, card.locationId);
    const currentHora = card.horaInicioTramo || getCurrentLocalHHMM();

    // Filter out existing segments for this card today and rebuild clean origin -> current chain
    const others = dailySegments.filter(
      (s) =>
        !(
          s.fecha === selectedDate &&
          ((card.employeeId && s.employeeId === card.employeeId) ||
            (card.vehicleId && s.vehicleId === card.vehicleId))
        )
    );

    const step1: DispatchDailySegment = {
      id: `seg-orig-${Date.now()}-1`,
      fecha: selectedDate,
      horaInicio: '08:00',
      horaFin: oType === card.locationType && oId === card.locationId ? undefined : currentHora,
      turno: 'MAÑANA',
      eventType: oId === 'place-taller' ? 'TALLER' : 'ASIGNACION',
      locationType: oType,
      locationId: oId,
      locationLabel: originLabel,
      nextLocationLabel:
        oType === card.locationType && oId === card.locationId ? undefined : currentLabel,
      employeeId: card.employeeId,
      vehicleId: card.vehicleId,
      createdAt: now,
      usuario,
    };

    const nextSegments: DispatchDailySegment[] = [step1];

    if (oType !== card.locationType || oId !== card.locationId) {
      nextSegments.push({
        id: `seg-orig-${Date.now()}-2`,
        fecha: selectedDate,
        horaInicio: currentHora,
        turno: inferTurnoFromHHMM(currentHora),
        eventType: card.locationId === 'place-taller' ? 'TALLER' : 'TRASLADO',
        locationType: card.locationType,
        locationId: card.locationId,
        locationLabel: currentLabel,
        fromLocationType: oType,
        fromLocationId: oId,
        employeeId: card.employeeId,
        vehicleId: card.vehicleId,
        tituloEvento: `Pasó a ${currentLabel}`,
        createdAt: now,
        usuario,
      });
    }

    const nextAssignments = assignments.map((a) =>
      a.id === card.id
        ? {
            ...a,
            ultimoEvento:
              oType !== card.locationType || oId !== card.locationId
                ? {
                    tipo: (card.locationId === 'place-taller'
                      ? 'TALLER'
                      : 'TRASLADO') as DispatchEventType,
                    titulo: `Empezó en ${originLabel} ➔ ${currentLabel}`,
                    hora: currentHora,
                    fromLocationLabel: originLabel,
                  }
                : a.ultimoEvento,
            updatedAt: now,
          }
        : a
    );

    commitBoardMutation(nextAssignments, undefined, {
      dailySegments: [...others, ...nextSegments],
    });
    setEditingOriginCardId(null);
  };

  // 1-Click Remove from row
  const unassignFromCard = (
    assignmentId: string,
    part: 'ALL' | 'EMPLOYEE' | 'VEHICLE' = 'ALL'
  ) => {
    const card = assignments.find((a) => a.id === assignmentId);
    if (!card) return;
    const now = new Date().toISOString();

    let next: DispatchAssignment[];
    if (part === 'ALL') {
      next = assignments.filter((a) => a.id !== assignmentId);
    } else if (part === 'EMPLOYEE') {
      next = assignments.map((a) =>
        a.id === assignmentId ? { ...a, employeeId: undefined, updatedAt: now } : a
      );
    } else {
      next = assignments.map((a) =>
        a.id === assignmentId ? { ...a, vehicleId: undefined, updatedAt: now } : a
      );
    }
    commitBoardMutation(next);
  };

  // Open the "➔" Arrow Event menu on a row
  const openArrowPanelForCard = (
    card: DispatchAssignment,
    opts?: { presetTargetKey?: string; presetEventType?: DispatchEventType }
  ) => {
    setActiveArrowCardId(card.id);
    setArrowHora(getCurrentLocalHHMM());
    setArrowDetalle('');
    setArrowNewVehicleId('');
    const targetKey = opts?.presetTargetKey || 'SAME';
    setArrowTargetLocationKey(targetKey);
    if (opts?.presetEventType) {
      setArrowEventType(opts.presetEventType);
    } else if (targetKey !== 'SAME') {
      setArrowEventType(targetKey.includes('place-taller') ? 'ROTURA' : 'TRASLADO');
    } else {
      setArrowEventType('DETENIDO_ROTURA');
    }
  };

  // Execute arrow event immediately (can be called by 1-click event buttons or "Aplicar ➔" or Drag-Drop)
  const executeArrowEvent = (
    card: DispatchAssignment,
    override?: {
      eventType?: DispatchEventType;
      targetLocationKey?: string;
      newVehicleId?: string;
      detalle?: string;
      keepPanelOpen?: boolean;
    }
  ) => {
    const now = new Date().toISOString();
    const hora = arrowHora || getCurrentLocalHHMM();
    const fromLabel = getLocationLabel(card.locationType, card.locationId);
    const chosenEvent = override?.eventType || arrowEventType;
    const chosenTargetKey =
      override?.targetLocationKey !== undefined
        ? override.targetLocationKey
        : arrowTargetLocationKey;
    const chosenNewVehId =
      override?.newVehicleId !== undefined ? override.newVehicleId : arrowNewVehicleId;
    const chosenDetalle =
      override?.detalle !== undefined ? override.detalle : arrowDetalle;

    let destType: 'OBRA' | 'LUGAR' = card.locationType;
    let destId: string = card.locationId;
    if (chosenTargetKey && chosenTargetKey !== 'SAME') {
      const [t, ...rest] = chosenTargetKey.split(':');
      const id = rest.join(':');
      if (t === 'OBRA' || t === 'LUGAR') {
        destType = t;
        destId = id;
      }
    } else if (chosenEvent === 'TALLER') {
      const taller = customPlaces.find((p) => p.tipo === 'TALLER' || p.id === 'place-taller');
      if (taller) {
        destType = 'LUGAR';
        destId = taller.id;
      }
    }
    const destLabel = getLocationLabel(destType, destId);

    const newVeh =
      chosenEvent === 'CAMBIO_EQUIPO' && chosenNewVehId
        ? vehicleMap.get(chosenNewVehId)
        : undefined;
    const newVehLabel = newVeh ? `${getVehicleCode(newVeh)} ${newVeh.modeloMarca}` : undefined;
    const finalVehId =
      chosenEvent === 'CAMBIO_EQUIPO' && chosenNewVehId ? chosenNewVehId : card.vehicleId;

    const estadoOperativo: DispatchAssignment['estadoOperativo'] =
      chosenEvent === 'DETENIDO_ROTURA'
        ? 'DETENIDO_ROTURA'
        : chosenEvent === 'ROTURA'
        ? 'CON_ROTURA'
        : chosenEvent === 'TALLER'
        ? 'EN_REPARACION'
        : chosenEvent === 'FLETE'
        ? 'EN_FLETE'
        : 'OPERATIVO';

    const badge = getEventShortBadge(chosenEvent);
    const defaultTitle =
      chosenEvent === 'CAMBIO_EQUIPO'
        ? `Cambió a ${newVehLabel || 'nuevo equipo'}`
        : chosenDetalle.trim() || badge.text;

    const nextAssignments = assignments
      .map((a) => {
        if (
          chosenEvent === 'CAMBIO_EQUIPO' &&
          chosenNewVehId &&
          a.id !== card.id &&
          a.vehicleId === chosenNewVehId
        ) {
          return { ...a, vehicleId: undefined, updatedAt: now };
        }
        return a;
      })
      .map((a) => {
        if (a.id !== card.id) return a;
        return {
          ...a,
          locationType: destType,
          locationId: destId,
          vehicleId: finalVehId,
          horaInicioTramo: hora,
          estadoOperativo,
          ultimoEvento: {
            tipo: chosenEvent,
            titulo: defaultTitle,
            hora,
            fromLocationLabel:
              destLabel !== fromLabel
                ? fromLabel
                : card.ultimoEvento?.fromLocationLabel,
          },
          updatedAt: now,
        };
      });

    const nextDailySegments = appendSegmentToDailyChain({
      fecha: selectedDate,
      horaInicio: hora,
      eventType: chosenEvent,
      employeeId: card.employeeId,
      vehicleId: finalVehId,
      prevAssignment: card,
      toLocationType: destType,
      toLocationId: destId,
      toLocationLabel: destLabel,
      tituloEvento: defaultTitle,
    });

    commitBoardMutation(nextAssignments, undefined, { dailySegments: nextDailySegments });
    if (!override?.keepPanelOpen) {
      setActiveArrowCardId(null);
    }
  };

  // Confirm "➔" Arrow Event
  const handleConfirmArrowEvent = (card: DispatchAssignment) => {
    executeArrowEvent(card);
  };

  const handleClearAlertStatus = (card: DispatchAssignment) => {
    const now = new Date().toISOString();
    const nextAssignments = assignments.map((a) =>
      a.id === card.id
        ? { ...a, estadoOperativo: 'OPERATIVO' as const, ultimoEvento: undefined, updatedAt: now }
        : a
    );
    commitBoardMutation(nextAssignments);
  };

  const handleDeleteDailySegment = (segmentId: string) => {
    commitBoardMutation(assignments, undefined, {
      dailySegments: dailySegments.filter((s) => s.id !== segmentId),
    });
  };

  // Drag & Drop handlers
  const startDrag = (e: React.DragEvent, payload: DragPayload) => {
    dragPayloadRef.current = payload;
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('application/json', JSON.stringify(payload));
    } catch {
      // ignore
    }

    if (payload.kind === 'ARROW_EVENT') {
      const cardEl = cardRefsMap.current.get(payload.assignmentId);
      const rect = cardEl?.getBoundingClientRect();
      const startX = rect ? rect.right - 12 : e.clientX;
      const startY = rect ? rect.top + rect.height / 2 : e.clientY;
      setArrowDragState({
        assignmentId: payload.assignmentId,
        startX,
        startY,
        currX: e.clientX || startX + 40,
        currY: e.clientY || startY,
      });
    }
  };

  const endDrag = () => {
    dragPayloadRef.current = null;
    setHoverLocationKey(null);
    setHoverAssignmentId(null);
    setArrowDragState(null);
  };

  const getActivePayload = (e?: React.DragEvent): DragPayload | null => {
    if (dragPayloadRef.current) return dragPayloadRef.current;
    if (e) {
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) return JSON.parse(raw) as DragPayload;
      } catch {
        // ignore
      }
    }
    return null;
  };

  const handleDropOnLocation = (e: React.DragEvent, loc: LocationTarget) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = getActivePayload(e);
    endDrag();
    if (!payload) return;

    const target = { locationType: loc.locationType, locationId: loc.locationId };
    const targetKey = `${loc.locationType}:${loc.locationId}`;

    if (payload.kind === 'ARROW_EVENT' || payload.kind === 'ASSIGNMENT') {
      const card = assignments.find((a) => a.id === payload.assignmentId);
      if (card) {
        const isSameLoc =
          card.locationType === loc.locationType && card.locationId === loc.locationId;
        if (isSameLoc) {
          if (payload.kind === 'ARROW_EVENT') {
            openArrowPanelForCard(card, {
              presetTargetKey: 'SAME',
              presetEventType: 'DETENIDO_ROTURA',
            });
          }
          return;
        }
        // Moving to another container (e.g. Taller -> Obra or Obra A -> Obra B):
        // Immediately execute the move so the card lands in the destination container with its full chain ("1° Taller ➔ 2° Obra")
        const autoEvent: DispatchEventType =
          loc.locationId === 'place-taller' || loc.place?.tipo === 'TALLER'
            ? 'TALLER'
            : 'TRASLADO';
        executeArrowEvent(card, {
          eventType: autoEvent,
          targetLocationKey: targetKey,
          keepPanelOpen: payload.kind === 'ARROW_EVENT',
        });
        if (payload.kind === 'ARROW_EVENT') {
          setActiveArrowCardId(card.id);
          setArrowTargetLocationKey('SAME');
          setArrowEventType(autoEvent);
        }
      }
      return;
    }

    if (payload.kind === 'EMPLOYEE') {
      assignResourcesToLocation(target, { employeeId: payload.employeeId });
    } else if (payload.kind === 'VEHICLE') {
      assignResourcesToLocation(target, { vehicleId: payload.vehicleId });
    }
  };

  const handleDropOnRow = (e: React.DragEvent, card: DispatchAssignment) => {
    const payload = getActivePayload(e);
    if (!payload) return;
    if (payload.kind === 'EMPLOYEE' && !card.employeeId) {
      e.preventDefault();
      e.stopPropagation();
      endDrag();
      pairOntoAssignment(card.id, { employeeId: payload.employeeId });
    } else if (payload.kind === 'VEHICLE') {
      e.preventDefault();
      e.stopPropagation();
      endDrag();
      pairOntoAssignment(card.id, { vehicleId: payload.vehicleId });
    }
  };

  // Visibility & Container Management
  const handleToggleVehicleVisibility = (id: string) => {
    const next = new Set(hiddenVehicleIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    commitBoardMutation(assignments, undefined, { hiddenVehicleIds: Array.from(next) });
  };

  const handleToggleEmployeeVisibility = (id: string) => {
    const next = new Set(hiddenEmployeeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    commitBoardMutation(assignments, undefined, { hiddenEmployeeIds: Array.from(next) });
  };

  const handleToggleRealObra = (obraId: string) => {
    const next = new Set(hiddenObraIds);
    let nextAsg = assignments;
    if (next.has(obraId)) {
      next.delete(obraId);
    } else {
      next.add(obraId);
      nextAsg = assignments.filter(
        (a) => !(a.locationType === 'OBRA' && a.locationId === obraId)
      );
    }
    commitBoardMutation(nextAsg, undefined, { hiddenObraIds: Array.from(next) });
  };

  const handleCreateQuickPlace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaceName.trim()) return;
    const newPlace: DispatchBoardPlace = {
      id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      nombre: newPlaceName.trim(),
      tipo: newPlaceTipo,
      color:
        newPlaceTipo === 'TALLER'
          ? 'cyan'
          : newPlaceTipo === 'DEPOSITO'
          ? 'emerald'
          : newPlaceTipo === 'BASE'
          ? 'slate'
          : 'amber',
      createdAt: new Date().toISOString(),
    };
    commitBoardMutation(assignments, undefined, {
      places: [...customPlaces, newPlace],
    });
    setNewPlaceName('');
    setTopDrawer('NONE');
  };

  const handleDeletePlace = (placeId: string) => {
    commitBoardMutation(
      assignments.filter((a) => !(a.locationType === 'LUGAR' && a.locationId === placeId)),
      undefined,
      { places: customPlaces.filter((p) => p.id !== placeId) }
    );
  };

  const activeFormalObras = useMemo(
    () =>
      obras
        .filter((o) => !o.archivado && o.activa !== false)
        .sort((a, b) => (a.nombreObra || '').localeCompare(b.nombreObra || '')),
    [obras]
  );

  const selectedVehicle = selectedVehicleId ? vehicleMap.get(selectedVehicleId) : undefined;
  const selectedEmployee = selectedEmployeeId ? employeeMap.get(selectedEmployeeId) : undefined;
  const hasSelection = Boolean(selectedVehicleId || selectedEmployeeId);

  return (
    <div className="space-y-3 relative">
      {/* LIVE SVG ARROW OVERLAY WHILE DRAGGING "➔" */}
      {arrowDragState && (
        <svg
          className="fixed inset-0 pointer-events-none z-50"
          style={{ width: '100vw', height: '100vh' }}
        >
          <defs>
            <marker
              id="live-arrow-head"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="5"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#F0C800" />
            </marker>
          </defs>
          <circle cx={arrowDragState.startX} cy={arrowDragState.startY} r="5" fill="#F0C800" />
          <path
            d={`M ${arrowDragState.startX} ${arrowDragState.startY} C ${
              arrowDragState.startX + 80
            } ${arrowDragState.startY}, ${arrowDragState.currX - 80} ${
              arrowDragState.currY
            }, ${arrowDragState.currX} ${arrowDragState.currY}`}
            fill="none"
            stroke="#F0C800"
            strokeWidth="3"
            strokeDasharray="6 4"
            markerEnd="url(#live-arrow-head)"
          />
        </svg>
      )}

      {/* ==================== 1. CABECERA SIMPLE (1 SOLA LÍNEA) ==================== */}
      <div className="bg-[#16191F] border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-base font-black text-white tracking-tight">
            PIZARRA DEL DÍA
          </h1>

          {/* Fecha */}
          <div className="flex items-center gap-1.5 bg-[#0F1115] border border-slate-700 rounded-lg px-2.5 py-1">
            <Calendar className="w-3.5 h-3.5 text-[#F0C800]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || getTodayLocalISO())}
              className="bg-transparent text-xs text-white font-mono focus:outline-none cursor-pointer"
            />
          </div>

          {/* Buscador rápido */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar máquina o chofer..."
              className="bg-[#0F1115] border border-slate-700 rounded-lg pl-8 pr-7 py-1 text-xs text-white w-48 focus:outline-none focus:border-[#F0C800]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {isSaving ? (
            <span className="inline-flex items-center gap-1 text-xs text-[#F0C800]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando...
            </span>
          ) : saveError ? (
            <span className="text-xs text-rose-400">{saveError}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
              <Check className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
        </div>

        {/* 3 BOTONES SIMPLES A LA DERECHA */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDrawerSearch('');
              setTopDrawer((p) => (p === 'VISIBILITY' ? 'NONE' : 'VISIBILITY'));
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
              topDrawer === 'VISIBILITY'
                ? 'bg-[#F0C800] text-black border-[#F0C800]'
                : 'bg-[#0F1115] text-slate-200 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#F0C800]" />
            Elegir Equipos / Personal visibles
          </button>

          <button
            type="button"
            onClick={() => {
              setDrawerSearch('');
              setTopDrawer((p) => (p === 'OBRAS_REALES' ? 'NONE' : 'OBRAS_REALES'));
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
              topDrawer === 'OBRAS_REALES'
                ? 'bg-[#F0C800] text-black border-[#F0C800]'
                : 'bg-[#0F1115] text-slate-200 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-[#F0C800]" />
            Llamar Obra Real
          </button>

          <button
            type="button"
            onClick={() => setTopDrawer((p) => (p === 'NEW_LUGAR' ? 'NONE' : 'NEW_LUGAR'))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-[#F0C800] hover:bg-[#F6D84C] text-black transition cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Nuevo Lugar / Obra
          </button>
        </div>
      </div>

      {/* ==================== DESPLEGABLES DE LOS 3 BOTONES SUPERIORES ==================== */}
      {topDrawer === 'VISIBILITY' && (
        <div className="bg-[#16191F] border-2 border-[#F0C800]/50 rounded-xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibilityTab('EQUIPOS')}
                className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                  visibilityTab === 'EQUIPOS'
                    ? 'bg-cyan-500 text-black'
                    : 'bg-[#0F1115] text-slate-300'
                }`}
              >
                🚜 Equipos visibles ({visibleVehicles.length}/{activeVehicles.length})
              </button>
              <button
                type="button"
                onClick={() => setVisibilityTab('PERSONAL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                  visibilityTab === 'PERSONAL'
                    ? 'bg-[#F0C800] text-black'
                    : 'bg-[#0F1115] text-slate-300'
                }`}
              >
                👷 Personal visible ({visibleEmployees.length}/{activeEmployees.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={drawerSearch}
                onChange={(e) => setDrawerSearch(e.target.value)}
                placeholder="Filtrar..."
                className="bg-[#0F1115] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
              />
              {visibilityTab === 'EQUIPOS' ? (
                <>
                  <button
                    type="button"
                    onClick={() => commitBoardMutation(assignments, undefined, { hiddenVehicleIds: [] })}
                    className="px-2.5 py-1 rounded bg-slate-800 text-xs text-cyan-300 font-bold cursor-pointer"
                  >
                    Mostrar todos
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      commitBoardMutation(assignments, undefined, {
                        hiddenVehicleIds: activeVehicles
                          .filter((v) => !vehicleAssignmentMap.has(v.id))
                          .map((v) => v.id),
                      })
                    }
                    className="px-2.5 py-1 rounded bg-slate-800 text-xs text-slate-300 font-bold cursor-pointer"
                  >
                    Ocultar sin usar
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => commitBoardMutation(assignments, undefined, { hiddenEmployeeIds: [] })}
                    className="px-2.5 py-1 rounded bg-slate-800 text-xs text-[#F0C800] font-bold cursor-pointer"
                  >
                    Mostrar todos
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      commitBoardMutation(assignments, undefined, {
                        hiddenEmployeeIds: activeEmployees
                          .filter((e) => !employeeAssignmentMap.has(e.id))
                          .map((e) => e.id),
                      })
                    }
                    className="px-2.5 py-1 rounded bg-slate-800 text-xs text-slate-300 font-bold cursor-pointer"
                  >
                    Ocultar sin usar
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setTopDrawer('NONE')}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {visibilityTab === 'EQUIPOS' ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto">
              {activeVehicles
                .filter((v) =>
                  !drawerSearch.trim()
                    ? true
                    : `${getVehicleCode(v)} ${v.modeloMarca}`
                        .toLowerCase()
                        .includes(drawerSearch.toLowerCase())
                )
                .map((v) => {
                  const vis = !hiddenVehicleIds.has(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleToggleVehicleVisibility(v.id)}
                      className={`flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-lg border text-xs text-left cursor-pointer ${
                        vis
                          ? 'bg-cyan-500/15 border-cyan-500/50 text-white font-semibold'
                          : 'bg-[#0F1115] border-slate-800 text-slate-500'
                      }`}
                    >
                      <span className="truncate">
                        <strong className="font-mono text-cyan-300 mr-1">{getVehicleCode(v)}</strong>
                        {v.modeloMarca}
                      </span>
                      {vis ? <Eye className="w-3.5 h-3.5 text-cyan-300 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto">
              {activeEmployees
                .filter((e) =>
                  !drawerSearch.trim()
                    ? true
                    : getEmployeeName(e).toLowerCase().includes(drawerSearch.toLowerCase())
                )
                .map((e) => {
                  const vis = !hiddenEmployeeIds.has(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => handleToggleEmployeeVisibility(e.id)}
                      className={`flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-lg border text-xs text-left cursor-pointer ${
                        vis
                          ? 'bg-[#F0C800]/15 border-[#F0C800]/50 text-white font-semibold'
                          : 'bg-[#0F1115] border-slate-800 text-slate-500'
                      }`}
                    >
                      <span className="truncate">{getEmployeeName(e)}</span>
                      {vis ? <Eye className="w-3.5 h-3.5 text-[#F0C800] shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {topDrawer === 'OBRAS_REALES' && (
        <div className="bg-[#16191F] border-2 border-[#F0C800]/50 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white">
              Tocá las Obras Reales que querés tener activas en la Pizarra:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={drawerSearch}
                onChange={(e) => setDrawerSearch(e.target.value)}
                placeholder="Buscar obra..."
                className="bg-[#0F1115] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => setTopDrawer('NONE')}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
            {activeFormalObras
              .filter((o) =>
                !drawerSearch.trim()
                  ? true
                  : o.nombreObra.toLowerCase().includes(drawerSearch.toLowerCase())
              )
              .map((o) => {
                const onBoard = !hiddenObraIds.has(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => handleToggleRealObra(o.id)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs text-left cursor-pointer ${
                      onBoard
                        ? 'bg-[#F0C800]/15 border-[#F0C800]/50 text-white font-bold'
                        : 'bg-[#0F1115] border-slate-800 text-slate-400'
                    }`}
                  >
                    <span className="truncate">{o.nombreObra}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                        onBoard ? 'bg-[#F0C800] text-black' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {onBoard ? '✓ Visible' : '+ Llamar'}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {topDrawer === 'NEW_LUGAR' && (
        <form
          onSubmit={handleCreateQuickPlace}
          className="bg-[#16191F] border-2 border-[#F0C800]/60 rounded-xl p-3 flex flex-wrap items-center gap-2.5"
        >
          <span className="text-xs font-bold text-[#F0C800]">
            ➕ Crear Contenedor en Pizarra (sin crear obra en BD, queda fijo cada día):
          </span>
          <select
            value={newPlaceTipo}
            onChange={(e) => setNewPlaceTipo(e.target.value as DispatchBoardPlace['tipo'])}
            className="bg-[#0F1115] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
          >
            <option value="OBRA_TEMPORAL">🏗️ Obra / Trabajo</option>
            <option value="TALLER">🔧 Taller</option>
            <option value="DEPOSITO">🏭 Depósito</option>
            <option value="BASE">📍 Base / Playón</option>
            <option value="ZONA">🚧 Frente / Lugar</option>
          </select>
          <input
            type="text"
            required
            autoFocus
            value={newPlaceName}
            onChange={(e) => setNewPlaceName(e.target.value)}
            placeholder="Nombre (ej: Obra Ruta 9, Taller Central, Depósito Sur)..."
            className="flex-1 min-w-[220px] bg-[#0F1115] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
          />
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg bg-[#F0C800] hover:bg-[#F6D84C] text-black text-xs font-black cursor-pointer"
          >
            + Crear
          </button>
          <button
            type="button"
            onClick={() => setTopDrawer('NONE')}
            className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* ==================== 2. TIRA COMPACTA SUPERIOR: EQUIPOS Y PERSONAL (EN 1 VISTAZO) ==================== */}
      <div className="bg-[#16191F] border border-slate-800 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400">
            Tocá o arrastrá un <strong className="text-cyan-300">Equipo</strong> y/o una <strong className="text-[#F0C800]">Persona</strong> hacia cualquier contenedor de abajo:
          </span>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOnlyFreeInTopBar}
              onChange={(e) => setShowOnlyFreeInTopBar(e.target.checked)}
              className="accent-[#F0C800]"
            />
            Mostrar arriba solo los Libres (sin asignar)
          </label>
        </div>

        {/* FILA 1: EQUIPOS VISIBLES (PASTILLAS DE 1 LÍNEA) */}
        <div className="flex items-start gap-2">
          <div className="shrink-0 px-2 py-1 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px] font-black flex items-center gap-1 w-28">
            <Truck className="w-3.5 h-3.5" />
            EQUIPOS ({topStripVehicles.length})
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto flex-1">
            {topStripVehicles.map((v) => {
              const code = getVehicleCode(v);
              const asg = vehicleAssignmentMap.get(v.id);
              const isSelected = selectedVehicleId === v.id;
              return (
                <div
                  key={v.id}
                  draggable
                  onDragStart={(e) => startDrag(e, { kind: 'VEHICLE', vehicleId: v.id })}
                  onDragEnd={endDrag}
                  onClick={() => setSelectedVehicleId((p) => (p === v.id ? null : v.id))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition cursor-pointer select-none ${
                    isSelected
                      ? 'bg-cyan-400 text-black border-cyan-300 font-black shadow-md'
                      : asg
                      ? 'bg-[#0F1115]/60 border-slate-800 text-slate-500'
                      : 'bg-[#0F1115] border-slate-700 hover:border-cyan-400 text-white font-semibold'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      asg ? 'bg-slate-600' : 'bg-emerald-400'
                    }`}
                  />
                  <span className={isSelected ? 'font-mono font-black' : 'font-mono text-cyan-300 font-bold'}>
                    {code}
                  </span>
                  <span className="truncate max-w-[140px]">{v.modeloMarca}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* FILA 2: PERSONAL VISIBLE (PASTILLAS DE 1 LÍNEA) */}
        <div className="flex items-start gap-2 pt-1.5 border-t border-slate-800/70">
          <div className="shrink-0 px-2 py-1 rounded bg-[#F0C800]/15 border border-[#F0C800]/30 text-[#F0C800] text-[11px] font-black flex items-center gap-1 w-28">
            <Users className="w-3.5 h-3.5" />
            PERSONAL ({topStripEmployees.length})
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto flex-1">
            {topStripEmployees.map((emp) => {
              const asg = employeeAssignmentMap.get(emp.id);
              const isSelected = selectedEmployeeId === emp.id;
              return (
                <div
                  key={emp.id}
                  draggable
                  onDragStart={(e) => startDrag(e, { kind: 'EMPLOYEE', employeeId: emp.id })}
                  onDragEnd={endDrag}
                  onClick={() => setSelectedEmployeeId((p) => (p === emp.id ? null : emp.id))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition cursor-pointer select-none ${
                    isSelected
                      ? 'bg-[#F0C800] text-black border-[#F0C800] font-black shadow-md'
                      : asg
                      ? 'bg-[#0F1115]/60 border-slate-800 text-slate-500'
                      : 'bg-[#0F1115] border-slate-700 hover:border-[#F0C800] text-white font-semibold'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      asg ? 'bg-slate-600' : 'bg-emerald-400'
                    }`}
                  />
                  <span className="truncate max-w-[150px]">{getEmployeeName(emp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ==================== 3. CONTENEDORES GRANDES Y CLAROS (OBRAS, TALLER, DEPÓSITO) ==================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {allLocationTargets.map((loc) => {
          const locKey = `${loc.locationType}:${loc.locationId}`;
          const locAssignments = assignments.filter(
            (a) => a.locationType === loc.locationType && a.locationId === loc.locationId
          );
          const isDropTarget = hoverLocationKey === locKey;
          const isQuickAddOpen = quickAddLocKey === locKey;

          // Equipos / Personal que empezaron o estuvieron HOY en este contenedor y después salieron a otra Obra/Lugar
          const departedFromHereToday = assignments.filter((a) => {
            if (a.locationType === loc.locationType && a.locationId === loc.locationId) {
              return false;
            }
            const segs = getDailySegmentsForResource(a.employeeId, a.vehicleId);
            const passedHere = segs.some(
              (s) =>
                (s.locationType === loc.locationType && s.locationId === loc.locationId) ||
                (s.fromLocationType === loc.locationType && s.fromLocationId === loc.locationId) ||
                s.locationLabel === loc.nombre
            );
            if (passedHere) return true;
            if (a.ultimoEvento?.fromLocationLabel === loc.nombre) return true;
            return false;
          });

          return (
            <section
              key={locKey}
              onDragOver={(e) => {
                if (getActivePayload()) {
                  e.preventDefault();
                  setHoverLocationKey(locKey);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setHoverLocationKey((prev) => (prev === locKey ? null : prev));
                }
              }}
              onDrop={(e) => handleDropOnLocation(e, loc)}
              className={`bg-[#16191F] border-2 rounded-xl flex flex-col transition-all ${
                isDropTarget
                  ? 'border-[#F0C800] bg-[#F0C800]/5'
                  : loc.place?.tipo === 'TALLER'
                  ? 'border-cyan-500/35'
                  : loc.place?.tipo === 'DEPOSITO'
                  ? 'border-emerald-500/35'
                  : loc.place?.tipo === 'BASE'
                  ? 'border-slate-700'
                  : 'border-[#F0C800]/35'
              }`}
            >
              {/* CABECERA DEL CONTENEDOR: NOMBRE CLARO + BOTÓN QUITAR */}
              <div className="px-3.5 py-2.5 bg-[#0F1115]/70 border-b border-slate-800 flex items-center justify-between gap-2 rounded-t-xl">
                <div className="flex items-center gap-2 min-w-0">
                  {loc.place?.tipo === 'TALLER' ? (
                    <Wrench className="w-4 h-4 text-cyan-400 shrink-0" />
                  ) : loc.place?.tipo === 'DEPOSITO' ? (
                    <Warehouse className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : loc.place?.tipo === 'BASE' ? (
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <Building2 className="w-4 h-4 text-[#F0C800] shrink-0" />
                  )}
                  <h3 className="text-sm font-black text-white truncate uppercase tracking-wide">
                    {loc.nombre}
                  </h3>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-bold">
                    {locAssignments.length}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (hasSelection) {
                        assignResourcesToLocation(
                          { locationType: loc.locationType, locationId: loc.locationId },
                          {
                            employeeId: selectedEmployeeId || undefined,
                            vehicleId: selectedVehicleId || undefined,
                          }
                        );
                        setSelectedEmployeeId(null);
                        setSelectedVehicleId(null);
                        return;
                      }
                      setQuickAddLocKey(isQuickAddOpen ? null : locKey);
                      setQuickAddVehId('');
                      setQuickAddEmpId('');
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      hasSelection
                        ? 'bg-[#F0C800] text-black font-black animate-pulse'
                        : 'bg-slate-800 hover:bg-[#F0C800] text-slate-200 hover:text-black'
                    }`}
                  >
                    {hasSelection ? '+ Meter acá' : '+ Agregar'}
                  </button>

                  {loc.locationType === 'OBRA' ? (
                    <button
                      type="button"
                      onClick={() => handleToggleRealObra(loc.locationId)}
                      title="Ocultar obra de la pizarra"
                      className="p-1 text-slate-500 hover:text-rose-400 rounded cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : (
                    loc.place && (
                      <button
                        type="button"
                        onClick={() => handleDeletePlace(loc.place!.id)}
                        title="Eliminar este contenedor"
                        className="p-1 text-slate-500 hover:text-rose-400 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* SELECTOR RÁPIDO "+ AGREGAR" DENTRO DEL CONTENEDOR */}
              {isQuickAddOpen && (
                <div className="p-2.5 bg-[#0F1115] border-b border-slate-800 space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={quickAddVehId}
                      onChange={(e) => setQuickAddVehId(e.target.value)}
                      className="bg-[#16191F] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                      <option value="">-- Máquina --</option>
                      {visibleVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          [{getVehicleCode(v)}] {v.modeloMarca}
                        </option>
                      ))}
                    </select>
                    <select
                      value={quickAddEmpId}
                      onChange={(e) => setQuickAddEmpId(e.target.value)}
                      className="bg-[#16191F] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                      <option value="">-- Personal --</option>
                      {visibleEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {getEmployeeName(emp)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuickAddLocKey(null)}
                      className="px-2.5 py-1 text-xs text-slate-400 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!quickAddVehId && !quickAddEmpId}
                      onClick={() => {
                        assignResourcesToLocation(
                          { locationType: loc.locationType, locationId: loc.locationId },
                          {
                            vehicleId: quickAddVehId || undefined,
                            employeeId: quickAddEmpId || undefined,
                          }
                        );
                        setQuickAddLocKey(null);
                      }}
                      className="px-3 py-1 rounded bg-[#F0C800] disabled:bg-slate-800 text-black disabled:text-slate-500 text-xs font-black cursor-pointer"
                    >
                      Listo
                    </button>
                  </div>
                </div>
              )}

              {/* LISTA DE EQUIPOS Y PERSONAL ADENTRO DEL CONTENEDOR */}
              <div className="p-2.5 space-y-2 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  {locAssignments.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-600 border border-dashed border-slate-800/80 rounded-lg">
                      Vacío — Arrastrá acá o tocá <strong>+ Agregar</strong>
                    </div>
                  ) : (
                    locAssignments.map((card) => {
                      const emp = card.employeeId ? employeeMap.get(card.employeeId) : undefined;
                      const veh = card.vehicleId ? vehicleMap.get(card.vehicleId) : undefined;
                      const isPair = Boolean(emp && veh);
                      const isArrowOpen = activeArrowCardId === card.id;
                      const isEditingOrigin = editingOriginCardId === card.id;
                      const isBroken =
                        card.estadoOperativo === 'DETENIDO_ROTURA' ||
                        card.estadoOperativo === 'CON_ROTURA';
                      const rawSteps = getDailySegmentsForResource(card.employeeId, card.vehicleId);

                      // Determinar dónde empezó el día (Paso 1)
                      const firstOriginLabel =
                        rawSteps.length > 0
                          ? rawSteps[0].locationLabel
                          : card.ultimoEvento?.fromLocationLabel || loc.nombre;

                      const hasMovedFromOrigin =
                        rawSteps.length > 1 ||
                        (Boolean(card.ultimoEvento?.fromLocationLabel) &&
                          card.ultimoEvento?.fromLocationLabel !== loc.nombre);

                      return (
                        <div
                          key={card.id}
                          ref={(el) => {
                            if (el) cardRefsMap.current.set(card.id, el);
                            else cardRefsMap.current.delete(card.id);
                          }}
                          draggable
                          onDragStart={(e) =>
                            startDrag(e, { kind: 'ASSIGNMENT', assignmentId: card.id })
                          }
                          onDragEnd={endDrag}
                          onDragOver={(e) => {
                            const p = getActivePayload();
                            if (
                              p &&
                              ((p.kind === 'EMPLOYEE' && !card.employeeId) || p.kind === 'VEHICLE')
                            ) {
                              e.preventDefault();
                              e.stopPropagation();
                              setHoverAssignmentId(card.id);
                            }
                          }}
                          onDragLeave={() =>
                            setHoverAssignmentId((prev) => (prev === card.id ? null : prev))
                          }
                          onDrop={(e) => handleDropOnRow(e, card)}
                          className={`rounded-lg border p-2.5 transition ${
                            hoverAssignmentId === card.id
                              ? 'bg-[#F0C800]/15 border-[#F0C800]'
                              : isBroken
                              ? 'bg-rose-950/30 border-rose-500/70'
                              : hasMovedFromOrigin
                              ? 'bg-[#0F1115] border-[#F0C800]/45'
                              : 'bg-[#0F1115] border-slate-800'
                          }`}
                        >
                          {/* RENGLÓN PRINCIPAL: MÁQUINA + CHOFER A LA IZQUIERDA | BOTÓN ➔ Y BOTÓN ✕ A LA DERECHA */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
                              {veh && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-xs font-bold text-white">
                                  <strong className="font-mono text-cyan-300">
                                    {getVehicleCode(veh)}
                                  </strong>
                                  <span className="truncate max-w-[150px]">{veh.modeloMarca}</span>
                                  {isPair && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        unassignFromCard(card.id, 'VEHICLE');
                                      }}
                                      title="Sacar solo la máquina"
                                      className="ml-0.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              )}

                              {emp && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F0C800]/15 border border-[#F0C800]/30 text-xs font-bold text-white">
                                  <span>👷 {getEmployeeName(emp)}</span>
                                  {isPair && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        unassignFromCard(card.id, 'EMPLOYEE');
                                      }}
                                      title="Sacar solo al chofer"
                                      className="ml-0.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              )}
                            </div>

                            {/* 2 BOTONES CLAROS: "➔" (EVENTO / MOVER) y "✕" (ELIMINAR) */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  startDrag(e, { kind: 'ARROW_EVENT', assignmentId: card.id });
                                }}
                                onDragEnd={endDrag}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isArrowOpen) setActiveArrowCardId(null);
                                  else openArrowPanelForCard(card);
                                }}
                                title="Sacar flecha a otro evento (Rotura, Flete, Cambio de Equipo, Ir a otra Obra)"
                                className={`px-2 py-1 rounded text-xs font-black border transition cursor-pointer ${
                                  isArrowOpen
                                    ? 'bg-[#F0C800] text-black border-[#F0C800]'
                                    : 'bg-[#F0C800]/15 hover:bg-[#F0C800] text-[#F0C800] hover:text-black border-[#F0C800]/40'
                                }`}
                              >
                                ➔
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  unassignFromCard(card.id, 'ALL');
                                }}
                                title="Quitar / Eliminar"
                                className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-black transition cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* SI ESTÁ ROTO / DETENIDO: ALERTA CLARA EN 1 LÍNEA */}
                          {isBroken && (
                            <div className="mt-1.5 px-2 py-1 rounded bg-rose-500/25 border border-rose-500/50 flex items-center justify-between text-[11px] font-bold text-rose-200">
                              <span>
                                {card.estadoOperativo === 'DETENIDO_ROTURA'
                                  ? '🛑 DETENIDO POR ROTURA'
                                  : '⚠️ MÁQUINA CON ROTURA'}
                                {card.ultimoEvento?.titulo &&
                                !card.ultimoEvento.titulo.includes('Rotura')
                                  ? ` · ${card.ultimoEvento.titulo}`
                                  : ''}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleClearAlertStatus(card)}
                                className="px-1.5 py-0.5 rounded bg-emerald-500/30 hover:bg-emerald-500 text-white text-[10px] cursor-pointer"
                              >
                                ✓ Ya operativo
                              </button>
                            </div>
                          )}

                          {/* ==================== CAMINITO DEL DÍA (SIEMPRE VISIBLE EN CADA TARJETA) ==================== */}
                          <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[11px]">
                            {/* PASO 1: DÓNDE EMPEZÓ HOY (CLICKEABLE PARA INDICAR SI EMPEZÓ EN TALLER U OTRA OBRA) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingOriginCardId(isEditingOrigin ? null : card.id);
                              }}
                              title="Tocá acá para indicar o cambiar dónde empezó hoy a la mañana (ej. Taller)"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-bold transition cursor-pointer ${
                                firstOriginLabel.toLowerCase().includes('taller')
                                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40 hover:border-cyan-300'
                                  : 'bg-slate-800/90 text-slate-200 border-slate-700 hover:border-[#F0C800]'
                              }`}
                            >
                              <span>
                                1° Empezó:{' '}
                                <strong className="text-white">{firstOriginLabel}</strong>
                              </span>
                            </button>

                            {/* PASOS SIGUIENTES SI TUVO EVENTOS O CAMBIOS DE OBRA EN EL DÍA */}
                            {rawSteps.length > 1 ? (
                              (() => {
                                const followingSteps = rawSteps.slice(1);
                                const stepMeta = followingSteps.map((seg, idx) => {
                                  const prevLoc = rawSteps[idx]?.locationLabel || firstOriginLabel;
                                  const changedLoc =
                                    Boolean(seg.locationLabel) && seg.locationLabel !== prevLoc;
                                  const showEventPill =
                                    seg.eventType !== 'TRASLADO' && seg.eventType !== 'ASIGNACION';
                                  return { seg, changedLoc, showEventPill };
                                });

                                let lastLocChangeIdx = -1;
                                stepMeta.forEach((m, i) => {
                                  if (m.changedLoc) lastLocChangeIdx = i;
                                });

                                let locStepNumber = 1;
                                return stepMeta.map(({ seg, changedLoc, showEventPill }, idx) => {
                                  const b = getEventShortBadge(seg.eventType);
                                  const stepNum = changedLoc ? ++locStepNumber : null;
                                  const isCurrentFinalStop = idx === lastLocChangeIdx;

                                  return (
                                    <React.Fragment key={seg.id}>
                                      {showEventPill && (
                                        <>
                                          <span className="text-[#F0C800] font-black text-xs">➔</span>
                                          <span
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-bold ${b.cls}`}
                                          >
                                            {seg.tituloEvento || b.text}
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteDailySegment(seg.id)}
                                              title="Borrar este evento"
                                              className="opacity-70 hover:opacity-100 hover:text-rose-300 ml-0.5 cursor-pointer"
                                            >
                                              ×
                                            </button>
                                          </span>
                                        </>
                                      )}

                                      {changedLoc && stepNum !== null && (
                                        <>
                                          <span className="text-[#F0C800] font-black text-xs">➔</span>
                                          <span
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
                                              isCurrentFinalStop
                                                ? 'bg-[#F0C800]/20 text-[#F0C800] border-[#F0C800]/50 font-black'
                                                : 'bg-slate-800/80 text-slate-200 border-slate-700 font-bold'
                                            }`}
                                          >
                                            {stepNum}° {isCurrentFinalStop ? 'Ahora' : 'Pasó a'}: {seg.locationLabel}
                                            {!showEventPill && (
                                              <button
                                                type="button"
                                                onClick={() => handleDeleteDailySegment(seg.id)}
                                                title="Borrar este movimiento"
                                                className="opacity-70 hover:opacity-100 hover:text-rose-300 ml-0.5 cursor-pointer"
                                              >
                                                ×
                                              </button>
                                            )}
                                          </span>
                                        </>
                                      )}
                                    </React.Fragment>
                                  );
                                });
                              })()
                            ) : hasMovedFromOrigin ? (
                              <>
                                <span className="text-[#F0C800] font-black text-xs">➔</span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-[#F0C800]/20 text-[#F0C800] border-[#F0C800]/50 font-black">
                                  2° Ahora: {loc.nombre}
                                </span>
                              </>
                            ) : null}

                            {/* BOTÓN RÁPIDO PARA SACAR FLECHA A OTRO EVENTO / OBRA */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isArrowOpen) setActiveArrowCardId(null);
                                else openArrowPanelForCard(card);
                              }}
                              className="ml-auto px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-[#F0C800] text-slate-300 hover:text-black text-[10px] font-bold transition cursor-pointer"
                            >
                              + Evento / Mover ➔
                            </button>
                          </div>

                          {/* SELECTOR RÁPIDO SI TOCA "1° Empezó: ..." PARA INDICAR QUE EMPEZÓ EN TALLER U OTRA OBRA */}
                          {isEditingOrigin && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 p-2 rounded-lg bg-[#16191F] border border-cyan-500/50 space-y-1.5"
                            >
                              <div className="flex items-center justify-between text-[11px] font-bold text-cyan-300">
                                <span>¿Dónde empezó el día hoy a la mañana?</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingOriginCardId(null)}
                                  className="text-slate-400 hover:text-white cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {allLocationTargets.map((t) => {
                                  const tKey = `${t.locationType}:${t.locationId}`;
                                  const isCurrOrigin = t.nombre === firstOriginLabel;
                                  return (
                                    <button
                                      key={tKey}
                                      type="button"
                                      onClick={() => handleSetCardOriginLocation(card, tKey)}
                                      className={`px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                                        isCurrOrigin
                                          ? 'bg-cyan-400 text-black border-cyan-300'
                                          : 'bg-[#0F1115] text-slate-200 border-slate-700 hover:border-cyan-400'
                                      }`}
                                    >
                                      {t.place?.tipo === 'TALLER' ? '🔧 ' : '🏗️ '}
                                      {t.nombre}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* MENÚ SIMPLE AL TOCAR "➔" */}
                          {isArrowOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 p-2.5 rounded-lg bg-[#16191F] border-2 border-[#F0C800] space-y-2"
                            >
                              <div className="flex items-center justify-between text-[11px] font-black text-[#F0C800]">
                                <span>SACAR FLECHA A OTRO EVENTO U OBRA:</span>
                                <button
                                  type="button"
                                  onClick={() => setActiveArrowCardId(null)}
                                  className="text-slate-400 hover:text-white cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>

                              {/* 1. ¿A QUÉ LUGAR PASA? */}
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                  1. ¿Se queda en {loc.nombre} o se va a otra Obra / Taller?
                                </label>
                                <select
                                  value={arrowTargetLocationKey}
                                  onChange={(e) => setArrowTargetLocationKey(e.target.value)}
                                  className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-bold"
                                >
                                  <option value="SAME">📍 Sigue acá en {loc.nombre}</option>
                                  {allLocationTargets
                                    .filter(
                                      (t) =>
                                        !(
                                          t.locationType === card.locationType &&
                                          t.locationId === card.locationId
                                        )
                                    )
                                    .map((t) => (
                                      <option
                                        key={`${t.locationType}:${t.locationId}`}
                                        value={`${t.locationType}:${t.locationId}`}
                                      >
                                        ➔ Se va a: {t.nombre}
                                      </option>
                                    ))}
                                </select>
                              </div>

                              {/* 2. ¿QUÉ EVENTO PASÓ? (1 CLIC) */}
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                  2. ¿Qué evento pasó?
                                </label>
                                <div className="grid grid-cols-2 gap-1">
                                  {(
                                    [
                                      { id: 'TRASLADO', label: '🏗️ Pasó a otra Obra' },
                                      { id: 'DETENIDO_ROTURA', label: '🛑 Detenido x Rotura' },
                                      { id: 'ROTURA', label: '⚠️ Máq. con Rotura' },
                                      { id: 'FLETE', label: '🚚 Flete / Viaje' },
                                      { id: 'TALLER', label: '🔧 Mandar a Taller' },
                                      { id: 'CAMBIO_EQUIPO', label: '🔄 Cambio de Equipo' },
                                    ] as const
                                  ).map((ev) => (
                                    <button
                                      key={ev.id}
                                      type="button"
                                      onClick={() => {
                                        setArrowEventType(ev.id);
                                        if (ev.id === 'TALLER') {
                                          const taller = customPlaces.find(
                                            (p) => p.tipo === 'TALLER' || p.id === 'place-taller'
                                          );
                                          if (taller) setArrowTargetLocationKey(`LUGAR:${taller.id}`);
                                        }
                                      }}
                                      className={`px-2 py-1.5 rounded text-[11px] font-bold text-left border cursor-pointer ${
                                        arrowEventType === ev.id
                                          ? 'bg-[#F0C800] text-black border-[#F0C800]'
                                          : 'bg-[#0F1115] text-slate-200 border-slate-800 hover:border-slate-600'
                                      }`}
                                    >
                                      {ev.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {arrowEventType === 'CAMBIO_EQUIPO' && (
                                <select
                                  value={arrowNewVehicleId}
                                  onChange={(e) => setArrowNewVehicleId(e.target.value)}
                                  className="w-full bg-[#0F1115] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                                >
                                  <option value="">-- Elegir nueva máquina --</option>
                                  {visibleVehicles
                                    .filter((v) => v.id !== card.vehicleId)
                                    .map((v) => (
                                      <option key={v.id} value={v.id}>
                                        [{getVehicleCode(v)}] {v.modeloMarca}
                                      </option>
                                    ))}
                                </select>
                              )}

                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={arrowDetalle}
                                  onChange={(e) => setArrowDetalle(e.target.value)}
                                  placeholder="Nota corta (opcional)..."
                                  className="flex-1 bg-[#0F1115] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleConfirmArrowEvent(card)}
                                  className="px-3 py-1.5 rounded-lg bg-[#F0C800] text-black text-xs font-black cursor-pointer"
                                >
                                  Aplicar ➔
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* ==================== RASTRO EN EL CONTENEDOR DE ORIGEN (EJ. TALLER): QUIÉNES EMPEZARON ACÁ Y SE FUERON A OTRA OBRA ==================== */}
                {departedFromHereToday.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-dashed border-slate-800 space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Estuvieron hoy acá y salieron ({departedFromHereToday.length}):
                    </div>
                    {departedFromHereToday.map((dep) => {
                      const depVeh = dep.vehicleId ? vehicleMap.get(dep.vehicleId) : undefined;
                      const depEmp = dep.employeeId ? employeeMap.get(dep.employeeId) : undefined;
                      const nowInLabel = getLocationLabel(dep.locationType, dep.locationId);
                      return (
                        <div
                          key={`dep-${dep.id}`}
                          className="px-2 py-1 rounded bg-[#0F1115]/60 border border-slate-800/90 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-400"
                        >
                          <div className="flex items-center gap-1.5">
                            {depVeh && (
                              <span className="font-mono font-bold text-cyan-400/80">
                                [{getVehicleCode(depVeh)}] {depVeh.modeloMarca}
                              </span>
                            )}
                            {depEmp && <span>· 👷 {getEmployeeName(depEmp)}</span>}
                          </div>
                          <div className="flex items-center gap-1 font-bold text-[#F0C800]">
                            <span>➔ Se fue a:</span>
                            <span className="px-1.5 py-0.5 rounded bg-[#F0C800]/15 border border-[#F0C800]/30 text-white">
                              {nowInLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
