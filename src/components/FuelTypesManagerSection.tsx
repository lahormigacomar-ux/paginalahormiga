import React, { useState, useEffect, useMemo } from 'react';
import { FuelDispensary, FuelDeposit } from '../types';
import { loadFuelPrices, saveFuelPrice, deleteFuelPrice, assignStationsToFuel, assignFuelsToStation } from '../services/storage';
import { AssignFuelsToStationModal } from './AssignFuelsToStationModal';
import { 
  Fuel, 
  DollarSign, 
  Plus, 
  Tag, 
  Edit3, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  Trash2, 
  Save, 
  X,
  Droplet,
  LayoutGrid,
  Table as TableIcon,
  Search,
  Building2,
  MapPin,
  Check,
  Ticket,
  Truck,
  Layers,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

interface FuelTypesManagerSectionProps {
  fuelVouchers: FuelDispensary[];
  deposits?: FuelDeposit[];
  onUpdateDeposit?: (deposit: FuelDeposit) => void;
  onUpdateDeposits?: (deposits: FuelDeposit[]) => void;
  onShowToast: (msg: string) => void;
}

export const FuelTypesManagerSection: React.FC<FuelTypesManagerSectionProps> = ({
  fuelVouchers,
  deposits = [],
  onUpdateDeposit,
  onUpdateDeposits,
  onShowToast
}) => {
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFuelName, setEditingFuelName] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [fuelToDelete, setFuelToDelete] = useState<string | null>(null);
  
  // Form state for creating/editing fuel
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState<number>(1350);
  const [formStationIds, setFormStationIds] = useState<string[]>([]);

  // State for Dedicated "Assign to Stations" Modal
  const [assigningFuel, setAssigningFuel] = useState<string | null>(null);
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([]);
  const [stationSearchQuery, setStationSearchQuery] = useState('');

  // Top Tab & Station Assignment Modal
  const [activeTab, setActiveTab] = useState<'combustibles' | 'estaciones'>('combustibles');
  const [stationForModal, setStationForModal] = useState<FuelDeposit | null>(null);
  const [isStationModalOpen, setIsStationModalOpen] = useState(false);

  const handleSaveStationFuels = (stationId: string, fuelNames: string[]) => {
    const updated = assignFuelsToStation(deposits, stationId, fuelNames);
    if (onUpdateDeposits) {
      onUpdateDeposits(updated);
    } else if (onUpdateDeposit) {
      const found = updated.find(d => d.id === stationId);
      if (found) onUpdateDeposit(found);
    }
    onShowToast(`Combustibles asignados correctamente a la estación.`);
  };

  useEffect(() => {
    const loaded = loadFuelPrices();
    setFuelPrices(loaded);
  }, []);

  // Calculate usage stats per fuel type from fuelVouchers
  const fuelStats: Record<string, { count: number; totalLiters: number }> = {};
  for (const v of fuelVouchers) {
    const ft = (v.tipoComb || v.combustible || 'Diesel General').trim().toUpperCase();
    if (!fuelStats[ft]) {
      fuelStats[ft] = { count: 0, totalLiters: 0 };
    }
    fuelStats[ft].count += 1;
    fuelStats[ft].totalLiters += Math.abs(v.cantidad !== undefined ? v.cantidad : (v.cantCarga || 0));
  }

  // Collect active fuel types directly from the catalog (fuelPrices)
  const allTypes = useMemo(() => {
    const set = new Set<string>();
    Object.keys(fuelPrices).forEach(k => {
      if (k && k.trim()) set.add(k.trim().toUpperCase());
    });
    return Array.from(set);
  }, [fuelPrices]);

  const filteredTypes = allTypes.filter(ft => ft.toLowerCase().includes(searchQuery.toLowerCase()));

  // Helper to find which stations are assigned to a fuel
  const getAssignedStations = (fuelName: string): FuelDeposit[] => {
    if (!deposits || deposits.length === 0) return [];
    return deposits.filter(d => {
      const fuels = d.tiposCombustibles && d.tiposCombustibles.length > 0
        ? d.tiposCombustibles
        : (d.tipoCombustible ? d.tipoCombustible.split(' / ').map(f => f.trim()) : []);
      return fuels.some(f => f.toLowerCase() === fuelName.toLowerCase());
    });
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingFuelName(null);
    setFormName('');
    setFormPrice(1350);
    // Default to stations with Vales Estación
    const valesStations = deposits.filter(d => d.modalidad === 'VALES_ESTACION').map(d => d.id);
    setFormStationIds(valesStations);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (name: string, price: number) => {
    setEditingFuelName(name);
    setFormName(name);
    setFormPrice(price);
    const assigned = getAssignedStations(name);
    setFormStationIds(assigned.map(d => d.id));
    setIsModalOpen(true);
  };

  // Save from Create / Edit Modal
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim().toUpperCase();
    if (!trimmedName) {
      onShowToast('Por favor ingrese el nombre del combustible.');
      return;
    }
    if (formPrice <= 0) {
      onShowToast('El precio por litro debe ser mayor a 0.');
      return;
    }

    saveFuelPrice(trimmedName, formPrice);
    setFuelPrices(prev => ({ ...prev, [trimmedName]: formPrice }));

    // Also update station assignments if deposits exist
    if (deposits && deposits.length > 0) {
      const updated = assignStationsToFuel(deposits, trimmedName, formStationIds);
      if (onUpdateDeposits) {
        onUpdateDeposits(updated);
      } else if (onUpdateDeposit) {
        updated.forEach(d => onUpdateDeposit(d));
      }
    }

    onShowToast(`Combustible "${trimmedName}" guardado correctamente ($${formPrice} / L).`);
    setIsModalOpen(false);
  };

  // Delete Fuel Type - triggers confirmation modal
  const handleDelete = (name: string) => {
    setFuelToDelete(name);
  };

  const confirmDeleteFuel = () => {
    if (!fuelToDelete) return;
    const name = fuelToDelete;

    // Remove from storage and state
    const updated = deleteFuelPrice(name);
    setFuelPrices(updated);

    // Unassign from all service stations & deposits
    if (deposits && deposits.length > 0) {
      const updatedDeposits = assignStationsToFuel(deposits, name, []);
      if (onUpdateDeposits) onUpdateDeposits(updatedDeposits);
      else if (onUpdateDeposit) updatedDeposits.forEach(d => onUpdateDeposit(d));
    }

    onShowToast(`Combustible "${name}" eliminado del catálogo.`);
    setFuelToDelete(null);
  };

  // Open Dedicated Assignment Modal
  const handleOpenAssignModal = (fuelName: string) => {
    setAssigningFuel(fuelName);
    const assigned = getAssignedStations(fuelName);
    setSelectedStationIds(assigned.map(d => d.id));
    setStationSearchQuery('');
  };

  const handleCloseAssignModal = () => {
    setAssigningFuel(null);
    setSelectedStationIds([]);
  };

  const handleToggleStation = (stationId: string) => {
    setSelectedStationIds(prev => 
      prev.includes(stationId) ? prev.filter(id => id !== stationId) : [...prev, stationId]
    );
  };

  const handleSelectAllStations = () => {
    setSelectedStationIds(deposits.map(d => d.id));
  };

  const handleSelectOnlyValesStations = () => {
    setSelectedStationIds(deposits.filter(d => d.modalidad === 'VALES_ESTACION').map(d => d.id));
  };

  const handleSelectByBrand = (brand: string) => {
    setSelectedStationIds(deposits.filter(d => 
      (d.empresaBandera && d.empresaBandera.toUpperCase() === brand.toUpperCase()) ||
      d.nombre.toUpperCase().includes(brand.toUpperCase())
    ).map(d => d.id));
  };

  const handleClearStationSelections = () => {
    setSelectedStationIds([]);
  };

  const handleSaveStationAssignments = () => {
    if (!assigningFuel || !deposits) return;
    const updated = assignStationsToFuel(deposits, assigningFuel, selectedStationIds);
    if (onUpdateDeposits) {
      onUpdateDeposits(updated);
    } else if (onUpdateDeposit) {
      updated.forEach(d => onUpdateDeposit(d));
    }
    onShowToast(`Asignación guardada: "${assigningFuel}" asignado a ${selectedStationIds.length} estaciones.`);
    handleCloseAssignModal();
  };

  // Filtered deposits inside assignment modal
  const filteredModalDeposits = useMemo(() => {
    if (!stationSearchQuery) return deposits;
    const q = stationSearchQuery.toLowerCase();
    return deposits.filter(d => 
      (d.nombre || '').toLowerCase().includes(q) ||
      (d.nombreEstacion || '').toLowerCase().includes(q) ||
      (d.numEstacionConvenio || '').toLowerCase().includes(q) ||
      (d.ubicacion || '').toLowerCase().includes(q) ||
      (d.empresaBandera || '').toLowerCase().includes(q)
    );
  }, [deposits, stationSearchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header Banner */}
      <div className="bg-[#16191F] border border-slate-800 rounded-xl p-6 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <Fuel className="w-3.5 h-3.5" />
            Configuración • Tipos de Combustible y Estaciones Asignadas
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Gestión de Combustibles y Asignación a Estaciones
          </h2>
          <p className="text-xs md:text-sm text-slate-400 max-w-2xl">
            Configure los tipos de combustible, sus precios de referencia por litro y <strong className="text-amber-300">asígnelos a cada estación de servicio o depósito</strong> para que estén disponibles en los vales y comprobantes de expendio.
          </p>
        </div>

        <div className="flex items-center gap-3 z-10">
          {activeTab === 'combustibles' && (
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  viewMode === 'grid' ? 'bg-amber-500 text-black shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Tarjetas</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  viewMode === 'table' ? 'bg-amber-500 text-black shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Tabla</span>
              </button>
            </div>
          )}

          {activeTab === 'combustibles' ? (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg transition cursor-pointer shadow-lg shadow-amber-500/20 active:scale-98"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Nuevo Combustible</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setStationForModal(deposits[0] || null);
                setIsStationModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-lg shadow-purple-500/20 active:scale-98"
            >
              <Building2 className="w-4 h-4 stroke-[2.5]" />
              <span>+ Asignar a Estación</span>
            </button>
          )}
        </div>

        <div className="absolute right-0 top-0 bottom-0 w-96 opacity-10 bg-[radial-gradient(#F59E0B_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
      </div>

      {/* Main Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('combustibles')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'combustibles'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Fuel className="w-4 h-4" />
          <span>Ver por Tipos de Combustible</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300">
            {filteredTypes.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('estaciones')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'estaciones'
              ? 'bg-purple-500/15 text-purple-300 border border-purple-500/40 shadow-sm'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Ver por Estaciones de Servicio y Depósitos</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300">
            {deposits.length}
          </span>
        </button>
      </div>

      {/* TAB 1: COMBUSTIBLES */}
      {activeTab === 'combustibles' && (
        <div className="space-y-6">
          {/* Filter / Search Bar */}
          <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 shadow-xl flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
            placeholder="Buscar tipo de combustible..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <span className="text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
          {filteredTypes.length} combustibles en catálogo • {deposits.length} estaciones disponibles
        </span>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTypes.map((ft) => {
            const price = fuelPrices[ft] || 1350;
            const stats = fuelStats[ft] || { count: 0, totalLiters: 0 };
            const isNafta = ft.includes('NAFTA') || ft.includes('SÚPER') || ft.includes('SUPÉR') || ft.includes('PREMIUM');
            const assignedStations = getAssignedStations(ft);
            
            return (
              <div key={ft} className="bg-[#16191F] border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between hover:border-slate-700 transition">
                <div className="absolute top-0 right-0 p-4 text-slate-800 pointer-events-none">
                  <Fuel className="w-16 h-16 opacity-30" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                      isNafta 
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' 
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}>
                      {isNafta ? 'Nafta' : 'Diesel / Gasoil'}
                    </span>
                    
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenAssignModal(ft)}
                        className="px-2 py-1 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                        title="Asignar este combustible a estaciones de servicio"
                      >
                        <Building2 className="w-3 h-3 text-purple-400" />
                        <span>Asignar ({assignedStations.length})</span>
                      </button>

                      <button
                        onClick={() => handleOpenEdit(ft, price)}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                        title="Editar precio o nombre"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(ft)}
                        className="p-1.5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition cursor-pointer"
                        title="Eliminar combustible"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white tracking-wide truncate" title={ft}>
                    {ft}
                  </h3>

                  <div className="mt-3 bg-slate-900/80 border border-slate-800/80 rounded-lg p-3">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Precio Unitario Vigente</span>
                    <p className="text-xl font-black font-mono text-emerald-400 mt-0.5">
                      ${price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs text-slate-400 font-normal">/ L</span>
                    </p>
                  </div>

                  {/* Estaciones de Servicio Asignadas */}
                  <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-purple-400" />
                        Estaciones Asignadas ({assignedStations.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenAssignModal(ft)}
                        className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold cursor-pointer underline"
                      >
                        Gestionar
                      </button>
                    </div>

                    {assignedStations.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-1">
                        {assignedStations.map(st => (
                          <span
                            key={st.id}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/40 text-purple-200 border border-purple-800/50 truncate max-w-[180px]"
                            title={`${st.nombre} (${st.modalidadLabel})`}
                          >
                            {st.empresaBandera ? `⛽ ${st.empresaBandera} - ` : ''}{st.nombreEstacion || st.nombre}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic py-0.5">
                        Sin estaciones asignadas. Haz clic en "Asignar" para vincularlo a una estación.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-500" />
                    <span>{stats.count} registros</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-blue-400">
                    <Droplet className="w-3.5 h-3.5" />
                    <span>{stats.totalLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-[#16191F] border border-slate-800 rounded-xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/70 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Tipo de Combustible</th>
                  <th className="py-3.5 px-4">Categoría</th>
                  <th className="py-3.5 px-4 text-right">Precio por Litro (ARS)</th>
                  <th className="py-3.5 px-4">Estaciones Asignadas</th>
                  <th className="py-3.5 px-4 text-center">Registros / Vales</th>
                  <th className="py-3.5 px-4 text-right">Volumen Total</th>
                  <th className="py-3.5 px-4 text-center sticky right-0 z-20 bg-[#121418] border-l border-slate-800 shadow-[-6px_0_12px_rgba(0,0,0,0.4)]">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-medium">
                {filteredTypes.length > 0 ? (
                  filteredTypes.map((ft) => {
                    const price = fuelPrices[ft] || 1350;
                    const stats = fuelStats[ft] || { count: 0, totalLiters: 0 };
                    const isNafta = ft.includes('NAFTA') || ft.includes('SÚPER') || ft.includes('SUPÉR') || ft.includes('PREMIUM');
                    const assignedStations = getAssignedStations(ft);
                    
                    return (
                      <tr key={ft} className="hover:bg-slate-800/40 group transition">
                        <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2.5">
                          <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            <Fuel className="w-4 h-4" />
                          </div>
                          <span>{ft}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            isNafta 
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' 
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {isNafta ? 'Nafta' : 'Diesel / Gasoil'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                          ${price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleOpenAssignModal(ft)}
                              className="px-2 py-0.5 rounded bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                            >
                              <Building2 className="w-3 h-3 text-purple-400" />
                              <span>{assignedStations.length} Estaciones</span>
                            </button>
                            {assignedStations.slice(0, 2).map(st => (
                              <span key={st.id} className="text-[10px] text-slate-400 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 truncate max-w-[120px]" title={st.nombre}>
                                {st.nombreEstacion || st.nombre}
                              </span>
                            ))}
                            {assignedStations.length > 2 && (
                              <span className="text-[10px] text-slate-500 font-mono">+{assignedStations.length - 2} más</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-300 font-mono">
                          {stats.count}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-blue-400">
                          {stats.totalLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L
                        </td>
                        <td className="py-3.5 px-4 text-center sticky right-0 z-10 bg-[#16191F] group-hover:bg-[#1E232E] border-l border-slate-800 shadow-[-6px_0_12px_rgba(0,0,0,0.4)]">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenAssignModal(ft)}
                              className="px-2.5 py-1 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 rounded-md transition text-xs font-semibold cursor-pointer"
                              title="Asignar estaciones"
                            >
                              Asignar
                            </button>
                            <button
                              onClick={() => handleOpenEdit(ft, price)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition text-xs font-semibold cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(ft)}
                              className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md transition text-xs font-semibold cursor-pointer"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 text-sm">
                      No se encontraron tipos de combustible con la búsqueda ingresada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </div>
      )}

      {/* TAB 2: ESTACIONES DE SERVICIO */}
      {activeTab === 'estaciones' && (
        <div className="space-y-6">
          <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Buscar estación por nombre, bandera o código..."
                value={stationSearchQuery}
                onChange={(e) => setStationSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                {deposits.length} estaciones y depósitos registrados
              </span>
            </div>
          </div>

          {/* Grid of Stations with fuel assignment badges and direct action */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deposits
              .filter(d => {
                if (!stationSearchQuery.trim()) return true;
                const q = stationSearchQuery.toLowerCase();
                return (
                  (d.nombreEstacion || d.nombre || '').toLowerCase().includes(q) ||
                  (d.empresaBandera || '').toLowerCase().includes(q) ||
                  (d.numEstacionConvenio || d.codigo || '').toLowerCase().includes(q) ||
                  (d.ubicacion || d.direccionEstacion || '').toLowerCase().includes(q)
                );
              })
              .map(dep => {
                const fuels = dep.tiposCombustibles && dep.tiposCombustibles.length > 0
                  ? dep.tiposCombustibles
                  : (dep.tipoCombustible ? dep.tipoCombustible.split(' / ').map(f => f.trim()) : []);
                const isStation = dep.modalidad === 'VALES_ESTACION';

                return (
                  <div
                    key={dep.id}
                    className="bg-[#16191F] border border-slate-800 hover:border-purple-500/40 rounded-xl p-5 shadow-lg flex flex-col justify-between transition group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono border ${
                            isStation
                              ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                              : dep.modalidad === 'DEPOSITO_AMBULANTE'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                          }`}>
                            {dep.modalidadLabel}
                          </span>
                          {isStation && dep.empresaBandera && (
                            <span className="text-xs font-black text-white font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                              {dep.empresaBandera}
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] font-mono text-slate-500">
                          {isStation ? (dep.numEstacionConvenio || dep.codigo) : dep.codigo}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-white group-hover:text-purple-300 transition line-clamp-1">
                        {isStation ? (dep.nombreEstacion || dep.nombre) : dep.nombre}
                      </h3>

                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 line-clamp-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{dep.ubicacion || dep.direccionEstacion || 'Base Operativa'}</span>
                      </p>

                      <div className="my-3.5 pt-3 border-t border-slate-800/80">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                            <Fuel className="w-3.5 h-3.5 text-amber-400" />
                            <span>Combustibles Habilitados ({fuels.length}):</span>
                          </span>
                        </div>

                        {fuels.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                            {fuels.map(f => {
                              const isNafta = f.toUpperCase().includes('NAFTA') || f.toUpperCase().includes('SÚPER') || f.toUpperCase().includes('PREMIUM');
                              return (
                                <span
                                  key={f}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${
                                    isNafta
                                      ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                  }`}
                                >
                                  {f}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic">
                            Sin tipos de combustible asignados.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-slate-500">
                        {dep.capacidadTotal ? `${dep.capacidadTotal.toLocaleString('es-AR')} L cap.` : 'Red Externa'}
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          setStationForModal(dep);
                          setIsStationModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500 text-purple-300 hover:text-white border border-purple-500/30 text-xs font-bold transition cursor-pointer active:scale-95"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Asignar Combustibles</span>
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DEDICADO: ASIGNAR COMBUSTIBLE A ESTACIONES DE SERVICIO
          ========================================================================= */}
      {assigningFuel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#12151B] border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30">
                      Asignación de Combustible
                    </span>
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      ${(fuelPrices[assigningFuel] || 1350).toLocaleString('es-AR')}/L
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-white mt-0.5 font-mono">
                    {assigningFuel}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Seleccione qué estaciones de servicio o depósitos despachan y suministran este combustible.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseAssignModal}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Action Presets & Search */}
            <div className="p-4 bg-slate-900/60 border-b border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 font-bold">Selección Rápida:</span>
                <button
                  type="button"
                  onClick={handleSelectOnlyValesStations}
                  className="px-2.5 py-1 rounded bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-[11px] font-bold transition cursor-pointer"
                >
                  Solo Estaciones de Servicio (Vales)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectByBrand('YPF')}
                  className="px-2.5 py-1 rounded bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 text-[11px] font-bold transition cursor-pointer"
                >
                  🔵 Solo YPF
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectByBrand('SHELL')}
                  className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition cursor-pointer"
                >
                  🟡 Solo Shell
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectByBrand('AXION')}
                  className="px-2.5 py-1 rounded bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-[11px] font-bold transition cursor-pointer"
                >
                  🔴 Solo Axion
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllStations}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition cursor-pointer"
                >
                  Todas ({deposits.length})
                </button>
                <button
                  type="button"
                  onClick={handleClearStationSelections}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] transition cursor-pointer"
                >
                  Desmarcar
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrar estaciones por nombre, código o ubicación..."
                  value={stationSearchQuery}
                  onChange={(e) => setStationSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* List of Stations */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {filteredModalDeposits.length > 0 ? (
                filteredModalDeposits.map((dep) => {
                  const isChecked = selectedStationIds.includes(dep.id);
                  const isStation = dep.modalidad === 'VALES_ESTACION';
                  const currentFuels = dep.tiposCombustibles && dep.tiposCombustibles.length > 0 
                    ? dep.tiposCombustibles 
                    : (dep.tipoCombustible ? dep.tipoCombustible.split(' / ').map(f => f.trim()) : []);

                  return (
                    <div
                      key={dep.id}
                      onClick={() => handleToggleStation(dep.id)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                        isChecked 
                          ? 'bg-purple-950/20 border-purple-500/50 shadow-xs' 
                          : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition ${
                          isChecked 
                            ? 'bg-purple-500 border-purple-400 text-white' 
                            : 'border-slate-700 bg-slate-950'
                        }`}>
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono border ${
                              isStation 
                                ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' 
                                : dep.modalidad === 'DEPOSITO_AMBULANTE' 
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                            }`}>
                              {dep.modalidadLabel}
                            </span>
                            {dep.empresaBandera && (
                              <span className="text-[11px] font-black text-white font-mono">
                                {dep.empresaBandera}
                              </span>
                            )}
                            <span className="text-xs font-mono text-slate-500">
                              [{dep.numEstacionConvenio || dep.codigo}]
                            </span>
                          </div>

                          <h4 className={`text-sm font-bold truncate mt-0.5 ${isChecked ? 'text-white' : 'text-slate-300'}`}>
                            {dep.nombreEstacion || dep.nombre}
                          </h4>

                          <p className="text-[11px] text-slate-400 truncate">
                            📍 {dep.ubicacion || dep.direccionEstacion || 'Base Operativa'}
                          </p>

                          <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-slate-500">
                            <span>Combustibles actuales:</span>
                            {currentFuels.map(f => (
                              <span key={f} className={`px-1.5 py-0.2 rounded font-mono ${f.toLowerCase() === assigningFuel.toLowerCase() ? 'bg-purple-500/20 text-purple-300 font-bold' : 'bg-slate-800 text-slate-400'}`}>
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`text-xs font-bold font-mono px-2.5 py-1 rounded-md border ${
                          isChecked 
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                            : 'bg-slate-800 text-slate-500 border-slate-700'
                        }`}>
                          {isChecked ? 'ASIGNADO' : 'NO ASIGNADO'}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No se encontraron estaciones de servicio con el filtro ingresado.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-400 font-mono">
                <strong className="text-purple-400">{selectedStationIds.length}</strong> de <strong className="text-white">{deposits.length}</strong> estaciones seleccionadas
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseAssignModal}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveStationAssignments}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-black transition cursor-pointer shadow-md shadow-purple-500/20 active:scale-98"
                >
                  <Save className="w-4 h-4" />
                  <span>Guardar Asignaciones</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CREAR / EDITAR TIPO DE COMBUSTIBLE (CON ASIGNACIÓN DE ESTACIONES)
          ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <Fuel className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingFuelName ? 'Editar Combustible' : 'Nuevo Tipo de Combustible'}
                  </h3>
                  <p className="text-xs text-slate-400">Defina el nombre, precio por litro y estaciones asignadas</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Nombre del Combustible *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: DIESEL PREMIUM, GNC, BIO-DIESEL"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium uppercase"
                />
                <span className="text-[11px] text-slate-500">Se guardará en mayúsculas para estandarizar registros.</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Precio por Litro (ARS) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 font-mono font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="1450.00"
                    value={formPrice}
                    onChange={(e) => setFormPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3.5 py-2.5 text-white text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <span className="text-[11px] text-slate-500">Este valor se usará en los cálculos de costos y presupuestos.</span>
              </div>

              {/* Selector de Estaciones Asignadas */}
              {deposits.length > 0 && (
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-purple-400" />
                      <span>Asignar a Estaciones de Servicio ({formStationIds.length} seleccionadas)</span>
                    </label>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setFormStationIds(deposits.filter(d => d.modalidad === 'VALES_ESTACION').map(d => d.id))}
                        className="text-purple-400 hover:underline cursor-pointer"
                      >
                        Solo Vales
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => setFormStationIds(deposits.map(d => d.id))}
                        className="text-slate-300 hover:text-white cursor-pointer"
                      >
                        Todas
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => setFormStationIds([])}
                        className="text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        Ninguna
                      </button>
                    </div>
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-1.5 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    {deposits.map(d => {
                      const isSelected = formStationIds.includes(d.id);
                      return (
                        <label
                          key={d.id}
                          className={`flex items-center justify-between p-2 rounded-md border text-xs cursor-pointer select-none transition ${
                            isSelected 
                              ? 'bg-purple-950/30 border-purple-500/40 text-white' 
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) setFormStationIds(prev => [...prev, d.id]);
                                else setFormStationIds(prev => prev.filter(id => id !== d.id));
                              }}
                              className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="truncate">{d.nombreEstacion || d.nombre}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {d.empresaBandera || d.modalidadLabel}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition cursor-pointer shadow-md shadow-amber-500/20 active:scale-98"
                >
                  <Save className="w-4 h-4" />
                  <span>Guardar Combustible</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Station Assignment Modal */}
      {isStationModalOpen && (
        <AssignFuelsToStationModal
          isOpen={isStationModalOpen}
          onClose={() => setIsStationModalOpen(false)}
          deposits={deposits}
          preselectedStationId={stationForModal?.id}
          onSaveAssignments={handleSaveStationFuels}
          onShowToast={onShowToast}
        />
      )}

      {/* Delete Confirmation Modal */}
      {fuelToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Confirmar Eliminación</h3>
                <p className="text-xs text-slate-400">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-800/40 text-xs text-red-200/90 leading-relaxed">
              ¿Está seguro que desea eliminar el tipo de combustible <strong className="text-white font-mono">{fuelToDelete}</strong> del catálogo general y desasignarlo de todas las estaciones?
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setFuelToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteFuel}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition cursor-pointer shadow-md shadow-red-600/20 active:scale-95"
              >
                Sí, Eliminar Combustible
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
