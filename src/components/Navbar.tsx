import React, { useState, useEffect } from 'react';
import { Menu, LogOut, ChevronRight } from 'lucide-react';
import { Logo } from './Logo';
import { SiteSettings, UserSession } from '../types';
import { loadSiteSettings, CONFIG_CHANGE_EVENT } from '../services/siteConfig';
import { APP_VERSION } from '../version';

interface NavbarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  onOpenMobileMenu: () => void;
  onOpenCreateModal: () => void;
  onOpenCreateDriverModal: () => void;
  onOpenCreateFuelVoucherModal?: () => void;
  onOpenCreateFuelDepositModal?: () => void;
  onOpenCreateIssuedVoucherModal?: () => void;
  onOpenDatabaseModal?: () => void;
  onOpenSiteSettingsModal?: (tab?: 'logo' | 'usuarios' | 'contacto' | 'textos' | 'servicios' | 'secciones') => void;
  onOpenClearModal?: () => void;
  onOpenImportExportModal?: () => void;
  onLogout?: () => void;
  userSession?: UserSession | null;
  totalVehicles: number;
  totalDrivers: number;
  totalFuelVouchers?: number;
  totalFuelDeposits?: number;
  totalIssuedVouchers?: number;
  pendingIssuedVouchersCount?: number;
}

const VIEW_INFO: Record<string, { module: string; title: string }> = {
  'flota': { module: 'Mantenimiento & Flota', title: 'Flota Vehicular & Equipos' },
  'services': { module: 'Mantenimiento & Flota', title: 'Services, Mantenimiento & Costos por Equipo' },
  'alertas-mantenimiento': { module: 'Mantenimiento & Flota', title: 'Alertas & Próximos Services' },
  'gastos-taller': { module: 'Mantenimiento & Flota', title: 'Repuestos & Facturas Taller' },
  'multas-taller': { module: 'Mantenimiento & Flota', title: 'Multas & Infracciones de Flota' },
  'costos-maquinaria': { module: 'Mantenimiento & Flota', title: 'Centro de Costos por Máquina' },
  'programacion-audio': { module: 'Partes Diarios & Obras', title: 'Programación del Día por Audio (WhatsApp Baileys)' },
  'pizarra-despacho': { module: 'Partes Diarios & Obras', title: 'Pizarra de Ubicación & Despacho (Drag & Drop)' },
  'partes-diarios': { module: 'Partes Diarios & Obras', title: 'Partes Diarios de Trabajo' },
  'obras': { module: 'Partes Diarios & Obras', title: 'Gestión de Obras & Clientes' },
  'rendimientos': { module: 'Partes Diarios & Obras', title: 'Rendimientos de Camiones & Máquinas' },
  'combustible': { module: 'Gestión de Combustible', title: 'Expendio de Combustible' },
  'contenedores-combustible': { module: 'Gestión de Combustible', title: 'Contenedores, Facturas & Sub-vínculos' },
  'vales': { module: 'Gestión de Combustible', title: 'Vales Emitidos' },
  'depositos': { module: 'Gestión de Combustible', title: 'Depósitos de Combustible' },
  'tipos-combustible': { module: 'Gestión de Combustible', title: 'Catálogo de Combustibles' },
  'costos-combustible': { module: 'Gestión de Combustible', title: 'Costos Mensuales de Combustible' },
  'stock': { module: 'Gestión de Depósitos', title: 'Depósitos e Inventario' },
  'compras': { module: 'Compras & Proveedores', title: 'Facturas de Compra & Legajos' },
  'cotizador': { module: 'Ventas & Facturación', title: 'Cotizador & Presupuestos A4' },
  'arca': { module: 'Ventas & Facturación', title: 'Facturación Electrónica ARCA' },
  'remitos': { module: 'Ventas & Facturación', title: 'Remitos Digitales & Control de Entregas' },
  'cobranzas': { module: 'Ventas & Facturación', title: 'Cobranzas, Recibos & Bajada de Facturas ARCA' },
  'cartera-cheques': { module: 'Ventas & Facturación', title: 'Cartera de Cheques, E-Cheq & Acreditaciones' },
  'plan-cuentas': { module: 'Ventas & Facturación', title: 'Plan de Cuentas, Bancos & Movimientos' },
  'alquileres': { module: 'Ventas & Facturación', title: 'Gestión de Alquileres' },
  'ferreteria': { module: 'Ventas & Facturación', title: 'Salón de Ventas & Ferretería' },
  'caja_diaria': { module: 'Ventas & Facturación', title: 'Caja Diaria & Arqueo de Billetes' },
  'choferes': { module: 'Personal & Asistencia', title: 'Nómina de Empleados' },
  'sueldos': { module: 'Personal & Asistencia', title: 'Liquidación de Sueldos (Google Sheets)' },
  'asistencia': { module: 'Personal & Asistencia', title: 'Control de Entradas y Salidas' },
  'bolsa-documentos': { module: 'Documentos', title: 'Bolsa de Documentos (Cámara & Vínculos)' },
  'config-usuarios': { module: 'Configuración', title: 'Usuarios & Permisos de Acceso' },
  'config-web-logo': { module: 'Configuración', title: 'Web: Logo & Identidad de Marca' },
  'config-web-contacto': { module: 'Configuración', title: 'Web: Teléfonos, WhatsApp & Horarios' },
  'config-web-textos': { module: 'Configuración', title: 'Web: Editor de Textos (CMS)' },
  'config-web-servicios': { module: 'Configuración', title: 'Web: Servicios & Fotos' },
  'config-web-secciones': { module: 'Configuración', title: 'Web: Orden de Secciones' },
  'config-web-equipos': { module: 'Configuración', title: 'Web: Orden de Equipos en Web' },
  'sin-acceso': { module: 'Sistema', title: 'Acceso Restringido' },
};

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onOpenMobileMenu,
  onLogout,
  userSession,
}) => {
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => loadSiteSettings());

  useEffect(() => {
    const handleConfigChange = (e: any) => {
      setSiteSettings(e?.detail || loadSiteSettings());
    };
    window.addEventListener(CONFIG_CHANGE_EVENT, handleConfigChange);
    return () => window.removeEventListener(CONFIG_CHANGE_EVENT, handleConfigChange);
  }, []);

  const userName = userSession?.nombre?.trim() || userSession?.username || 'Administrador';
  const userInitial = userName.charAt(0).toUpperCase();
  const userRoleLabel = userSession?.rol ? userSession.rol.replace(/_/g, ' ') : 'Administrador';

  const companyName = siteSettings.companyName || 'LA HORMIGA';
  const slogan = siteSettings.slogan || 'Pequeños grandes movimientos';
  const activeInfo = VIEW_INFO[currentView] || { module: 'Panel Operativo', title: 'Vista General' };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#16191F]/95 backdrop-blur-md w-full">
      {/* Row 1: Logo + Tagline on the left, User Greeting & Logout on the right */}
      <div className="h-13 py-1.5 px-2.5 sm:px-3 lg:px-3.5 flex items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <Logo variant="compact" size="xs" theme="dark" showSlogan={false} />
            <div className="hidden sm:block h-6 w-px bg-slate-800 shrink-0" />
            <div className="hidden sm:block min-w-0">
              <span className="text-xs font-black text-white block leading-tight tracking-wide uppercase truncate">
                {companyName}
              </span>
              <span className="text-[10px] text-[#F0C800] font-black block leading-tight tracking-wider uppercase truncate">
                {slogan}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Saludo del usuario activo + Logout */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#1F232B] border border-slate-700/80 shadow-sm">
            <div className="w-6 h-6 rounded-lg bg-[#F0C800] text-[#2D2D2D] flex items-center justify-center font-black text-xs shrink-0">
              {userInitial}
            </div>
            <div className="leading-tight">
              <div className="text-xs font-bold text-white whitespace-nowrap">
                Hola, <span className="text-[#F0C800]">{userName}</span>
              </div>
              <div className="hidden sm:block text-[9px] text-slate-400 font-semibold uppercase tracking-wide">
                {userRoleLabel}
              </div>
            </div>
          </div>

          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg text-xs font-bold border border-transparent hover:border-rose-500/30 transition cursor-pointer"
              title="Cerrar Sesión y Salir al Sitio Web"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden lg:inline">Salir</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Nombre del módulo y vista actual debajo del logo y tagline */}
      <div className="px-2.5 sm:px-3 lg:px-3.5 py-1.5 bg-[#11141A]/95 border-t border-slate-800/80 flex items-center gap-2 text-xs min-w-0 w-full">
        <span className="w-2 h-2 rounded-full bg-[#F0C800] shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">
          {activeInfo.module}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        <h1 className="text-xs sm:text-sm font-black text-white truncate">
          {activeInfo.title}
        </h1>
        <span
          className="ml-auto text-[10px] font-mono font-bold text-slate-300 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-md shrink-0"
          title={`Versión del sistema: v${APP_VERSION}`}
        >
          v{APP_VERSION}
        </span>
      </div>
    </header>
  );
};
