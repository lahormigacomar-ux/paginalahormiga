/**
 * Utilidad integral para captura y lectura de imágenes desde el portapapeles (Clipboard API + Paste Events)
 * Compatible con capturas de pantalla (Snipping Tool, PrtScr), copias desde Photoshop/Canva, WhatsApp,
 * exploradores web, y archivos de imagen copiados.
 */

export interface ClipboardImageResult {
  file: File;
  base64: string;
  source: 'clipboard-item' | 'clipboard-text-url' | 'paste-event' | 'drop';
}

/**
 * Extrae un archivo de imagen o URL de un ClipboardEvent nativo (evento onPaste)
 */
export async function extractImageFromPasteEvent(
  e: React.ClipboardEvent | ClipboardEvent
): Promise<ClipboardImageResult | null> {
  const items = e.clipboardData?.items;
  if (!items) return null;

  // 1. Prioridad: Buscar un item de tipo imagen binario (captura de pantalla, imagen copiada)
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.indexOf('image') !== -1 || item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        const base64 = await fileToBase64(file);
        return {
          file,
          base64,
          source: 'paste-event',
        };
      }
    }
  }

  // 2. Segunda opción: Buscar texto que sea URL de imagen o Data URL
  const text = e.clipboardData?.getData('text');
  if (text) {
    const cleanText = text.trim();
    if (
      cleanText.startsWith('data:image/') ||
      cleanText.match(/^https?:\/\/.*\.(png|jpg|jpeg|webp|svg|gif)(\?.*)?$/i)
    ) {
      return {
        file: new File([], 'pasted-url-image', { type: 'image/jpeg' }),
        base64: cleanText,
        source: 'clipboard-text-url',
      };
    }
  }

  return null;
}

/**
 * Lee directamente del portapapeles del sistema mediante la API moderna navigator.clipboard
 */
export async function readImageFromClipboard(): Promise<ClipboardImageResult | null> {
  // 1. Intentar API navigator.clipboard.read() para items binarios
  if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1] || 'png';
          const file = new File([blob], `captura-portapapeles-${Date.now()}.${ext}`, { type: imageType });
          const base64 = await fileToBase64(file);
          return {
            file,
            base64,
            source: 'clipboard-item',
          };
        }
      }
    } catch (err: any) {
      console.warn('[Clipboard] navigator.clipboard.read() no disponible o permiso denegado:', err);
    }
  }

  // 2. Fallback: Intentar navigator.clipboard.readText() para Data URLs o URLs web
  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (
        text.startsWith('data:image/') ||
        text.match(/^https?:\/\/.*\.(png|jpg|jpeg|webp|svg|gif)(\?.*)?$/i)
      ) {
        return {
          file: new File([], 'pasted-url-image', { type: 'image/jpeg' }),
          base64: text,
          source: 'clipboard-text-url',
        };
      }
    } catch (err) {
      console.warn('[Clipboard] navigator.clipboard.readText() falló:', err);
    }
  }

  return null;
}

/**
 * Extrae imagen desde un DragEvent (arrastrar y soltar archivo)
 */
export async function extractImageFromDropEvent(
  e: React.DragEvent
): Promise<ClipboardImageResult | null> {
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    const file = files[0];
    if (file.type.startsWith('image/')) {
      const base64 = await fileToBase64(file);
      return {
        file,
        base64,
        source: 'drop',
      };
    }
  }
  return null;
}

/**
 * Convierte un File o Blob a Data URL Base64
 */
export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
