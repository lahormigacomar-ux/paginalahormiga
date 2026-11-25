import React, { useState, useEffect, useMemo } from 'react';
import { IssuedFuelVoucher, Vehicle, Employee, FuelDeposit, DocumentBagItem } from '../types';
import { SearchableSelect } from './SearchableSelect';
import { BolsaDocumentosPickerModal } from './common/BolsaDocumentosPickerModal';
import { 
  X, 
  Ticket, 
  Truck, 
  User, 
  MapPin, 
  Fuel, 
  Calendar, 
  Clock, 
  Lock, 
  AlertCircle,
  Building2,
  Check,
  Sparkles,
  Camera,
  FolderOpen,
  Trash2
} from 'lucide-react';

interface IssuedVoucherFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (voucher: IssuedFuelVoucher) => void;
  voucherToEdit?: IssuedFuelVoucher | null;
  aiPrefillDraft?: Partial<IssuedFuelVoucher> | null;
  fleet: Vehicle[];
  employees: Employee[];
  deposits: FuelDeposit[];
  existingCount: number;
  bolsaDocumentos?: DocumentBagItem[];
  onLinkBolsaDocument?: (docId: string, targetId: string, targetLabel: string) => void;
}

import { loadFuelPrices } from '../services/storage';

const CUSTOM_FUEL_SENTINEL = '__OTRO__';
const OTHER_FUEL_PRESETS = [
  'UREA / ADBLUE',
  'ACEITE MOTOR',
  'ACEITE HIDRAULICO',
  'GRASA',
  'REFRIGERANTE',
  'OTRO'
];

export const IssuedVoucherFormModal: React.FC<IssuedVoucherFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  voucherToEdit,
  aiPrefillDraft = null,
  fleet,
  employees,
  deposits,
  existingCount,
  bolsaDocumentos = [],
  onLinkBolsaDocument,
}) => {
  const [formData, setFormData] = useState<Partial<IssuedFuelVoucher>>({
    id: '',
    numVale: '',
    numComprobante: '',
    fechaEmision: new Date().toISOString().slice(0, 10),
    horaEmision: new Date().toTimeString().slice(0, 5),
    codigoEquipo: '',
    marcaModelo: '',
    patente: '',
    codigoEmpleado: '',
    nombreApellido: '',
    legajo: '',
    tipoComb: 'DIESEL COMUN',
    idCombustible: 'COMB-D500',
    litrosAutorizados: undefined,
    tipoCarga: 'Completa (Tanque Lleno)',
    estacionSurtidor: '',
    numEstacion: '',
    estado: 'EMITIDO',
    observaciones: ''
  });

  const [targetType, setTargetType] = useState<'vehicle' | 'deposit'>('vehicle');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedDepositTargetId, setSelectedDepositTargetId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedDepositId, setSelectedDepositId] = useState<string>('');
  const [customStationName, setCustomStationName] = useState<string>('');
  const [isAddingCustomStation, setIsAddingCustomStation] = useState<boolean>(false);
  const [isDocsPickerOpen, setIsDocsPickerOpen] = useState<boolean>(false);
  const [selectedBagDocId, setSelectedBagDocId] = useState<string | null>(null);
  const [isCustomFuel, setIsCustomFuel] = useState<boolean>(false);
  const [customFuelDetail, setCustomFuelDetail] = useState<string>('');

  const [availableCatalogFuels, setAvailableCatalogFuels] = useState<Array<{ name: string; id: string }>>([
    { name: 'DIESEL COMUN', id: 'COMB-D500' },
    { name: 'DIESEL INFINIA', id: 'COMB-INFD' },
    { name: 'NAFTA SUPER', id: 'COMB-SUPER' },
    { name: 'NAFTA INFINIA', id: 'COMB-INFIN' }
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const catalog = loadFuelPrices();
    const list = Object.keys(catalog).filter(Boolean).map(name => {
      const cleanSlug = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return {
        name,
        id: `COMB-${cleanSlug}`
      };
    });
    if (list.length > 0) {
      setAvailableCatalogFuels(list);
    }
  }, [isOpen]);

  // Filter deposits to ONLY include Service Stations (Vales para Estación de Servicio), strictly excluding bidones and internal deposits
  const serviceStations = useMemo(() => {
    return deposits.filter(d => 
      d.modalidad !== 'BIDONES' &&
      d.modalidad !== 'DEPOSITO_AMBULANTE' &&
      !d.nombre.toLowerCase().includes('bidon') &&
      (d.modalidad === 'VALES_ESTACION' || 
       d.modalidadLabel?.toLowerCase().includes('estaci') ||
       Boolean(d.empresaBandera) ||
       Boolean(d.numEstacionConvenio))
    );
  }, [deposits]);

  const selectedStationObj = useMemo(() => {
    return serviceStations.find(s => s.id === selectedDepositId);
  }, [serviceStations, selectedDepositId]);

  const availableFuelsForStation = useMemo(() => {
    const catalog = availableCatalogFuels.filter(f => f.name && !f.name.includes('/'));

    if (selectedStationObj) {
      const stationFuels: string[] = selectedStationObj.tiposCombustibles && selectedStationObj.tiposCombustibles.length > 0
        ? selectedStationObj.tiposCombustibles
        : (selectedStationObj.tipoCombustible
            ? selectedStationObj.tipoCombustible.split('/').map(s => s.trim()).filter(Boolean)
            : []);

      if (stationFuels.length > 0) {
        const matched: Array<{ name: string; id: string }> = [];
        stationFuels.forEach(sf => {
          const found = catalog.find(c => c.name.toUpperCase() === sf.toUpperCase() || sf.toUpperCase().includes(c.name.toUpperCase()) || c.name.toUpperCase().includes(sf.toUpperCase()));
          if (found) {
            if (!matched.some(m => m.name === found.name)) {
              matched.push(found);
            }
          } else {
            const cleanSlug = sf.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            matched.push({
              name: sf,
              id: `COMB-${cleanSlug}`
            });
          }
        });
        if (matched.length > 0) return matched;
      }
    }

    return catalog;
  }, [availableCatalogFuels, selectedStationObj]);

  // Transform Fleet into Searchable Options displaying strictly: "Marca Modelo - Patente"
  const vehicleOptions = useMemo(() => {
    return fleet.map(veh => {
      const brandModel = veh.modeloMarca || [veh.marca, veh.modelo].filter(Boolean).join(' ') || veh.codigoEquipo || 'Equipo';
      const licensePlate = veh.patente ? veh.patente.trim() : 'S/P';
      const label = `${brandModel} - ${licensePlate}`;

      return {
        value: veh.id,
        label,
        extraSearchTerms: `${veh.codigoEquipo || ''} ${veh.clasificacion || ''} ${veh.combustible || ''}`
      };
    });
  }, [fleet]);

  // Transform Internal Deposits / Cisterns into Searchable Options (Excluding service stations)
  const depositTargetOptions = useMemo(() => {
    return deposits
      .filter(d => d.modalidad !== 'VALES_ESTACION' && !d.modalidadLabel?.toLowerCase().includes('estaci'))
      .map(d => ({
        value: d.id,
        label: `${d.nombre} (${d.tipoCombustible || 'Combustible'})`,
        secondaryText: `Stock: ${d.stockActual || 0} Lts • ${d.ubicacion || 'Base'}`
      }));
  }, [deposits]);

  // Transform Employees into Searchable Options displaying strictly: "Nombre y Apellido"
  const employeeOptions = useMemo(() => {
    return employees.map(emp => {
      return {
        value: emp.id,
        label: emp.nombreApellido || `${emp.codigoEmpleado || 'Empleado'}`,
        extraSearchTerms: `${emp.codigoEmpleado || ''} ${emp.legajo || ''} ${emp.dni || ''} ${emp.categoria || ''}`
      };
    });
  }, [employees]);

  // Transform Service Stations into Searchable Options
  const stationOptions = useMemo(() => {
    return serviceStations.map(d => {
      const brand = d.empresaBandera ? `[${d.empresaBandera}] ` : '';
      const name = d.nombreEstacion || d.nombre;
      const label = `${brand}${name}`;
      const location = d.direccionEstacion || d.ubicacion || undefined;

      return {
        value: d.id,
        label,
        secondaryText: location,
        extraSearchTerms: `${d.numEstacionConvenio || ''} ${d.codigo || ''} ${d.empresaBandera || ''} ${d.ubicacion || ''}`
      };
    });
  }, [serviceStations]);

  useEffect(() => {
    setSelectedBagDocId(null);
    const catalogNames = new Set(availableCatalogFuels.map(f => f.name.toUpperCase()));
    serviceStations.forEach(st => {
      (st.tiposCombustibles || []).forEach(f => catalogNames.add(f.trim().toUpperCase()));
      if (st.tipoCombustible) {
        st.tipoCombustible.split('/').forEach(f => {
          const clean = f.trim().toUpperCase();
          if (clean) catalogNames.add(clean);
        });
      }
    });

    if (voucherToEdit) {
      setFormData(voucherToEdit);
      const editComb = (voucherToEdit.tipoComb || '').trim();
      const editIsCustom =
        voucherToEdit.idCombustible === 'COMB-OTRO' ||
        (Boolean(editComb) && !catalogNames.has(editComb.toUpperCase()));
      setIsCustomFuel(editIsCustom);
      setCustomFuelDetail(editIsCustom ? editComb : '');

      const matchedVeh = fleet.find(v => v.codigoEquipo === voucherToEdit.codigoEquipo || v.patente === voucherToEdit.patente);
      if (matchedVeh) setSelectedVehicleId(matchedVeh.id);
      
      const matchedEmp = employees.find(e => e.nombreApellido === voucherToEdit.nombreApellido || e.codigoEmpleado === voucherToEdit.codigoEmpleado || e.legajo === voucherToEdit.legajo);
      if (matchedEmp) setSelectedEmployeeId(matchedEmp.id);

      const matchedDep = serviceStations.find(d => d.nombre === voucherToEdit.estacionSurtidor || d.numEstacionConvenio === voucherToEdit.numEstacion || (d.nombreEstacion && d.nombreEstacion === voucherToEdit.estacionSurtidor));
      if (matchedDep) {
        setSelectedDepositId(matchedDep.id);
        setIsAddingCustomStation(false);
      } else if (voucherToEdit.estacionSurtidor) {
        setSelectedDepositId('custom');
        setCustomStationName(voucherToEdit.estacionSurtidor);
        setIsAddingCustomStation(true);
      }
    } else {
      const now = new Date();
      const currentDate = now.toISOString().slice(0, 10);
      const currentTime = now.toTimeString().slice(0, 5);

      const firstStation = serviceStations[0];

      if (aiPrefillDraft) {
        const dPlate = (aiPrefillDraft.patente || '').toLowerCase().trim();
        const dCode = (aiPrefillDraft.codigoEquipo || '').toLowerCase().trim();
        const dModel = (aiPrefillDraft.marcaModelo || '').toLowerCase().trim();
        const matchedVeh = fleet.find(v => {
          if (dPlate && (v.patente || '').toLowerCase().trim() === dPlate) return true;
          if (dCode && ((v.codigoEquipo || '').toLowerCase().trim() === dCode || (v.codigoInterno || '').toLowerCase().trim() === dCode)) return true;
          if (dModel && (v.modeloMarca || '').toLowerCase().includes(dModel)) return true;
          return false;
        });

        const dEmpName = (aiPrefillDraft.nombreApellido || '').toLowerCase().trim();
        const dEmpCode = (aiPrefillDraft.codigoEmpleado || '').toLowerCase().trim();
        const matchedEmp = employees.find(e => {
          if (dEmpCode && ((e.codigoEmpleado || '').toLowerCase().trim() === dEmpCode || (e.legajo || '').toLowerCase().trim() === dEmpCode)) return true;
          if (dEmpName && ((e.nombreApellido || '').toLowerCase().includes(dEmpName) || dEmpName.includes((e.nombreApellido || '').toLowerCase()))) return true;
          return false;
        });

        const dStation = (aiPrefillDraft.estacionSurtidor || '').toLowerCase().trim();
        const matchedDep = serviceStations.find(d => {
          const n = (d.nombre || '').toLowerCase();
          const ne = (d.nombreEstacion || '').toLowerCase();
          const b = (d.empresaBandera || '').toLowerCase();
          return (dStation && (n.includes(dStation) || ne.includes(dStation) || (b && dStation.includes(b))));
        });

        setFormData({
          id: `VAL-${Date.now().toString().slice(-4)}`,
          numVale: aiPrefillDraft.numVale || '',
          numComprobante: aiPrefillDraft.numComprobante || '',
          fechaEmision: aiPrefillDraft.fechaEmision || currentDate,
          horaEmision: aiPrefillDraft.horaEmision || currentTime,
          codigoEquipo: matchedVeh?.codigoEquipo || aiPrefillDraft.codigoEquipo || '',
          marcaModelo: matchedVeh?.modeloMarca || aiPrefillDraft.marcaModelo || '',
          patente: matchedVeh?.patente || aiPrefillDraft.patente || '',
          codigoEmpleado: matchedEmp?.codigoEmpleado || aiPrefillDraft.codigoEmpleado || '',
          nombreApellido: matchedEmp?.nombreApellido || aiPrefillDraft.nombreApellido || '',
          legajo: matchedEmp?.legajo || aiPrefillDraft.legajo || '',
          tipoComb: aiPrefillDraft.tipoComb || 'DIESEL COMUN',
          idCombustible: `COMB-${(aiPrefillDraft.tipoComb || 'D500').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`,
          litrosAutorizados: aiPrefillDraft.litrosAutorizados && Number(aiPrefillDraft.litrosAutorizados) > 0 ? Number(aiPrefillDraft.litrosAutorizados) : undefined,
          tipoCarga: aiPrefillDraft.tipoCarga || (aiPrefillDraft.litrosAutorizados ? 'Carga Parcial' : 'Completa (Tanque Lleno)'),
          estacionSurtidor: matchedDep ? (matchedDep.nombreEstacion || matchedDep.nombre) : (aiPrefillDraft.estacionSurtidor || (firstStation ? (firstStation.nombreEstacion || firstStation.nombre) : '')),
          numEstacion: matchedDep?.numEstacionConvenio || aiPrefillDraft.numEstacion || firstStation?.numEstacionConvenio || '',
          odometroSalida: aiPrefillDraft.odometroSalida ? Number(aiPrefillDraft.odometroSalida) : undefined,
          fotoTicket: aiPrefillDraft.fotoTicket,
          estado: 'EMITIDO',
          observaciones: aiPrefillDraft.observaciones || ''
        });

        const aiComb = (aiPrefillDraft.tipoComb || '').trim();
        const aiIsCustom = Boolean(aiComb) && !catalogNames.has(aiComb.toUpperCase());
        setIsCustomFuel(aiIsCustom);
        setCustomFuelDetail(aiIsCustom ? aiComb : '');

        setSelectedVehicleId(matchedVeh ? matchedVeh.id : '');
        setSelectedEmployeeId(matchedEmp ? matchedEmp.id : '');
        if (matchedDep) {
          setSelectedDepositId(matchedDep.id);
          setIsAddingCustomStation(false);
        } else if (aiPrefillDraft.estacionSurtidor) {
          setSelectedDepositId('custom');
          setCustomStationName(aiPrefillDraft.estacionSurtidor);
          setIsAddingCustomStation(true);
        } else if (firstStation) {
          setSelectedDepositId(firstStation.id);
          setIsAddingCustomStation(false);
        }
      } else {
        // Reset form: numVale starts EMPTY for the user to fill in physical voucher number
        setIsCustomFuel(false);
        setCustomFuelDetail('');
        setFormData({
          id: `VAL-${Date.now().toString().slice(-4)}`,
          numVale: '', // Starts empty for the user to fill with the physical voucher number
          numComprobante: '',
          fechaEmision: currentDate,
          horaEmision: currentTime,
          codigoEquipo: '',
          marcaModelo: '',
          patente: '',
          codigoEmpleado: '',
          nombreApellido: '',
          legajo: '',
          tipoComb: 'DIESEL COMUN',
          idCombustible: 'COMB-D500',
          litrosAutorizados: undefined,
          tipoCarga: 'Completa (Tanque Lleno)',
          estacionSurtidor: firstStation ? (firstStation.nombreEstacion || firstStation.nombre) : '',
          numEstacion: firstStation?.numEstacionConvenio || firstStation?.codigo || '',
          estado: 'EMITIDO',
          observaciones: ''
        });

        setSelectedVehicleId('');
        setSelectedEmployeeId('');
        if (firstStation) {
          setSelectedDepositId(firstStation.id);
          setIsAddingCustomStation(false);
        } else {
          setSelectedDepositId('');
          setIsAddingCustomStation(false);
        }
      }
    }
  }, [voucherToEdit, aiPrefillDraft, isOpen, fleet, employees, serviceStations, availableCatalogFuels]);

  const handleSelectVehicle = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    const veh = fleet.find(v => v.id === vehicleId);
    if (!veh) {
      setFormData(prev => ({
        ...prev,
        codigoEquipo: '',
        marcaModelo: '',
        patente: ''
      }));
      return;
    }

    let defaultFuel = 'DIESEL COMUN';
    let defaultFuelId = 'COMB-D500';

    if (veh.combustible === 'Nafta') {
      defaultFuel = 'NAFTA SUPER';
      defaultFuelId = 'COMB-SUPER';
    } else if (veh.clasificacion?.includes('Camión') || veh.modeloMarca?.includes('Actros')) {
      defaultFuel = 'DIESEL INFINIA';
      defaultFuelId = 'COMB-INF-D';
    }

    setFormData(prev => ({
      ...prev,
      codigoEquipo: veh.codigoEquipo,
      marcaModelo: veh.modeloMarca || [veh.marca, veh.modelo].filter(Boolean).join(' ') || veh.codigoEquipo,
      patente: veh.patente || '',
      tipoComb: isCustomFuel ? prev.tipoComb : defaultFuel,
      idCombustible: isCustomFuel ? 'COMB-OTRO' : defaultFuelId
    }));

    // Auto-select assigned employee if one is assigned to this vehicle
    const assignedEmp = employees.find(e => e.vehiculoAsignadoId === veh.id);
    if (assignedEmp) {
      handleSelectEmployee(assignedEmp.id);
    }
  };

  const handleSelectTargetDeposit = (depositId: string) => {
    setSelectedDepositTargetId(depositId);
    const dep = deposits.find(d => d.id === depositId);
    if (!dep) {
      setFormData(prev => ({ ...prev, codigoEquipo: '', marcaModelo: '', patente: '' }));
      return;
    }
    setFormData(prev => ({
      ...prev,
      codigoEquipo: dep.codigo || dep.id,
      marcaModelo: dep.nombre,
      patente: dep.patenteVehiculo || 'CISTERNA',
      tipoComb: isCustomFuel ? prev.tipoComb : 'DIESEL COMUN',
      idCombustible: isCustomFuel ? 'COMB-OTRO' : 'COMB-D500'
    }));
  };

  const handleSelectEmployee = (empId: string) => {
    setSelectedEmployeeId(empId);
    const emp = employees.find(e => e.id === empId);
    if (!emp) {
      setFormData(prev => ({
        ...prev,
        codigoEmpleado: '',
        nombreApellido: '',
        legajo: ''
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      codigoEmpleado: emp.codigoEmpleado || '',
      nombreApellido: emp.nombreApellido || '',
      legajo: emp.legajo || ''
    }));
  };

  const handleSelectDeposit = (depositId: string) => {
    setSelectedDepositId(depositId);
    if (depositId === 'custom') {
      setIsAddingCustomStation(true);
      return;
    }
    setIsAddingCustomStation(false);
    const dep = serviceStations.find(d => d.id === depositId);
    if (!dep) return;

    const fuels = dep.tiposCombustibles && dep.tiposCombustibles.length > 0
      ? dep.tiposCombustibles
      : (dep.tipoCombustible ? dep.tipoCombustible.split('/').map(s => s.trim()).filter(Boolean) : []);

    const currentFuelValid = fuels.some(f => f.toUpperCase() === (formData.tipoComb || '').toUpperCase());
    const defaultFuel = currentFuelValid ? formData.tipoComb : (fuels.length > 0 ? fuels[0] : (formData.tipoComb || 'DIESEL COMUN'));
    const fuelObj = availableCatalogFuels.find(f => f.name === defaultFuel);

    setFormData(prev => ({
      ...prev,
      estacionSurtidor: dep.nombreEstacion || dep.nombre,
      numEstacion: dep.numEstacionConvenio || dep.codigo || '',
      tipoComb: isCustomFuel ? prev.tipoComb : defaultFuel,
      idCombustible: isCustomFuel
        ? 'COMB-OTRO'
        : (fuelObj?.id || `COMB-${(defaultFuel || 'DIESEL').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const voucherNumber = (formData.numVale || '').trim();
    if (!voucherNumber) {
      alert('⚠️ Dato obligatorio faltante: El Número de Vale es obligatorio.');
      return;
    }

    if (!formData.fechaEmision) {
      alert('⚠️ Dato obligatorio faltante: La Fecha de Emisión es obligatoria.');
      return;
    }

    if (targetType === 'vehicle' && !selectedVehicleId && !formData.marcaModelo && !formData.codigoEquipo) {
      alert('⚠️ Dato obligatorio faltante: Debe seleccionar un Equipo / Vehículo de Flota.');
      return;
    }

    if (targetType === 'deposit' && !selectedDepositTargetId && !formData.marcaModelo) {
      alert('⚠️ Dato obligatorio faltante: Debe seleccionar una Cisterna / Depósito Destino.');
      return;
    }

    if (!selectedEmployeeId && !formData.nombreApellido) {
      alert('⚠️ Dato obligatorio faltante: El Chofer / Operador Responsable es obligatorio.');
      return;
    }

    const stationName = isAddingCustomStation 
      ? customStationName.trim() 
      : (formData.estacionSurtidor || '').trim();

    if (!stationName) {
      alert('⚠️ Dato obligatorio faltante: La Estación de Servicio Habilitada es obligatoria.');
      return;
    }

    const resolvedTipoComb = isCustomFuel
      ? (customFuelDetail.trim().toUpperCase() || 'OTRO')
      : (formData.tipoComb || '').trim();

    if (!resolvedTipoComb) {
      alert('⚠️ Dato obligatorio faltante: El Tipo de Combustible / Insumo Habilitado es obligatorio.');
      return;
    }

    if (!formData.tipoCarga) {
      alert('⚠️ Dato obligatorio faltante: La Modalidad de Carga es obligatoria.');
      return;
    }

    const isTanqueLleno = !formData.tipoCarga || formData.tipoCarga === 'Completa (Tanque Lleno)' || formData.tipoCarga.includes('Tanque Lleno');

    if (!isTanqueLleno) {
      const ltrs = Number(formData.litrosAutorizados);
      if (!ltrs || isNaN(ltrs) || ltrs <= 0) {
        alert('⚠️ Dato obligatorio faltante: Por favor ingrese la cantidad autorizada para la carga parcial.');
        return;
      }
    }

    const valeFinal: IssuedFuelVoucher = {
      id: formData.id || `VAL-${Date.now().toString().slice(-4)}`,
      numVale: voucherNumber,
      numComprobante: voucherNumber,
      fechaEmision: formData.fechaEmision || new Date().toISOString().slice(0, 10),
      horaEmision: formData.horaEmision || new Date().toTimeString().slice(0, 5),
      codigoEquipo: formData.codigoEquipo || '',
      marcaModelo: formData.marcaModelo || '',
      patente: formData.patente || '',
      codigoEmpleado: formData.codigoEmpleado || '',
      nombreApellido: formData.nombreApellido || '',
      legajo: formData.legajo || '',
      tipoComb: resolvedTipoComb,
      idCombustible: isCustomFuel ? 'COMB-OTRO' : (formData.idCombustible || 'COMB-D500'),
      litrosAutorizados: isTanqueLleno ? undefined : (Number(formData.litrosAutorizados) || undefined),
      cantidad: isTanqueLleno 
        ? (formData.litrosReales || undefined) 
        : (Number(formData.litrosAutorizados) || undefined),
      tipoCarga: formData.tipoCarga || 'Completa (Tanque Lleno)',
      estacionSurtidor: stationName,
      numEstacion: formData.numEstacion || '',
      estado: (formData.estado as 'EMITIDO' | 'RENDIDO' | 'ANULADO') || 'EMITIDO',
      observaciones: formData.observaciones || '',
      fechaRendicion: formData.fechaRendicion,
      horaRendicion: formData.horaRendicion,
      expendioId: formData.expendioId,
      numTicket: formData.numTicket,
      litrosReales: formData.litrosReales,
      odometroCarga: formData.odometroCarga,
      importeTotal: formData.importeTotal,
      precioUnitario: formData.precioUnitario,
      diferenciaLitros: formData.diferenciaLitros,
      fotoTicket: formData.fotoTicket,
      fotoOdometro: formData.fotoOdometro
    };

    onSave(valeFinal);
    if (selectedBagDocId && onLinkBolsaDocument && valeFinal.fotoTicket) {
      onLinkBolsaDocument(
        selectedBagDocId,
        valeFinal.id,
        `Vale Nº ${valeFinal.numVale} · ${valeFinal.marcaModelo || valeFinal.patente || ''}`
      );
    }
    setSelectedBagDocId(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-[#16191F] border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 bg-black/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Ticket className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>{voucherToEdit ? 'Editar Vale de Combustible' : 'Emisión de Vale de Combustible'}</span>
                {voucherToEdit && formData.numVale && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono font-bold">
                    Nº {formData.numVale}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Paso 1 del Circuito: Emitir vale para entrega al chofer antes de acudir a la estación de servicio.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {!voucherToEdit && aiPrefillDraft && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-[#F0C800] shrink-0 mt-0.5" />
              <div className="text-xs text-slate-200 leading-relaxed">
                <strong className="text-[#F0C800]">Vale leído por IA:</strong> Revisá el número de vale, litros autorizados, máquina y chofer, y tocá <strong>Emitir Vale</strong> para guardarlo.
              </div>
            </div>
          )}

          {/* Circuito Notice Banner */}
          <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-800/40 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200/90 leading-relaxed">
              <span className="font-bold text-amber-400">Emisión de Vale:</span> Complete el número de vale del talonario físico, seleccione el equipo y chofer. Puede modificar la fecha y hora si necesita registrar emisiones pasadas o de prueba. Al cargar en la estación, el chofer rendirá el ticket en <span className="font-bold text-white">Expendio de Combustible</span>.
            </div>
          </div>

          {/* Grid: Número de Vale y Fecha */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Número de Vale (Empieza vacío para llenar; bloqueado si es edición) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-amber-400" />
                  Número de Vale <span className="text-amber-500">*</span>
                </span>
                {voucherToEdit ? (
                  <span className="text-[10px] text-amber-400/90 font-mono flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Fijo
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">Talonario Físico</span>
                )}
              </label>
              <input
                type="text"
                required
                disabled={Boolean(voucherToEdit)}
                value={formData.numVale || ''}
                onChange={e => setFormData({ ...formData, numVale: e.target.value, numComprobante: e.target.value })}
                placeholder="Ej: 02627 o VAL-00123"
                className={`w-full border rounded-xl px-3 py-2.5 text-sm font-mono font-bold transition focus:outline-none ${
                  voucherToEdit
                    ? 'bg-slate-900/60 border-slate-800 text-slate-300 cursor-not-allowed'
                    : 'bg-[#0F1115] border-slate-700 text-amber-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 placeholder-slate-600'
                }`}
              />
              <p className="text-[10px] text-slate-500 mt-1">
                {voucherToEdit 
                  ? 'El número de vale no puede modificarse tras su emisión.' 
                  : 'Ingrese el número impreso del vale físico a entregar.'}
              </p>
            </div>

            {/* 2. Fecha de Emisión (Editable) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  Fecha de Emisión <span className="text-amber-500">*</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">Editable</span>
              </label>
              <input
                type="date"
                required
                value={formData.fechaEmision || ''}
                onChange={e => setFormData({ ...formData, fechaEmision: e.target.value })}
                className="w-full bg-[#0F1115] border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Selector de Tipo de Destino (Vehículo vs Cisterna/Depósito) */}
          <div className="flex items-center gap-2 bg-[#0F1115] p-1.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setTargetType('vehicle');
                setSelectedDepositTargetId('');
                if (selectedVehicleId) handleSelectVehicle(selectedVehicleId);
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                targetType === 'vehicle'
                  ? 'bg-amber-500 text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Equipo / Vehículo de Flota</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetType('deposit');
                setSelectedVehicleId('');
                setFormData(prev => ({ ...prev, codigoEquipo: '', marcaModelo: '', patente: '' }));
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                targetType === 'deposit'
                  ? 'bg-amber-500 text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Cisterna / Depósito de Combustible</span>
            </button>
          </div>

          {targetType === 'vehicle' ? (
            <div className="bg-[#0F1115] p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-amber-400" />
                  Equipo / Vehículo Destino
                </label>
                {selectedVehicleId && formData.patente && (
                  <span className="text-[11px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Patente: {formData.patente}
                  </span>
                )}
              </div>

              <SearchableSelect
                label="Seleccionar Equipo de la Flota:"
                placeholder="Buscar por marca, modelo o patente..."
                searchPlaceholder="Escriba marca, modelo o patente (ej: Actros, Hilux, AD 456)..."
                options={vehicleOptions}
                value={selectedVehicleId}
                onChange={handleSelectVehicle}
                required
                emptyMessage="No se encontró ningún equipo con ese texto"
              />
            </div>
          ) : (
            <div className="bg-[#0F1115] p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-amber-400" />
                  Cisterna / Depósito Destino
                </label>
                {selectedDepositTargetId && (
                  <span className="text-[11px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Tipo: Cisterna
                  </span>
                )}
              </div>

              <SearchableSelect
                label="Seleccionar Cisterna o Depósito:"
                placeholder="Buscar depósito o cisterna..."
                searchPlaceholder="Escriba nombre de cisterna o depósito..."
                options={depositTargetOptions}
                value={selectedDepositTargetId}
                onChange={handleSelectTargetDeposit}
                required
                emptyMessage="No se encontró ningún depósito interno"
              />
            </div>
          )}

          {/* Selector de Chofer / Operador (Desplegable con búsqueda rápida en vivo) */}
          <div className="bg-[#0F1115] p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-blue-400" />
                Chofer / Operador Responsable
              </label>
              {selectedEmployeeId && formData.nombreApellido && (
                <span className="text-[11px] text-blue-400 font-medium bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  {formData.nombreApellido}
                </span>
              )}
            </div>

            <SearchableSelect
              label="Seleccionar Operador / Chofer:"
              placeholder="Buscar chofer por nombre y apellido..."
              searchPlaceholder="Escriba el nombre o apellido del chofer..."
              options={employeeOptions}
              value={selectedEmployeeId}
              onChange={handleSelectEmployee}
              required
              emptyMessage="No se encontró ningún empleado con ese nombre"
            />
          </div>

          {/* Estación de Servicio Habilitada (Solo Estaciones de Servicio Creadas) */}
          <div className="bg-[#0F1115] p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-400" />
                Estación de Servicio Habilitada
              </label>
              <span className="text-[11px] text-slate-400">
                {serviceStations.length} estación{serviceStations.length === 1 ? '' : 'es'} registrada{serviceStations.length === 1 ? '' : 's'}
              </span>
            </div>

            {serviceStations.length > 0 ? (
              <SearchableSelect
                label="Seleccionar Estación de Servicio:"
                placeholder="Seleccionar estación habilitada..."
                searchPlaceholder="Buscar estación por nombre, bandera o localidad..."
                options={stationOptions}
                value={selectedDepositId}
                onChange={handleSelectDeposit}
                required
                emptyMessage="No se encontraron estaciones con ese criterio"
              />
            ) : (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 space-y-2">
                <p>No se encontraron Estaciones de Servicio configuradas en <strong>Depósitos de Carga</strong>.</p>
                <div>
                  <label className="block text-[11px] text-slate-300 mb-1">Nombre de la Estación de Servicio:</label>
                  <input
                    type="text"
                    required
                    value={formData.estacionSurtidor || ''}
                    onChange={e => setFormData({ ...formData, estacionSurtidor: e.target.value })}
                    placeholder="Ej: Estación de Servicio..."
                    className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Combustible, Modalidad de Carga y Litros Autorizados (Solo en Carga Parcial) */}
          <div className="bg-[#0F1115] p-4 rounded-xl border border-slate-800 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5 text-amber-400" />
                  Tipo de Combustible Habilitado
                </label>
                <select
                  value={isCustomFuel ? CUSTOM_FUEL_SENTINEL : (formData.tipoComb || 'DIESEL COMUN')}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === CUSTOM_FUEL_SENTINEL) {
                      setIsCustomFuel(true);
                      const detail = customFuelDetail.trim().toUpperCase() || 'OTRO';
                      setFormData({
                        ...formData,
                        tipoComb: detail,
                        idCombustible: 'COMB-OTRO'
                      });
                    } else {
                      setIsCustomFuel(false);
                      setCustomFuelDetail('');
                      const item = availableFuelsForStation.find(f => f.name === val);
                      setFormData({
                        ...formData,
                        tipoComb: val,
                        idCombustible: item?.id || 'COMB-D500'
                      });
                    }
                  }}
                  className="w-full bg-[#16191F] border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  {availableFuelsForStation.map((f, idx) => (
                    <option key={`${f.name}-${f.id || idx}`} value={f.name}>
                      ⛽ {f.name} (Habilitado)
                    </option>
                  ))}
                  <option value={CUSTOM_FUEL_SENTINEL}>
                    📦 OTRO (Urea, Aceite, Lubricante, etc.)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Modalidad de Carga</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                    !formData.tipoCarga || formData.tipoCarga.includes('Tanque Lleno')
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  }`}>
                    {!formData.tipoCarga || formData.tipoCarga.includes('Tanque Lleno') ? 'Sin límite de litros' : 'Cupo fijado'}
                  </span>
                </label>
                <select
                  value={formData.tipoCarga || 'Completa (Tanque Lleno)'}
                  onChange={e => {
                    const newTipo = e.target.value;
                    const isFull = newTipo.includes('Tanque Lleno');
                    setFormData(prev => ({
                      ...prev,
                      tipoCarga: newTipo,
                      litrosAutorizados: isFull ? undefined : (prev.litrosAutorizados || 80)
                    }));
                  }}
                  className="w-full bg-[#16191F] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="Completa (Tanque Lleno)">Completa (Tanque Lleno)</option>
                  <option value="Carga Parcial">Carga Parcial (Fijar Litros)</option>
                </select>
              </div>
            </div>

            {/* Detalle de producto personalizado cuando se elige OTRO (Urea, Aceite, Lubricante, etc.) */}
            {isCustomFuel && (
              <div className="p-3.5 bg-violet-950/25 border border-violet-500/40 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-violet-300">
                    Detalle del Producto / Insumo (OTRO)
                  </label>
                  <span className="text-[10px] text-violet-300/80 font-mono">
                    Se guarda tal cual en el vale y pasa al expendio
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
                            : 'bg-[#16191F] text-slate-300 border-slate-700 hover:border-violet-400/60 hover:text-white'
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
                  className="w-full bg-[#16191F] border border-violet-500/50 rounded-xl px-3 py-2 text-xs font-bold text-white uppercase placeholder:normal-case placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
                />
              </div>
            )}

            {/* If Tanque Lleno: No se pide cantidad de combustible */}
            {(!formData.tipoCarga || formData.tipoCarga.includes('Tanque Lleno')) ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                  <Fuel className="w-4 h-4" />
                </div>
                <div className="text-xs">
                  <span className="font-bold text-amber-400 block">
                    {isCustomFuel ? 'Retiro Abierto Autorizado' : 'Tanque Lleno Autorizado'}
                  </span>
                  <span className="text-slate-300 text-[11px] leading-relaxed block">
                    {isCustomFuel
                      ? 'No se fija cantidad previa en el vale. La cantidad real de insumo/producto retirado se cargará al rendir el ticket en Expendio.'
                      : 'No se solicita cantidad de litros en el vale. El chofer completará el tanque en el surtidor y el volumen real despachado se cargará automáticamente al rendir el ticket.'}
                  </span>
                </div>
              </div>
            ) : (
              /* If Carga Parcial: Solo aquí se solicita cantidad de combustible */
              <div className="p-3.5 bg-blue-950/20 border border-blue-800/40 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                    <Fuel className="w-3.5 h-3.5 text-blue-400" />
                    {isCustomFuel ? 'Cantidad Autorizada (Litros / Unidades)' : 'Cantidad de Combustible Autorizada (Litros)'} <span className="text-amber-400">*</span>
                  </label>
                  <span className="text-[10px] text-blue-300/80 font-mono">Requerido para Carga Parcial</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min={1}
                    step="any"
                    value={formData.litrosAutorizados !== undefined && formData.litrosAutorizados !== null ? formData.litrosAutorizados : ''}
                    onChange={e => setFormData({ ...formData, litrosAutorizados: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder={isCustomFuel ? 'Ej: 20' : 'Ej: 80'}
                    className="w-full bg-[#16191F] border border-blue-500/40 rounded-xl px-3.5 py-2.5 text-sm text-blue-200 font-mono font-bold focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none placeholder-slate-600"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-blue-400/70 font-mono font-bold">
                    {isCustomFuel ? 'LTS/U' : 'LTS'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Límite máximo autorizado que el playero o estación puede entregar para este vale.
                </p>
              </div>
            )}
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Observaciones / Destino del Viaje / Tarea Asignada
            </label>
            <textarea
              rows={2}
              value={formData.observaciones || ''}
              onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
              placeholder="Ej: Carga previa a traslado de batea con áridos a cantera Campana."
              className="w-full bg-[#0F1115] border border-slate-700 rounded-xl p-3 text-xs text-white focus:border-amber-500 focus:outline-none resize-none"
            />
          </div>

          {/* Foto del Vale en Docs (Opcional) */}
          <div className="bg-[#0F1115] border border-amber-500/25 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-amber-400" />
                Foto del Vale Físico (Docs / Bolsa de Documentos)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsDocsPickerOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] border border-[#F0C800]/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Elegir de Docs ({bolsaDocumentos.length})</span>
                </button>
                {formData.fotoTicket && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, fotoTicket: undefined }));
                      setSelectedBagDocId(null);
                    }}
                    className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                    title="Quitar foto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {formData.fotoTicket ? (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-black/50 border border-slate-800">
                <img src={formData.fotoTicket} alt="Foto del vale" className="w-20 h-14 object-cover rounded border border-slate-700" />
                <span className="text-xs text-emerald-400 font-semibold">Foto del vale adjunta desde Docs.</span>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">
                Podés vincular la foto del vale ya sacada en Documentos para respaldo.
              </p>
            )}
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 bg-black/90 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Estado inicial: <strong className="text-amber-400">EMITIDO</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 active:bg-amber-600 rounded-xl transition shadow-md cursor-pointer"
            >
              <Ticket className="w-4 h-4" />
              <span>{voucherToEdit ? 'Guardar Cambios' : 'Emitir y Generar Vale'}</span>
            </button>
          </div>
        </div>
      </div>

      <BolsaDocumentosPickerModal
        isOpen={isDocsPickerOpen}
        onClose={() => setIsDocsPickerOpen(false)}
        documents={bolsaDocumentos}
        defaultCategory="VALE_COMBUSTIBLE"
        selectedUrl={formData.fotoTicket}
        title="Elegir Foto de Vale de Combustible desde Docs"
        onSelect={(doc) => {
          setFormData(prev => ({ ...prev, fotoTicket: doc.url }));
          setSelectedBagDocId(doc.id);
        }}
      />
    </div>
  );
};
