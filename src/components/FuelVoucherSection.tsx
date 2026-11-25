import React, { useState, useMemo } from 'react';
import { FuelDispensary, FuelVoucherStatus, Vehicle, Employee, TableColumnConfig, IssuedFuelVoucher, TableDensity, FuelDeposit } from '../types';
import { FUEL_VOUCHER_COLUMNS, FuelVoucherColumnKey } from '../data/tableColumns';
import { loadFuelColumnConfig, saveFuelColumnConfig, resetTableColumnConfig, formatCurrency, parseOdometerValue, extractFirstNonZeroOdometer, extractFirstNonZeroDistance } from '../services/storage';
import { resolveMovementType } from '../utils/fuelStockReconciliation';
import { ColumnManagerModal } from './ColumnManagerModal';
import { IssuedVoucherDetailModal } from './IssuedVoucherDetailModal';
import { TableDensitySelector } from './TableDensitySelector';
import { SearchableSelect } from './SearchableSelect';
import { DENSITY_CONFIG, getSavedTableDensity, saveTableDensity } from '../utils/densityStyles';
import { 
  Fuel, 
  Plus, 
  Search, 
  FileSpreadsheet, 
  Edit3, 
  Trash2, 
  Eye, 
  Camera, 
  Calendar, 
  X, 
  Image as ImageIcon,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  List,
  SlidersHorizontal,
  GripVertical,
  Ticket,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Layers,
  Sparkles,
  ExternalLink,
  UploadCloud
} from 'lucide-react';

interface FuelVoucherSectionProps {
  vouchers: FuelDispensary[];
  fleet: Vehicle[];
  employees: Employee[];
  deposits?: FuelDeposit[];
  issuedVouchers?: IssuedFuelVoucher[];
  density?: TableDensity;
  onChangeDensity?: (density: TableDensity) => void;
  onOpenCreateModal: () => void;
  onRendirVale?: (voucher: IssuedFuelVoucher) => void;
  onSwitchToIssuedVouchers?: () => void;
  onViewDetails: (voucher: FuelDispensary) => void;
  onViewIssuedVoucher?: (voucher: IssuedFuelVoucher) => void;
  onEditVoucher: (voucher: FuelDispensary) => void;
  onDeleteVoucher: (id: string) => void;
  onChangeStatus?: (id: string, newStatus: FuelVoucherStatus) => void;
  onExportCSV: () => void;
  onOpenImportExport?: () => void;
  onOpenGoogleSheet?: () => void;
  googleSheetLinkedLabel?: string;
  onOpenClearRecords?: () => void;
  onViewVehicle?: (vehicle: Vehicle) => void;
  onViewEmployee?: (employee: Employee) => void;
  onOpenVehicleAnalytics?: (vehicleCode: string) => void;
}

export const FuelVoucherSection: React.FC<FuelVoucherSectionProps> = ({
  vouchers,
  fleet,
  employees,
  deposits = [],
  issuedVouchers = [],
  density,
  onChangeDensity,
  onOpenCreateModal,
  onRendirVale,
  onSwitchToIssuedVouchers,
  onViewDetails,
  onViewIssuedVoucher,
  onEditVoucher,
  onDeleteVoucher,
  onChangeStatus,
  onExportCSV,
  onOpenImportExport,
  onOpenGoogleSheet,
  googleSheetLinkedLabel,
  onOpenClearRecords,
  onViewVehicle,
  onViewEmployee,
  onOpenVehicleAnalytics,
}) => {
  const [localDensity, setLocalDensity] = useState<TableDensity>(() => getSavedTableDensity());
  const activeDensity = density || localDensity;

  const handleDensityChange = (d: TableDensity) => {
    setLocalDensity(d);
    saveTableDensity(d);
    if (onChangeDensity) {
      onChangeDensity(d);
    }
  };

  const densityCfg = DENSITY_CONFIG[activeDensity];

  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('TODOS');
  const [clasificacionFilter, setClasificacionFilter] = useState<string>('TODOS');
  const [combustibleFilter, setCombustibleFilter] = useState<string>('TODOS');
  const [depositoFilter, setDepositoFilter] = useState<string>('TODOS');
  const [equipoFilter, setEquipoFilter] = useState<string>('TODOS');
  const [empleadoFilter, setEmpleadoFilter] = useState<string>('TODOS');
  const [fechaFilter, setFechaFilter] = useState<string>('TODAS');
  const [groupByDate, setGroupByDate] = useState<boolean>(true);
  const [showPendingDropdown, setShowPendingDropdown] = useState<boolean>(false);

  // Pending unrendered issued vouchers
  const pendingIssuedVouchers = useMemo(() => {
    return (issuedVouchers || []).filter(v => v.estado === 'EMITIDO');
  }, [issuedVouchers]);

  // Sorting state - default to fecha descending (most recent first)
  const [sortField, setSortField] = useState<FuelVoucherColumnKey>('fecha');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [dateOrder, setDateOrder] = useState<'desc' | 'asc'>('desc');

  // Direct toggle for date order: most recent first ⇄ oldest first
  const handleToggleDateSort = () => {
    if (sortField === 'fecha') {
      const nextDir = sortDirection === 'desc' ? 'asc' : 'desc';
      setSortDirection(nextDir);
      setDateOrder(nextDir);
    } else {
      setSortField('fecha');
      setSortDirection('desc');
      setDateOrder('desc');
    }
  };

  const handleSort = (field: FuelVoucherColumnKey) => {
    if (sortField === field) {
      const nextDir = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(nextDir);
      if (field === 'fecha') {
        setDateOrder(nextDir);
      }
    } else {
      setSortField(field);
      const initialDir = field === 'fecha' ? 'desc' : 'asc';
      setSortDirection(initialDir);
      if (field === 'fecha') {
        setDateOrder(initialDir);
      }
    }
  };

  const handleDoubleClickSort = (field: FuelVoucherColumnKey, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    handleSort(field);
  };

  // Robust helper to parse dates to timestamp
  const parseDateToTimestamp = (dateStr?: string, timeStr?: string): number => {
    if (!dateStr || !dateStr.trim() || dateStr === 'Sin Fecha' || dateStr === 'TODOS') return 0;
    const iso = normalizeDateToISO(dateStr);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split('-').map(Number);
      let h = 0, min = 0, sec = 0;
      if (timeStr && timeStr.includes(':')) {
        const tp = timeStr.split(':');
        h = parseInt(tp[0], 10) || 0;
        min = parseInt(tp[1], 10) || 0;
        sec = parseInt(tp[2] || '0', 10) || 0;
      }
      return new Date(y, m - 1, d, h, min, sec).getTime();
    }
    return 0;
  };

  // Helper to normalize any date into canonical YYYY-MM-DD
  const normalizeDateToISO = (dateStr?: string): string => {
    if (!dateStr || !dateStr.trim() || dateStr === 'Sin Fecha' || dateStr === 'TODOS') return 'Sin Fecha';
    const clean = dateStr.trim();
    if (clean.includes('T')) {
      return clean.split('T')[0];
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const parts = clean.split(/[/\-.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else if (parts[2].length === 4) {
        let p1 = parseInt(parts[0], 10);
        let p2 = parseInt(parts[1], 10);
        let y = parts[2];
        let m: number, d: number;
        if (p1 > 12 && p2 <= 12) {
          d = p1; m = p2;
        } else if (p2 > 12 && p1 <= 12) {
          m = p1; d = p2;
        } else {
          m = p1; d = p2; // AppSheet MM/DD/YYYY
        }
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    return clean;
  };

  // Helper to format ISO date to readable header (e.g. 31 de Agosto de 2026)
  const formatDisplayDate = (dateStr?: string): string => {
    if (!dateStr || dateStr === 'Sin Fecha' || dateStr === 'TODOS') return dateStr || '';
    const iso = normalizeDateToISO(dateStr);
    if (iso.includes('-')) {
      const parts = iso.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        const dNum = parseInt(day, 10);
        const mNum = parseInt(month, 10);
        const meses = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const mesName = meses[mNum - 1] || month;
        return `${dNum} de ${mesName} de ${year} (${dNum}/${mNum}/${year})`;
      }
    }
    return dateStr;
  };

  // Helper to format table cell date (DD/MM/YYYY)
  const formatTableCellDate = (dateStr?: string): string => {
    if (!dateStr || dateStr === 'Sin Fecha') return '-';
    const iso = normalizeDateToISO(dateStr);
    if (iso.includes('-')) {
      const parts = iso.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    return dateStr;
  };

  // Helper to format quantity with comma decimals (positive values)
  const formatQuantity = (val?: number, tipo?: string, cantCarga?: number): string => {
    const num = Math.abs(cantCarga !== undefined ? cantCarga : val ?? 0);
    return num.toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Helper to format numbers with dot thousand separator (e.g. 317.958)
  const formatNumber = (val?: number): string => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return Number(val).toLocaleString('es-AR');
  };

  // Column Configuration & Modal State
  const [columnConfig, setColumnConfig] = useState<TableColumnConfig<FuelVoucherColumnKey>>(() => loadFuelColumnConfig());
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);

  // Table header drag and drop state
  const [draggedHeaderKey, setDraggedHeaderKey] = useState<FuelVoucherColumnKey | null>(null);
  const [dragOverHeaderKey, setDragOverHeaderKey] = useState<FuelVoucherColumnKey | null>(null);

  // Image viewer modal state
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string; subtitle: string } | null>(null);

  // Linked Issued Voucher popup modal state
  const [selectedIssuedVoucherForPopup, setSelectedIssuedVoucherForPopup] = useState<IssuedFuelVoucher | null>(null);

  // Helper to find or synthesize the linked issued fuel voucher
  const getLinkedIssuedVoucher = (v: FuelDispensary): IssuedFuelVoucher => {
    const orderNum = (v.numOrden || v.numVale || v.numComprobante || '').trim();
    
    // Check in existing issued vouchers array
    const matched = issuedVouchers.find(iv => 
      (orderNum && (iv.numVale === orderNum || iv.numComprobante === orderNum)) ||
      (v.valeId && iv.id === v.valeId) ||
      (v.id && iv.expendioId === v.id)
    );

    if (matched) {
      return matched;
    }

    // Match employee and vehicle from fleet for rich modal view
    const matchedEmp = employees.find(e => 
      e.codigoEmpleado === v.codigoEmpleado || 
      e.nombreApellido?.toLowerCase() === v.nombreApellido?.toLowerCase() ||
      e.legajo === v.legajo
    );
    const matchedVeh = fleet.find(f => 
      f.codigoEquipo === v.codigoEquipo || 
      f.patente?.toLowerCase() === v.patente?.toLowerCase()
    );

    return {
      id: `VAL-${orderNum || v.id}`,
      numVale: orderNum || v.numOrden || '00000',
      numComprobante: orderNum || v.numOrden || '00000',
      fechaEmision: v.fecha || new Date().toISOString().slice(0, 10),
      horaEmision: v.hora || '08:00',
      codigoEquipo: v.codigoEquipo || matchedVeh?.codigoEquipo || 'EQUIPO-01',
      marcaModelo: v.marcaModelo || matchedVeh?.modeloMarca || 'Equipo de Flota',
      patente: v.patente || matchedVeh?.patente || 'S/P',
      codigoEmpleado: v.codigoEmpleado || matchedEmp?.codigoEmpleado || 'CH-001',
      nombreApellido: v.nombreApellido || matchedEmp?.nombreApellido || 'Chofer Asignado',
      legajo: v.legajo || matchedEmp?.legajo || 'LEG-000',
      tipoComb: v.tipoComb || 'DIESEL',
      idCombustible: v.idCombustible || 'COMB-D500',
      litrosAutorizados: v.litrosAutorizados || v.cantidad || 0,
      cantidad: v.cantidad || 0,
      litrosReales: v.cantidad || 0,
      tipoCarga: v.carga || 'Tanque Lleno',
      estacionSurtidor: v.deposito || v.numEstacion || 'Estación YPF / Shell Autorizada',
      numEstacion: v.numEstacion || '',
      estado: 'RENDIDO',
      expendioId: v.id,
      numTicket: v.numTicket || v.numEstacion || `TK-${orderNum}`,
      odometroCarga: v.kilometraje || v.kmsHs || v.horometroOdometro || 0,
      odometroSalida: (v.kilometraje || v.kmsHs || v.horometroOdometro) ? Math.max(0, Number(v.kilometraje || v.kmsHs || v.horometroOdometro || 0) - (v.kilometrosRec || 0)) : undefined,
      fotoTicket: v.fotoExpendio,
      fotoOdometro: v.fotoKilometraje,
      importeTotal: v.totalImporte || ((v.cantidad || 0) * (v.precioUnitario || 1350)),
      fechaRendicion: v.fecha,
      horaRendicion: v.hora,
      observaciones: v.observaciones || `Vale vinculado al registro de expendio ${v.id} (Nº Orden: ${orderNum})`
    };
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = vouchers.length;
    const totalLitros = vouchers.reduce((acc, v) => acc + (v.cantidad || 0), 0);
    const egresosCount = vouchers.filter(v => resolveMovementType(v, deposits) === 'EGRESO').length;
    const ingresosCount = vouchers.filter(v => resolveMovementType(v, deposits) === 'INGRESO').length;
    const fotosAdjuntas = vouchers.filter(v => Boolean(v.fotoExpendio || v.fotoKilometraje)).length;

    return {
      total,
      totalLitros,
      egresosCount,
      ingresosCount,
      fotosAdjuntas
    };
  }, [vouchers, deposits]);

  // Unique filters
  const allDepositos = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      if (v.deposito) set.add(v.deposito);
    });
    return Array.from(set);
  }, [vouchers]);

  const allFuels = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      if (v.tipoComb) set.add(v.tipoComb);
    });
    return Array.from(set);
  }, [vouchers]);

  const allClasificaciones = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      if (v.clasificacion) set.add(v.clasificacion);
    });
    return Array.from(set);
  }, [vouchers]);

  const allEquipmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    fleet.forEach(f => {
      const label = `${f.modeloMarca || f.codigoEquipo} ${f.patente ? `(${f.patente})` : ''}`;
      if (f.codigoEquipo) {
        map.set(f.codigoEquipo, label);
      }
      if (f.id && !map.has(f.id)) {
        map.set(f.id, label);
      }
      if (f.codigoInterno && !map.has(f.codigoInterno)) {
        map.set(f.codigoInterno, label);
      }
    });
    vouchers.forEach(v => {
      if (v.codigoEquipo && !map.has(v.codigoEquipo)) {
        map.set(v.codigoEquipo, v.marcaModelo ? `${v.marcaModelo} (${v.codigoEquipo})` : v.codigoEquipo);
      }
    });
    const opts = Array.from(map.entries()).map(([val, label]) => ({
      value: val,
      label: label
    }));
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: 'TODOS', label: 'Todos los Equipos' }, ...opts];
  }, [fleet, vouchers]);

  const allEmployeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach(e => {
      const code = e.codigoEmpleado || e.legajo || e.nombreApellido;
      if (code) {
        map.set(code, `${e.nombreApellido} (${e.codigoEmpleado || e.legajo || ''})`);
      }
    });
    vouchers.forEach(v => {
      const code = v.codigoEmpleado || v.nombreApellido;
      if (code && !map.has(code)) {
        map.set(code, code);
      }
    });
    const opts = Array.from(map.entries()).map(([val, label]) => ({
      value: val,
      label: label
    }));
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: 'TODOS', label: 'Todos los Empleados' }, ...opts];
  }, [employees, vouchers]);

  // Unique registered dates for filtering
  const availableDates = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      const iso = normalizeDateToISO(v.fecha);
      if (iso && iso !== 'Sin Fecha') set.add(iso);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [vouchers]);

  // Filtered & sorted vouchers
  const filteredVouchers = useMemo(() => {
    const list = vouchers.filter((v) => {
      const search = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        (v.id || '').toLowerCase().includes(search) ||
        (v.deposito || '').toLowerCase().includes(search) ||
        (v.tipo || '').toLowerCase().includes(search) ||
        (v.codigoEmpleado || '').toLowerCase().includes(search) ||
        (v.nombreApellido || '').toLowerCase().includes(search) ||
        (v.codigoEquipo || '').toLowerCase().includes(search) ||
        (v.numOrden || '').toLowerCase().includes(search) ||
        (v.numEstacion || '').toLowerCase().includes(search) ||
        (v.tipoComb || '').toLowerCase().includes(search) ||
        (v.obraNombre || '').toLowerCase().includes(search) ||
        (v.clasificacion || '').toLowerCase().includes(search);

      const vMovementType = resolveMovementType(v, deposits);
      const matchTipo = tipoFilter === 'TODOS' || vMovementType === tipoFilter || v.tipo?.toUpperCase() === tipoFilter;
      const matchFuel = combustibleFilter === 'TODOS' || v.tipoComb === combustibleFilter;
      const matchDep = depositoFilter === 'TODOS' || v.deposito === depositoFilter;
      const matchClasif = clasificacionFilter === 'TODOS' || v.clasificacion === clasificacionFilter;
      const matchEquipo = equipoFilter === 'TODOS' || (v.codigoEquipo || '').toLowerCase() === equipoFilter.toLowerCase();
      const matchEmpleado = empleadoFilter === 'TODOS' || 
        (v.codigoEmpleado || '').toLowerCase() === empleadoFilter.toLowerCase() ||
        (v.nombreApellido || '').toLowerCase() === empleadoFilter.toLowerCase();
      const matchFecha = fechaFilter === 'TODAS' || normalizeDateToISO(v.fecha) === fechaFilter;

      return matchSearch && matchTipo && matchFuel && matchDep && matchClasif && matchEquipo && matchEmpleado && matchFecha;
    });

    if (sortField) {
      list.sort((a, b) => {
        if (sortField === 'fecha') {
          const timeA = parseDateToTimestamp(a.fecha, a.hora);
          const timeB = parseDateToTimestamp(b.fecha, b.hora);
          if (timeA !== timeB) {
            return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
          }
          return (b.id || '').localeCompare(a.id || '');
        }

        if (sortField === 'cantidad') {
          const valA = Math.abs(a.cantCarga !== undefined ? a.cantCarga : (a.cantidad ?? 0));
          const valB = Math.abs(b.cantCarga !== undefined ? b.cantCarga : (b.cantidad ?? 0));
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        if (sortField === 'codigoEquipo') {
          const nameA = a.marcaModelo || a.codigoEquipo || '';
          const nameB = b.marcaModelo || b.codigoEquipo || '';
          return sortDirection === 'asc'
            ? nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' })
            : nameB.localeCompare(nameA, undefined, { numeric: true, sensitivity: 'base' });
        }

        const valA: any = a[sortField as keyof FuelDispensary] ?? '';
        const valB: any = b[sortField as keyof FuelDispensary] ?? '';

        if (typeof valA === 'string') {
          return sortDirection === 'asc'
            ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
            : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
        }

        if (typeof valA === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        return 0;
      });
    }

    return list;
  }, [vouchers, deposits, searchTerm, tipoFilter, combustibleFilter, depositoFilter, clasificacionFilter, equipoFilter, empleadoFilter, fechaFilter, sortField, sortDirection]);

  // Group vouchers by date (normalized canonical YYYY-MM-DD key)
  const groupedVouchers = useMemo(() => {
    if (!groupByDate) {
      return { 'TODOS': filteredVouchers };
    }

    const groups: { [key: string]: FuelDispensary[] } = {};
    filteredVouchers.forEach(v => {
      const dateKey = normalizeDateToISO(v.fecha);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(v);
    });

    return groups;
  }, [filteredVouchers, groupByDate]);

  // Sorted date keys - respects sortDirection when sorting by fecha, or explicit dateOrder
  const sortedDateKeys = useMemo(() => {
    return Object.keys(groupedVouchers).sort((a, b) => {
      if (a === 'TODOS') return 0;
      if (a === 'Sin Fecha') return 1;
      if (b === 'Sin Fecha') return -1;
      const timeA = parseDateToTimestamp(a);
      const timeB = parseDateToTimestamp(b);
      const effectiveDirection = sortField === 'fecha' ? sortDirection : dateOrder;
      return effectiveDirection === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }, [groupedVouchers, sortDirection, sortField, dateOrder]);

  // Handle saving column preferences
  const handleSaveColumnConfig = (newConfig: TableColumnConfig<FuelVoucherColumnKey>) => {
    setColumnConfig(newConfig);
    saveFuelColumnConfig(newConfig);
  };

  const handleResetColumnDefaults = () => {
    const defaults = resetTableColumnConfig('la_hormiga_fuel_columns_v2', FUEL_VOUCHER_COLUMNS);
    setColumnConfig(defaults);
  };

  // Header drag and drop handlers
  const handleHeaderDragStart = (key: FuelVoucherColumnKey, e: React.DragEvent) => {
    setDraggedHeaderKey(key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  };

  const handleHeaderDragOver = (key: FuelVoucherColumnKey, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverHeaderKey !== key) {
      setDragOverHeaderKey(key);
    }
  };

  const handleHeaderDragLeave = (key: FuelVoucherColumnKey, e: React.DragEvent) => {
    e.preventDefault();
    if (dragOverHeaderKey === key) {
      setDragOverHeaderKey(null);
    }
  };

  const handleHeaderDrop = (targetKey: FuelVoucherColumnKey, e: React.DragEvent) => {
    e.preventDefault();
    const sourceKey = (e.dataTransfer.getData('text/plain') as FuelVoucherColumnKey) || draggedHeaderKey;
    if (!sourceKey || sourceKey === targetKey) {
      setDraggedHeaderKey(null);
      setDragOverHeaderKey(null);
      return;
    }

    const newOrder = [...columnConfig.order];
    const sourceIdx = newOrder.indexOf(sourceKey);
    const targetIdx = newOrder.indexOf(targetKey);

    if (sourceIdx !== -1 && targetIdx !== -1) {
      newOrder.splice(sourceIdx, 1);
      newOrder.splice(targetIdx, 0, sourceKey);
      const updated: TableColumnConfig<FuelVoucherColumnKey> = {
        ...columnConfig,
        order: newOrder
      };
      setColumnConfig(updated);
      saveFuelColumnConfig(updated);
    }

    setDraggedHeaderKey(null);
    setDragOverHeaderKey(null);
  };

  const handleHeaderDragEnd = () => {
    setDraggedHeaderKey(null);
    setDragOverHeaderKey(null);
  };

  // Render dynamic header cell with double-click sorting & sort indicator
  const renderHeaderCell = (colKey: FuelVoucherColumnKey) => {
    if (!columnConfig.visible[colKey]) return null;

    const def = FUEL_VOUCHER_COLUMNS.find(c => c.key === colKey);
    const isDragging = draggedHeaderKey === colKey;
    const isDragOver = dragOverHeaderKey === colKey;
    const isSorted = sortField === colKey;

    const baseClass = `${densityCfg.thPadding} font-bold transition select-none group cursor-pointer ${
      isDragOver
        ? 'border-l-4 border-amber-500 bg-amber-500/20 text-amber-300'
        : isDragging
        ? 'opacity-40 bg-slate-900'
        : isSorted
        ? 'bg-amber-500/10 text-amber-300'
        : 'hover:bg-slate-800/80 hover:text-white text-slate-300'
    }`;

    const alignClass = def?.align === 'right' ? 'text-right' : def?.align === 'center' ? 'text-center' : 'text-left';

    return (
      <th
        key={colKey}
        draggable
        onDragStart={(e) => handleHeaderDragStart(colKey, e)}
        onDragOver={(e) => handleHeaderDragOver(colKey, e)}
        onDragLeave={(e) => handleHeaderDragLeave(colKey, e)}
        onDrop={(e) => handleHeaderDrop(colKey, e)}
        onDragEnd={handleHeaderDragEnd}
        onClick={() => handleSort(colKey)}
        onDoubleClick={(e) => handleDoubleClickSort(colKey, e)}
        className={`${baseClass} ${alignClass}`}
        title={`Click o Doble Click para ordenar por ${def?.label || colKey}. Arrastra para reordenar.`}
      >
        <div className={`flex items-center ${densityCfg.gap} ${def?.align === 'right' ? 'justify-end' : def?.align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <GripVertical className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 cursor-grab shrink-0 transition-opacity" />
          <span className={`truncate ${densityCfg.headerFontSize}`}>{def?.label || colKey}</span>
          <span className="shrink-0">
            {isSorted ? (
              sortDirection === 'asc' ? (
                <ArrowUp className={`${densityCfg.iconSize} text-amber-400 font-bold`} />
              ) : (
                <ArrowDown className={`${densityCfg.iconSize} text-amber-400 font-bold`} />
              )
            ) : (
              <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-50" />
            )}
          </span>
        </div>
      </th>
    );
  };

  // Render individual body cells according to column definitions & exact formatting
  const renderBodyCell = (colKey: FuelVoucherColumnKey, v: FuelDispensary) => {
    if (!columnConfig.visible[colKey]) return null;

    const tdBase = `${densityCfg.tdPadding} ${densityCfg.fontSize}`;

    switch (colKey) {
      case 'id':
        return (
          <td key="id" className={`${tdBase} font-mono text-slate-300 font-medium`}>
            {v.id}
          </td>
        );

      case 'deposito':
        return (
          <td key="deposito" className={`${tdBase} text-slate-200 font-medium`}>
            <div>{v.deposito || '-'}</div>
            {v.obraNombre && (
              <div className="mt-0.5">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                  Obra: {v.obraNombre}
                </span>
              </div>
            )}
          </td>
        );

      case 'tipo': {
        const movementType = resolveMovementType(v, deposits);
        const isEgreso = movementType === 'EGRESO';
        return (
          <td key="tipo" className={`${tdBase} font-bold font-mono`}>
            <span className={isEgreso ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>
              {movementType}
            </span>
          </td>
        );
      }

      case 'cantidad': {
        const movementType = resolveMovementType(v, deposits);
        return (
          <td key="cantidad" className={`${tdBase} text-right font-mono font-bold text-slate-100`}>
            {formatQuantity(v.cantidad, movementType, v.cantCarga)}
          </td>
        );
      }

      case 'codigoEmpleado': {
        const matchedEmp = employees.find(e =>
          (e.codigoEmpleado && e.codigoEmpleado.toLowerCase() === v.codigoEmpleado?.toLowerCase()) ||
          (e.id && e.id.toLowerCase() === v.codigoEmpleado?.toLowerCase()) ||
          (e.legajo && e.legajo.toLowerCase() === v.codigoEmpleado?.toLowerCase()) ||
          (e.nombreApellido && e.nombreApellido.toLowerCase() === v.codigoEmpleado?.toLowerCase())
        );
        const nameToDisplay = v.nombreApellido || matchedEmp?.nombreApellido || v.codigoEmpleado || '-';
        return (
          <td key="codigoEmpleado" className={`${tdBase} text-slate-200 font-semibold truncate max-w-[180px]`} title={nameToDisplay}>
            {nameToDisplay}
          </td>
        );
      }

      case 'codigoEquipo': {
        const matchedVeh = fleet.find(f => 
          (f.codigoEquipo && f.codigoEquipo.toLowerCase() === v.codigoEquipo?.toLowerCase()) ||
          (f.codigoInterno && f.codigoInterno.toLowerCase() === v.codigoEquipo?.toLowerCase()) ||
          (f.id && f.id.toLowerCase() === v.codigoEquipo?.toLowerCase()) ||
          (f.patente && f.patente.toLowerCase() === v.codigoEquipo?.toLowerCase()) ||
          (f.modeloMarca && f.modeloMarca.toLowerCase() === v.codigoEquipo?.toLowerCase())
        );
        const displayName = v.marcaModelo || matchedVeh?.modeloMarca || v.codigoEquipo || 'Equipo';
        return (
          <td key="codigoEquipo" className={`${tdBase} truncate max-w-[220px]`} title={`${displayName} (${v.codigoEquipo})`}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenVehicleAnalytics && (v.codigoEquipo || matchedVeh?.codigoEquipo)) {
                  onOpenVehicleAnalytics(v.codigoEquipo || matchedVeh?.codigoEquipo || '');
                } else if (onViewVehicle && (matchedVeh || v.codigoEquipo)) {
                  onViewVehicle(matchedVeh || fleet.find(f => f.codigoEquipo === v.codigoEquipo)!);
                }
              }}
              className="text-amber-400 hover:text-amber-300 hover:underline font-bold cursor-pointer inline-flex items-center gap-1 text-left truncate max-w-full"
              title="Click para ver analítica de consumo y autonomía del vehículo"
            >
              <span className="truncate">{displayName}</span>
            </button>
            {v.patente && (
              <span className="block text-[10px] text-slate-500 font-mono truncate">{v.patente}</span>
            )}
          </td>
        );
      }

      case 'autonomiaVt':
        return (
          <td key="autonomiaVt" className={`${tdBase} text-right font-mono text-slate-300`}>
            {v.autonomiaVt || '00,00'}
          </td>
        );

      case 'autonom':
        {
          let val = v.autonom;
          if (!val || val.toUpperCase() === 'NORMAL' || val === '0,00' || val === '0' || val === '-') {
            const l = Math.abs(v.cantidad !== undefined ? v.cantidad : (v.cantCarga || 0));
            const rawKmsRec = v.kilometrosRec ?? (v as any)['KILOMETROS_REC'] ?? (v as any)['KM_RECORRIDO'];
            const kms = Math.abs(parseOdometerValue(rawKmsRec));
            if (kms > 0 && l > 0) {
              val = (kms / l).toFixed(2).replace('.', ',');
            } else {
              val = '-';
            }
          }
          return (
            <td key="autonom" className={`${tdBase} text-right font-mono text-slate-300`}>
              {val}
            </td>
          );
        }

      case 'numEstacion':
        return (
          <td key="numEstacion" className={`${tdBase} font-mono text-slate-300`}>
            {v.numEstacion || ''}
          </td>
        );

      case 'numOrden': {
        const orderNum = (v.numOrden || v.numVale || v.numComprobante || '').trim();
        if (!orderNum) {
          return (
            <td key="numOrden" className={`${tdBase} font-mono text-slate-500`}>
              -
            </td>
          );
        }

        return (
          <td key="numOrden" className={`${tdBase} font-mono`}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const linkedVoucher = getLinkedIssuedVoucher(v);
                setSelectedIssuedVoucherForPopup(linkedVoucher);
                onViewIssuedVoucher?.(linkedVoucher);
              }}
              className={`inline-flex items-center ${densityCfg.gap} ${
                activeDensity === 'ultra' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
              } rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/40 hover:border-amber-400 font-bold transition group/valebtn cursor-pointer shadow-xs active:scale-95`}
              title={`Hacer clic para ver el Vale de Combustible Nº ${orderNum} en un Popup`}
            >
              <Ticket className={`${densityCfg.iconSize} text-amber-400 group-hover/valebtn:rotate-12 transition-transform shrink-0`} />
              <span className="font-mono font-black underline decoration-amber-500/40 group-hover/valebtn:decoration-amber-300">
                {orderNum}
              </span>
            </button>
          </td>
        );
      }

      case 'tipoComb':
        return (
          <td key="tipoComb" className={`${tdBase} text-slate-200 font-medium`}>
            {v.tipoComb}
          </td>
        );

      case 'kilometraje': {
        const kms = extractFirstNonZeroOdometer(
          v.kilometraje,
          v.kmsHs,
          v.horometroOdometro,
          (v as any)['KMS/HS'],
          (v as any)['KMS_HS'],
          (v as any)['KILOMETRAJE'],
          (v as any)['ODOMETRO'],
          (v as any)['HOROMETRO']
        );
        return (
          <td key="kilometraje" className={`${tdBase} text-right font-mono text-slate-200 font-bold`}>
            {kms > 0 ? formatNumber(kms) : '-'}
          </td>
        );
      }

      case 'fotoExpendio':
        return (
          <td key="fotoExpendio" className={`${tdBase} text-center`}>
            {v.fotoExpendio ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage({
                    url: v.fotoExpendio!,
                    title: `Foto de Expendio - ${v.id}`,
                    subtitle: `${v.deposito} • ${v.tipoComb} • ${formatQuantity(v.cantidad, v.tipo, v.cantCarga)} Lts`
                  });
                }}
                className="relative inline-block group/img cursor-pointer"
                title="Click para ver foto ampliada del comprobante de expendio"
              >
                <img
                  src={v.fotoExpendio}
                  alt="Foto Expendio"
                  className={`${
                    activeDensity === 'ultra' ? 'w-5 h-5' : activeDensity === 'compact' ? 'w-6 h-6' : 'w-8 h-8'
                  } rounded object-cover border border-slate-700 hover:border-amber-400 transition`}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=150&q=80';
                  }}
                />
                <div className="absolute inset-0 bg-black/40 rounded flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition">
                  <Eye className={`${densityCfg.iconSize} text-white`} />
                </div>
              </button>
            ) : (
              <span className="text-slate-600 text-[10px] italic">-</span>
            )}
          </td>
        );

      case 'fotoKilometraje':
        return (
          <td key="fotoKilometraje" className={`${tdBase} text-center`}>
            {v.fotoKilometraje ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage({
                    url: v.fotoKilometraje!,
                    title: `Foto de Kilometraje / Odómetro - ${v.id}`,
                    subtitle: `${v.codigoEquipo} • Odómetro / Horómetro: ${formatNumber(parseOdometerValue(v.kilometraje ?? v.kmsHs ?? v.horometroOdometro))} km/hs`
                  });
                }}
                className="relative inline-block group/img cursor-pointer"
                title="Click para ver foto ampliada del tablero / odómetro"
              >
                <img
                  src={v.fotoKilometraje}
                  alt="Foto Kilometraje"
                  className={`${
                    activeDensity === 'ultra' ? 'w-5 h-5' : activeDensity === 'compact' ? 'w-6 h-6' : 'w-8 h-8'
                  } rounded object-cover border border-slate-700 hover:border-amber-400 transition`}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=150&q=80';
                  }}
                />
                <div className="absolute inset-0 bg-black/40 rounded flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition">
                  <Eye className={`${densityCfg.iconSize} text-white`} />
                </div>
              </button>
            ) : (
              <span className="text-slate-600 text-[10px] italic">-</span>
            )}
          </td>
        );

      case 'kilometrosRec': {
        const kmsRec = extractFirstNonZeroDistance(
          v.kilometrosRec,
          (v as any)['KILOMETROS_REC'],
          (v as any)['KM_RECORRIDO'],
          (v as any)['KMS_REC']
        );
        return (
          <td key="kilometrosRec" className={`${tdBase} text-right font-mono font-bold text-slate-200`}>
            {kmsRec > 0 ? formatNumber(kmsRec) : '0'}
          </td>
        );
      }

      case 'clasificacion':
        return (
          <td key="clasificacion" className={`${tdBase} text-slate-300`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`font-bold uppercase text-slate-300 ${activeDensity === 'ultra' ? 'text-[10px]' : 'text-xs'}`}>{v.clasificacion || 'MAQUINAS'}</span>
              <ChevronRight className={`${densityCfg.iconSize} text-slate-500 group-hover:text-amber-400 transition-colors shrink-0`} />
            </div>
          </td>
        );

      case 'carga':
        return (
          <td key="carga" className={`${tdBase} text-slate-300`}>
            {v.carga || '-'}
          </td>
        );

      case 'idCombustible':
        return (
          <td key="idCombustible" className={`${tdBase} font-mono text-slate-400`}>
            {v.idCombustible || '-'}
          </td>
        );

      case 'nombreApellido': {
        const matchedEmp = employees.find(e =>
          (e.codigoEmpleado && e.codigoEmpleado.toLowerCase() === v.codigoEmpleado?.toLowerCase()) ||
          (e.id && e.id.toLowerCase() === v.codigoEmpleado?.toLowerCase()) ||
          (e.legajo && e.legajo.toLowerCase() === v.codigoEmpleado?.toLowerCase()) ||
          (e.nombreApellido && e.nombreApellido.toLowerCase() === v.codigoEmpleado?.toLowerCase())
        );
        const nameToDisplay = v.nombreApellido || matchedEmp?.nombreApellido || v.codigoEmpleado || '-';
        return (
          <td key="nombreApellido" className={`${tdBase} text-slate-300 font-medium truncate max-w-[180px]`} title={nameToDisplay}>
            {nameToDisplay}
          </td>
        );
      }

      case 'legajo':
        return (
          <td key="legajo" className={`${tdBase} font-mono text-slate-400`}>
            {v.legajo || '-'}
          </td>
        );

      case 'marcaModelo':
        return (
          <td key="marcaModelo" className={`${tdBase} text-slate-300 truncate max-w-[160px]`} title={v.marcaModelo}>
            {v.marcaModelo || '-'}
          </td>
        );

      case 'patente':
        return (
          <td key="patente" className={`${tdBase} font-mono text-slate-200`}>
            <span className={`rounded bg-slate-900 border border-slate-700/80 font-bold ${
              activeDensity === 'ultra' ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-[11px]'
            }`}>
              {v.patente || 'S/P'}
            </span>
          </td>
        );

      case 'fecha':
        return (
          <td key="fecha" className={`${tdBase} font-mono text-slate-300 whitespace-nowrap`}>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{formatTableCellDate(v.fecha)}</span>
            </div>
          </td>
        );

      case 'hora':
        return (
          <td key="hora" className={`${tdBase} font-mono text-slate-400`}>
            {v.hora || '-'}
          </td>
        );

      default:
        return null;
    }
  };

  const visibleCount = columnConfig.order.filter(k => columnConfig.visible[k]).length;

  return (
    <div className="space-y-4">
      {/* Breadcrumb Header Bar */}
      <div className="bg-[#12151B] border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          {/* Breadcrumb exact style */}
          <div className="flex items-center gap-1.5 text-xs font-black tracking-wider text-slate-400 uppercase">
            <span className="text-slate-400 hover:text-white transition">COMBUSTIBLE</span>
            <span className="text-slate-600 font-bold">&gt;</span>
            <span className="text-amber-400 font-black">EXPENDIO COMBUSTIBLE</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Registro detallado de cargas, egresos e ingresos con odómetro, autonomía y fotos de tickets.
          </p>
        </div>

        {/* Top Right Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Table Density Selector */}
          <TableDensitySelector
            density={activeDensity}
            onChangeDensity={handleDensityChange}
          />

          {/* Group by Date Toggle */}
          <button
            type="button"
            onClick={() => setGroupByDate(prev => !prev)}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              groupByDate 
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm' 
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
            title="Activar/Desactivar agrupación por fecha"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>{groupByDate ? 'Agrupado por Fecha' : 'Sin Agrupar'}</span>
          </button>

          {/* Orden de Fechas Toggle */}
          <button
            type="button"
            onClick={handleToggleDateSort}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              sortField === 'fecha'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
            title={
              sortField === 'fecha' && sortDirection === 'asc'
                ? 'Fechas en orden cronológico ascendente (más antiguos primero). Click para invertir a más recientes primero.'
                : 'Fechas en orden descendente (más recientes primero). Click para invertir a más antiguos primero.'
            }
          >
            {sortField === 'fecha' && sortDirection === 'asc' ? (
              <>
                <ArrowUp className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                <span>Fechas: Antiguos primero</span>
              </>
            ) : (
              <>
                <ArrowDown className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                <span>Fechas: Recientes primero</span>
              </>
            )}
          </button>

          {/* Column Config */}
          <button
            type="button"
            onClick={() => setIsColumnModalOpen(true)}
            className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
            title="Personalizar columnas visibles y orden"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span>Columnas ({visibleCount})</span>
          </button>

          {/* Import / Export Hub */}
          {onOpenImportExport && (
            <button
              type="button"
              onClick={onOpenImportExport}
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
              title="Importar y Exportar registros de expendio (Excel / CSV / Plantilla)"
            >
              <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
              <span>Importar / Exportar</span>
            </button>
          )}

          {/* Google Sheets Connector */}
          {onOpenGoogleSheet && (
            <button
              type="button"
              onClick={onOpenGoogleSheet}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                googleSheetLinkedLabel
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-900 hover:bg-slate-800 text-emerald-300 border-emerald-500/30'
              }`}
              title="Conectar y sincronizar Expendio de Combustible con una hoja de Google Sheets"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>{googleSheetLinkedLabel ? `Sheet: ${googleSheetLinkedLabel}` : 'Google Sheet'}</span>
            </button>
          )}

          {/* Limpiar Registros Button */}
          {onOpenClearRecords && (
            <button
              type="button"
              onClick={onOpenClearRecords}
              className="px-3 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-rose-500/40 hover:border-rose-400 transition cursor-pointer shadow-sm group"
              title="Limpiar y vaciar registros de expendio en base de datos y local"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
              <span>Limpiar Registros</span>
            </button>
          )}

          {/* CSV Export */}
          <button
            type="button"
            onClick={onExportCSV}
            className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
            title="Descargar archivo CSV oficial"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>CSV</span>
          </button>

          {/* Quick Action: Rendir Vale Emitido */}
          {pendingIssuedVouchers.length > 0 && onRendirVale && (
            <button
              type="button"
              onClick={() => onRendirVale(pendingIssuedVouchers[0])}
              className="px-3.5 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold flex items-center gap-1.5 border border-amber-500/40 shadow-xs transition cursor-pointer active:scale-98"
              title="Llamar y rendir un vale emitido pendiente con su ticket"
            >
              <Ticket className="w-3.5 h-3.5 text-amber-400" />
              <span>Rendir Vale ({pendingIssuedVouchers.length})</span>
            </button>
          )}

          {/* + AÑADIR button */}
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 shadow-md transition cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ AÑADIR</span>
          </button>
        </div>
      </div>

      {/* Banner de Vales Emitidos Pendientes de Rendición */}
      {pendingIssuedVouchers.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 rounded-xl p-3 sm:p-4 shadow-md transition-all">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                <Ticket className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">
                    Hay {pendingIssuedVouchers.length} {pendingIssuedVouchers.length === 1 ? 'vale emitido sin rendir' : 'vales emitidos sin rendir'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black font-mono">
                    {pendingIssuedVouchers.length} PENDIENTES
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Cargue el ticket de la estación seleccionando el vale emitido para registrar el odómetro y cerrar el circuito a RENDIDO.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
              <button
                type="button"
                onClick={() => setShowPendingDropdown(!showPendingDropdown)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-bold border border-amber-500/30 transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-98"
              >
                <List className="w-3.5 h-3.5 text-amber-400" />
                <span>Ver Vales Pendientes ({pendingIssuedVouchers.length})</span>
                {showPendingDropdown ? (
                  <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
                )}
              </button>

              {onRendirVale && (
                <button
                  type="button"
                  onClick={() => onRendirVale(pendingIssuedVouchers[0])}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer active:scale-98"
                >
                  <Ticket className="w-3.5 h-3.5" />
                  <span>Rendir Vale {pendingIssuedVouchers[0]?.numVale ? `Nº ${pendingIssuedVouchers[0].numVale}` : ''}</span>
                </button>
              )}
            </div>
          </div>

          {/* Mini Tabla Desplegable de Vales Pendientes */}
          {showPendingDropdown && (
            <div className="mt-3 pt-3 border-t border-amber-500/20 animate-in fade-in duration-150">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <List className="w-3 h-3" />
                  Vales Emitidos Sin Rendir ({pendingIssuedVouchers.length})
                </span>
                <span className="text-[10px] text-slate-400">
                  Haga clic en &quot;Rendir&quot; para abrir la rendición del vale correspondiente
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#111318]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider">
                      <th className="py-2 px-3">Nº Vale</th>
                      <th className="py-2 px-3">Chofer / Operador</th>
                      <th className="py-2 px-3">Vehículo / Equipo</th>
                      <th className="py-2 px-3">Combustible / Estación</th>
                      <th className="py-2 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {pendingIssuedVouchers.map((v) => (
                      <tr key={v.id} className="hover:bg-amber-500/10 transition-colors">
                        <td className="py-2 px-3 font-mono font-black text-amber-400 whitespace-nowrap">
                          Nº {v.numVale || v.numComprobante || v.id}
                        </td>
                        <td className="py-2 px-3 text-white font-medium whitespace-nowrap">
                          {v.nombreApellido || 'Sin Chofer'}
                          {v.legajo && <span className="text-[10px] text-slate-400 ml-1.5">({v.legajo})</span>}
                        </td>
                        <td className="py-2 px-3 text-slate-200">
                          <div className="font-semibold text-amber-300/90">
                            {v.marcaModelo || v.codigoEquipo || 'Sin equipo'}
                          </div>
                          {v.patente && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              Patente: {v.patente}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          <span className="px-1.5 py-0.5 rounded-xs bg-slate-800 text-[10px] font-medium text-slate-300 mr-1.5">
                            {v.tipoComb || 'COMBUSTIBLE'}
                          </span>
                          {v.estacionSurtidor && (
                            <span className="text-[10px] text-slate-400">
                              {v.estacionSurtidor}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          {onRendirVale && (
                            <button
                              type="button"
                              onClick={() => onRendirVale(v)}
                              className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-black shadow-xs transition cursor-pointer active:scale-95 inline-flex items-center gap-1"
                            >
                              <Ticket className="w-3 h-3" />
                              Rendir
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-[#16191F] border border-slate-800 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2.5 items-center">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-500 transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Fecha filter (SearchableSelect) */}
        <div>
          <SearchableSelect
            compact
            clearValue="TODAS"
            options={[
              { value: 'TODAS', label: `Todas las Fechas (${vouchers.length})` },
              ...availableDates.map((d) => ({
                value: d,
                label: formatTableCellDate(d),
                subtitle: d,
              })),
            ]}
            value={fechaFilter}
            onChange={(val) => setFechaFilter(val || 'TODAS')}
            placeholder="Todas las Fechas..."
            searchPlaceholder="Buscar fecha (ej: 12/11)..."
          />
        </div>

        {/* Equipo Filter (SearchableSelect) */}
        <div>
          <SearchableSelect
            compact
            clearValue="TODOS"
            options={allEquipmentOptions}
            value={equipoFilter}
            onChange={(val) => setEquipoFilter(val || 'TODOS')}
            placeholder="Filtrar Equipo..."
            searchPlaceholder="Escribí equipo o patente..."
          />
        </div>

        {/* Empleado Filter (SearchableSelect) */}
        <div>
          <SearchableSelect
            compact
            clearValue="TODOS"
            options={allEmployeeOptions}
            value={empleadoFilter}
            onChange={(val) => setEmpleadoFilter(val || 'TODOS')}
            placeholder="Filtrar Empleado..."
            searchPlaceholder="Escribí apellido o legajo..."
          />
        </div>

        {/* Tipo filter (SearchableSelect) */}
        <div>
          <SearchableSelect
            compact
            clearValue="TODOS"
            options={[
              { value: 'TODOS', label: 'Todos los Movimientos' },
              { value: 'EGRESO', label: 'Solo EGRESOS' },
              { value: 'INGRESO', label: 'Solo INGRESOS' },
            ]}
            value={tipoFilter}
            onChange={(val) => setTipoFilter(val || 'TODOS')}
            placeholder="Todos los Movimientos"
            searchPlaceholder="Buscar movimiento..."
          />
        </div>

        {/* Clasificacion filter (SearchableSelect) */}
        <div>
          <SearchableSelect
            compact
            clearValue="TODOS"
            options={[
              { value: 'TODOS', label: 'Todas las Clasificaciones' },
              ...allClasificaciones.map((c) => ({ value: c, label: c })),
            ]}
            value={clasificacionFilter}
            onChange={(val) => setClasificacionFilter(val || 'TODOS')}
            placeholder="Clasificaciones..."
            searchPlaceholder="Buscar clasificación..."
          />
        </div>

        {/* Combustible filter (SearchableSelect) */}
        <div>
          <SearchableSelect
            compact
            clearValue="TODOS"
            options={[
              { value: 'TODOS', label: 'Todos los Combustibles' },
              ...allFuels.map((f) => ({ value: f, label: f })),
            ]}
            value={combustibleFilter}
            onChange={(val) => setCombustibleFilter(val || 'TODOS')}
            placeholder="Combustibles..."
            searchPlaceholder="Buscar combustible..."
          />
        </div>

        {/* Deposito filter (SearchableSelect) */}
        <div>
          <SearchableSelect
            compact
            clearValue="TODOS"
            options={[
              { value: 'TODOS', label: 'Todos los Depósitos' },
              ...allDepositos.map((d) => ({ value: d, label: d })),
            ]}
            value={depositoFilter}
            onChange={(val) => setDepositoFilter(val || 'TODOS')}
            placeholder="Depósitos..."
            searchPlaceholder="Buscar depósito o estación..."
          />
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-[#12151B] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap border-collapse">
            <thead>
              <tr className={`bg-[#181C24] text-slate-400 border-b border-slate-800 font-mono ${densityCfg.headerFontSize} uppercase tracking-wider select-none`}>
                {/* Dynamic Reorderable Columns */}
                {columnConfig.order.map((colKey) => renderHeaderCell(colKey))}

                {/* Acciones Column (Fixed) */}
                <th className={`${densityCfg.thPadding} font-bold text-right sticky right-0 z-20 bg-[#181C24] border-l border-slate-800`}>
                  ACCIONES
                </th>
              </tr>
            </thead>

            <tbody className={`divide-y divide-slate-800/60 font-sans ${densityCfg.fontSize}`}>
              {filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={visibleCount + 1} className="px-6 py-12 text-center text-slate-500">
                    <Fuel className="w-10 h-10 mx-auto text-slate-700 mb-2" />
                    <p className="text-sm font-medium text-slate-400">No se encontraron registros de expendio</p>
                    <p className="text-xs text-slate-600 mt-1">Prueba ajustando los términos de búsqueda o filtros</p>
                  </td>
                </tr>
              ) : (
                sortedDateKeys.map((dateKey) => {
                  const dateVouchers = groupedVouchers[dateKey];
                  const displayDateText = formatDisplayDate(dateKey);

                  return (
                    <React.Fragment key={dateKey}>
                      {/* Date Group Header Row */}
                      {groupByDate && dateKey !== 'TODOS' && (
                        <tr 
                          onClick={handleToggleDateSort}
                          className="bg-[#161922] hover:bg-[#1C202B] border-y border-slate-800/80 cursor-pointer transition select-none group"
                          title="Hacer clic para alternar orden de fechas (Más recientes ⇄ Más antiguos)"
                        >
                          <td colSpan={visibleCount + 1} className="px-4 py-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-amber-400 group-hover:scale-110 transition" />
                                <span className="font-bold text-slate-100 text-sm tracking-wide group-hover:text-amber-300 transition">
                                  {displayDateText}
                                </span>
                                <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-800/90 text-[10px] font-mono text-slate-300 font-bold border border-slate-700">
                                  {dateVouchers.length} {dateVouchers.length === 1 ? 'despacho' : 'despachos'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 group-hover:text-amber-400 font-medium transition">
                                <span>{sortField === 'fecha' && sortDirection === 'asc' ? 'Orden: Antiguos primero' : 'Orden: Recientes primero'}</span>
                                {sortField === 'fecha' && sortDirection === 'asc' ? (
                                  <ArrowUp className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                                ) : (
                                  <ArrowDown className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Items for this Date */}
                      {dateVouchers.map((v) => {
                        return (
                          <tr
                            key={v.id}
                            onClick={() => onViewDetails(v)}
                            className="hover:bg-slate-800/50 transition-colors group cursor-pointer border-b border-slate-800/40"
                          >
                            {/* Dynamic cells */}
                            {columnConfig.order.map((colKey) => renderBodyCell(colKey, v))}

                            {/* Acciones Column */}
                            <td 
                              className={`${densityCfg.tdPadding} text-right sticky right-0 z-10 bg-[#12151B] group-hover:bg-[#1A1E27] border-l border-slate-800/80`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className={`flex items-center justify-end ${densityCfg.gap}`}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const linkedVoucher = getLinkedIssuedVoucher(v);
                                    setSelectedIssuedVoucherForPopup(linkedVoucher);
                                    onViewIssuedVoucher?.(linkedVoucher);
                                  }}
                                  className={`${densityCfg.btnPadding} text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition cursor-pointer`}
                                  title={`Ver Vale Nº ${v.numOrden || 'vinculado'} en Popup`}
                                >
                                  <Ticket className={densityCfg.iconSize} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onViewDetails(v);
                                  }}
                                  className={`${densityCfg.btnPadding} text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition cursor-pointer`}
                                  title="Ver Ficha y Ticket"
                                >
                                  <Eye className={densityCfg.iconSize} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditVoucher(v);
                                  }}
                                  className={`${densityCfg.btnPadding} text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition cursor-pointer`}
                                  title="Editar Expendio"
                                >
                                  <Edit3 className={densityCfg.iconSize} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteVoucher(v.id);
                                  }}
                                  className={`${densityCfg.btnPadding} text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition cursor-pointer`}
                                  title="Eliminar Expendio"
                                >
                                  <Trash2 className={densityCfg.iconSize} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Column Manager Modal */}
      <ColumnManagerModal<FuelVoucherColumnKey>
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        columnDefinitions={FUEL_VOUCHER_COLUMNS}
        columnConfig={columnConfig}
        onSaveConfig={handleSaveColumnConfig}
        onResetDefaults={handleResetColumnDefaults}
        title="Personalizar Columnas de Expendio de Combustible"
        subtitle="Selecciona qué columnas visualizar y ordénalas según tu flujo operativo."
      />

      {/* Photo Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="bg-[#16191F] border border-slate-700/80 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-black/40">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-amber-400" />
                  <span>{previewImage.title}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{previewImage.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-black/60 flex items-center justify-center overflow-auto flex-1 min-h-[300px]">
              <img
                src={previewImage.url}
                alt="Vista Previa"
                className="max-h-[65vh] w-auto rounded-lg object-contain border border-slate-800 shadow-lg"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="p-3 border-t border-slate-800 bg-[#12151B] flex items-center justify-between">
              <span className="text-xs text-slate-500 font-mono">Comprobante Digital Verificado</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Linked Issued Fuel Voucher Modal Popup */}
      <IssuedVoucherDetailModal
        isOpen={Boolean(selectedIssuedVoucherForPopup)}
        voucher={selectedIssuedVoucherForPopup}
        fleet={fleet}
        employees={employees}
        onClose={() => setSelectedIssuedVoucherForPopup(null)}
        onProceedToRendicion={(voucher) => {
          setSelectedIssuedVoucherForPopup(null);
          onRendirVale?.(voucher);
        }}
        onViewExpendio={(expId) => {
          setSelectedIssuedVoucherForPopup(null);
          const found = vouchers.find(fv => fv.id === expId);
          if (found) {
            onViewDetails(found);
          }
        }}
      />
    </div>
  );
};
