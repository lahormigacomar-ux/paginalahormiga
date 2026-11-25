import React, { useEffect, useState } from 'react';
import {
  Vehicle,
  VehicleStatus,
  Driver,
  ParteDiario,
  RentalContract,
  Obra,
  ArcaInvoice,
  VehicleServiceLog,
  VehicleExpenseLog,
  FuelDispensary,
  PurchaseInvoice,
  CajaDiariaSession
} from '../types';
import { StatusBadge, STATUS_CONFIG } from './StatusBadge';
import { formatCurrency } from '../services/storage';
import { VehicleFinancialAnalyticsPanel } from './VehicleFinancialAnalyticsPanel';
import { 
  X, 
  Edit3, 
  Truck, 
  Calendar, 
  Clock, 
  MapPin, 
  DollarSign, 
  TrendingUp, 
  Shield, 
  Wrench, 
  QrCode, 
  CheckCircle,
  Copy,
  Check,
  UserCheck,
  Phone,
  Archive,
  ArchiveRestore,
  BarChart3,
  Info,
  ArrowLeft
} from 'lucide-react';

interface VehicleDetailModalProps {
  vehicle: Vehicle | null;
  assignedDriver?: Driver | null;
  isOpen: boolean;
  layoutMode?: 'modal' | 'workspace';
  onClose: () => void;
  onEdit: (vehicle: Vehicle) => void;
  onArchive?: (vehicle: Vehicle) => void;
  onChangeStatus: (vehicleId: string, newStatus: VehicleStatus) => void;
  onViewDriver?: (driver: Driver) => void;
  onUpdateVehicle?: (updated: Vehicle) => Promise<void> | void;
  drivers?: Driver[];
  partesDiarios?: ParteDiario[];
  rentals?: RentalContract[];
  obras?: Obra[];
  arcaInvoices?: ArcaInvoice[];
  servicesLogs?: VehicleServiceLog[];
  expensesLogs?: VehicleExpenseLog[];
  fuelVouchers?: FuelDispensary[];
  purchaseInvoices?: PurchaseInvoice[];
  cajaSessions?: CajaDiariaSession[];
}

export const VehicleDetailModal: React.FC<VehicleDetailModalProps> = ({
  vehicle,
  assignedDriver,
  isOpen,
  layoutMode = 'modal',
  onClose,
  onEdit,
  onArchive,
  onChangeStatus,
  onViewDriver,
  onUpdateVehicle,
  drivers = [],
  partesDiarios = [],
  rentals = [],
  obras = [],
  arcaInvoices = [],
  servicesLogs = [],
  expensesLogs = [],
  fuelVouchers = [],
  purchaseInvoices = [],
  cajaSessions = []
}) => {
  const isWorkspace = layoutMode === 'workspace';
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'FICHA' | 'FINANZAS'>(isWorkspace ? 'FINANZAS' : 'FICHA');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(isWorkspace ? 'FINANZAS' : 'FICHA');
    }
  }, [isOpen, vehicle?.id, isWorkspace]);

  if (!isOpen || !vehicle) return null;


  const margenDia = vehicle.precioSugerido > 0 
    ? Math.round(((vehicle.precioSugerido - vehicle.precioCosto) / vehicle.precioSugerido) * 100) 
    : 0;
  
  const gananciaDia = Math.max(0, vehicle.precioSugerido - vehicle.precioCosto);

  const margenHora = (vehicle.precioSugeridoHora && vehicle.precioCostoHora && vehicle.precioSugeridoHora > 0)
    ? Math.round(((vehicle.precioSugeridoHora - vehicle.precioCostoHora) / vehicle.precioSugeridoHora) * 100)
    : null;

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={
        isWorkspace
          ? 'w-full space-y-4 animate-in fade-in duration-200'
          : 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200'
      }
    >
      <div 
        className={
          isWorkspace
            ? 'bg-[#16191F] border border-slate-800 rounded-2xl w-full shadow-2xl flex flex-col overflow-hidden'
            : `bg-[#16191F] border border-slate-800 w-full ${
                activeTab === 'FINANZAS' ? 'max-w-6xl' : 'max-w-3xl'
              } rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] transition-all duration-200`
        }
        role={isWorkspace ? undefined : 'dialog'}
        aria-modal={isWorkspace ? undefined : true}
      >
        {/* Header: Workspace Bar (como Obras) vs Modal Hero */}
        {isWorkspace ? (
          <div className="px-4 sm:px-6 py-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                title="Volver al listado de Flota y Maquinarias"
              >
                <ArrowLeft className="w-4 h-4 text-amber-400" />
                <span>Volver a Flota</span>
              </button>

              <img
                src={vehicle?.fotografia || 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=400&q=80'}
                alt={vehicle?.modeloMarca || ''}
                className="w-12 h-12 rounded-xl object-cover border border-amber-500/40 shrink-0 bg-black"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=400&q=80';
                }}
              />

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-black bg-amber-500 font-bold px-2 py-0.5 rounded">
                    {vehicle.id}
                  </span>
                  {vehicle.codigoInterno && (
                    <span className="text-[11px] font-mono text-amber-300 font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25">
                      Int: {vehicle.codigoInterno}
                    </span>
                  )}
                  {vehicle.patente && (
                    <span className="text-[11px] font-mono text-slate-300 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                      {vehicle.patente}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    • {vehicle.clasificacion}
                  </span>
                  {vehicle.anio && (
                    <span className="text-[11px] text-amber-300 font-mono font-bold bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                      Año {vehicle.anio}
                    </span>
                  )}
                  {vehicle.archivado && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35">
                      ARCHIVADO
                    </span>
                  )}
                </div>
                <h2 className="text-white font-bold text-lg sm:text-xl mt-0.5 truncate">
                  {vehicle.modeloMarca}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <StatusBadge status={vehicle.estado} size="lg" />
              <button
                type="button"
                onClick={() => onEdit(vehicle)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span>Editar Datos</span>
              </button>
              {onArchive && (
                <button
                  type="button"
                  onClick={() => onArchive(vehicle)}
                  className={`px-3 py-2 rounded-xl transition border cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                    vehicle.archivado
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500 hover:text-black'
                      : 'bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 text-slate-300 border-slate-700'
                  }`}
                  title={vehicle.archivado ? "Desarchivar y reincorporar a la flota activa" : "Archivar vehículo"}
                >
                  {vehicle.archivado ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                  <span className="hidden sm:inline">{vehicle.archivado ? 'Desarchivar' : 'Archivar'}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className={`relative ${activeTab === 'FINANZAS' ? 'h-36' : 'h-60'} bg-black overflow-hidden transition-all duration-200 shrink-0`}>
            <img
              src={vehicle?.fotografia || 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=800&q=80'}
              alt={vehicle?.modeloMarca || ''}
              className="w-full h-full object-cover opacity-85"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=800&q=80';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#16191F] via-[#16191F]/50 to-transparent" />

            {/* Close & Edit & Archive buttons */}
            <div className="absolute top-4 right-4 flex items-center gap-2">
              {onArchive && (
                <button
                  onClick={() => onArchive(vehicle)}
                  className={`p-2 rounded-lg backdrop-blur-md transition border cursor-pointer ${
                    vehicle.archivado 
                      ? 'bg-amber-500/25 text-amber-300 border-amber-500/50 hover:bg-amber-500 hover:text-black' 
                      : 'bg-black/60 hover:bg-amber-500/80 hover:text-white text-slate-300 border-slate-700'
                  }`}
                  title={vehicle.archivado ? "Desarchivar y reincorporar a la flota activa" : "Archivar vehículo (fuera de empresa, conserva registros)"}
                >
                  {vehicle.archivado ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={() => onEdit(vehicle)}
                className="p-2 rounded-lg bg-black/60 hover:bg-amber-500 hover:text-black text-white backdrop-blur-md transition border border-slate-700 cursor-pointer"
                title="Editar vehículo"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg bg-black/60 hover:bg-white hover:text-black text-white backdrop-blur-md transition border border-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Machine Header Badges */}
            <div className="absolute bottom-3 left-6 right-6 flex flex-wrap items-end justify-between gap-3 text-white">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded bg-amber-500 text-black font-bold text-xs font-mono">
                    {vehicle.id}
                  </span>
                  <span className="text-xs text-slate-400">
                    • {vehicle.clasificacion}
                  </span>
                  {vehicle.codigoInterno && (
                    <span className="text-xs text-slate-300 font-mono bg-black/50 px-2 py-0.5 rounded border border-slate-700">
                      Int: {vehicle.codigoInterno}
                    </span>
                  )}
                  {vehicle.clasificacion === 'Vehículos de Terceros' && (
                    <span className="text-xs text-purple-300 font-bold bg-purple-900/40 px-2 py-0.5 rounded border border-purple-600/50">
                      Unidad de Tercero
                    </span>
                  )}
                  {vehicle.anio && (
                    <span className="text-xs text-amber-300 font-mono font-bold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40">
                      Año {vehicle.anio}
                    </span>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {vehicle.modeloMarca}
                </h2>
              </div>

              <StatusBadge status={vehicle.estado} size="lg" />
            </div>
          </div>
        )}

        {/* Main Workspace / Modal Tabs */}
        <div className="px-4 sm:px-6 pt-3 pb-0 bg-[#12151B] border-b border-slate-800 flex items-center gap-2 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('FINANZAS')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'FINANZAS'
                ? 'border-amber-500 text-amber-400 bg-[#16191F] rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Gastos, Precios & Rentabilidad</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('FICHA')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'FICHA'
                ? 'border-amber-500 text-amber-400 bg-[#16191F] rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>Ficha Técnica & Operativa</span>
          </button>
        </div>

        {/* Content Body */}
        <div className={`p-4 sm:p-6 space-y-6 flex-1 text-slate-200 ${isWorkspace ? '' : 'overflow-y-auto'}`}>
          {activeTab === 'FINANZAS' ? (
            <VehicleFinancialAnalyticsPanel
              vehicle={vehicle}
              assignedDriver={assignedDriver}
              drivers={drivers}
              partesDiarios={partesDiarios}
              rentals={rentals}
              obras={obras}
              arcaInvoices={arcaInvoices}
              servicesLogs={servicesLogs}
              expensesLogs={expensesLogs}
              fuelVouchers={fuelVouchers}
              purchaseInvoices={purchaseInvoices}
              cajaSessions={cajaSessions}
              onUpdateVehicle={async (updated) => {
                if (onUpdateVehicle) {
                  await onUpdateVehicle(updated);
                }
              }}
            />
          ) : (
            <>
          
          {/* Archived Vehicle Notice */}
          {vehicle.archivado && (
            <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-300">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <Archive className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Vehículo Archivado / Fuera de Empresa</p>
                  <p className="text-[11px] text-amber-300/80">
                    Este equipo ya no se muestra en la vista principal de la flota activa. Todos los comprobantes, gastos, services y contratos se encuentran resguardados.
                  </p>
                </div>
              </div>
              {onArchive && (
                <button
                  type="button"
                  onClick={() => onArchive(vehicle)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <ArchiveRestore className="w-3.5 h-3.5" />
                  <span>Desarchivar Equipo</span>
                </button>
              )}
            </div>
          )}

          {/* Main Key-Value Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-[#0F1115] p-4 rounded-xl border border-slate-800">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Patente / Dominio</span>
              <p className="text-sm font-bold font-mono text-white mt-0.5">
                {vehicle.patente || 'Sin Patente'}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Año del Móvil</span>
              <p className="text-sm font-bold font-mono text-amber-400 mt-0.5">
                {vehicle.anio ? vehicle.anio : <span className="text-slate-500 font-normal">S/D</span>}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Código Interno</span>
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-sm font-bold font-mono text-white">
                  {vehicle.codigoInterno}
                </p>
                <button
                  onClick={() => copyCode(vehicle.codigoInterno)}
                  className="text-slate-400 hover:text-amber-500"
                  title="Copiar código"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Orden en Web</span>
              <p className="text-sm font-bold font-mono text-amber-400 mt-0.5 flex items-center gap-1">
                <span>#{vehicle.ordenVisibilidad ?? '1'}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-sans font-semibold ${
                  vehicle.publicarEnWeb !== false ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-slate-800'
                }`}>
                  {vehicle.publicarEnWeb !== false ? 'Web' : 'Oculto'}
                </span>
              </p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Horómetro</span>
              <p className="text-sm font-bold text-white mt-0.5">
                {vehicle.horometro ? `${vehicle.horometro.toLocaleString()} hrs` : '0 hrs'}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Fecha de Alta</span>
              <p className="text-sm font-bold text-white mt-0.5">
                {vehicle.fechaAlta || '-'}
              </p>
            </div>
          </div>

          {/* Pricing & Rentability Box */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              <span>Estructura de Tarifas y Márgenes</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Alquiler por Día */}
              <div className="p-4 rounded-xl border border-slate-800 bg-[#0F1115]">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-white">Tarifa por DÍA</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-400">
                    +{margenDia}% Margen
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Precio Costo:</span>
                    <span className="font-mono font-semibold text-slate-300">{formatCurrency(vehicle.precioCosto)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-amber-500 font-semibold">Precio Sugerido:</span>
                    <span className="font-mono text-lg font-bold text-amber-400">
                      {formatCurrency(vehicle.precioSugerido)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-dashed border-slate-800 flex justify-between text-xs text-slate-400">
                    <span>Ganancia Neta Est. / Día:</span>
                    <span className="font-bold text-emerald-400">{formatCurrency(gananciaDia)}</span>
                  </div>
                </div>
              </div>

              {/* Alquiler por Hora */}
              <div className="p-4 rounded-xl border border-slate-800 bg-[#0F1115]">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-white">Tarifa por HORA</span>
                  {margenHora !== null && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-amber-400">
                      +{margenHora}% Margen
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Precio Costo Hora:</span>
                    <span className="font-mono font-semibold text-slate-300">
                      {vehicle.precioCostoHora ? formatCurrency(vehicle.precioCostoHora) : 'No definida'}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-amber-500 font-semibold">Precio Sugerido Hora:</span>
                    <span className="font-mono text-lg font-bold text-amber-400">
                      {vehicle.precioSugeridoHora ? formatCurrency(vehicle.precioSugeridoHora) : 'No definida'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-dashed border-slate-800 flex justify-between text-xs text-slate-400">
                    <span>Modalidad:</span>
                    <span className="font-bold text-white">{vehicle.modalidadTarifa || 'Por Día y Hora'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ubicación y Observaciones */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <MapPin className="w-4 h-4 text-amber-500" />
              <span>Ubicación Actual</span>
            </div>
            <p className="text-sm bg-[#0F1115] p-3 rounded-lg border border-slate-800 font-medium text-slate-200">
              {vehicle.ubicacionActual || 'Base Central - Parque Industrial'}
            </p>
          </div>

          {/* Assigned Driver Box */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-500">
              <UserCheck className="w-4 h-4" />
              <span>Operador / Chofer Asignado</span>
            </div>
            {assignedDriver ? (
              <div className="p-3.5 rounded-xl bg-[#0F1115] border border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src={assignedDriver.foto}
                    alt={assignedDriver.nombreApellido}
                    className="w-11 h-11 rounded-full object-cover border border-amber-500/60 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80';
                    }}
                  />
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-white text-sm">
                        {assignedDriver.nombreApellido}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        {assignedDriver.id}
                      </span>
                      <span className="text-[10px] font-mono px-1 rounded bg-slate-800 text-slate-300">
                        {assignedDriver.legajo}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {assignedDriver.categoria} • {assignedDriver.obra}
                    </p>
                  </div>
                </div>

                {onViewDriver && (
                  <button
                    onClick={() => {
                      onClose();
                      onViewDriver(assignedDriver);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-amber-500 hover:text-black text-white rounded-lg text-xs font-bold transition border border-slate-700 cursor-pointer shrink-0"
                  >
                    Ver Empleado
                  </button>
                )}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#0F1115] border border-dashed border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                <span>Esta unidad no tiene chofer o maquinista asignado actualmente.</span>
              </div>
            )}
          </div>

          {vehicle.observaciones && (
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Observaciones Técnicas</span>
              <p className="text-xs text-amber-300 bg-amber-950/20 p-3 rounded-lg border border-amber-900/40">
                {vehicle.observaciones}
              </p>
            </div>
          )}

          {/* Quick Status Changer */}
          <div className="pt-3 border-t border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Cambio Rápido de Estado Operativo:
            </span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_CONFIG) as VehicleStatus[]).map((st) => (
                <button
                  key={st}
                  onClick={() => onChangeStatus(vehicle.id, st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    vehicle.estado === st
                      ? 'bg-amber-500 text-black border-amber-500 font-bold shadow-xs'
                      : 'bg-[#0F1115] hover:bg-slate-800 border-slate-800 text-slate-300'
                  }`}
                >
                  {STATUS_CONFIG[st].label}
                </button>
              ))}
            </div>
          </div>
            </>
          )}
        </div>

        {/* Footer (solo en modo modal; en workspace las acciones están en el header superior) */}
        {!isWorkspace && (
          <div className="px-6 py-4 border-t border-slate-800 bg-[#16191F] flex items-center justify-between">
            <span className="text-xs text-slate-400">
              La Hormiga • Alquiler de Máquinas & Camiones
            </span>
            <div className="flex items-center gap-3">
              {onArchive && (
                <button
                  type="button"
                  onClick={() => onArchive(vehicle)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                    vehicle.archivado
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500 hover:text-black'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-amber-400 hover:border-amber-500/40'
                  }`}
                >
                  {vehicle.archivado ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  <span>{vehicle.archivado ? 'Desarchivar' : 'Archivar Vehículo'}</span>
                </button>
              )}
              <button
                onClick={() => onEdit(vehicle)}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Modificar Ficha</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
