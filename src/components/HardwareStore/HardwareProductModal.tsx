import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Plus,
  Check,
  Image as ImageIcon,
  Upload,
  Trash2,
  Wrench,
  Settings,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react';
import { HardwareProduct, Proveedor, SalonVentasConfig } from '../../types';
import {
  calculatePricesFromCost,
  deriveLegacyCategory,
  generateNextBaseProductCode,
  padCode,
} from '../../services/salonConfig';
import { optimizeImage } from '../../services/imageOptimizer';
import { uploadPreoptimizedImageToCloudflareR2 } from '../../services/api';

interface HardwareProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveProducts: (products: HardwareProduct[]) => Promise<void> | void;
  initialProduct?: HardwareProduct | null;
  existingProducts: HardwareProduct[];
  config: SalonVentasConfig;
  proveedores?: Proveedor[];
  onQuickAddBrand: (brandName: string) => Promise<void>;
  onOpenConfigTab?: (tab: 'familias' | 'unidades' | 'sectores' | 'marcas' | 'listas') => void;
}

interface VariantDraftRow {
  key: string;
  selected: boolean;
  label: string;
  entries: Array<{
    unidadId: string;
    unidadNombre: string;
    valorId: string;
    valorNombre: string;
  }>;
  stockInicial: number;
  costoUnitario: number;
  codigoDeBarras: string;
}

export const HardwareProductModal: React.FC<HardwareProductModalProps> = ({
  isOpen,
  onClose,
  onSaveProducts,
  initialProduct,
  existingProducts,
  config,
  proveedores = [],
  onQuickAddBrand,
  onOpenConfigTab,
}) => {
  const isEditMode = Boolean(initialProduct);

  // --- Familia & Grupo (reemplaza Categoría General) ---
  const [familiaId, setFamiliaId] = useState<string>('');
  const [grupoId, setGrupoId] = useState<string>('');

  // --- Códigos ---
  const [codigoBase, setCodigoBase] = useState<string>('');
  const [codigoManualOverride, setCodigoManualOverride] = useState<boolean>(false);
  const [codigoInterno, setCodigoInterno] = useState<string>('');
  const [codigoDeBarras, setCodigoDeBarras] = useState<string>('');
  const [codigoProveedor, setCodigoProveedor] = useState<string>('');

  // --- Descripción & Descripción Adicional ---
  const [descripcionPrincipal, setDescripcionPrincipal] = useState<string>('');
  const [descripcionAdicional, setDescripcionAdicional] = useState<string>('');

  // --- Marca + alta rápida inline ---
  const [marca, setMarca] = useState<string>('');
  const [showAddBrand, setShowAddBrand] = useState<boolean>(false);
  const [newBrandInput, setNewBrandInput] = useState<string>('');
  const [savingBrand, setSavingBrand] = useState<boolean>(false);

  // --- Múltiples Proveedores ---
  const [selectedProveedores, setSelectedProveedores] = useState<string[]>([]);
  const [proveedorSelectValue, setProveedorSelectValue] = useState<string>('');
  const [customProveedorInput, setCustomProveedorInput] = useState<string>('');

  // --- Sector & Subsector (desde Configuración) ---
  const [sectorId, setSectorId] = useState<string>('');
  const [subsectorId, setSubsectorId] = useState<string>('');

  // --- Stock & Único Precio (Costo Unitario / Precio Base) ---
  const [stockInicial, setStockInicial] = useState<number>(0);
  const [stockMinimo, setStockMinimo] = useState<number>(3);
  const [costoUnitario, setCostoUnitario] = useState<number>(0);

  // --- Imagen Optimizada ---
  const [foto, setFoto] = useState<string>('');
  const [fotoMeta, setFotoMeta] = useState<HardwareProduct['fotoMeta']>(undefined);
  const [isOptimizingImage, setIsOptimizingImage] = useState<boolean>(false);
  const [imageError, setImageError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Publicar Web ---
  const [publicarEnWeb, setPublicarEnWeb] = useState<boolean>(true);

  // --- Unidades de Medida & Generador de Variantes (modo alta) ---
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [selectedValuesByUnit, setSelectedValuesByUnit] = useState<Record<string, string[]>>({});
  const [variantOverrides, setVariantOverrides] = useState<
    Record<string, { selected?: boolean; stockInicial?: number; costoUnitario?: number; codigoDeBarras?: string }>
  >({});

  // --- Validation & Submit ---
  const [formError, setFormError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const selectedFamilia = useMemo(
    () => config.familias.find(f => f.id === familiaId) || config.familias[0] || null,
    [config.familias, familiaId]
  );

  const availableGrupos = useMemo(() => selectedFamilia?.grupos || [], [selectedFamilia]);

  const selectedGrupo = useMemo(
    () => availableGrupos.find(g => g.id === grupoId) || availableGrupos[0] || null,
    [availableGrupos, grupoId]
  );

  const selectedSector = useMemo(
    () => config.sectores.find(s => s.id === sectorId) || null,
    [config.sectores, sectorId]
  );

  const availableSubsectores = useMemo(() => selectedSector?.subsectores || [], [selectedSector]);

  // Initialize form on open
  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    setImageError('');
    setShowAddBrand(false);
    setNewBrandInput('');
    setProveedorSelectValue('');
    setCustomProveedorInput('');
    setSelectedUnitIds([]);
    setSelectedValuesByUnit({});
    setVariantOverrides({});

    if (initialProduct) {
      const matchedFam =
        config.familias.find(
          f => f.id === initialProduct.familiaId || f.codigo === initialProduct.familiaCodigo
        ) || config.familias[0];
      const matchedGrp =
        matchedFam?.grupos.find(
          g => g.id === initialProduct.grupoId || g.codigo === initialProduct.grupoCodigo
        ) || matchedFam?.grupos[0];

      setFamiliaId(matchedFam?.id || '');
      setGrupoId(matchedGrp?.id || '');
      setCodigoBase(initialProduct.codigo || '');
      setCodigoManualOverride(true);
      setCodigoInterno(initialProduct.codigoInterno || '');
      setCodigoDeBarras(initialProduct.codigoDeBarras || '');
      setCodigoProveedor(initialProduct.codigoProveedor || '');
      setDescripcionPrincipal(initialProduct.nombre || '');
      setDescripcionAdicional(initialProduct.descripcionAdicional || initialProduct.descripcion || '');
      setMarca(initialProduct.marca || '');
      setSelectedProveedores(initialProduct.proveedoresNombres || []);

      const matchedSec = config.sectores.find(
        s => s.id === initialProduct.sectorId || s.nombre === initialProduct.sector
      );
      const matchedSub = matchedSec?.subsectores.find(
        sub => sub.id === initialProduct.subsectorId || sub.nombre === initialProduct.subsector
      );
      setSectorId(matchedSec?.id || '');
      setSubsectorId(matchedSub?.id || '');

      setStockInicial(initialProduct.stockActual ?? 0);
      setStockMinimo(initialProduct.stockMinimoAlerta ?? 3);
      setCostoUnitario(initialProduct.precioCosto ?? initialProduct.precioVenta ?? 0);
      setFoto(initialProduct.foto || '');
      setFotoMeta(initialProduct.fotoMeta);
      setPublicarEnWeb(initialProduct.publicarEnWeb !== false);
    } else {
      const firstFam = config.familias[0];
      const firstGrp = firstFam?.grupos[0];
      setFamiliaId(firstFam?.id || '');
      setGrupoId(firstGrp?.id || '');
      setCodigoManualOverride(false);
      setCodigoInterno('');
      setCodigoDeBarras('');
      setCodigoProveedor('');
      setDescripcionPrincipal('');
      setDescripcionAdicional('');
      setMarca('');
      setSelectedProveedores([]);
      setSectorId(config.sectores[0]?.id || '');
      setSubsectorId(config.sectores[0]?.subsectores[0]?.id || '');
      setStockInicial(0);
      setStockMinimo(3);
      setCostoUnitario(0);
      setFoto('');
      setFotoMeta(undefined);
      setPublicarEnWeb(true);
    }
  }, [isOpen, initialProduct, config.familias, config.sectores]);

  // Keep grupoId synced when familia changes
  useEffect(() => {
    if (!selectedFamilia) return;
    const stillValid = selectedFamilia.grupos.some(g => g.id === grupoId);
    if (!stillValid) {
      setGrupoId(selectedFamilia.grupos[0]?.id || '');
    }
  }, [selectedFamilia, grupoId]);

  // Keep subsectorId synced when sector changes
  useEffect(() => {
    if (!selectedSector) {
      setSubsectorId('');
      return;
    }
    const stillValid = selectedSector.subsectores.some(sub => sub.id === subsectorId);
    if (!stillValid) {
      setSubsectorId(selectedSector.subsectores[0]?.id || '');
    }
  }, [selectedSector, subsectorId]);

  // Auto-generate 11-digit base code (3 Familia + 3 Grupo + 5 Product correlative) in create mode
  useEffect(() => {
    if (!isOpen || isEditMode || codigoManualOverride) return;
    if (!selectedFamilia || !selectedGrupo) return;
    const nextCode = generateNextBaseProductCode(
      selectedFamilia.codigo,
      selectedGrupo.codigo,
      existingProducts
    );
    setCodigoBase(nextCode);
  }, [isOpen, isEditMode, codigoManualOverride, selectedFamilia, selectedGrupo, existingProducts]);

  // Cartesian product generator for selected Units of Measure
  const generatedVariants: VariantDraftRow[] = useMemo(() => {
    if (isEditMode || selectedUnitIds.length === 0) return [];

    const activeUnitDimensions = selectedUnitIds
      .map(uid => {
        const um = config.unidadesMedida.find(u => u.id === uid);
        if (!um) return null;
        const chosenIds = selectedValuesByUnit[uid] || [];
        const chosenVals = um.valores.filter(v => chosenIds.includes(v.id));
        if (chosenVals.length === 0) return null;
        return { um, values: chosenVals };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    if (activeUnitDimensions.length === 0) return [];

    // Cartesian product across dimensions
    type Combo = Array<{ unidadId: string; unidadNombre: string; valorId: string; valorNombre: string }>;
    let combos: Combo[] = [[]];
    for (const dim of activeUnitDimensions) {
      const next: Combo[] = [];
      for (const acc of combos) {
        for (const val of dim.values) {
          next.push([
            ...acc,
            {
              unidadId: dim.um.id,
              unidadNombre: dim.um.nombre,
              valorId: val.id,
              valorNombre: val.nombre,
            },
          ]);
        }
      }
      combos = next;
    }

    return combos.map(entries => {
      const key = entries.map(e => `${e.unidadId}:${e.valorId}`).join('|');
      const label = entries.map(e => e.valorNombre).join(' · ');
      const ov = variantOverrides[key];
      return {
        key,
        selected: ov?.selected !== undefined ? ov.selected : true,
        label,
        entries,
        stockInicial: ov?.stockInicial !== undefined ? ov.stockInicial : stockInicial,
        costoUnitario: ov?.costoUnitario !== undefined ? ov.costoUnitario : costoUnitario,
        codigoDeBarras: ov?.codigoDeBarras ?? '',
      };
    });
  }, [isEditMode, selectedUnitIds, selectedValuesByUnit, config.unidadesMedida, variantOverrides, stockInicial, costoUnitario]);

  // Assign sequential -01, -02... codes ONLY to checked variants
  const variantCodeMap = useMemo(() => {
    const map: Record<string, string> = {};
    let seq = 1;
    generatedVariants.forEach(row => {
      if (row.selected) {
        map[row.key] = padCode(seq, 2);
        seq += 1;
      }
    });
    return map;
  }, [generatedVariants]);

  const selectedVariantsCount = useMemo(
    () => generatedVariants.filter(r => r.selected).length,
    [generatedVariants]
  );

  // Reference preview of default price list
  const defaultListPreview = useMemo(() => {
    const active = config.listasPrecios.filter(l => l.activa !== false);
    const def = active.find(l => l.esPredeterminada) || active[0];
    if (!def) return null;
    const calc = calculatePricesFromCost(costoUnitario, config.listasPrecios);
    return {
      nombre: def.nombre,
      margen: def.margenPorcentaje,
      precio: calc.precioVenta,
    };
  }, [costoUnitario, config.listasPrecios]);

  // ==================== HANDLERS ====================

  const handleToggleUnit = (unitId: string) => {
    if (selectedUnitIds.includes(unitId)) {
      setSelectedUnitIds(prev => prev.filter(id => id !== unitId));
    } else {
      setSelectedUnitIds(prev => [...prev, unitId]);
      // Pre-select all values inside this unit so the combinations appear immediately
      const um = config.unidadesMedida.find(u => u.id === unitId);
      if (um && (!selectedValuesByUnit[unitId] || selectedValuesByUnit[unitId].length === 0)) {
        setSelectedValuesByUnit(prev => ({
          ...prev,
          [unitId]: um.valores.map(v => v.id),
        }));
      }
    }
  };

  const handleToggleUnitValue = (unitId: string, valId: string) => {
    setSelectedValuesByUnit(prev => {
      const current = prev[unitId] || [];
      const exists = current.includes(valId);
      return {
        ...prev,
        [unitId]: exists ? current.filter(id => id !== valId) : [...current, valId],
      };
    });
  };

  const handleSelectAllValuesInUnit = (unitId: string, selectAll: boolean) => {
    const um = config.unidadesMedida.find(u => u.id === unitId);
    if (!um) return;
    setSelectedValuesByUnit(prev => ({
      ...prev,
      [unitId]: selectAll ? um.valores.map(v => v.id) : [],
    }));
  };

  const handleToggleAllVariants = (selectAll: boolean) => {
    setVariantOverrides(prev => {
      const next = { ...prev };
      generatedVariants.forEach(row => {
        next[row.key] = { ...(next[row.key] || {}), selected: selectAll };
      });
      return next;
    });
  };

  const handleQuickCreateBrand = async () => {
    const trimmed = newBrandInput.trim();
    if (!trimmed) return;
    setSavingBrand(true);
    try {
      await onQuickAddBrand(trimmed);
      setMarca(trimmed);
      setNewBrandInput('');
      setShowAddBrand(false);
    } finally {
      setSavingBrand(false);
    }
  };

  const handleAddProveedorFromSelect = (provName: string) => {
    const trimmed = provName.trim();
    if (!trimmed) return;
    if (!selectedProveedores.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedProveedores(prev => [...prev, trimmed]);
    }
    setProveedorSelectValue('');
  };

  const handleAddCustomProveedor = () => {
    const trimmed = customProveedorInput.trim();
    if (!trimmed) return;
    if (!selectedProveedores.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedProveedores(prev => [...prev, trimmed]);
    }
    setCustomProveedorInput('');
  };

  const handleProcessImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setImageError('Seleccioná un archivo de imagen válido (JPG, PNG, WebP).');
      return;
    }
    setImageError('');
    setIsOptimizingImage(true);
    try {
      const optimized = await optimizeImage(file, {
        fileName: file.name,
        maxWidth: 1000,
        maxHeight: 1000,
        quality: 0.78,
        format: 'image/webp',
      });

      // Try uploading pre-optimized WebP to Cloudflare R2; fallback gracefully to optimized WebP DataURL
      const r2Res = await uploadPreoptimizedImageToCloudflareR2(
        optimized.base64,
        optimized.fileName,
        optimized.contentType,
        'ferreteria'
      );

      setFoto(r2Res.success && r2Res.url ? r2Res.url : optimized.base64);
      setFotoMeta({
        originalSizeKB: optimized.originalSizeKB,
        optimizedSizeKB: optimized.optimizedSizeKB,
        reductionPercentage: optimized.reductionPercentage,
      });
    } catch (err: any) {
      setImageError(err?.message || 'No se pudo optimizar la imagen.');
    } finally {
      setIsOptimizingImage(false);
    }
  };

  const handlePasteImage = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const blob = items[i].getAsFile();
        if (blob) {
          e.preventDefault();
          handleProcessImageFile(blob);
          break;
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!descripcionPrincipal.trim()) {
      setFormError('Ingresá la Descripción del artículo.');
      return;
    }
    if (!selectedFamilia || !selectedGrupo) {
      setFormError('Seleccioná una Familia y un Grupo válidos (podés crearlos en Configuración).');
      return;
    }

    const secObj = config.sectores.find(s => s.id === sectorId);
    const subObj = secObj?.subsectores.find(sub => sub.id === subsectorId);
    const derivedCat = deriveLegacyCategory(selectedFamilia.nombre);
    const provIds = selectedProveedores
      .map(name => proveedores.find(p => p.razonSocial.toLowerCase() === name.toLowerCase())?.id)
      .filter((id): id is string => Boolean(id));

    setIsSubmitting(true);
    try {
      // Edit mode OR simple product (no variants generated)
      if (isEditMode || generatedVariants.length === 0) {
        const calc = calculatePricesFromCost(costoUnitario, config.listasPrecios);
        const prod: HardwareProduct = {
          id: initialProduct ? initialProduct.id : `FERR-${Date.now()}`,
          codigo: codigoBase.trim() || `${selectedFamilia.codigo}${selectedGrupo.codigo}00001`,
          codigoBase: (codigoBase.trim() || '').split('-')[0],
          codigoVariable: initialProduct?.codigoVariable,
          sku: codigoBase.trim(),
          codigoInterno: codigoInterno.trim() || undefined,
          codigoDeBarras: codigoDeBarras.trim() || undefined,
          codigoProveedor: codigoProveedor.trim() || undefined,
          familiaId: selectedFamilia.id,
          familiaCodigo: selectedFamilia.codigo,
          familiaNombre: selectedFamilia.nombre,
          grupoId: selectedGrupo.id,
          grupoCodigo: selectedGrupo.codigo,
          grupoNombre: selectedGrupo.nombre,
          sectorId: secObj?.id,
          sector: secObj?.nombre,
          subsectorId: subObj?.id,
          subsector: subObj?.nombre,
          marca: marca.trim() || undefined,
          proveedoresIds: provIds.length > 0 ? provIds : undefined,
          proveedoresNombres: selectedProveedores.length > 0 ? selectedProveedores : undefined,
          nombre: descripcionPrincipal.trim(),
          descripcion: descripcionAdicional.trim(),
          descripcionAdicional: descripcionAdicional.trim(),
          categoria: derivedCat,
          precioCosto: Number(costoUnitario) || 0,
          precioVenta: calc.precioVenta,
          preciosPorLista: calc.preciosPorLista,
          listasDePrecios: calc.listasDePrecios,
          stockActual: Number(stockInicial) || 0,
          stockMinimoAlerta: Number(stockMinimo) || 0,
          unidadMedida: initialProduct?.unidadMedida || 'UNIDAD',
          varianteDetalle: initialProduct?.varianteDetalle,
          unidadesSeleccionadas: initialProduct?.unidadesSeleccionadas,
          foto: foto || '',
          fotoMeta,
          publicarEnWeb,
          destacado: initialProduct?.destacado || false,
        };
        await onSaveProducts([prod]);
        onClose();
        return;
      }

      // Multi-variant creation mode
      const checkedRows = generatedVariants.filter(r => r.selected);
      if (checkedRows.length === 0) {
        setFormError('Tildá al menos una variante para crear o desmarcá las unidades de medida para crear un artículo simple.');
        return;
      }

      const baseClean = codigoBase.trim().split('-')[0] || `${selectedFamilia.codigo}${selectedGrupo.codigo}00001`;
      const now = Date.now();

      const batchToCreate: HardwareProduct[] = checkedRows.map((row, idx) => {
        const suffix = variantCodeMap[row.key] || padCode(idx + 1, 2);
        const fullCode = `${baseClean}-${suffix}`;
        const rowCost = Number(row.costoUnitario) || 0;
        const calc = calculatePricesFromCost(rowCost, config.listasPrecios);

        return {
          id: `FERR-${now}-${idx + 1}`,
          codigo: fullCode,
          codigoBase: baseClean,
          codigoVariable: suffix,
          sku: fullCode,
          codigoInterno: codigoInterno.trim() ? `${codigoInterno.trim()}-${suffix}` : undefined,
          codigoDeBarras: row.codigoDeBarras.trim() || undefined,
          codigoProveedor: codigoProveedor.trim() || undefined,
          familiaId: selectedFamilia.id,
          familiaCodigo: selectedFamilia.codigo,
          familiaNombre: selectedFamilia.nombre,
          grupoId: selectedGrupo.id,
          grupoCodigo: selectedGrupo.codigo,
          grupoNombre: selectedGrupo.nombre,
          sectorId: secObj?.id,
          sector: secObj?.nombre,
          subsectorId: subObj?.id,
          subsector: subObj?.nombre,
          marca: marca.trim() || undefined,
          proveedoresIds: provIds.length > 0 ? provIds : undefined,
          proveedoresNombres: selectedProveedores.length > 0 ? selectedProveedores : undefined,
          nombre: `${descripcionPrincipal.trim()} — ${row.label}`,
          descripcion: descripcionAdicional.trim(),
          descripcionAdicional: descripcionAdicional.trim(),
          categoria: derivedCat,
          precioCosto: rowCost,
          precioVenta: calc.precioVenta,
          preciosPorLista: calc.preciosPorLista,
          listasDePrecios: calc.listasDePrecios,
          stockActual: Number(row.stockInicial) || 0,
          stockMinimoAlerta: Number(stockMinimo) || 0,
          unidadMedida: row.entries[0]?.valorNombre || 'UNIDAD',
          unidadesMedidaMultiples: row.entries.map(e => `${e.unidadNombre}: ${e.valorNombre}`),
          varianteDetalle: row.label,
          unidadesSeleccionadas: row.entries,
          foto: foto || '',
          fotoMeta,
          publicarEnWeb,
          destacado: false,
        };
      });

      await onSaveProducts(batchToCreate);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const brandOptions = Array.from(
    new Set([...config.marcas, ...(marca ? [marca] : [])])
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto"
      onPaste={handlePasteImage}
    >
      <div className="relative w-full max-w-4xl my-6 bg-[#16191F] rounded-2xl shadow-2xl border border-[#2D2D2D] overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 bg-[#111318] border-b border-[#2D2D2D] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#F0C800] text-[#16191F] flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {isEditMode ? 'Editar Artículo de Ferretería' : 'Nuevo Artículo — Salón de Ventas & Ferretería'}
              </h3>
              <p className="text-xs text-slate-400">
                Código por Familia y Grupo · Costo unitario único · Imagen optimizada WebP
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#232730] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[82vh] overflow-y-auto text-xs">
          {formError && (
            <div className="px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 font-medium">
              {formError}
            </div>
          )}

          {/* SECCIÓN 1: FAMILIA, GRUPO Y CÓDIGOS */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300">1. Clasificación y Códigos</h4>
              {onOpenConfigTab && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenConfigTab('familias');
                  }}
                  className="text-[11px] text-[#F0C800] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Settings className="w-3 h-3" />
                  <span>Configurar Familias y Grupos</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Familia *
                </label>
                <select
                  value={familiaId}
                  onChange={e => {
                    setFamiliaId(e.target.value);
                    setCodigoManualOverride(false);
                  }}
                  className="w-full px-3 py-2.5 bg-[#1F2228] border border-slate-700 rounded-lg text-white font-medium focus:outline-none focus:border-[#F0C800]"
                  required
                >
                  {config.familias.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.codigo} — {f.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Grupo *
                </label>
                <select
                  value={grupoId}
                  onChange={e => {
                    setGrupoId(e.target.value);
                    setCodigoManualOverride(false);
                  }}
                  className="w-full px-3 py-2.5 bg-[#1F2228] border border-slate-700 rounded-lg text-white font-medium focus:outline-none focus:border-[#F0C800]"
                  required
                >
                  {availableGrupos.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.codigo} — {g.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Código Automático (3+3+5)
                </label>
                <input
                  type="text"
                  value={codigoBase}
                  onChange={e => {
                    setCodigoManualOverride(true);
                    setCodigoBase(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-[#111318] border border-slate-700 rounded-lg font-mono font-bold text-[#F0C800] tabular-nums focus:outline-none focus:border-[#F0C800]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Código Interno
                </label>
                <input
                  type="text"
                  value={codigoInterno}
                  onChange={e => setCodigoInterno(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg font-mono text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Código de Barras
                </label>
                <input
                  type="text"
                  value={codigoDeBarras}
                  onChange={e => setCodigoDeBarras(e.target.value)}
                  placeholder="EAN / Escáner"
                  className="w-full px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg font-mono text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Código de Proveedor
                </label>
                <input
                  type="text"
                  value={codigoProveedor}
                  onChange={e => setCodigoProveedor(e.target.value)}
                  placeholder="Ref. proveedor"
                  className="w-full px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg font-mono text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                />
              </div>
            </div>
          </div>

          <hr className="border-[#2D2D2D]" />

          {/* SECCIÓN 2: DESCRIPCIÓN, MARCA (+), PROVEEDORES, SECTOR/SUBSECTOR E IMAGEN */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Descripción *
                </label>
                <input
                  type="text"
                  value={descripcionPrincipal}
                  onChange={e => setDescripcionPrincipal(e.target.value)}
                  placeholder="ej: Amoladora Angular 115mm 850W / Llave Combinada / Disco de Corte Metal"
                  className="w-full px-3 py-2.5 bg-[#1F2228] border border-slate-700 rounded-lg text-sm font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Descripción Adicional
                </label>
                <textarea
                  rows={2}
                  value={descripcionAdicional}
                  onChange={e => setDescripcionAdicional(e.target.value)}
                  placeholder="Detalles técnicos, materiales, aplicaciones, equivalencias..."
                  className="w-full px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              {/* Marca con botón + al lado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Marca
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={marca}
                      onChange={e => setMarca(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-[#F0C800]"
                    >
                      <option value="">Sin marca / Genérica</option>
                      {brandOptions.map(m => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowAddBrand(prev => !prev)}
                      className="h-[34px] w-[34px] shrink-0 bg-[#F0C800] hover:bg-[#F6D84C] text-[#16191F] rounded-lg flex items-center justify-center font-bold transition-colors cursor-pointer"
                      title="Crear nueva marca aquí"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>

                  {showAddBrand && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newBrandInput}
                        onChange={e => setNewBrandInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleQuickCreateBrand();
                          }
                        }}
                        placeholder="Nombre de la nueva marca..."
                        className="flex-1 px-2.5 py-1.5 bg-[#111318] border border-[#F0C800]/60 rounded-lg text-white placeholder-slate-500 focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={savingBrand || !newBrandInput.trim()}
                        onClick={handleQuickCreateBrand}
                        className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Crear</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Proveedores múltiples */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Proveedores (1 o más)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {proveedores.length > 0 ? (
                      <select
                        value={proveedorSelectValue}
                        onChange={e => handleAddProveedorFromSelect(e.target.value)}
                        className="flex-1 px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-[#F0C800]"
                      >
                        <option value="">+ Agregar proveedor del padrón...</option>
                        {proveedores.map(p => (
                          <option key={p.id} value={p.razonSocial}>
                            {p.razonSocial}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={customProveedorInput}
                        onChange={e => setCustomProveedorInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomProveedor();
                          }
                        }}
                        placeholder="Escribir proveedor y Enter..."
                        className="flex-1 px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                      />
                    )}
                    {proveedores.length === 0 && (
                      <button
                        type="button"
                        onClick={handleAddCustomProveedor}
                        className="h-[34px] px-2.5 bg-[#282C34] hover:bg-[#323741] text-white rounded-lg cursor-pointer"
                        title="Agregar proveedor"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {selectedProveedores.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-slate-300">
                      {selectedProveedores.map(prov => (
                        <span
                          key={prov}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#1F2228] border border-slate-700 rounded text-slate-200"
                        >
                          <span>{prov}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedProveedores(prev => prev.filter(p => p !== prov))}
                            className="text-slate-400 hover:text-rose-400 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sector & Subsector desde Configuración */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">Sector</label>
                    {onOpenConfigTab && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenConfigTab('sectores');
                        }}
                        className="text-[11px] text-slate-400 hover:text-[#F0C800] cursor-pointer"
                      >
                        Configurar
                      </button>
                    )}
                  </div>
                  <select
                    value={sectorId}
                    onChange={e => setSectorId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-[#F0C800]"
                  >
                    <option value="">Sin sector asignado</option>
                    {config.sectores.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Subsector
                  </label>
                  <select
                    value={subsectorId}
                    onChange={e => setSubsectorId(e.target.value)}
                    disabled={!selectedSector || availableSubsectores.length === 0}
                    className="w-full px-3 py-2 bg-[#1F2228] border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:outline-none focus:border-[#F0C800]"
                  >
                    <option value="">
                      {!selectedSector
                        ? 'Elegí un sector primero'
                        : availableSubsectores.length === 0
                        ? 'Sin subsectores en este sector'
                        : 'Seleccionar subsector...'}
                    </option>
                    {availableSubsectores.map(sub => (
                      <option key={sub.id} value={sub.id}>
                        {sub.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Columna Derecha: Imagen Optimizada */}
            <div className="lg:col-span-4 flex flex-col">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Imagen del Producto (Optimización WebP)
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleProcessImageFile(f);
                  e.target.value = '';
                }}
              />

              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleProcessImageFile(f);
                }}
                className="flex-1 min-h-[210px] rounded-xl border border-dashed border-slate-700 bg-[#111318] flex flex-col items-center justify-center p-3 text-center relative overflow-hidden"
              >
                {isOptimizingImage ? (
                  <div className="flex flex-col items-center gap-2 text-slate-300">
                    <Loader2 className="w-6 h-6 animate-spin text-[#F0C800]" />
                    <span className="text-xs font-medium">Optimizando imagen a WebP...</span>
                  </div>
                ) : foto ? (
                  <div className="w-full h-full flex flex-col items-center justify-between gap-2">
                    <img
                      src={foto}
                      alt={descripcionPrincipal || 'Producto de ferretería'}
                      referrerPolicy="no-referrer"
                      className="w-full h-36 object-contain rounded-lg bg-[#16191F]"
                    />
                    {fotoMeta?.optimizedSizeKB !== undefined && (
                      <div className="text-[11px] font-mono text-emerald-400 tabular-nums">
                        {fotoMeta.originalSizeKB} KB → {fotoMeta.optimizedSizeKB} KB (-{fotoMeta.reductionPercentage}%) WebP
                      </div>
                    )}
                    <div className="flex items-center gap-2 w-full">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 py-1.5 bg-[#1F2228] hover:bg-[#2A2E37] text-slate-200 font-semibold rounded-lg cursor-pointer"
                      >
                        Cambiar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFoto('');
                          setFotoMeta(undefined);
                        }}
                        className="p-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 rounded-lg cursor-pointer"
                        title="Quitar imagen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#1F2228] flex items-center justify-center text-[#F0C800]">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold text-slate-200">Subir o arrastrar imagen</span>
                    <span className="text-[11px] text-slate-500">También podés pegar con Ctrl+V</span>
                    <span className="text-[10px] text-slate-500">Se comprime automáticamente a WebP</span>
                  </button>
                )}
              </div>
              {imageError && <p className="text-[11px] text-rose-400 mt-1">{imageError}</p>}
            </div>
          </div>

          <hr className="border-[#2D2D2D]" />

          {/* SECCIÓN 3: STOCK & ÚNICO PRECIO (COSTO UNITARIO / PRECIO BASE) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Stock Inicial
              </label>
              <input
                type="number"
                min={0}
                value={stockInicial}
                onChange={e => setStockInicial(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-[#1F2228] border border-slate-700 rounded-lg font-mono font-bold text-white tabular-nums focus:outline-none focus:border-[#F0C800]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Stock Mínimo (Alerta)
              </label>
              <input
                type="number"
                min={0}
                value={stockMinimo}
                onChange={e => setStockMinimo(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-[#1F2228] border border-slate-700 rounded-lg font-mono font-bold text-white tabular-nums focus:outline-none focus:border-[#F0C800]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#F0C800] mb-1.5">
                Costo Unitario / Precio Base ($)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={costoUnitario}
                onChange={e => setCostoUnitario(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-[#1F2228] border border-[#F0C800]/50 rounded-lg font-mono font-bold text-white text-sm tabular-nums focus:outline-none focus:border-[#F0C800]"
              />
              {defaultListPreview && costoUnitario > 0 && (
                <p className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
                  {defaultListPreview.nombre} (+{defaultListPreview.margen}%):{' '}
                  <span className="text-emerald-400 font-bold">
                    ${defaultListPreview.precio.toLocaleString('es-AR')}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* SECCIÓN 4: UNIDADES DE MEDIDA Y GENERACIÓN DE PRODUCTOS VARIABLES (solo alta) */}
          {!isEditMode && (
            <>
              <hr className="border-[#2D2D2D]" />

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      Unidades de Medida y Variantes (Opcional)
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Si elegís 1 o más unidades de medida, se generan automáticamente las combinaciones con sufijo -01, -02... para que tildes cuáles crear y ajustes su costo.
                    </p>
                  </div>
                  {onOpenConfigTab && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenConfigTab('unidades');
                      }}
                      className="text-[11px] text-[#F0C800] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Settings className="w-3 h-3" />
                      <span>Configurar Unidades de Medida</span>
                    </button>
                  )}
                </div>

                {/* Selector de Unidades de Medida */}
                <div className="flex flex-wrap gap-2">
                  {config.unidadesMedida.map(um => {
                    const active = selectedUnitIds.includes(um.id);
                    return (
                      <button
                        key={um.id}
                        type="button"
                        onClick={() => handleToggleUnit(um.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#F0C800]/15 border-[#F0C800] text-[#F0C800]'
                            : 'bg-[#1F2228] border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {active ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        <span>{um.nombre}</span>
                        <span className="text-[10px] opacity-70 font-mono">({um.valores.length})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Valores dentro de cada unidad seleccionada */}
                {selectedUnitIds.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedUnitIds.map(uid => {
                      const um = config.unidadesMedida.find(u => u.id === uid);
                      if (!um) return null;
                      const chosen = selectedValuesByUnit[uid] || [];
                      return (
                        <div key={uid} className="p-3 bg-[#111318] rounded-xl border border-[#2D2D2D] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{um.nombre}</span>
                            <div className="flex items-center gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => handleSelectAllValuesInUnit(uid, true)}
                                className="text-[#F0C800] hover:underline cursor-pointer"
                              >
                                Todos
                              </button>
                              <span className="text-slate-600">·</span>
                              <button
                                type="button"
                                onClick={() => handleSelectAllValuesInUnit(uid, false)}
                                className="text-slate-400 hover:text-white cursor-pointer"
                              >
                                Ninguno
                              </button>
                            </div>
                          </div>
                          {um.valores.length === 0 ? (
                            <p className="text-[11px] text-slate-500">
                              Esta unidad no tiene valores cargados en Configuración.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {um.valores.map(v => {
                                const isValOn = chosen.includes(v.id);
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => handleToggleUnitValue(uid, v.id)}
                                    className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                                      isValOn
                                        ? 'bg-[#F0C800] text-[#16191F] border-[#F0C800] font-bold'
                                        : 'bg-[#1F2228] text-slate-300 border-slate-700 hover:border-slate-500'
                                    }`}
                                  >
                                    {v.nombre}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Tabla de Productos Variables generados */}
                {generatedVariants.length > 0 && (
                  <div className="rounded-xl border border-[#2D2D2D] overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#111318] border-b border-[#2D2D2D] flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">
                        Productos Variables a Crear ({selectedVariantsCount} de {generatedVariants.length} seleccionados)
                      </span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => handleToggleAllVariants(true)}
                          className="text-[#F0C800] hover:underline cursor-pointer"
                        >
                          Marcar todos
                        </button>
                        <span className="text-slate-600">·</span>
                        <button
                          type="button"
                          onClick={() => handleToggleAllVariants(false)}
                          className="text-slate-400 hover:text-white cursor-pointer"
                        >
                          Desmarcar todos
                        </button>
                      </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#1B1F27] text-slate-400 border-b border-[#2D2D2D]">
                            <th className="py-2 px-3 w-10 text-center">Crear</th>
                            <th className="py-2 px-3">Código Automático</th>
                            <th className="py-2 px-3">Variante / Medida</th>
                            <th className="py-2 px-3 w-24 text-right">Stock</th>
                            <th className="py-2 px-3 w-36 text-right">Costo Unit. ($)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2D2D2D]">
                          {generatedVariants.map(row => {
                            const suffix = variantCodeMap[row.key];
                            const fullCode = suffix ? `${codigoBase.split('-')[0]}-${suffix}` : '—';
                            return (
                              <tr
                                key={row.key}
                                className={row.selected ? 'bg-[#16191F]' : 'bg-[#111318]/60 opacity-50'}
                              >
                                <td className="py-2 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={row.selected}
                                    onChange={e =>
                                      setVariantOverrides(prev => ({
                                        ...prev,
                                        [row.key]: { ...(prev[row.key] || {}), selected: e.target.checked },
                                      }))
                                    }
                                    className="w-4 h-4 accent-[#F0C800] cursor-pointer"
                                  />
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-[#F0C800] tabular-nums">
                                  {fullCode}
                                </td>
                                <td className="py-2 px-3 font-medium text-white">
                                  {row.label}
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="number"
                                    min={0}
                                    disabled={!row.selected}
                                    value={row.stockInicial}
                                    onChange={e =>
                                      setVariantOverrides(prev => ({
                                        ...prev,
                                        [row.key]: { ...(prev[row.key] || {}), stockInicial: Number(e.target.value) },
                                      }))
                                    }
                                    className="w-full px-2 py-1 text-right font-mono tabular-nums bg-[#1F2228] border border-slate-700 rounded text-white focus:outline-none focus:border-[#F0C800]"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    disabled={!row.selected}
                                    value={row.costoUnitario}
                                    onChange={e =>
                                      setVariantOverrides(prev => ({
                                        ...prev,
                                        [row.key]: { ...(prev[row.key] || {}), costoUnitario: Number(e.target.value) },
                                      }))
                                    }
                                    className="w-full px-2 py-1 text-right font-mono tabular-nums bg-[#1F2228] border border-slate-700 rounded text-white focus:outline-none focus:border-[#F0C800]"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#2D2D2D]">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={publicarEnWeb}
                onChange={e => setPublicarEnWeb(e.target.checked)}
                className="w-4 h-4 accent-[#F0C800] cursor-pointer"
              />
              <span>Visible en catálogo web comercial</span>
            </label>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#1F2228] hover:bg-[#2A2E37] text-slate-300 font-semibold rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isOptimizingImage}
                className="px-5 py-2 bg-[#F0C800] hover:bg-[#F6D84C] disabled:opacity-50 text-[#16191F] font-bold rounded-lg transition-colors cursor-pointer"
              >
                {isSubmitting
                  ? 'Guardando...'
                  : isEditMode
                  ? 'Guardar Cambios'
                  : generatedVariants.length > 0
                  ? `Crear ${selectedVariantsCount} Artículo${selectedVariantsCount === 1 ? '' : 's'}`
                  : 'Guardar Artículo'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
