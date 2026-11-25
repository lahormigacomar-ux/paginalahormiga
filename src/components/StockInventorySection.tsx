import React, { useState, useMemo, useEffect } from 'react';
import { 
  StockItem, 
  StockMovement, 
  StockCategoryCustom, 
  StockBatch, 
  BatchStatus,
  StockUnit, 
  StockWarehouse,
  StockWarehouseType,
  Vehicle, 
  Employee 
} from '../types';
import { 
  exportStockToCSV, 
  exportStockMovementsToCSV,
  formatCurrency 
} from '../services/storage';
import { apiDeleteItemStrict, apiClearCollectionStrict } from '../services/api';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { 
  Package, 
  Droplet, 
  Layers, 
  AlertTriangle, 
  PlusCircle, 
  MinusCircle, 
  Search, 
  Filter, 
  Download, 
  History, 
  Edit3, 
  Trash2, 
  Truck, 
  UserCheck, 
  Calendar, 
  X,
  FileText,
  Warehouse,
  Tag,
  Boxes,
  Eye,
  Plus,
  Fuel,
  Wrench,
  Shirt,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import {
  IndumentariaDeliveryModal,
  ClothingDeliverySubmitPayload,
  CLOTHING_MOTIVO_LABELS,
} from './Stock/IndumentariaDeliveryModal';
import {
  IndumentariaRegistryTab,
  generateIndumentariaConstanciaPDF,
} from './Stock/IndumentariaRegistryTab';

interface StockInventorySectionProps {
  stockItems: StockItem[];
  stockMovements: StockMovement[];
  stockCategories: StockCategoryCustom[];
  stockWarehouses: StockWarehouse[];
  selectedWarehouseId: string;
  onSelectWarehouse: (warehouseId: string) => void;
  fleet: Vehicle[];
  employees: Employee[];
  onSaveStockItems: (items: StockItem[]) => void;
  onSaveStockMovements: (movements: StockMovement[]) => void;
  onSaveStockCategories: (categories: StockCategoryCustom[]) => void;
  onSaveStockWarehouses: (warehouses: StockWarehouse[]) => void;
  fuelDepositsCount?: number;
  fuelDepositsNode?: React.ReactNode;
  externalCreateWarehouseTrigger?: number;
}

const WAREHOUSE_ICONS = ['🔧', '🛒', '🧰', '🦺', '👕', '🥾', '🧤', '⛑️', '🛠️', '🏭', '📦', '🏗️', '⚙️', '🛢️', '🚜'];

function newContentColor(pct: number): string {
  if (pct > 50) return 'text-emerald-400';
  if (pct > 20) return 'text-amber-400';
  return 'text-red-400';
}

const APPAREL_SIZE_ORDER: Record<string, number> = {
  XXS: 1,
  XS: 2,
  S: 3,
  M: 4,
  L: 5,
  XL: 6,
  XXL: 7,
  '2XL': 7,
  XXXL: 8,
  '3XL': 8,
  XXXXL: 9,
  '4XL': 9,
  UNICO: 99,
  'ÚNICO': 99,
};

function compareTalleValues(aRaw?: string, bRaw?: string): number {
  const a = (aRaw || '').trim();
  const b = (bRaw || '').trim();
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const numA = Number(a.replace(',', '.'));
  const numB = Number(b.replace(',', '.'));
  const isNumA = !isNaN(numA) && /^\d+([.,]\d+)?$/.test(a);
  const isNumB = !isNaN(numB) && /^\d+([.,]\d+)?$/.test(b);
  if (isNumA && isNumB) return numA - numB;
  if (isNumA) return -1;
  if (isNumB) return 1;

  const rankA = APPAREL_SIZE_ORDER[a.toUpperCase()];
  const rankB = APPAREL_SIZE_ORDER[b.toUpperCase()];
  if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
  if (rankA !== undefined) return -1;
  if (rankB !== undefined) return 1;

  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
}

export const StockInventorySection: React.FC<StockInventorySectionProps> = ({
  stockItems,
  stockMovements,
  stockCategories,
  stockWarehouses,
  selectedWarehouseId,
  onSelectWarehouse,
  fleet,
  employees,
  onSaveStockItems,
  onSaveStockMovements,
  onSaveStockCategories,
  onSaveStockWarehouses,
  fuelDepositsCount = 0,
  fuelDepositsNode,
  externalCreateWarehouseTrigger = 0
}) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'clothing_deliveries' | 'categories' | 'kardex'>('inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [kardexFilterItemId, setKardexFilterItemId] = useState<string | null>(null);

  // Clothing Delivery Modal State
  const [isClothingDeliveryModalOpen, setIsClothingDeliveryModalOpen] = useState(false);
  const [clothingDeliveryDefaultItem, setClothingDeliveryDefaultItem] = useState<StockItem | null>(null);

  // Detail Modal State (View Drum / Lots of an Item)
  const [detailItem, setDetailItem] = useState<StockItem | null>(null);
  const [selectedBatchForFilter] = useState<string | null>(null);

  // Expanded grouped garment rows (Depósito de Indumentaria)
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Record<string, boolean>>({});
  const toggleGroupExpand = (groupKey: string) => {
    setExpandedGroupKeys(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  // Edit Parent Group Modal State (updates all child sizes of a garment at once)
  const [editingGroup, setEditingGroup] = useState<{
    groupKey: string;
    depositoId: string;
    originalNombre: string;
    itemIds: string[];
    sizeLabels: string[];
  } | null>(null);
  const [groupNombre, setGroupNombre] = useState('');
  const [groupCategoria, setGroupCategoria] = useState('');
  const [groupMarca, setGroupMarca] = useState('');
  const [groupUbicacion, setGroupUbicacion] = useState('');
  const [groupCostoUnitario, setGroupCostoUnitario] = useState('');
  const [groupStockMinimo, setGroupStockMinimo] = useState('');

  // Warehouse Create/Edit Modal
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<StockWarehouse | null>(null);
  const [whCodigo, setWhCodigo] = useState('');
  const [whNombre, setWhNombre] = useState('');
  const [whTipo, setWhTipo] = useState<StockWarehouseType>('PERSONALIZADO');
  const [whIcono, setWhIcono] = useState('🏭');
  const [whUbicacion, setWhUbicacion] = useState('');
  const [whResponsable, setWhResponsable] = useState('');
  const [whDescripcion, setWhDescripcion] = useState('');

  useEffect(() => {
    if (externalCreateWarehouseTrigger > 0) {
      handleOpenWarehouseModal();
    }
  }, [externalCreateWarehouseTrigger]);

  // Form Modals
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<StockCategoryCustom | null>(null);
  const [catNombre, setCatNombre] = useState('');
  const [catIcono, setCatIcono] = useState('🛢️');
  const [catDesc, setCatDesc] = useState('');

  // Ingreso (Nuevo Tambor / Lote / Stock) Modal
  const [isIngresoModalOpen, setIsIngresoModalOpen] = useState(false);
  const [ingresoStockItemId, setIngresoStockItemId] = useState<string>('');
  const [ingresoNumeroLote, setIngresoNumeroLote] = useState<string>('');
  const [ingresoCapacidad, setIngresoCapacidad] = useState<number>(205);
  const [ingresoComprobante, setIngresoComprobante] = useState<string>('');
  const [ingresoResponsable, setIngresoResponsable] = useState<string>('Encargado de Depósito');
  const [ingresoObs, setIngresoObs] = useState<string>('');

  // Despacho / Consumo / Entrega de Herramienta Modal
  const [isDespachoModalOpen, setIsDespachoModalOpen] = useState(false);
  const [despachoStockItemId, setDespachoStockItemId] = useState<string>('');
  const [despachoBatchId, setDespachoBatchId] = useState<string>('');
  const [despachoCantidad, setDespachoCantidad] = useState<number>(1);
  const [despachoEquipmentId, setDespachoEquipmentId] = useState<string>('');
  const [despachoEmployeeLegajo, setDespachoEmployeeLegajo] = useState<string>('');
  const [despachoMotivo, setDespachoMotivo] = useState<string>('Entrega a personal / Mantenimiento');
  const [despachoResponsable, setDespachoResponsable] = useState<string>('Encargado de Depósito');
  const [despachoLeyendaObs, setDespachoLeyendaObs] = useState<string>('');

  // Item Form fields
  const [itemDepositoId, setItemDepositoId] = useState<string>('DEP-TALLER');
  const [itemCodigo, setItemCodigo] = useState('');
  const [itemNombre, setItemNombre] = useState('');
  const [itemCategoria, setItemCategoria] = useState('');
  const [itemMarca, setItemMarca] = useState('');
  const [itemTalle, setItemTalle] = useState('');
  const [itemGenero, setItemGenero] = useState('Unisex');
  const [itemDescripcion, setItemDescripcion] = useState('');
  const [itemUnidad, setItemUnidad] = useState<StockUnit>('UNIDAD');
  const [itemStockInicial, setItemStockInicial] = useState<number>(0);
  const [itemStockMinimo, setItemStockMinimo] = useState<number>(5);
  const [itemPrecioCosto, setItemPrecioCosto] = useState<number>(0);
  const [itemUbicacion, setItemUbicacion] = useState('');
  const [itemObs, setItemObs] = useState('');

  const activeWarehouse = useMemo(() => {
    if (selectedWarehouseId === 'ALL' || selectedWarehouseId === 'FUEL_DEPOSITS') return null;
    return stockWarehouses.find(w => w.id === selectedWarehouseId) || null;
  }, [selectedWarehouseId, stockWarehouses]);

  const isIndumentariaScope = useMemo(() => {
    return activeWarehouse?.tipo === 'INDUMENTARIA' || selectedWarehouseId === 'DEP-INDUMENTARIA';
  }, [activeWarehouse, selectedWarehouseId]);

  const indumentariaWarehouseIds = useMemo(() => {
    const ids = new Set<string>(['DEP-INDUMENTARIA']);
    stockWarehouses.forEach(w => {
      if (w.tipo === 'INDUMENTARIA' || w.id === 'DEP-INDUMENTARIA') ids.add(w.id);
    });
    return ids;
  }, [stockWarehouses]);

  useEffect(() => {
    if (activeWarehouse && activeWarehouse.tipo !== 'INDUMENTARIA' && activeTab === 'clothing_deliveries') {
      setActiveTab('inventory');
    }
  }, [activeWarehouse, activeTab]);

  // Items filtered by selected warehouse
  const warehouseScopedItems = useMemo(() => {
    if (selectedWarehouseId === 'ALL' || selectedWarehouseId === 'FUEL_DEPOSITS') {
      return stockItems;
    }
    return stockItems.filter(item => (item.depositoId || 'DEP-TALLER') === selectedWarehouseId);
  }, [stockItems, selectedWarehouseId]);

  // Movements filtered by selected warehouse
  const warehouseScopedMovements = useMemo(() => {
    if (selectedWarehouseId === 'ALL' || selectedWarehouseId === 'FUEL_DEPOSITS') {
      return stockMovements;
    }
    const itemIdsInWarehouse = new Set(warehouseScopedItems.map(i => i.id));
    return stockMovements.filter(m => m.depositoId === selectedWarehouseId || itemIdsInWarehouse.has(m.stockItemId));
  }, [stockMovements, selectedWarehouseId, warehouseScopedItems]);

  const indumentariaItems = useMemo(() => {
    const scoped = stockItems.filter(it => indumentariaWarehouseIds.has(it.depositoId || ''));
    if (isIndumentariaScope && selectedWarehouseId !== 'ALL') {
      return warehouseScopedItems;
    }
    return scoped;
  }, [stockItems, indumentariaWarehouseIds, isIndumentariaScope, selectedWarehouseId, warehouseScopedItems]);

  const clothingDeliveryMovements = useMemo(() => {
    const indItemIds = new Set(indumentariaItems.map(i => i.id));
    return stockMovements.filter(m => {
      if (m.tipo !== 'EGRESO_CONSUMO') return false;
      const isClothing =
        m.esEntregaIndumentaria ||
        (m.depositoId ? indumentariaWarehouseIds.has(m.depositoId) : false) ||
        indItemIds.has(m.stockItemId);
      if (!isClothing) return false;
      if (isIndumentariaScope && selectedWarehouseId !== 'ALL') {
        return m.depositoId === selectedWarehouseId || indItemIds.has(m.stockItemId);
      }
      return true;
    });
  }, [stockMovements, indumentariaItems, indumentariaWarehouseIds, isIndumentariaScope, selectedWarehouseId]);

  // Calculate dynamic metrics for the active warehouse scope
  const metrics = useMemo(() => {
    const totalItems = warehouseScopedItems.length;
    let totalLiters = 0;
    let totalKgs = 0;
    let totalUnidades = 0;
    let lowStockCount = 0;

    warehouseScopedItems.forEach(item => {
      if (item.unidad === 'LITROS' || item.unidad === 'BIDON_20L' || item.unidad === 'TAMBOR_205L') {
        totalLiters += item.stockActual;
      } else if (item.unidad === 'KG' || item.unidad === 'BALDE_20KG') {
        totalKgs += item.stockActual;
      } else {
        totalUnidades += item.stockActual;
      }
      if (item.stockActual <= item.stockMinimoAlerta) {
        lowStockCount++;
      }
    });

    const totalTamboresEnUso = warehouseScopedItems.reduce((acc, item) => {
      const activeBatches = (item.lotes || []).filter(b => b.estado === 'EN_USO').length;
      return acc + activeBatches;
    }, 0);

    return { totalItems, totalLiters, totalKgs, totalUnidades, lowStockCount, totalTamboresEnUso };
  }, [warehouseScopedItems]);

  // Filtered Inventory items
  const filteredStockItems = useMemo(() => {
    return warehouseScopedItems.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || (
        item.nombre.toLowerCase().includes(q) ||
        item.codigo.toLowerCase().includes(q) ||
        (item.talle || '').toLowerCase().includes(q) ||
        (`talle ${item.talle || ''}`).toLowerCase().includes(q) ||
        (item.marca || '').toLowerCase().includes(q) ||
        (item.categoria || '').toLowerCase().includes(q) ||
        (item.ubicacionPañol || '').toLowerCase().includes(q) ||
        (item.depositoNombre || '').toLowerCase().includes(q)
      );
      const matchCat = selectedCategoryFilter === 'ALL' || item.categoria === selectedCategoryFilter;
      return matchSearch && matchCat;
    });
  }, [warehouseScopedItems, searchQuery, selectedCategoryFilter]);

  // Group clothing / indumentaria items by (depositoId + normalized product name)
  type InventoryDisplayRow =
    | { kind: 'single'; item: StockItem }
    | {
        kind: 'group';
        groupKey: string;
        nombre: string;
        depositoId: string;
        depositoNombre: string;
        categoria: string;
        marca?: string;
        ubicacionPañol?: string;
        unidad: StockUnit;
        items: StockItem[];
        totalStock: number;
        lowStockItemsCount: number;
        codeRangeLabel: string;
        minCost?: number;
        maxCost?: number;
      };

  const inventoryDisplayRows = useMemo<InventoryDisplayRow[]>(() => {
    const rows: InventoryDisplayRow[] = [];
    const groupMap = new Map<string, { index: number; items: StockItem[] }>();

    filteredStockItems.forEach(item => {
      const depId = item.depositoId || 'DEP-TALLER';
      const wh = stockWarehouses.find(w => w.id === depId);
      const shouldGroup =
        indumentariaWarehouseIds.has(depId) ||
        wh?.tipo === 'INDUMENTARIA' ||
        Boolean((item.talle || '').trim());

      if (!shouldGroup) {
        rows.push({ kind: 'single', item });
        return;
      }

      const normName = item.nombre.trim().toLowerCase();
      const groupKey = `${depId}::${normName}`;
      const existing = groupMap.get(groupKey);
      if (existing) {
        existing.items.push(item);
      } else {
        groupMap.set(groupKey, { index: rows.length, items: [item] });
        rows.push({ kind: 'single', item }); // placeholder replaced below
      }
    });

    groupMap.forEach((entry, groupKey) => {
      const sortedItems = [...entry.items].sort((a, b) => {
        const cmpTalle = compareTalleValues(a.talle, b.talle);
        if (cmpTalle !== 0) return cmpTalle;
        return (a.codigo || '').localeCompare(b.codigo || '', 'es', { numeric: true });
      });
      const first = sortedItems[0];
      const totalStock = sortedItems.reduce((sum, it) => sum + (Number(it.stockActual) || 0), 0);
      const lowStockItemsCount = sortedItems.filter(
        it => (Number(it.stockActual) || 0) <= (Number(it.stockMinimoAlerta) || 0)
      ).length;

      const sortedCodes = sortedItems
        .map(it => it.codigo)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
      const codeRangeLabel =
        sortedCodes.length <= 1
          ? (sortedCodes[0] || first.codigo)
          : `${sortedCodes[0]} … ${sortedCodes[sortedCodes.length - 1]}`;

      const costs = sortedItems
        .map(it => Number(it.precioCostoUnitario || 0))
        .filter(c => c > 0);
      const minCost = costs.length > 0 ? Math.min(...costs) : undefined;
      const maxCost = costs.length > 0 ? Math.max(...costs) : undefined;

      rows[entry.index] = {
        kind: 'group',
        groupKey,
        nombre: first.nombre.trim(),
        depositoId: first.depositoId || 'DEP-INDUMENTARIA',
        depositoNombre: first.depositoNombre || 'Depósito Ropa e Indumentaria (EPP)',
        categoria: first.categoria,
        marca: sortedItems.find(it => it.marca)?.marca,
        ubicacionPañol: sortedItems.find(it => it.ubicacionPañol)?.ubicacionPañol,
        unidad: first.unidad,
        items: sortedItems,
        totalStock,
        lowStockItemsCount,
        codeRangeLabel,
        minCost,
        maxCost,
      };
    });

    return rows;
  }, [filteredStockItems, stockWarehouses, indumentariaWarehouseIds]);

  const groupRowKeys = useMemo(
    () => inventoryDisplayRows.filter(r => r.kind === 'group').map(r => r.groupKey),
    [inventoryDisplayRows]
  );

  const allGroupsExpanded = useMemo(
    () => groupRowKeys.length > 0 && groupRowKeys.every(k => Boolean(expandedGroupKeys[k])),
    [groupRowKeys, expandedGroupKeys]
  );

  const handleToggleExpandAllGroups = () => {
    if (allGroupsExpanded) {
      setExpandedGroupKeys({});
    } else {
      const next: Record<string, boolean> = {};
      groupRowKeys.forEach(k => {
        next[k] = true;
      });
      setExpandedGroupKeys(next);
    }
  };

  // Filtered Kardex Movements
  const filteredMovements = useMemo(() => {
    let list = [...warehouseScopedMovements].sort((a, b) => {
      const dateA = `${a.fecha} ${a.hora || '00:00'}`;
      const dateB = `${b.fecha} ${b.hora || '00:00'}`;
      return dateB.localeCompare(dateA);
    });

    if (kardexFilterItemId) {
      list = list.filter(m => m.stockItemId === kardexFilterItemId);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(m => 
        m.stockItemNombre.toLowerCase().includes(q) ||
        (m.batchNumeroLote || '').toLowerCase().includes(q) ||
        (m.equipoCodigoOrPatente || '').toLowerCase().includes(q) ||
        (m.recibeEmpleadoNombre || '').toLowerCase().includes(q) ||
        (m.motivoConcepto || '').toLowerCase().includes(q) ||
        (m.observaciones || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [warehouseScopedMovements, kardexFilterItemId, searchQuery]);

  // Warehouse Modal Handlers
  const handleOpenWarehouseModal = (wh?: StockWarehouse) => {
    if (wh) {
      setEditingWarehouse(wh);
      setWhCodigo(wh.codigo);
      setWhNombre(wh.nombre);
      setWhTipo(wh.tipo);
      setWhIcono(wh.icono || '🏭');
      setWhUbicacion(wh.ubicacion || '');
      setWhResponsable(wh.responsable || '');
      setWhDescripcion(wh.descripcion || '');
    } else {
      setEditingWarehouse(null);
      const nextNum = stockWarehouses.length + 1;
      setWhCodigo(`DEP-0${nextNum}`);
      setWhNombre('');
      setWhTipo('PERSONALIZADO');
      setWhIcono('🏭');
      setWhUbicacion('Base Central');
      setWhResponsable('Encargado de Depósito');
      setWhDescripcion('');
    }
    setIsWarehouseModalOpen(true);
  };

  const handleSaveWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whNombre.trim()) return;

    if (editingWarehouse) {
      const updated = stockWarehouses.map(w =>
        w.id === editingWarehouse.id
          ? {
              ...w,
              codigo: whCodigo.trim() || w.codigo,
              nombre: whNombre.trim(),
              tipo: whTipo,
              icono: whIcono.trim() || '🏭',
              ubicacion: whUbicacion.trim() || undefined,
              responsable: whResponsable.trim() || undefined,
              descripcion: whDescripcion.trim() || undefined
            }
          : w
      );
      onSaveStockWarehouses(updated);
    } else {
      const newWh: StockWarehouse = {
        id: `DEP-${Date.now()}`,
        codigo: whCodigo.trim() || `DEP-0${stockWarehouses.length + 1}`,
        nombre: whNombre.trim(),
        tipo: whTipo,
        icono: whIcono.trim() || '🏭',
        ubicacion: whUbicacion.trim() || undefined,
        responsable: whResponsable.trim() || undefined,
        descripcion: whDescripcion.trim() || undefined,
        createdAt: new Date().toISOString()
      };
      const updated = [...stockWarehouses, newWh];
      onSaveStockWarehouses(updated);
      onSelectWarehouse(newWh.id);
    }
    setIsWarehouseModalOpen(false);
  };

  // Handlers for Categories
  const handleOpenCategoryModal = (cat?: StockCategoryCustom) => {
    if (cat) {
      setEditingCategory(cat);
      setCatNombre(cat.nombre);
      setCatIcono(cat.icono || '🛢️');
      setCatDesc(cat.descripcion || '');
    } else {
      setEditingCategory(null);
      setCatNombre('');
      setCatIcono(
        activeWarehouse?.tipo === 'INDUMENTARIA'
          ? '🦺'
          : activeWarehouse?.tipo === 'HERRAMIENTAS'
            ? '🧰'
            : activeWarehouse?.tipo === 'VENTAS'
              ? '🛒'
              : '🛢️'
      );
      setCatDesc('');
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNombre.trim()) return;

    if (editingCategory) {
      const updated = stockCategories.map(c => 
        c.id === editingCategory.id 
          ? { ...c, nombre: catNombre.trim(), icono: catIcono.trim() || '🛢️', descripcion: catDesc.trim() || undefined }
          : c
      );
      onSaveStockCategories(updated);
    } else {
      const newCat: StockCategoryCustom = {
        id: `CAT-${Date.now()}`,
        nombre: catNombre.trim(),
        icono: catIcono.trim() || '🛢️',
        descripcion: catDesc.trim() || undefined,
        depositoId: activeWarehouse?.id
      };
      onSaveStockCategories([...stockCategories, newCat]);
    }
    setIsCategoryModalOpen(false);
  };

  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'category' | 'item' | 'warehouse' | 'clear_all';
    id?: string;
    name: string;
  } | null>(null);

  const handleDeleteWarehouse = (wh: StockWarehouse) => {
    setDeleteTarget({
      type: 'warehouse',
      id: wh.id,
      name: `Depósito: ${wh.nombre} (${wh.codigo})`
    });
  };

  const handleDeleteCategory = (id: string) => {
    const cat = stockCategories.find(c => c.id === id);
    setDeleteTarget({
      type: 'category',
      id,
      name: `Categoría: ${cat?.nombre || id}`
    });
  };

  const handleClearAllItems = () => {
    const scopeLabel = activeWarehouse ? `del ${activeWarehouse.nombre}` : 'de todos los depósitos';
    setDeleteTarget({
      type: 'clear_all',
      name: `TODOS los artículos/insumos (${warehouseScopedItems.length}) ${scopeLabel}`
    });
  };

  const handleExecuteConfirmedDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'warehouse' && deleteTarget.id) {
      const res = await apiDeleteItemStrict('stock_warehouses', deleteTarget.id);
      if (!res.ok) return;
      const updated = stockWarehouses.filter(w => w.id !== deleteTarget.id);
      onSaveStockWarehouses(updated);
      if (selectedWarehouseId === deleteTarget.id) {
        onSelectWarehouse('ALL');
      }
    } else if (deleteTarget.type === 'category' && deleteTarget.id) {
      const res = await apiDeleteItemStrict('stock_categories', deleteTarget.id);
      if (!res.ok) return;
      const updated = stockCategories.filter(c => c.id !== deleteTarget.id);
      onSaveStockCategories(updated);
    } else if (deleteTarget.type === 'item' && deleteTarget.id) {
      const res = await apiDeleteItemStrict('stock_items', deleteTarget.id);
      if (!res.ok) return;
      const updated = stockItems.filter(item => item.id !== deleteTarget.id);
      onSaveStockItems(updated);
      if (detailItem?.id === deleteTarget.id) setDetailItem(null);
    } else if (deleteTarget.type === 'clear_all') {
      if (activeWarehouse) {
        const toDelete = stockItems.filter(i => (i.depositoId || 'DEP-TALLER') === activeWarehouse.id);
        await Promise.all(toDelete.map(i => apiDeleteItemStrict('stock_items', i.id)));
        const remainingItems = stockItems.filter(i => (i.depositoId || 'DEP-TALLER') !== activeWarehouse.id);
        onSaveStockItems(remainingItems);
      } else {
        await Promise.all([
          apiClearCollectionStrict('stock_items'),
          apiClearCollectionStrict('stock_movements'),
        ]);
        onSaveStockItems([]);
        onSaveStockMovements([]);
      }
      setDetailItem(null);
    }
    setDeleteTarget(null);
  };

  // Item Form Handlers
  const handleOpenItemModal = (item?: StockItem) => {
    const defaultWhId = activeWarehouse ? activeWarehouse.id : (stockWarehouses[0]?.id || 'DEP-TALLER');
    const targetWh = stockWarehouses.find(w => w.id === (item?.depositoId || defaultWhId));
    const isInd = targetWh?.tipo === 'INDUMENTARIA';

    if (item) {
      setEditingItem(item);
      setItemDepositoId(item.depositoId || 'DEP-TALLER');
      setItemCodigo(item.codigo);
      setItemNombre(item.nombre);
      setItemCategoria(item.categoria);
      setItemMarca(item.marca || '');
      setItemTalle(item.talle || '');
      setItemGenero(item.genero || 'Unisex');
      setItemDescripcion(item.descripcion || '');
      setItemUnidad(item.unidad);
      setItemStockInicial(item.stockActual);
      setItemStockMinimo(item.stockMinimoAlerta);
      setItemPrecioCosto(item.precioCostoUnitario || 0);
      setItemUbicacion(item.ubicacionPañol || targetWh?.nombre || 'Depósito Central');
      setItemObs(item.observaciones || '');
    } else {
      setEditingItem(null);
      setItemDepositoId(defaultWhId);
      const prefix = isInd ? 'IND' : targetWh?.tipo === 'HERRAMIENTAS' ? 'HER' : targetWh?.tipo === 'VENTAS' ? 'VEN' : 'INS';
      
      let nextCodeNum = 1;
      if (isInd) {
        const indCodes = stockItems
          .map(it => (it.codigo || ''))
          .filter(c => c.startsWith('IND-'))
          .map(c => {
            const parts = c.split('-');
            const num = parseInt(parts[1], 10);
            return isNaN(num) ? 0 : num;
          });
        if (indCodes.length > 0) {
          nextCodeNum = Math.max(...indCodes) + 1;
        }
      } else {
        nextCodeNum = Math.floor(1000 + Math.random() * 9000);
      }

      setItemCodigo(isInd ? `IND-${String(nextCodeNum).padStart(3, '0')}` : `${prefix}-${nextCodeNum}`);
      setItemNombre('');
      const defaultCat = isInd
        ? (stockCategories.find(c => c.nombre.toLowerCase().includes('ropa') || c.nombre.toLowerCase().includes('indumentaria'))?.nombre || stockCategories[0]?.nombre || 'Ropa de Trabajo')
        : targetWh?.tipo === 'HERRAMIENTAS'
        ? (stockCategories.find(c => c.nombre.toLowerCase().includes('herramienta'))?.nombre || stockCategories[0]?.nombre || 'Herramientas de Mano')
        : targetWh?.tipo === 'VENTAS'
        ? (stockCategories.find(c => c.nombre.toLowerCase().includes('venta'))?.nombre || stockCategories[0]?.nombre || 'Mercadería Depósito Ventas')
        : (stockCategories[0]?.nombre || 'Aceites de Motor');
      setItemCategoria(defaultCat);
      setItemMarca('');
      setItemTalle('');
      setItemGenero('Unisex');
      setItemDescripcion('');
      setItemUnidad(isInd || targetWh?.tipo === 'HERRAMIENTAS' || targetWh?.tipo === 'VENTAS' ? 'UNIDAD' : 'LITROS');
      setItemStockInicial(0);
      setItemStockMinimo(isInd ? 3 : targetWh?.tipo === 'HERRAMIENTAS' || targetWh?.tipo === 'VENTAS' ? 2 : 50);
      setItemPrecioCosto(0);
      setItemUbicacion(targetWh?.ubicacion || targetWh?.nombre || 'Depósito Central');
      setItemObs('');
    }
    setIsItemModalOpen(true);
  };

  // Pre-fill Item Modal to quickly add a new size (Talle) under an existing grouped garment
  const handleOpenAddSizeModal = (groupItems: StockItem[]) => {
    const base = groupItems[0];
    if (!base) {
      handleOpenItemModal();
      return;
    }
    const existingCodes = new Set(stockItems.map(it => (it.codigo || '').toUpperCase()));
    const indCodes = stockItems
      .map(it => it.codigo || '')
      .filter(c => c.startsWith('IND-'))
      .map(c => {
        const num = parseInt(c.split('-')[1], 10);
        return isNaN(num) ? 0 : num;
      });
    const nextSeq = indCodes.length > 0 ? Math.max(...indCodes) + 1 : 1;
    let suggestedCode = `IND-${String(nextSeq).padStart(3, '0')}`;
    const basePrefix = (base.codigo || '').split('-').slice(0, 2).join('-');
    if (basePrefix.startsWith('IND-') && base.codigo.split('-').length >= 3) {
      let variantIdx = groupItems.length + 1;
      while (existingCodes.has(`${basePrefix}-${variantIdx}`.toUpperCase())) {
        variantIdx += 1;
      }
      suggestedCode = `${basePrefix}-${variantIdx}`;
    }

    setEditingItem(null);
    setItemDepositoId(base.depositoId || 'DEP-INDUMENTARIA');
    setItemCodigo(suggestedCode);
    setItemNombre(base.nombre);
    setItemCategoria(base.categoria);
    setItemMarca(base.marca || '');
    setItemTalle('');
    setItemGenero(base.genero || 'Unisex');
    setItemDescripcion(base.descripcion || '');
    setItemUnidad(base.unidad || 'UNIDAD');
    setItemStockInicial(0);
    setItemStockMinimo(base.stockMinimoAlerta ?? 2);
    setItemPrecioCosto(base.precioCostoUnitario || 0);
    setItemUbicacion(base.ubicacionPañol || base.depositoNombre || 'Depósito Ropa - Estantería Principal');
    setItemObs('');
    setIsItemModalOpen(true);
  };

  // Open Modal to Edit Parent Product (propagates changes to ALL child sizes)
  const handleOpenEditGroupModal = (group: {
    groupKey: string;
    depositoId: string;
    nombre: string;
    categoria: string;
    marca?: string;
    ubicacionPañol?: string;
    items: StockItem[];
  }) => {
    const distinctCosts = Array.from(
      new Set(group.items.map(it => Number(it.precioCostoUnitario || 0)))
    );
    const distinctMins = Array.from(
      new Set(group.items.map(it => Number(it.stockMinimoAlerta ?? 0)))
    );

    setEditingGroup({
      groupKey: group.groupKey,
      depositoId: group.depositoId,
      originalNombre: group.nombre,
      itemIds: group.items.map(it => it.id),
      sizeLabels: group.items.map(it => it.talle || 'Único'),
    });
    setGroupNombre(group.nombre);
    setGroupCategoria(group.categoria);
    setGroupMarca(group.marca || '');
    setGroupUbicacion(group.ubicacionPañol || '');
    setGroupCostoUnitario(distinctCosts.length === 1 && distinctCosts[0] > 0 ? String(distinctCosts[0]) : '');
    setGroupStockMinimo(distinctMins.length === 1 ? String(distinctMins[0]) : '');
  };

  const handleSaveGroupEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    const nextNombre = groupNombre.trim();
    if (!nextNombre) return;

    const targetIdSet = new Set(editingGroup.itemIds);
    const parsedCost = groupCostoUnitario.trim() !== '' ? Number(groupCostoUnitario) : null;
    const parsedMin = groupStockMinimo.trim() !== '' ? Number(groupStockMinimo) : null;

    const updatedItems = stockItems.map(item => {
      if (!targetIdSet.has(item.id)) return item;
      return {
        ...item,
        nombre: nextNombre,
        categoria: groupCategoria || item.categoria,
        marca: groupMarca.trim() || undefined,
        ubicacionPañol: groupUbicacion.trim() || undefined,
        precioCostoUnitario:
          parsedCost !== null && !isNaN(parsedCost) && parsedCost >= 0
            ? (parsedCost > 0 ? parsedCost : undefined)
            : item.precioCostoUnitario,
        stockMinimoAlerta:
          parsedMin !== null && !isNaN(parsedMin) && parsedMin >= 0
            ? parsedMin
            : item.stockMinimoAlerta,
      };
    });

    onSaveStockItems(updatedItems);

    // Keep expanded state synced to the renamed groupKey
    const newGroupKey = `${editingGroup.depositoId}::${nextNombre.toLowerCase()}`;
    if (newGroupKey !== editingGroup.groupKey) {
      setExpandedGroupKeys(prev => {
        if (!prev[editingGroup.groupKey]) return prev;
        const next = { ...prev };
        delete next[editingGroup.groupKey];
        next[newGroupKey] = true;
        return next;
      });
    }

    if (detailItem && targetIdSet.has(detailItem.id)) {
      const refreshed = updatedItems.find(it => it.id === detailItem.id);
      if (refreshed) setDetailItem(refreshed);
    }

    setEditingGroup(null);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemNombre.trim() || !itemCodigo.trim()) return;

    const selectedWh = stockWarehouses.find(w => w.id === itemDepositoId);
    const depositoNombre = selectedWh?.nombre || 'Depósito de Taller';
    const isInd = selectedWh?.tipo === 'INDUMENTARIA';
    const cleanTalle = itemTalle.trim();
    const finalCodigo = isInd && cleanTalle && !itemCodigo.includes('-')
      ? `${itemCodigo}-${cleanTalle}`
      : itemCodigo.trim();

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);

    if (editingItem) {
      const newStock = Number(itemStockInicial);
      const updated = stockItems.map(item => {
        if (item.id === editingItem.id) {
          return {
            ...item,
            depositoId: itemDepositoId,
            depositoNombre,
            codigo: finalCodigo,
            nombre: itemNombre.trim(),
            categoria: itemCategoria,
            marca: itemMarca.trim() || undefined,
            talle: cleanTalle || undefined,
            genero: isInd ? (itemGenero || 'Unisex') : item.genero,
            descripcion: itemDescripcion.trim() || undefined,
            unidad: itemUnidad,
            stockActual: !isNaN(newStock) && newStock >= 0 ? newStock : item.stockActual,
            stockMinimoAlerta: Number(itemStockMinimo),
            precioCostoUnitario: Number(itemPrecioCosto) || undefined,
            ubicacionPañol: itemUbicacion.trim() || undefined,
            observaciones: itemObs.trim() || undefined
          };
        }
        return item;
      });
      onSaveStockItems(updated);
    } else {
      const initialQty = Math.max(0, Number(itemStockInicial) || 0);
      const newItemId = `STOCK-${Date.now()}`;
      const initialLotes: StockBatch[] = initialQty > 0 ? [
        {
          id: `BATCH-${Date.now()}`,
          stockItemId: newItemId,
          numeroLote: `Stock Inicial #1 (${todayStr})`,
          fechaIngreso: todayStr,
          horaIngreso: timeStr,
          capacidadInicial: initialQty,
          contenidoActual: initialQty,
          unidad: itemUnidad,
          estado: 'EN_USO',
          observacionesIngreso: `Carga inicial en ${depositoNombre}`
        }
      ] : [];

      const newItem: StockItem = {
        id: newItemId,
        depositoId: itemDepositoId,
        depositoNombre,
        codigo: finalCodigo,
        nombre: itemNombre.trim(),
        categoria: itemCategoria,
        marca: itemMarca.trim() || undefined,
        talle: cleanTalle || undefined,
        genero: isInd ? (itemGenero || 'Unisex') : undefined,
        descripcion: itemDescripcion.trim() || undefined,
        unidad: itemUnidad,
        stockActual: initialQty,
        stockMinimoAlerta: Number(itemStockMinimo),
        precioCostoUnitario: Number(itemPrecioCosto) || undefined,
        ubicacionPañol: itemUbicacion.trim() || depositoNombre,
        observaciones: itemObs.trim() || undefined,
        fechaUltimoIngreso: todayStr,
        lotes: initialLotes
      };
      onSaveStockItems([...stockItems, newItem]);

      if (initialQty > 0) {
        const newMovement: StockMovement = {
          id: `STK-MOV-${Date.now()}`,
          stockItemId: newItem.id,
          stockItemNombre: newItem.nombre,
          depositoId: itemDepositoId,
          depositoNombre,
          batchId: initialLotes[0]?.id,
          batchNumeroLote: initialLotes[0]?.numeroLote,
          tipo: 'INGRESO_RECARGA',
          cantidad: initialQty,
          unidad: itemUnidad,
          stockAnterior: 0,
          stockPosterior: initialQty,
          fecha: todayStr,
          hora: timeStr,
          responsableEntrega: selectedWh?.responsable || 'Encargado de Depósito',
          motivoConcepto: `Alta inicial en ${depositoNombre}`,
          observaciones: itemObs.trim() || `Ingreso inicial de ${initialQty} ${itemUnidad}`
        };
        onSaveStockMovements([newMovement, ...stockMovements]);
      }
    }

    setIsItemModalOpen(false);
  };

  const handleDeleteItem = (id: string) => {
    const target = stockItems.find(item => item.id === id);
    setDeleteTarget({
      type: 'item',
      id,
      name: `Artículo / Insumo: ${target?.nombre || id} (${target?.codigo || ''})`
    });
  };

  // Open Ingreso Modal for a Tambor/Lote/Stock
  const handleOpenIngresoModal = (item?: StockItem) => {
    const targetId = item ? item.id : (warehouseScopedItems[0]?.id || stockItems[0]?.id || '');
    setIngresoStockItemId(targetId);
    
    const targetItem = stockItems.find(i => i.id === targetId);
    const drumCount = (targetItem?.lotes || []).length + 1;
    const isFluid = targetItem?.unidad === 'LITROS' || targetItem?.unidad === 'TAMBOR_205L' || targetItem?.unidad === 'BIDON_20L';
    setIngresoNumeroLote(isFluid ? `Tambor #${drumCount} - Lote L-${new Date().getFullYear()}-${Math.floor(10 + Math.random() * 90)}` : `Ingreso #${drumCount} (${new Date().toISOString().slice(0, 10)})`);
    setIngresoCapacidad(isFluid ? 205 : targetItem?.unidad === 'KG' || targetItem?.unidad === 'BALDE_20KG' ? 20 : 10);
    setIngresoComprobante('');
    setIngresoResponsable(activeWarehouse?.responsable || 'Encargado de Depósito');
    setIngresoObs('Ingreso de stock a depósito');
    setIsIngresoModalOpen(true);
  };

  const handleSaveIngreso = (e: React.FormEvent) => {
    e.preventDefault();
    const item = stockItems.find(i => i.id === ingresoStockItemId);
    if (!item || !ingresoNumeroLote.trim()) return;

    const cap = Number(ingresoCapacidad);
    if (isNaN(cap) || cap <= 0) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);

    const newBatch: StockBatch = {
      id: `BATCH-${Date.now()}`,
      stockItemId: item.id,
      numeroLote: ingresoNumeroLote.trim(),
      fechaIngreso: todayStr,
      horaIngreso: timeStr,
      capacidadInicial: cap,
      contenidoActual: cap,
      unidad: item.unidad,
      estado: (item.lotes || []).some(l => l.estado === 'EN_USO') ? 'NUEVO_SELLADO' : 'EN_USO',
      comprobanteProveedor: ingresoComprobante.trim() || undefined,
      observacionesIngreso: ingresoObs.trim() || undefined
    };

    const updatedLotes = [...(item.lotes || []), newBatch];
    const lotesSum = updatedLotes.reduce((sum, b) => sum + (b.estado !== 'AGOTADO' ? b.contenidoActual : 0), 0);
    const newStockActual = (item.lotes && item.lotes.length > 0) ? lotesSum : (item.stockActual + cap);
    const stockAnterior = item.stockActual;

    const updatedItems = stockItems.map(i => {
      if (i.id === item.id) {
        return {
          ...i,
          stockActual: newStockActual,
          fechaUltimoIngreso: todayStr,
          lotes: updatedLotes
        };
      }
      return i;
    });

    const newMovement: StockMovement = {
      id: `STK-MOV-${Date.now()}`,
      stockItemId: item.id,
      stockItemNombre: item.nombre,
      depositoId: item.depositoId || 'DEP-TALLER',
      depositoNombre: item.depositoNombre,
      batchId: newBatch.id,
      batchNumeroLote: newBatch.numeroLote,
      tipo: 'INGRESO_RECARGA',
      cantidad: cap,
      unidad: item.unidad,
      stockAnterior,
      stockPosterior: newStockActual,
      fecha: todayStr,
      hora: timeStr,
      responsableEntrega: ingresoResponsable || 'Encargado de Depósito',
      motivoConcepto: `Ingreso de ${newBatch.numeroLote} (${cap} ${item.unidad})`,
      comprobanteProveedor: ingresoComprobante || undefined,
      observaciones: ingresoObs || `Ingreso de stock al depósito.`
    };

    onSaveStockItems(updatedItems);
    onSaveStockMovements([newMovement, ...stockMovements]);
    setIsIngresoModalOpen(false);

    if (detailItem?.id === item.id) {
      const refreshed = updatedItems.find(i => i.id === item.id);
      if (refreshed) setDetailItem(refreshed);
    }
  };

  // Open Despacho / Entrega Modal
  const handleOpenDespachoModal = (item?: StockItem, batch?: StockBatch) => {
    const targetItem = item || warehouseScopedItems[0] || stockItems[0];
    if (!targetItem) return;

    setDespachoStockItemId(targetItem.id);

    const activeBatches = (targetItem.lotes || []).filter(b => b.estado !== 'AGOTADO');
    const targetBatch = batch || activeBatches.find(b => b.estado === 'EN_USO') || activeBatches[0];
    setDespachoBatchId(targetBatch ? targetBatch.id : 'DIRECT_STOCK');

    const isUnit = targetItem.unidad === 'UNIDAD' || targetItem.unidad === 'KIT' || targetItem.unidad === 'CAJA' || targetItem.unidad === 'JUEGO' || targetItem.unidad === 'PAR';
    setDespachoCantidad(isUnit ? 1 : 10);
    setDespachoEquipmentId('');
    setDespachoEmployeeLegajo('');
    setDespachoMotivo(activeWarehouse?.tipo === 'HERRAMIENTAS' ? 'Entrega de herramienta a personal / máquina' : 'Mantenimiento / Consumo operativo');
    setDespachoResponsable(activeWarehouse?.responsable || 'Encargado de Depósito');
    setDespachoLeyendaObs('');
    setIsDespachoModalOpen(true);
  };

  const handleSaveDespacho = (e: React.FormEvent) => {
    e.preventDefault();
    const item = stockItems.find(i => i.id === despachoStockItemId);
    if (!item) return;

    const qty = Number(despachoCantidad);
    if (isNaN(qty) || qty <= 0) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const stockAnterior = item.stockActual;

    const batch = (item.lotes || []).find(b => b.id === despachoBatchId);
    let updatedLotes = item.lotes || [];
    let newStockActual = Math.max(0, item.stockActual - qty);
    let batchLabel = 'Stock Directo Depósito';

    if (batch) {
      const newContenido = Math.max(0, batch.contenidoActual - qty);
      const newBatchEstado: BatchStatus = newContenido === 0 ? 'AGOTADO' : 'EN_USO';
      batchLabel = batch.numeroLote;

      updatedLotes = (item.lotes || []).map(b => {
        if (b.id === batch.id) {
          return {
            ...b,
            contenidoActual: newContenido,
            estado: newBatchEstado
          };
        }
        return b;
      });
      newStockActual = updatedLotes.reduce((sum, b) => sum + (b.estado !== 'AGOTADO' ? b.contenidoActual : 0), 0);
    }

    const updatedItems = stockItems.map(i => {
      if (i.id === item.id) {
        return {
          ...i,
          stockActual: newStockActual,
          lotes: updatedLotes
        };
      }
      return i;
    });

    let vehicleText: string | undefined = undefined;
    if (despachoEquipmentId) {
      const vehicle = fleet.find(v => v.id === despachoEquipmentId);
      if (vehicle) {
        vehicleText = `${vehicle.modeloMarca} (${vehicle.patente || vehicle.codigoInterno || vehicle.id})`;
      }
    }

    let empNombre: string | undefined = undefined;
    let empLegajo: string | undefined = undefined;
    if (despachoEmployeeLegajo) {
      const emp = employees.find(e => e.legajo === despachoEmployeeLegajo || e.id === despachoEmployeeLegajo);
      if (emp) {
        empNombre = emp.nombreApellido;
        empLegajo = emp.legajo;
      }
    }

    const newMovement: StockMovement = {
      id: `STK-MOV-${Date.now()}`,
      stockItemId: item.id,
      stockItemNombre: item.nombre,
      depositoId: item.depositoId || 'DEP-TALLER',
      depositoNombre: item.depositoNombre,
      batchId: batch?.id,
      batchNumeroLote: batchLabel,
      tipo: 'EGRESO_CONSUMO',
      cantidad: qty,
      unidad: item.unidad,
      stockAnterior,
      stockPosterior: newStockActual,
      fecha: todayStr,
      hora: timeStr,
      equipoCodigoOrPatente: vehicleText,
      equipoId: despachoEquipmentId || undefined,
      responsableEntrega: despachoResponsable || 'Encargado de Depósito',
      recibeEmpleadoNombre: empNombre,
      recibeEmpleadoLegajo: empLegajo,
      motivoConcepto: despachoMotivo || 'Entrega / Descarga de Depósito',
      observaciones: despachoLeyendaObs.trim() || `Entrega / descarga registrada desde ${batchLabel}.`
    };

    onSaveStockItems(updatedItems);
    onSaveStockMovements([newMovement, ...stockMovements]);
    setIsDespachoModalOpen(false);

    if (detailItem?.id === item.id) {
      const refreshed = updatedItems.find(i => i.id === item.id);
      if (refreshed) setDetailItem(refreshed);
    }
  };

  // Multi-item Indumentaria / EPP Employee Delivery Handler
  const handleOpenClothingDeliveryModal = (defaultItem?: StockItem | null) => {
    setClothingDeliveryDefaultItem(defaultItem || null);
    setIsClothingDeliveryModalOpen(true);
  };

  const handleConfirmClothingDelivery = (payload: ClothingDeliverySubmitPayload) => {
    const entregaGrupoId = `ENT-IND-${Date.now()}`;
    const itemMap = new Map<string, StockItem>(
      stockItems.map(i => [i.id, { ...i, lotes: i.lotes ? i.lotes.map(l => ({ ...l })) : undefined }])
    );
    const createdMovements: StockMovement[] = [];
    const motivoText = CLOTHING_MOTIVO_LABELS[payload.motivoEntrega] || 'Entrega de Indumentaria';

    payload.lines.forEach((line, idx) => {
      const item = itemMap.get(line.stockItemId);
      if (!item) return;

      const qty = Math.max(1, Number(line.cantidad) || 1);
      const stockAnterior = Number(item.stockActual) || 0;
      let newStockActual = Math.max(0, stockAnterior - qty);
      let updatedLotes = item.lotes;
      let usedBatch: StockBatch | undefined;

      if (updatedLotes && updatedLotes.length > 0) {
        let remainingToDeduct = qty;
        updatedLotes = updatedLotes.map(b => {
          if (remainingToDeduct <= 0 || b.estado === 'AGOTADO' || b.contenidoActual <= 0) return b;
          if (!usedBatch) usedBatch = b;
          const take = Math.min(b.contenidoActual, remainingToDeduct);
          remainingToDeduct -= take;
          const newContenido = Math.max(0, b.contenidoActual - take);
          return {
            ...b,
            contenidoActual: newContenido,
            estado: newContenido === 0 ? 'AGOTADO' : 'EN_USO',
          };
        });
        newStockActual = updatedLotes.reduce(
          (sum, b) => sum + (b.estado !== 'AGOTADO' ? b.contenidoActual : 0),
          0
        );
      }

      itemMap.set(item.id, {
        ...item,
        stockActual: newStockActual,
        lotes: updatedLotes,
      });

      const wh = stockWarehouses.find(w => w.id === (item.depositoId || 'DEP-INDUMENTARIA'));
      const resolvedTalle = line.talle || item.talle || undefined;

      createdMovements.push({
        id: `STK-MOV-${Date.now()}-${idx}`,
        stockItemId: item.id,
        stockItemNombre: item.nombre,
        depositoId: item.depositoId || 'DEP-INDUMENTARIA',
        depositoNombre: item.depositoNombre || wh?.nombre || 'Depósito Ropa e Indumentaria (EPP)',
        batchId: usedBatch?.id,
        batchNumeroLote: usedBatch?.numeroLote || 'Stock Directo Depósito',
        tipo: 'EGRESO_CONSUMO',
        cantidad: qty,
        unidad: item.unidad,
        stockAnterior,
        stockPosterior: newStockActual,
        fecha: payload.fecha,
        hora: payload.hora,
        responsableEntrega: payload.responsableEntrega,
        recibeEmpleadoNombre: payload.receiverName,
        recibeEmpleadoLegajo: payload.receiverLegajo,
        recibeEmpleadoDni: payload.receiverDni,
        recibeEmpleadoSector: payload.receiverSector,
        esEntregaIndumentaria: true,
        entregaGrupoId,
        talle: resolvedTalle,
        motivoEntrega: payload.motivoEntrega,
        devuelveAnterior: payload.devuelveAnterior,
        motivoConcepto: motivoText,
        observaciones:
          payload.observaciones ||
          `Entrega de indumentaria / EPP a ${payload.receiverName}${resolvedTalle ? ` (Talle ${resolvedTalle})` : ''}.`,
      });
    });

    if (createdMovements.length === 0) return;

    const updatedItems = stockItems.map(orig => itemMap.get(orig.id) || orig);
    onSaveStockItems(updatedItems);
    onSaveStockMovements([...createdMovements, ...stockMovements]);
    setIsClothingDeliveryModalOpen(false);
    setActiveTab('clothing_deliveries');

    if (payload.downloadPdfAfter) {
      generateIndumentariaConstanciaPDF({
        movements: createdMovements,
        employeeName: payload.receiverName,
        legajo: payload.receiverLegajo,
        dni: payload.receiverDni,
        sector: payload.receiverSector,
        responsable: payload.responsableEntrega,
        warehouseName: activeWarehouse?.nombre || 'Depósito Ropa e Indumentaria (EPP)',
      });
    }
  };

  // Toggle Drum State
  const handleToggleBatchState = (itemId: string, batchId: string, newStatus: 'EN_USO' | 'NUEVO_SELLADO' | 'AGOTADO') => {
    const updatedItems = stockItems.map(item => {
      if (item.id === itemId) {
        const updatedLotes = (item.lotes || []).map(b => {
          if (b.id === batchId) {
            return { ...b, estado: newStatus };
          }
          return b;
        });
        const newStockActual = updatedLotes.reduce((sum, b) => sum + (b.estado !== 'AGOTADO' ? b.contenidoActual : 0), 0);
        return { ...item, lotes: updatedLotes, stockActual: newStockActual };
      }
      return item;
    });

    onSaveStockItems(updatedItems);
    if (detailItem?.id === itemId) {
      const refreshed = updatedItems.find(i => i.id === itemId);
      if (refreshed) setDetailItem(refreshed);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Banner: Gestión de Depósitos */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#16191F] via-slate-900 to-amber-950/50 p-6 border border-[#2D2D2D] shadow-2xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-[#F0C800]/15 rounded-xl border border-[#F0C800]/30 text-[#F0C800] text-2xl flex items-center justify-center">
              {selectedWarehouseId === 'FUEL_DEPOSITS' ? '⛽' : (activeWarehouse?.icono || '🏭')}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-white">
                  {selectedWarehouseId === 'FUEL_DEPOSITS'
                    ? 'Depósito de Combustibles & Cisternas'
                    : activeWarehouse
                    ? activeWarehouse.nombre
                    : 'Gestión General de Depósitos'}
                </h1>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/30">
                  {stockWarehouses.length + 1} Depósitos Activos
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                {selectedWarehouseId === 'FUEL_DEPOSITS'
                  ? 'Control de cisternas móviles, bidones y cuentas corrientes de estaciones de servicio (acceso directo desde Depósitos y Combustible).'
                  : activeWarehouse
                  ? (activeWarehouse.descripcion || `Ubicación: ${activeWarehouse.ubicacion || 'Base Central'} • Responsable: ${activeWarehouse.responsable || 'Encargado'}`)
                  : 'Administre el Depósito de Taller, Depósito de Ventas, Depósito de Herramientas (pinzas, llaves, herramientas para el personal y máquinas), Depósito de Combustibles o cree nuevos depósitos.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenWarehouseModal()}
              className="px-4 py-2.5 rounded-xl text-xs font-black bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] transition shadow-lg shadow-[#F0C800]/20 flex items-center gap-1.5 border border-[#DDA800] cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              + Crear Depósito
            </button>

            {activeWarehouse && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenWarehouseModal(activeWarehouse)}
                  className="px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                  title="Editar datos de este depósito"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#F0C800]" />
                  Editar Depósito
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteWarehouse(activeWarehouse)}
                  className="px-3 py-2.5 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition flex items-center gap-1.5 cursor-pointer"
                  title="Eliminar este depósito"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Selector de Depósitos (Cards / Tabs interactivos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Card: Todos los Depósitos */}
        <button
          type="button"
          onClick={() => onSelectWarehouse('ALL')}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
            selectedWarehouseId === 'ALL'
              ? 'bg-amber-500/15 border-[#F0C800] shadow-lg shadow-[#F0C800]/10'
              : 'bg-[#16191F] border-[#2D2D2D] hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xl">🏭</span>
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
              selectedWarehouseId === 'ALL'
                ? 'bg-[#F0C800] text-[#2D2D2D]'
                : 'bg-slate-800 text-slate-300'
            }`}>
              {stockItems.length} ítems
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-xs font-black text-white truncate">Todos los Depósitos</div>
            <div className="text-[10px] text-slate-400 truncate mt-0.5">Vista consolidada general</div>
          </div>
        </button>

        {/* Cards for each StockWarehouse (Taller, Ventas, Herramientas, Custom...) */}
        {stockWarehouses.map(wh => {
          const isSelected = selectedWarehouseId === wh.id;
          const count = stockItems.filter(i => (i.depositoId || 'DEP-TALLER') === wh.id).length;

          return (
            <div
              key={wh.id}
              onClick={() => onSelectWarehouse(wh.id)}
              className={`group relative text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-amber-500/15 border-[#F0C800] shadow-lg shadow-[#F0C800]/10'
                  : 'bg-[#16191F] border-[#2D2D2D] hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <span className="text-xl">{wh.icono || '🏭'}</span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-800">
                    {wh.codigo}
                  </span>
                </div>
                <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  isSelected
                    ? 'bg-[#F0C800] text-[#2D2D2D]'
                    : 'bg-slate-800 text-slate-300'
                }`}>
                  {count} ítems
                </span>
              </div>
              <div className="mt-2.5">
                <div className="text-xs font-black text-white truncate">{wh.nombre}</div>
                <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                  {wh.descripcion || wh.ubicacion || 'Depósito operativo'}
                </div>
              </div>
            </div>
          );
        })}

        {/* Special Card: Depósito de Combustibles (Shared View - 2 Caminos para una misma vista) */}
        <button
          type="button"
          onClick={() => onSelectWarehouse('FUEL_DEPOSITS')}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
            selectedWarehouseId === 'FUEL_DEPOSITS'
              ? 'bg-cyan-500/15 border-cyan-400 shadow-lg shadow-cyan-500/10'
              : 'bg-[#16191F] border-[#2D2D2D] hover:border-cyan-500/40'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5">
              <span className="text-xl">⛽</span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">
                ESPECIAL
              </span>
            </div>
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
              selectedWarehouseId === 'FUEL_DEPOSITS'
                ? 'bg-cyan-400 text-slate-950'
                : 'bg-slate-800 text-cyan-400'
            }`}>
              {fuelDepositsCount} cisternas
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-xs font-black text-white truncate flex items-center gap-1">
              <span>Depósito de Combustibles</span>
            </div>
            <div className="text-[10px] text-slate-400 truncate mt-0.5">
              Cisternas móviles, bidones y estaciones
            </div>
          </div>
        </button>
      </div>

      {/* IF FUEL_DEPOSITS IS SELECTED: RENDER SHARED FUEL DEPOSITS VIEW DIRECTLY HERE */}
      {selectedWarehouseId === 'FUEL_DEPOSITS' && fuelDepositsNode ? (
        <div className="pt-2">
          {fuelDepositsNode}
        </div>
      ) : (
        <>
          {/* Action Toolbar for Current Warehouse */}
          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Wrench className="w-4 h-4 text-[#F0C800]" />
              <span className="text-xs font-bold text-slate-200">
                Operaciones en {activeWarehouse ? <strong className="text-[#F0C800]">{activeWarehouse.nombre}</strong> : <strong className="text-[#F0C800]">Todos los Depósitos</strong>}:
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenItemModal()}
                className="px-3.5 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-500 text-white transition shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Package className="w-4 h-4" />
                {activeWarehouse?.tipo === 'INDUMENTARIA'
                  ? '+ Nueva Prenda / EPP'
                  : activeWarehouse?.tipo === 'HERRAMIENTAS'
                  ? '+ Nueva Herramienta'
                  : activeWarehouse?.tipo === 'VENTAS'
                  ? '+ Nuevo Artículo en Depósito'
                  : '+ Nuevo Insumo / Artículo'}
              </button>

              {(isIndumentariaScope || (selectedWarehouseId === 'ALL' && indumentariaItems.length > 0)) && (
                <button
                  type="button"
                  onClick={() => handleOpenClothingDeliveryModal(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-black bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] transition shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Shirt className="w-4 h-4" />
                  Entregar Indumentaria al Personal
                </button>
              )}

              <button
                type="button"
                onClick={() => handleOpenIngresoModal()}
                disabled={stockItems.length === 0}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold text-white transition shadow-md flex items-center gap-1.5 ${
                  stockItems.length === 0 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                    : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                Ingresar Stock / Lote
              </button>

              {!isIndumentariaScope && (
                <button
                  type="button"
                  onClick={() => handleOpenDespachoModal()}
                  disabled={stockItems.length === 0}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold text-white transition shadow-md flex items-center gap-1.5 ${
                    stockItems.length === 0 
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                      : 'bg-amber-600 hover:bg-amber-500 cursor-pointer'
                  }`}
                >
                  <MinusCircle className="w-4 h-4" />
                  {activeWarehouse?.tipo === 'HERRAMIENTAS'
                    ? 'Entregar Herramienta / Descarga'
                    : 'Registrar Entrega / Descarga'}
                </button>
              )}

              {warehouseScopedItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllItems}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition flex items-center gap-1.5 cursor-pointer"
                  title="Vaciar ítems de este depósito"
                >
                  <Trash2 className="w-4 h-4" />
                  Vaciar Depósito
                </button>
              )}
            </div>
          </div>

          {/* Metrics Bento Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Ítems en Depósito</span>
                <Package className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-black text-white">{metrics.totalItems}</div>
              <div className="text-[11px] text-slate-500 mt-1">
                {activeWarehouse ? activeWarehouse.nombre : 'Total en depósitos'}
              </div>
            </div>

            <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Unidades / Herramientas</span>
                <Boxes className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-emerald-400">{metrics.totalUnidades.toLocaleString()} u.</div>
              <div className="text-[11px] text-slate-500 mt-1">Herramientas, filtros y piezas</div>
            </div>

            <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Litros en Stock</span>
                <Droplet className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-black text-amber-400">{metrics.totalLiters.toLocaleString()} L</div>
              <div className="text-[11px] text-slate-500 mt-1">Aceites y fluidos</div>
            </div>

            <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Kgs / Grasas</span>
                <Layers className="w-4 h-4 text-orange-400" />
              </div>
              <div className="text-2xl font-black text-orange-400">{metrics.totalKgs.toLocaleString()} Kg</div>
              <div className="text-[11px] text-slate-500 mt-1">Baldes y lubricantes</div>
            </div>

            <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Alertas Stock Bajo</span>
                <AlertTriangle className={`w-4 h-4 ${metrics.lowStockCount > 0 ? 'text-red-400 animate-pulse' : 'text-slate-600'}`} />
              </div>
              <div className={`text-2xl font-black ${metrics.lowStockCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {metrics.lowStockCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Bajo mínimo de alerta</div>
            </div>
          </div>

          {/* Main Tabs & Search Bar */}
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto gap-1">
                <button
                  onClick={() => setActiveTab('inventory')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab === 'inventory' 
                      ? 'bg-amber-500 text-slate-950 shadow-md' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  Inventario ({warehouseScopedItems.length})
                </button>
                {(isIndumentariaScope || clothingDeliveryMovements.length > 0) && (
                  <button
                    onClick={() => setActiveTab('clothing_deliveries')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                      activeTab === 'clothing_deliveries'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <Shirt className="w-4 h-4" />
                    Registro Entregas Indumentaria ({clothingDeliveryMovements.length})
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('categories')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab === 'categories' 
                      ? 'bg-amber-500 text-slate-950 shadow-md' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Tag className="w-4 h-4" />
                  Categorías ({stockCategories.length})
                </button>
                <button
                  onClick={() => {
                    setActiveTab('kardex');
                    setKardexFilterItemId(null);
                  }}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab === 'kardex' 
                      ? 'bg-amber-500 text-slate-950 shadow-md' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <History className="w-4 h-4" />
                  Historial Entregas & Kardex ({warehouseScopedMovements.length})
                </button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => exportStockToCSV(warehouseScopedItems)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Inventario CSV
                </button>
                <button
                  onClick={() => exportStockMovementsToCSV(warehouseScopedMovements)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Kardex CSV
                </button>
              </div>
            </div>

            {/* Filter Controls (Inventory & Kardex) */}
            {(activeTab === 'inventory' || activeTab === 'kardex') && (
              <div className="flex flex-col md:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder={activeTab === 'inventory' ? "Buscar por nombre, código, talle, marca, herramienta o ubicación..." : "Buscar entrega o movimiento por empleado, máquina o concepto..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {activeTab === 'inventory' && (
                  <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                    {groupRowKeys.length > 0 && (
                      <button
                        type="button"
                        onClick={handleToggleExpandAllGroups}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-800 hover:border-amber-500/40 transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        title={allGroupsExpanded ? 'Contraer todos los talles' : 'Desplegar talles de todos los productos'}
                      >
                        {allGroupsExpanded ? (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            Contraer Talles ({groupRowKeys.length})
                          </>
                        ) : (
                          <>
                            <ChevronRight className="w-3.5 h-3.5" />
                            Desplegar Todos ({groupRowKeys.length})
                          </>
                        )}
                      </button>
                    )}
                    <Filter className="w-4 h-4 text-slate-500 shrink-0" />
                    <select
                      value={selectedCategoryFilter}
                      onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500 transition"
                    >
                      <option value="ALL">Todas las Categorías</option>
                      {stockCategories.map(cat => (
                        <option key={cat.id} value={cat.nombre}>
                          {cat.icono || '🛢️'} {cat.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* TAB 1: Inventory Table */}
            {activeTab === 'inventory' && (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                      <th className="py-3 px-4">ARTÍCULO / HERRAMIENTA / INSUMO</th>
                      <th className="py-3 px-3">DEPÓSITO</th>
                      <th className="py-3 px-3">CATEGORÍA</th>
                      <th className="py-3 px-3">{isIndumentariaScope ? 'TALLES DISPONIBLES' : 'LOTES / TALLES'}</th>
                      <th className="py-3 px-4 text-center">{isIndumentariaScope ? 'STOCK TOTAL' : 'STOCK ACTUAL'}</th>
                      <th className="py-3 px-3 text-right">COSTO UNIT.</th>
                      <th className="py-3 px-4 text-right">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {inventoryDisplayRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          <div className="max-w-md mx-auto space-y-3">
                            <Package className="w-12 h-12 text-slate-700 mx-auto" />
                            <div className="text-base font-bold text-slate-300">
                              {activeWarehouse
                                ? `No hay ítems cargados en ${activeWarehouse.nombre}`
                                : 'No hay artículos ni insumos cargados en los depósitos'}
                            </div>
                            <p className="text-xs text-slate-500">
                              {activeWarehouse?.tipo === 'INDUMENTARIA'
                                ? 'Cargue camisas, pantalones, botines de seguridad, cascos, chalecos, guantes y abrigos por talle para entregar al personal.'
                                : activeWarehouse?.tipo === 'HERRAMIENTAS'
                                ? 'Registre aquí pinzas, llaves, cajas de herramientas y equipos de mano que se entregan al personal o a las máquinas.'
                                : activeWarehouse?.tipo === 'VENTAS'
                                ? 'Registre aquí los artículos e insumos almacenados en el Depósito de Ventas.'
                                : 'Haga clic en el botón inferior para dar de alta el primer artículo o insumo en este depósito.'}
                            </p>
                            <button
                              onClick={() => handleOpenItemModal()}
                              className="px-4 py-2 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-amber-400 transition cursor-pointer"
                            >
                              + Cargar Primer Ítem en {activeWarehouse ? activeWarehouse.nombre : 'Depósito'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      inventoryDisplayRows.map(row => {
                        if (row.kind === 'group') {
                          const isExpanded = Boolean(expandedGroupKeys[row.groupKey]);
                          const wh = stockWarehouses.find(w => w.id === row.depositoId);
                          const defaultDeliverItem =
                            row.items.find(it => (Number(it.stockActual) || 0) > 0) || row.items[0];
                          const sizeNames = row.items.map(it => it.talle || 'Único');
                          const costLabel =
                            row.minCost === undefined
                              ? '-'
                              : row.maxCost !== undefined && row.maxCost !== row.minCost
                                ? `${formatCurrency(row.minCost)} - ${formatCurrency(row.maxCost)}`
                                : formatCurrency(row.minCost);

                          return (
                            <React.Fragment key={row.groupKey}>
                              {/* General Product Row (Collapsed / Parent Header) */}
                              <tr
                                onClick={() => toggleGroupExpand(row.groupKey)}
                                className={`transition-colors cursor-pointer select-none ${
                                  isExpanded
                                    ? 'bg-slate-800/70'
                                    : 'hover:bg-slate-800/45'
                                }`}
                              >
                                {/* Producto General */}
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-2.5">
                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center border transition shrink-0 ${
                                      isExpanded
                                        ? 'bg-[#F0C800]/20 border-[#F0C800]/50 text-[#F0C800]'
                                        : 'bg-slate-950 border-slate-700 text-slate-400'
                                    }`}>
                                      {isExpanded ? (
                                        <ChevronDown className="w-4 h-4" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )}
                                    </span>
                                    <div className="min-w-0">
                                      <div className="font-bold text-white text-sm flex flex-wrap items-center gap-2">
                                        <span>{wh?.icono || '🦺'}</span>
                                        <span>{row.nombre}</span>
                                        <span className="text-[11px] font-semibold text-amber-300/90 tabular-nums">
                                          · {row.items.length} {row.items.length === 1 ? 'talle' : 'talles'}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-2">
                                        <span className="text-slate-300">{row.codeRangeLabel}</span>
                                        {row.marca && <span className="text-slate-400 font-sans">[{row.marca}]</span>}
                                        {row.ubicacionPañol && <span className="text-slate-500 font-sans">• {row.ubicacionPañol}</span>}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* Depósito */}
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                                    <span>{wh?.icono || '🦺'}</span>
                                    <span>{wh?.nombre || row.depositoNombre}</span>
                                  </span>
                                </td>

                                {/* Categoría */}
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                                    <Tag className="w-3 h-3" />
                                    {row.categoria}
                                  </span>
                                </td>

                                {/* Resumen de Talles */}
                                <td className="py-3.5 px-3">
                                  <div className="text-xs text-slate-200 font-medium truncate max-w-[240px]" title={sizeNames.join(' · ')}>
                                    {sizeNames.join(' · ')}
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    {isExpanded ? 'Clic para contraer detalle' : 'Clic para desplegar stock por talle'}
                                  </div>
                                </td>

                                {/* Stock Total del Producto General */}
                                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                  <div className="font-black text-sm tabular-nums">
                                    <span className={row.totalStock <= 0 ? 'text-red-400' : 'text-emerald-400'}>
                                      {row.totalStock.toLocaleString()} {row.unidad}
                                    </span>
                                  </div>
                                  {row.lowStockItemsCount > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-bold mt-0.5">
                                      <AlertTriangle className="w-3 h-3" />
                                      {row.lowStockItemsCount} {row.lowStockItemsCount === 1 ? 'talle bajo mín.' : 'talles bajo mín.'}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500 block mt-0.5">Stock total acumulado</span>
                                  )}
                                </td>

                                {/* Costo Unit. */}
                                <td className="py-3.5 px-3 text-right whitespace-nowrap">
                                  <div className="font-semibold text-slate-200 tabular-nums">{costLabel}</div>
                                </td>

                                {/* Acciones Producto General */}
                                <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => toggleGroupExpand(row.groupKey)}
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer border ${
                                        isExpanded
                                          ? 'bg-[#F0C800] text-slate-950 border-[#F0C800]'
                                          : 'bg-slate-800/90 text-slate-200 border-slate-700 hover:bg-slate-700'
                                      }`}
                                    >
                                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                      {isExpanded ? 'Ocultar' : `Talles (${row.items.length})`}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAddSizeModal(row.items)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 border border-emerald-500/30 transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                                      title={`Agregar nuevo talle a ${row.nombre}`}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      Talle
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenClothingDeliveryModal(defaultDeliverItem)}
                                      className="p-1.5 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/30 transition cursor-pointer"
                                      title="Entregar Indumentaria al Personal"
                                    >
                                      <Shirt className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditGroupModal(row)}
                                      className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-[#F0C800] hover:text-slate-950 border border-slate-700 transition cursor-pointer"
                                      title={`Editar producto general "${row.nombre}" (actualiza todos los talles)`}
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Expanded Size-by-Size Breakdown */}
                              {isExpanded && (
                                <tr className="bg-slate-950/85">
                                  <td colSpan={7} className="p-0">
                                    <div className="border-l-2 border-l-[#F0C800] bg-slate-950/90 px-4 py-3 sm:pl-12">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                          Detalle de talles y stock — <span className="text-white">{row.nombre}</span>
                                        </span>
                                        <span className="text-[11px] font-mono text-emerald-400 font-bold tabular-nums">
                                          Total: {row.totalStock.toLocaleString()} {row.unidad}
                                        </span>
                                      </div>

                                      <div className="overflow-x-auto rounded-lg border border-slate-800/90 bg-slate-900/50">
                                        <table className="w-full text-left border-collapse">
                                          <thead>
                                            <tr className="bg-slate-950/90 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                                              <th className="py-2 px-3">TALLE / VARIANTE</th>
                                              <th className="py-2 px-3">CÓDIGO</th>
                                              <th className="py-2 px-3">LOTES / INGRESOS</th>
                                              <th className="py-2 px-3 text-center">STOCK POR TALLE</th>
                                              <th className="py-2 px-3 text-right">COSTO UNIT.</th>
                                              <th className="py-2 px-3 text-right">ACCIONES</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-800/60 text-xs">
                                            {row.items.map(item => {
                                              const activeLotes = (item.lotes || []).filter(l => l.estado !== 'AGOTADO');
                                              const isLow = item.stockActual <= item.stockMinimoAlerta;

                                              return (
                                                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                      <span className="font-bold text-amber-300 text-xs">
                                                        {item.talle ? `Talle ${item.talle}` : 'Talle Único'}
                                                      </span>
                                                      {item.genero && item.genero !== 'Unisex' && (
                                                        <span className="text-[10px] text-slate-400">({item.genero})</span>
                                                      )}
                                                    </div>
                                                  </td>
                                                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                                                    {item.codigo}
                                                  </td>
                                                  <td className="py-2.5 px-3">
                                                    {activeLotes.length === 0 ? (
                                                      <span className="text-slate-500 text-[11px] italic">Stock directo</span>
                                                    ) : (
                                                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${activeLotes[0].estado === 'EN_USO' ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                                                        <span className="text-slate-300 truncate max-w-[180px]">{activeLotes[0].numeroLote}</span>
                                                        <span className="text-slate-400 font-mono tabular-nums">({activeLotes[0].contenidoActual} {item.unidad})</span>
                                                        {activeLotes.length > 1 && (
                                                          <span className="text-[10px] text-amber-400 font-semibold">+{activeLotes.length - 1}</span>
                                                        )}
                                                      </div>
                                                    )}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                                    <div className="font-black text-xs tabular-nums">
                                                      <span className={isLow ? 'text-red-400' : 'text-emerald-400'}>
                                                        {item.stockActual.toLocaleString()} {item.unidad}
                                                      </span>
                                                    </div>
                                                    {isLow && (
                                                      <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-bold">
                                                        <AlertTriangle className="w-3 h-3" /> Reponer (Mín: {item.stockMinimoAlerta})
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-slate-300 whitespace-nowrap tabular-nums">
                                                    {item.precioCostoUnitario ? formatCurrency(item.precioCostoUnitario) : '-'}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-1">
                                                      <button
                                                        type="button"
                                                        onClick={() => setDetailItem(item)}
                                                        className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                                        title="Ver Detalle, Lotes y Entregas de este talle"
                                                      >
                                                        <Eye className="w-3 h-3" />
                                                        Detalle ({(item.lotes || []).length})
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => handleOpenIngresoModal(item)}
                                                        className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition cursor-pointer"
                                                        title="Ingresar Stock a este talle"
                                                      >
                                                        <PlusCircle className="w-3.5 h-3.5" />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => handleOpenClothingDeliveryModal(item)}
                                                        className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition cursor-pointer"
                                                        title="Entregar este talle al Personal"
                                                      >
                                                        <Shirt className="w-3.5 h-3.5" />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => handleOpenItemModal(item)}
                                                        className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
                                                        title="Editar Talle"
                                                      >
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => handleDeleteItem(item.id)}
                                                        className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition cursor-pointer"
                                                        title="Eliminar Talle"
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
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        }

                        // Standard non-grouped item row (Taller / Herramientas / Otros)
                        const item = row.item;
                        const activeLotes = (item.lotes || []).filter(l => l.estado !== 'AGOTADO');
                        const isLow = item.stockActual <= item.stockMinimoAlerta;
                        const wh = stockWarehouses.find(w => w.id === (item.depositoId || 'DEP-TALLER'));

                        return (
                          <tr key={item.id} className="hover:bg-slate-800/40 transition-colors group">
                            {/* Código / Nombre */}
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-white text-sm flex items-center gap-2">
                                <span>{wh?.icono || '📦'}</span>
                                <span>{item.nombre}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                                <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300">
                                  {item.codigo}
                                </span>
                                {item.marca && <span className="text-slate-400 font-sans">[{item.marca}]</span>}
                                {item.ubicacionPañol && <span className="text-slate-500 font-sans">• {item.ubicacionPañol}</span>}
                              </div>
                            </td>

                            {/* Depósito */}
                            <td className="py-3.5 px-3 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                                <span>{wh?.icono || '🏭'}</span>
                                <span>{wh?.nombre || item.depositoNombre || 'Depósito de Taller'}</span>
                              </span>
                            </td>

                            {/* Categoría */}
                            <td className="py-3.5 px-3">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Tag className="w-3 h-3" />
                                {item.categoria}
                              </span>
                            </td>

                            {/* Lotes / Tambores Activos */}
                            <td className="py-3.5 px-3">
                              <div className="space-y-1">
                                {activeLotes.length === 0 ? (
                                  <span className="text-slate-500 text-[11px] italic">Stock directo ({item.unidad})</span>
                                ) : (
                                  activeLotes.slice(0, 2).map(lote => (
                                    <div key={lote.id} className="flex items-center gap-2 text-[11px]">
                                      <span className={`w-2 h-2 rounded-full ${lote.estado === 'EN_USO' ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'}`} />
                                      <span className="text-slate-200 font-medium truncate max-w-[160px]">{lote.numeroLote}</span>
                                      <span className="text-slate-400 font-mono">({lote.contenidoActual} {item.unidad})</span>
                                    </div>
                                  ))
                                )}
                                {activeLotes.length > 2 && (
                                  <span className="text-[10px] text-amber-400 font-bold block">
                                    + {activeLotes.length - 2} lote(s) adicional(es)
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Stock Total */}
                            <td className="py-3.5 px-4 text-center">
                              <div className="font-black text-sm tabular-nums">
                                <span className={isLow ? 'text-red-400' : 'text-emerald-400'}>
                                  {item.stockActual.toLocaleString()} {item.unidad}
                                </span>
                              </div>
                              {isLow && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-bold mt-0.5">
                                  <AlertTriangle className="w-3 h-3" /> Reponer (Mín: {item.stockMinimoAlerta})
                                </span>
                              )}
                            </td>

                            {/* Costo Unit. */}
                            <td className="py-3.5 px-3 text-right">
                              <div className="font-semibold text-slate-200 tabular-nums">
                                {item.precioCostoUnitario ? formatCurrency(item.precioCostoUnitario) : '-'}
                              </div>
                            </td>

                            {/* Acciones */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setDetailItem(item)}
                                  className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                                  title="Ver Detalle, Lotes y Entregas"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Detalle ({(item.lotes || []).length})
                                </button>
                                <button
                                  onClick={() => handleOpenIngresoModal(item)}
                                  className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition cursor-pointer"
                                  title="Ingresar Stock / Lote"
                                >
                                  <PlusCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleOpenDespachoModal(item)}
                                  className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white transition cursor-pointer"
                                  title="Registrar Entrega / Descarga"
                                >
                                  <MinusCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleOpenItemModal(item)}
                                  className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
                                  title="Editar Ítem"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition cursor-pointer"
                                  title="Eliminar Ítem"
                                >
                                  <Trash2 className="w-4 h-4" />
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

            {/* TAB 1B: Registro de Entregas de Indumentaria al Personal */}
            {activeTab === 'clothing_deliveries' && (
              <IndumentariaRegistryTab
                deliveries={clothingDeliveryMovements}
                indumentariaItems={indumentariaItems}
                employees={employees}
                onOpenNewDelivery={() => handleOpenClothingDeliveryModal(null)}
              />
            )}

            {/* TAB 2: Categories Custom Management */}
            {activeTab === 'categories' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Tag className="w-4 h-4 text-amber-400" />
                      Categorías de Depósitos
                    </h3>
                    <p className="text-xs text-slate-400">
                      Organice las familias de herramientas, insumos de taller y mercadería de ventas.
                    </p>
                  </div>
                  <button
                    onClick={() => handleOpenCategoryModal()}
                    className="px-4 py-2 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-amber-400 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Nueva Categoría
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stockCategories.map(cat => {
                    const count = stockItems.filter(i => i.categoria === cat.nombre).length;
                    return (
                      <div key={cat.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-lg">
                              <span>{cat.icono || '🛢️'}</span>
                              <span className="font-bold text-white text-sm">{cat.nombre}</span>
                            </div>
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
                              {count} ítem(s)
                            </span>
                          </div>
                          {cat.descripcion && (
                            <p className="text-xs text-slate-400 mt-2 line-clamp-2">{cat.descripcion}</p>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-900">
                          <button
                            onClick={() => handleOpenCategoryModal(cat)}
                            className="p-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Editar
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: Kardex History */}
            {activeTab === 'kardex' && (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                      <th className="py-3 px-4">FECHA / HORA</th>
                      <th className="py-3 px-3">TIPO</th>
                      <th className="py-3 px-4">ARTÍCULO / HERRAMIENTA / INSUMO</th>
                      <th className="py-3 px-3 text-right">CANTIDAD</th>
                      <th className="py-3 px-4 text-center">SALDO STOCK</th>
                      <th className="py-3 px-4">MÁQUINA / EMPLEADO QUE RECIBE</th>
                      <th className="py-3 px-4">CONCEPTO / OBSERVACIÓN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {filteredMovements.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          No hay movimientos ni entregas registradas en este depósito.
                        </td>
                      </tr>
                    ) : (
                      filteredMovements.map(mov => {
                        const isIngreso = mov.tipo === 'INGRESO_RECARGA';
                        return (
                          <tr key={mov.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-xs font-semibold">
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                {mov.fecha}
                              </div>
                              <div className="text-[11px] text-slate-500">{mov.hora || '00:00'} hs</div>
                            </td>

                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                isIngreso 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              }`}>
                                {isIngreso ? <PlusCircle className="w-3 h-3" /> : <MinusCircle className="w-3 h-3" />}
                                {isIngreso ? 'INGRESO' : 'ENTREGA / SALIDA'}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-bold text-white">{mov.stockItemNombre}</div>
                              {mov.batchNumeroLote && (
                                <div className="text-[11px] text-amber-400 font-mono flex items-center gap-1 mt-0.5">
                                  <Boxes className="w-3 h-3" />
                                  <span>{mov.batchNumeroLote}</span>
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3 text-right font-black text-sm whitespace-nowrap">
                              <span className={isIngreso ? 'text-emerald-400' : 'text-amber-400'}>
                                {isIngreso ? '+' : '-'}{mov.cantidad} {mov.unidad}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-center whitespace-nowrap font-mono text-xs">
                              <span className="text-slate-400">{mov.stockAnterior}</span>
                              <span className="text-slate-600 mx-1.5">➔</span>
                              <span className="text-white font-bold">{mov.stockPosterior} {mov.unidad}</span>
                            </td>

                            <td className="py-3 px-4">
                              {mov.equipoCodigoOrPatente ? (
                                <div className="flex items-center gap-1 text-slate-200 font-medium">
                                  <Truck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                  <span className="truncate max-w-xs">{mov.equipoCodigoOrPatente}</span>
                                </div>
                              ) : (
                                <div className="text-slate-500 italic">-</div>
                              )}
                              {mov.recibeEmpleadoNombre && (
                                <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                                  <UserCheck className="w-3 h-3 text-slate-500 shrink-0" />
                                  <span>{mov.recibeEmpleadoNombre} (Leg: {mov.recibeEmpleadoLegajo || 'S/D'})</span>
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <div className="text-slate-300 font-medium">{mov.motivoConcepto}</div>
                              {mov.observaciones && (
                                <div className="text-[11px] text-amber-300/80 italic mt-0.5">"{mov.observaciones}"</div>
                              )}
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
        </>
      )}

      {/* MODAL: Crear / Editar Depósito */}
      {isWarehouseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-[#F0C800]" />
                {editingWarehouse ? 'Editar Depósito' : 'Crear Nuevo Depósito'}
              </h3>
              <button onClick={() => setIsWarehouseModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWarehouse} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Código *</label>
                  <input
                    type="text"
                    required
                    value={whCodigo}
                    onChange={(e) => setWhCodigo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#F0C800]"
                    placeholder="ej: DEP-04"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Nombre del Depósito *</label>
                  <input
                    type="text"
                    required
                    value={whNombre}
                    onChange={(e) => setWhNombre(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-[#F0C800]"
                    placeholder="ej: Depósito de Herramientas / Depósito Obra"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Tipo de Depósito</label>
                  <select
                    value={whTipo}
                    onChange={(e) => setWhTipo(e.target.value as StockWarehouseType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F0C800]"
                  >
                    <option value="TALLER">Taller (Aceites, Filtros, Repuestos)</option>
                    <option value="HERRAMIENTAS">Herramientas (Pinzas, Llaves, Equipos Obra)</option>
                    <option value="INDUMENTARIA">Ropa, Indumentaria y EPP (Personal)</option>
                    <option value="VENTAS">Ventas (Salón Comercial / Ferretería)</option>
                    <option value="PERSONALIZADO">Otro / Depósito Personalizado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Ícono Identificador</label>
                  <div className="flex items-center gap-1.5 flex-wrap bg-slate-950 border border-slate-800 rounded-xl p-1.5">
                    {WAREHOUSE_ICONS.map(ic => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setWhIcono(ic)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-base transition cursor-pointer ${
                          whIcono === ic ? 'bg-[#F0C800] text-slate-950 scale-110' : 'hover:bg-slate-800'
                        }`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Ubicación Física</label>
                  <input
                    type="text"
                    value={whUbicacion}
                    onChange={(e) => setWhUbicacion(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                    placeholder="ej: Galpón Central / Obrador"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Responsable / Encargado</label>
                  <input
                    type="text"
                    value={whResponsable}
                    onChange={(e) => setWhResponsable(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                    placeholder="ej: Jefe de Taller / Pañolero"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Descripción / Qué se almacena aquí</label>
                <textarea
                  rows={2}
                  value={whDescripcion}
                  onChange={(e) => setWhDescripcion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                  placeholder="ej: Herramientas de obras y de las máquinas (pinzas, llaves, etc.) que se entregan al personal."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsWarehouseModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-black bg-[#F0C800] text-[#2D2D2D] hover:bg-[#F6D84C] transition cursor-pointer"
                >
                  {editingWarehouse ? 'Guardar Cambios' : 'Crear Depósito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL: Lotes y Descargas de un Ítem */}
      {detailItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                  <Boxes className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    {detailItem.nombre}
                    <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                      {detailItem.codigo}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Control de lotes/ingresos y historial de entregas para este artículo.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenIngresoModal(detailItem)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> + Ingresar Stock / Lote
                </button>
                <button onClick={() => setDetailItem(null)} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  Lotes / Tambores / Ingresos Registrados ({(detailItem.lotes || []).length})
                </h4>

                {(detailItem.lotes || []).length === 0 ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center text-slate-400">
                    Stock disponible actual: <strong className="text-emerald-400">{detailItem.stockActual} {detailItem.unidad}</strong>. Haga clic en <strong>"+ Ingresar Stock / Lote"</strong> para sumar unidades o contenedores.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(detailItem.lotes || []).map(batch => {
                      const isEnUso = batch.estado === 'EN_USO';
                      const isNuevo = batch.estado === 'NUEVO_SELLADO';
                      const isAgotado = batch.estado === 'AGOTADO';
                      const pct = Math.round((batch.contenidoActual / batch.capacidadInicial) * 100);

                      return (
                        <div 
                          key={batch.id} 
                          className={`bg-slate-950 border rounded-xl p-4 space-y-3 transition ${
                            selectedBatchForFilter === batch.id 
                              ? 'border-amber-500 shadow-lg shadow-amber-500/10' 
                              : 'border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-bold text-white text-sm flex items-center gap-2">
                                <Boxes className="w-4 h-4 text-amber-400" />
                                <span>{batch.numeroLote}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                Ingreso: {batch.fechaIngreso} • Inicial: {batch.capacidadInicial} {batch.unidad}
                              </div>
                            </div>

                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isEnUso ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                              isNuevo ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                              'bg-red-500/10 text-red-400 border-red-500/30'
                            }`}>
                              {isEnUso ? '🟢 En Uso' : isNuevo ? '🔵 Sellado / Nuevo' : '🔴 Agotado'}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-400">Disponible:</span>
                              <span className={newContentColor(pct)}>{batch.contenidoActual} {batch.unidad} ({pct}%)</span>
                            </div>
                            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                              <div 
                                className={`h-full transition-all duration-500 ${
                                  pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500'
                                }`} 
                                style={{ width: `${Math.max(0, pct)}%` }} 
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-900">
                            <button
                              onClick={() => handleOpenDespachoModal(detailItem, batch)}
                              disabled={isAgotado}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                isAgotado 
                                  ? 'bg-slate-900 text-slate-600 cursor-not-allowed' 
                                  : 'bg-amber-600 hover:bg-amber-500 text-white shadow-md cursor-pointer'
                              }`}
                            >
                              <MinusCircle className="w-3.5 h-3.5" /> Entregar / Descargar
                            </button>

                            <div className="flex items-center gap-1">
                              {isNuevo && (
                                <button
                                  onClick={() => handleToggleBatchState(detailItem.id, batch.id, 'EN_USO')}
                                  className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/20 hover:bg-emerald-500/20 cursor-pointer"
                                >
                                  Marcar En Uso
                                </button>
                              )}
                              {!isAgotado && (
                                <button
                                  onClick={() => handleToggleBatchState(detailItem.id, batch.id, 'AGOTADO')}
                                  className="px-2 py-1 bg-red-500/10 text-red-400 text-[10px] font-bold rounded border border-red-500/20 hover:bg-red-500/20 cursor-pointer"
                                >
                                  Agotado
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Historial de Entregas / Descargas para este Ítem */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <History className="w-4 h-4 text-blue-400" />
                    Historial de Entregas y Salidas de este Artículo
                  </span>
                </h4>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 text-[10px] uppercase font-semibold border-b border-slate-800">
                        <th className="py-2.5 px-3">FECHA</th>
                        <th className="py-2.5 px-3">ORIGEN / LOTE</th>
                        <th className="py-2.5 px-3 text-right">CANTIDAD</th>
                        <th className="py-2.5 px-3">DESTINO / MÁQUINA</th>
                        <th className="py-2.5 px-3">RECIBE EMPLEADO</th>
                        <th className="py-2.5 px-3">CONCEPTO / OBSERVACIÓN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {stockMovements.filter(m => m.stockItemId === detailItem.id && m.tipo === 'EGRESO_CONSUMO').length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-500">
                            Aún no se han registrado entregas ni salidas para este artículo.
                          </td>
                        </tr>
                      ) : (
                        stockMovements
                          .filter(m => m.stockItemId === detailItem.id && m.tipo === 'EGRESO_CONSUMO')
                          .map(mov => (
                            <tr key={mov.id} className="hover:bg-slate-800/40">
                              <td className="py-2.5 px-3 font-mono text-slate-300 text-[11px]">
                                {mov.fecha} {mov.hora}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-amber-400 font-mono text-[11px]">
                                {mov.batchNumeroLote || 'Stock Directo'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-black text-amber-400">
                                -{mov.cantidad} {mov.unidad}
                              </td>
                              <td className="py-2.5 px-3 text-slate-200">
                                {mov.equipoCodigoOrPatente || '-'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                                {mov.recibeEmpleadoNombre || mov.responsableEntrega || '-'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-300 font-medium">
                                {mov.observaciones || mov.motivoConcepto}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Crear/Editar Categoría */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-400" />
                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
              </h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nombre de la Categoría *</label>
                <input
                  type="text"
                  required
                  value={catNombre}
                  onChange={(e) => setCatNombre(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="ej: Herramientas de Mano, Pinzas y Llaves, Aceites"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Ícono / Emoji</label>
                <input
                  type="text"
                  value={catIcono}
                  onChange={(e) => setCatIcono(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="ej: 🧰, 🔧, 🛢️"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Descripción</label>
                <textarea
                  rows={2}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  placeholder="Finalidad de esta categoría..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition"
                >
                  Guardar Categoría
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Crear/Editar Artículo / Herramienta / Insumo */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" />
                {editingItem ? 'Editar Ítem de Depósito' : 'Nuevo Artículo / Herramienta / Insumo'}
              </h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Depósito Destino *</label>
                <select
                  value={itemDepositoId}
                  onChange={(e) => setItemDepositoId(e.target.value)}
                  className="w-full bg-slate-950 border border-[#F0C800]/50 rounded-xl px-3 py-2.5 text-sm text-[#F0C800] font-bold focus:outline-none focus:border-[#F0C800]"
                >
                  {stockWarehouses.map(wh => (
                    <option key={wh.id} value={wh.id}>
                      {wh.icono || '🏭'} {wh.nombre} ({wh.codigo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Código Interno *</label>
                  <input
                    type="text"
                    required
                    value={itemCodigo}
                    onChange={(e) => setItemCodigo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    placeholder="ej: HER-001 / INS-102"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Categoría *</label>
                  <select
                    value={itemCategoria}
                    onChange={(e) => setItemCategoria(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    {stockCategories.map(cat => (
                      <option key={cat.id} value={cat.nombre}>
                        {cat.icono || '🛢️'} {cat.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nombre del Artículo / Prenda / Insumo *</label>
                <input
                  type="text"
                  required
                  value={itemNombre}
                  onChange={(e) => setItemNombre(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder={
                    stockWarehouses.find(w => w.id === itemDepositoId)?.tipo === 'INDUMENTARIA'
                      ? 'ej: Camisa Grafa Manga Larga / Botín Seguridad Ombú / Casco 3M'
                      : 'ej: Juego de Llaves Combinadas Bahco / Pinza Universal / Aceite 15W40'
                  }
                />
              </div>

              {(stockWarehouses.find(w => w.id === itemDepositoId)?.tipo === 'INDUMENTARIA' || itemTalle.trim() !== '') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-amber-400 mb-1">Talle / Medida</label>
                    <input
                      type="text"
                      list="indumentaria-talles"
                      value={itemTalle}
                      onChange={(e) => setItemTalle(e.target.value)}
                      className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                      placeholder="ej: M, L, XL, 42, Único"
                    />
                    <datalist id="indumentaria-talles">
                      <option value="XS" />
                      <option value="S" />
                      <option value="M" />
                      <option value="L" />
                      <option value="XL" />
                      <option value="XXL" />
                      <option value="3XL" />
                      <option value="38" />
                      <option value="39" />
                      <option value="40" />
                      <option value="41" />
                      <option value="42" />
                      <option value="43" />
                      <option value="44" />
                      <option value="45" />
                      <option value="46" />
                      <option value="Único" />
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Género / Uso</label>
                    <select
                      value={itemGenero}
                      onChange={(e) => setItemGenero(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="Unisex">Unisex</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Femenino">Femenino</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Marca / Fabricante</label>
                  <input
                    type="text"
                    value={itemMarca}
                    onChange={(e) => setItemMarca(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    placeholder="ej: Ombú, Pampero, 3M, Bahco, Shell"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Unidad de Medida *</label>
                  <select
                    value={itemUnidad}
                    onChange={(e) => setItemUnidad(e.target.value as StockUnit)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="UNIDAD">UNIDADES (Prendas / Cascos / Piezas)</option>
                    <option value="PAR">PAR (Calzado / Guantes)</option>
                    <option value="JUEGO">JUEGO / SET</option>
                    <option value="KIT">KIT / EQUIPO COMPLETO</option>
                    <option value="CAJA">CAJA</option>
                    <option value="METRO">METROS</option>
                    <option value="LITROS">LITROS</option>
                    <option value="TAMBOR_205L">TAMBOR (205 L)</option>
                    <option value="BALDE_20KG">BALDE (20 KG)</option>
                    <option value="KG">KILOGRAMOS (KG)</option>
                    <option value="BIDON_20L">BIDÓN (20 L)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-emerald-400 mb-1">
                    {editingItem ? 'Stock Actual' : 'Stock Inicial'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={itemStockInicial}
                    onChange={(e) => setItemStockInicial(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-sm font-black text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Stock Mín. Alerta</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={itemStockMinimo}
                    onChange={(e) => setItemStockMinimo(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Costo Unit. ($)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={itemPrecioCosto}
                    onChange={(e) => setItemPrecioCosto(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Ubicación / Estantería / Máquina Asignada</label>
                <input
                  type="text"
                  value={itemUbicacion}
                  onChange={(e) => setItemUbicacion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="ej: Pañol Herramientas Estante B / Caja de Camión"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition"
                >
                  {editingItem ? 'Guardar Cambios' : 'Guardar en Depósito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Ingresar Stock / Tambor / Lote Nuevo */}
      {isIngresoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                Ingresar Stock / Lote al Depósito
              </h3>
              <button onClick={() => setIsIngresoModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveIngreso} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Artículo / Herramienta / Insumo *</label>
                <select
                  value={ingresoStockItemId}
                  onChange={(e) => {
                    setIngresoStockItemId(e.target.value);
                    const targetItem = stockItems.find(i => i.id === e.target.value);
                    const drumCount = (targetItem?.lotes || []).length + 1;
                    setIngresoNumeroLote(`Ingreso #${drumCount} - Lote L-${new Date().getFullYear()}-${Math.floor(10 + Math.random() * 90)}`);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-amber-500"
                >
                  {stockItems.map(item => (
                    <option key={item.id} value={item.id}>
                      [{item.codigo}] {item.nombre} ({item.depositoNombre || 'Depósito'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Identificador de Ingreso / Lote / Tambor *</label>
                <input
                  type="text"
                  required
                  value={ingresoNumeroLote}
                  onChange={(e) => setIngresoNumeroLote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                  placeholder="ej: Lote #1 / Compra Ferretería / Tambor #1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Cantidad a Ingresar *</label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={ingresoCapacidad}
                    onChange={(e) => setIngresoCapacidad(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Responsable Depósito</label>
                  <input
                    type="text"
                    value={ingresoResponsable}
                    onChange={(e) => setIngresoResponsable(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Comprobante / Remito Proveedor</label>
                <input
                  type="text"
                  value={ingresoComprobante}
                  onChange={(e) => setIngresoComprobante(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  placeholder="ej: Factura A-0004-9812 / Remito Proveedor"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  value={ingresoObs}
                  onChange={(e) => setIngresoObs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  placeholder="Detalles del ingreso..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsIngresoModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-900/30"
                >
                  Confirmar Ingreso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Registrar Entrega de Herramienta / Descarga de Insumo */}
      {isDespachoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <MinusCircle className="w-5 h-5 text-amber-400" />
                Registrar Entrega a Personal / Descarga de Depósito
              </h3>
              <button onClick={() => setIsDespachoModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDespacho} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Artículo / Herramienta / Insumo *</label>
                <select
                  value={despachoStockItemId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setDespachoStockItemId(id);
                    const item = stockItems.find(i => i.id === id);
                    const activeBatches = (item?.lotes || []).filter(b => b.estado !== 'AGOTADO');
                    const targetBatch = activeBatches.find(b => b.estado === 'EN_USO') || activeBatches[0];
                    setDespachoBatchId(targetBatch ? targetBatch.id : 'DIRECT_STOCK');
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-amber-500"
                >
                  {stockItems.map(item => (
                    <option key={item.id} value={item.id}>
                      [{item.codigo}] {item.nombre} (Disponible: {item.stockActual} {item.unidad})
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const item = stockItems.find(i => i.id === despachoStockItemId);
                const lotes = item?.lotes || [];
                if (lotes.length === 0) return null;
                return (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Lote / Tambor de Origen</label>
                    <select
                      value={despachoBatchId}
                      onChange={(e) => setDespachoBatchId(e.target.value)}
                      className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2.5 text-sm text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                    >
                      {lotes.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.numeroLote} — Restante: {b.contenidoActual} {b.unidad}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Cantidad a Entregar / Descargar *</label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  required
                  value={despachoCantidad}
                  onChange={(e) => setDespachoCantidad(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-lg font-black text-amber-400 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Operario / Empleado que recibe</label>
                  <select
                    value={despachoEmployeeLegajo}
                    onChange={(e) => setDespachoEmployeeLegajo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Sin vincular a empleado</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.legajo || e.id}>
                        {e.nombreApellido} (Leg: {e.legajo || 'S/D'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Máquina / Vehículo Destino</label>
                  <select
                    value={despachoEquipmentId}
                    onChange={(e) => setDespachoEquipmentId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Sin vincular a equipo</option>
                    {fleet.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.modeloMarca} ({v.patente || v.codigoInterno || v.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Motivo / Concepto</label>
                <input
                  type="text"
                  value={despachoMotivo}
                  onChange={(e) => setDespachoMotivo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  placeholder="ej: Entrega de pinza y llaves a chofer / Cambio de aceite"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Observaciones / Leyenda</label>
                <textarea
                  rows={2}
                  value={despachoLeyendaObs}
                  onChange={(e) => setDespachoLeyendaObs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  placeholder="Anote detalles de la entrega o descarga..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDespachoModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition shadow-lg shadow-amber-900/30"
                >
                  Confirmar Entrega / Descarga
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Editar Producto General (Padre -> actualiza todos los talles hijos) */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#F0C800]" />
                Editar Producto General ({editingGroup.itemIds.length} {editingGroup.itemIds.length === 1 ? 'talle' : 'talles'})
              </h3>
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGroupEdit} className="p-6 space-y-4">
              <div className="bg-[#F0C800]/10 border border-[#F0C800]/30 rounded-xl px-3.5 py-2.5 text-xs text-amber-200 leading-relaxed">
                Los cambios que guardes aquí se actualizarán automáticamente en <strong>todos los talles hijos</strong> ({editingGroup.sizeLabels.join(', ')}). Para editar un talle puntual (código, talle o stock), usá el botón <strong>Editar</strong> dentro del desplegable.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nombre General de la Prenda / Producto *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={groupNombre}
                  onChange={(e) => setGroupNombre(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-semibold focus:outline-none focus:border-[#F0C800]"
                  placeholder="ej: Camisa Tubomundo"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Categoría</label>
                  <select
                    value={groupCategoria}
                    onChange={(e) => setGroupCategoria(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                  >
                    {stockCategories.map(cat => (
                      <option key={cat.id} value={cat.nombre}>
                        {cat.icono || '🦺'} {cat.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Marca / Fabricante</label>
                  <input
                    type="text"
                    value={groupMarca}
                    onChange={(e) => setGroupMarca(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                    placeholder="ej: Ombú, Pampero, 3M"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Ubicación / Estantería</label>
                <input
                  type="text"
                  value={groupUbicacion}
                  onChange={(e) => setGroupUbicacion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                  placeholder="ej: Depósito Ropa - Estantería Principal"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Costo Unit. ($) <span className="text-[10px] text-slate-500 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={groupCostoUnitario}
                    onChange={(e) => setGroupCostoUnitario(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                    placeholder="Mantener valor de cada talle"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Stock Mín. Alerta <span className="text-[10px] text-slate-500 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={groupStockMinimo}
                    onChange={(e) => setGroupStockMinimo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                    placeholder="Mantener valor de cada talle"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingGroup(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-black bg-[#F0C800] hover:bg-[#F6D84C] text-slate-950 transition shadow-lg shadow-[#F0C800]/15 cursor-pointer"
                >
                  Guardar en Todos los Talles ({editingGroup.itemIds.length})
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <IndumentariaDeliveryModal
        isOpen={isClothingDeliveryModalOpen}
        onClose={() => {
          setIsClothingDeliveryModalOpen(false);
          setClothingDeliveryDefaultItem(null);
        }}
        items={indumentariaItems}
        employees={employees}
        defaultItem={clothingDeliveryDefaultItem}
        defaultResponsable={activeWarehouse?.responsable || 'Encargado de Depósito'}
        onConfirmDelivery={handleConfirmClothingDelivery}
      />

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        itemName={deleteTarget?.name || ''}
        onConfirm={handleExecuteConfirmedDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
