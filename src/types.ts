export type VehicleStatus = 
  | 'DISPONIBLE'
  | 'ALQUILADO'
  | 'EN_MANTENIMIENTO'
  | 'TALLER'
  | 'RESERVADO'
  | 'FUERA_DE_SERVICIO';

export type EquipmentCategory = 
  | 'VIAL_PESADA'           // Minicargadoras, Retroexcavadoras, Camiones, Rodillos, Palas
  | 'HERRAMIENTA_MENOR'     // Rotomartillos, Chanchas/Compactadoras, Hormigoneras, Grupos Electrógenos
  | 'EVENTOS_GASTRONOMIA'   // Freezers, Heladeras, Hornos pizzeros, Pancheras, Freidoras
  | 'TRANSPORTE'           // Camiones volcadores, Chasis c/ hidrogrúa, Utilitarios
  | 'VEHICULOS_TERCEROS'   // Vehículos y maquinarias subcontratados / de terceros
  | 'OTRO';

export type VehicleClassification =
  // 7 Clasificaciones Simplificadas Oficiales:
  | 'Herramientas Eléctricas'
  | 'Vehículos / Camionetas'
  | 'Camiones'
  | 'Acoplados / Carretones'
  | 'Máquinas'
  | 'Equipamiento Gastronómico'
  | 'Vehículos de Terceros'
  // Clasificaciones previas para compatibilidad:
  | 'Minicargadora'
  | 'Camión Volcador'
  | 'Camión Chasis / Grúa'
  | 'Retroexcavadora'
  | 'Excavadora de Orugas'
  | 'Pala Cargadora Frontal'
  | 'Rodillo Compactador'
  | 'Autoelevador / Clark'
  | 'Manipulador Telescópico'
  | 'Grupo Electrógeno / Compresor'
  | 'Plataforma Elevadora'
  | 'Rotomartillo / Demoledor'
  | 'Chancha / Vibrocompactador'
  | 'Hormigonera / Trompito'
  | 'Freezer / Pozo de Frío'
  | 'Heladera Comercial / Exhibidora'
  | 'Horno Pizzero / Convector'
  | 'Panchera / Gastronomía'
  | 'Herramienta Menor'
  | 'Otro'
  | string;

export type RentalModality = 'DIAS' | 'HORAS' | 'AMBOS';

export type VehicleFixedExpenseFrequency = 'MENSUAL' | 'QUINCENAL' | 'SEMANAL' | 'ANUAL' | 'UNICO';

export type VehicleFixedExpenseCategory =
  | 'LAVADERO'
  | 'SEGURO'
  | 'PATENTE'
  | 'GPS_RASTREO'
  | 'COCHERA'
  | 'FINANCIERO'
  | 'MANTENIMIENTO_FIJO'
  | 'OTRO';

export interface VehicleFixedExpense {
  id: string;
  concepto: string; // ej: "Lavadero semanal", "Seguro Todo Riesgo", "GPS Rastreo"
  categoria: VehicleFixedExpenseCategory;
  monto: number;
  frecuencia: VehicleFixedExpenseFrequency;
  fechaInicio: string; // YYYY-MM (mes de inicio de vigencia)
  fechaFin?: string; // YYYY-MM opcional (si se deja vacío, se repite todos los meses)
  activo: boolean;
  observaciones?: string;
  createdAt?: string;
}

export type VehicleSalePriceOrigin =
  | 'MANUAL'
  | 'RESUMEN_VALORIZADO'
  | 'CONTRATO_ALQUILER'
  | 'FACTURA_ARCA'
  | 'PARTE_DIARIO';

export type VehicleSalePriceUnit = 'HORA' | 'DIA' | 'VIAJE';

export interface VehicleSalePriceEntry {
  id: string;
  fechaDesde: string; // YYYY-MM-DD (vigente desde esta fecha hacia adelante)
  precioUnitario: number;
  unidad: VehicleSalePriceUnit;
  origen: VehicleSalePriceOrigin;
  documentoRef?: string; // ej: "Resumen #0001.381", "ALQ-0006", "FACT A 0007-00000006"
  nota?: string;
  createdAt?: string;
}

export type VehicleDocumentPricePolicy = 'DOCUMENTO' | 'GENERAL' | 'MANUAL_POR_DOC';

export interface VehicleSueldosConfig {
  modoCalculoSueldos?: 'LIQUIDACION_TOTAL' | 'LIQUIDACION_BASICO' | 'JORNAL_BASE_SHEET' | 'REFERENCIA_MANUAL';
  diasLaborablesMes?: number;
  sueldoMensualDefault?: number;
  tarifasEmpleadoOverride?: Record<string, { costoPorDia?: number; costoPorHora?: number; modo?: 'DIA' | 'HORA' }>;
  itemsExcluidosIds?: string[];
}

export interface Vehicle {
  id: string; // e.g., "EQ-001" or "MINI-01"
  modeloMarca: string; // e.g., "Bobcat S570"
  patente: string; // e.g., "AF 123 CD" o "S/P (HERRAMIENTA)"
  codigoInterno: string; // e.g., "LH-MQ-2024-001"
  fotografia: string; // URL / base64 image
  precioCosto: number; // Costo por día o base
  precioSugerido: number; // Precio sugerido por día o base
  precioCostoHora?: number; // Costo por hora
  precioSugeridoHora?: number; // Precio sugerido por hora
  modalidadTarifa?: RentalModality; // 'DIAS' | 'HORAS' | 'AMBOS'
  clasificacion: VehicleClassification;
  categoriaEquipo?: EquipmentCategory; // Nueva categorización estructural
  estado: VehicleStatus;
  
  // Publicación en Web Comercial y visualización de precios
  publicarEnWeb?: boolean; // Determina si sale en el catálogo público
  mostrarPrecioAlquiler?: boolean; // Si es false, muestra 'Consultar Precio'
  incluyeOperario?: boolean; // Si la maquinaria opera con conductor asignado
  ordenVisibilidad?: number; // Orden de visualización en la página web pública (1, 2, 3...)
  descripcionCorta?: string;
  especificaciones?: string[];
  
  // Campos complementarios útiles para alquiler
  horometro?: number; // Horas de motor actuales
  odometro?: number; // Kilometraje actual para camiones/vehículos
  anio?: number; // Año de fabricación
  combustible?: 'Diesel' | 'Nafta' | 'Eléctrico' | 'GLP' | '220V / Eléctrico' | 'Manual / Sin Motor';
  ubicacionActual?: string; // "Base Central - Salón de Alquiler", "Obra Nordelta", etc.
  observaciones?: string;
  fechaAlta: string; // ISO date string
  fechaUltimoMantenimiento?: string;
  mostrarEnDashboard?: boolean; // Control whether shown in CombustibleVsTrabajoDashboard
  archivado?: boolean; // Si es true, el vehículo está archivado (fuera de la flota activa de la empresa)
  fechaArchivado?: string; // Fecha en que se archivó
  motivoArchivado?: string; // Motivo opcional (ej: Vendido, Baja definitiva, Fin de contrato)

  // Gastos Fijos Recurrentes, Historial de Precios de Venta, Política de Documentos y Sueldos
  gastosFijosRecurrentes?: VehicleFixedExpense[];
  historialPreciosVenta?: VehicleSalePriceEntry[];
  politicaPrecioDocumentos?: VehicleDocumentPricePolicy;
  overridesPrecioDocumentos?: Record<string, 'GENERAL' | 'DOCUMENTO'>;
  sueldosConfig?: VehicleSueldosConfig;

  // Retrocompatibilidad con vistas y modales complementarios
  codigoEquipo?: string;
  codigo?: string;
  marca?: string;
  modelo?: string;
}

// ==================== GESTOR DE ALQUILERES & CONTRATOS ====================
export type RentalContractStatus = 
  | 'ACTIVO'              // En obra / En uso por el cliente
  | 'PENDIENTE_ENTREGA'   // Reservado / Preparando en base
  | 'FINALIZADO'          // Devuelto y liquidado
  | 'CANCELADO';

export type RentalAttachmentCategory =
  | 'FOTO_SALIDA'
  | 'CONTRATO_FIRMADO'
  | 'HOROMETRO_TABLERO'
  | 'DOCUMENTACION_CLIENTE'
  | 'ESTADO_DEVOLUCION'
  | 'OTRO';

export interface RentalAttachment {
  id: string;
  url: string;
  nombre: string;
  categoria: RentalAttachmentCategory;
  tipoArchivo: 'IMAGE' | 'PDF' | 'DOC';
  nota?: string;
  originalSizeKB?: number;
  optimizedSizeKB?: number;
  reductionPercentage?: number;
  fechaSubida: string;
}

export interface RentalContract {
  id: string; // ej: "ALQ-2026-001"
  numeroContrato: string; // ej: "ALQ-0001"
  titulo?: string; // Título / referencia opcional del contrato (ej: "1era Quincena de Enero")
  numero?: string;
  obraDestino?: string;
  totalGeneral?: number;
  fechaInicio: string; // ISO String o YYYY-MM-DD
  horaInicio?: string; // ej: "08:00"
  fechaFinEstimada: string;
  horaFinEstimada?: string;
  fechaDevolucionReal?: string;
  horaDevolucionReal?: string;
  
  modalidad: 'DIAS' | 'HORAS';
  duracion: number; // Cantidad de días o de horas
  
  // Vinculación con Cotización, Facturación ARCA, Partes Diarios y Cobranzas
  cotizacionId?: string; // ej: "COT-0007-00000003"
  cotizacionNumero?: string; // ej: "0007-00000003"
  facturaId?: string; // ej: "ARCA-0007-00000005"
  facturaNumero?: string; // ej: "0007-00000005"
  facturasIds?: string[]; // Múltiples facturas ARCA vinculadas al contrato
  partesDiariosIds?: string[]; // Partes diarios vinculados a este contrato de alquiler
  estadoFacturacion?: 'SIN_FACTURAR' | 'FACTURADO_PARCIAL' | 'FACTURADO' | 'NO_FACTURADO';
  estadoCobro?: 'PENDIENTE_PAGO' | 'COBRADO_PARCIAL' | 'PAGADO' | 'PARCIAL';
  montoCobrado?: number;
  fechaCobro?: string;
  formaPagoCobro?: string;
  reciboCobroNumero?: string;

  // Equipo vinculado
  equipoId: string;
  equipoCodigo?: string; // N° de equipo (ej: "EQ-043" o "43")
  equipoCodigoInterno?: string; // Código interno (ej: "INT-43" o "43")
  equipoModelo: string;
  equipoPatenteOrCodigo?: string;
  equipoCategoria: EquipmentCategory;
  
  // Operario vinculado de nómina de empleados
  operarioId?: string;
  operarioNombre?: string;
  operarioIncluido: boolean;
  
  // Datos del Cliente & Fiscales (Ordenados 1:1 con Cotizador y ARCA)
  clienteNombre: string; // Razón Social / Apellido y Nombre
  clienteDocumento?: string; // CUIT o DNI
  clienteCondicionIva?: ArcaCondicionIva | string; // RESPONSABLE_INSCRIPTO, MONOTRIBUTO, CONSUMIDOR_FINAL, EXENTO
  condicionVenta?: string; // CONTADO / TRANSFERENCIA / CTA CTE
  clienteTelefono: string;
  clienteEmail?: string;
  direccionObra: string; // Domicilio Fiscal / Ubicación de Obra
  localidadObra?: string; // Localidad (ej: SAN SALVADOR DE JUJUY)
  zonaObra?: string; // Zona / Barrio
  
  // Desglose de Importes, Ítems y Precios Fiscales
  items?: QuotationItem[]; // Ítems detallados compatibles con Cotizador y Factura ARCA
  tarifaEquipoUnitaria: number; // Por día o por hora
  subtotalEquipo: number;
  tarifaOperarioUnitaria: number;
  subtotalOperario: number;
  costoTrasladoFlete: number;
  depositoGarantia: number;
  descuento: number;
  subtotalNeto?: number;
  alicuotaIva?: number; // 21, 10.5, 0
  ivaTotal?: number;
  percepcionIibb?: number;
  totalAlquiler: number;
  moneda?: 'ARS' | 'USD';
  cotizacionDolar?: number;
  
  // Control de estado y entregas
  estado: RentalContractStatus;
  horometroSalida?: number;
  horometroEntrada?: number;
  condicionEntrega?: string;
  observaciones?: string;
  
  // Fotos de salida, contrato firmado y documentos adjuntos (almacenados en Cloudflare R2)
  adjuntos?: RentalAttachment[];

  creadoPor?: string;
  fechaCreacion?: string;
}

export interface RentalContractStats {
  total: number;
  activos: number;
  pendientes: number;
  finalizados: number;
  facturacionTotal: number;
  facturacionActiva: number;
}

// ==================== FERRETERÍA INDUSTRIAL & SALÓN DE VENTAS ====================
export type HardwareCategory = 
  | 'HERRAMIENTAS_MANO'
  | 'HERRAMIENTAS_ELECTRICAS'
  | 'BULONERIA_FIJACIONES'
  | 'CONSTRUCCION_PALAS'
  | 'SEGURIDAD_EPP'
  | 'DISCOS_ABRASIVOS'
  | 'PINTURAS_QUIMICOS'
  | 'ELECTRICIDAD_ILUMINACION'
  | 'PLOMERIA_ACCESORIOS';

export interface SalonGrupo {
  id: string;
  codigo: string; // 3 dígitos (ej: '001')
  nombre: string;
}

export interface SalonFamilia {
  id: string;
  codigo: string; // 3 dígitos (ej: '001')
  nombre: string;
  grupos: SalonGrupo[];
}

export interface SalonUnidadValor {
  id: string;
  nombre: string; // ej: '1/2"', '3/4"', 'Caja x 10', '4.5"'
}

export interface SalonUnidadMedida {
  id: string;
  nombre: string; // ej: 'Medida / Pulgadas', 'Diámetro', 'Presentación'
  abreviatura?: string;
  valores: SalonUnidadValor[];
}

export interface SalonSubsector {
  id: string;
  nombre: string;
}

export interface SalonSector {
  id: string;
  nombre: string;
  subsectores: SalonSubsector[];
}

export interface SalonPriceList {
  id: string;
  nombre: string; // ej: 'Lista Público (Mostrador)', 'Lista Mayorista', 'Lista Contratista'
  margenPorcentaje: number; // % sobre Costo Unitario
  activa: boolean;
  esPredeterminada?: boolean;
}

export interface SalonVentasConfig {
  familias: SalonFamilia[];
  unidadesMedida: SalonUnidadMedida[];
  sectores: SalonSector[];
  marcas: string[];
  listasPrecios: SalonPriceList[];
}

export interface HardwareProduct {
  id: string; // ej: "FERR-..."
  codigo: string; // ej: "00100200004" o "00100200004-01"
  codigoBase?: string; // 11 dígitos: 3 Familia + 3 Grupo + 5 Producto (ej: "00100200004")
  codigoVariable?: string; // 2 dígitos tras guión (ej: "01", "02")
  codigoDeBarras?: string;
  codigoInterno?: string;
  codigoProveedor?: string;
  familiaId?: string;
  familiaCodigo?: string; // 3 dígitos (ej: 001)
  familiaNombre?: string;
  grupoId?: string;
  grupoCodigo?: string; // 3 dígitos (ej: 002)
  grupoNombre?: string;
  sku?: string; // alias del código estructurado
  sectorId?: string;
  sector?: string;
  subsectorId?: string;
  subsector?: string;
  proveedoresIds?: string[];
  proveedoresNombres?: string[];
  unidadesMedidaMultiples?: string[];
  varianteDetalle?: string; // ej: '1/2" · Caja x 10'
  unidadesSeleccionadas?: Array<{
    unidadId: string;
    unidadNombre: string;
    valorId: string;
    valorNombre: string;
  }>;
  preciosPorLista?: Record<string, number>; // map listaId -> precio calculado
  listasDePrecios?: {
    lista1: number;
    lista2: number;
    lista3: number;
    margenPorcentaje?: number;
  };
  nombre: string; // Descripción principal
  categoria: HardwareCategory; // Derivada internamente para compatibilidad web pública
  marca?: string;
  descripcion: string; // Descripción adicional
  descripcionAdicional?: string;
  precioVenta: number; // PVP calculado desde precioCosto + lista predeterminada
  precioCosto?: number; // Único precio cargado manualmente: Costo Unitario / Precio Base
  stockActual: number;
  stockMinimoAlerta?: number;
  unidadMedida: string;
  foto: string;
  fotoMeta?: {
    originalSizeKB?: number;
    optimizedSizeKB?: number;
    reductionPercentage?: number;
  };
  publicarEnWeb: boolean;
  destacado?: boolean;
}

// ==================== VENTA DE ÁRIDOS & MATERIALES ====================
export interface AridoProduct {
  id: string;
  nombre: string;
  tipo: 'Arena' | 'Piedra' | 'Tosca' | 'Tierra' | 'Cascote' | 'Ripio';
  precioPorM3: number;
  precioPorBolsom?: number;
  unidad: string; // 'm³', 'Camionada 8m³', 'Bolsón 1m³'
  stockDisponibleM3: number;
  foto: string;
  descripcion: string;
  pedidoMinimo?: string;
  publicarEnWeb: boolean;
}

// ==================== SERVICIOS DE MOVIMIENTO DE SUELO ====================
export interface SoilService {
  id: string;
  titulo: string;
  descripcion: string;
  categoria?: string; // 'Movimiento de Suelo' | 'Nivelación' | 'Demolición' | 'Zanjeo y Servicios' | 'Limpieza de Terrenos'
  equiposUtilizados: string[];
  incluyeOperador: boolean;
  unidadCotizacion: string; // 'Por m³ / Por jornada / A presupuesto'
  foto: string;
  fotosGaleria?: string[];
  publicarEnWeb: boolean;
  ventajas: string[];
  orden?: number;
}

// ==================== USUARIOS & AUTENTICACIÓN ====================
export type UserRole = 
  | 'SUPER_ADMIN'
  | 'ADMINISTRADOR'
  | 'ENCARGADO_OBRA'
  | 'OPERARIO_CHOFER'
  | 'VENTAS_FERRETERIA';

export interface SystemUser {
  id: string;
  username: string;
  password: string;
  nombre: string;
  email: string;
  rol: UserRole;
  telefono?: string;
  activo: boolean;
  permisos?: string[];
  accesoTotal?: boolean;
  ultimoAcceso?: string;
  createdAt: string;
}

export interface UserSession {
  id: string;
  username?: string;
  nombre: string;
  email: string;
  rol: UserRole;
  permisos?: string[];
  accesoTotal?: boolean;
  avatar?: string;
  token?: string;
  fechaIngreso?: string;
}

// ==================== CONFIGURACIÓN DE SITIO WEB Y EMPRESA ====================
export interface WebSectionConfig {
  id: string;
  nombre: string;
  visible: boolean;
  orden: number;
}

export interface SiteSettings {
  // Logo & Branding
  customLogoUrl: string; // General / Fallback
  customLogoUrlDark?: string; // Versión para fondos oscuros (ERP, Navbar, Headers)
  customLogoUrlLight?: string; // Versión para fondos claros (Impresiones, Reportes, Documentos)
  customLogoUrlIcon?: string; // Versión Isotipo / Mascota / Ícono cuadrado
  heroBannerUrl?: string; // Banner de cabecera ancho completo editable
  logoIncludeText?: boolean; // Si es false, los logos son solo imagen pura sin texto extra
  companyName: string;
  slogan: string;
  
  // Contacto & Ubicación
  telefonoPrincipal: string;
  telefonoGuardia: string;
  whatsapp: string;
  email: string;
  direccion: string;
  googleMapsUrl: string;
  
  // Horarios de Atención
  horarioSemana: string;
  horarioSabados: string;
  horarioDomingos: string;
  
  // Redes Sociales
  instagram: string;
  facebook: string;
  linkedin: string;
  
  // Textos Editables de la Web (CMS en Vivo)
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;
  
  flotaTitle: string;
  flotaSubtitle: string;
  
  herramientasTitle?: string;
  herramientasSubtitle?: string;
  
  eventosTitle?: string;
  eventosSubtitle?: string;
  
  serviciosTitle: string;
  serviciosSubtitle: string;
  
  aridosTitle?: string;
  aridosSubtitle?: string;
  
  ferreteriaTitle: string;
  ferreteriaSubtitle: string;
  
  nosotrosTitle: string;
  nosotrosSubtitle: string;
  nosotrosTexto1: string;
  nosotrosTexto2: string;
  nosotrosFotoUrl?: string;
  
  contactoTitle: string;
  contactoSubtitle: string;
  
  ctaBannerTitle: string;
  ctaBannerSubtitle: string;
  ctaBannerBoton: string;
  
  footerText: string;
  
  // Orden y visibilidad de secciones
  secciones: WebSectionConfig[];
}

export type TableColumnKey =
  | 'fotografia'
  | 'id'
  | 'modeloMarca'
  | 'anio'
  | 'patente'
  | 'codigoInterno'
  | 'clasificacion'
  | 'precioCosto'
  | 'precioSugerido'
  | 'estado'
  | 'horometro'
  | 'ubicacionActual'
  | 'fechaAlta'
  | 'ordenVisibilidad'
  | 'publicarEnWeb';

export interface GenericColumnDefinition<T extends string = string> {
  key: T;
  label: string;
  shortLabel?: string;
  description: string;
  defaultVisible: boolean;
  required?: boolean;
  category?: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface TableColumnConfig<T extends string = string> {
  order: T[];
  visible: Record<T, boolean>;
}

export type TableDensity = 'normal' | 'compact' | 'ultra';

export type ColumnDefinition = GenericColumnDefinition<TableColumnKey>;

export interface FleetStats {
  total: number;
  disponibles: number;
  alquilados: number;
  enMantenimiento: number;
  reservados: number;
  fueraDeServicio: number;
  valorFlotaCostoTotal: number;
  potencialFacturacionDiaria: number;
}

export type EmployeeStatus = 
  | 'ACTIVO'
  | 'EN_OBRA'
  | 'LICENCIA'
  | 'INACTIVO';

export type DriverStatus = EmployeeStatus;

export interface Employee {
  id: string; // ID
  codigoEmpleado: string; // CODIGO_EMPLEADO
  nombreApellido: string; // NOMBRE_APELLIDO
  legajo: string; // LEGAJO
  categoria: string; // CATEGORIA
  foto: string; // FOTO
  sector: string; // SECTOR
  obra: string; // OBRA
  estado: EmployeeStatus; // ESTADO

  // Campos complementarios de contacto e integración operativa
  dni?: string;
  cuit?: string;
  telefono?: string;
  email?: string;
  vehiculoAsignadoId?: string; // ID de Máquina / Equipo de la flota asignado
  fechaAlta?: string;
  costoPorDia?: number;
  costoPorHora?: number;
  observaciones?: string;
  mostrarEnAsistencia?: boolean; // Controla si el empleado aparece en el módulo de Entradas y Salidas
  archivado?: boolean; // Si fue archivado (ya no trabaja activo pero conserva su historial)
  fechaArchivado?: string;

  // Retrocompatibilidad
  nombre?: string;
  cargo?: string;
}

// Alias Driver to Employee for seamless compatibility
export type Driver = Employee;

export interface EmployeeStats {
  total: number;
  activos: number;
  enObra: number;
  enLicencia: number;
  inactivos: number;
}

export type DriverStats = EmployeeStats;

// ==================== EXPENDIO DE COMBUSTIBLE ====================

export type FuelVoucherStatus = 
  | 'CARGADO'
  | 'EMITIDO'
  | 'RENDIDO'
  | 'PENDIENTE'
  | 'ANULADO';

export type FuelType = 
  | 'Diesel 500 (Grado 2)'
  | 'Infinia Diesel (Grado 3)'
  | 'Euro Diesel'
  | 'Nafta Súper'
  | 'Nafta Premium'
  | 'GNC / GLP'
  | 'Biodiesel';

export type FuelLoadType =
  | 'Tanque Lleno'
  | 'Carga Parcial'
  | 'Bidón Auxiliar'
  | 'Cisterna Móvil'
  | 'Grupo Electrógeno'
  | 'Carga de Emergencia';

/**
 * Registro oficial de Expendio de Combustible (22 Columnas exactas)
 * 1. ID
 * 2. CARGA
 * 3. TIPO
 * 4. ID_COMBUSTIBLE
 * 5. DEPOSITO
 * 6. CANTIDAD
 * 7. TIPO_COMB
 * 8. CODIGO_EMPLEADO
 * 9. NOMBRE_APELLIDO
 * 10. LEGAJO
 * 11. CODIGO_EQUIPO
 * 12. MARCA_MODELO
 * 13. PATENTE
 * 14. Nº DE ORDEN
 * 15. FECHA
 * 16. KILOMETRAJE
 * 17. HORA
 * 18. KILOMETROS_REC
 * 19. AUTONOM
 * 20. NUM_ESTACION
 * 21. FOTO_EXPENDIO
 * 22. FOTO_KILOMETRAJE
 */
export interface FuelDispensary {
  id: string; // 1. ID (ej: "faa9f1c3")
  carga?: string; // 2. CARGA (ej: "Tanque Lleno", "Carga Parcial", "Bidón", etc.)
  tipo: string; // 3. TIPO (ej: "EGRESO", "INGRESO")
  idCombustible?: string; // 4. ID_COMBUSTIBLE (ej: "COMB-INF-D", "COMB-D500")
  deposito: string; // 5. DEPOSITO (ej: "ESTACION DE SERV", "DIESEL 500")
  depositoId?: string; // ID interno del Depósito de Combustible (ej: "DEP-AMB-01")
  cantidad: number; // 6. CANTIDAD (Litros)
  cantCarga?: number; // CANT_CARGA (ej: -117.78 o 145.61)
  tipoComb: string; // 7. TIPO_COMB (ej: "DIESEL INFINIA", "DIESEL COMUN", "NAFTA SUPER")
  codigoEmpleado: string; // 8. CODIGO_EMPLEADO (ej: "DANIEL GARCIA", "ANDRES ACOSTA")
  nombreApellido?: string; // 9. NOMBRE_APELLIDO (ej: "Daniel García")
  legajo?: string; // 10. LEGAJO (ej: "LEG-7512")
  codigoEquipo: string; // 11. CODIGO_EQUIPO (ej: "MERCEDES BENZ 1720 - 15", "NISSAN 4X2")
  marcaModelo?: string; // 12. MARCA_MODELO (ej: "Mercedes-Benz Actros 2645 Batea")
  patente?: string; // 13. PATENTE (ej: "AD 456 EF")
  numOrden?: string; // 14. Nº DE ORDEN (ej: "02623")
  fecha: string; // 15. FECHA (ej: "2026-08-31" o "31/8/2026")
  kilometraje?: number; // 16. KILOMETRAJE / KMS_HS (ej: 317958)
  kmsHs?: number; // KMS/HS
  hora?: string; // 17. HORA (ej: "07:15")
  kilometrosRec?: number; // 18. KILOMETROS_REC (ej: 537)
  autonomiaVt?: string; // AUTONOMIA_VT (ej: "04,56", "00,25")
  autonom?: string; // 19. AUTONOM (ej: "4,56", "3,93")
  numEstacion?: string; // 20. NUM_ESTACION (ej: "48-56047")
  fotoExpendio?: string; // 21. FOTO_EXPENDIO (URL o base64)
  fotoKilometraje?: string; // 22. FOTO_KILOMETRAJE (URL o base64)
  clasificacion?: string; // CLASIFICACION (ej: "CAMIONES", "AUTOS/CAMIONETAS", "MAQUINAS")

  // Campos adicionales operativos y de trazabilidad
  estado?: FuelVoucherStatus;
  numComprobante?: string;
  numVale?: string; // Número de vale vinculado (ej: "VAL-2026-000851")
  valeId?: string; // ID interno del vale vinculado (ej: "VAL-001")
  numTicket?: string; // Número de ticket anotado de la estación (ej: "TK-0084-00192842")
  litrosAutorizados?: number; // Litros que autorizaba el vale
  diferenciaLitros?: number; // Diferencia entre litros reales y autorizados
  empresa?: string;
  precioUnitario?: number;
  totalImporte?: number;
  observaciones?: string;
  empleado?: string;
  combustible?: string;
  tipoCarga?: string;
  fechaEmision?: string;
  horaEmision?: string;
  horometroOdometro?: number;
  despachante?: string;
  obraId?: string;
  obraNombre?: string;
}

export type FuelVoucher = FuelDispensary;

/**
 * Vale de Combustible Emitido (Circuito de Entrega a Chofer -> Carga en Estación -> Rendición con Ticket)
 */
export type IssuedVoucherStatus = 'EMITIDO' | 'RENDIDO' | 'ANULADO';

export interface IssuedFuelVoucher {
  id: string; // ej: "VAL-001"
  numVale: string; // ej: "02627" o "VAL-2026-000851"
  numComprobante?: string; // ej: "02627" (NUM. COMPROBANTE)
  fechaEmision: string; // ej: "2026-09-01" o "1/9/2026"
  fecha?: string;
  horaEmision?: string; // ej: "07:30"
  codigoEquipo: string; // ej: "NISSAN 4X2", "MERCEDES BENZ 1720 - 15"
  marcaModelo?: string; // ej: "Nissan Frontier 4x2"
  patente?: string; // ej: "AD 456 EF"
  codigoEmpleado?: string; // ej: "CH-204"
  nombreApellido: string; // ej: "ANDRES ACOSTA"
  legajo?: string; // ej: "LEG-7512"
  tipoComb: string; // ej: "DIESEL INFINIA", "DIESEL COMUN", "NAFTA SUPER"
  idCombustible?: string; // ej: "COMB-INF-D"
  litrosAutorizados?: number; // Litros solicitados o cupo estimado
  cantidad?: number; // ej: 57.87 (CANTIDAD DESPACHADA)
  tipoCarga?: string; // ej: "Tanque Lleno Autorizado", "Carga Parcial 100L", "Bidones"
  estacionSurtidor?: string; // ej: "Surtidor YPF Ruta 8 km 52 (Pilar)"
  numEstacion?: string; // ej: "48-56067" (NUM_ESTACION)
  odometroSalida?: number; // Odómetro al momento de emitir el vale
  estado: IssuedVoucherStatus; // 'RENDIDO' | 'EMITIDO' | 'ANULADO'
  observaciones?: string;
  
  // Datos completados automáticamente cuando se rinde con el Ticket en Expendio:
  fechaRendicion?: string;
  horaRendicion?: string;
  expendioId?: string; // ID del registro de expendio generado (ej: "EXP-001")
  numTicket?: string; // Número de ticket de la estación anotado (ej: "TK-0084-00192842")
  litrosReales?: number; // Litros reales despachados según ticket
  odometroCarga?: number; // Odómetro real anotado en el ticket
  importeTotal?: number;
  precioUnitario?: number;
  diferenciaLitros?: number; // litrosReales - litrosAutorizados
  fotoTicket?: string;
  fotoOdometro?: string;
}

// ==================== CONTENEDORES DE COMBUSTIBLE & SUB-VINCULACIONES ====================

export type FuelContainerStatus = 'ABIERTO' | 'CONCILIADO' | 'PAGADO' | 'CERRADO';

export type FuelContainerDocTipo =
  | 'FACTURA'
  | 'RESUMEN_PROVEEDOR'
  | 'REMITO'
  | 'COMPROBANTE_PAGO'
  | 'OTRO';

export interface FuelContainerAdjunto {
  id: string;
  nombre: string;
  tipoDocumento: FuelContainerDocTipo;
  url: string;
  mimeType?: string;
  fechaSubida: string;
  notas?: string;
}

export interface FuelContainerInvoiceRef {
  id: string;
  purchaseInvoiceId?: string;
  tipoComprobante: string;
  numeroComprobante: string;
  fecha: string;
  proveedorNombre: string;
  litrosFacturados?: number;
  importeTotal: number;
  adjuntoUrl?: string;
  adjuntoNombre?: string;
  observaciones?: string;
}

export interface FuelContainerSubLink {
  parentVoucherId: string;
  childVoucherIds: string[];
  notas?: string;
}

export interface FuelContainer {
  id: string;
  codigo: string;
  titulo: string;
  proveedorId?: string;
  proveedorNombre: string;
  estacionConvenio?: string;
  fechaDesde: string;
  fechaHasta: string;
  estado: FuelContainerStatus;
  litrosResumenProveedor?: number;
  importeResumenProveedor?: number;
  voucherIds: string[];
  subLinks: FuelContainerSubLink[];
  facturas: FuelContainerInvoiceRef[];
  adjuntos: FuelContainerAdjunto[];
  observaciones?: string;
  createdAt: string;
  updatedAt?: string;
}


export type IssuedVoucherColumnKey =
  | 'numVale'
  | 'estado'
  | 'fechaEmision'
  | 'codigoEquipo'
  | 'patente'
  | 'nombreApellido'
  | 'tipoComb'
  | 'litrosAutorizados'
  | 'estacionSurtidor'
  | 'numTicket'
  | 'litrosReales'
  | 'diferenciaLitros'
  | 'fechaRendicion';

export interface IssuedVoucherStats {
  totalVales: number;
  emitidos: number; // Pendientes de rendir
  rendidos: number; // Con ticket cargado
  anulados: number;
  totalLitrosAutorizados: number;
  totalLitrosRendidos: number;
}

export interface FuelVoucherStats {
  totalVales: number;
  totalLitros: number;
  cargados: number;
  emitidos: number;
  pendientes: number;
  anulados: number;
  costoTotalEstimado: number;
  promedioRendimiento?: string;
}

/**
 * 3 Modalidades exclusivas de la empresa para Depósitos de Carga:
 * 1. DEPOSITO_AMBULANTE: Cisterna móvil sobre camión/carretón
 * 2. BIDONES: Stock de bidones homologados de 20L / 50L en pañol/obra
 * 3. VALES_ESTACION: Vales para ir a la estación de servicio (YPF, Shell, Axion, etc.)
 */
export type FuelDepositModality = 
  | 'DEPOSITO_AMBULANTE' 
  | 'BIDONES'            
  | 'VALES_ESTACION';    

export type FuelDepositStatus = 'OPERATIVO' | 'BAJO_STOCK' | 'EN_REPOSICION' | 'FUERA_SERVICIO';

export interface FuelDepositStockAdjustment {
  id: string;
  fecha: string; // YYYY-MM-DD
  hora?: string; // HH:mm
  tipo: 'FIJAR_EXACTO' | 'DIFERENCIA' | 'RECARGA';
  stockAnterior: number;
  stockNuevo: number;
  diferenciaLitros: number; // stockNuevo - stockAnterior
  motivo: string;
  responsable?: string;
  observaciones?: string;
}

export interface FuelDeposit {
  id: string; // ej: "DEP-AMB-01", "DEP-BID-01", "DEP-VAL-01"
  codigo: string; // ej: "CIST-MOV-01", "BID-BASE-01", "VAL-YPF-01"
  nombre: string; // ej: "Cisterna Móvil Mercedes 1114 #01", "Stock Bidones Base Central", "Cuenta Corriente YPF Pilar"
  modalidad: FuelDepositModality;
  modalidadLabel: string; // "Depósito Ambulante" | "Bidones" | "Vales para Estación de Servicio"
  tipoCombustible: string; // "Diesel 500", "Infinia Diesel", "Nafta Súper", "Múltiple", etc.
  idCombustible: string; // "COMB-D500", "COMB-INF-D", etc.
  tiposCombustibles?: string[]; // Lista de combustibles habilitados en este depósito (ej: ['Diesel 500 (Grado 2)', 'Infinia Diesel (Grado 3)'])
  capacidadTotal: number; // Capacidad máxima en Litros o Cupo mensual en Litros
  stockActual: number; // Litros disponibles
  nivelAlertaMinimo: number; // Litros para alerta de reposición
  ubicacion: string; // Base Central, Obrador Tigre, Obra Panamericana, Estación YPF Pilar, etc.
  responsableId?: string;
  responsableNombre?: string;
  estado: FuelDepositStatus;
  
  // Campos específicos según modalidad:
  // 1. Depósito Ambulante
  patenteVehiculo?: string;
  vehiculoId?: string;
  codigoEquipo?: string;
  marcaModeloCamion?: string;
  
  // 2. Bidones
  cantidadBidones?: number;
  capacidadPorBidon?: number; // ej: 20L o 50L
  tipoHomologacion?: string; // ej: "Bidones Plásticos Homologados IRAM", "Bidones Metálicos Antiexplosivos"
  
  // 3. Vales para Estación de Servicio
  numEstacionConvenio?: string;
  nombreEstacion?: string;
  direccionEstacion?: string;
  empresaBandera?: 'YPF' | 'SHELL' | 'AXION' | 'PUMA' | 'OTRA';
  numeroCuentaConvenio?: string;

  costoPorLitroEstimado?: number;
  ultimaRecargaFecha?: string;
  ultimaRecargaLitros?: number;
  observaciones?: string;
  foto?: string;

  // Trazabilidad de Cargas (Entradas) y Descargas (Salidas / Despachos)
  totalCargasLitros?: number; // Total litros cargados/abastecidos (Cisterna) o total despachado acumulado (Estación)
  totalDescargasLitros?: number; // Total litros descargados hacia los equipos desde la cisterna
  cantidadCargas?: number; // Conteo de operaciones de carga / reabastecimiento
  cantidadDescargas?: number; // Conteo de operaciones de descarga / despacho a máquinas

  // Control y Auditoría de Ajustes de Stock Físico (Medición con varilla / corrección)
  stockAjustadoManual?: number; // Último stock fijado manualmente
  ultimoAjusteFecha?: string; // Fecha del último ajuste
  ultimoAjusteLitros?: number; // Litros finales del último ajuste
  ultimoAjusteDiferencia?: number; // Diferencia (+/-) registrada en el último ajuste
  motivoUltimoAjuste?: string; // Motivo seleccionado
  responsableUltimoAjuste?: string; // Responsable que midió/autorizó
  historialAjustes?: FuelDepositStockAdjustment[]; // Registro de auditoría histórica
}

export type ParteDiarioStatus = 'COMPLETADO' | 'PENDIENTE' | 'EN_CURSO';
export type ParteTipoTrabajo = 'HORAS' | 'VIAJES' | 'DIA' | 'TRABAJO' | 'OTRO';
export type ParteAutorizadoStatus = 'NO CONTROLADO' | 'CONTROLADO' | 'AUTORIZADO';

export interface DailyVehicleChecklist {
  // Fotos de inspección inicial (4 lados + cabina + horómetro/tablero)
  fotoFrente?: string;
  fotoAtras?: string;
  fotoLateralIzquierdo?: string;
  fotoLateralDerecho?: string;
  fotoCabinaInterior?: string;
  fotoTableroOdometro?: string;

  // Chequeos mecánicos y de fluidos
  nivelAceiteMotor: boolean; // Nivel de aceite de motor (varilla en rango)
  nivelRefrigerante: boolean; // Nivel de refrigerante / agua de radiador
  nivelAceiteHidraulico: boolean; // Nivel de fluido hidráulico (tanque/visor)
  lucesYAlarmas: boolean; // Luces de trabajo, baliza y alarma de retroceso
  fugasFluidos: boolean; // Sin pérdidas visibles en mangueras/cilindros
  estadoNeumaticosOrugas: boolean; // Presión de neumáticos o tensión de orugas
  frenoEmergencia: boolean; // Freno de mano / traba de seguridad / corta corriente
  extintorYBotiquin: boolean; // Matafuegos cargado y elementos de seguridad

  // Lectura inicial del odómetro/horómetro antes de arrancar
  odometroInicial: number;
  observacionesChecklist?: string;
  completado: boolean;
  fechaHoraChecklist?: string;
}

export interface ParteViajeLinea {
  id: string;
  tipoMaterial: string;
  extraccionEntregas: string;
  tipoOperacionMaterial?: 'ENTREGA' | 'RETIRO' | 'EXTRACCION' | 'SOLO_FLETE' | 'TRASLADO' | string;
  viajesCantidad: number;
  m3PorViaje: number;
  totalM3: number;
  valorViajeEquipo?: number;
  valorMaterialAparte?: number;
  observacion?: string;
}

export interface ParteDiario {
  id: string;
  servMant: string; // SERV_MANT (Alquiler, Traslado de máquina, Mantenimiento, Otro)
  obra: string; // OBRA
  codigoObra: string; // CODIGO_OBRA
  codigoEquipo: string; // CODIGO_EQUIPO
  marcaModelo: string; // MARCA_MODELO
  codigoEmpleado: string; // CODIGO_EMPLEADO
  nombreApellido: string; // NOMBRE_APELLIDO
  fecha: string; // FECHA
  horaInicioMañana?: string; // HORA_INICIO_MAÑANA
  horaFinMañana?: string; // HORA_FIN_MAÑANA
  horaInicioTarde?: string; // HORA_INICIO_TARDE
  horaFinTarde?: string; // HORA_FIN_TARDE
  horasTrabajadas: number; // HORAS TRABAJADAS
  odomKilom?: number; // ODOM-KILOM
  odometroInicial?: number; // Odómetro / Horómetro al inicio del día (Checklist)
  tipo: ParteTipoTrabajo; // TIPO (HORAS / VIAJES / DIA / TRABAJO / OTRO)
  detalleTipo?: string; // DETALLE_TIPO
  viajesCantidad: number; // VIAJES_CANTIDAD
  extraccionEntregas?: string; // EXTRACION_ENTREGAS ('Entrega' | 'Retiro' | 'Extracción' | 'Extracción y Entrega' | 'Solo Flete')
  tipoMaterial?: string; // TIPO_MATERIAL
  m3PorViaje?: number; // Cantidad de M3 por viaje
  totalM3?: number; // Total M3 transportados
  viajesDetalle?: ParteViajeLinea[]; // Múltiples líneas de viajes/materiales dentro del mismo parte
  cantidadDias?: number; // Cantidad de días cuando es por día
  detalleOtro?: string; // Detalle adicional cuando es otro
  cantidadOtro?: number; // Cantidad cuando es otro
  hsCantidad: number; // HS_CANTIDAD
  novedades?: string; // NOVEDADES
  ubicacion?: string; // UBICACION
  encargadoObra?: string; // ENCARGADO_OBRA (quien firma)
  firma?: string; // FIRMA
  numParte: string; // NUM_PARTE
  autorizado: ParteAutorizadoStatus;

  // Origen y trazabilidad desde Google Sheets / Excel (REPORTE_DIARIO / GASTOS POR EQUIPOS)
  fuenteOrigen?: 'REPORTE_DIARIO' | 'GASTOS_POR_EQUIPOS' | 'MANUAL' | 'PORTAL_CHOFER' | string;
  tipoRegistroSheet?: string; // Ej: 'VENTA' cuando proviene de GASTOS POR EQUIPOS
  detalle2?: string; // DETALLE 2 de GASTOS POR EQUIPOS
  reparacionMant?: string; // REPARACION-M... de REPORTE_DIARIO
  grasa?: string; // GRASA de REPORTE_DIARIO
  aceite?: string; // ACEITE de REPORTE_DIARIO

  // Separación contable para camiones: viaje/flete del equipo separado del material
  tipoOperacionMaterial?: 'ENTREGA' | 'RETIRO' | 'EXTRACCION' | 'SOLO_FLETE' | 'TRASLADO' | string;
  separarCobranzaMaterial?: boolean;
  valorViajeEquipo?: number;
  valorMaterialAparte?: number;

  // Campos comerciales opcionales de GASTOS POR EQUIPOS
  precioCosto?: number;
  precioUnitario?: number;
  totalSheet?: number;
  estadoCobro?: string;
  egrIng?: string;

  // Vinculación con Contratos de Alquiler y Facturación ARCA
  rentalId?: string; // ID del Contrato de Alquiler (ej: "ALQ-2026-001")
  rentalNumero?: string; // Número de Contrato (ej: "ALQ-0001")
  facturaId?: string; // ID de Factura ARCA (ej: "ARCA-0007-00000002")
  facturaNumero?: string; // Número de Factura ARCA (ej: "0007-00000002")

  // Checklist de arranque diario
  checklist?: DailyVehicleChecklist;

  // Evidencia fotográfica (Cloudflare R2 / Docs)
  fotoUrl?: string;

  // Obra esporádica tipeada directamente sin crear registro permanente en la BD de Obras
  esObraEsporadica?: boolean;
  // Equipo / Empleado por única vez (a prueba / eventual) sin dar de alta en Flota ni Personal
  esEquipoEventual?: boolean;
  esEmpleadoEventual?: boolean;
  categoriaObra?: ObraDuracionCategoria;
  // Cliente opcional (especialmente útil en Obra Esporádica o vinculación directa)
  clienteId?: string;
  clienteNombre?: string;
  clienteCuit?: string;

  // Compatibility / extra fields
  vehicleId?: string;
  vehicleName?: string;
  patenteOrCodigo?: string;
  driverName?: string;
  cantidad?: number;
  detalleEntrega?: string;
  nombreHoraVirtual?: string;
  combustibleConsumidoLts?: number;
  estado?: ParteDiarioStatus;
  supervisor?: string;
  observaciones?: string;
}

export interface ParteDiarioStats {
  totalPartes: number;
  horasTotalesTrabajadas: number;
  combustibleTotalConsumido: number;
  completados: number;
  pendientes: number;
}

export interface FuelDepositStats {
  totalDepositos: number;
  capacidadTotalLitros: number;
  stockTotalLitros: number;
  totalAmbulantes: number;
  totalBidones: number;
  totalValesEstacion: number;
  depositosBajoStock: number;
  porcentajeStockGlobal: number;
}

export type ObraFacturaOrigen =
  | 'ALQUILER_MAQUINA'
  | 'PARTES_DIARIOS'
  | 'MIXTO'
  | 'CERTIFICADO_OBRA'
  | 'OTRO';

export interface ObraLegajoAdjunto {
  id: string;
  nombre: string;
  url: string;
  tipo: 'FACTURA' | 'CONTRATO' | 'COTIZACION' | 'PARTE_DIARIO' | 'REMITO' | 'COMPROBANTE_GASTO' | 'RESUMEN_VALORIZADO' | 'OTRO';
  fechaSubida: string;
  tamanio?: string;
}

export interface ObraResumenValorizadoRow {
  id: string;
  fecha: string; // YYYY-MM-DD (se muestra DD/MM/YYYY en el documento A4 y Excel)
  numero: string; // N° de Parte Diario o Remito (ej: "7467", "000001")
  equipo: string; // Ej: "EXCAVADORA ZOOMLION", "FORD RANGER 4X4"
  equipoCodigo?: string; // Referencia opcional al código interno en Flota
  detalle: string; // Ej: "ALQUILER EQUIPO HORA-- EXCAVACION BOCA DE REGISTRO"
  cantidad: number; // Horas, viajes, días o unidades (ej: 8.00, 8.50, 1.00)
  precioUnitario: number; // Precio unitario editable (ej: 90000)
  precioTotal: number; // cantidad * precioUnitario
  parteDiarioId?: string; // Referencia al Parte Diario origen si vino de un parte
  esManual?: boolean; // True si fue agregada a mano en el resumen
  unidad?: string; // 'HORAS' | 'DIAS' | 'VIAJES' | 'UNIDADES'
}

export interface ObraResumenValorizado {
  id: string;
  numero: string; // Ej: "0001.381"
  fechaEmision: string; // YYYY-MM-DD
  periodoId?: string; // Contenedor / período vinculado (opcional)
  periodoTitulo?: string;
  fechaDesde?: string; // YYYY-MM-DD
  fechaHasta?: string; // YYYY-MM-DD
  saludo: string; // Ej: "Estimado,"
  introduccion: string; // Texto editable del encabezado
  filas: ObraResumenValorizadoRow[];
  alicuotaIva: number; // 0 | 10.5 | 21
  subtotalNeto: number;
  ivaMonto: number;
  totalGeneral: number;
  estado: 'BORRADOR' | 'ENVIADO' | 'APROBADO' | 'FACTURADO';
  observaciones?: string;
  pdfAdjunto?: ObraLegajoAdjunto; // PDF A4 generado y guardado en Cloudflare R2
  adjuntos?: ObraLegajoAdjunto[]; // Adjuntos adicionales opcionales
  legajoId?: string; // ID del ObraFacturaLegajo vinculado
  facturaArcaId?: string; // ID de la Factura ARCA emitida desde este resumen
  facturaArcaNumero?: string; // Ej: "0007-00000012"
  rentalIds?: string[]; // Contratos de alquiler vinculados al resumen
  createdAt: string;
  updatedAt: string;
}

export interface PreselectedResumenForArca {
  obra: Obra;
  resumen: ObraResumenValorizado;
  linkedRental?: RentalContract;
  linkedRentalIds: string[];
  parteDiarioIds: string[];
}

export interface ObraFacturaLegajo {
  id: string;
  arcaInvoiceId?: string;
  periodoId?: string;
  periodoTitulo?: string;
  tipoComprobante: string;
  nroComprobante: string;
  fecha: string; // YYYY-MM-DD
  concepto: string;
  origen: ObraFacturaOrigen;
  rentalIds: string[];
  quotationIds: string[];
  parteDiarioIds: string[];
  resumenValorizadoId?: string;
  resumenValorizadoNumero?: string;
  netoGravado: number;
  ivaMonto: number;
  importeTotal: number;
  estadoCobro: 'PENDIENTE' | 'COBRADO_PARCIAL' | 'COBRADO';
  pendienteFacturacion?: boolean;
  observaciones?: string;
  adjuntos?: ObraLegajoAdjunto[];
  createdAt: string;
}

export interface ObraPeriodoContenedor {
  id: string;
  titulo: string; // Ej: "1era Quincena Octubre 2026"
  fechaDesde?: string; // YYYY-MM-DD
  fechaHasta?: string; // YYYY-MM-DD
  parteDiarioIds?: string[];
  rentalIds?: string[];
  cotizacionIds?: string[];
  adjuntos?: ObraLegajoAdjunto[];
  descripcion?: string;
  color?: 'amber' | 'blue' | 'emerald' | 'purple' | 'cyan';
  createdAt: string;
}

export type ObraGastoCategoria =
  | 'COMBUSTIBLE'
  | 'LUBRICANTES_GRASA_ACEITE'
  | 'REPARACION_MANTENIMIENTO'
  | 'SUELDOS_JORNALES'
  | 'FLETE_TRASLADO'
  | 'INSUMOS_OBRA'
  | 'SUBCONTRATO'
  | 'VARIOS';

export interface ObraGastoManual {
  id: string;
  fecha: string; // YYYY-MM-DD
  categoria: ObraGastoCategoria;
  equipoCodigo?: string;
  empleadoNombre?: string;
  proveedor?: string;
  nroComprobante?: string;
  descripcion: string;
  monto: number;
  purchaseInvoiceId?: string;
  adjuntos?: ObraLegajoAdjunto[];
  observaciones?: string;
}

export interface ObraCostosConfig {
  porcentajeGastosGenerales: number; // Porcentaje de paquete administrativo / gastos generales (ej: 10%)
  baseCalculoGastosGenerales: 'COSTOS_DIRECTOS' | 'FACTURACION_NETA';
  montoFijoAdministrativo?: number;
  descripcionPaqueteAdmin?: string;
  // Amortización de Vehículos / Equipos en Obra
  porcentajeAmortizacionVehiculos?: number; // % adicional o general de amortización (ej: 0% o 5%)
  baseCalculoAmortizacion?: 'COSTOS_DIRECTOS' | 'FACTURACION_NETA';
  montoFijoAmortizacionVehiculos?: number;
  amortizacionPorHoraDefault?: number; // $/hora default cuando el vehículo no tiene precioCosto en ficha
  amortizacionPorDiaDefault?: number; // $/día default cuando el vehículo no tiene precioCosto en ficha
  tarifasAmortizacionOverride?: Record<
    string,
    { costoPorDia?: number; costoPorHora?: number; montoFijo?: number; modo?: 'DIA' | 'HORA' | 'FIJO' }
  >;
  evaluarSobreNetoSinIva?: boolean; // true = Neto sin IVA (default contable), false = Total c/ IVA
  precioCombustibleReferencia?: number;
  sueldoMensualDefault?: number;
  diasLaborablesMes?: number;
  horasJornadaDefault?: number;
  modoCalculoSueldosObra?: 'LIQUIDACION_TOTAL' | 'LIQUIDACION_BASICO' | 'JORNAL_BASE_SHEET' | 'REFERENCIA_MANUAL';
  tarifasEmpleadoOverride?: Record<string, { costoPorDia?: number; costoPorHora?: number; modo?: 'DIA' | 'HORA' }>;
  itemsExcluidosIds?: string[];
  fechaDesdeFiltro?: string;
  fechaHastaFiltro?: string;
}

export type ObraDuracionCategoria = 'ESPORADICA' | 'CORTA' | 'LARGA';

export interface Obra {
  id: string;
  numero: string; // numero
  nombreObra: string; // nombre de obra
  ubicacion: string; // ubicacion
  pertenece: string; // empresa o persona a quien le pertenece
  // Vínculo formal 1 Cliente -> Muchas Obras (opcional para compatibilidad con obras previas)
  clienteId?: string;
  clienteCodigo?: string;
  clienteNombre?: string;
  clienteCuit?: string;
  activa: boolean; // si esta activa
  plazo: string; // plazo
  montoEstimado: number; // monto estimado
  categoriaDuracion?: ObraDuracionCategoria; // Clasificación visual/filtro: Esporádica, Corta o Larga (todas con igual peso)
  fechaAlta?: string;
  observaciones?: string;
  archivado?: boolean; // Si es true, la obra está archivada (conserva partes diarios e historial)
  fechaArchivado?: string; // Fecha en que se archivó
  motivoArchivado?: string; // Motivo opcional (ej: Obra finalizada, Contrato cerrado)
  // Legajos de Facturación, Resúmenes Valorizados (Pre-Facturación opcional), Gastos y Rentabilidad
  facturasLegajo?: ObraFacturaLegajo[];
  periodosLegajo?: ObraPeriodoContenedor[];
  resumenesValorizados?: ObraResumenValorizado[];
  gastosManuales?: ObraGastoManual[];
  costosConfig?: ObraCostosConfig;
}

// ==================== SUPABASE INTEGRATION & CONTROL DE ASISTENCIA ====================

export type TipoFichada = 'Entrada' | 'Salida';

export interface SupabaseRegistro {
  id: number;
  tipo: TipoFichada;
  fecha: string; // ISO String (ej: "2025-12-23T16:13:31.241+00:00")
  usuario_id: string; // UUID referente a SupabaseUsuario
  observacion?: string | null;
}

export interface SupabaseUsuario {
  id: string; // UUID
  email?: string | null;
  nombre: string;
  created_at?: string;
  aprobado?: boolean;
  legajo?: string | null;
  sector?: string | null;
  fecha_nacimiento?: string | null;
  empresa?: string | null;
  categoria_id?: number | null;
  frecuencia_pago?: string | null;
}

export interface SupabaseLicencia {
  id: number;
  usuario_id: string;
  tipo: string; // "Vacaciones", "Enfermedad", "Trámite", "Inasistencia"
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string; // YYYY-MM-DD
  observacion?: string | null;
  estado: string; // "Aprobado", "Pendiente", "Rechazado"
  created_at?: string;
}

export interface SupabaseSector {
  id: number;
  nombre: string;
  created_at?: string;
}

export interface SupabaseEmpresa {
  id: number;
  nombre: string;
  created_at?: string;
}

export interface SupabaseCategoria {
  id: number;
  nombre: string; // "Junior", "Senior", "Master"
  valor_hora: number; // e.g. 4000.00, 7500.00
  created_at?: string;
}

// Jornada calculada diaria por chofer
export type EstadoPresenciaDiaria = 
  | 'PRESENTE_ACTIVO'      // Marcó entrada hoy y aún no marcó salida
  | 'JORNADA_COMPLETA'     // Marcó entrada y salida en el día
  | 'EN_LICENCIA'          // Está en rango de fechas de licencia aprobada
  | 'SOLO_SALIDA'          // Marcó salida sin entrada previa
  | 'SIN_REGISTRO';        // No tiene registros en la fecha seleccionada

export interface JornadaEmpleadoCalculada {
  fechaKey: string; // YYYY-MM-DD
  usuarioId: string;
  usuarioNombre: string;
  legajo: string;
  sector: string;
  empresa: string;
  categoriaNombre?: string;
  valorHora?: number;
  
  primeraEntrada?: string; // HH:mm:ss
  ultimaSalida?: string; // HH:mm:ss
  entradasCount: number;
  salidasCount: number;
  totalHorasTrabajadas: number; // Decimal hours
  
  estadoPresencia: EstadoPresenciaDiaria;
  observaciones: string[];
  fichadasOriginales: SupabaseRegistro[];
  
  licenciaVinculada?: SupabaseLicencia;
  horasPartesTrabajo?: number; // Horas registradas en Partes Diarios en la misma fecha
}

export interface AttendanceSummaryStats {
  totalFichadas: number;
  totalUsuarios: number;
  presentesHoy: number;
  completadosHoy: number;
  enLicenciaHoy: number;
  horasTotalesMes: number;
  ultimaSincronizacion?: string;
}

// ==================== CONTROL DE STOCK & INSUMOS (PAÑOL) ====================
export type StockCategory = 
  | 'ACEITE_MOTOR'
  | 'ACEITE_HIDRAULICO'
  | 'ACEITE_TRANSMISION'
  | 'GRASA'
  | 'REFRIGERANTE_LIQUIDO'
  | 'FILTRO'
  | 'REPUESTO_CONSUMIBLE'
  | 'VARIOS_PAÑOL'
  | string;

export type StockWarehouseType = 'TALLER' | 'VENTAS' | 'HERRAMIENTAS' | 'INDUMENTARIA' | 'PERSONALIZADO';

export interface StockWarehouse {
  id: string; // ej: "DEP-TALLER", "DEP-VENTAS", "DEP-HERRAMIENTAS", "DEP-INDUMENTARIA"
  codigo: string; // ej: "DEP-01"
  nombre: string; // ej: "Depósito de Taller"
  tipo: StockWarehouseType;
  icono?: string; // ej: "🔧", "🛒", "🧰", "🦺", "🏭"
  descripcion?: string;
  ubicacion?: string;
  responsable?: string;
  createdAt?: string;
}

export interface StockCategoryCustom {
  id: string; // ej: "CAT-001"
  nombre: string; // ej: "Aceites Sintéticos", "Lubricantes Marinos"
  icono?: string; // ej: "🛢️", "⚙️"
  descripcion?: string;
  color?: string;
  depositoId?: string;
}

export type BatchStatus = 'NUEVO_SELLADO' | 'EN_USO' | 'AGOTADO';

export interface StockBatch {
  id: string; // ej: "BATCH-2026-001"
  stockItemId: string; // ID del producto padre
  numeroLote: string; // ej: "Tambor #1 - Lote L-2026-A", "Tambor Nuevo #2"
  fechaIngreso: string; // YYYY-MM-DD
  horaIngreso?: string; // HH:mm
  capacidadInicial: number; // ej: 205.0 Litros
  contenidoActual: number; // ej: 110.0 Litros
  unidad: StockUnit; // LITROS, KG, UNIDAD, etc.
  estado: BatchStatus; // 'NUEVO_SELLADO' | 'EN_USO' | 'AGOTADO'
  comprobanteProveedor?: string; // Remito / Factura
  observacionesIngreso?: string; // ej: "Tambor Shell precintado en pañol 1"
}

export type StockUnit = 'LITROS' | 'TAMBOR_205L' | 'BALDE_20KG' | 'KG' | 'UNIDAD' | 'BIDON_20L' | 'CAJA' | 'KIT' | 'JUEGO' | 'PAR' | 'METRO';

export type StockControlMode = 'STOCK_FRACCIONABLE' | 'DIRECTO_EQUIPO' | 'SIN_STOCK';

export interface StockItem {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string; // Nombre de la categoría (por defecto o personalizada)
  depositoId?: string; // ID del depósito al que pertenece (ej: 'DEP-TALLER', 'DEP-VENTAS', 'DEP-HERRAMIENTAS', 'DEP-INDUMENTARIA')
  depositoNombre?: string; // Nombre del depósito
  controlStockMode?: StockControlMode; // 'STOCK_FRACCIONABLE' (ej: tambor grasa con salidas parciales) | 'DIRECTO_EQUIPO' | 'SIN_STOCK'
  marca?: string;
  talle?: string; // Talle o medida para ropa / calzado / EPP (ej: 'L', 'XL', '42', 'Único')
  genero?: string; // ej: 'Unisex', 'Masculino', 'Femenino'
  descripcion?: string;
  unidad: StockUnit;
  stockActual: number;
  stockMinimoAlerta: number;
  precioCostoUnitario?: number;
  ubicacionPañol?: string;
  foto?: string;
  observaciones?: string;
  fechaUltimoIngreso?: string;
  lotes?: StockBatch[]; // Lotes / Tambores / Contenedores individuales vinculados
}

export type StockMovementType = 'INGRESO_RECARGA' | 'EGRESO_CONSUMO' | 'AJUSTE_INVENTARIO';

export type ClothingDeliveryReason =
  | 'INGRESO_INICIAL'
  | 'REPOSICION_DESGASTE'
  | 'CAMBIO_TALLE'
  | 'ESTACIONAL'
  | 'EXTRAVIO'
  | 'OTRO';

export interface StockMovement {
  id: string;
  stockItemId: string;
  stockItemNombre: string;
  depositoId?: string;
  depositoNombre?: string;
  batchId?: string; // ID del lote/tambor específico de extracción o ingreso
  batchNumeroLote?: string; // Identificación del lote/tambor (ej: "Tambor #2 - Lote L-2026-B")
  tipo: StockMovementType;
  cantidad: number;
  unidad: StockUnit;
  stockAnterior: number;
  stockPosterior: number;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm
  
  // Trazabilidad de Consumo / Entregas al Personal
  equipoCodigoOrPatente?: string;
  equipoId?: string;
  responsableEntrega?: string;
  recibeEmpleadoNombre?: string;
  recibeEmpleadoLegajo?: string;
  recibeEmpleadoDni?: string;
  recibeEmpleadoSector?: string;
  esEntregaIndumentaria?: boolean;
  entregaGrupoId?: string; // Agrupa múltiples prendas entregadas en un mismo acto
  talle?: string;
  motivoEntrega?: ClothingDeliveryReason;
  devuelveAnterior?: boolean;
  motivoConcepto: string;
  comprobanteProveedor?: string;
  observaciones?: string; // Leyenda / anotación específica de la descarga
}

// ==================== SERVICES, MANTENIMIENTO & GASTOS DIRECTOS POR EQUIPO ====================

export type ServiceType = 
  | 'SERVICE_PREVENTIVO'
  | 'REPARACION_CORRECTIVA'
  | 'TALLER_EXTERNO'
  | 'REVISION_GENERAL'
  | 'CAMBIO_NEUMATICOS_ORUGAS';

export interface ServiceItemUsed {
  stockItemId?: string;
  stockItemNombre: string;
  batchNumeroLote?: string;
  cantidad: number;
  unidad: string;
  costoEstimado?: number;
}

export interface VehicleServiceLog {
  id: string; // ej: "SRV-2026-001"
  equipoId: string;
  equipoModeloMarca: string;
  equipoPatenteOrCodigo?: string;
  fecha: string; // YYYY-MM-DD
  hora?: string; // HH:mm
  horometroOdometro: number; // Horas / Kms del equipo al service
  tipoService: ServiceType;
  mecanicoResponsable: string;
  tallerLugar?: string;
  
  trabajosRealizados: string;
  filtroAceiteCambiado?: boolean;
  filtroCombustibleCambiado?: boolean;
  filtroAireCambiado?: boolean;
  filtroHidraulicoCambiado?: boolean;
  aceiteMotorCambiado?: boolean;
  aceiteHidraulicoCambiado?: boolean;
  
  insumosUtilizados: ServiceItemUsed[];
  
  costoManoObra?: number;
  costoInsumos?: number;
  costoTotalService: number;
  
  comprobanteFacturaNum?: string;
  proveedor?: string;
  observaciones?: string;
  proximoServiceHorometro?: number;
}

export type ExpenseCategory = 
  | 'LUBRICANTES_ACEITES'
  | 'REPUESTOS_CONSUMIBLES'
  | 'MANO_OBRA_TALLER'
  | 'NEUMATICOS_ORUGAS'
  | 'COMBUSTIBLE_DIRECTO'
  | 'SEGURO_DOCUMENTACION'
  | 'MULTAS_INFRACCIONES'
  | 'VARIOS_EQUIPO';

export type FinePaymentStatus =
  | 'PENDIENTE'
  | 'PAGADA'
  | 'DESCARGO'
  | 'DESCONTADA_CHOFER';

export interface VehicleExpenseLog {
  id: string; // ej: "EXP-2026-001" o "MUL-2026-001"
  equipoId: string;
  equipoModeloMarca: string;
  equipoPatenteOrCodigo?: string;
  fecha: string; // YYYY-MM-DD (puede venir vacío en registros históricos incompletos)
  numeroComprobante: string;
  proveedor: string;
  categoria: ExpenseCategory;
  concepto: string;
  montoTotal: number;
  vinculadoAServiceId?: string;
  fotoComprobante?: string;
  observaciones?: string;
  // Metadatos específicos de Multas e Infracciones imputadas a camiones/equipos
  multaActaNumero?: string;
  multaOrganismo?: string;
  multaTipoInfraccion?: string;
  multaLugar?: string;
  multaChoferId?: string;
  multaChoferNombre?: string;
  multaEstadoPago?: FinePaymentStatus;
  multaFechaVencimiento?: string;
  multaFechaPago?: string;
  // Metadatos opcionales de historial / importación Google Sheet (compatibles hacia adelante y atrás)
  cantidad?: number;
  marcaRepuesto?: string;
  subcategoriaOriginal?: string;
  codigoEmpleado?: string;
  responsableNombre?: string;
  fotoReferencia?: string;
  fuenteOrigen?: 'MANUAL' | 'GOOGLE_SHEET_MANTENIMIENTO' | 'EXCEL_CSV';
  camposIncompletos?: string[];
}

// ==================== ARCA (EX-AFIP) FACTURACIÓN ELECTRÓNICA ====================
export type ArcaTipoComprobante = 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C' | 'FACTURA_X' | 'NOTA_CREDITO_A' | 'NOTA_CREDITO_B' | 'NOTA_CREDITO_C' | 'NOTA_CREDITO_X';
export type ArcaCondicionIva = 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'CONSUMIDOR_FINAL' | 'EXENTO';

export type InvoiceDeliveryMode = 'ENTREGA_CON_FACTURA' | 'ENTREGA_CON_REMITOS';
export type InvoiceDeliveryStatus = 'ENTREGADO_TOTAL' | 'ENTREGA_PARCIAL' | 'PENDIENTE_ENTREGA';

export interface ArcaInvoiceItemDeliveryRef {
  remitoId: string;
  remitoNumero: string;
  fecha: string;
  cantidad: number;
  recibidoPor?: string;
}

export interface ArcaInvoiceItem {
  id?: string;
  codigo?: string;
  descripcion: string;
  cantidad: number;
  unidadMedida?: string;
  precioUnitario: number;
  bonificacionPorcentaje?: number;
  subtotal: number;
  alicuotaIva: number; // 21, 10.5, 27, 0
  hardwareProductId?: string;
  cantidadEntregada?: number;
  remitosEntrega?: ArcaInvoiceItemDeliveryRef[];
}

export interface ArcaInvoice {
  id: string; // ej: "ARCA-0001-00001234"
  tipoComprobante: ArcaTipoComprobante;
  puntoVenta: number;
  numeroComprobante: number;
  fecha: string; // YYYY-MM-DD
  cuitEmisor: string;
  razonSocialEmisor: string;
  condicionIvaEmisor: string;
  
  tipoDocReceptor: 'CUIT' | 'DNI' | 'CONSUMIDOR_FINAL';
  nroDocReceptor: string;
  razonSocialReceptor: string;
  receptorRazonSocial?: string;
  condicionIvaReceptor: ArcaCondicionIva;
  domicilioReceptor?: string;
  codigoCliente?: string;
  condicionVenta?: string;
  remitoPedido?: string;
  
  items: ArcaInvoiceItem[];
  netoGravado: number;
  ivaTotal: number;
  bonificacionTotal?: number;
  percepcionIibb?: number;
  importeTotal: number;
  impTotal?: number;
  moneda?: 'ARS' | 'USD';
  cotizacionDolar?: number;
  
  cae: string; // Código de Autorización Electrónico (14 dígitos)
  vencimientoCae: string; // YYYY-MM-DD
  resultado: 'APROBADO' | 'RECHAZADO' | 'PENDIENTE';
  observacionesArca?: string;
  qrData?: string;
  
  cbteAsociadoInfo?: {
    tipoComprobante: ArcaTipoComprobante;
    puntoVenta: number;
    numeroComprobante: number;
    idInvoice?: string;
  };

  vinculadoTipo?: 'ALQUILER' | 'FERRETERIA' | 'ARIDOS' | 'OTRO';
  vinculadoId?: string;
  rentalId?: string;
  rentalNumero?: string;
  fechaCbte?: string;
  rentalIds?: string[]; // IDs de Contratos de Alquiler vinculados a esta factura
  partesDiariosIds?: string[]; // IDs de Partes Diarios vinculados a esta factura

  // Cobranzas / Estado de Pago ("Bajar Facturas")
  estadoCobro?: 'PENDIENTE_PAGO' | 'COBRADO_PARCIAL' | 'PAGADO' | 'PARCIAL';
  montoCobrado?: number;
  saldoPendiente?: number;
  fechaCobro?: string;
  formaPagoCobro?: string;
  reciboCobroNumero?: string;
  recibosCobro?: CustomerPaymentReceipt[];

  // Origen del Comprobante (Emitido en este sistema vs Migrado/Cargado desde otro sistema)
  origenRegistro?: 'SISTEMA_ARCA' | 'SISTEMA_INTERNO' | 'OTRO_SISTEMA';
  sistemaOrigenNombre?: string;
  esMigradaOtroSistema?: boolean;
  origenModulo?: CommercialModuleScope;

  // Control de Entrega de Mercadería (Entrega con Factura vs Entrega con Remitos)
  modalidadEntrega?: InvoiceDeliveryMode;
  estadoEntregaMercaderia?: InvoiceDeliveryStatus;
  remitosVinculadosIds?: string[];

  createdAt: string;
}

export type CommercialModuleScope = 'VENTAS_SALON' | 'ALQUILERES';

export type CustomerPaymentMethod =
  | 'TRANSFERENCIA'
  | 'CHEQUE_ECHEQ'
  | 'EFECTIVO_CAJA'
  | 'TARJETA'
  | 'RETENCIONES'
  | 'COMPENSACION_CANJE'
  | 'MIXTO';

export interface PaymentReceiptAttachment {
  id: string;
  url: string;
  nombre: string;
  tipoArchivo?: 'IMAGE' | 'PDF';
  nota?: string;
  originalSizeKB?: number;
  optimizedSizeKB?: number;
  reductionPercentage?: number;
  fechaSubida: string;
}

export type ChequeTipo = 'FISICO' | 'ECHEQ';

export type ChequeEstado =
  | 'EN_CARTERA'
  | 'DEPOSITADO'
  | 'ACREDITADO'
  | 'ENDOSADO'
  | 'RECHAZADO';

export interface ChequeHistorialEvento {
  id: string;
  fecha: string;
  estado: ChequeEstado;
  detalle: string;
  usuario?: string;
}

export interface ChequeCarteraResumen {
  id: string;
  numeroCheque: string;
  tipo: ChequeTipo;
  bancoEmisor: string;
  fechaCobro: string;
  importe: number;
  estado?: ChequeEstado;
}

export interface ChequeCarteraItem {
  id: string;
  numeroCheque: string;
  tipo: ChequeTipo;
  bancoEmisor: string;
  fechaRecepcion: string; // YYYY-MM-DD
  fechaEmision?: string; // YYYY-MM-DD
  fechaCobro: string; // YYYY-MM-DD (Vencimiento / Fecha de cobro)
  importe: number;
  moneda: 'ARS' | 'USD';
  libradorNombre: string;
  cuitLibrador?: string;
  estado: ChequeEstado;

  // Origen (Cobranza / Recibo / Facturas)
  reciboId?: string;
  reciboNumero?: string;
  clienteNombre?: string;
  clienteCuit?: string;
  facturasIds?: string[];
  facturasNumeros?: string[];
  rentalsIds?: string[];
  cuentaValoresId?: string; // ej: CTA-1105

  // Depósito / Acreditación en Banco
  bancoDestinoId?: string;
  bancoDestinoCodigo?: string;
  bancoDestinoNombre?: string;
  fechaDeposito?: string;
  boletaDeposito?: string;
  fechaAcreditacion?: string;
  asientoAcreditacionId?: string;

  // Endoso a Proveedor
  proveedorId?: string;
  proveedorNombre?: string;
  supplierPaymentId?: string;
  facturasCompraIds?: string[];
  fechaEndoso?: string;
  asientoEndosoId?: string;

  // Rechazo y reapertura de deuda
  fechaRechazo?: string;
  motivoRechazo?: string;
  gastosRechazo?: number;
  asientoRechazoId?: string;
  facturaReabierta?: boolean;

  observaciones?: string;
  adjuntos?: PaymentReceiptAttachment[];
  historial?: ChequeHistorialEvento[];
  createdAt: string;
  updatedAt?: string;
}

export interface CustomerPaymentReceipt {
  id: string; // ej: "REC-0001"
  numeroRecibo: string; // ej: "0001-00000001"
  fecha: string; // YYYY-MM-DD
  clienteNombre: string;
  clienteCuit?: string;
  facturasIds: string[]; // IDs de facturas ARCA imputadas ("bajadas")
  facturasNumeros: string[]; // Ej: ["0007-00000002"]
  rentalsIds?: string[]; // IDs de contratos de alquiler asociados
  rentalsNumeros?: string[]; // Ej: ["ALQ-0002"]
  partesDiariosIds?: string[]; // IDs de partes diarios liquidados
  moneda: 'ARS' | 'USD';
  montoCobrado: number;
  retencionesIibb?: number;
  retencionesGanancias?: number;
  retencionesSussIva?: number;
  descuentoProntoPago?: number;
  totalImputado: number; // montoCobrado + retenciones + descuento
  formaPago: CustomerPaymentMethod;
  bancoReferencia?: string; // Ej: "Banco Macro - Transf #99412" o "E-Cheq #881223"
  chequesIds?: string[]; // IDs en Cartera de Cheques (cuando formaPago es CHEQUE_ECHEQ)
  chequesResumen?: ChequeCarteraResumen[]; // Snapshot legible de cheques del recibo
  cuentaDestinoId?: string; // ID de cuenta en el Plan de Cuentas (ej: "CTA-1102")
  cuentaDestinoCodigo?: string; // Código contable (ej: "1.1.02")
  cuentaDestinoNombre?: string; // Nombre legible (ej: "Banco Macro — Cuenta Corriente")
  asientoContableId?: string; // ID del asiento generado automáticamente en el Plan de Cuentas
  impactadoEnCaja?: boolean;
  observaciones?: string;
  adjuntos?: PaymentReceiptAttachment[];
  origenModulo?: CommercialModuleScope;
  createdAt: string;
}

// ==================== PLAN DE CUENTAS & CONTABILIDAD SIMPLE ====================

export type AccountingRubro =
  | 'ACTIVO'
  | 'PASIVO'
  | 'PATRIMONIO_NETO'
  | 'INGRESOS'
  | 'EGRESOS';

export type AccountingTreasuryKind =
  | 'BANCO'
  | 'CAJA'
  | 'VALORES'
  | 'BILLETERA'
  | 'OTRO';

export interface AccountingAccount {
  id: string; // ej: "CTA-1102"
  codigo: string; // ej: "1.1.02"
  nombre: string; // ej: "Banco Macro — Cuenta Corriente"
  rubro: AccountingRubro;
  subrubro: string; // ej: "Disponibilidades y Tesorería"
  descripcion?: string;
  esCuentaTesoreria?: boolean; // Si puede recibir cobranzas o pagos directos (Bancos, Caja, Cheques, Billeteras)
  tipoTesoreria?: AccountingTreasuryKind;
  mediosVinculados?: CustomerPaymentMethod[]; // Sugerencia automática al cobrar facturas
  cbuAlias?: string; // Opcional para cuentas bancarias
  moneda?: 'ARS' | 'USD';
  saldoInicial?: number;
  activa: boolean;
  esSistema?: boolean; // Cuentas base sugeridas (se pueden editar el nombre o saldo inicial)
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountingEntryLine {
  cuentaId: string;
  cuentaCodigo: string;
  cuentaNombre: string;
  debe: number;
  haber: number;
  detalle?: string;
}

export type AccountingEntryOrigin =
  | 'COBRANZA_FACTURA'
  | 'TRANSFERENCIA_INTERNA'
  | 'PAGO_PROVEEDOR'
  | 'ACREDITACION_CHEQUE'
  | 'ENDOSO_CHEQUE'
  | 'RECHAZO_CHEQUE'
  | 'MANUAL';

export interface AccountingEntry {
  id: string; // ej: "AS-2026-0001"
  numero?: string;
  fecha: string; // YYYY-MM-DD
  concepto: string;
  origen: AccountingEntryOrigin;
  referenciaId?: string; // ej: receipt.id
  referenciaNumero?: string; // ej: "REC 0001-00000001"
  clienteProveedor?: string;
  moneda: 'ARS' | 'USD';
  lineas: AccountingEntryLine[];
  totalDebe: number;
  totalHaber: number;
  observaciones?: string;
  createdAt: string;
}

export interface ArcaConfig {
  cuit: string;
  razonSocial: string;
  puntoVenta: number;
  puntoVentaRemito?: number; // Punto de Venta de Remitos Digitales ARCA (por defecto 8 -> 00008)
  caiRemito?: string; // Nº de CAI de 14 dígitos otorgado por ARCA para Pto. Vta. 8 (Cód. 091 - Remito R)
  vencimientoCaiRemito?: string; // Fecha de Vencimiento del CAI (YYYY-MM-DD)
  condicionIva: ArcaCondicionIva;
  modoProduccion: boolean; // false = Homologación, true = Producción ARCA
  privateKey?: string; // Archivo .key (PEM)
  certificate?: string; // Archivo .crt (PEM)
  csr?: string; // Solicitud .csr generada
}

export interface ArcaRemitoItem {
  id?: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: string; // 'UNI', 'DÍAS', 'HORAS', 'M3', 'VIAJES', 'SERVICIO'
  detalleSerieOrInterno?: string; // Patente / Código Interno / Horómetro de Salida
  invoiceItemIdx?: number; // Índice del ítem dentro de la factura vinculada
  hardwareProductId?: string;
}

export type RemitoMotivoTraslado =
  | 'ENTREGA_VENTA_ARTICULOS'
  | 'ALQUILER_MAQUINARIA_OBRA'
  | 'TRASLADO_SERVICIO_VIAL'
  | 'RETIRO_DEVOLUCION_EQUIPO'
  | 'ENTREGA_ARIDOS_MATERIALES'
  | 'TRASLADO_INTERNO_TALLER';

export interface ArcaRemito {
  id: string; // ej: "REM-0008-00000001"
  puntoVenta: number; // 8 -> 00008
  numeroComprobante: number; // 1 -> 00000001
  codigoAfip: string; // "091" (Remito R)
  letra: 'R' | 'X';
  fecha: string; // YYYY-MM-DD
  cuitEmisor: string;
  razonSocialEmisor: string;
  condicionIvaEmisor: string;

  // Destinatario / Cliente
  tipoDocReceptor: 'CUIT' | 'DNI' | 'CONSUMIDOR_FINAL';
  nroDocReceptor: string;
  razonSocialReceptor: string;
  condicionIvaReceptor: ArcaCondicionIva;
  domicilioReceptor: string;
  localidadReceptor?: string;
  obraDestino?: string;
  lugarEntrega?: string;

  // Datos del Transporte / Traslado (RG 1415 / RG 5678/2025)
  motivoTraslado: RemitoMotivoTraslado;
  origenTraslado: string;
  transportistaNombre: string;
  transportistaCuit?: string;
  choferNombre: string;
  choferDni?: string;
  vehiculoTransporte: string; // Marca / Modelo Camión o Carretón
  patenteChasis: string;
  patenteAcoplado?: string;

  // Ítems / Bienes trasladados
  items: ArcaRemitoItem[];
  observaciones?: string;

  // Referencias Cruzadas (Alquiler, Cotización o Factura)
  comprobanteAsociadoTexto?: string; // ej: "ALQ-0001 / COT 0001-00000003"
  cotizacionId?: string;
  rentalId?: string;
  facturaId?: string;
  facturaNumero?: string;
  origenModulo?: CommercialModuleScope;

  // Autorización ARCA (CAI Cód. 091 - Pto. Vta. 00008)
  cai: string;
  vencimientoCai: string;
  estadoEntrega: 'EMITIDO_EN_TRANSITO' | 'ENTREGADO_CONFORME' | 'ANULADO';
  recibidoPorNombre?: string;
  recibidoPorDni?: string;
  fechaHoraRecepcion?: string;
  createdAt: string;
}


export interface InvoiceTemplateField {
  x: number;
  y: number;
  fontSize: number;
  isBold?: boolean;
}

export interface InvoiceTemplateLayout {
  fontFamily: 'monospace' | 'sans-serif' | 'serif';
  numComprobante: InvoiceTemplateField;
  fechaEmision: InvoiceTemplateField;
  codigoCliente: InvoiceTemplateField;
  razonSocial: InvoiceTemplateField;
  cuitReceptor: InvoiceTemplateField;
  condicionVenta: InvoiceTemplateField;
  condicionIva: InvoiceTemplateField;
  domicilio: InvoiceTemplateField;
  remitoPedido: InvoiceTemplateField;
  tableStartY: number;
  tableRowHeight: number;
  tableFontSize: number;
  tableColCodigoX: number;
  tableColDescripcionX: number;
  tableColCantidadX: number;
  tableColUnidadX: number;
  tableColPrecioX: number;
  tableColBonifX: number;
  tableColSubtotalX: number;
  sonPesos: InvoiceTemplateField;
  totalsX: number;
  totalsNetoY: number;
  totalsBonifY: number;
  totalsIvaY: number;
  totalsIibbY: number;
  totalsTotalY: number;
  totalsFontSize: number;
  caeNum: InvoiceTemplateField;
  caeVto: InvoiceTemplateField;
  barcode: InvoiceTemplateField;
  qrCode: { x: number; y: number; size: number };
}

export const DEFAULT_INVOICE_TEMPLATE_LAYOUT: InvoiceTemplateLayout = {
  fontFamily: 'monospace',
  numComprobante: { x: 71.0, y: 11.6, fontSize: 18, isBold: true },
  fechaEmision: { x: 73.0, y: 13.5, fontSize: 18 },
  codigoCliente: { x: 13.0, y: 20.3, fontSize: 16 },
  razonSocial: { x: 27.5, y: 20.3, fontSize: 16 },
  cuitReceptor: { x: 11.5, y: 22.8, fontSize: 16 },
  condicionVenta: { x: 51.5, y: 22.8, fontSize: 16 },
  condicionIva: { x: 81.5, y: 22.8, fontSize: 15 },
  domicilio: { x: 13.5, y: 24.3, fontSize: 16 },
  remitoPedido: { x: 81.5, y: 24.3, fontSize: 16 },
  tableStartY: 34.8,
  tableRowHeight: 3.2,
  tableFontSize: 16,
  tableColCodigoX: 4.5,
  tableColDescripcionX: 13.5,
  tableColCantidadX: 60.5,
  tableColUnidadX: 65.5,
  tableColPrecioX: 81.0,
  tableColBonifX: 88.0,
  tableColSubtotalX: 96.0,
  sonPesos: { x: 20.5, y: 83.8, fontSize: 16 },
  totalsX: 95.2,
  totalsNetoY: 77.5,
  totalsBonifY: 79.2,
  totalsIvaY: 80.9,
  totalsIibbY: 82.6,
  totalsTotalY: 84.3,
  totalsFontSize: 18,
  caeNum: { x: 68.0, y: 88.6, fontSize: 18 },
  caeVto: { x: 73.0, y: 90.3, fontSize: 18 },
  barcode: { x: 4.2, y: 94.5, fontSize: 14 },
  qrCode: { x: 83.0, y: 87.5, size: 70 }
};

// ==================== COTIZADOR & PRESUPUESTOS (VENTAS) ====================
export type QuotationStatus = 'PENDIENTE' | 'APROBADA' | 'FACTURADA' | 'VENCIDA' | 'RECHAZADA';

export interface QuotationItem {
  id?: string;
  equipoId?: string;
  codigo: string;
  descripcion: string;
  observacionLinea?: string; // Aditamento u observación por línea (ej: "C/ martillo hidráulico", "C/ disco de corte", etc.)
  cantidad: number;
  unidadMedida?: string;
  precioUnitario: number;
  bonificacionPorcentaje?: number;
  importe: number;
  alicuotaIva: number; // 21, 10.5, 27, 0
}

export interface Quotation {
  id: string; // ej: "COT-0001-00000001"
  puntoVenta: number;
  numeroComprobante: number;
  fechaEmision: string; // YYYY-MM-DD
  validoHasta: string; // YYYY-MM-DD o texto libre

  razonSocialReceptor: string;
  cuitReceptor: string;
  domicilioReceptor: string;
  zonaReceptor: string;
  localidadReceptor: string;
  telefonoReceptor: string;

  condicionVenta: string;
  monedaExpresada: string;
  nombreVendedor: string;
  observaciones: string;

  items: QuotationItem[];
  subtotalPedido: number;
  bonificacionPorcentajeGlobal?: number;
  bonificacionTotal: number;
  subtotalNeto: number;
  percepcionIibb: number;
  ivaTotal: number;
  importeTotal: number;

  estado: QuotationStatus;
  origenModulo?: CommercialModuleScope;
  createdAt: string;
}

export interface QuotationTemplateLayout {
  fontFamily: 'monospace' | 'sans-serif' | 'serif';
  numComprobante: InvoiceTemplateField;
  fechaEmision: InvoiceTemplateField;
  validoHasta: InvoiceTemplateField;
  razonSocial: InvoiceTemplateField;
  domicilio: InvoiceTemplateField;
  zona: InvoiceTemplateField;
  localidad: InvoiceTemplateField;
  cuitReceptor: InvoiceTemplateField;
  telefonoReceptor: InvoiceTemplateField;

  tableStartY: number;
  tableRowHeight: number;
  tableFontSize: number;
  tableColCodigoX: number;
  tableColDescripcionX: number;
  tableColCantidadX: number;
  tableColPrecioX: number;
  tableColImporteX: number;

  condicionVenta: InvoiceTemplateField;
  monedaExpresada: InvoiceTemplateField;
  nombreVendedor: InvoiceTemplateField;
  observaciones: InvoiceTemplateField;

  totalsX: number;
  totalsSubtotalY: number;
  totalsBonifY: number;
  totalsSubtotalNetoY: number;
  totalsIibbY: number;
  totalsIvaY: number;
  totalsTotalY: number;
  totalsFontSize: number;
}

export const DEFAULT_QUOTATION_TEMPLATE_LAYOUT: QuotationTemplateLayout = {
  fontFamily: 'sans-serif',
  numComprobante: { x: 65.5, y: 12.3, fontSize: 15, isBold: true },
  fechaEmision: { x: 70.5, y: 13.8, fontSize: 15, isBold: false },
  validoHasta: { x: 57.5, y: 20.6, fontSize: 14, isBold: true },
  razonSocial: { x: 26.0, y: 23.2, fontSize: 14, isBold: true },
  domicilio: { x: 10.5, y: 24.6, fontSize: 14, isBold: false },
  zona: { x: 8.0, y: 26.0, fontSize: 14, isBold: false },
  localidad: { x: 10.5, y: 27.3, fontSize: 14, isBold: false },
  cuitReceptor: { x: 73.0, y: 23.2, fontSize: 14, isBold: true },
  telefonoReceptor: { x: 75.5, y: 24.6, fontSize: 14, isBold: false },

  tableStartY: 33.6,
  tableRowHeight: 2.8,
  tableFontSize: 14,
  tableColCodigoX: 4.0,
  tableColDescripcionX: 20.5,
  tableColCantidadX: 61.5,
  tableColPrecioX: 71.5,
  tableColImporteX: 86.0,

  condicionVenta: { x: 16.5, y: 82.8, fontSize: 13, isBold: true },
  monedaExpresada: { x: 25.5, y: 84.2, fontSize: 13, isBold: true },
  nombreVendedor: { x: 18.2, y: 85.5, fontSize: 13, isBold: false },
  observaciones: { x: 14.2, y: 86.9, fontSize: 13, isBold: false },

  totalsX: 96.0,
  totalsSubtotalY: 82.7,
  totalsBonifY: 84.1,
  totalsSubtotalNetoY: 85.5,
  totalsIibbY: 86.9,
  totalsIvaY: 88.3,
  totalsTotalY: 90.7,
  totalsFontSize: 15
};

// ==================== CAJA DIARIA (INGRESOS & SALIDAS) ====================
export type CajaCategoria = 
  | 'EFECTIVO' 
  | 'FP_MOSTRADOR' 
  | 'ALQUILER_HERRAMIENTAS' 
  | 'TRANSF_MAQUINAS' 
  | 'ARIDOS' 
  | 'ALQUILER_EQUIPOS' 
  | 'TARJETA_TRANSF' 
  | 'CUENTA_CORRIENTE' 
  | 'GASTOS_ADM' 
  | 'RETIRO_SOCIO' 
  | 'OTRO';

export interface CajaDiariaEntry {
  id: string; // ej: "MOV-001"
  fecha: string; // YYYY-MM-DD
  tipoMovimiento: 'INGRESO' | 'EGRESO';
  comprobante: string; // ej: "FACT B 05-2734", "FACT A 05-542", "REC-001"
  concepto: string; // ej: "Alquiler de herramienta", "Compra de papel obra Forbice", etc.
  categoria: CajaCategoria;
  
  // Montos discriminados según planilla Excel
  montoEfectivo: number;
  montoTarjetaTransf: number;
  montoCtaCte: number;
  montoAridos: number;
  montoAlquilerEquipo: number;
  montoGasto: number;
  montoTotal: number;

  formaPagoDetalle?: string; // ej: "QR NACION", "CREDITO VIUMI", "DEBITO NACION"
  proveedorCliente?: string;
  observaciones?: string;
}

export interface ArqueoBilletes {
  b20000: number; // $20.000
  b10000: number; // $10.000
  b2000: number;  // $2.000
  b1000: number;  // $1.000
  b500: number;   // $500
  b200: number;   // $200
  b100: number;   // $100
  b50: number;    // $50
  b20: number;    // $20
  b10: number;    // $10
}

export interface CajaDiariaSession {
  id: string; // ej: "CAJA-2026-08-29"
  fecha: string; // YYYY-MM-DD
  estado: 'ABIERTA' | 'CERRADA';
  aperturaCaja: number; // Saldo inicial en efectivo
  entradas: CajaDiariaEntry[];
  arqueo: ArqueoBilletes;
  cierreEfectivoCalculado?: number;
  cierreEfectivoFisico?: number;
  diferenciaCaja?: number;
  observacionesCierre?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== MÓDULO DE COMPRAS & PROVEEDORES ====================
export interface Proveedor {
  id: string; // ej: "PROV-0001"
  codigo: string; // ej: "0001", "0010", "LH001"
  razonSocial: string; // ej: "MILENIUM SRL"
  cuit: string; // ej: "30-70996180-9"
  rubroPrincipal: string; // ej: "COMBUSTIBLES_LUBRICANTES", "FERRETERIA", "REPUESTOS", "SERVICIOS"
  direccion?: string;
  localidad?: string;
  codigoPostal?: string;
  telefono?: string;
  email?: string;
  condicionIva?: string; // ej: "Responsable Inscripto", "Monotributo", "Exento", "Consumidor Final"
  aplicaRetenciones?: boolean; // Aplica retenciones en pagos
  calculaPercepcionesIva?: boolean; // Calcula percepciones IVA / IIBB
  incluyeEnIvaCompras?: boolean; // Incluye en Libro IVA Compras
  saldoCuentaCorriente?: number;
}

export type PurchaseInvoiceCategory =
  | 'COMBUSTIBLE'
  | 'LUBRICANTES'
  | 'MANTENIMIENTO_FILTROS'
  | 'BIENES_CAMBIO_LOCAL'
  | 'INDUMENTARIA'
  | 'LIBRERIA_INSUMOS'
  | 'OTROS';

export type PurchaseItemType =
  | 'COMBUSTIBLE'
  | 'LUBRICANTE'
  | 'MANTENIMIENTO_FILTROS'
  | 'REPUESTO'
  | 'BIENES_CAMBIO'
  | 'INDUMENTARIA'
  | 'LIBRERIA_INSUMOS'
  | 'SERVICE'
  | 'OTRO';

export interface PurchaseInvoiceItem {
  id: string;
  codigo?: string; // ej: "08-0958"
  descripcion: string; // ej: "BDE GRASA 62 EP X 18 KG"
  cantidad: number;
  unidadMedida?: string; // ej: "KG", "L", "UNI"
  precioUnitario: number;
  subtotal: number;
  tipoItem: PurchaseItemType;
  tipoCombustible?: string; // ej: "DIESEL COMUN", "DIESEL INFINIA", "NAFTA SUPER"
  stockItemId?: string; // Artículo del catálogo vinculado
  modoImputacion?: StockControlMode; // 'STOCK_FRACCIONABLE' | 'DIRECTO_EQUIPO' | 'SIN_STOCK'
  depositoId?: string; // Depósito destino cuando lleva control de stock
  depositoNombre?: string;
  equipoId?: string; // Si se imputa 100% directamente a una máquina
  equipoLabel?: string; // Ej: "[EQ-24] Minicargadora"
}

export interface PurchaseInvoice {
  id: string; // ej: "PUR-2026-001"
  fechaEmision: string; // YYYY-MM-DD
  fechaVencimiento?: string; // YYYY-MM-DD
  categoriaCompra?: PurchaseInvoiceCategory;
  tipoComprobante: 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C' | 'NOTA_CREDITO_A' | 'NOTA_CREDITO_B' | 'NOTA_DEBITO_A' | 'REM_LIQUIDACION';
  codigoComprobanteAfip?: string; // ej: "001" (Factura A), "006" (Factura B), "011" (Factura C), "003" (NC A)
  puntoVenta: string; // ej: "0019"
  numeroComprobante: string; // ej: "00020678"
  nroComprobanteCompleto: string; // ej: "0019-00020678"
  cae?: string;
  vencimientoCae?: string;
  
  proveedorId: string;
  proveedorNombre: string;
  proveedorCuit: string;
  proveedorCondicionIva?: string;

  items: PurchaseInvoiceItem[];
  
  // Discriminación Fiscal para Libro IVA Compras
  netoGravado: number; // Neto Gravado 21% principal
  netoGravado21?: number;
  netoGravado105?: number;
  netoGravado27?: number;
  netoNoGravado?: number;
  opExentas?: number;

  ivaMonto: number;
  iva21?: number;
  iva105?: number;
  iva27?: number;

  percepcionIibb: number;
  percepcionIva: number;
  impuestosInternos?: number;
  impuestoIcl?: number; // Impuesto sobre los Combustibles Líquidos (I.C.L.)
  impuestoIdc?: number; // Impuesto al Dióxido de Carbono (I.D.C.)
  tasaVial?: number; // Tasa Vial (TV)
  ajusteRedondeo?: number; // Redondeo / Ajuste AFIP en centavos
  otrosImpuestos?: number;
  montoTotal: number;

  remitosAsociadosIds: string[]; // IDs de los Vales / Remitos de Expendio asociados (Legajo)
  estado: 'PENDIENTE_PAGO' | 'PAGADO_PARCIAL' | 'PAGADO';
  saldoPendiente: number;
  
  archivoPdfUrl?: string; // PDF escaneado o subido de la factura
  archivosAdjuntos?: PurchaseAttachment[]; // Lista de adjuntos en legajo (Factura, Remitos escaneados, Recibos)
  observaciones?: string;
  createdAt: string;
}

export interface PurchaseAttachment {
  id: string;
  nombre: string;
  url: string;
  tipo: 'FACTURA' | 'REMITO' | 'RECIBO' | 'OTRO';
  fechaSubida: string;
  tamanio?: string;
}

export interface SupplierPayment {
  id: string; // ej: "OP-2026-001"
  fecha: string; // YYYY-MM-DD
  proveedorId: string;
  proveedorNombre: string;
  proveedorCuit: string;
  montoTotal: number;
  formaPago: 'TRANSFERENCIA' | 'CHEQUE' | 'CHEQUE_ENDOSADO' | 'EFECTIVO_CAJA' | 'OTROS';
  bancoOrigen?: string;
  numeroComprobantePago?: string; // ej: Nro de transferencia / cheque
  facturasImputadasIds: string[]; // Facturas que liquida este pago
  chequesEndosadosIds?: string[]; // IDs de cheques de cartera endosados en este pago
  chequesEndosadosResumen?: Array<{
    id: string;
    numeroCheque: string;
    bancoEmisor: string;
    fechaCobro: string;
    importe: number;
  }>;
  asientoContableId?: string;
  observaciones?: string;
  createdAt: string;
}

// ==================== PIZARRA DE UBICACIÓN Y DESPACHO (DRAG & DROP) ====================
export type DispatchEventType =
  | 'ASIGNACION'
  | 'TRASLADO'
  | 'FLETE'
  | 'ROTURA'
  | 'DETENIDO_ROTURA'
  | 'CAMBIO_EQUIPO'
  | 'TALLER'
  | 'PARADA'
  | 'NOVEDAD'
  | 'LIBERACION';

export type DispatchTimeSlot = 'MAÑANA' | 'MEDIODIA' | 'TARDE' | 'COMPLETO' | 'GUARDIA';

export interface DispatchBoardPlace {
  id: string;
  nombre: string;
  tipo: 'BASE' | 'TALLER' | 'DEPOSITO' | 'ZONA' | 'OBRA_TEMPORAL';
  ubicacion?: string;
  notas?: string;
  color?: 'amber' | 'cyan' | 'emerald' | 'slate' | 'rose';
  createdAt: string;
}

export interface DispatchDailySegment {
  id: string;
  fecha: string; // YYYY-MM-DD
  horaInicio: string; // HH:mm
  horaFin?: string; // HH:mm
  turno?: DispatchTimeSlot;
  eventType: DispatchEventType;
  locationType?: 'OBRA' | 'LUGAR';
  locationId?: string;
  locationLabel: string;
  fromLocationType?: 'OBRA' | 'LUGAR';
  fromLocationId?: string;
  fromLocationLabel?: string;
  nextLocationLabel?: string;
  employeeId?: string;
  vehicleId?: string;
  replacedVehicleId?: string;
  replacedVehicleLabel?: string;
  tituloEvento?: string; // ej: "Rotura manguera hidráulica", "Flete", "Cambio de equipo"
  nota?: string;
  createdAt: string;
  usuario?: string;
}

export interface DispatchAssignment {
  id: string;
  locationType: 'OBRA' | 'LUGAR';
  locationId: string;
  employeeId?: string;
  vehicleId?: string;
  nota?: string;
  turno?: DispatchTimeSlot;
  horaInicioTramo?: string; // HH:mm del movimiento actual
  estadoOperativo?: 'OPERATIVO' | 'CON_ROTURA' | 'DETENIDO_ROTURA' | 'EN_REPARACION' | 'EN_FLETE' | 'PARADO';
  ultimoEvento?: {
    tipo: DispatchEventType;
    titulo: string;
    hora: string;
    fromLocationLabel?: string;
  };
  assignedAt: string;
  updatedAt: string;
  assignedBy?: string;
}

export interface DispatchMovementLog {
  id: string;
  timestamp: string;
  fecha?: string; // YYYY-MM-DD
  horaInicio?: string; // HH:mm
  horaFin?: string; // HH:mm
  turno?: DispatchTimeSlot;
  eventType?: DispatchEventType;
  tituloEvento?: string;
  nota?: string;
  summary: string;
  employeeId?: string;
  vehicleId?: string;
  fromLocationLabel?: string;
  toLocationLabel: string;
  usuario?: string;
}

export interface DispatchBoardState {
  places: DispatchBoardPlace[];
  assignments: DispatchAssignment[];
  dailySegments?: DispatchDailySegment[];
  history: DispatchMovementLog[];
  hiddenObraIds?: string[];
  hiddenEmployeeIds?: string[];
  hiddenVehicleIds?: string[];
  updatedAt: string;
}

// ==================== MÓDULO DOCUMENTOS & BOLSA DE DOCUMENTOS ====================
export type DocumentBagCategory =
  | 'COMBUSTIBLE'
  | 'VALE_COMBUSTIBLE'
  | 'FACTURA'
  | 'REMITO'
  | 'PARTE_DIARIO'
  | 'OTRO';

export type DocumentBagLinkTargetType =
  | 'PARTE_DIARIO'
  | 'FUEL_VOUCHER'
  | 'ISSUED_VOUCHER'
  | 'FACTURA_VENTA'
  | 'FACTURA_COMPRA'
  | 'REMITO';

export interface DocumentBagItem {
  id: string;
  categoria: DocumentBagCategory;
  url: string;
  nota?: string;
  fechaCaptura: string; // YYYY-MM-DD
  horaCaptura?: string; // HH:mm
  createdAt: string; // ISO
  uploadedBy?: string;
  originalSizeKB?: number;
  optimizedSizeKB?: number;
  reductionPercentage?: number;
  estado: 'PENDIENTE' | 'VINCULADO';
  linkedTargetType?: DocumentBagLinkTargetType;
  linkedTargetId?: string;
  linkedTargetLabel?: string;
  linkedAt?: string;
  aiAnalyzedAt?: string;
}

// ==================== CLIENTES / AGENDA COMERCIAL ====================
export interface ClientRecord {
  id: string;
  codigo?: string;
  cuit: string;
  razonSocial: string;
  condicionIva: string;
  condicionVenta?: string;
  domicilio?: string;
  localidad?: string;
  zona?: string;
  telefono?: string;
  email?: string;
  notas?: string;
  fuente?: string;
  savedInClientsTable?: boolean;
  ultimoComprobante?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ==================== PROGRAMACIÓN DEL DÍA POR AUDIO (WHATSAPP BAILEYS + GEMINI) ====================
export type DailyScheduleEmployeeStatus =
  | 'EN_OBRA'
  | 'ROTURA_AVERIA'
  | 'TALLER'
  | 'BASE'
  | 'EN_FLETE'
  | 'DISPONIBLE'
  | 'FRANCO'
  | 'AUSENTE'
  | 'VACACIONES';

export interface DailyScheduleMovementEntry {
  id: string;
  hora: string; // HH:mm
  tipo: 'ASIGNACION' | 'SE_FUE_TRASLADO' | 'SALIDA' | 'ROTURA' | 'REPARACION';
  estado: DailyScheduleEmployeeStatus;
  obraName?: string;
  vehicleCode?: string;
  vehicleName?: string;
  detalle: string;
  audioLogId?: string;
}

export interface DailyScheduleAssignmentItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  employeePhone?: string;
  estado: DailyScheduleEmployeeStatus;
  vehicleId?: string;
  vehicleCode?: string;
  vehicleName?: string;
  obraId?: string;
  obraName?: string;
  ubicacion?: string;
  horario?: string; // ej: "08:00 a 18:00"
  tarea?: string; // ej: "Excavación zanja cloacal"
  observaciones?: string;
  roturaDetalle?: string;
  historialMovimientos?: DailyScheduleMovementEntry[];
  origenAsignacion?: 'AUDIO_WHATSAPP' | 'AUDIO_WEB' | 'MANUAL' | 'PIZARRA';
  audioLogId?: string;
  parteDiarioId?: string;
  updatedAt: string;
}

export interface DailyScheduleUnmatchedMention {
  textoOriginal: string;
  sugerencia?: string;
  tarea?: string;
}

export interface DailyScheduleRecord {
  id: string; // ej: "SCHED-2026-11-23"
  fecha: string; // YYYY-MM-DD
  estado: 'BORRADOR' | 'CONFIRMADA' | 'CERRADA';
  resumenOperativo?: string;
  items: DailyScheduleAssignmentItem[];
  unmatchedMentions?: DailyScheduleUnmatchedMention[];
  appliedAudioIds: string[];
  syncedToDispatchBoard?: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface WhatsAppAudioLogRecord {
  id: string;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm
  origen: 'WHATSAPP_BAILEYS' | 'WEB_MIC' | 'WEB_UPLOAD' | 'TEXTO';
  senderJid?: string;
  senderPhone?: string;
  senderName?: string;
  audioUrl?: string;
  mimeType?: string;
  transcripcion: string;
  resumenIA?: string;
  detectedCount: number;
  detectedAssignments?: Array<Partial<DailyScheduleAssignmentItem>>;
  scheduleId: string;
  estado: 'PROCESANDO' | 'APLICADO' | 'ERROR';
  errorMsg?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BaileysWhatsAppConfig {
  authorizedPhones: string[]; // números autorizados (ej: ["5493884123456"]), vacío = acepta de todos los autorizados/propios
  autoProcessAudios: boolean;
  autoProcessTexts: boolean;
  autoReplySummary: boolean;
  targetDateMode: 'TODAY' | 'AUTO_DETECT';
}

export interface BaileysConnectionStatus {
  state: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';
  qrDataUrl?: string | null;
  pairingCode?: string | null;
  connectedPhone?: string | null;
  connectedName?: string | null;
  lastEventAt?: string;
  lastError?: string | null;
  scheduleVersion?: number;
  config: BaileysWhatsAppConfig;
}

// ==================== RENDIMIENTOS (CAMIONES & MAQUINARIAS) ====================
export type PerformanceEquipmentCategory = 'CAMIONES' | 'MAQUINAS';

export interface TruckPerformanceTrip {
  id: string; // ej: "REND-..."
  categoriaEquipo: PerformanceEquipmentCategory;
  fecha: string; // YYYY-MM-DD
  vehiculoId?: string;
  codigoEquipo: string;
  marcaModelo?: string;
  patente?: string;
  choferId?: string;
  choferNombre: string;
  obraId?: string;
  obraNombre?: string;
  lugarInicio: string;
  lugarFinal: string;
  horaSalida?: string; // Opcional HH:mm
  horaLlegada?: string; // Opcional HH:mm
  duracionMinutos?: number | null; // Calculado automáticamente si están horaSalida y horaLlegada
  kilometros: number;
  odometroInicio?: number;
  odometroFin?: number;
  tipoCarga: string;
  detalleCarga?: string;
  observaciones?: string;
  // Agrupación contra Carga de Combustible (fuel_vouchers)
  fuelVoucherId?: string;
  fuelVoucherLabel?: string;
  fuelLitersSnapshot?: number;
  fuelFechaSnapshot?: string;
  createdAt: string;
  updatedAt?: string;
}


