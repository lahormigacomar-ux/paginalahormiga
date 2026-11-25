import React, { useState } from 'react';
import {
  ArcaInvoice,
  CustomerPaymentReceipt,
  ParteDiario,
  PaymentReceiptAttachment,
  RentalContract,
} from '../../types';
import { formatCurrency } from '../../services/storage';
import {
  formatInvoiceLabel,
  formatInvoiceNumber,
  isExternalMigratedInvoice,
  resolveArcaInvoiceLinks,
} from '../../utils/crossLinks';
import { isArcaInvoiceFullyPaid } from '../../utils/obraLegajoResolver';
import {
  X,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  ClipboardList,
  Truck,
  Banknote,
  Paperclip,
  ExternalLink,
  Download,
  Building2,
} from 'lucide-react';

interface FacturaModalProps {
  invoice: ArcaInvoice | null;
  allReceipts: CustomerPaymentReceipt[];
  rentals?: RentalContract[];
  partesDiarios?: ParteDiario[];
  onClose: () => void;
  onInspectReceipt?: (receipt: CustomerPaymentReceipt) => void;
  onNavigateToArca?: (invoice: ArcaInvoice) => void;
  onNavigateToCobranzas?: () => void;
}

export const ObraFacturaPreviewModal: React.FC<FacturaModalProps> = ({
  invoice,
  allReceipts,
  rentals = [],
  partesDiarios = [],
  onClose,
  onInspectReceipt,
  onNavigateToArca,
  onNavigateToCobranzas,
}) => {
  if (!invoice) return null;

  const invNum = formatInvoiceNumber(invoice);
  const resolved = resolveArcaInvoiceLinks(invoice, rentals, partesDiarios);
  const isPaid = isArcaInvoiceFullyPaid(invoice, allReceipts);
  const isExt = isExternalMigratedInvoice(invoice);
  const isNC = invoice.tipoComprobante.startsWith('NOTA_CREDITO');

  const invReceiptsMap = new Map<string, CustomerPaymentReceipt>();
  allReceipts.forEach((r) => {
    if (
      (r.facturasIds || []).includes(invoice.id) ||
      (r.facturasNumeros || []).some((n) => String(n).trim().toUpperCase() === invNum.toUpperCase())
    ) {
      invReceiptsMap.set(r.id, r);
    }
  });
  (invoice.recibosCobro || []).forEach((r) => {
    if (!invReceiptsMap.has(r.id)) invReceiptsMap.set(r.id, r);
  });
  const linkedReceipts = Array.from(invReceiptsMap.values()).sort((a, b) =>
    (b.fecha || '').localeCompare(a.fecha || '')
  );

  const total = Number(invoice.importeTotal ?? invoice.impTotal ?? 0);
  const cobrado = isPaid ? total : resolved.montoCobrado;
  const saldo = isPaid ? 0 : Math.max(0, total - cobrado);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-black text-white text-base">
                  {formatInvoiceLabel(invoice)}
                </span>
                {isExt && (
                  <span className="px-2 py-0.5 rounded bg-orange-500/20 border border-orange-400/50 text-orange-200 text-[10px] font-black uppercase">
                    OTRO SISTEMA
                  </span>
                )}
                {!isNC && (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                      isPaid
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : cobrado > 0
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                        : 'bg-red-500/15 text-red-300 border-red-500/35'
                    }`}
                  >
                    {isPaid ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" /> PAGADA 100%
                      </>
                    ) : cobrado > 0 ? (
                      <>
                        <Clock className="w-3 h-3" /> COBRO PARCIAL
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3" /> PENDIENTE DE PAGO
                      </>
                    )}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Fecha: {invoice.fecha}
                {invoice.cae ? ` · CAE: ${invoice.cae}` : ''}
                {invoice.vencimientoCae ? ` (Vto: ${invoice.vencimientoCae})` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToArca && (
              <button
                type="button"
                onClick={() => onNavigateToArca(invoice)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir en ARCA</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Receptor y Totales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-1.5">
              <div className="text-[10px] uppercase font-bold text-slate-400">Receptor / Cliente</div>
              <div className="text-sm font-bold text-white">
                {invoice.razonSocialReceptor || invoice.receptorRazonSocial || 'Consumidor Final'}
              </div>
              <div className="text-slate-300 font-mono">
                {invoice.tipoDocReceptor}: {invoice.nroDocReceptor || '-'} · {invoice.condicionIvaReceptor}
              </div>
              {invoice.domicilioReceptor && (
                <div className="text-slate-400">{invoice.domicilioReceptor}</div>
              )}
              {invoice.remitoPedido && (
                <div className="text-amber-300 font-mono">Ref / Remito: {invoice.remitoPedido}</div>
              )}
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 grid grid-cols-3 gap-3 items-center">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Factura</div>
                <div className="text-base font-mono font-black text-white mt-0.5">
                  {formatCurrency(total)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Neto: {formatCurrency(invoice.netoGravado || 0)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Cobrado</div>
                <div className="text-base font-mono font-black text-emerald-400 mt-0.5">
                  {formatCurrency(cobrado)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {linkedReceipts.length} recibo(s)
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Saldo Pendiente</div>
                <div
                  className={`text-base font-mono font-black mt-0.5 ${
                    saldo <= 0.5 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {formatCurrency(saldo)}
                </div>
              </div>
            </div>
          </div>

          {/* Items de la Factura */}
          {Array.isArray(invoice.items) && invoice.items.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 font-bold text-slate-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Detalle de Conceptos Facturados ({invoice.items.length})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400 font-mono">
                      <th className="px-3 py-2">Descripción</th>
                      <th className="px-3 py-2 text-right">Cant.</th>
                      <th className="px-3 py-2 text-right">Precio Unit.</th>
                      <th className="px-3 py-2 text-right">IVA</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {invoice.items.map((it, idx) => (
                      <tr key={it.id || idx} className="text-slate-200">
                        <td className="px-3 py-2 font-medium">{it.descripcion}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {it.cantidad} {it.unidadMedida || ''}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatCurrency(it.precioUnitario || 0)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-400">
                          {it.alicuotaIva}%
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-white">
                          {formatCurrency(it.subtotal || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recibos de Pago / Cobranzas Imputados */}
          <div className="bg-emerald-950/15 border border-emerald-500/30 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-emerald-300 flex items-center gap-2">
                <Banknote className="w-4 h-4" />
                <span>Recibos de Pago / Cobranzas Imputados ({linkedReceipts.length})</span>
              </div>
              {onNavigateToCobranzas && (
                <button
                  type="button"
                  onClick={onNavigateToCobranzas}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Ir a Cobranzas</span>
                </button>
              )}
            </div>

            {linkedReceipts.length === 0 ? (
              <p className="text-slate-400 italic">
                {isPaid
                  ? 'Factura marcada como pagada (sin recibo detallado emitido en tabla de cobranzas).'
                  : 'No hay recibos de cobranza registrados aún para esta factura.'}
              </p>
            ) : (
              <div className="space-y-2">
                {linkedReceipts.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-emerald-300">
                          REC #{rec.numeroRecibo}
                        </span>
                        <span className="font-mono text-slate-400">{rec.fecha}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-bold">
                          {rec.formaPago.replace(/_/g, ' ')}
                        </span>
                        {rec.bancoReferencia && (
                          <span className="text-slate-300">{rec.bancoReferencia}</span>
                        )}
                      </div>
                      {rec.observaciones && (
                        <div className="text-[11px] text-slate-400 italic">{rec.observaciones}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right font-mono">
                        <div className="font-black text-emerald-400 text-sm">
                          {formatCurrency(rec.totalImputado ?? rec.montoCobrado)}
                        </div>
                        {(rec.adjuntos?.length || 0) > 0 && (
                          <div className="text-[10px] text-cyan-300">
                            {rec.adjuntos!.length} comprobante(s)
                          </div>
                        )}
                      </div>
                      {onInspectReceipt && (
                        <button
                          type="button"
                          onClick={() => onInspectReceipt(rec)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[11px] cursor-pointer"
                        >
                          Ver Recibo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contratos y Partes vinculados a la Factura */}
          {(resolved.linkedRentals.length > 0 || resolved.linkedPartes.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {resolved.linkedRentals.length > 0 && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="font-bold text-blue-300 flex items-center gap-1.5">
                    <Truck className="w-4 h-4" />
                    <span>Contratos Vinculados ({resolved.linkedRentals.length})</span>
                  </div>
                  <div className="space-y-1">
                    {resolved.linkedRentals.map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-slate-300 font-mono py-1 border-b border-slate-800/60 last:border-0">
                        <span>{r.numeroContrato} · {r.equipoModelo}</span>
                        <span className="text-amber-300">{r.obraDestino}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {resolved.linkedPartes.length > 0 && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <ClipboardList className="w-4 h-4" />
                    <span>Partes Diarios Vinculados ({resolved.linkedPartes.length})</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {resolved.linkedPartes.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-slate-300 py-1 border-b border-slate-800/60 last:border-0">
                        <span className="truncate">
                          <strong className="font-mono text-amber-300">#{p.numParte}</strong> · {p.fecha} · {p.nombreApellido}
                        </span>
                        <span className="font-mono text-emerald-400 shrink-0 ml-2">
                          {p.tipo === 'HORAS'
                            ? `${p.horasTrabajadas || p.hsCantidad || 0} hs`
                            : `${p.viajesCantidad || p.cantidad || 0} vj`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {invoice.observacionesArca && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-slate-300">
              <strong className="text-slate-400">Observaciones:</strong> {invoice.observacionesArca}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface ReceiptModalProps {
  receipt: CustomerPaymentReceipt | null;
  allInvoices: ArcaInvoice[];
  onClose: () => void;
  onInspectInvoice?: (invoice: ArcaInvoice) => void;
  onNavigateToCobranzas?: () => void;
}

export const ObraReceiptPreviewModal: React.FC<ReceiptModalProps> = ({
  receipt,
  allInvoices,
  onClose,
  onInspectInvoice,
  onNavigateToCobranzas,
}) => {
  const [previewAttachment, setPreviewAttachment] = useState<PaymentReceiptAttachment | null>(null);

  if (!receipt) return null;

  const matchedInvoices = allInvoices.filter((inv) => {
    const num = formatInvoiceNumber(inv).toUpperCase();
    return (
      (receipt.facturasIds || []).includes(inv.id) ||
      (receipt.facturasNumeros || []).some((n) => String(n).trim().toUpperCase() === num)
    );
  });

  const retTotal =
    Number(receipt.retencionesIibb || 0) +
    Number(receipt.retencionesGanancias || 0) +
    Number(receipt.retencionesSussIva || 0) +
    Number(receipt.descuentoProntoPago || 0);

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#16191F] border border-emerald-500/40 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-black text-white text-base">
                  RECIBO DE COBRANZA #{receipt.numeroRecibo}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black">
                  COBRADO
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Fecha: {receipt.fecha} · {receipt.clienteNombre}
                {receipt.clienteCuit ? ` (CUIT ${receipt.clienteCuit})` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToCobranzas && (
              <button
                type="button"
                onClick={onNavigateToCobranzas}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir en Cobranzas</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Importes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5">
              <div className="text-[10px] uppercase font-bold text-slate-400">Monto Percibido</div>
              <div className="text-lg font-mono font-black text-emerald-400 mt-0.5">
                {formatCurrency(receipt.montoCobrado)}
              </div>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5">
              <div className="text-[10px] uppercase font-bold text-slate-400">Retenciones / Desc.</div>
              <div className="text-lg font-mono font-bold text-amber-300 mt-0.5">
                {formatCurrency(retTotal)}
              </div>
            </div>
            <div className="bg-emerald-950/25 border border-emerald-500/35 rounded-xl p-3.5">
              <div className="text-[10px] uppercase font-bold text-emerald-300">Total Imputado</div>
              <div className="text-lg font-mono font-black text-white mt-0.5">
                {formatCurrency(receipt.totalImputado ?? receipt.montoCobrado)}
              </div>
            </div>
          </div>

          {/* Forma de Pago y Cuenta */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Forma de Pago</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {receipt.formaPago.replace(/_/g, ' ')}
              </div>
              {receipt.bancoReferencia && (
                <div className="text-slate-300 mt-0.5">{receipt.bancoReferencia}</div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Cuenta Destino / Tesorería</div>
              <div className="text-sm font-bold text-cyan-300 mt-0.5">
                {receipt.cuentaDestinoNombre || 'Sin cuenta asignada'}
              </div>
              {receipt.cuentaDestinoCodigo && (
                <div className="text-[11px] font-mono text-slate-400">
                  Cód. {receipt.cuentaDestinoCodigo}
                </div>
              )}
            </div>
          </div>

          {/* Facturas Imputadas */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <Receipt className="w-4 h-4" />
              <span>Facturas Imputadas en este Recibo</span>
            </div>
            {matchedInvoices.length > 0 ? (
              <div className="space-y-1.5">
                {matchedInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-white">
                        {formatInvoiceLabel(inv)}
                      </span>
                      <span className="text-slate-400 font-mono ml-2">({inv.fecha})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-400">
                        {formatCurrency(inv.importeTotal || 0)}
                      </span>
                      {onInspectInvoice && (
                        <button
                          type="button"
                          onClick={() => onInspectInvoice(inv)}
                          className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-[11px] cursor-pointer"
                        >
                          Ver Factura
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(receipt.facturasNumeros || []).map((n, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 font-mono border border-slate-700"
                  >
                    Fact. {n}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Comprobantes Adjuntos */}
          {(receipt.adjuntos?.length || 0) > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4" />
                <span>Comprobantes / Transferencias Adjuntas ({receipt.adjuntos!.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {receipt.adjuntos!.map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => setPreviewAttachment(att)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{att.nombre}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {receipt.observaciones && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-slate-300">
              <strong className="text-slate-400">Observaciones:</strong> {receipt.observaciones}
            </div>
          )}
        </div>
      </div>

      {/* Attachment preview */}
      {previewAttachment && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/85">
          <div className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-white truncate">{previewAttachment.nombre}</span>
              <div className="flex items-center gap-2">
                <a
                  href={previewAttachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={previewAttachment.nombre}
                  className="px-3 py-1 rounded bg-amber-500 text-black text-xs font-bold flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/40 max-h-[75vh] overflow-auto">
              {previewAttachment.tipoArchivo === 'PDF' ||
              previewAttachment.nombre.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewAttachment.url}
                  title={previewAttachment.nombre}
                  className="w-full h-[65vh] rounded bg-white"
                />
              ) : (
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.nombre}
                  className="max-w-full max-h-[65vh] object-contain rounded"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
