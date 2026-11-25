import React, { useMemo, useState } from 'react';
import {
  Camera,
  Check,
  Eye,
  Filter,
  FolderOpen,
  Link2,
  Search,
  X,
  ZoomIn
} from 'lucide-react';
import { DocumentBagCategory, DocumentBagItem } from '../../types';

interface BolsaDocumentosPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DocumentBagItem[];
  onSelect: (doc: DocumentBagItem) => void;
  defaultCategory?: DocumentBagCategory | 'ALL';
  title?: string;
  subtitle?: string;
  selectedUrl?: string;
}

const CATEGORY_META: Record<DocumentBagCategory, { label: string; badgeClass: string }> = {
  COMBUSTIBLE: {
    label: 'Ticket Combustible',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  VALE_COMBUSTIBLE: {
    label: 'Vale Combustible',
    badgeClass: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  },
  PARTE_DIARIO: {
    label: 'Parte Diario',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  },
  FACTURA: {
    label: 'Factura',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  REMITO: {
    label: 'Remito',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
  OTRO: {
    label: 'Otro',
    badgeClass: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  },
};

export const BolsaDocumentosPickerModal: React.FC<BolsaDocumentosPickerModalProps> = ({
  isOpen,
  onClose,
  documents,
  onSelect,
  defaultCategory = 'ALL',
  title = 'Fotos cargadas en Docs (Bolsa de Documentos)',
  subtitle = 'Elegí una foto ya subida a Cloudflare R2 para adjuntarla y vincularla automáticamente.',
  selectedUrl,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<DocumentBagCategory | 'ALL'>(defaultCategory);
  const [onlyPending, setOnlyPending] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [previewDoc, setPreviewDoc] = useState<DocumentBagItem | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setCategoryFilter(defaultCategory);
      setPreviewDoc(null);
    }
  }, [isOpen, defaultCategory]);

  const sortedAndFiltered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...documents]
      .sort((a, b) => (b.createdAt || b.fechaCaptura || '').localeCompare(a.createdAt || a.fechaCaptura || ''))
      .filter((doc) => {
        if (categoryFilter !== 'ALL' && doc.categoria !== categoryFilter) return false;
        if (onlyPending && doc.estado === 'VINCULADO') return false;
        if (!q) return true;
        return (
          (doc.nota || '').toLowerCase().includes(q) ||
          (doc.fechaCaptura || '').toLowerCase().includes(q) ||
          (doc.uploadedBy || '').toLowerCase().includes(q) ||
          (doc.linkedTargetLabel || '').toLowerCase().includes(q) ||
          (CATEGORY_META[doc.categoria]?.label || doc.categoria).toLowerCase().includes(q)
        );
      });
  }, [documents, categoryFilter, onlyPending, searchTerm]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { ALL: documents.length };
    for (const d of documents) {
      map[d.categoria] = (map[d.categoria] || 0) + 1;
    }
    return map;
  }, [documents]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-[#12151B] border border-slate-700/80 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-black/90 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-[#F0C800] border border-amber-500/30">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>{title}</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                  {documents.length} fotos
                </span>
              </h3>
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 bg-[#16191F] border-b border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nota, fecha, usuario o vinculación..."
                className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setOnlyPending((prev) => !prev)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition cursor-pointer ${
                onlyPending
                  ? 'bg-[#F0C800]/15 text-[#F0C800] border-[#F0C800]/40'
                  : 'bg-[#0F1115] text-slate-300 border-slate-700 hover:border-slate-500'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{onlyPending ? 'Mostrando solo Sin Vincular' : 'Mostrar Todas (incl. vinculadas)'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', 'COMBUSTIBLE', 'VALE_COMBUSTIBLE', 'PARTE_DIARIO', 'FACTURA', 'REMITO', 'OTRO'] as const).map(
              (cat) => {
                const count = categoryCounts[cat] || 0;
                const active = categoryFilter === cat;
                const label = cat === 'ALL' ? 'Todas' : CATEGORY_META[cat].label;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      active
                        ? 'bg-[#F0C800] text-black border-[#F0C800]'
                        : 'bg-[#0F1115] text-slate-300 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5 bg-[#0B0D11]">
          {sortedAndFiltered.length === 0 ? (
            <div className="py-16 text-center space-y-2 border border-dashed border-slate-800 rounded-2xl">
              <Camera className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">
                No hay fotos cargadas en Docs con ese filtro
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Podés sacar o subir fotos desde el módulo <strong>Documentos</strong> del menú y después elegirlas desde acá sin volver a subirlas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedAndFiltered.map((doc) => {
                const meta = CATEGORY_META[doc.categoria] || CATEGORY_META.OTRO;
                const isSelected = Boolean(selectedUrl && selectedUrl === doc.url);
                return (
                  <div
                    key={doc.id}
                    className={`rounded-xl border overflow-hidden bg-[#16191F] flex flex-col transition ${
                      isSelected
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                        : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="relative h-44 bg-black group">
                      <img
                        src={doc.url}
                        alt={doc.nota || meta.label}
                        loading="lazy"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="absolute top-2 right-2 p-2 rounded-lg bg-black/75 hover:bg-black text-white border border-slate-700 opacity-90 hover:opacity-100 transition cursor-pointer"
                        title="Ampliar foto"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>

                      <span
                        className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded border ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </span>

                      {doc.estado === 'VINCULADO' ? (
                        <span className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <Link2 className="w-3 h-3" />
                          {doc.linkedTargetLabel || 'Vinculado'}
                        </span>
                      ) : (
                        <span className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-500/40">
                          Pendiente de vincular
                        </span>
                      )}
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span>
                            {doc.fechaCaptura} {doc.horaCaptura ? `• ${doc.horaCaptura}` : ''}
                          </span>
                          {doc.optimizedSizeKB ? <span>{doc.optimizedSizeKB} KB</span> : null}
                        </div>
                        {doc.nota ? (
                          <p className="text-xs text-slate-200 line-clamp-2">{doc.nota}</p>
                        ) : (
                          <p className="text-xs text-slate-500 italic">Sin nota adicional</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(doc);
                            onClose();
                          }}
                          className="flex-1 px-3 py-2 rounded-lg bg-[#F0C800] hover:bg-amber-400 text-black text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {isSelected ? 'Seleccionada' : 'Usar esta foto'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Full Image Zoom Preview Overlay */}
        {previewDoc && (
          <div
            className="fixed inset-0 z-[80] bg-black/95 flex flex-col items-center justify-center p-4"
            onClick={() => setPreviewDoc(null)}
          >
            <div
              className="max-w-5xl w-full max-h-[88vh] flex flex-col gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between text-white">
                <div className="text-xs space-y-0.5">
                  <p className="font-bold text-sm">
                    {CATEGORY_META[previewDoc.categoria]?.label || previewDoc.categoria} — {previewDoc.fechaCaptura}
                  </p>
                  {previewDoc.nota && <p className="text-slate-300">{previewDoc.nota}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(previewDoc);
                      setPreviewDoc(null);
                      onClose();
                    }}
                    className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    Usar esta foto
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-black rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center p-2">
                <img
                  src={previewDoc.url}
                  alt="Vista ampliada"
                  className="max-w-full max-h-[76vh] object-contain"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
