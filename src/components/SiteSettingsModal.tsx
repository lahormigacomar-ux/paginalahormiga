import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Settings, 
  Image as ImageIcon, 
  Upload, 
  Trash2, 
  RefreshCw, 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  Check, 
  Phone, 
  MapPin, 
  Clock, 
  Mail, 
  Globe, 
  FileText, 
  Layers, 
  ArrowUp, 
  ArrowDown, 
  Save, 
  AlertCircle, 
  Plus, 
  Edit, 
  CheckCircle2, 
  Sparkles,
  ExternalLink,
  MessageSquare,
  Search,
  Zap,
  Split,
  Sliders,
  CheckCircle,
  MessageCircle,
  HardHat,
  Truck,
  ShoppingBag,
  Calculator,
  ArrowRight,
  Clipboard,
  Moon,
  Sun,
  Palette,
  RotateCcw
} from 'lucide-react';
import { 
  SiteSettings, 
  SystemUser, 
  UserRole, 
  WebSectionConfig, 
  SoilService,
  Vehicle
} from '../types';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { 
  loadSiteSettings, 
  saveSiteSettings, 
  loadSystemUsers, 
  saveSystemUsers, 
  syncSiteSettingsFromCloud,
  syncSystemUsersFromCloud,
  DEFAULT_SITE_SETTINGS,
  DEFAULT_WEB_SECTIONS,
  CONFIG_CHANGE_EVENT
} from '../services/siteConfig';
import { loadSoilServices, saveSoilServices, syncSoilServicesFromCloud } from '../services/storage';
import { uploadImageToCloudflareR2 } from '../services/api';
import { Logo } from './Logo';
import { ImageClipboardDropzone } from './common/ImageClipboardDropzone';
import { useClipboardImagePaste } from '../hooks/useClipboardImagePaste';
import { UsersPermissionsSection } from './UsersPermissionsSection';

interface SiteSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'logo' | 'usuarios' | 'contacto' | 'textos' | 'servicios' | 'secciones' | 'equipos';
  activeTab?: 'logo' | 'usuarios' | 'contacto' | 'textos' | 'servicios' | 'secciones' | 'equipos';
  currentUser?: any;
  onNavigateToPublicWeb?: () => void;
  fleet?: Vehicle[];
  onSaveFleet?: (newFleet: Vehicle[]) => void;
  embedded?: boolean;
  hideTabsBar?: boolean;
  onUsersUpdated?: (users: SystemUser[]) => void;
}

export const SiteSettingsModal: React.FC<SiteSettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'logo',
  activeTab: propActiveTab,
  currentUser,
  onNavigateToPublicWeb,
  fleet,
  onSaveFleet,
  embedded = false,
  hideTabsBar = false,
  onUsersUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'logo' | 'usuarios' | 'contacto' | 'textos' | 'servicios' | 'secciones' | 'equipos'>(propActiveTab || initialTab);
  
  useEffect(() => {
    if (isOpen || embedded) {
      setActiveTab(propActiveTab || initialTab);
    }
  }, [isOpen, embedded, propActiveTab, initialTab]);
  
  // Settings state
  const [settings, setSettings] = useState<SiteSettings>(() => loadSiteSettings());
  const [users, setUsers] = useState<SystemUser[]>(() => loadSystemUsers());
  const [services, setServices] = useState<SoilService[]>(() => loadSoilServices());
  const [localFleet, setLocalFleet] = useState<Vehicle[]>(() => {
    return fleet ? [...fleet].sort((a, b) => (a.ordenVisibilidad ?? 999) - (b.ordenVisibilidad ?? 999)) : [];
  });

  useEffect(() => {
    if (fleet && (isOpen || embedded)) {
      setLocalFleet([...fleet].sort((a, b) => (a.ordenVisibilidad ?? 999) - (b.ordenVisibilidad ?? 999)));
    }
  }, [fleet, isOpen, embedded]);

  // Form states for Users
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [userFormData, setUserFormData] = useState<{
    username: string;
    password: string;
    nombre: string;
    email: string;
    rol: UserRole;
    telefono: string;
    activo: boolean;
  }>({
    username: '',
    password: '',
    nombre: '',
    email: '',
    rol: 'ADMINISTRADOR',
    telefono: '',
    activo: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  // Form states for Services
  const [isServiceFormOpen, setIsServiceFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<SoilService | null>(null);
  const [serviceFormData, setServiceFormData] = useState<Partial<SoilService>>({
    titulo: '',
    descripcion: '',
    categoria: 'Movimiento de Suelo',
    equiposUtilizados: [],
    incluyeOperador: true,
    unidadCotizacion: 'A presupuesto / Por jornada',
    foto: '',
    fotosGaleria: [],
    publicarEnWeb: true,
    ventajas: [],
  });
  const [newAdvantage, setNewAdvantage] = useState('');
  const [newEquipment, setNewEquipment] = useState('');

  // Notification / saved state & interactive button feedback
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const [toastInfo, setToastInfo] = useState<{
    message: string;
    submessage?: string;
    timestamp: string;
  } | null>(null);
  const [savedButtonId, setSavedButtonId] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [serviceFormError, setServiceFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const servicePhotoInputRef = useRef<HTMLInputElement>(null);
  const [settingsDeleteTarget, setSettingsDeleteTarget] = useState<{
    title: string;
    itemName: string;
    onConfirm: () => void;
  } | null>(null);

  // Live Editor CMS States
  const [liveSearchQuery, setLiveSearchQuery] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<string>('all');
  const [splitViewMode, setSplitViewMode] = useState<boolean>(true);
  const [lastSavedField, setLastSavedField] = useState<string | null>(null);

  const handleLiveFieldChange = (field: keyof SiteSettings, value: any) => {
    setSettings(prev => {
      const updated = { ...prev, [field]: value };
      saveSiteSettings(updated);
      return updated;
    });
    setLastSavedField(field as string);
    const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLastSavedTime(timeStr);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2000);
  };

  const handleResetSingleBlock = (blockKey: string) => {
    if (!window.confirm(`¿Desea restablecer este bloque a sus textos predeterminados?`)) return;
    
    let updated = { ...settings };
    if (blockKey === 'hero') {
      updated.heroBadge = DEFAULT_SITE_SETTINGS.heroBadge;
      updated.heroTitle = DEFAULT_SITE_SETTINGS.heroTitle;
      updated.heroSubtitle = DEFAULT_SITE_SETTINGS.heroSubtitle;
      updated.heroCtaPrimary = DEFAULT_SITE_SETTINGS.heroCtaPrimary;
      updated.heroCtaSecondary = DEFAULT_SITE_SETTINGS.heroCtaSecondary;
    } else if (blockKey === 'flota') {
      updated.flotaTitle = DEFAULT_SITE_SETTINGS.flotaTitle;
      updated.flotaSubtitle = DEFAULT_SITE_SETTINGS.flotaSubtitle;
    } else if (blockKey === 'herramientas') {
      updated.herramientasTitle = DEFAULT_SITE_SETTINGS.herramientasTitle;
      updated.herramientasSubtitle = DEFAULT_SITE_SETTINGS.herramientasSubtitle;
    } else if (blockKey === 'eventos') {
      updated.eventosTitle = DEFAULT_SITE_SETTINGS.eventosTitle;
      updated.eventosSubtitle = DEFAULT_SITE_SETTINGS.eventosSubtitle;
    } else if (blockKey === 'servicios') {
      updated.serviciosTitle = DEFAULT_SITE_SETTINGS.serviciosTitle;
      updated.serviciosSubtitle = DEFAULT_SITE_SETTINGS.serviciosSubtitle;
    } else if (blockKey === 'aridos') {
      updated.aridosTitle = DEFAULT_SITE_SETTINGS.aridosTitle;
      updated.aridosSubtitle = DEFAULT_SITE_SETTINGS.aridosSubtitle;
    } else if (blockKey === 'ferreteria') {
      updated.ferreteriaTitle = DEFAULT_SITE_SETTINGS.ferreteriaTitle;
      updated.ferreteriaSubtitle = DEFAULT_SITE_SETTINGS.ferreteriaSubtitle;
    } else if (blockKey === 'nosotros') {
      updated.nosotrosTitle = DEFAULT_SITE_SETTINGS.nosotrosTitle;
      updated.nosotrosSubtitle = DEFAULT_SITE_SETTINGS.nosotrosSubtitle;
      updated.nosotrosTexto1 = DEFAULT_SITE_SETTINGS.nosotrosTexto1;
      updated.nosotrosTexto2 = DEFAULT_SITE_SETTINGS.nosotrosTexto2;
      updated.nosotrosFotoUrl = DEFAULT_SITE_SETTINGS.nosotrosFotoUrl;
    } else if (blockKey === 'cta') {
      updated.ctaBannerTitle = DEFAULT_SITE_SETTINGS.ctaBannerTitle;
      updated.ctaBannerSubtitle = DEFAULT_SITE_SETTINGS.ctaBannerSubtitle;
      updated.ctaBannerBoton = DEFAULT_SITE_SETTINGS.ctaBannerBoton;
    } else if (blockKey === 'contacto') {
      updated.direccion = DEFAULT_SITE_SETTINGS.direccion;
      updated.telefonoPrincipal = DEFAULT_SITE_SETTINGS.telefonoPrincipal;
      updated.telefonoGuardia = DEFAULT_SITE_SETTINGS.telefonoGuardia;
      updated.whatsapp = DEFAULT_SITE_SETTINGS.whatsapp;
      updated.horarioSemana = DEFAULT_SITE_SETTINGS.horarioSemana;
      updated.horarioSabados = DEFAULT_SITE_SETTINGS.horarioSabados;
      updated.horarioDomingos = DEFAULT_SITE_SETTINGS.horarioDomingos;
    } else if (blockKey === 'footer') {
      updated.footerText = DEFAULT_SITE_SETTINGS.footerText;
    }

    setSettings(updated);
    saveSiteSettings(updated);
    triggerSuccess('Bloque restaurado a los valores predeterminados');
  };

  const triggerUploadError = (msg: string) => {
    setSaveSuccess(false);
    setUploadErrorMsg(msg);
  };

  const triggerSuccess = (msg: string = 'Cambios guardados con éxito', submsg?: string, buttonId?: string) => {
    const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setUploadErrorMsg(null);
    setLastSavedTime(timeStr);
    setToastInfo({
      message: msg,
      submessage: submsg || 'Los cambios se han guardado y sincronizado en todo el sistema.',
      timestamp: timeStr,
    });
    setSaveSuccess(true);

    if (buttonId) {
      setSavedButtonId(buttonId);
      setTimeout(() => {
        setSavedButtonId(prev => (prev === buttonId ? null : prev));
      }, 2500);
    }

    setTimeout(() => {
      setToastInfo(prev => (prev?.timestamp === timeStr ? null : prev));
      setSaveSuccess(false);
    }, 4500);
  };

  const [activeLogoSlot, setActiveLogoSlot] = useState<'dark' | 'light' | 'icon'>('dark');
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  // Strictly upload base64/blob image to Cloudflare R2 (NEVER returns base64 on failure)
  const uploadAnyBase64ToR2 = async (urlOrBase64: string, defaultFileName: string, isLogo = false): Promise<string> => {
    if (!urlOrBase64) return '';
    if (
      urlOrBase64.startsWith('http://') ||
      urlOrBase64.startsWith('https://') ||
      urlOrBase64.startsWith('/') ||
      urlOrBase64.startsWith('assets/')
    ) {
      return urlOrBase64;
    }

    const res = await uploadImageToCloudflareR2(
      urlOrBase64,
      defaultFileName,
      isLogo ? 'image/png' : 'image/webp',
      {
        maxWidth: isLogo ? 1200 : 1920,
        maxHeight: isLogo ? 1200 : 1080,
        quality: isLogo ? 0.9 : 0.85,
        format: isLogo ? 'image/png' : 'image/webp',
      }
    );
    if (res.success && res.url) {
      return res.url;
    }
    throw new Error(res.error || `No se pudo subir "${defaultFileName}" a Cloudflare R2.`);
  };

  const handleSpecificLogoChange = async (
    slot: 'customLogoUrlDark' | 'customLogoUrlLight' | 'customLogoUrlIcon',
    base64OrUrl: string,
    file?: File
  ) => {
    setUploadErrorMsg(null);

    if (!file && !base64OrUrl.startsWith('data:') && !base64OrUrl.startsWith('blob:')) {
      const updated = {
        ...settings,
        [slot]: base64OrUrl,
        customLogoUrl: settings.customLogoUrl || base64OrUrl,
      };
      setSettings(updated);
      saveSiteSettings(updated);
      triggerSuccess('Logo actualizado con éxito para esta variante');
      return;
    }

    setUploadingSlot(slot);
    try {
      const input = file || base64OrUrl;
      const fileName = file?.name || `logo_${slot}_${Date.now()}.png`;
      const isPngOrSvg =
        file?.type === 'image/png' ||
        file?.type === 'image/svg+xml' ||
        fileName.toLowerCase().endsWith('.png') ||
        fileName.toLowerCase().endsWith('.svg') ||
        base64OrUrl.startsWith('data:image/png');
      const res = await uploadImageToCloudflareR2(
        input,
        fileName,
        isPngOrSvg ? 'image/png' : 'image/webp',
        {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.9,
          format: isPngOrSvg ? 'image/png' : 'image/webp',
        }
      );
      if (res.success && res.url) {
        setSettings(prev => {
          const cloudUpdated = {
            ...prev,
            [slot]: res.url!,
            customLogoUrl: res.url!,
          };
          saveSiteSettings(cloudUpdated);
          return cloudUpdated;
        });
        triggerSuccess('Logo subido a Cloudflare R2 con éxito', 'Alojado globalmente en CDN para todos los usuarios');
      } else {
        triggerUploadError(res.error || 'No se pudo subir el logo a Cloudflare R2. No se guardó en la base de datos.');
      }
    } catch (err: any) {
      triggerUploadError(err?.message || 'No se pudo subir el logo a Cloudflare R2. Verificá tu conexión.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleRemoveSpecificLogo = (slot: 'customLogoUrlDark' | 'customLogoUrlLight' | 'customLogoUrlIcon') => {
    const updated = {
      ...settings,
      [slot]: '',
    };
    if (settings.customLogoUrl === settings[slot]) {
      updated.customLogoUrl = updated.customLogoUrlDark || updated.customLogoUrlLight || updated.customLogoUrlIcon || '';
    }
    setSettings(updated);
    saveSiteSettings(updated);
    triggerSuccess('Logo de la variante removido');
  };

  const handleLogoImageChange = (base64OrUrl: string, file?: File) => {
    if (activeLogoSlot === 'dark') {
      handleSpecificLogoChange('customLogoUrlDark', base64OrUrl, file);
    } else if (activeLogoSlot === 'light') {
      handleSpecificLogoChange('customLogoUrlLight', base64OrUrl, file);
    } else {
      handleSpecificLogoChange('customLogoUrlIcon', base64OrUrl, file);
    }
  };

  const handleHeroBannerChange = async (url: string, file?: File) => {
    setUploadErrorMsg(null);

    if (!file && !url.startsWith('data:') && !url.startsWith('blob:')) {
      const updated = { ...settings, heroBannerUrl: url };
      setSettings(updated);
      saveSiteSettings(updated);
      triggerSuccess('Banner de cabecera actualizado');
      return;
    }

    setUploadingSlot('hero_banner');
    try {
      const input = file || url;
      const res = await uploadImageToCloudflareR2(input, file?.name || `banner_${Date.now()}.webp`, file?.type || 'image/webp', {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.85,
        format: 'image/webp',
      });
      if (res.success && res.url) {
        setSettings(prev => {
          const cloudUpdated = { ...prev, heroBannerUrl: res.url! };
          saveSiteSettings(cloudUpdated);
          return cloudUpdated;
        });
        triggerSuccess('Banner subido a Cloudflare R2 con éxito', 'Alojado globalmente en CDN para todos los usuarios');
      } else {
        triggerUploadError(res.error || 'No se pudo subir el banner a Cloudflare R2. No se guardó en la base de datos.');
      }
    } catch (err: any) {
      triggerUploadError(err?.message || 'No se pudo subir el banner a Cloudflare R2. Verificá tu conexión.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleNosotrosPhotoChange = async (url: string, file?: File) => {
    setUploadErrorMsg(null);

    if (!file && !url.startsWith('data:') && !url.startsWith('blob:')) {
      handleLiveFieldChange('nosotrosFotoUrl', url);
      triggerSuccess('Foto institucional de Sobre Nosotros actualizada');
      return;
    }

    setUploadingSlot('nosotros_foto');
    try {
      const input = file || url;
      const res = await uploadImageToCloudflareR2(input, file?.name || `nosotros_${Date.now()}.webp`, file?.type || 'image/webp', {
        maxWidth: 1600,
        maxHeight: 1200,
        quality: 0.85,
        format: 'image/webp',
      });
      if (res.success && res.url) {
        handleLiveFieldChange('nosotrosFotoUrl', res.url);
        triggerSuccess('Foto institucional subida a Cloudflare R2 con éxito', 'Alojada globalmente en CDN para todos los usuarios');
      } else {
        triggerUploadError(res.error || 'No se pudo subir la foto institucional a Cloudflare R2. No se guardó en la base de datos.');
      }
    } catch (err: any) {
      triggerUploadError(err?.message || 'No se pudo subir la foto institucional a Cloudflare R2. Verificá tu conexión.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleServiceCoverPhotoChange = async (newPhoto: string, file?: File) => {
    setUploadErrorMsg(null);
    setServiceFormError(null);

    if (!file && !newPhoto.startsWith('data:') && !newPhoto.startsWith('blob:')) {
      setServiceFormData(prev => ({ ...prev, foto: newPhoto }));
      return;
    }

    setUploadingSlot('service_cover');
    try {
      const input = file || newPhoto;
      const res = await uploadImageToCloudflareR2(input, file?.name || `servicio_${Date.now()}.webp`, file?.type || 'image/webp', {
        maxWidth: 1600,
        maxHeight: 1200,
        quality: 0.85,
        format: 'image/webp',
      });
      if (res.success && res.url) {
        setServiceFormData(prev => ({ ...prev, foto: res.url! }));
        triggerSuccess('Foto del servicio subida a Cloudflare R2 con éxito', 'Alojada globalmente en CDN para el catálogo');
      } else {
        const msg = res.error || 'No se pudo subir la foto del servicio a Cloudflare R2. No se guardó en la base de datos.';
        setServiceFormError(msg);
        triggerUploadError(msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'No se pudo subir la foto del servicio a Cloudflare R2. Verificá tu conexión.';
      setServiceFormError(msg);
      triggerUploadError(msg);
    } finally {
      setUploadingSlot(null);
    }
  };

  // Global clipboard image paste listener for SiteSettingsModal (Ctrl+V)
  useClipboardImagePaste({
    enabled: isOpen || embedded,
    onImagePasted: (base64OrUrl, file) => {
      if (isServiceFormOpen) {
        handleServiceCoverPhotoChange(base64OrUrl, file);
      } else if (activeTab === 'logo') {
        if (activeLogoSlot === 'dark') {
          handleSpecificLogoChange('customLogoUrlDark', base64OrUrl, file);
        } else if (activeLogoSlot === 'light') {
          handleSpecificLogoChange('customLogoUrlLight', base64OrUrl, file);
        } else {
          handleSpecificLogoChange('customLogoUrlIcon', base64OrUrl, file);
        }
      }
    },
  });

  useEffect(() => {
    if (isOpen || embedded) {
      setSettings(loadSiteSettings());
      setUsers(loadSystemUsers());
      setServices(loadSoilServices());
      setActiveTab(propActiveTab || initialTab);

      // Sincronizar desde la nube (Supabase) para asegurar que se vean cambios hechos en cualquier computadora
      syncSiteSettingsFromCloud().then(cloudSettings => {
        if (cloudSettings) setSettings(cloudSettings);
      });
      syncSoilServicesFromCloud().then(cloudServices => {
        if (cloudServices && cloudServices.length > 0) setServices(cloudServices);
      });
      syncSystemUsersFromCloud().then(cloudUsers => {
        if (cloudUsers && cloudUsers.length > 0) setUsers(cloudUsers);
      });
    }
  }, [isOpen, embedded, propActiveTab, initialTab]);

  if (!isOpen && !embedded) return null;

  // Handle Logo Upload strictly via Cloudflare R2
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>, slot: 'customLogoUrlDark' | 'customLogoUrlLight' | 'customLogoUrlIcon' = 'customLogoUrlDark') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      triggerUploadError('Por favor seleccioná un archivo de imagen válido (PNG, JPG, SVG o WebP).');
      return;
    }

    await handleSpecificLogoChange(slot, '', file);
  };

  const handleRemoveCustomLogo = () => {
    const updated = { 
      ...settings, 
      customLogoUrl: '',
      customLogoUrlDark: '',
      customLogoUrlLight: '',
      customLogoUrlIcon: '',
    };
    setSettings(updated);
    saveSiteSettings(updated);
    triggerSuccess('Se restauraron todos los logos vectoriales oficiales');
  };

  // General Settings Save (Saves and syncs across Cloudflare R2 and Supabase)
  const handleSaveGeneralSettings = async (buttonId: string = 'footer', customMessage?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      // Auto-migrate any base64 image strings to Cloudflare R2 before persisting
      const sanitized = { ...settings };
      if (sanitized.customLogoUrlDark?.startsWith('data:image/')) {
        sanitized.customLogoUrlDark = await uploadAnyBase64ToR2(sanitized.customLogoUrlDark, 'logo_dark.png', true);
      }
      if (sanitized.customLogoUrlLight?.startsWith('data:image/')) {
        sanitized.customLogoUrlLight = await uploadAnyBase64ToR2(sanitized.customLogoUrlLight, 'logo_light.png', true);
      }
      if (sanitized.customLogoUrlIcon?.startsWith('data:image/')) {
        sanitized.customLogoUrlIcon = await uploadAnyBase64ToR2(sanitized.customLogoUrlIcon, 'logo_icon.png', true);
      }
      if (sanitized.heroBannerUrl?.startsWith('data:image/')) {
        sanitized.heroBannerUrl = await uploadAnyBase64ToR2(sanitized.heroBannerUrl, 'hero_banner.webp', false);
      }
      if (sanitized.nosotrosFotoUrl?.startsWith('data:image/')) {
        sanitized.nosotrosFotoUrl = await uploadAnyBase64ToR2(sanitized.nosotrosFotoUrl, 'nosotros.webp', false);
      }
      setSettings(sanitized);

      saveSiteSettings(sanitized);
      saveSoilServices(services);
      const msg = customMessage || 'Configuración y fotos guardadas globalmente';
      triggerSuccess(msg, 'Sincronizado con Cloudflare R2 y Supabase para todos los usuarios.', buttonId);
    } catch (err: any) {
      console.error('Error al guardar configuración general:', err);
      triggerUploadError(err?.message || 'No se pudo subir alguna imagen a Cloudflare R2. No se guardaron imágenes en base64 en Supabase.');
    }
  };

  // ==================== USERS CRUD ====================
  const handleOpenCreateUser = () => {
    setEditingUser(null);
    setUserFormData({
      username: '',
      password: '',
      nombre: '',
      email: '',
      rol: 'ADMINISTRADOR',
      telefono: '',
      activo: true,
    });
    setUserError(null);
    setIsUserFormOpen(true);
  };

  const handleOpenEditUser = (u: SystemUser) => {
    setEditingUser(u);
    setUserFormData({
      username: u.username,
      password: u.password,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      telefono: u.telefono || '',
      activo: u.activo,
    });
    setUserError(null);
    setIsUserFormOpen(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(null);

    const cleanUsername = userFormData.username.trim();
    if (!cleanUsername) {
      setUserError('El nombre de usuario es obligatorio.');
      return;
    }

    if (!userFormData.password.trim()) {
      setUserError('La contraseña no puede estar vacía.');
      return;
    }

    // Check username uniqueness
    const exists = users.find(u => 
      u.username.toLowerCase() === cleanUsername.toLowerCase() && 
      u.id !== editingUser?.id
    );
    if (exists) {
      setUserError('Ya existe un usuario con ese nombre de acceso.');
      return;
    }

    let updatedUsers: SystemUser[];
    if (editingUser) {
      updatedUsers = users.map(u => {
        if (u.id === editingUser.id) {
          return {
            ...u,
            username: cleanUsername,
            password: userFormData.password,
            nombre: userFormData.nombre.trim() || cleanUsername,
            email: userFormData.email.trim() || `${cleanUsername}@lahormiga.com`,
            rol: userFormData.rol,
            telefono: userFormData.telefono.trim(),
            activo: userFormData.activo,
          };
        }
        return u;
      });
    } else {
      const newUser: SystemUser = {
        id: `USR-${Date.now()}`,
        username: cleanUsername,
        password: userFormData.password,
        nombre: userFormData.nombre.trim() || cleanUsername,
        email: userFormData.email.trim() || `${cleanUsername}@lahormiga.com`,
        rol: userFormData.rol,
        telefono: userFormData.telefono.trim(),
        activo: userFormData.activo,
        createdAt: new Date().toISOString(),
      };
      updatedUsers = [...users, newUser];
    }

    setUsers(updatedUsers);
    saveSystemUsers(updatedUsers);
    setIsUserFormOpen(false);
    triggerSuccess('Usuario guardado correctamente');
  };

  const handleToggleUserActive = (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (target?.username === 'ideasinfernal') {
      triggerUploadError('No se puede desactivar al Super Administrador principal.');
      return;
    }

    const updated = users.map(u => {
      if (u.id === userId) {
        return { ...u, activo: !u.activo };
      }
      return u;
    });
    setUsers(updated);
    saveSystemUsers(updated);
  };

  const handleDeleteUser = (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (target?.username === 'ideasinfernal') {
      triggerSuccess('Operación restringida', 'No es posible eliminar la cuenta del Super Administrador.');
      return;
    }

    setSettingsDeleteTarget({
      title: '¿Realmente desea eliminar este usuario del sistema?',
      itemName: `Usuario: ${target?.nombre || target?.username || userId}`,
      onConfirm: () => {
        const updated = users.filter(u => u.id !== userId);
        setUsers(updated);
        saveSystemUsers(updated);
        triggerSuccess('Usuario eliminado de la base de datos');
      }
    });
  };

  // ==================== SECTION REORDERING ====================
  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= settings.secciones.length) return;

    const reordered = [...settings.secciones];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    // Re-index orden values
    const finalSections = reordered.map((sec, idx) => ({ ...sec, orden: idx + 1 }));
    const updated = { ...settings, secciones: finalSections };
    setSettings(updated);
    saveSiteSettings(updated);
    triggerSuccess('Orden de secciones actualizado');
  };

  const handleToggleSectionVisibility = (sectionId: string) => {
    const updatedSections = settings.secciones.map(sec => {
      if (sec.id === sectionId) {
        return { ...sec, visible: !sec.visible };
      }
      return sec;
    });
    const updated = { ...settings, secciones: updatedSections };
    setSettings(updated);
    saveSiteSettings(updated);
  };

  // ==================== VEHICLE ORDER & VISIBILITY MANAGEMENT ====================
  const handleMoveVehicle = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= localFleet.length) return;

    const reordered = [...localFleet];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const finalFleet = reordered.map((v, idx) => ({ ...v, ordenVisibilidad: idx + 1 }));
    setLocalFleet(finalFleet);
    if (onSaveFleet) {
      onSaveFleet(finalFleet);
    }
    triggerSuccess(`Equipo movido a posición #${targetIndex + 1}`);
  };

  const handleToggleVehicleWeb = (vehicleId: string) => {
    const updated = localFleet.map(v => 
      v.id === vehicleId ? { ...v, publicarEnWeb: v.publicarEnWeb === false ? true : false } : v
    );
    setLocalFleet(updated);
    if (onSaveFleet) {
      onSaveFleet(updated);
    }
    triggerSuccess('Visibilidad del equipo actualizada');
  };

  const handleSetVehicleOrderNumber = (vehicleId: string, newOrder: number) => {
    const safeOrder = Math.max(1, newOrder);
    const updated = localFleet.map(v => 
      v.id === vehicleId ? { ...v, ordenVisibilidad: safeOrder } : v
    );
    updated.sort((a, b) => (a.ordenVisibilidad ?? 999) - (b.ordenVisibilidad ?? 999));
    const finalFleet = updated.map((v, idx) => ({ ...v, ordenVisibilidad: idx + 1 }));
    setLocalFleet(finalFleet);
    if (onSaveFleet) {
      onSaveFleet(finalFleet);
    }
    triggerSuccess('Orden de equipos actualizado');
  };

  const handleSaveVehicleOrder = () => {
    if (onSaveFleet) {
      onSaveFleet(localFleet);
    }
    setSavedButtonId('equipos');
    triggerSuccess('¡Orden de equipos en la página web guardado con éxito!');
    setTimeout(() => {
      setSavedButtonId(null);
    }, 2500);
  };

  // ==================== SERVICES CRUD ====================
  const handleOpenCreateService = () => {
    setEditingService(null);
    setServiceFormError(null);
    setServiceFormData({
      titulo: '',
      descripcion: '',
      categoria: 'Movimiento de Suelo',
      equiposUtilizados: ['Minicargadora Bobcat', 'Retroexcavadora'],
      incluyeOperador: true,
      unidadCotizacion: 'A presupuesto / Por jornada',
      foto: 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&q=80&w=800',
      fotosGaleria: [],
      publicarEnWeb: true,
      ventajas: ['Operador profesional', 'Nivelación precisa láser'],
    });
    setIsServiceFormOpen(true);
  };

  const handleOpenEditService = (srv: SoilService) => {
    setEditingService(srv);
    setServiceFormError(null);
    setServiceFormData({
      ...srv,
      fotosGaleria: srv.fotosGaleria || [],
      ventajas: srv.ventajas || [],
      equiposUtilizados: srv.equiposUtilizados || [],
    });
    setIsServiceFormOpen(true);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceFormData.titulo?.trim()) {
      setServiceFormError('El título comercial del servicio es requerido para guardar.');
      return;
    }
    setServiceFormError(null);

    // Strictly migrate any residual base64 photo to Cloudflare R2 (never save base64 to Supabase)
    let finalFoto = serviceFormData.foto || 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&q=80&w=800';
    let finalGaleria = serviceFormData.fotosGaleria || [];
    try {
      if (finalFoto.startsWith('data:') || finalFoto.startsWith('blob:')) {
        finalFoto = await uploadAnyBase64ToR2(finalFoto, `servicio_${Date.now()}.webp`, false);
      }

      finalGaleria = await Promise.all(
        (serviceFormData.fotosGaleria || []).map((img, idx) =>
          img.startsWith('data:') || img.startsWith('blob:')
            ? uploadAnyBase64ToR2(img, `servicio_gal_${idx}_${Date.now()}.webp`, false)
            : Promise.resolve(img)
        )
      );
    } catch (err: any) {
      const msg = err?.message || 'No se pudo subir la imagen a Cloudflare R2. No se guardó el servicio.';
      setServiceFormError(msg);
      triggerUploadError(msg);
      return;
    }

    let updatedList: SoilService[];
    if (editingService) {
      updatedList = services.map(s => {
        if (s.id === editingService.id) {
          return {
            ...s,
            ...serviceFormData,
            titulo: serviceFormData.titulo!,
            descripcion: serviceFormData.descripcion || '',
            foto: finalFoto,
            fotosGaleria: finalGaleria,
            publicarEnWeb: serviceFormData.publicarEnWeb ?? true,
            ventajas: serviceFormData.ventajas || [],
            equiposUtilizados: serviceFormData.equiposUtilizados || [],
          } as SoilService;
        }
        return s;
      });
    } else {
      const newSrv: SoilService = {
        id: `SRV-${Date.now()}`,
        titulo: serviceFormData.titulo!,
        descripcion: serviceFormData.descripcion || '',
        categoria: serviceFormData.categoria || 'Movimiento de Suelo',
        equiposUtilizados: serviceFormData.equiposUtilizados || [],
        incluyeOperador: serviceFormData.incluyeOperador ?? true,
        unidadCotizacion: serviceFormData.unidadCotizacion || 'A presupuesto',
        foto: finalFoto,
        fotosGaleria: finalGaleria,
        publicarEnWeb: serviceFormData.publicarEnWeb ?? true,
        ventajas: serviceFormData.ventajas || [],
      };
      updatedList = [...services, newSrv];
    }

    setServices(updatedList);
    saveSoilServices(updatedList);
    setIsServiceFormOpen(false);
    triggerSuccess(`Servicio "${serviceFormData.titulo}" guardado con éxito`, 'Actualizado y sincronizado en el catálogo web.', 'service-form');
  };

  const handleDeleteService = (srvId: string) => {
    const target = services.find(s => s.id === srvId);
    setSettingsDeleteTarget({
      title: '¿Realmente desea eliminar este servicio comercial?',
      itemName: `Servicio: ${target?.titulo || srvId}`,
      onConfirm: () => {
        const updated = services.filter(s => s.id !== srvId);
        setServices(updated);
        saveSoilServices(updated);
        triggerSuccess('Servicio eliminado de la base de datos');
      }
    });
  };

  const handleServicePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleServiceCoverPhotoChange('', file);
  };

  const modalCard = (
      <div 
        id="site-settings-modal"
        className={
          embedded
            ? 'relative w-full bg-[#16191F] text-slate-100 rounded-2xl shadow-xl border border-slate-800 flex flex-col overflow-hidden'
            : 'relative w-full max-w-5xl bg-[#16191F] text-slate-100 rounded-2xl shadow-2xl border border-slate-800 flex flex-col max-h-[92vh] overflow-hidden my-auto'
        }
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#111317] border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#F0C800] text-[#2D2D2D] flex items-center justify-center font-black shadow-md">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2 font-display">
                  Centro de Configuración & Sitio Web
                  <span className="text-[10px] bg-[#F0C800]/10 text-[#F0C800] px-2 py-0.5 rounded-full border border-[#F0C800]/30 font-sans font-bold">
                    ERP La Hormiga
                  </span>
                </h2>
                <div className="hidden sm:flex items-center space-x-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full text-[10px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Cloudflare R2 & Sync Global</span>
                </div>
                {uploadingSlot && (
                  <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-full text-[10px] font-semibold animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Subiendo a Cloudflare R2...</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Administre el logo institucional, usuarios, horarios, teléfonos, servicios y fotos sincronizadas en la nube
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onNavigateToPublicWeb && (
              <button
                type="button"
                onClick={() => {
                  if (!embedded) onClose();
                  onNavigateToPublicWeb();
                }}
                className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#F0C800] hover:bg-[#F0C800]/10 border border-[#F0C800]/30 transition cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Ver Web en Vivo</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            {!embedded && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        {!hideTabsBar && (
        <div className="bg-[#191D24] px-4 border-b border-slate-800 flex items-center space-x-1 overflow-x-auto no-scrollbar shrink-0">
          {[
            { id: 'logo', label: 'Logo & Marca', icon: ImageIcon },
            { id: 'usuarios', label: 'Gestión de Usuarios', icon: Users, count: users.length },
            { id: 'contacto', label: 'Teléfonos & Horarios', icon: Phone },
            { id: 'textos', label: 'Editor de Textos (CMS)', icon: FileText },
            { id: 'servicios', label: 'Gestor de Servicios & Fotos', icon: Layers, count: services.length },
            { id: 'secciones', label: 'Orden de Secciones', icon: ArrowUp },
            { id: 'equipos', label: 'Orden de Equipos en Web', icon: Truck, count: localFleet.length },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-3.5 text-xs font-bold whitespace-nowrap flex items-center space-x-2 border-b-2 transition cursor-pointer ${
                  isActive
                    ? 'border-[#F0C800] text-[#F0C800] bg-slate-800/40'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive ? 'bg-[#F0C800] text-[#2D2D2D]' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        )}

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* Alert Error Banner (Cloudflare R2 Upload Failure) */}
          {uploadErrorMsg && (
            <div className="p-3.5 bg-rose-500/15 border border-rose-500/40 text-rose-200 rounded-xl text-xs flex items-start justify-between gap-3 animate-fade-in font-medium shadow-md">
              <div className="flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <p className="font-bold text-rose-300">No se pudo subir el archivo a Cloudflare R2</p>
                  <p className="text-[11px] text-rose-200/90 mt-0.5">{uploadErrorMsg}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadErrorMsg(null)}
                className="text-rose-300 hover:text-white p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Alert Success Banner */}
          {saveSuccess && (
            <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center justify-between gap-3 animate-fade-in font-medium shadow-md">
              <div className="flex items-center space-x-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  <strong>¡Confirmado!</strong> {toastInfo?.message || 'Cambios guardados correctamente en todo el sistema.'}
                </span>
              </div>
              {lastSavedTime && (
                <span className="text-[10px] text-emerald-400/80 font-mono bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  {lastSavedTime}
                </span>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 1: LOGO & IDENTIDAD DE MARCA                                         */}
          {/* ========================================================================= */}
          {activeTab === 'logo' && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="bg-[#1A1E26] border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Palette className="w-4 h-4 text-[#F0C800]" />
                      Identidad Visual & Logos de La Hormiga
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Cargue una foto o imagen diferente para cada versión de uso (Modo Oscuro, Modo Claro e Isotipo). Cada versión es <strong>100% imagen pura</strong> sin textos añadidos para evitar duplicidad.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleSaveGeneralSettings('logos-top', 'Identidad visual y logos guardados con éxito')}
                      className={`px-4 py-2 font-black rounded-xl text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                        savedButtonId === 'logos-top'
                          ? 'bg-emerald-500 text-slate-950 scale-105 shadow-emerald-500/40 ring-2 ring-emerald-300'
                          : 'bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D]'
                      }`}
                    >
                      {savedButtonId === 'logos-top' ? (
                        <>
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>¡Logos Guardados!</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Guardar Identidad Visual & Logos</span>
                        </>
                      )}
                    </button>

                    {(settings.customLogoUrlDark || settings.customLogoUrlLight || settings.customLogoUrlIcon || settings.customLogoUrl) && (
                      <button
                        type="button"
                        onClick={handleRemoveCustomLogo}
                        className="px-3 py-2 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/50 text-slate-300 hover:text-rose-300 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restaurar Mascota Oficial</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Opción para incluir texto tipográfico si el usuario lo desea */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(settings.logoIncludeText)}
                      onChange={(e) => {
                        const updated = { ...settings, logoIncludeText: e.target.checked };
                        setSettings(updated);
                        saveSiteSettings(updated);
                        triggerSuccess(e.target.checked ? 'Texto HTML activado junto al logo' : 'Modo solo imagen pura activado');
                      }}
                      className="rounded border-slate-700 text-[#F0C800] focus:ring-[#F0C800] bg-slate-900 w-4 h-4"
                    />
                    <span>Adjuntar texto tipográfico HTML (<strong className="text-slate-200">{settings.companyName}</strong>) al lado de las imágenes</span>
                  </label>
                  <span className="text-[11px] text-slate-500">
                    (Recomendado: Desactivado si la imagen ya incluye las letras)
                  </span>
                </div>
              </div>

              {/* 3 VARIANTES INDEPENDIENTES DE LOGO */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                
                {/* 1. MODO OSCURO (ERP, Navbar, Headers) */}
                <div 
                  onClick={() => setActiveLogoSlot('dark')}
                  className={`bg-[#1A1E26] border rounded-2xl p-4 flex flex-col justify-between space-y-4 transition ${
                    activeLogoSlot === 'dark' ? 'border-[#F0C800] ring-1 ring-[#F0C800]/50' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
                        <Moon className="w-3.5 h-3.5" />
                        1. Versión Modo Oscuro
                      </span>
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700 font-mono">
                        ERP & Navbar
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Imagen para fondos negros y grises oscuros (letras blancas/amarillas).
                    </p>

                    <ImageClipboardDropzone
                      currentImageUrl={settings.customLogoUrlDark || (activeLogoSlot === 'dark' ? settings.customLogoUrl : '')}
                      onImageChange={(url, file) => handleSpecificLogoChange('customLogoUrlDark', url, file)}
                      onImageRemove={() => handleRemoveSpecificLogo('customLogoUrlDark')}
                      label="Foto Logo Modo Oscuro"
                      sublabel="Arrastrá, hacé clic o pegá con Ctrl+V"
                      aspectRatio="auto"
                      placeholderText="Pegar con Ctrl+V o subir imagen oscura"
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono uppercase">
                      <span>Vista previa en fondo oscuro:</span>
                    </div>
                    <div className="p-3 bg-[#111317] rounded-xl border border-slate-800 w-full flex items-center justify-center min-h-[80px]">
                      <Logo 
                        variant="compact" 
                        size="md" 
                        theme="dark" 
                        customLogoSrc={settings.customLogoUrlDark || settings.customLogoUrl} 
                      />
                    </div>
                  </div>
                </div>

                {/* 2. MODO CLARO (Impresiones, Facturas, Reportes) */}
                <div 
                  onClick={() => setActiveLogoSlot('light')}
                  className={`bg-[#1A1E26] border rounded-2xl p-4 flex flex-col justify-between space-y-4 transition ${
                    activeLogoSlot === 'light' ? 'border-[#F0C800] ring-1 ring-[#F0C800]/50' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400">
                        <Sun className="w-3.5 h-3.5" />
                        2. Versión Modo Claro
                      </span>
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700 font-mono">
                        Impresión & PDF
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Imagen para fondos blancos y documentos impresos (letras negras).
                    </p>

                    <ImageClipboardDropzone
                      currentImageUrl={settings.customLogoUrlLight || (activeLogoSlot === 'light' ? settings.customLogoUrl : '')}
                      onImageChange={(url, file) => handleSpecificLogoChange('customLogoUrlLight', url, file)}
                      onImageRemove={() => handleRemoveSpecificLogo('customLogoUrlLight')}
                      label="Foto Logo Modo Claro"
                      sublabel="Arrastrá, hacé clic o pegá con Ctrl+V"
                      aspectRatio="auto"
                      placeholderText="Pegar con Ctrl+V o subir imagen clara"
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono uppercase">
                      <span>Vista previa en fondo blanco:</span>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-300 w-full flex items-center justify-center min-h-[80px]">
                      <Logo 
                        variant="compact" 
                        size="md" 
                        theme="light" 
                        customLogoSrc={settings.customLogoUrlLight || settings.customLogoUrl} 
                      />
                    </div>
                  </div>
                </div>

                {/* 3. ISOTIPO / CUADRADO / MASCOTA (Avatar, Ícono, App Móvil) */}
                <div 
                  onClick={() => setActiveLogoSlot('icon')}
                  className={`bg-[#1A1E26] border rounded-2xl p-4 flex flex-col justify-between space-y-4 transition ${
                    activeLogoSlot === 'icon' ? 'border-[#F0C800] ring-1 ring-[#F0C800]/50' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
                        <ImageIcon className="w-3.5 h-3.5" />
                        3. Isotipo / Mascota
                      </span>
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700 font-mono">
                        Ícono Cuadrado
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Imagen cuadrada, isotipo o ícono para avatares y app móvil.
                    </p>

                    <ImageClipboardDropzone
                      currentImageUrl={settings.customLogoUrlIcon || (activeLogoSlot === 'icon' ? settings.customLogoUrl : '')}
                      onImageChange={(url, file) => handleSpecificLogoChange('customLogoUrlIcon', url, file)}
                      onImageRemove={() => handleRemoveSpecificLogo('customLogoUrlIcon')}
                      label="Foto Isotipo / Ícono"
                      sublabel="Arrastrá, hacé clic o pegá con Ctrl+V"
                      aspectRatio="square"
                      placeholderText="Pegar isotipo con Ctrl+V"
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono uppercase">
                      <span>Vista previa Isotipo:</span>
                    </div>
                    <div className="p-3 bg-[#111317] rounded-xl border border-slate-800 w-full flex items-center justify-center min-h-[80px]">
                      <Logo 
                        variant="mascot" 
                        size="md" 
                        theme="dark" 
                        customLogoSrc={settings.customLogoUrlIcon || settings.customLogoUrlDark || settings.customLogoUrl} 
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Botón de Guardar Identidad Visual */}
              <div className="flex items-center justify-between p-4 bg-[#111317] border border-slate-800 rounded-2xl">
                <div className="flex items-center space-x-2 text-xs text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Las fotos seleccionadas se optimizan automáticamente y se aplican de inmediato.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveGeneralSettings('logos-variants', 'Variantes de logos guardadas correctamente')}
                  className={`px-5 py-2.5 font-black text-xs rounded-xl transition-all shadow-md flex items-center space-x-2 cursor-pointer ${
                    savedButtonId === 'logos-variants'
                      ? 'bg-emerald-500 text-slate-950 scale-105 shadow-emerald-500/40 ring-2 ring-emerald-300'
                      : 'bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D]'
                  }`}
                >
                  {savedButtonId === 'logos-variants' ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>¡Variantes Guardadas!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Guardar Variantes de Logos</span>
                    </>
                  )}
                </button>
              </div>

              {/* ========================================================================= */}
              {/* SECCIÓN: BANNER DE CABECERA (ANCHO COMPLETO & EDITABLE)                  */}
              {/* ========================================================================= */}
              <div className="bg-[#1A1E26] border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-[#F0C800]" />
                      Banner de Cabecera Web (Ancho Completo)
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Esta imagen cubre todo el ancho de la cabecera en el sitio web público. Podés subir una foto de tus máquinas, pegar una captura con <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px] text-amber-300">Ctrl+V</kbd> o elegir un preset profesional.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSaveGeneralSettings('banner', 'Banner superior de cabecera guardado con éxito')}
                    className={`px-4 py-2 font-black text-xs rounded-xl transition-all shadow-md flex items-center space-x-2 cursor-pointer self-start sm:self-auto ${
                      savedButtonId === 'banner'
                        ? 'bg-emerald-500 text-slate-950 scale-105 shadow-emerald-500/40 ring-2 ring-emerald-300'
                        : 'bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D]'
                    }`}
                  >
                    {savedButtonId === 'banner' ? (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>¡Banner Guardado!</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Guardar Banner</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  {/* Dropzone & Upload */}
                  <div className="lg:col-span-6 space-y-3">
                    <ImageClipboardDropzone
                      currentImageUrl={settings.heroBannerUrl || ''}
                      onImageChange={(url, file) => handleHeroBannerChange(url, file)}
                      onImageRemove={() => {
                        const updated = { ...settings, heroBannerUrl: '' };
                        setSettings(updated);
                        saveSiteSettings(updated);
                        triggerSuccess('Banner eliminado, usando fondo predeterminado');
                      }}
                      label="Subir o Pegar Foto de Banner"
                      sublabel="Recomendado: 1920x800 px o superior (JPG, WebP, PNG)"
                      aspectRatio="video"
                      placeholderText="Arrastrá tu foto de obra o pegá con Ctrl+V"
                    />

                    {/* Presets Rápidos */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        O elegí una imagen de catálogo predeterminada:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          {
                            title: 'Maquinaria Pesada',
                            url: 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=2000&q=80'
                          },
                          {
                            title: 'Excavadora en Obra',
                            url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=2000&q=80'
                          },
                          {
                            title: 'Movimiento de Suelo',
                            url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=2000&q=80'
                          },
                        ].map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              const updated = { ...settings, heroBannerUrl: preset.url };
                              setSettings(updated);
                              saveSiteSettings(updated);
                              triggerSuccess(`Preset "${preset.title}" aplicado`);
                            }}
                            className="p-2 bg-[#111317] hover:bg-slate-800 border border-slate-800 hover:border-[#F0C800]/50 rounded-xl text-left transition group cursor-pointer"
                          >
                            <div className="h-12 w-full rounded-lg overflow-hidden mb-1.5 bg-slate-900">
                              <img src={preset.url} alt={preset.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                            </div>
                            <span className="text-[10px] font-bold text-slate-300 group-hover:text-[#F0C800] block truncate">
                              {preset.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Live Mini Preview of the Full-Width Banner */}
                  <div className="lg:col-span-6 space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Vista previa en la Cabecera de la Web:
                    </span>
                    <div className="relative w-full h-56 rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 shadow-inner flex flex-col justify-end p-4">
                      {/* Fondo */}
                      <div 
                        className="absolute inset-0 bg-cover bg-center"
                        style={{
                          backgroundImage: `url('${settings.heroBannerUrl || 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=2000&q=80'}')`
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-[#111317]/80 via-[#111317]/50 to-[#111317]/25" />
                      <div className="relative z-10 space-y-2">
                        <span className="px-2 py-0.5 bg-[#F0C800]/20 border border-[#F0C800]/50 rounded-full text-[9px] font-black text-[#F0C800]">
                          CABECERA PRINCIPAL
                        </span>
                        <h4 className="text-sm font-black text-white leading-tight">
                          {settings.heroTitle || 'Alquiler de Maquinarias y Equipos'}
                        </h4>
                        <p className="text-[10px] text-slate-300 line-clamp-2">
                          {settings.heroSubtitle || 'Soluciones integrales de construcción para pequeñas y grandes obras.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Nombres y Textos Institucionales */}
              <div className="bg-[#1A1E26] border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#F0C800]" />
                  Datos de Nombre y Slogan Institucional
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nombre de la Empresa / Marca
                    </label>
                    <input
                      type="text"
                      value={settings.companyName}
                      onChange={e => setSettings({ ...settings, companyName: e.target.value })}
                      placeholder="ej: LA HORMIGA"
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-[#F0C800] focus:ring-1 focus:ring-[#F0C800] font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Slogan de Marca
                    </label>
                    <input
                      type="text"
                      value={settings.slogan}
                      onChange={e => setSettings({ ...settings, slogan: e.target.value })}
                      placeholder="ej: Pequeños grandes movimientos"
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-[#F0C800] focus:ring-1 focus:ring-[#F0C800]"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => handleSaveGeneralSettings('company-name', 'Nombre de empresa y slogan comercial guardados con éxito')}
                    className={`px-5 py-2.5 font-black text-xs rounded-xl transition-all shadow-md flex items-center space-x-2 cursor-pointer ${
                      savedButtonId === 'company-name'
                        ? 'bg-emerald-500 text-slate-950 scale-105 shadow-emerald-500/40 ring-2 ring-emerald-300'
                        : 'bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D]'
                    }`}
                  >
                    {savedButtonId === 'company-name' ? (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>¡Nombre y Slogan Guardados!</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Guardar Nombre y Slogan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: GESTOR DE USUARIOS & PERMISOS DEL SISTEMA                          */}
          {/* ========================================================================= */}
          {activeTab === 'usuarios' && (
            <UsersPermissionsSection
              currentUser={currentUser}
              onUsersUpdated={(nextUsers) => {
                setUsers(nextUsers);
                onUsersUpdated?.(nextUsers);
              }}
              compact
            />
          )}

          {/* ========================================================================= */}
          {/* TAB 3: CONTACTO, TELÉFONOS, UBICACIÓN & HORARIOS                          */}
          {/* ========================================================================= */}
          {activeTab === 'contacto' && (
            <div className="space-y-6">
              {/* Teléfonos y Canales Directos */}
              <div className="bg-[#1A1E26] border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#F0C800]" />
                  Teléfonos de Atención y WhatsApp
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Teléfono Central / Comercial
                    </label>
                    <input
                      type="text"
                      value={settings.telefonoPrincipal}
                      onChange={e => setSettings({ ...settings, telefonoPrincipal: e.target.value })}
                      placeholder="(011) 4567-8900"
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Teléfono de Guardia / Urgencias 24hs
                    </label>
                    <input
                      type="text"
                      value={settings.telefonoGuardia}
                      onChange={e => setSettings({ ...settings, telefonoGuardia: e.target.value })}
                      placeholder="(011) 15-9876-5432"
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      WhatsApp Directo
                    </label>
                    <input
                      type="text"
                      value={settings.whatsapp}
                      onChange={e => setSettings({ ...settings, whatsapp: e.target.value })}
                      placeholder="+54 9 11 9876-5432"
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Correo Electrónico Oficial
                    </label>
                    <input
                      type="email"
                      value={settings.email}
                      onChange={e => setSettings({ ...settings, email: e.target.value })}
                      placeholder="contacto@lahormiga.com.ar"
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Instagram / Redes
                    </label>
                    <input
                      type="text"
                      value={settings.instagram}
                      onChange={e => setSettings({ ...settings, instagram: e.target.value })}
                      placeholder="@lahormiga_maquinarias"
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                    />
                  </div>
                </div>
              </div>

              {/* Ubicación y Dirección */}
              <div className="bg-[#1A1E26] border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#F0C800]" />
                  Ubicación & Base Operativa
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Dirección Física Completa
                    </label>
                    <input
                      type="text"
                      value={settings.direccion}
                      onChange={e => setSettings({ ...settings, direccion: e.target.value })}
                      placeholder="San Salvador de Jujuy, Jujuy, Argentina"
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Enlace de Google Maps (URL)
                    </label>
                    <input
                      type="url"
                      value={settings.googleMapsUrl}
                      onChange={e => setSettings({ ...settings, googleMapsUrl: e.target.value })}
                      placeholder="https://maps.google.com/..."
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                    />
                  </div>
                </div>
              </div>

              {/* Horarios de Atención */}
              <div className="bg-[#1A1E26] border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#F0C800]" />
                  Horarios de Atención y Guardias
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Lunes a Viernes
                    </label>
                    <input
                      type="text"
                      value={settings.horarioSemana}
                      onChange={e => setSettings({ ...settings, horarioSemana: e.target.value })}
                      placeholder="Lunes a Viernes: 07:00 a 18:00 hs"
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Sábados
                    </label>
                    <input
                      type="text"
                      value={settings.horarioSabados}
                      onChange={e => setSettings({ ...settings, horarioSabados: e.target.value })}
                      placeholder="Sábados: 07:30 a 13:00 hs"
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Domingos / Feriados / Guardias
                    </label>
                    <input
                      type="text"
                      value={settings.horarioDomingos}
                      onChange={e => setSettings({ ...settings, horarioDomingos: e.target.value })}
                      placeholder="Domingos y Feriados: Guardias 24hs"
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => handleSaveGeneralSettings('contacto', 'Datos de contacto, teléfonos y horarios guardados')}
                    className={`px-5 py-2.5 font-black text-xs rounded-xl transition-all shadow-md flex items-center space-x-2 cursor-pointer ${
                      savedButtonId === 'contacto'
                        ? 'bg-emerald-500 text-slate-950 scale-105 shadow-emerald-500/40 ring-2 ring-emerald-300'
                        : 'bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D]'
                    }`}
                  >
                    {savedButtonId === 'contacto' ? (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>¡Contacto y Horarios Guardados!</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Guardar Datos de Contacto y Horarios</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: EDITOR DE TEXTOS EN VIVO (CMS)                                     */}
          {/* ========================================================================= */}
          {activeTab === 'textos' && (
            <div className="space-y-5">
              {/* Header de la herramienta de edición en vivo */}
              <div className="bg-[#1A1E26] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-white flex items-center gap-2">
                        <FileText className="w-5 h-5 text-[#F0C800]" />
                        Editor de Textos & CMS en Vivo (La Hormiga)
                      </h3>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Edición en Vivo Activa
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Identifique cada bloque principal de la web pública, edite los textos y vea cómo se sincronizan automáticamente en tiempo real sin recargar la página.
                    </p>
                  </div>

                  <div className="flex items-center flex-wrap gap-2">
                    {/* Botón Guardar Textos del CMS */}
                    <button
                      type="button"
                      onClick={() => handleSaveGeneralSettings('cms-texts', 'Todos los textos y bloques del CMS han sido guardados')}
                      className={`px-4 py-2 font-black text-xs rounded-xl transition-all shadow-md flex items-center space-x-2 cursor-pointer ${
                        savedButtonId === 'cms-texts'
                          ? 'bg-emerald-500 text-slate-950 scale-105 shadow-emerald-500/40 ring-2 ring-emerald-300'
                          : 'bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D]'
                      }`}
                    >
                      {savedButtonId === 'cms-texts' ? (
                        <>
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>¡Textos Guardados!</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Guardar Textos del CMS</span>
                        </>
                      )}
                    </button>

                    {/* Toggle de Modo Split Preview */}
                    <button
                      type="button"
                      onClick={() => setSplitViewMode(!splitViewMode)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                        splitViewMode
                          ? 'bg-[#F0C800] text-[#2D2D2D] border-[#F0C800]'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                      title="Alternar entre vista de pantalla dividida con vista previa o formulario extendido"
                    >
                      <Split className="w-3.5 h-3.5" />
                      <span>{splitViewMode ? 'Vista Dividida (Con Preview)' : 'Solo Formulario'}</span>
                    </button>

                    {/* Botón Restaurar Todo */}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('¿Desea restaurar todos los textos de la web a los valores predeterminados de fábrica?')) {
                          const resetTexts = {
                            ...settings,
                            heroBadge: DEFAULT_SITE_SETTINGS.heroBadge,
                            heroTitle: DEFAULT_SITE_SETTINGS.heroTitle,
                            heroSubtitle: DEFAULT_SITE_SETTINGS.heroSubtitle,
                            heroCtaPrimary: DEFAULT_SITE_SETTINGS.heroCtaPrimary,
                            heroCtaSecondary: DEFAULT_SITE_SETTINGS.heroCtaSecondary,
                            serviciosTitle: DEFAULT_SITE_SETTINGS.serviciosTitle,
                            serviciosSubtitle: DEFAULT_SITE_SETTINGS.serviciosSubtitle,
                            flotaTitle: DEFAULT_SITE_SETTINGS.flotaTitle,
                            flotaSubtitle: DEFAULT_SITE_SETTINGS.flotaSubtitle,
                            herramientasTitle: DEFAULT_SITE_SETTINGS.herramientasTitle,
                            herramientasSubtitle: DEFAULT_SITE_SETTINGS.herramientasSubtitle,
                            eventosTitle: DEFAULT_SITE_SETTINGS.eventosTitle,
                            eventosSubtitle: DEFAULT_SITE_SETTINGS.eventosSubtitle,
                            aridosTitle: DEFAULT_SITE_SETTINGS.aridosTitle,
                            aridosSubtitle: DEFAULT_SITE_SETTINGS.aridosSubtitle,
                            ferreteriaTitle: DEFAULT_SITE_SETTINGS.ferreteriaTitle,
                            ferreteriaSubtitle: DEFAULT_SITE_SETTINGS.ferreteriaSubtitle,
                            nosotrosTitle: DEFAULT_SITE_SETTINGS.nosotrosTitle,
                            nosotrosSubtitle: DEFAULT_SITE_SETTINGS.nosotrosSubtitle,
                            nosotrosTexto1: DEFAULT_SITE_SETTINGS.nosotrosTexto1,
                            nosotrosTexto2: DEFAULT_SITE_SETTINGS.nosotrosTexto2,
                            ctaBannerTitle: DEFAULT_SITE_SETTINGS.ctaBannerTitle,
                            ctaBannerSubtitle: DEFAULT_SITE_SETTINGS.ctaBannerSubtitle,
                            ctaBannerBoton: DEFAULT_SITE_SETTINGS.ctaBannerBoton,
                            footerText: DEFAULT_SITE_SETTINGS.footerText,
                          };
                          setSettings(resetTexts);
                          saveSiteSettings(resetTexts);
                          triggerSuccess('Todos los textos se han restaurado a los originales.');
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Restaurar Todo</span>
                    </button>
                  </div>
                </div>

                {/* Filtro de Búsqueda y Navegación Rápida de Bloques */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-2 border-t border-slate-800">
                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar bloque o palabra clave..."
                      value={liveSearchQuery}
                      onChange={e => setLiveSearchQuery(e.target.value)}
                      className="w-full bg-[#111317] border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-[#F0C800]"
                    />
                    {liveSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setLiveSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Pills de Bloques */}
                  <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto no-scrollbar py-1">
                    {[
                      { id: 'all', label: 'Todos' },
                      { id: 'hero', label: '1. Hero' },
                      { id: 'flota', label: '2. Flota' },
                      { id: 'herramientas', label: '3. Herramientas' },
                      { id: 'eventos', label: '4. Eventos' },
                      { id: 'servicios', label: '5. Suelo' },
                      { id: 'aridos', label: '6. Áridos' },
                      { id: 'ferreteria', label: '7. Ferretería' },
                      { id: 'nosotros', label: '8. Nosotros' },
                      { id: 'cta', label: '9. Cotización' },
                      { id: 'contacto', label: '10. Contacto' },
                      { id: 'footer', label: '11. Footer' },
                    ].map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBlockId(b.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer border ${
                          selectedBlockId === b.id
                            ? 'bg-[#F0C800]/20 text-[#F0C800] border-[#F0C800]/50'
                            : 'bg-[#111317] text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Layout: Formulario + Vista Previa Dividida */}
              <div className={`grid gap-6 ${splitViewMode ? 'grid-cols-1 xl:grid-cols-12' : 'grid-cols-1'}`}>
                
                {/* COLUMNA IZQUIERDA: Formulario de Bloques Editables */}
                <div className={`${splitViewMode ? 'xl:col-span-7' : 'w-full'} space-y-5 max-h-[680px] overflow-y-auto pr-1 no-scrollbar`}>
                  
                  {/* ========================================================================= */}
                  {/* BLOQUE 1: HERO & CABECERA PRINCIPAL                                       */}
                  {/* ========================================================================= */}
                  {(selectedBlockId === 'all' || selectedBlockId === 'hero') && (
                    <div 
                      id="block-hero"
                      className={`bg-[#1A1E26] border rounded-2xl p-5 space-y-4 transition ${
                        lastSavedField?.startsWith('hero') ? 'border-[#F0C800] ring-1 ring-[#F0C800]/30' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/10 text-[#F0C800] text-[10px] font-black border border-[#F0C800]/30 font-mono">
                            BLOQUE #01
                          </span>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-[#F0C800]" />
                            Cabecera Principal (Hero Banner)
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSingleBlock('hero')}
                          className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restablecer Bloque</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                            <span>Etiqueta / Badge Superior</span>
                            <span className="text-[10px] text-slate-500 font-mono">{settings.heroBadge.length} car.</span>
                          </label>
                          <input
                            type="text"
                            value={settings.heroBadge}
                            onChange={e => handleLiveFieldChange('heroBadge', e.target.value)}
                            placeholder="LA HORMIGA • SERVICIOS VIALES & FERRETERÍA"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800] focus:ring-1 focus:ring-[#F0C800]/30"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                            <span>Texto del Botón Principal (CTA)</span>
                            <span className="text-[10px] text-slate-500 font-mono">{settings.heroCtaPrimary.length} car.</span>
                          </label>
                          <input
                            type="text"
                            value={settings.heroCtaPrimary}
                            onChange={e => handleLiveFieldChange('heroCtaPrimary', e.target.value)}
                            placeholder="Cotizar Alquiler Inmediato"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800] focus:ring-1 focus:ring-[#F0C800]/30"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                          <span>Título Principal de Impacto</span>
                          <span className="text-[10px] text-slate-500 font-mono">{settings.heroTitle.length} car.</span>
                        </label>
                        <input
                          type="text"
                          value={settings.heroTitle}
                          onChange={e => handleLiveFieldChange('heroTitle', e.target.value)}
                          placeholder="Potencia y Maquinaria Pesada para Grandes Obras"
                          className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:border-[#F0C800] focus:ring-1 focus:ring-[#F0C800]/30"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                          <span>Subtítulo Descriptivo del Hero</span>
                          <span className="text-[10px] text-slate-500 font-mono">{settings.heroSubtitle.length} car.</span>
                        </label>
                        <textarea
                          rows={2}
                          value={settings.heroSubtitle}
                          onChange={e => handleLiveFieldChange('heroSubtitle', e.target.value)}
                          placeholder="Flota moderna de excavadoras, retroexcavadoras, motoniveladoras y camiones volcadores..."
                          className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800] focus:ring-1 focus:ring-[#F0C800]/30 leading-relaxed"
                        />
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BLOQUE 2: FLOTA VIAL & MAQUINARIA PESADA                                  */}
                  {/* ========================================================================= */}
                  {(selectedBlockId === 'all' || selectedBlockId === 'flota') && (
                    <div 
                      id="block-flota"
                      className={`bg-[#1A1E26] border rounded-2xl p-5 space-y-4 transition ${
                        lastSavedField?.startsWith('flota') ? 'border-[#F0C800] ring-1 ring-[#F0C800]/30' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/10 text-[#F0C800] text-[10px] font-black border border-[#F0C800]/30 font-mono">
                            BLOQUE #02
                          </span>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <Truck className="w-4 h-4 text-[#F0C800]" />
                            Catálogo de Flota Vial & Maquinaria Pesada
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSingleBlock('flota')}
                          className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restablecer Bloque</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Título de la Sección de Flota
                          </label>
                          <input
                            type="text"
                            value={settings.flotaTitle}
                            onChange={e => handleLiveFieldChange('flotaTitle', e.target.value)}
                            placeholder="Nuestra Flota de Equipos & Maquinarias"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Subtítulo Descriptivo de la Flota
                          </label>
                          <textarea
                            rows={2}
                            value={settings.flotaSubtitle}
                            onChange={e => handleLiveFieldChange('flotaSubtitle', e.target.value)}
                            placeholder="Alquiler con o sin operador calificado, mantenimiento preventivo..."
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BLOQUE 3: HERRAMIENTAS MENORES DE CONSTRUCCIÓN                            */}
                  {/* ========================================================================= */}
                  {(selectedBlockId === 'all' || selectedBlockId === 'herramientas') && (
                    <div 
                      id="block-herramientas"
                      className={`bg-[#1A1E26] border rounded-2xl p-5 space-y-4 transition ${
                        lastSavedField?.startsWith('herramientas') ? 'border-[#F0C800] ring-1 ring-[#F0C800]/30' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/10 text-[#F0C800] text-[10px] font-black border border-[#F0C800]/30 font-mono">
                            BLOQUE #03
                          </span>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <HardHat className="w-4 h-4 text-[#F0C800]" />
                            Herramientas Menores de Construcción
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSingleBlock('herramientas')}
                          className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restablecer Bloque</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Título de la Sección de Herramientas
                          </label>
                          <input
                            type="text"
                            value={settings.herramientasTitle}
                            onChange={e => handleLiveFieldChange('herramientasTitle', e.target.value)}
                            placeholder="Alquiler de Herramientas Menores para Obra"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Subtítulo Descriptivo de Herramientas
                          </label>
                          <input
                            type="text"
                            value={settings.herramientasSubtitle}
                            onChange={e => handleLiveFieldChange('herramientasSubtitle', e.target.value)}
                            placeholder="Equipamiento profesional para constructores, contratistas y gremios..."
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BLOQUE 4: EVENTOS & GASTRONOMÍA                                          */}
                  {/* ========================================================================= */}
                  {(selectedBlockId === 'all' || selectedBlockId === 'eventos') && (
                    <div 
                      id="block-eventos"
                      className={`bg-[#1A1E26] border rounded-2xl p-5 space-y-4 transition ${
                        lastSavedField?.startsWith('eventos') ? 'border-[#F0C800] ring-1 ring-[#F0C800]/30' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/10 text-[#F0C800] text-[10px] font-black border border-[#F0C800]/30 font-mono">
                            BLOQUE #04
                          </span>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-[#F0C800]" />
                            Equipamiento para Eventos & Gastronomía
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSingleBlock('eventos')}
                          className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restablecer Bloque</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Título Sección Alquiler para Eventos
                          </label>
                          <input
                            type="text"
                            value={settings.eventosTitle}
                            onChange={e => handleLiveFieldChange('eventosTitle', e.target.value)}
                            placeholder="Alquiler de Cámaras de Frío & Equipos para Eventos"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Subtítulo Descriptivo de Eventos
                          </label>
                          <input
                            type="text"
                            value={settings.eventosSubtitle}
                            onChange={e => handleLiveFieldChange('eventosSubtitle', e.target.value)}
                            placeholder="Cámaras de frío móviles, grupos electrógenos insonorizados..."
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BLOQUE 5: MOVIMIENTO DE SUELO & SERVICIOS VIALES                          */}
                  {/* ========================================================================= */}
                  {(selectedBlockId === 'all' || selectedBlockId === 'servicios') && (
                    <div 
                      id="block-servicios"
                      className={`bg-[#1A1E26] border rounded-2xl p-5 space-y-4 transition ${
                        lastSavedField?.startsWith('servicios') ? 'border-[#F0C800] ring-1 ring-[#F0C800]/30' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/10 text-[#F0C800] text-[10px] font-black border border-[#F0C800]/30 font-mono">
                            BLOQUE #05
                          </span>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-[#F0C800]" />
                            Servicios de Movimiento de Suelo & Obras
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSingleBlock('servicios')}
                          className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restablecer Bloque</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Título Sección Movimiento de Suelo
                          </label>
                          <input
                            type="text"
                            value={settings.serviciosTitle}
                            onChange={e => handleLiveFieldChange('serviciosTitle', e.target.value)}
                            placeholder="Servicios Especializados de Movimiento de Suelo"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Subtítulo Descriptivo de Suelo & Obras
                          </label>
                          <textarea
                            rows={2}
                            value={settings.serviciosSubtitle}
                            onChange={e => handleLiveFieldChange('serviciosSubtitle', e.target.value)}
                            placeholder="Nivelación láser, desmonte, apertura de caminos, plateas..."
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BLOQUE 6: VENTA DE ÁRIDOS Y MATERIALES                                   */}
                  {/* ========================================================================= */}
                  {(selectedBlockId === 'all' || selectedBlockId === 'aridos') && (
                    <div 
                      id="block-aridos"
                      className={`bg-[#1A1E26] border rounded-2xl p-5 space-y-4 transition ${
                        lastSavedField?.startsWith('aridos') ? 'border-[#F0C800] ring-1 ring-[#F0C800]/30' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/10 text-[#F0C800] text-[10px] font-black border border-[#F0C800]/30 font-mono">
                            BLOQUE #06
                          </span>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <Truck className="w-4 h-4 text-[#F0C800]" />
                            Venta y Distribución de Áridos a Granel
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSingleBlock('aridos')}
                          className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restablecer Bloque</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Título Sección de Áridos
                          </label>
                          <input
                            type="text"
                            value={settings.aridosTitle}
                            onChange={e => handleLiveFieldChange('aridosTitle', e.target.value)}
                            placeholder="Venta y Entrega de Áridos por Metro Cúbico"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Subtítulo Descriptivo de Áridos
                          </label>
                          <input
                            type="text"
                            value={settings.aridosSubtitle}
                            onChange={e => handleLiveFieldChange('aridosSubtitle', e.target.value)}
                            placeholder="Arena fina, arena gruesa, piedra partida, estabilizado y tosca..."
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BLOQUE 7: FERRETERÍA INDUSTRIAL                                           */}
                  {/* ========================================================================= */}
                  {(selectedBlockId === 'all' || selectedBlockId === 'ferreteria') && (
                    <div 
                      id="block-ferreteria"
                      className={`bg-[#1A1E26] border rounded-2xl p-5 space-y-4 transition ${
                        lastSavedField?.startsWith('ferreteria') ? 'border-[#F0C800] ring-1 ring-[#F0C800]/30' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/10 text-[#F0C800] text-[10px] font-black border border-[#F0C800]/30 font-mono">
                            BLOQUE #07
                          </span>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <ShoppingBag className="w-4 h-4 text-[#F0C800]" />
                            Salón de Ferretería Industrial & EPP
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSingleBlock('ferreteria')}
                          className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restablecer Bloque</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Título Sección Ferretería Industrial
                          </label>
                          <input
                            type="text"
                            value={settings.ferreteriaTitle}
                            onChange={e => handleLiveFieldChange('ferreteriaTitle', e.target.value)}
                            placeholder="Salón de Ventas & Ferretería Industrial"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Subtítulo Descriptivo de Ferretería
                          </label>
                          <input
                            type="text"
                            value={settings.ferreteriaSubtitle}
                            onChange={e => handleLiveFieldChange('ferreteriaSubtitle', e.target.value)}
                            placeholder="Insumos de construcción, bulonería, herramientas eléctricas..."
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BLOQUE 8: SOBRE NOSOTROS & TRAYECTORIA                                    */}
                  {/* ========================================================================= */}
                  {(selectedBlockId === 'all' || selectedBlockId === 'nosotros') && (
                    <div 
                      id="block-nosotros"
                      className={`bg-[#1A1E26] border rounded-2xl p-5 space-y-4 transition ${
                        lastSavedField?.startsWith('nosotros') ? 'border-[#F0C800] ring-1 ring-[#F0C800]/30' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/10 text-[#F0C800] text-[10px] font-black border border-[#F0C800]/30 font-mono">
                            BLOQUE #08
                          </span>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-[#F0C800]" />
                            Sobre La Hormiga & Trayectoria
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSingleBlock('nosotros')}
                          className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restablecer Bloque</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Título Sobre Nosotros
                          </label>
                          <input
                            type="text"
                            value={settings.nosotrosTitle}
                            onChange={e => handleLiveFieldChange('nosotrosTitle', e.target.value)}
                            placeholder="Más de 15 Años Impulsando el Desarrollo de la Región"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Lema / Subtítulo Destacado
                          </label>
                          <input
                            type="text"
                            value={settings.nosotrosSubtitle}
                            onChange={e => handleLiveFieldChange('nosotrosSubtitle', e.target.value)}
                            placeholder="Compromiso, seriedad operativa y maquinaria de alto rendimiento..."
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Párrafo 1 (Historia, Filosofía & Experiencia)
                        </label>
                        <textarea
                          rows={2}
                          value={settings.nosotrosTexto1}
                          onChange={e => handleLiveFieldChange('nosotrosTexto1', e.target.value)}
                          placeholder="En La Hormiga nacimos como una empresa familiar orientada al servicio vial..."
                          className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Párrafo 2 (Infraestructura, Base Operativa & Personal)
                        </label>
                        <textarea
                          rows={2}
                          value={settings.nosotrosTexto2}
                          onChange={e => handleLiveFieldChange('nosotrosTexto2', e.target.value)}
                          placeholder="Disponemos de base operativa equipada con taller mecánico propio..."
                          className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                        />
                      </div>

                      {/* Foto Institucional de Base Operativa / Flota */}
                      <div className="pt-3 border-t border-slate-800 space-y-3">
                        <label className="block text-xs font-semibold text-slate-300">
                          Fotografía Institucional (Base Operativa, Flota o Maquinarias)
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                          <div className="sm:col-span-7">
                            <ImageClipboardDropzone
                              currentImageUrl={settings.nosotrosFotoUrl || ''}
                              onImageChange={(url, file) => handleNosotrosPhotoChange(url, file)}
                              onImageRemove={() => {
                                handleLiveFieldChange('nosotrosFotoUrl', '');
                                triggerSuccess('Foto restablecida al valor por defecto');
                              }}
                              label="Subir o Pegar Foto de la Empresa"
                              sublabel="Recomendado: 1200x800 px (JPG, WebP, PNG)"
                              aspectRatio="video"
                              placeholderText="Arrastrá una foto de tus máquinas o pegá con Ctrl+V"
                            />
                          </div>
                          <div className="sm:col-span-5 space-y-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Presets recomendados:
                            </span>
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                { title: 'Base y Flota', url: 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=1200&q=80' },
                                { title: 'Maquinaria en Obra', url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80' },
                                { title: 'Movimiento Suelo', url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80' },
                                { title: 'Obrador y Taller', url: 'https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?auto=format&fit=crop&w=1200&q=80' },
                              ].map((p, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => {
                                    handleLiveFieldChange('nosotrosFotoUrl', p.url);
                                    triggerSuccess(`Preset "${p.title}" aplicado`);
                                  }}
                                  className="p-1.5 bg-[#111317] hover:bg-slate-800 border border-slate-800 hover:border-[#F0C800]/50 rounded-lg text-left transition group cursor-pointer"
                                >
                                  <div className="h-10 w-full rounded overflow-hidden mb-1 bg-slate-900">
                                    <img src={p.url} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                                  </div>
                                  <span className="text-[9px] font-bold text-slate-300 group-hover:text-[#F0C800] block truncate">
                                    {p.title}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BLOQUE 9: BANNER DE COTIZACIÓN INMEDIATA (CTA)                            */}
                  {/* ========================================================================= */}
                  {(selectedBlockId === 'all' || selectedBlockId === 'cta') && (
                    <div 
                      id="block-cta"
                      className={`bg-[#1A1E26] border rounded-2xl p-5 space-y-4 transition ${
                        lastSavedField?.startsWith('cta') ? 'border-[#F0C800] ring-1 ring-[#F0C800]/30' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/10 text-[#F0C800] text-[10px] font-black border border-[#F0C800]/30 font-mono">
                            BLOQUE #09
                          </span>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <MessageCircle className="w-4 h-4 text-[#F0C800]" />
                            Banner de Cotización & Llamado a la Acción (CTA)
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSingleBlock('cta')}
                          className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restablecer Bloque</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Título del Banner CTA
                          </label>
                          <input
                            type="text"
                            value={settings.ctaBannerTitle}
                            onChange={e => handleLiveFieldChange('ctaBannerTitle', e.target.value)}
                            placeholder="¿Tiene un Proyecto en Mente o Necesita Cotización Urgente?"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Texto del Botón de Contacto (WhatsApp)
                          </label>
                          <input
                            type="text"
                            value={settings.ctaBannerBoton}
                            onChange={e => handleLiveFieldChange('ctaBannerBoton', e.target.value)}
                            placeholder="Hablar con un Asesor Técnico"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Subtítulo Descriptivo del Banner
                        </label>
                        <input
                          type="text"
                          value={settings.ctaBannerSubtitle}
                          onChange={e => handleLiveFieldChange('ctaBannerSubtitle', e.target.value)}
                          placeholder="Contacte hoy con nuestro equipo técnico para cotizar por hora, jornada o proyecto..."
                          className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                        />
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BLOQUE 10: CONTACTO, HORARIOS & BASE OPERATIVA                            */}
                  {/* ========================================================================= */}
                  {(selectedBlockId === 'all' || selectedBlockId === 'contacto') && (
                    <div 
                      id="block-contacto"
                      className={`bg-[#1A1E26] border rounded-2xl p-5 space-y-4 transition ${
                        lastSavedField === 'telefonoPrincipal' || lastSavedField === 'direccion' || lastSavedField === 'horarioSemana' ? 'border-[#F0C800] ring-1 ring-[#F0C800]/30' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/10 text-[#F0C800] text-[10px] font-black border border-[#F0C800]/30 font-mono">
                            BLOQUE #10
                          </span>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-[#F0C800]" />
                            Datos de Contacto, Ubicación & Horarios
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSingleBlock('contacto')}
                          className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restablecer Bloque</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Teléfono Central
                          </label>
                          <input
                            type="text"
                            value={settings.telefonoPrincipal}
                            onChange={e => handleLiveFieldChange('telefonoPrincipal', e.target.value)}
                            placeholder="+54 9 299 456-7890"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Teléfono de Guardia 24hs
                          </label>
                          <input
                            type="text"
                            value={settings.telefonoGuardia}
                            onChange={e => handleLiveFieldChange('telefonoGuardia', e.target.value)}
                            placeholder="+54 9 299 987-6543"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Dirección / Base Operativa
                        </label>
                        <input
                          type="text"
                          value={settings.direccion}
                          onChange={e => handleLiveFieldChange('direccion', e.target.value)}
                          placeholder="Ruta Provincial 7 Km 8.5, Parque Industrial"
                          className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Horario Lun a Vie
                          </label>
                          <input
                            type="text"
                            value={settings.horarioSemana}
                            onChange={e => handleLiveFieldChange('horarioSemana', e.target.value)}
                            placeholder="07:00 a 18:00 hs"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Horario Sábados
                          </label>
                          <input
                            type="text"
                            value={settings.horarioSabados}
                            onChange={e => handleLiveFieldChange('horarioSabados', e.target.value)}
                            placeholder="07:30 a 13:00 hs"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Guardias / Domingo
                          </label>
                          <input
                            type="text"
                            value={settings.horarioDomingos}
                            onChange={e => handleLiveFieldChange('horarioDomingos', e.target.value)}
                            placeholder="Guardias 24hs"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BLOQUE 11: FOOTER OFICIAL                                                 */}
                  {/* ========================================================================= */}
                  {(selectedBlockId === 'all' || selectedBlockId === 'footer') && (
                    <div 
                      id="block-footer"
                      className={`bg-[#1A1E26] border rounded-2xl p-5 space-y-4 transition ${
                        lastSavedField?.startsWith('footer') ? 'border-[#F0C800] ring-1 ring-[#F0C800]/30' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0C800]/10 text-[#F0C800] text-[10px] font-black border border-[#F0C800]/30 font-mono">
                            BLOQUE #11
                          </span>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <Globe className="w-4 h-4 text-[#F0C800]" />
                            Pie de Página Institucional (Footer)
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSingleBlock('footer')}
                          className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restablecer Bloque</span>
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Descripción y Resumen Institucional del Footer
                        </label>
                        <textarea
                          rows={2}
                          value={settings.footerText}
                          onChange={e => handleLiveFieldChange('footerText', e.target.value)}
                          placeholder="La Hormiga - Servicios integrales viales, movimiento de suelo, venta de áridos y ferretería industrial..."
                          className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                        />
                      </div>
                    </div>
                  )}

                </div>

                {/* COLUMNA DERECHA: Vista Previa en Vivo Interactiva */}
                {splitViewMode && (
                  <div className="xl:col-span-5 bg-[#111317] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-4 max-h-[680px] overflow-hidden sticky top-0">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-[#F0C800]" />
                        <span className="text-xs font-black text-white tracking-wide">VISTA PREVIA DINÁMICA</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">Auto-reflejo instantáneo</span>
                    </div>

                    {/* Simulación visual de la Web Pública */}
                    <div className="overflow-y-auto space-y-3.5 pr-1 no-scrollbar text-left flex-1">
                      
                      {/* Simulación Hero */}
                      <div 
                        onClick={() => setSelectedBlockId('hero')}
                        className={`p-3.5 rounded-xl border transition cursor-pointer relative group ${
                          lastSavedField?.startsWith('hero') || selectedBlockId === 'hero'
                            ? 'bg-slate-900 border-[#F0C800] ring-1 ring-[#F0C800]/40' 
                            : 'bg-[#181B21] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                          <span className="text-[#F0C800] font-bold">[#01 HERO]</span>
                          <span className="group-hover:text-white transition">Click para editar</span>
                        </div>
                        <div className="inline-block px-2 py-0.5 rounded bg-[#F0C800]/10 text-[#F0C800] text-[9px] font-bold mb-1">
                          {settings.heroBadge || 'ETIQUETA HERO'}
                        </div>
                        <div className="text-xs font-black text-white leading-tight">
                          {settings.heroTitle || 'Título Hero'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                          {settings.heroSubtitle || 'Subtítulo del hero descriptivo...'}
                        </div>
                        <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#F0C800] text-black font-bold text-[10px]">
                          {settings.heroCtaPrimary || 'Botón CTA'}
                          <ArrowRight className="w-2.5 h-2.5" />
                        </div>
                      </div>

                      {/* Simulación Flota */}
                      <div 
                        onClick={() => setSelectedBlockId('flota')}
                        className={`p-3 rounded-xl border transition cursor-pointer relative group ${
                          lastSavedField?.startsWith('flota') || selectedBlockId === 'flota'
                            ? 'bg-slate-900 border-[#F0C800] ring-1 ring-[#F0C800]/40' 
                            : 'bg-[#181B21] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                          <span className="text-[#F0C800] font-bold">[#02 FLOTA VIAL]</span>
                          <span className="group-hover:text-white transition">Click para editar</span>
                        </div>
                        <div className="text-xs font-bold text-white">
                          {settings.flotaTitle || 'Título Flota'}
                        </div>
                        <div className="text-[10px] text-slate-400 line-clamp-1">
                          {settings.flotaSubtitle || 'Subtítulo de flota...'}
                        </div>
                      </div>

                      {/* Simulación Herramientas */}
                      <div 
                        onClick={() => setSelectedBlockId('herramientas')}
                        className={`p-3 rounded-xl border transition cursor-pointer relative group ${
                          lastSavedField?.startsWith('herramientas') || selectedBlockId === 'herramientas'
                            ? 'bg-slate-900 border-[#F0C800] ring-1 ring-[#F0C800]/40' 
                            : 'bg-[#181B21] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                          <span className="text-[#F0C800] font-bold">[#03 HERRAMIENTAS]</span>
                          <span className="group-hover:text-white transition">Click para editar</span>
                        </div>
                        <div className="text-xs font-bold text-white">
                          {settings.herramientasTitle || 'Título Herramientas'}
                        </div>
                        <div className="text-[10px] text-slate-400 line-clamp-1">
                          {settings.herramientasSubtitle || 'Subtítulo de herramientas...'}
                        </div>
                      </div>

                      {/* Simulación Movimiento de Suelo */}
                      <div 
                        onClick={() => setSelectedBlockId('servicios')}
                        className={`p-3 rounded-xl border transition cursor-pointer relative group ${
                          lastSavedField?.startsWith('servicios') || selectedBlockId === 'servicios'
                            ? 'bg-slate-900 border-[#F0C800] ring-1 ring-[#F0C800]/40' 
                            : 'bg-[#181B21] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                          <span className="text-[#F0C800] font-bold">[#05 SUELO & OBRAS]</span>
                          <span className="group-hover:text-white transition">Click para editar</span>
                        </div>
                        <div className="text-xs font-bold text-white">
                          {settings.serviciosTitle || 'Título Suelo'}
                        </div>
                        <div className="text-[10px] text-slate-400 line-clamp-1">
                          {settings.serviciosSubtitle || 'Subtítulo de suelo...'}
                        </div>
                      </div>

                      {/* Simulación Áridos */}
                      <div 
                        onClick={() => setSelectedBlockId('aridos')}
                        className={`p-3 rounded-xl border transition cursor-pointer relative group ${
                          lastSavedField?.startsWith('aridos') || selectedBlockId === 'aridos'
                            ? 'bg-slate-900 border-[#F0C800] ring-1 ring-[#F0C800]/40' 
                            : 'bg-[#181B21] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                          <span className="text-[#F0C800] font-bold">[#06 ÁRIDOS]</span>
                          <span className="group-hover:text-white transition">Click para editar</span>
                        </div>
                        <div className="text-xs font-bold text-white">
                          {settings.aridosTitle || 'Título Áridos'}
                        </div>
                        <div className="text-[10px] text-slate-400 line-clamp-1">
                          {settings.aridosSubtitle || 'Subtítulo de áridos...'}
                        </div>
                      </div>

                      {/* Simulación Ferretería */}
                      <div 
                        onClick={() => setSelectedBlockId('ferreteria')}
                        className={`p-3 rounded-xl border transition cursor-pointer relative group ${
                          lastSavedField?.startsWith('ferreteria') || selectedBlockId === 'ferreteria'
                            ? 'bg-slate-900 border-[#F0C800] ring-1 ring-[#F0C800]/40' 
                            : 'bg-[#181B21] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                          <span className="text-[#F0C800] font-bold">[#07 FERRETERÍA]</span>
                          <span className="group-hover:text-white transition">Click para editar</span>
                        </div>
                        <div className="text-xs font-bold text-white">
                          {settings.ferreteriaTitle || 'Título Ferretería'}
                        </div>
                        <div className="text-[10px] text-slate-400 line-clamp-1">
                          {settings.ferreteriaSubtitle || 'Subtítulo de ferretería...'}
                        </div>
                      </div>

                      {/* Simulación Sobre Nosotros */}
                      <div 
                        onClick={() => setSelectedBlockId('nosotros')}
                        className={`p-3.5 rounded-xl border transition cursor-pointer relative group ${
                          lastSavedField?.startsWith('nosotros') || selectedBlockId === 'nosotros'
                            ? 'bg-slate-900 border-[#F0C800] ring-1 ring-[#F0C800]/40' 
                            : 'bg-[#181B21] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                          <span className="text-[#F0C800] font-bold">[#08 NOSOTROS]</span>
                          <span className="group-hover:text-white transition">Click para editar</span>
                        </div>
                        <div className="text-xs font-bold text-white">
                          {settings.nosotrosTitle || 'Título Nosotros'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium mb-1">
                          {settings.nosotrosSubtitle || 'Lema...'}
                        </div>
                        <div className="text-[10px] text-slate-400 line-clamp-2">
                          {settings.nosotrosTexto1 || 'Párrafo de historia...'}
                        </div>
                      </div>

                      {/* Simulación CTA Banner */}
                      <div 
                        onClick={() => setSelectedBlockId('cta')}
                        className={`p-3.5 rounded-xl border bg-gradient-to-r from-amber-500/10 to-transparent transition cursor-pointer relative group ${
                          lastSavedField?.startsWith('cta') || selectedBlockId === 'cta'
                            ? 'border-[#F0C800] ring-1 ring-[#F0C800]/40' 
                            : 'border-amber-500/30 hover:border-amber-500/60'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-amber-400/80 mb-1">
                          <span className="font-bold">[#09 BANNER COTIZACIÓN]</span>
                          <span className="group-hover:text-white transition">Click para editar</span>
                        </div>
                        <div className="text-xs font-black text-white">
                          {settings.ctaBannerTitle || 'Título Banner CTA'}
                        </div>
                        <div className="text-[10px] text-slate-300 mt-0.5">
                          {settings.ctaBannerSubtitle || 'Subtítulo CTA...'}
                        </div>
                        <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#25D366] text-white font-bold text-[10px]">
                          <MessageCircle className="w-2.5 h-2.5" />
                          {settings.ctaBannerBoton || 'WhatsApp'}
                        </div>
                      </div>

                      {/* Simulación Footer */}
                      <div 
                        onClick={() => setSelectedBlockId('footer')}
                        className={`p-3 rounded-xl border transition cursor-pointer relative group ${
                          lastSavedField?.startsWith('footer') || selectedBlockId === 'footer'
                            ? 'bg-slate-900 border-[#F0C800] ring-1 ring-[#F0C800]/40' 
                            : 'bg-[#181B21] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                          <span className="text-[#F0C800] font-bold">[#11 FOOTER]</span>
                          <span className="group-hover:text-white transition">Click para editar</span>
                        </div>
                        <div className="text-[10px] text-slate-400 line-clamp-2">
                          {settings.footerText || 'Descripción del footer institucional...'}
                        </div>
                      </div>

                    </div>

                    {/* Footer del Preview con botón de ir a la web */}
                    {onNavigateToPublicWeb && (
                      <div className="pt-2 border-t border-slate-800 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onNavigateToPublicWeb();
                          }}
                          className="w-full py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] font-black text-xs rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer shadow-md"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>Ver en Pantalla Completa en la Web Comercial</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Bottom save bar for Tab 4 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#111317] border border-slate-800 rounded-2xl">
                <div className="flex items-center space-x-2 text-xs text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Todos los textos editados se sincronizan en vivo con la web pública.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveGeneralSettings('cms-bottom', 'Todos los textos y bloques del CMS han sido guardados')}
                  className={`px-5 py-2.5 font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer ${
                    savedButtonId === 'cms-bottom'
                      ? 'bg-emerald-500 text-slate-950 scale-105 shadow-emerald-500/40 ring-2 ring-emerald-300'
                      : 'bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D]'
                  }`}
                >
                  {savedButtonId === 'cms-bottom' ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>¡Textos Guardados!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Guardar Textos del CMS</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: GESTOR DE SERVICIOS & FOTOS                                        */}
          {/* ========================================================================= */}
          {activeTab === 'servicios' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1A1E26] border border-slate-800 rounded-2xl p-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#F0C800]" />
                    Catálogo de Servicios & Movimiento de Suelo
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cargue sus servicios, suba fotos reales de obra, detalle maquinarias utilizadas y ventajas competitivas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenCreateService}
                  className="px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] font-black text-xs rounded-xl transition shadow-md flex items-center space-x-2 cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Agregar Servicio</span>
                </button>
              </div>

              {/* Grid de Servicios */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.map(srv => (
                  <div 
                    key={srv.id} 
                    className="bg-[#1A1E26] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-[#F0C800]/40 transition space-y-3"
                  >
                    <div className="flex gap-3">
                      <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-900 border border-slate-700 shrink-0 relative">
                        <img 
                          src={srv.foto || 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&q=80&w=300'} 
                          alt={srv.titulo}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&q=80&w=300';
                          }}
                        />
                        {srv.publicarEnWeb && (
                          <span className="absolute top-1 left-1 text-[8px] font-black bg-emerald-500 text-white px-1 py-0.2 rounded">
                            EN WEB
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-[#F0C800] font-bold uppercase tracking-wider">
                          {srv.categoria || 'Movimiento de Suelo'}
                        </div>
                        <h4 className="text-sm font-bold text-white truncate mt-0.5">
                          {srv.titulo}
                        </h4>
                        <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                          {srv.descripcion}
                        </p>
                        <div className="text-[11px] text-slate-300 font-mono mt-1 font-semibold">
                          {srv.unidadCotizacion}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span>{srv.incluyeOperador ? '✓ Incluye Operador' : 'Sin operador'}</span>
                        <span>•</span>
                        <span>{srv.equiposUtilizados?.length || 0} equipos</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditService(srv)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#F0C800] hover:bg-slate-800 transition cursor-pointer"
                          title="Editar servicio y fotos"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteService(srv.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                          title="Eliminar servicio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Modal de Formulario de Servicio */}
              {isServiceFormOpen && (
                <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
                  <div className="bg-[#1C2028] border border-slate-700 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl my-auto">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[#F0C800]" />
                        {editingService ? 'Editar Servicio' : 'Nuevo Servicio de Obra'}
                      </h4>
                      <button
                        onClick={() => setIsServiceFormOpen(false)}
                        className="text-slate-400 hover:text-white p-1 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleSaveService} className="space-y-3.5">
                      {serviceFormError && (
                        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <span>{serviceFormError}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setServiceFormError(null)}
                            className="text-rose-300 hover:text-white p-0.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Título del Servicio *
                          </label>
                          <input
                            type="text"
                            value={serviceFormData.titulo || ''}
                            onChange={e => setServiceFormData({ ...serviceFormData, titulo: e.target.value })}
                            placeholder="ej: Nivelación y Desmonte Láser"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Categoría
                          </label>
                          <select
                            value={serviceFormData.categoria || 'Movimiento de Suelo'}
                            onChange={e => setServiceFormData({ ...serviceFormData, categoria: e.target.value })}
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          >
                            <option value="Movimiento de Suelo">Movimiento de Suelo</option>
                            <option value="Nivelación Láser">Nivelación Láser</option>
                            <option value="Zanjeo y Servicios">Zanjeo y Servicios</option>
                            <option value="Demoliciones">Demoliciones</option>
                            <option value="Limpieza y Desmonte">Limpieza y Desmonte</option>
                            <option value="Carga de Áridos">Carga de Áridos</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Descripción Comercial
                        </label>
                        <textarea
                          rows={2}
                          value={serviceFormData.descripcion || ''}
                          onChange={e => setServiceFormData({ ...serviceFormData, descripcion: e.target.value })}
                          placeholder="Detalle de qué incluye el trabajo..."
                          className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                        />
                      </div>

                      {/* Foto Principal del Servicio con Pegado de Portapapeles */}
                      <ImageClipboardDropzone
                        currentImageUrl={serviceFormData.foto}
                        onImageChange={(newPhoto, file) => handleServiceCoverPhotoChange(newPhoto, file)}
                        onImageRemove={() => setServiceFormData(prev => ({ ...prev, foto: '' }))}
                        label="Foto Principal del Servicio"
                        sublabel="Arrastrá una imagen, explorá o pegala con Ctrl+V desde el portapapeles"
                        aspectRatio="video"
                        placeholderText="Pegar imagen con Ctrl+V o arrastrar archivo aquí"
                      />

                      {/* Fotos de Galería / Trabajos Realizados */}
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-semibold text-slate-300">
                            Galería de Fotos del Servicio (Opcional)
                          </label>
                          <span className="text-[11px] text-slate-400">
                            {(serviceFormData.fotosGaleria || []).length} fotos agregadas
                          </span>
                        </div>
                        
                        {(serviceFormData.fotosGaleria && serviceFormData.fotosGaleria.length > 0) && (
                          <div className="grid grid-cols-4 gap-2">
                            {serviceFormData.fotosGaleria.map((galPhoto, galIdx) => (
                              <div key={galIdx} className="relative group rounded-lg overflow-hidden border border-slate-700 aspect-video bg-black">
                                <img 
                                  src={galPhoto} 
                                  alt={`Galería ${galIdx + 1}`} 
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const filtered = (serviceFormData.fotosGaleria || []).filter((_, i) => i !== galIdx);
                                    setServiceFormData(prev => ({ ...prev, fotosGaleria: filtered }));
                                  }}
                                  className="absolute top-1 right-1 p-1 bg-rose-600/80 hover:bg-rose-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                  title="Quitar foto"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl border border-slate-700 cursor-pointer transition">
                            <Plus className="w-3.5 h-3.5 text-[#F0C800]" />
                            <span>Agregar Foto a Galería</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (!f) return;
                                setUploadingSlot('gallery');
                                setServiceFormError(null);
                                try {
                                  const res = await uploadImageToCloudflareR2(f, f.name, f.type, {
                                    maxWidth: 1600,
                                    maxHeight: 1200,
                                    quality: 0.84,
                                    format: 'image/webp'
                                  });
                                  if (res.success && res.url) {
                                    setServiceFormData(prev => ({
                                      ...prev,
                                      fotosGaleria: [...(prev.fotosGaleria || []), res.url!],
                                    }));
                                    triggerSuccess('Foto agregada a galería y subida a Cloudflare R2');
                                  } else {
                                    const msg = res.error || 'No se pudo subir la foto de galería a Cloudflare R2.';
                                    setServiceFormError(msg);
                                    triggerUploadError(msg);
                                  }
                                } catch (err: any) {
                                  const msg = err?.message || 'Error de conexión al subir foto a Cloudflare R2.';
                                  setServiceFormError(msg);
                                  triggerUploadError(msg);
                                } finally {
                                  setUploadingSlot(null);
                                }
                              }}
                            />
                          </label>
                          {uploadingSlot === 'gallery' && (
                            <span className="text-xs text-amber-400 animate-pulse flex items-center gap-1 font-medium">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Subiendo a Cloudflare R2...
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Modalidad de Cotización
                          </label>
                          <input
                            type="text"
                            value={serviceFormData.unidadCotizacion || ''}
                            onChange={e => setServiceFormData({ ...serviceFormData, unidadCotizacion: e.target.value })}
                            placeholder="Por m³ / Por jornada / A presupuesto"
                            className="w-full bg-[#111317] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800]"
                          />
                        </div>
                        <div className="flex flex-col justify-center pt-3">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={serviceFormData.incluyeOperador ?? true}
                              onChange={e => setServiceFormData({ ...serviceFormData, incluyeOperador: e.target.checked })}
                              className="w-4 h-4 rounded text-[#F0C800] focus:ring-[#F0C800] bg-slate-800 border-slate-700"
                            />
                            <span className="text-xs text-slate-300">Incluye Operador Especializado</span>
                          </label>
                          <label className="flex items-center space-x-2 mt-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={serviceFormData.publicarEnWeb ?? true}
                              onChange={e => setServiceFormData({ ...serviceFormData, publicarEnWeb: e.target.checked })}
                              className="w-4 h-4 rounded text-[#F0C800] focus:ring-[#F0C800] bg-slate-800 border-slate-700"
                            />
                            <span className="text-xs text-emerald-400 font-bold">Publicar en la Web</span>
                          </label>
                        </div>
                      </div>

                      {serviceFormError && (
                        <div className="p-3 bg-rose-500/15 border border-rose-500/40 text-rose-300 rounded-xl text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                          <span>{serviceFormError}</span>
                        </div>
                      )}

                      <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setServiceFormError(null);
                            setIsServiceFormOpen(false);
                          }}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className={`px-4 py-2 text-xs font-black rounded-xl transition shadow-md cursor-pointer flex items-center gap-1.5 ${
                            savedButtonId === 'service-form'
                              ? 'bg-emerald-500 text-slate-950 scale-105 shadow-emerald-500/30'
                              : 'bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D]'
                          }`}
                        >
                          {savedButtonId === 'service-form' ? (
                            <>
                              <Check className="w-4 h-4 stroke-[3]" />
                              <span>¡Servicio Guardado!</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>{editingService ? 'Guardar Cambios' : 'Crear Servicio'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 7: ORDENADOR DE EQUIPOS EN LA PÁGINA WEB                              */}
          {/* ========================================================================= */}
          {activeTab === 'equipos' && (
            <div className="space-y-6">
              <div className="bg-[#1A1E26] border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Truck className="w-4 h-4 text-[#F0C800]" />
                      <span>Orden de Visibilidad de Equipos en la Página Web</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Organice la posición secuencial en que se mostrarán los vehículos y maquinarias en el catálogo comercial público.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#F0C800] bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 shrink-0">
                    {localFleet.filter(v => v.publicarEnWeb !== false).length} de {localFleet.length} visibles
                  </span>
                </div>

                <div className="space-y-2.5 pt-2 max-h-[500px] overflow-y-auto pr-1">
                  {localFleet.length === 0 ? (
                    <div className="py-8 text-center text-slate-500 text-xs">
                      No hay equipos registrados en la flota.
                    </div>
                  ) : (
                    localFleet.map((eq, idx) => (
                      <div 
                        key={eq.id}
                        className={`bg-[#111317] border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                          eq.publicarEnWeb !== false 
                            ? 'border-slate-800 hover:border-amber-500/40' 
                            : 'border-slate-800/50 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          {/* Order Position Badge with input */}
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[#F0C800] flex items-center justify-center text-xs font-black font-mono">
                              #{idx + 1}
                            </span>
                          </div>

                          {/* Image thumbnail */}
                          <div className="w-12 h-10 rounded-lg overflow-hidden bg-slate-800 border border-slate-700/60 shrink-0">
                            <img 
                              src={eq.fotografia || 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=400&q=80'} 
                              alt={eq.modeloMarca}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* Equipment Details */}
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate max-w-[280px]">
                              {eq.modeloMarca}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                              <span className="text-amber-400 font-semibold">{eq.clasificacion}</span>
                              <span>•</span>
                              <span className="font-mono text-slate-400">{eq.patente || 'S/P'}</span>
                              {eq.codigoInterno && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-slate-500">{eq.codigoInterno}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Controls: Visibility Toggle + Order Arrows */}
                        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                          {/* Visibility Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleVehicleWeb(eq.id)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                              eq.publicarEnWeb !== false
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                                : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'
                            }`}
                            title="Cambiar visibilidad en la web"
                          >
                            {eq.publicarEnWeb !== false ? 'PUBLICADO EN WEB' : 'OCULTO EN WEB'}
                          </button>

                          {/* Direct Order Number input */}
                          <div className="flex items-center gap-0.5 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-0.5" title="Asignar posición directa">
                            <span className="text-[10px] text-slate-500 font-mono">Pos:</span>
                            <input 
                              type="number" 
                              min={1}
                              max={localFleet.length}
                              value={eq.ordenVisibilidad ?? (idx + 1)}
                              onChange={(e) => handleSetVehicleOrderNumber(eq.id, parseInt(e.target.value) || 1)}
                              className="w-10 bg-transparent text-center text-xs font-mono font-bold text-amber-400 focus:outline-none"
                            />
                          </div>

                          {/* Move Up */}
                          <button
                            type="button"
                            onClick={() => handleMoveVehicle(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-20 transition cursor-pointer"
                            title="Mover arriba en el catálogo"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>

                          {/* Move Down */}
                          <button
                            type="button"
                            onClick={() => handleMoveVehicle(idx, 'down')}
                            disabled={idx === localFleet.length - 1}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-20 transition cursor-pointer"
                            title="Mover abajo en el catálogo"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const sortedAlpha = [...localFleet].sort((a, b) => a.modeloMarca.localeCompare(b.modeloMarca));
                        const reindexed = sortedAlpha.map((v, idx) => ({ ...v, ordenVisibilidad: idx + 1 }));
                        setLocalFleet(reindexed);
                        if (onSaveFleet) {
                          onSaveFleet(reindexed);
                        }
                        triggerSuccess('Equipos ordenados alfabéticamente (A-Z)');
                      }}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Ordenar A-Z</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveVehicleOrder}
                    className={`px-5 py-2.5 font-black text-xs rounded-xl transition-all shadow-md flex items-center space-x-2 cursor-pointer ${
                      savedButtonId === 'equipos'
                        ? 'bg-emerald-500 text-slate-950 scale-105 shadow-emerald-500/40 ring-2 ring-emerald-300'
                        : 'bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D]'
                    }`}
                  >
                    {savedButtonId === 'equipos' ? (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>¡Orden de Equipos Guardado!</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Guardar Orden de Equipos</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#111317] border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 shrink-0">
          <div className="flex items-center space-x-2">
            {lastSavedTime ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-bold">
                <Check className="w-3.5 h-3.5 stroke-[3] text-emerald-400" />
                <span>Guardado y sincronizado ({lastSavedTime})</span>
              </span>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-300">Los cambios se aplican y sincronizan en tiempo real en todo el sistema.</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {!embedded && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cerrar
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSaveGeneralSettings('footer', 'Toda la configuración y datos fueron guardados y sincronizados correctamente')}
              className={`px-5 py-2 font-black rounded-xl text-xs transition-all shadow-lg flex items-center space-x-2 cursor-pointer ${
                savedButtonId === 'footer'
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 scale-105 shadow-emerald-500/40 ring-2 ring-emerald-300'
                  : 'bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D]'
              }`}
            >
              {savedButtonId === 'footer' ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>¡Toda la Configuración Guardada!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar Toda la Configuración</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Floating High-Contrast Toast Notification */}
        {toastInfo && (
          <div className="fixed bottom-6 right-6 sm:right-8 z-[200] max-w-md w-[calc(100vw-3rem)] pointer-events-auto animate-in slide-in-from-bottom-5 duration-300">
            <div className="bg-[#111317] border-2 border-emerald-500 shadow-[0_10px_40px_rgba(16,185,129,0.35)] rounded-2xl p-4 flex items-start gap-3.5 backdrop-blur-xl">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center shrink-0 text-emerald-400 shadow-inner">
                <CheckCircle2 className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-black text-white flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>¡Cambios Guardados!</span>
                  </h4>
                  <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    {toastInfo.timestamp}
                  </span>
                </div>
                <p className="text-xs text-slate-200 mt-1 font-semibold leading-relaxed">
                  {toastInfo.message}
                </p>
                {toastInfo.submessage && (
                  <p className="text-[11px] text-emerald-400/90 mt-0.5 font-normal">
                    {toastInfo.submessage}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Sincronizado en vivo con la web</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setToastInfo(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Cerrar notificación"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <ConfirmDeleteModal
          isOpen={!!settingsDeleteTarget}
          title={settingsDeleteTarget?.title}
          itemName={settingsDeleteTarget?.itemName || ''}
          onConfirm={() => {
            settingsDeleteTarget?.onConfirm();
            setSettingsDeleteTarget(null);
          }}
          onCancel={() => setSettingsDeleteTarget(null)}
        />
      </div>
  );

  if (embedded) {
    return modalCard;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      {modalCard}
    </div>
  );
};
