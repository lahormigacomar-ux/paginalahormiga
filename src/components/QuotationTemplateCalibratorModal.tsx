import React, { useState, useRef, useEffect } from 'react';
import { QuotationTemplateLayout, DEFAULT_QUOTATION_TEMPLATE_LAYOUT, Quotation } from '../types';
import { saveQuotationTemplateLayout } from '../services/storage';
import {
  X,
  RotateCcw,
  Save,
  Move,
  Type,
  Sliders,
  Check,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  MousePointer
} from 'lucide-react';

export const QUOTATION_TEMPLATE_IMAGE_LOCAL = '/cotizacion-v3.jpg';
export const QUOTATION_TEMPLATE_IMAGE_CDN = 'https://pub-b9eaa327b7214d2d9a3ac2ee74a0dcf8.r2.dev/templates/cotizacion-v3.jpg';

interface QuotationTemplateCalibratorModalProps {
  layout: QuotationTemplateLayout;
  onSaveLayout: (newLayout: QuotationTemplateLayout) => void;
  onClose: () => void;
  sampleQuotation?: Quotation;
}

export const QuotationTemplateCalibratorModal: React.FC<QuotationTemplateCalibratorModalProps> = ({
  layout,
  onSaveLayout,
  onClose,
  sampleQuotation
}) => {
  const [currentLayout, setCurrentLayout] = useState<QuotationTemplateLayout>({
    ...DEFAULT_QUOTATION_TEMPLATE_LAYOUT,
    ...layout
  });
  const [selectedFieldKey, setSelectedFieldKey] = useState<string>('razonSocial');
  const [isSavedAlert, setIsSavedAlert] = useState<boolean>(false);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [imgSrc, setImgSrc] = useState<string>(QUOTATION_TEMPLATE_IMAGE_LOCAL);

  // Dragging state on the A4 canvas
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const quot: Quotation = sampleQuotation || {
    id: 'COT-0001-00000001',
    puntoVenta: 1,
    numeroComprobante: 1,
    fechaEmision: new Date().toISOString().slice(0, 10),
    validoHasta: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    razonSocialReceptor: 'CONSTRUCTORA DEL NORTE S.R.L.',
    cuitReceptor: '30-71548921-9',
    domicilioReceptor: 'AV. SAVIO 1420',
    zonaReceptor: 'SUR',
    localidadReceptor: 'SAN SALVADOR DE JUJUY',
    telefonoReceptor: '388-4123456',
    condicionVenta: 'CONTADO / TRANSFERENCIA',
    monedaExpresada: 'PESOS ARGENTINOS',
    nombreVendedor: 'ADMINISTRACIÓN LA HORMIGA',
    observaciones: 'ENTREGA INMEDIATA EN OBRA',
    items: [
      {
        codigo: 'EQ-010',
        descripcion: 'ALQUILER EXCAVADORA VOLVO EC55B CON OPERARIO (JORNADA)',
        cantidad: 2,
        unidadMedida: 'DÍAS',
        precioUnitario: 350000,
        bonificacionPorcentaje: 0,
        importe: 700000,
        alicuotaIva: 21
      },
      {
        codigo: 'AR-001',
        descripcion: 'PROVISIÓN ARENA FINA DE RÍO EN CAMIÓN VOLCADOR',
        cantidad: 6,
        unidadMedida: 'M3',
        precioUnitario: 28000,
        bonificacionPorcentaje: 0,
        importe: 168000,
        alicuotaIva: 21
      }
    ],
    subtotalPedido: 868000,
    bonificacionTotal: 0,
    subtotalNeto: 868000,
    percepcionIibb: 0,
    ivaTotal: 182280,
    importeTotal: 1050280,
    estado: 'PENDIENTE',
    createdAt: new Date().toISOString()
  };

  const fieldLabels: Record<string, string> = {
    numComprobante: 'Comp. Nro (Nº de Cotización)',
    fechaEmision: 'Fecha de Emisión',
    validoHasta: 'Válido Hasta (Precios y condiciones)',
    razonSocial: 'Apellido y Nombre / Razón Social',
    domicilio: 'Domicilio Cliente',
    zona: 'Zona Cliente',
    localidad: 'Localidad Cliente',
    cuitReceptor: 'CUIT Cliente',
    telefonoReceptor: 'Teléfono Cliente',

    // Tabla y columnas
    tableItems: 'Tabla de Ítems (Inicio Y, Alto de Fila y Letra)',
    tableColCodigoX: 'Columna Tabla: Código de artículo (Eje X %)',
    tableColDescripcionX: 'Columna Tabla: Producto / Servicio (Eje X %)',
    tableColCantidadX: 'Columna Tabla: Cantidad (Eje X %)',
    tableColPrecioX: 'Columna Tabla: Precio Unit. (Eje X %)',
    tableColImporteX: 'Columna Tabla: Importe (Eje X %)',

    // Pie izquierdo
    condicionVenta: 'Condición de Venta',
    monedaExpresada: 'Los precios están expresados en (Moneda)',
    nombreVendedor: 'Nombre del Vendedor',
    observaciones: 'Observaciones',

    // Totales pie derecho
    totalsBlock: 'Bloque de Totales (Eje X General y Tamaño Letra)',
    totalsSubtotalY: 'Totales: Subtotal del pedido $ (Eje Y %)',
    totalsBonifY: 'Totales: Bonificación $ (Eje Y %)',
    totalsSubtotalNetoY: 'Totales: Subtotal Neto $ (Eje Y %)',
    totalsIibbY: 'Totales: Percepción IIBB $ (Eje Y %)',
    totalsIvaY: 'Totales: IVA $ (Eje Y %)',
    totalsTotalY: 'Totales: Importe Total $ (Eje Y %)'
  };

  const handleNudge = (dx: number, dy: number) => {
    setCurrentLayout(prev => {
      const updated = { ...prev };

      if (selectedFieldKey === 'tableItems') {
        updated.tableStartY = Number((updated.tableStartY + dy).toFixed(2));
      } else if (selectedFieldKey.startsWith('tableCol') && selectedFieldKey.endsWith('X')) {
        const key = selectedFieldKey as keyof QuotationTemplateLayout;
        const val = updated[key] as number;
        (updated as any)[key] = Number((val + dx).toFixed(2));
      } else if (selectedFieldKey === 'totalsBlock') {
        updated.totalsX = Number((updated.totalsX + dx).toFixed(2));
      } else if (selectedFieldKey.startsWith('totals') && selectedFieldKey.endsWith('Y')) {
        const key = selectedFieldKey as keyof QuotationTemplateLayout;
        const val = updated[key] as number;
        (updated as any)[key] = Number((val + dy).toFixed(2));
      } else {
        const obj = updated[selectedFieldKey as keyof QuotationTemplateLayout];
        if (typeof obj === 'object' && obj !== null && 'x' in obj) {
          (updated as any)[selectedFieldKey] = {
            ...obj,
            x: Number((obj.x + dx).toFixed(2)),
            y: Number((obj.y + dy).toFixed(2))
          };
        }
      }
      return updated;
    });
  };

  const handleResetToDefault = () => {
    setCurrentLayout({ ...DEFAULT_QUOTATION_TEMPLATE_LAYOUT });
    setConfirmReset(false);
  };

  const handleSave = () => {
    onSaveLayout(currentLayout);
    saveQuotationTemplateLayout(currentLayout);
    setIsSavedAlert(true);
    setTimeout(() => setIsSavedAlert(false), 3000);
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(576);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Mouse drag handlers for interactive field positioning on A4 preview
  useEffect(() => {
    if (!draggingKey) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !dragStartRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dxPct = ((e.clientX - dragStartRef.current.mouseX) / rect.width) * 100;
      const dyPct = ((e.clientY - dragStartRef.current.mouseY) / rect.height) * 100;

      const newX = Number(Math.max(0, Math.min(99, dragStartRef.current.startX + dxPct)).toFixed(2));
      const newY = Number(Math.max(0, Math.min(99, dragStartRef.current.startY + dyPct)).toFixed(2));

      setCurrentLayout(prev => {
        const updated = { ...prev };
        if (draggingKey.startsWith('tableCol') && draggingKey.endsWith('X')) {
          (updated as any)[draggingKey] = newX;
          updated.tableStartY = newY;
        } else if (draggingKey.startsWith('totals') && draggingKey.endsWith('Y')) {
          (updated as any)[draggingKey] = newY;
          updated.totalsX = newX;
        } else {
          const obj = updated[draggingKey as keyof QuotationTemplateLayout];
          if (typeof obj === 'object' && obj !== null && 'x' in obj) {
            (updated as any)[draggingKey] = {
              ...obj,
              x: newX,
              y: newY
            };
          }
        }
        return updated;
      });
    };

    const handleMouseUp = () => {
      setDraggingKey(null);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingKey]);

  const startFieldDrag = (e: React.MouseEvent, key: string, startX: number, startY: number) => {
    e.stopPropagation();
    setSelectedFieldKey(key);
    setDraggingKey(key);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX,
      startY
    };
  };

  const scale = containerWidth / 1000;
  const getFs = (fs: number) => `${Math.max(6, (fs || 14) * scale)}px`;

  const activeFieldObj = currentLayout[selectedFieldKey as keyof QuotationTemplateLayout];
  const isStandardField = typeof activeFieldObj === 'object' && activeFieldObj !== null && 'x' in activeFieldObj;
  const isTableRelated = selectedFieldKey === 'tableItems' || selectedFieldKey.startsWith('tableCol');
  const isTotalsRelated = selectedFieldKey === 'totalsBlock' || selectedFieldKey.startsWith('totals');

  const formatDateDisplay = (val: string) => {
    if (!val) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return val.split('-').reverse().join('/');
    }
    return val;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-hidden">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-6xl h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Calibrador Visual de Plantilla de Cotización A4 (1:1)
              </h2>
              <p className="text-xs text-slate-400">
                Hacé clic o arrastrá cualquier campo sobre la hoja para acomodar su posición exacta y tamaño de letra.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {confirmReset ? (
              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-xl">
                <span className="text-[11px] text-amber-300 font-semibold">¿Restablecer fábrica?</span>
                <button
                  onClick={handleResetToDefault}
                  className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold rounded-lg cursor-pointer"
                >
                  Sí
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded-lg cursor-pointer"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                title="Restablecer valores originales"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Restablecer Fábrica
              </button>
            )}

            <button
              onClick={handleSave}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <Save className="w-4 h-4" /> Guardar Calibración
            </button>

            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Controls Sidebar + Live A4 Canvas */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-slate-950">
          {/* Sidebar Controls (Left - 4 Cols) */}
          <div className="lg:col-span-4 border-r border-slate-800 p-4 space-y-4 overflow-y-auto bg-slate-900/90 text-xs">
            {isSavedAlert && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl font-bold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" /> ¡Calibración guardada en la base de datos!
              </div>
            )}

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-200 flex items-start gap-2">
              <MousePointer className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Tip rápido:</strong> Podés hacer clic y <strong>arrastrar con el mouse</strong> cualquier texto directamente sobre la hoja de la derecha, o usar los controles de abajo para ajuste milimétrico.
              </span>
            </div>

            {/* Typography Selector */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <Type className="w-4 h-4 text-amber-400" /> Tipografía General de la Cotización:
              </label>
              <select
                value={currentLayout.fontFamily}
                onChange={(e) => setCurrentLayout({ ...currentLayout, fontFamily: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="sans-serif">Sans-Serif (Arial / Helvetica / Limpio)</option>
                <option value="monospace">Monospace (Consolas / Técnico)</option>
                <option value="serif">Serif (Times New Roman / Formal)</option>
              </select>
            </div>

            {/* Field Selector */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <Move className="w-4 h-4 text-amber-400" /> Seleccionar Campo o Columna:
              </label>
              <select
                value={selectedFieldKey}
                onChange={(e) => setSelectedFieldKey(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
              >
                {Object.keys(fieldLabels).map((key) => (
                  <option key={key} value={key}>
                    {fieldLabels[key]}
                  </option>
                ))}
              </select>
            </div>

            {/* Standard Object Field Controls (X, Y, Font Size, Bold) */}
            {isStandardField && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="font-bold text-amber-400 border-b border-slate-800 pb-2">
                  Ajustes de: {fieldLabels[selectedFieldKey]}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Posición Horizontal X (%)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      value={(activeFieldObj as any).x}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCurrentLayout({
                          ...currentLayout,
                          [selectedFieldKey]: { ...(activeFieldObj as any), x: val }
                        });
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Posición Vertical Y (%)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      value={(activeFieldObj as any).y}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCurrentLayout({
                          ...currentLayout,
                          [selectedFieldKey]: { ...(activeFieldObj as any), y: val }
                        });
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1">
                    <span>Tamaño de Fuente:</span>
                    <span className="text-amber-400 font-bold">{(activeFieldObj as any).fontSize} px</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={28}
                    step={0.5}
                    value={(activeFieldObj as any).fontSize}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 14;
                      setCurrentLayout({
                        ...currentLayout,
                        [selectedFieldKey]: { ...(activeFieldObj as any), fontSize: val }
                      });
                    }}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={Boolean((activeFieldObj as any).isBold)}
                    onChange={(e) => {
                      setCurrentLayout({
                        ...currentLayout,
                        [selectedFieldKey]: { ...(activeFieldObj as any), isBold: e.target.checked }
                      });
                    }}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-xs text-slate-300 font-semibold">Texto en Negrita (Bold)</span>
                </label>
              </div>
            )}

            {/* Special Controls: Table Items & Columns */}
            {isTableRelated && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="font-bold text-amber-400 border-b border-slate-800 pb-2">
                  Ajustes de Tabla de Productos / Servicios
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Inicio Tabla Y (%)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      value={currentLayout.tableStartY}
                      onChange={(e) =>
                        setCurrentLayout({ ...currentLayout, tableStartY: parseFloat(e.target.value) || 33.6 })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Alto de Fila (%)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      value={currentLayout.tableRowHeight}
                      onChange={(e) =>
                        setCurrentLayout({ ...currentLayout, tableRowHeight: parseFloat(e.target.value) || 2.8 })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1">
                    <span>Tamaño de Letra de la Tabla:</span>
                    <span className="text-amber-400 font-bold">{currentLayout.tableFontSize} px</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={24}
                    step={0.5}
                    value={currentLayout.tableFontSize}
                    onChange={(e) =>
                      setCurrentLayout({ ...currentLayout, tableFontSize: parseFloat(e.target.value) || 14 })
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                {selectedFieldKey.startsWith('tableCol') && (
                  <div className="pt-2 border-t border-slate-800">
                    <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                      Posición X (%) de {fieldLabels[selectedFieldKey]}
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      value={currentLayout[selectedFieldKey as keyof QuotationTemplateLayout] as number}
                      onChange={(e) =>
                        setCurrentLayout({
                          ...currentLayout,
                          [selectedFieldKey]: parseFloat(e.target.value) || 0
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Special Controls: Totals Block */}
            {isTotalsRelated && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="font-bold text-amber-400 border-b border-slate-800 pb-2">
                  Ajustes del Bloque de Totales ($)
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Alineación Derecha X (%) de todos los Totales
                  </label>
                  <input
                    type="number"
                    step={0.1}
                    value={currentLayout.totalsX}
                    onChange={(e) =>
                      setCurrentLayout({ ...currentLayout, totalsX: parseFloat(e.target.value) || 96.0 })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1">
                    <span>Tamaño de Letra de Totales:</span>
                    <span className="text-amber-400 font-bold">{currentLayout.totalsFontSize} px</span>
                  </div>
                  <input
                    type="range"
                    min={9}
                    max={26}
                    step={0.5}
                    value={currentLayout.totalsFontSize}
                    onChange={(e) =>
                      setCurrentLayout({ ...currentLayout, totalsFontSize: parseFloat(e.target.value) || 15 })
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                {selectedFieldKey.startsWith('totals') && selectedFieldKey.endsWith('Y') && (
                  <div className="pt-2 border-t border-slate-800">
                    <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                      Posición Vertical Y (%) de {fieldLabels[selectedFieldKey]}
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      value={currentLayout[selectedFieldKey as keyof QuotationTemplateLayout] as number}
                      onChange={(e) =>
                        setCurrentLayout({
                          ...currentLayout,
                          [selectedFieldKey]: parseFloat(e.target.value) || 0
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Directional Nudge Arrow Buttons */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-center">
              <label className="font-bold text-slate-300 block mb-1">
                Ajuste Fino por Flechas (+/- 0,1%):
              </label>
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleNudge(0, -0.1)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition border border-slate-700 cursor-pointer"
                  title="Mover arriba"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleNudge(-0.1, 0)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition border border-slate-700 cursor-pointer"
                    title="Mover izquierda"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] font-mono text-slate-400 px-2">Mover</span>
                  <button
                    type="button"
                    onClick={() => handleNudge(0.1, 0)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition border border-slate-700 cursor-pointer"
                    title="Mover derecha"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleNudge(0, 0.1)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition border border-slate-700 cursor-pointer"
                  title="Mover abajo"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Live Preview Area (Right - 8 Cols) */}
          <div className="lg:col-span-8 p-4 overflow-y-auto flex justify-center bg-slate-950/60">
            <div
              ref={containerRef}
              className="relative w-full max-w-xl bg-white border border-slate-400 shadow-2xl select-none h-fit my-auto"
            >
              <img
                src={imgSrc}
                alt="Plantilla Cotización A4"
                className="w-full h-auto block"
                onError={() => {
                  if (imgSrc !== QUOTATION_TEMPLATE_IMAGE_CDN) {
                    setImgSrc(QUOTATION_TEMPLATE_IMAGE_CDN);
                  }
                }}
                onLoad={() => {
                  if (containerRef.current) {
                    setContainerWidth(containerRef.current.clientWidth);
                  }
                }}
              />

              {/* Live Overlay Container - 1:1 Pixel Font Scaling */}
              <div
                className="absolute inset-0 pointer-events-auto leading-tight text-slate-900"
                style={{ fontFamily: currentLayout.fontFamily }}
              >
                {/* Comp. Nro */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'numComprobante', currentLayout.numComprobante.x, currentLayout.numComprobante.y)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'numComprobante'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.numComprobante.y}%`,
                    left: `${currentLayout.numComprobante.x}%`,
                    fontSize: getFs(currentLayout.numComprobante.fontSize),
                    fontWeight: currentLayout.numComprobante.isBold ? 'bold' : 'normal'
                  }}
                >
                  {String(quot.puntoVenta).padStart(4, '0')}-{String(quot.numeroComprobante).padStart(8, '0')}
                </div>

                {/* Fecha de Emisión */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'fechaEmision', currentLayout.fechaEmision.x, currentLayout.fechaEmision.y)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'fechaEmision'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.fechaEmision.y}%`,
                    left: `${currentLayout.fechaEmision.x}%`,
                    fontSize: getFs(currentLayout.fechaEmision.fontSize),
                    fontWeight: currentLayout.fechaEmision.isBold ? 'bold' : 'normal'
                  }}
                >
                  {formatDateDisplay(quot.fechaEmision)}
                </div>

                {/* Válido Hasta */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'validoHasta', currentLayout.validoHasta.x, currentLayout.validoHasta.y)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'validoHasta'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.validoHasta.y}%`,
                    left: `${currentLayout.validoHasta.x}%`,
                    fontSize: getFs(currentLayout.validoHasta.fontSize),
                    fontWeight: currentLayout.validoHasta.isBold ? 'bold' : 'normal'
                  }}
                >
                  {formatDateDisplay(quot.validoHasta)}
                </div>

                {/* Razón Social */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'razonSocial', currentLayout.razonSocial.x, currentLayout.razonSocial.y)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'razonSocial'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.razonSocial.y}%`,
                    left: `${currentLayout.razonSocial.x}%`,
                    fontSize: getFs(currentLayout.razonSocial.fontSize),
                    fontWeight: currentLayout.razonSocial.isBold ? 'bold' : 'normal'
                  }}
                >
                  {quot.razonSocialReceptor}
                </div>

                {/* Domicilio */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'domicilio', currentLayout.domicilio.x, currentLayout.domicilio.y)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'domicilio'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.domicilio.y}%`,
                    left: `${currentLayout.domicilio.x}%`,
                    fontSize: getFs(currentLayout.domicilio.fontSize),
                    fontWeight: currentLayout.domicilio.isBold ? 'bold' : 'normal'
                  }}
                >
                  {quot.domicilioReceptor}
                </div>

                {/* Zona */}
                <div
                  onMouseDown={(e) => startFieldDrag(e, 'zona', currentLayout.zona.x, currentLayout.zona.y)}
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'zona'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.zona.y}%`,
                    left: `${currentLayout.zona.x}%`,
                    fontSize: getFs(currentLayout.zona.fontSize),
                    fontWeight: currentLayout.zona.isBold ? 'bold' : 'normal'
                  }}
                >
                  {quot.zonaReceptor}
                </div>

                {/* Localidad */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'localidad', currentLayout.localidad.x, currentLayout.localidad.y)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'localidad'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.localidad.y}%`,
                    left: `${currentLayout.localidad.x}%`,
                    fontSize: getFs(currentLayout.localidad.fontSize),
                    fontWeight: currentLayout.localidad.isBold ? 'bold' : 'normal'
                  }}
                >
                  {quot.localidadReceptor}
                </div>

                {/* CUIT Receptor */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'cuitReceptor', currentLayout.cuitReceptor.x, currentLayout.cuitReceptor.y)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'cuitReceptor'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.cuitReceptor.y}%`,
                    left: `${currentLayout.cuitReceptor.x}%`,
                    fontSize: getFs(currentLayout.cuitReceptor.fontSize),
                    fontWeight: currentLayout.cuitReceptor.isBold ? 'bold' : 'normal'
                  }}
                >
                  {quot.cuitReceptor}
                </div>

                {/* Teléfono Receptor */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(
                      e,
                      'telefonoReceptor',
                      currentLayout.telefonoReceptor.x,
                      currentLayout.telefonoReceptor.y
                    )
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'telefonoReceptor'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.telefonoReceptor.y}%`,
                    left: `${currentLayout.telefonoReceptor.x}%`,
                    fontSize: getFs(currentLayout.telefonoReceptor.fontSize),
                    fontWeight: currentLayout.telefonoReceptor.isBold ? 'bold' : 'normal'
                  }}
                >
                  {quot.telefonoReceptor}
                </div>

                {/* Table Items Overlay - 5 Columns */}
                <div
                  className="absolute left-0 right-0 flex flex-col"
                  style={{
                    top: `${currentLayout.tableStartY}%`,
                    fontSize: getFs(currentLayout.tableFontSize)
                  }}
                >
                  {quot.items.map((it, i) => (
                    <div
                      key={i}
                      className="relative w-full"
                      style={{ height: `${(currentLayout.tableRowHeight || 2.8) * 9 * scale}px` }}
                    >
                      {/* Código de artículo */}
                      <span
                        onMouseDown={(e) =>
                          startFieldDrag(e, 'tableColCodigoX', currentLayout.tableColCodigoX, currentLayout.tableStartY)
                        }
                        className={`absolute cursor-move transition px-0.5 rounded ${
                          selectedFieldKey === 'tableColCodigoX'
                            ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                            : 'hover:bg-amber-100/50'
                        }`}
                        style={{ left: `${currentLayout.tableColCodigoX}%` }}
                      >
                        {it.codigo || `00${i + 1}`}
                      </span>

                      {/* Producto / Servicio */}
                      <span
                        onMouseDown={(e) =>
                          startFieldDrag(
                            e,
                            'tableColDescripcionX',
                            currentLayout.tableColDescripcionX,
                            currentLayout.tableStartY
                          )
                        }
                        className={`absolute cursor-move transition uppercase truncate max-w-[36%] px-0.5 rounded ${
                          selectedFieldKey === 'tableColDescripcionX'
                            ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                            : 'hover:bg-amber-100/50'
                        }`}
                        style={{ left: `${currentLayout.tableColDescripcionX}%` }}
                      >
                        {it.descripcion}
                      </span>

                      {/* Cantidad */}
                      <span
                        onMouseDown={(e) =>
                          startFieldDrag(
                            e,
                            'tableColCantidadX',
                            currentLayout.tableColCantidadX,
                            currentLayout.tableStartY
                          )
                        }
                        className={`absolute cursor-move transition px-0.5 rounded ${
                          selectedFieldKey === 'tableColCantidadX'
                            ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                            : 'hover:bg-amber-100/50'
                        }`}
                        style={{ left: `${currentLayout.tableColCantidadX}%` }}
                      >
                        {it.cantidad.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        {it.unidadMedida ? ` ${it.unidadMedida.toUpperCase()}` : ''}
                      </span>

                      {/* Precio Unit. */}
                      <span
                        onMouseDown={(e) =>
                          startFieldDrag(e, 'tableColPrecioX', currentLayout.tableColPrecioX, currentLayout.tableStartY)
                        }
                        className={`absolute cursor-move transition px-0.5 rounded ${
                          selectedFieldKey === 'tableColPrecioX'
                            ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                            : 'hover:bg-amber-100/50'
                        }`}
                        style={{ left: `${currentLayout.tableColPrecioX}%` }}
                      >
                        ${it.precioUnitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>

                      {/* Importe */}
                      <span
                        onMouseDown={(e) =>
                          startFieldDrag(
                            e,
                            'tableColImporteX',
                            currentLayout.tableColImporteX,
                            currentLayout.tableStartY
                          )
                        }
                        className={`absolute cursor-move transition px-0.5 rounded font-semibold ${
                          selectedFieldKey === 'tableColImporteX'
                            ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                            : 'hover:bg-amber-100/50'
                        }`}
                        style={{ left: `${currentLayout.tableColImporteX}%` }}
                      >
                        ${it.importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Condición de venta */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'condicionVenta', currentLayout.condicionVenta.x, currentLayout.condicionVenta.y)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'condicionVenta'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.condicionVenta.y}%`,
                    left: `${currentLayout.condicionVenta.x}%`,
                    fontSize: getFs(currentLayout.condicionVenta.fontSize),
                    fontWeight: currentLayout.condicionVenta.isBold ? 'bold' : 'normal'
                  }}
                >
                  {quot.condicionVenta}
                </div>

                {/* Moneda expresada */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(
                      e,
                      'monedaExpresada',
                      currentLayout.monedaExpresada.x,
                      currentLayout.monedaExpresada.y
                    )
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'monedaExpresada'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.monedaExpresada.y}%`,
                    left: `${currentLayout.monedaExpresada.x}%`,
                    fontSize: getFs(currentLayout.monedaExpresada.fontSize),
                    fontWeight: currentLayout.monedaExpresada.isBold ? 'bold' : 'normal'
                  }}
                >
                  {quot.monedaExpresada}
                </div>

                {/* Nombre del vendedor */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'nombreVendedor', currentLayout.nombreVendedor.x, currentLayout.nombreVendedor.y)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'nombreVendedor'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.nombreVendedor.y}%`,
                    left: `${currentLayout.nombreVendedor.x}%`,
                    fontSize: getFs(currentLayout.nombreVendedor.fontSize),
                    fontWeight: currentLayout.nombreVendedor.isBold ? 'bold' : 'normal'
                  }}
                >
                  {quot.nombreVendedor}
                </div>

                {/* Observaciones (2 Renglones) */}
                {(() => {
                  const rawObs = quot.observaciones || 'LOS EQUIPOS CUENTAN CON OPERARIO, EL GRUPO ELECTRÓGENO NO INCLUYE COMBUSTIBLE.\nTRASLADO A CARGO DEL CLIENTE SEGÚN ZONA.';
                  const normalized = rawObs.replace(/\r\n/g, '\n').trim();
                  let line1 = normalized;
                  let line2 = '';
                  if (normalized.includes('\n')) {
                    const parts = normalized.split('\n').map(s => s.trim()).filter(Boolean);
                    line1 = parts[0] || '';
                    line2 = parts.slice(1).join(' ');
                  } else if (normalized.length > 62) {
                    let idx = normalized.lastIndexOf(' ', 62);
                    if (idx <= 10) idx = 62;
                    line1 = normalized.slice(0, idx).trim();
                    line2 = normalized.slice(idx).trim();
                  }
                  return (
                    <div
                      onMouseDown={(e) =>
                        startFieldDrag(e, 'observaciones', currentLayout.observaciones.x, currentLayout.observaciones.y)
                      }
                      className={`absolute cursor-move transition px-0.5 rounded flex flex-col ${
                        selectedFieldKey === 'observaciones'
                          ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                          : 'hover:bg-amber-100/50'
                      }`}
                      style={{
                        top: `${currentLayout.observaciones.y}%`,
                        left: `${currentLayout.observaciones.x}%`,
                        fontSize: getFs(currentLayout.observaciones.fontSize),
                        fontWeight: currentLayout.observaciones.isBold ? 'bold' : 'normal',
                        lineHeight: '1.35'
                      }}
                    >
                      <span className="whitespace-nowrap">{line1}</span>
                      {line2 && <span className="whitespace-nowrap">{line2}</span>}
                    </div>
                  );
                })()}

                {/* Totals Breakdown (Right Column) */}
                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'totalsSubtotalY', currentLayout.totalsX, currentLayout.totalsSubtotalY)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'totalsSubtotalY'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.totalsSubtotalY}%`,
                    right: `${100 - currentLayout.totalsX}%`,
                    fontSize: getFs(currentLayout.totalsFontSize)
                  }}
                >
                  {quot.subtotalPedido.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>

                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'totalsBonifY', currentLayout.totalsX, currentLayout.totalsBonifY)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'totalsBonifY'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.totalsBonifY}%`,
                    right: `${100 - currentLayout.totalsX}%`,
                    fontSize: getFs(currentLayout.totalsFontSize)
                  }}
                >
                  {quot.bonificacionTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>

                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'totalsSubtotalNetoY', currentLayout.totalsX, currentLayout.totalsSubtotalNetoY)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'totalsSubtotalNetoY'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.totalsSubtotalNetoY}%`,
                    right: `${100 - currentLayout.totalsX}%`,
                    fontSize: getFs(currentLayout.totalsFontSize)
                  }}
                >
                  {quot.subtotalNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>

                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'totalsIibbY', currentLayout.totalsX, currentLayout.totalsIibbY)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'totalsIibbY'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.totalsIibbY}%`,
                    right: `${100 - currentLayout.totalsX}%`,
                    fontSize: getFs(currentLayout.totalsFontSize)
                  }}
                >
                  {quot.percepcionIibb.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>

                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'totalsIvaY', currentLayout.totalsX, currentLayout.totalsIvaY)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded ${
                    selectedFieldKey === 'totalsIvaY'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.totalsIvaY}%`,
                    right: `${100 - currentLayout.totalsX}%`,
                    fontSize: getFs(currentLayout.totalsFontSize)
                  }}
                >
                  {quot.ivaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>

                <div
                  onMouseDown={(e) =>
                    startFieldDrag(e, 'totalsTotalY', currentLayout.totalsX, currentLayout.totalsTotalY)
                  }
                  className={`absolute cursor-move transition px-0.5 rounded font-bold ${
                    selectedFieldKey === 'totalsTotalY'
                      ? 'ring-2 ring-amber-500 bg-amber-200/80 z-20'
                      : 'hover:bg-amber-100/50'
                  }`}
                  style={{
                    top: `${currentLayout.totalsTotalY}%`,
                    right: `${100 - currentLayout.totalsX}%`,
                    fontSize: getFs(currentLayout.totalsFontSize + 1),
                    fontWeight: 'bold'
                  }}
                >
                  {quot.importeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
