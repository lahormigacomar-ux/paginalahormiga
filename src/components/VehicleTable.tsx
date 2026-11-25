import React, { useState, useMemo } from 'react';
import { Vehicle, TableColumnKey, VehicleStatus, VehicleClassification, TableDensity } from '../types';
import { FLEET_COLUMNS } from '../data/tableColumns';
import { StatusBadge, STATUS_CONFIG } from './StatusBadge';
import { TableDensitySelector } from './TableDensitySelector';
import { DENSITY_CONFIG, getSavedTableDensity, saveTableDensity } from '../utils/densityStyles';
import { SIMPLIFIED_CLASSIFICATIONS } from '../utils/equipmentClassification';
import { formatCurrency } from '../services/storage';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  MoreVertical, 
  Eye, 
  Edit3, 
  Trash2, 
  CheckCircle, 
  SlidersHorizontal,
  ExternalLink,
  ImageIcon,
  PlusCircle,
  LayoutGrid,
  List,
  Sparkles,
  DollarSign,
  GripVertical,
  FileSpreadsheet,
  UploadCloud,
  Archive,
  ArchiveRestore,
  Truck
} from 'lucide-react';

interface VehicleTableProps {
  fleet: Vehicle[];
  visibleColumns: Record<TableColumnKey, boolean>;
  columnOrder?: TableColumnKey[];
  density?: TableDensity;
  onChangeDensity?: (density: TableDensity) => void;
  onOpenCreateModal: () => void;
  onOpenColumnModal: () => void;
  onViewDetails: (vehicle: Vehicle) => void;
  onEditVehicle: (vehicle: Vehicle) => void;
  onArchiveVehicle?: (vehicle: Vehicle) => void;
  onDeleteVehicle: (id: string) => void;
  onChangeStatus: (id: string, newStatus: VehicleStatus) => void;
  onReorderColumns?: (newOrder: TableColumnKey[]) => void;
  onOpenImportExport?: () => void;
  onExportCSV?: () => void;
  onToggleDashboard?: (id: string) => void;
  onToggleWeb?: (id: string) => void;
  onClearFleet?: () => void;
}

type SortField = TableColumnKey | 'margen';
type SortDirection = 'asc' | 'desc';

export const VehicleTable: React.FC<VehicleTableProps> = ({
  fleet,
  visibleColumns,
  columnOrder = FLEET_COLUMNS.map(c => c.key as TableColumnKey),
  density,
  onChangeDensity,
  onOpenCreateModal,
  onOpenColumnModal,
  onViewDetails,
  onEditVehicle,
  onArchiveVehicle,
  onDeleteVehicle,
  onChangeStatus,
  onReorderColumns,
  onOpenImportExport,
  onExportCSV,
  onToggleDashboard,
  onToggleWeb,
  onClearFleet,
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
  const [archiveFilter, setArchiveFilter] = useState<'ACTIVOS' | 'ARCHIVADOS' | 'TODOS'>('ACTIVOS');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Drag and drop state for table headers
  const [draggedHeaderKey, setDraggedHeaderKey] = useState<TableColumnKey | null>(null);
  const [dragOverHeaderKey, setDragOverHeaderKey] = useState<TableColumnKey | null>(null);

  // Available unique classifications from fleet
  const availableClassifications = useMemo(() => {
    const set = new Set(fleet.map(v => v.clasificacion));
    const list = Array.from(set);
    return list.sort((a, b) => {
      const idxA = SIMPLIFIED_CLASSIFICATIONS.indexOf(a as any);
      const idxB = SIMPLIFIED_CLASSIFICATIONS.indexOf(b as any);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [fleet]);

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Double click to sort A-Z and Z-A
  const handleDoubleClickSort = (field: SortField, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (sortField === field) {
      // Toggle between A-Z and Z-A on subsequent double-clicks
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Set as primary sort and default to A-Z (asc)
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Header drag and drop handlers
  const handleHeaderDragStart = (key: TableColumnKey, e: React.DragEvent) => {
    setDraggedHeaderKey(key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  };

  const handleHeaderDragOver = (key: TableColumnKey, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverHeaderKey !== key) {
      setDragOverHeaderKey(key);
    }
  };

  const handleHeaderDragLeave = (key: TableColumnKey, e: React.DragEvent) => {
    e.preventDefault();
    if (dragOverHeaderKey === key) {
      setDragOverHeaderKey(null);
    }
  };

  const handleHeaderDrop = (targetKey: TableColumnKey, e: React.DragEvent) => {
    e.preventDefault();
    const sourceKey = (e.dataTransfer.getData('text/plain') as TableColumnKey) || draggedHeaderKey;
    if (!sourceKey || sourceKey === targetKey) {
      setDraggedHeaderKey(null);
      setDragOverHeaderKey(null);
      return;
    }

    const newOrder = [...columnOrder];
    const sourceIdx = newOrder.indexOf(sourceKey);
    const targetIdx = newOrder.indexOf(targetKey);

    if (sourceIdx !== -1 && targetIdx !== -1) {
      newOrder.splice(sourceIdx, 1);
      newOrder.splice(targetIdx, 0, sourceKey);
      if (onReorderColumns) {
        onReorderColumns(newOrder);
      }
    }

    setDraggedHeaderKey(null);
    setDragOverHeaderKey(null);
  };

  const handleHeaderDragEnd = () => {
    setDraggedHeaderKey(null);
    setDragOverHeaderKey(null);
  };

  // Counts for fleet status
  const activeCount = useMemo(() => fleet.filter(v => !v.archivado).length, [fleet]);
  const archivedCount = useMemo(() => fleet.filter(v => !!v.archivado).length, [fleet]);

  // Filtered & sorted fleet
  const processedFleet = useMemo(() => {
    return fleet
      .filter((v) => {
        // Archive filter (default: only active vehicles, exclude archived ones)
        if (archiveFilter === 'ACTIVOS' && v.archivado) return false;
        if (archiveFilter === 'ARCHIVADOS' && !v.archivado) return false;

        // Status filter
        if (statusFilter !== 'ALL' && v.estado !== statusFilter) return false;

        // Classification filter
        if (classFilter !== 'ALL' && v.clasificacion !== classFilter) return false;

        // Search query
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchId = v.id.toLowerCase().includes(q);
          const matchModel = v.modeloMarca.toLowerCase().includes(q);
          const matchPlate = v.patente.toLowerCase().includes(q);
          const matchInternal = v.codigoInterno.toLowerCase().includes(q);
          const matchClass = v.clasificacion.toLowerCase().includes(q);
          const matchLocation = (v.ubicacionActual || '').toLowerCase().includes(q);
          return matchId || matchModel || matchPlate || matchInternal || matchClass || matchLocation;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortField === 'ordenVisibilidad') {
          const ordA = a.ordenVisibilidad ?? 9999;
          const ordB = b.ordenVisibilidad ?? 9999;
          return sortDirection === 'asc' ? ordA - ordB : ordB - ordA;
        }

        let valA: any = a[sortField as keyof Vehicle] ?? '';
        let valB: any = b[sortField as keyof Vehicle] ?? '';

        if (typeof valA === 'string') {
          return sortDirection === 'asc' 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA);
        }

        if (typeof valA === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        return 0;
      });
  }, [fleet, searchTerm, archiveFilter, statusFilter, classFilter, sortField, sortDirection]);

  // Header definitions metadata for clean rendering
  const COLUMN_HEADERS: Record<TableColumnKey, { label: string; align?: 'left' | 'center' | 'right'; sortable?: boolean; highlight?: boolean }> = {
    fotografia: { label: 'Foto', align: 'center', sortable: false },
    id: { label: 'ID', align: 'left', sortable: true },
    modeloMarca: { label: 'MODELO / MARCA', align: 'left', sortable: true },
    anio: { label: 'AÑO', align: 'center', sortable: true },
    patente: { label: 'PATENTE', align: 'left', sortable: true },
    codigoInterno: { label: 'INTERNO', align: 'left', sortable: true },
    clasificacion: { label: 'CLASE', align: 'left', sortable: true },
    precioCosto: { label: 'COSTO', align: 'right', sortable: true },
    precioSugerido: { label: 'SUGERIDO', align: 'right', sortable: true, highlight: true },
    estado: { label: 'ESTADO', align: 'center', sortable: true },
    horometro: { label: 'HORÓMETRO', align: 'right', sortable: true },
    ubicacionActual: { label: 'UBICACIÓN', align: 'left', sortable: true },
    fechaAlta: { label: 'FECHA ALTA', align: 'left', sortable: true },
    ordenVisibilidad: { label: 'ORDEN WEB', align: 'center', sortable: true, highlight: true },
    publicarEnWeb: { label: 'WEB', align: 'center', sortable: true },
  };

  // Render dynamic header cell
  const renderHeaderCell = (colKey: TableColumnKey) => {
    if (!visibleColumns[colKey]) return null;

    const def = COLUMN_HEADERS[colKey] || { label: colKey, align: 'left', sortable: true };
    const isDragging = draggedHeaderKey === colKey;
    const isDragOver = dragOverHeaderKey === colKey;
    const isSorted = sortField === colKey;

    const alignClass = def.align === 'right' ? 'text-right' : def.align === 'center' ? 'text-center' : 'text-left';
    const justifyClass = def.align === 'right' ? 'justify-end' : def.align === 'center' ? 'justify-center' : 'justify-start';

    const baseClass = `${densityCfg.thPadding} border-b border-[#2D2D2D] transition select-none group relative ${
      isDragOver
        ? 'border-l-4 border-[#F0C800] bg-[#F0C800]/20 text-[#F0C800]'
        : isDragging
        ? 'opacity-40 bg-slate-900'
        : isSorted
        ? 'bg-[#F0C800]/10 text-[#F0C800]'
        : 'hover:bg-slate-800/40 text-slate-300'
    } ${alignClass} ${def.sortable ? 'cursor-pointer' : 'cursor-grab'}`;

    if (colKey === 'fotografia') {
      return (
        <th
          key="fotografia"
          draggable={true}
          onDragStart={(e) => handleHeaderDragStart('fotografia', e)}
          onDragOver={(e) => handleHeaderDragOver('fotografia', e)}
          onDragLeave={(e) => handleHeaderDragLeave('fotografia', e)}
          onDrop={(e) => handleHeaderDrop('fotografia', e)}
          onDragEnd={handleHeaderDragEnd}
          className={`${baseClass} ${activeDensity === 'ultra' ? 'w-10' : activeDensity === 'compact' ? 'w-12' : 'w-14'} text-center cursor-grab active:cursor-grabbing`}
          title="Arrastrar para reordenar columna"
        >
          <div className={`flex items-center justify-center ${densityCfg.gap}`}>
            <GripVertical className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition" />
            <span className={densityCfg.headerFontSize}>Foto</span>
          </div>
        </th>
      );
    }

    return (
      <th
        key={colKey}
        draggable={true}
        onDragStart={(e) => handleHeaderDragStart(colKey, e)}
        onDragOver={(e) => handleHeaderDragOver(colKey, e)}
        onDragLeave={(e) => handleHeaderDragLeave(colKey, e)}
        onDrop={(e) => handleHeaderDrop(colKey, e)}
        onDragEnd={handleHeaderDragEnd}
        onClick={() => handleSort(colKey as SortField)}
        onDoubleClick={(e) => handleDoubleClickSort(colKey as SortField, e)}
        className={baseClass}
        title={`Doble clic para ordenar A-Z / Z-A (Actualmente: ${isSorted ? (sortDirection === 'asc' ? 'A-Z' : 'Z-A') : 'sin ordenar'}) • Arrastrar para mover`}
      >
        <div className={`flex items-center ${densityCfg.gap} ${justifyClass} ${def.highlight ? 'text-[#F0C800] font-bold' : ''}`}>
          <GripVertical className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition cursor-grab shrink-0" />
          <span className={`truncate ${densityCfg.headerFontSize}`}>{def.label}</span>
          {isSorted ? (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-[#F0C800]/20 text-[#F0C800] font-mono text-[9px] font-bold border border-[#F0C800]/40 shrink-0">
              {sortDirection === 'asc' ? (
                <>
                  <ArrowUp className="w-2.5 h-2.5" />
                  <span>A-Z</span>
                </>
              ) : (
                <>
                  <ArrowDown className="w-2.5 h-2.5" />
                  <span>Z-A</span>
                </>
              )}
            </span>
          ) : (
            <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 shrink-0" />
          )}
        </div>
      </th>
    );
  };

  // Render dynamic body cell
  const renderBodyCell = (colKey: TableColumnKey, vehicle: Vehicle) => {
    if (!visibleColumns[colKey]) return null;

    const margen = vehicle.precioSugerido > 0 
      ? Math.round(((vehicle.precioSugerido - vehicle.precioCosto) / vehicle.precioSugerido) * 100)
      : 0;

    const tdBase = `${densityCfg.tdPadding} ${densityCfg.fontSize}`;

    switch (colKey) {
      case 'fotografia':
        return (
          <td key="fotografia" className={tdBase}>
            <div 
              onClick={() => setImagePreviewUrl(vehicle?.fotografia || 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=800&q=80')}
              className={`${densityCfg.imgContainer} rounded bg-slate-700 cursor-pointer overflow-hidden relative border border-slate-600/50 hover:border-[#F0C800] transition`}
              title="Click para ver imagen completa"
            >
              <img
                src={vehicle?.fotografia || 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=800&q=80'}
                alt={vehicle?.modeloMarca || ''}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=800&q=80';
                }}
              />
            </div>
          </td>
        );

      case 'id':
        return (
          <td key="id" className={`${tdBase} font-mono whitespace-nowrap`}>
            <button
              onClick={() => onViewDetails(vehicle)}
              className="font-bold text-[#F0C800] hover:text-[#F6D84C] transition cursor-pointer"
            >
              {vehicle.id}
            </button>
          </td>
        );

      case 'modeloMarca':
        return (
          <td key="modeloMarca" className={tdBase}>
            <div className="font-medium text-slate-200 max-w-xs truncate">
              {vehicle.modeloMarca}
            </div>
            {activeDensity !== 'ultra' && (
              <div className="text-[10px] text-slate-500 truncate">
                {vehicle.ubicacionActual || 'Base Central'}
              </div>
            )}
          </td>
        );

      case 'anio':
        return (
          <td key="anio" className={`${tdBase} text-center font-mono font-bold whitespace-nowrap`}>
            {vehicle.anio ? (
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700 text-xs font-semibold">
                {vehicle.anio}
              </span>
            ) : (
              <span className="text-slate-600 text-xs">-</span>
            )}
          </td>
        );

      case 'patente':
        return (
          <td key="patente" className={`${tdBase} font-mono uppercase text-slate-300 whitespace-nowrap`}>
            {vehicle.patente || 'S/P'}
          </td>
        );

      case 'codigoInterno':
        return (
          <td key="codigoInterno" className={`${tdBase} font-mono text-slate-400 whitespace-nowrap`}>
            {vehicle.codigoInterno}
          </td>
        );

      case 'clasificacion': {
        const isTerceros = vehicle.clasificacion === 'Vehículos de Terceros';
        return (
          <td key="clasificacion" className={`${tdBase} whitespace-nowrap`}>
            <span className={`rounded font-semibold uppercase ${
              isTerceros 
                ? 'bg-purple-950/70 text-purple-300 border border-purple-700/60 shadow-xs' 
                : 'bg-slate-700 text-slate-200'
            } ${
              activeDensity === 'ultra' ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[10px]'
            }`}>
              {vehicle.clasificacion}
            </span>
          </td>
        );
      }

      case 'precioCosto':
        return (
          <td key="precioCosto" className={`${tdBase} text-right font-mono text-slate-400 whitespace-nowrap`}>
            <div>{formatCurrency(vehicle.precioCosto)}</div>
            {vehicle.precioCostoHora && activeDensity !== 'ultra' && (
              <div className="text-[10px] text-slate-500">{formatCurrency(vehicle.precioCostoHora)}/hs</div>
            )}
          </td>
        );

      case 'precioSugerido':
        return (
          <td key="precioSugerido" className={`${tdBase} text-right font-mono font-black text-[#F0C800] whitespace-nowrap`}>
            <div>{formatCurrency(vehicle.precioSugerido)}</div>
            {activeDensity !== 'ultra' && (
              <div className="text-[10px] text-slate-400 font-normal">
                +{margen}% mg
              </div>
            )}
          </td>
        );

      case 'estado': {
        const nextStatusCycle: Partial<Record<VehicleStatus, VehicleStatus>> = {
          DISPONIBLE: 'ALQUILADO',
          ALQUILADO: 'EN_MANTENIMIENTO',
          EN_MANTENIMIENTO: 'DISPONIBLE',
        };
        const nextStatus: VehicleStatus = nextStatusCycle[vehicle.estado] || 'DISPONIBLE';
        return (
          <td key="estado" className={`${tdBase} text-center whitespace-nowrap`}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChangeStatus(vehicle.id, nextStatus);
              }}
              className="inline-flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform"
              title={`Click para cambiar estado a ${nextStatus}`}
            >
              <StatusBadge 
                status={vehicle.estado} 
                size={activeDensity === 'ultra' ? 'xs' : 'sm'} 
              />
            </button>
          </td>
        );
      }

      case 'horometro':
        return (
          <td key="horometro" className={`${tdBase} text-right font-mono text-slate-300 whitespace-nowrap`}>
            {vehicle.horometro ? `${vehicle.horometro} hrs` : '-'}
          </td>
        );

      case 'ubicacionActual':
        return (
          <td key="ubicacionActual" className={`${tdBase} text-slate-300 whitespace-nowrap`}>
            {vehicle.ubicacionActual || 'Base Central'}
          </td>
        );

      case 'fechaAlta':
        return (
          <td key="fechaAlta" className={`${tdBase} font-mono text-slate-400 whitespace-nowrap`}>
            {vehicle.fechaAlta || '-'}
          </td>
        );

      case 'ordenVisibilidad':
        return (
          <td key="ordenVisibilidad" className={`${tdBase} text-center whitespace-nowrap`}>
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full font-mono text-xs font-black bg-amber-500/15 text-amber-300 border border-amber-500/30">
              #{vehicle.ordenVisibilidad ?? '-'}
            </span>
          </td>
        );

      case 'publicarEnWeb': {
        const isWebVisible = vehicle.publicarEnWeb !== false;
        return (
          <td key="publicarEnWeb" className={`${tdBase} text-center whitespace-nowrap`}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onToggleWeb) {
                  onToggleWeb(vehicle.id);
                }
              }}
              className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-md border transition-all cursor-pointer select-none active:scale-95 ${
                isWebVisible
                  ? 'font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/25 border-emerald-500/30 hover:border-emerald-400 shadow-xs'
                  : 'font-medium text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-700/80 border-slate-700/60 hover:border-slate-500'
              }`}
              title={
                isWebVisible
                  ? 'Habilitado en Web (Click para ocultar este vehículo)'
                  : 'Oculto en Web (Click para habilitar y mostrar este vehículo)'
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isWebVisible ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
              <span>{isWebVisible ? 'Visible' : 'Oculto'}</span>
            </button>
          </td>
        );
      }

      default:
        return null;
    }
  };

  const visibleCount = columnOrder.filter(k => visibleColumns[k]).length;

  return (
    <div className="space-y-4">
      {/* Controls & Filter Bar (Bento style) */}
      <div className="bg-[#16191F] p-4 rounded-xl border border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              id="search-fleet"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código, modelo, marca, patente, código interno o categoría..."
              className="w-full pl-10 pr-4 py-2 bg-[#0F1115] border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Action Tools & View Switcher */}
          <div className="flex items-center flex-wrap gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-[#0F1115] p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'table'
                    ? 'bg-slate-800 text-amber-500 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Vista de Tabla"
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">Tabla</span>
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'cards'
                    ? 'bg-[#2D2D2D] text-[#F0C800] font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Vista de Tarjetas Bento"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Tarjetas</span>
              </button>
            </div>

            {/* Table Density Selector (3 levels) */}
            <TableDensitySelector
              density={activeDensity}
              onChangeDensity={handleDensityChange}
            />

            {/* Column Visibility & Drag Reorder Manager Button */}
            <button
              id="btn-open-column-config"
              onClick={onOpenColumnModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F1115] hover:bg-[#2D2D2D] text-xs font-semibold text-slate-300 border border-[#2D2D2D] transition cursor-pointer group"
              title="Personalizar qué columnas ver y reordenar con drag & drop"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#F0C800] group-hover:rotate-45 transition-transform" />
              <span>Columnas ({visibleCount})</span>
            </button>

            {/* Import / Export Hub Button */}
            {onOpenImportExport && (
              <button
                type="button"
                onClick={onOpenImportExport}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F1115] hover:bg-[#2D2D2D] text-xs font-semibold text-slate-300 border border-[#2D2D2D] transition cursor-pointer"
                title="Importar y Exportar datos de Flota (Excel / CSV / Plantilla)"
              >
                <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
                <span>Importar / Exportar</span>
              </button>
            )}

            {/* Export Quick CSV */}
            {onExportCSV && (
              <button
                type="button"
                onClick={onExportCSV}
                className="hidden xl:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F1115] hover:bg-[#2D2D2D] text-xs font-semibold text-slate-300 border border-[#2D2D2D] transition cursor-pointer"
                title="Descargar archivo CSV oficial"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>CSV</span>
              </button>
            )}

            {/* Limpiar Registros button */}
            {onClearFleet && (
              <button
                type="button"
                onClick={onClearFleet}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white text-xs font-bold border border-rose-500/40 hover:border-rose-400 transition cursor-pointer shadow-sm group"
                title="Limpiar y vaciar registros de vehículos de la base de datos y memoria"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
                <span>Limpiar Registros</span>
              </button>
            )}

            {/* Dar de alta button */}
            <button
              id="btn-alta-vehiculo"
              onClick={onOpenCreateModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] text-xs font-black rounded-xl shadow-md shadow-[#F0C800]/20 transition cursor-pointer border border-[#DDA800]"
            >
              <PlusCircle className="w-4 h-4 text-[#2D2D2D] stroke-[2.5]" />
              <span>+ Alta de Vehículo</span>
            </button>
          </div>
        </div>

        {/* Archive Segment Switcher (Activos / Archivados / Todos) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#2D2D2D] text-xs">
          <div className="flex items-center gap-1.5 p-1 bg-[#0F1115] rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setArchiveFilter('ACTIVOS')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                archiveFilter === 'ACTIVOS'
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Flota Activa ({activeCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setArchiveFilter('ARCHIVADOS')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                archiveFilter === 'ARCHIVADOS'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archivados / Bajas ({archivedCount})</span>
              {archivedCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  archiveFilter === 'ARCHIVADOS' ? 'bg-black/40 text-white' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {archivedCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setArchiveFilter('TODOS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                archiveFilter === 'TODOS'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Todos ({fleet.length})
            </button>
          </div>

          {archiveFilter === 'ARCHIVADOS' && (
            <div className="text-xs text-amber-300/80 flex items-center gap-1.5 bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20">
              <Archive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Vehículos archivados (fuera de empresa). Historiales de gastos, servicios y alquileres preservados.</span>
            </div>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#2D2D2D] text-xs">
          {/* Status Quick Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mr-1">Estado:</span>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-[#F0C800] text-[#2D2D2D]'
                  : 'bg-[#1F2228] text-slate-400 hover:bg-[#2D2D2D] hover:text-white border border-[#2D2D2D]'
              }`}
            >
              Todos ({fleet.length})
            </button>

            <button
              onClick={() => setStatusFilter('DISPONIBLE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === 'DISPONIBLE'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-950/30 text-emerald-400 border border-emerald-800/40 hover:bg-emerald-950/60'
              }`}
            >
              Disponibles ({fleet.filter(v => v.estado === 'DISPONIBLE').length})
            </button>

            <button
              onClick={() => setStatusFilter('ALQUILADO')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === 'ALQUILADO'
                  ? 'bg-[#F0C800] text-[#2D2D2D]'
                  : 'bg-[#F0C800]/10 text-[#F0C800] border border-[#F0C800]/30 hover:bg-[#F0C800]/20'
              }`}
            >
              En Alquiler ({fleet.filter(v => v.estado === 'ALQUILADO').length})
            </button>

            <button
              onClick={() => setStatusFilter('EN_MANTENIMIENTO')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === 'EN_MANTENIMIENTO'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-950/30 text-red-400 border border-red-800/40 hover:bg-red-950/60'
              }`}
            >
              Mantenimiento ({fleet.filter(v => v.estado === 'EN_MANTENIMIENTO').length})
            </button>
          </div>

          {/* Classification Dropdown filter */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Categoría:</span>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[#1F2228] border border-[#2D2D2D] text-xs font-semibold text-slate-300 outline-none focus:border-[#F0C800]"
            >
              <option value="ALL">Todas las Categorías</option>
              {availableClassifications.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Drag & Drop Hint Bar */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
        <span className="flex items-center gap-1.5">
          <GripVertical className="w-3.5 h-3.5 text-[#F0C800]/80" />
          <span>Tip: Puedes arrastrar cualquier encabezado de columna para reordenar la tabla en vivo.</span>
        </span>
        <span>
          Mostrando <strong className="text-white">{processedFleet.length}</strong> de <strong className="text-white">{fleet.length}</strong> equipos
        </span>
      </div>

      {/* Main Table Layout (Bento Grid Card) */}
      {viewMode === 'table' ? (
        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              {/* Table Header with Drag & Drop */}
              <thead>
                <tr className="bg-[#1F2228] text-[10px] text-slate-400 font-bold uppercase tracking-wider select-none border-b border-[#2D2D2D]">
                  {columnOrder.map(colKey => renderHeaderCell(colKey))}

                  {/* ACCIONES (Fixed column) */}
                  <th className={`${densityCfg.thPadding} border-b border-[#2D2D2D] text-center ${activeDensity === 'ultra' ? 'w-16' : activeDensity === 'compact' ? 'w-20' : 'w-24'} sticky right-0 bg-[#1F2228] z-20 border-l border-[#2D2D2D] shadow-[-6px_0_12px_rgba(0,0,0,0.4)]`}>
                    <span className={densityCfg.headerFontSize}>ACCIONES</span>
                  </th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className={densityCfg.fontSize}>
                {processedFleet.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCount + 1} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Search className="w-8 h-8 text-slate-600" />
                        <p className="text-sm font-semibold text-slate-300">No se encontraron vehículos ni máquinas</p>
                        <p className="text-xs text-slate-500">
                          Prueba ajustando los filtros de búsqueda o da de alta un nuevo equipo.
                        </p>
                        <button
                          onClick={onOpenCreateModal}
                          className="mt-2 px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] font-black rounded-lg text-xs"
                        >
                          + Dar de Alta Vehículo
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  processedFleet.map((vehicle, idx) => {
                    const isEven = idx % 2 === 1;

                    return (
                      <tr 
                        key={vehicle.id}
                        className={`border-b border-[#2D2D2D]/60 hover:bg-[#1F2228]/80 transition group ${isEven ? 'bg-[#16191F]/40' : ''}`}
                      >
                        {columnOrder.map(colKey => renderBodyCell(colKey, vehicle))}

                        {/* ACCIONES */}
                        <td className={`${densityCfg.tdPadding} text-center whitespace-nowrap sticky right-0 bg-[#16191F] group-hover:bg-[#1C2028] border-l border-[#2D2D2D] shadow-[-6px_0_12px_rgba(0,0,0,0.4)] z-10`}>
                          <div className={`flex items-center justify-center ${densityCfg.gap}`}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleDashboard && onToggleDashboard(vehicle.id);
                              }}
                              className={`${densityCfg.btnPadding} rounded transition cursor-pointer font-mono text-[10px] font-bold px-1.5 py-1 ${
                                vehicle.mostrarEnDashboard !== false
                                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40'
                                  : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300 border border-slate-700'
                              }`}
                              title={vehicle.mostrarEnDashboard !== false ? 'Visible en Dashboard de Control (Click para ocultar)' : 'Oculto del Dashboard de Control (Click para mostrar)'}
                            >
                              {vehicle.mostrarEnDashboard !== false ? 'Dashboard: Sí' : 'Dashboard: No'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewDetails(vehicle);
                              }}
                              className={`${densityCfg.btnPadding} rounded text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer`}
                              title="Ver ficha técnica"
                            >
                              <Eye className={densityCfg.iconSize} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditVehicle(vehicle);
                              }}
                              className={`${densityCfg.btnPadding} rounded text-slate-400 hover:text-[#F0C800] hover:bg-slate-700 transition cursor-pointer`}
                              title="Editar vehículo"
                            >
                              <Edit3 className={densityCfg.iconSize} />
                            </button>
                            {onArchiveVehicle && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onArchiveVehicle(vehicle);
                                }}
                                className={`${densityCfg.btnPadding} rounded text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition cursor-pointer`}
                                title={vehicle.archivado ? "Desarchivar y reincorporar a flota activa" : "Archivar vehículo (fuera de empresa, conserva historiales)"}
                              >
                                {vehicle.archivado ? (
                                  <ArchiveRestore className={densityCfg.iconSize} />
                                ) : (
                                  <Archive className={densityCfg.iconSize} />
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteVehicle(vehicle.id);
                              }}
                              className={`${densityCfg.btnPadding} rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition cursor-pointer`}
                              title="Eliminar de flota"
                            >
                              <Trash2 className={densityCfg.iconSize} />
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

          {/* Bento Table Footer */}
          <div className="p-4 border-t border-[#2D2D2D] flex items-center justify-between bg-[#16191F] text-xs">
            <div className="text-slate-400">
              Mostrando <span className="text-white font-bold">{processedFleet.length}</span> de <span className="text-white font-bold">{fleet.length}</span> registros de flota
            </div>
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <span className="font-mono text-[11px] bg-[#1F2228] border border-[#2D2D2D] px-2 py-0.5 rounded text-[#F0C800] font-black">
                LA HORMIGA • SISTEMA DE GESTIÓN
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Visual Bento Cards Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {processedFleet.map((vehicle) => (
            <div
              key={vehicle.id}
              className="bg-[#16191F] border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition flex flex-col"
            >
              {/* Card Image */}
              <div className="relative h-40 bg-slate-900 overflow-hidden">
                <img
                  src={vehicle?.fotografia || 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=800&q=80'}
                  alt={vehicle?.modeloMarca || ''}
                  className="w-full h-full object-cover hover:scale-105 transition duration-300"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=800&q=80';
                  }}
                />
                <div className="absolute top-3 left-3">
                  <span className="px-2 py-1 rounded bg-[#0F1115]/90 text-amber-500 font-bold text-xs border border-slate-800 font-mono">
                    {vehicle.id}
                  </span>
                </div>
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  {vehicle.archivado && (
                    <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] tracking-wider uppercase shadow">
                      ARCHIVADO
                    </span>
                  )}
                  <StatusBadge status={vehicle.estado} size="sm" />
                </div>
                <div className="absolute bottom-2 left-3 right-3 text-slate-300 text-[11px] bg-[#0F1115]/80 backdrop-blur-xs px-2.5 py-1 rounded flex justify-between items-center font-mono">
                  <span>ID: {vehicle.id}</span>
                  {vehicle.anio && (
                    <span className="text-amber-400 font-bold">Año: {vehicle.anio}</span>
                  )}
                  <span>Pat: {vehicle.patente}</span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${
                        vehicle.clasificacion === 'Vehículos de Terceros' ? 'text-purple-400 font-extrabold' : 'text-slate-500'
                      }`}>
                        {vehicle.clasificacion}
                      </span>
                      {vehicle.clasificacion === 'Vehículos de Terceros' && (
                        <span className="text-[9px] font-bold text-purple-300 bg-purple-900/50 border border-purple-700/60 px-1.5 py-0.2 rounded font-sans">
                          Tercero
                        </span>
                      )}
                      {vehicle.anio && (
                        <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 rounded font-mono">
                          {vehicle.anio}
                        </span>
                      )}
                    </div>
                    {vehicle.archivado && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                        Fuera de Empresa
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-bold text-white mt-0.5">
                    {vehicle.modeloMarca}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 truncate">
                    📍 {vehicle.ubicacionActual || 'Base Central'}
                  </p>
                </div>

                {/* Price pill */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-bold">Costo / Sugerido</span>
                    <div className="font-mono text-xs">
                      <span className="text-slate-500 line-through mr-1.5">{formatCurrency(vehicle.precioCosto)}</span>
                      <span className="text-amber-500 font-bold">{formatCurrency(vehicle.precioSugerido)}/d</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onToggleWeb && (
                      <button
                        type="button"
                        onClick={() => onToggleWeb(vehicle.id)}
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition cursor-pointer ${
                          vehicle.publicarEnWeb !== false
                            ? 'font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30'
                            : 'font-medium text-slate-400 bg-slate-800/70 hover:bg-slate-700 border-slate-700'
                        }`}
                        title={
                          vehicle.publicarEnWeb !== false
                            ? 'Habilitado en Web (Click para ocultar)'
                            : 'Oculto en Web (Click para mostrar)'
                        }
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            vehicle.publicarEnWeb !== false ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                        <span>{vehicle.publicarEnWeb !== false ? 'Visible' : 'Oculto'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => onViewDetails(vehicle)}
                      className="px-2.5 py-1 rounded bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-amber-500 hover:text-black transition cursor-pointer"
                    >
                      Ficha
                    </button>
                    <button
                      onClick={() => onEditVehicle(vehicle)}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                      title="Editar"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {onArchiveVehicle && (
                      <button
                        onClick={() => onArchiveVehicle(vehicle)}
                        className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition cursor-pointer"
                        title={vehicle.archivado ? "Desarchivar y reincorporar a flota activa" : "Archivar vehículo (fuera de empresa)"}
                      >
                        {vehicle.archivado ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Image Preview Modal */}
      {imagePreviewUrl && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in"
          onClick={() => setImagePreviewUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] rounded-xl overflow-hidden border border-slate-700 bg-[#16191F]">
            <img
              src={imagePreviewUrl}
              alt="Vista ampliada"
              className="w-full h-full object-contain max-h-[80vh]"
            />
            <button
              onClick={() => setImagePreviewUrl(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/80 text-white hover:bg-amber-500 hover:text-black transition font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
