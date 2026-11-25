import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Clipboard, 
  Image as ImageIcon, 
  Check, 
  Trash2, 
  RefreshCw, 
  Sparkles,
  ExternalLink,
  Layers
} from 'lucide-react';
import { 
  extractImageFromPasteEvent, 
  readImageFromClipboard, 
  extractImageFromDropEvent, 
  fileToBase64 
} from '../../utils/clipboardImage';
import { optimizeImage } from '../../services/imageOptimizer';

export interface ImageClipboardDropzoneProps {
  currentImageUrl?: string;
  onImageChange: (base64OrUrl: string, file?: File) => void;
  onImageRemove?: () => void;
  label?: string;
  sublabel?: string;
  aspectRatio?: 'square' | 'video' | 'banner' | 'auto';
  placeholderText?: string;
  compact?: boolean;
  allowUrlInput?: boolean;
  maxSizeMB?: number;
  containerId?: string;
}

export const ImageClipboardDropzone: React.FC<ImageClipboardDropzoneProps> = ({
  currentImageUrl,
  onImageChange,
  onImageRemove,
  label = 'Fotografía / Imagen',
  sublabel = 'Suba desde su equipo, arrastre o pegue directamente desde el portapapeles (Ctrl+V)',
  aspectRatio = 'video',
  placeholderText = 'Pegar imagen con Ctrl+V, arrastrar aquí o hacer clic para explorar',
  compact = false,
  allowUrlInput = true,
  maxSizeMB = 10,
  containerId,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isPasting, setIsPasting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [showUrlField, setShowUrlField] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  const showFeedback = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 3500);
  }, []);

  // Process and emit image with automatic smart compression
  const processImageFile = useCallback(async (file: File, sourceDescription: string) => {
    if (!file.type.startsWith('image/')) {
      showFeedback('El archivo no es una imagen válida (use PNG, JPG, WebP o SVG)', 'error');
      return;
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      showFeedback(`La imagen supera el límite de ${maxSizeMB}MB`, 'error');
      return;
    }

    try {
      let finalBase64 = '';
      const isPngOrSvg = file.type === 'image/png' || file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.png') || file.name.toLowerCase().endsWith('.svg');
      
      try {
        const opt = await optimizeImage(file, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.86,
          format: isPngOrSvg ? 'image/png' : 'image/webp',
          preserveTransparency: isPngOrSvg,
          fileName: file.name
        });
        finalBase64 = opt.base64;
      } catch (optErr) {
        console.warn('Fallback optimizer, reading raw file:', optErr);
        finalBase64 = await fileToBase64(file);
      }

      onImageChange(finalBase64, file);
      showFeedback(`Archivo listo (${sourceDescription}). Subiendo a Cloudflare R2...`, 'info');
    } catch (err) {
      console.error('Error procesando imagen:', err);
      showFeedback('Error al procesar el archivo de imagen', 'error');
    }
  }, [maxSizeMB, onImageChange, showFeedback]);

  // Handle native file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file, 'desde archivo local');
    }
    // Reset file input so user can pick the same file again if wanted
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle clipboard paste via button click (navigator.clipboard API)
  const handlePasteFromClipboard = async () => {
    setIsPasting(true);
    try {
      const result = await readImageFromClipboard();
      if (result) {
        if (result.source === 'clipboard-text-url') {
          onImageChange(result.base64);
          showFeedback('¡URL de imagen aplicada desde el portapapeles!', 'success');
        } else {
          onImageChange(result.base64, result.file);
          showFeedback('Imagen leída del portapapeles. Subiendo a Cloudflare R2...', 'info');
        }
      } else {
        showFeedback('No se detectó ninguna imagen en el portapapeles. Copia una imagen o captura de pantalla y vuelve a intentar, o presiona Ctrl+V', 'info');
      }
    } catch (err: any) {
      console.warn('Clipboard read error:', err);
      showFeedback('Presione Ctrl+V en su teclado para pegar la imagen copiada', 'info');
    } finally {
      setIsPasting(false);
    }
  };

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const result = await extractImageFromDropEvent(e);
    if (result) {
      processImageFile(result.file, 'arrastrada');
    } else {
      showFeedback('Por favor arrastre un archivo de imagen válido', 'error');
    }
  };

  // Handle Paste event directly on the dropzone or its children
  const handlePaste = async (e: React.ClipboardEvent) => {
    const result = await extractImageFromPasteEvent(e);
    if (result) {
      e.preventDefault();
      e.stopPropagation();
      if (result.source === 'clipboard-text-url') {
        onImageChange(result.base64);
        showFeedback('¡URL de imagen aplicada desde el portapapeles!', 'success');
      } else {
        onImageChange(result.base64, result.file);
        showFeedback('Imagen pegada. Subiendo a Cloudflare R2...', 'info');
      }
    }
  };

  // Apply manual URL
  const handleApplyUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUrl.trim()) return;
    onImageChange(manualUrl.trim());
    showFeedback('¡URL de imagen asignada correctamente!', 'success');
    setShowUrlField(false);
    setManualUrl('');
  };

  const ratioClasses = {
    square: 'aspect-square max-h-56',
    video: 'aspect-video max-h-64',
    banner: 'aspect-[21/9] max-h-48',
    auto: 'min-h-[160px] max-h-72',
  }[aspectRatio];

  return (
    <div 
      id={containerId} 
      className="space-y-2 select-none"
      onPaste={handlePaste}
      tabIndex={0}
      role="region"
      aria-label="Zona de carga y pegado de imágenes"
    >
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          {label && (
            <label className="block text-xs font-bold text-slate-200">
              {label}
            </label>
          )}
          {sublabel && (
            <p className="text-[11px] text-slate-400">
              {sublabel}
            </p>
          )}
        </div>

        {/* Quick action buttons badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handlePasteFromClipboard}
            disabled={isPasting}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
            title="Pegar imagen que tengas copiada en el portapapeles o captura de pantalla (Ctrl+V)"
          >
            <Clipboard className="w-3.5 h-3.5 shrink-0" />
            <span>{isPasting ? 'Leyendo...' : 'Pegar del Portapapeles'}</span>
            <kbd className="hidden sm:inline-block px-1 py-0.2 bg-black/40 rounded text-[9px] text-amber-300 font-mono">
              Ctrl+V
            </kbd>
          </button>

          {allowUrlInput && (
            <button
              type="button"
              onClick={() => setShowUrlField(!showUrlField)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium transition cursor-pointer"
              title="Ingresar URL web directa"
            >
              <ExternalLink className="w-3 h-3" />
              <span>URL</span>
            </button>
          )}
        </div>
      </div>

      {/* Manual URL Input dropdown */}
      {showUrlField && (
        <form onSubmit={handleApplyUrl} className="flex gap-2 p-2 bg-[#111317] border border-slate-700 rounded-xl animate-fade-in">
          <input
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="Pegar link https://..."
            className="flex-1 bg-[#16191F] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            autoFocus
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => setShowUrlField(false)}
            className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg"
          >
            Cancelar
          </button>
        </form>
      )}

      {/* Hidden native input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Feedback Toast Banner */}
      {feedbackMessage && (
        <div 
          className={`px-3 py-2 rounded-xl text-xs flex items-center gap-2 animate-fade-in font-medium ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : feedbackMessage.type === 'error'
              ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
              : 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <Sparkles className="w-4 h-4 shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Dropzone & Preview Container */}
      {currentImageUrl ? (
        <div className="relative group rounded-2xl overflow-hidden border border-slate-700 bg-[#0F1115] shadow-lg">
          <div className={`w-full ${ratioClasses} flex items-center justify-center bg-[#090A0D]`}>
            <img
              src={currentImageUrl}
              alt="Vista previa"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>

          {/* Hover Overlay Controls */}
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
            <p className="text-xs text-slate-200 font-bold text-center">
              Imagen seleccionada
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Cambiar Archivo</span>
              </button>

              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 text-xs font-bold rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Pegar Portapapeles (Ctrl+V)</span>
              </button>

              {onImageRemove && (
                <button
                  type="button"
                  onClick={onImageRemove}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Quitar</span>
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Tip: También podés presionar <kbd className="px-1 bg-black/50 rounded font-mono text-amber-300">Ctrl+V</kbd> para reemplazarla instantáneamente
            </p>
          </div>
        </div>
      ) : (
        /* Empty State Dropzone */
        <div
          ref={dropzoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center transition cursor-pointer ${
            isDragging
              ? 'border-amber-400 bg-amber-500/10 scale-[1.01]'
              : 'border-slate-700/80 bg-[#12141A] hover:bg-[#161922] hover:border-amber-500/60'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3 shadow-inner">
            {isDragging ? (
              <Layers className="w-6 h-6 animate-bounce" />
            ) : (
              <ImageIcon className="w-6 h-6" />
            )}
          </div>

          <h4 className="text-xs sm:text-sm font-bold text-slate-100 mb-1">
            {isDragging ? 'Soltá la imagen aquí' : 'Cargar o Pegar Fotografía'}
          </h4>

          <p className="text-[11px] sm:text-xs text-slate-400 max-w-sm mb-3">
            {placeholderText}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>Explorar Archivos</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePasteFromClipboard();
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-md"
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>Pegar Portapapeles</span>
              <kbd className="px-1 py-0.2 bg-black/20 rounded text-[9px] font-mono">
                Ctrl+V
              </kbd>
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 w-full flex items-center justify-center gap-3 text-[10px] text-slate-500">
            <span>PNG, JPG, WebP o SVG</span>
            <span>•</span>
            <span>Capturas de Pantalla directas</span>
            <span>•</span>
            <span>Máx {maxSizeMB}MB</span>
          </div>
        </div>
      )}
    </div>
  );
};
