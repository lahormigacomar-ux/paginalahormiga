/**
 * Optimizador de Imágenes para La Hormiga
 * Convierte y comprime imágenes en el navegador antes de enviarlas a Cloudflare R2:
 * - Estandariza a formato WebP moderno (o JPEG de alta compatibilidad).
 * - Escala proporcionalmente fotos pesadas de cámaras móviles (de 12-48MP a resoluciones óptimas para web).
 * - Reduce el peso de 5MB - 12MB a ~120KB - 300KB (reducción típica de 90% a 96%), sin pérdida visual.
 * - Asegura subidas ultra rápidas incluso con conexiones 3G/4G en obra.
 */

export interface OptimizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 a 1.0 (0.80 - 0.85 recomendado para excelente balance)
  format?: 'image/webp' | 'image/jpeg' | 'image/png';
  fileName?: string;
  preserveTransparency?: boolean;
}

export interface OptimizedResult {
  base64: string;
  blob: Blob;
  fileName: string;
  contentType: string;
  originalSizeKB: number;
  optimizedSizeKB: number;
  reductionPercentage: number;
}

/**
 * Carga un File, Blob o Data URL en un elemento HTMLImageElement
 */
function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('No se pudo decodificar la imagen: ' + err));
    img.src = source;
  });
}

/**
 * Convierte un File o Blob a Data URL (base64)
 */
function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Optimiza, redimensiona y unifica el formato de una imagen en el navegador
 */
export async function optimizeImage(
  input: File | Blob | string,
  options: OptimizeOptions = {}
): Promise<OptimizedResult> {
  const {
    maxWidth = 1400,
    maxHeight = 1400,
    quality = 0.85,
    format = 'image/webp',
    fileName = 'imagen_optimizada.webp',
    preserveTransparency = true,
  } = options;

  let originalDataUrl: string;
  let originalBytes = 0;

  if (typeof input === 'string') {
    originalDataUrl = input;
    const base64Clean = input.replace(/^data:image\/\w+;base64,/, '');
    originalBytes = Math.round((base64Clean.length * 3) / 4);
  } else {
    originalBytes = input.size;
    originalDataUrl = await fileToDataUrl(input);
  }

  // Cargar imagen
  const img = await loadImage(originalDataUrl);

  // Calcular nuevas dimensiones manteniendo relación de aspecto
  let width = img.naturalWidth || img.width || 800;
  let height = img.naturalHeight || img.height || 600;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  // Crear canvas optimizado
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);

  const ctx = canvas.getContext('2d', { alpha: preserveTransparency });
  if (!ctx) {
    throw new Error('No se pudo inicializar el motor de renderizado 2D.');
  }

  if (!preserveTransparency) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  // Suavizado de imagen de alta fidelidad
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(img, 0, 0, width, height);

  // Determinar formato de salida
  let targetFormat = format;
  let outputDataUrl = '';
  
  try {
    outputDataUrl = canvas.toDataURL(targetFormat, quality);
  } catch {
    targetFormat = 'image/png';
    outputDataUrl = canvas.toDataURL(targetFormat);
  }

  // Fallback si webp no es soportado
  if (targetFormat === 'image/webp' && !outputDataUrl.startsWith('data:image/webp')) {
    targetFormat = preserveTransparency ? 'image/png' : 'image/jpeg';
    outputDataUrl = canvas.toDataURL(targetFormat, quality);
  }

  // Generar Blob
  const base64Clean = outputDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(base64Clean);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: targetFormat });

  const ext = targetFormat === 'image/webp' ? '.webp' : targetFormat === 'image/png' ? '.png' : '.jpg';
  const cleanBaseName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const finalFileName = `${cleanBaseName}${ext}`;

  const originalSizeKB = Math.round(originalBytes / 1024);
  const optimizedSizeKB = Math.round(blob.size / 1024);
  const reductionPercentage = originalBytes > 0 
    ? Math.max(0, Math.round(((originalBytes - blob.size) / originalBytes) * 100))
    : 0;

  return {
    base64: outputDataUrl,
    blob,
    fileName: finalFileName,
    contentType: targetFormat,
    originalSizeKB,
    optimizedSizeKB,
    reductionPercentage,
  };
}
