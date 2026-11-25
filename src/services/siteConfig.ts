import { SiteSettings, SystemUser, WebSectionConfig } from '../types';
import { apiFetchSetting, apiSaveSettingStrict } from './api';
import { updateSeoStructuredData } from './seo';

export const CONFIG_CHANGE_EVENT = 'la_hormiga_site_config_updated';

export const DEFAULT_WEB_SECTIONS: WebSectionConfig[] = [
  { id: 'hero', nombre: 'Cabecera Principal (Hero)', visible: true, orden: 1 },
  { id: 'servicios', nombre: 'Servicios de Movimiento de Suelo & Obras', visible: true, orden: 2 },
  { id: 'flota', nombre: 'Catálogo de Maquinarias & Flota Vial', visible: true, orden: 3 },
  { id: 'ferreteria_aridos', nombre: 'Salón de Ferretería & Venta de Áridos', visible: true, orden: 4 },
  { id: 'nosotros', nombre: 'Sobre La Hormiga & Trayectoria', visible: true, orden: 5 },
  { id: 'contacto_ubicacion', nombre: 'Ubicación, Horarios & Contacto', visible: true, orden: 6 },
];

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  // Logo & Branding (Alojados globalmente en Cloudflare R2 CDN y sincronizados en Supabase)
  customLogoUrl: 'https://pub-b9eaa327b7214d2d9a3ac2ee74a0dcf8.r2.dev/uploads/1790100477443-logo_dark.png',
  customLogoUrlDark: 'https://pub-b9eaa327b7214d2d9a3ac2ee74a0dcf8.r2.dev/uploads/1790100477443-logo_dark.png',
  customLogoUrlLight: 'https://pub-b9eaa327b7214d2d9a3ac2ee74a0dcf8.r2.dev/uploads/1790100479358-logo_light.png',
  customLogoUrlIcon: 'https://pub-b9eaa327b7214d2d9a3ac2ee74a0dcf8.r2.dev/uploads/1790100482123-logo_icon.png',
  heroBannerUrl: 'https://pub-b9eaa327b7214d2d9a3ac2ee74a0dcf8.r2.dev/uploads/1790281062408-hero_banner.webp',
  logoIncludeText: false,
  companyName: 'LA HORMIGA',
  slogan: 'Pequeños grandes movimientos',

  // Contacto & Ubicación (Jujuy, Argentina)
  telefonoPrincipal: '(388) 456-7890',
  telefonoGuardia: '(388) 15-987-6543',
  whatsapp: '+54 9 388 987-6543',
  email: 'contacto@lahormiga.com.ar',
  direccion: 'San Salvador de Jujuy, Jujuy, Argentina',
  googleMapsUrl: 'https://maps.google.com/?q=San+Salvador+de+Jujuy+Jujuy+Argentina',

  // Horarios de Atención
  horarioSemana: 'Lunes a Viernes: 07:00 a 18:00 hs',
  horarioSabados: 'Sábados: 07:30 a 13:00 hs',
  horarioDomingos: 'Domingos y Feriados: Guardias Operativas y Emergencias 24hs',

  // Redes Sociales
  instagram: '@lahormiga_maquinarias',
  facebook: 'lahormiga.vial',
  linkedin: 'la-hormiga-maquinarias',

  // Textos Editables (CMS en Vivo)
  heroBadge: 'ALQUILER DE EQUIPOS VIALES & FERRETERÍA INDUSTRIAL',
  heroTitle: 'Soluciones Integrales para Obras y Movimiento de Suelo',
  heroSubtitle: 'Alquiler de maquinarias con o sin operario capacitado, herramientas menores, equipos para eventos y provisión directa de áridos a pie de obra.',
  heroCtaPrimary: 'Solicitar Cotización Inmediata',
  heroCtaSecondary: 'Ver Catálogo de Equipos',

  flotaTitle: 'Equipos Viales y Maquinaria Pesada',
  flotaSubtitle: 'Alquiler por hora o por día • Con opción de maquinista especializado de nómina y mantenimiento preventivo al día.',

  herramientasTitle: 'Alquiler de Herramientas Menores de Construcción',
  herramientasSubtitle: 'Rotomartillos demoledores, chanchas compactadoras, hormigoneras trompito, grupos electrógenos y cortadoras.',

  eventosTitle: 'Alquiler para Eventos, Ferias y Gastronomía',
  eventosSubtitle: 'Freezers de pozo duales, heladeras exhibidoras de bebidas, hornos pizzeros y pancheras comerciales.',

  serviciosTitle: 'Servicios Profesionales de Movimiento de Suelo',
  serviciosSubtitle: 'Excavaciones, desmonte, nivelación láser, zanjeo y apertura de calles con maquinaria propia y personal experto.',

  aridosTitle: 'Venta y Distribución de Áridos y Materiales a Granel',
  aridosSubtitle: 'Arena fina de río, piedra partida, tosca compactable, tierra negra abonada y cascote en camión o bolsón.',

  ferreteriaTitle: 'Ferretería Industrial & Salón de Ventas',
  ferreteriaSubtitle: 'Venta de herramientas de mano y eléctricas, bulonería de alta resistencia, palas forjadas, pinzas, martillos, discos y EPP.',

  nosotrosTitle: 'Sobre La Hormiga',
  nosotrosSubtitle: 'Tenacidad, precisión y compromiso en cada movimiento de suelo.',
  nosotrosTexto1: 'Nacimos con la vocación de brindar respuestas rápidas y confiables al sector de la construcción y movimiento de suelo. Combinamos la fuerza y perseverancia de la hormiga con la más alta tecnología en maquinaria vial.',
  nosotrosTexto2: 'Contamos con base operativa propia, talleres de mantenimiento preventivo y un equipo humano enfocado en la seguridad, la productividad y el cumplimiento estricto de los plazos de obra.',
  nosotrosFotoUrl: 'https://pub-b9eaa327b7214d2d9a3ac2ee74a0dcf8.r2.dev/uploads/1790281161980-nosotros.webp',

  contactoTitle: 'Ubicación, Horarios & Contacto',
  contactoSubtitle: 'Estamos a su disposición para asesorarlo en la elección del equipo ideal para su proyecto.',

  ctaBannerTitle: '¿Tenés un proyecto o necesitás alquilar un equipo ahora mismo?',
  ctaBannerSubtitle: 'Contactá a nuestros asesores técnicos por WhatsApp o vía telefónica para recibir una cotización a medida y disponibilidad en tiempo real.',
  ctaBannerBoton: 'Hablar con un Asesor por WhatsApp',

  footerText: 'Empresa líder en alquiler de equipos viales, maquinaria pesada con operario, herramientas menores, eventos y comercialización de áridos y ferretería industrial.',

  secciones: DEFAULT_WEB_SECTIONS,
};

export const DEFAULT_SYSTEM_USERS: SystemUser[] = [
  {
    id: 'USR-SUPERADMIN',
    username: 'ideasinfernal',
    password: 'ideas1271',
    nombre: 'Super Administrador La Hormiga',
    email: 'ideasinfernal@lahormiga.com',
    rol: 'SUPER_ADMIN',
    telefono: '+54 9 11 9876-5432',
    activo: true,
    accesoTotal: true,
    createdAt: new Date().toISOString(),
  }
];

// Caché temporal solo en memoria (optimización de lectura; la fuente de verdad es Supabase)
let memorySiteSettingsCache: SiteSettings | null = null;
let memorySystemUsersCache: SystemUser[] | null = null;

function mergeWithSiteDefaults(raw: Partial<SiteSettings>): SiteSettings {
  return {
    ...DEFAULT_SITE_SETTINGS,
    ...raw,
    customLogoUrl: raw.customLogoUrl?.trim() || DEFAULT_SITE_SETTINGS.customLogoUrl,
    customLogoUrlDark: raw.customLogoUrlDark?.trim() || DEFAULT_SITE_SETTINGS.customLogoUrlDark,
    customLogoUrlLight: raw.customLogoUrlLight?.trim() || DEFAULT_SITE_SETTINGS.customLogoUrlLight,
    customLogoUrlIcon: raw.customLogoUrlIcon?.trim() || DEFAULT_SITE_SETTINGS.customLogoUrlIcon,
    heroBannerUrl: raw.heroBannerUrl?.trim() || DEFAULT_SITE_SETTINGS.heroBannerUrl,
    nosotrosFotoUrl: raw.nosotrosFotoUrl?.trim() || DEFAULT_SITE_SETTINGS.nosotrosFotoUrl,
    secciones: Array.isArray(raw.secciones) && raw.secciones.length > 0
      ? raw.secciones
      : DEFAULT_WEB_SECTIONS
  };
}

// ==================== SITE SETTINGS ====================
export function loadSiteSettings(): SiteSettings {
  if (memorySiteSettingsCache) {
    updateSeoStructuredData(memorySiteSettingsCache);
    return memorySiteSettingsCache;
  }
  updateSeoStructuredData(DEFAULT_SITE_SETTINGS);
  return DEFAULT_SITE_SETTINGS;
}

export async function saveSiteSettingsAsync(settings: SiteSettings): Promise<{ ok: boolean; error?: string }> {
  const res = await apiSaveSettingStrict('site_settings', settings);
  if (!res.ok) {
    return {
      ok: false,
      error: res.error || 'No se pudo confirmar el guardado de configuración en Supabase.',
    };
  }
  memorySiteSettingsCache = { ...settings };
  updateSeoStructuredData(settings);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONFIG_CHANGE_EVENT, { detail: settings }));
  }
  return { ok: true };
}

export function saveSiteSettings(settings: SiteSettings): boolean {
  saveSiteSettingsAsync(settings).catch((err) => {
    console.warn('[SiteSettings] Error guardando en Supabase:', err);
  });
  return true;
}

export async function syncSiteSettingsFromCloud(): Promise<SiteSettings | null> {
  try {
    const cloudSettings = await apiFetchSetting<SiteSettings>('site_settings');
    if (cloudSettings && typeof cloudSettings === 'object' && cloudSettings.companyName) {
      const merged = mergeWithSiteDefaults(cloudSettings);
      memorySiteSettingsCache = merged;
      updateSeoStructuredData(merged);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CONFIG_CHANGE_EVENT, { detail: merged }));
      }
      return merged;
    }
  } catch (err) {
    console.warn('[SiteSettings] Error descargando configuración desde Supabase:', err);
  }
  return null;
}

// ==================== SYSTEM USERS (ADMIN ACCESS) ====================
export function loadSystemUsers(): SystemUser[] {
  if (memorySystemUsersCache && memorySystemUsersCache.length > 0) {
    return memorySystemUsersCache;
  }
  return [];
}

export function saveSystemUsers(users: SystemUser[]): void {
  saveSystemUsersAsync(users).catch((err) => {
    console.warn('[SystemUsers] Error sincronizando usuarios con Supabase:', err);
  });
}

export async function saveSystemUsersAsync(users: SystemUser[]): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiSaveSettingStrict('system_users', users);
    if (!res.ok) {
      return {
        ok: false,
        error: res.error || 'Supabase no confirmó el guardado de usuarios. Verificá tu conexión e intentá nuevamente.',
      };
    }
    memorySystemUsersCache = [...users];
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Error de red al guardar usuarios en Supabase.',
    };
  }
}

export async function syncSystemUsersFromCloud(): Promise<SystemUser[] | null> {
  try {
    const cloudUsers = await apiFetchSetting<SystemUser[]>('system_users');
    if (cloudUsers && Array.isArray(cloudUsers)) {
      const next = [...cloudUsers];
      if (next.length > 0 && !next.some(u => u.username === 'ideasinfernal')) {
        next.unshift(DEFAULT_SYSTEM_USERS[0]);
      }
      memorySystemUsersCache = next;
      return next;
    }
  } catch (err) {
    console.warn('[SystemUsers] Error descargando usuarios desde Supabase:', err);
  }
  return null;
}

export function authenticateUser(usernameOrEmail: string, password: string): { success: boolean; user?: SystemUser; error?: string } {
  const users = memorySystemUsersCache && memorySystemUsersCache.length > 0
    ? memorySystemUsersCache
    : DEFAULT_SYSTEM_USERS;
  const cleanInput = (usernameOrEmail || '').trim().toLowerCase();

  const found = users.find(u =>
    u.username.toLowerCase() === cleanInput || u.email.toLowerCase() === cleanInput
  );

  if (!found) {
    return { success: false, error: 'Usuario no encontrado en el sistema.' };
  }

  if (!found.activo) {
    return { success: false, error: 'El usuario se encuentra inactivo. Contacte al Administrador.' };
  }

  if (found.password !== password) {
    return { success: false, error: 'Contraseña incorrecta. Verifique sus datos.' };
  }

  const updatedUsers = users.map(u =>
    u.id === found.id ? { ...u, ultimoAcceso: new Date().toISOString() } : u
  );
  memorySystemUsersCache = updatedUsers;
  apiSaveSettingStrict('system_users', updatedUsers).catch(() => {});

  return { success: true, user: { ...found, ultimoAcceso: new Date().toISOString() } };
}

// ==================== LOGO HELPERS ====================
export function getCustomLogo(): string {
  const settings = loadSiteSettings();
  return settings.customLogoUrl || '';
}

export function setCustomLogo(logoDataUrl: string): void {
  const settings = { ...loadSiteSettings(), customLogoUrl: logoDataUrl };
  saveSiteSettings(settings);
}
