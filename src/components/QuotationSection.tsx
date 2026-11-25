import React, { useState, useMemo, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import {
  Quotation,
  QuotationItem,
  QuotationStatus,
  QuotationTemplateLayout,
  DEFAULT_QUOTATION_TEMPLATE_LAYOUT,
  Vehicle,
  HardwareProduct,
  AridoProduct,
  CommercialModuleScope
} from '../types';
import { resolveQuotationModule } from '../services/salonConfig';
import {
  loadQuotationTemplateLayout,
  saveQuotationTemplateLayout,
  syncQuotationTemplateLayoutFromCloud,
  exportQuotationsToCSV,
  formatCurrency
} from '../services/storage';
import {
  QuotationTemplateCalibratorModal,
  QUOTATION_TEMPLATE_IMAGE_LOCAL,
  QUOTATION_TEMPLATE_IMAGE_CDN
} from './QuotationTemplateCalibratorModal';
import {
  FileText,
  PlusCircle,
  Search,
  Download,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  Trash2,
  Eye,
  X,
  Printer,
  FileDown,
  Sliders,
  Edit3,
  Copy,
  Truck,
  ShoppingBag,
  Layers,
  Plus,
  MessageCircle
} from 'lucide-react';

export const splitObservacionesTwoLines = (rawText?: string, maxLine1Chars: number = 62): [string, string] => {
  if (!rawText) return ['', ''];
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return ['', ''];

  if (normalized.includes('\n')) {
    const parts = normalized.split('\n').map(s => s.trim()).filter(Boolean);
    const line1 = parts[0] || '';
    const line2 = parts.slice(1).join(' ');
    return [line1, line2];
  }

  if (normalized.length <= maxLine1Chars) {
    return [normalized, ''];
  }

  let splitIdx = normalized.lastIndexOf(' ', maxLine1Chars);
  if (splitIdx <= 10) {
    splitIdx = maxLine1Chars;
  }
  const line1 = normalized.slice(0, splitIdx).trim();
  const line2 = normalized.slice(splitIdx).trim();
  return [line1, line2];
};

const normalizeArgentineWhatsAppDigits = (rawPhone?: string): string | null => {
  let digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits || digits.length < 6) return null;

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0') && !digits.startsWith('00')) {
    digits = digits.slice(1);
  }

  if (digits.startsWith('549') && digits.length >= 12) {
    return digits;
  }
  if (digits.startsWith('54') && !digits.startsWith('549')) {
    let rest = digits.slice(2);
    if (rest.startsWith('0')) rest = rest.slice(1);
    if (rest.length === 12 && rest.slice(3, 5) === '15') {
      rest = rest.slice(0, 3) + rest.slice(5);
    }
    return `549${rest}`;
  }

  // Handle local numbers with '15' after 3-digit or 4-digit area code (e.g. 388154777881 -> 3884777881)
  if (digits.length === 12 && digits.slice(3, 5) === '15') {
    digits = digits.slice(0, 3) + digits.slice(5);
  } else if (digits.length === 12 && digits.slice(4, 6) === '15') {
    digits = digits.slice(0, 4) + digits.slice(6);
  }

  if (digits.length <= 10) {
    return `549${digits}`;
  }
  return digits.startsWith('54') ? digits : `549${digits}`;
};

interface QuotationSectionProps {
  quotations: Quotation[];
  onSaveQuotations: (quotations: Quotation[]) => void;
  onDeleteQuotation?: (id: string) => Promise<boolean> | void;
  fleet?: Vehicle[];
  hardwareProducts?: HardwareProduct[];
  aridos?: AridoProduct[];
  activeModuleScope?: CommercialModuleScope;
  onConvertToRental?: (quotation: Quotation) => void;
  onInvoiceInArca?: (quotation: Quotation) => void;
}

export const QuotationSection: React.FC<QuotationSectionProps> = ({
  quotations,
  onSaveQuotations,
  onDeleteQuotation,
  fleet = [],
  hardwareProducts = [],
  aridos = [],
  activeModuleScope = 'ALQUILERES',
  onConvertToRental,
  onInvoiceInArca
}) => {
  const [templateLayout, setTemplateLayout] = useState<QuotationTemplateLayout>(() =>
    loadQuotationTemplateLayout()
  );
  const [isCalibratorOpen, setIsCalibratorOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [moduleScopeFilter, setModuleScopeFilter] = useState<CommercialModuleScope | 'ALL'>(activeModuleScope);
  const [templateImgSrc, setTemplateImgSrc] = useState<string>(QUOTATION_TEMPLATE_IMAGE_LOCAL);

  // Sync default filter whenever user enters from Ventas vs Alquileres
  useEffect(() => {
    setModuleScopeFilter(activeModuleScope);
  }, [activeModuleScope]);

  // Sync layout and quotations directly from Supabase PostgreSQL on mount
  useEffect(() => {
    syncQuotationTemplateLayoutFromCloud().then(cloudLayout => {
      if (cloudLayout) {
        setTemplateLayout(cloudLayout);
      }
    });
    fetch('/api/quotations/next-number?puntoVenta=1')
      .then(r => r.json())
      .then(data => {
        if (data && Array.isArray(data.quotations)) {
          onSaveQuotations(data.quotations);
        }
      })
      .catch(() => {});
  }, []);

  // Create / Edit Modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);

  const [puntoVenta, setPuntoVenta] = useState<number>(1);
  const [numeroComprobante, setNumeroComprobante] = useState<number>(1);
  const [fechaEmision, setFechaEmision] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [validoHasta, setValidoHasta] = useState<string>(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );

  const [razonSocialReceptor, setRazonSocialReceptor] = useState<string>('');
  const [cuitReceptor, setCuitReceptor] = useState<string>('');
  const [domicilioReceptor, setDomicilioReceptor] = useState<string>('');
  const [zonaReceptor, setZonaReceptor] = useState<string>('CENTRO');
  const [localidadReceptor, setLocalidadReceptor] = useState<string>('SAN SALVADOR DE JUJUY');
  const [telefonoReceptor, setTelefonoReceptor] = useState<string>('');

  const [condicionVenta, setCondicionVenta] = useState<string>('CONTADO / TRANSFERENCIA');
  const [monedaExpresada, setMonedaExpresada] = useState<string>('PESOS ARGENTINOS');
  const [nombreVendedor, setNombreVendedor] = useState<string>('ADMINISTRACIÓN LA HORMIGA');
  const [observaciones, setObservaciones] = useState<string>('');
  const [estado, setEstado] = useState<QuotationStatus>('PENDIENTE');

  const [bonificacionGlobalMonto, setBonificacionGlobalMonto] = useState<number>(0);
  const [percepcionIibb, setPercepcionIibb] = useState<number>(0);
  const [isSearchingCuit, setIsSearchingCuit] = useState<boolean>(false);
  const [isSavingToDb, setIsSavingToDb] = useState<boolean>(false);
  const [isFetchingNextNumber, setIsFetchingNextNumber] = useState<boolean>(false);
  const [cuitLookupFeedback, setCuitLookupFeedback] = useState<{ type: 'success' | 'warning'; text: string } | null>(null);

  // Searchable Equipment Picker + Per-row Inline Autocomplete
  const [equipSearchQuery, setEquipSearchQuery] = useState<string>('');
  const [isEquipPickerOpen, setIsEquipPickerOpen] = useState<boolean>(false);
  const [activeSuggestRowIdx, setActiveSuggestRowIdx] = useState<number | null>(null);
  const [suggestSourceField, setSuggestSourceField] = useState<'desc' | 'cod' | null>(null);

  const [items, setItems] = useState<QuotationItem[]>([
    {
      codigo: '001',
      descripcion: 'SERVICIO DE ALQUILER DE MAQUINARIA VIAL',
      cantidad: 1,
      unidadMedida: 'DÍAS',
      precioUnitario: 250000,
      bonificacionPorcentaje: 0,
      importe: 250000,
      alicuotaIva: 21
    }
  ]);

  // Preview / PDF Modal state
  const [selectedQuotationForView, setSelectedQuotationForView] = useState<Quotation | null>(null);
  const [quotationToDelete, setQuotationToDelete] = useState<Quotation | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  const viewContainerRef = useRef<HTMLDivElement>(null);
  const [viewContainerWidth, setViewContainerWidth] = useState<number>(672);

  useEffect(() => {
    const updateWidth = () => {
      if (viewContainerRef.current) {
        setViewContainerWidth(viewContainerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [selectedQuotationForView]);

  const viewScale = viewContainerWidth / 1000;
  const getViewFs = (fs: number) => `${Math.max(6, (fs || 14) * viewScale)}px`;

  const formatDateDisplay = (val: string) => {
    if (!val) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return val.split('-').reverse().join('/');
    }
    return val;
  };

  const buildQuotationWhatsAppUrl = (q: Quotation): string | null => {
    const waDigits = normalizeArgentineWhatsAppDigits(q.telefonoReceptor);
    if (!waDigits) return null;
    const compNro = `${String(q.puntoVenta).padStart(4, '0')}-${String(q.numeroComprobante).padStart(8, '0')}`;
    const firstDesc = q.items?.[0]?.descripcion || 'Alquiler / Servicio';
    const extraCount = (q.items?.length || 0) > 1 ? ` (+${q.items.length - 1} ítems)` : '';
    const totalStr = formatCurrency(q.importeTotal, q.monedaExpresada);
    const validityLine = q.validoHasta ? `\n• Vigencia hasta: ${formatDateDisplay(q.validoHasta)}` : '';
    const text =
      `Hola ${q.razonSocialReceptor || ''}, te escribimos de *La Hormiga* por la Cotización Nº *${compNro}*:\n` +
      `• Detalle: ${firstDesc}${extraCount}\n` +
      `• Total: *${totalStr}*` +
      `${validityLine}\n` +
      `¿Te quedó alguna consulta o avanzamos?`;
    return `https://wa.me/${waDigits}?text=${encodeURIComponent(text)}`;
  };

  // Next sequential number helper (global across all quotations in DB)
  const getNextNumeroComprobante = () => {
    if (quotations.length === 0) return 1;
    return Math.max(...quotations.map(q => Number(q.numeroComprobante) || 0)) + 1;
  };

  // Open Modal for New Quotation (100% Automatic Numbering from Supabase DB)
  const handleOpenCreateModal = async () => {
    const fallbackNextNum = getNextNumeroComprobante();
    const defaultPto = quotations.length > 0 ? Number(quotations[0].puntoVenta || 1) : 1;
    setEditingQuotationId(null);
    setPuntoVenta(defaultPto);
    setNumeroComprobante(fallbackNextNum);
    setFechaEmision(new Date().toISOString().slice(0, 10));
    setValidoHasta(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    setRazonSocialReceptor('');
    setCuitReceptor('');
    setDomicilioReceptor('');
    setZonaReceptor('');
    setLocalidadReceptor('SAN SALVADOR DE JUJUY');
    setTelefonoReceptor('');
    setCondicionVenta('CONTADO / TRANSFERENCIA');
    setMonedaExpresada('PESOS ARGENTINOS');
    setNombreVendedor('ADMINISTRACIÓN LA HORMIGA');
    setObservaciones('');
    setBonificacionGlobalMonto(0);
    setPercepcionIibb(0);
    setEstado('PENDIENTE');
    setCuitLookupFeedback(null);
    setEquipSearchQuery('');
    setIsEquipPickerOpen(false);
    setActiveSuggestRowIdx(null);
    setSuggestSourceField(null);
    const isVentasOrigin = activeModuleScope === 'VENTAS_SALON';
    setItems([
      {
        codigo: '001',
        descripcion: isVentasOrigin
          ? 'ARTÍCULO DE FERRETERÍA / SALÓN DE VENTAS'
          : 'SERVICIO DE ALQUILER DE MAQUINARIA VIAL',
        cantidad: 1,
        unidadMedida: isVentasOrigin ? 'UNIDAD' : 'DÍAS',
        precioUnitario: isVentasOrigin ? 0 : 250000,
        bonificacionPorcentaje: 0,
        importe: isVentasOrigin ? 0 : 250000,
        alicuotaIva: 21
      }
    ]);
    setIsFormModalOpen(true);

    // Fetch exact authoritative next number directly from Supabase PostgreSQL
    setIsFetchingNextNumber(true);
    try {
      const res = await fetch('/api/quotations/next-number');
      const data = await res.json();
      if (data && typeof data.nextNumeroComprobante === 'number') {
        setNumeroComprobante(data.nextNumeroComprobante);
      }
      if (data && typeof data.puntoVenta === 'number') {
        setPuntoVenta(data.puntoVenta);
      }
      if (data && Array.isArray(data.quotations)) {
        onSaveQuotations(data.quotations);
      }
    } catch (err) {
      console.warn('[Quotations] Usando numeración correlativa en caché:', err);
    } finally {
      setIsFetchingNextNumber(false);
    }
  };

  // Open Modal for Edit
  const handleOpenEditModal = (q: Quotation) => {
    setEditingQuotationId(q.id);
    setPuntoVenta(q.puntoVenta);
    setNumeroComprobante(q.numeroComprobante);
    setFechaEmision(q.fechaEmision);
    setValidoHasta(q.validoHasta);
    setRazonSocialReceptor(q.razonSocialReceptor);
    setCuitReceptor(q.cuitReceptor);
    setDomicilioReceptor(q.domicilioReceptor);
    setZonaReceptor(q.zonaReceptor);
    setLocalidadReceptor(q.localidadReceptor);
    setTelefonoReceptor(q.telefonoReceptor);
    setCondicionVenta(q.condicionVenta);
    setMonedaExpresada(q.monedaExpresada);
    setNombreVendedor(q.nombreVendedor);
    setObservaciones(q.observaciones);
    setBonificacionGlobalMonto(q.bonificacionTotal || 0);
    setPercepcionIibb(q.percepcionIibb || 0);
    setEstado(q.estado);
    setCuitLookupFeedback(null);
    setEquipSearchQuery('');
    setIsEquipPickerOpen(false);
    setActiveSuggestRowIdx(null);
    setSuggestSourceField(null);
    setItems(q.items.map(it => ({ ...it })));
    setIsFormModalOpen(true);
  };

  // Duplicate Quotation (Server-Authoritative Automatic Numbering in Supabase)
  const handleDuplicateQuotation = async (q: Quotation) => {
    const fallbackNextNum = getNextNumeroComprobante();
    const newId = `COT-${String(q.puntoVenta).padStart(4, '0')}-${String(fallbackNextNum).padStart(8, '0')}`;
    const duplicatedPayload: Quotation = {
      ...q,
      id: newId,
      numeroComprobante: fallbackNextNum,
      fechaEmision: new Date().toISOString().slice(0, 10),
      validoHasta: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      estado: 'PENDIENTE',
      createdAt: new Date().toISOString()
    };

    try {
      const res = await fetch('/api/quotations/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotation: duplicatedPayload, isEdit: false })
      });
      const data = await res.json();
      if (data && data.success && Array.isArray(data.quotations)) {
        onSaveQuotations(data.quotations);
        return;
      }
    } catch (err) {
      console.warn('[Quotations] Fallback guardando duplicado:', err);
    }
    onSaveQuotations([duplicatedPayload, ...quotations]);
  };

  // CUIT / DNI Lookup via ARCA & BCRA Padrón + Supabase DB
  const handleCuitLookup = async (cuitInput: string, forceRefresh = false) => {
    const clean = cuitInput.replace(/\D/g, '');
    if (clean.length < 7 || clean.length > 11) {
      setCuitLookupFeedback({
        type: 'warning',
        text: 'Ingrese un CUIT de 11 dígitos o un DNI de 7 u 8 dígitos para buscar en el Padrón.'
      });
      return;
    }

    setIsSearchingCuit(true);
    setCuitLookupFeedback(null);
    try {
      const res = await fetch(`/api/arca/padron/${clean}${forceRefresh ? '?refresh=1' : ''}`);
      const data = await res.json();
      if (data && data.found && data.razonSocial) {
        setRazonSocialReceptor(data.razonSocial);
        if (data.cuit && String(data.cuit).length === 11) {
          setCuitReceptor(String(data.cuit));
        }
        if (data.domicilio) {
          setDomicilioReceptor(data.domicilio);
        }
        if (data.localidad) {
          setLocalidadReceptor(data.localidad);
        }
        if (data.zona) {
          setZonaReceptor(data.zona);
        }
        if (data.telefono) {
          setTelefonoReceptor(data.telefono);
        }
        setCuitLookupFeedback({
          type: 'success',
          text: data.domicilio
            ? `Padrón encontrado: ${data.razonSocial} (CUIT ${data.cuit || clean})`
            : `Padrón encontrado: ${data.razonSocial} (CUIT ${data.cuit || clean}) — Ingrese domicilio manualmente`
        });
      } else {
        setCuitLookupFeedback({
          type: 'warning',
          text: `No se halló razón social automática para ${clean}. Puede ingresarla manualmente.`
        });
      }
    } catch (e) {
      console.warn('Error consultando CUIT:', e);
      setCuitLookupFeedback({
        type: 'warning',
        text: 'No se pudo conectar al servicio de Padrón en este momento.'
      });
    } finally {
      setIsSearchingCuit(false);
    }
  };

  // Item management in form
  const handleUpdateItem = (index: number, field: keyof QuotationItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const current = { ...updated[index], [field]: value };
      const cant = Number(current.cantidad) || 0;
      const precio = Number(current.precioUnitario) || 0;
      const bonifPct = Number(current.bonificacionPorcentaje) || 0;
      const bruto = cant * precio;
      const descuento = bruto * (bonifPct / 100);
      current.importe = Math.max(0, Number((bruto - descuento).toFixed(2)));
      updated[index] = current;
      return updated;
    });
  };

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        codigo: String(prev.length + 1).padStart(3, '0'),
        descripcion: '',
        cantidad: 1,
        unidadMedida: 'UNI',
        precioUnitario: 0,
        bonificacionPorcentaje: 0,
        importe: 0,
        alicuotaIva: 21
      }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const activeFleet = useMemo(
    () => fleet.filter(v => !v.archivado),
    [fleet]
  );

  const filterFleetMatches = (rawQuery: string) => {
    const q = (rawQuery || '').trim().toLowerCase();
    if (!q) return activeFleet.slice(0, 25);
    const tokens = q.split(/\s+/).filter(Boolean);
    return activeFleet
      .filter(v => {
        const haystack = [
          v.codigoInterno,
          v.modeloMarca,
          v.patente,
          v.marca,
          v.modelo,
          v.categoriaEquipo,
          v.codigoEquipo
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return tokens.every(tok => haystack.includes(tok));
      })
      .slice(0, 25);
  };

  const buildFleetItem = (v: Vehicle, isHora: boolean): QuotationItem => {
    const price = isHora
      ? Number(v.precioSugeridoHora || v.precioCostoHora || 45000)
      : Number(v.precioSugerido || v.precioCosto || 250000);
    return {
      codigo: v.codigoInterno || v.patente || v.id.slice(0, 6),
      descripcion: (v.modeloMarca || v.modelo || 'EQUIPO').trim(),
      cantidad: 1,
      unidadMedida: isHora ? 'HS' : 'DÍAS',
      precioUnitario: price,
      bonificacionPorcentaje: 0,
      importe: price,
      alicuotaIva: 21
    };
  };

  const handleApplySuggestionToRow = (
    rowIdx: number,
    newItem: Partial<QuotationItem>
  ) => {
    setItems(prev => {
      const updated = [...prev];
      const existing = updated[rowIdx] || {
        codigo: '',
        descripcion: '',
        cantidad: 1,
        unidadMedida: 'UNI',
        precioUnitario: 0,
        bonificacionPorcentaje: 0,
        importe: 0,
        alicuotaIva: 21
      };
      const cant = Number(existing.cantidad) || 1;
      const precio =
        newItem.precioUnitario !== undefined ? Number(newItem.precioUnitario) : Number(existing.precioUnitario) || 0;
      const bonifPct = Number(existing.bonificacionPorcentaje) || 0;
      const bruto = cant * precio;
      const descuento = bruto * (bonifPct / 100);
      updated[rowIdx] = {
        ...existing,
        ...newItem,
        cantidad: cant,
        precioUnitario: precio,
        importe: Math.max(0, Number((bruto - descuento).toFixed(2)))
      };
      return updated;
    });
    setActiveSuggestRowIdx(null);
    setSuggestSourceField(null);
  };

  // Quick Catalog Insertion (Maquinaria, Ferretería, Áridos)
  const handleAddFromCatalog = (type: 'FLOTA_DIA' | 'FLOTA_HORA' | 'FERRETERIA' | 'ARIDOS', id: string) => {
    if (!id) return;
    if (type === 'FLOTA_DIA' || type === 'FLOTA_HORA') {
      const v = fleet.find(f => f.id === id);
      if (!v) return;
      const isHora = type === 'FLOTA_HORA';
      const newItem = buildFleetItem(v, isHora);
      setItems(prev => (prev.length === 1 && !prev[0].descripcion ? [newItem] : [...prev, newItem]));
    } else if (type === 'FERRETERIA') {
      const h = hardwareProducts.find(p => p.id === id);
      if (!h) return;
      const price = Number(h.precioVenta || 0);
      const newItem: QuotationItem = {
        codigo: h.codigo || h.id,
        descripcion: `${h.nombre} ${h.marca ? `- ${h.marca}` : ''}`.trim(),
        cantidad: 1,
        unidadMedida: (h as any).unidadMedida || 'UNI',
        precioUnitario: price,
        bonificacionPorcentaje: 0,
        importe: price,
        alicuotaIva: 21
      };
      setItems(prev => (prev.length === 1 && !prev[0].descripcion ? [newItem] : [...prev, newItem]));
    } else if (type === 'ARIDOS') {
      const a = aridos.find(item => item.id === id);
      if (!a) return;
      const price = Number(a.precioPorM3 || 0);
      const newItem: QuotationItem = {
        codigo: a.id,
        descripcion: a.nombre.toUpperCase(),
        cantidad: 1,
        unidadMedida: a.unidad || 'M3',
        precioUnitario: price,
        bonificacionPorcentaje: 0,
        importe: price,
        alicuotaIva: 21
      };
      setItems(prev => (prev.length === 1 && !prev[0].descripcion ? [newItem] : [...prev, newItem]));
    }
  };

  // Live Totals Calculation
  const formTotals = useMemo(() => {
    const subtotalPedido = Number(
      items.reduce((acc, it) => acc + (Number(it.importe) || 0), 0).toFixed(2)
    );
    const bonificacionTotal = Number((Number(bonificacionGlobalMonto) || 0).toFixed(2));
    const subtotalNeto = Math.max(0, Number((subtotalPedido - bonificacionTotal).toFixed(2)));
    const ratioNeto = subtotalPedido > 0 ? subtotalNeto / subtotalPedido : 1;
    const ivaTotal = Number(
      items
        .reduce((acc, it) => {
          const itemNeto = (Number(it.importe) || 0) * ratioNeto;
          const alic = Number(it.alicuotaIva ?? 21);
          return acc + itemNeto * (alic / 100);
        }, 0)
        .toFixed(2)
    );
    const iibb = Number((Number(percepcionIibb) || 0).toFixed(2));
    const importeTotal = Number((subtotalNeto + iibb + ivaTotal).toFixed(2));

    return {
      subtotalPedido,
      bonificacionTotal,
      subtotalNeto,
      percepcionIibb: iibb,
      ivaTotal,
      importeTotal
    };
  }, [items, bonificacionGlobalMonto, percepcionIibb]);

  // Save Quotation directly to Supabase PostgreSQL with Server-Authoritative Auto-Numbering
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const pto = Number(puntoVenta) || 1;
    const nro = Number(numeroComprobante) || 1;
    const id =
      editingQuotationId ||
      `COT-${String(pto).padStart(4, '0')}-${String(nro).padStart(8, '0')}`;

    const existingForEdit = editingQuotationId
      ? quotations.find(q => q.id === editingQuotationId)
      : undefined;

    const draftQuotation: Quotation = {
      id,
      puntoVenta: pto,
      numeroComprobante: nro,
      fechaEmision,
      validoHasta,
      razonSocialReceptor: (razonSocialReceptor || 'CONSUMIDOR FINAL').toUpperCase(),
      cuitReceptor: cuitReceptor.trim(),
      domicilioReceptor: domicilioReceptor.toUpperCase(),
      zonaReceptor: zonaReceptor.toUpperCase(),
      localidadReceptor: localidadReceptor.toUpperCase(),
      telefonoReceptor: telefonoReceptor.trim(),
      condicionVenta: condicionVenta.toUpperCase(),
      monedaExpresada: monedaExpresada.toUpperCase(),
      nombreVendedor: nombreVendedor.toUpperCase(),
      observaciones: observaciones.toUpperCase(),
      items: items.map((it, idx) => ({
        ...it,
        codigo: it.codigo || String(idx + 1).padStart(3, '0'),
        descripcion: (it.descripcion || 'PRODUCTO / SERVICIO').toUpperCase()
      })),
      subtotalPedido: formTotals.subtotalPedido,
      bonificacionTotal: formTotals.bonificacionTotal,
      subtotalNeto: formTotals.subtotalNeto,
      percepcionIibb: formTotals.percepcionIibb,
      ivaTotal: formTotals.ivaTotal,
      importeTotal: formTotals.importeTotal,
      estado,
      origenModulo: existingForEdit
        ? resolveQuotationModule(existingForEdit)
        : activeModuleScope,
      createdAt: existingForEdit?.createdAt || new Date().toISOString()
    };

    setIsSavingToDb(true);
    try {
      const res = await fetch('/api/quotations/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotation: draftQuotation,
          isEdit: Boolean(editingQuotationId)
        })
      });
      const data = await res.json();
      if (data && data.success && data.quotation) {
        const authoritativeList: Quotation[] = Array.isArray(data.quotations)
          ? data.quotations
          : [data.quotation, ...quotations.filter(q => q.id !== data.quotation.id)];
        onSaveQuotations(authoritativeList);
        setIsFormModalOpen(false);
        setSelectedQuotationForView(data.quotation);
        return;
      }
    } catch (err) {
      console.warn('[Quotations] Error guardando en servidor, aplicando sincronización:', err);
    } finally {
      setIsSavingToDb(false);
    }

    // Fallback if server request fails
    const exists = quotations.some(q => q.id === draftQuotation.id);
    const updatedList = exists
      ? quotations.map(q => (q.id === draftQuotation.id ? draftQuotation : q))
      : [draftQuotation, ...quotations];

    onSaveQuotations(updatedList);
    setIsFormModalOpen(false);
    setSelectedQuotationForView(draftQuotation);
  };

  // Status Change (Persisted directly in Supabase PostgreSQL)
  const handleChangeStatus = async (id: string, newStatus: QuotationStatus) => {
    const target = quotations.find(q => q.id === id);
    const updated = quotations.map(q => (q.id === id ? { ...q, estado: newStatus } : q));
    onSaveQuotations(updated);
    if (selectedQuotationForView?.id === id) {
      setSelectedQuotationForView({ ...selectedQuotationForView, estado: newStatus });
    }
    if (target) {
      try {
        await fetch('/api/quotations/emit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quotation: { ...target, estado: newStatus },
            isEdit: true
          })
        });
      } catch (err) {
        console.warn('[Quotations] Error actualizando estado en Supabase:', err);
      }
    }
  };

  // Delete Quotation
  const handleConfirmDelete = async () => {
    if (!quotationToDelete) return;
    const id = quotationToDelete.id;
    if (onDeleteQuotation) {
      const result = await Promise.resolve(onDeleteQuotation(id));
      if (result === false) return;
    } else {
      const updated = quotations.filter(q => q.id !== id);
      onSaveQuotations(updated);
    }
    if (selectedQuotationForView?.id === id) {
      setSelectedQuotationForView(null);
    }
    setQuotationToDelete(null);
  };

  // High-Resolution Canvas & PDF Generator (1800 x 2547 A4)
  const renderQuotationToCanvas = async (quot: Quotation): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 2547;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo inicializar el lienzo 2D');

    const loadImg = (url: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });

    let bgImg: HTMLImageElement;
    try {
      bgImg = await loadImg(QUOTATION_TEMPLATE_IMAGE_LOCAL);
    } catch {
      bgImg = await loadImg(QUOTATION_TEMPLATE_IMAGE_CDN);
    }

    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f172a';
    const fontFam = templateLayout.fontFamily || 'sans-serif';
    const W = canvas.width;
    const H = canvas.height;
    const pdfScale = W / 1000;

    const drawText = (
      text: string,
      xPct: number,
      yPct: number,
      align: 'left' | 'right' | 'center' = 'left',
      fontSize = 14,
      isBold = false
    ) => {
      if (!text) return;
      ctx.save();
      const scaledFs = Math.round((fontSize || 14) * pdfScale);
      ctx.font = isBold ? `bold ${scaledFs}px ${fontFam}` : `${scaledFs}px ${fontFam}`;
      ctx.textAlign = align;
      ctx.textBaseline = 'top';
      ctx.fillText(text, (xPct / 100) * W, (yPct / 100) * H);
      ctx.restore();
    };

    const ptoPadded = String(quot.puntoVenta).padStart(4, '0');
    const nroPadded = String(quot.numeroComprobante).padStart(8, '0');

    // Top Right Header
    drawText(
      `${ptoPadded}-${nroPadded}`,
      templateLayout.numComprobante.x,
      templateLayout.numComprobante.y,
      'left',
      templateLayout.numComprobante.fontSize,
      Boolean(templateLayout.numComprobante.isBold)
    );
    drawText(
      formatDateDisplay(quot.fechaEmision),
      templateLayout.fechaEmision.x,
      templateLayout.fechaEmision.y,
      'left',
      templateLayout.fechaEmision.fontSize,
      Boolean(templateLayout.fechaEmision.isBold)
    );

    // Validity strip
    drawText(
      formatDateDisplay(quot.validoHasta),
      templateLayout.validoHasta.x,
      templateLayout.validoHasta.y,
      'left',
      templateLayout.validoHasta.fontSize,
      Boolean(templateLayout.validoHasta.isBold)
    );

    // Customer Box
    drawText(
      quot.razonSocialReceptor,
      templateLayout.razonSocial.x,
      templateLayout.razonSocial.y,
      'left',
      templateLayout.razonSocial.fontSize,
      Boolean(templateLayout.razonSocial.isBold)
    );
    drawText(
      quot.domicilioReceptor,
      templateLayout.domicilio.x,
      templateLayout.domicilio.y,
      'left',
      templateLayout.domicilio.fontSize,
      Boolean(templateLayout.domicilio.isBold)
    );
    drawText(
      quot.zonaReceptor,
      templateLayout.zona.x,
      templateLayout.zona.y,
      'left',
      templateLayout.zona.fontSize,
      Boolean(templateLayout.zona.isBold)
    );
    drawText(
      quot.localidadReceptor,
      templateLayout.localidad.x,
      templateLayout.localidad.y,
      'left',
      templateLayout.localidad.fontSize,
      Boolean(templateLayout.localidad.isBold)
    );
    drawText(
      quot.cuitReceptor,
      templateLayout.cuitReceptor.x,
      templateLayout.cuitReceptor.y,
      'left',
      templateLayout.cuitReceptor.fontSize,
      Boolean(templateLayout.cuitReceptor.isBold)
    );
    drawText(
      quot.telefonoReceptor,
      templateLayout.telefonoReceptor.x,
      templateLayout.telefonoReceptor.y,
      'left',
      templateLayout.telefonoReceptor.fontSize,
      Boolean(templateLayout.telefonoReceptor.isBold)
    );

    // Table Items
    let itemYPct = templateLayout.tableStartY || 33.6;
    const rowGap = templateLayout.tableRowHeight || 2.8;
    const tblFs = templateLayout.tableFontSize || 14;

    const isUsdQuot = /USD|D[OÓ]LAR/i.test(quot.monedaExpresada || '');
    const sym = isUsdQuot ? 'US$ ' : '$';

    quot.items.forEach((it, idx) => {
      const cod = it.codigo || String(idx + 1).padStart(3, '0');
      const fullDesc = it.observacionLinea
        ? `${it.descripcion} (${it.observacionLinea})`
        : it.descripcion;
      drawText(cod, templateLayout.tableColCodigoX, itemYPct, 'left', tblFs, false);
      drawText(fullDesc.toUpperCase(), templateLayout.tableColDescripcionX, itemYPct, 'left', tblFs, false);
      const cantStr = `${it.cantidad.toLocaleString('es-AR', { minimumFractionDigits: 2 })}${
        it.unidadMedida ? ` ${it.unidadMedida.toUpperCase()}` : ''
      }`;
      drawText(
        cantStr,
        templateLayout.tableColCantidadX,
        itemYPct,
        'left',
        tblFs,
        false
      );
      drawText(
        `${sym}${it.precioUnitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
        templateLayout.tableColPrecioX,
        itemYPct,
        'left',
        tblFs,
        false
      );
      drawText(
        `${sym}${it.importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
        templateLayout.tableColImporteX,
        itemYPct,
        'left',
        tblFs,
        true
      );
      itemYPct += rowGap;
    });

    // Bottom Left Metadata
    drawText(
      quot.condicionVenta,
      templateLayout.condicionVenta.x,
      templateLayout.condicionVenta.y,
      'left',
      templateLayout.condicionVenta.fontSize,
      Boolean(templateLayout.condicionVenta.isBold)
    );
    drawText(
      quot.monedaExpresada,
      templateLayout.monedaExpresada.x,
      templateLayout.monedaExpresada.y,
      'left',
      templateLayout.monedaExpresada.fontSize,
      Boolean(templateLayout.monedaExpresada.isBold)
    );
    drawText(
      quot.nombreVendedor,
      templateLayout.nombreVendedor.x,
      templateLayout.nombreVendedor.y,
      'left',
      templateLayout.nombreVendedor.fontSize,
      Boolean(templateLayout.nombreVendedor.isBold)
    );
    const [obsLine1, obsLine2] = splitObservacionesTwoLines(quot.observaciones, 62);
    drawText(
      obsLine1,
      templateLayout.observaciones.x,
      templateLayout.observaciones.y,
      'left',
      templateLayout.observaciones.fontSize,
      Boolean(templateLayout.observaciones.isBold)
    );
    if (obsLine2) {
      drawText(
        obsLine2,
        templateLayout.observaciones.x,
        templateLayout.observaciones.y + 1.35,
        'left',
        templateLayout.observaciones.fontSize,
        Boolean(templateLayout.observaciones.isBold)
      );
    }

    // Bottom Right Totals
    const totX = templateLayout.totalsX || 96.0;
    const totFs = templateLayout.totalsFontSize || 15;
    drawText(
      quot.subtotalPedido.toLocaleString('es-AR', { minimumFractionDigits: 2 }),
      totX,
      templateLayout.totalsSubtotalY,
      'right',
      totFs,
      false
    );
    drawText(
      quot.bonificacionTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 }),
      totX,
      templateLayout.totalsBonifY,
      'right',
      totFs,
      false
    );
    drawText(
      quot.subtotalNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 }),
      totX,
      templateLayout.totalsSubtotalNetoY,
      'right',
      totFs,
      false
    );
    drawText(
      quot.percepcionIibb.toLocaleString('es-AR', { minimumFractionDigits: 2 }),
      totX,
      templateLayout.totalsIibbY,
      'right',
      totFs,
      false
    );
    drawText(
      quot.ivaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 }),
      totX,
      templateLayout.totalsIvaY,
      'right',
      totFs,
      false
    );
    drawText(
      quot.importeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 }),
      totX,
      templateLayout.totalsTotalY,
      'right',
      totFs + 1,
      true
    );

    return canvas;
  };

  const handleDownloadPdf = async (quot: Quotation) => {
    setIsGeneratingPdf(true);
    try {
      const canvas = await renderQuotationToCanvas(quot);
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, 210, 297);
      const ptoPadded = String(quot.puntoVenta).padStart(4, '0');
      const nroPadded = String(quot.numeroComprobante).padStart(8, '0');
      pdf.save(`Cotizacion_${ptoPadded}-${nroPadded}_${quot.razonSocialReceptor.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    } catch (err) {
      console.error('Error generando PDF de cotización:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const scopeCounts = useMemo(() => {
    let ventas = 0;
    let alquileres = 0;
    quotations.forEach(q => {
      if (resolveQuotationModule(q) === 'VENTAS_SALON') ventas += 1;
      else alquileres += 1;
    });
    return { ventas, alquileres, total: quotations.length };
  }, [quotations]);

  const scopedQuotations = useMemo(() => {
    if (moduleScopeFilter === 'ALL') return quotations;
    return quotations.filter(q => resolveQuotationModule(q) === moduleScopeFilter);
  }, [quotations, moduleScopeFilter]);

  // KPI Metrics (separated ARS vs USD, scoped to active module filter)
  const metrics = useMemo(() => {
    const totalCount = scopedQuotations.length;
    const totalMonto = scopedQuotations
      .filter(q => !/USD|D[OÓ]LAR/i.test(q.monedaExpresada || ''))
      .reduce((acc, q) => acc + (Number(q.importeTotal) || 0), 0);
    const totalMontoUsd = scopedQuotations
      .filter(q => /USD|D[OÓ]LAR/i.test(q.monedaExpresada || ''))
      .reduce((acc, q) => acc + (Number(q.importeTotal) || 0), 0);
    const aprobadasCount = scopedQuotations.filter(
      q => q.estado === 'APROBADA' || q.estado === 'FACTURADA'
    ).length;
    const pendientesCount = scopedQuotations.filter(q => q.estado === 'PENDIENTE').length;
    return { totalCount, totalMonto, totalMontoUsd, aprobadasCount, pendientesCount };
  }, [scopedQuotations]);

  const filteredQuotations = useMemo(() => {
    return scopedQuotations
      .filter(q => {
        const s = searchQuery.toLowerCase();
        const matchSearch =
          q.id.toLowerCase().includes(s) ||
          q.razonSocialReceptor.toLowerCase().includes(s) ||
          (q.cuitReceptor || '').toLowerCase().includes(s) ||
          (q.localidadReceptor || '').toLowerCase().includes(s) ||
          String(q.numeroComprobante).includes(s) ||
          q.items.some(it => it.descripcion.toLowerCase().includes(s));

        const matchStatus = filterStatus === 'ALL' ? true : q.estado === filterStatus;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => b.numeroComprobante - a.numeroComprobante);
  }, [scopedQuotations, searchQuery, filterStatus]);

  const getStatusBadgeStyle = (status: QuotationStatus) => {
    switch (status) {
      case 'APROBADA':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'FACTURADA':
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      case 'VENCIDA':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      case 'RECHAZADA':
        return 'bg-zinc-700/40 text-zinc-400 border-zinc-600/40';
      default:
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    }
  };

  return (
    <div className="space-y-3 w-full min-w-0">
      {/* Header Banner */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-3 rounded-2xl bg-[#F0C800]/15 border border-[#F0C800]/40 text-[#F0C800] shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-[#F0C800]/10 border border-[#F0C800]/30 text-[#F0C800] text-[10px] font-bold tracking-wider uppercase mb-0.5">
              VENTAS & PRESUPUESTOS • EL HORNOCAL S.R.L. / LA HORMIGA
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Cotizador Comercial & Presupuestos A4
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Emisión de cotizaciones con formato oficial de La Hormiga, selector rápido de flota/ferretería/áridos y calibrador visual de campos 1:1.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsCalibratorOpen(true)}
            className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            title="Acomodar posición y tamaño de letra de todos los campos sobre la plantilla"
          >
            <Sliders className="w-3.5 h-3.5" />
            Acomodar Campos (Calibrador A4)
          </button>

          <button
            onClick={() => exportQuotationsToCSV(scopedQuotations)}
            className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            Exportar CSV
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-[#F0C800] hover:bg-amber-400 text-zinc-950 rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-lg shadow-[#F0C800]/10 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            + Nueva Cotización
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Total Cotizaciones
            </p>
            <p className="text-2xl font-black text-white mt-0.5">{metrics.totalCount}</p>
            <p className="text-[11px] text-zinc-500">Presupuestos registrados</p>
          </div>
          <div className="p-2.5 bg-zinc-800/80 rounded-xl text-zinc-300">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Monto Total Cotizado
            </p>
            <p className="text-2xl font-black text-[#F0C800] mt-0.5">
              {formatCurrency(metrics.totalMonto, 'ARS')}
            </p>
            {metrics.totalMontoUsd > 0 && (
              <p className="text-xs font-black text-emerald-400">
                + {formatCurrency(metrics.totalMontoUsd, 'USD')}
              </p>
            )}
            <p className="text-[11px] text-zinc-500">Acumulado con IVA incluido</p>
          </div>
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Aprobadas / Facturadas
            </p>
            <p className="text-2xl font-black text-emerald-400 mt-0.5">{metrics.aprobadasCount}</p>
            <p className="text-[11px] text-zinc-500">Confirmadas por clientes</p>
          </div>
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
              Pendientes de Respuesta
            </p>
            <p className="text-2xl font-black text-cyan-400 mt-0.5">{metrics.pendientesCount}</p>
            <p className="text-[11px] text-zinc-500">En seguimiento comercial</p>
          </div>
          <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-xl p-1">
            {([
              { id: 'VENTAS_SALON' as const, label: 'Solo Ventas', count: scopeCounts.ventas },
              { id: 'ALQUILERES' as const, label: 'Solo Alquileres', count: scopeCounts.alquileres },
              { id: 'ALL' as const, label: 'Ver Todo', count: scopeCounts.total },
            ]).map(opt => {
              const active = moduleScopeFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setModuleScopeFilter(opt.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-[#F0C800] text-zinc-950 shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className={`text-[10px] font-mono tabular-nums ${active ? 'text-zinc-900/80' : 'text-zinc-500'}`}>
                    ({opt.count})
                  </span>
                </button>
              );
            })}
          </div>
          <span className="text-[11px] text-zinc-400">
            {moduleScopeFilter === 'ALL'
              ? 'Mostrando presupuestos de Ventas y Alquileres en conjunto'
              : moduleScopeFilter === 'VENTAS_SALON'
                ? 'Filtrado por módulo Ventas (Salón) · Tocá "Ver Todo" para incluir Alquileres'
                : 'Filtrado por módulo Alquileres · Tocá "Ver Todo" para incluir Ventas'}
          </span>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por Nº de cotización, cliente, CUIT, localidad o producto/servicio..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#F0C800]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', 'PENDIENTE', 'APROBADA', 'FACTURADA', 'VENCIDA', 'RECHAZADA'] as const).map(
              st => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    filterStatus === st
                      ? 'bg-[#F0C800] text-zinc-950 border-[#F0C800]'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                  }`}
                >
                  {st === 'ALL' ? 'Todas' : st}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Quotations Table */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950/90 border-b border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                <th className="py-2.5 px-3 whitespace-nowrap">Comp. Nro</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Emisión / Validez</th>
                <th className="py-2.5 px-3">Cliente / Razón Social</th>
                <th className="py-2.5 px-3">Localidad / Tel.</th>
                <th className="py-2.5 px-3">Detalle Ítems</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Subtotal Neto</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Importe Total</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Estado</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70 text-xs">
              {filteredQuotations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-zinc-400">
                    <FileText className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
                    <p className="font-bold text-zinc-300">No hay cotizaciones registradas</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Hacé clic en &ldquo;+ Nueva Cotización&rdquo; para crear tu primer presupuesto en formato A4.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredQuotations.map(q => {
                  const waUrl = buildQuotationWhatsAppUrl(q);
                  return (
                  <tr key={q.id} className="hover:bg-zinc-800/40 transition">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#F0C800] whitespace-nowrap">
                      <div>{String(q.puntoVenta).padStart(4, '0')}-{String(q.numeroComprobante).padStart(8, '0')}</div>
                      {moduleScopeFilter === 'ALL' && (
                        <div className={`text-[10px] font-sans font-semibold mt-0.5 ${
                          resolveQuotationModule(q) === 'VENTAS_SALON' ? 'text-amber-300' : 'text-sky-400'
                        }`}>
                          {resolveQuotationModule(q) === 'VENTAS_SALON' ? 'Ventas' : 'Alquileres'}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-semibold text-white">{formatDateDisplay(q.fechaEmision)}</div>
                      {q.validoHasta && (
                        <div className="text-[11px] text-zinc-400">
                          Válido: {formatDateDisplay(q.validoHasta)}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white">{q.razonSocialReceptor}</div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        {q.cuitReceptor ? `CUIT: ${q.cuitReceptor}` : 'Sin CUIT'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-zinc-200">{q.localidadReceptor || '-'}</div>
                      {waUrl ? (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline font-medium"
                          title="Abrir chat de WhatsApp con este cliente"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>{q.telefonoReceptor}</span>
                        </a>
                      ) : (
                        <div className="text-[11px] text-zinc-400">{q.telefonoReceptor || ''}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 min-w-[180px] max-w-xs xl:max-w-md 2xl:max-w-xl">
                      <div className="truncate text-zinc-200 font-medium" title={q.items[0]?.descripcion || 'Sin ítems'}>
                        {q.items[0]?.descripcion || 'Sin ítems'}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {q.items.length} {q.items.length === 1 ? 'ítem' : 'ítems'} • {q.condicionVenta}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-zinc-300 whitespace-nowrap">
                      {formatCurrency(q.subtotalNeto, q.monedaExpresada)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-400 text-sm whitespace-nowrap">
                      <div>{formatCurrency(q.importeTotal, q.monedaExpresada)}</div>
                      {/USD|D[OÓ]LAR/i.test(q.monedaExpresada || '') && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-black text-emerald-300">
                          USD
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <select
                        value={q.estado}
                        onChange={e => handleChangeStatus(q.id, e.target.value as QuotationStatus)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border cursor-pointer focus:outline-none ${getStatusBadgeStyle(
                          q.estado
                        )}`}
                      >
                        <option value="PENDIENTE" className="bg-zinc-900 text-amber-400">
                          PENDIENTE
                        </option>
                        <option value="APROBADA" className="bg-zinc-900 text-emerald-400">
                          APROBADA
                        </option>
                        <option value="FACTURADA" className="bg-zinc-900 text-cyan-400">
                          FACTURADA
                        </option>
                        <option value="VENCIDA" className="bg-zinc-900 text-rose-400">
                          VENCIDA
                        </option>
                        <option value="RECHAZADA" className="bg-zinc-900 text-zinc-400">
                          RECHAZADA
                        </option>
                      </select>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {onConvertToRental && (
                          <button
                            onClick={() => onConvertToRental(q)}
                            className="px-2 py-1.5 bg-amber-500/15 hover:bg-[#F0C800] text-[#F0C800] hover:text-zinc-950 rounded-lg border border-[#F0C800]/40 text-[11px] font-black transition flex items-center gap-1 cursor-pointer"
                            title="Llamar esta Cotización para Crear Contrato de Alquiler"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            Alquilar
                          </button>
                        )}
                        {onInvoiceInArca && (
                          <button
                            onClick={() => onInvoiceInArca(q)}
                            className="px-2 py-1.5 bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-zinc-950 rounded-lg border border-emerald-500/40 text-[11px] font-black transition flex items-center gap-1 cursor-pointer"
                            title="Llamar esta Cotización para Facturar en ARCA"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            Facturar
                          </button>
                        )}
                        {waUrl ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1.5 bg-green-600/20 hover:bg-green-500 text-green-400 hover:text-zinc-950 rounded-lg border border-green-500/40 text-[11px] font-black transition flex items-center gap-1 cursor-pointer"
                            title={`Contactar a ${q.razonSocialReceptor} por WhatsApp (${q.telefonoReceptor})`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            WhatsApp
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="px-2 py-1.5 bg-zinc-800/60 text-zinc-600 rounded-lg border border-zinc-800 text-[11px] font-bold flex items-center gap-1 cursor-not-allowed"
                            title="Esta cotización no tiene teléfono cargado"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            WhatsApp
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedQuotationForView(q)}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 rounded-lg border border-zinc-700 cursor-pointer"
                          title="Ver vista previa A4 y descargar PDF"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(q)}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded-lg border border-zinc-700 cursor-pointer"
                          title="Descargar PDF A4 directo"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(q)}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 rounded-lg border border-zinc-700 cursor-pointer"
                          title="Editar cotización"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDuplicateQuotation(q)}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 cursor-pointer"
                          title="Duplicar cotización"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setQuotationToDelete(q)}
                          className="p-1.5 bg-zinc-800 hover:bg-rose-950/60 text-rose-400 rounded-lg border border-zinc-700 cursor-pointer"
                          title="Eliminar cotización"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
      </div>

      {/* CREATE / EDIT QUOTATION MODAL */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="bg-zinc-950 px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#F0C800]/15 text-[#F0C800] rounded-xl border border-[#F0C800]/30">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white">
                    {editingQuotationId ? 'Editar Cotización Comercial' : 'Emitir Nueva Cotización A4'}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Formato oficial EL HORNOCAL S.R.L. / LA HORMIGA
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-2 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveForm} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {/* Row 1: Comprobante Metadata (100% Automatic Numbering from Database) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-zinc-950/70 p-4 rounded-xl border border-zinc-800">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-zinc-400">
                      Punto de Venta
                    </label>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      AUTO BD
                    </span>
                  </div>
                  <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300 font-mono font-bold select-none flex items-center justify-between">
                    <span>{String(puntoVenta).padStart(4, '0')}</span>
                    <span className="text-[10px] text-zinc-500">Fijo</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-zinc-400">
                      Comp. Nro (Automático)
                    </label>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/30">
                      {isFetchingNextNumber ? 'SINCRONIZANDO...' : 'CORRELATIVO BD'}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-900/60 border border-[#F0C800]/40 rounded-lg px-3 py-2 text-[#F0C800] font-mono font-black select-none flex items-center justify-between">
                    <span>{String(numeroComprobante).padStart(8, '0')}</span>
                    <span className="text-[10px] text-amber-400/80 font-sans font-bold">
                      #{numeroComprobante}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Fecha de Emisión
                  </label>
                  <input
                    type="date"
                    value={fechaEmision}
                    onChange={e => setFechaEmision(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-amber-400 mb-1">
                    Precios válidos hasta el
                  </label>
                  <input
                    type="date"
                    value={validoHasta}
                    onChange={e => setValidoHasta(e.target.value)}
                    className="w-full bg-zinc-900 border border-amber-500/40 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Estado Cotización
                  </label>
                  <select
                    value={estado}
                    onChange={e => setEstado(e.target.value as QuotationStatus)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-bold"
                  >
                    <option value="PENDIENTE">PENDIENTE</option>
                    <option value="APROBADA">APROBADA</option>
                    <option value="FACTURADA">FACTURADA</option>
                    <option value="VENCIDA">VENCIDA</option>
                    <option value="RECHAZADA">RECHAZADA</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Datos del Cliente (Respetando exactamente el recuadro de cotizacion-v3.jpg) */}
              <div className="bg-zinc-950/70 p-4 rounded-xl border border-zinc-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                  <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                    Datos del Cliente / Destinatario de la Cotización
                  </span>
                  {isSearchingCuit ? (
                    <span className="text-[11px] text-amber-400 animate-pulse font-semibold">
                      Consultando Padrón Oficial (ARCA / BCRA)...
                    </span>
                  ) : cuitLookupFeedback ? (
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                        cuitLookupFeedback.type === 'success'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {cuitLookupFeedback.type === 'success' ? '✓ ' : '⚠ '}
                      {cuitLookupFeedback.text}
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-4">
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                      CUIT o DNI (autocompleta Padrón)
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={cuitReceptor}
                        onChange={e => {
                          const val = e.target.value;
                          setCuitReceptor(val);
                          setCuitLookupFeedback(null);
                          if (val.replace(/\D/g, '').length === 11) {
                            handleCuitLookup(val);
                          }
                        }}
                        onBlur={e => {
                          const clean = e.target.value.replace(/\D/g, '');
                          if (clean.length >= 7 && clean.length <= 10 && !razonSocialReceptor.trim()) {
                            handleCuitLookup(clean);
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCuitLookup(cuitReceptor, true);
                          }
                        }}
                        placeholder="Ej: 20161836053 o DNI"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono"
                      />
                      <button
                        type="button"
                        disabled={isSearchingCuit}
                        onClick={() => handleCuitLookup(cuitReceptor, true)}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-amber-400 rounded-lg border border-zinc-700 font-bold shrink-0 cursor-pointer"
                      >
                        {isSearchingCuit ? '...' : 'Padrón'}
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-5">
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                      Apellido y Nombre / Razón Social *
                    </label>
                    <input
                      type="text"
                      required
                      value={razonSocialReceptor}
                      onChange={e => setRazonSocialReceptor(e.target.value)}
                      placeholder="Nombre completo o empresa"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-bold uppercase"
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                      Teléfono
                    </label>
                    <input
                      type="text"
                      value={telefonoReceptor}
                      onChange={e => setTelefonoReceptor(e.target.value)}
                      placeholder="Ej: 388-4123456"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white"
                    />
                  </div>

                  <div className="lg:col-span-5">
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                      Domicilio
                    </label>
                    <input
                      type="text"
                      value={domicilioReceptor}
                      onChange={e => setDomicilioReceptor(e.target.value)}
                      placeholder="Calle, número, barrio o ruta"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white uppercase"
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                      Zona
                    </label>
                    <input
                      type="text"
                      value={zonaReceptor}
                      onChange={e => setZonaReceptor(e.target.value)}
                      placeholder="Ej: CENTRO / SUR / OBRA"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white uppercase"
                    />
                  </div>

                  <div className="lg:col-span-4">
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                      Localidad
                    </label>
                    <input
                      type="text"
                      value={localidadReceptor}
                      onChange={e => setLocalidadReceptor(e.target.value)}
                      placeholder="Ej: SAN SALVADOR DE JUJUY"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Row 3: Quick Catalog Picker + Items Table */}
              <div className="bg-zinc-950/70 p-4 rounded-xl border border-zinc-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                  <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                    Detalle de Productos / Servicios Cotizados
                  </span>

                  {/* Quick Catalog Selectors */}
                  <div className="flex flex-wrap items-center gap-2">
                    {activeFleet.length > 0 && (
                      <div className="relative">
                        <div className="flex items-center gap-1.5 bg-zinc-900 border border-amber-500/35 focus-within:border-amber-400 rounded-lg px-2.5 py-1.5">
                          <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <input
                            type="text"
                            value={equipSearchQuery}
                            onFocus={() => setIsEquipPickerOpen(true)}
                            onBlur={() => setTimeout(() => setIsEquipPickerOpen(false), 180)}
                            onChange={e => {
                              setEquipSearchQuery(e.target.value);
                              setIsEquipPickerOpen(true);
                            }}
                            placeholder="Buscar equipo (nombre, código, patente)..."
                            className="bg-transparent text-[11px] text-white placeholder:text-zinc-500 focus:outline-none w-56 sm:w-64"
                          />
                          {equipSearchQuery && (
                            <button
                              type="button"
                              onMouseDown={e => {
                                e.preventDefault();
                                setEquipSearchQuery('');
                              }}
                              className="text-zinc-500 hover:text-white cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {isEquipPickerOpen && (
                          <div className="absolute left-0 top-full mt-1.5 w-[340px] sm:w-[430px] max-h-72 overflow-y-auto bg-zinc-950 border border-zinc-700 rounded-xl shadow-2xl z-40 divide-y divide-zinc-800/80">
                            {filterFleetMatches(equipSearchQuery).length === 0 ? (
                              <div className="p-3 text-center text-[11px] text-zinc-500">
                                No se encontraron equipos con "{equipSearchQuery}"
                              </div>
                            ) : (
                              filterFleetMatches(equipSearchQuery).map(v => {
                                const priceDia = Number(v.precioSugerido || v.precioCosto || 250000);
                                const priceHora = Number(v.precioSugeridoHora || v.precioCostoHora || 45000);
                                return (
                                  <div
                                    key={v.id}
                                    className="px-3 py-2 hover:bg-zinc-900/90 flex items-center justify-between gap-2 text-xs"
                                  >
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        {v.codigoInterno && (
                                          <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-[#F0C800] border border-amber-500/30 shrink-0">
                                            {v.codigoInterno}
                                          </span>
                                        )}
                                        <span className="text-white font-semibold truncate">
                                          {v.modeloMarca}
                                        </span>
                                      </div>
                                      {v.patente && (
                                        <span className="text-[10px] text-zinc-500 font-mono">
                                          Pat: {v.patente}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onMouseDown={e => {
                                          e.preventDefault();
                                          handleAddFromCatalog('FLOTA_DIA', v.id);
                                          setEquipSearchQuery('');
                                          setIsEquipPickerOpen(false);
                                        }}
                                        className="px-2 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold cursor-pointer whitespace-nowrap"
                                      >
                                        + Día ({formatCurrency(priceDia)})
                                      </button>
                                      <button
                                        type="button"
                                        onMouseDown={e => {
                                          e.preventDefault();
                                          handleAddFromCatalog('FLOTA_HORA', v.id);
                                          setEquipSearchQuery('');
                                          setIsEquipPickerOpen(false);
                                        }}
                                        className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[10px] font-bold cursor-pointer whitespace-nowrap"
                                      >
                                        + Hora ({formatCurrency(priceHora)})
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {hardwareProducts.length > 0 && (
                      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5">
                        <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                        <select
                          defaultValue=""
                          onChange={e => {
                            handleAddFromCatalog('FERRETERIA', e.target.value);
                            e.target.value = '';
                          }}
                          className="bg-transparent text-[11px] text-zinc-200 focus:outline-none max-w-[160px]"
                        >
                          <option value="" className="bg-zinc-900">
                            + Artículo Ferretería...
                          </option>
                          {hardwareProducts.map(h => (
                            <option key={h.id} value={h.id} className="bg-zinc-900">
                              {h.nombre} ({formatCurrency(h.precioVenta)})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {aridos.length > 0 && (
                      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5">
                        <Layers className="w-3.5 h-3.5 text-orange-400" />
                        <select
                          defaultValue=""
                          onChange={e => {
                            handleAddFromCatalog('ARIDOS', e.target.value);
                            e.target.value = '';
                          }}
                          className="bg-transparent text-[11px] text-zinc-200 focus:outline-none max-w-[150px]"
                        >
                          <option value="" className="bg-zinc-900">
                            + Áridos...
                          </option>
                          {aridos.map(a => (
                            <option key={a.id} value={a.id} className="bg-zinc-900">
                              {a.nombre} ({formatCurrency(a.precioPorM3)})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="px-3 py-1.5 bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] border border-[#F0C800]/30 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> + Agregar Renglón
                    </button>
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-2">
                  <div className="hidden lg:grid lg:grid-cols-[68px_minmax(220px,1.7fr)_minmax(140px,1.1fr)_64px_82px_96px_74px_124px] gap-1.5 text-[10px] font-bold text-zinc-400 uppercase px-2">
                    <div>Cód. Int</div>
                    <div>Producto / Máquina / Servicio (Escribí para filtrar)</div>
                    <div className="text-amber-400">Aditamento / Obs. de Línea</div>
                    <div className="text-center">Cant.</div>
                    <div>Unidad</div>
                    <div>Precio Unit.</div>
                    <div>IVA %</div>
                    <div className="text-right">
                      Importe ({/USD|D[OÓ]LAR/i.test(monedaExpresada) ? 'US$' : '$'})
                    </div>
                  </div>

                  {items.map((it, idx) => {
                    const rowQuery =
                      activeSuggestRowIdx === idx
                        ? suggestSourceField === 'cod'
                          ? it.codigo
                          : it.descripcion
                        : '';
                    const isRowSuggestOpen = activeSuggestRowIdx === idx;
                    const fleetRowMatches = isRowSuggestOpen ? filterFleetMatches(rowQuery) : [];
                    const cleanRowQ = (rowQuery || '').trim().toLowerCase();
                    const aridoRowMatches =
                      isRowSuggestOpen && cleanRowQ
                        ? aridos
                            .filter(a => a.nombre.toLowerCase().includes(cleanRowQ))
                            .slice(0, 5)
                        : [];
                    const hardwareRowMatches =
                      isRowSuggestOpen && cleanRowQ
                        ? hardwareProducts
                            .filter(
                              h =>
                                h.nombre.toLowerCase().includes(cleanRowQ) ||
                                (h.codigo || '').toLowerCase().includes(cleanRowQ)
                            )
                            .slice(0, 5)
                        : [];

                    return (
                    <div
                      key={idx}
                      className="grid grid-cols-1 lg:grid-cols-[68px_minmax(220px,1.7fr)_minmax(140px,1.1fr)_64px_82px_96px_74px_124px] gap-1.5 items-center bg-zinc-900/90 p-1.5 rounded-xl border border-zinc-800"
                    >
                      <div className="relative">
                        <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">Código</label>
                        <input
                          type="text"
                          value={it.codigo}
                          onFocus={() => {
                            setActiveSuggestRowIdx(idx);
                            setSuggestSourceField('cod');
                          }}
                          onBlur={() => setTimeout(() => setActiveSuggestRowIdx(prev => (prev === idx ? null : prev)), 180)}
                          onChange={e => {
                            handleUpdateItem(idx, 'codigo', e.target.value);
                            setActiveSuggestRowIdx(idx);
                            setSuggestSourceField('cod');
                          }}
                          placeholder="Cód."
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-[#F0C800] font-mono font-bold text-xs"
                        />
                      </div>

                      <div className="relative">
                        <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">Producto / Servicio</label>
                        <input
                          type="text"
                          required
                          value={it.descripcion}
                          onFocus={() => {
                            setActiveSuggestRowIdx(idx);
                            setSuggestSourceField('desc');
                          }}
                          onBlur={() => setTimeout(() => setActiveSuggestRowIdx(prev => (prev === idx ? null : prev)), 180)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') {
                              setActiveSuggestRowIdx(null);
                            }
                          }}
                          onChange={e => {
                            handleUpdateItem(idx, 'descripcion', e.target.value);
                            setActiveSuggestRowIdx(idx);
                            setSuggestSourceField('desc');
                          }}
                          placeholder="Escribí máquina, código o servicio..."
                          className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-400 rounded-lg px-2 py-1.5 text-white uppercase text-xs"
                        />

                        {isRowSuggestOpen &&
                          (fleetRowMatches.length > 0 ||
                            aridoRowMatches.length > 0 ||
                            hardwareRowMatches.length > 0) && (
                            <div className="absolute left-0 top-full mt-1 w-full min-w-[330px] sm:min-w-[420px] max-h-64 overflow-y-auto bg-zinc-950 border border-amber-500/40 rounded-xl shadow-2xl z-50 divide-y divide-zinc-800/80">
                              <div className="px-2.5 py-1 bg-zinc-900/90 text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center justify-between">
                                <span>Sugerencias de Equipos / Catálogo</span>
                                <span className="text-zinc-500 font-normal">Esc para cerrar</span>
                              </div>
                              {fleetRowMatches.map(v => {
                                const priceDia = Number(v.precioSugerido || v.precioCosto || 250000);
                                const priceHora = Number(v.precioSugeridoHora || v.precioCostoHora || 45000);
                                const defaultIsHora = v.modalidadTarifa === 'HORAS';
                                return (
                                  <div
                                    key={v.id}
                                    className="px-2.5 py-1.5 hover:bg-zinc-900 flex items-center justify-between gap-2 text-xs"
                                  >
                                    <button
                                      type="button"
                                      onMouseDown={e => {
                                        e.preventDefault();
                                        handleApplySuggestionToRow(idx, buildFleetItem(v, defaultIsHora));
                                      }}
                                      className="text-left min-w-0 flex-1 cursor-pointer"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        {v.codigoInterno && (
                                          <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-[#F0C800] border border-amber-500/30 shrink-0">
                                            {v.codigoInterno}
                                          </span>
                                        )}
                                        <span className="text-white font-semibold truncate">
                                          {v.modeloMarca}
                                        </span>
                                      </div>
                                      {v.patente && (
                                        <span className="text-[10px] text-zinc-500 font-mono">
                                          Pat: {v.patente}
                                        </span>
                                      )}
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onMouseDown={e => {
                                          e.preventDefault();
                                          handleApplySuggestionToRow(idx, buildFleetItem(v, false));
                                        }}
                                        className="px-1.5 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold cursor-pointer"
                                      >
                                        Día {formatCurrency(priceDia)}
                                      </button>
                                      <button
                                        type="button"
                                        onMouseDown={e => {
                                          e.preventDefault();
                                          handleApplySuggestionToRow(idx, buildFleetItem(v, true));
                                        }}
                                        className="px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[10px] font-bold cursor-pointer"
                                      >
                                        Hora {formatCurrency(priceHora)}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                              {aridoRowMatches.map(a => (
                                <button
                                  key={`ar-${a.id}`}
                                  type="button"
                                  onMouseDown={e => {
                                    e.preventDefault();
                                    handleApplySuggestionToRow(idx, {
                                      codigo: a.id,
                                      descripcion: a.nombre.toUpperCase(),
                                      unidadMedida: a.unidad || 'M3',
                                      precioUnitario: Number(a.precioPorM3 || 0)
                                    });
                                  }}
                                  className="w-full px-2.5 py-1.5 hover:bg-zinc-900 flex items-center justify-between text-xs text-left cursor-pointer"
                                >
                                  <span className="text-orange-300 font-semibold truncate">
                                    Árido: {a.nombre}
                                  </span>
                                  <span className="font-mono text-[10px] text-zinc-300">
                                    {formatCurrency(a.precioPorM3)} / {a.unidad || 'M3'}
                                  </span>
                                </button>
                              ))}
                              {hardwareRowMatches.map(h => (
                                <button
                                  key={`hw-${h.id}`}
                                  type="button"
                                  onMouseDown={e => {
                                    e.preventDefault();
                                    handleApplySuggestionToRow(idx, {
                                      codigo: h.codigo || h.id,
                                      descripcion: `${h.nombre}${h.marca ? ` - ${h.marca}` : ''}`.trim(),
                                      unidadMedida: (h as any).unidadMedida || 'UNI',
                                      precioUnitario: Number(h.precioVenta || 0)
                                    });
                                  }}
                                  className="w-full px-2.5 py-1.5 hover:bg-zinc-900 flex items-center justify-between text-xs text-left cursor-pointer"
                                >
                                  <span className="text-emerald-300 font-semibold truncate">
                                    Ferretería: {h.nombre}
                                  </span>
                                  <span className="font-mono text-[10px] text-zinc-300">
                                    {formatCurrency(h.precioVenta)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                      </div>

                      <div>
                        <label className="block lg:hidden text-[10px] font-bold text-amber-400 mb-0.5">Aditamento / Obs. de Línea</label>
                        <input
                          type="text"
                          value={it.observacionLinea || ''}
                          onChange={e => handleUpdateItem(idx, 'observacionLinea', e.target.value)}
                          placeholder="Ej: C/ disco, C/ martillo, C/ 2 puntas..."
                          className="w-full bg-zinc-950 border border-amber-500/30 focus:border-amber-400 rounded-lg px-2 py-1.5 text-amber-200 text-xs placeholder:text-zinc-600"
                        />
                      </div>

                      <div>
                        <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">Cantidad</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={it.cantidad}
                          onChange={e => handleUpdateItem(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-1.5 py-1.5 text-white font-mono text-center text-xs"
                        />
                      </div>

                      <div>
                        <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">Unidad</label>
                        <select
                          value={it.unidadMedida || 'UNI'}
                          onChange={e => handleUpdateItem(idx, 'unidadMedida', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-1.5 py-1.5 text-white font-semibold text-xs"
                          title="Unidad de Medida"
                        >
                          <option value="UNI">UNI</option>
                          <option value="HS">HS</option>
                          <option value="DÍAS">DÍAS</option>
                          <option value="JORNADA">JORNADA</option>
                          <option value="GLOBAL">GLOBAL</option>
                          <option value="MES">MES</option>
                          <option value="M3">M3</option>
                          <option value="M2">M2</option>
                          <option value="VIAJES">VIAJES</option>
                          <option value="TN">TN</option>
                          <option value="KM">KM</option>
                          <option value="LITROS">LTS</option>
                          <option value="KG">KG</option>
                          <option value="SERVICIO">SERV.</option>
                        </select>
                      </div>

                      <div>
                        <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">
                          Precio Unit. ({/USD|D[OÓ]LAR/i.test(monedaExpresada) ? 'US$' : '$'})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.precioUnitario}
                          onChange={e =>
                            handleUpdateItem(idx, 'precioUnitario', parseFloat(e.target.value) || 0)
                          }
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-white font-mono text-xs"
                        />
                      </div>

                      <div>
                        <label className="block lg:hidden text-[10px] font-bold text-zinc-500 mb-0.5">IVA %</label>
                        <select
                          value={it.alicuotaIva}
                          onChange={e => handleUpdateItem(idx, 'alicuotaIva', parseFloat(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-1 py-1.5 text-white font-mono text-xs"
                        >
                          <option value={21}>21%</option>
                          <option value={10.5}>10.5%</option>
                          <option value={27}>27%</option>
                          <option value={0}>0%</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-end gap-1">
                        <span className="font-mono font-bold text-emerald-400 text-xs whitespace-nowrap">
                          {formatCurrency(it.importe, monedaExpresada)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          disabled={items.length <= 1}
                          className="p-1 text-zinc-500 hover:text-rose-400 disabled:opacity-30 cursor-pointer shrink-0"
                          title="Quitar renglón"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );})}
                </div>
              </div>

              {/* Row 4: Pie Izquierdo (Condiciones) + Pie Derecho (Totales) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7 bg-zinc-950/70 p-4 rounded-xl border border-zinc-800 space-y-3">
                  <div className="font-bold text-white uppercase tracking-wider text-[11px] border-b border-zinc-800 pb-2">
                    Condiciones Comerciales & Pie de Página
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                        Condición de venta
                      </label>
                      <input
                        type="text"
                        value={condicionVenta}
                        onChange={e => setCondicionVenta(e.target.value)}
                        placeholder="Ej: CONTADO / TRANSFERENCIA"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white uppercase"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                        Los precios están expresados en
                      </label>
                      <select
                        value={monedaExpresada}
                        onChange={e => setMonedaExpresada(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-bold"
                      >
                        <option value="PESOS ARGENTINOS">PESOS ARGENTINOS</option>
                        <option value="DÓLARES ESTADOUNIDENSES (USD)">DÓLARES ESTADOUNIDENSES (USD)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                        Nombre del vendedor
                      </label>
                      <input
                        type="text"
                        value={nombreVendedor}
                        onChange={e => setNombreVendedor(e.target.value)}
                        placeholder="Ej: ADMINISTRACIÓN LA HORMIGA"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white uppercase"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-bold text-zinc-400">
                          Observaciones (2 Renglones en el Comprobante A4)
                        </label>
                        <span className="text-[10px] text-amber-400 font-semibold">
                          Podés presionar Enter para el 2° renglón o escribir corrido
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        value={observaciones}
                        onChange={e => setObservaciones(e.target.value)}
                        placeholder="Renglón 1: Ej. LOS EQUIPOS CUENTAN CON OPERARIO, EL GRUPO ELECTRÓGENO NO...&#10;Renglón 2: Aclaraciones adicionales de traslado, combustible u horario..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white uppercase resize-none leading-snug"
                      />
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-zinc-950/70 p-4 rounded-xl border border-zinc-800 space-y-2.5">
                  <div className="font-bold text-white uppercase tracking-wider text-[11px] border-b border-zinc-800 pb-2">
                    Resumen de Totales ({/USD|D[OÓ]LAR/i.test(monedaExpresada) ? 'US$ USD' : '$ ARS'})
                  </div>

                  <div className="flex items-center justify-between text-zinc-300">
                    <span>Subtotal del pedido:</span>
                    <span className="font-mono font-bold">
                      {formatCurrency(formTotals.subtotalPedido, monedaExpresada)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-zinc-300 gap-2">
                    <span>Bonificación ({/USD|D[OÓ]LAR/i.test(monedaExpresada) ? 'US$' : '$'}):</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bonificacionGlobalMonto}
                      onChange={e => setBonificacionGlobalMonto(parseFloat(e.target.value) || 0)}
                      className="w-32 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-right text-white font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-between text-zinc-200 font-semibold">
                    <span>Subtotal Neto:</span>
                    <span className="font-mono">{formatCurrency(formTotals.subtotalNeto, monedaExpresada)}</span>
                  </div>

                  <div className="flex items-center justify-between text-zinc-300 gap-2">
                    <span>Percepción IIBB ({/USD|D[OÓ]LAR/i.test(monedaExpresada) ? 'US$' : '$'}):</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={percepcionIibb}
                      onChange={e => setPercepcionIibb(parseFloat(e.target.value) || 0)}
                      className="w-32 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-right text-white font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-between text-zinc-300">
                    <span>IVA Discriminado:</span>
                    <span className="font-mono font-bold">
                      {formatCurrency(formTotals.ivaTotal, monedaExpresada)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-base font-black text-[#F0C800] border-t border-zinc-800 pt-2.5">
                    <span>Importe Total:</span>
                    <span className="font-mono">{formatCurrency(formTotals.importeTotal, monedaExpresada)}</span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingToDb}
                  className="px-6 py-2.5 bg-[#F0C800] hover:bg-amber-400 disabled:opacity-60 text-zinc-950 rounded-xl font-black shadow-lg cursor-pointer"
                >
                  {isSavingToDb
                    ? 'Guardando en Base de Datos...'
                    : editingQuotationId
                      ? 'Guardar Cambios en BD y Ver A4'
                      : 'Emitir Cotización en BD y Generar A4'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW QUOTATION A4 PREVIEW & DOWNLOAD MODAL */}
      {selectedQuotationForView && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Top Bar */}
            <div className="bg-zinc-950 px-6 py-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#F0C800]/15 text-[#F0C800] rounded-xl border border-[#F0C800]/30">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    Cotización Nº {String(selectedQuotationForView.puntoVenta).padStart(4, '0')}-
                    {String(selectedQuotationForView.numeroComprobante).padStart(8, '0')}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Cliente: {selectedQuotationForView.razonSocialReceptor} • Total:{' '}
                    {formatCurrency(
                      selectedQuotationForView.importeTotal,
                      selectedQuotationForView.monedaExpresada
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onConvertToRental && (
                  <button
                    onClick={() => {
                      const q = selectedQuotationForView;
                      setSelectedQuotationForView(null);
                      onConvertToRental(q);
                    }}
                    className="px-3 py-2 bg-[#F0C800] hover:bg-amber-400 text-zinc-950 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Truck className="w-4 h-4" />
                    Pasar a Alquiler
                  </button>
                )}
                {onInvoiceInArca && (
                  <button
                    onClick={() => {
                      const q = selectedQuotationForView;
                      setSelectedQuotationForView(null);
                      onInvoiceInArca(q);
                    }}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <DollarSign className="w-4 h-4" />
                    Facturar en ARCA
                  </button>
                )}
                {(() => {
                  const modalWaUrl = buildQuotationWhatsAppUrl(selectedQuotationForView);
                  return modalWaUrl ? (
                    <a
                      href={modalWaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <MessageCircle className="w-4 h-4" />
                      WhatsApp
                    </a>
                  ) : null;
                })()}
                <button
                  onClick={() => setIsCalibratorOpen(true)}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-4 h-4" />
                  Acomodar Campos
                </button>

                <button
                  onClick={() => {
                    const q = selectedQuotationForView;
                    setSelectedQuotationForView(null);
                    handleOpenEditModal(q);
                  }}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 border border-zinc-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                  Editar Datos
                </button>

                <button
                  onClick={() => handleDownloadPdf(selectedQuotationForView)}
                  disabled={isGeneratingPdf}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <FileDown className="w-4 h-4" />
                  {isGeneratingPdf ? 'Generando PDF...' : 'Descargar PDF A4'}
                </button>

                <button
                  onClick={() => window.print()}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 border border-zinc-700 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir
                </button>

                <button
                  onClick={() => setSelectedQuotationForView(null)}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* A4 Sheet Live Preview */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-zinc-950 flex justify-center">
              <div
                ref={viewContainerRef}
                className="relative w-full max-w-2xl bg-white border border-zinc-400 shadow-2xl select-none h-fit"
              >
                <img
                  src={templateImgSrc}
                  alt="Plantilla Cotización A4"
                  className="w-full h-auto block"
                  onError={() => {
                    if (templateImgSrc !== QUOTATION_TEMPLATE_IMAGE_CDN) {
                      setTemplateImgSrc(QUOTATION_TEMPLATE_IMAGE_CDN);
                    }
                  }}
                  onLoad={() => {
                    if (viewContainerRef.current) {
                      setViewContainerWidth(viewContainerRef.current.clientWidth);
                    }
                  }}
                />

                {/* 1:1 Calibrated Fields Overlay */}
                <div
                  className="absolute inset-0 pointer-events-none leading-tight text-slate-900"
                  style={{ fontFamily: templateLayout.fontFamily }}
                >
                  {/* Comp. Nro */}
                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.numComprobante.y}%`,
                      left: `${templateLayout.numComprobante.x}%`,
                      fontSize: getViewFs(templateLayout.numComprobante.fontSize),
                      fontWeight: templateLayout.numComprobante.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {String(selectedQuotationForView.puntoVenta).padStart(4, '0')}-
                    {String(selectedQuotationForView.numeroComprobante).padStart(8, '0')}
                  </div>

                  {/* Fecha de Emisión */}
                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.fechaEmision.y}%`,
                      left: `${templateLayout.fechaEmision.x}%`,
                      fontSize: getViewFs(templateLayout.fechaEmision.fontSize),
                      fontWeight: templateLayout.fechaEmision.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {formatDateDisplay(selectedQuotationForView.fechaEmision)}
                  </div>

                  {/* Válido Hasta */}
                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.validoHasta.y}%`,
                      left: `${templateLayout.validoHasta.x}%`,
                      fontSize: getViewFs(templateLayout.validoHasta.fontSize),
                      fontWeight: templateLayout.validoHasta.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {formatDateDisplay(selectedQuotationForView.validoHasta)}
                  </div>

                  {/* Razón Social */}
                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.razonSocial.y}%`,
                      left: `${templateLayout.razonSocial.x}%`,
                      fontSize: getViewFs(templateLayout.razonSocial.fontSize),
                      fontWeight: templateLayout.razonSocial.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {selectedQuotationForView.razonSocialReceptor}
                  </div>

                  {/* Domicilio */}
                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.domicilio.y}%`,
                      left: `${templateLayout.domicilio.x}%`,
                      fontSize: getViewFs(templateLayout.domicilio.fontSize),
                      fontWeight: templateLayout.domicilio.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {selectedQuotationForView.domicilioReceptor}
                  </div>

                  {/* Zona */}
                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.zona.y}%`,
                      left: `${templateLayout.zona.x}%`,
                      fontSize: getViewFs(templateLayout.zona.fontSize),
                      fontWeight: templateLayout.zona.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {selectedQuotationForView.zonaReceptor}
                  </div>

                  {/* Localidad */}
                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.localidad.y}%`,
                      left: `${templateLayout.localidad.x}%`,
                      fontSize: getViewFs(templateLayout.localidad.fontSize),
                      fontWeight: templateLayout.localidad.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {selectedQuotationForView.localidadReceptor}
                  </div>

                  {/* CUIT Receptor */}
                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.cuitReceptor.y}%`,
                      left: `${templateLayout.cuitReceptor.x}%`,
                      fontSize: getViewFs(templateLayout.cuitReceptor.fontSize),
                      fontWeight: templateLayout.cuitReceptor.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {selectedQuotationForView.cuitReceptor}
                  </div>

                  {/* Teléfono Receptor */}
                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.telefonoReceptor.y}%`,
                      left: `${templateLayout.telefonoReceptor.x}%`,
                      fontSize: getViewFs(templateLayout.telefonoReceptor.fontSize),
                      fontWeight: templateLayout.telefonoReceptor.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {selectedQuotationForView.telefonoReceptor}
                  </div>

                  {/* Table Items */}
                  <div
                    className="absolute left-0 right-0 flex flex-col"
                    style={{
                      top: `${templateLayout.tableStartY}%`,
                      fontSize: getViewFs(templateLayout.tableFontSize)
                    }}
                  >
                    {selectedQuotationForView.items.map((it, i) => {
                      const symView = /USD|D[OÓ]LAR/i.test(selectedQuotationForView.monedaExpresada || '')
                        ? 'US$ '
                        : '$';
                      return (
                        <div
                          key={i}
                          className="relative w-full"
                          style={{ height: `${(templateLayout.tableRowHeight || 2.8) * 9 * viewScale}px` }}
                        >
                          <span
                            className="absolute"
                            style={{ left: `${templateLayout.tableColCodigoX}%` }}
                          >
                            {it.codigo || `00${i + 1}`}
                          </span>
                          <span
                            className="absolute uppercase truncate max-w-[36%]"
                            style={{ left: `${templateLayout.tableColDescripcionX}%` }}
                          >
                            {it.descripcion}
                            {it.observacionLinea ? ` (${it.observacionLinea})` : ''}
                          </span>
                          <span
                            className="absolute"
                            style={{ left: `${templateLayout.tableColCantidadX}%` }}
                          >
                            {it.cantidad.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            {it.unidadMedida ? ` ${it.unidadMedida.toUpperCase()}` : ''}
                          </span>
                          <span
                            className="absolute"
                            style={{ left: `${templateLayout.tableColPrecioX}%` }}
                          >
                            {symView}{it.precioUnitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </span>
                          <span
                            className="absolute font-semibold"
                            style={{ left: `${templateLayout.tableColImporteX}%` }}
                          >
                            {symView}{it.importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom Left Metadata */}
                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.condicionVenta.y}%`,
                      left: `${templateLayout.condicionVenta.x}%`,
                      fontSize: getViewFs(templateLayout.condicionVenta.fontSize),
                      fontWeight: templateLayout.condicionVenta.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {selectedQuotationForView.condicionVenta}
                  </div>

                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.monedaExpresada.y}%`,
                      left: `${templateLayout.monedaExpresada.x}%`,
                      fontSize: getViewFs(templateLayout.monedaExpresada.fontSize),
                      fontWeight: templateLayout.monedaExpresada.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {selectedQuotationForView.monedaExpresada}
                  </div>

                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.nombreVendedor.y}%`,
                      left: `${templateLayout.nombreVendedor.x}%`,
                      fontSize: getViewFs(templateLayout.nombreVendedor.fontSize),
                      fontWeight: templateLayout.nombreVendedor.isBold ? 'bold' : 'normal'
                    }}
                  >
                    {selectedQuotationForView.nombreVendedor}
                  </div>

                  {(() => {
                    const [obsLine1, obsLine2] = splitObservacionesTwoLines(selectedQuotationForView.observaciones, 62);
                    return (
                      <>
                        <div
                          className="absolute whitespace-nowrap"
                          style={{
                            top: `${templateLayout.observaciones.y}%`,
                            left: `${templateLayout.observaciones.x}%`,
                            fontSize: getViewFs(templateLayout.observaciones.fontSize),
                            fontWeight: templateLayout.observaciones.isBold ? 'bold' : 'normal'
                          }}
                        >
                          {obsLine1}
                        </div>
                        {obsLine2 && (
                          <div
                            className="absolute whitespace-nowrap"
                            style={{
                              top: `${templateLayout.observaciones.y + 1.35}%`,
                              left: `${templateLayout.observaciones.x}%`,
                              fontSize: getViewFs(templateLayout.observaciones.fontSize),
                              fontWeight: templateLayout.observaciones.isBold ? 'bold' : 'normal'
                            }}
                          >
                            {obsLine2}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Totals Breakdown */}
                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.totalsSubtotalY}%`,
                      right: `${100 - templateLayout.totalsX}%`,
                      fontSize: getViewFs(templateLayout.totalsFontSize)
                    }}
                  >
                    {selectedQuotationForView.subtotalPedido.toLocaleString('es-AR', {
                      minimumFractionDigits: 2
                    })}
                  </div>

                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.totalsBonifY}%`,
                      right: `${100 - templateLayout.totalsX}%`,
                      fontSize: getViewFs(templateLayout.totalsFontSize)
                    }}
                  >
                    {selectedQuotationForView.bonificacionTotal.toLocaleString('es-AR', {
                      minimumFractionDigits: 2
                    })}
                  </div>

                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.totalsSubtotalNetoY}%`,
                      right: `${100 - templateLayout.totalsX}%`,
                      fontSize: getViewFs(templateLayout.totalsFontSize)
                    }}
                  >
                    {selectedQuotationForView.subtotalNeto.toLocaleString('es-AR', {
                      minimumFractionDigits: 2
                    })}
                  </div>

                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.totalsIibbY}%`,
                      right: `${100 - templateLayout.totalsX}%`,
                      fontSize: getViewFs(templateLayout.totalsFontSize)
                    }}
                  >
                    {selectedQuotationForView.percepcionIibb.toLocaleString('es-AR', {
                      minimumFractionDigits: 2
                    })}
                  </div>

                  <div
                    className="absolute"
                    style={{
                      top: `${templateLayout.totalsIvaY}%`,
                      right: `${100 - templateLayout.totalsX}%`,
                      fontSize: getViewFs(templateLayout.totalsFontSize)
                    }}
                  >
                    {selectedQuotationForView.ivaTotal.toLocaleString('es-AR', {
                      minimumFractionDigits: 2
                    })}
                  </div>

                  <div
                    className="absolute font-bold"
                    style={{
                      top: `${templateLayout.totalsTotalY}%`,
                      right: `${100 - templateLayout.totalsX}%`,
                      fontSize: getViewFs(templateLayout.totalsFontSize + 1)
                    }}
                  >
                    {selectedQuotationForView.importeTotal.toLocaleString('es-AR', {
                      minimumFractionDigits: 2
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {quotationToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 bg-rose-500/15 rounded-xl border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-white">¿Eliminar esta Cotización?</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Se eliminará permanentemente la cotización{' '}
              <strong className="text-[#F0C800]">
                {String(quotationToDelete.puntoVenta).padStart(4, '0')}-
                {String(quotationToDelete.numeroComprobante).padStart(8, '0')}
              </strong>{' '}
              de <strong>{quotationToDelete.razonSocialReceptor}</strong> de la base de datos.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setQuotationToDelete(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black cursor-pointer"
              >
                Sí, Eliminar Cotización
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VISUAL CALIBRATOR MODAL */}
      {isCalibratorOpen && (
        <QuotationTemplateCalibratorModal
          layout={templateLayout}
          onSaveLayout={newLayout => {
            setTemplateLayout(newLayout);
            saveQuotationTemplateLayout(newLayout);
          }}
          onClose={() => setIsCalibratorOpen(false)}
          sampleQuotation={selectedQuotationForView || quotations[0]}
        />
      )}
    </div>
  );
};
