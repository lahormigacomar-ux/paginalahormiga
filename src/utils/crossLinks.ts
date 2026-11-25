import { ArcaInvoice, ParteDiario, RentalContract } from '../types';

export const formatInvoiceNumber = (inv: Pick<ArcaInvoice, 'puntoVenta' | 'numeroComprobante'>): string =>
  `${String(inv.puntoVenta).padStart(4, '0')}-${String(inv.numeroComprobante).padStart(8, '0')}`;

export const formatInvoiceLabel = (inv: ArcaInvoice): string => {
  const num = formatInvoiceNumber(inv);
  const shortType = inv.tipoComprobante
    .replace('FACTURA_', 'FACT ')
    .replace('NOTA_CREDITO_', 'NC ');
  return `${shortType} ${num}`;
};

export const isExternalMigratedInvoice = (inv?: Partial<ArcaInvoice> | null): boolean => {
  if (!inv) return false;
  return Boolean(
    inv.esMigradaOtroSistema ||
    inv.origenRegistro === 'OTRO_SISTEMA' ||
    (typeof inv.id === 'string' && inv.id.startsWith('EXT-'))
  );
};

/**
 * Resolves all linked RentalContract, ArcaInvoice, and payment status for a given ParteDiario
 * by checking both direct fields on the ParteDiario AND reverse references on RentalContract and ArcaInvoice.
 */
export function resolveParteDiarioLinks(
  parte: ParteDiario,
  rentals: RentalContract[] = [],
  invoices: ArcaInvoice[] = []
): {
  rental: RentalContract | null;
  rentalNumero: string | null;
  invoice: ArcaInvoice | null;
  facturaNumero: string | null;
  estadoFacturacion: 'FACTURADO' | 'SIN_FACTURAR';
  estadoCobro: 'PAGADO' | 'COBRADO_PARCIAL' | 'PENDIENTE_PAGO' | 'PARCIAL';
  linkedRental: RentalContract | null;
  linkedInvoice: ArcaInvoice | null;
  isLinked: boolean;
} {
  // 1. Find linked RentalContract
  let rental: RentalContract | null = null;
  if (parte.rentalId) {
    rental = rentals.find(r => r.id === parte.rentalId) || null;
  }
  if (!rental && parte.rentalNumero) {
    const pNum = parte.rentalNumero.trim().toUpperCase();
    rental =
      rentals.find(
        r =>
          (r.numeroContrato || '').trim().toUpperCase() === pNum ||
          (r.numero || '').trim().toUpperCase() === pNum
      ) || null;
  }
  if (!rental) {
    rental = rentals.find(r => (r.partesDiariosIds || []).includes(parte.id)) || null;
  }

  // 2. Find linked ArcaInvoice (Hierarchy: Direct on Parte > Reverse on Invoice > Inherited via Linked RentalContract)
  let invoice: ArcaInvoice | null = null;
  if (parte.facturaId) {
    invoice = invoices.find(inv => inv.id === parte.facturaId) || null;
  }
  if (!invoice && parte.facturaNumero) {
    invoice = invoices.find(inv => formatInvoiceNumber(inv) === parte.facturaNumero) || null;
  }
  if (!invoice) {
    invoice =
      invoices.find(
        inv =>
          !inv.tipoComprobante.startsWith('NOTA_CREDITO') &&
          (inv.partesDiariosIds || []).includes(parte.id)
      ) ||
      invoices.find(inv => (inv.partesDiariosIds || []).includes(parte.id)) ||
      null;
  }
  if (!invoice && rental) {
    if (rental.facturaId) {
      invoice = invoices.find(inv => inv.id === rental!.facturaId) || null;
    }
    if (!invoice && (rental.facturasIds || []).length > 0) {
      invoice =
        invoices.find(
          inv =>
            !inv.tipoComprobante.startsWith('NOTA_CREDITO') &&
            (rental!.facturasIds || []).includes(inv.id)
        ) ||
        invoices.find(inv => (rental!.facturasIds || []).includes(inv.id)) ||
        null;
    }
    if (!invoice && rental.facturaNumero) {
      invoice = invoices.find(inv => formatInvoiceNumber(inv) === rental!.facturaNumero) || null;
    }
    if (!invoice) {
      const rIdUpper = rental.id.toUpperCase();
      const rNumUpper = (rental.numeroContrato || rental.numero || '').toUpperCase();
      invoice =
        invoices.find(inv => {
          if (inv.tipoComprobante.startsWith('NOTA_CREDITO')) return false;
          const rIds = (inv.rentalIds || []).map(x => String(x).toUpperCase());
          return (
            inv.rentalId === rental!.id ||
            (rNumUpper && (inv.rentalId || '').toUpperCase() === rNumUpper) ||
            inv.vinculadoId === rental!.id ||
            (rNumUpper && (inv.vinculadoId || '').toUpperCase() === rNumUpper) ||
            rIds.includes(rIdUpper) ||
            (rNumUpper && rIds.includes(rNumUpper)) ||
            (rNumUpper && inv.remitoPedido && inv.remitoPedido.toUpperCase().includes(rNumUpper))
          );
        }) || null;
    }
  }

  const rentalNumero = rental?.numeroContrato || rental?.numero || parte.rentalNumero || null;
  const facturaNumero = invoice ? formatInvoiceNumber(invoice) : parte.facturaNumero || rental?.facturaNumero || null;

  const isInvoiced = Boolean(invoice || facturaNumero || rental?.estadoFacturacion === 'FACTURADO');
  const estadoFacturacion: 'FACTURADO' | 'SIN_FACTURAR' = isInvoiced ? 'FACTURADO' : 'SIN_FACTURAR';

  // Determine collection status
  let estadoCobro: 'PAGADO' | 'COBRADO_PARCIAL' | 'PENDIENTE_PAGO' = 'PENDIENTE_PAGO';
  const rawParteCobro = (parte.estadoCobro || '').toUpperCase();
  if (
    invoice?.estadoCobro === 'PAGADO' ||
    rental?.estadoCobro === 'PAGADO' ||
    rawParteCobro === 'PAGADO' ||
    rawParteCobro === 'COBRADO'
  ) {
    estadoCobro = 'PAGADO';
  } else if (
    invoice?.estadoCobro === 'COBRADO_PARCIAL' ||
    rental?.estadoCobro === 'COBRADO_PARCIAL' ||
    rawParteCobro === 'COBRADO_PARCIAL' ||
    rawParteCobro === 'PARCIAL'
  ) {
    estadoCobro = 'COBRADO_PARCIAL';
  }

  return {
    rental,
    rentalNumero,
    invoice,
    facturaNumero,
    estadoFacturacion,
    estadoCobro,
    linkedRental: rental,
    linkedInvoice: invoice,
    isLinked: Boolean(rental || invoice || rentalNumero || facturaNumero),
  };
}

/**
 * Resolves all linked Partes Diarios, Facturas ARCA, billing status, and payment status for a RentalContract.
 */
export function resolveRentalContractLinks(
  rental: RentalContract,
  partesDiarios: ParteDiario[] = [],
  invoices: ArcaInvoice[] = []
): {
  linkedPartes: ParteDiario[];
  linkedInvoices: ArcaInvoice[];
  primaryInvoice: ArcaInvoice | null;
  facturaNumero: string | null;
  estadoFacturacion: 'FACTURADO' | 'FACTURADO_PARCIAL' | 'SIN_FACTURAR' | 'NO_FACTURADO';
  estadoCobro: 'PAGADO' | 'COBRADO_PARCIAL' | 'PENDIENTE_PAGO' | 'PARCIAL';
  montoCobrado: number;
  saldoPendiente: number;
  totalHorasPartes: number;
  totalViajesPartes: number;
  totalDiasPartes: number;
} {
  const parteIdsSet = new Set<string>(rental.partesDiariosIds || []);

  // Also include partes that point to this rental
  partesDiarios.forEach(p => {
    if (p.rentalId === rental.id || (p.rentalNumero && p.rentalNumero === rental.numeroContrato)) {
      parteIdsSet.add(p.id);
    }
  });

  // Find linked invoices
  const linkedInvoicesMap = new Map<string, ArcaInvoice>();
  invoices.forEach(inv => {
    if (inv.tipoComprobante.startsWith('NOTA_CREDITO')) return;
    const invNum = formatInvoiceNumber(inv);
    const invRentalIds = (inv.rentalIds || []).map(s => String(s).toUpperCase());
    if (
      inv.id === rental.facturaId ||
      (rental.facturaNumero && invNum === rental.facturaNumero) ||
      (rental.facturasIds || []).includes(inv.id) ||
      inv.vinculadoId === rental.id ||
      inv.vinculadoId === rental.numeroContrato ||
      inv.rentalId === rental.id ||
      inv.rentalId === rental.numeroContrato ||
      invRentalIds.includes(rental.id.toUpperCase()) ||
      invRentalIds.includes(rental.numeroContrato.toUpperCase()) ||
      (inv.remitoPedido && inv.remitoPedido.toUpperCase().includes(rental.numeroContrato.toUpperCase()))
    ) {
      linkedInvoicesMap.set(inv.id, inv);
      (inv.partesDiariosIds || []).forEach(pid => parteIdsSet.add(pid));
    }
  });

  const linkedPartes = partesDiarios.filter(p => parteIdsSet.has(p.id));
  const linkedInvoices = Array.from(linkedInvoicesMap.values());
  const primaryInvoice = linkedInvoices[0] || null;
  const facturaNumero = primaryInvoice
    ? formatInvoiceNumber(primaryInvoice)
    : rental.facturaNumero || null;

  // Estado de Facturación
  let estadoFacturacion: 'FACTURADO' | 'FACTURADO_PARCIAL' | 'SIN_FACTURAR' = 'SIN_FACTURAR';
  if (linkedInvoices.length > 0 || facturaNumero || rental.facturaId || rental.facturaNumero) {
    estadoFacturacion = 'FACTURADO';
  } else if (rental.estadoFacturacion && rental.estadoFacturacion !== ('NO_FACTURADO' as any)) {
    estadoFacturacion = rental.estadoFacturacion as any;
  }

  // Estado de Cobro / Pago
  let estadoCobro: 'PAGADO' | 'COBRADO_PARCIAL' | 'PENDIENTE_PAGO' = 'PENDIENTE_PAGO';
  const rawRentalCobro = (rental.estadoCobro || '').toUpperCase();
  if (rawRentalCobro === 'PAGADO' || rawRentalCobro === 'COBRADO') {
    estadoCobro = 'PAGADO';
  } else if (rawRentalCobro === 'COBRADO_PARCIAL' || rawRentalCobro === 'PARCIAL') {
    estadoCobro = 'COBRADO_PARCIAL';
  } else if (rental.estadoCobro) {
    estadoCobro = rental.estadoCobro as any;
  }

  if (linkedInvoices.length > 0) {
    const allPaid = linkedInvoices.every(inv => inv.estadoCobro === 'PAGADO');
    const somePaid = linkedInvoices.some(
      inv => inv.estadoCobro === 'PAGADO' || inv.estadoCobro === 'COBRADO_PARCIAL' || (inv.montoCobrado || 0) > 0
    );
    if (allPaid) {
      estadoCobro = 'PAGADO';
    } else if (somePaid && estadoCobro !== 'PAGADO') {
      estadoCobro = 'COBRADO_PARCIAL';
    }
  }

  const totalRef = primaryInvoice ? primaryInvoice.importeTotal : rental.totalAlquiler || 0;
  let montoCobrado = rental.montoCobrado ?? 0;
  if (primaryInvoice && (primaryInvoice.montoCobrado ?? 0) > montoCobrado) {
    montoCobrado = primaryInvoice.montoCobrado || 0;
  }
  if (estadoCobro === 'PAGADO' && montoCobrado <= 0) {
    montoCobrado = totalRef;
  }
  const saldoPendiente = estadoCobro === 'PAGADO' ? 0 : Math.max(0, totalRef - montoCobrado);

  const totalHorasPartes = linkedPartes.reduce(
    (acc, p) => acc + Number(p.horasTrabajadas || p.hsCantidad || 0),
    0
  );
  const totalViajesPartes = linkedPartes.reduce(
    (acc, p) => acc + (p.tipo === 'VIAJES' ? Number(p.viajesCantidad || p.cantidad || 0) : 0),
    0
  );
  const totalDiasPartes = linkedPartes.reduce(
    (acc, p) => acc + (p.tipo === 'DIA' ? Number(p.cantidadDias || p.cantidad || 1) : 0),
    0
  );

  return {
    linkedPartes,
    linkedInvoices,
    primaryInvoice,
    facturaNumero,
    estadoFacturacion,
    estadoCobro,
    montoCobrado,
    saldoPendiente,
    totalHorasPartes,
    totalViajesPartes,
    totalDiasPartes,
  };
}

/**
 * Resolves all linked RentalContracts, PartesDiarios, and payment status for an ArcaInvoice.
 */
export function resolveArcaInvoiceLinks(
  inv: ArcaInvoice,
  rentals: RentalContract[] = [],
  partesDiarios: ParteDiario[] = []
): {
  linkedRentals: RentalContract[];
  linkedPartes: ParteDiario[];
  estadoCobro: 'PAGADO' | 'COBRADO_PARCIAL' | 'PENDIENTE_PAGO' | 'PARCIAL';
  montoCobrado: number;
  saldoPendiente: number;
} {
  const invNum = formatInvoiceNumber(inv);
  const rentalIdsSet = new Set<string>();
  (inv.rentalIds || []).forEach(id => rentalIdsSet.add(String(id).toUpperCase()));
  if (inv.rentalId) rentalIdsSet.add(String(inv.rentalId).toUpperCase());
  if (inv.vinculadoId) rentalIdsSet.add(String(inv.vinculadoId).toUpperCase());

  rentals.forEach(r => {
    const rId = r.id.toUpperCase();
    const rNum = (r.numeroContrato || '').toUpperCase();
    const remitoUpper = (inv.remitoPedido || '').toUpperCase();

    if (
      r.facturaId === inv.id ||
      (r.facturaNumero && invNum === r.facturaNumero) ||
      (r.facturasIds || []).includes(inv.id) ||
      rentalIdsSet.has(rId) ||
      (rNum && rentalIdsSet.has(rNum)) ||
      (remitoUpper && rNum && remitoUpper.includes(rNum)) ||
      (remitoUpper && remitoUpper.includes(rId))
    ) {
      rentalIdsSet.add(rId);
      if (rNum) rentalIdsSet.add(rNum);
    }
  });

  const linkedRentals = rentals.filter(r => 
    rentalIdsSet.has(r.id.toUpperCase()) || rentalIdsSet.has((r.numeroContrato || '').toUpperCase())
  );

  const parteIdsSet = new Set<string>(inv.partesDiariosIds || []);
  linkedRentals.forEach(r => {
    (r.partesDiariosIds || []).forEach(pid => parteIdsSet.add(pid));
  });
  partesDiarios.forEach(p => {
    if (
      p.facturaId === inv.id ||
      (p.facturaNumero && p.facturaNumero === invNum) ||
      (p.rentalId && rentalIdsSet.has(p.rentalId.toUpperCase())) ||
      (p.rentalNumero && rentalIdsSet.has(p.rentalNumero.toUpperCase()))
    ) {
      parteIdsSet.add(p.id);
    }
  });

  const linkedPartes = partesDiarios.filter(p => parteIdsSet.has(p.id));

  let estadoCobro: 'PAGADO' | 'COBRADO_PARCIAL' | 'PENDIENTE_PAGO' = 'PENDIENTE_PAGO';
  const rawInvCobro = (inv.estadoCobro || '').toUpperCase();
  if (rawInvCobro === 'PAGADO' || rawInvCobro === 'COBRADO') {
    estadoCobro = 'PAGADO';
  } else if (rawInvCobro === 'COBRADO_PARCIAL' || rawInvCobro === 'PARCIAL') {
    estadoCobro = 'COBRADO_PARCIAL';
  } else if (inv.estadoCobro) {
    estadoCobro = inv.estadoCobro as any;
  }
  if (estadoCobro === 'PENDIENTE_PAGO' && linkedRentals.length > 0 && linkedRentals.every(r => r.estadoCobro === 'PAGADO')) {
    estadoCobro = 'PAGADO';
  }

  let montoCobrado = inv.montoCobrado ?? 0;
  if (estadoCobro === 'PAGADO' && montoCobrado <= 0) {
    montoCobrado = inv.importeTotal;
  }
  const saldoPendiente =
    estadoCobro === 'PAGADO'
      ? 0
      : inv.saldoPendiente !== undefined
      ? inv.saldoPendiente
      : Math.max(0, inv.importeTotal - montoCobrado);

  return {
    linkedRentals,
    linkedPartes,
    estadoCobro,
    montoCobrado,
    saldoPendiente,
  };
}
