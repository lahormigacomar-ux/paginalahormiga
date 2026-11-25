import { GenericColumnDefinition } from '../types';

// ==================== FLOTA DE VEHÍCULOS & EQUIPOS ====================
export const FLEET_COLUMNS: GenericColumnDefinition[] = [
  {
    key: 'fotografia',
    label: 'FOTOGRAFÍA',
    shortLabel: 'Foto',
    description: 'Miniatura del equipo o vehículo',
    defaultVisible: true,
    align: 'center',
    width: 'w-14'
  },
  {
    key: 'id',
    label: 'ID',
    shortLabel: 'ID',
    description: 'Identificador único del registro (ej: EQ-001)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'modeloMarca',
    label: 'MODELO / MARCA',
    shortLabel: 'Modelo/Marca',
    description: 'Marca y modelo comercial de la máquina',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'anio',
    label: 'AÑO',
    shortLabel: 'Año',
    description: 'Año de fabricación o modelo del vehículo',
    defaultVisible: true,
    align: 'center',
    width: 'w-16'
  },
  {
    key: 'patente',
    label: 'PATENTE',
    shortLabel: 'Patente',
    description: 'Dominio o chapa patente del vehículo',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'codigoInterno',
    label: 'CÓDIGO INTERNO',
    shortLabel: 'Interno',
    description: 'Código de inventario o seguimiento interno',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'clasificacion',
    label: 'CLASIFICACIÓN',
    shortLabel: 'Clase',
    description: 'Tipo o familia de maquinaria',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'precioCosto',
    label: 'PRECIO COSTO',
    shortLabel: 'Costo',
    description: 'Costo operativo / amortización por día u hora',
    defaultVisible: true,
    align: 'right'
  },
  {
    key: 'precioSugerido',
    label: 'PRECIO SUGERIDO',
    shortLabel: 'Sugerido',
    description: 'Tarifa comercial sugerida al cliente',
    defaultVisible: true,
    align: 'right'
  },
  {
    key: 'estado',
    label: 'ESTADO',
    shortLabel: 'Estado',
    description: 'Estado operativo actual del equipo',
    defaultVisible: true,
    align: 'center'
  },
  {
    key: 'horometro',
    label: 'HORÓMETRO',
    shortLabel: 'Horómetro',
    description: 'Horas actuales de motor registradas',
    defaultVisible: false,
    align: 'right'
  },
  {
    key: 'ubicacionActual',
    label: 'UBICACIÓN ACTUAL',
    shortLabel: 'Ubicación',
    description: 'Base u obra donde se encuentra el equipo',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'fechaAlta',
    label: 'FECHA DE ALTA',
    shortLabel: 'Alta',
    description: 'Fecha de ingreso al inventario',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'ordenVisibilidad',
    label: 'ORDEN EN WEB',
    shortLabel: 'Orden Web',
    description: 'Prioridad / orden secuencial en el catálogo de la página web pública',
    defaultVisible: true,
    align: 'center'
  },
  {
    key: 'publicarEnWeb',
    label: 'PUBLICADO EN WEB',
    shortLabel: 'Web',
    description: 'Visibilidad en el catálogo público de alquileres',
    defaultVisible: true,
    align: 'center'
  }
];

// ==================== EXPENDIO DE COMBUSTIBLE (ESTRUCTURA OFICIAL) ====================
export type FuelVoucherColumnKey =
  | 'id'
  | 'deposito'
  | 'tipo'
  | 'cantidad'
  | 'codigoEmpleado'
  | 'codigoEquipo'
  | 'autonomiaVt'
  | 'autonom'
  | 'numEstacion'
  | 'numOrden'
  | 'tipoComb'
  | 'kilometraje'
  | 'fotoExpendio'
  | 'fotoKilometraje'
  | 'kilometrosRec'
  | 'clasificacion'
  | 'carga'
  | 'idCombustible'
  | 'nombreApellido'
  | 'legajo'
  | 'marcaModelo'
  | 'patente'
  | 'fecha'
  | 'hora';

export const FUEL_VOUCHER_COLUMNS: GenericColumnDefinition<FuelVoucherColumnKey>[] = [
  {
    key: 'id',
    label: 'ID',
    shortLabel: 'ID',
    description: 'Identificador único del comprobante (ej: faa9f1c3)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'fecha',
    label: 'FECHA',
    shortLabel: 'Fecha',
    description: 'Fecha del despacho',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'hora',
    label: 'HORA',
    shortLabel: 'Hora',
    description: 'Hora del despacho',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'deposito',
    label: 'DEPOSITO',
    shortLabel: 'Depósito',
    description: 'Estación de servicio o depósito propio (ESTACION DE SERV, DIESEL 500)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'tipo',
    label: 'TIPO',
    shortLabel: 'Tipo',
    description: 'Tipo de movimiento (EGRESO / INGRESO)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'cantidad',
    label: 'CANT_CARGA',
    shortLabel: 'Cant Carga',
    description: 'Cantidad de litros despachados / ingresados (-117,78 / 145,61)',
    defaultVisible: true,
    align: 'right'
  },
  {
    key: 'codigoEmpleado',
    label: 'CHOFER / OPERADOR',
    shortLabel: 'Chofer/Operador',
    description: 'Nombre y apellido del chofer / operario',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'codigoEquipo',
    label: 'VEHÍCULO / EQUIPO',
    shortLabel: 'Vehículo',
    description: 'Nombre del vehículo, camión o máquina',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'autonomiaVt',
    label: 'AUTONOMIA_VT',
    shortLabel: 'Auton VT',
    description: 'Autonomía calculada VT (ej: 04,56)',
    defaultVisible: true,
    align: 'right'
  },
  {
    key: 'autonom',
    label: 'AUTONOM',
    shortLabel: 'Autonom',
    description: 'Rendimiento / autonomía (ej: 4,56)',
    defaultVisible: true,
    align: 'right'
  },
  {
    key: 'numEstacion',
    label: 'NUM_ESTACION',
    shortLabel: 'Nº Estación',
    description: 'Número de estación expendedora (ej: 48-56047)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'numOrden',
    label: 'Nº DE ORDEN',
    shortLabel: 'Nº Orden',
    description: 'Número de comprobante / vale de orden (ej: 02623)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'tipoComb',
    label: 'TIPO_COMB',
    shortLabel: 'Combustible',
    description: 'Tipo de combustible (DIESEL INFINIA, DIESEL COMUN, NAFTA SUPER)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'kilometraje',
    label: 'ODÓMETRO / KILOMETRAJE',
    shortLabel: 'Odómetro/Km',
    description: 'Kilometraje u horómetro actual (ej: 317.958)',
    defaultVisible: true,
    align: 'right'
  },
  {
    key: 'fotoExpendio',
    label: 'FOTO_EXPENDIO',
    shortLabel: 'Foto Ticket',
    description: 'Foto del comprobante / ticket de expendio',
    defaultVisible: true,
    align: 'center'
  },
  {
    key: 'fotoKilometraje',
    label: 'FOTO_KILOMETRAJE',
    shortLabel: 'Foto Odóm.',
    description: 'Foto del tablero / odómetro / horómetro',
    defaultVisible: true,
    align: 'center'
  },
  {
    key: 'kilometrosRec',
    label: 'KILOMETROS_REC',
    shortLabel: 'Kms Rec',
    description: 'Kilómetros u horas recorridas (ej: 537)',
    defaultVisible: true,
    align: 'right'
  },
  {
    key: 'clasificacion',
    label: 'CLASIFICACION',
    shortLabel: 'Clase',
    description: 'Clasificación del equipo (CAMIONES, AUTOS/CAMIONETAS, MAQUINAS)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'carga',
    label: 'CARGA',
    shortLabel: 'Carga',
    description: 'Modalidad de carga (Tanque Lleno, Parcial, Bidón)',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'idCombustible',
    label: 'ID_COMBUSTIBLE',
    shortLabel: 'ID Comb',
    description: 'Código técnico del combustible',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'nombreApellido',
    label: 'NOMBRE_APELLIDO',
    shortLabel: 'Nombre',
    description: 'Nombre y apellido completo',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'legajo',
    label: 'LEGAJO',
    shortLabel: 'Legajo',
    description: 'Número de legajo',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'marcaModelo',
    label: 'MARCA_MODELO',
    shortLabel: 'Modelo',
    description: 'Marca y modelo del móvil',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'patente',
    label: 'PATENTE',
    shortLabel: 'Patente',
    description: 'Chapa patente del equipo',
    defaultVisible: false,
    align: 'left'
  }
];

// ==================== EMPLEADOS & CHOFERES ====================
export type EmployeeColumnKey =
  | 'foto'
  | 'id'
  | 'codigoEmpleado'
  | 'nombreApellido'
  | 'legajo'
  | 'categoria'
  | 'sector'
  | 'obra'
  | 'estado'
  | 'mostrarEnAsistencia'
  | 'dni'
  | 'telefono'
  | 'vehiculoAsignadoId'
  | 'costoPorDia'
  | 'fechaAlta';

export const EMPLOYEE_COLUMNS: GenericColumnDefinition<EmployeeColumnKey>[] = [
  {
    key: 'foto',
    label: 'FOTOGRAFÍA',
    shortLabel: 'Foto',
    description: 'Foto de perfil del empleado',
    defaultVisible: true,
    align: 'center',
    width: 'w-14'
  },
  {
    key: 'id',
    label: 'ID',
    shortLabel: 'ID',
    description: 'Identificador único (ej: EMP-001)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'codigoEmpleado',
    label: 'CÓDIGO EMPLEADO',
    shortLabel: 'Código',
    description: 'Código operativo asignado (ej: CH-201, OP-101)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'nombreApellido',
    label: 'NOMBRE Y APELLIDO',
    shortLabel: 'Nombre y Apellido',
    description: 'Nombre completo del trabajador',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'legajo',
    label: 'LEGAJO',
    shortLabel: 'Legajo',
    description: 'Número de legajo en la nómina oficial',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'categoria',
    label: 'CATEGORÍA',
    shortLabel: 'Categoría',
    description: 'Especialidad laboral (Chofer Batea, Maquinista, etc.)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'sector',
    label: 'SECTOR',
    shortLabel: 'Sector',
    description: 'Área o departamento asignado',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'obra',
    label: 'OBRA ASIGNADA',
    shortLabel: 'Obra',
    description: 'Frente de obra o base activa',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'estado',
    label: 'ESTADO',
    shortLabel: 'Estado',
    description: 'Condición laboral actual (Activo, En Obra, Licencia)',
    defaultVisible: true,
    align: 'center'
  },
  {
    key: 'mostrarEnAsistencia',
    label: 'ENTRADAS Y SALIDAS',
    shortLabel: 'Asistencia',
    description: 'Determina si el empleado se incluye en el control de Entradas y Salidas',
    defaultVisible: true,
    align: 'center'
  },
  {
    key: 'dni',
    label: 'DNI / DOCUMENTO',
    shortLabel: 'DNI',
    description: 'Documento Nacional de Identidad',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'telefono',
    label: 'TELÉFONO',
    shortLabel: 'Teléfono',
    description: 'Contacto directo de guardia / chofer',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'vehiculoAsignadoId',
    label: 'EQUIPO ASIGNADO',
    shortLabel: 'Equipo',
    description: 'Máquina o vehículo de la flota a cargo',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'costoPorDia',
    label: 'COSTO POR DÍA',
    shortLabel: 'Costo/Día',
    description: 'Costo operativo asignado a nómina por jornada',
    defaultVisible: false,
    align: 'right'
  },
  {
    key: 'fechaAlta',
    label: 'FECHA DE INGRESO',
    shortLabel: 'Ingreso',
    description: 'Fecha de incorporación a la empresa',
    defaultVisible: false,
    align: 'left'
  }
];

// ==================== PARTES DIARIOS (TRABAJOS POR EQUIPO) ====================
export type ParteDiarioColumnKey =
  | 'id'
  | 'numParte'
  | 'fecha'
  | 'servMant'
  | 'obra'
  | 'codigoObra'
  | 'codigoEquipo'
  | 'marcaModelo'
  | 'codigoEmpleado'
  | 'nombreApellido'
  | 'tipo'
  | 'detalleTipo'
  | 'detalle2'
  | 'horasTrabajadas'
  | 'kmOdomAprox'
  | 'kmProrrateado'
  | 'viajesCantidad'
  | 'extraccionEntregas'
  | 'tipoMaterial'
  | 'm3PorViaje'
  | 'totalM3'
  | 'separarCobranzaMaterial'
  | 'valorViajeEquipo'
  | 'odomKilom'
  | 'ubicacion'
  | 'encargadoObra'
  | 'grasa'
  | 'aceite'
  | 'reparacionMant'
  | 'fuenteOrigen'
  | 'novedades';

export const PARTE_DIARIO_COLUMNS: GenericColumnDefinition<ParteDiarioColumnKey>[] = [
  {
    key: 'id',
    label: 'ID',
    shortLabel: 'ID',
    description: 'Identificador único del parte diario',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'numParte',
    label: 'Nº PARTE',
    shortLabel: 'Nº Parte',
    description: 'Número oficial de parte diario',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'fecha',
    label: 'FECHA',
    shortLabel: 'Fecha',
    description: 'Fecha en la que se ejecutó el trabajo',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'servMant',
    label: 'SERV / MANT',
    shortLabel: 'Serv/Mant',
    description: 'Modalidad de servicio o mantenimiento (ALQUILER, etc.)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'obra',
    label: 'OBRA',
    shortLabel: 'Obra',
    description: 'Nombre de la obra o proyecto',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'codigoObra',
    label: 'CÓDIGO OBRA',
    shortLabel: 'Cod. Obra',
    description: 'Código de identificación de la obra',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'codigoEquipo',
    label: 'EQUIPO / MÁQUINA',
    shortLabel: 'Equipo',
    description: 'Código interno de la máquina o vehículo',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'marcaModelo',
    label: 'MARCA / MODELO',
    shortLabel: 'Marca/Modelo',
    description: 'Descripción comercial del equipo',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'codigoEmpleado',
    label: 'CÓDIGO OPERADOR',
    shortLabel: 'Cod. Op.',
    description: 'Legajo o código del chofer / maquinista',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'nombreApellido',
    label: 'OPERADOR / CHOFER',
    shortLabel: 'Operador',
    description: 'Nombre y apellido del operador',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'tipo',
    label: 'TIPO TRABAJO',
    shortLabel: 'Tipo',
    description: 'Modalidad (HORAS / VIAJES / DIA / TRABAJO / OTRO)',
    defaultVisible: true,
    align: 'center'
  },
  {
    key: 'detalleTipo',
    label: 'TRABAJO / TAREA REALIZADA',
    shortLabel: 'Detalle Tarea',
    description: 'Tipo de trabajo realizado por la máquina o camión',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'detalle2',
    label: 'DETALLE 2 / SUB-DETALLE',
    shortLabel: 'Detalle 2',
    description: 'Sub-detalle específico del trabajo (ej. nivelación, compactación, excavación)',
    defaultVisible: true,
    align: 'left'
  },
  {
    key: 'horasTrabajadas',
    label: 'HORAS TRABAJADAS',
    shortLabel: 'Horas',
    description: 'Cantidad de horas de trabajo operativas',
    defaultVisible: true,
    align: 'right'
  },
  {
    key: 'kmOdomAprox',
    label: 'ODÓM. / HS APROX.',
    shortLabel: 'Odóm. Aprox.',
    description: 'Odómetro u horómetro aproximado del día según cruce con cargas de combustible',
    defaultVisible: true,
    align: 'right'
  },
  {
    key: 'kmProrrateado',
    label: 'KMS / HS DÍA (COMB.)',
    shortLabel: 'Kms / Hs Día',
    description: 'Kilómetros u horas de máquina prorrateados para este parte entre cargas de combustible',
    defaultVisible: true,
    align: 'right'
  },
  {
    key: 'viajesCantidad',
    label: 'VIAJES / CANTIDAD',
    shortLabel: 'Viajes',
    description: 'Cantidad de viajes o volumen transportado',
    defaultVisible: true,
    align: 'right'
  },
  {
    key: 'extraccionEntregas',
    label: 'OPERACIÓN MATERIAL',
    shortLabel: 'Entrega/Retiro',
    description: 'Indica si fue Entrega de Material, Retiro o Solo Flete',
    defaultVisible: true,
    align: 'center'
  },
  {
    key: 'tipoMaterial',
    label: 'TIPO MATERIAL',
    shortLabel: 'Material',
    description: 'Material acarreado o movilizado',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'm3PorViaje',
    label: 'M³ POR VIAJE',
    shortLabel: 'M³/Viaje',
    description: 'Metros cúbicos por cada viaje del camión',
    defaultVisible: false,
    align: 'right'
  },
  {
    key: 'totalM3',
    label: 'TOTAL M³',
    shortLabel: 'Total M³',
    description: 'Volumen total transportado en metros cúbicos',
    defaultVisible: false,
    align: 'right'
  },
  {
    key: 'separarCobranzaMaterial',
    label: 'CONTAB. VIAJE EQUIPO',
    shortLabel: 'Solo Viaje',
    description: 'Separa la cobranza del viaje del equipo respecto al material',
    defaultVisible: false,
    align: 'center'
  },
  {
    key: 'valorViajeEquipo',
    label: 'VALOR VIAJE EQUIPO',
    shortLabel: '$ Viaje Eq.',
    description: 'Valor imputable únicamente al viaje/flete del equipo',
    defaultVisible: false,
    align: 'right'
  },
  {
    key: 'odomKilom',
    label: 'ODÓMETRO / KM',
    shortLabel: 'Odómetro',
    description: 'Kilometraje o horómetro de cierre',
    defaultVisible: false,
    align: 'right'
  },
  {
    key: 'ubicacion',
    label: 'UBICACIÓN',
    shortLabel: 'Ubicación',
    description: 'Lugar exacto de operación',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'encargadoObra',
    label: 'ENCARGADO',
    shortLabel: 'Encargado',
    description: 'Responsable de obra que autorizó',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'grasa',
    label: 'GRASA',
    shortLabel: 'Grasa',
    description: 'Control de engrase registrado en el parte',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'aceite',
    label: 'ACEITE',
    shortLabel: 'Aceite',
    description: 'Control de aceite registrado en el parte',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'reparacionMant',
    label: 'REPARACIÓN / MANT.',
    shortLabel: 'Reparación',
    description: 'Novedad o intervención de taller informada',
    defaultVisible: false,
    align: 'left'
  },
  {
    key: 'fuenteOrigen',
    label: 'FUENTE ORIGEN',
    shortLabel: 'Origen',
    description: 'Origen de carga (REPORTE_DIARIO, GASTOS_POR_EQUIPOS, MANUAL)',
    defaultVisible: false,
    align: 'center'
  },
  {
    key: 'novedades',
    label: 'NOVEDADES / OBSERVACIONES',
    shortLabel: 'Novedades',
    description: 'Incidencias, novedades o notas del parte',
    defaultVisible: true,
    align: 'left'
  }
];

