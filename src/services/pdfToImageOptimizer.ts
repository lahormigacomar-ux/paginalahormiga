export interface PdfConvertedPage {
  pageNumber: number;
  totalPages: number;
  base64: string;
  blob: Blob;
  contentType: string;
  fileName: string;
  originalShareKB: number;
  optimizedSizeKB: number;
  reductionPercentage: number;
}

export interface PdfConvertOptions {
  maxDimension?: number;
  quality?: number;
  maxPages?: number;
  onProgress?: (pageNumber: number, totalPages: number) => void;
}

export interface PdfConvertResult {
  pages: PdfConvertedPage[];
  totalPdfPages: number;
  truncated: boolean;
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, workerMod]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/**
 * Convierte cada página de un archivo PDF a imagen WebP ultra-liviana (o JPEG fallback)
 * directamente en el navegador, logrando:
 * - Visualización instantánea en <img>, lightbox, rotación y selectores sin abrir visores PDF lentos.
 * - Reducción típica de 75% a 95% de peso manteniendo lectura nítida para facturas, remitos y partes.
 * - Compatibilidad directa con análisis OCR de IA.
 */
export async function convertPdfToOptimizedImages(
  file: File,
  options: PdfConvertOptions = {}
): Promise<PdfConvertResult> {
  const {
    maxDimension = 1600,
    quality = 0.82,
    maxPages = 15,
    onProgress,
  } = options;

  const pdfjs = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const totalPdfPages = pdf.numPages || 1;
  const pagesToRender = Math.min(totalPdfPages, maxPages);
  const truncated = totalPdfPages > maxPages;
  const originalShareKB = Math.max(1, Math.round(file.size / Math.max(1, pagesToRender) / 1024));
  const cleanBaseName = file.name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'documento';

  const pages: PdfConvertedPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber++) {
      onProgress?.(pageNumber, pagesToRender);

      const page = await pdf.getPage(pageNumber);
      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const largestSide = Math.max(baseViewport.width, baseViewport.height, 1);
        const targetScale = Math.min(2.5, Math.max(1.25, maxDimension / largestSide));
        const viewport = page.getViewport({ scale: targetScale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          throw new Error('No se pudo inicializar el canvas para renderizar el PDF.');
        }

        // Fondo blanco sólido (muchos PDFs tienen fondo transparente)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          background: '#ffffff',
        }).promise;

        let targetFormat: 'image/webp' | 'image/jpeg' = 'image/webp';
        let outputDataUrl = '';

        try {
          outputDataUrl = canvas.toDataURL('image/webp', quality);
        } catch {
          outputDataUrl = '';
        }

        if (!outputDataUrl.startsWith('data:image/webp')) {
          targetFormat = 'image/jpeg';
          outputDataUrl = canvas.toDataURL('image/jpeg', Math.min(0.86, quality + 0.04));
        }

        const base64Body = outputDataUrl.replace(/^data:image\/\w+;base64,/, '');
        const binaryStr = atob(base64Body);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: targetFormat });
        const ext = targetFormat === 'image/webp' ? '.webp' : '.jpg';
        const optimizedSizeKB = Math.max(1, Math.round(blob.size / 1024));
        const reductionPercentage =
          originalShareKB > 0
            ? Math.max(0, Math.round(((originalShareKB - optimizedSizeKB) / originalShareKB) * 100))
            : 0;

        pages.push({
          pageNumber,
          totalPages: totalPdfPages,
          base64: outputDataUrl,
          blob,
          contentType: targetFormat,
          fileName: `${cleanBaseName}_p${pageNumber}${ext}`,
          originalShareKB,
          optimizedSizeKB,
          reductionPercentage,
        });

        canvas.width = 0;
        canvas.height = 0;
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return {
    pages,
    totalPdfPages,
    truncated,
  };
}
