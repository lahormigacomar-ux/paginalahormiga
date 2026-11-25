import { FuelDispensary, ParteDiario, Vehicle } from '../types';
import { findMatchingVehicle, normalizeObraDateKey } from './obraCostosEngine';

export type CrossUnitType = 'km' | 'hs';

export type CrossStatus =
  | 'PRORATED'
  | 'EXACT_LOAD_ONLY'
  | 'PENDING_NEXT_LOAD'
  | 'NO_FUEL_DATA'
  | 'ANOMALY';

export type CoincidenciaStatus =
  | 'COINCIDE'
  | 'DESVIO_LEVE'
  | 'DESFASAJE'
  | 'KM_TRAMO';

export interface MacheoToleranceConfig {
  coincidePct: number;
  desvioLevePct: number;
  minHsTramoCoincide: number;
  minHsTramoLeve: number;
  minHsDirectoCoincide: number;
  minHsDirectoLeve: number;
}

export const DEFAULT_MACHEO_TOLERANCE_CONFIG: MacheoToleranceConfig = {
  coincidePct: 15,
  desvioLevePct: 35,
  minHsTramoCoincide: 2,
  minHsTramoLeve: 4,
  minHsDirectoCoincide: 0.5,
  minHsDirectoLeve: 1.5,
};

export function normalizeMacheoToleranceConfig(
  raw?: Partial<MacheoToleranceConfig> | null
): MacheoToleranceConfig {
  const num = (v: unknown, fallback: number, min = 0, max = 500) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const coincidePct = num(raw?.coincidePct, DEFAULT_MACHEO_TOLERANCE_CONFIG.coincidePct, 0, 100);
  const desvioLevePct = Math.max(
    coincidePct,
    num(raw?.desvioLevePct, DEFAULT_MACHEO_TOLERANCE_CONFIG.desvioLevePct, 0, 200)
  );
  const minHsTramoCoincide = num(
    raw?.minHsTramoCoincide,
    DEFAULT_MACHEO_TOLERANCE_CONFIG.minHsTramoCoincide,
    0,
    100
  );
  const minHsTramoLeve = Math.max(
    minHsTramoCoincide,
    num(
      raw?.minHsTramoLeve,
      Math.max(minHsTramoCoincide * 2, DEFAULT_MACHEO_TOLERANCE_CONFIG.minHsTramoLeve),
      0,
      200
    )
  );
  const minHsDirectoCoincide = num(
    raw?.minHsDirectoCoincide,
    DEFAULT_MACHEO_TOLERANCE_CONFIG.minHsDirectoCoincide,
    0,
    50
  );
  const minHsDirectoLeve = Math.max(
    minHsDirectoCoincide,
    num(
      raw?.minHsDirectoLeve,
      Math.max(minHsDirectoCoincide * 3, DEFAULT_MACHEO_TOLERANCE_CONFIG.minHsDirectoLeve),
      0,
      100
    )
  );

  return {
    coincidePct,
    desvioLevePct,
    minHsTramoCoincide,
    minHsTramoLeve,
    minHsDirectoCoincide,
    minHsDirectoLeve,
  };
}

export interface ParteKilometrajeCrossInfo {
  parteId: string;
  machineKey: string;
  unit: CrossUnitType;
  status: CrossStatus;
  tramoKey?: string;
  odomAproxInicio?: number;
  odomAproxFin?: number;
  kmProrrateadoDia?: number;
  isFuelLoadDay: boolean;
  lecturaCargaDia?: number;
  litrosCargaDia?: number;
  prevLoadDate?: string;
  prevLoadReading?: number;
  prevLoadLitros?: number;
  prevLoadVoucherRefs?: string[];
  nextLoadDate?: string;
  nextLoadReading?: number;
  nextLoadDeposito?: string;
  nextLoadVoucherRefs?: string[];
  tramoDelta?: number;
  tramoHorasPartes?: number;
  tramoDiasTrabajo?: number;
  tramoPartesCount?: number;
  tramoLitros?: number;
  coincidencia?: CoincidenciaStatus;
  diferenciaHoras?: number;
  kmPorHora?: number;
  kmPorDia?: number;
}

const norm = (s?: string) => (s ? s.trim().toUpperCase().replace(/\s+/g, ' ') : '');
const alpha = (s?: string) => (s ? s.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '');

export function parseReadingNumber(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val !== 'string') return 0;
  const trimmed = val.trim();
  if (!trimmed) return 0;
  // Support Argentine formatted numbers like "317.958" or "1.245,5"
  let cleaned = trimmed.replace(/\s+/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d+$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatCrossDateDDMMYYYY(isoKey?: string): string {
  if (!isoKey) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoKey);
  if (!m) return isoKey;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function shiftIsoDate(isoKey: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoKey);
  if (!m) return isoKey;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function normalizeCrossDateKey(dateStr?: string): string {
  const k = normalizeObraDateKey(dateStr);
  if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k;
  return '';
}

function detectMachineUnit(
  vehicle?: Vehicle,
  voucherClasificacion?: string
): CrossUnitType | null {
  const rawClass = norm(vehicle?.clasificacion || voucherClasificacion || '');
  const rawCat = norm(vehicle?.categoriaEquipo || '');

  if (
    rawClass.includes('CAMIONETA') ||
    rawClass.includes('CAMIÓN') ||
    rawClass.includes('CAMION') ||
    rawClass.includes('AUTO') ||
    rawClass.includes('VEHÍCULO') ||
    rawClass.includes('VEHICULO') ||
    rawClass.includes('PICKUP') ||
    rawClass.includes('UTILITARIO') ||
    rawClass.includes('BATEA') ||
    rawClass.includes('CARRET') ||
    rawClass.includes('CHASIS') ||
    rawCat === 'TRANSPORTE'
  ) {
    return 'km';
  }

  if (
    rawClass.includes('MÁQUINA') ||
    rawClass.includes('MAQUINA') ||
    rawClass.includes('RETRO') ||
    rawClass.includes('EXCAV') ||
    rawClass.includes('PALA') ||
    rawClass.includes('MINI') ||
    rawClass.includes('RODILLO') ||
    rawClass.includes('AUTOELEV') ||
    rawClass.includes('CLARK') ||
    rawClass.includes('MANIPUL') ||
    rawClass.includes('GRUPO') ||
    rawClass.includes('PLATAFORMA') ||
    rawCat === 'VIAL_PESADA' ||
    rawCat === 'HERRAMIENTA_MENOR'
  ) {
    return 'hs';
  }

  if (vehicle) {
    if ((vehicle.horometro || 0) > 0 && !(vehicle.odometro || 0)) return 'hs';
    if ((vehicle.odometro || 0) > 0 && !(vehicle.horometro || 0)) return 'km';
  }

  return null;
}

function resolveMachineIdentity(
  record: Parameters<typeof findMatchingVehicle>[0],
  fleet: Vehicle[]
): { key: string; vehicle?: Vehicle } {
  const matched = findMatchingVehicle(record, fleet);
  if (matched) {
    return { key: `VEH:${matched.id}`, vehicle: matched };
  }
  const token =
    alpha(record.codigoEquipo) ||
    alpha(record.patente) ||
    alpha(record.marcaModelo);
  return { key: token ? `RAW:${token}` : '' };
}

interface DailyFuelCheckpoint {
  dateKey: string;
  readingMin: number;
  readingMax: number;
  deltaRecordedSum: number;
  litrosSum: number;
  vouchersCount: number;
  voucherRefs: string[];
  depositos: string[];
  clasificacionHint?: string;
}

interface IndexedParte {
  parte: ParteDiario;
  dateKey: string;
  horasDeclaradas: number;
}

export function buildPartesKilometrajeCrossMap(
  partes: ParteDiario[],
  fuelVouchers: FuelDispensary[],
  fleet: Vehicle[],
  toleranceConfig?: Partial<MacheoToleranceConfig>
): Map<string, ParteKilometrajeCrossInfo> {
  const result = new Map<string, ParteKilometrajeCrossInfo>();
  if (!partes.length) return result;
  const tolCfg = normalizeMacheoToleranceConfig(toleranceConfig);

  // 1. Group fuel loads by canonical machine key & dateKey (excluding INGRESO)
  const fuelByMachineDay = new Map<string, Map<string, DailyFuelCheckpoint>>();
  const machineVehicleMap = new Map<string, Vehicle | undefined>();

  fuelVouchers.forEach((v) => {
    if (norm(v.tipo) === 'INGRESO') return;
    const dateKey = normalizeCrossDateKey(v.fecha);
    if (!dateKey) return;

    const reading = parseReadingNumber(
      v.kilometraje ?? v.kmsHs ?? v.horometroOdometro
    );
    const deltaRec = parseReadingNumber(v.kilometrosRec);
    if (reading <= 0 && deltaRec <= 0) return;

    const { key: machineKey, vehicle } = resolveMachineIdentity(
      {
        codigoEquipo: v.codigoEquipo,
        marcaModelo: v.marcaModelo,
        patente: v.patente,
      },
      fleet
    );
    if (!machineKey) return;
    if (vehicle && !machineVehicleMap.has(machineKey)) {
      machineVehicleMap.set(machineKey, vehicle);
    }

    if (!fuelByMachineDay.has(machineKey)) {
      fuelByMachineDay.set(machineKey, new Map());
    }
    const dayMap = fuelByMachineDay.get(machineKey)!;
    const litros = Math.abs(Number(v.cantidad || v.cantCarga || 0));

    const refParts: string[] = [];
    if (v.numOrden) refParts.push(`Ord. ${v.numOrden}`);
    else if (v.numVale) refParts.push(`Vale ${v.numVale}`);
    else if (v.numTicket) refParts.push(`Tk. ${v.numTicket}`);
    else if (v.numComprobante) refParts.push(`Comp. ${v.numComprobante}`);
    const refLabel = refParts.join(' ');
    const depLabel = (v.deposito || '').trim();

    const existing = dayMap.get(dateKey);
    if (!existing) {
      dayMap.set(dateKey, {
        dateKey,
        readingMin: reading > 0 ? reading : 0,
        readingMax: reading > 0 ? reading : 0,
        deltaRecordedSum: deltaRec > 0 ? deltaRec : 0,
        litrosSum: litros,
        vouchersCount: 1,
        voucherRefs: refLabel ? [refLabel] : [],
        depositos: depLabel ? [depLabel] : [],
        clasificacionHint: v.clasificacion,
      });
    } else {
      if (reading > 0) {
        existing.readingMin =
          existing.readingMin > 0 ? Math.min(existing.readingMin, reading) : reading;
        existing.readingMax = Math.max(existing.readingMax, reading);
      }
      if (deltaRec > 0) existing.deltaRecordedSum += deltaRec;
      existing.litrosSum += litros;
      existing.vouchersCount += 1;
      if (refLabel && !existing.voucherRefs.includes(refLabel)) {
        existing.voucherRefs.push(refLabel);
      }
      if (depLabel && !existing.depositos.includes(depLabel)) {
        existing.depositos.push(depLabel);
      }
      if (!existing.clasificacionHint && v.clasificacion) {
        existing.clasificacionHint = v.clasificacion;
      }
    }
  });

  // 2. Group partes by canonical machine key
  const partesByMachine = new Map<string, IndexedParte[]>();
  partes.forEach((p) => {
    const dateKey = normalizeCrossDateKey(p.fecha);
    const { key: machineKey, vehicle } = resolveMachineIdentity(
      {
        vehicleId: p.vehicleId,
        codigoEquipo: p.codigoEquipo,
        marcaModelo: p.marcaModelo,
        equipoPatenteOrCodigo: p.patenteOrCodigo,
      },
      fleet
    );
    if (vehicle && machineKey && !machineVehicleMap.has(machineKey)) {
      machineVehicleMap.set(machineKey, vehicle);
    }

    const fallbackUnit = detectMachineUnit(vehicle) || 'km';

    if (!machineKey || !dateKey) {
      result.set(p.id, {
        parteId: p.id,
        machineKey,
        unit: fallbackUnit,
        status: 'NO_FUEL_DATA',
        isFuelLoadDay: false,
      });
      return;
    }

    if (!partesByMachine.has(machineKey)) {
      partesByMachine.set(machineKey, []);
    }
    partesByMachine.get(machineKey)!.push({
      parte: p,
      dateKey,
      horasDeclaradas: Math.max(0, Number(p.horasTrabajadas || p.hsCantidad || 0)),
    });
  });

  // 3. Cross-reference & prorate tramos per machine
  partesByMachine.forEach((machinePartes, machineKey) => {
    machinePartes.sort(
      (a, b) =>
        a.dateKey.localeCompare(b.dateKey) ||
        String(a.parte.numParte || '').localeCompare(String(b.parte.numParte || '')) ||
        String(a.parte.id).localeCompare(String(b.parte.id))
    );

    const vehicle = machineVehicleMap.get(machineKey);
    const dayMap = fuelByMachineDay.get(machineKey);
    const checkpoints = dayMap
      ? Array.from(dayMap.values())
          .filter((c) => c.readingMax > 0 || c.deltaRecordedSum > 0)
          .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      : [];

    const explicitUnit = detectMachineUnit(
      vehicle,
      checkpoints.find((c) => c.clasificacionHint)?.clasificacionHint
    );

    if (checkpoints.length === 0) {
      machinePartes.forEach((ip) => {
        result.set(ip.parte.id, {
          parteId: ip.parte.id,
          machineKey,
          unit: explicitUnit || 'km',
          status: 'NO_FUEL_DATA',
          isFuelLoadDay: false,
        });
      });
      return;
    }

    const checkpointByDate = new Map<string, DailyFuelCheckpoint>();
    checkpoints.forEach((c) => checkpointByDate.set(c.dateKey, c));

    const assignedParteIds = new Set<string>();

    const assignTramo = (
      tramoPartes: IndexedParte[],
      startReading: number,
      endReading: number,
      tramoDelta: number,
      prevLoad: DailyFuelCheckpoint | undefined,
      curLoad: DailyFuelCheckpoint,
      isAnomaly: boolean
    ) => {
      if (tramoPartes.length === 0) return;

      const tramoHorasPartes = Number(
        tramoPartes.reduce((sum, ip) => sum + ip.horasDeclaradas, 0).toFixed(2)
      );
      const uniqueDates = new Set(tramoPartes.map((ip) => ip.dateKey));
      const tramoDiasTrabajo = uniqueDates.size;

      // Determine unit (explicit from vehicle/fuel classification, or inferred from delta/hs ratio)
      const inferredUnit: CrossUnitType =
        explicitUnit ||
        (tramoHorasPartes > 0 && tramoDelta > 0 && tramoDelta / tramoHorasPartes <= 2.5
          ? 'hs'
          : 'km');

      // Prorate weights: prefer declared hours (with avg positive hours fallback for 0h VIAJES/DIA partes),
      // else equal share per working day (divided equally among same-day partes)
      const positiveHoursList = tramoPartes
        .map((ip) => ip.horasDeclaradas)
        .filter((h) => h > 0);
      const avgPositiveHours =
        positiveHoursList.length > 0
          ? positiveHoursList.reduce((a, b) => a + b, 0) / positiveHoursList.length
          : 0;

      const countByDate = new Map<string, number>();
      tramoPartes.forEach((ip) => {
        countByDate.set(ip.dateKey, (countByDate.get(ip.dateKey) || 0) + 1);
      });

      const weights = tramoPartes.map((ip) => {
        if (avgPositiveHours > 0) {
          return ip.horasDeclaradas > 0 ? ip.horasDeclaradas : avgPositiveHours;
        }
        const diaMult =
          ip.parte.tipo === 'DIA' && Number(ip.parte.cantidadDias || 0) > 1
            ? Number(ip.parte.cantidadDias)
            : 1;
        const sameDayCount = countByDate.get(ip.dateKey) || 1;
        return diaMult / sameDayCount;
      });

      const totalWeight = weights.reduce((a, b) => a + b, 0);

      let coincidencia: CoincidenciaStatus = 'KM_TRAMO';
      let diferenciaHoras: number | undefined;
      let kmPorHora: number | undefined;
      const kmPorDia = tramoDiasTrabajo > 0 ? tramoDelta / tramoDiasTrabajo : undefined;

      if (inferredUnit === 'hs') {
        diferenciaHoras = Number((tramoDelta - tramoHorasPartes).toFixed(1));
        if (tramoHorasPartes > 0) {
          const absDiff = Math.abs(diferenciaHoras);
          const tolCoincide = Math.max(
            tolCfg.minHsTramoCoincide,
            tramoHorasPartes * (tolCfg.coincidePct / 100)
          );
          const tolLeve = Math.max(
            tolCfg.minHsTramoLeve,
            tramoHorasPartes * (tolCfg.desvioLevePct / 100)
          );
          if (absDiff <= tolCoincide) {
            coincidencia = 'COINCIDE';
          } else if (absDiff <= tolLeve) {
            coincidencia = 'DESVIO_LEVE';
          } else {
            coincidencia = 'DESFASAJE';
          }
        }
      } else if (tramoHorasPartes > 0) {
        kmPorHora = Number((tramoDelta / tramoHorasPartes).toFixed(1));
      }

      const tramoKey = `${machineKey}::${prevLoad?.dateKey || 'INI'}->${curLoad.dateKey}`;

      let cumulative = 0;
      tramoPartes.forEach((ip, idx) => {
        const weight = weights[idx];
        const share = totalWeight > 0 ? tramoDelta * (weight / totalWeight) : 0;
        const odomInicio = startReading > 0 ? startReading + cumulative : undefined;
        cumulative += share;
        const odomFin = startReading > 0 ? startReading + cumulative : undefined;

        const dayCp = checkpointByDate.get(ip.dateKey);
        assignedParteIds.add(ip.parte.id);

        result.set(ip.parte.id, {
          parteId: ip.parte.id,
          machineKey,
          unit: inferredUnit,
          status: isAnomaly ? 'ANOMALY' : 'PRORATED',
          tramoKey,
          odomAproxInicio: odomInicio !== undefined ? Math.round(odomInicio * 10) / 10 : undefined,
          odomAproxFin: odomFin !== undefined ? Math.round(odomFin * 10) / 10 : undefined,
          kmProrrateadoDia: Math.round(share * 10) / 10,
          isFuelLoadDay: Boolean(dayCp),
          lecturaCargaDia: dayCp && dayCp.readingMax > 0 ? dayCp.readingMax : undefined,
          litrosCargaDia: dayCp ? dayCp.litrosSum : undefined,
          prevLoadDate: prevLoad?.dateKey,
          prevLoadReading: prevLoad && prevLoad.readingMax > 0 ? prevLoad.readingMax : undefined,
          prevLoadLitros: prevLoad ? Number(prevLoad.litrosSum.toFixed(1)) : undefined,
          prevLoadVoucherRefs: prevLoad?.voucherRefs,
          nextLoadDate: curLoad.dateKey,
          nextLoadReading: curLoad.readingMax > 0 ? curLoad.readingMax : undefined,
          nextLoadDeposito: curLoad.depositos[0],
          nextLoadVoucherRefs: curLoad.voucherRefs,
          tramoDelta: Math.round(tramoDelta * 10) / 10,
          tramoHorasPartes,
          tramoDiasTrabajo,
          tramoPartesCount: tramoPartes.length,
          tramoLitros: Number(curLoad.litrosSum.toFixed(1)),
          coincidencia,
          diferenciaHoras,
          kmPorHora,
          kmPorDia: kmPorDia !== undefined ? Number(kmPorDia.toFixed(1)) : undefined,
        });
      });
    };

    // First checkpoint (Tramo 0): if it has recorded delta (kilometrosRec > 0), prorate up to 30 days back
    const firstCp = checkpoints[0];
    if (firstCp.deltaRecordedSum > 0 && firstCp.readingMax > 0) {
      const minDate = shiftIsoDate(firstCp.dateKey, -30);
      const tramo0Partes = machinePartes.filter(
        (ip) => ip.dateKey >= minDate && ip.dateKey <= firstCp.dateKey
      );
      const startR = Math.max(0, firstCp.readingMax - firstCp.deltaRecordedSum);
      assignTramo(
        tramo0Partes,
        startR,
        firstCp.readingMax,
        firstCp.deltaRecordedSum,
        undefined,
        firstCp,
        false
      );
    } else if (firstCp.readingMax > 0) {
      // Exact reading available on first load day even without prior load
      machinePartes
        .filter((ip) => ip.dateKey === firstCp.dateKey)
        .forEach((ip) => {
          assignedParteIds.add(ip.parte.id);
          result.set(ip.parte.id, {
            parteId: ip.parte.id,
            machineKey,
            unit: explicitUnit || 'km',
            status: 'EXACT_LOAD_ONLY',
            tramoKey: `${machineKey}::INI->${firstCp.dateKey}`,
            odomAproxFin: firstCp.readingMax,
            isFuelLoadDay: true,
            lecturaCargaDia: firstCp.readingMax,
            litrosCargaDia: firstCp.litrosSum,
            nextLoadDate: firstCp.dateKey,
            nextLoadReading: firstCp.readingMax,
            nextLoadDeposito: firstCp.depositos[0],
            nextLoadVoucherRefs: firstCp.voucherRefs,
            tramoLitros: Number(firstCp.litrosSum.toFixed(1)),
          });
        });
    }

    // Subsequent intervals C_{i-1} -> C_i
    for (let i = 1; i < checkpoints.length; i++) {
      const prevCp = checkpoints[i - 1];
      const curCp = checkpoints[i];

      const tramoPartes = machinePartes.filter(
        (ip) =>
          !assignedParteIds.has(ip.parte.id) &&
          ip.dateKey > prevCp.dateKey &&
          ip.dateKey <= curCp.dateKey
      );
      if (tramoPartes.length === 0) continue;

      let startR = prevCp.readingMax;
      const endR = curCp.readingMax;
      let delta = 0;
      let isAnomaly = false;

      if (endR > 0 && startR > 0) {
        if (endR >= startR) {
          delta = endR - startR;
        } else if (curCp.deltaRecordedSum > 0) {
          delta = curCp.deltaRecordedSum;
          startR = Math.max(0, endR - delta);
          isAnomaly = true;
        } else {
          delta = 0;
          isAnomaly = true;
        }
      } else if (curCp.deltaRecordedSum > 0) {
        delta = curCp.deltaRecordedSum;
        if (endR > 0) startR = Math.max(0, endR - delta);
      }

      assignTramo(tramoPartes, startR, endR, delta, prevCp, curCp, isAnomaly);
    }

    // Any remaining unassigned partes (e.g., before first load without delta, or after last load)
    const lastCp = checkpoints[checkpoints.length - 1];
    machinePartes.forEach((ip) => {
      if (assignedParteIds.has(ip.parte.id)) return;
      const isAfterLast = ip.dateKey > lastCp.dateKey;
      result.set(ip.parte.id, {
        parteId: ip.parte.id,
        machineKey,
        unit: explicitUnit || 'km',
        status: isAfterLast ? 'PENDING_NEXT_LOAD' : 'NO_FUEL_DATA',
        isFuelLoadDay: false,
        prevLoadDate: isAfterLast ? lastCp.dateKey : undefined,
        prevLoadReading: isAfterLast && lastCp.readingMax > 0 ? lastCp.readingMax : undefined,
      });
    });
  });

  return result;
}
