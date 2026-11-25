import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  ExternalLink,
  FileText,
  Fuel,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  RotateCw,
  Search,
  Share2,
  Smartphone,
  Trash2,
  Unlink,
  Upload,
  Video,
  X,
  ClipboardList,
  Sparkles,
  Ticket,
} from 'lucide-react';
import {
  DocumentBagCategory,
  DocumentBagItem,
  DocumentBagLinkTargetType,
  FuelDispensary,
  ParteDiario,
  UserSession,
} from '../types';
import { uploadImageToCloudflareR2, uploadPreoptimizedImageToCloudflareR2 } from '../services/api';
import { convertPdfToOptimizedImages } from '../services/pdfToImageOptimizer';

interface BolsaDocumentosSectionProps {
  items: DocumentBagItem[];
  partesDiarios: ParteDiario[];
  fuelVouchers: FuelDispensary[];
  userSession?: UserSession | null;
  analyzingDocId?: string | null;
  onAddItems: (newItems: DocumentBagItem[]) => Promise<boolean>;
  onUpdateItem: (updatedItem: DocumentBagItem) => Promise<boolean>;
  onDeleteItem: (id: string) => Promise<boolean>;
  onAnalyzeWithAI?: (item: DocumentBagItem, overrideCategory?: Exclude<DocumentBagCategory, 'OTRO'>) => void;
  onOpenParteDetail?: (parte: ParteDiario) => void;
  onOpenFuelVoucherDetail?: (voucher: FuelDispensary) => void;
  onShowToast: (msg: string) => void;
}

const CATEGORY_OPTIONS: Array<{
  id: DocumentBagCategory;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}> = [
  {
    id: 'COMBUSTIBLE',
    label: 'Carga Comb.',
    shortLabel: 'Carga Comb.',
    icon: Fuel,
    accentClass: 'text-[#F0C800]',
  },
  {
    id: 'VALE_COMBUSTIBLE',
    label: 'Vale Comb.',
    shortLabel: 'Vale',
    icon: Ticket,
    accentClass: 'text-orange-400',
  },
  {
    id: 'FACTURA',
    label: 'Factura',
    shortLabel: 'Factura',
    icon: Receipt,
    accentClass: 'text-emerald-400',
  },
  {
    id: 'REMITO',
    label: 'Remito',
    shortLabel: 'Remito',
    icon: FileText,
    accentClass: 'text-cyan-400',
  },
  {
    id: 'PARTE_DIARIO',
    label: 'Parte Diario',
    shortLabel: 'Parte',
    icon: ClipboardList,
    accentClass: 'text-amber-400',
  },
  {
    id: 'OTRO',
    label: 'Otro Doc.',
    shortLabel: 'Otro',
    icon: ImageIcon,
    accentClass: 'text-slate-300',
  },
];

const CATEGORY_LABEL_MAP: Record<DocumentBagCategory, string> = {
  COMBUSTIBLE: 'Carga Combustible',
  VALE_COMBUSTIBLE: 'Vale Combustible',
  FACTURA: 'Factura',
  REMITO: 'Remito',
  PARTE_DIARIO: 'Parte Diario',
  OTRO: 'Otro',
};

const LINK_TARGET_LABEL_MAP: Record<DocumentBagLinkTargetType, string> = {
  PARTE_DIARIO: 'Vinculado a Parte Diario',
  FUEL_VOUCHER: 'Vinculado a Expendio Comb.',
  ISSUED_VOUCHER: 'Vinculado a Vale Emitido',
  FACTURA_VENTA: 'Vinculado a Factura Venta',
  FACTURA_COMPRA: 'Vinculado a Factura Compra',
  REMITO: 'Vinculado a Remito',
};

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '-';
  if (dateStr.includes('-')) {
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function buildDateSortKey(dateStr?: string): string {
  if (!dateStr) return '0000-00-00';
  const clean = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return clean.slice(0, 10);
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return clean;
}

export const BolsaDocumentosSection: React.FC<BolsaDocumentosSectionProps> = ({
  items,
  partesDiarios,
  fuelVouchers,
  userSession,
  analyzingDocId = null,
  onAddItems,
  onUpdateItem,
  onDeleteItem,
  onAnalyzeWithAI,
  onOpenParteDetail,
  onOpenFuelVoucherDetail,
  onShowToast,
}) => {
  // Capture Form State
  const [selectedCategory, setSelectedCategory] = useState<DocumentBagCategory>('COMBUSTIBLE');
  const [autoAnalyzeOnCapture, setAutoAnalyzeOnCapture] = useState<boolean>(true);
  const [noteInput, setNoteInput] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [otroAnalyzeModalItem, setOtroAnalyzeModalItem] = useState<DocumentBagItem | null>(null);

  // Filters State
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDIENTE' | 'VINCULADO'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | DocumentBagCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Link Modal State
  const [itemToLink, setItemToLink] = useState<DocumentBagItem | null>(null);
  const [linkTab, setLinkTab] = useState<DocumentBagLinkTargetType>('FUEL_VOUCHER');
  const [linkSearch, setLinkSearch] = useState<string>('');
  const [isSavingLink, setIsSavingLink] = useState<boolean>(false);

  // Lightbox & Delete State
  const [lightboxItem, setLightboxItem] = useState<DocumentBagItem | null>(null);
  const [lightboxRotation, setLightboxRotation] = useState<number>(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState<string>('');
  const [copiedMobileLink, setCopiedMobileLink] = useState<boolean>(false);

  // Live In-Browser Camera Modal State
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState<boolean>(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Native file inputs (mobile rear camera + gallery)
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Clean up camera stream on close/unmount
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!isLiveCameraOpen || capturedPreviewUrl) {
      stopCameraStream();
      return;
    }

    let cancelled = false;
    const startCamera = async () => {
      setCameraError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Tu navegador o vista integrada no soporta cámara web directa. Usá el botón "Sacar Foto (Cámara Celu)" para abrir la cámara de tu teléfono.'
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: cameraFacingMode },
            width: { ideal: 1600 },
            height: { ideal: 1200 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        if (cancelled) return;
        setCameraError(
          err?.name === 'NotAllowedError'
            ? 'Permiso de cámara bloqueado por el navegador. Podés usar el botón "Sacar Foto (Cámara Celu)" que abre directo la cámara nativa de tu teléfono.'
            : 'No se pudo iniciar la cámara web en vivo. Probá con "Sacar Foto (Cámara Celu)".'
        );
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [isLiveCameraOpen, cameraFacingMode, capturedPreviewUrl]);

  // Process and upload one or more images or PDFs with aggressive WebP optimization
  const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  const isImageFile = (f: File) => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(f.name);

  const handleFilesSelected = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => isImageFile(f) || isPdfFile(f));
    if (fileArray.length === 0) {
      onShowToast('Seleccioná al menos una imagen o archivo PDF válido.');
      return;
    }

    setIsUploading(true);
    const uploadedDocs: DocumentBagItem[] = [];
    let pdfPagesConverted = 0;
    let truncatedPdfNotice = false;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const cleanNote = noteInput.trim();
    const authorName = userSession?.nombre || userSession?.username || 'Móvil';

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];

        if (isPdfFile(file)) {
          setUploadProgressText(`Convirtiendo PDF "${file.name}" a WebP optimizado...`);
          let pdfResult;
          try {
            pdfResult = await convertPdfToOptimizedImages(file, {
              maxDimension: 1600,
              quality: 0.82,
              maxPages: 15,
              onProgress: (pageNum, total) => {
                setUploadProgressText(
                  `Optimizando PDF "${file.name}" (hoja ${pageNum} de ${total})...`
                );
              },
            });
          } catch (pdfErr: any) {
            onShowToast(pdfErr?.message || `No se pudo leer el PDF "${file.name}".`);
            continue;
          }

          if (pdfResult.truncated) {
            truncatedPdfNotice = true;
          }

          const pdfBaseTitle = file.name.replace(/\.pdf$/i, '').trim() || 'Documento PDF';

          for (const page of pdfResult.pages) {
            setUploadProgressText(
              pdfResult.pages.length > 1
                ? `Subiendo hoja ${page.pageNumber} de ${pdfResult.pages.length} (${page.optimizedSizeKB} KB)...`
                : `Subiendo PDF optimizado (${page.optimizedSizeKB} KB)...`
            );

            const targetFileName = `${selectedCategory.toLowerCase()}_pdf_p${page.pageNumber}_${Date.now()}_${i}.${page.contentType === 'image/webp' ? 'webp' : 'jpg'}`;
            const uploadRes = await uploadPreoptimizedImageToCloudflareR2(
              page.base64,
              targetFileName,
              page.contentType,
              'bolsa-documentos'
            );

            if (!uploadRes.success || !uploadRes.url) {
              onShowToast(uploadRes.error || `No se pudo subir la hoja ${page.pageNumber} de "${file.name}".`);
              continue;
            }

            const pageSuffix = pdfResult.totalPdfPages > 1 ? ` (Pág. ${page.pageNumber}/${pdfResult.totalPdfPages})` : '';
            const itemNote = cleanNote
              ? `${cleanNote}${pageSuffix}`
              : `PDF: ${pdfBaseTitle}${pageSuffix}`;

            const newItem: DocumentBagItem = {
              id: `DOC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
              categoria: selectedCategory,
              url: uploadRes.url,
              nota: itemNote,
              fechaCaptura: todayStr,
              horaCaptura: timeStr,
              createdAt: new Date().toISOString(),
              uploadedBy: authorName,
              originalSizeKB: page.originalShareKB,
              optimizedSizeKB: page.optimizedSizeKB,
              reductionPercentage: page.reductionPercentage,
              estado: 'PENDIENTE',
            };
            uploadedDocs.push(newItem);
            pdfPagesConverted++;
          }
          continue;
        }

        setUploadProgressText(
          fileArray.length > 1
            ? `Optimizando y subiendo foto ${i + 1} de ${fileArray.length}...`
            : 'Optimizando peso y subiendo foto...'
        );

        const uploadRes = await uploadImageToCloudflareR2(
          file,
          `${selectedCategory.toLowerCase()}_${Date.now()}_${i}.webp`,
          file.type || 'image/jpeg',
          {
            maxWidth: 1200,
            maxHeight: 1200,
            quality: 0.72,
            format: 'image/webp',
            preserveTransparency: false,
          },
          'bolsa-documentos'
        );

        if (!uploadRes.success || !uploadRes.url) {
          onShowToast(uploadRes.error || `No se pudo subir "${file.name}".`);
          continue;
        }

        const newItem: DocumentBagItem = {
          id: `DOC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          categoria: selectedCategory,
          url: uploadRes.url,
          nota: cleanNote || undefined,
          fechaCaptura: todayStr,
          horaCaptura: timeStr,
          createdAt: new Date().toISOString(),
          uploadedBy: authorName,
          originalSizeKB: uploadRes.originalSizeKB,
          optimizedSizeKB: uploadRes.optimizedSizeKB,
          reductionPercentage: uploadRes.reductionPercentage,
          estado: 'PENDIENTE',
        };
        uploadedDocs.push(newItem);
      }

      if (uploadedDocs.length > 0) {
        const savedOk = await onAddItems(uploadedDocs);
        if (savedOk) {
          setNoteInput('');
          const last = uploadedDocs[uploadedDocs.length - 1];
          const weightInfo =
            last.optimizedSizeKB !== undefined
              ? ` (${last.optimizedSizeKB} KB${last.reductionPercentage ? `, -${last.reductionPercentage}%` : ''})`
              : '';
          if (uploadedDocs.length === 1) {
            onShowToast(
              pdfPagesConverted > 0
                ? `PDF convertido a WebP y guardado en Docs${weightInfo}.`
                : `Foto de ${CATEGORY_LABEL_MAP[selectedCategory]} guardada en la Bolsa${weightInfo}.`
            );
          } else {
            onShowToast(
              pdfPagesConverted > 0
                ? `${uploadedDocs.length} hojas/fotos optimizadas en WebP y guardadas en Docs.${truncatedPdfNotice ? ' (Se tomaron hasta 15 páginas por PDF.)' : ''}`
                : `${uploadedDocs.length} fotos optimizadas y guardadas en la Bolsa.`
            );
          }

          // Si el usuario tiene activado el análisis automático y subió 1 doc analizable, abrir IA directo
          if (
            autoAnalyzeOnCapture &&
            uploadedDocs.length === 1 &&
            uploadedDocs[0].categoria !== 'OTRO' &&
            onAnalyzeWithAI
          ) {
            onAnalyzeWithAI(uploadedDocs[0]);
          }
        }
      }
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handleCaptureLivePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const previewUrl = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedPreviewUrl(previewUrl);
      },
      'image/jpeg',
      0.92
    );
  };

  const handleConfirmLiveCapture = async () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `camara_${Date.now()}.jpg`, { type: 'image/jpeg' });
    if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
    setCapturedPreviewUrl(null);
    setCapturedBlob(null);
    setIsLiveCameraOpen(false);
    await handleFilesSelected([file]);
  };

  const handleCloseLiveCamera = () => {
    if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
    setCapturedPreviewUrl(null);
    setCapturedBlob(null);
    setCameraError(null);
    setIsLiveCameraOpen(false);
  };

  const handleCopyMobileUrl = async () => {
    const mobileUrl = `${window.location.origin}/?vista=bolsa`;
    try {
      await navigator.clipboard.writeText(mobileUrl);
      setCopiedMobileLink(true);
      onShowToast('Enlace directo para celular copiado. Abrilo desde tu teléfono.');
      setTimeout(() => setCopiedMobileLink(false), 2500);
    } catch {
      onShowToast(`Link directo para celu: ${mobileUrl}`);
    }
  };

  // Stats summary
  const stats = useMemo(() => {
    const total = items.length;
    const pendientes = items.filter((d) => d.estado === 'PENDIENTE').length;
    const vinculados = items.filter((d) => d.estado === 'VINCULADO').length;
    const totalOriginalKB = items.reduce((acc, d) => acc + (d.originalSizeKB || 0), 0);
    const totalOptimizedKB = items.reduce((acc, d) => acc + (d.optimizedSizeKB || 0), 0);
    const savedMB = Math.max(0, (totalOriginalKB - totalOptimizedKB) / 1024);
    return { total, pendientes, vinculados, totalOptimizedKB, savedMB };
  }, [items]);

  // Filtered list of bag documents (newest first)
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...items]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .filter((item) => {
        if (statusFilter !== 'ALL' && item.estado !== statusFilter) return false;
        if (categoryFilter !== 'ALL' && item.categoria !== categoryFilter) return false;
        if (!q) return true;
        const searchable = [
          CATEGORY_LABEL_MAP[item.categoria],
          item.nota || '',
          item.fechaCaptura || '',
          item.uploadedBy || '',
          item.linkedTargetLabel || '',
          item.linkedTargetId || '',
        ]
          .join(' ')
          .toLowerCase();
        return searchable.includes(q);
      });
  }, [items, statusFilter, categoryFilter, searchQuery]);

  // Open Linking Modal with smart default tab
  const openLinkModal = (item: DocumentBagItem) => {
    setItemToLink(item);
    setLinkSearch('');
    if (item.linkedTargetType) {
      setLinkTab(item.linkedTargetType);
    } else if (item.categoria === 'COMBUSTIBLE') {
      setLinkTab('FUEL_VOUCHER');
    } else {
      setLinkTab('PARTE_DIARIO');
    }
  };

  // Filtered candidate Partes Diarios for linking
  const candidatePartes = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    return [...partesDiarios]
      .sort((a, b) => buildDateSortKey(b.fecha).localeCompare(buildDateSortKey(a.fecha)))
      .filter((p) => {
        if (!q) return true;
        const haystack = [
          p.numParte,
          p.id,
          p.fecha,
          p.codigoEquipo,
          p.marcaModelo,
          p.nombreApellido,
          p.obra,
          p.codigoObra,
          p.detalleTipo,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 60);
  }, [partesDiarios, linkSearch]);

  // Filtered candidate Fuel Vouchers for linking
  const candidateFuelVouchers = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    return [...fuelVouchers]
      .sort((a, b) => buildDateSortKey(b.fecha).localeCompare(buildDateSortKey(a.fecha)))
      .filter((v) => {
        if (!q) return true;
        const haystack = [
          v.id,
          v.numTicket,
          v.numOrden,
          v.numVale,
          v.fecha,
          v.codigoEquipo,
          v.marcaModelo,
          v.patente,
          v.nombreApellido,
          v.deposito,
          v.tipoComb,
          String(v.cantidad || ''),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 60);
  }, [fuelVouchers, linkSearch]);

  const handleConfirmLink = async (
    targetType: DocumentBagLinkTargetType,
    targetId: string,
    targetLabel: string
  ) => {
    if (!itemToLink) return;
    setIsSavingLink(true);
    try {
      const updated: DocumentBagItem = {
        ...itemToLink,
        estado: 'VINCULADO',
        linkedTargetType: targetType,
        linkedTargetId: targetId,
        linkedTargetLabel: targetLabel,
        linkedAt: new Date().toISOString(),
      };
      const ok = await onUpdateItem(updated);
      if (ok) {
        setItemToLink(null);
        if (lightboxItem?.id === updated.id) {
          setLightboxItem(updated);
        }
        onShowToast(`Documento vinculado a ${targetLabel}.`);
      }
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleUnlink = async (item: DocumentBagItem) => {
    const updated: DocumentBagItem = {
      ...item,
      estado: 'PENDIENTE',
      linkedTargetType: undefined,
      linkedTargetId: undefined,
      linkedTargetLabel: undefined,
      linkedAt: undefined,
    };
    const ok = await onUpdateItem(updated);
    if (ok) {
      if (lightboxItem?.id === updated.id) {
        setLightboxItem(updated);
      }
      onShowToast('Vínculo quitado. El documento volvió a pendientes.');
    }
  };

  const handleSaveInlineNote = async (item: DocumentBagItem) => {
    const updated: DocumentBagItem = {
      ...item,
      nota: editingNoteValue.trim() || undefined,
    };
    const ok = await onUpdateItem(updated);
    if (ok) {
      setEditingNoteId(null);
      if (lightboxItem?.id === updated.id) {
        setLightboxItem(updated);
      }
      onShowToast('Nota actualizada.');
    }
  };

  const handleOpenLinkedRecord = (item: DocumentBagItem) => {
    if (!item.linkedTargetId) return;
    if (item.linkedTargetType === 'PARTE_DIARIO' && onOpenParteDetail) {
      const found = partesDiarios.find((p) => p.id === item.linkedTargetId);
      if (found) {
        onOpenParteDetail(found);
      } else {
        onShowToast('No se encontró ese Parte Diario en la lista actual.');
      }
    } else if (item.linkedTargetType === 'FUEL_VOUCHER' && onOpenFuelVoucherDetail) {
      const found = fuelVouchers.find((v) => v.id === item.linkedTargetId);
      if (found) {
        onOpenFuelVoucherDetail(found);
      } else {
        onShowToast('No se encontró ese Expendio de Combustible en la lista actual.');
      }
    }
  };

  return (
    <div className="space-y-4 pb-10">
      {/* Hidden native inputs for Phone Camera (rear camera) & Gallery */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFilesSelected(e.target.files);
          }
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFilesSelected(e.target.files);
          }
        }}
      />

      {/* Top Header & Direct Mobile Link */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <Smartphone className="w-4 h-4" />
            <span>Módulo Documentos · Acceso Móvil</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Bolsa de Documentos
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Sacá fotos rápidas con la cámara de tu teléfono o subí archivos PDF (facturas, remitos, partes). Se convierten y comprimen automático en WebP para cargar al instante, pesar muy poco y vincularlos fácil.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-4 text-xs text-slate-300 font-mono border border-slate-800 bg-[#11141A] rounded-xl px-3.5 py-2.5">
            <div>
              <span className="text-[10px] uppercase text-slate-500 block">Total Fotos</span>
              <strong className="text-sm text-white font-black">{stats.total}</strong>
            </div>
            <div className="w-px h-7 bg-slate-800" />
            <div>
              <span className="text-[10px] uppercase text-slate-500 block">Sin Vincular</span>
              <strong className="text-sm text-[#F0C800] font-black">{stats.pendientes}</strong>
            </div>
            <div className="w-px h-7 bg-slate-800" />
            <div>
              <span className="text-[10px] uppercase text-slate-500 block">Vinculadas</span>
              <strong className="text-sm text-emerald-400 font-black">{stats.vinculados}</strong>
            </div>
            {stats.savedMB > 0.05 && (
              <>
                <div className="w-px h-7 bg-slate-800 hidden sm:block" />
                <div className="hidden sm:block">
                  <span className="text-[10px] uppercase text-slate-500 block">Ahorrado</span>
                  <strong className="text-sm text-cyan-400 font-black">{stats.savedMB.toFixed(1)} MB</strong>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyMobileUrl}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
            title="Copiar enlace directo para abrir desde el celular"
          >
            {copiedMobileLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-[#F0C800]" />}
            <span>{copiedMobileLink ? '¡Link copiado!' : 'Link directo p/ Celu'}</span>
          </button>
        </div>
      </div>

      {/* SIMPLE CAPTURE FORM (Mobile-First) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFilesSelected(e.dataTransfer.files);
          }
        }}
        className={`bg-[#16191F] border rounded-2xl p-4 sm:p-5 space-y-4 transition ${
          isDraggingOver
            ? 'border-[#F0C800] bg-[#F0C800]/5'
            : 'border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#F0C800]" />
            <h3 className="text-sm font-black text-white uppercase tracking-wide">
              1. Elegí el tipo de documento y subilo (Foto o PDF)
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onAnalyzeWithAI && (
              <button
                type="button"
                onClick={() => setAutoAnalyzeOnCapture((prev) => !prev)}
                className={`min-h-[34px] px-3 py-1 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  autoAnalyzeOnCapture
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-[#101318] border-slate-700 text-slate-400 hover:text-white'
                }`}
                title="Si está activo, al subir una foto o PDF de 1 hoja la IA lo lee y deja el formulario lleno listo para aceptar"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Analizar con IA al subir: {autoAnalyzeOnCapture ? 'SÍ' : 'NO'}</span>
              </button>
            )}
            <span className="text-[11px] font-mono text-slate-400">
              WebP Ultra-Liviano · Fotos y PDF
            </span>
          </div>
        </div>

        {/* Category Selector: 6 big touch buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {CATEGORY_OPTIONS.map((cat) => {
            const Icon = cat.icon;
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                disabled={isUploading}
                onClick={() => setSelectedCategory(cat.id)}
                className={`min-h-[48px] px-3 py-2.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  active
                    ? 'bg-[#F0C800] text-[#1A1C20] border-[#F0C800] shadow-lg shadow-[#F0C800]/15'
                    : 'bg-[#101318] text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#1A1C20]' : cat.accentClass}`} />
                <span className="truncate">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Optional Note + Action Buttons */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={noteInput}
              disabled={isUploading}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Nota opcional (ej: YPF vale 412, Camión 15, Remito áridos...)"
              className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#0F1115] border border-slate-800 focus:border-[#F0C800] text-sm text-white placeholder:text-slate-500 focus:outline-none transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 md:flex items-center gap-2.5 shrink-0">
            {/* Primary: Native Mobile Camera (Rear) */}
            <button
              type="button"
              disabled={isUploading}
              onClick={() => cameraInputRef.current?.click()}
              className="min-h-[48px] px-5 py-3 rounded-xl bg-[#F0C800] hover:bg-[#F5D63D] disabled:opacity-60 text-[#1D1E22] font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#F0C800]/15 transition cursor-pointer active:scale-[0.99]"
            >
              {isUploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Camera className="w-5 h-5 stroke-[2.5]" />
              )}
              <span>Sacar Foto (Cámara)</span>
            </button>

            {/* Secondary: Live In-App Web Camera */}
            <button
              type="button"
              disabled={isUploading}
              onClick={() => setIsLiveCameraOpen(true)}
              className="min-h-[48px] px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white border border-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              title="Abrir visor de cámara web en pantalla"
            >
              <Video className="w-4 h-4 text-emerald-400" />
              <span>Cámara Web</span>
            </button>

            {/* Tertiary: Phone Gallery / Multiple files & PDFs */}
            <button
              type="button"
              disabled={isUploading}
              onClick={() => galleryInputRef.current?.click()}
              className="min-h-[48px] px-4 py-3 rounded-xl bg-[#101318] hover:bg-slate-800 disabled:opacity-60 text-slate-200 border border-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              title="Subir fotos, imágenes o archivos PDF (se convierten a WebP optimizado)"
            >
              <Upload className="w-4 h-4 text-cyan-400" />
              <span>Galería / PDF</span>
            </button>
          </div>
        </div>

        {(isUploading || analyzingDocId) && (
          <div className="flex items-center gap-2.5 text-xs font-mono text-[#F0C800] bg-[#F0C800]/10 border border-[#F0C800]/30 rounded-xl px-4 py-3">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>
              {analyzingDocId
                ? 'Analizando foto con IA y completando el formulario automáticamente...'
                : uploadProgressText || 'Optimizando y guardando en la Bolsa...'}
            </span>
          </div>
        )}
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Status filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `Todas (${stats.total})` },
                { id: 'PENDIENTE', label: `Sin vincular (${stats.pendientes})` },
                { id: 'VINCULADO', label: `Vinculadas (${stats.vinculados})` },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  statusFilter === st.id
                    ? 'bg-[#F0C800]/15 text-[#F0C800] border-[#F0C800]/40'
                    : 'bg-[#101318] text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nota, fecha o vínculo..."
              className="w-full min-h-[42px] pl-10 pr-8 py-2 rounded-xl bg-[#0F1115] border border-slate-800 focus:border-[#F0C800] text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              categoryFilter === 'ALL'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            Todos los tipos
          </button>
          {CATEGORY_OPTIONS.map((cat) => {
            const count = items.filter((d) => d.categoria === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  categoryFilter === cat.id
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <span>{cat.label}</span>
                <span className="text-[11px] font-mono text-slate-400">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* DOCUMENT BAG GRID — ALL TOGETHER */}
      {filteredItems.length === 0 ? (
        <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/90 text-[#F0C800] flex items-center justify-center mx-auto">
            <Camera className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-white">
            {items.length === 0
              ? 'Tu Bolsa de Documentos está vacía'
              : 'No hay fotos con ese filtro'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            {items.length === 0
              ? 'Elegí si es Combustible, Factura, Remito o Parte Diario y tocá "Sacar Foto (Cámara)" para guardar tu primer comprobante optimizado.'
              : 'Probá cambiar el filtro de estado o limpiar el buscador para ver todas tus fotos juntas.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5">
          {filteredItems.map((item) => {
            const isLinked = item.estado === 'VINCULADO' && item.linkedTargetId;
            const catMeta = CATEGORY_OPTIONS.find((c) => c.id === item.categoria);
            const isDeleting = confirmDeleteId === item.id;
            const isEditingNote = editingNoteId === item.id;

            return (
              <article
                key={item.id}
                className="bg-[#16191F] border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between transition hover:border-slate-700"
              >
                {/* Thumbnail Preview */}
                <button
                  type="button"
                  onClick={() => {
                    setLightboxItem(item);
                    setLightboxRotation(0);
                  }}
                  className="relative aspect-[4/3] w-full bg-[#0B0D11] overflow-hidden cursor-pointer group block text-left"
                >
                  <img
                    src={item.url}
                    alt={`${CATEGORY_LABEL_MAP[item.categoria]} ${item.nota || ''}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                  <span className="absolute bottom-2 right-2 text-[11px] font-mono font-bold text-white/90 bg-black/70 px-2 py-0.5 rounded">
                    Ampliar
                  </span>
                </button>

                {/* Body */}
                <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    {/* Crisp unboxed metadata line */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={`font-black uppercase tracking-wide ${catMeta?.accentClass || 'text-white'}`}>
                        {CATEGORY_LABEL_MAP[item.categoria]}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {formatShortDate(item.fechaCaptura)}
                        {item.horaCaptura ? ` · ${item.horaCaptura}` : ''}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-500">
                      {item.optimizedSizeKB ? `${item.optimizedSizeKB} KB` : 'WebP'}
                      {item.reductionPercentage ? ` (-${item.reductionPercentage}%)` : ''}
                      {item.uploadedBy ? ` · ${item.uploadedBy}` : ''}
                    </div>

                    {/* Note or Inline Note Editor */}
                    {isEditingNote ? (
                      <div className="flex items-center gap-1.5 pt-1">
                        <input
                          type="text"
                          value={editingNoteValue}
                          onChange={(e) => setEditingNoteValue(e.target.value)}
                          placeholder="Agregar nota..."
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveInlineNote(item);
                            if (e.key === 'Escape') setEditingNoteId(null);
                          }}
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#0F1115] border border-[#F0C800] text-xs text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveInlineNote(item)}
                          className="p-1.5 rounded-lg bg-emerald-600 text-white cursor-pointer"
                          title="Guardar nota"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingNoteId(null)}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                          title="Cancelar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(item.id);
                          setEditingNoteValue(item.nota || '');
                        }}
                        className="w-full text-left text-xs text-slate-200 hover:text-[#F0C800] transition cursor-pointer line-clamp-2 min-h-[20px]"
                        title="Tocá para editar la nota"
                      >
                        {item.nota ? item.nota : <span className="text-slate-500 italic">+ Agregar nota</span>}
                      </button>
                    )}

                    {/* Link status block */}
                    {isLinked && (
                      <div className="pt-1.5 border-t border-slate-800/80 space-y-1">
                        <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                          <Link2 className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {item.linkedTargetType
                              ? LINK_TARGET_LABEL_MAP[item.linkedTargetType] || 'Vinculado'
                              : 'Vinculado'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenLinkedRecord(item)}
                          className="text-left text-xs font-mono text-white hover:text-[#F0C800] underline-offset-2 hover:underline transition cursor-pointer line-clamp-2"
                        >
                          {item.linkedTargetLabel || item.linkedTargetId}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                    {onAnalyzeWithAI && (
                      <button
                        type="button"
                        disabled={Boolean(analyzingDocId)}
                        onClick={() => {
                          if (item.categoria === 'OTRO') {
                            setOtroAnalyzeModalItem(item);
                          } else {
                            onAnalyzeWithAI(item);
                          }
                        }}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-60 text-emerald-300 border border-emerald-500/35 text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        {analyzingDocId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {analyzingDocId === item.id
                            ? 'Analizando con IA...'
                            : item.aiAnalyzedAt
                              ? 'Re-analizar con IA'
                              : 'Llenar Form con IA'}
                        </span>
                      </button>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openLinkModal(item)}
                        className={`flex-1 min-h-[42px] px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          isLinked
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            : 'bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] border border-[#F0C800]/40'
                        }`}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>{isLinked ? 'Cambiar' : 'Vincular'}</span>
                      </button>

                      {isLinked && (
                        <button
                          type="button"
                          onClick={() => handleUnlink(item)}
                          className="min-h-[42px] min-w-[42px] px-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center transition cursor-pointer"
                          title="Quitar vínculo"
                        >
                          <Unlink className="w-4 h-4" />
                        </button>
                      )}

                      {isDeleting ? (
                        <div className="flex items-center gap-1 bg-rose-950/70 border border-rose-500/40 rounded-xl px-1.5 min-h-[42px]">
                          <button
                            type="button"
                            onClick={async () => {
                              await onDeleteItem(item.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-bold cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="min-h-[42px] min-w-[42px] rounded-xl bg-slate-800/70 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/30 flex items-center justify-center transition cursor-pointer"
                          title="Eliminar foto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: VINCULAR FOTO A PARTE DIARIO O EXPENDIO DE COMBUSTIBLE         */}
      {/* ===================================================================== */}
      {itemToLink && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !isSavingLink && setItemToLink(null)}
        >
          <div
            className="bg-[#16191F] border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 sm:px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={itemToLink.url}
                  alt="Preview"
                  className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-mono uppercase text-[#F0C800] font-bold">
                    Vincular {CATEGORY_LABEL_MAP[itemToLink.categoria]}
                  </div>
                  <h3 className="text-sm sm:text-base font-black text-white truncate">
                    {itemToLink.nota || `Foto del ${formatShortDate(itemToLink.fechaCaptura)}`}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingLink}
                onClick={() => setItemToLink(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Type Tabs + Search */}
            <div className="p-4 border-b border-slate-800 space-y-3 bg-[#12151B]">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLinkTab('PARTE_DIARIO')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer ${
                    linkTab === 'PARTE_DIARIO'
                      ? 'bg-[#F0C800] text-[#1C1D21] border-[#F0C800]'
                      : 'bg-[#16191F] text-slate-300 border-slate-800 hover:text-white'
                  }`}
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Parte Diario ({partesDiarios.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLinkTab('FUEL_VOUCHER')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer ${
                    linkTab === 'FUEL_VOUCHER'
                      ? 'bg-[#F0C800] text-[#1C1D21] border-[#F0C800]'
                      : 'bg-[#16191F] text-slate-300 border-slate-800 hover:text-white'
                  }`}
                >
                  <Fuel className="w-4 h-4" />
                  <span>Expendio Comb. ({fuelVouchers.length})</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder={
                    linkTab === 'PARTE_DIARIO'
                      ? 'Buscar parte por Nº, fecha, máquina, chofer u obra...'
                      : 'Buscar expendio por ticket, vale, fecha, máquina, chofer o litros...'
                  }
                  className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] text-sm text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
              {linkTab === 'PARTE_DIARIO' ? (
                candidatePartes.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No se encontraron Partes Diarios con esa búsqueda.
                  </div>
                ) : (
                  candidatePartes.map((p) => {
                    const label = `Parte #${p.numParte || p.id} · ${formatShortDate(p.fecha)} · ${p.codigoEquipo || p.marcaModelo} · ${p.obra || 'Sin obra'}`;
                    const isCurrent = itemToLink.linkedTargetType === 'PARTE_DIARIO' && itemToLink.linkedTargetId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isSavingLink}
                        onClick={() => handleConfirmLink('PARTE_DIARIO', p.id, label)}
                        className={`w-full text-left p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                          isCurrent
                            ? 'bg-emerald-500/15 border-emerald-500/40'
                            : 'bg-[#11141A] border-slate-800 hover:border-[#F0C800]/60 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-xs sm:text-sm font-black text-white truncate">
                            Parte #{p.numParte || p.id} · {p.codigoEquipo} {p.marcaModelo ? `(${p.marcaModelo})` : ''}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {formatShortDate(p.fecha)} · {p.nombreApellido || 'Sin operador'} · {p.obra || 'Sin obra'} · {Number(p.horasTrabajadas || p.hsCantidad || 0)} hs
                          </div>
                        </div>
                        <span className="px-3 py-1.5 rounded-lg bg-[#F0C800]/15 text-[#F0C800] text-xs font-black shrink-0">
                          {isCurrent ? 'Actual' : 'Elegir'}
                        </span>
                      </button>
                    );
                  })
                )
              ) : candidateFuelVouchers.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No se encontraron Expendios de Combustible con esa búsqueda.
                </div>
              ) : (
                candidateFuelVouchers.map((v) => {
                  const ticketRef = v.numTicket || v.numOrden || v.numVale || v.id;
                  const label = `Ticket/Ref ${ticketRef} · ${formatShortDate(v.fecha)} · ${v.codigoEquipo || v.marcaModelo} (${Math.abs(v.cantidad || 0)} Lts)`;
                  const isCurrent = itemToLink.linkedTargetType === 'FUEL_VOUCHER' && itemToLink.linkedTargetId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={isSavingLink}
                      onClick={() => handleConfirmLink('FUEL_VOUCHER', v.id, label)}
                      className={`w-full text-left p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-emerald-500/15 border-emerald-500/40'
                          : 'bg-[#11141A] border-slate-800 hover:border-[#F0C800]/60 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs sm:text-sm font-black text-white truncate">
                          {v.codigoEquipo || v.marcaModelo || 'Equipo'} · {Math.abs(v.cantidad || 0).toLocaleString('es-AR')} Lts {v.tipoComb || ''}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {formatShortDate(v.fecha)} · Ticket/Orden: {ticketRef} · {v.nombreApellido || 'Sin chofer'} · {v.deposito || 'Estación'}
                        </div>
                      </div>
                      <span className="px-3 py-1.5 rounded-lg bg-[#F0C800]/15 text-[#F0C800] text-xs font-black shrink-0">
                        {isCurrent ? 'Actual' : 'Elegir'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CÁMARA WEB EN VIVO (FALLBACK ADICIONAL AL BOTÓN NATIVO MÓVIL)  */}
      {/* ===================================================================== */}
      {isLiveCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4">
          <div className="flex items-center justify-between gap-2 max-w-2xl w-full mx-auto">
            <div className="text-sm font-black text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#F0C800]" />
              <span>Cámara · {CATEGORY_LABEL_MAP[selectedCategory]}</span>
            </div>
            <div className="flex items-center gap-2">
              {!capturedPreviewUrl && !cameraError && (
                <button
                  type="button"
                  onClick={() =>
                    setCameraFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                  }
                  className="min-h-[44px] px-3 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Cambiar cámara</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleCloseLiveCamera}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center my-3 max-w-2xl w-full mx-auto overflow-hidden rounded-2xl bg-[#0F1115] border border-slate-800">
            {cameraError ? (
              <div className="p-6 text-center space-y-4 max-w-md">
                <p className="text-sm text-slate-300 leading-relaxed">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => {
                    handleCloseLiveCamera();
                    cameraInputRef.current?.click();
                  }}
                  className="min-h-[48px] px-5 py-3 rounded-xl bg-[#F0C800] text-[#1B1D21] font-black text-sm inline-flex items-center gap-2 cursor-pointer"
                >
                  <Camera className="w-5 h-5" />
                  <span>Abrir Cámara Nativa del Celu</span>
                </button>
              </div>
            ) : capturedPreviewUrl ? (
              <img
                src={capturedPreviewUrl}
                alt="Captura previa"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
            )}
          </div>

          <div className="max-w-2xl w-full mx-auto flex items-center justify-center gap-3">
            {capturedPreviewUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(capturedPreviewUrl);
                    setCapturedPreviewUrl(null);
                    setCapturedBlob(null);
                  }}
                  className="min-h-[48px] px-5 py-3 rounded-xl bg-slate-800 text-white font-bold text-sm cursor-pointer"
                >
                  Repetir foto
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLiveCapture}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-5 h-5 stroke-[2.5]" />
                  <span>Optimizar y Guardar</span>
                </button>
              </>
            ) : !cameraError ? (
              <button
                type="button"
                onClick={handleCaptureLivePhoto}
                className="w-16 h-16 rounded-full bg-[#F0C800] hover:bg-[#F5D63D] border-4 border-white/80 flex items-center justify-center shadow-2xl cursor-pointer active:scale-95 transition"
                aria-label="Tomar foto"
              >
                <Camera className="w-7 h-7 text-[#1B1D21]" />
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: LIGHTBOX AMPLIACIÓN DE FOTO                                    */}
      {/* ===================================================================== */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col justify-between p-4"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-2 max-w-5xl w-full mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs sm:text-sm text-white space-y-0.5">
              <div className="font-black text-[#F0C800]">
                {CATEGORY_LABEL_MAP[lightboxItem.categoria]} · {formatShortDate(lightboxItem.fechaCaptura)}
                {lightboxItem.optimizedSizeKB ? ` · ${lightboxItem.optimizedSizeKB} KB` : ''}
              </div>
              {lightboxItem.nota && <div className="text-slate-300">{lightboxItem.nota}</div>}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLightboxRotation((r) => (r + 90) % 360)}
                className="min-h-[42px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
                <span className="hidden sm:inline">Rotar</span>
              </button>
              <a
                href={lightboxItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">Abrir</span>
              </a>
              <a
                href={lightboxItem.url}
                download={`${lightboxItem.categoria}_${lightboxItem.fechaCaptura}.webp`}
                className="min-h-[42px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Descargar</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  const target = lightboxItem;
                  setLightboxItem(null);
                  openLinkModal(target);
                }}
                className="min-h-[42px] px-3.5 rounded-xl bg-[#F0C800] hover:bg-[#F5D63D] text-[#1A1C20] text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Link2 className="w-4 h-4" />
                <span>{lightboxItem.estado === 'VINCULADO' ? 'Cambiar vínculo' : 'Vincular'}</span>
              </button>
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="min-w-[42px] min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div
            className="flex-1 flex items-center justify-center overflow-hidden my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxItem.url}
              alt={lightboxItem.nota || 'Documento'}
              style={{ transform: `rotate(${lightboxRotation}deg)` }}
              className="max-h-[78vh] max-w-full object-contain rounded-xl transition-transform duration-200"
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: ELEGIR TIPO PARA FOTO CLASIFICADA COMO "OTRO" ANTES DE IA      */}
      {/* ===================================================================== */}
      {otroAnalyzeModalItem && onAnalyzeWithAI && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setOtroAnalyzeModalItem(null)}
        >
          <div
            className="bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-black text-white">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>¿Qué documento es esta foto?</span>
              </div>
              <button
                type="button"
                onClick={() => setOtroAnalyzeModalItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Elegí qué formulario querés que llene la IA automáticamente:
            </p>
            <div className="grid grid-cols-1 gap-2">
              {CATEGORY_OPTIONS.filter((c) => c.id !== 'OTRO').map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      const target = otroAnalyzeModalItem;
                      setOtroAnalyzeModalItem(null);
                      onAnalyzeWithAI(target, cat.id as Exclude<DocumentBagCategory, 'OTRO'>);
                    }}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#101318] hover:bg-slate-800 border border-slate-800 hover:border-[#F0C800]/50 text-left text-sm font-bold text-white flex items-center gap-3 transition cursor-pointer"
                  >
                    <Icon className={`w-4 h-4 ${cat.accentClass}`} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
