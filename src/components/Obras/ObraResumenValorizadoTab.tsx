import React, { useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Banknote,
  Check,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  GripVertical,
  Loader2,
  Paperclip,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  ArcaInvoice,
  CustomerPaymentReceipt,
  Obra,
  ObraFacturaLegajo,
  ObraLegajoAdjunto,
  ObraResumenValorizado,
  ObraResumenValorizadoRow,
  ParteDiario,
  PreselectedResumenForArca,
  RentalContract,
  Vehicle,
} from '../../types';
import { uploadFileToCloudflareR2 } from '../../services/api';
import { loadSiteSettings } from '../../services/siteConfig';
import { formatInvoiceNumber } from '../../utils/crossLinks';
import { isArcaInvoiceFullyPaid } from '../../utils/obraLegajoResolver';
import { Logo } from '../Logo';
import {
  ObraFacturaPreviewModal,
  ObraReceiptPreviewModal,
} from './ObraLegajoFacturaPagoModals';

type ParteOriginKind =
  | 'CONTRATO_Y_FACTURA'
  | 'CONTRATO'
  | 'FACTURA'
  | 'CONTENEDOR'
  | 'PERIODO_SIN_VINCULAR'
  | 'MANUAL';

interface ParteOriginInfo {
  kind: ParteOriginKind;
  label: string;
  detail: string;
  tooltip: string;
  isUnlinkedAlert: boolean;
  badgeCls: string;
  rowCls: string;
  obraSecundaria?: string;
}

interface ObraResumenValorizadoTabProps {
  obra: Obra;
  obraPartes: ParteDiario[];
  allPartes?: ParteDiario[];
  rentals?: RentalContract[];
  arcaInvoices?: ArcaInvoice[];
  customerReceipts?: CustomerPaymentReceipt[];
  fleet: Vehicle[];
  selectedContenedorId?: string;
  onChangeContenedorId?: (id: string) => void;
  onSaveObra: (updatedObra: Obra) => Promise<{ ok: boolean; error?: string }>;
  onNavigateToFacturas?: () => void;
  onInvoiceResumenInArca?: (payload: PreselectedResumenForArca) => void;
  onNavigateToArca?: (invoice: ArcaInvoice) => void;
  onNavigateToCobranzas?: () => void;
}

const formatDateAR = (iso?: string): string => {
  if (!iso) return '';
  const clean = iso.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return iso;
};

const formatNumAR = (n: number, decimals = 2): string => {
  const val = Number.isFinite(n) ? n : 0;
  return val.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const normalizeDateISO = (raw?: string): string => {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    const yy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${yy}-${mm}-${dd}`;
  }
  return trimmed.slice(0, 10);
};

const getTodayISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const findMatchingVehicle = (
  fleet: Vehicle[],
  code?: string,
  name?: string
): Vehicle | undefined => {
  const cNorm = String(code || '').trim().toUpperCase();
  const nNorm = String(name || '').trim().toUpperCase();
  if (cNorm) {
    const byCode = fleet.find((v) => {
      const vc = String(v.codigoInterno || v.codigoEquipo || v.codigo || v.id || '')
        .trim()
        .toUpperCase();
      const vp = String(v.patente || '').trim().toUpperCase();
      return vc === cNorm || v.id.toUpperCase() === cNorm || (vp && vp === cNorm);
    });
    if (byCode) return byCode;
  }
  if (nNorm) {
    const byName = fleet.find(
      (v) =>
        String(v.modeloMarca || '').trim().toUpperCase() === nNorm ||
        String(v.modeloMarca || '').trim().toUpperCase().includes(nNorm) ||
        nNorm.includes(String(v.modeloMarca || '').trim().toUpperCase())
    );
    if (byName) return byName;
  }
  return undefined;
};

const resolveVehicleRate = (veh: Vehicle | undefined, unidad?: string): number => {
  if (!veh) return 0;
  const u = String(unidad || 'HORAS').toUpperCase();
  if (u === 'HORAS') {
    if (Number(veh.precioSugeridoHora || 0) > 0) return Number(veh.precioSugeridoHora);
    if (Number(veh.precioSugerido || 0) > 0) return Number(veh.precioSugerido);
    return 0;
  }
  if (Number(veh.precioSugerido || 0) > 0) return Number(veh.precioSugerido);
  if (Number(veh.precioSugeridoHora || 0) > 0) return Number(veh.precioSugeridoHora);
  return 0;
};

const buildParteRow = (p: ParteDiario, fleet: Vehicle[]): ObraResumenValorizadoRow => {
  const veh = findMatchingVehicle(fleet, p.codigoEquipo || p.vehicleId, p.marcaModelo || p.vehicleName);
  const equipoLabel = (veh?.modeloMarca || p.marcaModelo || p.vehicleName || p.codigoEquipo || 'EQUIPO')
    .trim()
    .toUpperCase();
  const equipoCodigo = veh?.codigoInterno || p.codigoEquipo || '';

  const tipoUpper = String(p.tipo || 'HORAS').toUpperCase();
  let cantidad = 1;
  let unidad: string = 'HORAS';

  if (tipoUpper === 'HORAS') {
    cantidad = Number(p.horasTrabajadas || p.hsCantidad || p.cantidad || 0);
    unidad = 'HORAS';
  } else if (tipoUpper === 'VIAJES') {
    cantidad = Number(p.viajesCantidad || p.cantidad || 1);
    unidad = 'VIAJES';
  } else if (tipoUpper === 'DIA' || tipoUpper === 'DIAS') {
    cantidad = Number(p.cantidadDias || p.cantidad || 1);
    unidad = 'DIAS';
  } else {
    cantidad = Number(p.cantidadOtro || p.cantidad || p.horasTrabajadas || 1);
    unidad = 'UNIDADES';
  }

  // Build descriptive detail matching the photo style ("ALQUILER EQUIPO HORA-- EXCAVACION...")
  const detailParts: string[] = [];
  if (p.extraccionEntregas && p.tipoMaterial) {
    detailParts.push(`${p.extraccionEntregas} DE ${p.tipoMaterial}`);
  } else if (p.servMant) {
    const prefix =
      tipoUpper === 'HORAS'
        ? `${p.servMant} EQUIPO HORA`
        : tipoUpper === 'VIAJES'
        ? `${p.servMant} VIAJE`
        : tipoUpper === 'DIA' || tipoUpper === 'DIAS'
        ? `${p.servMant} EQUIPO DÍA`
        : p.servMant;
    detailParts.push(prefix);
  }

  const extraDesc = [p.detalleTipo, p.detalleOtro, p.detalleEntrega, p.novedades, p.observaciones]
    .map((s) => String(s || '').trim())
    .filter((s) => s.length > 0 && s !== '-');

  const uniqueExtra = Array.from(new Set(extraDesc));
  let detalle = detailParts.join(' ');
  if (uniqueExtra.length > 0) {
    detalle = detalle ? `${detalle} -- ${uniqueExtra.join(' - ')}` : uniqueExtra.join(' - ');
  }
  if (!detalle) {
    detalle =
      unidad === 'HORAS'
        ? 'ALQUILER EQUIPO HORA'
        : unidad === 'VIAJES'
        ? 'FLETE / VIAJE DE EQUIPO'
        : 'TRABAJO DE EQUIPO EN OBRA';
  }
  detalle = detalle.toUpperCase();

  const precioUnitario =
    Number(p.precioUnitario || 0) > 0
      ? Number(p.precioUnitario)
      : Number(p.valorViajeEquipo || 0) > 0
      ? Number(p.valorViajeEquipo)
      : resolveVehicleRate(veh, unidad);

  const precioTotal = Number((cantidad * precioUnitario).toFixed(2));

  return {
    id: `rv-row-${p.id}-${Math.random().toString(36).slice(2, 6)}`,
    fecha: normalizeDateISO(p.fecha),
    numero: String(p.numParte || '').trim() || '-',
    equipo: equipoLabel,
    equipoCodigo,
    detalle,
    cantidad,
    precioUnitario,
    precioTotal,
    parteDiarioId: p.id,
    esManual: false,
    unidad,
  };
};

const buildDefaultIntro = (obraNombre: string, desde?: string, hasta?: string): string => {
  const periodoTxt =
    desde && hasta
      ? ` en el periodo entre ${formatDateAR(desde)} y ${formatDateAR(hasta)}`
      : desde
      ? ` desde el ${formatDateAR(desde)}`
      : '';
  return `Adjunto un resumen valorizado de los trabajos realizados en la obra: ${obraNombre.toUpperCase()}${periodoTxt}, detallando los trabajos realizados por cada máquina y adjunto "Partes diarios" de cada día.`;
};

const ESTADO_BADGES: Record<
  ObraResumenValorizado['estado'],
  { label: string; cls: string }
> = {
  BORRADOR: {
    label: 'Borrador',
    cls: 'bg-slate-800 text-slate-300 border-slate-700',
  },
  ENVIADO: {
    label: 'Enviado al Cliente',
    cls: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  },
  APROBADO: {
    label: 'Aprobado p/ Facturar',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  },
  FACTURADO: {
    label: 'Facturado',
    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  },
};

const loadImageAsDataUrl = (url: string): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const src =
      url.startsWith('data:') || url.startsWith('/') || url.startsWith('blob:')
        ? url
        : `/api/image-proxy?url=${encodeURIComponent(url)}`;
    const timer = setTimeout(() => resolve(null), 6000);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timer);
      try {
        const natW = img.naturalWidth || 300;
        const natH = img.naturalHeight || 100;
        const maxPx = 800;
        const scale = natW > maxPx ? maxPx / natW : 1;
        const w = Math.max(1, Math.round(natW * scale));
        const h = Math.max(1, Math.round(natH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        // Pure white background so transparent PNG logos render crisp on white A4 paper
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: w,
          height: h,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
};

export const ObraResumenValorizadoTab: React.FC<ObraResumenValorizadoTabProps> = ({
  obra,
  obraPartes,
  allPartes,
  rentals = [],
  arcaInvoices = [],
  customerReceipts = [],
  fleet,
  selectedContenedorId = 'ALL',
  onChangeContenedorId,
  onSaveObra,
  onNavigateToFacturas,
  onInvoiceResumenInArca,
  onNavigateToArca,
  onNavigateToCobranzas,
}) => {
  const periodos = obra.periodosLegajo || [];
  const allResumenes = obra.resumenesValorizados || [];
  const fullPartesPool = allPartes && allPartes.length > 0 ? allPartes : obraPartes;

  const activeContenedor = useMemo(() => {
    if (!selectedContenedorId || selectedContenedorId === 'ALL') return undefined;
    return periodos.find((p) => p.id === selectedContenedorId);
  }, [periodos, selectedContenedorId]);

  const visibleResumenes = useMemo(() => {
    if (!activeContenedor) return allResumenes;
    return allResumenes.filter((r) => r.periodoId === activeContenedor.id);
  }, [allResumenes, activeContenedor]);

  // Active editor state (null = list view)
  const [editingDoc, setEditingDoc] = useState<ObraResumenValorizado | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isAttachingPdf, setIsAttachingPdf] = useState(false);
  const [addingToLegajoId, setAddingToLegajoId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ObraResumenValorizado | null>(null);
  const [previewArcaInvoice, setPreviewArcaInvoice] = useState<ArcaInvoice | null>(null);
  const [previewPaymentReceipt, setPreviewPaymentReceipt] = useState<CustomerPaymentReceipt | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<'ALL' | 'VINCULADOS' | 'SIN_VINCULAR' | 'MANUAL'>('ALL');

  // Quick bulk rate inputs per machine name
  const [bulkRates, setBulkRates] = useState<Record<string, string>>({});

  // Quick manual row machine picker
  const [quickAddMachineId, setQuickAddMachineId] = useState<string>('');

  // Drag & drop row reordering state (armed from handle or non-input cells so inputs stay freely editable)
  const [armedDragRowId, setArmedDragRowId] = useState<string | null>(null);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [dragOverState, setDragOverState] = useState<{ rowId: string; position: 'above' | 'below' } | null>(null);
  const draggingRowIdRef = useRef<string | null>(null);
  const pointerDownForDragRef = useRef<boolean>(false);

  // Index live linkage of every parte diario (contratos, facturas/legajos, contenedores) & auto-detect companion obra names
  const { parteById, parteLinkageMap, eligibleObraPartes } = useMemo(() => {
    const pById = new Map<string, ParteDiario>();
    fullPartesPool.forEach((p) => pById.set(p.id, p));
    obraPartes.forEach((p) => pById.set(p.id, p));

    const nombreNorm = (obra.nombreObra || '').toLowerCase().trim();
    const numNorm = (obra.numero || '').toLowerCase().trim();
    const idNorm = (obra.id || '').toLowerCase().trim();

    type LinkEntry = {
      contratos: string[];
      facturasEmitidas: string[];
      legajosPendientes: string[];
      contenedores: string[];
    };
    const linkMap = new Map<string, LinkEntry>();
    const ensureEntry = (pid: string): LinkEntry => {
      let e = linkMap.get(pid);
      if (!e) {
        e = { contratos: [], facturasEmitidas: [], legajosPendientes: [], contenedores: [] };
        linkMap.set(pid, e);
      }
      return e;
    };
    const pushUnique = (arr: string[], val: string) => {
      const clean = val.trim();
      if (clean && !arr.includes(clean)) arr.push(clean);
    };

    const obraRentalIds = new Set<string>();
    const obraLinkedParteIds = new Set<string>();

    (obra.periodosLegajo || []).forEach((per) => {
      (per.rentalIds || []).forEach((rid) => obraRentalIds.add(rid));
      (per.parteDiarioIds || []).forEach((pid) => {
        obraLinkedParteIds.add(pid);
        pushUnique(ensureEntry(pid).contenedores, per.titulo || 'Contenedor');
      });
    });

    (obra.facturasLegajo || []).forEach((fac) => {
      (fac.rentalIds || []).forEach((rid) => obraRentalIds.add(rid));
      const isPendiente = Boolean(fac.pendienteFacturacion);
      const facLabel = isPendiente
        ? 'Legajo s/facturar'
        : fac.nroComprobante || fac.tipoComprobante || 'Factura';
      (fac.parteDiarioIds || []).forEach((pid) => {
        obraLinkedParteIds.add(pid);
        const entry = ensureEntry(pid);
        if (isPendiente) {
          pushUnique(entry.legajosPendientes, facLabel);
        } else {
          pushUnique(entry.facturasEmitidas, facLabel);
        }
      });
    });

    const rentalById = new Map<string, RentalContract>();
    const rentalByNum = new Map<string, RentalContract>();
    rentals.forEach((r) => {
      rentalById.set(r.id, r);
      if (r.numeroContrato) {
        rentalByNum.set(r.numeroContrato.trim().toUpperCase(), r);
      }
      const destNorm = (r.obraDestino || '').toLowerCase().trim();
      const belongsToObra =
        obraRentalIds.has(r.id) ||
        (nombreNorm && destNorm === nombreNorm) ||
        (numNorm && destNorm === numNorm);
      const cLabel = r.numeroContrato || r.id;
      (r.partesDiariosIds || []).forEach((pid) => {
        if (belongsToObra) obraLinkedParteIds.add(pid);
        pushUnique(ensureEntry(pid).contratos, cLabel);
      });
    });

    // Also inspect direct links stored on ParteDiario records
    pById.forEach((p) => {
      if (p.rentalId || p.rentalNumero) {
        const matchedRental =
          (p.rentalId && rentalById.get(p.rentalId)) ||
          (p.rentalNumero && rentalByNum.get(p.rentalNumero.trim().toUpperCase()));
        const cLabel = matchedRental?.numeroContrato || p.rentalNumero || p.rentalId || 'Contrato';
        pushUnique(ensureEntry(p.id).contratos, cLabel);
        if (matchedRental && obraRentalIds.has(matchedRental.id)) {
          obraLinkedParteIds.add(p.id);
        }
      }
      if (p.facturaId || p.facturaNumero) {
        pushUnique(ensureEntry(p.id).facturasEmitidas, p.facturaNumero || p.facturaId || 'Factura');
      }
    });

    // Auto-detect companion obra names (e.g. "FORBICE ARIDOS ARROYO LAS MARTAS" linked repeatedly in "FORBICE ARROYO LAS MARTAS")
    const linkedObraCounts = new Map<string, number>();
    obraLinkedParteIds.forEach((pid) => {
      const p = pById.get(pid);
      const oNorm = (p?.obra || '').toLowerCase().trim();
      if (oNorm && oNorm !== nombreNorm) {
        linkedObraCounts.set(oNorm, (linkedObraCounts.get(oNorm) || 0) + 1);
      }
    });
    const companionObraNames = new Set<string>();
    linkedObraCounts.forEach((count, oNorm) => {
      if (count >= 2) companionObraNames.add(oNorm);
    });

    // Eligible partes belonging to this obra (direct match, linked in obra, or auto-detected companion obra)
    const eligibleMap = new Map<string, ParteDiario>();
    obraPartes.forEach((p) => eligibleMap.set(p.id, p));
    pById.forEach((p) => {
      if (eligibleMap.has(p.id)) return;
      const oNorm = (p.obra || '').toLowerCase().trim();
      const codNorm = (p.codigoObra || '').toLowerCase().trim();
      if (
        obraLinkedParteIds.has(p.id) ||
        (nombreNorm && oNorm === nombreNorm) ||
        (numNorm && codNorm === numNorm) ||
        (idNorm && codNorm === idNorm) ||
        (oNorm && companionObraNames.has(oNorm))
      ) {
        eligibleMap.set(p.id, p);
      }
    });

    return {
      parteById: pById,
      parteLinkageMap: linkMap,
      eligibleObraPartes: Array.from(eligibleMap.values()),
    };
  }, [obra, obraPartes, fullPartesPool, rentals]);

  const getRowOriginInfo = (row: ObraResumenValorizadoRow): ParteOriginInfo => {
    if (row.esManual || !row.parteDiarioId) {
      return {
        kind: 'MANUAL',
        label: 'Manual',
        detail: 'Línea agregada a mano',
        tooltip: 'Línea cargada manualmente en esta planilla (sin parte diario vinculado).',
        isUnlinkedAlert: false,
        badgeCls: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
        rowCls: 'bg-purple-500/[0.04] border-l-2 border-l-purple-400/70',
      };
    }

    const links = parteLinkageMap.get(row.parteDiarioId);
    const parte = parteById.get(row.parteDiarioId);
    const nombreNorm = (obra.nombreObra || '').toLowerCase().trim();
    const parteObraNorm = (parte?.obra || '').toLowerCase().trim();
    const obraSecundaria =
      parte?.obra && parteObraNorm && parteObraNorm !== nombreNorm ? parte.obra.trim() : undefined;

    const hasContrato = Boolean(links && links.contratos.length > 0);
    const hasFactura = Boolean(links && links.facturasEmitidas.length > 0);
    const hasLegajoPendiente = Boolean(links && links.legajosPendientes.length > 0);
    const hasContenedor = Boolean(links && links.contenedores.length > 0);

    if (hasContrato && hasFactura) {
      const ref = `${links!.contratos[0]} · ${links!.facturasEmitidas[0]}`;
      return {
        kind: 'CONTRATO_Y_FACTURA',
        label: 'Contrato + Fact.',
        detail: ref,
        tooltip: `Vinculado a Contrato (${links!.contratos.join(', ')}) y Factura (${links!.facturasEmitidas.join(', ')}).${
          obraSecundaria ? ` Obra del parte: ${obraSecundaria}.` : ''
        }`,
        isUnlinkedAlert: false,
        badgeCls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
        rowCls: 'border-l-2 border-l-emerald-500/70',
        obraSecundaria,
      };
    }

    if (hasFactura) {
      const ref = links!.facturasEmitidas[0];
      return {
        kind: 'FACTURA',
        label: 'Factura',
        detail: ref,
        tooltip: `Vinculado a Factura/Legajo (${links!.facturasEmitidas.join(', ')}).${
          obraSecundaria ? ` Obra del parte: ${obraSecundaria}.` : ''
        }`,
        isUnlinkedAlert: false,
        badgeCls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
        rowCls: 'border-l-2 border-l-indigo-400/70',
        obraSecundaria,
      };
    }

    if (hasContrato) {
      const ref = links!.contratos[0];
      return {
        kind: 'CONTRATO',
        label: hasLegajoPendiente ? 'Contrato (Legajo)' : 'Contrato',
        detail: ref,
        tooltip: `Viene desde Contrato de Alquiler (${links!.contratos.join(', ')})${
          hasLegajoPendiente ? ' — incluido en Legajo pendiente de facturación' : ''
        }.${obraSecundaria ? ` Obra del parte: ${obraSecundaria}.` : ''}`,
        isUnlinkedAlert: false,
        badgeCls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
        rowCls: 'border-l-2 border-l-cyan-500/70',
        obraSecundaria,
      };
    }

    if (hasLegajoPendiente || hasContenedor) {
      const ref = hasLegajoPendiente ? links!.legajosPendientes[0] : links!.contenedores[0];
      return {
        kind: 'CONTENEDOR',
        label: hasLegajoPendiente ? 'Legajo s/fact.' : 'Contenedor',
        detail: ref,
        tooltip: `Agregado en ${ref}, sin contrato de alquiler ni factura emitida todavía.${
          obraSecundaria ? ` Obra del parte: ${obraSecundaria}.` : ''
        }`,
        isUnlinkedAlert: false,
        badgeCls: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
        rowCls: 'border-l-2 border-l-amber-400/70',
        obraSecundaria,
      };
    }

    return {
      kind: 'PERIODO_SIN_VINCULAR',
      label: 'Período s/vinc.',
      detail: obraSecundaria ? `Sin contrato · ${obraSecundaria}` : 'Sin contrato ni factura',
      tooltip: `¡Atención! Este parte pertenece a esta obra y período, pero NO está incluido en ningún Contrato de Alquiler ni Factura/Legajo.${
        obraSecundaria ? ` (Cargado bajo obra: ${obraSecundaria})` : ''
      }`,
      isUnlinkedAlert: true,
      badgeCls: 'bg-orange-500/20 text-orange-300 border-orange-500/60',
      rowCls: 'bg-orange-500/[0.11] hover:bg-orange-500/[0.16] border-l-4 border-l-orange-400',
      obraSecundaria,
    };
  };

  const recalcDoc = (doc: ObraResumenValorizado): ObraResumenValorizado => {
    const filas = doc.filas.map((f) => {
      const cant = Number(f.cantidad || 0);
      const pu = Number(f.precioUnitario || 0);
      return {
        ...f,
        cantidad: cant,
        precioUnitario: pu,
        precioTotal: Number((cant * pu).toFixed(2)),
      };
    });
    const subtotalNeto = Number(filas.reduce((s, f) => s + f.precioTotal, 0).toFixed(2));
    const ivaMonto = Number((subtotalNeto * (Number(doc.alicuotaIva || 0) / 100)).toFixed(2));
    const totalGeneral = Number((subtotalNeto + ivaMonto).toFixed(2));
    return {
      ...doc,
      filas,
      subtotalNeto,
      ivaMonto,
      totalGeneral,
    };
  };

  // Combine: (1) partes explicitly coming from Contratos & Facturas/Legajos of the container/obra
  // AND (2) ALL partes belonging to this obra (or companion obra) within the selected período dates,
  // so forgotten/unlinked partes jump out immediately in the Resumen Valorizado!
  const getScopedPartes = (
    periodoId?: string,
    fechaDesde?: string,
    fechaHasta?: string,
    applyDateFilterOnExplicitContainer = false
  ): ParteDiario[] => {
    const combinedMap = new Map<string, ParteDiario>();

    if (periodoId) {
      const per = periodos.find((p) => p.id === periodoId);
      if (per) {
        const facturasScoped = (obra.facturasLegajo || []).filter((f) => f.periodoId === per.id);
        const rentalIdsScoped = new Set<string>(per.rentalIds || []);
        facturasScoped.forEach((f) => {
          (f.rentalIds || []).forEach((rid) => rentalIdsScoped.add(rid));
        });

        const explicitParteIds = new Set<string>(per.parteDiarioIds || []);
        facturasScoped.forEach((f) => {
          (f.parteDiarioIds || []).forEach((pid) => explicitParteIds.add(pid));
        });

        const rentalNumsScoped = new Set<string>();
        rentals.forEach((r) => {
          if (rentalIdsScoped.has(r.id)) {
            if (r.numeroContrato) rentalNumsScoped.add(r.numeroContrato.trim().toUpperCase());
            (r.partesDiariosIds || []).forEach((pid) => explicitParteIds.add(pid));
          }
        });

        // Also catch partes that point directly to a rental in this container via p.rentalId / p.rentalNumero
        if (rentalIdsScoped.size > 0 || rentalNumsScoped.size > 0) {
          eligibleObraPartes.forEach((p) => {
            if (
              (p.rentalId && rentalIdsScoped.has(p.rentalId)) ||
              (p.rentalNumero && rentalNumsScoped.has(p.rentalNumero.trim().toUpperCase()))
            ) {
              explicitParteIds.add(p.id);
            }
          });
        }

        // 1. Add all partes explicitly linked to Contratos, Facturas/Legajos, or Contenedor
        explicitParteIds.forEach((pid) => {
          const p = parteById.get(pid);
          if (!p) return;
          if (applyDateFilterOnExplicitContainer && (fechaDesde || fechaHasta)) {
            const f = normalizeDateISO(p.fecha);
            if (fechaDesde && f < fechaDesde) return;
            if (fechaHasta && f > fechaHasta) return;
          }
          combinedMap.set(p.id, p);
        });

        // 2. ALSO add all partes of this obra (and companion obras) that fall within the period dates
        // even if they were NOT linked to any Contrato or Factura yet!
        const cDesde = fechaDesde || per.fechaDesde;
        const cHasta = fechaHasta || per.fechaHasta;
        if (cDesde || cHasta) {
          eligibleObraPartes.forEach((p) => {
            if (combinedMap.has(p.id)) return;
            const f = normalizeDateISO(p.fecha);
            if (cDesde && f < cDesde) return;
            if (cHasta && f > cHasta) return;
            combinedMap.set(p.id, p);
          });
        }
      }
    } else {
      // Sin contenedor: traer todos los partes elegibles de la obra (y contratos/facturas) dentro del rango de fechas
      eligibleObraPartes.forEach((p) => {
        if (fechaDesde || fechaHasta) {
          const f = normalizeDateISO(p.fecha);
          if (fechaDesde && f < fechaDesde) return;
          if (fechaHasta && f > fechaHasta) return;
        }
        combinedMap.set(p.id, p);
      });
    }

    return Array.from(combinedMap.values()).sort((a, b) => {
      const fa = normalizeDateISO(a.fecha);
      const fb = normalizeDateISO(b.fecha);
      if (fa !== fb) return fa.localeCompare(fb);
      return String(a.numParte || '').localeCompare(String(b.numParte || ''), 'es', { numeric: true });
    });
  };

  // Re-sync table rows to the selected container / date range while keeping manual rows & edited prices
  const syncDraftPartesToScope = (
    doc: ObraResumenValorizado,
    nextPeriodoId: string | undefined,
    nextPeriodoTitulo: string | undefined,
    nextDesde: string | undefined,
    nextHasta: string | undefined,
    options?: { applyDateFilterOnExplicitContainer?: boolean; feedbackLabel?: string }
  ): ObraResumenValorizado => {
    const scoped = getScopedPartes(
      nextPeriodoId,
      nextDesde,
      nextHasta,
      options?.applyDateFilterOnExplicitContainer ?? false
    );

    const existingByParteId = new Map<string, ObraResumenValorizadoRow>();
    const customPriceByEquipo = new Map<string, number>();
    const manualRows: ObraResumenValorizadoRow[] = [];

    for (const row of doc.filas) {
      if (row.esManual || !row.parteDiarioId) {
        manualRows.push(row);
      } else {
        existingByParteId.set(row.parteDiarioId, row);
      }
      const eqKey = (row.equipo || '').trim().toUpperCase();
      if (eqKey && Number(row.precioUnitario) > 0) {
        customPriceByEquipo.set(eqKey, Number(row.precioUnitario));
      }
    }

    const syncedParteRows: ObraResumenValorizadoRow[] = scoped.map((p) => {
      const existing = existingByParteId.get(p.id);
      if (existing) return existing;
      const fresh = buildParteRow(p, fleet);
      const eqKey = fresh.equipo.trim().toUpperCase();
      if (fresh.precioUnitario === 0 && customPriceByEquipo.has(eqKey)) {
        fresh.precioUnitario = customPriceByEquipo.get(eqKey)!;
        fresh.precioTotal = Number((fresh.cantidad * fresh.precioUnitario).toFixed(2));
      }
      return fresh;
    });

    const nextFilas = [...syncedParteRows, ...manualRows].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero, 'es', { numeric: true })
    );

    const resolvedDesde =
      nextDesde || (syncedParteRows.length > 0 ? syncedParteRows[0].fecha : doc.fechaDesde);
    const resolvedHasta =
      nextHasta ||
      (syncedParteRows.length > 0 ? syncedParteRows[syncedParteRows.length - 1].fecha : doc.fechaHasta);

    const updated = recalcDoc({
      ...doc,
      periodoId: nextPeriodoId,
      periodoTitulo: nextPeriodoTitulo,
      fechaDesde: resolvedDesde,
      fechaHasta: resolvedHasta,
      introduccion: buildDefaultIntro(obra.nombreObra, resolvedDesde, resolvedHasta),
      filas: nextFilas,
    });

    const unlinkedInScope = syncedParteRows.filter((r) => getRowOriginInfo(r).isUnlinkedAlert).length;
    const label = options?.feedbackLabel || (nextPeriodoTitulo ? `«${nextPeriodoTitulo}»` : 'el período seleccionado');
    setFeedback({
      type: 'ok',
      text:
        syncedParteRows.length > 0
          ? `Planilla actualizada para ${label}: ${syncedParteRows.length} parte(s) diario(s)${
              unlinkedInScope > 0 ? ` (${unlinkedInScope} del período sin contrato/factura resaltado(s) en naranja)` : ''
            }${manualRows.length > 0 ? ` + ${manualRows.length} línea(s) manual(es)` : ''}.`
          : `No se encontraron partes diarios en ${label}${
              manualRows.length > 0 ? ` (se conservaron ${manualRows.length} línea(s) manual(es))` : ''
            }.`,
    });

    return updated;
  };

  const suggestNextDocNumber = (): string => {
    let maxSeq = 0;
    for (const r of allResumenes) {
      const m = String(r.numero || '').match(/(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxSeq) maxSeq = n;
      }
    }
    return `0001.${String(maxSeq + 1).padStart(3, '0')}`;
  };

  const handleStartNewResumen = () => {
    setFeedback(null);
    const defaultPeriodoId = activeContenedor?.id || '';
    const defaultDesde = activeContenedor?.fechaDesde || '';
    const defaultHasta = activeContenedor?.fechaHasta || '';
    const scoped = getScopedPartes(defaultPeriodoId || undefined, defaultDesde || undefined, defaultHasta || undefined);

    const inferredDesde =
      defaultDesde || (scoped.length > 0 ? normalizeDateISO(scoped[0].fecha) : getTodayISO());
    const inferredHasta =
      defaultHasta || (scoped.length > 0 ? normalizeDateISO(scoped[scoped.length - 1].fecha) : getTodayISO());

    const filas = scoped.map((p) => buildParteRow(p, fleet));
    const now = new Date().toISOString();

    const draft = recalcDoc({
      id: `RV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      numero: suggestNextDocNumber(),
      fechaEmision: getTodayISO(),
      periodoId: defaultPeriodoId || undefined,
      periodoTitulo: activeContenedor?.titulo || undefined,
      fechaDesde: inferredDesde,
      fechaHasta: inferredHasta,
      saludo: 'Estimado,',
      introduccion: buildDefaultIntro(obra.nombreObra, inferredDesde, inferredHasta),
      filas,
      alicuotaIva: 0,
      subtotalNeto: 0,
      ivaMonto: 0,
      totalGeneral: 0,
      estado: 'BORRADOR',
      createdAt: now,
      updatedAt: now,
    });

    setOriginFilter('ALL');
    setEditingDoc(draft);
    setBulkRates({});
  };

  const handleReloadPartesIntoDraft = () => {
    if (!editingDoc) return;
    const per = editingDoc.periodoId ? periodos.find((p) => p.id === editingDoc.periodoId) : undefined;
    const customDates = Boolean(
      per &&
        ((editingDoc.fechaDesde && per.fechaDesde && editingDoc.fechaDesde !== per.fechaDesde) ||
          (editingDoc.fechaHasta && per.fechaHasta && editingDoc.fechaHasta !== per.fechaHasta))
    );
    const updated = syncDraftPartesToScope(
      editingDoc,
      editingDoc.periodoId,
      editingDoc.periodoTitulo,
      editingDoc.fechaDesde,
      editingDoc.fechaHasta,
      {
        applyDateFilterOnExplicitContainer: customDates,
        feedbackLabel: editingDoc.periodoTitulo
          ? `«${editingDoc.periodoTitulo}»`
          : `el rango ${formatDateAR(editingDoc.fechaDesde)} al ${formatDateAR(editingDoc.fechaHasta)}`,
      }
    );
    setEditingDoc(updated);
    setBulkRates({});
  };

  const handleApplyFleetPricesToAll = () => {
    if (!editingDoc) return;
    let updatedCount = 0;
    const nextFilas = editingDoc.filas.map((row) => {
      const veh = findMatchingVehicle(fleet, row.equipoCodigo, row.equipo);
      const rate = resolveVehicleRate(veh, row.unidad);
      if (rate > 0) {
        updatedCount++;
        return { ...row, precioUnitario: rate };
      }
      return row;
    });
    setEditingDoc(recalcDoc({ ...editingDoc, filas: nextFilas }));
    setFeedback({
      type: 'ok',
      text:
        updatedCount > 0
          ? `Precios de Flota aplicados a ${updatedCount} fila(s).`
          : 'Ningún equipo de la tabla tiene tarifa cargada en la ficha de Flota (podés cargarlos directo en la tabla).',
    });
  };

  const handleApplyBulkRateForEquipo = (equipoName: string) => {
    if (!editingDoc) return;
    const raw = bulkRates[equipoName];
    const price = parseFloat(String(raw || '').replace(',', '.'));
    if (!Number.isFinite(price) || price < 0) return;

    const nextFilas = editingDoc.filas.map((row) =>
      row.equipo.trim().toUpperCase() === equipoName.trim().toUpperCase()
        ? { ...row, precioUnitario: price }
        : row
    );
    setEditingDoc(recalcDoc({ ...editingDoc, filas: nextFilas }));
    setFeedback({
      type: 'ok',
      text: `Tarifa $${formatNumAR(price)} aplicada a todas las líneas de ${equipoName}.`,
    });
  };

  const handleUpdateRow = (
    rowId: string,
    patch: Partial<ObraResumenValorizadoRow>
  ) => {
    if (!editingDoc) return;
    const nextFilas = editingDoc.filas.map((f) => {
      if (f.id !== rowId) return f;
      const merged = { ...f, ...patch };
      // If equipment text matches a fleet vehicle and price wasn't explicitly changed & is 0, auto-fill price
      if (patch.equipo !== undefined && patch.precioUnitario === undefined && Number(merged.precioUnitario) === 0) {
        const veh = findMatchingVehicle(fleet, undefined, patch.equipo);
        if (veh) {
          const autoRate = resolveVehicleRate(veh, merged.unidad);
          if (autoRate > 0) {
            merged.precioUnitario = autoRate;
            merged.equipoCodigo = veh.codigoInterno;
          }
        }
      }
      return merged;
    });
    setEditingDoc(recalcDoc({ ...editingDoc, filas: nextFilas }));
  };

  const handleAddManualRow = () => {
    if (!editingDoc) return;
    const veh = quickAddMachineId ? fleet.find((v) => v.id === quickAddMachineId) : undefined;
    const autoPrice = resolveVehicleRate(veh, 'HORAS');
    const newRow: ObraResumenValorizadoRow = {
      id: `rv-man-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fecha: editingDoc.fechaHasta || getTodayISO(),
      numero: '',
      equipo: veh ? veh.modeloMarca.toUpperCase() : '',
      equipoCodigo: veh?.codigoInterno || '',
      detalle: '',
      cantidad: 1,
      precioUnitario: autoPrice,
      precioTotal: autoPrice,
      esManual: true,
      unidad: 'UNIDADES',
    };
    setEditingDoc(recalcDoc({ ...editingDoc, filas: [...editingDoc.filas, newRow] }));
    setQuickAddMachineId('');
  };

  const handleDuplicateRow = (idx: number) => {
    if (!editingDoc) return;
    const src = editingDoc.filas[idx];
    if (!src) return;
    const copy: ObraResumenValorizadoRow = {
      ...src,
      id: `rv-dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      parteDiarioId: undefined,
      esManual: true,
    };
    const next = [...editingDoc.filas];
    next.splice(idx + 1, 0, copy);
    setEditingDoc(recalcDoc({ ...editingDoc, filas: next }));
  };

  const handleReorderRow = (sourceId: string, targetId: string, position: 'above' | 'below') => {
    if (!editingDoc || sourceId === targetId) return;
    const next = [...editingDoc.filas];
    const fromIdx = next.findIndex((f) => f.id === sourceId);
    if (fromIdx === -1) return;
    const [moved] = next.splice(fromIdx, 1);
    const toIdxBase = next.findIndex((f) => f.id === targetId);
    if (toIdxBase === -1) return;
    const insertIdx = position === 'below' ? toIdxBase + 1 : toIdxBase;
    next.splice(insertIdx, 0, moved);
    setEditingDoc({ ...editingDoc, filas: next });
  };

  const resetRowDragState = () => {
    draggingRowIdRef.current = null;
    pointerDownForDragRef.current = false;
    setDraggingRowId(null);
    setDragOverState(null);
    setArmedDragRowId(null);
  };

  const handleDeleteRow = (rowId: string) => {
    if (!editingDoc) return;
    setEditingDoc(
      recalcDoc({
        ...editingDoc,
        filas: editingDoc.filas.filter((f) => f.id !== rowId),
      })
    );
  };

  // Unique machines in current draft for quick bulk pricing
  const uniqueEquiposInDraft = useMemo(() => {
    if (!editingDoc) return [];
    const map = new Map<string, { equipo: string; rowsCount: number; totalCant: number; currentPrice: number; fleetPrice: number }>();
    for (const r of editingDoc.filas) {
      const key = (r.equipo || '').trim().toUpperCase();
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        existing.rowsCount++;
        existing.totalCant += Number(r.cantidad || 0);
        if (r.precioUnitario > 0) existing.currentPrice = r.precioUnitario;
      } else {
        const veh = findMatchingVehicle(fleet, r.equipoCodigo, key);
        map.set(key, {
          equipo: key,
          rowsCount: 1,
          totalCant: Number(r.cantidad || 0),
          currentPrice: Number(r.precioUnitario || 0),
          fleetPrice: resolveVehicleRate(veh, r.unidad),
        });
      }
    }
    return Array.from(map.values());
  }, [editingDoc, fleet]);

  // Live origin breakdown & missing-partes detection for active draft
  const draftOriginStats = useMemo(() => {
    if (!editingDoc) {
      return {
        total: 0,
        vinculados: 0,
        sinVincular: 0,
        manuales: 0,
        missingPartes: [] as ParteDiario[],
        missingUnlinkedCount: 0,
      };
    }
    let vinculados = 0;
    let sinVincular = 0;
    let manuales = 0;
    const presentParteIds = new Set<string>();

    for (const row of editingDoc.filas) {
      if (row.parteDiarioId) presentParteIds.add(row.parteDiarioId);
      const info = getRowOriginInfo(row);
      if (info.kind === 'MANUAL') manuales++;
      else if (info.kind === 'PERIODO_SIN_VINCULAR') sinVincular++;
      else vinculados++;
    }

    const scoped = getScopedPartes(editingDoc.periodoId, editingDoc.fechaDesde, editingDoc.fechaHasta, false);
    const missingPartes = scoped.filter((p) => !presentParteIds.has(p.id));
    const missingUnlinkedCount = missingPartes.filter((p) => {
      const links = parteLinkageMap.get(p.id);
      return (
        !links ||
        (links.contratos.length === 0 &&
          links.facturasEmitidas.length === 0 &&
          links.legajosPendientes.length === 0 &&
          links.contenedores.length === 0)
      );
    }).length;

    return {
      total: editingDoc.filas.length,
      vinculados,
      sinVincular,
      manuales,
      missingPartes,
      missingUnlinkedCount,
    };
  }, [editingDoc, parteLinkageMap, eligibleObraPartes, periodos, obra, rentals]);

  const handleAppendMissingPartes = () => {
    if (!editingDoc || draftOriginStats.missingPartes.length === 0) return;
    const customPriceByEquipo = new Map<string, number>();
    for (const row of editingDoc.filas) {
      const eqKey = (row.equipo || '').trim().toUpperCase();
      if (eqKey && Number(row.precioUnitario) > 0) {
        customPriceByEquipo.set(eqKey, Number(row.precioUnitario));
      }
    }
    const newRows = draftOriginStats.missingPartes.map((p) => {
      const fresh = buildParteRow(p, fleet);
      const eqKey = fresh.equipo.trim().toUpperCase();
      if (fresh.precioUnitario === 0 && customPriceByEquipo.has(eqKey)) {
        fresh.precioUnitario = customPriceByEquipo.get(eqKey)!;
        fresh.precioTotal = Number((fresh.cantidad * fresh.precioUnitario).toFixed(2));
      }
      return fresh;
    });
    const merged = [...editingDoc.filas, ...newRows].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero, 'es', { numeric: true })
    );
    setEditingDoc(recalcDoc({ ...editingDoc, filas: merged }));
    setFeedback({
      type: 'ok',
      text: `Se incorporaron ${newRows.length} parte(s) faltante(s) del período/contratos (los sin vincular quedan marcados en naranja).`,
    });
  };

  // Save draft into Obra (Supabase)
  const persistResumenToObra = async (
    docToSave: ObraResumenValorizado,
    attachPdfToContenedor?: ObraLegajoAdjunto
  ): Promise<boolean> => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const cleanDoc = recalcDoc({
        ...docToSave,
        updatedAt: new Date().toISOString(),
      });
      const exists = allResumenes.some((r) => r.id === cleanDoc.id);
      const nextResumenes = exists
        ? allResumenes.map((r) => (r.id === cleanDoc.id ? cleanDoc : r))
        : [cleanDoc, ...allResumenes];

      // Also attach PDF inside linked Contenedor's adjuntos if requested
      let nextPeriodos = obra.periodosLegajo;
      if (attachPdfToContenedor && cleanDoc.periodoId && Array.isArray(obra.periodosLegajo)) {
        nextPeriodos = obra.periodosLegajo.map((per) => {
          if (per.id !== cleanDoc.periodoId) return per;
          const prevAdj = per.adjuntos || [];
          const filtered = prevAdj.filter((a) => a.nombre !== attachPdfToContenedor.nombre);
          return {
            ...per,
            adjuntos: [attachPdfToContenedor, ...filtered],
          };
        });
      }

      const res = await onSaveObra({
        ...obra,
        resumenesValorizados: nextResumenes,
        periodosLegajo: nextPeriodos,
      });

      if (!res.ok) {
        setFeedback({ type: 'err', text: res.error || 'No se pudo guardar en Supabase.' });
        return false;
      }

      if (editingDoc?.id === cleanDoc.id) {
        setEditingDoc(cleanDoc);
      }
      setFeedback({
        type: 'ok',
        text: attachPdfToContenedor
          ? 'Resumen guardado y PDF A4 adjuntado correctamente en Cloudflare R2 y Supabase.'
          : 'Resumen Valorizado guardado en Supabase.',
      });
      return true;
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Error guardando Resumen Valorizado.' });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteResumen = async (id: string) => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const nextResumenes = allResumenes.filter((r) => r.id !== id);
      const res = await onSaveObra({
        ...obra,
        resumenesValorizados: nextResumenes,
      });
      if (!res.ok) {
        setFeedback({ type: 'err', text: res.error || 'No se pudo eliminar el resumen.' });
      } else {
        setConfirmDeleteId(null);
        if (editingDoc?.id === id) setEditingDoc(null);
        setFeedback({ type: 'ok', text: 'Resumen Valorizado eliminado.' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ==================== GENERADOR PDF A4 FIEL A LA FOTO ====================
  const buildPdfDocument = async (docData: ObraResumenValorizado): Promise<jsPDF> => {
    const clean = recalcDoc(docData);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    const marginL = 12;
    const marginR = 12;
    const usableW = pageW - marginL - marginR; // 186mm

    const settings = loadSiteSettings();
    const logoCandidates = Array.from(
      new Set(
        [
          settings.customLogoUrlLight,
          settings.customLogoUrl,
          settings.customLogoUrlDark,
          settings.customLogoUrlIcon,
        ].filter((u): u is string => Boolean(u && u.trim()))
      )
    );
    let logoImg: { dataUrl: string; width: number; height: number } | null = null;
    for (const candidateUrl of logoCandidates) {
      const loaded = await loadImageAsDataUrl(candidateUrl);
      if (loaded) {
        logoImg = loaded;
        break;
      }
    }

    // Helper: Draw Header (Logo + Diagonal Stripes + Fecha / N°)
    const drawPageHeader = (isFirstPage: boolean) => {
      const topY = 10;

      // Top-left logo or institutional brand
      if (logoImg) {
        const maxH = 20;
        const maxW = 78;
        const ratio = Math.min(maxW / logoImg.width, maxH / logoImg.height);
        const w = logoImg.width * ratio;
        const h = logoImg.height * ratio;
        const logoOffsetY = topY + (maxH - h) / 2;
        pdf.addImage(logoImg.dataUrl, 'PNG', marginL, logoOffsetY, w, h);
      } else {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(22);
        pdf.setTextColor(65, 65, 65);
        pdf.text('LA HORMIGA', marginL, topY + 10);
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(9.5);
        pdf.setTextColor(95, 95, 95);
        pdf.text('Pequeños grandes movimientos', marginL, topY + 15.5);
      }

      // Top-right diagonal gray stripes bar (exact motif from the photo)
      pdf.setFillColor(120, 120, 120);
      const stripeStartX = 96;
      const stripeEndX = pageW - marginR;
      const stripeY = topY + 7.5;
      const stripeH = 3.6;
      for (let sx = stripeStartX; sx < stripeEndX - 2; sx += 4.2) {
        pdf.triangle(sx, stripeY + stripeH, sx + 1.8, stripeY, sx + 3.4, stripeY, 'F');
        pdf.triangle(sx, stripeY + stripeH, sx + 3.4, stripeY, sx + 1.6, stripeY + stripeH, 'F');
      }

      // FECHA & N° right aligned below stripes with clean margin above the table
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(50, 50, 50);
      pdf.text(`FECHA: ${formatDateAR(clean.fechaEmision)}`, pageW - marginR, topY + 18.5, {
        align: 'right',
      });
      pdf.text(`N°: ${clean.numero || '0001.001'}`, pageW - marginR, topY + 23.2, {
        align: 'right',
      });

      // Start content cleanly at y = 40 on BOTH first page and subsequent pages (never overlaps FECHA / N°)
      let y = 40;

      if (isFirstPage) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(35, 35, 35);
        pdf.text(clean.saludo || 'Estimado,', marginL, y);
        y += 5;

        const introLines = pdf.splitTextToSize(
          `        ${clean.introduccion || ''}`,
          usableW - 4
        );
        pdf.text(introLines, marginL + 2, y);
        y += introLines.length * 4.5 + 4;
      }

      return y;
    };

    // Table Columns matching the photo exact order & proportions (sum = 186mm)
    const cols = [
      { key: 'fecha', label: 'FECHA', w: 20, align: 'center' as const },
      { key: 'numero', label: 'N°', w: 15, align: 'center' as const },
      { key: 'equipo', label: 'EQUIPO', w: 34, align: 'left' as const },
      { key: 'detalle', label: 'DETALLE', w: 63, align: 'left' as const },
      { key: 'cantidad', label: 'CANT.', w: 13, align: 'right' as const },
      { key: 'punit', label: 'P.UNIT', w: 20, align: 'right' as const },
      { key: 'ptotal', label: 'P.TOTAL', w: 21, align: 'right' as const },
    ];

    const drawTableHeader = (y: number) => {
      const headerH = 7;
      pdf.setFillColor(218, 218, 218);
      pdf.setDrawColor(80, 80, 80);
      pdf.setLineWidth(0.25);
      pdf.rect(marginL, y, usableW, headerH, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(35, 35, 35);

      let cx = marginL;
      for (const col of cols) {
        if (cx > marginL) {
          pdf.line(cx, y, cx, y + headerH);
        }
        pdf.text(col.label, cx + col.w / 2, y + 4.7, { align: 'center' });
        cx += col.w;
      }
      return y + headerH;
    };

    let y = drawPageHeader(true);
    y = drawTableHeader(y);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setDrawColor(95, 95, 95);
    pdf.setLineWidth(0.2);

    for (let i = 0; i < clean.filas.length; i++) {
      const row = clean.filas[i];
      const equipoLines = pdf.splitTextToSize(String(row.equipo || '').toUpperCase(), cols[2].w - 2.5);
      const detalleLines = pdf.splitTextToSize(String(row.detalle || '').toUpperCase(), cols[3].w - 2.5);
      const maxLines = Math.max(1, equipoLines.length, detalleLines.length);
      const rowH = Math.max(7.5, maxLines * 3.6 + 2.8);

      if (y + rowH > pageH - 28) {
        pdf.addPage();
        y = drawPageHeader(false);
        y = drawTableHeader(y);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setDrawColor(95, 95, 95);
      }

      // Alternating subtle shading matching the photo
      if (i % 2 === 1) {
        pdf.setFillColor(246, 246, 246);
        pdf.rect(marginL, y, usableW, rowH, 'FD');
      } else {
        pdf.rect(marginL, y, usableW, rowH, 'S');
      }

      let cx = marginL;
      const vals = [
        formatDateAR(row.fecha),
        String(row.numero || '-'),
        equipoLines,
        detalleLines,
        formatNumAR(row.cantidad, 2),
        `${formatNumAR(row.precioUnitario, 2)} $`,
        formatNumAR(row.precioTotal, 2),
      ];

      pdf.setTextColor(35, 35, 35);
      for (let cIdx = 0; cIdx < cols.length; cIdx++) {
        const col = cols[cIdx];
        if (cIdx > 0) {
          pdf.line(cx, y, cx, y + rowH);
        }
        const val = vals[cIdx];
        if (Array.isArray(val)) {
          pdf.text(val, cx + 1.3, y + 4.1);
        } else if (col.align === 'center') {
          pdf.text(val, cx + col.w / 2, y + 4.3, { align: 'center' });
        } else if (col.align === 'right') {
          pdf.text(val, cx + col.w - 1.5, y + 4.3, { align: 'right' });
        } else {
          pdf.text(val, cx + 1.3, y + 4.3);
        }
        cx += col.w;
      }

      y += rowH;
    }

    // Totals footer box
    const footerH = clean.alicuotaIva > 0 ? 22 : 11;
    if (y + footerH + 10 > pageH - 12) {
      pdf.addPage();
      y = drawPageHeader(false);
    }

    y += 3;
    const boxW = 74;
    const boxX = pageW - marginR - boxW;
    pdf.setDrawColor(60, 60, 60);
    pdf.setLineWidth(0.3);

    if (clean.alicuotaIva > 0) {
      pdf.setFillColor(245, 245, 245);
      pdf.rect(boxX, y, boxW, 7, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(50, 50, 50);
      pdf.text('SUBTOTAL NETO:', boxX + 2.5, y + 4.8);
      pdf.text(`$ ${formatNumAR(clean.subtotalNeto, 2)}`, boxX + boxW - 2.5, y + 4.8, { align: 'right' });

      y += 7;
      pdf.setFillColor(250, 250, 250);
      pdf.rect(boxX, y, boxW, 7, 'FD');
      pdf.text(`IVA (${clean.alicuotaIva}%):`, boxX + 2.5, y + 4.8);
      pdf.text(`$ ${formatNumAR(clean.ivaMonto, 2)}`, boxX + boxW - 2.5, y + 4.8, { align: 'right' });

      y += 7;
      pdf.setFillColor(218, 218, 218);
      pdf.rect(boxX, y, boxW, 8, 'FD');
      pdf.setFontSize(9.5);
      pdf.setTextColor(15, 15, 15);
      pdf.text('TOTAL FINAL:', boxX + 2.5, y + 5.4);
      pdf.text(`$ ${formatNumAR(clean.totalGeneral, 2)}`, boxX + boxW - 2.5, y + 5.4, { align: 'right' });
    } else {
      pdf.setFillColor(218, 218, 218);
      pdf.rect(boxX, y, boxW, 8.5, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(15, 15, 15);
      pdf.text('TOTAL RESUMEN:', boxX + 2.5, y + 5.7);
      pdf.text(`$ ${formatNumAR(clean.subtotalNeto, 2)}`, boxX + boxW - 2.5, y + 5.7, { align: 'right' });
    }

    if (clean.observaciones?.trim()) {
      y += 13;
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8);
      pdf.setTextColor(80, 80, 80);
      const obsLines = pdf.splitTextToSize(`Obs.: ${clean.observaciones.trim()}`, usableW);
      pdf.text(obsLines, marginL, y);
    }

    // Subtle page numbering footer on multi-page documents
    const totalPages = pdf.getNumberOfPages();
    if (totalPages > 1) {
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Hoja ${p} de ${totalPages}`, pageW - marginR, pageH - 8, { align: 'right' });
      }
    }

    return pdf;
  };

  const handleDownloadPdf = async (docData: ObraResumenValorizado) => {
    setIsExportingPdf(true);
    try {
      const pdf = await buildPdfDocument(docData);
      const safeObra = obra.nombreObra.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32);
      const safeNum = (docData.numero || '001').replace(/[^a-zA-Z0-9._-]+/g, '_');
      pdf.save(`Resumen_Valorizado_${safeNum}_${safeObra}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = (docData: ObraResumenValorizado) => {
    const clean = recalcDoc(docData);
    const headerRows: any[][] = [
      ['LA HORMIGA - Pequeños grandes movimientos', '', '', '', '', 'FECHA:', formatDateAR(clean.fechaEmision)],
      [`OBRA: ${obra.nombreObra}`, '', '', '', '', 'N°:', clean.numero],
      [clean.saludo || 'Estimado,'],
      [clean.introduccion || ''],
      [],
      ['FECHA', 'N°', 'EQUIPO', 'DETALLE', 'CANT.', 'P.UNIT', 'P.TOTAL'],
    ];

    const bodyRows = clean.filas.map((f) => [
      formatDateAR(f.fecha),
      f.numero,
      f.equipo,
      f.detalle,
      f.cantidad,
      f.precioUnitario,
      f.precioTotal,
    ]);

    const footerRows: any[][] = [
      [],
      ['', '', '', '', '', 'SUBTOTAL NETO', clean.subtotalNeto],
    ];
    if (clean.alicuotaIva > 0) {
      footerRows.push(['', '', '', '', '', `IVA ${clean.alicuotaIva}%`, clean.ivaMonto]);
      footerRows.push(['', '', '', '', '', 'TOTAL FINAL', clean.totalGeneral]);
    }

    const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...bodyRows, ...footerRows]);
    ws['!cols'] = [
      { wch: 13 },
      { wch: 11 },
      { wch: 28 },
      { wch: 52 },
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen Valorizado');
    const safeObra = obra.nombreObra.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32);
    const safeNum = (clean.numero || '001').replace(/[^a-zA-Z0-9._-]+/g, '_');
    XLSX.writeFile(wb, `Resumen_Valorizado_${safeNum}_${safeObra}.xlsx`);
  };

  const handleGenerateAndAttachPdf = async (docData: ObraResumenValorizado) => {
    setIsAttachingPdf(true);
    setFeedback(null);
    try {
      const clean = recalcDoc(docData);
      const pdf = await buildPdfDocument(clean);
      const blob = pdf.output('blob');
      const safeObra = obra.nombreObra.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32);
      const safeNum = (clean.numero || '001').replace(/[^a-zA-Z0-9._-]+/g, '_');
      const fileName = `Resumen_Valorizado_${safeNum}_${safeObra}.pdf`;
      const pdfFile = new File([blob], fileName, { type: 'application/pdf' });

      const uploadRes = await uploadFileToCloudflareR2(
        pdfFile,
        fileName,
        'application/pdf',
        'obras-resumenes-valorizados'
      );
      if (!uploadRes.success || !uploadRes.url) {
        setFeedback({
          type: 'err',
          text: uploadRes.error || 'No se pudo subir el PDF a Cloudflare R2.',
        });
        return;
      }

      const sizeKB = Math.max(1, Math.round(pdfFile.size / 1024));
      const newPdfAdjunto: ObraLegajoAdjunto = {
        id: `ADJ-RV-${Date.now()}`,
        nombre: fileName,
        url: uploadRes.url,
        tipo: 'RESUMEN_VALORIZADO',
        fechaSubida: getTodayISO(),
        tamanio: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`,
      };

      const withPdf: ObraResumenValorizado = {
        ...clean,
        pdfAdjunto: newPdfAdjunto,
      };
      await persistResumenToObra(withPdf, newPdfAdjunto);
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Error generando y adjuntando PDF.' });
    } finally {
      setIsAttachingPdf(false);
    }
  };

  // Resolve contracts, partes diarios, legajo, and invoice status linked to a Resumen Valorizado
  const resolveResumenLinkage = (rv: ObraResumenValorizado) => {
    const parteIds = Array.from(
      new Set(
        (rv.filas || [])
          .map((f) => f.parteDiarioId)
          .filter((id): id is string => Boolean(id && id.trim()))
      )
    );

    const rentalIdSet = new Set<string>(rv.rentalIds || []);
    const facturasLegajo = obra.facturasLegajo || [];

    // 1. Check legajos linked directly to this resumen or same periodo
    const matchedLegajo =
      facturasLegajo.find((f) => (rv.legajoId && f.id === rv.legajoId) || f.resumenValorizadoId === rv.id) ||
      (rv.periodoId
        ? facturasLegajo.find((f) => f.periodoId === rv.periodoId && (f.pendienteFacturacion || !f.arcaInvoiceId)) ||
          facturasLegajo.find((f) => f.periodoId === rv.periodoId)
        : undefined);

    if (matchedLegajo) {
      (matchedLegajo.rentalIds || []).forEach((rid) => rentalIdSet.add(rid));
    }

    // 2. Check container rentals
    if (rv.periodoId) {
      const per = periodos.find((p) => p.id === rv.periodoId);
      (per?.rentalIds || []).forEach((rid) => rentalIdSet.add(rid));
      facturasLegajo
        .filter((f) => f.periodoId === rv.periodoId)
        .forEach((f) => (f.rentalIds || []).forEach((rid) => rentalIdSet.add(rid)));
    }

    // 3. Check rentals referenced by any parte diario inside rv.filas
    const parteIdSet = new Set<string>(parteIds);
    rentals.forEach((r) => {
      if ((r.partesDiariosIds || []).some((pid) => parteIdSet.has(pid))) {
        rentalIdSet.add(r.id);
      }
    });
    parteIds.forEach((pid) => {
      const p = parteById.get(pid);
      if (p?.rentalId) rentalIdSet.add(p.rentalId);
      if (p?.rentalNumero) {
        const norm = p.rentalNumero.trim().toUpperCase();
        const found = rentals.find((r) => (r.numeroContrato || '').trim().toUpperCase() === norm);
        if (found) rentalIdSet.add(found.id);
      }
    });

    const linkedRentals = rentals.filter((r) => rentalIdSet.has(r.id));
    const primaryRental =
      linkedRentals.find((r) => r.estadoFacturacion !== 'FACTURADO') || linkedRentals[0];

    const isInLegajo = Boolean(
      matchedLegajo &&
        (matchedLegajo.resumenValorizadoId === rv.id ||
          rv.legajoId === matchedLegajo.id ||
          (rv.pdfAdjunto && (matchedLegajo.adjuntos || []).some((a) => a.url === rv.pdfAdjunto!.url)))
    );

    const facturaNumero =
      rv.facturaArcaNumero ||
      (matchedLegajo && !matchedLegajo.pendienteFacturacion && matchedLegajo.arcaInvoiceId
        ? matchedLegajo.nroComprobante
        : undefined);

    // 4. Resolve live ARCA invoice & customer receipts to determine real payment status
    let matchedArca: ArcaInvoice | null = null;
    if (rv.facturaArcaId) {
      matchedArca = arcaInvoices.find((inv) => inv.id === rv.facturaArcaId) || null;
    }
    if (!matchedArca && matchedLegajo?.arcaInvoiceId) {
      matchedArca = arcaInvoices.find((inv) => inv.id === matchedLegajo.arcaInvoiceId) || null;
    }
    const targetInvNum = (
      facturaNumero ||
      (matchedLegajo && !matchedLegajo.pendienteFacturacion ? matchedLegajo.nroComprobante : '') ||
      ''
    )
      .trim()
      .toUpperCase();
    if (!matchedArca && targetInvNum && targetInvNum !== 'SIN FACTURAR') {
      matchedArca =
        arcaInvoices.find((inv) => formatInvoiceNumber(inv).toUpperCase() === targetInvNum) || null;
    }
    if (!matchedArca) {
      for (const r of linkedRentals) {
        if (r.facturaId) {
          const found = arcaInvoices.find((inv) => inv.id === r.facturaId);
          if (found) {
            matchedArca = found;
            break;
          }
        }
        if (r.facturaNumero) {
          const norm = r.facturaNumero.trim().toUpperCase();
          const found = arcaInvoices.find((inv) => formatInvoiceNumber(inv).toUpperCase() === norm);
          if (found) {
            matchedArca = found;
            break;
          }
        }
      }
    }

    const resolvedFacturaNumero =
      facturaNumero || (matchedArca ? formatInvoiceNumber(matchedArca) : undefined);

    const receiptsMap = new Map<string, CustomerPaymentReceipt>();
    const matchNumUpper = (resolvedFacturaNumero || '').trim().toUpperCase();
    customerReceipts.forEach((rec) => {
      const byId = matchedArca && (rec.facturasIds || []).includes(matchedArca.id);
      const byNum =
        matchNumUpper &&
        (rec.facturasNumeros || []).some((n) => String(n).trim().toUpperCase() === matchNumUpper);
      if (byId || byNum) receiptsMap.set(rec.id, rec);
    });
    (matchedArca?.recibosCobro || []).forEach((rec) => {
      if (!receiptsMap.has(rec.id)) receiptsMap.set(rec.id, rec);
    });
    const linkedReceipts = Array.from(receiptsMap.values()).sort((a, b) =>
      (b.fecha || '').localeCompare(a.fecha || '')
    );

    const totalRef = Number(
      matchedArca ? matchedArca.importeTotal ?? matchedArca.impTotal ?? rv.totalGeneral : rv.totalGeneral || 0
    );
    const receiptsSum = linkedReceipts.reduce(
      (acc, r) => acc + Number(r.totalImputado ?? r.montoCobrado ?? 0),
      0
    );

    let estadoCobro: 'COBRADO' | 'COBRADO_PARCIAL' | 'PENDIENTE' =
      matchedLegajo?.estadoCobro || 'PENDIENTE';
    if (matchedArca) {
      if (isArcaInvoiceFullyPaid(matchedArca, customerReceipts)) {
        estadoCobro = 'COBRADO';
      } else if (
        receiptsSum > 0 ||
        Number(matchedArca.montoCobrado || 0) > 0 ||
        matchedArca.estadoCobro === 'COBRADO_PARCIAL' ||
        matchedArca.estadoCobro === 'PARCIAL'
      ) {
        estadoCobro = 'COBRADO_PARCIAL';
      } else {
        estadoCobro = 'PENDIENTE';
      }
    } else if (linkedReceipts.length > 0 && totalRef > 0) {
      estadoCobro = receiptsSum >= totalRef - 0.5 ? 'COBRADO' : 'COBRADO_PARCIAL';
    }

    return {
      parteDiarioIds: parteIds,
      linkedRentalIds: Array.from(rentalIdSet),
      linkedRentals,
      primaryRental,
      matchedLegajo,
      isInLegajo,
      facturaNumero: resolvedFacturaNumero,
      matchedArca,
      linkedReceipts,
      estadoCobro,
      isPagada: estadoCobro === 'COBRADO',
      isCobroParcial: estadoCobro === 'COBRADO_PARCIAL',
    };
  };

  // Sumar Resumen Valorizado al Legajo de Facturación (genera PDF si falta, adjunta y vincula partes/contrato)
  const handleAddResumenToLegajo = async (docData: ObraResumenValorizado) => {
    setAddingToLegajoId(docData.id);
    setFeedback(null);
    try {
      const clean = recalcDoc(docData);
      let pdfAdjunto = clean.pdfAdjunto;

      // Always generate fresh PDF on R2 so the legajo holds the latest A4 sheet with logo
      const pdf = await buildPdfDocument(clean);
      const blob = pdf.output('blob');
      const safeObra = obra.nombreObra.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32);
      const safeNum = (clean.numero || '001').replace(/[^a-zA-Z0-9._-]+/g, '_');
      const fileName = `Resumen_Valorizado_${safeNum}_${safeObra}.pdf`;
      const pdfFile = new File([blob], fileName, { type: 'application/pdf' });

      const uploadRes = await uploadFileToCloudflareR2(
        pdfFile,
        fileName,
        'application/pdf',
        'obras-resumenes-valorizados'
      );
      if (uploadRes.success && uploadRes.url) {
        const sizeKB = Math.max(1, Math.round(pdfFile.size / 1024));
        pdfAdjunto = {
          id: `ADJ-RV-${Date.now()}`,
          nombre: fileName,
          url: uploadRes.url,
          tipo: 'RESUMEN_VALORIZADO',
          fechaSubida: getTodayISO(),
          tamanio: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`,
        };
      } else if (!pdfAdjunto) {
        setFeedback({
          type: 'err',
          text: uploadRes.error || 'No se pudo subir el PDF a Cloudflare R2 para sumarlo al legajo.',
        });
        return;
      }

      const linkage = resolveResumenLinkage(clean);
      const facturasLegajo = obra.facturasLegajo || [];
      const targetLegajo = linkage.matchedLegajo;
      const legajoId = targetLegajo?.id || `OFAC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const mergeAdjuntos = (prev: ObraLegajoAdjunto[] = []): ObraLegajoAdjunto[] => {
        if (!pdfAdjunto) return prev;
        const filtered = prev.filter((a) => a.nombre !== pdfAdjunto!.nombre && a.url !== pdfAdjunto!.url);
        return [pdfAdjunto, ...filtered];
      };

      let nextFacturasLegajo: ObraFacturaLegajo[];
      if (targetLegajo) {
        const mergedRentals = Array.from(
          new Set([...(targetLegajo.rentalIds || []), ...linkage.linkedRentalIds])
        );
        const mergedPartes = Array.from(
          new Set([...(targetLegajo.parteDiarioIds || []), ...linkage.parteDiarioIds])
        );
        const shouldFillAmounts =
          Boolean(targetLegajo.pendienteFacturacion) && Number(targetLegajo.importeTotal || 0) <= 0;

        nextFacturasLegajo = facturasLegajo.map((f) =>
          f.id !== targetLegajo.id
            ? f
            : {
                ...f,
                rentalIds: mergedRentals,
                parteDiarioIds: mergedPartes,
                resumenValorizadoId: clean.id,
                resumenValorizadoNumero: clean.numero,
                netoGravado: shouldFillAmounts ? clean.subtotalNeto : f.netoGravado,
                ivaMonto: shouldFillAmounts ? clean.ivaMonto : f.ivaMonto,
                importeTotal: shouldFillAmounts ? clean.totalGeneral : f.importeTotal,
                adjuntos: mergeAdjuntos(f.adjuntos),
              }
        );
      } else {
        const origen: ObraFacturaLegajo['origen'] =
          linkage.linkedRentalIds.length > 0 && linkage.parteDiarioIds.length > 0
            ? 'MIXTO'
            : linkage.linkedRentalIds.length > 0
            ? 'ALQUILER_MAQUINA'
            : 'PARTES_DIARIOS';

        const newLegajo: ObraFacturaLegajo = {
          id: legajoId,
          periodoId: clean.periodoId,
          periodoTitulo: clean.periodoTitulo,
          tipoComprobante:
            linkage.linkedRentalIds.length > 0 ? 'CONTRATO DE ALQUILER' : 'RESUMEN VALORIZADO',
          nroComprobante: clean.numero,
          fecha: clean.fechaEmision || getTodayISO(),
          concepto: `Resumen Valorizado N° ${clean.numero}${
            clean.periodoTitulo ? ` — ${clean.periodoTitulo}` : ''
          }`,
          origen,
          rentalIds: linkage.linkedRentalIds,
          quotationIds: linkage.linkedRentals
            .map((r) => r.cotizacionId)
            .filter((id): id is string => Boolean(id)),
          parteDiarioIds: linkage.parteDiarioIds,
          resumenValorizadoId: clean.id,
          resumenValorizadoNumero: clean.numero,
          netoGravado: clean.subtotalNeto,
          ivaMonto: clean.ivaMonto,
          importeTotal: clean.totalGeneral,
          estadoCobro: 'PENDIENTE',
          pendienteFacturacion: true,
          observaciones: `Legajo armado desde Resumen Valorizado N° ${clean.numero} (pendiente de facturación ARCA).`,
          adjuntos: pdfAdjunto ? [pdfAdjunto] : [],
          createdAt: new Date().toISOString(),
        };
        nextFacturasLegajo = [newLegajo, ...facturasLegajo];
      }

      const updatedResumen: ObraResumenValorizado = {
        ...clean,
        pdfAdjunto,
        legajoId,
        rentalIds: linkage.linkedRentalIds,
        updatedAt: new Date().toISOString(),
      };

      const exists = allResumenes.some((r) => r.id === updatedResumen.id);
      const nextResumenes = exists
        ? allResumenes.map((r) => (r.id === updatedResumen.id ? updatedResumen : r))
        : [updatedResumen, ...allResumenes];

      let nextPeriodos = obra.periodosLegajo;
      if (pdfAdjunto && updatedResumen.periodoId && Array.isArray(obra.periodosLegajo)) {
        nextPeriodos = obra.periodosLegajo.map((per) =>
          per.id !== updatedResumen.periodoId
            ? per
            : {
                ...per,
                adjuntos: mergeAdjuntos(per.adjuntos),
              }
        );
      }

      const res = await onSaveObra({
        ...obra,
        resumenesValorizados: nextResumenes,
        facturasLegajo: nextFacturasLegajo,
        periodosLegajo: nextPeriodos,
      });

      if (!res.ok) {
        setFeedback({ type: 'err', text: res.error || 'No se pudo sumar el resumen al legajo en Supabase.' });
        return;
      }

      if (editingDoc?.id === updatedResumen.id) {
        setEditingDoc(updatedResumen);
      }
      setFeedback({
        type: 'ok',
        text: targetLegajo
          ? `Resumen N° ${clean.numero} sumado al Legajo${
              linkage.primaryRental ? ` (vinculado a ${linkage.primaryRental.numeroContrato})` : ''
            } con PDF adjunto en Supabase.`
          : `Se creó el Legajo pendiente y se sumó el Resumen N° ${clean.numero} con PDF adjunto en Supabase.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Error sumando el resumen al legajo.' });
    } finally {
      setAddingToLegajoId(null);
    }
  };

  // Facturar directamente desde el Resumen Valorizado en ARCA (vinculando Factura + Contrato + Legajo + Partes)
  const handleInvoiceResumenDirectly = async (docData: ObraResumenValorizado) => {
    if (!onInvoiceResumenInArca) {
      if (onNavigateToFacturas) onNavigateToFacturas();
      return;
    }
    const clean = recalcDoc(docData);

    // Ensure the resumen is saved in Supabase before jumping to ARCA so auto-linking on emit finds it cleanly
    const alreadySaved = allResumenes.some((r) => r.id === clean.id);
    if (!alreadySaved || editingDoc?.id === clean.id) {
      const ok = await persistResumenToObra(clean);
      if (!ok) return;
    }

    const linkage = resolveResumenLinkage(clean);
    onInvoiceResumenInArca({
      obra,
      resumen: clean,
      linkedRental: linkage.primaryRental,
      linkedRentalIds: linkage.linkedRentalIds,
      parteDiarioIds: linkage.parteDiarioIds,
    });
  };

  return (
    <div className="space-y-5">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================== MODO LISTA DE RESÚMENES ==================== */}
      {!editingDoc ? (
        <div className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#F0C800]" />
                <h3 className="text-base font-black text-white">
                  Resumen Valorizado de Trabajos (Pre-Facturación Opcional)
                </h3>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-bold uppercase text-slate-300">
                  Opcional
                </span>
              </div>
              <p className="text-xs text-slate-400 max-w-2xl">
                Armá una planilla tipo Excel con los Partes Diarios de la obra, ajustá tarifas por máquina o por línea, agregá ítems faltantes y generá el documento A4 en PDF o Excel para enviar al cliente o adjuntar antes de facturar. Si es un trabajo simple, podés obviarlo y pasar directo a Facturación.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onNavigateToFacturas && (
                <button
                  type="button"
                  onClick={onNavigateToFacturas}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Receipt className="w-4 h-4 text-slate-400" />
                  <span>Ir directo a Facturar</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleStartNewResumen}
                className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>+ Armar Resumen Valorizado</span>
              </button>
            </div>
          </div>

          {visibleResumenes.length === 0 ? (
            <div className="py-12 px-6 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl space-y-3">
              <FileSpreadsheet className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-200">
                  Todavía no armaste ningún Resumen Valorizado{activeContenedor ? ` en «${activeContenedor.titulo}»` : ''}
                </p>
                <p className="text-xs text-slate-400 max-w-lg mx-auto">
                  Tenés <strong>{obraPartes.length} parte(s) diario(s)</strong> vinculados a esta obra listos para importar automáticamente en la tabla con los precios de tus máquinas.
                </p>
              </div>
              <button
                type="button"
                onClick={handleStartNewResumen}
                className="px-4 py-2.5 rounded-xl bg-[#F0C800] hover:bg-amber-400 text-black text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Resumen desde Partes Diarios</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleResumenes.map((rv) => {
                const badge = ESTADO_BADGES[rv.estado] || ESTADO_BADGES.BORRADOR;
                const linkage = resolveResumenLinkage(rv);
                const isAddingThis = addingToLegajoId === rv.id;
                const isFacturado = rv.estado === 'FACTURADO' || Boolean(linkage.facturaNumero);
                return (
                  <div
                    key={rv.id}
                    className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/30 font-mono text-xs font-black">
                          N° {rv.numero}
                        </span>
                        <span className={`px-2 py-0.5 rounded border text-[11px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {rv.periodoTitulo && (
                          <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold">
                            {rv.periodoTitulo}
                          </span>
                        )}
                        {linkage.primaryRental && (
                          <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[11px] font-mono font-bold">
                            Contrato {linkage.primaryRental.numeroContrato}
                          </span>
                        )}
                        {linkage.facturaNumero && (
                          linkage.matchedArca ? (
                            <button
                              type="button"
                              onClick={() => setPreviewArcaInvoice(linkage.matchedArca)}
                              className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-mono font-black cursor-pointer transition inline-flex items-center gap-1"
                              title="Clic para consultar la Factura completa"
                            >
                              <span>✓ Factura {linkage.facturaNumero}</span>
                            </button>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-mono font-black">
                              ✓ Factura {linkage.facturaNumero}
                            </span>
                          )
                        )}
                        {linkage.isPagada ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/25 text-emerald-200 border border-emerald-400/60 text-[11px] font-black uppercase tracking-wide">
                            ✓ PAGADO{linkage.linkedReceipts.length > 0 ? ` (${linkage.linkedReceipts.length})` : ''}
                          </span>
                        ) : linkage.isCobroParcial ? (
                          <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/50 text-[11px] font-black uppercase">
                            COBRO PARCIAL
                          </span>
                        ) : isFacturado ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 text-[11px] font-bold uppercase">
                            PENDIENTE COBRO
                          </span>
                        ) : null}
                        {linkage.linkedReceipts.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPreviewPaymentReceipt(linkage.linkedReceipts[0])}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/50 text-[11px] font-black cursor-pointer transition"
                            title="Ver Recibo / Pago imputado"
                          >
                            <Banknote className="w-3 h-3" />
                            <span>
                              {linkage.linkedReceipts.length > 1
                                ? `Ver Pagos (${linkage.linkedReceipts.length})`
                                : `Ver Recibo ${linkage.linkedReceipts[0].numeroRecibo}`}
                            </span>
                          </button>
                        )}
                        {linkage.isInLegajo && (
                          <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/35 text-[11px] font-bold">
                            ✓ En Legajo
                          </span>
                        )}
                        {rv.pdfAdjunto && (
                          <a
                            href={rv.pdfAdjunto.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold hover:bg-emerald-500/25"
                          >
                            <Paperclip className="w-3 h-3" />
                            <span>PDF Adjunto</span>
                          </a>
                        )}
                      </div>

                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span>Emisión: <strong className="text-slate-200">{formatDateAR(rv.fechaEmision)}</strong></span>
                        {(rv.fechaDesde || rv.fechaHasta) && (
                          <span>
                            Período: <strong className="text-slate-200">{formatDateAR(rv.fechaDesde)} al {formatDateAR(rv.fechaHasta)}</strong>
                          </span>
                        )}
                        <span><strong className="text-slate-200">{rv.filas.length}</strong> líneas</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <div className="text-right pr-2 border-r border-slate-800">
                        <div className="text-[10px] uppercase font-bold text-slate-500">
                          {rv.alicuotaIva > 0 ? `Total c/ IVA (${rv.alicuotaIva}%)` : 'Total Neto'}
                        </div>
                        <div className="text-base font-mono font-black text-emerald-400">
                          $ {formatNumAR(rv.totalGeneral)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddResumenToLegajo(rv)}
                        disabled={Boolean(addingToLegajoId) || isSaving}
                        className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer border transition disabled:opacity-50 ${
                          linkage.isInLegajo
                            ? 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 border-indigo-500/40'
                            : 'bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border-indigo-500/50'
                        }`}
                        title={
                          linkage.isInLegajo
                            ? 'Actualiza el PDF y los vínculos de este Resumen dentro del Legajo de la obra'
                            : 'Genera el PDF A4 y suma este Resumen Valorizado al Legajo de Facturación de la obra'
                        }
                      >
                        {isAddingThis ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FolderPlus className="w-3.5 h-3.5 text-indigo-300" />
                        )}
                        <span>{linkage.isInLegajo ? 'Actualizar Legajo' : 'Sumar al Legajo'}</span>
                      </button>

                      {onInvoiceResumenInArca && !isFacturado && (
                        <button
                          type="button"
                          onClick={() => handleInvoiceResumenDirectly(rv)}
                          disabled={isSaving || Boolean(addingToLegajoId)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                          title={
                            linkage.primaryRental
                              ? `Facturar directo en ARCA y vincular automáticamente con la Factura, el Legajo y el Contrato ${linkage.primaryRental.numeroContrato}`
                              : 'Facturar directo en ARCA y vincular automáticamente con la Factura y el Legajo de la obra'
                          }
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Facturar</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setPreviewDoc(rv)}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Ver A4</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadPdf(rv)}
                        disabled={isExportingPdf}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        title="Descargar PDF A4"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-400" />
                        <span>PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportExcel(rv)}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        title="Exportar planilla a Excel (.xlsx)"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFeedback(null);
                          setOriginFilter('ALL');
                          setEditingDoc(recalcDoc(rv));
                          setBulkRates({});
                        }}
                        className="px-3.5 py-2 rounded-xl bg-[#F0C800] hover:bg-amber-400 text-black text-xs font-black cursor-pointer"
                      >
                        Abrir / Editar
                      </button>

                      {confirmDeleteId === rv.id ? (
                        <div className="flex items-center gap-1 bg-rose-950/70 border border-rose-500/40 rounded-xl px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteResumen(rv.id)}
                            className="text-[11px] font-black text-rose-300 hover:text-white px-1 cursor-pointer"
                          >
                            Borrar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[11px] text-slate-400 hover:text-white px-1 cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(rv.id)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer"
                          title="Eliminar resumen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ==================== EDITOR PLANILLA EXCEL + DOCUMENTO A4 ==================== */
        <div className="space-y-4">
          {/* Top Action Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                ← Volver a la lista
              </button>
              <div>
                <h3 className="text-sm font-black text-white">
                  Planilla Resumen Valorizado N° {editingDoc.numero}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Editá cualquier celda como en Excel. Los totales se calculan en vivo.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewDoc(editingDoc)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Vista Previa A4</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportExcel(editingDoc)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadPdf(editingDoc)}
                disabled={isExportingPdf}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>Descargar PDF</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddResumenToLegajo(editingDoc)}
                disabled={Boolean(addingToLegajoId) || isSaving}
                className="px-3 py-2 rounded-xl bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/45 text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Genera el PDF A4 y suma este Resumen Valorizado al Legajo de Facturación de la obra"
              >
                {addingToLegajoId === editingDoc.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FolderPlus className="w-3.5 h-3.5 text-indigo-300" />
                )}
                <span>Sumar al Legajo</span>
              </button>

              {onInvoiceResumenInArca && editingDoc.estado !== 'FACTURADO' && (
                <button
                  type="button"
                  onClick={() => handleInvoiceResumenDirectly(editingDoc)}
                  disabled={isSaving || Boolean(addingToLegajoId)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Guarda este resumen y lo abre directo en Facturación ARCA (vinculando Factura, Legajo y Contrato de Alquiler)"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Facturar</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => persistResumenToObra(editingDoc)}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Guardar</span>
              </button>
            </div>
          </div>

          {/* Document Metadata & Intro Block */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">N° Documento</label>
                <input
                  type="text"
                  value={editingDoc.numero}
                  onChange={(e) => setEditingDoc({ ...editingDoc, numero: e.target.value })}
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-mono font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Fecha Emisión</label>
                <input
                  type="date"
                  value={editingDoc.fechaEmision}
                  onChange={(e) => setEditingDoc({ ...editingDoc, fechaEmision: e.target.value })}
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Período Desde</label>
                <input
                  type="date"
                  value={editingDoc.fechaDesde || ''}
                  onChange={(e) => {
                    const nextDesde = e.target.value;
                    const updated = syncDraftPartesToScope(
                      editingDoc,
                      editingDoc.periodoId,
                      editingDoc.periodoTitulo,
                      nextDesde,
                      editingDoc.fechaHasta,
                      {
                        applyDateFilterOnExplicitContainer: true,
                        feedbackLabel: `el rango ${formatDateAR(nextDesde)} al ${formatDateAR(editingDoc.fechaHasta)}`,
                      }
                    );
                    setEditingDoc(updated);
                  }}
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Período Hasta</label>
                <input
                  type="date"
                  value={editingDoc.fechaHasta || ''}
                  onChange={(e) => {
                    const nextHasta = e.target.value;
                    const updated = syncDraftPartesToScope(
                      editingDoc,
                      editingDoc.periodoId,
                      editingDoc.periodoTitulo,
                      editingDoc.fechaDesde,
                      nextHasta,
                      {
                        applyDateFilterOnExplicitContainer: true,
                        feedbackLabel: `el rango ${formatDateAR(editingDoc.fechaDesde)} al ${formatDateAR(nextHasta)}`,
                      }
                    );
                    setEditingDoc(updated);
                  }}
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Contenedor (Opcional)</label>
                <select
                  value={editingDoc.periodoId || ''}
                  onChange={(e) => {
                    const pid = e.target.value;
                    const per = periodos.find((p) => p.id === pid);
                    const nextDesde = pid ? per?.fechaDesde || '' : '';
                    const nextHasta = pid ? per?.fechaHasta || '' : '';
                    const updated = syncDraftPartesToScope(
                      editingDoc,
                      pid || undefined,
                      per?.titulo || undefined,
                      nextDesde || undefined,
                      nextHasta || undefined,
                      {
                        applyDateFilterOnExplicitContainer: false,
                        feedbackLabel: per ? `«${per.titulo}»` : 'toda la obra',
                      }
                    );
                    setEditingDoc(updated);
                    setBulkRates({});
                    if (onChangeContenedorId) onChangeContenedorId(pid || 'ALL');
                  }}
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="">Sin contenedor (Toda la obra)</option>
                  {periodos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titulo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Estado</label>
                <select
                  value={editingDoc.estado}
                  onChange={(e) =>
                    setEditingDoc({
                      ...editingDoc,
                      estado: e.target.value as ObraResumenValorizado['estado'],
                    })
                  }
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="BORRADOR">Borrador</option>
                  <option value="ENVIADO">Enviado al Cliente</option>
                  <option value="APROBADO">Aprobado p/ Facturar</option>
                  <option value="FACTURADO">Facturado</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Saludo</label>
                <input
                  type="text"
                  value={editingDoc.saludo}
                  onChange={(e) => setEditingDoc({ ...editingDoc, saludo: e.target.value })}
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>
              <div className="lg:col-span-10">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Texto del Encabezado (aparece arriba de la tabla en el PDF)
                </label>
                <input
                  type="text"
                  value={editingDoc.introduccion}
                  onChange={(e) => setEditingDoc({ ...editingDoc, introduccion: e.target.value })}
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            {editingDoc.pdfAdjunto && (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs">
                <div className="flex items-center gap-2 text-emerald-300">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>
                    Documento PDF adjunto: <strong>{editingDoc.pdfAdjunto.nombre}</strong> ({editingDoc.pdfAdjunto.tamanio})
                  </span>
                </div>
                <a
                  href={editingDoc.pdfAdjunto.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-bold"
                >
                  Abrir PDF ↗
                </a>
              </div>
            )}
          </div>

          {/* Bulk Pricing Helper Bar per Equipment + Reload Partes */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#F0C800]" />
                <span className="text-xs font-black text-white uppercase tracking-wider">
                  Tarifas Rápidas por Máquina & Sincronización de Partes
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleReloadPartesIntoDraft}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sincronizar Partes del Período</span>
                </button>
                <button
                  type="button"
                  onClick={handleApplyFleetPricesToAll}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tomar Precios de Flota</span>
                </button>
              </div>
            </div>

            {uniqueEquiposInDraft.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {uniqueEquiposInDraft.map((item) => (
                  <div
                    key={item.equipo}
                    className="p-2.5 rounded-xl bg-[#0F1115] border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white truncate">{item.equipo}</div>
                      <div className="text-[10px] text-slate-400">
                        {item.rowsCount} filas · Cant: <strong>{formatNumAR(item.totalCant, 2)}</strong>
                        {item.fleetPrice > 0 && (
                          <span className="ml-1 text-emerald-400">
                            · Flota: ${formatNumAR(item.fleetPrice, 0)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        step="any"
                        placeholder={item.currentPrice > 0 ? String(item.currentPrice) : 'P.Unit $'}
                        value={bulkRates[item.equipo] ?? ''}
                        onChange={(e) =>
                          setBulkRates((prev) => ({ ...prev, [item.equipo]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApplyBulkRateForEquipo(item.equipo);
                          }
                        }}
                        className="w-24 bg-[#16191F] border border-slate-700 focus:border-[#F0C800] rounded-lg px-2 py-1 text-xs text-white font-mono text-right focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleApplyBulkRateForEquipo(item.equipo)}
                        className="px-2 py-1 rounded-lg bg-[#F0C800] hover:bg-amber-400 text-black text-[11px] font-black cursor-pointer"
                        title="Aplicar este precio a todas las líneas de esta máquina"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ==================== LEYENDA DE ORIGEN, DETECTOR DE OLVIDADOS Y FILTRO ==================== */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1">
                  Origen de Partes:
                </span>
                <button
                  type="button"
                  onClick={() => setOriginFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg border font-bold transition cursor-pointer ${
                    originFilter === 'ALL'
                      ? 'bg-[#F0C800] text-black border-[#F0C800]'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  Todos ({draftOriginStats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setOriginFilter('VINCULADOS')}
                  className={`px-2.5 py-1 rounded-lg border font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    originFilter === 'VINCULADOS'
                      ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>De Contratos / Facturas ({draftOriginStats.vinculados})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOriginFilter('SIN_VINCULAR')}
                  className={`px-2.5 py-1 rounded-lg border font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    originFilter === 'SIN_VINCULAR'
                      ? 'bg-orange-500 text-black border-orange-400'
                      : draftOriginStats.sinVincular > 0
                      ? 'bg-orange-500/20 text-orange-300 border-orange-500/50 hover:bg-orange-500/30'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Del Período sin Contrato/Factura ({draftOriginStats.sinVincular})</span>
                </button>
                {draftOriginStats.manuales > 0 && (
                  <button
                    type="button"
                    onClick={() => setOriginFilter('MANUAL')}
                    className={`px-2.5 py-1 rounded-lg border font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      originFilter === 'MANUAL'
                        ? 'bg-purple-500/30 text-purple-200 border-purple-400'
                        : 'bg-purple-500/10 text-purple-300 border-purple-500/30 hover:bg-purple-500/20'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    <span>Manuales ({draftOriginStats.manuales})</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Contrato + Factura
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" /> Contrato
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" /> Factura
                </span>
                <span className="inline-flex items-center gap-1 text-orange-300 font-bold">
                  <span className="w-2 h-2 rounded-full bg-orange-400" /> Solo Período (revisar)
                </span>
              </div>
            </div>

            {draftOriginStats.sinVincular > 0 && (
              <div className="px-3 py-2 rounded-xl bg-orange-950/50 border border-orange-500/40 text-xs text-orange-200 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                  <span>
                    Se detectaron <strong>{draftOriginStats.sinVincular} parte(s)</strong> de esta obra y período que{' '}
                    <strong>NO figuran en ningún contrato ni factura</strong> (resaltados en{' '}
                    <strong className="text-orange-300">naranja</strong>). Revisalos para no olvidarte de incluirlos, o quitalos con la × si no corresponden.
                  </span>
                </div>
                {originFilter !== 'SIN_VINCULAR' && (
                  <button
                    type="button"
                    onClick={() => setOriginFilter('SIN_VINCULAR')}
                    className="px-2.5 py-1 rounded-lg bg-orange-500/20 hover:bg-orange-500/35 border border-orange-500/50 text-orange-200 text-[11px] font-black cursor-pointer shrink-0"
                  >
                    Ver solo sin vincular
                  </button>
                )}
              </div>
            )}

            {draftOriginStats.missingPartes.length > 0 && (
              <div className="px-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/35 text-xs text-cyan-200 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>
                    Hay <strong>{draftOriginStats.missingPartes.length} parte(s)</strong> de este período/contratos que todavía no están cargados en esta planilla
                    {draftOriginStats.missingUnlinkedCount > 0
                      ? ` (${draftOriginStats.missingUnlinkedCount} sin contrato ni factura)`
                      : ''}
                    .
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAppendMissingPartes}
                  className="px-3 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-[11px] font-black cursor-pointer shrink-0"
                >
                  + Incorporar faltantes ({draftOriginStats.missingPartes.length})
                </button>
              </div>
            )}
          </div>

          {/* ==================== TABLA EDITABLE TIPO EXCEL ==================== */}
          <datalist id="rv-fleet-machines-list">
            {fleet.map((v) => (
              <option key={v.id} value={v.modeloMarca.toUpperCase()} />
            ))}
          </datalist>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800/90 text-slate-200 border-b border-slate-700">
                    <th className="py-2.5 px-2 text-center font-black w-32 border-r border-slate-700/60">FECHA</th>
                    <th className="py-2.5 px-2 text-center font-black w-24 border-r border-slate-700/60">N°</th>
                    <th className="py-2.5 px-2 text-left font-black w-40 border-r border-slate-700/60">ORIGEN / VÍNCULO</th>
                    <th className="py-2.5 px-2 text-left font-black w-48 border-r border-slate-700/60">EQUIPO</th>
                    <th className="py-2.5 px-2 text-left font-black min-w-[240px] border-r border-slate-700/60">DETALLE</th>
                    <th className="py-2.5 px-2 text-right font-black w-20 border-r border-slate-700/60">CANT.</th>
                    <th className="py-2.5 px-2 text-right font-black w-32 border-r border-slate-700/60">P.UNIT ($)</th>
                    <th className="py-2.5 px-2 text-right font-black w-32 border-r border-slate-700/60">P.TOTAL ($)</th>
                    <th className="py-2.5 px-2 text-center font-black w-24">ACCIONES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {(() => {
                    const indexedRows = editingDoc.filas
                      .map((row, idx) => ({ row, idx, origin: getRowOriginInfo(row) }))
                      .filter(({ origin }) => {
                        if (originFilter === 'ALL') return true;
                        if (originFilter === 'SIN_VINCULAR') return origin.kind === 'PERIODO_SIN_VINCULAR';
                        if (originFilter === 'MANUAL') return origin.kind === 'MANUAL';
                        return (
                          origin.kind === 'CONTRATO_Y_FACTURA' ||
                          origin.kind === 'CONTRATO' ||
                          origin.kind === 'FACTURA' ||
                          origin.kind === 'CONTENEDOR'
                        );
                      });

                    if (indexedRows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-slate-400">
                            {editingDoc.filas.length === 0 ? (
                              <>
                                Sin filas todavía. Tocá <strong>Sincronizar Partes del Período</strong> o <strong>+ Agregar Línea Manual</strong> abajo.
                              </>
                            ) : (
                              <>
                                No hay filas que coincidan con el filtro de origen seleccionado.{' '}
                                <button
                                  type="button"
                                  onClick={() => setOriginFilter('ALL')}
                                  className="text-amber-300 underline font-bold cursor-pointer"
                                >
                                  Ver todas ({editingDoc.filas.length})
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    }

                    return indexedRows.map(({ row, idx, origin }) => {
                      const isDragging = draggingRowId === row.id;
                      const isDropAbove = dragOverState?.rowId === row.id && dragOverState.position === 'above';
                      const isDropBelow = dragOverState?.rowId === row.id && dragOverState.position === 'below';

                      return (
                      <tr
                        key={row.id}
                        draggable={armedDragRowId === row.id || isDragging}
                        onDragStart={(e) => {
                          if (armedDragRowId !== row.id) {
                            e.preventDefault();
                            return;
                          }
                          draggingRowIdRef.current = row.id;
                          setDraggingRowId(row.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', row.id);
                        }}
                        onDragOver={(e) => {
                          const activeSourceId = draggingRowIdRef.current;
                          if (!activeSourceId) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (activeSourceId === row.id) {
                            if (dragOverState) setDragOverState(null);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          const position: 'above' | 'below' =
                            e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
                          setDragOverState((prev) =>
                            prev && prev.rowId === row.id && prev.position === position
                              ? prev
                              : { rowId: row.id, position }
                          );
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const sourceId = draggingRowIdRef.current || e.dataTransfer.getData('text/plain');
                          if (sourceId && sourceId !== row.id) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const position: 'above' | 'below' =
                              e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
                            handleReorderRow(sourceId, row.id, position);
                          }
                          resetRowDragState();
                        }}
                        onDragEnd={resetRowDragState}
                        onMouseUp={() => {
                          pointerDownForDragRef.current = false;
                        }}
                        className={`hover:bg-slate-800/40 transition ${origin.rowCls} ${
                          isDragging ? 'opacity-40 bg-slate-800/70' : ''
                        } ${isDropAbove ? 'shadow-[inset_0_2px_0_0_#F0C800] bg-[#F0C800]/5' : ''} ${
                          isDropBelow ? 'shadow-[inset_0_-2px_0_0_#F0C800] bg-[#F0C800]/5' : ''
                        }`}
                      >
                        <td className="p-1.5 border-r border-slate-800/60">
                          <input
                            type="date"
                            value={row.fecha}
                            onChange={(e) => handleUpdateRow(row.id, { fecha: e.target.value })}
                            className="w-full bg-[#0F1115] border border-slate-800 focus:border-[#F0C800] rounded px-1.5 py-1 text-xs text-white font-mono focus:outline-none"
                          />
                        </td>
                        <td className="p-1.5 border-r border-slate-800/60">
                          <input
                            type="text"
                            value={row.numero}
                            onChange={(e) => handleUpdateRow(row.id, { numero: e.target.value })}
                            placeholder="Ej: 7467"
                            className={`w-full bg-[#0F1115] border border-slate-800 focus:border-[#F0C800] rounded px-1.5 py-1 text-xs text-center font-mono focus:outline-none ${
                              origin.isUnlinkedAlert ? 'text-orange-300 font-black border-orange-500/40' : 'text-cyan-300'
                            }`}
                          />
                        </td>
                        <td
                          className="p-1.5 border-r border-slate-800/60 cursor-grab active:cursor-grabbing"
                          title={origin.tooltip}
                          onMouseEnter={() => setArmedDragRowId(row.id)}
                          onMouseLeave={() => {
                            if (!draggingRowIdRef.current && !pointerDownForDragRef.current) {
                              setArmedDragRowId((prev) => (prev === row.id ? null : prev));
                            }
                          }}
                          onMouseDown={() => {
                            pointerDownForDragRef.current = true;
                            setArmedDragRowId(row.id);
                          }}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-black leading-tight w-fit ${origin.badgeCls}`}
                            >
                              {origin.isUnlinkedAlert && <AlertTriangle className="w-2.5 h-2.5 shrink-0" />}
                              <span>{origin.label}</span>
                            </span>
                            <span
                              className={`text-[10px] truncate max-w-[148px] font-mono ${
                                origin.isUnlinkedAlert ? 'text-orange-300/90 font-semibold' : 'text-slate-400'
                              }`}
                            >
                              {origin.detail}
                            </span>
                          </div>
                        </td>
                        <td className="p-1.5 border-r border-slate-800/60">
                          <input
                            type="text"
                            list="rv-fleet-machines-list"
                            value={row.equipo}
                            onChange={(e) =>
                              handleUpdateRow(row.id, { equipo: e.target.value.toUpperCase() })
                            }
                            placeholder="Ej: EXCAVADORA ZOOMLION"
                            className="w-full bg-[#0F1115] border border-slate-800 focus:border-[#F0C800] rounded px-2 py-1 text-xs text-white font-bold uppercase focus:outline-none"
                          />
                        </td>
                        <td className="p-1.5 border-r border-slate-800/60">
                          <input
                            type="text"
                            value={row.detalle}
                            onChange={(e) =>
                              handleUpdateRow(row.id, { detalle: e.target.value.toUpperCase() })
                            }
                            placeholder="ALQUILER EQUIPO HORA -- EXCAVACIÓN..."
                            className="w-full bg-[#0F1115] border border-slate-800 focus:border-[#F0C800] rounded px-2 py-1 text-xs text-slate-200 uppercase focus:outline-none"
                          />
                        </td>
                        <td className="p-1.5 border-r border-slate-800/60">
                          <input
                            type="number"
                            step="any"
                            value={row.cantidad}
                            onChange={(e) =>
                              handleUpdateRow(row.id, {
                                cantidad: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-full bg-[#0F1115] border border-slate-800 focus:border-[#F0C800] rounded px-1.5 py-1 text-xs text-right text-white font-mono focus:outline-none"
                          />
                        </td>
                        <td className="p-1.5 border-r border-slate-800/60">
                          <input
                            type="number"
                            step="any"
                            value={row.precioUnitario}
                            onChange={(e) =>
                              handleUpdateRow(row.id, {
                                precioUnitario: parseFloat(e.target.value) || 0,
                              })
                            }
                            className={`w-full bg-[#0F1115] border rounded px-2 py-1 text-xs text-right font-mono font-bold focus:outline-none ${
                              row.precioUnitario === 0
                                ? 'border-amber-500/60 text-amber-300'
                                : 'border-slate-800 focus:border-[#F0C800] text-emerald-300'
                            }`}
                          />
                        </td>
                        <td
                          className="p-1.5 border-r border-slate-800/60 text-right font-mono font-black text-white px-2.5 tabular-nums cursor-grab active:cursor-grabbing select-none"
                          onMouseEnter={() => setArmedDragRowId(row.id)}
                          onMouseLeave={() => {
                            if (!draggingRowIdRef.current && !pointerDownForDragRef.current) {
                              setArmedDragRowId((prev) => (prev === row.id ? null : prev));
                            }
                          }}
                          onMouseDown={() => {
                            pointerDownForDragRef.current = true;
                            setArmedDragRowId(row.id);
                          }}
                          title="Arrastrar para reordenar fila"
                        >
                          {formatNumAR(row.precioTotal, 2)}
                        </td>
                        <td className="p-1.5">
                          <div className="flex items-center justify-center gap-1">
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label="Arrastrar fila para reordenar"
                              title="Arrastrar para reordenar fila"
                              onMouseEnter={() => setArmedDragRowId(row.id)}
                              onMouseLeave={() => {
                                if (!draggingRowIdRef.current && !pointerDownForDragRef.current) {
                                  setArmedDragRowId((prev) => (prev === row.id ? null : prev));
                                }
                              }}
                              onMouseDown={() => {
                                pointerDownForDragRef.current = true;
                                setArmedDragRowId(row.id);
                              }}
                              className="p-1 text-slate-500 hover:text-[#F0C800] cursor-grab active:cursor-grabbing rounded transition-colors select-none"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDuplicateRow(idx)}
                              className="p-1 text-slate-400 hover:text-cyan-300 cursor-pointer"
                              title="Duplicar fila"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row.id)}
                              className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                              title="Quitar fila"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* Add Manual Line Bar + Totals Footer */}
            <div className="p-4 bg-[#0F1115] border-t border-slate-800 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              {/* Left: Add Manual Row */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase">
                  ¿Falta un viaje, cemento, flete o un trabajo sin parte?
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={quickAddMachineId}
                    onChange={(e) => setQuickAddMachineId(e.target.value)}
                    className="bg-[#16191F] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                  >
                    <option value="">-- Línea libre (sin equipo o tipear) --</option>
                    {fleet
                      .filter((v) => !v.archivado)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          [{v.codigoInterno}] {v.modeloMarca}
                          {Number(v.precioSugeridoHora || v.precioSugerido || 0) > 0
                            ? ` ($${formatNumAR(Number(v.precioSugeridoHora || v.precioSugerido), 0)})`
                            : ''}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddManualRow}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-[#F0C800] text-white hover:text-black border border-slate-700 text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Agregar Línea Manual</span>
                  </button>
                </div>
              </div>

              {/* Right: Totals Box */}
              <div className="bg-[#16191F] border border-slate-800 rounded-xl p-3.5 min-w-[300px] space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Subtotal Neto ({editingDoc.filas.length} líneas):</span>
                  <span className="font-mono font-bold text-white">
                    $ {formatNumAR(editingDoc.subtotalNeto, 2)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <span>IVA:</span>
                    <select
                      value={editingDoc.alicuotaIva}
                      onChange={(e) =>
                        setEditingDoc(
                          recalcDoc({
                            ...editingDoc,
                            alicuotaIva: parseFloat(e.target.value) || 0,
                          })
                        )
                      }
                      className="bg-[#0F1115] border border-slate-700 rounded px-2 py-0.5 text-xs text-amber-300 font-bold focus:outline-none"
                    >
                      <option value={0}>Sin IVA (0%)</option>
                      <option value={10.5}>10,5%</option>
                      <option value={21}>21%</option>
                    </select>
                  </div>
                  <span className="font-mono text-slate-300">
                    $ {formatNumAR(editingDoc.ivaMonto, 2)}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-[#F0C800]">
                    Total a Cobrar:
                  </span>
                  <span className="text-lg font-mono font-black text-emerald-400">
                    $ {formatNumAR(editingDoc.totalGeneral, 2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Optional Observations */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5">
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Observaciones al pie del documento (Opcional)
            </label>
            <input
              type="text"
              value={editingDoc.observaciones || ''}
              onChange={(e) => setEditingDoc({ ...editingDoc, observaciones: e.target.value })}
              placeholder="Ej: Valores expresados en pesos argentinos sin IVA / Sujeto a conformidad de partes adjuntos..."
              className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* ==================== MODAL VISTA PREVIA A4 (FIEL A LA FOTO) ==================== */}
      {previewDoc && (
        <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-[#12151B] border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3 bg-black/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 print:hidden">
              <div className="flex items-center gap-2 text-white text-sm font-black">
                <FileText className="w-4 h-4 text-[#F0C800]" />
                <span>Vista Previa A4 — Resumen Valorizado N° {previewDoc.numero}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(previewDoc)}
                  disabled={isExportingPdf}
                  className="px-3 py-1.5 rounded-lg bg-[#F0C800] hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Descargar PDF A4</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateAndAttachPdf(previewDoc)}
                  disabled={isAttachingPdf}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  {isAttachingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Adjuntar PDF a la Obra</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* White A4 Sheet Preview */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-900 flex justify-center">
              <div className="bg-white text-slate-900 w-full max-w-[794px] min-h-[1000px] p-8 sm:p-10 shadow-2xl border border-slate-300 space-y-5 font-sans">
                {/* Sheet Header: Logo + Diagonal Stripes */}
                <div className="flex items-center justify-between gap-6">
                  <div className="shrink-0">
                    <Logo variant="horizontal" theme="light" size="md" showSlogan={true} />
                  </div>
                  <div
                    className="flex-1 h-4"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(-55deg, #64748b 0px, #64748b 6px, transparent 6px, transparent 11px)',
                    }}
                  />
                </div>

                {/* Date & Number */}
                <div className="text-right text-xs font-bold text-slate-700 leading-tight">
                  <div>FECHA: {formatDateAR(previewDoc.fechaEmision)}</div>
                  <div>N°: {previewDoc.numero}</div>
                </div>

                {/* Greeting & Intro */}
                <div className="text-xs sm:text-[13px] text-slate-800 space-y-1 leading-relaxed">
                  <p>{previewDoc.saludo || 'Estimado,'}</p>
                  <p className="indent-12">{previewDoc.introduccion}</p>
                </div>

                {/* Exact Table from Photo */}
                <table className="w-full border-collapse border border-slate-600 text-[10px] sm:text-[11px]">
                  <thead>
                    <tr className="bg-slate-300 text-slate-900 font-bold">
                      <th className="border border-slate-600 py-1.5 px-1.5 text-center w-[78px]">FECHA</th>
                      <th className="border border-slate-600 py-1.5 px-1.5 text-center w-[58px]">N°</th>
                      <th className="border border-slate-600 py-1.5 px-2 text-center w-[135px]">EQUIPO</th>
                      <th className="border border-slate-600 py-1.5 px-2 text-center">DETALLE</th>
                      <th className="border border-slate-600 py-1.5 px-1.5 text-center w-[52px]">CANT.</th>
                      <th className="border border-slate-600 py-1.5 px-2 text-center w-[86px]">P.UNIT</th>
                      <th className="border border-slate-600 py-1.5 px-2 text-center w-[86px]">P.TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewDoc.filas.map((row, idx) => (
                      <tr key={row.id} className={idx % 2 === 1 ? 'bg-slate-100/80' : 'bg-white'}>
                        <td className="border border-slate-500 py-1.5 px-1.5 text-center whitespace-nowrap">
                          {formatDateAR(row.fecha)}
                        </td>
                        <td className="border border-slate-500 py-1.5 px-1.5 text-center whitespace-nowrap">
                          {row.numero || '-'}
                        </td>
                        <td className="border border-slate-500 py-1.5 px-2 font-semibold uppercase">
                          {row.equipo}
                        </td>
                        <td className="border border-slate-500 py-1.5 px-2 uppercase">
                          {row.detalle}
                        </td>
                        <td className="border border-slate-500 py-1.5 px-1.5 text-right tabular-nums whitespace-nowrap">
                          {formatNumAR(row.cantidad, 2)}
                        </td>
                        <td className="border border-slate-500 py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                          {formatNumAR(row.precioUnitario, 2)} $
                        </td>
                        <td className="border border-slate-500 py-1.5 px-2 text-right font-semibold tabular-nums whitespace-nowrap">
                          {formatNumAR(row.precioTotal, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals Summary */}
                <div className="flex justify-end pt-1">
                  <div className="w-72 border border-slate-600 text-xs">
                    {previewDoc.alicuotaIva > 0 ? (
                      <>
                        <div className="flex justify-between px-3 py-1.5 bg-slate-100 border-b border-slate-500 font-semibold">
                          <span>SUBTOTAL NETO:</span>
                          <span className="tabular-nums">$ {formatNumAR(previewDoc.subtotalNeto, 2)}</span>
                        </div>
                        <div className="flex justify-between px-3 py-1.5 bg-white border-b border-slate-500">
                          <span>IVA ({previewDoc.alicuotaIva}%):</span>
                          <span className="tabular-nums">$ {formatNumAR(previewDoc.ivaMonto, 2)}</span>
                        </div>
                        <div className="flex justify-between px-3 py-2 bg-slate-300 font-black text-sm">
                          <span>TOTAL FINAL:</span>
                          <span className="tabular-nums">$ {formatNumAR(previewDoc.totalGeneral, 2)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between px-3 py-2 bg-slate-300 font-black text-sm">
                        <span>TOTAL RESUMEN:</span>
                        <span className="tabular-nums">$ {formatNumAR(previewDoc.subtotalNeto, 2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {previewDoc.observaciones?.trim() && (
                  <p className="text-[11px] italic text-slate-600 pt-2">
                    Obs.: {previewDoc.observaciones}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ObraFacturaPreviewModal
        invoice={previewArcaInvoice}
        allReceipts={customerReceipts}
        rentals={rentals}
        partesDiarios={fullPartesPool}
        onClose={() => setPreviewArcaInvoice(null)}
        onInspectReceipt={(rec) => setPreviewPaymentReceipt(rec)}
        onNavigateToArca={onNavigateToArca}
        onNavigateToCobranzas={onNavigateToCobranzas}
      />

      <ObraReceiptPreviewModal
        receipt={previewPaymentReceipt}
        allInvoices={arcaInvoices}
        onClose={() => setPreviewPaymentReceipt(null)}
        onInspectInvoice={(inv) => {
          setPreviewPaymentReceipt(null);
          setPreviewArcaInvoice(inv);
        }}
        onNavigateToCobranzas={onNavigateToCobranzas}
      />
    </div>
  );
};
