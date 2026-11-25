import React, { useState, useEffect, useMemo } from 'react';
import { FuelDispensary, FuelVoucherStatus, Vehicle, Employee, FuelDeposit, IssuedFuelVoucher, DocumentBagItem, Obra } from '../types';
import { SearchableSelect } from './SearchableSelect';
import { formatCurrency, loadFuelPrices, saveFuelPrice, getLatestFuelPrice, parseOdometerValue } from '../services/storage';
import { formatPersonName } from '../utils/formatName';
import { uploadImageToCloudflareR2 } from '../services/api';
import { ImageClipboardDropzone } from './common/ImageClipboardDropzone';
import { BolsaDocumentosPickerModal } from './common/BolsaDocumentosPickerModal';
import { useClipboardImagePaste } from '../hooks/useClipboardImagePaste';
import { 
  X, 
  Fuel, 
  Truck, 
  User, 
  MapPin, 
  Calendar, 
  Clock, 
  FileText, 
  Gauge, 
  Check, 
  Camera, 
  Image as ImageIcon,
  Hash,
  CheckCircle2,
  Ticket,
  AlertCircle,
  RotateCcw,
  Clipboard,
  Lock,
  Unlock,
  Layers,
  Sparkles,
  Building2
} from 'lucide-react';

interface FuelVoucherFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (voucher: FuelDispensary) => void;
  voucherToEdit?: FuelDispensary | null;
  aiPrefillDraft?: Partial<FuelDispensary> | null;
  existingCount: number;
  existingVouchers?: FuelDispensary[];
  fleet: Vehicle[];
  employees: Employee[];
  deposits?: FuelDeposit[];
  obras?: Obra[];
  preselectedDeposit?: FuelDeposit | null;
  issuedVouchers?: IssuedFuelVoucher[];
  initialSelectedVoucherId?: string | null;
  bolsaDocumentos?: DocumentBagItem[];
  onLinkBolsaDocument?: (docId: string, targetId: string, targetLabel: string) => void;
}

export const COMPANY_FUEL_CATALOG: { name: string; id: string; price: number }[] = [
  { name: 'DIESEL COMUN', id: 'COMB-D500', price: 2509 },
  { name: 'DIESEL INFINIA', id: 'COMB-INFD', price: 2583 },
  { name: 'NAFTA SUPER', id: 'COMB-SUPER', price: 2239 },
  { name: 'NAFTA INFINIA', id: 'COMB-INFIN', price: 2405 }
];

const CUSTOM_FUEL_SENTINEL = '__OTRO__';
const OTHER_FUEL_PRESETS = [
  'UREA / ADBLUE',
  'ACEITE MOTOR',
  'ACEITE HIDRAULICO',
  'GRASA',
  'REFRIGERANTE',
  'OTRO'
];

const isCustomOtherProduct = (name?: string, idComb?: string): boolean => {
  if (idComb === 'COMB-OTRO') return true;
  if (!name) return false;
  const up = name.toUpperCase().trim();
  if (!up) return false;
  if (
    up.includes('UREA') ||
    up.includes('ADBLUE') ||
    up.includes('ACEITE') ||
    up.includes('GRASA') ||
    up.includes('LUBRICANTE') ||
    up.includes('REFRIGERANTE') ||
    up === 'OTRO' ||
    up.startsWith('OTRO:') ||
    up.startsWith('OTRO -')
  ) {
    return true;
  }
  const catalogNames = new Set([
    ...COMPANY_FUEL_CATALOG.map(c => c.name.toUpperCase()),
    ...Object.keys(loadFuelPrices()).map(k => k.toUpperCase())
  ]);
  return !catalogNames.has(up);
};

const COMMON_CARGAS = [
  'Completa (Tanque Lleno)',
  'Carga Parcial'
];

const EMPTY_VOUCHERS: FuelDispensary[] = [];
const EMPTY_DEPOSITS: FuelDeposit[] = [];
const EMPTY_ISSUED_VOUCHERS: IssuedFuelVoucher[] = [];
const EMPTY_OBRAS: Obra[] = [];

export const FuelVoucherFormModal: React.FC<FuelVoucherFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  voucherToEdit,
  aiPrefillDraft = null,
  existingCount,
  existingVouchers = EMPTY_VOUCHERS,
  fleet,
  employees,
  deposits = EMPTY_DEPOSITS,
  obras = EMPTY_OBRAS,
  preselectedDeposit = null,
  issuedVouchers = EMPTY_ISSUED_VOUCHERS,
  initialSelectedVoucherId = null,
  bolsaDocumentos = [],
  onLinkBolsaDocument,
}) => {
  const [formData, setFormData] = useState<Partial<FuelDispensary>>({
    id: '',
    carga: 'Completa (Tanque Lleno)',
    tipo: 'Estación de Servicio',
    idCombustible: 'COMB-D500',
    deposito: '',
    cantidad: 100,
    tipoComb: 'DIESEL COMUN',
    codigoEmpleado: '',
    nombreApellido: '',
    legajo: '',
    codigoEquipo: '',
    marcaModelo: '',
    patente: '',
    numOrden: '',
    fecha: new Date().toISOString().slice(0, 10),
    kilometraje: 0,
    hora: new Date().toTimeString().slice(0, 5),
    kilometrosRec: 0,
    autonom: '',
    numEstacion: '',
    fotoExpendio: '',
    fotoKilometraje: '',
    estado: 'RENDIDO',
    precioUnitario: 1200,
    totalImporte: 120000,
    observaciones: '',
    valeId: '',
    numVale: '',
    numTicket: '',
    litrosAutorizados: 100,
    diferenciaLitros: 0,
    obraId: '',
    obraNombre: ''
  });

  const [selectedVoucherId, setSelectedVoucherId] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedDepositId, setSelectedDepositId] = useState<string>('');
  const [selectedObraId, setSelectedObraId] = useState<string>('');
  const [isCustomFuel, setIsCustomFuel] = useState<boolean>(false);
  const [customFuelDetail, setCustomFuelDetail] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'datos' | 'fotos'>('datos');
  const [isValeDataUnlocked, setIsValeDataUnlocked] = useState<boolean>(false);
  const [cargaOrigin, setCargaOrigin] = useState<'ESTACION' | 'DEPOSITO_PROPIO'>('ESTACION');
  const [uploadingPhotoField, setUploadingPhotoField] = useState<'fotoExpendio' | 'fotoKilometraje' | null>(null);
  const [r2Error, setR2Error] = useState<string | null>(null);
  const [docsPickerTarget, setDocsPickerTarget] = useState<'fotoExpendio' | 'fotoKilometraje' | null>(null);
  const [selectedBagDocsMap, setSelectedBagDocsMap] = useState<{ fotoExpendio?: string; fotoKilometraje?: string }>({});

  const [rawQuantity, setRawQuantity] = useState<string>(formData.cantidad !== undefined ? String(formData.cantidad) : '100');
  const [rawPrice, setRawPrice] = useState<string>(formData.precioUnitario !== undefined ? String(formData.precioUnitario) : '1200');
  const [rawKilometraje, setRawKilometraje] = useState<string>(formData.kilometraje ? String(formData.kilometraje) : '');

  const isValeLinked = cargaOrigin === 'ESTACION' && Boolean(formData.valeId || selectedVoucherId);
  const isLocked = isValeLinked && !isValeDataUnlocked;

  // Determine if target equipment is a mobile cistern / diesel deposit (excluding regular vehicles/pickup trucks like Nissan/Hilux)
  const targetDeposit = useMemo(() => {
    if (!deposits || deposits.length === 0) return null;
    const plate = (formData.patente || '').toLowerCase().trim();
    const code = (formData.codigoEquipo || '').toLowerCase().trim();
    const model = (formData.marcaModelo || '').toLowerCase().trim();
    const combined = `${code} ${model}`.toLowerCase();
    
    // If it's a regular vehicle/pickup truck like Nissan or Hilux, it's NEVER a cistern deposit!
    if (combined.includes('nissan') || combined.includes('hilux') || combined.includes('toyota') || combined.includes('ford') || combined.includes('camioneta') || combined.includes('auto') || combined.includes('utilitario')) {
      return null;
    }
    
    return deposits.find(d => {
      if (d.modalidad === 'VALES_ESTACION') return false;
      if (plate && d.patenteVehiculo && d.patenteVehiculo.toLowerCase().trim() === plate) return true;
      if (code && d.codigo && d.codigo.toLowerCase().trim() === code) return true;
      if (code && d.id && d.id.toLowerCase().trim() === code) return true;
      if (model && d.nombre && d.nombre.toLowerCase().trim() === model) return true;
      if (model && d.nombre && (d.nombre.toLowerCase().includes(model) || model.includes(d.nombre.toLowerCase()))) return true;
      return false;
    }) || null;
  }, [deposits, formData.patente, formData.codigoEquipo, formData.marcaModelo]);

  // Check if target equipment is a cistern or deposit (which doesn't have an odometer)
  const isCisternaODeposito = useMemo(() => {
    if (targetDeposit) return true;
    const combined = `${formData.codigoEquipo || ''} ${formData.marcaModelo || ''} ${formData.patente || ''}`.toLowerCase();
    // Regular vehicles/pickup trucks must NOT be treated as cisterns
    if (combined.includes('nissan') || combined.includes('hilux') || combined.includes('toyota') || combined.includes('ford') || combined.includes('camioneta') || combined.includes('auto') || combined.includes('utilitario')) {
      return false;
    }
    return (
      combined.includes('cisterna') ||
      combined.includes('depos.') ||
      combined.includes('deposito') ||
      combined.includes('tanque') ||
      combined.includes('bidon') ||
      combined.includes('pañol') ||
      (formData.carga || '').toLowerCase().includes('bidon')
    );
  }, [targetDeposit, formData.codigoEquipo, formData.marcaModelo, formData.patente, formData.carga]);

  // Determine matched vehicle in fleet
  const targetVehicle = useMemo(() => {
    if (!fleet || fleet.length === 0) return null;
    if (selectedVehicleId) {
      const v = fleet.find(item => item.id === selectedVehicleId);
      if (v) return v;
    }
    const plate = (formData.patente || '').toLowerCase().trim();
    const code = (formData.codigoEquipo || '').toLowerCase().trim();
    return fleet.find(v => {
      if (plate && v.patente && v.patente.toLowerCase().trim() === plate) return true;
      if (code && v.codigoEquipo && v.codigoEquipo.toLowerCase().trim() === code) return true;
      if (code && v.codigoInterno && v.codigoInterno.toLowerCase().trim() === code) return true;
      if (code && v.id && v.id.toLowerCase().trim() === code) return true;
      return false;
    }) || null;
  }, [fleet, selectedVehicleId, formData.patente, formData.codigoEquipo]);

  // Helper for clean string matching
  const cleanStr = (s?: string) => s?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || '';

  // Currently matched deposit object from deposits list (dispensing channel)
  const currentDepositObj = useMemo(() => {
    if (selectedDepositId === 'OTRA_ESTACION') return null;

    const targetDepId = targetDeposit?.id;

    return (deposits || []).find(d => {
      // The equipment receiving fuel can NEVER be the dispensing channel!
      if (targetDepId && d.id === targetDepId) return false;

      return (
        d.id === selectedDepositId || 
        (formData.depositoId && d.id === formData.depositoId) ||
        (formData.deposito && d.nombre.toLowerCase().trim() === formData.deposito.toLowerCase().trim())
      );
    }) || null;
  }, [deposits, selectedDepositId, formData.depositoId, formData.deposito, targetDeposit]);

  const getDepositStock = (d?: FuelDeposit | null): number => {
    if (!d) return 0;
    return d.stockActual ?? 0;
  };

  const effectiveDepositStock = useMemo(() => {
    return getDepositStock(currentDepositObj);
  }, [currentDepositObj]);

  // Protection: When the destination receiving equipment is a cistern/deposit (e.g. DEPOS.AMARILLO),
  // ensure the dispensing channel is NEVER set to that cistern itself!
  useEffect(() => {
    if (targetDeposit && (selectedDepositId === targetDeposit.id || formData.depositoId === targetDeposit.id || formData.deposito === targetDeposit.nombre)) {
      const station = (deposits || []).find(d => d.modalidad === 'VALES_ESTACION');
      if (station) {
        setSelectedDepositId(station.id);
        setFormData(prev => ({
          ...prev,
          deposito: station.nombre,
          depositoId: station.id,
          tipo: 'Estación de Servicio',
          numEstacion: station.numEstacionConvenio || prev.numEstacion || 'EST-CONVENIO'
        }));
      } else {
        setSelectedDepositId('OTRA_ESTACION');
        setFormData(prev => ({
          ...prev,
          deposito: formData.deposito && formData.deposito !== targetDeposit.nombre ? formData.deposito : 'Estación de Servicio Externa',
          depositoId: undefined,
          tipo: 'Estación de Servicio',
          numEstacion: 'EST-EXTERNA'
        }));
      }
    }
  }, [targetDeposit, selectedDepositId, formData.depositoId, formData.deposito, deposits]);

  // Helper to normalize any fuel text to standard company catalog fuel names
  const normalizeFuelName = (raw?: string): string => {
    if (!raw) return '';
    const up = raw.toUpperCase().trim();
    if (
      up.includes('UREA') ||
      up.includes('ADBLUE') ||
      up.includes('ACEITE') ||
      up.includes('GRASA') ||
      up.includes('LUBRICANTE') ||
      up.includes('REFRIGERANTE') ||
      up === 'OTRO' ||
      up.startsWith('OTRO:') ||
      up.startsWith('OTRO -')
    ) {
      return up;
    }
    if (up.includes('INFINIA') && (up.includes('DIESEL') || up.includes('D-') || up.includes('GRADO 3'))) {
      return 'DIESEL INFINIA';
    }
    if (up.includes('EURO') || (up.includes('DIESEL') && up.includes('PREMIUM'))) {
      return 'DIESEL INFINIA';
    }
    if (up.includes('500') || (up.includes('DIESEL') && !up.includes('INFINIA') && !up.includes('EURO'))) {
      return 'DIESEL COMUN';
    }
    if (up.includes('NAFTA') && (up.includes('INFINIA') || up.includes('PREMIUM') || up.includes('GRADO 3'))) {
      return 'NAFTA INFINIA';
    }
    if (up.includes('NAFTA') || up.includes('SUPER') || up.includes('SÚPER')) {
      return 'NAFTA SUPER';
    }
    return up;
  };

  // Extract and normalize the fuels that the dispensing deposit physically holds in stock AT THIS MOMENT
  const depositStockFuels = useMemo<string[]>(() => {
    if (!currentDepositObj) return [];
    
    // External service stations are commercial stations with full fuel pumps
    if (currentDepositObj.modalidad === 'VALES_ESTACION') {
      if (currentDepositObj.tiposCombustibles && currentDepositObj.tiposCombustibles.length > 0) {
        return Array.from(new Set(currentDepositObj.tiposCombustibles.map(normalizeFuelName).filter(Boolean)));
      }
      return [];
    }

    // INTERNAL CISTERNS (DEPOSITO_AMBULANTE) & BIDONES:
    // A physical tank holds a specific fuel in stock (e.g. 119.42 Lts of Diesel).
    const fullText = `${currentDepositObj.nombre || ''} ${currentDepositObj.tipoCombustible || ''} ${currentDepositObj.codigo || ''}`.toUpperCase();
    const isDieselTank = fullText.includes('DIESEL') || fullText.includes('500') || fullText.includes('AMARILLO') || currentDepositObj.modalidad === 'DEPOSITO_AMBULANTE';
    const isNaftaTank = fullText.includes('NAFTA') && !fullText.includes('DIESEL');

    // 1. Primary physical fuel designated in this deposit (e.g. "Diesel 500 (Grado 2)", "DIESEL COMUN", "Infinia Diesel")
    const primaryRaw = (currentDepositObj.tipoCombustible || '').trim();
    const primaryParts = primaryRaw.split(/[\/,;]/).map(s => s.trim()).filter(Boolean);
    const normalizedPrimary = primaryParts.map(normalizeFuelName).filter(Boolean);

    // 2. Candidate list
    let candidates: string[] = [];
    if (normalizedPrimary.length > 0) {
      candidates = normalizedPrimary;
    } else if (currentDepositObj.tiposCombustibles && currentDepositObj.tiposCombustibles.length > 0) {
      candidates = currentDepositObj.tiposCombustibles.map(normalizeFuelName).filter(Boolean);
    }

    // 3. Strict physical tank filtering: A diesel cistern CANNOT have Nafta, a nafta tank CANNOT have Diesel
    if (isDieselTank && !isNaftaTank) {
      const dieselOnly = candidates.filter(f => f.toUpperCase().includes('DIESEL'));
      if (dieselOnly.length > 0) return Array.from(new Set(dieselOnly));
      return ['DIESEL COMUN'];
    }

    if (isNaftaTank && !isDieselTank) {
      const naftaOnly = candidates.filter(f => f.toUpperCase().includes('NAFTA'));
      if (naftaOnly.length > 0) return Array.from(new Set(naftaOnly));
      return ['NAFTA SUPER'];
    }

    if (candidates.length > 0) {
      return Array.from(new Set(candidates));
    }

    return ['DIESEL COMUN'];
  }, [currentDepositObj]);

  // Detect whether equipment is strictly Diesel, strictly Nafta, or General
  const targetFuelType = useMemo<'diesel' | 'nafta' | 'all'>(() => {
    if (targetDeposit) {
      const depText = `${targetDeposit.nombre || ''} ${targetDeposit.tipoCombustible || ''} ${(targetDeposit.tiposCombustibles || []).join(' ')}`.toLowerCase();
      if (depText.includes('nafta') && !depText.includes('diesel')) return 'nafta';
      return 'diesel'; // Cisterns, ambulantes, tanques móviles are diesel
    }
    if (targetVehicle) {
      if (targetVehicle.combustible?.toLowerCase() === 'nafta') return 'nafta';
      return 'diesel';
    }
    const combined = `${formData.codigoEquipo || ''} ${formData.marcaModelo || ''} ${formData.patente || ''}`.toLowerCase();
    if (combined.includes('nafta') && !combined.includes('diesel')) return 'nafta';
    if (combined.includes('diesel') || combined.includes('depos') || combined.includes('cisterna') || combined.includes('camion') || combined.includes('nissan')) {
      return 'diesel';
    }
    return 'all';
  }, [targetDeposit, targetVehicle, formData.codigoEquipo, formData.marcaModelo, formData.patente]);

  // Derive ONLY real fuels loaded in company catalog compatible with the dispensing deposit AND target equipment
  const eligibleFuels = useMemo(() => {
    const catalog = loadFuelPrices();
    const all = Object.entries(catalog)
      .filter(([name]) => name && !name.includes('/'))
      .map(([name, price]) => ({
        name,
        id: `COMB-${name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`,
        price: getLatestFuelPrice(name, existingVouchers) || price
      }));

    const safeCatalog = all.length > 0 ? all : COMPANY_FUEL_CATALOG.map(f => ({ ...f, price: getLatestFuelPrice(f.name, existingVouchers) }));

    // 1. REGLA FUNDAMENTAL: Si el despacho se realiza desde una cisterna o depósito interno,
    // SOLO se puede despachar el combustible que dicha cisterna tiene físicamente en stock ingresado (sin opciones extra)
    if (cargaOrigin === 'DEPOSITO_PROPIO' || (currentDepositObj && (currentDepositObj.modalidad === 'DEPOSITO_AMBULANTE' || currentDepositObj.modalidad === 'BIDONES'))) {
      const singleFuelName = depositStockFuels.length > 0 
        ? depositStockFuels[0] 
        : (currentDepositObj?.tipoCombustible ? normalizeFuelName(currentDepositObj.tipoCombustible) : 'DIESEL COMUN');
      const found = safeCatalog.find(f => f.name.toUpperCase() === singleFuelName.toUpperCase());
      const depositPrice = currentDepositObj?.costoPorLitroEstimado || (found ? found.price : getLatestFuelPrice(singleFuelName, existingVouchers));
      return [{
        name: singleFuelName,
        id: found ? found.id : 'COMB-D500',
        price: depositPrice
      }];
    }

    let pool = safeCatalog;
    // Si la estación de servicio comercial tiene tipos de combustible habilitados en su ficha, filtrar para mostrar esos
    if (depositStockFuels.length > 0) {
      const fromDeposit = safeCatalog.filter(f => 
        depositStockFuels.some(df => df.toUpperCase() === f.name.toUpperCase())
      );
      if (fromDeposit.length > 0) {
        pool = fromDeposit;
      }
    }

    // SI HAY UN VALE VINCULADO O UN COMBUSTIBLE ACTUAL SELECCIONADO (ej: DIESEL COMUN del vale),
    // garantizar que ese combustible SIEMPRE forme parte de las opciones elegibles para no perder la información del vale
    const currentNormFuel = normalizeFuelName(formData.tipoComb);
    if (currentNormFuel) {
      const inPool = pool.some(f => f.name.toUpperCase() === currentNormFuel.toUpperCase());
      if (!inPool) {
        const catalogItem = safeCatalog.find(f => f.name.toUpperCase() === currentNormFuel.toUpperCase()) || {
          name: currentNormFuel,
          id: `COMB-${currentNormFuel.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}`,
          price: formData.precioUnitario || getLatestFuelPrice(currentNormFuel, existingVouchers)
        };
        pool = [catalogItem, ...pool];
      }
    }

    // Retornar todas las opciones habilitadas para la estación comercial sin filtrar por tipo de equipo
    return pool;
  }, [cargaOrigin, currentDepositObj, depositStockFuels, formData.tipoComb, formData.precioUnitario, existingVouchers]);

  // Auto-correct incompatible fuel (e.g. if Nafta was mistakenly set on a Diesel cistern)
  useEffect(() => {
    if (isCustomFuel || formData.idCombustible === 'COMB-OTRO') return;
    if (eligibleFuels.length === 0) return;
    const currentName = (formData.tipoComb || '').trim().toUpperCase();
    const matches = eligibleFuels.some(f => f.name.toUpperCase() === currentName);
    if (!matches) {
      const fallback = eligibleFuels[0];
      setFormData(prev => {
        const price = fallback.price;
        const total = Number(((prev.cantidad || 0) * price).toFixed(2));
        return {
          ...prev,
          tipoComb: fallback.name,
          idCombustible: fallback.id,
          precioUnitario: price,
          totalImporte: total
        };
      });
      setRawPrice(fallback.price.toString());
    }
  }, [eligibleFuels, formData.tipoComb, isCustomFuel, formData.idCombustible]);

  const obraOptions = useMemo(() => {
    const list = (obras || []).map(o => ({
      value: o.id,
      label: o.nombreObra || o.numero || o.id,
      secondaryText: [o.numero, o.pertenece, o.ubicacion].filter(Boolean).join(' • ') || undefined,
      extraSearchTerms: `${o.numero || ''} ${o.pertenece || ''} ${o.ubicacion || ''} ${o.activa ? 'activa' : 'inactiva'}`
    }));
    if (selectedObraId && !list.some(item => item.value === selectedObraId) && formData.obraNombre) {
      list.unshift({
        value: selectedObraId,
        label: formData.obraNombre,
        secondaryText: 'Obra asignada previamente',
        extraSearchTerms: formData.obraNombre
      });
    }
    return list;
  }, [obras, selectedObraId, formData.obraNombre]);

  // Filter list of unrendered vouchers (or current linked voucher if editing)
  const pendingVouchers = useMemo(() => {
    return issuedVouchers.filter(v => v.estado === 'EMITIDO' || v.id === formData.valeId || (voucherToEdit && v.id === voucherToEdit.valeId));
  }, [issuedVouchers, formData.valeId, voucherToEdit]);

  // Options for SearchableSelect: Vales Emitidos Sin Rendir
  const pendingVoucherOptions = useMemo(() => {
    return pendingVouchers.map(v => {
      const brandModel = v.marcaModelo || v.codigoEquipo || 'Equipo';
      const plate = v.patente ? ` [${v.patente.trim()}]` : '';
      const label = `Vale Nº ${v.numVale} — ${brandModel}${plate}`;
      const secondaryText = `Chofer: ${v.nombreApellido || 'S/D'} • Estación: ${v.estacionSurtidor || 'S/E'} • Cupo: ${v.litrosAutorizados || 0} Lts (${v.tipoComb || 'Diesel'})`;
      const extraSearchTerms = `${v.numVale || ''} ${v.numComprobante || ''} ${v.codigoEquipo || ''} ${v.marcaModelo || ''} ${v.patente || ''} ${v.nombreApellido || ''} ${v.estacionSurtidor || ''} ${v.tipoComb || ''}`;

      return {
        value: v.id,
        label,
        secondaryText,
        extraSearchTerms
      };
    });
  }, [pendingVouchers]);

  // Options for SearchableSelect: Equipos de Flota (strictly: Marca Modelo - Patente)
  const vehicleOptions = useMemo(() => {
    const list = fleet.map(veh => {
      const brandModel = veh.modeloMarca || [veh.marca, veh.modelo].filter(Boolean).join(' ') || veh.codigoInterno || (veh as any).codigoEquipo || 'Equipo';
      const licensePlate = veh.patente ? veh.patente.trim() : 'S/P';
      const label = `${brandModel} - ${licensePlate}`;

      return {
        value: veh.id,
        label,
        extraSearchTerms: `${veh.codigoInterno || ''} ${(veh as any).codigoEquipo || ''} ${veh.clasificacion || ''} ${veh.combustible || ''}`
      };
    });

    // If ticket loaded a vehicle that isn't directly in fleet by ID, ensure it is an available option
    if (selectedVehicleId && selectedVehicleId.startsWith('ticket-veh-') && (formData.marcaModelo || formData.patente)) {
      list.unshift({
        value: selectedVehicleId,
        label: `${formData.marcaModelo || formData.codigoEquipo || 'Equipo del Vale'} - ${formData.patente || 'S/P'}`,
        extraSearchTerms: `${formData.codigoEquipo || ''} ${formData.patente || ''}`
      });
    }

    return list;
  }, [fleet, selectedVehicleId, formData.marcaModelo, formData.patente, formData.codigoEquipo]);

  // Options for SearchableSelect: Choferes / Operadores (strictly: Nombre y Apellido)
  const employeeOptions = useMemo(() => {
    const list = employees.map(emp => {
      return {
        value: emp.id,
        label: emp.nombreApellido || `${emp.codigoEmpleado || 'Empleado'}`,
        extraSearchTerms: `${emp.codigoEmpleado || ''} ${emp.legajo || ''} ${emp.dni || ''} ${emp.categoria || ''}`
      };
    });

    // If ticket loaded an employee that isn't directly in employees by ID, ensure it is an available option
    if (selectedEmployeeId && selectedEmployeeId.startsWith('ticket-emp-') && formData.nombreApellido) {
      list.unshift({
        value: selectedEmployeeId,
        label: `${formData.nombreApellido} [${formData.codigoEmpleado || formData.legajo || 'Chofer'}]`,
        extraSearchTerms: `${formData.codigoEmpleado || ''} ${formData.legajo || ''}`
      });
    }

    return list;
  }, [employees, selectedEmployeeId, formData.nombreApellido, formData.codigoEmpleado, formData.legajo]);

  // Find previous dispensary / odometer for the selected vehicle
  const previousDispensaryInfo = useMemo(() => {
    const vehCode = formData.codigoEquipo;
    const plate = formData.patente;
    const currentVehId = selectedVehicleId;

    if (!vehCode && !plate && !currentVehId) return null;

    // Filter existing dispensaries for this vehicle, excluding the current voucher being edited
    const vehicleDispensaries = (existingVouchers || []).filter(v => {
      if (voucherToEdit && v.id === voucherToEdit.id) return false;
      const matchCode = Boolean(vehCode && v.codigoEquipo && v.codigoEquipo.trim().toUpperCase() === vehCode.trim().toUpperCase());
      const matchPlate = Boolean(plate && v.patente && v.patente.trim().toUpperCase() === plate.trim().toUpperCase());
      return matchCode || matchPlate;
    });

    // Sort by date desc, then hora desc, then id desc
    vehicleDispensaries.sort((a, b) => {
      const dateComp = (b.fecha || '').localeCompare(a.fecha || '');
      if (dateComp !== 0) return dateComp;
      const timeComp = (b.hora || '').localeCompare(a.hora || '');
      if (timeComp !== 0) return timeComp;
      return (b.id || '').localeCompare(a.id || '');
    });

    const lastDispensary = vehicleDispensaries.find(v => parseOdometerValue(v.kilometraje ?? v.kmsHs) > 0);
    if (lastDispensary && parseOdometerValue(lastDispensary.kilometraje ?? lastDispensary.kmsHs) > 0) {
      return {
        odometer: parseOdometerValue(lastDispensary.kilometraje ?? lastDispensary.kmsHs),
        fecha: lastDispensary.fecha,
        hora: lastDispensary.hora,
        litros: lastDispensary.cantidad,
        id: lastDispensary.id,
        source: 'Carga anterior registrada'
      };
    }

    // Fallback: Check if linked issued voucher has an odometroSalida
    if (formData.valeId) {
      const linkedVoucher = (issuedVouchers || []).find(iv => iv.id === formData.valeId);
      if (linkedVoucher && parseOdometerValue(linkedVoucher.odometroSalida) > 0) {
        return {
          odometer: parseOdometerValue(linkedVoucher.odometroSalida),
          fecha: linkedVoucher.fechaEmision,
          hora: linkedVoucher.horaEmision,
          litros: linkedVoucher.litrosAutorizados,
          id: `Vale Nº ${linkedVoucher.numVale}`,
          source: 'Odómetro al emitir vale'
        };
      }
    }

    // Fallback: Vehicle's current horometro/odometer in fleet
    const matchedVeh = fleet.find(f => 
      (vehCode && f.codigoEquipo === vehCode) || 
      (plate && f.patente === plate) || 
      f.id === currentVehId
    );
    if (matchedVeh && parseOdometerValue(matchedVeh.horometro) > 0) {
      return {
        odometer: parseOdometerValue(matchedVeh.horometro),
        fecha: undefined,
        hora: undefined,
        litros: undefined,
        id: matchedVeh.codigoEquipo,
        source: 'Odómetro inicial de flota'
      };
    }

    return null;
  }, [existingVouchers, voucherToEdit, formData.codigoEquipo, formData.patente, selectedVehicleId, formData.valeId, issuedVouchers, fleet]);

  // Automatic calculation of Distance Traveled (kmRecorridos) and Autonomy (autonom)
  const calculationResult = useMemo(() => {
    const kmAnterior = parseOdometerValue(previousDispensaryInfo?.odometer);
    const kmActual = parseOdometerValue(formData.kilometraje);
    const litros = Number(formData.cantidad) || 0;

    let kmRec = 0;
    if (kmActual > 0 && kmAnterior > 0) {
      if (kmActual >= kmAnterior) {
        kmRec = Number((kmActual - kmAnterior).toFixed(2));
      } else {
        kmRec = 0;
      }
    }

    let autonomia = '';
    let kmPerLiter = 0;
    let litersPer100 = 0;

    if (kmRec > 0 && litros > 0) {
      kmPerLiter = parseFloat((kmRec / litros).toFixed(2));
      litersPer100 = parseFloat(((litros / kmRec) * 100).toFixed(1));
      autonomia = `${kmPerLiter} km/L (${litersPer100} L/100km)`;
    } else if (kmActual > 0 && kmAnterior === 0) {
      autonomia = 'Primer odómetro registrado';
    } else if (kmActual === 0) {
      autonomia = 'Ingrese odómetro del ticket';
    } else {
      autonomia = '-';
    }

    return {
      kmAnterior,
      kmActual,
      kmRec,
      litros,
      kmPerLiter,
      litersPer100,
      autonomia
    };
  }, [previousDispensaryInfo, formData.kilometraje, formData.cantidad]);

  // Sync calculation result into state for consistency
  useEffect(() => {
    setFormData(prev => {
      if (prev.kilometrosRec === calculationResult.kmRec && prev.autonom === calculationResult.autonomia) {
        return prev;
      }
      return {
        ...prev,
        kilometrosRec: calculationResult.kmRec,
        autonom: calculationResult.autonomia
      };
    });
  }, [calculationResult.kmRec, calculationResult.autonomia]);

  // Handle Initial Voucher selection or Deposit Preselection
  useEffect(() => {
    if (!isOpen) return;
    setIsValeDataUnlocked(false);
    if (voucherToEdit) {
      const isTargetCisterna = (cleanStr(voucherToEdit.codigoEquipo) + ' ' + cleanStr(voucherToEdit.marcaModelo) + ' ' + cleanStr(voucherToEdit.id)).includes('amarillo') ||
        (cleanStr(voucherToEdit.codigoEquipo) + ' ' + cleanStr(voucherToEdit.marcaModelo)).includes('bidon') ||
        cleanStr(voucherToEdit.id).includes('exp-354');
      const normalizedTipo = (voucherToEdit.tipo === 'INGRESO' || voucherToEdit.tipo === 'EGRESO')
        ? voucherToEdit.tipo
        : (isTargetCisterna ? 'INGRESO' : 'EGRESO');

      const editQty = voucherToEdit.cantCarga !== undefined ? Math.abs(voucherToEdit.cantCarga) : (voucherToEdit.cantidad ?? 100);
      const editPrice = voucherToEdit.precioUnitario ?? 2509;
      const editTotal = voucherToEdit.totalImporte ?? Number((editQty * editPrice).toFixed(2));

      const editTipoComb = voucherToEdit.tipoComb || voucherToEdit.combustible || 'DIESEL COMUN';
      const editIsOther = isCustomOtherProduct(editTipoComb, voucherToEdit.idCombustible);
      setIsCustomFuel(editIsOther);
      setCustomFuelDetail(editIsOther ? editTipoComb : '');

      const matchedEditObra = (obras || []).find(
        o =>
          (voucherToEdit.obraId && o.id === voucherToEdit.obraId) ||
          (voucherToEdit.obraNombre && o.nombreObra?.toLowerCase().trim() === voucherToEdit.obraNombre.toLowerCase().trim())
      );
      setSelectedObraId(matchedEditObra?.id || voucherToEdit.obraId || '');

      setFormData({
        ...voucherToEdit,
        cantidad: editQty,
        precioUnitario: editPrice,
        totalImporte: editTotal,
        carga: voucherToEdit.carga || voucherToEdit.tipoCarga || 'Completa (Tanque Lleno)',
        tipo: normalizedTipo,
        idCombustible: editIsOther ? 'COMB-OTRO' : (voucherToEdit.idCombustible || 'COMB-D500'),
        deposito: voucherToEdit.deposito || voucherToEdit.numEstacion || '',
        tipoComb: editTipoComb,
        fecha: voucherToEdit.fecha || voucherToEdit.fechaEmision || new Date().toISOString().slice(0, 10),
        hora: voucherToEdit.hora || voucherToEdit.horaEmision || new Date().toTimeString().slice(0, 5),
        kilometraje: voucherToEdit.kilometraje ?? (voucherToEdit.horometroOdometro ?? 0),
        kilometrosRec: voucherToEdit.kilometrosRec ?? 0,
        autonom: voucherToEdit.autonom || '',
        numOrden: voucherToEdit.numOrden || voucherToEdit.numComprobante || '',
        numVale: voucherToEdit.numVale || '',
        numTicket: voucherToEdit.numTicket || '',
        fotoExpendio: voucherToEdit.fotoExpendio || '',
        fotoKilometraje: voucherToEdit.fotoKilometraje || '',
        estado: voucherToEdit.estado || 'RENDIDO',
        obraId: matchedEditObra?.id || voucherToEdit.obraId || '',
        obraNombre: matchedEditObra?.nombreObra || voucherToEdit.obraNombre || ''
      });

      setRawQuantity(editQty.toString());
      setRawPrice(editPrice.toString());
      const editKmVal = voucherToEdit.kilometraje ?? (voucherToEdit.horometroOdometro ?? 0);
      setRawKilometraje(editKmVal ? String(editKmVal) : '');

      if (voucherToEdit.valeId) {
        setSelectedVoucherId(voucherToEdit.valeId);
      } else {
        setSelectedVoucherId('');
      }

      const vPlate = cleanStr(voucherToEdit.patente);
      const vCode = cleanStr(voucherToEdit.codigoEquipo);
      const vModel = cleanStr(voucherToEdit.marcaModelo);

      // Prioritize exact internal code or equipment code match over generic plate match
      const matchedVeh = fleet.find(f => {
        if (vCode && (cleanStr(f.codigoInterno) === vCode || cleanStr((f as any).codigoEquipo) === vCode || cleanStr(f.id) === vCode)) return true;
        if (vModel && cleanStr(f.modeloMarca) === vModel) return true;
        if (vPlate && cleanStr(f.patente) === vPlate) {
          // Verify code doesn't conflict
          if (vCode && cleanStr(f.codigoInterno) !== vCode && cleanStr((f as any).codigoEquipo) !== vCode && cleanStr(f.id) !== vCode) {
            return false;
          }
          return true;
        }
        return false;
      });

      if (matchedVeh) {
        setSelectedVehicleId(matchedVeh.id);
      } else if (voucherToEdit.marcaModelo || voucherToEdit.patente || voucherToEdit.codigoEquipo) {
        setSelectedVehicleId(`ticket-veh-${voucherToEdit.id}`);
      } else {
        setSelectedVehicleId('');
      }

      const vEmpCode = cleanStr(voucherToEdit.codigoEmpleado);
      const vEmpLegajo = cleanStr(voucherToEdit.legajo);
      const vEmpName = cleanStr(voucherToEdit.nombreApellido);

      const matchedEmp = employees.find(e => {
        if (vEmpCode && (cleanStr(e.codigoEmpleado) === vEmpCode || cleanStr(e.id) === vEmpCode)) return true;
        if (vEmpLegajo && cleanStr(e.legajo) === vEmpLegajo) return true;
        if (vEmpName && cleanStr(e.nombreApellido) === vEmpName) return true;
        return false;
      });

      if (matchedEmp) {
        setSelectedEmployeeId(matchedEmp.id);
      } else if (voucherToEdit.nombreApellido || voucherToEdit.codigoEmpleado) {
        setSelectedEmployeeId(`ticket-emp-${voucherToEdit.id}`);
      } else {
        setSelectedEmployeeId('');
      }

      // Match deposit for voucherToEdit
      const matchedDep = (deposits || []).find(d => 
        (voucherToEdit.depositoId && d.id === voucherToEdit.depositoId) ||
        (voucherToEdit.deposito && d.nombre.toLowerCase().trim() === voucherToEdit.deposito.toLowerCase().trim()) ||
        (d.id === voucherToEdit.deposito)
      );
      if (matchedDep) {
        setSelectedDepositId(matchedDep.id);
      } else if (voucherToEdit.deposito) {
        setSelectedDepositId('OTRA_ESTACION');
      } else {
        setSelectedDepositId('');
      }

      const isInternal = voucherToEdit.tipo === 'Cisterna en Obra' || 
        voucherToEdit.tipo === 'Despacho Directo' ||
        matchedDep?.modalidad === 'DEPOSITO_AMBULANTE' || 
        matchedDep?.modalidad === 'BIDONES';
      setCargaOrigin(isInternal ? 'DEPOSITO_PROPIO' : 'ESTACION');
    } else {
      const nextNum = (existingCount + 1).toString().padStart(3, '0');
      const nextOrderNum = (existingCount + 412).toString().padStart(4, '0');

      const defaultFuel = 'DIESEL COMUN';
      const defaultPrice = getLatestFuelPrice(defaultFuel, existingVouchers);

      // Preseleccionar depósito: si no hay uno específico preseleccionado, preferir la Estación de Servicio de convenio
      const defaultStation = (deposits || []).find(d => d.modalidad === 'VALES_ESTACION');
      const activeDeposit = preselectedDeposit || defaultStation || ((deposits && deposits.length > 0) ? deposits[0] : null);

      if (preselectedDeposit && (preselectedDeposit.modalidad === 'DEPOSITO_AMBULANTE' || preselectedDeposit.modalidad === 'BIDONES')) {
        setCargaOrigin('DEPOSITO_PROPIO');
      } else {
        setCargaOrigin('ESTACION');
      }

      const isTargetCisternaOrDeposit = (preselectedDeposit?.modalidad === 'DEPOSITO_AMBULANTE' || preselectedDeposit?.modalidad === 'BIDONES') && !selectedVehicleId;
      const initialTipo = isTargetCisternaOrDeposit ? 'INGRESO' : 'EGRESO';
      let initialCarga = 'Completa (Tanque Lleno)';
      let initialDeposito = activeDeposit ? activeDeposit.nombre : 'Estación de Servicio';
      let initialIdComb = activeDeposit?.idCombustible || 'COMB-D500';
      let initialTipoComb = activeDeposit?.tipoCombustible || defaultFuel;
      let initialNumEstacion = '';
      let initialPrice = (activeDeposit?.modalidad === 'DEPOSITO_AMBULANTE' || activeDeposit?.modalidad === 'BIDONES')
        ? (activeDeposit.costoPorLitroEstimado || getLatestFuelPrice(initialTipoComb, existingVouchers))
        : (activeDeposit?.costoPorLitroEstimado || getLatestFuelPrice(initialTipoComb, existingVouchers));

      if (activeDeposit) {
        if (activeDeposit.modalidad === 'DEPOSITO_AMBULANTE') {
          initialNumEstacion = activeDeposit.patenteVehiculo ? `CIST-${activeDeposit.patenteVehiculo}` : 'CIST-MOVIL';
        } else if (activeDeposit.modalidad === 'BIDONES') {
          initialCarga = 'Carga Parcial';
          initialNumEstacion = activeDeposit.codigo || 'BID-BASE';
        } else if (activeDeposit.modalidad === 'VALES_ESTACION') {
          initialNumEstacion = activeDeposit.numEstacionConvenio || '';
        }
      }

      const initialId = `EXP-${nextNum}`;
      const defaultState: Partial<FuelDispensary> = {
        id: initialId,
        carga: initialCarga,
        tipo: initialTipo,
        idCombustible: initialIdComb,
        deposito: initialDeposito,
        depositoId: activeDeposit?.id || '',
        cantidad: 100,
        tipoComb: initialTipoComb,
        codigoEmpleado: '',
        nombreApellido: '',
        legajo: '',
        codigoEquipo: '',
        marcaModelo: '',
        patente: '',
        numOrden: `ORD-2026-${nextOrderNum}`,
        fecha: new Date().toISOString().slice(0, 10),
        kilometraje: 0,
        hora: new Date().toTimeString().slice(0, 5),
        kilometrosRec: 0,
        autonom: '',
        numEstacion: initialNumEstacion,
        fotoExpendio: '',
        fotoKilometraje: '',
        estado: 'RENDIDO',
        precioUnitario: initialPrice,
        totalImporte: 100 * initialPrice,
        observaciones: '',
        numTicket: '',
        valeId: '',
        numVale: '',
        litrosAutorizados: undefined,
        diferenciaLitros: undefined,
        obraId: '',
        obraNombre: ''
      };

      if (aiPrefillDraft) {
        const aiQty = Number(aiPrefillDraft.cantidad || 100);
        const aiFuel = normalizeFuelName(aiPrefillDraft.tipoComb) || defaultState.tipoComb || 'DIESEL COMUN';
        const aiIsOther = isCustomOtherProduct(aiFuel, aiPrefillDraft.idCombustible);
        setIsCustomFuel(aiIsOther);
        setCustomFuelDetail(aiIsOther ? aiFuel : '');
        setSelectedObraId(aiPrefillDraft.obraId || '');
        const aiFuelId = aiIsOther ? 'COMB-OTRO' : `COMB-${aiFuel.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}`;
        const aiPrice = Number(aiPrefillDraft.precioUnitario || getLatestFuelPrice(aiFuel, existingVouchers) || initialPrice);
        const aiTotal = Number(aiPrefillDraft.totalImporte || (aiQty * aiPrice).toFixed(2));

        // Match Vehicle
        const dPlate = cleanStr(aiPrefillDraft.patente);
        const dCode = cleanStr(aiPrefillDraft.codigoEquipo);
        const dModel = cleanStr(aiPrefillDraft.marcaModelo);
        const matchedVeh = fleet.find(f => {
          if (dPlate && cleanStr(f.patente) === dPlate) return true;
          if (dCode && (cleanStr(f.codigoInterno) === dCode || cleanStr((f as any).codigoEquipo) === dCode || cleanStr(f.id) === dCode)) return true;
          if (dModel && (cleanStr(f.modeloMarca) === dModel || cleanStr(f.modeloMarca).includes(dModel) || dModel.includes(cleanStr(f.modeloMarca)))) return true;
          return false;
        });

        // Match Employee
        const dEmpCode = cleanStr(aiPrefillDraft.codigoEmpleado);
        const dEmpName = cleanStr(aiPrefillDraft.nombreApellido);
        const matchedEmp = employees.find(e => {
          if (dEmpCode && (cleanStr(e.codigoEmpleado) === dEmpCode || cleanStr(e.legajo) === dEmpCode)) return true;
          if (dEmpName && (cleanStr(e.nombreApellido) === dEmpName || cleanStr(e.nombreApellido).includes(dEmpName) || dEmpName.includes(cleanStr(e.nombreApellido)))) return true;
          return false;
        });

        // Match Deposit / Service Station
        const depQuery = (aiPrefillDraft.deposito || '').toLowerCase().trim();
        const depNum = (aiPrefillDraft.numEstacion || '').toLowerCase().trim();
        const matchedDep = (deposits || []).find(d => {
          const dn = (d.nombre || '').toLowerCase();
          const dsn = (d.nombreEstacion || '').toLowerCase();
          const db = (d.empresaBandera || '').toLowerCase();
          const dNum = (d.numEstacionConvenio || '').toLowerCase();
          if (depNum && dNum && dNum === depNum) return true;
          if (depQuery && (dn === depQuery || dsn === depQuery || (db && depQuery.includes(db)) || (dn && depQuery.includes(dn)))) return true;
          return false;
        });

        // Match pending Issued Voucher if numVale provided
        const valeClean = (aiPrefillDraft.numVale || '').trim();
        const matchedVale = valeClean
          ? issuedVouchers.find(v => (v.numVale || '').trim().toLowerCase() === valeClean.toLowerCase())
          : undefined;

        const isInternalDep = matchedDep && (matchedDep.modalidad === 'DEPOSITO_AMBULANTE' || matchedDep.modalidad === 'BIDONES');
        setCargaOrigin(isInternalDep ? 'DEPOSITO_PROPIO' : 'ESTACION');

        const nextFormData: Partial<FuelDispensary> = {
          ...defaultState,
          ...aiPrefillDraft,
          id: initialId,
          tipoComb: aiFuel,
          idCombustible: aiFuelId,
          cantidad: aiQty,
          precioUnitario: aiPrice,
          totalImporte: aiTotal,
          deposito: matchedDep ? matchedDep.nombre : (aiPrefillDraft.deposito || defaultState.deposito),
          depositoId: matchedDep ? matchedDep.id : (aiPrefillDraft.deposito ? undefined : defaultState.depositoId),
          numEstacion: matchedDep?.numEstacionConvenio || aiPrefillDraft.numEstacion || defaultState.numEstacion,
          codigoEquipo: matchedVeh ? (matchedVeh.codigoInterno || (matchedVeh as any).codigoEquipo || matchedVeh.id) : (aiPrefillDraft.codigoEquipo || ''),
          marcaModelo: matchedVeh ? (matchedVeh.modeloMarca || aiPrefillDraft.marcaModelo || '') : (aiPrefillDraft.marcaModelo || ''),
          patente: matchedVeh ? (matchedVeh.patente || aiPrefillDraft.patente || '') : (aiPrefillDraft.patente || ''),
          codigoEmpleado: matchedEmp ? (matchedEmp.codigoEmpleado || matchedEmp.legajo || '') : (aiPrefillDraft.codigoEmpleado || ''),
          nombreApellido: matchedEmp ? matchedEmp.nombreApellido : (aiPrefillDraft.nombreApellido || ''),
          legajo: matchedEmp ? matchedEmp.legajo : (aiPrefillDraft.legajo || ''),
          valeId: matchedVale?.id || '',
          numVale: matchedVale?.numVale || aiPrefillDraft.numVale || '',
          litrosAutorizados: matchedVale?.litrosAutorizados,
          estado: 'RENDIDO',
        };

        setFormData(nextFormData);
        setRawQuantity(String(aiQty));
        setRawPrice(String(aiPrice));
        setRawKilometraje(nextFormData.kilometraje ? String(nextFormData.kilometraje) : '');

        if (matchedVale) setSelectedVoucherId(matchedVale.id);
        if (matchedVeh) {
          setSelectedVehicleId(matchedVeh.id);
        } else if (aiPrefillDraft.marcaModelo || aiPrefillDraft.patente || aiPrefillDraft.codigoEquipo) {
          setSelectedVehicleId(`ticket-veh-${initialId}`);
        }
        if (matchedEmp) {
          setSelectedEmployeeId(matchedEmp.id);
        } else if (aiPrefillDraft.nombreApellido) {
          setSelectedEmployeeId(`ticket-emp-${initialId}`);
        }
        if (matchedDep) {
          setSelectedDepositId(matchedDep.id);
        } else if (aiPrefillDraft.deposito) {
          setSelectedDepositId('OTRA_ESTACION');
        }
      } else {
        setIsCustomFuel(false);
        setCustomFuelDetail('');
        setSelectedObraId('');
        setFormData(defaultState);
        setRawKilometraje('');
        setSelectedVoucherId('');
        setSelectedVehicleId('');
        setSelectedEmployeeId('');
        setSelectedDepositId(activeDeposit?.id || '');

        if (initialSelectedVoucherId) {
          handleSelectIssuedVoucher(initialSelectedVoucherId);
        } else if (preselectedDeposit) {
          handleSelectDeposit(preselectedDeposit.id);
        }
      }
    }
  }, [voucherToEdit, aiPrefillDraft, isOpen, preselectedDeposit, initialSelectedVoucherId]);

  // Hook when picking an issued voucher (Circuito de Rendición de Vale con Ticket)
  const handleSelectIssuedVoucher = (voucherId: string) => {
    setSelectedVoucherId(voucherId);
    setIsValeDataUnlocked(false);
    if (!voucherId) {
      setFormData(prev => ({
        ...prev,
        valeId: '',
        numVale: '',
        litrosAutorizados: undefined,
        diferenciaLitros: undefined,
        estado: 'RENDIDO'
      }));
      return;
    }

    const v = issuedVouchers.find(item => item.id === voucherId);
    if (!v) return;

    // Match vehicle by plate, internal code, id, or brand/model
    const vPlate = cleanStr(v.patente);
    const vCode = cleanStr(v.codigoEquipo);
    const vModel = cleanStr(v.marcaModelo);

    const matchedVehicle = fleet.find(f => {
      if (vPlate && cleanStr(f.patente) === vPlate) return true;
      if (vCode && cleanStr(f.codigoInterno) === vCode) return true;
      if (vCode && cleanStr(f.id) === vCode) return true;
      if (vCode && cleanStr((f as any).codigoEquipo) === vCode) return true;
      if (vCode && cleanStr((f as any).codigo) === vCode) return true;
      if (vModel && cleanStr(f.modeloMarca) === vModel) return true;
      if (vModel && f.modeloMarca && cleanStr(f.modeloMarca).includes(vModel)) return true;
      if (vModel && f.modeloMarca && vModel.includes(cleanStr(f.modeloMarca))) return true;
      return false;
    });

    // Match employee by code, legajo, id, or name
    const vEmpCode = cleanStr(v.codigoEmpleado);
    const vEmpLegajo = cleanStr(v.legajo);
    const vEmpName = cleanStr(v.nombreApellido);

    const matchedEmployee = employees.find(e => {
      if (vEmpCode && cleanStr(e.codigoEmpleado) === vEmpCode) return true;
      if (vEmpCode && cleanStr(e.id) === vEmpCode) return true;
      if (vEmpLegajo && cleanStr(e.legajo) === vEmpLegajo) return true;
      if (vEmpName && cleanStr(e.nombreApellido) === vEmpName) return true;
      if (vEmpName && e.nombreApellido && cleanStr(e.nombreApellido).includes(vEmpName)) return true;
      if (vEmpName && e.nombreApellido && vEmpName.includes(cleanStr(e.nombreApellido))) return true;
      return false;
    });

    const lastKm = v.odometroSalida || matchedVehicle?.horometro || 0;
    const realLiters = v.litrosAutorizados || 100;
    const fuelName = normalizeFuelName(v.tipoComb) || 'DIESEL COMUN';
    const voucherIsOther = isCustomOtherProduct(fuelName, v.idCombustible);
    setIsCustomFuel(voucherIsOther);
    setCustomFuelDetail(voucherIsOther ? (v.tipoComb || fuelName) : '');
    const price = voucherIsOther
      ? (Number(v.precioUnitario) || 0)
      : getLatestFuelPrice(fuelName, existingVouchers);

    setFormData(prev => ({
      ...prev,
      valeId: v.id,
      numVale: v.numVale,
      numOrden: v.numVale, // Associating the voucher number to column 14
      codigoEquipo: v.codigoEquipo || matchedVehicle?.codigoInterno || (matchedVehicle as any)?.codigoEquipo || matchedVehicle?.id || '',
      marcaModelo: v.marcaModelo || matchedVehicle?.modeloMarca || '',
      patente: v.patente || matchedVehicle?.patente || '',
      codigoEmpleado: v.codigoEmpleado || matchedEmployee?.codigoEmpleado || '',
      nombreApellido: v.nombreApellido || matchedEmployee?.nombreApellido || '',
      legajo: v.legajo || matchedEmployee?.legajo || '',
      tipoComb: voucherIsOther ? (v.tipoComb || fuelName) : fuelName,
      idCombustible: voucherIsOther ? 'COMB-OTRO' : (v.idCombustible || 'COMB-D500'),
      deposito: v.estacionSurtidor || prev.deposito,
      numEstacion: v.numEstacion || '',
      carga: v.tipoCarga || 'Completa (Tanque Lleno)',
      tipo: 'Estación de Servicio',
      litrosAutorizados: v.litrosAutorizados,
      cantidad: prev.cantidad && prev.cantidad > 0 ? prev.cantidad : (v.litrosAutorizados || 100),
      diferenciaLitros: v.litrosAutorizados ? ((prev.cantidad || v.litrosAutorizados) - v.litrosAutorizados) : undefined,
      kilometraje: lastKm,
      kilometrosRec: 0,
      autonom: '',
      precioUnitario: price,
      totalImporte: Number((realLiters * price).toFixed(2)),
      estado: 'RENDIDO', // Automatically set to RENDIDO!
      observaciones: `Rendición de ticket correspondiente al vale Nº ${v.numVale}. ${v.observaciones || ''}`
    }));

    setRawQuantity(String(realLiters));
    setRawPrice(String(price));
    setRawKilometraje(lastKm ? String(lastKm) : '');

    // Pre-load and select the vehicle in the SearchableSelect UI
    if (matchedVehicle) {
      setSelectedVehicleId(matchedVehicle.id);
    } else if (v.marcaModelo || v.codigoEquipo || v.patente) {
      setSelectedVehicleId(`ticket-veh-${v.id}`);
    }

    // Pre-load and select the employee in the SearchableSelect UI
    if (matchedEmployee) {
      setSelectedEmployeeId(matchedEmployee.id);
    } else if (v.nombreApellido || v.codigoEmpleado || v.legajo) {
      setSelectedEmployeeId(`ticket-emp-${v.id}`);
    }

    // Match deposit from voucher station (Estación de Servicio)
    const serviceStationDeposits = (deposits || []).filter(d => d.modalidad === 'VALES_ESTACION');
    const stationQuery = (v.estacionSurtidor || '').toLowerCase().trim();
    const stationNum = (v.numEstacion || '').toLowerCase().trim();

    const matchedStation = serviceStationDeposits.find(d => {
      const dName = (d.nombre || '').toLowerCase().trim();
      const dStationName = (d.nombreEstacion || '').toLowerCase().trim();
      const dNum = (d.numEstacionConvenio || '').toLowerCase().trim();
      const dBrand = (d.empresaBandera || '').toLowerCase().trim();
      const dCode = (d.codigo || '').toLowerCase().trim();

      if (stationQuery) {
        if (dName === stationQuery || dStationName === stationQuery) return true;
        if (dName && (dName.includes(stationQuery) || stationQuery.includes(dName))) return true;
        if (dStationName && (dStationName.includes(stationQuery) || stationQuery.includes(dStationName))) return true;
        if (dBrand && (stationQuery.includes(dBrand) || dBrand.includes(stationQuery))) return true;
      }
      if (stationNum && dNum && (dNum === stationNum || dNum.includes(stationNum) || stationNum.includes(dNum))) return true;
      if (stationNum && dCode && dCode === stationNum) return true;
      return false;
    });

    if (matchedStation) {
      setSelectedDepositId(matchedStation.id);
      setFormData(prev => ({
        ...prev,
        deposito: matchedStation.nombre,
        depositoId: matchedStation.id,
        tipo: 'Estación de Servicio',
        numEstacion: matchedStation.numEstacionConvenio || v.numEstacion || prev.numEstacion || 'EST-CONVENIO'
      }));
    } else {
      const fallbackStationName = v.estacionSurtidor || serviceStationDeposits[0]?.nombre || 'Estación de Servicio Externa';
      setSelectedDepositId('OTRA_ESTACION');
      setFormData(prev => ({
        ...prev,
        deposito: fallbackStationName,
        depositoId: undefined,
        tipo: 'Estación de Servicio',
        numEstacion: v.numEstacion || 'EST-EXTERNA'
      }));
    }
  };

  const handleClearVoucherSelection = () => {
    setSelectedVoucherId('');
    setIsValeDataUnlocked(false);
    setFormData(prev => ({
      ...prev,
      valeId: '',
      numVale: '',
      litrosAutorizados: undefined,
      diferenciaLitros: undefined,
      observaciones: ''
    }));
  };

  const handleSwitchCargaOrigin = (origin: 'ESTACION' | 'DEPOSITO_PROPIO') => {
    setCargaOrigin(origin);
    setIsValeDataUnlocked(false);

    if (origin === 'DEPOSITO_PROPIO') {
      // Clear vale and station tickets
      setSelectedVoucherId('');
      setIsCustomFuel(false);
      setCustomFuelDetail('');
      
      // Select first available internal cistern or deposit
      const internalDeposits = (deposits || []).filter(d => 
        (d.modalidad === 'DEPOSITO_AMBULANTE' || d.modalidad === 'BIDONES') && (!targetDeposit || d.id !== targetDeposit.id)
      );
      
      const chosenDep = internalDeposits.find(d => d.id === selectedDepositId) || internalDeposits[0];
      if (chosenDep) {
        handleSelectDeposit(chosenDep.id);
      }
      
      const despNum = `DESP-2026-${String(existingCount + 1).padStart(4, '0')}`;
      const defaultDepPrice = chosenDep?.costoPorLitroEstimado || 2511;
      const defaultDepFuel = chosenDep?.tipoCombustible ? normalizeFuelName(chosenDep.tipoCombustible) : 'DIESEL COMUN';
      setFormData(prev => {
        const currentQty = prev.cantidad || 100;
        return {
          ...prev,
          valeId: '',
          numVale: '',
          numTicket: '',
          tipo: chosenDep?.modalidad === 'BIDONES' ? 'Despacho Directo' : 'Cisterna en Obra',
          numEstacion: chosenDep?.patenteVehiculo ? `CIST-${chosenDep.patenteVehiculo}` : (chosenDep?.codigo || 'CIST-MOVIL'),
          numOrden: prev.numOrden?.startsWith('DESP-') ? prev.numOrden : despNum,
          tipoComb: defaultDepFuel,
          idCombustible: 'COMB-D500',
          precioUnitario: defaultDepPrice,
          cantidad: currentQty,
          totalImporte: Number((currentQty * defaultDepPrice).toFixed(2)),
          litrosAutorizados: undefined,
          diferenciaLitros: undefined
        };
      });
      if (!rawQuantity) {
        setRawQuantity('100');
      }
      setRawPrice(defaultDepPrice.toString());
    } else {
      // Switch back to service stations
      const stationDeposits = (deposits || []).filter(d => d.modalidad === 'VALES_ESTACION');
      const chosenStation = stationDeposits.find(d => d.id === selectedDepositId) || stationDeposits[0];
      if (chosenStation) {
        handleSelectDeposit(chosenStation.id);
      } else {
        setSelectedDepositId('OTRA_ESTACION');
        setFormData(prev => ({
          ...prev,
          deposito: 'Estación de Servicio Externa',
          depositoId: undefined,
          tipo: 'Estación de Servicio',
          numEstacion: 'EST-EXTERNA'
        }));
      }
    }
  };

  const handleSelectDeposit = (depositId: string) => {
    if (!deposits) return;
    const dep = deposits.find(d => d.id === depositId);
    if (!dep) return;

    setSelectedDepositId(dep.id);

    let defaultTipo = 'Despacho Directo';
    let defaultCarga = formData.carga || 'Completa (Tanque Lleno)';
    let defaultNumEstacion = formData.numEstacion || '';

    if (dep.modalidad === 'DEPOSITO_AMBULANTE') {
      defaultTipo = 'Cisterna en Obra';
      defaultNumEstacion = dep.patenteVehiculo ? `CIST-${dep.patenteVehiculo}` : 'CIST-MOVIL';
    } else if (dep.modalidad === 'BIDONES') {
      defaultTipo = 'Despacho Directo';
      defaultCarga = 'Carga Parcial';
      defaultNumEstacion = dep.codigo || 'BID-BASE';
    } else if (dep.modalidad === 'VALES_ESTACION') {
      defaultTipo = 'Estación de Servicio';
      defaultNumEstacion = dep.numEstacionConvenio || '';
    }

    const textInfo = `${dep.nombre || ''} ${dep.tipoCombustible || ''} ${dep.codigo || ''}`.toUpperCase();
    const isDieselTank = textInfo.includes('DIESEL') || textInfo.includes('500') || textInfo.includes('AMARILLO') || dep.modalidad === 'DEPOSITO_AMBULANTE';
    const isNaftaTank = textInfo.includes('NAFTA') && !textInfo.includes('DIESEL');

    let availableFuels: string[] = [];
    if (dep.modalidad === 'DEPOSITO_AMBULANTE' || dep.modalidad === 'BIDONES') {
      const primaryRaw = (dep.tipoCombustible || '').trim();
      const normPrimary = normalizeFuelName(primaryRaw);
      if (normPrimary) {
        availableFuels = [normPrimary];
      } else if (isDieselTank) {
        availableFuels = ['DIESEL COMUN'];
      } else if (isNaftaTank) {
        availableFuels = ['NAFTA SUPER'];
      }
    }

    const savedPrices = loadFuelPrices();
    
    // Choose fuel: if availableFuels is restricted (cisterna/bidón), pick its fuel.
    // Otherwise keep current or default to DIESEL COMUN.
    let chosenFuel = formData.tipoComb || 'DIESEL COMUN';
    if (availableFuels.length > 0) {
      if (!availableFuels.includes(chosenFuel)) {
        chosenFuel = availableFuels[0];
      }
    } else if (isDieselTank && chosenFuel.includes('NAFTA')) {
      chosenFuel = 'DIESEL COMUN';
    }

    const isInternalDeposit = dep.modalidad === 'DEPOSITO_AMBULANTE' || dep.modalidad === 'BIDONES' || cargaOrigin === 'DEPOSITO_PROPIO';
    const keepCustom = !isInternalDeposit && (isCustomFuel || formData.idCombustible === 'COMB-OTRO');
    const fuelPrice = keepCustom
      ? (Number(formData.precioUnitario) || 0)
      : (isInternalDeposit && dep.costoPorLitroEstimado)
      ? dep.costoPorLitroEstimado
      : getLatestFuelPrice(chosenFuel, existingVouchers);

    const fuelId = keepCustom
      ? 'COMB-OTRO'
      : `COMB-${chosenFuel.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}`;

    if (isInternalDeposit && isCustomFuel) {
      setIsCustomFuel(false);
      setCustomFuelDetail('');
    }

    setFormData(prev => ({
      ...prev,
      deposito: dep.nombre,
      depositoId: dep.id,
      tipo: defaultTipo,
      carga: defaultCarga,
      numEstacion: defaultNumEstacion,
      tipoComb: keepCustom ? (prev.tipoComb || 'OTRO') : chosenFuel,
      idCombustible: fuelId,
      precioUnitario: fuelPrice,
      totalImporte: Number(((prev.cantidad || 100) * fuelPrice).toFixed(2))
    }));
    setRawPrice(fuelPrice.toString());
  };

  // Handle Equipment Selection Autocomplete
  const handleSelectVehicle = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    const vehicle = fleet.find(v => v.id === vehicleId);
    if (vehicle) {
      const currentKm = vehicle.horometro || 0;
      const isInternalDispense = cargaOrigin === 'DEPOSITO_PROPIO' || currentDepositObj?.modalidad === 'DEPOSITO_AMBULANTE' || currentDepositObj?.modalidad === 'BIDONES';
      const keepCustom = !isInternalDispense && (isCustomFuel || formData.idCombustible === 'COMB-OTRO');
      let newFuel = keepCustom
        ? (formData.tipoComb || customFuelDetail.trim().toUpperCase() || 'OTRO')
        : (formData.valeId && formData.tipoComb)
        ? formData.tipoComb
        : (vehicle.clasificacion?.includes('CAMION') ? 'DIESEL INFINIA' : (vehicle.combustible === 'Nafta' ? 'NAFTA SUPER' : 'DIESEL COMUN'));
      if (isInternalDispense) {
        newFuel = depositStockFuels[0] || (currentDepositObj?.tipoCombustible ? normalizeFuelName(currentDepositObj.tipoCombustible) : 'DIESEL COMUN');
      } else if (!keepCustom && depositStockFuels.length > 0 && currentDepositObj?.modalidad !== 'VALES_ESTACION' && !depositStockFuels.includes(newFuel)) {
        newFuel = depositStockFuels[0];
      }
      const newFuelId = keepCustom ? 'COMB-OTRO' : `COMB-${newFuel.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}`;
      const newPrice = keepCustom
        ? (Number(formData.precioUnitario) || 0)
        : (isInternalDispense && currentDepositObj?.costoPorLitroEstimado)
        ? currentDepositObj.costoPorLitroEstimado
        : getLatestFuelPrice(newFuel, existingVouchers);

      setFormData(prev => ({
        ...prev,
        codigoEquipo: (vehicle as any).codigoEquipo || vehicle.codigoInterno || vehicle.id || '',
        marcaModelo: vehicle.modeloMarca || [vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') || (vehicle as any).codigoEquipo || vehicle.codigoInterno || '',
        patente: vehicle.patente || '',
        kilometraje: currentKm,
        tipoComb: newFuel,
        idCombustible: newFuelId,
        precioUnitario: newPrice,
        totalImporte: Number(((prev.cantidad || 100) * newPrice).toFixed(2))
      }));
      setRawPrice(newPrice.toString());
      setRawKilometraje(currentKm ? String(currentKm) : '');

      if (vehicle.id) {
        const assignedDriver = employees.find(e => e.vehiculoAsignadoId === vehicle.id);
        if (assignedDriver) {
          handleSelectEmployee(assignedDriver.id);
        }
      }
    } else {
      setFormData(prev => ({
        ...prev,
        codigoEquipo: '',
        marcaModelo: '',
        patente: ''
      }));
    }
  };

  // Handle Employee Selection Autocomplete
  const handleSelectEmployee = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    const employee = employees.find(e => e.id === employeeId);
    if (employee) {
      setFormData(prev => ({
        ...prev,
        codigoEmpleado: employee.codigoEmpleado || employee.legajo || employee.id || '',
        nombreApellido: employee.nombreApellido || '',
        legajo: employee.legajo || employee.codigoEmpleado || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        codigoEmpleado: '',
        nombreApellido: '',
        legajo: ''
      }));
    }
  };

  // Recalculate Totals, Liters Variance & Autonomy
  const handleQuantityOrPriceChange = (newQty: number, newPrice?: number) => {
    let qty = isNaN(newQty) ? 0 : Number(newQty.toFixed(3));

    // Sin tope por stock físico: se permite despachar libremente aunque el saldo quede en negativo temporalmente
    // (útil cuando los ingresos de estación se cargan después que los despachos).
    const isInternalDispense = cargaOrigin === 'DEPOSITO_PROPIO' || currentDepositObj?.modalidad === 'DEPOSITO_AMBULANTE' || currentDepositObj?.modalidad === 'BIDONES';

    const price = newPrice !== undefined
      ? (isNaN(newPrice) ? 0 : Number(newPrice.toFixed(2)))
      : (formData.precioUnitario !== undefined ? formData.precioUnitario : (isInternalDispense && currentDepositObj?.costoPorLitroEstimado ? currentDepositObj.costoPorLitroEstimado : getLatestFuelPrice(formData.tipoComb, existingVouchers)));

    const total = Number((qty * price).toFixed(2));
    const diff = formData.litrosAutorizados !== undefined ? Number((qty - formData.litrosAutorizados).toFixed(3)) : undefined;

    setFormData(prev => ({
      ...prev,
      cantidad: qty,
      diferenciaLitros: diff,
      precioUnitario: price,
      totalImporte: total
    }));
  };

  const handleKmActualChange = (kmActual: number) => {
    setFormData(prev => ({
      ...prev,
      kilometraje: isNaN(kmActual) ? 0 : kmActual
    }));
  };

  // Handle Obra selection (optional imputation to an Obra)
  const handleSelectObra = (obraId: string) => {
    setSelectedObraId(obraId);
    if (!obraId) {
      setFormData(prev => ({ ...prev, obraId: '', obraNombre: '' }));
      return;
    }
    const matched = (obras || []).find(o => o.id === obraId);
    setFormData(prev => ({
      ...prev,
      obraId,
      obraNombre: matched?.nombreObra || prev.obraNombre || ''
    }));
  };

  // Handle Fuel selection with automated ID and price
  const handleFuelChange = (fuelName: string) => {
    if (fuelName === CUSTOM_FUEL_SENTINEL) {
      setIsCustomFuel(true);
      const label = customFuelDetail.trim().toUpperCase() || 'OTRO';
      setFormData(prev => ({
        ...prev,
        tipoComb: label,
        idCombustible: 'COMB-OTRO'
      }));
      return;
    }
    setIsCustomFuel(false);
    setCustomFuelDetail('');
    const price = getLatestFuelPrice(fuelName, existingVouchers);
    const idComb = `COMB-${fuelName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}`;

    setFormData(prev => ({
      ...prev,
      tipoComb: fuelName,
      idCombustible: idComb,
      precioUnitario: price,
      totalImporte: Number(((prev.cantidad || 0) * price).toFixed(2))
    }));
    setRawPrice(price.toString());
  };

  // Handle Photo upload strictly with Cloudflare R2 (never stores base64 in Supabase)
  const handlePhotoSelected = async (field: 'fotoExpendio' | 'fotoKilometraje', base64OrUrl: string, file?: File) => {
    setR2Error(null);

    if (!file && (base64OrUrl.startsWith('http://') || base64OrUrl.startsWith('https://'))) {
      setFormData(prev => ({
        ...prev,
        [field]: base64OrUrl
      }));
      return;
    }

    const uploadInput: File | string | undefined = file || (base64OrUrl ? base64OrUrl : undefined);
    if (!uploadInput) return;

    setUploadingPhotoField(field);
    try {
      const r2Res = await uploadImageToCloudflareR2(
        uploadInput,
        `combustible_${field}_${Date.now()}_${file?.name || 'foto.webp'}`,
        file?.type || 'image/webp',
        { maxWidth: 1600, maxHeight: 1600, quality: 0.82, format: 'image/webp' }
      );
      if (r2Res.success && r2Res.url) {
        setFormData(prev => ({
          ...prev,
          [field]: r2Res.url
        }));
      } else {
        setR2Error(r2Res.error || 'No se pudo subir la imagen a Cloudflare R2. No se guardó en Supabase.');
      }
    } catch (err: any) {
      setR2Error(err?.message || 'No se pudo subir la imagen a Cloudflare R2. Verificá tu conexión.');
    } finally {
      setUploadingPhotoField(null);
    }
  };

  useClipboardImagePaste({
    enabled: isOpen && activeTab === 'fotos',
    onImagePasted: (base64, file) => {
      if (!formData.fotoExpendio) {
        handlePhotoSelected('fotoExpendio', base64, file);
      } else {
        handlePhotoSelected('fotoKilometraje', base64, file);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.id?.trim()) {
      alert('El ID de expendio es requerido.');
      return;
    }
    if (!formData.codigoEquipo?.trim() && !formData.marcaModelo?.trim()) {
      alert('Debe seleccionar el Equipo / Vehículo.');
      return;
    }
    if (!formData.cantidad || formData.cantidad <= 0) {
      alert('La cantidad de combustible debe ser mayor a 0 Litros.');
      return;
    }
    if (formData.fotoExpendio?.startsWith('data:') || formData.fotoKilometraje?.startsWith('data:')) {
      setActiveTab('fotos');
      setR2Error('Las imágenes deben subirse a Cloudflare R2 antes de guardar el vale.');
      return;
    }

    const unitPrice = Number(formData.precioUnitario) || 0;
    const fuelType = isCustomFuel
      ? (customFuelDetail.trim().toUpperCase() || formData.tipoComb?.trim().toUpperCase() || 'OTRO')
      : (formData.tipoComb || 'DIESEL COMUN');

    // Save as latest price only for standard catalog fuels (never pollute catalog with ad-hoc OTRO products)
    if (!isCustomFuel && formData.idCombustible !== 'COMB-OTRO' && unitPrice > 0) {
      saveFuelPrice(fuelType, unitPrice);
    }

    const finalDepositName = (formData.deposito || currentDepositObj?.nombre || 'Estación de Servicio Externa').trim();
    const finalDepositId = selectedDepositId !== 'OTRA_ESTACION' 
      ? (selectedDepositId || currentDepositObj?.id || formData.depositoId) 
      : undefined;

    const matchedObraObj = selectedObraId
      ? (obras || []).find(o => o.id === selectedObraId)
      : undefined;

    const payload: FuelDispensary = {
      id: formData.id.trim(),
      carga: formData.carga || 'Completa (Tanque Lleno)',
      tipo: formData.tipo || (currentDepositObj?.modalidad === 'DEPOSITO_AMBULANTE' ? 'Cisterna en Obra' : currentDepositObj?.modalidad === 'BIDONES' ? 'Despacho Directo' : 'Estación de Servicio'),
      idCombustible: isCustomFuel ? 'COMB-OTRO' : (formData.idCombustible || 'COMB-D500'),
      deposito: finalDepositName,
      depositoId: finalDepositId,
      cantidad: Number(formData.cantidad),
      tipoComb: fuelType,
      codigoEmpleado: (formData.codigoEmpleado && (formData.codigoEmpleado.startsWith('EMP-') || formData.codigoEmpleado.startsWith('OP-') || formData.codigoEmpleado.startsWith('CH-') || formData.codigoEmpleado.startsWith('LEG-')))
        ? formData.codigoEmpleado
        : formatPersonName(formData.nombreApellido || formData.codigoEmpleado),
      nombreApellido: formatPersonName(formData.nombreApellido || formData.codigoEmpleado) || formData.nombreApellido || '',
      legajo: formData.legajo || '',
      codigoEquipo: (formData.codigoEquipo || '').trim(),
      marcaModelo: formData.marcaModelo || '',
      patente: formData.patente || '',
      numOrden: formData.numOrden || formData.numVale || `ORD-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      fecha: formData.fecha || new Date().toISOString().slice(0, 10),
      kilometraje: isCisternaODeposito ? 0 : (Number(formData.kilometraje) || 0),
      hora: formData.hora || new Date().toTimeString().slice(0, 5),
      kilometrosRec: isCisternaODeposito ? 0 : (Number(formData.kilometrosRec) || 0),
      autonom: isCisternaODeposito ? 'No aplica (Cisterna)' : (formData.autonom || ''),
      numEstacion: formData.numEstacion || '',
      fotoExpendio: formData.fotoExpendio || '',
      fotoKilometraje: formData.fotoKilometraje || '',
      estado: (formData.estado as FuelVoucherStatus) || 'RENDIDO',
      precioUnitario: unitPrice,
      totalImporte: formData.totalImporte !== undefined ? Number(formData.totalImporte) : (Number(formData.cantidad) * unitPrice),
      observaciones: formData.observaciones || '',
      valeId: formData.valeId,
      numVale: formData.numVale,
      numTicket: formData.numTicket,
      litrosAutorizados: formData.litrosAutorizados,
      diferenciaLitros: formData.diferenciaLitros,
      obraId: selectedObraId || undefined,
      obraNombre: matchedObraObj?.nombreObra || (selectedObraId ? formData.obraNombre : undefined) || undefined
    };

    onSave(payload);
    if (onLinkBolsaDocument) {
      const label = `Expendio ${payload.id} · ${payload.marcaModelo || payload.patente || payload.deposito}`;
      if (selectedBagDocsMap.fotoExpendio && payload.fotoExpendio) {
        onLinkBolsaDocument(selectedBagDocsMap.fotoExpendio, payload.id, label);
      }
      if (selectedBagDocsMap.fotoKilometraje && payload.fotoKilometraje) {
        onLinkBolsaDocument(selectedBagDocsMap.fotoKilometraje, payload.id, label);
      }
    }
    setSelectedBagDocsMap({});
    onClose();
  };

  if (!isOpen) return null;

  const selectedVoucherObj = issuedVouchers.find(v => v.id === selectedVoucherId);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#16191F] border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-black/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Fuel className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                {voucherToEdit 
                  ? 'Editar Registro de Expendio' 
                  : (cargaOrigin === 'DEPOSITO_PROPIO' 
                      ? 'Despacho desde Depósito Propio / Cisterna' 
                      : 'Carga de Ticket de Estación & Rendición de Vale')}
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500 text-black font-black">
                  {formData.id}
                </span>
                {cargaOrigin === 'ESTACION' && formData.numVale && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                    Vale Nº {formData.numVale} → RENDIDO
                  </span>
                )}
                {cargaOrigin === 'DEPOSITO_PROPIO' && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold flex items-center gap-1">
                    <Truck className="w-3 h-3" /> Despacho Interno
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {cargaOrigin === 'DEPOSITO_PROPIO'
                  ? 'Despacho interno desde cisterna móvil o depósito propio. Descuenta stock físico sin necesidad de vale de estación.'
                  : 'Paso 2 del Circuito: Cargar ticket de surtidor y rendir vale emitido para ingreso de combustible y control de odómetro.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-slate-800 bg-slate-900/40 px-6">
          <button
            type="button"
            onClick={() => setActiveTab('datos')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'datos'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{cargaOrigin === 'DEPOSITO_PROPIO' ? 'Datos del Despacho Interno (Stock y Maquinaria)' : 'Datos del Ticket & Rendición (20 Columnas)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fotos')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'fotos'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{isCisternaODeposito ? 'Foto del Ticket de Surtidor' : 'Fotos de Comprobantes (Ticket Surtidor & Odómetro)'}</span>
            {(formData.fotoExpendio || formData.fotoKilometraje) && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {!voucherToEdit && aiPrefillDraft && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-[#F0C800] shrink-0 mt-0.5" />
              <div className="text-xs text-slate-200 leading-relaxed">
                <strong className="text-[#F0C800]">Ticket analizado por IA:</strong> Revisá los litros, precio, estación, equipo y foto adjunta. Si está todo bien, tocá <strong>Guardar / Registrar Expendio</strong> abajo.
              </div>
            </div>
          )}

          {activeTab === 'datos' ? (
            <div className="space-y-5">
              
              {/* SELECTOR PRINCIPAL: ORIGEN DE LA CARGA / TIPO DE SUMINISTRO */}
              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-2xl shadow-lg">
                <div className="flex items-center justify-between mb-2.5 px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Fuel className="w-3.5 h-3.5 text-amber-400" />
                    <span>Seleccione el Origen / Tipo de Suministro:</span>
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                    cargaOrigin === 'ESTACION' 
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' 
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {cargaOrigin === 'ESTACION' ? '⛽ Suministro Externo' : '🚚 Suministro Interno'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Opción 1: Estación de Servicio con Vale */}
                  <button
                    type="button"
                    onClick={() => handleSwitchCargaOrigin('ESTACION')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      cargaOrigin === 'ESTACION'
                        ? 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-slate-900 border-amber-500 text-white shadow-md shadow-amber-500/10 ring-1 ring-amber-500/40'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${
                      cargaOrigin === 'ESTACION' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Fuel className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-bold ${cargaOrigin === 'ESTACION' ? 'text-amber-400' : 'text-slate-200'}`}>
                          Estación de Servicio Externa
                        </span>
                        {cargaOrigin === 'ESTACION' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            SELECCIONADO
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                        YPF, Shell, Axion u otra. Carga con <strong>Vale físico y Ticket de Surtidor</strong>.
                      </p>
                    </div>
                  </button>

                  {/* Opción 2: Cisterna Móvil / Depósito Propio */}
                  <button
                    type="button"
                    onClick={() => handleSwitchCargaOrigin('DEPOSITO_PROPIO')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      cargaOrigin === 'DEPOSITO_PROPIO'
                        ? 'bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-slate-900 border-emerald-500 text-white shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/40'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${
                      cargaOrigin === 'DEPOSITO_PROPIO' ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Truck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-bold ${cargaOrigin === 'DEPOSITO_PROPIO' ? 'text-emerald-400' : 'text-slate-200'}`}>
                          Depósito Propio / Cisterna en Obra
                        </span>
                        {cargaOrigin === 'DEPOSITO_PROPIO' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            SELECCIONADO
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                        Cisterna móvil, tanque o bidón propio. <strong>Despacho interno directo (sin vale)</strong>.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* MODO ESTACIÓN: VINCULACIÓN CON VALE EMITIDO SIN RENDIR */}
              {cargaOrigin === 'ESTACION' && (
                <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border-2 border-amber-500/50 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <Ticket className="w-5 h-5" />
                      </span>
                      <div>
                        <span className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                          <span>Llamar a Vale Emitido Sin Rendir</span>
                          {pendingVouchers.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                              {pendingVouchers.length} sin rendir
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-300 block">
                          Seleccione el vale del talonario físico para autocompletar equipo, chofer, estación y litros autorizados.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {formData.numVale ? (
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-mono font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Vale Nº {formData.numVale} Vinculado
                          </span>
                          <button
                            type="button"
                            onClick={handleClearVoucherSelection}
                            className="text-[10px] text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center gap-1 transition cursor-pointer"
                            title="Desvincular vale y cargar manualmente"
                          >
                            <RotateCcw className="w-3 h-3" /> Desvincular
                          </button>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-mono">
                          Carga Manual / Sin Vale
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Desplegable interactivo con búsqueda en vivo de Vales Emitidos */}
                  <div className="space-y-3">
                    <SearchableSelect
                      label="Seleccionar Vale Emitido Pendiente de Rendición:"
                      placeholder={pendingVouchers.length === 0 ? "No hay vales emitidos pendientes de rendir" : "Buscar vale por número, chofer, equipo o patente..."}
                      searchPlaceholder="Escriba el número de vale (ej: 02627), chofer, modelo o patente..."
                      options={pendingVoucherOptions}
                      value={selectedVoucherId}
                      onChange={handleSelectIssuedVoucher}
                      disabled={pendingVouchers.length === 0 && !selectedVoucherId}
                      emptyMessage="No se encontraron vales emitidos sin rendir con ese criterio"
                    />

                    {/* Detalle visual del vale seleccionado */}
                    {selectedVoucherObj && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-300">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Vale Físico:</span>
                          <strong className="text-amber-400 font-mono text-xs">Nº {selectedVoucherObj.numVale}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Equipo Destino:</span>
                          <span className="text-white font-medium truncate block">{selectedVoucherObj.marcaModelo || selectedVoucherObj.codigoEquipo}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Chofer:</span>
                          <span className="text-white font-medium truncate block">{selectedVoucherObj.nombreApellido || 'S/D'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Estación / Modalidad:</span>
                          <span className="text-emerald-400 font-mono font-bold block">
                            {!selectedVoucherObj.litrosAutorizados || selectedVoucherObj.tipoCarga?.includes('Tanque Lleno')
                              ? 'Tanque Lleno'
                              : `${selectedVoucherObj.litrosAutorizados} Lts`} ({selectedVoucherObj.estacionSurtidor || 'Estación'})
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Tarjeta de Control y Bloqueo de Datos del Vale */}
                    {isValeLinked && (
                      <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        isLocked 
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-200' 
                          : 'bg-amber-500/20 border-amber-500 text-amber-100 shadow-md'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg shrink-0 ${
                            isLocked 
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                              : 'bg-amber-500 text-slate-950 font-bold'
                          }`}>
                            {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white">
                                {isLocked 
                                  ? `Datos del Vale Nº ${formData.numVale || selectedVoucherObj?.numVale || ''} Bloqueados` 
                                  : `Modo Modificación de Vale Nº ${formData.numVale || selectedVoucherObj?.numVale || ''} Activo`}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                                isLocked 
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                  : 'bg-amber-400 text-slate-950'
                              }`}>
                                {isLocked ? '🔒 Bloqueado' : '✏️ Modificación Habilitada'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 mt-0.5">
                              {isLocked
                                ? 'Los datos de equipo, chofer, combustible y surtidor están protegidos con los datos del vale emitido.'
                                : 'ATENCIÓN: Si modifica el equipo, chofer, combustible o estación, estos cambios se actualizarán directamente en el vale.'}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsValeDataUnlocked(!isValeDataUnlocked)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 ${
                            isLocked
                              ? 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/40 hover:border-amber-500'
                              : 'bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold shadow'
                          }`}
                        >
                          {isLocked ? (
                            <>
                              <Unlock className="w-3.5 h-3.5" />
                              <span>Modificar datos del vale</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 text-slate-950" />
                              <span>Bloquear datos del vale</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Número de Ticket de la Estación (Anotado en el papel) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1 flex items-center gap-1">
                          <Hash className="w-3.5 h-3.5 text-amber-400" />
                          Nº de Ticket / Factura de Estación de Servicio:
                        </label>
                        <input
                          type="text"
                          value={formData.numTicket || ''}
                          onChange={(e) => setFormData({ ...formData, numTicket: e.target.value })}
                          placeholder="Ej: TK-YPF-0048-0091823 o 0001-00048912"
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono font-bold text-amber-400 focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          Estado de Rendición del Circuito:
                        </label>
                        <div className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-emerald-400 font-bold flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            RENDIDO (Listo para registrar)
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Automático</span>
                        </div>
                      </div>
                    </div>

                    {/* Banner de comparación Litros Autorizados vs Reales */}
                    {formData.litrosAutorizados !== undefined && formData.litrosAutorizados > 0 && (
                      <div className="bg-[#0F1115] border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Cupo Autorizado en Vale:</span>
                          <strong className="text-white font-mono">{formData.litrosAutorizados} Lts</strong>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Litros Reales del Ticket:</span>
                          <strong className="text-amber-400 font-mono text-sm">{formData.cantidad || 0} Lts</strong>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">Diferencia:</span>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            (formData.diferenciaLitros || 0) > 0
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : (formData.diferenciaLitros || 0) < 0
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {(formData.diferenciaLitros || 0) > 0
                              ? `+${formData.diferenciaLitros} Lts (Excedente)`
                              : (formData.diferenciaLitros || 0) < 0
                              ? `${formData.diferenciaLitros} Lts (Menor a cupo)`
                              : '0 Lts (Exacto)'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* MODO DEPÓSITO PROPIO: Banner informativo sutil sin vales */}
              {cargaOrigin === 'DEPOSITO_PROPIO' && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-300">
                          Despacho Interno desde Depósito Propio / Cisterna en Obra
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Sin Vale Requerido
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                        El combustible se descuenta directamente del stock físico del depósito seleccionado. No requiere vincular vales de estación ni ticket fiscal.
                      </p>
                    </div>
                  </div>
                  {formData.deposito && (
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] text-slate-400 block font-mono">Depósito Asignado:</span>
                      <strong className="text-white text-xs font-mono">{formData.deposito}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Grid 1: Modalidad, Canal y Suministro de Combustible */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1 flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5 text-amber-400" />
                  Modalidad, Canal y Suministro de Combustible
                </h4>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* CANAL DE DESPACHO / DEPÓSITO DE CARGA (Abarca 2 columnas) */}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-300 block mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-amber-400" />
                          Canal de Despacho (Depósitos de Carga):
                        </span>
                        {isLocked && <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1"><Lock className="w-3 h-3" /> Bloqueado</span>}
                      </label>
                      <SearchableSelect
                        disabled={isLocked}
                        showClear={false}
                        value={
                          selectedDepositId === 'OTRA_ESTACION'
                            ? 'OTRA_ESTACION'
                            : (selectedDepositId || currentDepositObj?.id || (formData.tipo === 'Estación de Servicio' ? 'OTRA_ESTACION' : (deposits.find(d => !targetDeposit || d.id !== targetDeposit.id)?.id || '')))
                        }
                        onChange={(val) => {
                          if (!val) return;
                          if (val === 'OTRA_ESTACION') {
                            setSelectedDepositId('OTRA_ESTACION');
                            setFormData(prev => ({
                              ...prev,
                              depositoId: undefined,
                              tipo: 'Estación de Servicio',
                              deposito: prev.deposito?.toLowerCase().includes('cisterna') || prev.deposito?.toLowerCase().includes('bidon')
                                ? 'Estación de Servicio Externa'
                                : prev.deposito || 'Estación de Servicio Externa'
                            }));
                          } else {
                            handleSelectDeposit(val);
                          }
                        }}
                        options={
                          cargaOrigin === 'DEPOSITO_PROPIO'
                            ? [
                                ...(deposits || [])
                                  .filter(d => d.modalidad === 'DEPOSITO_AMBULANTE' && (!targetDeposit || d.id !== targetDeposit.id))
                                  .map(d => {
                                    const stock = getDepositStock(d);
                                    return {
                                      value: d.id,
                                      label: `Cisterna: ${d.nombre}`,
                                      subtitle: `Stock: ${stock.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} L / Cap: ${d.capacidadTotal.toLocaleString('es-AR')} L (${d.tipoCombustible})`,
                                    };
                                  }),
                                ...(deposits || [])
                                  .filter(d => d.modalidad === 'BIDONES')
                                  .map(d => {
                                    const stock = getDepositStock(d);
                                    return {
                                      value: d.id,
                                      label: `Bidones: ${d.nombre}`,
                                      subtitle: `Stock: ${stock.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} L (${d.tipoCombustible})`,
                                    };
                                  }),
                              ]
                            : [
                                ...(deposits || [])
                                  .filter(d => d.modalidad === 'VALES_ESTACION')
                                  .map(d => ({
                                    value: d.id,
                                    label: `${d.nombre} — ${d.empresaBandera || 'Estación'}`,
                                    subtitle: `${d.numEstacionConvenio || 'Convenio'} • Solo suma cargas`,
                                  })),
                                {
                                  value: 'OTRA_ESTACION',
                                  label: selectedDepositId === 'OTRA_ESTACION' && formData.deposito
                                    ? `${formData.deposito} (Estación del Vale)`
                                    : 'Otra Estación de Servicio / Carga Externa',
                                  subtitle: 'Carga manual de estación externa',
                                },
                              ]
                        }
                        placeholder={cargaOrigin === 'DEPOSITO_PROPIO' ? 'Seleccione Cisterna / Depósito...' : 'Seleccione Estación de Carga...'}
                        searchPlaceholder="Buscar cisterna, depósito o estación..."
                      />
                    </div>

                    {/* MODALIDAD DE CARGA */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1 flex items-center justify-between">
                        <span>Modalidad de Carga:</span>
                        {isLocked && <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1"><Lock className="w-3 h-3" /> Bloqueado</span>}
                      </label>
                      <SearchableSelect
                        disabled={isLocked}
                        showClear={false}
                        value={formData.carga || 'Completa (Tanque Lleno)'}
                        onChange={(val) => setFormData({ ...formData, carga: val || 'Completa (Tanque Lleno)' })}
                        options={COMMON_CARGAS.map(c => ({ value: c, label: c }))}
                        placeholder="Modalidad..."
                        searchPlaceholder="Buscar modalidad..."
                      />
                    </div>
                  </div>

                  {/* Campo libre para nombre de estación externa si eligió OTRA_ESTACION */}
                  {selectedDepositId === 'OTRA_ESTACION' && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1 flex items-center justify-between">
                        <span>Nombre / Ubicación de la Estación de Servicio:</span>
                        {isLocked && <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1"><Lock className="w-3 h-3" /> Bloqueado</span>}
                      </label>
                      <input
                        type="text"
                        value={formData.deposito}
                        onChange={(e) => setFormData({ ...formData, deposito: e.target.value })}
                        disabled={isLocked}
                        placeholder="Ej: Estación de Servicio..."
                        className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none transition-colors ${
                          isLocked 
                            ? 'bg-slate-950/80 border-slate-800 text-slate-400 cursor-not-allowed opacity-75' 
                            : 'bg-slate-900 border-slate-700 text-white focus:border-amber-500'
                        }`}
                      />
                    </div>
                  )}

                  {/* Indicador de Stock Sutil y Compacto */}
                  {currentDepositObj && (currentDepositObj.modalidad === 'DEPOSITO_AMBULANTE' || currentDepositObj.modalidad === 'BIDONES') && (
                    <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/25 rounded-lg flex items-center justify-between flex-wrap gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-amber-400 font-bold flex items-center gap-1.5">
                          {currentDepositObj.modalidad === 'DEPOSITO_AMBULANTE' ? <Truck className="w-3.5 h-3.5 text-amber-400" /> : <Layers className="w-3.5 h-3.5 text-blue-400" />}
                          {currentDepositObj.nombre}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          | Stock: <strong className="text-white">{effectiveDepositStock.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} L</strong>
                          {formData.cantidad ? ` - ${Number(formData.cantidad).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} L` : ''}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          → Remanente: <strong className={
                            (effectiveDepositStock - Number(formData.cantidad || 0)) < 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'
                          }>
                            {Number((effectiveDepositStock - Number(formData.cantidad || 0)).toFixed(3)).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} L
                          </strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {Number(formData.cantidad || 0) > effectiveDepositStock ? (
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-rose-400" /> Saldo quedará negativo (permitido)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-medium">
                            ✓ Stock disponible (Cap: {currentDepositObj.capacidadTotal.toLocaleString('es-AR')} L)
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {cargaOrigin === 'ESTACION' && (currentDepositObj?.modalidad === 'VALES_ESTACION' || selectedDepositId === 'OTRA_ESTACION' || formData.tipo === 'Estación de Servicio') && currentDepositObj?.modalidad !== 'DEPOSITO_AMBULANTE' && currentDepositObj?.modalidad !== 'BIDONES' && (
                    <div className="px-3 py-2 bg-purple-500/10 border border-purple-500/25 rounded-lg flex items-center justify-between flex-wrap gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Ticket className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-white font-medium">{currentDepositObj ? currentDepositObj.nombre : (formData.deposito || 'Estación de Servicio Externa')}</span>
                        <span className="text-[10px] text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30 font-mono">
                          Solo suma cargas
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Acumulado: <strong className="text-purple-300">{((currentDepositObj?.totalCargasLitros || 0) + Number(formData.cantidad || 0)).toLocaleString('es-AR')} Lts</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* 7. TIPO_COMB (Fijo en cisterna o seleccionable en estación) */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1 flex items-center justify-between">
                      <span>Tipo de Combustible:</span>
                      {cargaOrigin === 'DEPOSITO_PROPIO' || (currentDepositObj && (currentDepositObj.modalidad === 'DEPOSITO_AMBULANTE' || currentDepositObj.modalidad === 'BIDONES')) ? (
                        <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1 font-bold">
                          <Lock className="w-3 h-3" /> Fijo en Cisterna
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 font-semibold">
                          ⛽ Habilitado
                        </span>
                      )}
                    </label>

                    {cargaOrigin === 'DEPOSITO_PROPIO' || (currentDepositObj && (currentDepositObj.modalidad === 'DEPOSITO_AMBULANTE' || currentDepositObj.modalidad === 'BIDONES')) ? (
                      <div className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-lg text-xs font-mono font-bold text-amber-400 flex items-center justify-between shadow-inner">
                        <span className="flex items-center gap-1.5">
                          ⛽ {formData.tipoComb || 'DIESEL COMUN'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          ${Number(formData.precioUnitario || 2511).toLocaleString('es-AR')}/L
                        </span>
                      </div>
                    ) : (
                      <SearchableSelect
                        showClear={false}
                        value={isCustomFuel ? CUSTOM_FUEL_SENTINEL : (formData.tipoComb || 'DIESEL COMUN')}
                        onChange={(val) => val && handleFuelChange(val)}
                        options={[
                          ...eligibleFuels.map(f => ({
                            value: f.name,
                            label: f.name,
                            subtitle: `$${f.price.toLocaleString('es-AR')}/L`,
                          })),
                          {
                            value: CUSTOM_FUEL_SENTINEL,
                            label: 'OTRO (Urea, Aceite, Lubricante, etc.)',
                            subtitle: 'Insumo / producto especial',
                          }
                        ]}
                        placeholder="Tipo de combustible..."
                        searchPlaceholder="Buscar combustible o elegir OTRO..."
                      />
                    )}

                    {currentDepositObj && (currentDepositObj.modalidad === 'DEPOSITO_AMBULANTE' || currentDepositObj.modalidad === 'BIDONES') && (
                      <p className="text-[10px] text-amber-400/90 mt-1 font-medium flex items-center gap-1">
                        <span>ℹ️ Único producto físico ingresado en esta cisterna ({formData.tipoComb || 'DIESEL COMUN'}).</span>
                      </p>
                    )}
                  </div>

                  {/* 6. CANTIDAD (LITROS REALES DEL TICKET O DESPACHO - AUTO-AJUSTE AL STOCK) */}
                  <div>
                    <label className="text-[11px] font-bold text-amber-400 block mb-1 flex items-center justify-between">
                      <span>
                        {isCustomFuel
                          ? 'Cantidad (Lts / Unid.) *'
                          : cargaOrigin === 'DEPOSITO_PROPIO'
                          ? 'Litros a Despachar *'
                          : 'Cantidad Real (Litros) *'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">3 decimales</span>
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={rawQuantity}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRawQuantity(val);
                        const raw = val.replace(',', '.');
                        const num = parseFloat(raw);
                        if (!isNaN(num) && num >= 0) {
                          handleQuantityOrPriceChange(num);
                        }
                      }}
                      onBlur={() => {
                        const raw = rawQuantity.replace(',', '.');
                        const num = parseFloat(raw);
                        if (!isNaN(num) && num >= 0) {
                          setRawQuantity(num.toString());
                          handleQuantityOrPriceChange(num);
                        }
                      }}
                      placeholder="100"
                      className="w-full px-3 py-2 bg-slate-900 border-2 border-amber-500/70 rounded-lg text-sm font-mono font-black text-amber-400 focus:border-amber-400 focus:outline-none"
                    />
                    {currentDepositObj && (currentDepositObj.modalidad === 'DEPOSITO_AMBULANTE' || currentDepositObj.modalidad === 'BIDONES') && (
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        Stock actual: <strong className={effectiveDepositStock < 0 ? 'text-rose-400' : 'text-amber-400'}>{effectiveDepositStock.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} L</strong> <span className="text-slate-500">(sin tope, admite negativo)</span>
                      </p>
                    )}
                  </div>

                  {/* Precio Unitario / Total (EDITABLE CON AUTO-SINCRO) */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1 flex items-center justify-between">
                      <span>{isCustomFuel ? 'Precio Unitario ($/u):' : 'Precio Unitario ($/L):'}</span>
                      <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1 font-semibold">
                        ✏️ Editable
                      </span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs font-bold">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={rawPrice}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRawPrice(val);
                          const raw = val.replace(',', '.').replace(/[^0-9.]/g, '');
                          const num = parseFloat(raw);
                          if (!isNaN(num) && num >= 0) {
                            handleQuantityOrPriceChange(Number(formData.cantidad || 100), num);
                            if (formData.tipoComb && !isCustomFuel && formData.idCombustible !== 'COMB-OTRO') {
                              saveFuelPrice(formData.tipoComb, num);
                            }
                          }
                        }}
                        onBlur={() => {
                          const raw = rawPrice.replace(',', '.').replace(/[^0-9.]/g, '');
                          const num = parseFloat(raw);
                          if (!isNaN(num) && num >= 0) {
                            setRawPrice(num.toString());
                            handleQuantityOrPriceChange(Number(formData.cantidad || 100), num);
                            if (formData.tipoComb && !isCustomFuel && formData.idCombustible !== 'COMB-OTRO') {
                              saveFuelPrice(formData.tipoComb, num);
                            }
                          }
                        }}
                        placeholder="1200"
                        className="w-full pl-7 pr-3 py-2 bg-slate-900 border-2 border-amber-500/70 rounded-lg text-xs font-mono font-bold text-amber-400 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>Total Importe:</span>
                      <strong className="text-emerald-400 font-bold text-xs">
                        {formatCurrency(formData.totalImporte !== undefined ? formData.totalImporte : ((formData.cantidad || 0) * (formData.precioUnitario || 0)))}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Detalle de producto personalizado cuando se elige OTRO (Urea, Aceite, Lubricante, etc.) */}
                {isCustomFuel && cargaOrigin === 'ESTACION' && (
                  <div className="p-3.5 bg-violet-950/25 border border-violet-500/40 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-violet-300">
                        Detalle del Producto / Insumo (OTRO)
                      </label>
                      <span className="text-[10px] text-violet-300/80 font-mono">
                        Urea, aceite, grasa, refrigerante, etc.
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {OTHER_FUEL_PRESETS.map(preset => {
                        const active = customFuelDetail.trim().toUpperCase() === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setCustomFuelDetail(preset);
                              setFormData(prev => ({
                                ...prev,
                                tipoComb: preset,
                                idCombustible: 'COMB-OTRO'
                              }));
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                              active
                                ? 'bg-violet-500 text-white border-violet-400 shadow-sm'
                                : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-violet-400/60 hover:text-white'
                            }`}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      value={customFuelDetail}
                      onChange={e => {
                        const val = e.target.value;
                        setCustomFuelDetail(val);
                        setFormData(prev => ({
                          ...prev,
                          tipoComb: val.trim().toUpperCase() || 'OTRO',
                          idCombustible: 'COMB-OTRO'
                        }));
                      }}
                      placeholder="Ej: UREA / ADBLUE 20L, ACEITE 15W40, ACEITE HIDRÁULICO, GRASA..."
                      className="w-full bg-slate-950 border border-violet-500/50 rounded-lg px-3 py-2 text-xs font-bold text-white uppercase placeholder:normal-case placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Grid 2: Operador y Equipo (con Selectores Desplegables Inteligentes) */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-blue-400" />
                  Personal y Maquinaria Asignada
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Selector de Equipo */}
                  <div className={`space-y-2 p-3 rounded-xl border transition-colors ${
                    isLocked ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-900/60 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-400">
                        Equipo de Flota:
                      </label>
                      {isLocked && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Bloqueado por Vale
                        </span>
                      )}
                    </div>
                    <SearchableSelect
                      placeholder="Buscar por marca, modelo o patente..."
                      searchPlaceholder="Escriba marca, modelo o patente..."
                      options={vehicleOptions}
                      value={selectedVehicleId}
                      onChange={handleSelectVehicle}
                      emptyMessage="No se encontró el equipo"
                      disabled={isLocked}
                    />
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400 pt-1">
                      <div>
                        <span className="block text-[10px] text-slate-500">Cód. Equipo:</span>
                        <span className="font-mono text-amber-400 font-bold">{formData.codigoEquipo || 'S/D'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500">Marca/Modelo:</span>
                        <span className="text-white truncate block">{formData.marcaModelo || 'S/D'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500">Patente:</span>
                        <span className="font-mono text-white font-bold">{formData.patente || 'S/D'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Selector de Chofer */}
                  <div className={`space-y-2 p-3 rounded-xl border transition-colors ${
                    isLocked ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-900/60 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-400">
                        Chofer / Operador:
                      </label>
                      {isLocked && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Bloqueado por Vale
                        </span>
                      )}
                    </div>
                    <SearchableSelect
                      placeholder="Buscar chofer por nombre y apellido..."
                      searchPlaceholder="Escriba el nombre o apellido del chofer..."
                      options={employeeOptions}
                      value={selectedEmployeeId}
                      onChange={handleSelectEmployee}
                      emptyMessage="No se encontró el empleado"
                      disabled={isLocked}
                    />
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400 pt-1">
                      <div>
                        <span className="block text-[10px] text-slate-500">Cód. Empleado:</span>
                        <span className="font-mono text-blue-400 font-bold">{formData.codigoEmpleado || 'S/D'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500">Nombre y Apellido:</span>
                        <span className="text-white truncate block">{formData.nombreApellido || 'S/D'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500">Legajo:</span>
                        <span className="font-mono text-white">{formData.legajo || 'S/D'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Selector de Obra Asignada (Opcional - Imputación directa de costo a Obra) */}
                <div className="p-3 rounded-xl border bg-slate-900/60 border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Obra Asignada (Opcional):</span>
                    </label>
                    {selectedObraId ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                        Imputado directo a Obra
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">
                        Si se deja vacío, se prorratea automáticamente según partes diarios
                      </span>
                    )}
                  </div>
                  <SearchableSelect
                    placeholder="Seleccionar obra para imputar este expendio..."
                    searchPlaceholder="Buscar obra por nombre, número o cliente..."
                    options={obraOptions}
                    value={selectedObraId}
                    onChange={handleSelectObra}
                    showClear={true}
                    emptyMessage="No se encontraron obras registradas"
                  />
                </div>
              </div>

              {/* Grid 3: Datos de Operación, Odómetro y Rendimiento Automático */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    {isCisternaODeposito ? (
                      <>
                        <Truck className="w-3.5 h-3.5 text-amber-400" />
                        Datos de Carga y Recepción en Cisterna / Depósito
                      </>
                    ) : (
                      <>
                        <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                        Odómetro Real del Ticket y Rendimiento Automático
                      </>
                    )}
                  </span>
                  <span className={`text-[10px] font-normal px-2 py-0.5 rounded border font-mono ${
                    isCisternaODeposito 
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 font-bold' 
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {isCisternaODeposito ? 'Sin Odómetro (Cisterna)' : 'Cálculo Automático'}
                  </span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 14. Nº DE ORDEN / DESPACHO (BLOQUEADO EN DESPACHO INTERNO) */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1 flex items-center justify-between">
                      <span>{cargaOrigin === 'DEPOSITO_PROPIO' ? 'Nº de Despacho Interno:' : 'Nº de Orden / Vale:'}</span>
                      {(isLocked || cargaOrigin === 'DEPOSITO_PROPIO') && (
                        <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Bloqueado
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={formData.numOrden}
                      onChange={(e) => setFormData({ ...formData, numOrden: e.target.value })}
                      disabled={isLocked || cargaOrigin === 'DEPOSITO_PROPIO'}
                      readOnly={isLocked || cargaOrigin === 'DEPOSITO_PROPIO'}
                      placeholder={cargaOrigin === 'DEPOSITO_PROPIO' ? 'DESP-2026-0001' : 'VAL-2026-000851'}
                      className={`w-full px-3 py-2 border rounded-lg text-xs font-mono focus:outline-none transition-colors ${
                        (isLocked || cargaOrigin === 'DEPOSITO_PROPIO')
                          ? 'bg-slate-950/80 border-slate-800 text-slate-400 cursor-not-allowed opacity-80' 
                          : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-amber-500'
                      }`}
                    />
                  </div>

                  {/* 15. FECHA DE CARGA */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1 flex items-center justify-between">
                      <span>Fecha de Carga:</span>
                      <span className="text-[10px] text-emerald-400 font-mono">Editable</span>
                    </label>
                    <input
                      type="date"
                      value={formData.fecha || ''}
                      onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Panel de Telemetría: Si es Cisterna o Depósito no lleva Odómetro ni Km */}
                {isCisternaODeposito ? (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Recepción de Combustible en Cisterna / Depósito
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30 font-semibold">
                            Sin Odómetro Requerido
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          Al cargarse una cisterna o depósito móvil, los litros registrados en el ticket ingresan directamente a su stock físico disponible. No requiere odómetro ni cálculo de km/L.
                        </p>
                      </div>
                    </div>
                    {targetDeposit && (
                      <div className="font-mono text-xs bg-slate-900/90 px-3.5 py-2.5 rounded-lg border border-slate-800 text-right">
                        <span className="text-[10px] text-slate-400 block font-sans">Stock Físico Cisterna:</span>
                        <span className="text-amber-400 font-bold">{targetDeposit.stockActual.toLocaleString()} Lts</span>
                        <span className="text-slate-400"> / {targetDeposit.capacidadTotal.toLocaleString()} Lts</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      {/* Odómetro Actual (Input Editable del Ticket) */}
                      <div className="md:col-span-4">
                        <label className="text-xs font-bold text-emerald-400 block mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                            Odómetro Actual (Ticket) *
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">Del surtidor</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            required
                            value={rawKilometraje}
                            onChange={(e) => {
                              let cleaned = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
                              const firstDot = cleaned.indexOf('.');
                              if (firstDot !== -1) {
                                cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
                              }
                              setRawKilometraje(cleaned);
                              const parsed = parseFloat(cleaned);
                              handleKmActualChange(!isNaN(parsed) && parsed >= 0 ? parsed : 0);
                            }}
                            onBlur={() => {
                              const parsed = parseFloat(rawKilometraje);
                              if (!isNaN(parsed) && parsed > 0) {
                                setRawKilometraje(String(parsed));
                                handleKmActualChange(parsed);
                              } else {
                                setRawKilometraje('');
                                handleKmActualChange(0);
                              }
                            }}
                            placeholder="Ej: 145200 o 102.5"
                            className="w-full px-3.5 py-2.5 bg-black/60 border-2 border-emerald-500/70 rounded-xl text-base font-mono font-black text-white focus:border-emerald-400 focus:outline-none pr-12"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-emerald-400 pointer-events-none">
                            km
                          </span>
                        </div>
                      </div>

                      {/* Resultados Calculados Automáticos (No editables) */}
                      <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {/* Carga Anterior / Odómetro Previo */}
                        <div className="bg-black/40 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Carga Anterior
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                              Base
                            </span>
                          </div>
                          <div className="text-sm font-bold font-mono text-slate-200 truncate">
                            {calculationResult.kmAnterior > 0 
                              ? `${calculationResult.kmAnterior.toLocaleString('es-AR')} km` 
                              : 'Sin registro'}
                          </div>
                          <span className="text-[10px] text-slate-500 truncate mt-1">
                            {previousDispensaryInfo?.source || 'Sin odómetro previo'}
                          </span>
                        </div>

                        {/* Kilómetros Recorridos (Diferencia Automática) */}
                        <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                              Km Recorridos
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold font-mono">
                              Automático
                            </span>
                          </div>
                          <div className="text-base font-black font-mono text-emerald-400">
                            {calculationResult.kmRec > 0 
                              ? `+${calculationResult.kmRec.toLocaleString('es-AR')} km` 
                              : '0 km'}
                          </div>
                          <span className="text-[10px] text-emerald-500/80 truncate mt-1">
                            Diferencia odómetros
                          </span>
                        </div>

                        {/* Autonomía Calculada (Automática) */}
                        <div className="bg-cyan-950/20 border border-cyan-500/30 rounded-xl p-3 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                              Autonomía
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold font-mono">
                              Automático
                            </span>
                          </div>
                          <div className="text-xs font-bold font-mono text-cyan-300 truncate">
                            {calculationResult.autonomia}
                          </div>
                          <span className="text-[10px] text-cyan-500/80 truncate mt-1">
                            {calculationResult.kmPerLiter > 0 ? `${calculationResult.kmPerLiter} km por Litro` : 'Recorrido / Litros'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Warning si odómetro es menor al previo */}
                    {calculationResult.kmAnterior > 0 && calculationResult.kmActual > 0 && calculationResult.kmActual < calculationResult.kmAnterior && (
                      <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                        <span className="font-bold">Aviso:</span> El odómetro ingresado ({calculationResult.kmActual.toLocaleString('es-AR')} km) es menor al odómetro de la carga anterior ({calculationResult.kmAnterior.toLocaleString('es-AR')} km). Verifique el número en el ticket.
                      </div>
                    )}

                    <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <span>
                        Los kilómetros recorridos y la autonomía se calculan automáticamente restando la carga anterior y dividiendo por los litros del ticket (no editables).
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Observaciones */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Observaciones Generales de la Carga:
                </label>
                <textarea
                  rows={2}
                  value={formData.observaciones || ''}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  placeholder="Detalles sobre el viaje, ruta o rendición..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-500 focus:outline-none resize-none"
                />
              </div>

            </div>
          ) : (
            /* TAB: Photographic Proofs (Column 21 & 22) */
            <div className="space-y-6">
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="w-4 h-4" />
                  Evidencia Fotográfica de Suministro (Columnas 21 y 22)
                </h4>
                <p className="text-xs text-slate-400">
                  {isCisternaODeposito 
                    ? 'Adjunte la foto del ticket impreso de surtidor para el ingreso del combustible a la cisterna (alojamiento exclusivo en Cloudflare R2).' 
                    : 'Adjunte la foto del ticket impreso de surtidor y la foto del odómetro para respaldo auditor (alojamiento exclusivo en Cloudflare R2).'}
                </p>
              </div>

              {uploadingPhotoField && (
                <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-2 animate-pulse">
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>
                    Subiendo {uploadingPhotoField === 'fotoExpendio' ? 'foto del ticket' : 'foto del odómetro'} a Cloudflare R2...
                  </span>
                </div>
              )}

              {r2Error && (
                <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-300">No se pudo subir la imagen a Cloudflare R2</p>
                      <p className="text-[11px] text-rose-200/90 mt-0.5">{r2Error}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setR2Error(null)}
                    className="text-rose-300 hover:text-white p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 21. FOTO_EXPENDIO */}
                <div className={`space-y-3 bg-slate-900/90 border border-slate-800 rounded-xl p-4 ${isCisternaODeposito ? 'md:col-span-2' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-white flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-mono font-bold">
                        21
                      </span>
                      21. FOTO_EXPENDIO (Ticket de Estación)
                    </label>
                    <div className="flex items-center gap-2">
                      {bolsaDocumentos.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setDocsPickerTarget('fotoExpendio')}
                          className="px-2.5 py-1 rounded-lg bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] border border-[#F0C800]/35 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>Elegir de Docs ({bolsaDocumentos.length})</span>
                        </button>
                      )}
                      {formData.fotoExpendio && (
                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Adjunta
                        </span>
                      )}
                    </div>
                  </div>

                  <ImageClipboardDropzone
                    currentImageUrl={formData.fotoExpendio}
                    onImageChange={(newPhoto, file) => handlePhotoSelected('fotoExpendio', newPhoto, file)}
                    onImageRemove={() => {
                      setFormData(prev => ({ ...prev, fotoExpendio: '' }));
                      setSelectedBagDocsMap(prev => ({ ...prev, fotoExpendio: undefined }));
                    }}
                    label="Ticket Impreso"
                    sublabel="Arrastrá la foto del ticket, hacé clic, pegá con Ctrl+V o elegí de Docs"
                    aspectRatio="video"
                    placeholderText="Pegar ticket con Ctrl+V o arrastrar imagen"
                  />
                </div>

                {/* 22. FOTO_KILOMETRAJE (Solo para vehículos con odómetro) */}
                {!isCisternaODeposito && (
                  <div className="space-y-3 bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-white flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-mono font-bold">
                          22
                        </span>
                        22. FOTO_KILOMETRAJE (Tablero / Odómetro)
                      </label>
                      <div className="flex items-center gap-2">
                        {bolsaDocumentos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setDocsPickerTarget('fotoKilometraje')}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/35 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>Elegir de Docs ({bolsaDocumentos.length})</span>
                          </button>
                        )}
                        {formData.fotoKilometraje && (
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Adjunta
                          </span>
                        )}
                      </div>
                    </div>

                    <ImageClipboardDropzone
                      currentImageUrl={formData.fotoKilometraje}
                      onImageChange={(newPhoto, file) => handlePhotoSelected('fotoKilometraje', newPhoto, file)}
                      onImageRemove={() => {
                        setFormData(prev => ({ ...prev, fotoKilometraje: '' }));
                        setSelectedBagDocsMap(prev => ({ ...prev, fotoKilometraje: undefined }));
                      }}
                      label="Foto del Odómetro / Tablero"
                      sublabel="Arrastrá la foto del tablero, pegá con Ctrl+V o elegí de Docs"
                      aspectRatio="video"
                      placeholderText="Pegar foto tablero con Ctrl+V o arrastrar imagen"
                    />
                  </div>
                )}

              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              <span className="font-bold text-amber-400">{formData.cantidad || 0} Lts reales</span> de{' '}
              <span className="text-white">{formData.tipoComb}</span> | Total:{' '}
              <strong className="text-white font-mono">
                ${((formData.cantidad || 0) * (formData.precioUnitario || 1200)).toLocaleString('es-AR')}
              </strong>
              {cargaOrigin === 'ESTACION' && formData.numVale && (
                <span className="ml-2 text-emerald-400 font-bold">• Vale Nº {formData.numVale} pasará a RENDIDO</span>
              )}
              {cargaOrigin === 'DEPOSITO_PROPIO' && (
                <span className="ml-2 text-amber-400 font-bold">• Descuento directo de stock cisterna</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-2 shadow-lg transition cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{voucherToEdit ? 'Guardar Cambios' : (cargaOrigin === 'DEPOSITO_PROPIO' ? 'Registrar Despacho de Cisterna' : (formData.numVale ? 'Registrar Ticket y Rendir Vale' : 'Registrar Expendio'))}</span>
              </button>
            </div>
          </div>
        </form>

      </div>

      <BolsaDocumentosPickerModal
        isOpen={Boolean(docsPickerTarget)}
        onClose={() => setDocsPickerTarget(null)}
        documents={bolsaDocumentos}
        defaultCategory="COMBUSTIBLE"
        selectedUrl={docsPickerTarget === 'fotoExpendio' ? formData.fotoExpendio : formData.fotoKilometraje}
        title={
          docsPickerTarget === 'fotoExpendio'
            ? 'Elegir Ticket de Combustible desde Docs'
            : 'Elegir Foto de Odómetro / Tablero desde Docs'
        }
        onSelect={(doc) => {
          if (!docsPickerTarget) return;
          setFormData((prev) => ({ ...prev, [docsPickerTarget]: doc.url }));
          setSelectedBagDocsMap((prev) => ({ ...prev, [docsPickerTarget]: doc.id }));
        }}
      />
    </div>
  );
};
