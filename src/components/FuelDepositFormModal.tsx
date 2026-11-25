import React, { useState, useEffect } from 'react';
import { 
  FuelDeposit, 
  FuelDepositModality, 
  FuelDepositStatus, 
  Vehicle, 
  Employee 
} from '../types';
import { loadFuelPrices, saveFuelPrice, getLatestFuelPrice } from '../services/storage';
import { 
  X, 
  Truck, 
  Fuel, 
  Layers, 
  Ticket, 
  MapPin, 
  User, 
  DollarSign, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles,
  Building2,
  Package,
  ShieldCheck,
  Hash,
  Check,
  Plus
} from 'lucide-react';

interface FuelDepositFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (deposit: FuelDeposit) => void;
  depositToEdit?: FuelDeposit | null;
  existingCount: number;
  fleet: Vehicle[];
  employees: Employee[];
}

const COMMON_FUELS = [
  { name: 'DIESEL COMUN', id: 'COMB-D500', price: 1200 },
  { name: 'DIESEL INFINIA', id: 'COMB-INFD', price: 2583 },
  { name: 'NAFTA SUPER', id: 'COMB-SUPER', price: 2239 },
  { name: 'NAFTA INFINIA', id: 'COMB-INFIN', price: 2405 }
];

export const FuelDepositFormModal: React.FC<FuelDepositFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  depositToEdit,
  existingCount,
  fleet,
  employees,
}) => {
  const isEditing = !!depositToEdit;

  const [modalidad, setModalidad] = useState<FuelDepositModality>('DEPOSITO_AMBULANTE');
  const [selectedFuels, setSelectedFuels] = useState<string[]>([]);
  const [availableFuels, setAvailableFuels] = useState<Array<{ name: string; id: string; price: number }>>([]);
  const [isAddingNewFuel, setIsAddingNewFuel] = useState(false);
  const [newFuelName, setNewFuelName] = useState('');
  const [newFuelPrice, setNewFuelPrice] = useState<number>(0);

  // Load fuels directly from catalog
  useEffect(() => {
    if (!isOpen) return;
    const catalog = loadFuelPrices();
    const fuelsList: Array<{ name: string; id: string; price: number }> = [];
    Object.entries(catalog).forEach(([name, price]) => {
      const cleanSlug = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      fuelsList.push({
        name,
        id: `COMB-${cleanSlug}`,
        price
      });
    });
    setAvailableFuels(fuelsList);
  }, [isOpen]);
  const [formData, setFormData] = useState<Partial<FuelDeposit>>({
    id: '',
    codigo: '',
    nombre: '',
    modalidad: 'DEPOSITO_AMBULANTE',
    modalidadLabel: 'Depósito Ambulante',
    tipoCombustible: '',
    idCombustible: '',
    capacidadTotal: 0,
    stockActual: 0,
    nivelAlertaMinimo: 0,
    ubicacion: '',
    responsableId: '',
    responsableNombre: '',
    estado: 'OPERATIVO',
    patenteVehiculo: '',
    codigoEquipo: '',
    vehiculoId: '',
    marcaModeloCamion: '',
    cantidadBidones: 0,
    capacidadPorBidon: 20,
    tipoHomologacion: '',
    numEstacionConvenio: '',
    nombreEstacion: '',
    direccionEstacion: '',
    empresaBandera: 'OTRA',
    numeroCuentaConvenio: '',
    costoPorLitroEstimado: 0,
    ultimaRecargaFecha: new Date().toISOString().slice(0, 10),
    observaciones: '',
    foto: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    if (depositToEdit) {
      setModalidad(depositToEdit.modalidad || 'DEPOSITO_AMBULANTE');
      let cleanNombre = depositToEdit.nombre || '';
      if (cleanNombre.includes('undefined')) {
        cleanNombre = cleanNombre.replace(/undefined/g, '').replace(/\s+/g, ' ').trim();
      }
      setFormData({ ...depositToEdit, nombre: cleanNombre });
      if (depositToEdit.tiposCombustibles && depositToEdit.tiposCombustibles.length > 0) {
        setSelectedFuels(depositToEdit.tiposCombustibles);
      } else if (depositToEdit.tipoCombustible) {
        const parts = depositToEdit.tipoCombustible.split(' / ').map(p => p.trim()).filter(Boolean);
        setSelectedFuels(parts);
      } else {
        setSelectedFuels([]);
      }
    } else {
      const nextIdNum = existingCount + 1;
      const prefix = modalidad === 'DEPOSITO_AMBULANTE' ? 'DEP-AMB' : modalidad === 'BIDONES' ? 'DEP-BID' : 'DEP-VAL';
      const newId = `${prefix}-${String(nextIdNum).padStart(2, '0')}`;

      setSelectedFuels([]);
      setFormData({
        id: newId,
        codigo: newId,
        nombre: '',
        modalidad: modalidad,
        modalidadLabel: modalidad === 'DEPOSITO_AMBULANTE' 
          ? 'Depósito Ambulante' 
          : modalidad === 'BIDONES' 
            ? 'Bidones' 
            : 'Vales para Estación de Servicio',
        tipoCombustible: '',
        idCombustible: '',
        tiposCombustibles: [],
        capacidadTotal: 0,
        stockActual: 0,
        nivelAlertaMinimo: 0,
        ubicacion: '',
        responsableId: '',
        responsableNombre: '',
        estado: 'OPERATIVO',
        patenteVehiculo: '',
        codigoEquipo: '',
        vehiculoId: '',
        marcaModeloCamion: '',
        cantidadBidones: 0,
        capacidadPorBidon: 20,
        tipoHomologacion: '',
        numEstacionConvenio: '',
        nombreEstacion: '',
        direccionEstacion: '',
        empresaBandera: modalidad === 'VALES_ESTACION' ? 'OTRA' : undefined,
        numeroCuentaConvenio: '',
        costoPorLitroEstimado: 0,
        ultimaRecargaFecha: new Date().toISOString().slice(0, 10),
        observaciones: '',
        foto: ''
      });
    }
    setErrors({});
  }, [depositToEdit, isOpen, existingCount]);

  // When switching modality in creation mode
  const handleSwitchModality = (newModality: FuelDepositModality) => {
    setModalidad(newModality);
    const prefix = newModality === 'DEPOSITO_AMBULANTE' ? 'DEP-AMB' : newModality === 'BIDONES' ? 'DEP-BID' : 'DEP-VAL';
    const label = newModality === 'DEPOSITO_AMBULANTE' 
      ? 'Depósito Ambulante' 
      : newModality === 'BIDONES' 
        ? 'Bidones' 
        : 'Vales para Estación de Servicio';

    setFormData(prev => ({
      ...prev,
      modalidad: newModality,
      modalidadLabel: label,
      id: !isEditing ? `${prefix}-${String(existingCount + 1).padStart(2, '0')}` : prev.id,
      codigo: !isEditing ? `${prefix}-${String(existingCount + 1).padStart(2, '0')}` : prev.codigo,
      empresaBandera: newModality === 'VALES_ESTACION' ? (prev.empresaBandera || 'OTRA') : undefined
    }));
  };

  const handleToggleFuel = (fuelName: string) => {
    setSelectedFuels(prev => {
      if (prev.includes(fuelName)) {
        return prev.filter(f => f !== fuelName);
      } else {
        return [...prev, fuelName];
      }
    });
  };

  const handleSelectAllFuels = () => {
    setSelectedFuels(availableFuels.map(f => f.name));
  };

  const handleSelectDieselOnly = () => {
    const dieselOnly = availableFuels
      .filter(f => f.name.toLowerCase().includes('diesel') || f.name.toLowerCase().includes('gasoil'))
      .map(f => f.name);
    setSelectedFuels(dieselOnly.length > 0 ? dieselOnly : ['DIESEL COMUN']);
  };

  const handleSelectNaftaOnly = () => {
    const naftaOnly = availableFuels
      .filter(f => f.name.toLowerCase().includes('nafta') || f.name.toLowerCase().includes('super') || f.name.toLowerCase().includes('premium'))
      .map(f => f.name);
    setSelectedFuels(naftaOnly.length > 0 ? naftaOnly : availableFuels.map(f => f.name));
  };

  const handleSetPresetFuels = (fuels: string[]) => {
    setSelectedFuels(fuels);
  };

  const handleAddNewFuel = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFuelName.trim();
    if (!trimmed) return;
    saveFuelPrice(trimmed, newFuelPrice);
    const newFuelObj = {
      name: trimmed,
      id: `COMB-${trimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`,
      price: newFuelPrice
    };
    setAvailableFuels(prev => [...prev, newFuelObj]);
    setSelectedFuels(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
    setNewFuelName('');
    setIsAddingNewFuel(false);
  };

  if (!isOpen) return null;

  // Handle fleet vehicle selection for mobile tank
  const handleSelectFleetVehicle = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vehId = e.target.value;
    const veh = fleet.find(v => v.id === vehId);
    if (veh) {
      const eqCode = veh.codigoEquipo || veh.id || 'Equipo';
      const marcaModel = veh.modeloMarca || [veh.marca, veh.modelo].filter(Boolean).join(' ') || 'Vehículo';
      setFormData(prev => ({
        ...prev,
        vehiculoId: veh.id,
        codigoEquipo: eqCode,
        patenteVehiculo: veh.patente || '',
        marcaModeloCamion: marcaModel,
        nombre: (!depositToEdit || !prev.nombre || prev.nombre.includes('Cisterna Móvil') || prev.nombre.includes('Nueva Cisterna'))
          ? `Cisterna Móvil ${eqCode} (${marcaModel})`
          : prev.nombre
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        vehiculoId: '',
        codigoEquipo: '',
        patenteVehiculo: '',
        marcaModeloCamion: ''
      }));
    }
  };

  // Handle employee selection
  const handleSelectEmployee = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const empId = e.target.value;
    if (!empId) {
      setFormData(prev => ({
        ...prev,
        responsableId: '',
        responsableNombre: ''
      }));
      return;
    }
    const emp = employees.find(em => em.id === empId);
    if (emp) {
      setFormData(prev => ({
        ...prev,
        responsableId: emp.id,
        responsableNombre: emp.nombreApellido || emp.nombre || ''
      }));
    }
  };

  // Handle fuel type selection
  const handleSelectFuel = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const fuelName = e.target.value;
    const fuelObj = COMMON_FUELS.find(f => f.name === fuelName);
    const price = getLatestFuelPrice(fuelName);

    setFormData(prev => ({
      ...prev,
      tipoCombustible: fuelName,
      idCombustible: fuelObj?.id || 'COMB-D500',
      costoPorLitroEstimado: price
    }));
  };

  // Bidones auto capacity calculation
  const handleBidonesCountChange = (count: number) => {
    const safeCount = Math.max(0, count);
    const capPerBidon = formData.capacidadPorBidon || 20;
    const totalCap = safeCount * capPerBidon;
    setFormData(prev => ({
      ...prev,
      cantidadBidones: safeCount,
      capacidadTotal: totalCap,
      stockActual: totalCap,
      nivelAlertaMinimo: totalCap > 0 ? Math.max(20, Math.round(totalCap * 0.2)) : 0
    }));
  };

  const handleBidonSizeChange = (size: number) => {
    const count = formData.cantidadBidones || 0;
    const totalCap = count * size;
    setFormData(prev => ({
      ...prev,
      capacidadPorBidon: size,
      capacidadTotal: totalCap,
      stockActual: totalCap,
      nivelAlertaMinimo: totalCap > 0 ? Math.max(20, Math.round(totalCap * 0.2)) : 0
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.id?.trim()) newErrors.id = 'El ID es obligatorio';
    if (!formData.nombre?.trim()) newErrors.nombre = 'El nombre del depósito es obligatorio';
    if (selectedFuels.length === 0) newErrors.combustibles = 'Seleccione al menos un tipo de combustible';
    if (modalidad !== 'VALES_ESTACION' && (formData.capacidadTotal ?? 0) <= 0) {
      newErrors.capacidadTotal = 'La capacidad debe ser mayor a 0';
    }
    
    if (modalidad === 'DEPOSITO_AMBULANTE' && !formData.patenteVehiculo?.trim()) {
      newErrors.patenteVehiculo = 'Ingrese la patente o camión cisterna portador';
    }

    if (modalidad === 'VALES_ESTACION' && !formData.numEstacionConvenio?.trim()) {
      newErrors.numEstacionConvenio = 'Ingrese el número o código de estación de servicio';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Automatic status update if stock is low
    const stock = Number(formData.stockActual) || 0;
    const alerta = Number(formData.nivelAlertaMinimo) || 0;
    let estado = formData.estado || 'OPERATIVO';
    if (modalidad !== 'VALES_ESTACION') {
      if (stock <= alerta && estado === 'OPERATIVO') {
        estado = 'BAJO_STOCK';
      } else if (stock > alerta && estado === 'BAJO_STOCK') {
        estado = 'OPERATIVO';
      }
    }

    const primaryFuel = selectedFuels[0] || '';
    const fuelObj = availableFuels.find(f => f.name === primaryFuel) || COMMON_FUELS.find(f => f.name === primaryFuel);
    const summaryTipoComb = selectedFuels.length > 1 ? selectedFuels.join(' / ') : primaryFuel;
    const summaryIdComb = selectedFuels.length > 1
      ? 'COMB-MULT'
      : (fuelObj?.id || (primaryFuel ? `COMB-${primaryFuel.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}` : ''));

    const depositToSave: FuelDeposit = {
      id: formData.id!.trim(),
      codigo: (formData.codigo || formData.id)!.trim(),
      nombre: formData.nombre!.trim(),
      modalidad: modalidad,
      modalidadLabel: modalidad === 'DEPOSITO_AMBULANTE' 
        ? 'Depósito Ambulante' 
        : modalidad === 'BIDONES' 
          ? 'Bidones' 
          : 'Vales para Estación de Servicio',
      tipoCombustible: summaryTipoComb,
      idCombustible: summaryIdComb,
      tiposCombustibles: selectedFuels,
      capacidadTotal: Number(formData.capacidadTotal) || 0,
      stockActual: Number(formData.stockActual) || 0,
      nivelAlertaMinimo: Number(formData.nivelAlertaMinimo) || 0,
      ubicacion: (formData.ubicacion || formData.direccionEstacion || '').trim(),
      responsableId: formData.responsableId,
      responsableNombre: formData.responsableNombre,
      estado: estado,
      patenteVehiculo: formData.patenteVehiculo,
      vehiculoId: formData.vehiculoId,
      codigoEquipo: formData.codigoEquipo,
      marcaModeloCamion: formData.marcaModeloCamion,
      cantidadBidones: formData.cantidadBidones,
      capacidadPorBidon: formData.capacidadPorBidon,
      tipoHomologacion: formData.tipoHomologacion,
      numEstacionConvenio: formData.numEstacionConvenio,
      nombreEstacion: formData.nombreEstacion,
      direccionEstacion: formData.direccionEstacion,
      empresaBandera: modalidad === 'VALES_ESTACION' ? (formData.empresaBandera || 'OTRA') : formData.empresaBandera,
      numeroCuentaConvenio: formData.numeroCuentaConvenio,
      costoPorLitroEstimado: Number(formData.costoPorLitroEstimado) || 0,
      ultimaRecargaFecha: formData.ultimaRecargaFecha || new Date().toISOString().slice(0, 10),
      observaciones: formData.observaciones || '',
      foto: formData.foto || ''
    };

    const estCost = Number(depositToSave.costoPorLitroEstimado) || 0;
    if (estCost > 0) {
      selectedFuels.forEach(f => {
        if (f && !f.includes('/')) {
          saveFuelPrice(f, estCost);
        }
      });
    }

    onSave(depositToSave);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-[#16191F] border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#1E232D] border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Fuel className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white uppercase tracking-tight">
                  {isEditing ? `Editar Depósito: ${formData.id}` : 'Nuevo Depósito de Carga'}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Despachos Propios
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Configure el punto de abastecimiento según una de las 3 modalidades de la empresa
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body with Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* STEP 1: MODALITY SELECTION (3 EXCLUSIVE MODALITIES) */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
              1. Seleccione la Modalidad de Carga <span className="text-amber-500 font-normal">(Exclusivas de la empresa)</span>:
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Option 1: Depósito Ambulante */}
              <button
                type="button"
                onClick={() => handleSwitchModality('DEPOSITO_AMBULANTE')}
                className={`p-4 rounded-xl border text-left transition relative cursor-pointer ${
                  modalidad === 'DEPOSITO_AMBULANTE'
                    ? 'bg-amber-500/15 border-amber-500 text-white shadow-md'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/40'
                }`}
              >
                {modalidad === 'DEPOSITO_AMBULANTE' && (
                  <span className="absolute top-3 right-3 text-amber-400">
                    <CheckCircle2 className="w-5 h-5 fill-amber-400 text-black" />
                  </span>
                )}
                <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center mb-2.5">
                  <Truck className="w-5 h-5" />
                </div>
                <div className="font-bold text-sm text-white flex items-center gap-1.5">
                  <span>Depósito Ambulante</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Cisterna móvil sobre camión o carretón para abastecer equipos pesados en frentes de obra.
                </p>
                <div className="mt-3 text-[10px] font-mono font-semibold text-amber-400/90 flex items-center gap-1">
                  <span>Capacidad típica: 2.000 a 5.000 Lts</span>
                </div>
              </button>

              {/* Option 2: Bidones */}
              <button
                type="button"
                onClick={() => handleSwitchModality('BIDONES')}
                className={`p-4 rounded-xl border text-left transition relative cursor-pointer ${
                  modalidad === 'BIDONES'
                    ? 'bg-blue-500/15 border-blue-500 text-white shadow-md'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/40'
                }`}
              >
                {modalidad === 'BIDONES' && (
                  <span className="absolute top-3 right-3 text-blue-400">
                    <CheckCircle2 className="w-5 h-5 fill-blue-400 text-black" />
                  </span>
                )}
                <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center mb-2.5">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="font-bold text-sm text-white flex items-center gap-1.5">
                  <span>Bidones</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Lote de bidones homologados (20L / 50L) en pañol o contenedores para cargas menores y grupos.
                </p>
                <div className="mt-3 text-[10px] font-mono font-semibold text-blue-400/90 flex items-center gap-1">
                  <span>Control por unidades de bidones</span>
                </div>
              </button>

              {/* Option 3: Vales para Estación de Servicio */}
              <button
                type="button"
                onClick={() => handleSwitchModality('VALES_ESTACION')}
                className={`p-4 rounded-xl border text-left transition relative cursor-pointer ${
                  modalidad === 'VALES_ESTACION'
                    ? 'bg-purple-500/15 border-purple-500 text-white shadow-md'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/40'
                }`}
              >
                {modalidad === 'VALES_ESTACION' && (
                  <span className="absolute top-3 right-3 text-purple-400">
                    <CheckCircle2 className="w-5 h-5 fill-purple-400 text-black" />
                  </span>
                )}
                <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center mb-2.5">
                  <Ticket className="w-5 h-5" />
                </div>
                <div className="font-bold text-sm text-white flex items-center gap-1.5">
                  <span>Vales para Estación</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Convenio de cuenta corriente o vales para surtidores en estaciones de servicio (YPF, Shell, Axion).
                </p>
                <div className="mt-3 text-[10px] font-mono font-semibold text-purple-400/90 flex items-center gap-1">
                  <span>Control de cupo mensual en Litros</span>
                </div>
              </button>
            </div>
          </div>

          {/* STEP 2: GENERAL DEPOSIT IDENTIFICATION */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
              <Hash className="w-3.5 h-3.5" />
              <span>2. Datos Principales del Depósito</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  ID Depósito <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.id || ''}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="ej: DEP-AMB-01"
                  className={`w-full px-3 py-2 bg-slate-950 border ${errors.id ? 'border-rose-500' : 'border-slate-700'} rounded-lg text-sm text-white font-mono focus:border-amber-500 outline-hidden`}
                />
                {errors.id && <p className="text-[11px] text-rose-400 mt-1">{errors.id}</p>}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Estado Operativo
                </label>
                <select
                  value={formData.estado || 'OPERATIVO'}
                  onChange={(e) => setFormData({ ...formData, estado: e.target.value as FuelDepositStatus })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-500 outline-hidden"
                >
                  <option value="OPERATIVO">🟢 Operativo / Disponible</option>
                  <option value="BAJO_STOCK">🟡 Bajo Stock (Alerta Reposición)</option>
                  <option value="EN_REPOSICION">🔵 En Reposición / Carga</option>
                  <option value="FUERA_SERVICIO">🔴 Fuera de Servicio / Mantenimiento</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Nombre Descriptivo del Depósito <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                value={formData.nombre || ''}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="ej: Estación de Servicio Milenium / Cisterna Móvil"
                className={`w-full px-3 py-2 bg-slate-950 border ${errors.nombre ? 'border-rose-500' : 'border-slate-700'} rounded-lg text-sm text-white focus:border-amber-500 outline-hidden`}
              />
              {errors.nombre && <p className="text-[11px] text-rose-400 mt-1">{errors.nombre}</p>}
            </div>

            {/* Selector de Tipos de Combustible Habilitados (Múltiple) */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Fuel className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tipos de Combustible Habilitados (Múltiples)</span>
                    <span className="text-amber-500">*</span>
                  </label>
                  <p className="text-[10px] text-slate-400">
                    {modalidad === 'VALES_ESTACION' 
                      ? 'Seleccione los combustibles que esta Estación de Servicio despacha (ej: Infinia Diesel, Super, etc.)'
                      : 'Seleccione todos los combustibles que este depósito puede suministrar'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSelectAllFuels}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-bold cursor-pointer underline px-1"
                  >
                    Todos
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={handleSelectDieselOnly}
                    className="text-[11px] text-amber-300 hover:text-white font-semibold cursor-pointer px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:border-amber-500/50"
                  >
                    Solo Diesel
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={handleSelectNaftaOnly}
                    className="text-[11px] text-cyan-300 hover:text-white font-semibold cursor-pointer px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:border-cyan-500/50"
                  >
                    Solo Nafta
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => handleSetPresetFuels(['DIESEL COMUN', 'DIESEL INFINIA'])}
                    className="text-[11px] text-slate-300 hover:text-white font-semibold cursor-pointer px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:border-amber-500/50"
                  >
                    Diesel Común + Infinia
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {availableFuels.map((fuel, idx) => {
                  const isSelected = selectedFuels.includes(fuel.name);
                  return (
                    <button
                      key={`${fuel.name}-${fuel.id || idx}`}
                      type="button"
                      onClick={() => handleToggleFuel(fuel.name)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition cursor-pointer select-none ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-xs'
                          : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition ${
                        isSelected
                          ? 'bg-amber-500 border-amber-400 text-black'
                          : 'border-slate-600 bg-slate-900'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`block text-xs font-bold truncate leading-tight ${isSelected ? 'text-amber-300' : 'text-slate-300'}`}>
                          {fuel.name}
                        </span>
                        <span className="block text-[10px] text-slate-500 font-mono">
                          ${fuel.price} / L
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Inline Add New Fuel */}
              <div className="pt-2 border-t border-slate-800">
                {!isAddingNewFuel ? (
                  <button
                    type="button"
                    onClick={() => setIsAddingNewFuel(true)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Agregar otro combustible al catálogo</span>
                  </button>
                ) : (
                  <div className="p-3 bg-slate-950 border border-amber-500/40 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-400">
                      <span>Nuevo Combustible para esta Estación</span>
                      <button
                        type="button"
                        onClick={() => setIsAddingNewFuel(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newFuelName}
                        onChange={(e) => setNewFuelName(e.target.value)}
                        placeholder="Nombre (ej: Shell V-Power)"
                        className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={newFuelPrice}
                          onChange={(e) => setNewFuelPrice(Number(e.target.value))}
                          placeholder="Precio $/L"
                          className="w-24 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleAddNewFuel}
                          className="flex-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded cursor-pointer"
                        >
                          + Agregar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Resumen de seleccionados */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-slate-400 font-medium">Habilitados ({selectedFuels.length}):</span>
                {selectedFuels.map(f => (
                  <span key={f} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
                    <Check className="w-2.5 h-2.5 stroke-[3]" /> {f}
                  </span>
                ))}
              </div>
              {errors.combustibles && <p className="text-[11px] text-rose-400 mt-1">{errors.combustibles}</p>}
            </div>
          </div>

          {/* STEP 3: SPECIFIC MODALITY FIELDS */}
          {modalidad === 'DEPOSITO_AMBULANTE' && (
            <div className="bg-amber-950/20 border border-amber-900/50 p-4 rounded-xl space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-400" />
                <span>3. Configuración de Cisterna Móvil (Depósito Ambulante)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Vincular a Vehículo de la Flota (Camión Cisterna)
                  </label>
                  <select
                    value={formData.vehiculoId || ''}
                    onChange={handleSelectFleetVehicle}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-500 outline-hidden"
                  >
                    <option value="">-- Seleccione camión o carretón --</option>
                    {fleet.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.codigoEquipo} - {v.modeloMarca} ({v.patente})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Patente / Dominio del Portador <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.patenteVehiculo || ''}
                    onChange={(e) => setFormData({ ...formData, patenteVehiculo: e.target.value })}
                    placeholder="ej: AD 456 EF / Acoplado Cisterna"
                    className={`w-full px-3 py-2 bg-slate-950 border ${errors.patenteVehiculo ? 'border-rose-500' : 'border-slate-700'} rounded-lg text-sm text-white font-mono focus:border-amber-500 outline-hidden`}
                  />
                  {errors.patenteVehiculo && <p className="text-[11px] text-rose-400 mt-1">{errors.patenteVehiculo}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Modelo del Camión o Tipo de Cisterna
                  </label>
                  <input
                    type="text"
                    value={formData.marcaModeloCamion || ''}
                    onChange={(e) => setFormData({ ...formData, marcaModeloCamion: e.target.value })}
                    placeholder="ej: Mercedes-Benz 1114 con Tanque 5.000L y Bomba 12V"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Ubicación Actual / Ruta / Obra Asignada
                  </label>
                  <input
                    type="text"
                    value={formData.ubicacion || ''}
                    onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                    placeholder="ej: En obra / Base operativa"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-500 outline-hidden"
                  />
                </div>
              </div>
            </div>
          )}

          {modalidad === 'BIDONES' && (
            <div className="bg-blue-950/20 border border-blue-900/50 p-4 rounded-xl space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <span>3. Configuración de Stock de Bidones</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Cantidad Total de Bidones
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.cantidadBidones ?? 0}
                    onChange={(e) => handleBidonesCountChange(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white font-mono focus:border-blue-500 outline-hidden"
                  />
                  <span className="text-[10px] text-slate-500">Unidades en stock</span>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Capacidad por Bidón (Litros)
                  </label>
                  <select
                    value={formData.capacidadPorBidon || 20}
                    onChange={(e) => handleBidonSizeChange(parseInt(e.target.value) || 20)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-blue-500 outline-hidden"
                  >
                    <option value="5">5 Litros (Bidón Portátil Chico)</option>
                    <option value="10">10 Litros (Bidón Portátil)</option>
                    <option value="20">20 Litros (Estándar IRAM)</option>
                    <option value="50">50 Litros (Tambor / Garrafa)</option>
                    <option value="60">60 Litros</option>
                  </select>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {[5, 10, 20, 50].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => handleBidonSizeChange(size)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                          formData.capacidadPorBidon === size
                            ? 'bg-blue-500 text-black border-blue-400 font-black shadow-xs'
                            : 'bg-slate-900 text-slate-400 hover:text-white border-slate-700'
                        }`}
                      >
                        {size}L
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Capacidad Total Resultante
                  </label>
                  <div className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-blue-400 font-bold font-mono text-sm">
                    {formData.capacidadTotal} Litros
                  </div>
                  <span className="text-[10px] text-slate-500">
                    ({formData.cantidadBidones || 0} bidones × {formData.capacidadPorBidon || 20}L)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Tipo de Homologación / Material
                  </label>
                  <input
                    type="text"
                    value={formData.tipoHomologacion || ''}
                    onChange={(e) => setFormData({ ...formData, tipoHomologacion: e.target.value })}
                    placeholder="ej: Plásticos IRAM Antiestáticos"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-blue-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Ubicación de Guarda / Pañol
                  </label>
                  <input
                    type="text"
                    value={formData.ubicacion || ''}
                    onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                    placeholder="ej: Pañol / Depósito operativo"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-blue-500 outline-hidden"
                  />
                </div>
              </div>
            </div>
          )}

          {modalidad === 'VALES_ESTACION' && (
            <div className="bg-purple-950/20 border border-purple-900/50 p-4 rounded-xl space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                <Ticket className="w-4 h-4 text-purple-400" />
                <span>3. Configuración de Convenio con Estación de Servicio</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Bandera / Petrolera
                  </label>
                  <select
                    value={formData.empresaBandera || 'OTRA'}
                    onChange={(e) => setFormData({ ...formData, empresaBandera: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-purple-500 outline-hidden font-bold"
                  >
                    <option value="YPF">🔵 YPF</option>
                    <option value="SHELL">🟡 SHELL</option>
                    <option value="AXION">🔴 AXION ENERGY</option>
                    <option value="PUMA">🟢 PUMA ENERGY</option>
                    <option value="OTRA">⚪ OTRA ESTACIÓN</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Nº / Código de Estación <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.numEstacionConvenio || ''}
                    onChange={(e) => setFormData({ ...formData, numEstacionConvenio: e.target.value })}
                    placeholder="ej: EST-01"
                    className={`w-full px-3 py-2 bg-slate-950 border ${errors.numEstacionConvenio ? 'border-rose-500' : 'border-slate-700'} rounded-lg text-sm text-white font-mono focus:border-purple-500 outline-hidden`}
                  />
                  {errors.numEstacionConvenio && <p className="text-[11px] text-rose-400 mt-1">{errors.numEstacionConvenio}</p>}
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Nº de Cuenta Corriente / Convenio
                  </label>
                  <input
                    type="text"
                    value={formData.numeroCuentaConvenio || ''}
                    onChange={(e) => setFormData({ ...formData, numeroCuentaConvenio: e.target.value })}
                    placeholder="ej: CC-001"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white font-mono focus:border-purple-500 outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Nombre del Establecimiento / Razón Social
                  </label>
                  <input
                    type="text"
                    value={formData.nombreEstacion || ''}
                    onChange={(e) => setFormData({ ...formData, nombreEstacion: e.target.value })}
                    placeholder="ej: Estación de Servicio Milenium"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-purple-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Dirección Comercial de la Estación
                  </label>
                  <input
                    type="text"
                    value={formData.direccionEstacion || ''}
                    onChange={(e) => setFormData({ ...formData, direccionEstacion: e.target.value })}
                    placeholder="ej: Dirección de la estación"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-purple-500 outline-hidden"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: CAPACITY, STOCK AND AUDIT VALUES */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
              <Package className="w-3.5 h-3.5" />
              <span>4. Capacidad, Stock y Control de Reposición</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {modalidad === 'VALES_ESTACION' ? 'Cupo Mensual Autorizado (Lts)' : 'Capacidad Total del Tanque (Lts)'}{' '}
                  {modalidad !== 'VALES_ESTACION' && <span className="text-amber-500">*</span>}
                </label>
                <input
                  type="number"
                  min={modalidad === 'VALES_ESTACION' ? 0 : 1}
                  value={formData.capacidadTotal ?? 0}
                  onChange={(e) => setFormData({ ...formData, capacidadTotal: Number(e.target.value) })}
                  className={`w-full px-3 py-2 bg-slate-950 border ${errors.capacidadTotal ? 'border-rose-500' : 'border-slate-700'} rounded-lg text-sm text-white font-mono focus:border-amber-500 outline-hidden`}
                />
                {errors.capacidadTotal && <p className="text-[11px] text-rose-400 mt-1">{errors.capacidadTotal}</p>}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {modalidad === 'VALES_ESTACION' ? 'Saldo Disponible en Vales (Lts)' : 'Stock Actual Disponible (Lts)'} <span className="text-amber-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.stockActual ?? 0}
                  onChange={(e) => setFormData({ ...formData, stockActual: Number(e.target.value) })}
                  className={`w-full px-3 py-2 bg-slate-950 border ${errors.stockActual ? 'border-rose-500' : 'border-slate-700'} rounded-lg text-sm text-white font-mono focus:border-amber-500 outline-hidden`}
                />
                {errors.stockActual && <p className="text-[11px] text-rose-400 mt-1">{errors.stockActual}</p>}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Umbral Alerta Mínima (Lts)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.nivelAlertaMinimo ?? 0}
                  onChange={(e) => setFormData({ ...formData, nivelAlertaMinimo: Number(e.target.value) })}
                  placeholder="ej: 1000"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white font-mono focus:border-amber-500 outline-hidden"
                />
                <span className="text-[10px] text-slate-500">Dispara alerta de reposición</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Responsable Asignado / Operador
                </label>
                <select
                  value={formData.responsableId || ''}
                  onChange={handleSelectEmployee}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-500 outline-hidden"
                >
                  <option value="">-- Sin asignar / Opcional --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombreApellido || emp.nombre || emp.codigoEmpleado}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Costo Estimado por Litro ($ ARS)
                </label>
                <input
                  type="number"
                  value={formData.costoPorLitroEstimado ?? 0}
                  onChange={(e) => setFormData({ ...formData, costoPorLitroEstimado: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white font-mono focus:border-amber-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Fecha Última Recarga / Apertura
                </label>
                <input
                  type="date"
                  value={formData.ultimaRecargaFecha || ''}
                  onChange={(e) => setFormData({ ...formData, ultimaRecargaFecha: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-500 outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Observaciones y Notas Operativas
              </label>
              <textarea
                rows={2}
                value={formData.observaciones || ''}
                onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                placeholder="Detalles sobre precintos, cuenta-litros digital, choferes autorizados o condiciones de despacho..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-500 outline-hidden resize-none"
              />
            </div>
          </div>

        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#1E232D] border-t border-slate-700/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition cursor-pointer"
          >
            Cancelar
          </button>
          
          <button
            type="button"
            onClick={handleSubmit}
            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black text-xs font-bold rounded-lg shadow-md transition flex items-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isEditing ? 'Guardar Cambios' : 'Crear Depósito de Carga'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
