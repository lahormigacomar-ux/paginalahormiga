import {
  Vehicle,
  TableColumnKey,
  Employee,
  FuelVoucher,
  FuelDispensary,
  IssuedFuelVoucher,
  FuelDeposit,
  ParteDiario,
  Obra,
  GenericColumnDefinition,
  TableColumnConfig,
  RentalContract,
  HardwareProduct,
  AridoProduct,
  SoilService,
  UserSession,
  StockItem,
  StockMovement,
  StockCategoryCustom,
  StockWarehouse,
  VehicleServiceLog,
  VehicleExpenseLog,
  ArcaInvoice,
  ArcaConfig,
  InvoiceTemplateLayout,
  DEFAULT_INVOICE_TEMPLATE_LAYOUT,
  Quotation,
  QuotationTemplateLayout,
  DEFAULT_QUOTATION_TEMPLATE_LAYOUT,
  CajaDiariaSession,
  Proveedor,
  PurchaseInvoice,
  SupplierPayment
} from '../types';
import {
  FLEET_COLUMNS,
  FUEL_VOUCHER_COLUMNS,
  EMPLOYEE_COLUMNS,
  PARTE_DIARIO_COLUMNS,
  FuelVoucherColumnKey,
  EmployeeColumnKey,
  ParteDiarioColumnKey
} from '../data/tableColumns';
import { normalizeEquipmentClassification } from '../utils/equipmentClassification';
import { formatPersonName } from '../utils/formatName';
import {
  apiFetchSetting,
  apiSaveSettingStrict,
  apiFetchCollection,
  apiSaveItemsStrict,
  apiClearCollectionStrict
} from './api';

export const STOCK_ITEMS_STORAGE_KEY = 'la_hormiga_stock_items_v1';
export const STOCK_MOVEMENTS_STORAGE_KEY = 'la_hormiga_stock_movements_v1';
export const STOCK_CATEGORIES_STORAGE_KEY = 'la_hormiga_stock_categories_v1';
export const STOCK_WAREHOUSES_STORAGE_KEY = 'la_hormiga_stock_warehouses_v1';
export const SERVICES_STORAGE_KEY = 'la_hormiga_vehicle_services_v1';
export const EXPENSES_STORAGE_KEY = 'la_hormiga_vehicle_expenses_v1';
export const FLEET_STORAGE_KEY = 'la_hormiga_fleet_v2';
export const COLUMNS_STORAGE_KEY = 'la_hormiga_columns_v2';
export const FUEL_COLUMNS_STORAGE_KEY = 'la_hormiga_fuel_columns_v2';
export const DRIVER_COLUMNS_STORAGE_KEY = 'la_hormiga_driver_columns_v1';
export const EMPLOYEES_STORAGE_KEY = 'la_hormiga_empleados_v2';
export const FUEL_VOUCHERS_STORAGE_KEY = 'la_hormiga_expendio_combustible_v3';
export const FUEL_DEPOSITS_STORAGE_KEY = 'la_hormiga_depositos_carga_v1';
export const ISSUED_VOUCHERS_STORAGE_KEY = 'la_hormiga_vales_combustible_v3';
export const PARTES_DIARIOS_STORAGE_KEY = 'la_hormiga_partes_diarios_v1';
export const PARTES_DIARIOS_COLUMNS_STORAGE_KEY = 'la_hormiga_partes_diarios_columns_v1';
export const OBRAS_STORAGE_KEY = 'la_hormiga_obras_v1';
export const RENTALS_STORAGE_KEY = 'la_hormiga_alquileres_v1';
export const HARDWARE_STORAGE_KEY = 'la_hormiga_ferreteria_v1';
export const ARIDOS_STORAGE_KEY = 'la_hormiga_aridos_v1';
export const SOIL_SERVICES_STORAGE_KEY = 'la_hormiga_mov_suelo_v1';
export const USER_SESSION_STORAGE_KEY = 'la_hormiga_user_session_v1';
export const QUOTATIONS_STORAGE_KEY = 'la_hormiga_quotations_v1';

// Cachés temporales en memoria (no son fuente de verdad; la única fuente de verdad es Supabase PostgreSQL)
const memoryColumnConfigs = new Map<string, TableColumnConfig<any>>();
let memoryFuelPricesCache: Record<string, number> | null = null;
let memoryArcaConfigCache: ArcaConfig | null = null;
let memoryInvoiceLayoutCache: InvoiceTemplateLayout | null = null;
let memoryQuotationLayoutCache: QuotationTemplateLayout | null = null;

function buildDefaultColumnConfig<T extends string>(
  defaultDefinitions: GenericColumnDefinition<T>[]
): TableColumnConfig<T> {
  return {
    order: defaultDefinitions.map(d => d.key),
    visible: defaultDefinitions.reduce((acc, def) => {
      acc[def.key] = def.defaultVisible;
      return acc;
    }, {} as Record<T, boolean>)
  };
}

function normalizeColumnConfig<T extends string>(
  raw: any,
  defaultDefinitions: GenericColumnDefinition<T>[]
): TableColumnConfig<T> {
  const defaults = buildDefaultColumnConfig(defaultDefinitions);
  if (!raw || typeof raw !== 'object') return defaults;

  let order: T[] = Array.isArray(raw.order) ? [...raw.order] : [...defaults.order];
  const existingKeys = new Set(order);
  defaults.order.forEach(k => {
    if (!existingKeys.has(k)) order.push(k);
  });
  order = order.filter(k => defaultDefinitions.some(d => d.key === k));

  const visibleObj = raw.visible && typeof raw.visible === 'object' ? raw.visible : raw;
  const visible: Record<T, boolean> = { ...defaults.visible };
  defaults.order.forEach(k => {
    if (typeof visibleObj[k] === 'boolean') {
      visible[k] = visibleObj[k];
    }
  });

  return { order, visible };
}

// Generic loader for table column configurations (in-memory cache + Supabase system_settings)
export function loadTableColumnConfig<T extends string>(
  storageKey: string,
  defaultDefinitions: GenericColumnDefinition<T>[]
): TableColumnConfig<T> {
  const cached = memoryColumnConfigs.get(storageKey);
  if (cached) {
    return normalizeColumnConfig(cached, defaultDefinitions);
  }
  return buildDefaultColumnConfig(defaultDefinitions);
}

export function saveTableColumnConfig<T extends string>(
  storageKey: string,
  config: TableColumnConfig<T>
): void {
  memoryColumnConfigs.set(storageKey, config);
  apiSaveSettingStrict(`col_config_${storageKey}`, config).catch(err => {
    console.warn(`[ColumnConfig] Error sincronizando columnas para ${storageKey} en Supabase:`, err);
  });
}

export function resetTableColumnConfig<T extends string>(
  storageKey: string,
  defaultDefinitions: GenericColumnDefinition<T>[]
): TableColumnConfig<T> {
  const defaults = buildDefaultColumnConfig(defaultDefinitions);
  saveTableColumnConfig(storageKey, defaults);
  return defaults;
}

export async function syncAllColumnConfigsFromCloud(): Promise<void> {
  const keys: Array<{ key: string; defs: GenericColumnDefinition<any>[] }> = [
    { key: COLUMNS_STORAGE_KEY, defs: FLEET_COLUMNS as GenericColumnDefinition<any>[] },
    { key: FUEL_COLUMNS_STORAGE_KEY, defs: FUEL_VOUCHER_COLUMNS as GenericColumnDefinition<any>[] },
    { key: DRIVER_COLUMNS_STORAGE_KEY, defs: EMPLOYEE_COLUMNS as GenericColumnDefinition<any>[] },
    { key: PARTES_DIARIOS_COLUMNS_STORAGE_KEY, defs: PARTE_DIARIO_COLUMNS as GenericColumnDefinition<any>[] },
  ];
  await Promise.all(
    keys.map(async ({ key, defs }) => {
      try {
        const cloud = await apiFetchSetting<TableColumnConfig<any>>(`col_config_${key}`);
        if (cloud && typeof cloud === 'object') {
          memoryColumnConfigs.set(key, normalizeColumnConfig(cloud, defs));
        }
      } catch {
        // ignore missing remote key
      }
    })
  );
}

// Specific Loaders / Savers
export function loadFleetColumnConfig(): TableColumnConfig<TableColumnKey> {
  const config = loadTableColumnConfig<TableColumnKey>(
    COLUMNS_STORAGE_KEY,
    FLEET_COLUMNS as GenericColumnDefinition<TableColumnKey>[]
  );
  if (config.visible.anio === undefined) {
    config.visible.anio = true;
  }
  if (!config.order.includes('anio')) {
    const idx = config.order.indexOf('modeloMarca');
    if (idx >= 0) {
      config.order.splice(idx + 1, 0, 'anio');
    } else {
      config.order.push('anio');
    }
  }
  return config;
}

export function saveFleetColumnConfig(config: TableColumnConfig<TableColumnKey>): void {
  saveTableColumnConfig<TableColumnKey>(COLUMNS_STORAGE_KEY, config);
}

export function loadFuelColumnConfig(): TableColumnConfig<FuelVoucherColumnKey> {
  const config = loadTableColumnConfig<FuelVoucherColumnKey>(FUEL_COLUMNS_STORAGE_KEY, FUEL_VOUCHER_COLUMNS);
  if (config.visible.fecha === undefined || config.visible.fecha === false) {
    config.visible.fecha = true;
  }
  config.visible.hora = false;
  config.order = config.order.filter(k => k !== 'hora');

  if (!config.order.includes('fecha')) {
    const idIdx = config.order.indexOf('id');
    if (idIdx >= 0) {
      config.order.splice(idIdx + 1, 0, 'fecha');
    } else {
      config.order.unshift('fecha');
    }
  }
  return config;
}

export function saveFuelColumnConfig(config: TableColumnConfig<FuelVoucherColumnKey>): void {
  saveTableColumnConfig<FuelVoucherColumnKey>(FUEL_COLUMNS_STORAGE_KEY, config);
}

export function loadDriverColumnConfig(): TableColumnConfig<EmployeeColumnKey> {
  const config = loadTableColumnConfig<EmployeeColumnKey>(DRIVER_COLUMNS_STORAGE_KEY, EMPLOYEE_COLUMNS);
  config.visible.mostrarEnAsistencia = true;
  config.order = config.order.filter(k => k !== 'mostrarEnAsistencia');
  const nameIdx = config.order.indexOf('nombreApellido');
  if (nameIdx >= 0) {
    config.order.splice(nameIdx + 1, 0, 'mostrarEnAsistencia');
  } else {
    config.order.unshift('mostrarEnAsistencia');
  }
  return config;
}

export function saveDriverColumnConfig(config: TableColumnConfig<EmployeeColumnKey>): void {
  saveTableColumnConfig<EmployeeColumnKey>(DRIVER_COLUMNS_STORAGE_KEY, config);
}

export function loadParteDiarioColumnConfig(): TableColumnConfig<ParteDiarioColumnKey> {
  const cached = memoryColumnConfigs.get(PARTES_DIARIOS_COLUMNS_STORAGE_KEY);
  const config = loadTableColumnConfig<ParteDiarioColumnKey>(PARTES_DIARIOS_COLUMNS_STORAGE_KEY, PARTE_DIARIO_COLUMNS);
  if (cached && Array.isArray(cached.order)) {
    const newKeys: ParteDiarioColumnKey[] = [];
    if (!cached.order.includes('kmOdomAprox')) newKeys.push('kmOdomAprox');
    if (!cached.order.includes('kmProrrateado')) newKeys.push('kmProrrateado');
    if (newKeys.length > 0) {
      config.order = config.order.filter(k => !newKeys.includes(k));
      const hrsIdx = config.order.indexOf('horasTrabajadas');
      if (hrsIdx >= 0) {
        config.order.splice(hrsIdx + 1, 0, ...newKeys);
      } else {
        config.order.push(...newKeys);
      }
      newKeys.forEach(k => {
        config.visible[k] = true;
      });
    }
  }
  return config;
}

export function saveParteDiarioColumnConfig(config: TableColumnConfig<ParteDiarioColumnKey>): void {
  saveTableColumnConfig<ParteDiarioColumnKey>(PARTES_DIARIOS_COLUMNS_STORAGE_KEY, config);
}

export const loadEmployeeColumnConfig = loadDriverColumnConfig;
export const saveEmployeeColumnConfig = saveDriverColumnConfig;

export function loadVisibleColumns(): Record<TableColumnKey, boolean> {
  return loadFleetColumnConfig().visible;
}

export function saveVisibleColumns(columns: Record<TableColumnKey, boolean>): void {
  const current = loadFleetColumnConfig();
  saveFleetColumnConfig({
    order: current.order,
    visible: columns
  });
}

// ==================== DEPÓSITOS DE COMBUSTIBLE ====================
export function loadFuelDeposits(): FuelDeposit[] {
  return [];
}

export function saveFuelDeposits(deposits: FuelDeposit[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_deposits_updated', { detail: deposits }));
  }
  apiSaveItemsStrict('fuel_deposits', deposits).catch(err => {
    console.warn('[FuelDeposits] Error sincronizando depósitos en Supabase:', err);
  });
}

export async function syncFuelDepositsFromCloud(): Promise<FuelDeposit[] | null> {
  try {
    const cloud = await apiFetchCollection<FuelDeposit>('fuel_deposits');
    if (cloud && Array.isArray(cloud)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_deposits_updated', { detail: cloud }));
      }
      return cloud;
    }
  } catch (err) {
    console.warn('[FuelDeposits] Error descargando depósitos desde Supabase:', err);
  }
  return null;
}

export function exportFuelDepositsToCSV(deposits: FuelDeposit[]): void {
  const headers = [
    'ID',
    'CÓDIGO',
    'NOMBRE_DEPÓSITO',
    'MODALIDAD',
    'TIPO_COMBUSTIBLE',
    'CAPACIDAD_TOTAL_LTS',
    'STOCK_ACTUAL_LTS',
    'ESTADO',
    'UBICACIÓN',
    'RESPONSABLE',
    'PATENTE_VEHÍCULO',
    'CANTIDAD_BIDONES',
    'ESTACIÓN_CONVENIO',
    'DIRECCIÓN_ESTACIÓN',
    'ÚLTIMA_RECARGA',
    'OBSERVACIONES'
  ];

  const rows = deposits.map(d => [
    `"${d.id || ''}"`,
    `"${(d.codigo || '').replace(/"/g, '""')}"`,
    `"${(d.nombre || '').replace(/"/g, '""')}"`,
    `"${(d.modalidadLabel || d.modalidad || '').replace(/"/g, '""')}"`,
    `"${(d.tipoCombustible || '').replace(/"/g, '""')}"`,
    d.capacidadTotal ?? 0,
    d.stockActual ?? 0,
    `"${(d.estado || '').replace(/"/g, '""')}"`,
    `"${(d.ubicacion || '').replace(/"/g, '""')}"`,
    `"${(d.responsableNombre || '').replace(/"/g, '""')}"`,
    `"${(d.patenteVehiculo || '').replace(/"/g, '""')}"`,
    d.cantidadBidones ?? '',
    `"${(d.numEstacionConvenio || d.nombreEstacion || '').replace(/"/g, '""')}"`,
    `"${(d.direccionEstacion || '').replace(/"/g, '""')}"`,
    `"${(d.ultimaRecargaFecha || '').replace(/"/g, '""')}"`,
    `"${(d.observaciones || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `depositos_combustible_la_hormiga_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== VALES EMITIDOS ====================
export function loadIssuedVouchers(): IssuedFuelVoucher[] {
  return [];
}

export function saveIssuedVouchers(vouchers: IssuedFuelVoucher[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_issued_vouchers_updated', { detail: vouchers }));
  }
  apiSaveItemsStrict('issued_vouchers', vouchers).catch(err => {
    console.warn('[IssuedVouchers] Error sincronizando vales en Supabase:', err);
  });
}

export async function syncIssuedVouchersFromCloud(): Promise<IssuedFuelVoucher[] | null> {
  try {
    const cloud = await apiFetchCollection<IssuedFuelVoucher>('issued_vouchers');
    if (cloud && Array.isArray(cloud)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_issued_vouchers_updated', { detail: cloud }));
      }
      return cloud;
    }
  } catch (err) {
    console.warn('[IssuedVouchers] Error descargando vales desde Supabase:', err);
  }
  return null;
}

export function exportIssuedVouchersToCSV(vouchers: IssuedFuelVoucher[]): void {
  const headers = [
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
  ];

  const rows = vouchers.map(v => [
    `"${v.id || ''}"`,
    `"${(v.numVale || '').replace(/"/g, '""')}"`,
    `"${(v.estado || 'EMITIDO').replace(/"/g, '""')}"`,
    `"${(v.fechaEmision || '').replace(/"/g, '""')}"`,
    `"${(v.horaEmision || '').replace(/"/g, '""')}"`,
    `"${(v.codigoEquipo || '').replace(/"/g, '""')}"`,
    `"${(v.marcaModelo || '').replace(/"/g, '""')}"`,
    `"${(v.patente || '').replace(/"/g, '""')}"`,
    `"${(v.codigoEmpleado || '').replace(/"/g, '""')}"`,
    `"${(v.nombreApellido || '').replace(/"/g, '""')}"`,
    `"${(v.legajo || '').replace(/"/g, '""')}"`,
    `"${(v.tipoComb || '').replace(/"/g, '""')}"`,
    `"${(v.idCombustible || '').replace(/"/g, '""')}"`,
    v.litrosAutorizados ?? 0,
    `"${(v.tipoCarga || '').replace(/"/g, '""')}"`,
    `"${(v.estacionSurtidor || '').replace(/"/g, '""')}"`,
    `"${(v.numEstacion || '').replace(/"/g, '""')}"`,
    v.odometroSalida ?? '',
    `"${(v.numTicket || '').replace(/"/g, '""')}"`,
    v.litrosReales ?? '',
    v.diferenciaLitros ?? '',
    v.odometroCarga ?? '',
    v.importeTotal ?? '',
    `"${(v.fechaRendicion || '').replace(/"/g, '""')}"`,
    `"${(v.expendioId || '').replace(/"/g, '""')}"`,
    `"${(v.observaciones || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_vales_combustible_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== ODÓMETRO / EXPENDIO DE COMBUSTIBLE ====================
export function parseOdometerValue(val: any): number {
  if (val === undefined || val === null || val === '' || val === '-') return 0;

  if (typeof val === 'number') {
    if (isNaN(val)) return 0;
    return Number(val.toFixed(3));
  }

  let str = String(val).trim();
  if (!str || str === '-') return 0;

  str = str.replace(/[\$€ARS\s"]/gi, '');
  if (!str) return 0;

  if (/^\d{1,3}(,\d{3})+$/.test(str)) {
    str = str.replace(/,/g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
    str = str.replace(/\./g, '');
  } else if (/^\d+,\d{3}$/.test(str)) {
    str = str.replace(',', '');
  } else if (/^\d+\.\d{3}$/.test(str)) {
    str = str.replace('.', '');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;

  return Number(num.toFixed(3));
}

export function extractFirstNonZeroOdometer(...values: any[]): number {
  for (const val of values) {
    if (val !== undefined && val !== null && val !== '' && val !== '-') {
      const parsed = parseOdometerValue(val);
      if (parsed > 0) return parsed;
    }
  }
  return 0;
}

export function extractFirstNonZeroDistance(...values: any[]): number {
  for (const val of values) {
    if (val !== undefined && val !== null && val !== '' && val !== '-') {
      const parsed = Math.abs(parseOdometerValue(val));
      if (parsed > 0) return parsed;
    }
  }
  return 0;
}

export function normalizeFuelVouchersList(vouchers: FuelVoucher[]): FuelVoucher[] {
  const seenIds = new Set<string>();
  return (vouchers || []).map((item: any, idx: number) => {
    let id = item.id || `EXP-${idx}`;
    if (seenIds.has(id)) {
      id = `${id}_${idx}`;
    }
    seenIds.add(id);

    const kms = extractFirstNonZeroOdometer(
      item.kilometraje,
      item.kmsHs,
      item.horometroOdometro,
      item['KMS/HS'],
      item['KMS_HS'],
      item['KILOMETRAJE'],
      item['ODOMETRO'],
      item['HOROMETRO'],
      item['KM']
    );
    const kmsRec = extractFirstNonZeroDistance(
      item.kilometrosRec,
      item.kmsRec,
      item['KILOMETROS_REC'],
      item['KM_RECORRIDO'],
      item['KMS_REC']
    );
    const rawTipo = String(item.tipo || '').toUpperCase().trim();
    let cleanTipo = rawTipo;
    if (cleanTipo !== 'INGRESO' && cleanTipo !== 'EGRESO') {
      const recipient = `${item.codigoEquipo || ''} ${item.marcaModelo || ''} ${item.patente || ''} ${item.id || ''}`.toLowerCase();
      if (recipient.includes('bidon') || recipient.includes('amarillo') || recipient.includes('cisterna') || recipient.includes('dep-amb') || recipient.includes('exp-354')) {
        cleanTipo = 'INGRESO';
      } else {
        cleanTipo = 'EGRESO';
      }
    }

    const cleanName = formatPersonName(item.nombreApellido || item.codigoEmpleado);
    const cleanEmpCode = (item.codigoEmpleado && (item.codigoEmpleado.startsWith('EMP-') || item.codigoEmpleado.startsWith('OP-') || item.codigoEmpleado.startsWith('CH-') || item.codigoEmpleado.startsWith('LEG-')))
      ? item.codigoEmpleado
      : cleanName;

    return {
      ...item,
      id,
      nombreApellido: cleanName || item.nombreApellido,
      codigoEmpleado: cleanEmpCode || item.codigoEmpleado,
      tipo: cleanTipo,
      kilometraje: kms,
      kmsHs: kms,
      horometroOdometro: kms,
      kilometrosRec: kmsRec
    };
  });
}

export function loadFuelVouchers(): FuelVoucher[] {
  return [];
}

export function saveFuelVouchers(vouchers: FuelVoucher[]): void {
  const normalized = normalizeFuelVouchersList(vouchers);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_fuel_vouchers_updated', { detail: normalized }));
  }
  apiSaveItemsStrict('fuel_vouchers', normalized).catch(err => {
    console.warn('[FuelVouchers] Error sincronizando expendios en Supabase:', err);
  });
}

export async function syncFuelVouchersFromCloud(): Promise<FuelVoucher[] | null> {
  try {
    const cloud = await apiFetchCollection<FuelVoucher>('fuel_vouchers');
    if (cloud && Array.isArray(cloud)) {
      const normalized = normalizeFuelVouchersList(cloud);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_fuel_vouchers_updated', { detail: normalized }));
      }
      return normalized;
    }
  } catch (err) {
    console.warn('[FuelVouchers] Error descargando expendios desde Supabase:', err);
  }
  return null;
}

export function exportFuelVouchersToCSV(vouchers: FuelVoucher[]): void {
  const headers = [
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
  ];

  const rows = vouchers.map(v => {
    const rawTipo = String(v.tipo || '').toUpperCase().trim();
    const cleanTipo = (rawTipo === 'INGRESO' || rawTipo === 'EGRESO')
      ? rawTipo
      : (((v.codigoEquipo || '') + ' ' + (v.marcaModelo || '') + ' ' + (v.id || '')).toLowerCase().includes('amarillo') ||
         ((v.codigoEquipo || '') + ' ' + (v.marcaModelo || '')).toLowerCase().includes('bidon') ||
         (v.id || '').toLowerCase().includes('exp-354')) ? 'INGRESO' : 'EGRESO';

    return [
      `"${v.id || ''}"`,
      `"${(v.carga || v.tipoCarga || '').replace(/"/g, '""')}"`,
      `"${cleanTipo}"`,
      `"${(v.idCombustible || 'COMB-D500').replace(/"/g, '""')}"`,
      `"${(v.deposito || v.numEstacion || '').replace(/"/g, '""')}"`,
      v.cantidad ?? 0,
      `"${(v.tipoComb || v.combustible || '').replace(/"/g, '""')}"`,
      `"${(v.codigoEmpleado || '').replace(/"/g, '""')}"`,
      `"${(v.nombreApellido || '').replace(/"/g, '""')}"`,
      `"${(v.legajo || '').replace(/"/g, '""')}"`,
      `"${(v.codigoEquipo || '').replace(/"/g, '""')}"`,
      `"${(v.marcaModelo || '').replace(/"/g, '""')}"`,
      `"${(v.patente || '').replace(/"/g, '""')}"`,
      `"${(v.numOrden || v.numComprobante || '').replace(/"/g, '""')}"`,
      `"${(v.fecha || v.fechaEmision || '').replace(/"/g, '""')}"`,
      v.kilometraje ?? (v.horometroOdometro ?? 0),
      `"${(v.hora || v.horaEmision || '').replace(/"/g, '""')}"`,
      v.kilometrosRec ?? 0,
      `"${(v.autonom || '').replace(/"/g, '""')}"`,
      `"${(v.numEstacion || '').replace(/"/g, '""')}"`,
      `"${(v.fotoExpendio || '').replace(/"/g, '""')}"`,
      `"${(v.fotoKilometraje || '').replace(/"/g, '""')}"`
    ];
  });

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_expendio_combustible_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== EMPLEADOS / CHOFERES ====================
export function loadDrivers(): Employee[] {
  return [];
}

export function saveDrivers(employees: Employee[]): void {
  const seenIds = new Set<string>();
  const sanitized = (employees || [])
    .filter((item: any) => Boolean(item))
    .map((item: any, idx: number) => {
      let id = item.id || `EMP-${idx}`;
      if (seenIds.has(id)) {
        id = `${id}_${idx}`;
      }
      seenIds.add(id);
      return { ...item, id };
    });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_drivers_updated', { detail: sanitized }));
  }
  apiSaveItemsStrict('drivers', sanitized).catch(err => {
    console.warn('[Drivers] Error sincronizando empleados en Supabase:', err);
  });
}

export async function syncDriversFromCloud(): Promise<Employee[] | null> {
  try {
    const cloud = await apiFetchCollection<Employee>('drivers');
    if (cloud && Array.isArray(cloud)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_drivers_updated', { detail: cloud }));
      }
      return cloud;
    }
  } catch (err) {
    console.warn('[Drivers] Error descargando empleados desde Supabase:', err);
  }
  return null;
}

export function exportDriversToCSV(employees: Employee[], fleet: Vehicle[]): void {
  const headers = [
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
  ];

  const rows = employees.map(e => {
    const assignedVehicle = fleet.find(v => v.id === e.vehiculoAsignadoId);
    const assignedText = assignedVehicle
      ? `[${assignedVehicle.id}] ${assignedVehicle.modeloMarca}`
      : 'Sin Asignar';

    return [
      `"${e.id || ''}"`,
      `"${e.codigoEmpleado || ''}"`,
      `"${(e.nombreApellido || '').replace(/"/g, '""')}"`,
      `"${e.legajo || ''}"`,
      `"${(e.categoria || '').replace(/"/g, '""')}"`,
      `"${e.foto || ''}"`,
      `"${(e.sector || '').replace(/"/g, '""')}"`,
      `"${(e.obra || '').replace(/"/g, '""')}"`,
      `"${e.estado || ''}"`,
      `"${e.dni || ''}"`,
      `"${e.telefono || ''}"`,
      `"${assignedText.replace(/"/g, '""')}"`,
      e.costoPorDia ?? 0,
      `"${e.fechaAlta || ''}"`
    ];
  });

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_empleados_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== FLOTA VEHICULAR ====================
export function loadFleet(): Vehicle[] {
  return [];
}

export function saveFleet(fleet: Vehicle[]): void {
  const normalized = (fleet || []).map((v: Vehicle, idx: number) => ({
    ...v,
    clasificacion: normalizeEquipmentClassification(v.clasificacion, v.modeloMarca),
    ordenVisibilidad: v.ordenVisibilidad ?? (idx + 1)
  }));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_fleet_updated', { detail: normalized }));
  }
  apiSaveItemsStrict('vehicles', normalized).catch(err => {
    console.warn('[Fleet] Error sincronizando flota en Supabase:', err);
  });
}

export async function syncFleetFromCloud(): Promise<Vehicle[] | null> {
  try {
    const cloud = await apiFetchCollection<Vehicle>('vehicles');
    if (cloud && Array.isArray(cloud)) {
      const normalized = cloud.map((v: Vehicle, idx: number) => ({
        ...v,
        clasificacion: normalizeEquipmentClassification(v.clasificacion, v.modeloMarca),
        ordenVisibilidad: v.ordenVisibilidad ?? (idx + 1)
      }));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_fleet_updated', { detail: normalized }));
      }
      return normalized;
    }
  } catch (err) {
    console.warn('[Fleet] Error descargando flota desde Supabase:', err);
  }
  return null;
}

export function exportFleetToCSV(fleet: Vehicle[]): void {
  const headers = [
    'ID',
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
  ];

  const rows = fleet.map(v => [
    `"${v.id || ''}"`,
    `"${(v.modeloMarca || '').replace(/"/g, '""')}"`,
    `"${v.patente || ''}"`,
    `"${v.codigoInterno || ''}"`,
    `"${v.fotografia || ''}"`,
    v.precioCosto ?? 0,
    v.precioSugerido ?? 0,
    v.precioCostoHora ?? 0,
    v.precioSugeridoHora ?? 0,
    `"${v.modalidadTarifa || 'AMBOS'}"`,
    `"${v.clasificacion || ''}"`,
    `"${v.estado || ''}"`,
    v.horometro ?? '',
    `"${(v.ubicacionActual || '').replace(/"/g, '""')}"`,
    `"${v.fechaAlta || ''}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_flota_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== CATÁLOGO DE PRECIOS DE COMBUSTIBLE ====================
export const DEFAULT_FUEL_CATALOG: Record<string, number> = {
  'DIESEL COMUN': 2509,
  'DIESEL INFINIA': 2583,
  'NAFTA SUPER': 2239,
  'NAFTA INFINIA': 2405
};

const OBSOLETE_TEMPLATE_FUELS = new Set([
  'EURO DIESEL',
  'NAFTA PREMIUM',
  'GNC / GLP',
  'BIODIESEL',
  'INFINIA DIESEL',
  'DIESEL 500 (GRADO 2)'
]);

export function loadFuelPrices(): Record<string, number> {
  if (memoryFuelPricesCache && Object.keys(memoryFuelPricesCache).length > 0) {
    return { ...memoryFuelPricesCache };
  }
  return { ...DEFAULT_FUEL_CATALOG };
}

export function getLatestFuelPrice(fuelType?: string, vouchers?: FuelDispensary[]): number {
  if (!fuelType) return 2509;
  const rawNorm = fuelType.trim().toUpperCase();

  let normKey = 'DIESEL COMUN';
  if (rawNorm.includes('INFINIA') && (rawNorm.includes('DIESEL') || rawNorm.includes('D-') || rawNorm.includes('GRADO 3'))) {
    normKey = 'DIESEL INFINIA';
  } else if (rawNorm.includes('EURO') || (rawNorm.includes('DIESEL') && rawNorm.includes('PREMIUM'))) {
    normKey = 'DIESEL INFINIA';
  } else if (rawNorm.includes('500') || rawNorm.includes('DIESEL') || rawNorm.includes('COMUN') || rawNorm.includes('COMÚN')) {
    normKey = 'DIESEL COMUN';
  } else if (rawNorm.includes('NAFTA') && (rawNorm.includes('INFINIA') || rawNorm.includes('PREMIUM') || rawNorm.includes('GRADO 3'))) {
    normKey = 'NAFTA INFINIA';
  } else if (rawNorm.includes('NAFTA') || rawNorm.includes('SUPER') || rawNorm.includes('SÚPER')) {
    normKey = 'NAFTA SUPER';
  } else {
    normKey = rawNorm;
  }

  if (vouchers && vouchers.length > 0) {
    const sorted = [...vouchers].sort((a, b) => {
      const timeA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const timeB = b.fecha ? new Date(b.fecha).getTime() : 0;
      return timeB - timeA;
    });

    for (const v of sorted) {
      const vFuel = (v.tipoComb || v.combustible || '').trim().toUpperCase();
      if (vFuel && (vFuel.includes(normKey) || normKey.includes(vFuel) || (normKey === 'DIESEL COMUN' && vFuel.includes('DIESEL')))) {
        if (v.precioUnitario && v.precioUnitario > 0) {
          return v.precioUnitario;
        }
        if (v.totalImporte && v.cantidad && v.cantidad > 0) {
          return Number((v.totalImporte / v.cantidad).toFixed(2));
        }
      }
    }
  }

  const catalog = loadFuelPrices();
  if (catalog[normKey] !== undefined && catalog[normKey] > 0) {
    return catalog[normKey];
  }
  if (catalog[rawNorm] !== undefined && catalog[rawNorm] > 0) {
    return catalog[rawNorm];
  }

  if (normKey === 'DIESEL INFINIA') return 2583;
  if (normKey === 'NAFTA INFINIA') return 2405;
  if (normKey === 'NAFTA SUPER') return 2239;
  return 2509;
}

export function loadAllFuelPrices(): Record<string, number> {
  return loadFuelPrices();
}

export function deleteFuelPrice(fuelType: string): Record<string, number> {
  const current = loadFuelPrices();
  const targetNorm = fuelType.trim().toUpperCase();
  const updated: Record<string, number> = {};

  Object.entries(current).forEach(([k, v]) => {
    if (k.trim().toUpperCase() !== targetNorm) {
      updated[k] = v;
    }
  });

  memoryFuelPricesCache = updated;
  apiSaveSettingStrict('fuel_prices_catalog', updated).catch(err => {
    console.warn('[FuelPrices] Error sincronizando eliminación de precio en Supabase:', err);
  });

  return updated;
}

export function assignFuelToStation(
  deposits: FuelDeposit[],
  stationId: string,
  fuelName: string,
  assigned: boolean
): FuelDeposit[] {
  const updated = deposits.map(dep => {
    if (dep.id === stationId) {
      const current = dep.tiposCombustibles || (dep.tipoCombustible ? dep.tipoCombustible.split(' / ').map(f => f.trim()) : []);
      let newFuels: string[];
      if (assigned) {
        if (!current.some(f => f.toLowerCase() === fuelName.toLowerCase())) {
          newFuels = [...current, fuelName];
        } else {
          newFuels = current;
        }
      } else {
        newFuels = current.filter(f => f.toLowerCase() !== fuelName.toLowerCase());
      }
      return {
        ...dep,
        tiposCombustibles: newFuels,
        tipoCombustible: newFuels.join(' / ')
      };
    }
    return dep;
  });
  saveFuelDeposits(updated);
  return updated;
}

export function assignStationsToFuel(
  deposits: FuelDeposit[],
  fuelName: string,
  stationIds: string[]
): FuelDeposit[] {
  const idSet = new Set(stationIds);
  const updated = deposits.map(dep => {
    const current = dep.tiposCombustibles || (dep.tipoCombustible ? dep.tipoCombustible.split(' / ').map(f => f.trim()) : []);
    const shouldInclude = idSet.has(dep.id);
    let newFuels: string[];
    if (shouldInclude) {
      if (!current.some(f => f.toLowerCase() === fuelName.toLowerCase())) {
        newFuels = [...current, fuelName];
      } else {
        newFuels = current;
      }
    } else {
      newFuels = current.filter(f => f.toLowerCase() !== fuelName.toLowerCase());
    }
    return {
      ...dep,
      tiposCombustibles: newFuels,
      tipoCombustible: newFuels.join(' / ')
    };
  });
  saveFuelDeposits(updated);
  return updated;
}

export function assignFuelsToStation(
  deposits: FuelDeposit[],
  stationId: string,
  fuelNames: string[]
): FuelDeposit[] {
  const updated = deposits.map(dep => {
    if (dep.id === stationId) {
      const uniqueFuels = Array.from(new Set(fuelNames.map(f => f.trim()).filter(Boolean)));
      return {
        ...dep,
        tiposCombustibles: uniqueFuels,
        tipoCombustible: uniqueFuels.join(' / ')
      };
    }
    return dep;
  });
  saveFuelDeposits(updated);
  return updated;
}

export function saveFuelPrice(fuelType: string, price: number): void {
  const current = loadFuelPrices();
  const next = { ...current, [fuelType]: price };
  memoryFuelPricesCache = next;
  apiSaveSettingStrict('fuel_prices_catalog', next).catch(err => {
    console.warn('[FuelPrices] Error sincronizando precio en Supabase:', err);
  });
}

export async function saveFuelPriceStrict(fuelType: string, price: number): Promise<{ ok: boolean; error?: string }> {
  const cleanName = fuelType.trim().toUpperCase();
  if (!cleanName) {
    return { ok: false, error: 'El nombre del combustible es obligatorio.' };
  }
  const current = loadFuelPrices();
  const next = { ...current, [cleanName]: Number(price) || 0 };
  const res = await apiSaveSettingStrict('fuel_prices_catalog', next);
  if (!res.ok) {
    return { ok: false, error: res.error || 'Error guardando tipo de combustible en Supabase.' };
  }
  memoryFuelPricesCache = next;
  return { ok: true };
}

export async function syncFuelPricesFromCloud(): Promise<Record<string, number> | null> {
  try {
    const cloudPrices = await apiFetchSetting<Record<string, number>>('fuel_prices_catalog');
    if (cloudPrices && typeof cloudPrices === 'object' && Object.keys(cloudPrices).length > 0) {
      const clean: Record<string, number> = {};
      Object.entries(cloudPrices).forEach(([k, v]) => {
        const normKey = k.trim().toUpperCase();
        if (normKey && !normKey.includes('/') && !OBSOLETE_TEMPLATE_FUELS.has(normKey)) {
          clean[normKey] = Number(v);
        }
      });
      memoryFuelPricesCache = clean;
      return clean;
    }
  } catch (err) {
    console.warn('[FuelPrices] Error descargando precios desde Supabase:', err);
  }
  return null;
}

// ==================== PARTES DIARIOS ====================
export function loadPartesDiarios(): ParteDiario[] {
  return [];
}

export function savePartesDiarios(partes: ParteDiario[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_partes_diarios_updated', { detail: partes }));
  }
  apiSaveItemsStrict('partes_diarios', partes).catch(err => {
    console.warn('[PartesDiarios] Error sincronizando partes diarios en Supabase:', err);
  });
}

export async function syncPartesDiariosFromCloud(): Promise<ParteDiario[] | null> {
  try {
    const cloud = await apiFetchCollection<ParteDiario>('partes_diarios');
    if (cloud && Array.isArray(cloud)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_partes_diarios_updated', { detail: cloud }));
      }
      return cloud;
    }
  } catch (err) {
    console.warn('[PartesDiarios] Error descargando partes diarios desde Supabase:', err);
  }
  return null;
}

export function exportPartesDiariosToCSV(partes: ParteDiario[]): void {
  const headers = [
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
    'HS_CANTIDAD',
    'NOVEDADES',
    'UBICACION',
    'ENCARGADO_OBRA',
    'FIRMA',
    'NUM_PARTE'
  ];

  const rows = partes.map(p => [
    `"${p.id || ''}"`,
    `"${(p.servMant || 'ALQUILER').replace(/"/g, '""')}"`,
    `"${(p.obra || '').replace(/"/g, '""')}"`,
    `"${(p.codigoObra || '').replace(/"/g, '""')}"`,
    `"${(p.codigoEquipo || '').replace(/"/g, '""')}"`,
    `"${(p.marcaModelo || p.vehicleName || '').replace(/"/g, '""')}"`,
    `"${(p.codigoEmpleado || '').replace(/"/g, '""')}"`,
    `"${(p.nombreApellido || p.driverName || '').replace(/"/g, '""')}"`,
    `"${p.fecha || ''}"`,
    `"${p.horaInicioMañana || ''}"`,
    `"${p.horaFinMañana || ''}"`,
    `"${p.horaInicioTarde || ''}"`,
    `"${p.horaFinTarde || ''}"`,
    p.horasTrabajadas ?? 0,
    p.odomKilom ?? 0,
    `"${p.tipo || 'HORAS'}"`,
    `"${(p.detalleTipo || p.detalleEntrega || '').replace(/"/g, '""')}"`,
    p.viajesCantidad ?? p.cantidad ?? 0,
    `"${(p.extraccionEntregas || '').replace(/"/g, '""')}"`,
    `"${(p.tipoMaterial || '').replace(/"/g, '""')}"`,
    p.hsCantidad ?? p.horasTrabajadas ?? 0,
    `"${(p.novedades || '').replace(/"/g, '""')}"`,
    `"${(p.ubicacion || '').replace(/"/g, '""')}"`,
    `"${(p.encargadoObra || '').replace(/"/g, '""')}"`,
    `"${(p.firma || '').replace(/"/g, '""')}"`,
    `"${p.numParte || ''}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_partes_diarios_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== FORMATO DE MONEDA ====================
export function isUsdCurrency(currency?: string): boolean {
  const c = String(currency || '').toUpperCase();
  return c === 'USD' || c === 'DOL' || c.includes('USD') || c.includes('DOLAR') || c.includes('DÓLAR');
}

export function getCurrencySymbol(currency?: string): string {
  return isUsdCurrency(currency) ? 'US$ ' : '$';
}

export function formatCurrency(amount?: number, currency: 'ARS' | 'USD' | string = 'ARS'): string {
  const isUsd = isUsdCurrency(currency);
  if (amount === undefined || amount === null || isNaN(amount)) {
    return isUsd ? 'US$ 0' : '$0';
  }
  if (isUsd) {
    const hasDecimals = Math.abs(amount % 1) > 0.001;
    return `US$ ${new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(amount)}`;
  }
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ==================== OBRAS ====================
export function loadObras(): Obra[] {
  return [];
}

export function saveObras(obras: Obra[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_obras_updated', { detail: obras }));
  }
  apiSaveItemsStrict('obras', obras).catch(err => {
    console.warn('[Obras] Error sincronizando obras en Supabase:', err);
  });
}

export async function syncObrasFromCloud(): Promise<Obra[] | null> {
  try {
    const cloud = await apiFetchCollection<Obra>('obras');
    if (cloud && Array.isArray(cloud)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_obras_updated', { detail: cloud }));
      }
      return cloud;
    }
  } catch (err) {
    console.warn('[Obras] Error descargando obras desde Supabase:', err);
  }
  return null;
}

export function exportObrasToCSV(obras: Obra[]): void {
  const headers = [
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
  ];

  const rows = obras.map(o => [
    `"${o.id || ''}"`,
    `"${(o.numero || '').replace(/"/g, '""')}"`,
    `"${(o.nombreObra || '').replace(/"/g, '""')}"`,
    `"${(o.ubicacion || '').replace(/"/g, '""')}"`,
    `"${(o.pertenece || '').replace(/"/g, '""')}"`,
    o.activa ? 'SÍ' : 'NO',
    `"${(o.plazo || '').replace(/"/g, '""')}"`,
    o.montoEstimado ?? 0,
    `"${o.fechaAlta || ''}"`,
    `"${(o.observaciones || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_obras_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== GESTOR DE ALQUILERES ====================
export const RENTALS_CHANGE_EVENT = 'la_hormiga_rentals_updated';

export function loadRentals(): RentalContract[] {
  return [];
}

export function saveRentals(rentals: RentalContract[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RENTALS_CHANGE_EVENT, { detail: rentals }));
  }
  apiSaveItemsStrict('rentals', rentals).catch(err => {
    console.warn('[Rentals] Error sincronizando alquileres en Supabase:', err);
  });
}

export async function syncRentalsFromCloud(): Promise<RentalContract[] | null> {
  try {
    const cloudRentals = await apiFetchCollection<RentalContract>('rentals');
    if (cloudRentals && Array.isArray(cloudRentals)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(RENTALS_CHANGE_EVENT, { detail: cloudRentals }));
      }
      return cloudRentals;
    }
  } catch (err) {
    console.warn('[Rentals] Error descargando alquileres desde Supabase:', err);
  }
  return null;
}

export function exportRentalsToCSV(rentals: RentalContract[]): void {
  const headers = [
    'ID',
    'NUM_CONTRATO',
    'CLIENTE',
    'TELEFONO',
    'EQUIPO',
    'CATEGORIA',
    'OPERARIO_ASIGNADO',
    'MODALIDAD',
    'DURACION',
    'FECHA_INICIO',
    'FECHA_FIN_ESTIMADA',
    'TOTAL_ALQUILER',
    'ESTADO',
    'DIRECCION_OBRA'
  ];

  const rows = rentals.map(r => [
    `"${r.id || ''}"`,
    `"${r.numeroContrato || ''}"`,
    `"${(r.clienteNombre || '').replace(/"/g, '""')}"`,
    `"${(r.clienteTelefono || '').replace(/"/g, '""')}"`,
    `"${(r.equipoModelo || '').replace(/"/g, '""')}"`,
    `"${r.equipoCategoria || ''}"`,
    `"${(r.operarioNombre || (r.operarioIncluido ? 'Sin asignar' : 'Sin operario')).replace(/"/g, '""')}"`,
    `"${r.modalidad || ''}"`,
    r.duracion || 1,
    `"${r.fechaInicio || ''}"`,
    `"${r.fechaFinEstimada || ''}"`,
    r.totalAlquiler ?? 0,
    `"${r.estado || ''}"`,
    `"${(r.direccionObra || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_alquileres_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== FERRETERÍA & SALÓN DE VENTAS ====================
export const HARDWARE_CHANGE_EVENT = 'la_hormiga_hardware_updated';

export function loadHardwareProducts(): HardwareProduct[] {
  return [];
}

export function saveHardwareProducts(products: HardwareProduct[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HARDWARE_CHANGE_EVENT, { detail: products }));
  }
  apiSaveItemsStrict('hardware', products).catch(err => {
    console.warn('[Hardware] Error sincronizando ferretería en Supabase:', err);
  });
}

export async function syncHardwareFromCloud(): Promise<HardwareProduct[] | null> {
  try {
    const cloudProducts = await apiFetchCollection<HardwareProduct>('hardware');
    if (cloudProducts && Array.isArray(cloudProducts)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(HARDWARE_CHANGE_EVENT, { detail: cloudProducts }));
      }
      return cloudProducts;
    }
  } catch (err) {
    console.warn('[Hardware] Error descargando ferretería desde Supabase:', err);
  }
  return null;
}

export function exportHardwareToCSV(products: HardwareProduct[]): void {
  const headers = [
    'CODIGO',
    'CODIGO_INTERNO',
    'CODIGO_BARRAS',
    'CODIGO_PROVEEDOR',
    'FAMILIA',
    'GRUPO',
    'DESCRIPCION',
    'DESCRIPCION_ADICIONAL',
    'MARCA',
    'PROVEEDORES',
    'SECTOR',
    'SUBSECTOR',
    'STOCK_ACTUAL',
    'STOCK_MINIMO',
    'COSTO_UNITARIO',
    'PRECIO_VENTA',
    'PUBLICADO_WEB'
  ];

  const rows = products.map(p => [
    `"${p.codigo || ''}"`,
    `"${p.codigoInterno || ''}"`,
    `"${p.codigoDeBarras || ''}"`,
    `"${p.codigoProveedor || ''}"`,
    `"${(p.familiaNombre || '').replace(/"/g, '""')}"`,
    `"${(p.grupoNombre || '').replace(/"/g, '""')}"`,
    `"${(p.nombre || '').replace(/"/g, '""')}"`,
    `"${(p.descripcionAdicional || p.descripcion || '').replace(/"/g, '""')}"`,
    `"${(p.marca || '').replace(/"/g, '""')}"`,
    `"${(p.proveedoresNombres || []).join(', ').replace(/"/g, '""')}"`,
    `"${(p.sector || '').replace(/"/g, '""')}"`,
    `"${(p.subsector || '').replace(/"/g, '""')}"`,
    p.stockActual ?? 0,
    p.stockMinimoAlerta ?? 0,
    p.precioCosto ?? 0,
    p.precioVenta ?? 0,
    p.publicarEnWeb ? 'SÍ' : 'NO'
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_salon_ferreteria_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== VENTA DE ÁRIDOS ====================
export const ARIDOS_CHANGE_EVENT = 'la_hormiga_aridos_updated';

export function loadAridos(): AridoProduct[] {
  return [];
}

export function saveAridos(aridos: AridoProduct[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ARIDOS_CHANGE_EVENT, { detail: aridos }));
  }
  apiSaveItemsStrict('aridos', aridos).catch(err => {
    console.warn('[Aridos] Error sincronizando áridos en Supabase:', err);
  });
}

export async function syncAridosFromCloud(): Promise<AridoProduct[] | null> {
  try {
    const cloudAridos = await apiFetchCollection<AridoProduct>('aridos');
    if (cloudAridos && Array.isArray(cloudAridos)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ARIDOS_CHANGE_EVENT, { detail: cloudAridos }));
      }
      return cloudAridos;
    }
  } catch (err) {
    console.warn('[Aridos] Error descargando áridos desde Supabase:', err);
  }
  return null;
}

// ==================== MOVIMIENTO DE SUELO ====================
export const SOIL_SERVICES_CHANGE_EVENT = 'la_hormiga_soil_services_updated';

export function loadSoilServices(): SoilService[] {
  return [];
}

export function saveSoilServices(services: SoilService[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SOIL_SERVICES_CHANGE_EVENT, { detail: services }));
  }
  apiSaveSettingStrict('soil_services', services).catch(err => {
    console.warn('[SoilServices] Error sincronizando servicios en Supabase:', err);
  });
}

export async function syncSoilServicesFromCloud(): Promise<SoilService[] | null> {
  try {
    const cloudServices = await apiFetchSetting<SoilService[]>('soil_services');
    if (cloudServices && Array.isArray(cloudServices)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SOIL_SERVICES_CHANGE_EVENT, { detail: cloudServices }));
      }
      return cloudServices;
    }
  } catch (err) {
    console.warn('[SoilServices] Error descargando servicios desde Supabase:', err);
  }
  return null;
}

// ==================== USER AUTH & SESSION STORAGE (EXCEPCIÓN DE AUTENTICACIÓN DELIMITADA) ====================
export function loadUserSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(USER_SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.username) {
        return {
          id: parsed.id,
          username: parsed.username,
          nombre: parsed.nombre,
          email: parsed.email,
          rol: parsed.rol,
          permisos: parsed.permisos,
          accesoTotal: parsed.accesoTotal,
          fechaIngreso: parsed.fechaIngreso,
        };
      }
    }
  } catch (error) {
    console.error('Error reading user session:', error);
  }
  return null;
}

export function saveUserSession(session: UserSession): void {
  try {
    const minimalSession: UserSession = {
      id: session.id,
      username: session.username,
      nombre: session.nombre,
      email: session.email,
      rol: session.rol,
      permisos: session.permisos,
      accesoTotal: session.accesoTotal,
      fechaIngreso: session.fechaIngreso,
    };
    localStorage.setItem(USER_SESSION_STORAGE_KEY, JSON.stringify(minimalSession));
  } catch (error) {
    console.error('Error saving user session:', error);
  }
}

export function clearUserSession(): void {
  try {
    localStorage.removeItem(USER_SESSION_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing user session:', error);
  }
}

// ==================== MASTER COLLECTION CLEARING (STRICT SUPABASE) ====================
export async function clearCollectionInCloudAndLocal(
  target: 'flota' | 'empleados' | 'expendio' | 'vales' | 'partesDiarios' | 'gastosMantenimiento' | 'obras' | 'depositos' | 'all'
): Promise<{ success: boolean; cleared: string[]; error?: string }> {
  const cleared: string[] = [];
  const errors: string[] = [];

  const runClear = async (endpoint: string, label: string) => {
    const res = await apiClearCollectionStrict(endpoint);
    if (res.ok) {
      cleared.push(label);
    } else {
      errors.push(`${label}: ${res.error || 'Error en Supabase'}`);
    }
  };

  if (target === 'flota' || target === 'all') {
    await runClear('vehicles', 'Flota Vehicular');
  }
  if (target === 'empleados' || target === 'all') {
    await runClear('drivers', 'Nómina de Empleados');
  }
  if (target === 'expendio' || target === 'all') {
    await runClear('fuel_vouchers', 'Expendio de Combustible');
  }
  if (target === 'vales' || target === 'all') {
    await runClear('issued_vouchers', 'Vales de Combustible');
  }
  if (target === 'partesDiarios' || target === 'all') {
    await runClear('partes_diarios', 'Partes Diarios');
  }
  if (target === 'gastosMantenimiento' || target === 'all') {
    await runClear('vehicle_expenses', 'Gastos de Mantenimiento');
  }
  if (target === 'obras' || target === 'all') {
    await runClear('obras', 'Obras');
  }
  if (target === 'depositos' || target === 'all') {
    await runClear('fuel_deposits', 'Depósitos de Combustible');
  }
  if (target === 'all') {
    await runClear('rentals', 'Contratos de Alquiler');
    await runClear('hardware', 'Ferretería');
    await runClear('aridos', 'Áridos');
    const soilRes = await apiSaveSettingStrict('soil_services', []);
    if (soilRes.ok) {
      cleared.push('Movimiento de Suelos');
    } else {
      errors.push(`Movimiento de Suelos: ${soilRes.error || 'Error en Supabase'}`);
    }
  }

  return {
    success: errors.length === 0,
    cleared,
    error: errors.length > 0 ? errors.join(' | ') : undefined,
  };
}

// ==================== CONTROL DE DEPÓSITOS & INSUMOS (PAÑOL) ====================
export function loadStockWarehouses(): StockWarehouse[] {
  return [];
}

export function saveStockWarehouses(warehouses: StockWarehouse[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_stock_warehouses_updated', { detail: warehouses }));
  }
  apiSaveItemsStrict('stock_warehouses', warehouses).catch(err => {
    console.warn('[StockWarehouses] Error sincronizando a Supabase:', err);
  });
}

export async function syncStockWarehousesFromCloud(): Promise<StockWarehouse[] | null> {
  try {
    const cloud = await apiFetchCollection<StockWarehouse>('stock_warehouses');
    if (cloud && Array.isArray(cloud)) {
      return cloud;
    }
  } catch (err) {
    console.warn('[StockWarehouses] Error descargando desde Supabase:', err);
  }
  return null;
}

export function loadStockCategories(): StockCategoryCustom[] {
  return [];
}

export function saveStockCategories(categories: StockCategoryCustom[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_stock_categories_updated', { detail: categories }));
  }
  apiSaveItemsStrict('stock_categories', categories).catch(err => {
    console.warn('[StockCategories] Error sincronizando a Supabase:', err);
  });
}

export async function syncStockCategoriesFromCloud(): Promise<StockCategoryCustom[] | null> {
  try {
    const cloud = await apiFetchCollection<StockCategoryCustom>('stock_categories');
    if (cloud && Array.isArray(cloud)) {
      return cloud;
    }
  } catch (err) {
    console.warn('[StockCategories] Error descargando desde Supabase:', err);
  }
  return null;
}

export function loadStockItems(): StockItem[] {
  return [];
}

export function saveStockItems(items: StockItem[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_stock_items_updated', { detail: items }));
  }
  apiSaveItemsStrict('stock_items', items).catch(err => {
    console.warn('[StockItems] Error sincronizando a Supabase:', err);
  });
}

export async function syncStockItemsFromCloud(): Promise<StockItem[] | null> {
  try {
    const cloud = await apiFetchCollection<StockItem>('stock_items');
    if (cloud && Array.isArray(cloud)) {
      return cloud;
    }
  } catch (err) {
    console.warn('[StockItems] Error descargando desde Supabase:', err);
  }
  return null;
}

export function loadStockMovements(): StockMovement[] {
  return [];
}

export function saveStockMovements(movements: StockMovement[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_stock_movements_updated', { detail: movements }));
  }
  apiSaveItemsStrict('stock_movements', movements).catch(err => {
    console.warn('[StockMovements] Error sincronizando a Supabase:', err);
  });
}

export async function syncStockMovementsFromCloud(): Promise<StockMovement[] | null> {
  try {
    const cloud = await apiFetchCollection<StockMovement>('stock_movements');
    if (cloud && Array.isArray(cloud)) {
      return cloud;
    }
  } catch (err) {
    console.warn('[StockMovements] Error descargando desde Supabase:', err);
  }
  return null;
}

export function exportStockToCSV(items: StockItem[]): void {
  const headers = [
    'ID',
    'CÓDIGO',
    'NOMBRE_PRODUCTO',
    'CATEGORÍA',
    'MARCA',
    'DESCRIPCIÓN',
    'UNIDAD',
    'STOCK_ACTUAL',
    'STOCK_MÍNIMO_ALERTA',
    'PRECIO_COSTO_UNITARIO',
    'UBICACIÓN_PAÑOL',
    'FECHA_ÚLTIMO_INGRESO',
    'OBSERVACIONES'
  ];

  const rows = items.map(item => [
    `"${item.id || ''}"`,
    `"${(item.codigo || '').replace(/"/g, '""')}"`,
    `"${(item.nombre || '').replace(/"/g, '""')}"`,
    `"${(item.categoria || '').replace(/"/g, '""')}"`,
    `"${(item.marca || '').replace(/"/g, '""')}"`,
    `"${(item.descripcion || '').replace(/"/g, '""')}"`,
    `"${(item.unidad || '').replace(/"/g, '""')}"`,
    item.stockActual ?? 0,
    item.stockMinimoAlerta ?? 0,
    item.precioCostoUnitario ?? 0,
    `"${(item.ubicacionPañol || '').replace(/"/g, '""')}"`,
    `"${(item.fechaUltimoIngreso || '').replace(/"/g, '""')}"`,
    `"${(item.observaciones || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_stock_inventario_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportStockMovementsToCSV(movements: StockMovement[]): void {
  const headers = [
    'ID',
    'STOCK_ITEM_ID',
    'INSUMO_PRODUCTO',
    'TIPO_MOVIMIENTO',
    'CANTIDAD',
    'UNIDAD',
    'STOCK_ANTERIOR',
    'STOCK_POSTERIOR',
    'FECHA',
    'HORA',
    'EQUIPO_VEHICULO',
    'RESPONSABLE_PAÑOL',
    'RECIBE_EMPLEADO',
    'LEGAJO_RECIBE',
    'MOTIVO_CONCEPTO',
    'COMPROBANTE',
    'OBSERVACIONES'
  ];

  const rows = movements.map(m => [
    `"${m.id || ''}"`,
    `"${m.stockItemId || ''}"`,
    `"${(m.stockItemNombre || '').replace(/"/g, '""')}"`,
    `"${(m.tipo || '').replace(/"/g, '""')}"`,
    m.cantidad ?? 0,
    `"${(m.unidad || '').replace(/"/g, '""')}"`,
    m.stockAnterior ?? 0,
    m.stockPosterior ?? 0,
    `"${(m.fecha || '').replace(/"/g, '""')}"`,
    `"${(m.hora || '').replace(/"/g, '""')}"`,
    `"${(m.equipoCodigoOrPatente || '').replace(/"/g, '""')}"`,
    `"${(m.responsableEntrega || '').replace(/"/g, '""')}"`,
    `"${(m.recibeEmpleadoNombre || '').replace(/"/g, '""')}"`,
    `"${(m.recibeEmpleadoLegajo || '').replace(/"/g, '""')}"`,
    `"${(m.motivoConcepto || '').replace(/"/g, '""')}"`,
    `"${(m.comprobanteProveedor || '').replace(/"/g, '""')}"`,
    `"${(m.observaciones || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_stock_kardex_movimientos_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportClothingDeliveriesToCSV(movements: StockMovement[]): void {
  const headers = [
    'FECHA',
    'HORA',
    'EMPLEADO_RECEPTOR',
    'LEGAJO',
    'DNI',
    'SECTOR',
    'PRENDA_EPP',
    'TALLE',
    'CANTIDAD',
    'UNIDAD',
    'MOTIVO_ENTREGA',
    'DEVUELVE_ANTERIOR',
    'RESPONSABLE_ENTREGA',
    'DEPOSITO',
    'OBSERVACIONES'
  ];

  const rows = movements.map(m => [
    `"${(m.fecha || '').replace(/"/g, '""')}"`,
    `"${(m.hora || '').replace(/"/g, '""')}"`,
    `"${(m.recibeEmpleadoNombre || '').replace(/"/g, '""')}"`,
    `"${(m.recibeEmpleadoLegajo || '').replace(/"/g, '""')}"`,
    `"${(m.recibeEmpleadoDni || '').replace(/"/g, '""')}"`,
    `"${(m.recibeEmpleadoSector || '').replace(/"/g, '""')}"`,
    `"${(m.stockItemNombre || '').replace(/"/g, '""')}"`,
    `"${(m.talle || '').replace(/"/g, '""')}"`,
    m.cantidad ?? 0,
    `"${(m.unidad || '').replace(/"/g, '""')}"`,
    `"${(m.motivoEntrega || m.motivoConcepto || '').replace(/"/g, '""')}"`,
    `"${m.devuelveAnterior ? 'SI' : 'NO'}"`,
    `"${(m.responsableEntrega || '').replace(/"/g, '""')}"`,
    `"${(m.depositoNombre || 'Depósito Indumentaria').replace(/"/g, '""')}"`,
    `"${(m.observaciones || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_entregas_indumentaria_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== SERVICES & GASTOS DIRECTOS POR EQUIPO ====================
export function loadVehicleServices(): VehicleServiceLog[] {
  return [];
}

export function saveVehicleServices(services: VehicleServiceLog[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_vehicle_services_updated', { detail: services }));
  }
  apiSaveItemsStrict('vehicle_services', services).catch(err => {
    console.warn('[VehicleServices] Error sincronizando a Supabase:', err);
  });
}

export async function syncVehicleServicesFromCloud(): Promise<VehicleServiceLog[] | null> {
  try {
    const cloud = await apiFetchCollection<VehicleServiceLog>('vehicle_services');
    if (cloud && Array.isArray(cloud)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_vehicle_services_updated', { detail: cloud }));
      }
      return cloud;
    }
  } catch (err) {
    console.warn('[VehicleServices] Error descargando desde Supabase:', err);
  }
  return null;
}

export function loadVehicleExpenses(): VehicleExpenseLog[] {
  return [];
}

export function saveVehicleExpenses(expenses: VehicleExpenseLog[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_vehicle_expenses_updated', { detail: expenses }));
  }
  apiSaveItemsStrict('vehicle_expenses', expenses).catch(err => {
    console.warn('[VehicleExpenses] Error sincronizando a Supabase:', err);
  });
}

export async function syncVehicleExpensesFromCloud(): Promise<VehicleExpenseLog[] | null> {
  try {
    const cloud = await apiFetchCollection<VehicleExpenseLog>('vehicle_expenses');
    if (cloud && Array.isArray(cloud)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_vehicle_expenses_updated', { detail: cloud }));
      }
      return cloud;
    }
  } catch (err) {
    console.warn('[VehicleExpenses] Error descargando desde Supabase:', err);
  }
  return null;
}

export function exportServicesToCSV(services: VehicleServiceLog[]): void {
  const headers = [
    'ID',
    'EQUIPO_MAQUINARIA',
    'FECHA',
    'HOROMETRO_ODOMETRO',
    'TIPO_SERVICE',
    'MECANICO_RESPONSABLE',
    'LUGAR_TALLER',
    'TRABAJOS_REALIZADOS',
    'FILTRO_ACEITE_CAMBIADO',
    'FILTRO_COMBUSTIBLE_CAMBIADO',
    'FILTRO_AIRE_CAMBIADO',
    'FILTRO_HIDRAULICO_CAMBIADO',
    'ACEITE_MOTOR_CAMBIADO',
    'ACEITE_HIDRAULICO_CAMBIADO',
    'COSTO_MANO_OBRA',
    'COSTO_INSUMOS',
    'COSTO_TOTAL_SERVICE',
    'COMPROBANTE_FACTURA',
    'PROVEEDOR',
    'OBSERVACIONES'
  ];

  const rows = services.map(s => [
    `"${s.id || ''}"`,
    `"${(s.equipoModeloMarca || '').replace(/"/g, '""')}"`,
    `"${s.fecha || ''}"`,
    s.horometroOdometro ?? 0,
    `"${(s.tipoService || '').replace(/"/g, '""')}"`,
    `"${(s.mecanicoResponsable || '').replace(/"/g, '""')}"`,
    `"${(s.tallerLugar || '').replace(/"/g, '""')}"`,
    `"${(s.trabajosRealizados || '').replace(/"/g, '""')}"`,
    s.filtroAceiteCambiado ? 'SÍ' : 'NO',
    s.filtroCombustibleCambiado ? 'SÍ' : 'NO',
    s.filtroAireCambiado ? 'SÍ' : 'NO',
    s.filtroHidraulicoCambiado ? 'SÍ' : 'NO',
    s.aceiteMotorCambiado ? 'SÍ' : 'NO',
    s.aceiteHidraulicoCambiado ? 'SÍ' : 'NO',
    s.costoManoObra ?? 0,
    s.costoInsumos ?? 0,
    s.costoTotalService ?? 0,
    `"${(s.comprobanteFacturaNum || '').replace(/"/g, '""')}"`,
    `"${(s.proveedor || '').replace(/"/g, '""')}"`,
    `"${(s.observaciones || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_mantenimientos_services_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportExpensesToCSV(expenses: VehicleExpenseLog[]): void {
  const headers = [
    'ID',
    'EQUIPO_MAQUINARIA',
    'FECHA',
    'Nº_COMPROBANTE',
    'PROVEEDOR',
    'CATEGORÍA',
    'CONCEPTO',
    'MONTO_TOTAL',
    'SERVICE_VINCULADO',
    'OBSERVACIONES'
  ];

  const rows = expenses.map(e => [
    `"${e.id || ''}"`,
    `"${(e.equipoModeloMarca || '').replace(/"/g, '""')}"`,
    `"${e.fecha || ''}"`,
    `"${(e.numeroComprobante || '').replace(/"/g, '""')}"`,
    `"${(e.proveedor || '').replace(/"/g, '""')}"`,
    `"${(e.categoria || '').replace(/"/g, '""')}"`,
    `"${(e.concepto || '').replace(/"/g, '""')}"`,
    e.montoTotal ?? 0,
    `"${(e.vinculadoAServiceId || '').replace(/"/g, '""')}"`,
    `"${(e.observaciones || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_facturas_gastos_equipos_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportFinesToCSV(fines: VehicleExpenseLog[]): void {
  const headers = [
    'ID',
    'FECHA_INFRACCION',
    'VENCIMIENTO',
    'CAMION_EQUIPO',
    'PATENTE_CODIGO',
    'ACTA_NRO',
    'ORGANISMO',
    'TIPO_INFRACCION',
    'DETALLE',
    'LUGAR_RUTA',
    'CHOFER',
    'ESTADO',
    'FECHA_PAGO',
    'MONTO_IMPUTADO',
    'OBSERVACIONES'
  ];

  const rows = fines.map(e => [
    `"${e.id || ''}"`,
    `"${e.fecha || ''}"`,
    `"${e.multaFechaVencimiento || ''}"`,
    `"${(e.equipoModeloMarca || '').replace(/"/g, '""')}"`,
    `"${(e.equipoPatenteOrCodigo || '').replace(/"/g, '""')}"`,
    `"${(e.multaActaNumero || e.numeroComprobante || '').replace(/"/g, '""')}"`,
    `"${(e.multaOrganismo || e.proveedor || '').replace(/"/g, '""')}"`,
    `"${(e.multaTipoInfraccion || '').replace(/"/g, '""')}"`,
    `"${(e.concepto || '').replace(/"/g, '""')}"`,
    `"${(e.multaLugar || '').replace(/"/g, '""')}"`,
    `"${(e.multaChoferNombre || e.responsableNombre || '').replace(/"/g, '""')}"`,
    `"${(e.multaEstadoPago || 'PENDIENTE').replace(/"/g, '""')}"`,
    `"${e.multaFechaPago || ''}"`,
    e.montoTotal ?? 0,
    `"${(e.observaciones || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_multas_flota_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== ARCA (EX-AFIP) FACTURACIÓN ====================
export function loadArcaInvoices(): ArcaInvoice[] {
  return [];
}

export function saveArcaInvoices(invoices: ArcaInvoice[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_arca_invoices_updated', { detail: invoices }));
  }
  apiSaveItemsStrict('arca_invoices', invoices).catch(err => {
    console.warn('[ArcaInvoices] Error sincronizando a Supabase:', err);
  });
}

export function loadArcaConfig(): ArcaConfig {
  if (memoryArcaConfigCache) {
    return memoryArcaConfigCache;
  }
  return {
    cuit: '30-71499982-2',
    razonSocial: 'El hornocal SRL',
    puntoVenta: 7,
    puntoVentaRemito: 8,
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    modoProduccion: true
  };
}

export function saveArcaConfig(config: ArcaConfig): void {
  memoryArcaConfigCache = { ...config };
  apiSaveSettingStrict('arca_config', config).catch(err => {
    console.warn('[ArcaConfig] Error guardando en Supabase:', err);
  });
}

export async function syncArcaConfigFromCloud(): Promise<ArcaConfig | null> {
  try {
    const cloud = await apiFetchSetting<ArcaConfig>('arca_config');
    if (cloud && typeof cloud === 'object') {
      const merged: ArcaConfig = {
        ...cloud,
        puntoVenta: cloud.puntoVenta || 7,
        puntoVentaRemito: cloud.puntoVentaRemito || 8,
      };
      memoryArcaConfigCache = merged;
      return merged;
    }
  } catch (err) {
    console.warn('[ArcaConfig] Error descargando config ARCA desde Supabase:', err);
  }
  return null;
}

export function loadInvoiceTemplateLayout(): InvoiceTemplateLayout {
  return memoryInvoiceLayoutCache || DEFAULT_INVOICE_TEMPLATE_LAYOUT;
}

export function saveInvoiceTemplateLayout(layout: InvoiceTemplateLayout): void {
  memoryInvoiceLayoutCache = { ...DEFAULT_INVOICE_TEMPLATE_LAYOUT, ...layout };
  apiSaveSettingStrict('invoice_template_layout', memoryInvoiceLayoutCache).catch(err => {
    console.warn('[InvoiceLayout] Error guardando en Supabase:', err);
  });
}

export async function syncInvoiceTemplateLayoutFromCloud(): Promise<InvoiceTemplateLayout | null> {
  try {
    const cloud = await apiFetchSetting<InvoiceTemplateLayout>('invoice_template_layout');
    if (cloud && typeof cloud === 'object') {
      const merged = { ...DEFAULT_INVOICE_TEMPLATE_LAYOUT, ...cloud };
      memoryInvoiceLayoutCache = merged;
      return merged;
    }
  } catch (err) {
    console.warn('[InvoiceLayout] Error descargando layout desde Supabase:', err);
  }
  return null;
}

export function exportArcaInvoicesToCSV(invoices: ArcaInvoice[]): void {
  const headers = [
    'ID', 'TIPO', 'PUNTO_VENTA', 'NRO_COMPROBANTE', 'FECHA',
    'CUIT_EMISOR', 'RECEPTOR', 'NETO_GRAVADO', 'IVA_TOTAL',
    'IMPORTE_TOTAL', 'CAE', 'VTO_CAE', 'RESULTADO'
  ];
  const rows = invoices.map(inv => [
    `"${inv.id}"`,
    `"${inv.tipoComprobante}"`,
    inv.puntoVenta,
    inv.numeroComprobante,
    `"${inv.fecha}"`,
    `"${inv.cuitEmisor}"`,
    `"${(inv.razonSocialReceptor || '').replace(/"/g, '""')}"`,
    inv.netoGravado,
    inv.ivaTotal,
    inv.importeTotal,
    `"${inv.cae}"`,
    `"${inv.vencimientoCae}"`,
    `"${inv.resultado}"`
  ]);
  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_facturas_arca_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== COTIZADOR & PRESUPUESTOS ====================
export function loadQuotations(): Quotation[] {
  return [];
}

export function saveQuotations(quotations: Quotation[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_quotations_updated', { detail: quotations }));
  }
  apiSaveItemsStrict('quotations', quotations).catch(err => {
    console.warn('[Quotations] Error sincronizando a Supabase:', err);
  });
}

export async function syncQuotationsFromCloud(): Promise<Quotation[] | null> {
  try {
    const cloud = await apiFetchCollection<Quotation>('quotations');
    if (cloud && Array.isArray(cloud)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_quotations_updated', { detail: cloud }));
      }
      return cloud;
    }
  } catch (err) {
    console.warn('[Quotations] Error descargando cotizaciones desde Supabase:', err);
  }
  return null;
}

export function loadQuotationTemplateLayout(): QuotationTemplateLayout {
  return memoryQuotationLayoutCache || DEFAULT_QUOTATION_TEMPLATE_LAYOUT;
}

export function saveQuotationTemplateLayout(layout: QuotationTemplateLayout): void {
  memoryQuotationLayoutCache = { ...DEFAULT_QUOTATION_TEMPLATE_LAYOUT, ...layout };
  apiSaveSettingStrict('quotation_template_layout', memoryQuotationLayoutCache).catch(err => {
    console.warn('[QuotationLayout] Error guardando en Supabase:', err);
  });
}

export async function syncQuotationTemplateLayoutFromCloud(): Promise<QuotationTemplateLayout | null> {
  try {
    const cloud = await apiFetchSetting<QuotationTemplateLayout>('quotation_template_layout');
    if (cloud && typeof cloud === 'object') {
      const merged = { ...DEFAULT_QUOTATION_TEMPLATE_LAYOUT, ...cloud };
      memoryQuotationLayoutCache = merged;
      return merged;
    }
  } catch (err) {
    console.warn('[QuotationLayout] Error descargando layout de cotización desde Supabase:', err);
  }
  return null;
}

export function exportQuotationsToCSV(quotations: Quotation[]): void {
  const headers = [
    'ID', 'PUNTO_VENTA', 'NRO_COMPROBANTE', 'FECHA_EMISION', 'VALIDO_HASTA',
    'RAZON_SOCIAL', 'CUIT', 'DOMICILIO', 'LOCALIDAD', 'TELEFONO',
    'CONDICION_VENTA', 'MONEDA', 'VENDEDOR', 'SUBTOTAL_PEDIDO', 'BONIFICACION',
    'SUBTOTAL_NETO', 'PERCEPCION_IIBB', 'IVA', 'IMPORTE_TOTAL', 'ESTADO'
  ];
  const rows = quotations.map(q => [
    `"${q.id}"`,
    q.puntoVenta,
    q.numeroComprobante,
    `"${q.fechaEmision}"`,
    `"${q.validoHasta || ''}"`,
    `"${(q.razonSocialReceptor || '').replace(/"/g, '""')}"`,
    `"${q.cuitReceptor || ''}"`,
    `"${(q.domicilioReceptor || '').replace(/"/g, '""')}"`,
    `"${(q.localidadReceptor || '').replace(/"/g, '""')}"`,
    `"${q.telefonoReceptor || ''}"`,
    `"${q.condicionVenta || ''}"`,
    `"${q.monedaExpresada || ''}"`,
    `"${q.nombreVendedor || ''}"`,
    q.subtotalPedido,
    q.bonificacionTotal,
    q.subtotalNeto,
    q.percepcionIibb,
    q.ivaTotal,
    q.importeTotal,
    `"${q.estado}"`
  ]);
  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_cotizaciones_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== CAJA DIARIA ====================
export function loadCajaDiariaSessions(): CajaDiariaSession[] {
  return [];
}

export function saveCajaDiariaSessions(sessions: CajaDiariaSession[]): void {
  apiSaveItemsStrict('caja_diaria', sessions).catch(err => {
    console.warn('[CajaDiaria] Error sincronizando a Supabase:', err);
  });
}

export function exportCajaDiariaToCSV(session: CajaDiariaSession): void {
  const headers = [
    'FECHA', 'TIPO_MOVIMIENTO', 'COMPROBANTE', 'CONCEPTO', 'CATEGORIA',
    'EFECTIVO', 'TARJETA_TRANSF', 'CUENTA_CORRIENTE', 'ARIDOS', 'GASTO', 'TOTAL', 'FORMA_PAGO_DETALLE', 'PROVEEDOR_CLIENTE'
  ];
  const rows = session.entradas.map(it => [
    `"${it.fecha}"`,
    `"${it.tipoMovimiento}"`,
    `"${(it.comprobante || '').replace(/"/g, '""')}"`,
    `"${(it.concepto || '').replace(/"/g, '""')}"`,
    `"${it.categoria}"`,
    it.montoEfectivo || 0,
    it.montoTarjetaTransf || 0,
    it.montoCtaCte || 0,
    it.montoAridos || 0,
    it.montoGasto || 0,
    it.montoTotal || 0,
    `"${(it.formaPagoDetalle || '').replace(/"/g, '""')}"`,
    `"${(it.proveedorCliente || '').replace(/"/g, '""')}"`
  ]);
  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `la_hormiga_caja_diaria_${session.fecha}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== PROVEEDORES & FACTURAS DE COMPRA ====================
export function loadProveedores(): Proveedor[] {
  return [];
}

export function saveProveedores(provs: Proveedor[]): void {
  apiSaveItemsStrict('proveedores', provs).catch(err => {
    console.warn('[Proveedores] Error sincronizando a Supabase:', err);
  });
}

export async function syncProveedoresFromCloud(): Promise<Proveedor[] | null> {
  try {
    const cloud = await apiFetchCollection<Proveedor>('proveedores');
    if (cloud && Array.isArray(cloud)) {
      return cloud;
    }
  } catch (err) {
    console.warn('[Proveedores] Error descargando proveedores desde Supabase:', err);
  }
  return null;
}

export function loadPurchaseInvoices(): PurchaseInvoice[] {
  return [];
}

export function savePurchaseInvoices(invoices: PurchaseInvoice[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_purchase_invoices_updated', { detail: invoices }));
  }
  apiSaveItemsStrict('purchase_invoices', invoices).catch(err => {
    console.warn('[PurchaseInvoices] Error sincronizando facturas en Supabase:', err);
  });
}

export async function syncPurchaseInvoicesFromCloud(): Promise<PurchaseInvoice[] | null> {
  try {
    const cloud = await apiFetchCollection<PurchaseInvoice>('purchase_invoices');
    if (cloud && Array.isArray(cloud)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_purchase_invoices_updated', { detail: cloud }));
      }
      return cloud;
    }
  } catch (err) {
    console.warn('[PurchaseInvoices] Error descargando facturas desde Supabase:', err);
  }
  return null;
}

export function loadSupplierPayments(): SupplierPayment[] {
  return [];
}

export function saveSupplierPayments(payments: SupplierPayment[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('la_hormiga_supplier_payments_updated', { detail: payments }));
  }
  apiSaveItemsStrict('supplier_payments', payments).catch(err => {
    console.warn('[SupplierPayments] Error sincronizando pagos en Supabase:', err);
  });
}

export async function syncSupplierPaymentsFromCloud(): Promise<SupplierPayment[] | null> {
  try {
    const cloud = await apiFetchCollection<SupplierPayment>('supplier_payments');
    if (cloud && Array.isArray(cloud)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('la_hormiga_supplier_payments_updated', { detail: cloud }));
      }
      return cloud;
    }
  } catch (err) {
    console.warn('[SupplierPayments] Error descargando pagos desde Supabase:', err);
  }
  return null;
}
