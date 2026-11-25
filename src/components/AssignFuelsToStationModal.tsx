import React, { useState, useEffect, useMemo } from 'react';
import { FuelDeposit } from '../types';
import { loadFuelPrices, saveFuelPrice } from '../services/storage';
import { 
  X, 
  Fuel, 
  Check, 
  Search, 
  Plus, 
  DollarSign, 
  Building2, 
  Ticket, 
  Truck, 
  Layers, 
  Save, 
  Copy, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react';

interface AssignFuelsToStationModalProps {
  isOpen: boolean;
  onClose: () => void;
  deposits: FuelDeposit[];
  preselectedStationId?: string | null;
  onSaveAssignments: (stationId: string, fuelNames: string[]) => void;
  onShowToast?: (msg: string) => void;
}

export const AssignFuelsToStationModal: React.FC<AssignFuelsToStationModalProps> = ({
  isOpen,
  onClose,
  deposits,
  preselectedStationId,
  onSaveAssignments,
  onShowToast,
}) => {
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [selectedFuels, setSelectedFuels] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [fuelCatalog, setFuelCatalog] = useState<Record<string, number>>({});

  // Form for creating a new fuel type on the fly
  const [isCreatingNewFuel, setIsCreatingNewFuel] = useState(false);
  const [newFuelName, setNewFuelName] = useState('');
  const [newFuelPrice, setNewFuelPrice] = useState<number>(1350);

  // Source station for copying
  const [copyFromStationId, setCopyFromStationId] = useState<string>('');

  // Load catalog on mount/open
  useEffect(() => {
    if (!isOpen) return;
    const loaded = loadFuelPrices();
    setFuelCatalog(loaded);
  }, [isOpen]);

  // Set active station on open or change
  useEffect(() => {
    if (!isOpen || deposits.length === 0) return;

    let targetId = preselectedStationId;
    if (!targetId || !deposits.some(d => d.id === targetId)) {
      // Pick first station with VALES_ESTACION, or first deposit
      const firstStation = deposits.find(d => d.modalidad === 'VALES_ESTACION') || deposits[0];
      targetId = firstStation ? firstStation.id : '';
    }

    setSelectedStationId(targetId || '');
  }, [isOpen, preselectedStationId, deposits]);

  // Sync selected fuels whenever selectedStationId changes
  useEffect(() => {
    if (!selectedStationId) {
      setSelectedFuels([]);
      return;
    }
    const currentStation = deposits.find(d => d.id === selectedStationId);
    if (!currentStation) return;

    if (currentStation.tiposCombustibles && currentStation.tiposCombustibles.length > 0) {
      setSelectedFuels(currentStation.tiposCombustibles);
    } else if (currentStation.tipoCombustible) {
      const parts = currentStation.tipoCombustible.split(' / ').map(p => p.trim()).filter(Boolean);
      setSelectedFuels(parts);
    } else {
      setSelectedFuels([]);
    }
  }, [selectedStationId, deposits]);

  const currentStation = useMemo(() => {
    return deposits.find(d => d.id === selectedStationId) || null;
  }, [deposits, selectedStationId]);

  // All known fuels from catalog, deposits, and common types
  const allFuelNames = useMemo(() => {
    const map = new Map<string, { name: string; price: number }>();

    // 1. From catalog
    Object.entries(fuelCatalog).forEach(([name, price]) => {
      const key = name.trim().toUpperCase();
      if (!map.has(key)) {
        map.set(key, { name: name.trim(), price });
      }
    });

    // 2. From deposits
    deposits.forEach(d => {
      const fuels = d.tiposCombustibles && d.tiposCombustibles.length > 0
        ? d.tiposCombustibles
        : (d.tipoCombustible ? d.tipoCombustible.split(' / ').map(f => f.trim()) : []);
      fuels.forEach(f => {
        if (f) {
          const key = f.trim().toUpperCase();
          if (!map.has(key)) {
            map.set(key, { name: f.trim(), price: d.costoPorLitroEstimado || 1350 });
          }
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [fuelCatalog, deposits]);

  // Filtered fuel list
  const filteredFuels = useMemo(() => {
    if (!searchQuery.trim()) return allFuelNames;
    const q = searchQuery.toLowerCase();
    return allFuelNames.filter(f => f.name.toLowerCase().includes(q));
  }, [allFuelNames, searchQuery]);

  if (!isOpen) return null;

  const handleToggleFuel = (fuelName: string) => {
    setSelectedFuels(prev => {
      const exists = prev.some(f => f.toLowerCase() === fuelName.toLowerCase());
      if (exists) {
        return prev.filter(f => f.toLowerCase() !== fuelName.toLowerCase());
      } else {
        return [...prev, fuelName];
      }
    });
  };

  const handleSelectAll = () => {
    setSelectedFuels(allFuelNames.map(f => f.name));
  };

  const handleClearAll = () => {
    setSelectedFuels([]);
  };

  const handleSelectDieselOnly = () => {
    const dieselFuels = allFuelNames
      .filter(f => f.name.toLowerCase().includes('diesel') || f.name.toLowerCase().includes('gasoil'))
      .map(f => f.name);
    setSelectedFuels(dieselFuels);
  };

  const handleSelectNaftaOnly = () => {
    const naftaFuels = allFuelNames
      .filter(f => f.name.toLowerCase().includes('nafta') || f.name.toLowerCase().includes('super') || f.name.toLowerCase().includes('premium'))
      .map(f => f.name);
    setSelectedFuels(naftaFuels);
  };

  const handleCopyFromStation = (sourceId: string) => {
    if (!sourceId) return;
    const source = deposits.find(d => d.id === sourceId);
    if (!source) return;
    const fuels = source.tiposCombustibles && source.tiposCombustibles.length > 0
      ? source.tiposCombustibles
      : (source.tipoCombustible ? source.tipoCombustible.split(' / ').map(f => f.trim()) : []);
    if (fuels.length > 0) {
      setSelectedFuels(fuels);
      onShowToast?.(`Combustibles copiados de "${source.nombre}"`);
    } else {
      onShowToast?.(`La estación seleccionada no tiene combustibles configurados.`);
    }
  };

  const handleCreateAndAssignNewFuel = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFuelName.trim();
    if (!trimmed) {
      onShowToast?.('Ingrese el nombre del combustible');
      return;
    }
    if (newFuelPrice <= 0) {
      onShowToast?.('El precio debe ser mayor a 0');
      return;
    }

    saveFuelPrice(trimmed, newFuelPrice);
    setFuelCatalog(prev => ({ ...prev, [trimmed]: newFuelPrice }));

    // Auto-select this fuel for the station
    if (!selectedFuels.some(f => f.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedFuels(prev => [...prev, trimmed]);
    }

    onShowToast?.(`Combustible "${trimmed}" creado y asignado a la estación.`);
    setNewFuelName('');
    setIsCreatingNewFuel(false);
  };

  const handleSave = () => {
    if (!selectedStationId) {
      onShowToast?.('Seleccione una estación de servicio');
      return;
    }
    if (selectedFuels.length === 0) {
      if (!confirm('¿Desea guardar la estación sin ningún tipo de combustible asignado? Se recomienda asignar al menos uno.')) {
        return;
      }
    }

    onSaveAssignments(selectedStationId, selectedFuels);
    const stationName = currentStation?.nombre || 'la estación';
    onShowToast?.(`Combustibles actualizados correctamente para ${stationName} (${selectedFuels.length} asignados).`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-[#12151C] border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-[#161922] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Fuel className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-mono font-bold tracking-widest px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Asignación de Combustibles
                </span>
                {currentStation?.modalidad === 'VALES_ESTACION' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                    {currentStation.empresaBandera || 'Estación de Servicio'}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5">
                Asignar Tipos de Combustible a Estación
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Station Selector Dropdown */}
          <div className="bg-[#0B0D12] border border-slate-800 p-4 rounded-xl space-y-3">
            <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-amber-400" />
                Estación de Servicio / Depósito Destino
              </span>
              <span className="text-[11px] text-slate-400 font-normal">
                {deposits.length} estaciones y depósitos disponibles
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <select
                  value={selectedStationId}
                  onChange={(e) => setSelectedStationId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-medium focus:border-amber-500 outline-hidden transition cursor-pointer"
                >
                  <optgroup label="⛽ Estaciones de Servicio (Convenios / Vales)">
                    {deposits.filter(d => d.modalidad === 'VALES_ESTACION').map(d => (
                      <option key={d.id} value={d.id}>
                        {d.empresaBandera ? `[${d.empresaBandera}] ` : ''}{d.nombre} {d.numEstacionConvenio ? `(${d.numEstacionConvenio})` : ''}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🚚 Cisternas Móviles & Bidones">
                    {deposits.filter(d => d.modalidad !== 'VALES_ESTACION').map(d => (
                      <option key={d.id} value={d.id}>
                        {d.modalidad === 'DEPOSITO_AMBULANTE' ? '🚚 ' : '🛢️ '}{d.nombre} ({d.modalidadLabel})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Quick info of current station */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-center text-xs">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Ubicación / Convenio</span>
                <span className="text-slate-200 font-medium truncate">
                  {currentStation?.ubicacion || 'Sin ubicación'}
                </span>
                {currentStation?.numEstacionConvenio && (
                  <span className="text-[10px] font-mono text-purple-300">
                    Nº Estación: {currentStation.numEstacionConvenio}
                  </span>
                )}
              </div>
            </div>

            {/* Copy configuration helper */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80 text-xs">
              <span className="text-slate-400 flex items-center gap-1">
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                Copiar combustibles de otra estación:
              </span>
              <select
                value={copyFromStationId}
                onChange={(e) => {
                  setCopyFromStationId(e.target.value);
                  handleCopyFromStation(e.target.value);
                }}
                className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-300 focus:border-amber-500 outline-hidden cursor-pointer"
              >
                <option value="">-- Seleccionar para copiar --</option>
                {deposits
                  .filter(d => d.id !== selectedStationId)
                  .map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nombre} ({d.tiposCombustibles?.length || 1} combustibles)
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Fuel Selection Card */}
          <div className="bg-[#0B0D12] border border-slate-800 p-4 rounded-xl space-y-4">
            
            {/* Header & Quick Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
              <div>
                <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span>Seleccionar Combustibles Habilitados</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-black bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    {selectedFuels.length} Seleccionados
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Marque los combustibles que los choferes y equipos pueden cargar en esta estación.
                </p>
              </div>

              {/* Quick Select Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-amber-500/40 transition cursor-pointer"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={handleSelectDieselOnly}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 hover:border-amber-500/40 transition cursor-pointer"
                >
                  Solo Diesel
                </button>
                <button
                  type="button"
                  onClick={handleSelectNaftaOnly}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-amber-500/40 transition cursor-pointer"
                >
                  Solo Nafta
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-slate-800/60 hover:bg-slate-800 text-rose-300 border border-slate-700 hover:border-rose-500/40 transition cursor-pointer"
                >
                  Limpiar
                </button>
              </div>
            </div>

            {/* Search Filter Box */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar combustible (ej: Infinia, Diesel 500, Super, Premium)..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:border-amber-500 outline-hidden"
              />
            </div>

            {/* Fuel Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {filteredFuels.map(fuel => {
                const isSelected = selectedFuels.some(f => f.toLowerCase() === fuel.name.toLowerCase());
                const isDiesel = fuel.name.toLowerCase().includes('diesel') || fuel.name.toLowerCase().includes('gasoil');
                const isNafta = fuel.name.toLowerCase().includes('nafta') || fuel.name.toLowerCase().includes('super') || fuel.name.toLowerCase().includes('premium');

                return (
                  <button
                    key={fuel.name}
                    type="button"
                    onClick={() => handleToggleFuel(fuel.name)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition select-none cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-xs'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition ${
                      isSelected
                        ? 'bg-amber-500 border-amber-400 text-black shadow-xs'
                        : 'border-slate-600 bg-slate-950'
                    }`}>
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold truncate block ${isSelected ? 'text-amber-300' : 'text-slate-300'}`}>
                          {fuel.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5 font-mono">
                        <span>
                          {isDiesel ? '🚛 Grado Diesel' : isNafta ? '🚗 Nafta' : '⛽ Combustible'}
                        </span>
                        <span className="text-emerald-400 font-semibold">
                          ${fuel.price.toLocaleString('es-AR')}/L
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Inline "Add New Fuel Type" form */}
            <div className="pt-2 border-t border-slate-800">
              {!isCreatingNewFuel ? (
                <button
                  type="button"
                  onClick={() => setIsCreatingNewFuel(true)}
                  className="w-full py-2 px-3 rounded-xl border border-dashed border-slate-700 hover:border-amber-500/50 text-slate-400 hover:text-amber-300 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer bg-slate-900/40"
                >
                  <Plus className="w-4 h-4 text-amber-400" />
                  <span>¿Falta algún combustible? Crear nuevo tipo y agregarlo al catálogo</span>
                </button>
              ) : (
                <form onSubmit={handleCreateAndAssignNewFuel} className="bg-slate-900 p-3.5 rounded-xl border border-amber-500/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Crear Nuevo Tipo de Combustible
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingNewFuel(false)}
                      className="text-slate-400 hover:text-white text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-300 block mb-1">
                        Nombre del Combustible (ej: V-Power Diesel, Shell Nafta)
                      </label>
                      <input
                        type="text"
                        value={newFuelName}
                        onChange={(e) => setNewFuelName(e.target.value)}
                        placeholder="ej: Shell V-Power Diesel"
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-500 outline-hidden font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 block mb-1">
                        Precio de Referencia ($/Lt)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={newFuelPrice}
                        onChange={(e) => setNewFuelPrice(Number(e.target.value))}
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-mono focus:border-amber-500 outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Crear y Asignar a {currentStation?.nombre || 'esta Estación'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Resumen de Combustibles Habilitados */}
          <div className="bg-[#161922] border border-slate-800 p-4 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Combustibles Habilitados para {currentStation?.nombre || 'la Estación'}:
              </span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {selectedFuels.length} asignados
              </span>
            </div>

            {selectedFuels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedFuels.map(fuel => (
                  <span
                    key={fuel}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono"
                  >
                    <span>⛽ {fuel}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleFuel(fuel)}
                      className="text-amber-400/70 hover:text-rose-400 transition cursor-pointer ml-1"
                      title="Quitar combustible"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/50 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>No ha seleccionado ningún combustible. La estación no tendrá combustibles habilitados en los vales de expendio.</span>
              </div>
            )}
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-[#161922] flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400 hidden sm:block">
            Estación: <strong className="text-white">{currentStation?.nombre || 'N/A'}</strong>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-98"
            >
              <Save className="w-4 h-4 stroke-[2.5]" />
              <span>Guardar Asignación</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
