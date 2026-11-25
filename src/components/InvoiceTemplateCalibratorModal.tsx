import React, { useState } from 'react';
import { InvoiceTemplateLayout, DEFAULT_INVOICE_TEMPLATE_LAYOUT, ArcaInvoice } from '../types';
import { saveInvoiceTemplateLayout } from '../services/storage';
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
  ArrowRight
} from 'lucide-react';

export const INVOICE_TEMPLATE_IMAGE_LOCAL = '/factura-a-hornocal.svg?v=3';
export const INVOICE_TEMPLATE_IMAGE_CDN = 'https://pub-b9eaa327b7214d2d9a3ac2ee74a0dcf8.r2.dev/templates/factura-a-hornocal.svg?v=3';
export const INVOICE_TEMPLATE_B_LOCAL = '/formato-factura-b-la-hormiga.jpg?v=2';
export const INVOICE_TEMPLATE_X_LOCAL = '/formato-factura-x-la-hormiga.jpg?v=2';
export const INVOICE_TEMPLATE_NCA_LOCAL = '/formato-nota-credito-a-la-hormiga.jpg?v=2';
export const INVOICE_TEMPLATE_NCB_LOCAL = '/formato-nota-credito-b-la-hormiga.jpg?v=2';

export type InvoiceTemplateKind = 'A' | 'B' | 'X' | 'NCA' | 'NCB';

export function getInvoiceTemplateForType(tipoComprobante?: string): {
  primary: string;
  fallback: string;
  templateKind: InvoiceTemplateKind;
} {
  if (tipoComprobante === 'FACTURA_X' || tipoComprobante === 'NOTA_CREDITO_X') {
    return {
      primary: INVOICE_TEMPLATE_X_LOCAL,
      fallback: INVOICE_TEMPLATE_IMAGE_LOCAL,
      templateKind: 'X',
    };
  }
  if (tipoComprobante === 'NOTA_CREDITO_A') {
    return {
      primary: INVOICE_TEMPLATE_NCA_LOCAL,
      fallback: INVOICE_TEMPLATE_IMAGE_LOCAL,
      templateKind: 'NCA',
    };
  }
  if (tipoComprobante === 'NOTA_CREDITO_B' || tipoComprobante === 'NOTA_CREDITO_C') {
    return {
      primary: INVOICE_TEMPLATE_NCB_LOCAL,
      fallback: INVOICE_TEMPLATE_B_LOCAL,
      templateKind: 'NCB',
    };
  }
  if (tipoComprobante === 'FACTURA_B' || tipoComprobante === 'FACTURA_C') {
    return {
      primary: INVOICE_TEMPLATE_B_LOCAL,
      fallback: INVOICE_TEMPLATE_IMAGE_LOCAL,
      templateKind: 'B',
    };
  }
  return {
    primary: INVOICE_TEMPLATE_IMAGE_LOCAL,
    fallback: INVOICE_TEMPLATE_IMAGE_CDN,
    templateKind: 'A',
  };
}

interface InvoiceTemplateCalibratorModalProps {
  layout: InvoiceTemplateLayout;
  onSaveLayout: (newLayout: InvoiceTemplateLayout) => void;
  onClose: () => void;
  sampleInvoice?: ArcaInvoice;
}

export const InvoiceTemplateCalibratorModal: React.FC<InvoiceTemplateCalibratorModalProps> = ({
  layout,
  onSaveLayout,
  onClose,
  sampleInvoice
}) => {
  const [currentLayout, setCurrentLayout] = useState<InvoiceTemplateLayout>({ 
    ...DEFAULT_INVOICE_TEMPLATE_LAYOUT,
    ...layout 
  });
  const [selectedFieldKey, setSelectedFieldKey] = useState<string>('codigoCliente');
  const [isSavedAlert, setIsSavedAlert] = useState<boolean>(false);
  const [previewTipo, setPreviewTipo] = useState<string>(sampleInvoice?.tipoComprobante || 'FACTURA_A');
  const activeTemplateInfo = getInvoiceTemplateForType(previewTipo);
  const [imgSrc, setImgSrc] = useState<string>(activeTemplateInfo.primary);

  // Sample invoice data
  const inv = sampleInvoice || {
    id: 'ARCA-0007-00000001',
    tipoComprobante: 'FACTURA_A' as const,
    puntoVenta: 7,
    numeroComprobante: 1,
    fecha: new Date().toISOString().slice(0, 10),
    cuitEmisor: '30-71629451-9',
    razonSocialEmisor: 'EL HORNOCAL S.R.L.',
    condicionIvaEmisor: 'RESPONSABLE_INSCRIPTO',
    tipoDocReceptor: 'CUIT' as const,
    nroDocReceptor: '20131219750',
    razonSocialReceptor: 'ZARIF MARCELO HORACIO',
    condicionIvaReceptor: 'RESPONSABLE_INSCRIPTO' as const,
    codigoCliente: '000001',
    condicionVenta: 'CONTADO',
    domicilioReceptor: 'San Salvador de Jujuy, Argentina',
    remitoPedido: '0000000000000',
    items: [
      {
        codigo: '00000001',
        descripcion: 'SERVICIO DE ALQUILER DE MAQUINARIA VIAL / JORNADA',
        cantidad: 1,
        unidadMedida: 'UNI',
        precioUnitario: 1.00,
        bonificacionPorcentaje: 0,
        subtotal: 1.00,
        alicuotaIva: 21
      }
    ],
    netoGravado: 1.00,
    ivaTotal: 0.21,
    bonificacionTotal: 0.00,
    percepcionIibb: 0.00,
    importeTotal: 1.21,
    cae: '86451886847733',
    vencimientoCae: '2026-11-19',
    resultado: 'APROBADO' as const,
    createdAt: new Date().toISOString()
  };

  const fieldLabels: Record<string, string> = {
    numComprobante: 'Nº Comprobante',
    fechaEmision: 'Fecha de Emisión',
    codigoCliente: 'Código Cliente',
    razonSocial: 'Cliente / Razón Social',
    cuitReceptor: 'C.U.I.T. Receptor',
    condicionVenta: 'Condición de Venta',
    condicionIva: 'Condición frente al IVA',
    domicilio: 'Domicilio Receptor',
    remitoPedido: 'Remito / Pedido Nº',
    
    // Tabla y columnas
    tableItems: 'Tabla de Artículos / Ítems (Configuración General)',
    tableColCodigoX: 'Tabla Columna: Código (Posición X %)',
    tableColDescripcionX: 'Tabla Columna: Descripción (Posición X %)',
    tableColCantidadX: 'Tabla Columna: Cantidad (Posición X %)',
    tableColUnidadX: 'Tabla Columna: U. Medida (Posición X %)',
    tableColPrecioX: 'Tabla Columna: Precio Unitario (Posición X %)',
    tableColBonifX: 'Tabla Columna: % Bonificación (Posición X %)',
    tableColSubtotalX: 'Tabla Columna: Subtotal (Posición X %)',

    sonPesos: 'Son Pesos (En letras)',
    totalsBlock: 'Bloque de Totales (General)',
    totalsNetoY: 'Totales: Neto Gravado (Fila 1 - Eje Y %)',
    totalsBonifY: 'Totales: Bonificación (Fila 2 - Eje Y %)',
    totalsIvaY: 'Totales: IVA 21% (Fila 3 - Eje Y %)',
    totalsIibbY: 'Totales: PERCEP. IIBB (Fila 4 - Eje Y %)',
    totalsTotalY: 'Totales: IMPORTE TOTAL (Fila 5 - Eje Y %)',
    caeNum: 'CAE Nº',
    caeVto: 'Fecha Vto. de CAE',
    barcode: 'Código de Barras (Pie)',
    qrCode: 'Código QR Oficial ARCA'
  };

  const handleNudge = (dx: number, dy: number) => {
    setCurrentLayout(prev => {
      const updated = { ...prev };

      if (selectedFieldKey === 'tableItems' || selectedFieldKey === 'tableStartY') {
        updated.tableStartY = Number((updated.tableStartY + dy).toFixed(2));
      } else if (selectedFieldKey.startsWith('tableCol') && selectedFieldKey.endsWith('X')) {
        const key = selectedFieldKey as keyof InvoiceTemplateLayout;
        const val = updated[key] as number;
        (updated as any)[key] = Number((val + dx).toFixed(2));
      } else if (selectedFieldKey === 'totalsBlock' || selectedFieldKey === 'totalsX') {
        updated.totalsX = Number((updated.totalsX + dx).toFixed(2));
      } else if (selectedFieldKey.startsWith('totals') && selectedFieldKey.endsWith('Y')) {
        const key = selectedFieldKey as keyof InvoiceTemplateLayout;
        const val = updated[key] as number;
        (updated as any)[key] = Number((val + dy).toFixed(2));
      } else if (selectedFieldKey === 'qrCode') {
        updated.qrCode = {
          ...updated.qrCode,
          x: Number((updated.qrCode.x + dx).toFixed(2)),
          y: Number((updated.qrCode.y + dy).toFixed(2))
        };
      } else {
        const obj = updated[selectedFieldKey as keyof InvoiceTemplateLayout];
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
    if (window.confirm('¿Restablecer todas las coordenadas y tamaños de letra a la calibración de fábrica?')) {
      setCurrentLayout({ ...DEFAULT_INVOICE_TEMPLATE_LAYOUT });
    }
  };

  const handleSave = () => {
    onSaveLayout(currentLayout);
    saveInvoiceTemplateLayout(currentLayout);
    setIsSavedAlert(true);
    setTimeout(() => setIsSavedAlert(false), 3000);
  };

  // Helper to generate official AFIP QR Code Image URL
  const getAfipQrUrl = () => {
    const qrObj = {
      ver: 1,
      fecha: inv.fecha,
      cuit: Number(inv.cuitEmisor.replace(/\D/g, '')),
      ptoVta: inv.puntoVenta,
      tipoCmp: inv.tipoComprobante === 'FACTURA_A' ? 1 : inv.tipoComprobante === 'FACTURA_B' ? 6 : 11,
      nroCmp: inv.numeroComprobante,
      importe: inv.importeTotal,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 80,
      nroDocRec: Number(inv.nroDocReceptor.replace(/\D/g, '') || 0),
      tipoCodAut: 'E',
      codAut: Number(inv.cae)
    };
    try {
      const b64 = btoa(JSON.stringify(qrObj));
      const afipUrl = `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
      return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(afipUrl)}`;
    } catch {
      return 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=AFIP_ARCA_QR';
    }
  };

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(576);

  React.useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const scale = containerWidth / 1000;
  const getFs = (fs: number) => `${Math.max(6, (fs || 14) * scale)}px`;

  const activeFieldObj = currentLayout[selectedFieldKey as keyof InvoiceTemplateLayout];
  const isStandardField = typeof activeFieldObj === 'object' && activeFieldObj !== null && 'x' in activeFieldObj;
  const isTableRelated = selectedFieldKey === 'tableItems' || selectedFieldKey.startsWith('tableCol');
  const isTotalsRelated = selectedFieldKey === 'totalsBlock' || selectedFieldKey.startsWith('totals');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-hidden">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-6xl h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Gestor Visual de Plantilla A4 & Tamaño de Fuente 1:1
              </h2>
              <p className="text-xs text-slate-400">
                Calibre de forma individual cada campo, columna y tamaño de letra en píxeles.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetToDefault}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              title="Restablecer valores originales"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Restablecer Fábrica
            </button>

            <button
              onClick={handleSave}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md shadow-emerald-950 cursor-pointer"
            >
              <Save className="w-4 h-4" /> Guardar Cambios
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
                <Check className="w-4 h-4 text-emerald-400" /> ¡Configuración guardada! Aplicada en la vista previa y descarga PDF.
              </div>
            )}

            {/* Typography Selector */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <Type className="w-4 h-4 text-emerald-400" /> Tipografía General del Comprobante:
              </label>
              <select
                value={currentLayout.fontFamily}
                onChange={(e) => setCurrentLayout({ ...currentLayout, fontFamily: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              >
                <option value="monospace">Monospace (Monofase AFIP / Consolas)</option>
                <option value="sans-serif">Sans-Serif (Inter / Helvetica / Limpio)</option>
                <option value="serif">Serif (Times New Roman / Formal)</option>
              </select>
            </div>

            {/* Field Selector */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <Move className="w-4 h-4 text-emerald-400" /> Seleccionar Campo o Columna:
              </label>
              <select
                value={selectedFieldKey}
                onChange={(e) => setSelectedFieldKey(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
              >
                {Object.keys(fieldLabels).map((key) => (
                  <option key={key} value={key}>
                    {fieldLabels[key]}
                  </option>
                ))}
              </select>
            </div>

            {/* Standard Object Field Controls (X, Y, Font Size) */}
            {isStandardField && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="font-bold text-emerald-400 border-b border-slate-800 pb-2">
                  Ajustes de {fieldLabels[selectedFieldKey]}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Eje X (Horizontal %)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={(activeFieldObj as any).x}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCurrentLayout(prev => ({
                          ...prev,
                          [selectedFieldKey]: { ...(prev[selectedFieldKey as keyof InvoiceTemplateLayout] as any), x: val }
                        }));
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Eje Y (Vertical %)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={(activeFieldObj as any).y}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCurrentLayout(prev => ({
                          ...prev,
                          [selectedFieldKey]: { ...(prev[selectedFieldKey as keyof InvoiceTemplateLayout] as any), y: val }
                        }));
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1">
                    <span>Tamaño de Fuente (px):</span>
                    <input
                      type="number"
                      min={5}
                      max={48}
                      step={0.5}
                      value={(activeFieldObj as any).fontSize}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 12;
                        setCurrentLayout(prev => ({
                          ...prev,
                          [selectedFieldKey]: { ...(prev[selectedFieldKey as keyof InvoiceTemplateLayout] as any), fontSize: val }
                        }));
                      }}
                      className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-right font-mono text-emerald-400 font-bold"
                    />
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={48}
                    step={0.5}
                    value={(activeFieldObj as any).fontSize}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCurrentLayout(prev => ({
                        ...prev,
                        [selectedFieldKey]: { ...(prev[selectedFieldKey as keyof InvoiceTemplateLayout] as any), fontSize: val }
                      }));
                    }}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Table Items Controls (Font Size, Column X, Row Height, Start Y) */}
            {isTableRelated && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="font-bold text-emerald-400 border-b border-slate-800 pb-2">
                  Ajustes de Tabla de Artículos
                </div>

                {/* Font Size Slider & Direct Input */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1">
                    <span>Tamaño de Fuente de Artículos (px):</span>
                    <input
                      type="number"
                      min={5}
                      max={48}
                      step={0.5}
                      value={currentLayout.tableFontSize}
                      onChange={(e) => setCurrentLayout({ ...currentLayout, tableFontSize: parseFloat(e.target.value) || 12 })}
                      className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-right font-mono text-emerald-400 font-bold"
                    />
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={48}
                    step={0.5}
                    value={currentLayout.tableFontSize}
                    onChange={(e) => setCurrentLayout({ ...currentLayout, tableFontSize: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                {/* Selected Column X Position */}
                {selectedFieldKey.startsWith('tableCol') && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Posición X % de {fieldLabels[selectedFieldKey]}
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      value={currentLayout[selectedFieldKey as keyof InvoiceTemplateLayout] as number}
                      onChange={(e) => setCurrentLayout({ ...currentLayout, [selectedFieldKey]: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Inicio Y (%)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={currentLayout.tableStartY}
                      onChange={(e) => setCurrentLayout({ ...currentLayout, tableStartY: parseFloat(e.target.value) || 34.8 })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Alto Fila (%)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={currentLayout.tableRowHeight}
                      onChange={(e) => setCurrentLayout({ ...currentLayout, tableRowHeight: parseFloat(e.target.value) || 3.2 })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Totals Controls (Font Size, Column X, Selected Row Y) */}
            {isTotalsRelated && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="font-bold text-emerald-400 border-b border-slate-800 pb-2">
                  Ajustes de Totales
                </div>

                {/* Font Size Slider & Direct Input */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1">
                    <span>Tamaño de Fuente de Totales (px):</span>
                    <input
                      type="number"
                      min={5}
                      max={48}
                      step={0.5}
                      value={currentLayout.totalsFontSize}
                      onChange={(e) => setCurrentLayout({ ...currentLayout, totalsFontSize: parseFloat(e.target.value) || 14 })}
                      className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-right font-mono text-emerald-400 font-bold"
                    />
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={48}
                    step={0.5}
                    value={currentLayout.totalsFontSize}
                    onChange={(e) => setCurrentLayout({ ...currentLayout, totalsFontSize: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                {/* Totals Column X */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Columna X (%) de Totales</label>
                  <input
                    type="number"
                    step={0.1}
                    value={currentLayout.totalsX}
                    onChange={(e) => setCurrentLayout({ ...currentLayout, totalsX: parseFloat(e.target.value) || 95.2 })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>

                {/* Row Y Position if individual row selected */}
                {selectedFieldKey.startsWith('totals') && selectedFieldKey.endsWith('Y') && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Eje Y (%) de {fieldLabels[selectedFieldKey]}</label>
                    <input
                      type="number"
                      step={0.1}
                      value={currentLayout[selectedFieldKey as keyof InvoiceTemplateLayout] as number}
                      onChange={(e) => setCurrentLayout({ ...currentLayout, [selectedFieldKey]: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Special Controls: QR Code */}
            {selectedFieldKey === 'qrCode' && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="font-bold text-emerald-400 border-b border-slate-800 pb-2">
                  Ajustes del Código QR ARCA
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Eje X (%)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={currentLayout.qrCode.x}
                      onChange={(e) => setCurrentLayout({ ...currentLayout, qrCode: { ...currentLayout.qrCode, x: parseFloat(e.target.value) || 83 } })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Eje Y (%)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={currentLayout.qrCode.y}
                      onChange={(e) => setCurrentLayout({ ...currentLayout, qrCode: { ...currentLayout.qrCode, y: parseFloat(e.target.value) || 87.5 } })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1">
                    <span>Tamaño del QR:</span>
                    <span className="text-emerald-400 font-bold">{currentLayout.qrCode.size} px</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={150}
                    step={2}
                    value={currentLayout.qrCode.size}
                    onChange={(e) => setCurrentLayout({ ...currentLayout, qrCode: { ...currentLayout.qrCode, size: parseFloat(e.target.value) } })}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Directional Nudge Arrow Buttons */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-center">
              <label className="font-bold text-slate-300 block mb-1">
                Ajuste Fino Dirección (+/- 0,1%):
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
                  <span className="text-[10px] font-mono text-slate-400 px-2">Nudge</span>
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
          <div className="lg:col-span-8 p-4 overflow-y-auto flex flex-col items-center gap-3 bg-slate-950/60">
            <div className="flex flex-wrap items-center justify-center gap-1.5 w-full max-w-xl">
              {([
                { id: 'FACTURA_A', label: 'Factura A' },
                { id: 'FACTURA_B', label: 'Factura B' },
                { id: 'NOTA_CREDITO_A', label: 'NC A' },
                { id: 'NOTA_CREDITO_B', label: 'NC B' },
                { id: 'FACTURA_X', label: 'Factura X' },
                { id: 'NOTA_CREDITO_X', label: 'NC X' },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setPreviewTipo(opt.id);
                    setImgSrc(getInvoiceTemplateForType(opt.id).primary);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    previewTipo === opt.id
                      ? 'bg-[#F0C800] text-slate-950 border-[#F0C800]'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div ref={containerRef} className="relative w-full max-w-xl aspect-[1/1.4145] bg-white border border-slate-400 shadow-2xl select-none h-fit my-auto">
              <img
                key={imgSrc}
                src={imgSrc}
                alt="Hoja Base A4 Calibración"
                className="w-full h-auto block"
                onError={() => {
                  const fb = getInvoiceTemplateForType(previewTipo).fallback;
                  if (imgSrc !== fb) {
                    setImgSrc(fb);
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
                {/* Letter Box & Title Override */}
                {previewTipo === 'FACTURA_A' && (
                  <div className="absolute top-[7.0%] left-[47.5%] w-[6.5%] h-[2.2%] bg-white flex items-center justify-center font-bold text-[10px] text-black">
                    COD. 01
                  </div>
                )}
                {previewTipo === 'NOTA_CREDITO_A' && (
                  <div className="absolute top-[7.5%] left-[47.4%] w-[5.9%] h-[1.6%] bg-white flex items-center justify-center font-bold text-[10px] text-black">
                    COD. 03
                  </div>
                )}
                {(previewTipo === 'FACTURA_X' || previewTipo === 'NOTA_CREDITO_X') && (
                  <div className="absolute top-[5.6%] left-[56%] w-[39%] h-[3.2%] flex items-center justify-center font-extrabold text-base tracking-wide text-black">
                    {previewTipo === 'NOTA_CREDITO_X' ? 'NOTA DE CRÉDITO X' : 'FACTURA X'}
                  </div>
                )}

                {(() => {
                  const isCalNc = activeTemplateInfo.templateKind === 'NCA' || activeTemplateInfo.templateKind === 'NCB';
                  const isCalB = activeTemplateInfo.templateKind === 'B';
                  const isCalOfficialJpg = isCalNc || isCalB;
                  const numX = isCalOfficialJpg ? 60.8 : currentLayout.numComprobante.x;
                  const numY = isCalOfficialJpg ? 11.1 : currentLayout.numComprobante.y;
                  const fechaX = isCalOfficialJpg ? 71.8 : currentLayout.fechaEmision.x;
                  const fechaY = isCalOfficialJpg ? 12.6 : currentLayout.fechaEmision.y;

                  return (
                    <>
                      {/* Nº Comprobante */}
                      <div
                        onClick={() => setSelectedFieldKey('numComprobante')}
                        className={`absolute cursor-pointer transition ${
                          selectedFieldKey === 'numComprobante' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                        }`}
                        style={{
                          top: `${numY}%`,
                          left: `${numX}%`,
                          fontSize: getFs(currentLayout.numComprobante.fontSize),
                          fontWeight: 'bold'
                        }}
                      >
                        00007-00000001
                      </div>

                      {/* Fecha Emisión */}
                      <div
                        onClick={() => setSelectedFieldKey('fechaEmision')}
                        className={`absolute cursor-pointer transition ${
                          selectedFieldKey === 'fechaEmision' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                        }`}
                        style={{
                          top: `${fechaY}%`,
                          left: `${fechaX}%`,
                          fontSize: getFs(currentLayout.fechaEmision.fontSize)
                        }}
                      >
                        {inv.fecha.split('-').reverse().join('/')}
                      </div>

                      {isCalNc ? (
                        <>
                          <div
                            onClick={() => setSelectedFieldKey('razonSocial')}
                            className={`absolute cursor-pointer transition uppercase ${selectedFieldKey === 'razonSocial' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                            style={{ top: '20.0%', left: '11.8%', fontSize: getFs(currentLayout.razonSocial.fontSize) }}
                          >
                            {inv.razonSocialReceptor}
                          </div>
                          <div
                            onClick={() => setSelectedFieldKey('cuitReceptor')}
                            className={`absolute cursor-pointer transition ${selectedFieldKey === 'cuitReceptor' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                            style={{ top: '22.9%', left: '10.0%', fontSize: getFs(currentLayout.cuitReceptor.fontSize) }}
                          >
                            {inv.nroDocReceptor}
                          </div>
                          <div
                            onClick={() => setSelectedFieldKey('domicilio')}
                            className={`absolute cursor-pointer transition uppercase truncate max-w-[31%] ${selectedFieldKey === 'domicilio' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                            style={{ top: '24.3%', left: '12.3%', fontSize: getFs(currentLayout.domicilio.fontSize) }}
                          >
                            {inv.domicilioReceptor}
                          </div>
                          <div
                            onClick={() => setSelectedFieldKey('condicionVenta')}
                            className={`absolute cursor-pointer transition uppercase ${selectedFieldKey === 'condicionVenta' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                            style={{ top: '22.9%', left: '63.2%', fontSize: getFs(currentLayout.condicionVenta.fontSize) }}
                          >
                            {inv.condicionVenta || 'CONTADO'}
                          </div>
                          <div
                            onClick={() => setSelectedFieldKey('condicionIva')}
                            className={`absolute cursor-pointer transition ${selectedFieldKey === 'condicionIva' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                            style={{ top: '24.3%', left: '63.2%', fontSize: getFs(currentLayout.condicionIva.fontSize) }}
                          >
                            Responsable inscripto
                          </div>
                          <div
                            onClick={() => setSelectedFieldKey('remitoPedido')}
                            className={`absolute cursor-pointer transition font-bold uppercase ${selectedFieldKey === 'remitoPedido' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                            style={{ top: '25.6%', left: '59.1%', fontSize: getFs(currentLayout.remitoPedido.fontSize) }}
                          >
                            FACTURA {previewTipo === 'NOTA_CREDITO_A' ? 'A' : 'B'} 0007-00000001
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Código Cliente */}
                          <div
                            onClick={() => setSelectedFieldKey('codigoCliente')}
                            className={`absolute cursor-pointer transition ${
                              selectedFieldKey === 'codigoCliente' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                            }`}
                            style={{
                              top: `${isCalB ? 20.1 : currentLayout.codigoCliente.y}%`,
                              left: `${isCalB ? 12.8 : currentLayout.codigoCliente.x}%`,
                              fontSize: getFs(currentLayout.codigoCliente.fontSize)
                            }}
                          >
                            {inv.codigoCliente || '000001'}
                          </div>

                          {/* Razón Social */}
                          <div
                            onClick={() => setSelectedFieldKey('razonSocial')}
                            className={`absolute cursor-pointer transition ${
                              selectedFieldKey === 'razonSocial' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                            }`}
                            style={{
                              top: `${isCalB ? 20.1 : currentLayout.razonSocial.y}%`,
                              left: `${isCalB ? 28.2 : currentLayout.razonSocial.x}%`,
                              fontSize: getFs(currentLayout.razonSocial.fontSize)
                            }}
                          >
                            {inv.razonSocialReceptor}
                          </div>

                          {/* CUIT Receptor */}
                          <div
                            onClick={() => setSelectedFieldKey('cuitReceptor')}
                            className={`absolute cursor-pointer transition ${
                              selectedFieldKey === 'cuitReceptor' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                            }`}
                            style={{
                              top: `${isCalB ? 22.9 : currentLayout.cuitReceptor.y}%`,
                              left: `${isCalB ? 10.0 : currentLayout.cuitReceptor.x}%`,
                              fontSize: getFs(currentLayout.cuitReceptor.fontSize)
                            }}
                          >
                            {inv.nroDocReceptor}
                          </div>

                          {/* Condición de Venta */}
                          <div
                            onClick={() => setSelectedFieldKey('condicionVenta')}
                            className={`absolute cursor-pointer transition ${
                              selectedFieldKey === 'condicionVenta' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                            }`}
                            style={{
                              top: `${isCalB ? 22.9 : currentLayout.condicionVenta.y}%`,
                              left: `${isCalB ? 51.4 : currentLayout.condicionVenta.x}%`,
                              fontSize: getFs(currentLayout.condicionVenta.fontSize)
                            }}
                          >
                            {inv.condicionVenta || 'CONTADO'}
                          </div>

                          {/* Condición IVA */}
                          {activeTemplateInfo.templateKind !== 'X' && (
                            <div
                              onClick={() => setSelectedFieldKey('condicionIva')}
                              className={`absolute cursor-pointer transition ${
                                selectedFieldKey === 'condicionIva' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                              }`}
                              style={{
                                top: `${isCalB ? 22.9 : currentLayout.condicionIva.y}%`,
                                left: `${isCalB ? 82.4 : currentLayout.condicionIva.x}%`,
                                fontSize: getFs(currentLayout.condicionIva.fontSize)
                              }}
                            >
                              Responsable inscripto
                            </div>
                          )}

                          {/* Domicilio */}
                          <div
                            onClick={() => setSelectedFieldKey('domicilio')}
                            className={`absolute cursor-pointer transition ${
                              selectedFieldKey === 'domicilio' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                            }`}
                            style={{
                              top: `${isCalB ? 24.3 : currentLayout.domicilio.y}%`,
                              left: `${isCalB ? 12.3 : currentLayout.domicilio.x}%`,
                              fontSize: getFs(currentLayout.domicilio.fontSize)
                            }}
                          >
                            {inv.domicilioReceptor}
                          </div>

                          {/* Remito / Pedido */}
                          <div
                            onClick={() => setSelectedFieldKey('remitoPedido')}
                            className={`absolute cursor-pointer transition ${
                              selectedFieldKey === 'remitoPedido' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                            }`}
                            style={{
                              top: `${isCalB ? 24.3 : currentLayout.remitoPedido.y}%`,
                              left: `${isCalB ? 82.4 : currentLayout.remitoPedido.x}%`,
                              fontSize: getFs(currentLayout.remitoPedido.fontSize)
                            }}
                          >
                            {inv.remitoPedido}
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}

                {/* Table Items Overlay - Individually Calibrated Columns */}
                <div
                  className="absolute left-0 right-0 flex flex-col"
                  style={{
                    top: `${currentLayout.tableStartY}%`,
                    fontSize: getFs(currentLayout.tableFontSize)
                  }}
                >
                  {inv.items.map((it, i) => {
                    const calDescX = currentLayout.tableColDescripcionX || 13.5;
                    const calCantX = currentLayout.tableColCantidadX || 60.5;
                    const calDescLimitX = Math.max(calDescX + 12, calCantX - 2.5);
                    return (
                      <div 
                        key={i} 
                        className="relative w-full" 
                        style={{ minHeight: `${(currentLayout.tableRowHeight || 3.2) * 10}px` }}
                      >
                        {/* Código */}
                        <span
                          onClick={() => setSelectedFieldKey('tableColCodigoX')}
                          className={`absolute top-0 cursor-pointer transition ${selectedFieldKey === 'tableColCodigoX' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                          style={{ left: `${currentLayout.tableColCodigoX}%` }}
                        >
                          {it.codigo || '00000001'}
                        </span>

                        {/* Descripción */}
                        <div
                          onClick={() => setSelectedFieldKey('tableColDescripcionX')}
                          className={`cursor-pointer transition uppercase whitespace-normal break-words leading-snug pb-1.5 ${selectedFieldKey === 'tableColDescripcionX' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                          style={{
                            paddingLeft: `${calDescX}%`,
                            paddingRight: `${100 - calDescLimitX}%`
                          }}
                        >
                          {it.descripcion}
                        </div>

                        {/* Cantidad */}
                        <span
                          onClick={() => setSelectedFieldKey('tableColCantidadX')}
                          className={`absolute top-0 cursor-pointer transition ${selectedFieldKey === 'tableColCantidadX' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                          style={{ left: `${currentLayout.tableColCantidadX}%` }}
                        >
                          {it.cantidad.toFixed(2)}
                        </span>

                        {/* U. Medida */}
                        <span
                          onClick={() => setSelectedFieldKey('tableColUnidadX')}
                          className={`absolute top-0 cursor-pointer transition uppercase ${selectedFieldKey === 'tableColUnidadX' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                          style={{ left: `${currentLayout.tableColUnidadX}%` }}
                        >
                          {it.unidadMedida || 'UNI'}
                        </span>

                        {/* Precio Unitario */}
                        <span
                          onClick={() => setSelectedFieldKey('tableColPrecioX')}
                          className={`absolute top-0 cursor-pointer transition whitespace-nowrap ${selectedFieldKey === 'tableColPrecioX' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                          style={{ left: `${currentLayout.tableColPrecioX}%` }}
                        >
                          ${it.precioUnitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>

                        {/* % Bonif */}
                        <span
                          onClick={() => setSelectedFieldKey('tableColBonifX')}
                          className={`absolute top-0 cursor-pointer transition whitespace-nowrap ${selectedFieldKey === 'tableColBonifX' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                          style={{ left: `${currentLayout.tableColBonifX}%` }}
                        >
                          0%
                        </span>

                        {/* Subtotal */}
                        <span
                          onClick={() => setSelectedFieldKey('tableColSubtotalX')}
                          className={`absolute top-0 cursor-pointer transition text-right whitespace-nowrap ${selectedFieldKey === 'tableColSubtotalX' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''}`}
                          style={{ right: `${100 - Math.max(95.5, currentLayout.tableColSubtotalX || 96.8)}%` }}
                        >
                          ${it.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Son Pesos */}
                <div
                  onClick={() => setSelectedFieldKey('sonPesos')}
                  className={`absolute cursor-pointer transition ${
                    selectedFieldKey === 'sonPesos' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                  }`}
                  style={{
                    top: `${currentLayout.sonPesos.y}%`,
                    left: `${currentLayout.sonPesos.x}%`,
                    fontSize: getFs(currentLayout.sonPesos.fontSize)
                  }}
                >
                  UN CON 21/100 M.N.
                </div>

                {/* Totals Breakdown */}
                <div
                  onClick={() => setSelectedFieldKey('totalsNetoY')}
                  className={`absolute cursor-pointer transition ${
                    selectedFieldKey === 'totalsNetoY' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                  }`}
                  style={{
                    top: `${currentLayout.totalsNetoY}%`,
                    right: `${100 - currentLayout.totalsX}%`,
                    fontSize: getFs(currentLayout.totalsFontSize)
                  }}
                >
                  1,00
                </div>

                <div
                  onClick={() => setSelectedFieldKey('totalsBonifY')}
                  className={`absolute cursor-pointer transition ${
                    selectedFieldKey === 'totalsBonifY' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                  }`}
                  style={{
                    top: `${currentLayout.totalsBonifY}%`,
                    right: `${100 - currentLayout.totalsX}%`,
                    fontSize: getFs(currentLayout.totalsFontSize)
                  }}
                >
                  0,00
                </div>

                <div
                  onClick={() => setSelectedFieldKey('totalsIvaY')}
                  className={`absolute cursor-pointer transition ${
                    selectedFieldKey === 'totalsIvaY' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                  }`}
                  style={{
                    top: `${currentLayout.totalsIvaY}%`,
                    right: `${100 - currentLayout.totalsX}%`,
                    fontSize: getFs(currentLayout.totalsFontSize)
                  }}
                >
                  0,21
                </div>

                <div
                  onClick={() => setSelectedFieldKey('totalsIibbY')}
                  className={`absolute cursor-pointer transition ${
                    selectedFieldKey === 'totalsIibbY' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                  }`}
                  style={{
                    top: `${currentLayout.totalsIibbY}%`,
                    right: `${100 - currentLayout.totalsX}%`,
                    fontSize: getFs(currentLayout.totalsFontSize)
                  }}
                >
                  0,00
                </div>

                <div
                  onClick={() => setSelectedFieldKey('totalsTotalY')}
                  className={`absolute cursor-pointer transition ${
                    selectedFieldKey === 'totalsTotalY' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                  }`}
                  style={{
                    top: `${currentLayout.totalsTotalY}%`,
                    right: `${100 - currentLayout.totalsX}%`,
                    fontSize: getFs(currentLayout.totalsFontSize),
                    fontWeight: 'bold'
                  }}
                >
                  1,21
                </div>

                {/* CAE & Vto */}
                <div
                  onClick={() => setSelectedFieldKey('caeNum')}
                  className={`absolute cursor-pointer transition ${
                    selectedFieldKey === 'caeNum' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                  }`}
                  style={{
                    top: `${currentLayout.caeNum.y}%`,
                    left: `${currentLayout.caeNum.x}%`,
                    fontSize: getFs(currentLayout.caeNum.fontSize)
                  }}
                >
                  {inv.cae}
                </div>

                <div
                  onClick={() => setSelectedFieldKey('caeVto')}
                  className={`absolute cursor-pointer transition ${
                    selectedFieldKey === 'caeVto' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                  }`}
                  style={{
                    top: `${currentLayout.caeVto.y}%`,
                    left: `${currentLayout.caeVto.x}%`,
                    fontSize: getFs(currentLayout.caeVto.fontSize)
                  }}
                >
                  19/11/2026
                </div>

                {/* Barcode String */}
                <div
                  onClick={() => setSelectedFieldKey('barcode')}
                  className={`absolute cursor-pointer transition ${
                    selectedFieldKey === 'barcode' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                  }`}
                  style={{
                    top: `${currentLayout.barcode.y}%`,
                    left: `${currentLayout.barcode.x}%`,
                    fontSize: getFs(currentLayout.barcode.fontSize)
                  }}
                >
                  30714999822001000078645188684773320261119
                </div>

                {/* Official ARCA QR Code Image */}
                <div
                  onClick={() => setSelectedFieldKey('qrCode')}
                  className={`absolute cursor-pointer transition flex flex-col items-center bg-white p-1 rounded border border-slate-300 ${
                    selectedFieldKey === 'qrCode' ? 'ring-2 ring-emerald-500 bg-emerald-100/80 z-20' : ''
                  }`}
                  style={{
                    top: `${currentLayout.qrCode.y}%`,
                    left: `${currentLayout.qrCode.x}%`,
                    width: `${currentLayout.qrCode.size * scale}px`,
                    height: `${currentLayout.qrCode.size * scale}px`
                  }}
                >
                  <img
                    src={getAfipQrUrl()}
                    alt="QR ARCA"
                    className="w-full h-full object-contain block"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
