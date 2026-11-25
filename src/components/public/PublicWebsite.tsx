import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Phone, 
  MapPin, 
  Clock, 
  CheckCircle, 
  ArrowRight, 
  Sparkles, 
  Truck, 
  HardHat, 
  Wrench, 
  Utensils, 
  Flame, 
  ShoppingBag, 
  Calculator, 
  ShieldCheck, 
  MessageCircle, 
  LogIn, 
  ChevronRight, 
  ExternalLink,
  Layers,
  Check,
  Info,
  Calendar,
  Zap,
  HelpCircle,
  X,
  Award
} from 'lucide-react';
import { 
  Vehicle, 
  HardwareProduct, 
  AridoProduct, 
  SoilService, 
  EquipmentCategory 
} from '../../types';
import { Logo } from '../Logo';
import { loadSiteSettings, CONFIG_CHANGE_EVENT } from '../../services/siteConfig';

interface PublicWebsiteProps {
  fleet: Vehicle[];
  hardwareProducts: HardwareProduct[];
  aridos: AridoProduct[];
  soilServices: SoilService[];
  onOpenLogin: () => void;
  onOpenSiteSettingsModal?: (tab?: string) => void;
}

type PublicTab = 'TODOS' | 'VIAL_PESADA' | 'HERRAMIENTA_MENOR' | 'EVENTOS_GASTRONOMIA' | 'MOV_SUELO' | 'ARIDOS' | 'FERRETERIA';

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({
  fleet,
  hardwareProducts,
  aridos,
  soilServices,
  onOpenLogin,
  onOpenSiteSettingsModal,
}) => {
  const [settings, setSettings] = useState(() => loadSiteSettings());
  const [activeTab, setActiveTab] = useState<PublicTab>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<{
    type: 'VEHICLE' | 'HARDWARE' | 'ARIDO' | 'SOIL';
    data: any;
  } | null>(null);

  // Sync settings dynamically
  useEffect(() => {
    const handleConfigChange = () => {
      setSettings(loadSiteSettings());
    };
    window.addEventListener(CONFIG_CHANGE_EVENT, handleConfigChange);
    return () => window.removeEventListener(CONFIG_CHANGE_EVENT, handleConfigChange);
  }, []);

  // Calculator state
  const [calcLargo, setCalcLargo] = useState<number>(10);
  const [calcAncho, setCalcAncho] = useState<number>(8);
  const [calcProfundidad, setCalcProfundidad] = useState<number>(0.15);
  const [calcMaterial, setCalcMaterial] = useState<string>('Tosca Seleccionada');

  // Filtered Items
  const publicFleet = useMemo(() => {
    return fleet
      .filter(v => v.publicarEnWeb !== false)
      .sort((a, b) => {
        const ordA = a.ordenVisibilidad ?? 9999;
        const ordB = b.ordenVisibilidad ?? 9999;
        if (ordA !== ordB) return ordA - ordB;
        return (a.modeloMarca || '').localeCompare(b.modeloMarca || '');
      });
  }, [fleet]);

  const publicHardware = useMemo(() => {
    return hardwareProducts.filter(p => p.publicarEnWeb !== false);
  }, [hardwareProducts]);

  const publicAridos = useMemo(() => {
    return aridos.filter(a => a.publicarEnWeb !== false);
  }, [aridos]);

  const publicSoil = useMemo(() => {
    return soilServices.filter(s => s.publicarEnWeb !== false);
  }, [soilServices]);

  // Volume Calculation
  const calculatedVolume = useMemo(() => {
    const vol = calcLargo * calcAncho * calcProfundidad;
    return Math.max(0, Number(vol.toFixed(2)));
  }, [calcLargo, calcAncho, calcProfundidad]);

  const calculatedTrucks = useMemo(() => {
    return Math.ceil(calculatedVolume / 8); // 8m3 por camión promedio
  }, [calculatedVolume]);

  const handleWhatsAppContact = (text: string) => {
    const rawNumber = settings.whatsapp || '5491155008899';
    const phoneNumber = rawNumber.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/${phoneNumber}?text=${encoded}`, '_blank');
  };

  const openWhatsAppQuoteForItem = (item: any, type: string) => {
    let msg = `Hola ${settings.companyName}! Quisiera consultar disponibilidad y cotización para: `;
    if (type === 'VEHICLE') {
      msg += `*${item.modeloMarca}* (Código: ${item.codigoInterno || item.id}). `;
      if (item.precioSugerido && item.mostrarPrecioAlquiler !== false) {
        msg += `Tarifa de referencia: $${item.precioSugerido.toLocaleString('es-AR')}/día. `;
      }
    } else if (type === 'HARDWARE') {
      msg += `*${item.nombre}* (Ferretería - Código: ${item.codigo}). Precio: $${item.precioVenta.toLocaleString('es-AR')}. `;
    } else if (type === 'ARIDO') {
      msg += `*${item.nombre}* (Venta de Áridos). Precio por m³: $${item.precioPorM3.toLocaleString('es-AR')}. `;
    } else if (type === 'SOIL') {
      msg += `*Servicio de ${item.titulo}* (Movimiento de Suelo). `;
    }
    msg += `¿Podrían indicarme plazos de entrega y condiciones? Muchas gracias!`;
    handleWhatsAppContact(msg);
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#1F2228] text-slate-100 font-sans selection:bg-[#F0C800] selection:text-[#2D2D2D]">
      {/* Top Announcement Bar with Institutional Colors */}
      <div className="bg-[#F0C800] text-[#2D2D2D] px-4 py-2 text-xs font-bold flex items-center justify-between border-b border-[#DDA800]">
        <div className="max-w-7xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-1 text-center sm:text-left">
          <div className="flex items-center space-x-2">
            <span className="bg-[#2D2D2D] text-[#F0C800] px-2.5 py-0.5 rounded text-[10px] uppercase font-black tracking-wider shadow-xs">
              {settings.slogan || 'Pequeños grandes movimientos'}
            </span>
            <span className="font-semibold text-xs text-[#2D2D2D] hidden md:inline">
              Maquinaria Pesada con Operario • Herramientas • Eventos • Venta de Áridos y Ferretería
            </span>
          </div>
          <div className="flex items-center space-x-4 text-xs font-bold text-[#2D2D2D]">
            <span className="flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{settings.horarioSemana}</span>
            </span>
            <span className="hidden md:inline">•</span>
            <span className="flex items-center space-x-1.5 font-black">
              <Phone className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{settings.telefonoPrincipal}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <header className="sticky top-0 z-40 bg-[#16191F]/95 backdrop-blur-md border-b border-[#2D2D2D] shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Brand Logo - Clean, Large Image */}
          <div className="flex items-center space-x-3">
            <Logo variant="compact" size="lg" theme="dark" showSlogan={false} />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            <button
              id="whatsapp-header-btn"
              onClick={() => handleWhatsAppContact(`Hola ${settings.companyName}, me gustaría hacer una consulta sobre alquileres y cotizaciones.`)}
              className="hidden sm:flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-900/40 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp Directo</span>
            </button>

            <button
              id="open-login-modal-header-btn"
              onClick={onOpenLogin}
              className="flex items-center space-x-2 px-4 py-2.5 bg-[#2D2D2D] hover:bg-[#383838] active:bg-[#1A1A1A] text-[#F0C800] hover:text-[#F6D84C] border border-[#F0C800]/40 rounded-xl text-xs font-black transition-all shadow-md shadow-black/30 cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-[#F0C800]" />
              <span>Acceso Personal / ERP</span>
            </button>
          </div>
        </div>
      </header>

      {/* Full-Width Header Hero Banner (Ancho Completo & Editable) */}
      <section className="relative w-full overflow-hidden border-b border-[#2D2D2D] bg-[#111317]">
        {/* Background Image Container with Dynamic Banner */}
        <div 
          className="absolute inset-0 bg-cover bg-center transition-all duration-700 filter saturate-[1.15]"
          style={{
            backgroundImage: `url('${settings.heroBannerUrl || 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=2000&q=80'}')`,
          }}
        />

        {/* Lighter, balanced overlay so the photo is vivid and clearly visible */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#111317]/80 via-[#111317]/50 to-[#111317]/25 sm:from-[#111317]/75 sm:via-[#111317]/40 sm:to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#111317] via-transparent to-[#111317]/30 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#F0C800_1px,transparent_1px)] [background-size:32px_32px] opacity-10 pointer-events-none" />

        {/* Banner Content Container */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 lg:py-24">
          <div className="max-w-4xl space-y-6">
            
            {/* Top Badge */}
            <div className="inline-flex items-center space-x-2 bg-[#111317]/70 border border-[#F0C800]/60 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-bold text-[#F0C800] shadow-xl">
              <Sparkles className="w-3.5 h-3.5 text-[#F0C800]" />
              <span>{settings.heroBadge || 'FLOTA VIAL • FERRETERÍA INDUSTRIAL • MOVIMIENTO DE SUELO'}</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1] font-display drop-shadow-[0_3px_10px_rgba(0,0,0,0.9)]">
              {settings.heroTitle ? (
                settings.heroTitle
              ) : (
                <>Alquiler de Maquinarias y Equipos: <span className="text-[#F0C800] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{settings.slogan}</span></>
              )}
            </h1>

            {/* Subtitle */}
            <p className="text-sm sm:text-base lg:text-lg text-slate-100 leading-relaxed max-w-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] font-medium">
              {settings.heroSubtitle || 'Soluciones integrales para pequeñas y grandes obras: minicargadoras, retroexcavadoras con operario, herramientas menores, gastronomía para eventos, movimiento de suelo, venta de áridos y salón de ferretería.'}
            </p>

            {/* CTAs Bar */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <button
                onClick={() => setActiveTab('VIAL_PESADA')}
                className="px-6 py-3.5 bg-[#F0C800] hover:bg-[#F6D84C] active:bg-[#DDA800] text-[#2D2D2D] font-black rounded-xl text-xs sm:text-sm flex items-center space-x-2 shadow-xl shadow-[#F0C800]/25 transition-all cursor-pointer transform hover:-translate-y-0.5"
              >
                <span>{settings.heroCtaPrimary || 'Ver Maquinaria Vial'}</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
              
              <button
                onClick={() => handleWhatsAppContact(`Hola ${settings.companyName}! Quisiera solicitar cotización para mi obra.`)}
                className="px-6 py-3.5 bg-[#16191F]/90 hover:bg-[#2D2D2D] active:bg-[#111317] text-white border border-slate-700 hover:border-[#F0C800]/50 font-bold rounded-xl text-xs sm:text-sm flex items-center space-x-2 backdrop-blur-md transition-all shadow-lg cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                <span>Pedir Cotización Inmediata</span>
              </button>

              <div className="hidden sm:flex items-center gap-2 px-4 py-3 bg-black/40 border border-slate-800 backdrop-blur-md rounded-xl text-xs text-slate-300">
                <Phone className="w-3.5 h-3.5 text-[#F0C800]" />
                <span className="font-bold">{settings.telefonoPrincipal}</span>
              </div>
            </div>

            {/* 4 Brand Pillars / Servicios Express */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-left">
              <div className="p-3.5 bg-[#16191F]/90 border border-slate-800/90 backdrop-blur-md rounded-xl hover:border-[#F0C800]/50 transition shadow-lg">
                <div className="text-[#F0C800] font-bold text-xs flex items-center space-x-1.5">
                  <HardHat className="w-4 h-4 text-[#F0C800]" />
                  <span>Con Operador</span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Maquinistas calificados en nómina
                </div>
              </div>

              <div className="p-3.5 bg-[#16191F]/90 border border-slate-800/90 backdrop-blur-md rounded-xl hover:border-[#F0C800]/50 transition shadow-lg">
                <div className="text-[#F0C800] font-bold text-xs flex items-center space-x-1.5">
                  <Truck className="w-4 h-4 text-[#F0C800]" />
                  <span>Flete en Obra</span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Logística y traslado a destino
                </div>
              </div>

              <div className="p-3.5 bg-[#16191F]/90 border border-slate-800/90 backdrop-blur-md rounded-xl hover:border-[#F0C800]/50 transition shadow-lg">
                <div className="text-[#F0C800] font-bold text-xs flex items-center space-x-1.5">
                  <Calculator className="w-4 h-4 text-[#F0C800]" />
                  <span>Áridos por m³</span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Arena, piedra, tosca y tierra
                </div>
              </div>

              <div className="p-3.5 bg-[#16191F]/90 border border-slate-800/90 backdrop-blur-md rounded-xl hover:border-[#F0C800]/50 transition shadow-lg">
                <div className="text-[#F0C800] font-bold text-xs flex items-center space-x-1.5">
                  <ShoppingBag className="w-4 h-4 text-[#F0C800]" />
                  <span>Ferretería</span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Salón de ventas e insumos
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Main Catalog & Categories Navigation */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 p-1.5 bg-[#16191F] border border-slate-800 rounded-2xl mb-8">
          {[
            { id: 'TODOS' as PublicTab, label: 'Todo el Catálogo', icon: Layers },
            { id: 'VIAL_PESADA' as PublicTab, label: '🚜 Maquinaria Pesada', count: publicFleet.filter(f => f.categoriaEquipo === 'VIAL_PESADA' || f.categoriaEquipo === 'TRANSPORTE').length },
            { id: 'HERRAMIENTA_MENOR' as PublicTab, label: '🔨 Herramientas Menores', count: publicFleet.filter(f => f.categoriaEquipo === 'HERRAMIENTA_MENOR').length },
            { id: 'EVENTOS_GASTRONOMIA' as PublicTab, label: '❄️ Eventos & Gastronomía', count: publicFleet.filter(f => f.categoriaEquipo === 'EVENTOS_GASTRONOMIA').length },
            { id: 'MOV_SUELO' as PublicTab, label: '🏗️ Movimiento de Suelo', count: publicSoil.length },
            { id: 'ARIDOS' as PublicTab, label: '🚚 Venta de Áridos', count: publicAridos.length },
            { id: 'FERRETERIA' as PublicTab, label: '🛒 Ferretería & Salón', count: publicHardware.length },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2 cursor-pointer ${
                  isActive 
                    ? 'bg-[#F0C800] text-[#2D2D2D] font-black shadow-md shadow-[#F0C800]/20' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${isActive ? 'bg-[#2D2D2D] text-[#F0C800]' : 'bg-slate-800 text-slate-400'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search and Filters Bar */}
        <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar máquina, herramienta, árido o servicio..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Mostrando resultados activos con tarifas vigentes y stock para entrega inmediata
          </div>
        </div>

        {/* ==================== 1. SECCIÓN MAQUINARIA PESADA Y EQUIPOS VIALES ==================== */}
        {(activeTab === 'TODOS' || activeTab === 'VIAL_PESADA') && (
          <div className="mb-14">
            <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl">🚜</span>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {settings.flotaTitle || 'Equipos Viales y Maquinaria Pesada'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {settings.flotaSubtitle || 'Alquiler por hora o por día • Con opción de maquinista especializado de nómina'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicFleet
                .filter(v => (v.categoriaEquipo === 'VIAL_PESADA' || v.categoriaEquipo === 'TRANSPORTE' || !v.categoriaEquipo))
                .filter(v => 
                  !searchQuery || 
                  v.modeloMarca.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  v.clasificacion.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((eq) => (
                  <div 
                    key={eq.id}
                    className="bg-slate-850 border border-slate-800 rounded-2xl overflow-hidden hover:border-amber-500/50 hover:shadow-xl hover:shadow-amber-500/5 transition-all group flex flex-col justify-between"
                  >
                    <div>
                      {/* Image Thumbnail */}
                      <div className="relative aspect-[16/10] bg-slate-900 overflow-hidden">
                        <img 
                          src={eq.fotografia} 
                          alt={eq.modeloMarca}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                          <span className="bg-slate-950/80 backdrop-blur-sm text-amber-400 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            {eq.clasificacion}
                          </span>
                          {eq.incluyeOperario && (
                            <span className="bg-emerald-950/80 backdrop-blur-sm text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Operador Incluido
                            </span>
                          )}
                        </div>

                        <div className="absolute bottom-3 right-3">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg backdrop-blur-md ${
                            eq.estado === 'DISPONIBLE' 
                              ? 'bg-emerald-500/90 text-slate-950 font-black' 
                              : eq.estado === 'ALQUILADO' 
                              ? 'bg-blue-600/90 text-white' 
                              : 'bg-amber-500/90 text-slate-950'
                          }`}>
                            {eq.estado === 'DISPONIBLE' ? 'DISPONIBLE HOY' : eq.estado === 'ALQUILADO' ? 'EN OBRA (RESERVAR)' : 'CONSULTAR FECHA'}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-5 space-y-3">
                        <div>
                          <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">
                            {eq.modeloMarca}
                          </h3>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {eq.descripcionCorta || eq.observaciones || 'Maquinaria de alto rendimiento con mantenimiento preventivo oficial.'}
                          </p>
                        </div>

                        {/* Specs Chips */}
                        {eq.especificaciones && eq.especificaciones.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {eq.especificaciones.slice(0, 3).map((spec, idx) => (
                              <span key={idx} className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/50">
                                {spec}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pricing & CTA */}
                    <div className="p-5 pt-0 border-t border-slate-800/80 mt-2">
                      <div className="flex items-center justify-between py-3">
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">Tarifa Sugerida</div>
                          {eq.mostrarPrecioAlquiler !== false ? (
                            <div className="text-amber-400 font-extrabold text-base">
                              ${eq.precioSugerido.toLocaleString('es-AR')} <span className="text-xs font-normal text-slate-400">/ día</span>
                              {eq.precioSugeridoHora && (
                                <span className="text-xs font-semibold text-slate-400 block">
                                  (${eq.precioSugeridoHora.toLocaleString('es-AR')}/hora)
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-amber-400 font-bold text-sm">
                              Consultar Tarifa
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => openWhatsAppQuoteForItem(eq, 'VEHICLE')}
                          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-md shadow-amber-500/20"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Cotizar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ==================== 2. SECCIÓN HERRAMIENTAS MENORES ==================== */}
        {(activeTab === 'TODOS' || activeTab === 'HERRAMIENTA_MENOR') && (
          <div className="mb-14">
            <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl">🔨</span>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {settings.herramientasTitle || 'Alquiler de Herramientas Menores de Construcción'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {settings.herramientasSubtitle || 'Rotomartillos demoledores, chanchas compactadoras, hormigoneras trompito, grupos electrógenos y cortadoras'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {publicFleet
                .filter(v => v.categoriaEquipo === 'HERRAMIENTA_MENOR')
                .filter(v => 
                  !searchQuery || 
                  v.modeloMarca.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  v.clasificacion.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((tool) => (
                  <div 
                    key={tool.id}
                    className="bg-slate-850 border border-slate-800 rounded-2xl overflow-hidden hover:border-amber-500/50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative aspect-[4/3] bg-slate-900 overflow-hidden">
                        <img 
                          src={tool.fotografia} 
                          alt={tool.modeloMarca}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute top-2 left-2 bg-slate-950/80 text-amber-400 border border-amber-500/30 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase">
                          {tool.clasificacion}
                        </span>
                        <span className="absolute bottom-2 right-2 bg-emerald-500 text-slate-950 text-[9px] font-black px-2 py-0.5 rounded">
                          DISPONIBLE
                        </span>
                      </div>

                      <div className="p-4 space-y-2">
                        <h4 className="text-sm font-bold text-white leading-tight">
                          {tool.modeloMarca}
                        </h4>
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {tool.descripcionCorta || tool.observaciones}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 pt-0 border-t border-slate-800/80">
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">Tarifa por día</div>
                          <div className="text-amber-400 font-extrabold text-sm">
                            ${tool.precioSugerido.toLocaleString('es-AR')}
                          </div>
                        </div>

                        <button
                          onClick={() => openWhatsAppQuoteForItem(tool, 'VEHICLE')}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold transition-all"
                        >
                          Alquilar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ==================== 3. SECCIÓN EVENTOS & GASTRONOMÍA ==================== */}
        {(activeTab === 'TODOS' || activeTab === 'EVENTOS_GASTRONOMIA') && (
          <div className="mb-14">
            <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl">❄️</span>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {settings.eventosTitle || 'Alquiler para Eventos, Ferias y Gastronomía'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {settings.eventosSubtitle || 'Freezers de pozo duales, heladeras exhibidoras de bebidas, hornos pizzeros y pancheras comerciales'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {publicFleet
                .filter(v => v.categoriaEquipo === 'EVENTOS_GASTRONOMIA')
                .filter(v => 
                  !searchQuery || 
                  v.modeloMarca.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  v.clasificacion.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((gasto) => (
                  <div 
                    key={gasto.id}
                    className="bg-slate-850 border border-slate-800 rounded-2xl overflow-hidden hover:border-amber-500/50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative aspect-[4/3] bg-slate-900 overflow-hidden">
                        <img 
                          src={gasto.fotografia} 
                          alt={gasto.modeloMarca}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute top-2 left-2 bg-slate-950/80 text-amber-400 border border-amber-500/30 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase">
                          {gasto.clasificacion}
                        </span>
                        <span className="absolute bottom-2 right-2 bg-emerald-500 text-slate-950 text-[9px] font-black px-2 py-0.5 rounded">
                          LISTO PARA RETIRO
                        </span>
                      </div>

                      <div className="p-4 space-y-2">
                        <h4 className="text-sm font-bold text-white leading-tight">
                          {gasto.modeloMarca}
                        </h4>
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {gasto.descripcionCorta || gasto.observaciones}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 pt-0 border-t border-slate-800/80">
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">Alquiler x Evento / Día</div>
                          <div className="text-amber-400 font-extrabold text-sm">
                            ${gasto.precioSugerido.toLocaleString('es-AR')}
                          </div>
                        </div>

                        <button
                          onClick={() => openWhatsAppQuoteForItem(gasto, 'VEHICLE')}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-all"
                        >
                          Reservar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ==================== 4. SECCIÓN MOVIMIENTO DE SUELO ==================== */}
        {(activeTab === 'TODOS' || activeTab === 'MOV_SUELO') && (
          <div className="mb-14">
            <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl">🏗️</span>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {settings.serviciosTitle || 'Servicios Profesionales de Movimiento de Suelo'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {settings.serviciosSubtitle || 'Excavaciones, desmonte, nivelación láser, zanjeo y apertura de calles con maquinaria propia y personal experto'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {publicSoil
                .filter(s => 
                  !searchQuery || 
                  s.titulo.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  s.descripcion.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((srv) => (
                  <div 
                    key={srv.id}
                    className="bg-slate-850 border border-slate-800 rounded-2xl overflow-hidden hover:border-amber-500/50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative aspect-[21/9] bg-slate-900 overflow-hidden">
                        <img 
                          src={srv.foto} 
                          alt={srv.titulo}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                        <div className="absolute bottom-3 left-4 right-4">
                          <h3 className="text-lg font-bold text-white">
                            {srv.titulo}
                          </h3>
                          <span className="text-[11px] text-amber-400 font-semibold">
                            {srv.unidadCotizacion}
                          </span>
                        </div>
                      </div>

                      <div className="p-5 space-y-4">
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {srv.descripcion}
                        </p>

                        <div className="space-y-1.5">
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            Ventajas Operativas:
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {srv.ventajas.map((v, i) => (
                              <div key={i} className="flex items-start space-x-1.5 text-[11px] text-slate-300">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                <span>{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="pt-1">
                          <span className="text-[11px] text-slate-400 font-medium">Equipos afectados: </span>
                          <span className="text-[11px] text-amber-400 font-semibold">{srv.equiposUtilizados.join(', ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 pt-0 border-t border-slate-800/80">
                      <div className="flex items-center justify-between py-3">
                        <span className="text-xs text-slate-400">Presupuesto en obra sin cargo</span>
                        <button
                          onClick={() => openWhatsAppQuoteForItem(srv, 'SOIL')}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-md shadow-amber-500/20"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>Solicitar Cotización</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ==================== 5. SECCIÓN VENTA DE ÁRIDOS ==================== */}
        {(activeTab === 'TODOS' || activeTab === 'ARIDOS') && (
          <div className="mb-14">
            <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl">🚚</span>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {settings.aridosTitle || 'Venta y Distribución de Áridos y Materiales a Granel'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {settings.aridosSubtitle || 'Arena fina de río, piedra partida, tosca compactable, tierra negra abonada y cascote en camión o bolsón'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicAridos
                .filter(a => 
                  !searchQuery || 
                  a.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  a.tipo.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((arido) => (
                  <div 
                    key={arido.id}
                    className="bg-slate-850 border border-slate-800 rounded-2xl overflow-hidden hover:border-amber-500/50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative aspect-[16/9] bg-slate-900 overflow-hidden">
                        <img 
                          src={arido.foto} 
                          alt={arido.nombre}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute top-3 left-3 bg-slate-950/80 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase">
                          {arido.tipo}
                        </span>
                      </div>

                      <div className="p-5 space-y-3">
                        <h3 className="text-base font-bold text-white">
                          {arido.nombre}
                        </h3>
                        <p className="text-xs text-slate-300">
                          {arido.descripcion}
                        </p>
                        <div className="text-[11px] text-slate-400 bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/50">
                          📦 {arido.pedidoMinimo || 'Venta por metro cúbico o bolsón Big Bag'}
                        </div>
                      </div>
                    </div>

                    <div className="p-5 pt-0 border-t border-slate-800/80">
                      <div className="flex items-center justify-between py-3">
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">Precio x m³</div>
                          <div className="text-amber-400 font-black text-lg">
                            ${arido.precioPorM3.toLocaleString('es-AR')}
                          </div>
                          {arido.precioPorBolsom && (
                            <div className="text-[10px] text-slate-400">
                              Bolsón 1m³: ${arido.precioPorBolsom.toLocaleString('es-AR')}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => openWhatsAppQuoteForItem(arido, 'ARIDO')}
                          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-md shadow-amber-500/20"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Pedir Camión</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {/* Interactive Calculator for Volume */}
            <div className="mt-8 bg-gradient-to-br from-slate-850 to-slate-800 border border-slate-700/80 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2.5 bg-amber-500 text-slate-950 rounded-xl font-bold">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Calculadora Estimada de Metros Cúbicos (m³) para Obra
                  </h3>
                  <p className="text-xs text-slate-400">
                    Calcula cuánta tosca, tierra, piedra o arena necesitás para rellenar o nivelar tu lote o platea
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Largo del Terreno (m)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={calcLargo}
                    onChange={(e) => setCalcLargo(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Ancho del Terreno (m)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={calcAncho}
                    onChange={(e) => setCalcAncho(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Espesor / Profundidad (m)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    value={calcProfundidad}
                    onChange={(e) => setCalcProfundidad(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Material a Utilizar
                  </label>
                  <select
                    value={calcMaterial}
                    onChange={(e) => setCalcMaterial(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
                  >
                    <option value="Tosca Seleccionada">Tosca Seleccionada</option>
                    <option value="Arena de Río">Arena de Río</option>
                    <option value="Piedra Partida 6/20">Piedra Partida 6/20</option>
                    <option value="Tierra Negra Abonada">Tierra Negra Abonada</option>
                    <option value="Cascote Triturado">Cascote Triturado</option>
                  </select>
                </div>
              </div>

              <div className="mt-5 p-4 bg-slate-900/90 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-6">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">Volumen Total</span>
                    <span className="text-xl font-black text-amber-400">{calculatedVolume} m³</span>
                  </div>
                  <div className="h-8 w-px bg-slate-800" />
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">Estimación en Camiones</span>
                    <span className="text-xl font-black text-white">~{calculatedTrucks} viajes (8m³)</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const msg = `Hola La Hormiga! Realicé el cálculo en su web para una superficie de ${calcLargo}m x ${calcAncho}m x ${calcProfundidad}m de espesor (Total: ${calculatedVolume} m³ de ${calcMaterial}, aprox ${calculatedTrucks} camiones). ¿Me podrían cotizar el viaje puesto en obra?`;
                    handleWhatsAppContact(msg);
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Cotizar este Volumen por WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 6. SECCIÓN FERRETERÍA & SALÓN DE VENTAS ==================== */}
        {(activeTab === 'TODOS' || activeTab === 'FERRETERIA') && (
          <div className="mb-14">
            <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl">🛒</span>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {settings.ferreteriaTitle || 'Ferretería Industrial & Salón de Ventas'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {settings.ferreteriaSubtitle || 'Venta de herramientas de mano y eléctricas, bulonería de alta resistencia, palas forjadas, pinzas, martillos, discos y EPP'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {publicHardware
                .filter(p => 
                  !searchQuery || 
                  p.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  p.marca?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  p.categoria.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((prod) => (
                  <div 
                    key={prod.id}
                    className="bg-slate-850 border border-slate-800 rounded-2xl overflow-hidden hover:border-amber-500/50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative aspect-square bg-slate-900 overflow-hidden">
                        <img 
                          src={prod.foto} 
                          alt={prod.nombre}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        {prod.marca && (
                          <span className="absolute top-2 left-2 bg-slate-950/80 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            {prod.marca}
                          </span>
                        )}
                        <span className="absolute bottom-2 right-2 bg-slate-900/90 text-slate-300 text-[10px] font-medium px-2 py-0.5 rounded">
                          Stock: {prod.stockActual} {prod.unidadMedida}
                        </span>
                      </div>

                      <div className="p-4 space-y-2">
                        <div className="text-[10px] text-amber-400/90 font-bold uppercase tracking-wider">
                          {prod.codigo}
                        </div>
                        <h4 className="text-sm font-bold text-white leading-snug">
                          {prod.nombre}
                        </h4>
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {prod.descripcion}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 pt-0 border-t border-slate-800/80">
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">Precio de Venta</div>
                          <div className="text-amber-400 font-extrabold text-sm">
                            ${prod.precioVenta.toLocaleString('es-AR')}
                          </div>
                        </div>

                        <button
                          onClick={() => openWhatsAppQuoteForItem(prod, 'HARDWARE')}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-all"
                        >
                          Comprar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>

      {/* Commercial Guarantees Banner */}
      <section className="bg-slate-850 border-y border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center sm:text-left">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl shrink-0 border border-amber-500/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Equipos Certificados y Asegurados</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Mantenimiento oficial preventivo continuo, pólizas de seguro todo riesgo y VTV vigente en todas las unidades.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl shrink-0 border border-amber-500/20">
                <HardHat className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Nómina de Maquinistas Propios</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Operadores de maquinaria con experiencia, ART al día y capacitación constante para trabajos de alta precisión.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl shrink-0 border border-amber-500/20">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Salón de Ventas & Retiro Inmediato</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Ferretería con stock permanente de insumos para la construcción, herramientas profesionales y bulonería.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sobre Nosotros: Empresa, Infraestructura y Trayectoria */}
      <section className="bg-[#16191F] border-y border-[#2D2D2D] py-14 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#F0C800] bg-[#F0C800]/10 px-3 py-1 rounded-full border border-[#F0C800]/30">
                Trayectoria & Experiencia
              </span>
              <h3 className="text-2xl sm:text-3xl font-black text-white font-display">
                {settings.nosotrosTitle || 'Sobre Nuestra Empresa'}
              </h3>
              <p className="text-sm text-[#F0C800] font-semibold font-display">
                {settings.nosotrosSubtitle || 'Compromiso, seguridad y calidad en cada movimiento.'}
              </p>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {settings.nosotrosTexto1 || 'En LA HORMIGA brindamos soluciones integrales para obras civiles, movimientos de suelo, alquiler de maquinaria pesada y provisión de áridos.'}
              </p>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                {settings.nosotrosTexto2 || 'Contamos con base operativa propia, flota con mantenimiento oficial continuo y un equipo de maquinistas y técnicos con amplia experiencia.'}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleWhatsAppContact(`Hola ${settings.companyName}! Quisiera solicitar cotización e información institucional.`)}
                  className="px-4 py-2.5 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] font-black rounded-xl text-xs flex items-center space-x-2 transition shadow-md cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{settings.ctaBannerBoton || 'Consultar por WhatsApp'}</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 flex justify-center w-full">
              <div className="bg-[#1F2228] border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl transition hover:border-[#F0C800]/40">
                {/* Imagen Institucional / Base Operativa Editable */}
                <div className="relative h-56 sm:h-64 w-full overflow-hidden bg-slate-900">
                  <img
                    src={settings.nosotrosFotoUrl || 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=1200&q=80'}
                    alt="Base Operativa y Flota Oficial"
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=1200&q=80';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1F2228] via-transparent to-black/30 pointer-events-none" />
                  <div className="absolute top-3 left-3 bg-[#111317]/85 backdrop-blur-md border border-[#F0C800]/40 px-3 py-1 rounded-full text-[10px] font-black text-[#F0C800] flex items-center gap-1.5 shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-[#F0C800] animate-pulse" />
                    <span>Base Operativa & Flota Oficial</span>
                  </div>
                </div>

                <div className="p-6 space-y-3 text-left">
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <MapPin className="w-4 h-4 text-[#F0C800] shrink-0" />
                    <span>{settings.direccion}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <Clock className="w-4 h-4 text-[#F0C800] shrink-0" />
                    <span>{settings.horarioSemana}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs pt-1 border-t border-slate-800/80">
                    <Phone className="w-4 h-4 text-[#F0C800] shrink-0" />
                    <span className="font-bold text-white text-sm">{settings.telefonoPrincipal}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Oficial */}
      <footer className="bg-[#111317] text-slate-400 py-12 border-t border-[#2D2D2D]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="space-y-4">
              <Logo variant="compact" size="lg" theme="dark" showSlogan={false} />
              <p className="text-xs text-slate-400 leading-relaxed">
                {settings.footerText || 'Empresa líder en alquiler de equipos viales, maquinaria pesada con operario, herramientas menores, eventos y comercialización de áridos y ferretería industrial.'}
              </p>
            </div>

            <div>
              <h5 className="text-xs font-black text-white uppercase tracking-wider mb-3 font-display">
                Líneas de Negocio
              </h5>
              <ul className="space-y-1.5 text-xs text-slate-400 font-medium">
                <li>• Alquiler de Maquinaria Vial (Bobcat, Retro, Orugas)</li>
                <li>• Herramientas Menores (Rotomartillos, Trompitos)</li>
                <li>• Gastronomía & Eventos (Freezers, Heladeras)</li>
                <li>• Movimiento de Suelo & Nivelación Láser</li>
                <li>• Venta de Áridos (Arena, Piedra, Tosca, Tierra)</li>
                <li>• Salón de Ventas Ferretería Industrial</li>
              </ul>
            </div>

            <div>
              <h5 className="text-xs font-black text-white uppercase tracking-wider mb-3 font-display">
                Contacto & Ubicación
              </h5>
              <ul className="space-y-2.5 text-xs text-slate-400 font-medium">
                <li className="flex items-center space-x-2">
                  <MapPin className="w-4 h-4 text-[#F0C800] shrink-0" />
                  <span>{settings.direccion}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Phone className="w-4 h-4 text-[#F0C800] shrink-0" />
                  <span>Central: {settings.telefonoPrincipal}</span>
                </li>
                {settings.telefonoGuardia && (
                  <li className="flex items-center space-x-2">
                    <Phone className="w-4 h-4 text-[#F0C800] shrink-0" />
                    <span>Guardia: {settings.telefonoGuardia}</span>
                  </li>
                )}
                <li className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-[#F0C800] shrink-0" />
                  <span>{settings.horarioSemana}</span>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="text-xs font-black text-white uppercase tracking-wider mb-3 font-display">
                Acceso Personal / ERP
              </h5>
              <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                Ingreso al ERP de gestión interna para administración, encargados de obra, choferes y ventas.
              </p>
              <button
                onClick={onOpenLogin}
                className="w-full py-2.5 px-4 bg-[#2D2D2D] hover:bg-[#383838] active:bg-[#1A1A1A] text-[#F0C800] border border-[#F0C800]/40 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-2 shadow-md cursor-pointer"
              >
                <LogIn className="w-4 h-4 text-[#F0C800]" />
                <span>Iniciar Sesión ERP</span>
              </button>
            </div>
          </div>

          <div className="pt-8 border-t border-[#2D2D2D] flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-medium">
            <div>
              © {new Date().getFullYear()} {settings.companyName} • {settings.slogan}. Todos los derechos reservados.
            </div>
            <div className="mt-2 sm:mt-0 flex items-center space-x-3">
              <span>Alquileres</span>
              <span>•</span>
              <span>Movimiento de Suelo</span>
              <span>•</span>
              <span>Ferretería & Áridos</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
