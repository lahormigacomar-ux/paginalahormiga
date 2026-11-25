import React, { useEffect, useMemo, useState } from 'react';
import {
  ArcaCondicionIva,
  ArcaConfig,
  ArcaInvoice,
  ArcaInvoiceItem,
  ArcaRemito,
  ArcaRemitoItem,
  ArcaTipoComprobante,
  DocumentBagItem,
  Proveedor,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  RemitoMotivoTraslado,
  RentalContract,
} from '../types';
import {
  Building2,
  Check,
  Eye,
  Layers,
  Loader2,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
  Truck,
  X,
} from 'lucide-react';

interface AiInvoiceRemitoReviewModalProps {
  isOpen: boolean;
  mode: 'FACTURA' | 'REMITO';
  docItem: DocumentBagItem | null;
  aiData: Record<string, any> | null;
  arcaConfig: ArcaConfig;
  proveedores: Proveedor[];
  rentals: RentalContract[];
  onClose: () => void;
  onAcceptVentaInvoice: (
    invoice: ArcaInvoice,
    docItem: DocumentBagItem
  ) => Promise<boolean>;
  onAcceptPurchaseInvoice: (
    invoice: PurchaseInvoice,
    newProveedorIfNeeded: Proveedor | null,
    docItem: DocumentBagItem
  ) => Promise<boolean>;
  onAcceptRemito: (
    remito: ArcaRemito,
    isEditFlagForCustomNumber: boolean,
    docItem: DocumentBagItem
  ) => Promise<boolean>;
}

const VALID_TIPOS: ArcaTipoComprobante[] = [
  'FACTURA_A',
  'FACTURA_B',
  'FACTURA_C',
  'FACTURA_X',
  'NOTA_CREDITO_A',
  'NOTA_CREDITO_B',
  'NOTA_CREDITO_C',
  'NOTA_CREDITO_X',
];

const MOTIVO_OPTIONS: Array<{ value: RemitoMotivoTraslado; label: string }> = [
  { value: 'ALQUILER_MAQUINARIA_OBRA', label: 'Alquiler de Maquinaria / Equipo en Obra' },
  { value: 'TRASLADO_SERVICIO_VIAL', label: 'Traslado por Servicio de Movimiento de Suelo / Vial' },
  { value: 'RETIRO_DEVOLUCION_EQUIPO', label: 'Retiro / Devolución de Equipo a Base' },
  { value: 'ENTREGA_ARIDOS_MATERIALES', label: 'Entrega de Áridos / Materiales / Insumos' },
  { value: 'TRASLADO_INTERNO_TALLER', label: 'Traslado Interno entre Obras / Base / Taller' },
];

function normalizeCondicionIva(raw?: string): ArcaCondicionIva {
  const up = (raw || '').toUpperCase();
  if (up.includes('MONOTRIB')) return 'MONOTRIBUTO';
  if (up.includes('EXENT')) return 'EXENTO';
  if (up.includes('CONSUMIDOR') || up.includes('FINAL')) return 'CONSUMIDOR_FINAL';
  return 'RESPONSABLE_INSCRIPTO';
}

function normalizeTipoComprobante(raw?: string): ArcaTipoComprobante {
  const up = (raw || '').toUpperCase().replace(/\s+/g, '_');
  if (VALID_TIPOS.includes(up as ArcaTipoComprobante)) {
    return up as ArcaTipoComprobante;
  }
  if (up.includes('NOTA') && up.includes('CREDITO')) {
    if (up.endsWith('B')) return 'NOTA_CREDITO_B';
    if (up.endsWith('C')) return 'NOTA_CREDITO_C';
    if (up.endsWith('X')) return 'NOTA_CREDITO_X';
    return 'NOTA_CREDITO_A';
  }
  if (up.includes('_B') || up === 'B') return 'FACTURA_B';
  if (up.includes('_C') || up === 'C') return 'FACTURA_C';
  if (up.includes('_X') || up === 'X') return 'FACTURA_X';
  return 'FACTURA_A';
}

function normalizeMotivo(raw?: string): RemitoMotivoTraslado {
  const up = (raw || '').toUpperCase();
  const found = MOTIVO_OPTIONS.find((m) => m.value === up);
  if (found) return found.value;
  if (up.includes('ARIDO') || up.includes('MATERIAL')) return 'ENTREGA_ARIDOS_MATERIALES';
  if (up.includes('RETIRO') || up.includes('DEVOL')) return 'RETIRO_DEVOLUCION_EQUIPO';
  if (up.includes('TALLER') || up.includes('INTERNO')) return 'TRASLADO_INTERNO_TALLER';
  if (up.includes('VIAL') || up.includes('SUELO')) return 'TRASLADO_SERVICIO_VIAL';
  return 'ALQUILER_MAQUINARIA_OBRA';
}

export const AiInvoiceRemitoReviewModal: React.FC<AiInvoiceRemitoReviewModalProps> = ({
  isOpen,
  mode,
  docItem,
  aiData,
  arcaConfig,
  proveedores,
  rentals,
  onClose,
  onAcceptVentaInvoice,
  onAcceptPurchaseInvoice,
  onAcceptRemito,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(true);

  // ==================== FACTURA STATE ====================
  const [origenSistema, setOrigenSistema] = useState<'SISTEMA' | 'OTRO_SISTEMA'>('SISTEMA');
  const [sistemaOrigenNombre, setSistemaOrigenNombre] = useState('Otro Sistema / Migración');
  const [operacion, setOperacion] = useState<'VENTA' | 'COMPRA'>('VENTA');

  const [tipoComprobante, setTipoComprobante] = useState<ArcaTipoComprobante>('FACTURA_A');
  const [puntoVenta, setPuntoVenta] = useState<number>(7);
  const [numeroComprobante, setNumeroComprobante] = useState<number>(1);
  const [fecha, setFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fechaVencimiento, setFechaVencimiento] = useState<string>('');
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
  const [condicionVenta, setCondicionVenta] = useState<string>('CUENTA CORRIENTE');
  const [remitoPedido, setRemitoPedido] = useState<string>('');
  const [cae, setCae] = useState<string>('');
  const [vencimientoCae, setVencimientoCae] = useState<string>('');
  const [estadoPagoCobro, setEstadoPagoCobro] = useState<'PENDIENTE_PAGO' | 'PAGADO'>('PENDIENTE_PAGO');

  // Contraparte (Receptor para Venta / Proveedor para Compra)
  const [contraparteNombre, setContraparteNombre] = useState<string>('');
  const [contraparteCuit, setContraparteCuit] = useState<string>('');
  const [contraparteCondIva, setContraparteCondIva] = useState<ArcaCondicionIva>('RESPONSABLE_INSCRIPTO');
  const [contraparteDomicilio, setContraparteDomicilio] = useState<string>('');
  const [selectedProveedorId, setSelectedProveedorId] = useState<string>('');
  const [selectedRentalId, setSelectedRentalId] = useState<string>('');

  const [invoiceItems, setInvoiceItems] = useState<ArcaInvoiceItem[]>([]);
  const [netoGravado, setNetoGravado] = useState<number>(0);
  const [ivaTotal, setIvaTotal] = useState<number>(0);
  const [percepcionIibb, setPercepcionIibb] = useState<number>(0);
  const [percepcionIva, setPercepcionIva] = useState<number>(0);
  const [impuestoIcl, setImpuestoIcl] = useState<number>(0);
  const [impuestoIdc, setImpuestoIdc] = useState<number>(0);
  const [tasaVial, setTasaVial] = useState<number>(0);
  const [otrosImpuestos, setOtrosImpuestos] = useState<number>(0);
  const [importeTotal, setImporteTotal] = useState<number>(0);
  const [observaciones, setObservaciones] = useState<string>('');

  // ==================== REMITO STATE ====================
  const [remitoModoNumero, setRemitoModoNumero] = useState<'ESCANEO' | 'NUEVO_ARCA'>('ESCANEO');
  const [remLetra, setRemLetra] = useState<'R' | 'X'>('R');
  const [remPuntoVenta, setRemPuntoVenta] = useState<number>(8);
  const [remNumero, setRemNumero] = useState<number>(1);
  const [remFecha, setRemFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [remCai, setRemCai] = useState<string>('');
  const [remVencimientoCai, setRemVencimientoCai] = useState<string>('');
  const [remReceptorNombre, setRemReceptorNombre] = useState<string>('');
  const [remReceptorCuit, setRemReceptorCuit] = useState<string>('');
  const [remReceptorCondIva, setRemReceptorCondIva] = useState<ArcaCondicionIva>('RESPONSABLE_INSCRIPTO');
  const [remDomicilio, setRemDomicilio] = useState<string>('');
  const [remLocalidad, setRemLocalidad] = useState<string>('SAN SALVADOR DE JUJUY');
  const [remObraDestino, setRemObraDestino] = useState<string>('');
  const [remLugarEntrega, setRemLugarEntrega] = useState<string>('');
  const [remMotivo, setRemMotivo] = useState<RemitoMotivoTraslado>('ALQUILER_MAQUINARIA_OBRA');
  const [remOrigenTraslado, setRemOrigenTraslado] = useState<string>('ALTE. BROWN 1560 - SAN SALVADOR DE JUJUY');
  const [remTransportista, setRemTransportista] = useState<string>('');
  const [remChofer, setRemChofer] = useState<string>('');
  const [remChoferDni, setRemChoferDni] = useState<string>('');
  const [remVehiculo, setRemVehiculo] = useState<string>('');
  const [remPatenteChasis, setRemPatenteChasis] = useState<string>('');
  const [remPatenteAcoplado, setRemPatenteAcoplado] = useState<string>('');
  const [remComprobanteAssoc, setRemComprobanteAssoc] = useState<string>('');
  const [remObservaciones, setRemObservaciones] = useState<string>('');
  const [remItems, setRemItems] = useState<ArcaRemitoItem[]>([]);

  // Populate fields from AI data when opened
  useEffect(() => {
    if (!isOpen || !aiData) return;
    setErrorMsg(null);
    setIsSaving(false);

    if (mode === 'FACTURA') {
      const nat = String(aiData.sugerenciaNaturaleza || '').toUpperCase();
      const detectedOp: 'VENTA' | 'COMPRA' = nat === 'COMPRA' ? 'COMPRA' : 'VENTA';
      setOperacion(detectedOp);
      setOrigenSistema('SISTEMA');
      setSistemaOrigenNombre('Otro Sistema / Migración');

      setTipoComprobante(normalizeTipoComprobante(aiData.tipoComprobante));
      setPuntoVenta(Number(aiData.puntoVenta || (detectedOp === 'VENTA' ? arcaConfig.puntoVenta || 7 : 1)));
      setNumeroComprobante(Number(aiData.numeroComprobante || 1));
      setFecha(aiData.fecha || new Date().toISOString().slice(0, 10));
      setFechaVencimiento(aiData.fechaVencimiento || '');
      setMoneda(String(aiData.moneda || '').toUpperCase() === 'USD' ? 'USD' : 'ARS');
      setCondicionVenta(aiData.condicionVenta || 'CUENTA CORRIENTE');
      setRemitoPedido(aiData.remitoPedido || '');
      setCae(aiData.cae || '');
      setVencimientoCae(aiData.vencimientoCae || '');
      setEstadoPagoCobro('PENDIENTE_PAGO');
      setSelectedRentalId('');

      if (detectedOp === 'VENTA') {
        setContraparteNombre(aiData.razonSocialReceptor || '');
        setContraparteCuit(aiData.nroDocReceptor || '');
        setContraparteCondIva(normalizeCondicionIva(aiData.condicionIvaReceptor));
        setContraparteDomicilio(aiData.domicilioReceptor || '');
        setSelectedProveedorId('');
      } else {
        const emisorName = aiData.razonSocialEmisor || '';
        const emisorCuit = aiData.cuitEmisor || '';
        setContraparteNombre(emisorName);
        setContraparteCuit(emisorCuit);
        setContraparteCondIva(normalizeCondicionIva(aiData.condicionIvaEmisor));
        setContraparteDomicilio('');
        const cleanCuit = emisorCuit.replace(/\D/g, '');
        const matchedProv = proveedores.find(
          (p) =>
            (cleanCuit && p.cuit.replace(/\D/g, '') === cleanCuit) ||
            (emisorName && p.razonSocial.toLowerCase().includes(emisorName.toLowerCase()))
        );
        setSelectedProveedorId(matchedProv ? matchedProv.id : '');
      }

      const rawItems = Array.isArray(aiData.items) ? aiData.items : [];
      const mappedItems: ArcaInvoiceItem[] =
        rawItems.length > 0
          ? rawItems.map((it: any, idx: number) => {
              const cant = Number(it.cantidad || 1);
              const pu = Number(it.precioUnitario || 0);
              const sub = Number(it.subtotal || cant * pu);
              return {
                codigo: it.codigo || String(idx + 1).padStart(2, '0'),
                descripcion: it.descripcion || 'Concepto facturado',
                cantidad: cant,
                unidadMedida: it.unidadMedida || 'UNI',
                precioUnitario: pu,
                bonificacionPorcentaje: 0,
                subtotal: sub,
                alicuotaIva: Number(it.alicuotaIva ?? 21),
              };
            })
          : [
              {
                codigo: '01',
                descripcion: aiData.observaciones || 'Concepto según comprobante escaneado',
                cantidad: 1,
                unidadMedida: 'UNI',
                precioUnitario: Number(aiData.netoGravado || aiData.importeTotal || 0),
                bonificacionPorcentaje: 0,
                subtotal: Number(aiData.netoGravado || aiData.importeTotal || 0),
                alicuotaIva: Number(aiData.ivaTotal || 0) > 0 ? 21 : 0,
              },
            ];
      setInvoiceItems(mappedItems);

      const neto = Number(aiData.netoGravado || 0);
      const iva = Number(aiData.ivaTotal || 0);
      const iibb = Number(aiData.percepcionIibb || 0);
      const pIva = Number(aiData.percepcionIva || 0);
      const icl = Number(aiData.impuestoIcl || 0);
      const idc = Number(aiData.impuestoIdc || 0);
      const tv = Number(aiData.tasaVial || 0);
      const otros = Number(aiData.otrosImpuestos || 0);
      const total = Number(aiData.importeTotal || neto + iva + iibb + pIva + icl + idc + tv + otros);

      setNetoGravado(neto);
      setIvaTotal(iva);
      setPercepcionIibb(iibb);
      setPercepcionIva(pIva);
      setImpuestoIcl(icl);
      setImpuestoIdc(idc);
      setTasaVial(tv);
      setOtrosImpuestos(otros);
      setImporteTotal(total);
      setObservaciones(aiData.observaciones || '');
    } else {
      // REMITO
      const hasScannedNum = Number(aiData.numeroComprobante || 0) > 0;
      setRemitoModoNumero(hasScannedNum ? 'ESCANEO' : 'NUEVO_ARCA');
      setRemLetra(String(aiData.letra || '').toUpperCase() === 'X' ? 'X' : 'R');
      setRemPuntoVenta(Number(aiData.puntoVenta || arcaConfig.puntoVentaRemito || 8));
      setRemNumero(Number(aiData.numeroComprobante || 1));
      setRemFecha(aiData.fecha || new Date().toISOString().slice(0, 10));
      setRemCai(aiData.cai || arcaConfig.caiRemito || '');
      setRemVencimientoCai(aiData.vencimientoCai || arcaConfig.vencimientoCaiRemito || '');
      setRemReceptorNombre(aiData.razonSocialReceptor || '');
      setRemReceptorCuit(aiData.nroDocReceptor || '');
      setRemReceptorCondIva(normalizeCondicionIva(aiData.condicionIvaReceptor));
      setRemDomicilio(aiData.domicilioReceptor || '');
      setRemLocalidad(aiData.localidadReceptor || 'SAN SALVADOR DE JUJUY');
      setRemObraDestino(aiData.obraDestino || '');
      setRemLugarEntrega(aiData.lugarEntrega || aiData.domicilioReceptor || '');
      setRemMotivo(normalizeMotivo(aiData.motivoTraslado));
      setRemOrigenTraslado(aiData.origenTraslado || 'ALTE. BROWN 1560 - SAN SALVADOR DE JUJUY');
      setRemTransportista(aiData.transportistaNombre || arcaConfig.razonSocial || 'EL HORNOCAL S.R.L.');
      setRemChofer(aiData.choferNombre || '');
      setRemChoferDni(aiData.choferDni || '');
      setRemVehiculo(aiData.vehiculoTransporte || '');
      setRemPatenteChasis(aiData.patenteChasis || '');
      setRemPatenteAcoplado(aiData.patenteAcoplado || '');
      setRemComprobanteAssoc(aiData.comprobanteAsociadoTexto || '');
      setRemObservaciones(aiData.observaciones || '');

      const rawRemItems = Array.isArray(aiData.items) ? aiData.items : [];
      setRemItems(
        rawRemItems.length > 0
          ? rawRemItems.map((it: any, idx: number) => ({
              codigo: it.codigo || String(idx + 1).padStart(2, '0'),
              descripcion: it.descripcion || 'Material / Equipo trasladado',
              cantidad: Number(it.cantidad || 1),
              unidadMedida: it.unidadMedida || 'UNI',
              detalleSerieOrInterno: it.detalleSerieOrInterno || '',
            }))
          : [
              {
                codigo: '01',
                descripcion: 'TRASLADO / ENTREGA SEGÚN REMITO ESCANEADO',
                cantidad: 1,
                unidadMedida: 'UNI',
                detalleSerieOrInterno: '',
              },
            ]
      );
    }
  }, [isOpen, aiData, mode, arcaConfig, proveedores]);

  // Switch between VENTA and COMPRA contraparte info cleanly if user toggles
  const handleSwitchOperacion = (nextOp: 'VENTA' | 'COMPRA') => {
    setOperacion(nextOp);
    if (!aiData) return;
    if (nextOp === 'VENTA') {
      setContraparteNombre(aiData.razonSocialReceptor || contraparteNombre || '');
      setContraparteCuit(aiData.nroDocReceptor || contraparteCuit || '');
      setContraparteCondIva(normalizeCondicionIva(aiData.condicionIvaReceptor));
      setContraparteDomicilio(aiData.domicilioReceptor || '');
    } else {
      const emisorName = aiData.razonSocialEmisor || '';
      const emisorCuit = aiData.cuitEmisor || '';
      if (emisorName && !emisorName.toUpperCase().includes('HORNOCAL')) {
        setContraparteNombre(emisorName);
        setContraparteCuit(emisorCuit);
        setContraparteCondIva(normalizeCondicionIva(aiData.condicionIvaEmisor));
      }
      const cleanCuit = (emisorCuit || contraparteCuit).replace(/\D/g, '');
      const matched = proveedores.find(
        (p) =>
          (cleanCuit && p.cuit.replace(/\D/g, '') === cleanCuit) ||
          (emisorName && p.razonSocial.toLowerCase().includes(emisorName.toLowerCase()))
      );
      setSelectedProveedorId(matched ? matched.id : '');
    }
  };

  const handleRecalcFromItems = () => {
    const calcNeto = Number(
      invoiceItems.reduce((acc, it) => acc + Number(it.subtotal || it.cantidad * it.precioUnitario || 0), 0).toFixed(2)
    );
    const calcIva = Number(
      invoiceItems
        .reduce(
          (acc, it) =>
            acc + (Number(it.subtotal || it.cantidad * it.precioUnitario || 0) * Number(it.alicuotaIva || 0)) / 100,
          0
        )
        .toFixed(2)
    );
    const calcTotal = Number(
      (calcNeto + calcIva + percepcionIibb + percepcionIva + impuestoIcl + impuestoIdc + tasaVial + otrosImpuestos).toFixed(2)
    );
    setNetoGravado(calcNeto);
    setIvaTotal(calcIva);
    setImporteTotal(calcTotal);
  };

  const selectedRental = useMemo(
    () => rentals.find((r) => r.id === selectedRentalId) || null,
    [rentals, selectedRentalId]
  );

  if (!isOpen || !docItem) return null;

  const handleAcceptFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!contraparteNombre.trim()) {
      setErrorMsg(
        operacion === 'VENTA'
          ? 'Ingresá la Razón Social del cliente/receptor.'
          : 'Ingresá la Razón Social del proveedor emisor.'
      );
      return;
    }

    const totalFinal = Number(importeTotal || 0);
    if (totalFinal <= 0) {
      setErrorMsg('El Importe Total debe ser mayor a $0.');
      return;
    }

    setIsSaving(true);
    try {
      if (operacion === 'VENTA') {
        const paddedPto = String(puntoVenta || 1).padStart(4, '0');
        const paddedNum = String(numeroComprobante || 1).padStart(8, '0');
        const isOtroSistema = origenSistema === 'OTRO_SISTEMA';
        const originLabel = isOtroSistema
          ? sistemaOrigenNombre.trim() || 'Otro Sistema (Migración)'
          : 'Sistema La Hormiga / ARCA';

        const invId = isOtroSistema
          ? `EXT-${paddedPto}-${paddedNum}-${Date.now().toString().slice(-4)}`
          : `ARCA-${paddedPto}-${paddedNum}-${Date.now().toString().slice(-4)}`;

        const newInvoice: ArcaInvoice = {
          id: invId,
          tipoComprobante,
          puntoVenta: Number(puntoVenta || 1),
          numeroComprobante: Number(numeroComprobante || 1),
          fecha,
          cuitEmisor: arcaConfig.cuit || '30-71499982-2',
          razonSocialEmisor: arcaConfig.razonSocial || 'EL HORNOCAL S.R.L.',
          condicionIvaEmisor: arcaConfig.condicionIva || 'RESPONSABLE_INSCRIPTO',
          tipoDocReceptor: contraparteCuit.replace(/\D/g, '').length >= 10 ? 'CUIT' : 'CONSUMIDOR_FINAL',
          nroDocReceptor: contraparteCuit.trim() || '0',
          razonSocialReceptor: contraparteNombre.trim().toUpperCase(),
          condicionIvaReceptor: contraparteCondIva,
          domicilioReceptor: contraparteDomicilio.trim() || undefined,
          condicionVenta: condicionVenta.trim() || 'CUENTA CORRIENTE',
          remitoPedido: remitoPedido.trim() || undefined,
          moneda,
          items: invoiceItems.map((it) => ({
            ...it,
            subtotal: Number(it.subtotal || it.cantidad * it.precioUnitario || 0),
          })),
          netoGravado: Number(netoGravado || 0),
          ivaTotal: Number(ivaTotal || 0),
          bonificacionTotal: 0,
          percepcionIibb: Number(percepcionIibb || 0),
          importeTotal: totalFinal,
          cae: cae.trim() || (isOtroSistema ? 'MIGRADA-OTRO-SISTEMA' : 'COMPROBANTE-INTERNO'),
          vencimientoCae: vencimientoCae.trim() || fecha,
          resultado: 'APROBADO',
          observacionesArca: isOtroSistema
            ? `Factura cargada desde otro sistema (${originLabel}) mediante análisis IA.`
            : `Factura del sistema cargada y verificada mediante análisis IA.${observaciones ? ' ' + observaciones : ''}`,
          origenRegistro: isOtroSistema ? 'OTRO_SISTEMA' : 'SISTEMA_INTERNO',
          sistemaOrigenNombre: originLabel,
          esMigradaOtroSistema: isOtroSistema,
          rentalId: selectedRental?.id,
          rentalNumero: selectedRental ? selectedRental.numeroContrato || selectedRental.numero : undefined,
          rentalIds: selectedRental ? [selectedRental.id] : undefined,
          partesDiariosIds: selectedRental?.partesDiariosIds || undefined,
          estadoCobro: estadoPagoCobro === 'PAGADO' ? 'PAGADO' : 'PENDIENTE_PAGO',
          montoCobrado: estadoPagoCobro === 'PAGADO' ? totalFinal : 0,
          saldoPendiente: estadoPagoCobro === 'PAGADO' ? 0 : totalFinal,
          createdAt: new Date().toISOString(),
        };

        const ok = await onAcceptVentaInvoice(newInvoice, docItem);
        if (ok) onClose();
      } else {
        // COMPRA (Proveedor)
        let provToUse = proveedores.find((p) => p.id === selectedProveedorId) || null;
        let newProv: Proveedor | null = null;
        if (!provToUse) {
          const cleanCuit = contraparteCuit.replace(/\D/g, '');
          provToUse =
            proveedores.find(
              (p) =>
                (cleanCuit && p.cuit.replace(/\D/g, '') === cleanCuit) ||
                p.razonSocial.toLowerCase().trim() === contraparteNombre.toLowerCase().trim()
            ) || null;
        }
        if (!provToUse) {
          const suffix = Date.now().toString().slice(-6);
          newProv = {
            id: `PROV-${suffix}`,
            codigo: `P-${suffix}`,
            razonSocial: contraparteNombre.trim().toUpperCase(),
            cuit: contraparteCuit.trim() || '00-00000000-0',
            rubroPrincipal: impuestoIcl > 0 || tasaVial > 0 ? 'COMBUSTIBLES_LUBRICANTES' : 'SERVICIOS',
            direccion: contraparteDomicilio.trim() || undefined,
            condicionIva: contraparteCondIva.replace(/_/g, ' '),
            incluyeEnIvaCompras: true,
          };
          provToUse = newProv;
        }

        const ptoStr = String(puntoVenta || 1).padStart(4, '0');
        const numStr = String(numeroComprobante || 1).padStart(8, '0');
        const purchaseTipo: PurchaseInvoice['tipoComprobante'] =
          tipoComprobante === 'FACTURA_B'
            ? 'FACTURA_B'
            : tipoComprobante === 'FACTURA_C'
            ? 'FACTURA_C'
            : tipoComprobante === 'NOTA_CREDITO_A'
            ? 'NOTA_CREDITO_A'
            : tipoComprobante === 'NOTA_CREDITO_B'
            ? 'NOTA_CREDITO_B'
            : 'FACTURA_A';

        const purchaseItems: PurchaseInvoiceItem[] = invoiceItems.map((it, idx) => ({
          id: `PI-${Date.now()}-${idx}`,
          codigo: it.codigo || String(idx + 1).padStart(2, '0'),
          descripcion: it.descripcion,
          cantidad: Number(it.cantidad || 1),
          unidadMedida: it.unidadMedida || 'UNI',
          precioUnitario: Number(it.precioUnitario || 0),
          subtotal: Number(it.subtotal || it.cantidad * it.precioUnitario || 0),
          tipoItem: impuestoIcl > 0 || tasaVial > 0 ? 'COMBUSTIBLE' : 'OTRO',
          modoImputacion: 'SIN_STOCK',
        }));

        const isOtroSistema = origenSistema === 'OTRO_SISTEMA';
        const originTag = isOtroSistema
          ? `[Cargada de Otro Sistema: ${sistemaOrigenNombre.trim() || 'Externo'}]`
          : '[Factura del Sistema]';

        const newPurchase: PurchaseInvoice = {
          id: `PUR-${Date.now().toString().slice(-6)}`,
          fechaEmision: fecha,
          fechaVencimiento: fechaVencimiento || undefined,
          categoriaCompra: impuestoIcl > 0 || tasaVial > 0 ? 'COMBUSTIBLE' : 'OTROS',
          tipoComprobante: purchaseTipo,
          puntoVenta: ptoStr,
          numeroComprobante: numStr,
          nroComprobanteCompleto: `${ptoStr}-${numStr}`,
          cae: cae.trim() || undefined,
          vencimientoCae: vencimientoCae.trim() || undefined,
          proveedorId: provToUse.id,
          proveedorNombre: provToUse.razonSocial,
          proveedorCuit: provToUse.cuit,
          proveedorCondicionIva: provToUse.condicionIva || contraparteCondIva,
          items: purchaseItems,
          netoGravado: Number(netoGravado || 0),
          netoGravado21: Number(netoGravado || 0),
          ivaMonto: Number(ivaTotal || 0),
          iva21: Number(ivaTotal || 0),
          percepcionIibb: Number(percepcionIibb || 0),
          percepcionIva: Number(percepcionIva || 0),
          impuestoIcl: Number(impuestoIcl || 0),
          impuestoIdc: Number(impuestoIdc || 0),
          tasaVial: Number(tasaVial || 0),
          otrosImpuestos: Number(otrosImpuestos || 0),
          montoTotal: totalFinal,
          remitosAsociadosIds: [],
          estado: estadoPagoCobro === 'PAGADO' ? 'PAGADO' : 'PENDIENTE_PAGO',
          saldoPendiente: estadoPagoCobro === 'PAGADO' ? 0 : totalFinal,
          archivoPdfUrl: docItem.url,
          archivosAdjuntos: [
            {
              id: `ADJ-${Date.now()}`,
              nombre: `Factura ${ptoStr}-${numStr}.webp`,
              url: docItem.url,
              tipo: 'FACTURA',
              fechaSubida: new Date().toISOString().slice(0, 10),
              tamanio: docItem.optimizedSizeKB ? `${docItem.optimizedSizeKB} KB` : undefined,
            },
          ],
          observaciones: `${originTag} ${observaciones}`.trim(),
          createdAt: new Date().toISOString(),
        };

        const ok = await onAcceptPurchaseInvoice(newPurchase, newProv, docItem);
        if (ok) onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAcceptRemitoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const validItems = remItems.filter((it) => it.descripcion.trim().length > 0);
    if (!remReceptorNombre.trim() || validItems.length === 0) {
      setErrorMsg('Completá el destinatario y al menos un ítem del remito.');
      return;
    }

    setIsSaving(true);
    try {
      const pto = Number(remPuntoVenta || 8);
      const num = Number(remNumero || 1);
      const useCustomNum = remitoModoNumero === 'ESCANEO';
      const newRemito: ArcaRemito = {
        id: useCustomNum
          ? `REM-SCAN-${String(pto).padStart(4, '0')}-${String(num).padStart(8, '0')}-${Date.now().toString().slice(-4)}`
          : '',
        puntoVenta: useCustomNum ? pto : Number(arcaConfig.puntoVentaRemito || 8),
        numeroComprobante: num,
        codigoAfip: remLetra === 'R' ? '091' : '000',
        letra: remLetra,
        fecha: remFecha,
        cuitEmisor: arcaConfig.cuit || '30-71499982-2',
        razonSocialEmisor: arcaConfig.razonSocial || 'EL HORNOCAL S.R.L.',
        condicionIvaEmisor: arcaConfig.condicionIva || 'RESPONSABLE_INSCRIPTO',
        tipoDocReceptor: remReceptorCuit.replace(/\D/g, '').length >= 10 ? 'CUIT' : 'CONSUMIDOR_FINAL',
        nroDocReceptor: remReceptorCuit.trim() || '0',
        razonSocialReceptor: remReceptorNombre.trim().toUpperCase(),
        condicionIvaReceptor: remReceptorCondIva,
        domicilioReceptor: remDomicilio.trim().toUpperCase(),
        localidadReceptor: remLocalidad.trim().toUpperCase(),
        obraDestino: remObraDestino.trim().toUpperCase() || undefined,
        lugarEntrega: (remLugarEntrega.trim() || remDomicilio.trim()).toUpperCase(),
        motivoTraslado: remMotivo,
        origenTraslado: remOrigenTraslado.trim().toUpperCase(),
        transportistaNombre: remTransportista.trim().toUpperCase() || 'EL HORNOCAL S.R.L.',
        choferNombre: remChofer.trim().toUpperCase(),
        choferDni: remChoferDni.trim() || undefined,
        vehiculoTransporte: remVehiculo.trim().toUpperCase(),
        patenteChasis: remPatenteChasis.trim().toUpperCase(),
        patenteAcoplado: remPatenteAcoplado.trim().toUpperCase() || undefined,
        items: validItems,
        observaciones: remObservaciones.trim() || undefined,
        comprobanteAsociadoTexto: remComprobanteAssoc.trim() || undefined,
        cai: remCai.trim() || arcaConfig.caiRemito || 'DIGITALIZADO-IA',
        vencimientoCai:
          remVencimientoCai.trim() ||
          arcaConfig.vencimientoCaiRemito ||
          new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
        estadoEntrega: 'ENTREGADO_CONFORME',
        createdAt: new Date().toISOString(),
      };

      const ok = await onAcceptRemito(newRemito, useCustomNum, docItem);
      if (ok) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => !isSaving && onClose()}
    >
      <div
        className="bg-[#14171F] border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-[#191D26] border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/30 shrink-0">
              {mode === 'FACTURA' ? <Receipt className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                  {mode === 'FACTURA'
                    ? 'Factura Analizada por IA — Lista para Aceptar'
                    : 'Remito Analizado por IA — Listo para Aceptar'}
                </h2>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Completado Automático
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                Revisá los campos detectados, elegí cómo registrarla y tocá Aceptar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowImagePreview((p) => !p)}
              className="min-h-[38px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-4 h-4 text-[#F0C800]" />
              <span className="hidden sm:inline">{showImagePreview ? 'Ocultar Foto' : 'Ver Foto'}</span>
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body: Image Side Preview + Pre-filled Form */}
        <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row">
          {showImagePreview && (
            <div className="lg:w-[320px] xl:w-[360px] shrink-0 bg-[#0B0D12] border-b lg:border-b-0 lg:border-r border-slate-800 p-4 flex flex-col gap-2">
              <div className="text-[11px] font-mono uppercase text-slate-400 font-bold">
                Foto Original ({docItem.optimizedSizeKB ? `${docItem.optimizedSizeKB} KB` : 'WebP'})
              </div>
              <a
                href={docItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl overflow-hidden border border-slate-800 bg-black"
                title="Abrir imagen completa en pestaña nueva"
              >
                <img
                  src={docItem.url}
                  alt="Comprobante analizado"
                  className="w-full max-h-[260px] lg:max-h-[540px] object-contain"
                />
              </a>
              {docItem.nota && (
                <div className="text-xs text-slate-300 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2">
                  Nota: {docItem.nota}
                </div>
              )}
            </div>
          )}

          {/* MAIN FORM */}
          {mode === 'FACTURA' ? (
            <form onSubmit={handleAcceptFactura} className="flex-1 p-4 sm:p-6 space-y-5 overflow-y-auto">
              {/* 1. ELECCIÓN EXPLÍCITA: FACTURA DEL SISTEMA VS FACTURA DE OTRO SISTEMA + VENTA/COMPRA */}
              <div className="bg-[#10131A] border border-[#F0C800]/30 rounded-2xl p-4 space-y-3.5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-[#F0C800] flex items-center gap-1.5">
                    <Layers className="w-4 h-4" />
                    1. Elegí el Origen del Comprobante
                  </span>
                  <div className="flex items-center gap-1.5 bg-[#0A0C10] p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleSwitchOperacion('VENTA')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                        operacion === 'VENTA'
                          ? 'bg-emerald-500 text-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Venta (Emitida / Cobrar)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchOperacion('COMPRA')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                        operacion === 'COMPRA'
                          ? 'bg-cyan-500 text-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Compra (Proveedor / Pagar)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setOrigenSistema('SISTEMA')}
                    className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                      origenSistema === 'SISTEMA'
                        ? 'bg-[#F0C800]/15 border-[#F0C800] text-white'
                        : 'bg-[#161922] border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                        origenSistema === 'SISTEMA'
                          ? 'border-[#F0C800] bg-[#F0C800] text-black'
                          : 'border-slate-600'
                      }`}
                    >
                      {origenSistema === 'SISTEMA' && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="text-sm font-black text-white">Factura del Sistema</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Comprobante registrado directamente en este sistema (ARCA / Compras actuales).
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrigenSistema('OTRO_SISTEMA')}
                    className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                      origenSistema === 'OTRO_SISTEMA'
                        ? 'bg-amber-500/15 border-amber-400 text-white'
                        : 'bg-[#161922] border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                        origenSistema === 'OTRO_SISTEMA'
                          ? 'border-amber-400 bg-amber-400 text-black'
                          : 'border-slate-600'
                      }`}
                    >
                      {origenSistema === 'OTRO_SISTEMA' && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="text-sm font-black text-white">Factura de Otro Sistema</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Emitida o cargada desde un sistema externo / anterior (queda marcada como migrada).
                      </div>
                    </div>
                  </button>
                </div>

                {origenSistema === 'OTRO_SISTEMA' && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-amber-300 mb-1">
                      Nombre del Sistema de Origen
                    </label>
                    <input
                      type="text"
                      value={sistemaOrigenNombre}
                      onChange={(e) => setSistemaOrigenNombre(e.target.value)}
                      placeholder="Ej: Sistema Anterior / AFIP Comprobantes en Línea / Estudio Contable"
                      className="w-full px-3.5 py-2 rounded-xl bg-[#0A0C10] border border-amber-500/40 text-xs sm:text-sm text-white focus:outline-none focus:border-[#F0C800]"
                    />
                  </div>
                )}
              </div>

              {/* 2. DATOS DEL COMPROBANTE */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Tipo Comprobante
                  </label>
                  <select
                    value={tipoComprobante}
                    onChange={(e) => setTipoComprobante(e.target.value as ArcaTipoComprobante)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-[#F0C800]"
                  >
                    <option value="FACTURA_A">Factura A</option>
                    <option value="FACTURA_B">Factura B</option>
                    <option value="FACTURA_C">Factura C</option>
                    <option value="FACTURA_X">Factura X (Interna)</option>
                    <option value="NOTA_CREDITO_A">Nota Crédito A</option>
                    <option value="NOTA_CREDITO_B">Nota Crédito B</option>
                    <option value="NOTA_CREDITO_C">Nota Crédito C</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Punto de Venta
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={puntoVenta}
                    onChange={(e) => setPuntoVenta(Number(e.target.value || 1))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-[#F0C800]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Número
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={numeroComprobante}
                    onChange={(e) => setNumeroComprobante(Number(e.target.value || 1))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-[#F0C800]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-[#F0C800]"
                  />
                </div>
              </div>

              {/* 3. CONTRAPARTE (CLIENTE O PROVEEDOR) */}
              <div className="bg-[#10131A] border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase text-slate-300 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-[#F0C800]" />
                    {operacion === 'VENTA' ? 'Datos del Cliente / Receptor' : 'Datos del Proveedor Emisor'}
                  </span>
                  {operacion === 'COMPRA' && proveedores.length > 0 && (
                    <select
                      value={selectedProveedorId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        setSelectedProveedorId(pid);
                        const p = proveedores.find((item) => item.id === pid);
                        if (p) {
                          setContraparteNombre(p.razonSocial);
                          setContraparteCuit(p.cuit);
                          setContraparteDomicilio(p.direccion || '');
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#161922] border border-slate-700 text-xs text-slate-200 max-w-xs"
                    >
                      <option value="">-- Proveedor nuevo / del ticket --</option>
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.razonSocial} ({p.cuit})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      Razón Social *
                    </label>
                    <input
                      type="text"
                      required
                      value={contraparteNombre}
                      onChange={(e) => setContraparteNombre(e.target.value)}
                      placeholder="Nombre o Razón Social"
                      className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-[#F0C800]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      CUIT / DNI
                    </label>
                    <input
                      type="text"
                      value={contraparteCuit}
                      onChange={(e) => setContraparteCuit(e.target.value)}
                      placeholder="30-00000000-0"
                      className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-[#F0C800]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      Condición IVA
                    </label>
                    <select
                      value={contraparteCondIva}
                      onChange={(e) => setContraparteCondIva(e.target.value as ArcaCondicionIva)}
                      className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                    >
                      <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                      <option value="MONOTRIBUTO">Monotributo</option>
                      <option value="EXENTO">Exento</option>
                      <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      CAE
                    </label>
                    <input
                      type="text"
                      value={cae}
                      onChange={(e) => setCae(e.target.value)}
                      placeholder="14 dígitos o opcional"
                      className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-[#F0C800]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      {operacion === 'VENTA' ? 'Estado de Cobro' : 'Estado de Pago'}
                    </label>
                    <select
                      value={estadoPagoCobro}
                      onChange={(e) => setEstadoPagoCobro(e.target.value as 'PENDIENTE_PAGO' | 'PAGADO')}
                      className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                    >
                      <option value="PENDIENTE_PAGO">Pendiente</option>
                      <option value="PAGADO">Pagado / Cobrado</option>
                    </select>
                  </div>
                </div>

                {operacion === 'VENTA' && rentals.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      Vincular a Contrato de Alquiler (Opcional)
                    </label>
                    <select
                      value={selectedRentalId}
                      onChange={(e) => setSelectedRentalId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                    >
                      <option value="">-- Sin contrato vinculado --</option>
                      {rentals.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.numeroContrato || r.numero} · {r.clienteNombre} ({r.obraDestino || 'Obra'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 4. ÍTEMS */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase text-slate-300">
                    Detalle / Ítems Detectados ({invoiceItems.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRecalcFromItems}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-cyan-300 cursor-pointer"
                    >
                      Recalcular Totales
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setInvoiceItems((prev) => [
                          ...prev,
                          {
                            codigo: String(prev.length + 1).padStart(2, '0'),
                            descripcion: '',
                            cantidad: 1,
                            unidadMedida: 'UNI',
                            precioUnitario: 0,
                            bonificacionPorcentaje: 0,
                            subtotal: 0,
                            alicuotaIva: 21,
                          },
                        ])
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[11px] font-black text-[#F0C800] flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Ítem
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {invoiceItems.map((it, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center bg-[#10131A] border border-slate-800 rounded-xl p-2"
                    >
                      <input
                        type="text"
                        value={it.descripcion}
                        onChange={(e) => {
                          const val = e.target.value;
                          setInvoiceItems((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, descripcion: val } : row))
                          );
                        }}
                        placeholder="Descripción"
                        className="col-span-12 sm:col-span-5 px-2.5 py-1.5 rounded-lg bg-[#0A0C10] border border-slate-800 text-xs text-white"
                      />
                      <input
                        type="number"
                        step="any"
                        value={it.cantidad}
                        onChange={(e) => {
                          const qty = Number(e.target.value || 0);
                          setInvoiceItems((prev) =>
                            prev.map((row, i) =>
                              i === idx
                                ? { ...row, cantidad: qty, subtotal: Number((qty * row.precioUnitario).toFixed(2)) }
                                : row
                            )
                          );
                        }}
                        placeholder="Cant."
                        className="col-span-3 sm:col-span-2 px-2 py-1.5 rounded-lg bg-[#0A0C10] border border-slate-800 text-xs font-mono text-white"
                      />
                      <input
                        type="number"
                        step="any"
                        value={it.precioUnitario}
                        onChange={(e) => {
                          const pu = Number(e.target.value || 0);
                          setInvoiceItems((prev) =>
                            prev.map((row, i) =>
                              i === idx
                                ? { ...row, precioUnitario: pu, subtotal: Number((row.cantidad * pu).toFixed(2)) }
                                : row
                            )
                          );
                        }}
                        placeholder="Precio"
                        className="col-span-4 sm:col-span-2 px-2 py-1.5 rounded-lg bg-[#0A0C10] border border-slate-800 text-xs font-mono text-white"
                      />
                      <input
                        type="number"
                        step="any"
                        value={it.alicuotaIva}
                        onChange={(e) => {
                          const ivaPct = Number(e.target.value || 0);
                          setInvoiceItems((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, alicuotaIva: ivaPct } : row))
                          );
                        }}
                        placeholder="IVA %"
                        className="col-span-3 sm:col-span-2 px-2 py-1.5 rounded-lg bg-[#0A0C10] border border-slate-800 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        disabled={invoiceItems.length <= 1}
                        onClick={() => setInvoiceItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="col-span-2 sm:col-span-1 p-1.5 rounded-lg text-slate-400 hover:text-rose-400 disabled:opacity-30 flex justify-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. TOTALES */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#10131A] border border-slate-800 rounded-xl p-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Neto Gravado ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={netoGravado}
                    onChange={(e) => setNetoGravado(Number(e.target.value || 0))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0A0C10] border border-slate-800 text-xs sm:text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    IVA Total ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={ivaTotal}
                    onChange={(e) => setIvaTotal(Number(e.target.value || 0))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0A0C10] border border-slate-800 text-xs sm:text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Percepciones / Imp. ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={percepcionIibb}
                    onChange={(e) => setPercepcionIibb(Number(e.target.value || 0))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0A0C10] border border-slate-800 text-xs sm:text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-emerald-400 mb-1">
                    Importe Total ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={importeTotal}
                    onChange={(e) => setImporteTotal(Number(e.target.value || 0))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0A0C10] border border-emerald-500/50 text-sm font-mono font-black text-emerald-300"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 font-bold">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
                  <span>
                    {isSaving
                      ? 'Guardando...'
                      : `Aceptar y Guardar (${origenSistema === 'OTRO_SISTEMA' ? 'Otro Sistema' : 'Del Sistema'})`}
                  </span>
                </button>
              </div>
            </form>
          ) : (
            /* REMITO FORM */
            <form onSubmit={handleAcceptRemitoSubmit} className="flex-1 p-4 sm:p-6 space-y-5 overflow-y-auto">
              {/* Numeración: del documento escaneado vs siguiente ARCA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-[#10131A] border border-slate-800 rounded-xl p-3.5">
                <button
                  type="button"
                  onClick={() => setRemitoModoNumero('ESCANEO')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    remitoModoNumero === 'ESCANEO'
                      ? 'bg-[#F0C800]/15 border-[#F0C800] text-white'
                      : 'bg-[#161922] border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-xs font-black">Conservar Nº del Remito Foto</div>
                  <div className="text-[11px] text-slate-400">
                    Guarda con el Nº {String(remPuntoVenta).padStart(4, '0')}-{String(remNumero).padStart(8, '0')} detectado.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRemitoModoNumero('NUEVO_ARCA')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    remitoModoNumero === 'NUEVO_ARCA'
                      ? 'bg-emerald-500/15 border-emerald-400 text-white'
                      : 'bg-[#161922] border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-xs font-black">Asignar Siguiente Nº del Sistema (Pto. 8)</div>
                  <div className="text-[11px] text-slate-400">
                    Genera el correlativo siguiente en Remitos Digitales.
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Letra</label>
                  <select
                    value={remLetra}
                    onChange={(e) => setRemLetra(e.target.value === 'X' ? 'X' : 'R')}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm text-white"
                  >
                    <option value="R">R (ARCA)</option>
                    <option value="X">X (Interno)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Pto. Venta</label>
                  <input
                    type="number"
                    min={1}
                    value={remPuntoVenta}
                    onChange={(e) => setRemPuntoVenta(Number(e.target.value || 8))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Número</label>
                  <input
                    type="number"
                    min={1}
                    value={remNumero}
                    onChange={(e) => setRemNumero(Number(e.target.value || 1))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={remFecha}
                    onChange={(e) => setRemFecha(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#10131A] border border-slate-800 rounded-xl p-4">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Destinatario / Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    value={remReceptorNombre}
                    onChange={(e) => setRemReceptorNombre(e.target.value)}
                    placeholder="Razón Social o Nombre"
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">CUIT / DNI</label>
                  <input
                    type="text"
                    value={remReceptorCuit}
                    onChange={(e) => setRemReceptorCuit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs sm:text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Obra Destino</label>
                  <input
                    type="text"
                    value={remObraDestino}
                    onChange={(e) => setRemObraDestino(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Lugar de Entrega / Domicilio
                  </label>
                  <input
                    type="text"
                    value={remLugarEntrega}
                    onChange={(e) => setRemLugarEntrega(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Motivo Traslado</label>
                  <select
                    value={remMotivo}
                    onChange={(e) => setRemMotivo(e.target.value as RemitoMotivoTraslado)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs text-white"
                  >
                    {MOTIVO_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Chofer</label>
                  <input
                    type="text"
                    value={remChofer}
                    onChange={(e) => setRemChofer(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Vehículo / Patente
                  </label>
                  <input
                    type="text"
                    value={`${remVehiculo}${remPatenteChasis ? ` (${remPatenteChasis})` : ''}`}
                    onChange={(e) => setRemVehiculo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs text-white"
                  />
                </div>
              </div>

              {/* Remito Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-300">
                    Bienes / Áridos / Maquinaria ({remItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setRemItems((prev) => [
                        ...prev,
                        {
                          codigo: String(prev.length + 1).padStart(2, '0'),
                          descripcion: '',
                          cantidad: 1,
                          unidadMedida: 'UNI',
                          detalleSerieOrInterno: '',
                        },
                      ])
                    }
                    className="px-2.5 py-1 rounded-lg bg-[#F0C800]/15 text-[11px] font-black text-[#F0C800] flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ítem
                  </button>
                </div>
                {remItems.map((it, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center bg-[#10131A] border border-slate-800 rounded-xl p-2"
                  >
                    <input
                      type="text"
                      value={it.descripcion}
                      onChange={(e) =>
                        setRemItems((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, descripcion: e.target.value } : row))
                        )
                      }
                      placeholder="Descripción del bien o material"
                      className="col-span-12 sm:col-span-6 px-2.5 py-1.5 rounded-lg bg-[#0A0C10] border border-slate-800 text-xs text-white"
                    />
                    <input
                      type="number"
                      step="any"
                      value={it.cantidad}
                      onChange={(e) =>
                        setRemItems((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, cantidad: Number(e.target.value || 0) } : row))
                        )
                      }
                      className="col-span-4 sm:col-span-2 px-2 py-1.5 rounded-lg bg-[#0A0C10] border border-slate-800 text-xs font-mono text-white"
                    />
                    <input
                      type="text"
                      value={it.unidadMedida}
                      onChange={(e) =>
                        setRemItems((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, unidadMedida: e.target.value } : row))
                        )
                      }
                      placeholder="UNI / M3"
                      className="col-span-6 sm:col-span-3 px-2 py-1.5 rounded-lg bg-[#0A0C10] border border-slate-800 text-xs text-white"
                    />
                    <button
                      type="button"
                      disabled={remItems.length <= 1}
                      onClick={() => setRemItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="col-span-2 sm:col-span-1 p-1.5 rounded-lg text-slate-400 hover:text-rose-400 disabled:opacity-30 flex justify-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Observaciones</label>
                <input
                  type="text"
                  value={remObservaciones}
                  onChange={(e) => setRemObservaciones(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F1117] border border-slate-800 text-xs text-white"
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 font-bold">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black font-black text-xs sm:text-sm flex items-center gap-2 cursor-pointer"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
                  <span>{isSaving ? 'Guardando...' : 'Aceptar y Guardar Remito'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
