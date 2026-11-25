import React, { useState, useMemo } from 'react';
import {
  ArcaInvoice,
  ClientRecord,
  CustomerPaymentReceipt,
  Obra,
  ObraDuracionCategoria,
  ParteDiario,
  RentalContract,
  TableDensity,
} from '../types';
import { formatCurrency } from '../services/storage';
import { TableDensitySelector } from './TableDensitySelector';
import { SearchableSelect } from './SearchableSelect';
import { DENSITY_CONFIG, getSavedTableDensity, saveTableDensity } from '../utils/densityStyles';
import {
  buildUnifiedObrasList,
  isAutoDetectedObra,
  ObraFullLegajoSummary,
  resolveObraFullLegajo,
  UnifiedObraItem,
} from '../utils/obraLegajoResolver';
import {
  ObraFacturaPreviewModal,
  ObraReceiptPreviewModal,
} from './Obras/ObraLegajoFacturaPagoModals';
import {
  Building2,
  Plus,
  Search,
  FileSpreadsheet,
  MapPin,
  DollarSign,
  UserCheck,
  CheckCircle2,
  Eye,
  Edit3,
  Trash2,
  UploadCloud,
  Archive,
  ArchiveRestore,
  Receipt,
  Banknote,
  ClipboardList,
  Clock,
  FolderOpen,
} from 'lucide-react';

interface ObrasSectionProps {
  obras: Obra[];
  clients?: ClientRecord[];
  partesDiarios?: ParteDiario[];
  rentals?: RentalContract[];
  arcaInvoices?: ArcaInvoice[];
  customerReceipts?: CustomerPaymentReceipt[];
  density?: TableDensity;
  onChangeDensity?: (density: TableDensity) => void;
  onOpenCreateModal: () => void;
  onViewDetails: (
    obra: Obra,
    initialTab?: 'info' | 'valorizado' | 'facturas' | 'contenedores' | 'personal' | 'combustible' | 'costos' | 'partes'
  ) => void;
  onEditObra: (obra: Obra) => void;
  onArchiveObra?: (obra: Obra) => void;
  onDeleteObra: (id: string) => void;
  onExportCSV: () => void;
  onOpenImportExport?: () => void;
  onNavigateToArca?: (invoice: ArcaInvoice) => void;
  onNavigateToCobranzas?: () => void;
}

const cleanCuitObra = (v?: string) => String(v || '').replace(/\D/g, '');
const cleanNameObra = (v?: string) => String(v || '').trim().toUpperCase();

type EstadoFilterType = 'TODAS' | 'TERMINADAS' | 'EN_CURSO' | 'PENDIENTES_COBRO' | 'ACTIVAS' | 'INACTIVAS';

export const ObrasSection: React.FC<ObrasSectionProps> = ({
  obras,
  clients = [],
  partesDiarios = [],
  rentals = [],
  arcaInvoices = [],
  customerReceipts = [],
  density,
  onChangeDensity,
  onOpenCreateModal,
  onViewDetails,
  onEditObra,
  onArchiveObra,
  onDeleteObra,
  onExportCSV,
  onOpenImportExport,
  onNavigateToArca,
  onNavigateToCobranzas,
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
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilterType>('TODAS');
  const [categoriaFilter, setCategoriaFilter] = useState<'TODAS' | ObraDuracionCategoria>('TODAS');
  const [clienteFilter, setClienteFilter] = useState<string>('TODOS');
  const [archiveFilter, setArchiveFilter] = useState<'VIGENTES' | 'ARCHIVADAS' | 'TODAS'>('VIGENTES');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [previewInvoice, setPreviewInvoice] = useState<ArcaInvoice | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<CustomerPaymentReceipt | null>(null);

  // Unificar obras de Supabase + Obras Esporádicas/Cortas detectadas desde Partes Diarios y Contratos
  const unifiedObras: UnifiedObraItem[] = useMemo(
    () =>
      buildUnifiedObrasList({
        obras,
        partesDiarios,
        rentals,
        arcaInvoices,
        clients,
      }),
    [obras, partesDiarios, rentals, arcaInvoices, clients]
  );

  // Resolver el legajo integral (partes, facturas, recibos de pago y estado automático) para cada obra
  const legajoByObraId = useMemo(() => {
    const map = new Map<string, ObraFullLegajoSummary>();
    unifiedObras.forEach((obra) => {
      map.set(
        obra.id,
        resolveObraFullLegajo({
          obra,
          partesDiarios,
          rentals,
          arcaInvoices,
          customerReceipts,
        })
      );
    });
    return map;
  }, [unifiedObras, partesDiarios, rentals, arcaInvoices, customerReceipts]);

  const vigentesCount = useMemo(() => unifiedObras.filter((o) => !o.archivado).length, [unifiedObras]);
  const archivedCount = useMemo(() => unifiedObras.filter((o) => !!o.archivado).length, [unifiedObras]);
  const autoDetectedCount = useMemo(
    () => unifiedObras.filter((o) => isAutoDetectedObra(o)).length,
    [unifiedObras]
  );

  // Helper to match an Obra to a ClientRecord
  const obraMatchesClient = (obra: Obra, client: ClientRecord): boolean => {
    if (obra.clienteId && obra.clienteId === client.id) return true;
    const cCuit = cleanCuitObra(client.cuit);
    if (cCuit.length >= 7 && cleanCuitObra(obra.clienteCuit) === cCuit) return true;
    const cName = cleanNameObra(client.razonSocial);
    const oName = cleanNameObra(obra.clienteNombre || obra.pertenece);
    return Boolean(cName && oName && cName === oName);
  };

  const clientFilterOptions = useMemo(() => {
    const opts = clients
      .map((c) => {
        const count = unifiedObras.filter((o) => obraMatchesClient(o, c)).length;
        return {
          value: c.id,
          label: `${c.razonSocial} (${count} ${count === 1 ? 'obra' : 'obras'})`,
          secondaryText: c.cuit ? `CUIT: ${c.cuit}${c.codigo ? ` · ${c.codigo}` : ''}` : c.codigo,
          extraSearchTerms: `${c.cuit || ''} ${c.codigo || ''}`,
          count,
        };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));

    return [
      { value: 'TODOS', label: 'Todos los Clientes' },
      ...opts.map(({ count: _count, ...rest }) => rest),
    ];
  }, [clients, unifiedObras]);

  // Stats
  const stats = useMemo(() => {
    const vigentes = unifiedObras.filter((o) => !o.archivado);
    const total = vigentes.length;
    const terminadas = vigentes.filter(
      (o) => legajoByObraId.get(o.id)?.estadoLegajo === 'TERMINADA_PAGADA'
    ).length;
    const activas = vigentes.filter((o) => o.activa).length;
    const montoTotalEstimado = vigentes.reduce((acc, o) => acc + (o.montoEstimado || 0), 0);
    const totalFacturadoVigente = vigentes.reduce(
      (acc, o) => acc + (legajoByObraId.get(o.id)?.totalFacturado || 0),
      0
    );
    return { total, terminadas, activas, montoTotalEstimado, totalFacturadoVigente };
  }, [unifiedObras, legajoByObraId]);

  // Contadores por categoría en el scope actual de archivo (Vigentes / Archivadas / Todas)
  const categoryCounts = useMemo(() => {
    const scoped = unifiedObras.filter((o) => {
      if (archiveFilter === 'VIGENTES') return !o.archivado;
      if (archiveFilter === 'ARCHIVADAS') return !!o.archivado;
      return true;
    });
    return {
      TODAS: scoped.length,
      LARGA: scoped.filter((o) => (o.categoriaDuracion || 'LARGA') === 'LARGA').length,
      CORTA: scoped.filter((o) => o.categoriaDuracion === 'CORTA').length,
      ESPORADICA: scoped.filter((o) => o.categoriaDuracion === 'ESPORADICA').length,
    };
  }, [unifiedObras, archiveFilter]);

  // Filtered obras
  const filteredObras = useMemo(() => {
    const selectedCli = clienteFilter !== 'TODOS' ? clients.find((c) => c.id === clienteFilter) : undefined;
    const q = searchTerm.trim().toLowerCase();

    return unifiedObras
      .filter((obra) => {
        if (archiveFilter === 'VIGENTES' && obra.archivado) return false;
        if (archiveFilter === 'ARCHIVADAS' && !obra.archivado) return false;

        if (selectedCli && !obraMatchesClient(obra, selectedCli)) return false;

        const legajo = legajoByObraId.get(obra.id);

        const matchesSearch =
          !q ||
          obra.nombreObra.toLowerCase().includes(q) ||
          obra.numero.toLowerCase().includes(q) ||
          obra.ubicacion.toLowerCase().includes(q) ||
          obra.pertenece.toLowerCase().includes(q) ||
          (obra.clienteNombre || '').toLowerCase().includes(q) ||
          (obra.clienteCuit || '').toLowerCase().includes(q) ||
          Boolean(
            legajo?.linkedArcaInvoices.some((inv) =>
              `${String(inv.puntoVenta).padStart(4, '0')}-${String(inv.numeroComprobante).padStart(8, '0')}`
                .toLowerCase()
                .includes(q)
            )
          ) ||
          Boolean(legajo?.linkedReceipts.some((rec) => rec.numeroRecibo.toLowerCase().includes(q)));

        let matchesEstado = true;
        if (estadoFilter === 'TERMINADAS') {
          matchesEstado = legajo?.estadoLegajo === 'TERMINADA_PAGADA';
        } else if (estadoFilter === 'EN_CURSO') {
          matchesEstado =
            legajo?.estadoLegajo === 'EN_CURSO_CON_PARTES' ||
            legajo?.estadoLegajo === 'FACTURADA_PARCIAL_PAGADA' ||
            (obra.activa && legajo?.estadoLegajo !== 'TERMINADA_PAGADA');
        } else if (estadoFilter === 'PENDIENTES_COBRO') {
          matchesEstado =
            legajo?.estadoLegajo === 'FACTURADA_PENDIENTE' ||
            legajo?.estadoLegajo === 'COBRO_PARCIAL';
        } else if (estadoFilter === 'ACTIVAS') {
          matchesEstado = obra.activa;
        } else if (estadoFilter === 'INACTIVAS') {
          matchesEstado = !obra.activa;
        }

        const cat = obra.categoriaDuracion || 'LARGA';
        const matchesCategoria = categoriaFilter === 'TODAS' || cat === categoriaFilter;

        return matchesSearch && matchesEstado && matchesCategoria;
      })
      .sort((a, b) => {
        const legA = legajoByObraId.get(a.id);
        const legB = legajoByObraId.get(b.id);
        const lastA = legA?.lastParteFecha || a.fechaAlta || '';
        const lastB = legB?.lastParteFecha || b.fechaAlta || '';
        if (lastB !== lastA) return lastB.localeCompare(lastA);
        return (legB?.obraPartes.length || 0) - (legA?.obraPartes.length || 0);
      });
  }, [
    unifiedObras,
    legajoByObraId,
    clients,
    clienteFilter,
    searchTerm,
    estadoFilter,
    categoriaFilter,
    archiveFilter,
  ]);

  // Contar coincidencias en Archivadas cuando se está filtrando en Vigentes
  const hiddenArchivedMatchCount = useMemo(() => {
    if (archiveFilter !== 'VIGENTES') return 0;
    const hasActiveFilter =
      Boolean(searchTerm.trim()) ||
      clienteFilter !== 'TODOS' ||
      estadoFilter !== 'TODAS' ||
      categoriaFilter !== 'TODAS';
    if (!hasActiveFilter) return 0;
    const selectedCli = clienteFilter !== 'TODOS' ? clients.find((c) => c.id === clienteFilter) : undefined;
    const q = searchTerm.trim().toLowerCase();

    return unifiedObras.filter((obra) => {
      if (!obra.archivado) return false;
      if (selectedCli && !obraMatchesClient(obra, selectedCli)) return false;
      const legajo = legajoByObraId.get(obra.id);
      const matchesSearch =
        !q ||
        obra.nombreObra.toLowerCase().includes(q) ||
        obra.numero.toLowerCase().includes(q) ||
        obra.ubicacion.toLowerCase().includes(q) ||
        obra.pertenece.toLowerCase().includes(q) ||
        (obra.clienteNombre || '').toLowerCase().includes(q) ||
        (obra.clienteCuit || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
      const cat = obra.categoriaDuracion || 'LARGA';
      if (categoriaFilter !== 'TODAS' && cat !== categoriaFilter) return false;
      if (estadoFilter === 'TERMINADAS' && legajo?.estadoLegajo !== 'TERMINADA_PAGADA') return false;
      if (estadoFilter === 'INACTIVAS' && obra.activa) return false;
      return true;
    }).length;
  }, [
    archiveFilter,
    searchTerm,
    clienteFilter,
    estadoFilter,
    categoriaFilter,
    unifiedObras,
    clients,
    legajoByObraId,
  ]);

  // Paginated slice
  const totalPages = Math.ceil(filteredObras.length / pageSize) || 1;
  const paginatedObras = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredObras.slice(start, start + pageSize);
  }, [filteredObras, currentPage, pageSize]);

  const renderEstadoBadge = (obra: UnifiedObraItem, legajo?: ObraFullLegajoSummary) => {
    if (!legajo) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
          {obra.activa ? 'ACTIVA' : 'INACTIVA'}
        </span>
      );
    }

    if (legajo.estadoLegajo === 'TERMINADA_PAGADA') {
      return (
        <div className="inline-flex flex-col items-center gap-0.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/45 shadow-sm">
            <CheckCircle2 className="w-3 h-3" />
            OBRA TERMINADA
          </span>
          <span className="text-[10px] text-emerald-400/80 font-mono">Pagada 100%</span>
        </div>
      );
    }

    if (legajo.estadoLegajo === 'FACTURADA_PARCIAL_PAGADA') {
      return (
        <div className="inline-flex flex-col items-center gap-0.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40">
            <CheckCircle2 className="w-3 h-3" />
            COBRADA PARCIAL
          </span>
          <span className="text-[10px] text-slate-400 font-mono">{legajo.estadoSubtitle}</span>
        </div>
      );
    }

    if (legajo.estadoLegajo === 'COBRO_PARCIAL') {
      return (
        <div className="inline-flex flex-col items-center gap-0.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
            <Clock className="w-3 h-3" />
            COBRO PARCIAL
          </span>
          <span className="text-[10px] text-blue-300/80 font-mono">{legajo.estadoSubtitle}</span>
        </div>
      );
    }

    if (legajo.estadoLegajo === 'FACTURADA_PENDIENTE') {
      return (
        <div className="inline-flex flex-col items-center gap-0.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/35">
            <Receipt className="w-3 h-3" />
            PENDIENTE COBRO
          </span>
          <span className="text-[10px] text-rose-300/80 font-mono">{legajo.estadoSubtitle}</span>
        </div>
      );
    }

    if (legajo.estadoLegajo === 'EN_CURSO_CON_PARTES') {
      return (
        <div className="inline-flex flex-col items-center gap-0.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/35">
            <Clock className="w-3 h-3" />
            EN CURSO
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {legajo.obraPartes.length} parte(s) s/fact.
          </span>
        </div>
      );
    }

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
          obra.archivado
            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            : obra.activa
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
            : 'bg-slate-800 text-slate-400 border border-slate-700'
        }`}
      >
        {obra.archivado ? 'ARCHIVADA' : obra.activa ? 'ACTIVA' : 'INACTIVA'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl p-6 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-[#F0C800]/10 border border-[#F0C800]/30 text-[#F0C800] text-xs font-black uppercase tracking-wider">
              Gestión de Obras y Legajos
            </span>
            <span className="text-xs text-slate-400">
              • {vigentesCount} vigentes ({stats.terminadas} terminadas/pagadas)
              {autoDetectedCount > 0 ? ` • ${autoDetectedCount} esporádicas/cortas desde partes` : ''}
              {archivedCount > 0 ? ` • ${archivedCount} archivadas` : ''}
            </span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5 font-display">
            <Building2 className="w-7 h-7 text-[#F0C800]" />
            <span>Obras y Proyectos</span>
          </h1>
          <p className="text-sm text-slate-400 mt-0.5 font-medium">
            Todas las obras (Largas, Cortas y Esporádicas) con estado automático según partes, facturas y pagos.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {onOpenImportExport && (
            <button
              onClick={onOpenImportExport}
              className="px-4 py-2.5 bg-[#2D2D2D] hover:bg-[#383838] text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 border border-slate-700 shadow-sm"
              title="Importar / Exportar masivo"
            >
              <UploadCloud className="w-4 h-4 text-[#F0C800]" />
              <span>Importar / Exportar</span>
            </button>
          )}

          <button
            onClick={onExportCSV}
            className="px-4 py-2.5 bg-[#2D2D2D] hover:bg-[#383838] text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 border border-slate-700 shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={onOpenCreateModal}
            className="px-5 py-2.5 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] rounded-xl text-xs font-black transition cursor-pointer shadow-md shadow-[#F0C800]/20 flex items-center gap-2 border border-[#DDA800]"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Nueva Obra</span>
          </button>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Obras Vigentes (Todas)</p>
            <h3 className="text-2xl font-bold text-white mt-1 font-mono">{stats.total}</h3>
            {autoDetectedCount > 0 && (
              <p className="text-[11px] text-cyan-400 mt-0.5">
                Incluye {autoDetectedCount} desde Partes
              </p>
            )}
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Terminadas (Pagadas 100%)</p>
            <h3 className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{stats.terminadas}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Partes facturados y cobrados</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Archivadas / Históricas</p>
            <h3 className="text-2xl font-bold text-amber-400 mt-1 font-mono">{archivedCount}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Archive className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Facturado Vinculado (Vigentes)</p>
            <h3 className="text-xl font-bold text-amber-400 mt-1 font-mono">
              {formatCurrency(stats.totalFacturadoVigente)}
            </h3>
            {stats.montoTotalEstimado > 0 && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                Presup. est.: {formatCurrency(stats.montoTotalEstimado)}
              </p>
            )}
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4 shadow-md space-y-3">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Buscar obra, cliente, factura o recibo..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
              {[
                { key: 'TODAS' as EstadoFilterType, label: 'TODAS' },
                { key: 'TERMINADAS' as EstadoFilterType, label: '✅ TERMINADAS' },
                { key: 'EN_CURSO' as EstadoFilterType, label: 'EN CURSO' },
                { key: 'PENDIENTES_COBRO' as EstadoFilterType, label: 'PEND. COBRO' },
                { key: 'INACTIVAS' as EstadoFilterType, label: 'INACTIVAS' },
              ].map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => {
                    setEstadoFilter(filter.key);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    estadoFilter === filter.key
                      ? filter.key === 'TERMINADAS'
                        ? 'bg-emerald-500 text-black shadow'
                        : 'bg-amber-500 text-black shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
              {[
                { key: 'TODAS' as const, label: `Todas (${categoryCounts.TODAS})` },
                { key: 'LARGA' as const, label: `🏗️ Largas (${categoryCounts.LARGA})` },
                { key: 'CORTA' as const, label: `⏱️ Cortas (${categoryCounts.CORTA})` },
                { key: 'ESPORADICA' as const, label: `⚡ Esporádicas (${categoryCounts.ESPORADICA})` },
              ].map((catOpt) => (
                <button
                  key={catOpt.key}
                  type="button"
                  onClick={() => {
                    setCategoriaFilter(catOpt.key);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    categoriaFilter === catOpt.key
                      ? 'bg-indigo-500 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {catOpt.label}
                </button>
              ))}
            </div>

            {clients.length > 0 && (
              <div className="w-full sm:w-64">
                <SearchableSelect
                  compact
                  options={clientFilterOptions}
                  value={clienteFilter}
                  onChange={(val) => {
                    setClienteFilter(val || 'TODOS');
                    setCurrentPage(1);
                  }}
                  placeholder="Filtrar por Cliente..."
                  searchPlaceholder="Buscar cliente o CUIT..."
                  clearValue="TODOS"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 justify-end">
            <TableDensitySelector density={activeDensity} onChangeDensity={handleDensityChange} />
          </div>
        </div>

        {/* Archive Segment Switcher (Vigentes / Archivadas / Todas) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#2D2D2D] text-xs">
          <div className="flex items-center gap-1.5 p-1 bg-[#0F1115] rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setArchiveFilter('VIGENTES');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                archiveFilter === 'VIGENTES'
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Obras Vigentes ({vigentesCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setArchiveFilter('ARCHIVADAS');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                archiveFilter === 'ARCHIVADAS'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archivadas / Historial ({archivedCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setArchiveFilter('TODAS');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                archiveFilter === 'TODAS'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Todas ({unifiedObras.length})
            </button>
          </div>

          {archiveFilter === 'ARCHIVADAS' && (
            <div className="text-xs text-amber-300/80 flex items-center gap-1.5 bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20">
              <Archive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Obras archivadas (historiales de partes diarios, facturas y pagos preservados).</span>
            </div>
          )}

          {hiddenArchivedMatchCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setArchiveFilter('TODAS');
                setCurrentPage(1);
              }}
              className="text-xs font-bold text-amber-300 hover:text-black hover:bg-amber-400 flex items-center gap-1.5 bg-amber-500/15 px-3 py-1.5 rounded-lg border border-amber-500/40 transition cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5 shrink-0" />
              <span>
                Hay {hiddenArchivedMatchCount} obra(s) más en Archivadas/Historial que coinciden — Ver Todas ({unifiedObras.length})
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-mono">
                <th className="px-4 py-3 font-bold">Número</th>
                <th className="px-4 py-3 font-bold">Obra & Legajo (Partes / Facturas / Pagos)</th>
                <th className="px-4 py-3 font-bold">Ubicación</th>
                <th className="px-4 py-3 font-bold">Cliente / Comitente</th>
                <th className="px-4 py-3 font-bold text-center">Estado</th>
                <th className="px-4 py-3 font-bold">Plazo / Fechas</th>
                <th className="px-4 py-3 font-bold text-right">Facturado / Cobrado</th>
                <th className="px-4 py-3 font-bold text-center sticky right-0 z-20 bg-[#121418] border-l border-slate-800 shadow-[-6px_0_12px_rgba(0,0,0,0.4)]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-xs">
              {paginatedObras.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Building2 className="w-8 h-8 text-slate-600" />
                      <p className="text-sm font-medium text-slate-400">
                        No se encontraron obras con los filtros seleccionados.
                      </p>
                      <button
                        onClick={() => {
                          setSearchTerm('');
                          setEstadoFilter('TODAS');
                          setCategoriaFilter('TODAS');
                          setClienteFilter('TODOS');
                          setArchiveFilter('TODAS');
                        }}
                        className="text-xs text-amber-400 hover:underline mt-1 cursor-pointer"
                      >
                        Limpiar filtros y ver todas
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedObras.map((obra) => {
                  const legajo = legajoByObraId.get(obra.id);
                  const isAuto = isAutoDetectedObra(obra);
                  const cat = obra.categoriaDuracion || 'LARGA';
                  const factCount =
                    (legajo?.activeBillingInvoices.length || 0) +
                    (legajo?.manualOnlyLegajos.length || 0);
                  const recCount = legajo?.linkedReceipts.length || 0;
                  const partesCount = legajo?.obraPartes.length || 0;

                  return (
                    <tr
                      key={obra.id}
                      className={`hover:bg-slate-900/60 transition group ${
                        obra.archivado
                          ? 'opacity-75 bg-amber-950/10'
                          : legajo?.estadoLegajo === 'TERMINADA_PAGADA'
                          ? 'bg-emerald-950/10'
                          : ''
                      } ${densityCfg.row}`}
                    >
                      <td className={`px-4 font-mono font-bold text-amber-400 ${densityCfg.cell}`}>
                        {obra.numero}
                      </td>
                      <td className={`px-4 font-bold text-white font-sans ${densityCfg.cell}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onViewDetails(obra, 'info')}
                            className="text-left hover:text-amber-400 transition cursor-pointer"
                            title="Abrir Legajo Completo de la Obra"
                          >
                            {obra.nombreObra}
                          </button>

                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                              cat === 'ESPORADICA'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                                : cat === 'CORTA'
                                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35'
                                : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                            }`}
                          >
                            {cat === 'ESPORADICA'
                              ? '⚡ Esporádica'
                              : cat === 'CORTA'
                              ? '⏱️ Corta'
                              : '🏗️ Larga'}
                          </span>

                          {isAuto && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 text-[10px] font-medium"
                              title="Obra detectada automáticamente desde Partes Diarios / Contratos"
                            >
                              Auto (Partes)
                            </span>
                          )}

                          {partesCount > 0 && (
                            <button
                              type="button"
                              onClick={() => onViewDetails(obra, 'partes')}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold cursor-pointer"
                              title="Consultar Partes Diarios vinculados a esta obra"
                            >
                              <ClipboardList className="w-3 h-3" />
                              {partesCount} {partesCount === 1 ? 'Parte' : 'Partes'}
                              {legajo && legajo.totalHoras > 0 ? ` · ${legajo.totalHoras.toFixed(1)}h` : ''}
                            </button>
                          )}

                          {factCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  legajo &&
                                  legajo.activeBillingInvoices.length === 1 &&
                                  legajo.manualOnlyLegajos.length === 0
                                ) {
                                  setPreviewInvoice(legajo.activeBillingInvoices[0]);
                                } else {
                                  onViewDetails(obra, 'facturas');
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 text-[10px] font-mono font-bold cursor-pointer"
                              title="Consultar Facturas vinculadas a esta obra"
                            >
                              <Receipt className="w-3 h-3" />
                              {factCount} Fact. • {formatCurrency(legajo?.totalFacturado || 0)}
                            </button>
                          )}

                          {recCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                if (legajo && legajo.linkedReceipts.length === 1) {
                                  setPreviewReceipt(legajo.linkedReceipts[0]);
                                } else {
                                  onViewDetails(obra, 'facturas');
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/35 text-[10px] font-mono font-bold cursor-pointer"
                              title="Consultar Recibos de Pago / Cobranzas de esta obra"
                            >
                              <Banknote className="w-3 h-3" />
                              {recCount} {recCount === 1 ? 'Pago' : 'Pagos'}
                            </button>
                          )}

                          {obra.archivado && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                              <Archive className="w-2.5 h-2.5" />
                              ARCHIVADA
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 text-slate-300 font-sans ${densityCfg.cell}`}>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate max-w-xs">{obra.ubicacion || '-'}</span>
                        </div>
                      </td>
                      <td className={`px-4 text-slate-300 font-sans ${densityCfg.cell}`}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate max-w-xs font-medium text-white">
                            {obra.clienteNombre || obra.pertenece || '-'}
                          </span>
                          {obra.clienteCodigo && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              {obra.clienteCodigo}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 text-center ${densityCfg.cell}`}>
                        {renderEstadoBadge(obra, legajo)}
                      </td>
                      <td className={`px-4 text-slate-300 font-mono ${densityCfg.cell}`}>
                        {obra.plazo || '-'}
                      </td>
                      <td className={`px-4 text-right font-mono ${densityCfg.cell}`}>
                        {legajo && legajo.totalFacturado > 0 ? (
                          <div>
                            <div className="font-bold text-emerald-400">
                              {formatCurrency(legajo.totalFacturado)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {legajo.saldoPendiente <= 0.5
                                ? 'Cobrado 100%'
                                : `Saldo: ${formatCurrency(legajo.saldoPendiente)}`}
                            </div>
                          </div>
                        ) : (
                          <span className="font-bold text-slate-400">
                            {obra.montoEstimado > 0 ? formatCurrency(obra.montoEstimado) : '-'}
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 text-center ${densityCfg.cell} sticky right-0 z-10 bg-[#16191F] group-hover:bg-[#1E232E] border-l border-slate-800 shadow-[-6px_0_12px_rgba(0,0,0,0.4)]`}
                      >
                        <div className="flex items-center justify-center gap-1 opacity-85 group-hover:opacity-100 transition">
                          <button
                            onClick={() => onViewDetails(obra, 'info')}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-amber-500/20 hover:text-amber-400 text-slate-300 transition cursor-pointer"
                            title="Consultar Legajo Completo (Resumen, Partes, Facturas, Pagos y Costos)"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onViewDetails(obra, 'facturas')}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-emerald-500/20 hover:text-emerald-400 text-slate-300 transition cursor-pointer"
                            title="Ver Facturas y Recibos de Pago de esta Obra"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onEditObra(obra)}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-blue-500/20 hover:text-blue-400 text-slate-300 transition cursor-pointer"
                            title={isAuto ? 'Guardar / Completar Ficha en Base de Obras' : 'Editar Obra'}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {onArchiveObra && (
                            <button
                              onClick={() => onArchiveObra(obra)}
                              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-amber-500/20 hover:text-amber-400 text-slate-300 transition cursor-pointer"
                              title={
                                obra.archivado
                                  ? 'Desarchivar y reincorporar a obras vigentes'
                                  : 'Archivar obra (conserva partes diarios e historiales)'
                              }
                            >
                              {obra.archivado ? (
                                <ArchiveRestore className="w-4 h-4 text-amber-400" />
                              ) : (
                                <Archive className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          {!isAuto && (
                            <button
                              onClick={() => onDeleteObra(obra.id)}
                              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-red-500/20 hover:text-red-400 text-slate-300 transition cursor-pointer"
                              title="Eliminar Obra"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              Mostrando {filteredObras.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} al{' '}
              {Math.min(currentPage * pageSize, filteredObras.length)} de {filteredObras.length} obras (
              {unifiedObras.length} total)
            </span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Filas por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-500"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
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
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded cursor-pointer transition"
            >
              ‹ Anterior
            </button>
            <span className="px-3 py-1 bg-slate-800 text-amber-400 font-bold rounded">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
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

      {/* Quick Factura & Recibo Preview Modals */}
      <ObraFacturaPreviewModal
        invoice={previewInvoice}
        allReceipts={customerReceipts}
        rentals={rentals}
        partesDiarios={partesDiarios}
        onClose={() => setPreviewInvoice(null)}
        onInspectReceipt={(rec) => setPreviewReceipt(rec)}
        onNavigateToArca={onNavigateToArca}
        onNavigateToCobranzas={onNavigateToCobranzas}
      />

      <ObraReceiptPreviewModal
        receipt={previewReceipt}
        allInvoices={arcaInvoices}
        onClose={() => setPreviewReceipt(null)}
        onInspectInvoice={(inv) => {
          setPreviewReceipt(null);
          setPreviewInvoice(inv);
        }}
        onNavigateToCobranzas={onNavigateToCobranzas}
      />
    </div>
  );
};
