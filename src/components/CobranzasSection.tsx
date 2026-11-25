import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArcaInvoice,
  RentalContract,
  ParteDiario,
  CustomerPaymentReceipt,
  CustomerPaymentMethod,
  PaymentReceiptAttachment,
  CajaDiariaSession,
  CajaDiariaEntry,
  AccountingAccount,
  AccountingEntry,
  ChequeCarteraItem,
  ChequeCarteraResumen,
  ChequeTipo,
  CommercialModuleScope,
} from '../types';
import { resolveInvoiceModule, resolveReceiptModule } from '../services/salonConfig';
import {
  getEffectiveAccounts,
  resolveDefaultAccountForPaymentMethod,
  shouldDefaultImpactCajaDiaria,
  buildReceiptAccountingEntry,
} from '../utils/planDeCuentas';
import {
  formatInvoiceNumber,
  formatInvoiceLabel,
  resolveArcaInvoiceLinks,
  resolveRentalContractLinks,
  isExternalMigratedInvoice,
} from '../utils/crossLinks';
import { uploadImageToCloudflareR2 } from '../services/api';
import { optimizeImage } from '../services/imageOptimizer';
import {
  extractImageFromPasteEvent,
  readImageFromClipboard,
} from '../utils/clipboardImage';
import {
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Filter,
  FileText,
  Calendar,
  ClipboardList,
  Link2,
  Download,
  Printer,
  PlusCircle,
  ArrowDownCircle,
  X,
  Check,
  Building2,
  CreditCard,
  Wallet,
  Receipt,
  Eye,
  RotateCcw,
  Camera,
  Image as ImageIcon,
  Upload,
  Trash2,
  Loader2,
  Clipboard,
  ZoomIn,
  Landmark,
  Banknote,
  Plus,
  Copy,
} from 'lucide-react';

interface CobranzasSectionProps {
  invoices: ArcaInvoice[];
  rentals: RentalContract[];
  partesDiarios: ParteDiario[];
  receipts: CustomerPaymentReceipt[];
  cajaSessions?: CajaDiariaSession[];
  accountingAccounts?: AccountingAccount[];
  chequesCartera?: ChequeCarteraItem[];
  onSaveInvoices: (invoices: ArcaInvoice[]) => void;
  onUpdateRental: (rental: RentalContract) => Promise<void> | void;
  onUpdatePartesBatch?: (partes: ParteDiario[]) => Promise<void> | void;
  onSaveReceipts: (receipts: CustomerPaymentReceipt[]) => void;
  onSaveCajaSessions?: (sessions: CajaDiariaSession[]) => void;
  onSaveAccountingEntry?: (entry: AccountingEntry) => Promise<void> | void;
  onSaveChequesCartera?: (cheques: ChequeCarteraItem[]) => Promise<boolean | void> | void;
  onNavigateToPlanCuentas?: () => void;
  onNavigateToCarteraCheques?: () => void;
  onNavigateToView?: (view: any) => void;
  activeModuleScope?: CommercialModuleScope;
}

interface DraftChequeLine {
  tempId: string;
  tipo: ChequeTipo;
  numeroCheque: string;
  bancoEmisor: string;
  fechaEmision: string;
  fechaCobro: string;
  libradorNombre: string;
  cuitLibrador: string;
  importe: number;
  observaciones: string;
}

const addDaysIso = (isoDate: string, days: number): string => {
  const base = isoDate ? new Date(`${isoDate.slice(0, 10)}T00:00:00`) : new Date();
  if (isNaN(base.getTime())) return new Date().toISOString().split('T')[0];
  base.setDate(base.getDate() + days);
  return base.toISOString().split('T')[0];
};

const formatMoney = (amount: number, currency: 'ARS' | 'USD' = 'ARS') => {
  const val = Number(amount || 0);
  if (currency === 'USD') {
    return `US$ ${val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$ ${val.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

export const CobranzasSection: React.FC<CobranzasSectionProps> = ({
  invoices,
  rentals,
  partesDiarios,
  receipts,
  cajaSessions = [],
  accountingAccounts = [],
  chequesCartera = [],
  onSaveInvoices,
  onUpdateRental,
  onUpdatePartesBatch,
  onSaveReceipts,
  onSaveCajaSessions,
  onSaveAccountingEntry,
  onSaveChequesCartera,
  onNavigateToPlanCuentas,
  onNavigateToCarteraCheques,
  activeModuleScope = 'ALQUILERES',
}) => {
  const [moduleScopeFilter, setModuleScopeFilter] = useState<CommercialModuleScope | 'ALL'>(activeModuleScope);

  useEffect(() => {
    setModuleScopeFilter(activeModuleScope);
  }, [activeModuleScope]);

  const effectiveAccounts = useMemo(
    () => getEffectiveAccounts(accountingAccounts),
    [accountingAccounts]
  );

  const groupedDestinationAccounts = useMemo(() => {
    const eligible = effectiveAccounts.filter(
      a => a.activa && (a.esCuentaTesoreria || a.rubro === 'ACTIVO' || a.rubro === 'PASIVO')
    );
    return {
      bancos: eligible.filter(a => a.tipoTesoreria === 'BANCO'),
      cajas: eligible.filter(a => a.tipoTesoreria === 'CAJA'),
      valoresBilleteras: eligible.filter(
        a => a.tipoTesoreria === 'VALORES' || a.tipoTesoreria === 'BILLETERA'
      ),
      otras: eligible.filter(
        a =>
          a.tipoTesoreria !== 'BANCO' &&
          a.tipoTesoreria !== 'CAJA' &&
          a.tipoTesoreria !== 'VALORES' &&
          a.tipoTesoreria !== 'BILLETERA'
      ),
    };
  }, [effectiveAccounts]);

  const [activeTab, setActiveTab] = useState<'facturas' | 'alquileres' | 'recibos'>('facturas');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDIENTE_PAGO' | 'COBRADO_PARCIAL' | 'PAGADO'>('ALL');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  // Modal "Bajar Factura / Registrar Cobranza"
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [targetInvoices, setTargetInvoices] = useState<ArcaInvoice[]>([]);
  const [targetRentalOnly, setTargetRentalOnly] = useState<RentalContract | null>(null);

  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<CustomerPaymentMethod>('TRANSFERENCIA');
  const [selectedCuentaDestinoId, setSelectedCuentaDestinoId] = useState<string>('');
  const [montoCobradoInput, setMontoCobradoInput] = useState<number>(0);
  const [retencionesIibb, setRetencionesIibb] = useState<number>(0);
  const [retencionesGanancias, setRetencionesGanancias] = useState<number>(0);
  const [retencionesSussIva, setRetencionesSussIva] = useState<number>(0);
  const [descuentoProntoPago, setDescuentoProntoPago] = useState<number>(0);
  const [bancoReferencia, setBancoReferencia] = useState<string>('');
  const [observacionesPago, setObservacionesPago] = useState<string>('');
  const [impactarCajaDiaria, setImpactarCajaDiaria] = useState<boolean>(false);
  const [marcarCancelacionTotal, setMarcarCancelacionTotal] = useState<boolean>(true);
  const [ajustarCentavos, setAjustarCentavos] = useState<boolean>(false);
  const [draftCheques, setDraftCheques] = useState<DraftChequeLine[]>([]);
  const [chequeFormError, setChequeFormError] = useState<string | null>(null);

  const createDraftChequeLine = (
    overrides?: Partial<DraftChequeLine>
  ): DraftChequeLine => {
    const today = new Date().toISOString().split('T')[0];
    return {
      tempId: `dchq-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      tipo: 'FISICO',
      numeroCheque: '',
      bancoEmisor: '',
      fechaEmision: paymentDate || today,
      fechaCobro: paymentDate || today,
      libradorNombre:
        targetInvoices[0]?.razonSocialReceptor ||
        targetRentalOnly?.clienteNombre ||
        '',
      cuitLibrador:
        targetInvoices[0]?.nroDocReceptor ||
        targetRentalOnly?.clienteDocumento ||
        '',
      importe: 0,
      observaciones: '',
      ...overrides,
    };
  };

  const syncDraftChequesTotals = (nextLines: DraftChequeLine[]) => {
    setDraftCheques(nextLines);
    setChequeFormError(null);
    const sum = nextLines.reduce((acc, ch) => acc + Number(ch.importe || 0), 0);
    setMontoCobradoInput(Number(sum.toFixed(2)));
    const summaryParts = nextLines
      .filter(ch => ch.numeroCheque.trim() || ch.bancoEmisor.trim())
      .map(ch => `${ch.tipo === 'ECHEQ' ? 'E-Cheq' : 'Chq'} #${ch.numeroCheque.trim() || 'S/N'} (${ch.bancoEmisor.trim() || 'Banco'})`);
    if (summaryParts.length > 0) {
      setBancoReferencia(summaryParts.join(' · '));
    }
  };

  const selectedCuentaDestino = useMemo(() => {
    if (selectedCuentaDestinoId) {
      const found = effectiveAccounts.find(a => a.id === selectedCuentaDestinoId);
      if (found) return found;
    }
    return resolveDefaultAccountForPaymentMethod(paymentMethod, effectiveAccounts);
  }, [effectiveAccounts, selectedCuentaDestinoId, paymentMethod]);

  const applyPaymentMethodDefaults = (method: CustomerPaymentMethod) => {
    setPaymentMethod(method);
    const suggested = resolveDefaultAccountForPaymentMethod(method, effectiveAccounts);
    setSelectedCuentaDestinoId(suggested?.id || '');
    setImpactarCajaDiaria(shouldDefaultImpactCajaDiaria(method, suggested));
    setChequeFormError(null);
    if (method === 'CHEQUE_ECHEQ' && draftCheques.length === 0) {
      const initialAmt = Number((montoCobradoInput || totalRequeridoModal || 0).toFixed(2));
      setDraftCheques([createDraftChequeLine({ importe: initialAmt })]);
    }
  };

  const handleCuentaDestinoChange = (accountId: string) => {
    setSelectedCuentaDestinoId(accountId);
    const chosen = effectiveAccounts.find(a => a.id === accountId);
    setImpactarCajaDiaria(shouldDefaultImpactCajaDiaria(paymentMethod, chosen));
  };

  // Fotos / Comprobantes adjuntos optimizados en Cobranza
  const [paymentAttachments, setPaymentAttachments] = useState<PaymentReceiptAttachment[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState<boolean>(false);
  const [photoUploadStatus, setPhotoUploadStatus] = useState<string | null>(null);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState<boolean>(false);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; nombre: string; info?: string } | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const receiptViewPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const totalRequeridoModal = useMemo(() => {
    if (targetInvoices.length > 0) {
      return targetInvoices.reduce((acc, inv) => {
        const links = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
        return acc + (links.saldoPendiente > 0 ? links.saldoPendiente : inv.importeTotal);
      }, 0);
    } else if (targetRentalOnly) {
      const links = resolveRentalContractLinks(targetRentalOnly, partesDiarios, invoices);
      return links.saldoPendiente || targetRentalOnly.totalAlquiler || 0;
    }
    return 0;
  }, [targetInvoices, targetRentalOnly, rentals, partesDiarios, invoices]);

  const totalImputadoModal =
    Number(montoCobradoInput || 0) +
    Number(retencionesIibb || 0) +
    Number(retencionesGanancias || 0) +
    Number(retencionesSussIva || 0) +
    Number(descuentoProntoPago || 0);

  const saldoPendienteModal = Math.max(0, totalRequeridoModal - totalImputadoModal);
  const esCentavosSueltos = saldoPendienteModal > 0 && saldoPendienteModal <= 1000;

  // Modal para ver detalle de vínculos (Partes Diarios + Alquiler + Factura)
  const [inspectLinksModal, setInspectLinksModal] = useState<{
    title: string;
    subtitle: string;
    rentals: RentalContract[];
    invoices: ArcaInvoice[];
    partes: ParteDiario[];
  } | null>(null);

  // Modal para ver / imprimir Recibo de Cobranza (y cambiar entre múltiples recibos de la misma factura)
  const [selectedReceiptForView, setSelectedReceiptForView] = useState<CustomerPaymentReceipt | null>(null);
  const [receiptGroupForView, setReceiptGroupForView] = useState<CustomerPaymentReceipt[]>([]);
  const [invoiceDateSortDir, setInvoiceDateSortDir] = useState<'desc' | 'asc'>('desc');

  const openReceiptsViewer = (list: CustomerPaymentReceipt[]) => {
    if (!list || list.length === 0) return;
    setReceiptGroupForView(list);
    setSelectedReceiptForView(list[0]);
  };

  // Notas de Crédito vinculadas a cada factura (para detectar facturas anuladas por NC)
  const creditNotesByInvoiceId = useMemo(() => {
    const map = new Map<string, ArcaInvoice[]>();
    const creditNotes = invoices.filter(i => i.tipoComprobante.startsWith('NOTA_CREDITO'));
    const ncToFacturaType: Record<string, string> = {
      NOTA_CREDITO_A: 'FACTURA_A',
      NOTA_CREDITO_B: 'FACTURA_B',
      NOTA_CREDITO_C: 'FACTURA_C',
      NOTA_CREDITO_X: 'FACTURA_X',
    };
    invoices.forEach(inv => {
      if (inv.tipoComprobante.startsWith('NOTA_CREDITO')) {
        map.set(inv.id, []);
        return;
      }
      const invNum = formatInvoiceNumber(inv);
      const invDoc = (inv.nroDocReceptor || '').replace(/\D/g, '');
      const matched = creditNotes.filter(nc => {
        const assoc = nc.cbteAsociadoInfo;
        if (assoc) {
          if (assoc.idInvoice) return assoc.idInvoice === inv.id;
          return (
            assoc.tipoComprobante === inv.tipoComprobante &&
            Number(assoc.puntoVenta) === Number(inv.puntoVenta) &&
            Number(assoc.numeroComprobante) === Number(inv.numeroComprobante)
          );
        }
        const remito = nc.remitoPedido || '';
        if (remito.includes(inv.id)) return true;
        if (remito.includes(invNum)) {
          const expectedTipo = ncToFacturaType[nc.tipoComprobante];
          if (expectedTipo && inv.tipoComprobante !== expectedTipo) return false;
          const ncDoc = (nc.nroDocReceptor || '').replace(/\D/g, '');
          return !invDoc || !ncDoc || invDoc === ncDoc;
        }
        return false;
      });
      map.set(inv.id, matched);
    });
    return map;
  }, [invoices]);

  // Mapa rápido de Recibos de Cobro vinculados a cada factura
  const receiptsByInvoiceId = useMemo(() => {
    const map = new Map<string, CustomerPaymentReceipt[]>();
    invoices.forEach(inv => {
      if (inv.tipoComprobante.startsWith('NOTA_CREDITO')) {
        map.set(inv.id, []);
        return;
      }
      const invNum = formatInvoiceNumber(inv);
      const invLabel = formatInvoiceLabel(inv);
      const invDoc = (inv.nroDocReceptor || '').replace(/\D/g, '');
      const fromReceipts = receipts.filter(rec => {
        const recIds = rec.facturasIds || [];
        if (recIds.length > 0) {
          return recIds.includes(inv.id);
        }
        const recNums = rec.facturasNumeros || [];
        if (recNums.includes(invLabel)) return true;
        if (recNums.includes(invNum)) {
          const recDoc = (rec.clienteCuit || '').replace(/\D/g, '');
          return !invDoc || !recDoc || invDoc === recDoc;
        }
        if (inv.reciboCobroNumero && rec.numeroRecibo === inv.reciboCobroNumero) {
          const recDoc = (rec.clienteCuit || '').replace(/\D/g, '');
          return !invDoc || !recDoc || invDoc === recDoc;
        }
        return false;
      });
      const byId = new Map<string, CustomerPaymentReceipt>();
      (inv.recibosCobro || []).forEach(r => byId.set(r.id, r));
      // Preferir el registro vivo de `receipts` (tiene fotos/adjuntos actualizados)
      fromReceipts.forEach(r => byId.set(r.id, r));
      const matched = Array.from(byId.values()).sort((a, b) => {
        const byDate = (b.fecha || '').localeCompare(a.fecha || '');
        if (byDate !== 0) return byDate;
        return (b.numeroRecibo || '').localeCompare(a.numeroRecibo || '');
      });
      map.set(inv.id, matched);
    });
    return map;
  }, [invoices, receipts]);

  // Solo facturas (excluyendo Notas de Crédito para bajar cobros, aunque mostramos referencia)
  const billableInvoices = useMemo(
    () => invoices.filter(inv => !inv.tipoComprobante.startsWith('NOTA_CREDITO')),
    [invoices]
  );

  // Enriquecer cada factura con sus vínculos y estado de cobro resuelto
  const enrichedInvoices = useMemo(() => {
    return billableInvoices.map(inv => {
      const links = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
      const invReceipts = receiptsByInvoiceId.get(inv.id) || [];
      const invNCs = creditNotesByInvoiceId.get(inv.id) || [];
      const totalPaidByReceipts = invReceipts.reduce(
        (acc, r) => acc + Number(r.totalImputado || r.montoCobrado || 0),
        0
      );
      const rejectedChequesAmtForInv = invReceipts.reduce((acc, r) => {
        const chIds = new Set(r.chequesIds || (r.chequesResumen || []).map(c => c.id));
        if (chIds.size === 0) return acc;
        const rejSum = chequesCartera
          .filter(c => chIds.has(c.id) && c.estado === 'RECHAZADO')
          .reduce((s, c) => s + Number(c.importe || 0), 0);
        return acc + rejSum;
      }, 0);
      const netPaidByReceipts = Math.max(0, Number((totalPaidByReceipts - rejectedChequesAmtForInv).toFixed(2)));
      const totalByNCs = invNCs.reduce((acc, nc) => acc + Number(nc.importeTotal || 0), 0);
      const totalInvAmt = Number(inv.importeTotal || 0);
      const isFullyAnnulledByNC = totalInvAmt > 0 && totalByNCs >= totalInvAmt - 0.01 && netPaidByReceipts <= 0;

      const montoCobrado = Math.max(links.montoCobrado || 0, netPaidByReceipts);
      let estadoCobro = links.estadoCobro;
      let saldoPendiente = links.saldoPendiente;

      if (isFullyAnnulledByNC) {
        estadoCobro = 'PAGADO';
        saldoPendiente = 0;
      } else if (totalInvAmt > 0 && montoCobrado >= totalInvAmt - 0.01) {
        estadoCobro = 'PAGADO';
        saldoPendiente = 0;
      } else if (montoCobrado > 0 && estadoCobro === 'PENDIENTE_PAGO') {
        estadoCobro = 'COBRADO_PARCIAL';
        saldoPendiente = Math.max(0, Number((totalInvAmt - montoCobrado).toFixed(2)));
      }

      return {
        inv,
        ...links,
        estadoCobro,
        montoCobrado,
        saldoPendiente,
        invReceipts,
        invNCs,
        isFullyAnnulledByNC,
      };
    });
  }, [billableInvoices, rentals, partesDiarios, receiptsByInvoiceId, creditNotesByInvoiceId]);

  // Enriquecer cada contrato de alquiler con sus vínculos y estado de facturación/cobro
  const enrichedRentals = useMemo(() => {
    return rentals.map(rental => {
      const links = resolveRentalContractLinks(rental, partesDiarios, invoices);
      const byId = new Map<string, CustomerPaymentReceipt>();
      receipts.forEach(rec => {
        if ((rec.rentalsIds || []).includes(rental.id)) {
          byId.set(rec.id, rec);
        }
      });
      links.linkedInvoices.forEach(inv => {
        (receiptsByInvoiceId.get(inv.id) || []).forEach(rec => byId.set(rec.id, rec));
      });
      const linkedReceipts = Array.from(byId.values()).sort((a, b) =>
        (b.fecha || '').localeCompare(a.fecha || '')
      );
      return {
        rental,
        ...links,
        linkedReceipts,
      };
    });
  }, [rentals, partesDiarios, invoices, receipts, receiptsByInvoiceId]);

  const invoicesById = useMemo(() => {
    const map = new Map<string, ArcaInvoice>();
    invoices.forEach(inv => map.set(inv.id, inv));
    return map;
  }, [invoices]);

  const scopeCounts = useMemo(() => {
    let ventas = 0;
    let alquileres = 0;
    enrichedInvoices.forEach(({ inv }) => {
      if (resolveInvoiceModule(inv) === 'VENTAS_SALON') ventas += 1;
      else alquileres += 1;
    });
    return { ventas, alquileres, total: enrichedInvoices.length };
  }, [enrichedInvoices]);

  const scopedEnrichedInvoices = useMemo(() => {
    if (moduleScopeFilter === 'ALL') return enrichedInvoices;
    return enrichedInvoices.filter(({ inv }) => resolveInvoiceModule(inv) === moduleScopeFilter);
  }, [enrichedInvoices, moduleScopeFilter]);

  // KPIs de Cobranzas (filtrados por el módulo activo o Ver Todo)
  const kpis = useMemo(() => {
    let totalFacturadoPendiente = 0;
    let totalFacturadoCobrado = 0;
    let cantFacturasPendientes = 0;
    let cantFacturasPagadas = 0;

    scopedEnrichedInvoices.forEach(({ inv, estadoCobro, montoCobrado, saldoPendiente, isFullyAnnulledByNC }) => {
      if (isFullyAnnulledByNC) return;
      const mult = inv.moneda === 'USD' ? (inv.cotizacionDolar || 1150) : 1;
      if (estadoCobro === 'PAGADO') {
        totalFacturadoCobrado += inv.importeTotal * mult;
        cantFacturasPagadas += 1;
      } else {
        totalFacturadoCobrado += (montoCobrado || 0) * mult;
        totalFacturadoPendiente += (saldoPendiente || inv.importeTotal) * mult;
        cantFacturasPendientes += 1;
      }
    });

    const alquileresSinFacturar = enrichedRentals.filter(
      r => r.rental.estado !== 'CANCELADO' && r.estadoFacturacion === 'SIN_FACTURAR'
    ).length;

    const alquileresPendientesPago = enrichedRentals.filter(
      r => r.rental.estado !== 'CANCELADO' && r.estadoCobro !== 'PAGADO'
    ).length;

    return {
      totalFacturadoPendiente,
      totalFacturadoCobrado,
      cantFacturasPendientes,
      cantFacturasPagadas,
      alquileresSinFacturar,
      alquileresPendientesPago,
    };
  }, [scopedEnrichedInvoices, enrichedRentals]);

  // Filtrado y Ordenamiento de Facturas (Por fecha de factura descendente por defecto)
  const filteredInvoices = useMemo(() => {
    const dir = invoiceDateSortDir === 'desc' ? -1 : 1;
    return scopedEnrichedInvoices
      .filter(({ inv, linkedRentals, linkedPartes, estadoCobro }) => {
        if (statusFilter !== 'ALL' && estadoCobro !== statusFilter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const num = formatInvoiceNumber(inv).toLowerCase();
        const matchInv =
          num.includes(q) ||
          inv.razonSocialReceptor.toLowerCase().includes(q) ||
          inv.nroDocReceptor.toLowerCase().includes(q) ||
          (inv.remitoPedido || '').toLowerCase().includes(q) ||
          (inv.reciboCobroNumero || '').toLowerCase().includes(q);
        const matchRental = linkedRentals.some(
          r =>
            r.numeroContrato.toLowerCase().includes(q) ||
            r.equipoModelo.toLowerCase().includes(q)
        );
        const matchParte = linkedPartes.some(
          p =>
            (p.numParte || '').toLowerCase().includes(q) ||
            (p.obra || '').toLowerCase().includes(q)
        );
        return matchInv || matchRental || matchParte;
      })
      .sort((a, b) => {
        const cmpDate = (a.inv.fecha || '').localeCompare(b.inv.fecha || '');
        if (cmpDate !== 0) return cmpDate * dir;
        const cmpNum =
          Number(a.inv.numeroComprobante || 0) - Number(b.inv.numeroComprobante || 0);
        if (cmpNum !== 0) return cmpNum * dir;
        return (a.inv.createdAt || '').localeCompare(b.inv.createdAt || '') * dir;
      });
  }, [scopedEnrichedInvoices, statusFilter, searchQuery, invoiceDateSortDir]);

  // Filtrado y Ordenamiento de Alquileres (fecha descendente)
  const filteredRentals = useMemo(() => {
    return enrichedRentals
      .filter(({ rental, facturaNumero, estadoCobro, linkedPartes }) => {
        if (rental.estado === 'CANCELADO') return false;
        if (statusFilter !== 'ALL' && estadoCobro !== statusFilter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          rental.numeroContrato.toLowerCase().includes(q) ||
          rental.clienteNombre.toLowerCase().includes(q) ||
          (rental.clienteDocumento || '').toLowerCase().includes(q) ||
          rental.equipoModelo.toLowerCase().includes(q) ||
          (facturaNumero || '').toLowerCase().includes(q) ||
          linkedPartes.some(p => (p.numParte || '').toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const cmpDate = (b.rental.fechaInicio || '').localeCompare(a.rental.fechaInicio || '');
        if (cmpDate !== 0) return cmpDate;
        return (b.rental.numeroContrato || '').localeCompare(a.rental.numeroContrato || '');
      });
  }, [enrichedRentals, statusFilter, searchQuery]);

  // Filtrado y Ordenamiento de Recibos (fecha descendente + búsqueda + módulo activo)
  const filteredReceipts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return receipts
      .filter(rec => {
        if (moduleScopeFilter !== 'ALL' && resolveReceiptModule(rec, invoicesById) !== moduleScopeFilter) {
          return false;
        }
        if (!q) return true;
        return (
          (rec.numeroRecibo || '').toLowerCase().includes(q) ||
          (rec.clienteNombre || '').toLowerCase().includes(q) ||
          (rec.clienteCuit || '').toLowerCase().includes(q) ||
          (rec.bancoReferencia || '').toLowerCase().includes(q) ||
          (rec.facturasNumeros || []).some(fn => fn.toLowerCase().includes(q)) ||
          (rec.rentalsNumeros || []).some(rn => rn.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const cmpDate = (b.fecha || '').localeCompare(a.fecha || '');
        if (cmpDate !== 0) return cmpDate;
        return (b.numeroRecibo || '').localeCompare(a.numeroRecibo || '');
      });
  }, [receipts, searchQuery, moduleScopeFilter, invoicesById]);

  // Abrir modal para bajar una o varias facturas
  const openPaymentModalForInvoices = (invs: ArcaInvoice[]) => {
    if (invs.length === 0) return;
    setTargetInvoices(invs);
    setTargetRentalOnly(null);

    const totalSaldo = invs.reduce((acc, inv) => {
      const links = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
      return acc + (links.saldoPendiente > 0 ? links.saldoPendiente : inv.importeTotal);
    }, 0);

    setPaymentDate(new Date().toISOString().split('T')[0]);
    setMontoCobradoInput(Number(totalSaldo.toFixed(2)));
    setRetencionesIibb(0);
    setRetencionesGanancias(0);
    setRetencionesSussIva(0);
    setDescuentoProntoPago(0);
    setDraftCheques([
      {
        tempId: `dchq-${Date.now()}`,
        tipo: 'FISICO',
        numeroCheque: '',
        bancoEmisor: '',
        fechaEmision: new Date().toISOString().split('T')[0],
        fechaCobro: new Date().toISOString().split('T')[0],
        libradorNombre: invs[0]?.razonSocialReceptor || '',
        cuitLibrador: invs[0]?.nroDocReceptor || '',
        importe: Number(totalSaldo.toFixed(2)),
        observaciones: '',
      },
    ]);
    setChequeFormError(null);
    applyPaymentMethodDefaults('TRANSFERENCIA');
    setBancoReferencia('');
    setObservacionesPago('');
    setPaymentAttachments([]);
    setPhotoUploadStatus(null);
    setMarcarCancelacionTotal(true);
    setAjustarCentavos(false);
    setIsPaymentModalOpen(true);
  };

  // Abrir modal para cobrar un alquiler directo (aunque no tenga factura o con su factura vinculada)
  const openPaymentModalForRental = (rental: RentalContract) => {
    const links = resolveRentalContractLinks(rental, partesDiarios, invoices);
    if (links.linkedInvoices.length > 0) {
      openPaymentModalForInvoices(links.linkedInvoices);
      return;
    }
    const rentalSaldo = Number((links.saldoPendiente || rental.totalAlquiler || 0).toFixed(2));
    setTargetInvoices([]);
    setTargetRentalOnly(rental);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setMontoCobradoInput(rentalSaldo);
    setRetencionesIibb(0);
    setRetencionesGanancias(0);
    setRetencionesSussIva(0);
    setDescuentoProntoPago(0);
    setDraftCheques([
      {
        tempId: `dchq-${Date.now()}`,
        tipo: 'FISICO',
        numeroCheque: '',
        bancoEmisor: '',
        fechaEmision: new Date().toISOString().split('T')[0],
        fechaCobro: new Date().toISOString().split('T')[0],
        libradorNombre: rental.clienteNombre || '',
        cuitLibrador: rental.clienteDocumento || '',
        importe: rentalSaldo,
        observaciones: '',
      },
    ]);
    setChequeFormError(null);
    applyPaymentMethodDefaults('TRANSFERENCIA');
    setBancoReferencia('');
    setObservacionesPago('');
    setPaymentAttachments([]);
    setPhotoUploadStatus(null);
    setMarcarCancelacionTotal(true);
    setAjustarCentavos(false);
    setIsPaymentModalOpen(true);
  };

  // Optimizar siempre a WebP liviano (máx 1280px, 74%) y subir a R2 (con fallback local WebP optimizado)
  const optimizeAndUploadPaymentFiles = async (
    rawFiles: File[]
  ): Promise<PaymentReceiptAttachment[]> => {
    const imageFiles = rawFiles.filter(
      f => (f.type || '').startsWith('image/') || /\.(png|jpe?g|webp|heic|bmp)$/i.test(f.name || '')
    );
    if (imageFiles.length === 0) {
      setPhotoUploadStatus('Solo se admiten imágenes/fotos (JPG, PNG, WEBP).');
      return [];
    }

    setIsUploadingPhotos(true);
    setPhotoUploadStatus(`Optimizando ${imageFiles.length} foto(s) a WebP liviano...`);

    const uploaded: PaymentReceiptAttachment[] = [];
    let savedKB = 0;

    try {
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const safeName = file.name || `comprobante-cobranza-${Date.now()}-${i + 1}.jpg`;
        const optConfig = {
          maxWidth: 1280,
          maxHeight: 1280,
          quality: 0.74,
          format: 'image/webp' as const,
        };

        const r2Res = await uploadImageToCloudflareR2(
          file,
          safeName,
          file.type || 'image/jpeg',
          optConfig,
          'cobranzas'
        );

        if (r2Res.success && r2Res.url) {
          const origKB = r2Res.originalSizeKB ?? Math.max(1, Math.round(file.size / 1024));
          const optKB = r2Res.optimizedSizeKB ?? origKB;
          if (origKB > optKB) savedKB += origKB - optKB;

          uploaded.push({
            id: `COB-IMG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            url: r2Res.url,
            nombre: safeName,
            tipoArchivo: 'IMAGE',
            originalSizeKB: origKB,
            optimizedSizeKB: optKB,
            reductionPercentage: r2Res.reductionPercentage ?? 0,
            fechaSubida: new Date().toISOString(),
          });
        } else {
          // Fallback: comprimir en navegador a WebP ultra-liviano para que nunca pese ni falle
          const optLocal = await optimizeImage(file, {
            fileName: safeName,
            maxWidth: 1100,
            maxHeight: 1100,
            quality: 0.68,
            format: 'image/webp',
          });
          if (optLocal.originalSizeKB > optLocal.optimizedSizeKB) {
            savedKB += optLocal.originalSizeKB - optLocal.optimizedSizeKB;
          }
          uploaded.push({
            id: `COB-IMG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            url: optLocal.base64,
            nombre: optLocal.fileName || safeName,
            tipoArchivo: 'IMAGE',
            originalSizeKB: optLocal.originalSizeKB,
            optimizedSizeKB: optLocal.optimizedSizeKB,
            reductionPercentage: optLocal.reductionPercentage,
            fechaSubida: new Date().toISOString(),
          });
        }
      }

      setPhotoUploadStatus(
        savedKB > 0
          ? `✓ ${uploaded.length} foto(s) optimizadas en WebP (ahorraste ${
              savedKB >= 1024 ? `${(savedKB / 1024).toFixed(2)} MB` : `${savedKB} KB`
            })`
          : `✓ ${uploaded.length} foto(s) optimizadas adjuntas`
      );
      return uploaded;
    } catch (err: any) {
      setPhotoUploadStatus(`Error al procesar foto: ${err?.message || 'intentá nuevamente'}`);
      return uploaded;
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const handlePaymentFilesSelected = async (files: FileList | File[] | null) => {
    const arr = Array.from(files || []);
    if (arr.length === 0) return;
    const newlyUploaded = await optimizeAndUploadPaymentFiles(arr);
    if (newlyUploaded.length > 0) {
      setPaymentAttachments(prev => [...prev, ...newlyUploaded]);
    }
  };

  const handlePastePaymentPhoto = async (e?: React.ClipboardEvent) => {
    const res = e ? await extractImageFromPasteEvent(e) : await readImageFromClipboard();
    if (!res) {
      if (!e) setPhotoUploadStatus('No se detectó ninguna imagen en el portapapeles.');
      return;
    }
    if (e) e.preventDefault();
    if (res.file && res.file.size > 0) {
      await handlePaymentFilesSelected([res.file]);
    } else if (res.base64) {
      setIsUploadingPhotos(true);
      try {
        const opt = await optimizeImage(res.base64, {
          fileName: `captura-cobranza-${Date.now()}.webp`,
          maxWidth: 1280,
          maxHeight: 1280,
          quality: 0.74,
          format: 'image/webp',
        });
        const r2Res = await uploadImageToCloudflareR2(
          opt.base64,
          opt.fileName,
          opt.contentType,
          { maxWidth: 1280, maxHeight: 1280, quality: 0.74, format: 'image/webp' },
          'cobranzas'
        );
        const att: PaymentReceiptAttachment = {
          id: `COB-IMG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url: r2Res.success && r2Res.url ? r2Res.url : opt.base64,
          nombre: opt.fileName,
          tipoArchivo: 'IMAGE',
          originalSizeKB: opt.originalSizeKB,
          optimizedSizeKB: opt.optimizedSizeKB,
          reductionPercentage: opt.reductionPercentage,
          fechaSubida: new Date().toISOString(),
        };
        setPaymentAttachments(prev => [...prev, att]);
        setPhotoUploadStatus(
          `✓ Captura pegada y optimizada (${opt.originalSizeKB}KB → ${opt.optimizedSizeKB}KB WebP)`
        );
      } finally {
        setIsUploadingPhotos(false);
      }
    }
  };

  // Agregar o quitar fotos en un recibo ya emitido (persiste en recibos y en facturas vinculadas)
  const updateReceiptAttachmentsPersisted = (
    receiptId: string,
    nextAttachments: PaymentReceiptAttachment[]
  ) => {
    const updatedReceipts = receipts.map(r =>
      r.id === receiptId
        ? { ...r, adjuntos: nextAttachments.length > 0 ? nextAttachments : undefined }
        : r
    );
    onSaveReceipts(updatedReceipts);

    const updatedRec = updatedReceipts.find(r => r.id === receiptId) || null;
    if (updatedRec) {
      setSelectedReceiptForView(updatedRec);
      if (updatedRec.facturasIds && updatedRec.facturasIds.length > 0) {
        const targetSet = new Set(updatedRec.facturasIds);
        const updatedInvoices = invoices.map(inv => {
          if (!targetSet.has(inv.id) || !inv.recibosCobro) return inv;
          return {
            ...inv,
            recibosCobro: inv.recibosCobro.map(rc => (rc.id === receiptId ? updatedRec : rc)),
          };
        });
        onSaveInvoices(updatedInvoices);
      }
    }
  };

  const handleAttachPhotosToExistingReceipt = async (
    rec: CustomerPaymentReceipt,
    files: FileList | File[] | null
  ) => {
    const arr = Array.from(files || []);
    if (arr.length === 0) return;
    const newlyUploaded = await optimizeAndUploadPaymentFiles(arr);
    if (newlyUploaded.length > 0) {
      const nextList = [...(rec.adjuntos || []), ...newlyUploaded];
      updateReceiptAttachmentsPersisted(rec.id, nextList);
    }
  };

  // Toggle rápido 1-click para marcar Factura PAGADO / PENDIENTE DE PAGO
  const handleQuickToggleInvoiceStatus = async (inv: ArcaInvoice) => {
    const links = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
    const nextStatus: 'PAGADO' | 'PENDIENTE_PAGO' =
      links.estadoCobro === 'PAGADO' ? 'PENDIENTE_PAGO' : 'PAGADO';
    const today = new Date().toISOString().split('T')[0];

    const updatedInvoices = invoices.map(item => {
      if (item.id !== inv.id) return item;
      return {
        ...item,
        estadoCobro: nextStatus,
        montoCobrado: nextStatus === 'PAGADO' ? item.importeTotal : 0,
        saldoPendiente: nextStatus === 'PAGADO' ? 0 : item.importeTotal,
        fechaCobro: nextStatus === 'PAGADO' ? today : undefined,
      };
    });
    onSaveInvoices(updatedInvoices);

    // Propagar a los Contratos de Alquiler vinculados
    for (const r of links.linkedRentals) {
      await Promise.resolve(
        onUpdateRental({
          ...r,
          facturaId: inv.id,
          facturaNumero: formatInvoiceNumber(inv),
          estadoFacturacion: 'FACTURADO',
          estadoCobro: nextStatus,
          montoCobrado: nextStatus === 'PAGADO' ? r.totalAlquiler : 0,
          fechaCobro: nextStatus === 'PAGADO' ? today : undefined,
        })
      );
    }

    // Propagar a los Partes Diarios vinculados
    if (links.linkedPartes.length > 0 && onUpdatePartesBatch) {
      const updatedPartes = links.linkedPartes.map(p => ({
        ...p,
        facturaId: inv.id,
        facturaNumero: formatInvoiceNumber(inv),
        estadoCobro: nextStatus,
      }));
      await Promise.resolve(onUpdatePartesBatch(updatedPartes));
    }
  };

  // Toggle rápido 1-click para marcar Contrato de Alquiler PAGADO / PENDIENTE DE PAGO
  const handleQuickToggleRentalStatus = async (rental: RentalContract) => {
    const links = resolveRentalContractLinks(rental, partesDiarios, invoices);
    if (links.primaryInvoice) {
      await handleQuickToggleInvoiceStatus(links.primaryInvoice);
      return;
    }

    const nextStatus: 'PAGADO' | 'PENDIENTE_PAGO' =
      links.estadoCobro === 'PAGADO' ? 'PENDIENTE_PAGO' : 'PAGADO';
    const today = new Date().toISOString().split('T')[0];

    await Promise.resolve(
      onUpdateRental({
        ...rental,
        estadoCobro: nextStatus,
        montoCobrado: nextStatus === 'PAGADO' ? rental.totalAlquiler : 0,
        fechaCobro: nextStatus === 'PAGADO' ? today : undefined,
      })
    );

    if (links.linkedPartes.length > 0 && onUpdatePartesBatch) {
      const updatedPartes = links.linkedPartes.map(p => ({
        ...p,
        rentalId: rental.id,
        rentalNumero: rental.numeroContrato,
        estadoCobro: nextStatus,
      }));
      await Promise.resolve(onUpdatePartesBatch(updatedPartes));
    }
  };

  // Confirmar "Bajar Factura / Registrar Recibo de Cobranza"
  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setChequeFormError(null);

    if (paymentMethod === 'CHEQUE_ECHEQ') {
      if (draftCheques.length === 0) {
        setChequeFormError('Agregá al menos un cheque o E-Cheq para registrar este cobro.');
        return;
      }
      const invalidIdx = draftCheques.findIndex(
        d => !d.numeroCheque.trim() || !d.bancoEmisor.trim() || !d.fechaCobro || Number(d.importe) <= 0
      );
      if (invalidIdx >= 0) {
        setChequeFormError(
          `Completá N° Cheque, Banco Emisor, Fecha de Cobro e Importe (> 0) en el cheque #${invalidIdx + 1}.`
        );
        return;
      }
    }

    const extraCentavos = ajustarCentavos && saldoPendienteModal > 0 ? saldoPendienteModal : 0;
    const finalDescuento = Number(descuentoProntoPago || 0) + extraCentavos;
    const effectiveMontoCobrado =
      paymentMethod === 'CHEQUE_ECHEQ'
        ? Number(draftCheques.reduce((s, d) => s + Number(d.importe || 0), 0).toFixed(2))
        : Number(montoCobradoInput || 0);

    const totalImputado =
      effectiveMontoCobrado +
      Number(retencionesIibb || 0) +
      Number(retencionesGanancias || 0) +
      Number(retencionesSussIva || 0) +
      finalDescuento;

    const isPaid = marcarCancelacionTotal || totalImputado >= totalRequeridoModal - 1 || ajustarCentavos;
    const finalStatusForLinked: 'PAGADO' | 'COBRADO_PARCIAL' = isPaid ? 'PAGADO' : 'COBRADO_PARCIAL';

    const maxExistingReceiptSeq = receipts.reduce((max, r) => {
      const m = String(r.numeroRecibo || '').match(/(\d+)$/);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
    const nextReceiptNum = `0001-${String(Math.max(receipts.length, maxExistingReceiptSeq) + 1).padStart(8, '0')}`;
    const newReceiptId = `REC-${Date.now()}`;

    const allLinkedRentalsMap = new Map<string, RentalContract>();
    const allLinkedPartesMap = new Map<string, ParteDiario>();

    if (targetInvoices.length > 0) {
      targetInvoices.forEach(inv => {
        const links = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
        links.linkedRentals.forEach(r => allLinkedRentalsMap.set(r.id, r));
        links.linkedPartes.forEach(p => allLinkedPartesMap.set(p.id, p));
      });
    } else if (targetRentalOnly) {
      allLinkedRentalsMap.set(targetRentalOnly.id, targetRentalOnly);
      const links = resolveRentalContractLinks(targetRentalOnly, partesDiarios, invoices);
      links.linkedPartes.forEach(p => allLinkedPartesMap.set(p.id, p));
    }

    const clienteNombre =
      targetInvoices[0]?.razonSocialReceptor ||
      targetRentalOnly?.clienteNombre ||
      'CLIENTE';
    const clienteCuit =
      targetInvoices[0]?.nroDocReceptor ||
      targetRentalOnly?.clienteDocumento ||
      '';
    const moneda: 'ARS' | 'USD' =
      (targetInvoices[0]?.moneda || targetRentalOnly?.moneda || 'ARS') as 'ARS' | 'USD';

    const chosenAccount =
      selectedCuentaDestino || resolveDefaultAccountForPaymentMethod(paymentMethod, effectiveAccounts);
    const newAsientoId = `AS-${newReceiptId}`;
    const nowIso = new Date().toISOString();

    const chequesCreados: ChequeCarteraItem[] =
      paymentMethod === 'CHEQUE_ECHEQ'
        ? draftCheques.map((d, idx) => ({
            id: `CHQ-${Date.now()}-${idx}-${Math.random().toString(16).slice(2, 6)}`,
            numeroCheque: d.numeroCheque.trim(),
            tipo: d.tipo,
            bancoEmisor: d.bancoEmisor.trim(),
            fechaRecepcion: paymentDate,
            fechaEmision: d.fechaEmision || paymentDate,
            fechaCobro: d.fechaCobro || paymentDate,
            importe: Number(Number(d.importe || 0).toFixed(2)),
            moneda,
            libradorNombre: d.libradorNombre.trim() || clienteNombre,
            cuitLibrador: d.cuitLibrador.trim() || clienteCuit || undefined,
            reciboId: newReceiptId,
            reciboNumero: nextReceiptNum,
            clienteNombre,
            clienteCuit: clienteCuit || undefined,
            facturasIds: targetInvoices.map(i => i.id),
            facturasNumeros: targetInvoices.map(i => formatInvoiceNumber(i)),
            rentalsIds: Array.from(allLinkedRentalsMap.keys()),
            estado: 'EN_CARTERA',
            cuentaValoresId: chosenAccount?.id || 'CTA-1105',
            observaciones: d.observaciones.trim() || undefined,
            historial: [
              {
                id: `hist-${Date.now()}-${idx}`,
                fecha: paymentDate,
                estado: 'EN_CARTERA',
                detalle: `Ingresado en Cartera desde Cobranza REC #${nextReceiptNum} (${clienteNombre})`,
              },
            ],
            createdAt: nowIso,
          }))
        : [];

    const chequesResumen: ChequeCarteraResumen[] | undefined =
      chequesCreados.length > 0
        ? chequesCreados.map(c => ({
            id: c.id,
            numeroCheque: c.numeroCheque,
            tipo: c.tipo,
            bancoEmisor: c.bancoEmisor,
            fechaCobro: c.fechaCobro,
            importe: c.importe,
          }))
        : undefined;

    const autoChequesRef =
      chequesCreados.length > 0
        ? chequesCreados
            .map(c => `${c.tipo === 'ECHEQ' ? 'E-Cheq' : 'Chq'} #${c.numeroCheque} (${c.bancoEmisor} · Vto ${c.fechaCobro})`)
            .join(' | ')
        : '';

    const newReceipt: CustomerPaymentReceipt = {
      id: newReceiptId,
      numeroRecibo: nextReceiptNum,
      fecha: paymentDate,
      clienteNombre,
      clienteCuit,
      facturasIds: targetInvoices.map(i => i.id),
      facturasNumeros: targetInvoices.map(i => formatInvoiceNumber(i)),
      rentalsIds: Array.from(allLinkedRentalsMap.keys()),
      rentalsNumeros: Array.from(allLinkedRentalsMap.values()).map(r => r.numeroContrato),
      partesDiariosIds: Array.from(allLinkedPartesMap.keys()),
      moneda,
      montoCobrado: effectiveMontoCobrado,
      retencionesIibb: Number(retencionesIibb || 0),
      retencionesGanancias: Number(retencionesGanancias || 0),
      retencionesSussIva: Number(retencionesSussIva || 0),
      descuentoProntoPago: finalDescuento,
      totalImputado,
      formaPago: paymentMethod,
      bancoReferencia: bancoReferencia.trim() || autoChequesRef || undefined,
      chequesIds: chequesCreados.length > 0 ? chequesCreados.map(c => c.id) : undefined,
      chequesResumen,
      cuentaDestinoId: chosenAccount?.id,
      cuentaDestinoCodigo: chosenAccount?.codigo,
      cuentaDestinoNombre: chosenAccount?.nombre,
      asientoContableId: newAsientoId,
      impactadoEnCaja: impactarCajaDiaria,
      origenModulo: targetInvoices[0]
        ? resolveInvoiceModule(targetInvoices[0])
        : targetRentalOnly
          ? 'ALQUILERES'
          : activeModuleScope,
      observaciones: observacionesPago.trim() || undefined,
      adjuntos: paymentAttachments.length > 0 ? paymentAttachments : undefined,
      createdAt: nowIso,
    };

    // 1. Guardar Recibo
    const updatedReceipts = [newReceipt, ...receipts];
    onSaveReceipts(updatedReceipts);

    // 1a. Registrar cheques individuales en Cartera de Cheques
    if (chequesCreados.length > 0 && onSaveChequesCartera) {
      await Promise.resolve(onSaveChequesCartera(chequesCreados));
    }

    // 1b. Registrar Asiento Contable automático en el Plan de Cuentas (Bancos / Caja / Valores / Retenciones)
    if (onSaveAccountingEntry) {
      const accountingEntry = buildReceiptAccountingEntry(
        newReceipt,
        effectiveAccounts,
        newAsientoId
      );
      if (accountingEntry) {
        await Promise.resolve(onSaveAccountingEntry(accountingEntry));
      }
    }

    // 2. Actualizar Facturas Imputadas ("Bajar Facturas")
    if (targetInvoices.length > 0) {
      let remainingToAllocate = totalImputado;
      const targetIdsSet = new Set(targetInvoices.map(i => i.id));

      const updatedInvoices = invoices.map(inv => {
        if (!targetIdsSet.has(inv.id)) return inv;
        const prevCobrado = inv.montoCobrado || 0;
        const prevSaldo =
          inv.saldoPendiente !== undefined
            ? inv.saldoPendiente
            : Math.max(0, inv.importeTotal - prevCobrado);

        let allocated = 0;
        if (targetInvoices.length === 1) {
          allocated = totalImputado;
        } else {
          allocated = Math.min(prevSaldo, remainingToAllocate);
          remainingToAllocate = Math.max(0, remainingToAllocate - allocated);
        }

        const isPaidInv = isPaid || allocated >= prevSaldo - 1;
        const nuevoMontoCobrado = Math.min(inv.importeTotal, prevCobrado + allocated);
        const nuevoSaldo = isPaidInv
          ? 0
          : Math.max(0, Number((inv.importeTotal - nuevoMontoCobrado).toFixed(2)));
        const nuevoEstado: 'PAGADO' | 'COBRADO_PARCIAL' =
          isPaidInv || nuevoSaldo <= 1 ? 'PAGADO' : 'COBRADO_PARCIAL';


        return {
          ...inv,
          estadoCobro: nuevoEstado,
          montoCobrado: nuevoEstado === 'PAGADO' ? inv.importeTotal : nuevoMontoCobrado,
          saldoPendiente: nuevoSaldo,
          fechaCobro: paymentDate,
          formaPagoCobro: paymentMethod,
          reciboCobroNumero: nextReceiptNum,
          recibosCobro: [...(inv.recibosCobro || []), newReceipt],
        };
      });

      onSaveInvoices(updatedInvoices);
    }

    // 3. Actualizar Contratos de Alquiler vinculados
    for (const rental of Array.from(allLinkedRentalsMap.values())) {
      const primaryInv = targetInvoices[0];
      const isPaid = marcarCancelacionTotal || finalStatusForLinked === 'PAGADO';
      await Promise.resolve(
        onUpdateRental({
          ...rental,
          facturaId: primaryInv ? primaryInv.id : rental.facturaId,
          facturaNumero: primaryInv ? formatInvoiceNumber(primaryInv) : rental.facturaNumero,
          estadoFacturacion: primaryInv || rental.facturaNumero ? 'FACTURADO' : rental.estadoFacturacion,
          estadoCobro: isPaid ? 'PAGADO' : 'COBRADO_PARCIAL',
          montoCobrado: isPaid ? rental.totalAlquiler : totalImputado,
          fechaCobro: paymentDate,
          formaPagoCobro: paymentMethod,
          reciboCobroNumero: nextReceiptNum,
        })
      );
    }

    // 4. Actualizar Partes Diarios vinculados
    const linkedPartesList = Array.from(allLinkedPartesMap.values());
    if (linkedPartesList.length > 0 && onUpdatePartesBatch) {
      const primaryInv = targetInvoices[0];
      const isPaid = marcarCancelacionTotal || finalStatusForLinked === 'PAGADO';
      const updatedPartes = linkedPartesList.map(p => ({
        ...p,
        facturaId: primaryInv ? primaryInv.id : p.facturaId,
        facturaNumero: primaryInv ? formatInvoiceNumber(primaryInv) : p.facturaNumero,
        estadoCobro: isPaid ? 'PAGADO' : 'COBRADO_PARCIAL',
      }));
      await Promise.resolve(onUpdatePartesBatch(updatedPartes));
    }

    // 5. Impactar en Caja Diaria si está tildado
    if (impactarCajaDiaria && onSaveCajaSessions && montoCobradoInput > 0) {
      const isCash = paymentMethod === 'EFECTIVO_CAJA';
      const newEntry: CajaDiariaEntry = {
        id: `COB-${Date.now()}`,
        fecha: paymentDate,
        tipoMovimiento: 'INGRESO',
        comprobante:
          targetInvoices.length > 0
            ? `REC ${nextReceiptNum} (Fact. ${targetInvoices.map(i => formatInvoiceNumber(i)).join(', ')})`
            : `REC ${nextReceiptNum} (${targetRentalOnly?.numeroContrato || 'Alquiler'})`,
        concepto: `Cobranza ${clienteNombre}${
          allLinkedRentalsMap.size > 0
            ? ` • Alquiler ${Array.from(allLinkedRentalsMap.values())
                .map(r => r.numeroContrato)
                .join(', ')}`
            : ''
        }`,
        categoria: 'ALQUILER_EQUIPOS',
        montoEfectivo: isCash ? Number(montoCobradoInput) : 0,
        montoTarjetaTransf: !isCash ? Number(montoCobradoInput) : 0,
        montoCtaCte: 0,
        montoAridos: 0,
        montoAlquilerEquipo: Number(montoCobradoInput),
        montoGasto: 0,
        montoTotal: Number(montoCobradoInput),
        formaPagoDetalle: `${paymentMethod}${bancoReferencia ? ` • ${bancoReferencia}` : ''}`,
        proveedorCliente: clienteNombre,
        observaciones: observacionesPago || undefined,
      };

      const existingSessionIdx = cajaSessions.findIndex(s => s.fecha === paymentDate);
      if (existingSessionIdx >= 0) {
        const updatedSessions = [...cajaSessions];
        updatedSessions[existingSessionIdx] = {
          ...updatedSessions[existingSessionIdx],
          entradas: [newEntry, ...updatedSessions[existingSessionIdx].entradas],
          updatedAt: new Date().toISOString(),
        };
        onSaveCajaSessions(updatedSessions);
      } else {
        const newSession: CajaDiariaSession = {
          id: `CAJA-${paymentDate}`,
          fecha: paymentDate,
          estado: 'ABIERTA',
          aperturaCaja: 0,
          entradas: [newEntry],
          arqueo: {
            b20000: 0,
            b10000: 0,
            b2000: 0,
            b1000: 0,
            b500: 0,
            b200: 0,
            b100: 0,
            b50: 0,
            b20: 0,
            b10: 0,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        onSaveCajaSessions([newSession, ...cajaSessions]);
      }
    }

    setSelectedInvoiceIds([]);
    setIsPaymentModalOpen(false);
    openReceiptsViewer([newReceipt]);
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/90 via-slate-900 to-amber-950/40 p-5 border border-emerald-500/30 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-emerald-500/20 rounded-xl border border-emerald-500/40 text-emerald-400 shrink-0">
              <DollarSign className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  VENTAS & CUENTAS CORRIENTES
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  TRAZABILIDAD: PARTES ↔ ALQUILERES ↔ FACTURAS
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1">
                Cobranzas, Recibos & Bajada de Facturas ARCA
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                Bajá las facturas emitidas registrando su cobro total o parcial, e impactá automáticamente el estado <strong className="text-emerald-400">PAGADO</strong> en el Contrato de Alquiler y en sus Partes Diarios vinculados.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onNavigateToCarteraCheques && (
              <button
                type="button"
                onClick={onNavigateToCarteraCheques}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 transition flex items-center gap-1.5 cursor-pointer"
                title="Ver agenda de cheques en cartera, clearing, endosos y acreditaciones"
              >
                <Banknote className="w-4 h-4" />
                Cartera de Cheques
              </button>
            )}
            {onNavigateToPlanCuentas && (
              <button
                type="button"
                onClick={onNavigateToPlanCuentas}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/35 transition flex items-center gap-1.5 cursor-pointer"
                title="Abrir Plan de Cuentas, saldos de Bancos y Movimientos"
              >
                <Landmark className="w-4 h-4" />
                Plan de Cuentas & Bancos
              </button>
            )}
            {selectedInvoiceIds.length > 0 && (
              <button
                onClick={() => {
                  const selected = billableInvoices.filter(i => selectedInvoiceIds.includes(i.id));
                  openPaymentModalForInvoices(selected);
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-lg shadow-amber-900/30 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowDownCircle className="w-4 h-4" />
                Bajar {selectedInvoiceIds.length} Factura(s) Seleccionada(s)
              </button>
            )}
            <button
              onClick={() => {
                const pending = enrichedInvoices
                  .filter(e => e.estadoCobro !== 'PAGADO')
                  .map(e => e.inv);
                if (pending.length > 0) {
                  openPaymentModalForInvoices([pending[0]]);
                } else if (billableInvoices.length > 0) {
                  openPaymentModalForInvoices([billableInvoices[0]]);
                }
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-lg shadow-emerald-950/50 flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              + Registrar Cobranza / Bajar Factura
            </button>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3.5 border-t border-slate-800/80">
          <button
            onClick={() => setActiveTab('facturas')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'facturas'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 border border-slate-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Facturas ARCA a Cobrar / Bajar ({enrichedInvoices.length})
          </button>
          <button
            onClick={() => setActiveTab('alquileres')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'alquileres'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 border border-slate-700'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Estado de Facturación y Pago por Alquiler ({enrichedRentals.length})
          </button>
          <button
            onClick={() => setActiveTab('recibos')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'recibos'
                ? 'bg-cyan-400 text-slate-950 shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 border border-slate-700'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Recibos de Cobranza Emitidos ({receipts.length})
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-slate-900/90 border border-rose-500/30 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>PENDIENTE DE COBRO (FACTURADO)</span>
            <Clock className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 mt-1 font-mono">
            {formatMoney(kpis.totalFacturadoPendiente, 'ARS')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            <strong className="text-white">{kpis.cantFacturasPendientes}</strong> factura(s) pendientes de bajar
          </div>
        </div>

        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>TOTAL COBRADO / BAJADO</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1 font-mono">
            {formatMoney(kpis.totalFacturadoCobrado, 'ARS')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            <strong className="text-white">{kpis.cantFacturasPagadas}</strong> factura(s) pagadas •{' '}
            <strong className="text-emerald-300">{receipts.length}</strong> recibos
          </div>
        </div>

        <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>ALQUILERES PENDIENTES DE PAGO</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1 font-mono">
            {kpis.alquileresPendientesPago}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Contratos activos o finalizados aún no cobrados
          </div>
        </div>

        <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>ALQUILERES SIN FACTURAR</span>
            <FileText className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-400 mt-1 font-mono">
            {kpis.alquileresSinFacturar}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Contratos sin factura ARCA vinculada todavía
          </div>
        </div>
      </div>

      {/* Banner de Agenda y Alertas de Cheques / E-Cheq en Cartera */}
      {(() => {
        const plus7 = addDaysIso(new Date().toISOString().split('T')[0], 7);
        const enCartera = chequesCartera.filter(c => c.estado === 'EN_CARTERA');
        const proximos = enCartera.filter(c => (c.fechaCobro || '') <= plus7);
        const clearing = chequesCartera.filter(c => c.estado === 'DEPOSITADO');
        const rechazados = chequesCartera.filter(c => c.estado === 'RECHAZADO');
        if (enCartera.length === 0 && clearing.length === 0 && rechazados.length === 0) {
          return null;
        }
        const totalCartera = enCartera.reduce((s, c) => s + Number(c.importe || 0), 0);
        const totalProximos = proximos.reduce((s, c) => s + Number(c.importe || 0), 0);
        return (
          <div className="bg-[#16191F] border border-amber-500/35 rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 text-xs">
                <div className="font-black text-white flex flex-wrap items-center gap-2">
                  <span>Agenda de Cheques & E-Cheq</span>
                  {proximos.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[10px]">
                      {proximos.length} vencen / listos (7d): {formatMoney(totalProximos)}
                    </span>
                  )}
                  {clearing.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 font-mono text-[10px]">
                      {clearing.length} en clearing
                    </span>
                  )}
                  {rechazados.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono text-[10px]">
                      {rechazados.length} rechazado(s)
                    </span>
                  )}
                </div>
                <p className="text-slate-400">
                  Tenés <strong className="text-amber-300 font-mono">{enCartera.length}</strong> cheque(s) en cartera por{' '}
                  <strong className="text-white font-mono">{formatMoney(totalCartera)}</strong> pendientes de depósito, acreditación o endoso.
                </p>
              </div>
            </div>
            {onNavigateToCarteraCheques && (
              <button
                type="button"
                onClick={onNavigateToCarteraCheques}
                className="px-3.5 py-2 rounded-xl bg-[#F0C800] hover:bg-[#F5D63D] text-black text-xs font-black transition cursor-pointer whitespace-nowrap shrink-0"
              >
                Abrir Cartera de Cheques
              </button>
            )}
          </div>
        );
      })()}

      {/* Search, Module Scope & Status Filter Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            {([
              { id: 'VENTAS_SALON' as const, label: 'Solo Ventas', count: scopeCounts.ventas },
              { id: 'ALQUILERES' as const, label: 'Solo Alquileres', count: scopeCounts.alquileres },
              { id: 'ALL' as const, label: 'Ver Todo', count: scopeCounts.total },
            ]).map(opt => {
              const active = moduleScopeFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setModuleScopeFilter(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-[#F0C800] text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className={`text-[10px] font-mono tabular-nums ${active ? 'text-slate-900/80' : 'text-slate-500'}`}>
                    ({opt.count})
                  </span>
                </button>
              );
            })}
          </div>
          <span className="text-[11px] text-slate-400">
            {moduleScopeFilter === 'ALL'
              ? 'Mostrando cobranzas y recibos de Ventas y Alquileres en conjunto'
              : moduleScopeFilter === 'VENTAS_SALON'
                ? 'Filtrado por módulo Ventas (Salón) · Tocá "Ver Todo" para ver también Alquileres'
                : 'Filtrado por módulo Alquileres · Tocá "Ver Todo" para ver también Ventas'}
          </span>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por cliente, CUIT, Nº de factura (0007-...), Nº de contrato (ALQ-...) o Nº de parte diario..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {activeTab !== 'recibos' && (
            <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
              {(
                [
                  { id: 'ALL', label: 'Todos' },
                  { id: 'PENDIENTE_PAGO', label: 'Pendientes de Pago' },
                  { id: 'COBRADO_PARCIAL', label: 'Pago Parcial' },
                  { id: 'PAGADO', label: 'Pagados / Bajados' },
                ] as const
              ).map(st => (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    statusFilter === st.id
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-950 text-slate-400 hover:text-white border-slate-800'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: FACTURAS ARCA A BAJAR / COBRAR */}
      {activeTab === 'facturas' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-bold border-b border-slate-800">
                  <th className="py-3 px-3 w-9 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredInvoices.length > 0 &&
                        filteredInvoices.every(f => selectedInvoiceIds.includes(f.inv.id))
                      }
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedInvoiceIds(filteredInvoices.map(f => f.inv.id));
                        } else {
                          setSelectedInvoiceIds([]);
                        }
                      }}
                      className="rounded accent-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3">FACTURA ARCA</th>
                  <th className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() =>
                        setInvoiceDateSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'))
                      }
                      className="inline-flex items-center gap-1 hover:text-emerald-300 transition cursor-pointer uppercase"
                      title="Cambiar orden por fecha de factura"
                    >
                      <span>FECHA</span>
                      <span className="text-emerald-400 font-black">
                        {invoiceDateSortDir === 'desc' ? '↓' : '↑'}
                      </span>
                    </button>
                  </th>
                  <th className="py-3 px-3">CLIENTE / CUIT</th>
                  <th className="py-3 px-3">CONTRATO ALQUILER & PARTES VINCULADOS</th>
                  <th className="py-3 px-3 text-right">TOTAL FACTURA</th>
                  <th className="py-3 px-3 text-right">SALDO PENDIENTE</th>
                  <th className="py-3 px-3 text-center">ESTADO DE COBRO</th>
                  <th className="py-3 px-4 text-right">BAJAR / ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      No se encontraron facturas con este filtro.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map(({ inv, linkedRentals, linkedPartes, estadoCobro, montoCobrado, saldoPendiente, invReceipts, isFullyAnnulledByNC }) => {
                    const num = formatInvoiceNumber(inv);
                    const isChecked = selectedInvoiceIds.includes(inv.id);
                    const isExternal = isExternalMigratedInvoice(inv);
                    const latestReceipt = invReceipts[0] || null;
                    const totalPhotos = invReceipts.reduce((acc, r) => acc + (r.adjuntos?.length || 0), 0);
                    return (
                      <tr
                        key={inv.id}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isExternal
                            ? 'bg-orange-950/20 border-l-4 border-l-orange-500'
                            : isFullyAnnulledByNC
                              ? 'bg-purple-950/10 opacity-85'
                              : estadoCobro === 'PAGADO'
                                ? 'bg-emerald-950/10'
                                : ''
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isFullyAnnulledByNC || estadoCobro === 'PAGADO'}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedInvoiceIds(prev => [...prev, inv.id]);
                              } else {
                                setSelectedInvoiceIds(prev => prev.filter(id => id !== inv.id));
                              }
                            }}
                            className="rounded accent-emerald-500 cursor-pointer disabled:opacity-35"
                          />
                        </td>

                        <td className="py-3 px-3 font-mono">
                          <div className="flex flex-wrap items-center gap-1.5 font-bold text-white">
                            <span className={`px-2 py-0.5 rounded text-[10px] border ${
                              isExternal
                                ? 'bg-orange-500/25 text-orange-200 border-orange-400/60'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            }`}>
                              {inv.tipoComprobante.replace('FACTURA_', 'FACT ')}
                            </span>
                            <span>{num}</span>
                            {isExternal && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-black bg-orange-500/25 text-orange-200 border border-orange-400/60">
                                ⚠️ OTRO SISTEMA
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>{isExternal ? `No emitida aquí • ${inv.sistemaOrigenNombre || 'Sistema Anterior'}` : `CAE: ${inv.cae}`}</span>
                            {moduleScopeFilter === 'ALL' && (
                              <span className={`font-sans font-semibold ${
                                resolveInvoiceModule(inv) === 'VENTAS_SALON' ? 'text-amber-300' : 'text-sky-400'
                              }`}>
                                • {resolveInvoiceModule(inv) === 'VENTAS_SALON' ? 'Ventas' : 'Alquileres'}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                          {inv.fecha}
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-bold text-white">{inv.razonSocialReceptor}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {inv.tipoDocReceptor}: {inv.nroDocReceptor}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {linkedRentals.length > 0 ? (
                              linkedRentals.map(r => (
                                <span
                                  key={r.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                >
                                  <Link2 className="w-3 h-3" />
                                  {r.numeroContrato} ({r.equipoModelo})
                                </span>
                              ))
                            ) : inv.remitoPedido ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                                Ref: {inv.remitoPedido}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500">Sin contrato vinculado</span>
                            )}

                            {linkedPartes.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setInspectLinksModal({
                                    title: `Vínculos de ${formatInvoiceLabel(inv)}`,
                                    subtitle: inv.razonSocialReceptor,
                                    rentals: linkedRentals,
                                    invoices: [inv],
                                    partes: linkedPartes,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 cursor-pointer"
                              >
                                <ClipboardList className="w-3 h-3" />
                                {linkedPartes.length} Parte(s) Diario(s)
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-white whitespace-nowrap">
                          {formatMoney(inv.importeTotal, inv.moneda)}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                          {isFullyAnnulledByNC ? (
                            <span className="text-purple-300">$ 0</span>
                          ) : estadoCobro === 'PAGADO' ? (
                            <span className="text-emerald-400">$ 0</span>
                          ) : (
                            <span className="text-rose-400">
                              {formatMoney(saldoPendiente, inv.moneda)}
                            </span>
                          )}
                          {montoCobrado > 0 && estadoCobro !== 'PAGADO' && !isFullyAnnulledByNC && (
                            <div className="text-[10px] text-emerald-400">
                              Cobrado: {formatMoney(montoCobrado, inv.moneda)}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {isFullyAnnulledByNC ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">
                              ✓ ANULADA (NC)
                            </span>
                          ) : estadoCobro === 'PAGADO' ? (
                            <div className="flex flex-col items-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                PAGADO
                              </span>
                              {latestReceipt ? (
                                <button
                                  type="button"
                                  onClick={() => openReceiptsViewer(invReceipts)}
                                  className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-bold cursor-pointer transition"
                                  title="Click para ver el recibo de cobranza y comprobantes"
                                >
                                  <Receipt className="w-3 h-3" />
                                  <span>
                                    {latestReceipt.fecha} • Rec {latestReceipt.numeroRecibo}
                                    {invReceipts.length > 1 ? ` (+${invReceipts.length - 1})` : ''}
                                  </span>
                                  {totalPhotos > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-emerald-300 ml-0.5">
                                      <Camera className="w-3 h-3" />
                                      {totalPhotos}
                                    </span>
                                  )}
                                </button>
                              ) : inv.fechaCobro ? (
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  {inv.fechaCobro} {inv.reciboCobroNumero ? `• Rec ${inv.reciboCobroNumero}` : ''}
                                </div>
                              ) : null}
                            </div>
                          ) : estadoCobro === 'COBRADO_PARCIAL' ? (
                            <div className="flex flex-col items-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                <Clock className="w-3.5 h-3.5" />
                                PAGO PARCIAL
                              </span>
                              {latestReceipt && (
                                <button
                                  type="button"
                                  onClick={() => openReceiptsViewer(invReceipts)}
                                  className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-bold cursor-pointer transition"
                                  title="Click para ver el recibo parcial"
                                >
                                  <Receipt className="w-3 h-3" />
                                  <span>
                                    {invReceipts.length} Recibo{invReceipts.length > 1 ? 's' : ''}
                                  </span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              <AlertCircle className="w-3.5 h-3.5" />
                              PENDIENTE DE PAGO
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {invReceipts.length > 0 && (
                              <button
                                type="button"
                                onClick={() => openReceiptsViewer(invReceipts)}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/45 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer"
                                title="Ver e imprimir recibo(s) de pago y comprobantes adjuntos"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                {invReceipts.length > 1 ? `Ver Recibos (${invReceipts.length})` : 'Ver Recibo'}
                              </button>
                            )}
                            {isFullyAnnulledByNC ? (
                              <span className="text-[11px] font-mono text-purple-300/80 px-2">
                                Anulada por NC
                              </span>
                            ) : estadoCobro !== 'PAGADO' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openPaymentModalForInvoices([inv])}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition flex items-center gap-1 shadow-md cursor-pointer"
                                  title="Registrar Cobranza / Emitir Recibo y Bajar Factura"
                                >
                                  <ArrowDownCircle className="w-3.5 h-3.5" />
                                  Bajar Factura
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickToggleInvoiceStatus(inv)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold text-[11px] transition cursor-pointer"
                                  title="Marcar como PAGADO en 1 clic"
                                >
                                  ✓ Pagado
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleQuickToggleInvoiceStatus(inv)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer"
                                title="Reabrir como Pendiente de Pago"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Reabrir Pendiente
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ESTADO DE FACTURACIÓN Y PAGO POR CONTRATO DE ALQUILER */}
      {activeTab === 'alquileres' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-bold border-b border-slate-800">
                  <th className="py-3 px-4">CONTRATO</th>
                  <th className="py-3 px-3">CLIENTE & OBRA</th>
                  <th className="py-3 px-3">EQUIPO</th>
                  <th className="py-3 px-3">PARTES DIARIOS VINCULADOS</th>
                  <th className="py-3 px-3 text-center">ESTADO FACTURACIÓN</th>
                  <th className="py-3 px-3 text-right">MONTO ALQUILER</th>
                  <th className="py-3 px-3 text-center">ESTADO DE PAGO</th>
                  <th className="py-3 px-4 text-right">ACCIONES DE COBRO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredRentals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No hay contratos de alquiler para este filtro.
                    </td>
                  </tr>
                ) : (
                  filteredRentals.map(
                    ({
                      rental,
                      linkedPartes,
                      linkedInvoices,
                      linkedReceipts,
                      facturaNumero,
                      estadoFacturacion,
                      estadoCobro,
                      totalHorasPartes,
                      totalViajesPartes,
                    }) => (
                      <tr key={rental.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono">
                          <div className="font-black text-amber-400 text-sm">{rental.numeroContrato}</div>
                          <div className="text-[10px] text-slate-400">{rental.fechaInicio}</div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-bold text-white">{rental.clienteNombre}</div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[220px]">
                            {rental.direccionObra}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-200">{rental.equipoModelo}</div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {rental.duracion} {rental.modalidad === 'DIAS' ? 'Día(s)' : 'Hora(s)'}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          {linkedPartes.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setInspectLinksModal({
                                  title: `Vínculos del Contrato ${rental.numeroContrato}`,
                                  subtitle: `${rental.clienteNombre} • ${rental.equipoModelo}`,
                                  rentals: [rental],
                                  invoices: linkedInvoices,
                                  partes: linkedPartes,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 cursor-pointer"
                            >
                              <ClipboardList className="w-3.5 h-3.5" />
                              {linkedPartes.length} Parte(s) • {totalHorasPartes.toFixed(1)} hs
                              {totalViajesPartes > 0 ? ` • ${totalViajesPartes} vjs` : ''}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500">Sin partes vinculados</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center">
                          {estadoFacturacion === 'FACTURADO' ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${
                                linkedInvoices.some(i => isExternalMigratedInvoice(i))
                                  ? 'bg-orange-500/20 text-orange-200 border-orange-400/50'
                                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              }`}>
                                <FileText className="w-3.5 h-3.5" />
                                FACTURA {facturaNumero || 'EMITIDA'}
                              </span>
                              {linkedInvoices.some(i => isExternalMigratedInvoice(i)) && (
                                <span className="text-[9px] font-black text-orange-300 uppercase">
                                  ⚠️ OTRO SISTEMA
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              SIN FACTURAR
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-white whitespace-nowrap">
                          {formatMoney(rental.totalAlquiler, rental.moneda)}
                        </td>

                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {estadoCobro === 'PAGADO' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              PAGADO
                            </span>
                          ) : estadoCobro === 'COBRADO_PARCIAL' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              <Clock className="w-3.5 h-3.5" />
                              PAGO PARCIAL
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              <AlertCircle className="w-3.5 h-3.5" />
                              PENDIENTE DE PAGO
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {linkedReceipts.length > 0 && (
                              <button
                                type="button"
                                onClick={() => openReceiptsViewer(linkedReceipts)}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/45 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer"
                                title="Ver recibo(s) de cobro"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                {linkedReceipts.length > 1 ? `Recibos (${linkedReceipts.length})` : 'Ver Recibo'}
                              </button>
                            )}
                            {estadoCobro !== 'PAGADO' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openPaymentModalForRental(rental)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition flex items-center gap-1 cursor-pointer"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  Registrar Cobro
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickToggleRentalStatus(rental)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold text-[11px] transition cursor-pointer"
                                >
                                  ✓ Pagado
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleQuickToggleRentalStatus(rental)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Pasar a Pendiente
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: RECIBOS DE COBRANZA EMITIDOS */}
      {activeTab === 'recibos' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-bold border-b border-slate-800">
                  <th className="py-3 px-4">RECIBO Nº</th>
                  <th className="py-3 px-3">FECHA</th>
                  <th className="py-3 px-3">CLIENTE</th>
                  <th className="py-3 px-3">FACTURAS BAJADAS & ALQUILERES</th>
                  <th className="py-3 px-3">MEDIO DE PAGO / REF.</th>
                  <th className="py-3 px-3 text-right">MONTO COBRADO</th>
                  <th className="py-3 px-3 text-right">TOTAL IMPUTADO</th>
                  <th className="py-3 px-4 text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      {receipts.length === 0 ? (
                        <>
                          Todavía no hay recibos de cobranza emitidos. Usá el botón{' '}
                          <strong>"Bajar Factura"</strong> para registrar un pago.
                        </>
                      ) : (
                        'No se encontraron recibos de cobranza con esa búsqueda.'
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredReceipts.map(rec => (
                    <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-black text-cyan-400">
                        REC #{rec.numeroRecibo}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">{rec.fecha}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">{rec.clienteNombre}</div>
                        {rec.clienteCuit && (
                          <div className="text-[10px] font-mono text-slate-400">CUIT: {rec.clienteCuit}</div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {rec.facturasNumeros.map(fn => (
                            <span
                              key={fn}
                              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            >
                              Fact. {fn}
                            </span>
                          ))}
                          {(rec.rentalsNumeros || []).map(rn => (
                            <span
                              key={rn}
                              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            >
                              {rn}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-200">{rec.formaPago.replace(/_/g, ' ')}</div>
                        {(rec.cuentaDestinoNombre || rec.cuentaDestinoCodigo) && (
                          <div className="mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-bold">
                            <Landmark className="w-3 h-3 shrink-0" />
                            <span className="font-mono">{rec.cuentaDestinoCodigo}</span>
                            <span className="truncate max-w-[180px]">{rec.cuentaDestinoNombre}</span>
                          </div>
                        )}
                        {rec.bancoReferencia && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{rec.bancoReferencia}</div>
                        )}
                        {rec.chequesResumen && rec.chequesResumen.length > 0 && (
                          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            <Banknote className="w-3 h-3" />
                            {rec.chequesResumen.length} {rec.chequesResumen.length === 1 ? 'cheque cargado' : 'cheques cargados'}
                          </div>
                        )}
                        {rec.adjuntos && rec.adjuntos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => openReceiptsViewer([rec])}
                            className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold hover:bg-emerald-500/25 cursor-pointer"
                          >
                            <Camera className="w-3 h-3" />
                            {rec.adjuntos.length} foto{rec.adjuntos.length > 1 ? 's' : ''} adjunta{rec.adjuntos.length > 1 ? 's' : ''}
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                        {formatMoney(rec.montoCobrado, rec.moneda)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-white">
                        {formatMoney(rec.totalImputado, rec.moneda)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openReceiptsViewer([rec])}
                          className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Ver / Imprimir Recibo
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: BAJAR FACTURA / REGISTRAR COBRANZA */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#14171F] border border-emerald-500/40 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <ArrowDownCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Bajar Factura / Registrar Recibo de Cobranza
                  </h3>
                  <p className="text-xs text-slate-400">
                    Actualiza automáticamente la Factura ARCA, el Contrato de Alquiler y los Partes Diarios vinculados.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {/* Selector si quiere cambiar o agregar factura */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Comprobantes a Bajar / Imputar:
                </div>
                {targetInvoices.length > 0 ? (
                  <div className="space-y-1.5">
                    {targetInvoices.map(inv => {
                      const links = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
                      return (
                        <div
                          key={inv.id}
                          className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs"
                        >
                          <div>
                            <span className="font-mono font-bold text-white">
                              {formatInvoiceLabel(inv)}
                            </span>
                            <span className="text-slate-400 ml-2">{inv.razonSocialReceptor}</span>
                            {links.linkedRentals.map(r => (
                              <span
                                key={r.id}
                                className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold"
                              >
                                {r.numeroContrato}
                              </span>
                            ))}
                            {links.linkedPartes.length > 0 && (
                              <span className="ml-1.5 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold">
                                {links.linkedPartes.length} Parte(s)
                              </span>
                            )}
                          </div>
                          <div className="font-mono font-black text-emerald-400">
                            Total: {formatMoney(inv.importeTotal, inv.moneda)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : targetRentalOnly ? (
                  <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-amber-500/30 text-xs">
                    <div>
                      <span className="font-mono font-bold text-amber-400">
                        Contrato {targetRentalOnly.numeroContrato}
                      </span>
                      <span className="text-white ml-2 font-bold">{targetRentalOnly.clienteNombre}</span>
                      <span className="text-slate-400 ml-2">({targetRentalOnly.equipoModelo})</span>
                    </div>
                    <div className="font-mono font-black text-emerald-400">
                      {formatMoney(targetRentalOnly.totalAlquiler, targetRentalOnly.moneda)}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Fecha de Cobro *
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Medio de Cobro *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={e => applyPaymentMethodDefaults(e.target.value as CustomerPaymentMethod)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-bold"
                  >
                    <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                    <option value="CHEQUE_ECHEQ">Cheque / E-Cheq</option>
                    <option value="EFECTIVO_CAJA">Efectivo en Caja</option>
                    <option value="TARJETA">Tarjeta Débito / Crédito</option>
                    <option value="RETENCIONES">Certificado de Retenciones</option>
                    <option value="COMPENSACION_CANJE">Compensación / Canje</option>
                    <option value="MIXTO">Mixto (Transferencia + Retenciones)</option>
                  </select>
                </div>
              </div>

              {/* Cuenta Destino del Plan de Cuentas (Bancos / Caja / Valores) */}
              <div className="bg-sky-950/25 border border-sky-500/35 rounded-xl p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-sky-300 uppercase flex items-center gap-1.5">
                    <Landmark className="w-4 h-4 text-sky-400" />
                    Cuenta Destino (Plan de Cuentas) *
                  </label>
                  {onNavigateToPlanCuentas && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsPaymentModalOpen(false);
                        onNavigateToPlanCuentas();
                      }}
                      className="text-[11px] font-bold text-sky-300 hover:text-sky-200 underline underline-offset-2 cursor-pointer"
                    >
                      Configurar / agregar bancos
                    </button>
                  )}
                </div>
                <select
                  value={selectedCuentaDestino?.id || ''}
                  onChange={e => handleCuentaDestinoChange(e.target.value)}
                  className="w-full bg-slate-950 border border-sky-500/40 rounded-xl px-3.5 py-2 text-sm text-white font-bold"
                >
                  {groupedDestinationAccounts.bancos.length > 0 && (
                    <optgroup label="Bancos (Transferencias / Depósitos)">
                      {groupedDestinationAccounts.bancos.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.codigo} — {acc.nombre}
                          {acc.cbuAlias ? ` (${acc.cbuAlias})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {groupedDestinationAccounts.cajas.length > 0 && (
                    <optgroup label="Caja Efectivo">
                      {groupedDestinationAccounts.cajas.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.codigo} — {acc.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {groupedDestinationAccounts.valoresBilleteras.length > 0 && (
                    <optgroup label="Cheques, E-Cheq y Billeteras / Tarjetas">
                      {groupedDestinationAccounts.valoresBilleteras.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.codigo} — {acc.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {groupedDestinationAccounts.otras.length > 0 && (
                    <optgroup label="Retenciones / Compensación / Otras">
                      {groupedDestinationAccounts.otras.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.codigo} — {acc.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-[11px] text-slate-400">
                  Se elige automáticamente según el <strong>Medio de Cobro</strong> (ej: Transferencia → Banco, Efectivo → Caja, Cheque → Valores a Depositar). Podés cambiar el banco o cuenta si corresponde.
                </p>
              </div>

              {/* Carga 1 a 1 de Cheques / E-Cheq en el mismo recibo */}
              {paymentMethod === 'CHEQUE_ECHEQ' && (
                <div className="bg-amber-950/20 border border-amber-500/35 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-black uppercase text-amber-300 flex items-center gap-1.5">
                        <Banknote className="w-4 h-4 text-amber-400" />
                        Cheques Recibidos en este Recibo ({draftCheques.length})
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Cargá cada cheque individualmente con su fecha de cobro/vencimiento. Ingresan automático a <strong>Cartera de Cheques</strong>.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const restante = Math.max(
                          0,
                          Number(
                            (
                              totalRequeridoModal -
                              draftCheques.reduce((s, d) => s + Number(d.importe || 0), 0)
                            ).toFixed(2)
                          )
                        );
                        syncDraftChequesTotals([
                          ...draftCheques,
                          createDraftChequeLine({
                            importe: restante,
                            fechaCobro: addDaysIso(
                              draftCheques[draftCheques.length - 1]?.fechaCobro || paymentDate,
                              30
                            ),
                            bancoEmisor: draftCheques[draftCheques.length - 1]?.bancoEmisor || '',
                          }),
                        ]);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#F0C800] hover:bg-[#F5D63D] text-black text-xs font-black flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      Agregar Cheque
                    </button>
                  </div>

                  {chequeFormError && (
                    <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs font-semibold text-rose-300">
                      {chequeFormError}
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {draftCheques.map((ch, idx) => (
                      <div
                        key={ch.tempId}
                        className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                          <span className="text-[11px] font-mono font-bold text-amber-300">
                            Cheque #{idx + 1}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const cloned = createDraftChequeLine({
                                  tipo: ch.tipo,
                                  bancoEmisor: ch.bancoEmisor,
                                  fechaEmision: ch.fechaEmision,
                                  fechaCobro: addDaysIso(ch.fechaCobro || paymentDate, 30),
                                  libradorNombre: ch.libradorNombre,
                                  cuitLibrador: ch.cuitLibrador,
                                  importe: ch.importe,
                                });
                                syncDraftChequesTotals([...draftCheques, cloned]);
                              }}
                              title="Duplicar cheque con vencimiento +30 días"
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Copy className="w-3 h-3 text-amber-400" />
                              Duplicar (+30d)
                            </button>
                            {draftCheques.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  syncDraftChequesTotals(
                                    draftCheques.filter(item => item.tempId !== ch.tempId)
                                  )
                                }
                                title="Quitar cheque"
                                className="p-1 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                              Tipo
                            </label>
                            <select
                              value={ch.tipo}
                              onChange={e =>
                                syncDraftChequesTotals(
                                  draftCheques.map(it =>
                                    it.tempId === ch.tempId
                                      ? { ...it, tipo: e.target.value as ChequeTipo }
                                      : it
                                  )
                                )
                              }
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-bold"
                            >
                              <option value="FISICO">Cheque Físico</option>
                              <option value="ECHEQ">E-Cheq</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                              N° Cheque *
                            </label>
                            <input
                              type="text"
                              value={ch.numeroCheque}
                              onChange={e =>
                                syncDraftChequesTotals(
                                  draftCheques.map(it =>
                                    it.tempId === ch.tempId
                                      ? { ...it, numeroCheque: e.target.value }
                                      : it
                                  )
                                )
                              }
                              placeholder="Ej: 48291033"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                              Banco Emisor *
                            </label>
                            <input
                              type="text"
                              value={ch.bancoEmisor}
                              onChange={e =>
                                syncDraftChequesTotals(
                                  draftCheques.map(it =>
                                    it.tempId === ch.tempId
                                      ? { ...it, bancoEmisor: e.target.value }
                                      : it
                                  )
                                )
                              }
                              placeholder="Ej: Banco Macro"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-400 uppercase mb-0.5">
                              Importe ($) *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={ch.importe || ''}
                              onChange={e =>
                                syncDraftChequesTotals(
                                  draftCheques.map(it =>
                                    it.tempId === ch.tempId
                                      ? { ...it, importe: parseFloat(e.target.value) || 0 }
                                      : it
                                  )
                                )
                              }
                              placeholder="0.00"
                              className="w-full bg-slate-900 border border-emerald-500/40 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-emerald-300"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                              Fecha Emisión
                            </label>
                            <input
                              type="date"
                              value={ch.fechaEmision}
                              onChange={e =>
                                syncDraftChequesTotals(
                                  draftCheques.map(it =>
                                    it.tempId === ch.tempId
                                      ? { ...it, fechaEmision: e.target.value }
                                      : it
                                  )
                                )
                              }
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-amber-300 uppercase mb-0.5">
                              Fecha Cobro / Vto *
                            </label>
                            <input
                              type="date"
                              value={ch.fechaCobro}
                              onChange={e =>
                                syncDraftChequesTotals(
                                  draftCheques.map(it =>
                                    it.tempId === ch.tempId
                                      ? { ...it, fechaCobro: e.target.value }
                                      : it
                                  )
                                )
                              }
                              className="w-full bg-slate-900 border border-amber-500/40 rounded-lg px-2 py-1.5 text-xs font-mono text-amber-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                              Librador
                            </label>
                            <input
                              type="text"
                              value={ch.libradorNombre}
                              onChange={e =>
                                syncDraftChequesTotals(
                                  draftCheques.map(it =>
                                    it.tempId === ch.tempId
                                      ? { ...it, libradorNombre: e.target.value }
                                      : it
                                  )
                                )
                              }
                              placeholder="Titular / Empresa"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                              CUIT Librador
                            </label>
                            <input
                              type="text"
                              value={ch.cuitLibrador}
                              onChange={e =>
                                syncDraftChequesTotals(
                                  draftCheques.map(it =>
                                    it.tempId === ch.tempId
                                      ? { ...it, cuitLibrador: e.target.value }
                                      : it
                                  )
                                )
                              }
                              placeholder="Opcional"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Importes y Retenciones */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-emerald-400 uppercase mb-1">
                      Monto Neto Recibido (Banco / Caja / Valores) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      readOnly={paymentMethod === 'CHEQUE_ECHEQ'}
                      value={montoCobradoInput}
                      onChange={e => setMontoCobradoInput( parseFloat(e.target.value) || 0 )}
                      className="w-full bg-slate-900 border border-emerald-500/50 rounded-xl px-3.5 py-2 text-base font-mono font-black text-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                      Banco / Nº Comprobante / Referencia
                    </label>
                    <input
                      type="text"
                      value={bancoReferencia}
                      onChange={e => setBancoReferencia(e.target.value)}
                      placeholder="Ej: Banco Macro Transf #884120"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      Retención IIBB
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={retencionesIibb || ''}
                      onChange={e => setRetencionesIibb(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      Ret. Ganancias
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={retencionesGanancias || ''}
                      onChange={e => setRetencionesGanancias(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      Ret. SUSS / IVA
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={retencionesSussIva || ''}
                      onChange={e => setRetencionesSussIva(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      Dto. / Redondeo
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={descuentoProntoPago || ''}
                      onChange={e => setDescuentoProntoPago(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Resumen de Cálculo Dinámico de Saldo & Estado Automático */}
              <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between font-mono">
                  <span className="text-slate-400">Total Requerido:</span>
                  <span className="text-white font-bold">{formatMoney(totalRequeridoModal, targetInvoices[0]?.moneda || targetRentalOnly?.moneda || 'ARS')}</span>
                </div>
                <div className="flex items-center justify-between font-mono">
                  <span className="text-slate-400">Total Imputado (Neto + Retenciones):</span>
                  <span className="text-emerald-400 font-bold">{formatMoney(totalImputadoModal, targetInvoices[0]?.moneda || targetRentalOnly?.moneda || 'ARS')}</span>
                </div>
                <div className="flex items-center justify-between font-mono pt-1 border-t border-slate-800">
                  <span className="text-slate-300 font-bold">Saldo Pendiente a Recibir:</span>
                  <span className={saldoPendienteModal <= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                    {saldoPendienteModal <= 0 ? '¡Saldado 100%!' : formatMoney(saldoPendienteModal, targetInvoices[0]?.moneda || targetRentalOnly?.moneda || 'ARS')}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-400">Estado Resultante Automático:</span>
                  {totalImputadoModal >= totalRequeridoModal || ajustarCentavos ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-black text-[10px] border border-emerald-500/40">
                      ✓ PAGADO (Saldado)
                    </span>
                  ) : totalImputadoModal > 0 ? (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black text-[10px] border border-amber-500/40">
                      ⚡ PAGO PARCIAL
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-black text-[10px] border border-rose-500/40">
                      PENDIENTE DE PAGO
                    </span>
                  )}
                </div>

                {esCentavosSueltos && !ajustarCentavos && (
                  <div className="pt-2 border-t border-slate-800">
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 cursor-pointer text-amber-300 text-[11px] font-bold">
                      <input
                        type="checkbox"
                        checked={ajustarCentavos}
                        onChange={e => setAjustarCentavos(e.target.checked)}
                        className="accent-amber-400 w-4 h-4"
                      />
                      <span>
                        Ajustar diferencia menor por centavos (${saldoPendienteModal.toFixed(2)}) y cerrar factura como PAGADO
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Vista previa de Imputación Contable Automática */}
              {selectedCuentaDestino && totalImputadoModal > 0 && (
                <div className="bg-slate-950/90 border border-sky-500/25 rounded-xl p-3 space-y-1.5 text-[11px]">
                  <div className="text-[10px] font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5" />
                    Imputación Contable Automática (Plan de Cuentas)
                  </div>
                  <div className="space-y-1 font-mono">
                    {Number(montoCobradoInput || 0) > 0 && (
                      <div className="flex items-center justify-between gap-2 text-emerald-300">
                        <span className="truncate">
                          + Entra a <strong>{selectedCuentaDestino.codigo}</strong> {selectedCuentaDestino.nombre}
                        </span>
                        <span className="font-bold shrink-0">
                          {formatMoney(montoCobradoInput, targetInvoices[0]?.moneda || targetRentalOnly?.moneda || 'ARS')}
                        </span>
                      </div>
                    )}
                    {Number(retencionesIibb || 0) + Number(retencionesGanancias || 0) + Number(retencionesSussIva || 0) > 0 && (
                      <div className="flex items-center justify-between gap-2 text-amber-300">
                        <span className="truncate">+ Registra <strong>1.2.02</strong> Retenciones Sufridas</span>
                        <span className="font-bold shrink-0">
                          {formatMoney(
                            Number(retencionesIibb || 0) +
                              Number(retencionesGanancias || 0) +
                              Number(retencionesSussIva || 0),
                            targetInvoices[0]?.moneda || targetRentalOnly?.moneda || 'ARS'
                          )}
                        </span>
                      </div>
                    )}
                    {Number(descuentoProntoPago || 0) > 0 && (
                      <div className="flex items-center justify-between gap-2 text-rose-300">
                        <span className="truncate">+ Imputa <strong>5.1.05</strong> Descuentos / Redondeo</span>
                        <span className="font-bold shrink-0">
                          {formatMoney(descuentoProntoPago, targetInvoices[0]?.moneda || targetRentalOnly?.moneda || 'ARS')}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 text-slate-400 pt-1 border-t border-slate-800/80">
                      <span className="truncate">− Cancela deuda en <strong>1.2.01</strong> Clientes / Deudores por Ventas</span>
                      <span className="font-bold shrink-0">
                        {formatMoney(totalImputadoModal, targetInvoices[0]?.moneda || targetRentalOnly?.moneda || 'ARS')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Opciones de Impacto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-slate-800 cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Marcar Factura y Alquiler como PAGADO (100%)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Desmarcar si es un anticipo o pago parcial a cuenta
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={marcarCancelacionTotal}
                    onChange={e => setMarcarCancelacionTotal(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-slate-800 cursor-pointer">
                  <div className="pr-2">
                    <span className="text-xs font-bold text-white block">
                      Impactar Ingreso en Caja Diaria
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {selectedCuentaDestino?.tipoTesoreria === 'CAJA'
                        ? 'Suma automáticamente el efectivo en la planilla de Caja Diaria.'
                        : `Desactivado porque entra a ${selectedCuentaDestino?.nombre || 'Banco / otra cuenta'} (no es efectivo en caja).`}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={impactarCajaDiaria}
                    onChange={e => setImpactarCajaDiaria(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500 shrink-0"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                  Observaciones del Recibo
                </label>
                <input
                  type="text"
                  value={observacionesPago}
                  onChange={e => setObservacionesPago(e.target.value)}
                  placeholder="Opcional: detalle de liquidación, certificado de obra, etc."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white"
                />
              </div>

              {/* Fotos / Comprobantes de Pago (siempre optimizadas a WebP liviano) */}
              <div
                onPaste={handlePastePaymentPhoto}
                onDragOver={e => {
                  e.preventDefault();
                  setIsDraggingPhoto(true);
                }}
                onDragLeave={() => setIsDraggingPhoto(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDraggingPhoto(false);
                  if (e.dataTransfer.files?.length) {
                    handlePaymentFilesSelected(e.dataTransfer.files);
                  }
                }}
                className={`rounded-xl border p-3.5 space-y-3 transition ${
                  isDraggingPhoto
                    ? 'bg-emerald-500/10 border-emerald-400 border-dashed'
                    : 'bg-slate-950/80 border-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold text-emerald-300 uppercase flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-emerald-400" />
                      Fotos de Comprobantes (Transferencia, Cheque, Retención)
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Se comprimen automáticamente a <strong>WebP liviano</strong> (máx. 1280px) para que no pesen. Podés subir, arrastrar o pegar con <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px]">Ctrl+V</kbd>.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => {
                        handlePaymentFilesSelected(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      disabled={isUploadingPhotos}
                      onClick={() => photoInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingPhotos ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      Subir Fotos
                    </button>
                    <button
                      type="button"
                      disabled={isUploadingPhotos}
                      onClick={() => handlePastePaymentPhoto()}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Pegar captura de pantalla desde el portapapeles"
                    >
                      <Clipboard className="w-3.5 h-3.5 text-cyan-400" />
                      Pegar Captura
                    </button>
                  </div>
                </div>

                {photoUploadStatus && (
                  <div className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-emerald-300 flex items-center justify-between gap-2">
                    <span>{photoUploadStatus}</span>
                    <button
                      type="button"
                      onClick={() => setPhotoUploadStatus(null)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {paymentAttachments.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {paymentAttachments.map(att => (
                      <div
                        key={att.id}
                        className="group relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewPhoto({
                              url: att.url,
                              nombre: att.nombre,
                              info:
                                att.originalSizeKB && att.optimizedSizeKB
                                  ? `${att.originalSizeKB} KB → ${att.optimizedSizeKB} KB (-${att.reductionPercentage || 0}% WebP)`
                                  : undefined,
                            })
                          }
                          className="block w-full h-24 bg-slate-950 relative overflow-hidden cursor-pointer"
                        >
                          <img
                            src={att.url}
                            alt={att.nombre}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition flex items-center justify-center">
                            <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition" />
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPaymentAttachments(prev => prev.filter(p => p.id !== att.id))
                          }
                          title="Quitar foto"
                          className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/75 hover:bg-rose-600 text-white cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <div className="p-2 space-y-0.5">
                          <div className="text-[10px] font-bold text-slate-200 truncate" title={att.nombre}>
                            {att.nombre}
                          </div>
                          {att.optimizedSizeKB !== undefined && (
                            <div className="text-[9px] font-mono text-emerald-400">
                              {att.optimizedSizeKB} KB WebP
                              {att.reductionPercentage && att.reductionPercentage > 0
                                ? ` (-${att.reductionPercentage}%)`
                                : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploadingPhotos}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isUploadingPhotos ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Optimizando fotos...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      Confirmar Cobro y Bajar Factura
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INSPECCIONAR VÍNCULOS (CONTRATO + FACTURAS + PARTES DIARIOS) */}
      {inspectLinksModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#14171F] border border-cyan-500/40 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-cyan-400" />
                  {inspectLinksModal.title}
                </h3>
                <p className="text-xs text-slate-400">{inspectLinksModal.subtitle}</p>
              </div>
              <button
                onClick={() => setInspectLinksModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Contratos */}
              <div>
                <h4 className="text-xs font-bold uppercase text-amber-400 mb-2">
                  Contrato(s) de Alquiler Vinculados ({inspectLinksModal.rentals.length})
                </h4>
                {inspectLinksModal.rentals.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin contratos vinculados.</p>
                ) : (
                  <div className="space-y-1.5">
                    {inspectLinksModal.rentals.map(r => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-amber-400">{r.numeroContrato}</span>
                          <span className="text-white font-bold ml-2">{r.equipoModelo}</span>
                          <span className="text-slate-400 ml-2">• Obra: {r.direccionObra}</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-400">
                          {formatMoney(r.totalAlquiler, r.moneda)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Partes Diarios */}
              <div>
                <h4 className="text-xs font-bold uppercase text-cyan-400 mb-2">
                  Partes Diarios Vinculados ({inspectLinksModal.partes.length})
                </h4>
                {inspectLinksModal.partes.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin partes diarios vinculados.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase">
                        <tr>
                          <th className="py-2 px-3">Nº PARTE</th>
                          <th className="py-2 px-3">FECHA</th>
                          <th className="py-2 px-3">EQUIPO</th>
                          <th className="py-2 px-3">OPERARIO</th>
                          <th className="py-2 px-3">OBRA</th>
                          <th className="py-2 px-3 text-right">HS / VIAJES</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                        {inspectLinksModal.partes.map(p => (
                          <tr key={p.id}>
                            <td className="py-2 px-3 font-mono font-bold text-amber-300">#{p.numParte}</td>
                            <td className="py-2 px-3 font-mono text-slate-300">{p.fecha}</td>
                            <td className="py-2 px-3 text-white">{p.marcaModelo || p.codigoEquipo}</td>
                            <td className="py-2 px-3 text-slate-300">{p.nombreApellido}</td>
                            <td className="py-2 px-3 text-slate-300">{p.obra}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-cyan-300">
                              {p.tipo === 'VIAJES'
                                ? `${p.viajesCantidad || 1} viajes`
                                : `${Number(p.horasTrabajadas || p.hsCantidad || 0).toFixed(1)} hs`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IMPRIMIR / VER RECIBO DE COBRANZA */}
      {selectedReceiptForView && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:hidden shrink-0">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">
                  Recibo de Cobranza #{selectedReceiptForView.numeroRecibo}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir / Guardar PDF
                </button>
                <button
                  onClick={() => {
                    setSelectedReceiptForView(null);
                    setReceiptGroupForView([]);
                  }}
                  className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {receiptGroupForView.length > 1 && (
              <div className="bg-slate-100 border-b border-slate-300 px-6 py-2 flex flex-wrap items-center gap-1.5 print:hidden shrink-0">
                <span className="text-[11px] font-bold text-slate-600 uppercase mr-1">
                  Recibos imputados ({receiptGroupForView.length}):
                </span>
                {receiptGroupForView.map(rec => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => setSelectedReceiptForView(rec)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer transition border ${
                      selectedReceiptForView.id === rec.id
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    Rec #{rec.numeroRecibo} ({rec.fecha})
                  </button>
                ))}
              </div>
            )}

            <div className="p-8 space-y-6 text-slate-900 font-sans overflow-y-auto">
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                <div>
                  <div className="text-xl font-black tracking-tight">EL HORNOCAL S.R.L. • LA HORMIGA</div>
                  <div className="text-xs text-slate-600">Alte. Brown 1560 - San Salvador de Jujuy</div>
                  <div className="text-xs text-slate-600 font-mono">CUIT: 30-71499982-2 • IVA Responsable Inscripto</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black uppercase text-emerald-700">RECIBO DE COBRANZA</div>
                  <div className="text-sm font-mono font-bold">Nº {selectedReceiptForView.numeroRecibo}</div>
                  <div className="text-xs text-slate-600 font-mono">Fecha: {selectedReceiptForView.fecha}</div>
                </div>
              </div>

              <div className="bg-slate-100 p-4 rounded-xl text-xs space-y-1">
                <div>
                  <span className="font-bold uppercase text-slate-600">Recibimos de: </span>
                  <span className="font-black text-sm">{selectedReceiptForView.clienteNombre}</span>
                </div>
                {selectedReceiptForView.clienteCuit && (
                  <div>
                    <span className="font-bold uppercase text-slate-600">CUIT / Documento: </span>
                    <span className="font-mono">{selectedReceiptForView.clienteCuit}</span>
                  </div>
                )}
                <div>
                  <span className="font-bold uppercase text-slate-600">Facturas Canceladas / Imputadas: </span>
                  <span className="font-mono font-bold">
                    {selectedReceiptForView.facturasNumeros.join(', ') || 'Pago de Alquiler'}
                  </span>
                </div>
                {selectedReceiptForView.rentalsNumeros && selectedReceiptForView.rentalsNumeros.length > 0 && (
                  <div>
                    <span className="font-bold uppercase text-slate-600">Contrato(s) de Alquiler: </span>
                    <span className="font-mono font-bold">
                      {selectedReceiptForView.rentalsNumeros.join(', ')}
                    </span>
                  </div>
                )}
              </div>

              <div className="border border-slate-300 rounded-xl overflow-hidden text-xs">
                <div className="bg-slate-900 text-white px-4 py-2 font-bold uppercase flex justify-between">
                  <span>Detalle del Medio de Cobro</span>
                  <span>Importe</span>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex justify-between">
                    <div>
                      <div>
                        Pago Recibido ({selectedReceiptForView.formaPago.replace(/_/g, ' ')})
                        {selectedReceiptForView.bancoReferencia ? ` — ${selectedReceiptForView.bancoReferencia}` : ''}
                      </div>
                      {(selectedReceiptForView.cuentaDestinoCodigo || selectedReceiptForView.cuentaDestinoNombre) && (
                        <div className="text-[11px] text-slate-600 font-mono">
                          Cuenta Imputada: {selectedReceiptForView.cuentaDestinoCodigo} — {selectedReceiptForView.cuentaDestinoNombre}
                        </div>
                      )}
                    </div>
                    <span className="font-mono font-bold">
                      {formatMoney(selectedReceiptForView.montoCobrado, selectedReceiptForView.moneda)}
                    </span>
                  </div>
                  {(selectedReceiptForView.retencionesIibb || 0) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Retención Ingresos Brutos (IIBB)</span>
                      <span className="font-mono">
                        {formatMoney(selectedReceiptForView.retencionesIibb || 0, selectedReceiptForView.moneda)}
                      </span>
                    </div>
                  )}
                  {(selectedReceiptForView.retencionesGanancias || 0) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Retención Impuesto a las Ganancias</span>
                      <span className="font-mono">
                        {formatMoney(selectedReceiptForView.retencionesGanancias || 0, selectedReceiptForView.moneda)}
                      </span>
                    </div>
                  )}
                  {(selectedReceiptForView.retencionesSussIva || 0) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Retención SUSS / IVA</span>
                      <span className="font-mono">
                        {formatMoney(selectedReceiptForView.retencionesSussIva || 0, selectedReceiptForView.moneda)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-3 border-t border-slate-300 text-base font-black">
                    <span>TOTAL IMPUTADO / CANCELADO</span>
                    <span className="font-mono text-emerald-700">
                      {formatMoney(selectedReceiptForView.totalImputado, selectedReceiptForView.moneda)}
                    </span>
                  </div>
                </div>
              </div>

              {selectedReceiptForView.chequesResumen && selectedReceiptForView.chequesResumen.length > 0 && (
                <div className="border border-slate-300 rounded-xl overflow-hidden text-xs">
                  <div className="bg-slate-200 text-slate-800 px-4 py-2 font-bold uppercase flex items-center justify-between">
                    <span>Detalle de Cheques / E-Cheq Recibidos ({selectedReceiptForView.chequesResumen.length})</span>
                    {onNavigateToCarteraCheques && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReceiptForView(null);
                          onNavigateToCarteraCheques();
                        }}
                        className="print:hidden text-[11px] font-bold text-amber-800 underline cursor-pointer"
                      >
                        Ver en Cartera
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-slate-200 bg-white">
                    {selectedReceiptForView.chequesResumen.map(cr => {
                      const live = chequesCartera.find(c => c.id === cr.id);
                      const estado = live?.estado || 'EN_CARTERA';
                      return (
                        <div key={cr.id} className="px-4 py-2 flex items-center justify-between gap-2">
                          <div>
                            <span className="font-mono font-bold text-slate-900">
                              {cr.tipo === 'ECHEQ' ? 'E-Cheq' : 'Cheque'} #{cr.numeroCheque}
                            </span>
                            <span className="text-slate-600 ml-2">{cr.bancoEmisor}</span>
                            <span className="text-slate-500 font-mono ml-2">Vto: {cr.fechaCobro}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-700">
                              {estado.replace(/_/g, ' ')}
                            </span>
                            <span className="font-mono font-bold text-slate-900">
                              {formatMoney(cr.importe, selectedReceiptForView.moneda)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedReceiptForView.observaciones && (
                <div className="text-xs text-slate-600">
                  <strong>Observaciones:</strong> {selectedReceiptForView.observaciones}
                </div>
              )}

              {/* Galería de Fotos / Comprobantes Adjuntos del Recibo */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-black uppercase text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    Comprobantes / Fotos Adjuntas ({(selectedReceiptForView.adjuntos || []).length})
                  </div>
                  <div className="print:hidden">
                    <input
                      ref={receiptViewPhotoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => {
                        handleAttachPhotosToExistingReceipt(selectedReceiptForView, e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      disabled={isUploadingPhotos}
                      onClick={() => receiptViewPhotoInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingPhotos ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Camera className="w-3 h-3" />
                      )}
                      + Agregar Foto Optimizada
                    </button>
                  </div>
                </div>

                {(selectedReceiptForView.adjuntos || []).length === 0 ? (
                  <p className="text-[11px] text-slate-500 print:hidden">
                    Sin fotos adjuntas todavía. Podés agregar comprobantes de transferencia, cheque o retenciones (se optimizan automáticamente en WebP).
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {(selectedReceiptForView.adjuntos || []).map(att => (
                      <div
                        key={att.id}
                        className="group relative rounded-lg overflow-hidden border border-slate-300 bg-white"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewPhoto({
                              url: att.url,
                              nombre: att.nombre,
                              info:
                                att.originalSizeKB && att.optimizedSizeKB
                                  ? `${att.originalSizeKB} KB → ${att.optimizedSizeKB} KB (-${att.reductionPercentage || 0}% WebP)`
                                  : undefined,
                            })
                          }
                          className="block w-full h-28 bg-slate-100 overflow-hidden cursor-pointer"
                        >
                          <img
                            src={att.url}
                            alt={att.nombre}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextList = (selectedReceiptForView.adjuntos || []).filter(
                              a => a.id !== att.id
                            );
                            updateReceiptAttachmentsPersisted(selectedReceiptForView.id, nextList);
                          }}
                          title="Eliminar foto"
                          className="print:hidden absolute top-1.5 right-1.5 p-1 rounded bg-black/70 hover:bg-rose-600 text-white cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <div className="px-2 py-1 text-[10px] text-slate-600 truncate">
                          {att.nombre}
                          {att.optimizedSizeKB ? (
                            <span className="ml-1 font-mono text-emerald-700">({att.optimizedSizeKB}KB)</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-8 flex justify-between items-end text-xs text-slate-500 border-t border-slate-200">
                <div>Comprobante de cancelación emitido por Sistema La Hormiga ERP.</div>
                <div className="text-center w-48 border-t border-slate-400 pt-1">
                  Firma y Sello Administración
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX: PREVISUALIZACIÓN AMPLIADA DE FOTO DE COMPROBANTE */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="relative max-w-4xl max-h-[92vh] w-full flex flex-col items-center gap-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-2.5 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-white truncate">{previewPhoto.nombre}</div>
                {previewPhoto.info && (
                  <div className="text-[11px] font-mono text-emerald-400">{previewPhoto.info}</div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewPhoto.url}
                  download={previewPhoto.nombre}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <img
              src={previewPhoto.url}
              alt={previewPhoto.nombre}
              className="max-h-[80vh] max-w-full object-contain rounded-xl border border-slate-700 shadow-2xl bg-slate-950"
            />
          </div>
        </div>
      )}
    </div>
  );
};
