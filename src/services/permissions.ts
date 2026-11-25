import { SystemUser, UserRole, UserSession } from '../types';

export interface PermissionPartDefinition {
  id: string;
  label: string;
  description: string;
}

export interface PermissionModuleDefinition {
  key:
    | 'mantenimiento'
    | 'trabajos'
    | 'combustible'
    | 'stock'
    | 'compras'
    | 'ventas'
    | 'personal'
    | 'documentos'
    | 'configuracion';
  label: string;
  description: string;
  parts: PermissionPartDefinition[];
}

export const SYSTEM_PERMISSION_MODULES: PermissionModuleDefinition[] = [
  {
    key: 'mantenimiento',
    label: 'Mantenimiento & Flota',
    description: 'Parque de maquinarias, services preventivos, alertas y costos de taller',
    parts: [
      { id: 'flota', label: 'Flota Vehicular & Equipos', description: 'Alta, edición, archivos y ficha de máquinas' },
      { id: 'services', label: 'Services & Mantenimientos', description: 'Registro de services programados y realizados' },
      { id: 'alertas-mantenimiento', label: 'Alertas & Próximos Services', description: 'Vencimientos por horas o kilómetros' },
      { id: 'gastos-taller', label: 'Repuestos & Facturas Taller', description: 'Gastos de reparación y mantenimiento por máquina' },
      { id: 'multas-taller', label: 'Multas & Infracciones', description: 'Carga de multas e imputación de gastos a camiones y equipos' },
      { id: 'costos-maquinaria', label: 'Centro de Costos por Máquina', description: 'Análisis de gastos acumulados por equipo' },
    ],
  },
  {
    key: 'trabajos',
    label: 'Partes Diarios & Obras',
    description: 'Control operativo de obra, legajos, facturación y rentabilidad',
    parts: [
      { id: 'programacion-audio', label: 'Programación por Audio (WhatsApp Baileys)', description: 'Mandar audios a WhatsApp para armar automáticamente el esquema de empleados, máquinas y obras' },
      { id: 'pizarra-despacho', label: 'Pizarra de Ubicación (Drag & Drop)', description: 'Tablero en vivo para asignar personal y máquinas a obras o lugares' },
      { id: 'partes-diarios', label: 'Partes Diarios de Trabajo', description: 'Carga y revisión de horas, viajes y consumos' },
      { id: 'obras', label: 'Gestión de Obras, Legajos & Rentabilidad', description: 'Carpetas de obra, facturas, gastos y P&L' },
      { id: 'rendimientos', label: 'Rendimientos (Camiones & Máquinas)', description: 'Control de viajes, horarios, kms, tipos de carga y autonomía por carga de combustible' },
    ],
  },
  {
    key: 'combustible',
    label: 'Gestión de Combustible',
    description: 'Expendios, vales emitidos, cisternas y precios de combustible',
    parts: [
      { id: 'combustible', label: 'Expendio de Combustible (22 Cols)', description: 'Registro de cargas, tickets y odómetros' },
      { id: 'contenedores-combustible', label: 'Contenedores & Facturas Combustible', description: 'Contenedores de resúmenes/facturas de proveedor, cargas y sub-vinculación de chulengos' },
      { id: 'vales', label: 'Vales Emitidos', description: 'Emisión y rendición de vales de carga' },
      { id: 'depositos', label: 'Depósitos de Combustible', description: 'Cisternas móviles, bidones y convenios' },
      { id: 'tipos-combustible', label: 'Catálogo de Combustibles', description: 'Tipos y precios de combustibles' },
      { id: 'costos-combustible', label: 'Costos Mensuales Combustible', description: 'Resumen mensual de consumo y gasto' },
    ],
  },
  {
    key: 'stock',
    label: 'Gestión de Depósitos',
    description: 'Pañol, taller, herramientas e inventario por depósito',
    parts: [
      { id: 'stock', label: 'Depósitos e Inventario', description: 'Altas, egresos, transferencias y stock' },
    ],
  },
  {
    key: 'compras',
    label: 'Compras & Proveedores',
    description: 'Facturas de compra, cuentas corrientes de proveedores y legajos',
    parts: [
      { id: 'proveedores', label: 'Proveedores (Padrón & Ficha)', description: 'Alta, edición y consulta de proveedores' },
      { id: 'compras', label: 'Facturas de Compra & Legajos', description: 'Registro de compras, pagos y adjuntos en R2' },
    ],
  },
  {
    key: 'ventas',
    label: 'Ventas & Facturación',
    description: 'Clientes, presupuestos, facturación ARCA, alquileres, ferretería y caja',
    parts: [
      { id: 'clientes', label: 'Clientes (Padrón & Ficha)', description: 'Alta, edición y sincronización de clientes' },
      { id: 'cotizador', label: 'Cotizador & Presupuestos A4', description: 'Emisión de presupuestos y conversión' },
      { id: 'arca', label: 'Facturación ARCA (Ex-AFIP)', description: 'Emisión de comprobantes electrónicos' },
      { id: 'remitos', label: 'Remitos & Control de Entregas', description: 'Emisión de remitos digitales y seguimiento de ítems pendientes y entregados' },
      { id: 'alquileres', label: 'Gestor de Alquileres', description: 'Contratos de alquiler de equipos' },
      { id: 'cobranzas', label: 'Cobranzas & Bajar Facturas', description: 'Cobranzas de facturas y alquileres, recibos y estado de pago' },
      { id: 'cartera-cheques', label: 'Cartera de Cheques & E-Cheq', description: 'Agenda de vencimientos, clearing bancario, endosos a proveedores y rechazos' },
      { id: 'plan-cuentas', label: 'Plan de Cuentas & Bancos', description: 'Cuentas contables, saldos de bancos/caja y asientos automáticos' },
      { id: 'ferreteria', label: 'Salón de Ventas & Ferretería', description: 'Catálogo y ventas de ferretería' },
      { id: 'caja_diaria', label: 'Caja Diaria & Arqueo de Billetes', description: 'Movimientos diarios y cierre de caja' },
    ],
  },
  {
    key: 'personal',
    label: 'Personal & Asistencia',
    description: 'Nómina de choferes/operarios, liquidación de sueldos, fichadas y portal móvil',
    parts: [
      { id: 'choferes', label: 'Nómina de Empleados', description: 'Legajos de personal y costos diarios' },
      { id: 'sueldos', label: 'Liquidación de Sueldos (Google Sheets)', description: 'Planilla mensual de haberes en vivo y copia mes a mes' },
      { id: 'asistencia', label: 'Entradas & Salidas (Asistencia)', description: 'Control de fichadas diarias' },
      { id: 'portal-chofer', label: 'App Chofer (Cargar Parte Móvil)', description: 'Vista simplificada de carga en campo' },
    ],
  },
  {
    key: 'documentos',
    label: 'Documentos & Comprobantes',
    description: 'Captura móvil de fotos optimizadas y vinculación a partes diarios o expendios',
    parts: [
      { id: 'bolsa-documentos', label: 'Bolsa de Documentos (Cámara Móvil)', description: 'Sacar fotos desde el celular, optimizar peso y vincular a partes o combustible' },
    ],
  },
  {
    key: 'configuracion',
    label: 'Configuración (Web & Usuarios)',
    description: 'Administración de usuarios, permisos de módulos y página web pública',
    parts: [
      { id: 'config-usuarios', label: 'Usuarios y Permisos de Acceso', description: 'Crear usuarios y definir acceso por módulo/parte' },
      { id: 'config-web-logo', label: 'Web: Logo & Identidad de Marca', description: 'Logos claro/oscuro, nombre y eslogan' },
      { id: 'config-web-contacto', label: 'Web: Teléfonos, WhatsApp & Horarios', description: 'Canales de atención, mapa y redes' },
      { id: 'config-web-textos', label: 'Web: Editor de Textos (CMS)', description: 'Títulos y textos de la página web' },
      { id: 'config-web-servicios', label: 'Web: Servicios & Fotos', description: 'Catálogo comercial y galerías web' },
      { id: 'config-web-secciones', label: 'Web: Orden de Secciones', description: 'Visibilidad y orden del sitio público' },
      { id: 'config-web-equipos', label: 'Web: Equipos Publicados en Web', description: 'Orden de máquinas visibles al público' },
    ],
  },
];

export const ALL_PERMISSION_VIEW_IDS: string[] = SYSTEM_PERMISSION_MODULES.flatMap(m =>
  m.parts.map(p => p.id)
);

export const CONFIG_WEB_VIEW_TO_TAB: Record<
  string,
  'logo' | 'usuarios' | 'contacto' | 'textos' | 'servicios' | 'secciones' | 'equipos'
> = {
  'config-usuarios': 'usuarios',
  'config-web-logo': 'logo',
  'config-web-contacto': 'contacto',
  'config-web-textos': 'textos',
  'config-web-servicios': 'servicios',
  'config-web-secciones': 'secciones',
  'config-web-equipos': 'equipos',
};

export function getDefaultPermissionsForRole(rol: UserRole): {
  accesoTotal: boolean;
  permisos: string[];
} {
  switch (rol) {
    case 'SUPER_ADMIN':
      return { accesoTotal: true, permisos: [...ALL_PERMISSION_VIEW_IDS] };
    case 'ADMINISTRADOR':
      return { accesoTotal: true, permisos: [...ALL_PERMISSION_VIEW_IDS] };
    case 'ENCARGADO_OBRA':
      return {
        accesoTotal: false,
        permisos: [
          'flota',
          'services',
          'alertas-mantenimiento',
          'programacion-audio',
          'pizarra-despacho',
          'partes-diarios',
          'obras',
          'rendimientos',
          'combustible',
          'contenedores-combustible',
          'vales',
          'depositos',
          'alquileres',
          'choferes',
          'asistencia',
          'bolsa-documentos',
        ],
      };
    case 'OPERARIO_CHOFER':
      return {
        accesoTotal: false,
        permisos: ['portal-chofer', 'partes-diarios', 'bolsa-documentos'],
      };
    case 'VENTAS_FERRETERIA':
      return {
        accesoTotal: false,
        permisos: ['clientes', 'cotizador', 'arca', 'remitos', 'alquileres', 'cobranzas', 'cartera-cheques', 'plan-cuentas', 'ferreteria', 'caja_diaria', 'stock'],
      };
    default:
      return { accesoTotal: false, permisos: [] };
  }
}

type PermissionSubject = Pick<SystemUser | UserSession, 'rol' | 'permisos' | 'accesoTotal' | 'username'> | null | undefined;

export function getEffectivePermissions(user: PermissionSubject): string[] {
  if (!user) return [];
  if (user.username === 'ideasinfernal' || user.rol === 'SUPER_ADMIN' || user.accesoTotal) {
    return ALL_PERMISSION_VIEW_IDS;
  }
  if (Array.isArray(user.permisos)) {
    return user.permisos;
  }
  return getDefaultPermissionsForRole(user.rol).permisos;
}

export function hasViewAccess(user: PermissionSubject, viewId: string): boolean {
  if (!user) return false;
  if (user.username === 'ideasinfernal' || user.rol === 'SUPER_ADMIN' || user.accesoTotal) {
    return true;
  }
  const effective = getEffectivePermissions(user);
  if (viewId === 'remitos' && (effective.includes('arca') || effective.includes('ferreteria'))) {
    return true;
  }
  return effective.includes(viewId);
}

export function hasModuleAccess(user: PermissionSubject, viewIds: string[]): boolean {
  return viewIds.some(v => hasViewAccess(user, v));
}

export function getDefaultViewForUser(user: PermissionSubject): string {
  const effective = getEffectivePermissions(user);
  if (effective.length === 0) return 'sin-acceso';

  const preferredOrder = [
    'flota',
    'pizarra-despacho',
    'obras',
    'partes-diarios',
    'alquileres',
    'cotizador',
    'arca',
    'ferreteria',
    'caja_diaria',
    'combustible',
    'stock',
    'compras',
    'choferes',
    'bolsa-documentos',
    'portal-chofer',
    'config-usuarios',
  ];

  for (const candidate of preferredOrder) {
    if (effective.includes(candidate)) return candidate;
  }
  return effective[0];
}
