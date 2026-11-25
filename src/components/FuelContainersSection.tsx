import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FolderOpen,
  Plus,
  Search,
  Fuel,
  FileText,
  Paperclip,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit2,
  Link2,
  GitBranch,
  Upload,
  Eye,
  X,
  Calendar,
  Building2,
  DollarSign,
  Droplets,
  ChevronDown,
  ChevronRight,
  Download,
  Sparkles,
  Check,
  Filter,
  ShoppingBag,
  Layers,
  Truck,
} from 'lucide-react';
import {
  FuelContainer,
  FuelContainerStatus,
  FuelContainerDocTipo,
  FuelContainerAdjunto,
  FuelContainerInvoiceRef,
  FuelContainerSubLink,
  FuelDispensary,
  FuelDeposit,
  Proveedor,
  PurchaseInvoice,
  Vehicle,
} from '../types';
import {
  getVoucherLiters,
  isVoucherIncomingToDeposit,
  isVoucherOutgoingFromDeposit,
  resolveMovementType,
} from '../utils/fuelStockReconciliation';
import { uploadFileToCloudflareR2 } from '../services/api';

interface FuelContainersSectionProps {
  containers: FuelContainer[];
  vouchers: FuelDispensary[];
  deposits: FuelDeposit[];
  proveedores: Proveedor[];
  purchaseInvoices: PurchaseInvoice[];
  fleet: Vehicle[];
  onSaveContainer: (container: FuelContainer) => Promise<void> | void;
  onDeleteContainer: (id: string) => Promise<void> | void;
  onShowToast?: (msg: string) => void;
}

const cleanStr = (s?: string) => (s || '').toLowerCase().trim();

const normalizeDateISO = (raw?: string): string => {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parts = trimmed.split(/[\/\-]/);
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (y && y.length === 4) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return trimmed;
};

const formatDateAR = (raw?: string): string => {
  const iso = normalizeDateISO(raw);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return raw || '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const formatMoney = (val: number): string =>
  `$ ${Math.round(val || 0).toLocaleString('es-AR')}`;

const formatLiters = (val: number): string =>
  `${Number(val || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} L`;

const isHexKey = (s?: string): boolean => /^[0-9a-f]{8}$/i.test((s || '').trim());

const isStationTicketFormat = (s?: string): boolean => {
  const val = (s || '').trim();
  if (!val) return false;
  if (/^(CIST-|EST-|DEP-)/i.test(val)) return false;
  // Station ticket numbers in imported sheets look like "0048-58524", "47-61074", "0036-4307" or >=4 digits
  return /^\d{1,5}-\d{3,10}$/.test(val) || /^\d{4,12}$/.test(val);
};

const getVoucherTicketNumber = (v: FuelDispensary): string => {
  if (v.numTicket && v.numTicket.trim()) return v.numTicket.trim();
  if (isStationTicketFormat(v.numEstacion)) return v.numEstacion!.trim();
  return '';
};

const getVoucherOrderOrValeNumber = (v: FuelDispensary): string => {
  const candidates = [v.numVale, v.numOrden, v.numComprobante];
  for (const c of candidates) {
    const trimmed = (c || '').trim();
    if (trimmed && !isHexKey(trimmed)) return trimmed;
  }
  for (const c of candidates) {
    const trimmed = (c || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
};

const getVoucherEquipmentLabel = (v: FuelDispensary): string => {
  const code = (v.codigoEquipo || '').trim();
  const model = (v.marcaModelo || '').trim();
  if (code && isHexKey(code) && model) {
    return model;
  }
  if (code && model && cleanStr(code) !== cleanStr(model)) {
    return `${model} (${code})`;
  }
  return model || code || 'Sin equipo';
};

const normalizeTicketVariants = (raw?: string): string => {
  const val = (raw || '').trim().toLowerCase();
  if (!val) return '';
  const noZerosParts = val
    .split(/[-/\s]+/)
    .map((p) => p.replace(/^0+(?=\d)/, ''))
    .join('-');
  const digitsOnly = val.replace(/[^0-9a-z]/g, '');
  const noZerosDigits = noZerosParts.replace(/[^0-9a-z]/g, '');
  return `${val} ${noZerosParts} ${digitsOnly} ${noZerosDigits}`;
};

const buildVoucherSearchHaystack = (v: FuelDispensary): string => {
  const ticketVariants = normalizeTicketVariants(v.numTicket);
  const estacionVariants = normalizeTicketVariants(v.numEstacion);
  const ordenVariants = normalizeTicketVariants(v.numOrden);
  const valeVariants = normalizeTicketVariants(v.numVale);
  const compVariants = normalizeTicketVariants(v.numComprobante);
  return cleanStr(
    `${v.id || ''} ${v.fecha || ''} ${formatDateAR(v.fecha)} ${v.codigoEquipo || ''} ${v.marcaModelo || ''} ${v.patente || ''} ${v.nombreApellido || ''} ${v.codigoEmpleado || ''} ${v.deposito || ''} ${v.tipoComb || ''} ${ticketVariants} ${estacionVariants} ${ordenVariants} ${valeVariants} ${compVariants} ${v.observaciones || ''}`
  );
};

const STATUS_META: Record<
  FuelContainerStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  ABIERTO: {
    label: 'Abierto',
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/40',
  },
  CONCILIADO: {
    label: 'Conciliado',
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-300',
    border: 'border-cyan-500/40',
  },
  PAGADO: {
    label: 'Pagado',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/40',
  },
  CERRADO: {
    label: 'Cerrado',
    bg: 'bg-slate-700/40',
    text: 'text-slate-300',
    border: 'border-slate-600/50',
  },
};

const DOC_TIPO_LABELS: Record<FuelContainerDocTipo, string> = {
  FACTURA: 'Factura',
  RESUMEN_PROVEEDOR: 'Resumen Proveedor',
  REMITO: 'Remito / Tickets',
  COMPROBANTE_PAGO: 'Comprobante Pago',
  OTRO: 'Otro Adjunto',
};

const CHULENGO_KEYWORDS = [
  'chulengo',
  'cisterna',
  'bidon',
  'bidón',
  'tanque movil',
  'tanque móvil',
  'deposito ambulante',
  'depósito ambulante',
  'dep-amb',
  'ambulante',
  'tanque aux',
  'depos.amarillo',
  'cist-mov',
];

const isVoucherChulengoLoad = (
  voucher: FuelDispensary,
  deposits: FuelDeposit[]
): { isChulengo: boolean; matchedDeposit?: FuelDeposit } => {
  const mobileDeposits = deposits.filter((d) => d.modalidad !== 'VALES_ESTACION');

  // If this voucher was dispatched FROM a mobile deposit/chulengo to a machine, it is an outgoing discharge, never an incoming chulengo load
  if (mobileDeposits.some((dep) => isVoucherOutgoingFromDeposit(voucher, dep))) {
    return { isChulengo: false };
  }
  if (
    cleanStr(voucher.tipo).includes('cisterna en obra') ||
    /^cist-/i.test((voucher.numEstacion || '').trim()) ||
    /^desp-/i.test((voucher.numOrden || '').trim())
  ) {
    return { isChulengo: false };
  }
  const depText = cleanStr(voucher.deposito);
  if (CHULENGO_KEYWORDS.some((kw) => depText.includes(kw))) {
    return { isChulengo: false };
  }

  for (const dep of mobileDeposits) {
    if (isVoucherIncomingToDeposit(voucher, dep)) {
      return { isChulengo: true, matchedDeposit: dep };
    }
  }

  const recipient = cleanStr(
    `${voucher.codigoEquipo} ${voucher.marcaModelo || ''} ${voucher.patente || ''}`
  );
  if (CHULENGO_KEYWORDS.some((kw) => recipient.includes(kw))) {
    const fuzzyDep = mobileDeposits.find((d) => {
      const dn = cleanStr(d.nombre);
      const dc = cleanStr(d.codigo);
      if (
        (recipient.includes('bidon') || recipient.includes('bidón')) &&
        d.modalidad === 'BIDONES'
      ) {
        return true;
      }
      return (dn && recipient.includes(dn)) || (dc && recipient.includes(dc));
    });
    return { isChulengo: true, matchedDeposit: fuzzyDep };
  }
  return { isChulengo: false };
};

const isVoucherInternalChulengoDischarge = (
  voucher: FuelDispensary,
  deposits: FuelDeposit[]
): boolean => {
  if (isVoucherChulengoLoad(voucher, deposits).isChulengo) return false;
  const mobileDeposits = deposits.filter((d) => d.modalidad !== 'VALES_ESTACION');
  if (mobileDeposits.some((dep) => isVoucherOutgoingFromDeposit(voucher, dep))) {
    return true;
  }
  const depText = cleanStr(voucher.deposito);
  if (CHULENGO_KEYWORDS.some((kw) => depText.includes(kw))) {
    return true;
  }
  if (
    cleanStr(voucher.tipo).includes('cisterna') ||
    /^cist/i.test((voucher.numEstacion || '').trim()) ||
    /^desp-/i.test((voucher.numOrden || '').trim())
  ) {
    return true;
  }
  // Historical imported field discharges from Chulengo (ESPENDIO_COMBUSTIBLE):
  // EGRESO to heavy machinery without a station ticket in numTicket or numEstacion
  const hasStationTicket = Boolean(getVoucherTicketNumber(voucher));
  if (
    !hasStationTicket &&
    !(voucher.numEstacion || '').trim() &&
    !(voucher.numTicket || '').trim()
  ) {
    return true;
  }
  return false;
};

// Distinguishes 220L Cisterna/Chulengo loads (e.g. DEPOS.AMARILLO 220 Lts) from Bidón loads
const isCisternaChulengoLoad = (
  voucher: FuelDispensary,
  deposits: FuelDeposit[]
): boolean => {
  if (!isVoucherChulengoLoad(voucher, deposits).isChulengo) return false;
  const rec = cleanStr(
    `${voucher.codigoEquipo || ''} ${voucher.marcaModelo || ''} ${voucher.tipoComb || ''}`
  );
  const isBidon = rec.includes('bidon') || rec.includes('bidón');
  return !isBidon;
};

/**
 * Automatically groups outgoing Chulengo -> Machine discharges by the chronological interval
 * [loadDate_i, loadDate_{i+1}) between consecutive Cisterna/Chulengo loads.
 */
const computeChronologicalChulengoSubLinks = (
  container: FuelContainer,
  vouchers: FuelDispensary[],
  deposits: FuelDeposit[],
  voucherMap: Map<string, FuelDispensary>
): FuelContainerSubLink[] => {
  const fromIso = normalizeDateISO(container.fechaDesde);
  const toIso = normalizeDateISO(container.fechaHasta);

  const linkedVouchers = (container.voucherIds || [])
    .map((id) => voucherMap.get(id))
    .filter((v): v is FuelDispensary => Boolean(v));

  const linkedCisternaLoads = linkedVouchers.filter((v) =>
    isCisternaChulengoLoad(v, deposits)
  );
  if (linkedCisternaLoads.length === 0) return [];

  const linkedCisternaIdSet = new Set(linkedCisternaLoads.map((v) => v.id));

  // Include all active Cisterna loads in the container's period so intermediate refills
  // (even if not yet added to container.voucherIds) properly delimit chronological intervals
  const periodCisternaLoadsMap = new Map<string, FuelDispensary>();
  linkedCisternaLoads.forEach((v) => periodCisternaLoadsMap.set(v.id, v));
  vouchers.forEach((v) => {
    if (v.estado === 'ANULADO') return;
    if (!isCisternaChulengoLoad(v, deposits)) return;
    const vIso = normalizeDateISO(v.fecha);
    if (fromIso && vIso < fromIso) return;
    if (toIso && vIso > toIso) return;
    periodCisternaLoadsMap.set(v.id, v);
  });

  const allTimelineLoads = Array.from(periodCisternaLoadsMap.values()).sort((a, b) => {
    const d = normalizeDateISO(a.fecha).localeCompare(normalizeDateISO(b.fecha));
    if (d !== 0) return d;
    return (a.hora || '').localeCompare(b.hora || '');
  });

  // Group timeline loads by calendar date (YYYY-MM-DD)
  const dateGroups: { date: string; loads: FuelDispensary[] }[] = [];
  allTimelineLoads.forEach((ld) => {
    const dt = normalizeDateISO(ld.fecha);
    const last = dateGroups[dateGroups.length - 1];
    if (last && last.date === dt) {
      last.loads.push(ld);
    } else {
      dateGroups.push({ date: dt, loads: [ld] });
    }
  });

  // Collect all outgoing Chulengo discharges within the container's date range
  const periodDischarges = vouchers
    .filter((v) => {
      if (v.estado === 'ANULADO') return false;
      if (!isVoucherInternalChulengoDischarge(v, deposits)) return false;
      const vIso = normalizeDateISO(v.fecha);
      if (fromIso && vIso < fromIso) return false;
      if (toIso && vIso > toIso) return false;
      return true;
    })
    .sort((a, b) => {
      const d = normalizeDateISO(a.fecha).localeCompare(normalizeDateISO(b.fecha));
      if (d !== 0) return d;
      return (a.hora || '').localeCompare(b.hora || '');
    });

  const result: FuelContainerSubLink[] = [];

  for (let i = 0; i < dateGroups.length; i++) {
    const group = dateGroups[i];
    const startDate = group.date;
    const endDate = i + 1 < dateGroups.length ? dateGroups[i + 1].date : `${toIso}\uffff`;

    const slice = periodDischarges.filter((d) => {
      const dIso = normalizeDateISO(d.fecha);
      if (i === 0) return dIso < endDate;
      return dIso >= startDate && dIso < endDate;
    });

    const linkedLoadsInGroup = group.loads.filter((ld) => linkedCisternaIdSet.has(ld.id));
    if (linkedLoadsInGroup.length === 0) continue;

    if (linkedLoadsInGroup.length === 1) {
      result.push({
        parentVoucherId: linkedLoadsInGroup[0].id,
        childVoucherIds: slice.map((d) => d.id),
      });
    } else {
      let idx = 0;
      for (let j = 0; j < linkedLoadsInGroup.length; j++) {
        const ld = linkedLoadsInGroup[j];
        const cap = getVoucherLiters(ld);
        const assigned: string[] = [];
        let sum = 0;
        while (idx < slice.length) {
          const dLiters = getVoucherLiters(slice[idx]);
          if (j < linkedLoadsInGroup.length - 1 && assigned.length > 0 && sum + dLiters > cap * 1.15) {
            break;
          }
          assigned.push(slice[idx].id);
          sum += dLiters;
          idx++;
        }
        result.push({
          parentVoucherId: ld.id,
          childVoucherIds: assigned,
        });
      }
    }
  }

  return result.filter((sl) => sl.childVoucherIds.length > 0);
};

/**
 * Returns the effective subLinks for a container: merges any manual subLinks stored on the container
 * with automatic chronological interval subLinks for any Chulengo load that doesn't have subLinks yet.
 */
const getEffectiveContainerSubLinks = (
  container: FuelContainer,
  vouchers: FuelDispensary[],
  deposits: FuelDeposit[],
  voucherMap: Map<string, FuelDispensary>
): FuelContainerSubLink[] => {
  const manualSubLinks = container.subLinks || [];
  const autoSubLinks = computeChronologicalChulengoSubLinks(
    container,
    vouchers,
    deposits,
    voucherMap
  );
  if (autoSubLinks.length === 0) return manualSubLinks;

  const byParent = new Map<string, FuelContainerSubLink>();
  manualSubLinks.forEach((sl) => {
    if ((sl.childVoucherIds && sl.childVoucherIds.length > 0) || sl.notas) {
      byParent.set(sl.parentVoucherId, sl);
    }
  });

  // Avoid assigning a discharge automatically if it is already manually assigned in this container
  const manuallyAssignedChildren = new Set<string>();
  byParent.forEach((sl) => {
    (sl.childVoucherIds || []).forEach((cid) => manuallyAssignedChildren.add(cid));
  });

  autoSubLinks.forEach((autoSl) => {
    const existing = byParent.get(autoSl.parentVoucherId);
    if (!existing || (existing.childVoucherIds || []).length === 0) {
      const availableChildren = autoSl.childVoucherIds.filter(
        (cid) => !manuallyAssignedChildren.has(cid)
      );
      if (availableChildren.length > 0) {
        byParent.set(autoSl.parentVoucherId, {
          parentVoucherId: autoSl.parentVoucherId,
          childVoucherIds: availableChildren,
          notas: existing?.notas,
        });
      }
    }
  });

  return Array.from(byParent.values());
};

interface ContainerDocBadge {
  id: string;
  kind: 'FACTURA' | 'RESUMEN' | 'REMITO' | 'OTRO';
  shortLabel: string;
  numero: string;
  fullText: string;
  importe?: number;
  url?: string;
  mimeType?: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const getContainerDocumentBadges = (c: FuelContainer): ContainerDocBadge[] => {
  const badges: ContainerDocBadge[] = [];
  const usedUrls = new Set<string>();

  // 1. Registered invoices / resúmenes / remitos in c.facturas
  (c.facturas || []).forEach((f) => {
    if (f.adjuntoUrl) usedUrls.add(f.adjuntoUrl);
    const tipoClean = cleanStr(f.tipoComprobante);
    const num = (f.numeroComprobante || '').trim() || 'S/N';

    if (tipoClean.includes('resumen')) {
      badges.push({
        id: f.id,
        kind: 'RESUMEN',
        shortLabel: 'Resumen',
        numero: num,
        fullText: `Resumen ${num}`,
        importe: f.importeTotal,
        url: f.adjuntoUrl,
        bgClass: 'bg-cyan-500/15',
        textClass: 'text-cyan-300',
        borderClass: 'border-cyan-500/40',
      });
    } else if (tipoClean.includes('remito')) {
      badges.push({
        id: f.id,
        kind: 'REMITO',
        shortLabel: 'Remito',
        numero: num,
        fullText: `Remito ${num}`,
        importe: f.importeTotal,
        url: f.adjuntoUrl,
        bgClass: 'bg-amber-500/15',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-500/40',
      });
    } else {
      const tipoLabel = (f.tipoComprobante || 'Factura').trim();
      badges.push({
        id: f.id,
        kind: 'FACTURA',
        shortLabel: tipoLabel,
        numero: num,
        fullText: `${tipoLabel} ${num}`,
        importe: f.importeTotal,
        url: f.adjuntoUrl,
        bgClass: 'bg-emerald-500/15',
        textClass: 'text-emerald-300',
        borderClass: 'border-emerald-500/40',
      });
    }
  });

  // 2. Standalone attachments in c.adjuntos not already linked to an invoice entry
  (c.adjuntos || []).forEach((a) => {
    if (a.url && usedUrls.has(a.url)) return;
    const labelBase = DOC_TIPO_LABELS[a.tipoDocumento] || 'Adjunto';
    const cleanName = (a.notas || a.nombre || '').replace(/\.pdf$|\.jpe?g$|\.png$/i, '');
    if (a.tipoDocumento === 'REMITO') {
      badges.push({
        id: a.id,
        kind: 'REMITO',
        shortLabel: 'Remito',
        numero: cleanName,
        fullText: `Remito: ${cleanName}`,
        url: a.url,
        mimeType: a.mimeType,
        bgClass: 'bg-amber-500/15',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-500/40',
      });
    } else if (a.tipoDocumento === 'RESUMEN_PROVEEDOR') {
      badges.push({
        id: a.id,
        kind: 'RESUMEN',
        shortLabel: 'Resumen',
        numero: cleanName,
        fullText: `Resumen: ${cleanName}`,
        url: a.url,
        mimeType: a.mimeType,
        bgClass: 'bg-cyan-500/15',
        textClass: 'text-cyan-300',
        borderClass: 'border-cyan-500/40',
      });
    } else if (a.tipoDocumento === 'FACTURA') {
      badges.push({
        id: a.id,
        kind: 'FACTURA',
        shortLabel: 'Factura',
        numero: cleanName,
        fullText: `Factura: ${cleanName}`,
        url: a.url,
        mimeType: a.mimeType,
        bgClass: 'bg-emerald-500/15',
        textClass: 'text-emerald-300',
        borderClass: 'border-emerald-500/40',
      });
    } else {
      badges.push({
        id: a.id,
        kind: 'OTRO',
        shortLabel: labelBase,
        numero: cleanName,
        fullText: `${labelBase}: ${cleanName}`,
        url: a.url,
        mimeType: a.mimeType,
        bgClass: 'bg-purple-500/15',
        textClass: 'text-purple-300',
        borderClass: 'border-purple-500/40',
      });
    }
  });

  // Sort Facturas first, then Resúmenes, then Remitos
  const orderMap: Record<ContainerDocBadge['kind'], number> = {
    FACTURA: 1,
    RESUMEN: 2,
    REMITO: 3,
    OTRO: 4,
  };
  return badges.sort((a, b) => orderMap[a.kind] - orderMap[b.kind]);
};

const getTodayISO = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getFirstDayOfMonthISO = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

export const FuelContainersSection: React.FC<FuelContainersSectionProps> = ({
  containers,
  vouchers,
  deposits,
  proveedores,
  purchaseInvoices,
  fleet,
  onSaveContainer,
  onDeleteContainer,
  onShowToast,
}) => {
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cargas' | 'facturas' | 'maquinas'>('cargas');

  // Master list filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | FuelContainerStatus>('TODOS');

  // Create / Edit Container Modal
  const [isContainerModalOpen, setIsContainerModalOpen] = useState(false);
  const [editingContainer, setEditingContainer] = useState<FuelContainer | null>(null);
  const [formTitulo, setFormTitulo] = useState('');
  const [formProveedorId, setFormProveedorId] = useState('');
  const [formProveedorNombre, setFormProveedorNombre] = useState('');
  const [formEstacionConvenio, setFormEstacionConvenio] = useState('');
  const [formFechaDesde, setFormFechaDesde] = useState(getFirstDayOfMonthISO());
  const [formFechaHasta, setFormFechaHasta] = useState(getTodayISO());
  const [formEstado, setFormEstado] = useState<FuelContainerStatus>('ABIERTO');
  const [formLitrosResumen, setFormLitrosResumen] = useState('');
  const [formImporteResumen, setFormImporteResumen] = useState('');
  const [formObservaciones, setFormObservaciones] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation modal
  const [containerToDelete, setContainerToDelete] = useState<FuelContainer | null>(null);

  // Detail tab: Cargas filter & expansion
  const [linkedSearch, setLinkedSearch] = useState('');
  const [linkedKindFilter, setLinkedKindFilter] = useState<'TODAS' | 'CHULENGO' | 'DIRECTA'>('TODAS');
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  // Link Direct Vouchers Modal
  const [isLinkVouchersOpen, setIsLinkVouchersOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerDateFrom, setPickerDateFrom] = useState('');
  const [pickerDateTo, setPickerDateTo] = useState('');
  const [pickerDeposit, setPickerDeposit] = useState('ALL');
  const [pickerHideAssignedElsewhere, setPickerHideAssignedElsewhere] = useState(true);
  const [pickerHideInternalDischarges, setPickerHideInternalDischarges] = useState(true);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());

  // Sub-link Modal (Chulengo -> Máquinas)
  const [subLinkParentId, setSubLinkParentId] = useState<string | null>(null);
  const [subPickerSearch, setSubPickerSearch] = useState('');
  const [subPickerShowAll, setSubPickerShowAll] = useState(false);
  const [subPickerSelectedIds, setSubPickerSelectedIds] = useState<Set<string>>(new Set());
  const [subPickerNotas, setSubPickerNotas] = useState('');

  // Add Invoice Manual Modal
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invTipo, setInvTipo] = useState('FACTURA A');
  const [invNumero, setInvNumero] = useState('');
  const [invFecha, setInvFecha] = useState(getTodayISO());
  const [invProveedor, setInvProveedor] = useState('');
  const [invLitros, setInvLitros] = useState('');
  const [invImporte, setInvImporte] = useState('');
  const [invObs, setInvObs] = useState('');
  const [invFile, setInvFile] = useState<File | null>(null);
  const [isUploadingInv, setIsUploadingInv] = useState(false);

  // Import from Compras Modal
  const [isImportComprasOpen, setIsImportComprasOpen] = useState(false);
  const [comprasSearch, setComprasSearch] = useState('');

  // Attachment Upload
  const [adjuntoTipo, setAdjuntoTipo] = useState<FuelContainerDocTipo>('RESUMEN_PROVEEDOR');
  const [adjuntoNotas, setAdjuntoNotas] = useState('');
  const [isUploadingAdjunto, setIsUploadingAdjunto] = useState(false);
  const adjuntoInputRef = useRef<HTMLInputElement | null>(null);

  // Preview Lightbox
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    url: string;
    mimeType?: string;
  } | null>(null);

  const voucherMap = useMemo(() => {
    const map = new Map<string, FuelDispensary>();
    vouchers.forEach((v) => map.set(v.id, v));
    return map;
  }, [vouchers]);

  const stationDeposits = useMemo(
    () => deposits.filter((d) => d.modalidad === 'VALES_ESTACION'),
    [deposits]
  );

  // Map of voucherId -> container code (for knowing if already linked in another container)
  const voucherToContainerMap = useMemo(() => {
    const map = new Map<string, { id: string; codigo: string; titulo: string }>();
    containers.forEach((c) => {
      (c.voucherIds || []).forEach((vid) => {
        if (!map.has(vid)) {
          map.set(vid, { id: c.id, codigo: c.codigo, titulo: c.titulo });
        }
      });
    });
    return map;
  }, [containers]);

  // Map of childVoucherId -> parent info across containers
  const childVoucherAssignedElsewhere = useMemo(() => {
    const map = new Map<string, { containerId: string; containerCode: string; parentVoucherId: string }>();
    containers.forEach((c) => {
      const effSubLinks = getEffectiveContainerSubLinks(c, vouchers, deposits, voucherMap);
      effSubLinks.forEach((sl) => {
        (sl.childVoucherIds || []).forEach((cid) => {
          map.set(cid, {
            containerId: c.id,
            containerCode: c.codigo,
            parentVoucherId: sl.parentVoucherId,
          });
        });
      });
    });
    return map;
  }, [containers, vouchers, deposits, voucherMap]);

  const activeContainer = useMemo(
    () => containers.find((c) => c.id === selectedContainerId) || null,
    [containers, selectedContainerId]
  );

  // Automatically persist computed chronological subLinks to Supabase for containers that have unlinked Chulengo loads
  const autoSyncedSignaturesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (containers.length === 0 || vouchers.length === 0) return;
    for (const c of containers) {
      const effective = getEffectiveContainerSubLinks(c, vouchers, deposits, voucherMap);
      const storedCount = (c.subLinks || []).reduce(
        (acc, sl) => acc + (sl.childVoucherIds || []).length,
        0
      );
      const effectiveCount = effective.reduce(
        (acc, sl) => acc + (sl.childVoucherIds || []).length,
        0
      );
      if (effectiveCount > storedCount) {
        const sig = `${c.id}:${effective
          .map((sl) => `${sl.parentVoucherId}=${sl.childVoucherIds.join(',')}`)
          .join(';')}`;
        if (!autoSyncedSignaturesRef.current.has(sig)) {
          autoSyncedSignaturesRef.current.add(sig);
          Promise.resolve(
            onSaveContainer({
              ...c,
              subLinks: effective,
              updatedAt: new Date().toISOString(),
            })
          ).catch(() => {
            // If network fails, remove signature so it can retry later
            autoSyncedSignaturesRef.current.delete(sig);
          });
          break;
        }
      }
    }
  }, [containers, vouchers, deposits, voucherMap, onSaveContainer]);

  const computeContainerMetrics = (c: FuelContainer) => {
    const linkedVouchers = (c.voucherIds || [])
      .map((id) => voucherMap.get(id))
      .filter((v): v is FuelDispensary => Boolean(v));

    const litrosVinculados = linkedVouchers.reduce((sum, v) => sum + getVoucherLiters(v), 0);
    const importeCargas = linkedVouchers.reduce(
      (sum, v) => sum + (Number(v.totalImporte) || Number(v.precioUnitario || 0) * getVoucherLiters(v)),
      0
    );

    const facturas = c.facturas || [];
    const litrosEnFacturas = facturas.reduce((sum, f) => sum + (Number(f.litrosFacturados) || 0), 0);
    const importeEnFacturas = facturas.reduce((sum, f) => sum + (Number(f.importeTotal) || 0), 0);

    const litrosReferencia =
      litrosEnFacturas > 0 ? litrosEnFacturas : Number(c.litrosResumenProveedor || 0);
    const importeReferencia =
      importeEnFacturas > 0 ? importeEnFacturas : Number(c.importeResumenProveedor || 0);

    const diferenciaLitros = litrosReferencia > 0 ? litrosVinculados - litrosReferencia : 0;

    const effectiveSubLinks = getEffectiveContainerSubLinks(c, vouchers, deposits, voucherMap);
    const totalSubLinkedChildren = effectiveSubLinks.reduce(
      (sum, sl) => sum + (sl.childVoucherIds || []).length,
      0
    );
    const litrosSubVinculados = effectiveSubLinks.reduce((sum, sl) => {
      const childSum = (sl.childVoucherIds || []).reduce((acc, cid) => {
        const cv = voucherMap.get(cid);
        return acc + (cv ? getVoucherLiters(cv) : 0);
      }, 0);
      return sum + childSum;
    }, 0);

    const chulengoLoads = linkedVouchers.filter(
      (v) =>
        isVoucherChulengoLoad(v, deposits).isChulengo ||
        effectiveSubLinks.some((sl) => sl.parentVoucherId === v.id && sl.childVoucherIds.length > 0)
    );
    const litrosAChulengos = chulengoLoads.reduce((sum, v) => sum + getVoucherLiters(v), 0);

    const precioPromedioLitro =
      importeReferencia > 0 && (litrosReferencia > 0 || litrosVinculados > 0)
        ? importeReferencia / (litrosReferencia > 0 ? litrosReferencia : litrosVinculados)
        : importeCargas > 0 && litrosVinculados > 0
        ? importeCargas / litrosVinculados
        : 0;

    return {
      linkedVouchers,
      effectiveSubLinks,
      litrosVinculados,
      importeCargas,
      litrosReferencia,
      importeReferencia,
      diferenciaLitros,
      totalSubLinkedChildren,
      litrosSubVinculados,
      chulengoLoadsCount: chulengoLoads.length,
      litrosAChulengos,
      precioPromedioLitro,
    };
  };

  // Global KPI stats
  const globalStats = useMemo(() => {
    let totalLitrosRef = 0;
    let totalLitrosVinc = 0;
    let totalSubChildren = 0;
    let totalImporteRef = 0;
    let openCount = 0;

    containers.forEach((c) => {
      if (c.estado === 'ABIERTO') openCount += 1;
      const m = computeContainerMetrics(c);
      totalLitrosRef += m.litrosReferencia;
      totalLitrosVinc += m.litrosVinculados;
      totalSubChildren += m.totalSubLinkedChildren;
      totalImporteRef += m.importeReferencia;
    });

    return {
      total: containers.length,
      openCount,
      totalLitrosRef,
      totalLitrosVinc,
      totalSubChildren,
      totalImporteRef,
    };
  }, [containers, vouchers, deposits]);

  const filteredContainers = useMemo(() => {
    const q = cleanStr(searchQuery);
    return [...containers]
      .filter((c) => {
        if (statusFilter !== 'TODOS' && c.estado !== statusFilter) return false;
        if (!q) return true;
        const invText = (c.facturas || [])
          .map((f) => `${f.numeroComprobante} ${f.proveedorNombre}`)
          .join(' ');
        const effSubLinks = getEffectiveContainerSubLinks(c, vouchers, deposits, voucherMap);
        const linkedVouchersText = [
          ...(c.voucherIds || []),
          ...effSubLinks.flatMap((sl) => sl.childVoucherIds || []),
        ]
          .map((vid) => {
            const v = voucherMap.get(vid);
            return v ? buildVoucherSearchHaystack(v) : vid;
          })
          .join(' ');
        const haystack = cleanStr(
          `${c.codigo} ${c.titulo} ${c.proveedorNombre} ${c.estacionConvenio || ''} ${invText} ${c.observaciones || ''} ${linkedVouchersText}`
        );
        return haystack.includes(q);
      })
      .sort((a, b) => (b.fechaDesde || b.createdAt || '').localeCompare(a.fechaDesde || a.createdAt || ''));
  }, [containers, searchQuery, statusFilter, voucherMap, vouchers, deposits]);

  const generateNextCode = () => {
    const maxNum = containers.reduce((max, c) => {
      const m = (c.codigo || '').match(/(\d+)$/);
      const n = m ? parseInt(m[1], 10) : 0;
      return Math.max(max, isNaN(n) ? 0 : n);
    }, 0);
    return `CC-${String(maxNum + 1).padStart(4, '0')}`;
  };

  const openCreateContainerModal = () => {
    setEditingContainer(null);
    setFormTitulo('');
    setFormProveedorId('');
    setFormProveedorNombre('');
    setFormEstacionConvenio('');
    setFormFechaDesde(getFirstDayOfMonthISO());
    setFormFechaHasta(getTodayISO());
    setFormEstado('ABIERTO');
    setFormLitrosResumen('');
    setFormImporteResumen('');
    setFormObservaciones('');
    setIsContainerModalOpen(true);
  };

  const openEditContainerModal = (c: FuelContainer) => {
    setEditingContainer(c);
    setFormTitulo(c.titulo);
    setFormProveedorId(c.proveedorId || '');
    setFormProveedorNombre(c.proveedorNombre || '');
    setFormEstacionConvenio(c.estacionConvenio || '');
    setFormFechaDesde(normalizeDateISO(c.fechaDesde) || getFirstDayOfMonthISO());
    setFormFechaHasta(normalizeDateISO(c.fechaHasta) || getTodayISO());
    setFormEstado(c.estado || 'ABIERTO');
    setFormLitrosResumen(
      c.litrosResumenProveedor !== undefined && c.litrosResumenProveedor > 0
        ? String(c.litrosResumenProveedor)
        : ''
    );
    setFormImporteResumen(
      c.importeResumenProveedor !== undefined && c.importeResumenProveedor > 0
        ? String(c.importeResumenProveedor)
        : ''
    );
    setFormObservaciones(c.observaciones || '');
    setIsContainerModalOpen(true);
  };

  const handleSaveContainerForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitulo.trim()) {
      onShowToast?.('Ingresá un título para el contenedor (ej: YPF 1ra Quincena Noviembre).');
      return;
    }
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const next: FuelContainer = editingContainer
        ? {
            ...editingContainer,
            titulo: formTitulo.trim(),
            proveedorId: formProveedorId || undefined,
            proveedorNombre: formProveedorNombre.trim() || 'Sin proveedor asignado',
            estacionConvenio: formEstacionConvenio.trim() || undefined,
            fechaDesde: formFechaDesde,
            fechaHasta: formFechaHasta,
            estado: formEstado,
            litrosResumenProveedor: formLitrosResumen ? Number(formLitrosResumen) : undefined,
            importeResumenProveedor: formImporteResumen ? Number(formImporteResumen) : undefined,
            observaciones: formObservaciones.trim() || undefined,
            updatedAt: now,
          }
        : {
            id: `FC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            codigo: generateNextCode(),
            titulo: formTitulo.trim(),
            proveedorId: formProveedorId || undefined,
            proveedorNombre: formProveedorNombre.trim() || 'Sin proveedor asignado',
            estacionConvenio: formEstacionConvenio.trim() || undefined,
            fechaDesde: formFechaDesde,
            fechaHasta: formFechaHasta,
            estado: formEstado,
            litrosResumenProveedor: formLitrosResumen ? Number(formLitrosResumen) : undefined,
            importeResumenProveedor: formImporteResumen ? Number(formImporteResumen) : undefined,
            voucherIds: [],
            subLinks: [],
            facturas: [],
            adjuntos: [],
            observaciones: formObservaciones.trim() || undefined,
            createdAt: now,
            updatedAt: now,
          };

      await onSaveContainer(next);
      setIsContainerModalOpen(false);
      if (!editingContainer) {
        setSelectedContainerId(next.id);
        setActiveTab('cargas');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const persistActiveUpdate = async (updater: (c: FuelContainer) => FuelContainer) => {
    if (!activeContainer) return;
    const updated = {
      ...updater(activeContainer),
      updatedAt: new Date().toISOString(),
    };
    await onSaveContainer(updated);
  };

  const getDaysDiff = (isoA: string, isoB: string): number => {
    if (!isoA || !isoB) return 0;
    const tA = new Date(`${isoA}T12:00:00`).getTime();
    const tB = new Date(`${isoB}T12:00:00`).getTime();
    if (isNaN(tA) || isNaN(tB)) return 0;
    return Math.round((tA - tB) / (1000 * 60 * 60 * 24));
  };

  // Finds the best Chulengo parent load in a container for a given machine discharge from Chulengo
  const findBestChulengoParentForDischarge = (
    discharge: FuelDispensary,
    parentVouchers: FuelDispensary[]
  ): FuelDispensary | null => {
    if (parentVouchers.length === 0) return null;
    const disIso = normalizeDateISO(discharge.fecha);
    const disFuel = cleanStr(discharge.tipoComb);
    const disLiters = getVoucherLiters(discharge);
    const disIsDiesel = disFuel.includes('diesel') || disFuel.includes('gasoil') || disLiters > 20;

    // Filter compatible chulengo parents (prefer Diesel cistern over 5L/10L Nafta bidón for diesel/heavy discharges)
    const compatibleParents = parentVouchers.filter((p) => {
      const pRec = cleanStr(`${p.codigoEquipo} ${p.marcaModelo || ''} ${p.tipoComb || ''}`);
      const pIsBidonNafta =
        (pRec.includes('bidon') || pRec.includes('bidón')) &&
        (pRec.includes('nafta') || getVoucherLiters(p) <= 20);
      if (disIsDiesel && pIsBidonNafta) return false;
      return true;
    });

    const pool = compatibleParents.length > 0 ? compatibleParents : parentVouchers;

    // Sort pool by date ascending
    const sorted = [...pool].sort((a, b) =>
      normalizeDateISO(a.fecha).localeCompare(normalizeDateISO(b.fecha))
    );

    // 1. Prefer the latest parent load on or before the discharge date
    const onOrBefore = sorted.filter((p) => normalizeDateISO(p.fecha) <= disIso);
    if (onOrBefore.length > 0) {
      return onOrBefore[onOrBefore.length - 1];
    }

    // 2. Otherwise pick the closest parent load by date
    return sorted.reduce((best, curr) => {
      const bestDiff = Math.abs(getDaysDiff(disIso, normalizeDateISO(best.fecha)));
      const currDiff = Math.abs(getDaysDiff(disIso, normalizeDateISO(curr.fecha)));
      return currDiff < bestDiff ? curr : best;
    }, sorted[0]);
  };

  // ==================== LINK DIRECT VOUCHERS ====================
  const openLinkVouchersModal = () => {
    if (!activeContainer) return;
    setPickerSearch('');
    setPickerDateFrom(normalizeDateISO(activeContainer.fechaDesde));
    setPickerDateTo(normalizeDateISO(activeContainer.fechaHasta));
    setPickerDeposit('ALL');
    setPickerHideAssignedElsewhere(true);
    // Show Chulengo discharges by default so users can always find and link them
    setPickerHideInternalDischarges(false);
    const effSubLinks = getEffectiveContainerSubLinks(
      activeContainer,
      vouchers,
      deposits,
      voucherMap
    );
    const allLinkedAndSubLinked = new Set<string>([
      ...(activeContainer.voucherIds || []),
      ...effSubLinks.flatMap((sl) => sl.childVoucherIds || []),
    ]);
    setPickerSelectedIds(allLinkedAndSubLinked);
    setIsLinkVouchersOpen(true);
  };

  const uniqueDepositOptions = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      if (v.deposito) set.add(v.deposito.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [vouchers]);

  const pickerFilteredVouchers = useMemo(() => {
    if (!activeContainer) return [];
    const q = cleanStr(pickerSearch);
    return [...vouchers]
      .filter((v) => {
        if (v.estado === 'ANULADO') return false;
        const alreadyInThis = pickerSelectedIds.has(v.id);
        if (pickerHideAssignedElsewhere && !alreadyInThis) {
          const other = voucherToContainerMap.get(v.id);
          if (other && other.id !== activeContainer.id) return false;
          const otherSub = childVoucherAssignedElsewhere.get(v.id);
          if (otherSub && otherSub.containerId !== activeContainer.id) return false;
        }
        if (pickerHideInternalDischarges && !alreadyInThis) {
          if (isVoucherInternalChulengoDischarge(v, deposits)) return false;
        }
        const vIso = normalizeDateISO(v.fecha);
        if (pickerDateFrom && vIso && vIso < pickerDateFrom) return false;
        if (pickerDateTo && vIso && vIso > pickerDateTo) return false;
        if (pickerDeposit !== 'ALL') {
          const depFilter = cleanStr(pickerDeposit);
          const vDep = cleanStr(v.deposito);
          const isChulengoFilter = CHULENGO_KEYWORDS.some((kw) => depFilter.includes(kw));
          if (isChulengoFilter) {
            const matchesChulengo =
              vDep === depFilter ||
              isVoucherInternalChulengoDischarge(v, deposits) ||
              isVoucherChulengoLoad(v, deposits).isChulengo;
            if (!matchesChulengo) return false;
          } else if (vDep !== depFilter) {
            return false;
          }
        }
        if (q) {
          const hay = buildVoucherSearchHaystack(v);
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => normalizeDateISO(b.fecha).localeCompare(normalizeDateISO(a.fecha)));
  }, [
    activeContainer,
    vouchers,
    deposits,
    pickerSearch,
    pickerDateFrom,
    pickerDateTo,
    pickerDeposit,
    pickerHideAssignedElsewhere,
    pickerHideInternalDischarges,
    pickerSelectedIds,
    voucherToContainerMap,
    childVoucherAssignedElsewhere,
  ]);

  const handleConfirmLinkVouchers = async () => {
    if (!activeContainer) return;
    const allSelectedIds = Array.from(pickerSelectedIds);
    const selectedVouchers = allSelectedIds
      .map((id) => voucherMap.get(id))
      .filter((v): v is FuelDispensary => Boolean(v));

    // Separate station loads (direct to machine or incoming to chulengo) from internal chulengo discharges
    const stationOrParentLoads = selectedVouchers.filter(
      (v) => !isVoucherInternalChulengoDischarge(v, deposits)
    );
    const selectedDischarges = selectedVouchers.filter((v) =>
      isVoucherInternalChulengoDischarge(v, deposits)
    );

    const chulengoParents = stationOrParentLoads.filter(
      (v) => isVoucherChulengoLoad(v, deposits).isChulengo
    );

    const nextTopIds =
      chulengoParents.length > 0
        ? stationOrParentLoads.map((v) => v.id)
        : [
            ...stationOrParentLoads.map((v) => v.id),
            ...selectedDischarges.map((d) => d.id),
          ];

    // Compute chronological interval sub-links automatically for all Chulengo loads in the container
    const draftContainer: FuelContainer = {
      ...activeContainer,
      voucherIds: nextTopIds,
      subLinks: (activeContainer.subLinks || []).filter((sl) =>
        nextTopIds.includes(sl.parentVoucherId)
      ),
    };
    const nextSubLinks = computeChronologicalChulengoSubLinks(
      draftContainer,
      vouchers,
      deposits,
      voucherMap
    );

    await persistActiveUpdate((c) => ({
      ...c,
      voucherIds: nextTopIds,
      subLinks: nextSubLinks,
    }));

    if (nextSubLinks.length > 0) {
      const newlyExpanded: Record<string, boolean> = {};
      nextSubLinks.forEach((sl) => {
        newlyExpanded[sl.parentVoucherId] = true;
      });
      setExpandedParents((prev) => ({ ...prev, ...newlyExpanded }));
    }

    setIsLinkVouchersOpen(false);
  };

  const handleAutoLinkChulengoDischarges = async () => {
    if (!activeContainer) return;

    const linkedVouchers = (activeContainer.voucherIds || [])
      .map((id) => voucherMap.get(id))
      .filter((v): v is FuelDispensary => Boolean(v));

    const chulengoParents = linkedVouchers.filter(
      (v) => isVoucherChulengoLoad(v, deposits).isChulengo
    );

    if (chulengoParents.length === 0) {
      onShowToast?.('Primero vinculá al menos una carga de estación al Chulengo / Cisterna.');
      return;
    }

    const nextSubLinks = computeChronologicalChulengoSubLinks(
      activeContainer,
      vouchers,
      deposits,
      voucherMap
    );

    const allSubChildIds = new Set(
      nextSubLinks.flatMap((sl) => sl.childVoucherIds || [])
    );
    const cleanedTopVoucherIds = (activeContainer.voucherIds || []).filter(
      (id) => !allSubChildIds.has(id)
    );

    await persistActiveUpdate((c) => ({
      ...c,
      voucherIds: cleanedTopVoucherIds,
      subLinks: nextSubLinks,
    }));

    const nextExpanded: Record<string, boolean> = {};
    nextSubLinks.forEach((sl) => {
      nextExpanded[sl.parentVoucherId] = true;
    });
    setExpandedParents((prev) => ({ ...prev, ...nextExpanded }));
    onShowToast?.(
      `Se vincularon automáticamente ${allSubChildIds.size} salida(s) del Chulengo por tramo entre cargas.`
    );
  };

  const handleUnlinkVoucher = async (voucherId: string) => {
    await persistActiveUpdate((c) => ({
      ...c,
      voucherIds: (c.voucherIds || []).filter((id) => id !== voucherId),
      subLinks: (c.subLinks || []).filter((sl) => sl.parentVoucherId !== voucherId),
    }));
  };

  // ==================== SUB-LINKING (CHULENGO -> MÁQUINAS) ====================
  const openSubLinkModal = (parentVoucherId: string) => {
    if (!activeContainer) return;
    const effSubLinks = getEffectiveContainerSubLinks(
      activeContainer,
      vouchers,
      deposits,
      voucherMap
    );
    const existing = effSubLinks.find(
      (sl) => sl.parentVoucherId === parentVoucherId
    );
    setSubLinkParentId(parentVoucherId);
    setSubPickerSearch('');
    setSubPickerShowAll(false);
    setSubPickerSelectedIds(new Set(existing?.childVoucherIds || []));
    setSubPickerNotas(existing?.notas || '');
  };

  const subLinkParentVoucher = useMemo(
    () => (subLinkParentId ? voucherMap.get(subLinkParentId) || null : null),
    [subLinkParentId, voucherMap]
  );

  const subLinkCandidates = useMemo(() => {
    if (!subLinkParentVoucher || !activeContainer) {
      return { suggested: [] as FuelDispensary[], others: [] as FuelDispensary[] };
    }
    const { matchedDeposit } = isVoucherChulengoLoad(subLinkParentVoucher, deposits);
    const parentIso = normalizeDateISO(subLinkParentVoucher.fecha);
    const containerFromIso = normalizeDateISO(activeContainer.fechaDesde);
    const containerToIso = normalizeDateISO(activeContainer.fechaHasta);
    const q = cleanStr(subPickerSearch);

    const suggested: FuelDispensary[] = [];
    const others: FuelDispensary[] = [];

    const allValid = vouchers.filter((v) => {
      if (v.id === subLinkParentVoucher.id) return false;
      if (v.estado === 'ANULADO') return false;
      const isChulengoDischarge = isVoucherInternalChulengoDischarge(v, deposits);
      // Don't hide Chulengo discharges even if they were accidentally linked as top-level vouchers
      const isDirectParentInContainer = (activeContainer.voucherIds || []).includes(v.id);
      if (
        isDirectParentInContainer &&
        !isChulengoDischarge &&
        !subPickerSelectedIds.has(v.id)
      ) {
        return false;
      }

      if (q) {
        const hay = buildVoucherSearchHaystack(v);
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    allValid.forEach((v) => {
      const vIso = normalizeDateISO(v.fecha);
      const daysDiff = parentIso && vIso ? getDaysDiff(vIso, parentIso) : 0;
      const inContainerPeriod =
        (!containerFromIso || vIso >= containerFromIso) &&
        (!containerToIso || vIso <= containerToIso);
      const isNearParentDate = inContainerPeriod || Math.abs(daysDiff) <= 30 || Boolean(q);

      let matchesChulengoOrigin = false;
      if (matchedDeposit && isVoucherOutgoingFromDeposit(v, matchedDeposit)) {
        matchesChulengoOrigin = true;
      } else if (isVoucherInternalChulengoDischarge(v, deposits)) {
        matchesChulengoOrigin = true;
      }

      if (matchesChulengoOrigin && (isNearParentDate || subPickerSelectedIds.has(v.id))) {
        suggested.push(v);
      } else if (subPickerShowAll || subPickerSelectedIds.has(v.id)) {
        others.push(v);
      }
    });

    // Sort suggested by: selected first, then same day or 0..3 days after parent load, then closest date to parentIso
    suggested.sort((a, b) => {
      const aSel = subPickerSelectedIds.has(a.id) ? 1 : 0;
      const bSel = subPickerSelectedIds.has(b.id) ? 1 : 0;
      if (aSel !== bSel) return bSel - aSel;

      const aIso = normalizeDateISO(a.fecha);
      const bIso = normalizeDateISO(b.fecha);
      const aDiff = getDaysDiff(aIso, parentIso);
      const bDiff = getDaysDiff(bIso, parentIso);

      const aPrime = aDiff >= 0 && aDiff <= 3 ? 1 : 0;
      const bPrime = bDiff >= 0 && bDiff <= 3 ? 1 : 0;
      if (aPrime !== bPrime) return bPrime - aPrime;

      const aAbs = Math.abs(aDiff);
      const bAbs = Math.abs(bDiff);
      if (aAbs !== bAbs) return aAbs - bAbs;

      return bIso.localeCompare(aIso);
    });

    others.sort((a, b) => normalizeDateISO(b.fecha).localeCompare(normalizeDateISO(a.fecha)));

    return { suggested, others };
  }, [
    subLinkParentVoucher,
    activeContainer,
    vouchers,
    deposits,
    subPickerSearch,
    subPickerShowAll,
    subPickerSelectedIds,
  ]);

  const handleConfirmSubLinks = async () => {
    if (!activeContainer || !subLinkParentId) return;
    const childIds = Array.from(subPickerSelectedIds);
    const childIdSet = new Set(childIds);
    await persistActiveUpdate((c) => {
      const effSubLinks = getEffectiveContainerSubLinks(c, vouchers, deposits, voucherMap);
      const filtered = effSubLinks.filter((sl) => sl.parentVoucherId !== subLinkParentId);
      const nextSubLinks: FuelContainerSubLink[] =
        childIds.length > 0 || subPickerNotas.trim()
          ? [
              ...filtered,
              {
                parentVoucherId: subLinkParentId,
                childVoucherIds: childIds,
                notas: subPickerNotas.trim() || undefined,
              },
            ]
          : filtered;
      // Remove any child voucher from top-level voucherIds so it is not double-counted
      const cleanedVoucherIds = (c.voucherIds || []).filter((id) => !childIdSet.has(id));
      return { ...c, voucherIds: cleanedVoucherIds, subLinks: nextSubLinks };
    });
    setExpandedParents((prev) => ({ ...prev, [subLinkParentId]: true }));
    setSubLinkParentId(null);
  };

  const handleRemoveSingleSubLinkChild = async (parentId: string, childId: string) => {
    await persistActiveUpdate((c) => {
      const effSubLinks = getEffectiveContainerSubLinks(c, vouchers, deposits, voucherMap);
      const nextSubLinks = effSubLinks
        .map((sl) =>
          sl.parentVoucherId === parentId
            ? { ...sl, childVoucherIds: sl.childVoucherIds.filter((id) => id !== childId) }
            : sl
        )
        .filter((sl) => sl.childVoucherIds.length > 0 || Boolean(sl.notas));
      return { ...c, subLinks: nextSubLinks };
    });
  };

  // ==================== FACTURAS & ADJUNTOS (R2) ====================
  const openAddInvoiceModal = () => {
    if (!activeContainer) return;
    setInvTipo('FACTURA A');
    setInvNumero('');
    setInvFecha(normalizeDateISO(activeContainer.fechaHasta) || getTodayISO());
    setInvProveedor(activeContainer.proveedorNombre || '');
    setInvLitros('');
    setInvImporte('');
    setInvObs('');
    setInvFile(null);
    setIsInvoiceModalOpen(true);
  };

  const handleAddManualInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContainer) return;
    if (!invNumero.trim() && !invImporte) {
      onShowToast?.('Cargá al menos el número de comprobante o el importe.');
      return;
    }
    setIsUploadingInv(true);
    try {
      let adjuntoUrl: string | undefined;
      let adjuntoNombre: string | undefined;

      if (invFile) {
        const uploaded = await uploadFileToCloudflareR2(
          invFile,
          invFile.name,
          invFile.type || 'application/octet-stream',
          'combustible-contenedores'
        );
        if (!uploaded.success || !uploaded.url) {
          onShowToast?.(uploaded.error || 'No se pudo subir el archivo a Cloudflare R2.');
          setIsUploadingInv(false);
          return;
        }
        adjuntoUrl = uploaded.url;
        adjuntoNombre = invFile.name;
      }

      const newInv: FuelContainerInvoiceRef = {
        id: `FCI-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        tipoComprobante: invTipo,
        numeroComprobante: invNumero.trim() || 'S/N',
        fecha: invFecha || getTodayISO(),
        proveedorNombre: invProveedor.trim() || activeContainer.proveedorNombre,
        litrosFacturados: invLitros ? Number(invLitros) : undefined,
        importeTotal: Number(invImporte) || 0,
        adjuntoUrl,
        adjuntoNombre,
        observaciones: invObs.trim() || undefined,
      };

      const extraAdjunto: FuelContainerAdjunto[] = adjuntoUrl
        ? [
            {
              id: `FCA-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              nombre: adjuntoNombre || `${invTipo} ${newInv.numeroComprobante}`,
              tipoDocumento: invTipo.includes('RESUMEN') ? 'RESUMEN_PROVEEDOR' : 'FACTURA',
              url: adjuntoUrl,
              mimeType: invFile?.type || 'application/pdf',
              fechaSubida: new Date().toISOString(),
              notas: `Adjunto de ${invTipo} ${newInv.numeroComprobante}`,
            },
          ]
        : [];

      await persistActiveUpdate((c) => ({
        ...c,
        facturas: [newInv, ...(c.facturas || [])],
        adjuntos: [...extraAdjunto, ...(c.adjuntos || [])],
      }));
      setIsInvoiceModalOpen(false);
    } finally {
      setIsUploadingInv(false);
    }
  };

  const handleImportPurchaseInvoice = async (pi: PurchaseInvoice) => {
    if (!activeContainer) return;
    if ((activeContainer.facturas || []).some((f) => f.purchaseInvoiceId === pi.id)) {
      onShowToast?.('Esa factura de Compras ya está vinculada a este contenedor.');
      return;
    }
    const newRef: FuelContainerInvoiceRef = {
      id: `FCI-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      purchaseInvoiceId: pi.id,
      tipoComprobante: pi.tipoComprobante || 'FACTURA',
      numeroComprobante: pi.nroComprobanteCompleto || pi.numeroComprobante || pi.id,
      fecha: normalizeDateISO(pi.fechaEmision) || getTodayISO(),
      proveedorNombre: pi.proveedorNombre || activeContainer.proveedorNombre,
      importeTotal: Number(pi.montoTotal || 0),
      adjuntoUrl: pi.archivoPdfUrl,
      adjuntoNombre: pi.archivoPdfUrl ? `${pi.tipoComprobante || 'Factura'} ${pi.nroComprobanteCompleto || pi.numeroComprobante}.pdf` : undefined,
      observaciones: pi.observaciones || 'Importada desde Compras',
    };
    await persistActiveUpdate((c) => ({
      ...c,
      facturas: [newRef, ...(c.facturas || [])],
    }));
    onShowToast?.(`Factura ${newRef.numeroComprobante} vinculada al contenedor.`);
  };

  const handleRemoveInvoice = async (invoiceId: string) => {
    await persistActiveUpdate((c) => ({
      ...c,
      facturas: (c.facturas || []).filter((f) => f.id !== invoiceId),
    }));
  };

  const handleUploadAdjunto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeContainer) return;
    setIsUploadingAdjunto(true);
    try {
      const uploaded = await uploadFileToCloudflareR2(
        file,
        file.name,
        file.type || 'application/octet-stream',
        'combustible-contenedores'
      );
      if (!uploaded.success || !uploaded.url) {
        onShowToast?.(uploaded.error || 'No se pudo subir el documento a Cloudflare R2.');
        return;
      }
      const newDoc: FuelContainerAdjunto = {
        id: `FCA-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        nombre: file.name,
        tipoDocumento: adjuntoTipo,
        url: uploaded.url,
        mimeType: file.type || 'application/octet-stream',
        fechaSubida: new Date().toISOString(),
        notas: adjuntoNotas.trim() || undefined,
      };
      await persistActiveUpdate((c) => ({
        ...c,
        adjuntos: [newDoc, ...(c.adjuntos || [])],
      }));
      setAdjuntoNotas('');
      onShowToast?.(`Archivo "${file.name}" subido a Cloudflare R2 y guardado en Supabase.`);
    } finally {
      setIsUploadingAdjunto(false);
      if (adjuntoInputRef.current) adjuntoInputRef.current.value = '';
    }
  };

  const handleRemoveAdjunto = async (adjId: string) => {
    await persistActiveUpdate((c) => ({
      ...c,
      adjuntos: (c.adjuntos || []).filter((a) => a.id !== adjId),
    }));
  };

  // ==================== MACHINE FINAL BREAKDOWN (DIRECTO + INDIRECTO) ====================
  const activeMetrics = useMemo(
    () => (activeContainer ? computeContainerMetrics(activeContainer) : null),
    [activeContainer, vouchers, deposits]
  );

  const machineFinalBreakdown = useMemo(() => {
    if (!activeContainer || !activeMetrics) {
      return {
        rows: [] as Array<{
          key: string;
          equipo: string;
          marcaModelo: string;
          litrosDirectos: number;
          litrosIndirectos: number;
          totalLitros: number;
          cargasDirectas: number;
          cargasIndirectas: number;
          costoEstimado: number;
        }>,
        remanenteChulengo: [] as Array<{
          chulengo: string;
          fecha: string;
          cargado: number;
          bajado: number;
          remanente: number;
        }>,
      };
    }

    const map = new Map<
      string,
      {
        key: string;
        equipo: string;
        marcaModelo: string;
        litrosDirectos: number;
        litrosIndirectos: number;
        cargasDirectas: number;
        cargasIndirectas: number;
      }
    >();

    const remanenteChulengo: Array<{
      chulengo: string;
      fecha: string;
      cargado: number;
      bajado: number;
      remanente: number;
    }> = [];

    const addEntry = (v: FuelDispensary, liters: number, mode: 'DIRECTO' | 'INDIRECTO') => {
      const code = (v.codigoEquipo || v.marcaModelo || 'SIN EQUIPO').trim();
      const key = cleanStr(code) || 'sin-equipo';
      const fleetMatch = fleet.find(
        (fl) =>
          cleanStr(fl.codigoInterno) === key ||
          cleanStr(fl.modeloMarca) === key ||
          (v.patente && cleanStr(fl.patente) === cleanStr(v.patente))
      );
      const curr = map.get(key) || {
        key,
        equipo: fleetMatch?.modeloMarca || code,
        marcaModelo: v.marcaModelo || fleetMatch?.codigoInterno || v.patente || '',
        litrosDirectos: 0,
        litrosIndirectos: 0,
        cargasDirectas: 0,
        cargasIndirectas: 0,
      };
      if (mode === 'DIRECTO') {
        curr.litrosDirectos += liters;
        curr.cargasDirectas += 1;
      } else {
        curr.litrosIndirectos += liters;
        curr.cargasIndirectas += 1;
      }
      map.set(key, curr);
    };

    const subLinkMap = new Map<string, FuelContainerSubLink>();
    (activeMetrics.effectiveSubLinks || []).forEach((sl) => subLinkMap.set(sl.parentVoucherId, sl));

    activeMetrics.linkedVouchers.forEach((v) => {
      const liters = getVoucherLiters(v);
      const sl = subLinkMap.get(v.id);
      const { isChulengo } = isVoucherChulengoLoad(v, deposits);

      if (isChulengo || (sl && sl.childVoucherIds.length > 0)) {
        const childVouchers = (sl?.childVoucherIds || [])
          .map((cid) => voucherMap.get(cid))
          .filter((cv): cv is FuelDispensary => Boolean(cv));
        const sumChildren = childVouchers.reduce((s, cv) => s + getVoucherLiters(cv), 0);

        childVouchers.forEach((cv) => {
          addEntry(cv, getVoucherLiters(cv), 'INDIRECTO');
        });

        const rem = liters - sumChildren;
        if (Math.abs(rem) > 0.05) {
          remanenteChulengo.push({
            chulengo: getVoucherEquipmentLabel(v),
            fecha: v.fecha,
            cargado: liters,
            bajado: sumChildren,
            remanente: rem,
          });
        }
      } else {
        addEntry(v, liters, 'DIRECTO');
      }
    });

    const avgPrice = activeMetrics.precioPromedioLitro;
    const rows = Array.from(map.values())
      .map((r) => {
        const totalLitros = r.litrosDirectos + r.litrosIndirectos;
        return {
          ...r,
          totalLitros,
          costoEstimado: totalLitros * avgPrice,
        };
      })
      .sort((a, b) => b.totalLitros - a.totalLitros);

    return { rows, remanenteChulengo };
  }, [activeContainer, activeMetrics, deposits, voucherMap, fleet]);

  // Filtered linked vouchers in Detail view
  const filteredLinkedVouchers = useMemo(() => {
    if (!activeContainer || !activeMetrics) return [];
    const q = cleanStr(linkedSearch);
    const effSubLinks = activeMetrics.effectiveSubLinks || [];
    return [...activeMetrics.linkedVouchers]
      .filter((v) => {
        const { isChulengo } = isVoucherChulengoLoad(v, deposits);
        const hasSubLinks = effSubLinks.some(
          (sl) => sl.parentVoucherId === v.id && sl.childVoucherIds.length > 0
        );
        const treatAsChulengo = isChulengo || hasSubLinks;

        if (linkedKindFilter === 'CHULENGO' && !treatAsChulengo) return false;
        if (linkedKindFilter === 'DIRECTA' && treatAsChulengo) return false;

        if (q) {
          const childText = (
            effSubLinks.find((sl) => sl.parentVoucherId === v.id)
              ?.childVoucherIds || []
          )
            .map((cid) => {
              const cv = voucherMap.get(cid);
              return cv ? buildVoucherSearchHaystack(cv) : '';
            })
            .join(' ');
          const hay = `${buildVoucherSearchHaystack(v)} ${childText}`;
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => normalizeDateISO(b.fecha).localeCompare(normalizeDateISO(a.fecha)));
  }, [activeContainer, activeMetrics, deposits, linkedSearch, linkedKindFilter, voucherMap]);

  // Filtered purchase invoices for Import Modal
  const filteredPurchaseInvoices = useMemo(() => {
    const q = cleanStr(comprasSearch);
    const provHint = cleanStr(activeContainer?.proveedorNombre);
    return [...purchaseInvoices]
      .filter((pi) => {
        if (!q) return true;
        const hay = cleanStr(
          `${pi.nroComprobanteCompleto} ${pi.proveedorNombre} ${pi.fechaEmision} ${pi.observaciones || ''}`
        );
        return hay.includes(q);
      })
      .sort((a, b) => {
        // Prioritize same provider
        const aMatch = provHint && cleanStr(a.proveedorNombre).includes(provHint) ? 1 : 0;
        const bMatch = provHint && cleanStr(b.proveedorNombre).includes(provHint) ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
        return normalizeDateISO(b.fechaEmision).localeCompare(normalizeDateISO(a.fechaEmision));
      });
  }, [purchaseInvoices, comprasSearch, activeContainer]);

  // ==================== RENDER DETAIL WORKSPACE ====================
  if (activeContainer && activeMetrics) {
    const stMeta = STATUS_META[activeContainer.estado] || STATUS_META.ABIERTO;
    const diff = activeMetrics.diferenciaLitros;
    const isBalanced = activeMetrics.litrosReferencia > 0 && Math.abs(diff) <= 1;

    return (
      <div className="space-y-4">
        {/* Top Workspace Header */}
        <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <button
                onClick={() => setSelectedContainerId(null)}
                className="mt-0.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                Contenedores
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/15 border border-[#F0C800]/40 text-[#F0C800] text-[11px] font-black tracking-wider">
                    {activeContainer.codigo}
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-white truncate">
                    {activeContainer.titulo}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                    <Building2 className="w-3.5 h-3.5 text-[#F0C800]" />
                    {activeContainer.proveedorNombre}
                  </span>
                  {activeContainer.estacionConvenio && (
                    <span className="flex items-center gap-1 text-cyan-300">
                      <Fuel className="w-3.5 h-3.5" />
                      {activeContainer.estacionConvenio}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    {formatDateAR(activeContainer.fechaDesde)} → {formatDateAR(activeContainer.fechaHasta)}
                  </span>
                </div>

                {/* Linked Factura / Resumen / Remito badges */}
                {(() => {
                  const docBadges = getContainerDocumentBadges(activeContainer);
                  if (docBadges.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {docBadges.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            if (b.url) {
                              setPreviewDoc({
                                title: `${b.shortLabel} N° ${b.numero}`,
                                url: b.url,
                                mimeType: b.mimeType || (b.url.toLowerCase().includes('.pdf') ? 'application/pdf' : undefined),
                              });
                            } else {
                              setActiveTab('facturas');
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-black flex items-center gap-1.5 transition cursor-pointer hover:brightness-110 ${b.bgClass} ${b.textClass} ${b.borderClass}`}
                          title={
                            b.url
                              ? `Clic para ver PDF / adjunto de ${b.shortLabel} N° ${b.numero}`
                              : `Ver detalle de ${b.shortLabel} N° ${b.numero}`
                          }
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          <span>
                            {b.shortLabel} N° <span className="font-mono">{b.numero}</span>
                          </span>
                          {b.url && <Paperclip className="w-2.5 h-2.5 opacity-80 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value={activeContainer.estado}
                onChange={(e) =>
                  persistActiveUpdate((c) => ({
                    ...c,
                    estado: e.target.value as FuelContainerStatus,
                  }))
                }
                className={`px-3 py-2 rounded-xl text-xs font-black border cursor-pointer outline-none ${stMeta.bg} ${stMeta.text} ${stMeta.border}`}
              >
                <option value="ABIERTO" className="bg-slate-900 text-amber-300">
                  Estado: Abierto
                </option>
                <option value="CONCILIADO" className="bg-slate-900 text-cyan-300">
                  Estado: Conciliado
                </option>
                <option value="PAGADO" className="bg-slate-900 text-emerald-300">
                  Estado: Pagado
                </option>
                <option value="CERRADO" className="bg-slate-900 text-slate-300">
                  Estado: Cerrado
                </option>
              </select>

              <button
                onClick={() => openEditContainerModal(activeContainer)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Editar
              </button>
              <button
                onClick={() => setContainerToDelete(activeContainer)}
                className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </button>
            </div>
          </div>

          {activeContainer.observaciones && (
            <p className="mt-3 text-xs text-slate-400 bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2">
              {activeContainer.observaciones}
            </p>
          )}
        </div>

        {/* Reconciliation KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* Card 1: Litros Proveedor / Facturas */}
          <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span>Litros Resumen / Facturas</span>
              <FileText className="w-4 h-4 text-[#F0C800]" />
            </div>
            <div className="mt-2 text-2xl font-black text-white">
              {activeMetrics.litrosReferencia > 0
                ? formatLiters(activeMetrics.litrosReferencia)
                : 'Sin informar'}
            </div>
            <div className="mt-1 text-[11px] text-slate-400 truncate">
              {(() => {
                const docBadges = getContainerDocumentBadges(activeContainer);
                if (docBadges.length > 0) {
                  return docBadges.map((b) => `${b.shortLabel} N° ${b.numero}`).join(' · ');
                }
                return `${(activeContainer.facturas || []).length} factura(s) · ${(activeContainer.adjuntos || []).length} adjunto(s) R2`;
              })()}
            </div>
          </div>

          {/* Card 2: Litros Vinculados + Diferencia */}
          <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span>Litros Cargas Vinculadas</span>
              <Droplets className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-black text-cyan-300">
                {formatLiters(activeMetrics.litrosVinculados)}
              </span>
              {activeMetrics.litrosReferencia > 0 && (
                <span
                  className={`text-[11px] font-black px-2 py-0.5 rounded-md ${
                    isBalanced
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {isBalanced
                    ? '✓ Conciliado'
                    : `Dif: ${diff > 0 ? '+' : ''}${formatLiters(diff)}`}
                </span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {activeMetrics.linkedVouchers.length} carga(s) directas vinculadas (sin duplicar sub-vínculos)
            </div>
          </div>

          {/* Card 3: Importe Facturado */}
          <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span>Importe Facturado / Resumen</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-300">
              {formatMoney(activeMetrics.importeReferencia || activeMetrics.importeCargas)}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {activeMetrics.precioPromedioLitro > 0
                ? `Promedio: ${formatMoney(activeMetrics.precioPromedioLitro)} / litro`
                : 'Cargá importe en facturas o resumen'}
            </div>
          </div>

          {/* Card 4: Trazabilidad Chulengo -> Máquinas */}
          <div className="bg-[#16191F] border border-amber-500/25 rounded-2xl p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-300">
              <span>Sub-vínculos Chulengo ➔ Máquinas</span>
              <GitBranch className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">
                {activeMetrics.totalSubLinkedChildren}
              </span>
              <span className="text-xs font-bold text-amber-300">
                descarga(s) ({formatLiters(activeMetrics.litrosSubVinculados)})
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {activeMetrics.chulengoLoadsCount} carga(s) a Chulengo/Cisterna ({formatLiters(activeMetrics.litrosAChulengos)})
            </div>
          </div>
        </div>

        {/* Inner Workspace Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('cargas')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'cargas'
                ? 'bg-[#F0C800] text-slate-950 shadow-lg shadow-[#F0C800]/15'
                : 'bg-[#16191F] text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            Cargas & Sub-vínculos Chulengo
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                activeTab === 'cargas' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {activeMetrics.linkedVouchers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('facturas')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'facturas'
                ? 'bg-[#F0C800] text-slate-950 shadow-lg shadow-[#F0C800]/15'
                : 'bg-[#16191F] text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            Facturas, Resúmenes & Adjuntos
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                activeTab === 'facturas' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {(activeContainer.facturas || []).length + (activeContainer.adjuntos || []).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('maquinas')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'maquinas'
                ? 'bg-[#F0C800] text-slate-950 shadow-lg shadow-[#F0C800]/15'
                : 'bg-[#16191F] text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Truck className="w-4 h-4" />
            Destino Final por Máquina
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                activeTab === 'maquinas' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {machineFinalBreakdown.rows.length}
            </span>
          </button>
        </div>

        {/* ==================== TAB 1: CARGAS & SUB-VÍNCULOS ==================== */}
        {activeTab === 'cargas' && (
          <div className="space-y-3">
            {/* Action Bar */}
            <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={linkedSearch}
                    onChange={(e) => setLinkedSearch(e.target.value)}
                    placeholder="Buscar equipo, chulengo, chofer, N° ticket..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:border-[#F0C800] outline-none"
                  />
                </div>

                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1">
                  {(['TODAS', 'CHULENGO', 'DIRECTA'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setLinkedKindFilter(k)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        linkedKindFilter === k
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {k === 'TODAS'
                        ? 'Todas'
                        : k === 'CHULENGO'
                        ? 'Chulengos / Cisternas'
                        : 'Directas a Máquina'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {activeMetrics.chulengoLoadsCount > 0 && (
                  <button
                    onClick={handleAutoLinkChulengoDischarges}
                    className="px-3.5 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                    title="Vincula automáticamente todas las descargas desde Chulengo/Cisterna hacia máquinas registradas en las fechas de este contenedor"
                  >
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Auto-vincular Descargas Chulengo
                  </button>
                )}
                <button
                  onClick={openLinkVouchersModal}
                  className="px-4 py-2.5 rounded-xl bg-[#F0C800] hover:bg-[#ffda1a] text-slate-950 text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-[#F0C800]/15"
                >
                  <Link2 className="w-4 h-4" />
                  Vincular Cargas de Combustible
                </button>
              </div>
            </div>

            {/* Linked Loads Tree List */}
            {filteredLinkedVouchers.length === 0 ? (
              <div className="bg-[#16191F] border border-dashed border-slate-700 rounded-2xl p-10 text-center">
                <Fuel className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-300">
                  {activeMetrics.linkedVouchers.length === 0
                    ? 'Todavía no vinculaste cargas de combustible a este contenedor.'
                    : 'No hay cargas que coincidan con el filtro.'}
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Vinculá las cargas de estación del período (tanto directas a máquinas como cargas a Chulengos/Cisternas) y después sub-vinculá las descargas del Chulengo a cada máquina.
                </p>
                {activeMetrics.linkedVouchers.length === 0 && (
                  <button
                    onClick={openLinkVouchersModal}
                    className="mt-4 px-4 py-2.5 rounded-xl bg-[#F0C800] hover:bg-[#ffda1a] text-slate-950 text-xs font-black inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Traer Cargas del Período
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredLinkedVouchers.map((v) => {
                  const liters = getVoucherLiters(v);
                  const { isChulengo, matchedDeposit } = isVoucherChulengoLoad(v, deposits);
                  const subLink = (activeMetrics.effectiveSubLinks || []).find(
                    (sl) => sl.parentVoucherId === v.id
                  );
                  const childVouchers = (subLink?.childVoucherIds || [])
                    .map((cid) => voucherMap.get(cid))
                    .filter((cv): cv is FuelDispensary => Boolean(cv));
                  const childLitersSum = childVouchers.reduce(
                    (s, cv) => s + getVoucherLiters(cv),
                    0
                  );
                  const remanente = liters - childLitersSum;
                  const pctDistributed =
                    liters > 0 ? Math.min(100, Math.round((childLitersSum / liters) * 100)) : 0;
                  const treatAsChulengo = isChulengo || childVouchers.length > 0;
                  const isExpanded =
                    expandedParents[v.id] !== undefined
                      ? expandedParents[v.id]
                      : treatAsChulengo;

                  return (
                    <div
                      key={v.id}
                      className={`bg-[#16191F] border rounded-2xl overflow-hidden transition ${
                        treatAsChulengo
                          ? 'border-amber-500/35 shadow-md shadow-amber-950/10'
                          : 'border-slate-800'
                      }`}
                    >
                      {/* Parent Load Row */}
                      <div className="p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {treatAsChulengo ? (
                            <button
                              onClick={() =>
                                setExpandedParents((prev) => ({
                                  ...prev,
                                  [v.id]: !isExpanded,
                                }))
                              }
                              className="mt-0.5 p-1.5 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition cursor-pointer shrink-0"
                              title={isExpanded ? 'Contraer sub-vínculos' : 'Expandir sub-vínculos'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <div className="mt-0.5 p-1.5 rounded-lg bg-slate-800/80 text-cyan-400 shrink-0">
                              <Fuel className="w-4 h-4" />
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-black text-slate-300 bg-slate-800/90 px-2 py-0.5 rounded-md">
                                {formatDateAR(v.fecha)}
                                {v.hora ? ` · ${v.hora}` : ''}
                              </span>
                              <span className="text-sm font-black text-white">
                                {getVoucherEquipmentLabel(v)}
                              </span>
                              {getVoucherTicketNumber(v) && (
                                <span className="text-[11px] font-mono font-black text-[#F0C800] bg-[#F0C800]/10 border border-[#F0C800]/35 px-2 py-0.5 rounded-md">
                                  Ticket N° {getVoucherTicketNumber(v)}
                                </span>
                              )}
                              {v.patente && (
                                <span className="text-[11px] font-bold text-slate-400 bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded">
                                  {v.patente}
                                </span>
                              )}
                              {treatAsChulengo && (
                                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                  <GitBranch className="w-3 h-3" />
                                  Chulengo / Cisterna
                                  {matchedDeposit ? ` · ${matchedDeposit.nombre}` : ''}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-400">
                              <span>
                                Origen: <strong className="text-slate-200">{v.deposito || 'Estación'}</strong>
                              </span>
                              <span>
                                Combustible: <strong className="text-cyan-300">{v.tipoComb || '-'}</strong>
                              </span>
                              <span>
                                Chofer:{' '}
                                <strong className="text-slate-200">
                                  {v.nombreApellido || v.codigoEmpleado || '-'}
                                </strong>
                              </span>
                              {getVoucherOrderOrValeNumber(v) && (
                                <span>
                                  Orden/Vale:{' '}
                                  <strong className="text-slate-300 font-mono">
                                    {getVoucherOrderOrValeNumber(v)}
                                  </strong>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right stats & actions */}
                        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5 shrink-0 pl-9 lg:pl-0">
                          <div className="text-right mr-1">
                            <div className="text-base font-black text-white">
                              {formatLiters(liters)}
                            </div>
                            {(v.totalImporte || 0) > 0 && (
                              <div className="text-[11px] font-bold text-emerald-400">
                                {formatMoney(Number(v.totalImporte))}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => openSubLinkModal(v.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                              treatAsChulengo
                                ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/45 text-amber-200'
                                : 'bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300'
                            }`}
                            title="Ver o ajustar manualmente las descargas de este tramo del Chulengo"
                          >
                            <GitBranch className="w-3.5 h-3.5" />
                            {childVouchers.length > 0
                              ? `Salidas del tramo (${childVouchers.length})`
                              : 'Sub-vincular a Máquinas'}
                          </button>

                          <button
                            onClick={() => handleUnlinkVoucher(v.id)}
                            className="p-2 rounded-xl bg-slate-800/70 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                            title="Quitar carga de este contenedor"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Sub-links Branch (Indented Chulengo -> Máquinas) */}
                      {treatAsChulengo && isExpanded && (
                        <div className="bg-slate-950/75 border-t border-amber-500/20 px-4 py-3 sm:pl-12">
                          {/* Reconciliation progress bar for this Chulengo load */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                                <GitBranch className="w-3.5 h-3.5" />
                                Estimativo automático por tramo (salidas hasta la próxima carga al Chulengo):
                              </span>
                              <span className="text-slate-300">
                                Bajado a máquinas:{' '}
                                <strong className="text-cyan-300">
                                  {formatLiters(childLitersSum)}
                                </strong>{' '}
                                / {formatLiters(liters)}
                              </span>
                              <span
                                className={`font-bold ${
                                  remanente < -0.5
                                    ? 'text-cyan-300'
                                    : Math.abs(remanente) <= 1
                                    ? 'text-emerald-400'
                                    : 'text-amber-300'
                                }`}
                              >
                                {remanente < -0.5
                                  ? `Incluye ~${formatLiters(Math.abs(remanente))} de saldo previo en tanque`
                                  : Math.abs(remanente) <= 1
                                  ? '✓ ~100% distribuido en el tramo'
                                  : `Remanente estimado en tanque: ${formatLiters(remanente)}`}
                              </span>
                            </div>

                            <button
                              onClick={() => openSubLinkModal(v.id)}
                              className="text-[11px] font-black text-amber-300 hover:text-amber-200 underline cursor-pointer self-start sm:self-auto"
                            >
                              Ajustar descargas del tramo
                            </button>
                          </div>

                          {/* Progress bar */}
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mb-3">
                            <div
                              className={`h-full transition-all ${
                                remanente < -0.5
                                  ? 'bg-cyan-400'
                                  : pctDistributed >= 98
                                  ? 'bg-emerald-500'
                                  : 'bg-amber-400'
                              }`}
                              style={{ width: `${pctDistributed}%` }}
                            />
                          </div>

                          {childVouchers.length === 0 ? (
                            <div className="text-xs text-slate-500 italic py-1.5 flex items-center justify-between">
                              <span>
                                No se registraron salidas desde el Chulengo en este tramo antes de la siguiente carga.
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {childVouchers.map((cv) => (
                                <div
                                  key={cv.id}
                                  className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-xs"
                                >
                                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                                    <span className="text-amber-400 font-black">↳</span>
                                    <span className="text-slate-400 font-semibold">
                                      {formatDateAR(cv.fecha)}
                                    </span>
                                    <span className="font-black text-white">
                                      {getVoucherEquipmentLabel(cv)}
                                    </span>
                                    {(getVoucherTicketNumber(cv) || getVoucherOrderOrValeNumber(cv)) && (
                                      <span className="text-[10px] font-mono font-bold text-[#F0C800] bg-[#F0C800]/10 border border-[#F0C800]/30 px-1.5 py-0.5 rounded">
                                        {getVoucherTicketNumber(cv)
                                          ? `Ticket N° ${getVoucherTicketNumber(cv)}`
                                          : `Ord N° ${getVoucherOrderOrValeNumber(cv)}`}
                                      </span>
                                    )}
                                    {cv.patente && (
                                      <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                        {cv.patente}
                                      </span>
                                    )}
                                    <span className="text-slate-400">
                                      · {cv.nombreApellido || cv.codigoEmpleado || '-'}
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                      (desde {cv.deposito || 'Chulengo'})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2.5 shrink-0">
                                    <span className="font-black text-cyan-300">
                                      {formatLiters(getVoucherLiters(cv))}
                                    </span>
                                    <button
                                      onClick={() => handleRemoveSingleSubLinkChild(v.id, cv.id)}
                                      className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-300 transition cursor-pointer"
                                      title="Quitar sub-vínculo"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {subLink?.notas && (
                            <p className="mt-2 text-[11px] text-slate-400">
                              Nota: {subLink.notas}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 2: FACTURAS, RESÚMENES & ADJUNTOS ==================== */}
        {activeTab === 'facturas' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Left: Facturas & Resúmenes */}
            <div className="xl:col-span-7 bg-[#16191F] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#F0C800]" />
                    Facturas & Resúmenes del Proveedor
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cargá las facturas o el resumen de cuenta corriente que te manda la estación, o traelas directo desde Compras.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setComprasSearch('');
                      setIsImportComprasOpen(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                    Traer de Compras
                  </button>
                  <button
                    onClick={openAddInvoiceModal}
                    className="px-3 py-2 rounded-xl bg-[#F0C800] hover:bg-[#ffda1a] text-slate-950 text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Cargar Factura / Resumen
                  </button>
                </div>
              </div>

              {(activeContainer.facturas || []).length === 0 ? (
                <div className="border border-dashed border-slate-700 rounded-xl p-8 text-center">
                  <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-400">
                    Todavía no cargaste facturas ni resúmenes en este contenedor.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {(activeContainer.facturas || []).map((f) => (
                    <div
                      key={f.id}
                      className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black">
                            {f.tipoComprobante}
                          </span>
                          <span className="text-sm font-black text-white">
                            N° {f.numeroComprobante}
                          </span>
                          <span className="text-xs text-slate-400">{formatDateAR(f.fecha)}</span>
                          {f.purchaseInvoiceId && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">
                              Vinculada a Compras
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {f.proveedorNombre}
                          {f.observaciones ? ` · ${f.observaciones}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-black text-emerald-300">
                            {formatMoney(f.importeTotal)}
                          </div>
                          {f.litrosFacturados && f.litrosFacturados > 0 && (
                            <div className="text-[11px] font-bold text-cyan-300">
                              {formatLiters(f.litrosFacturados)}
                            </div>
                          )}
                        </div>

                        {f.adjuntoUrl && (
                          <button
                            onClick={() =>
                              setPreviewDoc({
                                title: `${f.tipoComprobante} ${f.numeroComprobante}`,
                                url: f.adjuntoUrl!,
                                mimeType: f.adjuntoNombre?.toLowerCase().endsWith('.pdf')
                                  ? 'application/pdf'
                                  : undefined,
                              })
                            }
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 transition cursor-pointer"
                            title="Ver comprobante"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveInvoice(f.id)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                          title="Quitar factura"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Documentos Adjuntos R2 */}
            <div className="xl:col-span-5 bg-[#16191F] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-cyan-400" />
                  Resúmenes PDF, Remitos & Comprobantes
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Subí el PDF/foto del resumen que manda el proveedor, facturas o comprobantes de pago (se guardan en Cloudflare R2).
                </p>
              </div>

              {/* Upload Box */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={adjuntoTipo}
                    onChange={(e) => setAdjuntoTipo(e.target.value as FuelContainerDocTipo)}
                    className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-bold outline-none focus:border-[#F0C800]"
                  >
                    {Object.entries(DOC_TIPO_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={adjuntoNotas}
                    onChange={(e) => setAdjuntoNotas(e.target.value)}
                    placeholder="Nota opcional (ej: Quincena 1)"
                    className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-[#F0C800]"
                  />
                </div>

                <input
                  ref={adjuntoInputRef}
                  type="file"
                  accept="application/pdf,image/*,.xlsx,.xls,.csv"
                  onChange={handleUploadAdjunto}
                  className="hidden"
                />
                <button
                  onClick={() => adjuntoInputRef.current?.click()}
                  disabled={isUploadingAdjunto}
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {isUploadingAdjunto ? 'Subiendo archivo a Cloudflare R2...' : 'Subir PDF / Imagen / Resumen'}
                </button>
              </div>

              {/* Uploaded Docs List */}
              {(activeContainer.adjuntos || []).length === 0 ? (
                <div className="border border-dashed border-slate-700 rounded-xl p-6 text-center text-xs text-slate-500">
                  Sin archivos adjuntos todavía.
                </div>
              ) : (
                <div className="space-y-2">
                  {(activeContainer.adjuntos || []).map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 shrink-0">
                            {DOC_TIPO_LABELS[doc.tipoDocumento] || 'Adjunto'}
                          </span>
                          <span className="text-xs font-bold text-white truncate">{doc.nombre}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {formatDateAR(doc.fechaSubida)}
                          {doc.notas ? ` · ${doc.notas}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() =>
                            setPreviewDoc({
                              title: doc.nombre,
                              url: doc.url,
                              mimeType: doc.mimeType,
                            })
                          }
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 cursor-pointer"
                          title="Ver archivo"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={doc.url}
                          download={doc.nombre}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title="Descargar"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => handleRemoveAdjunto(doc.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                          title="Eliminar adjunto"
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
        )}

        {/* ==================== TAB 3: DESTINO FINAL POR MÁQUINA ==================== */}
        {activeTab === 'maquinas' && (
          <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#F0C800]" />
                  Consumo Real por Máquina (Directo en Estación + Indirecto vía Chulengo)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Reemplaza cada carga al Chulengo por las máquinas sub-vinculadas para no duplicar litros y saber cuánto gastó realmente cada equipo en este resumen.
                </p>
              </div>
              {activeMetrics.precioPromedioLitro > 0 && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 shrink-0">
                  Tarifa promedio: {formatMoney(activeMetrics.precioPromedioLitro)} / L
                </span>
              )}
            </div>

            {machineFinalBreakdown.rows.length === 0 &&
            machineFinalBreakdown.remanenteChulengo.length === 0 ? (
              <div className="border border-dashed border-slate-700 rounded-xl p-8 text-center text-xs text-slate-500">
                Vinculá cargas al contenedor para ver el desglose final por máquina.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400">
                      <th className="py-2.5 px-3">Máquina / Vehículo</th>
                      <th className="py-2.5 px-3 text-right">Directo (Estación)</th>
                      <th className="py-2.5 px-3 text-right">Indirecto (vía Chulengo)</th>
                      <th className="py-2.5 px-3 text-right">Total Litros</th>
                      <th className="py-2.5 px-3 text-right">%</th>
                      <th className="py-2.5 px-3 text-right">Costo Estimado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {machineFinalBreakdown.rows.map((row) => {
                      const pct =
                        activeMetrics.litrosVinculados > 0
                          ? (row.totalLitros / activeMetrics.litrosVinculados) * 100
                          : 0;
                      return (
                        <tr key={row.key} className="hover:bg-slate-800/35">
                          <td className="py-2.5 px-3">
                            <div className="font-black text-white">{row.equipo}</div>
                            {row.marcaModelo && (
                              <div className="text-[11px] text-slate-400">{row.marcaModelo}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-300">
                            {row.litrosDirectos > 0 ? (
                              <span>
                                {formatLiters(row.litrosDirectos)}{' '}
                                <span className="text-[10px] text-slate-500">
                                  ({row.cargasDirectas})
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-amber-300 font-bold">
                            {row.litrosIndirectos > 0 ? (
                              <span>
                                {formatLiters(row.litrosIndirectos)}{' '}
                                <span className="text-[10px] text-amber-400/70">
                                  ({row.cargasIndirectas})
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-cyan-300">
                            {formatLiters(row.totalLitros)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400">
                            {pct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-emerald-300">
                            {row.costoEstimado > 0 ? formatMoney(row.costoEstimado) : '-'}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Remanente aún en Chulengo */}
                    {machineFinalBreakdown.remanenteChulengo.map((rem, idx) => (
                      <tr key={`rem-${idx}`} className="bg-amber-500/5">
                        <td className="py-2.5 px-3">
                          <div className="font-black text-amber-300 flex items-center gap-1.5">
                            <GitBranch className="w-3.5 h-3.5" />
                            {rem.remanente > 0
                              ? `Remanente sin bajar en ${rem.chulengo}`
                              : `Excedente sub-vinculado en ${rem.chulengo}`}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Carga del {formatDateAR(rem.fecha)}: {formatLiters(rem.cargado)} cargados ·{' '}
                            {formatLiters(rem.bajado)} bajados a máquinas
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">-</td>
                        <td className="py-2.5 px-3 text-right text-amber-300 font-bold">
                          {rem.remanente > 0 ? 'En tanque' : 'Ajuste'}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-black ${
                            rem.remanente > 0 ? 'text-amber-300' : 'text-rose-400'
                          }`}
                        >
                          {rem.remanente > 0 ? formatLiters(rem.remanente) : `-${formatLiters(Math.abs(rem.remanente))}`}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-400">
                          {activeMetrics.litrosVinculados > 0
                            ? `${((rem.remanente / activeMetrics.litrosVinculados) * 100).toFixed(1)}%`
                            : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-300">
                          {activeMetrics.precioPromedioLitro > 0
                            ? formatMoney(rem.remanente * activeMetrics.precioPromedioLitro)
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================== MODAL: LINK DIRECT FUEL LOADS ==================== */}
        {isLinkVouchersOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <div className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-[#F0C800]" />
                    Vincular Cargas de Combustible a {activeContainer.codigo}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Seleccioná las cargas de estación (directas a máquinas o a Chulengos/Cisternas) que corresponden a este resumen/factura.
                  </p>
                </div>
                <button
                  onClick={() => setIsLinkVouchersOpen(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Filter Bar */}
              <div className="p-3.5 border-b border-slate-800 bg-slate-900/50 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="N° ticket (ej: 0048-58524), orden, equipo, chofer..."
                      className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                    />
                  </div>
                  <input
                    type="date"
                    value={pickerDateFrom}
                    onChange={(e) => setPickerDateFrom(e.target.value)}
                    className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                  />
                  <input
                    type="date"
                    value={pickerDateTo}
                    onChange={(e) => setPickerDateTo(e.target.value)}
                    className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                  />
                  <select
                    value={pickerDeposit}
                    onChange={(e) => setPickerDeposit(e.target.value)}
                    className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                  >
                    <option value="ALL">Todos los orígenes / estaciones</option>
                    {uniqueDepositOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pickerHideAssignedElsewhere}
                        onChange={(e) => setPickerHideAssignedElsewhere(e.target.checked)}
                        className="rounded border-slate-600 accent-[#F0C800]"
                      />
                      Ocultar ya vinculadas a otro contenedor
                    </label>
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pickerHideInternalDischarges}
                        onChange={(e) => setPickerHideInternalDischarges(e.target.checked)}
                        className="rounded border-slate-600 accent-[#F0C800]"
                      />
                      Ocultar descargas desde Chulengo a máquinas (si las tildás se sub-vinculan solas)
                    </label>
                    {(pickerDateFrom || pickerDateTo) && (
                      <button
                        onClick={() => {
                          setPickerDateFrom('');
                          setPickerDateTo('');
                        }}
                        className="text-cyan-400 hover:underline font-bold cursor-pointer"
                      >
                        Ver todas las fechas
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const next = new Set(pickerSelectedIds);
                        pickerFilteredVouchers.forEach((v) => next.add(v.id));
                        setPickerSelectedIds(next);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 text-[11px] font-black cursor-pointer"
                    >
                      Seleccionar visibles ({pickerFilteredVouchers.length})
                    </button>
                  </div>
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {pickerFilteredVouchers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No se encontraron cargas con esos filtros. Probá limpiar fechas o destildar los filtros de arriba.
                  </div>
                ) : (
                  pickerFilteredVouchers.map((v) => {
                    const checked = pickerSelectedIds.has(v.id);
                    const { isChulengo } = isVoucherChulengoLoad(v, deposits);
                    const isChulengoDischarge = isVoucherInternalChulengoDischarge(v, deposits);
                    const other = voucherToContainerMap.get(v.id);
                    const inOther = other && other.id !== activeContainer.id;
                    const ticketNum = getVoucherTicketNumber(v);
                    const ordNum = getVoucherOrderOrValeNumber(v);

                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          const next = new Set(pickerSelectedIds);
                          if (checked) next.delete(v.id);
                          else next.add(v.id);
                          setPickerSelectedIds(next);
                        }}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition ${
                          checked
                            ? isChulengoDischarge
                              ? 'bg-cyan-500/12 border-cyan-400/50'
                              : 'bg-[#F0C800]/10 border-[#F0C800]/50'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                              checked
                                ? isChulengoDischarge
                                  ? 'bg-cyan-400 border-cyan-400 text-slate-950'
                                  : 'bg-[#F0C800] border-[#F0C800] text-slate-950'
                                : 'border-slate-600 bg-slate-950'
                            }`}
                          >
                            {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-slate-400">
                                {formatDateAR(v.fecha)}
                              </span>
                              <span className="text-xs font-black text-white">
                                {getVoucherEquipmentLabel(v)}
                              </span>
                              {ticketNum && (
                                <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/35">
                                  Ticket N° {ticketNum}
                                </span>
                              )}
                              {ordNum && ordNum !== ticketNum && (
                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  Ord/Vale N° {ordNum}
                                </span>
                              )}
                              {isChulengo && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35">
                                  CARGA A CHULENGO / CISTERNA
                                </span>
                              )}
                              {isChulengoDischarge && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/35">
                                  DESCARGA DESDE CHULENGO ➔ MÁQUINA
                                </span>
                              )}
                              {inOther && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300">
                                  En {other.codigo}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {isChulengoDischarge
                                ? 'DEPOS.AMARILLO / Chulengo'
                                : v.deposito || 'Estación'}{' '}
                              · {v.tipoComb || '-'} ·{' '}
                              {v.nombreApellido || v.codigoEmpleado || '-'}
                              {ticketNum
                                ? ` · Ticket N° ${ticketNum}`
                                : ordNum
                                ? ` · N° ${ordNum}`
                                : ''}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs font-black text-cyan-300">
                            {formatLiters(getVoucherLiters(v))}
                          </div>
                          {(v.totalImporte || 0) > 0 && (
                            <div className="text-[10px] text-emerald-400">
                              {formatMoney(Number(v.totalImporte))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/70 flex flex-wrap items-center justify-between gap-3">
                {(() => {
                  let stationCount = 0;
                  let stationLiters = 0;
                  let dischargeCount = 0;
                  let dischargeLiters = 0;
                  Array.from(pickerSelectedIds).forEach((id) => {
                    const v = voucherMap.get(id);
                    if (!v) return;
                    const lts = getVoucherLiters(v);
                    if (isVoucherInternalChulengoDischarge(v, deposits)) {
                      dischargeCount += 1;
                      dischargeLiters += lts;
                    } else {
                      stationCount += 1;
                      stationLiters += lts;
                    }
                  });
                  return (
                    <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>
                        <strong className="text-white">{stationCount}</strong> carga(s) de estación ·{' '}
                        <strong className="text-cyan-300">{formatLiters(stationLiters)}</strong>
                      </span>
                      {dischargeCount > 0 && (
                        <span className="text-amber-300">
                          + <strong>{dischargeCount}</strong> descarga(s) de Chulengo ({formatLiters(dischargeLiters)})
                        </span>
                      )}
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsLinkVouchersOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmLinkVouchers}
                    className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#ffda1a] text-slate-950 text-xs font-black cursor-pointer"
                  >
                    Guardar Vínculos
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== MODAL: SUB-LINK CHULENGO -> MÁQUINAS ==================== */}
        {subLinkParentId && subLinkParentVoucher && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <div className="bg-[#16191F] border border-amber-500/40 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-slate-800 bg-amber-500/5 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-amber-400" />
                    <h3 className="text-base font-black text-white">
                      Sub-vincular Descargas desde Chulengo ➔ Máquinas
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Carga origen:{' '}
                    <strong className="text-amber-300">
                      {getVoucherEquipmentLabel(subLinkParentVoucher)}
                    </strong>{' '}
                    el {formatDateAR(subLinkParentVoucher.fecha)} ·{' '}
                    <strong className="text-white">
                      {formatLiters(getVoucherLiters(subLinkParentVoucher))}
                    </strong>{' '}
                    ({subLinkParentVoucher.tipoComb})
                  </p>
                </div>
                <button
                  onClick={() => setSubLinkParentId(null)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Live Chulengo Volume Counter */}
              {(() => {
                const parentLts = getVoucherLiters(subLinkParentVoucher);
                const selectedLts = Array.from(subPickerSelectedIds).reduce((s, cid) => {
                  const cv = voucherMap.get(cid);
                  return s + (cv ? getVoucherLiters(cv) : 0);
                }, 0);
                const rem = parentLts - selectedLts;
                const pct = parentLts > 0 ? Math.min(100, Math.round((selectedLts / parentLts) * 100)) : 0;
                return (
                  <div className="px-4 py-3 bg-slate-900/80 border-b border-slate-800 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-300">
                        Sub-vinculado a máquinas:{' '}
                        <strong className="text-cyan-300">{formatLiters(selectedLts)}</strong> de{' '}
                        <strong className="text-white">{formatLiters(parentLts)}</strong> ({pct}%)
                      </span>
                      <span
                        className={`font-black ${
                          rem < -0.5
                            ? 'text-rose-400'
                            : Math.abs(rem) <= 1
                            ? 'text-emerald-400'
                            : 'text-amber-300'
                        }`}
                      >
                        {rem < -0.5
                          ? `Excede en ${formatLiters(Math.abs(rem))}`
                          : Math.abs(rem) <= 1
                          ? '✓ Total cubierto'
                          : `Remanente: ${formatLiters(rem)}`}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          rem < -0.5 ? 'bg-rose-500' : pct >= 98 ? 'bg-emerald-500' : 'bg-amber-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Search & Toggle */}
              <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={subPickerSearch}
                    onChange={(e) => setSubPickerSearch(e.target.value)}
                    placeholder="Buscar N° ticket, orden, máquina receptora, chofer, fecha..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={subPickerShowAll}
                    onChange={(e) => setSubPickerShowAll(e.target.checked)}
                    className="rounded border-slate-600 accent-amber-400"
                  />
                  Mostrar también otras cargas del sistema
                </label>
              </div>

              {/* Candidate List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-amber-300 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Descargas sugeridas desde Chulengo / Cisterna ({subLinkCandidates.suggested.length})
                  </div>
                  {subLinkCandidates.suggested.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-900/50 border border-dashed border-slate-800 text-xs text-slate-500 text-center">
                      No encontramos descargas registradas desde este Chulengo. Podés tildar "Mostrar también otras cargas del sistema" para elegir cualquiera manualmente.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {subLinkCandidates.suggested.map((cv) => {
                        const checked = subPickerSelectedIds.has(cv.id);
                        const prevAssigned = childVoucherAssignedElsewhere.get(cv.id);
                        const assignedElsewhere =
                          prevAssigned &&
                          (prevAssigned.containerId !== activeContainer.id ||
                            prevAssigned.parentVoucherId !== subLinkParentId);
                        const cvTicket = getVoucherTicketNumber(cv);
                        const cvOrd = getVoucherOrderOrValeNumber(cv);
                        const daysDiff = getDaysDiff(
                          normalizeDateISO(cv.fecha),
                          normalizeDateISO(subLinkParentVoucher.fecha)
                        );

                        return (
                          <div
                            key={cv.id}
                            onClick={() => {
                              const next = new Set(subPickerSelectedIds);
                              if (checked) next.delete(cv.id);
                              else next.add(cv.id);
                              setSubPickerSelectedIds(next);
                            }}
                            className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition ${
                              checked
                                ? 'bg-amber-500/15 border-amber-500/50'
                                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                                  checked
                                    ? 'bg-amber-400 border-amber-400 text-slate-950'
                                    : 'border-slate-600 bg-slate-950'
                                }`}
                              >
                                {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-bold text-slate-400">
                                    {formatDateAR(cv.fecha)}
                                  </span>
                                  <span className="text-xs font-black text-white">
                                    {getVoucherEquipmentLabel(cv)}
                                  </span>
                                  {daysDiff === 0 && (
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/35">
                                      Mismo día de la carga
                                    </span>
                                  )}
                                  {daysDiff > 0 && daysDiff <= 4 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                      +{daysDiff} día{daysDiff > 1 ? 's' : ''} después
                                    </span>
                                  )}
                                  {daysDiff < 0 && daysDiff >= -4 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                      {Math.abs(daysDiff)} día{Math.abs(daysDiff) > 1 ? 's' : ''} antes
                                    </span>
                                  )}
                                  {cvTicket && (
                                    <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/35">
                                      Ticket N° {cvTicket}
                                    </span>
                                  )}
                                  {cvOrd && cvOrd !== cvTicket && (
                                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                      Ord N° {cvOrd}
                                    </span>
                                  )}
                                  {assignedElsewhere && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 font-bold">
                                      Ya sub-vinculada ({prevAssigned.containerCode})
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  Desde: DEPOS.AMARILLO / Chulengo · {cv.tipoComb || '-'} ·{' '}
                                  {cv.nombreApellido || cv.codigoEmpleado || '-'}
                                </div>
                              </div>
                            </div>
                            <span className="text-xs font-black text-cyan-300 shrink-0">
                              {formatLiters(getVoucherLiters(cv))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {subLinkCandidates.others.length > 0 && (
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                      Otras cargas en el sistema ({subLinkCandidates.others.length})
                    </div>
                    <div className="space-y-1.5">
                      {subLinkCandidates.others.slice(0, 80).map((cv) => {
                        const checked = subPickerSelectedIds.has(cv.id);
                        const cvTicket = getVoucherTicketNumber(cv);
                        const cvOrd = getVoucherOrderOrValeNumber(cv);
                        return (
                          <div
                            key={cv.id}
                            onClick={() => {
                              const next = new Set(subPickerSelectedIds);
                              if (checked) next.delete(cv.id);
                              else next.add(cv.id);
                              setSubPickerSelectedIds(next);
                            }}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition ${
                              checked
                                ? 'bg-amber-500/15 border-amber-500/50'
                                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                                  checked
                                    ? 'bg-amber-400 border-amber-400 text-slate-950'
                                    : 'border-slate-600 bg-slate-950'
                                }`}
                              >
                                {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs text-slate-400">
                                    {formatDateAR(cv.fecha)}
                                  </span>
                                  <span className="text-xs font-bold text-white">
                                    {getVoucherEquipmentLabel(cv)}
                                  </span>
                                  {cvTicket && (
                                    <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/35">
                                      Ticket N° {cvTicket}
                                    </span>
                                  )}
                                  {cvOrd && cvOrd !== cvTicket && (
                                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                      Ord N° {cvOrd}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {cv.deposito || '-'} · {cv.tipoComb || '-'} ·{' '}
                                  {cv.nombreApellido || cv.codigoEmpleado || '-'}
                                </div>
                              </div>
                            </div>
                            <span className="text-xs font-black text-cyan-300 shrink-0">
                              {formatLiters(getVoucherLiters(cv))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Nota opcional de esta sub-vinculación
                  </label>
                  <input
                    type="text"
                    value={subPickerNotas}
                    onChange={(e) => setSubPickerNotas(e.target.value)}
                    placeholder="Ej: Se cargó chulengo en YPF y se distribuyó en Obra Arroyo Las Martas"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-slate-800 bg-slate-900/70 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">
                  {subPickerSelectedIds.size} descarga(s) a máquinas seleccionada(s)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSubLinkParentId(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmSubLinks}
                    className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black cursor-pointer"
                  >
                    Guardar Sub-vínculos
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== MODAL: MANUAL INVOICE / RESUMEN ==================== */}
        {isInvoiceModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
            <form
              onSubmit={handleAddManualInvoice}
              className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-black text-white">
                  Cargar Factura o Resumen del Proveedor
                </h3>
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Tipo Comprobante
                    </label>
                    <select
                      value={invTipo}
                      onChange={(e) => setInvTipo(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                    >
                      <option value="FACTURA A">Factura A</option>
                      <option value="FACTURA B">Factura B</option>
                      <option value="FACTURA C">Factura C</option>
                      <option value="RESUMEN PROVEEDOR">Resumen del Proveedor</option>
                      <option value="REMITO / TICKET">Remito / Ticket</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      N° Comprobante / Resumen
                    </label>
                    <input
                      type="text"
                      value={invNumero}
                      onChange={(e) => setInvNumero(e.target.value)}
                      placeholder="0004-00012345"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={invFecha}
                      onChange={(e) => setInvFecha(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Proveedor / Estación
                    </label>
                    <input
                      type="text"
                      value={invProveedor}
                      onChange={(e) => setInvProveedor(e.target.value)}
                      placeholder="YPF / Axion / Shell..."
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Litros Facturados (opcional)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={invLitros}
                      onChange={(e) => setInvLitros(e.target.value)}
                      placeholder="Ej: 1850.50"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Importe Total ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={invImporte}
                      onChange={(e) => setInvImporte(e.target.value)}
                      placeholder="Ej: 2450000"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Adjuntar PDF / Foto (opcional, sube a Cloudflare R2)
                  </label>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => setInvFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-xs file:font-bold file:text-cyan-300 hover:file:bg-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Observaciones
                  </label>
                  <input
                    type="text"
                    value={invObs}
                    onChange={(e) => setInvObs(e.target.value)}
                    placeholder="Detalle opcional"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                  />
                </div>
              </div>
              <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploadingInv}
                  className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#ffda1a] text-slate-950 text-xs font-black cursor-pointer disabled:opacity-50"
                >
                  {isUploadingInv ? 'Subiendo y guardando...' : 'Guardar en Contenedor'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ==================== MODAL: IMPORT FROM COMPRAS ==================== */}
        {isImportComprasOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-white">
                    Traer Factura ya cargada en Compras
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Seleccioná una factura de proveedor para vincularla a este contenedor sin volver a cargarla.
                  </p>
                </div>
                <button
                  onClick={() => setIsImportComprasOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 border-b border-slate-800">
                <input
                  type="text"
                  value={comprasSearch}
                  onChange={(e) => setComprasSearch(e.target.value)}
                  placeholder="Buscar por proveedor, número de factura o fecha..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredPurchaseInvoices.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No hay facturas de Compras disponibles con ese filtro.
                  </div>
                ) : (
                  filteredPurchaseInvoices.slice(0, 60).map((pi) => {
                    const alreadyLinked = (activeContainer.facturas || []).some(
                      (f) => f.purchaseInvoiceId === pi.id
                    );
                    return (
                      <div
                        key={pi.id}
                        className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black text-white">
                              {pi.tipoComprobante} {pi.nroComprobanteCompleto || pi.numeroComprobante}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {formatDateAR(pi.fechaEmision)}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 truncate mt-0.5">
                            {pi.proveedorNombre}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs font-black text-emerald-300">
                            {formatMoney(pi.montoTotal)}
                          </span>
                          <button
                            disabled={alreadyLinked}
                            onClick={() => handleImportPurchaseInvoice(pi)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer ${
                              alreadyLinked
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300'
                            }`}
                          >
                            {alreadyLinked ? 'Vinculada' : '+ Vincular'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== MODAL: PREVIEW DOCUMENT ==================== */}
        {previewDoc && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
              <div className="p-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
                <span className="text-sm font-black text-white truncate">{previewDoc.title}</span>
                <div className="flex items-center gap-2">
                  <a
                    href={previewDoc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-cyan-300"
                  >
                    Abrir original
                  </a>
                  <button
                    onClick={() => setPreviewDoc(null)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-slate-950 flex items-center justify-center overflow-auto p-2">
                {previewDoc.mimeType?.includes('pdf') ||
                previewDoc.url.toLowerCase().includes('.pdf') ? (
                  <iframe
                    src={previewDoc.url}
                    title={previewDoc.title}
                    className="w-full h-full rounded-xl border-0 bg-white"
                  />
                ) : (
                  <img
                    src={previewDoc.url}
                    alt={previewDoc.title}
                    className="max-w-full max-h-full object-contain rounded-xl"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Edit / Delete Modals shared */}
        {renderContainerFormModal()}
        {renderDeleteConfirmModal()}
      </div>
    );
  }

  // ==================== SHARED MODALS ====================
  function renderContainerFormModal() {
    if (!isContainerModalOpen) return null;
    return (
      <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
        <form
          onSubmit={handleSaveContainerForm}
          className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl"
        >
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[#F0C800]" />
              {editingContainer
                ? `Editar Contenedor ${editingContainer.codigo}`
                : 'Nuevo Contenedor de Combustible'}
            </h3>
            <button
              type="button"
              onClick={() => setIsContainerModalOpen(false)}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Título del Contenedor *
              </label>
              <input
                type="text"
                required
                value={formTitulo}
                onChange={(e) => setFormTitulo(e.target.value)}
                placeholder="Ej: YPF 1ra Quincena Noviembre 2026 / Resumen Estación Ruta 9"
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Proveedor de Combustible
                </label>
                <input
                  type="text"
                  list="fuel-proveedores-list"
                  value={formProveedorNombre}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormProveedorNombre(val);
                    const matched = proveedores.find(
                      (p) => cleanStr(p.razonSocial) === cleanStr(val)
                    );
                    setFormProveedorId(matched?.id || '');
                  }}
                  placeholder="Ej: YPF S.A. / Estación El Cóndor"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                />
                <datalist id="fuel-proveedores-list">
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.razonSocial} />
                  ))}
                  {stationDeposits.map((d) => (
                    <option key={d.id} value={d.nombreEstacion || d.nombre} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Estación / Convenio (opcional)
                </label>
                <input
                  type="text"
                  list="fuel-stations-list"
                  value={formEstacionConvenio}
                  onChange={(e) => setFormEstacionConvenio(e.target.value)}
                  placeholder="Ej: Estación YPF Ruta 9"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                />
                <datalist id="fuel-stations-list">
                  {stationDeposits.map((d) => (
                    <option key={d.id} value={d.nombre} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Período Desde
                </label>
                <input
                  type="date"
                  value={formFechaDesde}
                  onChange={(e) => setFormFechaDesde(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Período Hasta
                </label>
                <input
                  type="date"
                  value={formFechaHasta}
                  onChange={(e) => setFormFechaHasta(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Estado</label>
                <select
                  value={formEstado}
                  onChange={(e) => setFormEstado(e.target.value as FuelContainerStatus)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                >
                  <option value="ABIERTO">Abierto</option>
                  <option value="CONCILIADO">Conciliado</option>
                  <option value="PAGADO">Pagado</option>
                  <option value="CERRADO">Cerrado</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Litros según Resumen Proveedor (opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formLitrosResumen}
                  onChange={(e) => setFormLitrosResumen(e.target.value)}
                  placeholder="Para comparar contra cargas"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Importe según Resumen Proveedor $ (opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formImporteResumen}
                  onChange={(e) => setFormImporteResumen(e.target.value)}
                  placeholder="Si aún no cargaste facturas"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Observaciones
              </label>
              <textarea
                rows={2}
                value={formObservaciones}
                onChange={(e) => setFormObservaciones(e.target.value)}
                placeholder="Notas internas, cuenta corriente, aclaraciones del resumen..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-[#F0C800]"
              />
            </div>
          </div>

          <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsContainerModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#ffda1a] text-slate-950 text-xs font-black cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : editingContainer ? 'Guardar Cambios' : 'Crear Contenedor'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  function renderDeleteConfirmModal() {
    if (!containerToDelete) return null;
    return (
      <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-[#16191F] border border-rose-500/40 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">
                Eliminar Contenedor {containerToDelete.codigo}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                ¿Confirmás eliminar <strong>"{containerToDelete.titulo}"</strong>? Las cargas de combustible en el Expendio NO se borran, solo se elimina este contenedor y sus vínculos.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setContainerToDelete(null)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={async () => {
                const id = containerToDelete.id;
                setContainerToDelete(null);
                if (selectedContainerId === id) setSelectedContainerId(null);
                await onDeleteContainer(id);
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black cursor-pointer"
            >
              Eliminar Contenedor
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== RENDER MASTER LIST VIEW ====================
  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
            <FolderOpen className="w-5 h-5 text-[#F0C800]" />
            Contenedores de Combustible, Facturas & Sub-vínculos
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Agrupá por quincena o factura los resúmenes que manda el proveedor, vinculá las cargas de estación y sub-vinculá indirectamente las cargas de <strong className="text-amber-300">Chulengo / Cisterna ➔ Máquinas</strong> para conciliar cada litro.
          </p>
        </div>

        <button
          onClick={openCreateContainerModal}
          className="px-4 py-2.5 rounded-xl bg-[#F0C800] hover:bg-[#ffda1a] text-slate-950 text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-[#F0C800]/15 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nuevo Contenedor
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>Total Contenedores</span>
            <Layers className="w-4 h-4 text-[#F0C800]" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">{globalStats.total}</div>
          <div className="mt-1 text-[11px] text-slate-400">
            {globalStats.openCount} abierto(s) para conciliar
          </div>
        </div>

        <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>Litros Facturados / Resumen</span>
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-300">
            {formatLiters(globalStats.totalLitrosRef)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Total facturado: {formatMoney(globalStats.totalImporteRef)}
          </div>
        </div>

        <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>Litros Vinculados</span>
            <Droplets className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-cyan-300">
            {formatLiters(globalStats.totalLitrosVinc)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Cargas directas conciliadas contra resúmenes
          </div>
        </div>

        <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-300">
            <span>Sub-vínculos Chulengo ➔ Máquinas</span>
            <GitBranch className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {globalStats.totalSubChildren}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Descargas indirectas trazadas a equipos
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar contenedor por título, proveedor, estación o factura..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-[#F0C800]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-500 mr-1" />
          {(['TODOS', 'ABIERTO', 'CONCILIADO', 'PAGADO', 'CERRADO'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                statusFilter === st
                  ? 'bg-[#F0C800] text-slate-950'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {st === 'TODOS' ? 'Todos' : STATUS_META[st].label}
            </button>
          ))}
        </div>
      </div>

      {/* Containers Grid */}
      {filteredContainers.length === 0 ? (
        <div className="bg-[#16191F] border border-dashed border-slate-700 rounded-2xl p-12 text-center">
          <FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-black text-slate-300">
            {containers.length === 0
              ? 'Todavía no creaste contenedores de combustible.'
              : 'No hay contenedores que coincidan con tu búsqueda.'}
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
            Creá tu primer contenedor (por ejemplo, "YPF 1ra Quincena Noviembre"), subí el resumen/facturas del proveedor, vinculá las cargas de combustible y sub-vinculá las bajadas de los Chulengos a las máquinas.
          </p>
          {containers.length === 0 && (
            <button
              onClick={openCreateContainerModal}
              className="mt-4 px-4 py-2.5 rounded-xl bg-[#F0C800] hover:bg-[#ffda1a] text-slate-950 text-xs font-black inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Crear Primer Contenedor
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {filteredContainers.map((c) => {
            const m = computeContainerMetrics(c);
            const st = STATUS_META[c.estado] || STATUS_META.ABIERTO;
            const balanced = m.litrosReferencia > 0 && Math.abs(m.diferenciaLitros) <= 1;
            const docBadges = getContainerDocumentBadges(c);

            return (
              <div
                key={c.id}
                onClick={() => {
                  setSelectedContainerId(c.id);
                  setActiveTab('cargas');
                }}
                className="bg-[#16191F] hover:bg-[#1b2029] border border-slate-800 hover:border-[#F0C800]/50 rounded-2xl p-4 sm:p-5 transition cursor-pointer flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/15 border border-[#F0C800]/40 text-[#F0C800] text-[10px] font-black">
                          {c.codigo}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-black ${st.bg} ${st.text} ${st.border}`}
                        >
                          {st.label}
                        </span>
                      </div>
                      <h3 className="text-base font-black text-white mt-2 truncate">{c.titulo}</h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400">
                        <span className="text-slate-300 font-semibold flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-[#F0C800]" />
                          {c.proveedorNombre}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {formatDateAR(c.fechaDesde)} → {formatDateAR(c.fechaHasta)}
                        </span>
                      </div>

                      {/* Linked Factura / Resumen / Remito Badges on Master Card */}
                      {docBadges.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                          {docBadges.map((b) => (
                            <span
                              key={b.id}
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-black flex items-center gap-1 ${b.bgClass} ${b.textClass} ${b.borderClass}`}
                            >
                              <FileText className="w-2.5 h-2.5 shrink-0" />
                              <span>
                                {b.shortLabel} N° <span className="font-mono">{b.numero}</span>
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => openEditContainerModal(c)}
                        className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setContainerToDelete(c)}
                        className="p-2 rounded-lg bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Mini metrics row */}
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">
                        Cargas Vinc.
                      </div>
                      <div className="text-sm font-black text-cyan-300 mt-0.5">
                        {formatLiters(m.litrosVinculados)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {m.linkedVouchers.length} carga(s)
                      </div>
                    </div>

                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">
                        Chulengo ➔ Máq.
                      </div>
                      <div className="text-sm font-black text-amber-300 mt-0.5">
                        {m.totalSubLinkedChildren} sub-vínc.
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {formatLiters(m.litrosSubVinculados)}
                      </div>
                    </div>

                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">
                        Facturas / Imp.
                      </div>
                      <div className="text-sm font-black text-emerald-300 mt-0.5 truncate">
                        {m.importeReferencia > 0 ? formatMoney(m.importeReferencia) : '$ 0'}
                      </div>
                      <div
                        className="text-[10px] text-slate-400 truncate"
                        title={
                          docBadges.length > 0
                            ? docBadges.map((b) => `${b.shortLabel} N° ${b.numero}`).join(' · ')
                            : undefined
                        }
                      >
                        {docBadges.length > 0
                          ? docBadges.map((b) => `${b.shortLabel} ${b.numero}`).join(' · ')
                          : `${(c.facturas || []).length} fact. · ${(c.adjuntos || []).length} adj.`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reconciliation Footer */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                  {m.litrosReferencia > 0 ? (
                    <span
                      className={`font-bold flex items-center gap-1.5 ${
                        balanced ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {balanced ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Litros conciliados ({formatLiters(m.litrosReferencia)})
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Dif. vs Resumen: {m.diferenciaLitros > 0 ? '+' : ''}
                          {formatLiters(m.diferenciaLitros)}
                        </>
                      )}
                    </span>
                  ) : docBadges.length > 0 || m.linkedVouchers.length > 0 ? (
                    <span className="text-slate-300 font-semibold truncate flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">
                        {docBadges.length > 0
                          ? docBadges.map((b) => `${b.shortLabel} N° ${b.numero}`).join(' · ')
                          : `${m.linkedVouchers.length} carga(s) vinculada(s)`}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-500">Abrí el contenedor para cargar facturas y vincular cargas</span>
                  )}

                  <span className="text-[#F0C800] font-black text-xs shrink-0">Abrir →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {renderContainerFormModal()}
      {renderDeleteConfirmModal()}
    </div>
  );
};
