import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  RentalContract,
  RentalAttachment,
  RentalAttachmentCategory,
  ParteDiario,
  ArcaInvoice,
  FuelDispensary,
  Vehicle
} from '../../types';
import { formatCurrency } from '../../services/storage';
import { loadSiteSettings } from '../../services/siteConfig';
import { uploadFileToCloudflareR2 } from '../../services/api';
import { formatInvoiceNumber, resolveRentalContractLinks, isExternalMigratedInvoice } from '../../utils/crossLinks';
import {
  buildPartesKilometrajeCrossMap,
  formatCrossDateDDMMYYYY,
  ParteKilometrajeCrossInfo
} from '../../utils/parteKilometrajeCross';
import { findMatchingVehicle } from '../../utils/obraCostosEngine';
import {
  X,
  FileText,
  Truck,
  UserCheck,
  Building2,
  MapPin,
  Phone,
  CheckCircle2,
  Edit3,
  Printer,
  Link2,
  Receipt,
  FileDown,
  Info,
  Camera,
  Upload,
  Eye,
  Download,
  Trash2,
  RefreshCw,
  FileCheck2,
  Paperclip,
  ClipboardList,
  AlertCircle,
  Clock,
  DollarSign
} from 'lucide-react';

interface RentalDetailModalProps {
  isOpen: boolean;
  contract: RentalContract | null;
  onClose: () => void;
  onEdit?: (contract: RentalContract) => void;
  onFinalize?: (id: string) => void;
  onInvoiceInArca?: (contract: RentalContract) => void;
  onUpdateContract?: (contract: RentalContract) => void;
  partesDiarios?: ParteDiario[];
  invoices?: ArcaInvoice[];
  fuelVouchers?: FuelDispensary[];
  fleet?: Vehicle[];
  onNavigateToCobranzas?: () => void;
}

const CATEGORY_LABELS: Record<RentalAttachmentCategory, string> = {
  FOTO_SALIDA: '📸 Salida Equipo',
  HOROMETRO_TABLERO: '⏱️ Horómetro / Tablero',
  CONTRATO_FIRMADO: '✍️ Contrato Firmado',
  DOCUMENTACION_CLIENTE: '🪪 DNI / Doc. Cliente',
  ESTADO_DEVOLUCION: '🔄 Devolución Equipo',
  OTRO: '📎 Otro Adjunto'
};

const escapeHtml = (value: string | number | undefined | null): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const RentalDetailModal: React.FC<RentalDetailModalProps> = ({
  isOpen,
  contract,
  onClose,
  onEdit,
  onFinalize,
  onInvoiceInArca,
  onUpdateContract,
  partesDiarios = [],
  invoices = [],
  fuelVouchers = [],
  fleet = [],
  onNavigateToCobranzas
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [printHintMsg, setPrintHintMsg] = useState<string | null>(null);
  const [defaultCategory, setDefaultCategory] =
    useState<RentalAttachmentCategory>('FOTO_SALIDA');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadBanner, setUploadBanner] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<RentalAttachment | null>(null);
  const [quickAddParteId, setQuickAddParteId] = useState<string>('');

  const kilometrajeCrossMap = useMemo(
    () => buildPartesKilometrajeCrossMap(partesDiarios, fuelVouchers, fleet),
    [partesDiarios, fuelVouchers, fleet]
  );

  if (!isOpen || !contract) return null;

  const resolvedLinks = resolveRentalContractLinks(contract, partesDiarios, invoices);

  const inferParteUnit = (p: ParteDiario, cross?: ParteKilometrajeCrossInfo): 'hs' | 'km' => {
    if (cross?.unit) return cross.unit;
    const matchedVeh = findMatchingVehicle(
      {
        vehicleId: p.vehicleId,
        codigoEquipo: p.codigoEquipo,
        marcaModelo: p.marcaModelo,
        equipoPatenteOrCodigo: p.patenteOrCodigo
      },
      fleet
    );
    const rawClass = `${matchedVeh?.clasificacion || ''} ${matchedVeh?.categoriaEquipo || ''} ${p.marcaModelo || ''}`.toUpperCase();
    if (
      rawClass.includes('CAMION') ||
      rawClass.includes('CAMIÓN') ||
      rawClass.includes('MERCEDES') ||
      rawClass.includes('VOLCADOR') ||
      rawClass.includes('BATEA') ||
      rawClass.includes('CARRET') ||
      rawClass.includes('CHASIS') ||
      rawClass.includes('PICKUP') ||
      rawClass.includes('UTILITARIO') ||
      rawClass.includes('TRANSPORTE') ||
      p.tipo === 'VIAJES'
    ) {
      return 'km';
    }
    if (matchedVeh) {
      if ((matchedVeh.odometro || 0) > 0 && !(matchedVeh.horometro || 0)) return 'km';
      if ((matchedVeh.horometro || 0) > 0 && !(matchedVeh.odometro || 0)) return 'hs';
    }
    return 'hs';
  };

  const getParteOdometerCellData = (p: ParteDiario) => {
    const cross = kilometrajeCrossMap.get(p.id);
    const unit = inferParteUnit(p, cross);
    const directIni = Number(p.odometroInicial || p.checklist?.odometroInicial || 0);
    const directFin = Number(p.odomKilom || 0);

    // 1. Lectura directa en el parte (Inicio y Fin reales)
    if (directIni > 0 && directFin > 0 && directFin >= directIni) {
      const worked = Number((directFin - directIni).toFixed(1));
      return {
        unit,
        worked,
        ini: directIni,
        fin: directFin,
        isApprox: false,
        statusLabel: null as string | null,
        coincidencia: cross?.coincidencia,
        tooltip: `Lectura directa del parte: ${directIni.toLocaleString('es-AR')} → ${directFin.toLocaleString('es-AR')} ${unit} (+${worked.toLocaleString('es-AR')} ${unit})`
      };
    }

    // 2. Cruce prorrateado con cargas de combustible
    if (
      cross &&
      cross.kmProrrateadoDia !== undefined &&
      cross.odomAproxInicio !== undefined &&
      cross.odomAproxFin !== undefined
    ) {
      const finValue =
        directFin > 0
          ? directFin
          : cross.isFuelLoadDay && cross.lecturaCargaDia !== undefined
            ? cross.lecturaCargaDia
            : cross.odomAproxFin;
      const tipParts = [
        `Cruce con combustible (${cross.prevLoadDate ? formatCrossDateDDMMYYYY(cross.prevLoadDate) : 'Tramo'} → ${cross.nextLoadDate ? formatCrossDateDDMMYYYY(cross.nextLoadDate) : ''})`,
        `Inicio aprox: ${cross.odomAproxInicio.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${unit}`,
        `Fin aprox: ${finValue.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${unit}`,
        `Diferencia tramo: +${(cross.tramoDelta ?? cross.kmProrrateadoDia).toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${unit}`
      ];
      if (cross.tramoHorasPartes !== undefined && unit === 'hs') {
        tipParts.push(`Hs declaradas en tramo: ${cross.tramoHorasPartes.toFixed(1)} hs`);
      }
      return {
        unit,
        worked: cross.kmProrrateadoDia,
        ini: cross.odomAproxInicio,
        fin: finValue,
        isApprox: !cross.isFuelLoadDay,
        statusLabel: null as string | null,
        coincidencia: cross.coincidencia,
        tooltip: tipParts.join(' • ')
      };
    }

    // 3. Lectura parcial (solo día de carga o solo un extremo en parte)
    if (cross?.isFuelLoadDay && cross.lecturaCargaDia !== undefined) {
      return {
        unit,
        worked: undefined as number | undefined,
        ini: directIni > 0 ? directIni : undefined,
        fin: cross.lecturaCargaDia,
        isApprox: false,
        statusLabel: 'Día carga comb.',
        coincidencia: cross.coincidencia,
        tooltip: `Carga de combustible registrada con lectura ${cross.lecturaCargaDia.toLocaleString('es-AR')} ${unit} (sin lectura previa para calcular delta)`
      };
    }

    if (directIni > 0 || directFin > 0) {
      return {
        unit,
        worked: undefined as number | undefined,
        ini: directIni > 0 ? directIni : undefined,
        fin: directFin > 0 ? directFin : undefined,
        isApprox: false,
        statusLabel: directFin > 0 ? 'Solo cierre' : 'Solo inicio',
        coincidencia: cross?.coincidencia,
        tooltip: `Lectura parcial cargada en el parte (${directIni > 0 ? `Ini: ${directIni}` : `Fin: ${directFin}`} ${unit})`
      };
    }

    if (cross?.status === 'PENDING_NEXT_LOAD' && cross.prevLoadReading) {
      return {
        unit,
        worked: undefined as number | undefined,
        ini: cross.prevLoadReading,
        fin: undefined as number | undefined,
        isApprox: true,
        statusLabel: 'Pend. próx. carga',
        coincidencia: undefined,
        tooltip: `Última carga el ${formatCrossDateDDMMYYYY(cross.prevLoadDate)} en ${cross.prevLoadReading.toLocaleString('es-AR')} ${unit}. Falta carga posterior para cerrar el tramo.`
      };
    }

    return {
      unit,
      worked: undefined as number | undefined,
      ini: undefined as number | undefined,
      fin: undefined as number | undefined,
      isApprox: false,
      statusLabel: null as string | null,
      coincidencia: undefined,
      tooltip: 'Sin lecturas de odómetro ni cargas de combustible vinculadas en este tramo.'
    };
  };

  const adjuntos: RentalAttachment[] = Array.isArray(contract.adjuntos)
    ? contract.adjuntos
    : [];

  const handleDirectUploadFiles = async (
    fileList: FileList | File[],
    forcedCat?: RentalAttachmentCategory
  ) => {
    const filesArray = Array.from(fileList || []);
    if (filesArray.length === 0) return;

    setIsUploading(true);
    setUploadBanner(`Reduciendo y subiendo ${filesArray.length} archivo(s) a Cloudflare R2...`);

    const catToUse = forcedCat || defaultCategory;
    const newlyUploaded: RentalAttachment[] = [];
    let savedKB = 0;

    try {
      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        const mime = (file.type || '').toLowerCase();
        const isImg = mime.startsWith('image/');
        const isPdf = mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const tipoArchivo: 'IMAGE' | 'PDF' | 'DOC' = isImg ? 'IMAGE' : isPdf ? 'PDF' : 'DOC';

        const res = await uploadFileToCloudflareR2(
          file,
          file.name || `adjunto_${Date.now()}`,
          file.type || (isImg ? 'image/jpeg' : isPdf ? 'application/pdf' : 'application/octet-stream'),
          'alquileres',
          {
            maxWidth: 1280,
            maxHeight: 1280,
            quality: 0.78,
            format: 'image/webp'
          }
        );

        if (!res.success || !res.url) {
          throw new Error(res.error || `Error al subir "${file.name}"`);
        }

        if (res.originalSizeKB && res.optimizedSizeKB && res.originalSizeKB > res.optimizedSizeKB) {
          savedKB += res.originalSizeKB - res.optimizedSizeKB;
        }

        newlyUploaded.push({
          id: `ATT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url: res.url,
          nombre: file.name || `Adjunto ${adjuntos.length + i + 1}`,
          categoria: catToUse,
          tipoArchivo,
          nota: '',
          originalSizeKB: res.originalSizeKB,
          optimizedSizeKB: res.optimizedSizeKB,
          reductionPercentage: res.reductionPercentage,
          fechaSubida: new Date().toISOString()
        });
      }

      const nextAdjuntos = [...adjuntos, ...newlyUploaded];
      if (onUpdateContract) {
        onUpdateContract({
          ...contract,
          adjuntos: nextAdjuntos
        });
      }
      setUploadBanner(
        savedKB > 0
          ? `✓ ${newlyUploaded.length} archivo(s) guardados en el contrato • Reducción: -${(
              savedKB / 1024
            ).toFixed(2)} MB`
          : `✓ ${newlyUploaded.length} documento(s) guardados en el contrato`
      );
    } catch (err: any) {
      setUploadBanner(`❌ ${err?.message || 'No se pudo subir el archivo'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateAttachmentField = (
    attId: string,
    patch: Partial<Pick<RentalAttachment, 'categoria' | 'nota'>>
  ) => {
    if (!onUpdateContract) return;
    const nextAdjuntos = adjuntos.map(a => (a.id === attId ? { ...a, ...patch } : a));
    onUpdateContract({
      ...contract,
      adjuntos: nextAdjuntos
    });
  };

  const handleDeleteAttachment = (attId: string) => {
    if (!onUpdateContract) return;
    const nextAdjuntos = adjuntos.filter(a => a.id !== attId);
    onUpdateContract({
      ...contract,
      adjuntos: nextAdjuntos
    });
  };

  const siteSettings = loadSiteSettings();
  const contractCurrency: 'ARS' | 'USD' = contract.moneda === 'USD' ? 'USD' : 'ARS';

  const activeLogoUrl =
    siteSettings.customLogoUrlLight ||
    siteSettings.customLogoUrl ||
    siteSettings.customLogoUrlDark ||
    siteSettings.customLogoUrlIcon ||
    '';

  const loadGrayscaleLogoForPdf = async (
    url: string
  ): Promise<{ dataUrl: string; width: number; height: number } | null> => {
    if (!url) return null;
    const src =
      url.startsWith('data:') || url.startsWith('/')
        ? url
        : `/api/image-proxy?url=${encodeURIComponent(url)}`;

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 4500);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        clearTimeout(timer);
        try {
          const natW = img.naturalWidth || 300;
          const natH = img.naturalHeight || 110;
          const maxPx = 640;
          const scale = natW > maxPx ? maxPx / natW : 1;
          const w = Math.max(1, Math.round(natW * scale));
          const h = Math.max(1, Math.round(natH * scale));

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }

          // Pure white background so transparent areas never print dark
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          // Convert to high-contrast grayscale (gamma 1.35) for crisp B&W printing
          const imgData = ctx.getImageData(0, 0, w, h);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const bw = lum >= 248 ? 255 : Math.max(0, Math.min(255, Math.round(Math.pow(lum / 255, 1.35) * 255)));
            d[i] = bw;
            d[i + 1] = bw;
            d[i + 2] = bw;
          }
          ctx.putImageData(imgData, 0, 0);

          resolve({
            dataUrl: canvas.toDataURL('image/png'),
            width: w,
            height: h
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

  const buildRowsForDocument = () => {
    if (Array.isArray(contract.items) && contract.items.length > 0) {
      return contract.items.map((it, idx) => ({
        codigo: it.codigo || String(idx + 1).padStart(2, '0'),
        descripcion: it.descripcion || contract.equipoModelo,
        observacion: it.observacionLinea || '—',
        cantidad: `${it.cantidad} ${it.unidadMedida || (contract.modalidad === 'DIAS' ? 'DÍAS' : 'HS')}`,
        precioUnitario: formatCurrency(it.precioUnitario, contractCurrency),
        importe: formatCurrency(it.importe, contractCurrency)
      }));
    }
    const legacyRows = [
      {
        codigo: contract.equipoCodigoInterno || contract.equipoCodigo || '01',
        descripcion: contract.equipoModelo,
        observacion: contract.operarioIncluido ? `Operario: ${contract.operarioNombre || 'Incluido'}` : 'Sin operario',
        cantidad: `${contract.duracion} ${contract.modalidad === 'DIAS' ? 'DÍAS' : 'HS'}`,
        precioUnitario: formatCurrency(contract.tarifaEquipoUnitaria, contractCurrency),
        importe: formatCurrency(contract.subtotalEquipo, contractCurrency)
      }
    ];
    if (contract.operarioIncluido && contract.subtotalOperario > 0) {
      legacyRows.push({
        codigo: 'OP-01',
        descripcion: `SERVICIO DE OPERADOR (${contract.operarioNombre || 'ASIGNADO'})`,
        observacion: '—',
        cantidad: `${contract.duracion} ${contract.modalidad === 'DIAS' ? 'DÍAS' : 'HS'}`,
        precioUnitario: formatCurrency(contract.tarifaOperarioUnitaria, contractCurrency),
        importe: formatCurrency(contract.subtotalOperario, contractCurrency)
      });
    }
    if (contract.costoTrasladoFlete > 0) {
      legacyRows.push({
        codigo: 'FLETE',
        descripcion: 'SERVICIO DE CARRETÓN / FLETE Y TRASLADO A OBRA',
        observacion: '—',
        cantidad: '1 SERVICIO',
        precioUnitario: formatCurrency(contract.costoTrasladoFlete, contractCurrency),
        importe: formatCurrency(contract.costoTrasladoFlete, contractCurrency)
      });
    }
    return legacyRows;
  };

  const buildSummaryLines = (): Array<{ label: string; value: string; isBold?: boolean; isDiscount?: boolean; isTax?: boolean }> => {
    const subtotalBruto =
      Array.isArray(contract.items) && contract.items.length > 0
        ? contract.items.reduce((acc, it) => acc + (Number(it.importe) || 0), 0)
        : (Number(contract.subtotalEquipo) || 0) +
          (Number(contract.subtotalOperario) || 0) +
          (Number(contract.costoTrasladoFlete) || 0);

    const subtotalNetoValue =
      contract.subtotalNeto !== undefined
        ? contract.subtotalNeto
        : Math.max(0, subtotalBruto - (Number(contract.descuento) || 0));

    const lines: Array<{ label: string; value: string; isBold?: boolean; isDiscount?: boolean; isTax?: boolean }> = [];

    if (contract.descuento > 0) {
      lines.push({
        label: 'Subtotal Renglones:',
        value: formatCurrency(subtotalBruto, contractCurrency)
      });
      lines.push({
        label: 'Bonificación / Descuento Comercial:',
        value: `-${formatCurrency(contract.descuento, contractCurrency)}`,
        isDiscount: true
      });
    }

    lines.push({
      label: 'Subtotal Neto Gravado:',
      value: formatCurrency(subtotalNetoValue, contractCurrency),
      isBold: true
    });

    if (contract.ivaTotal !== undefined && contract.ivaTotal > 0) {
      lines.push({
        label: `IVA (${contract.alicuotaIva || 21}%):`,
        value: formatCurrency(contract.ivaTotal, contractCurrency),
        isTax: true
      });
    }

    return lines;
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setPrintHintMsg(null);
    try {
      const logoAsset = await loadGrayscaleLogoForPdf(activeLogoUrl);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = 210;
      const pageH = 297;
      const margin = 14;
      const contentW = pageW - margin * 2;
      let y = 13;

      const checkPageBreak = (neededHeight: number) => {
        if (y + neededHeight > pageH - 18) {
          pdf.addPage();
          y = 16;
        }
      };

      // Eco B&W Header: White background, grayscale company logo on left, outlined doc box on right
      const headerH = 26;
      if (logoAsset) {
        const maxLogoW = 50;
        const maxLogoH = 16.5;
        const ratio = logoAsset.width / logoAsset.height;
        let drawW = maxLogoW;
        let drawH = drawW / ratio;
        if (drawH > maxLogoH) {
          drawH = maxLogoH;
          drawW = drawH * ratio;
        }
        pdf.addImage(logoAsset.dataUrl, 'PNG', margin, y, drawW, drawH);
      } else {
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        pdf.text((siteSettings.companyName || 'LA HORMIGA').toUpperCase(), margin, y + 7);
        pdf.setFontSize(8);
        pdf.setTextColor(60, 60, 60);
        pdf.text((siteSettings.slogan || 'PEQUEÑOS GRANDES MOVIMIENTOS').toUpperCase(), margin, y + 12.5);
      }

      // Compact company contact line below logo (pure black/dark gray, no ink-wasting fills)
      const contactLine = [
        siteSettings.direccion,
        siteSettings.telefonoPrincipal,
        siteSettings.email
      ]
        .filter(Boolean)
        .join('  •  ');
      pdf.setTextColor(40, 40, 40);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.text(contactLine.slice(0, 76), margin, y + 21.5);

      // Right side outlined Contract Box (white background, crisp black border)
      const docBoxW = 68;
      const docBoxX = pageW - margin - docBoxW;
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.35);
      pdf.rect(docBoxX, y, docBoxW, 22, 'S');

      pdf.setTextColor(40, 40, 40);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.text('CONTRATO DE ALQUILER', docBoxX + docBoxW - 3.5, y + 5.5, { align: 'right' });

      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(14);
      pdf.text(contract.numeroContrato, docBoxX + docBoxW - 3.5, y + 12, { align: 'right' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.2);
      pdf.setTextColor(35, 35, 35);
      if (contract.titulo) {
        pdf.setFont('helvetica', 'bold');
        pdf.text(contract.titulo.slice(0, 38), docBoxX + docBoxW - 3.5, y + 16.5, { align: 'right' });
        pdf.setFont('helvetica', 'normal');
      }
      const metaRight = contract.cotizacionNumero
        ? `${contract.estado.replace(/_/g, ' ')}  |  Cot. #${contract.cotizacionNumero}`
        : `Estado: ${contract.estado.replace(/_/g, ' ')}`;
      pdf.text(metaRight, docBoxX + docBoxW - 3.5, contract.titulo ? y + 20.5 : y + 18.5, { align: 'right' });

      // Crisp horizontal black rule under header
      y += headerH;
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.5);
      pdf.line(margin, y, pageW - margin, y);
      pdf.setLineWidth(0.25);

      y += 4.5;

      // Grid: 1. Cliente (Left) & 2. Equipo (Right) - pure white outlined boxes
      const boxGap = 4;
      const boxW = (contentW - boxGap) / 2;
      const infoBoxH = 34;

      // Left box: Cliente
      pdf.setDrawColor(70, 70, 70);
      pdf.rect(margin, y, boxW, infoBoxH, 'S');
      pdf.setDrawColor(180, 180, 180);
      pdf.line(margin + 3, y + 7.5, margin + boxW - 3, y + 7.5);

      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('1. CLIENTE / RAZÓN SOCIAL Y OBRA', margin + 3.5, y + 5.5);

      pdf.setFontSize(9.5);
      const clientLines = pdf.splitTextToSize(contract.clienteNombre || 'Cliente', boxW - 7);
      pdf.text(clientLines.slice(0, 2), margin + 3.5, y + 12);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(35, 35, 35);
      const docLine = [
        contract.clienteDocumento ? `CUIT/DNI: ${contract.clienteDocumento}` : '',
        contract.clienteCondicionIva ? String(contract.clienteCondicionIva).replace(/_/g, ' ') : ''
      ]
        .filter(Boolean)
        .join('  •  ');
      pdf.text(docLine || 'Consumidor / Cliente', margin + 3.5, y + 18);

      const addrStr = `${contract.direccionObra || 'A coordinar'}${contract.localidadObra ? ` • ${contract.localidadObra}` : ''}`;
      const addrLines = pdf.splitTextToSize(`Obra: ${addrStr}`, boxW - 7);
      pdf.text(addrLines.slice(0, 2), margin + 3.5, y + 23.2);
      pdf.text(`Tel: ${contract.clienteTelefono || 'Sin teléfono'}`, margin + 3.5, y + 31);

      // Right box: Equipo
      const rightX = margin + boxW + boxGap;
      pdf.setDrawColor(70, 70, 70);
      pdf.rect(rightX, y, boxW, infoBoxH, 'S');
      pdf.setDrawColor(180, 180, 180);
      pdf.line(rightX + 3, y + 7.5, rightX + boxW - 3, y + 7.5);

      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('2. EQUIPO ASIGNADO Y OPERADOR', rightX + 3.5, y + 5.5);

      pdf.setTextColor(45, 45, 45);
      pdf.setFontSize(7.5);
      const codesLine = [
        contract.equipoCodigoInterno ? `CÓD. INT: ${contract.equipoCodigoInterno}` : '',
        contract.equipoCodigo ? `N° EQ: ${contract.equipoCodigo}` : ''
      ]
        .filter(Boolean)
        .join('   |   ');
      pdf.text(codesLine || 'Equipo de flota', rightX + 3.5, y + 11.5);

      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      const modelLines = pdf.splitTextToSize(contract.equipoModelo || '-', boxW - 7);
      pdf.text(modelLines.slice(0, 2), rightX + 3.5, y + 17);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(15, 15, 15);
      if (contract.operarioIncluido) {
        pdf.text(`CON Operario: ${contract.operarioNombre || 'Asignado'}`, rightX + 3.5, y + 26);
      } else {
        pdf.setFont('helvetica', 'normal');
        pdf.text('Modalidad: Alquiler SIN Operador', rightX + 3.5, y + 26);
      }
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(35, 35, 35);
      pdf.text(`Horómetro Salida: ${contract.horometroSalida || 0} Hs/Km`, rightX + 3.5, y + 31);

      y += infoBoxH + 3.5;

      // Dates & Duration strip (white outlined box with hairline dividers)
      pdf.setDrawColor(70, 70, 70);
      pdf.rect(margin, y, contentW, 12.5, 'S');

      const colStep = contentW / 4;
      const stripCols = [
        {
          label: 'MODALIDAD / CANT.',
          value: `${contract.duracion} ${contract.modalidad === 'DIAS' ? 'Días' : 'Horas'}`
        },
        {
          label: 'FECHA SALIDA',
          value: `${contract.fechaInicio} (${contract.horaInicio || '08:00'})`
        },
        {
          label: 'DEVOLUCIÓN ESTIMADA',
          value: `${contract.fechaFinEstimada} (${contract.horaFinEstimada || '18:00'})`
        },
        {
          label: 'CONDICIÓN VENTA',
          value: contract.condicionVenta || 'CTA CTE / A CONVENIR'
        }
      ];
      stripCols.forEach((sc, idx) => {
        const cx = margin + 3.5 + idx * colStep;
        if (idx > 0) {
          pdf.setDrawColor(200, 200, 200);
          pdf.line(margin + idx * colStep, y + 1.5, margin + idx * colStep, y + 11);
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.setTextColor(70, 70, 70);
        pdf.text(sc.label, cx, y + 4.5);
        pdf.setFontSize(8.5);
        pdf.setTextColor(0, 0, 0);
        pdf.text(String(sc.value).slice(0, 26), cx, y + 9.5);
      });

      y += 17;

      // Items Table (Pure white header with bold top/bottom hairline rules - ZERO dark fill)
      const rows = buildRowsForDocument();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`RENGLONES DE MÁQUINAS, EQUIPOS Y ADITAMENTOS (${rows.length})`, margin, y);
      y += 2.5;

      const colWidths = [16, 62, 42, 18, 22, 22]; // sum = 182 = contentW
      const drawTableHeader = () => {
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.25);
        pdf.line(margin, y, margin + contentW, y);
        pdf.setLineWidth(0.5);
        pdf.line(margin, y + 7, margin + contentW, y + 7);
        pdf.setLineWidth(0.25);

        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        const headers = ['CÓD.', 'MÁQUINA / EQUIPO / SERVICIO', 'ADITAMENTO / OBS.', 'CANT.', 'P. UNIT.', 'IMPORTE'];
        let xCursor = margin + 2;
        headers.forEach((h, i) => {
          if (i >= 4) {
            pdf.text(h, xCursor + colWidths[i] - 4, y + 4.8, { align: 'right' });
          } else if (i === 3) {
            pdf.text(h, xCursor + colWidths[i] / 2 - 2, y + 4.8, { align: 'center' });
          } else {
            pdf.text(h, xCursor, y + 4.8);
          }
          xCursor += colWidths[i];
        });
        y += 7;
      };

      drawTableHeader();

      rows.forEach((row) => {
        const descLines = pdf.splitTextToSize(row.descripcion, colWidths[1] - 4);
        const obsLines = pdf.splitTextToSize(row.observacion, colWidths[2] - 4);
        const lineCount = Math.max(descLines.length, obsLines.length, 1);
        const rowH = Math.max(8, lineCount * 4 + 3.5);

        if (y + rowH > pageH - 25) {
          pdf.addPage();
          y = 16;
          drawTableHeader();
        }

        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, y + rowH, margin + contentW, y + rowH);

        let xCursor = margin + 2;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(0, 0, 0);
        pdf.text(String(row.codigo).slice(0, 8), xCursor, y + 5);
        xCursor += colWidths[0];

        pdf.setFont('helvetica', 'bold');
        pdf.text(descLines, xCursor, y + 5);
        xCursor += colWidths[1];

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(35, 35, 35);
        pdf.text(obsLines, xCursor, y + 5);
        xCursor += colWidths[2];

        pdf.setTextColor(0, 0, 0);
        pdf.text(row.cantidad, xCursor + colWidths[3] / 2 - 2, y + 5, { align: 'center' });
        xCursor += colWidths[3];

        pdf.text(row.precioUnitario, xCursor + colWidths[4] - 4, y + 5, { align: 'right' });
        xCursor += colWidths[4];

        pdf.setFont('helvetica', 'bold');
        pdf.text(row.importe, xCursor + colWidths[5] - 4, y + 5, { align: 'right' });

        y += rowH;
      });

      y += 5.5;

      // Financial summary (only totals/discounts/taxes - items are already listed in table above)
      const summaryLines = buildSummaryLines();

      const finBoxH = 19 + summaryLines.length * 5.2;
      checkPageBreak(finBoxH + 45);

      pdf.setDrawColor(70, 70, 70);
      pdf.rect(margin, y, contentW, finBoxH, 'S');
      pdf.setDrawColor(180, 180, 180);
      pdf.line(margin + 3.5, y + 7.5, pageW - margin - 3.5, y + 7.5);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(0, 0, 0);
      pdf.text(
        `3. RESUMEN ECONÓMICO Y FISCAL (${contractCurrency === 'USD' ? 'EXPRESADO EN DÓLARES USD' : 'PESOS ARS'})`,
        margin + 4,
        y + 5.5
      );

      let fy = y + 11.5;
      summaryLines.forEach(sl => {
        pdf.setFont('helvetica', sl.isBold ? 'bold' : 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(25, 25, 25);
        pdf.text(sl.label, margin + 4, fy);
        pdf.text(sl.value, pageW - margin - 4, fy, { align: 'right' });
        fy += 5.2;
      });

      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.4);
      pdf.line(margin + 4, fy - 1, pageW - margin - 4, fy - 1);
      pdf.setLineWidth(0.25);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(0, 0, 0);
      pdf.text(contractCurrency === 'USD' ? 'TOTAL CONTRATO (USD):' : 'TOTAL CONTRATO:', margin + 4, fy + 4.8);
      pdf.setFontSize(12);
      pdf.text(formatCurrency(contract.totalAlquiler, contractCurrency), pageW - margin - 4, fy + 4.8, { align: 'right' });

      y += finBoxH + 4.5;

      // Delivery conditions & observations (white outlined box, zero tint)
      if (contract.condicionEntrega || contract.observaciones) {
        const condLines = contract.condicionEntrega
          ? pdf.splitTextToSize(`Condición de Entrega: ${contract.condicionEntrega}`, contentW - 8)
          : [];
        const obsNoteLines = contract.observaciones
          ? pdf.splitTextToSize(`Observaciones: ${contract.observaciones}`, contentW - 8)
          : [];
        const notesH = 6 + (condLines.length + obsNoteLines.length) * 4.2;
        checkPageBreak(notesH + 28);

        pdf.setDrawColor(90, 90, 90);
        pdf.rect(margin, y, contentW, notesH, 'S');

        let ny = y + 5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(25, 25, 25);
        if (condLines.length > 0) {
          pdf.text(condLines, margin + 4, ny);
          ny += condLines.length * 4.2;
        }
        if (obsNoteLines.length > 0) {
          pdf.text(obsNoteLines, margin + 4, ny);
        }
        y += notesH + 8;
      } else {
        y += 6;
      }

      // Signature block
      checkPageBreak(26);
      const sigY = Math.max(y + 8, 255);
      pdf.setDrawColor(60, 60, 60);
      pdf.line(margin + 6, sigY, margin + 78, sigY);
      pdf.line(pageW - margin - 78, sigY, pageW - margin - 6, sigY);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(25, 25, 25);
      pdf.text(`Por ${(siteSettings.companyName || 'LA HORMIGA').toUpperCase()}`, margin + 42, sigY + 4.5, { align: 'center' });
      pdf.text('Firma, Aclaración y DNI (Cliente / Recepción)', pageW - margin - 42, sigY + 4.5, { align: 'center' });

      const safeClient = (contract.clienteNombre || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
      pdf.save(`Contrato_${contract.numeroContrato}_${safeClient}.pdf`);
      setPrintHintMsg('PDF A4 Blanco y Negro (ahorro de tinta) descargado con el logo de la empresa.');
    } catch (err) {
      console.error('Error generando PDF del contrato:', err);
      setPrintHintMsg('No se pudo generar el PDF del contrato.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintContract = () => {
    setPrintHintMsg(null);
    const rows = buildRowsForDocument();
    const companyName = siteSettings.companyName || 'LA HORMIGA';
    const slogan = siteSettings.slogan || 'Pequeños grandes movimientos';
    const logoSrcForHtml = activeLogoUrl
      ? activeLogoUrl.startsWith('data:') || activeLogoUrl.startsWith('/')
        ? activeLogoUrl
        : `/api/image-proxy?url=${encodeURIComponent(activeLogoUrl)}`
      : '';

    const rowsHtml = rows
      .map(
        r => `
        <tr>
          <td style="font-family:monospace;font-weight:700;">${escapeHtml(r.codigo)}</td>
          <td style="font-weight:700;">${escapeHtml(r.descripcion)}</td>
          <td>${escapeHtml(r.observacion)}</td>
          <td style="text-align:center;font-family:monospace;">${escapeHtml(r.cantidad)}</td>
          <td style="text-align:right;font-family:monospace;">${escapeHtml(r.precioUnitario)}</td>
          <td style="text-align:right;font-family:monospace;font-weight:700;">${escapeHtml(r.importe)}</td>
        </tr>`
      )
      .join('');

    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Contrato ${escapeHtml(contract.numeroContrato)} - ${escapeHtml(contract.clienteNombre)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; margin: 0; font-size: 12px; }
    .header { background: #fff; color: #000; padding: 0 0 10px 0; border-bottom: 2px solid #000; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
    .brand-logo { max-height: 54px; max-width: 195px; object-fit: contain; display: block; filter: grayscale(100%) contrast(120%); margin-bottom: 4px; }
    .brand-title { font-size: 18px; font-weight: 900; letter-spacing: 0.04em; }
    .brand-slogan { font-size: 10px; font-weight: 800; color: #222; text-transform: uppercase; margin-top: 2px; }
    .brand-contact { font-size: 9.5px; color: #222; margin-top: 2px; }
    .doc-meta { text-align: right; border: 1.5px solid #000; padding: 8px 12px; min-width: 210px; background: #fff; }
    .doc-label { font-size: 9.5px; font-weight: 800; color: #222; text-transform: uppercase; }
    .doc-num { font-size: 18px; font-weight: 900; margin: 2px 0; color: #000; }
    .doc-sub { font-size: 10px; color: #222; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
    .card { border: 1px solid #333; padding: 10px 12px; background: #fff; }
    .card-title { font-size: 10px; font-weight: 800; color: #000; text-transform: uppercase; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #bbb; }
    .strip { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #333; margin-top: 10px; background: #fff; }
    .strip > div { padding: 7px 10px; border-right: 1px solid #ccc; }
    .strip > div:last-child { border-right: none; }
    .strip-label { font-size: 8.5px; font-weight: 800; color: #333; text-transform: uppercase; }
    .strip-val { font-size: 11px; font-weight: 700; margin-top: 2px; color: #000; }
    .section-heading { font-size: 10.5px; font-weight: 800; text-transform: uppercase; margin-top: 12px; margin-bottom: 4px; color: #000; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; background: #fff; }
    th { background: #fff; color: #000; text-align: left; padding: 6px 8px; font-size: 9.5px; text-transform: uppercase; border-top: 1px solid #000; border-bottom: 2px solid #000; }
    td { border-bottom: 1px solid #ccc; padding: 6px 8px; vertical-align: top; color: #000; }
    .fin-box { border: 1px solid #333; padding: 10px 12px; margin-top: 12px; background: #fff; }
    .fin-row { display: flex; justify-content: space-between; margin-bottom: 4px; color: #111; }
    .fin-total { display: flex; justify-content: space-between; border-top: 2px solid #000; padding-top: 7px; margin-top: 6px; font-size: 14px; font-weight: 900; color: #000; }
    .notes { border: 1px solid #555; background: #fff; padding: 9px 12px; margin-top: 10px; font-size: 11px; color: #111; }
    .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 42px; }
    .sig-line { border-top: 1px solid #333; padding-top: 5px; text-align: center; font-size: 10px; font-weight: 700; color: #111; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoSrcForHtml ? `<img src="${escapeHtml(logoSrcForHtml)}" alt="${escapeHtml(companyName)}" class="brand-logo" />` : `<div class="brand-title">${escapeHtml(companyName)}</div><div class="brand-slogan">${escapeHtml(slogan)}</div>`}
      <div class="brand-contact">${escapeHtml([siteSettings.direccion, siteSettings.telefonoPrincipal, siteSettings.email].filter(Boolean).join(' • '))}</div>
    </div>
    <div class="doc-meta">
      <div class="doc-label">Contrato de Alquiler</div>
      <div class="doc-num">${escapeHtml(contract.numeroContrato)}</div>
      ${contract.titulo ? `<div style="font-size:11px;font-weight:700;color:#111;margin-top:2px;">${escapeHtml(contract.titulo)}</div>` : ''}
      <div class="doc-sub">Estado: ${escapeHtml(contract.estado.replace(/_/g, ' '))}${contract.cotizacionNumero ? ` | Cot. #${escapeHtml(contract.cotizacionNumero)}` : ''}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">1. Cliente / Razón Social y Obra</div>
      <div style="font-size:13px;font-weight:800;margin-bottom:4px;">${escapeHtml(contract.clienteNombre)}</div>
      <div>${contract.clienteDocumento ? `CUIT/DNI: ${escapeHtml(contract.clienteDocumento)}` : ''} ${contract.clienteCondicionIva ? `(${escapeHtml(String(contract.clienteCondicionIva).replace(/_/g, ' '))})` : ''}</div>
      <div style="margin-top:4px;">Obra: ${escapeHtml(contract.direccionObra)}${contract.localidadObra ? ` • ${escapeHtml(contract.localidadObra)}` : ''}</div>
      <div style="margin-top:2px;">Tel: ${escapeHtml(contract.clienteTelefono || 'Sin teléfono')}</div>
    </div>
    <div class="card">
      <div class="card-title">2. Equipo Asignado y Operador</div>
      <div style="font-size:10px;font-family:monospace;color:#222;margin-bottom:4px;">
        ${contract.equipoCodigoInterno ? `CÓD. INT: ${escapeHtml(contract.equipoCodigoInterno)}` : ''} ${contract.equipoCodigo ? `| N° EQ: ${escapeHtml(contract.equipoCodigo)}` : ''}
      </div>
      <div style="font-size:13px;font-weight:800;margin-bottom:4px;">${escapeHtml(contract.equipoModelo)}</div>
      <div>${contract.operarioIncluido ? `CON Operario: <strong>${escapeHtml(contract.operarioNombre)}</strong>` : 'Modalidad: Alquiler SIN Operador'}</div>
      <div style="margin-top:2px;">Horómetro Salida: ${escapeHtml(contract.horometroSalida || 0)} Hs/Km</div>
    </div>
  </div>

  <div class="strip">
    <div><div class="strip-label">Modalidad / Cant.</div><div class="strip-val">${escapeHtml(contract.duracion)} ${contract.modalidad === 'DIAS' ? 'Días' : 'Horas'}</div></div>
    <div><div class="strip-label">Fecha Salida</div><div class="strip-val">${escapeHtml(contract.fechaInicio)} (${escapeHtml(contract.horaInicio || '08:00')})</div></div>
    <div><div class="strip-label">Devolución Est.</div><div class="strip-val">${escapeHtml(contract.fechaFinEstimada)} (${escapeHtml(contract.horaFinEstimada || '18:00')})</div></div>
    <div><div class="strip-label">Condición</div><div class="strip-val">${escapeHtml(contract.condicionVenta || 'A convenir')}</div></div>
  </div>

  <div class="section-heading">Renglones de Máquinas, Equipos y Aditamentos (${rows.length})</div>
  <table>
    <thead>
      <tr>
        <th>Cód.</th>
        <th>Máquina / Equipo / Servicio</th>
        <th>Aditamento / Obs.</th>
        <th style="text-align:center;">Cant.</th>
        <th style="text-align:right;">Precio Unit.</th>
        <th style="text-align:right;">Importe</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="fin-box">
    <div class="card-title">3. Resumen Económico y Fiscal (${contractCurrency === 'USD' ? 'Expresado en Dólares USD' : 'Pesos ARS'})</div>
    ${buildSummaryLines()
      .map(
        sl =>
          `<div class="fin-row"><span>${sl.isBold ? `<strong>${escapeHtml(sl.label)}</strong>` : escapeHtml(sl.label)}</span><strong>${escapeHtml(sl.value)}</strong></div>`
      )
      .join('')}
    <div class="fin-total"><span>${contractCurrency === 'USD' ? 'TOTAL CONTRATO (USD):' : 'TOTAL CONTRATO:'}</span><span>${escapeHtml(formatCurrency(contract.totalAlquiler, contractCurrency))}</span></div>
    ${contractCurrency === 'USD' && contract.cotizacionDolar ? `<div style="font-size:10px;color:#333;margin-top:4px;text-align:right;">Cotiz. Ref.: $${escapeHtml(contract.cotizacionDolar)} • Equiv. ARS: ${escapeHtml(formatCurrency(contract.totalAlquiler * contract.cotizacionDolar, 'ARS'))}</div>` : ''}
  </div>

  ${(contract.condicionEntrega || contract.observaciones) ? `<div class="notes">${contract.condicionEntrega ? `<div><strong>Condición de Entrega:</strong> ${escapeHtml(contract.condicionEntrega)}</div>` : ''}${contract.observaciones ? `<div style="margin-top:3px;"><strong>Observaciones:</strong> ${escapeHtml(contract.observaciones)}</div>` : ''}</div>` : ''}

  <div class="sigs">
    <div class="sig-line">Por ${escapeHtml(companyName)}</div>
    <div class="sig-line">Firma, Aclaración y DNI (Cliente / Recepción)</div>
  </div>
</body>
</html>`;

    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            // Fallback silently to PDF suggestion banner
          }
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 2500);
        }, 350);
      }
      setPrintHintMsg('Impresión enviada en diseño Blanco y Negro (ahorro de tinta) con logo. Si el visor integrado bloquea la impresora, tocá "Descargar PDF A4".');
    } catch {
      handleDownloadPdf();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#16191F] border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="bg-zinc-950 px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#F0C800] flex items-center justify-center text-zinc-950 font-black">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black text-white">
                  Contrato {contract.numeroContrato}
                </h3>
                {contract.titulo && (
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/35 text-cyan-200 text-xs font-bold">
                    {contract.titulo}
                  </span>
                )}
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    contract.estado === 'ACTIVO'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : contract.estado === 'PENDIENTE_ENTREGA'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                  }`}
                >
                  {contract.estado.replace('_', ' ')}
                </span>
                {contract.cotizacionNumero && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#F0C800]/15 border border-[#F0C800]/40 text-[#F0C800] text-[10px] font-black flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    Cotización #{contract.cotizacionNumero}
                  </span>
                )}
                {contractCurrency === 'USD' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black">
                    MONEDA: DÓLARES USD
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                La Hormiga • Comprobante Operativo y Fiscal de Alquiler
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Customer & Equipment Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cliente & Datos Fiscales */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black text-[#F0C800] uppercase">
                <Building2 className="w-4 h-4" />
                1. Cliente / Razón Social y Obra
              </div>
              <p className="text-sm font-black text-white">{contract.clienteNombre}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300 font-mono">
                {contract.clienteDocumento && <span>CUIT/DNI: {contract.clienteDocumento}</span>}
                {contract.clienteCondicionIva && (
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-sans font-bold">
                    {String(contract.clienteCondicionIva).replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <div className="pt-1 space-y-1 text-xs text-zinc-300">
                <p className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    {contract.direccionObra}
                    {contract.localidadObra ? ` • ${contract.localidadObra}` : ''}
                  </span>
                </p>
                <p className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{contract.clienteTelefono || 'Sin teléfono'}</span>
                </p>
              </div>
            </div>

            {/* Equipo & Operario */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black text-[#F0C800] uppercase">
                <Truck className="w-4 h-4" />
                2. Equipo Asignado & Operador
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {contract.equipoCodigoInterno && (
                  <span className="px-2 py-0.5 rounded bg-[#F0C800] text-zinc-950 font-mono text-[10px] font-black">
                    CÓD. INT: {contract.equipoCodigoInterno}
                  </span>
                )}
                {contract.equipoCodigo && (
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono text-[10px] font-bold">
                    N° EQ: {contract.equipoCodigo}
                  </span>
                )}
              </div>
              <p className="text-sm font-black text-white">{contract.equipoModelo}</p>
              <div className="pt-1 flex items-center gap-2 text-xs">
                <UserCheck className="w-4 h-4 text-zinc-400" />
                {contract.operarioIncluido ? (
                  <span className="font-bold text-emerald-400">
                    CON Operario: {contract.operarioNombre}
                  </span>
                ) : (
                  <span className="font-medium text-zinc-400">Alquiler SIN Operador</span>
                )}
              </div>
            </div>
          </div>

          {/* Line-by-Line Items & Aditamentos Table */}
          {(() => {
            const modalRows = buildRowsForDocument();
            return (
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[#F0C800] uppercase">
                    Renglones de Máquinas, Equipos y Aditamentos ({modalRows.length})
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[10px] font-black uppercase text-zinc-400">
                        <th className="py-1.5 pr-2">Cód. Int</th>
                        <th className="py-1.5 px-2">Máquina / Equipo / Servicio</th>
                        <th className="py-1.5 px-2 text-amber-400">Aditamento / Obs. de Línea</th>
                        <th className="py-1.5 px-2 text-center">Cant.</th>
                        <th className="py-1.5 px-2 text-right">Precio Unit.</th>
                        <th className="py-1.5 pl-2 text-right">Importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {modalRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-zinc-950/50">
                          <td className="py-2 pr-2 font-mono font-bold text-[#F0C800]">
                            {row.codigo}
                          </td>
                          <td className="py-2 px-2 font-bold text-white">{row.descripcion}</td>
                          <td className="py-2 px-2">
                            {row.observacion && row.observacion !== '—' ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold">
                                {row.observacion}
                              </span>
                            ) : (
                              <span className="text-zinc-600 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center font-mono text-zinc-200">
                            {row.cantidad}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-zinc-300">
                            {row.precioUnitario}
                          </td>
                          <td className="py-2 pl-2 text-right font-mono font-bold text-emerald-400">
                            {row.importe}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Dates & Horometer */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase block">
                Modalidad / Cantidad
              </span>
              <span className="text-sm font-black text-[#F0C800]">
                {contract.duracion} {contract.modalidad === 'DIAS' ? 'Días' : 'Horas'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase block">
                Fecha Salida
              </span>
              <span className="text-xs font-bold text-white">
                {contract.fechaInicio} ({contract.horaInicio || '08:00'})
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase block">
                Devolución Estimada
              </span>
              <span className="text-xs font-bold text-white">
                {contract.fechaFinEstimada} ({contract.horaFinEstimada || '18:00'})
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase block">
                Horómetro Salida
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {contract.horometroSalida || 0} Hs/Km
              </span>
            </div>
          </div>

          {/* Financial Summary (no duplicated line items) */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 space-y-2.5 text-xs">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#F0C800] mb-2">
              3. Resumen Económico y Fiscal ({contractCurrency === 'USD' ? 'Dólares USD' : 'Pesos ARS'})
            </h4>
            {buildSummaryLines().map((sl, idx) => (
              <div
                key={idx}
                className={`flex justify-between ${
                  sl.isDiscount
                    ? 'text-rose-400'
                    : sl.isTax
                      ? 'text-amber-400'
                      : sl.isBold
                        ? 'text-zinc-200 font-bold'
                        : 'text-zinc-300'
                }`}
              >
                <span>{sl.label}</span>
                <span className="font-mono font-bold">{sl.value}</span>
              </div>
            ))}
            <div className="pt-2.5 border-t border-zinc-800 flex justify-between items-center">
              <span className="text-sm font-black uppercase text-[#F0C800]">
                Total Contrato {contractCurrency === 'USD' ? '(USD)' : ''}:
              </span>
              <span className="text-xl font-black font-mono text-emerald-400">
                {formatCurrency(contract.totalAlquiler, contractCurrency)}
              </span>
            </div>
            {contractCurrency === 'USD' && contract.cotizacionDolar && contract.cotizacionDolar > 0 && (
              <div className="flex justify-between text-[11px] text-zinc-400">
                <span>Cotización Ref. (${contract.cotizacionDolar}):</span>
                <span className="font-mono font-bold text-zinc-200">
                  {formatCurrency(contract.totalAlquiler * contract.cotizacionDolar, 'ARS')}
                </span>
              </div>
            )}
          </div>

          {/* Notes */}
          {(contract.condicionEntrega || contract.observaciones) && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-1.5 text-xs text-zinc-300">
              {contract.condicionEntrega && (
                <p>
                  <strong className="text-white">Condición de Entrega:</strong>{' '}
                  {contract.condicionEntrega}
                </p>
              )}
              {contract.observaciones && (
                <p>
                  <strong className="text-white">Observaciones:</strong> {contract.observaciones}
                </p>
              )}
            </div>
          )}

          {/* 4. Fotos de Salida del Equipo, Contrato Firmado y Documentos Adjuntos */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#F0C800]/15 border border-[#F0C800]/40 flex items-center justify-center text-[#F0C800]">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#F0C800] flex items-center gap-2">
                    4. Fotos de Salida, Contrato Firmado y Adjuntos ({adjuntos.length})
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                      Reducción Automática WebP
                    </span>
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    Podés cargar fotos de cómo sale o vuelve el equipo, o adjuntar el contrato/remito firmado en PDF o foto.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={defaultCategory}
                  onChange={e => setDefaultCategory(e.target.value as RentalAttachmentCategory)}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-[11px] font-bold text-zinc-200 focus:outline-none focus:border-[#F0C800]"
                >
                  <option value="FOTO_SALIDA">📸 Foto Salida Equipo</option>
                  <option value="HOROMETRO_TABLERO">⏱️ Horómetro / Tablero</option>
                  <option value="CONTRATO_FIRMADO">✍️ Contrato / Remito Firmado</option>
                  <option value="DOCUMENTACION_CLIENTE">🪪 DNI / Seguro / OC</option>
                  <option value="ESTADO_DEVOLUCION">🔄 Foto Devolución</option>
                  <option value="OTRO">📎 Otro Documento</option>
                </select>

                <label
                  className={`px-3 py-1.5 rounded-lg bg-[#F0C800] hover:bg-amber-400 text-zinc-950 font-black text-[11px] flex items-center gap-1.5 transition cursor-pointer shadow ${
                    isUploading ? 'opacity-60 pointer-events-none' : ''
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  + Subir Fotos / PDF
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    disabled={isUploading}
                    onChange={e => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleDirectUploadFiles(e.target.files);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>

                <label
                  className={`px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-emerald-500/30 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer ${
                    isUploading ? 'opacity-60 pointer-events-none' : ''
                  }`}
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  + Contrato Firmado
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.pdf"
                    className="hidden"
                    disabled={isUploading}
                    onChange={e => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleDirectUploadFiles(e.target.files, 'CONTRATO_FIRMADO');
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {uploadBanner && (
              <div className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-emerald-300 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isUploading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#F0C800]" />}
                  <span>{uploadBanner}</span>
                </div>
                {!isUploading && (
                  <button
                    type="button"
                    onClick={() => setUploadBanner(null)}
                    className="text-zinc-400 hover:text-white text-[10px] cursor-pointer"
                  >
                    Cerrar
                  </button>
                )}
              </div>
            )}

            {adjuntos.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-zinc-800 rounded-xl text-zinc-400 text-xs">
                Todavía no hay fotos de salida ni documentos firmados cargados en este contrato. Usá los botones de arriba para subir y reducir fotos automáticamente.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {adjuntos.map(att => {
                  const isImage =
                    att.tipoArchivo === 'IMAGE' ||
                    /\.(webp|jpg|jpeg|png|gif)(\?|$)/i.test(att.url);
                  return (
                    <div
                      key={att.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 flex gap-2.5 items-start"
                    >
                      <div
                        onClick={() => setPreviewAttachment(att)}
                        className="w-16 h-16 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer relative group/thumb"
                      >
                        {isImage ? (
                          <img
                            src={att.url}
                            alt={att.nombre}
                            className="w-full h-full object-cover group-hover/thumb:scale-105 transition"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-amber-400">
                            <FileText className="w-6 h-6" />
                            <span className="text-[9px] font-black uppercase mt-0.5">
                              {att.tipoArchivo}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition">
                          <Eye className="w-4 h-4 text-white" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-[#F0C800] truncate">
                            {CATEGORY_LABELS[att.categoria] || att.categoria}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir / Descargar"
                              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                            >
                              <Download className="w-3 h-3" />
                            </a>
                            {onUpdateContract && (
                              <button
                                type="button"
                                onClick={() => handleDeleteAttachment(att.id)}
                                title="Eliminar adjunto"
                                className="p-1 rounded bg-zinc-800 hover:bg-rose-950 text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {onUpdateContract ? (
                          <input
                            type="text"
                            value={att.nota || ''}
                            onChange={e =>
                              handleUpdateAttachmentField(att.id, { nota: e.target.value })
                            }
                            placeholder="Nota (ej: Estado cubiertas / Remito firmado)"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#F0C800]"
                          />
                        ) : (
                          att.nota && <p className="text-[10px] text-zinc-300 truncate">{att.nota}</p>
                        )}

                        <div className="flex items-center justify-between gap-1 text-[9px] text-zinc-500 font-mono">
                          <span className="truncate max-w-[110px]" title={att.nombre}>
                            {att.nombre}
                          </span>
                          {att.optimizedSizeKB ? (
                            <span className="text-emerald-400 font-bold shrink-0">
                              {att.originalSizeKB && att.originalSizeKB > att.optimizedSizeKB
                                ? `${att.originalSizeKB}KB → ${att.optimizedSizeKB}KB (-${
                                    att.reductionPercentage ||
                                    Math.round(
                                      ((att.originalSizeKB - att.optimizedSizeKB) /
                                        att.originalSizeKB) *
                                        100
                                    )
                                  }%)`
                                : `${att.optimizedSizeKB} KB`}
                            </span>
                          ) : (
                            <span className="text-zinc-400 shrink-0">R2</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {previewAttachment && (
            <div
              onClick={() => setPreviewAttachment(null)}
              className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <div
                onClick={e => e.stopPropagation()}
                className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
              >
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-white uppercase">
                      {previewAttachment.nota || previewAttachment.nombre}
                    </h4>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      {CATEGORY_LABELS[previewAttachment.categoria] || previewAttachment.categoria} •{' '}
                      {previewAttachment.nombre}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={previewAttachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-[#F0C800] text-zinc-950 font-black text-xs flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Abrir / Descargar
                    </a>
                    <button
                      type="button"
                      onClick={() => setPreviewAttachment(null)}
                      className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-black/60 min-h-[320px]">
                  {previewAttachment.tipoArchivo === 'IMAGE' ||
                  /\.(webp|jpg|jpeg|png|gif)(\?|$)/i.test(previewAttachment.url) ? (
                    <img
                      src={previewAttachment.url}
                      alt={previewAttachment.nombre}
                      className="max-h-[75vh] max-w-full object-contain rounded-lg"
                    />
                  ) : (
                    <iframe
                      src={previewAttachment.url}
                      title={previewAttachment.nombre}
                      className="w-full h-[70vh] rounded-lg bg-white"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 5. Trazabilidad Comercial: Partes Diarios Vinculados, Facturas ARCA y Estado de Pago */}
          <div className="bg-zinc-950 border border-cyan-500/30 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-cyan-300">
                    5. Vínculos con Partes Diarios, Facturación ARCA & Estado de Cobro
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    Trazabilidad directa entre este Contrato de Alquiler, sus Partes Diarios en obra y su Factura ARCA.
                  </p>
                </div>
              </div>

              {/* Estado de Facturación + Estado de Cobro Badges */}
              <div className="flex flex-wrap items-center gap-2">
                {resolvedLinks.estadoFacturacion === 'FACTURADO' ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                    <Receipt className="w-3.5 h-3.5" />
                    FACTURADO {resolvedLinks.facturaNumero ? `• ${resolvedLinks.facturaNumero}` : ''}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                    SIN FACTURAR
                  </span>
                )}

                {resolvedLinks.estadoCobro === 'PAGADO' ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    PAGADO
                  </span>
                ) : resolvedLinks.estadoCobro === 'COBRADO_PARCIAL' ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    PAGO PARCIAL
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    PENDIENTE DE PAGO
                  </span>
                )}

                {onUpdateContract && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextCobro =
                        resolvedLinks.estadoCobro === 'PAGADO' ? 'PENDIENTE_PAGO' : 'PAGADO';
                      onUpdateContract({
                        ...contract,
                        estadoCobro: nextCobro,
                        montoCobrado: nextCobro === 'PAGADO' ? contract.totalAlquiler : 0,
                        fechaCobro:
                          nextCobro === 'PAGADO'
                            ? new Date().toISOString().slice(0, 10)
                            : undefined
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold cursor-pointer"
                  >
                    {resolvedLinks.estadoCobro === 'PAGADO' ? '↺ Pasar a Pendiente' : '✓ Marcar Pagado'}
                  </button>
                )}

                {onNavigateToCobranzas && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToCobranzas();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <DollarSign className="w-3 h-3" />
                    Ir a Cobranzas
                  </button>
                )}
              </div>
            </div>

            {/* Facturas ARCA Vinculadas */}
            {resolvedLinks.linkedInvoices.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase text-zinc-400">
                  Factura(s) ARCA Vinculada(s):
                </div>
                <div className="flex flex-wrap gap-2">
                  {resolvedLinks.linkedInvoices.map(inv => {
                    const isExt = isExternalMigratedInvoice(inv);
                    return (
                      <div
                        key={inv.id}
                        className={`px-3 py-1.5 rounded-lg bg-zinc-900 border text-xs flex flex-wrap items-center gap-2 font-mono ${
                          isExt ? 'border-orange-500/60' : 'border-cyan-500/30'
                        }`}
                      >
                        <Receipt className={`w-3.5 h-3.5 ${isExt ? 'text-orange-400' : 'text-cyan-400'}`} />
                        <span className="font-bold text-white">
                          {inv.tipoComprobante.replace('FACTURA_', 'FACT ')} #{formatInvoiceNumber(inv)}
                        </span>
                        {isExt && (
                          <span className="px-1.5 py-0.5 rounded bg-orange-500/25 border border-orange-400/60 text-orange-200 font-sans font-black text-[10px]">
                            ⚠️ OTRO SISTEMA
                          </span>
                        )}
                        <span className="text-zinc-400">({inv.fecha})</span>
                        <span className="font-bold text-emerald-400">
                          {formatCurrency(inv.importeTotal, inv.moneda)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Add Parte Diario */}
            {onUpdateContract && partesDiarios.length > 0 && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800">
                <select
                  value={quickAddParteId}
                  onChange={e => setQuickAddParteId(e.target.value)}
                  className="flex-1 min-w-0 w-full truncate bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                >
                  <option value="">-- Seleccionar Parte Diario para vincular a este Contrato --</option>
                  {partesDiarios
                    .filter(p => !resolvedLinks.linkedPartes.some(lp => lp.id === p.id))
                    .slice(0, 80)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        Parte #{p.numParte} ({p.fecha}) — {p.marcaModelo || p.codigoEquipo} — {p.nombreApellido} — {p.obra} ({p.tipo === 'VIAJES' ? `${p.viajesCantidad || 1} vjs` : `${Number(p.horasTrabajadas || p.hsCantidad || 0).toFixed(1)} hs`})
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!quickAddParteId}
                  onClick={() => {
                    if (!quickAddParteId) return;
                    const nextIds = Array.from(
                      new Set([...(contract.partesDiariosIds || []), quickAddParteId])
                    );
                    onUpdateContract({
                      ...contract,
                      partesDiariosIds: nextIds
                    });
                    setQuickAddParteId('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-zinc-950 font-black text-xs cursor-pointer shrink-0"
                >
                  + Vincular Parte Diario
                </button>
              </div>
            )}

            {/* Tabla de Partes Diarios Vinculados */}
            {resolvedLinks.linkedPartes.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-zinc-800 rounded-lg text-zinc-500 text-xs">
                Todavía no hay Partes Diarios vinculados a este contrato. Podés vincularlos desde el selector de arriba o desde la sección de Partes Diarios.
              </div>
            ) : (
              (() => {
                let totalHsDeclaradas = 0;
                let totalViajes = 0;
                let totalDias = 0;
                let totalOdoHs = 0;
                let totalOdoKm = 0;

                const rowsWithOdo = resolvedLinks.linkedPartes.map(p => {
                  if (p.tipo === 'VIAJES') totalViajes += Number(p.viajesCantidad || 1);
                  else if (p.tipo === 'DIA') totalDias += Number(p.cantidadDias || 1);
                  else totalHsDeclaradas += Number(p.horasTrabajadas || p.hsCantidad || 0);

                  const odo = getParteOdometerCellData(p);
                  if (odo.worked !== undefined && odo.worked > 0) {
                    if (odo.unit === 'km') totalOdoKm += odo.worked;
                    else totalOdoHs += odo.worked;
                  }
                  return { p, odo };
                });

                const declaredSummaryParts: string[] = [];
                if (totalHsDeclaradas > 0) declaredSummaryParts.push(`${totalHsDeclaradas.toFixed(1)} hs`);
                if (totalViajes > 0) declaredSummaryParts.push(`${totalViajes} viajes`);
                if (totalDias > 0) declaredSummaryParts.push(`${totalDias} días`);

                const odoSummaryParts: string[] = [];
                if (totalOdoHs > 0) odoSummaryParts.push(`${totalOdoHs.toLocaleString('es-AR', { maximumFractionDigits: 1 })} hs`);
                if (totalOdoKm > 0) odoSummaryParts.push(`${totalOdoKm.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`);

                return (
                  <div className="overflow-x-auto rounded-lg border border-zinc-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-900 text-zinc-400 text-[10px] uppercase font-bold">
                        <tr>
                          <th className="py-2.5 px-3 whitespace-nowrap">Nº PARTE</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">FECHA</th>
                          <th className="py-2.5 px-3">EQUIPO</th>
                          <th className="py-2.5 px-3">OPERARIO</th>
                          <th className="py-2.5 px-3">OBRA</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">TRABAJO</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">SEGÚN ODÓM. / HORÓM.</th>
                          {onUpdateContract && <th className="py-2.5 px-3 text-right whitespace-nowrap">QUITAR</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/80 bg-zinc-950">
                        {rowsWithOdo.map(({ p, odo }) => {
                          const workedColor =
                            odo.unit === 'km'
                              ? 'text-sky-300'
                              : odo.coincidencia === 'COINCIDE'
                                ? 'text-emerald-300'
                                : odo.coincidencia === 'DESVIO_LEVE'
                                  ? 'text-amber-300'
                                  : odo.coincidencia === 'DESFASAJE'
                                    ? 'text-rose-300'
                                    : 'text-emerald-300';

                          const fmtReading = (val: number) =>
                            `${odo.isApprox ? '~' : ''}${val.toLocaleString('es-AR', { maximumFractionDigits: 1 })}`;

                          return (
                            <tr key={p.id} className="hover:bg-zinc-900/40 transition-colors">
                              <td className="py-2 px-3 font-mono font-bold text-[#F0C800] whitespace-nowrap">
                                #{p.numParte}
                              </td>
                              <td className="py-2 px-3 font-mono text-zinc-300 whitespace-nowrap">
                                {p.fecha}
                              </td>
                              <td className="py-2 px-3 text-white font-semibold">
                                {p.marcaModelo || p.codigoEquipo}
                              </td>
                              <td className="py-2 px-3 text-zinc-300">{p.nombreApellido}</td>
                              <td className="py-2 px-3 text-zinc-400">{p.obra}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-cyan-300 whitespace-nowrap">
                                {p.tipo === 'VIAJES'
                                  ? `${p.viajesCantidad || 1} viajes`
                                  : p.tipo === 'DIA'
                                    ? `${p.cantidadDias || 1} día(s)`
                                    : `${Number(p.horasTrabajadas || p.hsCantidad || 0).toFixed(1)} hs`}
                              </td>
                              <td className="py-2 px-3 text-right font-mono whitespace-nowrap" title={odo.tooltip}>
                                <div className="flex flex-col items-end leading-tight">
                                  {/* Arriba: Horas o Kms hechos según odómetro/horómetro */}
                                  {odo.worked !== undefined ? (
                                    <span className={`font-black text-xs ${workedColor}`}>
                                      {odo.isApprox ? '~' : '+'}
                                      {odo.worked.toLocaleString('es-AR', { maximumFractionDigits: 1 })} {odo.unit}
                                    </span>
                                  ) : odo.statusLabel ? (
                                    <span className="text-[11px] font-bold text-amber-300/90">
                                      {odo.statusLabel}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-zinc-600">—</span>
                                  )}

                                  {/* Pegado abajo: Odómetro de inicio y fin */}
                                  {odo.ini !== undefined && odo.fin !== undefined ? (
                                    <span className="text-[10px] text-zinc-400 mt-0.5">
                                      Ini: <span className="text-zinc-300">{fmtReading(odo.ini)}</span> → Fin:{' '}
                                      <span className="text-zinc-200 font-semibold">{fmtReading(odo.fin)}</span>{' '}
                                      <span className="text-zinc-500">{odo.unit}</span>
                                    </span>
                                  ) : odo.fin !== undefined ? (
                                    <span className="text-[10px] text-zinc-400 mt-0.5">
                                      Fin: <span className="text-zinc-200 font-semibold">{fmtReading(odo.fin)}</span>{' '}
                                      <span className="text-zinc-500">{odo.unit}</span>
                                    </span>
                                  ) : odo.ini !== undefined ? (
                                    <span className="text-[10px] text-zinc-400 mt-0.5">
                                      Ini: <span className="text-zinc-300">{fmtReading(odo.ini)}</span>{' '}
                                      <span className="text-zinc-500">{odo.unit}</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-zinc-600 mt-0.5">Sin odómetro</span>
                                  )}
                                </div>
                              </td>
                              {onUpdateContract && (
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextIds = resolvedLinks.linkedPartes
                                        .filter(lp => lp.id !== p.id)
                                        .map(lp => lp.id);
                                      onUpdateContract({
                                        ...contract,
                                        partesDiariosIds: nextIds
                                      });
                                    }}
                                    className="text-rose-400 hover:text-rose-300 text-[10px] font-bold cursor-pointer"
                                  >
                                    Desvincular
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-zinc-900/90 border-t border-zinc-800 text-[11px] font-mono">
                        <tr>
                          <td colSpan={5} className="py-2 px-3 font-sans font-bold text-zinc-400">
                            Totales ({rowsWithOdo.length} parte{rowsWithOdo.length === 1 ? '' : 's'})
                          </td>
                          <td className="py-2 px-3 text-right font-black text-cyan-300 whitespace-nowrap">
                            {declaredSummaryParts.join(' • ') || '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-black text-emerald-300 whitespace-nowrap">
                            {odoSummaryParts.join(' • ') || '—'}
                          </td>
                          {onUpdateContract && <td className="py-2 px-3" />}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()
            )}
          </div>

          {printHintMsg && (
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0" />
                <span>{printHintMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setPrintHintMsg(null)}
                className="text-amber-300 hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-3.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-bold text-emerald-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
            >
              <FileDown className="w-4 h-4" />
              {isGeneratingPdf ? 'Generando PDF...' : 'Descargar PDF A4'}
            </button>
            <button
              type="button"
              onClick={handlePrintContract}
              className="px-3.5 py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer transition"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(contract);
                }}
                className="px-3.5 py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold text-cyan-400 flex items-center gap-1.5 cursor-pointer transition"
              >
                <Edit3 className="w-4 h-4" /> Editar
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onInvoiceInArca && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onInvoiceInArca(contract);
                }}
                className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-amber-400 text-zinc-950 text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition"
              >
                <Receipt className="w-4 h-4" /> Facturar este Alquiler en ARCA
              </button>
            )}
            {onFinalize && contract.estado !== 'FINALIZADO' && (
              <button
                type="button"
                onClick={() => {
                  onFinalize(contract.id);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition"
              >
                <CheckCircle2 className="w-4 h-4" /> Finalizar y Devolver Equipo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
