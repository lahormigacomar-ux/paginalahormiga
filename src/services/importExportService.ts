import * as XLSX from 'xlsx';
import { 
  Vehicle, 
  Employee, 
  FuelDispensary, 
  IssuedFuelVoucher, 
  VehicleServiceLog,
  VehicleExpenseLog,
  ExpenseCategory,
  VehicleStatus, 
  VehicleClassification,
  EmployeeStatus,
  FuelVoucherStatus,
  IssuedVoucherStatus
} from '../types';
import { parseOdometerValue, extractFirstNonZeroOdometer, extractFirstNonZeroDistance } from './storage';
import { normalizeEquipmentClassification } from '../utils/equipmentClassification';

export type EntityType = 'empleados' | 'flota' | 'expendio' | 'vales' | 'partesDiarios' | 'obras' | 'gastosMantenimiento';

export interface EntityMetadata {
  title: string;
  singularTitle: string;
  storageKey: string;
  baseHeaders: string[];
  sampleRow: Record<string, any>;
  fieldDescriptions: Record<string, string>;
}

export const ENTITY_CONFIGS: Record<EntityType, EntityMetadata> = {
  flota: {
    title: 'Flota Vehicular & Maquinarias',
    singularTitle: 'Equipo de Flota',
    storageKey: 'la_hormiga_fleet_v1',
    baseHeaders: [
      'ID',
      'CODIGO_EQUIPO',
      'MODELO_MARCA',
      'PATENTE',
      'CODIGO_INTERNO',
      'FOTOGRAFIA',
      'PRECIO_COSTO_DIA',
      'PRECIO_SUGERIDO_DIA',
      'PRECIO_COSTO_HORA',
      'PRECIO_SUGERIDO_HORA',
      'MODALIDAD',
      'CLASIFICACION',
      'ESTADO',
      'HOROMETRO',
      'UBICACION',
      'FECHA_ALTA'
    ],
    sampleRow: {
      ID: 'EQ-01',
      CODIGO_EQUIPO: 'RET-01',
      MODELO_MARCA: 'Retroexcavadora Caterpillar 416F2',
      PATENTE: 'AC-345-XY',
      CODIGO_INTERNO: 'INT-416',
      FOTOGRAFIA: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80',
      PRECIO_COSTO_DIA: 280000,
      PRECIO_SUGERIDO_DIA: 365000,
      PRECIO_COSTO_HORA: 35000,
      PRECIO_SUGERIDO_HORA: 45000,
      MODALIDAD: 'AMBOS',
      CLASIFICACION: 'PESADA',
      ESTADO: 'DISPONIBLE',
      HOROMETRO: 3450,
      UBICACION: 'Base Central - Parque Industrial',
      FECHA_ALTA: '2026-01-15'
    },
    fieldDescriptions: {
      CODIGO_EQUIPO: 'Código único de equipo (ej. RET-01, CAM-03)',
      MODELO_MARCA: 'Marca, modelo o descripción de la máquina',
      PATENTE: 'Dominio/patente (o S/P si es oruga/sin patente)',
      PRECIO_COSTO_DIA: 'Costo diario en pesos',
      PRECIO_SUGERIDO_DIA: 'Precio de alquiler diario sugerido',
      MODALIDAD: 'DIA, HORA o AMBOS',
      CLASIFICACION: 'PESADA, VIAL, TRANSPORTE, ELEVACION o LIVIANA',
      ESTADO: 'DISPONIBLE, ALQUILADO, TALLER, MANTENIMIENTO, DESMOVILIZADO o RESERVADO'
    }
  },

  empleados: {
    title: 'Nómina de Empleados & Choferes',
    singularTitle: 'Empleado',
    storageKey: 'la_hormiga_empleados_v2',
    baseHeaders: [
      'ID',
      'CODIGO_EMPLEADO',
      'NOMBRE_APELLIDO',
      'LEGAJO',
      'CATEGORIA',
      'FOTO',
      'SECTOR',
      'OBRA',
      'ESTADO',
      'DNI',
      'TELEFONO',
      'EQUIPO_ASIGNADO',
      'COSTO_DIA',
      'FECHA_ALTA'
    ],
    sampleRow: {
      ID: 'EMP-01',
      CODIGO_EMPLEADO: 'CH-001',
      NOMBRE_APELLIDO: 'González, Roberto Carlos',
      LEGAJO: 'LEG-1042',
      CATEGORIA: 'Oficial Maquinista Especializado',
      FOTO: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      SECTOR: 'Movimiento de Suelos',
      OBRA: 'Autovía Ruta 7 - Tramo Chacabuco',
      ESTADO: 'ACTIVO',
      DNI: '32.450.912',
      TELEFONO: '+54 9 11 4455-8899',
      EQUIPO_ASIGNADO: 'RET-01',
      COSTO_DIA: 85000,
      FECHA_ALTA: '2025-03-10'
    },
    fieldDescriptions: {
      CODIGO_EMPLEADO: 'Código de chofer/operador (ej. CH-001)',
      NOMBRE_APELLIDO: 'Apellido y Nombre del empleado',
      LEGAJO: 'Número de legajo laboral',
      CATEGORIA: 'Oficio o puesto en la empresa',
      SECTOR: 'Sector operativo o departamento',
      OBRA: 'Lugar de trabajo actual o proyecto',
      ESTADO: 'ACTIVO, EN_OBRA, LICENCIA o INACTIVO',
      DNI: 'Documento nacional de identidad',
      COSTO_DIA: 'Costo jornal por día'
    }
  },

  expendio: {
    title: 'Expendio de Combustible (22 Columnas)',
    singularTitle: 'Registro de Expendio',
    storageKey: 'la_hormiga_expendio_combustible_v3',
    baseHeaders: [
      'ID',
      'CARGA',
      'TIPO',
      'ID_COMBUSTIBLE',
      'DEPOSITO',
      'CANTIDAD',
      'TIPO_COMB',
      'CODIGO_EMPLEADO',
      'NOMBRE_APELLIDO',
      'LEGAJO',
      'CODIGO_EQUIPO',
      'MARCA_MODELO',
      'PATENTE',
      'Nº DE ORDEN',
      'FECHA',
      'KILOMETRAJE',
      'HORA',
      'KILOMETROS_REC',
      'AUTONOM',
      'NUM_ESTACION',
      'FOTO_EXPENDIO',
      'FOTO_KILOMETRAJE'
    ],
    sampleRow: {
      ID: 'EXP-1001',
      CARGA: 'Tanque Lleno',
      TIPO: 'Despacho Directo',
      ID_COMBUSTIBLE: 'COMB-D500',
      DEPOSITO: 'Estación YPF Ruta 7',
      CANTIDAD: 140,
      TIPO_COMB: 'DIESEL',
      CODIGO_EMPLEADO: 'CH-001',
      NOMBRE_APELLIDO: 'González, Roberto Carlos',
      LEGAJO: 'LEG-1042',
      CODIGO_EQUIPO: 'CAM-01',
      MARCA_MODELO: 'Mercedes-Benz Actros 2045',
      PATENTE: 'AF-102-ZZ',
      'Nº DE ORDEN': '00001',
      FECHA: '2026-09-01',
      KILOMETRAJE: 124500,
      HORA: '08:30',
      KILOMETROS_REC: 450,
      AUTONOM: '32.1 L/100km',
      NUM_ESTACION: 'YPF-241',
      FOTO_EXPENDIO: '',
      FOTO_KILOMETRAJE: ''
    },
    fieldDescriptions: {
      CANTIDAD: 'Litros despachados (número)',
      TIPO_COMB: 'DIESEL, NAFTA, DIESEL_PREMIUM, etc.',
      'Nº DE ORDEN': 'Número del Vale de Combustible vinculado',
      FECHA: 'Fecha en formato YYYY-MM-DD o DD/MM/YYYY',
      KILOMETRAJE: 'Odómetro u horómetro al momento de la carga',
      CODIGO_EQUIPO: 'Código del equipo abastecido',
      CODIGO_EMPLEADO: 'Código del chofer receptor'
    }
  },

  vales: {
    title: 'Vales de Combustible (Emisión & Rendición)',
    singularTitle: 'Vale de Combustible',
    storageKey: 'la_hormiga_vales_combustible_v3',
    baseHeaders: [
      'ID',
      'NUM_VALE',
      'ESTADO',
      'FECHA_EMISION',
      'HORA_EMISION',
      'CODIGO_EQUIPO',
      'MARCA_MODELO',
      'PATENTE',
      'CODIGO_EMPLEADO',
      'NOMBRE_APELLIDO',
      'LEGAJO',
      'TIPO_COMBUSTIBLE',
      'ID_COMBUSTIBLE',
      'LITROS_AUTORIZADOS',
      'TIPO_CARGA',
      'ESTACION_SURTIDOR',
      'NUM_ESTACION',
      'ODOMETRO_SALIDA',
      'NUM_TICKET_ESTACION',
      'LITROS_REALES',
      'DIFERENCIA_LTS',
      'ODOMETRO_CARGA',
      'IMPORTE_TOTAL',
      'FECHA_RENDICION',
      'ID_EXPENDIO_VINCULADO',
      'OBSERVACIONES'
    ],
    sampleRow: {
      ID: 'VAL-00001',
      NUM_VALE: '00001',
      ESTADO: 'RENDIDO',
      FECHA_EMISION: '2026-09-01',
      HORA_EMISION: '07:45',
      CODIGO_EQUIPO: 'CAM-01',
      MARCA_MODELO: 'Mercedes-Benz Actros 2045',
      PATENTE: 'AF-102-ZZ',
      CODIGO_EMPLEADO: 'CH-001',
      NOMBRE_APELLIDO: 'González, Roberto Carlos',
      LEGAJO: 'LEG-1042',
      TIPO_COMBUSTIBLE: 'DIESEL',
      ID_COMBUSTIBLE: 'COMB-D500',
      LITROS_AUTORIZADOS: 150,
      TIPO_CARGA: 'Tanque Lleno',
      ESTACION_SURTIDOR: 'Estación Shell Km 142',
      NUM_ESTACION: 'EST-SHELL-14',
      ODOMETRO_SALIDA: 124050,
      NUM_TICKET_ESTACION: 'TK-889921',
      LITROS_REALES: 140,
      DIFERENCIA_LTS: -10,
      ODOMETRO_CARGA: 124500,
      IMPORTE_TOTAL: 189000,
      FECHA_RENDICION: '2026-09-01',
      ID_EXPENDIO_VINCULADO: 'EXP-1001',
      OBSERVACIONES: 'Rendición conforme sin desvíos'
    },
    fieldDescriptions: {
      NUM_VALE: 'Número correlativo del vale (ej. 00001, 00002)',
      ESTADO: 'EMITIDO, RENDIDO o ANULADO',
      LITROS_AUTORIZADOS: 'Litros autorizados para cargar',
      LITROS_REALES: 'Litros efectivamente cargados en la estación',
      ESTACION_SURTIDOR: 'Estación de servicio autorizada',
      IMPORTE_TOTAL: 'Importe en pesos según ticket fiscal'
    }
  },

  partesDiarios: {
    title: 'Partes Diarios de Equipos',
    singularTitle: 'Parte Diario',
    storageKey: 'la_hormiga_partes_diarios_v1',
    baseHeaders: [
      'ID',
      'SERV_MANT',
      'OBRA',
      'CODIGO_OBRA',
      'CODIGO_EQUIPO',
      'MARCA_MODELO',
      'CODIGO_EMPLEADO',
      'NOMBRE_APELLIDO',
      'FECHA',
      'HORA_INICIO_MAÑANA',
      'HORA_FIN_MAÑANA',
      'HORA_INICIO_TARDE',
      'HORA_FIN_TARDE',
      'HORAS TRABAJADAS',
      'ODOM-KILOM',
      'TIPO',
      'DETALLE_TIPO',
      'VIAJES_CANTIDAD',
      'EXTRACION_ENTREGAS',
      'TIPO_MATERIAL',
      'M3_POR_VIAJE',
      'TOTAL_M3',
      'HS_CANTIDAD',
      'NOVEDADES',
      'REPARACION-MANT',
      'UBICACION',
      'ENCARGADO_OBRA',
      'GRASA',
      'ACEITE',
      'FIRMA',
      'NUM_PARTE',
      'FUENTE_ORIGEN',
      'SEPARAR_COBRANZA_MATERIAL',
      'VALOR_VIAJE_EQUIPO',
      'VALOR_MATERIAL_APARTE'
    ],
    sampleRow: {
      ID: 'd51e15d9',
      SERV_MANT: 'ALQUILER',
      OBRA: 'AYALA EL MOLLAR',
      CODIGO_OBRA: 'OBRA-01',
      CODIGO_EQUIPO: 'EQ-01',
      MARCA_MODELO: 'EXCAVADORA KOBELCO 2017',
      CODIGO_EMPLEADO: 'EMP-101',
      NOMBRE_APELLIDO: 'GARCIA LUIS',
      FECHA: '2026-09-01',
      HORA_INICIO_MAÑANA: '08:00',
      HORA_FIN_MAÑANA: '12:00',
      HORA_INICIO_TARDE: '13:00',
      HORA_FIN_TARDE: '17:00',
      'HORAS TRABAJADAS': 8.0,
      'ODOM-KILOM': 14520,
      TIPO: 'HORAS',
      DETALLE_TIPO: 'EXCAVACIÓN',
      VIAJES_CANTIDAD: 0,
      EXTRACION_ENTREGAS: '',
      TIPO_MATERIAL: '',
      M3_POR_VIAJE: 0,
      TOTAL_M3: 0,
      HS_CANTIDAD: 8.0,
      NOVEDADES: 'Sin novedad',
      'REPARACION-MANT': '',
      UBICACION: 'Sector Norte',
      ENCARGADO_OBRA: 'Juan Pérez',
      GRASA: 'NO CONTROLADO',
      ACEITE: '',
      FIRMA: 'Firmado',
      NUM_PARTE: '2574',
      FUENTE_ORIGEN: 'REPORTE_DIARIO',
      SEPARAR_COBRANZA_MATERIAL: 'NO',
      VALOR_VIAJE_EQUIPO: 0,
      VALOR_MATERIAL_APARTE: 0
    },
    fieldDescriptions: {
      NUM_PARTE: 'Número de parte diario (o NUM_COMP en Gastos por Equipos)',
      CODIGO_EQUIPO: 'Código interno del equipo',
      MARCA_MODELO: 'Marca y modelo del equipo',
      NOMBRE_APELLIDO: 'Nombre y apellido del operador/responsable',
      'HORAS TRABAJADAS': 'Total de horas trabajadas',
      'ODOM-KILOM': 'Odómetro o kilometraje actual'
    }
  },

  obras: {
    title: 'Registro de Obras',
    singularTitle: 'Obra',
    storageKey: 'la_hormiga_obras_v1',
    baseHeaders: [
      'ID',
      'NUMERO',
      'NOMBRE_OBRA',
      'UBICACION',
      'PERTENECE',
      'ACTIVA',
      'PLAZO',
      'MONTO_ESTIMADO',
      'FECHA_ALTA',
      'OBSERVACIONES'
    ],
    sampleRow: {
      ID: 'obra-1',
      NUMERO: 'OBRA-2024-001',
      NOMBRE_OBRA: 'Ampliación Parque Industrial Norte',
      UBICACION: 'Ruta 9 Km 45, Sector Industrial',
      PERTENECE: 'Constructora San Cayetano S.A.',
      ACTIVA: 'SÍ',
      PLAZO: '12 meses',
      MONTO_ESTIMADO: 45000000,
      FECHA_ALTA: '2024-01-15',
      OBSERVACIONES: 'Movimiento de suelos'
    },
    fieldDescriptions: {
      NUMERO: 'Número o código de obra',
      NOMBRE_OBRA: 'Nombre de la obra',
      UBICACION: 'Ubicación geográfica',
      PERTENECE: 'A quién le pertenece (empresa o persona)',
      ACTIVA: 'SÍ o NO',
      MONTO_ESTIMADO: 'Monto presupuestado en ARS'
    }
  },

  gastosMantenimiento: {
    title: 'Gastos de Mantenimiento & Repuestos',
    singularTitle: 'Gasto de Mantenimiento',
    storageKey: 'la_hormiga_vehicle_expenses_v1',
    baseHeaders: [
      'ID',
      'FECHA',
      'NUM_COMP',
      'CODIGO_EQUIPO',
      'MARCA_MODELO',
      'TIPO',
      'DESCRIPCION',
      'CANTIDAD',
      'MONTO',
      'MARCA',
      'CODIGO_EMPLEADO',
      'RESPONSABLE',
      'RAZON_SOCIAL',
      'OBSERVACIONES'
    ],
    sampleRow: {
      ID: '8d01d6a8',
      FECHA: '2023-08-18',
      NUM_COMP: '0006-00044573',
      CODIGO_EQUIPO: '65c849ad',
      MARCA_MODELO: 'TOYOTA HILUX 4X2 C.S.',
      TIPO: 'MOTOR',
      DESCRIPCION: 'TAPA DE CILINDRO',
      CANTIDAD: 1,
      MONTO: 114000,
      MARCA: 'ALTERNATIVO',
      CODIGO_EMPLEADO: '541de778',
      RESPONSABLE: 'RODRIGUEZ EFRAIN',
      RAZON_SOCIAL: 'LOPEZ DIESEL S.A.',
      OBSERVACIONES: ''
    },
    fieldDescriptions: {
      ID: 'ID único de fila en el Sheet (para evitar duplicados)',
      FECHA: 'Fecha del comprobante (si falta en filas viejas queda incompleto)',
      NUM_COMP: 'Número de factura / remito / comprobante',
      CODIGO_EQUIPO: 'Código o ID del equipo en la flota',
      MARCA_MODELO: 'Modelo y marca del equipo',
      TIPO: 'Rubro del gasto (MOTOR, FILTROS, ACEITES, CUBIERTAS, ELECTRICIDAD, etc.)',
      DESCRIPCION: 'Detalle o concepto del repuesto / trabajo (soporta DESCRPCION)',
      CANTIDAD: 'Cantidad de unidades',
      MONTO: 'Importe total en pesos (soporta comas decimales y notas de crédito negativas)',
      MARCA: 'Marca del repuesto o alternativa',
      RAZON_SOCIAL: 'Proveedor, casa de repuestos o taller'
    }
  }
};

/**
 * Normaliza nombres de encabezados para comparar de forma robusta
 */
export function normalizeHeaderKey(header: string): string {
  return String(header || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[\s\-_./\\()#º°]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Obtiene el valor visual adecuado para mostrar en la previsualización de una columna
 */
export function getDisplayValueForHeader(row: any, header: string): any {
  if (!row || typeof row !== 'object') return '-';

  // 1. Coincidencia directa
  if (row[header] !== undefined && row[header] !== null && String(row[header]).trim() !== '') {
    return row[header];
  }

  const normH = normalizeHeaderKey(header);

  // 2. Mapeo exhaustivo de cabecera estándar a nombres de propiedades del modelo en TypeScript
  const fieldMapping: Record<string, string[]> = {
    // FLOTA
    'ID': ['id', 'codigo', 'codigoEquipo', 'codigoInterno'],
    'CODIGO_EQUIPO': ['codigoEquipo', 'id', 'codigoInterno', 'codigo', 'equipo'],
    'MODELO_MARCA': ['modeloMarca', 'marcaModelo', 'modelo', 'marca', 'descripcion', 'equipo'],
    'ANIO': ['anio', 'año', 'year', 'fabricacion', 'anioFabricacion', 'ano', 'modeloAnio'],
    'PATENTE': ['patente', 'dominio', 'matricula', 'placa'],
    'CODIGO_INTERNO': ['codigoInterno', 'interno', 'codigo', 'id', 'codigoEquipo'],
    'FOTOGRAFIA': ['fotografia', 'foto'],
    'PRECIO_COSTO_DIA': ['precioCosto', 'costoPorDia', 'costoDia', 'precioCostoDia'],
    'PRECIO_SUGERIDO_DIA': ['precioSugerido', 'precioSugeridoDia', 'sugeridoDia'],
    'PRECIO_COSTO_HORA': ['precioCostoHora', 'costoHora'],
    'PRECIO_SUGERIDO_HORA': ['precioSugeridoHora', 'sugeridoHora'],
    'MODALIDAD': ['modalidadTarifa', 'modalidad'],
    'CLASIFICACION': ['clasificacion', 'categoriaEquipo', 'categoria', 'tipoEquipo'],
    'ESTADO': ['estado', 'status'],
    'HOROMETRO': ['horometro', 'kilometraje', 'odometro', 'km'],
    'UBICACION': ['ubicacionActual', 'ubicacion', 'obra'],
    'FECHA_ALTA': ['fechaAlta', 'fecha'],

    // EMPLEADOS
    'CODIGO_EMPLEADO': ['codigoEmpleado', 'codigo', 'choferCodigo', 'id'],
    'NOMBRE_APELLIDO': ['nombreApellido', 'nombre', 'empleado', 'chofer'],
    'LEGAJO': ['legajo'],
    'CATEGORIA': ['categoria', 'puesto', 'cargo'],
    'FOTO': ['foto', 'fotografia'],
    'SECTOR': ['sector', 'departamento'],
    'OBRA': ['obra', 'proyecto'],
    'DNI': ['dni', 'documento'],
    'TELEFONO': ['telefono', 'celular'],
    'EQUIPO_ASIGNADO': ['vehiculoAsignadoId', 'equipoAsignado'],
    'COSTO_DIA': ['costoPorDia', 'costoDia', 'jornal', 'precioCosto'],

    // EXPENDIO & VALES
    'CARGA': ['carga', 'tipoCarga'],
    'TIPO': ['tipo'],
    'ID_COMBUSTIBLE': ['idCombustible', 'combustibleId'],
    'DEPOSITO': ['deposito', 'estacion', 'estacionSurtidor'],
    'CANTIDAD': ['cantidad', 'litros', 'volumen'],
    'TIPO_COMB': ['tipoComb', 'tipoCombustible', 'combustible'],
    'TIPO_COMBUSTIBLE': ['tipoComb', 'tipoCombustible', 'combustible'],
    'MARCA_MODELO': ['marcaModelo', 'modeloMarca', 'modelo', 'marca', 'descripcion'],
    'N_DE_ORDEN': ['numOrden', 'nDeOrden', 'orden', 'numVale'],
    'Nº DE ORDEN': ['numOrden', 'nDeOrden', 'orden', 'numVale'],
    'FECHA': ['fecha', 'fechaEmision'],
    'KILOMETRAJE': ['kilometraje', 'odometro', 'odomKilom', 'km'],
    'HORA': ['hora', 'horaEmision'],
    'KILOMETROS_REC': ['kilometrosRec', 'kmsRec'],
    'AUTONOM': ['autonom', 'autonomia'],
    'NUM_ESTACION': ['numEstacion', 'estacionNum'],
    'FOTO_EXPENDIO': ['fotoExpendio', 'fotoTicket'],
    'FOTO_KILOMETRAJE': ['fotoKilometraje', 'fotoOdometro'],
    'NUM_VALE': ['numVale', 'numComprobante', 'vale'],
    'FECHA_EMISION': ['fechaEmision', 'fecha'],
    'HORA_EMISION': ['horaEmision', 'hora'],
    'TIPO_CARGA': ['tipoCarga', 'carga'],
    'ESTACION_SURTIDOR': ['estacionSurtidor', 'deposito', 'estacion'],
    'ODOMETRO_SALIDA': ['odometroSalida'],
    'NUM_TICKET_ESTACION': ['numTicket', 'numTicketEstacion'],
    'LITROS_AUTORIZADOS': ['litrosAutorizados', 'cantidadAutorizada'],
    'LITROS_REALES': ['litrosReales', 'litros', 'cantidad'],
    'DIFERENCIA_LTS': ['diferenciaLitros', 'diferenciaLts'],
    'ODOMETRO_CARGA': ['odometroCarga', 'kilometraje'],
    'IMPORTE_TOTAL': ['importeTotal', 'totalImporte', 'importe'],
    'FECHA_RENDICION': ['fechaRendicion'],
    'ID_EXPENDIO_VINCULADO': ['expendioId', 'idExpendioVinculado'],
    'FOTO_TICKET': ['fotoTicket', 'fotoExpendio'],
    'FOTO_ODOMETRO': ['fotoOdometro', 'fotoKilometraje'],
    'OBSERVACIONES': ['observaciones', 'notas', 'novedades'],

    // PARTES DIARIOS
    'NUM_PARTE': ['numParte', 'numeroParte', 'parte'],
    'NUM_COMP': ['numParte', 'numComp'],
    'SERV_MANT': ['servMant', 'servicio'],
    'CODIGO_OBRA': ['codigoObra'],
    'HORA_INICIO_MAÑANA': ['horaInicioMañana', 'horaInicioManana'],
    'HORA_FIN_MAÑANA': ['horaFinMañana', 'horaFinManana'],
    'HORA_INICIO_TARDE': ['horaInicioTarde'],
    'HORA_FIN_TARDE': ['horaFinTarde'],
    'HORAS_TRABAJADAS': ['horasTrabajadas', 'horas', 'hsCantidad'],
    'ODOM-KILOM': ['odomKilom', 'odometro', 'kilometraje'],
    'DETALLE_TIPO': ['detalleTipo', 'detalleEntrega', 'tareas'],
    'DETALLE_2': ['detalle2'],
    'VIAJES_CANTIDAD': ['viajesCantidad', 'viajes', 'cantidad'],
    'EXTRACION_ENTREGAS': ['extraccionEntregas', 'extraccion'],
    'TIPO_MATERIAL': ['tipoMaterial', 'material'],
    'M3_POR_VIAJE': ['m3PorViaje'],
    'TOTAL_M3': ['totalM3'],
    'HS_CANTIDAD': ['hsCantidad', 'horasTrabajadas'],
    'NOVEDADES': ['novedades', 'observaciones'],
    'REPARACION-MANT': ['reparacionMant'],
    'ENCARGADO_OBRA': ['encargadoObra', 'encargado'],
    'GRASA': ['grasa'],
    'ACEITE': ['aceite'],
    'FIRMA': ['firma'],
    'AUTORIZADO': ['autorizado'],
    'FUENTE_ORIGEN': ['fuenteOrigen'],
    'SEPARAR_COBRANZA_MATERIAL': ['separarCobranzaMaterial'],
    'VALOR_VIAJE_EQUIPO': ['valorViajeEquipo', 'precioUnitario'],
    'VALOR_MATERIAL_APARTE': ['valorMaterialAparte'],

    // OBRAS
    'NUMERO': ['numero', 'codigoObra', 'id'],
    'NOMBRE_OBRA': ['nombreObra', 'obra', 'nombre'],
    'PERTENECE': ['pertenece', 'cliente', 'empresa'],
    'ACTIVA': ['activa'],
    'PLAZO': ['plazo', 'duracion'],
    'MONTO_ESTIMADO': ['montoEstimado', 'monto', 'presupuesto'],

    // GASTOS DE MANTENIMIENTO
    'DESCRIPCION': ['concepto', 'descripcion'],
    'DESCRPCION': ['concepto', 'descripcion'],
    'MONTO': ['montoTotal', 'monto'],
    'MARCA': ['marcaRepuesto', 'marca'],
    'RESPONSABLE': ['responsableNombre', 'nombreApellido', 'responsable'],
    'RAZON_SOCIAL': ['proveedor', 'razonSocial']
  };

  const candidates = fieldMapping[normH] || fieldMapping[header] || [];
  
  for (const candidate of candidates) {
    if (row[candidate] !== undefined && row[candidate] !== null && String(row[candidate]).trim() !== '') {
      return row[candidate];
    }
  }

  // 3. Fallback: búsqueda insensible a mayúsculas/minúsculas y guiones
  const cleanTarget = normH.replace(/_/g, '').toLowerCase();
  for (const k of Object.keys(row)) {
    const cleanK = k.replace(/[\s\-_./\\()#º°]+/g, '').toLowerCase();
    if (cleanK === cleanTarget && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return row[k];
    }
  }

  return '-';
}

/**
 * Detecta automáticamente el tipo de entidad según los encabezados de las columnas
 */
export function detectEntityTypeFromHeaders(headers: string[]): EntityType | null {
  const normHeaders = headers.map(h => normalizeHeaderKey(h));

  // Check expendio de combustible (22 columnas):
  const expendioKeys = ['ID_COMBUSTIBLE', 'CANTIDAD', 'TIPO_COMB', 'N_DE_ORDEN', 'KILOMETROS_REC', 'AUTONOM', 'NUM_ESTACION', 'FOTO_EXPENDIO', 'FOTO_KILOMETRAJE'];
  const expendioScore = expendioKeys.filter(k => normHeaders.includes(k)).length;

  // Check partes diarios (supports REPORTE_DIARIO and GASTOS POR EQUIPOS):
  const partesKeys = ['HORAS_TRABAJADAS', 'SERV_MANT', 'HS_CANTIDAD', 'NUM_PARTE', 'ENCARGADO_OBRA', 'VIAJES_CANTIDAD', 'EXTRACION_ENTREGAS', 'ODOM_KILOM', 'DETALLE_2', 'EGR_ING', 'NUM_COMP'];
  const partesScore = partesKeys.filter(k => normHeaders.includes(k)).length;

  // Check vales emitidos:
  const valesKeys = ['LITROS_AUTORIZADOS', 'LITROS_REALES', 'ESTACION_SURTIDOR', 'DIFERENCIA_LTS', 'NUM_VALE', 'FECHA_RENDICION', 'ODOMETRO_SALIDA'];
  const valesScore = valesKeys.filter(k => normHeaders.includes(k)).length;

  // Check flota:
  const flotaKeys = ['PRECIO_COSTO_DIA', 'PRECIO_SUGERIDO_DIA', 'PRECIO_COSTO_HORA', 'PRECIO_SUGERIDO_HORA', 'MODALIDAD', 'CLASIFICACION', 'HOROMETRO'];
  const flotaScore = flotaKeys.filter(k => normHeaders.includes(k)).length;

  // Check empleados:
  const empleadosKeys = ['CATEGORIA', 'LEGAJO', 'SECTOR', 'DNI', 'COSTO_DIA', 'EQUIPO_ASIGNADO'];
  const empleadosScore = empleadosKeys.filter(k => normHeaders.includes(k)).length;

  // Check obras:
  const obrasKeys = ['NOMBRE_OBRA', 'PERTENECE', 'PLAZO', 'MONTO_ESTIMADO', 'ACTIVA'];
  const obrasScore = obrasKeys.filter(k => normHeaders.includes(k)).length;

  // Check gastos de mantenimiento:
  const gastosKeys = ['MONTO', 'DESCRPCION', 'DESCRIPCION', 'RAZON_SOCIAL', 'NUM_COMP', 'MARCA', 'RESPONSABLE', 'PROVEEDOR', 'CATEGORIA'];
  const gastosScore = gastosKeys.filter(k => normHeaders.includes(k)).length;

  const scores: { entity: EntityType; score: number }[] = [
    { entity: 'expendio', score: expendioScore },
    { entity: 'partesDiarios', score: partesScore },
    { entity: 'vales', score: valesScore },
    { entity: 'gastosMantenimiento', score: gastosScore },
    { entity: 'flota', score: flotaScore },
    { entity: 'empleados', score: empleadosScore },
    { entity: 'obras', score: obrasScore }
  ];

  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score >= 2) {
    return scores[0].entity;
  }

  return null;
}

export interface SystemFieldDefinition {
  key: string;
  label: string;
  description: string;
  required?: boolean;
  example?: string;
  group?: string;
}

/**
 * Obtiene las definiciones de columnas y campos para el mapeo interactivo
 */
export function getSystemFieldDefinitions(entity: EntityType): SystemFieldDefinition[] {
  if (entity === 'vales') {
    return [
      { key: 'NUM_VALE', label: 'Nº de Vale / Comprobante', description: 'Número correlativo único del vale (ej. 00001, 1042)', required: true, example: '00001', group: 'Identificación' },
      { key: 'FECHA_EMISION', label: 'Fecha de Emisión', description: 'Fecha del vale (YYYY-MM-DD o DD/MM/YYYY)', required: true, example: '2026-09-01', group: 'Fechas' },
      { key: 'HORA_EMISION', label: 'Hora de Emisión', description: 'Hora en formato HH:MM', example: '08:30', group: 'Fechas' },
      { key: 'CODIGO_EQUIPO', label: 'Código del Equipo / Máquina', description: 'Código único de la maquinaria o vehículo', required: true, example: 'CAM-01', group: 'Equipo' },
      { key: 'MARCA_MODELO', label: 'Marca / Modelo del Equipo', description: 'Descripción o marca/modelo del equipo', example: 'Mercedes-Benz Actros 2045', group: 'Equipo' },
      { key: 'PATENTE', label: 'Patente / Dominio', description: 'Patente del vehículo o S/P', example: 'AF-102-ZZ', group: 'Equipo' },
      { key: 'CODIGO_EMPLEADO', label: 'Código del Chofer', description: 'Código del conductor u operador', example: 'CH-001', group: 'Personal' },
      { key: 'NOMBRE_APELLIDO', label: 'Nombre y Apellido Chofer', description: 'Nombre completo del operador', example: 'González, Roberto Carlos', group: 'Personal' },
      { key: 'LEGAJO', label: 'Nº de Legajo', description: 'Número de legajo del chofer', example: 'LEG-1042', group: 'Personal' },
      { key: 'TIPO_COMBUSTIBLE', label: 'Tipo de Combustible', description: 'DIESEL, NAFTA, DIESEL_PREMIUM, etc.', required: true, example: 'DIESEL', group: 'Carga' },
      { key: 'LITROS_AUTORIZADOS', label: 'Litros Autorizados', description: 'Cantidad de litros autorizados a cargar', required: true, example: '150', group: 'Carga' },
      { key: 'TIPO_CARGA', label: 'Tipo de Carga', description: 'Tanque Lleno, Bidones, etc.', example: 'Tanque Lleno', group: 'Carga' },
      { key: 'ESTACION_SURTIDOR', label: 'Estación / Proveedor', description: 'Nombre o estación asignada (ej. Shell, YPF)', example: 'Estación Shell Km 142', group: 'Estación' },
      { key: 'NUM_ESTACION', label: 'Nº de Estación / Depósito', description: 'Código de estación', example: 'EST-01', group: 'Estación' },
      { key: 'NUM_TICKET_ESTACION', label: 'Nº Ticket Estación (Rendición)', description: 'Número de ticket fiscal de la estación', example: 'TK-889921', group: 'Rendición' },
      { key: 'LITROS_REALES', label: 'Litros Reales Cargados', description: 'Litros efectivamente cargados en la estación', example: '140', group: 'Rendición' },
      { key: 'DIFERENCIA_LTS', label: 'Diferencia de Litros', description: 'Diferencia entre autorizados y reales', example: '-10', group: 'Rendición' },
      { key: 'ODOMETRO_SALIDA', label: 'Odómetro / Km Salida', description: 'Kilometraje del tablero al salir', example: '124050', group: 'Kilometraje' },
      { key: 'ODOMETRO_CARGA', label: 'Odómetro / Km al Cargar', description: 'Kilometraje del tablero en la estación', example: '124500', group: 'Kilometraje' },
      { key: 'IMPORTE_TOTAL', label: 'Importe Total ($)', description: 'Monto total en pesos según ticket', example: '189000', group: 'Importes' },
      { key: 'ESTADO', label: 'Estado del Vale', description: 'EMITIDO, RENDIDO o ANULADO', example: 'RENDIDO', group: 'General' },
      { key: 'FECHA_RENDICION', label: 'Fecha de Rendición', description: 'Fecha en que se rindió el ticket', example: '2026-09-02', group: 'Rendición' },
      { key: 'OBSERVACIONES', label: 'Observaciones / Notas', description: 'Comentarios adicionales o desvíos', example: 'Carga normal', group: 'General' }
    ];
  }

  if (entity === 'expendio') {
    return [
      { key: 'N_DE_ORDEN', label: 'Nº de Orden / Vale Vinculado', description: 'Número de orden o vale correspondiente', required: true, example: 'VAL-001', group: 'Identificación' },
      { key: 'FECHA', label: 'Fecha del Despacho', description: 'Fecha en formato YYYY-MM-DD o DD/MM/YYYY', required: true, example: '2026-09-01', group: 'Fechas' },
      { key: 'HORA', label: 'Hora del Despacho', description: 'Hora en formato HH:MM', example: '08:30', group: 'Fechas' },
      { key: 'CODIGO_EQUIPO', label: 'Código del Equipo', description: 'Código del vehículo abastecido', required: true, example: 'CAM-01', group: 'Equipo' },
      { key: 'MARCA_MODELO', label: 'Marca / Modelo del Equipo', description: 'Descripción o marca del vehículo', example: 'Mercedes-Benz Actros', group: 'Equipo' },
      { key: 'PATENTE', label: 'Patente / Dominio', description: 'Patente del vehículo o S/P', example: 'AF-102-ZZ', group: 'Equipo' },
      { key: 'CODIGO_EMPLEADO', label: 'Código del Chofer', description: 'Código del empleado receptor', example: 'CH-001', group: 'Personal' },
      { key: 'NOMBRE_APELLIDO', label: 'Nombre y Apellido Chofer', description: 'Nombre del chofer', example: 'González Roberto', group: 'Personal' },
      { key: 'LEGAJO', label: 'Nº de Legajo', description: 'Legajo laboral', example: 'LEG-1042', group: 'Personal' },
      { key: 'TIPO_COMB', label: 'Tipo de Combustible', description: 'DIESEL, NAFTA, etc.', required: true, example: 'DIESEL', group: 'Carga' },
      { key: 'CANTIDAD', label: 'Cantidad (Litros)', description: 'Litros cargados en el tanque', required: true, example: '150', group: 'Carga' },
      { key: 'CARGA', label: 'Tipo de Carga', description: 'Tanque lleno, Bidón, etc.', example: 'Tanque Lleno', group: 'Carga' },
      { key: 'DEPOSITO', label: 'Depósito / Estación', description: 'Estación o cisterna de origen', example: 'Estación Central', group: 'Estación' },
      { key: 'NUM_ESTACION', label: 'Nº de Estación / Surtidor', description: 'Número o identificador de surtidor', example: 'SURT-01', group: 'Estación' },
      { key: 'KILOMETRAJE', label: 'Kilometraje / Odómetro', description: 'Odómetro actual del equipo', example: '124500', group: 'Kilometraje' },
      { key: 'KILOMETROS_REC', label: 'Kilómetros Recorridos', description: 'Kms recorridos desde la última carga', example: '450', group: 'Kilometraje' },
      { key: 'AUTONOM', label: 'Autonomía / Rendimiento', description: 'Rendimiento o cálculo de autonomía', example: '3.0', group: 'Kilometraje' },
      { key: 'OBSERVACIONES', label: 'Observaciones', description: 'Detalle o notas de la carga', example: 'Despacho correcto', group: 'General' }
    ];
  }

  if (entity === 'partesDiarios') {
    return [
      { key: 'NUM_PARTE', label: 'Nº de Parte / Comprobante', description: 'NUM_PARTE en Reporte Diario o NUM_COMP en Gastos por Equipos', required: true, example: '7494', group: 'Identificación' },
      { key: 'ID', label: 'ID Único (AppSheet / Sheet)', description: 'Identificador de fila (ej. bbd24de3) para unificar Reporte Diario y Gastos por Equipos', example: 'bbd24de3', group: 'Identificación' },
      { key: 'FECHA', label: 'Fecha del Parte', description: 'Fecha de jornada (YYYY-MM-DD o DD/MM/YYYY)', required: true, example: '2026-11-07', group: 'Fechas' },
      { key: 'OBRA', label: 'Obra / Nombre Obra', description: 'Nombre real de la obra (NOMBRE_OBRA en Gastos o OBRA en Reporte Diario)', required: true, example: 'FORBICE ARROYO LAS MARTAS', group: 'Obra' },
      { key: 'CODIGO_OBRA', label: 'Código de Obra', description: 'Código o hash de la obra (CODIGO_OBRA o columna OBRA en Gastos)', example: '6ce8cd2a', group: 'Obra' },
      { key: 'SERV_MANT', label: 'Servicio / Modalidad (ALQUILER, TRASLADO)', description: 'ALQUILER, TRASLADO DE MAQUINA, OBRA, MANTENIMIENTO, etc.', example: 'ALQUILER', group: 'Obra' },
      { key: 'CODIGO_EQUIPO', label: 'Código del Equipo', description: 'Código interno de la máquina o camión', required: true, example: '7a460c08', group: 'Equipo' },
      { key: 'MARCA_MODELO', label: 'Marca / Modelo', description: 'Descripción del equipo o camión (MARCA_MODELO / MODELO_MARCA)', example: 'MINI RODILLO NIWA', group: 'Equipo' },
      { key: 'CODIGO_EMPLEADO', label: 'Código de Operador', description: 'Código interno o legajo del operador/chofer', example: '93wmhadq', group: 'Personal' },
      { key: 'NOMBRE_APELLIDO', label: 'Operador / Chofer / Responsable', description: 'NOMBRE_APELLIDO en Reporte Diario o RESPONSABLE en Gastos', required: true, example: 'MATIAS ALANIS', group: 'Personal' },
      { key: 'TIPO', label: 'Tipo (HORAS / VIAJES / DIA / TRABAJO)', description: 'Modalidad del parte (en Gastos por Equipos puede venir VENTA)', example: 'HORAS', group: 'Medición' },
      { key: 'HORA_INICIO_MAÑANA', label: 'Inicio Mañana', description: 'Hora de inicio turno mañana (HH:MM)', example: '09:00', group: 'Horarios' },
      { key: 'HORA_FIN_MAÑANA', label: 'Fin Mañana', description: 'Hora de fin turno mañana (HH:MM)', example: '13:00', group: 'Horarios' },
      { key: 'HORA_INICIO_TARDE', label: 'Inicio Tarde', description: 'Hora de inicio turno tarde (HH:MM)', example: '14:00', group: 'Horarios' },
      { key: 'HORA_FIN_TARDE', label: 'Fin Tarde', description: 'Hora de fin turno tarde (HH:MM)', example: '18:00', group: 'Horarios' },
      { key: 'HORAS TRABAJADAS', label: 'Horas Trabajadas / Cantidad Hs', description: 'HORAS TRABAJADAS, HS_CANTIDAD o CANTIDAD en Gastos por Equipos', example: '7.5', group: 'Medición' },
      { key: 'VIAJES_CANTIDAD', label: 'Cantidad de Viajes / Cant.', description: 'Cantidad de viajes (VIAJES_CANTIDAD o CANTIDAD)', example: '1', group: 'Medición' },
      { key: 'M3_POR_VIAJE', label: 'm³ por Viaje (Camiones)', description: 'Metros cúbicos transportados por viaje', example: '8', group: 'Medición' },
      { key: 'ODOM-KILOM', label: 'Horómetro / Odómetro / Kilometraje', description: 'Lectura del equipo (ODOM-KILOM o KILOMETRAJE)', example: '14520', group: 'Medición' },
      { key: 'DETALLE_TIPO', label: 'Detalle / Tipo de Trabajo', description: 'DETALLE_TIPO en Reporte Diario o DETALLE en Gastos', example: 'EXCAVACION', group: 'Detalle' },
      { key: 'DETALLE_2', label: 'Detalle 2 / Sub-detalle Trabajo', description: 'Columna DETALLE 2 de Gastos por Equipos', example: 'COMPACTACION DE PLATEA', group: 'Detalle' },
      { key: 'TIPO_MATERIAL', label: 'Tipo de Material', description: 'Material transportado o trabajado (Ripio, Piedra, Ladrillo, Adoquines, Arena)', example: 'RIPIO', group: 'Detalle' },
      { key: 'EXTRACION_ENTREGAS', label: 'Entrega / Retiro / Extracción Material', description: 'Entrega de Material, Retiro de Material, Extracción o Solo Flete', example: 'Entrega de Material', group: 'Detalle' },
      { key: 'UBICACION', label: 'Ubicación', description: 'Sector o ubicación exacta', example: 'Sector Norte', group: 'Obra' },
      { key: 'ENCARGADO_OBRA', label: 'Encargado de Obra', description: 'Nombre del supervisor/encargado', example: 'JOSE BOLIVAR', group: 'Obra' },
      { key: 'NOVEDADES', label: 'Novedades / Observación', description: 'NOVEDADES u OBSERVACION del parte', example: 'Sin novedad', group: 'General' },
      { key: 'REPARACION_MANT', label: 'Reparación / Mantenimiento', description: 'Columna REPARACION-M... del Reporte Diario', example: '', group: 'Mantenimiento' },
      { key: 'GRASA', label: 'Control Grasa', description: 'Estado de engrase del Reporte Diario', example: 'NO CONTROLADO', group: 'Mantenimiento' },
      { key: 'ACEITE', label: 'Control Aceite', description: 'Estado de aceite del Reporte Diario', example: '', group: 'Mantenimiento' },
      { key: 'FIRMA', label: 'Firma', description: 'Firma o conformidad del parte', example: 'Firmado', group: 'General' },
      { key: 'PRECIO_UNIT', label: 'Precio Unitario / Tarifa Viaje ($)', description: 'PRECIO_UNIT de Gastos por Equipos (tarifa equipo/viaje)', example: '75000', group: 'Contable' },
      { key: 'PRECIO_COSTO', label: 'Precio Costo ($)', description: 'PRECIO_COSTO de Gastos por Equipos', example: '0', group: 'Contable' },
      { key: 'TOTAL_SHEET', label: 'Total Sheet ($)', description: 'Columna TOTAL de Gastos por Equipos', example: '0', group: 'Contable' },
      { key: 'ESTADO_COBRO', label: 'Estado Cobro (DEBE / PAGADO)', description: 'Columna ESTADO de Gastos por Equipos', example: 'DEBE', group: 'Contable' },
      { key: 'EGR_ING', label: 'Movimiento (INGRESO / EGRESO)', description: 'Columna EGR_ING de Gastos por Equipos', example: 'INGRESO', group: 'Contable' }
    ];
  }

  if (entity === 'gastosMantenimiento') {
    return [
      { key: 'ID', label: 'ID Único (Sheet)', description: 'Identificador único de fila para evitar duplicados al re-sincronizar', example: '8d01d6a8', group: 'Identificación' },
      { key: 'FECHA', label: 'Fecha del Comprobante', description: 'Fecha de compra/gasto (si falta en registros viejos queda incompleto)', required: true, example: '18/08/2023', group: 'Fechas' },
      { key: 'NUM_COMP', label: 'Nº Comprobante / Factura', description: 'Número de comprobante, remito o nota de crédito', required: true, example: '0006-00044573', group: 'Identificación' },
      { key: 'CODIGO_EQUIPO', label: 'Código de Equipo', description: 'Código o ID interno del equipo en la flota', example: '65c849ad', group: 'Equipo' },
      { key: 'MARCA_MODELO', label: 'Equipo / Marca y Modelo', description: 'Nombre del vehículo o máquina afectada', required: true, example: 'TOYOTA HILUX 4X2 C.S.', group: 'Equipo' },
      { key: 'TIPO', label: 'Tipo / Rubro de Gasto', description: 'Se mapea a categoría del sistema conservando el rubro original (MOTOR, FILTROS, etc.)', required: true, example: 'MOTOR', group: 'Clasificación' },
      { key: 'DESCRIPCION', label: 'Concepto / Descripción', description: 'Detalle del repuesto o reparación (tolera DESCRPCION)', required: true, example: 'TAPA DE CILINDRO', group: 'Clasificación' },
      { key: 'MARCA', label: 'Marca Repuesto / Insumo', description: 'Marca comercial del repuesto o ALTERNATIVO / ORIGINALES', example: 'ALTERNATIVO', group: 'Clasificación' },
      { key: 'CANTIDAD', label: 'Cantidad', description: 'Cantidad de ítems o unidades', example: '1', group: 'Importe' },
      { key: 'MONTO', label: 'Monto Total ($)', description: 'Importe total en pesos (tolera decimales con coma y notas de crédito negativas)', required: true, example: '49426,57', group: 'Importe' },
      { key: 'RAZON_SOCIAL', label: 'Proveedor / Razón Social', description: 'Proveedor, taller o casa de repuestos', required: true, example: 'LOPEZ DIESEL S.A.', group: 'Proveedor' },
      { key: 'CODIGO_EMPLEADO', label: 'Código de Empleado', description: 'Código interno del responsable o comprador', example: '541de778', group: 'Personal' },
      { key: 'RESPONSABLE', label: 'Responsable / Chofer', description: 'Persona que realizó o retiró el gasto', example: 'RODRIGUEZ EFRAIN', group: 'Personal' },
      { key: 'FOTO', label: 'Foto / Adjunto (Opcional)', description: 'Ruta o referencia legacy de imagen (podés dejar sin asignar si no se usa)', example: 'GASTOS_Images/8d01d6a8.FOTO.jpg', group: 'Extras' },
      { key: 'OBSERVACIONES', label: 'Observaciones', description: 'Notas adicionales del comprobante', example: '', group: 'Extras' }
    ];
  }

  // Fallback for other entities
  const config = ENTITY_CONFIGS[entity];
  return config.baseHeaders.map(h => ({
    key: h,
    label: h.replace(/_/g, ' '),
    description: config.fieldDescriptions[h] || `Campo ${h}`,
    required: h === 'ID' || h === 'CODIGO_EQUIPO' || h === 'NOMBRE_APELLIDO' || h === 'NUM_PARTE'
  }));
}

/**
 * Empareja inteligentemente las columnas del archivo importado con los campos del sistema
 */
export function getSmartColumnMapping(
  entity: EntityType,
  detectedHeaders: string[]
): Record<string, string> {
  const fields = getSystemFieldDefinitions(entity);
  const mapping: Record<string, string> = {};

  const clean = (s: string) => s.toLowerCase().replace(/[\s\-_./\\()#º°:]+/g, '');
  const normList = detectedHeaders.map(h => normalizeHeaderKey(h));
  const isGastosPorEquipos =
    entity === 'partesDiarios' &&
    (normList.includes('DETALLE_2') ||
      normList.includes('NUM_COMP') ||
      normList.includes('EGR_ING') ||
      (normList.includes('NOMBRE_OBRA') && normList.includes('OBRA')));

  fields.forEach(field => {
    const sysKey = field.key;
    const cleanSysKey = clean(sysKey);
    const cleanLabel = clean(field.label);

    let found: string | undefined;

    // Disambiguación especial para "GASTOS POR EQUIPOS" antes de coincidencias exactas
    if (isGastosPorEquipos) {
      if (sysKey === 'OBRA') {
        found = detectedHeaders.find(h => normalizeHeaderKey(h) === 'NOMBRE_OBRA');
      } else if (sysKey === 'CODIGO_OBRA') {
        found = detectedHeaders.find(h => normalizeHeaderKey(h) === 'OBRA') || detectedHeaders.find(h => normalizeHeaderKey(h) === 'CODIGO_OBRA');
      } else if (sysKey === 'NUM_PARTE') {
        found = detectedHeaders.find(h => normalizeHeaderKey(h) === 'NUM_COMP') || detectedHeaders.find(h => normalizeHeaderKey(h) === 'NUM_PARTE');
      } else if (sysKey === 'DETALLE_TIPO') {
        found = detectedHeaders.find(h => normalizeHeaderKey(h) === 'DETALLE');
      } else if (sysKey === 'DETALLE_2') {
        found = detectedHeaders.find(h => normalizeHeaderKey(h) === 'DETALLE_2');
      } else if (sysKey === 'NOMBRE_APELLIDO') {
        found = detectedHeaders.find(h => normalizeHeaderKey(h) === 'RESPONSABLE') || detectedHeaders.find(h => normalizeHeaderKey(h) === 'NOMBRE_APELLIDO');
      } else if (sysKey === 'HORAS TRABAJADAS') {
        found = detectedHeaders.find(h => normalizeHeaderKey(h) === 'CANTIDAD');
      }
    }

    // 1. Exact match in detectedHeaders
    if (!found) {
      found = detectedHeaders.find(h => h.trim() === sysKey);
    }

    // 2. Exact match case-insensitive
    if (!found) {
      found = detectedHeaders.find(h => h.trim().toUpperCase() === sysKey.toUpperCase());
    }

    // 3. Normalized header match
    if (!found) {
      found = detectedHeaders.find(h => normalizeHeaderKey(h) === normalizeHeaderKey(sysKey));
    }

    // 4. Clean match with label or key
    if (!found) {
      found = detectedHeaders.find(h => {
        const c = clean(h);
        return c === cleanSysKey || c === cleanLabel;
      });
    }

    // 5. Custom entity-specific alias rules
    if (!found) {
      if (sysKey === 'NUM_VALE' || sysKey === 'N_DE_ORDEN') {
        found = detectedHeaders.find(h => /^(num|nro|n|numero)?[\s_.\-°º]*(vale|comprobante|ticket|orden|comp)$/i.test(h.trim()) || /(n.*orden|vale|comprobante)/i.test(h));
      } else if (sysKey === 'NUM_PARTE') {
        found = detectedHeaders.find(h => /(num.*parte|nro.*parte|n.*parte|num.*comp|parte|boleta)/i.test(h));
      } else if (sysKey === 'OBRA') {
        found = detectedHeaders.find(h => /^(nombre.*obra|obra|proyecto|frente|cliente)$/i.test(h.trim()) || /(nombre.*obra|obra)/i.test(h));
      } else if (sysKey === 'CODIGO_OBRA') {
        found = detectedHeaders.find(h => /(cod.*obra|codigo.*obra|nro.*obra)/i.test(h));
      } else if (sysKey === 'SERV_MANT') {
        found = detectedHeaders.find(h => /(serv.*mant|servicio|modalidad)/i.test(h));
      } else if (sysKey === 'HORAS TRABAJADAS' || sysKey === 'HS_CANTIDAD') {
        found = detectedHeaders.find(h => /(horas.*trab|hs.*cant|total.*horas|cant.*horas|^horas$|^hs$)/i.test(h.trim()));
      } else if (sysKey === 'HORA_INICIO_MAÑANA') {
        found = detectedHeaders.find(h => /(hora.*ini.*man|ini.*man|entrada|hora.*inicio|desde)/i.test(h));
      } else if (sysKey === 'HORA_FIN_MAÑANA') {
        found = detectedHeaders.find(h => /(hora.*fin.*man|fin.*man|salida.*man)/i.test(h));
      } else if (sysKey === 'HORA_INICIO_TARDE') {
        found = detectedHeaders.find(h => /(hora.*ini.*tar|ini.*tar|inicio.*tarde)/i.test(h));
      } else if (sysKey === 'HORA_FIN_TARDE') {
        found = detectedHeaders.find(h => /(hora.*fin.*tar|fin.*tar|hora.*salida|hora.*fin|hasta)/i.test(h));
      } else if (sysKey === 'VIAJES_CANTIDAD') {
        found = detectedHeaders.find(h => /(viajes|cant.*viajes|nro.*viajes)/i.test(h));
      } else if (sysKey === 'M3_POR_VIAJE') {
        found = detectedHeaders.find(h => /(m3.*viaje|metros.*cubicos|m3)/i.test(h));
      } else if (sysKey === 'TIPO_MATERIAL') {
        found = detectedHeaders.find(h => /(material|tipo.*material|arido)/i.test(h));
      } else if (sysKey === 'EXTRACION_ENTREGAS') {
        found = detectedHeaders.find(h => /(extrac|entregas|retiro|cantera)/i.test(h));
      } else if (sysKey === 'DETALLE_TIPO') {
        found = detectedHeaders.find(h => /^(detalle|detalle_tipo|tarea|trabajos|actividad)$/i.test(h.trim()) || /(detalle.*tipo|tarea|trabajos|actividad)/i.test(h));
      } else if (sysKey === 'DETALLE_2') {
        found = detectedHeaders.find(h => /^detalle[\s_]*2$/i.test(h.trim()));
      } else if (sysKey === 'ENCARGADO_OBRA') {
        found = detectedHeaders.find(h => /(encargado|supervisor|capataz)/i.test(h));
      } else if (sysKey === 'UBICACION') {
        found = detectedHeaders.find(h => /(ubicacion|lugar|sector|zona)/i.test(h));
      } else if (sysKey === 'NOVEDADES') {
        found = detectedHeaders.find(h => /(novedad|observ|nota|coment)/i.test(h));
      } else if (sysKey === 'REPARACION_MANT') {
        found = detectedHeaders.find(h => /^reparacion/i.test(h.trim()));
      } else if (sysKey === 'GRASA') {
        found = detectedHeaders.find(h => /grasa/i.test(h));
      } else if (sysKey === 'ACEITE') {
        found = detectedHeaders.find(h => /aceite/i.test(h));
      } else if (sysKey === 'FIRMA') {
        found = detectedHeaders.find(h => /firma/i.test(h));
      } else if (sysKey === 'PRECIO_UNIT') {
        found = detectedHeaders.find(h => /(precio.*unit|tarifa.*viaje|valor.*viaje)/i.test(h));
      } else if (sysKey === 'PRECIO_COSTO') {
        found = detectedHeaders.find(h => /(precio.*costo|^costo$)/i.test(h.trim()));
      } else if (sysKey === 'TOTAL_SHEET') {
        found = detectedHeaders.find(h => /^total$/i.test(h.trim()));
      } else if (sysKey === 'ESTADO_COBRO') {
        found = detectedHeaders.find(h => /^estado$/i.test(h.trim()));
      } else if (sysKey === 'EGR_ING') {
        found = detectedHeaders.find(h => /(egr.*ing|movimiento)/i.test(h));
      } else if (sysKey === 'FECHA_EMISION' || sysKey === 'FECHA') {
        found = detectedHeaders.find(h => /fecha/i.test(h));
      } else if (sysKey === 'HORA_EMISION' || sysKey === 'HORA') {
        found = detectedHeaders.find(h => /^hora$|hora.*desp|hora.*carg|hora.*emi/i.test(h.trim()));
      } else if (sysKey === 'CODIGO_EQUIPO') {
        found = detectedHeaders.find(h => /(cod.*equipo|codigo.*equipo|equipo|unidad|movil|camion|maquina)/i.test(h));
      } else if (sysKey === 'MARCA_MODELO') {
        found = detectedHeaders.find(h =>
          entity === 'gastosMantenimiento'
            ? /(marca.*modelo|modelo.*marca|^modelo$|^vehiculo$|equipo.*desc)/i.test(h.trim())
            : /(marca.*modelo|modelo.*marca|modelo|marca|vehiculo|descripcion)/i.test(h)
        );
      } else if (sysKey === 'MARCA') {
        found = detectedHeaders.find(h => /^marca$|^marca[\s_]*repuesto$/i.test(h.trim()));
      } else if (sysKey === 'NUM_COMP') {
        found = detectedHeaders.find(h => /^(num[\s_.]*comp|nro[\s_.]*comp|numero[\s_.]*comprobante|comprobante|factura)$/i.test(h.trim()) || /(num.*comp|nro.*comp|comprobante|factura)/i.test(h));
      } else if (sysKey === 'DESCRIPCION') {
        found = detectedHeaders.find(h => /^(descrp?cion|concepto|detalle)$/i.test(h.trim()) || /(descrp?cion|concepto|detalle)/i.test(h));
      } else if (sysKey === 'MONTO') {
        found = detectedHeaders.find(h => /^(monto|monto[\s_]*total|importe|importe[\s_]*total|total)$/i.test(h.trim()) || /(monto|importe)/i.test(h));
      } else if (sysKey === 'RAZON_SOCIAL') {
        found = detectedHeaders.find(h => /^(razon[\s_]*social|proveedor|taller|comercio)$/i.test(h.trim()) || /(razon.*social|proveedor|taller)/i.test(h));
      } else if (sysKey === 'RESPONSABLE') {
        found = detectedHeaders.find(h => /^(responsable|empleado|nombre[\s_]*apellido|chofer|mecanico)$/i.test(h.trim()) || /(responsable|mecanico|chofer)/i.test(h));
      } else if (sysKey === 'TIPO') {
        found = detectedHeaders.find(h => /^(tipo|categoria|rubro)$/i.test(h.trim()));
      } else if (sysKey === 'FOTO') {
        found = detectedHeaders.find(h => /^foto/i.test(h.trim()));
      } else if (sysKey === 'PATENTE') {
        found = detectedHeaders.find(h => /(patente|dominio|matricula|placa)/i.test(h));
      } else if (sysKey === 'CODIGO_EMPLEADO') {
        found = detectedHeaders.find(h => /(cod.*empleado|cod.*chofer|chofer.*cod|cod.*operador|id.*chofer)/i.test(h));
      } else if (sysKey === 'NOMBRE_APELLIDO') {
        found = detectedHeaders.find(h => /(nombre|apellido|chofer|conductor|operador|empleado|maquinista|responsable)/i.test(h));
      } else if (sysKey === 'LEGAJO') {
        found = detectedHeaders.find(h => /legajo/i.test(h));
      } else if (sysKey === 'TIPO_COMBUSTIBLE' || sysKey === 'TIPO_COMB') {
        found = detectedHeaders.find(h => /(combustible|tipo.*comb|producto|gasoil|nafta)/i.test(h));
      } else if (sysKey === 'LITROS_AUTORIZADOS' || sysKey === 'CANTIDAD') {
        found = detectedHeaders.find(h => /(litros.*aut|cant.*aut|litros|cantidad|cant|volumen)/i.test(h));
      } else if (sysKey === 'TIPO_CARGA' || sysKey === 'CARGA') {
        found = detectedHeaders.find(h => /(tipo.*carga|^carga$|modalidad)/i.test(h.trim()));
      } else if (sysKey === 'ESTACION_SURTIDOR' || sysKey === 'DEPOSITO') {
        found = detectedHeaders.find(h => /(estacion|surtidor|proveedor|deposito|cisterna|ypf|shell|axion)/i.test(h));
      } else if (sysKey === 'NUM_ESTACION') {
        found = detectedHeaders.find(h => /(num.*estacion|nro.*estacion|estacion.*num)/i.test(h));
      } else if (sysKey === 'NUM_TICKET_ESTACION') {
        found = detectedHeaders.find(h => /(ticket|nro.*ticket|num.*ticket|factura)/i.test(h));
      } else if (sysKey === 'LITROS_REALES') {
        found = detectedHeaders.find(h => /(litros.*real|cant.*real|despacho|cargados)/i.test(h));
      } else if (sysKey === 'DIFERENCIA_LTS') {
        found = detectedHeaders.find(h => /(diferencia|dif.*lts|desvio)/i.test(h));
      } else if (sysKey === 'ODOMETRO_SALIDA') {
        found = detectedHeaders.find(h => /(odometro.*salida|km.*salida|salida)/i.test(h));
      } else if (sysKey === 'ODOMETRO_CARGA' || sysKey === 'KILOMETRAJE' || sysKey === 'ODOM-KILOM') {
        found = detectedHeaders.find(h => /(odom.*kilom|odometro|kilometraje|kms\/hs|kms_hs|^km$|horometro|km.*carga)/i.test(h.trim()));
      } else if (sysKey === 'KILOMETROS_REC') {
        found = detectedHeaders.find(h => /(kilometros.*rec|kms.*rec|km.*recorrido|recorridos)/i.test(h));
      } else if (sysKey === 'AUTONOM') {
        found = detectedHeaders.find(h => /(autonom|rendimiento)/i.test(h));
      } else if (sysKey === 'IMPORTE_TOTAL') {
        found = detectedHeaders.find(h => /(importe|total|monto|precio.*total|valor|costo)/i.test(h));
      } else if (sysKey === 'ESTADO') {
        found = detectedHeaders.find(h => /(estado|status|condicion)/i.test(h));
      } else if (sysKey === 'FECHA_RENDICION') {
        found = detectedHeaders.find(h => /(fecha.*rendicion|rendicion.*fecha|rendido)/i.test(h));
      } else if (sysKey === 'OBSERVACIONES') {
        found = detectedHeaders.find(h => /(observaciones|notas|detalle|comentarios)/i.test(h));
      }
    }

    mapping[sysKey] = found || '';
  });

  return mapping;
}

/**
 * Exporta la Tabla Base / Plantilla vacía con encabezados oficiales y una fila de ejemplo
 */
export function exportBaseTableTemplate(entity: EntityType, format: 'csv' | 'xlsx' = 'xlsx'): void {
  const config = ENTITY_CONFIGS[entity];
  const filename = `plantilla_base_${entity}_la_hormiga.${format}`;

  if (format === 'xlsx') {
    const wsData = [
      config.baseHeaders,
      config.baseHeaders.map(h => config.sampleRow[h] ?? '')
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Styling: Column widths
    const colWidths = config.baseHeaders.map(h => ({
      wch: Math.max(h.length + 4, 15)
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, config.singularTitle);
    XLSX.writeFile(wb, filename);
  } else {
    // CSV with UTF-8 BOM and semicolon separator
    const headerLine = config.baseHeaders.join(';');
    const sampleLine = config.baseHeaders
      .map(h => {
        const val = config.sampleRow[h] ?? '';
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(';');

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headerLine, sampleLine].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Exporta la tabla con todos los datos existentes en formato Excel (.xlsx) o CSV (.csv)
 */
export function exportEntityData(
  entity: EntityType,
  data: any[],
  format: 'xlsx' | 'csv' = 'xlsx'
): void {
  const config = ENTITY_CONFIGS[entity];
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `la_hormiga_${entity}_${dateStr}.${format}`;

  if (format === 'xlsx') {
    // Convert array of objects to worksheet using base headers
    const rows = data.map(item => {
      const rowObj: Record<string, any> = {};
      config.baseHeaders.forEach(h => {
        rowObj[h] = extractValueForHeader(entity, item, h);
      });
      return rowObj;
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header: config.baseHeaders });

    // Set auto column widths
    const colWidths = config.baseHeaders.map(h => ({
      wch: Math.max(h.length + 4, 14)
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, config.singularTitle);
    XLSX.writeFile(wb, filename);
  } else {
    // CSV export
    const rows = data.map(item => {
      return config.baseHeaders.map(h => {
        const val = extractValueForHeader(entity, item, h);
        if (typeof val === 'number') return val;
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [
      config.baseHeaders.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function extractValueForHeader(entity: EntityType, item: any, header: string): any {
  const norm = normalizeHeaderKey(header);

  if (entity === 'flota') {
    switch (norm) {
      case 'ID': return item.id || '';
      case 'CODIGO_EQUIPO': return item.codigoEquipo || '';
      case 'MODELO_MARCA': return item.modeloMarca || '';
      case 'ANIO': return item.anio ?? '';
      case 'PATENTE': return item.patente || '';
      case 'CODIGO_INTERNO': return item.codigoInterno || '';
      case 'FOTOGRAFIA': return item.fotografia || '';
      case 'PRECIO_COSTO_DIA': return item.precioCosto ?? 0;
      case 'PRECIO_SUGERIDO_DIA': return item.precioSugerido ?? 0;
      case 'PRECIO_COSTO_HORA': return item.precioCostoHora ?? 0;
      case 'PRECIO_SUGERIDO_HORA': return item.precioSugeridoHora ?? 0;
      case 'MODALIDAD': return item.modalidadTarifa || 'AMBOS';
      case 'CLASIFICACION': return item.clasificacion || '';
      case 'ESTADO': return item.estado || '';
      case 'HOROMETRO': return item.horometro ?? '';
      case 'UBICACION': return item.ubicacionActual || '';
      case 'FECHA_ALTA': return item.fechaAlta || '';
    }
  }

  if (entity === 'empleados') {
    switch (norm) {
      case 'ID': return item.id || '';
      case 'CODIGO_EMPLEADO': return item.codigoEmpleado || '';
      case 'NOMBRE_APELLIDO': return item.nombreApellido || '';
      case 'LEGAJO': return item.legajo || '';
      case 'CATEGORIA': return item.categoria || '';
      case 'FOTO': return item.foto || '';
      case 'SECTOR': return item.sector || '';
      case 'OBRA': return item.obra || '';
      case 'ESTADO': return item.estado || '';
      case 'DNI': return item.dni || '';
      case 'TELEFONO': return item.telefono || '';
      case 'EQUIPO_ASIGNADO': return item.vehiculoAsignadoId || '';
      case 'COSTO_DIA': return item.costoPorDia ?? 0;
      case 'FECHA_ALTA': return item.fechaAlta || '';
    }
  }

  if (entity === 'expendio') {
    switch (norm) {
      case 'ID': return item.id || '';
      case 'CARGA': return item.carga || item.tipoCarga || '';
      case 'TIPO': return item.tipo || 'Despacho Directo';
      case 'ID_COMBUSTIBLE': return item.idCombustible || 'COMB-D500';
      case 'DEPOSITO': return item.deposito || item.numEstacion || '';
      case 'CANTIDAD': return item.cantidad ?? 0;
      case 'TIPO_COMB': return item.tipoComb || item.combustible || '';
      case 'CODIGO_EMPLEADO': return item.codigoEmpleado || '';
      case 'NOMBRE_APELLIDO': return item.nombreApellido || '';
      case 'LEGAJO': return item.legajo || '';
      case 'CODIGO_EQUIPO': return item.codigoEquipo || '';
      case 'MARCA_MODELO': return item.marcaModelo || '';
      case 'PATENTE': return item.patente || '';
      case 'N_DE_ORDEN':
      case 'NUM_ORDEN':
      case 'NUM_VALE': return item.numOrden || item.numVale || item.numComprobante || '';
      case 'FECHA': return item.fecha || item.fechaEmision || '';
      case 'KILOMETRAJE': return item.kilometraje ?? item.horometroOdometro ?? 0;
      case 'HORA': return item.hora || item.horaEmision || '';
      case 'KILOMETROS_REC': return item.kilometrosRec ?? 0;
      case 'AUTONOM': return item.autonom || '';
      case 'NUM_ESTACION': return item.numEstacion || '';
      case 'FOTO_EXPENDIO': return item.fotoExpendio || '';
      case 'FOTO_KILOMETRAJE': return item.fotoKilometraje || '';
    }
  }

  if (entity === 'vales') {
    switch (norm) {
      case 'ID': return item.id || '';
      case 'NUM_VALE': return item.numVale || item.numComprobante || '';
      case 'ESTADO': return item.estado || 'EMITIDO';
      case 'FECHA_EMISION': return item.fechaEmision || '';
      case 'HORA_EMISION': return item.horaEmision || '';
      case 'CODIGO_EQUIPO': return item.codigoEquipo || '';
      case 'MARCA_MODELO': return item.marcaModelo || '';
      case 'PATENTE': return item.patente || '';
      case 'CODIGO_EMPLEADO': return item.codigoEmpleado || '';
      case 'NOMBRE_APELLIDO': return item.nombreApellido || '';
      case 'LEGAJO': return item.legajo || '';
      case 'TIPO_COMBUSTIBLE': return item.tipoComb || '';
      case 'ID_COMBUSTIBLE': return item.idCombustible || '';
      case 'LITROS_AUTORIZADOS': return item.litrosAutorizados ?? 0;
      case 'TIPO_CARGA': return item.tipoCarga || '';
      case 'ESTACION_SURTIDOR': return item.estacionSurtidor || '';
      case 'NUM_ESTACION': return item.numEstacion || '';
      case 'ODOMETRO_SALIDA': return item.odometroSalida ?? '';
      case 'NUM_TICKET_ESTACION': return item.numTicket || '';
      case 'LITROS_REALES': return item.litrosReales ?? '';
      case 'DIFERENCIA_LTS': return item.diferenciaLitros ?? '';
      case 'ODOMETRO_CARGA': return item.odometroCarga ?? '';
      case 'IMPORTE_TOTAL': return item.importeTotal ?? '';
      case 'FECHA_RENDICION': return item.fechaRendicion || '';
      case 'ID_EXPENDIO_VINCULADO': return item.expendioId || '';
      case 'OBSERVACIONES': return item.observaciones || '';
    }
  }

  if (entity === 'partesDiarios') {
    switch (norm) {
      case 'ID': return item.id || '';
      case 'SERV_MANT': return item.servMant || '';
      case 'OBRA': return item.obra || '';
      case 'CODIGO_OBRA': return item.codigoObra || '';
      case 'CODIGO_EQUIPO': return item.codigoEquipo || '';
      case 'MARCA_MODELO': return item.marcaModelo || '';
      case 'CODIGO_EMPLEADO': return item.codigoEmpleado || '';
      case 'NOMBRE_APELLIDO': return item.nombreApellido || '';
      case 'FECHA': return item.fecha || '';
      case 'HORA_INICIO_MANANA':
      case 'HORA_INICIO_MAÑANA': return item.horaInicioMañana || '';
      case 'HORA_FIN_MANANA':
      case 'HORA_FIN_MAÑANA': return item.horaFinMañana || '';
      case 'HORA_INICIO_TARDE': return item.horaInicioTarde || '';
      case 'HORA_FIN_TARDE': return item.horaFinTarde || '';
      case 'HORAS_TRABAJADAS': return item.horasTrabajadas ?? item.hsCantidad ?? 0;
      case 'ODOM_KILOM': return item.odomKilom ?? 0;
      case 'TIPO': return item.tipo || 'HORAS';
      case 'DETALLE_TIPO': return item.detalleTipo || item.detalleEntrega || '';
      case 'DETALLE_2': return item.detalle2 || '';
      case 'VIAJES_CANTIDAD': return item.viajesCantidad ?? item.cantidad ?? 0;
      case 'EXTRACION_ENTREGAS': return item.extraccionEntregas || '';
      case 'TIPO_MATERIAL': return item.tipoMaterial || '';
      case 'M3_POR_VIAJE': return item.m3PorViaje ?? 0;
      case 'TOTAL_M3': return item.totalM3 ?? 0;
      case 'HS_CANTIDAD': return item.hsCantidad ?? item.horasTrabajadas ?? 0;
      case 'NOVEDADES': return item.novedades || '';
      case 'REPARACION_MANT': return item.reparacionMant || '';
      case 'UBICACION': return item.ubicacion || '';
      case 'ENCARGADO_OBRA': return item.encargadoObra || '';
      case 'GRASA': return item.grasa || '';
      case 'ACEITE': return item.aceite || '';
      case 'FIRMA': return item.firma || '';
      case 'NUM_PARTE': return item.numParte || '';
      case 'FUENTE_ORIGEN': return item.fuenteOrigen || '';
      case 'SEPARAR_COBRANZA_MATERIAL': return item.separarCobranzaMaterial ? 'SÍ' : 'NO';
      case 'VALOR_VIAJE_EQUIPO': return item.valorViajeEquipo ?? 0;
      case 'VALOR_MATERIAL_APARTE': return item.valorMaterialAparte ?? 0;
    }
  }

  if (entity === 'gastosMantenimiento') {
    switch (norm) {
      case 'ID': return item.id || '';
      case 'FECHA': return item.fecha || '';
      case 'NUM_COMP': return item.numeroComprobante || '';
      case 'CODIGO_EQUIPO': return item.equipoPatenteOrCodigo || item.equipoId || '';
      case 'MARCA_MODELO': return item.equipoModeloMarca || '';
      case 'TIPO': return item.subcategoriaOriginal || item.categoria || '';
      case 'DESCRIPCION':
      case 'DESCRPCION': return item.concepto || '';
      case 'CANTIDAD': return item.cantidad ?? 1;
      case 'MONTO': return item.montoTotal ?? 0;
      case 'MARCA': return item.marcaRepuesto || '';
      case 'CODIGO_EMPLEADO': return item.codigoEmpleado || '';
      case 'RESPONSABLE': return item.responsableNombre || '';
      case 'RAZON_SOCIAL': return item.proveedor || '';
      case 'FOTO': return item.fotoReferencia || item.fotoComprobante || '';
      case 'OBSERVACIONES': return item.observaciones || '';
    }
  }

  return item[header] ?? '';
}

/**
 * Lee y parsea cualquier archivo (.csv, .xlsx, .xls, .txt) devolviendo array de objetos crudos
 */
export async function parseFileToObjects(file: File): Promise<any[]> {
  const fileExt = file.name.split('.').pop()?.toLowerCase();

  if (fileExt === 'xlsx' || fileExt === 'xls') {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    return rawRows;
  }

  // Text / CSV Parsing
  const text = await file.text();
  return parseCsvString(text);
}

/**
 * Parser robusto de CSV con soporte para delimitadores (; , \t |), comillas escapadas y saltos de línea
 */
export function parseCsvString(csvText: string): any[] {
  // Remove UTF-8 BOM if present
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return [];

  // Detect delimiter from the first physical line outside quotes
  const firstBreakIdx = cleanText.search(/\r\n|\n|\r/);
  const firstLine = firstBreakIdx >= 0 ? cleanText.slice(0, firstBreakIdx) : cleanText;
  const delimiters = [';', ',', '\t', '|'];
  let chosenDelim = ';';
  let maxCount = -1;

  delimiters.forEach(d => {
    const count = (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      chosenDelim = d;
    }
  });

  // Parse entire CSV honoring quoted multi-line fields and escaped "" quotes
  const records: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === chosenDelim && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell);
      if (currentRow.some(cell => cell.trim() !== '')) {
        records.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  currentRow.push(currentCell);
  if (currentRow.some(cell => cell.trim() !== '')) {
    records.push(currentRow);
  }

  if (records.length === 0) return [];

  const rawHeaders = records[0].map(h => h.trim());
  const rows: any[] = [];

  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    const rowObj: Record<string, any> = {};

    rawHeaders.forEach((h, idx) => {
      rowObj[h] = values[idx] !== undefined ? values[idx].trim() : '';
    });

    rows.push(rowObj);
  }

  return rows;
}

export const SPANISH_MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Normaliza cualquier formato de fecha (Excel serial, DD/MM/YYYY, YYYY-MM-DD, etc.) a formato estándar ISO YYYY-MM-DD.
 */
export function normalizeDateValue(
  val: any,
  preferredOrder: 'auto' | 'dmy' | 'mdy' = 'auto'
): string {
  if (val === undefined || val === null || val === '') return '';

  // 1. Objeto Date nativo
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. Número de serie de Excel (ej: 45352 -> 2024-03-01)
  if (typeof val === 'number') {
    if (val > 10000 && val < 90000) {
      const ms = Math.round((val - 25569) * 86400 * 1000);
      const dObj = new Date(ms);
      if (!isNaN(dObj.getTime())) {
        const y = dObj.getUTCFullYear();
        const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dObj.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  }

  const str = String(val).trim();
  if (!str) return '';

  // Número de serie de Excel como texto
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (num > 10000 && num < 90000) {
      const ms = Math.round((num - 25569) * 86400 * 1000);
      const dObj = new Date(ms);
      if (!isNaN(dObj.getTime())) {
        const y = dObj.getUTCFullYear();
        const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dObj.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  }

  // 3. Formato ISO: YYYY-MM-DD o YYYY/MM/DD o YYYY.MM.DD
  const isoMatch = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 4. Formato US / AppSheet (MM/DD/YYYY) vs Latam (DD/MM/YYYY)
  const partsMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (partsMatch) {
    const p1 = parseInt(partsMatch[1], 10);
    const p2 = parseInt(partsMatch[2], 10);
    const y = partsMatch[3];
    let m: number, d: number;

    if (p1 > 12 && p2 <= 12) {
      d = p1;
      m = p2;
    } else if (p2 > 12 && p1 <= 12) {
      m = p1;
      d = p2;
    } else if (preferredOrder === 'dmy') {
      d = p1;
      m = p2;
    } else {
      // AppSheet default US format MM/DD/YYYY
      m = p1;
      d = p2;
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // 5. Formato corto: DD/MM/YY o DD-MM-YY (año de 2 dígitos)
  const shortYearMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (shortYearMatch) {
    const p1 = parseInt(shortYearMatch[1], 10);
    const p2 = parseInt(shortYearMatch[2], 10);
    let d = p1;
    let m = p2;
    if (p2 > 12 && p1 <= 12) {
      m = p1;
      d = p2;
    } else if (preferredOrder === 'mdy') {
      m = p1;
      d = p2;
    }
    const yNum = parseInt(shortYearMatch[3], 10);
    const fullYear = yNum >= 50 ? 1900 + yNum : 2000 + yNum;
    return `${fullYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // 6. Fallback Date.parse
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    const dObj = new Date(parsed);
    const y = dObj.getFullYear();
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const d = String(dObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}

/**
 * Detecta si una columna de fechas usa formato DD/MM/YYYY o MM/DD/YYYY escaneando muestras.
 */
export function detectDateOrderFromSamples(values: any[]): 'dmy' | 'mdy' {
  let dmyVotes = 0;
  let mdyVotes = 0;

  for (const val of values) {
    const str = String(val ?? '').trim();
    if (!str) continue;
    const m = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (!m) continue;
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    if (p1 > 12 && p2 <= 12) dmyVotes++;
    else if (p2 > 12 && p1 <= 12) mdyVotes++;
  }

  if (mdyVotes > dmyVotes) return 'mdy';
  return 'dmy';
}

/**
 * Extrae y normaliza la fecha de una fila de datos sin procesar
 */
export function extractDateFromRawRow(
  row: any,
  _entity?: EntityType,
  preferredOrder: 'auto' | 'dmy' | 'mdy' = 'auto'
): string {
  if (!row || typeof row !== 'object') return '';

  const priorityKeys = [
    'FECHA', 'fecha', 'FECHA_EMISION', 'fechaEmision', 'FECHA_CARGA', 'fechaCarga',
    'FECHA_RENDICION', 'fechaRendicion', 'FECHA_ALTA', 'fechaAlta',
    'DIA', 'dia', 'Date', 'date', 'FECHA_PARTE', 'fechaParte', 'Fecha'
  ];

  for (const k of priorityKeys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      const norm = normalizeDateValue(row[k], preferredOrder);
      if (norm) return norm;
    }
  }

  // Búsqueda en claves que contengan fecha
  for (const k of Object.keys(row)) {
    if (/fecha|date/i.test(k) && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      const norm = normalizeDateValue(row[k], preferredOrder);
      if (norm) return norm;
    }
  }

  return '';
}

export interface MonthlySegment {
  key: string; // '2026-03'
  year: string; // '2026'
  month: string; // '03'
  monthName: string; // 'Marzo'
  label: string; // 'Marzo 2026'
  count: number;
  rows: any[];
}

export interface DateAnalysisResult {
  hasDates: boolean;
  availableYears: string[];
  availableMonths: { month: string; monthName: string; count: number }[];
  monthlySegments: MonthlySegment[];
  rowsWithoutDateCount: number;
  totalCount: number;
}

/**
 * Analiza un conjunto de filas y extrae la segmentación por año y por mes
 */
export function analyzeImportDates(rows: any[], entity?: EntityType): DateAnalysisResult {
  const segmentMap = new Map<string, { year: string; month: string; monthName: string; label: string; rows: any[] }>();
  const yearSet = new Set<string>();
  const monthCountMap = new Map<string, number>();
  let rowsWithoutDateCount = 0;

  rows.forEach(row => {
    const dateStr = extractDateFromRawRow(row, entity);
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(5, 7);
      const monthIdx = parseInt(month, 10) - 1;
      const monthName = SPANISH_MONTH_NAMES[monthIdx] || `Mes ${month}`;
      const key = `${year}-${month}`;
      const label = `${monthName} ${year}`;

      yearSet.add(year);
      monthCountMap.set(month, (monthCountMap.get(month) || 0) + 1);

      if (!segmentMap.has(key)) {
        segmentMap.set(key, { year, month, monthName, label, rows: [] });
      }
      segmentMap.get(key)!.rows.push(row);
    } else {
      rowsWithoutDateCount++;
    }
  });

  const availableYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));
  
  const monthlySegments: MonthlySegment[] = Array.from(segmentMap.entries())
    .map(([key, data]) => ({
      key,
      year: data.year,
      month: data.month,
      monthName: data.monthName,
      label: data.label,
      count: data.rows.length,
      rows: data.rows
    }))
    .sort((a, b) => b.key.localeCompare(a.key)); // más recientes primero

  const availableMonths = Array.from(monthCountMap.entries())
    .map(([month, count]) => {
      const mIdx = parseInt(month, 10) - 1;
      return {
        month,
        monthName: SPANISH_MONTH_NAMES[mIdx] || `Mes ${month}`,
        count
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    hasDates: yearSet.size > 0,
    availableYears,
    availableMonths,
    monthlySegments,
    rowsWithoutDateCount,
    totalCount: rows.length
  };
}

/**
 * Transforma y valida los datos crudos importados al tipo de dato destino
 */
export interface ImportTransformContext {
  obras?: any[];
  fleet?: Vehicle[];
  employees?: Employee[];
  dateOrder?: 'auto' | 'dmy' | 'mdy';
}

export type SheetJoinStrategy = 'outer' | 'left' | 'inner';

export interface TwoSheetCombineStats {
  matchedCount: number;
  onlyPrimaryCount: number;
  onlySecondaryCount: number;
  totalCombinedCount: number;
}

export interface CombinedItemEntry<T = any> {
  item: T;
  sourceTag: 'H1+H2' | 'H1' | 'H2';
  primaryIndex?: number;
  secondaryIndex?: number;
  joinKey: string;
}

export function getEntityJoinKey(entity: EntityType, item: any, explicitJoinId?: string): string {
  const rawJoinId = String(explicitJoinId || '').trim();
  if (rawJoinId) {
    return `ID:${rawJoinId.toUpperCase()}`;
  }
  if (!item) return '';
  if (entity === 'flota') return String(item.codigoEquipo || item.id || item.patente || '').toUpperCase().trim();
  if (entity === 'empleados') return String(item.codigoEmpleado || item.legajo || item.dni || item.id || '').toUpperCase().trim();
  if (entity === 'expendio') return String(item.numOrden || item.id || '').toUpperCase().trim();
  if (entity === 'vales') return String(item.numVale || item.numComprobante || item.id || '').toUpperCase().trim();
  if (entity === 'partesDiarios') {
    const idStr = String(item.id || '').trim();
    if (idStr && !idStr.startsWith('PD-')) return `ID:${idStr.toUpperCase()}`;
    if (item.numParte) {
      return `NP:${String(item.numParte).toUpperCase().trim()}__${String(item.codigoEquipo || '').toUpperCase().trim()}`;
    }
    return idStr.toUpperCase();
  }
  if (entity === 'obras') return String(item.numero || item.id || '').toUpperCase().trim();
  if (entity === 'gastosMantenimiento') {
    const idStr = String(item.id || '').trim();
    if (idStr && !idStr.startsWith('EXP-')) return `ID:${idStr.toUpperCase()}`;
    return idStr.toUpperCase();
  }
  return String(item.id || '').trim();
}

const GENERIC_PLACEHOLDERS_BY_FIELD: Record<string, Set<string>> = {
  obra: new Set(['Base Central / Obra General']),
  codigoObra: new Set(['OBRA-01']),
  codigoEquipo: new Set(['EQ-01', 'EQUIPO-01']),
  marcaModelo: new Set(['Equipo Flota']),
  codigoEmpleado: new Set(['EMP-101', '541de778', 'CH-001']),
  nombreApellido: new Set(['Operador / Responsable', 'Chofer Operativo', 'Chofer Asignado']),
  autorizado: new Set(['NO CONTROLADO']),
  detalleTipo: new Set(['Operaciones en obra']),
  servMant: new Set(['ALQUILER']),
  firma: new Set(['Importado Gastos (VENTA)', 'Firmado', 'No firmado']),
};

export function mergeEntityRecords(entity: EntityType, existing: any, incoming: any): any {
  const result: Record<string, any> = { ...existing };

  Object.entries(incoming || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;

    const existingVal = result[k];
    const hasExisting = existingVal !== undefined && existingVal !== null && existingVal !== '';

    // Never overwrite positive numbers with 0 from a secondary/partial sheet
    if (typeof v === 'number' && v === 0 && typeof existingVal === 'number' && existingVal > 0) {
      return;
    }

    // Never overwrite real field values with fallback defaults
    const placeholders = GENERIC_PLACEHOLDERS_BY_FIELD[k];
    if (
      placeholders &&
      typeof v === 'string' &&
      placeholders.has(v.trim()) &&
      hasExisting &&
      !placeholders.has(String(existingVal).trim())
    ) {
      return;
    }

    // Special smart merges for Partes Diarios (e.g. REPORTE_DIARIO + GASTOS POR EQUIPOS)
    if (entity === 'partesDiarios') {
      if (k === 'ubicacion' && hasExisting && v === incoming.obra && existingVal !== existing.obra) {
        return;
      }

      if (k === 'tipo') {
        const incViajes = Number(incoming.viajesCantidad || 0) > 0;
        const extViajes = Number(existing.viajesCantidad || 0) > 0;
        if (v === 'HORAS' && extViajes && existingVal === 'VIAJES') return;
        if (v === 'HORAS' && !incViajes && (existingVal === 'DIA' || existingVal === 'TRABAJO')) return;
      }

      if (k === 'detalleTipo' && hasExisting) {
        const extStr = String(existingVal).trim();
        const incStr = String(v).trim();
        if (extStr === 'Operaciones en obra' && incStr !== 'Operaciones en obra') {
          result[k] = incStr;
          return;
        }
        if (incStr === 'Operaciones en obra') return;
        const extUp = extStr.toUpperCase();
        const incUp = incStr.toUpperCase();
        if (incUp.includes(extUp)) {
          result[k] = incStr;
          return;
        }
        if (extUp.includes(incUp)) {
          return;
        }
        result[k] = `${extStr} — ${incStr}`;
        return;
      }

      if (k === 'fuenteOrigen' && hasExisting && existingVal !== v) {
        result[k] = 'REPORTE_DIARIO + GASTOS';
        return;
      }

      if (k === 'separarCobranzaMaterial') {
        result[k] = Boolean(existingVal || v);
        return;
      }
    }

    result[k] = v;
  });

  if (entity === 'partesDiarios') {
    if (result.separarCobranzaMaterial && result.valorViajeEquipo === undefined && Number(result.precioUnitario || 0) > 0) {
      result.valorViajeEquipo = Number(result.precioUnitario);
    }
    if (Number(result.viajesCantidad || 0) > 0 && Number(result.m3PorViaje || 0) > 0 && !Number(result.totalM3 || 0)) {
      result.totalM3 = Number((Number(result.viajesCantidad) * Number(result.m3PorViaje)).toFixed(2));
    }
    if (result.detalleTipo) {
      result.detalleEntrega = result.detalleTipo;
    }
  }

  // Always preserve existing primary key ID in Supabase so ON CONFLICT (id) DO UPDATE updates in-place instead of duplicating
  if (existing?.id) {
    result.id = existing.id;
  }

  return result;
}

/**
 * Combina registros ya transformados de Hoja 1 (principal) y Hoja 2 (complementaria)
 * vinculándolos por su ID compartido (o clave alternativa de entidad).
 */
export function combineTwoSheetTransformedItems<T = any>(
  entity: EntityType,
  primaryEntries: Array<{ item: T; joinId?: string }>,
  secondaryEntries: Array<{ item: T; joinId?: string }>,
  strategy: SheetJoinStrategy = 'outer'
): { entries: CombinedItemEntry<T>[]; stats: TwoSheetCombineStats } {
  const secondaryMap = new Map<string, { item: T; index: number; consumed: boolean }>();

  secondaryEntries.forEach((sec, idx) => {
    const key = getEntityJoinKey(entity, sec.item, sec.joinId);
    if (!key) return;
    const prev = secondaryMap.get(key);
    secondaryMap.set(key, {
      item: prev ? (mergeEntityRecords(entity, prev.item, sec.item) as T) : sec.item,
      index: prev ? prev.index : idx,
      consumed: false,
    });
  });

  const combined: CombinedItemEntry<T>[] = [];
  let matchedCount = 0;
  let onlyPrimaryCount = 0;
  let onlySecondaryCount = 0;

  primaryEntries.forEach((pri, idx) => {
    const key = getEntityJoinKey(entity, pri.item, pri.joinId);
    const secMatch = key ? secondaryMap.get(key) : undefined;

    if (secMatch) {
      secMatch.consumed = true;
      matchedCount++;
      combined.push({
        item: mergeEntityRecords(entity, pri.item, secMatch.item) as T,
        sourceTag: 'H1+H2',
        primaryIndex: idx,
        secondaryIndex: secMatch.index,
        joinKey: key,
      });
    } else {
      onlyPrimaryCount++;
      if (strategy !== 'inner') {
        combined.push({
          item: pri.item,
          sourceTag: 'H1',
          primaryIndex: idx,
          joinKey: key,
        });
      }
    }
  });

  secondaryMap.forEach((sec, key) => {
    if (!sec.consumed) {
      onlySecondaryCount++;
      if (strategy === 'outer') {
        combined.push({
          item: sec.item,
          sourceTag: 'H2',
          secondaryIndex: sec.index,
          joinKey: key,
        });
      }
    }
  });

  return {
    entries: combined,
    stats: {
      matchedCount,
      onlyPrimaryCount,
      onlySecondaryCount,
      totalCombinedCount: combined.length,
    },
  };
}

export function transformImportedRows(
  entity: EntityType,
  rawRows: any[],
  existingData: any[] = [],
  mode: 'merge' | 'replace' = 'merge',
  customMapping?: Record<string, string>,
  context?: ImportTransformContext
): { validItems: any[]; count: number; errors: string[] } {
  const errors: string[] = [];
  const transformed: any[] = [];

  const genId = (prefix: string, idx: number) => {
    const timeNum = Date.now().toString().slice(-4);
    return `${prefix}-${timeNum}${idx + 1}`;
  };

  rawRows.forEach((raw, idx) => {
    try {
      // Skip completely empty rows (e.g. blank separator lines in Google Sheets / CSVs)
      if (!raw || typeof raw !== 'object' || Object.values(raw).every(v => v === undefined || v === null || String(v).trim() === '')) {
        return;
      }

      // Map all keys in raw row by normalized key
      const mapped: Record<string, any> = {};
      Object.keys(raw).forEach(origKey => {
        const norm = normalizeHeaderKey(origKey);
        mapped[norm] = raw[origKey];
        mapped[origKey] = raw[origKey];
      });

      // Apply explicit custom column mapping from user
      if (customMapping) {
        if (Object.prototype.hasOwnProperty.call(customMapping, 'DETALLE_TIPO') && !customMapping['DETALLE_TIPO']) {
          mapped['__UNASSIGNED_DETALLE_TIPO'] = true;
        }
        if (Object.prototype.hasOwnProperty.call(customMapping, 'DETALLE_2') && !customMapping['DETALLE_2']) {
          mapped['__UNASSIGNED_DETALLE_2'] = true;
        }
        if (
          customMapping['VIAJES_CANTIDAD'] &&
          customMapping['HORAS TRABAJADAS'] &&
          customMapping['VIAJES_CANTIDAD'] === customMapping['HORAS TRABAJADAS'] &&
          normalizeHeaderKey(customMapping['VIAJES_CANTIDAD']) === 'CANTIDAD'
        ) {
          mapped['__SHARED_CANTIDAD_COL'] = true;
        }
        Object.entries(customMapping).forEach(([sysKey, fileCol]) => {
          if (fileCol && fileCol !== '__none__' && raw[fileCol] !== undefined) {
            mapped[sysKey] = raw[fileCol];
            mapped[normalizeHeaderKey(sysKey)] = raw[fileCol];
          }
        });
      }

      if (entity === 'flota') {
        const item = transformVehicleRow(mapped, idx, genId);
        if (item) transformed.push(item);
      } else if (entity === 'empleados') {
        const item = transformEmployeeRow(mapped, idx, genId);
        if (item) transformed.push(item);
      } else if (entity === 'expendio') {
        const item = transformExpendioRow(mapped, idx, genId, context);
        if (item) transformed.push(item);
      } else if (entity === 'vales') {
        const item = transformIssuedVoucherRow(mapped, idx, genId, context);
        if (item) transformed.push(item);
      } else if (entity === 'partesDiarios') {
        const item = transformParteDiarioRow(mapped, idx, genId, context);
        if (item) transformed.push(item);
      } else if (entity === 'obras') {
        const item = transformObraRow(mapped, idx, genId);
        if (item) transformed.push(item);
      } else if (entity === 'gastosMantenimiento') {
        const item = transformMaintenanceExpenseRow(mapped, idx, genId, context);
        if (item) transformed.push(item);
      }
    } catch (e: any) {
      errors.push(`Fila #${idx + 1}: ${e.message || 'Error al procesar fila'}`);
    }
  });

  let finalItems: any[] = [];

  if (mode === 'replace') {
    finalItems = transformed;
  } else {
    // Merge: update existing by unique identifiers or natural keys, never duplicating
    const map = new Map<string, any>();
    const naturalParteKeyMap = new Map<string, string>(); // NP:numParte__equipo -> primaryKey in map

    const buildParteNaturalKey = (item: any): string => {
      if (entity !== 'partesDiarios' || !item?.numParte) return '';
      const np = String(item.numParte).toUpperCase().trim();
      const eq = String(item.codigoEquipo || item.marcaModelo || '').toUpperCase().trim();
      const dt = String(item.fecha || '').trim();
      return np ? `NP:${np}__${eq}__${dt}` : '';
    };

    // Load existing items into map
    existingData.forEach(item => {
      const k = getEntityJoinKey(entity, item);
      if (k) {
        map.set(k, item);
        const natK = buildParteNaturalKey(item);
        if (natK) naturalParteKeyMap.set(natK, k);
      }
    });

    // Merge or insert imported items
    transformed.forEach(item => {
      let k = getEntityJoinKey(entity, item);
      const natK = buildParteNaturalKey(item);
      if (k && !map.has(k) && natK && naturalParteKeyMap.has(natK)) {
        k = naturalParteKeyMap.get(natK)!;
      }
      if (k) {
        const existing = map.get(k);
        const merged = existing ? mergeEntityRecords(entity, existing, item) : item;
        map.set(k, merged);
        if (natK) naturalParteKeyMap.set(natK, k);
      } else {
        map.set(item.id, item);
      }
    });

    finalItems = Array.from(map.values());
  }

  return {
    validItems: finalItems,
    count: transformed.length,
    errors
  };
}

function parseNum(val: any, defaultVal: number = 0): number {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;

  let str = String(val).trim();
  str = str.replace(/[\$€ARS\s]/gi, '');

  if (!str) return defaultVal;

  // Handle time format HH:MM or HH:MM:SS (e.g. 02:30:00 -> 2.5)
  if (/^\d+:\d+(:\d+)?$/.test(str)) {
    const parts = str.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return Number((h + m / 60 + s / 3600).toFixed(2));
  }

  const commaCount = (str.match(/,/g) || []).length;
  const dotCount = (str.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Comma is decimal, dot is thousands (e.g. 1.250,50)
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Dot is decimal, comma is thousands (e.g. 1,250.50)
      str = str.replace(/,/g, '');
    }
  } else if (commaCount > 0) {
    if (commaCount > 1) {
      str = str.replace(/,/g, '');
    } else {
      // If single comma is followed by exactly 3 digits at the end (e.g. "156,852", "180,440", "15,200", "5,786"), it is a thousands separator!
      if (/^[-+]?\d{1,3},\d{3}$/.test(str)) {
        str = str.replace(',', '');
      } else {
        str = str.replace(',', '.');
      }
    }
  } else if (dotCount > 0) {
    if (dotCount > 1) {
      const lastDot = str.lastIndexOf('.');
      str = str.replace(/\./g, (match, idx) => idx === lastDot ? '.' : '');
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? defaultVal : num;
}

function transformVehicleRow(mapped: Record<string, any>, idx: number, genId: any): Vehicle | null {
  const vehicleId = 
    mapped['ID'] || 
    mapped['CODIGO_EQUIPO'] || 
    mapped['COD_EQUIPO'] || 
    mapped['CODIGO'] || 
    mapped['EQUIPO'] || 
    mapped['UNIDAD'] || 
    mapped['MAQUINA'] || 
    mapped['CODIGO_INTERNO'] || 
    genId('VEH', idx);

  const modeloMarca = 
    mapped['MODELO_MARCA'] || 
    mapped['MARCA_MODELO'] || 
    mapped['MODELO'] || 
    mapped['MARCA'] || 
    mapped['DESCRIPCION'] || 
    mapped['DETALLE'] || 
    mapped['NOMBRE'] || 
    mapped['EQUIPO_NOMBRE'] || 
    mapped['VEHICULO'] || 
    mapped['MAQUINARIA'] || 
    'Equipo Flota';

  const patente = 
    mapped['PATENTE'] || 
    mapped['DOMINIO'] || 
    mapped['MATRICULA'] || 
    mapped['PLACA'] || 
    mapped['CHAPA'] || 
    'S/P';

  const codigoInterno = 
    mapped['CODIGO_INTERNO'] || 
    mapped['INTERNO'] || 
    mapped['COD_INTERNO'] || 
    mapped['NRO_INTERNO'] || 
    mapped['NUM_INTERNO'] || 
    mapped['NUMERO_INTERNO'] || 
    mapped['CODIGO_EQUIPO'] || 
    String(vehicleId).trim();

  const estadoRaw = String(mapped['ESTADO'] || mapped['STATUS'] || mapped['CONDICION'] || 'DISPONIBLE').toUpperCase().trim();
  let estado: VehicleStatus = 'DISPONIBLE';
  if (estadoRaw === 'ALQUILADO') estado = 'ALQUILADO';
  else if (estadoRaw === 'TALLER') estado = 'TALLER';
  else if (estadoRaw === 'EN_MANTENIMIENTO' || estadoRaw === 'MANTENIMIENTO') estado = 'EN_MANTENIMIENTO';
  else if (estadoRaw === 'RESERVADO') estado = 'RESERVADO';
  else if (estadoRaw === 'FUERA_DE_SERVICIO' || estadoRaw === 'DESMOVILIZADO' || estadoRaw === 'INACTIVO') estado = 'FUERA_DE_SERVICIO';

  const clasifRaw = String(mapped['CLASIFICACION'] || mapped['CATEGORIA'] || mapped['TIPO'] || mapped['TIPO_EQUIPO'] || '').trim();
  const clasificacion: VehicleClassification = normalizeEquipmentClassification(clasifRaw, String(modeloMarca || ''));

  return {
    id: String(vehicleId).trim(),
    codigoEquipo: String(vehicleId).trim(),
    codigo: String(vehicleId).trim(),
    modeloMarca: String(modeloMarca).trim(),
    marca: String(modeloMarca).trim(),
    modelo: String(modeloMarca).trim(),
    patente: String(patente).trim(),
    anio: parseNum(mapped['ANIO'] || mapped['AÑO'] || mapped['YEAR'] || mapped['FABRICACION'] || mapped['ANIO_FABRICACION'], undefined),
    codigoInterno: String(codigoInterno).trim(),
    fotografia: mapped['FOTOGRAFIA'] || mapped['FOTO'] || mapped['IMAGEN'] || mapped['IMG'] || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80',
    precioCosto: parseNum(mapped['PRECIO_COSTO_DIA'] || mapped['PRECIO_COSTO'] || mapped['COSTO_DIA'] || mapped['COSTO_DIARIO'], 200000),
    precioSugerido: parseNum(mapped['PRECIO_SUGERIDO_DIA'] || mapped['PRECIO_SUGERIDO'] || mapped['SUGERIDO_DIA'] || mapped['PRECIO_DIA'] || mapped['ALQUILER_DIA'], 280000),
    precioCostoHora: parseNum(mapped['PRECIO_COSTO_HORA'] || mapped['COSTO_HORA'] || mapped['COSTO_HS'], 25000),
    precioSugeridoHora: parseNum(mapped['PRECIO_SUGERIDO_HORA'] || mapped['SUGERIDO_HORA'] || mapped['PRECIO_HORA'] || mapped['ALQUILER_HORA'], 35000),
    modalidadTarifa: (mapped['MODALIDAD'] || mapped['MODALIDAD_TARIFA'] || mapped['TIPO_TARIFA'] || 'AMBOS') as any,
    clasificacion,
    estado,
    horometro: parseNum(mapped['HOROMETRO'] || mapped['KILOMETRAJE'] || mapped['ODOMETRO'] || mapped['KM'] || mapped['HS'], 0),
    ubicacionActual: mapped['UBICACION'] || mapped['UBICACION_ACTUAL'] || mapped['LUGAR'] || mapped['OBRA'] || 'Base Central',
    fechaAlta: normalizeDateValue(mapped['FECHA_ALTA'] || mapped['FECHA']) || new Date().toISOString().slice(0, 10),
    ordenVisibilidad: parseNum(mapped['ORDEN_WEB'] || mapped['ORDEN_VISIBILIDAD'] || mapped['ORDEN'], idx + 1),
    publicarEnWeb: mapped['PUBLICAR_EN_WEB'] !== undefined ? String(mapped['PUBLICAR_EN_WEB']).toLowerCase() !== 'false' : true
  };
}

function transformEmployeeRow(mapped: Record<string, any>, idx: number, genId: any): Employee | null {
  const nombreApellido = mapped['NOMBRE_APELLIDO'] || mapped['NOMBRE'] || mapped['EMPLEADO'] || `Empleado ${idx + 1}`;
  const codigoEmpleado = mapped['CODIGO_EMPLEADO'] || mapped['CODIGO'] || `CH-00${idx + 1}`;
  const legajo = mapped['LEGAJO'] || `LEG-${1000 + idx}`;

  const estadoRaw = (mapped['ESTADO'] || 'ACTIVO').toUpperCase().trim();
  const validStatus: EmployeeStatus[] = ['ACTIVO', 'EN_OBRA', 'LICENCIA', 'INACTIVO'];
  const estado: EmployeeStatus = validStatus.includes(estadoRaw as EmployeeStatus) ? (estadoRaw as EmployeeStatus) : 'ACTIVO';

  return {
    id: mapped['ID'] || genId('EMP', idx),
    codigoEmpleado: String(codigoEmpleado).trim(),
    nombreApellido: String(nombreApellido).trim(),
    legajo: String(legajo).trim(),
    categoria: mapped['CATEGORIA'] || mapped['PUESTO'] || mapped['CARGO'] || 'Operador de Maquinaria',
    foto: mapped['FOTO'] || mapped['FOTOGRAFIA'] || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    sector: mapped['SECTOR'] || mapped['DEPARTAMENTO'] || 'Operaciones',
    obra: mapped['OBRA'] || mapped['PROYECTO'] || 'Base Central',
    estado,
    dni: mapped['DNI'] || mapped['DOCUMENTO'] || '',
    telefono: mapped['TELEFONO'] || mapped['CELULAR'] || '',
    vehiculoAsignadoId: mapped['EQUIPO_ASIGNADO'] || mapped['VEHICULO_ASIGNADO'] || mapped['VEHICULOASIGNADOID'] || undefined,
    costoPorDia: parseNum(mapped['COSTO_DIA'] || mapped['JORNAL'] || mapped['COSTO_POR_DIA'], 75000),
    fechaAlta: normalizeDateValue(mapped['FECHA_ALTA'] || mapped['FECHA']) || new Date().toISOString().slice(0, 10)
  };
}

function enrichEquipmentAndEmployee(
  rawEquipCode: string | undefined,
  rawMarcaModelo: string | undefined,
  rawPatente: string | undefined,
  rawEmpCode: string | undefined,
  rawEmpName: string | undefined,
  rawLegajo: string | undefined,
  context?: ImportTransformContext
) {
  let codigoEquipo = String(rawEquipCode || '').trim();
  let marcaModelo = String(rawMarcaModelo || '').trim();
  let patente = String(rawPatente || '').trim();
  let codigoEmpleado = String(rawEmpCode || '').trim();
  let nombreApellido = String(rawEmpName || '').trim();
  let legajo = String(rawLegajo || '').trim();

  if (context?.fleet && context.fleet.length > 0) {
    const eqKey = codigoEquipo.toUpperCase();
    const patKey = patente.toUpperCase();
    const foundVehicle = context.fleet.find(v =>
      (eqKey && (v.codigoEquipo?.toUpperCase() === eqKey || v.codigo?.toUpperCase() === eqKey || v.id?.toUpperCase() === eqKey || v.codigoInterno?.toUpperCase() === eqKey)) ||
      (patKey && patKey !== 'S/P' && v.patente?.toUpperCase() === patKey)
    );
    if (foundVehicle) {
      if (!codigoEquipo) codigoEquipo = foundVehicle.codigoEquipo || foundVehicle.id;
      if (!marcaModelo || marcaModelo === 'Equipo Flota') marcaModelo = foundVehicle.modeloMarca || marcaModelo;
      if (!patente || patente === 'S/P') patente = foundVehicle.patente || patente;
    }
  }

  if (context?.employees && context.employees.length > 0) {
    const empKey = codigoEmpleado.toUpperCase();
    const nameKey = nombreApellido.toUpperCase();
    const legKey = legajo.toUpperCase();
    const foundEmp = context.employees.find(e =>
      (empKey && (e.codigoEmpleado?.toUpperCase() === empKey || e.id?.toUpperCase() === empKey || e.legajo?.toUpperCase() === empKey)) ||
      (legKey && e.legajo?.toUpperCase() === legKey) ||
      (nameKey && e.nombreApellido?.toUpperCase() === nameKey)
    );
    if (foundEmp) {
      if (!codigoEmpleado) codigoEmpleado = foundEmp.codigoEmpleado || foundEmp.id;
      if (!nombreApellido) nombreApellido = foundEmp.nombreApellido;
      if (!legajo) legajo = foundEmp.legajo;
    }
  }

  return { codigoEquipo, marcaModelo, patente, codigoEmpleado, nombreApellido, legajo };
}

function transformExpendioRow(mapped: Record<string, any>, idx: number, genId: any, context?: ImportTransformContext): FuelDispensary | null {
  const numOrden = mapped['N_DE_ORDEN'] || mapped['NUM_ORDEN'] || mapped['NUM_VALE'] || mapped['COMPROBANTE'] || mapped['VALE'] || String(1000 + idx);
  const rawCant = parseNum(mapped['CANTIDAD'] || mapped['LITROS'] || mapped['VOLUMEN'] || mapped['CANT_CARGA'], 50);
  const cantidad = Math.abs(rawCant);

  const kmsVal = extractFirstNonZeroOdometer(
    mapped['KMS/HS'],
    mapped['KMS_HS'],
    mapped['KILOMETRAJE'],
    mapped['ODOMETRO'],
    mapped['HOROMETRO'],
    mapped['KM']
  );

  const kmsRecVal = extractFirstNonZeroDistance(
    mapped['KILOMETROS_REC'],
    mapped['KMS_REC'],
    mapped['KM_RECORRIDO']
  );

  const enriched = enrichEquipmentAndEmployee(
    mapped['CODIGO_EQUIPO'] || mapped['EQUIPO'],
    mapped['MARCA_MODELO'] || mapped['MODELO'],
    mapped['PATENTE'],
    mapped['CODIGO_EMPLEADO'] || mapped['CHOFER_CODIGO'],
    mapped['NOMBRE_APELLIDO'] || mapped['CHOFER'],
    mapped['LEGAJO'],
    context
  );

  const rawExpId = String(mapped['ID'] || '').trim();
  const resolvedExpFecha = normalizeDateValue(mapped['FECHA'], context?.dateOrder || 'auto') || new Date().toISOString().slice(0, 10);
  const resolvedExpEq = String(enriched.codigoEquipo || 'EQUIPO-01').trim();
  return {
    id: rawExpId || `EXP-${String(numOrden).trim()}-${resolvedExpFecha}-${resolvedExpEq}`,
    carga: mapped['CARGA'] || mapped['TIPO_CARGA'] || 'Tanque Lleno',
    tipo: mapped['TIPO'] || 'EGRESO',
    idCombustible: mapped['ID_COMBUSTIBLE'] || '50b15e07',
    deposito: mapped['DEPOSITO'] || mapped['ESTACION'] || 'Estación YPF / Shell',
    cantidad,
    cantCarga: mapped['TIPO']?.toUpperCase() === 'EGRESO' ? -cantidad : cantidad,
    tipoComb: mapped['TIPO_COMB'] || mapped['COMBUSTIBLE'] || 'DIESEL INFINIA',
    codigoEmpleado: enriched.codigoEmpleado || '541de778',
    nombreApellido: enriched.nombreApellido || 'Chofer Operativo',
    legajo: enriched.legajo || 'LEG-000',
    codigoEquipo: enriched.codigoEquipo || 'EQUIPO-01',
    marcaModelo: enriched.marcaModelo || 'Equipo Flota',
    patente: enriched.patente || 'S/P',
    numOrden: String(numOrden).trim(),
    fecha: normalizeDateValue(mapped['FECHA'], context?.dateOrder || 'auto') || new Date().toISOString().slice(0, 10),
    kilometraje: kmsVal,
    kmsHs: kmsVal,
    horometroOdometro: kmsVal,
    hora: mapped['HORA'] || '08:00',
    kilometrosRec: kmsRecVal,
    autonom: mapped['AUTONOM'] || mapped['AUTONOMIA'] || mapped['AUTONOMIA_VT'] || '',
    autonomiaVt: mapped['AUTONOMIA_VT'] || mapped['AUTONOM'] || '',
    numEstacion: mapped['NUM_ESTACION'] || mapped['ESTACION_NUM'] || '',
    fotoExpendio: mapped['FOTO_EXPENDIO'] || mapped['FOTO_TICKET'] || '',
    fotoKilometraje: mapped['FOTO_KILOMETRAJE'] || mapped['FOTO_ODOMETRO'] || '',
    clasificacion: mapped['CLASIFICACION'] || mapped['CATEGORIA'] || 'MAQUINAS',
    precioUnitario: parseNum(mapped['PRECIO_UNITARIO'], 1350),
    totalImporte: parseNum(mapped['TOTAL_IMPORTE'] || mapped['IMPORTE'], cantidad * 1350),
    estado: 'RENDIDO' as FuelVoucherStatus,
    observaciones: mapped['OBSERVACIONES'] || ''
  };
}

function transformIssuedVoucherRow(mapped: Record<string, any>, idx: number, genId: any, context?: ImportTransformContext): IssuedFuelVoucher | null {
  const numVale = mapped['NUM_VALE'] || mapped['N_DE_ORDEN'] || mapped['NUM_COMPROBANTE'] || mapped['VALE'] || mapped['COMPROBANTE'] || String(10000 + idx);
  const litrosAutorizados = Math.abs(parseNum(mapped['LITROS_AUTORIZADOS'] || mapped['CANTIDAD_AUTORIZADA'] || mapped['CANTIDAD'] || mapped['LITROS'], 100));
  const litrosReales = mapped['LITROS_REALES'] !== undefined && mapped['LITROS_REALES'] !== '' 
    ? Math.abs(parseNum(mapped['LITROS_REALES'])) 
    : (mapped['CANTIDAD'] !== undefined ? Math.abs(parseNum(mapped['CANTIDAD'])) : undefined);

  const estadoRaw = (mapped['ESTADO'] || (litrosReales ? 'RENDIDO' : 'EMITIDO')).toUpperCase().trim();
  const validStatus: IssuedVoucherStatus[] = ['EMITIDO', 'RENDIDO', 'ANULADO'];
  const estado: IssuedVoucherStatus = validStatus.includes(estadoRaw as IssuedVoucherStatus) ? (estadoRaw as IssuedVoucherStatus) : 'RENDIDO';

  const enriched = enrichEquipmentAndEmployee(
    mapped['CODIGO_EQUIPO'] || mapped['EQUIPO'],
    mapped['MARCA_MODELO'] || mapped['MODELO'],
    mapped['PATENTE'],
    mapped['CODIGO_EMPLEADO'] || mapped['CHOFER_CODIGO'],
    mapped['NOMBRE_APELLIDO'] || mapped['CHOFER'],
    mapped['LEGAJO'],
    context
  );

  const rawValId = String(mapped['ID'] || '').trim();
  return {
    id: rawValId || `VAL-${String(numVale).trim()}`,
    numVale: String(numVale).trim(),
    numComprobante: mapped['NUM_COMPROBANTE'] || String(numVale).trim(),
    estado,
    fechaEmision: normalizeDateValue(mapped['FECHA_EMISION'] || mapped['FECHA'], context?.dateOrder || 'auto') || new Date().toISOString().slice(0, 10),
    horaEmision: mapped['HORA_EMISION'] || mapped['HORA'] || '08:00',
    codigoEquipo: enriched.codigoEquipo || 'EQUIPO-01',
    marcaModelo: enriched.marcaModelo || 'Equipo Flota',
    patente: enriched.patente || 'S/P',
    codigoEmpleado: enriched.codigoEmpleado || 'CH-001',
    nombreApellido: enriched.nombreApellido || 'Chofer Asignado',
    legajo: enriched.legajo || 'LEG-000',
    tipoComb: mapped['TIPO_COMBUSTIBLE'] || mapped['TIPO_COMB'] || 'DIESEL',
    idCombustible: mapped['ID_COMBUSTIBLE'] || '50b15e07',
    litrosAutorizados,
    tipoCarga: mapped['TIPO_CARGA'] || mapped['CARGA'] || 'Tanque Lleno',
    estacionSurtidor: mapped['ESTACION_SURTIDOR'] || mapped['DEPOSITO'] || mapped['ESTACION'] || 'Estación YPF / Shell',
    numEstacion: mapped['NUM_ESTACION'] || '',
    odometroSalida: mapped['ODOMETRO_SALIDA'] !== undefined && mapped['ODOMETRO_SALIDA'] !== '' ? parseNum(mapped['ODOMETRO_SALIDA']) : undefined,
    numTicket: mapped['NUM_TICKET_ESTACION'] || mapped['NUM_TICKET'] || mapped['NUM_ESTACION'] || '',
    litrosReales,
    diferenciaLitros: litrosReales !== undefined ? litrosReales - litrosAutorizados : undefined,
    odometroCarga: mapped['ODOMETRO_CARGA'] !== undefined && mapped['ODOMETRO_CARGA'] !== '' ? parseNum(mapped['ODOMETRO_CARGA']) : parseNum(mapped['KILOMETRAJE'], 0),
    importeTotal: mapped['IMPORTE_TOTAL'] !== undefined && mapped['IMPORTE_TOTAL'] !== '' ? parseNum(mapped['IMPORTE_TOTAL']) : (litrosReales ? litrosReales * 1350 : undefined),
    fechaRendicion: mapped['FECHA_RENDICION'] || (estado === 'RENDIDO' ? mapped['FECHA_EMISION'] || mapped['FECHA'] : undefined),
    expendioId: mapped['ID_EXPENDIO_VINCULADO'] || mapped['EXPENDIO_ID'] || mapped['ID'] || undefined,
    fotoTicket: mapped['FOTO_TICKET'] || mapped['FOTO_EXPENDIO'] || '',
    fotoOdometro: mapped['FOTO_ODOMETRO'] || mapped['FOTO_KILOMETRAJE'] || '',
    observaciones: mapped['OBSERVACIONES'] || ''
  };
}

function resolveObraForParte(mappedObra?: string, mappedCodigoObra?: string, liveObras?: any[]): { obraName: string; codigoObra: string } {
  const obrasList: any[] = Array.isArray(liveObras) ? liveObras : [];

  const cleanObraName = String(mappedObra || '').trim();
  const cleanCodigo = String(mappedCodigoObra || '').trim();

  // Try finding by numero/codigoObra match if it's a valid code
  let found = obrasList.find(o => 
    (cleanCodigo && o.numero && o.numero.toLowerCase() === cleanCodigo.toLowerCase()) ||
    (cleanCodigo && o.id && o.id.toLowerCase() === cleanCodigo.toLowerCase())
  );

  // If not found by code, try finding by name match
  if (!found && cleanObraName) {
    found = obrasList.find(o => 
      o.nombreObra && o.nombreObra.toLowerCase() === cleanObraName.toLowerCase()
    );
  }

  if (found) {
    return {
      obraName: found.nombreObra,
      codigoObra: cleanCodigo || found.numero
    };
  }

  return {
    obraName: cleanObraName || 'Base Central / Obra General',
    codigoObra: cleanCodigo || 'OBRA-01'
  };
}

function calculateHoursFromTimes(iniMan?: string, finMan?: string, iniTar?: string, finTar?: string): number {
  let totalMinutes = 0;
  const parseTimeToMinutes = (t?: string) => {
    if (!t) return 0;
    const parts = t.trim().split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  };

  const im = parseTimeToMinutes(iniMan);
  const fm = parseTimeToMinutes(finMan);
  if (fm > im) totalMinutes += (fm - im);

  const it = parseTimeToMinutes(iniTar);
  const ft = parseTimeToMinutes(finTar);
  if (ft > it) totalMinutes += (ft - it);

  return Number((totalMinutes / 60).toFixed(2));
}

function inferMaterialFromText(text: string): string {
  const u = text.toUpperCase();
  if (u.includes('RIPIO GRILLAO')) return 'RIPIO GRILLAO';
  if (u.includes('RIPIO')) return 'RIPIO';
  if (u.includes('PIEDRA')) return 'PIEDRA';
  if (u.includes('LADRILLO HUECO')) return 'LADRILLO HUECO';
  if (u.includes('LADRILLON')) return 'LADRILLONES';
  if (u.includes('LADRILLO')) return 'LADRILLOS';
  if (u.includes('ADOQUIN')) return 'ADOQUINES';
  if (u.includes('CAÑO') || u.includes('CANO')) return 'CAÑOS';
  if (u.includes('ARENA')) return 'ARENA';
  if (u.includes('TOSCA')) return 'TOSCA';
  if (u.includes('TIERRA')) return 'TIERRA';
  if (u.includes('ESCOMBRO')) return 'ESCOMBROS';
  if (u.includes('HORMIGON')) return 'HORMIGÓN';
  return '';
}

function normalizeExtraccionOperacion(rawExt: string, fullDescUpper: string, tipo: string): {
  extraccionEntregas: string;
  tipoOperacionMaterial?: 'ENTREGA_MATERIAL' | 'RETIRO_MATERIAL' | 'EXTRACCION' | 'SOLO_FLETE';
} {
  const clean = rawExt.trim();
  const u = clean.toUpperCase();

  if (u.includes('RETIRO')) {
    return { extraccionEntregas: clean || 'Retiro de Material', tipoOperacionMaterial: 'RETIRO_MATERIAL' };
  }
  if (u.includes('EXTRAC')) {
    return { extraccionEntregas: clean || 'Extracción', tipoOperacionMaterial: 'EXTRACCION' };
  }
  if (u.includes('SOLO FLETE') || u.includes('FLETE')) {
    return { extraccionEntregas: clean || 'Solo Flete / Traslado', tipoOperacionMaterial: 'SOLO_FLETE' };
  }
  if (u.includes('ENTREGA')) {
    return { extraccionEntregas: clean || 'Entrega de Material', tipoOperacionMaterial: 'ENTREGA_MATERIAL' };
  }

  if (clean) {
    return { extraccionEntregas: clean, tipoOperacionMaterial: tipo === 'VIAJES' ? 'ENTREGA_MATERIAL' : undefined };
  }

  if (tipo === 'VIAJES') {
    if (/\b(RETIRO|DESMONTE|SACAR)\b/.test(fullDescUpper)) {
      return { extraccionEntregas: 'Retiro de Material', tipoOperacionMaterial: 'RETIRO_MATERIAL' };
    }
    if (/\b(FLETE|TRASLADO)\b/.test(fullDescUpper)) {
      return { extraccionEntregas: 'Solo Flete / Traslado', tipoOperacionMaterial: 'SOLO_FLETE' };
    }
    if (/\bEXTRAC/.test(fullDescUpper)) {
      return { extraccionEntregas: 'Extracción', tipoOperacionMaterial: 'EXTRACCION' };
    }
    if (/\bVIAJE/.test(fullDescUpper)) {
      return { extraccionEntregas: 'Entrega de Material', tipoOperacionMaterial: 'ENTREGA_MATERIAL' };
    }
  }

  return { extraccionEntregas: '', tipoOperacionMaterial: undefined };
}

function transformParteDiarioRow(mapped: Record<string, any>, idx: number, genId: any, context?: ImportTransformContext): any {
  const isGastosSheet = Boolean(
    mapped['NUM_COMP'] !== undefined ||
    mapped['EGR_ING'] !== undefined ||
    mapped['DETALLE_2'] !== undefined ||
    mapped['DETALLE 2'] !== undefined ||
    mapped['PRECIO_UNIT'] !== undefined ||
    ['VENTA', 'COMBUSTIBLE', 'MANTENIMIENTO', 'GASTO'].includes(String(mapped['TIPO'] || '').toUpperCase().trim())
  );

  const numParte =
    mapped['NUM_PARTE'] ||
    mapped['NUMERO_PARTE'] ||
    mapped['NUM_COMP'] ||
    mapped['N_DE_ORDEN'] ||
    mapped['NUM_ORDEN'] ||
    mapped['NUM_VALE'] ||
    String(2500 + idx);

  const rawIniM = mapped['HORA_INICIO_MAÑANA'] || mapped['HORA_INI_MAÑANA'] || mapped['HORA_INICIO_MANANA'] || mapped['HORA_ENTRADA'] || mapped['ENTRADA'] || mapped['HORA_INICIO'] || mapped['DESDE'] || mapped['INICIO'] || mapped['HORA_DESDE'] || '';
  const rawFinM = mapped['HORA_FIN_MAÑANA'] || mapped['HORA_FIN_MANANA'] || mapped['HORA_SALIDA_MAÑANA'] || mapped['FIN_MAÑANA'] || '';
  const rawIniT = mapped['HORA_INICIO_TARDE'] || mapped['HORA_INI_TARDE'] || mapped['INICIO_TARDE'] || '';
  const rawFinT = mapped['HORA_FIN_TARDE'] || mapped['HORA_SALIDA'] || mapped['SALIDA'] || mapped['HORA_FIN'] || mapped['HASTA'] || mapped['FIN'] || mapped['HORA_HASTA'] || '';

  const calcHours = calculateHoursFromTimes(rawIniM, rawFinM, rawIniT, rawFinT);

  const detalleBase = mapped['__UNASSIGNED_DETALLE_TIPO']
    ? ''
    : String(mapped['DETALLE_TIPO'] || mapped['DETALLE'] || mapped['DETALLE_DE_ENTREGA'] || mapped['TAREAS'] || '').trim();
  const detalle2Val = mapped['__UNASSIGNED_DETALLE_2']
    ? ''
    : String(mapped['DETALLE_2'] || mapped['DETALLE 2'] || '').replace(/^--+/, '').trim();
  const servMantRaw = String(mapped['SERV_MANT'] || mapped['SERVICIO'] || '').trim();
  const fullDescUpper = [detalleBase, detalle2Val, servMantRaw].filter(Boolean).join(' ').toUpperCase();

  const rawTipoCol = String(mapped['TIPO'] || '').toUpperCase().trim();
  const explicitViajesCount = mapped['__SHARED_CANTIDAD_COL'] ? 0 : parseNum(mapped['VIAJES_CANTIDAD'], 0);
  const rawCantidad = parseNum(
    mapped['CANTIDAD'] !== undefined && String(mapped['CANTIDAD']).trim() !== ''
      ? mapped['CANTIDAD']
      : (mapped['__SHARED_CANTIDAD_COL'] ? mapped['VIAJES_CANTIDAD'] : undefined),
    0
  );

  let tipo: 'HORAS' | 'VIAJES' | 'DIA' | 'TRABAJO' | 'OTRO' = 'HORAS';
  if (rawTipoCol === 'VIAJES' || rawTipoCol === 'VIAJE') tipo = 'VIAJES';
  else if (rawTipoCol === 'DIA' || rawTipoCol === 'POR DIA' || rawTipoCol === 'DÍA') tipo = 'DIA';
  else if (rawTipoCol === 'TRABAJO' || rawTipoCol === 'POR TRABAJO') tipo = 'TRABAJO';
  else if (rawTipoCol === 'OTRO') tipo = 'OTRO';
  else if (rawTipoCol === 'HORAS' || rawTipoCol === 'HORA') tipo = 'HORAS';
  else {
    // When TIPO is blank (e.g. REPORTE_DIARIO trips) or is 'VENTA' (GASTOS POR EQUIPOS)
    if (
      explicitViajesCount > 0 ||
      /\b(VIAJE|VIAJES|FLETE|PALLET|PALETS|TRASLADO|ADOQUINES|LADRILL|RETIRO DE MATERIAL|ENTREGA DE MATERIAL)\b/.test(fullDescUpper)
    ) {
      tipo = 'VIAJES';
    } else if (/\b(POR DIA|DIARIO|JORNADA)\b/.test(fullDescUpper) && !/\bHORA\b/.test(fullDescUpper)) {
      tipo = 'DIA';
    } else if (
      /\b(TRABAJO|ZANJEO|SANJEO|EXCAVACION|COMPACTACION|LIMPIEZA|NIVELACION)\b/.test(fullDescUpper) &&
      !/\bHORA\b/.test(fullDescUpper) &&
      calcHours === 0
    ) {
      tipo = 'TRABAJO';
    } else {
      tipo = 'HORAS';
    }
  }

  const rawHorasField =
    mapped['HORAS TRABAJADAS'] !== undefined && String(mapped['HORAS TRABAJADAS']).trim() !== ''
      ? mapped['HORAS TRABAJADAS']
      : mapped['HORAS_TRABAJADAS'] !== undefined && String(mapped['HORAS_TRABAJADAS']).trim() !== ''
        ? mapped['HORAS_TRABAJADAS']
        : mapped['HS_CANTIDAD'] !== undefined && String(mapped['HS_CANTIDAD']).trim() !== ''
          ? mapped['HS_CANTIDAD']
          : mapped['HORAS'] !== undefined && String(mapped['HORAS']).trim() !== ''
            ? mapped['HORAS']
            : undefined;

  const hasExplicitZeroHours =
    rawHorasField !== undefined &&
    (String(rawHorasField).trim() === '0' || String(rawHorasField).trim() === '0:00:00' || String(rawHorasField).trim() === '0:00');

  const parsedHoras = rawHorasField !== undefined
    ? parseNum(rawHorasField, 0)
    : (isGastosSheet && tipo !== 'VIAJES' ? rawCantidad : 0);

  let horasTr = 0;
  if (calcHours > 0) {
    horasTr = calcHours;
  } else if (tipo === 'VIAJES' && (isGastosSheet || mapped['__SHARED_CANTIDAD_COL'])) {
    horasTr = 0;
  } else if (parsedHoras > 0) {
    horasTr = parsedHoras;
  } else if (hasExplicitZeroHours || tipo === 'VIAJES' || tipo === 'DIA' || tipo === 'TRABAJO') {
    horasTr = 0;
  } else if (rawHorasField === undefined && !isGastosSheet && tipo === 'HORAS') {
    horasTr = 8.0;
  }

  const finalIniM = rawIniM;
  let finalFinM = rawFinM;
  const finalIniT = rawIniT;
  const finalFinT = rawFinT;

  if (rawIniM && !rawFinM && !rawIniT && !rawFinT && horasTr > 0) {
    const parts = String(rawIniM).split(':');
    const startH = parseInt(parts[0], 10) || 8;
    const startM = parseInt(parts[1], 10) || 0;
    const totalEndMin = startH * 60 + startM + Math.round(horasTr * 60);
    const endH = Math.floor(totalEndMin / 60) % 24;
    const endM = totalEndMin % 60;
    finalFinM = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  const viajesCnt =
    explicitViajesCount > 0
      ? explicitViajesCount
      : tipo === 'VIAJES'
        ? (rawCantidad > 0 ? rawCantidad : 1)
        : 0;

  // Obra resolution: in GASTOS POR EQUIPOS, NOMBRE_OBRA holds the name and OBRA holds the short ID code!
  const hasNombreObra = Boolean(mapped['NOMBRE_OBRA'] && String(mapped['NOMBRE_OBRA']).trim() !== '');
  const obraNameCandidate = hasNombreObra
    ? mapped['NOMBRE_OBRA']
    : (mapped['OBRA'] || mapped['DEPOSITO']);
  const codigoObraCandidate =
    mapped['CODIGO_OBRA'] ||
    (hasNombreObra && mapped['OBRA'] ? mapped['OBRA'] : undefined);

  const resolvedObra = resolveObraForParte(obraNameCandidate, codigoObraCandidate, context?.obras);

  const detalleCombined = [detalleBase, detalle2Val].filter(Boolean).join(' — ');
  const detalleT =
    detalleCombined ||
    (mapped['CARGA'] ? `Operación / Carga: ${mapped['CARGA']} (${mapped['TIPO_COMB'] || 'Combustible'})` : '');

  const enriched = enrichEquipmentAndEmployee(
    mapped['CODIGO_EQUIPO'] || mapped['EQUIPO'],
    mapped['MARCA_MODELO'] || mapped['MODELO_MARCA'] || mapped['MODELO'] || mapped['EQUIPO'],
    undefined,
    mapped['CODIGO_EMPLEADO'] || mapped['CHOFER_CODIGO'],
    mapped['NOMBRE_APELLIDO'] || mapped['RESPONSABLE'] || mapped['CHOFER'] || mapped['OPERADOR'],
    undefined,
    context
  );

  const inferredMat = String(mapped['TIPO_MATERIAL'] || mapped['MATERIAL'] || '').trim() || (tipo === 'VIAJES' ? inferMaterialFromText(fullDescUpper) : '');
  const m3PorViaje = parseNum(mapped['M3_POR_VIAJE'], 0);
  const totalM3 = parseNum(mapped['TOTAL_M3'], m3PorViaje > 0 && viajesCnt > 0 ? Number((m3PorViaje * viajesCnt).toFixed(2)) : 0);

  const opMat = normalizeExtraccionOperacion(
    String(mapped['EXTRACION_ENTREGAS'] || mapped['EXTRACION'] || mapped['TIPO_OPERACION_MATERIAL'] || ''),
    fullDescUpper,
    tipo
  );

  const servMantResolved =
    servMantRaw ||
    (fullDescUpper.includes('TRASLADO') ? 'TRASLADO DE MAQUINA' : 'ALQUILER');

  const precioUnitVal = mapped['PRECIO_UNIT'] !== undefined && String(mapped['PRECIO_UNIT']).trim() !== ''
    ? parseNum(mapped['PRECIO_UNIT'], 0)
    : undefined;
  const precioCostoVal = mapped['PRECIO_COSTO'] !== undefined && String(mapped['PRECIO_COSTO']).trim() !== ''
    ? parseNum(mapped['PRECIO_COSTO'], 0)
    : undefined;
  const totalSheetVal = mapped['TOTAL_SHEET'] !== undefined && String(mapped['TOTAL_SHEET']).trim() !== ''
    ? parseNum(mapped['TOTAL_SHEET'], 0)
    : (mapped['TOTAL'] !== undefined && String(mapped['TOTAL']).trim() !== '' ? parseNum(mapped['TOTAL'], 0) : undefined);

  const isTruckOrTrip = tipo === 'VIAJES' || /MERCEDES|CAMION|VOLCADOR|BATEA|FLETE|VIAJE/.test(`${enriched.marcaModelo} ${fullDescUpper}`.toUpperCase());
  const separarCobranzaMaterial =
    mapped['SEPARAR_COBRANZA_MATERIAL'] !== undefined && String(mapped['SEPARAR_COBRANZA_MATERIAL']).trim() !== ''
      ? !['NO', 'FALSE', '0'].includes(String(mapped['SEPARAR_COBRANZA_MATERIAL']).toUpperCase().trim())
      : isTruckOrTrip && tipo === 'VIAJES';

  const valorViajeEquipo =
    mapped['VALOR_VIAJE_EQUIPO'] !== undefined && String(mapped['VALOR_VIAJE_EQUIPO']).trim() !== ''
      ? parseNum(mapped['VALOR_VIAJE_EQUIPO'], 0)
      : (separarCobranzaMaterial && precioUnitVal !== undefined ? precioUnitVal : undefined);

  const valorMaterialAparte =
    mapped['VALOR_MATERIAL_APARTE'] !== undefined && String(mapped['VALOR_MATERIAL_APARTE']).trim() !== ''
      ? parseNum(mapped['VALOR_MATERIAL_APARTE'], 0)
      : undefined;

  const reparacionMant = String(mapped['REPARACION_MANT'] || mapped['REPARACION-MANT'] || mapped['REPARACION'] || '').trim();
  const grasaVal = String(mapped['GRASA'] || '').trim();
  const aceiteVal = String(mapped['ACEITE'] || '').trim();

  const resolvedFecha = normalizeDateValue(mapped['FECHA'], context?.dateOrder || 'auto') || new Date().toISOString().slice(0, 10);
  const resolvedCodEq = enriched.codigoEquipo || 'EQ-01';
  const rawSheetId = String(mapped['ID'] || '').trim();
  const deterministicFallbackId = `PD-${String(numParte).trim()}-${resolvedFecha}-${resolvedCodEq}`.replace(/\s+/g, '_');

  return {
    id: rawSheetId || deterministicFallbackId,
    servMant: servMantResolved,
    obra: resolvedObra.obraName,
    codigoObra: resolvedObra.codigoObra,
    codigoEquipo: resolvedCodEq,
    marcaModelo: enriched.marcaModelo || 'Equipo Flota',
    codigoEmpleado: enriched.codigoEmpleado || 'EMP-101',
    nombreApellido: enriched.nombreApellido || 'Operador / Responsable',
    fecha: resolvedFecha,
    horaInicioMañana: finalIniM,
    horaFinMañana: finalFinM,
    horaInicioTarde: finalIniT,
    horaFinTarde: finalFinT,
    horasTrabajadas: horasTr,
    odomKilom: parseNum(mapped['ODOM-KILOM'] || mapped['ODOM_KILOM'] || mapped['ODOMETRO'] || mapped['KILOMETRAJE'], 0),
    tipo,
    detalleTipo: detalleT,
    detalle2: detalle2Val || undefined,
    viajesCantidad: tipo === 'VIAJES' ? viajesCnt : 0,
    extraccionEntregas: opMat.extraccionEntregas,
    tipoOperacionMaterial: opMat.tipoOperacionMaterial,
    tipoMaterial: inferredMat,
    m3PorViaje: m3PorViaje > 0 ? m3PorViaje : undefined,
    totalM3: totalM3 > 0 ? totalM3 : undefined,
    separarCobranzaMaterial,
    valorViajeEquipo,
    valorMaterialAparte,
    hsCantidad: tipo === 'HORAS' ? horasTr : 0,
    novedades: String(mapped['NOVEDADES'] || mapped['OBSERVACION'] || mapped['OBSERVACIONES'] || '').trim(),
    reparacionMant: reparacionMant || undefined,
    ubicacion: mapped['UBICACION'] || resolvedObra.obraName,
    encargadoObra: mapped['ENCARGADO_OBRA'] || '',
    grasa: grasaVal || undefined,
    aceite: aceiteVal || undefined,
    firma: mapped['FIRMA'] || (isGastosSheet ? 'Importado Gastos (VENTA)' : 'Firmado'),
    numParte: String(numParte).trim(),
    autorizado: mapped['AUTORIZADO'] || 'NO CONTROLADO',
    fuenteOrigen: isGastosSheet ? 'GASTOS_EQUIPOS' : 'REPORTE_DIARIO',
    tipoRegistroSheet: isGastosSheet ? (rawTipoCol || 'VENTA') : undefined,
    precioCosto: precioCostoVal,
    precioUnitario: precioUnitVal,
    totalSheet: totalSheetVal,
    estadoCobro: mapped['ESTADO_COBRO'] || (isGastosSheet ? mapped['ESTADO'] : undefined),
    egrIng: mapped['EGR_ING'] || undefined,

    // Backward compatibility
    cantidad: viajesCnt,
    detalleEntrega: detalleT
  };
}

function transformObraRow(mapped: Record<string, any>, idx: number, genId: any): any {
  const keys = Object.keys(mapped);

  // Find numero (code) dynamically
  let rawNumero = undefined;
  const exactCodeKeys = ['NUMERO', 'NUM_OBRA', 'CODIGO_OBRA', 'COD_OBRA', 'CODIGO', 'COD', 'NRO', 'ID_OBRA', 'ID', 'OBRA_ID', 'NUM', 'CODIGO_DE_OBRA', 'NRO_OBRA'];
  for (const k of exactCodeKeys) {
    if (mapped[k] !== undefined && mapped[k] !== null && String(mapped[k]).trim() !== '' && String(mapped[k]).trim() !== '-1') {
      rawNumero = mapped[k];
      break;
    }
  }
  if (!rawNumero) {
    for (const key of keys) {
      if ((key.includes('COD') || key.includes('NUM') || key.includes('ID') || key.includes('NRO')) && !key.includes('EMPLEADO') && !key.includes('EQUIPO')) {
        if (mapped[key] !== undefined && mapped[key] !== null && String(mapped[key]).trim() !== '' && String(mapped[key]).trim() !== '-1') {
          rawNumero = mapped[key];
          break;
        }
      }
    }
  }
  if (!rawNumero || String(rawNumero).trim() === '' || String(rawNumero).trim() === '-1' || String(rawNumero).trim() === 'NaN') {
    rawNumero = `OBRA-${idx + 1}`;
  }
  const numero = String(rawNumero).trim();

  // Find nombreObra dynamically
  let rawNombre = undefined;
  const exactNameKeys = ['NOMBRE_OBRA', 'OBRA', 'NOMBRE', 'PROYECTO', 'TITULO', 'DESCRIPCION', 'NOMBRE_DE_OBRA', 'PROYECTO_OBRA'];
  for (const k of exactNameKeys) {
    if (mapped[k] !== undefined && mapped[k] !== null && String(mapped[k]).trim() !== '' && String(mapped[k]).trim() !== '-1') {
      rawNombre = mapped[k];
      break;
    }
  }
  if (!rawNombre) {
    for (const key of keys) {
      if ((key.includes('OBRA') || key.includes('NOMBRE') || key.includes('PROYECTO') || key.includes('TITULO')) && !key.includes('ENCARGADO') && !key.includes('COD')) {
        if (mapped[key] !== undefined && mapped[key] !== null && String(mapped[key]).trim() !== '' && String(mapped[key]).trim() !== '-1') {
          rawNombre = mapped[key];
          break;
        }
      }
    }
  }
  if (!rawNombre || String(rawNombre).trim() === '' || String(rawNombre).trim() === '-1') {
    rawNombre = `Obra ${numero}`;
  }
  const nombreObra = String(rawNombre).trim();

  // Find ubicacion dynamically
  let rawUbicacion = undefined;
  const exactUbicKeys = ['UBICACION', 'DIRECCION', 'LUGAR', 'LOCALIDAD', 'ZONA', 'DOMICILIO'];
  for (const k of exactUbicKeys) {
    if (mapped[k] !== undefined && mapped[k] !== null && String(mapped[k]).trim() !== '') {
      rawUbicacion = mapped[k];
      break;
    }
  }
  if (!rawUbicacion) {
    for (const key of keys) {
      if (key.includes('UBIC') || key.includes('DIR') || key.includes('LUGAR') || key.includes('ZONA')) {
        if (mapped[key] !== undefined && mapped[key] !== null && String(mapped[key]).trim() !== '') {
          rawUbicacion = mapped[key];
          break;
        }
      }
    }
  }

  // Find pertenece/cliente dynamically
  let rawPertenece = undefined;
  const exactPertKeys = ['PERTENECE', 'EMPRESA', 'CLIENTE', 'CONSTRUCTORA', 'COMITENTE', 'RAZON_SOCIAL'];
  for (const k of exactPertKeys) {
    if (mapped[k] !== undefined && mapped[k] !== null && String(mapped[k]).trim() !== '') {
      rawPertenece = mapped[k];
      break;
    }
  }

  const activaRaw = String(mapped['ACTIVA'] || mapped['ESTADO'] || 'SÍ').toUpperCase().trim();
  const activa = activaRaw === 'SÍ' || activaRaw === 'SI' || activaRaw === 'TRUE' || activaRaw === 'ACTIVA' || activaRaw === '1';

  return {
    id: mapped['ID'] || genId('obra', idx),
    numero,
    nombreObra,
    ubicacion: rawUbicacion ? String(rawUbicacion).trim() : 'Sin ubicación',
    pertenece: rawPertenece ? String(rawPertenece).trim() : 'Empresa Principal',
    activa,
    plazo: mapped['PLAZO'] || mapped['DURACION'] || '6 meses',
    montoEstimado: parseNum(mapped['MONTO_ESTIMADO'] || mapped['MONTO'] || mapped['PRESUPUESTO'], 10000000),
    fechaAlta: mapped['FECHA_ALTA'] || mapped['FECHA'] || new Date().toISOString().slice(0, 10),
    observaciones: mapped['OBSERVACIONES'] || mapped['NOTAS'] || ''
  };
}

function mapMaintenanceTipoToCategory(rawTipo: string, fullTextUpper: string): ExpenseCategory {
  const t = rawTipo.trim().toUpperCase();

  // Direct system ExpenseCategory values
  const directCategories: ExpenseCategory[] = [
    'LUBRICANTES_ACEITES',
    'REPUESTOS_CONSUMIBLES',
    'MANO_OBRA_TALLER',
    'NEUMATICOS_ORUGAS',
    'COMBUSTIBLE_DIRECTO',
    'SEGURO_DOCUMENTACION',
    'MULTAS_INFRACCIONES',
    'VARIOS_EQUIPO'
  ];
  if (directCategories.includes(t as ExpenseCategory)) {
    return t as ExpenseCategory;
  }

  if (/\b(MULTA|INFRACCION|FOTOMULTA|CNRT|ACTA)\b/.test(t)) {
    return 'MULTAS_INFRACCIONES';
  }
  if (/\b(ACEITE|GRASA|LUBRIC|HIDRAULICO)\b/.test(t) && !t.includes('FILTRO')) {
    return 'LUBRICANTES_ACEITES';
  }
  if (/\b(CUBIERTA|NEUMAT|GOMERIA|RUEDA)\b/.test(t)) {
    return 'NEUMATICOS_ORUGAS';
  }
  if (/\bCOMBUSTIBLE\b/.test(t)) {
    return 'COMBUSTIBLE_DIRECTO';
  }
  if (/\b(SEGURO|RTV|VTV|HABILIT|DOCUMENT)\b/.test(t)) {
    return 'SEGURO_DOCUMENTACION';
  }
  if (/\b(MANO\s*DE\s*OBRA|SERVICE|MANTENIMIENTO|TALLER|REPARACION|SATELITAL)\b/.test(t)) {
    return 'MANO_OBRA_TALLER';
  }
  if (/\b(VIATICO|PERSONAL|ENCOMIENDA|TRANSPORTE)\b/.test(t)) {
    return 'VARIOS_EQUIPO';
  }
  if (
    /\b(MOTOR|FILTRO|BATERIA|ELECTRIC|CARROCERIA|ACCESORIO|BULON|MANGUERA|FRENO|EMBRAGUE|TREN\s*DELANTERO|SUSPENCION|SUSPENSION|REFRIGERACION|TRANSMISION|BUJE|DIFERENCIAL|CERRAJERIA|RULEMAN|OXIGENO|GAS|VIDRIO|AIRE\s*ACONDICIONADO|RESORTE|RADIADOR|ADHESIVO|LIMPIEZA)\b/.test(
      t
    )
  ) {
    return 'REPUESTOS_CONSUMIBLES';
  }

  // Fallback inference from description when TIPO is blank
  if (!t) {
    if (/\b(ACEITE|GRASA|15W40|80W90|ISO\s*68)\b/.test(fullTextUpper)) return 'LUBRICANTES_ACEITES';
    if (/\b(CUBIERTA|NEUMAT|GOMA|GOMERIA|BALANCEO|PARCHE)\b/.test(fullTextUpper)) return 'NEUMATICOS_ORUGAS';
    if (/\b(GASOIL|NAFTA|DIESEL|INFINIA)\b/.test(fullTextUpper)) return 'COMBUSTIBLE_DIRECTO';
    if (/\b(MANO\s*DE\s*OBRA|TORNERIA|MECANICO|SERVICE)\b/.test(fullTextUpper)) return 'MANO_OBRA_TALLER';
    return 'VARIOS_EQUIPO';
  }

  return 'REPUESTOS_CONSUMIBLES';
}

function transformMaintenanceExpenseRow(
  mapped: Record<string, any>,
  idx: number,
  genId: any,
  context?: ImportTransformContext
): VehicleExpenseLog | null {
  const rawId = String(mapped['ID'] || '').trim();
  const rawCodEq = String(mapped['CODIGO_EQUIPO'] || mapped['EQUIPO'] || '').trim();
  const rawMarcaModelo = String(mapped['MARCA_MODELO'] || mapped['MODELO_MARCA'] || '').trim();
  const rawTipo = String(mapped['TIPO'] || mapped['CATEGORIA'] || mapped['RUBRO'] || '').trim();
  const rawNumComp = String(mapped['NUM_COMP'] || mapped['COMPROBANTE'] || mapped['FACTURA'] || mapped['NUMERO_COMPROBANTE'] || '').trim();
  const rawDesc = String(mapped['DESCRIPCION'] || mapped['DESCRPCION'] || mapped['CONCEPTO'] || mapped['DETALLE'] || '').trim();
  const rawMarca = String(mapped['MARCA'] || mapped['MARCA_REPUESTO'] || '').trim();
  const rawFecha = mapped['FECHA'];
  const rawCodEmp = String(mapped['CODIGO_EMPLEADO'] || '').trim();
  const rawResponsable = String(mapped['RESPONSABLE'] || mapped['NOMBRE_APELLIDO'] || mapped['MECANICO'] || '').trim();
  const rawRazonSocial = String(mapped['RAZON_SOCIAL'] || mapped['RAZON SOCIAL'] || mapped['PROVEEDOR'] || mapped['TALLER'] || '').trim();
  const rawObs = String(mapped['OBSERVACIONES'] || mapped['NOTAS'] || '').trim();
  const rawFoto = String(mapped['FOTO'] || mapped['FOTO_COMPROBANTE'] || '').trim();

  const rawCantStr = mapped['CANTIDAD'];
  const cantidad =
    rawCantStr !== undefined && rawCantStr !== null && String(rawCantStr).trim() !== ''
      ? parseNum(rawCantStr, 1)
      : undefined;

  const rawMontoVal = mapped['MONTO'] ?? mapped['MONTO_TOTAL'] ?? mapped['IMPORTE_TOTAL'] ?? mapped['IMPORTE'];
  const hasMonto = rawMontoVal !== undefined && rawMontoVal !== null && String(rawMontoVal).trim() !== '';
  const montoTotal = hasMonto ? parseNum(rawMontoVal, 0) : 0;

  const fecha = normalizeDateValue(rawFecha, context?.dateOrder || 'auto') || '';

  // Match against live fleet without inventing fake equipment when legacy/incomplete
  let matchedVehicle: Vehicle | undefined;
  if (context?.fleet && context.fleet.length > 0) {
    const eqKey = rawCodEq.toUpperCase();
    const modKey = rawMarcaModelo.toUpperCase();
    if (eqKey) {
      matchedVehicle = context.fleet.find(v =>
        v.id?.toUpperCase() === eqKey ||
        v.codigoEquipo?.toUpperCase() === eqKey ||
        v.codigo?.toUpperCase() === eqKey ||
        v.codigoInterno?.toUpperCase() === eqKey
      ) || (eqKey.length >= 6
        ? context.fleet.find(v => v.id?.toUpperCase().startsWith(eqKey))
        : undefined);
    }
    if (!matchedVehicle && modKey) {
      matchedVehicle = context.fleet.find(v =>
        v.modeloMarca?.trim().toUpperCase() === modKey
      );
    }
  }

  const equipoId = matchedVehicle ? matchedVehicle.id : rawCodEq;
  const equipoModeloMarca = matchedVehicle ? matchedVehicle.modeloMarca : rawMarcaModelo;
  const equipoPatenteOrCodigo = matchedVehicle
    ? (matchedVehicle.patente || matchedVehicle.codigoInterno || matchedVehicle.codigoEquipo || rawCodEq || matchedVehicle.id)
    : rawCodEq;

  // Match employee responsibly if code missing/present
  let responsableNombre = rawResponsable;
  let codigoEmpleado = rawCodEmp;
  if (context?.employees && context.employees.length > 0) {
    const empCodeU = codigoEmpleado.toUpperCase();
    const empNameU = responsableNombre.toUpperCase();
    const foundEmp = context.employees.find(e =>
      (empCodeU && (e.codigoEmpleado?.toUpperCase() === empCodeU || e.id?.toUpperCase() === empCodeU)) ||
      (empNameU && e.nombreApellido?.toUpperCase() === empNameU)
    );
    if (foundEmp) {
      if (!codigoEmpleado) codigoEmpleado = foundEmp.codigoEmpleado || foundEmp.id;
      if (!responsableNombre) responsableNombre = foundEmp.nombreApellido;
    }
  }

  // Clean legacy foto ref (skip AppSheet failed load notices)
  const cleanFoto = rawFoto && !/unable to load image/i.test(rawFoto) ? rawFoto : '';

  const fullTextUpper = [rawTipo, rawDesc, rawMarca, rawRazonSocial].filter(Boolean).join(' ').toUpperCase();
  const categoria = mapMaintenanceTipoToCategory(rawTipo, fullTextUpper);

  // Track incomplete fields explicitly so historical records are never rejected nor disguised
  const camposIncompletos: string[] = [];
  if (!fecha) camposIncompletos.push('fecha');
  if (!equipoId && !equipoModeloMarca) camposIncompletos.push('equipo');
  if (!rawNumComp) camposIncompletos.push('comprobante');
  if (!rawRazonSocial) camposIncompletos.push('proveedor');
  if (!rawDesc) camposIncompletos.push('concepto');
  if (!hasMonto) camposIncompletos.push('monto');

  return {
    id: rawId || genId('EXP', idx),
    equipoId,
    equipoModeloMarca,
    equipoPatenteOrCodigo: equipoPatenteOrCodigo || undefined,
    fecha,
    numeroComprobante: rawNumComp,
    proveedor: rawRazonSocial,
    categoria,
    concepto: rawDesc,
    montoTotal,
    observaciones: rawObs || undefined,
    cantidad,
    marcaRepuesto: rawMarca || undefined,
    subcategoriaOriginal: rawTipo ? rawTipo.toUpperCase() : undefined,
    codigoEmpleado: codigoEmpleado || undefined,
    responsableNombre: responsableNombre || undefined,
    fotoReferencia: cleanFoto || undefined,
    fuenteOrigen: 'GOOGLE_SHEET_MANTENIMIENTO',
    camposIncompletos: camposIncompletos.length > 0 ? camposIncompletos : undefined,
  };
}

