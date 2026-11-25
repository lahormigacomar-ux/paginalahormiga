import React, { useState, useMemo, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ArcaInvoice, ArcaConfig, ArcaTipoComprobante, ArcaCondicionIva, ArcaInvoiceItem, InvoiceDeliveryMode, InvoiceTemplateLayout, DEFAULT_INVOICE_TEMPLATE_LAYOUT, Quotation, RentalContract, Vehicle, Employee, Obra, ParteDiario, ClientRecord, CustomerPaymentReceipt, PreselectedResumenForArca, CommercialModuleScope, HardwareProduct } from '../types';
import { loadArcaConfig, saveArcaConfig, loadInvoiceTemplateLayout, saveInvoiceTemplateLayout, syncInvoiceTemplateLayoutFromCloud, exportArcaInvoicesToCSV, formatCurrency } from '../services/storage';
import { resolveInvoiceModule, resolveQuotationModule } from '../services/salonConfig';
import { numeroALetras } from '../utils/numeroALetras';
import { resolveArcaInvoiceLinks, formatInvoiceNumber, formatInvoiceLabel, isExternalMigratedInvoice } from '../utils/crossLinks';
import { Logo } from './Logo';
import { InvoiceTemplateCalibratorModal, INVOICE_TEMPLATE_IMAGE_CDN, getInvoiceTemplateForType } from './InvoiceTemplateCalibratorModal';
import { ArcaRemitosPanel } from './ArcaRemitosPanel';
import { ClientDirectoryModal } from './ClientDirectoryModal';
import { RentalDetailModal } from './RentalManagement/RentalDetailModal';
import { ParteDiarioDetailModal } from './ParteDiarioDetailModal';
import { 
  FileText, 
  ShieldCheck, 
  PlusCircle, 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Eye, 
  Settings, 
  X, 
  Building2, 
  QrCode, 
  Printer, 
  Check, 
  ArrowRight,
  Zap,
  FileDown,
  Sliders,
  Link2,
  Truck,
  ClipboardList,
  Receipt,
  RefreshCw,
  AlertTriangle,
  Upload,
  ChevronDown,
  ChevronUp,
  Users,
  CreditCard,
  Clock,
  ExternalLink,
  Camera,
  MapPin,
  Package,
  PackageCheck
} from 'lucide-react';

interface ArcaBillingSectionProps {
  invoices: ArcaInvoice[];
  onSaveInvoices: (invoices: ArcaInvoice[]) => void;
  onDeleteInvoice?: (id: string) => Promise<boolean> | void;
  quotations?: Quotation[];
  rentals?: RentalContract[];
  partesDiarios?: ParteDiario[];
  receipts?: CustomerPaymentReceipt[];
  clients?: ClientRecord[];
  hardwareProducts?: HardwareProduct[];
  onUpdateRental?: (rental: RentalContract) => void;
  onUpdatePartesBatch?: (partes: ParteDiario[]) => void;
  onNavigateToCobranzas?: () => void;
  fleet?: Vehicle[];
  drivers?: Employee[];
  obras?: Obra[];
  preselectedQuotation?: Quotation | null;
  preselectedRental?: RentalContract | null;
  preselectedResumen?: PreselectedResumenForArca | null;
  onClearPreselection?: () => void;
  onMarkQuotationInvoiced?: (quotationId: string) => void;
  activeModuleScope?: CommercialModuleScope;
  initialTab?: 'invoices' | 'remitos' | 'config';
  onTabNavigate?: (tab: 'invoices' | 'remitos' | 'config') => void;
}

const EMPTY_QUOTATIONS: Quotation[] = [];
const EMPTY_RENTALS: RentalContract[] = [];
const EMPTY_PARTES: ParteDiario[] = [];
const EMPTY_RECEIPTS: CustomerPaymentReceipt[] = [];
const EMPTY_CLIENTS: ClientRecord[] = [];
const EMPTY_HARDWARE_PRODUCTS: HardwareProduct[] = [];
const EMPTY_FLEET: Vehicle[] = [];
const EMPTY_DRIVERS: Employee[] = [];
const EMPTY_OBRAS: Obra[] = [];

function normalizeCondicionIva(raw?: string | null, fallback: ArcaCondicionIva = 'CONSUMIDOR_FINAL'): ArcaCondicionIva {
  const upper = String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!upper) return fallback;
  if (upper.includes('INSCRIPTO') || upper === 'RI' || upper === 'IVA_RI') return 'RESPONSABLE_INSCRIPTO';
  if (upper.includes('MONOTRIB')) return 'MONOTRIBUTO';
  if (upper.includes('EXENTO')) return 'EXENTO';
  if (upper.includes('CONSUMIDOR') || upper === 'CF') return 'CONSUMIDOR_FINAL';
  return fallback;
}

export const ArcaBillingSection: React.FC<ArcaBillingSectionProps> = ({
  invoices,
  onSaveInvoices,
  onDeleteInvoice,
  quotations = EMPTY_QUOTATIONS,
  rentals = EMPTY_RENTALS,
  partesDiarios = EMPTY_PARTES,
  receipts = EMPTY_RECEIPTS,
  clients = EMPTY_CLIENTS,
  hardwareProducts = EMPTY_HARDWARE_PRODUCTS,
  onUpdateRental,
  onUpdatePartesBatch,
  onNavigateToCobranzas,
  fleet = EMPTY_FLEET,
  drivers = EMPTY_DRIVERS,
  obras = EMPTY_OBRAS,
  preselectedQuotation = null,
  preselectedRental = null,
  preselectedResumen = null,
  onClearPreselection,
  onMarkQuotationInvoiced,
  activeModuleScope = 'ALQUILERES',
  initialTab = 'invoices',
  onTabNavigate
}) => {
  const isVentasScope = activeModuleScope === 'VENTAS_SALON';
  const [config, setConfig] = useState<ArcaConfig>(() => loadArcaConfig());
  const [templateLayout, setTemplateLayout] = useState<InvoiceTemplateLayout>(() => loadInvoiceTemplateLayout());
  const [isCalibratorOpen, setIsCalibratorOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'invoices' | 'remitos' | 'config'>(initialTab);
  const [preselectedInvoiceForRemito, setPreselectedInvoiceForRemito] = useState<ArcaInvoice | null>(null);
  const [emitModalidadEntrega, setEmitModalidadEntrega] = useState<InvoiceDeliveryMode>('ENTREGA_CON_FACTURA');
  const [configSavedNotice, setConfigSavedNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('ALL');
  const [moduleScopeFilter, setModuleScopeFilter] = useState<CommercialModuleScope | 'ALL'>(activeModuleScope);

  useEffect(() => {
    setModuleScopeFilter(activeModuleScope);
  }, [activeModuleScope]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleSwitchTab = (nextTab: 'invoices' | 'remitos' | 'config') => {
    setActiveTab(nextTab);
    if (onTabNavigate && (nextTab === 'invoices' || nextTab === 'remitos')) {
      onTabNavigate(nextTab);
    }
  };

  // Connection Test & Missing Voucher Recovery State
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncingMissingArca, setIsSyncingMissingArca] = useState(false);
  const [syncMissingNotice, setSyncMissingNotice] = useState<{ type: 'ok' | 'info' | 'error'; text: string } | null>(null);

  // Modal Emitir Factura
  const [isEmitModalOpen, setIsEmitModalOpen] = useState(false);
  const [tipoComprobante, setTipoComprobante] = useState<ArcaTipoComprobante>('FACTURA_B');
  const [puntoVenta, setPuntoVenta] = useState<number>(config.puntoVenta || 7);
  const [fecha, setFecha] = useState<string>(new Date().toISOString().slice(0, 10));

  // Sync config and invoice template layout from Supabase on mount
  React.useEffect(() => {
    fetch('/api/settings/arca_config')
      .then(r => r.ok ? r.json() : null)
      .then((serverCfg) => {
        if (serverCfg && typeof serverCfg === 'object' && serverCfg.cuit) {
          const merged: ArcaConfig = {
            ...config,
            ...serverCfg,
            puntoVenta: Number(serverCfg.puntoVenta) || 7,
            puntoVentaRemito: Number(serverCfg.puntoVentaRemito) || 8
          };
          setConfig(merged);
          setPuntoVenta(merged.puntoVenta);
        }
      })
      .catch(() => {});

    syncInvoiceTemplateLayoutFromCloud()
      .then((cloudLayout) => {
        if (cloudLayout) setTemplateLayout(cloudLayout);
      })
      .catch(() => {});
  }, []);
  
  // Receptor & Invoice Metadata
  const [codigoCliente, setCodigoCliente] = useState<string>('');
  const [tipoDocReceptor, setTipoDocReceptor] = useState<'CUIT' | 'DNI' | 'CONSUMIDOR_FINAL'>('CONSUMIDOR_FINAL');
  const [nroDocReceptor, setNroDocReceptor] = useState<string>('');
  const [razonSocialReceptor, setRazonSocialReceptor] = useState<string>('Consumidor Final');
  const [condicionIvaReceptor, setCondicionIvaReceptor] = useState<ArcaCondicionIva>('CONSUMIDOR_FINAL');
  const [domicilioReceptor, setDomicilioReceptor] = useState<string>('');
  const [condicionVenta, setCondicionVenta] = useState<string>('CONTADO');
  const [remitoPedido, setRemitoPedido] = useState<string>('');
  const [percepcionIibb, setPercepcionIibb] = useState<number>(0);
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
  const [cotizacionDolar, setCotizacionDolar] = useState<number>(0);
  const [isFetchingCotiz, setIsFetchingCotiz] = useState<boolean>(false);
  const [isSearchingCuit, setIsSearchingCuit] = useState<boolean>(false);
  const [nextVoucherInfo, setNextVoucherInfo] = useState<{
    loading: boolean;
    nextNum: number | null;
    lastNum: number | null;
    source: 'ARCA' | 'INTERNO' | 'ERROR';
    error?: string;
  }>({ loading: false, nextNum: null, lastNum: null, source: 'ARCA' });

  const fetchNextVoucherNumber = React.useCallback(async () => {
    const isInternal = tipoComprobante === 'FACTURA_X' || tipoComprobante === 'NOTA_CREDITO_X';
    if (isInternal) {
      const sameType = invoices.filter(i => i.tipoComprobante === tipoComprobante && Number(i.puntoVenta || 1) === Number(puntoVenta || 1));
      const lastNum = sameType.length > 0 ? Math.max(...sameType.map(i => Number(i.numeroComprobante || 0))) : 0;
      setNextVoucherInfo({ loading: false, nextNum: lastNum + 1, lastNum, source: 'INTERNO' });
      return;
    }

    if (!puntoVenta || Number(puntoVenta) <= 0) {
      setNextVoucherInfo({ loading: false, nextNum: null, lastNum: null, source: 'ERROR', error: 'Pto. Vta. inválido' });
      return;
    }

    setNextVoucherInfo(prev => ({ ...prev, loading: true, error: undefined }));
    try {
      const hasClientPem =
        Boolean(config.certificate && String(config.certificate).includes('BEGIN CERTIFICATE')) &&
        Boolean(config.privateKey && String(config.privateKey).includes('PRIVATE KEY'));

      const res = await fetch('/api/arca/last-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuitEmisor: config.cuit,
          puntoVenta: Number(puntoVenta),
          tipoComprobante,
          modoProduccion: config.modoProduccion,
          ...(hasClientPem ? { privateKey: config.privateKey, certificate: config.certificate } : {})
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNextVoucherInfo({
          loading: false,
          nextNum: Number(data.nextVoucher),
          lastNum: Number(data.lastVoucher),
          source: 'ARCA'
        });
      } else {
        setNextVoucherInfo({
          loading: false,
          nextNum: null,
          lastNum: null,
          source: 'ERROR',
          error: data.error || 'No se pudo consultar ARCA'
        });
      }
    } catch {
      setNextVoucherInfo({
        loading: false,
        nextNum: null,
        lastNum: null,
        source: 'ERROR',
        error: 'Sin conexión con ARCA'
      });
    }
  }, [tipoComprobante, puntoVenta, config.cuit, config.modoProduccion, config.privateKey, config.certificate, invoices]);

  React.useEffect(() => {
    if (!isEmitModalOpen) return;
    const timer = setTimeout(() => {
      fetchNextVoucherNumber();
    }, 220);
    return () => clearTimeout(timer);
  }, [isEmitModalOpen, fetchNextVoucherNumber]);

  const fetchAfipDollarRate = async () => {
    setIsFetchingCotiz(true);
    try {
      const res = await fetch('/api/arca/exchange-rate/DOL');
      const data = await res.json();
      if (res.ok && data?.success && Number(data.cotizacion) > 0) {
        setCotizacionDolar(Number(data.cotizacion));
      } else {
        setEmitError(data?.error || 'No se pudo obtener la cotización oficial desde AFIP. Ingresá el tipo de cambio manualmente.');
      }
    } catch {
      setEmitError('Error de red al consultar la cotización del dólar en AFIP.');
    } finally {
      setIsFetchingCotiz(false);
    }
  };

  // Associated Invoice for Credit Notes
  const [cbteAsociadoInfo, setCbteAsociadoInfo] = useState<{
    tipoComprobante: ArcaTipoComprobante;
    puntoVenta: number;
    numeroComprobante: number;
    idInvoice?: string;
  } | null>(null);

  // Helper to open Emit Modal pre-filled for a Credit Note linked to an existing Invoice
  const handlePrepareCreditNote = (inv: ArcaInvoice) => {
    let ncType: ArcaTipoComprobante = 'NOTA_CREDITO_B';
    if (inv.tipoComprobante === 'FACTURA_A') ncType = 'NOTA_CREDITO_A';
    else if (inv.tipoComprobante === 'FACTURA_B') ncType = 'NOTA_CREDITO_B';
    else if (inv.tipoComprobante === 'FACTURA_C') ncType = 'NOTA_CREDITO_C';
    else if (inv.tipoComprobante === 'FACTURA_X') ncType = 'NOTA_CREDITO_X';
    else ncType = 'NOTA_CREDITO_B';

    setTipoComprobante(ncType);
    setPuntoVenta(inv.puntoVenta);
    setFecha(new Date().toISOString().slice(0, 10));
    setCodigoCliente(inv.codigoCliente || '');
    setTipoDocReceptor(inv.tipoDocReceptor);
    setNroDocReceptor(inv.nroDocReceptor);
    setRazonSocialReceptor(inv.razonSocialReceptor);
    setCondicionIvaReceptor(inv.condicionIvaReceptor);
    setDomicilioReceptor(inv.domicilioReceptor || '');
    setCondicionVenta(inv.condicionVenta || 'CONTADO');
    setRemitoPedido(`NC / Anula ${inv.id}`);
    setPercepcionIibb(inv.percepcionIibb || 0);
    setMoneda(inv.moneda === 'USD' ? 'USD' : 'ARS');
    setCotizacionDolar(Number(inv.cotizacionDolar || 0));
    setItems(inv.items.map(it => ({ ...it })));
    setCbteAsociadoInfo({
      tipoComprobante: inv.tipoComprobante,
      puntoVenta: inv.puntoVenta,
      numeroComprobante: inv.numeroComprobante,
      idInvoice: inv.id
    });
    setIsEmitModalOpen(true);
  };

  const [cuitLookupNotice, setCuitLookupNotice] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);
  const lastLookedUpDocRef = React.useRef<string>('');

  // Automatic Padrón ARCA / AFIP Lookup by CUIT or DNI
  const handleCuitLookup = async (cuitInput: string, forceRefresh = false) => {
    const clean = cuitInput.replace(/\D/g, '');
    if (!clean) {
      setCuitLookupNotice(null);
      return;
    }
    if (clean.length < 7 || clean.length > 11) {
      setCuitLookupNotice({
        type: 'warn',
        text: clean.length > 11
          ? `El CUIT tiene ${clean.length} dígitos (debe tener 11).`
          : `Ingresá 7-8 dígitos para DNI u 11 para CUIT.`
      });
      return;
    }

    lastLookedUpDocRef.current = clean;
    setCuitLookupNotice(null);
    setIsSearchingCuit(true);
    try {
      const res = await fetch(`/api/arca/padron/${clean}${forceRefresh ? '?refresh=1' : ''}`);
      const data = await res.json();
      if (data && data.found && data.razonSocial) {
        setRazonSocialReceptor(data.razonSocial);
        setTipoDocReceptor('CUIT');
        if (data.cuit && String(data.cuit).length === 11) {
          setNroDocReceptor(String(data.cuit));
          lastLookedUpDocRef.current = String(data.cuit);
        }
        if (data.domicilio) {
          setDomicilioReceptor(data.domicilio);
        }
        if (data.condicionIva) {
          const rawIva = String(data.condicionIva).toUpperCase();
          const normIva: ArcaCondicionIva = rawIva.includes('INSCRIPTO')
            ? 'RESPONSABLE_INSCRIPTO'
            : rawIva.includes('MONOTRIB')
              ? 'MONOTRIBUTO'
              : rawIva.includes('EXENTO')
                ? 'EXENTO'
                : 'CONSUMIDOR_FINAL';
          setCondicionIvaReceptor(normIva);
          if (normIva === 'RESPONSABLE_INSCRIPTO') {
            setTipoComprobante('FACTURA_A');
          } else {
            setTipoComprobante('FACTURA_B');
          }
        }
        setCuitLookupNotice({ type: 'ok', text: `✓ ${data.razonSocial}` });
      } else {
        if (clean.length === 11) {
          setTipoDocReceptor('CUIT');
        } else {
          setTipoDocReceptor('DNI');
        }
        setCuitLookupNotice({ type: 'warn', text: 'Sin resultados en Padrón para ese CUIT/DNI.' });
      }
    } catch (e) {
      console.warn('Error fetching CUIT info:', e);
      setCuitLookupNotice({ type: 'warn', text: 'No se pudo consultar el Padrón en este momento.' });
    } finally {
      setIsSearchingCuit(false);
    }
  };

  // Items
  const [items, setItems] = useState<ArcaInvoiceItem[]>([
    { codigo: '01', descripcion: 'Servicio de Alquiler de Maquinaria Vial / Jornada', cantidad: 1, unidadMedida: 'unidades', precioUnitario: 150000, bonificacionPorcentaje: 0, subtotal: 150000, alicuotaIva: 21 }
  ]);

  // Live Quotations, Rentals & Clients from Supabase for 1-click Import into Invoice
  const [dbQuotations, setDbQuotations] = useState<Quotation[]>(quotations);
  const [dbRentals, setDbRentals] = useState<RentalContract[]>(rentals);
  const [dbClients, setDbClients] = useState<any[]>([]);
  const [selectedSourceQuotationId, setSelectedSourceQuotationId] = useState<string>('');
  const [selectedSourceRentalId, setSelectedSourceRentalId] = useState<string>('');
  const [selectedPartesIds, setSelectedPartesIds] = useState<string[]>([]);
  const [parteSearchInModal, setParteSearchInModal] = useState<string>('');
  const [showClientSuggestions, setShowClientSuggestions] = useState<boolean>(false);
  const [isImportSourceExpanded, setIsImportSourceExpanded] = useState<boolean>(false);
  const [isClientDirectoryOpen, setIsClientDirectoryOpen] = useState<boolean>(false);

  const syncAutoClientAfterInvoice = async (payload: {
    codigo?: string;
    cuit?: string;
    razonSocial?: string;
    condicionIva?: string;
    condicionVenta?: string;
    domicilio?: string;
    fuente?: string;
    ultimoComprobante?: string;
  }) => {
    try {
      const rs = String(payload.razonSocial || '').trim();
      const cuitDigits = String(payload.cuit || '').replace(/\D/g, '');
      if (!rs && cuitDigits.length < 7) return;
      if (rs.toUpperCase().includes('CONSUMIDOR FINAL') && cuitDigits.length < 7) return;

      await fetch('/api/clients/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const r = await fetch('/api/clients/search');
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d.clients)) setDbClients(d.clients);
      }
    } catch {
      // ignore non-blocking client sync
    }
  };

  const applyClientRecordToInvoice = (c: ClientRecord) => {
    if (c.codigo) setCodigoCliente(c.codigo);
    setRazonSocialReceptor(c.razonSocial || 'Consumidor Final');
    if (c.cuit) {
      const clean = c.cuit.replace(/\D/g, '');
      setNroDocReceptor(clean || c.cuit);
      setTipoDocReceptor(clean.length === 11 ? 'CUIT' : clean.length >= 7 ? 'DNI' : 'CONSUMIDOR_FINAL');
    }
    if (c.condicionIva) {
      const normalizedIva = normalizeCondicionIva(c.condicionIva, 'CONSUMIDOR_FINAL');
      setCondicionIvaReceptor(normalizedIva);
      setTipoComprobante(normalizedIva === 'RESPONSABLE_INSCRIPTO' ? 'FACTURA_A' : 'FACTURA_B');
    }
    if (c.domicilio || c.localidad) {
      setDomicilioReceptor([c.domicilio, c.localidad].filter(Boolean).join(' - '));
    }
    if (c.condicionVenta) setCondicionVenta(c.condicionVenta);
    setShowClientSuggestions(false);
  };

  const applyClientRecordToExternal = (c: ClientRecord) => {
    const clean = String(c.cuit || '').replace(/\D/g, '');
    setExtTipoDocReceptor(clean.length === 11 ? 'CUIT' : clean.length >= 7 ? 'DNI' : 'CONSUMIDOR_FINAL');
    setExtNroDocReceptor(clean || c.cuit || '');
    setExtRazonSocialReceptor(c.razonSocial || '');
    const normalizedIva = normalizeCondicionIva(c.condicionIva, 'RESPONSABLE_INSCRIPTO');
    setExtCondicionIvaReceptor(normalizedIva);
    if (c.domicilio || c.localidad) {
      setExtDomicilioReceptor([c.domicilio, c.localidad].filter(Boolean).join(' - '));
    }
    if (c.condicionVenta) {
      setExtCondicionVenta(c.condicionVenta);
    }
    setExtCuitNotice({ type: 'ok', text: `✓ Cliente cargado desde BD: ${c.razonSocial}` });
    setShowExtClientSuggestions(false);
    setExtClientSearch('');
  };

  // Modal para vincular Contratos de Alquiler y Partes Diarios a una Factura ya emitida
  const [invoiceForLinking, setInvoiceForLinking] = useState<ArcaInvoice | null>(null);
  const [linkingRentalIds, setLinkingRentalIds] = useState<string[]>([]);
  const [linkingPartesIds, setLinkingPartesIds] = useState<string[]>([]);
  const [linkingEstadoCobro, setLinkingEstadoCobro] = useState<'PENDIENTE_PAGO' | 'PARCIAL' | 'PAGADO'>('PENDIENTE_PAGO');
  const [linkingParteSearch, setLinkingParteSearch] = useState<string>('');

  // Helper: obtener todos los IDs de Partes Diarios asociados a un Contrato de Alquiler
  const getPartesIdsForRental = (rental: RentalContract): string[] => {
    const contractNumUpper = (rental.numeroContrato || rental.numero || '').trim().toUpperCase();
    const legacyNumUpper = (rental.numero || '').trim().toUpperCase();
    const linkedSet = new Set<string>(rental.partesDiariosIds || []);
    partesDiarios.forEach(p => {
      const pRentalNum = (p.rentalNumero || '').trim().toUpperCase();
      if (
        p.rentalId === rental.id ||
        (contractNumUpper && pRentalNum === contractNumUpper) ||
        (legacyNumUpper && pRentalNum === legacyNumUpper)
      ) {
        linkedSet.add(p.id);
      }
    });
    return Array.from(linkedSet);
  };

  // Modales de inspección rápida de referencias (Contrato de Alquiler, Partes Diarios, Pagos Asociados)
  const [refRentalToView, setRefRentalToView] = useState<RentalContract | null>(null);
  const [refPartesModalData, setRefPartesModalData] = useState<{ invoice: ArcaInvoice; partes: ParteDiario[] } | null>(null);
  const [refSingleParteToView, setRefSingleParteToView] = useState<ParteDiario | null>(null);
  const [refPaymentsModalInvoice, setRefPaymentsModalInvoice] = useState<ArcaInvoice | null>(null);
  const [previewReceiptPhoto, setPreviewReceiptPhoto] = useState<{ url: string; nombre: string } | null>(null);

  // Mapa rápido de vínculos resueltos por ID de factura
  const resolvedLinksByInvoiceId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveArcaInvoiceLinks>>();
    invoices.forEach(inv => {
      map.set(inv.id, resolveArcaInvoiceLinks(inv, rentals, partesDiarios));
    });
    return map;
  }, [invoices, rentals, partesDiarios]);

  // Mapa rápido de Recibos de Cobro y Notas de Crédito asociadas por ID de factura
  const receiptsByInvoiceId = useMemo(() => {
    const map = new Map<string, CustomerPaymentReceipt[]>();
    invoices.forEach(inv => {
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
        return false;
      });
      const byId = new Map<string, CustomerPaymentReceipt>();
      fromReceipts.forEach(r => byId.set(r.id, r));
      (inv.recibosCobro || []).forEach(r => {
        if (!byId.has(r.id)) byId.set(r.id, r);
      });
      const matched = Array.from(byId.values());
      matched.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
      map.set(inv.id, matched);
    });
    return map;
  }, [invoices, receipts]);

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
      const matchedNCs = creditNotes.filter(nc => {
        const assoc = nc.cbteAsociadoInfo;
        if (assoc) {
          // Si la NC tiene referencia explícita al ID de factura, respetar estrictamente ese ID
          if (assoc.idInvoice) {
            return assoc.idInvoice === inv.id;
          }
          // Si no tiene idInvoice (ej: recuperada desde ARCA), exigir tipo + puntoVenta + numeroComprobante exactos
          return (
            assoc.tipoComprobante === inv.tipoComprobante &&
            Number(assoc.puntoVenta) === Number(inv.puntoVenta) &&
            Number(assoc.numeroComprobante) === Number(inv.numeroComprobante)
          );
        }
        // Fallback solo para NCs legacy sin cbteAsociadoInfo: exigir ID exacto o coincidencia de letra + número + CUIT
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
      map.set(inv.id, matchedNCs);
    });
    return map;
  }, [invoices]);

  const findAssociatedInvoiceForCreditNote = (nc: ArcaInvoice): ArcaInvoice | null => {
    if (!nc.tipoComprobante.startsWith('NOTA_CREDITO')) return null;
    const assoc = nc.cbteAsociadoInfo;
    if (assoc?.idInvoice) {
      const byId = invoices.find(i => i.id === assoc.idInvoice && !i.tipoComprobante.startsWith('NOTA_CREDITO'));
      if (byId) return byId;
    }
    if (assoc) {
      const byFields = invoices.find(
        i =>
          !i.tipoComprobante.startsWith('NOTA_CREDITO') &&
          i.tipoComprobante === assoc.tipoComprobante &&
          Number(i.puntoVenta) === Number(assoc.puntoVenta) &&
          Number(i.numeroComprobante) === Number(assoc.numeroComprobante)
      );
      if (byFields) return byFields;
    }
    const remito = nc.remitoPedido || '';
    if (remito) {
      const ncToFacturaType: Record<string, string> = {
        NOTA_CREDITO_A: 'FACTURA_A',
        NOTA_CREDITO_B: 'FACTURA_B',
        NOTA_CREDITO_C: 'FACTURA_C',
        NOTA_CREDITO_X: 'FACTURA_X',
      };
      const expectedTipo = ncToFacturaType[nc.tipoComprobante];
      const ncDoc = (nc.nroDocReceptor || '').replace(/\D/g, '');
      const byRemito = invoices.find(i => {
        if (i.tipoComprobante.startsWith('NOTA_CREDITO')) return false;
        if (remito.includes(i.id)) return true;
        if (remito.includes(formatInvoiceNumber(i))) {
          if (expectedTipo && i.tipoComprobante !== expectedTipo) return false;
          const iDoc = (i.nroDocReceptor || '').replace(/\D/g, '');
          return !ncDoc || !iDoc || ncDoc === iDoc;
        }
        return false;
      });
      if (byRemito) return byRemito;
    }
    return null;
  };

  const openRentalReference = (inv: ArcaInvoice, directRental?: RentalContract | null) => {
    if (directRental) {
      setRefRentalToView(directRental);
      return;
    }
    const targetNum = (inv.rentalNumero || '').trim().toUpperCase();
    const found =
      rentals.find(
        r =>
          r.id === inv.rentalId ||
          (targetNum && ((r.numeroContrato || '').toUpperCase() === targetNum || (r.numero || '').toUpperCase() === targetNum))
      ) ||
      dbRentals.find(
        r =>
          r.id === inv.rentalId ||
          (targetNum && ((r.numeroContrato || '').toUpperCase() === targetNum || (r.numero || '').toUpperCase() === targetNum))
      );
    if (found) {
      setRefRentalToView(found);
    } else {
      openInvoiceLinkModal(inv);
    }
  };

  const openPartesReference = (inv: ArcaInvoice, linkedPartes: ParteDiario[]) => {
    if (linkedPartes.length === 1) {
      setRefSingleParteToView(linkedPartes[0]);
      return;
    }
    setRefPartesModalData({ invoice: inv, partes: linkedPartes });
  };

  const openInvoiceLinkModal = (inv: ArcaInvoice) => {
    const resolved = resolvedLinksByInvoiceId.get(inv.id);
    setInvoiceForLinking(inv);
    const rentalIds = resolved ? resolved.linkedRentals.map(r => r.id) : (inv.rentalIds || (inv.rentalId ? [inv.rentalId] : []));
    const absorbedFromRentals = rentalIds.flatMap(rid => {
      const found = rentals.find(r => r.id === rid) || dbRentals.find(r => r.id === rid);
      return found ? getPartesIdsForRental(found) : [];
    });
    const basePartesIds = resolved ? resolved.linkedPartes.map(p => p.id) : (inv.partesDiariosIds || []);
    setLinkingRentalIds(rentalIds);
    setLinkingPartesIds(Array.from(new Set([...basePartesIds, ...absorbedFromRentals])));
    setLinkingEstadoCobro((resolved?.estadoCobro || inv.estadoCobro || 'PENDIENTE_PAGO') as any);
    setLinkingParteSearch('');
  };

  const handleSaveInvoiceLinks = () => {
    if (!invoiceForLinking) return;
    const invNum = formatInvoiceNumber(invoiceForLinking);
    const primaryRental = rentals.find(r => r.id === linkingRentalIds[0]) || dbRentals.find(r => r.id === linkingRentalIds[0]);

    // La factura absorbe automáticamente todos los Partes Diarios vinculados a los Contratos de Alquiler seleccionados
    const absorbedFromRentals = linkingRentalIds.flatMap(rid => {
      const found = rentals.find(r => r.id === rid) || dbRentals.find(r => r.id === rid);
      return found ? getPartesIdsForRental(found) : [];
    });
    const finalPartesIds = Array.from(new Set([...linkingPartesIds, ...absorbedFromRentals]));

    const updatedInvoice: ArcaInvoice = {
      ...invoiceForLinking,
      rentalId: primaryRental?.id || undefined,
      rentalNumero: primaryRental ? (primaryRental.numeroContrato || primaryRental.numero) : undefined,
      rentalIds: linkingRentalIds,
      partesDiariosIds: finalPartesIds,
      estadoCobro: linkingEstadoCobro,
      montoCobrado: linkingEstadoCobro === 'PAGADO' ? Number(invoiceForLinking.importeTotal || invoiceForLinking.impTotal || 0) : (invoiceForLinking.montoCobrado || 0),
      saldoPendiente: linkingEstadoCobro === 'PAGADO' ? 0 : Number(invoiceForLinking.importeTotal || invoiceForLinking.impTotal || 0) - Number(invoiceForLinking.montoCobrado || 0),
    };

    const nextInvoices = invoices.map(i => i.id === updatedInvoice.id ? updatedInvoice : i);
    onSaveInvoices(nextInvoices);

    // Propagate to Rental Contracts
    if (onUpdateRental) {
      rentals.forEach(r => {
        const shouldBeLinked = linkingRentalIds.includes(r.id);
        const wasLinked = r.facturaId === updatedInvoice.id || (r.facturasIds || []).includes(updatedInvoice.id);
        if (shouldBeLinked) {
          const nextFactIds = Array.from(new Set([...(r.facturasIds || []), updatedInvoice.id]));
          const rentalPartes = getPartesIdsForRental(r);
          const nextPartesIds = linkingRentalIds.length === 1
            ? Array.from(new Set([...rentalPartes, ...finalPartesIds]))
            : rentalPartes;
          onUpdateRental({
            ...r,
            facturasIds: nextFactIds,
            facturaId: updatedInvoice.id,
            facturaNumero: invNum,
            partesDiariosIds: nextPartesIds,
            estadoFacturacion: 'FACTURADO',
            estadoCobro: linkingEstadoCobro === 'PAGADO' ? 'PAGADO' : linkingEstadoCobro === 'PARCIAL' ? 'PARCIAL' : 'PENDIENTE_PAGO',
          });
        } else if (wasLinked) {
          const remaining = (r.facturasIds || []).filter(fid => fid !== updatedInvoice.id);
          onUpdateRental({
            ...r,
            facturasIds: remaining,
            facturaId: remaining[0] || undefined,
            facturaNumero: remaining.length > 0 ? r.facturaNumero : undefined,
            estadoFacturacion: remaining.length > 0 ? 'FACTURADO' : 'NO_FACTURADO',
          });
        }
      });
    }

    // Propagate to Partes Diarios (la factura absorbida toma precedencia jerárquica sobre el contrato)
    if (onUpdatePartesBatch) {
      const partesToUpdate: ParteDiario[] = [];
      partesDiarios.forEach(p => {
        const shouldBeLinked = finalPartesIds.includes(p.id);
        const wasLinked = p.facturaId === updatedInvoice.id || p.facturaNumero === invNum;
        if (shouldBeLinked) {
          partesToUpdate.push({
            ...p,
            facturaId: updatedInvoice.id,
            facturaNumero: invNum,
            rentalId: p.rentalId || primaryRental?.id,
            rentalNumero: p.rentalNumero || (primaryRental ? (primaryRental.numeroContrato || primaryRental.numero) : undefined),
            estadoCobro: linkingEstadoCobro === 'PAGADO' ? 'PAGADO' : 'FACTURADO',
          });
        } else if (wasLinked) {
          partesToUpdate.push({
            ...p,
            facturaId: undefined,
            facturaNumero: undefined,
            estadoCobro: p.estadoCobro === 'FACTURADO' ? 'PENDIENTE' : p.estadoCobro,
          });
        }
      });
      if (partesToUpdate.length > 0) {
        onUpdatePartesBatch(partesToUpdate);
      }
    }

    if (selectedInvoiceForView?.id === updatedInvoice.id) {
      setSelectedInvoiceForView(updatedInvoice);
    }
    setInvoiceForLinking(null);
  };

  // ==================== MODAL: CARGAR FACTURA DE OTRO SISTEMA (MIGRACIÓN) ====================
  const [isExternalModalOpen, setIsExternalModalOpen] = useState<boolean>(false);
  const [extTipoComprobante, setExtTipoComprobante] = useState<ArcaTipoComprobante>('FACTURA_A');
  const [extPuntoVenta, setExtPuntoVenta] = useState<number>(1);
  const [extNumeroComprobante, setExtNumeroComprobante] = useState<string>('');
  const [extFecha, setExtFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [extSistemaOrigenNombre, setExtSistemaOrigenNombre] = useState<string>('Sistema Anterior (Migración)');
  const [extCae, setExtCae] = useState<string>('');
  const [extVencimientoCae, setExtVencimientoCae] = useState<string>('');
  const [extTipoDocReceptor, setExtTipoDocReceptor] = useState<'CUIT' | 'DNI' | 'CONSUMIDOR_FINAL'>('CUIT');
  const [extNroDocReceptor, setExtNroDocReceptor] = useState<string>('');
  const [extRazonSocialReceptor, setExtRazonSocialReceptor] = useState<string>('');
  const [extCondicionIvaReceptor, setExtCondicionIvaReceptor] = useState<ArcaCondicionIva>('RESPONSABLE_INSCRIPTO');
  const [extDomicilioReceptor, setExtDomicilioReceptor] = useState<string>('');
  const [extCondicionVenta, setExtCondicionVenta] = useState<string>('CUENTA CORRIENTE');
  const [extRemitoPedido, setExtRemitoPedido] = useState<string>('');
  const [extMoneda, setExtMoneda] = useState<'ARS' | 'USD'>('ARS');
  const [extCotizacionDolar, setExtCotizacionDolar] = useState<number>(0);
  const [extAmountMode, setExtAmountMode] = useState<'SIMPLE_TOTAL' | 'DETALLE_ITEMS'>('SIMPLE_TOTAL');
  const [extSimpleDesc, setExtSimpleDesc] = useState<string>('Saldo / Factura migrada de sistema anterior');
  const [extSimpleTotal, setExtSimpleTotal] = useState<number>(0);
  const [extSimpleIvaPct, setExtSimpleIvaPct] = useState<number>(21);
  const [extSimplePercepIibb, setExtSimplePercepIibb] = useState<number>(0);
  const [extItems, setExtItems] = useState<ArcaInvoiceItem[]>([
    { codigo: '01', descripcion: 'Servicio facturado en sistema anterior', cantidad: 1, unidadMedida: 'unidades', precioUnitario: 0, bonificacionPorcentaje: 0, subtotal: 0, alicuotaIva: 21 }
  ]);
  const [extEstadoCobro, setExtEstadoCobro] = useState<'PENDIENTE_PAGO' | 'PARCIAL' | 'PAGADO'>('PENDIENTE_PAGO');
  const [extMontoCobrado, setExtMontoCobrado] = useState<number>(0);
  const [extRentalIds, setExtRentalIds] = useState<string[]>([]);
  const [extPartesIds, setExtPartesIds] = useState<string[]>([]);
  const [extParteSearch, setExtParteSearch] = useState<string>('');
  const [extError, setExtError] = useState<string | null>(null);
  const [isSearchingExtCuit, setIsSearchingExtCuit] = useState<boolean>(false);
  const [extCuitNotice, setExtCuitNotice] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);
  const [extModalidadEntrega, setExtModalidadEntrega] = useState<InvoiceDeliveryMode>('ENTREGA_CON_FACTURA');
  const [showExtClientSuggestions, setShowExtClientSuggestions] = useState<boolean>(false);
  const [extClientSearch, setExtClientSearch] = useState<string>('');

  // Merge clients prop + dbClients fetched from API (deduped by id / cuit / razonSocial)
  const allAvailableClients = useMemo<ClientRecord[]>(() => {
    const map = new Map<string, ClientRecord>();
    const add = (c: ClientRecord) => {
      const cleanCuit = String(c.cuit || '').replace(/\D/g, '');
      const key = cleanCuit.length >= 7
        ? `cuit:${cleanCuit}`
        : c.id
          ? `id:${c.id}`
          : `name:${String(c.razonSocial || '').trim().toUpperCase()}`;
      if (!map.has(key)) {
        map.set(key, c);
      }
    };
    clients.forEach(add);
    dbClients.forEach(add);
    return Array.from(map.values()).sort((a, b) =>
      String(a.razonSocial || '').localeCompare(String(b.razonSocial || ''), 'es')
    );
  }, [clients, dbClients]);

  const addHardwareProductToEmitItems = (productId: string) => {
    const prod = hardwareProducts.find(p => p.id === productId);
    if (!prod) return;
    const precio = Number(prod.precioVenta || prod.precioCosto || 0);
    const nextItem: ArcaInvoiceItem = {
      codigo: prod.codigoInterno || prod.codigo || String(items.length + 1).padStart(2, '0'),
      descripcion: prod.nombre + (prod.marca ? ` (${prod.marca})` : ''),
      cantidad: 1,
      unidadMedida: prod.unidadMedida || 'unidades',
      precioUnitario: precio,
      bonificacionPorcentaje: 0,
      subtotal: precio,
      alicuotaIva: 21,
      hardwareProductId: prod.id
    };
    setItems(prev => {
      if (prev.length === 1 && !prev[0].descripcion.trim() && Number(prev[0].precioUnitario || 0) === 0) {
        return [nextItem];
      }
      return [...prev, nextItem];
    });
  };

  const addHardwareProductToExtItems = (productId: string) => {
    const prod = hardwareProducts.find(p => p.id === productId);
    if (!prod) return;
    const precio = Number(prod.precioVenta || prod.precioCosto || 0);
    const nextItem: ArcaInvoiceItem = {
      codigo: prod.codigoInterno || prod.codigo || String(extItems.length + 1).padStart(2, '0'),
      descripcion: prod.nombre + (prod.marca ? ` (${prod.marca})` : ''),
      cantidad: 1,
      unidadMedida: prod.unidadMedida || 'unidades',
      precioUnitario: precio,
      bonificacionPorcentaje: 0,
      subtotal: precio,
      alicuotaIva: 21,
      hardwareProductId: prod.id
    };
    setExtItems(prev => {
      const isDefaultPlaceholder =
        prev.length === 1 &&
        Number(prev[0].precioUnitario || 0) === 0 &&
        (!prev[0].descripcion.trim() || prev[0].descripcion.toLowerCase().includes('sistema anterior'));
      if (isDefaultPlaceholder) {
        return [nextItem];
      }
      return [...prev, nextItem];
    });
  };

  const openExternalInvoiceModal = () => {
    setExtError(null);
    setExtCuitNotice(null);
    setShowExtClientSuggestions(false);
    setExtClientSearch('');
    setExtTipoComprobante('FACTURA_A');
    setExtPuntoVenta(1);
    setExtNumeroComprobante('');
    setExtFecha(new Date().toISOString().slice(0, 10));
    setExtSistemaOrigenNombre('Sistema Anterior (Migración)');
    setExtCae('');
    setExtVencimientoCae('');
    setExtTipoDocReceptor('CUIT');
    setExtNroDocReceptor('');
    setExtRazonSocialReceptor('');
    setExtCondicionIvaReceptor('RESPONSABLE_INSCRIPTO');
    setExtDomicilioReceptor('');
    setExtCondicionVenta('CUENTA CORRIENTE');
    setExtRemitoPedido('');
    setExtMoneda('ARS');
    setExtCotizacionDolar(0);
    setExtAmountMode(isVentasScope ? 'DETALLE_ITEMS' : 'SIMPLE_TOTAL');
    setExtSimpleDesc(
      isVentasScope
        ? 'Venta de artículos facturada en sistema anterior'
        : 'Servicio / Alquiler facturado en sistema anterior'
    );
    setExtSimpleTotal(0);
    setExtSimpleIvaPct(21);
    setExtSimplePercepIibb(0);
    setExtItems([
      {
        codigo: '01',
        descripcion: isVentasScope ? '' : 'Servicio facturado en sistema anterior',
        cantidad: 1,
        unidadMedida: 'unidades',
        precioUnitario: 0,
        bonificacionPorcentaje: 0,
        subtotal: 0,
        alicuotaIva: 21
      }
    ]);
    setExtModalidadEntrega('ENTREGA_CON_FACTURA');
    setExtEstadoCobro('PENDIENTE_PAGO');
    setExtMontoCobrado(0);
    setExtRentalIds([]);
    setExtPartesIds([]);
    setExtParteSearch('');
    setIsExternalModalOpen(true);

    // Refresh rentals (if Alquileres) and clients from server
    Promise.all([
      isVentasScope ? Promise.resolve(null) : fetch('/api/rentals/next-number').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/clients/search').then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([rentData, clientData]) => {
      if (rentData && Array.isArray(rentData.rentals) && rentData.rentals.length > 0) {
        setDbRentals(rentData.rentals);
      }
      if (clientData && Array.isArray(clientData.clients)) {
        setDbClients(clientData.clients);
      }
    });
  };

  const handleExtCuitLookup = async (cuitInput: string) => {
    const clean = cuitInput.replace(/\D/g, '');
    if (clean.length < 7 || clean.length > 11) {
      setExtCuitNotice({ type: 'warn', text: 'Ingresá 7-8 dígitos para DNI u 11 para CUIT.' });
      return;
    }
    setExtCuitNotice(null);
    setIsSearchingExtCuit(true);
    try {
      const res = await fetch(`/api/arca/padron/${clean}`);
      const data = await res.json();
      if (data && data.found && data.razonSocial) {
        setExtRazonSocialReceptor(data.razonSocial);
        setExtTipoDocReceptor('CUIT');
        if (data.cuit && String(data.cuit).length === 11) {
          setExtNroDocReceptor(String(data.cuit));
        }
        if (data.domicilio) setExtDomicilioReceptor(data.domicilio);
        if (data.condicionIva) {
          const rawIva = String(data.condicionIva).toUpperCase();
          const normIva: ArcaCondicionIva = rawIva.includes('INSCRIPTO')
            ? 'RESPONSABLE_INSCRIPTO'
            : rawIva.includes('MONOTRIB')
              ? 'MONOTRIBUTO'
              : rawIva.includes('EXENTO')
                ? 'EXENTO'
                : 'CONSUMIDOR_FINAL';
          setExtCondicionIvaReceptor(normIva);
        }
        setExtCuitNotice({ type: 'ok', text: `✓ ${data.razonSocial}` });
      } else {
        setExtCuitNotice({ type: 'warn', text: 'No encontrado en Padrón AFIP. Podés escribir el cliente manualmente.' });
      }
    } catch {
      setExtCuitNotice({ type: 'warn', text: 'Sin conexión al Padrón AFIP. Completá los datos manualmente.' });
    } finally {
      setIsSearchingExtCuit(false);
    }
  };

  const handleApplyRentalToExternal = (r: RentalContract) => {
    const cleanCuit = String(r.clienteDocumento || '').replace(/\D/g, '');
    setExtTipoDocReceptor(cleanCuit.length === 11 ? 'CUIT' : cleanCuit.length >= 7 ? 'DNI' : 'CONSUMIDOR_FINAL');
    setExtNroDocReceptor(cleanCuit || r.clienteDocumento || '');
    setExtRazonSocialReceptor(r.clienteNombre || '');
    setExtCondicionIvaReceptor((r.clienteCondicionIva as ArcaCondicionIva) || 'RESPONSABLE_INSCRIPTO');
    setExtDomicilioReceptor([r.direccionObra, r.localidadObra].filter(Boolean).join(' - '));
    setExtCondicionVenta(r.condicionVenta || 'CUENTA CORRIENTE');
    setExtRemitoPedido(`${r.numeroContrato || r.numero}${r.obraDestino ? ` • ${r.obraDestino}` : ''}`);
    setExtMoneda(r.moneda === 'USD' ? 'USD' : 'ARS');
    setExtCotizacionDolar(Number(r.cotizacionDolar || 0));
    const totalContract = Number(r.totalAlquiler || r.totalGeneral || 0);
    if (totalContract > 0 && extSimpleTotal <= 0) {
      setExtSimpleTotal(totalContract);
      setExtSimpleDesc(`Alquiler ${r.equipoModelo || 'Equipo'} • Contrato ${r.numeroContrato || r.numero}${r.obraDestino ? ` (${r.obraDestino})` : ''}`);
    }
    if (!extRentalIds.includes(r.id)) {
      setExtRentalIds(prev => [...prev, r.id]);
    }
    const rPartes = getPartesIdsForRental(r);
    if (rPartes.length > 0) {
      setExtPartesIds(prev => Array.from(new Set([...prev, ...rPartes])));
    }
  };

  const extComputedTotals = useMemo(() => {
    if (extAmountMode === 'SIMPLE_TOTAL') {
      const total = Math.max(0, Number(extSimpleTotal || 0));
      const percep = Math.max(0, Number(extSimplePercepIibb || 0));
      const baseWithIva = Math.max(0, total - percep);
      const ivaRate = Number(extSimpleIvaPct || 0);
      const isIvaInclusive = extTipoComprobante !== 'FACTURA_C' && extTipoComprobante !== 'NOTA_CREDITO_C' && extTipoComprobante !== 'FACTURA_X' && extTipoComprobante !== 'NOTA_CREDITO_X' && ivaRate > 0;
      const neto = isIvaInclusive ? Number((baseWithIva / (1 + ivaRate / 100)).toFixed(2)) : Number(baseWithIva.toFixed(2));
      const iva = isIvaInclusive ? Number((baseWithIva - neto).toFixed(2)) : 0;
      return {
        netoGravado: neto,
        ivaTotal: iva,
        percepcionIibb: percep,
        importeTotal: Number(total.toFixed(2)),
        bonificacionTotal: 0,
      };
    } else {
      const neto = extItems.reduce((s, it) => s + Number(it.subtotal || 0), 0);
      const iva = extItems.reduce((s, it) => s + Number(it.subtotal || 0) * (Number(it.alicuotaIva || 0) / 100), 0);
      const percep = Number(extSimplePercepIibb || 0);
      return {
        netoGravado: Number(neto.toFixed(2)),
        ivaTotal: Number(iva.toFixed(2)),
        percepcionIibb: Number(percep.toFixed(2)),
        importeTotal: Number((neto + iva + percep).toFixed(2)),
        bonificacionTotal: 0,
      };
    }
  }, [extAmountMode, extSimpleTotal, extSimpleIvaPct, extSimplePercepIibb, extItems, extTipoComprobante]);

  const handleSaveExternalInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    setExtError(null);

    const ptoVtaNum = Number(extPuntoVenta || 0);
    const nroNum = Number(String(extNumeroComprobante).replace(/\D/g, ''));
    if (ptoVtaNum <= 0 || nroNum <= 0) {
      setExtError('Indicá un Punto de Venta y Número de Comprobante válidos (ej: Pto Vta 0001 - N° 00001425).');
      return;
    }
    if (!extRazonSocialReceptor.trim()) {
      setExtError('Ingresá el Cliente / Razón Social de la factura.');
      return;
    }
    if (extComputedTotals.importeTotal <= 0) {
      setExtError('El Importe Total debe ser mayor a $0.');
      return;
    }

    const paddedPtoVta = String(ptoVtaNum).padStart(4, '0');
    const paddedNum = String(nroNum).padStart(8, '0');
    const id = `EXT-${paddedPtoVta}-${paddedNum}-${Date.now().toString().slice(-4)}`;

    const effectiveRentalIds = isVentasScope ? [] : extRentalIds;
    const absorbedFromRentals = isVentasScope
      ? []
      : effectiveRentalIds.flatMap(rid => {
          const found = rentals.find(r => r.id === rid) || dbRentals.find(r => r.id === rid);
          return found ? getPartesIdsForRental(found) : [];
        });
    const finalPartesIds = isVentasScope ? [] : Array.from(new Set([...extPartesIds, ...absorbedFromRentals]));
    const primaryRental = isVentasScope
      ? undefined
      : (rentals.find(r => r.id === effectiveRentalIds[0]) || dbRentals.find(r => r.id === effectiveRentalIds[0]));

    const isExtNC = extTipoComprobante.startsWith('NOTA_CREDITO');
    const rawExtItems: ArcaInvoiceItem[] = extAmountMode === 'SIMPLE_TOTAL'
      ? [{
          codigo: 'EXT',
          descripcion: extSimpleDesc.trim() || (isVentasScope ? 'Venta de artículos (sistema anterior)' : 'Comprobante migrado desde otro sistema'),
          cantidad: 1,
          unidadMedida: 'unidades',
          precioUnitario: extComputedTotals.netoGravado,
          bonificacionPorcentaje: 0,
          subtotal: extComputedTotals.netoGravado,
          alicuotaIva: extComputedTotals.ivaTotal > 0 ? Number(extSimpleIvaPct || 21) : 0,
        }]
      : extItems.filter(it => it.descripcion.trim().length > 0);

    if (extAmountMode === 'DETALLE_ITEMS' && rawExtItems.length === 0) {
      setExtError('Agregá al menos un artículo o ítem con descripción.');
      return;
    }

    const finalItems: ArcaInvoiceItem[] = rawExtItems.map(it => ({
      ...it,
      cantidadEntregada: isExtNC
        ? undefined
        : extModalidadEntrega === 'ENTREGA_CON_FACTURA'
          ? Number(it.cantidad || 0)
          : 0,
      remitosEntrega: it.remitosEntrega || []
    }));

    const total = extComputedTotals.importeTotal;
    const paidAmount = extEstadoCobro === 'PAGADO'
      ? total
      : extEstadoCobro === 'PARCIAL'
        ? Math.min(total, Math.max(0, Number(extMontoCobrado || 0)))
        : 0;
    const saldoPend = Math.max(0, Number((total - paidAmount).toFixed(2)));
    const originName = extSistemaOrigenNombre.trim() || 'Sistema Anterior (Migración)';

    const newExternalInvoice: ArcaInvoice = {
      id,
      tipoComprobante: extTipoComprobante,
      puntoVenta: ptoVtaNum,
      numeroComprobante: nroNum,
      fecha: extFecha,
      cuitEmisor: config.cuit || '30-71629451-9',
      razonSocialEmisor: config.razonSocial || 'EL HORNOCAL S.R.L.',
      condicionIvaEmisor: config.condicionIva || 'RESPONSABLE_INSCRIPTO',
      tipoDocReceptor: extTipoDocReceptor,
      nroDocReceptor: extNroDocReceptor.trim() || '0',
      razonSocialReceptor: extRazonSocialReceptor.trim(),
      condicionIvaReceptor: extCondicionIvaReceptor,
      domicilioReceptor: extDomicilioReceptor.trim() || undefined,
      condicionVenta: extCondicionVenta.trim() || 'CUENTA CORRIENTE',
      remitoPedido: extRemitoPedido.trim() || undefined,
      moneda: extMoneda,
      cotizacionDolar: extMoneda === 'USD' && extCotizacionDolar > 0 ? Number(extCotizacionDolar) : undefined,
      items: finalItems,
      netoGravado: extComputedTotals.netoGravado,
      ivaTotal: extComputedTotals.ivaTotal,
      bonificacionTotal: 0,
      percepcionIibb: extComputedTotals.percepcionIibb,
      importeTotal: total,
      cae: extCae.trim() || 'MIGRADA-OTRO-SISTEMA',
      vencimientoCae: extVencimientoCae.trim() || extFecha,
      resultado: 'APROBADO',
      observacionesArca: `Factura cargada desde otro sistema (${originName}). NO emitida por este facturador.`,
      origenRegistro: 'OTRO_SISTEMA',
      sistemaOrigenNombre: originName,
      esMigradaOtroSistema: true,
      rentalId: primaryRental?.id || undefined,
      rentalNumero: primaryRental ? (primaryRental.numeroContrato || primaryRental.numero) : undefined,
      rentalIds: effectiveRentalIds,
      partesDiariosIds: finalPartesIds,
      origenModulo: (effectiveRentalIds.length > 0 || finalPartesIds.length > 0) ? 'ALQUILERES' : activeModuleScope,
      vinculadoTipo: (effectiveRentalIds.length > 0 || finalPartesIds.length > 0)
        ? 'ALQUILER'
        : activeModuleScope === 'VENTAS_SALON' ? 'FERRETERIA' : 'ALQUILER',
      modalidadEntrega: isExtNC ? undefined : extModalidadEntrega,
      estadoEntregaMercaderia: isExtNC
        ? undefined
        : extModalidadEntrega === 'ENTREGA_CON_FACTURA'
          ? 'ENTREGADO_TOTAL'
          : 'PENDIENTE_ENTREGA',
      remitosVinculadosIds: [],
      estadoCobro: extEstadoCobro,
      montoCobrado: paidAmount,
      saldoPendiente: saldoPend,
      createdAt: new Date().toISOString(),
    };

    const invNum = formatInvoiceNumber(newExternalInvoice);
    onSaveInvoices([newExternalInvoice, ...invoices]);
    void syncAutoClientAfterInvoice({
      cuit: newExternalInvoice.nroDocReceptor,
      razonSocial: newExternalInvoice.razonSocialReceptor,
      condicionIva: newExternalInvoice.condicionIvaReceptor,
      condicionVenta: newExternalInvoice.condicionVenta,
      domicilio: newExternalInvoice.domicilioReceptor,
      fuente: 'FACTURA_OTRO_SISTEMA',
      ultimoComprobante: newExternalInvoice.id,
    });

    // Propagar vínculos a Contratos de Alquiler
    if (onUpdateRental && extRentalIds.length > 0) {
      extRentalIds.forEach(rid => {
        const r = rentals.find(item => item.id === rid) || dbRentals.find(item => item.id === rid);
        if (!r) return;
        const nextFactIds = Array.from(new Set([...(r.facturasIds || []), newExternalInvoice.id]));
        const rentalPartes = getPartesIdsForRental(r);
        const nextPartesIds = extRentalIds.length === 1
          ? Array.from(new Set([...rentalPartes, ...finalPartesIds]))
          : rentalPartes;
        onUpdateRental({
          ...r,
          facturasIds: nextFactIds,
          facturaId: newExternalInvoice.id,
          facturaNumero: invNum,
          partesDiariosIds: nextPartesIds,
          estadoFacturacion: 'FACTURADO',
          estadoCobro: extEstadoCobro === 'PAGADO' ? 'PAGADO' : extEstadoCobro === 'PARCIAL' ? 'PARCIAL' : 'PENDIENTE_PAGO',
        });
      });
    }

    // Propagar vínculos a Partes Diarios (directos y absorbidos de contratos)
    if (onUpdatePartesBatch && finalPartesIds.length > 0) {
      const partesToUpdate: ParteDiario[] = [];
      partesDiarios.forEach(p => {
        if (finalPartesIds.includes(p.id)) {
          partesToUpdate.push({
            ...p,
            facturaId: newExternalInvoice.id,
            facturaNumero: invNum,
            rentalId: p.rentalId || primaryRental?.id,
            rentalNumero: p.rentalNumero || (primaryRental ? (primaryRental.numeroContrato || primaryRental.numero) : undefined),
            estadoCobro: extEstadoCobro === 'PAGADO' ? 'PAGADO' : 'FACTURADO',
          });
        }
      });
      if (partesToUpdate.length > 0) {
        onUpdatePartesBatch(partesToUpdate);
      }
    }

    setIsExternalModalOpen(false);
    setSelectedInvoiceForView(newExternalInvoice);
  };

  React.useEffect(() => {
    if (quotations.length > 0) {
      setDbQuotations(prev => (JSON.stringify(prev) !== JSON.stringify(quotations) ? quotations : prev));
    }
  }, [quotations]);

  React.useEffect(() => {
    if (rentals.length > 0) {
      setDbRentals(prev => (JSON.stringify(prev) !== JSON.stringify(rentals) ? rentals : prev));
    }
  }, [rentals]);

  React.useEffect(() => {
    if (!isEmitModalOpen) return;
    setIsImportSourceExpanded(false);
    Promise.all([
      fetch('/api/rentals/next-number').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/clients/search').then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([rentData, clientData]) => {
      if (rentData) {
        if (Array.isArray(rentData.quotations) && rentData.quotations.length > 0) {
          setDbQuotations(rentData.quotations);
        }
        if (Array.isArray(rentData.rentals) && rentData.rentals.length > 0) {
          setDbRentals(rentData.rentals);
        }
      }
      if (clientData && Array.isArray(clientData.clients)) {
        setDbClients(clientData.clients);
      }
    });
  }, [isEmitModalOpen]);

  // Helper: Load Quotation into ARCA Invoice Form
  const applyQuotationToInvoice = (q: Quotation) => {
    setSelectedSourceQuotationId(q.id);
    setSelectedSourceRentalId('');
    setCbteAsociadoInfo(null);

    const pto = String(q.puntoVenta || 1).padStart(4, '0');
    const nro = String(q.numeroComprobante || 1).padStart(8, '0');
    const formattedNum = `${pto}-${nro}`;

    const cleanCuit = String(q.cuitReceptor || '').replace(/\D/g, '');
    const prefix = cleanCuit.slice(0, 2);
    const isCompany = prefix === '30' || prefix === '33' || prefix === '34';
    const condIva: ArcaCondicionIva = isCompany ? 'RESPONSABLE_INSCRIPTO' : 'CONSUMIDOR_FINAL';

    setTipoComprobante(condIva === 'RESPONSABLE_INSCRIPTO' ? 'FACTURA_A' : 'FACTURA_B');
    setTipoDocReceptor(cleanCuit.length === 11 ? 'CUIT' : cleanCuit.length >= 7 ? 'DNI' : 'CONSUMIDOR_FINAL');
    setNroDocReceptor(cleanCuit || q.cuitReceptor || '');
    setRazonSocialReceptor(q.razonSocialReceptor || 'Consumidor Final');
    setCondicionIvaReceptor(condIva);
    setDomicilioReceptor(
      [q.domicilioReceptor, q.localidadReceptor].filter(Boolean).join(' - ')
    );
    const matchedClientQ = dbClients.find(c =>
      (cleanCuit.length >= 7 && (c.cuit || '').replace(/\D/g, '') === cleanCuit) ||
      (q.razonSocialReceptor && (c.razonSocial || '').toUpperCase() === q.razonSocialReceptor.trim().toUpperCase())
    );
    setCodigoCliente(matchedClientQ?.codigo || '');
    setCondicionVenta(q.condicionVenta || 'CONTADO / TRANSFERENCIA');
    setRemitoPedido(`COT ${formattedNum}`);
    setPercepcionIibb(Number(q.percepcionIibb || 0));

    const quotIsUsd = /USD|D[OÓ]LAR/i.test(q.monedaExpresada || '');
    setMoneda(quotIsUsd ? 'USD' : 'ARS');
    if (quotIsUsd) {
      fetchAfipDollarRate();
    } else {
      setCotizacionDolar(0);
    }

    if (Array.isArray(q.items) && q.items.length > 0) {
      setItems(
        q.items.map((it, idx) => ({
          codigo: it.codigo || String(idx + 1).padStart(2, '0'),
          descripcion: it.observacionLinea
            ? `${it.descripcion} (${it.observacionLinea})`
            : it.descripcion,
          cantidad: Number(it.cantidad || 1),
          unidadMedida: it.unidadMedida || 'DÍAS',
          precioUnitario: Number(it.precioUnitario || 0),
          bonificacionPorcentaje: Number(it.bonificacionPorcentaje || 0),
          subtotal: Number(it.importe || (Number(it.cantidad || 1) * Number(it.precioUnitario || 0))),
          alicuotaIva: Number(it.alicuotaIva ?? 21)
        }))
      );
    }
    if (cleanCuit.length === 11) {
      handleCuitLookup(cleanCuit);
    }
  };

  // Helper: Load Rental Contract into ARCA Invoice Form
  const applyRentalToInvoice = (r: RentalContract) => {
    setSelectedSourceRentalId(r.id);
    setSelectedSourceQuotationId(r.cotizacionId || '');
    setCbteAsociadoInfo(null);

    // Preseleccionar automáticamente los Partes Diarios vinculados a este Contrato de Alquiler
    const linkedPartesForRental = getPartesIdsForRental(r);
    if (linkedPartesForRental.length > 0) {
      setSelectedPartesIds(prev => Array.from(new Set([...prev, ...linkedPartesForRental])));
    }

    const cleanCuit = String(r.clienteDocumento || '').replace(/\D/g, '');
    const prefix = cleanCuit.slice(0, 2);
    const isCompany = prefix === '30' || prefix === '33' || prefix === '34';
    const condIva: ArcaCondicionIva = normalizeCondicionIva(
      r.clienteCondicionIva,
      isCompany ? 'RESPONSABLE_INSCRIPTO' : 'CONSUMIDOR_FINAL'
    );

    setTipoComprobante(condIva === 'RESPONSABLE_INSCRIPTO' ? 'FACTURA_A' : 'FACTURA_B');
    setTipoDocReceptor(cleanCuit.length === 11 ? 'CUIT' : cleanCuit.length >= 7 ? 'DNI' : 'CONSUMIDOR_FINAL');
    setNroDocReceptor(cleanCuit || r.clienteDocumento || '');
    setRazonSocialReceptor(r.clienteNombre || 'Consumidor Final');
    setCondicionIvaReceptor(condIva);
    setDomicilioReceptor(
      [r.direccionObra, r.localidadObra].filter(Boolean).join(' - ')
    );
    const matchedClientR = dbClients.find(c =>
      (cleanCuit.length >= 7 && (c.cuit || '').replace(/\D/g, '') === cleanCuit) ||
      (r.clienteNombre && (c.razonSocial || '').toUpperCase() === r.clienteNombre.trim().toUpperCase())
    );
    setCodigoCliente(matchedClientR?.codigo || '');
    setCondicionVenta(r.condicionVenta || 'CONTADO / TRANSFERENCIA');
    setRemitoPedido(
      r.cotizacionNumero ? `${r.numeroContrato} (COT ${r.cotizacionNumero})` : r.numeroContrato
    );
    setPercepcionIibb(Number(r.percepcionIibb || 0));

    const rentalIsUsd = r.moneda === 'USD';
    setMoneda(rentalIsUsd ? 'USD' : 'ARS');
    if (rentalIsUsd) {
      const refTc = Number(r.cotizacionDolar || 0);
      setCotizacionDolar(refTc);
      if (refTc <= 0) {
        fetchAfipDollarRate();
      }
    } else {
      setCotizacionDolar(0);
    }

    if (Array.isArray(r.items) && r.items.length > 0) {
      setItems(
        r.items.map((it, idx) => ({
          codigo: it.codigo || String(idx + 1).padStart(2, '0'),
          descripcion: it.observacionLinea
            ? `${it.descripcion} (${it.observacionLinea})`
            : it.descripcion,
          cantidad: Number(it.cantidad || 1),
          unidadMedida: it.unidadMedida || (r.modalidad === 'DIAS' ? 'DÍAS' : 'HORAS'),
          precioUnitario: Number(it.precioUnitario || 0),
          bonificacionPorcentaje: Number(it.bonificacionPorcentaje || 0),
          subtotal: Number(it.importe || (Number(it.cantidad || 1) * Number(it.precioUnitario || 0))),
          alicuotaIva: Number(it.alicuotaIva ?? r.alicuotaIva ?? 21)
        }))
      );
    } else {
      const unitLabel = r.modalidad === 'DIAS' ? 'DÍAS' : 'HORAS';
      const builtItems: ArcaInvoiceItem[] = [
        {
          codigo: r.equipoCodigoInterno?.replace(/^INT-/i, '') || r.equipoCodigo || '01',
          descripcion: `ALQUILER ${r.equipoModelo.toUpperCase()} (${r.modalidad === 'DIAS' ? 'POR JORNADA / DÍA' : 'POR HORA'})`,
          cantidad: Number(r.duracion || 1),
          unidadMedida: unitLabel,
          precioUnitario: Number(r.tarifaEquipoUnitaria || 0),
          bonificacionPorcentaje: 0,
          subtotal: Number(r.subtotalEquipo || (r.duracion * r.tarifaEquipoUnitaria)),
          alicuotaIva: Number(r.alicuotaIva ?? 21)
        }
      ];
      if (r.operarioIncluido && r.subtotalOperario > 0) {
        builtItems.push({
          codigo: 'OP-01',
          descripcion: `SERVICIO DE OPERADOR (${r.operarioNombre || 'MAQUINISTA'})`,
          cantidad: Number(r.duracion || 1),
          unidadMedida: unitLabel,
          precioUnitario: Number(r.tarifaOperarioUnitaria || 0),
          bonificacionPorcentaje: 0,
          subtotal: Number(r.subtotalOperario || 0),
          alicuotaIva: Number(r.alicuotaIva ?? 21)
        });
      }
      if (r.costoTrasladoFlete > 0) {
        builtItems.push({
          codigo: 'FLETE',
          descripcion: 'SERVICIO DE TRASLADO / CARRETÓN A OBRA',
          cantidad: 1,
          unidadMedida: 'SERVICIO',
          precioUnitario: Number(r.costoTrasladoFlete || 0),
          bonificacionPorcentaje: 0,
          subtotal: Number(r.costoTrasladoFlete || 0),
          alicuotaIva: Number(r.alicuotaIva ?? 21)
        });
      }
      setItems(builtItems);
    }
  };

  // Helper: Load Obra Resumen Valorizado into ARCA Invoice Form (auto-linking Contract & Partes Diarios)
  const applyResumenToInvoice = (payload: PreselectedResumenForArca) => {
    const { obra: targetObra, resumen, linkedRental, parteDiarioIds } = payload;

    setSelectedSourceRentalId(linkedRental?.id || '');
    setSelectedSourceQuotationId(linkedRental?.cotizacionId || '');
    setCbteAsociadoInfo(null);

    // Pre-select all Partes Diarios from the Resumen Valorizado (+ any linked to the Rental Contract)
    const rentalPartes = linkedRental ? getPartesIdsForRental(linkedRental) : [];
    const mergedPartes = Array.from(new Set([...(parteDiarioIds || []), ...rentalPartes]));
    setSelectedPartesIds(mergedPartes);

    // Resolve client / receptor from linked Rental Contract first, then Obra.pertenece / Client Directory
    const rawDoc = String(linkedRental?.clienteDocumento || '').replace(/\D/g, '');
    const rawName = (linkedRental?.clienteNombre || targetObra.pertenece || targetObra.nombreObra || '').trim();
    const rawNameUpper = rawName.toUpperCase();
    const matchedClient = dbClients.find(c =>
      (rawDoc.length >= 7 && (c.cuit || '').replace(/\D/g, '') === rawDoc) ||
      (rawNameUpper && (c.razonSocial || '').trim().toUpperCase() === rawNameUpper) ||
      (rawNameUpper && rawNameUpper.length >= 4 && (c.razonSocial || '').trim().toUpperCase().includes(rawNameUpper))
    );

    const cleanCuit = rawDoc || String(matchedClient?.cuit || '').replace(/\D/g, '');
    const prefix = cleanCuit.slice(0, 2);
    const isCompany = prefix === '30' || prefix === '33' || prefix === '34';
    const condIva: ArcaCondicionIva = normalizeCondicionIva(
      linkedRental?.clienteCondicionIva || matchedClient?.condicionIva,
      isCompany ? 'RESPONSABLE_INSCRIPTO' : 'CONSUMIDOR_FINAL'
    );

    setTipoComprobante(condIva === 'RESPONSABLE_INSCRIPTO' ? 'FACTURA_A' : 'FACTURA_B');
    setTipoDocReceptor(cleanCuit.length === 11 ? 'CUIT' : cleanCuit.length >= 7 ? 'DNI' : 'CONSUMIDOR_FINAL');
    setNroDocReceptor(cleanCuit || linkedRental?.clienteDocumento || '');
    setRazonSocialReceptor(matchedClient?.razonSocial || rawName || 'Consumidor Final');
    setCondicionIvaReceptor(condIva);
    setDomicilioReceptor(
      matchedClient?.domicilio ||
        [linkedRental?.direccionObra, linkedRental?.localidadObra].filter(Boolean).join(' - ') ||
        targetObra.ubicacion ||
        ''
    );
    setCodigoCliente(matchedClient?.codigo || '');
    setCondicionVenta(linkedRental?.condicionVenta || 'CONTADO / TRANSFERENCIA');
    setRemitoPedido(
      linkedRental
        ? `RV ${resumen.numero} · ${linkedRental.numeroContrato}`
        : `RV ${resumen.numero}`
    );
    setPercepcionIibb(Number(linkedRental?.percepcionIibb || 0));
    setMoneda('ARS');
    setCotizacionDolar(0);

    // Group Resumen Valorizado rows cleanly by (Equipo + Precio Unitario + Unidad) for AFIP/ARCA invoice items
    const alicuota = Number(resumen.alicuotaIva || 0) > 0 ? Number(resumen.alicuotaIva) : 21;
    const periodoLabel = resumen.periodoTitulo
      ? ` — ${resumen.periodoTitulo}`
      : resumen.fechaDesde && resumen.fechaHasta
      ? ` (${resumen.fechaDesde.slice(8, 10)}/${resumen.fechaDesde.slice(5, 7)} al ${resumen.fechaHasta.slice(8, 10)}/${resumen.fechaHasta.slice(5, 7)})`
      : '';

    const groupMap = new Map<
      string,
      { codigo: string; equipo: string; unidad: string; cantidad: number; precioUnitario: number; subtotal: number; rowsCount: number }
    >();

    (resumen.filas || []).forEach((row) => {
      const equipo = (row.equipo || 'TRABAJOS EN OBRA').trim().toUpperCase();
      const unidad = (row.unidad || 'HORAS').trim().toUpperCase();
      const pu = Number(row.precioUnitario || 0);
      const cant = Number(row.cantidad || 0);
      const key = `${equipo}||${pu}||${unidad}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.cantidad = Number((existing.cantidad + cant).toFixed(3));
        existing.subtotal = Number((existing.subtotal + Number(row.precioTotal || cant * pu)).toFixed(2));
        existing.rowsCount += 1;
      } else {
        groupMap.set(key, {
          codigo: row.equipoCodigo || '',
          equipo,
          unidad,
          cantidad: cant,
          precioUnitario: pu,
          subtotal: Number((row.precioTotal || cant * pu).toFixed(2)),
          rowsCount: 1,
        });
      }
    });

    const builtItems: ArcaInvoiceItem[] = Array.from(groupMap.values()).map((g, idx) => ({
      codigo: g.codigo || String(idx + 1).padStart(2, '0'),
      descripcion: `${g.equipo} — OBRA ${targetObra.nombreObra.toUpperCase()}${periodoLabel} (RV ${resumen.numero})`,
      cantidad: g.cantidad,
      unidadMedida: g.unidad,
      precioUnitario: g.precioUnitario,
      bonificacionPorcentaje: 0,
      subtotal: Number((g.cantidad * g.precioUnitario).toFixed(2)),
      alicuotaIva: alicuota,
    }));

    if (builtItems.length > 0) {
      setItems(builtItems);
    } else {
      setItems([
        {
          codigo: '01',
          descripcion: `RESUMEN VALORIZADO N° ${resumen.numero} — OBRA ${targetObra.nombreObra.toUpperCase()}${periodoLabel}`,
          cantidad: 1,
          unidadMedida: 'SERVICIO',
          precioUnitario: Number(resumen.subtotalNeto || 0),
          bonificacionPorcentaje: 0,
          subtotal: Number(resumen.subtotalNeto || 0),
          alicuotaIva: alicuota,
        },
      ]);
    }
  };

  // Auto-open Emit Modal when navigated from QuotationSection, RentalManagementSection, or Obra Resumen Valorizado
  React.useEffect(() => {
    if (preselectedQuotation) {
      applyQuotationToInvoice(preselectedQuotation);
      setIsEmitModalOpen(true);
      if (onClearPreselection) onClearPreselection();
    } else if (preselectedRental) {
      applyRentalToInvoice(preselectedRental);
      setIsEmitModalOpen(true);
      if (onClearPreselection) onClearPreselection();
    } else if (preselectedResumen) {
      applyResumenToInvoice(preselectedResumen);
      setIsEmitModalOpen(true);
      if (onClearPreselection) onClearPreselection();
    }
  }, [preselectedQuotation, preselectedRental, preselectedResumen]);

  // View Invoice Detail Modal
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<ArcaInvoice | null>(null);
  const viewContainerRef = React.useRef<HTMLDivElement>(null);
  const [viewContainerWidth, setViewContainerWidth] = useState<number>(672);

  React.useEffect(() => {
    const updateWidth = () => {
      if (viewContainerRef.current) {
        setViewContainerWidth(viewContainerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [selectedInvoiceForView]);

  const viewScale = viewContainerWidth / 1000;
  const getViewFs = (fs: number) => `${Math.max(6, (fs || 14) * viewScale)}px`;
  const [invoiceViewMode, setInvoiceViewMode] = useState<'IMAGE_TEMPLATE' | 'VECTOR_HTML'>('IMAGE_TEMPLATE');
  const [templateFallbackStep, setTemplateFallbackStep] = useState<Record<string, number>>({});
  const [invoiceToDelete, setInvoiceToDelete] = useState<ArcaInvoice | null>(null);
  const [auditLiveResult, setAuditLiveResult] = useState<any>(null);
  const [isAuditingLive, setIsAuditingLive] = useState<boolean>(false);
  const [copiedAfipData, setCopiedAfipData] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  const handleSyncMissingFromArca = async () => {
    setIsSyncingMissingArca(true);
    setSyncMissingNotice(null);
    try {
      const res = await fetch('/api/arca/sync-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puntoVenta: Number(config.puntoVenta || 7) }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setSyncMissingNotice({
          type: 'error',
          text: data?.error || 'No se pudo consultar ARCA para recuperar comprobantes.',
        });
        return;
      }

      const recovered: ArcaInvoice[] = Array.isArray(data.recoveredInvoices) ? data.recoveredInvoices : [];
      if (recovered.length > 0) {
        const byId = new Map<string, ArcaInvoice>();
        recovered.forEach((inv) => byId.set(inv.id, inv));
        invoices.forEach((inv) => {
          if (!byId.has(inv.id)) byId.set(inv.id, inv);
        });
        const merged = Array.from(byId.values()).sort((a, b) =>
          (b.fecha || '').localeCompare(a.fecha || '') || (b.createdAt || '').localeCompare(a.createdAt || '')
        );
        onSaveInvoices(merged);
        const labels = recovered
          .map((r) => `${r.tipoComprobante.replace(/_/g, ' ')} ${String(r.puntoVenta).padStart(4, '0')}-${String(r.numeroComprobante).padStart(8, '0')}`)
          .join(', ');
        setSyncMissingNotice({
          type: 'ok',
          text: `Se recuperaron ${recovered.length} comprobante(s) directo desde ARCA: ${labels}.`,
        });
      } else {
        setSyncMissingNotice({
          type: 'info',
          text: `Sincronización con ARCA (Pto. Vta. ${String(data.puntoVenta || config.puntoVenta || 7).padStart(4, '0')}) al día: no faltaba ningún comprobante autorizado.`,
        });
      }
    } catch (err: any) {
      setSyncMissingNotice({
        type: 'error',
        text: err?.message || 'Error de conexión al sincronizar con ARCA.',
      });
    } finally {
      setIsSyncingMissingArca(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedInvoiceForView) return;
    setIsGeneratingPdf(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1240;
      canvas.height = 1754;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2d context');

      // Ensure solid white A4 background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const loadImg = (url: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });

      const tplInfo = getInvoiceTemplateForType(selectedInvoiceForView.tipoComprobante);
      const isInternal = selectedInvoiceForView.tipoComprobante === 'FACTURA_X' || selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_X';
      const isCreditNote = selectedInvoiceForView.tipoComprobante.startsWith('NOTA_CREDITO_');

      let bgImg: HTMLImageElement | null = null;
      try {
        bgImg = await loadImg(tplInfo.primary);
      } catch {
        try {
          bgImg = await loadImg(tplInfo.fallback);
        } catch {
          try {
            bgImg = await loadImg(INVOICE_TEMPLATE_IMAGE_CDN);
          } catch {
            bgImg = null;
          }
        }
      }

      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
      }

      // Font defaults
      ctx.fillStyle = '#1e293b';
      const fontFam = templateLayout.fontFamily || 'monospace';

      const W = canvas.width;
      const H = canvas.height;
      const pdfScale = W / 1000;

      const drawText = (
        text: string,
        xPct: number,
        yPct: number,
        align: 'left' | 'right' | 'center' = 'left',
        fontSize = 14,
        isBold = false,
        customFontFamily?: string
      ) => {
        ctx.save();
        const scaledFs = Math.round((fontSize || 14) * pdfScale);
        const activeFam = customFontFamily || fontFam;
        ctx.font = isBold ? `bold ${scaledFs}px ${activeFam}` : `${scaledFs}px ${activeFam}`;
        ctx.textAlign = align;
        ctx.textBaseline = 'top';
        ctx.fillText(text, (xPct / 100) * W, (yPct / 100) * H);
        ctx.restore();
      };

      const isNcTemplate = tplInfo.templateKind === 'NCA' || tplInfo.templateKind === 'NCB';

      // Letter Box & Document Title overlay aligned to each native template (A / B / X / NCA / NCB)
      if (selectedInvoiceForView.tipoComprobante === 'FACTURA_A') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect((47.5 / 100) * W, (7.0 / 100) * H, (6.5 / 100) * W, (2.2 / 100) * H);
        ctx.fillStyle = '#000000';
        drawText('COD. 01', 50.8, 7.5, 'center', 14, true, 'Arial, Helvetica, sans-serif');
      } else if (selectedInvoiceForView.tipoComprobante === 'FACTURA_B') {
        // Native formato-factura-b-la-hormiga.jpg already includes crisp "B / COD. 06" and "FACTURA"
      } else if (selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_A') {
        // Native formato-nota-credito-a-la-hormiga.jpg already includes "A" and "NOTA DE CREDITO"; fix COD. 06 -> COD. 03
        ctx.fillStyle = '#ffffff';
        ctx.fillRect((47.4 / 100) * W, (7.5 / 100) * H, (5.9 / 100) * W, (1.6 / 100) * H);
        ctx.fillStyle = '#000000';
        drawText('COD. 03', 50.35, 7.7, 'center', 11, true, 'Arial, Helvetica, sans-serif');
      } else if (selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_B') {
        // Native formato-nota-credito-b-la-hormiga.jpg already includes crisp "B / COD. 08" and "NOTA DE CREDITO"
      } else if (selectedInvoiceForView.tipoComprobante === 'FACTURA_C') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect((47.4 / 100) * W, (5.4 / 100) * H, (5.9 / 100) * W, (3.7 / 100) * H);
        ctx.fillStyle = '#000000';
        drawText('C', 50.35, 5.5, 'center', 28, true, 'Arial, Helvetica, sans-serif');
        drawText('COD. 11', 50.35, 7.7, 'center', 11, true, 'Arial, Helvetica, sans-serif');
      } else if (selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_C') {
        // Native NC B base keeps "NOTA DE CREDITO", replaces letter box -> C / COD. 13
        ctx.fillStyle = '#ffffff';
        ctx.fillRect((47.4 / 100) * W, (5.4 / 100) * H, (5.9 / 100) * W, (3.7 / 100) * H);
        ctx.fillStyle = '#000000';
        drawText('C', 50.35, 5.5, 'center', 28, true, 'Arial, Helvetica, sans-serif');
        drawText('COD. 13', 50.35, 7.7, 'center', 11, true, 'Arial, Helvetica, sans-serif');
      } else if (selectedInvoiceForView.tipoComprobante === 'FACTURA_X') {
        // Native formato-factura-x-la-hormiga.jpg already includes crisp "X" and "* Documento no valido como factura"
        ctx.fillStyle = '#000000';
        drawText('FACTURA X', 75.5, 6.0, 'center', 24, true, 'Arial, Helvetica, sans-serif');
      } else if (selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_X') {
        ctx.fillStyle = '#000000';
        drawText('NOTA DE CRÉDITO X', 75.5, 6.0, 'center', 22, true, 'Arial, Helvetica, sans-serif');
      }

      ctx.fillStyle = '#1e293b';
      const isBTemplate = tplInfo.templateKind === 'B';
      const isOfficialJpgTemplate = isNcTemplate || isBTemplate;
      // Nº Comprobante & Fecha (aligned to printed N° & FECHA DE EMISIÓN on official JPG templates)
      const ptoVtaPadded = String(selectedInvoiceForView.puntoVenta).padStart(5, '0');
      const nroPadded = String(selectedInvoiceForView.numeroComprobante).padStart(8, '0');
      const numX = isOfficialJpgTemplate ? 60.8 : templateLayout.numComprobante.x;
      const numY = isOfficialJpgTemplate ? 11.1 : templateLayout.numComprobante.y;
      const fechaX = isOfficialJpgTemplate ? 71.8 : templateLayout.fechaEmision.x;
      const fechaY = isOfficialJpgTemplate ? 12.6 : templateLayout.fechaEmision.y;
      drawText(`${ptoVtaPadded}-${nroPadded}`, numX, numY, 'left', templateLayout.numComprobante.fontSize, true);
      drawText(selectedInvoiceForView.fecha.split('-').reverse().join('/'), fechaX, fechaY, 'left', templateLayout.fechaEmision.fontSize);

      const condIvaLabel =
        selectedInvoiceForView.condicionIvaReceptor === 'RESPONSABLE_INSCRIPTO'
          ? 'Responsable inscripto'
          : selectedInvoiceForView.condicionIvaReceptor.replace(/_/g, ' ');

      const assocText = selectedInvoiceForView.cbteAsociadoInfo
        ? `${selectedInvoiceForView.cbteAsociadoInfo.tipoComprobante.replace(/_/g, ' ')} ${String(selectedInvoiceForView.cbteAsociadoInfo.puntoVenta).padStart(4, '0')}-${String(selectedInvoiceForView.cbteAsociadoInfo.numeroComprobante).padStart(8, '0')}`
        : selectedInvoiceForView.remitoPedido || '';

      // Customer Box (dedicated layout for official NC A / NC B, Factura B, and Factura A / X)
      if (isNcTemplate) {
        drawText(selectedInvoiceForView.razonSocialReceptor.toUpperCase(), 11.8, 20.0, 'left', templateLayout.razonSocial.fontSize);
        drawText(selectedInvoiceForView.nroDocReceptor, 10.0, 22.9, 'left', templateLayout.cuitReceptor.fontSize);
        drawText((selectedInvoiceForView.domicilioReceptor || 'SAN SALVADOR DE JUJUY').toUpperCase(), 12.3, 24.3, 'left', templateLayout.domicilio.fontSize);
        drawText((selectedInvoiceForView.condicionVenta || 'CONTADO').toUpperCase(), 63.2, 22.9, 'left', templateLayout.condicionVenta.fontSize);
        drawText(condIvaLabel, 63.2, 24.3, 'left', templateLayout.condicionIva.fontSize);
        if (assocText) {
          drawText(assocText.toUpperCase(), 59.1, 25.6, 'left', templateLayout.remitoPedido.fontSize, true);
        }
      } else if (isBTemplate) {
        drawText(selectedInvoiceForView.codigoCliente || '000001', 12.8, 20.1, 'left', templateLayout.codigoCliente.fontSize);
        drawText(selectedInvoiceForView.razonSocialReceptor.toUpperCase(), 28.2, 20.1, 'left', templateLayout.razonSocial.fontSize);
        drawText(selectedInvoiceForView.nroDocReceptor, 10.0, 22.9, 'left', templateLayout.cuitReceptor.fontSize);
        drawText((selectedInvoiceForView.condicionVenta || 'CONTADO').toUpperCase(), 51.4, 22.9, 'left', templateLayout.condicionVenta.fontSize);
        drawText(condIvaLabel, 82.4, 22.9, 'left', templateLayout.condicionIva.fontSize);
        drawText((selectedInvoiceForView.domicilioReceptor || 'SAN SALVADOR DE JUJUY').toUpperCase(), 12.3, 24.3, 'left', templateLayout.domicilio.fontSize);
        drawText(selectedInvoiceForView.remitoPedido || '0000000000000', 82.4, 24.3, 'left', templateLayout.remitoPedido.fontSize);
      } else {
        drawText(selectedInvoiceForView.codigoCliente || '000001', templateLayout.codigoCliente.x, templateLayout.codigoCliente.y, 'left', templateLayout.codigoCliente.fontSize);
        drawText(selectedInvoiceForView.razonSocialReceptor.toUpperCase(), templateLayout.razonSocial.x, templateLayout.razonSocial.y, 'left', templateLayout.razonSocial.fontSize);
        drawText(selectedInvoiceForView.nroDocReceptor, templateLayout.cuitReceptor.x, templateLayout.cuitReceptor.y, 'left', templateLayout.cuitReceptor.fontSize);
        drawText((selectedInvoiceForView.condicionVenta || 'CONTADO').toUpperCase(), templateLayout.condicionVenta.x, templateLayout.condicionVenta.y, 'left', templateLayout.condicionVenta.fontSize);
        if (tplInfo.templateKind !== 'X') {
          drawText(condIvaLabel, templateLayout.condicionIva.x, templateLayout.condicionIva.y, 'left', templateLayout.condicionIva.fontSize);
        }
        drawText((selectedInvoiceForView.domicilioReceptor || 'SAN SALVADOR DE JUJUY').toUpperCase(), templateLayout.domicilio.x, templateLayout.domicilio.y, 'left', templateLayout.domicilio.fontSize);
        drawText(selectedInvoiceForView.remitoPedido || '0000000000000', templateLayout.remitoPedido.x, templateLayout.remitoPedido.y, 'left', templateLayout.remitoPedido.fontSize);

        // Associated Voucher Reference for NC X
        if (isCreditNote && selectedInvoiceForView.cbteAsociadoInfo) {
          ctx.fillStyle = '#0f172a';
          drawText(`COMPROBANTE ASOCIADO: ${assocText}`, 4.2, 27.6, 'left', 12, true);
          ctx.fillStyle = '#1e293b';
        }
      }

      const wrapCanvasText = (text: string, maxWidthPx: number, fontSize = 14, isBold = false): string[] => {
        if (!text) return [''];
        ctx.save();
        const scaledFs = Math.round((fontSize || 14) * pdfScale);
        ctx.font = isBold ? `bold ${scaledFs}px ${fontFam}` : `${scaledFs}px ${fontFam}`;

        const paragraphs = String(text).split(/\r?\n/);
        const lines: string[] = [];

        for (const para of paragraphs) {
          const words = para.trim().split(/\s+/).filter(Boolean);
          if (words.length === 0) {
            if (lines.length === 0) lines.push('');
            continue;
          }
          let currentLine = '';
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (ctx.measureText(testLine).width <= maxWidthPx) {
              currentLine = testLine;
            } else {
              if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
              }
              if (ctx.measureText(word).width > maxWidthPx) {
                let chunk = '';
                for (const ch of word) {
                  const testChunk = chunk + ch;
                  if (ctx.measureText(testChunk).width <= maxWidthPx || chunk === '') {
                    chunk = testChunk;
                  } else {
                    lines.push(chunk);
                    chunk = ch;
                  }
                }
                currentLine = chunk;
              } else {
                currentLine = word;
              }
            }
          }
          if (currentLine) lines.push(currentLine);
        }

        ctx.restore();
        return lines.length > 0 ? lines : [''];
      };

      // Table items
      let itemYPct = isOfficialJpgTemplate
        ? Math.max(33.7, templateLayout.tableStartY || 33.7)
        : (templateLayout.tableStartY || 34.8);
      const rowGap = templateLayout.tableRowHeight || 3.2;
      const tblFontSize = templateLayout.tableFontSize || 16;
      const descX = templateLayout.tableColDescripcionX || 14.2;
      const cantX = templateLayout.tableColCantidadX || 59.2;
      const descLimitX = Math.max(descX + 12, cantX - 2.5);
      const maxDescWidthPx = ((descLimitX - descX) / 100) * W;
      const lineHeightPct = Math.max(1.35, ((tblFontSize * pdfScale * 1.25) / H) * 100);

      selectedInvoiceForView.items.forEach((it, idx) => {
        const cod = it.codigo || String(idx + 1).padStart(8, '0');
        const sym = selectedInvoiceForView.moneda === 'USD' ? 'US$ ' : '$';
        const precioX = templateLayout.tableColPrecioX ? Math.min(73.2, templateLayout.tableColPrecioX) : 72.8;
        const bonifX = templateLayout.tableColBonifX || 83.8;
        const subtotalRightX = Math.max(95.5, templateLayout.tableColSubtotalX || 96.8);
        const descLines = wrapCanvasText(it.descripcion.toUpperCase(), maxDescWidthPx, tblFontSize, false);

        drawText(cod, templateLayout.tableColCodigoX || 5.7, itemYPct, 'left', tblFontSize);
        descLines.forEach((line, lineIdx) => {
          drawText(line, descX, itemYPct + lineIdx * lineHeightPct, 'left', tblFontSize);
        });
        drawText(it.cantidad.toLocaleString('es-AR', { minimumFractionDigits: 2 }), cantX, itemYPct, 'left', tblFontSize);
        drawText(it.unidadMedida === 'unidades' ? 'UNI' : (it.unidadMedida || 'UNI'), templateLayout.tableColUnidadX || 65.5, itemYPct, 'left', tblFontSize);
        drawText(`${sym}${it.precioUnitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, precioX, itemYPct, 'left', tblFontSize);
        drawText(it.bonificacionPorcentaje ? `${it.bonificacionPorcentaje}%` : '0%', bonifX, itemYPct, 'left', tblFontSize);
        drawText(`${sym}${it.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, subtotalRightX, itemYPct, 'right', tblFontSize);

        const wrappedHeightPct = descLines.length * lineHeightPct;
        itemYPct += Math.max(rowGap, wrappedHeightPct + 0.7);
      });

      // Son pesos / dólares (aligned right after printed "SON PESOS:" label on each sheet)
      const invCurrency = selectedInvoiceForView.moneda === 'USD' ? 'USD' : 'ARS';
      const sonPesosText = numeroALetras(selectedInvoiceForView.importeTotal, invCurrency).replace(/^SON PESOS\s*/i, '');
      const sonPesosX = isNcTemplate ? 16.5 : isBTemplate ? 17.6 : tplInfo.templateKind === 'X' ? 16.5 : templateLayout.sonPesos.x;
      const sonPesosY = tplInfo.templateKind === 'A' ? templateLayout.sonPesos.y : 82.6;
      const sonPesosMaxWidthPx = ((isOfficialJpgTemplate ? 46 : 55) / 100) * W;
      const sonPesosLines = wrapCanvasText(sonPesosText, sonPesosMaxWidthPx, templateLayout.sonPesos.fontSize, false);
      const sonPesosLineH = Math.max(1.25, (((templateLayout.sonPesos.fontSize || 14) * pdfScale * 1.2) / H) * 100);
      sonPesosLines.slice(0, 2).forEach((ln, li) => {
        drawText(ln, sonPesosX, sonPesosY + li * sonPesosLineH, 'left', templateLayout.sonPesos.fontSize);
      });

      // Totals Column adapted per template (A / B / X / NCA / NCB)
      const totX = isOfficialJpgTemplate ? 96.2 : (templateLayout.totalsX || 95.2);
      const totFS = templateLayout.totalsFontSize || 18;
      if (tplInfo.templateKind === 'X') {
        drawText(selectedInvoiceForView.netoGravado.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 76.8, 'right', totFS);
        drawText(selectedInvoiceForView.importeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 80.8, 'right', totFS, true);
      } else if (isNcTemplate) {
        const iva105Sum = selectedInvoiceForView.items.reduce(
          (acc, it) => acc + (Number(it.alicuotaIva) === 10.5 ? Number(it.subtotal || 0) * 0.105 : 0),
          0
        );
        const iva21Sum = Math.max(0, Number(selectedInvoiceForView.ivaTotal || 0) - iva105Sum);
        drawText(selectedInvoiceForView.netoGravado.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 77.0, 'right', totFS);
        drawText(iva21Sum.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 78.3, 'right', totFS);
        drawText(iva105Sum.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 79.6, 'right', totFS);
        drawText((selectedInvoiceForView.percepcionIibb || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 81.0, 'right', totFS);
        drawText((0).toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 82.3, 'right', totFS);
        drawText(selectedInvoiceForView.importeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 83.6, 'right', totFS, true);
      } else if (isBTemplate) {
        drawText(selectedInvoiceForView.netoGravado.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 77.3, 'right', totFS);
        drawText(selectedInvoiceForView.ivaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 79.9, 'right', totFS);
        if ((selectedInvoiceForView.bonificacionTotal || 0) > 0) {
          drawText(`-${(selectedInvoiceForView.bonificacionTotal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, totX, 81.2, 'right', totFS);
        }
        drawText((selectedInvoiceForView.percepcionIibb || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 82.6, 'right', totFS);
        drawText(selectedInvoiceForView.importeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, 83.9, 'right', totFS, true);
      } else {
        drawText(selectedInvoiceForView.netoGravado.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, templateLayout.totalsNetoY, 'right', totFS);
        drawText((selectedInvoiceForView.bonificacionTotal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, templateLayout.totalsBonifY, 'right', totFS);
        drawText(selectedInvoiceForView.ivaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, templateLayout.totalsIvaY, 'right', totFS);
        drawText((selectedInvoiceForView.percepcionIibb || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, templateLayout.totalsIibbY, 'right', totFS);
        drawText(selectedInvoiceForView.importeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 }), totX, templateLayout.totalsTotalY, 'right', totFS, true);
      }

      // AFIP CAE, Vto, Barcode & QR only on official AFIP/ARCA templates (not internal Factura X / NC X)
      if (!isInternal) {
        const caeX = isNcTemplate ? 67.8 : isBTemplate ? 68.5 : templateLayout.caeNum.x;
        const caeVtoX = isNcTemplate ? 67.8 : isBTemplate ? 68.5 : templateLayout.caeVto.x;
        const caeY = isNcTemplate ? 88.2 : isBTemplate ? 88.0 : templateLayout.caeNum.y;
        const caeVtoY = isNcTemplate ? 89.6 : isBTemplate ? 89.4 : templateLayout.caeVto.y;
        drawText(selectedInvoiceForView.cae, caeX, caeY, 'left', templateLayout.caeNum.fontSize);
        drawText(selectedInvoiceForView.vencimientoCae.split('-').reverse().join('/'), caeVtoX, caeVtoY, 'left', templateLayout.caeVto.fontSize);

        const afipTipoCode = selectedInvoiceForView.tipoComprobante === 'FACTURA_A' ? '001'
          : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_A' ? '003'
          : selectedInvoiceForView.tipoComprobante === 'FACTURA_B' ? '006'
          : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_B' ? '008'
          : selectedInvoiceForView.tipoComprobante === 'FACTURA_C' ? '011'
          : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_C' ? '013'
          : '000';

        const barcodeStr = `${selectedInvoiceForView.cuitEmisor.replace(/\D/g, '')}${afipTipoCode}${ptoVtaPadded}${selectedInvoiceForView.cae}${selectedInvoiceForView.vencimientoCae.replace(/\D/g, '')}`;
        drawText(barcodeStr, templateLayout.barcode.x, templateLayout.barcode.y, 'left', templateLayout.barcode.fontSize);

        const afipTipoNum = selectedInvoiceForView.tipoComprobante === 'FACTURA_A' ? 1
          : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_A' ? 3
          : selectedInvoiceForView.tipoComprobante === 'FACTURA_B' ? 6
          : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_B' ? 8
          : selectedInvoiceForView.tipoComprobante === 'FACTURA_C' ? 11
          : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_C' ? 13
          : 6;

        const qrDataObj = {
          ver: 1,
          fecha: selectedInvoiceForView.fecha,
          cuit: Number(selectedInvoiceForView.cuitEmisor.replace(/\D/g, '')),
          ptoVta: selectedInvoiceForView.puntoVenta,
          tipoCmp: afipTipoNum,
          nroCmp: selectedInvoiceForView.numeroComprobante,
          importe: selectedInvoiceForView.importeTotal,
          moneda: invCurrency === 'USD' ? 'DOL' : 'PES',
          ctz: invCurrency === 'USD' ? Number(selectedInvoiceForView.cotizacionDolar || 1) : 1,
          tipoDocRec: selectedInvoiceForView.tipoDocReceptor === 'CUIT' ? 80 : selectedInvoiceForView.tipoDocReceptor === 'DNI' ? 96 : 99,
          nroDocRec: Number(selectedInvoiceForView.nroDocReceptor.replace(/\D/g, '') || 0),
          tipoCodAut: 'E',
          codAut: Number(selectedInvoiceForView.cae) || 0
        };
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
          `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(qrDataObj))}`
        )}`;

        const qrImg = new Image();
        qrImg.crossOrigin = 'anonymous';
        qrImg.src = qrUrl;

        await new Promise((resolve) => {
          qrImg.onload = resolve;
          qrImg.onerror = resolve;
        });

        if (qrImg.complete && qrImg.naturalWidth > 0) {
          const qrX = (templateLayout.qrCode.x / 100) * W;
          const qrY = (templateLayout.qrCode.y / 100) * H;
          const qrSize = templateLayout.qrCode.size * pdfScale;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4);
          ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
        }
      }

      // Save as PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
      pdf.save(`Comprobante_${selectedInvoiceForView.tipoComprobante}_${selectedInvoiceForView.id}.pdf`);
    } catch (err: any) {
      console.error('PDF export error:', err);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleAuditLive = async (inv: ArcaInvoice) => {
    setIsAuditingLive(true);
    setAuditLiveResult(null);
    try {
      const res = await fetch(`/api/arca/consult-voucher/${inv.puntoVenta}/${inv.tipoComprobante}/${inv.numeroComprobante}`);
      const data = await res.json();
      setAuditLiveResult(data);
    } catch (e: any) {
      setAuditLiveResult({ error: e.message || 'Error de red' });
    } finally {
      setIsAuditingLive(false);
    }
  };

  const handleViewInvoice = (inv: ArcaInvoice) => {
    setSelectedInvoiceForView(inv);
    setCopiedAfipData(false);
    setAuditLiveResult(null);
    const isExt = isExternalMigratedInvoice(inv);
    const isInt = inv.tipoComprobante === 'FACTURA_X' || inv.tipoComprobante === 'NOTA_CREDITO_X';
    if (!isExt && !isInt) {
      handleAuditLive(inv);
    }
  };

  // Metrics (Credit Notes subtract from gross billing and tax totals; separate ARS vs USD)
  const scopeCounts = useMemo(() => {
    let ventas = 0;
    let alquileres = 0;
    invoices.forEach(inv => {
      if (resolveInvoiceModule(inv) === 'VENTAS_SALON') ventas += 1;
      else alquileres += 1;
    });
    return { ventas, alquileres, total: invoices.length };
  }, [invoices]);

  const scopedInvoices = useMemo(() => {
    if (moduleScopeFilter === 'ALL') return invoices;
    return invoices.filter(inv => resolveInvoiceModule(inv) === moduleScopeFilter);
  }, [invoices, moduleScopeFilter]);

  const metrics = useMemo(() => {
    const totalCount = scopedInvoices.length;
    const arsInvoices = scopedInvoices.filter(inv => inv.moneda !== 'USD');
    const usdInvoices = scopedInvoices.filter(inv => inv.moneda === 'USD');

    const sumSigned = (list: ArcaInvoice[], field: 'importeTotal' | 'ivaTotal') =>
      list.reduce((sum, inv) => {
        const isNC = inv.tipoComprobante.startsWith('NOTA_CREDITO');
        const val = Number(inv[field] || 0);
        return sum + (isNC ? -val : val);
      }, 0);

    const totalMonto = sumSigned(arsInvoices, 'importeTotal');
    const totalMontoUsd = sumSigned(usdInvoices, 'importeTotal');
    const totalIva = sumSigned(arsInvoices, 'ivaTotal');
    const totalIvaUsd = sumSigned(usdInvoices, 'ivaTotal');
    const migradasOtroSistema = scopedInvoices.filter(inv => isExternalMigratedInvoice(inv)).length;
    const aprobadas = scopedInvoices.filter(inv => inv.resultado === 'APROBADO' && !isExternalMigratedInvoice(inv)).length;
    return { totalCount, totalMonto, totalMontoUsd, totalIva, totalIvaUsd, aprobadas, migradasOtroSistema };
  }, [scopedInvoices]);

  const filteredInvoices = useMemo(() => {
    return scopedInvoices.filter(inv => {
      const q = searchQuery.toLowerCase();
      const isExt = isExternalMigratedInvoice(inv);
      const matchSearch = (
        inv.id.toLowerCase().includes(q) ||
        inv.razonSocialReceptor.toLowerCase().includes(q) ||
        inv.nroDocReceptor.toLowerCase().includes(q) ||
        inv.cae.toLowerCase().includes(q) ||
        String(inv.numeroComprobante).includes(q) ||
        (inv.sistemaOrigenNombre || '').toLowerCase().includes(q) ||
        (isExt && ('otro sistema migrada externa'.includes(q)))
      );
      const matchTipo = filterTipo === 'ALL'
        ? true
        : filterTipo === 'OTRO_SISTEMA'
          ? isExt
          : filterTipo === 'ESTE_SISTEMA'
            ? !isExt
            : filterTipo === 'NOTAS_CREDITO'
              ? inv.tipoComprobante.startsWith('NOTA_CREDITO')
              : inv.tipoComprobante === filterTipo;
      return matchSearch && matchTipo;
    }).sort((a, b) => {
      const cmpDate = (b.fecha || '').localeCompare(a.fecha || '');
      if (cmpDate !== 0) return cmpDate;
      const cmpNum = Number(b.numeroComprobante || 0) - Number(a.numeroComprobante || 0);
      if (cmpNum !== 0) return cmpNum;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [scopedInvoices, searchQuery, filterTipo]);

  // Key and CSR Generation State
  const [isGeneratingCert, setIsGeneratingCert] = useState(false);
  const [certGenMessage, setCertGenMessage] = useState<{ success: boolean; message: string } | null>(null);

  // Helper to trigger file download in browser
  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Generate Private Key and CSR directly via backend OpenSSL
  const handleGenerateKeys = async () => {
    setIsGeneratingCert(true);
    setCertGenMessage(null);
    try {
      const res = await fetch('/api/arca/generate-csr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuit: config.cuit,
          razonSocial: config.razonSocial,
          alias: 'lahormiga'
        })
      });
      const data = await res.json();
      if (data.success && data.privateKey && data.csr) {
        const updatedConfig = {
          ...config,
          privateKey: data.privateKey,
          csr: data.csr
        };
        setConfig(updatedConfig);
        saveArcaConfig(updatedConfig);
        setCertGenMessage({
          success: true,
          message: '¡Clave Privada y Solicitud (.csr) generadas con éxito! Descarga el archivo .csr para subirlo en ARCA.'
        });
      } else {
        setCertGenMessage({
          success: false,
          message: data.error || 'No se pudo generar la solicitud CSR.'
        });
      }
    } catch (err: any) {
      setCertGenMessage({
        success: false,
        message: err.message || 'Error de conexión con el generador OpenSSL'
      });
    } finally {
      setIsGeneratingCert(false);
    }
  };

  // Upload Key handler (.key)
  const handleUploadKey = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const updated = { ...config, privateKey: content };
        setConfig(updated);
        saveArcaConfig(updated);
        setTestResult(null);
        setCertGenMessage({
          success: true,
          message: `Clave privada ${file.name} cargada con éxito en el sistema.`
        });
      }
    };
    reader.readAsText(file);
  };

  // Upload CRT handler (.crt)
  const handleUploadCrt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const updated = { ...config, certificate: content };
        setConfig(updated);
        saveArcaConfig(updated);
        setTestResult(null);
        setCertGenMessage({
          success: true,
          message: `Certificado digital ${file.name} cargado con éxito en el sistema.`
        });
      }
    };
    reader.readAsText(file);
  };

  // Test Connection Handler with Full Live AFIP Diagnostics
  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/arca/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuit: config.cuit,
          puntoVenta: config.puntoVenta,
          puntoVentaRemito: config.puntoVentaRemito || 8,
          modoProduccion: config.modoProduccion,
          hasKey: Boolean(config.privateKey),
          hasCert: Boolean(config.certificate),
          certificateText: config.certificate,
          privateKeyText: config.privateKey
        })
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: data.message });
      } else {
        setTestResult({ success: false, message: data.error || 'Fallo de autenticación con WebService WSFE' });
      }
    } catch (err: any) {
      setTestResult({ 
        success: false, 
        message: `Error de red con el servidor local: ${err.message || 'Sin conexión'}` 
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Item management in modal
  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        codigo: String(prev.length + 1).padStart(2, '0'),
        descripcion: '',
        cantidad: 1,
        unidadMedida: 'unidades',
        precioUnitario: 0,
        bonificacionPorcentaje: 0,
        subtotal: 0,
        alicuotaIva: 21
      }
    ]);
  };

  const handleUpdateItem = (index: number, field: keyof ArcaInvoiceItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === 'cantidad' || field === 'precioUnitario' || field === 'bonificacionPorcentaje') {
        const cant = Number(item.cantidad || 0);
        const precio = Number(item.precioUnitario || 0);
        const bonif = Number(item.bonificacionPorcentaje || 0);
        const base = cant * precio;
        item.subtotal = base * (1 - (bonif / 100));
      }
      updated[index] = item;
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Calculations for Modal
  const totalBonificacionCalculated = useMemo(() => {
    return items.reduce((sum, item) => {
      const cant = Number(item.cantidad || 0);
      const precio = Number(item.precioUnitario || 0);
      const bonif = Number(item.bonificacionPorcentaje || 0);
      return sum + (cant * precio * (bonif / 100));
    }, 0);
  }, [items]);

  const subtotalNeto = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  }, [items]);

  const totalIvaCalculated = useMemo(() => {
    return items.reduce((sum, item) => {
      const alicuota = Number(item.alicuotaIva || 0);
      return sum + ((item.subtotal || 0) * (alicuota / 100));
    }, 0);
  }, [items]);

  const totalImporte = subtotalNeto + totalIvaCalculated + Number(percepcionIibb || 0);

  // Authorizing State & Error Banner for Emit Modal
  const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false);
  const [emitError, setEmitError] = useState<string | null>(null);

  // Emit Invoice Handler (Communicates strictly with ARCA WSFEv1)
  const handleEmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmitError(null);

    if (!razonSocialReceptor.trim() || items.length === 0) {
      setEmitError('Por favor complete los datos del receptor y al menos un ítem.');
      return;
    }

    const isInternalDoc = tipoComprobante === 'FACTURA_X' || tipoComprobante === 'NOTA_CREDITO_X';
    if (!isInternalDoc && moneda === 'USD' && (!cotizacionDolar || Number(cotizacionDolar) <= 0)) {
      setEmitError('Para facturar en Dólares (USD) ante ARCA debés indicar la cotización en pesos (TC) o consultarla con el botón "Cotiz. AFIP".');
      return;
    }

    // Helper para propagar vínculos de nueva factura a Contrato de Alquiler y Partes Diarios (absorbiendo partes del contrato)
    const propagateNewInvoiceLinks = (createdInv: ArcaInvoice, absorbedPartesIds: string[]) => {
      const invNum = formatInvoiceNumber(createdInv);
      const matchedRental = rentals.find(r => r.id === selectedSourceRentalId) || dbRentals.find(r => r.id === selectedSourceRentalId);
      if (matchedRental && onUpdateRental) {
        const nextFactIds = Array.from(new Set([...(matchedRental.facturasIds || []), createdInv.id]));
        const nextPartesIds = Array.from(new Set([...(matchedRental.partesDiariosIds || []), ...absorbedPartesIds]));
        onUpdateRental({
          ...matchedRental,
          facturasIds: nextFactIds,
          facturaId: createdInv.id,
          facturaNumero: invNum,
          partesDiariosIds: nextPartesIds,
          estadoFacturacion: 'FACTURADO',
          estadoCobro: matchedRental.estadoCobro === 'PAGADO' ? 'PAGADO' : 'PENDIENTE_PAGO',
        });
      }
      if (absorbedPartesIds.length > 0 && onUpdatePartesBatch) {
        const updatedPartes: ParteDiario[] = [];
        partesDiarios.forEach(p => {
          if (absorbedPartesIds.includes(p.id)) {
            updatedPartes.push({
              ...p,
              facturaId: createdInv.id,
              facturaNumero: invNum,
              rentalId: p.rentalId || matchedRental?.id,
              rentalNumero: p.rentalNumero || (matchedRental ? (matchedRental.numeroContrato || matchedRental.numero) : undefined),
              estadoCobro: p.estadoCobro === 'PAGADO' ? 'PAGADO' : 'FACTURADO',
            });
          }
        });
        if (updatedPartes.length > 0) {
          onUpdatePartesBatch(updatedPartes);
        }
      }
    };

    // Calcular partes absorbidos desde el Contrato de Alquiler vinculado (si existe)
    const matchedRentalForEmit = rentals.find(r => r.id === selectedSourceRentalId) || dbRentals.find(r => r.id === selectedSourceRentalId);
    const finalAbsorbedPartesIds = matchedRentalForEmit
      ? Array.from(new Set([...selectedPartesIds, ...getPartesIdsForRental(matchedRentalForEmit)]))
      : selectedPartesIds;

    // Determinar módulo origen de la factura (Ventas Salón vs Alquileres)
    const matchedQuotationForEmit = selectedSourceQuotationId
      ? quotations.find(q => q.id === selectedSourceQuotationId)
      : undefined;
    const resolvedOrigenModulo: CommercialModuleScope =
      selectedSourceRentalId || finalAbsorbedPartesIds.length > 0
        ? 'ALQUILERES'
        : matchedQuotationForEmit
          ? resolveQuotationModule(matchedQuotationForEmit)
          : activeModuleScope;
    const resolvedVinculadoTipo: ArcaInvoice['vinculadoTipo'] =
      resolvedOrigenModulo === 'VENTAS_SALON' ? 'FERRETERIA' : 'ALQUILER';

    const isEmitNC = tipoComprobante.startsWith('NOTA_CREDITO');
    const itemsWithDelivery: ArcaInvoiceItem[] = items.map(it => ({
      ...it,
      cantidadEntregada: isEmitNC
        ? undefined
        : emitModalidadEntrega === 'ENTREGA_CON_FACTURA'
          ? Number(it.cantidad || 0)
          : 0,
      remitosEntrega: it.remitosEntrega || []
    }));

    // FACTURA X or NOTA CREDITO X: Internal Control Document (No ARCA / AFIP web service call)
    if (isInternalDoc) {
      const internals = invoices.filter(i => i.tipoComprobante === tipoComprobante);
      const nextNum = internals.length > 0 ? Math.max(...internals.map(i => i.numeroComprobante || 0)) + 1 : 1;
      const paddedNum = String(nextNum).padStart(8, '0');
      const paddedPtoVta = String(puntoVenta || 1).padStart(4, '0');
      const prefix = tipoComprobante === 'NOTA_CREDITO_X' ? 'NCX' : 'FX';
      const existingIds = new Set(invoices.map(i => i.id));
      let id = `${prefix}-${paddedPtoVta}-${paddedNum}`;
      if (existingIds.has(id)) {
        id = `${id}-${Date.now().toString().slice(-4)}`;
      }

      const newInvoice: ArcaInvoice = {
        id,
        tipoComprobante,
        puntoVenta: Number(puntoVenta || 1),
        numeroComprobante: nextNum,
        fecha,
        cuitEmisor: config.cuit || '30-71629451-9',
        razonSocialEmisor: config.razonSocial || 'EL HORNOCAL S.R.L.',
        condicionIvaEmisor: config.condicionIva || 'RESPONSABLE_INSCRIPTO',
        tipoDocReceptor,
        nroDocReceptor: nroDocReceptor.trim() || '0',
        razonSocialReceptor: razonSocialReceptor.trim(),
        condicionIvaReceptor,
        domicilioReceptor: domicilioReceptor.trim() || undefined,
        codigoCliente: codigoCliente.trim() || undefined,
        condicionVenta: condicionVenta.trim() || undefined,
        remitoPedido: remitoPedido.trim() || undefined,
        moneda,
        cotizacionDolar: moneda === 'USD' && cotizacionDolar > 0 ? Number(cotizacionDolar) : undefined,
        items: itemsWithDelivery,
        netoGravado: subtotalNeto,
        ivaTotal: totalIvaCalculated,
        bonificacionTotal: totalBonificacionCalculated,
        percepcionIibb: Number(percepcionIibb || 0),
        importeTotal: totalImporte,
        cae: 'INTERNO-NO-FISCAL',
        vencimientoCae: '2099-12-31',
        resultado: 'APROBADO',
        observacionesArca: `Comprobante Interno de Control ${tipoComprobante === 'NOTA_CREDITO_X' ? 'Nota de Crédito X' : 'Factura X'} (Uso propio - Documento no válido como factura fiscal)`,
        qrData: `${tipoComprobante}_${id}`,
        cbteAsociadoInfo: cbteAsociadoInfo || undefined,
        rentalId: selectedSourceRentalId || undefined,
        rentalNumero: matchedRentalForEmit ? (matchedRentalForEmit.numeroContrato || matchedRentalForEmit.numero) : undefined,
        rentalIds: selectedSourceRentalId ? [selectedSourceRentalId] : [],
        partesDiariosIds: finalAbsorbedPartesIds,
        origenModulo: resolvedOrigenModulo,
        vinculadoTipo: resolvedVinculadoTipo,
        modalidadEntrega: isEmitNC ? undefined : emitModalidadEntrega,
        estadoEntregaMercaderia: isEmitNC
          ? undefined
          : emitModalidadEntrega === 'ENTREGA_CON_FACTURA'
            ? 'ENTREGADO_TOTAL'
            : 'PENDIENTE_ENTREGA',
        remitosVinculadosIds: [],
        estadoCobro: 'PENDIENTE_PAGO',
        montoCobrado: 0,
        saldoPendiente: totalImporte,
        createdAt: new Date().toISOString()
      };

      const updated = [newInvoice, ...invoices];
      onSaveInvoices(updated);
      void syncAutoClientAfterInvoice({
        codigo: newInvoice.codigoCliente,
        cuit: newInvoice.nroDocReceptor,
        razonSocial: newInvoice.razonSocialReceptor,
        condicionIva: newInvoice.condicionIvaReceptor,
        condicionVenta: newInvoice.condicionVenta,
        domicilio: newInvoice.domicilioReceptor,
        fuente: 'FACTURA_X',
        ultimoComprobante: newInvoice.id,
      });
      propagateNewInvoiceLinks(newInvoice, finalAbsorbedPartesIds);
      if (selectedSourceQuotationId && onMarkQuotationInvoiced) {
        onMarkQuotationInvoiced(selectedSourceQuotationId);
      }
      setIsEmitModalOpen(false);
      setCbteAsociadoInfo(null);
      setSelectedPartesIds([]);
      setSelectedInvoiceForView(newInvoice);
      return;
    }

    try {
      setIsAuthorizing(true);
      const res = await fetch('/api/arca/authorize-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuitEmisor: config.cuit,
          puntoVenta: Number(puntoVenta),
          tipoComprobante,
          tipoDocReceptor,
          nroDocReceptor,
          razonSocialReceptor,
          condicionIvaReceptor,
          netoGravado: subtotalNeto,
          ivaTotal: totalIvaCalculated,
          percepcionIibb: Number(percepcionIibb || 0),
          importeTotal: totalImporte,
          moneda,
          cotizacionDolar: moneda === 'USD' ? Number(cotizacionDolar) : 1,
          items,
          fecha,
          modoProduccion: config.modoProduccion,
          privateKey: config.privateKey,
          certificate: config.certificate,
          cbteAsociado: cbteAsociadoInfo ? {
            tipoComprobante: cbteAsociadoInfo.tipoComprobante,
            puntoVenta: cbteAsociadoInfo.puntoVenta,
            numeroComprobante: cbteAsociadoInfo.numeroComprobante
          } : undefined
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        // Strict: ONLY if ARCA confirms do we generate the invoice
        setEmitError(data.error || 'La factura NO se generó: Los servidores de ARCA / AFIP rechazaron la solicitud.');
        return;
      }

      const sameTypeInvoices = invoices.filter(
        i => i.tipoComprobante === tipoComprobante && Number(i.puntoVenta) === Number(puntoVenta)
      );
      const fallbackNextNum = sameTypeInvoices.length > 0
        ? Math.max(...sameTypeInvoices.map(i => i.numeroComprobante || 0)) + 1
        : 1;
      const nextNum = Number(data.numeroComprobante) > 0 ? Number(data.numeroComprobante) : fallbackNextNum;
      const paddedNum = String(nextNum).padStart(8, '0');
      const paddedPtoVta = String(puntoVenta).padStart(4, '0');
      const typeCodeMap: Record<string, string> = {
        FACTURA_A: '',
        FACTURA_B: 'FB-',
        FACTURA_C: 'FC-',
        NOTA_CREDITO_A: 'NCA-',
        NOTA_CREDITO_B: 'NCB-',
        NOTA_CREDITO_C: 'NCC-',
        NOTA_DEBITO_A: 'NDA-',
        NOTA_DEBITO_B: 'NDB-',
        NOTA_DEBITO_C: 'NDC-',
      };
      const typePrefix = typeCodeMap[tipoComprobante] ?? `${tipoComprobante}-`;
      const existingIds = new Set(invoices.map(i => i.id));
      let id = `ARCA-${typePrefix}${paddedPtoVta}-${paddedNum}`;
      if (existingIds.has(id)) {
        id = `${id}-${Date.now().toString().slice(-4)}`;
      }

      const newInvoice: ArcaInvoice = {
        id,
        tipoComprobante,
        puntoVenta: Number(puntoVenta),
        numeroComprobante: nextNum,
        fecha,
        cuitEmisor: config.cuit,
        razonSocialEmisor: config.razonSocial,
        condicionIvaEmisor: config.condicionIva,
        tipoDocReceptor,
        nroDocReceptor: nroDocReceptor.trim() || '0',
        razonSocialReceptor: razonSocialReceptor.trim(),
        condicionIvaReceptor,
        domicilioReceptor: domicilioReceptor.trim() || undefined,
        codigoCliente: codigoCliente.trim() || undefined,
        condicionVenta: condicionVenta.trim() || undefined,
        remitoPedido: remitoPedido.trim() || undefined,
        moneda,
        cotizacionDolar: moneda === 'USD' ? Number(cotizacionDolar) : undefined,
        items: itemsWithDelivery,
        netoGravado: subtotalNeto,
        ivaTotal: totalIvaCalculated,
        bonificacionTotal: totalBonificacionCalculated,
        percepcionIibb: Number(percepcionIibb || 0),
        importeTotal: totalImporte,
        cae: data.cae,
        vencimientoCae: data.vencimientoCae,
        resultado: 'APROBADO',
        observacionesArca: data.observacionesArca || 'Comprobante Autorizado por ARCA (WSFEv1)',
        qrData: data.qrData,
        cbteAsociadoInfo: cbteAsociadoInfo || undefined,
        rentalId: selectedSourceRentalId || undefined,
        rentalNumero: matchedRentalForEmit ? (matchedRentalForEmit.numeroContrato || matchedRentalForEmit.numero) : undefined,
        rentalIds: selectedSourceRentalId ? [selectedSourceRentalId] : [],
        partesDiariosIds: finalAbsorbedPartesIds,
        origenModulo: resolvedOrigenModulo,
        vinculadoTipo: resolvedVinculadoTipo,
        modalidadEntrega: isEmitNC ? undefined : emitModalidadEntrega,
        estadoEntregaMercaderia: isEmitNC
          ? undefined
          : emitModalidadEntrega === 'ENTREGA_CON_FACTURA'
            ? 'ENTREGADO_TOTAL'
            : 'PENDIENTE_ENTREGA',
        remitosVinculadosIds: [],
        estadoCobro: 'PENDIENTE_PAGO',
        montoCobrado: 0,
        saldoPendiente: totalImporte,
        createdAt: new Date().toISOString()
      };

      const updated = [newInvoice, ...invoices];
      onSaveInvoices(updated);
      void syncAutoClientAfterInvoice({
        codigo: newInvoice.codigoCliente,
        cuit: newInvoice.nroDocReceptor,
        razonSocial: newInvoice.razonSocialReceptor,
        condicionIva: newInvoice.condicionIvaReceptor,
        condicionVenta: newInvoice.condicionVenta,
        domicilio: newInvoice.domicilioReceptor,
        fuente: 'FACTURA_ARCA',
        ultimoComprobante: newInvoice.id,
      });
      propagateNewInvoiceLinks(newInvoice, finalAbsorbedPartesIds);
      if (selectedSourceQuotationId && onMarkQuotationInvoiced) {
        onMarkQuotationInvoiced(selectedSourceQuotationId);
      }
      setIsEmitModalOpen(false);
      setCbteAsociadoInfo(null);
      setSelectedPartesIds([]);
      setSelectedInvoiceForView(newInvoice);
    } catch (err: any) {
      setEmitError(`Error de comunicación con el servicio de ARCA: ${err.message || 'Sin conexión'}. La factura NO fue creada.`);
    } finally {
      setIsAuthorizing(false);
    }
  };

  const confirmDeleteInvoice = async (id: string) => {
    if (onDeleteInvoice) {
      const result = await Promise.resolve(onDeleteInvoice(id));
      if (result === false) return;
    } else {
      const updated = invoices.filter(i => i.id !== id);
      onSaveInvoices(updated);
    }
    setInvoiceToDelete(null);
  };

  const handleSaveConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveArcaConfig(config);
    setPuntoVenta(config.puntoVenta || 7);
    setConfigSavedNotice('Configuración de ARCA (Pto. Vta. Facturas #' + String(config.puntoVenta || 7).padStart(4, '0') + ' y Remitos #' + String(config.puntoVentaRemito || 8).padStart(5, '0') + ') guardada en la nube.');
    setTimeout(() => setConfigSavedNotice(null), 5000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/90 via-slate-900 to-teal-900/60 p-6 border border-emerald-500/20 shadow-2xl backdrop-blur-md">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 rounded-xl border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-wide text-white flex flex-wrap items-center gap-2">
                Facturación & Remitos Digitales ARCA (Ex-AFIP)
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {config.modoProduccion ? 'Modo Producción' : 'Modo Homologación / Testing'}
                </span>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Pto. Vta. Remitos #{String(config.puntoVentaRemito || 8).padStart(5, '0')} Conectado
                </span>
              </h1>
              <p className="text-sm text-slate-300 mt-0.5">
                Emisión oficial de Facturas A/B/NC (Pto. Vta. #{String(config.puntoVenta || 7).padStart(4, '0')}) y Remitos Digitales Clase "R" Cód. 091 (Pto. Vta. #{String(config.puntoVentaRemito || 8).padStart(5, '0')}).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                handleSwitchTab('invoices');
                setCbteAsociadoInfo(null);
                setMoneda('ARS');
                setCotizacionDolar(0);
                setEmitModalidadEntrega('ENTREGA_CON_FACTURA');
                setTipoComprobante('FACTURA_A');
                setIsEmitModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              + Emitir Factura ARCA (A/B/C)
            </button>
            <button
              onClick={() => {
                handleSwitchTab('invoices');
                openExternalInvoiceModal();
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-black bg-orange-600 hover:bg-orange-500 text-white transition shadow-lg shadow-orange-900/40 border border-orange-400/50 flex items-center gap-1.5 cursor-pointer"
              title={
                isVentasScope
                  ? 'Cargar facturas de venta de artículos emitidas en otro sistema anterior (migración) para cobrar y controlar entregas/remitos'
                  : 'Cargar facturas emitidas en otro sistema anterior (migración) para vincularlas con Partes Diarios, Alquileres y Cobranzas'
              }
            >
              <Upload className="w-4 h-4" />
              + Cargar Factura de Otro Sistema
            </button>
            <button
              onClick={() => handleSwitchTab('remitos')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'remitos'
                  ? 'bg-cyan-500 text-slate-950 shadow-cyan-900/40 ring-2 ring-cyan-300'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/30'
              }`}
            >
              <Truck className="w-4 h-4" />
              Remitos & Entregas (Pto. Vta. {String(config.puntoVentaRemito || 8).padStart(5, '0')})
            </button>
            <button
              onClick={() => {
                handleSwitchTab('invoices');
                setCbteAsociadoInfo(null);
                setMoneda('ARS');
                setCotizacionDolar(0);
                setTipoComprobante('NOTA_CREDITO_B');
                setIsEmitModalOpen(true);
              }}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition shadow-lg shadow-purple-900/30 flex items-center gap-1.5 cursor-pointer"
              title="Emitir Nota de Crédito oficial (NC A/B/C) para anular o bonificar una factura"
            >
              <PlusCircle className="w-4 h-4" />
              + Nota de Crédito
            </button>
            <button
              onClick={() => setIsClientDirectoryOpen(true)}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] transition border border-[#F0C800]/40 flex items-center gap-1.5 cursor-pointer"
              title="Ver agenda de clientes, dar de alta manualmente o editar fichas"
            >
              <Users className="w-4 h-4" />
              Clientes / Alta Cliente
            </button>
            <button
              onClick={handleSyncMissingFromArca}
              disabled={isSyncingMissingArca}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-sky-600/20 hover:bg-sky-600/35 text-sky-300 transition border border-sky-500/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              title="Consultar ARCA / AFIP y recuperar comprobantes autorizados (A, B, C, NC) que falten en el historial"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingMissingArca ? 'animate-spin' : ''}`} />
              {isSyncingMissingArca ? 'Consultando ARCA...' : 'Recuperar desde ARCA'}
            </button>
            <button
              onClick={() => setIsCalibratorOpen(true)}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700 flex items-center gap-1.5 cursor-pointer"
              title="Ajustar posiciones X, Y y tamaños de fuente en tiempo real"
            >
              <Sliders className="w-4 h-4 text-emerald-400" />
              Calibrador A4
            </button>
            <button
              onClick={() => handleSwitchTab(activeTab === 'config' ? 'invoices' : 'config')}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-4 h-4 text-emerald-400" />
              {activeTab === 'config' ? 'Ver Comprobantes' : 'Configurar Puntos de Venta'}
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="relative z-10 flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-emerald-500/20">
          <button
            onClick={() => handleSwitchTab('invoices')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'invoices'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-950/50'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 border border-slate-700/80'
            }`}
          >
            <FileText className="w-4 h-4" />
            Facturas y Notas de Crédito (Pto. Vta. #{String(config.puntoVenta || 7).padStart(4, '0')})
          </button>
          <button
            onClick={() => handleSwitchTab('remitos')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'remitos'
                ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/50'
                : 'bg-slate-900/80 text-cyan-300 hover:bg-slate-800 border border-cyan-500/30'
            }`}
          >
            <Truck className="w-4 h-4" />
            Remitos & Control de Entregas (Pto. Vta. #{String(config.puntoVentaRemito || 8).padStart(5, '0')})
          </button>
          <button
            onClick={() => handleSwitchTab('config')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'config'
                ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/50'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 border border-slate-700/80'
            }`}
          >
            <Settings className="w-4 h-4" />
            Configurar Puntos de Venta (7 y 8) & Certificados
          </button>
        </div>

        {syncMissingNotice && (
          <div
            className={`relative z-10 mt-3 px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
              syncMissingNotice.type === 'ok'
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                : syncMissingNotice.type === 'error'
                ? 'bg-red-950/80 border-red-500/50 text-red-200'
                : 'bg-sky-950/80 border-sky-500/50 text-sky-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {syncMissingNotice.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : syncMissingNotice.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
              )}
              <span>{syncMissingNotice.text}</span>
            </div>
            <button
              onClick={() => setSyncMissingNotice(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
              title="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Comprobantes Registrados</span>
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{metrics.totalCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">{metrics.aprobadas} emitidas aquí con CAE</div>
          {metrics.migradasOtroSistema > 0 && (
            <div className="text-[11px] text-orange-400 font-bold mt-0.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {metrics.migradasOtroSistema} de otro sistema (migradas)
            </div>
          )}
        </div>

        <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Facturación Total Emitida</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{formatCurrency(metrics.totalMonto, 'ARS')}</div>
          {metrics.totalMontoUsd !== 0 && (
            <div className="text-xs font-black text-amber-400 mt-0.5">+ {formatCurrency(metrics.totalMontoUsd, 'USD')}</div>
          )}
          <div className="text-[11px] text-slate-500 mt-1">Suma neta (deduciendo NC)</div>
        </div>

        <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>IVA Débito Fiscal</span>
            <FileText className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-teal-300">{formatCurrency(metrics.totalIva, 'ARS')}</div>
          {metrics.totalIvaUsd !== 0 && (
            <div className="text-xs font-black text-amber-300 mt-0.5">+ {formatCurrency(metrics.totalIvaUsd, 'USD')}</div>
          )}
          <div className="text-[11px] text-slate-500 mt-1">A declarar ante ARCA</div>
        </div>

        <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Puntos de Venta Conectados</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-sm font-black text-emerald-400 flex items-center gap-1.5 mt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            Facturas: #{String(config.puntoVenta || 7).padStart(4, '0')} | Remitos: #{String(config.puntoVentaRemito || 8).padStart(5, '0')}
          </div>
          <div className="text-[11px] text-cyan-400 mt-1 font-semibold">WSFEv1 + Remito Digital R (Cód. 091)</div>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'remitos' ? (
        <ArcaRemitosPanel
          config={config}
          onUpdateConfig={(newConfig) => {
            setConfig(newConfig);
            saveArcaConfig(newConfig);
          }}
          quotations={quotations}
          rentals={rentals}
          invoices={invoices}
          onSaveInvoices={onSaveInvoices}
          clients={allAvailableClients}
          hardwareProducts={hardwareProducts}
          fleet={fleet}
          drivers={drivers}
          obras={obras}
          activeModuleScope={activeModuleScope}
          preselectedInvoiceForRemito={preselectedInvoiceForRemito}
          onClearPreselectedInvoiceForRemito={() => setPreselectedInvoiceForRemito(null)}
        />
      ) : activeTab === 'invoices' ? (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-3.5 shadow-xl">
          {/* Module Scope Filter Bar (Ventas vs Alquileres vs Ver Todo) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
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
                ? 'Mostrando facturación conjunta de Ventas y Alquileres'
                : moduleScopeFilter === 'VENTAS_SALON'
                  ? 'Mostrando facturación de Ventas (Salón) · Tocá "Ver Todo" para ver también Alquileres'
                  : 'Mostrando facturación de Alquileres · Tocá "Ver Todo" para ver también Ventas'}
            </span>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por cliente, CUIT, número de factura o CAE..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 transition"
              >
                <option value="ALL">Todos los Comprobantes</option>
                <option value="OTRO_SISTEMA">⚠️ Solo Migradas de Otro Sistema</option>
                <option value="ESTE_SISTEMA">Solo Emitidas en Este Sistema</option>
                <option value="FACTURA_A">Factura A (ARCA)</option>
                <option value="FACTURA_B">Factura B (ARCA)</option>
                <option value="FACTURA_C">Factura C (ARCA)</option>
                <option value="FACTURA_X">Factura X (Control Interno)</option>
                <option value="NOTAS_CREDITO">Todas las Notas de Crédito (NC A/B/C/X)</option>
                <option value="NOTA_CREDITO_A">Nota de Crédito A</option>
                <option value="NOTA_CREDITO_B">Nota de Crédito B</option>
                <option value="NOTA_CREDITO_C">Nota de Crédito C</option>
                <option value="NOTA_CREDITO_X">Nota de Crédito X</option>
              </select>

              <button
                onClick={() => exportArcaInvoicesToCSV(scopedInvoices)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 border border-slate-700"
              >
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </button>
            </div>
          </div>



          {/* Invoices Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                  <th className="py-3 px-4">COMPROBANTE</th>
                  <th className="py-3 px-4">FECHA</th>
                  <th className="py-3 px-4">RECEPTOR / CLIENTE</th>
                  <th className="py-3 px-3">
                    {moduleScopeFilter === 'VENTAS_SALON'
                      ? 'ENTREGAS / REMITOS & COBRO'
                      : 'VÍNCULOS, ENTREGAS & COBRO'}
                  </th>
                  <th className="py-3 px-3 text-center">CAE & VTO</th>
                  <th className="py-3 px-3 text-right">IMPORTE TOTAL</th>
                  <th className="py-3 px-4 text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      No hay comprobantes emitidos con este filtro. Haga clic en <strong>"+ Emitir Factura ARCA"</strong> o <strong>"+ Emitir Nota de Crédito"</strong> para generar un comprobante.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map(inv => {
                    const isNC = inv.tipoComprobante.startsWith('NOTA_CREDITO');
                    const isExternal = isExternalMigratedInvoice(inv);
                    const isInternal = !isExternal && (inv.tipoComprobante === 'FACTURA_X' || inv.tipoComprobante === 'NOTA_CREDITO_X');
                    const resolved = resolvedLinksByInvoiceId.get(inv.id);
                    const rowNCs = creditNotesByInvoiceId.get(inv.id) || [];
                    const hasCreditNote = !isNC && rowNCs.length > 0;
                    const invReceipts = receiptsByInvoiceId.get(inv.id) || [];
                    const invNCs = rowNCs;
                    const totalPaymentsCount = invReceipts.length + invNCs.length;
                    const totalPaidByReceipts = invReceipts.reduce((acc, r) => acc + Number(r.totalImputado || r.montoCobrado || 0), 0);
                    const totalByNCs = invNCs.reduce((acc, nc) => acc + Number(nc.importeTotal || 0), 0);
                    const totalInvAmt = Number(inv.importeTotal || 0);
                    const effectiveCobrado = Math.max(Number(inv.montoCobrado || 0), totalPaidByReceipts + totalByNCs);
                    const isFullyAnnulledByNC = totalInvAmt > 0 && totalByNCs >= totalInvAmt - 0.01 && totalPaidByReceipts <= 0;
                    const effectiveEstado: 'ANULADA_NC' | 'PAGADO' | 'PARCIAL' | 'PENDIENTE_PAGO' =
                      isFullyAnnulledByNC
                        ? 'ANULADA_NC'
                        : resolved?.estadoCobro === 'PAGADO' || (totalInvAmt > 0 && effectiveCobrado >= totalInvAmt - 0.01)
                        ? 'PAGADO'
                        : resolved?.estadoCobro === 'PARCIAL' || effectiveCobrado > 0
                        ? 'PARCIAL'
                        : 'PENDIENTE_PAGO';

                    return (
                      <tr
                        key={inv.id}
                        className={`transition-colors ${
                          isExternal
                            ? 'bg-orange-950/25 border-l-4 border-l-orange-500 hover:bg-orange-950/40'
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3.5 px-4 font-mono">
                          <div className="font-bold text-white text-sm flex flex-wrap items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-xs border ${
                              isExternal
                                ? 'bg-orange-500/25 text-orange-200 border-orange-400/60'
                                : isNC
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                  : isInternal
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            }`}>
                              {inv.tipoComprobante.replace(/_/g, ' ')}
                            </span>
                            <span>{String(inv.puntoVenta).padStart(4, '0')}-{String(inv.numeroComprobante).padStart(8, '0')}</span>
                          </div>
                          {isExternal && (
                            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/25 border border-orange-400/70 text-orange-200 font-sans font-black text-[10px] tracking-wide uppercase">
                              <AlertTriangle className="w-3 h-3 text-orange-400 shrink-0" />
                              OTRO SISTEMA • NO EMITIDA AQUÍ
                            </div>
                          )}
                          {isExternal && inv.sistemaOrigenNombre && (
                            <div className="text-[10px] text-orange-300/90 font-sans font-semibold mt-0.5">
                              Origen: {inv.sistemaOrigenNombre}
                            </div>
                          )}
                          {inv.cbteAsociadoInfo && (() => {
                            const linkedFactura = isNC ? findAssociatedInvoiceForCreditNote(inv) : null;
                            const assocLabel = `${inv.cbteAsociadoInfo.tipoComprobante.replace(/_/g, ' ')} #${String(inv.cbteAsociadoInfo.puntoVenta).padStart(4, '0')}-${String(inv.cbteAsociadoInfo.numeroComprobante).padStart(8, '0')}`;
                            return linkedFactura ? (
                              <button
                                type="button"
                                onClick={() => handleViewInvoice(linkedFactura)}
                                className="text-[10px] text-purple-300 hover:text-white hover:underline font-sans mt-0.5 flex items-center gap-1 cursor-pointer text-left"
                                title={`Abrir factura asociada ${assocLabel}`}
                              >
                                <Eye className="w-3 h-3 shrink-0 text-purple-400" />
                                <span>Anula/Descuenta a: {assocLabel}</span>
                              </button>
                            ) : (
                              <div className="text-[10px] text-purple-300 font-sans mt-0.5">
                                Anula/Descuenta a: {assocLabel}
                              </div>
                            );
                          })()}
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>CUIT Emisor: {inv.cuitEmisor}</span>
                            {moduleScopeFilter === 'ALL' && (
                              <span className={`font-sans font-semibold ${
                                resolveInvoiceModule(inv) === 'VENTAS_SALON' ? 'text-amber-300' : 'text-sky-400'
                              }`}>
                                • {resolveInvoiceModule(inv) === 'VENTAS_SALON' ? 'Ventas' : 'Alquileres'}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                            {inv.fecha}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white">{inv.razonSocialReceptor}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {inv.tipoDocReceptor}: {inv.nroDocReceptor} ({inv.condicionIvaReceptor.replace(/_/g, ' ')})
                          </div>
                        </td>

                        {/* Columna Vínculos (Contrato de Alquiler / Partes Diarios) & Estado de Cobro */}
                        <td className="py-3.5 px-3">
                          <div className="flex flex-wrap items-center gap-1">
                                {resolved && resolved.linkedRentals.length > 0 ? (
                                  resolved.linkedRentals.map(r => (
                                    <button
                                      type="button"
                                      key={r.id}
                                      onClick={() => openRentalReference(inv, r)}
                                      className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/35 text-[10px] font-mono font-black cursor-pointer hover:bg-indigo-500/35 hover:text-white transition flex items-center gap-1"
                                      title={`Ver Contrato de Alquiler: ${r.numeroContrato || r.numero} (${r.clienteNombre})`}
                                    >
                                      <span>🔗 {r.numeroContrato || r.numero}</span>
                                    </button>
                                  ))
                                ) : inv.rentalNumero ? (
                                  <button
                                    type="button"
                                    onClick={() => openRentalReference(inv, null)}
                                    className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/35 text-[10px] font-mono font-black cursor-pointer hover:bg-indigo-500/35 hover:text-white transition"
                                    title={`Ver Contrato de Alquiler ${inv.rentalNumero}`}
                                  >
                                    🔗 {inv.rentalNumero}
                                  </button>
                                ) : null}

                                {resolved && resolved.linkedPartes.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => openPartesReference(inv, resolved.linkedPartes)}
                                    className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35 text-[10px] font-mono font-black cursor-pointer hover:bg-amber-500/35 hover:text-white transition"
                                    title={`Ver Partes Diarios vinculados: ${resolved.linkedPartes.map(p => `#${p.numParte}`).join(', ')}`}
                                  >
                                    📋 {resolved.linkedPartes.length} {resolved.linkedPartes.length === 1 ? 'Parte' : 'Partes'}
                                  </button>
                                )}

                                {!isNC && (
                                  <button
                                    type="button"
                                    onClick={() => setRefPaymentsModalInvoice(inv)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-black border cursor-pointer transition hover:brightness-110 ${
                                      effectiveEstado === 'ANULADA_NC'
                                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                        : effectiveEstado === 'PAGADO'
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        : effectiveEstado === 'PARCIAL'
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                    }`}
                                    title={
                                      totalPaymentsCount > 0
                                        ? `Click para ver ${invReceipts.length} recibo(s) / ${invNCs.length} NC asociada(s) (Imputado: ${formatCurrency(effectiveCobrado, inv.moneda)})`
                                        : 'Click para ver detalle de cobranza y pagos asociados'
                                    }
                                  >
                                    {effectiveEstado === 'ANULADA_NC'
                                      ? '✓ ANULADA (NC)'
                                      : effectiveEstado === 'PAGADO'
                                      ? '✓ PAGADO'
                                      : effectiveEstado === 'PARCIAL'
                                      ? '⏳ PAGO PARCIAL'
                                      : '⏳ PENDIENTE PAGO'}
                                    {totalPaymentsCount > 0 ? ` (${totalPaymentsCount})` : ''}
                                  </button>
                                )}

                                {isNC && (() => {
                                  const linkedFactura = findAssociatedInvoiceForCreditNote(inv);
                                  if (!linkedFactura) return null;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleViewInvoice(linkedFactura)}
                                      className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/35 text-[10px] font-mono font-bold cursor-pointer transition flex items-center gap-1"
                                      title={`Abrir factura asociada ${formatInvoiceLabel(linkedFactura)}`}
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>{formatInvoiceLabel(linkedFactura)}</span>
                                    </button>
                                  );
                                })()}

                                {totalPaymentsCount > 0 && !isNC && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (invReceipts.length === 0 && invNCs.length === 1) {
                                        handleViewInvoice(invNCs[0]);
                                      } else {
                                        setRefPaymentsModalInvoice(inv);
                                      }
                                    }}
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition flex items-center gap-1 border ${
                                      invReceipts.length > 0
                                        ? 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/35'
                                        : 'bg-purple-500/15 hover:bg-purple-500/30 text-purple-300 border-purple-500/35'
                                    }`}
                                    title={
                                      invReceipts.length === 0 && invNCs.length === 1
                                        ? `Abrir ${formatInvoiceLabel(invNCs[0])}`
                                        : 'Ver detalle de recibos / notas de crédito imputadas a esta factura'
                                    }
                                  >
                                    {invReceipts.length > 0 ? `💵 ${invReceipts.length} ${invReceipts.length === 1 ? 'Pago' : 'Pagos'}` : `🟣 Ver ${invNCs.length} NC`}
                                  </button>
                                )}

                                {!isNC && (() => {
                                  const invMode = inv.modalidadEntrega || 'ENTREGA_CON_FACTURA';
                                  const totalQty = (inv.items || []).reduce((acc, it) => acc + Number(it.cantidad || 0), 0);
                                  const deliveredQty = (inv.items || []).reduce(
                                    (acc, it) =>
                                      acc +
                                      (typeof it.cantidadEntregada === 'number'
                                        ? it.cantidadEntregada
                                        : invMode === 'ENTREGA_CON_REMITOS'
                                          ? 0
                                          : Number(it.cantidad || 0)),
                                    0
                                  );
                                  const pendingQty = Math.max(0, Number((totalQty - deliveredQty).toFixed(2)));
                                  const deliveryStatus =
                                    inv.estadoEntregaMercaderia ||
                                    (invMode === 'ENTREGA_CON_FACTURA'
                                      ? 'ENTREGADO_TOTAL'
                                      : pendingQty <= 0.001
                                        ? 'ENTREGADO_TOTAL'
                                        : deliveredQty > 0
                                          ? 'ENTREGA_PARCIAL'
                                          : 'PENDIENTE_ENTREGA');

                                  if (deliveryStatus === 'PENDIENTE_ENTREGA' || deliveryStatus === 'ENTREGA_PARCIAL') {
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPreselectedInvoiceForRemito(inv);
                                          handleSwitchTab('remitos');
                                        }}
                                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-black border cursor-pointer transition flex items-center gap-1 ${
                                          deliveryStatus === 'ENTREGA_PARCIAL'
                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/35'
                                            : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/45 hover:bg-cyan-500/35'
                                        }`}
                                        title={`Entrega con Remitos · Entregado: ${deliveredQty} de ${totalQty} · Pendiente: ${pendingQty}. Click para emitir remito.`}
                                      >
                                        <Truck className="w-3 h-3" />
                                        <span>
                                          {deliveryStatus === 'ENTREGA_PARCIAL'
                                            ? `PARCIAL (${deliveredQty}/${totalQty})`
                                            : `PEND. REMITO (${pendingQty})`}
                                        </span>
                                      </button>
                                    );
                                  }

                                  if (invMode === 'ENTREGA_CON_REMITOS') {
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => handleSwitchTab('remitos')}
                                        className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 text-[10px] font-mono font-bold cursor-pointer hover:bg-emerald-500/30 transition flex items-center gap-1"
                                        title="Todos los ítems de esta factura fueron entregados mediante Remitos"
                                      >
                                        <PackageCheck className="w-3 h-3" />
                                        <span>ENTREGADO c/ REMITOS</span>
                                      </button>
                                    );
                                  }

                                  return (
                                    <span
                                      className="px-2 py-0.5 rounded bg-slate-800/80 text-emerald-300/90 border border-slate-700 text-[10px] font-mono font-bold flex items-center gap-1"
                                      title="Mercadería entregada al momento de facturar"
                                    >
                                      <PackageCheck className="w-3 h-3" />
                                      <span>ENTREGADO c/ FACT.</span>
                                    </span>
                                  );
                                })()}

                                {moduleScopeFilter !== 'VENTAS_SALON' && (
                                  <button
                                    type="button"
                                    onClick={() => openInvoiceLinkModal(inv)}
                                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                                    title="Vincular o editar Contratos de Alquiler y Partes Diarios de esta Factura"
                                  >
                                    <Link2 className="w-3 h-3" />
                                    <span>Vincular</span>
                                  </button>
                                )}
                              </div>
                        </td>

                        <td className="py-3.5 px-3 text-center font-mono">
                          {isExternal ? (
                            <div className="inline-flex flex-col items-center px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-500/40">
                              <span className="text-orange-300 font-black text-[10px] uppercase">NO EMITIDA EN ESTE SISTEMA</span>
                              <span className="text-[10px] text-orange-200/80 font-sans">
                                {inv.sistemaOrigenNombre || 'Sistema Anterior'}
                              </span>
                              {inv.cae && inv.cae !== 'MIGRADA-OTRO-SISTEMA' && (
                                <span className="text-[9px] text-slate-400 mt-0.5">CAE hist: {inv.cae}</span>
                              )}
                            </div>
                          ) : isInternal ? (
                            <div>
                              <span className="text-amber-400 font-bold text-xs">CONTROL INTERNO</span>
                              <div className="text-[10px] text-slate-500">Sin envío a ARCA</div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-emerald-400 font-bold">{inv.cae}</div>
                              <div className="text-[10px] text-slate-500">Vto: {inv.vencimientoCae}</div>
                            </div>
                          )}
                        </td>

                        <td className={`py-3.5 px-3 text-right font-black text-sm whitespace-nowrap ${isNC ? 'text-purple-400' : 'text-emerald-400'}`}>
                          <div>
                            {isNC ? `- ${formatCurrency(inv.importeTotal, inv.moneda)}` : formatCurrency(inv.importeTotal, inv.moneda)}
                          </div>
                          {inv.moneda === 'USD' && (
                            <div className="text-[10px] font-mono text-amber-300 mt-0.5">
                              USD{inv.cotizacionDolar ? ` • TC $${inv.cotizacionDolar.toLocaleString('es-AR')}` : ''}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isNC && invReceipts.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setRefPaymentsModalInvoice(inv)}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-black transition text-xs font-bold flex items-center gap-1 border border-amber-500/45 shadow-sm cursor-pointer"
                                title="Ver recibos de pago y comprobantes adjuntos"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                {invReceipts.length > 1 ? `Ver Recibos (${invReceipts.length})` : 'Ver Recibo'}
                              </button>
                            )}
                            {!isNC && !hasCreditNote && effectiveEstado !== 'PAGADO' && effectiveEstado !== 'ANULADA_NC' && onNavigateToCobranzas && (
                              <button
                                onClick={onNavigateToCobranzas}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-600 hover:text-white transition text-xs font-bold flex items-center gap-1 border border-emerald-500/30 cursor-pointer"
                                title="Ir a Cobranzas para bajar/cobrar esta factura y emitir recibo"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                Cobrar / Bajar
                              </button>
                            )}
                            {!isNC && !hasCreditNote && (
                              <button
                                onClick={() => handlePrepareCreditNote(inv)}
                                className="px-2.5 py-1.5 rounded-lg bg-purple-500/15 text-purple-300 hover:bg-purple-600 hover:text-white transition text-xs font-bold flex items-center gap-1 border border-purple-500/30 cursor-pointer"
                                title="Emitir Nota de Crédito para anular o abonar esta factura"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                                Anular / NC
                              </button>
                            )}
                            <button
                              onClick={() => handleViewInvoice(inv)}
                              className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition cursor-pointer"
                              title="Ver Comprobante con QR ARCA y Auditoría en Vivo"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setInvoiceToDelete(inv)}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition cursor-pointer"
                              title="Eliminar Comprobante"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
      ) : (
        /* TAB: Configuration & Certificate */
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-6 shadow-xl max-w-3xl mx-auto">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-400" />
              Configuración de Conexión Web Service ARCA (WSFEv1)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Ingrese los datos de CUIT, Punto de Venta autorizado y pruebe la conectividad con los servidores de ARCA / AFIP.
            </p>
          </div>

          <form onSubmit={handleSaveConfigSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">CUIT Emisor *</label>
                <input
                  type="text"
                  required
                  value={config.cuit}
                  onChange={(e) => setConfig({ ...config, cuit: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  placeholder="30-71629451-9"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Razón Social *</label>
                <input
                  type="text"
                  required
                  value={config.razonSocial}
                  onChange={(e) => setConfig({ ...config, razonSocial: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-emerald-400 mb-1">Punto de Venta Facturas (WSFEv1) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={config.puntoVenta}
                  onChange={(e) => setConfig({ ...config, puntoVenta: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
                <span className="text-[10px] text-slate-500">Ej: 7 (CAE - Facturas A / B / Notas de Crédito)</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-400 mb-1">Punto de Venta Remitos R (Cód. 091) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={config.puntoVentaRemito || 8}
                  onChange={(e) => setConfig({ ...config, puntoVentaRemito: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-cyan-500/40 rounded-xl px-3 py-2 text-sm text-cyan-300 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                />
                <span className="text-[10px] text-cyan-400/80">Punto de Venta 8 (#00008 - Remito Digital ARCA)</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-400 mb-1">N° CAI Remito Digital (Factuweb ARCA)</label>
                <input
                  type="text"
                  placeholder="Ej: 75123456789012 (14 dígitos)"
                  value={config.caiRemito || ''}
                  onChange={(e) => setConfig({ ...config, caiRemito: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-400 mb-1">Vencimiento CAI Remito</label>
                <input
                  type="date"
                  value={config.vencimientoCaiRemito || ''}
                  onChange={(e) => setConfig({ ...config, vencimientoCaiRemito: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Condición IVA</label>
                <select
                  value={config.condicionIva}
                  onChange={(e) => setConfig({ ...config, condicionIva: e.target.value as ArcaCondicionIva })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                  <option value="MONOTRIBUTO">Monotributo</option>
                  <option value="EXENTO">Exento</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-bold text-white text-sm">Modo de Operación ARCA</div>
                <div className="text-xs text-slate-400">
                  {config.modoProduccion ? 'Conectado a Servidores de Producción ARCA' : 'Homologación / Testing WSDL (Pruebas sin valor fiscal)'}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.modoProduccion}
                  onChange={(e) => setConfig({ ...config, modoProduccion: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* STEP-BY-STEP ARCA CERTIFICATES WIZARD */}
            <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h4 className="font-bold text-white text-sm">Certificados Digitales para Facturación</h4>
                    <p className="text-[11px] text-slate-400">Genera la clave privada y la solicitud oficial (.csr) para autorizar en ARCA / AFIP</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {config.privateKey && config.certificate ? (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Credenciales Listas
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      Pendiente Certificado
                    </span>
                  )}
                </div>
              </div>

              {/* Step 1: Private Key & CSR */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <div className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                      Clave Privada (.key) y Solicitud (.csr)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Si ya tienes el archivo <b>.key</b> con el que tramitaste tu certificado en AFIP, cárgalo aquí. O presiona <b>Generar Clave y CSR</b> para crear una nueva clave RSA y su solicitud oficial.
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer border border-slate-700 shadow-sm">
                      <Download className="w-3.5 h-3.5 text-amber-400 rotate-180" />
                      {config.privateKey ? 'Cargar otro .key' : 'Cargar archivo .key'}
                      <input
                        type="file"
                        accept=".key,.pem,.txt"
                        onChange={handleUploadKey}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleGenerateKeys}
                      disabled={isGeneratingCert || !config.cuit}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-md shadow-emerald-950"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {isGeneratingCert ? 'Generando...' : config.privateKey ? 'Generar Nuevo Par y CSR' : 'Generar Clave y CSR'}
                    </button>
                  </div>
                </div>

                {config.privateKey && (
                  <div className="p-2.5 bg-slate-950/80 rounded-lg text-[11px] font-mono text-slate-300 flex items-center justify-between border border-slate-800">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <Check className="w-3.5 h-3.5" /> Clave Privada RSA 2048-bit activa en sistema
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadFile(config.privateKey!, `lahormiga_${config.cuit.replace(/\D/g, '')}.key`, 'text/plain')}
                      className="text-amber-400 hover:underline flex items-center gap-1 font-sans text-xs font-bold"
                    >
                      <Download className="w-3 h-3" /> Descargar .key
                    </button>
                  </div>
                )}

                {certGenMessage && (
                  <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${certGenMessage.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'}`}>
                    {certGenMessage.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                    <span>{certGenMessage.message}</span>
                  </div>
                )}

                {config.csr && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => downloadFile(config.csr!, `solicitud_arca_${config.cuit.replace(/\D/g, '')}.csr`, 'text/plain')}
                      className="px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 text-xs font-bold rounded-lg transition flex items-center gap-1.5 border border-emerald-500/40 shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      Descargar archivo .csr (Subir este archivo en AFIP si generas nuevo certificado)
                    </button>
                  </div>
                )}
              </div>

              {/* Step 2: Upload CRT from ARCA */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">2</span>
                      Certificado Digital (.crt) emitido por ARCA / AFIP
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Carga el archivo <b>.crt</b> entregado por AFIP en "Administración de Certificados Digitales".
                    </p>
                  </div>

                  <label className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md shadow-blue-950">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {config.certificate ? 'Cambiar Certificado (.crt)' : 'Cargar Certificado (.crt)'}
                    <input
                      type="file"
                      accept=".crt,.cer,.pem,.txt"
                      onChange={handleUploadCrt}
                      className="hidden"
                    />
                  </label>
                </div>

                {config.certificate && (
                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-xs space-y-1 font-mono">
                    <div className="text-emerald-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Certificado X.509 Cargado en el Sistema
                      </span>
                      <button
                        type="button"
                        onClick={() => downloadFile(config.certificate!, `certificado_${config.cuit.replace(/\D/g, '')}.crt`, 'text/plain')}
                        className="text-blue-400 hover:underline flex items-center gap-1 font-sans text-xs font-bold"
                      >
                        <Download className="w-3 h-3" /> Descargar .crt
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Guía Rápida ARCA */}
              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1.5">
                <div className="font-bold text-emerald-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  ¿Cómo vincular con AFIP / ARCA si tienes error de claves?
                </div>
                <div className="text-slate-400">
                  • <b>Opción 1:</b> Si ya tienes tu certificado (ej: <i>SistemaLahormiga</i>) y guardaste su archivo <b>.key</b> en tu PC, haz clic en <b>"Cargar archivo .key"</b> arriba y selecciona ese archivo.
                </div>
                <div className="text-slate-400">
                  • <b>Opción 2:</b> Si no tienes el .key original, haz clic en <b>"Generar Nuevo Par y CSR"</b>, descarga el <b>.csr</b>, entra a <a href="https://auth.afip.gob.ar" target="_blank" rel="noreferrer" className="text-emerald-400 underline font-semibold">afip.gob.ar</a> &gt; <i>"Administración de Certificados Digitales"</i> &gt; <i>"Agregar Alias"</i> (o <i>Renovar</i>), sube el .csr, descarga el nuevo <b>.crt</b> y cárgalo en el Paso 2.
                </div>
                <div className="text-slate-400">
                  • En <b>"Administrador de Relaciones de Clave Fiscal"</b>, asegúrate de que el servicio <b>"Facturación Electrónica"</b> esté asignado a ese alias.
                </div>
              </div>
            </div>

            {/* Test Connection Box */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-xs">Prueba de Conectividad WSAA / WSFEv1</div>
                  <div className="text-[11px] text-slate-400">Verifica el certificado digital `.crt` y la clave privada `.key`</div>
                </div>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5"
                >
                  {isTestingConnection ? 'Verificando...' : 'Probar Conexión ARCA'}
                </button>
              </div>

              {testResult && (
                <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${testResult.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'}`}>
                  {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-800">
              {configSavedNotice ? (
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  {configSavedNotice}
                </div>
              ) : <div />}
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-900/30 cursor-pointer"
              >
                Guardar Configuración
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Emitir Factura Electrónica */}
      {isEmitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Emitir Comprobante Electrónico ARCA (WSFEv1)
              </h3>
              <button onClick={() => setIsEmitModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEmitInvoice} className="p-6 space-y-5 max-h-[86vh] overflow-y-auto">
              {/* LLAMAR / IMPORTAR DESDE COTIZACIÓN O CONTRATO DE ALQUILER (COMPRIMIDO POR DEFECTO) */}
              {!tipoComprobante.startsWith('NOTA_CREDITO') && (
                <div className="p-3.5 bg-gradient-to-r from-amber-500/10 via-slate-950 to-emerald-500/10 border border-[#F0C800]/40 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="text-xs font-black text-[#F0C800] flex items-center gap-1.5 uppercase tracking-wider">
                        <Link2 className="w-4 h-4 text-[#F0C800] shrink-0" />
                        {isVentasScope ? 'Llamar Cotización de Ventas' : 'Llamar Documento (Cotización / Alquiler / Partes)'}
                      </span>
                      {(selectedSourceQuotationId || (!isVentasScope && (selectedSourceRentalId || selectedPartesIds.length > 0))) && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[11px] font-bold">
                          ✓ {[
                            selectedSourceQuotationId ? 'Cotización' : '',
                            !isVentasScope && selectedSourceRentalId ? 'Contrato' : '',
                            !isVentasScope && selectedPartesIds.length > 0 ? `${selectedPartesIds.length} Parte(s)` : ''
                          ].filter(Boolean).join(' + ')} vinculado(s)
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsImportSourceExpanded(prev => !prev)}
                      className="px-3 py-1.5 rounded-lg bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] border border-[#F0C800]/40 text-xs font-black flex items-center gap-1.5 transition cursor-pointer shrink-0"
                    >
                      {isImportSourceExpanded ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          <span>Comprimir</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          <span>{isVentasScope ? 'Desplegar Cotizaciones' : 'Desplegar Llamar Documento'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isImportSourceExpanded && (
                  <>

                  <div className={`grid grid-cols-1 ${isVentasScope ? '' : 'md:grid-cols-2'} gap-3`}>
                    {/* Selector 1: Llamar Cotización */}
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        {isVentasScope ? 'Llamar Cotización / Presupuesto de Ventas:' : '1. Llamar Cotización Emitida (Ej: N.G.A. Construcciones S.R.L.):'}
                      </span>
                      <select
                        value={selectedSourceQuotationId}
                        onChange={e => {
                          const qId = e.target.value;
                          if (!qId) {
                            setSelectedSourceQuotationId('');
                            return;
                          }
                          const found = dbQuotations.find(q => q.id === qId);
                          if (found) applyQuotationToInvoice(found);
                        }}
                        className="w-full bg-slate-900 border border-[#F0C800]/50 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-[#F0C800] cursor-pointer"
                      >
                        <option value="">
                          -- Seleccionar Cotización ({dbQuotations.length} en BD) --
                        </option>
                        {dbQuotations.map(q => {
                          const num = `${String(q.puntoVenta).padStart(4, '0')}-${String(q.numeroComprobante).padStart(8, '0')}`;
                          return (
                            <option key={q.id} value={q.id}>
                              COT #{num} — {q.razonSocialReceptor} ({q.cuitReceptor || 'S/CUIT'}) — {formatCurrency(q.importeTotal, q.monedaExpresada)} [{q.estado}]
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Selector 2: Llamar Contrato de Alquiler (solo en Alquileres) */}
                    {!isVentasScope && (
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        2. O Llamar Contrato de Alquiler de Equipos:
                      </span>
                      <select
                        value={selectedSourceRentalId}
                        onChange={e => {
                          const rId = e.target.value;
                          if (!rId) {
                            setSelectedSourceRentalId('');
                            return;
                          }
                          const found = dbRentals.find(r => r.id === rId);
                          if (found) applyRentalToInvoice(found);
                        }}
                        className="w-full bg-slate-900 border border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-emerald-400 cursor-pointer"
                      >
                        <option value="">
                          -- Seleccionar Contrato de Alquiler ({dbRentals.length} en BD) --
                        </option>
                        {dbRentals.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.numeroContrato || r.numero} {r.cotizacionNumero ? `(COT ${r.cotizacionNumero})` : ''} — {r.clienteNombre} — {r.equipoModelo} — {formatCurrency(r.totalAlquiler || r.totalGeneral || 0, r.moneda)}
                          </option>
                        ))}
                      </select>
                    </div>
                    )}
                  </div>

                  {/* Selector 3: Vincular Partes Diarios a esta Factura (solo en Alquileres) */}
                  {!isVentasScope && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-indigo-300 uppercase flex items-center gap-1.5 flex-wrap">
                        <ClipboardList className="w-3.5 h-3.5 text-indigo-400" />
                        3. Partes Diarios vinculados / absorbidos ({selectedPartesIds.length} seleccionados)
                        {selectedSourceRentalId && (() => {
                          const rObj = dbRentals.find(r => r.id === selectedSourceRentalId) || rentals.find(r => r.id === selectedSourceRentalId);
                          const cnt = rObj ? getPartesIdsForRental(rObj).length : 0;
                          return cnt > 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-[9px] normal-case">
                              {cnt} absorbido(s) del contrato {rObj?.numeroContrato || rObj?.numero}
                            </span>
                          ) : null;
                        })()}
                      </span>
                      <input
                        type="text"
                        value={parteSearchInModal}
                        onChange={(e) => setParteSearchInModal(e.target.value)}
                        placeholder="Filtrar parte por N°, obra, equipo u operador..."
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-white w-64 focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div className="max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                      {partesDiarios
                        .filter(p => {
                          const q = parteSearchInModal.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            (p.numParte || '').toLowerCase().includes(q) ||
                            (p.obra || '').toLowerCase().includes(q) ||
                            (p.marcaModelo || '').toLowerCase().includes(q) ||
                            (p.codigoEquipo || '').toLowerCase().includes(q) ||
                            (p.nombreApellido || '').toLowerCase().includes(q) ||
                            (p.rentalNumero || '').toLowerCase().includes(q)
                          );
                        })
                        .slice()
                        .sort((a, b) => Number(selectedPartesIds.includes(b.id)) - Number(selectedPartesIds.includes(a.id)))
                        .slice(0, 40)
                        .map(p => {
                          const checked = selectedPartesIds.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer transition ${
                                checked
                                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200 font-bold'
                                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    setSelectedPartesIds(prev =>
                                      prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                    );
                                  }}
                                  className="rounded accent-indigo-500"
                                />
                                <span className="font-mono text-amber-300">#{p.numParte}</span>
                                <span className="truncate">{p.fecha} • {p.obra} • {p.marcaModelo || p.codigoEquipo}</span>
                              </div>
                              <span className="font-mono text-[10px] text-slate-400 shrink-0">
                                {p.horasTrabajadas ? `${p.horasTrabajadas}h` : p.viajesCantidad ? `${p.viajesCantidad}v` : ''}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                  )}
                  </>
                  )}
                </div>
              )}

              {/* Selective Call / Search for an Issued Invoice to Cancel/Credit */}
              {tipoComprobante.startsWith('NOTA_CREDITO') && (
                <div className="p-3.5 bg-slate-950 border border-purple-500/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-purple-300 flex items-center gap-1.5 uppercase tracking-wide">
                      <Search className="w-4 h-4 text-purple-400" />
                      Llamar / Seleccionar Factura Emitida para Anular o Descontar:
                    </label>
                    {cbteAsociadoInfo && (
                      <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                        ✓ Factura Cargada
                      </span>
                    )}
                  </div>

                  <select
                    value={cbteAsociadoInfo?.idInvoice || ''}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (!selectedId) {
                        setCbteAsociadoInfo(null);
                        return;
                      }
                      const foundInv = invoices.find(i => i.id === selectedId);
                      if (foundInv) {
                        handlePrepareCreditNote(foundInv);
                      }
                    }}
                    className="w-full bg-slate-900 border border-purple-500/50 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-purple-400 cursor-pointer"
                  >
                    <option value="">-- Buscar / Seleccionar una Factura Emitida --</option>
                    {invoices
                      .filter(i => i.tipoComprobante.startsWith('FACTURA'))
                      .map(inv => (
                        <option key={inv.id} value={inv.id}>
                          {inv.tipoComprobante.replace('_', ' ')} #{String(inv.puntoVenta).padStart(4, '0')}-{String(inv.numeroComprobante).padStart(8, '0')} — {inv.razonSocialReceptor} (Doc: {inv.nroDocReceptor}) — Total: {formatCurrency(inv.importeTotal, inv.moneda)} ({inv.fecha})
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-slate-400">
                    Al seleccionar una factura, se cargarán automáticamente los datos del cliente, CUIT, ítems y la referencia fiscal exigida por ARCA.
                  </p>
                </div>
              )}

              {cbteAsociadoInfo && (
                <div className="p-3 bg-purple-500/15 border border-purple-500/40 rounded-xl text-xs text-purple-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                    <div>
                      <span className="font-bold">Comprobante Asociado a Anular/Descontar:</span>{' '}
                      <span className="font-mono text-purple-300 font-bold">{cbteAsociadoInfo.tipoComprobante.replace('_', ' ')} #{String(cbteAsociadoInfo.puntoVenta).padStart(4, '0')}-{String(cbteAsociadoInfo.numeroComprobante).padStart(8, '0')}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCbteAsociadoInfo(null)}
                    className="text-purple-400 hover:text-white text-xs font-bold underline cursor-pointer"
                  >
                    Desvincular
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Tipo de Comprobante *</label>
                  <select
                    value={tipoComprobante}
                    onChange={(e) => setTipoComprobante(e.target.value as ArcaTipoComprobante)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-bold"
                  >
                    <option value="FACTURA_A">Factura A (Responsable Inscripto)</option>
                    <option value="FACTURA_B">Factura B (Consumidor Final / Monotributo)</option>
                    <option value="FACTURA_C">Factura C (Monotributo / Exento)</option>
                    <option value="FACTURA_X">Factura X (Control Interno - Sin ARCA)</option>
                    <option value="NOTA_CREDITO_A">Nota de Crédito A (ARCA)</option>
                    <option value="NOTA_CREDITO_B">Nota de Crédito B (ARCA)</option>
                    <option value="NOTA_CREDITO_C">Nota de Crédito C (ARCA)</option>
                    <option value="NOTA_CREDITO_X">Nota de Crédito X (Control Interno)</option>
                  </select>

                  {tipoComprobante === 'FACTURA_X' && (
                    <div className="mt-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-amber-200">Factura X (Control Interno):</div>
                        <div className="text-[11px] text-amber-300/90 mt-0.5">Comprobante de uso propio / autoventa. <b>No se enviará a ARCA/AFIP</b> ni requerirá validación fiscal. Se guardará de inmediato en el sistema.</div>
                      </div>
                    </div>
                  )}

                  {tipoComprobante === 'NOTA_CREDITO_X' && (
                    <div className="mt-2 p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-lg text-xs text-purple-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-purple-200">Nota de Crédito X (Control Interno):</div>
                        <div className="text-[11px] text-purple-300/90 mt-0.5">Nota de Crédito interna para anular o descontar Facturas X. <b>No se enviará a ARCA/AFIP</b>.</div>
                      </div>
                    </div>
                  )}

                  {tipoComprobante.startsWith('NOTA_CREDITO') && tipoComprobante !== 'NOTA_CREDITO_X' && (
                    <div className="mt-2 p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-lg text-xs text-purple-300 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-purple-200">Nota de Crédito Oficial ARCA:</div>
                        <div className="text-[11px] text-purple-300/90 mt-0.5">Se transmitirá a ARCA en WSFEv1 informando el CbtesAsoc (Factura asociada) para obtener CAE oficial.</div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Punto de Venta *</label>
                  <input
                    type="number"
                    required
                    value={puntoVenta}
                    onChange={(e) => setPuntoVenta(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-emerald-400">
                      N° Comprobante Actual {nextVoucherInfo.source === 'INTERNO' ? '(Interno)' : '(ARCA)'}
                    </label>
                    <button
                      type="button"
                      onClick={fetchNextVoucherNumber}
                      disabled={nextVoucherInfo.loading}
                      title="Consultar último número autorizado en ARCA"
                      className="text-slate-400 hover:text-emerald-400 transition cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${nextVoucherInfo.loading ? 'animate-spin text-emerald-400' : ''}`} />
                    </button>
                  </div>
                  <div className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-sm font-mono font-black text-emerald-400 flex items-center justify-between gap-2">
                    <span className="truncate">
                      {nextVoucherInfo.loading
                        ? 'Consultando ARCA...'
                        : nextVoucherInfo.nextNum !== null
                          ? `${String(puntoVenta || 0).padStart(4, '0')}-${String(nextVoucherInfo.nextNum).padStart(8, '0')}`
                          : 'No disponible'}
                    </span>
                    {!nextVoucherInfo.loading && nextVoucherInfo.lastNum !== null && (
                      <span className="text-[10px] font-normal text-slate-400 shrink-0">
                        Últ: {nextVoucherInfo.lastNum}
                      </span>
                    )}
                  </div>
                  {nextVoucherInfo.source === 'ERROR' && nextVoucherInfo.error && (
                    <p className="text-[10px] text-amber-400 mt-1 truncate" title={nextVoucherInfo.error}>
                      {nextVoucherInfo.error}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Fecha Emisión *</label>
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Moneda & Cotización ARCA (PES / DOL) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Moneda del Comprobante *</label>
                  <select
                    value={moneda}
                    onChange={(e) => {
                      const nextMoneda = e.target.value as 'ARS' | 'USD';
                      setMoneda(nextMoneda);
                      if (nextMoneda === 'USD' && cotizacionDolar <= 0) {
                        fetchAfipDollarRate();
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="ARS">PESOS ARGENTINOS ($ ARS / PES)</option>
                    <option value="USD">DÓLARES ESTADOUNIDENSES (US$ USD / DOL)</option>
                  </select>
                </div>

                {moneda === 'USD' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-amber-400 mb-1">
                        Cotización Dólar BNA / AFIP ($ ARS){tipoComprobante === 'FACTURA_X' || tipoComprobante === 'NOTA_CREDITO_X' ? ' (opc.)' : ' *'}
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={cotizacionDolar || ''}
                          onChange={(e) => setCotizacionDolar(parseFloat(e.target.value) || 0)}
                          placeholder="Ej: 1180.50"
                          className="w-full bg-slate-900 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onClick={fetchAfipDollarRate}
                          disabled={isFetchingCotiz}
                          className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] font-bold shrink-0 cursor-pointer disabled:opacity-50"
                          title="Consultar cotización oficial del dólar en WSFEv1 AFIP"
                        >
                          {isFetchingCotiz ? '...' : 'Cotiz. AFIP'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col justify-end">
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-xs">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Equivalente Fiscal ARS</span>
                        <span className="text-emerald-400 font-mono font-black">
                          {cotizacionDolar > 0 ? formatCurrency(totalImporte * cotizacionDolar, 'ARS') : 'Sin cotización'}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Receptor Details (Cuadro Cliente) */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Datos del Cliente (Encabezado Comprobante)</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsClientDirectoryOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50 text-[11px] font-black cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Llamar Cliente (BD)
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClientSuggestions(prev => !prev)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-[#F0C800] border border-slate-700 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                    >
                      <Search className="w-3 h-3" />
                      {showClientSuggestions ? 'Ocultar Lista' : `Buscar Rápido (${allAvailableClients.length})`}
                    </button>
                  </div>
                </div>

                {showClientSuggestions && allAvailableClients.length > 0 && (
                  <div className="bg-slate-900 border border-[#F0C800]/40 rounded-xl p-2 space-y-1 max-h-44 overflow-y-auto">
                    {allAvailableClients
                      .filter(c => {
                        const q = razonSocialReceptor.trim().toUpperCase();
                        if (!q || q === 'CONSUMIDOR FINAL') return true;
                        return (c.razonSocial || '').toUpperCase().includes(q) || (c.cuit || '').includes(q) || (c.codigo || '').toUpperCase().includes(q);
                      })
                      .slice(0, 12)
                      .map((c, i) => (
                        <button
                          key={`${c.id || c.cuit}-${i}`}
                          type="button"
                          onClick={() => applyClientRecordToInvoice(c)}
                          className="w-full text-left px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-xs cursor-pointer"
                        >
                          <div>
                            {c.codigo && <span className="mr-2 font-mono text-emerald-400 font-bold">{c.codigo}</span>}
                            <span className="font-bold text-white">{c.razonSocial}</span>
                            {c.cuit && <span className="ml-2 font-mono text-[#F0C800]">CUIT: {c.cuit}</span>}
                          </div>
                          <span className="text-[10px] text-emerald-400 font-bold">Cargar Cliente</span>
                        </button>
                      ))}
                  </div>
                )}
                
                {/* Row 1: CODIGO | CLIENTE */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-3">
                    <label className="block text-xs font-semibold text-slate-400 mb-1">CÓDIGO CLIENTE</label>
                    <input
                      type="text"
                      value={codigoCliente}
                      onChange={(e) => setCodigoCliente(e.target.value)}
                      placeholder="Ej: CLI-001"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-9">
                    <label className="block text-xs font-semibold text-slate-400 mb-1">CLIENTE / RAZÓN SOCIAL *</label>
                    <input
                      type="text"
                      required
                      value={razonSocialReceptor}
                      onChange={(e) => {
                        setRazonSocialReceptor(e.target.value);
                        setShowClientSuggestions(true);
                      }}
                      placeholder="Empresa o Cliente S.A. (Escriba para buscar en Base de Datos)"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-bold"
                    />
                  </div>
                </div>

                {/* Row 2: CUIT | CONDICIÓN DE VENTA | CONDICIÓN FRENTE AL IVA */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-400">C.U.I.T. / DNI</label>
                      {isSearchingCuit && (
                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                          Buscando Padrón...
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={nroDocReceptor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNroDocReceptor(val);
                          const clean = val.replace(/\D/g, '');
                          if (clean.length === 11 && lastLookedUpDocRef.current !== clean) {
                            handleCuitLookup(clean);
                          } else if (clean.length > 11) {
                            setCuitLookupNotice({
                              type: 'warn',
                              text: `El CUIT tiene ${clean.length} dígitos (debe tener 11).`
                            });
                          } else if (clean.length < 11) {
                            setCuitLookupNotice(null);
                          }
                        }}
                        onBlur={(e) => {
                          const clean = e.target.value.replace(/\D/g, '');
                          if (clean.length >= 7 && clean.length <= 11 && lastLookedUpDocRef.current !== clean) {
                            handleCuitLookup(clean);
                          } else if (clean.length > 11) {
                            handleCuitLookup(clean);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCuitLookup(nroDocReceptor, true);
                          }
                        }}
                        placeholder="Ej: 30714999822 o DNI"
                        className={`w-full bg-slate-900 border rounded-lg px-3 py-1.5 pr-8 text-xs text-white font-mono focus:outline-none ${
                          cuitLookupNotice?.type === 'warn'
                            ? 'border-amber-500/60 focus:border-amber-400'
                            : 'border-slate-800 focus:border-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => handleCuitLookup(nroDocReceptor, true)}
                        title="Buscar en Padrón ARCA"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {cuitLookupNotice && (
                      <p className={`mt-1 text-[10px] truncate ${cuitLookupNotice.type === 'warn' ? 'text-amber-400' : 'text-emerald-400'}`} title={cuitLookupNotice.text}>
                        {cuitLookupNotice.text}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">CONDICIÓN DE VENTA</label>
                    <input
                      type="text"
                      value={condicionVenta}
                      onChange={(e) => setCondicionVenta(e.target.value)}
                      placeholder="CONTADO / CTA CTE / TRANSF"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white uppercase font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">CONDICIÓN FRENTE AL IVA</label>
                    <select
                      value={condicionIvaReceptor}
                      onChange={(e) => setCondicionIvaReceptor(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-semibold"
                    >
                      <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                      <option value="MONOTRIBUTO">Monotributo</option>
                      <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
                      <option value="EXENTO">Exento</option>
                    </select>
                  </div>
                </div>

                {/* Row 3: DOMICILIO | REMITO/PEDIDO */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-400 mb-1">DOMICILIO</label>
                    <input
                      type="text"
                      value={domicilioReceptor}
                      onChange={(e) => setDomicilioReceptor(e.target.value)}
                      placeholder="Av. Alte. Brown 1560, San Salvador de Jujuy"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">REMITO / PEDIDO Nº</label>
                    <input
                      type="text"
                      value={remitoPedido}
                      onChange={(e) => setRemitoPedido(e.target.value)}
                      placeholder="Ej: REM-00124"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Items Table Form */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    {isVentasScope ? 'Detalle de Artículos Vendidos (Tabla de Factura)' : 'Detalle de Productos / Servicios (Tabla de Factura)'}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {hardwareProducts.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) addHardwareProductToEmitItems(e.target.value);
                        }}
                        className="bg-slate-900 border border-[#F0C800]/50 rounded-lg px-2.5 py-1 text-xs text-[#F0C800] font-bold cursor-pointer max-w-[260px]"
                      >
                        <option value="">+ Agregar artículo del catálogo ({hardwareProducts.length})...</option>
                        {hardwareProducts.map(prod => (
                          <option key={prod.id} value={prod.id}>
                            {prod.codigoInterno || prod.codigo || ''} — {prod.nombre} (${Number(prod.precioVenta || prod.precioCosto || 0).toLocaleString('es-AR')})
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                    >
                      + Agregar Ítem
                    </button>
                  </div>
                </div>

                {/* Header Labels matching Form Table */}
                <div className="hidden lg:grid grid-cols-[72px_minmax(220px,1fr)_82px_110px_135px_76px_84px_145px_32px] gap-2.5 text-[10px] font-bold text-slate-400 uppercase px-3 py-2 bg-slate-950/80 rounded-lg border border-slate-800/80 items-center">
                  <div className="text-center">Código</div>
                  <div className="text-left">Producto / Servicio</div>
                  <div className="text-center">Cant.</div>
                  <div className="text-center">U. Medida</div>
                  <div className="text-right">Precio Unit. ({moneda === 'USD' ? 'US$' : '$'})</div>
                  <div className="text-center">% Bonif.</div>
                  <div className="text-center">IVA %</div>
                  <div className="text-right">Subtotal ({moneda === 'USD' ? 'US$' : '$'})</div>
                  <div />
                </div>

                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 lg:grid-cols-[72px_minmax(220px,1fr)_82px_110px_135px_76px_84px_145px_32px] gap-2.5 bg-slate-950 p-2.5 rounded-xl border border-slate-800 items-center text-xs"
                    >
                      {/* Código */}
                      <div className="col-span-3 lg:col-span-1">
                        <span className="lg:hidden block text-[10px] text-slate-500 mb-0.5">Código</span>
                        <input
                          type="text"
                          value={item.codigo || ''}
                          onChange={(e) => handleUpdateItem(idx, 'codigo', e.target.value)}
                          placeholder="01"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-center"
                          title="Código de ítem"
                        />
                      </div>

                      {/* Producto / Servicio */}
                      <div className="col-span-9 lg:col-span-1">
                        <span className="lg:hidden block text-[10px] text-slate-500 mb-0.5">Producto / Servicio</span>
                        <input
                          type="text"
                          required
                          value={item.descripcion}
                          onChange={(e) => handleUpdateItem(idx, 'descripcion', e.target.value)}
                          placeholder="Descripción del producto o servicio..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-medium"
                        />
                      </div>

                      {/* Cantidad */}
                      <div className="col-span-4 lg:col-span-1">
                        <span className="lg:hidden block text-[10px] text-slate-500 mb-0.5">Cant.</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0.01}
                          value={item.cantidad}
                          onChange={(e) => handleUpdateItem(idx, 'cantidad', Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-center"
                          title="Cantidad"
                        />
                      </div>

                      {/* U. Medida */}
                      <div className="col-span-4 lg:col-span-1">
                        <span className="lg:hidden block text-[10px] text-slate-500 mb-0.5">U. Medida</span>
                        <select
                          value={item.unidadMedida || 'unidades'}
                          onChange={(e) => handleUpdateItem(idx, 'unidadMedida', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
                        >
                          <option value="unidades">unidades</option>
                          <option value="Hs">Hs</option>
                          <option value="Días">Días</option>
                          <option value="Global">Global</option>
                          <option value="Mes">Mes</option>
                          <option value="m3">m3</option>
                          <option value="Tn">Tn</option>
                          <option value="Km">Km</option>
                        </select>
                      </div>

                      {/* Precio Unitario */}
                      <div className="col-span-4 lg:col-span-1">
                        <span className="lg:hidden block text-[10px] text-slate-500 mb-0.5">Precio Unit.</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={item.precioUnitario}
                          onChange={(e) => handleUpdateItem(idx, 'precioUnitario', Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-right"
                          title="Precio Unitario"
                        />
                      </div>

                      {/* % Bonif. */}
                      <div className="col-span-4 lg:col-span-1">
                        <span className="lg:hidden block text-[10px] text-slate-500 mb-0.5">% Bonif.</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.bonificacionPorcentaje || 0}
                          onChange={(e) => handleUpdateItem(idx, 'bonificacionPorcentaje', Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-center"
                          title="% Bonificación"
                        />
                      </div>

                      {/* IVA % */}
                      <div className="col-span-4 lg:col-span-1">
                        <span className="lg:hidden block text-[10px] text-slate-500 mb-0.5">IVA %</span>
                        <select
                          value={item.alicuotaIva ?? 21}
                          onChange={(e) => handleUpdateItem(idx, 'alicuotaIva', Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-1.5 py-1.5 text-xs text-white font-mono text-center"
                          title="Alícuota IVA"
                        >
                          <option value={21}>21%</option>
                          <option value={10.5}>10.5%</option>
                          <option value={27}>27%</option>
                          <option value={0}>0%</option>
                        </select>
                      </div>

                      {/* Subtotal */}
                      <div className="col-span-3 lg:col-span-1 text-right">
                        <span className="lg:hidden block text-[10px] text-slate-500 mb-0.5">Subtotal</span>
                        <div className="font-mono font-bold text-xs text-emerald-400 whitespace-nowrap pr-1">
                          {formatCurrency(item.subtotal, moneda)}
                        </div>
                      </div>

                      {/* Delete */}
                      <div className="col-span-1 lg:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-900 transition cursor-pointer"
                          title="Eliminar ítem"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modalidad de Entrega de Mercadería (Factura vs Remitos) */}
              {!tipoComprobante.startsWith('NOTA_CREDITO') && (
                <div className="bg-slate-950 p-4 rounded-xl border border-cyan-500/35 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-cyan-400" />
                      Modalidad de Entrega de los Artículos *
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Controla si los ítems quedan Entregados o Pendientes de Remito
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEmitModalidadEntrega('ENTREGA_CON_FACTURA')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                        emitModalidadEntrega === 'ENTREGA_CON_FACTURA'
                          ? 'bg-emerald-500/15 border-emerald-400 ring-2 ring-emerald-400/25'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <PackageCheck className={`w-5 h-5 shrink-0 mt-0.5 ${emitModalidadEntrega === 'ENTREGA_CON_FACTURA' ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <div>
                        <div className={`text-xs font-black ${emitModalidadEntrega === 'ENTREGA_CON_FACTURA' ? 'text-emerald-300' : 'text-slate-200'}`}>
                          Entrega con Factura
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          El cliente retira/recibe todo ahora con la factura. Todos los ítems pasan directo a <b>Entregados</b>.
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEmitModalidadEntrega('ENTREGA_CON_REMITOS')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                        emitModalidadEntrega === 'ENTREGA_CON_REMITOS'
                          ? 'bg-cyan-500/15 border-cyan-400 ring-2 ring-cyan-400/25'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <Truck className={`w-5 h-5 shrink-0 mt-0.5 ${emitModalidadEntrega === 'ENTREGA_CON_REMITOS' ? 'text-cyan-400' : 'text-slate-500'}`} />
                      <div>
                        <div className={`text-xs font-black ${emitModalidadEntrega === 'ENTREGA_CON_REMITOS' ? 'text-cyan-300' : 'text-slate-200'}`}>
                          Entrega con Remitos (Total o Parcial)
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Los ítems quedan en <b>Pendientes de Entrega</b> en la sección Remitos hasta emitir el/los remitos.
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Totals Summary Box */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                {/* Son Pesos / Dólares Preview */}
                <div className="sm:col-span-6 flex flex-col justify-end p-2 bg-slate-900/60 rounded-lg border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">IMPORTE EN LETRAS:</span>
                  <span className="font-bold text-emerald-400 text-xs mt-0.5">{numeroALetras(totalImporte, moneda)}</span>
                </div>

                {/* Breakdown */}
                <div className="sm:col-span-6 space-y-1.5 text-right font-mono text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Importe Neto Gravado:</span>
                    <span className="text-white font-bold">{formatCurrency(subtotalNeto, moneda)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Bonificación Total:</span>
                    <span className="text-amber-400 font-bold">-{formatCurrency(totalBonificacionCalculated, moneda)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>IVA Total (21% / 10.5%):</span>
                    <span className="text-white font-bold">{formatCurrency(totalIvaCalculated, moneda)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>PERCEP. IIBB ({moneda === 'USD' ? 'US$' : '$'}):</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={percepcionIibb}
                      onChange={(e) => setPercepcionIibb(Number(e.target.value))}
                      className="w-28 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-right text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex justify-between text-sm font-black text-emerald-400 pt-2 border-t border-slate-800">
                    <span>IMPORTE TOTAL ({moneda}):</span>
                    <span>{formatCurrency(totalImporte, moneda)}</span>
                  </div>
                </div>
              </div>

              {/* Error Banner if ARCA rejects */}
              {emitError && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-red-200">ARCA / AFIP Rechazó la Solicitud:</div>
                    <div className="mt-0.5">{emitError}</div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEmitModalOpen(false)}
                  disabled={isAuthorizing}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAuthorizing}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50 text-white transition shadow-lg flex items-center gap-1.5 cursor-pointer ${
                    tipoComprobante === 'FACTURA_X' 
                      ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-950' 
                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  {tipoComprobante === 'FACTURA_X' 
                    ? 'Emitir Factura X (Control Interno)' 
                    : isAuthorizing ? 'Consultando ARCA (WSFEv1)...' : 'Autorizar y Emitir en ARCA (CAE)'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Ver Factura con QR ARCA */}
      {selectedInvoiceForView && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className={`px-6 py-4 flex items-center justify-between ${
              isExternalMigratedInvoice(selectedInvoiceForView)
                ? 'bg-orange-950 text-orange-100 border-b border-orange-500/40'
                : 'bg-slate-900 text-white'
            }`}>
              <div className="flex items-center gap-2">
                {isExternalMigratedInvoice(selectedInvoiceForView) ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0" />
                    <span className="font-black text-sm uppercase tracking-wide">
                      Factura Cargada de Otro Sistema (No emitida en este facturador)
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <span className="font-bold text-sm">Comprobante Autorizado por ARCA</span>
                  </>
                )}
              </div>
              <button onClick={() => setSelectedInvoiceForView(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[85vh] overflow-y-auto font-sans bg-slate-950">
              {isExternalMigratedInvoice(selectedInvoiceForView) && (
                <div className="bg-orange-500/20 border-2 border-orange-400/70 rounded-xl p-3.5 text-orange-100 flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-orange-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5">
                    <div className="font-black uppercase tracking-wide text-orange-300 text-sm">
                      ⚠️ COMPROBANTE EXTERNO / MIGRADO — NO EMITIDO POR ESTE SISTEMA
                    </div>
                    <p className="text-orange-100/90">
                      Origen declarado: <strong>{selectedInvoiceForView.sistemaOrigenNombre || 'Sistema Anterior (Migración)'}</strong>. Se registró manualmente para ordenar cuentas corrientes, cobranzas, contratos y Partes Diarios.
                    </p>
                  </div>
                </div>
              )}
              {/* Vínculos Comerciales (Contratos de Alquiler y Partes Diarios) y Estado de Cobro */}
              {(() => {
                const resolvedView = resolvedLinksByInvoiceId.get(selectedInvoiceForView.id);
                return (
                  <div className="bg-slate-900 border border-indigo-500/35 rounded-xl p-3.5 space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {(() => {
                        const viewReceipts = receiptsByInvoiceId.get(selectedInvoiceForView.id) || [];
                        const viewNCs = creditNotesByInvoiceId.get(selectedInvoiceForView.id) || [];
                        const viewIsNC = selectedInvoiceForView.tipoComprobante.startsWith('NOTA_CREDITO');
                        const linkedFacturaForView = viewIsNC ? findAssociatedInvoiceForCreditNote(selectedInvoiceForView) : null;
                        const viewTotalReceipts = viewReceipts.reduce((acc, r) => acc + Number(r.totalImputado || r.montoCobrado || 0), 0);
                        const viewTotalNCs = viewNCs.reduce((acc, nc) => acc + Number(nc.importeTotal || 0), 0);
                        const viewTotalAmt = Number(selectedInvoiceForView.importeTotal || 0);
                        const viewEffectiveCobrado = Math.max(Number(selectedInvoiceForView.montoCobrado || 0), viewTotalReceipts + viewTotalNCs);
                        const viewIsAnnulledByNC = !viewIsNC && viewTotalAmt > 0 && viewTotalNCs >= viewTotalAmt - 0.01 && viewTotalReceipts <= 0;
                        const viewEstado: 'ANULADA_NC' | 'PAGADO' | 'PARCIAL' | 'PENDIENTE_PAGO' =
                          viewIsAnnulledByNC
                            ? 'ANULADA_NC'
                            : resolvedView?.estadoCobro === 'PAGADO' || (viewTotalAmt > 0 && viewEffectiveCobrado >= viewTotalAmt - 0.01)
                            ? 'PAGADO'
                            : resolvedView?.estadoCobro === 'PARCIAL' || viewEffectiveCobrado > 0
                            ? 'PARCIAL'
                            : 'PENDIENTE_PAGO';

                        return (
                          <>
                            <span className="font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                              <Link2 className="w-4 h-4 text-indigo-400" />
                              {viewIsNC
                                ? 'Vínculos de la Nota de Crédito (Factura Asociada & Referencias)'
                                : 'Vínculos de la Factura (Contratos de Alquiler & Partes Diarios)'}
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              {viewIsNC && linkedFacturaForView && (
                                <button
                                  type="button"
                                  onClick={() => handleViewInvoice(linkedFacturaForView)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition shadow-sm"
                                  title={`Abrir factura asociada ${formatInvoiceLabel(linkedFacturaForView)}`}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Abrir {formatInvoiceLabel(linkedFacturaForView)}
                                </button>
                              )}
                              {!viewIsNC && viewNCs.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleViewInvoice(viewNCs[0])}
                                  className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition shadow-sm"
                                  title={`Abrir ${formatInvoiceLabel(viewNCs[0])}`}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Abrir {formatInvoiceLabel(viewNCs[0])}
                                </button>
                              )}
                              {!viewIsNC && (
                                <span className={`px-2.5 py-0.5 rounded-md font-mono font-black text-[10px] border ${
                                  viewEstado === 'ANULADA_NC'
                                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                    : viewEstado === 'PAGADO'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : viewEstado === 'PARCIAL'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                }`}>
                                  {viewEstado === 'ANULADA_NC'
                                    ? '✓ ANULADA POR NC'
                                    : viewEstado === 'PAGADO'
                                    ? '✓ PAGADO / COBRADO'
                                    : viewEstado === 'PARCIAL'
                                    ? '⏳ PAGO PARCIAL'
                                    : '⏳ PENDIENTE DE PAGO'}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => openInvoiceLinkModal(selectedInvoiceForView)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer"
                              >
                                🔗 Editar Vínculos / Estado
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-[11px]">
                      <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5">
                        <div className="text-[10px] text-indigo-300 font-bold uppercase mb-1">
                          Contratos de Alquiler Vinculados ({resolvedView?.linkedRentals.length || 0})
                        </div>
                        {resolvedView && resolvedView.linkedRentals.length > 0 ? (
                          <div className="space-y-1">
                            {resolvedView.linkedRentals.map(r => (
                              <button
                                type="button"
                                key={r.id}
                                onClick={() => openRentalReference(selectedInvoiceForView, r)}
                                className="w-full text-left text-slate-200 hover:text-white hover:bg-indigo-500/15 px-1.5 py-1 rounded flex items-center justify-between gap-2 transition cursor-pointer"
                                title="Click para abrir detalle del Contrato de Alquiler"
                              >
                                <span className="truncate">🔗 <strong>{r.numeroContrato || r.numero}</strong> • {r.obraDestino}</span>
                                <span className="text-emerald-400 shrink-0">${Number(r.totalGeneral || r.totalAlquiler || 0).toLocaleString('es-AR')}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 font-sans">Sin contratos vinculados</span>
                        )}
                      </div>

                      <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-amber-300 font-bold uppercase">
                            Partes Diarios Vinculados ({resolvedView?.linkedPartes.length || 0})
                          </span>
                          {resolvedView && resolvedView.linkedPartes.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setRefPartesModalData({ invoice: selectedInvoiceForView, partes: resolvedView.linkedPartes })}
                              className="text-[10px] text-amber-400 hover:underline font-sans cursor-pointer"
                            >
                              Ver lista
                            </button>
                          )}
                        </div>
                        {resolvedView && resolvedView.linkedPartes.length > 0 ? (
                          <div className="space-y-1 max-h-24 overflow-y-auto">
                            {resolvedView.linkedPartes.map(p => (
                              <button
                                type="button"
                                key={p.id}
                                onClick={() => setRefSingleParteToView(p)}
                                className="w-full text-left text-slate-200 hover:text-white hover:bg-amber-500/15 px-1.5 py-1 rounded flex items-center justify-between gap-2 transition cursor-pointer"
                                title="Click para ver detalle del Parte Diario"
                              >
                                <span className="truncate">📋 <strong>Parte #{p.numParte}</strong> ({p.fecha}) • {p.marcaModelo || p.codigoEquipo}</span>
                                <span className="text-amber-300 shrink-0">{p.horasTrabajadas ? `${p.horasTrabajadas}h` : p.viajesCantidad ? `${p.viajesCantidad}v` : p.tipo}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 font-sans">Sin partes diarios vinculados</span>
                        )}
                      </div>

                      <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5">
                        {(() => {
                          const viewIsNC = selectedInvoiceForView.tipoComprobante.startsWith('NOTA_CREDITO');
                          const linkedFactura = viewIsNC ? findAssociatedInvoiceForCreditNote(selectedInvoiceForView) : null;
                          const detailReceipts = receiptsByInvoiceId.get(selectedInvoiceForView.id) || [];
                          const detailNCs = creditNotesByInvoiceId.get(selectedInvoiceForView.id) || [];
                          if (viewIsNC) {
                            return (
                              <>
                                <div className="text-[10px] text-purple-300 font-bold uppercase mb-1">
                                  Factura Asociada (Anulada / Descontada)
                                </div>
                                {linkedFactura ? (
                                  <button
                                    type="button"
                                    onClick={() => handleViewInvoice(linkedFactura)}
                                    className="w-full text-left text-emerald-200 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 transition cursor-pointer"
                                    title={`Click para abrir ${formatInvoiceLabel(linkedFactura)}`}
                                  >
                                    <span className="truncate flex items-center gap-1.5">
                                      <Eye className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                      <strong>{formatInvoiceLabel(linkedFactura)}</strong>
                                    </span>
                                    <span className="text-emerald-300 shrink-0 font-bold">{formatCurrency(linkedFactura.importeTotal, linkedFactura.moneda)}</span>
                                  </button>
                                ) : selectedInvoiceForView.cbteAsociadoInfo ? (
                                  <span className="text-slate-400 font-sans">
                                    {selectedInvoiceForView.cbteAsociadoInfo.tipoComprobante.replace(/_/g, ' ')} #{String(selectedInvoiceForView.cbteAsociadoInfo.puntoVenta).padStart(4, '0')}-{String(selectedInvoiceForView.cbteAsociadoInfo.numeroComprobante).padStart(8, '0')} (no cargada en BD)
                                  </span>
                                ) : (
                                  <span className="text-slate-500 font-sans">Sin factura asociada</span>
                                )}
                              </>
                            );
                          }
                          return (
                            <>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-emerald-300 font-bold uppercase">
                                  Pagos / NC Asociadas ({detailReceipts.length + detailNCs.length})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setRefPaymentsModalInvoice(selectedInvoiceForView)}
                                  className="text-[10px] text-emerald-400 hover:underline font-sans cursor-pointer"
                                >
                                  Ver detalle
                                </button>
                              </div>
                              {detailReceipts.length > 0 || detailNCs.length > 0 ? (
                                <div className="space-y-1 max-h-24 overflow-y-auto">
                                  {detailReceipts.map(rec => (
                                    <button
                                      type="button"
                                      key={rec.id}
                                      onClick={() => setRefPaymentsModalInvoice(selectedInvoiceForView)}
                                      className="w-full text-left text-slate-200 hover:text-white hover:bg-emerald-500/15 px-1.5 py-1 rounded flex items-center justify-between gap-2 transition cursor-pointer"
                                    >
                                      <span className="truncate">💵 <strong>Rec. {rec.numeroRecibo}</strong> ({rec.fecha})</span>
                                      <span className="text-emerald-400 shrink-0">{formatCurrency(rec.totalImputado || rec.montoCobrado, rec.moneda)}</span>
                                    </button>
                                  ))}
                                  {detailNCs.map(nc => (
                                    <button
                                      type="button"
                                      key={nc.id}
                                      onClick={() => handleViewInvoice(nc)}
                                      className="w-full text-left text-purple-200 hover:text-white bg-purple-500/10 hover:bg-purple-500/25 border border-purple-500/25 px-1.5 py-1 rounded flex items-center justify-between gap-2 transition cursor-pointer"
                                      title={`Click para abrir ${formatInvoiceLabel(nc)}`}
                                    >
                                      <span className="truncate flex items-center gap-1">
                                        <Eye className="w-3 h-3 text-purple-300 shrink-0" />
                                        <strong>{formatInvoiceLabel(nc)}</strong>
                                      </span>
                                      <span className="text-purple-300 shrink-0">-{formatCurrency(nc.importeTotal, nc.moneda)}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setRefPaymentsModalInvoice(selectedInvoiceForView)}
                                  className="text-slate-500 hover:text-emerald-300 font-sans text-left cursor-pointer"
                                >
                                  Sin recibos imputados (ver estado de cobro)
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* View Mode Toggle Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-emerald-400" />
                  Formato de Impresión del Comprobante:
                </span>
                <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setInvoiceViewMode('IMAGE_TEMPLATE')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                      invoiceViewMode === 'IMAGE_TEMPLATE'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    📄 Hoja Base Original (Imagen A4)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceViewMode('VECTOR_HTML')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                      invoiceViewMode === 'VECTOR_HTML'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    📐 Formulario Vectorial HTML
                  </button>
                </div>
              </div>

              {/* OPTION 1: Full Original Image Template Overlay Mode (A4 Sheet Background with Text Overlays) */}
              {invoiceViewMode === 'IMAGE_TEMPLATE' ? (
                <div ref={viewContainerRef} id="invoice-printable-area" className="relative w-full max-w-2xl aspect-[1/1.4145] mx-auto border border-slate-300 rounded-none overflow-hidden bg-white select-none">
                  {/* Print-specific style override */}
                  <style>{`
                    @media print {
                      body * {
                        visibility: hidden !important;
                      }
                      #invoice-printable-area, #invoice-printable-area * {
                        visibility: visible !important;
                      }
                      #invoice-printable-area {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        border: none !important;
                        box-shadow: none !important;
                      }
                    }
                  `}</style>

                  {/* Base Original A4 Image Template (A / B / X / NCA / NCB) */}
                  {(() => {
                    const tplInfo = getInvoiceTemplateForType(selectedInvoiceForView.tipoComprobante);
                    const isInternalX = tplInfo.templateKind === 'X';
                    const isBTemplate = tplInfo.templateKind === 'B';
                    const isNcTemplate = tplInfo.templateKind === 'NCA' || tplInfo.templateKind === 'NCB';
                    const isOfficialJpgTemplate = isNcTemplate || isBTemplate;
                    const isCreditNote = selectedInvoiceForView.tipoComprobante.startsWith('NOTA_CREDITO_');
                    const fbStep = templateFallbackStep[tplInfo.primary] || 0;
                    const activeTemplateSrc = fbStep === 0 ? tplInfo.primary : fbStep === 1 ? tplInfo.fallback : INVOICE_TEMPLATE_IMAGE_CDN;
                    const afipTipoCode = selectedInvoiceForView.tipoComprobante === 'FACTURA_A' ? '001'
                      : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_A' ? '003'
                      : selectedInvoiceForView.tipoComprobante === 'FACTURA_B' ? '006'
                      : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_B' ? '008'
                      : selectedInvoiceForView.tipoComprobante === 'FACTURA_C' ? '011'
                      : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_C' ? '013'
                      : '000';
                    const numX = isOfficialJpgTemplate ? 60.8 : templateLayout.numComprobante.x;
                    const numY = isOfficialJpgTemplate ? 11.1 : templateLayout.numComprobante.y;
                    const fechaX = isOfficialJpgTemplate ? 71.8 : templateLayout.fechaEmision.x;
                    const fechaY = isOfficialJpgTemplate ? 12.6 : templateLayout.fechaEmision.y;
                    const tableTopY = isOfficialJpgTemplate ? Math.max(33.7, templateLayout.tableStartY || 33.7) : (templateLayout.tableStartY || 34.8);
                    const sonPesosX = isNcTemplate ? 16.5 : isBTemplate ? 17.6 : isInternalX ? 16.5 : templateLayout.sonPesos.x;
                    const sonPesosY = tplInfo.templateKind === 'A' ? templateLayout.sonPesos.y : 82.6;
                    const previewTotX = isOfficialJpgTemplate ? 96.2 : (templateLayout.totalsX || 95.2);
                    const caeX = isNcTemplate ? 67.8 : isBTemplate ? 68.5 : templateLayout.caeNum.x;
                    const caeVtoX = isNcTemplate ? 67.8 : isBTemplate ? 68.5 : templateLayout.caeVto.x;
                    const caeY = isNcTemplate ? 88.2 : isBTemplate ? 88.0 : templateLayout.caeNum.y;
                    const caeVtoY = isNcTemplate ? 89.6 : isBTemplate ? 89.4 : templateLayout.caeVto.y;
                    const condIvaLabel =
                      selectedInvoiceForView.condicionIvaReceptor === 'RESPONSABLE_INSCRIPTO'
                        ? 'Responsable inscripto'
                        : selectedInvoiceForView.condicionIvaReceptor.replace(/_/g, ' ');
                    const assocText = selectedInvoiceForView.cbteAsociadoInfo
                      ? `${selectedInvoiceForView.cbteAsociadoInfo.tipoComprobante.replace(/_/g, ' ')} ${String(selectedInvoiceForView.cbteAsociadoInfo.puntoVenta).padStart(4, '0')}-${String(selectedInvoiceForView.cbteAsociadoInfo.numeroComprobante).padStart(8, '0')}`
                      : selectedInvoiceForView.remitoPedido || '';
                    const iva105Sum = selectedInvoiceForView.items.reduce(
                      (acc, it) => acc + (Number(it.alicuotaIva) === 10.5 ? Number(it.subtotal || 0) * 0.105 : 0),
                      0
                    );
                    const iva21Sum = Math.max(0, Number(selectedInvoiceForView.ivaTotal || 0) - iva105Sum);

                    return (
                      <>
                        <img
                          key={activeTemplateSrc}
                          src={activeTemplateSrc}
                          alt={`Hoja Base ${selectedInvoiceForView.tipoComprobante.replace(/_/g, ' ')}`}
                          className="w-full h-auto block"
                          onError={() => {
                            if (fbStep < 2) {
                              setTemplateFallbackStep((prev) => ({
                                ...prev,
                                [tplInfo.primary]: (prev[tplInfo.primary] || 0) + 1,
                              }));
                            }
                          }}
                          onLoad={() => {
                            if (viewContainerRef.current) {
                              setViewContainerWidth(viewContainerRef.current.clientWidth);
                            }
                          }}
                        />

                        {/* Absolute Precision Overlay Container */}
                        <div
                          className="absolute inset-0 pointer-events-none text-slate-800 leading-tight"
                          style={{ fontFamily: templateLayout.fontFamily || 'monospace' }}
                        >
                          {/* Letter Box & Document Title Override per native template (A / B / X / NCA / NCB) */}
                          {selectedInvoiceForView.tipoComprobante === 'FACTURA_A' && (
                            <div
                              className="absolute top-[7.0%] left-[47.5%] w-[6.5%] h-[2.2%] bg-white flex items-center justify-center font-bold text-black"
                              style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: getViewFs(13) }}
                            >
                              COD. 01
                            </div>
                          )}

                          {selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_A' && (
                            <div
                              className="absolute top-[7.5%] left-[47.4%] w-[5.9%] h-[1.6%] bg-white flex items-center justify-center font-bold text-black"
                              style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: getViewFs(11) }}
                            >
                              COD. 03
                            </div>
                          )}

                          {selectedInvoiceForView.tipoComprobante === 'FACTURA_C' && (
                            <div
                              className="absolute top-[5.4%] left-[47.4%] w-[5.9%] h-[3.7%] bg-white flex flex-col items-center justify-center font-bold text-black"
                              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                            >
                              <span style={{ fontSize: getViewFs(28), lineHeight: 1 }}>C</span>
                              <span style={{ fontSize: getViewFs(11) }}>COD. 11</span>
                            </div>
                          )}

                          {selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_C' && (
                            <div
                              className="absolute top-[5.4%] left-[47.4%] w-[5.9%] h-[3.7%] bg-white flex flex-col items-center justify-center font-bold text-black"
                              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                            >
                              <span style={{ fontSize: getViewFs(28), lineHeight: 1 }}>C</span>
                              <span style={{ fontSize: getViewFs(11) }}>COD. 13</span>
                            </div>
                          )}

                          {selectedInvoiceForView.tipoComprobante === 'FACTURA_X' && (
                            <div
                              className="absolute top-[5.5%] left-[57%] w-[38%] h-[3.2%] flex items-center justify-center font-bold text-black tracking-wide"
                              style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: getViewFs(24) }}
                            >
                              FACTURA X
                            </div>
                          )}

                          {selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_X' && (
                            <div
                              className="absolute top-[5.5%] left-[57%] w-[38%] h-[3.2%] flex items-center justify-center font-bold text-black tracking-wide"
                              style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: getViewFs(22) }}
                            >
                              NOTA DE CRÉDITO X
                            </div>
                          )}

                          {isExternalMigratedInvoice(selectedInvoiceForView) && (
                            <div className="absolute top-[1.5%] left-[5%] right-[5%] bg-orange-100 text-orange-950 border-2 border-orange-500 px-2 py-0.5 text-center font-black text-[10px] uppercase tracking-wider">
                              ⚠️ COMPROBANTE MIGRADO DE OTRO SISTEMA ({selectedInvoiceForView.sistemaOrigenNombre || 'EXTERNO'}) — NO EMITIDO EN ESTE FACTURADOR
                            </div>
                          )}

                          {/* Nº Comprobante */}
                          <div
                            className="absolute font-bold tracking-wider"
                            style={{
                              top: `${numY}%`,
                              left: `${numX}%`,
                              fontSize: getViewFs(templateLayout.numComprobante.fontSize)
                            }}
                          >
                            {String(selectedInvoiceForView.puntoVenta).padStart(5, '0')}-{String(selectedInvoiceForView.numeroComprobante).padStart(8, '0')}
                          </div>

                          {/* Fecha de Emisión */}
                          <div
                            className="absolute"
                            style={{
                              top: `${fechaY}%`,
                              left: `${fechaX}%`,
                              fontSize: getViewFs(templateLayout.fechaEmision.fontSize)
                            }}
                          >
                            {selectedInvoiceForView.fecha.split('-').reverse().join('/')}
                          </div>

                          {/* Customer Box: Dedicated NC A / NC B vs Factura B vs Factura A / X */}
                          {isNcTemplate ? (
                            <>
                              <div
                                className="absolute uppercase truncate max-w-[84%]"
                                style={{
                                  top: '20.0%',
                                  left: '11.8%',
                                  fontSize: getViewFs(templateLayout.razonSocial.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.razonSocialReceptor}
                              </div>
                              <div
                                className="absolute"
                                style={{
                                  top: '22.9%',
                                  left: '10.0%',
                                  fontSize: getViewFs(templateLayout.cuitReceptor.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.nroDocReceptor}
                              </div>
                              <div
                                className="absolute uppercase truncate max-w-[31%]"
                                style={{
                                  top: '24.3%',
                                  left: '12.3%',
                                  fontSize: getViewFs(templateLayout.domicilio.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.domicilioReceptor || 'SAN SALVADOR DE JUJUY'}
                              </div>
                              <div
                                className="absolute uppercase truncate max-w-[34%]"
                                style={{
                                  top: '22.9%',
                                  left: '63.2%',
                                  fontSize: getViewFs(templateLayout.condicionVenta.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.condicionVenta || 'CONTADO'}
                              </div>
                              <div
                                className="absolute truncate max-w-[34%]"
                                style={{
                                  top: '24.3%',
                                  left: '63.2%',
                                  fontSize: getViewFs(templateLayout.condicionIva.fontSize)
                                }}
                              >
                                {condIvaLabel}
                              </div>
                              {assocText && (
                                <div
                                  className="absolute font-bold uppercase truncate max-w-[38%]"
                                  style={{
                                    top: '25.6%',
                                    left: '59.1%',
                                    fontSize: getViewFs(templateLayout.remitoPedido.fontSize)
                                  }}
                                >
                                  {assocText}
                                </div>
                              )}
                            </>
                          ) : isBTemplate ? (
                            <>
                              <div
                                className="absolute"
                                style={{ top: '20.1%', left: '12.8%', fontSize: getViewFs(templateLayout.codigoCliente.fontSize) }}
                              >
                                {selectedInvoiceForView.codigoCliente || '000001'}
                              </div>
                              <div
                                className="absolute uppercase truncate max-w-[68%]"
                                style={{ top: '20.1%', left: '28.2%', fontSize: getViewFs(templateLayout.razonSocial.fontSize) }}
                              >
                                {selectedInvoiceForView.razonSocialReceptor}
                              </div>
                              <div
                                className="absolute"
                                style={{ top: '22.9%', left: '10.0%', fontSize: getViewFs(templateLayout.cuitReceptor.fontSize) }}
                              >
                                {selectedInvoiceForView.nroDocReceptor}
                              </div>
                              <div
                                className="absolute uppercase"
                                style={{ top: '22.9%', left: '51.4%', fontSize: getViewFs(templateLayout.condicionVenta.fontSize) }}
                              >
                                {selectedInvoiceForView.condicionVenta || 'CONTADO'}
                              </div>
                              <div
                                className="absolute truncate max-w-[16%]"
                                style={{ top: '22.9%', left: '82.4%', fontSize: getViewFs(templateLayout.condicionIva.fontSize) }}
                              >
                                {condIvaLabel}
                              </div>
                              <div
                                className="absolute uppercase truncate max-w-[56%]"
                                style={{ top: '24.3%', left: '12.3%', fontSize: getViewFs(templateLayout.domicilio.fontSize) }}
                              >
                                {selectedInvoiceForView.domicilioReceptor || 'SAN SALVADOR DE JUJUY'}
                              </div>
                              <div
                                className="absolute truncate max-w-[16%]"
                                style={{ top: '24.3%', left: '82.4%', fontSize: getViewFs(templateLayout.remitoPedido.fontSize) }}
                              >
                                {selectedInvoiceForView.remitoPedido || '0000000000000'}
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Código Cliente */}
                              <div
                                className="absolute"
                                style={{
                                  top: `${templateLayout.codigoCliente.y}%`,
                                  left: `${templateLayout.codigoCliente.x}%`,
                                  fontSize: getViewFs(templateLayout.codigoCliente.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.codigoCliente || '000001'}
                              </div>

                              {/* Cliente / Razón Social */}
                              <div
                                className="absolute uppercase truncate max-w-[70%]"
                                style={{
                                  top: `${templateLayout.razonSocial.y}%`,
                                  left: `${templateLayout.razonSocial.x}%`,
                                  fontSize: getViewFs(templateLayout.razonSocial.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.razonSocialReceptor}
                              </div>

                              {/* CUIT Receptor */}
                              <div
                                className="absolute"
                                style={{
                                  top: `${templateLayout.cuitReceptor.y}%`,
                                  left: `${templateLayout.cuitReceptor.x}%`,
                                  fontSize: getViewFs(templateLayout.cuitReceptor.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.nroDocReceptor}
                              </div>

                              {/* Condición de Venta */}
                              <div
                                className="absolute uppercase"
                                style={{
                                  top: `${templateLayout.condicionVenta.y}%`,
                                  left: `${templateLayout.condicionVenta.x}%`,
                                  fontSize: getViewFs(templateLayout.condicionVenta.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.condicionVenta || 'CONTADO'}
                              </div>

                              {/* Condición frente al IVA (hidden on Factura X template) */}
                              {!isInternalX && (
                                <div
                                  className="absolute truncate max-w-[18%]"
                                  style={{
                                    top: `${templateLayout.condicionIva.y}%`,
                                    left: `${templateLayout.condicionIva.x}%`,
                                    fontSize: getViewFs(templateLayout.condicionIva.fontSize)
                                  }}
                                >
                                  {condIvaLabel}
                                </div>
                              )}

                              {/* Domicilio Receptor */}
                              <div
                                className="absolute uppercase truncate max-w-[65%]"
                                style={{
                                  top: `${templateLayout.domicilio.y}%`,
                                  left: `${templateLayout.domicilio.x}%`,
                                  fontSize: getViewFs(templateLayout.domicilio.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.domicilioReceptor || 'SAN SALVADOR DE JUJUY'}
                              </div>

                              {/* Remito / Pedido */}
                              <div
                                className="absolute"
                                style={{
                                  top: `${templateLayout.remitoPedido.y}%`,
                                  left: `${templateLayout.remitoPedido.x}%`,
                                  fontSize: getViewFs(templateLayout.remitoPedido.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.remitoPedido || '0000000000000'}
                              </div>

                              {/* Associated Voucher Reference for NC X */}
                              {isCreditNote && selectedInvoiceForView.cbteAsociadoInfo && (
                                <div
                                  className="absolute font-bold text-slate-900 uppercase"
                                  style={{
                                    top: '27.6%',
                                    left: '4.2%',
                                    fontSize: getViewFs(12)
                                  }}
                                >
                                  COMPROBANTE ASOCIADO: {assocText}
                                </div>
                              )}
                            </>
                          )}

                          {/* Table Rows Overlay */}
                          <div
                            className="absolute left-0 right-0 flex flex-col"
                            style={{
                              top: `${tableTopY}%`,
                              fontSize: getViewFs(templateLayout.tableFontSize || 16)
                            }}
                          >
                            {selectedInvoiceForView.items.map((it, i) => {
                              const previewDescX = templateLayout.tableColDescripcionX || 13.5;
                              const previewCantX = templateLayout.tableColCantidadX || 60.5;
                              const previewDescLimitX = Math.max(previewDescX + 12, previewCantX - 2.5);
                              return (
                                <div
                                  key={i}
                                  className="relative w-full font-normal"
                                  style={{ minHeight: `${(templateLayout.tableRowHeight || 3.2) * 10}px` }}
                                >
                                  <div
                                    className="absolute top-0 text-left truncate"
                                    style={{ left: `${templateLayout.tableColCodigoX || 4.5}%` }}
                                  >
                                    {it.codigo || String(i + 1).padStart(8, '0')}
                                  </div>
                                  <div
                                    className="uppercase whitespace-normal break-words leading-snug pb-1.5"
                                    style={{
                                      paddingLeft: `${previewDescX}%`,
                                      paddingRight: `${100 - previewDescLimitX}%`
                                    }}
                                  >
                                    {it.descripcion}
                                  </div>
                                  <div
                                    className="absolute top-0"
                                    style={{ left: `${previewCantX}%` }}
                                  >
                                    {it.cantidad.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                  </div>
                                  <div
                                    className="absolute top-0 uppercase"
                                    style={{ left: `${templateLayout.tableColUnidadX || 65.5}%` }}
                                  >
                                    {it.unidadMedida === 'unidades' ? 'UNI' : (it.unidadMedida || 'UNI')}
                                  </div>
                                  <div
                                    className="absolute top-0 whitespace-nowrap"
                                    style={{ left: `${templateLayout.tableColPrecioX ? Math.min(73.2, templateLayout.tableColPrecioX) : 72.8}%` }}
                                  >
                                    {selectedInvoiceForView.moneda === 'USD' ? 'US$ ' : '$'}{it.precioUnitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                  </div>
                                  <div
                                    className="absolute top-0 whitespace-nowrap"
                                    style={{ left: `${templateLayout.tableColBonifX || 83.8}%` }}
                                  >
                                    {it.bonificacionPorcentaje ? `${it.bonificacionPorcentaje}%` : '0%'}
                                  </div>
                                  <div
                                    className="absolute top-0 font-medium text-right whitespace-nowrap"
                                    style={{ right: `${100 - Math.max(95.5, templateLayout.tableColSubtotalX || 96.8)}%` }}
                                  >
                                    {selectedInvoiceForView.moneda === 'USD' ? 'US$ ' : '$'}{it.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Son Pesos / Dólares en letras */}
                          <div
                            className={`absolute uppercase tracking-tight leading-tight ${isOfficialJpgTemplate ? 'max-w-[46%]' : 'max-w-[55%]'}`}
                            style={{
                              top: `${sonPesosY}%`,
                              left: `${sonPesosX}%`,
                              fontSize: getViewFs(templateLayout.sonPesos.fontSize)
                            }}
                          >
                            {numeroALetras(selectedInvoiceForView.importeTotal, selectedInvoiceForView.moneda || 'ARS').replace(/^SON PESOS\s*/i, '')}
                          </div>

                          {/* Totals Breakdown Column adapted per template (A / B / X / NCA / NCB) */}
                          {tplInfo.templateKind === 'X' ? (
                            <>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: '76.8%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {selectedInvoiceForView.netoGravado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute font-bold text-right text-slate-900"
                                style={{
                                  top: '80.8%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {selectedInvoiceForView.importeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                            </>
                          ) : isNcTemplate ? (
                            <>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: '77.0%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {selectedInvoiceForView.netoGravado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: '78.3%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {iva21Sum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: '79.6%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {iva105Sum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: '81.0%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {(selectedInvoiceForView.percepcionIibb || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: '82.3%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {(0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute font-bold text-right text-slate-900"
                                style={{
                                  top: '83.6%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {selectedInvoiceForView.importeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                            </>
                          ) : isBTemplate ? (
                            <>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: '77.3%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {selectedInvoiceForView.netoGravado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: '79.9%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {selectedInvoiceForView.ivaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              {(selectedInvoiceForView.bonificacionTotal || 0) > 0 && (
                                <div
                                  className="absolute text-right"
                                  style={{
                                    top: '81.2%',
                                    right: `${100 - previewTotX}%`,
                                    fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                  }}
                                >
                                  -{(selectedInvoiceForView.bonificacionTotal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                </div>
                              )}
                              <div
                                className="absolute text-right"
                                style={{
                                  top: '82.6%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {(selectedInvoiceForView.percepcionIibb || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute font-bold text-right text-slate-900"
                                style={{
                                  top: '83.9%',
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {selectedInvoiceForView.importeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                            </>
                          ) : (
                            <>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: `${templateLayout.totalsNetoY}%`,
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {selectedInvoiceForView.netoGravado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: `${templateLayout.totalsBonifY}%`,
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {(selectedInvoiceForView.bonificacionTotal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: `${templateLayout.totalsIvaY}%`,
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {selectedInvoiceForView.ivaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute text-right"
                                style={{
                                  top: `${templateLayout.totalsIibbY}%`,
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {(selectedInvoiceForView.percepcionIibb || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <div
                                className="absolute font-bold text-right text-slate-900"
                                style={{
                                  top: `${templateLayout.totalsTotalY}%`,
                                  right: `${100 - previewTotX}%`,
                                  fontSize: getViewFs(templateLayout.totalsFontSize || 18)
                                }}
                              >
                                {selectedInvoiceForView.importeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                            </>
                          )}

                          {/* CAE, Vto CAE, Barcode & QR only on AFIP/ARCA fiscal documents (hidden on Factura X / NC X) */}
                          {!isInternalX && (
                            <>
                              <div
                                className="absolute font-normal tracking-wide"
                                style={{
                                  top: `${caeY}%`,
                                  left: `${caeX}%`,
                                  fontSize: getViewFs(templateLayout.caeNum.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.cae}
                              </div>
                              <div
                                className="absolute font-normal"
                                style={{
                                  top: `${caeVtoY}%`,
                                  left: `${caeVtoX}%`,
                                  fontSize: getViewFs(templateLayout.caeVto.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.vencimientoCae.split('-').reverse().join('/')}
                              </div>

                              <div
                                className="absolute tracking-tighter text-slate-700"
                                style={{
                                  top: `${templateLayout.barcode.y}%`,
                                  left: `${templateLayout.barcode.x}%`,
                                  fontSize: getViewFs(templateLayout.barcode.fontSize)
                                }}
                              >
                                {selectedInvoiceForView.cuitEmisor.replace(/\D/g, '')}
                                {afipTipoCode}
                                {String(selectedInvoiceForView.puntoVenta).padStart(5, '0')}
                                {selectedInvoiceForView.cae}
                                {selectedInvoiceForView.vencimientoCae.replace(/\D/g, '')}
                              </div>

                              <div
                                className="absolute p-0.5 bg-white border border-slate-300 rounded shadow-xs"
                                style={{
                                  top: `${templateLayout.qrCode.y}%`,
                                  left: `${templateLayout.qrCode.x}%`,
                                  width: `${templateLayout.qrCode.size * viewScale}px`,
                                  height: `${templateLayout.qrCode.size * viewScale}px`
                                }}
                              >
                                <img
                                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                                    `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify({
                                      ver: 1,
                                      fecha: selectedInvoiceForView.fecha,
                                      cuit: Number(selectedInvoiceForView.cuitEmisor.replace(/\D/g, '')),
                                      ptoVta: selectedInvoiceForView.puntoVenta,
                                      tipoCmp: selectedInvoiceForView.tipoComprobante === 'FACTURA_A' ? 1
                                        : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_A' ? 3
                                        : selectedInvoiceForView.tipoComprobante === 'FACTURA_B' ? 6
                                        : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_B' ? 8
                                        : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_C' ? 13
                                        : 11,
                                      nroCmp: selectedInvoiceForView.numeroComprobante,
                                      importe: selectedInvoiceForView.importeTotal,
                                      moneda: selectedInvoiceForView.moneda === 'USD' ? 'DOL' : 'PES',
                                      ctz: selectedInvoiceForView.moneda === 'USD' ? Number(selectedInvoiceForView.cotizacionDolar || 1) : 1,
                                      tipoDocRec: selectedInvoiceForView.tipoDocReceptor === 'CUIT' ? 80 : selectedInvoiceForView.tipoDocReceptor === 'DNI' ? 96 : 99,
                                      nroDocRec: Number(selectedInvoiceForView.nroDocReceptor.replace(/\D/g, '') || 0),
                                      tipoCodAut: 'E',
                                      codAut: Number(selectedInvoiceForView.cae) || 0
                                    }))}`
                                  )}`}
                                  alt="QR Fiscal ARCA"
                                  className="w-full h-full object-contain block"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                /* OPTION 2: Vector HTML Box Mode */
                <div className="bg-white text-slate-900 border-2 border-black font-sans text-xs relative p-0 overflow-hidden shadow-2xl max-w-2xl mx-auto rounded-none">
                  {isExternalMigratedInvoice(selectedInvoiceForView) && (
                    <div className="bg-orange-100 text-orange-950 border-b-2 border-orange-500 px-3 py-1.5 text-center font-black text-[11px] uppercase tracking-wider">
                      ⚠️ COMPROBANTE MIGRADO DE OTRO SISTEMA ({selectedInvoiceForView.sistemaOrigenNombre || 'EXTERNO'}) — NO EMITIDO EN ESTE FACTURADOR
                    </div>
                  )}
                  {/* TOP HEADER CONTAINER */}
                  <div className="border-b-2 border-black grid grid-cols-12 relative">
                    {/* Left Box: Logo & Company Info */}
                    <div className="col-span-5 p-3 flex items-center gap-3 border-r-2 border-black">
                      <div className="w-20 shrink-0">
                        <Logo theme="light" variant="mascot" size="sm" />
                      </div>
                      <div className="space-y-0.5 text-[11px] leading-tight">
                        <div className="font-black text-sm tracking-tight text-black">EL HORNOCAL S.R.L.</div>
                        <div>ALTE. BROWN - 1560</div>
                        <div className="font-bold">SAN SALVADOR DE JUJUY</div>
                        <div>CEL: 388- 5932763</div>
                        <div className="font-mono text-[10px]">E-MAIL: lahormiga.com.ar@gmail.com</div>
                        <div className="font-extrabold text-[10px] uppercase mt-1">IVA RESPONSABLE INSCRIPTO</div>
                      </div>
                    </div>

                    {/* Center Box: Letter & Code */}
                    <div className="col-span-2 border-r-2 border-black flex flex-col items-center justify-center p-2 bg-white">
                      <div className="border-2 border-black px-4 py-1 text-center bg-white">
                        <span className="text-3xl font-black block leading-none">
                          {selectedInvoiceForView.tipoComprobante.includes('A') ? 'A' : selectedInvoiceForView.tipoComprobante.includes('B') ? 'B' : selectedInvoiceForView.tipoComprobante.includes('C') ? 'C' : 'X'}
                        </span>
                        <span className="text-[10px] font-bold font-mono uppercase block mt-1">
                          {selectedInvoiceForView.tipoComprobante === 'FACTURA_A' ? 'COD. 01'
                            : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_A' ? 'COD. 03'
                            : selectedInvoiceForView.tipoComprobante === 'FACTURA_B' ? 'COD. 06'
                            : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_B' ? 'COD. 08'
                            : selectedInvoiceForView.tipoComprobante === 'FACTURA_C' ? 'COD. 11'
                            : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_C' ? 'COD. 13'
                            : 'COD. 00'}
                        </span>
                      </div>
                    </div>

                    {/* Right Box: Factura / Nota de Crédito Title & Meta */}
                    <div className="col-span-5 p-3 text-right space-y-1">
                      <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-black">
                        {selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_X' ? 'NOTA DE CRÉDITO X'
                          : selectedInvoiceForView.tipoComprobante.startsWith('NOTA_CREDITO') ? 'NOTA DE CRÉDITO'
                          : selectedInvoiceForView.tipoComprobante === 'FACTURA_X' ? 'FACTURA X'
                          : 'FACTURA'}
                      </h2>
                      <div className="font-mono font-bold text-sm">
                        Nº {String(selectedInvoiceForView.puntoVenta).padStart(5, '0')} - {String(selectedInvoiceForView.numeroComprobante).padStart(8, '0')}
                      </div>
                      <div className="text-[11px] space-y-0.5 font-mono">
                        <div>FECHA DE EMISIÓN: <b>{selectedInvoiceForView.fecha}</b></div>
                        <div>C.U.I.T.: <b>{selectedInvoiceForView.cuitEmisor || '30-71499982-2'}</b></div>
                        <div>INGRESOS BRUTOS: <b>A-1-37050</b></div>
                        <div>FECHA DE INICIO DE ACTIVIDADES: <b>10/08/2015</b></div>
                      </div>
                    </div>
                  </div>

                  {/* CLIENT & SALES CONDITION BOX */}
                  <div className="border-b-2 border-black p-3 space-y-2 text-xs">
                    <div className="grid grid-cols-12 gap-2 border-b border-gray-300 pb-1.5">
                      <div className="col-span-4">
                        <span className="font-bold">CODIGO:</span> <span className="font-mono font-bold text-black">{selectedInvoiceForView.codigoCliente || '001'}</span>
                      </div>
                      <div className="col-span-8 font-bold uppercase">
                        CLIENTE: <span className="font-black text-sm text-black">{selectedInvoiceForView.razonSocialReceptor}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 text-[11px]">
                      <div className="col-span-4 font-mono">
                        <span className="font-bold font-sans">C.U.I.T.:</span> {selectedInvoiceForView.nroDocReceptor}
                      </div>
                      <div className="col-span-4">
                        <span className="font-bold">CONDICIÓN DE VENTA:</span> <span className="font-bold uppercase">{selectedInvoiceForView.condicionVenta || 'CONTADO'}</span>
                      </div>
                      <div className="col-span-4">
                        <span className="font-bold">CONDICIÓN FRENTE AL IVA:</span> <span className="font-semibold">{selectedInvoiceForView.condicionIvaReceptor.replace('_', ' ')}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 text-[11px]">
                      <div className="col-span-8">
                        <span className="font-bold">DOMICILIO:</span> {selectedInvoiceForView.domicilioReceptor || 'ALTE. BROWN - SAN SALVADOR DE JUJUY'}
                      </div>
                      <div className="col-span-4">
                        <span className="font-bold">REMITO/PEDIDO:</span> <span className="font-mono font-semibold">{selectedInvoiceForView.remitoPedido || '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* ITEMS TABLE HEADER */}
                  <div className="relative min-h-[260px]">
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 py-6">
                      <Logo theme="light" variant="mascot" size="xl" />
                    </div>

                    <table className="w-full text-xs text-left border-collapse relative z-10">
                      <thead>
                        <tr className="bg-gray-200 border-b-2 border-black text-black font-bold uppercase text-[10px]">
                          <th className="py-2 px-2 border-r border-black w-16 text-center">Código</th>
                          <th className="py-2 px-3 border-r border-black">Producto / Servicio</th>
                          <th className="py-2 px-2 border-r border-black w-16 text-center">Cantidad</th>
                          <th className="py-2 px-2 border-r border-black w-20 text-center">U. Medida</th>
                          <th className="py-2 px-2 border-r border-black w-24 text-right">Precio Unit.</th>
                          <th className="py-2 px-2 border-r border-black w-16 text-right">% Bonif.</th>
                          <th className="py-2 px-3 text-right w-28">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-300 font-mono text-xs">
                        {selectedInvoiceForView.items.map((it, i) => (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="py-2 px-2 border-r border-gray-300 text-center font-bold text-gray-700">
                              {it.codigo || String(i + 1).padStart(2, '0')}
                            </td>
                            <td className="py-2 px-3 border-r border-gray-300 font-sans text-black font-medium break-words">
                              {it.descripcion}
                            </td>
                            <td className="py-2 px-2 border-r border-gray-300 text-center">
                              {it.cantidad}
                            </td>
                            <td className="py-2 px-2 border-r border-gray-300 text-center font-sans text-[11px]">
                              {it.unidadMedida || 'unidades'}
                            </td>
                            <td className="py-2 px-2 border-r border-gray-300 text-right">
                              {formatCurrency(it.precioUnitario, selectedInvoiceForView.moneda)}
                            </td>
                            <td className="py-2 px-2 border-r border-gray-300 text-right">
                              {it.bonificacionPorcentaje || 0}%
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-black">
                              {formatCurrency(it.subtotal, selectedInvoiceForView.moneda)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* TOTALS & SON PESOS / DÓLARES BOX */}
                  <div className="border-t-2 border-b-2 border-black grid grid-cols-12 p-3 text-xs bg-gray-50/80">
                    <div className="col-span-7 flex flex-col justify-end space-y-1">
                      <div className="font-bold text-black uppercase text-xs">
                        {numeroALetras(selectedInvoiceForView.importeTotal, selectedInvoiceForView.moneda || 'ARS')}
                      </div>
                      {selectedInvoiceForView.moneda === 'USD' && (
                        <div className="text-[10px] font-mono text-gray-700">
                          MONEDA: DÓLARES ESTADOUNIDENSES (DOL)
                          {selectedInvoiceForView.cotizacionDolar
                            ? ` • TC AFIP: $${selectedInvoiceForView.cotizacionDolar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                            : ''}
                        </div>
                      )}
                    </div>

                    <div className="col-span-5 space-y-1 font-mono text-xs text-right border-l border-gray-300 pl-3">
                      <div className="flex justify-between">
                        <span className="font-sans font-medium text-gray-700">Importe Neto Gravado:</span>
                        <span className="font-bold">{formatCurrency(selectedInvoiceForView.netoGravado, selectedInvoiceForView.moneda)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans font-medium text-gray-700">Bonificacion:</span>
                        <span className="font-bold">{formatCurrency(selectedInvoiceForView.bonificacionTotal || 0, selectedInvoiceForView.moneda)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans font-medium text-gray-700">IVA 21%:</span>
                        <span className="font-bold">{formatCurrency(selectedInvoiceForView.ivaTotal, selectedInvoiceForView.moneda)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans font-medium text-gray-700">PERCEP.IIBB:</span>
                        <span className="font-bold">{formatCurrency(selectedInvoiceForView.percepcionIibb || 0, selectedInvoiceForView.moneda)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-black pt-1 border-t border-black">
                        <span className="font-sans">IMPORTE TOTAL:</span>
                        <span>{formatCurrency(selectedInvoiceForView.importeTotal, selectedInvoiceForView.moneda)}</span>
                      </div>
                    </div>
                  </div>

                  {/* AFIP / ARCA FOOTER WITH CAE & QR */}
                  <div className="p-3 grid grid-cols-12 items-center text-xs font-mono">
                    <div className="col-span-5 flex items-center gap-3">
                      <div className="flex items-center gap-1 font-black text-lg tracking-wider text-slate-900 border-2 border-slate-900 px-2.5 py-0.5 rounded">
                        ARCA
                      </div>
                      <div>
                        <div className="font-bold font-sans text-xs text-black">Comprobante Autorizado</div>
                        <div className="text-[10px] text-gray-500 font-sans">Agencia de Recaudación y Control Aduanero</div>
                      </div>
                    </div>

                    <div className="col-span-3 flex justify-center">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                          `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify({
                            ver: 1,
                            fecha: selectedInvoiceForView.fecha,
                            cuit: Number(selectedInvoiceForView.cuitEmisor.replace(/\D/g, '')),
                            ptoVta: selectedInvoiceForView.puntoVenta,
                            tipoCmp: selectedInvoiceForView.tipoComprobante === 'FACTURA_A' ? 1
                              : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_A' ? 3
                              : selectedInvoiceForView.tipoComprobante === 'FACTURA_B' ? 6
                              : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_B' ? 8
                              : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_C' ? 13
                              : 11,
                            nroCmp: selectedInvoiceForView.numeroComprobante,
                            importe: selectedInvoiceForView.importeTotal,
                            moneda: selectedInvoiceForView.moneda === 'USD' ? 'DOL' : 'PES',
                            ctz: selectedInvoiceForView.moneda === 'USD' ? Number(selectedInvoiceForView.cotizacionDolar || 1) : 1,
                            tipoDocRec: 80,
                            nroDocRec: Number(selectedInvoiceForView.nroDocReceptor.replace(/\D/g, '') || 0),
                            tipoCodAut: 'E',
                            codAut: Number(selectedInvoiceForView.cae) || 0
                          }))}`
                        )}`}
                        alt="QR ARCA"
                        className="w-16 h-16 object-contain border border-gray-300 p-0.5 bg-white"
                      />
                    </div>

                    <div className="col-span-4 text-right font-bold text-xs space-y-0.5">
                      <div>CAE N°: <span className="text-black font-black">{selectedInvoiceForView.cae}</span></div>
                      <div>FECHA DE VTO. DE CAE: <span className="text-black">{selectedInvoiceForView.vencimientoCae}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Official AFIP Clarification OR Migrated Origin Box */}
              {isExternalMigratedInvoice(selectedInvoiceForView) ? (
                <div className="bg-orange-50 border-2 border-orange-400 rounded-xl p-4 text-xs text-orange-950 space-y-2 font-sans">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="font-black flex items-center gap-1.5 text-orange-900 text-sm">
                      <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
                      Comprobante Cargado desde Otro Sistema (Migración Histórica)
                    </div>
                    <span className="px-2.5 py-1 bg-orange-600 text-white font-black rounded-lg text-[10px] tracking-wide uppercase">
                      NO EMITIDO POR ESTE SISTEMA
                    </span>
                  </div>
                  <p className="text-orange-900 leading-relaxed bg-white/80 p-3 rounded-lg border border-orange-200">
                    Este comprobante proviene de <b>{selectedInvoiceForView.sistemaOrigenNombre || 'otro sistema'}</b> y fue cargado manualmente para conciliar cuentas, vincularlo con Contratos de Alquiler / Partes Diarios y registrar su cobranza sin consumir numeración ni enviar datos a ARCA.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-xs text-emerald-950 space-y-3 font-sans">
                    <div className="flex items-center justify-between">
                      <div className="font-bold flex items-center gap-1.5 text-emerald-900 text-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        Comprobante Registrado y Autorizado en AFIP / ARCA
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-600 text-white font-bold rounded-lg text-[10px] tracking-wide uppercase">
                        CAE Válido y Oficial
                      </span>
                    </div>

                    <div className="text-[12px] text-emerald-950 space-y-1.5 leading-relaxed bg-white/80 p-3 rounded-lg border border-emerald-200">
                      <div className="font-bold text-slate-900">¿Por qué no aparece de inmediato en el buscador "Mis Comprobantes" de AFIP?</div>
                      <p className="text-slate-700">
                        <b>1. Base de Datos Transaccional (WSFEv1):</b> El comprobante ya fue grabado y aprobado con <b>CAE Nº {selectedInvoiceForView.cae}</b>. AFIP ya no permite repetir este número y el próximo correlativo a emitir es el Nº {selectedInvoiceForView.numeroComprobante + 1}.<br />
                        <b>2. Demora de Indexación en "Mis Comprobantes":</b> El portal web "Mis Comprobantes" es un almacén de reportes contables que se nutre mediante procesos por lotes (batch) y <b>demora entre 30 minutos y unas horas</b> en indexar los comprobantes emitidos por Web Services (Pto Vta 7 - RECE).<br />
                        <b>3. "Comprobantes en línea":</b> Este menú solo muestra comprobantes confeccionados manualmente desde la web de AFIP (Puntos 1 y 3).
                      </p>
                    </div>

                    {/* Direct Verification on Public AFIP portal */}
                    <div className="bg-slate-900 text-white p-3.5 rounded-xl space-y-2 border border-slate-800">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="font-bold text-emerald-400 text-xs flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          Constatar en la Web Oficial de AFIP (Sin Clave Fiscal):
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const copyText = `DATOS PARA CONSTATAR EN AFIP:\nCUIT Emisor: ${selectedInvoiceForView.cuitEmisor}\nCAE: ${selectedInvoiceForView.cae}\nFecha: ${selectedInvoiceForView.fecha}\nTipo Comprobante: ${selectedInvoiceForView.tipoComprobante === 'FACTURA_A' ? '1 - Factura A' : selectedInvoiceForView.tipoComprobante === 'FACTURA_B' ? '6 - Factura B' : '11 - Factura C'}\nPunto de Venta: ${String(selectedInvoiceForView.puntoVenta).padStart(4, '0')}\nNúmero: ${selectedInvoiceForView.numeroComprobante}\nDoc Receptor: CUIT ${selectedInvoiceForView.nroDocReceptor}\nMoneda: ${selectedInvoiceForView.moneda || 'ARS'}\nImporte Total: ${formatCurrency(selectedInvoiceForView.importeTotal, selectedInvoiceForView.moneda)}`;
                            navigator.clipboard.writeText(copyText);
                            setCopiedAfipData(true);
                            setTimeout(() => setCopiedAfipData(false), 3000);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded text-[11px] font-bold border border-slate-700 transition flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                        >
                          {copiedAfipData ? '✓ Datos copiados al portapapeles' : '📋 Copiar datos para AFIP'}
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-300 font-mono grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-800">
                        <div>CUIT Emisor: <b className="text-white">{selectedInvoiceForView.cuitEmisor}</b></div>
                        <div>CAE: <b className="text-emerald-400">{selectedInvoiceForView.cae}</b></div>
                        <div>Pto Vta - Nro: <b className="text-white">{String(selectedInvoiceForView.puntoVenta).padStart(4, '0')} - {selectedInvoiceForView.numeroComprobante}</b></div>
                        <div>Importe: <b className="text-white">{formatCurrency(selectedInvoiceForView.importeTotal, selectedInvoiceForView.moneda)}</b></div>
                      </div>

                      <div className="pt-1 flex flex-wrap items-center gap-3">
                        <a
                          href="https://servicioscf.afip.gob.ar/publico/comprobantes/cae.aspx"
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 font-bold underline text-xs flex items-center gap-1"
                        >
                          Abrir Constatador Oficial de Comprobantes por CAE (AFIP) ↗
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Footer: CAE & QR */}
                  <div className="border-t border-slate-200 pt-4 flex items-center justify-between">
                    <div className="space-y-1 font-mono text-xs">
                      <div className="font-bold text-emerald-700">CAE Nº: {selectedInvoiceForView.cae}</div>
                      <div className="text-slate-600">Fecha de Vto. de CAE: {selectedInvoiceForView.vencimientoCae}</div>
                      <div className="text-[10px] text-slate-500 font-sans mt-2">Comprobante Autorizado por AFIP / ARCA (WSFEv1)</div>
                    </div>

                    <div className="bg-white p-2 rounded-xl border border-slate-200 text-center flex flex-col items-center">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                          `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify({
                            ver: 1,
                            fecha: selectedInvoiceForView.fecha,
                            cuit: Number(selectedInvoiceForView.cuitEmisor.replace(/\D/g, '')),
                            ptoVta: selectedInvoiceForView.puntoVenta,
                            tipoCmp: selectedInvoiceForView.tipoComprobante === 'FACTURA_A' ? 1
                              : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_A' ? 3
                              : selectedInvoiceForView.tipoComprobante === 'FACTURA_B' ? 6
                              : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_B' ? 8
                              : selectedInvoiceForView.tipoComprobante === 'NOTA_CREDITO_C' ? 13
                              : 11,
                            nroCmp: selectedInvoiceForView.numeroComprobante,
                            importe: selectedInvoiceForView.importeTotal,
                            moneda: selectedInvoiceForView.moneda === 'USD' ? 'DOL' : 'PES',
                            ctz: selectedInvoiceForView.moneda === 'USD' ? Number(selectedInvoiceForView.cotizacionDolar || 1) : 1,
                            tipoDocRec: 80,
                            nroDocRec: Number(selectedInvoiceForView.nroDocReceptor.replace(/\D/g, '') || 0),
                            tipoCodAut: 'E',
                            codAut: Number(selectedInvoiceForView.cae) || 0
                          }))}`
                        )}`}
                        alt="QR Fiscal ARCA"
                        className="w-16 h-16 object-contain block"
                      />
                      <span className="text-[9px] font-mono text-slate-500 mt-1">QR ARCA / AFIP</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              {!isExternalMigratedInvoice(selectedInvoiceForView) && selectedInvoiceForView.tipoComprobante !== 'FACTURA_X' && selectedInvoiceForView.tipoComprobante !== 'NOTA_CREDITO_X' ? (
                <button
                  type="button"
                  onClick={() => handleAuditLive(selectedInvoiceForView)}
                  disabled={isAuditingLive}
                  className="px-3.5 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  {isAuditingLive ? 'Consultando AFIP en vivo...' : 'Re-consultar registro en Servidores AFIP (En vivo)'}
                </button>
              ) : (
                <div className="text-[11px] font-bold text-orange-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  {isExternalMigratedInvoice(selectedInvoiceForView)
                    ? `Factura de otro sistema (${selectedInvoiceForView.sistemaOrigenNombre || 'Migración'})`
                    : 'Comprobante interno de control (sin CAE AFIP)'}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-500 disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-950"
                >
                  <FileDown className="w-4 h-4" />
                  {isGeneratingPdf ? 'Generando PDF...' : 'Descargar PDF (.pdf)'}
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
              </div>
            </div>

            {auditLiveResult && (
              <div className="p-4 bg-slate-950 text-white border-t border-slate-800 text-xs space-y-2 font-mono">
                <div className="flex items-center justify-between text-emerald-400 font-bold font-sans">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Respuesta Oficial en Vivo de AFIP ({auditLiveResult.parsed?.ambiente || 'Producción'})
                  </span>
                  <button onClick={() => setAuditLiveResult(null)} className="text-slate-400 hover:text-white font-sans text-xs">Cerrar ✕</button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  <div>CAE en AFIP: <b className="text-emerald-400">{auditLiveResult.parsed?.cae}</b></div>
                  <div>Resultado: <b className="text-emerald-400">{auditLiveResult.parsed?.resultado === 'A' ? 'A (APROBADO)' : auditLiveResult.parsed?.resultado}</b></div>
                  <div>Fecha de Proceso en AFIP: <b className="text-white">{auditLiveResult.parsed?.fechaProceso}</b></div>
                  <div>Importe Registrado en AFIP: <b className="text-white">${auditLiveResult.parsed?.importeTotal}</b></div>
                  <div>Punto de Venta / Comprobante: <b className="text-white">{auditLiveResult.ptoVta} - Nº {auditLiveResult.nro}</b></div>
                  <div>Receptor Registrado: <b className="text-white">CUIT {auditLiveResult.parsed?.docNro}</b></div>
                </div>
                <div className="text-[11px] text-slate-400 font-sans leading-relaxed">
                  ℹ️ Esta consulta fue respondida en directo por el servidor central de AFIP (WSFEv1). El servicio "Mis Comprobantes" en la web de AFIP demora entre 30 minutos y unas horas en reflejar e indexar las búsquedas de comprobantes emitidos por Web Services.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Confirmar Eliminación de Factura */}
      {invoiceToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">¿Eliminar Comprobante?</h3>
                <p className="text-xs text-slate-400 mt-0.5">Esta acción eliminará el registro del sistema y de la base de datos.</p>
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1 font-mono">
              <div className="text-white font-bold">{invoiceToDelete.tipoComprobante.replace('_', ' ')}: {invoiceToDelete.id}</div>
              <div className="text-slate-400">Receptor: {invoiceToDelete.razonSocialReceptor}</div>
              <div className="text-emerald-400 font-bold">Importe: {formatCurrency(invoiceToDelete.importeTotal)}</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInvoiceToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteInvoice(invoiceToDelete.id)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition cursor-pointer shadow-lg shadow-red-950 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Confirmar Eliminación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Calibrador Visual de Plantilla A4 */}
      {isCalibratorOpen && (
        <InvoiceTemplateCalibratorModal
          layout={templateLayout}
          onSaveLayout={(newLayout) => {
            setTemplateLayout(newLayout);
            saveInvoiceTemplateLayout(newLayout);
          }}
          onClose={() => setIsCalibratorOpen(false)}
        />
      )}

      {/* MODAL: Vincular Contratos de Alquiler y Partes Diarios a una Factura Emitida */}
      {invoiceForLinking && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-indigo-500/40 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/15 border border-indigo-500/30 rounded-xl text-indigo-300">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    Vínculos y Estado de Cobro • {formatInvoiceLabel(invoiceForLinking)}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cliente: <strong className="text-white">{invoiceForLinking.razonSocialReceptor}</strong> • Total: <strong className="text-emerald-400">{formatCurrency(invoiceForLinking.importeTotal, invoiceForLinking.moneda)}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceForLinking(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              {/* Estado de Cobro de la Factura */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <label className="block text-[11px] font-bold text-emerald-300 uppercase">
                  Estado de Cobro de la Factura
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'PENDIENTE_PAGO', label: '⏳ PENDIENTE DE PAGO', cls: 'border-rose-500/40 bg-rose-500/15 text-rose-300' },
                    { id: 'PARCIAL', label: '⏳ PAGO PARCIAL', cls: 'border-amber-500/40 bg-amber-500/15 text-amber-300' },
                    { id: 'PAGADO', label: '✓ COBRADO / PAGADO', cls: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300' },
                  ].map(st => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setLinkingEstadoCobro(st.id as any)}
                      className={`py-2 px-3 rounded-xl font-mono font-black text-xs border transition cursor-pointer ${
                        linkingEstadoCobro === st.id
                          ? `${st.cls} ring-2 ring-white/20`
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contratos de Alquiler Vinculados */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-indigo-300 uppercase">
                    Contratos de Alquiler Vinculados ({linkingRentalIds.length})
                  </label>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {rentals.length === 0 ? (
                    <p className="text-slate-500 text-xs">No hay contratos de alquiler registrados.</p>
                  ) : (
                    rentals.map(r => {
                      const checked = linkingRentalIds.includes(r.id);
                      const rentalPartesIds = getPartesIdsForRental(r);
                      return (
                        <label
                          key={r.id}
                          className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer transition ${
                            checked
                              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200 font-bold'
                              : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const isAdding = !linkingRentalIds.includes(r.id);
                                setLinkingRentalIds(prev =>
                                  isAdding ? [...prev, r.id] : prev.filter(id => id !== r.id)
                                );
                                if (isAdding && rentalPartesIds.length > 0) {
                                  setLinkingPartesIds(prev => Array.from(new Set([...prev, ...rentalPartesIds])));
                                }
                              }}
                              className="rounded accent-indigo-500"
                            />
                            <span className="font-mono text-indigo-300">{r.numeroContrato || r.numero}</span>
                            <span className="truncate">{r.clienteNombre} • {r.obraDestino || r.direccionObra} ({r.equipoModelo})</span>
                            {rentalPartesIds.length > 0 && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px]">
                                {rentalPartesIds.length} parte{rentalPartesIds.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-emerald-400 shrink-0">
                            ${Number(r.totalGeneral || r.totalAlquiler || 0).toLocaleString('es-AR')}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Partes Diarios Vinculados */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[11px] font-bold text-amber-300 uppercase">
                    Partes Diarios Vinculados / Absorbidos ({linkingPartesIds.length})
                  </label>
                  <input
                    type="text"
                    value={linkingParteSearch}
                    onChange={(e) => setLinkingParteSearch(e.target.value)}
                    placeholder="Buscar parte por N°, obra, equipo..."
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white w-56 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {partesDiarios
                    .filter(p => {
                      const q = linkingParteSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        (p.numParte || '').toLowerCase().includes(q) ||
                        (p.obra || '').toLowerCase().includes(q) ||
                        (p.marcaModelo || '').toLowerCase().includes(q) ||
                        (p.codigoEquipo || '').toLowerCase().includes(q) ||
                        (p.nombreApellido || '').toLowerCase().includes(q) ||
                        (p.rentalNumero || '').toLowerCase().includes(q)
                      );
                    })
                    .slice()
                    .sort((a, b) => Number(linkingPartesIds.includes(b.id)) - Number(linkingPartesIds.includes(a.id)))
                    .slice(0, 60)
                    .map(p => {
                      const checked = linkingPartesIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer transition ${
                            checked
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 font-bold'
                              : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setLinkingPartesIds(prev =>
                                  prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                );
                              }}
                              className="rounded accent-amber-500"
                            />
                            <span className="font-mono text-amber-300">Parte #{p.numParte}</span>
                            <span className="truncate">{p.fecha} • {p.obra} • {p.marcaModelo || p.codigoEquipo} ({p.nombreApellido})</span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-400 shrink-0">
                            {p.horasTrabajadas ? `${p.horasTrabajadas} hs` : p.viajesCantidad ? `${p.viajesCantidad} viajes` : p.tipo}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
              {onNavigateToCobranzas ? (
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceForLinking(null);
                    onNavigateToCobranzas();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer"
                >
                  Ir a Cobranzas & Emitir Recibo →
                </button>
              ) : <div />}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInvoiceForLinking(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveInvoiceLinks}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-lg cursor-pointer"
                >
                  Guardar Vínculos y Estado
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Cargar Factura de Otro Sistema (Migración Histórica) */}
      {isExternalModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-orange-500/60 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 bg-gradient-to-r from-orange-950 via-slate-900 to-amber-950/70 border-b border-orange-500/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-orange-500/25 border border-orange-400/50 rounded-xl text-orange-300">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white flex items-center gap-2 flex-wrap">
                    Cargar Factura de Otro Sistema (Migración)
                    <span className="px-2 py-0.5 rounded bg-orange-500/30 border border-orange-400/60 text-orange-200 text-[10px] font-black uppercase">
                      ⚠️ NO SE ENVÍA A ARCA
                    </span>
                  </h2>
                  <p className="text-xs text-orange-200/80">
                    {isVentasScope
                      ? 'Registrá facturas de venta de artículos emitidas en tu sistema anterior para ordenar cuentas corrientes, cobrar y controlar entregas con remitos.'
                      : 'Registrá facturas emitidas en tu sistema anterior para ordenar cuentas, cobrar y vincularlas con Contratos de Alquiler y Partes Diarios.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExternalModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExternalInvoice} className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              {extError && (
                <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {extError}
                </div>
              )}

              {/* Paso 1: Identificación de Comprobante y Sistema de Origen */}
              <div className="bg-slate-950/80 border border-orange-500/35 rounded-xl p-4 space-y-3">
                <div className="text-[11px] font-black text-orange-300 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                  1. Datos del Comprobante Anterior & Sistema de Origen
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo Comprobante *</label>
                    <select
                      value={extTipoComprobante}
                      onChange={e => setExtTipoComprobante(e.target.value as ArcaTipoComprobante)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-orange-400"
                    >
                      <option value="FACTURA_A">Factura A</option>
                      <option value="FACTURA_B">Factura B</option>
                      <option value="FACTURA_C">Factura C</option>
                      <option value="FACTURA_X">Factura X / Remito</option>
                      <option value="NOTA_CREDITO_A">Nota de Crédito A</option>
                      <option value="NOTA_CREDITO_B">Nota de Crédito B</option>
                      <option value="NOTA_CREDITO_C">Nota de Crédito C</option>
                      <option value="NOTA_CREDITO_X">Nota de Crédito X</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Pto. Venta (Histórico) *</label>
                    <input
                      type="number"
                      min={1}
                      max={99999}
                      value={extPuntoVenta}
                      onChange={e => setExtPuntoVenta(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white font-bold focus:outline-none focus:border-orange-400"
                      placeholder="Ej: 1 o 3"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">N° Comprobante *</label>
                    <input
                      type="text"
                      value={extNumeroComprobante}
                      onChange={e => setExtNumeroComprobante(e.target.value)}
                      className="w-full bg-slate-900 border border-orange-500/50 rounded-xl px-3 py-2 text-xs font-mono text-white font-bold focus:outline-none focus:border-orange-400"
                      placeholder="Ej: 1425"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Fecha de Emisión *</label>
                    <input
                      type="date"
                      value={extFecha}
                      onChange={e => setExtFecha(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-orange-400"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-orange-300 uppercase mb-1">Sistema de Origen (Etiqueta visible) *</label>
                    <input
                      type="text"
                      value={extSistemaOrigenNombre}
                      onChange={e => setExtSistemaOrigenNombre(e.target.value)}
                      placeholder="Ej: Sistema Anterior / AFIP Web / Tango"
                      className="w-full bg-slate-900 border border-orange-500/40 rounded-xl px-3 py-2 text-xs text-orange-100 font-bold focus:outline-none focus:border-orange-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">CAE Histórico (Opcional)</label>
                    <input
                      type="text"
                      value={extCae}
                      onChange={e => setExtCae(e.target.value)}
                      placeholder="Dejar vacío si no se migra CAE"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-orange-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Vto. CAE (Opcional)</label>
                    <input
                      type="date"
                      value={extVencimientoCae}
                      onChange={e => setExtVencimientoCae(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-orange-400"
                    />
                  </div>
                </div>
              </div>

              {/* Paso 2: Cliente y Pre-llenado desde BD */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-emerald-300 uppercase tracking-wider">
                    2. Cliente / Receptor
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsClientDirectoryOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50 text-[11px] font-black cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Llamar Cliente (BD)
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowExtClientSuggestions(prev => !prev)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-[#F0C800] border border-[#F0C800]/40 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                    >
                      <Search className="w-3.5 h-3.5" />
                      {showExtClientSuggestions ? 'Ocultar Lista' : `Buscar Rápido (${allAvailableClients.length})`}
                    </button>
                    {!isVentasScope && (
                      <select
                        value=""
                        onChange={e => {
                          const rId = e.target.value;
                          const found = (dbRentals.length ? dbRentals : rentals).find(r => r.id === rId);
                          if (found) handleApplyRentalToExternal(found);
                        }}
                        className="bg-slate-900 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 text-[11px] text-indigo-200 font-bold cursor-pointer"
                      >
                        <option value="">-- Copiar datos de un Contrato de Alquiler --</option>
                        {(dbRentals.length ? dbRentals : rentals).map(r => (
                          <option key={r.id} value={r.id}>
                            {r.numeroContrato || r.numero} — {r.clienteNombre} (${Number(r.totalAlquiler || r.totalGeneral || 0).toLocaleString('es-AR')})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {showExtClientSuggestions && (
                  <div className="bg-slate-900 border border-[#F0C800]/40 rounded-xl p-2.5 space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={extClientSearch}
                        onChange={e => setExtClientSearch(e.target.value)}
                        placeholder="Filtrar cliente por Razón Social, CUIT, DNI o código..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                      />
                    </div>
                    <div className="max-h-44 overflow-y-auto space-y-1">
                      {allAvailableClients.length === 0 ? (
                        <div className="text-center text-[11px] text-slate-400 py-3">
                          No hay clientes cargados aún. Usá "Llamar Cliente (BD)" para crear uno.
                        </div>
                      ) : (
                        allAvailableClients
                          .filter(c => {
                            const q = extClientSearch.trim().toUpperCase();
                            if (!q) return true;
                            return (
                              (c.razonSocial || '').toUpperCase().includes(q) ||
                              (c.cuit || '').toUpperCase().includes(q) ||
                              (c.codigo || '').toUpperCase().includes(q) ||
                              (c.localidad || '').toUpperCase().includes(q)
                            );
                          })
                          .slice(0, 20)
                          .map((c, idx) => (
                            <button
                              key={`${c.id || c.cuit}-${idx}`}
                              type="button"
                              onClick={() => applyClientRecordToExternal(c)}
                              className="w-full text-left px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-between gap-2 text-xs cursor-pointer"
                            >
                              <div className="truncate">
                                {c.codigo && <span className="mr-2 font-mono text-emerald-400 font-bold">{c.codigo}</span>}
                                <span className="font-bold text-white">{c.razonSocial}</span>
                                {c.cuit && <span className="ml-2 font-mono text-[#F0C800]">CUIT: {c.cuit}</span>}
                              </div>
                              <span className="text-[10px] text-emerald-400 font-black shrink-0">Seleccionar</span>
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo Doc.</label>
                    <select
                      value={extTipoDocReceptor}
                      onChange={e => setExtTipoDocReceptor(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                    >
                      <option value="CUIT">CUIT</option>
                      <option value="DNI">DNI</option>
                      <option value="CONSUMIDOR_FINAL">Cons. Final</option>
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">CUIT / DNI</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={extNroDocReceptor}
                        onChange={e => setExtNroDocReceptor(e.target.value)}
                        placeholder="Ej: 30716294519"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-orange-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleExtCuitLookup(extNroDocReceptor)}
                        disabled={isSearchingExtCuit}
                        className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl text-[11px] font-bold cursor-pointer"
                      >
                        {isSearchingExtCuit ? '...' : 'Padrón'}
                      </button>
                    </div>
                    {extCuitNotice && (
                      <div className={`text-[10px] mt-1 ${extCuitNotice.type === 'ok' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {extCuitNotice.text}
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-6">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Razón Social / Cliente *</label>
                    <input
                      type="text"
                      value={extRazonSocialReceptor}
                      onChange={e => setExtRazonSocialReceptor(e.target.value)}
                      placeholder="Nombre o Razón Social del cliente..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-orange-400"
                      required
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Condición IVA</label>
                    <select
                      value={extCondicionIvaReceptor}
                      onChange={e => setExtCondicionIvaReceptor(e.target.value as ArcaCondicionIva)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                      <option value="MONOTRIBUTO">Monotributo</option>
                      <option value="EXENTO">Exento</option>
                      <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Condición Venta</label>
                    <input
                      type="text"
                      value={extCondicionVenta}
                      onChange={e => setExtCondicionVenta(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Referencia / Remito / Obra</label>
                    <input
                      type="text"
                      value={extRemitoPedido}
                      onChange={e => setExtRemitoPedido(e.target.value)}
                      placeholder="Obra / Remito / Obs..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Paso 3: Importes y Estado de Cobro */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-amber-300 uppercase tracking-wider">
                    3. Importes y Estado de Cobro Actual
                  </span>
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setExtAmountMode('SIMPLE_TOTAL')}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                        extAmountMode === 'SIMPLE_TOTAL' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Carga Rápida por Total
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtAmountMode('DETALLE_ITEMS')}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                        extAmountMode === 'DETALLE_ITEMS' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Detallar Ítems
                    </button>
                  </div>
                </div>

                {extAmountMode === 'SIMPLE_TOTAL' ? (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-5">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Concepto / Descripción *</label>
                      <input
                        type="text"
                        value={extSimpleDesc}
                        onChange={e => setExtSimpleDesc(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-400"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Moneda</label>
                      <select
                        value={extMoneda}
                        onChange={e => setExtMoneda(e.target.value as 'ARS' | 'USD')}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-bold"
                      >
                        <option value="ARS">ARS ($)</option>
                        <option value="USD">USD (US$)</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Alíc. IVA</label>
                      <select
                        value={extSimpleIvaPct}
                        onChange={e => setExtSimpleIvaPct(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                      >
                        <option value={21}>21%</option>
                        <option value={10.5}>10.5%</option>
                        <option value={0}>0% / Exento</option>
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[10px] font-bold text-emerald-300 uppercase mb-1">Importe Total Factura *</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={extSimpleTotal || ''}
                        onChange={e => setExtSimpleTotal(Number(e.target.value))}
                        placeholder="Ej: 1210000"
                        className="w-full bg-slate-900 border border-emerald-500/50 rounded-xl px-3 py-2 text-xs font-mono font-black text-emerald-300 focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {extItems.map((it, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                        <input
                          type="text"
                          value={it.descripcion}
                          onChange={e => {
                            const next = [...extItems];
                            next[idx] = { ...next[idx], descripcion: e.target.value };
                            setExtItems(next);
                          }}
                          placeholder="Descripción del ítem..."
                          className="col-span-5 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                        />
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={it.cantidad}
                          onChange={e => {
                            const next = [...extItems];
                            const qty = Number(e.target.value || 0);
                            next[idx] = { ...next[idx], cantidad: qty, subtotal: Number((qty * next[idx].precioUnitario).toFixed(2)) };
                            setExtItems(next);
                          }}
                          className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-white text-center"
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={it.precioUnitario}
                          onChange={e => {
                            const next = [...extItems];
                            const pu = Number(e.target.value || 0);
                            next[idx] = { ...next[idx], precioUnitario: pu, subtotal: Number((next[idx].cantidad * pu).toFixed(2)) };
                            setExtItems(next);
                          }}
                          placeholder="Precio Unit."
                          className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-white text-right"
                        />
                        <select
                          value={it.alicuotaIva}
                          onChange={e => {
                            const next = [...extItems];
                            next[idx] = { ...next[idx], alicuotaIva: Number(e.target.value) };
                            setExtItems(next);
                          }}
                          className="col-span-2 bg-slate-950 border border-slate-700 rounded px-1.5 py-1.5 text-xs text-white"
                        >
                          <option value={21}>IVA 21%</option>
                          <option value={10.5}>IVA 10.5%</option>
                          <option value={0}>0%</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setExtItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                          className="col-span-1 p-1.5 text-rose-400 hover:text-rose-300 flex justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-2">
                      {hardwareProducts.length > 0 && (
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) addHardwareProductToExtItems(e.target.value);
                          }}
                          className="bg-slate-900 border border-[#F0C800]/50 rounded-lg px-2.5 py-1 text-[11px] text-[#F0C800] font-bold cursor-pointer max-w-[280px]"
                        >
                          <option value="">+ Agregar artículo del catálogo ({hardwareProducts.length})...</option>
                          {hardwareProducts.map(prod => (
                            <option key={prod.id} value={prod.id}>
                              {prod.codigoInterno || prod.codigo || ''} — {prod.nombre} (${Number(prod.precioVenta || prod.precioCosto || 0).toLocaleString('es-AR')})
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => setExtItems(prev => [...prev, { codigo: String(prev.length + 1).padStart(2, '0'), descripcion: '', cantidad: 1, unidadMedida: 'unidades', precioUnitario: 0, bonificacionPorcentaje: 0, subtotal: 0, alicuotaIva: 21 }])}
                        className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold cursor-pointer"
                      >
                        + Agregar Ítem
                      </button>
                    </div>
                  </div>
                )}

                {/* Modalidad de Entrega de Artículos (Con Factura vs Con Remitos) */}
                {!extTipoComprobante.startsWith('NOTA_CREDITO') && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-2">
                    <label className="block text-[10px] font-black text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-cyan-400" />
                      Modalidad de Entrega de Mercadería
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setExtModalidadEntrega('ENTREGA_CON_FACTURA')}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-2 ${
                          extModalidadEntrega === 'ENTREGA_CON_FACTURA'
                            ? 'bg-emerald-500/15 border-emerald-400 ring-2 ring-emerald-400/20'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <PackageCheck className={`w-4 h-4 shrink-0 mt-0.5 ${extModalidadEntrega === 'ENTREGA_CON_FACTURA' ? 'text-emerald-400' : 'text-slate-500'}`} />
                        <div>
                          <div className={`text-[11px] font-black ${extModalidadEntrega === 'ENTREGA_CON_FACTURA' ? 'text-emerald-300' : 'text-slate-200'}`}>
                            Entrega con Factura (Ya entregado)
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Los artículos se entregaron con esta factura. Aparecen en Entregados.
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setExtModalidadEntrega('ENTREGA_CON_REMITOS')}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-2 ${
                          extModalidadEntrega === 'ENTREGA_CON_REMITOS'
                            ? 'bg-cyan-500/15 border-cyan-400 ring-2 ring-cyan-400/20'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <Truck className={`w-4 h-4 shrink-0 mt-0.5 ${extModalidadEntrega === 'ENTREGA_CON_REMITOS' ? 'text-cyan-400' : 'text-slate-500'}`} />
                        <div>
                          <div className={`text-[11px] font-black ${extModalidadEntrega === 'ENTREGA_CON_REMITOS' ? 'text-cyan-300' : 'text-slate-200'}`}>
                            Entrega con Remitos (Pendiente de entrega)
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Los ítems quedan en Pendientes de Entrega para ir remitiéndolos.
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-800 items-end">
                  <div className="md:col-span-6">
                    <label className="block text-[10px] font-bold text-emerald-300 uppercase mb-1">Estado de Cobro de esta Factura Migrada</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'PENDIENTE_PAGO', label: '⏳ PENDIENTE', cls: 'border-rose-500/40 bg-rose-500/15 text-rose-300' },
                        { id: 'PARCIAL', label: '⏳ PARCIAL', cls: 'border-amber-500/40 bg-amber-500/15 text-amber-300' },
                        { id: 'PAGADO', label: '✓ PAGADA', cls: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300' },
                      ].map(st => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setExtEstadoCobro(st.id as any)}
                          className={`py-2 px-2 rounded-xl font-mono font-black text-[11px] border transition cursor-pointer ${
                            extEstadoCobro === st.id
                              ? `${st.cls} ring-2 ring-white/20`
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {extEstadoCobro === 'PARCIAL' && (
                    <div className="md:col-span-3">
                      <label className="block text-[10px] font-bold text-amber-300 uppercase mb-1">Monto Ya Cobrado</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={extMontoCobrado || ''}
                        onChange={e => setExtMontoCobrado(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-xl px-3 py-2 text-xs font-mono text-amber-300 font-bold"
                      />
                    </div>
                  )}

                  <div className={`${extEstadoCobro === 'PARCIAL' ? 'md:col-span-3' : 'md:col-span-6'} text-right font-mono`}>
                    <div className="text-[10px] text-slate-400">
                      Neto: {formatCurrency(extComputedTotals.netoGravado, extMoneda)} • IVA: {formatCurrency(extComputedTotals.ivaTotal, extMoneda)}
                    </div>
                    <div className="text-base font-black text-emerald-400">
                      TOTAL: {formatCurrency(extComputedTotals.importeTotal, extMoneda)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Paso 4: Vincular Contratos de Alquiler y Partes Diarios (SOLO en Alquileres) */}
              {!isVentasScope && (
              <div className="bg-slate-950/80 border border-indigo-500/35 rounded-xl p-4 space-y-3">
                <div className="text-[11px] font-black text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Link2 className="w-4 h-4 text-indigo-400" />
                  4. Vincular Contratos de Alquiler y Partes Diarios (con Absorción Automática)
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Contratos */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="text-[10px] font-bold text-indigo-300 uppercase">
                      Contratos de Alquiler ({extRentalIds.length} vinculados)
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                      {(dbRentals.length ? dbRentals : rentals).length === 0 ? (
                        <p className="text-slate-500 text-[11px]">No hay contratos cargados.</p>
                      ) : (
                        (dbRentals.length ? dbRentals : rentals).map(r => {
                          const checked = extRentalIds.includes(r.id);
                          const rPartes = getPartesIdsForRental(r);
                          return (
                            <label
                              key={r.id}
                              className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer text-[11px] ${
                                checked ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200 font-bold' : 'bg-slate-950/70 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const adding = !extRentalIds.includes(r.id);
                                    setExtRentalIds(prev => adding ? [...prev, r.id] : prev.filter(id => id !== r.id));
                                    if (adding && rPartes.length > 0) {
                                      setExtPartesIds(prev => Array.from(new Set([...prev, ...rPartes])));
                                    }
                                  }}
                                  className="rounded accent-indigo-500"
                                />
                                <span className="font-mono text-indigo-300">{r.numeroContrato || r.numero}</span>
                                <span className="truncate">{r.clienteNombre}</span>
                              </div>
                              {rPartes.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[9px] shrink-0">
                                  {rPartes.length} parte{rPartes.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Partes Diarios */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-amber-300 uppercase">
                        Partes Diarios ({extPartesIds.length} vinculados)
                      </span>
                      <input
                        type="text"
                        value={extParteSearch}
                        onChange={e => setExtParteSearch(e.target.value)}
                        placeholder="Filtrar parte..."
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-[11px] text-white w-36 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                      {partesDiarios
                        .filter(p => {
                          const q = extParteSearch.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            (p.numParte || '').toLowerCase().includes(q) ||
                            (p.obra || '').toLowerCase().includes(q) ||
                            (p.marcaModelo || '').toLowerCase().includes(q) ||
                            (p.codigoEquipo || '').toLowerCase().includes(q) ||
                            (p.nombreApellido || '').toLowerCase().includes(q) ||
                            (p.rentalNumero || '').toLowerCase().includes(q)
                          );
                        })
                        .slice()
                        .sort((a, b) => Number(extPartesIds.includes(b.id)) - Number(extPartesIds.includes(a.id)))
                        .slice(0, 60)
                        .map(p => {
                          const checked = extPartesIds.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer text-[11px] ${
                                checked ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 font-bold' : 'bg-slate-950/70 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setExtPartesIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                                  className="rounded accent-amber-500"
                                />
                                <span className="font-mono text-amber-300">#{p.numParte}</span>
                                <span className="truncate">{p.fecha} • {p.obra} • {p.marcaModelo || p.codigoEquipo}</span>
                              </div>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsExternalModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black shadow-lg shadow-orange-950/40 flex items-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  {isVentasScope ? 'Guardar Factura de Otro Sistema' : 'Guardar Factura de Otro Sistema y Vincular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ClientDirectoryModal
        isOpen={isClientDirectoryOpen}
        onClose={() => setIsClientDirectoryOpen(false)}
        onClientsUpdated={(updatedList) => setDbClients(updatedList)}
        onSelectClient={
          isExternalModalOpen
            ? (selected) => {
                applyClientRecordToExternal(selected);
                setIsClientDirectoryOpen(false);
              }
            : isEmitModalOpen
              ? (selected) => {
                  applyClientRecordToInvoice(selected);
                  setIsClientDirectoryOpen(false);
                }
              : undefined
        }
      />

      {/* MODAL REFERENCIA: Listado de Partes Diarios Vinculados a la Factura */}
      {refPartesModalData && (
        <div
          className="fixed inset-0 z-[55] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRefPartesModalData(null)}
        >
          <div
            className="bg-[#16191F] border border-amber-500/40 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-black text-white">
                    Partes Diarios Vinculados ({refPartesModalData.partes.length})
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  {formatInvoiceLabel(refPartesModalData.invoice)} • {refPartesModalData.invoice.razonSocialReceptor}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRefPartesModalData(null)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const totalHs = refPartesModalData.partes.reduce((a, p) => a + Number(p.horasTrabajadas || p.hsCantidad || 0), 0);
              const totalViajes = refPartesModalData.partes.reduce((a, p) => a + Number(p.viajesCantidad || 0), 0);
              const totalM3 = refPartesModalData.partes.reduce((a, p) => a + Number(p.totalM3 || 0), 0);
              const conFoto = refPartesModalData.partes.filter(p => Boolean(p.fotoUrl)).length;
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-6 py-3 bg-slate-950/60 border-b border-slate-800 text-xs">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Total Partes</div>
                    <div className="text-sm font-black text-amber-300 font-mono">{refPartesModalData.partes.length}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Horas Totales</div>
                    <div className="text-sm font-black text-white font-mono">{totalHs.toLocaleString('es-AR')} hs</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Viajes / M³</div>
                    <div className="text-sm font-black text-cyan-300 font-mono">
                      {totalViajes > 0 ? `${totalViajes} viajes` : totalM3 > 0 ? `${totalM3} m³` : '0'}
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Con Foto Adjunta</div>
                    <div className="text-sm font-black text-emerald-300 font-mono">{conFoto}</div>
                  </div>
                </div>
              );
            })()}

            <div className="p-5 overflow-y-auto space-y-2.5 flex-1">
              {[...refPartesModalData.partes]
                .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
                .map(p => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setRefSingleParteToView(p)}
                    className="w-full text-left bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-500/40 rounded-xl p-3.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35 text-xs font-mono font-black">
                          Parte #{p.numParte}
                        </span>
                        <span className="text-xs font-mono text-slate-300 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {p.fecha}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] font-bold">
                          {p.tipo}
                        </span>
                        {p.fotoUrl && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                            <Camera className="w-3 h-3" /> Con Foto
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-white font-bold flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5 text-indigo-400" />
                          {p.codigoEquipo ? `[${p.codigoEquipo}] ` : ''}{p.marcaModelo || 'Equipo sin especificar'}
                        </span>
                        {p.obra && (
                          <span className="text-slate-300 font-normal flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                            {p.obra}
                          </span>
                        )}
                      </div>
                      {(p.nombreApellido || p.detalleTipo || p.detalleOtro || p.novedades) && (
                        <div className="text-[11px] text-slate-400 truncate">
                          {p.nombreApellido ? `Operador: ${p.nombreApellido}` : ''}
                          {p.nombreApellido && (p.detalleTipo || p.detalleOtro || p.novedades) ? ' • ' : ''}
                          {p.detalleTipo || p.detalleOtro || p.novedades || ''}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <div className="text-right font-mono">
                        <div className="text-sm font-black text-amber-300">
                          {p.horasTrabajadas
                            ? `${p.horasTrabajadas} hs`
                            : p.viajesCantidad
                            ? `${p.viajesCantidad} viajes`
                            : p.totalM3
                            ? `${p.totalM3} m³`
                            : '1 jornada'}
                        </div>
                        {p.odomKilom ? (
                          <div className="text-[10px] text-slate-400">Odóm/Horóm: {p.odomKilom}</div>
                        ) : null}
                      </div>
                      <span className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 group-hover:bg-amber-500 text-amber-300 group-hover:text-black text-xs font-bold flex items-center gap-1 transition">
                        <Eye className="w-3.5 h-3.5" />
                        Ver Parte
                      </span>
                    </div>
                  </button>
                ))}
            </div>

            <div className="px-6 py-3.5 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const invToEdit = refPartesModalData.invoice;
                  setRefPartesModalData(null);
                  openInvoiceLinkModal(invToEdit);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" /> Editar Vínculos de Partes
              </button>
              <button
                type="button"
                onClick={() => setRefPartesModalData(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REFERENCIA: Pagos Asociados & Estado de Cobro de la Factura */}
      {refPaymentsModalInvoice && (() => {
        const payInv = refPaymentsModalInvoice;
        const payReceipts = receiptsByInvoiceId.get(payInv.id) || [];
        const payNCs = creditNotesByInvoiceId.get(payInv.id) || [];
        const payResolved = resolvedLinksByInvoiceId.get(payInv.id);
        const totalInv = Number(payInv.importeTotal || 0);
        const totalByReceipts = payReceipts.reduce((acc, r) => acc + Number(r.totalImputado || r.montoCobrado || 0), 0);
        const totalByNCs = payNCs.reduce((acc, nc) => acc + Number(nc.importeTotal || 0), 0);
        const rawCobrado = Math.max(Number(payInv.montoCobrado || 0), totalByReceipts + totalByNCs);
        const efectivoCobrado = payResolved?.estadoCobro === 'PAGADO' && rawCobrado <= 0 ? totalInv : rawCobrado;
        const saldoPend = payResolved?.estadoCobro === 'PAGADO' ? 0 : Math.max(0, totalInv - efectivoCobrado);
        const pctCobrado = totalInv > 0 ? Math.min(100, Math.round((efectivoCobrado / totalInv) * 100)) : 0;
        const isFullyAnnulledByNC = totalInv > 0 && totalByNCs >= totalInv - 0.01 && totalByReceipts <= 0;
        const modalEstado: 'ANULADA_NC' | 'PAGADO' | 'PARCIAL' | 'PENDIENTE_PAGO' =
          isFullyAnnulledByNC
            ? 'ANULADA_NC'
            : payResolved?.estadoCobro === 'PAGADO' || (totalInv > 0 && efectivoCobrado >= totalInv - 0.01)
            ? 'PAGADO'
            : payResolved?.estadoCobro === 'PARCIAL' || efectivoCobrado > 0
            ? 'PARCIAL'
            : 'PENDIENTE_PAGO';

        return (
          <div
            className="fixed inset-0 z-[55] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setRefPaymentsModalInvoice(null)}
          >
            <div
              className="bg-[#16191F] border border-emerald-500/40 rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-base font-black text-white">
                      Pagos Asociados & Estado de Cobro
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {formatInvoiceLabel(payInv)} • {payInv.razonSocialReceptor} ({payInv.fecha})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRefPaymentsModalInvoice(null)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Resumen financiero */}
              <div className="px-6 py-4 bg-slate-950/60 border-b border-slate-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Total Factura</div>
                    <div className="text-base font-black text-white font-mono mt-0.5">
                      {formatCurrency(totalInv, payInv.moneda)}
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-3">
                    <div className="text-[10px] text-emerald-300 uppercase font-bold">Cobrado / Imputado</div>
                    <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                      {formatCurrency(efectivoCobrado, payInv.moneda)}
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-3">
                    <div className="text-[10px] text-rose-300 uppercase font-bold">Saldo Pendiente</div>
                    <div className={`text-base font-black font-mono mt-0.5 ${saldoPend <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatCurrency(saldoPend, payInv.moneda)}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-300">
                      Estado actual:{' '}
                      <span className={
                        modalEstado === 'ANULADA_NC'
                          ? 'text-purple-300'
                          : modalEstado === 'PAGADO'
                          ? 'text-emerald-400'
                          : modalEstado === 'PARCIAL'
                          ? 'text-amber-300'
                          : 'text-rose-400'
                      }>
                        {modalEstado === 'ANULADA_NC'
                          ? '✓ ANULADA POR NOTA DE CRÉDITO'
                          : modalEstado === 'PAGADO'
                          ? '✓ PAGADO / COBRADO'
                          : modalEstado === 'PARCIAL'
                          ? '⏳ PAGO PARCIAL'
                          : '⏳ PENDIENTE DE PAGO'}
                      </span>
                    </span>
                    <span className="font-mono text-slate-400">
                      {modalEstado === 'ANULADA_NC' ? '100% anulada por NC' : `${pctCobrado}% cobrado`}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        modalEstado === 'ANULADA_NC'
                          ? 'bg-purple-500'
                          : pctCobrado >= 100
                          ? 'bg-emerald-500'
                          : pctCobrado > 0
                          ? 'bg-amber-400'
                          : 'bg-rose-500/40'
                      }`}
                      style={{ width: `${pctCobrado}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="p-5 overflow-y-auto space-y-3 flex-1">
                {payReceipts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Receipt className="w-4 h-4" />
                      Recibos de Cobro Imputados ({payReceipts.length})
                    </h4>
                    {payReceipts.map(rec => {
                      const retenciones =
                        Number(rec.retencionesIibb || 0) +
                        Number(rec.retencionesGanancias || 0) +
                        Number(rec.retencionesSussIva || 0) +
                        Number(rec.descuentoProntoPago || 0);
                      return (
                        <div
                          key={rec.id}
                          className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 text-xs font-mono font-black">
                                Recibo {rec.numeroRecibo}
                              </span>
                              <span className="text-xs font-mono text-slate-300 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                {rec.fecha}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[11px] font-bold">
                                {rec.formaPago.replace(/_/g, ' ')}
                              </span>
                              {rec.impactadoEnCaja && (
                                <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                                  Impactado en Caja
                                </span>
                              )}
                            </div>
                            <div className="text-right font-mono">
                              <div className="text-sm font-black text-emerald-400">
                                {formatCurrency(rec.totalImputado || rec.montoCobrado, rec.moneda)}
                              </div>
                              {retenciones > 0 && (
                                <div className="text-[10px] text-slate-400">
                                  Neto: {formatCurrency(rec.montoCobrado, rec.moneda)} + Ret/Desc: {formatCurrency(retenciones, rec.moneda)}
                                </div>
                              )}
                            </div>
                          </div>
                          {(rec.bancoReferencia || rec.observaciones) && (
                            <div className="text-xs text-slate-300 bg-slate-950/70 border border-slate-800/80 rounded-lg px-3 py-2 space-y-0.5">
                              {rec.bancoReferencia && (
                                <div>
                                  <span className="text-slate-400 font-semibold">Banco / Referencia:</span> {rec.bancoReferencia}
                                </div>
                              )}
                              {rec.observaciones && (
                                <div className="text-slate-400">{rec.observaciones}</div>
                              )}
                            </div>
                          )}
                          {rec.adjuntos && rec.adjuntos.length > 0 && (
                            <div className="pt-1 space-y-1.5">
                              <div className="text-[10px] font-bold uppercase text-emerald-300 flex items-center gap-1">
                                <Camera className="w-3 h-3" />
                                Fotos de Comprobantes ({rec.adjuntos.length})
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {rec.adjuntos.map(att => (
                                  <button
                                    key={att.id}
                                    type="button"
                                    onClick={() =>
                                      setPreviewReceiptPhoto({ url: att.url, nombre: att.nombre })
                                    }
                                    className="group relative w-20 h-16 rounded-lg overflow-hidden border border-slate-700 hover:border-emerald-400 bg-slate-950 cursor-pointer"
                                    title={`Ver ${att.nombre}`}
                                  >
                                    <img
                                      src={att.url}
                                      alt={att.nombre}
                                      className="w-full h-full object-cover group-hover:scale-105 transition"
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {payNCs.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-black text-purple-300 uppercase tracking-wider">
                      Notas de Crédito Asociadas ({payNCs.length})
                    </h4>
                    {payNCs.map(nc => (
                      <button
                        type="button"
                        key={nc.id}
                        onClick={() => {
                          setRefPaymentsModalInvoice(null);
                          handleViewInvoice(nc);
                        }}
                        className="w-full text-left bg-slate-900 hover:bg-purple-950/40 border border-purple-500/35 hover:border-purple-400 rounded-xl p-3 flex items-center justify-between gap-3 transition cursor-pointer group"
                        title={`Abrir ${formatInvoiceLabel(nc)}`}
                      >
                        <div>
                          <div className="text-xs font-black text-purple-300 group-hover:text-white font-mono flex items-center gap-1.5">
                            <span>{formatInvoiceLabel(nc)}</span>
                            <span className="text-[10px] font-sans font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30 inline-flex items-center gap-1">
                              <Eye className="w-3 h-3" /> Ver NC
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{nc.fecha} • {nc.razonSocialReceptor}</div>
                        </div>
                        <div className="text-sm font-black text-purple-300 font-mono shrink-0">
                          -{formatCurrency(nc.importeTotal, nc.moneda)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {(payInv.fechaCobro || payInv.formaPagoCobro || payInv.reciboCobroNumero) && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs space-y-1">
                    <div className="text-[10px] text-cyan-300 font-bold uppercase">Registro Directo en Factura</div>
                    <div className="text-slate-200 flex flex-wrap gap-x-4 gap-y-1">
                      {payInv.fechaCobro && <span><strong>Fecha Cobro:</strong> {payInv.fechaCobro}</span>}
                      {payInv.formaPagoCobro && <span><strong>Medio:</strong> {payInv.formaPagoCobro}</span>}
                      {payInv.reciboCobroNumero && <span><strong>Recibo Nº:</strong> {payInv.reciboCobroNumero}</span>}
                    </div>
                  </div>
                )}

                {payReceipts.length === 0 && payNCs.length === 0 && !payInv.fechaCobro && !payInv.reciboCobroNumero && (
                  <div className="bg-slate-900/70 border border-dashed border-slate-700 rounded-xl p-6 text-center space-y-2">
                    <Clock className="w-8 h-8 text-slate-500 mx-auto" />
                    <div className="text-sm font-bold text-slate-300">
                      Todavía no hay recibos de cobro imputados a esta factura
                    </div>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Podés registrar un cobro en el módulo de <strong>Cobranzas</strong> para generar el recibo oficial, o actualizar manualmente el estado desde <strong>Editar Estado / Vínculos</strong>.
                    </p>
                  </div>
                )}
              </div>

              <div className="px-6 py-3.5 bg-slate-900/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {onNavigateToCobranzas && payNCs.length === 0 && modalEstado !== 'PAGADO' && modalEstado !== 'ANULADA_NC' && (
                    <button
                      type="button"
                      onClick={() => {
                        setRefPaymentsModalInvoice(null);
                        onNavigateToCobranzas();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Receipt className="w-3.5 h-3.5" /> Ir a Cobranzas / Registrar Pago
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setRefPaymentsModalInvoice(null);
                      openInvoiceLinkModal(payInv);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5" /> Editar Estado / Vínculos
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setRefPaymentsModalInvoice(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* LIGHTBOX: FOTO DE COMPROBANTE DE COBRANZA */}
      {previewReceiptPhoto && (
        <div
          className="fixed inset-0 z-[75] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewReceiptPhoto(null)}
        >
          <div
            className="relative max-w-4xl max-h-[92vh] w-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xs">
              <span className="font-bold text-white truncate">{previewReceiptPhoto.nombre}</span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewReceiptPhoto.url}
                  download={previewReceiptPhoto.nombre}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewReceiptPhoto(null)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <img
              src={previewReceiptPhoto.url}
              alt={previewReceiptPhoto.nombre}
              className="max-h-[80vh] max-w-full object-contain rounded-xl border border-slate-700 shadow-2xl bg-slate-950"
            />
          </div>
        </div>
      )}

      {/* MODAL REFERENCIA: Detalle de Contrato de Alquiler */}
      <RentalDetailModal
        isOpen={Boolean(refRentalToView)}
        contract={refRentalToView}
        onClose={() => setRefRentalToView(null)}
        partesDiarios={partesDiarios}
        invoices={invoices}
        fleet={fleet}
        onNavigateToCobranzas={onNavigateToCobranzas}
      />

      {/* MODAL REFERENCIA: Detalle de Parte Diario */}
      <ParteDiarioDetailModal
        isOpen={Boolean(refSingleParteToView)}
        onClose={() => setRefSingleParteToView(null)}
        parte={refSingleParteToView}
        employees={drivers}
        rentals={rentals}
        invoices={invoices}
        fleet={fleet}
        partesDiarios={partesDiarios}
        onNavigateToCobranzas={onNavigateToCobranzas}
      />
    </div>
  );
};
