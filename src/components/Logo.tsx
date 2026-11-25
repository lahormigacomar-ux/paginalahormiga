import React, { useState, useEffect } from 'react';
import { loadSiteSettings, CONFIG_CHANGE_EVENT } from '../services/siteConfig';
import { SiteSettings } from '../types';

export type LogoVariant = 'full' | 'compact' | 'badge' | 'mascot' | 'horizontal';
export type LogoTheme = 'dark' | 'light' | 'yellow';

export interface LogoProps {
  className?: string;
  variant?: LogoVariant;
  theme?: LogoTheme;
  showSlogan?: boolean;
  showTagline?: boolean;
  compact?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  sloganText?: string;
  customLogoSrc?: string;
  showText?: boolean; // Forzar u ocultar texto HTML adjunto (por defecto false para logos de imagen pura)
}

/**
 * Componente oficial de Identidad Visual para LA HORMIGA
 * Soporta versiones específicas e independientes para:
 * - Modo Oscuro (Fondos oscuros / ERP / Barra de navegación / Headers)
 * - Modo Claro (Fondos claros / Impresiones / Reportes / Facturas)
 * - Isotipo / Cuadrado (Mascota / Ícono / App móvil)
 * 
 * Por defecto renderiza la IMAGEN PURA sin agregar textos tipográficos HTML
 * para evitar duplicidad cuando el logo ya contiene el nombre en la imagen.
 */
export const Logo: React.FC<LogoProps> = ({
  className = '',
  variant: propVariant,
  theme = 'dark',
  showSlogan = false,
  showTagline = false,
  compact,
  size = 'md',
  sloganText: propSloganText,
  customLogoSrc,
  showText,
}) => {
  const [settings, setSettings] = useState<SiteSettings>(() => loadSiteSettings());

  useEffect(() => {
    const handleConfigChange = (e: any) => {
      if (e?.detail) {
        setSettings(e.detail);
      } else {
        setSettings(loadSiteSettings());
      }
    };

    window.addEventListener(CONFIG_CHANGE_EVENT, handleConfigChange);
    window.addEventListener('storage', handleConfigChange);
    return () => {
      window.removeEventListener(CONFIG_CHANGE_EVENT, handleConfigChange);
      window.removeEventListener('storage', handleConfigChange);
    };
  }, []);

  const variant: LogoVariant = propVariant ?? (compact ? 'compact' : 'compact');
  const companyName = settings.companyName || 'LA HORMIGA';
  const sloganText = propSloganText || settings.slogan || 'Pequeños grandes movimientos';

  // Determinar qué fuente de imagen de logo corresponde según el tema y variante:
  let activeLogoSrc = customLogoSrc || '';
  if (!activeLogoSrc) {
    if (variant === 'mascot') {
      activeLogoSrc = settings.customLogoUrlIcon || 
        (theme === 'light' ? (settings.customLogoUrlLight || settings.customLogoUrlDark || settings.customLogoUrl) : (settings.customLogoUrlDark || settings.customLogoUrl || settings.customLogoUrlLight)) || 
        '';
    } else if (theme === 'light') {
      activeLogoSrc = settings.customLogoUrlLight || settings.customLogoUrl || settings.customLogoUrlDark || '';
    } else {
      // dark o yellow
      activeLogoSrc = settings.customLogoUrlDark || settings.customLogoUrl || settings.customLogoUrlLight || '';
    }
  }

  // Decidir si se incluye texto HTML al lado del logo:
  // Si showText viene explícito, manda showText.
  // Si no viene, se usa settings.logoIncludeText (default: false, sólo imagen)
  const shouldRenderText = showText !== undefined ? showText : Boolean(settings.logoIncludeText);
  const displaySlogan = (showSlogan || showTagline) && shouldRenderText;

  // Dimensiones dinámicas
  const isXs = size === 'xs';
  const isSm = size === 'sm';
  const isLg = size === 'lg';
  const isXl = size === 'xl';

  // 1. VARIANTE: BADGE / CARTEL INSTITUCIONAL
  if (variant === 'badge') {
    const isYellowBg = theme === 'yellow';
    const isLightBg = theme === 'light';
    
    return (
      <div className={`inline-flex items-center justify-center font-display font-black select-none tracking-tight transition-transform ${className}`}>
        <div
          className={`px-3 py-1.5 rounded-none font-black tracking-wider uppercase flex items-center justify-center shadow-sm ${
            isYellowBg
              ? 'bg-[#F0C800] text-[#2D2D2D]'
              : isLightBg
              ? 'bg-white text-[#2D2D2D] border-2 border-[#2D2D2D]'
              : 'bg-[#2D2D2D] text-[#F0C800]'
          } ${
            isXs ? 'text-xs px-2 py-1' : isSm ? 'text-sm px-2.5 py-1' : isLg ? 'text-xl px-5 py-2.5' : isXl ? 'text-3xl px-7 py-3.5' : 'text-base px-3.5 py-1.5'
          }`}
          style={{ fontFamily: 'Outfit, Roboto, sans-serif', letterSpacing: '0.04em' }}
        >
          {companyName}
        </div>
      </div>
    );
  }

  // 2. ILUSTRACIÓN SVG VECTORIAL DE LA MASCOTA Y MINICARGADORA (Fallback oficial)
  const renderMascotAndMachine = (scaleClass: string) => (
    <svg
      viewBox="0 0 280 230"
      className={`max-w-full ${scaleClass} drop-shadow-sm flex-shrink-0`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g id="mascot-and-bobcat">
        {/* Sombra proyectada en suelo */}
        <ellipse cx="140" cy="205" rx="125" ry="12" fill="#000000" opacity="0.18" />

        {/* Brazo de elevación trasero / estructura */}
        <path
          d="M75 125 L35 155 L20 180"
          stroke="#2D2D2D"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Cabina / Jaula de Seguridad ROPS (Negra #2D2D2D) */}
        <path
          d="M70 95 L145 95 L155 145 L60 145 Z"
          fill="#2D2D2D"
          stroke="#1A1A1A"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {/* Rejilla protectora de cabina */}
        <path d="M80 102 L138 102 L146 138 L72 138 Z" fill="#3D3D3D" />
        <line x1="95" y1="102" x2="87" y2="138" stroke="#2D2D2D" strokeWidth="3" />
        <line x1="110" y1="102" x2="105" y2="138" stroke="#2D2D2D" strokeWidth="3" />
        <line x1="125" y1="102" x2="123" y2="138" stroke="#2D2D2D" strokeWidth="3" />

        {/* Chasis Central Amarillo Institucional (#F0C800) */}
        <path
          d="M40 140 L160 140 L165 180 L35 180 Z"
          fill="#F0C800"
          stroke="#2D2D2D"
          strokeWidth="4"
          strokeLinejoin="round"
        />

        {/* Líneas de detalle del capot / carrocería */}
        <path d="M50 148 L150 148" stroke="#2D2D2D" strokeWidth="3" strokeLinecap="round" />
        <path d="M50 156 L130 156" stroke="#2D2D2D" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="55" y="162" width="25" height="8" rx="2" fill="#2D2D2D" />

        {/* Pala Frontal / Cucharón (Bucket) */}
        <path
          d="M22 150 L40 162 L32 195 L10 190 Z"
          fill="#F0C800"
          stroke="#2D2D2D"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <line x1="14" y1="190" x2="14" y2="198" stroke="#2D2D2D" strokeWidth="3" strokeLinecap="round" />
        <line x1="22" y1="192" x2="22" y2="200" stroke="#2D2D2D" strokeWidth="3" strokeLinecap="round" />
        <line x1="30" y1="194" x2="30" y2="202" stroke="#2D2D2D" strokeWidth="3" strokeLinecap="round" />

        {/* Ruedas Grandes Todo Terreno (Neumáticos Negros y Llantas) */}
        <g id="wheel-rear">
          <circle cx="65" cy="180" r="26" fill="#2D2D2D" stroke="#1A1A1A" strokeWidth="3" />
          <circle cx="65" cy="180" r="23" stroke="#1A1A1A" strokeWidth="4" strokeDasharray="6 4" fill="none" />
          <circle cx="65" cy="180" r="15" fill="#8A8A8A" stroke="#2D2D2D" strokeWidth="2.5" />
          <circle cx="65" cy="180" r="7" fill="#2D2D2D" />
          <circle cx="65" cy="180" r="3" fill="#F0C800" />
        </g>

        <g id="wheel-front">
          <circle cx="125" cy="180" r="26" fill="#2D2D2D" stroke="#1A1A1A" strokeWidth="3" />
          <circle cx="125" cy="180" r="23" stroke="#1A1A1A" strokeWidth="4" strokeDasharray="6 4" fill="none" />
          <circle cx="125" cy="180" r="15" fill="#8A8A8A" stroke="#2D2D2D" strokeWidth="2.5" />
          <circle cx="125" cy="180" r="7" fill="#2D2D2D" />
          <circle cx="125" cy="180" r="3" fill="#F0C800" />
        </g>

        {/* MASCOTA: LA HORMIGA CONSTRUCTORA */}
        <g id="ant-character">
          {/* Antenas */}
          <path d="M190 40 Q180 15 170 8" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
          <path d="M190 40 Q180 15 170 8" stroke="#2D2D2D" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <circle cx="169" cy="8" r="4.5" fill="#FFFFFF" stroke="#2D2D2D" strokeWidth="1.5" />

          <path d="M205 38 Q220 18 235 12" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
          <path d="M205 38 Q220 18 235 12" stroke="#2D2D2D" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <circle cx="236" cy="12" r="4.5" fill="#FFFFFF" stroke="#2D2D2D" strokeWidth="1.5" />

          {/* Piernas Negras */}
          <path d="M178 140 L168 185 L158 198" stroke="#2D2D2D" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M152 195 L170 195 L165 205 L145 203 Z" fill="#2D2D2D" stroke="#1A1A1A" strokeWidth="2" strokeLinejoin="round" />
          <path d="M202 140 L212 185 L224 198" stroke="#2D2D2D" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M210 195 L232 195 L235 205 L215 205 Z" fill="#2D2D2D" stroke="#1A1A1A" strokeWidth="2" strokeLinejoin="round" />

          {/* Torso */}
          <path d="M172 98 L212 98 L218 142 L168 142 Z" fill="#F0C800" stroke="#2D2D2D" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M185 98 L192 110 L199 98 Z" fill="#2D2D2D" />
          <line x1="192" y1="110" x2="192" y2="142" stroke="#2D2D2D" strokeWidth="2.5" />
          <rect x="176" y="112" width="10" height="8" rx="1.5" fill="#2D2D2D" />

          {/* Brazo derecho */}
          <path d="M172 102 L145 115 L142 135" stroke="#F0C800" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M172 102 L145 115 L142 135" stroke="#2D2D2D" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="142" cy="136" r="5" fill="#E8C898" stroke="#2D2D2D" strokeWidth="1.5" />

          {/* Brazo izquierdo Thumbs Up */}
          <path d="M212 102 L236 90 L245 70" stroke="#F0C800" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M212 102 L236 90 L245 70" stroke="#2D2D2D" strokeWidth="2" fill="none" strokeLinecap="round" />
          <ellipse cx="246" cy="68" rx="6" ry="6" fill="#E8C898" stroke="#2D2D2D" strokeWidth="2" />
          <path d="M246 68 L246 54 Q250 52 253 55 L252 68 Z" fill="#E8C898" stroke="#2D2D2D" strokeWidth="2" strokeLinejoin="round" />

          {/* Cabeza */}
          <ellipse cx="196" cy="65" rx="19" ry="16" fill="#E8C898" stroke="#2D2D2D" strokeWidth="3" />

          {/* Casco */}
          <path d="M173 58 C173 36 219 36 219 58 Z" fill="#F0C800" stroke="#2D2D2D" strokeWidth="3.5" />
          <path d="M168 58 Q196 52 224 58 Q196 63 168 58 Z" fill="#F0C800" stroke="#2D2D2D" strokeWidth="3" />
          <path d="M196 38 L196 55" stroke="#DDA800" strokeWidth="3" strokeLinecap="round" />

          {/* Ojos */}
          <ellipse cx="188" cy="63" rx="6" ry="8" fill="#FFFFFF" stroke="#2D2D2D" strokeWidth="2" />
          <circle cx="190" cy="63" r="3.5" fill="#2D2D2D" />
          <circle cx="191" cy="61" r="1.2" fill="#FFFFFF" />

          <ellipse cx="204" cy="63" rx="6" ry="8" fill="#FFFFFF" stroke="#2D2D2D" strokeWidth="2" />
          <circle cx="203" cy="63" r="3.5" fill="#2D2D2D" />
          <circle cx="204" cy="61" r="1.2" fill="#FFFFFF" />

          {/* Sonrisa */}
          <path d="M188 74 Q196 82 205 74" stroke="#2D2D2D" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M206 72 Q208 75 205 77" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );

  // Renderizador del gráfico (imagen o vector)
  const renderLogoGraphic = (scaleClass: string, imgFitClass: string = 'object-contain') => {
    if (activeLogoSrc) {
      return (
        <img
          src={activeLogoSrc}
          alt={companyName}
          referrerPolicy="no-referrer"
          className={`max-w-full ${scaleClass} ${imgFitClass} select-none transition-transform duration-200`}
        />
      );
    }
    return renderMascotAndMachine(scaleClass);
  };

  // -------------------------------------------------------------
  // CASO A: LOGO SOLO IMAGEN (Comportamiento principal solicitado)
  // -------------------------------------------------------------
  if (!shouldRenderText) {
    // Si es variante Mascota / Isotipo
    if (variant === 'mascot') {
      const mascotSizes = {
        xs: 'w-8 h-8 max-w-full',
        sm: 'w-11 h-11 max-w-full',
        md: 'w-14 h-14 sm:w-16 sm:h-16 max-w-full',
        lg: 'w-24 h-24 sm:w-28 sm:h-28 max-w-full',
        xl: 'w-36 h-36 max-w-full',
      };
      return (
        <div className={`inline-flex items-center justify-center max-w-full select-none ${className}`}>
          {renderLogoGraphic(mascotSizes[size] || 'w-14 h-14 max-w-full', 'object-contain')}
        </div>
      );
    }

    // Si es variante Completa (Hero o banners)
    if (variant === 'full') {
      const fullSizes = {
        xs: 'max-h-16 max-w-full',
        sm: 'max-h-24 max-w-full',
        md: 'max-h-36 max-w-full',
        lg: 'max-h-44 sm:max-h-48 max-w-full',
        xl: 'max-h-56 sm:max-h-64 max-w-full',
      };
      return (
        <div className={`inline-flex items-center justify-center max-w-full select-none ${className}`}>
          {renderLogoGraphic(fullSizes[size] || 'max-h-36 max-w-full', 'object-contain')}
        </div>
      );
    }

    // Variante Compact / Horizontal / Default (Ideal para Navbar, Header, Footer, Login)
    const compactSizes = {
      xs: 'h-8 sm:h-9 max-w-full',
      sm: 'h-10 sm:h-12 max-w-full',
      md: 'h-14 sm:h-16 max-w-full',
      lg: 'h-16 sm:h-20 max-w-full',
      xl: 'h-20 sm:h-24 max-w-full',
    };

    return (
      <div className={`inline-flex items-center max-w-full select-none ${className}`}>
        {renderLogoGraphic(compactSizes[size] || 'h-14 sm:h-16 max-w-full', 'object-contain object-left')}
      </div>
    );
  }

  // -------------------------------------------------------------
  // CASO B: LOGO CON TEXTO TIPOGRÁFICO ADJUNTO (Si se activa explícitamente)
  // -------------------------------------------------------------
  if (variant === 'full') {
    const isDarkTheme = theme === 'dark';
    const isYellowTheme = theme === 'yellow';

    return (
      <div className={`flex flex-col items-center text-center select-none ${className}`}>
        {renderLogoGraphic(
          isXs ? 'w-24 h-20' : isSm ? 'w-36 h-28' : isLg ? 'w-60 h-48' : isXl ? 'w-72 h-60' : 'w-48 h-40'
        )}

        <div className="mt-2">
          <h1
            className={`font-black tracking-tight leading-none uppercase ${
              isYellowTheme
                ? 'text-[#2D2D2D]'
                : isDarkTheme
                ? 'text-white'
                : 'text-[#2D2D2D]'
            } ${
              isXs ? 'text-lg' : isSm ? 'text-2xl' : isLg ? 'text-4xl' : isXl ? 'text-5xl' : 'text-3xl'
            }`}
            style={{ fontFamily: 'Outfit, Roboto, sans-serif', letterSpacing: '0.02em' }}
          >
            {companyName}
          </h1>

          {displaySlogan && (
            <p
              className={`font-slogan tracking-tight mt-1 ${
                isYellowTheme
                  ? 'text-[#2D2D2D]/90'
                  : isDarkTheme
                  ? 'text-[#F0C800]'
                  : 'text-[#2D2D2D]'
              } ${
                isXs ? 'text-[10px]' : isSm ? 'text-xs' : isLg ? 'text-base' : isXl ? 'text-lg' : 'text-sm'
              }`}
            >
              {sloganText}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'mascot') {
    return (
      <div className={`inline-flex items-center justify-center select-none ${className}`}>
        {renderLogoGraphic(
          isXs ? 'w-12 h-10' : isSm ? 'w-16 h-14' : isLg ? 'w-36 h-30' : isXl ? 'w-48 h-40' : 'w-24 h-20'
        )}
      </div>
    );
  }

  // Compact con texto
  const isDark = theme === 'dark';
  const isYellow = theme === 'yellow';

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      <div className="relative flex-shrink-0">
        {renderLogoGraphic(
          isXs ? 'w-8 h-7' : isSm ? 'w-10 h-8' : isLg ? 'w-16 h-14' : isXl ? 'w-24 h-20' : 'w-12 h-10'
        )}
      </div>

      <div className="flex flex-col justify-center">
        <span
          className={`font-black tracking-tight uppercase leading-none ${
            isYellow
              ? 'text-[#2D2D2D]'
              : isDark
              ? 'text-white'
              : 'text-[#2D2D2D]'
          } ${
            isXs ? 'text-sm' : isSm ? 'text-base' : isLg ? 'text-2xl' : isXl ? 'text-3xl' : 'text-xl'
          }`}
          style={{ fontFamily: 'Outfit, Roboto, sans-serif', letterSpacing: '0.03em' }}
        >
          {companyName}
        </span>

        {displaySlogan && (
          <span
            className={`font-slogan tracking-tight mt-0.5 whitespace-nowrap ${
              isYellow
                ? 'text-[#2D2D2D]/80'
                : isDark
                ? 'text-[#F0C800]'
                : 'text-[#595959]'
            } ${
              isXs ? 'text-[9px]' : isSm ? 'text-[10px]' : isLg ? 'text-xs' : isXl ? 'text-sm' : 'text-[11px]'
            }`}
          >
            {sloganText}
          </span>
        )}
      </div>
    </div>
  );
};
