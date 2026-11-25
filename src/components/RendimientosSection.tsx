import React, { useMemo, useState } from 'react';
import {
  Employee,
  FuelDispensary,
  Obra,
  TruckPerformanceTrip,
  Vehicle,
} from '../types';
import { normalizeEquipmentClassification } from '../utils/equipmentClassification';
import { SearchableSelect, SearchableSelectOption } from './SearchableSelect';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Edit3,
  Fuel,
  Gauge,
  Layers,
  Link2,
  MapPin,
  Package,
  Plus,
  Route,
  Search,
  Table2,
  Trash2,
  Truck,
  Unlink,
  Wrench,
  X,
} from 'lucide-react';

interface RendimientosSectionProps {
  trips: TruckPerformanceTrip[];
  fleet: Vehicle[];
  employees: Employee[];
  obras: Obra[];
  fuelVouchers: FuelDispensary[];
  isLoading?: boolean;
  onSaveTrips: (items: TruckPerformanceTrip[]) => Promise<boolean>;
  onDeleteTrip: (id: string) => Promise<boolean>;
}

const CARGO_TYPES = [
  'Áridos / Ripio',
  'Arena',
  'Piedra',
  'Tierra / Relleno',
  'Maquinaria en Carretón',
  'Equipos / Materiales',
  'Escombros / Desmonte',
  'Hormigón / Cemento',
  'Combustible / Insumos',
  'Vacío / Retorno',
  'Otro',
];

function computeDurationMinutes(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const sMatch = /^(\d{1,2}):(\d{2})$/.exec(start.trim());
  const eMatch = /^(\d{1,2}):(\d{2})$/.exec(end.trim());
  if (!sMatch || !eMatch) return null;
  const sMins = Number(sMatch[1]) * 60 + Number(sMatch[2]);
  const eMins = Number(eMatch[1]) * 60 + Number(eMatch[2]);
  if (Number.isNaN(sMins) || Number.isNaN(eMins)) return null;
  let diff = eMins - sMins;
  if (diff < 0) diff += 24 * 60; // Soporta paso de medianoche
  return diff;
}

function formatDurationMinutes(mins?: number | null): string {
  if (mins === null || mins === undefined || Number.isNaN(mins)) return '—';
  const total = Math.max(0, Math.round(mins));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function normalizeDateToISO(dateStr?: string): string {
  if (!dateStr || !dateStr.trim() || dateStr === 'Sin Fecha') return 'Sin Fecha';
  const clean = dateStr.trim();
  if (clean.includes('T')) return clean.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const parts = clean.split(/[/\-.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      const p1 = parseInt(parts[0], 10);
      const p2 = parseInt(parts[1], 10);
      const y = parts[2];
      let m: number;
      let d: number;
      if (p1 > 12 && p2 <= 12) {
        d = p1;
        m = p2;
      } else if (p2 > 12 && p1 <= 12) {
        m = p1;
        d = p2;
      } else {
        m = p1;
        d = p2;
      }
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return clean;
}

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr || dateStr === 'Sin Fecha') return dateStr || 'Sin Fecha';
  const iso = normalizeDateToISO(dateStr);
  if (iso.includes('-')) {
    const parts = iso.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      const dNum = parseInt(day, 10);
      const mNum = parseInt(month, 10);
      const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
      ];
      const mesName = meses[mNum - 1] || month;
      return `${dNum} de ${mesName} de ${year} (${dNum}/${mNum}/${year})`;
    }
  }
  return dateStr;
}

function formatTableCellDate(dateStr?: string): string {
  if (!dateStr || dateStr === 'Sin Fecha') return '-';
  const iso = normalizeDateToISO(dateStr);
  if (iso.includes('-')) {
    const parts = iso.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function resolveVoucherVehicle(v: FuelDispensary, fleet: Vehicle[]) {
  const fCode = (v.codigoEquipo || '').toLowerCase().trim();
  const fModel = (v.marcaModelo || '').toLowerCase().trim();
  const fPlate = (v.patente || '').toLowerCase().replace(/\s+/g, '');

  const matchedVeh = fleet.find(f =>
    (f.id && fCode && f.id.toLowerCase() === fCode) ||
    (f.codigoEquipo && fCode && f.codigoEquipo.toLowerCase() === fCode) ||
    (f.codigoInterno && fCode && f.codigoInterno.toLowerCase() === fCode) ||
    (f.patente && fCode && f.patente.toLowerCase().replace(/\s+/g, '') === fCode.replace(/\s+/g, '')) ||
    (f.modeloMarca && fCode && f.modeloMarca.toLowerCase() === fCode) ||
    (f.patente && fPlate && f.patente.toLowerCase().replace(/\s+/g, '') === fPlate) ||
    (f.modeloMarca && fModel && f.modeloMarca.toLowerCase() === fModel)
  );

  const displayName = v.marcaModelo || matchedVeh?.modeloMarca || v.codigoEquipo || 'Equipo';
  const patente = v.patente || matchedVeh?.patente || '';
  const codigoInterno = matchedVeh?.codigoInterno || '';
  const equipmentKey = matchedVeh?.id || `${displayName.toLowerCase().trim()}::${patente.toLowerCase().trim()}`;

  return {
    matchedVeh,
    displayName,
    patente,
    codigoInterno,
    equipmentKey,
  };
}

function resolveVoucherDriver(v: FuelDispensary, employees: Employee[]): string {
  if (v.nombreApellido && v.nombreApellido.trim()) return v.nombreApellido.trim();
  const empCode = (v.codigoEmpleado || '').toLowerCase().trim();
  if (!empCode) return '-';
  const matched = employees.find(e =>
    (e.codigoEmpleado && e.codigoEmpleado.toLowerCase() === empCode) ||
    (e.id && e.id.toLowerCase() === empCode) ||
    (e.legajo && e.legajo.toLowerCase() === empCode) ||
    (e.nombreApellido && e.nombreApellido.toLowerCase() === empCode)
  );
  return matched?.nombreApellido || matched?.nombre || v.codigoEmpleado || '-';
}

function formatFuelVoucherLabel(v: FuelDispensary, fleet: Vehicle[] = []): string {
  const liters = Math.abs(Number(v.cantCarga ?? v.cantidad ?? 0));
  const orderRef = v.numOrden || v.numVale || v.numTicket || v.id.slice(0, 8);
  const resolved = fleet.length > 0 ? resolveVoucherVehicle(v, fleet) : null;
  const vehPart = resolved ? `${resolved.displayName}${resolved.patente ? ` (${resolved.patente})` : ''} · ` : '';
  return `${formatTableCellDate(v.fecha)} · ${vehPart}${liters.toLocaleString('es-AR')} L · ${v.tipoComb || 'Combustible'} · #${orderRef}`;
}

function buildVoucherSearchableText(v: FuelDispensary, fleet: Vehicle[] = [], employees: Employee[] = []): string {
  const resolved = resolveVoucherVehicle(v, fleet);
  const driver = resolveVoucherDriver(v, employees);
  const cellDate = formatTableCellDate(v.fecha);
  return `${v.fecha} ${cellDate} ${v.codigoEquipo} ${resolved.displayName} ${resolved.patente} ${resolved.codigoInterno} ${v.marcaModelo || ''} ${v.patente || ''} ${driver} ${v.tipoComb || ''} ${v.deposito || ''} ${v.obraNombre || ''} ${v.numOrden || ''} ${v.numVale || ''} ${v.numTicket || ''} ${v.cantidad || ''} ${v.cantCarga || ''}`.toLowerCase();
}

function vehicleMatchesVoucher(vehicle: Vehicle | undefined, voucher: FuelDispensary): boolean {
  if (!vehicle) return false;
  const vId = (vehicle.id || '').toLowerCase().trim();
  const vCode = (vehicle.codigoInterno || '').toLowerCase().trim();
  const vEquipCode = (vehicle.codigoEquipo || '').toLowerCase().trim();
  const vModel = (vehicle.modeloMarca || '').toLowerCase().trim();
  const vPlate = (vehicle.patente || '').toLowerCase().replace(/\s+/g, '');

  const fCode = (voucher.codigoEquipo || '').toLowerCase().trim();
  const fModel = (voucher.marcaModelo || '').toLowerCase().trim();
  const fPlate = (voucher.patente || '').toLowerCase().replace(/\s+/g, '');

  if (vId && fCode && vId === fCode) return true;
  if (vPlate && fPlate && vPlate === fPlate) return true;
  if (vCode && fCode && (fCode === vCode || fCode.includes(vCode) || vCode.includes(fCode))) return true;
  if (vEquipCode && fCode && (fCode === vEquipCode || fCode.includes(vEquipCode))) return true;
  if (vModel && fCode && (fCode.includes(vModel) || vModel.includes(fCode))) return true;
  if (vModel && fModel && (fModel.includes(vModel) || vModel.includes(fModel))) return true;
  return false;
}

interface DraftTripRow {
  localKey: string;
  id?: string;
  fecha: string;
  choferId: string;
  choferNombre: string;
  lugarInicio: string;
  lugarFinal: string;
  horaSalida: string;
  horaLlegada: string;
  kilometros: string;
  odometroInicio: string;
  odometroFin: string;
  showOdometerHelper: boolean;
  tipoCarga: string;
  detalleCarga: string;
  observaciones: string;
}

const createEmptyDraftRow = (fechaDefault: string, choferNombreDefault = '', choferIdDefault = ''): DraftTripRow => ({
  localKey: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  fecha: fechaDefault,
  choferId: choferIdDefault,
  choferNombre: choferNombreDefault,
  lugarInicio: '',
  lugarFinal: '',
  horaSalida: '',
  horaLlegada: '',
  kilometros: '',
  odometroInicio: '',
  odometroFin: '',
  showOdometerHelper: false,
  tipoCarga: 'Áridos / Ripio',
  detalleCarga: '',
  observaciones: '',
});

export const RendimientosSection: React.FC<RendimientosSectionProps> = ({
  trips,
  fleet,
  employees,
  obras,
  fuelVouchers,
  isLoading = false,
  onSaveTrips,
  onDeleteTrip,
}) => {
  const [equipmentTab, setEquipmentTab] = useState<'CAMIONES' | 'MAQUINAS'>('CAMIONES');
  const [viewMode, setViewMode] = useState<'por_carga' | 'viajes' | 'camiones'>('por_carga');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [truckFilter, setTruckFilter] = useState<string>('ALL');
  const [driverFilter, setDriverFilter] = useState<string>('ALL');
  const [cargoFilter, setCargoFilter] = useState<string>('ALL');
  const [linkFilter, setLinkFilter] = useState<'ALL' | 'LINKED' | 'UNLINKED'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Accordion expansion for "Por Carga de Combustible"
  const [expandedFuelGroupIds, setExpandedFuelGroupIds] = useState<Record<string, boolean>>({});

  // Multi-selection for grouping existing trips
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);

  // Batch / Single Trip Modal
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TruckPerformanceTrip | null>(null);
  const [showAllFleetInModal, setShowAllFleetInModal] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedFuelVoucherId, setSelectedFuelVoucherId] = useState<string>('');
  const [fuelVoucherSearch, setFuelVoucherSearch] = useState<string>('');
  const [draftRows, setDraftRows] = useState<DraftTripRow[]>([]);
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Fuel Table Picker Modal (shared between "Agrupar viajes" and "Llamar carga" inside batch modal)
  const [fuelPickerMode, setFuelPickerMode] = useState<'group' | 'batch' | null>(null);
  const [groupTargetTripIds, setGroupTargetTripIds] = useState<string[]>([]);
  const [pickerSelectedVoucherId, setPickerSelectedVoucherId] = useState<string>('');
  const [pickerSearch, setPickerSearch] = useState<string>('');
  const [pickerEquipmentFilter, setPickerEquipmentFilter] = useState<string>('ALL');
  const [pickerDateFrom, setPickerDateFrom] = useState<string>('');
  const [pickerDateTo, setPickerDateTo] = useState<string>('');
  const [pickerSortDir, setPickerSortDir] = useState<'desc' | 'asc'>('desc');
  const [pickerGroupByDate, setPickerGroupByDate] = useState<boolean>(true);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  // Delete confirmation modal
  const [tripToDelete, setTripToDelete] = useState<TruckPerformanceTrip | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Active trucks from fleet
  const truckVehicles = useMemo(() => {
    return fleet
      .filter(v => !v.archivado)
      .filter(v => {
        const cls = normalizeEquipmentClassification(v.clasificacion, v.modeloMarca);
        return cls === 'Camiones' || cls === 'Vehículos / Camionetas';
      })
      .sort((a, b) => a.modeloMarca.localeCompare(b.modeloMarca, 'es'));
  }, [fleet]);

  const allActiveVehicles = useMemo(() => {
    return fleet
      .filter(v => !v.archivado)
      .sort((a, b) => a.modeloMarca.localeCompare(b.modeloMarca, 'es'));
  }, [fleet]);

  const activeDrivers = useMemo(() => {
    return employees
      .filter(e => !e.archivado)
      .sort((a, b) => (a.nombreApellido || a.nombre || '').localeCompare(b.nombreApellido || b.nombre || '', 'es'));
  }, [employees]);

  // Suggestions for Lugar Inicio / Final (from Obras + past trips)
  const locationSuggestions = useMemo(() => {
    const set = new Set<string>(['Base Central (Alte. Brown 1560)', 'Cantera', 'Planta de Áridos']);
    obras.forEach(o => {
      if (o.nombreObra) set.add(o.nombreObra);
      if (o.ubicacion) set.add(o.ubicacion);
    });
    trips.forEach(t => {
      if (t.lugarInicio) set.add(t.lugarInicio);
      if (t.lugarFinal) set.add(t.lugarFinal);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [obras, trips]);

  const fuelVouchersById = useMemo(() => {
    const map = new Map<string, FuelDispensary>();
    fuelVouchers.forEach(v => map.set(v.id, v));
    return map;
  }, [fuelVouchers]);

  // Only EGRESO vouchers make sense as truck refuels (fallback to all if tipo missing)
  const truckFuelVouchers = useMemo(() => {
    return [...fuelVouchers]
      .filter(v => {
        const liters = Math.abs(Number(v.cantCarga ?? v.cantidad ?? 0));
        if (liters <= 0) return false;
        const tipo = String(v.tipo || 'EGRESO').toUpperCase();
        return tipo !== 'INGRESO';
      })
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [fuelVouchers]);

  const truckTrips = useMemo(() => {
    return trips.filter(t => (t.categoriaEquipo || 'CAMIONES') === 'CAMIONES');
  }, [trips]);

  const filteredTrips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return truckTrips
      .filter(t => {
        if (truckFilter !== 'ALL' && t.codigoEquipo !== truckFilter && t.vehiculoId !== truckFilter) {
          return false;
        }
        if (driverFilter !== 'ALL' && t.choferNombre !== driverFilter && t.choferId !== driverFilter) {
          return false;
        }
        if (cargoFilter !== 'ALL' && t.tipoCarga !== cargoFilter) {
          return false;
        }
        if (linkFilter === 'LINKED' && !t.fuelVoucherId) return false;
        if (linkFilter === 'UNLINKED' && t.fuelVoucherId) return false;
        if (dateFrom && t.fecha < dateFrom) return false;
        if (dateTo && t.fecha > dateTo) return false;
        if (!q) return true;
        return (
          t.codigoEquipo.toLowerCase().includes(q) ||
          (t.patente || '').toLowerCase().includes(q) ||
          (t.choferNombre || '').toLowerCase().includes(q) ||
          (t.lugarInicio || '').toLowerCase().includes(q) ||
          (t.lugarFinal || '').toLowerCase().includes(q) ||
          (t.tipoCarga || '').toLowerCase().includes(q) ||
          (t.detalleCarga || '').toLowerCase().includes(q) ||
          (t.fuelVoucherLabel || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const d = (b.fecha || '').localeCompare(a.fecha || '');
        if (d !== 0) return d;
        return (b.horaSalida || '').localeCompare(a.horaSalida || '');
      });
  }, [truckTrips, searchQuery, truckFilter, driverFilter, cargoFilter, linkFilter, dateFrom, dateTo]);

  // Global KPI metrics across filtered trips
  const kpis = useMemo(() => {
    const totalTrips = filteredTrips.length;
    const totalKms = filteredTrips.reduce((s, t) => s + Number(t.kilometros || 0), 0);

    // Autonomy across fuel loads linked to the filtered trips
    const uniqueVoucherIds = new Set<string>();
    let kmsInLinkedTrips = 0;
    filteredTrips.forEach(t => {
      if (t.fuelVoucherId) {
        uniqueVoucherIds.add(t.fuelVoucherId);
        kmsInLinkedTrips += Number(t.kilometros || 0);
      }
    });

    let totalLinkedLiters = 0;
    uniqueVoucherIds.forEach(vid => {
      const voucher = fuelVouchersById.get(vid);
      if (voucher) {
        totalLinkedLiters += Math.abs(Number(voucher.cantCarga ?? voucher.cantidad ?? 0));
      } else {
        const snapTrip = filteredTrips.find(t => t.fuelVoucherId === vid && t.fuelLitersSnapshot);
        if (snapTrip?.fuelLitersSnapshot) {
          totalLinkedLiters += Number(snapTrip.fuelLitersSnapshot);
        }
      }
    });

    const avgKmPerLiter = totalLinkedLiters > 0 ? kmsInLinkedTrips / totalLinkedLiters : 0;
    const avgLitersPer100 = kmsInLinkedTrips > 0 && totalLinkedLiters > 0
      ? (totalLinkedLiters / kmsInLinkedTrips) * 100
      : 0;

    const timedDurations = filteredTrips
      .map(t => (typeof t.duracionMinutos === 'number' ? t.duracionMinutos : computeDurationMinutes(t.horaSalida, t.horaLlegada)))
      .filter((m): m is number => m !== null && m >= 0);

    const totalMinutes = timedDurations.reduce((s, m) => s + m, 0);
    const avgMinutes = timedDurations.length > 0 ? totalMinutes / timedDurations.length : null;

    return {
      totalTrips,
      totalKms,
      linkedLoadsCount: uniqueVoucherIds.size,
      totalLinkedLiters,
      avgKmPerLiter,
      avgLitersPer100,
      timedCount: timedDurations.length,
      totalMinutes,
      avgMinutes,
    };
  }, [filteredTrips, fuelVouchersById]);

  // Grouped by Fuel Load view
  const fuelGroups = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        groupKey: string;
        fuelVoucherId: string | null;
        voucher?: FuelDispensary;
        label: string;
        fecha: string;
        codigoEquipo: string;
        patente: string;
        liters: number;
        totalImporte: number;
        trips: TruckPerformanceTrip[];
        totalKms: number;
        totalMinutes: number;
        timedCount: number;
        avgSpeedKmh: number | null;
        kmPerLiter: number | null;
        litersPer100Km: number | null;
        costPerKm: number | null;
      }
    >();

    for (const trip of filteredTrips) {
      const key = trip.fuelVoucherId ? `FUEL:${trip.fuelVoucherId}` : 'UNLINKED';
      if (!groupsMap.has(key)) {
        const voucher = trip.fuelVoucherId ? fuelVouchersById.get(trip.fuelVoucherId) : undefined;
        const liters = voucher
          ? Math.abs(Number(voucher.cantCarga ?? voucher.cantidad ?? 0))
          : Number(trip.fuelLitersSnapshot || 0);
        const totalImporte = voucher
          ? Number(voucher.totalImporte || (voucher.precioUnitario ? voucher.precioUnitario * liters : 0))
          : 0;

        const resolvedVeh = voucher ? resolveVoucherVehicle(voucher, fleet) : null;

        groupsMap.set(key, {
          groupKey: key,
          fuelVoucherId: trip.fuelVoucherId || null,
          voucher,
          label: voucher
            ? formatFuelVoucherLabel(voucher, fleet)
            : trip.fuelVoucherLabel || 'Viajes sin carga de combustible asignada',
          fecha: voucher?.fecha || trip.fuelFechaSnapshot || trip.fecha,
          codigoEquipo: resolvedVeh ? resolvedVeh.displayName : trip.codigoEquipo,
          patente: resolvedVeh?.patente || trip.patente || '',
          liters,
          totalImporte,
          trips: [],
          totalKms: 0,
          totalMinutes: 0,
          timedCount: 0,
          avgSpeedKmh: null,
          kmPerLiter: null,
          litersPer100Km: null,
          costPerKm: null,
        });
      }

      const grp = groupsMap.get(key)!;
      grp.trips.push(trip);
      grp.totalKms += Number(trip.kilometros || 0);
      const dur = typeof trip.duracionMinutos === 'number'
        ? trip.duracionMinutos
        : computeDurationMinutes(trip.horaSalida, trip.horaLlegada);
      if (dur !== null && dur >= 0) {
        grp.totalMinutes += dur;
        grp.timedCount += 1;
      }
    }

    const result = Array.from(groupsMap.values()).map(grp => {
      const kmPerLiter = grp.fuelVoucherId && grp.liters > 0 && grp.totalKms > 0
        ? grp.totalKms / grp.liters
        : null;
      const litersPer100Km = grp.fuelVoucherId && grp.liters > 0 && grp.totalKms > 0
        ? (grp.liters / grp.totalKms) * 100
        : null;
      const costPerKm = grp.fuelVoucherId && grp.totalImporte > 0 && grp.totalKms > 0
        ? grp.totalImporte / grp.totalKms
        : null;

      let timedKms = 0;
      grp.trips.forEach(t => {
        const dur = typeof t.duracionMinutos === 'number'
          ? t.duracionMinutos
          : computeDurationMinutes(t.horaSalida, t.horaLlegada);
        if (dur !== null && dur > 0) timedKms += Number(t.kilometros || 0);
      });
      const avgSpeedKmh = grp.totalMinutes > 0 && timedKms > 0
        ? timedKms / (grp.totalMinutes / 60)
        : null;

      return {
        ...grp,
        kmPerLiter,
        litersPer100Km,
        costPerKm,
        avgSpeedKmh,
      };
    });

    return result.sort((a, b) => {
      if (a.groupKey === 'UNLINKED') return -1;
      if (b.groupKey === 'UNLINKED') return 1;
      return (b.fecha || '').localeCompare(a.fecha || '');
    });
  }, [filteredTrips, fuelVouchersById, fleet]);

  // Per-trip proportional fuel consumption computed over full fuel load groups (stable even when filtering trips)
  const tripFuelConsumptionMap = useMemo(() => {
    const groupTotals = new Map<string, { totalKms: number; totalLiters: number; totalCost: number }>();

    truckTrips.forEach(t => {
      if (!t.fuelVoucherId) return;
      const vid = t.fuelVoucherId;
      if (!groupTotals.has(vid)) {
        const voucher = fuelVouchersById.get(vid);
        const totalLiters = voucher
          ? Math.abs(Number(voucher.cantCarga ?? voucher.cantidad ?? 0))
          : Number(t.fuelLitersSnapshot || 0);
        const totalCost = voucher
          ? Number(voucher.totalImporte || (voucher.precioUnitario ? voucher.precioUnitario * totalLiters : 0))
          : 0;
        groupTotals.set(vid, { totalKms: 0, totalLiters, totalCost });
      }
      groupTotals.get(vid)!.totalKms += Number(t.kilometros || 0);
    });

    const result = new Map<
      string,
      { liters: number; sharePercent: number; cost: number | null }
    >();

    truckTrips.forEach(t => {
      if (!t.fuelVoucherId) return;
      const grp = groupTotals.get(t.fuelVoucherId);
      if (!grp || grp.totalKms <= 0 || grp.totalLiters <= 0) return;
      const shareRatio = Number(t.kilometros || 0) / grp.totalKms;
      result.set(t.id, {
        liters: grp.totalLiters * shareRatio,
        sharePercent: shareRatio * 100,
        cost: grp.totalCost > 0 ? grp.totalCost * shareRatio : null,
      });
    });

    return result;
  }, [truckTrips, fuelVouchersById]);

  // Truck comparison summary
  const truckSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        codigoEquipo: string;
        patente: string;
        tripsCount: number;
        totalKms: number;
        linkedVoucherIds: Set<string>;
        linkedKms: number;
        totalMinutes: number;
        timedCount: number;
      }
    >();

    filteredTrips.forEach(t => {
      const key = t.codigoEquipo;
      if (!map.has(key)) {
        map.set(key, {
          codigoEquipo: t.codigoEquipo,
          patente: t.patente || '',
          tripsCount: 0,
          totalKms: 0,
          linkedVoucherIds: new Set(),
          linkedKms: 0,
          totalMinutes: 0,
          timedCount: 0,
        });
      }
      const entry = map.get(key)!;
      entry.tripsCount += 1;
      entry.totalKms += Number(t.kilometros || 0);
      if (t.fuelVoucherId) {
        entry.linkedVoucherIds.add(t.fuelVoucherId);
        entry.linkedKms += Number(t.kilometros || 0);
      }
      const dur = typeof t.duracionMinutos === 'number'
        ? t.duracionMinutos
        : computeDurationMinutes(t.horaSalida, t.horaLlegada);
      if (dur !== null && dur >= 0) {
        entry.totalMinutes += dur;
        entry.timedCount += 1;
      }
    });

    return Array.from(map.values())
      .map(s => {
        let totalLiters = 0;
        let totalCost = 0;
        s.linkedVoucherIds.forEach(vid => {
          const v = fuelVouchersById.get(vid);
          if (v) {
            const lit = Math.abs(Number(v.cantCarga ?? v.cantidad ?? 0));
            totalLiters += lit;
            totalCost += Number(v.totalImporte || (v.precioUnitario ? v.precioUnitario * lit : 0));
          } else {
            const snap = filteredTrips.find(tr => tr.fuelVoucherId === vid && tr.fuelLitersSnapshot);
            if (snap?.fuelLitersSnapshot) totalLiters += Number(snap.fuelLitersSnapshot);
          }
        });

        const kmPerLiter = totalLiters > 0 && s.linkedKms > 0 ? s.linkedKms / totalLiters : null;
        const litersPer100 = totalLiters > 0 && s.linkedKms > 0 ? (totalLiters / s.linkedKms) * 100 : null;
        const avgMins = s.timedCount > 0 ? s.totalMinutes / s.timedCount : null;
        const costPerKm = totalCost > 0 && s.linkedKms > 0 ? totalCost / s.linkedKms : null;

        return {
          ...s,
          loadsCount: s.linkedVoucherIds.size,
          totalLiters,
          kmPerLiter,
          litersPer100,
          avgMins,
          costPerKm,
        };
      })
      .sort((a, b) => b.totalKms - a.totalKms);
  }, [filteredTrips, fuelVouchersById]);

  const distinctTruckNamesInTrips = useMemo(() => {
    const s = new Set<string>();
    truckVehicles.forEach(v => s.add(v.modeloMarca));
    truckTrips.forEach(t => s.add(t.codigoEquipo));
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
  }, [truckVehicles, truckTrips]);

  const distinctDriverNamesInTrips = useMemo(() => {
    const s = new Set<string>();
    activeDrivers.forEach(d => {
      const name = d.nombreApellido || d.nombre;
      if (name) s.add(name);
    });
    truckTrips.forEach(t => {
      if (t.choferNombre) s.add(t.choferNombre);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
  }, [activeDrivers, truckTrips]);

  // SearchableSelect options for main toolbar filters
  const truckFilterOptions = useMemo<SearchableSelectOption[]>(() => {
    return [
      { value: 'ALL', label: 'Todos los Camiones' },
      ...distinctTruckNamesInTrips.map(name => {
        const veh = allActiveVehicles.find(v => v.modeloMarca === name || v.codigoInterno === name);
        return {
          value: name,
          label: name,
          secondaryText: veh?.patente ? `Patente: ${veh.patente}` : undefined,
          extraSearchTerms: `${veh?.codigoInterno || ''} ${veh?.patente || ''}`,
        };
      }),
    ];
  }, [distinctTruckNamesInTrips, allActiveVehicles]);

  const driverFilterOptions = useMemo<SearchableSelectOption[]>(() => {
    return [
      { value: 'ALL', label: 'Todos los Choferes' },
      ...distinctDriverNamesInTrips.map(name => ({
        value: name,
        label: name,
      })),
    ];
  }, [distinctDriverNamesInTrips]);

  // Modal helpers: Vehicle & Fuel Voucher candidates
  const modalVehicleList = showAllFleetInModal ? allActiveVehicles : (truckVehicles.length > 0 ? truckVehicles : allActiveVehicles);
  const modalSelectedVehicle = useMemo(
    () => allActiveVehicles.find(v => v.id === selectedVehicleId) || modalVehicleList.find(v => v.id === selectedVehicleId),
    [allActiveVehicles, modalVehicleList, selectedVehicleId]
  );

  const modalVehicleSelectOptions = useMemo<SearchableSelectOption[]>(() => {
    return modalVehicleList.map(v => ({
      value: v.id,
      label: v.modeloMarca,
      secondaryText: [v.patente, v.codigoInterno].filter(Boolean).join(' · ') || undefined,
      extraSearchTerms: `${v.codigoEquipo || ''} ${v.patente || ''} ${v.codigoInterno || ''} ${v.clasificacion || ''}`,
    }));
  }, [modalVehicleList]);

  const modalFuelCandidates = useMemo(() => {
    const q = fuelVoucherSearch.trim().toLowerCase();
    const list = truckFuelVouchers.filter(v => !q || buildVoucherSearchableText(v, fleet, employees).includes(q));
    if (!modalSelectedVehicle) return list.slice(0, 120);

    const matching: FuelDispensary[] = [];
    const others: FuelDispensary[] = [];
    list.forEach(v => {
      if (vehicleMatchesVoucher(modalSelectedVehicle, v)) matching.push(v);
      else others.push(v);
    });
    return [...matching, ...others].slice(0, 120);
  }, [truckFuelVouchers, modalSelectedVehicle, fuelVoucherSearch, fleet, employees]);

  const modalFuelSelectOptions = useMemo<SearchableSelectOption[]>(() => {
    return [
      { value: '', label: '-- Sin carga de combustible por ahora --' },
      ...modalFuelCandidates.map(v => {
        const resolved = resolveVoucherVehicle(v, fleet);
        const isMatch = modalSelectedVehicle && vehicleMatchesVoucher(modalSelectedVehicle, v);
        const liters = Math.abs(Number(v.cantCarga ?? v.cantidad ?? 0));
        const orderRef = v.numOrden || v.numVale || v.numTicket || v.id.slice(0, 8);
        return {
          value: v.id,
          label: `${isMatch ? '★ ' : ''}${formatTableCellDate(v.fecha)} · ${resolved.displayName}${resolved.patente ? ` (${resolved.patente})` : ''}`,
          secondaryText: `${liters.toLocaleString('es-AR', { maximumFractionDigits: 2 })} L · ${v.tipoComb || 'Combustible'} · #${orderRef} · ${v.deposito || ''}`,
          extraSearchTerms: buildVoucherSearchableText(v, fleet, employees),
        };
      }),
    ];
  }, [modalFuelCandidates, fleet, employees, modalSelectedVehicle]);

  const selectedFuelVoucherObj = useMemo(
    () => (selectedFuelVoucherId ? fuelVouchersById.get(selectedFuelVoucherId) : undefined),
    [selectedFuelVoucherId, fuelVouchersById]
  );

  // Map fuelVoucherId -> linked trips stats for table visibility
  const linkedTripsByVoucherId = useMemo(() => {
    const map = new Map<string, { count: number; kms: number }>();
    truckTrips.forEach(t => {
      if (!t.fuelVoucherId) return;
      const cur = map.get(t.fuelVoucherId) || { count: 0, kms: 0 };
      cur.count += 1;
      cur.kms += Number(t.kilometros || 0);
      map.set(t.fuelVoucherId, cur);
    });
    return map;
  }, [truckTrips]);

  // Distinct Equipment options for the Fuel Table Picker SearchableSelect
  const fuelEquipmentFilterOptions = useMemo<SearchableSelectOption[]>(() => {
    const counts = new Map<string, { key: string; label: string; patente: string; codigoInterno: string; count: number }>();
    truckFuelVouchers.forEach(v => {
      const r = resolveVoucherVehicle(v, fleet);
      const existing = counts.get(r.equipmentKey);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(r.equipmentKey, {
          key: r.equipmentKey,
          label: r.displayName,
          patente: r.patente,
          codigoInterno: r.codigoInterno,
          count: 1,
        });
      }
    });

    const sorted = Array.from(counts.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'));
    return [
      { value: 'ALL', label: `Todos los equipos (${truckFuelVouchers.length} cargas)` },
      ...sorted.map(item => ({
        value: item.key,
        label: item.label,
        secondaryText: [item.patente, item.codigoInterno, `${item.count} ${item.count === 1 ? 'carga' : 'cargas'}`]
          .filter(Boolean)
          .join(' · '),
        extraSearchTerms: `${item.patente} ${item.codigoInterno} ${item.label}`,
      })),
    ];
  }, [truckFuelVouchers, fleet]);

  // Open Batch Create Modal
  const handleOpenBatchModal = (preselectedVoucher?: FuelDispensary) => {
    setEditingTrip(null);
    setModalError(null);
    setFuelVoucherSearch('');
    const today = new Date().toISOString().slice(0, 10);

    if (preselectedVoucher) {
      const matchedVeh = allActiveVehicles.find(v => vehicleMatchesVoucher(v, preselectedVoucher));
      setSelectedVehicleId(matchedVeh?.id || '');
      if (matchedVeh && !truckVehicles.some(tv => tv.id === matchedVeh.id)) {
        setShowAllFleetInModal(true);
      } else {
        setShowAllFleetInModal(false);
      }
      setSelectedFuelVoucherId(preselectedVoucher.id);
      const voucherDriver = preselectedVoucher.nombreApellido || preselectedVoucher.codigoEmpleado || '';
      const matchedDriver = activeDrivers.find(
        d => (d.nombreApellido || d.nombre || '').toLowerCase() === voucherDriver.toLowerCase()
      );
      setDraftRows([
        createEmptyDraftRow(
          preselectedVoucher.fecha || today,
          matchedDriver?.nombreApellido || matchedDriver?.nombre || voucherDriver,
          matchedDriver?.id || ''
        ),
      ]);
    } else {
      setShowAllFleetInModal(false);
      const firstVeh = truckVehicles[0] || allActiveVehicles[0];
      setSelectedVehicleId(firstVeh?.id || '');
      setSelectedFuelVoucherId('');
      setDraftRows([createEmptyDraftRow(today)]);
    }

    setIsTripModalOpen(true);
  };

  // Open Edit Modal for existing trip
  const handleOpenEditModal = (trip: TruckPerformanceTrip) => {
    setEditingTrip(trip);
    setModalError(null);
    setFuelVoucherSearch('');
    const matchedVeh =
      allActiveVehicles.find(v => v.id === trip.vehiculoId || v.modeloMarca === trip.codigoEquipo);
    if (matchedVeh && !truckVehicles.some(tv => tv.id === matchedVeh.id)) {
      setShowAllFleetInModal(true);
    } else {
      setShowAllFleetInModal(false);
    }
    setSelectedVehicleId(matchedVeh?.id || '');
    setSelectedFuelVoucherId(trip.fuelVoucherId || '');

    setDraftRows([
      {
        localKey: trip.id,
        id: trip.id,
        fecha: trip.fecha || new Date().toISOString().slice(0, 10),
        choferId: trip.choferId || '',
        choferNombre: trip.choferNombre || '',
        lugarInicio: trip.lugarInicio || '',
        lugarFinal: trip.lugarFinal || '',
        horaSalida: trip.horaSalida || '',
        horaLlegada: trip.horaLlegada || '',
        kilometros: String(trip.kilometros ?? ''),
        odometroInicio: trip.odometroInicio !== undefined ? String(trip.odometroInicio) : '',
        odometroFin: trip.odometroFin !== undefined ? String(trip.odometroFin) : '',
        showOdometerHelper: false,
        tipoCarga: trip.tipoCarga || 'Áridos / Ripio',
        detalleCarga: trip.detalleCarga || '',
        observaciones: trip.observaciones || '',
      },
    ]);
    setIsTripModalOpen(true);
  };

  const handleUpdateDraftRow = (localKey: string, patch: Partial<DraftTripRow>) => {
    setDraftRows(prev =>
      prev.map(row => {
        if (row.localKey !== localKey) return row;
        const next = { ...row, ...patch };
        if ('odometroInicio' in patch || 'odometroFin' in patch) {
          const ini = Number(next.odometroInicio);
          const fin = Number(next.odometroFin);
          if (!Number.isNaN(ini) && !Number.isNaN(fin) && fin > ini) {
            next.kilometros = String(Number((fin - ini).toFixed(1)));
          }
        }
        return next;
      })
    );
  };

  const handleAddDraftRow = (fromRow?: DraftTripRow, invertRoute = false) => {
    const base = fromRow || draftRows[draftRows.length - 1];
    const today = new Date().toISOString().slice(0, 10);
    const newRow = createEmptyDraftRow(
      base?.fecha || selectedFuelVoucherObj?.fecha || today,
      base?.choferNombre || '',
      base?.choferId || ''
    );
    if (fromRow && invertRoute) {
      newRow.lugarInicio = fromRow.lugarFinal;
      newRow.lugarFinal = fromRow.lugarInicio;
      newRow.kilometros = fromRow.kilometros;
      newRow.tipoCarga = 'Vacío / Retorno';
    } else if (base) {
      newRow.tipoCarga = base.tipoCarga;
    }
    setDraftRows(prev => [...prev, newRow]);
  };

  const handleRemoveDraftRow = (localKey: string) => {
    setDraftRows(prev => (prev.length <= 1 ? prev : prev.filter(r => r.localKey !== localKey)));
  };

  const batchPreviewStats = useMemo(() => {
    const validKms = draftRows.reduce((s, r) => s + (Number(r.kilometros) > 0 ? Number(r.kilometros) : 0), 0);
    const mins = draftRows.reduce((s, r) => {
      const d = computeDurationMinutes(r.horaSalida, r.horaLlegada);
      return s + (d !== null ? d : 0);
    }, 0);
    const timedRows = draftRows.filter(r => computeDurationMinutes(r.horaSalida, r.horaLlegada) !== null).length;
    const liters = selectedFuelVoucherObj
      ? Math.abs(Number(selectedFuelVoucherObj.cantCarga ?? selectedFuelVoucherObj.cantidad ?? 0))
      : 0;
    const autonomy = liters > 0 && validKms > 0 ? validKms / liters : null;
    return { validKms, mins, timedRows, liters, autonomy };
  }, [draftRows, selectedFuelVoucherObj]);

  const handleSaveBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!modalSelectedVehicle && !editingTrip) {
      setModalError('Seleccioná el camión para registrar los viajes.');
      return;
    }

    for (let i = 0; i < draftRows.length; i++) {
      const r = draftRows[i];
      if (!r.lugarInicio.trim() || !r.lugarFinal.trim()) {
        setModalError(`Viaje #${i + 1}: completá el Lugar de Inicio y el Lugar de Final.`);
        return;
      }
      const kms = Number(r.kilometros);
      if (Number.isNaN(kms) || kms <= 0) {
        setModalError(`Viaje #${i + 1}: ingresá los kilómetros recorridos (mayor a 0).`);
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const fuelVoucher = selectedFuelVoucherObj;
    const fuelLiters = fuelVoucher
      ? Math.abs(Number(fuelVoucher.cantCarga ?? fuelVoucher.cantidad ?? 0))
      : undefined;

    const payload: TruckPerformanceTrip[] = draftRows.map((r, idx) => {
      const dur = computeDurationMinutes(r.horaSalida, r.horaLlegada);
      const matchedObra = obras.find(
        o =>
          o.nombreObra.toLowerCase() === r.lugarFinal.trim().toLowerCase() ||
          o.nombreObra.toLowerCase() === r.lugarInicio.trim().toLowerCase()
      );
      return {
        id: r.id || `REND-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        categoriaEquipo: 'CAMIONES',
        fecha: r.fecha || new Date().toISOString().slice(0, 10),
        vehiculoId: modalSelectedVehicle?.id || editingTrip?.vehiculoId,
        codigoEquipo: modalSelectedVehicle?.modeloMarca || editingTrip?.codigoEquipo || '',
        marcaModelo: modalSelectedVehicle?.modeloMarca || editingTrip?.marcaModelo,
        patente: modalSelectedVehicle?.patente || editingTrip?.patente || '',
        choferId: r.choferId || undefined,
        choferNombre: r.choferNombre.trim() || 'Sin chofer asignado',
        obraId: matchedObra?.id,
        obraNombre: matchedObra?.nombreObra,
        lugarInicio: r.lugarInicio.trim(),
        lugarFinal: r.lugarFinal.trim(),
        horaSalida: r.horaSalida.trim() || undefined,
        horaLlegada: r.horaLlegada.trim() || undefined,
        duracionMinutos: dur,
        kilometros: Number(r.kilometros),
        odometroInicio: r.odometroInicio ? Number(r.odometroInicio) : undefined,
        odometroFin: r.odometroFin ? Number(r.odometroFin) : undefined,
        tipoCarga: r.tipoCarga.trim() || 'Otro',
        detalleCarga: r.detalleCarga.trim() || undefined,
        observaciones: r.observaciones.trim() || undefined,
        fuelVoucherId: fuelVoucher ? fuelVoucher.id : undefined,
        fuelVoucherLabel: fuelVoucher ? formatFuelVoucherLabel(fuelVoucher, fleet) : undefined,
        fuelLitersSnapshot: fuelLiters,
        fuelFechaSnapshot: fuelVoucher?.fecha,
        createdAt: editingTrip?.createdAt || nowIso,
        updatedAt: nowIso,
      };
    });

    setIsSavingModal(true);
    try {
      const ok = await onSaveTrips(payload);
      if (!ok) {
        setModalError('No se pudo confirmar el guardado en la base de datos. Reintentá.');
        return;
      }
      setIsTripModalOpen(false);
    } catch (err: any) {
      setModalError(err?.message || 'Error guardando viajes en Supabase.');
    } finally {
      setIsSavingModal(false);
    }
  };

  // Open Expendio-style Fuel Table Picker for grouping existing trips
  const handleOpenGroupModal = (targetIds: string[]) => {
    setGroupTargetTripIds(targetIds);
    setPickerSelectedVoucherId('');
    setPickerSearch('');
    setPickerDateFrom('');
    setPickerDateTo('');
    setPickerSortDir('desc');
    setPickerGroupByDate(true);
    setGroupError(null);

    // Smart initial equipment filter only if that vehicle has fuel vouchers
    const firstTrip = truckTrips.find(t => targetIds.includes(t.id));
    const targetVeh = firstTrip
      ? allActiveVehicles.find(v => v.id === firstTrip.vehiculoId || v.modeloMarca === firstTrip.codigoEquipo)
      : undefined;
    if (targetVeh && truckFuelVouchers.some(v => vehicleMatchesVoucher(targetVeh, v))) {
      setPickerEquipmentFilter(targetVeh.id);
    } else {
      setPickerEquipmentFilter('ALL');
    }

    setFuelPickerMode('group');
  };

  // Open Expendio-style Fuel Table Picker from inside "Cargar / Editar Viajes"
  const handleOpenBatchFuelPicker = () => {
    setGroupTargetTripIds([]);
    setPickerSelectedVoucherId(selectedFuelVoucherId || '');
    setPickerSearch('');
    setPickerDateFrom('');
    setPickerDateTo('');
    setPickerSortDir('desc');
    setPickerGroupByDate(true);
    setGroupError(null);

    if (modalSelectedVehicle && truckFuelVouchers.some(v => vehicleMatchesVoucher(modalSelectedVehicle, v))) {
      setPickerEquipmentFilter(modalSelectedVehicle.id);
    } else {
      setPickerEquipmentFilter('ALL');
    }

    setFuelPickerMode('batch');
  };

  const pickerFilteredVouchers = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

    const filtered = truckFuelVouchers.filter(v => {
      const isoDate = normalizeDateToISO(v.fecha);
      if (pickerDateFrom && isoDate !== 'Sin Fecha' && isoDate < pickerDateFrom) return false;
      if (pickerDateTo && isoDate !== 'Sin Fecha' && isoDate > pickerDateTo) return false;

      if (pickerEquipmentFilter !== 'ALL') {
        const resolved = resolveVoucherVehicle(v, fleet);
        if (resolved.equipmentKey !== pickerEquipmentFilter && resolved.matchedVeh?.id !== pickerEquipmentFilter) {
          return false;
        }
      }

      if (tokens.length > 0) {
        const hay = buildVoucherSearchableText(v, fleet, employees);
        if (!tokens.every(tok => hay.includes(tok))) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const dA = normalizeDateToISO(a.fecha);
      const dB = normalizeDateToISO(b.fecha);
      if (dA !== dB) {
        if (dA === 'Sin Fecha') return 1;
        if (dB === 'Sin Fecha') return -1;
        return pickerSortDir === 'desc' ? dB.localeCompare(dA) : dA.localeCompare(dB);
      }
      const hA = a.hora || '';
      const hB = b.hora || '';
      return pickerSortDir === 'desc' ? hB.localeCompare(hA) : hA.localeCompare(hB);
    });
  }, [truckFuelVouchers, pickerSearch, pickerEquipmentFilter, pickerDateFrom, pickerDateTo, pickerSortDir, fleet, employees]);

  const pickerGroupedByDate = useMemo(() => {
    if (!pickerGroupByDate) {
      return [['TODAS', pickerFilteredVouchers]] as Array<[string, FuelDispensary[]]>;
    }
    const groups = new Map<string, FuelDispensary[]>();
    pickerFilteredVouchers.forEach(v => {
      const key = normalizeDateToISO(v.fecha);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(v);
    });
    return Array.from(groups.entries());
  }, [pickerFilteredVouchers, pickerGroupByDate]);

  const pickerSelectedVoucherObj = useMemo(
    () => (pickerSelectedVoucherId ? fuelVouchersById.get(pickerSelectedVoucherId) : undefined),
    [pickerSelectedVoucherId, fuelVouchersById]
  );

  const handleConfirmFuelPicker = async (explicitVoucherId?: string) => {
    const chosenId = explicitVoucherId || pickerSelectedVoucherId;
    setGroupError(null);
    if (!chosenId) {
      setGroupError('Seleccioná una carga de combustible de la tabla.');
      return;
    }

    if (fuelPickerMode === 'batch') {
      setSelectedFuelVoucherId(chosenId);
      setFuelPickerMode(null);
      return;
    }

    const voucher = fuelVouchersById.get(chosenId);
    if (!voucher) {
      setGroupError('No se encontró la carga de combustible seleccionada.');
      return;
    }

    const liters = Math.abs(Number(voucher.cantCarga ?? voucher.cantidad ?? 0));
    const label = formatFuelVoucherLabel(voucher, fleet);
    const nowIso = new Date().toISOString();

    const updated = truckTrips
      .filter(t => groupTargetTripIds.includes(t.id))
      .map(t => ({
        ...t,
        fuelVoucherId: voucher.id,
        fuelVoucherLabel: label,
        fuelLitersSnapshot: liters,
        fuelFechaSnapshot: voucher.fecha,
        updatedAt: nowIso,
      }));

    if (updated.length === 0) return;

    setIsSavingGroup(true);
    try {
      const ok = await onSaveTrips(updated);
      if (!ok) {
        setGroupError('No se pudo confirmar la agrupación en Supabase.');
        return;
      }
      setSelectedTripIds([]);
      setFuelPickerMode(null);
    } catch (err: any) {
      setGroupError(err?.message || 'Error al agrupar viajes.');
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleUnlinkTripFromFuel = async (trip: TruckPerformanceTrip) => {
    const updated: TruckPerformanceTrip = {
      ...trip,
      fuelVoucherId: undefined,
      fuelVoucherLabel: undefined,
      fuelLitersSnapshot: undefined,
      fuelFechaSnapshot: undefined,
      updatedAt: new Date().toISOString(),
    };
    await onSaveTrips([updated]);
  };

  const handleConfirmDelete = async () => {
    if (!tripToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await onDeleteTrip(tripToDelete.id);
      if (ok) {
        setSelectedTripIds(prev => prev.filter(id => id !== tripToDelete.id));
        setTripToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Fecha',
      'Camión',
      'Patente',
      'Chofer',
      'Lugar Inicio',
      'Lugar Final',
      'Hora Salida',
      'Hora Llegada',
      'Duración (min)',
      'Kms',
      'Combustible Consumido (L)',
      'Tipo de Carga',
      'Detalle Carga',
      'Carga Combustible Vinculada',
    ];
    const rows = filteredTrips.map(t => {
      const dur = typeof t.duracionMinutos === 'number'
        ? t.duracionMinutos
        : computeDurationMinutes(t.horaSalida, t.horaLlegada);
      const cons = tripFuelConsumptionMap.get(t.id);
      return [
        t.fecha,
        t.codigoEquipo,
        t.patente || '',
        t.choferNombre || '',
        t.lugarInicio,
        t.lugarFinal,
        t.horaSalida || '',
        t.horaLlegada || '',
        dur !== null ? String(dur) : '',
        String(t.kilometros || 0),
        cons ? cons.liters.toFixed(2) : '',
        t.tipoCarga,
        t.detalleCarga || '',
        t.fuelVoucherLabel || '',
      ];
    });
    const csvContent = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rendimientos_camiones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleAllVisibleTrips = () => {
    const allIds = filteredTrips.map(t => t.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedTripIds.includes(id));
    setSelectedTripIds(allSelected ? [] : allIds);
  };

  const toggleSingleTripSelection = (id: string) => {
    setSelectedTripIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="bg-[#16191F] border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Trabajos</span>
            <span aria-hidden="true">/</span>
            <span>Control Operativo de Flota</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Rendimientos de Camiones y Maquinarias
          </h2>
          <p className="text-xs text-slate-400">
            Registrá viajes con origen, destino, kilómetros, tipo de carga y horarios opcionales, y agrupalos en cargas de combustible reales para medir autonomía y tiempos de demora.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Equipment Category Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[#0F1115] border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setEquipmentTab('CAMIONES')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                equipmentTab === 'CAMIONES'
                  ? 'bg-[#F0C800] text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              Camiones ({truckTrips.length})
            </button>
            <button
              type="button"
              onClick={() => setEquipmentTab('MAQUINAS')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                equipmentTab === 'MAQUINAS'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              Máquinas
            </button>
          </div>

          {equipmentTab === 'CAMIONES' && (
            <>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredTrips.length === 0}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#0F1115] hover:bg-slate-800 text-slate-200 border border-slate-800 transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
              <button
                type="button"
                onClick={() => handleOpenBatchModal()}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-[#F0C800] hover:bg-amber-400 text-slate-950 transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Cargar Viajes
              </button>
            </>
          )}
        </div>
      </div>

      {equipmentTab === 'MAQUINAS' ? (
        <div className="bg-[#16191F] border border-slate-800 rounded-xl p-10 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-lg bg-[#0F1115] border border-slate-800 flex items-center justify-center text-amber-400">
            <Wrench className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">
            Rendimientos de Maquinaria Pesada — Próxima Etapa
          </h3>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            La sección está preparada para incorporar el control por horas de motor, litros/hora y producción de máquinas viales en la siguiente etapa. Actualmente tenés activo el módulo completo para <b>Camiones</b>.
          </p>
          <button
            type="button"
            onClick={() => setEquipmentTab('CAMIONES')}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-[#F0C800] hover:bg-amber-400 text-slate-950 transition cursor-pointer"
          >
            Ir a Rendimientos de Camiones
          </button>
        </div>
      ) : (
        <>
          {/* 4-Column KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Viajes Registrados</span>
                <Route className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-2xl font-bold text-white font-mono tabular-nums">
                {kpis.totalTrips.toLocaleString('es-AR')}
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                {kpis.linkedLoadsCount} cargas de combustible vinculadas
              </div>
            </div>

            <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Kilómetros Recorridos</span>
                <MapPin className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-2xl font-bold text-white font-mono tabular-nums">
                {kpis.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                {kpis.totalTrips > 0
                  ? `${(kpis.totalKms / kpis.totalTrips).toFixed(1)} km promedio / viaje`
                  : 'Sin viajes en el filtro'}
              </div>
            </div>

            <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Autonomía Promedio</span>
                <Fuel className="w-4 h-4 text-[#F0C800]" />
              </div>
              <div className="text-2xl font-bold text-[#F0C800] font-mono tabular-nums">
                {kpis.avgKmPerLiter > 0 ? `${kpis.avgKmPerLiter.toFixed(2)} km/L` : '—'}
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                {kpis.avgLitersPer100 > 0
                  ? `${kpis.avgLitersPer100.toFixed(1)} L/100km · ${kpis.totalLinkedLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L`
                  : 'Agrupá viajes con una carga para calcular'}
              </div>
            </div>

            <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Demora Promedio por Viaje</span>
                <Clock className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
                {formatDurationMinutes(kpis.avgMinutes)}
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                {kpis.timedCount > 0
                  ? `${kpis.timedCount} de ${kpis.totalTrips} viajes con hora · Total ${formatDurationMinutes(kpis.totalMinutes)}`
                  : 'Opcional: cargá salida/llegada para medir'}
              </div>
            </div>
          </div>

          {/* Sub-view Tabs & Filter Bar */}
          <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* View Switcher */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0F1115] border border-slate-800 rounded-lg self-start">
                <button
                  type="button"
                  onClick={() => setViewMode('por_carga')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'por_carga'
                      ? 'bg-slate-800 text-[#F0C800]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Fuel className="w-3.5 h-3.5" />
                  Por Carga de Combustible ({fuelGroups.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('viajes')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'viajes'
                      ? 'bg-slate-800 text-[#F0C800]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Route className="w-3.5 h-3.5" />
                  Todos los Viajes ({filteredTrips.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('camiones')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'camiones'
                      ? 'bg-slate-800 text-[#F0C800]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Resumen por Camión ({truckSummaries.length})
                </button>
              </div>

              {/* Search */}
              <div className="relative flex-1 max-w-md w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar por camión, chofer, origen, destino, carga o combustible..."
                  className="w-full bg-[#0F1115] border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                />
              </div>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2.5 pt-2 border-t border-slate-800/80 items-center">
              <SearchableSelect
                compact
                options={truckFilterOptions}
                value={truckFilter}
                onChange={setTruckFilter}
                clearValue="ALL"
                placeholder="Todos los Camiones"
                searchPlaceholder="Escribir equipo o patente..."
              />

              <SearchableSelect
                compact
                options={driverFilterOptions}
                value={driverFilter}
                onChange={setDriverFilter}
                clearValue="ALL"
                placeholder="Todos los Choferes"
                searchPlaceholder="Escribir nombre del chofer..."
              />

              <select
                value={cargoFilter}
                onChange={e => setCargoFilter(e.target.value)}
                className="bg-[#0F1115] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#F0C800]"
              >
                <option value="ALL">Todos los Tipos de Carga</option>
                {CARGO_TYPES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={linkFilter}
                onChange={e => setLinkFilter(e.target.value as 'ALL' | 'LINKED' | 'UNLINKED')}
                className="bg-[#0F1115] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#F0C800]"
              >
                <option value="ALL">Todas las Agrupaciones</option>
                <option value="LINKED">Con Carga de Combustible</option>
                <option value="UNLINKED">Sin Agrupar (Pendientes)</option>
              </select>

              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                title="Fecha desde"
                className="bg-[#0F1115] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-[#F0C800]"
              />

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  title="Fecha hasta"
                  className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-[#F0C800]"
                />
                {(searchQuery || truckFilter !== 'ALL' || driverFilter !== 'ALL' || cargoFilter !== 'ALL' || linkFilter !== 'ALL' || dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setTruckFilter('ALL');
                      setDriverFilter('ALL');
                      setCargoFilter('ALL');
                      setLinkFilter('ALL');
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0 cursor-pointer"
                    title="Limpiar filtros"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Batch selection bar for "Todos los Viajes" */}
          {selectedTripIds.length > 0 && (
            <div className="bg-[#16191F] border border-[#F0C800]/50 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-white font-semibold">
                <span className="font-mono font-bold text-[#F0C800]">{selectedTripIds.length}</span> viajes seleccionados ·{' '}
                <span className="font-mono text-slate-300">
                  {truckTrips
                    .filter(t => selectedTripIds.includes(t.id))
                    .reduce((s, t) => s + Number(t.kilometros || 0), 0)
                    .toLocaleString('es-AR', { maximumFractionDigits: 1 })}{' '}
                  km
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTripIds([])}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  Deseleccionar
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenGroupModal(selectedTripIds)}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[#F0C800] hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Agrupar en Carga de Combustible
                </button>
              </div>
            </div>
          )}

          {/* LOADING / EMPTY STATE */}
          {isLoading ? (
            <div className="bg-[#16191F] border border-slate-800 rounded-xl p-6 space-y-3">
              {[0, 1, 2, 3].map(idx => (
                <div key={idx} className="h-11 rounded-lg bg-[#0F1115] border border-slate-800/60 animate-pulse" />
              ))}
            </div>
          ) : filteredTrips.length === 0 ? (
            <div className="bg-[#16191F] border border-dashed border-slate-800 rounded-xl p-10 text-center space-y-3">
              <Route className="w-10 h-10 text-slate-500 mx-auto" />
              <div className="text-sm font-bold text-white">
                {truckTrips.length === 0
                  ? 'Todavía no hay viajes cargados en Rendimientos'
                  : 'No hay viajes que coincidan con el filtro aplicado'}
              </div>
              <p className="text-xs text-slate-400 max-w-lg mx-auto">
                Cargá uno o varios viajes indicando lugar de inicio, destino, kilómetros, tipo de carga y horarios opcionales, y vinculalos con una carga de combustible para obtener autonomía y tiempos de demora.
              </p>
              <button
                type="button"
                onClick={() => handleOpenBatchModal()}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-[#F0C800] hover:bg-amber-400 text-slate-950 transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Cargar Primeros Viajes
              </button>
            </div>
          ) : viewMode === 'por_carga' ? (
            /* VIEW 1: GROUPED BY FUEL LOAD */
            <div className="space-y-3">
              {fuelGroups.map(grp => {
                const isUnlinked = grp.groupKey === 'UNLINKED';
                const isExpanded = expandedFuelGroupIds[grp.groupKey] ?? true;
                return (
                  <div
                    key={grp.groupKey}
                    className="bg-[#16191F] border border-slate-800 rounded-xl overflow-hidden"
                  >
                    <div className="px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800/80">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="font-semibold text-white">
                            {isUnlinked ? 'Viajes Pendientes de Agrupar' : grp.codigoEquipo}
                          </span>
                          {grp.patente && !isUnlinked && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-slate-300">{grp.patente}</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{grp.fecha}</span>
                          {grp.voucher?.numOrden && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">Orden #{grp.voucher.numOrden}</span>
                            </>
                          )}
                          {grp.voucher?.deposito && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{grp.voucher.deposito}</span>
                            </>
                          )}
                        </div>
                        <div className="text-sm font-bold text-[#F0C800] truncate">
                          {grp.label}
                        </div>
                      </div>

                      {/* Group Performance Metrics & Actions */}
                      <div className="flex flex-wrap items-center gap-4 shrink-0">
                        <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
                          <div>
                            <div className="text-[10px] text-slate-400 font-sans">Viajes</div>
                            <div className="font-bold text-white">{grp.trips.length}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400 font-sans">Kms Totales</div>
                            <div className="font-bold text-white">
                              {grp.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                            </div>
                          </div>
                          {!isUnlinked && (
                            <>
                              <div>
                                <div className="text-[10px] text-slate-400 font-sans">Combustible</div>
                                <div className="font-bold text-slate-200">
                                  {grp.liters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-slate-400 font-sans">Autonomía</div>
                                <div className="font-bold text-emerald-400">
                                  {grp.kmPerLiter !== null ? `${grp.kmPerLiter.toFixed(2)} km/L` : '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-slate-400 font-sans">Consumo</div>
                                <div className="font-bold text-slate-200">
                                  {grp.litersPer100Km !== null ? `${grp.litersPer100Km.toFixed(1)} L/100` : '—'}
                                </div>
                              </div>
                            </>
                          )}
                          <div>
                            <div className="text-[10px] text-slate-400 font-sans">Demora Total</div>
                            <div className="font-bold text-amber-300">
                              {grp.timedCount > 0 ? formatDurationMinutes(grp.totalMinutes) : 'Sin hora'}
                            </div>
                          </div>
                          {grp.avgSpeedKmh !== null && (
                            <div>
                              <div className="text-[10px] text-slate-400 font-sans">Vel. Media</div>
                              <div className="font-bold text-slate-200">{grp.avgSpeedKmh.toFixed(1)} km/h</div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isUnlinked ? (
                            <button
                              type="button"
                              onClick={() => handleOpenGroupModal(grp.trips.map(t => t.id))}
                              className="px-3 py-1.5 rounded-lg bg-[#F0C800] hover:bg-amber-400 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              Agrupar en Carga
                            </button>
                          ) : (
                            grp.voucher && (
                              <button
                                type="button"
                                onClick={() => handleOpenBatchModal(grp.voucher)}
                                className="px-3 py-1.5 rounded-lg bg-[#0F1115] hover:bg-slate-800 text-[#F0C800] border border-[#F0C800]/40 text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Sumar Viaje
                              </button>
                            )
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedFuelGroupIds(prev => ({
                                ...prev,
                                [grp.groupKey]: !isExpanded,
                              }))
                            }
                            className="p-1.5 rounded-lg bg-[#0F1115] hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
                            title={isExpanded ? 'Contraer viajes' : 'Desplegar viajes'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#0F1115] text-slate-400 text-[11px] font-semibold border-b border-slate-800">
                              <th className="py-2.5 px-4">Fecha</th>
                              <th className="py-2.5 px-3">Camión & Chofer</th>
                              <th className="py-2.5 px-4">Recorrido (Inicio → Final)</th>
                              <th className="py-2.5 px-3">Tipo de Carga</th>
                              <th className="py-2.5 px-3">Horario / Demora</th>
                              <th className="py-2.5 px-3 text-right">Kms</th>
                              <th className="py-2.5 px-3 text-right">Comb. Consumido</th>
                              <th className="py-2.5 px-4 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {grp.trips.map(t => {
                              const dur = typeof t.duracionMinutos === 'number'
                                ? t.duracionMinutos
                                : computeDurationMinutes(t.horaSalida, t.horaLlegada);
                              const cons = tripFuelConsumptionMap.get(t.id);
                              return (
                                <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                    {t.fecha}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="font-semibold text-white">{t.codigoEquipo}</div>
                                    <div className="text-[11px] text-slate-400">
                                      {t.choferNombre}
                                      {t.patente ? ` · ${t.patente}` : ''}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <div className="flex items-center gap-1.5 text-slate-100 font-medium">
                                      <span>{t.lugarInicio}</span>
                                      <ArrowRight className="w-3.5 h-3.5 text-[#F0C800] shrink-0" />
                                      <span>{t.lugarFinal}</span>
                                    </div>
                                    {t.observaciones && (
                                      <div className="text-[11px] text-slate-400 truncate max-w-md">
                                        {t.observaciones}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="text-slate-200 font-medium">{t.tipoCarga}</div>
                                    {t.detalleCarga && (
                                      <div className="text-[11px] text-slate-400">{t.detalleCarga}</div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                                    {t.horaSalida || t.horaLlegada ? (
                                      <div>
                                        <div className="text-slate-200">
                                          {t.horaSalida || '--:--'} → {t.horaLlegada || '--:--'}
                                        </div>
                                        {dur !== null && (
                                          <div className="text-[11px] text-emerald-400">
                                            {formatDurationMinutes(dur)}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-500 font-sans">Sin horario</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-white whitespace-nowrap">
                                    {Number(t.kilometros || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                    {cons ? (
                                      <div>
                                        <div className="font-bold text-[#F0C800]">
                                          {cons.liters.toLocaleString('es-AR', {
                                            minimumFractionDigits: 1,
                                            maximumFractionDigits: 1,
                                          })}{' '}
                                          L
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                          {cons.cost !== null
                                            ? `$${cons.cost.toLocaleString('es-AR', { maximumFractionDigits: 0 })} · `
                                            : ''}
                                          {cons.sharePercent.toFixed(1)}%
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-500">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(t)}
                                        className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
                                        title="Editar viaje"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      {t.fuelVoucherId ? (
                                        <button
                                          type="button"
                                          onClick={() => handleUnlinkTripFromFuel(t)}
                                          className="p-1.5 rounded-lg text-amber-300 hover:bg-slate-800 cursor-pointer"
                                          title="Desvincular de esta carga de combustible"
                                        >
                                          <Unlink className="w-3.5 h-3.5" />
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenGroupModal([t.id])}
                                          className="p-1.5 rounded-lg text-[#F0C800] hover:bg-slate-800 cursor-pointer"
                                          title="Vincular a una carga de combustible"
                                        >
                                          <Link2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setTripToDelete(t)}
                                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 cursor-pointer"
                                        title="Eliminar viaje"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          {!isUnlinked && grp.liters > 0 && (
                            <tfoot>
                              <tr className="bg-[#0F1115]/90 border-t border-slate-800 text-xs font-mono tabular-nums">
                                <td colSpan={5} className="py-2.5 px-4 font-sans text-slate-400 font-semibold">
                                  Total consumido en {grp.trips.length} {grp.trips.length === 1 ? 'viaje' : 'viajes'} de la carga
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-white whitespace-nowrap">
                                  {grp.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-[#F0C800] whitespace-nowrap">
                                  {grp.trips
                                    .reduce((sum, tr) => sum + (tripFuelConsumptionMap.get(tr.id)?.liters || 0), 0)
                                    .toLocaleString('es-AR', {
                                      minimumFractionDigits: 1,
                                      maximumFractionDigits: 1,
                                    })}{' '}
                                  L
                                </td>
                                <td className="py-2.5 px-4"></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : viewMode === 'viajes' ? (
            /* VIEW 2: ALL TRIPS WITH MULTI-SELECT GROUPING */
            <div className="bg-[#16191F] border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0F1115] text-slate-400 text-[11px] font-semibold border-b border-slate-800">
                      <th className="py-3 px-3 w-9">
                        <input
                          type="checkbox"
                          checked={filteredTrips.length > 0 && filteredTrips.every(t => selectedTripIds.includes(t.id))}
                          onChange={toggleAllVisibleTrips}
                          className="rounded border-slate-700 accent-[#F0C800] cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-3">Fecha</th>
                      <th className="py-3 px-3">Camión & Chofer</th>
                      <th className="py-3 px-4">Inicio → Final</th>
                      <th className="py-3 px-3">Tipo de Carga</th>
                      <th className="py-3 px-3">Horario / Demora</th>
                      <th className="py-3 px-3 text-right">Kms</th>
                      <th className="py-3 px-3 text-right">Comb. Consumido</th>
                      <th className="py-3 px-4">Carga de Combustible</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredTrips.map(t => {
                      const dur = typeof t.duracionMinutos === 'number'
                        ? t.duracionMinutos
                        : computeDurationMinutes(t.horaSalida, t.horaLlegada);
                      const voucher = t.fuelVoucherId ? fuelVouchersById.get(t.fuelVoucherId) : undefined;
                      const isSelected = selectedTripIds.includes(t.id);
                      const cons = tripFuelConsumptionMap.get(t.id);

                      return (
                        <tr key={t.id} className={`hover:bg-slate-800/30 transition-colors ${isSelected ? 'bg-[#F0C800]/5' : ''}`}>
                          <td className="py-3 px-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSingleTripSelection(t.id)}
                              className="rounded border-slate-700 accent-[#F0C800] cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                            {t.fecha}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-white">{t.codigoEquipo}</div>
                            <div className="text-[11px] text-slate-400">
                              {t.choferNombre}
                              {t.patente ? ` · ${t.patente}` : ''}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-slate-100 font-medium">
                              <span>{t.lugarInicio}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-[#F0C800] shrink-0" />
                              <span>{t.lugarFinal}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-slate-200 font-medium">{t.tipoCarga}</div>
                            {t.detalleCarga && (
                              <div className="text-[11px] text-slate-400">{t.detalleCarga}</div>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                            {t.horaSalida || t.horaLlegada ? (
                              <div>
                                <div className="text-slate-200">
                                  {t.horaSalida || '--:--'} → {t.horaLlegada || '--:--'}
                                </div>
                                {dur !== null && (
                                  <div className="text-[11px] text-emerald-400">
                                    {formatDurationMinutes(dur)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 font-sans">Sin horario</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-white whitespace-nowrap">
                            {Number(t.kilometros || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {cons ? (
                              <div>
                                <div className="font-bold text-[#F0C800]">
                                  {cons.liters.toLocaleString('es-AR', {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  })}{' '}
                                  L
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {cons.cost !== null
                                    ? `$${cons.cost.toLocaleString('es-AR', { maximumFractionDigits: 0 })} · `
                                    : ''}
                                  {cons.sharePercent.toFixed(1)}%
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {t.fuelVoucherId ? (
                              <div className="text-[11px] font-mono text-emerald-300">
                                {voucher ? formatFuelVoucherLabel(voucher, fleet) : t.fuelVoucherLabel || 'Carga vinculada'}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenGroupModal([t.id])}
                                className="text-[11px] font-semibold text-[#F0C800] hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <Link2 className="w-3 h-3" />
                                Vincular a Carga
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(t)}
                                className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
                                title="Editar viaje"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setTripToDelete(t)}
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 cursor-pointer"
                                title="Eliminar viaje"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* VIEW 3: PER-TRUCK SUMMARY */
            <div className="bg-[#16191F] border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0F1115] text-slate-400 text-[11px] font-semibold border-b border-slate-800">
                      <th className="py-3 px-4">Camión</th>
                      <th className="py-3 px-3 text-right">Viajes</th>
                      <th className="py-3 px-3 text-right">Kms Totales</th>
                      <th className="py-3 px-3 text-right">Cargas Vinculadas</th>
                      <th className="py-3 px-3 text-right">Litros</th>
                      <th className="py-3 px-3 text-right">Autonomía (km/L)</th>
                      <th className="py-3 px-3 text-right">Consumo (L/100km)</th>
                      <th className="py-3 px-3 text-right">Demora Prom. / Viaje</th>
                      <th className="py-3 px-4 text-right">Costo Comb. / km</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {truckSummaries.map(s => (
                      <tr key={s.codigoEquipo} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{s.codigoEquipo}</div>
                          {s.patente && <div className="text-[11px] font-mono text-slate-400">{s.patente}</div>}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-white">
                          {s.tripsCount}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-white">
                          {s.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                          {s.loadsCount}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                          {s.totalLiters > 0 ? `${s.totalLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L` : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-[#F0C800]">
                          {s.kmPerLiter !== null ? `${s.kmPerLiter.toFixed(2)} km/L` : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200">
                          {s.litersPer100 !== null ? `${s.litersPer100.toFixed(1)} L` : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-400">
                          {formatDurationMinutes(s.avgMins)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                          {s.costPerKm !== null ? `$${s.costPerKm.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: CARGAR UNO O VARIOS VIAJES + AGRUPAR CON CARGA DE COMBUSTIBLE */}
      {isTripModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-800 rounded-xl w-full max-w-5xl overflow-hidden shadow-2xl">
            <div className="bg-[#0F1115] px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Truck className="w-5 h-5 text-[#F0C800]" />
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingTrip
                      ? 'Editar Viaje de Rendimiento'
                      : 'Cargar Viajes de Camión y Agrupar en Carga de Combustible'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Podés cargar 1 o varios viajes juntos y vincularlos con una carga del módulo Combustible (la hora es opcional).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTripModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBatchSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {/* Step 1: Camión y Carga de Combustible */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#0F1115] border border-slate-800 rounded-xl p-4">
                <div className="lg:col-span-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white">1. Camión *</label>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showAllFleetInModal}
                        onChange={e => setShowAllFleetInModal(e.target.checked)}
                        className="rounded border-slate-700 accent-[#F0C800]"
                      />
                      Ver toda la flota
                    </label>
                  </div>
                  <SearchableSelect
                    options={modalVehicleSelectOptions}
                    value={selectedVehicleId}
                    onChange={setSelectedVehicleId}
                    showClear={false}
                    placeholder={`-- Seleccionar Camión (${modalVehicleList.length}) --`}
                    searchPlaceholder="Escribir modelo, patente o código..."
                  />
                </div>

                <div className="lg:col-span-7 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-[#F0C800] flex items-center gap-1.5">
                      <Fuel className="w-3.5 h-3.5" />
                      2. Llamar Carga de Combustible (para agrupar los viajes)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenBatchFuelPicker}
                        className="px-2.5 py-1 rounded-lg bg-[#16191F] hover:bg-slate-800 border border-[#F0C800]/50 text-[11px] font-bold text-[#F0C800] flex items-center gap-1 cursor-pointer"
                      >
                        <Table2 className="w-3.5 h-3.5" />
                        Ver Tabla por Fecha
                      </button>
                      {selectedFuelVoucherObj && (
                        <button
                          type="button"
                          onClick={() => setSelectedFuelVoucherId('')}
                          className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                        >
                          Quitar carga
                        </button>
                      )}
                    </div>
                  </div>
                  <SearchableSelect
                    options={modalFuelSelectOptions}
                    value={selectedFuelVoucherId}
                    onChange={setSelectedFuelVoucherId}
                    clearValue=""
                    placeholder="-- Sin carga de combustible por ahora --"
                    searchPlaceholder="Filtrar carga por equipo, fecha, litros u orden..."
                  />
                  {selectedFuelVoucherObj && (() => {
                    const resolved = resolveVoucherVehicle(selectedFuelVoucherObj, fleet);
                    const liters = Math.abs(Number(selectedFuelVoucherObj.cantCarga ?? selectedFuelVoucherObj.cantidad ?? 0));
                    return (
                      <div className="text-[11px] text-emerald-400 font-mono tabular-nums">
                        Carga: {formatTableCellDate(selectedFuelVoucherObj.fecha)} · {resolved.displayName}
                        {resolved.patente ? ` (${resolved.patente})` : ''} · {liters.toLocaleString('es-AR', { maximumFractionDigits: 2 })} L ({selectedFuelVoucherObj.tipoComb}) · {selectedFuelVoucherObj.deposito}
                        {selectedFuelVoucherObj.kilometraje ? ` · Odóm: ${Number(selectedFuelVoucherObj.kilometraje).toLocaleString('es-AR')} km` : ''}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Step 2: Trips Batch List */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-white">
                    3. Detalle de Viajes ({draftRows.length}) — Horas de salida y llegada son opcionales
                  </div>
                  {!editingTrip && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddDraftRow(draftRows[draftRows.length - 1], true)}
                        className="px-3 py-1.5 rounded-lg bg-[#0F1115] hover:bg-slate-800 text-amber-300 border border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        + Viaje Vuelta (Invertido)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddDraftRow()}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        + Agregar Otro Viaje
                      </button>
                    </div>
                  )}
                </div>

                <datalist id="rendimientos-lugares-list">
                  {locationSuggestions.map(loc => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>

                <div className="space-y-3">
                  {draftRows.map((row, idx) => {
                    const rowDur = computeDurationMinutes(row.horaSalida, row.horaLlegada);
                    const rowKms = Number(row.kilometros);
                    const rowSpeed = rowDur && rowDur > 0 && rowKms > 0 ? rowKms / (rowDur / 60) : null;
                    return (
                      <div
                        key={row.localKey}
                        className="bg-[#0F1115] border border-slate-800 rounded-xl p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800/70 pb-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-white">
                            <span>Viaje #{idx + 1}</span>
                            {rowDur !== null && (
                              <span className="text-[11px] font-mono font-normal text-emerald-400">
                                · Duración: {formatDurationMinutes(rowDur)}
                                {rowSpeed !== null ? ` (${rowSpeed.toFixed(1)} km/h)` : ''}
                              </span>
                            )}
                          </div>
                          {!editingTrip && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAddDraftRow(row, true)}
                                className="px-2 py-1 rounded text-[11px] text-amber-300 hover:bg-slate-800 cursor-pointer"
                                title="Generar viaje de vuelta invirtiendo inicio y final"
                              >
                                + Vuelta
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveDraftRow(row.localKey)}
                                disabled={draftRows.length <= 1}
                                className="p-1 text-red-400 hover:bg-red-500/10 rounded disabled:opacity-30 cursor-pointer"
                                title="Quitar viaje"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="md:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Fecha *</label>
                            <input
                              type="date"
                              required
                              value={row.fecha}
                              onChange={e => handleUpdateDraftRow(row.localKey, { fecha: e.target.value })}
                              className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Chofer</label>
                            <select
                              value={row.choferId || ''}
                              onChange={e => {
                                const drv = activeDrivers.find(d => d.id === e.target.value);
                                handleUpdateDraftRow(row.localKey, {
                                  choferId: drv?.id || '',
                                  choferNombre: drv ? drv.nombreApellido || drv.nombre || '' : row.choferNombre,
                                });
                              }}
                              className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            >
                              <option value="">-- Elegir de nómina --</option>
                              {activeDrivers.map(d => (
                                <option key={d.id} value={d.id}>
                                  {d.nombreApellido || d.nombre}
                                </option>
                              ))}
                            </select>
                            {!row.choferId && (
                              <input
                                type="text"
                                value={row.choferNombre}
                                onChange={e => handleUpdateDraftRow(row.localKey, { choferNombre: e.target.value })}
                                placeholder="O escribir nombre chofer..."
                                className="mt-1 w-full bg-[#16191F] border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200"
                              />
                            )}
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Lugar de Inicio *</label>
                            <input
                              type="text"
                              required
                              list="rendimientos-lugares-list"
                              value={row.lugarInicio}
                              onChange={e => handleUpdateDraftRow(row.localKey, { lugarInicio: e.target.value })}
                              placeholder="Ej: Cantera / Base Central"
                              className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            />
                          </div>

                          <div className="md:col-span-4">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Lugar Final *</label>
                            <input
                              type="text"
                              required
                              list="rendimientos-lugares-list"
                              value={row.lugarFinal}
                              onChange={e => handleUpdateDraftRow(row.localKey, { lugarFinal: e.target.value })}
                              placeholder="Ej: Obra Parque Industrial"
                              className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                          <div className="md:col-span-2">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-semibold text-slate-400">Kms *</label>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateDraftRow(row.localKey, {
                                    showOdometerHelper: !row.showOdometerHelper,
                                  })
                                }
                                className="text-[10px] text-[#F0C800] hover:underline cursor-pointer"
                              >
                                {row.showOdometerHelper ? 'Ocultar odóm.' : 'Por odóm.'}
                              </button>
                            </div>
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              required
                              value={row.kilometros}
                              onChange={e => handleUpdateDraftRow(row.localKey, { kilometros: e.target.value })}
                              placeholder="Ej: 48.5"
                              className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold tabular-nums"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Tipo de Carga *</label>
                            <select
                              value={CARGO_TYPES.includes(row.tipoCarga) ? row.tipoCarga : 'Otro'}
                              onChange={e =>
                                handleUpdateDraftRow(row.localKey, {
                                  tipoCarga: e.target.value === 'Otro' ? '' : e.target.value,
                                })
                              }
                              className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            >
                              {CARGO_TYPES.map(c => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                            {!CARGO_TYPES.slice(0, -1).includes(row.tipoCarga) && (
                              <input
                                type="text"
                                value={row.tipoCarga}
                                onChange={e => handleUpdateDraftRow(row.localKey, { tipoCarga: e.target.value })}
                                placeholder="Especificar tipo de carga..."
                                className="mt-1 w-full bg-[#16191F] border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-white"
                              />
                            )}
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Detalle Carga (Opcional)
                            </label>
                            <input
                              type="text"
                              value={row.detalleCarga}
                              onChange={e => handleUpdateDraftRow(row.localKey, { detalleCarga: e.target.value })}
                              placeholder="Ej: 14 m3 / 18 tn / Bobcat S570"
                              className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Hora Salida (Opc.)
                            </label>
                            <input
                              type="time"
                              value={row.horaSalida}
                              onChange={e => handleUpdateDraftRow(row.localKey, { horaSalida: e.target.value })}
                              className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Hora Llegada (Opc.)
                            </label>
                            <input
                              type="time"
                              value={row.horaLlegada}
                              onChange={e => handleUpdateDraftRow(row.localKey, { horaLlegada: e.target.value })}
                              className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                            />
                          </div>
                        </div>

                        {row.showOdometerHelper && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800/70">
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-1">Odómetro Inicio</label>
                              <input
                                type="number"
                                value={row.odometroInicio}
                                onChange={e => handleUpdateDraftRow(row.localKey, { odometroInicio: e.target.value })}
                                placeholder="Ej: 318000"
                                className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-1">Odómetro Final</label>
                              <input
                                type="number"
                                value={row.odometroFin}
                                onChange={e => handleUpdateDraftRow(row.localKey, { odometroFin: e.target.value })}
                                placeholder="Ej: 318048"
                                className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                              />
                            </div>
                            <div className="col-span-2 flex items-end">
                              <input
                                type="text"
                                value={row.observaciones}
                                onChange={e => handleUpdateDraftRow(row.localKey, { observaciones: e.target.value })}
                                placeholder="Observaciones del viaje (demora en carga, espera en obra, etc.)"
                                className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Summary Preview */}
              <div className="bg-[#0F1115] border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-xs font-mono tabular-nums">
                <div className="flex flex-wrap items-center gap-4">
                  <span>
                    <span className="text-slate-400 font-sans">Viajes:</span>{' '}
                    <b className="text-white">{draftRows.length}</b>
                  </span>
                  <span>
                    <span className="text-slate-400 font-sans">Kms lote:</span>{' '}
                    <b className="text-white">{batchPreviewStats.validKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km</b>
                  </span>
                  {batchPreviewStats.liters > 0 && (
                    <span>
                      <span className="text-slate-400 font-sans">Autonomía estimada:</span>{' '}
                      <b className="text-[#F0C800]">
                        {batchPreviewStats.autonomy !== null ? `${batchPreviewStats.autonomy.toFixed(2)} km/L` : '—'}
                      </b>
                    </span>
                  )}
                  {batchPreviewStats.timedRows > 0 && (
                    <span>
                      <span className="text-slate-400 font-sans">Demora acumulada:</span>{' '}
                      <b className="text-emerald-400">{formatDurationMinutes(batchPreviewStats.mins)}</b>
                    </span>
                  )}
                </div>
              </div>

              {modalError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                  {modalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTripModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingModal}
                  className="px-5 py-2 rounded-lg text-xs font-bold bg-[#F0C800] hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                  {isSavingModal
                    ? 'Guardando en Supabase...'
                    : editingTrip
                      ? 'Guardar Cambios'
                      : `Guardar ${draftRows.length} ${draftRows.length === 1 ? 'Viaje' : 'Viajes'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BUSCADOR DE CARGA DE COMBUSTIBLE EN TABLA POR FECHA (ESTILO EXPENDIO) */}
      {fuelPickerMode && (
        <div className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#16191F] border border-slate-800 rounded-xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-[#0F1115] px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Fuel className="w-5 h-5 text-[#F0C800] shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-white truncate">
                    {fuelPickerMode === 'group'
                      ? `Agrupar ${groupTargetTripIds.length} ${groupTargetTripIds.length === 1 ? 'Viaje' : 'Viajes'} en Carga de Combustible`
                      : 'Seleccionar Carga de Combustible (Tabla por Fecha)'}
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    Buscá escribiendo el equipo o filtrá por fecha, chofer, estación u orden igual que en Expendio. Doble clic o seleccioná para confirmar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFuelPickerMode(null)}
                className="text-slate-400 hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Toolbar */}
            <div className="p-4 bg-[#12151B] border-b border-slate-800 space-y-3 shrink-0">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
                {/* Searchable Equipment Filter (escribir y va filtrando) */}
                <div className="md:col-span-4">
                  <SearchableSelect
                    label="Filtrar por Equipo"
                    icon={<Truck className="w-3.5 h-3.5 text-[#F0C800]" />}
                    compact
                    options={fuelEquipmentFilterOptions}
                    value={pickerEquipmentFilter}
                    onChange={setPickerEquipmentFilter}
                    clearValue="ALL"
                    placeholder="Todos los equipos"
                    searchPlaceholder="Escribí marca, modelo, patente o código..."
                  />
                </div>

                {/* General Text Search */}
                <div className="md:col-span-4">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Buscar en tabla
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={pickerSearch}
                      onChange={e => setPickerSearch(e.target.value)}
                      placeholder="Fecha, chofer, orden/vale, estación, litros..."
                      className="w-full bg-[#0F1115] border border-slate-700 rounded-xl pl-8 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                    />
                    {pickerSearch && (
                      <button
                        type="button"
                        onClick={() => setPickerSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Date Range */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Desde</label>
                  <input
                    type="date"
                    value={pickerDateFrom}
                    onChange={e => setPickerDateFrom(e.target.value)}
                    className="w-full bg-[#0F1115] border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#F0C800]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Hasta</label>
                  <input
                    type="date"
                    value={pickerDateTo}
                    onChange={e => setPickerDateTo(e.target.value)}
                    className="w-full bg-[#0F1115] border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#F0C800]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                    className="px-2.5 py-1.5 rounded-lg bg-[#0F1115] hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    {pickerSortDir === 'desc' ? (
                      <>
                        <ArrowDown className="w-3.5 h-3.5 text-[#F0C800]" />
                        Fecha: Más recientes primero
                      </>
                    ) : (
                      <>
                        <ArrowUp className="w-3.5 h-3.5 text-[#F0C800]" />
                        Fecha: Más antiguas primero
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPickerGroupByDate(prev => !prev)}
                    className={`px-2.5 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 cursor-pointer ${
                      pickerGroupByDate
                        ? 'bg-[#F0C800]/15 border-[#F0C800]/50 text-[#F0C800]'
                        : 'bg-[#0F1115] border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Agrupar por Fecha
                  </button>

                  {(pickerEquipmentFilter !== 'ALL' || pickerSearch || pickerDateFrom || pickerDateTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPickerEquipmentFilter('ALL');
                        setPickerSearch('');
                        setPickerDateFrom('');
                        setPickerDateTo('');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Ver todas las cargas
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                  Mostrando <b className="text-white">{pickerFilteredVouchers.length}</b> cargas de combustible
                </div>
              </div>
            </div>

            {/* Table Body (Expendio-style grouped by Date) */}
            <div className="flex-1 overflow-y-auto bg-[#0F1115]">
              {pickerFilteredVouchers.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500 space-y-2">
                  <Fuel className="w-8 h-8 text-slate-600 mx-auto" />
                  <div>No se encontraron cargas de combustible con esos filtros.</div>
                  {pickerEquipmentFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setPickerEquipmentFilter('ALL')}
                      className="text-[#F0C800] hover:underline font-semibold cursor-pointer"
                    >
                      Mostrar cargas de todos los equipos
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {pickerGroupedByDate.map(([dateKey, dayVouchers]) => {
                    const dayTotalLiters = dayVouchers.reduce(
                      (s, v) => s + Math.abs(Number(v.cantCarga ?? v.cantidad ?? 0)),
                      0
                    );
                    return (
                      <div key={dateKey}>
                        {pickerGroupByDate && dateKey !== 'TODAS' && (
                          <div className="sticky top-0 z-10 bg-[#181C24] border-b border-slate-800 px-4 py-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-[#F0C800]">
                              <Calendar className="w-3.5 h-3.5" />
                              <span>{formatDisplayDate(dateKey)}</span>
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-300">
                              {dayVouchers.length} {dayVouchers.length === 1 ? 'carga' : 'cargas'} ·{' '}
                              <b className="text-white">
                                {dayTotalLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L
                              </b>
                            </div>
                          </div>
                        )}

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-[#12151B] text-slate-400 text-[11px] font-semibold border-b border-slate-800/80">
                                <th className="py-2 px-3 w-8"></th>
                                <th className="py-2 px-3">Fecha / Hora</th>
                                <th className="py-2 px-3">Equipo / Patente</th>
                                <th className="py-2 px-3">Chofer / Operario</th>
                                <th className="py-2 px-3">Depósito / Estación</th>
                                <th className="py-2 px-3">Combustible &amp; Nº Orden</th>
                                <th className="py-2 px-3 text-right">Litros</th>
                                <th className="py-2 px-3 text-right">Odómetro</th>
                                <th className="py-2 px-3 text-right">Rendimientos</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {dayVouchers.map(v => {
                                const resolvedVeh = resolveVoucherVehicle(v, fleet);
                                const driverName = resolveVoucherDriver(v, employees);
                                const liters = Math.abs(Number(v.cantCarga ?? v.cantidad ?? 0));
                                const orderRef = v.numOrden || v.numVale || v.numTicket || v.id.slice(0, 8);
                                const isPicked = pickerSelectedVoucherId === v.id;
                                const linkedStats = linkedTripsByVoucherId.get(v.id);

                                return (
                                  <tr
                                    key={v.id}
                                    onClick={() => setPickerSelectedVoucherId(v.id)}
                                    onDoubleClick={() => {
                                      setPickerSelectedVoucherId(v.id);
                                      void handleConfirmFuelPicker(v.id);
                                    }}
                                    className={`cursor-pointer transition-colors ${
                                      isPicked
                                        ? 'bg-[#F0C800]/15'
                                        : 'hover:bg-slate-800/50'
                                    }`}
                                  >
                                    <td className="py-2.5 px-3 text-center">
                                      <span
                                        className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${
                                          isPicked
                                            ? 'border-[#F0C800] bg-[#F0C800] text-slate-950'
                                            : 'border-slate-600 bg-transparent'
                                        }`}
                                      >
                                        {isPicked && <Check className="w-3 h-3 stroke-[3]" />}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                                      <div className="text-slate-100 font-semibold">
                                        {formatTableCellDate(v.fecha)}
                                      </div>
                                      {v.hora && (
                                        <div className="text-[10px] text-slate-400">{v.hora}</div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 min-w-[180px]">
                                      <div className="font-bold text-amber-300 truncate max-w-[230px]" title={resolvedVeh.displayName}>
                                        {resolvedVeh.displayName}
                                      </div>
                                      {(resolvedVeh.patente || resolvedVeh.codigoInterno) && (
                                        <div className="text-[10px] font-mono text-slate-400">
                                          {[resolvedVeh.patente, resolvedVeh.codigoInterno].filter(Boolean).join(' · ')}
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-200 font-medium truncate max-w-[160px]" title={driverName}>
                                      {driverName}
                                    </td>
                                    <td className="py-2.5 px-3 min-w-[150px]">
                                      <div className="text-slate-200 truncate max-w-[200px]" title={v.deposito}>
                                        {v.deposito || '-'}
                                      </div>
                                      {v.obraNombre && (
                                        <div className="text-[10px] text-emerald-400 truncate max-w-[200px]">
                                          Obra: {v.obraNombre}
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <div className="text-slate-200">{v.tipoComb || 'Combustible'}</div>
                                      <div className="text-[10px] font-mono text-slate-400">#{orderRef}</div>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#F0C800] whitespace-nowrap">
                                      {liters.toLocaleString('es-AR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}{' '}
                                      L
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                      {v.kilometraje && Number(v.kilometraje) > 0
                                        ? `${Number(v.kilometraje).toLocaleString('es-AR')} km`
                                        : '—'}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                      {linkedStats ? (
                                        <span className="text-[11px] text-emerald-400 font-semibold">
                                          {linkedStats.count} {linkedStats.count === 1 ? 'viaje' : 'viajes'} ·{' '}
                                          {linkedStats.kms.toLocaleString('es-AR', { maximumFractionDigits: 0 })} km
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-slate-500">Sin viajes</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-[#0F1115] px-5 py-3.5 border-t border-slate-800 space-y-2.5 shrink-0">
              {groupError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                  {groupError}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-300 min-w-0 truncate">
                  {pickerSelectedVoucherObj ? (
                    (() => {
                      const r = resolveVoucherVehicle(pickerSelectedVoucherObj, fleet);
                      const lit = Math.abs(
                        Number(pickerSelectedVoucherObj.cantCarga ?? pickerSelectedVoucherObj.cantidad ?? 0)
                      );
                      return (
                        <span>
                          Seleccionada:{' '}
                          <b className="text-[#F0C800]">
                            {formatTableCellDate(pickerSelectedVoucherObj.fecha)} · {r.displayName}
                            {r.patente ? ` (${r.patente})` : ''} · {lit.toLocaleString('es-AR', { maximumFractionDigits: 2 })} L
                          </b>
                        </span>
                      );
                    })()
                  ) : (
                    <span className="text-slate-500">Hacé clic en una fila de la tabla para seleccionarla.</span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFuelPickerMode(null)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmFuelPicker()}
                    disabled={isSavingGroup || !pickerSelectedVoucherId}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-[#F0C800] hover:bg-amber-400 text-slate-950 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingGroup
                      ? 'Agrupando...'
                      : fuelPickerMode === 'group'
                        ? 'Confirmar Agrupación'
                        : 'Usar esta Carga'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ELIMINACIÓN DE VIAJE */}
      {tripToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white">¿Eliminar registro de viaje?</h3>
            <p className="text-xs text-slate-400">
              Se eliminará permanentemente de Supabase el viaje de <b>{tripToDelete.codigoEquipo}</b> ({tripToDelete.lugarInicio} → {tripToDelete.lugarFinal}, {tripToDelete.kilometros} km).
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTripToDelete(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
