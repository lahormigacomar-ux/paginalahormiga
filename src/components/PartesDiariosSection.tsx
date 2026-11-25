import React, { useState, useMemo } from 'react';
import { ParteDiario, Vehicle, Employee, Obra, ObraDuracionCategoria, TableDensity, TableColumnConfig, RentalContract, ArcaInvoice, FuelDispensary } from '../types';
import { ParteDiarioColumnKey, PARTE_DIARIO_COLUMNS } from '../data/tableColumns';
import { loadParteDiarioColumnConfig, saveParteDiarioColumnConfig } from '../services/storage';
import { ColumnManagerModal } from './ColumnManagerModal';
import { TableDensitySelector } from './TableDensitySelector';
import { SearchableSelect } from './SearchableSelect';
import { DENSITY_CONFIG, getSavedTableDensity, saveTableDensity } from '../utils/densityStyles';
import { resolveParteDiarioLinks, resolveRentalContractLinks, formatInvoiceLabel, formatInvoiceNumber, isExternalMigratedInvoice } from '../utils/crossLinks';
import { buildPartesKilometrajeCrossMap, formatCrossDateDDMMYYYY, ParteKilometrajeCrossInfo } from '../utils/parteKilometrajeCross';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  FileSpreadsheet, 
  CheckCircle2, 
  Clock3, 
  Edit3,
  Trash2,
  Wrench,
  Users,
  Calendar,
  Fuel,
  Sparkles,
  MapPin,
  Eye,
  ShieldCheck,
  Truck,
  UploadCloud,
  SlidersHorizontal,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RotateCcw,
  Link2,
  Receipt,
  FileCheck2,
  X
} from 'lucide-react';

interface PartesDiariosSectionProps {
  partes: ParteDiario[];
  fleet: Vehicle[];
  employees: Employee[];
  obras?: Obra[];
  rentals?: RentalContract[];
  arcaInvoices?: ArcaInvoice[];
  fuelVouchers?: FuelDispensary[];
  onUpdatePartesBatch?: (partes: ParteDiario[]) => void;
  onNavigateToCobranzas?: () => void;
  density?: TableDensity;
  onChangeDensity?: (density: TableDensity) => void;
  onOpenCreateModal: () => void;
  onViewDetails: (parte: ParteDiario) => void;
  onEditParte: (parte: ParteDiario) => void;
  onDeleteParte: (id: string) => void;
  onDeleteSelectedPartes?: (ids: string[]) => void;
  onExportCSV: () => void;
  onOpenImportExport?: () => void;
  onOpenGoogleSheet?: () => void;
  googleSheetLinkedLabel?: string;
  onResetPartesDiarios?: () => void;
  onClearAllPartesDiarios?: () => void;
  onViewVehicle?: (codigoEquipo: string, marcaModelo: string) => void;
  onViewEmployee?: (codigoEmpleado: string, nombreApellido: string) => void;
  onViewObra?: (obraNombre: string, codigoObra: string) => void;
}

type SortKey = 'fecha' | 'numParte' | 'codigoEquipo' | 'nombreApellido' | 'obra' | 'tipo';

export const PartesDiariosSection: React.FC<PartesDiariosSectionProps> = ({
  partes,
  fleet,
  employees,
  obras = [],
  rentals = [],
  arcaInvoices = [],
  fuelVouchers = [],
  onUpdatePartesBatch,
  onNavigateToCobranzas,
  density,
  onChangeDensity,
  onOpenCreateModal,
  onViewDetails,
  onEditParte,
  onDeleteParte,
  onDeleteSelectedPartes,
  onExportCSV,
  onOpenImportExport,
  onOpenGoogleSheet,
  googleSheetLinkedLabel,
  onResetPartesDiarios,
  onClearAllPartesDiarios,
  onViewVehicle,
  onViewEmployee,
  onViewObra,
}) => {
  const [localDensity, setLocalDensity] = useState<TableDensity>(() => getSavedTableDensity());
  const activeDensity = density || localDensity;

  const handleDensityChange = (d: TableDensity) => {
    setLocalDensity(d);
    saveTableDensity(d);
    if (onChangeDensity) onChangeDensity(d);
  };

  const densityCfg = DENSITY_CONFIG[activeDensity];

  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('TODOS');
  const [equiposSelected, setEquiposSelected] = useState<string[]>([]);
  const [operadorFilter, setOperadorFilter] = useState<string>('TODOS');
  const [obraFilter, setObraFilter] = useState<string>('TODOS');
  const [categoriaObraFilter, setCategoriaObraFilter] = useState<'TODOS' | ObraDuracionCategoria>('TODOS');
  const [servMantFilter, setServMantFilter] = useState<string>('TODOS');
  const [operacionMatFilter, setOperacionMatFilter] = useState<string>('TODOS');
  const [materialFilter, setMaterialFilter] = useState<string>('TODOS');
  const [mesFilter, setMesFilter] = useState<string>('TODOS');
  const [vinculoFilter, setVinculoFilter] = useState<'TODOS' | 'VINCULADOS' | 'CON_CONTRATO' | 'CON_FACTURA' | 'PAGADOS' | 'SIN_VINCULAR'>('TODOS');
  const [sortField, setSortField] = useState<SortKey>('fecha');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Modal para vincular 1 o múltiples Partes Diarios a un Contrato de Alquiler y/o Factura ARCA
  const [linkModalTargetIds, setLinkModalTargetIds] = useState<string[]>([]);
  const [linkModalRentalId, setLinkModalRentalId] = useState<string>('');
  const [linkModalFacturaId, setLinkModalFacturaId] = useState<string>('');

  // Column configuration & Date Grouping state
  const [columnConfig, setColumnConfig] = useState<TableColumnConfig<ParteDiarioColumnKey>>(() => loadParteDiarioColumnConfig());
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [groupByDate, setGroupByDate] = useState<boolean>(true);

  const handleSaveColumnConfig = (newConfig: TableColumnConfig<ParteDiarioColumnKey>) => {
    setColumnConfig(newConfig);
    saveParteDiarioColumnConfig(newConfig);
    setIsColumnModalOpen(false);
  };

  const visibleColumnsCount = useMemo(() => {
    return columnConfig.order.filter(k => columnConfig.visible[k]).length;
  }, [columnConfig]);

  const handleSort = (field: SortKey) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Stats calculations
  const stats = useMemo(() => {
    const totalPartes = partes.length;
    const horasTotales = partes.reduce((sum, p) => sum + (p.horasTrabajadas || p.hsCantidad || 0), 0);
    const viajesTotales = partes.reduce((sum, p) => sum + (p.viajesCantidad || p.cantidad || 0), 0);
    const controlados = partes.filter(p => p.autorizado === 'CONTROLADO' || p.autorizado === 'AUTORIZADO').length;
    const noControlados = partes.filter(p => p.autorizado === 'NO CONTROLADO').length;
    return { totalPartes, horasTotales, viajesTotales, controlados, noControlados };
  }, [partes]);

  const kilometrajeCrossMap = useMemo(
    () => buildPartesKilometrajeCrossMap(partes, fuelVouchers, fleet),
    [partes, fuelVouchers, fleet]
  );

  const buildCrossTooltip = (cross?: ParteKilometrajeCrossInfo): string => {
    if (!cross) return 'Sin datos de combustible vinculados';
    if (cross.status === 'NO_FUEL_DATA') {
      return 'Sin cargas de combustible con kilometraje/horómetro registradas para este equipo';
    }
    if (cross.status === 'PENDING_NEXT_LOAD') {
      return `Última carga: ${formatCrossDateDDMMYYYY(cross.prevLoadDate)} (${(cross.prevLoadReading || 0).toLocaleString('es-AR')} ${cross.unit}). Pendiente próxima carga de combustible para prorratear este tramo.`;
    }
    const parts: string[] = [];
    if (cross.prevLoadDate && cross.prevLoadReading !== undefined) {
      parts.push(`Carga ant.: ${formatCrossDateDDMMYYYY(cross.prevLoadDate)} (${cross.prevLoadReading.toLocaleString('es-AR')} ${cross.unit})`);
    }
    if (cross.nextLoadDate && cross.nextLoadReading !== undefined) {
      parts.push(`Carga tramo: ${formatCrossDateDDMMYYYY(cross.nextLoadDate)} (${cross.nextLoadReading.toLocaleString('es-AR')} ${cross.unit})`);
    }
    if (cross.tramoDelta !== undefined) {
      parts.push(`Avance tramo: +${cross.tramoDelta.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${cross.unit} en ${cross.tramoPartesCount || 1} parte(s) / ${cross.tramoDiasTrabajo || 1} día(s) (${(cross.tramoHorasPartes || 0).toFixed(1)} hs parte)`);
    }
    if (cross.unit === 'hs' && cross.diferenciaHoras !== undefined) {
      const sign = cross.diferenciaHoras > 0 ? '+' : '';
      const label = cross.coincidencia === 'COINCIDE' ? 'Coincide' : cross.coincidencia === 'DESVIO_LEVE' ? 'Desvío leve' : 'Desfasaje';
      parts.push(`Cruce Horómetro vs Horas Parte: ${label} (${sign}${cross.diferenciaHoras} hs)`);
    } else if (cross.kmPorHora !== undefined) {
      parts.push(`Promedio tramo: ${cross.kmPorHora} km/h (${cross.kmPorDia ?? '-'} km/día)`);
    }
    if (cross.tramoLitros) {
      parts.push(`Combustible cargado: ${cross.tramoLitros.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L`);
    }
    if (cross.status === 'ANOMALY') {
      parts.push('Atención: la lectura de carga resultó menor a la anterior');
    }
    return parts.join(' • ');
  };

  // Helper to normalize and format dates robustly (handles 4/9/2026, 2026-09-04, etc. identically)
  const normalizeDateKey = (dateStr?: string): { key: string; display: string; weekday: string } => {
    if (!dateStr || !dateStr.trim() || dateStr === 'Sin Fecha' || dateStr.toLowerCase() === 'invalid date') {
      return { key: 'sin-fecha', display: 'Sin Fecha', weekday: '' };
    }
    const trimmed = dateStr.trim();
    const SPANISH_WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

    const buildNormalized = (year: number, month: number, day: number) => {
      if (isNaN(day) || isNaN(month) || isNaN(year) || month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
      }
      const fullYear = year < 100 ? 2000 + year : year;
      const dateObj = new Date(fullYear, month - 1, day);
      if (
        dateObj.getFullYear() !== fullYear ||
        dateObj.getMonth() !== month - 1 ||
        dateObj.getDate() !== day
      ) {
        return null;
      }
      const dd = day.toString().padStart(2, '0');
      const mm = month.toString().padStart(2, '0');
      return {
        key: `${fullYear}-${mm}-${dd}`,
        display: `${dd}/${mm}/${fullYear}`,
        weekday: SPANISH_WEEKDAYS[dateObj.getDay()],
      };
    };

    // If YYYY-MM-DD (with optional time component)
    const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(trimmed);
    if (isoMatch) {
      const normalized = buildNormalized(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10), parseInt(isoMatch[3], 10));
      if (normalized) return normalized;
    }

    // If D/M/YYYY or DD/MM/YYYY
    const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
    if (slashMatch) {
      const normalized = buildNormalized(parseInt(slashMatch[3], 10), parseInt(slashMatch[2], 10), parseInt(slashMatch[1], 10));
      if (normalized) return normalized;
    }

    // If D-M-YYYY or DD-MM-YYYY
    const dashMatch = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/.exec(trimmed);
    if (dashMatch) {
      const normalized = buildNormalized(parseInt(dashMatch[3], 10), parseInt(dashMatch[2], 10), parseInt(dashMatch[1], 10));
      if (normalized) return normalized;
    }

    const parsedDate = new Date(trimmed);
    if (!isNaN(parsedDate.getTime())) {
      const normalized = buildNormalized(parsedDate.getFullYear(), parsedDate.getMonth() + 1, parsedDate.getDate());
      if (normalized) return normalized;
    }

    return { key: trimmed.toLowerCase(), display: trimmed, weekday: '' };
  };

  const parseDateToTimestamp = (dateStr?: string): number => {
    if (!dateStr || !dateStr.trim() || dateStr === 'Sin Fecha') return Number.MAX_SAFE_INTEGER;
    const { key } = normalizeDateKey(dateStr);
    if (key === 'sin-fecha') return Number.MAX_SAFE_INTEGER;
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (isoMatch) {
      return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])).getTime();
    }
    const time = new Date(key).getTime();
    return isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
  };

  // Searchable Dropdown Option Lists
  const equipoFilterOptions = useMemo(() => {
    const map = new Map<string, { label: string; subtitle?: string }>();
    fleet.forEach(v => {
      const code = String(v.codigoEquipo || v.codigo || v.id || '').trim();
      const name = String(v.modeloMarca || code).trim();
      if (name) {
        map.set(name.toUpperCase(), {
          label: name,
          subtitle: code ? `Cód: ${code}${v.patente ? ` • ${v.patente}` : ''}` : undefined,
        });
      }
    });
    partes.forEach(p => {
      const name = String(p.marcaModelo || p.codigoEquipo || '').trim();
      if (name && !map.has(name.toUpperCase())) {
        map.set(name.toUpperCase(), {
          label: name,
          subtitle: p.codigoEquipo ? `Cód: ${p.codigoEquipo}` : undefined,
        });
      }
    });
    return [
      { value: 'TODOS', label: 'Todos los Equipos' },
      ...Array.from(map.entries())
        .map(([val, meta]) => ({ value: val, label: meta.label, subtitle: meta.subtitle }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [fleet, partes]);

  const operadorFilterOptions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => {
      if (e.nombreApellido?.trim()) set.add(e.nombreApellido.trim());
    });
    partes.forEach(p => {
      if (p.nombreApellido?.trim()) set.add(p.nombreApellido.trim());
    });
    return [
      { value: 'TODOS', label: 'Todos los Operadores' },
      ...Array.from(set)
        .sort((a, b) => a.localeCompare(b))
        .map(name => ({ value: name.toUpperCase(), label: name })),
    ];
  }, [employees, partes]);

  const obraFilterOptions = useMemo(() => {
    const set = new Set<string>();
    obras.forEach(o => {
      if (o.nombreObra?.trim()) set.add(o.nombreObra.trim());
    });
    partes.forEach(p => {
      if (p.obra?.trim()) set.add(p.obra.trim());
    });
    return [
      { value: 'TODOS', label: 'Todas las Obras' },
      ...Array.from(set)
        .sort((a, b) => a.localeCompare(b))
        .map(name => ({ value: name.toUpperCase(), label: name })),
    ];
  }, [obras, partes]);

  const servMantFilterOptions = useMemo(() => {
    const set = new Set<string>(['ALQUILER', 'TRASLADO DE MAQUINA', 'MANTENIMIENTO']);
    partes.forEach(p => {
      if (p.servMant?.trim()) set.add(p.servMant.trim().toUpperCase());
    });
    return [
      { value: 'TODOS', label: 'Todos los Servicios' },
      ...Array.from(set)
        .sort((a, b) => a.localeCompare(b))
        .map(s => ({ value: s, label: s })),
    ];
  }, [partes]);

  const materialFilterOptions = useMemo(() => {
    const set = new Set<string>();
    partes.forEach(p => {
      if (p.tipoMaterial?.trim()) set.add(p.tipoMaterial.trim());
    });
    return [
      { value: 'TODOS', label: 'Todos los Materiales' },
      ...Array.from(set)
        .sort((a, b) => a.localeCompare(b))
        .map(m => ({ value: m.toUpperCase(), label: m })),
    ];
  }, [partes]);

  const mesFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    partes.forEach(p => {
      const { key } = normalizeDateKey(p.fecha);
      if (key && key !== 'sin-fecha' && /^\d{4}-\d{2}/.test(key)) {
        const ym = key.slice(0, 7);
        counts.set(ym, (counts.get(ym) || 0) + 1);
      }
    });
    return [
      { value: 'TODOS', label: 'Todos los Meses' },
      ...Array.from(counts.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([ym, cnt]) => ({ value: ym, label: `${ym} (${cnt})` })),
    ];
  }, [partes]);

  const { obraCategoriaByNombre, obraByNombre, obraByNumero } = useMemo(() => {
    const catMap = new Map<string, ObraDuracionCategoria>();
    const nameMap = new Map<string, Obra>();
    const numMap = new Map<string, Obra>();
    obras.forEach(o => {
      const nNom = (o.nombreObra || '').trim().toUpperCase();
      const nNum = (o.numero || '').trim().toUpperCase();
      if (nNom) {
        catMap.set(nNom, o.categoriaDuracion || 'LARGA');
        nameMap.set(nNom, o);
      }
      if (nNum && nNum !== 'ESPORADICA' && nNum !== 'ESP' && nNum !== 'CORTA') {
        numMap.set(nNum, o);
      }
    });
    return { obraCategoriaByNombre: catMap, obraByNombre: nameMap, obraByNumero: numMap };
  }, [obras]);

  const IGNORED_OWNER_NAMES = new Set([
    '',
    '-',
    'N/A',
    'SIN ASIGNAR',
    'EMPRESA PRINCIPAL',
    'OBRA ESPORADICA / DIRECTA',
    'OBRA ESPORÁDICA / DIRECTA',
  ]);

  const resolveParteObraOwner = (p: ParteDiario): string | null => {
    const directCliente = (p.clienteNombre || '').trim();
    if (directCliente && !IGNORED_OWNER_NAMES.has(directCliente.toUpperCase())) {
      return directCliente;
    }
    const matchedObra =
      obraByNombre.get((p.obra || '').trim().toUpperCase()) ||
      obraByNumero.get((p.codigoObra || '').trim().toUpperCase());
    if (matchedObra) {
      const oCliente = (matchedObra.clienteNombre || '').trim();
      if (oCliente && !IGNORED_OWNER_NAMES.has(oCliente.toUpperCase())) {
        return oCliente;
      }
      const oPertenece = (matchedObra.pertenece || '').trim();
      if (oPertenece && !IGNORED_OWNER_NAMES.has(oPertenece.toUpperCase())) {
        return oPertenece;
      }
    }
    const links = resolveParteDiarioLinks(p, rentals, arcaInvoices);
    const rentalCliente = (links.rental?.clienteNombre || '').trim();
    if (rentalCliente && !IGNORED_OWNER_NAMES.has(rentalCliente.toUpperCase())) {
      return rentalCliente;
    }
    const invCliente = (
      links.invoice?.razonSocialReceptor ||
      links.invoice?.receptorRazonSocial ||
      ''
    ).trim();
    if (invCliente && !IGNORED_OWNER_NAMES.has(invCliente.toUpperCase())) {
      return invCliente;
    }
    return null;
  };

  const getParteCategoriaObra = (p: ParteDiario): ObraDuracionCategoria => {
    if (p.esObraEsporadica || p.codigoObra === 'ESPORADICA' || p.categoriaObra === 'ESPORADICA') {
      return 'ESPORADICA';
    }
    if (p.categoriaObra) return p.categoriaObra;
    const fromObra = obraCategoriaByNombre.get((p.obra || '').trim().toUpperCase());
    if (fromObra) return fromObra;
    return 'LARGA';
  };

  const hasAnyFilter = Boolean(
    searchTerm ||
      tipoFilter !== 'TODOS' ||
      vinculoFilter !== 'TODOS' ||
      equiposSelected.length > 0 ||
      operadorFilter !== 'TODOS' ||
      obraFilter !== 'TODOS' ||
      categoriaObraFilter !== 'TODOS' ||
      servMantFilter !== 'TODOS' ||
      operacionMatFilter !== 'TODOS' ||
      materialFilter !== 'TODOS' ||
      mesFilter !== 'TODOS'
  );

  const resetAllFilters = () => {
    setSearchTerm('');
    setTipoFilter('TODOS');
    setVinculoFilter('TODOS');
    setEquiposSelected([]);
    setOperadorFilter('TODOS');
    setObraFilter('TODOS');
    setCategoriaObraFilter('TODOS');
    setServMantFilter('TODOS');
    setOperacionMatFilter('TODOS');
    setMaterialFilter('TODOS');
    setMesFilter('TODOS');
    setCurrentPage(1);
  };

  // Resolved link map for fast access
  const resolvedLinksByParteId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveParteDiarioLinks>>();
    partes.forEach(p => {
      map.set(p.id, resolveParteDiarioLinks(p, rentals, arcaInvoices));
    });
    return map;
  }, [partes, rentals, arcaInvoices]);

  const linkStats = useMemo(() => {
    let vinculados = 0;
    let conContrato = 0;
    let conFactura = 0;
    let pagados = 0;
    partes.forEach(p => {
      const r = resolvedLinksByParteId.get(p.id);
      if (r?.isLinked) vinculados++;
      if (r?.rentalNumero) conContrato++;
      if (r?.facturaNumero) conFactura++;
      if (r?.estadoCobro === 'PAGADO') pagados++;
    });
    return { vinculados, conContrato, conFactura, pagados, sinVincular: partes.length - vinculados };
  }, [partes, resolvedLinksByParteId]);

  const openLinkModalForIds = (ids: string[]) => {
    if (ids.length === 0) return;
    setLinkModalTargetIds(ids);
    if (ids.length === 1) {
      const p = partes.find(x => x.id === ids[0]);
      const r = p ? resolvedLinksByParteId.get(p.id) : undefined;
      setLinkModalRentalId(p?.rentalId || r?.linkedRental?.id || '');
      setLinkModalFacturaId(p?.facturaId || r?.linkedInvoice?.id || '');
    } else {
      setLinkModalRentalId('');
      setLinkModalFacturaId('');
    }
  };

  const getInheritedInvoiceForRental = (rentalIdValue: string): ArcaInvoice | null => {
    if (!rentalIdValue) return null;
    const targetRental = rentals.find(r => r.id === rentalIdValue);
    if (!targetRental) return null;
    const rentalLinks = resolveRentalContractLinks(targetRental, partes, arcaInvoices);
    return rentalLinks.primaryInvoice || null;
  };

  const handleConfirmBatchLink = () => {
    if (!onUpdatePartesBatch || linkModalTargetIds.length === 0) {
      setLinkModalTargetIds([]);
      return;
    }
    const targetRental = rentals.find(r => r.id === linkModalRentalId);
    const explicitInvoice = arcaInvoices.find(inv => inv.id === linkModalFacturaId);
    const inheritedInvoice = !explicitInvoice && targetRental ? getInheritedInvoiceForRental(targetRental.id) : null;
    const targetInvoice = explicitInvoice || inheritedInvoice;
    const targetRentalNum = targetRental ? (targetRental.numeroContrato || targetRental.numero) : undefined;
    const targetFacturaNum = targetInvoice ? formatInvoiceNumber(targetInvoice) : (targetRental?.facturaNumero || undefined);

    const updatedList: ParteDiario[] = [];
    linkModalTargetIds.forEach(id => {
      const existing = partes.find(p => p.id === id);
      if (!existing) return;
      updatedList.push({
        ...existing,
        rentalId: linkModalRentalId ? linkModalRentalId : undefined,
        rentalNumero: targetRentalNum,
        facturaId: targetInvoice ? targetInvoice.id : (targetRental?.facturaId || undefined),
        facturaNumero: targetFacturaNum,
        estadoCobro: targetInvoice?.estadoCobro === 'PAGADO'
          ? 'PAGADO'
          : targetRental?.estadoCobro === 'PAGADO'
          ? 'PAGADO'
          : targetFacturaNum
          ? 'FACTURADO'
          : existing.estadoCobro,
      });
    });

    onUpdatePartesBatch(updatedList);
    setLinkModalTargetIds([]);
    setSelectedIds([]);
  };

  // Filter & sort
  const filteredPartes = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return partes.filter(p => {
      const rLinks = resolvedLinksByParteId.get(p.id);
      const matchSearch =
        !q ||
        (p.codigoEquipo || '').toLowerCase().includes(q) ||
        (p.marcaModelo || '').toLowerCase().includes(q) ||
        (p.nombreApellido || '').toLowerCase().includes(q) ||
        (p.obra || '').toLowerCase().includes(q) ||
        (p.detalleTipo || '').toLowerCase().includes(q) ||
        (p.detalle2 || '').toLowerCase().includes(q) ||
        (p.tipoMaterial || '').toLowerCase().includes(q) ||
        (p.extraccionEntregas || '').toLowerCase().includes(q) ||
        (p.viajesDetalle || []).some(
          (l) =>
            (l.tipoMaterial || '').toLowerCase().includes(q) ||
            (l.extraccionEntregas || '').toLowerCase().includes(q) ||
            (l.observacion || '').toLowerCase().includes(q)
        ) ||
        (p.numParte || '').toLowerCase().includes(q) ||
        (p.clienteNombre || '').toLowerCase().includes(q) ||
        (p.clienteCuit || '').toLowerCase().includes(q) ||
        (rLinks?.rentalNumero || '').toLowerCase().includes(q) ||
        (rLinks?.facturaNumero || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q);

      const matchTipo = tipoFilter === 'TODOS' || p.tipo === tipoFilter;
      const matchEquipo =
        equiposSelected.length === 0 ||
        equiposSelected.includes((p.marcaModelo || '').trim().toUpperCase()) ||
        equiposSelected.includes((p.codigoEquipo || '').trim().toUpperCase());
      const matchOperador =
        operadorFilter === 'TODOS' ||
        (p.nombreApellido || '').trim().toUpperCase() === operadorFilter;
      const matchObra =
        obraFilter === 'TODOS' ||
        (p.obra || '').trim().toUpperCase() === obraFilter;
      const matchCategoriaObra =
        categoriaObraFilter === 'TODOS' ||
        getParteCategoriaObra(p) === categoriaObraFilter;
      const matchServ =
        servMantFilter === 'TODOS' ||
        (p.servMant || '').trim().toUpperCase() === servMantFilter;
      const matchMat =
        materialFilter === 'TODOS' ||
        (p.tipoMaterial || '').trim().toUpperCase() === materialFilter ||
        (p.viajesDetalle || []).some((l) => (l.tipoMaterial || '').trim().toUpperCase() === materialFilter);
      const matchOperacion =
        operacionMatFilter === 'TODOS' ||
        (operacionMatFilter === 'ENTREGA' &&
          (p.tipoOperacionMaterial === 'ENTREGA_MATERIAL' ||
            (p.extraccionEntregas || '').toUpperCase().includes('ENTREGA') ||
            (p.viajesDetalle || []).some((l) => (l.extraccionEntregas || '').toUpperCase().includes('ENTREGA')))) ||
        (operacionMatFilter === 'RETIRO' &&
          (p.tipoOperacionMaterial === 'RETIRO_MATERIAL' ||
            (p.extraccionEntregas || '').toUpperCase().includes('RETIRO') ||
            (p.viajesDetalle || []).some((l) => (l.extraccionEntregas || '').toUpperCase().includes('RETIRO')))) ||
        (operacionMatFilter === 'EXTRACCION' &&
          (p.tipoOperacionMaterial === 'EXTRACCION' ||
            (p.extraccionEntregas || '').toUpperCase().includes('EXTRAC') ||
            (p.viajesDetalle || []).some((l) => (l.extraccionEntregas || '').toUpperCase().includes('EXTRAC')))) ||
        (operacionMatFilter === 'SOLO_FLETE' &&
          (p.tipoOperacionMaterial === 'SOLO_FLETE' ||
            (p.extraccionEntregas || '').toUpperCase().includes('FLETE') ||
            (p.viajesDetalle || []).some((l) => (l.extraccionEntregas || '').toUpperCase().includes('FLETE'))));
      const matchMes =
        mesFilter === 'TODOS' ||
        normalizeDateKey(p.fecha).key.startsWith(mesFilter);

      const matchVinculo =
        vinculoFilter === 'TODOS' ||
        (vinculoFilter === 'VINCULADOS' && Boolean(rLinks?.isLinked)) ||
        (vinculoFilter === 'CON_CONTRATO' && Boolean(rLinks?.rentalNumero)) ||
        (vinculoFilter === 'CON_FACTURA' && Boolean(rLinks?.facturaNumero)) ||
        (vinculoFilter === 'PAGADOS' && rLinks?.estadoCobro === 'PAGADO') ||
        (vinculoFilter === 'SIN_VINCULAR' && !rLinks?.isLinked);

      return (
        matchSearch &&
        matchTipo &&
        matchVinculo &&
        matchEquipo &&
        matchOperador &&
        matchObra &&
        matchCategoriaObra &&
        matchServ &&
        matchMat &&
        matchOperacion &&
        matchMes
      );
    }).sort((a, b) => {
      if (sortField === 'fecha') {
        const aTime = parseDateToTimestamp(a.fecha);
        const bTime = parseDateToTimestamp(b.fecha);
        if (aTime !== bTime) {
          return sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
        }
        return (a.numParte || '').localeCompare(b.numParte || '');
      }

      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [
    partes,
    resolvedLinksByParteId,
    obraCategoriaByNombre,
    searchTerm,
    tipoFilter,
    vinculoFilter,
    equiposSelected,
    operadorFilter,
    obraFilter,
    categoriaObraFilter,
    servMantFilter,
    operacionMatFilter,
    materialFilter,
    mesFilter,
    sortField,
    sortDirection,
  ]);

  // Paginated slice
  const totalPages = Math.ceil(filteredPartes.length / pageSize) || 1;
  const paginatedPartes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPartes.slice(start, start + pageSize);
  }, [filteredPartes, currentPage, pageSize]);

  const filteredCrossSummary = useMemo(() => {
    let totalHoras = 0;
    let totalKms = 0;
    let totalHsMaquina = 0;
    let partesConCruce = 0;
    let partesHsCoinciden = 0;
    let partesHsDesfasaje = 0;

    filteredPartes.forEach((p) => {
      totalHoras += Number(p.horasTrabajadas || p.hsCantidad || 0);
      const cross = kilometrajeCrossMap.get(p.id);
      if (cross && cross.kmProrrateadoDia !== undefined) {
        partesConCruce += 1;
        if (cross.unit === 'km') {
          totalKms += cross.kmProrrateadoDia;
        } else {
          totalHsMaquina += cross.kmProrrateadoDia;
          if (cross.coincidencia === 'COINCIDE') partesHsCoinciden += 1;
          else if (cross.coincidencia === 'DESFASAJE' || cross.coincidencia === 'DESVIO_LEVE') partesHsDesfasaje += 1;
        }
      }
    });

    return {
      totalHoras,
      totalKms,
      totalHsMaquina,
      partesConCruce,
      partesHsCoinciden,
      partesHsDesfasaje,
    };
  }, [filteredPartes, kilometrajeCrossMap]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const allFilteredIds = useMemo(() => filteredPartes.map(p => p.id), [filteredPartes]);

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === allFilteredIds.length && allFilteredIds.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allFilteredIds);
    }
  };

  // Grouped by normalized date if groupByDate is true
  const groupedPartes = useMemo(() => {
    if (!groupByDate) {
      return [{ date: 'Todos los Registros', weekday: '', items: paginatedPartes }];
    }

    const groupsMap = new Map<string, { displayDate: string; weekday: string; items: ParteDiario[] }>();
    paginatedPartes.forEach(p => {
      const rawDate = p.fecha || 'Sin Fecha';
      const { key, display, weekday } = normalizeDateKey(rawDate);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, { displayDate: display, weekday, items: [] });
      }
      groupsMap.get(key)!.items.push(p);
    });

    const result: { date: string; weekday: string; items: ParteDiario[] }[] = [];
    groupsMap.forEach((val) => {
      result.push({ date: val.displayDate, weekday: val.weekday, items: val.items });
    });

    result.sort((a, b) => {
      const aInvalid = a.date === 'Sin Fecha' || a.date === 'sin-fecha' || parseDateToTimestamp(a.date) === Number.MAX_SAFE_INTEGER;
      const bInvalid = b.date === 'Sin Fecha' || b.date === 'sin-fecha' || parseDateToTimestamp(b.date) === Number.MAX_SAFE_INTEGER;
      if (aInvalid && !bInvalid) return 1;
      if (!aInvalid && bInvalid) return -1;
      if (aInvalid && bInvalid) return a.date.localeCompare(b.date);

      const tA = parseDateToTimestamp(a.date);
      const tB = parseDateToTimestamp(b.date);
      if (tA !== tB) {
        return sortDirection === 'asc' ? tA - tB : tB - tA;
      }
      return a.date.localeCompare(b.date);
    });

    return result;
  }, [paginatedPartes, groupByDate, sortDirection]);

  // Render header cell
  const renderHeaderCell = (colKey: ParteDiarioColumnKey) => {
    if (!columnConfig.visible[colKey]) return null;
    const def = PARTE_DIARIO_COLUMNS.find(d => d.key === colKey);
    const isSorted = sortField === colKey;

    return (
      <th
        key={colKey}
        onClick={() => {
          if (colKey === 'fecha' || colKey === 'numParte' || colKey === 'codigoEquipo' || colKey === 'nombreApellido' || colKey === 'obra' || colKey === 'tipo') {
            handleSort(colKey as SortKey);
          }
        }}
        className={`${densityCfg.thPadding} font-bold cursor-pointer select-none group hover:text-[#F0C800] transition ${
          def?.align === 'right' ? 'text-right' : def?.align === 'center' ? 'text-center' : 'text-left'
        }`}
        title="Click para ordenar. Arrastra en la configuración para reordenar."
      >
        <div className={`flex items-center gap-1 ${def?.align === 'right' ? 'justify-end' : def?.align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <span className="truncate">{def?.label || colKey}</span>
          <span>
            {isSorted ? (
              sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-[#F0C800] font-bold" /> : <ArrowDown className="w-3 h-3 text-[#F0C800] font-bold" />
            ) : (
              <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-50" />
            )}
          </span>
        </div>
      </th>
    );
  };

  // Render body cell
  const renderBodyCell = (colKey: ParteDiarioColumnKey, parte: ParteDiario) => {
    if (!columnConfig.visible[colKey]) return null;
    const tdBase = `${densityCfg.tdPadding} ${densityCfg.fontSize}`;

    switch (colKey) {
      case 'id':
        return <td key="id" className={`${tdBase} text-slate-500 font-mono text-[11px]`}>{parte.id}</td>;
      case 'numParte':
        return <td key="numParte" className={`${tdBase} font-bold text-white font-mono`}>{parte.numParte}</td>;
      case 'fecha': {
        const { display, weekday } = normalizeDateKey(parte.fecha);
        return (
          <td key="fecha" className={`${tdBase} text-slate-300 font-mono whitespace-nowrap`}>
            <div className="flex items-baseline justify-between gap-2.5 whitespace-nowrap">
              <span>{display}</span>
              {weekday && (
                <span className="text-[11px] font-sans text-slate-400 capitalize">
                  {weekday}
                </span>
              )}
            </div>
          </td>
        );
      }
      case 'servMant':
        return <td key="servMant" className={`${tdBase} text-slate-300`}>{parte.servMant}</td>;
      case 'obra': {
        const cat = getParteCategoriaObra(parte);
        const isEsp = cat === 'ESPORADICA';
        const obraOwner = resolveParteObraOwner(parte);
        return (
          <td 
            key="obra" 
            className={`${tdBase} text-white font-sans font-medium cursor-pointer hover:text-[#F0C800] hover:underline`}
            onClick={() => onViewObra?.(parte.obra, parte.codigoObra)}
            title={isEsp ? 'Obra Esporádica — Clic para ver su legajo completo' : 'Ver detalles y legajo de la obra'}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span>{parte.obra}</span>
                {isEsp && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 whitespace-nowrap">
                    ⚡ Esporádica
                  </span>
                )}
                {cat === 'CORTA' && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 whitespace-nowrap">
                    ⏱️ Corta
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {obraOwner ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                    👤 {obraOwner}
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-800/80 text-slate-400 border border-slate-700/70 whitespace-nowrap">
                    Sin asignar
                  </span>
                )}
              </div>
            </div>
          </td>
        );
      }
      case 'codigoObra': {
        const isEspCode = parte.esObraEsporadica || parte.codigoObra === 'ESPORADICA';
        return (
          <td 
            key="codigoObra" 
            className={`${tdBase} font-mono cursor-pointer hover:underline ${isEspCode ? 'text-cyan-300 font-bold' : 'text-slate-400'}`}
            onClick={() => onViewObra?.(parte.obra, parte.codigoObra)}
            title={isEspCode ? 'Trabajo esporádico tipeado' : 'Ver detalles de la obra'}
          >
            {parte.codigoObra}
          </td>
        );
      }
      case 'codigoEquipo': {
        const isEqEventual = Boolean(parte.esEquipoEventual || parte.codigoEquipo === 'EVENTUAL');
        const matched = isEqEventual
          ? undefined
          : fleet.find(f =>
              f.codigoEquipo === parte.codigoEquipo ||
              f.id === parte.codigoEquipo ||
              f.codigoInterno === parte.codigoEquipo
            );
        const vehName = parte.marcaModelo || matched?.modeloMarca || parte.codigoEquipo;
        return (
          <td 
            key="codigoEquipo" 
            className={`${tdBase} font-bold cursor-pointer hover:underline max-w-[240px] ${
              isEqEventual ? 'text-orange-300' : 'text-[#F0C800]'
            }`}
            onClick={() => onViewVehicle?.(parte.codigoEquipo, parte.marcaModelo)}
            title={isEqEventual ? `Equipo eventual por única vez (no registrado en flota): ${vehName}` : `Ver detalles de ${vehName} (${parte.codigoEquipo})`}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="truncate">{vehName}</span>
              {isEqEventual && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-orange-500/20 text-orange-300 border border-orange-500/50 whitespace-nowrap">
                  ⚡ 1 VEZ
                </span>
              )}
            </div>
          </td>
        );
      }
      case 'marcaModelo': {
        const isEqEventual = Boolean(parte.esEquipoEventual || parte.codigoEquipo === 'EVENTUAL');
        return (
          <td 
            key="marcaModelo" 
            className={`${tdBase} font-sans cursor-pointer hover:underline ${
              isEqEventual ? 'text-orange-300 font-bold' : 'text-slate-300 hover:text-[#F0C800]'
            }`}
            onClick={() => onViewVehicle?.(parte.codigoEquipo, parte.marcaModelo)}
            title={isEqEventual ? 'Equipo eventual por única vez (no pertenece a la flota)' : 'Ver detalles del equipo'}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>{parte.marcaModelo}</span>
              {isEqEventual && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-orange-500/20 text-orange-300 border border-orange-500/50 whitespace-nowrap">
                  ⚡ EVENTUAL
                </span>
              )}
            </div>
          </td>
        );
      }
      case 'codigoEmpleado': {
        const isEmpEventual = Boolean(
          parte.esEmpleadoEventual ||
          parte.codigoEmpleado === 'A_PRUEBA' ||
          parte.codigoEmpleado === 'EVENTUAL'
        );
        return (
          <td 
            key="codigoEmpleado" 
            className={`${tdBase} font-mono cursor-pointer hover:underline ${
              isEmpEventual ? 'text-fuchsia-300 font-black' : 'text-slate-400'
            }`}
            onClick={() => onViewEmployee?.(parte.codigoEmpleado, parte.nombreApellido)}
            title={isEmpEventual ? 'Operario / chofer a prueba por única vez (no es empleado registrado)' : 'Ver detalles del empleado'}
          >
            {isEmpEventual ? (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/50 whitespace-nowrap">
                NO EMPLEADO
              </span>
            ) : (
              parte.codigoEmpleado
            )}
          </td>
        );
      }
      case 'nombreApellido': {
        const isEmpEventual = Boolean(
          parte.esEmpleadoEventual ||
          parte.codigoEmpleado === 'A_PRUEBA' ||
          parte.codigoEmpleado === 'EVENTUAL'
        );
        return (
          <td 
            key="nombreApellido" 
            className={`${tdBase} font-sans cursor-pointer hover:underline ${
              isEmpEventual ? 'text-fuchsia-300 font-bold' : 'text-blue-300'
            }`}
            onClick={() => onViewEmployee?.(parte.codigoEmpleado, parte.nombreApellido)}
            title={isEmpEventual ? 'Operario a prueba / 1 sola vez (no está en Nómina de Empleados)' : 'Ver detalles del empleado'}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>{parte.nombreApellido}</span>
              {isEmpEventual && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/60 whitespace-nowrap">
                  ⚠️ NO EMPLEADO · 1 VEZ
                </span>
              )}
            </div>
          </td>
        );
      }
      case 'tipo':
        return (
          <td key="tipo" className={`${tdBase} text-center`}>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              parte.tipo === 'HORAS' 
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                : parte.tipo === 'VIAJES' 
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                : parte.tipo === 'DIA'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : parte.tipo === 'TRABAJO'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}>
              {parte.tipo}
            </span>
          </td>
        );
      case 'detalleTipo':
        return (
          <td key="detalleTipo" className={`${tdBase} text-slate-200 font-sans max-w-[260px] truncate`} title={parte.detalleTipo || parte.detalleEntrega}>
            {parte.detalleTipo || parte.detalleEntrega || '-'}
          </td>
        );
      case 'detalle2':
        return (
          <td key="detalle2" className={`${tdBase} text-slate-300 font-sans max-w-[240px] truncate`} title={parte.detalle2 || ''}>
            {parte.detalle2 || '-'}
          </td>
        );
      case 'horasTrabajadas':
        return <td key="horasTrabajadas" className={`${tdBase} text-right font-mono font-black text-[#F0C800]`}>{(parte.horasTrabajadas || parte.hsCantidad || 0).toFixed(1)}</td>;
      case 'kmOdomAprox': {
        const cross = kilometrajeCrossMap.get(parte.id);
        const tooltip = buildCrossTooltip(cross);
        if (!cross || cross.status === 'NO_FUEL_DATA') {
          return <td key="kmOdomAprox" className={`${tdBase} text-right font-mono text-slate-600`} title={tooltip}>-</td>;
        }
        if (cross.status === 'PENDING_NEXT_LOAD') {
          return (
            <td key="kmOdomAprox" className={`${tdBase} text-right font-mono text-slate-500 whitespace-nowrap`} title={tooltip}>
              <span className="text-[11px]">Pend. carga</span>
            </td>
          );
        }
        if (cross.isFuelLoadDay && cross.lecturaCargaDia !== undefined) {
          return (
            <td key="kmOdomAprox" className={`${tdBase} text-right font-mono whitespace-nowrap`} title={tooltip}>
              <span className="inline-flex items-center justify-end gap-1 text-emerald-300 font-bold">
                <Fuel className="w-3 h-3 shrink-0" />
                <span>{cross.lecturaCargaDia.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</span>
              </span>
            </td>
          );
        }
        if (cross.odomAproxFin !== undefined) {
          return (
            <td key="kmOdomAprox" className={`${tdBase} text-right font-mono text-cyan-300 whitespace-nowrap`} title={tooltip}>
              ~{cross.odomAproxFin.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
            </td>
          );
        }
        return <td key="kmOdomAprox" className={`${tdBase} text-right font-mono text-slate-600`} title={tooltip}>-</td>;
      }
      case 'kmProrrateado': {
        const cross = kilometrajeCrossMap.get(parte.id);
        const tooltip = buildCrossTooltip(cross);
        if (!cross || cross.kmProrrateadoDia === undefined) {
          if (cross?.isFuelLoadDay) {
            return (
              <td key="kmProrrateado" className={`${tdBase} text-right font-mono text-slate-400 whitespace-nowrap`} title={tooltip}>
                <span className="text-[11px]">Día carga</span>
              </td>
            );
          }
          return <td key="kmProrrateado" className={`${tdBase} text-right font-mono text-slate-600`} title={tooltip}>-</td>;
        }
        const matchColor =
          cross.unit === 'hs'
            ? cross.coincidencia === 'COINCIDE'
              ? 'text-emerald-400'
              : cross.coincidencia === 'DESVIO_LEVE'
              ? 'text-amber-400'
              : cross.coincidencia === 'DESFASAJE'
              ? 'text-rose-400'
              : 'text-slate-400'
            : 'text-sky-300';
        const matchSymbol =
          cross.unit === 'hs'
            ? cross.coincidencia === 'COINCIDE'
              ? '✓'
              : cross.coincidencia === 'DESVIO_LEVE'
              ? '~'
              : cross.coincidencia === 'DESFASAJE'
              ? '!'
              : ''
            : '';

        return (
          <td key="kmProrrateado" className={`${tdBase} text-right font-mono font-bold whitespace-nowrap`} title={tooltip}>
            <span className={`inline-flex items-center justify-end gap-1 ${matchColor}`}>
              <span>+{cross.kmProrrateadoDia.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</span>
              <span className="text-[10px] font-normal opacity-80">{cross.unit}</span>
              {matchSymbol && <span className="text-[10px] font-black">{matchSymbol}</span>}
            </span>
          </td>
        );
      }
      case 'viajesCantidad': {
        const lineCount = parte.viajesDetalle?.length || 0;
        const tooltip = lineCount > 1
          ? parte.viajesDetalle!.map((l, i) => `${i + 1}) ${l.viajesCantidad}× ${l.tipoMaterial} (${l.totalM3} m³)`).join('\n')
          : undefined;
        return (
          <td key="viajesCantidad" className={`${tdBase} text-right font-mono font-bold text-white`} title={tooltip}>
            {parte.tipo === 'VIAJES' ? (
              <span className="inline-flex items-center justify-end gap-1">
                <span>{parte.viajesCantidad || parte.cantidad || 0}</span>
                {lineCount > 1 && (
                  <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35 text-[9px] font-black">
                    {lineCount}L
                  </span>
                )}
              </span>
            ) : '-'}
          </td>
        );
      }
      case 'm3PorViaje':
        return <td key="m3PorViaje" className={`${tdBase} text-right font-mono text-purple-300`}>{parte.m3PorViaje ? `${parte.m3PorViaje} m³` : '-'}</td>;
      case 'totalM3':
        return <td key="totalM3" className={`${tdBase} text-right font-mono font-bold text-purple-300`}>{parte.totalM3 ? `${parte.totalM3} m³` : '-'}</td>;
      case 'tipoMaterial': {
        const lineCount = parte.viajesDetalle?.length || 0;
        const tooltip = lineCount > 1
          ? parte.viajesDetalle!.map((l, i) => `${i + 1}) ${l.tipoMaterial} · ${l.viajesCantidad} vjs (${l.totalM3} m³)`).join('\n')
          : parte.tipoMaterial || undefined;
        return (
          <td key="tipoMaterial" className={`${tdBase} text-slate-300 font-sans max-w-[220px] truncate`} title={tooltip}>
            {parte.tipoMaterial || '-'}
          </td>
        );
      }
      case 'extraccionEntregas':
        return (
          <td key="extraccionEntregas" className={`${tdBase} font-sans`}>
            {parte.extraccionEntregas ? (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                parte.tipoOperacionMaterial === 'RETIRO_MATERIAL' || parte.extraccionEntregas.toUpperCase().includes('RETIRO')
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : parte.tipoOperacionMaterial === 'EXTRACCION'
                    ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              }`}>
                {parte.extraccionEntregas}
              </span>
            ) : '-'}
          </td>
        );
      case 'separarCobranzaMaterial':
        return (
          <td key="separarCobranzaMaterial" className={`${tdBase} text-center`}>
            {parte.separarCobranzaMaterial ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Solo Viaje
              </span>
            ) : '-'}
          </td>
        );
      case 'valorViajeEquipo':
        return (
          <td key="valorViajeEquipo" className={`${tdBase} text-right font-mono font-bold text-emerald-400`}>
            {parte.valorViajeEquipo ? `$${Number(parte.valorViajeEquipo).toLocaleString('es-AR')}` : '-'}
          </td>
        );
      case 'odomKilom':
        return <td key="odomKilom" className={`${tdBase} text-right font-mono text-slate-300`}>{parte.odomKilom ? parte.odomKilom.toLocaleString() : '-'}</td>;
      case 'ubicacion':
        return <td key="ubicacion" className={`${tdBase} text-slate-300 font-sans`}>{parte.ubicacion || '-'}</td>;
      case 'encargadoObra':
        return <td key="encargadoObra" className={`${tdBase} text-slate-300 font-sans`}>{parte.encargadoObra || '-'}</td>;
      case 'grasa':
        return <td key="grasa" className={`${tdBase} text-slate-400 text-[11px]`}>{parte.grasa || '-'}</td>;
      case 'aceite':
        return <td key="aceite" className={`${tdBase} text-slate-400 text-[11px]`}>{parte.aceite || '-'}</td>;
      case 'reparacionMant':
        return <td key="reparacionMant" className={`${tdBase} text-rose-300 text-[11px] max-w-[160px] truncate`}>{parte.reparacionMant || '-'}</td>;
      case 'fuenteOrigen':
        return (
          <td key="fuenteOrigen" className={`${tdBase} text-[10px] font-mono`}>
            {parte.fuenteOrigen ? (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {parte.fuenteOrigen}
              </span>
            ) : '-'}
          </td>
        );
      case 'novedades':
        return <td key="novedades" className={`${tdBase} text-slate-400 font-sans max-w-[200px] truncate`} title={parte.novedades}>{parte.novedades || '-'}</td>;
      default:
        return <td key={colKey} className={`${tdBase} text-slate-300`}>-</td>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#16191F] border border-[#2D2D2D] p-6 rounded-2xl shadow-lg">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-[#F0C800]/10 border border-[#F0C800]/30 rounded-xl text-[#F0C800]">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2 font-display">
                Partes Diarios de Equipos
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/40">
                  {partes.length} Registros
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Control completo de horas, turnos, viajes, obras y operadores con columnas y agrupación personalizables.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {onOpenImportExport && (
            <button
              onClick={onOpenImportExport}
              className="flex items-center gap-2 px-3.5 py-2 bg-[#1F2228] hover:bg-[#2D2D2D] text-slate-200 font-semibold text-xs rounded-xl border border-[#2D2D2D] transition cursor-pointer"
              title="Importar Partes Diarios desde Excel o CSV"
            >
              <UploadCloud className="w-4 h-4 text-[#F0C800]" />
              <span>Importar</span>
            </button>
          )}

          {onOpenGoogleSheet && (
            <button
              type="button"
              onClick={onOpenGoogleSheet}
              className={`flex items-center gap-2 px-3.5 py-2 font-bold text-xs rounded-xl border transition cursor-pointer ${
                googleSheetLinkedLabel
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                  : 'bg-[#1F2228] hover:bg-[#2D2D2D] text-emerald-300 border-emerald-500/30'
              }`}
              title="Conectar y sincronizar Partes Diarios con una hoja de Google Sheets"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>{googleSheetLinkedLabel ? `Sheet: ${googleSheetLinkedLabel}` : 'Google Sheet'}</span>
            </button>
          )}

          <button
            onClick={onExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#1F2228] hover:bg-[#2D2D2D] text-slate-200 font-semibold text-xs rounded-xl border border-[#2D2D2D] transition cursor-pointer"
            title="Exportar Partes a CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Exportar CSV</span>
          </button>

          {onResetPartesDiarios && (
            <button
              onClick={onResetPartesDiarios}
              className="flex items-center gap-2 px-3 py-2 bg-[#1F2228] hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 font-semibold text-xs rounded-xl border border-[#2D2D2D] transition cursor-pointer"
              title="Restaurar partes diarios predeterminados"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>Restaurar</span>
            </button>
          )}

          {onClearAllPartesDiarios && (
            <button
              onClick={onClearAllPartesDiarios}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white font-bold text-xs rounded-xl border border-rose-500/40 hover:border-rose-400 transition cursor-pointer shadow-sm group"
              title="Limpiar y vaciar todos los registros de partes diarios en la base de datos y memoria"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
              <span>Limpiar Registros</span>
            </button>
          )}

          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] active:bg-[#DDA800] text-[#2D2D2D] font-black text-xs rounded-xl shadow-md shadow-[#F0C800]/20 transition cursor-pointer border border-[#DDA800]"
          >
            <Plus className="w-4 h-4 text-[#2D2D2D] stroke-[3]" />
            <span>+ Añadir Parte Diario</span>
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-[#16191F] border border-[#2D2D2D] p-4 rounded-xl space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar por equipo, marca, operador, obra, material, num parte o detalle..."
              className="w-full bg-[#1F2228] border border-[#2D2D2D] rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#F0C800] transition"
            />
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1 bg-[#1F2228] border border-[#2D2D2D] rounded-xl p-1 flex-wrap">
              {['TODOS', 'HORAS', 'VIAJES', 'DIA', 'TRABAJO', 'OTRO'].map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setTipoFilter(t);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    tipoFilter === t
                      ? 'bg-[#F0C800] text-[#2D2D2D]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t === 'TODOS'
                    ? 'Todos'
                    : t === 'HORAS'
                      ? 'Horas'
                      : t === 'VIAJES'
                        ? 'Viajes'
                        : t === 'DIA'
                          ? 'Por Día'
                          : t === 'TRABAJO'
                            ? 'Por Trabajo'
                            : 'Otro'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setGroupByDate(!groupByDate)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                groupByDate
                  ? 'bg-[#F0C800]/15 text-[#F0C800] border-[#F0C800]/40'
                  : 'bg-[#1F2228] text-slate-400 border-[#2D2D2D] hover:text-white'
              }`}
              title="Agrupar registros por fecha"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{groupByDate ? 'Agrupado por Fecha' : 'Lista Plana'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsColumnModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1F2228] hover:bg-[#2D2D2D] text-slate-300 hover:text-white rounded-xl border border-[#2D2D2D] text-xs font-bold transition cursor-pointer"
              title="Personalizar columnas visibles y orden"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#F0C800]" />
              <span>Columnas ({visibleColumnsCount})</span>
            </button>

            <TableDensitySelector density={activeDensity} onChangeDensity={handleDensityChange} />
          </div>
        </div>

        {/* Searchable Dropdown Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5 pt-2 border-t border-slate-800/80 items-center">
          <SearchableSelect
            options={equipoFilterOptions}
            value={equiposSelected[0] || 'TODOS'}
            onChange={(val) => {
              setEquiposSelected(val && val !== 'TODOS' ? [val] : []);
              setCurrentPage(1);
            }}
            multiple={true}
            selectedValues={equiposSelected}
            onChangeMultiple={(vals) => {
              setEquiposSelected(vals);
              setCurrentPage(1);
            }}
            placeholder="Filtrar Equipos..."
            searchPlaceholder="Escribí para buscar equipos..."
            clearValue="TODOS"
            compact
          />

          <SearchableSelect
            options={operadorFilterOptions}
            value={operadorFilter}
            onChange={(val) => {
              setOperadorFilter(val || 'TODOS');
              setCurrentPage(1);
            }}
            placeholder="Filtrar Operador..."
            searchPlaceholder="Escribí para buscar operador..."
            clearValue="TODOS"
            compact
          />

          <SearchableSelect
            options={obraFilterOptions}
            value={obraFilter}
            onChange={(val) => {
              setObraFilter(val || 'TODOS');
              setCurrentPage(1);
            }}
            placeholder="Filtrar Obra..."
            searchPlaceholder="Escribí para buscar obra..."
            clearValue="TODOS"
            compact
          />

          <SearchableSelect
            options={servMantFilterOptions}
            value={servMantFilter}
            onChange={(val) => {
              setServMantFilter(val || 'TODOS');
              setCurrentPage(1);
            }}
            placeholder="Filtrar Servicio..."
            searchPlaceholder="Alquiler, Traslado..."
            clearValue="TODOS"
            compact
          />

          <SearchableSelect
            options={[
              { value: 'TODOS', label: 'Entrega / Retiro (Todos)' },
              { value: 'ENTREGA', label: 'Entrega de Material' },
              { value: 'RETIRO', label: 'Retiro de Material' },
              { value: 'EXTRACCION', label: 'Extracción' },
              { value: 'SOLO_FLETE', label: 'Solo Flete / Traslado' },
            ]}
            value={operacionMatFilter}
            onChange={(val) => {
              setOperacionMatFilter(val || 'TODOS');
              setCurrentPage(1);
            }}
            placeholder="Entrega / Retiro..."
            searchPlaceholder="Buscar operación..."
            clearValue="TODOS"
            compact
          />

          <SearchableSelect
            options={materialFilterOptions}
            value={materialFilter}
            onChange={(val) => {
              setMaterialFilter(val || 'TODOS');
              setCurrentPage(1);
            }}
            placeholder="Filtrar Material..."
            searchPlaceholder="Ripio, Piedra, Ladrillo..."
            clearValue="TODOS"
            compact
          />

          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SearchableSelect
                options={mesFilterOptions}
                value={mesFilter}
                onChange={(val) => {
                  setMesFilter(val || 'TODOS');
                  setCurrentPage(1);
                }}
                placeholder="Filtrar Mes..."
                searchPlaceholder="Ej: 2026-11..."
                clearValue="TODOS"
                compact
              />
            </div>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold shrink-0 cursor-pointer transition"
                title="Limpiar todos los filtros"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Categoría de Obra Quick Filter */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
            Tipo de Obra:
          </span>
          {[
            { value: 'TODOS' as const, label: 'Todas' },
            { value: 'ESPORADICA' as const, label: '⚡ Esporádicas' },
            { value: 'CORTA' as const, label: '⏱️ Cortas' },
            { value: 'LARGA' as const, label: '🏗️ Largas' },
          ].map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setCategoriaObraFilter(item.value);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                categoriaObraFilter === item.value
                  ? item.value === 'ESPORADICA'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                    : item.value === 'CORTA'
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50'
                      : 'bg-[#F0C800]/20 text-[#F0C800] border-[#F0C800]/50'
                  : 'bg-[#1F2228] text-slate-400 border-[#2D2D2D] hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Vínculo Comercial Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5 text-indigo-400" />
              Vínculo Alquiler / Factura:
            </span>
            {[
              { id: 'TODOS', label: `Todos (${partes.length})` },
              { id: 'VINCULADOS', label: `🔗 Vinculados (${linkStats.vinculados})` },
              { id: 'CON_CONTRATO', label: `📋 Con Contrato Alquiler (${linkStats.conContrato})` },
              { id: 'CON_FACTURA', label: `🧾 Con Factura ARCA (${linkStats.conFactura})` },
              { id: 'PAGADOS', label: `✓ Pagados (${linkStats.pagados})` },
              { id: 'SIN_VINCULAR', label: `Sin Vincular (${linkStats.sinVincular})` },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setVinculoFilter(tab.id as any);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                  vinculoFilter === tab.id
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    : 'bg-[#1F2228] text-slate-400 border-[#2D2D2D] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {onNavigateToCobranzas && (
            <button
              type="button"
              onClick={onNavigateToCobranzas}
              className="px-3 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold cursor-pointer transition flex items-center gap-1.5"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Ir a Cobranzas & Bajar Facturas</span>
            </button>
          )}
        </div>
      </div>

      {/* Batch Selection Banner */}
      {selectedIds.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-300 shadow-lg">
          <span className="font-bold">
            {selectedIds.length} partes diarios seleccionados
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {onUpdatePartesBatch && (
              <button
                type="button"
                onClick={() => openLinkModalForIds(selectedIds)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>🔗 Vincular a Contrato de Alquiler / Factura ({selectedIds.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer"
            >
              Deseleccionar
            </button>
            <button
              type="button"
              onClick={() => {
                if (onDeleteSelectedPartes) {
                  onDeleteSelectedPartes(selectedIds);
                  setSelectedIds([]);
                }
              }}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar seleccionados ({selectedIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Table with Customizable Columns */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {/* Compact Obra / Filter Cross Summary Bar */}
        <div className="px-4 py-2 bg-slate-900/75 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-4 text-slate-300">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
              <Fuel className="w-3.5 h-3.5 text-cyan-400" />
              <span>Cruce Combustible ({filteredCrossSummary.partesConCruce}/{filteredPartes.length} partes):</span>
            </span>
            <span>
              Hs Partes: <strong className="text-[#F0C800] font-black">{filteredCrossSummary.totalHoras.toFixed(1)} hs</strong>
            </span>
            <span>
              Kms Obra / Filtro: <strong className="text-sky-300 font-black">{filteredCrossSummary.totalKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km</strong>
            </span>
            {filteredCrossSummary.totalHsMaquina > 0 && (
              <span>
                Hs Horómetro (Comb.): <strong className="text-emerald-300 font-black">{filteredCrossSummary.totalHsMaquina.toLocaleString('es-AR', { maximumFractionDigits: 1 })} hs</strong>
              </span>
            )}
          </div>
          {filteredCrossSummary.totalHsMaquina > 0 && (
            <div className="text-[11px] text-slate-400">
              Control Horóm.: <strong className="text-emerald-400">{filteredCrossSummary.partesHsCoinciden} ok</strong>
              {filteredCrossSummary.partesHsDesfasaje > 0 && (
                <span className="ml-2 text-amber-300 font-bold">• {filteredCrossSummary.partesHsDesfasaje} con desvío</span>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-900/90 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className={`${densityCfg.thPadding} w-10 text-center`}>
                  <input
                    type="checkbox"
                    checked={allFilteredIds.length > 0 && selectedIds.length === allFilteredIds.length}
                    onChange={toggleSelectAll}
                    className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                    title="Seleccionar todos los visibles"
                  />
                </th>
                {columnConfig.order.map(colKey => renderHeaderCell(colKey))}
                <th className={`${densityCfg.thPadding} font-bold text-left text-indigo-300`}>
                  VÍNCULO ALQUILER / FACTURA
                </th>
                <th className={`${densityCfg.thPadding} font-bold text-right sticky right-0 z-20 bg-[#12141A] border-l border-slate-800 shadow-[-6px_0_12px_rgba(0,0,0,0.35)]`}>
                  ACCIONES
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-xs font-mono">
              {paginatedPartes.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnsCount + 3} className="px-4 py-12 text-center text-slate-500 font-sans">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ClipboardList className="w-10 h-10 text-slate-600" />
                      <p className="text-sm font-medium">No se encontraron partes diarios con los filtros seleccionados.</p>
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="text-xs text-amber-400 hover:underline mt-1 cursor-pointer"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                groupedPartes.map((group, groupIdx) => {
                  const groupHours = group.items.reduce((acc, p) => acc + (p.horasTrabajadas || p.hsCantidad || 0), 0);
                  const groupTrips = group.items.reduce((acc, p) => acc + (p.viajesCantidad || p.cantidad || 0), 0);
                  const groupKms = group.items.reduce((acc, p) => {
                    const c = kilometrajeCrossMap.get(p.id);
                    return acc + (c && c.unit === 'km' && c.kmProrrateadoDia ? c.kmProrrateadoDia : 0);
                  }, 0);
                  const groupHsMaq = group.items.reduce((acc, p) => {
                    const c = kilometrajeCrossMap.get(p.id);
                    return acc + (c && c.unit === 'hs' && c.kmProrrateadoDia ? c.kmProrrateadoDia : 0);
                  }, 0);

                  return (
                    <React.Fragment key={group.date || groupIdx}>
                      {groupByDate && (
                        <tr className="bg-slate-900/95 border-t-2 border-b border-slate-800 select-none">
                          <td colSpan={visibleColumnsCount + 3} className="px-4 py-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <Calendar className="w-4 h-4 text-[#F0C800]" />
                                <span className="font-mono font-bold text-white text-xs">{group.date}</span>
                                {group.weekday && (
                                  <span className="font-sans text-xs text-slate-400 capitalize">{group.weekday}</span>
                                )}
                                <span className="bg-[#F0C800]/15 text-[#F0C800] px-2 py-0.5 rounded text-[10px] font-mono border border-[#F0C800]/30 font-bold">
                                  {group.items.length} {group.items.length === 1 ? 'parte' : 'partes'}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
                                <span>Horas: <strong className="text-[#F0C800] font-black">{groupHours.toFixed(1)} hs</strong></span>
                                {groupKms > 0 && (
                                  <span>Kms aprox: <strong className="text-sky-300">+{groupKms.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km</strong></span>
                                )}
                                {groupHsMaq > 0 && (
                                  <span>Hs máq: <strong className="text-emerald-300">+{groupHsMaq.toLocaleString('es-AR', { maximumFractionDigits: 1 })} hs</strong></span>
                                )}
                                <span>Viajes: <strong className="text-blue-400">{groupTrips}</strong></span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {group.items.map((parte) => {
                        const rLinks = resolvedLinksByParteId.get(parte.id);
                        return (
                        <tr 
                          key={parte.id} 
                          className={`hover:bg-slate-900/60 transition group ${densityCfg.row} ${selectedIds.includes(parte.id) ? 'bg-amber-500/10' : ''}`}
                        >
                          <td className={`${densityCfg.cell} w-10 text-center`}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(parte.id)}
                              onChange={() => toggleSelectOne(parte.id)}
                              className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                            />
                          </td>
                          {columnConfig.order.map(colKey => renderBodyCell(colKey, parte))}

                          {/* Columna Vínculo Alquiler / Factura (Jerarquía: 1° Factura ARCA, 2° Contrato de Alquiler) */}
                          <td className={`${densityCfg.tdPadding} ${densityCfg.fontSize}`}>
                            {rLinks?.isLinked ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {rLinks.facturaNumero && (() => {
                                  const isExtInv = isExternalMigratedInvoice(rLinks.invoice);
                                  return (
                                    <span
                                      onClick={() => onViewDetails(parte)}
                                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-black cursor-pointer border ${
                                        isExtInv
                                          ? 'bg-orange-500/25 text-orange-200 border-orange-400/60 hover:bg-orange-500/35'
                                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35 hover:bg-emerald-500/30'
                                      }`}
                                      title={isExtInv
                                        ? `1° Jerarquía • Factura de OTRO SISTEMA ${rLinks.facturaNumero} (${rLinks.invoice?.sistemaOrigenNombre || 'Migración'})`
                                        : `1° Jerarquía • Factura ARCA ${rLinks.facturaNumero}`}
                                    >
                                      🧾 FACT {rLinks.facturaNumero}{isExtInv ? ' ⚠️ OTRO SIST.' : ''}
                                    </span>
                                  );
                                })()}
                                {rLinks.rentalNumero && (
                                  <span
                                    onClick={() => onViewDetails(parte)}
                                    className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/35 text-[10px] font-mono font-black cursor-pointer hover:bg-indigo-500/30"
                                    title={`2° Jerarquía • Contrato ${rLinks.rentalNumero}${rLinks.linkedRental ? ` (${rLinks.linkedRental.clienteNombre})` : ''}`}
                                  >
                                    🔗 {rLinks.rentalNumero}
                                  </span>
                                )}
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black border ${
                                    rLinks.estadoCobro === 'PAGADO'
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                      : rLinks.estadoCobro === 'COBRADO_PARCIAL' || rLinks.estadoCobro === 'PARCIAL'
                                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  }`}
                                >
                                  {rLinks.estadoCobro === 'PAGADO' ? '✓ PAGADO' : (rLinks.estadoCobro === 'COBRADO_PARCIAL' || rLinks.estadoCobro === 'PARCIAL') ? 'PARCIAL' : 'PENDIENTE'}
                                </span>
                                {onUpdatePartesBatch && (
                                  <button
                                    type="button"
                                    onClick={() => openLinkModalForIds([parte.id])}
                                    className="p-1 text-slate-400 hover:text-indigo-300 rounded cursor-pointer"
                                    title="Cambiar o desvincular Contrato / Factura"
                                  >
                                    <Link2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-500 font-sans">Sin vincular</span>
                                {onUpdatePartesBatch && (
                                  <button
                                    type="button"
                                    onClick={() => openLinkModalForIds([parte.id])}
                                    className="px-2 py-0.5 rounded bg-slate-800/90 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 border border-slate-700 hover:border-indigo-500/40 text-[10px] font-mono font-bold transition cursor-pointer flex items-center gap-1"
                                    title="Vincular este Parte Diario a un Contrato de Alquiler o Factura ARCA"
                                  >
                                    <Link2 className="w-2.5 h-2.5" />
                                    <span>Vincular</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          <td className={`px-3 text-right ${densityCfg.cell} sticky right-0 z-10 bg-[#16191F] group-hover:bg-[#1E232E] border-l border-slate-800 shadow-[-6px_0_12px_rgba(0,0,0,0.35)]`}>
                            <div className="flex items-center justify-end gap-1">
                              {onUpdatePartesBatch && (
                                <button
                                  onClick={() => openLinkModalForIds([parte.id])}
                                  className="p-1.5 bg-slate-800 hover:bg-indigo-500 text-indigo-300 hover:text-white rounded-lg transition cursor-pointer"
                                  title="Vincular a Contrato de Alquiler / Factura ARCA"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => onViewDetails(parte)}
                                className="p-1.5 bg-slate-800 hover:bg-[#F0C800] text-slate-300 hover:text-black rounded-lg transition cursor-pointer"
                                title="Ver detalle"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onEditParte(parte)}
                                className="p-1.5 bg-slate-800 hover:bg-amber-500 text-slate-300 hover:text-black rounded-lg transition cursor-pointer"
                                title="Editar"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onDeleteParte(parte.id)}
                                className="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

        {/* Pagination & Summary Footer */}
        <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-4 flex-wrap">
            <span>Mostrando {filteredPartes.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} al {Math.min(currentPage * pageSize, filteredPartes.length)} de {filteredPartes.length} registros ({partes.length} total)</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Filas por página:</span>
              <div className="w-24">
                <SearchableSelect
                  options={[
                    { value: '25', label: '25' },
                    { value: '50', label: '50' },
                    { value: '100', label: '100' },
                    { value: '200', label: '200' },
                  ]}
                  value={String(pageSize)}
                  onChange={(val) => {
                    setPageSize(Number(val) || 50);
                    setCurrentPage(1);
                  }}
                  showClear={false}
                  compact
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded cursor-pointer transition"
            >
              « Primero
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded cursor-pointer transition"
            >
              ‹ Anterior
            </button>
            <span className="px-3 py-1 bg-slate-800 text-amber-400 font-bold rounded">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded cursor-pointer transition"
            >
              Siguiente ›
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded cursor-pointer transition"
            >
              Último »
            </button>
          </div>
        </div>
      </div>

      {/* Column Manager Modal */}
      <ColumnManagerModal<ParteDiarioColumnKey>
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        title="Personalizar Columnas de Partes Diarios"
        subtitle="Selecciona qué columnas mostrar y arrástralas para reordenar la tabla de trabajos por equipo."
        columnDefinitions={PARTE_DIARIO_COLUMNS}
        columnConfig={columnConfig}
        onSaveConfig={handleSaveColumnConfig}
        onResetDefaults={() => {
          const reset = loadParteDiarioColumnConfig();
          setColumnConfig(reset);
          saveParteDiarioColumnConfig(reset);
          setIsColumnModalOpen(false);
        }}
      />

      {/* Modal para Vincular Parte(s) Diario(s) a Contrato de Alquiler y/o Factura ARCA */}
      {linkModalTargetIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#16191F] border border-indigo-500/40 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 bg-slate-900 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/15 border border-indigo-500/30 rounded-xl text-indigo-300">
                  <Link2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    Vincular {linkModalTargetIds.length === 1 ? 'Parte Diario' : `${linkModalTargetIds.length} Partes Diarios`}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Asociá {linkModalTargetIds.length === 1 ? 'este parte diario' : 'estos partes diarios'} a un Contrato de Alquiler y/o a una Factura ARCA.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLinkModalTargetIds([])}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* 1° Jerarquía: Factura ARCA */}
              <div>
                <label className="block text-[11px] font-bold text-emerald-300 uppercase mb-1.5 flex items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5" />
                    1° Factura ARCA / AFIP (Jerarquía Principal)
                  </span>
                  <span className="text-[10px] font-normal text-slate-400">Opcional si aún no se facturó</span>
                </label>
                <select
                  value={linkModalFacturaId}
                  onChange={(e) => setLinkModalFacturaId(e.target.value)}
                  className="w-full bg-[#0F1117] border border-emerald-500/35 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Sin Factura ARCA (O heredar del Contrato al facturar) --</option>
                  {arcaInvoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {isExternalMigratedInvoice(inv) ? '[OTRO SISTEMA] ' : ''}{formatInvoiceLabel(inv)} • {inv.razonSocialReceptor || inv.receptorRazonSocial} (${Number(inv.importeTotal || inv.impTotal || 0).toLocaleString('es-AR')})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2° Jerarquía: Contrato de Alquiler */}
              <div>
                <label className="block text-[11px] font-bold text-indigo-300 uppercase mb-1.5 flex items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5" />
                    2° Contrato de Alquiler (ALQ-xxxx)
                  </span>
                  <span className="text-[10px] font-normal text-slate-400">Si luego se factura, la factura absorbe el parte</span>
                </label>
                <select
                  value={linkModalRentalId}
                  onChange={(e) => {
                    const nextRentalId = e.target.value;
                    setLinkModalRentalId(nextRentalId);
                    if (nextRentalId && !linkModalFacturaId) {
                      const inherited = getInheritedInvoiceForRental(nextRentalId);
                      if (inherited) {
                        setLinkModalFacturaId(inherited.id);
                      }
                    }
                  }}
                  className="w-full bg-[#0F1117] border border-indigo-500/35 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Sin Contrato de Alquiler (Desvincular) --</option>
                  {rentals.map(r => {
                    const rNum = r.numeroContrato || r.numero;
                    const rObra = r.obraDestino || r.direccionObra || '-';
                    const rTotal = Number(r.totalAlquiler || r.totalGeneral || 0).toLocaleString('es-AR');
                    return (
                      <option key={r.id} value={r.id}>
                        {rNum} • {r.clienteNombre} — Obra: {rObra} (${rTotal})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setLinkModalTargetIds([])}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBatchLink}
                  className="px-5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-black rounded-xl shadow-lg cursor-pointer"
                >
                  Guardar Vínculo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
