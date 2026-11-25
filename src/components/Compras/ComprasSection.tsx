import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Building2, 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  DollarSign, 
  Calendar, 
  FileCheck, 
  Layers, 
  Download, 
  Eye, 
  Trash2, 
  Fuel, 
  ShoppingBag, 
  Wrench, 
  X,
  CreditCard,
  ExternalLink,
  Receipt,
  FileSpreadsheet,
  Edit2,
  Upload,
  Check,
  Percent,
  Paperclip,
  Link2,
  CheckSquare,
  Square,
  FileUp,
  FileCode,
  ImageIcon,
  Banknote
} from 'lucide-react';
import { 
  Proveedor, 
  PurchaseInvoice, 
  PurchaseInvoiceCategory,
  PurchaseInvoiceItem, 
  PurchaseItemType,
  PurchaseAttachment,
  SupplierPayment, 
  ChequeCarteraItem,
  FuelDispensary, 
  Vehicle,
  StockItem,
  StockUnit,
  StockWarehouse,
  StockWarehouseType,
  StockCategoryCustom,
  StockControlMode
} from '../../types';
import { ConfirmDeleteModal } from '../ConfirmDeleteModal';
import { uploadFileToCloudflareR2 } from '../../services/api';
import { loadFuelPrices, saveFuelPriceStrict } from '../../services/storage';

const EMPTY_STOCK_ITEMS: StockItem[] = [];
const EMPTY_STOCK_WAREHOUSES: StockWarehouse[] = [];
const EMPTY_STOCK_CATEGORIES: StockCategoryCustom[] = [];

const EXTRA_PURCHASE_STOCK_RUBROS = [
  'Grasas y Lubricantes',
  'Aceites de Motor',
  'Aceites Hidráulicos',
  'Aceites de Transmisión (UTTO)',
  'Refrigerantes y Anti-congelantes',
  'Filtros y Cortafuegos',
  'Repuestos Taller',
  'Insumos Taller',
  'Herramientas de Mano (Pinzas, Llaves)',
  'Herramientas de Obra y Máquinas',
  'Bienes de Cambio / Local',
  'Mercadería Depósito Ventas',
  'Indumentaria / EPP',
  'Librería / Insumos de Oficina',
  'Varios / Otros'
];

const getDefaultControlModeForCategory = (cat: PurchaseInvoiceCategory): StockControlMode => {
  if (cat === 'LUBRICANTES' || cat === 'MANTENIMIENTO_FILTROS' || cat === 'BIENES_CAMBIO_LOCAL' || cat === 'INDUMENTARIA') {
    return 'STOCK_FRACCIONABLE';
  }
  return 'SIN_STOCK';
};

const getDefaultRubroForPurchaseCategory = (cat: PurchaseInvoiceCategory): string => {
  switch (cat) {
    case 'LUBRICANTES': return 'Grasas y Lubricantes';
    case 'MANTENIMIENTO_FILTROS': return 'Filtros y Cortafuegos';
    case 'BIENES_CAMBIO_LOCAL': return 'Bienes de Cambio / Local';
    case 'INDUMENTARIA': return 'Indumentaria / EPP';
    case 'LIBRERIA_INSUMOS': return 'Librería / Insumos de Oficina';
    default: return 'Insumos Taller';
  }
};

const PURCHASE_CATEGORIES: Array<{
  id: PurchaseInvoiceCategory;
  label: string;
  shortLabel: string;
  defaultItemType: PurchaseItemType;
  defaultUnit: string;
  badgeClass: string;
}> = [
  {
    id: 'COMBUSTIBLE',
    label: 'Combustible',
    shortLabel: 'Combustible',
    defaultItemType: 'COMBUSTIBLE',
    defaultUnit: 'L',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40'
  },
  {
    id: 'LUBRICANTES',
    label: 'Grasas y Aceites',
    shortLabel: 'Grasas / Aceites',
    defaultItemType: 'LUBRICANTE',
    defaultUnit: 'UNI',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/40'
  },
  {
    id: 'MANTENIMIENTO_FILTROS',
    label: 'Mantenimiento y Filtros',
    shortLabel: 'Mant. / Filtros',
    defaultItemType: 'MANTENIMIENTO_FILTROS',
    defaultUnit: 'UNI',
    badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/40'
  },
  {
    id: 'BIENES_CAMBIO_LOCAL',
    label: 'Bienes de Cambio (Local)',
    shortLabel: 'Bienes de Cambio',
    defaultItemType: 'BIENES_CAMBIO',
    defaultUnit: 'UNI',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/40'
  },
  {
    id: 'INDUMENTARIA',
    label: 'Indumentaria / EPP',
    shortLabel: 'Indumentaria',
    defaultItemType: 'INDUMENTARIA',
    defaultUnit: 'UNI',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
  },
  {
    id: 'LIBRERIA_INSUMOS',
    label: 'Librería / Cuadernos',
    shortLabel: 'Librería / Oficina',
    defaultItemType: 'LIBRERIA_INSUMOS',
    defaultUnit: 'UNI',
    badgeClass: 'bg-pink-500/15 text-pink-300 border-pink-500/40'
  },
  {
    id: 'OTROS',
    label: 'Otros / Servicios',
    shortLabel: 'Otros',
    defaultItemType: 'OTRO',
    defaultUnit: 'UNI',
    badgeClass: 'bg-slate-700/40 text-slate-300 border-slate-600/50'
  }
];

const PURCHASE_ITEM_TYPES: Record<PurchaseItemType, { label: string; badge: string; badgeClass: string }> = {
  COMBUSTIBLE: { label: 'Combustible', badge: 'COMB', badgeClass: 'bg-amber-500/10 text-amber-400' },
  LUBRICANTE: { label: 'Grasa / Aceite', badge: 'GRASA/LUB', badgeClass: 'bg-blue-500/10 text-blue-400' },
  MANTENIMIENTO_FILTROS: { label: 'Mantenimiento / Filtros', badge: 'MANT/FILT', badgeClass: 'bg-orange-500/10 text-orange-400' },
  REPUESTO: { label: 'Repuesto', badge: 'REPUESTO', badgeClass: 'bg-yellow-500/10 text-yellow-400' },
  BIENES_CAMBIO: { label: 'Bienes de Cambio (Local)', badge: 'BIEN CAMBIO', badgeClass: 'bg-purple-500/10 text-purple-400' },
  INDUMENTARIA: { label: 'Indumentaria / EPP', badge: 'INDUMENT.', badgeClass: 'bg-cyan-500/10 text-cyan-400' },
  LIBRERIA_INSUMOS: { label: 'Librería / Insumos', badge: 'LIBRERÍA', badgeClass: 'bg-pink-500/10 text-pink-400' },
  SERVICE: { label: 'Servicio / Mano de Obra', badge: 'SERVICIO', badgeClass: 'bg-emerald-500/10 text-emerald-400' },
  OTRO: { label: 'Otro', badge: 'OTRO', badgeClass: 'bg-slate-700/60 text-slate-300' }
};

const getCategoryMeta = (cat?: PurchaseInvoiceCategory) => {
  return PURCHASE_CATEGORIES.find(c => c.id === cat) || PURCHASE_CATEGORIES[PURCHASE_CATEGORIES.length - 1];
};

const inferInvoiceCategory = (inv: PurchaseInvoice): PurchaseInvoiceCategory => {
  if (inv.categoriaCompra) return inv.categoriaCompra;
  const types = new Set((inv.items || []).map(it => it.tipoItem));
  if (types.has('COMBUSTIBLE') || (inv.remitosAsociadosIds && inv.remitosAsociadosIds.length > 0)) return 'COMBUSTIBLE';
  if (types.has('LUBRICANTE')) return 'LUBRICANTES';
  if (types.has('MANTENIMIENTO_FILTROS') || types.has('REPUESTO')) return 'MANTENIMIENTO_FILTROS';
  if (types.has('BIENES_CAMBIO')) return 'BIENES_CAMBIO_LOCAL';
  if (types.has('INDUMENTARIA')) return 'INDUMENTARIA';
  if (types.has('LIBRERIA_INSUMOS')) return 'LIBRERIA_INSUMOS';
  return 'OTROS';
};

interface ComprasSectionProps {
  proveedores: Proveedor[];
  purchaseInvoices: PurchaseInvoice[];
  supplierPayments: SupplierPayment[];
  chequesCartera?: ChequeCarteraItem[];
  fuelVouchers: FuelDispensary[];
  fleet: Vehicle[];
  stockItems?: StockItem[];
  stockWarehouses?: StockWarehouse[];
  stockCategories?: StockCategoryCustom[];
  onCreateStockItem?: (item: StockItem) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
  onCreateWarehouse?: (warehouse: StockWarehouse) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
  onSaveInvoice: (invoice: PurchaseInvoice, options?: { applyStockAndExpenses?: boolean }) => Promise<boolean | void> | boolean | void;
  onDeleteInvoice: (id: string) => void;
  onSavePayment: (payment: SupplierPayment) => Promise<void> | void;
  onEndorseChequesToSupplier?: (params: {
    cheques: ChequeCarteraItem[];
    proveedor: Proveedor;
    fechaEndoso: string;
    facturasCompraIds: string[];
    observaciones?: string;
  }) => Promise<boolean | void> | void;
  onSaveProveedor: (proveedor: Proveedor) => void;
  onShowToast: (msg: string) => void;
  onNavigateToCarteraCheques?: () => void;
  initialTab?: 'facturas' | 'ctacte' | 'libro_iva' | 'proveedores' | 'pagos';
}

export const ComprasSection: React.FC<ComprasSectionProps> = ({
  proveedores,
  purchaseInvoices,
  supplierPayments,
  chequesCartera = [],
  fuelVouchers,
  fleet,
  stockItems = EMPTY_STOCK_ITEMS,
  stockWarehouses = EMPTY_STOCK_WAREHOUSES,
  stockCategories = EMPTY_STOCK_CATEGORIES,
  onCreateStockItem,
  onCreateWarehouse,
  onSaveInvoice,
  onDeleteInvoice,
  onSavePayment,
  onEndorseChequesToSupplier,
  onSaveProveedor,
  onShowToast,
  onNavigateToCarteraCheques,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<'facturas' | 'ctacte' | 'libro_iva' | 'proveedores' | 'pagos'>(initialTab || 'facturas');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProveedor, setFilterProveedor] = useState('TODOS');
  const [filterEstado, setFilterEstado] = useState('TODOS');
  const [filterCategoria, setFilterCategoria] = useState<'TODOS' | PurchaseInvoiceCategory>('TODOS');

  // Supplier Modal States
  const [isProveedorModalOpen, setIsProveedorModalOpen] = useState(false);
  const [editingProveedor, setEditingProveedor] = useState<Proveedor | null>(null);

  // Form states for Proveedor
  const [provCodigo, setProvCodigo] = useState('');
  const [provRazonSocial, setProvRazonSocial] = useState('');
  const [provCuit, setProvCuit] = useState('');
  const [provCondicionIva, setProvCondicionIva] = useState('Responsable Inscripto');
  const [provRubro, setProvRubro] = useState('COMBUSTIBLES_LUBRICANTES');
  const [provDireccion, setProvDireccion] = useState('');
  const [provLocalidad, setProvLocalidad] = useState('');
  const [provTelefono, setProvTelefono] = useState('');
  const [provAplicaRetenciones, setProvAplicaRetenciones] = useState(false);
  const [provCalculaPercepciones, setProvCalculaPercepciones] = useState(false);
  const [provIncluyeIvaCompras, setProvIncluyeIvaCompras] = useState(true);

  // Invoice Modal & Legajo States
  const [isNewInvoiceModalOpen, setIsNewInvoiceModalOpen] = useState(false);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [selectedInvoiceForLegajo, setSelectedInvoiceForLegajo] = useState<PurchaseInvoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedProveedorForCtaCte, setSelectedProveedorForCtaCte] = useState<Proveedor | null>(null);

  // Validation & Top Alert Banner States
  const formTopRef = useRef<HTMLDivElement | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [validationBannerMessages, setValidationBannerMessages] = useState<string[]>([]);

  // Depósitos y Rubros del Sistema (Catálogos desplegables sin tipeo libre)
  const availableWarehouses = useMemo(() => {
    return stockWarehouses;
  }, [stockWarehouses]);

  const availableRubrosDropdown = useMemo(() => {
    const set = new Set<string>();
    stockCategories.forEach(c => {
      if (c.nombre?.trim()) set.add(c.nombre.trim());
    });
    EXTRA_PURCHASE_STOCK_RUBROS.forEach(r => set.add(r));
    return Array.from(set);
  }, [stockCategories]);

  // Quick Catalog Creation Modal States (Artículo / Combustible)
  const [fuelCatalogVersion, setFuelCatalogVersion] = useState(0);
  const [quickCatalogModal, setQuickCatalogModal] = useState<{
    open: boolean;
    mode: 'ARTICULO' | 'COMBUSTIBLE';
    targetLineIdx: number;
  }>({ open: false, mode: 'ARTICULO', targetLineIdx: 0 });
  const quickArtMode = quickCatalogModal.mode;
  const [quickArtCodigo, setQuickArtCodigo] = useState('');
  const [quickArtNombre, setQuickArtNombre] = useState('');
  const [quickArtCategoria, setQuickArtCategoria] = useState('Filtros y Cortafuegos');
  const [quickArtUnidad, setQuickArtUnidad] = useState<StockUnit>('UNIDAD');
  const [quickArtPrecio, setQuickArtPrecio] = useState(0);
  const [quickArtStockMin, setQuickArtStockMin] = useState(0);
  const [quickArtControlMode, setQuickArtControlMode] = useState<StockControlMode>('STOCK_FRACCIONABLE');
  const [quickArtDepositoId, setQuickArtDepositoId] = useState('DEP-TALLER');
  const [quickArtError, setQuickArtError] = useState('');
  const [isSavingQuickArt, setIsSavingQuickArt] = useState(false);

  // Quick Sub-Warehouse Creation Modal States (Sub-depósitos de Taller / Ventas / Personalizado)
  const [quickWarehouseModal, setQuickWarehouseModal] = useState<{
    open: boolean;
    targetScope: 'QUICK_ART' | number | null;
  }>({ open: false, targetScope: null });
  const [quickWhNombre, setQuickWhNombre] = useState('');
  const [quickWhTipo, setQuickWhTipo] = useState<StockWarehouseType>('TALLER');
  const [quickWhUbicacion, setQuickWhUbicacion] = useState('');
  const [quickWhError, setQuickWhError] = useState('');
  const [isSavingQuickWh, setIsSavingQuickWh] = useState(false);

  // Catálogo real de tipos de combustible del sistema + vales existentes
  const availableFuelCatalog = useMemo(() => {
    const prices = loadFuelPrices();
    const typeSet = new Set<string>(Object.keys(prices));
    fuelVouchers.forEach(v => {
      const raw = (v.tipoComb || '').trim().toUpperCase();
      if (raw) typeSet.add(raw);
    });
    return {
      types: Array.from(typeSet),
      prices
    };
  }, [fuelVouchers, isNewInvoiceModalOpen, fuelCatalogVersion]);

  // Form states for New Invoice
  const [formCategoriaCompra, setFormCategoriaCompra] = useState<PurchaseInvoiceCategory>('COMBUSTIBLE');
  const [formPuntoVenta, setFormPuntoVenta] = useState('0019');
  const [formNumeroComp, setFormNumeroComp] = useState('');
  const [formTipoComp, setFormTipoComp] = useState<PurchaseInvoice['tipoComprobante']>('FACTURA_A');
  const [formFecha, setFormFecha] = useState(new Date().toISOString().slice(0, 10));
  const [formProveedorId, setFormProveedorId] = useState(proveedores[0]?.id || '');
  const [formItems, setFormItems] = useState<Array<{
    codigo: string;
    descripcion: string;
    cantidad: number;
    unidadMedida: string;
    precioUnitario: number;
    subtotal: number;
    tipoItem: PurchaseItemType;
    tipoCombustible?: string;
    stockItemId?: string;
    modoImputacion?: StockControlMode;
    depositoId?: string;
    depositoNombre?: string;
    equipoId?: string;
    equipoLabel?: string;
  }>>([
    { codigo: '', descripcion: 'DIESEL COMUN', cantidad: 0, unidadMedida: 'L', precioUnitario: 0, subtotal: 0, tipoItem: 'COMBUSTIBLE', tipoCombustible: 'DIESEL COMUN' }
  ]);
  const [formIvaManual, setFormIvaManual] = useState<number | null>(null);
  const [formIcl, setFormIcl] = useState(0);
  const [formIdc, setFormIdc] = useState(0);
  const [formTasaVial, setFormTasaVial] = useState(0);
  const [formPercepcionIibb, setFormPercepcionIibb] = useState(0);
  const [formPercepcionIva, setFormPercepcionIva] = useState(0);
  const [formAjusteRedondeo, setFormAjusteRedondeo] = useState(0);
  const [formSelectedRemitos, setFormSelectedRemitos] = useState<string[]>([]);
  const [formPdfUrl, setFormPdfUrl] = useState('');
  const [formArchivosAdjuntos, setFormArchivosAdjuntos] = useState<PurchaseAttachment[]>([]);

  // Dedicated Linking Modal States
  const [linkingInvoice, setLinkingInvoice] = useState<PurchaseInvoice | null>(null);
  const [tempLinkedRemitos, setTempLinkedRemitos] = useState<string[]>([]);
  const [remitoSearchTerm, setRemitoSearchTerm] = useState('');
  const [remitoFilterMode, setRemitoFilterMode] = useState<'TODOS' | 'PENDIENTES' | 'SELECCIONADOS'>('TODOS');

  // File upload handlers for New Invoice Form (Cloudflare R2)
  const handleFileUploadForForm = async (e: React.ChangeEvent<HTMLInputElement>, tipo: PurchaseAttachment['tipo']) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (file.size > 15 * 1024 * 1024) {
        onShowToast(`"${file.name}" supera el límite de 15 MB para Cloudflare R2.`);
        continue;
      }
      const res = await uploadFileToCloudflareR2(
        file,
        file.name,
        file.type || 'application/octet-stream',
        'compras-legajos'
      );
      if (!res.success || !res.url) {
        onShowToast(res.error || `Error subiendo "${file.name}" a Cloudflare R2`);
        continue;
      }
      const sizeKB = Math.max(1, Math.round(file.size / 1024));
      const newAtt: PurchaseAttachment = {
        id: `ATT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        nombre: file.name,
        url: res.url,
        tipo,
        fechaSubida: new Date().toISOString().slice(0, 10),
        tamanio: `${sizeKB} KB`
      };
      setFormArchivosAdjuntos(prev => [...prev, newAtt]);
      if (tipo === 'FACTURA' && !formPdfUrl) {
        setFormPdfUrl(res.url);
      }
      onShowToast(`"${file.name}" subido a Cloudflare R2.`);
    }
    e.target.value = '';
  };

  const handleRemoveFormAttachment = (id: string) => {
    setFormArchivosAdjuntos(prev => prev.filter(a => a.id !== id));
  };

  // File upload handlers for existing Legajo modal (Cloudflare R2)
  const handleAddAttachmentToLegajo = async (invoice: PurchaseInvoice, e: React.ChangeEvent<HTMLInputElement>, tipo: PurchaseAttachment['tipo']) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let currentInvoice = invoice;
    for (const file of Array.from(files)) {
      if (file.size > 15 * 1024 * 1024) {
        onShowToast(`"${file.name}" supera el límite de 15 MB para Cloudflare R2.`);
        continue;
      }
      const res = await uploadFileToCloudflareR2(
        file,
        file.name,
        file.type || 'application/octet-stream',
        'compras-legajos'
      );
      if (!res.success || !res.url) {
        onShowToast(res.error || `Error subiendo "${file.name}" a Cloudflare R2`);
        continue;
      }
      const sizeKB = Math.max(1, Math.round(file.size / 1024));
      const newAtt: PurchaseAttachment = {
        id: `ATT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        nombre: file.name,
        url: res.url,
        tipo,
        fechaSubida: new Date().toISOString().slice(0, 10),
        tamanio: `${sizeKB} KB`
      };
      const updatedList = [...(currentInvoice.archivosAdjuntos || []), newAtt];
      const updatedInvoice: PurchaseInvoice = {
        ...currentInvoice,
        archivosAdjuntos: updatedList,
        archivoPdfUrl: tipo === 'FACTURA' ? res.url : (currentInvoice.archivoPdfUrl || res.url)
      };
      currentInvoice = updatedInvoice;
      onSaveInvoice(updatedInvoice);
      setSelectedInvoiceForLegajo(updatedInvoice);
      onShowToast(`"${file.name}" guardado en Cloudflare R2 y vinculado a ${invoice.nroComprobanteCompleto}`);
    }
    e.target.value = '';
  };

  const [attachmentToDelete, setAttachmentToDelete] = useState<{ invoice: PurchaseInvoice; attachmentId: string; nombre: string } | null>(null);

  const handleDeleteAttachmentFromLegajo = (invoice: PurchaseInvoice, attachmentId: string) => {
    const att = (invoice.archivosAdjuntos || []).find(a => a.id === attachmentId);
    setAttachmentToDelete({
      invoice,
      attachmentId,
      nombre: att?.nombre || 'Documento adjunto'
    });
  };

  const confirmDeleteAttachmentFromLegajo = () => {
    if (!attachmentToDelete) return;
    const { invoice, attachmentId } = attachmentToDelete;
    const updatedList = (invoice.archivosAdjuntos || []).filter(a => a.id !== attachmentId);
    const updatedInvoice: PurchaseInvoice = {
      ...invoice,
      archivosAdjuntos: updatedList
    };
    onSaveInvoice(updatedInvoice);
    setSelectedInvoiceForLegajo(updatedInvoice);
    setAttachmentToDelete(null);
    onShowToast('Documento eliminado del legajo.');
  };

  // Helper to extract clean voucher identifier
  const getVoucherKey = (v: FuelDispensary): string => {
    return String(v.numTicket || v.numComprobante || v.numOrden || v.id).trim();
  };

  // Set of all remitos already associated with any invoice in the system
  const allLinkedRemitosSet = useMemo(() => {
    const set = new Set<string>();
    purchaseInvoices.forEach(inv => {
      (inv.remitosAsociadosIds || []).forEach(r => set.add(r));
    });
    return set;
  }, [purchaseInvoices]);

  // Form states for Payment
  const [payProveedorId, setPayProveedorId] = useState(proveedores[0]?.id || '');
  const [payFecha, setPayFecha] = useState(new Date().toISOString().split('T')[0]);
  const [payMonto, setPayMonto] = useState(0);
  const [payFormaPago, setPayFormaPago] = useState<'TRANSFERENCIA' | 'CHEQUE' | 'CHEQUE_ENDOSADO' | 'EFECTIVO_CAJA' | 'OTROS'>('TRANSFERENCIA');
  const [payBancoOrigen, setPayBancoOrigen] = useState('');
  const [payComprobante, setPayComprobante] = useState('');
  const [payObservaciones, setPayObservaciones] = useState('');
  const [payFacturasImputadas, setPayFacturasImputadas] = useState<string[]>([]);
  const [paySelectedChequeIds, setPaySelectedChequeIds] = useState<string[]>([]);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  const availableChequesEnCartera = useMemo(
    () =>
      chequesCartera
        .filter(c => c.estado === 'EN_CARTERA')
        .sort((a, b) => (a.fechaCobro || '').localeCompare(b.fechaCobro || '')),
    [chequesCartera]
  );

  const pendingInvoicesForPayProveedor = useMemo(() => {
    if (!payProveedorId) return [];
    const prov = proveedores.find(p => p.id === payProveedorId);
    return purchaseInvoices.filter(
      inv =>
        (inv.proveedorId === payProveedorId || (prov?.cuit && inv.proveedorCuit === prov.cuit)) &&
        inv.estado !== 'PAGADO' &&
        inv.saldoPendiente > 0
    );
  }, [purchaseInvoices, payProveedorId, proveedores]);

  const openPaymentModal = (opts?: { proveedorId?: string; invoiceId?: string }) => {
    const defaultProvId =
      opts?.proveedorId ||
      proveedores.find(p =>
        purchaseInvoices.some(inv => inv.proveedorId === p.id && inv.estado !== 'PAGADO' && inv.saldoPendiente > 0)
      )?.id ||
      proveedores[0]?.id ||
      '';
    setPayProveedorId(defaultProvId);
    setPayFecha(new Date().toISOString().split('T')[0]);
    setPayFormaPago('TRANSFERENCIA');
    setPayBancoOrigen('');
    setPayComprobante('');
    setPayObservaciones('');
    setPaySelectedChequeIds([]);
    if (opts?.invoiceId) {
      const targetInv = purchaseInvoices.find(i => i.id === opts.invoiceId);
      setPayFacturasImputadas([opts.invoiceId]);
      setPayMonto(Number((targetInv?.saldoPendiente || targetInv?.montoTotal || 0).toFixed(2)));
    } else {
      setPayFacturasImputadas([]);
      setPayMonto(0);
    }
    setIsPaymentModalOpen(true);
  };

  const handleTogglePayInvoice = (inv: PurchaseInvoice) => {
    const nextIds = payFacturasImputadas.includes(inv.id)
      ? payFacturasImputadas.filter(id => id !== inv.id)
      : [...payFacturasImputadas, inv.id];
    setPayFacturasImputadas(nextIds);
    if (payFormaPago !== 'CHEQUE_ENDOSADO') {
      const sum = purchaseInvoices
        .filter(i => nextIds.includes(i.id))
        .reduce((s, i) => s + Number(i.saldoPendiente || i.montoTotal || 0), 0);
      setPayMonto(Number(sum.toFixed(2)));
    }
  };

  const handleToggleEndorseCheque = (ch: ChequeCarteraItem) => {
    const nextIds = paySelectedChequeIds.includes(ch.id)
      ? paySelectedChequeIds.filter(id => id !== ch.id)
      : [...paySelectedChequeIds, ch.id];
    setPaySelectedChequeIds(nextIds);
    const chosen = availableChequesEnCartera.filter(c => nextIds.includes(c.id));
    const total = chosen.reduce((s, c) => s + Number(c.importe || 0), 0);
    setPayMonto(Number(total.toFixed(2)));
    setPayComprobante(
      chosen.map(c => `${c.tipo === 'ECHEQ' ? 'E-Cheq' : 'Chq'} #${c.numeroCheque}`).join(', ')
    );
  };

  const handleSubmitSupplierPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const prov = proveedores.find(p => p.id === payProveedorId);
    if (!prov) {
      onShowToast('Seleccioná un proveedor válido.');
      return;
    }

    if (payFormaPago === 'CHEQUE_ENDOSADO') {
      const chosenCheques = availableChequesEnCartera.filter(c => paySelectedChequeIds.includes(c.id));
      if (chosenCheques.length === 0) {
        onShowToast('Seleccioná al menos un cheque en cartera para endosar al proveedor.');
        return;
      }
      if (!onEndorseChequesToSupplier) {
        onShowToast('La integración de endoso de cartera no está disponible.');
        return;
      }
      setIsSavingPayment(true);
      try {
        await Promise.resolve(
          onEndorseChequesToSupplier({
            cheques: chosenCheques,
            proveedor: prov,
            fechaEndoso: payFecha,
            facturasCompraIds: payFacturasImputadas,
            observaciones: payObservaciones.trim() || undefined,
          })
        );
        setIsPaymentModalOpen(false);
      } finally {
        setIsSavingPayment(false);
      }
      return;
    }

    if (Number(payMonto) <= 0) {
      onShowToast('Ingresá un monto de pago mayor a cero.');
      return;
    }

    setIsSavingPayment(true);
    try {
      const paymentId = `OP-${Date.now().toString().slice(-6)}`;
      const payment: SupplierPayment = {
        id: paymentId,
        fecha: payFecha,
        proveedorId: prov.id,
        proveedorNombre: prov.razonSocial,
        proveedorCuit: prov.cuit,
        montoTotal: Number(Number(payMonto).toFixed(2)),
        formaPago: payFormaPago,
        bancoOrigen: payBancoOrigen.trim() || undefined,
        numeroComprobantePago: payComprobante.trim() || undefined,
        facturasImputadasIds: payFacturasImputadas,
        observaciones: payObservaciones.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      await Promise.resolve(onSavePayment(payment));

      // Actualizar saldo pendiente de las facturas imputadas
      if (payFacturasImputadas.length > 0) {
        let remaining = Number(payMonto);
        for (const invId of payFacturasImputadas) {
          const inv = purchaseInvoices.find(i => i.id === invId);
          if (!inv || remaining <= 0) continue;
          const saldoPrev = Number(inv.saldoPendiente ?? inv.montoTotal);
          const applied = Math.min(saldoPrev, remaining);
          remaining = Math.max(0, Number((remaining - applied).toFixed(2)));
          const nuevoSaldo = Math.max(0, Number((saldoPrev - applied).toFixed(2)));
          const nuevoEstado: PurchaseInvoice['estado'] =
            nuevoSaldo <= 0.01 ? 'PAGADO' : nuevoSaldo < inv.montoTotal ? 'PAGADO_PARCIAL' : 'PENDIENTE_PAGO';
          await Promise.resolve(
            onSaveInvoice(
              {
                ...inv,
                saldoPendiente: nuevoEstado === 'PAGADO' ? 0 : nuevoSaldo,
                estado: nuevoEstado,
              },
              { applyStockAndExpenses: false }
            )
          );
        }
      }

      setIsPaymentModalOpen(false);
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Derived Calculations
  const totalDeudaPendiente = purchaseInvoices
    .filter(inv => inv.estado !== 'PAGADO')
    .reduce((sum, inv) => sum + inv.saldoPendiente, 0);

  const totalFacturasMes = purchaseInvoices.reduce((sum, inv) => sum + inv.montoTotal, 0);
  const totalIvaCreditoFiscal = purchaseInvoices.reduce((sum, inv) => sum + inv.ivaMonto, 0);
  const totalPercepcionesIibb = purchaseInvoices.reduce((sum, inv) => sum + inv.percepcionIibb, 0);

  const filteredInvoices = purchaseInvoices.filter(inv => {
    const matchesSearch = inv.nroComprobanteCompleto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.proveedorNombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.items.some(i => i.descripcion.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesProv = filterProveedor === 'TODOS' || inv.proveedorId === filterProveedor;
    const matchesEst = filterEstado === 'TODOS' || inv.estado === filterEstado;
    const invCat = inferInvoiceCategory(inv);
    const matchesCat = filterCategoria === 'TODOS' || invCat === filterCategoria;

    return matchesSearch && matchesProv && matchesEst && matchesCat;
  });

  const filteredProveedores = proveedores.filter(p => {
    const q = searchTerm.toLowerCase();
    return p.razonSocial.toLowerCase().includes(q) ||
      p.cuit.includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      (p.direccion || '').toLowerCase().includes(q);
  });

  const handleOpenProveedorModal = (p?: Proveedor) => {
    if (p) {
      setEditingProveedor(p);
      setProvCodigo(p.codigo || '');
      setProvRazonSocial(p.razonSocial);
      setProvCuit(p.cuit);
      setProvCondicionIva(p.condicionIva || 'Responsable Inscripto');
      setProvRubro(p.rubroPrincipal || 'COMBUSTIBLES_LUBRICANTES');
      setProvDireccion(p.direccion || '');
      setProvLocalidad(p.localidad || '');
      setProvTelefono(p.telefono || '');
      setProvAplicaRetenciones(!!p.aplicaRetenciones);
      setProvCalculaPercepciones(!!p.calculaPercepcionesIva);
      setProvIncluyeIvaCompras(p.incluyeEnIvaCompras !== false);
    } else {
      setEditingProveedor(null);
      setProvCodigo(`LH${(proveedores.length + 1).toString().padStart(3, '0')}`);
      setProvRazonSocial('');
      setProvCuit('');
      setProvCondicionIva('Responsable Inscripto');
      setProvRubro('COMBUSTIBLES_LUBRICANTES');
      setProvDireccion('');
      setProvLocalidad('San Salvador de Jujuy');
      setProvTelefono('');
      setProvAplicaRetenciones(false);
      setProvCalculaPercepciones(false);
      setProvIncluyeIvaCompras(true);
    }
    setIsProveedorModalOpen(true);
  };

  const handleSaveProveedorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!provRazonSocial.trim() || !provCuit.trim()) {
      alert('Por favor ingrese la Razón Social y el CUIT.');
      return;
    }

    const newProv: Proveedor = {
      id: editingProveedor ? editingProveedor.id : `PROV-${provCodigo || Date.now()}`,
      codigo: provCodigo || `LH${(proveedores.length + 1).toString().padStart(3, '0')}`,
      razonSocial: provRazonSocial.trim(),
      cuit: provCuit.trim(),
      condicionIva: provCondicionIva,
      rubroPrincipal: provRubro,
      direccion: provDireccion,
      localidad: provLocalidad,
      telefono: provTelefono,
      aplicaRetenciones: provAplicaRetenciones,
      calculaPercepcionesIva: provCalculaPercepciones,
      incluyeEnIvaCompras: provIncluyeIvaCompras,
      saldoCuentaCorriente: editingProveedor ? editingProveedor.saldoCuentaCorriente : 0
    };

    onSaveProveedor(newProv);
    setIsProveedorModalOpen(false);
    onShowToast(`Proveedor "${newProv.razonSocial}" guardado exitosamente.`);
  };

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const clearFormError = (key: string) => {
    setFormErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const getDefaultWarehouseForCat = (cat: PurchaseInvoiceCategory): StockWarehouse => {
    if (cat === 'BIENES_CAMBIO_LOCAL') {
      return availableWarehouses.find(w => w.id === 'DEP-VENTAS' || w.tipo === 'VENTAS') || availableWarehouses[0];
    }
    if (cat === 'INDUMENTARIA') {
      return availableWarehouses.find(w => w.id === 'DEP-INDUMENTARIA' || w.tipo === 'INDUMENTARIA') || availableWarehouses[0];
    }
    return availableWarehouses.find(w => w.id === 'DEP-TALLER' || w.tipo === 'TALLER') || availableWarehouses[0];
  };

  const handleOpenQuickWarehouseModal = (targetScope: 'QUICK_ART' | number) => {
    setQuickWhNombre('');
    setQuickWhTipo(
      formCategoriaCompra === 'BIENES_CAMBIO_LOCAL'
        ? 'VENTAS'
        : formCategoriaCompra === 'INDUMENTARIA'
          ? 'INDUMENTARIA'
          : 'TALLER'
    );
    setQuickWhUbicacion(
      formCategoriaCompra === 'INDUMENTARIA'
        ? 'Pañol Central - Sector Personal'
        : 'Galpón Central - Sector Taller'
    );
    setQuickWhError('');
    setQuickWarehouseModal({ open: true, targetScope });
  };

  const handleSaveQuickWarehouseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingQuickWh) return;
    const cleanName = quickWhNombre.trim();
    if (!cleanName) {
      setQuickWhError('Ingresá el nombre del depósito / sub-depósito (ej: Depósito Taller - Filtros).');
      return;
    }
    if (!onCreateWarehouse) {
      setQuickWhError('No está habilitada la creación de depósitos.');
      return;
    }

    const nextNum = availableWarehouses.length + 1;
    const newWh: StockWarehouse = {
      id: `DEP-${Date.now()}`,
      codigo: `DEP-${String(nextNum).padStart(2, '0')}`,
      nombre: cleanName,
      tipo: quickWhTipo,
      icono: quickWhTipo === 'VENTAS' ? '🛒' : quickWhTipo === 'HERRAMIENTAS' ? '🧰' : quickWhTipo === 'INDUMENTARIA' ? '🦺' : quickWhTipo === 'TALLER' ? '🔧' : '🏭',
      ubicacion: quickWhUbicacion.trim() || undefined,
      descripcion: `Sub-depósito creado desde Compras (${quickWhTipo})`,
      createdAt: new Date().toISOString()
    };

    setIsSavingQuickWh(true);
    setQuickWhError('');
    try {
      const res = await onCreateWarehouse(newWh);
      if (!res.ok) {
        setQuickWhError(res.error || 'No se pudo guardar el depósito en Supabase.');
        return;
      }
      if (quickWarehouseModal.targetScope === 'QUICK_ART') {
        setQuickArtDepositoId(newWh.id);
      } else if (typeof quickWarehouseModal.targetScope === 'number') {
        const lineIdx = quickWarehouseModal.targetScope;
        setFormItems(prev => prev.map((it, i) => i === lineIdx ? {
          ...it,
          depositoId: newWh.id,
          depositoNombre: newWh.nombre
        } : it));
        clearFormError(`item_${lineIdx}_deposito`);
      }
      setQuickWarehouseModal({ open: false, targetScope: null });
    } finally {
      setIsSavingQuickWh(false);
    }
  };

  const handleOpenQuickCatalogModal = (mode: 'ARTICULO' | 'COMBUSTIBLE', targetLineIdx: number) => {
    const line = formItems[targetLineIdx];
    const defaultRubro = getDefaultRubroForPurchaseCategory(formCategoriaCompra);
    const matchedRubro = availableRubrosDropdown.find(r => r.toLowerCase() === defaultRubro.toLowerCase()) || availableRubrosDropdown[0] || defaultRubro;
    const defaultWh = getDefaultWarehouseForCat(formCategoriaCompra);

    setQuickArtCodigo(line?.codigo || '');
    setQuickArtNombre(mode === 'COMBUSTIBLE' ? '' : (line?.descripcion || ''));
    setQuickArtCategoria(matchedRubro);
    setQuickArtUnidad(mode === 'COMBUSTIBLE' ? 'LITROS' : 'UNIDAD');
    setQuickArtPrecio(line?.precioUnitario || 0);
    setQuickArtStockMin(0);
    setQuickArtControlMode(line?.modoImputacion || getDefaultControlModeForCategory(formCategoriaCompra));
    setQuickArtDepositoId(line?.depositoId || defaultWh?.id || 'DEP-TALLER');
    setQuickArtError('');
    setQuickCatalogModal({ open: true, mode, targetLineIdx });
  };

  const handleSaveQuickCatalogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingQuickArt) return;

    const cleanNombre = quickArtNombre.trim();
    if (!cleanNombre) {
      setQuickArtError(
        quickArtMode === 'COMBUSTIBLE'
          ? 'Ingresá el nombre del tipo de combustible (ej: NAFTA QUANTIUM).'
          : 'Ingresá el nombre / descripción del artículo.'
      );
      return;
    }

    if (quickArtMode === 'ARTICULO' && !quickArtCodigo.trim()) {
      setQuickArtError('Ingresá un código identificador para el artículo.');
      return;
    }

    if (quickArtMode === 'ARTICULO' && !quickArtCategoria) {
      setQuickArtError('Seleccioná un Rubro / Categoría de la lista.');
      return;
    }

    if (quickArtMode === 'ARTICULO' && quickArtControlMode === 'STOCK_FRACCIONABLE' && !quickArtDepositoId) {
      setQuickArtError('Seleccioná a qué Depósito va este artículo con control de stock.');
      return;
    }

    setIsSavingQuickArt(true);
    setQuickArtError('');
    try {
      const targetIdx = quickCatalogModal.targetLineIdx;
      if (quickArtMode === 'COMBUSTIBLE') {
        const fuelNameUpper = cleanNombre.toUpperCase();
        const res = await saveFuelPriceStrict(fuelNameUpper, Number(quickArtPrecio) || 0);
        if (!res.ok) {
          setQuickArtError(res.error || 'No se pudo guardar el combustible en Supabase.');
          return;
        }
        setFuelCatalogVersion(v => v + 1);
        setFormItems(prev => prev.map((it, i) => {
          if (i !== targetIdx) return it;
          const nextPrice = Number(quickArtPrecio) || it.precioUnitario;
          return {
            ...it,
            tipoItem: 'COMBUSTIBLE',
            tipoCombustible: fuelNameUpper,
            descripcion: fuelNameUpper,
            unidadMedida: 'L',
            precioUnitario: nextPrice,
            subtotal: round2(it.cantidad * nextPrice)
          };
        }));
        clearFormError(`item_${targetIdx}_combustible`);
        clearFormError(`item_${targetIdx}_descripcion`);
        clearFormError(`item_${targetIdx}_precio`);
        setQuickCatalogModal(prev => ({ ...prev, open: false }));
        onShowToast(`Combustible "${fuelNameUpper}" dado de alta en Supabase.`);
      } else {
        if (!onCreateStockItem) {
          setQuickArtError('No está habilitada la conexión de catálogo de artículos.');
          return;
        }
        const selectedWh = availableWarehouses.find(w => w.id === quickArtDepositoId) || availableWarehouses[0];
        const newStockItem: StockItem = {
          id: `STK-${Date.now()}`,
          codigo: quickArtCodigo.trim().toUpperCase(),
          nombre: cleanNombre.toUpperCase(),
          categoria: quickArtCategoria,
          depositoId: quickArtControlMode === 'STOCK_FRACCIONABLE' ? (selectedWh?.id || quickArtDepositoId) : undefined,
          depositoNombre: quickArtControlMode === 'STOCK_FRACCIONABLE' ? selectedWh?.nombre : undefined,
          controlStockMode: quickArtControlMode,
          descripcion: cleanNombre,
          unidad: quickArtUnidad,
          stockActual: 0,
          stockMinimoAlerta: Number(quickArtStockMin) || 0,
          precioCostoUnitario: Number(quickArtPrecio) || 0,
          fechaUltimoIngreso: formFecha
        };
        const res = await onCreateStockItem(newStockItem);
        if (!res.ok) {
          setQuickArtError(res.error || 'No se pudo dar de alta el artículo en Supabase.');
          return;
        }
        const shortUnit =
          quickArtUnidad === 'LITROS' ? 'L' :
          quickArtUnidad === 'KG' ? 'KG' :
          quickArtUnidad === 'TAMBOR_205L' ? 'TAMBOR_205L' :
          quickArtUnidad === 'BALDE_20KG' ? 'BALDE_20KG' :
          quickArtUnidad === 'BIDON_20L' ? 'BIDON_20L' :
          quickArtUnidad === 'CAJA' ? 'CAJA' :
          quickArtUnidad === 'KIT' ? 'KIT' :
          quickArtUnidad === 'JUEGO' ? 'JGO' :
          quickArtUnidad === 'PAR' ? 'PAR' :
          quickArtUnidad === 'METRO' ? 'M' : 'UNI';

        setFormItems(prev => prev.map((it, i) => {
          if (i !== targetIdx) return it;
          const nextPrice = Number(quickArtPrecio) || it.precioUnitario;
          return {
            ...it,
            stockItemId: newStockItem.id,
            codigo: newStockItem.codigo,
            descripcion: newStockItem.nombre,
            unidadMedida: shortUnit,
            precioUnitario: nextPrice,
            subtotal: round2(it.cantidad * nextPrice),
            modoImputacion: quickArtControlMode,
            depositoId: quickArtControlMode === 'STOCK_FRACCIONABLE' ? selectedWh?.id : undefined,
            depositoNombre: quickArtControlMode === 'STOCK_FRACCIONABLE' ? selectedWh?.nombre : undefined
          };
        }));
        clearFormError(`item_${targetIdx}_descripcion`);
        clearFormError(`item_${targetIdx}_precio`);
        clearFormError(`item_${targetIdx}_deposito`);
        setQuickCatalogModal(prev => ({ ...prev, open: false }));
      }
    } finally {
      setIsSavingQuickArt(false);
    }
  };

  const handleOpenNewInvoiceModal = () => {
    const defaultCat: PurchaseInvoiceCategory = 'COMBUSTIBLE';
    const defaultFuel = availableFuelCatalog.types[0] || 'DIESEL COMUN';
    const defaultFuelPrice = availableFuelCatalog.prices[defaultFuel] || 0;

    setFormCategoriaCompra(defaultCat);
    setFormProveedorId(proveedores[0]?.id || '');
    setFormTipoComp('FACTURA_A');
    setFormFecha(new Date().toISOString().slice(0, 10));
    setFormPuntoVenta('0019');
    setFormNumeroComp('');
    setFormItems([
      {
        codigo: '',
        descripcion: defaultFuel,
        cantidad: 0,
        unidadMedida: 'L',
        precioUnitario: defaultFuelPrice,
        subtotal: 0,
        tipoItem: 'COMBUSTIBLE',
        tipoCombustible: defaultFuel
      }
    ]);
    setFormIvaManual(null);
    setFormIcl(0);
    setFormIdc(0);
    setFormTasaVial(0);
    setFormPercepcionIibb(0);
    setFormPercepcionIva(0);
    setFormAjusteRedondeo(0);
    setFormSelectedRemitos([]);
    setFormPdfUrl('');
    setFormArchivosAdjuntos([]);
    setRemitoSearchTerm('');
    setFormErrors({});
    setValidationBannerMessages([]);
    setIsNewInvoiceModalOpen(true);
  };

  const handleChangeCategoriaCompra = (newCat: PurchaseInvoiceCategory) => {
    setFormCategoriaCompra(newCat);
    const catMeta = getCategoryMeta(newCat);
    const defaultFuel = availableFuelCatalog.types[0] || 'DIESEL COMUN';
    const defaultFuelPrice = availableFuelCatalog.prices[defaultFuel] || 0;
    const defaultMode = getDefaultControlModeForCategory(newCat);
    const defaultWh = getDefaultWarehouseForCat(newCat);

    setFormItems(prev => {
      if (prev.length === 0) {
        return [{
          codigo: '',
          descripcion: newCat === 'COMBUSTIBLE' ? defaultFuel : '',
          cantidad: newCat === 'COMBUSTIBLE' ? 0 : 1,
          unidadMedida: catMeta.defaultUnit,
          precioUnitario: newCat === 'COMBUSTIBLE' ? defaultFuelPrice : 0,
          subtotal: 0,
          tipoItem: catMeta.defaultItemType,
          tipoCombustible: newCat === 'COMBUSTIBLE' ? defaultFuel : undefined,
          modoImputacion: newCat === 'COMBUSTIBLE' ? undefined : defaultMode,
          depositoId: newCat !== 'COMBUSTIBLE' && defaultMode === 'STOCK_FRACCIONABLE' ? defaultWh?.id : undefined,
          depositoNombre: newCat !== 'COMBUSTIBLE' && defaultMode === 'STOCK_FRACCIONABLE' ? defaultWh?.nombre : undefined
        }];
      }

      return prev.map((it, idx) => {
        const isFuelNameOnly = availableFuelCatalog.types.includes(it.descripcion.trim().toUpperCase());
        const isUntouchedDefault = idx === 0 && (
          (!it.descripcion.trim() && it.precioUnitario === 0) ||
          (isFuelNameOnly && it.cantidad === 0)
        );
        if (!isUntouchedDefault) return it;

        if (newCat === 'COMBUSTIBLE') {
          return {
            ...it,
            tipoItem: 'COMBUSTIBLE',
            tipoCombustible: defaultFuel,
            descripcion: defaultFuel,
            unidadMedida: 'L',
            cantidad: 0,
            precioUnitario: defaultFuelPrice,
            subtotal: 0,
            modoImputacion: undefined,
            depositoId: undefined,
            depositoNombre: undefined,
            equipoId: undefined,
            equipoLabel: undefined
          };
        }

        return {
          ...it,
          tipoItem: catMeta.defaultItemType,
          tipoCombustible: undefined,
          descripcion: isFuelNameOnly ? '' : it.descripcion,
          unidadMedida: catMeta.defaultUnit,
          cantidad: 1,
          precioUnitario: isFuelNameOnly ? 0 : it.precioUnitario,
          subtotal: isFuelNameOnly ? 0 : round2(1 * it.precioUnitario),
          modoImputacion: defaultMode,
          depositoId: defaultMode === 'STOCK_FRACCIONABLE' ? defaultWh?.id : undefined,
          depositoNombre: defaultMode === 'STOCK_FRACCIONABLE' ? defaultWh?.nombre : undefined
        };
      });
    });

    if (newCat !== 'COMBUSTIBLE') {
      setFormSelectedRemitos([]);
      setFormIcl(0);
      setFormIdc(0);
      setFormTasaVial(0);
    }
  };

  const handleAddItemToForm = () => {
    const catMeta = getCategoryMeta(formCategoriaCompra);
    const defaultFuel = availableFuelCatalog.types[0] || 'DIESEL COMUN';
    const defaultFuelPrice = availableFuelCatalog.prices[defaultFuel] || 0;
    const defaultMode = getDefaultControlModeForCategory(formCategoriaCompra);
    const defaultWh = getDefaultWarehouseForCat(formCategoriaCompra);

    setFormItems(prev => [
      ...prev,
      formCategoriaCompra === 'COMBUSTIBLE'
        ? {
            codigo: '',
            descripcion: defaultFuel,
            cantidad: 0,
            unidadMedida: 'L',
            precioUnitario: defaultFuelPrice,
            subtotal: 0,
            tipoItem: 'COMBUSTIBLE',
            tipoCombustible: defaultFuel
          }
        : {
            codigo: '',
            descripcion: '',
            cantidad: 1,
            unidadMedida: catMeta.defaultUnit,
            precioUnitario: 0,
            subtotal: 0,
            tipoItem: catMeta.defaultItemType,
            modoImputacion: defaultMode,
            depositoId: defaultMode === 'STOCK_FRACCIONABLE' ? defaultWh?.id : undefined,
            depositoNombre: defaultMode === 'STOCK_FRACCIONABLE' ? defaultWh?.nombre : undefined
          }
    ]);
  };

  const handleRemoveItemFromForm = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx));
    setFormErrors({});
  };

  const showFuelLinkingSection = useMemo(() => {
    return formCategoriaCompra === 'COMBUSTIBLE' || formItems.some(it => it.tipoItem === 'COMBUSTIBLE');
  }, [formCategoriaCompra, formItems]);

  const formNetoGravado = useMemo(() => {
    return round2(formItems.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0));
  }, [formItems]);

  const formIvaAuto = useMemo(() => {
    if (formTipoComp === 'FACTURA_C') return 0;
    return round2(formNetoGravado * 0.21);
  }, [formNetoGravado, formTipoComp]);

  const formIvaEfectivo = formIvaManual !== null ? formIvaManual : formIvaAuto;

  const formTotalCalculado = useMemo(() => {
    return round2(
      formNetoGravado +
      formIvaEfectivo +
      formIcl +
      formIdc +
      formTasaVial +
      formPercepcionIibb +
      formPercepcionIva +
      formAjusteRedondeo
    );
  }, [formNetoGravado, formIvaEfectivo, formIcl, formIdc, formTasaVial, formPercepcionIibb, formPercepcionIva, formAjusteRedondeo]);

  const handleSaveNewInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingInvoice) return;

    const errors: Record<string, string> = {};
    const messages: string[] = [];

    if (!formProveedorId) {
      errors.proveedor = 'Seleccioná un proveedor';
      messages.push('Falta seleccionar el Proveedor.');
    }
    if (!formFecha) {
      errors.fecha = 'Indicá la fecha de emisión';
      messages.push('Falta completar la Fecha de Emisión.');
    }
    if (!formPuntoVenta.trim()) {
      errors.puntoVenta = 'Ingresá Punto de Venta';
      messages.push('Falta el Punto de Venta (ej: 0019).');
    }
    if (!formNumeroComp.trim()) {
      errors.numeroComp = 'Ingresá el N° de Comprobante';
      messages.push('Falta ingresar el Número de Comprobante.');
    }

    if (formItems.length === 0) {
      messages.push('Debe haber al menos un ítem en la factura.');
    } else {
      formItems.forEach((item, idx) => {
        const lineNum = idx + 1;
        if (item.tipoItem === 'COMBUSTIBLE' && !item.tipoCombustible) {
          errors[`item_${idx}_combustible`] = 'Elegí el tipo';
          messages.push(`Línea ${lineNum}: falta elegir el Tipo de Combustible.`);
        }
        const descCheck = item.descripcion.trim() || (item.tipoItem === 'COMBUSTIBLE' ? (item.tipoCombustible || '') : '');
        if (!descCheck) {
          errors[`item_${idx}_descripcion`] = 'Completá la descripción';
          messages.push(`Línea ${lineNum}: falta la Descripción del artículo.`);
        }
        if ((Number(item.cantidad) || 0) <= 0) {
          errors[`item_${idx}_cantidad`] = 'Debe ser mayor a 0';
          messages.push(`Línea ${lineNum}: la Cantidad debe ser mayor a 0.`);
        }
        if ((Number(item.subtotal) || 0) <= 0 && (Number(item.precioUnitario) || 0) <= 0) {
          errors[`item_${idx}_precio`] = 'Ingresá precio o subtotal';
          messages.push(`Línea ${lineNum}: falta el Precio Unitario o Subtotal Neto.`);
        }
        if (item.tipoItem !== 'COMBUSTIBLE' && item.modoImputacion === 'STOCK_FRACCIONABLE' && !item.depositoId) {
          errors[`item_${idx}_deposito`] = 'Elegí un depósito';
          messages.push(`Línea ${lineNum}: seleccioná a qué Depósito ingresa este artículo.`);
        }
        if (item.tipoItem !== 'COMBUSTIBLE' && item.modoImputacion === 'DIRECTO_EQUIPO' && !item.equipoId) {
          errors[`item_${idx}_equipo`] = 'Elegí el equipo';
          messages.push(`Línea ${lineNum}: seleccioná el Equipo / Máquina que recibe el 100% de esta línea.`);
        }
      });
    }

    if (formTotalCalculado <= 0) {
      errors.total = 'Total mayor a $0';
      messages.push('El Total Final de la factura debe ser mayor a $0,00.');
    }

    if (messages.length > 0) {
      setFormErrors(errors);
      setValidationBannerMessages(messages);
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    setFormErrors({});
    setValidationBannerMessages([]);

    const sanitizedItems: PurchaseInvoiceItem[] = formItems.map((item, idx) => {
      const desc = item.descripcion.trim() || (item.tipoItem === 'COMBUSTIBLE' ? (item.tipoCombustible || 'Combustible') : '');
      const cleanSubtotal = round2(Number(item.subtotal) || (item.cantidad * item.precioUnitario));
      const matchedWh = item.depositoId ? availableWarehouses.find(w => w.id === item.depositoId) : undefined;
      const matchedEq = item.equipoId ? fleet.find(v => v.id === item.equipoId) : undefined;
      return {
        ...item,
        id: `ITM-${idx}-${Date.now()}`,
        descripcion: desc,
        subtotal: cleanSubtotal,
        tipoCombustible: item.tipoItem === 'COMBUSTIBLE' ? (item.tipoCombustible || desc) : undefined,
        modoImputacion: item.tipoItem === 'COMBUSTIBLE' ? undefined : (item.modoImputacion || 'SIN_STOCK'),
        depositoId: item.tipoItem !== 'COMBUSTIBLE' && item.modoImputacion === 'STOCK_FRACCIONABLE' ? item.depositoId : undefined,
        depositoNombre: item.tipoItem !== 'COMBUSTIBLE' && item.modoImputacion === 'STOCK_FRACCIONABLE' ? (matchedWh?.nombre || item.depositoNombre) : undefined,
        equipoId: item.tipoItem !== 'COMBUSTIBLE' && item.modoImputacion === 'DIRECTO_EQUIPO' ? item.equipoId : undefined,
        equipoLabel: item.tipoItem !== 'COMBUSTIBLE' && item.modoImputacion === 'DIRECTO_EQUIPO'
          ? (matchedEq ? `${matchedEq.codigoInterno ? `[${matchedEq.codigoInterno}] ` : ''}${matchedEq.modeloMarca}` : item.equipoLabel)
          : undefined
      };
    });

    const selectedProvObj = proveedores.find(p => p.id === formProveedorId);
    const neto = round2(sanitizedItems.reduce((acc, item) => acc + item.subtotal, 0));
    const iva = round2(formIvaManual !== null ? formIvaManual : (formTipoComp === 'FACTURA_C' ? 0 : neto * 0.21));
    const icl = round2(formIcl);
    const idc = round2(formIdc);
    const tv = round2(formTasaVial);
    const impInt = round2(icl + idc + tv);
    const percIibb = round2(formPercepcionIibb);
    const percIva = round2(formPercepcionIva);
    const redondeo = round2(formAjusteRedondeo);
    const total = round2(neto + iva + impInt + percIibb + percIva + redondeo);

    const newInvoice: PurchaseInvoice = {
      id: `PUR-${Date.now()}`,
      fechaEmision: formFecha,
      fechaVencimiento: formFecha,
      tipoComprobante: formTipoComp,
      codigoComprobanteAfip: formTipoComp === 'FACTURA_A' ? '001' : formTipoComp === 'FACTURA_B' ? '006' : '011',
      puntoVenta: formPuntoVenta.padStart(4, '0'),
      numeroComprobante: formNumeroComp.padStart(8, '0'),
      nroComprobanteCompleto: `${formPuntoVenta.padStart(4, '0')}-${formNumeroComp.padStart(8, '0')}`,
      proveedorId: formProveedorId,
      proveedorNombre: selectedProvObj?.razonSocial || '',
      proveedorCuit: selectedProvObj?.cuit || '',
      proveedorCondicionIva: selectedProvObj?.condicionIva || 'Responsable Inscripto',
      categoriaCompra: formCategoriaCompra,
      items: sanitizedItems,
      netoGravado: neto,
      netoGravado21: neto,
      netoNoGravado: impInt,
      ivaMonto: iva,
      iva21: iva,
      percepcionIibb: percIibb,
      percepcionIva: percIva,
      impuestosInternos: impInt,
      impuestoIcl: icl,
      impuestoIdc: idc,
      tasaVial: tv,
      ajusteRedondeo: redondeo,
      otrosImpuestos: redondeo,
      montoTotal: total,
      remitosAsociadosIds: showFuelLinkingSection ? formSelectedRemitos : [],
      estado: 'PENDIENTE_PAGO',
      saldoPendiente: total,
      archivoPdfUrl: formPdfUrl || (formArchivosAdjuntos.find(a => a.tipo === 'FACTURA')?.url) || undefined,
      archivosAdjuntos: formArchivosAdjuntos,
      createdAt: new Date().toISOString()
    };

    setIsSavingInvoice(true);
    try {
      const saved = await onSaveInvoice(newInvoice, { applyStockAndExpenses: true });
      if (saved === false) {
        setValidationBannerMessages(['No se pudo guardar en Supabase. Verificá tu conexión o los datos e intentá nuevamente.']);
        formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      setIsNewInvoiceModalOpen(false);
      onShowToast(`Factura ${newInvoice.nroComprobanteCompleto} registrada exitosamente en el Legajo.`);
    } finally {
      setIsSavingInvoice(false);
    }
  };

  const handleSaveLinkedRemitos = (invoiceId: string, remitosIds: string[]) => {
    const inv = purchaseInvoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const updated: PurchaseInvoice = {
      ...inv,
      remitosAsociadosIds: remitosIds,
      observaciones: remitosIds.length > 0 ? `Remitos Facturados: ${remitosIds.join(' - ')}` : inv.observaciones
    };
    onSaveInvoice(updated);
    setLinkingInvoice(null);
    onShowToast(`Se actualizaron ${remitosIds.length} remitos en el legajo de la Factura ${inv.nroComprobanteCompleto}.`);
  };

  const handleAutoFillCombustibleItem = (selectedKeys: string[]) => {
    const matchingVouchers = fuelVouchers.filter(v => selectedKeys.includes(getVoucherKey(v)));
    if (matchingVouchers.length === 0) {
      onShowToast('Por favor seleccione al menos un remito para auto-calcular las líneas de combustible.');
      return;
    }

    const groups = new Map<string, { litros: number; importe: number; count: number }>();
    matchingVouchers.forEach(v => {
      const fuelType = (v.tipoComb || availableFuelCatalog.types[0] || 'DIESEL COMUN').trim().toUpperCase();
      const litros = Number(v.cantidad) || Number(v.cantCarga) || 0;
      const catalogPrice = availableFuelCatalog.prices[fuelType] || 0;
      const importe = Number(v.totalImporte) || (litros * (Number(v.precioUnitario) || catalogPrice));
      const curr = groups.get(fuelType) || { litros: 0, importe: 0, count: 0 };
      groups.set(fuelType, {
        litros: curr.litros + litros,
        importe: curr.importe + importe,
        count: curr.count + 1
      });
    });

    const generatedFuelItems = Array.from(groups.entries()).map(([fuelType, stats]) => {
      const avgPrice = stats.litros > 0
        ? Number((stats.importe / stats.litros).toFixed(4))
        : (availableFuelCatalog.prices[fuelType] || 0);
      const cleanQty = Number(stats.litros.toFixed(3));
      return {
        codigo: 'COMB',
        descripcion: `${fuelType} s/ Remitos (${stats.count} ${stats.count === 1 ? 'carga' : 'cargas'})`,
        cantidad: cleanQty,
        unidadMedida: 'L',
        precioUnitario: avgPrice,
        subtotal: round2(cleanQty * avgPrice),
        tipoItem: 'COMBUSTIBLE' as PurchaseItemType,
        tipoCombustible: fuelType
      };
    });

    setFormItems(prev => {
      const nonFuelItems = prev.filter(it => it.tipoItem !== 'COMBUSTIBLE');
      return [...generatedFuelItems, ...nonFuelItems];
    });

    const totalLitros = matchingVouchers.reduce((acc, v) => acc + (Number(v.cantidad) || Number(v.cantCarga) || 0), 0);
    onShowToast(`Se auto-cargaron ${generatedFuelItems.length} línea(s) de combustible (${totalLitros.toFixed(1)} Lts totales).`);
  };

  const handleExportLibroIvaCSV = () => {
    const headers = [
      'FECHA_EMISION', 'TIPO_COMPROBANTE', 'PTO_VENTA', 'NRO_COMPROBANTE', 'CUIT_PROVEEDOR',
      'RAZON_SOCIAL_PROVEEDOR', 'CONDICION_IVA', 'NETO_GRAVADO_21', 'IVA_21', 'PERCEPCION_IIBB', 'TOTAL'
    ];
    const rows = purchaseInvoices.map(inv => [
      `"${inv.fechaEmision}"`,
      `"${inv.tipoComprobante}"`,
      `"${inv.puntoVenta}"`,
      `"${inv.numeroComprobante}"`,
      `"${inv.proveedorCuit}"`,
      `"${inv.proveedorNombre.replace(/"/g, '""')}"`,
      `"${inv.proveedorCondicionIva || 'RI'}"`,
      inv.netoGravado || 0,
      inv.ivaMonto || 0,
      inv.percepcionIibb || 0,
      inv.montoTotal || 0
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `la_hormiga_libro_iva_compras_${new Date().toISOString().slice(0, 7)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('Libro IVA Compras exportado a CSV exitosamente.');
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl p-6 shadow-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <ShoppingBag className="w-3.5 h-3.5" />
            Compras, Proveedores & Libro IVA
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight font-display">
            Módulo de Compras & Padrón de Proveedores
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Gestión completa de Proveedores ({proveedores.length} cargados), Facturas de Compra, Legajitos de Carga, Percepciones/Retenciones y Libro IVA Compras AFIP.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 z-10">
          <button
            onClick={() => handleOpenProveedorModal()}
            className="px-4 py-2 bg-[#262930] hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Building2 className="w-4 h-4 text-emerald-400" />
            <span>+ Nuevo Proveedor</span>
          </button>

          <button
            onClick={handleOpenNewInvoiceModal}
            className="px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] text-xs font-black rounded-xl border border-[#DDA800] transition flex items-center gap-2 cursor-pointer shadow-md shadow-[#F0C800]/10"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Cargar Factura Proveedor</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Proveedores Activos</span>
            <p className="text-xl font-black text-emerald-400 mt-1 font-mono">
              {proveedores.length} <span className="text-xs font-normal text-slate-400">empresas</span>
            </p>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Deuda Pendiente Total</span>
            <p className="text-xl font-black text-amber-400 mt-1 font-mono">
              ${totalDeudaPendiente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">IVA Crédito Fiscal</span>
            <p className="text-xl font-black text-blue-400 mt-1 font-mono">
              ${totalIvaCreditoFiscal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
            <Percent className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Monto Total Facturado</span>
            <p className="text-xl font-black text-white mt-1 font-mono">
              ${totalFacturasMes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-3 bg-[#F0C800]/10 border border-[#F0C800]/20 rounded-xl text-[#F0C800]">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center justify-between border-b border-[#2D2D2D] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('proveedores')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'proveedores'
                ? 'bg-[#F0C800] text-[#2D2D2D] shadow-sm font-black'
                : 'bg-[#16191F] text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Proveedores Padrón ({proveedores.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('facturas')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'facturas'
                ? 'bg-[#F0C800] text-[#2D2D2D] shadow-sm font-black'
                : 'bg-[#16191F] text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Facturas de Compra ({purchaseInvoices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('libro_iva')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'libro_iva'
                ? 'bg-[#F0C800] text-[#2D2D2D] shadow-sm font-black'
                : 'bg-[#16191F] text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Percent className="w-4 h-4" />
            <span>Libro IVA Compras AFIP</span>
          </button>

          <button
            onClick={() => setActiveTab('ctacte')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'ctacte'
                ? 'bg-[#F0C800] text-[#2D2D2D] shadow-sm font-black'
                : 'bg-[#16191F] text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Cuentas Corrientes & Resúmenes</span>
          </button>

          <button
            onClick={() => setActiveTab('pagos')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'pagos'
                ? 'bg-[#F0C800] text-[#2D2D2D] shadow-sm font-black'
                : 'bg-[#16191F] text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Órdenes de Pago ({supplierPayments.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PROVEEDORES PADRÓN COMPLETO */}
      {activeTab === 'proveedores' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-[#16191F] p-3.5 rounded-xl border border-[#2D2D2D]">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar proveedor por código, Razón Social, CUIT o localidad..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[#0F1115] border border-[#2D2D2D] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
              />
            </div>

            <button
              onClick={() => handleOpenProveedorModal()}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-lg transition flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ Nuevo Proveedor</span>
            </button>
          </div>

          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#1F2228] text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-[#2D2D2D]">
                  <tr>
                    <th className="p-3">Código</th>
                    <th className="p-3">Razón Social</th>
                    <th className="p-3">CUIT</th>
                    <th className="p-3">Condición IVA</th>
                    <th className="p-3">Domicilio / Localidad</th>
                    <th className="p-3 text-center">Aplica Ret.</th>
                    <th className="p-3 text-center">Perc. IVA</th>
                    <th className="p-3 text-center">Libro IVA</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2D2D2D]">
                  {filteredProveedores.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-slate-500">
                        No se encontraron proveedores en el padrón.
                      </td>
                    </tr>
                  ) : (
                    filteredProveedores.map((p) => (
                      <tr key={p.id} className="hover:bg-[#1C1F26] transition">
                        <td className="p-3 font-mono font-bold text-amber-400">{p.codigo}</td>
                        <td className="p-3 font-bold text-white">{p.razonSocial}</td>
                        <td className="p-3 font-mono text-slate-400">{p.cuit}</td>
                        <td className="p-3 font-medium">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.condicionIva?.includes('Responsable') || p.condicionIva === 'RI' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' :
                            p.condicionIva?.includes('Monotributo') || p.condicionIva === 'RS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {p.condicionIva || 'Responsable Inscripto'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400 truncate max-w-[200px]">{p.direccion || '-'}</td>
                        <td className="p-3 text-center">
                          {p.aplicaRetenciones ? (
                            <span className="text-emerald-400 font-bold">Sí</span>
                          ) : (
                            <span className="text-slate-600">No</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {p.calculaPercepcionesIva ? (
                            <span className="text-emerald-400 font-bold">Sí</span>
                          ) : (
                            <span className="text-slate-600">No</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {p.incluyeEnIvaCompras !== false ? (
                            <span className="text-emerald-400 font-bold">Sí</span>
                          ) : (
                            <span className="text-slate-600">No</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleOpenProveedorModal(p)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                              title="Editar proveedor"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FACTURAS DE COMPRA & LEGAJITOS */}
      {activeTab === 'facturas' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-[#16191F] p-3.5 rounded-xl border border-[#2D2D2D]">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nro de factura, proveedor, remito o artículo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[#0F1115] border border-[#2D2D2D] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={filterCategoria}
                onChange={(e) => setFilterCategoria(e.target.value as any)}
                className="bg-[#0F1115] border border-[#2D2D2D] rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-[#F0C800]"
              >
                <option value="TODOS">Todos los Rubros</option>
                {PURCHASE_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>

              <select
                value={filterProveedor}
                onChange={(e) => setFilterProveedor(e.target.value)}
                className="bg-[#0F1115] border border-[#2D2D2D] rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-[#F0C800]"
              >
                <option value="TODOS">Todos los Proveedores</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.razonSocial}</option>
                ))}
              </select>

              <select
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                className="bg-[#0F1115] border border-[#2D2D2D] rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-[#F0C800]"
              >
                <option value="TODOS">Todos los Estados</option>
                <option value="PENDIENTE_PAGO">Pendiente de Pago</option>
                <option value="PAGADO_PARCIAL">Pago Parcial</option>
                <option value="PAGADO">Pagado</option>
              </select>
            </div>
          </div>

          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#1F2228] text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-[#2D2D2D]">
                  <tr>
                    <th className="p-3">Comprobante</th>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Proveedor</th>
                    <th className="p-3">Conceptos Discriminados</th>
                    <th className="p-3 text-center">Legajo (Remitos)</th>
                    <th className="p-3 text-right">Total $</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2D2D2D]">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-500">
                        No se encontraron facturas de compra registradas.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[#1C1F26] transition">
                        <td className="p-3 font-mono font-bold text-white">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px]">
                              {inv.tipoComprobante}
                            </span>
                            <span>{inv.nroComprobanteCompleto}</span>
                          </div>
                          {(() => {
                            const catMeta = getCategoryMeta(inferInvoiceCategory(inv));
                            return (
                              <div className="mt-1">
                                <span className={`inline-block px-1.5 py-0.2 rounded border text-[9px] font-sans font-bold uppercase ${catMeta.badgeClass}`}>
                                  {catMeta.shortLabel}
                                </span>
                              </div>
                            );
                          })()}

                          {/* Indicador y botón rápido para PDF o Foto de la Factura */}
                          {inv.archivoPdfUrl || (inv.archivosAdjuntos && inv.archivosAdjuntos.length > 0) ? (
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <a
                                href={inv.archivoPdfUrl || inv.archivosAdjuntos![0].url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[10px] font-sans font-bold transition"
                                title="Abrir comprobante PDF o foto original"
                              >
                                <FileText className="w-3 h-3 text-red-400" />
                                <span>Ver PDF Factura</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                              {inv.archivosAdjuntos && inv.archivosAdjuntos.length > 1 && (
                                <span className="text-[10px] text-slate-400 font-sans">
                                  +{inv.archivosAdjuntos.length - 1} docs
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="mt-1">
                              <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-dashed border-blue-500/40 text-[10px] font-sans font-bold transition cursor-pointer">
                                <FileUp className="w-3 h-3 text-blue-400" />
                                <span>+ Cargar PDF / Foto</span>
                                <input
                                  type="file"
                                  accept="application/pdf,image/*"
                                  onChange={(e) => handleAddAttachmentToLegajo(inv, e, 'FACTURA')}
                                  className="hidden"
                                />
                              </label>
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-mono">{inv.fechaEmision}</td>
                        <td className="p-3 font-medium text-white">
                          <div>{inv.proveedorNombre}</div>
                          <div className="text-[10px] text-slate-500 font-mono">CUIT: {inv.proveedorCuit}</div>
                        </td>
                        <td className="p-3">
                          <div className="space-y-1">
                            {inv.items.map((it, i) => {
                              const typeMeta = PURCHASE_ITEM_TYPES[it.tipoItem] || PURCHASE_ITEM_TYPES.OTRO;
                              return (
                                <div key={i} className="flex items-center gap-1.5 text-[11px] flex-wrap">
                                  <span className={`px-1 py-0.2 rounded text-[9px] font-bold font-mono ${typeMeta.badgeClass}`}>
                                    {typeMeta.badge}
                                  </span>
                                  {it.tipoCombustible && (
                                    <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                      {it.tipoCombustible}
                                    </span>
                                  )}
                                  <span className="font-semibold">{it.cantidad} {it.unidadMedida || 'UNI'}</span>
                                  <span className="truncate max-w-[200px]">{it.descripcion}</span>
                                  {it.depositoNombre && (
                                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">
                                      📦 {it.depositoNombre}
                                    </span>
                                  )}
                                  {it.equipoLabel && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px] font-bold">
                                      🚜 100% {it.equipoLabel}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {inv.remitosAsociadosIds && inv.remitosAsociadosIds.length > 0 ? (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                              <FileCheck className="w-3 h-3" />
                              <span>{inv.remitosAsociadosIds.length} Remitos Vinculados</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-[10px] italic">
                              {inferInvoiceCategory(inv) === 'COMBUSTIBLE' ? 'Sin remitos' : 'No aplica'}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-white text-sm">
                          ${inv.montoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-center">
                          {inv.estado === 'PAGADO' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                              PAGADO
                            </span>
                          ) : inv.estado === 'PAGADO_PARCIAL' ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                              PARCIAL
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-bold">
                              PENDIENTE
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Botón directo para Cargar / Adjuntar PDF o Foto de la Factura */}
                            <label
                              className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition cursor-pointer"
                              title="Cargar / Adjuntar PDF o Foto de la Factura"
                            >
                              <FileUp className="w-3.5 h-3.5" />
                              <input
                                type="file"
                                accept="application/pdf,image/*"
                                onChange={(e) => handleAddAttachmentToLegajo(inv, e, 'FACTURA')}
                                className="hidden"
                              />
                            </label>

                            {/* Botón para Vincular Remitos de combustible al legajo */}
                            <button
                              onClick={() => {
                                setLinkingInvoice(inv);
                                setTempLinkedRemitos([...(inv.remitosAsociadosIds || [])]);
                                setRemitoSearchTerm('');
                                setRemitoFilterMode('TODOS');
                              }}
                              className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition cursor-pointer"
                              title="Vincular / Modificar Remitos de Combustible al Legajo"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Botón para Ver Legajo Digital Completo */}
                            <button
                              onClick={() => setSelectedInvoiceForLegajo(inv)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                              title="Ver Legajo Digital de Factura (PDFs y Remitos)"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {inv.estado !== 'PAGADO' && (
                              <button
                                type="button"
                                onClick={() => openPaymentModal({ proveedorId: inv.proveedorId, invoiceId: inv.id })}
                                className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 transition cursor-pointer"
                                title="Registrar Pago / Endosar Cheque a este Proveedor"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Eliminar factura */}
                            <button
                              onClick={() => onDeleteInvoice(inv.id)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition cursor-pointer"
                              title="Eliminar factura"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LIBRO IVA COMPRAS AFIP */}
      {activeTab === 'libro_iva' && (
        <div className="space-y-4">
          <div className="bg-[#16191F] p-4 rounded-xl border border-[#2D2D2D] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-white">Libro IVA Compras (AFIP CITI Compras / Libro IVA Digital)</h3>
              <p className="text-xs text-slate-400">Resumen consolidado para liquidación impositiva y exportación mensual a contabilidad.</p>
            </div>

            <button
              onClick={handleExportLibroIvaCSV}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Libro IVA Compras (CSV / Excel)</span>
            </button>
          </div>

          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#1F2228] text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-[#2D2D2D]">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Nro. Comprobante</th>
                    <th className="p-3">CUIT Proveedor</th>
                    <th className="p-3">Razón Social</th>
                    <th className="p-3 text-right">Neto Gravado $</th>
                    <th className="p-3 text-right">IVA Crédito $</th>
                    <th className="p-3 text-right">Perc. IIBB $</th>
                    <th className="p-3 text-right">Total Compras $</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2D2D2D] font-mono">
                  {purchaseInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#1C1F26] transition">
                      <td className="p-3">{inv.fechaEmision}</td>
                      <td className="p-3 font-bold text-amber-400">{inv.tipoComprobante}</td>
                      <td className="p-3 font-bold text-white">{inv.nroComprobanteCompleto}</td>
                      <td className="p-3 text-slate-400">{inv.proveedorCuit}</td>
                      <td className="p-3 font-sans font-medium text-white">{inv.proveedorNombre}</td>
                      <td className="p-3 text-right font-bold text-slate-200">
                        ${(inv.netoGravado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-bold text-blue-400">
                        ${(inv.ivaMonto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right text-slate-300">
                        ${(inv.percepcionIibb || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-400">
                        ${(inv.montoTotal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CUENTAS CORRIENTES & RESÚMENES */}
      {activeTab === 'ctacte' && (
        <div className="space-y-4">
          <div className="bg-[#16191F] p-4 rounded-xl border border-[#2D2D2D] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-white">Análisis de Deuda & Resumen de Cuenta Corriente</h3>
              <p className="text-xs text-slate-400">Verifica el saldo exacto con el proveedor y el detalle de remitos y facturas emitidas.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {proveedores.slice(0, 10).map(p => {
              const invoicesOfProv = purchaseInvoices.filter(i => i.proveedorId === p.id);
              const totalFactured = invoicesOfProv.reduce((acc, i) => acc + i.montoTotal, 0);
              const pendingSaldo = invoicesOfProv.reduce((acc, i) => acc + i.saldoPendiente, 0);

              return (
                <div key={p.id} className="bg-[#16191F] border border-[#2D2D2D] rounded-xl p-5 space-y-4">
                  <div className="flex items-start justify-between border-b border-[#2D2D2D] pb-3">
                    <div>
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">{p.rubroPrincipal}</span>
                      <h4 className="text-lg font-black text-white">{p.razonSocial}</h4>
                      <p className="text-xs text-slate-400 font-mono">CUIT: {p.cuit}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Saldo en Deuda</span>
                      <div className="text-xl font-black text-amber-400 font-mono">
                        ${(p.saldoCuentaCorriente || pendingSaldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Total Facturas Recibidas:</span>
                      <span className="font-mono font-bold">${totalFactured.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span>Facturas Pendientes:</span>
                      <span className="font-mono font-bold text-amber-400">{invoicesOfProv.filter(i => i.estado !== 'PAGADO').length} comprobantes</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#2D2D2D]">
                    <button
                      onClick={() => setSelectedProveedorForCtaCte(p)}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                      <span>Ver Resumen de Cuenta Corriente Estilo PDF</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: ÓRDENES Y RECIBOS DE PAGO */}
      {activeTab === 'pagos' && (
        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-black text-white">Historial de Pagos & Recibos de Proveedores</h3>
              <p className="text-[11px] text-slate-400">
                Registrá pagos por transferencia, efectivo, cheque propio o endosando cheques recibidos de clientes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onNavigateToCarteraCheques && (
                <button
                  type="button"
                  onClick={onNavigateToCarteraCheques}
                  className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5"
                >
                  <Banknote className="w-3.5 h-3.5" />
                  <span>Cartera ({availableChequesEnCartera.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => openPaymentModal()}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Nuevo Pago</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#1F2228] text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-[#2D2D2D]">
                <tr>
                  <th className="p-3">Recibo / OP ID</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Proveedor</th>
                  <th className="p-3">Forma de Pago</th>
                  <th className="p-3">Comprobante / Cheques</th>
                  <th className="p-3 text-right">Monto Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2D2D2D]">
                {supplierPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-500">
                      No hay pagos registrados a proveedores.
                    </td>
                  </tr>
                ) : (
                  supplierPayments.map(p => (
                    <tr key={p.id} className="hover:bg-[#1C1F26] transition">
                      <td className="p-3 font-mono font-bold text-emerald-400">{p.id}</td>
                      <td className="p-3 font-mono">{p.fecha}</td>
                      <td className="p-3 font-medium text-white">{p.proveedorNombre}</td>
                      <td className="p-3 font-bold">
                        {p.formaPago === 'CHEQUE_ENDOSADO' ? (
                          <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/35 text-[10px]">
                            CHEQUE ENDOSADO
                          </span>
                        ) : (
                          p.formaPago
                        )}
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        <div>{p.numeroComprobantePago || '-'}</div>
                        {p.chequesEndosadosResumen && p.chequesEndosadosResumen.length > 0 && (
                          <div className="text-[10px] text-indigo-300 mt-0.5">
                            {p.chequesEndosadosResumen
                              .map(c => `#${c.numeroCheque} (${c.bancoEmisor} · Vto ${c.fechaCobro})`)
                              .join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-white text-sm">
                        ${p.montoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CARGAR / EDITAR PROVEEDOR */}
      {isProveedorModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl space-y-0">
            
            <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#F0C800]" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  {editingProveedor ? `Editar Proveedor (${editingProveedor.codigo})` : 'Alta de Nuevo Proveedor'}
                </h3>
              </div>
              <button
                onClick={() => setIsProveedorModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProveedorSubmit} className="p-5 space-y-4">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Código Proveedor *</label>
                  <input
                    type="text"
                    value={provCodigo}
                    onChange={(e) => setProvCodigo(e.target.value)}
                    placeholder="0001"
                    className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-[#F0C800]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">CUIT *</label>
                  <input
                    type="text"
                    value={provCuit}
                    onChange={(e) => setProvCuit(e.target.value)}
                    placeholder="30-70729715-4"
                    className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-[#F0C800]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Razón Social *</label>
                <input
                  type="text"
                  value={provRazonSocial}
                  onChange={(e) => setProvRazonSocial(e.target.value)}
                  placeholder="FERRETERA GENERAL PAZ S.A."
                  className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Condición Frente al IVA</label>
                  <select
                    value={provCondicionIva}
                    onChange={(e) => setProvCondicionIva(e.target.value)}
                    className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                  >
                    <option value="Responsable Inscripto">Responsable Inscripto (RI)</option>
                    <option value="Monotributo">Monotributo (RS)</option>
                    <option value="Exento">Exento (EX)</option>
                    <option value="Consumidor Final">Consumidor Final (CF)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Rubro Principal</label>
                  <select
                    value={provRubro}
                    onChange={(e) => setProvRubro(e.target.value)}
                    className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                  >
                    <option value="COMBUSTIBLES_LUBRICANTES">Combustibles & Lubricantes</option>
                    <option value="FERRETERIA">Ferretería & Insumos</option>
                    <option value="REPUESTOS">Repuestos & Mecánica</option>
                    <option value="SERVICIOS">Servicios & Financieros</option>
                    <option value="VARIOS">Varios</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Domicilio</label>
                  <input
                    type="text"
                    value={provDireccion}
                    onChange={(e) => setProvDireccion(e.target.value)}
                    placeholder="BV. 25 DE MAYO 55"
                    className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Localidad</label>
                  <input
                    type="text"
                    value={provLocalidad}
                    onChange={(e) => setProvLocalidad(e.target.value)}
                    placeholder="SAN SALVADOR DE JUJUY"
                    className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                  />
                </div>
              </div>

              {/* Fiscal Toggles */}
              <div className="bg-[#0F1115] p-3 rounded-xl border border-[#2D2D2D] space-y-2">
                <span className="text-[11px] font-bold text-[#F0C800] uppercase tracking-wider">Configuración Impositiva AFIP</span>
                
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={provAplicaRetenciones}
                      onChange={(e) => setProvAplicaRetenciones(e.target.checked)}
                      className="accent-[#F0C800]"
                    />
                    <span>Aplica Retenciones</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={provCalculaPercepciones}
                      onChange={(e) => setProvCalculaPercepciones(e.target.checked)}
                      className="accent-[#F0C800]"
                    />
                    <span>Percepciones IVA/IIBB</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={provIncluyeIvaCompras}
                      onChange={(e) => setProvIncluyeIvaCompras(e.target.checked)}
                      className="accent-[#F0C800]"
                    />
                    <span>Incluir en Libro IVA</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-[#2D2D2D] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProveedorModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-500 text-black text-xs font-bold rounded-xl hover:bg-emerald-400 transition cursor-pointer"
                >
                  {editingProveedor ? 'Guardar Cambios' : 'Alta de Proveedor'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* MODAL: CARGAR NUEVA FACTURA DE PROVEEDOR */}
      {isNewInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl space-y-0">
            
            <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#F0C800]" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Cargar Factura de Compra de Proveedor
                </h3>
              </div>
              <button
                onClick={() => setIsNewInvoiceModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewInvoiceSubmit} noValidate className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
              <div ref={formTopRef} />

              {/* POP-UP / ALERTA VISIBLE ARRIBA DE LA FACTURA SI FALTAN CAMPOS */}
              {validationBannerMessages.length > 0 && (
                <div className="bg-red-950/80 border-2 border-red-500 rounded-xl p-3.5 shadow-lg shadow-red-950/50 animate-pulse-once">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-black text-red-300 uppercase tracking-wider">
                          Faltan datos obligatorios para guardar la factura ({validationBannerMessages.length})
                        </h4>
                        <ul className="mt-1.5 space-y-0.5 text-xs text-red-200 list-disc list-inside">
                          {validationBannerMessages.map((msg, i) => (
                            <li key={i}>{msg}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setValidationBannerMessages([])}
                      className="text-red-300 hover:text-white p-1 cursor-pointer"
                      title="Cerrar alerta"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${formErrors.proveedor ? 'text-red-400' : 'text-slate-400'}`}>
                    Proveedor *
                  </label>
                  <select
                    value={formProveedorId}
                    onChange={(e) => {
                      setFormProveedorId(e.target.value);
                      clearFormError('proveedor');
                    }}
                    className={`w-full rounded-lg p-2 text-xs text-white focus:outline-none ${
                      formErrors.proveedor
                        ? 'bg-red-950/30 border-2 border-red-500 focus:border-red-400'
                        : 'bg-[#0F1115] border border-[#2D2D2D] focus:border-[#F0C800]'
                    }`}
                  >
                    {proveedores.length === 0 && <option value="">Sin proveedores cargados</option>}
                    {proveedores.map(p => (
                      <option key={p.id} value={p.id}>{p.razonSocial} ({p.cuit})</option>
                    ))}
                  </select>
                  {formErrors.proveedor && <p className="text-[10px] text-red-400 mt-0.5 font-semibold">{formErrors.proveedor}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Tipo Comprobante</label>
                  <select
                    value={formTipoComp}
                    onChange={(e) => setFormTipoComp(e.target.value as any)}
                    className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                  >
                    <option value="FACTURA_A">Factura A (Cod. 001)</option>
                    <option value="FACTURA_B">Factura B (Cod. 006)</option>
                    <option value="FACTURA_C">Factura C (Cod. 011)</option>
                    <option value="NOTA_CREDITO_A">Nota de Crédito A (Cod. 003)</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-xs font-semibold mb-1 ${formErrors.fecha ? 'text-red-400' : 'text-slate-400'}`}>
                    Fecha Emisión *
                  </label>
                  <input
                    type="date"
                    value={formFecha}
                    onChange={(e) => {
                      setFormFecha(e.target.value);
                      clearFormError('fecha');
                    }}
                    className={`w-full rounded-lg p-2 text-xs text-white focus:outline-none ${
                      formErrors.fecha
                        ? 'bg-red-950/30 border-2 border-red-500 focus:border-red-400'
                        : 'bg-[#0F1115] border border-[#2D2D2D] focus:border-[#F0C800]'
                    }`}
                  />
                  {formErrors.fecha && <p className="text-[10px] text-red-400 mt-0.5 font-semibold">{formErrors.fecha}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${formErrors.puntoVenta ? 'text-red-400' : 'text-slate-400'}`}>
                    Punto de Venta *
                  </label>
                  <input
                    type="text"
                    placeholder="0019"
                    value={formPuntoVenta}
                    onChange={(e) => {
                      setFormPuntoVenta(e.target.value);
                      clearFormError('puntoVenta');
                    }}
                    className={`w-full rounded-lg p-2 text-xs text-white focus:outline-none font-mono ${
                      formErrors.puntoVenta
                        ? 'bg-red-950/30 border-2 border-red-500 focus:border-red-400'
                        : 'bg-[#0F1115] border border-[#2D2D2D] focus:border-[#F0C800]'
                    }`}
                  />
                  {formErrors.puntoVenta && <p className="text-[10px] text-red-400 mt-0.5 font-semibold">{formErrors.puntoVenta}</p>}
                </div>

                <div>
                  <label className={`block text-xs font-semibold mb-1 ${formErrors.numeroComp ? 'text-red-400' : 'text-slate-400'}`}>
                    Número de Comprobante *
                  </label>
                  <input
                    type="text"
                    placeholder="00020678"
                    value={formNumeroComp}
                    onChange={(e) => {
                      setFormNumeroComp(e.target.value);
                      clearFormError('numeroComp');
                    }}
                    className={`w-full rounded-lg p-2 text-xs text-white focus:outline-none font-mono ${
                      formErrors.numeroComp
                        ? 'bg-red-950/30 border-2 border-red-500 focus:border-red-400'
                        : 'bg-[#0F1115] border border-[#2D2D2D] focus:border-[#F0C800]'
                    }`}
                  />
                  {formErrors.numeroComp && <p className="text-[10px] text-red-400 mt-0.5 font-semibold">{formErrors.numeroComp}</p>}
                </div>
              </div>

              {/* Rubro / ¿A qué corresponde esta factura? */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-[#2D2D2D] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-white uppercase tracking-wider">
                    ¿A qué corresponde esta factura? *
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Define los ítems y habilita remitos si es Combustible
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PURCHASE_CATEGORIES.map((cat) => {
                    const isActive = formCategoriaCompra === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleChangeCategoriaCompra(cat.id)}
                        className={`px-2.5 py-2 rounded-lg border text-left text-xs font-bold transition cursor-pointer flex items-center justify-between gap-1.5 ${
                          isActive
                            ? 'bg-[#F0C800]/15 border-[#F0C800] text-[#F0C800] shadow-sm'
                            : 'bg-[#16191F] border-[#2D2D2D] text-slate-300 hover:border-slate-600 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{cat.label}</span>
                        {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Items Table inside Form */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Líneas de la Factura ({getCategoryMeta(formCategoriaCompra).label})
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleOpenQuickCatalogModal(formCategoriaCompra === 'COMBUSTIBLE' ? 'COMBUSTIBLE' : 'ARTICULO', 0)}
                      className="text-xs text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {formCategoriaCompra === 'COMBUSTIBLE' ? 'Alta Nuevo Combustible' : 'Alta Nuevo Artículo'}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddItemToForm}
                      className="text-xs text-[#F0C800] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Agregar Ítem
                    </button>
                  </div>
                </div>

                {formItems.map((item, idx) => {
                  const isFuelLine = item.tipoItem === 'COMBUSTIBLE';
                  const fuelOptions = item.tipoCombustible && !availableFuelCatalog.types.includes(item.tipoCombustible)
                    ? [item.tipoCombustible, ...availableFuelCatalog.types]
                    : availableFuelCatalog.types;
                  const errComb = formErrors[`item_${idx}_combustible`];
                  const errDesc = formErrors[`item_${idx}_descripcion`];
                  const errQty = formErrors[`item_${idx}_cantidad`];
                  const errPrice = formErrors[`item_${idx}_precio`];
                  const errDeposito = formErrors[`item_${idx}_deposito`];
                  const errEquipo = formErrors[`item_${idx}_equipo`];

                  return (
                    <div key={idx} className={`bg-[#0F1115] p-3 rounded-xl border space-y-2.5 ${(errComb || errDesc || errQty || errPrice || errDeposito || errEquipo) ? 'border-red-500/70' : 'border-[#2D2D2D]'}`}>
                      {/* Selector de Artículo existente / Alta rápida para rubros no combustible */}
                      {!isFuelLine && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pb-2 border-b border-[#1D2128]">
                          <div className="flex-1">
                            <label className="block text-[10px] text-slate-400 mb-0.5">
                              Seleccionar Artículo del Catálogo ({stockItems.length} cargados)
                            </label>
                            <select
                              value={item.stockItemId || ''}
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const art = stockItems.find(s => s.id === selectedId);
                                if (!art) return;
                                const shortUnit =
                                  art.unidad === 'LITROS' ? 'L' :
                                  art.unidad === 'KG' ? 'KG' :
                                  art.unidad === 'TAMBOR_205L' ? 'TAMBOR_205L' :
                                  art.unidad === 'BALDE_20KG' ? 'BALDE_20KG' :
                                  art.unidad === 'BIDON_20L' ? 'BIDON_20L' :
                                  art.unidad === 'CAJA' ? 'CAJA' :
                                  art.unidad === 'KIT' ? 'KIT' :
                                  art.unidad === 'JUEGO' ? 'JGO' :
                                  art.unidad === 'PAR' ? 'PAR' :
                                  art.unidad === 'METRO' ? 'M' : 'UNI';
                                const refPrice = art.precioCostoUnitario || 0;
                                const nextMode: StockControlMode = art.controlStockMode || 'STOCK_FRACCIONABLE';
                                const fallbackWh = getDefaultWarehouseForCat(formCategoriaCompra);
                                const resolvedDepId = art.depositoId || fallbackWh?.id;
                                const resolvedDepName = art.depositoNombre || availableWarehouses.find(w => w.id === resolvedDepId)?.nombre || fallbackWh?.nombre;
                                setFormItems(prev => prev.map((it, i) => i === idx ? {
                                  ...it,
                                  stockItemId: art.id,
                                  codigo: art.codigo || it.codigo,
                                  descripcion: art.nombre,
                                  unidadMedida: shortUnit,
                                  precioUnitario: refPrice > 0 ? refPrice : it.precioUnitario,
                                  subtotal: round2(it.cantidad * (refPrice > 0 ? refPrice : it.precioUnitario)),
                                  modoImputacion: nextMode,
                                  depositoId: nextMode === 'STOCK_FRACCIONABLE' ? resolvedDepId : undefined,
                                  depositoNombre: nextMode === 'STOCK_FRACCIONABLE' ? resolvedDepName : undefined
                                } : it));
                                clearFormError(`item_${idx}_descripcion`);
                                clearFormError(`item_${idx}_deposito`);
                                if (refPrice > 0) clearFormError(`item_${idx}_precio`);
                              }}
                              className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#F0C800]"
                            >
                              <option value="">-- Elegir artículo existente o cargar manual --</option>
                              {stockItems.map(s => (
                                <option key={s.id} value={s.id}>
                                  [{s.codigo}] {s.nombre} ({s.categoria}){s.depositoNombre ? ` · ${s.depositoNombre}` : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleOpenQuickCatalogModal('ARTICULO', idx)}
                            className="px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer sm:mt-4 shrink-0"
                            title="Si el artículo no existe en el sistema, dalo de alta aquí y queda guardado en Supabase"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Alta Artículo</span>
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                        <div className="md:col-span-3">
                          <label className="block text-[10px] text-slate-400 mb-0.5">Tipo de Ítem</label>
                          <select
                            value={item.tipoItem}
                            onChange={(e) => {
                              const val = e.target.value as PurchaseItemType;
                              const defaultFuel = availableFuelCatalog.types[0] || 'DIESEL COMUN';
                              setFormItems(prev => prev.map((it, i) => {
                                if (i !== idx) return it;
                                if (val === 'COMBUSTIBLE') {
                                  const nextFuel = it.tipoCombustible || defaultFuel;
                                  const catalogPrice = availableFuelCatalog.prices[nextFuel] || 0;
                                  const nextPrice = it.precioUnitario > 0 ? it.precioUnitario : catalogPrice;
                                  return {
                                    ...it,
                                    tipoItem: val,
                                    tipoCombustible: nextFuel,
                                    unidadMedida: 'L',
                                    descripcion: it.descripcion.trim() ? it.descripcion : nextFuel,
                                    precioUnitario: nextPrice,
                                    subtotal: round2(it.cantidad * nextPrice)
                                  };
                                }
                                return { ...it, tipoItem: val, tipoCombustible: undefined };
                              }));
                            }}
                            className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-1.5 text-xs text-white"
                          >
                            {Object.entries(PURCHASE_ITEM_TYPES).map(([key, meta]) => (
                              <option key={key} value={key}>{meta.label}</option>
                            ))}
                          </select>
                        </div>

                        {isFuelLine && (
                          <div className="md:col-span-4">
                            <div className="flex items-center justify-between mb-0.5">
                              <label className={`text-[10px] font-semibold ${errComb ? 'text-red-400' : 'text-amber-400'}`}>
                                Tipo de Combustible *
                              </label>
                              <button
                                type="button"
                                onClick={() => handleOpenQuickCatalogModal('COMBUSTIBLE', idx)}
                                className="text-[10px] text-emerald-400 hover:underline font-bold cursor-pointer"
                              >
                                + Nuevo
                              </button>
                            </div>
                            <select
                              value={item.tipoCombustible || fuelOptions[0] || 'DIESEL COMUN'}
                              onChange={(e) => {
                                const selectedFuel = e.target.value;
                                const catalogPrice = availableFuelCatalog.prices[selectedFuel] || 0;
                                setFormItems(prev => prev.map((it, i) => {
                                  if (i !== idx) return it;
                                  const wasFuelDesc = !it.descripcion.trim() || availableFuelCatalog.types.includes(it.descripcion.trim().toUpperCase()) || it.descripcion === it.tipoCombustible;
                                  const nextPrice = catalogPrice > 0 ? catalogPrice : it.precioUnitario;
                                  return {
                                    ...it,
                                    tipoCombustible: selectedFuel,
                                    unidadMedida: 'L',
                                    descripcion: wasFuelDesc ? selectedFuel : it.descripcion,
                                    precioUnitario: nextPrice,
                                    subtotal: round2(it.cantidad * nextPrice)
                                  };
                                }));
                                clearFormError(`item_${idx}_combustible`);
                                clearFormError(`item_${idx}_descripcion`);
                              }}
                              className={`w-full rounded p-1.5 text-xs font-semibold focus:outline-none ${
                                errComb
                                  ? 'bg-red-950/30 border-2 border-red-500 text-red-200'
                                  : 'bg-[#16191F] border border-amber-500/40 text-amber-200 focus:border-amber-400'
                              }`}
                            >
                              {fuelOptions.map(ft => (
                                <option key={ft} value={ft}>{ft}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="md:col-span-2">
                          <label className="block text-[10px] text-slate-400 mb-0.5">Código</label>
                          <input
                            type="text"
                            value={item.codigo}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, codigo: val } : it));
                            }}
                            placeholder={isFuelLine ? 'COMB' : 'Cód.'}
                            className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-1.5 text-xs text-white font-mono"
                          />
                        </div>

                        <div className={isFuelLine ? 'md:col-span-3' : 'md:col-span-7'}>
                          <label className={`block text-[10px] mb-0.5 ${errDesc ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                            Descripción *
                          </label>
                          <input
                            type="text"
                            value={item.descripcion}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, descripcion: val } : it));
                              if (val.trim()) clearFormError(`item_${idx}_descripcion`);
                            }}
                            placeholder={
                              isFuelLine
                                ? 'Detalle / combustible facturado'
                                : formCategoriaCompra === 'LIBRERIA_INSUMOS'
                                  ? 'Ej: Cuadernos A4 x 100 hojas / Resma'
                                  : formCategoriaCompra === 'MANTENIMIENTO_FILTROS'
                                    ? 'Ej: Filtro de aceite / Kit mantenimiento'
                                    : formCategoriaCompra === 'INDUMENTARIA'
                                      ? 'Ej: Botines seguridad / Mameluco'
                                      : formCategoriaCompra === 'BIENES_CAMBIO_LOCAL'
                                        ? 'Ej: Mercadería / Insumos p/ local'
                                        : 'Descripción del producto o servicio'
                            }
                            className={`w-full rounded p-1.5 text-xs text-white focus:outline-none ${
                              errDesc
                                ? 'bg-red-950/30 border-2 border-red-500'
                                : 'bg-[#16191F] border border-[#2D2D2D] focus:border-[#F0C800]'
                            }`}
                          />
                          {errDesc && <p className="text-[10px] text-red-400 mt-0.5">{errDesc}</p>}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
                        <div className="md:col-span-3">
                          <label className={`block text-[10px] mb-0.5 ${errQty ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                            {isFuelLine ? 'Cantidad (Litros) *' : 'Cantidad *'}
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={item.cantidad}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setFormItems(prev => prev.map((it, i) => i === idx ? {
                                ...it,
                                cantidad: val,
                                subtotal: round2(val * it.precioUnitario)
                              } : it));
                              if (val > 0) clearFormError(`item_${idx}_cantidad`);
                            }}
                            className={`w-full rounded p-1.5 text-xs text-white font-mono focus:outline-none ${
                              errQty
                                ? 'bg-red-950/30 border-2 border-red-500'
                                : 'bg-[#16191F] border border-[#2D2D2D] focus:border-[#F0C800]'
                            }`}
                          />
                          {errQty && <p className="text-[10px] text-red-400 mt-0.5">{errQty}</p>}
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[10px] text-slate-400 mb-0.5">U.M.</label>
                          <input
                            type="text"
                            value={item.unidadMedida}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, unidadMedida: val } : it));
                            }}
                            placeholder="UNI"
                            className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-1.5 text-xs text-white font-mono uppercase"
                          />
                        </div>

                        <div className="md:col-span-3">
                          <label className={`block text-[10px] mb-0.5 ${errPrice ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                            {isFuelLine ? 'Precio $/L (Neto) *' : 'Precio Unit. $ *'}
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={item.precioUnitario}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setFormItems(prev => prev.map((it, i) => i === idx ? {
                                ...it,
                                precioUnitario: val,
                                subtotal: round2(it.cantidad * val)
                              } : it));
                              if (val > 0) clearFormError(`item_${idx}_precio`);
                            }}
                            className={`w-full rounded p-1.5 text-xs text-white font-mono focus:outline-none ${
                              errPrice
                                ? 'bg-red-950/30 border-2 border-red-500'
                                : 'bg-[#16191F] border border-[#2D2D2D] focus:border-[#F0C800]'
                            }`}
                          />
                          {errPrice && <p className="text-[10px] text-red-400 mt-0.5">{errPrice}</p>}
                        </div>

                        <div className="col-span-2 md:col-span-4 flex items-end gap-1.5">
                          <div className="flex-1">
                            <label className={`block text-[10px] font-semibold mb-0.5 ${errPrice ? 'text-red-400' : 'text-emerald-400'}`}>
                              Subtotal Neto $
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={item.subtotal}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setFormItems(prev => prev.map((it, i) => {
                                  if (i !== idx) return it;
                                  const nextPrice = it.cantidad > 0 ? Number((val / it.cantidad).toFixed(4)) : it.precioUnitario;
                                  return {
                                    ...it,
                                    subtotal: val,
                                    precioUnitario: nextPrice
                                  };
                                }));
                                if (val > 0) clearFormError(`item_${idx}_precio`);
                              }}
                              className={`w-full rounded p-1.5 text-xs font-mono font-bold focus:outline-none ${
                                errPrice
                                  ? 'bg-red-950/30 border-2 border-red-500 text-red-300'
                                  : 'bg-[#16191F] border border-emerald-500/40 text-emerald-400 focus:border-emerald-400'
                              }`}
                            />
                          </div>
                          {formItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItemFromForm(idx)}
                              className="text-red-400 hover:text-red-300 p-1.5 cursor-pointer"
                              title="Quitar línea"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {!isFuelLine && (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end pt-2 border-t border-[#1D2128]">
                          <div className="md:col-span-5">
                            <label className="block text-[10px] text-slate-400 mb-0.5">
                              Control de Stock / Imputación de esta compra
                            </label>
                            <select
                              value={item.modoImputacion || 'SIN_STOCK'}
                              onChange={(e) => {
                                const mode = e.target.value as StockControlMode;
                                const defaultWh = getDefaultWarehouseForCat(formCategoriaCompra);
                                setFormItems(prev => prev.map((it, i) => i === idx ? {
                                  ...it,
                                  modoImputacion: mode,
                                  depositoId: mode === 'STOCK_FRACCIONABLE' ? (it.depositoId || defaultWh?.id) : undefined,
                                  depositoNombre: mode === 'STOCK_FRACCIONABLE' ? (it.depositoNombre || defaultWh?.nombre) : undefined,
                                  equipoId: mode === 'DIRECTO_EQUIPO' ? it.equipoId : undefined,
                                  equipoLabel: mode === 'DIRECTO_EQUIPO' ? it.equipoLabel : undefined
                                } : it));
                                clearFormError(`item_${idx}_deposito`);
                                clearFormError(`item_${idx}_equipo`);
                              }}
                              className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#F0C800]"
                            >
                              <option value="STOCK_FRACCIONABLE">Control de Stock en Depósito (ej: tambor grasa, filtros, salidas parciales)</option>
                              <option value="DIRECTO_EQUIPO">100% Directo a un Equipo (ej: 1L aceite 2T/4T, no queda en stock)</option>
                              <option value="SIN_STOCK">Sin Control de Stock (Gasto General / Librería / Servicios)</option>
                            </select>
                          </div>

                          {item.modoImputacion === 'STOCK_FRACCIONABLE' && (
                            <div className="md:col-span-7">
                              <div className="flex items-center justify-between mb-0.5">
                                <label className={`text-[10px] font-semibold ${errDeposito ? 'text-red-400' : 'text-emerald-400'}`}>
                                  Depósito Destino (Ingresa al Stock al guardar) *
                                </label>
                                <button
                                  type="button"
                                  onClick={() => handleOpenQuickWarehouseModal(idx)}
                                  className="text-[10px] text-emerald-400 hover:underline font-bold cursor-pointer"
                                >
                                  + Nuevo Depósito / Sub-depósito Taller
                                </button>
                              </div>
                              <select
                                value={item.depositoId || ''}
                                onChange={(e) => {
                                  const whId = e.target.value;
                                  const wh = availableWarehouses.find(w => w.id === whId);
                                  setFormItems(prev => prev.map((it, i) => i === idx ? {
                                    ...it,
                                    depositoId: whId,
                                    depositoNombre: wh?.nombre
                                  } : it));
                                  if (whId) clearFormError(`item_${idx}_deposito`);
                                }}
                                className={`w-full rounded p-1.5 text-xs focus:outline-none ${
                                  errDeposito
                                    ? 'bg-red-950/30 border-2 border-red-500 text-red-200'
                                    : 'bg-[#16191F] border border-emerald-500/40 text-emerald-200 focus:border-emerald-400'
                                }`}
                              >
                                <option value="">-- Seleccionar Depósito --</option>
                                {availableWarehouses.map(w => (
                                  <option key={w.id} value={w.id}>
                                    {w.icono || '📦'} {w.nombre} ({w.codigo})
                                  </option>
                                ))}
                              </select>
                              {errDeposito && <p className="text-[10px] text-red-400 mt-0.5">{errDeposito}</p>}
                            </div>
                          )}

                          {item.modoImputacion === 'DIRECTO_EQUIPO' && (
                            <div className="md:col-span-7">
                              <label className={`block text-[10px] font-semibold mb-0.5 ${errEquipo ? 'text-red-400' : 'text-amber-400'}`}>
                                Equipo / Máquina Destino (100% del gasto) *
                              </label>
                              <select
                                value={item.equipoId || ''}
                                onChange={(e) => {
                                  const eqId = e.target.value;
                                  const eq = fleet.find(v => v.id === eqId);
                                  const eqLabel = eq ? `${eq.codigoInterno ? `[${eq.codigoInterno}] ` : ''}${eq.modeloMarca}` : '';
                                  setFormItems(prev => prev.map((it, i) => i === idx ? {
                                    ...it,
                                    equipoId: eqId,
                                    equipoLabel: eqLabel
                                  } : it));
                                  if (eqId) clearFormError(`item_${idx}_equipo`);
                                }}
                                className={`w-full rounded p-1.5 text-xs focus:outline-none ${
                                  errEquipo
                                    ? 'bg-red-950/30 border-2 border-red-500 text-red-200'
                                    : 'bg-[#16191F] border border-amber-500/40 text-amber-200 focus:border-amber-400'
                                }`}
                              >
                                <option value="">-- Seleccionar Equipo / Máquina --</option>
                                {fleet.map(v => (
                                  <option key={v.id} value={v.id}>
                                    {v.codigoInterno ? `[${v.codigoInterno}] ` : ''}{v.modeloMarca}{v.patente ? ` (${v.patente})` : ''}
                                  </option>
                                ))}
                              </select>
                              {errEquipo && <p className="text-[10px] text-red-400 mt-0.5">{errEquipo}</p>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* VINCULACIÓN INTERACTIVA DE REMITOS / CARGAS DE COMBUSTIBLE (SOLO COMBUSTIBLE) */}
              {showFuelLinkingSection && (
                <div className="bg-[#0F1115] p-3.5 rounded-xl border border-amber-500/20 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2D2D2D] pb-2.5">
                    <div className="flex items-center gap-2">
                      <Fuel className="w-4 h-4 text-amber-400" />
                      <div>
                        <span className="text-xs font-bold text-white uppercase tracking-wider block">
                          Vincular Remitos / Cargas de Combustible (Armado de Legajito)
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Seleccione las cargas de la estación que están incluidas en esta factura
                        </span>
                      </div>
                    </div>

                    {formSelectedRemitos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleAutoFillCombustibleItem(formSelectedRemitos)}
                        className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shadow-sm"
                        title="Agrupa por tipo de combustible, calcula litros y precio unitario e inserta las líneas en la factura"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Auto-cargar líneas por combustible</span>
                      </button>
                    )}
                  </div>

                  {/* Filtros de Remitos */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="relative w-full sm:w-72">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar ticket, orden, chofer, equipo, combustible..."
                        value={remitoSearchTerm}
                        onChange={(e) => setRemitoSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-[#16191F] border border-[#2D2D2D] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-end">
                      <span className="text-[11px] text-slate-400 font-mono">
                        {formSelectedRemitos.length} seleccionados
                      </span>
                      {formSelectedRemitos.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setFormSelectedRemitos([])}
                          className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                        >
                          Desmarcar todos
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Lista de Remitos con scroll */}
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 divide-y divide-[#1D2128]">
                    {fuelVouchers
                      .filter(v => {
                        const vKey = getVoucherKey(v);
                        const q = remitoSearchTerm.toLowerCase();
                        if (!q) return true;
                        return vKey.toLowerCase().includes(q) ||
                          (v.codigoEquipo || '').toLowerCase().includes(q) ||
                          (v.patente || '').toLowerCase().includes(q) ||
                          (v.nombreApellido || v.codigoEmpleado || '').toLowerCase().includes(q) ||
                          (v.tipoComb || '').toLowerCase().includes(q) ||
                          (v.fecha || '').toLowerCase().includes(q);
                      })
                      .slice(0, 40)
                      .map(v => {
                        const vKey = getVoucherKey(v);
                        const isSelected = formSelectedRemitos.includes(vKey);
                        const isAlreadyLinkedOther = allLinkedRemitosSet.has(vKey) && !isSelected;

                        return (
                          <div
                            key={v.id || vKey}
                            onClick={() => {
                              setFormSelectedRemitos(prev => 
                                prev.includes(vKey) ? prev.filter(k => k !== vKey) : [...prev, vKey]
                              );
                            }}
                            className={`p-2 rounded-lg flex items-center justify-between gap-3 text-xs cursor-pointer transition ${
                              isSelected 
                                ? 'bg-amber-500/15 border border-amber-500/40' 
                                : 'bg-[#16191F] hover:bg-[#1C2028] border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-500 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-white">
                                    {v.numTicket ? `Ticket: ${v.numTicket}` : `Remito/Orden: ${vKey}`}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">{v.fecha}</span>
                                  {isAlreadyLinkedOther && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                      En otra factura
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  <span className="text-slate-300 font-semibold">{v.codigoEquipo || v.patente || 'Equipo'}</span>
                                  {' • '}
                                  <span>{v.nombreApellido || v.codigoEmpleado || 'Chofer'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="font-mono font-bold text-emerald-400">
                                {Number(v.cantidad || v.cantCarga || 0).toFixed(1)} Lts
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {v.tipoComb || 'DIESEL COMUN'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* ADJUNTAR ARCHIVOS Y DOCUMENTOS FÍSICOS (PDF, REMITOS, FOTOS) */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2D2D2D] pb-2.5">
                  <div className="flex items-center gap-2">
                    <FileUp className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="text-xs font-bold text-white uppercase tracking-wider block">
                        Adjuntar Comprobantes y Remitos Físicos (Legajo Digital)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Suba la Factura escaneada (PDF/Imagen) y las fotos/escaneos de remitos de la estación
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>+ Adjuntar Factura / Remito</span>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        multiple
                        onChange={(e) => handleFileUploadForForm(e, 'REMITO')}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Lista de adjuntos subidos en el formulario */}
                {formArchivosAdjuntos.length === 0 ? (
                  <div className="text-center py-3 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
                    Sin archivos adjuntados aún. Puede subir la Factura PDF o fotos de los remitos de la estación.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {formArchivosAdjuntos.map((att) => (
                      <div key={att.id} className="bg-[#16191F] p-2.5 rounded-lg border border-[#2D2D2D] flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          {att.nombre.toLowerCase().endsWith('.pdf') ? (
                            <FileText className="w-4 h-4 text-red-400 shrink-0" />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="text-white font-medium block truncate text-xs">{att.nombre}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{att.tamanio || 'Archivo'} • {att.tipo}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-400 hover:text-white"
                            title="Ver documento"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRemoveFormAttachment(att.id)}
                            className="p-1 text-red-400 hover:text-red-300"
                            title="Quitar de la lista"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Discriminación Impositiva Exacta (NETO / I.V.A. / I.C.L. / I.D.C. / TV / PERC. IIBB / PERC. I.V.A.) */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-[#2D2D2D] space-y-3">
                <div className="flex items-center justify-between border-b border-[#2D2D2D] pb-2">
                  <span className="text-[11px] font-black text-white uppercase tracking-wider">
                    Impuestos & Percepciones de la Factura
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    NETO: ${formNetoGravado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-400">
                        I.V.A. $ {formIvaManual === null ? (formTipoComp === 'FACTURA_C' ? '(0%)' : '(Auto 21%)') : '(Manual)'}
                      </label>
                      {formIvaManual !== null && (
                        <button
                          type="button"
                          onClick={() => setFormIvaManual(null)}
                          className="text-[10px] text-[#F0C800] hover:underline cursor-pointer"
                        >
                          Auto 21%
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formIvaEfectivo}
                      onChange={(e) => setFormIvaManual(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-2 text-xs text-blue-300 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                      I.C.L. $ (Comb. Líq.)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formIcl}
                      onChange={(e) => setFormIcl(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                      I.D.C. $ (Dióx. Carb.)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formIdc}
                      onChange={(e) => setFormIdc(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      T.V. $ (Tasa Vial)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formTasaVial}
                      onChange={(e) => setFormTasaVial(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Perc. IIBB $</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formPercepcionIibb}
                      onChange={(e) => setFormPercepcionIibb(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Perc. I.V.A. $</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formPercepcionIva}
                      onChange={(e) => setFormPercepcionIva(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Ajuste / Redondeo $
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formAjusteRedondeo}
                      onChange={(e) => setFormAjusteRedondeo(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full bg-[#16191F] border border-[#2D2D2D] rounded p-2 text-xs text-slate-200 font-mono"
                    />
                  </div>

                  <div className="flex flex-col justify-end text-right bg-[#16191F] p-2 rounded border border-amber-500/30">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">TOTAL $</span>
                    <span className={`text-base font-black font-mono ${formErrors.total ? 'text-red-400' : 'text-amber-400'}`}>
                      ${formTotalCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#2D2D2D] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 font-mono">
                  <span>NETO: <strong className="text-white">${formNetoGravado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  <span>I.V.A.: <strong className="text-blue-300">${formIvaEfectivo.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  <span>I.C.L.: <strong className="text-slate-200">${formIcl.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  <span>I.D.C.: <strong className="text-slate-200">${formIdc.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  <span>TV: <strong className="text-slate-200">${formTasaVial.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  <span>PERC. IIBB: <strong className="text-slate-200">${formPercepcionIibb.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  <span>PERC. I.V.A.: <strong className="text-slate-200">${formPercepcionIva.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#2D2D2D] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewInvoiceModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingInvoice}
                  className="px-5 py-2 bg-[#F0C800] text-[#2D2D2D] text-xs font-black rounded-xl hover:bg-[#F6D84C] disabled:opacity-50 transition cursor-pointer"
                >
                  {isSavingInvoice ? 'Guardando en Supabase...' : 'Guardar Factura en Legajo'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* SUB-MODAL: ALTA RÁPIDA DE ARTÍCULO O COMBUSTIBLE DESDE EL FORM */}
      {quickCatalogModal.open && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-emerald-500/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-wider">
                  {quickArtMode === 'COMBUSTIBLE'
                    ? 'Alta Rápida de Tipo de Combustible'
                    : 'Alta Rápida de Artículo al Catálogo'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setQuickCatalogModal(prev => ({ ...prev, open: false }))}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickCatalogSubmit} className="p-5 space-y-3.5">
              {quickArtError && (
                <div className="bg-red-950/80 border border-red-500 text-red-200 text-xs p-2.5 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{quickArtError}</span>
                </div>
              )}

              {quickArtMode === 'ARTICULO' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Código *</label>
                    <input
                      type="text"
                      value={quickArtCodigo}
                      onChange={(e) => setQuickArtCodigo(e.target.value)}
                      placeholder="Ej: 08-0958"
                      className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Unidad de Medida</label>
                    <select
                      value={quickArtUnidad}
                      onChange={(e) => setQuickArtUnidad(e.target.value as StockUnit)}
                      className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                    >
                      <option value="UNIDAD">UNIDAD (UNI)</option>
                      <option value="LITROS">LITROS (L)</option>
                      <option value="KG">KILOGRAMOS (KG)</option>
                      <option value="CAJA">CAJA</option>
                      <option value="KIT">KIT</option>
                      <option value="JUEGO">JUEGO</option>
                      <option value="PAR">PAR</option>
                      <option value="BIDON_20L">BIDÓN 20L</option>
                      <option value="BALDE_20KG">BALDE 20KG</option>
                      <option value="TAMBOR_205L">TAMBOR 205L</option>
                      <option value="METRO">METRO</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {quickArtMode === 'COMBUSTIBLE' ? 'Nombre del Combustible *' : 'Nombre / Descripción del Artículo *'}
                </label>
                <input
                  type="text"
                  value={quickArtNombre}
                  onChange={(e) => setQuickArtNombre(e.target.value)}
                  placeholder={quickArtMode === 'COMBUSTIBLE' ? 'Ej: DIESEL ULTRA / NAFTA QUANTIUM' : 'Ej: CUADERNO A4 TAPA DURA / FILTRO HIDRÁULICO'}
                  className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                />
              </div>

              {quickArtMode === 'ARTICULO' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Rubro / Categoría *
                    </label>
                    <select
                      value={quickArtCategoria}
                      onChange={(e) => setQuickArtCategoria(e.target.value)}
                      className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                    >
                      {availableRubrosDropdown.map(rubro => (
                        <option key={rubro} value={rubro}>
                          {rubro}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Control de Stock / Forma de Consumo *
                    </label>
                    <select
                      value={quickArtControlMode}
                      onChange={(e) => setQuickArtControlMode(e.target.value as StockControlMode)}
                      className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                    >
                      <option value="STOCK_FRACCIONABLE">
                        Lleva Control de Stock (Ingresa a Depósito — salidas a varios equipos)
                      </option>
                      <option value="DIRECTO_EQUIPO">
                        100% Directo a un Equipo (Sin stock general, ej: 1L aceite 2T/4T)
                      </option>
                      <option value="SIN_STOCK">
                        Sin Control de Stock (Gasto general / librería)
                      </option>
                    </select>
                  </div>

                  {quickArtControlMode === 'STOCK_FRACCIONABLE' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-emerald-400">
                          Depósito Destino *
                        </label>
                        <button
                          type="button"
                          onClick={() => handleOpenQuickWarehouseModal('QUICK_ART')}
                          className="text-[11px] text-emerald-400 hover:underline font-bold cursor-pointer"
                        >
                          + Nuevo Depósito / Sub-depósito Taller
                        </button>
                      </div>
                      <select
                        value={quickArtDepositoId}
                        onChange={(e) => setQuickArtDepositoId(e.target.value)}
                        className="w-full bg-[#0F1115] border border-emerald-500/40 rounded-lg p-2 text-xs text-emerald-200 focus:outline-none focus:border-emerald-400"
                      >
                        {availableWarehouses.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.icono || '📦'} {w.nombre} ({w.codigo})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    {quickArtMode === 'COMBUSTIBLE' ? 'Precio Ref. $/L' : 'Precio Unit. Neto Ref. $'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={quickArtPrecio}
                    onChange={(e) => setQuickArtPrecio(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                  />
                </div>

                {quickArtMode === 'ARTICULO' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Stock Mínimo Alerta</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={quickArtStockMin}
                      onChange={(e) => setQuickArtStockMin(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#2D2D2D] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickCatalogModal(prev => ({ ...prev, open: false }))}
                  className="px-3.5 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickArt}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-black rounded-xl cursor-pointer"
                >
                  {isSavingQuickArt ? 'Guardando...' : 'Guardar y Usar en Factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-MODAL: ALTA RÁPIDA DE DEPÓSITO / SUB-DEPÓSITO DE TALLER */}
      {quickWarehouseModal.open && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-emerald-500/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-wider">
                  Nuevo Depósito / Sub-depósito Taller
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setQuickWarehouseModal({ open: false, targetScope: null })}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickWarehouseSubmit} className="p-5 space-y-3.5">
              {quickWhError && (
                <div className="bg-red-950/80 border border-red-500 text-red-200 text-xs p-2.5 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{quickWhError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Nombre del Depósito / Sector *
                </label>
                <input
                  type="text"
                  value={quickWhNombre}
                  onChange={(e) => setQuickWhNombre(e.target.value)}
                  placeholder="Ej: Depósito Taller - Filtros / Repuestos / Insumos"
                  className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Tipo de Depósito
                </label>
                <select
                  value={quickWhTipo}
                  onChange={(e) => setQuickWhTipo(e.target.value as StockWarehouseType)}
                  className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                >
                  <option value="TALLER">Sub-depósito Taller (Insumos / Repuestos / Filtros)</option>
                  <option value="VENTAS">Depósito de Ventas / Salón</option>
                  <option value="HERRAMIENTAS">Pañol de Herramientas</option>
                  <option value="INDUMENTARIA">Depósito Ropa e Indumentaria (EPP)</option>
                  <option value="PERSONALIZADO">Depósito Personalizado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Ubicación / Estantería (Opcional)
                </label>
                <input
                  type="text"
                  value={quickWhUbicacion}
                  onChange={(e) => setQuickWhUbicacion(e.target.value)}
                  placeholder="Ej: Galpón Taller - Estantería B"
                  className="w-full bg-[#0F1115] border border-[#2D2D2D] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="pt-3 border-t border-[#2D2D2D] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickWarehouseModal({ open: false, targetScope: null })}
                  className="px-3.5 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickWh}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-black rounded-xl cursor-pointer"
                >
                  {isSavingQuickWh ? 'Guardando...' : 'Crear Depósito en Supabase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VER LEGAJO DIGITAL DE FACTURA */}
      {selectedInvoiceForLegajo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl space-y-0">
            
            <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Legajo Digital: Factura {selectedInvoiceForLegajo.nroComprobanteCompleto}
                </h3>
              </div>
              <button
                onClick={() => setSelectedInvoiceForLegajo(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              
              {/* Header Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#0F1115] p-4 rounded-xl border border-[#2D2D2D]">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Proveedor</span>
                  <div className="text-sm font-bold text-white">{selectedInvoiceForLegajo.proveedorNombre}</div>
                  <div className="text-xs text-slate-400 font-mono">CUIT: {selectedInvoiceForLegajo.proveedorCuit}</div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Fecha de Emisión</span>
                  <div className="text-sm font-mono text-white">{selectedInvoiceForLegajo.fechaEmision}</div>
                  {selectedInvoiceForLegajo.cae && (
                    <div className="text-xs text-emerald-400 font-mono">CAE: {selectedInvoiceForLegajo.cae}</div>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Monto Total Factura</span>
                  <div className="text-2xl font-black text-amber-400 font-mono">
                    ${selectedInvoiceForLegajo.montoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-white tracking-wider">Detalle de Conceptos Facturados</h4>
                <div className="bg-[#0F1115] rounded-xl border border-[#2D2D2D] overflow-hidden">
                  <table className="w-full text-xs text-left text-slate-300">
                    <thead className="bg-[#1F2228] text-slate-400 uppercase text-[9px] font-bold">
                      <tr>
                        <th className="p-2.5">Código</th>
                        <th className="p-2.5">Descripción / Destino</th>
                        <th className="p-2.5 text-center">Cantidad</th>
                        <th className="p-2.5 text-right">Precio Unit.</th>
                        <th className="p-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2D2D2D]">
                      {selectedInvoiceForLegajo.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-mono text-slate-400">{it.codigo || '-'}</td>
                          <td className="p-2.5 font-medium text-white">
                            <div>{it.descripcion}</div>
                            {(it.depositoNombre || it.equipoLabel) && (
                              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                {it.depositoNombre && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                    Depósito: {it.depositoNombre}
                                  </span>
                                )}
                                {it.equipoLabel && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                                    100% Equipo: {it.equipoLabel}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-mono">{it.cantidad} {it.unidadMedida || 'UNI'}</td>
                          <td className="p-2.5 text-right font-mono">${it.precioUnitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-400">${it.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Rubro de Compra */}
              <div className="flex items-center gap-2">
                {(() => {
                  const catMeta = getCategoryMeta(inferInvoiceCategory(selectedInvoiceForLegajo));
                  return (
                    <span className={`px-2.5 py-1 rounded-lg border text-xs font-bold uppercase ${catMeta.badgeClass}`}>
                      Rubro: {catMeta.label}
                    </span>
                  );
                })()}
              </div>

              {/* Remitos Facturados (Vínculo Legajo - Combustible) */}
              {(inferInvoiceCategory(selectedInvoiceForLegajo) === 'COMBUSTIBLE' || (selectedInvoiceForLegajo.remitosAsociadosIds?.length || 0) > 0) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Fuel className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-black uppercase text-white tracking-wider">
                      Cargas y Remitos de Combustible en este Legajo ({selectedInvoiceForLegajo.remitosAsociadosIds?.length || 0})
                    </h4>
                  </div>
                  <button
                    onClick={() => {
                      setLinkingInvoice(selectedInvoiceForLegajo);
                      setTempLinkedRemitos([...(selectedInvoiceForLegajo.remitosAsociadosIds || [])]);
                      setRemitoSearchTerm('');
                    }}
                    className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Modificar Cargas Vinculadas</span>
                  </button>
                </div>

                {selectedInvoiceForLegajo.remitosAsociadosIds && selectedInvoiceForLegajo.remitosAsociadosIds.length > 0 ? (
                  <div className="bg-[#0F1115] rounded-xl border border-[#2D2D2D] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left text-slate-300">
                        <thead className="bg-[#1F2228] text-slate-400 uppercase text-[9px] font-bold">
                          <tr>
                            <th className="p-2.5">Fecha</th>
                            <th className="p-2.5">Ticket / Remito</th>
                            <th className="p-2.5">Equipo / Patente</th>
                            <th className="p-2.5">Chofer</th>
                            <th className="p-2.5 text-center">Combustible</th>
                            <th className="p-2.5 text-right">Litros</th>
                            <th className="p-2.5 text-right">Importe $</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2D2D2D]">
                          {selectedInvoiceForLegajo.remitosAsociadosIds.map((remitoId, idx) => {
                            const matchedVoucher = fuelVouchers.find(v => {
                              const key = getVoucherKey(v);
                              return key === remitoId || v.id === remitoId || v.numTicket === remitoId || v.numComprobante === remitoId;
                            });

                            return (
                              <tr key={idx} className="hover:bg-[#15181E] transition">
                                <td className="p-2.5 font-mono text-slate-400">{matchedVoucher?.fecha || selectedInvoiceForLegajo.fechaEmision}</td>
                                <td className="p-2.5 font-mono font-bold text-amber-400">
                                  {matchedVoucher?.numTicket ? `TK-${matchedVoucher.numTicket}` : remitoId}
                                </td>
                                <td className="p-2.5 font-medium text-white">
                                  {matchedVoucher?.codigoEquipo || matchedVoucher?.patente || 'Equipo asignado'}
                                </td>
                                <td className="p-2.5 text-slate-300">{matchedVoucher?.nombreApellido || matchedVoucher?.codigoEmpleado || '-'}</td>
                                <td className="p-2.5 text-center">
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                                    {matchedVoucher?.tipoComb || 'DIESEL'}
                                  </span>
                                </td>
                                <td className="p-2.5 text-right font-mono font-bold text-emerald-400">
                                  {matchedVoucher?.cantidad ? `${Number(matchedVoucher.cantidad).toFixed(1)} Lts` : '-'}
                                </td>
                                <td className="p-2.5 text-right font-mono text-white">
                                  {matchedVoucher?.totalImporte ? `$${matchedVoucher.totalImporte.toLocaleString('es-AR')}` : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#0F1115] p-4 rounded-xl border border-dashed border-slate-700 text-center text-slate-500 text-xs">
                    No hay cargas vinculadas a este comprobante.
                  </div>
                )}
              </div>
              )}

              {/* DOCUMENTOS Y COMPROBANTES ESCANEADOS (LEGAJO DIGITAL) */}
              <div className="space-y-3 pt-3 border-t border-[#2D2D2D]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileUp className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-black uppercase text-white tracking-wider">
                      Documentos & Comprobantes Escaneados del Legajo ({selectedInvoiceForLegajo.archivosAdjuntos?.length || (selectedInvoiceForLegajo.archivoPdfUrl ? 1 : 0)})
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                      <FileUp className="w-3.5 h-3.5" />
                      <span>+ Subir Factura PDF / Foto</span>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={(e) => handleAddAttachmentToLegajo(selectedInvoiceForLegajo, e, 'FACTURA')}
                        className="hidden"
                      />
                    </label>

                    <label className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>+ Adjuntar Fotos Remito</span>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        multiple
                        onChange={(e) => handleAddAttachmentToLegajo(selectedInvoiceForLegajo, e, 'REMITO')}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {(!selectedInvoiceForLegajo.archivosAdjuntos || selectedInvoiceForLegajo.archivosAdjuntos.length === 0) && !selectedInvoiceForLegajo.archivoPdfUrl ? (
                  <div className="bg-[#0F1115] p-5 rounded-xl border border-dashed border-slate-700 text-center space-y-2">
                    <FileUp className="w-6 h-6 text-slate-500 mx-auto" />
                    <p className="text-slate-400 text-xs font-medium">
                      No hay documentos físicos escaneados adjuntos a este legajo.
                    </p>
                    <p className="text-slate-500 text-[11px]">
                      Haga clic arriba en <strong className="text-red-400">+ Subir Factura PDF / Foto</strong> para adjuntar la factura oficial o en <strong className="text-emerald-400">+ Adjuntar Fotos Remito</strong> para subir los comprobantes de la estación.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Primary PDF if set */}
                    {selectedInvoiceForLegajo.archivoPdfUrl && !selectedInvoiceForLegajo.archivosAdjuntos?.some(a => a.url === selectedInvoiceForLegajo.archivoPdfUrl) && (
                      <div className="bg-[#0F1115] p-3 rounded-xl border border-[#2D2D2D] flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4 text-red-400" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white block truncate">Factura_Proveedor_Original.pdf</span>
                            <span className="text-[10px] text-slate-400 font-mono">Comprobante Oficial • PDF</span>
                          </div>
                        </div>
                        <a
                          href={selectedInvoiceForLegajo.archivoPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Ver</span>
                        </a>
                      </div>
                    )}

                    {/* Array of attachments */}
                    {selectedInvoiceForLegajo.archivosAdjuntos?.map(att => (
                      <div key={att.id} className="bg-[#0F1115] p-3 rounded-xl border border-[#2D2D2D] flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                            {att.nombre.toLowerCase().endsWith('.pdf') ? (
                              <FileText className="w-4 h-4 text-red-400" />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-blue-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white block truncate">{att.nombre}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{att.tamanio || 'Doc'} • {att.tipo} • {att.fechaSubida}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Ver</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachmentFromLegajo(selectedInvoiceForLegajo, att.id)}
                            className="p-1 text-red-400 hover:text-red-300"
                            title="Eliminar documento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL DEDICADO: VINCULAR / EDITAR CARGAS A UNA FACTURA */}
      {linkingInvoice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl space-y-0">
            <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Vincular Cargas de Combustible al Legajo
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Factura {linkingInvoice.nroComprobanteCompleto} • {linkingInvoice.proveedorNombre}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLinkingInvoice(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Buscador & Contadores */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0F1115] p-3 rounded-xl border border-[#2D2D2D]">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar ticket, orden, patente, chofer..."
                    value={remitoSearchTerm}
                    onChange={(e) => setRemitoSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-[#16191F] border border-[#2D2D2D] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-amber-400 font-bold">
                    {tempLinkedRemitos.length} cargas en legajo
                  </span>
                  {tempLinkedRemitos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTempLinkedRemitos([])}
                      className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer ml-1"
                    >
                      Desmarcar todas
                    </button>
                  )}
                </div>
              </div>

              {/* Lista de Cargas */}
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {fuelVouchers
                  .filter(v => {
                    const vKey = getVoucherKey(v);
                    const q = remitoSearchTerm.toLowerCase().trim();
                    if (!q) return true;
                    const haystack = `${vKey} ${v.id || ''} ${v.numTicket || ''} ${v.numEstacion || ''} ${v.numOrden || ''} ${v.numVale || ''} ${v.numComprobante || ''} ${v.codigoEquipo || ''} ${v.marcaModelo || ''} ${v.patente || ''} ${v.nombreApellido || ''} ${v.codigoEmpleado || ''} ${v.fecha || ''}`.toLowerCase();
                    return haystack.includes(q);
                  })
                  .map(v => {
                    const vKey = getVoucherKey(v);
                    const isChecked = tempLinkedRemitos.includes(vKey);
                    const isAlreadyInAnother = allLinkedRemitosSet.has(vKey) && !linkingInvoice.remitosAsociadosIds?.includes(vKey);
                    const displayTicket = v.numTicket || (/^\d{1,5}-\d{3,10}$/.test((v.numEstacion || '').trim()) ? v.numEstacion : '');

                    return (
                      <div
                        key={v.id || vKey}
                        onClick={() => {
                          setTempLinkedRemitos(prev => 
                            prev.includes(vKey) ? prev.filter(k => k !== vKey) : [...prev, vKey]
                          );
                        }}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs cursor-pointer transition ${
                          isChecked 
                            ? 'bg-amber-500/15 border-amber-500/40 text-white' 
                            : 'bg-[#0F1115] hover:bg-[#16191F] border-[#2D2D2D] text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-amber-300">
                                {displayTicket ? `Ticket: ${displayTicket}` : `Comprobante: ${vKey}`}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">{v.fecha}</span>
                              {isAlreadyInAnother && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                  En otra factura
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              <span className="text-white font-medium">{v.marcaModelo || v.codigoEquipo || v.patente || 'Equipo'}</span>
                              {' • '}
                              <span>{v.nombreApellido || v.codigoEmpleado || 'Chofer'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono font-bold text-emerald-400">
                            {Number(v.cantidad || v.cantCarga || 0).toFixed(1)} Lts
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {v.tipoComb || 'DIESEL'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Footer Acciones */}
              <div className="pt-3 border-t border-[#2D2D2D] flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {tempLinkedRemitos.length} cargas quedarán asociadas a esta factura.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLinkingInvoice(null)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-700 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveLinkedRemitos(linkingInvoice.id, tempLinkedRemitos)}
                    className="px-5 py-2 bg-[#F0C800] text-[#2D2D2D] text-xs font-black rounded-xl hover:bg-[#F6D84C] transition cursor-pointer"
                  >
                    Guardar Legajo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESUMEN DE CUENTA CORRIENTE REAL DE BASE DE DATOS */}
      {selectedProveedorForCtaCte && (() => {
        const provInvoices = purchaseInvoices.filter(i => 
          i.proveedorId === selectedProveedorForCtaCte.id || 
          (selectedProveedorForCtaCte.cuit && i.proveedorCuit === selectedProveedorForCtaCte.cuit)
        );
        const provPayments = supplierPayments.filter(p => p.proveedorId === selectedProveedorForCtaCte.id);

        interface CtaCteRow {
          fecha: string;
          comprobante: string;
          debito: number;
          credito: number;
        }

        const rows: CtaCteRow[] = [
          ...provInvoices.map(inv => ({
            fecha: inv.fechaEmision,
            comprobante: `${inv.tipoComprobante} ${inv.nroComprobanteCompleto}`,
            debito: inv.montoTotal || 0,
            credito: 0
          })),
          ...provPayments.map(p => ({
            fecha: p.fecha,
            comprobante: `ORDEN PAGO ${p.numeroComprobantePago || p.id}`,
            debito: 0,
            credito: p.montoTotal || 0
          }))
        ].sort((a, b) => a.fecha.localeCompare(b.fecha));

        let runningSaldo = 0;
        const computedRows = rows.map(r => {
          runningSaldo += (r.debito - r.credito);
          return { ...r, saldo: runningSaldo };
        });

        const totalDeuda = runningSaldo;

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white text-slate-900 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl p-8 space-y-6">
              
              <div className="flex items-start justify-between border-b border-slate-300 pb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{selectedProveedorForCtaCte.razonSocial}</h2>
                  <p className="text-xs text-slate-600">{selectedProveedorForCtaCte.direccion || 'Sin dirección registrada'}</p>
                  <p className="text-xs text-slate-600">CUIT: {selectedProveedorForCtaCte.cuit} • {selectedProveedorForCtaCte.condicionIva}</p>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-slate-500 uppercase">SALDO EN CUENTA CORRIENTE</span>
                  <div className={`text-2xl font-black font-mono mt-1 ${totalDeuda > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    ${totalDeuda.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                  <button
                    onClick={() => setSelectedProveedorForCtaCte(null)}
                    className="mt-2 text-xs text-red-600 font-bold hover:underline cursor-pointer"
                  >
                    [Cerrar Vista]
                  </button>
                </div>
              </div>

              {/* Cta Cte Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                      <th className="p-2">Fecha</th>
                      <th className="p-2">Comprobante</th>
                      <th className="p-2 text-right">Débitos (Facturas)</th>
                      <th className="p-2 text-right">Créditos (Pagos)</th>
                      <th className="p-2 text-right">Saldo $</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {computedRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500 font-sans italic">
                          No existen comprobantes ni pagos cargados para este proveedor en la base de datos.
                        </td>
                      </tr>
                    ) : (
                      computedRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2">{row.fecha}</td>
                          <td className="p-2 font-bold">{row.comprobante}</td>
                          <td className="p-2 text-right">{row.debito > 0 ? `$${row.debito.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}</td>
                          <td className="p-2 text-right text-emerald-700 font-bold">{row.credito > 0 ? `$${row.credito.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}</td>
                          <td className="p-2 text-right font-bold">${row.saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        );
      })()}

      <ConfirmDeleteModal
        isOpen={!!attachmentToDelete}
        title="¿Realmente desea eliminar este documento del legajo?"
        itemName={attachmentToDelete ? `${attachmentToDelete.nombre} (Factura ${attachmentToDelete.invoice.nroComprobanteCompleto})` : ''}
        onConfirm={confirmDeleteAttachmentFromLegajo}
        onCancel={() => setAttachmentToDelete(null)}
      />

      {/* MODAL: NUEVO PAGO A PROVEEDOR (INCLUYE ENDOSO DE CHEQUES EN CARTERA) */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-emerald-500/40 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="p-4 bg-[#1F2228] border-b border-[#2D2D2D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Registrar Orden de Pago a Proveedor
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Cancelá facturas de compra por transferencia, efectivo, cheque propio o endosando cheques de Cartera.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSupplierPayment} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Proveedor *
                  </label>
                  <select
                    required
                    value={payProveedorId}
                    onChange={(e) => {
                      setPayProveedorId(e.target.value);
                      setPayFacturasImputadas([]);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-semibold"
                  >
                    {proveedores.length === 0 && <option value="">Sin proveedores cargados</option>}
                    {proveedores.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.razonSocial} ({p.cuit})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Fecha de Pago *
                  </label>
                  <input
                    type="date"
                    required
                    value={payFecha}
                    onChange={(e) => setPayFecha(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white"
                  />
                </div>
              </div>

              {/* Facturas Pendientes del Proveedor */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="text-[11px] font-bold text-slate-300 uppercase">
                  Facturas Pendientes a Imputar ({pendingInvoicesForPayProveedor.length})
                </div>
                {pendingInvoicesForPayProveedor.length === 0 ? (
                  <p className="text-slate-500 italic">
                    Este proveedor no tiene facturas pendientes de pago (podés registrar un anticipo o pago directo).
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {pendingInvoicesForPayProveedor.map(inv => {
                      const checked = payFacturasImputadas.includes(inv.id);
                      return (
                        <label
                          key={inv.id}
                          className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer transition ${
                            checked
                              ? 'bg-emerald-500/10 border-emerald-500/40'
                              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleTogglePayInvoice(inv)}
                              className="accent-emerald-400"
                            />
                            <span className="font-mono font-bold text-white">
                              {inv.tipoComprobante} {inv.nroComprobanteCompleto}
                            </span>
                            <span className="text-slate-400 font-mono">{inv.fechaEmision}</span>
                          </div>
                          <span className="font-mono font-bold text-amber-300">
                            Saldo: ${Number(inv.saldoPendiente || inv.montoTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Forma de Pago */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Forma de Pago *
                  </label>
                  <select
                    value={payFormaPago}
                    onChange={(e) => {
                      const nextMode = e.target.value as typeof payFormaPago;
                      setPayFormaPago(nextMode);
                      if (nextMode !== 'CHEQUE_ENDOSADO') {
                        setPaySelectedChequeIds([]);
                      } else {
                        setPayMonto(0);
                        setPayComprobante('');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                  >
                    <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                    <option value="EFECTIVO_CAJA">Efectivo en Caja</option>
                    <option value="CHEQUE">Cheque Propio</option>
                    <option value="CHEQUE_ENDOSADO">
                      Cheque de Terceros (Endoso de Cartera — {availableChequesEnCartera.length} disp.)
                    </option>
                    <option value="OTROS">Otros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-emerald-300 uppercase mb-1">
                    Monto Total del Pago ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    readOnly={payFormaPago === 'CHEQUE_ENDOSADO'}
                    value={payMonto || ''}
                    onChange={(e) => setPayMonto(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-sm font-mono font-black text-emerald-300"
                  />
                </div>
              </div>

              {/* Selector de Cheques en Cartera cuando elige CHEQUE_ENDOSADO */}
              {payFormaPago === 'CHEQUE_ENDOSADO' && (
                <div className="bg-indigo-950/25 border border-indigo-500/35 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black text-indigo-300 uppercase flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-indigo-400" />
                      Seleccionar Cheques en Cartera para Endosar ({paySelectedChequeIds.length} elegidos)
                    </div>
                    {onNavigateToCarteraCheques && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsPaymentModalOpen(false);
                          onNavigateToCarteraCheques();
                        }}
                        className="text-[11px] font-bold text-indigo-300 underline cursor-pointer"
                      >
                        Ir a Cartera
                      </button>
                    )}
                  </div>

                  {availableChequesEnCartera.length === 0 ? (
                    <p className="text-slate-400">
                      No hay cheques disponibles en estado EN CARTERA para endosar.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {availableChequesEnCartera.map(ch => {
                        const checked = paySelectedChequeIds.includes(ch.id);
                        return (
                          <label
                            key={ch.id}
                            className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                              checked
                                ? 'bg-indigo-500/15 border-indigo-400'
                                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleEndorseCheque(ch)}
                                className="accent-indigo-400 shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="font-mono font-bold text-white truncate">
                                  {ch.tipo === 'ECHEQ' ? 'E-Cheq' : 'Cheque'} #{ch.numeroCheque} · {ch.bancoEmisor}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  Vto: {ch.fechaCobro} · {ch.clienteNombre || ch.libradorNombre}
                                </div>
                              </div>
                            </div>
                            <span className="font-mono font-black text-emerald-300 shrink-0">
                              ${Number(ch.importe || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {payFormaPago !== 'CHEQUE_ENDOSADO' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                      Banco / Cuenta Origen
                    </label>
                    <input
                      type="text"
                      value={payBancoOrigen}
                      onChange={(e) => setPayBancoOrigen(e.target.value)}
                      placeholder="Ej: Banco Macro / Caja Central"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                      N° Comprobante / Cheque / Transf.
                    </label>
                    <input
                      type="text"
                      value={payComprobante}
                      onChange={(e) => setPayComprobante(e.target.value)}
                      placeholder="Opcional"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Observaciones
                </label>
                <input
                  type="text"
                  value={payObservaciones}
                  onChange={(e) => setPayObservaciones(e.target.value)}
                  placeholder="Nota opcional de la orden de pago..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingPayment || (payFormaPago === 'CHEQUE_ENDOSADO' && paySelectedChequeIds.length === 0)}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black cursor-pointer disabled:opacity-50"
                >
                  {payFormaPago === 'CHEQUE_ENDOSADO'
                    ? 'Confirmar Endoso y Registrar Pago'
                    : 'Confirmar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
