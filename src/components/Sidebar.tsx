import React, { useState, useEffect, useMemo } from 'react';
import { Logo } from './Logo';
import { APP_VERSION } from '../version';
import { 
  Truck, 
  Wrench, 
  ShieldCheck, 
  Building2, 
  Users, 
  Fuel, 
  X, 
  Layers, 
  Ticket, 
  DollarSign, 
  ClipboardList, 
  BarChart3, 
  Smartphone, 
  ShoppingBag, 
  FileText, 
  LogOut, 
  Clock, 
  Settings, 
  Trash2,
  Warehouse, 
  Wallet,
  Package,
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen,
  AlertCircle,
  Plus,
  Image as ImageIcon,
  Phone,
  ArrowUpDown,
  Globe,
  ExternalLink,
  LayoutGrid,
  Camera,
  FolderOpen,
  Landmark,
  Banknote,
  Mic,
  ShieldAlert
} from 'lucide-react';
import { Vehicle, Employee, FuelVoucher, FuelDeposit, Obra, UserSession, StockWarehouse, StockItem } from '../types';
import { hasViewAccess } from '../services/permissions';

export interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  onSelectModule?: (moduleKey: ModuleKey) => void;
  selectedWarehouseId?: string;
  onSelectWarehouse?: (warehouseId: string) => void;
  onOpenCreateWarehouseModal?: () => void;
  stockWarehouses?: StockWarehouse[];
  stockItems?: StockItem[];
  onOpenCreateModal: () => void;
  onOpenCreateDriverModal: () => void;
  onOpenCreateObraModal?: () => void;
  onOpenCreateFuelVoucherModal?: () => void;
  onOpenCreateFuelDepositModal?: () => void;
  onOpenCreateIssuedVoucherModal?: () => void;
  onOpenColumnModal: () => void;
  onOpenCalculatorModal: () => void;
  onOpenClearModal?: () => void;
  onOpenImportExportModal?: () => void;
  onExportCSV: () => void;
  onExportDriversCSV: () => void;
  onExportObrasCSV?: () => void;
  onExportFuelVouchersCSV?: () => void;
  onExportFuelDepositsCSV?: () => void;
  onExportIssuedVouchersCSV?: () => void;
  fleet: Vehicle[];
  drivers: Employee[];
  obras?: Obra[];
  fuelVouchers?: FuelVoucher[];
  fuelDeposits?: FuelDeposit[];
  issuedVouchers?: any[];
  rentalsCount?: number;
  hardwareCount?: number;
  stockCount?: number;
  servicesCount?: number;
  arcaCount?: number;
  quotationsCount?: number;
  cajaCount?: number;
  partesDiariosCount?: number;
  dispatchCount?: number;
  fichadasCount?: number;
  alertasServicesCount?: number;
  expensesCount?: number;
  finesCount?: number;
  documentosBolsaCount?: number;
  clientesCount?: number;
  proveedoresCount?: number;
  fuelContainersCount?: number;
  chequesPendientesCount?: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenDatabaseModal?: () => void;
  onOpenTelemetryModal?: () => void;
  onOpenSiteSettingsModal?: (tab?: 'logo' | 'usuarios' | 'contacto' | 'textos' | 'servicios' | 'secciones') => void;
  onNavigateToPublicWeb?: () => void;
  userSession?: UserSession | null;
  onLogout?: () => void;
  isSubmenuCollapsed?: boolean;
  onToggleSubmenuCollapse?: () => void;
}

export type ModuleKey = 'mantenimiento' | 'trabajos' | 'combustible' | 'stock' | 'compras' | 'alquileres_facturacion' | 'salon_caja' | 'personal' | 'documentos' | 'configuracion';

interface ModuleConfig {
  key: ModuleKey;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
  views: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    countKey?: string;
    customCount?: number;
    warehouseId?: string;
    emoji?: string;
    badgeColor?: string;
  }>;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  currentView,
  onSelectView,
  onSelectModule,
  selectedWarehouseId = 'ALL',
  onSelectWarehouse,
  onOpenCreateWarehouseModal,
  stockWarehouses = [],
  stockItems = [],
  onOpenClearModal,
  onOpenImportExportModal,
  fleet,
  drivers,
  obras = [],
  fuelVouchers = [],
  fuelDeposits = [],
  issuedVouchers = [],
  rentalsCount = 0,
  hardwareCount = 0,
  stockCount = 0,
  servicesCount = 0,
  arcaCount = 0,
  quotationsCount = 0,
  cajaCount = 0,
  partesDiariosCount = 0,
  dispatchCount = 0,
  fichadasCount = 0,
  alertasServicesCount = 0,
  expensesCount = 0,
  finesCount = 0,
  documentosBolsaCount = 0,
  clientesCount = 0,
  proveedoresCount = 0,
  fuelContainersCount = 0,
  chequesPendientesCount = 0,
  isOpenMobile,
  onCloseMobile,
  onNavigateToPublicWeb,
  userSession,
  onLogout,
  isSubmenuCollapsed: externalIsCollapsed,
  onToggleSubmenuCollapse: externalOnToggle
}) => {
  // Local state for collapse if external is not passed
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false);
  const isSubmenuCollapsed = externalIsCollapsed !== undefined ? externalIsCollapsed : internalIsCollapsed;
  const toggleSubmenuCollapse = externalOnToggle || (() => setInternalIsCollapsed(prev => !prev));

  // Determine active module based on currentView
  const getModuleForView = (view: string, currentMod?: ModuleKey): ModuleKey => {
    // Allow shared views ("2 caminos para una vista") to stay in the current module if already active
    if (view === 'depositos' && currentMod === 'stock') return 'stock';
    if (view === 'programacion-audio' && (currentMod === 'trabajos' || currentMod === 'personal')) return currentMod;
    if (view === 'costos-combustible' && (currentMod === 'compras' || currentMod === 'combustible')) return currentMod;
    if (
      ['clientes', 'arca', 'remitos', 'cotizador', 'cobranzas', 'cartera-cheques', 'plan-cuentas'].includes(view) &&
      (currentMod === 'salon_caja' || currentMod === 'alquileres_facturacion')
    ) {
      return currentMod;
    }

    if (['ferreteria', 'caja_diaria'].includes(view)) return 'salon_caja';
    if (['alquileres', 'clientes', 'arca', 'remitos', 'cotizador', 'cobranzas', 'cartera-cheques', 'plan-cuentas'].includes(view)) return 'alquileres_facturacion';
    if (['combustible', 'contenedores-combustible', 'vales', 'depositos', 'tipos-combustible', 'costos-combustible'].includes(view)) return 'combustible';
    if (['programacion-audio', 'pizarra-despacho', 'partes-diarios', 'obras', 'rendimientos'].includes(view)) return 'trabajos';
    if (['flota', 'services', 'alertas-mantenimiento', 'costos-maquinaria', 'gastos-taller', 'multas-taller'].includes(view)) return 'mantenimiento';
    if (['compras', 'proveedores'].includes(view)) return 'compras';
    if (['stock'].includes(view)) return 'stock';
    if (['choferes', 'sueldos', 'asistencia', 'portal-chofer'].includes(view)) return 'personal';
    if (['bolsa-documentos'].includes(view) || view.startsWith('documentos')) return 'documentos';
    if (view.startsWith('config-')) return 'configuracion';
    return 'salon_caja';
  };

  const [activeModule, setActiveModule] = useState<ModuleKey>(() => getModuleForView(currentView));

  // Sync activeModule when currentView changes, preserving module on shared views
  useEffect(() => {
    setActiveModule(prev => getModuleForView(currentView, prev));
  }, [currentView]);

  const valesPendientes = useMemo(
    () => issuedVouchers.filter(v => v.estado === 'EMITIDO').length,
    [issuedVouchers]
  );

  // Build dynamic views for Depósitos module
  const depositosSubmenuViews: ModuleConfig['views'] = useMemo(() => {
    const countsByWarehouse = new Map<string, number>();
    for (let i = 0; i < stockItems.length; i++) {
      const depId = stockItems[i].depositoId || 'DEP-TALLER';
      countsByWarehouse.set(depId, (countsByWarehouse.get(depId) || 0) + 1);
    }
    return [
      {
        id: 'stock',
        warehouseId: 'ALL',
        label: 'Todos los Depósitos',
        icon: Warehouse,
        customCount: stockItems.length
      },
      ...stockWarehouses.map(w => ({
        id: 'stock',
        warehouseId: w.id,
        label: w.nombre,
        icon: Package,
        emoji: w.icono || '🏭',
        customCount: countsByWarehouse.get(w.id) || 0
      })),
      {
        id: 'stock',
        warehouseId: 'FUEL_DEPOSITS',
        label: 'Depósito de Combustibles',
        icon: Fuel,
        emoji: '⛽',
        customCount: fuelDeposits.length
      }
    ];
  }, [stockItems, stockWarehouses, fuelDeposits.length]);

  // Orden oficial de Módulos: Ventas, Alquileres, Combustible, Trabajos, Taller, Compras, Depósitos, Personal, Docs, Config.
  const rawModules: ModuleConfig[] = [
    {
      key: 'salon_caja',
      label: 'Ventas',
      shortLabel: 'Ventas',
      icon: ShoppingBag,
      color: 'text-[#F0C800]',
      bgColor: 'bg-[#F0C800]/15',
      borderColor: 'border-[#F0C800]/40',
      views: [
        { id: 'ferreteria', label: 'Salón de Ventas & Ferretería', icon: ShoppingBag, countKey: 'hardware' },
        { id: 'cotizador', label: 'Cotizador & Presupuestos', icon: FileText, countKey: 'quotations' },
        { id: 'arca', label: 'Facturación ARCA (Ex-AFIP)', icon: ShieldCheck, countKey: 'arca' },
        { id: 'remitos', label: 'Remitos & Entregas', icon: Truck },
        { id: 'cobranzas', label: 'Cobranzas & Bajar Facturas', icon: DollarSign, countKey: 'arca' },
        { id: 'caja_diaria', label: 'Caja Diaria (Salón)', icon: Wallet, countKey: 'caja' },
        { id: 'cartera-cheques', label: 'Cartera de Cheques & E-Cheq', icon: Banknote, countKey: 'chequesPendientes' },
        { id: 'clientes', label: 'Clientes (Padrón & Ficha)', icon: Users, countKey: 'clientes' },
        { id: 'plan-cuentas', label: 'Plan de Cuentas & Bancos', icon: Landmark }
      ]
    },
    {
      key: 'alquileres_facturacion',
      label: 'Alquileres & Facturación',
      shortLabel: 'Alquileres',
      icon: FileText,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/15',
      borderColor: 'border-amber-500/40',
      views: [
        { id: 'alquileres', label: 'Gestor de Alquileres', icon: FileText, countKey: 'rentals' },
        { id: 'cotizador', label: 'Cotizador & Presupuestos', icon: FileText, countKey: 'quotations' },
        { id: 'arca', label: 'Facturación ARCA (Ex-AFIP)', icon: ShieldCheck, countKey: 'arca' },
        { id: 'remitos', label: 'Remitos & Entregas', icon: Truck },
        { id: 'cobranzas', label: 'Cobranzas & Bajar Facturas', icon: DollarSign, countKey: 'arca' },
        { id: 'cartera-cheques', label: 'Cartera de Cheques & E-Cheq', icon: Banknote, countKey: 'chequesPendientes' },
        { id: 'clientes', label: 'Clientes (Padrón & Ficha)', icon: Users, countKey: 'clientes' },
        { id: 'plan-cuentas', label: 'Plan de Cuentas & Bancos', icon: Landmark }
      ]
    },
    {
      key: 'combustible',
      label: 'Gestión de Combustible',
      shortLabel: 'Combustible',
      icon: Fuel,
      color: 'text-[#F0C800]',
      bgColor: 'bg-[#F0C800]/15',
      borderColor: 'border-[#F0C800]/40',
      views: [
        { id: 'combustible', label: 'Expendio Combustible (22 Cols)', icon: Fuel, countKey: 'fuelVouchers' },
        { id: 'contenedores-combustible', label: 'Contenedores & Facturas', icon: FolderOpen, countKey: 'fuelContainers' },
        { id: 'vales', label: 'Vales Emitidos', icon: Ticket, countKey: 'issuedVouchers' },
        { id: 'depositos', label: 'Depósitos de Combustible', icon: Layers, countKey: 'depositos' },
        { id: 'tipos-combustible', label: 'Catálogo de Combustibles', icon: Fuel },
        { id: 'costos-combustible', label: 'Costos Mensuales', icon: DollarSign }
      ]
    },
    {
      key: 'trabajos',
      label: 'Partes Diarios & Obras',
      shortLabel: 'Trabajos',
      icon: ClipboardList,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/15',
      borderColor: 'border-amber-500/40',
      views: [
        { id: 'programacion-audio', label: 'Programación x Audio (WA)', icon: Mic, countKey: 'drivers' },
        { id: 'pizarra-despacho', label: 'Pizarra de Ubicación (D&D)', icon: LayoutGrid, countKey: 'dispatch' },
        { id: 'partes-diarios', label: 'Partes Diarios de Trabajo', icon: ClipboardList, countKey: 'partesDiarios' },
        { id: 'obras', label: 'Gestión de Obras & Clientes', icon: Building2, countKey: 'obras' },
        { id: 'rendimientos', label: 'Rendimientos (Camiones)', icon: BarChart3 }
      ]
    },
    {
      key: 'mantenimiento',
      label: 'Mantenimiento & Flota',
      shortLabel: 'Taller',
      icon: Wrench,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/15',
      borderColor: 'border-cyan-500/40',
      views: [
        { id: 'flota', label: 'Flota Vehicular & Equipos', icon: Truck, countKey: 'fleet' },
        { id: 'services', label: 'Services & Mantenimientos', icon: Wrench, countKey: 'services' },
        { id: 'alertas-mantenimiento', label: 'Alertas & Próximos Services', icon: AlertCircle, countKey: 'alertasServices' },
        { id: 'gastos-taller', label: 'Repuestos & Facturas Taller', icon: FileText, countKey: 'expenses' },
        { id: 'multas-taller', label: 'Multas & Infracciones', icon: ShieldAlert, countKey: 'fines' },
        { id: 'costos-maquinaria', label: 'Centro de Costos por Máquina', icon: BarChart3 }
      ]
    },
    {
      key: 'compras',
      label: 'Compras & Proveedores',
      shortLabel: 'Compras',
      icon: Wallet,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/15',
      borderColor: 'border-emerald-500/40',
      views: [
        { id: 'proveedores', label: 'Proveedores (Padrón)', icon: Building2, countKey: 'proveedores' },
        { id: 'compras', label: 'Facturas de Compra & Legajos', icon: ShoppingBag, countKey: 'compras' },
        { id: 'costos-combustible', label: 'Costos Mensuales Combustible', icon: DollarSign }
      ]
    },
    {
      key: 'stock',
      label: 'Gestión de Depósitos',
      shortLabel: 'Depósitos',
      icon: Warehouse,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/15',
      borderColor: 'border-amber-500/40',
      views: depositosSubmenuViews
    },
    {
      key: 'personal',
      label: 'Personal & Asistencia',
      shortLabel: 'Personal',
      icon: Users,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/15',
      borderColor: 'border-blue-500/40',
      views: [
        { id: 'choferes', label: 'Nómina de Empleados', icon: Users, countKey: 'drivers' },
        { id: 'programacion-audio', label: 'Programación x Audio (WA)', icon: Mic, countKey: 'drivers' },
        { id: 'sueldos', label: 'Liquidación de Sueldos (Sheets)', icon: DollarSign },
        { id: 'asistencia', label: 'Entradas & Salidas (Asistencia)', icon: Clock, countKey: 'fichadas' },
        { id: 'portal-chofer', label: 'Cargar Parte (App Chofer)', icon: Smartphone }
      ]
    },
    {
      key: 'documentos',
      label: 'Documentos & Comprobantes',
      shortLabel: 'Docs',
      icon: FolderOpen,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/15',
      borderColor: 'border-emerald-500/40',
      views: [
        { id: 'bolsa-documentos', label: 'Bolsa de Documentos', icon: Camera, countKey: 'documentosBolsa' }
      ]
    },
    {
      key: 'configuracion',
      label: 'Configuración (Web & Usuarios)',
      shortLabel: 'Config.',
      icon: Settings,
      color: 'text-[#F0C800]',
      bgColor: 'bg-[#F0C800]/15',
      borderColor: 'border-[#F0C800]/40',
      views: [
        { id: 'config-usuarios', label: 'Usuarios & Permisos', icon: ShieldCheck },
        { id: 'config-web-logo', label: 'Web: Logo & Marca', icon: ImageIcon },
        { id: 'config-web-contacto', label: 'Web: Teléfonos & Horarios', icon: Phone },
        { id: 'config-web-textos', label: 'Web: Editor de Textos', icon: FileText },
        { id: 'config-web-servicios', label: 'Web: Servicios & Fotos', icon: Layers },
        { id: 'config-web-secciones', label: 'Web: Orden Secciones', icon: ArrowUpDown },
        { id: 'config-web-equipos', label: 'Web: Equipos en Web', icon: Truck, countKey: 'fleet' }
      ]
    }
  ];

  // Filter modules & views based on active user's granular permissions
  const modules: ModuleConfig[] = rawModules
    .map(mod => ({
      ...mod,
      views: mod.views.filter(v => hasViewAccess(userSession, v.id))
    }))
    .filter(mod => mod.views.length > 0);

  const currentModuleConfig = modules.find(m => m.key === activeModule) || modules[0];

  // Helper to get count badges for menu items
  const getCountForView = (countKey?: string, customCount?: number): number | string | null => {
    if (customCount !== undefined) return customCount;
    if (!countKey) return null;
    switch (countKey) {
      case 'arca': return arcaCount;
      case 'quotations': return quotationsCount;
      case 'rentals': return rentalsCount;
      case 'hardware': return hardwareCount;
      case 'caja': return cajaCount;
      case 'services': return servicesCount;
      case 'stock': return stockCount;
      case 'depositos': return fuelDeposits.length;
      case 'drivers': return drivers.length;
      case 'fichadas': return fichadasCount > 0 ? fichadasCount : null;
      case 'fuelVouchers': return fuelVouchers.length;
      case 'issuedVouchers': return issuedVouchers.length;
      case 'fleet': return fleet.length;
      case 'dispatch': return dispatchCount;
      case 'partesDiarios': return partesDiariosCount;
      case 'obras': return obras.length;
      case 'alertasServices': return alertasServicesCount || null;
      case 'expenses': return expensesCount || null;
      case 'fines': return finesCount || null;
      case 'documentosBolsa': return documentosBolsaCount;
      case 'clientes': return clientesCount;
      case 'proveedores': return proveedoresCount;
      case 'fuelContainers': return fuelContainersCount;
      case 'chequesPendientes': return chequesPendientesCount > 0 ? chequesPendientesCount : null;
      default: return null;
    }
  };

  const handleSelectModule = (modKey: ModuleKey) => {
    setActiveModule(modKey);
    if (onSelectModule) {
      onSelectModule(modKey);
    }
    // If submenu is collapsed, auto-expand so user can see options
    if (isSubmenuCollapsed) {
      toggleSubmenuCollapse();
    }
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 bg-zinc-950/70 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Main Dual Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 flex bg-[#121418] text-slate-200 border-r border-slate-800/80 shadow-2xl transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ============================================================ */}
        {/* COLUMN 1: PRIMARY MODULES BAR (Only Icons)                  */}
        {/* ============================================================ */}
        <div className="w-16 bg-[#16191F] border-r border-slate-800/80 flex flex-col items-center pb-3 select-none shrink-0 z-20">
          {/* Logo Brand Icon */}
          <div className="h-16 w-full flex items-center justify-center border-b border-slate-800 mb-2 shrink-0">
            <Logo variant="mascot" size="sm" theme="dark" />
          </div>

          {/* Module Icon Buttons */}
          <div className="flex-1 w-full space-y-2 px-2 overflow-y-auto scrollbar-none">
            {modules.map((mod) => {
              const IconComp = mod.icon;
              const isActive = activeModule === mod.key;

              return (
                <button
                  key={mod.key}
                  onClick={() => handleSelectModule(mod.key)}
                  className={`relative w-full aspect-square rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer group ${
                    isActive
                      ? `${mod.bgColor} ${mod.color} border ${mod.borderColor} shadow-lg shadow-black/40 scale-105`
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title={mod.label}
                >
                  <IconComp className="w-5 h-5 transition-transform group-hover:scale-110" />
                  <span className="text-[9px] font-bold tracking-tighter truncate w-full text-center px-0.5 mt-0.5 opacity-80">
                    {mod.shortLabel}
                  </span>

                  {/* Active Indicator Line */}
                  {isActive && (
                    <span className="absolute -left-2 top-2 bottom-2 w-1 rounded-r bg-[#F0C800]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Submenu Collapse / Expand Toggle Button */}
          <div className="mt-auto pt-2 border-t border-slate-800/80 w-full px-2">
            <button
              onClick={toggleSubmenuCollapse}
              className="w-full aspect-square rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              title={isSubmenuCollapsed ? 'Expandir Menú Secundario' : 'Comprimir Menú Secundario'}
            >
              {isSubmenuCollapsed ? (
                <PanelLeftOpen className="w-5 h-5 text-[#F0C800]" />
              ) : (
                <PanelLeftClose className="w-5 h-5 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* COLUMN 2: SECONDARY SUBMENU BAR ("El que desarrolla el módulo") */}
        {/* ============================================================ */}
        <div 
          className={`bg-[#16191F] flex flex-col transition-all duration-300 ease-in-out border-r border-slate-800/60 ${
            isSubmenuCollapsed ? 'w-0 opacity-0 overflow-hidden pointer-events-none' : 'w-60 opacity-100'
          }`}
        >
          {/* Header Title of Active Module */}
          <div className="h-16 px-4 bg-[#16191F] border-b border-slate-800 flex items-center justify-between min-w-[240px] shrink-0">
            <div className="flex items-center gap-2">
              {currentModuleConfig && <currentModuleConfig.icon className={`w-4 h-4 ${currentModuleConfig.color}`} />}
              <h3 className="text-xs font-black uppercase tracking-wider text-white truncate max-w-[160px]">
                {currentModuleConfig ? currentModuleConfig.shortLabel : 'Sin acceso'}
              </h3>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={toggleSubmenuCollapse}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Comprimir menú"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                onClick={onCloseMobile}
                className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                aria-label="Cerrar menú"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Submenu List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1 min-w-[240px]">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-2 py-1">
              {currentModuleConfig ? currentModuleConfig.label : 'Permisos insuficientes'}
            </div>

            {(currentModuleConfig?.views || []).map((item) => {
              const SubIcon = item.icon;
              const isSelected = item.warehouseId
                ? (currentView === 'stock' && selectedWarehouseId === item.warehouseId)
                : currentView === item.id;
              const countVal = getCountForView(item.countKey, item.customCount);

              return (
                <button
                  key={item.warehouseId ? `${item.id}-${item.warehouseId}` : item.id}
                  id={item.warehouseId ? `nav-${item.id}-${item.warehouseId}` : `nav-${item.id}`}
                  onClick={() => {
                    if (item.warehouseId && onSelectWarehouse) {
                      onSelectWarehouse(item.warehouseId);
                    }
                    onSelectView(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer group ${
                    isSelected
                      ? 'bg-[#F0C800]/15 text-[#F0C800] font-bold border border-[#F0C800]/40 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {item.emoji ? (
                      <span className="text-sm shrink-0 leading-none">{item.emoji}</span>
                    ) : (
                      <SubIcon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                        isSelected ? 'text-[#F0C800]' : 'text-slate-400 group-hover:text-white'
                      }`} />
                    )}
                    <span className="truncate">{item.label}</span>
                  </div>

                  {countVal !== null && countVal !== undefined && (
                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md shrink-0 ${
                      isSelected
                        ? 'bg-[#F0C800]/25 text-[#F0C800] border border-[#F0C800]/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700/80'
                    }`}>
                      {countVal}
                    </span>
                  )}
                </button>
              );
            })}

            {activeModule === 'stock' && onOpenCreateWarehouseModal && (
              <div className="pt-2 mt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    onSelectView('stock');
                    onOpenCreateWarehouseModal();
                    onCloseMobile();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-black bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] border border-[#F0C800]/40 transition cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>+ Crear Depósito</span>
                </button>
              </div>
            )}

            {currentModuleConfig?.key === 'configuracion' && onNavigateToPublicWeb && (
              <div className="pt-2 mt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    onNavigateToPublicWeb();
                    onCloseMobile();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold bg-[#F0C800]/10 hover:bg-[#F0C800]/20 text-[#F0C800] border border-[#F0C800]/30 transition cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    <span>Ver Web Pública en Vivo</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Special Callouts per module */}
            {currentModuleConfig?.key === 'combustible' && valesPendientes > 0 && (
              <div className="mt-2 p-2.5 bg-[#F0C800]/10 border border-[#F0C800]/30 rounded-xl text-xs text-[#F0C800] space-y-1">
                <div className="font-bold flex items-center justify-between">
                  <span>Vales Pendientes:</span>
                  <span className="font-mono font-black bg-[#F0C800] text-[#2D2D2D] px-1.5 py-0.2 rounded text-[10px]">
                    {valesPendientes}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">Hay vales emitidos esperando rendición en expendedor.</p>
              </div>
            )}
          </div>

          {/* User Profile & Logout Footer */}
          <div className="p-3 border-t border-slate-800/80 bg-[#121418] min-w-[240px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#F0C800] text-[#2D2D2D] flex items-center justify-center font-black text-xs shrink-0">
                  {userSession ? userSession.nombre.charAt(0).toUpperCase() : 'A'}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {userSession ? userSession.nombre : 'Admin Central'}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {userSession ? userSession.rol : 'Administrador'}
                  </div>
                </div>
              </div>

              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title="Cerrar Sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="mt-2 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>La Hormiga ERP</span>
              <span className="text-slate-400 font-bold">v{APP_VERSION}</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
});
