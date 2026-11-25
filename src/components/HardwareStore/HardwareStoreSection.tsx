import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Search,
  AlertTriangle,
  Edit,
  Trash2,
  Download,
  Package,
  ChevronDown,
  ChevronUp,
  X,
  Wrench,
  Settings,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { HardwareProduct, Proveedor, SalonVentasConfig } from '../../types';
import { HardwareProductModal } from './HardwareProductModal';
import { SalonConfigPanel } from './SalonConfigPanel';
import { exportHardwareToCSV } from '../../services/storage';
import {
  calculatePricesFromCost,
  fetchSalonConfigFromCloud,
  loadSalonConfigLocal,
  saveSalonConfig,
} from '../../services/salonConfig';

interface HardwareStoreSectionProps {
  products: HardwareProduct[];
  proveedores?: Proveedor[];
  onSaveProduct: (product: HardwareProduct) => Promise<void> | void;
  onSaveProductsBatch?: (products: HardwareProduct[]) => Promise<void> | void;
  onDeleteProduct: (id: string) => void;
  onClearAllProducts?: () => void;
  onShowToast?: (msg: string) => void;
}

export const HardwareStoreSection: React.FC<HardwareStoreSectionProps> = ({
  products,
  proveedores = [],
  onSaveProduct,
  onSaveProductsBatch,
  onDeleteProduct,
  onClearAllProducts,
  onShowToast,
}) => {
  const [sectionTab, setSectionTab] = useState<'catalogo' | 'configuracion'>('catalogo');
  const [configInitialTab, setConfigInitialTab] = useState<
    'familias' | 'unidades' | 'sectores' | 'marcas' | 'listas'
  >('familias');

  const [config, setConfig] = useState<SalonVentasConfig>(() => loadSalonConfigLocal());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [familiaFilter, setFamiliaFilter] = useState<string>('TODAS');
  const [grupoFilter, setGrupoFilter] = useState<string>('TODOS');
  const [sectorFilter, setSectorFilter] = useState<string>('TODOS');
  const [activePriceListId, setActivePriceListId] = useState<string>(() => {
    const def = config.listasPrecios.find(l => l.esPredeterminada) || config.listasPrecios[0];
    return def?.id || '';
  });

  // Modal & Accordion
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<HardwareProduct | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Sync config from Supabase on mount
  useEffect(() => {
    let mounted = true;
    fetchSalonConfigFromCloud().then(remote => {
      if (!mounted) return;
      setConfig(remote);
      const def = remote.listasPrecios.find(l => l.esPredeterminada) || remote.listasPrecios[0];
      if (def) {
        setActivePriceListId(prev =>
          remote.listasPrecios.some(l => l.id === prev) ? prev : def.id
        );
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdateConfig = async (nextConfig: SalonVentasConfig, toastMsg?: string) => {
    setConfig(nextConfig);
    const res = await saveSalonConfig(nextConfig);
    if (!res.ok) {
      onShowToast?.(res.error || 'Guardado localmente (no se pudo confirmar en Supabase).');
    } else if (toastMsg) {
      onShowToast?.(toastMsg);
    }
  };

  const handleQuickAddBrand = async (brandName: string) => {
    const clean = brandName.trim();
    if (!clean) return;
    if (config.marcas.some(m => m.toLowerCase() === clean.toLowerCase())) return;
    const nextConfig: SalonVentasConfig = {
      ...config,
      marcas: [...config.marcas, clean].sort((a, b) => a.localeCompare(b)),
    };
    await handleUpdateConfig(nextConfig, `Marca "${clean}" creada y guardada.`);
  };

  const handleSaveModalProducts = async (items: HardwareProduct[]) => {
    if (items.length === 0) return;
    if (onSaveProductsBatch) {
      await onSaveProductsBatch(items);
    } else {
      for (const item of items) {
        await onSaveProduct(item);
      }
    }
  };

  const handleRecalculateCatalogPrices = async () => {
    if (products.length === 0) return;
    const updated = products.map(p => {
      const cost = p.precioCosto ?? p.precioVenta ?? 0;
      const calc = calculatePricesFromCost(cost, config.listasPrecios);
      return {
        ...p,
        precioCosto: cost,
        precioVenta: calc.precioVenta,
        preciosPorLista: calc.preciosPorLista,
        listasDePrecios: calc.listasDePrecios,
      };
    });
    await handleSaveModalProducts(updated);
    onShowToast?.(`Precios recalculados en ${updated.length} artículos según las listas activas.`);
  };

  const activePriceList = useMemo(() => {
    return (
      config.listasPrecios.find(l => l.id === activePriceListId) ||
      config.listasPrecios.find(l => l.esPredeterminada) ||
      config.listasPrecios[0] ||
      null
    );
  }, [config.listasPrecios, activePriceListId]);

  const getProductListPrice = (p: HardwareProduct): number => {
    const cost = p.precioCosto ?? 0;
    if (activePriceList) {
      if (p.preciosPorLista && typeof p.preciosPorLista[activePriceList.id] === 'number') {
        return p.preciosPorLista[activePriceList.id];
      }
      if (cost > 0) {
        return Math.round(cost * (1 + (activePriceList.margenPorcentaje || 0) / 100) * 100) / 100;
      }
    }
    return p.precioVenta || cost || 0;
  };

  // Available groups for selected familiaFilter
  const availableFilterGroups = useMemo(() => {
    if (familiaFilter === 'TODAS') return [];
    const fam = config.familias.find(f => f.id === familiaFilter || f.codigo === familiaFilter);
    return fam?.grupos || [];
  }, [config.familias, familiaFilter]);

  useEffect(() => {
    setGrupoFilter('TODOS');
  }, [familiaFilter]);

  // Statistics
  const stats = useMemo(() => {
    const totalItems = products.length;
    const valorCosto = products.reduce(
      (acc, p) => acc + (Number(p.precioCosto ?? 0) * Number(p.stockActual ?? 0)),
      0
    );
    const valorVenta = products.reduce(
      (acc, p) => acc + getProductListPrice(p) * Number(p.stockActual ?? 0),
      0
    );
    const bajoStock = products.filter(
      p => (p.stockActual ?? 0) <= (p.stockMinimoAlerta ?? 3)
    ).length;

    return { totalItems, valorCosto, valorVenta, bajoStock };
  }, [products, activePriceList]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter(p => {
      const matchSearch =
        !q ||
        (p.nombre || '').toLowerCase().includes(q) ||
        (p.descripcion || '').toLowerCase().includes(q) ||
        (p.descripcionAdicional || '').toLowerCase().includes(q) ||
        (p.codigo || '').toLowerCase().includes(q) ||
        (p.codigoInterno || '').toLowerCase().includes(q) ||
        (p.codigoDeBarras || '').toLowerCase().includes(q) ||
        (p.codigoProveedor || '').toLowerCase().includes(q) ||
        (p.marca || '').toLowerCase().includes(q) ||
        (p.familiaNombre || '').toLowerCase().includes(q) ||
        (p.grupoNombre || '').toLowerCase().includes(q) ||
        (p.varianteDetalle || '').toLowerCase().includes(q);

      const matchFam =
        familiaFilter === 'TODAS' ||
        p.familiaId === familiaFilter ||
        p.familiaCodigo === familiaFilter;

      const matchGrp =
        grupoFilter === 'TODOS' ||
        p.grupoId === grupoFilter ||
        p.grupoCodigo === grupoFilter;

      const matchSec =
        sectorFilter === 'TODOS' ||
        p.sectorId === sectorFilter ||
        p.sector === sectorFilter;

      return matchSearch && matchFam && matchGrp && matchSec;
    });
  }, [products, searchQuery, familiaFilter, grupoFilter, sectorFilter]);

  // Group by Familia › Grupo
  const groupedProducts = useMemo(() => {
    const groups: Record<string, HardwareProduct[]> = {};
    filteredProducts.forEach(p => {
      const famLabel = p.familiaNombre
        ? `${p.familiaCodigo ? `${p.familiaCodigo} ` : ''}${p.familiaNombre}`
        : 'Sin Familia Asignada';
      const grpLabel = p.grupoNombre
        ? `${p.grupoCodigo ? `${p.grupoCodigo} ` : ''}${p.grupoNombre}`
        : 'Sin Grupo';
      const key = `${famLabel}  /  ${grpLabel}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return groups;
  }, [filteredProducts]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: prev[groupKey] === false ? true : false,
    }));
  };

  const handleOpenNew = () => {
    setSelectedProduct(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (prod: HardwareProduct) => {
    setSelectedProduct(prod);
    setIsModalOpen(true);
  };

  const handleOpenConfigFromModal = (
    tab: 'familias' | 'unidades' | 'sectores' | 'marcas' | 'listas'
  ) => {
    setConfigInitialTab(tab);
    setSectionTab('configuracion');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#16191F] px-6 py-5 rounded-xl border border-[#2D2D2D]">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#F0C800]/15 text-[#F0C800] flex items-center justify-center border border-[#F0C800]/30 shrink-0">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              Salón de Ventas & Ferretería Industrial
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {products.length} artículos en catálogo · Herramientas, bulonería, abrasivos y materiales de ferretería
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented Section Switch */}
          <div className="inline-flex items-center p-1 bg-[#111318] border border-[#2D2D2D] rounded-lg">
            <button
              type="button"
              onClick={() => setSectionTab('catalogo')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                sectionTab === 'catalogo'
                  ? 'bg-[#252932] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Catálogo
            </button>
            <button
              type="button"
              onClick={() => setSectionTab('configuracion')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                sectionTab === 'configuracion'
                  ? 'bg-[#252932] text-[#F0C800]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Configuración</span>
            </button>
          </div>

          {sectionTab === 'catalogo' && (
            <>
              <button
                type="button"
                onClick={() => exportHardwareToCSV(products)}
                className="px-3.5 py-2 bg-[#1F2228] hover:bg-[#2A2E37] text-slate-200 font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 border border-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>

              {products.length > 0 && onClearAllProducts && (
                <button
                  type="button"
                  onClick={onClearAllProducts}
                  className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 border border-rose-500/30 whitespace-nowrap shrink-0 cursor-pointer"
                  title="Vaciar catálogo del salón"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpiar</span>
                </button>
              )}

              <button
                type="button"
                id="new-hardware-product-btn"
                onClick={handleOpenNew}
                className="px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#16191F] font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Nuevo Artículo</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* VIEW: CONFIGURACIÓN DEL SALÓN */}
      {sectionTab === 'configuracion' ? (
        <SalonConfigPanel
          config={config}
          onUpdateConfig={handleUpdateConfig}
          onRecalculateCatalogPrices={handleRecalculateCatalogPrices}
          catalogCount={products.length}
          initialTab={configInitialTab}
        />
      ) : (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#16191F] px-5 py-4 rounded-xl border border-[#2D2D2D]">
              <div className="text-xs text-slate-400 font-medium">Artículos Activos</div>
              <div className="text-2xl font-bold text-white mt-1 font-mono tabular-nums">
                {stats.totalItems}
              </div>
            </div>

            <div className="bg-[#16191F] px-5 py-4 rounded-xl border border-[#2D2D2D]">
              <div className="text-xs text-slate-400 font-medium">Stock Valuado al Costo</div>
              <div className="text-2xl font-bold text-white mt-1 font-mono tabular-nums">
                ${Math.round(stats.valorCosto).toLocaleString('es-AR')}
              </div>
            </div>

            <div className="bg-[#16191F] px-5 py-4 rounded-xl border border-[#2D2D2D]">
              <div className="text-xs text-slate-400 font-medium truncate">
                Valuación ({activePriceList?.nombre || 'PVP'})
              </div>
              <div className="text-2xl font-bold text-[#F0C800] mt-1 font-mono tabular-nums">
                ${Math.round(stats.valorVenta).toLocaleString('es-AR')}
              </div>
            </div>

            <div className="bg-[#16191F] px-5 py-4 rounded-xl border border-[#2D2D2D]">
              <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Bajo Stock Mínimo</span>
              </div>
              <div className="text-2xl font-bold text-rose-400 mt-1 font-mono tabular-nums">
                {stats.bajoStock}
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar (NO Categoría General — uses Familia, Grupo, Sector, Lista de Precios) */}
          <div className="bg-[#16191F] p-4 rounded-xl border border-[#2D2D2D] flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por código, código de barras, descripción, marca..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-[#1F2228] border border-slate-700 rounded-lg focus:outline-none focus:border-[#F0C800] text-white placeholder-slate-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={familiaFilter}
              onChange={e => setFamiliaFilter(e.target.value)}
              className="px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:border-[#F0C800]"
            >
              <option value="TODAS">Todas las Familias</option>
              {config.familias.map(f => (
                <option key={f.id} value={f.id}>
                  {f.codigo} · {f.nombre}
                </option>
              ))}
            </select>

            {familiaFilter !== 'TODAS' && availableFilterGroups.length > 0 && (
              <select
                value={grupoFilter}
                onChange={e => setGrupoFilter(e.target.value)}
                className="px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:border-[#F0C800]"
              >
                <option value="TODOS">Todos los Grupos</option>
                {availableFilterGroups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.codigo} · {g.nombre}
                  </option>
                ))}
              </select>
            )}

            <select
              value={sectorFilter}
              onChange={e => setSectorFilter(e.target.value)}
              className="px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:border-[#F0C800]"
            >
              <option value="TODOS">Todos los Sectores</option>
              {config.sectores.map(s => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>

            <select
              value={activePriceListId}
              onChange={e => setActivePriceListId(e.target.value)}
              className="px-3 py-2 bg-[#1F2228] border border-[#F0C800]/40 rounded-lg text-xs font-semibold text-[#F0C800] focus:outline-none focus:border-[#F0C800]"
              title="Lista de precios a mostrar en la columna de venta"
            >
              {config.listasPrecios.map(l => (
                <option key={l.id} value={l.id}>
                  Ver: {l.nombre} (+{l.margenPorcentaje}%)
                </option>
              ))}
            </select>
          </div>

          {/* Catalog Table Grouped by Familia / Grupo */}
          <div className="space-y-4">
            {Object.keys(groupedProducts).length === 0 ? (
              <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl py-14 px-6 text-center">
                <Layers className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                <p className="text-sm font-semibold text-white">
                  {products.length === 0
                    ? 'Aún no hay artículos cargados en el Salón de Ventas'
                    : 'No se encontraron artículos con los filtros seleccionados'}
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Primero podés ajustar Familias, Grupos, Unidades de Medida y Sectores en Configuración, o cargar tu primer artículo de ferretería ahora.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSectionTab('configuracion')}
                    className="px-4 py-2 bg-[#1F2228] hover:bg-[#2A2E37] text-slate-200 font-semibold text-xs rounded-lg border border-slate-700 cursor-pointer"
                  >
                    Ir a Configuración
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenNew}
                    className="px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#16191F] font-bold text-xs rounded-lg cursor-pointer"
                  >
                    Cargar Primer Artículo
                  </button>
                </div>
              </div>
            ) : (
              Object.entries(groupedProducts).map(([groupKey, groupItems]) => {
                const isExpanded = expandedGroups[groupKey] !== false;
                const totalStockGroup = groupItems.reduce(
                  (acc, it) => acc + (Number(it.stockActual) || 0),
                  0
                );

                return (
                  <div
                    key={groupKey}
                    className="bg-[#16191F] border border-[#2D2D2D] rounded-xl overflow-hidden"
                  >
                    {/* Group Header */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupKey)}
                      className="w-full bg-[#1C2028] px-5 py-3 flex items-center justify-between text-left hover:bg-[#222731] transition-colors border-b border-[#2D2D2D] cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Package className="w-4 h-4 text-[#F0C800] shrink-0" />
                        <span className="text-xs font-bold text-white truncate">{groupKey}</span>
                        <span className="text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap">
                          · {groupItems.length} ítem{groupItems.length === 1 ? '' : 's'} · Stock: {totalStockGroup}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#14171D] text-slate-400 border-b border-[#2D2D2D]">
                              <th className="py-2.5 px-4 font-semibold w-14">Foto</th>
                              <th className="py-2.5 px-3 font-semibold">Código / Barras</th>
                              <th className="py-2.5 px-3 font-semibold">Descripción / Adicional</th>
                              <th className="py-2.5 px-3 font-semibold">Marca / Proveedor</th>
                              <th className="py-2.5 px-3 font-semibold">Sector / Subsector</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Stock</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Costo Unit.</th>
                              <th className="py-2.5 px-3 font-semibold text-right">
                                {activePriceList ? activePriceList.nombre : 'Precio Venta'}
                              </th>
                              <th className="py-2.5 px-4 font-semibold text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#2D2D2D]">
                            {groupItems.map(p => {
                              const isLow = (p.stockActual ?? 0) <= (p.stockMinimoAlerta ?? 3);
                              const listPrice = getProductListPrice(p);
                              const showImage = Boolean(p.foto) && !brokenImages[p.id];
                              return (
                                <tr key={p.id} className="hover:bg-[#1C2028]/60 transition-colors">
                                  <td className="py-2.5 px-4">
                                    {showImage ? (
                                      <img
                                        src={p.foto}
                                        alt={p.nombre}
                                        referrerPolicy="no-referrer"
                                        onError={() =>
                                          setBrokenImages(prev => ({ ...prev, [p.id]: true }))
                                        }
                                        className="w-10 h-10 rounded-lg object-cover bg-[#111318] border border-[#2D2D2D]"
                                      />
                                    ) : (
                                      <div className="w-10 h-10 rounded-lg bg-[#111318] border border-[#2D2D2D] flex items-center justify-center text-slate-600">
                                        <ImageIcon className="w-4 h-4" />
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                                    <div className="font-bold text-white">{p.codigo}</div>
                                    <div className="text-[11px] text-slate-500">
                                      {[p.codigoInterno, p.codigoDeBarras].filter(Boolean).join(' · ') || '—'}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 max-w-xs">
                                    <div className="font-semibold text-white">{p.nombre}</div>
                                    {(p.descripcionAdicional || p.descripcion) && (
                                      <div className="text-[11px] text-slate-400 truncate">
                                        {p.descripcionAdicional || p.descripcion}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="font-medium text-slate-200">{p.marca || '—'}</div>
                                    <div className="text-[11px] text-slate-500 truncate max-w-[150px]">
                                      {p.proveedoresNombres?.join(', ') || '—'}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="text-slate-200">{p.sector || '—'}</div>
                                    {p.subsector && (
                                      <div className="text-[11px] text-slate-500">{p.subsector}</div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                    <span className={`font-bold ${isLow ? 'text-rose-400' : 'text-emerald-400'}`}>
                                      {p.stockActual ?? 0}
                                    </span>
                                    <span className="text-[11px] text-slate-500 ml-1">
                                      {isLow ? '· Bajo' : ''}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                    ${(p.precioCosto ?? 0).toLocaleString('es-AR')}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#F0C800] whitespace-nowrap">
                                    ${listPrice.toLocaleString('es-AR')}
                                  </td>
                                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEdit(p)}
                                        className="p-1.5 bg-[#1F2228] hover:bg-[#2A2E37] text-slate-300 hover:text-white rounded-md transition-colors cursor-pointer"
                                        title="Editar artículo"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onDeleteProduct(p.id)}
                                        className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-md transition-colors cursor-pointer"
                                        title="Eliminar artículo"
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
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Modal de Alta / Edición */}
      <HardwareProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaveProducts={handleSaveModalProducts}
        initialProduct={selectedProduct}
        existingProducts={products}
        config={config}
        proveedores={proveedores}
        onQuickAddBrand={handleQuickAddBrand}
        onOpenConfigTab={handleOpenConfigFromModal}
      />
    </div>
  );
};
