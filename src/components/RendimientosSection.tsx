import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
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
  DollarSign,
  Download,
  Edit3,
  FileText,
  Fuel,
  Gauge,
  Layers,
  Link2,
  MapPin,
  Package,
  Plus,
  Printer,
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

function resolveVoucherCost(voucher: FuelDispensary | undefined, liters?: number): number {
  if (!voucher) return 0;
  const effLiters = liters !== undefined ? liters : Math.abs(Number(voucher.cantCarga ?? voucher.cantidad ?? 0));
  const raw = Number(voucher.totalImporte || (voucher.precioUnitario ? voucher.precioUnitario * effLiters : 0));
  return Number.isFinite(raw) ? Math.abs(raw) : 0;
}

function formatMoney(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-AR')}`;
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
  markedUnlink?: boolean;
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

  // Batch / Single / Group Edit Trip Modal
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TruckPerformanceTrip | null>(null);
  const [editingGroupContext, setEditingGroupContext] = useState<{
    groupKey: string;
    title: string;
    originalTripsById: Map<string, TruckPerformanceTrip>;
  } | null>(null);
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

  // Print Preview & PDF Export Modal
  const [printScope, setPrintScope] = useState<null | { type: 'group'; groupKey: string } | { type: 'all' }>(null);

  useEffect(() => {
    if (printScope) {
      document.body.classList.add('printing-rendimientos');
    } else {
      document.body.classList.remove('printing-rendimientos');
    }
    return () => {
      document.body.classList.remove('printing-rendimientos');
    };
  }, [printScope]);

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
    let totalLinkedCost = 0;
    uniqueVoucherIds.forEach(vid => {
      const voucher = fuelVouchersById.get(vid);
      if (voucher) {
        const lit = Math.abs(Number(voucher.cantCarga ?? voucher.cantidad ?? 0));
        totalLinkedLiters += lit;
        totalLinkedCost += resolveVoucherCost(voucher, lit);
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
    const avgCostPerKm = kmsInLinkedTrips > 0 && totalLinkedCost > 0
      ? totalLinkedCost / kmsInLinkedTrips
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
      totalLinkedCost,
      avgKmPerLiter,
      avgLitersPer100,
      avgCostPerKm,
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
          totalCost,
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
    setEditingGroupContext(null);
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

  // Open Edit Modal for existing single trip
  const handleOpenEditModal = (trip: TruckPerformanceTrip) => {
    setEditingTrip(trip);
    setEditingGroupContext(null);
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

  // Open Batch Edit Modal for an entire Fuel Group (edit all trips, reassign fuel load/truck, add/unlink trips)
  const handleOpenEditGroupModal = (grp: (typeof fuelGroups)[number]) => {
    setEditingTrip(null);
    setModalError(null);
    setFuelVoucherSearch('');

    const firstTrip = grp.trips[0];
    const matchedVeh =
      (grp.voucher && allActiveVehicles.find(v => vehicleMatchesVoucher(v, grp.voucher!))) ||
      (firstTrip && allActiveVehicles.find(v => v.id === firstTrip.vehiculoId || v.modeloMarca === firstTrip.codigoEquipo));

    if (matchedVeh && !truckVehicles.some(tv => tv.id === matchedVeh.id)) {
      setShowAllFleetInModal(true);
    } else {
      setShowAllFleetInModal(false);
    }

    setSelectedVehicleId(matchedVeh?.id || '');
    setSelectedFuelVoucherId(grp.fuelVoucherId || '');

    const origMap = new Map<string, TruckPerformanceTrip>();
    grp.trips.forEach(t => origMap.set(t.id, t));
    setEditingGroupContext({
      groupKey: grp.groupKey,
      title: grp.groupKey === 'UNLINKED' ? 'Viajes Pendientes de Agrupar' : `${grp.codigoEquipo} · ${grp.label}`,
      originalTripsById: origMap,
    });

    setDraftRows(
      grp.trips.map(t => ({
        localKey: t.id,
        id: t.id,
        fecha: t.fecha || new Date().toISOString().slice(0, 10),
        choferId: t.choferId || '',
        choferNombre: t.choferNombre || '',
        lugarInicio: t.lugarInicio || '',
        lugarFinal: t.lugarFinal || '',
        horaSalida: t.horaSalida || '',
        horaLlegada: t.horaLlegada || '',
        kilometros: String(t.kilometros ?? ''),
        odometroInicio: t.odometroInicio !== undefined ? String(t.odometroInicio) : '',
        odometroFin: t.odometroFin !== undefined ? String(t.odometroFin) : '',
        showOdometerHelper: false,
        tipoCarga: t.tipoCarga || 'Áridos / Ripio',
        detalleCarga: t.detalleCarga || '',
        observaciones: t.observaciones || '',
        markedUnlink: false,
      }))
    );
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
    const activeRows = draftRows.filter(r => !r.markedUnlink);
    const validKms = activeRows.reduce((s, r) => s + (Number(r.kilometros) > 0 ? Number(r.kilometros) : 0), 0);
    const mins = activeRows.reduce((s, r) => {
      const d = computeDurationMinutes(r.horaSalida, r.horaLlegada);
      return s + (d !== null ? d : 0);
    }, 0);
    const timedRows = activeRows.filter(r => computeDurationMinutes(r.horaSalida, r.horaLlegada) !== null).length;
    const liters = selectedFuelVoucherObj
      ? Math.abs(Number(selectedFuelVoucherObj.cantCarga ?? selectedFuelVoucherObj.cantidad ?? 0))
      : 0;
    const totalCost = resolveVoucherCost(selectedFuelVoucherObj, liters);
    const autonomy = liters > 0 && validKms > 0 ? validKms / liters : null;
    return { activeCount: activeRows.length, validKms, mins, timedRows, liters, totalCost, autonomy };
  }, [draftRows, selectedFuelVoucherObj]);

  const handleSaveBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!modalSelectedVehicle && !editingTrip && !editingGroupContext) {
      setModalError('Seleccioná el camión para registrar los viajes.');
      return;
    }

    for (let i = 0; i < draftRows.length; i++) {
      const r = draftRows[i];
      if (r.markedUnlink) continue;
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
      const origTrip = r.id
        ? editingTrip || editingGroupContext?.originalTripsById.get(r.id)
        : undefined;
      const dur = computeDurationMinutes(r.horaSalida, r.horaLlegada);
      const matchedObra = obras.find(
        o =>
          o.nombreObra.toLowerCase() === r.lugarFinal.trim().toLowerCase() ||
          o.nombreObra.toLowerCase() === r.lugarInicio.trim().toLowerCase()
      );
      const unlinkThis = Boolean(r.markedUnlink);
      return {
        id: r.id || `REND-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        categoriaEquipo: 'CAMIONES',
        fecha: r.fecha || new Date().toISOString().slice(0, 10),
        vehiculoId: modalSelectedVehicle?.id || origTrip?.vehiculoId,
        codigoEquipo: modalSelectedVehicle?.modeloMarca || origTrip?.codigoEquipo || '',
        marcaModelo: modalSelectedVehicle?.modeloMarca || origTrip?.marcaModelo,
        patente: modalSelectedVehicle?.patente || origTrip?.patente || '',
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
        fuelVoucherId: !unlinkThis && fuelVoucher ? fuelVoucher.id : undefined,
        fuelVoucherLabel: !unlinkThis && fuelVoucher ? formatFuelVoucherLabel(fuelVoucher, fleet) : undefined,
        fuelLitersSnapshot: !unlinkThis ? fuelLiters : undefined,
        fuelFechaSnapshot: !unlinkThis ? fuelVoucher?.fecha : undefined,
        createdAt: origTrip?.createdAt || nowIso,
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
      setEditingGroupContext(null);
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
      'Costo Combustible ($)',
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
        cons && cons.cost !== null ? cons.cost.toFixed(0) : '',
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

  const printReportData = useMemo(() => {
    if (!printScope) return null;
    const groups =
      printScope.type === 'group'
        ? fuelGroups.filter(g => g.groupKey === printScope.groupKey)
        : fuelGroups;
    const tripsList = groups.flatMap(g => g.trips);
    const totalTripsCount = tripsList.length;
    const totalKms = groups.reduce((s, g) => s + g.totalKms, 0);
    const totalLiters = groups.reduce((s, g) => s + (g.fuelVoucherId ? g.liters : 0), 0);
    const totalMoney = groups.reduce((s, g) => s + (g.fuelVoucherId ? g.totalImporte : 0), 0);
    const totalMins = groups.reduce((s, g) => s + g.totalMinutes, 0);
    const timedCount = groups.reduce((s, g) => s + g.timedCount, 0);
    const linkedKms = groups.reduce((s, g) => s + (g.fuelVoucherId ? g.totalKms : 0), 0);
    const autonomyKmL = totalLiters > 0 && linkedKms > 0 ? linkedKms / totalLiters : null;
    const litersPer100 = totalLiters > 0 && linkedKms > 0 ? (totalLiters / linkedKms) * 100 : null;
    const costPerKm = totalMoney > 0 && linkedKms > 0 ? totalMoney / linkedKms : null;

    const singleGroup = printScope.type === 'group' ? groups[0] : undefined;
    const title = singleGroup
      ? singleGroup.groupKey === 'UNLINKED'
        ? 'REPORTE DE VIAJES PENDIENTES DE AGRUPAR'
        : `REPORTE DE RENDIMIENTO · ${singleGroup.codigoEquipo}`
      : 'REPORTE GENERAL DE RENDIMIENTOS DE CAMIONES';

    const subtitle = singleGroup
      ? singleGroup.label
      : `${groups.length} grupo(s) · ${
          truckFilter !== 'ALL' ? `Camión: ${truckFilter}` : 'Toda la flota'
        }${dateFrom || dateTo ? ` · Período: ${dateFrom || '...'} al ${dateTo || '...'}` : ''}`;

    return {
      title,
      subtitle,
      singleGroup,
      groups,
      totalTripsCount,
      totalKms,
      totalLiters,
      totalMoney,
      totalMins,
      timedCount,
      autonomyKmL,
      litersPer100,
      costPerKm,
    };
  }, [printScope, fuelGroups, truckFilter, dateFrom, dateTo]);

  const handleDownloadPdfReport = () => {
    if (!printReportData) return;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const contentW = pageW - margin * 2;
    let y = 12;

    const drawHeader = () => {
      pdf.setFillColor(22, 25, 31);
      pdf.rect(margin, y, contentW, 18, 'F');
      pdf.setFillColor(240, 200, 0);
      pdf.rect(margin, y, 3, 18, 'F');

      pdf.setTextColor(240, 200, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('LA HORMIGA · CONTROL OPERATIVO DE FLOTA', margin + 6, y + 6.5);

      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(printReportData.title, margin + 6, y + 12.2);

      pdf.setTextColor(180, 190, 205);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(printReportData.subtitle.slice(0, 125), margin + 6, y + 16.2);

      pdf.setTextColor(210, 215, 225);
      pdf.text(`Emisión: ${new Date().toLocaleDateString('es-AR')}`, pageW - margin - 4, y + 7, { align: 'right' });
      y += 22;
    };

    drawHeader();

    // 6-box KPI bar
    const kpiBoxes = [
      { label: 'VIAJES', value: String(printReportData.totalTripsCount) },
      { label: 'KMS TOTALES', value: `${printReportData.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km` },
      { label: 'COMBUSTIBLE', value: printReportData.totalLiters > 0 ? `${printReportData.totalLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L` : '—' },
      { label: 'TOTAL EN PLATA', value: printReportData.totalMoney > 0 ? formatMoney(printReportData.totalMoney) : '—' },
      { label: 'AUTONOMÍA', value: printReportData.autonomyKmL ? `${printReportData.autonomyKmL.toFixed(2)} km/L` : '—' },
      { label: 'COSTO / KM', value: printReportData.costPerKm ? `$${printReportData.costPerKm.toFixed(0)}/km` : formatDurationMinutes(printReportData.totalMins) },
    ];
    const boxW = (contentW - 10) / kpiBoxes.length;
    kpiBoxes.forEach((box, i) => {
      const bx = margin + i * (boxW + 2);
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(203, 213, 225);
      pdf.rect(bx, y, boxW, 13, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(box.label, bx + 2.5, y + 4.5);
      pdf.setFontSize(9.5);
      pdf.setTextColor(15, 23, 42);
      pdf.text(box.value, bx + 2.5, y + 10.2);
    });
    y += 17;

    const colWidths = [22, 46, 68, 32, 28, 22, 22, 33]; // sum = 273mm (297 - 24 = 273)
    const headers = ['Fecha', 'Camión / Chofer', 'Recorrido (Inicio -> Final)', 'Carga', 'Horario / Demora', 'Kms', 'Comb. (L)', 'Importe ($)'];

    const drawTableHeader = () => {
      pdf.setFillColor(30, 41, 59);
      pdf.rect(margin, y, contentW, 7.5, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      let cx = margin + 2;
      headers.forEach((h, i) => {
        if (i >= 5) {
          pdf.text(h, cx + colWidths[i] - 4, y + 5, { align: 'right' });
        } else {
          pdf.text(h, cx, y + 5);
        }
        cx += colWidths[i];
      });
      y += 7.5;
    };

    printReportData.groups.forEach((grp, gIdx) => {
      if (y > pageH - 35) {
        pdf.addPage();
        y = 12;
        drawHeader();
      }

      if (printReportData.groups.length > 1 || gIdx === 0) {
        pdf.setFillColor(254, 249, 217);
        pdf.setDrawColor(221, 168, 0);
        pdf.rect(margin, y, contentW, 7, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(15, 23, 42);
        const grpTitle = grp.groupKey === 'UNLINKED'
          ? 'Viajes Pendientes de Agrupar'
          : `${grp.codigoEquipo}${grp.patente ? ` (${grp.patente})` : ''} · ${grp.label}`;
        pdf.text(grpTitle.slice(0, 95), margin + 2.5, y + 4.8);

        const grpRight = `${grp.trips.length} viajes · ${grp.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km${
          grp.liters > 0 ? ` · ${grp.liters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L` : ''
        }${grp.totalImporte > 0 ? ` · ${formatMoney(grp.totalImporte)}` : ''}`;
        pdf.text(grpRight, pageW - margin - 2.5, y + 4.8, { align: 'right' });
        y += 7.5;
      }

      drawTableHeader();

      grp.trips.forEach((t, idx) => {
        if (y > pageH - 22) {
          pdf.addPage();
          y = 12;
          drawHeader();
          drawTableHeader();
        }
        if (idx % 2 === 1) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(margin, y, contentW, 7, 'F');
        }
        const dur = typeof t.duracionMinutos === 'number'
          ? t.duracionMinutos
          : computeDurationMinutes(t.horaSalida, t.horaLlegada);
        const cons = tripFuelConsumptionMap.get(t.id);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.2);
        pdf.setTextColor(15, 23, 42);

        const rowCells = [
          formatTableCellDate(t.fecha),
          `${t.codigoEquipo} / ${t.choferNombre || '-'}`.slice(0, 29),
          `${t.lugarInicio} -> ${t.lugarFinal}`.slice(0, 44),
          (t.tipoCarga || '-').slice(0, 20),
          t.horaSalida || t.horaLlegada
            ? `${t.horaSalida || '--'}->${t.horaLlegada || '--'}${dur !== null ? ` (${formatDurationMinutes(dur)})` : ''}`
            : 'Sin hora',
          `${Number(t.kilometros || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`,
          cons ? `${cons.liters.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L` : '—',
          cons && cons.cost !== null ? formatMoney(cons.cost) : '—',
        ];

        let cx = margin + 2;
        rowCells.forEach((txt, i) => {
          if (i >= 5) {
            if (i === 7 && cons && cons.cost !== null) pdf.setFont('helvetica', 'bold');
            pdf.text(txt, cx + colWidths[i] - 4, y + 4.8, { align: 'right' });
            pdf.setFont('helvetica', 'normal');
          } else {
            pdf.text(txt, cx, y + 4.8);
          }
          cx += colWidths[i];
        });
        pdf.setDrawColor(226, 232, 240);
        pdf.line(margin, y + 7, pageW - margin, y + 7);
        y += 7;
      });

      // Group subtotal row
      pdf.setFillColor(241, 245, 249);
      pdf.rect(margin, y, contentW, 7.5, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.8);
      pdf.setTextColor(15, 23, 42);
      pdf.text(`TOTAL GRUPO (${grp.trips.length} viajes)`, margin + 2.5, y + 5.1);

      let cx = margin + 2;
      colWidths.slice(0, 5).forEach(w => { cx += w; });
      pdf.text(`${grp.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`, cx + colWidths[5] - 4, y + 5.1, { align: 'right' });
      cx += colWidths[5];
      pdf.text(grp.liters > 0 ? `${grp.liters.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L` : '—', cx + colWidths[6] - 4, y + 5.1, { align: 'right' });
      cx += colWidths[6];
      pdf.text(grp.totalImporte > 0 ? formatMoney(grp.totalImporte) : '—', cx + colWidths[7] - 4, y + 5.1, { align: 'right' });
      y += 10.5;
    });

    const pageCount = pdf.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      pdf.setPage(p);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(100, 116, 139);
      pdf.text(
        `La Hormiga Gestión Operativa · Rendimientos de Flota · Página ${p} de ${pageCount}`,
        pageW / 2,
        pageH - 6,
        { align: 'center' }
      );
    }

    const fileSlug = printReportData.singleGroup?.voucher?.numOrden
      ? `orden_${printReportData.singleGroup.voucher.numOrden}`
      : new Date().toISOString().slice(0, 10);
    pdf.save(`rendimientos_camiones_${fileSlug}.pdf`);
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
                onClick={() => setPrintScope({ type: 'all' })}
                disabled={filteredTrips.length === 0}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#0F1115] hover:bg-slate-800 text-slate-200 border border-slate-800 transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Printer className="w-3.5 h-3.5 text-[#F0C800]" />
                Imprimir / PDF
              </button>
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
          {/* 5-Column KPI Strip (including Inversión en Plata) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Viajes Registrados</span>
                <Route className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-2xl font-bold text-white font-mono tabular-nums">
                {kpis.totalTrips.toLocaleString('es-AR')}
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                {kpis.linkedLoadsCount} cargas vinculadas
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
                  ? `${(kpis.totalKms / kpis.totalTrips).toFixed(1)} km prom. / viaje`
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
                  : 'Agrupá viajes con una carga'}
              </div>
            </div>

            <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Total en Combustible ($)</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-white font-mono tabular-nums">
                {kpis.totalLinkedCost > 0 ? formatMoney(kpis.totalLinkedCost) : '—'}
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                {kpis.avgCostPerKm > 0
                  ? `${formatMoney(kpis.avgCostPerKm)} / km promedio`
                  : 'Según importe de las cargas'}
              </div>
            </div>

            <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Demora Promedio</span>
                <Clock className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
                {formatDurationMinutes(kpis.avgMinutes)}
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                {kpis.timedCount > 0
                  ? `${kpis.timedCount} con hora · Total ${formatDurationMinutes(kpis.totalMinutes)}`
                  : 'Opcional: cargá salida/llegada'}
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
                                <div className="text-[10px] text-slate-400 font-sans">Total Carga ($)</div>
                                <div className="font-bold text-emerald-400">
                                  {grp.totalImporte > 0 ? formatMoney(grp.totalImporte) : '—'}
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
                              {grp.costPerKm !== null && (
                                <div>
                                  <div className="text-[10px] text-slate-400 font-sans">Costo / km</div>
                                  <div className="font-bold text-slate-200">
                                    ${grp.costPerKm.toFixed(0)}/km
                                  </div>
                                </div>
                              )}
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

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPrintScope({ type: 'group', groupKey: grp.groupKey })}
                            className="px-2.5 py-1.5 rounded-lg bg-[#0F1115] hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                            title="Vista previa e impresión de este grupo"
                          >
                            <Printer className="w-3.5 h-3.5 text-[#F0C800]" />
                            Imprimir
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditGroupModal(grp)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#0F1115] hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                            title="Editar todos los viajes de este grupo o reasignar la carga"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                            Editar Grupo
                          </button>
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
                          {!isUnlinked && grp.liters > 0 && (() => {
                            const grpConsumedLiters = grp.trips.reduce(
                              (sum, tr) => sum + (tripFuelConsumptionMap.get(tr.id)?.liters || 0),
                              0
                            );
                            const grpConsumedCost = grp.trips.reduce(
                              (sum, tr) => sum + (tripFuelConsumptionMap.get(tr.id)?.cost || 0),
                              0
                            );
                            const displayCost = grpConsumedCost > 0 ? grpConsumedCost : grp.totalImporte;
                            return (
                              <tfoot>
                                <tr className="bg-[#0F1115]/90 border-t border-slate-800 text-xs font-mono tabular-nums">
                                  <td colSpan={5} className="py-2.5 px-4 font-sans text-slate-300 font-semibold">
                                    Total consumido en {grp.trips.length} {grp.trips.length === 1 ? 'viaje' : 'viajes'} de la carga
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-white whitespace-nowrap">
                                    {grp.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                                  </td>
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                    <div className="font-bold text-[#F0C800]">
                                      {grpConsumedLiters.toLocaleString('es-AR', {
                                        minimumFractionDigits: 1,
                                        maximumFractionDigits: 1,
                                      })}{' '}
                                      L
                                    </div>
                                    {displayCost > 0 && (
                                      <div className="text-xs font-bold text-emerald-400">
                                        {formatMoney(displayCost)}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4"></td>
                                </tr>
                              </tfoot>
                            );
                          })()}
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
                  {filteredTrips.length > 0 && (() => {
                    const totalFilteredKms = filteredTrips.reduce(
                      (s, tr) => s + Number(tr.kilometros || 0),
                      0
                    );
                    const totalFilteredLiters = filteredTrips.reduce(
                      (s, tr) => s + (tripFuelConsumptionMap.get(tr.id)?.liters || 0),
                      0
                    );
                    const totalFilteredCost = filteredTrips.reduce(
                      (s, tr) => s + (tripFuelConsumptionMap.get(tr.id)?.cost || 0),
                      0
                    );
                    return (
                      <tfoot>
                        <tr className="bg-[#0F1115] border-t border-slate-700 text-xs font-mono tabular-nums">
                          <td colSpan={6} className="py-3 px-4 font-sans text-slate-200 font-bold">
                            Total del listado ({filteredTrips.length}{' '}
                            {filteredTrips.length === 1 ? 'viaje' : 'viajes'})
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-white whitespace-nowrap">
                            {totalFilteredKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            {totalFilteredLiters > 0 ? (
                              <div>
                                <div className="font-bold text-[#F0C800]">
                                  {totalFilteredLiters.toLocaleString('es-AR', {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  })}{' '}
                                  L
                                </div>
                                {totalFilteredCost > 0 && (
                                  <div className="text-xs font-bold text-emerald-400">
                                    {formatMoney(totalFilteredCost)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td colSpan={2} className="py-3 px-4 text-right font-sans text-[11px] text-slate-400">
                            {totalFilteredCost > 0 && totalFilteredKms > 0
                              ? `Promedio: $${(totalFilteredCost / totalFilteredKms).toFixed(0)}/km`
                              : ''}
                          </td>
                        </tr>
                      </tfoot>
                    );
                  })()}
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
                      <th className="py-3 px-3 text-right">Inversión Comb. ($)</th>
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
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-400">
                          {s.totalCost > 0 ? formatMoney(s.totalCost) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                          {s.costPerKm !== null ? `$${s.costPerKm.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {truckSummaries.length > 0 && (
                    <tfoot>
                      <tr className="bg-[#0F1115] border-t border-slate-700 text-xs font-mono tabular-nums">
                        <td className="py-3 px-4 font-sans font-bold text-slate-200">
                          Total Flota ({truckSummaries.length}{' '}
                          {truckSummaries.length === 1 ? 'camión' : 'camiones'})
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-white">
                          {kpis.totalTrips}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-white">
                          {kpis.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-300">
                          {kpis.linkedLoadsCount}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-200">
                          {kpis.totalLinkedLiters > 0
                            ? `${kpis.totalLinkedLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L`
                            : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-[#F0C800]">
                          {kpis.avgKmPerLiter > 0 ? `${kpis.avgKmPerLiter.toFixed(2)} km/L` : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-200">
                          {kpis.avgLitersPer100 > 0 ? `${kpis.avgLitersPer100.toFixed(1)} L` : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-400">
                          {formatDurationMinutes(kpis.avgMinutes)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-400">
                          {kpis.totalLinkedCost > 0 ? formatMoney(kpis.totalLinkedCost) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-200">
                          {kpis.avgCostPerKm > 0 ? `$${kpis.avgCostPerKm.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  )}
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
                      : editingGroupContext
                        ? `Editar Grupo de Viajes (${draftRows.length})`
                        : 'Cargar Viajes de Camión y Agrupar en Carga de Combustible'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingGroupContext
                      ? `Editando grupo: ${editingGroupContext.title}. Podés editar todos los viajes juntos, cambiar la carga o camión, sumar viajes nuevos o desvincular filas.`
                      : 'Podés cargar 1 o varios viajes juntos y vincularlos con una carga del módulo Combustible (la hora es opcional).'}
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
                    3. Detalle de Viajes ({batchPreviewStats.activeCount}
                    {draftRows.some(r => r.markedUnlink) ? ' activos' : ''}) — Horas de salida y llegada son opcionales
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
                    const isUnlinkedRow = Boolean(row.markedUnlink);
                    return (
                      <div
                        key={row.localKey}
                        className={`bg-[#0F1115] border rounded-xl p-4 space-y-3 transition-opacity ${
                          isUnlinkedRow
                            ? 'border-amber-500/40 opacity-55'
                            : 'border-slate-800'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-white">
                            <span>Viaje #{idx + 1}</span>
                            {isUnlinkedRow ? (
                              <span className="text-[11px] font-semibold text-amber-300">
                                · Se desvinculará de esta carga al guardar
                              </span>
                            ) : (
                              rowDur !== null && (
                                <span className="text-[11px] font-mono font-normal text-emerald-400">
                                  · Duración: {formatDurationMinutes(rowDur)}
                                  {rowSpeed !== null ? ` (${rowSpeed.toFixed(1)} km/h)` : ''}
                                </span>
                              )
                            )}
                          </div>
                          {!editingTrip && (
                            <div className="flex items-center gap-1.5">
                              {!isUnlinkedRow && (
                                <button
                                  type="button"
                                  onClick={() => handleAddDraftRow(row, true)}
                                  className="px-2 py-1 rounded text-[11px] text-amber-300 hover:bg-slate-800 cursor-pointer"
                                  title="Generar viaje de vuelta invirtiendo inicio y final"
                                >
                                  + Vuelta
                                </button>
                              )}
                              {editingGroupContext && row.id ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateDraftRow(row.localKey, { markedUnlink: !isUnlinkedRow })
                                  }
                                  className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                                    isUnlinkedRow
                                      ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                                      : 'text-amber-300 hover:bg-slate-800'
                                  }`}
                                  title={
                                    isUnlinkedRow
                                      ? 'Mantener este viaje dentro del grupo'
                                      : 'Desvincular este viaje de la carga al guardar'
                                  }
                                >
                                  {isUnlinkedRow ? (
                                    <>
                                      <Link2 className="w-3 h-3" />
                                      Restaurar al grupo
                                    </>
                                  ) : (
                                    <>
                                      <Unlink className="w-3 h-3" />
                                      Desvincular
                                    </>
                                  )}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDraftRow(row.localKey)}
                                  disabled={draftRows.length <= 1}
                                  className="p-1 text-red-400 hover:bg-red-500/10 rounded disabled:opacity-30 cursor-pointer"
                                  title="Quitar viaje"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="md:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Fecha *</label>
                            <input
                              type="date"
                              required={!isUnlinkedRow}
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
                              required={!isUnlinkedRow}
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
                              required={!isUnlinkedRow}
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
                              required={!isUnlinkedRow}
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
                    <span className="text-slate-400 font-sans">Viajes en grupo:</span>{' '}
                    <b className="text-white">{batchPreviewStats.activeCount}</b>
                  </span>
                  <span>
                    <span className="text-slate-400 font-sans">Kms lote:</span>{' '}
                    <b className="text-white">{batchPreviewStats.validKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km</b>
                  </span>
                  {batchPreviewStats.liters > 0 && (
                    <span>
                      <span className="text-slate-400 font-sans">Carga:</span>{' '}
                      <b className="text-slate-200">{batchPreviewStats.liters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L</b>
                    </span>
                  )}
                  {batchPreviewStats.totalCost > 0 && (
                    <span>
                      <span className="text-slate-400 font-sans">Total ($):</span>{' '}
                      <b className="text-emerald-400">{formatMoney(batchPreviewStats.totalCost)}</b>
                    </span>
                  )}
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
                      : editingGroupContext
                        ? `Guardar Grupo (${batchPreviewStats.activeCount} ${batchPreviewStats.activeCount === 1 ? 'viaje' : 'viajes'})`
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

      {/* PORTAL: VISTA PREVIA DE IMPRESIÓN / PDF A4 */}
      {printScope &&
        printReportData &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id="rendimientos-print-root"
            className="fixed inset-0 z-[80] bg-slate-950/90 backdrop-blur-sm overflow-y-auto p-3 sm:p-6"
          >
            {/* Floating Action Toolbar (hidden when printing) */}
            <div className="no-print max-w-[1060px] mx-auto mb-4 bg-[#16191F] border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xl">
              <div className="flex items-center gap-2.5 min-w-0">
                <Printer className="w-4 h-4 text-[#F0C800] shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    Vista Previa de Impresión / PDF — {printReportData.title}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    Formato ejecutivo A4 listo para imprimir o descargar en PDF con totales en km, litros y plata ($).
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadPdfReport}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#F0C800] hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Descargar PDF (A4)
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => setPrintScope(null)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Cerrar
                </button>
              </div>
            </div>

            {/* White A4 Paper Sheet */}
            <div
              id="rendimientos-print-sheet"
              className="max-w-[1060px] mx-auto bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 p-6 sm:p-8 space-y-6"
            >
              {/* Branded Report Header */}
              <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-5 bg-[#F0C800]" />
                    <span className="text-[11px] font-bold tracking-wider uppercase text-slate-600">
                      La Hormiga · Control Operativo de Flota
                    </span>
                  </div>
                  <h1 className="text-xl font-bold text-slate-950 tracking-tight">
                    {printReportData.title}
                  </h1>
                  <p className="text-xs text-slate-600 font-medium">
                    {printReportData.subtitle}
                  </p>
                </div>

                <div className="text-left sm:text-right text-[11px] text-slate-600 font-mono tabular-nums space-y-0.5 shrink-0">
                  <div>
                    Emisión: <b className="text-slate-900">{new Date().toLocaleDateString('es-AR')}</b>
                  </div>
                  <div>
                    Grupos incluidos: <b className="text-slate-900">{printReportData.groups.length}</b> · Viajes:{' '}
                    <b className="text-slate-900">{printReportData.totalTripsCount}</b>
                  </div>
                </div>
              </div>

              {/* 6-Card Executive KPI Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Viajes</div>
                  <div className="text-lg font-bold text-slate-950 font-mono tabular-nums mt-0.5">
                    {printReportData.totalTripsCount}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kms Totales</div>
                  <div className="text-lg font-bold text-slate-950 font-mono tabular-nums mt-0.5">
                    {printReportData.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Combustible</div>
                  <div className="text-lg font-bold text-slate-950 font-mono tabular-nums mt-0.5">
                    {printReportData.totalLiters > 0
                      ? `${printReportData.totalLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L`
                      : '—'}
                  </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Total en Plata
                  </div>
                  <div className="text-lg font-bold text-emerald-800 font-mono tabular-nums mt-0.5">
                    {printReportData.totalMoney > 0 ? formatMoney(printReportData.totalMoney) : '—'}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Autonomía</div>
                  <div className="text-lg font-bold text-slate-950 font-mono tabular-nums mt-0.5">
                    {printReportData.autonomyKmL !== null ? `${printReportData.autonomyKmL.toFixed(2)} km/L` : '—'}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {printReportData.costPerKm !== null ? 'Costo / km' : 'Demora Total'}
                  </div>
                  <div className="text-lg font-bold text-slate-950 font-mono tabular-nums mt-0.5">
                    {printReportData.costPerKm !== null
                      ? `$${printReportData.costPerKm.toFixed(0)}/km`
                      : formatDurationMinutes(printReportData.totalMins)}
                  </div>
                </div>
              </div>

              {/* Per-Group Trip Tables */}
              <div className="space-y-5">
                {printReportData.groups.map(grp => {
                  const isUnlinked = grp.groupKey === 'UNLINKED';
                  const grpConsumedLiters = grp.trips.reduce(
                    (sum, tr) => sum + (tripFuelConsumptionMap.get(tr.id)?.liters || 0),
                    0
                  );
                  const grpConsumedCost = grp.trips.reduce(
                    (sum, tr) => sum + (tripFuelConsumptionMap.get(tr.id)?.cost || 0),
                    0
                  );
                  const displayCost = grpConsumedCost > 0 ? grpConsumedCost : grp.totalImporte;
                  return (
                    <div
                      key={grp.groupKey}
                      className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid-page"
                    >
                      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-slate-950">
                            {isUnlinked
                              ? 'Viajes Pendientes de Agrupar'
                              : `${grp.codigoEquipo}${grp.patente ? ` · ${grp.patente}` : ''}`}
                          </div>
                          <div className="text-[11px] text-slate-700 font-medium">{grp.label}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums text-slate-800">
                          <span>
                            Viajes: <b>{grp.trips.length}</b>
                          </span>
                          <span>
                            Kms: <b>{grp.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km</b>
                          </span>
                          {!isUnlinked && grp.liters > 0 && (
                            <span>
                              Comb: <b>{grp.liters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L</b>
                            </span>
                          )}
                          {!isUnlinked && displayCost > 0 && (
                            <span className="text-emerald-800 font-bold">
                              Total: {formatMoney(displayCost)}
                            </span>
                          )}
                          {grp.kmPerLiter !== null && (
                            <span>
                              Auton: <b>{grp.kmPerLiter.toFixed(2)} km/L</b>
                            </span>
                          )}
                        </div>
                      </div>

                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-slate-800 text-white font-semibold">
                            <th className="py-2 px-3">Fecha</th>
                            <th className="py-2 px-3">Camión &amp; Chofer</th>
                            <th className="py-2 px-3">Recorrido (Inicio → Final)</th>
                            <th className="py-2 px-3">Tipo de Carga</th>
                            <th className="py-2 px-3">Horario / Demora</th>
                            <th className="py-2 px-3 text-right">Kms</th>
                            <th className="py-2 px-3 text-right">Comb. (L)</th>
                            <th className="py-2 px-3 text-right">%</th>
                            <th className="py-2 px-3 text-right">Importe ($)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {grp.trips.map((t, idx) => {
                            const dur = typeof t.duracionMinutos === 'number'
                              ? t.duracionMinutos
                              : computeDurationMinutes(t.horaSalida, t.horaLlegada);
                            const cons = tripFuelConsumptionMap.get(t.id);
                            return (
                              <tr key={t.id} className={idx % 2 === 1 ? 'bg-slate-50/80' : 'bg-white'}>
                                <td className="py-2 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                  {formatTableCellDate(t.fecha)}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="font-bold text-slate-900">{t.codigoEquipo}</div>
                                  <div className="text-[10px] text-slate-600">
                                    {t.choferNombre || 'Sin chofer'}
                                    {t.patente ? ` · ${t.patente}` : ''}
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-slate-900 font-medium">
                                  {t.lugarInicio} → {t.lugarFinal}
                                  {t.observaciones && (
                                    <div className="text-[10px] text-slate-500">{t.observaciones}</div>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-slate-800">
                                  <div>{t.tipoCarga}</div>
                                  {t.detalleCarga && (
                                    <div className="text-[10px] text-slate-500">{t.detalleCarga}</div>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                  {t.horaSalida || t.horaLlegada ? (
                                    <div>
                                      {t.horaSalida || '--:--'} → {t.horaLlegada || '--:--'}
                                      {dur !== null && (
                                        <span className="block text-[10px] text-emerald-700 font-semibold">
                                          {formatDurationMinutes(dur)}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 font-sans">Sin horario</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                                  {Number(t.kilometros || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                                  {cons
                                    ? `${cons.liters.toLocaleString('es-AR', {
                                        minimumFractionDigits: 1,
                                        maximumFractionDigits: 1,
                                      })} L`
                                    : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                  {cons ? `${cons.sharePercent.toFixed(1)}%` : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-emerald-800 whitespace-nowrap">
                                  {cons && cons.cost !== null ? formatMoney(cons.cost) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 border-t border-slate-300 font-mono tabular-nums font-bold text-slate-950">
                            <td colSpan={5} className="py-2 px-3 font-sans text-slate-800">
                              Subtotal grupo ({grp.trips.length}{' '}
                              {grp.trips.length === 1 ? 'viaje' : 'viajes'})
                            </td>
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              {grp.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                            </td>
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              {!isUnlinked && grpConsumedLiters > 0
                                ? `${grpConsumedLiters.toLocaleString('es-AR', {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  })} L`
                                : '—'}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-600 whitespace-nowrap">
                              {!isUnlinked && grpConsumedLiters > 0 ? '100%' : '—'}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-800 whitespace-nowrap">
                              {!isUnlinked && displayCost > 0 ? formatMoney(displayCost) : '—'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })}
              </div>

              {/* Grand Total Bar (when multi-group report) */}
              {printReportData.groups.length > 1 && (
                <div className="bg-slate-900 text-white rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums">
                  <div className="font-sans font-bold uppercase tracking-wide text-[#F0C800]">
                    Total General del Reporte ({printReportData.totalTripsCount} viajes)
                  </div>
                  <div className="flex flex-wrap items-center gap-5">
                    <span>
                      Kms: <b>{printReportData.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km</b>
                    </span>
                    <span>
                      Litros:{' '}
                      <b>
                        {printReportData.totalLiters > 0
                          ? `${printReportData.totalLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L`
                          : '—'}
                      </b>
                    </span>
                    <span className="text-emerald-300 font-bold text-sm">
                      Total en Plata:{' '}
                      {printReportData.totalMoney > 0 ? formatMoney(printReportData.totalMoney) : '—'}
                    </span>
                  </div>
                </div>
              )}

              {/* Control Signatures Footer */}
              <div className="pt-4 border-t border-slate-200 grid grid-cols-3 gap-6 text-center text-[10px] text-slate-500">
                <div className="pt-6 border-t border-slate-300 mt-4">Control Operativo de Flota</div>
                <div className="pt-6 border-t border-slate-300 mt-4">Administración / Costos</div>
                <div className="pt-6 border-t border-slate-300 mt-4">Conformidad Chofer / Supervisor</div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
