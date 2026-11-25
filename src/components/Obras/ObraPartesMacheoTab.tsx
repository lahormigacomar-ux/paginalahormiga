import React, { useEffect, useMemo, useState } from 'react';
import {
  Obra,
  ParteDiario,
  FuelDispensary,
  Vehicle,
  RentalContract
} from '../../types';
import {
  buildPartesKilometrajeCrossMap,
  DEFAULT_MACHEO_TOLERANCE_CONFIG,
  formatCrossDateDDMMYYYY,
  MacheoToleranceConfig,
  normalizeMacheoToleranceConfig,
  ParteKilometrajeCrossInfo
} from '../../utils/parteKilometrajeCross';
import { apiFetchSetting, apiSaveSettingStrict } from '../../services/api';
import {
  findMatchingVehicle,
  normalizeObraDateKey,
  resolveContenedorScope
} from '../../utils/obraCostosEngine';
import {
  ClipboardList,
  Search,
  Fuel,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  Truck,
  Calendar,
  ChevronDown,
  ChevronUp,
  X,
  FolderOpen,
  SlidersHorizontal,
  Loader2,
  RotateCcw
} from 'lucide-react';

interface ObraPartesMacheoTabProps {
  obra: Obra;
  allPartesDiarios: ParteDiario[];
  obraPartes: ParteDiario[];
  rentals?: RentalContract[];
  fuelVouchers: FuelDispensary[];
  fleet: Vehicle[];
  selectedContenedorId?: string;
  onChangeContenedorId?: (id: string) => void;
  toleranceConfig?: MacheoToleranceConfig;
  onSaveToleranceConfig?: (cfg: MacheoToleranceConfig) => Promise<{ ok: boolean; error?: string }>;
}

type MacheoFilterType =
  | 'ALL'
  | 'COINCIDE'
  | 'MAS_ODOM'
  | 'MENOS_ODOM'
  | 'CAMIONES_KM'
  | 'SIN_CRUCE';

interface ParteMacheoRow {
  parte: ParteDiario;
  dateKey: string;
  unit: 'hs' | 'km';
  hsDeclaradas: number;
  odoWorked?: number;
  odoIni?: number;
  odoFin?: number;
  isApprox: boolean;
  source: 'DIRECT' | 'FUEL_CROSS' | 'PARTIAL' | 'PENDING' | 'NONE';
  diffHs?: number; // odo - parte (en el tramo o directo)
  tramoDelta?: number;
  tramoHorasPartes?: number;
  tramoDiffHs?: number;
  macheoStatus: 'COINCIDE' | 'DESVIO_LEVE' | 'DESFASAJE' | 'KM_TRAMO' | 'PENDING' | 'NONE';
  macheoDirection: 'MATCH' | 'MAS_ODOM' | 'MENOS_ODOM' | 'KM' | 'NONE';
  cross?: ParteKilometrajeCrossInfo;
  attachedFacturas: Array<{ id: string; label: string; periodo?: string }>;
  attachedPeriodos: string[];
}

interface MachineMacheoSummary {
  machineKey: string;
  label: string;
  unit: 'hs' | 'km';
  partesCount: number;
  totalHsPartesAll: number;
  totalViajesAll: number;
  partesConCruceCount: number;
  hsPartesConCruce: number;
  totalOdomWorked: number; // hs o km según unit
  odoMin?: number;
  odoMax?: number;
  diffHs?: number; // totalOdomWorked - hsPartesConCruce (solo hs)
  status: 'COINCIDE' | 'MAS_ODOM' | 'MENOS_ODOM' | 'KM_OK' | 'SIN_CRUCE';
}

interface TramoSummary {
  tramoKey: string;
  machineLabel: string;
  unit: 'hs' | 'km';
  prevLoadDate?: string;
  prevLoadReading?: number;
  nextLoadDate: string;
  nextLoadReading?: number;
  tramoLitros?: number;
  nextLoadVoucherRefs: string[];
  nextLoadDeposito?: string;
  obraPartesCount: number;
  totalTramoPartesCount: number;
  minParteDate: string;
  maxParteDate: string;
  tramoDelta?: number;
  tramoHorasPartes?: number;
  diferenciaHoras?: number;
  coincidencia?: ParteKilometrajeCrossInfo['coincidencia'];
}

const inferUnit = (
  p: ParteDiario,
  fleet: Vehicle[],
  cross?: ParteKilometrajeCrossInfo
): 'hs' | 'km' => {
  if (cross?.unit) return cross.unit;
  const matched = findMatchingVehicle(
    {
      vehicleId: p.vehicleId,
      codigoEquipo: p.codigoEquipo,
      marcaModelo: p.marcaModelo,
      equipoPatenteOrCodigo: p.patenteOrCodigo
    },
    fleet
  );
  const raw = `${matched?.clasificacion || ''} ${matched?.categoriaEquipo || ''} ${p.marcaModelo || ''}`.toUpperCase();
  if (
    raw.includes('CAMION') ||
    raw.includes('CAMIÓN') ||
    raw.includes('MERCEDES') ||
    raw.includes('VOLCADOR') ||
    raw.includes('BATEA') ||
    raw.includes('CARRET') ||
    raw.includes('CHASIS') ||
    raw.includes('PICKUP') ||
    raw.includes('UTILITARIO') ||
    raw.includes('TRANSPORTE') ||
    p.tipo === 'VIAJES'
  ) {
    return 'km';
  }
  if (matched) {
    if ((matched.odometro || 0) > 0 && !(matched.horometro || 0)) return 'km';
    if ((matched.horometro || 0) > 0 && !(matched.odometro || 0)) return 'hs';
  }
  return 'hs';
};

export const ObraPartesMacheoTab: React.FC<ObraPartesMacheoTabProps> = ({
  obra,
  allPartesDiarios,
  obraPartes,
  rentals = [],
  fuelVouchers,
  fleet,
  selectedContenedorId,
  onChangeContenedorId,
  toleranceConfig,
  onSaveToleranceConfig
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEquipo, setSelectedEquipo] = useState<string>('ALL');
  const [macheoFilter, setMacheoFilter] = useState<MacheoFilterType>('ALL');
  const [selectedPeriodoId, setSelectedPeriodoId] = useState<string>('ALL');
  const [selectedTramoKey, setSelectedTramoKey] = useState<string>('ALL');
  const [showTramosPanel, setShowTramosPanel] = useState<boolean>(true);
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');

  const [localTolerance, setLocalTolerance] = useState<MacheoToleranceConfig>(
    toleranceConfig ? normalizeMacheoToleranceConfig(toleranceConfig) : DEFAULT_MACHEO_TOLERANCE_CONFIG
  );
  const [showTolerancePanel, setShowTolerancePanel] = useState<boolean>(false);
  const [draftTolerance, setDraftTolerance] = useState<MacheoToleranceConfig>(localTolerance);
  const [isSavingTolerance, setIsSavingTolerance] = useState<boolean>(false);
  const [toleranceError, setToleranceError] = useState<string | null>(null);
  const [toleranceFeedback, setToleranceFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (toleranceConfig) {
      const normalized = normalizeMacheoToleranceConfig(toleranceConfig);
      setLocalTolerance(normalized);
      if (!showTolerancePanel) {
        setDraftTolerance(normalized);
      }
      return;
    }
    apiFetchSetting<Partial<MacheoToleranceConfig>>('obra_macheo_tolerances')
      .then((res) => {
        if (res && typeof res === 'object') {
          const normalized = normalizeMacheoToleranceConfig(res);
          setLocalTolerance(normalized);
          setDraftTolerance(normalized);
        }
      })
      .catch(() => {});
  }, [toleranceConfig]);

  const activeTolerance = toleranceConfig ?? localTolerance;

  const handleOpenTolerancePanel = () => {
    setToleranceError(null);
    setToleranceFeedback(null);
    if (!showTolerancePanel) {
      setDraftTolerance(activeTolerance);
    }
    setShowTolerancePanel((prev) => !prev);
  };

  const handleSaveTolerance = async (e: React.FormEvent) => {
    e.preventDefault();
    setToleranceError(null);
    setToleranceFeedback(null);

    if (draftTolerance.coincidePct < 0 || draftTolerance.coincidePct > 100) {
      setToleranceError('El porcentaje de COINCIDE debe estar entre 0% y 100%.');
      return;
    }
    if (draftTolerance.desvioLevePct < draftTolerance.coincidePct) {
      setToleranceError(
        'El límite de DESVÍO LEVE no puede ser menor al porcentaje de COINCIDE.'
      );
      return;
    }
    if (draftTolerance.minHsTramoLeve < draftTolerance.minHsTramoCoincide) {
      setToleranceError(
        'El mínimo en horas para DESVÍO LEVE en tramo no puede ser menor al mínimo de COINCIDE.'
      );
      return;
    }
    if (draftTolerance.minHsDirectoLeve < draftTolerance.minHsDirectoCoincide) {
      setToleranceError(
        'El mínimo en horas para DESVÍO LEVE directo no puede ser menor al mínimo de COINCIDE.'
      );
      return;
    }

    const normalized = normalizeMacheoToleranceConfig(draftTolerance);
    setIsSavingTolerance(true);
    const result = onSaveToleranceConfig
      ? await onSaveToleranceConfig(normalized)
      : await apiSaveSettingStrict('obra_macheo_tolerances', normalized);
    setIsSavingTolerance(false);

    if (!result.ok) {
      setToleranceError(
        result.error || 'No se pudo guardar la configuración en Supabase PostgreSQL.'
      );
      return;
    }

    setLocalTolerance(normalized);
    setDraftTolerance(normalized);
    setToleranceFeedback(
      `Tolerancias guardadas en Supabase (±${normalized.coincidePct}% coincide · ${normalized.coincidePct}%–${normalized.desvioLevePct}% desvío leve · >${normalized.desvioLevePct}% desfasaje).`
    );
    setShowTolerancePanel(false);
  };

  const periodos = obra.periodosLegajo || [];
  const activePeriodoId = selectedContenedorId ?? selectedPeriodoId;
  const setActivePeriodoId = (id: string) => {
    setSelectedPeriodoId(id);
    onChangeContenedorId?.(id);
  };

  // Mapa global de cruce combustible/odómetro sobre todos los partes para respetar tramos multi-obra
  const crossMap = useMemo(
    () => buildPartesKilometrajeCrossMap(allPartesDiarios, fuelVouchers, fleet, activeTolerance),
    [allPartesDiarios, fuelVouchers, fleet, activeTolerance]
  );

  // Partes adjuntos a facturas y períodos
  const attachmentMaps = useMemo(() => {
    const facMap = new Map<string, Array<{ id: string; label: string; periodo?: string }>>();
    const perMap = new Map<string, string[]>();

    (obra.facturasLegajo || []).forEach((f) => {
      const pTitle =
        f.periodoTitulo ||
        periodos.find((per) => per.id === f.periodoId)?.titulo ||
        undefined;
      (f.parteDiarioIds || []).forEach((pid) => {
        const list = facMap.get(pid) || [];
        list.push({
          id: f.id,
          label: `${f.tipoComprobante} ${f.nroComprobante}`,
          periodo: pTitle
        });
        facMap.set(pid, list);
      });
    });

    periodos.forEach((per) => {
      (per.parteDiarioIds || []).forEach((pid) => {
        const list = perMap.get(pid) || [];
        if (!list.includes(per.titulo)) list.push(per.titulo);
        perMap.set(pid, list);
      });
    });

    return { facMap, perMap };
  }, [obra.facturasLegajo, periodos]);

  const rows: ParteMacheoRow[] = useMemo(() => {
    return obraPartes
      .map((p): ParteMacheoRow => {
        const dateKey = normalizeObraDateKey(p.fecha);
        const cross = crossMap.get(p.id);
        const unit = inferUnit(p, fleet, cross);
        const hsDeclaradas = Number(p.horasTrabajadas || p.hsCantidad || 0);
        const directIni = Number(p.odometroInicial || p.checklist?.odometroInicial || 0);
        const directFin = Number(p.odomKilom || 0);

        let odoWorked: number | undefined;
        let odoIni: number | undefined;
        let odoFin: number | undefined;
        let isApprox = false;
        let source: ParteMacheoRow['source'] = 'NONE';
        let diffHs: number | undefined;
        let tramoDiffHs: number | undefined;
        let macheoStatus: ParteMacheoRow['macheoStatus'] = 'NONE';
        let macheoDirection: ParteMacheoRow['macheoDirection'] = 'NONE';

        if (directIni > 0 && directFin > 0 && directFin >= directIni) {
          odoWorked = Number((directFin - directIni).toFixed(1));
          odoIni = directIni;
          odoFin = directFin;
          isApprox = false;
          source = 'DIRECT';
          if (unit === 'hs') {
            diffHs = Number((odoWorked - hsDeclaradas).toFixed(1));
            const absDiff = Math.abs(diffHs);
            const tolOk = Math.max(
              activeTolerance.minHsDirectoCoincide,
              hsDeclaradas * (activeTolerance.coincidePct / 100)
            );
            const tolLeve = Math.max(
              activeTolerance.minHsDirectoLeve,
              hsDeclaradas * (activeTolerance.desvioLevePct / 100)
            );
            if (absDiff <= tolOk) {
              macheoStatus = 'COINCIDE';
              macheoDirection = 'MATCH';
            } else {
              macheoStatus = absDiff <= tolLeve ? 'DESVIO_LEVE' : 'DESFASAJE';
              macheoDirection = diffHs > 0 ? 'MAS_ODOM' : 'MENOS_ODOM';
            }
          } else {
            macheoStatus = 'KM_TRAMO';
            macheoDirection = 'KM';
          }
        } else if (
          cross &&
          cross.kmProrrateadoDia !== undefined &&
          cross.odomAproxInicio !== undefined &&
          cross.odomAproxFin !== undefined
        ) {
          odoWorked = cross.kmProrrateadoDia;
          odoIni = cross.odomAproxInicio;
          odoFin =
            directFin > 0
              ? directFin
              : cross.isFuelLoadDay && cross.lecturaCargaDia !== undefined
                ? cross.lecturaCargaDia
                : cross.odomAproxFin;
          isApprox = !cross.isFuelLoadDay;
          source = 'FUEL_CROSS';

          if (unit === 'hs') {
            diffHs = Number((odoWorked - hsDeclaradas).toFixed(1));
            tramoDiffHs = cross.diferenciaHoras;
            macheoStatus = cross.coincidencia || 'COINCIDE';
            if (macheoStatus === 'COINCIDE') {
              macheoDirection = 'MATCH';
            } else if ((tramoDiffHs ?? diffHs) > 0) {
              macheoDirection = 'MAS_ODOM';
            } else if ((tramoDiffHs ?? diffHs) < 0) {
              macheoDirection = 'MENOS_ODOM';
            }
          } else {
            macheoStatus = 'KM_TRAMO';
            macheoDirection = 'KM';
          }
        } else if (cross?.isFuelLoadDay && cross.lecturaCargaDia !== undefined) {
          odoIni = directIni > 0 ? directIni : undefined;
          odoFin = cross.lecturaCargaDia;
          source = 'PARTIAL';
        } else if (directIni > 0 || directFin > 0) {
          odoIni = directIni > 0 ? directIni : undefined;
          odoFin = directFin > 0 ? directFin : undefined;
          source = 'PARTIAL';
        } else if (cross?.status === 'PENDING_NEXT_LOAD') {
          odoIni = cross.prevLoadReading;
          source = 'PENDING';
          macheoStatus = 'PENDING';
        }

        return {
          parte: p,
          dateKey,
          unit,
          hsDeclaradas,
          odoWorked,
          odoIni,
          odoFin,
          isApprox,
          source,
          diffHs,
          tramoDelta: cross?.tramoDelta,
          tramoHorasPartes: cross?.tramoHorasPartes,
          tramoDiffHs,
          macheoStatus,
          macheoDirection,
          cross,
          attachedFacturas: attachmentMaps.facMap.get(p.id) || [],
          attachedPeriodos: attachmentMaps.perMap.get(p.id) || []
        };
      })
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [obraPartes, crossMap, fleet, attachmentMaps, activeTolerance]);

  // Cantidad de partes en ESTA obra que pertenecen a cada tramoKey
  const tramoObraCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      if (r.cross?.tramoKey) {
        counts.set(r.cross.tramoKey, (counts.get(r.cross.tramoKey) || 0) + 1);
      }
    });
    return counts;
  }, [rows]);

  const equipoOptions = useMemo(
    () =>
      Array.from(
        new Set(obraPartes.map((p) => p.marcaModelo || p.codigoEquipo).filter(Boolean))
      ).sort(),
    [obraPartes]
  );

  // Filtrar filas (sin aplicar selectedTramoKey aún para poder listar los tramos disponibles)
  const baseFilteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const containerScope =
      activePeriodoId !== 'ALL'
        ? resolveContenedorScope(obra, activePeriodoId, rentals)
        : undefined;
    const activePeriod = containerScope?.contenedor;

    return rows.filter((r) => {
      const eqName = r.parte.marcaModelo || r.parte.codigoEquipo || '';
      if (selectedEquipo !== 'ALL' && eqName !== selectedEquipo) return false;
      if (fechaDesde && r.dateKey && r.dateKey < fechaDesde) return false;
      if (fechaHasta && r.dateKey && r.dateKey > fechaHasta) return false;

      if (activePeriod && containerScope) {
        if (containerScope.parteIdsScoped && containerScope.parteIdsScoped.size > 0) {
          if (!containerScope.parteIdsScoped.has(r.parte.id)) return false;
        } else {
          const hasDates = Boolean(activePeriod.fechaDesde || activePeriod.fechaHasta);
          if (!hasDates) return false;
          if (activePeriod.fechaDesde && (!r.dateKey || r.dateKey < activePeriod.fechaDesde)) return false;
          if (activePeriod.fechaHasta && (!r.dateKey || r.dateKey > activePeriod.fechaHasta)) return false;
        }
      }

      if (macheoFilter === 'COINCIDE' && r.macheoDirection !== 'MATCH') return false;
      if (macheoFilter === 'MAS_ODOM' && r.macheoDirection !== 'MAS_ODOM') return false;
      if (macheoFilter === 'MENOS_ODOM' && r.macheoDirection !== 'MENOS_ODOM') return false;
      if (macheoFilter === 'CAMIONES_KM' && r.unit !== 'km') return false;
      if (macheoFilter === 'SIN_CRUCE' && r.odoWorked !== undefined) return false;

      if (!q) return true;
      return (
        (r.parte.numParte || '').toLowerCase().includes(q) ||
        eqName.toLowerCase().includes(q) ||
        (r.parte.nombreApellido || '').toLowerCase().includes(q) ||
        (r.parte.novedades || '').toLowerCase().includes(q) ||
        (r.parte.fecha || '').toLowerCase().includes(q) ||
        formatCrossDateDDMMYYYY(r.cross?.nextLoadDate).toLowerCase().includes(q) ||
        (r.cross?.nextLoadDeposito || '').toLowerCase().includes(q) ||
        (r.cross?.nextLoadVoucherRefs || []).some((ref) => ref.toLowerCase().includes(q)) ||
        r.attachedFacturas.some((af) => af.label.toLowerCase().includes(q)) ||
        r.attachedPeriodos.some((pt) => pt.toLowerCase().includes(q))
      );
    });
  }, [
    rows,
    searchTerm,
    selectedEquipo,
    macheoFilter,
    activePeriodoId,
    obra,
    rentals,
    fechaDesde,
    fechaHasta
  ]);

  // Resumen de Cargas de Combustible / Tramos Analizados
  const tramoSummaries: TramoSummary[] = useMemo(() => {
    const map = new Map<string, TramoSummary>();
    baseFilteredRows.forEach((r) => {
      const c = r.cross;
      if (!c?.tramoKey || !c.nextLoadDate) return;
      const existing = map.get(c.tramoKey);
      const machineLabel = r.parte.marcaModelo || r.parte.codigoEquipo || 'Sin equipo';
      if (!existing) {
        const obraCount = tramoObraCounts.get(c.tramoKey) || 1;
        map.set(c.tramoKey, {
          tramoKey: c.tramoKey,
          machineLabel,
          unit: r.unit,
          prevLoadDate: c.prevLoadDate,
          prevLoadReading: c.prevLoadReading,
          nextLoadDate: c.nextLoadDate,
          nextLoadReading: c.nextLoadReading,
          tramoLitros: c.tramoLitros,
          nextLoadVoucherRefs: c.nextLoadVoucherRefs || [],
          nextLoadDeposito: c.nextLoadDeposito,
          obraPartesCount: obraCount,
          totalTramoPartesCount: Math.max(obraCount, c.tramoPartesCount || 0),
          minParteDate: r.dateKey,
          maxParteDate: r.dateKey,
          tramoDelta: c.tramoDelta,
          tramoHorasPartes: c.tramoHorasPartes,
          diferenciaHoras: c.diferenciaHoras,
          coincidencia: c.coincidencia
        });
      } else {
        if (r.dateKey && (!existing.minParteDate || r.dateKey < existing.minParteDate)) {
          existing.minParteDate = r.dateKey;
        }
        if (r.dateKey && (!existing.maxParteDate || r.dateKey > existing.maxParteDate)) {
          existing.maxParteDate = r.dateKey;
        }
      }
    });

    return Array.from(map.values()).sort(
      (a, b) =>
        b.nextLoadDate.localeCompare(a.nextLoadDate) ||
        a.machineLabel.localeCompare(b.machineLabel)
    );
  }, [baseFilteredRows, tramoObraCounts]);

  const filteredRows = useMemo(() => {
    if (selectedTramoKey === 'ALL') return baseFilteredRows;
    return baseFilteredRows.filter((r) => r.cross?.tramoKey === selectedTramoKey);
  }, [baseFilteredRows, selectedTramoKey]);

  const activeTramo = useMemo(
    () =>
      selectedTramoKey !== 'ALL'
        ? tramoSummaries.find((t) => t.tramoKey === selectedTramoKey)
        : undefined,
    [tramoSummaries, selectedTramoKey]
  );

  // Resumen de Macheo por Equipo sobre las filas filtradas
  const machineSummaries: MachineMacheoSummary[] = useMemo(() => {
    const map = new Map<string, MachineMacheoSummary>();
    filteredRows.forEach((r) => {
      const label = r.parte.marcaModelo || r.parte.codigoEquipo || 'Sin equipo';
      const key = `${label}__${r.unit}`;
      const cur: MachineMacheoSummary = map.get(key) || {
        machineKey: key,
        label,
        unit: r.unit,
        partesCount: 0,
        totalHsPartesAll: 0,
        totalViajesAll: 0,
        partesConCruceCount: 0,
        hsPartesConCruce: 0,
        totalOdomWorked: 0,
        status: 'SIN_CRUCE'
      };

      cur.partesCount += 1;
      cur.totalHsPartesAll += r.hsDeclaradas;
      if (r.parte.tipo === 'VIAJES') {
        cur.totalViajesAll += Number(r.parte.viajesCantidad || r.parte.cantidad || 1);
      }

      if (r.odoWorked !== undefined) {
        cur.partesConCruceCount += 1;
        cur.hsPartesConCruce += r.hsDeclaradas;
        cur.totalOdomWorked += r.odoWorked;
      }
      if (r.odoIni !== undefined && r.odoIni > 0) {
        cur.odoMin = cur.odoMin !== undefined ? Math.min(cur.odoMin, r.odoIni) : r.odoIni;
      }
      if (r.odoFin !== undefined && r.odoFin > 0) {
        cur.odoMax = cur.odoMax !== undefined ? Math.max(cur.odoMax, r.odoFin) : r.odoFin;
      }

      map.set(key, cur);
    });

    return Array.from(map.values())
      .map((m) => {
        m.totalHsPartesAll = Number(m.totalHsPartesAll.toFixed(1));
        m.hsPartesConCruce = Number(m.hsPartesConCruce.toFixed(1));
        m.totalOdomWorked = Number(m.totalOdomWorked.toFixed(1));
        if (m.partesConCruceCount === 0) {
          m.status = 'SIN_CRUCE';
        } else if (m.unit === 'km') {
          m.status = 'KM_OK';
        } else {
          const diff = Number((m.totalOdomWorked - m.hsPartesConCruce).toFixed(1));
          m.diffHs = diff;
          const tol = Math.max(
            activeTolerance.minHsTramoCoincide,
            m.hsPartesConCruce * (activeTolerance.coincidePct / 100)
          );
          if (Math.abs(diff) <= tol) m.status = 'COINCIDE';
          else if (diff > 0) m.status = 'MAS_ODOM';
          else m.status = 'MENOS_ODOM';
        }
        return m;
      })
      .sort((a, b) => b.totalHsPartesAll - a.totalHsPartesAll);
  }, [filteredRows, activeTolerance]);

  // Totales globales del filtro
  const globalTotals = useMemo(() => {
    let hsPartesAll = 0;
    let hsPartesCruce = 0;
    let hsOdom = 0;
    let kmOdom = 0;
    let viajes = 0;

    filteredRows.forEach((r) => {
      hsPartesAll += r.hsDeclaradas;
      if (r.parte.tipo === 'VIAJES') {
        viajes += Number(r.parte.viajesCantidad || r.parte.cantidad || 1);
      }
      if (r.odoWorked !== undefined) {
        if (r.unit === 'hs') {
          hsPartesCruce += r.hsDeclaradas;
          hsOdom += r.odoWorked;
        } else {
          kmOdom += r.odoWorked;
        }
      }
    });

    const diffGlobalHs = Number((hsOdom - hsPartesCruce).toFixed(1));
    return {
      hsPartesAll: Number(hsPartesAll.toFixed(1)),
      hsPartesCruce: Number(hsPartesCruce.toFixed(1)),
      hsOdom: Number(hsOdom.toFixed(1)),
      kmOdom: Number(kmOdom.toFixed(1)),
      viajes,
      diffGlobalHs
    };
  }, [filteredRows]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Global Macheo KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
            Partes en Vista
          </span>
          <span className="text-xl font-mono font-bold text-white mt-1 block tabular-nums">
            {filteredRows.length}
          </span>
          <span className="text-[11px] text-slate-400">{globalTotals.viajes} viajes cargados</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
            Horas según Partes
          </span>
          <span className="text-xl font-mono font-bold text-amber-400 mt-1 block tabular-nums">
            {globalTotals.hsPartesAll.toFixed(1)} hs
          </span>
          <span className="text-[11px] text-slate-400">
            {globalTotals.hsPartesCruce.toFixed(1)} hs con cruce odóm.
          </span>
        </div>

        <div className="bg-slate-900/80 border border-emerald-500/25 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-emerald-300 font-bold block">
            Horas s/ Odómetro
          </span>
          <span className="text-xl font-mono font-bold text-emerald-400 mt-1 block tabular-nums">
            {globalTotals.hsOdom.toFixed(1)} hs
          </span>
          <span className="text-[11px] text-slate-400">En máquinas viales</span>
        </div>

        <div className="bg-slate-900/80 border border-sky-500/25 rounded-xl p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-sky-300 font-bold block">
            Kms s/ Odómetro
          </span>
          <span className="text-xl font-mono font-bold text-sky-400 mt-1 block tabular-nums">
            {globalTotals.kmOdom.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
          </span>
          <span className="text-[11px] text-slate-400">En camiones / transporte</span>
        </div>

        <div
          className={`rounded-xl p-3.5 border ${
            globalTotals.hsPartesCruce === 0
              ? 'bg-slate-900/80 border-slate-800'
              : Math.abs(globalTotals.diffGlobalHs) <=
                  Math.max(
                    activeTolerance.minHsTramoCoincide,
                    globalTotals.hsPartesCruce * (activeTolerance.coincidePct / 100)
                  )
                ? 'bg-emerald-500/10 border-emerald-500/35'
                : globalTotals.diffGlobalHs > 0
                  ? 'bg-amber-500/10 border-amber-500/35'
                  : 'bg-rose-500/10 border-rose-500/35'
          }`}
        >
          <span className="text-[11px] uppercase tracking-wider text-slate-300 font-bold block">
            Macheo Global (Hs)
          </span>
          {globalTotals.hsPartesCruce === 0 ? (
            <span className="text-sm font-mono font-bold text-slate-400 mt-2 block">
              Sin cruces aún
            </span>
          ) : (
            <>
              <span
                className={`text-xl font-mono font-black mt-1 block tabular-nums ${
                  Math.abs(globalTotals.diffGlobalHs) <=
                  Math.max(
                    activeTolerance.minHsTramoCoincide,
                    globalTotals.hsPartesCruce * (activeTolerance.coincidePct / 100)
                  )
                    ? 'text-emerald-300'
                    : globalTotals.diffGlobalHs > 0
                      ? 'text-amber-300'
                      : 'text-rose-300'
                }`}
              >
                {globalTotals.diffGlobalHs > 0 ? '+' : ''}
                {globalTotals.diffGlobalHs} hs
              </span>
              <span className="text-[11px] text-slate-300">
                {Math.abs(globalTotals.diffGlobalHs) <=
                Math.max(
                  activeTolerance.minHsTramoCoincide,
                  globalTotals.hsPartesCruce * (activeTolerance.coincidePct / 100)
                )
                  ? `✓ Coincide (≤ ±${activeTolerance.coincidePct}%)`
                  : globalTotals.diffGlobalHs > 0
                    ? 'Odómetro marcó más hs'
                    : 'Partes declararon más hs'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Macheo por Equipo */}
      {machineSummaries.length > 0 && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                <Gauge className="w-4 h-4" />
                Macheo por Máquina / Camión: Horas en Partes vs Horas / Kms de Odómetro
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                Coincide hasta ±{activeTolerance.coincidePct}% (mín. {activeTolerance.minHsTramoCoincide} hs tramo /{' '}
                {activeTolerance.minHsDirectoCoincide} hs directo) · Desvío leve {activeTolerance.coincidePct}%–
                {activeTolerance.desvioLevePct}% · Desfasaje &gt;{activeTolerance.desvioLevePct}%
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenTolerancePanel}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                showTolerancePanel
                  ? 'bg-amber-500 text-black border-amber-400'
                  : 'bg-slate-950 hover:bg-slate-800 text-amber-300 border-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Configurar Tolerancias (±{activeTolerance.coincidePct}% / {activeTolerance.desvioLevePct}%)</span>
            </button>
          </div>

          {toleranceFeedback && (
            <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{toleranceFeedback}</span>
              </div>
              <button
                type="button"
                onClick={() => setToleranceFeedback(null)}
                className="text-emerald-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {showTolerancePanel && (
            <form
              onSubmit={handleSaveTolerance}
              className="bg-slate-950/95 border border-amber-500/40 rounded-xl p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div>
                  <h5 className="text-xs font-bold text-white">
                    Reglas de coincidencia entre Partes y Odómetro
                  </h5>
                  <p className="text-[11px] text-slate-400">
                    Estos umbrales se guardan en Supabase y aplican a todos los dispositivos y obras.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraftTolerance(DEFAULT_MACHEO_TOLERANCE_CONFIG)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restaurar 15% / 35%</span>
                </button>
              </div>

              {toleranceError && (
                <div className="bg-rose-500/15 border border-rose-500/40 text-rose-200 rounded-lg px-3 py-2 text-xs">
                  {toleranceError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-300 mb-1">
                    COINCIDE: hasta ± (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={draftTolerance.coincidePct}
                    onChange={(e) =>
                      setDraftTolerance((prev) => ({
                        ...prev,
                        coincidePct: Number(e.target.value)
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono tabular-nums focus:outline-none focus:border-emerald-400"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Diferencia dentro de ±{draftTolerance.coincidePct || 0}% marca Coincide.
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                    DESVÍO LEVE: hasta ± (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="200"
                    value={draftTolerance.desvioLevePct}
                    onChange={(e) =>
                      setDraftTolerance((prev) => ({
                        ...prev,
                        desvioLevePct: Number(e.target.value)
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono tabular-nums focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Entre {draftTolerance.coincidePct || 0}% y {draftTolerance.desvioLevePct || 0}% es Desvío Leve · Más de {draftTolerance.desvioLevePct || 0}% es Desfasaje.
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200 mb-1">
                    Mínimo COINCIDE en tramo / equipo (hs)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={draftTolerance.minHsTramoCoincide}
                    onChange={(e) =>
                      setDraftTolerance((prev) => ({
                        ...prev,
                        minHsTramoCoincide: Number(e.target.value)
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono tabular-nums focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Piso mínimo en horas para tramos de combustible y resumen por equipo.
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200 mb-1">
                    Mínimo DESVÍO LEVE en tramo (hs)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="200"
                    value={draftTolerance.minHsTramoLeve}
                    onChange={(e) =>
                      setDraftTolerance((prev) => ({
                        ...prev,
                        minHsTramoLeve: Number(e.target.value)
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono tabular-nums focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Piso mínimo en horas antes de marcar Desfasaje en tramo.
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200 mb-1">
                    Mínimo COINCIDE odómetro directo (hs)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="50"
                    value={draftTolerance.minHsDirectoCoincide}
                    onChange={(e) =>
                      setDraftTolerance((prev) => ({
                        ...prev,
                        minHsDirectoCoincide: Number(e.target.value)
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono tabular-nums focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Piso mínimo cuando el parte trae lectura directa ini/fin.
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200 mb-1">
                    Mínimo DESVÍO LEVE odómetro directo (hs)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={draftTolerance.minHsDirectoLeve}
                    onChange={(e) =>
                      setDraftTolerance((prev) => ({
                        ...prev,
                        minHsDirectoLeve: Number(e.target.value)
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono tabular-nums focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Piso mínimo antes de marcar Desfasaje en lectura directa.
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <div className="flex flex-wrap items-center gap-3 text-[11px] tabular-nums">
                  <span className="text-emerald-300 font-semibold">
                    ✓ Coincide: hasta ±{draftTolerance.coincidePct || 0}% (mín. {draftTolerance.minHsTramoCoincide || 0}h / {draftTolerance.minHsDirectoCoincide || 0}h)
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-amber-300 font-semibold">
                    Desvío leve: {draftTolerance.coincidePct || 0}%–{draftTolerance.desvioLevePct || 0}%
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-rose-300 font-semibold">
                    Desfasaje: &gt;{draftTolerance.desvioLevePct || 0}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTolerancePanel(false);
                      setToleranceError(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTolerance}
                    className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {isSavingTolerance && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Guardar en Supabase</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {machineSummaries.map((m) => (
              <div
                key={m.machineKey}
                className="bg-slate-950/85 border border-slate-800 rounded-xl p-3 flex flex-col justify-between gap-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white font-bold truncate flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 tabular-nums">
                      {m.partesCount} parte(s)
                      {m.odoMin !== undefined && m.odoMax !== undefined
                        ? ` · Rango: ${m.odoMin.toLocaleString('es-AR', { maximumFractionDigits: 0 })} → ${m.odoMax.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ${m.unit}`
                        : ''}
                    </div>
                  </div>
                  {m.status === 'COINCIDE' ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-black shrink-0">
                      ✓ COINCIDE
                    </span>
                  ) : m.status === 'MAS_ODOM' ? (
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-black shrink-0">
                      +{m.diffHs} hs ODÓM.
                    </span>
                  ) : m.status === 'MENOS_ODOM' ? (
                    <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-black shrink-0">
                      {m.diffHs} hs ODÓM.
                    </span>
                  ) : m.status === 'KM_OK' ? (
                    <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-black shrink-0">
                      CAMIÓN (KM)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold shrink-0">
                      SIN CRUCE
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 font-mono text-[11px] tabular-nums">
                  <div>
                    <span className="text-[9px] uppercase text-slate-500 block">Partes</span>
                    <strong className="text-amber-300">
                      {m.totalHsPartesAll > 0
                        ? `${m.totalHsPartesAll} hs`
                        : `${m.totalViajesAll} vj`}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-slate-500 block">Odómetro</span>
                    <strong className={m.unit === 'km' ? 'text-sky-300' : 'text-emerald-300'}>
                      {m.partesConCruceCount > 0
                        ? `${m.totalOdomWorked.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${m.unit}`
                        : '—'}
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] uppercase text-slate-500 block">
                      {m.unit === 'km' ? 'Viajes' : 'Diferencia'}
                    </span>
                    <strong className="text-white">
                      {m.unit === 'km'
                        ? `${m.totalViajesAll} vj`
                        : m.diffHs !== undefined
                          ? `${m.diffHs > 0 ? '+' : ''}${m.diffHs} hs`
                          : '—'}
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar parte, equipo, operario, carga, orden, factura o período..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <select
          value={selectedEquipo}
          onChange={(e) => {
            setSelectedEquipo(e.target.value);
            setSelectedTramoKey('ALL');
          }}
          className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
        >
          <option value="ALL">Todos los equipos</option>
          {equipoOptions.map((eq) => (
            <option key={eq} value={eq}>
              {eq}
            </option>
          ))}
        </select>

        <select
          value={macheoFilter}
          onChange={(e) => setMacheoFilter(e.target.value as MacheoFilterType)}
          className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
        >
          <option value="ALL">Macheo: Todos</option>
          <option value="COINCIDE">✓ Coincide con Odómetro</option>
          <option value="MAS_ODOM">▲ Odómetro trabajó MÁS hs</option>
          <option value="MENOS_ODOM">▼ Partes declaran MÁS hs</option>
          <option value="CAMIONES_KM">🚛 Camiones (Kms)</option>
          <option value="SIN_CRUCE">Sin cruce de odómetro</option>
        </select>

        {periodos.length > 0 && (
          <div className="flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <select
              value={activePeriodoId}
              onChange={(e) => {
                setActivePeriodoId(e.target.value);
                setSelectedTramoKey('ALL');
              }}
              className={`bg-slate-950 rounded-xl px-2.5 py-2 text-xs font-semibold cursor-pointer border ${
                activePeriodoId !== 'ALL'
                  ? 'border-amber-500/60 text-amber-200'
                  : 'border-slate-700 text-slate-200'
              }`}
            >
              <option value="ALL">Contenedor: Toda la obra</option>
              {periodos.map((per) => (
                <option key={per.id} value={per.id}>
                  📦 {per.titulo}
                </option>
              ))}
            </select>
            {activePeriodoId !== 'ALL' && (
              <button
                type="button"
                onClick={() => {
                  setActivePeriodoId('ALL');
                  setSelectedTramoKey('ALL');
                }}
                title="Quitar filtro de contenedor"
                className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            title="Desde fecha"
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
          />
          <span className="text-slate-500">→</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            title="Hasta fecha"
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
          />
        </div>
      </div>

      {/* Cargas de Combustible / Tramos Analizados */}
      {tramoSummaries.length > 0 && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Fuel className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-300">
                  Cargas de Combustible / Tramos Analizados ({tramoSummaries.length})
                </h4>
                <p className="text-[11px] text-slate-400">
                  Hacé clic en una carga para aislar los partes diarios que abarca ese despacho de combustible.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedTramoKey !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedTramoKey('ALL')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 text-[11px] font-bold transition"
                >
                  <X className="w-3 h-3" />
                  Ver todos los tramos
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowTramosPanel((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition"
              >
                {showTramosPanel ? (
                  <>
                    Ocultar <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    Mostrar ({tramoSummaries.length}) <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>

          {activeTramo && !showTramosPanel && (
            <div className="text-[11px] font-mono text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5">
              Filtrando carga del {formatCrossDateDDMMYYYY(activeTramo.nextLoadDate)} ·{' '}
              {activeTramo.machineLabel} · Abarca {activeTramo.totalTramoPartesCount} parte(s)
            </div>
          )}

          {showTramosPanel && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
              {tramoSummaries.map((t) => {
                const isSelected = selectedTramoKey === t.tramoKey;
                const otherObraCount = Math.max(0, t.totalTramoPartesCount - t.obraPartesCount);
                const dateRangeLabel =
                  t.minParteDate && t.maxParteDate
                    ? t.minParteDate === t.maxParteDate
                      ? formatCrossDateDDMMYYYY(t.minParteDate)
                      : `${formatCrossDateDDMMYYYY(t.minParteDate)} al ${formatCrossDateDDMMYYYY(t.maxParteDate)}`
                    : '';

                return (
                  <button
                    key={t.tramoKey}
                    type="button"
                    onClick={() =>
                      setSelectedTramoKey((cur) => (cur === t.tramoKey ? 'ALL' : t.tramoKey))
                    }
                    className={`text-left rounded-xl p-2.5 border transition flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400/70 ring-1 ring-amber-400/40'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                        <Fuel className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        Carga {formatCrossDateDDMMYYYY(t.nextLoadDate)}
                        {t.tramoLitros !== undefined && t.tramoLitros > 0 && (
                          <span className="font-mono text-amber-300 tabular-nums">
                            · {t.tramoLitros.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L
                          </span>
                        )}
                      </span>

                      {t.unit === 'km' ? (
                        <span className="text-[10px] font-mono font-bold text-sky-300 shrink-0 tabular-nums">
                          {t.tramoDelta !== undefined ? `+${t.tramoDelta} km` : 'KM'}
                        </span>
                      ) : t.coincidencia === 'COINCIDE' ? (
                        <span className="text-[10px] font-bold text-emerald-300 shrink-0">
                          ✓ Coincide
                        </span>
                      ) : t.diferenciaHoras !== undefined ? (
                        <span
                          className={`text-[10px] font-mono font-bold shrink-0 tabular-nums ${
                            t.diferenciaHoras > 0 ? 'text-amber-300' : 'text-rose-300'
                          }`}
                        >
                          {t.diferenciaHoras > 0
                            ? `Odóm. +${t.diferenciaHoras}h`
                            : `Partes +${Math.abs(t.diferenciaHoras)}h`}
                        </span>
                      ) : null}
                    </div>

                    <div className="text-[11px] font-semibold text-cyan-200 tabular-nums">
                      Abarca {t.totalTramoPartesCount} parte
                      {t.totalTramoPartesCount === 1 ? '' : 's'}
                      {otherObraCount > 0
                        ? ` (${t.obraPartesCount} acá + ${otherObraCount} otra obra)`
                        : ''}
                      {dateRangeLabel ? (
                        <span className="text-slate-400 font-normal"> · {dateRangeLabel}</span>
                      ) : null}
                    </div>

                    <div className="text-[10px] font-mono text-slate-400 truncate tabular-nums">
                      {selectedEquipo === 'ALL' ? `${t.machineLabel} · ` : ''}
                      Lect.{' '}
                      {t.prevLoadReading !== undefined
                        ? t.prevLoadReading.toLocaleString('es-AR', { maximumFractionDigits: 1 })
                        : '—'}{' '}
                      →{' '}
                      {t.nextLoadReading !== undefined
                        ? t.nextLoadReading.toLocaleString('es-AR', { maximumFractionDigits: 1 })
                        : '—'}{' '}
                      {t.unit}
                      {t.unit === 'hs' &&
                      t.tramoDelta !== undefined &&
                      t.tramoHorasPartes !== undefined
                        ? ` · ${t.tramoDelta}h vs ${t.tramoHorasPartes.toFixed(1)}h`
                        : ''}
                    </div>

                    {(t.nextLoadVoucherRefs.length > 0 || t.nextLoadDeposito) && (
                      <div className="text-[10px] text-slate-500 truncate">
                        {[...t.nextLoadVoucherRefs, t.nextLoadDeposito].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Detailed Partes + Macheo Table */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
        {filteredRows.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-300 text-sm font-medium">
              No hay partes diarios que coincidan con el filtro aplicado.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/90 border-b border-slate-800 text-[10px] uppercase text-slate-400 font-bold">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">Nº Parte</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Fecha</th>
                  <th className="py-2.5 px-3">Equipo</th>
                  <th className="py-2.5 px-3">Operario</th>
                  <th className="py-2.5 px-3">Detalle / Trabajo</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">En Parte</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Según Odóm. / Horóm.</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Carga de Combustible</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Macheo Odóm. vs Parte</th>
                  <th className="py-2.5 px-3">Legajo / Período</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredRows.map((r) => {
                  const p = r.parte;
                  const fmtRead = (n: number) =>
                    `${r.isApprox ? '~' : ''}${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}`;
                  const fmtPlain = (n: number) =>
                    n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
                  const rowTramoKey = r.cross?.tramoKey;
                  const isRowTramoSelected = Boolean(
                    rowTramoKey && selectedTramoKey === rowTramoKey
                  );
                  const obraCountForTramo = rowTramoKey
                    ? tramoObraCounts.get(rowTramoKey) || 1
                    : 1;
                  const totalCountForTramo = rowTramoKey
                    ? Math.max(obraCountForTramo, r.cross?.tramoPartesCount || 0)
                    : 0;
                  const otherObraPartes = Math.max(0, totalCountForTramo - obraCountForTramo);

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-800/30 transition ${
                        isRowTramoSelected ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-400 whitespace-nowrap tabular-nums">
                        #{p.numParte}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap tabular-nums">
                        {formatCrossDateDDMMYYYY(r.dateKey) !== '-'
                          ? formatCrossDateDDMMYYYY(r.dateKey)
                          : p.fecha}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-white font-semibold">
                          {p.marcaModelo || p.codigoEquipo}
                        </div>
                        {p.codigoEquipo && p.marcaModelo && (
                          <div className="text-[10px] font-mono text-slate-500">
                            {p.codigoEquipo}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-200">{p.nombreApellido}</td>
                      <td className="py-2.5 px-3 max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            {p.tipo}
                          </span>
                          <span className="text-slate-300 truncate" title={p.detalleTipo || p.novedades || ''}>
                            {p.detalleTipo || p.tipoMaterial || p.novedades || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap tabular-nums">
                        {p.tipo === 'VIAJES' ? (
                          <div>
                            <span className="text-blue-400">{p.viajesCantidad || p.cantidad || 1} vj</span>
                            {r.hsDeclaradas > 0 && (
                              <span className="block text-[10px] text-amber-300">
                                {r.hsDeclaradas.toFixed(1)} hs
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-amber-300">{r.hsDeclaradas.toFixed(1)} hs</span>
                        )}
                      </td>

                      {/* Columna combinada Odómetro trabajado arriba + Ini/Fin pegado abajo */}
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap tabular-nums">
                        <div className="flex flex-col items-end leading-tight">
                          {r.odoWorked !== undefined ? (
                            <span
                              className={`font-black text-xs ${
                                r.unit === 'km'
                                  ? 'text-sky-300'
                                  : r.macheoStatus === 'COINCIDE'
                                    ? 'text-emerald-300'
                                    : r.macheoStatus === 'DESVIO_LEVE'
                                      ? 'text-amber-300'
                                      : r.macheoStatus === 'DESFASAJE'
                                        ? 'text-rose-300'
                                        : 'text-emerald-300'
                              }`}
                            >
                              {r.isApprox ? '~' : '+'}
                              {r.odoWorked.toLocaleString('es-AR', { maximumFractionDigits: 1 })}{' '}
                              {r.unit}
                            </span>
                          ) : r.source === 'PENDING' ? (
                            <span className="text-[10px] font-bold text-amber-300/80">
                              Pend. próx. carga
                            </span>
                          ) : r.source === 'PARTIAL' ? (
                            <span className="text-[10px] font-bold text-slate-300">
                              Lectura parcial
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}

                          {r.odoIni !== undefined && r.odoFin !== undefined ? (
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              Ini: <span className="text-slate-300">{fmtRead(r.odoIni)}</span> → Fin:{' '}
                              <span className="text-slate-200 font-semibold">{fmtRead(r.odoFin)}</span>{' '}
                              {r.unit}
                            </span>
                          ) : r.odoFin !== undefined ? (
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              Fin: <span className="text-slate-200 font-semibold">{fmtRead(r.odoFin)}</span>{' '}
                              {r.unit}
                            </span>
                          ) : r.odoIni !== undefined ? (
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              Últ: <span className="text-slate-300">{fmtRead(r.odoIni)}</span> {r.unit}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-600 mt-0.5">Sin odóm.</span>
                          )}
                        </div>
                      </td>

                      {/* Columna Carga de Combustible asociada y cantidad de partes que abarca */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {rowTramoKey && r.cross?.nextLoadDate ? (
                          <div className="space-y-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedTramoKey((cur) =>
                                  cur === rowTramoKey ? 'ALL' : rowTramoKey
                                )
                              }
                              title={
                                isRowTramoSelected
                                  ? 'Clic para quitar filtro de esta carga'
                                  : 'Clic para filtrar los partes de esta carga de combustible'
                              }
                              className={`inline-flex items-center gap-1.5 text-left font-mono text-[11px] font-bold transition tabular-nums ${
                                isRowTramoSelected
                                  ? 'text-amber-300 underline decoration-amber-400/60 underline-offset-2'
                                  : 'text-amber-200 hover:text-amber-300'
                              }`}
                            >
                              <Fuel className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>
                                Carga {formatCrossDateDDMMYYYY(r.cross.nextLoadDate)}
                                {r.cross.tramoLitros !== undefined && r.cross.tramoLitros > 0
                                  ? ` · ${fmtPlain(r.cross.tramoLitros)} L`
                                  : ''}
                              </span>
                              {r.cross.isFuelLoadDay && (
                                <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 font-sans">
                                  Día carga
                                </span>
                              )}
                            </button>

                            <div className="text-[10px] font-mono text-slate-300 tabular-nums">
                              Abarca{' '}
                              <span className="text-cyan-300 font-bold">
                                {totalCountForTramo} parte{totalCountForTramo === 1 ? '' : 's'}
                              </span>
                              {otherObraPartes > 0 && (
                                <span className="text-slate-400">
                                  {' '}
                                  ({obraCountForTramo} obra + {otherObraPartes} otra)
                                </span>
                              )}
                              {r.cross.prevLoadReading !== undefined &&
                              r.cross.nextLoadReading !== undefined ? (
                                <span className="text-slate-400">
                                  {' '}
                                  · {fmtPlain(r.cross.prevLoadReading)}→
                                  {fmtPlain(r.cross.nextLoadReading)} {r.unit}
                                </span>
                              ) : r.cross.nextLoadReading !== undefined ? (
                                <span className="text-slate-400">
                                  {' '}
                                  · Lect. {fmtPlain(r.cross.nextLoadReading)} {r.unit}
                                </span>
                              ) : null}
                            </div>

                            {((r.cross.nextLoadVoucherRefs &&
                              r.cross.nextLoadVoucherRefs.length > 0) ||
                              r.cross.nextLoadDeposito) && (
                              <div className="text-[10px] text-slate-500 max-w-[240px] truncate">
                                {[
                                  ...(r.cross.nextLoadVoucherRefs || []),
                                  r.cross.nextLoadDeposito
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            )}
                          </div>
                        ) : r.cross?.status === 'PENDING_NEXT_LOAD' ? (
                          <div className="space-y-0.5 font-mono">
                            <div className="text-[11px] font-semibold text-amber-300/80">
                              Desde carga {formatCrossDateDDMMYYYY(r.cross.prevLoadDate)}
                            </div>
                            <div className="text-[10px] text-slate-400 tabular-nums">
                              Esperando próx. carga
                              {r.cross.prevLoadReading !== undefined
                                ? ` · Base ${fmtPlain(r.cross.prevLoadReading)} ${r.unit}`
                                : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500">Sin carga vinculada</span>
                        )}
                      </td>

                      {/* Columna Macheo */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {r.unit === 'km' && r.odoWorked !== undefined ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-bold tabular-nums">
                              <Fuel className="w-3 h-3" />
                              +{r.odoWorked.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
                            </span>
                            {r.cross?.kmPorHora && (
                              <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                                Prom. tramo: {r.cross.kmPorHora} km/h
                              </div>
                            )}
                          </div>
                        ) : r.source === 'DIRECT' && r.diffHs !== undefined ? (
                          <div className="space-y-0.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border tabular-nums ${
                                r.macheoStatus === 'COINCIDE'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : r.macheoStatus === 'DESVIO_LEVE'
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              }`}
                            >
                              {r.macheoStatus === 'COINCIDE' ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <AlertTriangle className="w-3 h-3" />
                              )}
                              {r.macheoStatus === 'COINCIDE'
                                ? `Coincide (${r.diffHs > 0 ? '+' : ''}${r.diffHs}h)`
                                : `${r.macheoStatus === 'DESVIO_LEVE' ? 'Desvío leve' : 'Desfasaje'} (${r.diffHs > 0 ? '+' : ''}${r.diffHs}h)`}
                            </span>
                            <div className="text-[10px] text-slate-500">Lectura directa</div>
                          </div>
                        ) : r.source === 'FUEL_CROSS' ? (
                          <div className="space-y-0.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border tabular-nums ${
                                r.macheoStatus === 'COINCIDE'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : r.macheoStatus === 'DESVIO_LEVE'
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              }`}
                            >
                              {r.macheoStatus === 'COINCIDE' ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <AlertTriangle className="w-3 h-3" />
                              )}
                              {r.macheoStatus === 'COINCIDE'
                                ? 'Coincide tramo'
                                : `${r.macheoStatus === 'DESVIO_LEVE' ? 'Desvío leve' : 'Desfasaje'} · ${
                                    (r.tramoDiffHs ?? 0) > 0
                                      ? `Odóm. +${r.tramoDiffHs}h`
                                      : `Partes +${Math.abs(r.tramoDiffHs ?? 0)}h`
                                  }`}
                            </span>
                            {r.tramoDelta !== undefined && r.tramoHorasPartes !== undefined && (
                              <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                                Tramo: {r.tramoDelta}h odóm. vs {r.tramoHorasPartes.toFixed(1)}h partes
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            {r.source === 'PENDING' ? 'Falta cierre comb.' : 'Sin datos cruce'}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {r.attachedPeriodos.map((pt) => (
                            <span
                              key={pt}
                              className="text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded"
                            >
                              📁 {pt}
                            </span>
                          ))}
                          {r.attachedFacturas.map((af) => (
                            <span
                              key={af.id}
                              className="text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded"
                            >
                              {af.label}
                              {af.periodo ? ` (${af.periodo})` : ''}
                            </span>
                          ))}
                          {r.attachedPeriodos.length === 0 && r.attachedFacturas.length === 0 && (
                            <span className="text-[10px] text-slate-500">Sin asignar</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
