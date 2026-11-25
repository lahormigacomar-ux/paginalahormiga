import React, { useState, useEffect, useMemo } from 'react';
import { 
  ParteDiario, 
  ParteTipoTrabajo, 
  ParteAutorizadoStatus, 
  ParteViajeLinea,
  Vehicle, 
  Employee, 
  Obra,
  ObraDuracionCategoria,
  RentalContract,
  ArcaInvoice,
  DocumentBagItem,
  ClientRecord
} from '../types';
import { 
  X, 
  ClipboardList, 
  Check, 
  Truck, 
  Clock, 
  Wrench, 
  ChevronRight, 
  ChevronLeft, 
  Calendar, 
  Hash, 
  User, 
  Building2, 
  FileText, 
  Layers, 
  Package, 
  ArrowRightLeft, 
  ShieldCheck,
  Sparkles,
  DollarSign,
  Link2,
  Camera,
  FolderOpen,
  Trash2,
  AlertTriangle,
  Plus,
  Copy
} from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';
import { BolsaDocumentosPickerModal } from './common/BolsaDocumentosPickerModal';
import { resolveParteDiarioLinks, resolveRentalContractLinks, formatInvoiceLabel, formatInvoiceNumber, isExternalMigratedInvoice } from '../utils/crossLinks';
import { buildUnifiedObrasList, UnifiedObraItem } from '../utils/obraLegajoResolver';

interface ParteDiarioFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (parte: ParteDiario) => Promise<{ ok: boolean; error?: string } | void> | void;
  parteToEdit?: ParteDiario | null;
  aiPrefillDraft?: Partial<ParteDiario> | null;
  fleet: Vehicle[];
  employees: Employee[];
  obras: Obra[];
  partesDiarios?: ParteDiario[];
  clients?: ClientRecord[];
  rentals?: RentalContract[];
  invoices?: ArcaInvoice[];
  bolsaDocumentos?: DocumentBagItem[];
  onLinkBolsaDocument?: (docId: string, targetId: string, targetLabel: string) => void;
}

const MATERIAL_OPTIONS = [
  'Ripio Común',
  'Ripio Grillao',
  'Ripio Seleccionado',
  'Piedra Partida 6/20',
  'Piedra Bola / Canto Rodado',
  'Arena Fina',
  'Arena Gruesa',
  'Tosca / Suelo Seleccionado',
  'Tierra Negra / Abonada',
  'Ladrillo Hueco',
  'Ladrillones',
  'Adoquines',
  'Caños',
  'Escombro / Desmonte',
  'Cascote Picado',
  'Base Estabilizada',
  'Asfalto en Caliente',
  'Arcilla / Greda',
  'Otro'
];

const EXTRACCION_OPERACION_OPTIONS = [
  { value: 'Entrega de Material', label: 'Entrega de Material (a obra / cliente)' },
  { value: 'Retiro de Material', label: 'Retiro de Material (de obra / depósito)' },
  { value: 'Extracción', label: 'Extracción (de cantera / pozo)' },
  { value: 'Extracción y Entrega', label: 'Extracción y Entrega completa' },
  { value: 'Solo Flete / Traslado', label: 'Solo Flete / Traslado (equipo sin material)' },
];

const SERV_MANT_OPTIONS = [
  { value: 'ALQUILER', label: 'Alquiler de Maquinaria / Equipo', desc: 'Servicio en obra por tiempo o producción' },
  { value: 'TRASLADO DE MAQUINA', label: 'Traslado de Máquina', desc: 'Movilización en carretón o batea' },
  { value: 'MANTENIMIENTO', label: 'Mantenimiento / Taller', desc: 'Reparaciones, servis preventivo o auxilio' },
  { value: 'OTRO', label: 'Otro Servicio', desc: 'Servicio especial no tipificado' }
];

const calculateHoursFromTimes = (iniMan?: string, finMan?: string, iniTar?: string, finTar?: string): {
  manHours: number;
  tarHours: number;
  totalHours: number;
} => {
  const parseTimeToMinutes = (t?: string) => {
    if (!t) return 0;
    const parts = t.trim().split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  };

  let manMins = 0;
  let tarMins = 0;

  const im = parseTimeToMinutes(iniMan);
  const fm = parseTimeToMinutes(finMan);
  if (fm > im) manMins = fm - im;

  const it = parseTimeToMinutes(iniTar);
  const ft = parseTimeToMinutes(finTar);
  if (ft > it) tarMins = ft - it;

  const manHours = Number((manMins / 60).toFixed(2));
  const tarHours = Number((tarMins / 60).toFixed(2));
  const totalHours = Number(((manMins + tarMins) / 60).toFixed(2));

  return { manHours, tarHours, totalHours };
};

const EMPTY_RENTALS: RentalContract[] = [];
const EMPTY_INVOICES: ArcaInvoice[] = [];
const EMPTY_PARTES: ParteDiario[] = [];

interface ViajeLineaFormItem {
  id: string;
  tipoMaterial: string;
  tipoMaterialCustom: string;
  extraccionEntregas: string;
  viajesCantidad: number;
  m3PorViaje: number;
  valorViajeEquipo: number;
  valorMaterialAparte: number;
  observacion: string;
}

const normalizeOperacionViajeValue = (raw?: string): string => {
  const clean = (raw || '').trim();
  const matchedOp = EXTRACCION_OPERACION_OPTIONS.find(
    (o) => o.value.toLowerCase() === clean.toLowerCase()
  );
  if (matchedOp) return matchedOp.value;
  const lower = clean.toLowerCase();
  if (lower.includes('retiro')) return 'Retiro de Material';
  if (lower.includes('extrac') && lower.includes('entreg')) return 'Extracción y Entrega';
  if (lower.includes('extrac')) return 'Extracción';
  if (lower.includes('flete') || lower.includes('traslado')) return 'Solo Flete / Traslado';
  return clean || 'Entrega de Material';
};

const getTipoOperacionMaterialCode = (
  op: string
): ParteViajeLinea['tipoOperacionMaterial'] => {
  const lower = (op || '').toLowerCase();
  if (lower.includes('retiro')) return 'RETIRO_MATERIAL';
  if (lower.includes('extrac')) return 'EXTRACCION';
  if (lower.includes('flete')) return 'SOLO_FLETE';
  return 'ENTREGA_MATERIAL';
};

const resolveMaterialSelectState = (rawMaterial?: string): { tipoMaterial: string; tipoMaterialCustom: string } => {
  const tm = (rawMaterial || '').trim();
  if (!tm) return { tipoMaterial: 'Ripio Común', tipoMaterialCustom: '' };
  const exact = MATERIAL_OPTIONS.find((m) => m.toLowerCase() === tm.toLowerCase());
  if (exact && exact !== 'Otro') {
    return { tipoMaterial: exact, tipoMaterialCustom: '' };
  }
  const fuzzy = MATERIAL_OPTIONS.find(
    (m) => m !== 'Otro' && tm.toLowerCase().includes(m.toLowerCase())
  );
  if (fuzzy) {
    return { tipoMaterial: fuzzy, tipoMaterialCustom: '' };
  }
  return { tipoMaterial: 'Otro', tipoMaterialCustom: tm };
};

const createViajeLineaForm = (overrides?: Partial<ViajeLineaFormItem>): ViajeLineaFormItem => ({
  id: `v-${Math.random().toString(16).slice(2, 9)}`,
  tipoMaterial: 'Ripio Común',
  tipoMaterialCustom: '',
  extraccionEntregas: 'Entrega de Material',
  viajesCantidad: 1,
  m3PorViaje: 8,
  valorViajeEquipo: 0,
  valorMaterialAparte: 0,
  observacion: '',
  ...overrides,
});

export const ParteDiarioFormModal: React.FC<ParteDiarioFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  parteToEdit,
  aiPrefillDraft = null,
  fleet,
  employees,
  obras,
  partesDiarios = EMPTY_PARTES,
  clients = [],
  rentals = EMPTY_RENTALS,
  invoices = EMPTY_INVOICES,
  bolsaDocumentos = [],
  onLinkBolsaDocument,
}) => {
  const allSelectableObras = useMemo<UnifiedObraItem[]>(() => {
    const unified = buildUnifiedObrasList({
      obras,
      partesDiarios,
      rentals,
      arcaInvoices: invoices,
      clients,
    });
    return [...unified].sort((a, b) => {
      const rank = (o: UnifiedObraItem) =>
        !o.archivado && !o.esDetectadaDesdePartes ? 0 : !o.archivado ? 1 : 2;
      const rDiff = rank(a) - rank(b);
      if (rDiff !== 0) return rDiff;
      return (a.nombreObra || '').localeCompare(b.nombreObra || '', 'es');
    });
  }, [obras, partesDiarios, rentals, invoices, clients]);

  // Step indicator: 1 = Fecha, Comprobante, Equipo y Empleado | 2 = Horarios y Odómetro | 3 = SERV_MANT, Obra, Modalidad, Encargado y Novedades
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Paso 1: Datos Principales
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [numParte, setNumParte] = useState<string>('');
  const [autorizado, setAutorizado] = useState<ParteAutorizadoStatus>('NO CONTROLADO');
  const [codigoEquipo, setCodigoEquipo] = useState<string>('');
  const [marcaModelo, setMarcaModelo] = useState<string>('');
  const [equipoInputMode, setEquipoInputMode] = useState<'FLOTA' | 'EVENTUAL'>('FLOTA');
  const [codigoEmpleado, setCodigoEmpleado] = useState<string>('');
  const [nombreApellido, setNombreApellido] = useState<string>('');
  const [empleadoInputMode, setEmpleadoInputMode] = useState<'NOMINA' | 'EVENTUAL'>('NOMINA');

  // Paso 2: Horarios
  const [horaInicioMañana, setHoraInicioMañana] = useState<string>('08:00');
  const [horaFinMañana, setHoraFinMañana] = useState<string>('12:00');
  const [horaInicioTarde, setHoraInicioTarde] = useState<string>('13:00');
  const [horaFinTarde, setHoraFinTarde] = useState<string>('17:00');
  const [sinHorasMaquina, setSinHorasMaquina] = useState<boolean>(false);
  const [odomKilom, setOdomKilom] = useState<number>(10000);

  // Paso 3: SERV_MANT, Obra, Tipo y Cierre
  const [servMant, setServMant] = useState<string>('ALQUILER');
  const [servMantCustom, setServMantCustom] = useState<string>('');
  const [obra, setObra] = useState<string>('');
  const [codigoObra, setCodigoObra] = useState<string>('');
  const [ubicacion, setUbicacion] = useState<string>('');
  const [obraInputMode, setObraInputMode] = useState<'REGISTRADA' | 'ESPORADICA'>('REGISTRADA');
  const [categoriaObra, setCategoriaObra] = useState<ObraDuracionCategoria>('LARGA');
  const [clienteId, setClienteId] = useState<string>('');
  const [clienteNombre, setClienteNombre] = useState<string>('');
  const [clienteCuit, setClienteCuit] = useState<string>('');

  // Modalidad (Tipo de trabajo)
  const [tipo, setTipo] = useState<ParteTipoTrabajo>('HORAS');

  // Si es por Hora / Por Trabajo:
  const [detalleTipo, setDetalleTipo] = useState<string>('EXCAVACIÓN Y NIVELACIÓN');
  const [hsCantidadCustom, setHsCantidadCustom] = useState<string>('');

  // Si es por Viajes / Fletes (múltiples líneas en un mismo parte):
  const [viajeLines, setViajeLines] = useState<ViajeLineaFormItem[]>(() => [createViajeLineaForm()]);
  const [separarCobranzaMaterial, setSepararCobranzaMaterial] = useState<boolean>(true);

  // Si es por Día:
  const [cantidadDias, setCantidadDias] = useState<number>(1);
  const [detalleDia, setDetalleDia] = useState<string>('Jornada completa de servicio en obra');

  // Si es Otro:
  const [detalleOtro, setDetalleOtro] = useState<string>('');
  const [cantidadOtro, setCantidadOtro] = useState<number>(1);

  // Cierre & Vínculos Comerciales (Contrato de Alquiler / Factura ARCA)
  const [encargadoObra, setEncargadoObra] = useState<string>('');
  const [firma, setFirma] = useState<string>('Firmado');
  const [novedades, setNovedades] = useState<string>('Sin novedades');
  const [rentalId, setRentalId] = useState<string>('');
  const [facturaId, setFacturaId] = useState<string>('');
  const [fotoUrl, setFotoUrl] = useState<string>('');
  const [selectedBagDocId, setSelectedBagDocId] = useState<string | null>(null);
  const [isDocsPickerOpen, setIsDocsPickerOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [allowDuplicateConfirm, setAllowDuplicateConfirm] = useState<boolean>(false);
  const [duplicateSubmitBlocked, setDuplicateSubmitBlocked] = useState<boolean>(false);

  const duplicatePartes = useMemo(() => {
    const raw = numParte.trim().toUpperCase();
    if (!raw) return [];
    const norm = /^\d+$/.test(raw) ? String(Number(raw)) : raw;
    return partesDiarios
      .filter((p) => {
        if (parteToEdit && p.id === parteToEdit.id) return false;
        const pRaw = (p.numParte || '').trim().toUpperCase();
        if (!pRaw) return false;
        const pNorm = /^\d+$/.test(pRaw) ? String(Number(pRaw)) : pRaw;
        return pRaw === raw || pNorm === norm;
      })
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [numParte, partesDiarios, parteToEdit]);

  // Calculated hours (respetando 0 hs para viajes/fletes sin horómetro de jornada)
  const timeCalc = calculateHoursFromTimes(horaInicioMañana, horaFinMañana, horaInicioTarde, horaFinTarde);
  const horasTrabajadas = sinHorasMaquina ? 0 : timeCalc.totalHours;

  // Totales consolidados de todas las líneas de viajes
  const viajeTotals = useMemo(() => {
    return viajeLines.reduce(
      (acc, l) => {
        const cant = Math.max(0, Number(l.viajesCantidad) || 0);
        const m3 = Math.max(0, Number(l.m3PorViaje) || 0);
        const lineM3 = Number((cant * m3).toFixed(2));
        acc.totalViajes += cant;
        acc.totalM3 = Number((acc.totalM3 + lineM3).toFixed(2));
        acc.totalValorEquipo += Math.max(0, Number(l.valorViajeEquipo) || 0);
        acc.totalValorMaterialAparte += Math.max(0, Number(l.valorMaterialAparte) || 0);
        return acc;
      },
      { totalViajes: 0, totalM3: 0, totalValorEquipo: 0, totalValorMaterialAparte: 0 }
    );
  }, [viajeLines]);
  const totalM3 = viajeTotals.totalM3;

  // Helper to normalize firma state
  const normalizeFirma = (f?: string) => {
    if (!f) return 'Firmado';
    const lower = f.toLowerCase().trim();
    if (lower === 'no firmado' || lower === 'no' || lower === 'sin firma' || lower.includes('no firmado') || lower.includes('pendiente')) {
      return 'No firmado';
    }
    return 'Firmado';
  };

  // Initialization
  useEffect(() => {
    if (!isOpen) return;
    setAllowDuplicateConfirm(false);
    setDuplicateSubmitBlocked(false);
    setSaveError(null);
    if (parteToEdit) {
      setActiveStep(1);
      setFecha(parteToEdit.fecha || new Date().toISOString().split('T')[0]);
      setNumParte(parteToEdit.numParte || '');
      setAutorizado(parteToEdit.autorizado || 'NO CONTROLADO');
      const isEqEventualEdit = Boolean(parteToEdit.esEquipoEventual || parteToEdit.codigoEquipo === 'EVENTUAL');
      setEquipoInputMode(isEqEventualEdit ? 'EVENTUAL' : 'FLOTA');
      setCodigoEquipo(isEqEventualEdit ? 'EVENTUAL' : (parteToEdit.codigoEquipo || ''));
      setMarcaModelo(parteToEdit.marcaModelo || parteToEdit.vehicleName || '');

      const isEmpEventualEdit = Boolean(
        parteToEdit.esEmpleadoEventual ||
        parteToEdit.codigoEmpleado === 'A_PRUEBA' ||
        parteToEdit.codigoEmpleado === 'EVENTUAL'
      );
      setEmpleadoInputMode(isEmpEventualEdit ? 'EVENTUAL' : 'NOMINA');
      setCodigoEmpleado(isEmpEventualEdit ? 'A_PRUEBA' : (parteToEdit.codigoEmpleado || ''));
      setNombreApellido(parteToEdit.nombreApellido || parteToEdit.driverName || '');

      const hasAnyTime = Boolean(
        parteToEdit.horaInicioMañana ||
        parteToEdit.horaFinMañana ||
        parteToEdit.horaInicioTarde ||
        parteToEdit.horaFinTarde
      );
      const isZeroHours = Number(parteToEdit.horasTrabajadas ?? parteToEdit.hsCantidad ?? 0) === 0;
      const shouldSinHoras = isZeroHours && (!hasAnyTime || parteToEdit.tipo === 'VIAJES');
      setSinHorasMaquina(shouldSinHoras);

      setHoraInicioMañana(parteToEdit.horaInicioMañana || (shouldSinHoras ? '' : '08:00'));
      setHoraFinMañana(parteToEdit.horaFinMañana || (shouldSinHoras ? '' : '12:00'));
      setHoraInicioTarde(parteToEdit.horaInicioTarde || (shouldSinHoras ? '' : '13:00'));
      setHoraFinTarde(parteToEdit.horaFinTarde || (shouldSinHoras ? '' : '17:00'));
      setOdomKilom(parteToEdit.odomKilom ?? 0);

      const sm = parteToEdit.servMant || 'ALQUILER';
      const isPredefinedSM = SERV_MANT_OPTIONS.some(o => o.value === sm);
      if (isPredefinedSM) {
        setServMant(sm);
        setServMantCustom('');
      } else {
        setServMant('OTRO');
        setServMantCustom(sm);
      }

      const matchedEditObra = allSelectableObras.find(
        o =>
          o.nombreObra.toLowerCase().trim() === (parteToEdit.obra || '').toLowerCase().trim() ||
          (!o.esDetectadaDesdePartes && parteToEdit.codigoObra && o.numero?.toLowerCase().trim() === parteToEdit.codigoObra.toLowerCase().trim())
      );
      const isEspEdit = Boolean(
        parteToEdit.esObraEsporadica ||
        parteToEdit.codigoObra === 'ESPORADICA' ||
        parteToEdit.categoriaObra === 'ESPORADICA' ||
        (!matchedEditObra && Boolean(parteToEdit.obra?.trim()))
      );
      setObraInputMode(isEspEdit ? 'ESPORADICA' : 'REGISTRADA');
      setCategoriaObra(
        parteToEdit.categoriaObra ||
        matchedEditObra?.categoriaDuracion ||
        (isEspEdit ? 'ESPORADICA' : 'LARGA')
      );
      setObra(parteToEdit.obra || (obras[0]?.nombreObra || 'AYALA EL MOLLAR'));
      setCodigoObra(isEspEdit ? 'ESPORADICA' : (parteToEdit.codigoObra || matchedEditObra?.numero || (obras[0]?.numero || 'OBRA-01')));
      setUbicacion(parteToEdit.ubicacion || matchedEditObra?.ubicacion || (obras[0]?.ubicacion || 'En obra'));
      setClienteId(parteToEdit.clienteId || matchedEditObra?.clienteId || '');
      setClienteNombre(parteToEdit.clienteNombre || matchedEditObra?.clienteNombre || (!isEspEdit ? (matchedEditObra?.pertenece || '') : ''));
      setClienteCuit(parteToEdit.clienteCuit || matchedEditObra?.clienteCuit || '');

      setTipo(parteToEdit.tipo || 'HORAS');
      setDetalleTipo(parteToEdit.detalleTipo || 'EXCAVACIÓN Y NIVELACIÓN');
      setHsCantidadCustom(
        parteToEdit.hsCantidad !== undefined && parteToEdit.hsCantidad !== null
          ? String(parteToEdit.hsCantidad)
          : ''
      );

      if (Array.isArray(parteToEdit.viajesDetalle) && parteToEdit.viajesDetalle.length > 0) {
        setViajeLines(
          parteToEdit.viajesDetalle.map((line, idx) => {
            const matState = resolveMaterialSelectState(line.tipoMaterial);
            return createViajeLineaForm({
              id: line.id || `v-${idx}-${Math.random().toString(16).slice(2, 6)}`,
              tipoMaterial: matState.tipoMaterial,
              tipoMaterialCustom: matState.tipoMaterialCustom,
              extraccionEntregas: normalizeOperacionViajeValue(line.extraccionEntregas),
              viajesCantidad: Number(line.viajesCantidad ?? 1),
              m3PorViaje: Number(line.m3PorViaje ?? 0),
              valorViajeEquipo: Number(line.valorViajeEquipo ?? 0),
              valorMaterialAparte: Number(line.valorMaterialAparte ?? 0),
              observacion: line.observacion || '',
            });
          })
        );
      } else {
        const matState = resolveMaterialSelectState(parteToEdit.tipoMaterial || 'Ripio Común');
        setViajeLines([
          createViajeLineaForm({
            tipoMaterial: matState.tipoMaterial,
            tipoMaterialCustom: matState.tipoMaterialCustom,
            extraccionEntregas: normalizeOperacionViajeValue(parteToEdit.extraccionEntregas),
            viajesCantidad: Number(parteToEdit.viajesCantidad ?? 1),
            m3PorViaje: Number(parteToEdit.m3PorViaje ?? 8),
            valorViajeEquipo: Number(parteToEdit.valorViajeEquipo ?? 0),
            valorMaterialAparte: Number(parteToEdit.valorMaterialAparte ?? 0),
          }),
        ]);
      }
      setSepararCobranzaMaterial(
        parteToEdit.separarCobranzaMaterial ?? (parteToEdit.tipo === 'VIAJES')
      );

      setCantidadDias(parteToEdit.cantidadDias || 1);
      setDetalleDia(
        parteToEdit.tipo === 'DIA' && parteToEdit.detalleTipo
          ? parteToEdit.detalleTipo
          : 'Jornada completa de servicio en obra'
      );
      setDetalleOtro(parteToEdit.detalleOtro || '');
      setCantidadOtro(parteToEdit.cantidadOtro || 1);

      setEncargadoObra(parteToEdit.encargadoObra || '');
      setFirma(normalizeFirma(parteToEdit.firma));
      setNovedades(parteToEdit.novedades || 'Sin novedades');
      const resolved = resolveParteDiarioLinks(parteToEdit, rentals, invoices);
      setRentalId(parteToEdit.rentalId || resolved.linkedRental?.id || '');
      setFacturaId(parteToEdit.facturaId || resolved.linkedInvoice?.id || '');
      setFotoUrl(parteToEdit.fotoUrl || '');
      setSelectedBagDocId(null);
    } else if (aiPrefillDraft) {
      setActiveStep(1);
      setFecha(aiPrefillDraft.fecha || new Date().toISOString().split('T')[0]);
      setNumParte(aiPrefillDraft.numParte || String(Math.floor(2600 + Math.random() * 200)));
      setAutorizado(aiPrefillDraft.autorizado || 'NO CONTROLADO');

      const draftEqCode = (aiPrefillDraft.codigoEquipo || '').trim().toLowerCase();
      const draftEqModel = (aiPrefillDraft.marcaModelo || '').trim().toLowerCase();
      const matchedVeh = fleet.find(v => {
        const c = (v.codigo || v.codigoInterno || v.id || '').toLowerCase();
        const m = (v.modeloMarca || '').toLowerCase();
        const p = (v.patente || '').toLowerCase();
        if (draftEqCode && (c === draftEqCode || p === draftEqCode || v.id.toLowerCase() === draftEqCode)) return true;
        if (draftEqModel && (m === draftEqModel || m.includes(draftEqModel) || draftEqModel.includes(m) || (p && draftEqModel.includes(p)))) return true;
        return false;
      });
      if (matchedVeh) {
        setEquipoInputMode('FLOTA');
        setCodigoEquipo(matchedVeh.codigo || matchedVeh.codigoInterno || matchedVeh.id || 'EQ-01');
        setMarcaModelo(matchedVeh.modeloMarca || aiPrefillDraft.marcaModelo || 'MAQUINARIA');
        setOdomKilom(
          aiPrefillDraft.odomKilom && Number(aiPrefillDraft.odomKilom) > 0
            ? Number(aiPrefillDraft.odomKilom)
            : Number(matchedVeh.horometro || 0)
        );
      } else if (aiPrefillDraft.marcaModelo && aiPrefillDraft.marcaModelo.trim()) {
        setEquipoInputMode('EVENTUAL');
        setCodigoEquipo('EVENTUAL');
        setMarcaModelo(aiPrefillDraft.marcaModelo.trim().toUpperCase());
        setOdomKilom(Number(aiPrefillDraft.odomKilom || 0));
      } else {
        setEquipoInputMode('FLOTA');
        setCodigoEquipo(aiPrefillDraft.codigoEquipo || fleet[0]?.codigo || 'EQ-01');
        setMarcaModelo(aiPrefillDraft.marcaModelo || fleet[0]?.modeloMarca || 'MAQUINARIA');
        setOdomKilom(Number(aiPrefillDraft.odomKilom || 0));
      }

      const draftEmpCode = (aiPrefillDraft.codigoEmpleado || '').trim().toLowerCase();
      const draftEmpName = (aiPrefillDraft.nombreApellido || '').trim().toLowerCase();
      const matchedEmp = employees.find(e => {
        const c = (e.codigoEmpleado || e.legajo || '').toLowerCase();
        const n = (e.nombreApellido || '').toLowerCase();
        if (draftEmpCode && c === draftEmpCode) return true;
        if (draftEmpName && (n === draftEmpName || n.includes(draftEmpName) || draftEmpName.includes(n))) return true;
        return false;
      });
      if (matchedEmp) {
        setEmpleadoInputMode('NOMINA');
        setCodigoEmpleado(matchedEmp.codigoEmpleado || matchedEmp.legajo || 'EMP-101');
        setNombreApellido(matchedEmp.nombreApellido || 'OPERARIO');
      } else if (aiPrefillDraft.nombreApellido && aiPrefillDraft.nombreApellido.trim()) {
        setEmpleadoInputMode('EVENTUAL');
        setCodigoEmpleado('A_PRUEBA');
        setNombreApellido(aiPrefillDraft.nombreApellido.trim().toUpperCase());
      } else {
        setEmpleadoInputMode('NOMINA');
        setCodigoEmpleado(aiPrefillDraft.codigoEmpleado || employees[0]?.codigoEmpleado || 'EMP-101');
        setNombreApellido(aiPrefillDraft.nombreApellido || employees[0]?.nombreApellido || 'OPERARIO');
      }

      const hasTimes = Boolean(
        aiPrefillDraft.horaInicioMañana ||
        aiPrefillDraft.horaFinMañana ||
        aiPrefillDraft.horaInicioTarde ||
        aiPrefillDraft.horaFinTarde
      );
      const isViajesNoHours = aiPrefillDraft.tipo === 'VIAJES' && !hasTimes;
      setSinHorasMaquina(isViajesNoHours);
      setHoraInicioMañana(aiPrefillDraft.horaInicioMañana || (isViajesNoHours ? '' : '08:00'));
      setHoraFinMañana(aiPrefillDraft.horaFinMañana || (isViajesNoHours ? '' : '12:00'));
      setHoraInicioTarde(aiPrefillDraft.horaInicioTarde || (isViajesNoHours ? '' : '13:00'));
      setHoraFinTarde(aiPrefillDraft.horaFinTarde || (isViajesNoHours ? '' : '17:00'));

      const sm = (aiPrefillDraft.servMant || 'ALQUILER').toUpperCase();
      if (SERV_MANT_OPTIONS.some(o => o.value === sm)) {
        setServMant(sm);
        setServMantCustom('');
      } else {
        setServMant('OTRO');
        setServMantCustom(aiPrefillDraft.servMant || '');
      }

      const draftObraCode = (aiPrefillDraft.codigoObra || '').trim().toLowerCase();
      const draftObraName = (aiPrefillDraft.obra || '').trim().toLowerCase();
      const matchedObra = allSelectableObras.find(o => {
        const c = (o.numero || '').toLowerCase();
        const n = (o.nombreObra || '').toLowerCase();
        if (draftObraCode && !o.esDetectadaDesdePartes && c === draftObraCode) return true;
        if (draftObraName && (n === draftObraName || n.includes(draftObraName) || draftObraName.includes(n))) return true;
        return false;
      });
      if (matchedObra) {
        setObraInputMode('REGISTRADA');
        setObra(matchedObra.nombreObra);
        setCodigoObra(matchedObra.numero || 'OBRA-01');
        setUbicacion(aiPrefillDraft.ubicacion || matchedObra.ubicacion || 'En obra');
        setCategoriaObra(matchedObra.categoriaDuracion || 'LARGA');
        setClienteId(matchedObra.clienteId || '');
        setClienteNombre(matchedObra.clienteNombre || matchedObra.pertenece || '');
        setClienteCuit(matchedObra.clienteCuit || '');
      } else if (aiPrefillDraft.obra && aiPrefillDraft.obra.trim()) {
        setObraInputMode('ESPORADICA');
        setObra(aiPrefillDraft.obra.trim());
        setCodigoObra('ESPORADICA');
        setUbicacion(aiPrefillDraft.ubicacion || 'En obra / Trabajo rápido');
        setCategoriaObra('ESPORADICA');
        setClienteId(aiPrefillDraft.clienteId || '');
        setClienteNombre(aiPrefillDraft.clienteNombre || '');
        setClienteCuit(aiPrefillDraft.clienteCuit || '');
      } else {
        setObraInputMode('REGISTRADA');
        setObra(obras[0]?.nombreObra || 'OBRA GENERAL');
        setCodigoObra(aiPrefillDraft.codigoObra || obras[0]?.numero || 'OBRA-01');
        setUbicacion(aiPrefillDraft.ubicacion || obras[0]?.ubicacion || 'Sector Principal');
        setCategoriaObra(obras[0]?.categoriaDuracion || 'LARGA');
        setClienteId(obras[0]?.clienteId || '');
        setClienteNombre(obras[0]?.clienteNombre || obras[0]?.pertenece || '');
        setClienteCuit(obras[0]?.clienteCuit || '');
      }

      const draftTipo: ParteTipoTrabajo =
        aiPrefillDraft.tipo === 'VIAJES' || aiPrefillDraft.tipo === 'DIA' || aiPrefillDraft.tipo === 'TRABAJO' || aiPrefillDraft.tipo === 'OTRO'
          ? aiPrefillDraft.tipo
          : 'HORAS';
      setTipo(draftTipo);
      setDetalleTipo(aiPrefillDraft.detalleTipo || 'EXCAVACIÓN Y NIVELACIÓN');
      setHsCantidadCustom(
        aiPrefillDraft.hsCantidad !== undefined && Number(aiPrefillDraft.hsCantidad) > 0
          ? String(aiPrefillDraft.hsCantidad)
          : ''
      );

      if (Array.isArray(aiPrefillDraft.viajesDetalle) && aiPrefillDraft.viajesDetalle.length > 0) {
        setViajeLines(
          aiPrefillDraft.viajesDetalle.map((line, idx) => {
            const matState = resolveMaterialSelectState(line.tipoMaterial);
            return createViajeLineaForm({
              id: line.id || `v-ai-${idx}`,
              tipoMaterial: matState.tipoMaterial,
              tipoMaterialCustom: matState.tipoMaterialCustom,
              extraccionEntregas: normalizeOperacionViajeValue(line.extraccionEntregas),
              viajesCantidad: Number(line.viajesCantidad || 1),
              m3PorViaje: Number(line.m3PorViaje || 8),
              valorViajeEquipo: Number(line.valorViajeEquipo || 0),
              valorMaterialAparte: Number(line.valorMaterialAparte || 0),
              observacion: line.observacion || '',
            });
          })
        );
      } else {
        const matState = resolveMaterialSelectState(aiPrefillDraft.tipoMaterial || 'Ripio Común');
        setViajeLines([
          createViajeLineaForm({
            tipoMaterial: matState.tipoMaterial,
            tipoMaterialCustom: matState.tipoMaterialCustom,
            extraccionEntregas: normalizeOperacionViajeValue(aiPrefillDraft.extraccionEntregas),
            viajesCantidad: Number(aiPrefillDraft.viajesCantidad || 1),
            m3PorViaje: Number(aiPrefillDraft.m3PorViaje || 8),
            valorViajeEquipo: Number(aiPrefillDraft.valorViajeEquipo || 0),
            valorMaterialAparte: Number(aiPrefillDraft.valorMaterialAparte || 0),
          }),
        ]);
      }
      setSepararCobranzaMaterial(draftTipo === 'VIAJES');

      setCantidadDias(Number(aiPrefillDraft.cantidadDias || 1));
      setDetalleDia(draftTipo === 'DIA' && aiPrefillDraft.detalleTipo ? aiPrefillDraft.detalleTipo : 'Jornada completa de servicio en obra');
      setDetalleOtro(draftTipo === 'OTRO' ? (aiPrefillDraft.detalleTipo || '') : '');
      setCantidadOtro(1);

      setEncargadoObra(aiPrefillDraft.encargadoObra || '');
      setFirma(normalizeFirma(aiPrefillDraft.firma));
      setNovedades(aiPrefillDraft.novedades || 'Sin novedades');
      setRentalId('');
      setFacturaId('');
      setFotoUrl(aiPrefillDraft.fotoUrl || '');
      setSelectedBagDocId(null);
    } else {
      setActiveStep(1);
      setFecha(new Date().toISOString().split('T')[0]);
      setNumParte(String(Math.floor(2600 + Math.random() * 200)));
      setAutorizado('NO CONTROLADO');

      const initialVehicle = fleet[0];
      setEquipoInputMode('FLOTA');
      if (initialVehicle) {
        setCodigoEquipo(initialVehicle.codigo || initialVehicle.id || 'EQ-01');
        setMarcaModelo(initialVehicle.modeloMarca || 'MAQUINARIA');
        if (initialVehicle.horometro) {
          setOdomKilom(initialVehicle.horometro);
        } else {
          setOdomKilom(12000);
        }
      } else {
        setCodigoEquipo('EQ-01');
        setMarcaModelo('EXCAVADORA KOBELCO 2017');
        setOdomKilom(12000);
      }

      const initialEmp = employees[0];
      setEmpleadoInputMode('NOMINA');
      if (initialEmp) {
        setCodigoEmpleado(initialEmp.codigoEmpleado || initialEmp.legajo || 'EMP-101');
        setNombreApellido(initialEmp.nombreApellido || 'OPERARIO');
      } else {
        setCodigoEmpleado('EMP-101');
        setNombreApellido('GARCIA LUIS');
      }

      setSinHorasMaquina(false);
      setHoraInicioMañana('08:00');
      setHoraFinMañana('12:00');
      setHoraInicioTarde('13:00');
      setHoraFinTarde('17:00');

      setServMant('ALQUILER');
      setServMantCustom('');

      setObraInputMode('REGISTRADA');
      const initialObra = obras[0];
      if (initialObra) {
        setObra(initialObra.nombreObra);
        setCodigoObra(initialObra.numero || 'OBRA-01');
        setUbicacion(initialObra.ubicacion || 'Frente de obra');
        setCategoriaObra(initialObra.categoriaDuracion || 'LARGA');
        setClienteId(initialObra.clienteId || '');
        setClienteNombre(initialObra.clienteNombre || initialObra.pertenece || '');
        setClienteCuit(initialObra.clienteCuit || '');
      } else {
        setObra('AYALA EL MOLLAR');
        setCodigoObra('OBRA-01');
        setUbicacion('Sector Principal');
        setCategoriaObra('LARGA');
        setClienteId('');
        setClienteNombre('');
        setClienteCuit('');
      }

      setTipo('HORAS');
      setDetalleTipo('EXCAVACIÓN Y NIVELACIÓN');
      setHsCantidadCustom('');

      setViajeLines([createViajeLineaForm()]);
      setSepararCobranzaMaterial(true);

      setCantidadDias(1);
      setDetalleDia('Jornada completa de servicio en obra');

      setDetalleOtro('');
      setCantidadOtro(1);

      setEncargadoObra('Ing. Supervisor de Obra');
      setFirma('Firmado');
      setNovedades('Sin novedades operativas');
      setRentalId('');
      setFacturaId('');
      setFotoUrl('');
      setSelectedBagDocId(null);
    }
  }, [parteToEdit, aiPrefillDraft, isOpen]);

  if (!isOpen) return null;

  // Step 1 Validation
  const canProceedStep1 = Boolean(
    fecha.trim() && 
    numParte.trim() && 
    marcaModelo.trim() && 
    nombreApellido.trim()
  );

  // Final Submission - Guaranteed only executable on Step 3
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Strict guard: if the user hasn't reached step 3, simply navigate forward
    if (activeStep !== 3) {
      setActiveStep((prev) => (prev === 1 ? 2 : 3));
      return;
    }

    if (duplicatePartes.length > 0 && !allowDuplicateConfirm) {
      setDuplicateSubmitBlocked(true);
      return;
    }

    const finalServMant = servMant === 'OTRO' && servMantCustom.trim() ? servMantCustom.trim() : servMant;
    const finalHsCantidad = hsCantidadCustom !== '' ? (parseFloat(hsCantidadCustom) || 0) : horasTrabajadas;

    const normalizedViajeLines: ParteViajeLinea[] = viajeLines.map((l) => {
      const matFinal = l.tipoMaterial === 'Otro' && l.tipoMaterialCustom.trim()
        ? l.tipoMaterialCustom.trim()
        : l.tipoMaterial;
      const cant = Math.max(1, Number(l.viajesCantidad) || 1);
      const m3 = Math.max(0, Number(l.m3PorViaje) || 0);
      const lineTotalM3 = Number((cant * m3).toFixed(2));
      const opFinal = l.extraccionEntregas || 'Entrega de Material';
      return {
        id: l.id,
        tipoMaterial: matFinal,
        extraccionEntregas: opFinal,
        tipoOperacionMaterial: getTipoOperacionMaterialCode(opFinal),
        viajesCantidad: cant,
        m3PorViaje: m3,
        totalM3: lineTotalM3,
        valorViajeEquipo: Number(l.valorViajeEquipo) > 0 ? Number(l.valorViajeEquipo) : undefined,
        valorMaterialAparte:
          separarCobranzaMaterial && Number(l.valorMaterialAparte) > 0
            ? Number(l.valorMaterialAparte)
            : undefined,
        observacion: l.observacion.trim() || undefined,
      };
    });

    const rolledTotalViajes = normalizedViajeLines.reduce((s, l) => s + l.viajesCantidad, 0);
    const rolledTotalM3 = Number(normalizedViajeLines.reduce((s, l) => s + l.totalM3, 0).toFixed(2));
    const rolledAvgM3PorViaje =
      normalizedViajeLines.length === 1
        ? normalizedViajeLines[0].m3PorViaje
        : rolledTotalViajes > 0
          ? Number((rolledTotalM3 / rolledTotalViajes).toFixed(2))
          : 0;
    const uniqueMaterials = Array.from(new Set(normalizedViajeLines.map((l) => l.tipoMaterial).filter(Boolean)));
    const rolledTipoMaterial = uniqueMaterials.join(' + ') || 'Ripio Común';
    const uniqueOps = Array.from(new Set(normalizedViajeLines.map((l) => l.extraccionEntregas).filter(Boolean)));
    const rolledExtraccionEntregas =
      uniqueOps.length === 1 ? uniqueOps[0] : uniqueOps.join(' / ') || 'Entrega de Material';
    const rolledTipoOpMat =
      tipo !== 'VIAJES'
        ? undefined
        : normalizedViajeLines[0]?.tipoOperacionMaterial || 'ENTREGA_MATERIAL';
    const rolledValorViajeEquipo = normalizedViajeLines.reduce((s, l) => s + (l.valorViajeEquipo || 0), 0);
    const rolledValorMaterialAparte = normalizedViajeLines.reduce((s, l) => s + (l.valorMaterialAparte || 0), 0);
    const viajesSummaryDetail =
      normalizedViajeLines.length === 1
        ? `${normalizedViajeLines[0].extraccionEntregas}: ${normalizedViajeLines[0].tipoMaterial}`
        : normalizedViajeLines
            .map((l) => `${l.viajesCantidad}× ${l.tipoMaterial} (${l.extraccionEntregas.replace(' de Material', '')})`)
            .join(' | ');
    const viajesDetalleEntrega =
      normalizedViajeLines.length === 1
        ? `${normalizedViajeLines[0].extraccionEntregas}: ${normalizedViajeLines[0].tipoMaterial} (${rolledTotalM3} m³)`
        : `${normalizedViajeLines.length} líneas (${rolledTotalViajes} vjs / ${rolledTotalM3} m³): ${normalizedViajeLines
            .map((l) => `${l.viajesCantidad}× ${l.tipoMaterial}`)
            .join(' + ')}`;

    const isEsporadica = obraInputMode === 'ESPORADICA';
    const isEquipoEventual = equipoInputMode === 'EVENTUAL';
    const isEmpleadoEventual = empleadoInputMode === 'EVENTUAL';
    const newParte: ParteDiario = {
      ...(parteToEdit || {}),
      id: parteToEdit ? parteToEdit.id : Math.random().toString(16).substring(2, 10),
      servMant: finalServMant,
      obra: obra.trim() || (isEsporadica ? 'TRABAJO ESPORÁDICO' : 'OBRA GENERAL'),
      codigoObra: isEsporadica ? 'ESPORADICA' : (codigoObra.trim() || 'OBRA-01'),
      esObraEsporadica: isEsporadica,
      categoriaObra,
      clienteId: clienteId || undefined,
      clienteNombre: clienteNombre.trim() || undefined,
      clienteCuit: clienteCuit.trim() || undefined,
      codigoEquipo: isEquipoEventual ? 'EVENTUAL' : (codigoEquipo.trim() || 'EQ-01'),
      marcaModelo: marcaModelo.trim() || (isEquipoEventual ? 'EQUIPO EVENTUAL' : 'MAQUINARIA'),
      esEquipoEventual: isEquipoEventual,
      codigoEmpleado: isEmpleadoEventual ? 'A_PRUEBA' : (codigoEmpleado.trim() || 'EMP-101'),
      nombreApellido: nombreApellido.trim() || (isEmpleadoEventual ? 'OPERARIO A PRUEBA' : 'OPERARIO'),
      esEmpleadoEventual: isEmpleadoEventual,
      fecha,
      horaInicioMañana: sinHorasMaquina ? '' : horaInicioMañana,
      horaFinMañana: sinHorasMaquina ? '' : horaFinMañana,
      horaInicioTarde: sinHorasMaquina ? '' : horaInicioTarde,
      horaFinTarde: sinHorasMaquina ? '' : horaFinTarde,
      horasTrabajadas: Number(horasTrabajadas),
      odomKilom: Number(odomKilom) || 0,
      tipo,
      detalleTipo: tipo === 'HORAS'
        ? detalleTipo
        : tipo === 'TRABAJO'
        ? (detalleTipo || 'Trabajo realizado')
        : tipo === 'DIA'
        ? detalleDia
        : tipo === 'OTRO'
        ? (detalleOtro || 'Otro servicio')
        : viajesSummaryDetail,
      viajesCantidad: tipo === 'VIAJES' ? rolledTotalViajes : 0,
      extraccionEntregas: tipo === 'VIAJES' ? rolledExtraccionEntregas : undefined,
      tipoOperacionMaterial: rolledTipoOpMat,
      tipoMaterial: tipo === 'VIAJES' ? rolledTipoMaterial : undefined,
      m3PorViaje: tipo === 'VIAJES' ? rolledAvgM3PorViaje : undefined,
      totalM3: tipo === 'VIAJES' ? rolledTotalM3 : undefined,
      viajesDetalle: tipo === 'VIAJES' ? normalizedViajeLines : undefined,
      separarCobranzaMaterial: tipo === 'VIAJES' ? separarCobranzaMaterial : false,
      valorViajeEquipo: tipo === 'VIAJES' && rolledValorViajeEquipo > 0 ? Number(rolledValorViajeEquipo) : undefined,
      valorMaterialAparte:
        tipo === 'VIAJES' && separarCobranzaMaterial && rolledValorMaterialAparte > 0
          ? Number(rolledValorMaterialAparte)
          : undefined,
      cantidadDias: tipo === 'DIA' ? Number(cantidadDias) || 1 : undefined,
      detalleOtro: (tipo === 'OTRO' || tipo === 'TRABAJO') ? (detalleOtro || detalleTipo) : undefined,
      cantidadOtro: (tipo === 'OTRO' || tipo === 'TRABAJO') ? Number(cantidadOtro) || 1 : undefined,
      hsCantidad: tipo === 'HORAS' ? Number(finalHsCantidad) : 0,
      novedades: novedades.trim() || 'Sin novedades',
      ubicacion: ubicacion.trim() || 'En obra',
      encargadoObra: encargadoObra.trim() || 'Encargado de Obra',
      firma: firma.trim() || 'Firmado',
      numParte: numParte.trim(),
      autorizado,

      // Compatibility & telemetry fields
      vehicleId: isEquipoEventual ? undefined : (fleet.find(v => v.modeloMarca === marcaModelo || v.codigo === codigoEquipo)?.id || 'eq-1'),
      vehicleName: marcaModelo,
      driverName: nombreApellido,
      cantidad: tipo === 'VIAJES' ? rolledTotalViajes : (tipo === 'DIA' ? cantidadDias : (tipo === 'TRABAJO' ? cantidadOtro : finalHsCantidad)),
      detalleEntrega: tipo === 'VIAJES' ? viajesDetalleEntrega : detalleTipo,
      combustibleConsumidoLts: parteToEdit?.combustibleConsumidoLts || 35,
      rentalId: rentalId || undefined,
      rentalNumero: rentalId
        ? (() => {
            const rObj = rentals.find(r => r.id === rentalId);
            return rObj ? (rObj.numeroContrato || rObj.numero) : parteToEdit?.rentalNumero;
          })()
        : undefined,
      facturaId: facturaId || undefined,
      facturaNumero: facturaId
        ? (() => {
            const inv = invoices.find(i => i.id === facturaId);
            return inv ? formatInvoiceNumber(inv) : parteToEdit?.facturaNumero;
          })()
        : undefined,
      fotoUrl: fotoUrl || undefined,
    };

    setIsSubmitting(true);
    setSaveError(null);
    Promise.resolve(onSave(newParte))
      .then((res) => {
        if (res && typeof res === 'object' && 'ok' in res && !res.ok) {
          setSaveError(res.error || 'No se pudo confirmar el guardado en Supabase PostgreSQL.');
          return;
        }
        if (selectedBagDocId && onLinkBolsaDocument) {
          onLinkBolsaDocument(
            selectedBagDocId,
            newParte.id,
            `Parte #${newParte.numParte} · ${newParte.marcaModelo}`
          );
        }
        onClose();
      })
      .catch((err: any) => {
        setSaveError(err?.message || 'Error al confirmar el guardado en Supabase PostgreSQL.');
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const selectedVehicleObj = equipoInputMode === 'FLOTA'
    ? fleet.find(f => f.modeloMarca === marcaModelo || f.codigo === codigoEquipo || f.id === codigoEquipo)
    : undefined;
  const selectedEmpObj = empleadoInputMode === 'NOMINA'
    ? employees.find(e => e.nombreApellido === nombreApellido || e.codigoEmpleado === codigoEmpleado)
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-fadeIn">
      <div className="bg-[#14161D] border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-[#181B24] border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <ClipboardList className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white leading-none">
                  {parteToEdit ? `Editar Parte Diario Nº ${parteToEdit.numParte}` : 'Nuevo Parte Diario'}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Paso {activeStep} de 3
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {activeStep === 1 && 'Paso 1: Fecha, comprobante, selección del equipo y empleado.'}
                {activeStep === 2 && 'Paso 2: Registro de horarios de mañana y tarde, horas y odómetro.'}
                {activeStep === 3 && 'Paso 3: SERV_MANT, obra, modalidad de trabajo, encargado y novedades.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator Wizard Bar */}
        <div className="bg-[#0F1117] border-b border-slate-800 px-5 sm:px-6 py-3">
          <div className="grid grid-cols-3 gap-2">
            
            {/* Step 1 Tab */}
            <button
              type="button"
              onClick={() => setActiveStep(1)}
              className={`flex items-center gap-2.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                activeStep === 1
                  ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-xs'
                  : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                activeStep === 1
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                1
              </div>
              <div className="overflow-hidden min-w-0">
                <span className="block text-[10px] uppercase font-bold tracking-wider text-amber-400/90 leading-tight">
                  Paso 1
                </span>
                <span className="block text-xs font-bold truncate">
                  Equipo y Empleado
                </span>
              </div>
            </button>

            {/* Step 2 Tab */}
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              className={`flex items-center gap-2.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                activeStep === 2
                  ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-xs'
                  : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                activeStep === 2
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                2
              </div>
              <div className="overflow-hidden min-w-0">
                <span className="block text-[10px] uppercase font-bold tracking-wider text-amber-400/90 leading-tight">
                  Paso 2
                </span>
                <span className="block text-xs font-bold truncate">
                  Horarios de Trabajo
                </span>
              </div>
            </button>

            {/* Step 3 Tab */}
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className={`flex items-center gap-2.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                activeStep === 3
                  ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-xs'
                  : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                activeStep === 3
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                3
              </div>
              <div className="overflow-hidden min-w-0">
                <span className="block text-[10px] uppercase font-bold tracking-wider text-amber-400/90 leading-tight">
                  Paso 3
                </span>
                <span className="block text-xs font-bold truncate">
                  Servicio y Modalidad
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Form Body Container */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (activeStep !== 3) {
              e.stopPropagation();
              setActiveStep((prev) => (prev === 1 ? 2 : 3));
              return;
            }
            handleSubmit(e);
          }}
          onKeyDown={(e) => {
            // Prevent accidental submit when pressing Enter in inputs during steps 1 and 2
            if (e.key === 'Enter' && activeStep !== 3) {
              e.preventDefault();
              setActiveStep((prev) => (prev === 1 ? 2 : 3));
            }
          }}
          className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5"
        >
          {!parteToEdit && aiPrefillDraft && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-[#F0C800] shrink-0 mt-0.5" />
                <div className="text-xs text-slate-200 leading-relaxed">
                  <strong className="text-[#F0C800]">Parte completado por IA:</strong> Revisá los datos detectados de la foto (máquina, chofer, horarios y obra) y aceptá en el Paso 3.
                </div>
              </div>
              {activeStep < 3 && (
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="px-3 py-1.5 rounded-lg bg-[#F0C800] hover:bg-[#F5D63D] text-[#1A1C20] font-black text-xs shrink-0 cursor-pointer"
                >
                  Ir directo al Paso 3
                </button>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* PASO 1: FECHA, NUMERO DE PARTE, EQUIPO Y EMPLEADO */}
          {/* ========================================================= */}
          {activeStep === 1 && (
            <div className="space-y-5 animate-fadeIn">
              
              {/* Step Banner */}
              <div className="flex items-center justify-between p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Paso 1: Asignación Operativa del Parte
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Fecha, número identificador del comprobante, máquina asignada y chofer a cargo.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                  Paso 1 de 3
                </span>
              </div>

              {/* Grid 1: Fecha, Num Parte, Estado */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Fecha */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>Fecha del Parte *</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full bg-[#0F1117] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                {/* Número de Parte */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between gap-1.5">
                    <span className="flex items-center gap-1.5">
                      <Hash className={`w-3.5 h-3.5 ${duplicatePartes.length > 0 ? 'text-rose-400' : 'text-amber-400'}`} />
                      <span>Número de Parte *</span>
                    </span>
                    {duplicatePartes.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/50 text-rose-300 text-[10px] font-black">
                        ⚠️ YA EXISTE ({duplicatePartes.length})
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 2620"
                    value={numParte}
                    onChange={(e) => {
                      setNumParte(e.target.value);
                      setAllowDuplicateConfirm(false);
                      setDuplicateSubmitBlocked(false);
                    }}
                    className={`w-full bg-[#0F1117] border rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold focus:outline-none transition ${
                      duplicatePartes.length > 0
                        ? 'border-rose-500 ring-2 ring-rose-500/20 text-rose-300 focus:border-rose-400'
                        : 'border-slate-700/80 text-amber-300 focus:border-amber-500'
                    }`}
                  />
                </div>

                {/* Estado de Control */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Estado / Control</span>
                  </label>
                  <SearchableSelect
                    options={[
                      { value: 'NO CONTROLADO', label: 'NO CONTROLADO' },
                      { value: 'CONTROLADO', label: 'CONTROLADO' },
                      { value: 'AUTORIZADO', label: 'AUTORIZADO' },
                    ]}
                    value={autorizado}
                    onChange={(val) => setAutorizado((val || 'NO CONTROLADO') as ParteAutorizadoStatus)}
                    placeholder="Estado..."
                    searchPlaceholder="Buscar estado..."
                    showClear={false}
                  />
                </div>
              </div>

              {duplicatePartes.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/45 rounded-xl p-3.5 space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="text-xs font-black text-rose-300 uppercase tracking-wide">
                          ¡Atención! Ya cargaste {duplicatePartes.length === 1 ? 'un parte diario' : `${duplicatePartes.length} partes diarios`} con el Nº {numParte.trim()}
                        </div>
                        <p className="text-[11px] text-rose-200/80">
                          Revisá si se trata del mismo comprobante físico antes de volver a registrarlo:
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                    {duplicatePartes.slice(0, 4).map((dup) => (
                      <div
                        key={dup.id}
                        className="bg-[#0F1117]/80 border border-rose-500/30 rounded-lg px-3 py-1.5 text-[11px] flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-slate-200">
                          <span className="font-mono font-bold text-rose-300">#{dup.numParte}</span>
                          <span className="text-slate-400">·</span>
                          <span className="font-mono text-slate-300">{dup.fecha}</span>
                          <span className="text-slate-400">·</span>
                          <span className="font-semibold text-white">{dup.obra || 'Sin obra'}</span>
                        </div>
                        <div className="text-slate-400 font-mono text-[10px]">
                          {dup.marcaModelo || dup.codigoEquipo} · {dup.nombreApellido} ·{' '}
                          {dup.tipo === 'VIAJES'
                            ? `${dup.viajesCantidad || dup.cantidad || 0} viajes`
                            : `${dup.horasTrabajadas || dup.hsCantidad || 0} hs`}
                        </div>
                      </div>
                    ))}
                  </div>
                  <label className="inline-flex items-center gap-2 pt-1 cursor-pointer select-none text-xs text-rose-200 font-semibold">
                    <input
                      type="checkbox"
                      checked={allowDuplicateConfirm}
                      onChange={(e) => {
                        setAllowDuplicateConfirm(e.target.checked);
                        if (e.target.checked) setDuplicateSubmitBlocked(false);
                      }}
                      className="rounded border-rose-500/60 bg-[#0F1117] text-rose-500 focus:ring-rose-500"
                    />
                    <span>Entiendo que el Nº {numParte.trim()} está repetido, permitir guardar igual</span>
                  </label>
                </div>
              )}

              {/* Sección Selección del Equipo (Flota o Eventual por única vez) */}
              <div
                className={`rounded-xl p-4 space-y-3 border transition ${
                  equipoInputMode === 'EVENTUAL'
                    ? 'bg-orange-950/20 border-orange-500/60'
                    : 'bg-[#181B24]/90 border-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="w-4 h-4" />
                    <span>Selección del Equipo (Máquina o Vehículo) *</span>
                  </span>

                  <div className="inline-flex bg-[#0F1117] border border-slate-800 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEquipoInputMode('FLOTA');
                        const found = fleet.find(
                          (f) => f.modeloMarca.toLowerCase().trim() === marcaModelo.toLowerCase().trim()
                        ) || fleet[0];
                        if (found) {
                          setMarcaModelo(found.modeloMarca);
                          setCodigoEquipo(found.codigo || found.id || found.modeloMarca);
                          if (found.horometro) setOdomKilom(found.horometro);
                        } else {
                          setCodigoEquipo('EQ-01');
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                        equipoInputMode === 'FLOTA'
                          ? 'bg-amber-500 text-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🚛 De la Flota ({fleet.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEquipoInputMode('EVENTUAL');
                        setCodigoEquipo('EVENTUAL');
                        if (fleet.some((f) => f.modeloMarca.toLowerCase().trim() === marcaModelo.toLowerCase().trim())) {
                          setMarcaModelo('');
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                        equipoInputMode === 'EVENTUAL'
                          ? 'bg-orange-500 text-slate-950'
                          : 'text-slate-400 hover:text-orange-300'
                      }`}
                    >
                      ⚡ Por única vez (Eventual)
                    </button>
                  </div>
                </div>

                {equipoInputMode === 'FLOTA' ? (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
                        Equipo de la Flota (Escribí para buscar)
                      </label>
                      <SearchableSelect
                        options={[
                          ...fleet.map((f) => ({
                            value: f.modeloMarca,
                            label: `${f.modeloMarca} [${f.codigo || f.id}]`,
                            subtitle: `${f.patente ? `Pat: ${f.patente}` : 'Sin patente'} • ${f.clasificacion || 'Equipo'}`,
                          })),
                          ...(marcaModelo && !fleet.some(f => f.modeloMarca === marcaModelo)
                            ? [{ value: marcaModelo, label: `${marcaModelo} [${codigoEquipo || 'EQ'}]` }]
                            : []),
                        ]}
                        value={marcaModelo}
                        onChange={(val) => {
                          setMarcaModelo(val);
                          const found = fleet.find(f => f.modeloMarca === val || f.codigo === val || f.id === val);
                          if (found) {
                            setCodigoEquipo(found.codigo || found.id || val);
                            if (found.horometro) {
                              setOdomKilom(found.horometro);
                            }
                          }
                        }}
                        placeholder="-- Seleccionar Equipo de la Flota --"
                        searchPlaceholder="Escribí marca, modelo, código o patente..."
                        clearValue=""
                      />
                    </div>

                    {/* Info Card Equipo Seleccionado */}
                    {selectedVehicleObj && (
                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400">Patente: <strong className="text-white">{selectedVehicleObj.patente || 'S/D'}</strong></span>
                          <span className="text-slate-400">Código: <strong className="text-amber-400">{selectedVehicleObj.codigo || selectedVehicleObj.id}</strong></span>
                          <span className="text-slate-400">Clasificación: <strong className="text-amber-300">{selectedVehicleObj.clasificacion || 'Vial'}</strong></span>
                          <span className="text-slate-400">Horómetro: <strong className="text-emerald-400">{selectedVehicleObj.horometro || 'N/A'}</strong></span>
                        </div>
                        <span className="text-[10px] text-slate-500 uppercase">Estado: {selectedVehicleObj.estado || 'Activo'}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-orange-300 uppercase">
                      Equipo Eventual / Subcontratado (Carga por 1 sola vez) *
                    </label>
                    <input
                      type="text"
                      value={marcaModelo}
                      onChange={(e) => {
                        setMarcaModelo(e.target.value.toUpperCase());
                        setCodigoEquipo('EVENTUAL');
                      }}
                      placeholder="EJ: CAMIÓN VOLCADOR TERCERO (PAT. AB123CD) / RETRO ALQUILADA..."
                      className="w-full bg-[#0F1117] border border-orange-500/60 rounded-lg px-3 py-2.5 text-sm font-bold text-orange-100 placeholder:text-slate-500 uppercase focus:outline-none focus:border-orange-400"
                    />
                    <div className="bg-orange-500/15 border border-orange-500/40 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-orange-200">
                      <span className="font-semibold">
                        ⚡ EQUIPO EVENTUAL (NO PERTENECE A LA FLOTA): no se creará ficha en Vehículos ni Maquinarias.
                      </span>
                      <span className="px-2 py-0.5 rounded bg-orange-500 text-slate-950 font-black text-[10px] shrink-0">
                        1 VEZ
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Sección Selección del Empleado (Nómina o A Prueba / 1 sola vez) */}
              <div
                className={`rounded-xl p-4 space-y-3 border transition ${
                  empleadoInputMode === 'EVENTUAL'
                    ? 'bg-fuchsia-950/25 border-fuchsia-500/70'
                    : 'bg-[#181B24]/90 border-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-4 h-4" />
                    <span>Empleado (Operario o Chofer) *</span>
                  </span>

                  <div className="inline-flex bg-[#0F1117] border border-slate-800 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEmpleadoInputMode('NOMINA');
                        const found = employees.find(
                          (emp) => emp.nombreApellido.toLowerCase().trim() === nombreApellido.toLowerCase().trim()
                        ) || employees[0];
                        if (found) {
                          setNombreApellido(found.nombreApellido);
                          setCodigoEmpleado(found.codigoEmpleado || found.legajo || 'EMP-' + found.id);
                        } else {
                          setCodigoEmpleado('EMP-101');
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                        empleadoInputMode === 'NOMINA'
                          ? 'bg-amber-500 text-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      👷 De Nómina ({employees.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmpleadoInputMode('EVENTUAL');
                        setCodigoEmpleado('A_PRUEBA');
                        if (employees.some((emp) => emp.nombreApellido.toLowerCase().trim() === nombreApellido.toLowerCase().trim())) {
                          setNombreApellido('');
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                        empleadoInputMode === 'EVENTUAL'
                          ? 'bg-fuchsia-500 text-white'
                          : 'text-slate-400 hover:text-fuchsia-300'
                      }`}
                    >
                      ⚠️ A prueba / 1 vez (No empleado)
                    </button>
                  </div>
                </div>

                {empleadoInputMode === 'NOMINA' ? (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
                        Empleado Asignado (Escribí para buscar)
                      </label>
                      <SearchableSelect
                        options={[
                          ...employees.map((emp) => ({
                            value: emp.nombreApellido,
                            label: emp.nombreApellido,
                            subtitle: `${emp.categoria || 'Operario'}${emp.legajo ? ` • Leg: ${emp.legajo}` : ''}`,
                          })),
                          ...(nombreApellido && !employees.some(emp => emp.nombreApellido === nombreApellido)
                            ? [{ value: nombreApellido, label: nombreApellido }]
                            : []),
                        ]}
                        value={nombreApellido}
                        onChange={(val) => {
                          setNombreApellido(val);
                          const found = employees.find(emp => emp.nombreApellido === val || emp.codigoEmpleado === val || emp.legajo === val);
                          if (found) {
                            setCodigoEmpleado(found.codigoEmpleado || found.legajo || 'EMP-' + found.id);
                          }
                        }}
                        placeholder="-- Seleccionar Chofer / Maquinista --"
                        searchPlaceholder="Escribí apellido, nombre o legajo..."
                        clearValue=""
                      />
                    </div>

                    {/* Info Card Empleado Seleccionado */}
                    {selectedEmpObj && (
                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400">Legajo / Código: <strong className="text-amber-400">{selectedEmpObj.codigoEmpleado || selectedEmpObj.legajo || 'EMP-' + selectedEmpObj.id}</strong></span>
                          <span className="text-slate-400">Categoría: <strong className="text-white">{selectedEmpObj.categoria || 'Operario'}</strong></span>
                          <span className="text-slate-400">Sector: <strong className="text-amber-300">{selectedEmpObj.sector || 'Obras'}</strong></span>
                        </div>
                        <span className="text-[10px] text-slate-500 uppercase">Estado: {selectedEmpObj.estado || 'Activo'}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-fuchsia-300 uppercase">
                      Operario / Chofer a Prueba — Por única vez (No es empleado) *
                    </label>
                    <input
                      type="text"
                      value={nombreApellido}
                      onChange={(e) => {
                        setNombreApellido(e.target.value.toUpperCase());
                        setCodigoEmpleado('A_PRUEBA');
                      }}
                      placeholder="EJ: JUAN PÉREZ (CHOFER A PRUEBA)..."
                      className="w-full bg-[#0F1117] border border-fuchsia-500/70 rounded-lg px-3 py-2.5 text-sm font-bold text-fuchsia-100 placeholder:text-slate-500 uppercase focus:outline-none focus:border-fuchsia-400"
                    />
                    <div className="bg-fuchsia-500/15 border border-fuchsia-500/50 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-fuchsia-200">
                      <span className="font-semibold">
                        ⚠️ NO ES EMPLEADO · A PRUEBA (1 SOLA VEZ): queda resaltado en los partes y NO se da de alta en Personal.
                      </span>
                      <span className="px-2 py-0.5 rounded bg-fuchsia-500 text-white font-black text-[10px] shrink-0">
                        NO EMPLEADO
                      </span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* PASO 2: HORARIOS DE ENTRADA Y SALIDA (MAÑANA Y TARDE) */}
          {/* ========================================================= */}
          {activeStep === 2 && (
            <div className="space-y-5 animate-fadeIn">
              
              {/* Step Banner */}
              <div className="flex items-center justify-between p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Paso 2: Registro de Horarios y Jornada
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Entrada y salida de turno mañana y tarde con cálculo automático de horas efectivas.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                  Paso 2 de 3
                </span>
              </div>

              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#181B24]/90 border border-slate-800 cursor-pointer hover:border-amber-500/40 transition">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Sin horas de máquina (0 hs — Ej: Viajes de camión, flete o traslado)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Activá esta opción cuando el parte corresponde a viajes o trabajo por día/tarea y no debe sumar horas reloj.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={sinHorasMaquina}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSinHorasMaquina(checked);
                    if (checked) {
                      setHoraInicioMañana('');
                      setHoraFinMañana('');
                      setHoraInicioTarde('');
                      setHoraFinTarde('');
                    } else if (!horaInicioMañana) {
                      setHoraInicioMañana('08:00');
                      setHoraFinMañana('12:00');
                      setHoraInicioTarde('13:00');
                      setHoraFinTarde('17:00');
                    }
                  }}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </label>

              {/* Turno Mañana */}
              <div className="bg-[#181B24]/90 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Turno Mañana
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-400">
                    {(() => {
                      const mins = Math.round(timeCalc.manHours * 60);
                      return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} hs mañana`;
                    })()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Entrada (Mañana)</span>
                      <span className="text-[10px] text-slate-500 font-mono">HH:MM</span>
                    </label>
                    <input
                      type="time"
                      value={horaInicioMañana}
                      onChange={(e) => setHoraInicioMañana(e.target.value)}
                      className="w-full bg-[#0F1117] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Salida (Mañana)</span>
                      <span className="text-[10px] text-slate-500 font-mono">HH:MM</span>
                    </label>
                    <input
                      type="time"
                      value={horaFinMañana}
                      onChange={(e) => setHoraFinMañana(e.target.value)}
                      className="w-full bg-[#0F1117] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Turno Tarde */}
              <div className="bg-[#181B24]/90 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Turno Tarde
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-blue-400">
                    {(() => {
                      const mins = Math.round(timeCalc.tarHours * 60);
                      return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} hs tarde`;
                    })()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Entrada (Tarde)</span>
                      <span className="text-[10px] text-slate-500 font-mono">HH:MM</span>
                    </label>
                    <input
                      type="time"
                      value={horaInicioTarde}
                      onChange={(e) => setHoraInicioTarde(e.target.value)}
                      className="w-full bg-[#0F1117] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Salida (Tarde)</span>
                      <span className="text-[10px] text-slate-500 font-mono">HH:MM</span>
                    </label>
                    <input
                      type="time"
                      value={horaFinTarde}
                      onChange={(e) => setHoraFinTarde(e.target.value)}
                      className="w-full bg-[#0F1117] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Resumen Calculado de Horas & Odómetro */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Total Horas Trabajadas */}
                <div className="p-4 bg-linear-to-br from-amber-500/15 via-slate-900 to-slate-900 border border-amber-500/40 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-400 block tracking-wider">
                      TOTAL HORAS CALCULADAS
                    </span>
                    <span className="text-2xl font-black text-white font-mono leading-tight">
                      {(() => {
                        const mins = Math.round(horasTrabajadas * 60);
                        return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
                      })()}{' '}
                      <span className="text-sm font-bold text-amber-400">hs</span>
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      {(() => {
                        const mMins = Math.round(timeCalc.manHours * 60);
                        const tMins = Math.round(timeCalc.tarHours * 60);
                        return `Suma de ${Math.floor(mMins / 60)}:${String(mMins % 60).padStart(2, '0')}h mañana + ${Math.floor(tMins / 60)}:${String(tMins % 60).padStart(2, '0')}h tarde`;
                      })()}
                    </span>
                  </div>
                  <div className="p-3 bg-amber-500 text-black rounded-xl font-black shadow-lg">
                    <Sparkles className="w-5 h-5" />
                  </div>
                </div>

                {/* Odómetro / Kilometraje / Horómetro */}
                <div className="p-4 bg-[#181B24]/90 border border-slate-800 rounded-xl">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Odómetro / Horómetro Cierre</span>
                    <span className="text-[10px] text-slate-500 font-mono">ODOM-KILOM</span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={odomKilom}
                    onChange={(e) => setOdomKilom(parseInt(e.target.value, 10) || 0)}
                    placeholder="Ej: 12450"
                    className="w-full bg-[#0F1117] border border-slate-700/80 rounded-xl px-3.5 py-2 text-base text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500 transition"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Lectura de cierre del tablero para mantenimiento preventivo.
                  </span>
                </div>

              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* PASO 3: SERV_MANT, OBRA, TIPO Y CAMPOS CONDICIONALES */}
          {/* ========================================================= */}
          {activeStep === 3 && (
            <div className="space-y-5 animate-fadeIn">
              
              {/* Step Banner */}
              <div className="flex items-center justify-between p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                    <Wrench className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Paso 3: SERV_MANT, Obra y Modalidad de Trabajo
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Tipo de servicio, obra asignada, modalidad (horas, viajes, día u otro), encargado y novedades.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                  Paso 3 de 3
                </span>
              </div>

              {/* SERV_MANT (Desplegable) & Obra */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* SERV_MANT */}
                <div className="bg-[#181B24]/90 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-amber-400" />
                      <span>SERV_MANT (Tipo de Servicio) *</span>
                    </span>
                  </label>

                  <SearchableSelect
                    options={SERV_MANT_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: `${opt.label} (${opt.value})`,
                      subtitle: opt.desc,
                    }))}
                    value={servMant}
                    onChange={(val) => setServMant(val || 'ALQUILER')}
                    placeholder="Seleccionar servicio..."
                    searchPlaceholder="Buscar tipo de servicio..."
                    showClear={false}
                  />

                  {servMant === 'OTRO' && (
                    <input
                      type="text"
                      required
                      placeholder="Especifique el servicio..."
                      value={servMantCustom}
                      onChange={(e) => setServMantCustom(e.target.value)}
                      className="w-full bg-[#0F1117] border border-amber-500/60 rounded-xl px-3.5 py-2 text-xs text-amber-300 focus:outline-none focus:border-amber-500 transition mt-1"
                    />
                  )}
                  <p className="text-[11px] text-slate-400 leading-tight">
                    {SERV_MANT_OPTIONS.find(o => o.value === servMant)?.desc || 'Servicio personalizado'}
                  </p>
                </div>

                {/* OBRA (Registrada en BD o Esporádica Tipeada) */}
                <div className="bg-[#181B24]/90 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Obra / Trabajo *</span>
                    </label>
                    <div className="inline-flex bg-[#0F1117] border border-slate-800 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setObraInputMode('REGISTRADA');
                          const found =
                            allSelectableObras.find(o => o.nombreObra.toLowerCase().trim() === obra.toLowerCase().trim()) ||
                            allSelectableObras.find(o => !o.archivado) ||
                            allSelectableObras[0];
                          if (found) {
                            setObra(found.nombreObra);
                            setCodigoObra(found.numero || 'OBRA-01');
                            if (found.ubicacion) setUbicacion(found.ubicacion);
                            setCategoriaObra(found.categoriaDuracion || 'LARGA');
                            setClienteId(found.clienteId || '');
                            setClienteNombre(found.clienteNombre || found.pertenece || '');
                            setClienteCuit(found.clienteCuit || '');
                          } else {
                            setCodigoObra('OBRA-01');
                            setCategoriaObra('LARGA');
                          }
                        }}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                          obraInputMode === 'REGISTRADA'
                            ? 'bg-amber-500 text-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        🏗️ De la Base ({allSelectableObras.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setObraInputMode('ESPORADICA');
                          setCodigoObra('ESPORADICA');
                          setCategoriaObra('ESPORADICA');
                          if (allSelectableObras.some(o => o.nombreObra.toLowerCase().trim() === obra.toLowerCase().trim())) {
                            setObra('');
                            setUbicacion('');
                            setClienteId('');
                            setClienteNombre('');
                            setClienteCuit('');
                          }
                        }}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                          obraInputMode === 'ESPORADICA'
                            ? 'bg-cyan-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        ⚡ Esporádica (Tipeada)
                      </button>
                    </div>
                  </div>

                  {obraInputMode === 'REGISTRADA' ? (
                    <>
                      <SearchableSelect
                        options={[
                          ...(allSelectableObras.length > 0
                            ? allSelectableObras.map(o => ({
                                value: o.nombreObra,
                                label: `${o.nombreObra} [${o.numero || o.id}]`,
                                secondaryText: `${o.categoriaDuracion === 'CORTA' ? '⏱️ Corta' : o.categoriaDuracion === 'ESPORADICA' ? '⚡ Esporádica' : '🏗️ Larga'}${(o.clienteNombre || o.pertenece) ? ` · ${o.clienteNombre || o.pertenece}` : ''}${o.ubicacion ? ` · ${o.ubicacion}` : ''}${o.archivado ? ' · 📦 Archivada' : ''}`,
                              }))
                            : [
                                { value: 'AYALA EL MOLLAR', label: 'AYALA EL MOLLAR [OBRA-01]' },
                                { value: 'OBRA GENERAL', label: 'OBRA GENERAL [OBRA-02]' },
                                { value: 'CANTERA LA HORMIGA', label: 'CANTERA LA HORMIGA [OBRA-03]' },
                              ]),
                          ...(obra && !allSelectableObras.some(o => o.nombreObra === obra)
                            ? [{ value: obra, label: `${obra} [${codigoObra || 'OBRA'}]` }]
                            : []),
                        ]}
                        value={obra}
                        onChange={(val) => {
                          setObra(val);
                          const found = allSelectableObras.find(o => o.nombreObra === val || o.numero === val || o.id === val);
                          if (found) {
                            setCodigoObra(found.numero || 'OBRA-01');
                            if (found.ubicacion) setUbicacion(found.ubicacion);
                            setCategoriaObra(found.categoriaDuracion || 'LARGA');
                            setClienteId(found.clienteId || '');
                            setClienteNombre(found.clienteNombre || found.pertenece || '');
                            setClienteCuit(found.clienteCuit || '');
                          }
                        }}
                        placeholder="-- Seleccionar Obra Asignada --"
                        searchPlaceholder="Escribí para buscar obra..."
                        clearValue=""
                      />

                      {obra && (
                        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                          <span className="text-slate-400">Código Obra: <strong className="text-amber-400">{codigoObra || 'OBRA-01'}</strong></span>
                          {clienteNombre && (
                            <span className="text-slate-400">Cliente: <strong className="text-emerald-300">{clienteNombre}</strong></span>
                          )}
                          <span className="text-slate-400">Ubicación: <strong className="text-white">{ubicacion || 'En obra'}</strong></span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        required
                        value={obra}
                        onChange={(e) => setObra(e.target.value)}
                        placeholder="Ej: Alquiler rápido Pérez 4hs · Limpieza loteo..."
                        className="w-full bg-[#0F1117] border border-cyan-500/40 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                      <input
                        type="text"
                        value={ubicacion}
                        onChange={(e) => setUbicacion(e.target.value)}
                        placeholder="Ubicación / Zona (opcional, ej: B° Los Perales)"
                        className="w-full bg-[#0F1117] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                      {/* Cliente Opcional en Obra Esporádica */}
                      <div className="bg-[#0F1117] border border-slate-800/90 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                            <User className="w-3 h-3 text-cyan-400" />
                            Cliente (Opcional)
                          </span>
                          {(clienteId || clienteNombre) && (
                            <button
                              type="button"
                              onClick={() => {
                                setClienteId('');
                                setClienteNombre('');
                                setClienteCuit('');
                              }}
                              className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                            >
                              Quitar cliente
                            </button>
                          )}
                        </div>
                        {clients.length > 0 && (
                          <SearchableSelect
                            compact
                            options={[
                              { value: '', label: '-- Sin cliente del padrón (opcional) --' },
                              ...clients.map((c) => ({
                                value: c.id,
                                label: `${c.razonSocial}${c.codigo ? ` [${c.codigo}]` : ''}`,
                                secondaryText: c.cuit ? `CUIT: ${c.cuit}` : undefined,
                                extraSearchTerms: `${c.cuit || ''} ${c.codigo || ''}`,
                              })),
                            ]}
                            value={clienteId}
                            onChange={(val) => {
                              if (!val) {
                                setClienteId('');
                                setClienteCuit('');
                                return;
                              }
                              const found = clients.find((c) => c.id === val);
                              if (found) {
                                setClienteId(found.id);
                                setClienteNombre(found.razonSocial || '');
                                setClienteCuit(found.cuit || '');
                              }
                            }}
                            placeholder="Elegir cliente del padrón (opcional)..."
                            searchPlaceholder="Buscar cliente por nombre o CUIT..."
                            clearValue=""
                          />
                        )}
                        {!clienteId && (
                          <input
                            type="text"
                            value={clienteNombre}
                            onChange={(e) => setClienteNombre(e.target.value)}
                            placeholder="O escribí nombre de cliente ocasional (opcional)"
                            className="w-full bg-[#14171F] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                          />
                        )}
                        {clienteId && clienteCuit && (
                          <div className="text-[10px] font-mono text-emerald-400">
                            Vinculado: {clienteNombre} · CUIT {clienteCuit}
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-cyan-300/90 leading-tight">
                        ⚡ Obra esporádica: se guarda en este Parte Diario y aparece automáticamente en Obras y Proyectos con su legajo.
                      </p>
                    </div>
                  )}

                  {/* Categoría / Duración (mismo peso en costos y reportes) */}
                  <div className="pt-1.5 border-t border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Categoría de Obra
                      </span>
                      <span className="text-[10px] text-slate-500">Mismo peso en costos</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { value: 'ESPORADICA' as ObraDuracionCategoria, label: '⚡ Esporádica', activeCls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50' },
                        { value: 'CORTA' as ObraDuracionCategoria, label: '⏱️ Corta', activeCls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' },
                        { value: 'LARGA' as ObraDuracionCategoria, label: '🏗️ Larga', activeCls: 'bg-amber-500/20 text-amber-300 border-amber-500/50' },
                      ].map(cat => (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setCategoriaObra(cat.value)}
                          className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                            categoriaObra === cat.value
                              ? cat.activeCls
                              : 'bg-[#0F1117] text-slate-400 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

              {/* SELECCIÓN DE TIPO (Modalidad de Trabajo) */}
              <div className="bg-[#181B24]/90 border border-slate-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4" />
                    <span>Tipo de Modalidad de Trabajo *</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Seleccione cómo se liquida o mide este parte
                  </span>
                </div>

                {/* 5 Tipo Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { key: 'HORAS', label: 'Por Hora', desc: 'Trabajo medido en hs' },
                    { key: 'VIAJES', label: 'Por Viajes', desc: 'Camiones, m³ y material' },
                    { key: 'DIA', label: 'Por Día', desc: 'Jornada fija diaria' },
                    { key: 'TRABAJO', label: 'Por Trabajo', desc: 'Tarea / obra realizada' },
                    { key: 'OTRO', label: 'Otro', desc: 'Ajuste / Servicio libre' },
                  ].map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTipo(t.key as ParteTipoTrabajo)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        tipo === t.key
                          ? 'bg-amber-500 text-black border-amber-400 shadow-md font-bold'
                          : 'bg-[#0F1117] text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="block text-xs font-black uppercase">{t.label}</span>
                      <span className={`block text-[10px] mt-0.5 ${tipo === t.key ? 'text-black/80' : 'text-slate-500'}`}>
                        {t.desc}
                      </span>
                    </button>
                  ))}
                </div>

                {/* CONDICIONAL: SI ES POR HORA */}
                {tipo === 'HORAS' && (
                  <div className="p-4 bg-slate-900/80 border border-amber-500/30 rounded-xl space-y-3 animate-fadeIn">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                      <Clock className="w-4 h-4" />
                      <span>Configuración para Trabajo Por Hora</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                          Detalle del Trabajo que se Realiza *
                        </label>
                        <input
                          type="text"
                          required
                          value={detalleTipo}
                          onChange={(e) => setDetalleTipo(e.target.value)}
                          placeholder="Ej: Excavación de zanja, perfilado, nivelación de terreno..."
                          className="w-full bg-[#0F1117] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                          Horas de Trabajo *
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={hsCantidadCustom || horasTrabajadas}
                          onChange={(e) => setHsCantidadCustom(e.target.value)}
                          placeholder={String(horasTrabajadas)}
                          className="w-full bg-[#0F1117] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Auto: {horasTrabajadas.toFixed(1)} hs (desde horarios)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* CONDICIONAL: SI ES POR VIAJES (MÚLTIPLES LÍNEAS EN UN MISMO PARTE) */}
                {tipo === 'VIAJES' && (
                  <div className="p-4 bg-slate-900/80 border border-amber-500/30 rounded-xl space-y-3.5 animate-fadeIn">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-amber-400">
                      <span className="flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        <span>Camiones: Líneas de Viajes, Material, M³ y Entrega/Retiro</span>
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] bg-slate-800 text-slate-200 border border-slate-700 px-2 py-0.5 rounded font-mono">
                          {viajeLines.length} {viajeLines.length === 1 ? 'línea' : 'líneas'} · {viajeTotals.totalViajes} viajes
                        </span>
                        <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono">
                          Total: {totalM3} M³
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setViajeLines((prev) => [
                              ...prev,
                              createViajeLineaForm({
                                m3PorViaje: prev[prev.length - 1]?.m3PorViaje ?? 8,
                              }),
                            ])
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-black transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agregar línea</span>
                        </button>
                      </div>
                    </div>

                    {/* Lista de líneas de viaje */}
                    <div className="space-y-3">
                      {viajeLines.map((line, idx) => {
                        const lineM3 = Number(
                          ((Math.max(0, Number(line.viajesCantidad) || 0)) * (Math.max(0, Number(line.m3PorViaje) || 0))).toFixed(2)
                        );
                        const updateLine = (patch: Partial<ViajeLineaFormItem>) => {
                          setViajeLines((prev) =>
                            prev.map((item) => (item.id === line.id ? { ...item, ...patch } : item))
                          );
                        };
                        return (
                          <div
                            key={line.id}
                            className="p-3.5 bg-[#0F1117] border border-slate-700/80 rounded-xl space-y-3"
                          >
                            {/* Cabecera de línea */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-black">
                                  LÍNEA #{idx + 1}
                                </span>
                                <span className="text-[11px] font-mono text-slate-400">
                                  {line.viajesCantidad || 0} vjs × {line.m3PorViaje || 0} m³ ={' '}
                                  <strong className="text-purple-300">{lineM3} m³</strong>
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViajeLines((prev) => [
                                      ...prev,
                                      createViajeLineaForm({
                                        tipoMaterial: line.tipoMaterial,
                                        tipoMaterialCustom: line.tipoMaterialCustom,
                                        extraccionEntregas: line.extraccionEntregas,
                                        viajesCantidad: line.viajesCantidad,
                                        m3PorViaje: line.m3PorViaje,
                                        valorViajeEquipo: line.valorViajeEquipo,
                                        valorMaterialAparte: line.valorMaterialAparte,
                                        observacion: line.observacion,
                                      }),
                                    ])
                                  }
                                  title="Duplicar esta línea"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold transition cursor-pointer"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>Duplicar</span>
                                </button>
                                {viajeLines.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setViajeLines((prev) => prev.filter((item) => item.id !== line.id))
                                    }
                                    title="Eliminar línea"
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-bold transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Quitar</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Material y Operación */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                                  Tipo de Material *
                                </label>
                                <SearchableSelect
                                  options={MATERIAL_OPTIONS.map((mat) => ({ value: mat, label: mat }))}
                                  value={line.tipoMaterial}
                                  onChange={(val) => updateLine({ tipoMaterial: val || 'Ripio Común' })}
                                  placeholder="Buscar material..."
                                  searchPlaceholder="Escribí ripio, arena, piedra, ladrillo..."
                                  showClear={false}
                                />
                                {line.tipoMaterial === 'Otro' && (
                                  <input
                                    type="text"
                                    required
                                    placeholder="Especifique el tipo de material..."
                                    value={line.tipoMaterialCustom}
                                    onChange={(e) => updateLine({ tipoMaterialCustom: e.target.value })}
                                    className="w-full bg-[#14161D] border border-amber-500/60 rounded-xl px-3 py-1.5 text-xs text-amber-300 mt-2 focus:outline-none focus:border-amber-500"
                                  />
                                )}
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1 flex items-center gap-1.5">
                                  <ArrowRightLeft className="w-3.5 h-3.5 text-purple-400" />
                                  <span>Operación (Entrega / Retiro / Extracción) *</span>
                                </label>
                                <SearchableSelect
                                  options={[
                                    ...EXTRACCION_OPERACION_OPTIONS,
                                    ...(!EXTRACCION_OPERACION_OPTIONS.some((o) => o.value === line.extraccionEntregas) &&
                                    line.extraccionEntregas
                                      ? [{ value: line.extraccionEntregas, label: line.extraccionEntregas }]
                                      : []),
                                  ]}
                                  value={line.extraccionEntregas}
                                  onChange={(val) =>
                                    updateLine({ extraccionEntregas: val || 'Entrega de Material' })
                                  }
                                  placeholder="Tipo de operación..."
                                  searchPlaceholder="Entrega, Retiro, Extracción, Flete..."
                                  showClear={false}
                                />
                              </div>
                            </div>

                            {/* Cantidad de viajes, M3 por viaje, Subtotal M3, Tramo/Obs */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                                  Cant. Viajes *
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  required
                                  value={line.viajesCantidad}
                                  onChange={(e) =>
                                    updateLine({ viajesCantidad: parseInt(e.target.value, 10) || 0 })
                                  }
                                  className="w-full bg-[#14161D] border border-slate-700 rounded-xl px-3 py-2 text-sm text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                                  M³ por Viaje *
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  required
                                  value={line.m3PorViaje}
                                  onChange={(e) =>
                                    updateLine({ m3PorViaje: parseFloat(e.target.value) || 0 })
                                  }
                                  placeholder="Ej: 8"
                                  className="w-full bg-[#14161D] border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                                  Subtotal M³
                                </label>
                                <div className="w-full bg-purple-950/25 border border-purple-500/35 rounded-xl px-3 py-2 text-sm text-purple-300 font-mono font-black flex items-center justify-between">
                                  <span>{lineM3}</span>
                                  <span className="text-[10px] font-normal text-purple-400">m³</span>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                                  Detalle / Tramo
                                </label>
                                <input
                                  type="text"
                                  value={line.observacion}
                                  onChange={(e) => updateLine({ observacion: e.target.value })}
                                  placeholder="Ej: Cantera → Obra"
                                  className="w-full bg-[#14161D] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                                />
                              </div>
                            </div>

                            {/* Valor por línea */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                              <div>
                                <label className="block text-[11px] font-bold text-emerald-300 uppercase mb-1">
                                  Valor Viaje / Flete Equipo ($)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="100"
                                  value={line.valorViajeEquipo || ''}
                                  onChange={(e) =>
                                    updateLine({ valorViajeEquipo: parseFloat(e.target.value) || 0 })
                                  }
                                  placeholder="Ej: 75000 (Solo equipo)"
                                  className="w-full bg-[#14161D] border border-emerald-500/40 rounded-xl px-3 py-1.5 text-sm text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-400"
                                />
                              </div>
                              {separarCobranzaMaterial && (
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                                    Valor Material Aparte ($) — No suma al equipo
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="100"
                                    value={line.valorMaterialAparte || ''}
                                    onChange={(e) =>
                                      updateLine({ valorMaterialAparte: parseFloat(e.target.value) || 0 })
                                    }
                                    placeholder="Opcional (informativo)"
                                    className="w-full bg-[#14161D] border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-300 font-mono focus:outline-none focus:border-amber-500"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Botón para agregar otra línea */}
                    <button
                      type="button"
                      onClick={() =>
                        setViajeLines((prev) => [
                          ...prev,
                          createViajeLineaForm({
                            m3PorViaje: prev[prev.length - 1]?.m3PorViaje ?? 8,
                          }),
                        ])
                      }
                      className="w-full py-2.5 px-4 rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/15 text-amber-300 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Agregar otra línea de viaje (otro material, operación o cantidad)</span>
                    </button>

                    {/* Resumen Total Consolidado */}
                    <div className="p-3 bg-purple-950/20 border border-purple-500/30 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                      <span className="text-purple-300 font-bold">
                        Resumen Consolidado del Parte ({viajeLines.length} {viajeLines.length === 1 ? 'línea' : 'líneas'}):
                      </span>
                      <div className="flex flex-wrap items-center gap-3 text-white">
                        <span>
                          <strong className="text-amber-300">{viajeTotals.totalViajes}</strong> viajes totales
                        </span>
                        <span>·</span>
                        <span>
                          <strong className="text-purple-400 text-sm font-black">{totalM3} M³</strong> totales
                        </span>
                        {viajeTotals.totalValorEquipo > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-emerald-400 font-bold">
                              Flete: ${viajeTotals.totalValorEquipo.toLocaleString('es-AR')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Separación Contable: Viaje del Equipo vs Material Aparte */}
                    <div className="p-3 bg-[#0F1117] border border-emerald-500/30 rounded-xl">
                      <label className="flex items-start justify-between gap-3 cursor-pointer">
                        <div>
                          <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5" />
                            Contabilizar Solo el Viaje del Equipo (Separar Cobranza del Material)
                          </span>
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            Permite registrar entregas o retiros de distintos materiales sin mezclar el precio del árido en la facturación propia del camión.
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={separarCobranzaMaterial}
                          onChange={(e) => setSepararCobranzaMaterial(e.target.checked)}
                          className="w-4 h-4 accent-emerald-500 mt-1 cursor-pointer shrink-0"
                        />
                      </label>
                    </div>

                  </div>
                )}

                {/* CONDICIONAL: SI ES POR DIA */}
                {tipo === 'DIA' && (
                  <div className="p-4 bg-slate-900/80 border border-amber-500/30 rounded-xl space-y-3 animate-fadeIn">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                      <Calendar className="w-4 h-4" />
                      <span>Configuración para Servicio Por Día</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                          Cantidad de Días *
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={cantidadDias}
                          onChange={(e) => setCantidadDias(parseInt(e.target.value, 10) || 1)}
                          className="w-full bg-[#0F1117] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                          Detalle del Servicio por Día *
                        </label>
                        <input
                          type="text"
                          required
                          value={detalleDia}
                          onChange={(e) => setDetalleDia(e.target.value)}
                          placeholder="Ej: Jornada completa de máquina con operador..."
                          className="w-full bg-[#0F1117] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* CONDICIONAL: SI ES POR TRABAJO */}
                {tipo === 'TRABAJO' && (
                  <div className="p-4 bg-slate-900/80 border border-cyan-500/30 rounded-xl space-y-3 animate-fadeIn">
                    <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                      <Wrench className="w-4 h-4" />
                      <span>Configuración para Servicio Por Trabajo / Tarea</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                          Tipo de Trabajo Realizado *
                        </label>
                        <input
                          type="text"
                          required
                          value={detalleTipo}
                          onChange={(e) => setDetalleTipo(e.target.value)}
                          placeholder="Ej: Excavación y zanjeo, compactación de platea, limpieza de predio..."
                          className="w-full bg-[#0F1117] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                          Cantidad / Unidades
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={cantidadOtro}
                          onChange={(e) => setCantidadOtro(parseInt(e.target.value, 10) || 1)}
                          className="w-full bg-[#0F1117] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-cyan-300 font-mono font-bold focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* CONDICIONAL: SI ES OTRO */}
                {tipo === 'OTRO' && (
                  <div className="p-4 bg-slate-900/80 border border-amber-500/30 rounded-xl space-y-3 animate-fadeIn">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                      <FileText className="w-4 h-4" />
                      <span>Configuración para Otro Tipo de Servicio</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                          Detalle del Trabajo / Servicio *
                        </label>
                        <input
                          type="text"
                          required
                          value={detalleOtro}
                          onChange={(e) => setDetalleOtro(e.target.value)}
                          placeholder="Especifique el detalle del servicio realizado..."
                          className="w-full bg-[#0F1117] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                          Cantidad *
                        </label>
                        <input
                          type="number"
                          step="1"
                          required
                          value={cantidadOtro}
                          onChange={(e) => setCantidadOtro(parseInt(e.target.value, 10) || 1)}
                          className="w-full bg-[#0F1117] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* ENCARGADO DE OBRA Y ESTADO DE FIRMA */}
              <div className="bg-[#181B24]/90 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-4 h-4" />
                    <span>Encargado de Obra y Firma</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                      Encargado de Obra (Quién es el que firma) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Ing. Juan Pérez / Capataz Carlos Ramos"
                      value={encargadoObra}
                      onChange={(e) => setEncargadoObra(e.target.value)}
                      className="w-full bg-[#0F1117] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5 flex items-center justify-between">
                      <span>Estado de Firma *</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        firma === 'Firmado' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {firma === 'Firmado' ? '✓ Firmado' : '✗ No firmado'}
                      </span>
                    </label>
                    <SearchableSelect
                      options={[
                        { value: 'Firmado', label: 'Firmado' },
                        { value: 'No firmado', label: 'No firmado' },
                      ]}
                      value={firma}
                      onChange={(val) => setFirma(val || 'Firmado')}
                      placeholder="Estado de firma..."
                      searchPlaceholder="Buscar..."
                      showClear={false}
                    />
                  </div>
                </div>
              </div>

              {/* NOVEDADES */}
              <div className="bg-[#181B24]/90 border border-slate-800 rounded-xl p-4 space-y-2">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span>Novedades y Observaciones del Parte</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-sans">
                    Condiciones climáticas, fallas mecánicas, demoras, etc.
                  </span>
                </label>
                <textarea
                  rows={2}
                  value={novedades}
                  onChange={(e) => setNovedades(e.target.value)}
                  placeholder="Escriba las novedades del día..."
                  className="w-full bg-[#0F1117] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 resize-none transition"
                />
              </div>

              {/* FOTO DEL PARTE CARGADA EN DOCS */}
              <div className="bg-[#181B24]/90 border border-cyan-500/30 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-cyan-400" />
                    <span>Foto del Parte Diario (Bolsa de Documentos)</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsDocsPickerOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] border border-[#F0C800]/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Ver / Elegir de Docs ({bolsaDocumentos.length})</span>
                    </button>
                    {fotoUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setFotoUrl('');
                          setSelectedBagDocId(null);
                        }}
                        className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                        title="Quitar foto adjunta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {fotoUrl ? (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/50 border border-slate-800">
                    <img
                      src={fotoUrl}
                      alt="Foto del Parte Diario"
                      className="w-24 h-16 object-cover rounded-lg border border-slate-700 shrink-0"
                    />
                    <div className="text-xs text-slate-300 space-y-0.5 min-w-0">
                      <p className="font-bold text-emerald-400">Foto seleccionada desde Docs</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        Quedará vinculada automáticamente a este Parte Diario al guardar.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Podés buscar y adjuntar directamente una foto que ya esté cargada en <strong>Documentos (Bolsa de Documentos)</strong>.
                  </p>
                )}
              </div>

              {/* VÍNCULO CON CONTRATO DE ALQUILER Y FACTURA ARCA */}
              <div className="bg-[#181B24]/90 border border-indigo-500/30 rounded-xl p-4 space-y-3">
                <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 text-indigo-400" />
                    <span>Vincular Parte Diario a Contrato de Alquiler y/o Factura ARCA (Opcional)</span>
                  </span>
                  {(rentalId || facturaId) && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      🔗 VINCULADO
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-emerald-300 uppercase mb-1.5">
                      1° Factura ARCA Vinculada
                    </label>
                    <select
                      value={facturaId}
                      onChange={(e) => setFacturaId(e.target.value)}
                      className="w-full bg-[#0F1117] border border-emerald-500/35 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                    >
                      <option value="">-- Sin Factura ARCA (O heredar del Contrato) --</option>
                      {invoices.map(inv => (
                        <option key={inv.id} value={inv.id}>
                          {isExternalMigratedInvoice(inv) ? '[OTRO SISTEMA] ' : ''}{formatInvoiceLabel(inv)} • {inv.razonSocialReceptor || inv.receptorRazonSocial} (${Number(inv.importeTotal || inv.impTotal || 0).toLocaleString('es-AR')})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-indigo-300 uppercase mb-1.5">
                      2° Contrato de Alquiler Vinculado
                    </label>
                    <select
                      value={rentalId}
                      onChange={(e) => {
                        const nextRId = e.target.value;
                        setRentalId(nextRId);
                        if (nextRId && !facturaId) {
                          const rObj = rentals.find(r => r.id === nextRId);
                          if (rObj) {
                            const rLinks = resolveRentalContractLinks(rObj, [], invoices);
                            if (rLinks.primaryInvoice) {
                              setFacturaId(rLinks.primaryInvoice.id);
                            }
                          }
                        }
                      }}
                      className="w-full bg-[#0F1117] border border-indigo-500/35 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    >
                      <option value="">-- Sin Contrato de Alquiler --</option>
                      {rentals.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.numeroContrato || r.numero}{r.titulo ? ` · ${r.titulo}` : ''} • {r.clienteNombre} ({r.obraDestino || r.direccionObra || '-'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

            </div>
          )}

          {duplicatePartes.length > 0 && !allowDuplicateConfirm && (activeStep === 3 || duplicateSubmitBlocked) && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-500/50 text-rose-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-black text-rose-300 uppercase">
                    Número de parte duplicado: Nº {numParte.trim()}
                  </div>
                  <div className="text-[11px] text-rose-200/85">
                    Ya existe cargado ({duplicatePartes[0].fecha} · {duplicatePartes[0].obra || 'Sin obra'}). Cambiá el número o confirmá para guardar igual.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveStep(1);
                    setDuplicateSubmitBlocked(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold cursor-pointer"
                >
                  Cambiar Nº (Paso 1)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAllowDuplicateConfirm(true);
                    setDuplicateSubmitBlocked(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-[11px] font-black cursor-pointer"
                >
                  Confirmar Guardar Igual
                </button>
              </div>
            </div>
          )}

          {saveError && (
            <div className="mt-4 px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-medium">
              <strong className="text-rose-300">Error al guardar en Supabase:</strong> {saveError}
            </div>
          )}

          {/* Footer Controls / Navigation Bar */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800 mt-6">
            
            {/* Left Button */}
            {activeStep === 1 ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setActiveStep((prev) => (prev === 3 ? 2 : 1))}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Paso Anterior</span>
              </button>
            )}

            {/* Right Button: Completely separate buttons with keys to prevent DOM event bleed */}
            <div className="flex items-center gap-3">
              {activeStep < 3 ? (
                <button
                  key={`wizard-btn-next-step-${activeStep}`}
                  type="button"
                  disabled={activeStep === 1 && !canProceedStep1}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (activeStep === 1) {
                      setActiveStep(2);
                    } else if (activeStep === 2) {
                      setActiveStep(3);
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 text-black font-black text-xs rounded-xl shadow-md transition cursor-pointer"
                >
                  <span>
                    {activeStep === 1 ? 'Siguiente: Horarios (Paso 2)' : 'Siguiente: Servicio y Modalidad (Paso 3)'}
                  </span>
                  <ChevronRight className="w-4 h-4 stroke-[3]" />
                </button>
              ) : (
                <button
                  key="wizard-btn-submit-step-3"
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-60 text-black font-black text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>
                    {isSubmitting
                      ? 'Confirmando en Supabase...'
                      : parteToEdit
                        ? 'Guardar Cambios'
                        : 'Registrar Parte Diario'}
                  </span>
                </button>
              )}
            </div>

          </div>

        </form>
      </div>

      <BolsaDocumentosPickerModal
        isOpen={isDocsPickerOpen}
        onClose={() => setIsDocsPickerOpen(false)}
        documents={bolsaDocumentos}
        defaultCategory="PARTE_DIARIO"
        selectedUrl={fotoUrl}
        title="Elegir Foto de Parte Diario desde Docs"
        onSelect={(doc) => {
          setFotoUrl(doc.url);
          setSelectedBagDocId(doc.id);
        }}
      />
    </div>
  );
};
