import { FuelDeposit, FuelDispensary } from '../types';

const cleanStr = (s?: string) => (s || '').toLowerCase().trim();

/**
 * Robust parser for fuel volume strings or numbers (supports "119,42", "119.42", -119.42, etc.)
 */
export function parseLiters(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.abs(val);
  const s = String(val).trim().replace(/[^0-9.,-]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

/**
 * Extracts the real liter volume from a fuel voucher record (checking cantidad, cantCarga, etc.)
 */
export function getVoucherLiters(v: FuelDispensary): number {
  const raw = (v.cantidad !== undefined && v.cantidad !== null && v.cantidad !== 0)
    ? v.cantidad 
    : (v.cantCarga !== undefined && v.cantCarga !== null ? v.cantCarga : (v as any).litros);
  return parseLiters(raw);
}

/**
 * Checks if a fuel dispensary voucher represents an incoming load (carga de combustible recibida)
 * into a specific internal cistern or deposit.
 */
export function isVoucherIncomingToDeposit(voucher: FuelDispensary, deposit: FuelDeposit): boolean {
  if (deposit.modalidad === 'VALES_ESTACION') return false;

  const vCode = cleanStr(voucher.codigoEquipo || (voucher as any).equipo);
  const vPlate = cleanStr(voucher.patente);
  const vModel = cleanStr(voucher.marcaModelo || (voucher as any).vehiculo || (voucher as any).modeloMarca);
  const vId = cleanStr(voucher.id);
  const vDepName = cleanStr(voucher.deposito);
  const vDepId = cleanStr(voucher.depositoId);

  const dCode = cleanStr(deposit.codigo);
  const dEqCode = cleanStr(deposit.codigoEquipo);
  const dId = cleanStr(deposit.id);
  const dPlate = cleanStr(deposit.patenteVehiculo);
  const dName = cleanStr(deposit.nombre);

  // If this voucher was dispatched FROM this deposit, it is an OUTGOING discharge, NEVER an incoming load!
  if (vDepId && (vDepId === dId || vDepId === dCode)) return false;
  if (vDepName && (vDepName === dName || (dName && vDepName.includes(dName)) || (dName.includes('amarillo') && vDepName.includes('amarillo')))) {
    return false;
  }

  // 1. Direct match by equipment / deposit ID as recipient
  if (dId && (vCode === dId || vCode.includes(dId))) return true;
  if (dCode && (vCode === dCode || vCode.includes(dCode))) return true;
  if (dEqCode && (vCode === dEqCode || vCode.includes(dEqCode))) return true;

  // 2. Direct match by unique cisterna license plate
  if (dPlate && (vPlate === dPlate || vPlate.replace(/\s+/g, '') === dPlate.replace(/\s+/g, ''))) {
    return true;
  }

  // 3. Exact name of deposit appearing in recipient equipment field
  if (dName && (vCode === dName || vModel === dName)) return true;

  return false;
}

/**
 * Checks if a fuel dispensary voucher represents an outgoing discharge (descarga/expendio)
 * dispatched FROM this deposit into another machine/vehicle.
 */
export function isVoucherOutgoingFromDeposit(voucher: FuelDispensary, deposit: FuelDeposit): boolean {
  if (deposit.modalidad === 'VALES_ESTACION') return false;

  // If this voucher is actually an incoming charge to this deposit, it is NOT an outgoing discharge
  if (isVoucherIncomingToDeposit(voucher, deposit)) return false;

  // Check if this deposit was the dispensing channel
  const vDepId = voucher.depositoId;
  const vDepName = cleanStr(voucher.deposito);
  const dId = deposit.id;
  const dName = cleanStr(deposit.nombre);
  const dCode = cleanStr(deposit.codigo);

  if (vDepId && (vDepId === dId || vDepId === dCode)) return true;
  if (dName && vDepName) {
    if (vDepName === dName || vDepName.includes(dName) || dName.includes(vDepName)) return true;
  }

  return false;
}

/**
 * Resolves whether a fuel voucher is canonically an INGRESO (stock addition to a cistern/drum/tank)
 * or an EGRESO (operational fuel dispatch / consumption into fleet vehicles or machinery).
 */
export function resolveMovementType(
  voucher: FuelDispensary,
  deposits?: FuelDeposit[]
): 'INGRESO' | 'EGRESO' {
  if (!voucher) return 'EGRESO';
  const rawTipo = cleanStr(voucher.tipo);

  // 1. Explicit canonical value
  if (rawTipo === 'ingreso') return 'INGRESO';
  if (rawTipo === 'egreso') return 'EGRESO';

  // 2. Check if voucher represents an incoming load into any tracked deposit
  if (deposits && deposits.length > 0) {
    const isIncoming = deposits.some(dep => dep.modalidad !== 'VALES_ESTACION' && isVoucherIncomingToDeposit(voucher, dep));
    if (isIncoming) return 'INGRESO';
  }

  // 3. Fallback check by recipient equipment code, model, plate
  const vCode = cleanStr(voucher.codigoEquipo);
  const vModel = cleanStr(voucher.marcaModelo);
  const vPlate = cleanStr(voucher.patente);
  const recipient = `${vCode} ${vModel} ${vPlate}`;

  if (
    recipient.includes('bidon') ||
    recipient.includes('cisterna') ||
    recipient.includes('dep-amb') ||
    recipient.includes('tanque movil') ||
    recipient.includes('deposito ambulante')
  ) {
    return 'INGRESO';
  }

  // All other dispatches into fleet vehicles/machinery are EGRESO
  return 'EGRESO';
}

const parseTimeToMinutes = (raw?: string): number | null => {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  let hh = parseInt(match[1], 10);
  const mm = parseInt(match[2], 10);
  if (isNaN(hh) || isNaN(mm)) return null;
  const isPM = /p\.?\s*m\.?/.test(s);
  const isAM = /a\.?\s*m\.?/.test(s);
  if (isPM && hh < 12) hh += 12;
  if (isAM && hh === 12) hh = 0;
  return hh * 60 + mm;
};

const isVoucherAtOrAfterAdjustment = (
  voucher: FuelDispensary,
  adjDate: string,
  adjHora?: string
): boolean => {
  const vDate = (voucher.fecha || '').slice(0, 10);
  const aDate = (adjDate || '').slice(0, 10);
  if (!vDate || !aDate) return false;
  if (vDate > aDate) return true;
  if (vDate < aDate) return false;
  const adjMins = parseTimeToMinutes(adjHora);
  const vMins = parseTimeToMinutes(voucher.hora);
  if (adjMins !== null && vMins !== null) {
    return vMins >= adjMins;
  }
  return true;
};

/**
 * Reconciles the stock of each deposit dynamically based on the full voucher ledger (cargas y descargas).
 * Preserves persisted stock when there are no linked vouchers or manual overrides.
 */
export function reconcileDepositStocks(
  deposits: FuelDeposit[],
  vouchers: FuelDispensary[]
): FuelDeposit[] {
  return deposits.map(dep => {
    // 1. Estaciones de Servicio (Convenio): solo acumulan consumo / cargas realizadas
    if (dep.modalidad === 'VALES_ESTACION') {
      const stationVouchers = vouchers.filter(v => {
        if (v.depositoId && v.depositoId === dep.id) return true;
        const vDep = cleanStr(v.deposito);
        const dName = cleanStr(dep.nombre);
        const dStation = cleanStr(dep.nombreEstacion);
        const dConvenio = cleanStr(dep.numEstacionConvenio);
        const vStation = cleanStr(v.numEstacion);

        if (dName && vDep && (vDep === dName || vDep.includes(dName) || dName.includes(vDep))) return true;
        if (dStation && vDep && (vDep === dStation || vDep.includes(dStation) || dStation.includes(vDep))) return true;
        if (dConvenio && vStation && (vStation === dConvenio || vStation.includes(dConvenio))) return true;
        return false;
      });

      const totalLiters = stationVouchers.reduce((sum, v) => sum + getVoucherLiters(v), 0);
      const count = stationVouchers.length;

      return {
        ...dep,
        totalCargasLitros: totalLiters > 0 ? Number(totalLiters.toFixed(3)) : (dep.totalCargasLitros || 0),
        cantidadCargas: count > 0 ? count : (dep.cantidadCargas || 0)
      };
    }

    // 2. Cisternas Móviles (DEPOSITO_AMBULANTE) y Depósitos de Bidones (BIDONES):
    const incomingVouchers = vouchers.filter(v => isVoucherIncomingToDeposit(v, dep));
    const outgoingVouchers = vouchers.filter(v => isVoucherOutgoingFromDeposit(v, dep));

    // If there are no linked vouchers and no manual adjustment override, preserve persisted DB fields intact
    if (incomingVouchers.length === 0 && outgoingVouchers.length === 0 && dep.stockAjustadoManual === undefined) {
      return dep;
    }

    const totalEntradasLiters = incomingVouchers.reduce((sum, v) => sum + getVoucherLiters(v), 0);
    const totalSalidasLiters = outgoingVouchers.reduce((sum, v) => sum + getVoucherLiters(v), 0);

    const sortedIncoming = [...incomingVouchers].sort((a, b) => {
      const dc = (b.fecha || '').localeCompare(a.fecha || '');
      if (dc !== 0) return dc;
      const tc = (b.hora || '').localeCompare(a.hora || '');
      if (tc !== 0) return tc;
      return (b.id || '').localeCompare(a.id || '');
    });

    const latestIncoming = sortedIncoming[0];
    const latestIncomingPrice = latestIncoming?.precioUnitario 
      ? Number(latestIncoming.precioUnitario) 
      : (latestIncoming?.totalImporte && getVoucherLiters(latestIncoming) > 0 
          ? Number((latestIncoming.totalImporte / getVoucherLiters(latestIncoming)).toFixed(2)) 
          : undefined);

    const baseCargas = Number(totalEntradasLiters.toFixed(3));
    const baseDescargas = Number(totalSalidasLiters.toFixed(3));
    const targetManualStock = dep.stockAjustadoManual !== undefined ? dep.stockAjustadoManual : undefined;

    let resolvedTotalCargas = baseCargas;
    let resolvedTotalDescargas = baseDescargas;

    if (targetManualStock !== undefined) {
      const diff = Number((targetManualStock - (baseCargas - baseDescargas)).toFixed(3));
      if (diff > 0) {
        resolvedTotalCargas = Number((baseCargas + diff).toFixed(3));
      } else if (diff < 0) {
        resolvedTotalDescargas = Number((baseDescargas + Math.abs(diff)).toFixed(3));
      }
    }

    let nextStock: number;
    if (targetManualStock !== undefined && dep.ultimoAjusteFecha) {
      const latestAdjHora = dep.historialAjustes?.[0]?.hora;
      const subsequentIncoming = incomingVouchers.filter(v =>
        isVoucherAtOrAfterAdjustment(v, dep.ultimoAjusteFecha || '', latestAdjHora)
      );
      const subsequentOutgoing = outgoingVouchers.filter(v =>
        isVoucherAtOrAfterAdjustment(v, dep.ultimoAjusteFecha || '', latestAdjHora)
      );
      const subsequentCargas = subsequentIncoming.reduce((sum, v) => sum + getVoucherLiters(v), 0);
      const subsequentDescargas = subsequentOutgoing.reduce((sum, v) => sum + getVoucherLiters(v), 0);
      // Sin tope superior ni piso en 0: permite pasar capacidad nominal o quedar en negativo si las cargas se ingresan fuera de orden
      nextStock = targetManualStock + subsequentCargas - subsequentDescargas;
    } else if (targetManualStock !== undefined) {
      nextStock = targetManualStock;
    } else {
      nextStock = resolvedTotalCargas - resolvedTotalDescargas;
    }

    nextStock = Number(nextStock.toFixed(3));

    const alertMin = dep.nivelAlertaMinimo !== undefined ? dep.nivelAlertaMinimo : Math.max(10, dep.capacidadTotal * 0.15);
    const newStatus = nextStock <= alertMin ? 'BAJO_STOCK' : 'OPERATIVO';

    return {
      ...dep,
      stockActual: nextStock,
      totalCargasLitros: resolvedTotalCargas,
      totalDescargasLitros: resolvedTotalDescargas,
      cantidadCargas: incomingVouchers.length > 0 ? incomingVouchers.length : (dep.cantidadCargas || 0),
      cantidadDescargas: outgoingVouchers.length > 0 ? outgoingVouchers.length : (dep.cantidadDescargas || 0),
      costoPorLitroEstimado: latestIncomingPrice || dep.costoPorLitroEstimado || 0,
      ultimaRecargaFecha: latestIncoming?.fecha || dep.ultimaRecargaFecha || '',
      ultimaRecargaLitros: latestIncoming ? getVoucherLiters(latestIncoming) : (dep.ultimaRecargaLitros || 0),
      estado: newStatus
    };
  });
}
