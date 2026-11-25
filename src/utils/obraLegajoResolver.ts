import {
  ArcaInvoice,
  ClientRecord,
  CustomerPaymentReceipt,
  Obra,
  ObraDuracionCategoria,
  ObraFacturaLegajo,
  ParteDiario,
  Quotation,
  RentalContract,
} from '../types';
import {
  formatInvoiceNumber,
  resolveArcaInvoiceLinks,
  resolveParteDiarioLinks,
  resolveRentalContractLinks,
} from './crossLinks';

export type ObraEstadoLegajo =
  | 'TERMINADA_PAGADA'
  | 'FACTURADA_PARCIAL_PAGADA'
  | 'COBRO_PARCIAL'
  | 'FACTURADA_PENDIENTE'
  | 'EN_CURSO_CON_PARTES'
  | 'SIN_MOVIMIENTOS';

export interface UnifiedObraItem extends Obra {
  /** True si la obra fue detectada automáticamente desde Partes Diarios o Contratos sin fila previa en tabla `obras` */
  esDetectadaDesdePartes?: boolean;
}

export interface ObraFullLegajoSummary {
  obraPartes: ParteDiario[];
  invoicedPartesCount: number;
  unbilledPartesCount: number;
  obraRentals: RentalContract[];
  linkedArcaInvoices: ArcaInvoice[];
  /** Facturas vigentes (excluye Notas de Crédito que solo compensan) */
  activeBillingInvoices: ArcaInvoice[];
  /** Notas de crédito vinculadas */
  creditNotes: ArcaInvoice[];
  /** Legajos manuales de la obra que aún no apuntan a una ArcaInvoice cargada */
  manualOnlyLegajos: ObraFacturaLegajo[];
  linkedReceipts: CustomerPaymentReceipt[];
  linkedQuotations: Quotation[];
  totalHoras: number;
  totalViajes: number;
  equiposUnicos: string[];
  operariosUnicos: string[];
  totalFacturado: number;
  totalCobrado: number;
  saldoPendiente: number;
  estadoLegajo: ObraEstadoLegajo;
  estadoLabel: string;
  estadoSubtitle: string;
  firstParteFecha?: string;
  lastParteFecha?: string;
}

const normText = (v?: string): string =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const cleanDigits = (v?: string): string => String(v || '').replace(/\D/g, '');

const slugifyId = (v: string): string =>
  normText(v)
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'SIN-NOMBRE';

const GENERIC_OBRA_CODES = new Set(['', '-', 'N/A', 'NA', 'ESPORADICA', 'CORTA', 'LARGA', 'AUTO', 'ESP', 'SIN CODIGO']);

export const isAutoDetectedObra = (obra?: Partial<UnifiedObraItem> | null): boolean =>
  Boolean(obra?.esDetectadaDesdePartes || (typeof obra?.id === 'string' && obra.id.startsWith('AUTO-OBRA-')));

/**
 * Combina las obras persistidas en `obras` con todas las obras esporádicas, cortas o sin ficha formal
 * que aparecen en Partes Diarios o Contratos de Alquiler, para que NINGUNA obra quede oculta.
 */
export function buildUnifiedObrasList(params: {
  obras: Obra[];
  partesDiarios?: ParteDiario[];
  rentals?: RentalContract[];
  arcaInvoices?: ArcaInvoice[];
  clients?: ClientRecord[];
}): UnifiedObraItem[] {
  const { obras, partesDiarios = [], rentals = [], arcaInvoices = [], clients = [] } = params;

  const existingByName = new Map<string, Obra>();

  obras.forEach((o) => {
    const nName = normText(o.nombreObra);
    if (nName) existingByName.set(nName, o);
  });

  // Agrupar partes diarios por obra no registrada aún en `obras`
  const orphanPartesByKey = new Map<string, ParteDiario[]>();
  partesDiarios.forEach((p) => {
    const rawName = (p.obra || '').trim();
    const nName = normText(rawName);
    if (!nName || nName === '-' || nName === 'SIN OBRA' || nName === 'N/A') return;

    if (existingByName.has(nName)) return;

    const list = orphanPartesByKey.get(nName) || [];
    list.push(p);
    orphanPartesByKey.set(nName, list);
  });

  // También considerar Contratos cuya obraDestino no exista todavía ni en `obras` ni en `orphanPartesByKey`
  const orphanRentalsByKey = new Map<string, RentalContract[]>();
  rentals.forEach((r) => {
    const rawDest = (r.obraDestino || '').trim();
    const nDest = normText(rawDest);
    if (!nDest || nDest === '-' || nDest === 'SIN OBRA') return;
    if (existingByName.has(nDest)) return;
    const list = orphanRentalsByKey.get(nDest) || [];
    list.push(r);
    orphanRentalsByKey.set(nDest, list);
  });

  const allOrphanKeys = new Set<string>([
    ...Array.from(orphanPartesByKey.keys()),
    ...Array.from(orphanRentalsByKey.keys()),
  ]);

  const autoObras: UnifiedObraItem[] = [];

  allOrphanKeys.forEach((nKey) => {
    const partes = orphanPartesByKey.get(nKey) || [];
    const matchedRentals = orphanRentalsByKey.get(nKey) || [];

    // Ordenar partes por fecha descendente para tomar los metadatos más recientes
    const sortedPartes = [...partes].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const latestParte = sortedPartes[0];
    const earliestParte = sortedPartes[sortedPartes.length - 1];
    const latestRental = matchedRentals[0];

    const nombreObra = (latestParte?.obra || latestRental?.obraDestino || nKey).trim();

    // Determinar categoría de duración
    let categoriaDuracion: ObraDuracionCategoria = 'ESPORADICA';
    if (partes.length > 0) {
      const hasEsp = partes.some(
        (p) => p.esObraEsporadica || p.codigoObra === 'ESPORADICA' || p.categoriaObra === 'ESPORADICA'
      );
      const hasCorta = partes.some((p) => p.categoriaObra === 'CORTA');
      const hasLarga = partes.some((p) => p.categoriaObra === 'LARGA');
      if (hasEsp) {
        categoriaDuracion = 'ESPORADICA';
      } else if (hasCorta) {
        categoriaDuracion = 'CORTA';
      } else if (hasLarga) {
        categoriaDuracion = 'LARGA';
      } else if (partes.length <= 5) {
        categoriaDuracion = 'ESPORADICA';
      } else {
        categoriaDuracion = 'CORTA';
      }
    } else if (matchedRentals.length > 0) {
      categoriaDuracion = 'CORTA';
    }

    // Resolver cliente desde Parte, Rental, Factura vinculada o Padrón de Clientes
    let clienteId = latestParte?.clienteId || '';
    let clienteNombre = latestParte?.clienteNombre || latestRental?.clienteNombre || '';
    let clienteCuit = latestParte?.clienteCuit || latestRental?.clienteDocumento || '';
    let clienteCodigo = '';

    if (!clienteNombre && partes.length > 0) {
      for (const p of sortedPartes) {
        const links = resolveParteDiarioLinks(p, rentals, arcaInvoices);
        if (links.invoice) {
          clienteNombre = links.invoice.razonSocialReceptor || links.invoice.receptorRazonSocial || '';
          clienteCuit = links.invoice.nroDocReceptor || '';
          clienteCodigo = links.invoice.codigoCliente || '';
          break;
        }
        if (links.rental) {
          clienteNombre = links.rental.clienteNombre || '';
          clienteCuit = links.rental.clienteDocumento || '';
          break;
        }
      }
    }

    if (clients.length > 0) {
      const cuitDigits = cleanDigits(clienteCuit);
      const nameNorm = normText(clienteNombre);
      const matchedClient =
        (clienteId ? clients.find((c) => c.id === clienteId) : undefined) ||
        (cuitDigits.length >= 7 ? clients.find((c) => cleanDigits(c.cuit) === cuitDigits) : undefined) ||
        (nameNorm ? clients.find((c) => normText(c.razonSocial) === nameNorm) : undefined);

      if (matchedClient) {
        clienteId = matchedClient.id;
        clienteNombre = matchedClient.razonSocial;
        clienteCuit = matchedClient.cuit || clienteCuit;
        clienteCodigo = matchedClient.codigo || clienteCodigo;
      }
    }

    const rawCode = (latestParte?.codigoObra || '').trim();
    const displayNum =
      rawCode && !GENERIC_OBRA_CODES.has(rawCode.toUpperCase())
        ? rawCode
        : categoriaDuracion === 'ESPORADICA'
        ? 'ESP'
        : 'CORTA';

    const ubicacion =
      sortedPartes.find((p) => (p.ubicacion || '').trim())?.ubicacion?.trim() ||
      'Sin ubicación';

    const totalHorasEst = partes.reduce((acc, p) => acc + Number(p.horasTrabajadas || p.hsCantidad || 0), 0);
    const totalViajesEst = partes.reduce((acc, p) => acc + Number(p.viajesCantidad || p.cantidad || 0), 0);

    autoObras.push({
      id: `AUTO-OBRA-${slugifyId(nombreObra)}`,
      numero: displayNum,
      nombreObra,
      ubicacion,
      pertenece: clienteNombre || 'Obra Esporádica / Directa',
      clienteId: clienteId || undefined,
      clienteCodigo: clienteCodigo || undefined,
      clienteNombre: clienteNombre || undefined,
      clienteCuit: clienteCuit || undefined,
      activa: true,
      plazo:
        earliestParte?.fecha && latestParte?.fecha && earliestParte.fecha !== latestParte.fecha
          ? `${earliestParte.fecha} → ${latestParte.fecha}`
          : latestParte?.fecha || 'Trabajo puntual',
      montoEstimado: matchedRentals.reduce((acc, r) => acc + Number(r.totalAlquiler || 0), 0),
      categoriaDuracion,
      fechaAlta: earliestParte?.fecha || latestRental?.fechaInicio || undefined,
      observaciones: `Detectada automáticamente desde ${partes.length} parte(s) diario(s)${
        totalHorasEst > 0 ? ` (${totalHorasEst.toFixed(1)} hs)` : ''
      }${totalViajesEst > 0 ? ` (${totalViajesEst} viajes)` : ''}.`,
      archivado: false,
      esDetectadaDesdePartes: true,
    });
  });

  // Ordenar: obras detectadas recientes primero o mezcladas ordenadamente por fecha más reciente / nombre
  const persistedItems: UnifiedObraItem[] = obras.map((o) => ({ ...o, esDetectadaDesdePartes: false }));

  // Unir colocando primero las obras vigentes y auto-detectadas ordenadas por actividad reciente
  autoObras.sort((a, b) => (b.fechaAlta || '').localeCompare(a.fechaAlta || '') || a.nombreObra.localeCompare(b.nombreObra, 'es'));

  return [...persistedItems, ...autoObras];
}

/**
 * Verifica si una factura ARCA está 100% pagada considerando su estadoCobro, saldoPendiente
 * o la suma de recibos imputados.
 */
export function isArcaInvoiceFullyPaid(
  inv: ArcaInvoice,
  receipts: CustomerPaymentReceipt[] = []
): boolean {
  if (inv.estadoCobro === 'PAGADO') return true;
  const total = Number(inv.importeTotal ?? inv.impTotal ?? 0);
  if (total <= 0) return false;
  if (inv.saldoPendiente !== undefined && Number(inv.saldoPendiente) <= 0.5) return true;

  const invNum = formatInvoiceNumber(inv);
  const matchingReceipts = receipts.filter(
    (r) =>
      (r.facturasIds || []).includes(inv.id) ||
      (r.facturasNumeros || []).includes(invNum)
  );
  const embeddedReceipts = inv.recibosCobro || [];
  const allRecsMap = new Map<string, CustomerPaymentReceipt>();
  [...matchingReceipts, ...embeddedReceipts].forEach((r) => allRecsMap.set(r.id, r));
  const sumImputado = Array.from(allRecsMap.values()).reduce(
    (acc, r) => acc + Number(r.totalImputado ?? r.montoCobrado ?? 0),
    0
  );
  if (sumImputado >= total - 0.5) return true;
  if (Number(inv.montoCobrado || 0) >= total - 0.5) return true;
  return false;
}

export interface LiveFacturaLegajoStatus {
  estadoCobro: 'COBRADO' | 'COBRADO_PARCIAL' | 'PENDIENTE';
  matchedArca: ArcaInvoice | null;
  linkedReceipts: CustomerPaymentReceipt[];
  montoCobrado: number;
  saldoPendiente: number;
}

/**
 * Resuelve en tiempo real el estado de cobro de un ObraFacturaLegajo cruzando
 * contra las facturas ARCA reales y los recibos de cobranza (evitando el estado
 * estancado en `PENDIENTE` cuando se cobra la factura desde Cobranzas).
 */
export function resolveFacturaLegajoLiveStatus(
  f: ObraFacturaLegajo,
  arcaInvoices: ArcaInvoice[] = [],
  customerReceipts: CustomerPaymentReceipt[] = [],
  rentals: RentalContract[] = [],
  partesDiarios: ParteDiario[] = []
): LiveFacturaLegajoStatus {
  const nroClean = (f.nroComprobante || '').trim().toUpperCase();
  let matchedArca: ArcaInvoice | null = null;

  if (f.arcaInvoiceId) {
    matchedArca = arcaInvoices.find((inv) => inv.id === f.arcaInvoiceId) || null;
  }
  if (!matchedArca && nroClean && nroClean !== 'SIN FACTURAR') {
    matchedArca =
      arcaInvoices.find((inv) => formatInvoiceNumber(inv).toUpperCase() === nroClean) || null;
  }
  if (!matchedArca && (f.rentalIds || []).length > 0) {
    const rSet = new Set(f.rentalIds || []);
    const linkedRental = rentals.find((r) => rSet.has(r.id));
    if (linkedRental) {
      const rLinks = resolveRentalContractLinks(linkedRental, partesDiarios, arcaInvoices);
      matchedArca = rLinks.primaryInvoice;
    }
  }

  const receiptsMap = new Map<string, CustomerPaymentReceipt>();
  const targetInvNum = matchedArca ? formatInvoiceNumber(matchedArca).toUpperCase() : nroClean;

  customerReceipts.forEach((rec) => {
    const matchesInvId = matchedArca && (rec.facturasIds || []).includes(matchedArca.id);
    const matchesInvNum =
      targetInvNum &&
      (rec.facturasNumeros || []).some((n) => String(n).trim().toUpperCase() === targetInvNum);
    if (matchesInvId || matchesInvNum) {
      receiptsMap.set(rec.id, rec);
    }
  });
  (matchedArca?.recibosCobro || []).forEach((rec) => {
    if (!receiptsMap.has(rec.id)) receiptsMap.set(rec.id, rec);
  });

  const linkedReceipts = Array.from(receiptsMap.values()).sort((a, b) =>
    (b.fecha || '').localeCompare(a.fecha || '')
  );

  const totalRef = Number(
    matchedArca ? matchedArca.importeTotal ?? matchedArca.impTotal ?? f.importeTotal : f.importeTotal || 0
  );

  let estadoCobro: 'COBRADO' | 'COBRADO_PARCIAL' | 'PENDIENTE' = f.estadoCobro || 'PENDIENTE';
  let montoCobrado = f.estadoCobro === 'COBRADO' ? totalRef : 0;

  if (matchedArca) {
    if (isArcaInvoiceFullyPaid(matchedArca, customerReceipts)) {
      estadoCobro = 'COBRADO';
      montoCobrado = totalRef;
    } else {
      const resolvedInv = resolveArcaInvoiceLinks(matchedArca, rentals, partesDiarios);
      const receiptsSum = linkedReceipts.reduce(
        (acc, r) => acc + Number(r.totalImputado ?? r.montoCobrado ?? 0),
        0
      );
      const bestCobrado = Math.max(resolvedInv.montoCobrado || 0, receiptsSum);
      if (bestCobrado >= totalRef - 0.5 && totalRef > 0) {
        estadoCobro = 'COBRADO';
        montoCobrado = totalRef;
      } else if (
        bestCobrado > 0 ||
        matchedArca.estadoCobro === 'COBRADO_PARCIAL' ||
        matchedArca.estadoCobro === 'PARCIAL'
      ) {
        estadoCobro = 'COBRADO_PARCIAL';
        montoCobrado = bestCobrado;
      } else {
        estadoCobro = 'PENDIENTE';
        montoCobrado = 0;
      }
    }
  } else if (linkedReceipts.length > 0 && totalRef > 0) {
    const receiptsSum = linkedReceipts.reduce(
      (acc, r) => acc + Number(r.totalImputado ?? r.montoCobrado ?? 0),
      0
    );
    if (receiptsSum >= totalRef - 0.5) {
      estadoCobro = 'COBRADO';
      montoCobrado = totalRef;
    } else if (receiptsSum > 0) {
      estadoCobro = 'COBRADO_PARCIAL';
      montoCobrado = receiptsSum;
    }
  }

  const saldoPendiente = estadoCobro === 'COBRADO' ? 0 : Math.max(0, totalRef - montoCobrado);

  return {
    estadoCobro,
    matchedArca,
    linkedReceipts,
    montoCobrado,
    saldoPendiente,
  };
}

/**
 * Resuelve TODO el legajo integral de una Obra:
 * - Partes Diarios vinculados
 * - Contratos de Alquiler vinculados
 * - Facturas ARCA / Otro sistema vinculadas (por legajo, partes o contratos)
 * - Recibos de Cobranza (pagos) asociados
 * - Estado automático ("OBRA TERMINADA" cuando sus partes tienen factura y está pagada al 100%)
 */
export function resolveObraFullLegajo(params: {
  obra: Obra;
  partesDiarios?: ParteDiario[];
  rentals?: RentalContract[];
  arcaInvoices?: ArcaInvoice[];
  customerReceipts?: CustomerPaymentReceipt[];
  quotations?: Quotation[];
}): ObraFullLegajoSummary {
  const {
    obra,
    partesDiarios = [],
    rentals = [],
    arcaInvoices = [],
    customerReceipts = [],
    quotations = [],
  } = params;

  const nombreNorm = normText(obra.nombreObra);
  const numNorm = normText(obra.numero);
  const idNorm = normText(obra.id);
  const hasSpecificNum = Boolean(numNorm && !GENERIC_OBRA_CODES.has(numNorm));

  const attachedParteIds = new Set<string>();
  const attachedRentalIds = new Set<string>();
  const attachedArcaInvoiceIds = new Set<string>();
  const attachedArcaInvoiceNums = new Set<string>();
  const attachedQuotationIds = new Set<string>();

  (obra.facturasLegajo || []).forEach((f) => {
    (f.parteDiarioIds || []).forEach((id) => attachedParteIds.add(id));
    (f.rentalIds || []).forEach((id) => attachedRentalIds.add(id));
    (f.quotationIds || []).forEach((id) => attachedQuotationIds.add(id));
    if (f.arcaInvoiceId) attachedArcaInvoiceIds.add(f.arcaInvoiceId);
    if (f.nroComprobante) attachedArcaInvoiceNums.add(f.nroComprobante.trim().toUpperCase());
  });

  (obra.periodosLegajo || []).forEach((per) => {
    (per.parteDiarioIds || []).forEach((id) => attachedParteIds.add(id));
    (per.rentalIds || []).forEach((id) => attachedRentalIds.add(id));
  });

  // 1. Contratos vinculados a la obra
  const obraRentals = rentals.filter((r) => {
    const destNorm = normText(r.obraDestino);
    const matchesObra =
      (nombreNorm && destNorm === nombreNorm) ||
      (hasSpecificNum && destNorm === numNorm);
    return attachedRentalIds.has(r.id) || matchesObra;
  });

  obraRentals.forEach((r) => {
    (r.partesDiariosIds || []).forEach((pid) => attachedParteIds.add(pid));
    if (r.facturaId) attachedArcaInvoiceIds.add(r.facturaId);
    if (r.facturaNumero) attachedArcaInvoiceNums.add(r.facturaNumero.trim().toUpperCase());
    (r.facturasIds || []).forEach((fid) => attachedArcaInvoiceIds.add(fid));
  });

  // 2. Partes diarios vinculados a la obra
  const isAutoDetected =
    obra.id.startsWith('AUTO-OBRA-') || Boolean((obra as UnifiedObraItem).esDetectadaDesdePartes);
  const obraPartes = partesDiarios.filter((p) => {
    if (attachedParteIds.has(p.id)) return true;
    if (nombreNorm && normText(p.obra) === nombreNorm) return true;
    if (!isAutoDetected) {
      const pCodNorm = normText(p.codigoObra);
      if (hasSpecificNum && pCodNorm === numNorm) return true;
      if (idNorm && pCodNorm === idNorm) return true;
    }
    return false;
  });

  const obraParteIdsSet = new Set(obraPartes.map((p) => p.id));

  // 3. Facturas ARCA vinculadas (por legajo, por cualquier parte de la obra, o por cualquier contrato)
  const linkedInvoicesMap = new Map<string, ArcaInvoice>();

  arcaInvoices.forEach((inv) => {
    const invNumUpper = formatInvoiceNumber(inv).toUpperCase();
    const matchesDirectRef =
      attachedArcaInvoiceIds.has(inv.id) ||
      attachedArcaInvoiceNums.has(invNumUpper);

    const matchesPartes = (inv.partesDiariosIds || []).some((pid) => obraParteIdsSet.has(pid));

    if (matchesDirectRef || matchesPartes) {
      linkedInvoicesMap.set(inv.id, inv);
    }
  });

  // Resolver también desde cada parte y cada contrato usando crossLinks
  let invoicedPartesCount = 0;
  obraPartes.forEach((p) => {
    const links = resolveParteDiarioLinks(p, rentals, arcaInvoices);
    const inLegajoManual = (obra.facturasLegajo || []).some((f) =>
      (f.parteDiarioIds || []).includes(p.id)
    );
    if (links.invoice) {
      linkedInvoicesMap.set(links.invoice.id, links.invoice);
    }
    if (links.estadoFacturacion === 'FACTURADO' || inLegajoManual) {
      invoicedPartesCount += 1;
    }
  });

  obraRentals.forEach((r) => {
    const rLinks = resolveRentalContractLinks(r, partesDiarios, arcaInvoices);
    rLinks.linkedInvoices.forEach((inv) => linkedInvoicesMap.set(inv.id, inv));
  });

  // Incluir Notas de Crédito asociadas a cualquiera de las facturas vinculadas
  const linkedInvoiceIdsList = Array.from(linkedInvoicesMap.keys());
  arcaInvoices.forEach((inv) => {
    if (inv.tipoComprobante.startsWith('NOTA_CREDITO') && inv.cbteAsociadoInfo) {
      const targetId = inv.cbteAsociadoInfo.idInvoice;
      const targetNum = `${String(inv.cbteAsociadoInfo.puntoVenta).padStart(4, '0')}-${String(
        inv.cbteAsociadoInfo.numeroComprobante
      ).padStart(8, '0')}`.toUpperCase();
      const matchesLinked =
        (targetId && linkedInvoicesMap.has(targetId)) ||
        Array.from(linkedInvoicesMap.values()).some(
          (baseInv) => formatInvoiceNumber(baseInv).toUpperCase() === targetNum
        );
      if (matchesLinked) {
        linkedInvoicesMap.set(inv.id, inv);
      }
    }
  });

  const linkedArcaInvoices = Array.from(linkedInvoicesMap.values()).sort((a, b) =>
    (b.fecha || '').localeCompare(a.fecha || '')
  );

  // Determinar facturas anuladas totalmente por NC para no contarlas como deuda pendiente
  const annulledInvoiceIds = new Set<string>();
  const creditNotes = linkedArcaInvoices.filter((inv) => inv.tipoComprobante.startsWith('NOTA_CREDITO'));
  creditNotes.forEach((nc) => {
    if (nc.cbteAsociadoInfo?.idInvoice) {
      const target = linkedInvoicesMap.get(nc.cbteAsociadoInfo.idInvoice);
      if (target && Number(nc.importeTotal || 0) >= Number(target.importeTotal || 0) - 1) {
        annulledInvoiceIds.add(target.id);
      }
    }
  });

  const activeBillingInvoices = linkedArcaInvoices.filter(
    (inv) => !inv.tipoComprobante.startsWith('NOTA_CREDITO') && !annulledInvoiceIds.has(inv.id)
  );

  // Legajos manuales de la obra que NO corresponden a una factura ARCA ya incluida
  const manualOnlyLegajos = (obra.facturasLegajo || []).filter((f) => {
    if (f.pendienteFacturacion) return false;
    if (f.arcaInvoiceId && linkedInvoicesMap.has(f.arcaInvoiceId)) return false;
    const nroUpper = (f.nroComprobante || '').trim().toUpperCase();
    if (nroUpper && linkedArcaInvoices.some((inv) => formatInvoiceNumber(inv).toUpperCase() === nroUpper)) {
      return false;
    }
    return true;
  });

  // 4. Recibos de Cobranza (Pagos) asociados a las facturas, contratos o partes de la obra
  const linkedReceiptsMap = new Map<string, CustomerPaymentReceipt>();
  const activeInvNums = new Set(linkedArcaInvoices.map((inv) => formatInvoiceNumber(inv).toUpperCase()));
  const obraRentalIdsSet = new Set(obraRentals.map((r) => r.id));

  customerReceipts.forEach((rec) => {
    const matchesInv =
      (rec.facturasIds || []).some((fid) => linkedInvoicesMap.has(fid)) ||
      (rec.facturasNumeros || []).some((num) => activeInvNums.has(String(num).trim().toUpperCase()));
    const matchesRental = (rec.rentalsIds || []).some((rid) => obraRentalIdsSet.has(rid));
    const matchesParte = (rec.partesDiariosIds || []).some((pid) => obraParteIdsSet.has(pid));

    if (matchesInv || matchesRental || matchesParte) {
      linkedReceiptsMap.set(rec.id, rec);
    }
  });

  // También sumar recibos embebidos en las facturas ARCA por si no estuvieran en customerReceipts
  linkedArcaInvoices.forEach((inv) => {
    (inv.recibosCobro || []).forEach((rec) => {
      if (!linkedReceiptsMap.has(rec.id)) {
        linkedReceiptsMap.set(rec.id, rec);
      }
    });
  });

  const linkedReceipts = Array.from(linkedReceiptsMap.values()).sort((a, b) =>
    (b.fecha || '').localeCompare(a.fecha || '')
  );

  // 5. Cotizaciones vinculadas
  const linkedQuotations = quotations.filter(
    (q) => attachedQuotationIds.has(q.id) || obraRentals.some((r) => r.cotizacionId === q.id)
  );

  // 6. Totales financieros
  let totalFacturado = 0;
  let totalCobrado = 0;
  let saldoPendiente = 0;

  activeBillingInvoices.forEach((inv) => {
    const resolved = resolveArcaInvoiceLinks(inv, rentals, partesDiarios);
    const invTotal = Number(inv.importeTotal ?? inv.impTotal ?? 0);
    const paid = isArcaInvoiceFullyPaid(inv, linkedReceipts);
    const invCobrado = paid ? invTotal : Number(resolved.montoCobrado || 0);
    const invSaldo = paid ? 0 : Math.max(0, invTotal - invCobrado);

    totalFacturado += invTotal;
    totalCobrado += invCobrado;
    saldoPendiente += invSaldo;
  });

  manualOnlyLegajos.forEach((f) => {
    const fTotal = Number(f.importeTotal || 0);
    totalFacturado += fTotal;
    if (f.estadoCobro === 'COBRADO') {
      totalCobrado += fTotal;
    } else if (f.estadoCobro === 'COBRADO_PARCIAL') {
      totalCobrado += fTotal * 0.5;
      saldoPendiente += fTotal * 0.5;
    } else {
      saldoPendiente += fTotal;
    }
  });

  const allManualPaid = manualOnlyLegajos.every((f) => f.estadoCobro === 'COBRADO');
  const allArcaPaid =
    activeBillingInvoices.length > 0 &&
    activeBillingInvoices.every((inv) => isArcaInvoiceFullyPaid(inv, linkedReceipts));

  const hasAnyBilling = activeBillingInvoices.length > 0 || manualOnlyLegajos.length > 0;
  const allBillingPaid =
    hasAnyBilling &&
    (activeBillingInvoices.length === 0 || allArcaPaid) &&
    (manualOnlyLegajos.length === 0 || allManualPaid);

  const unbilledPartesCount = Math.max(0, obraPartes.length - invoicedPartesCount);

  // 7. Estado automático de Obra
  let estadoLegajo: ObraEstadoLegajo = 'SIN_MOVIMIENTOS';
  let estadoLabel = obra.activa ? 'ACTIVA' : 'INACTIVA';
  let estadoSubtitle = 'Sin partes ni facturas';

  if (obraPartes.length > 0) {
    if (hasAnyBilling && allBillingPaid && unbilledPartesCount === 0) {
      estadoLegajo = 'TERMINADA_PAGADA';
      estadoLabel = 'OBRA TERMINADA';
      estadoSubtitle = `${obraPartes.length} parte(s) facturado(s) y pagado(s) 100%`;
    } else if (hasAnyBilling && allBillingPaid && unbilledPartesCount > 0) {
      estadoLegajo = 'FACTURADA_PARCIAL_PAGADA';
      estadoLabel = 'COBRADA PARCIAL';
      estadoSubtitle = `${invoicedPartesCount}/${obraPartes.length} partes pagados (${unbilledPartesCount} s/fact.)`;
    } else if (hasAnyBilling && totalCobrado > 0 && saldoPendiente > 0.5) {
      estadoLegajo = 'COBRO_PARCIAL';
      estadoLabel = 'COBRO PARCIAL';
      estadoSubtitle = `Saldo pendiente: $ ${Math.round(saldoPendiente).toLocaleString('es-AR')}`;
    } else if (hasAnyBilling) {
      estadoLegajo = 'FACTURADA_PENDIENTE';
      estadoLabel = 'PENDIENTE DE COBRO';
      estadoSubtitle = `${activeBillingInvoices.length + manualOnlyLegajos.length} fact. emitida(s) por cobrar`;
    } else {
      estadoLegajo = 'EN_CURSO_CON_PARTES';
      estadoLabel = 'EN CURSO (S/FACTURAR)';
      estadoSubtitle = `${obraPartes.length} parte(s) diario(s) sin facturar`;
    }
  } else if (hasAnyBilling) {
    if (allBillingPaid) {
      estadoLegajo = 'TERMINADA_PAGADA';
      estadoLabel = 'OBRA TERMINADA';
      estadoSubtitle = 'Facturada y pagada al 100%';
    } else if (totalCobrado > 0 && saldoPendiente > 0.5) {
      estadoLegajo = 'COBRO_PARCIAL';
      estadoLabel = 'COBRO PARCIAL';
      estadoSubtitle = `Saldo pendiente: $ ${Math.round(saldoPendiente).toLocaleString('es-AR')}`;
    } else {
      estadoLegajo = 'FACTURADA_PENDIENTE';
      estadoLabel = 'PENDIENTE DE COBRO';
      estadoSubtitle = `${activeBillingInvoices.length + manualOnlyLegajos.length} fact. emitida(s)`;
    }
  }

  // Métricas operativas de partes
  const totalHoras = obraPartes.reduce((acc, p) => acc + Number(p.horasTrabajadas || p.hsCantidad || 0), 0);
  const totalViajes = obraPartes.reduce((acc, p) => acc + Number(p.viajesCantidad || p.cantidad || 0), 0);
  const equiposUnicos = Array.from(
    new Set(obraPartes.map((p) => p.marcaModelo || p.codigoEquipo).filter(Boolean))
  );
  const operariosUnicos = Array.from(
    new Set(obraPartes.map((p) => p.nombreApellido).filter(Boolean))
  );

  const sortedDates = obraPartes
    .map((p) => p.fecha)
    .filter(Boolean)
    .sort();

  return {
    obraPartes,
    invoicedPartesCount,
    unbilledPartesCount,
    obraRentals,
    linkedArcaInvoices,
    activeBillingInvoices,
    creditNotes,
    manualOnlyLegajos,
    linkedReceipts,
    linkedQuotations,
    totalHoras,
    totalViajes,
    equiposUnicos,
    operariosUnicos,
    totalFacturado,
    totalCobrado,
    saldoPendiente,
    estadoLegajo,
    estadoLabel,
    estadoSubtitle,
    firstParteFecha: sortedDates[0],
    lastParteFecha: sortedDates[sortedDates.length - 1],
  };
}
