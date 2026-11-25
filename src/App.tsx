import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { 
  Vehicle, 
  TableColumnKey, 
  VehicleStatus, 
  Employee, 
  DriverStatus, 
  FuelDispensary, 
  FuelVoucherStatus,
  FuelDeposit,
  FuelDepositStatus,
  FuelDepositStockAdjustment,
  IssuedFuelVoucher,
  FuelContainer,
  TableColumnConfig,
  Obra,
  ObraFacturaLegajo,
  ObraFacturaOrigen,
  ObraLegajoAdjunto,
  ParteDiario,
  TruckPerformanceTrip,
  PreselectedResumenForArca,
  RentalContract,
  HardwareProduct,
  AridoProduct,
  SoilService,
  UserSession,
  SupabaseRegistro,
  SupabaseUsuario,
  SupabaseLicencia,
  SupabaseSector,
  SupabaseEmpresa,
  SupabaseCategoria,
  StockItem,
  StockMovement,
  StockCategoryCustom,
  StockWarehouse,
  StockBatch,
  StockUnit,
  VehicleServiceLog,
  VehicleExpenseLog,
  ExpenseCategory,
  ArcaInvoice,
  Quotation,
  CajaDiariaSession,
  Proveedor,
  PurchaseInvoice,
  SupplierPayment,
  SystemUser,
  CustomerPaymentReceipt,
  DispatchBoardState,
  DocumentBagItem,
  DocumentBagCategory,
  DocumentBagLinkTargetType,
  ArcaRemito,
  AccountingAccount,
  AccountingEntry,
  ClientRecord,
  ChequeCarteraItem,
  CommercialModuleScope
} from './types';
import { 
  fetchSupabaseRegistros, 
  fetchSupabaseUsuarios, 
  fetchSupabaseLicencias, 
  fetchSupabaseSectores, 
  fetchSupabaseEmpresas, 
  fetchSupabaseCategorias, 
  convertSupabaseUsersToEmployees,
  syncLocalEmployeesToSupabase,
  createSupabaseUsuario,
  updateSupabaseUsuario,
  deleteSupabaseUsuario
} from './services/supabase';
import { 
  syncDriversFromCloud, 
  saveFuelPrice,
  loadFleetColumnConfig, 
  saveFleetColumnConfig, 
  syncAllColumnConfigsFromCloud,
  syncArcaConfigFromCloud,
  syncInvoiceTemplateLayoutFromCloud,
  syncQuotationTemplateLayoutFromCloud,
  exportFleetToCSV, 
  exportDriversToCSV, 
  exportFuelVouchersToCSV, 
  exportFuelDepositsToCSV,
  exportIssuedVouchersToCSV,
  exportObrasToCSV,
  exportPartesDiariosToCSV,
  syncRentalsFromCloud,
  syncHardwareFromCloud,
  syncAridosFromCloud,
  syncSoilServicesFromCloud,
  syncFuelPricesFromCloud,
  SOIL_SERVICES_CHANGE_EVENT,
  loadUserSession,
  saveUserSession,
  clearUserSession,
  assignFuelsToStation,
  loadArcaConfig,
  clearCollectionInCloudAndLocal,
} from './services/storage';
import { syncSiteSettingsFromCloud, syncSystemUsersFromCloud } from './services/siteConfig';
import {
  calculatePricesFromCost,
  deriveLegacyCategory,
  generateNextBaseProductCode,
  loadSalonConfigLocal,
  resolveQuotationModule,
} from './services/salonConfig';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { QuickStatsBanner } from './components/QuickStatsBanner';
import { buildUnifiedObrasList } from './utils/obraLegajoResolver';
import { buildChequeEndosoEntry, buildChequeRechazoEntry } from './utils/planDeCuentas';
import { createInitialDispatchBoardState } from './utils/dispatchBoardInit';
import {
  fetchOperationalSheetConfigFromDb,
  OperationalSheetConfig,
} from './services/googleSheetsAuth';
import type { StockAdjustmentDetails } from './components/FuelDepositRefillModal';
import type { SheetSyncEntity } from './components/GoogleSheetConnectorModal';
import {
  CONFIG_WEB_VIEW_TO_TAB,
  getDefaultViewForUser,
  hasViewAccess
} from './services/permissions';

import type { EntityType } from './services/importExportService';
import {
  apiFetchCollection,
  apiSaveItemsStrict,
  apiDeleteItemStrict,
  apiSyncCollectionStrict,
  apiClearCollectionStrict,
  apiSyncSupabaseStrict,
  apiFetchSetting,
  apiSaveSettingStrict,
  apiAnalyzeDocumentWithAI,
} from './services/api';
import { reconcileDepositStocks } from './utils/fuelStockReconciliation';
import { resolveArcaInvoiceLinks, formatInvoiceNumber } from './utils/crossLinks';
import { Logo } from './components/Logo';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { Check, Plus, Wrench, AlertCircle, Lock } from 'lucide-react';

const CHUNK_RELOAD_STORAGE_KEY = 'lh_chunk_reload_ts';

function isDynamicImportError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk')
  );
}

function tryGuardedReloadForChunkError(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) || 0);
    const now = Date.now();
    if (!last || now - last > 15000) {
      window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
      window.location.reload();
      return true;
    }
  } catch {
    // Ignore storage access restrictions
  }
  return false;
}

function lazyNamed<T extends React.ComponentType<any>>(
  factory: () => Promise<Record<string, any>>,
  exportName: string
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    const retryDelays = [350, 900];
    let lastError: unknown;
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        const mod = await factory();
        return { default: mod[exportName] as T };
      } catch (err) {
        lastError = err;
        if (!isDynamicImportError(err) || attempt === retryDelays.length) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      }
    }
    if (isDynamicImportError(lastError) && tryGuardedReloadForChunkError()) {
      // Keep Suspense fallback mounted while the browser reloads cleanly
      return new Promise<never>(() => {});
    }
    throw lastError;
  });
}

const AttendanceSection = lazyNamed(() => import('./components/AttendanceSection'), 'AttendanceSection');
const ComprasSection = lazyNamed(() => import('./components/Compras/ComprasSection'), 'ComprasSection');
const StockInventorySection = lazyNamed(() => import('./components/StockInventorySection'), 'StockInventorySection');
const ServicesMaintenanceSection = lazyNamed(() => import('./components/ServicesMaintenanceSection'), 'ServicesMaintenanceSection');
const ArcaBillingSection = lazyNamed(() => import('./components/ArcaBillingSection'), 'ArcaBillingSection');
const ClientesSection = lazyNamed(() => import('./components/ClientesSection'), 'ClientesSection');
const CobranzasSection = lazyNamed(() => import('./components/CobranzasSection'), 'CobranzasSection');
const CarteraChequesSection = lazyNamed(() => import('./components/CarteraChequesSection'), 'CarteraChequesSection');
const PlanDeCuentasSection = lazyNamed(() => import('./components/PlanDeCuentasSection'), 'PlanDeCuentasSection');
const QuotationSection = lazyNamed(() => import('./components/QuotationSection'), 'QuotationSection');
const CajaDiariaSection = lazyNamed(() => import('./components/CajaDiariaSection'), 'CajaDiariaSection');
const ObrasSection = lazyNamed(() => import('./components/ObrasSection'), 'ObrasSection');
const ObraFormModal = lazyNamed(() => import('./components/ObraFormModal'), 'ObraFormModal');
const ObraDetailModal = lazyNamed(() => import('./components/ObraDetailModal'), 'ObraDetailModal');
const PizarraDespachoSection = lazyNamed(() => import('./components/PizarraDespachoSection'), 'PizarraDespachoSection');
const DailyScheduleAudioSection = lazyNamed(() => import('./components/DailyScheduleAudioSection'), 'DailyScheduleAudioSection');
const BolsaDocumentosSection = lazyNamed(() => import('./components/BolsaDocumentosSection'), 'BolsaDocumentosSection');
const AiInvoiceRemitoReviewModal = lazyNamed(() => import('./components/AiInvoiceRemitoReviewModal'), 'AiInvoiceRemitoReviewModal');
const VehicleTable = lazyNamed(() => import('./components/VehicleTable'), 'VehicleTable');
const VehicleFormModal = lazyNamed(() => import('./components/VehicleFormModal'), 'VehicleFormModal');
const VehicleDetailModal = lazyNamed(() => import('./components/VehicleDetailModal'), 'VehicleDetailModal');
const DriverSection = lazyNamed(() => import('./components/DriverSection'), 'DriverSection');
const DriverFormModal = lazyNamed(() => import('./components/DriverFormModal'), 'DriverFormModal');
const DriverDetailModal = lazyNamed(() => import('./components/DriverDetailModal'), 'DriverDetailModal');
const FuelDepositSection = lazyNamed(() => import('./components/FuelDepositSection'), 'FuelDepositSection');
const FuelDepositFormModal = lazyNamed(() => import('./components/FuelDepositFormModal'), 'FuelDepositFormModal');
const FuelDepositDetailModal = lazyNamed(() => import('./components/FuelDepositDetailModal'), 'FuelDepositDetailModal');
const FuelDepositRefillModal = lazyNamed(() => import('./components/FuelDepositRefillModal'), 'FuelDepositRefillModal');
const FuelVoucherSection = lazyNamed(() => import('./components/FuelVoucherSection'), 'FuelVoucherSection');
const FuelVoucherFormModal = lazyNamed(() => import('./components/FuelVoucherFormModal'), 'FuelVoucherFormModal');
const FuelVoucherDetailModal = lazyNamed(() => import('./components/FuelVoucherDetailModal'), 'FuelVoucherDetailModal');
const FuelContainersSection = lazyNamed(() => import('./components/FuelContainersSection'), 'FuelContainersSection');
const IssuedVouchersSection = lazyNamed(() => import('./components/IssuedVouchersSection'), 'IssuedVouchersSection');
const GoogleSheetConnectorModal = lazyNamed(() => import('./components/GoogleSheetConnectorModal'), 'GoogleSheetConnectorModal');
const IssuedVoucherFormModal = lazyNamed(() => import('./components/IssuedVoucherFormModal'), 'IssuedVoucherFormModal');
const IssuedVoucherDetailModal = lazyNamed(() => import('./components/IssuedVoucherDetailModal'), 'IssuedVoucherDetailModal');
const ColumnVisibilityModal = lazyNamed(() => import('./components/ColumnVisibilityModal'), 'ColumnVisibilityModal');
const PricingCalculatorModal = lazyNamed(() => import('./components/PricingCalculatorModal'), 'PricingCalculatorModal');
const DataImportExportModal = lazyNamed(() => import('./components/DataImportExportModal'), 'DataImportExportModal');
const VehicleFuelAnalyticsModal = lazyNamed(() => import('./components/VehicleFuelAnalyticsModal'), 'VehicleFuelAnalyticsModal');
const FuelCostsSection = lazyNamed(() => import('./components/FuelCostsSection'), 'FuelCostsSection');
const FuelTypesManagerSection = lazyNamed(() => import('./components/FuelTypesManagerSection'), 'FuelTypesManagerSection');
const RendimientosSection = lazyNamed(() => import('./components/RendimientosSection'), 'RendimientosSection');
const PartesDiariosSection = lazyNamed(() => import('./components/PartesDiariosSection'), 'PartesDiariosSection');
const ParteDiarioFormModal = lazyNamed(() => import('./components/ParteDiarioFormModal'), 'ParteDiarioFormModal');
const ParteDiarioDetailModal = lazyNamed(() => import('./components/ParteDiarioDetailModal'), 'ParteDiarioDetailModal');
const DriverAppPortal = lazyNamed(() => import('./components/DriverAppPortal'), 'DriverAppPortal');
const PublicWebsite = lazyNamed(() => import('./components/public/PublicWebsite'), 'PublicWebsite');
const RentalManagementSection = lazyNamed(() => import('./components/RentalManagement/RentalManagementSection'), 'RentalManagementSection');
const HardwareStoreSection = lazyNamed(() => import('./components/HardwareStore/HardwareStoreSection'), 'HardwareStoreSection');
const LoginModal = lazyNamed(() => import('./components/LoginModal'), 'LoginModal');
const ESP32TelemetryModal = lazyNamed(() => import('./components/telemetry/ESP32TelemetryModal'), 'ESP32TelemetryModal');
const SiteSettingsModal = lazyNamed(() => import('./components/SiteSettingsModal'), 'SiteSettingsModal');
const UsersPermissionsSection = lazyNamed(() => import('./components/UsersPermissionsSection'), 'UsersPermissionsSection');
const PayrollSheetsSection = lazyNamed(() => import('./components/PayrollSheetsSection'), 'PayrollSheetsSection');
const DatabaseStatusModal = lazyNamed(() => import('./components/DatabaseStatusModal'), 'DatabaseStatusModal');
const ClearRecordsModal = lazyNamed(() => import('./components/ClearRecordsModal'), 'ClearRecordsModal');

const ViewLoadingFallback: React.FC = () => (
  <div className="w-full min-h-[260px] flex items-center justify-center p-8">
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#16191F] border border-slate-800 text-xs font-semibold text-slate-300">
      <span className="w-3.5 h-3.5 rounded-full border-2 border-[#F0C800] border-t-transparent animate-spin" />
      <span>Cargando módulo...</span>
    </div>
  </div>
);

function getChangedItemsById<T extends { id?: string }>(prev: T[], next: T[]): T[] {
  if (prev.length === 0) return next;
  const prevMap = new Map<string, T>();
  for (let i = 0; i < prev.length; i++) {
    const id = prev[i]?.id;
    if (id) prevMap.set(id, prev[i]);
  }
  const changed: T[] = [];
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    const id = item?.id;
    if (!id) {
      changed.push(item);
      continue;
    }
    const existing = prevMap.get(id);
    if (!existing || (existing !== item && JSON.stringify(existing) !== JSON.stringify(item))) {
      changed.push(item);
    }
  }
  return changed;
}

export default function App() {
  // Data states (Supabase PostgreSQL es la única fuente de verdad)
  const [fleet, setFleet] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Employee[]>([]);
  const [fuelDeposits, setFuelDeposits] = useState<FuelDeposit[]>([]);
  const fuelDepositsRef = useRef<FuelDeposit[]>([]);
  useEffect(() => {
    fuelDepositsRef.current = fuelDeposits;
  }, [fuelDeposits]);
  const [fuelVouchers, setFuelVouchers] = useState<FuelDispensary[]>([]);
  const [issuedVouchers, setIssuedVouchers] = useState<IssuedFuelVoucher[]>([]);
  const [fleetColumnConfig, setFleetColumnConfig] = useState<TableColumnConfig<TableColumnKey>>(() => loadFleetColumnConfig());

  // Supabase live attendance and payroll state
  const [supabaseRegistros, setSupabaseRegistros] = useState<SupabaseRegistro[]>([]);
  const [supabaseUsuarios, setSupabaseUsuarios] = useState<SupabaseUsuario[]>([]);
  const [supabaseLicencias, setSupabaseLicencias] = useState<SupabaseLicencia[]>([]);
  const [supabaseSectores, setSupabaseSectores] = useState<SupabaseSector[]>([]);
  const [supabaseEmpresas, setSupabaseEmpresas] = useState<SupabaseEmpresa[]>([]);
  const [supabaseCategorias, setSupabaseCategorias] = useState<SupabaseCategoria[]>([]);
  const [isSupabaseLoading, setIsSupabaseLoading] = useState<boolean>(false);
  
  // Depósitos & Stock states
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [stockCategories, setStockCategories] = useState<StockCategoryCustom[]>([]);
  const [stockWarehouses, setStockWarehouses] = useState<StockWarehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('ALL');
  const [createWarehouseTrigger, setCreateWarehouseTrigger] = useState<number>(0);
  const seededIndumentariaWhRef = useRef(false);
  const seededIndumentariaCatsRef = useRef(false);
  const seededIndumentariaItemsRef = useRef(false);

  const ensureIndumentariaWarehouse = (warehouses: StockWarehouse[]): StockWarehouse[] => {
    const hasIndumentaria = warehouses.some(
      w => w.id === 'DEP-INDUMENTARIA' || w.tipo === 'INDUMENTARIA'
    );
    if (hasIndumentaria) return warehouses;
    const defaultIndWh: StockWarehouse = {
      id: 'DEP-INDUMENTARIA',
      codigo: 'DEP-04',
      nombre: 'Depósito Ropa e Indumentaria (EPP)',
      tipo: 'INDUMENTARIA',
      icono: '🦺',
      ubicacion: 'Pañol Central - Sector Personal',
      responsable: 'Encargado de Depósito',
      descripcion: 'Ropa de trabajo, calzado de seguridad y elementos de protección personal (EPP) para entregas al personal.',
      createdAt: new Date().toISOString(),
    };
    if (!seededIndumentariaWhRef.current) {
      seededIndumentariaWhRef.current = true;
      apiSaveItemsStrict('stock_warehouses', defaultIndWh).catch(err => {
        console.warn('[Indumentaria] Error persistiendo depósito automático:', err);
      });
    }
    return [...warehouses, defaultIndWh];
  };

  const ensureIndumentariaCategories = (categories: StockCategoryCustom[]): StockCategoryCustom[] => {
    const defaultCats: StockCategoryCustom[] = [
      { id: 'CAT-IND-ROPA', nombre: 'Ropa de Trabajo', icono: '👕', descripcion: 'Camisas, pantalones grafa, mamelucos, remeras y chombas', depositoId: 'DEP-INDUMENTARIA' },
      { id: 'CAT-IND-CALZADO', nombre: 'Calzado de Seguridad', icono: '🥾', descripcion: 'Botines con puntera, borcegos y botas de goma', depositoId: 'DEP-INDUMENTARIA' },
      { id: 'CAT-IND-EPP', nombre: 'Protección Personal (EPP)', icono: '🦺', descripcion: 'Cascos, guantes, gafas, chalecos reflectivos, arneses y protectores auditivos', depositoId: 'DEP-INDUMENTARIA' },
      { id: 'CAT-IND-ABRIGO', nombre: 'Abrigo e Impermeables', icono: '🧥', descripcion: 'Camperas térmicas, buzos, capas de lluvia y trajes impermeables', depositoId: 'DEP-INDUMENTARIA' },
    ];
    const existingNames = new Set(categories.map(c => c.nombre.trim().toLowerCase()));
    const missing = defaultCats.filter(dc => !existingNames.has(dc.nombre.trim().toLowerCase()) && !categories.some(c => c.id === dc.id));
    if (missing.length === 0) return categories;
    if (!seededIndumentariaCatsRef.current) {
      seededIndumentariaCatsRef.current = true;
      apiSaveItemsStrict('stock_categories', missing).catch(err => {
        console.warn('[Indumentaria] Error persistiendo categorías iniciales:', err);
      });
    }
    return [...categories, ...missing];
  };

  const ensureIndumentariaItems = (items: StockItem[]): StockItem[] => {
    const hasIndItems = items.some(it => (it.codigo || '').startsWith('IND-'));
    if (hasIndItems) return items;

    const rawNotesData: Array<{ nombre: string; categoria: string; talle: string; stock: number; unidad: 'UNIDAD' | 'PAR' }> = [
      // Note 1: Cintos Naranja
      { nombre: 'Cinto Naranja', categoria: 'Ropa de Trabajo', talle: '110', stock: 8, unidad: 'UNIDAD' },
      { nombre: 'Cinto Naranja', categoria: 'Ropa de Trabajo', talle: '100', stock: 24, unidad: 'UNIDAD' },
      { nombre: 'Cinto Naranja', categoria: 'Ropa de Trabajo', talle: '105', stock: 23, unidad: 'UNIDAD' },
      { nombre: 'Cinto Naranja', categoria: 'Ropa de Trabajo', talle: '95', stock: 13, unidad: 'UNIDAD' },
      { nombre: 'Cinto Naranja', categoria: 'Ropa de Trabajo', talle: '90', stock: 28, unidad: 'UNIDAD' },
      { nombre: 'Cinto Naranja', categoria: 'Ropa de Trabajo', talle: '80', stock: 5, unidad: 'UNIDAD' },
      { nombre: 'Cinto Naranja', categoria: 'Ropa de Trabajo', talle: '115', stock: 1, unidad: 'UNIDAD' },
      // Cinto Azul
      { nombre: 'Cinto Azul', categoria: 'Ropa de Trabajo', talle: '120', stock: 1, unidad: 'UNIDAD' },
      { nombre: 'Cinto Azul', categoria: 'Ropa de Trabajo', talle: '100', stock: 5, unidad: 'UNIDAD' },
      { nombre: 'Cinto Azul', categoria: 'Ropa de Trabajo', talle: '105', stock: 9, unidad: 'UNIDAD' },
      { nombre: 'Cinto Azul', categoria: 'Ropa de Trabajo', talle: '95', stock: 10, unidad: 'UNIDAD' },
      { nombre: 'Cinto Azul', categoria: 'Ropa de Trabajo', talle: '90', stock: 9, unidad: 'UNIDAD' },
      // Fajas
      { nombre: 'Faja Lumbar', categoria: 'Protección Personal (EPP)', talle: 'XXL', stock: 1, unidad: 'UNIDAD' },
      { nombre: 'Faja Lumbar', categoria: 'Protección Personal (EPP)', talle: 'XL', stock: 1, unidad: 'UNIDAD' },
      { nombre: 'Faja Lumbar', categoria: 'Protección Personal (EPP)', talle: 'L', stock: 1, unidad: 'UNIDAD' },
      { nombre: 'Faja Lumbar', categoria: 'Protección Personal (EPP)', talle: 'M', stock: 1, unidad: 'UNIDAD' },
      // Cascos S/A
      { nombre: 'Casco de Seguridad Amarillo', categoria: 'Protección Personal (EPP)', talle: 'Único', stock: 3, unidad: 'UNIDAD' },
      { nombre: 'Casco de Seguridad Rojo', categoria: 'Protección Personal (EPP)', talle: 'Único', stock: 1, unidad: 'UNIDAD' },

      // Note 2: La Hormiga
      { nombre: 'Camisa Grafa', categoria: 'Ropa de Trabajo', talle: '48', stock: 10, unidad: 'UNIDAD' },
      { nombre: 'Camisa Grafa', categoria: 'Ropa de Trabajo', talle: '44', stock: 15, unidad: 'UNIDAD' },
      { nombre: 'Camisa Grafa', categoria: 'Ropa de Trabajo', talle: '42', stock: 6, unidad: 'UNIDAD' },
      { nombre: 'Camisa Grafa', categoria: 'Ropa de Trabajo', talle: '40', stock: 1, unidad: 'UNIDAD' },
      { nombre: 'Remera', categoria: 'Ropa de Trabajo', talle: 'XXL', stock: 16, unidad: 'UNIDAD' },
      { nombre: 'Remera', categoria: 'Ropa de Trabajo', talle: 'XL', stock: 12, unidad: 'UNIDAD' },
      { nombre: 'Remera', categoria: 'Ropa de Trabajo', talle: 'L', stock: 10, unidad: 'UNIDAD' },
      { nombre: 'Camiseta', categoria: 'Ropa de Trabajo', talle: 'XXL', stock: 10, unidad: 'UNIDAD' },
      { nombre: 'Camiseta', categoria: 'Ropa de Trabajo', talle: 'XL', stock: 15, unidad: 'UNIDAD' },
      { nombre: 'Camiseta', categoria: 'Ropa de Trabajo', talle: 'L', stock: 9, unidad: 'UNIDAD' },
      { nombre: 'Chaleco', categoria: 'Abrigo e Impermeables', talle: 'XXXL', stock: 1, unidad: 'UNIDAD' },
      { nombre: 'Chaleco', categoria: 'Abrigo e Impermeables', talle: 'XXL', stock: 6, unidad: 'UNIDAD' },
      { nombre: 'Chaleco', categoria: 'Abrigo e Impermeables', talle: 'XL', stock: 6, unidad: 'UNIDAD' },
      { nombre: 'Chaleco', categoria: 'Abrigo e Impermeables', talle: 'L', stock: 5, unidad: 'UNIDAD' },
      { nombre: 'Chaleco', categoria: 'Abrigo e Impermeables', talle: 'M', stock: 2, unidad: 'UNIDAD' },
      { nombre: 'Campera', categoria: 'Abrigo e Impermeables', talle: 'XXXL', stock: 1, unidad: 'UNIDAD' },
      { nombre: 'Campera', categoria: 'Abrigo e Impermeables', talle: 'XXL', stock: 5, unidad: 'UNIDAD' },
      { nombre: 'Campera', categoria: 'Abrigo e Impermeables', talle: 'XL', stock: 6, unidad: 'UNIDAD' },
      { nombre: 'Campera', categoria: 'Abrigo e Impermeables', talle: 'L', stock: 5, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Grafa', categoria: 'Ropa de Trabajo', talle: '50', stock: 4, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Grafa', categoria: 'Ropa de Trabajo', talle: '54', stock: 6, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Grafa', categoria: 'Ropa de Trabajo', talle: '52', stock: 4, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Grafa', categoria: 'Ropa de Trabajo', talle: '46', stock: 16, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Grafa', categoria: 'Ropa de Trabajo', talle: '44', stock: 14, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Grafa', categoria: 'Ropa de Trabajo', talle: '42', stock: 5, unidad: 'UNIDAD' },

      // Note 3: Tobo Mando
      { nombre: 'Pantalón Tobo Mando', categoria: 'Ropa de Trabajo', talle: '54', stock: 6, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Tobo Mando', categoria: 'Ropa de Trabajo', talle: '50', stock: 3, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Tobo Mando', categoria: 'Ropa de Trabajo', talle: '52', stock: 3, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Tobo Mando', categoria: 'Ropa de Trabajo', talle: '46', stock: 6, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Tobo Mando', categoria: 'Ropa de Trabajo', talle: '44', stock: 6, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Tobo Mando', categoria: 'Ropa de Trabajo', talle: '42', stock: 2, unidad: 'UNIDAD' },
      { nombre: 'Pantalón Tobo Mando', categoria: 'Ropa de Trabajo', talle: '40', stock: 2, unidad: 'UNIDAD' },
      { nombre: 'Camisa Tobo Mando', categoria: 'Ropa de Trabajo', talle: '48', stock: 6, unidad: 'UNIDAD' },
      { nombre: 'Camisa Tobo Mando', categoria: 'Ropa de Trabajo', talle: '44', stock: 9, unidad: 'UNIDAD' },
      { nombre: 'Camisa Tobo Mando', categoria: 'Ropa de Trabajo', talle: '40', stock: 1, unidad: 'UNIDAD' },
      { nombre: 'Camisa Tobo Mando', categoria: 'Ropa de Trabajo', talle: '38', stock: 4, unidad: 'UNIDAD' },
      { nombre: 'Remera Tobo Mando', categoria: 'Ropa de Trabajo', talle: 'XXL', stock: 6, unidad: 'UNIDAD' },
      { nombre: 'Remera Tobo Mando', categoria: 'Ropa de Trabajo', talle: 'XL', stock: 9, unidad: 'UNIDAD' },
      { nombre: 'Remera Tobo Mando', categoria: 'Ropa de Trabajo', talle: 'L', stock: 1, unidad: 'UNIDAD' },
      { nombre: 'Camiseta Tobo Mando', categoria: 'Ropa de Trabajo', talle: 'XXL', stock: 6, unidad: 'UNIDAD' },
      { nombre: 'Camiseta Tobo Mando', categoria: 'Ropa de Trabajo', talle: 'XL', stock: 9, unidad: 'UNIDAD' },
      { nombre: 'Camiseta Tobo Mando', categoria: 'Ropa de Trabajo', talle: 'L', stock: 2, unidad: 'UNIDAD' },
      { nombre: 'Chaleco Tobo Mando', categoria: 'Abrigo e Impermeables', talle: 'XXXL', stock: 4, unidad: 'UNIDAD' },
      { nombre: 'Chaleco Tobo Mando', categoria: 'Abrigo e Impermeables', talle: 'XL', stock: 5, unidad: 'UNIDAD' },
      { nombre: 'Chaleco Tobo Mando', categoria: 'Abrigo e Impermeables', talle: 'L', stock: 2, unidad: 'UNIDAD' },
      { nombre: 'Campera Tobo Mando', categoria: 'Abrigo e Impermeables', talle: 'XXXL', stock: 3, unidad: 'UNIDAD' },
      { nombre: 'Campera Tobo Mando', categoria: 'Abrigo e Impermeables', talle: 'XL', stock: 4, unidad: 'UNIDAD' },
      { nombre: 'Campera Tobo Mando', categoria: 'Abrigo e Impermeables', talle: 'L', stock: 4, unidad: 'UNIDAD' },
      { nombre: 'Campera Tobo Mando', categoria: 'Abrigo e Impermeables', talle: 'M', stock: 2, unidad: 'UNIDAD' },
    ];

    const todayStr = new Date().toISOString().slice(0, 10);
    const generatedItems: StockItem[] = rawNotesData.map((d, index) => {
      const codeNum = String(index + 1).padStart(3, '0');
      const id = `STOCK-IND-${index + 1}`;
      return {
        id,
        codigo: `IND-${codeNum}`,
        nombre: d.nombre,
        categoria: d.categoria,
        depositoId: 'DEP-INDUMENTARIA',
        depositoNombre: 'Depósito Ropa e Indumentaria (EPP)',
        talle: d.talle,
        genero: 'Unisex',
        unidad: d.unidad,
        stockActual: d.stock,
        stockMinimoAlerta: 2,
        precioCostoUnitario: 0,
        ubicacionPañol: 'Depósito Ropa - Estantería Principal',
        fechaUltimoIngreso: todayStr,
        lotes: [
          {
            id: `BATCH-IND-${index + 1}`,
            stockItemId: id,
            numeroLote: `Carga Inicial Notas (${todayStr})`,
            fechaIngreso: todayStr,
            capacidadInicial: d.stock,
            contenidoActual: d.stock,
            unidad: d.unidad,
            estado: 'EN_USO',
            observacionesIngreso: 'Importado de notas manuscritas de ropa y EPP',
          },
        ],
      };
    });

    if (!seededIndumentariaItemsRef.current) {
      seededIndumentariaItemsRef.current = true;
      apiSaveItemsStrict('stock_items', generatedItems).catch(err => {
        console.warn('[Indumentaria] Error persistiendo inventario inicial:', err);
      });
    }

    return [...items, ...generatedItems];
  };

  const handleSaveStockItems = async (items: StockItem[]) => {
    const previous = stockItems;
    const changed = getChangedItemsById(previous, items);
    setStockItems(items);
    if (changed.length > 0) {
      const res = await apiSaveItemsStrict('stock_items', changed);
      if (!res.ok) {
        setStockItems(previous);
        showToast(res.error || 'Error al guardar artículos de stock en Supabase.');
      }
    }
  };

  const handleCreateStockItemStrict = async (item: StockItem): Promise<{ ok: boolean; error?: string }> => {
    const res = await apiSaveItemsStrict('stock_items', item);
    if (!res.ok) {
      const msg = res.error || 'Error al dar de alta el artículo en Supabase.';
      showToast(msg);
      return { ok: false, error: msg };
    }
    setStockItems(prev => {
      const exists = prev.some(s => s.id === item.id);
      return exists ? prev.map(s => (s.id === item.id ? item : s)) : [item, ...prev];
    });
    showToast(`Artículo "${item.nombre}" guardado en el catálogo de Supabase.`);
    return { ok: true };
  };

  const handleSaveStockMovements = async (movements: StockMovement[]) => {
    const previous = stockMovements;
    const changed = getChangedItemsById(previous, movements);
    setStockMovements(movements);
    if (changed.length > 0) {
      const res = await apiSaveItemsStrict('stock_movements', changed);
      if (!res.ok) {
        setStockMovements(previous);
        showToast(res.error || 'Error al guardar movimientos de stock en Supabase.');
      }
    }
  };

  const handleSaveStockCategories = async (categories: StockCategoryCustom[]) => {
    const previous = stockCategories;
    const changed = getChangedItemsById(previous, categories);
    setStockCategories(categories);
    if (changed.length > 0) {
      const res = await apiSaveItemsStrict('stock_categories', changed);
      if (!res.ok) {
        setStockCategories(previous);
        showToast(res.error || 'Error al guardar categorías de stock en Supabase.');
      }
    }
  };

  const handleSaveStockWarehouses = async (warehouses: StockWarehouse[]) => {
    const previous = stockWarehouses;
    const changed = getChangedItemsById(previous, warehouses);
    setStockWarehouses(warehouses);
    if (changed.length > 0) {
      const res = await apiSaveItemsStrict('stock_warehouses', changed);
      if (!res.ok) {
        setStockWarehouses(previous);
        showToast(res.error || 'Error al guardar depósitos en Supabase.');
        return;
      }
    }
    showToast('Depósitos confirmados en Supabase PostgreSQL.');
  };

  const handleCreateStockWarehouseStrict = async (warehouse: StockWarehouse): Promise<{ ok: boolean; error?: string }> => {
    const res = await apiSaveItemsStrict('stock_warehouses', warehouse);
    if (!res.ok) {
      const msg = res.error || 'Error al crear depósito en Supabase.';
      showToast(msg);
      return { ok: false, error: msg };
    }
    setStockWarehouses(prev => {
      const exists = prev.some(w => w.id === warehouse.id);
      return exists ? prev.map(w => (w.id === warehouse.id ? warehouse : w)) : [...prev, warehouse];
    });
    showToast(`Depósito "${warehouse.nombre}" creado y confirmado en Supabase.`);
    return { ok: true };
  };

  // Services & Expenses states (Supabase PostgreSQL como única fuente de verdad)
  const [servicesLogs, setServicesLogs] = useState<VehicleServiceLog[]>([]);
  const [expensesLogs, setExpensesLogs] = useState<VehicleExpenseLog[]>([]);

  const handleSaveVehicleServices = async (services: VehicleServiceLog[]) => {
    const previous = servicesLogs;
    const changed = getChangedItemsById(previous, services);
    setServicesLogs(services);
    if (changed.length > 0) {
      const res = await apiSaveItemsStrict('vehicle_services', changed);
      if (!res.ok) {
        setServicesLogs(previous);
        showToast(res.error || 'Error al guardar services en Supabase PostgreSQL.');
      }
    }
  };

  const handleSaveVehicleExpenses = async (expenses: VehicleExpenseLog[]) => {
    const previous = expensesLogs;
    const changed = getChangedItemsById(previous, expenses);
    setExpensesLogs(expenses);
    if (changed.length > 0) {
      const res = await apiSaveItemsStrict('vehicle_expenses', changed);
      if (!res.ok) {
        setExpensesLogs(previous);
        showToast(res.error || 'Error al guardar gastos por equipo en Supabase.');
      }
    }
  };

  // ARCA Billing State
  const [arcaInvoices, setArcaInvoices] = useState<ArcaInvoice[]>([]);
  const arcaInvoicesRef = useRef<ArcaInvoice[]>([]);
  useEffect(() => {
    arcaInvoicesRef.current = arcaInvoices;
  }, [arcaInvoices]);

  const syncInvoicesWithObraContainers = async (
    nextInvoices: ArcaInvoice[],
    prevInvoices: ArcaInvoice[]
  ) => {
    const returnCtx = arcaReturnContextRef.current;
    const currentRentals = rentalsRef.current;
    const currentPartes = partesDiariosRef.current;
    const prevMap = new Map(prevInvoices.map(i => [i.id, i]));
    const syncedObras: Obra[] = [];

    for (const inv of nextInvoices) {
      if (!inv || inv.tipoComprobante?.startsWith('NOTA_CREDITO')) continue;

      const resolved = resolveArcaInvoiceLinks(inv, currentRentals, currentPartes);
      const linkedRentalIds = new Set<string>(resolved.linkedRentals.map(r => r.id));
      if (inv.rentalId) linkedRentalIds.add(inv.rentalId);
      (inv.rentalIds || []).forEach(id => linkedRentalIds.add(id));

      const prevInv = prevMap.get(inv.id);
      const isResumenReturnMatch = Boolean(!prevInv && returnCtx?.resumenValorizadoId);
      if (isResumenReturnMatch && returnCtx?.rentalId) {
        linkedRentalIds.add(returnCtx.rentalId);
      }
      if (linkedRentalIds.size === 0 && !isResumenReturnMatch) continue;

      let isNewOrNewlyLinked = !prevInv;
      if (prevInv) {
        const prevResolved = resolveArcaInvoiceLinks(prevInv, currentRentals, currentPartes);
        const prevRentalIds = new Set<string>(prevResolved.linkedRentals.map(r => r.id));
        if (prevInv.rentalId) prevRentalIds.add(prevInv.rentalId);
        (prevInv.rentalIds || []).forEach(id => prevRentalIds.add(id));
        isNewOrNewlyLinked = Array.from(linkedRentalIds).some(id => !prevRentalIds.has(id));
      }
      if (!isNewOrNewlyLinked) continue;

      for (const obra of obrasRef.current) {
        const facturas = obra.facturasLegajo || [];
        if (facturas.some(f => f.arcaInvoiceId === inv.id)) continue;

        const isTargetResumenObra = Boolean(isResumenReturnMatch && returnCtx?.obraId === obra.id);
        const resumenes = obra.resumenesValorizados || [];
        const matchedResumen = isTargetResumenObra
          ? resumenes.find(rv => rv.id === returnCtx?.resumenValorizadoId)
          : resumenes.find(
              rv =>
                rv.estado !== 'FACTURADO' &&
                !rv.facturaArcaId &&
                (rv.rentalIds || []).some(rid => linkedRentalIds.has(rid))
            );

        const pendingMatch =
          (matchedResumen
            ? facturas.find(
                f =>
                  !f.arcaInvoiceId &&
                  ((matchedResumen.legajoId && f.id === matchedResumen.legajoId) ||
                    f.resumenValorizadoId === matchedResumen.id)
              )
            : undefined) ||
          facturas.find(
            f =>
              (f.pendienteFacturacion ||
                f.tipoComprobante === 'CONTRATO DE ALQUILER' ||
                f.tipoComprobante === 'RESUMEN VALORIZADO') &&
              !f.arcaInvoiceId &&
              (f.rentalIds || []).some(rid => linkedRentalIds.has(rid))
          );

        const periodos = obra.periodosLegajo || [];
        if (periodos.length === 0 && !pendingMatch && !isTargetResumenObra) continue;

        let targetPeriod =
          pendingMatch?.periodoId
            ? periodos.find(p => p.id === pendingMatch.periodoId)
            : undefined;

        if (!targetPeriod && matchedResumen?.periodoId) {
          targetPeriod = periodos.find(p => p.id === matchedResumen.periodoId);
        }

        if (!targetPeriod) {
          targetPeriod =
            returnCtx &&
            returnCtx.obraId === obra.id &&
            returnCtx.periodoId &&
            (isTargetResumenObra || !returnCtx.rentalId || linkedRentalIds.has(returnCtx.rentalId))
              ? periodos.find(p => p.id === returnCtx.periodoId)
              : undefined;
        }

        if (!targetPeriod) {
          targetPeriod = periodos.find(per =>
            (per.rentalIds || []).some(rid => linkedRentalIds.has(rid))
          );
        }

        if (!targetPeriod && !pendingMatch && !isTargetResumenObra) continue;

        const cotSet = new Set<string>(pendingMatch?.quotationIds || []);
        resolved.linkedRentals.forEach(r => {
          if (r.cotizacionId) cotSet.add(r.cotizacionId);
        });

        const estadoCobro: ObraFacturaLegajo['estadoCobro'] =
          resolved.estadoCobro === 'PAGADO'
            ? 'COBRADO'
            : resolved.estadoCobro === 'COBRADO_PARCIAL' || resolved.estadoCobro === 'PARCIAL'
              ? 'COBRADO_PARCIAL'
              : 'PENDIENTE';

        const mergedRentalIds = Array.from(
          new Set([
            ...(pendingMatch?.rentalIds || []),
            ...(matchedResumen?.rentalIds || []),
            ...Array.from(linkedRentalIds),
          ])
        );
        const resumenPartes = isTargetResumenObra
          ? returnCtx?.parteDiarioIds ||
            (matchedResumen?.filas || []).map(f => f.parteDiarioId).filter((id): id is string => Boolean(id))
          : [];
        const mergedParteIds = Array.from(
          new Set([
            ...(pendingMatch?.parteDiarioIds || []),
            ...resolved.linkedPartes.map(p => p.id),
            ...resumenPartes,
          ])
        );

        const origen: ObraFacturaOrigen =
          mergedRentalIds.length > 0 && mergedParteIds.length > 0
            ? 'MIXTO'
            : mergedParteIds.length > 0
              ? 'PARTES_DIARIOS'
              : 'ALQUILER_MAQUINA';

        const desc = (inv.items || [])
          .map(it => it.descripcion)
          .filter(Boolean)
          .slice(0, 3)
          .join(' / ');

        const mergedAdjuntos: ObraLegajoAdjunto[] = [...(pendingMatch?.adjuntos || [])];
        if (
          matchedResumen?.pdfAdjunto &&
          !mergedAdjuntos.some(
            a => a.url === matchedResumen.pdfAdjunto!.url || a.nombre === matchedResumen.pdfAdjunto!.nombre
          )
        ) {
          mergedAdjuntos.unshift(matchedResumen.pdfAdjunto);
        }

        const formattedNum = formatInvoiceNumber(inv);
        const newLegajoId =
          pendingMatch?.id || `OFAC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const newRecord: ObraFacturaLegajo = {
          id: newLegajoId,
          arcaInvoiceId: inv.id,
          periodoId: targetPeriod?.id || pendingMatch?.periodoId || matchedResumen?.periodoId,
          periodoTitulo: targetPeriod?.titulo || pendingMatch?.periodoTitulo || matchedResumen?.periodoTitulo,
          tipoComprobante: inv.tipoComprobante
            .replace('NOTA_CREDITO_', 'NOTA DE CRÉDITO ')
            .replace(/_/g, ' '),
          nroComprobante: formattedNum,
          fecha: inv.fecha || new Date().toISOString().slice(0, 10),
          concepto:
            desc ||
            pendingMatch?.concepto ||
            (matchedResumen ? `Resumen Valorizado N° ${matchedResumen.numero}` : `Facturación a ${inv.razonSocialReceptor}`),
          origen,
          rentalIds: mergedRentalIds,
          quotationIds: Array.from(cotSet),
          parteDiarioIds: mergedParteIds,
          resumenValorizadoId: matchedResumen?.id || pendingMatch?.resumenValorizadoId,
          resumenValorizadoNumero: matchedResumen?.numero || pendingMatch?.resumenValorizadoNumero,
          netoGravado: Number(inv.netoGravado || 0),
          ivaMonto: Number(inv.ivaTotal || 0),
          importeTotal: Number(inv.importeTotal || inv.impTotal || 0),
          estadoCobro,
          pendienteFacturacion: false,
          observaciones:
            pendingMatch?.observaciones ||
            (matchedResumen
              ? `Facturada desde Resumen Valorizado N° ${matchedResumen.numero}${
                  resolved.linkedRentals[0] ? ` · Contrato ${resolved.linkedRentals[0].numeroContrato}` : ''
                }`
              : resolved.linkedRentals[0]
              ? `Vinculada automáticamente desde Contrato ${resolved.linkedRentals[0].numeroContrato}`
              : undefined),
          adjuntos: mergedAdjuntos,
          createdAt: pendingMatch?.createdAt || new Date().toISOString(),
        };

        const nextPeriodos = targetPeriod
          ? periodos.map(per =>
              per.id === targetPeriod!.id
                ? {
                    ...per,
                    rentalIds: Array.from(new Set([...(per.rentalIds || []), ...mergedRentalIds])),
                    cotizacionIds: Array.from(new Set([...(per.cotizacionIds || []), ...Array.from(cotSet)])),
                  }
                : per
            )
          : periodos;

        const nextFacturas = pendingMatch
          ? facturas.map(f => (f.id === pendingMatch.id ? newRecord : f))
          : [newRecord, ...facturas];

        const nextResumenes = matchedResumen
          ? resumenes.map(rv =>
              rv.id === matchedResumen.id
                ? {
                    ...rv,
                    estado: 'FACTURADO' as const,
                    facturaArcaId: inv.id,
                    facturaArcaNumero: formattedNum,
                    legajoId: newLegajoId,
                    rentalIds: mergedRentalIds,
                    updatedAt: new Date().toISOString(),
                  }
                : rv
            )
          : obra.resumenesValorizados;

        const updatedObra: Obra = {
          ...obra,
          periodosLegajo: nextPeriodos,
          facturasLegajo: nextFacturas,
          resumenesValorizados: nextResumenes,
        };

        obrasRef.current = obrasRef.current.map(o => (o.id === updatedObra.id ? updatedObra : o));
        syncedObras.push(updatedObra);
      }
    }

    for (const updatedObra of syncedObras) {
      await handleSaveObraLegajo(updatedObra);
    }

    if (syncedObras.length > 0 && returnCtx) {
      const wasResumen = Boolean(returnCtx.resumenValorizadoId);
      const hadRental = Boolean(returnCtx.rentalId);
      arcaReturnContextRef.current = null;
      showToast(
        wasResumen
          ? `Factura vinculada automáticamente al Resumen Valorizado, al Legajo${hadRental ? ' y al Contrato de Alquiler' : ''}.`
          : 'Factura vinculada automáticamente al contenedor de la obra.'
      );
    }
  };

  const handleSaveArcaInvoices = async (invoices: ArcaInvoice[]): Promise<boolean> => {
    const prevInvoices = arcaInvoicesRef.current;
    const seenIds = new Set<string>();
    const dedupedInvoices = invoices.filter(inv => {
      if (!inv?.id) return false;
      if (seenIds.has(inv.id)) return false;
      seenIds.add(inv.id);
      return true;
    });
    if (dedupedInvoices.length > 0) {
      const res = await apiSaveItemsStrict('arca_invoices', dedupedInvoices);
      if (!res.ok) {
        showToast(res.error || 'Error al guardar comprobantes ARCA en Supabase.');
        return false;
      }
    }
    const mergedMap = new Map(prevInvoices.map(inv => [inv.id, inv]));
    dedupedInvoices.forEach(inv => mergedMap.set(inv.id, inv));
    const mergedInvoices = Array.from(mergedMap.values());
    arcaInvoicesRef.current = mergedInvoices;
    setArcaInvoices(mergedInvoices);
    await syncInvoicesWithObraContainers(mergedInvoices, prevInvoices);
    return true;
  };

  const handleDeleteArcaInvoice = async (id: string): Promise<boolean> => {
    const res = await apiDeleteItemStrict('arca_invoices', id);
    if (!res.ok) {
      showToast(res.error || 'Error al eliminar comprobante ARCA en Supabase.');
      return false;
    }
    const nextInvoices = arcaInvoicesRef.current.filter(inv => inv.id !== id);
    arcaInvoicesRef.current = nextInvoices;
    setArcaInvoices(nextInvoices);
    showToast('Comprobante eliminado de Supabase PostgreSQL.');
    return true;
  };

  // Customer Payment Receipts State
  const [customerReceipts, setCustomerReceipts] = useState<CustomerPaymentReceipt[]>([]);
  const handleSaveCustomerReceipts = async (receipts: CustomerPaymentReceipt[]) => {
    if (receipts.length > 0) {
      const res = await apiSaveItemsStrict('customer_receipts', receipts);
      if (!res.ok) {
        showToast(res.error || 'Error al guardar recibos de cobranza en Supabase.');
        return;
      }
    }
    setCustomerReceipts(prev => {
      const map = new Map(prev.map(r => [r.id, r]));
      receipts.forEach(r => {
        if (r?.id) map.set(r.id, r);
      });
      return Array.from(map.values());
    });
  };

  // Plan de Cuentas & Asientos Contables (Bancos, Caja, Valores, Retenciones)
  const [accountingAccounts, setAccountingAccounts] = useState<AccountingAccount[]>([]);
  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>([]);

  const handleSaveAccountingAccount = async (account: AccountingAccount) => {
    const res = await apiSaveItemsStrict('accounting_accounts', account);
    if (!res.ok) {
      showToast(res.error || 'Error al guardar cuenta contable en Supabase.');
      return;
    }
    setAccountingAccounts(prev => {
      const exists = prev.some(a => a.id === account.id);
      return exists ? prev.map(a => (a.id === account.id ? account : a)) : [...prev, account];
    });
    showToast(`Cuenta ${account.codigo} — ${account.nombre} guardada.`);
  };

  const handleDeleteAccountingAccount = async (accountId: string) => {
    const res = await apiDeleteItemStrict('accounting_accounts', accountId);
    if (!res.ok) {
      showToast(res.error || 'Error al eliminar cuenta contable en Supabase.');
      return;
    }
    setAccountingAccounts(prev => prev.filter(a => a.id !== accountId));
    showToast('Cuenta contable eliminada.');
  };

  const handleInitializeDefaultAccountingAccounts = async (defaults: AccountingAccount[]) => {
    const res = await apiSaveItemsStrict('accounting_accounts', defaults);
    if (!res.ok) {
      showToast(res.error || 'Error al inicializar Plan de Cuentas en Supabase.');
      return;
    }
    setAccountingAccounts(defaults);
    showToast(`Plan de Cuentas inicializado con ${defaults.length} cuentas base en Supabase.`);
  };

  const handleSaveAccountingEntry = async (entry: AccountingEntry) => {
    const res = await apiSaveItemsStrict('accounting_entries', entry);
    if (!res.ok) {
      showToast(res.error || 'Error al guardar asiento contable en Supabase.');
      return;
    }
    setAccountingEntries(prev => {
      const exists = prev.some(e => e.id === entry.id);
      return exists ? prev.map(e => (e.id === entry.id ? entry : e)) : [entry, ...prev];
    });
  };

  const handleDeleteAccountingEntry = async (entryId: string) => {
    const res = await apiDeleteItemStrict('accounting_entries', entryId);
    if (!res.ok) {
      showToast(res.error || 'Error al eliminar asiento contable en Supabase.');
      return;
    }
    setAccountingEntries(prev => prev.filter(e => e.id !== entryId));
    showToast('Movimiento contable eliminado.');
  };

  // Cartera de Cheques & E-Cheq
  const [chequesCartera, setChequesCartera] = useState<ChequeCarteraItem[]>([]);

  const handleSaveChequesCartera = async (items: ChequeCarteraItem[]): Promise<boolean> => {
    if (items.length > 0) {
      const res = await apiSaveItemsStrict('cheques_cartera', items);
      if (!res.ok) {
        showToast(res.error || 'Error al guardar cheques en Supabase.');
        return false;
      }
    }
    setChequesCartera(prev => {
      const map = new Map(prev.map(c => [c.id, c]));
      items.forEach(c => {
        if (c?.id) map.set(c.id, c);
      });
      return Array.from(map.values());
    });
    return true;
  };

  const handleDeleteChequeCartera = async (id: string) => {
    const res = await apiDeleteItemStrict('cheques_cartera', id);
    if (!res.ok) {
      showToast(res.error || 'Error al eliminar cheque de la cartera en Supabase.');
      return;
    }
    setChequesCartera(prev => prev.filter(c => c.id !== id));
    showToast('Cheque eliminado de la cartera.');
  };

  const handleEndorseChequesToSupplier = async ({
    cheques,
    proveedor,
    fechaEndoso,
    facturasCompraIds,
    observaciones,
  }: {
    cheques: ChequeCarteraItem[];
    proveedor: Proveedor;
    fechaEndoso: string;
    facturasCompraIds: string[];
    observaciones?: string;
  }) => {
    if (cheques.length === 0) return false;
    const nowIso = new Date().toISOString();
    const totalEndosado = Number(
      cheques.reduce((sum, ch) => sum + Number(ch.importe || 0), 0).toFixed(2)
    );
    const paymentId = `OP-END-${Date.now().toString().slice(-6)}`;
    const primaryAsientoId = `AS-OP-END-${Date.now().toString().slice(-6)}`;

    const payment: SupplierPayment = {
      id: paymentId,
      fecha: fechaEndoso,
      proveedorId: proveedor.id,
      proveedorNombre: proveedor.razonSocial,
      proveedorCuit: proveedor.cuit,
      montoTotal: totalEndosado,
      formaPago: 'CHEQUE_ENDOSADO',
      numeroComprobantePago: cheques.map(c => `#${c.numeroCheque}`).join(', '),
      facturasImputadasIds: facturasCompraIds,
      chequesEndosadosIds: cheques.map(c => c.id),
      chequesEndosadosResumen: cheques.map(c => ({
        id: c.id,
        numeroCheque: c.numeroCheque,
        bancoEmisor: c.bancoEmisor,
        fechaCobro: c.fechaCobro,
        importe: c.importe,
      })),
      asientoContableId: primaryAsientoId,
      observaciones: observaciones || undefined,
      createdAt: nowIso,
    };

    const payRes = await apiSaveItemsStrict('supplier_payments', payment);
    if (!payRes.ok) {
      showToast(payRes.error || 'Error al registrar orden de pago por endoso en Supabase.');
      return false;
    }
    setSupplierPayments(prev => [payment, ...prev]);

    // Actualizar saldo pendiente de facturas de compra imputadas
    if (facturasCompraIds.length > 0) {
      let remaining = totalEndosado;
      const updatedInvoicesList: PurchaseInvoice[] = [];
      for (const invId of facturasCompraIds) {
        const inv = purchaseInvoices.find(i => i.id === invId);
        if (!inv || remaining <= 0) continue;
        const saldoPrev = Number(inv.saldoPendiente ?? inv.montoTotal);
        const applied = Math.min(saldoPrev, remaining);
        remaining = Math.max(0, Number((remaining - applied).toFixed(2)));
        const nuevoSaldo = Math.max(0, Number((saldoPrev - applied).toFixed(2)));
        const nuevoEstado: PurchaseInvoice['estado'] =
          nuevoSaldo <= 0.01 ? 'PAGADO' : nuevoSaldo < inv.montoTotal ? 'PAGADO_PARCIAL' : 'PENDIENTE_PAGO';
        updatedInvoicesList.push({
          ...inv,
          saldoPendiente: nuevoEstado === 'PAGADO' ? 0 : nuevoSaldo,
          estado: nuevoEstado,
        });
      }
      if (updatedInvoicesList.length > 0) {
        await apiSaveItemsStrict('purchase_invoices', updatedInvoicesList);
        setPurchaseInvoices(prev => {
          const map = new Map(prev.map(i => [i.id, i]));
          updatedInvoicesList.forEach(u => map.set(u.id, u));
          return Array.from(map.values());
        });
      }
    }

    // Marcar cheques como ENDOSADO en cartera y generar asientos contables
    const updatedCheques: ChequeCarteraItem[] = [];
    for (let idx = 0; idx < cheques.length; idx++) {
      const ch = cheques[idx];
      const asientoId = idx === 0 ? primaryAsientoId : `${primaryAsientoId}-${idx}`;
      const nextCheque: ChequeCarteraItem = {
        ...ch,
        estado: 'ENDOSADO',
        proveedorId: proveedor.id,
        proveedorNombre: proveedor.razonSocial,
        supplierPaymentId: paymentId,
        facturasCompraIds,
        fechaEndoso,
        asientoEndosoId: asientoId,
        observaciones: observaciones || ch.observaciones,
        updatedAt: nowIso,
        historial: [
          ...(ch.historial || []),
          {
            id: `hist-${Date.now()}-${idx}`,
            fecha: fechaEndoso,
            estado: 'ENDOSADO',
            detalle: `Endosado a ${proveedor.razonSocial} (${paymentId})`,
          },
        ],
      };
      updatedCheques.push(nextCheque);

      const entry = buildChequeEndosoEntry(
        nextCheque,
        proveedor.razonSocial,
        fechaEndoso,
        paymentId,
        accountingAccounts,
        asientoId
      );
      await handleSaveAccountingEntry(entry);
    }

    await handleSaveChequesCartera(updatedCheques);
    showToast(
      `Endoso registrado: ${cheques.length} cheque(s) a ${proveedor.razonSocial} por $${totalEndosado.toLocaleString('es-AR')}.`
    );
    return true;
  };

  const handleRejectCheque = async ({
    cheque,
    fechaRechazo,
    motivoRechazo,
    gastosRechazo,
  }: {
    cheque: ChequeCarteraItem;
    fechaRechazo: string;
    motivoRechazo: string;
    gastosRechazo: number;
  }) => {
    const nowIso = new Date().toISOString();
    const prevEstado = cheque.estado;
    const asientoRechazoId = `AS-RECH-${cheque.id}-${Date.now().toString().slice(-4)}`;
    let facturaReabierta = false;

    // Reabrir saldo de facturas ARCA vinculadas (y contratos/partes vinculados)
    if (cheque.facturasIds && cheque.facturasIds.length > 0 && prevEstado !== 'RECHAZADO') {
      let remainingToReopen = Number(cheque.importe || 0);
      const updatedInvoices: ArcaInvoice[] = [];
      const rentalsToReopen = new Map<string, RentalContract>();
      const partesToReopen = new Map<string, ParteDiario>();

      for (const facId of cheque.facturasIds) {
        const inv = arcaInvoicesRef.current.find(i => i.id === facId);
        if (!inv || remainingToReopen <= 0) continue;
        const montoCobradoPrev = Number(
          inv.montoCobrado !== undefined
            ? inv.montoCobrado
            : inv.estadoCobro === 'PAGADO'
            ? inv.importeTotal
            : 0
        );
        const reopenAmt = Math.min(montoCobradoPrev > 0 ? montoCobradoPrev : inv.importeTotal, remainingToReopen);
        remainingToReopen = Math.max(0, Number((remainingToReopen - reopenAmt).toFixed(2)));
        const nuevoCobrado = Math.max(0, Number((montoCobradoPrev - reopenAmt).toFixed(2)));
        const nuevoSaldo = Math.min(
          inv.importeTotal,
          Math.max(0, Number((inv.importeTotal - nuevoCobrado).toFixed(2)))
        );
        const nuevoEstado: 'PENDIENTE_PAGO' | 'COBRADO_PARCIAL' =
          nuevoCobrado <= 0.01 ? 'PENDIENTE_PAGO' : 'COBRADO_PARCIAL';

        updatedInvoices.push({
          ...inv,
          estadoCobro: nuevoEstado,
          montoCobrado: nuevoCobrado,
          saldoPendiente: nuevoSaldo,
        });

        const links = resolveArcaInvoiceLinks(inv, rentalsRef.current, partesDiarios);
        links.linkedRentals.forEach(r => rentalsToReopen.set(r.id, r));
        links.linkedPartes.forEach(p => partesToReopen.set(p.id, p));
      }

      if (updatedInvoices.length > 0) {
        await handleSaveArcaInvoices(updatedInvoices);
        facturaReabierta = true;
      }

      for (const r of Array.from(rentalsToReopen.values())) {
        const prevPaid = Number(r.montoCobrado || 0);
        const nextPaid = Math.max(0, Number((prevPaid - Number(cheque.importe || 0)).toFixed(2)));
        await handleSaveRental({
          ...r,
          estadoCobro: nextPaid <= 0.01 ? 'PENDIENTE_PAGO' : 'COBRADO_PARCIAL',
          montoCobrado: nextPaid,
        });
      }

      const partesList = Array.from(partesToReopen.values());
      if (partesList.length > 0) {
        await handleSavePartesDiariosBatch(
          partesList.map(p => ({
            ...p,
            estadoCobro: 'PENDIENTE_PAGO',
          }))
        );
      }
    }

    const updatedCheque: ChequeCarteraItem = {
      ...cheque,
      estado: 'RECHAZADO',
      fechaRechazo,
      motivoRechazo,
      gastosRechazo: Number(gastosRechazo || 0),
      facturaReabierta: cheque.facturaReabierta || facturaReabierta,
      asientoRechazoId,
      updatedAt: nowIso,
      historial: [
        ...(cheque.historial || []),
        {
          id: `hist-${Date.now()}`,
          fecha: fechaRechazo,
          estado: 'RECHAZADO',
          detalle: `Cheque rechazado (${motivoRechazo})${
            facturaReabierta ? ' · Saldo de factura reabierto' : ''
          }`,
        },
      ],
    };

    await handleSaveChequesCartera([updatedCheque]);

    const entry = buildChequeRechazoEntry(
      {
        ...updatedCheque,
        estadoPrevio: prevEstado,
        motivoRechazo,
      },
      fechaRechazo,
      Number(gastosRechazo || 0),
      accountingAccounts,
      asientoRechazoId
    );
    await handleSaveAccountingEntry(entry);

    showToast(
      `Cheque #${cheque.numeroCheque} marcado como RECHAZADO${
        facturaReabierta ? ' y saldo de factura reabierto.' : '.'
      }`
    );
  };

  // Cotizador & Presupuestos State
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const handleSaveQuotations = async (nextQuotations: Quotation[]) => {
    if (nextQuotations.length > 0) {
      const res = await apiSaveItemsStrict('quotations', nextQuotations);
      if (!res.ok) {
        showToast(res.error || 'Error al guardar cotizaciones en Supabase.');
        return;
      }
    }
    setQuotations(prev => {
      const map = new Map(prev.map(q => [q.id, q]));
      nextQuotations.forEach(q => {
        if (q?.id) map.set(q.id, q);
      });
      return Array.from(map.values());
    });
  };

  const handleDeleteQuotation = async (id: string): Promise<boolean> => {
    const res = await apiDeleteItemStrict('quotations', id);
    if (!res.ok) {
      showToast(res.error || 'Error al eliminar cotización en Supabase.');
      return false;
    }
    setQuotations(prev => prev.filter(q => q.id !== id));
    showToast('Cotización eliminada de Supabase PostgreSQL.');
    return true;
  };

  // Commercial Pipeline Cross-Module Preselection States (Cotización <-> Alquiler <-> Facturación ARCA)
  const [preselectedQuotationForRental, setPreselectedQuotationForRental] = useState<Quotation | null>(null);
  const [preselectedQuotationForArca, setPreselectedQuotationForArca] = useState<Quotation | null>(null);
  const [preselectedRentalForArca, setPreselectedRentalForArca] = useState<RentalContract | null>(null);
  const [preselectedResumenForArca, setPreselectedResumenForArca] = useState<PreselectedResumenForArca | null>(null);
  const arcaReturnContextRef = useRef<{
    obraId: string;
    periodoId?: string;
    rentalId?: string;
    resumenValorizadoId?: string;
    parteDiarioIds?: string[];
  } | null>(null);

  const handleMarkQuotationStatus = async (quotationId: string, newStatus: 'APROBADA' | 'FACTURADA') => {
    const target = quotations.find(q => q.id === quotationId);
    if (!target) return;
    const updatedTarget: Quotation = { ...target, estado: newStatus };
    const res = await apiSaveItemsStrict('quotations', updatedTarget);
    if (!res.ok) {
      showToast(res.error || 'Error actualizando estado de cotización en Supabase.');
      return;
    }
    setQuotations(prev => prev.map(q => (q.id === quotationId ? updatedTarget : q)));
  };

  // Caja Diaria State
  const [cajaSessions, setCajaSessions] = useState<CajaDiariaSession[]>([]);
  const handleSaveCajaSessions = async (sessions: CajaDiariaSession[]) => {
    const res = await apiSaveItemsStrict('caja_diaria', sessions);
    if (!res.ok) {
      showToast(res.error || 'Error al guardar Caja Diaria en Supabase.');
      return;
    }
    setCajaSessions(sessions);
  };

  // Compras & Proveedores State
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsCount, setClientsCount] = useState<number>(0);

  const handleQuickCreateClient = async (payload: Partial<ClientRecord>): Promise<ClientRecord | null> => {
    try {
      const res = await fetch('/api/clients/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          fuente: 'ALTA_OBRA',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.client) {
        showToast(data?.error || 'No se pudo crear el cliente en Supabase.');
        return null;
      }
      const created: ClientRecord = data.client;
      setClients(prev => {
        const exists = prev.some(c => c.id === created.id);
        const next = exists ? prev.map(c => (c.id === created.id ? created : c)) : [created, ...prev];
        setClientsCount(next.length);
        return next;
      });
      showToast(`Cliente ${created.razonSocial} guardado en el Padrón.`);
      return created;
    } catch {
      showToast('Error de red al crear cliente.');
      return null;
    }
  };

  const handleSavePurchaseInvoice = async (
    invoice: PurchaseInvoice,
    options?: { applyStockAndExpenses?: boolean }
  ): Promise<boolean> => {
    const res = await apiSaveItemsStrict('purchase_invoices', invoice);
    if (!res.ok) {
      showToast(res.error || 'Error al guardar factura de compra en Supabase.');
      return false;
    }
    setPurchaseInvoices(prev => {
      const exists = prev.some(i => i.id === invoice.id);
      return exists ? prev.map(i => (i.id === invoice.id ? invoice : i)) : [invoice, ...prev];
    });

    if (options?.applyStockAndExpenses) {
      const warehousePool = stockWarehouses;
      const now = new Date();
      const timeStr = now.toTimeString().slice(0, 5);
      const nextStockMap = new Map<string, StockItem>();
      stockItems.forEach(s => nextStockMap.set(s.id, { ...s, lotes: s.lotes ? [...s.lotes] : undefined }));

      const updatedStockItemsToPersist: StockItem[] = [];
      const newMovementsToPersist: StockMovement[] = [];
      const newDirectExpensesToPersist: VehicleExpenseLog[] = [];

      const mapUnidadToStockUnit = (u?: string): StockUnit => {
        const up = (u || '').trim().toUpperCase();
        if (up === 'L' || up === 'LT' || up === 'LTS' || up === 'LITROS') return 'LITROS';
        if (up === 'KG' || up === 'KGS') return 'KG';
        if (up === 'CAJA') return 'CAJA';
        if (up === 'KIT') return 'KIT';
        if (up === 'JGO' || up === 'JUEGO') return 'JUEGO';
        if (up === 'PAR') return 'PAR';
        if (up === 'M' || up === 'MT' || up === 'METRO') return 'METRO';
        if (up === 'TAMBOR_205L') return 'TAMBOR_205L';
        if (up === 'BALDE_20KG') return 'BALDE_20KG';
        if (up === 'BIDON_20L') return 'BIDON_20L';
        return 'UNIDAD';
      };

      const mapItemTypeToExpenseCategory = (t: string): ExpenseCategory => {
        if (t === 'LUBRICANTE') return 'LUBRICANTES_ACEITES';
        if (t === 'COMBUSTIBLE') return 'COMBUSTIBLE_DIRECTO';
        if (t === 'SERVICE') return 'MANO_OBRA_TALLER';
        if (t === 'MANTENIMIENTO_FILTROS' || t === 'REPUESTO') return 'REPUESTOS_CONSUMIBLES';
        return 'VARIOS_EQUIPO';
      };

      invoice.items.forEach((line, idx) => {
        const qty = Number(line.cantidad) || 0;
        if (qty <= 0) return;

        if (line.modoImputacion === 'STOCK_FRACCIONABLE') {
          const targetWh = warehousePool.find(w => w.id === line.depositoId) || warehousePool[0];
          const targetDepId = line.depositoId || targetWh?.id || 'DEP-TALLER';
          const targetDepName = line.depositoNombre || targetWh?.nombre || 'Depósito de Taller';

          let matched: StockItem | undefined = line.stockItemId
            ? nextStockMap.get(line.stockItemId)
            : Array.from(nextStockMap.values()).find(
                s =>
                  (line.codigo && s.codigo.trim().toUpperCase() === line.codigo.trim().toUpperCase()) ||
                  s.nombre.trim().toUpperCase() === line.descripcion.trim().toUpperCase()
              );

          const isNewAutoItem = !matched;
          if (!matched) {
            matched = {
              id: `STK-${Date.now()}-${idx}`,
              codigo: (line.codigo || `ART-${Date.now().toString().slice(-4)}-${idx}`).trim().toUpperCase(),
              nombre: line.descripcion.trim().toUpperCase(),
              categoria: line.tipoItem === 'LUBRICANTE'
                ? 'Grasas y Lubricantes'
                : line.tipoItem === 'MANTENIMIENTO_FILTROS'
                  ? 'Filtros y Cortafuegos'
                  : line.tipoItem === 'REPUESTO'
                    ? 'Repuestos Taller'
                    : line.tipoItem === 'BIENES_CAMBIO'
                      ? 'Bienes de Cambio / Local'
                      : line.tipoItem === 'INDUMENTARIA'
                        ? 'Indumentaria / EPP'
                        : 'Insumos Taller',
              depositoId: targetDepId,
              depositoNombre: targetDepName,
              controlStockMode: 'STOCK_FRACCIONABLE',
              unidad: mapUnidadToStockUnit(line.unidadMedida),
              stockActual: 0,
              stockMinimoAlerta: 0,
              precioCostoUnitario: line.precioUnitario || 0,
              fechaUltimoIngreso: invoice.fechaEmision
            };
          }

          const stockAnterior = Number(matched.stockActual) || 0;
          const isContainerUnit =
            matched.unidad === 'TAMBOR_205L' ||
            matched.unidad === 'BALDE_20KG' ||
            matched.unidad === 'BIDON_20L' ||
            (matched.lotes && matched.lotes.length > 0);

          let nextLotes = matched.lotes ? [...matched.lotes] : undefined;
          let batchId: string | undefined;
          let batchNum: string | undefined;

          if (isContainerUnit) {
            batchId = `BATCH-${Date.now()}-${idx}`;
            batchNum = `Fc ${invoice.nroComprobanteCompleto} (${qty} ${matched.unidad})`;
            const newBatch: StockBatch = {
              id: batchId,
              stockItemId: matched.id,
              numeroLote: batchNum,
              fechaIngreso: invoice.fechaEmision,
              horaIngreso: timeStr,
              capacidadInicial: qty,
              contenidoActual: qty,
              unidad: matched.unidad,
              estado: (nextLotes || []).some(l => l.estado === 'EN_USO') ? 'NUEVO_SELLADO' : 'EN_USO',
              comprobanteProveedor: invoice.nroComprobanteCompleto,
              observacionesIngreso: `Ingreso automático desde Compra ${invoice.proveedorNombre}`
            };
            nextLotes = [...(nextLotes || []), newBatch];
          }

          const stockPosterior = stockAnterior + qty;
          const updatedItem: StockItem = {
            ...matched,
            depositoId: targetDepId,
            depositoNombre: targetDepName,
            controlStockMode: 'STOCK_FRACCIONABLE',
            stockActual: stockPosterior,
            precioCostoUnitario: line.precioUnitario > 0 ? line.precioUnitario : matched.precioCostoUnitario,
            fechaUltimoIngreso: invoice.fechaEmision,
            lotes: nextLotes
          };

          nextStockMap.set(updatedItem.id, updatedItem);
          const existingIdx = updatedStockItemsToPersist.findIndex(u => u.id === updatedItem.id);
          if (existingIdx >= 0) {
            updatedStockItemsToPersist[existingIdx] = updatedItem;
          } else {
            updatedStockItemsToPersist.push(updatedItem);
          }

          const newMov: StockMovement = {
            id: `STK-MOV-${Date.now()}-${idx}`,
            stockItemId: updatedItem.id,
            stockItemNombre: updatedItem.nombre,
            depositoId: targetDepId,
            depositoNombre: targetDepName,
            batchId,
            batchNumeroLote: batchNum,
            tipo: 'INGRESO_RECARGA',
            cantidad: qty,
            unidad: updatedItem.unidad,
            stockAnterior,
            stockPosterior,
            fecha: invoice.fechaEmision,
            hora: timeStr,
            motivoConcepto: `${isNewAutoItem ? 'Alta e ingreso' : 'Ingreso'} por Factura ${invoice.nroComprobanteCompleto}`,
            comprobanteProveedor: invoice.nroComprobanteCompleto,
            observaciones: `Proveedor: ${invoice.proveedorNombre} (${invoice.proveedorCuit})`
          };
          newMovementsToPersist.push(newMov);
        } else if (line.modoImputacion === 'DIRECTO_EQUIPO' && line.equipoId) {
          const vehicle = fleet.find(v => v.id === line.equipoId);
          newDirectExpensesToPersist.push({
            id: `EXP-${invoice.id}-${idx}`,
            equipoId: line.equipoId,
            equipoModeloMarca: vehicle?.modeloMarca || line.equipoLabel || 'Equipo asignado',
            equipoPatenteOrCodigo: vehicle?.codigoInterno || vehicle?.patente || '',
            fecha: invoice.fechaEmision,
            numeroComprobante: invoice.nroComprobanteCompleto,
            proveedor: invoice.proveedorNombre,
            categoria: mapItemTypeToExpenseCategory(line.tipoItem),
            concepto: `${line.descripcion} (Imputación 100% Directa desde Factura)`,
            cantidad: qty,
            montoTotal: Math.round((Number(line.subtotal) || 0) * 100) / 100,
            observaciones: `Factura Compra ${invoice.nroComprobanteCompleto} — sin paso por stock de depósito`
          });
        }
      });

      if (updatedStockItemsToPersist.length > 0) {
        const stockRes = await apiSaveItemsStrict('stock_items', updatedStockItemsToPersist);
        if (!stockRes.ok) {
          showToast(stockRes.error || 'Factura guardada, pero falló la actualización de Stock en Supabase.');
        } else {
          setStockItems(Array.from(nextStockMap.values()));
        }
      }

      if (newMovementsToPersist.length > 0) {
        const movRes = await apiSaveItemsStrict('stock_movements', newMovementsToPersist);
        if (!movRes.ok) {
          showToast(movRes.error || 'Factura guardada, pero falló el registro de movimientos de stock en Supabase.');
        } else {
          setStockMovements(prev => [...newMovementsToPersist, ...prev]);
        }
      }

      if (newDirectExpensesToPersist.length > 0) {
        const expRes = await apiSaveItemsStrict('vehicle_expenses', newDirectExpensesToPersist);
        if (!expRes.ok) {
          showToast(expRes.error || 'Factura guardada, pero falló el registro de gasto directo al equipo en Supabase.');
        } else {
          setExpensesLogs(prev => [...newDirectExpensesToPersist, ...prev]);
        }
      }

      // Sincronizar artículos de Salón de Ventas / Ferretería (solo BIENES_CAMBIO) usando la composición de listas configurada
      const salonCfg = loadSalonConfigLocal();
      const updatedHardwareToPersist: HardwareProduct[] = [];
      const nextHardwareMap = new Map<string, HardwareProduct>();
      hardwareProducts.forEach(h => nextHardwareMap.set(h.id, { ...h }));

      invoice.items.forEach((line, idx) => {
        const qty = Number(line.cantidad) || 0;
        if (qty <= 0) return;
        if (line.tipoItem === 'BIENES_CAMBIO') {
          const cost = Number(line.precioUnitario) || 0;
          const matchedH = Array.from(nextHardwareMap.values()).find(
            h =>
              (line.codigo &&
                (h.codigo.trim().toUpperCase() === line.codigo.trim().toUpperCase() ||
                  (h.codigoProveedor || '').trim().toUpperCase() === line.codigo.trim().toUpperCase())) ||
              h.nombre.trim().toUpperCase() === line.descripcion.trim().toUpperCase()
          );

          if (matchedH) {
            const nextCost = cost > 0 ? cost : (matchedH.precioCosto ?? 0);
            const calc = calculatePricesFromCost(nextCost, salonCfg.listasPrecios);
            const existingProvs = matchedH.proveedoresNombres || [];
            const nextProvs =
              invoice.proveedorNombre && !existingProvs.includes(invoice.proveedorNombre)
                ? [...existingProvs, invoice.proveedorNombre]
                : existingProvs;

            const updatedH: HardwareProduct = {
              ...matchedH,
              precioCosto: nextCost,
              precioVenta: calc.precioVenta,
              preciosPorLista: calc.preciosPorLista,
              listasDePrecios: calc.listasDePrecios,
              stockActual: (matchedH.stockActual || 0) + qty,
              proveedoresNombres: nextProvs,
            };
            nextHardwareMap.set(updatedH.id, updatedH);
            updatedHardwareToPersist.push(updatedH);
          } else {
            const defaultFam = salonCfg.familias[0];
            const defaultGrp = defaultFam?.grupos[0];
            const baseCode = generateNextBaseProductCode(
              defaultFam?.codigo || '001',
              defaultGrp?.codigo || '001',
              Array.from(nextHardwareMap.values())
            );
            const calc = calculatePricesFromCost(cost, salonCfg.listasPrecios);
            const newH: HardwareProduct = {
              id: `FERR-PRC-${Date.now()}-${idx}`,
              codigo: baseCode,
              codigoBase: baseCode,
              sku: baseCode,
              codigoProveedor: line.codigo || undefined,
              familiaId: defaultFam?.id,
              familiaCodigo: defaultFam?.codigo || '001',
              familiaNombre: defaultFam?.nombre || 'Herramientas Manuales',
              grupoId: defaultGrp?.id,
              grupoCodigo: defaultGrp?.codigo || '001',
              grupoNombre: defaultGrp?.nombre || 'General',
              nombre: line.descripcion.trim(),
              descripcion: `Alta automática desde Factura Compra ${invoice.nroComprobanteCompleto}`,
              descripcionAdicional: `Alta automática desde Factura Compra ${invoice.nroComprobanteCompleto}`,
              categoria: deriveLegacyCategory(defaultFam?.nombre),
              precioCosto: cost,
              precioVenta: calc.precioVenta,
              preciosPorLista: calc.preciosPorLista,
              listasDePrecios: calc.listasDePrecios,
              stockActual: qty,
              stockMinimoAlerta: 3,
              unidadMedida: line.unidadMedida || 'UNIDAD',
              foto: '',
              publicarEnWeb: false,
              proveedoresNombres: invoice.proveedorNombre ? [invoice.proveedorNombre] : [],
            };
            nextHardwareMap.set(newH.id, newH);
            updatedHardwareToPersist.push(newH);
          }
        }
      });

      if (updatedHardwareToPersist.length > 0) {
        const hwRes = await apiSaveItemsStrict('hardware', updatedHardwareToPersist);
        if (hwRes.ok) {
          setHardwareProducts(Array.from(nextHardwareMap.values()));
        }
      }
    }

    showToast('Factura de compra confirmada en Supabase PostgreSQL.');
    return true;
  };

  const handleDeletePurchaseInvoice = (id: string) => {
    const target = purchaseInvoices.find(i => i.id === id);
    const label = target ? `Factura ${target.tipoComprobante} ${target.nroComprobanteCompleto} (${target.proveedorNombre})` : `Factura ID: ${id}`;
    setPendingDeleteConfirm({
      title: '¿Realmente desea eliminar esta Factura de Compra?',
      itemName: label,
      onConfirm: async () => {
        const res = await apiDeleteItemStrict('purchase_invoices', id);
        if (!res.ok) {
          showToast(res.error || 'No se pudo eliminar la factura de compra en Supabase.');
          return;
        }
        setPurchaseInvoices(prev => prev.filter(i => i.id !== id));
        showToast('Factura de compra eliminada y confirmada en Supabase.');
      }
    });
  };

  const handleSaveSupplierPayment = async (payment: SupplierPayment) => {
    const res = await apiSaveItemsStrict('supplier_payments', payment);
    if (!res.ok) {
      showToast(res.error || 'Error al guardar pago a proveedor en Supabase.');
      return;
    }
    setSupplierPayments(prev => [payment, ...prev]);
    showToast('Pago a proveedor confirmado en Supabase.');
  };

  const handleSaveProveedor = async (proveedor: Proveedor) => {
    const res = await apiSaveItemsStrict('proveedores', proveedor);
    if (!res.ok) {
      showToast(res.error || 'Error al guardar proveedor en Supabase.');
      return;
    }
    setProveedores(prev => {
      const exists = prev.some(p => p.id === proveedor.id);
      return exists ? prev.map(p => (p.id === proveedor.id ? proveedor : p)) : [proveedor, ...prev];
    });
    showToast('Proveedor confirmado en Supabase PostgreSQL.');
  };

  // Fuel Containers State (Contenedores, Facturas & Sub-vínculos Chulengo -> Máquinas)
  const [fuelContainers, setFuelContainers] = useState<FuelContainer[]>([]);

  const handleSaveFuelContainer = async (container: FuelContainer) => {
    const res = await apiSaveItemsStrict('fuel_containers', container);
    if (!res.ok) {
      showToast(res.error || 'Error al guardar contenedor de combustible en Supabase.');
      return;
    }
    setFuelContainers(prev => {
      const exists = prev.some(c => c.id === container.id);
      return exists ? prev.map(c => (c.id === container.id ? container : c)) : [container, ...prev];
    });
    showToast(`Contenedor ${container.codigo} guardado en Supabase PostgreSQL.`);
  };

  const handleDeleteFuelContainer = async (id: string) => {
    const res = await apiDeleteItemStrict('fuel_containers', id);
    if (!res.ok) {
      showToast(res.error || 'Error al eliminar contenedor de combustible en Supabase.');
      return;
    }
    setFuelContainers(prev => prev.filter(c => c.id !== id));
    showToast('Contenedor de combustible eliminado de Supabase.');
  };

  // Extended Rentals & Commercial states
  const [rentals, setRentals] = useState<RentalContract[]>([]);
  const rentalsRef = useRef<RentalContract[]>([]);
  useEffect(() => {
    rentalsRef.current = rentals;
  }, [rentals]);
  const [hardwareProducts, setHardwareProducts] = useState<HardwareProduct[]>([]);
  const [aridos, setAridos] = useState<AridoProduct[]>([]);
  const [soilServices, setSoilServices] = useState<SoilService[]>([]);
  const [userSession, setUserSession] = useState<UserSession | null>(() => loadUserSession());
  const pendingDeepLinkViewRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? (() => {
          const params = new URLSearchParams(window.location.search);
          const vista = (params.get('vista') || params.get('view') || '').toLowerCase();
          const appParam = (params.get('app') || '').toLowerCase();
          if (vista === 'bolsa' || vista === 'bolsa-documentos' || vista === 'documentos' || appParam === 'bolsa') {
            return 'bolsa-documentos';
          }
          return null;
        })()
      : null
  );
  
  // Navigation & UI states
  const [currentView, setCurrentView] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const vista = (params.get('vista') || params.get('view') || '').toLowerCase();
      const appParam = (params.get('app') || '').toLowerCase();
      if (appParam === 'chofer' || params.get('mode') === 'driver' || vista === 'chofer') {
        return 'portal-chofer';
      }
      if (vista === 'web' || params.get('site') === 'public') {
        return 'sitio-publico';
      }
      const existingSession = loadUserSession();
      if (existingSession && (vista === 'bolsa' || vista === 'bolsa-documentos' || vista === 'documentos' || appParam === 'bolsa')) {
        return 'bolsa-documentos';
      }
    }
    const session = loadUserSession();
    return session ? getDefaultViewForUser(session) : 'sitio-publico';
  });
  const [activeCommercialScope, setActiveCommercialScope] = useState<CommercialModuleScope>(() =>
    currentView === 'ferreteria' || currentView === 'caja_diaria' ? 'VENTAS_SALON' : 'ALQUILERES'
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isSubmenuCollapsed, setIsSubmenuCollapsed] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const session = loadUserSession();
    if (session) return false;
    const params = new URLSearchParams(window.location.search);
    const vista = (params.get('vista') || params.get('view') || '').toLowerCase();
    const appParam = (params.get('app') || '').toLowerCase();
    return vista === 'bolsa' || vista === 'bolsa-documentos' || vista === 'documentos' || appParam === 'bolsa';
  });
  const [isTelemetryModalOpen, setIsTelemetryModalOpen] = useState<boolean>(false);
  const [isSiteSettingsModalOpen, setIsSiteSettingsModalOpen] = useState<boolean>(false);
  const [siteSettingsInitialTab, setSiteSettingsInitialTab] = useState<'logo' | 'usuarios' | 'contacto' | 'textos' | 'servicios' | 'secciones' | 'equipos'>('logo');

  const handleOpenSiteSettings = (tab?: 'logo' | 'usuarios' | 'contacto' | 'textos' | 'servicios' | 'secciones' | 'equipos') => {
    const resolvedTab = tab || 'logo';
    if (currentView === 'sitio-publico') {
      setSiteSettingsInitialTab(resolvedTab);
      setIsSiteSettingsModalOpen(true);
    } else {
      const tabToView: Record<string, string> = {
        usuarios: 'config-usuarios',
        logo: 'config-web-logo',
        contacto: 'config-web-contacto',
        textos: 'config-web-textos',
        servicios: 'config-web-servicios',
        secciones: 'config-web-secciones',
        equipos: 'config-web-equipos',
      };
      setCurrentView(tabToView[resolvedTab] || 'config-web-logo');
    }
  };
  
  // Vehicle Modals
  const [isCreateVehicleModalOpen, setIsCreateVehicleModalOpen] = useState<boolean>(false);
  const [vehicleToEdit, setVehicleToEdit] = useState<Vehicle | null>(null);
  const [selectedVehicleForDetail, setSelectedVehicleForDetail] = useState<Vehicle | null>(null);
  const [selectedVehicleCodeForAnalytics, setSelectedVehicleCodeForAnalytics] = useState<string | null>(null);

  // Driver / Employee Modals
  const [isCreateDriverModalOpen, setIsCreateDriverModalOpen] = useState<boolean>(false);
  const [driverToEdit, setDriverToEdit] = useState<Employee | null>(null);
  const [selectedDriverForDetail, setSelectedDriverForDetail] = useState<Employee | null>(null);

  // Fuel Deposit Modals (Modalidades: Ambulante, Bidones, Vales)
  const [isCreateFuelDepositModalOpen, setIsCreateFuelDepositModalOpen] = useState<boolean>(false);
  const [fuelDepositToEdit, setFuelDepositToEdit] = useState<FuelDeposit | null>(null);
  const [selectedFuelDepositForDetail, setSelectedFuelDepositForDetail] = useState<FuelDeposit | null>(null);
  const [fuelDepositToRefill, setFuelDepositToRefill] = useState<FuelDeposit | null>(null);
  const [refillModalInitialTab, setRefillModalInitialTab] = useState<'refill' | 'adjustment'>('refill');
  const [isRefillModalOpen, setIsRefillModalOpen] = useState<boolean>(false);
  const [preselectedDepositForVoucher, setPreselectedDepositForVoucher] = useState<FuelDeposit | null>(null);

  // Fuel Dispensary (Expendio de Combustible - 22 Columnas) Modals
  const [isCreateFuelVoucherModalOpen, setIsCreateFuelVoucherModalOpen] = useState<boolean>(false);
  const [fuelVoucherToEdit, setFuelVoucherToEdit] = useState<FuelDispensary | null>(null);
  const [selectedFuelVoucherForDetail, setSelectedFuelVoucherForDetail] = useState<FuelDispensary | null>(null);
  const [initialVoucherIdForExpendio, setInitialVoucherIdForExpendio] = useState<string | null>(null);

  // Issued Fuel Vouchers (Vales de Combustible - Emisión & Circuito) Modals
  const [isCreateIssuedVoucherModalOpen, setIsCreateIssuedVoucherModalOpen] = useState<boolean>(false);
  const [issuedVoucherToEdit, setIssuedVoucherToEdit] = useState<IssuedFuelVoucher | null>(null);
  const [selectedIssuedVoucherForDetail, setSelectedIssuedVoucherForDetail] = useState<IssuedFuelVoucher | null>(null);

  // Partes Diarios States & Modals (Supabase PostgreSQL como única fuente de verdad)
  const [partesDiarios, setPartesDiarios] = useState<ParteDiario[]>([]);
  const partesDiariosRef = useRef<ParteDiario[]>([]);
  useEffect(() => {
    partesDiariosRef.current = partesDiarios;
  }, [partesDiarios]);
  const [isCreateParteModalOpen, setIsCreateParteModalOpen] = useState<boolean>(false);
  const [parteToEdit, setParteToEdit] = useState<ParteDiario | null>(null);
  const [selectedParteForDetail, setSelectedParteForDetail] = useState<ParteDiario | null>(null);

  // Rendimientos de Camiones y Máquinas (Supabase PostgreSQL truck_performance_trips)
  const [truckPerformanceTrips, setTruckPerformanceTrips] = useState<TruckPerformanceTrip[]>([]);
  const [isLoadingRendimientos, setIsLoadingRendimientos] = useState<boolean>(false);

  // Obras States & Modals
  const [obras, setObras] = useState<Obra[]>([]);
  const obrasRef = useRef<Obra[]>([]);
  useEffect(() => {
    obrasRef.current = obras;
  }, [obras]);
  const [isCreateObraModalOpen, setIsCreateObraModalOpen] = useState<boolean>(false);
  const [obraToEdit, setObraToEdit] = useState<Obra | null>(null);
  const [defaultClientForNewObra, setDefaultClientForNewObra] = useState<ClientRecord | null>(null);
  const [selectedObraForDetail, setSelectedObraForDetail] = useState<Obra | null>(null);
  const [selectedObraInitialTab, setSelectedObraInitialTab] = useState<
    'info' | 'valorizado' | 'facturas' | 'contenedores' | 'personal' | 'combustible' | 'costos' | 'partes'
  >('info');

  // Pizarra de Ubicación / Despacho State (Supabase PostgreSQL system_settings)
  const [dispatchBoardState, setDispatchBoardState] = useState<DispatchBoardState>(() => createInitialDispatchBoardState());
  const [isSavingDispatchBoard, setIsSavingDispatchBoard] = useState<boolean>(false);
  const [dispatchBoardSaveError, setDispatchBoardSaveError] = useState<string | null>(null);

  // Bolsa de Documentos (Módulo Documentos - Supabase PostgreSQL + Cloudflare R2)
  const [bolsaDocumentos, setBolsaDocumentos] = useState<DocumentBagItem[]>([]);
  const bolsaDocumentosRef = useRef<DocumentBagItem[]>([]);
  useEffect(() => {
    bolsaDocumentosRef.current = bolsaDocumentos;
  }, [bolsaDocumentos]);

  // Other Modals
  const [isColumnModalOpen, setIsColumnModalOpen] = useState<boolean>(false);
  const [isCalculatorModalOpen, setIsCalculatorModalOpen] = useState<boolean>(false);
  const [importExportModalState, setImportExportModalState] = useState<{
    isOpen: boolean;
    entityType: EntityType;
  }>({
    isOpen: false,
    entityType: 'flota'
  });
  const [sheetConnectorEntity, setSheetConnectorEntity] = useState<SheetSyncEntity | null>(null);
  const [linkedSheetConfigs, setLinkedSheetConfigs] = useState<
    Partial<Record<SheetSyncEntity, OperationalSheetConfig>>
  >({});
  // Database & Storage Modal
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState<boolean>(false);
  const [isClearRecordsModalOpen, setIsClearRecordsModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState<{
    title?: string;
    itemName: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  const [isInitialDbLoaded, setIsInitialDbLoaded] = useState(false);

  // Dynamic calculation of overdue/upcoming services count for fleet
  const alertasServicesCount = useMemo(() => {
    return fleet.filter(v => {
      const vServices = servicesLogs.filter(s => s.equipoId === v.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const last = vServices[0];
      const currentUnit = (v.odometro && v.odometro > 0) ? 'KMS' : 'HORAS';
      const current = currentUnit === 'KMS' ? (v.odometro || 0) : (v.horometro || 0);
      let target: number;
      if (last && last.proximoServiceHorometro && last.proximoServiceHorometro > 0) {
        target = last.proximoServiceHorometro;
      } else if (last && last.horometroOdometro > 0) {
        target = last.horometroOdometro + (currentUnit === 'KMS' ? 10000 : 250);
      } else {
        target = current > 0 ? current + (currentUnit === 'KMS' ? 10000 : 250) : (currentUnit === 'KMS' ? 10000 : 250);
      }
      return (target - current) <= (currentUnit === 'KMS' ? 1000 : 50);
    }).length;
  }, [fleet, servicesLogs]);

  type CloudGroupKey =
    | 'public'
    | 'core_erp'
    | 'partes'
    | 'fuel'
    | 'stock'
    | 'maintenance'
    | 'billing'
    | 'quotations'
    | 'purchases'
    | 'dispatch'
    | 'attendance_logs'
    | 'rendimientos';

  const loadedCloudGroupsRef = useRef<Set<CloudGroupKey>>(new Set());
  const inFlightCloudGroupsRef = useRef<Map<CloudGroupKey, Promise<void>>>(new Map());

  const getRequiredGroupsForView = (view: string, hasSession: boolean): CloudGroupKey[] => {
    if (!hasSession) {
      if (view === 'portal-chofer') {
        return ['public', 'core_erp', 'partes'];
      }
      // Visitante del sitio público o pantalla de login: solo catálogo y textos públicos
      return ['public'];
    }

    switch (view) {
      case 'bolsa-documentos':
        return ['public', 'core_erp', 'partes', 'fuel', 'purchases', 'billing'];
      case 'portal-chofer':
        return ['public', 'core_erp', 'partes'];
      case 'asistencia':
      case 'sueldos':
        return ['public', 'core_erp', 'partes', 'attendance_logs'];
      case 'choferes':
        return ['public', 'core_erp', 'attendance_logs'];
      case 'partes-diarios':
        return ['public', 'core_erp', 'partes', 'fuel', 'billing'];
      case 'rendimientos':
        return ['public', 'core_erp', 'fuel', 'rendimientos'];
      case 'combustible':
      case 'vales':
      case 'depositos':
      case 'costos-combustible':
      case 'tipos-combustible':
        return ['public', 'core_erp', 'fuel'];
      case 'contenedores-combustible':
        return ['public', 'core_erp', 'fuel', 'purchases'];
      case 'flota':
        return ['public', 'core_erp', 'maintenance', 'dispatch'];
      case 'services':
      case 'alertas-mantenimiento':
      case 'costos-maquinaria':
      case 'gastos-taller':
      case 'multas-taller':
        return ['public', 'core_erp', 'maintenance', 'stock', 'fuel'];
      case 'obras':
        return ['public', 'core_erp', 'partes', 'fuel', 'stock', 'maintenance', 'billing', 'quotations', 'purchases', 'dispatch'];
      case 'compras':
        return ['public', 'core_erp', 'purchases', 'stock', 'billing', 'fuel'];
      case 'proveedores':
        return ['public', 'core_erp', 'purchases'];
      case 'clientes':
      case 'arca':
      case 'cobranzas':
        return ['public', 'core_erp', 'partes', 'billing', 'quotations', 'purchases'];
      case 'remitos':
        return ['public', 'core_erp', 'billing', 'quotations'];
      case 'cartera-cheques':
      case 'plan-cuentas':
      case 'caja_diaria':
        return ['public', 'core_erp', 'billing', 'purchases'];
      case 'cotizador':
        return ['public', 'core_erp', 'quotations', 'billing'];
      case 'alquileres':
        return ['public', 'core_erp', 'partes', 'fuel', 'quotations', 'billing'];
      case 'ferreteria':
        return ['public', 'core_erp', 'purchases'];
      case 'aridos':
      case 'stock':
        return ['public', 'core_erp', 'stock'];
      case 'programacion-audio':
        return ['public', 'core_erp', 'partes', 'dispatch'];
      case 'pizarra-despacho':
        return ['public', 'core_erp', 'dispatch'];
      default:
        return ['public', 'core_erp'];
    }
  };

  const fetchCloudGroup = async (group: CloudGroupKey): Promise<void> => {
    const failedCollections: string[] = [];

    if (group === 'public') {
      const [v, h, a, cloudServices] = await Promise.all([
        apiFetchCollection<Vehicle>('vehicles'),
        syncHardwareFromCloud(),
        syncAridosFromCloud(),
        syncSoilServicesFromCloud(),
        syncSiteSettingsFromCloud(),
      ]);
      if (v !== null && Array.isArray(v)) setFleet(v); else failedCollections.push('Flota');
      if (h !== null && Array.isArray(h)) setHardwareProducts(h);
      if (a !== null && Array.isArray(a)) setAridos(a);
      if (cloudServices !== null && Array.isArray(cloudServices)) setSoilServices(cloudServices);
    } else if (group === 'core_erp') {
      // Lean core startup group (excludes multi-MB partes_diarios & fuel_vouchers which load lazily per module)
      const [
        d, o, dep, r,
        _users, _prices, _colCfgs, _arcaCfg, cloudBolsaDocs,
        supUsers, supCats,
        maintCfg,
        stWhsCore,
        cloudClientsCore,
      ] = await Promise.all([
        apiFetchCollection<Employee>('drivers'),
        apiFetchCollection<Obra>('obras'),
        apiFetchCollection<FuelDeposit>('fuel_deposits'),
        syncRentalsFromCloud(),
        syncSystemUsersFromCloud(),
        syncFuelPricesFromCloud(),
        syncAllColumnConfigsFromCloud(),
        syncArcaConfigFromCloud(),
        apiFetchSetting<DocumentBagItem[]>('bolsa_documentos_items'),
        fetchSupabaseUsuarios().catch(() => null),
        fetchSupabaseCategorias().catch(() => null),
        fetchOperationalSheetConfigFromDb('maintenance_sheets_config').catch(() => null),
        apiFetchCollection<StockWarehouse>('stock_warehouses'),
        apiFetchCollection<ClientRecord>('clients'),
      ]);

      if (o !== null && Array.isArray(o)) setObras(o); else failedCollections.push('Obras');
      if (dep !== null && Array.isArray(dep)) {
        setFuelDeposits(prev => (fuelVouchers.length > 0 ? reconcileDepositStocks(dep, fuelVouchers) : dep));
      } else {
        failedCollections.push('Depósitos Combustible');
      }
      if (r !== null && Array.isArray(r)) setRentals(r);
      if (Array.isArray(cloudBolsaDocs)) setBolsaDocumentos(cloudBolsaDocs);
      if (stWhsCore !== null && Array.isArray(stWhsCore)) setStockWarehouses(ensureIndumentariaWarehouse(stWhsCore));
      if (cloudClientsCore !== null && Array.isArray(cloudClientsCore)) {
        setClients(cloudClientsCore);
        setClientsCount(cloudClientsCore.length);
      }
      setFleetColumnConfig(loadFleetColumnConfig());

      if (Array.isArray(supUsers)) setSupabaseUsuarios(supUsers);
      if (Array.isArray(supCats)) setSupabaseCategorias(supCats);

      if (d !== null && Array.isArray(d)) {
        const mergedDrivers = Array.isArray(supUsers)
          ? convertSupabaseUsersToEmployees(supUsers, d)
          : d;
        setDrivers(mergedDrivers);
      } else {
        failedCollections.push('Personal');
      }

      if (_users && Array.isArray(_users) && _users.length > 0) {
        syncActiveSessionFromUsersList(_users);
      }

      if (maintCfg) {
        setLinkedSheetConfigs(prev => ({ ...prev, gastosMantenimiento: maintCfg }));
      }
    } else if (group === 'partes') {
      const [p, partesCfg] = await Promise.all([
        apiFetchCollection<ParteDiario>('partes_diarios'),
        fetchOperationalSheetConfigFromDb('partes_sheets_config').catch(() => null),
      ]);
      if (p !== null && Array.isArray(p)) setPartesDiarios(p); else failedCollections.push('Partes Diarios');
      if (partesCfg) {
        setLinkedSheetConfigs(prev => ({ ...prev, partesDiarios: partesCfg }));
      }
    } else if (group === 'fuel') {
      const [f, dep, iss, fCont, fuelCfg, valesCfg] = await Promise.all([
        apiFetchCollection<FuelDispensary>('fuel_vouchers'),
        apiFetchCollection<FuelDeposit>('fuel_deposits'),
        apiFetchCollection<IssuedFuelVoucher>('issued_vouchers'),
        apiFetchCollection<FuelContainer>('fuel_containers'),
        fetchOperationalSheetConfigFromDb('fuel_sheets_config').catch(() => null),
        fetchOperationalSheetConfigFromDb('vales_sheets_config').catch(() => null),
      ]);
      if (f !== null && Array.isArray(f)) setFuelVouchers(f); else failedCollections.push('Combustible');
      const depositsSource = (dep !== null && Array.isArray(dep)) ? dep : fuelDepositsRef.current;
      if (depositsSource.length > 0) {
        const vouchersToUse = (f !== null && Array.isArray(f)) ? f : [];
        setFuelDeposits(reconcileDepositStocks(depositsSource, vouchersToUse));
      }
      if (iss !== null && Array.isArray(iss)) setIssuedVouchers(iss); else failedCollections.push('Vales');
      if (fCont !== null && Array.isArray(fCont)) setFuelContainers(fCont);
      if (fuelCfg || valesCfg) {
        setLinkedSheetConfigs(prev => ({
          ...prev,
          ...(fuelCfg ? { expendio: fuelCfg } : {}),
          ...(valesCfg ? { vales: valesCfg } : {}),
        }));
      }
    } else if (group === 'stock') {
      const [stItems, stMovs, stCats, stWhs] = await Promise.all([
        apiFetchCollection<StockItem>('stock_items'),
        apiFetchCollection<StockMovement>('stock_movements'),
        apiFetchCollection<StockCategoryCustom>('stock_categories'),
        apiFetchCollection<StockWarehouse>('stock_warehouses'),
      ]);
      if (stItems !== null && Array.isArray(stItems)) setStockItems(ensureIndumentariaItems(stItems));
      if (stMovs !== null && Array.isArray(stMovs)) setStockMovements(stMovs);
      if (stCats !== null && Array.isArray(stCats)) setStockCategories(ensureIndumentariaCategories(stCats));
      if (stWhs !== null && Array.isArray(stWhs)) setStockWarehouses(ensureIndumentariaWarehouse(stWhs));
    } else if (group === 'maintenance') {
      const [srvLogs, expLogs] = await Promise.all([
        apiFetchCollection<VehicleServiceLog>('vehicle_services'),
        apiFetchCollection<VehicleExpenseLog>('vehicle_expenses'),
      ]);
      if (srvLogs !== null && Array.isArray(srvLogs)) setServicesLogs(srvLogs);
      if (expLogs !== null && Array.isArray(expLogs)) setExpensesLogs(expLogs); else failedCollections.push('Mantenimiento');
    } else if (group === 'billing') {
      const [arcaLogs, cloudReceipts, cajaLogs, cloudClients, cloudAccAccounts, cloudAccEntries, cloudCheques] = await Promise.all([
        apiFetchCollection<ArcaInvoice>('arca_invoices'),
        apiFetchCollection<CustomerPaymentReceipt>('customer_receipts'),
        apiFetchCollection<CajaDiariaSession>('caja_diaria'),
        apiFetchCollection<any>('clients'),
        apiFetchCollection<AccountingAccount>('accounting_accounts'),
        apiFetchCollection<AccountingEntry>('accounting_entries'),
        apiFetchCollection<ChequeCarteraItem>('cheques_cartera'),
        syncInvoiceTemplateLayoutFromCloud(),
      ]);
      if (arcaLogs !== null && Array.isArray(arcaLogs)) setArcaInvoices(arcaLogs);
      if (cloudReceipts !== null && Array.isArray(cloudReceipts)) setCustomerReceipts(cloudReceipts);
      if (cajaLogs !== null && Array.isArray(cajaLogs)) setCajaSessions(cajaLogs);
      if (cloudClients !== null && Array.isArray(cloudClients)) {
        setClients(cloudClients);
        setClientsCount(cloudClients.length);
      }
      if (cloudAccAccounts !== null && Array.isArray(cloudAccAccounts)) setAccountingAccounts(cloudAccAccounts);
      if (cloudAccEntries !== null && Array.isArray(cloudAccEntries)) setAccountingEntries(cloudAccEntries);
      if (cloudCheques !== null && Array.isArray(cloudCheques)) setChequesCartera(cloudCheques);
    } else if (group === 'quotations') {
      const [quotLogs] = await Promise.all([
        apiFetchCollection<Quotation>('quotations'),
        syncQuotationTemplateLayoutFromCloud(),
      ]);
      if (quotLogs !== null && Array.isArray(quotLogs)) setQuotations(quotLogs);
    } else if (group === 'purchases') {
      const [cloudPurchases, cloudPayments, cloudProvs] = await Promise.all([
        apiFetchCollection<PurchaseInvoice>('purchase_invoices'),
        apiFetchCollection<SupplierPayment>('supplier_payments'),
        apiFetchCollection<Proveedor>('proveedores'),
      ]);
      if (cloudPurchases !== null && Array.isArray(cloudPurchases)) setPurchaseInvoices(cloudPurchases);
      if (cloudPayments !== null && Array.isArray(cloudPayments)) setSupplierPayments(cloudPayments);
      if (cloudProvs !== null && Array.isArray(cloudProvs)) setProveedores(cloudProvs);
    } else if (group === 'dispatch') {
      const cloudDispatchBoard = await apiFetchSetting<DispatchBoardState>('dispatch_board_state');
      if (cloudDispatchBoard && typeof cloudDispatchBoard === 'object') {
        setDispatchBoardState({
          places: Array.isArray(cloudDispatchBoard.places) ? cloudDispatchBoard.places : createInitialDispatchBoardState().places,
          assignments: Array.isArray(cloudDispatchBoard.assignments) ? cloudDispatchBoard.assignments : [],
          dailySegments: Array.isArray(cloudDispatchBoard.dailySegments) ? cloudDispatchBoard.dailySegments : [],
          history: Array.isArray(cloudDispatchBoard.history) ? cloudDispatchBoard.history : [],
          hiddenObraIds: Array.isArray(cloudDispatchBoard.hiddenObraIds) ? cloudDispatchBoard.hiddenObraIds : [],
          hiddenEmployeeIds: Array.isArray(cloudDispatchBoard.hiddenEmployeeIds) ? cloudDispatchBoard.hiddenEmployeeIds : [],
          hiddenVehicleIds: Array.isArray(cloudDispatchBoard.hiddenVehicleIds) ? cloudDispatchBoard.hiddenVehicleIds : [],
          updatedAt: cloudDispatchBoard.updatedAt || new Date().toISOString(),
        });
      }
    } else if (group === 'attendance_logs') {
      setIsSupabaseLoading(true);
      try {
        const [regs, users, lics, secs, emps, cats] = await Promise.all([
          fetchSupabaseRegistros({ daysBack: 60, limit: 1200 }),
          fetchSupabaseUsuarios(),
          fetchSupabaseLicencias(),
          fetchSupabaseSectores(),
          fetchSupabaseEmpresas(),
          fetchSupabaseCategorias(),
        ]);
        setSupabaseRegistros(regs);
        setSupabaseUsuarios(users);
        setSupabaseLicencias(lics);
        setSupabaseSectores(secs);
        setSupabaseEmpresas(emps);
        setSupabaseCategorias(cats);
      } catch (err: any) {
        console.warn('Error cargando fichadas de asistencia desde Supabase:', err);
      } finally {
        setIsSupabaseLoading(false);
      }
    } else if (group === 'rendimientos') {
      setIsLoadingRendimientos(true);
      try {
        const res = await apiFetchCollection<TruckPerformanceTrip>('truck_performance_trips');
        if (res !== null && Array.isArray(res)) {
          setTruckPerformanceTrips(res);
        } else {
          failedCollections.push('Rendimientos');
        }
      } finally {
        setIsLoadingRendimientos(false);
      }
    }

    loadedCloudGroupsRef.current.add(group);
    if (failedCollections.length > 0) {
      showToast(`Error consultando Supabase PostgreSQL (${failedCollections.join(', ')}). Reintentá o revisá la conexión.`);
    }
  };

  const ensureCloudGroups = async (groups: CloudGroupKey[], forceRefresh = false): Promise<void> => {
    const tasks = groups.map(group => {
      if (!forceRefresh && loadedCloudGroupsRef.current.has(group)) {
        return Promise.resolve();
      }
      const existingPromise = inFlightCloudGroupsRef.current.get(group);
      if (!forceRefresh && existingPromise) {
        return existingPromise;
      }
      const runPromise = fetchCloudGroup(group).finally(() => {
        if (inFlightCloudGroupsRef.current.get(group) === runPromise) {
          inFlightCloudGroupsRef.current.delete(group);
        }
      });
      inFlightCloudGroupsRef.current.set(group, runPromise);
      return runPromise;
    });
    await Promise.all(tasks);
  };

  // Load / Re-sync from Supabase Cloud (única fuente de verdad, en vivo y sin caché local)
  const loadFromSupabaseCloud = async (forceAll = false) => {
    try {
      const targetGroups: CloudGroupKey[] = forceAll
        ? ['public', 'core_erp', 'partes', 'fuel', 'stock', 'maintenance', 'billing', 'quotations', 'purchases', 'dispatch']
        : Array.from(
            new Set([
              ...Array.from(loadedCloudGroupsRef.current),
              ...getRequiredGroupsForView(currentView, Boolean(userSession)),
            ])
          );
      await ensureCloudGroups(targetGroups, true);
    } catch (err: any) {
      showToast(`Error de conexión con Supabase PostgreSQL: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsInitialDbLoaded(true);
    }
  };

  // Dynamic SEO title & OpenGraph update based on active view
  useEffect(() => {
    const titles: Record<string, string> = {
      'sitio-publico': 'La Hormiga - Alquileres, Maquinaria & Ferretería',
      'flota': 'Flota Vehicular & Equipos Viales | La Hormiga ERP',
      'combustible': 'Control de Combustible & Vales | La Hormiga ERP',
      'contenedores-combustible': 'Contenedores de Combustible, Facturas & Sub-vínculos | La Hormiga ERP',
      'programacion-audio': 'Programación del Día por Audio (WhatsApp Baileys) | La Hormiga ERP',
      'pizarra-despacho': 'Pizarra de Ubicación & Despacho | La Hormiga ERP',
      'partes-diarios': 'Partes Diarios de Obra | La Hormiga ERP',
      'alquileres': 'Gestión de Alquileres de Equipos | La Hormiga ERP',
      'cotizador': 'Cotizador & Presupuestos A4 | La Hormiga ERP',
      'ferreteria': 'Ferretería Industrial | La Hormiga ERP',
      'aridos': 'Venta y Despacho de Áridos | La Hormiga ERP',
      'choferes': 'Nómina de Personal & Choferes | La Hormiga ERP',
      'obras': 'Gestión de Obras & Clientes | La Hormiga ERP',
      'asistencia': 'Control de Asistencia & RRHH | La Hormiga',
      'portal-chofer': 'Portal Chofer & Vales Digitales | La Hormiga',
      'compras': 'Compras & Proveedores | La Hormiga ERP',
      'proveedores': 'Padrón de Proveedores | La Hormiga ERP',
      'clientes': 'Padrón de Clientes | La Hormiga ERP',
      'cobranzas': 'Cobranzas & Bajada de Facturas | La Hormiga ERP',
      'cartera-cheques': 'Cartera de Cheques & E-Cheq | La Hormiga ERP',
      'plan-cuentas': 'Plan de Cuentas & Bancos | La Hormiga ERP',
      'caja_diaria': 'Caja Diaria & Arqueo | La Hormiga ERP',
      'bolsa-documentos': 'Bolsa de Documentos | La Hormiga ERP',
      'config-usuarios': 'Usuarios & Permisos | La Hormiga ERP',
      'config-web-logo': 'Configuración Web: Logo | La Hormiga ERP',
      'config-web-contacto': 'Configuración Web: Contacto | La Hormiga ERP',
      'config-web-textos': 'Configuración Web: Textos CMS | La Hormiga ERP',
      'config-web-servicios': 'Configuración Web: Servicios | La Hormiga ERP',
      'config-web-secciones': 'Configuración Web: Secciones | La Hormiga ERP',
      'config-web-equipos': 'Configuración Web: Equipos | La Hormiga ERP',
    };

    const newTitle = titles[currentView] || 'La Hormiga - Alquileres, Maquinaria & Ferretería';
    document.title = newTitle;

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.setAttribute('content', newTitle);
    }
  }, [currentView]);

  // Carga en vivo bajo demanda según la vista actual y sesión activa (zero local cache)
  useEffect(() => {
    const needed = getRequiredGroupsForView(currentView, Boolean(userSession));
    ensureCloudGroups(needed)
      .catch(err => {
        showToast(`Error de conexión con Supabase PostgreSQL: ${err?.message || 'Error desconocido'}`);
      })
      .finally(() => {
        setIsInitialDbLoaded(true);
      });
  }, [currentView, userSession?.id]);

  // Cargar datos de combustible solo cuando se abre el sub-depósito de combustibles dentro de Depósitos
  useEffect(() => {
    if (userSession && currentView === 'stock' && selectedWarehouseId === 'FUEL_DEPOSITS') {
      ensureCloudGroups(['fuel']).catch(() => {});
    }
  }, [userSession?.id, currentView, selectedWarehouseId]);

  // Escuchar cambios de servicios en tiempo real desde el gestor de datos
  useEffect(() => {
    const handleServicesUpdate = (e: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setSoilServices(e.detail);
      } else {
        syncSoilServicesFromCloud().then(cloud => {
          if (cloud) setSoilServices(cloud);
        });
      }
    };
    window.addEventListener(SOIL_SERVICES_CHANGE_EVENT, handleServicesUpdate);
    return () => window.removeEventListener(SOIL_SERVICES_CHANGE_EVENT, handleServicesUpdate);
  }, []);

  // Cargar datos en vivo desde Supabase (Fichadas, Usuarios, Licencias, Sectores, Empresas, Categorías)
  const loadSupabaseData = async (options?: { fullHistory?: boolean }) => {
    setIsSupabaseLoading(true);
    try {
      const [regs, users, lics, secs, emps, cats, cloudDrivers] = await Promise.all([
        options?.fullHistory ? fetchSupabaseRegistros(4000) : fetchSupabaseRegistros({ daysBack: 60, limit: 1200 }),
        fetchSupabaseUsuarios(),
        fetchSupabaseLicencias(),
        fetchSupabaseSectores(),
        fetchSupabaseEmpresas(),
        fetchSupabaseCategorias(),
        syncDriversFromCloud()
      ]);
      setSupabaseRegistros(regs);
      setSupabaseUsuarios(users);
      setSupabaseLicencias(lics);
      setSupabaseSectores(secs);
      setSupabaseEmpresas(emps);
      setSupabaseCategorias(cats);
      loadedCloudGroupsRef.current.add('attendance_logs');

      const baseDrivers = (cloudDrivers && Array.isArray(cloudDrivers)) ? cloudDrivers : drivers;
      const deduplicatedDrivers = convertSupabaseUsersToEmployees(users || [], baseDrivers);
      setDrivers(deduplicatedDrivers);

      // Sincronizar hacia Supabase los empleados sin usuario en Supabase Auth/Usuarios si hay base real cargada
      if (deduplicatedDrivers.length > 0 && Array.isArray(users)) {
        const createdUsers = await syncLocalEmployeesToSupabase(deduplicatedDrivers, users);
        if (createdUsers.length > 0) {
          const refreshedUsers = await fetchSupabaseUsuarios();
          setSupabaseUsuarios(refreshedUsers);
          const finalSynced = convertSupabaseUsersToEmployees(refreshedUsers, deduplicatedDrivers);
          setDrivers(finalSynced);
          if (finalSynced.length > 0) {
            await apiSaveItemsStrict('drivers', finalSynced);
          }
        }
      }
    } catch (err: any) {
      console.warn('Error cargando datos de asistencia desde Supabase:', err);
      showToast(`Error cargando asistencia desde Supabase: ${err?.message || 'Error de conexión'}`);
    } finally {
      setIsSupabaseLoading(false);
    }
  };

  const handleSyncSupabaseUsersToEmployees = async (usersToSync: SupabaseUsuario[]) => {
    const updatedEmployees = convertSupabaseUsersToEmployees(usersToSync, drivers);
    if (updatedEmployees.length > 0) {
      const res = await apiSaveItemsStrict('drivers', updatedEmployees);
      if (!res.ok) {
        showToast(res.error || 'Error sincronizando empleados en Supabase PostgreSQL.');
        return;
      }
    }
    setDrivers(updatedEmployees);
    showToast(`Se sincronizaron y confirmaron ${usersToSync.length} empleados en Supabase.`);
  };

  useEffect(() => {
    const handleFvUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setFuelVouchers(e.detail);
      }
    };
    const handleIvUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setIssuedVouchers(e.detail);
      }
    };
    window.addEventListener('la_hormiga_fuel_vouchers_updated', handleFvUpdate);
    window.addEventListener('la_hormiga_issued_vouchers_updated', handleIvUpdate);
    return () => {
      window.removeEventListener('la_hormiga_fuel_vouchers_updated', handleFvUpdate);
      window.removeEventListener('la_hormiga_issued_vouchers_updated', handleIvUpdate);
    };
  }, []);

  const handleSaveObra = async (obra: Obra): Promise<boolean> => {
    const cleanObra: Obra = { ...obra };
    delete (cleanObra as any).esDetectadaDesdePartes;
    const res = await apiSaveItemsStrict('obras', cleanObra);
    if (!res.ok) {
      showToast(res.error || 'No se pudo guardar la obra en Supabase PostgreSQL.');
      return false;
    }
    setObras(prev => {
      const exists = prev.some(o => o.id === cleanObra.id);
      return exists ? prev.map(o => (o.id === cleanObra.id ? cleanObra : o)) : [cleanObra, ...prev];
    });
    if (selectedObraForDetail?.id === cleanObra.id) {
      setSelectedObraForDetail(cleanObra);
    }
    showToast(obraToEdit ? 'Obra actualizada y confirmada en Supabase.' : 'Nueva obra confirmada en Supabase.');
    return true;
  };

  const handleSaveDispatchBoard = async (nextState: DispatchBoardState): Promise<boolean> => {
    const previousState = dispatchBoardState;
    setDispatchBoardState(nextState);
    setIsSavingDispatchBoard(true);
    setDispatchBoardSaveError(null);
    const res = await apiSaveSettingStrict('dispatch_board_state', nextState);
    setIsSavingDispatchBoard(false);
    if (!res.ok) {
      setDispatchBoardState(previousState);
      const errMsg = res.error || 'No se pudo guardar la pizarra en Supabase.';
      setDispatchBoardSaveError(errMsg);
      showToast(errMsg);
      return false;
    }
    return true;
  };

  // --- Handlers for Bolsa de Documentos (Supabase PostgreSQL + Cloudflare R2) ---
  const saveBolsaDocumentosList = async (nextItems: DocumentBagItem[]): Promise<boolean> => {
    const previous = bolsaDocumentosRef.current;
    bolsaDocumentosRef.current = nextItems;
    setBolsaDocumentos(nextItems);
    const res = await apiSaveSettingStrict('bolsa_documentos_items', nextItems);
    if (!res.ok) {
      bolsaDocumentosRef.current = previous;
      setBolsaDocumentos(previous);
      showToast(res.error || 'No se pudo guardar la Bolsa de Documentos en Supabase.');
      return false;
    }
    return true;
  };

  const handleAddBolsaDocumentos = async (newItems: DocumentBagItem[]): Promise<boolean> => {
    const nextList = [...newItems, ...bolsaDocumentosRef.current];
    return saveBolsaDocumentosList(nextList);
  };

  const handleUpdateBolsaDocumento = async (updatedItem: DocumentBagItem): Promise<boolean> => {
    const nextList = bolsaDocumentosRef.current.map(d => (d.id === updatedItem.id ? updatedItem : d));
    return saveBolsaDocumentosList(nextList);
  };

  const handleDeleteBolsaDocumento = async (id: string): Promise<boolean> => {
    const nextList = bolsaDocumentosRef.current.filter(d => d.id !== id);
    const ok = await saveBolsaDocumentosList(nextList);
    if (ok) showToast('Foto eliminada de la Bolsa de Documentos.');
    return ok;
  };

  const handleUnlinkBolsaDocumento = async (docId: string): Promise<boolean> => {
    const target = bolsaDocumentosRef.current.find(d => d.id === docId);
    if (!target) return false;
    const updated: DocumentBagItem = {
      ...target,
      estado: 'PENDIENTE',
      linkedTargetType: undefined,
      linkedTargetId: undefined,
      linkedTargetLabel: undefined,
      linkedAt: undefined,
    };
    const ok = await handleUpdateBolsaDocumento(updated);
    if (ok) showToast('Documento desvinculado.');
    return ok;
  };

  // --- AI Document Analysis State & Handlers (Bolsa de Documentos -> Formularios Pre-llenados) ---
  const [analyzingBolsaDocId, setAnalyzingBolsaDocId] = useState<string | null>(null);
  const [activeBagDocForAi, setActiveBagDocForAi] = useState<DocumentBagItem | null>(null);
  const [aiPrefillParteDraft, setAiPrefillParteDraft] = useState<Partial<ParteDiario> | null>(null);
  const [aiPrefillFuelDraft, setAiPrefillFuelDraft] = useState<Partial<FuelDispensary> | null>(null);
  const [aiPrefillIssuedVoucherDraft, setAiPrefillIssuedVoucherDraft] = useState<Partial<IssuedFuelVoucher> | null>(null);
  const [aiInvoiceRemitoReview, setAiInvoiceRemitoReview] = useState<{
    mode: 'FACTURA' | 'REMITO';
    docItem: DocumentBagItem;
    aiData: Record<string, any>;
  } | null>(null);

  const markBagDocLinked = async (
    docItem: DocumentBagItem,
    targetType: DocumentBagLinkTargetType,
    targetId: string,
    targetLabel: string
  ) => {
    const latestDoc = bolsaDocumentosRef.current.find(d => d.id === docItem.id) || docItem;
    await handleUpdateBolsaDocumento({
      ...latestDoc,
      estado: 'VINCULADO',
      linkedTargetType: targetType,
      linkedTargetId: targetId,
      linkedTargetLabel: targetLabel,
      linkedAt: new Date().toISOString(),
    });
  };

  const handleAnalyzeBolsaDocumento = async (
    item: DocumentBagItem,
    overrideCategory?: Exclude<DocumentBagCategory, 'OTRO'>
  ) => {
    const effectiveCat = overrideCategory || item.categoria;
    if (effectiveCat === 'OTRO') {
      showToast('Elegí qué tipo de documento es la foto antes de analizar.');
      return;
    }

    setAnalyzingBolsaDocId(item.id);
    try {
      const res = await apiAnalyzeDocumentWithAI({
        documentType: effectiveCat,
        imageUrl: item.url,
        context: {
          vehicles: fleet.map(v => ({
            codigo: v.codigoInterno || v.codigo || v.id,
            modeloMarca: v.modeloMarca,
            patente: v.patente,
          })),
          drivers: drivers.map(d => ({
            codigo: d.codigoEmpleado,
            legajo: d.legajo,
            nombreApellido: d.nombreApellido,
          })),
          obras: obras.map(o => ({
            codigo: o.numero,
            nombreObra: o.nombreObra,
            ubicacion: o.ubicacion,
          })),
          proveedores: proveedores.map(p => ({
            id: p.id,
            razonSocial: p.razonSocial,
            cuit: p.cuit,
          })),
          deposits: fuelDeposits.map(d => ({
            id: d.id,
            nombre: d.nombreEstacion || d.nombre,
            empresaBandera: d.empresaBandera,
            numEstacion: d.numEstacionConvenio || d.codigo,
          })),
        },
      });

      if (!res.success || !res.data) {
        showToast(res.error || 'No se pudo analizar el documento con IA.');
        return;
      }

      const analyzedItem: DocumentBagItem = {
        ...item,
        categoria: effectiveCat,
        aiAnalyzedAt: new Date().toISOString(),
      };
      await handleUpdateBolsaDocumento(analyzedItem);
      setActiveBagDocForAi(analyzedItem);

      if (effectiveCat === 'PARTE_DIARIO') {
        setParteToEdit(null);
        setAiPrefillParteDraft(res.data as Partial<ParteDiario>);
        setIsCreateParteModalOpen(true);
      } else if (effectiveCat === 'COMBUSTIBLE') {
        setFuelVoucherToEdit(null);
        setPreselectedDepositForVoucher(null);
        setInitialVoucherIdForExpendio(null);
        setAiPrefillFuelDraft({
          ...(res.data as Partial<FuelDispensary>),
          fotoExpendio: analyzedItem.url,
        });
        setIsCreateFuelVoucherModalOpen(true);
      } else if (effectiveCat === 'VALE_COMBUSTIBLE') {
        setIssuedVoucherToEdit(null);
        setAiPrefillIssuedVoucherDraft({
          ...(res.data as Partial<IssuedFuelVoucher>),
          fotoTicket: analyzedItem.url,
        });
        setIsCreateIssuedVoucherModalOpen(true);
      } else if (effectiveCat === 'FACTURA' || effectiveCat === 'REMITO') {
        setAiInvoiceRemitoReview({
          mode: effectiveCat,
          docItem: analyzedItem,
          aiData: res.data,
        });
      }
    } finally {
      setAnalyzingBolsaDocId(null);
    }
  };

  const handleSaveObraLegajo = async (updatedObra: Obra): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/obras/${encodeURIComponent(updatedObra.id)}/legajo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedObra),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg = data?.error || `Error del servidor (${res.status}) al guardar legajo en Supabase`;
        showToast(msg);
        return { ok: false, error: msg };
      }
      const persisted: Obra = data.obra || updatedObra;
      obrasRef.current = obrasRef.current.some(o => o.id === persisted.id)
        ? obrasRef.current.map(o => (o.id === persisted.id ? persisted : o))
        : [persisted, ...obrasRef.current];
      setObras(prev =>
        prev.some(o => o.id === persisted.id)
          ? prev.map(o => (o.id === persisted.id ? persisted : o))
          : [persisted, ...prev]
      );
      if (selectedObraForDetail?.id === persisted.id) {
        setSelectedObraForDetail(persisted);
      }
      showToast('Legajo y costos de obra confirmados en Supabase PostgreSQL.');
      return { ok: true };
    } catch (err: any) {
      const msg = err?.message || 'Error de conexión al guardar en Supabase';
      showToast(msg);
      return { ok: false, error: msg };
    }
  };

  const handleArchiveObra = (obra: Obra) => {
    const isCurrentlyArchived = !!obra.archivado;
    setPendingDeleteConfirm({
      title: isCurrentlyArchived
        ? '¿Desea desarchivar esta obra?'
        : '¿Desea archivar esta obra?',
      itemName: `Obra "${obra.nombreObra}" (${obra.numero || obra.id} • ${obra.ubicacion || 'Sin ubicación'})`,
      description: isCurrentlyArchived
        ? 'La obra volverá a mostrarse en la vista principal de obras vigentes.'
        : 'La obra dejará de mostrarse en la vista principal de obras vigentes. Se conservarán intactos todos los registros históricos de partes diarios, horas trabajadas, viajes y presupuestos.',
      confirmLabel: isCurrentlyArchived ? 'Aceptar y Desarchivar' : 'Aceptar y Archivar',
      onConfirm: async () => {
        const updated: Obra = {
          ...obra,
          archivado: !isCurrentlyArchived,
          fechaArchivado: !isCurrentlyArchived ? new Date().toISOString() : undefined,
          activa: !isCurrentlyArchived ? false : true
        };
        delete (updated as any).esDetectadaDesdePartes;
        const res = await apiSaveItemsStrict('obras', updated);
        if (!res.ok) {
          showToast(res.error || 'No se pudo actualizar el archivado de la obra en Supabase.');
          return;
        }
        obrasRef.current = obrasRef.current.some(o => o.id === updated.id)
          ? obrasRef.current.map(o => (o.id === updated.id ? updated : o))
          : [updated, ...obrasRef.current];
        setObras(prev =>
          prev.some(o => o.id === updated.id)
            ? prev.map(o => (o.id === updated.id ? updated : o))
            : [updated, ...prev]
        );
        if (selectedObraForDetail?.id === updated.id) {
          setSelectedObraForDetail(updated);
        }
        showToast(isCurrentlyArchived
          ? `Obra "${obra.nombreObra}" reincorporada y confirmada en Supabase.`
          : `Obra "${obra.nombreObra}" archivada y confirmada en Supabase.`);
      }
    });
  };

  const handleDeleteObra = (id: string) => {
    const target = obras.find(o => o.id === id);
    setPendingDeleteConfirm({
      title: '¿Realmente desea eliminar esta Obra?',
      itemName: target ? `Obra "${target.nombreObra}" (${target.numero || id})` : `Obra ID: ${id}`,
      onConfirm: async () => {
        const res = await apiDeleteItemStrict('obras', id);
        if (!res.ok) {
          showToast(res.error || 'No se pudo eliminar la obra en Supabase PostgreSQL.');
          return;
        }
        setObras(prev => prev.filter(o => o.id !== id));
        showToast('Obra eliminada y confirmada en Supabase.');
      }
    });
  };

  const handleSaveParteDiario = async (parte: ParteDiario): Promise<{ ok: boolean; error?: string }> => {
    const previousParte = partesDiarios.find(p => p.id === parte.id);
    const isEdit = Boolean(parteToEdit) || Boolean(previousParte);
    const res = await apiSaveItemsStrict('partes_diarios', parte);
    if (!res.ok) {
      const msg = res.error || 'Error confirmando el parte diario en Supabase PostgreSQL.';
      showToast(msg);
      return { ok: false, error: msg };
    }
    setPartesDiarios(prev => {
      const exists = prev.some(p => p.id === parte.id);
      return exists ? prev.map(p => (p.id === parte.id ? parte : p)) : [parte, ...prev];
    });

    // Sincronizar bidireccionalmente partesDiariosIds en el Contrato de Alquiler vinculado (usando rentalsRef para evitar stale closures)
    const currentRentals = rentalsRef.current;
    const oldRentalId = previousParte?.rentalId || '';
    const newRentalId = parte.rentalId || '';
    if (oldRentalId !== newRentalId || (newRentalId && !(currentRentals.find(r => r.id === newRentalId)?.partesDiariosIds || []).includes(parte.id))) {
      const updatedRentalsToSave: RentalContract[] = [];
      if (oldRentalId && oldRentalId !== newRentalId) {
        const oldRental = currentRentals.find(r => r.id === oldRentalId);
        if (oldRental && (oldRental.partesDiariosIds || []).includes(parte.id)) {
          updatedRentalsToSave.push({
            ...oldRental,
            partesDiariosIds: (oldRental.partesDiariosIds || []).filter(pid => pid !== parte.id),
          });
        }
      }
      if (newRentalId) {
        const targetRental = currentRentals.find(r => r.id === newRentalId);
        if (targetRental && !(targetRental.partesDiariosIds || []).includes(parte.id)) {
          updatedRentalsToSave.push({
            ...targetRental,
            partesDiariosIds: Array.from(new Set([...(targetRental.partesDiariosIds || []), parte.id])),
          });
        }
      }
      for (const rToSave of updatedRentalsToSave) {
        await apiSaveItemsStrict('rentals', rToSave);
        rentalsRef.current = rentalsRef.current.map(r => (r.id === rToSave.id ? rToSave : r));
        setRentals(prev => prev.map(r => (r.id === rToSave.id ? rToSave : r)));
      }
    }

    if (activeBagDocForAi && !parteToEdit) {
      await markBagDocLinked(
        activeBagDocForAi,
        'PARTE_DIARIO',
        parte.id,
        `Parte #${parte.numParte || parte.id} · ${parte.codigoEquipo || parte.marcaModelo}`
      );
      setActiveBagDocForAi(null);
      setAiPrefillParteDraft(null);
    }

    showToast(isEdit ? 'Parte diario actualizado y confirmado en Supabase' : 'Nuevo parte diario confirmado en Supabase');
    return { ok: true };
  };

  const handleSavePartesDiariosBatch = async (updatedPartes: ParteDiario[]) => {
    const validUpdates = updatedPartes.filter(p => Boolean(p?.id));
    if (validUpdates.length === 0) return;
    const res = await apiSaveItemsStrict('partes_diarios', validUpdates);
    if (!res.ok) {
      showToast(res.error || 'Error al actualizar partes diarios en Supabase.');
      return;
    }
    setPartesDiarios(prev => {
      const mergedMap = new Map(prev.map(p => [p.id, p]));
      validUpdates.forEach(p => mergedMap.set(p.id, p));
      return Array.from(mergedMap.values());
    });
  };

  const handleDeleteParteDiario = (id: string) => {
    const target = partesDiarios.find(p => p.id === id);
    setPendingDeleteConfirm({
      title: '¿Realmente desea eliminar este Parte Diario?',
      itemName: target ? `Parte Nº ${target.numParte || id} (${target.fecha} • ${target.marcaModelo || target.codigoEquipo})` : `Parte Diario ID: ${id}`,
      onConfirm: async () => {
        const res = await apiDeleteItemStrict('partes_diarios', id);
        if (!res.ok) {
          showToast(res.error || 'No se pudo eliminar el parte diario de Supabase PostgreSQL.');
          return;
        }
        setPartesDiarios(prev => prev.filter(p => p.id !== id));
        showToast('Parte diario eliminado y confirmado en Supabase.');
      }
    });
  };

  const handleDeleteSelectedPartes = (ids: string[]) => {
    if (ids.length === 0) return;
    setPendingDeleteConfirm({
      title: '¿Realmente desea eliminar los Partes Diarios seleccionados?',
      itemName: `${ids.length} Parte(s) Diario(s) seleccionados`,
      onConfirm: async () => {
        const results = await Promise.all(
          ids.map(async (id) => ({ id, ...(await apiDeleteItemStrict('partes_diarios', id)) }))
        );
        const deletedIds = results.filter(r => r.ok).map(r => r.id);
        const failedCount = results.length - deletedIds.length;
        if (deletedIds.length > 0) {
          setPartesDiarios(prev => prev.filter(p => !deletedIds.includes(p.id)));
        }
        if (failedCount > 0) {
          const firstErr = results.find(r => !r.ok)?.error || 'Error eliminando en Supabase';
          showToast(`Se eliminaron ${deletedIds.length} partes, pero fallaron ${failedCount}: ${firstErr}`);
        } else {
          showToast(`${deletedIds.length} partes diarios eliminados y confirmados en Supabase.`);
        }
      }
    });
  };

  const handleSaveTruckPerformanceTrips = async (items: TruckPerformanceTrip[]): Promise<boolean> => {
    const valid = items.filter(t => Boolean(t?.id));
    if (valid.length === 0) return false;
    const res = await apiSaveItemsStrict('truck_performance_trips', valid);
    if (!res.ok) {
      showToast(res.error || 'Error guardando viaje(s) de rendimiento en Supabase PostgreSQL.');
      return false;
    }
    setTruckPerformanceTrips(prev => {
      const map = new Map(prev.map(item => [item.id, item]));
      valid.forEach(item => map.set(item.id, item));
      return Array.from(map.values()).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    });
    showToast(
      valid.length === 1
        ? 'Viaje de rendimiento guardado y confirmado en Supabase.'
        : `${valid.length} viajes guardados y confirmados en Supabase.`
    );
    return true;
  };

  const handleDeleteTruckPerformanceTrip = async (id: string): Promise<boolean> => {
    const res = await apiDeleteItemStrict('truck_performance_trips', id);
    if (!res.ok) {
      showToast(res.error || 'Error eliminando viaje de rendimiento en Supabase PostgreSQL.');
      return false;
    }
    setTruckPerformanceTrips(prev => prev.filter(item => item.id !== id));
    showToast('Viaje de rendimiento eliminado de Supabase.');
    return true;
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3800);
  };

  // --- Auth & Session Handlers ---
  const syncActiveSessionFromUsersList = (usersList: SystemUser[]) => {
    if (!userSession) return;
    const matched = usersList.find(
      u => u.id === userSession.id || u.username.toLowerCase() === userSession.username.toLowerCase()
    );
    if (!matched) return;
    if (!matched.activo) {
      clearUserSession();
      setUserSession(null);
      setCurrentView('sitio-publico');
      showToast('Tu cuenta de acceso fue desactivada por un administrador.');
      return;
    }
    const updatedSession: UserSession = {
      ...userSession,
      id: matched.id,
      username: matched.username,
      nombre: matched.nombre,
      rol: matched.rol,
      accesoTotal: matched.accesoTotal,
      permisos: matched.permisos,
    };
    const prevKey = JSON.stringify({
      rol: userSession.rol,
      nombre: userSession.nombre,
      accesoTotal: userSession.accesoTotal,
      permisos: userSession.permisos || [],
    });
    const nextKey = JSON.stringify({
      rol: updatedSession.rol,
      nombre: updatedSession.nombre,
      accesoTotal: updatedSession.accesoTotal,
      permisos: updatedSession.permisos || [],
    });
    if (prevKey !== nextKey) {
      setUserSession(updatedSession);
      saveUserSession(updatedSession);
    }
  };

  useEffect(() => {
    if (!userSession) return;
    if (currentView === 'sitio-publico' || currentView === 'sin-acceso') return;
    if (!hasViewAccess(userSession, currentView)) {
      setCurrentView(getDefaultViewForUser(userSession));
    }
  }, [userSession, currentView]);

  const handleLoginSuccess = (session: UserSession) => {
    loadedCloudGroupsRef.current.clear();
    loadedCloudGroupsRef.current.add('public');
    setUserSession(session);
    saveUserSession(session);
    setIsLoginModalOpen(false);
    showToast(`¡Bienvenido/a, ${session.nombre}!`);
    const intended = pendingDeepLinkViewRef.current;
    pendingDeepLinkViewRef.current = null;
    if (intended && hasViewAccess(session, intended)) {
      setCurrentView(intended);
    } else {
      setCurrentView(getDefaultViewForUser(session));
    }
  };

  const handleLogout = () => {
    loadedCloudGroupsRef.current.clear();
    loadedCloudGroupsRef.current.add('public');
    clearUserSession();
    setUserSession(null);
    setCurrentView('sitio-publico');
    showToast('Has salido al Sitio Web Comercial.');
  };

  // --- Handlers for Rental Actions ---
  const handleSaveRental = async (contract: RentalContract, linkedQuotationId?: string) => {
    const res = await apiSaveItemsStrict('rentals', contract);
    if (!res.ok) {
      showToast(res.error || 'No se pudo guardar el contrato de alquiler en Supabase.');
      return;
    }
    const existsInRef = rentalsRef.current.some(r => r.id === contract.id);
    rentalsRef.current = existsInRef
      ? rentalsRef.current.map(r => (r.id === contract.id ? contract : r))
      : [contract, ...rentalsRef.current];
    setRentals(prev => {
      const exists = prev.some(r => r.id === contract.id);
      return exists ? prev.map(r => (r.id === contract.id ? contract : r)) : [contract, ...prev];
    });
    if (contract.estado === 'ACTIVO' && contract.equipoId) {
      const targetVehicle = fleet.find(v => v.id === contract.equipoId);
      if (targetVehicle) {
        const updatedVehicle: Vehicle = { ...targetVehicle, estado: 'ALQUILADO' as VehicleStatus };
        const vRes = await apiSaveItemsStrict('vehicles', updatedVehicle);
        if (vRes.ok) {
          setFleet(prev => prev.map(v => (v.id === contract.equipoId ? updatedVehicle : v)));
        }
      }
    }
    const qIdToApprove = linkedQuotationId || contract.cotizacionId;
    if (qIdToApprove) {
      await handleMarkQuotationStatus(qIdToApprove, 'APROBADA');
    }
    showToast('Contrato de alquiler confirmado en Supabase PostgreSQL.');
  };

  const handleDeleteRental = (id: string) => {
    const target = rentals.find(r => r.id === id);
    setPendingDeleteConfirm({
      title: '¿Realmente desea eliminar este Contrato de Alquiler?',
      itemName: target ? `Contrato ${target.numeroContrato || id} (${target.equipoModelo} • ${target.clienteNombre})` : `Contrato ID: ${id}`,
      onConfirm: async () => {
        const res = await apiDeleteItemStrict('rentals', id);
        if (!res.ok) {
          showToast(res.error || 'No se pudo eliminar el contrato de alquiler en Supabase.');
          return;
        }
        setRentals(prev => prev.filter(r => r.id !== id));
        showToast('Contrato de alquiler eliminado y confirmado en Supabase.');
      }
    });
  };

  const handleFinalizeRental = async (id: string) => {
    const contract = rentals.find(r => r.id === id);
    const updatedContract: RentalContract = contract ? {
      ...contract,
      estado: 'FINALIZADO',
      fechaDevolucionReal: new Date().toISOString().slice(0, 10)
    } : { id, estado: 'FINALIZADO', fechaDevolucionReal: new Date().toISOString().slice(0, 10) } as RentalContract;

    const res = await apiSaveItemsStrict('rentals', updatedContract);
    if (!res.ok) {
      showToast(res.error || 'No se pudo finalizar el contrato de alquiler en Supabase.');
      return;
    }
    setRentals(prev => prev.map(r => (r.id === id ? updatedContract : r)));
    if (contract?.equipoId) {
      const targetVehicle = fleet.find(v => v.id === contract.equipoId);
      if (targetVehicle) {
        const updatedVehicle: Vehicle = { ...targetVehicle, estado: 'DISPONIBLE' as VehicleStatus };
        const vRes = await apiSaveItemsStrict('vehicles', updatedVehicle);
        if (vRes.ok) {
          setFleet(prev => prev.map(v => (v.id === contract.equipoId ? updatedVehicle : v)));
        }
      }
    }
    showToast('Contrato finalizado y confirmado en Supabase.');
  };

  // --- Handlers for Hardware Products ---
  const handleSaveHardwareProduct = async (prod: HardwareProduct) => {
    const res = await apiSaveItemsStrict('hardware', prod);
    if (!res.ok) {
      showToast(res.error || 'No se pudo guardar el artículo de ferretería en Supabase.');
      return;
    }
    setHardwareProducts(prev => {
      const exists = prev.some(p => p.id === prod.id);
      return exists ? prev.map(p => (p.id === prod.id ? prod : p)) : [prod, ...prev];
    });
    showToast('Artículo de ferretería confirmado en Supabase PostgreSQL.');
  };

  const handleSaveHardwareProductsBatch = async (prods: HardwareProduct[]) => {
    if (prods.length === 0) return;
    const res = await apiSaveItemsStrict('hardware', prods.length === 1 ? prods[0] : prods);
    if (!res.ok) {
      showToast(res.error || 'No se pudieron guardar los artículos en Supabase.');
      return;
    }
    setHardwareProducts(prev => {
      const map = new Map<string, HardwareProduct>();
      prev.forEach(p => map.set(p.id, p));
      prods.forEach(p => map.set(p.id, p));
      return Array.from(map.values());
    });
    showToast(
      prods.length === 1
        ? 'Artículo guardado y confirmado en Supabase.'
        : `${prods.length} artículos guardados y confirmados en Supabase.`
    );
  };

  const handleDeleteHardwareProduct = (id: string) => {
    const target = hardwareProducts.find(p => p.id === id);
    setPendingDeleteConfirm({
      title: '¿Realmente desea eliminar este Artículo de Ferretería?',
      itemName: target ? `${target.nombre} (Código: ${target.codigo})` : `Artículo ID: ${id}`,
      onConfirm: async () => {
        const res = await apiDeleteItemStrict('hardware', id);
        if (!res.ok) {
          showToast(res.error || 'No se pudo eliminar el artículo en Supabase.');
          return;
        }
        setHardwareProducts(prev => prev.filter(p => p.id !== id));
        showToast('Artículo eliminado y confirmado en Supabase.');
      }
    });
  };

  const handleClearHardwareProducts = () => {
    setPendingDeleteConfirm({
      title: '¿Realmente desea vaciar todo el Catálogo de Ferretería?',
      itemName: `Todos los ${hardwareProducts.length} artículos registrados en Ferretería`,
      onConfirm: async () => {
        const res = await apiClearCollectionStrict('hardware');
        if (!res.ok) {
          showToast(res.error || 'No se pudo vaciar el catálogo de ferretería en Supabase.');
          return;
        }
        setHardwareProducts([]);
        showToast('Catálogo de Ferretería vaciado y confirmado en Supabase.');
      }
    });
  };

  // --- Handlers for Vehicle Actions ---
  const handleOpenVehicleDetail = (vehicle: Vehicle) => {
    setSelectedVehicleForDetail(vehicle);
    setCurrentView('flota');
    if (userSession) {
      ensureCloudGroups(['partes', 'fuel', 'maintenance', 'purchases', 'billing', 'dispatch']).catch(() => {});
    }
  };

  const handleSaveVehicle = async (vehicle: Vehicle) => {
    const exists = fleet.some(v => v.id === vehicle.id);
    const res = await apiSaveItemsStrict('vehicles', vehicle);
    if (!res.ok) {
      showToast(res.error || 'No se pudo guardar el vehículo en Supabase PostgreSQL.');
      return;
    }
    setFleet(prev => (exists ? prev.map(v => (v.id === vehicle.id ? vehicle : v)) : [vehicle, ...prev]));
    setSelectedVehicleForDetail(prev => (prev && prev.id === vehicle.id ? vehicle : prev));
    showToast(exists ? `Vehículo ${vehicle.id} modificado y confirmado en Supabase.` : `Vehículo ${vehicle.id} dado de alta y confirmado en Supabase.`);
  };

  const handleArchiveVehicle = (vehicle: Vehicle) => {
    const isCurrentlyArchived = !!vehicle.archivado;
    setPendingDeleteConfirm({
      title: isCurrentlyArchived 
        ? '¿Desea desarchivar este vehículo?' 
        : '¿Desea archivar este vehículo?',
      itemName: `${vehicle.modeloMarca} (${vehicle.codigo || vehicle.id} • Patente: ${vehicle.patente || 'S/P'})`,
      description: isCurrentlyArchived
        ? 'El vehículo volverá a mostrarse en la vista principal de la flota activa de la empresa.'
        : 'El vehículo dejará de mostrarse en la vista principal de la flota activa (para equipos que ya no son de la empresa). Se conservarán intactos todos los registros históricos de mantenimientos, gastos, partes diarios, vales y contratos de alquiler.',
      confirmLabel: isCurrentlyArchived ? 'Aceptar y Desarchivar' : 'Aceptar y Archivar',
      onConfirm: async () => {
        const updated: Vehicle = {
          ...vehicle,
          archivado: !isCurrentlyArchived,
          fechaArchivado: !isCurrentlyArchived ? new Date().toISOString() : undefined,
          estado: !isCurrentlyArchived ? 'FUERA_DE_SERVICIO' : 'DISPONIBLE'
        };
        const res = await apiSaveItemsStrict('vehicles', updated);
        if (!res.ok) {
          showToast(res.error || 'No se pudo actualizar el archivado del vehículo en Supabase.');
          return;
        }
        setFleet(prev => prev.map(v => (v.id === vehicle.id ? updated : v)));
        if (selectedVehicleForDetail?.id === vehicle.id) {
          setSelectedVehicleForDetail(updated);
        }
        showToast(isCurrentlyArchived 
          ? `Vehículo ${vehicle.id} reincorporado y confirmado en Supabase.` 
          : `Vehículo ${vehicle.id} archivado y confirmado en Supabase.`);
      }
    });
  };

  const handleDeleteVehicle = (id: string) => {
    const vehicle = fleet.find(v => v.id === id);
    setPendingDeleteConfirm({
      title: '¿Realmente desea eliminar este Equipo / Vehículo?',
      itemName: vehicle ? `${vehicle.modeloMarca} (${vehicle.codigo || vehicle.id} • ${vehicle.patente || 'S/P'})` : `Equipo ID: ${id}`,
      onConfirm: async () => {
        const res = await apiDeleteItemStrict('vehicles', id);
        if (!res.ok) {
          showToast(res.error || 'No se pudo eliminar el vehículo en Supabase PostgreSQL.');
          return;
        }
        setFleet(prev => prev.filter(v => v.id !== id));
        setDrivers(prev => prev.map(d => d.vehiculoAsignadoId === id ? { ...d, vehiculoAsignadoId: undefined } : d));
        if (selectedVehicleForDetail?.id === id) {
          setSelectedVehicleForDetail(null);
        }
        showToast(`Equipo ${vehicle?.id || id} eliminado y confirmado en Supabase.`);
      }
    });
  };

  const handleClearFleet = () => {
    setPendingDeleteConfirm({
      title: '¿Realmente desea eliminar TODOS los vehículos de la flota?',
      itemName: `Todos los ${fleet.length} equipos registrados en la flota vehicular`,
      onConfirm: async () => {
        const res = await apiClearCollectionStrict('vehicles');
        if (!res.ok) {
          showToast(res.error || 'No se pudo vaciar la flota en Supabase PostgreSQL.');
          return;
        }
        setFleet([]);
        showToast('Todos los vehículos eliminados y confirmados en Supabase.');
      }
    });
  };

  const handleChangeVehicleStatus = async (id: string, newStatus: VehicleStatus) => {
    const target = fleet.find(v => v.id === id);
    if (!target) return;
    const updatedVehicle: Vehicle = { ...target, estado: newStatus };
    const res = await apiSaveItemsStrict('vehicles', updatedVehicle);
    if (!res.ok) {
      showToast(res.error || 'No se pudo actualizar el estado del vehículo en Supabase.');
      return;
    }
    setFleet(prev => prev.map(v => (v.id === id ? updatedVehicle : v)));
    if (selectedVehicleForDetail?.id === id) {
      setSelectedVehicleForDetail(updatedVehicle);
    }
    showToast(`Estado de máquina actualizado a ${newStatus} en Supabase.`);
  };

  const handleToggleDashboardVehicle = async (id: string) => {
    const target = fleet.find(v => v.id === id);
    if (!target) return;
    const nextVal = target.mostrarEnDashboard === false ? true : false;
    const updatedVehicle: Vehicle = { ...target, mostrarEnDashboard: nextVal };
    const res = await apiSaveItemsStrict('vehicles', updatedVehicle);
    if (!res.ok) {
      showToast(res.error || 'No se pudo actualizar visibilidad en Supabase.');
      return;
    }
    setFleet(prev => prev.map(v => (v.id === id ? updatedVehicle : v)));
    showToast(`Equipo ${target.id}: ${nextVal ? 'Visible en Dashboard' : 'Oculto del Dashboard'} (Supabase)`);
  };

  const handleToggleWebVehicle = async (id: string) => {
    const target = fleet.find(v => v.id === id);
    if (!target) return;
    const nextVal = target.publicarEnWeb === false ? true : false;
    const updatedVehicle: Vehicle = { ...target, publicarEnWeb: nextVal };
    const res = await apiSaveItemsStrict('vehicles', updatedVehicle);
    if (!res.ok) {
      showToast(res.error || 'No se pudo actualizar visibilidad web en Supabase.');
      return;
    }
    setFleet(prev => prev.map(v => (v.id === id ? updatedVehicle : v)));
    if (selectedVehicleForDetail?.id === id) {
      setSelectedVehicleForDetail(updatedVehicle);
    }
    showToast(
      `Equipo ${target.id} (${target.modeloMarca}): ${
        nextVal ? 'Habilitado (Visible en Web)' : 'Deshabilitado (Oculto en Web)'
      } en Supabase.`
    );
  };

  // --- Handlers for Driver / Employee Actions ---
  const handleSaveDriver = async (employee: Employee) => {
    const exists = drivers.some(d => d.id === employee.id);
    const res = await apiSaveItemsStrict('drivers', employee);
    if (!res.ok) {
      showToast(res.error || 'No se pudo guardar el empleado en Supabase PostgreSQL.');
      return;
    }
    setDrivers(prev => (exists ? prev.map(d => (d.id === employee.id ? employee : d)) : [employee, ...prev]));
    showToast(exists
      ? `Empleado ${employee.nombreApellido} (Legajo: ${employee.legajo}) actualizado en Supabase.`
      : `Empleado ${employee.nombreApellido} dado de alta en Supabase.`
    );

    // Sincronizar con la tabla `usuarios` de Supabase sin duplicar al editar/renombrar
    const cleanLegDigits = (employee.legajo || employee.codigoEmpleado || '').replace(/\D/g, '') || Math.floor(1000 + Math.random() * 9000).toString();
    const empIdLower = employee.id.trim().toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(empIdLower);
    const matchedSupUser = supabaseUsuarios.find(u =>
      (u.id && u.id.trim().toLowerCase() === empIdLower) ||
      (cleanLegDigits && u.legajo && u.legajo.replace(/\D/g, '').padStart(4, '0') === cleanLegDigits.padStart(4, '0'))
    );

    const supPayload = {
      nombre: employee.nombreApellido,
      legajo: cleanLegDigits,
      sector: employee.sector || 'Choferes',
      empresa: employee.obra?.includes('Hornocal') ? 'EL HORNOCAL SRL' : 'LA HORMIGA',
      aprobado: employee.estado !== 'INACTIVO',
      email: employee.email || `${employee.nombreApellido.toLowerCase().replace(/[^a-z0-9]/g, '.')}@lahormiga.com`
    };

    if (matchedSupUser || exists) {
      updateSupabaseUsuario(
        { id: matchedSupUser?.id || (isUuid ? empIdLower : undefined), legajo: cleanLegDigits },
        supPayload
      ).then(updated => {
        if (updated) {
          fetchSupabaseUsuarios().then(setSupabaseUsuarios).catch(() => {});
        } else if (!matchedSupUser) {
          return createSupabaseUsuario({
            ...(isUuid ? { id: empIdLower } : {}),
            ...supPayload
          }).then(created => {
            if (created) {
              fetchSupabaseUsuarios().then(setSupabaseUsuarios).catch(() => {});
            }
          });
        }
      }).catch(err => console.warn('No se pudo actualizar usuario en Supabase:', err));
    } else {
      createSupabaseUsuario({
        ...(isUuid ? { id: empIdLower } : {}),
        ...supPayload
      }).then(created => {
        if (created) {
          fetchSupabaseUsuarios().then(setSupabaseUsuarios).catch(() => {});
        }
      }).catch(err => console.warn('No se pudo guardar usuario en Supabase:', err));
    }
  };

  const handleUpsertDriversFromPayroll = async (employeesToUpsert: Employee[]): Promise<boolean> => {
    if (!Array.isArray(employeesToUpsert) || employeesToUpsert.length === 0) return true;
    const existingIds = new Set(drivers.map(d => d.id));
    const newlyCreated = employeesToUpsert.filter(e => !existingIds.has(e.id));

    const res = await apiSaveItemsStrict('drivers', employeesToUpsert);
    if (!res.ok) {
      showToast(res.error || 'No se pudo confirmar la actualización de Nómina de Personal en Supabase.');
      return false;
    }

    setDrivers(prev => {
      const map = new Map(prev.map(d => [d.id, d]));
      employeesToUpsert.forEach(emp => map.set(emp.id, emp));
      return Array.from(map.values());
    });

    if (newlyCreated.length > 0) {
      Promise.all(
        newlyCreated.map(emp => {
          const cleanLegDigits =
            (emp.legajo || emp.codigoEmpleado || '').replace(/\D/g, '') ||
            Math.floor(1000 + Math.random() * 9000).toString();
          return createSupabaseUsuario({
            nombre: emp.nombreApellido,
            legajo: cleanLegDigits,
            sector: emp.sector || 'Choferes',
            empresa: 'LA HORMIGA',
            aprobado: emp.estado !== 'INACTIVO',
            email:
              emp.email ||
              `${emp.nombreApellido.toLowerCase().replace(/[^a-z0-9]/g, '.')}@lahormiga.com`,
          });
        })
      )
        .then(() => fetchSupabaseUsuarios().then(setSupabaseUsuarios).catch(() => {}))
        .catch(() => {});
    }

    return true;
  };

  const handleDeleteDriver = (id: string, skipConfirm = false) => {
    const target = drivers.find(d => d.id === id);
    const legajo = target?.legajo;
    const nombre = target?.nombreApellido;

    const executeDeletion = async () => {
      const res = await apiDeleteItemStrict('drivers', id);
      if (!res.ok) {
        showToast(res.error || 'No se pudo eliminar el empleado en Supabase PostgreSQL.');
        return;
      }

      setDrivers(prev => prev.filter(d => d.id !== id));
      if (selectedDriverForDetail?.id === id) {
        setSelectedDriverForDetail(null);
      }

      // Si queda otro registro duplicado en `drivers` con el mismo ID (otro case) o mismo legajo,
      // NO borrar el usuario de asistencia en Supabase `usuarios` para conservar las fichadas históricas.
      const targetIdLower = id.trim().toLowerCase();
      const targetLegDigits = (legajo || target?.codigoEmpleado || '').replace(/\D/g, '').padStart(4, '0');
      const hasRemainingDuplicate = drivers.some(d => {
        if (d.id === id) return false;
        if (d.id.trim().toLowerCase() === targetIdLower) return true;
        const otherLeg = (d.legajo || d.codigoEmpleado || '').replace(/\D/g, '').padStart(4, '0');
        return Boolean(targetLegDigits && targetLegDigits !== '0000' && otherLeg === targetLegDigits);
      });

      if (!hasRemainingDuplicate) {
        deleteSupabaseUsuario(id, legajo, nombre).catch(() => {});
        setSupabaseUsuarios(prev => prev.filter(u => 
          u.id.toLowerCase() !== targetIdLower && 
          (!legajo || u.legajo !== legajo) && 
          (!nombre || u.nombre?.toLowerCase().trim() !== nombre.toLowerCase().trim())
        ));
      }

      showToast(`Empleado ${nombre || id} eliminado y confirmado en Supabase.`);
    };

    if (skipConfirm) {
      executeDeletion();
    } else {
      setPendingDeleteConfirm({
        title: '¿Realmente desea eliminar este Empleado de la Nómina?',
        itemName: target ? `${target.nombreApellido} (Legajo: ${target.legajo || id})` : `Empleado ID: ${id}`,
        onConfirm: executeDeletion
      });
    }
  };

  const handleChangeDriverStatus = async (id: string, newStatus: DriverStatus) => {
    const target = drivers.find(d => d.id === id);
    if (!target) return;
    const updatedDriver: Employee = { ...target, estado: newStatus };
    const res = await apiSaveItemsStrict('drivers', updatedDriver);
    if (!res.ok) {
      showToast(res.error || 'No se pudo actualizar el estado del empleado en Supabase.');
      return;
    }
    setDrivers(prev => prev.map(d => (d.id === id ? updatedDriver : d)));
    if (selectedDriverForDetail?.id === id) {
      setSelectedDriverForDetail(updatedDriver);
    }
    showToast(`Estado de empleado actualizado a ${newStatus} en Supabase.`);
  };

  const handleToggleDriverAttendance = async (id: string) => {
    const target = drivers.find(d => d.id === id);
    if (!target) return;
    const nextVal = target.mostrarEnAsistencia === false ? true : false;
    const updated: Employee = { ...target, mostrarEnAsistencia: nextVal };
    const res = await apiSaveItemsStrict('drivers', updated);
    if (!res.ok) {
      showToast(res.error || 'No se pudo actualizar visibilidad de asistencia en Supabase.');
      return;
    }
    setDrivers(prev => prev.map(d => (d.id === id ? updated : d)));
    showToast(`${target.nombreApellido}: ${nextVal ? 'Habilitado en Entradas y Salidas' : 'Oculto de Entradas y Salidas'} (Supabase)`);
  };

  const handleArchiveDriver = async (employee: Employee) => {
    const isCurrentlyArchived = Boolean(employee.archivado);
    const nextArchived = !isCurrentlyArchived;
    const updated: Employee = {
      ...employee,
      archivado: nextArchived,
      fechaArchivado: nextArchived ? new Date().toISOString() : undefined,
      estado: nextArchived ? 'INACTIVO' : 'ACTIVO',
      mostrarEnAsistencia: nextArchived ? false : true,
    };
    const res = await apiSaveItemsStrict('drivers', updated);
    if (!res.ok) {
      showToast(res.error || 'No se pudo actualizar el archivado del empleado en Supabase.');
      return;
    }
    setDrivers(prev => prev.map(d => (d.id === employee.id ? updated : d)));
    if (selectedDriverForDetail?.id === employee.id) {
      setSelectedDriverForDetail(updated);
    }
    showToast(
      nextArchived
        ? `Empleado ${employee.nombreApellido} archivado en Supabase (conserva historial).`
        : `Empleado ${employee.nombreApellido} desarchivado y reincorporado a nómina activa.`
    );
  };

  const handleBulkArchiveDrivers = async (ids: string[], archive: boolean) => {
    if (!ids.length) return;
    const now = new Date().toISOString();
    const updatedList: Employee[] = [];
    drivers.forEach(d => {
      if (ids.includes(d.id)) {
        updatedList.push({
          ...d,
          archivado: archive,
          fechaArchivado: archive ? now : undefined,
          estado: archive ? 'INACTIVO' : 'ACTIVO',
          mostrarEnAsistencia: archive ? false : true,
        });
      }
    });
    if (!updatedList.length) return;
    const res = await apiSaveItemsStrict('drivers', updatedList);
    if (!res.ok) {
      showToast(res.error || 'No se pudo archivar los empleados seleccionados en Supabase.');
      return;
    }
    const updatedMap = new Map(updatedList.map(u => [u.id, u]));
    setDrivers(prev => prev.map(d => updatedMap.get(d.id) || d));
    showToast(
      archive
        ? `${updatedList.length} empleado(s) archivados y confirmados en Supabase.`
        : `${updatedList.length} empleado(s) reincorporados a nómina activa en Supabase.`
    );
  };

  // --- Handlers for Fuel Deposit Actions (3 Modalidades: Ambulante, Bidones, Vales) ---
  const handleSaveFuelDeposit = async (deposit: FuelDeposit) => {
    const exists = fuelDeposits.some(d => d.id === deposit.id);
    const res = await apiSaveItemsStrict('fuel_deposits', deposit);
    if (!res.ok) {
      showToast(res.error || 'No se pudo guardar el depósito de combustible en Supabase.');
      return;
    }
    setFuelDeposits(prev => (exists ? prev.map(d => (d.id === deposit.id ? deposit : d)) : [deposit, ...prev]));
    if (selectedFuelDepositForDetail?.id === deposit.id) {
      setSelectedFuelDepositForDetail(deposit);
    }
    showToast(exists
      ? `Depósito "${deposit.nombre}" actualizado en Supabase.`
      : `Depósito "${deposit.nombre}" creado en Supabase (${deposit.modalidadLabel}).`
    );
  };

  const handleDeleteFuelDeposit = (id: string) => {
    const target = fuelDeposits.find(d => d.id === id);
    setPendingDeleteConfirm({
      title: '¿Realmente desea eliminar este Depósito / Estación?',
      itemName: target ? `Depósito "${target.nombre}" (${target.codigo || id})` : `Depósito ID: ${id}`,
      onConfirm: async () => {
        const res = await apiDeleteItemStrict('fuel_deposits', id);
        if (!res.ok) {
          showToast(res.error || 'No se pudo eliminar el depósito en Supabase.');
          return;
        }
        setFuelDeposits(prev => prev.filter(d => d.id !== id));
        if (selectedFuelDepositForDetail?.id === id) {
          setSelectedFuelDepositForDetail(null);
        }
        showToast(`Depósito "${target?.nombre || id}" eliminado y confirmado en Supabase.`);
      }
    });
  };

  const handleUpdateFuelDepositsList = async (updatedDeposits: FuelDeposit[]) => {
    if (updatedDeposits.length > 0) {
      const res = await apiSaveItemsStrict('fuel_deposits', updatedDeposits);
      if (!res.ok) {
        showToast(res.error || 'No se pudieron sincronizar los depósitos en Supabase.');
        return;
      }
    }
    setFuelDeposits(prev => {
      const map = new Map(prev.map(d => [d.id, d]));
      updatedDeposits.forEach(d => {
        if (d?.id) map.set(d.id, d);
      });
      return Array.from(map.values());
    });
  };

  const handleRefillDeposit = async (
    depositId: string, 
    addedLiters: number, 
    newStock: number, 
    refillDate?: string, 
    notes?: string,
    adjustmentDetails?: StockAdjustmentDetails
  ) => {
    const target = fuelDeposits.find(d => d.id === depositId);
    if (!target) return;

    const today = refillDate || new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const updatedStatus: FuelDepositStatus = newStock <= (target.nivelAlertaMinimo || 500) ? 'BAJO_STOCK' : 'OPERATIVO';
    let updatedDeposit: FuelDeposit;
    let toastText = '';

    if (adjustmentDetails?.isAdjustment) {
      const diff = Number(adjustmentDetails.differenceLiters.toFixed(3));
      const newAdjustmentRecord: FuelDepositStockAdjustment = {
        id: `AJU-${Date.now()}`,
        fecha: today,
        hora: nowTime,
        tipo: adjustmentDetails.adjustmentType,
        stockAnterior: Number((target.stockActual || 0).toFixed(3)),
        stockNuevo: Number(newStock.toFixed(3)),
        diferenciaLitros: diff,
        motivo: adjustmentDetails.reason,
        responsable: adjustmentDetails.responsible || target.responsableNombre,
        observaciones: notes
      };
      const newTotalCargas = diff > 0 
        ? Number(((target.totalCargasLitros || 0) + diff).toFixed(3))
        : (target.totalCargasLitros || 0);

      updatedDeposit = {
        ...target,
        stockActual: Number(newStock.toFixed(3)),
        stockAjustadoManual: Number(newStock.toFixed(3)),
        ultimoAjusteFecha: today,
        ultimoAjusteLitros: Number(newStock.toFixed(3)),
        ultimoAjusteDiferencia: diff,
        motivoUltimoAjuste: adjustmentDetails.reason,
        responsableUltimoAjuste: adjustmentDetails.responsible || target.responsableNombre,
        totalCargasLitros: newTotalCargas,
        estado: updatedStatus,
        historialAjustes: [newAdjustmentRecord, ...(target.historialAjustes || [])],
        observaciones: notes 
          ? `${target.observaciones ? target.observaciones + ' | ' : ''}Ajuste ${today}: ${adjustmentDetails.reason} (${diff >= 0 ? '+' : ''}${diff} L)` 
          : target.observaciones
      };
      toastText = `Ajuste de stock físico a ${newStock.toLocaleString('es-AR', { maximumFractionDigits: 3 })} Lts confirmado en Supabase (${diff >= 0 ? '+' : ''}${diff.toLocaleString('es-AR')} Lts).`;
    } else {
      updatedDeposit = {
        ...target,
        stockActual: Number(newStock.toFixed(3)),
        ...(target.stockAjustadoManual !== undefined
          ? { stockAjustadoManual: Number((target.stockAjustadoManual + addedLiters).toFixed(3)) }
          : {}),
        totalCargasLitros: Number(((target.totalCargasLitros || 0) + addedLiters).toFixed(3)),
        cantidadCargas: (target.cantidadCargas || 0) + 1,
        ultimaRecargaFecha: today,
        ultimaRecargaLitros: addedLiters,
        estado: updatedStatus,
        observaciones: notes ? `${target.observaciones ? target.observaciones + ' | ' : ''}Recarga: ${notes}` : target.observaciones
      };
      toastText = `Recarga de +${addedLiters.toLocaleString('es-AR')} Lts confirmada en Supabase.`;
    }

    const res = await apiSaveItemsStrict('fuel_deposits', updatedDeposit);
    if (!res.ok) {
      showToast(res.error || 'No se pudo guardar la actualización del depósito en Supabase.');
      return;
    }

    setFuelDeposits(prev => prev.map(d => (d.id === depositId ? updatedDeposit : d)));
    if (selectedFuelDepositForDetail?.id === depositId) {
      setSelectedFuelDepositForDetail(updatedDeposit);
    }
    showToast(toastText);
  };

  const handleNewDispensaryFromDeposit = (deposit: FuelDeposit) => {
    setPreselectedDepositForVoucher(deposit);
    setInitialVoucherIdForExpendio(null);
    setFuelVoucherToEdit(null);
    setIsCreateFuelVoucherModalOpen(true);
  };

  // --- Handlers for Issued Fuel Vouchers (Emisión & Rendición) ---
  const handleSaveIssuedVoucher = async (voucher: IssuedFuelVoucher): Promise<boolean> => {
    const exists = issuedVouchers.some(v => v.id === voucher.id);
    const res = await apiSaveItemsStrict('issued_vouchers', voucher);
    if (!res.ok) {
      showToast(res.error || 'No se pudo guardar el vale emitido en Supabase PostgreSQL.');
      return false;
    }
    setIssuedVouchers(prev => (exists ? prev.map(v => (v.id === voucher.id ? voucher : v)) : [voucher, ...prev]));
    if (selectedIssuedVoucherForDetail?.id === voucher.id) {
      setSelectedIssuedVoucherForDetail(voucher);
    }
    if (activeBagDocForAi && !issuedVoucherToEdit) {
      await markBagDocLinked(
        activeBagDocForAi,
        'ISSUED_VOUCHER',
        voucher.id,
        `Vale Nº ${voucher.numVale} · ${voucher.codigoEquipo || voucher.marcaModelo}`
      );
      setActiveBagDocForAi(null);
      setAiPrefillIssuedVoucherDraft(null);
    }
    showToast(exists
      ? `Vale ${voucher.numVale} actualizado y confirmado en Supabase.`
      : `Vale ${voucher.numVale} emitido y confirmado en Supabase.`
    );
    return true;
  };

  const handleDeleteIssuedVoucher = (id: string) => {
    const target = issuedVouchers.find(v => v.id === id);
    setPendingDeleteConfirm({
      title: '¿Realmente desea eliminar este Vale de Combustible?',
      itemName: target ? `Vale Nº ${target.numVale || id} (${target.nombreApellido || 'Chofer'} • ${target.litrosAutorizados || 0} Lts)` : `Vale ID: ${id}`,
      onConfirm: async () => {
        const res = await apiDeleteItemStrict('issued_vouchers', id);
        if (!res.ok) {
          showToast(res.error || 'No se pudo eliminar el vale en Supabase.');
          return;
        }
        setIssuedVouchers(prev => prev.filter(v => v.id !== id));
        if (selectedIssuedVoucherForDetail?.id === id) {
          setSelectedIssuedVoucherForDetail(null);
        }
        showToast(`Vale ${target?.numVale || id} eliminado y confirmado en Supabase.`);
      }
    });
  };

  // Triggers the Rendición flow from the Vales view into the Expendio form
  const handleProceedToRendicion = (voucher: IssuedFuelVoucher) => {
    setSelectedIssuedVoucherForDetail(null);
    setInitialVoucherIdForExpendio(voucher.id);
    setFuelVoucherToEdit(null);
    setPreselectedDepositForVoucher(null);
    setIsCreateFuelVoucherModalOpen(true);
  };

  // --- Handlers for Fuel Dispensary (Expendio de Combustible - 22 Columnas) Actions ---
  const handleSaveFuelVoucher = async (dispensary: FuelDispensary): Promise<boolean> => {
    const exists = fuelVouchers.some(v => v.id === dispensary.id);
    const prevVoucher = exists ? fuelVouchers.find(v => v.id === dispensary.id) : null;

    // 1. Confirm primary expendio write in Supabase first
    const saveRes = await apiSaveItemsStrict('fuel_vouchers', dispensary);
    if (!saveRes.ok) {
      showToast(saveRes.error || 'No se pudo guardar el expendio de combustible en Supabase.');
      return false;
    }

    if (exists) {
      setFuelVouchers(prev => prev.map(v => v.id === dispensary.id ? dispensary : v));
    } else {
      setFuelVouchers(prev => [dispensary, ...prev]);
    }

    if (dispensary.tipoComb && dispensary.precioUnitario && dispensary.precioUnitario > 0) {
      saveFuelPrice(dispensary.tipoComb, dispensary.precioUnitario);
    }

    // 2. Reconcile source & destination deposits and persist strictly
    const updatedDepositsToPersist: FuelDeposit[] = [];
    const nextDeposits = fuelDeposits.map(d => {
      let current = d;
      const isSourceMatch =
        (dispensary.deposito || dispensary.depositoId) &&
        ((dispensary.depositoId && d.id === dispensary.depositoId) ||
          d.id === dispensary.deposito ||
          (dispensary.deposito && d.nombre.toLowerCase().trim() === dispensary.deposito.toLowerCase().trim()) ||
          (dispensary.numEstacion && d.numEstacionConvenio && d.numEstacionConvenio.toLowerCase() === dispensary.numEstacion.toLowerCase()));

      if (isSourceMatch) {
        const isStation = d.modalidad === 'VALES_ESTACION' || dispensary.tipo === 'Estación de Servicio';
        if (isStation) {
          const addedLitros = exists
            ? (dispensary.cantidad || 0) - (prevVoucher?.cantidad || 0)
            : (dispensary.cantidad || 0);
          current = {
            ...current,
            totalCargasLitros: Math.max(0, (current.totalCargasLitros || 0) + addedLitros),
            cantidadCargas: exists ? (current.cantidadCargas || 1) : ((current.cantidadCargas || 0) + 1)
          };
        } else {
          const diffDescarga = exists
            ? (dispensary.cantidad || 0) - (prevVoucher?.cantidad || 0)
            : (dispensary.cantidad || 0);
          const nextStock = Number(((current.stockActual || 0) - diffDescarga).toFixed(3));
          const nextDescargas = Math.max(0, Number(((current.totalDescargasLitros || 0) + diffDescarga).toFixed(3)));
          const alertMin = current.nivelAlertaMinimo !== undefined ? current.nivelAlertaMinimo : Math.max(10, current.capacidadTotal * 0.15);
          const newStatus: FuelDepositStatus = nextStock <= alertMin ? 'BAJO_STOCK' : 'OPERATIVO';
          current = {
            ...current,
            stockActual: nextStock,
            totalDescargasLitros: nextDescargas,
            cantidadDescargas: exists ? (current.cantidadDescargas || 1) : ((current.cantidadDescargas || 0) + 1),
            estado: newStatus
          };
        }
      }

      const isTargetEquipmentDeposit = (() => {
        if (d.modalidad === 'VALES_ESTACION') return false;
        const plate = (dispensary.patente || '').toLowerCase().trim();
        const code = (dispensary.codigoEquipo || '').toLowerCase().trim();
        const model = (dispensary.marcaModelo || '').toLowerCase().trim();
        if (plate && d.patenteVehiculo && d.patenteVehiculo.toLowerCase().trim() === plate) return true;
        if (code && d.codigo && d.codigo.toLowerCase().trim() === code) return true;
        if (code && d.id && d.id.toLowerCase().trim() === code) return true;
        if (model && d.nombre && d.nombre.toLowerCase().trim() === model) return true;
        if (model && d.nombre && (d.nombre.toLowerCase().includes(model) || model.includes(d.nombre.toLowerCase()))) return true;
        return false;
      })();

      if (isTargetEquipmentDeposit) {
        const diffCarga = exists
          ? (dispensary.cantidad || 0) - (prevVoucher?.cantidad || 0)
          : (dispensary.cantidad || 0);
        const nextStock = Number(((current.stockActual || 0) + diffCarga).toFixed(3));
        const newUnitPrice = (dispensary.precioUnitario && dispensary.precioUnitario > 0) ? dispensary.precioUnitario : current.costoPorLitroEstimado;
        const alertMin = current.nivelAlertaMinimo !== undefined ? current.nivelAlertaMinimo : Math.max(10, current.capacidadTotal * 0.15);
        current = {
          ...current,
          stockActual: nextStock,
          costoPorLitroEstimado: newUnitPrice,
          totalCargasLitros: Math.max(0, Number(((current.totalCargasLitros || 0) + diffCarga).toFixed(3))),
          cantidadCargas: exists ? (current.cantidadCargas || 1) : ((current.cantidadCargas || 0) + 1),
          estado: nextStock <= alertMin ? 'BAJO_STOCK' : 'OPERATIVO',
          ultimaRecargaFecha: dispensary.fecha || current.ultimaRecargaFecha,
          ultimaRecargaLitros: dispensary.cantidad || current.ultimaRecargaLitros
        };
      }

      if (current !== d) {
        updatedDepositsToPersist.push(current);
      }
      return current;
    });

    if (updatedDepositsToPersist.length > 0) {
      const depRes = await apiSaveItemsStrict('fuel_deposits', updatedDepositsToPersist);
      if (depRes.ok) {
        setFuelDeposits(nextDeposits);
      }
    }

    // 3. Automatic Circuit Sync for linked IssuedFuelVoucher
    const linkedVoucherId = dispensary.valeId;
    const linkedValeNum = dispensary.numVale;
    let matchedVoucher: IssuedFuelVoucher | undefined;
    if (linkedVoucherId) {
      matchedVoucher = issuedVouchers.find(v => v.id === linkedVoucherId);
    }
    if (!matchedVoucher && linkedValeNum) {
      matchedVoucher = issuedVouchers.find(v => v.numVale === linkedValeNum);
    }

    if (matchedVoucher) {
      const diffLitros = (dispensary.cantidad || 0) - (matchedVoucher.litrosAutorizados || 0);
      const updatedIssuedVoucher: IssuedFuelVoucher = {
        ...matchedVoucher,
        estado: 'RENDIDO',
        expendioId: dispensary.id,
        numTicket: dispensary.numTicket || matchedVoucher.numTicket,
        litrosReales: dispensary.cantidad,
        diferenciaLitros: diffLitros,
        odometroCarga: dispensary.kilometraje,
        importeTotal: dispensary.totalImporte,
        precioUnitario: dispensary.precioUnitario ?? matchedVoucher.precioUnitario,
        fechaRendicion: dispensary.fecha,
        horaRendicion: dispensary.hora,
        codigoEquipo: dispensary.codigoEquipo || matchedVoucher.codigoEquipo,
        marcaModelo: dispensary.marcaModelo || matchedVoucher.marcaModelo,
        patente: dispensary.patente || matchedVoucher.patente,
        codigoEmpleado: dispensary.codigoEmpleado || matchedVoucher.codigoEmpleado,
        nombreApellido: dispensary.nombreApellido || matchedVoucher.nombreApellido,
        legajo: dispensary.legajo || matchedVoucher.legajo,
        tipoComb: dispensary.tipoComb || matchedVoucher.tipoComb,
        idCombustible: dispensary.idCombustible || matchedVoucher.idCombustible,
        estacionSurtidor: dispensary.deposito || matchedVoucher.estacionSurtidor,
        tipoCarga: dispensary.carga || matchedVoucher.tipoCarga,
        litrosAutorizados: dispensary.litrosAutorizados ?? matchedVoucher.litrosAutorizados,
        fotoTicket: dispensary.fotoExpendio || matchedVoucher.fotoTicket,
        fotoOdometro: dispensary.fotoKilometraje || matchedVoucher.fotoOdometro,
        observaciones: dispensary.observaciones 
          ? `${matchedVoucher.observaciones ? matchedVoucher.observaciones + ' | ' : ''}Ticket: ${dispensary.numTicket || ''}` 
          : matchedVoucher.observaciones
      };

      const ivRes = await apiSaveItemsStrict('issued_vouchers', updatedIssuedVoucher);
      if (ivRes.ok) {
        setIssuedVouchers(prev => prev.map(v => v.id === matchedVoucher!.id ? updatedIssuedVoucher : v));
      }
      showToast(`Ticket ${dispensary.numTicket || ''} confirmado en Supabase. Vale Nº ${matchedVoucher.numVale} RENDIDO.`);
    } else {
      showToast(`Expendio ${dispensary.id} confirmado en Supabase (${dispensary.cantidad} Lts).`);
    }

    if (selectedFuelVoucherForDetail?.id === dispensary.id) {
      setSelectedFuelVoucherForDetail(dispensary);
    }

    if (activeBagDocForAi && !fuelVoucherToEdit) {
      await markBagDocLinked(
        activeBagDocForAi,
        'FUEL_VOUCHER',
        dispensary.id,
        `Ticket/Ref ${dispensary.numTicket || dispensary.numOrden || dispensary.id} · ${dispensary.codigoEquipo || dispensary.marcaModelo} (${Math.abs(dispensary.cantidad || 0)} Lts)`
      );
      setActiveBagDocForAi(null);
      setAiPrefillFuelDraft(null);
    }
    return true;
  };

  const handleDeleteFuelVoucher = (id: string) => {
    const target = fuelVouchers.find(v => v.id === id);
    setPendingDeleteConfirm({
      title: '¿Realmente desea eliminar este Expendio de Combustible?',
      itemName: target ? `Expendio Ticket/Remito ${target.numTicket || target.id} (${target.cantidad || 0} Lts • ${target.marcaModelo || target.codigoEquipo || ''})` : `Expendio ID: ${id}`,
      onConfirm: async () => {
        const res = await apiDeleteItemStrict('fuel_vouchers', id);
        if (!res.ok) {
          showToast(res.error || 'No se pudo eliminar el expendio en Supabase PostgreSQL.');
          return;
        }

        setFuelVouchers(prev => prev.filter(v => v.id !== id));
        if (selectedFuelVoucherForDetail?.id === id) {
          setSelectedFuelVoucherForDetail(null);
        }

        if (target?.valeId) {
          const linked = issuedVouchers.find(v => v.id === target.valeId || v.expendioId === target.id);
          if (linked) {
            const reverted: IssuedFuelVoucher = {
              ...linked,
              estado: 'EMITIDO',
              expendioId: undefined,
              numTicket: undefined,
              litrosReales: undefined,
              diferenciaLitros: undefined,
              fechaRendicion: undefined,
              horaRendicion: undefined
            };
            const ivRes = await apiSaveItemsStrict('issued_vouchers', reverted);
            if (ivRes.ok) {
              setIssuedVouchers(prev => prev.map(v => (v.id === reverted.id ? reverted : v)));
            }
          }
        }

        const updatedDepositsToPersist: FuelDeposit[] = [];
        const nextDeposits = fuelDeposits.map(d => {
          let current = d;
          if (target && (target.deposito || (target as any).depositoId)) {
            const isMatch = ((target as any).depositoId && d.id === (target as any).depositoId) ||
                            d.id === target.deposito ||
                            (target.deposito && d.nombre.toLowerCase().trim() === target.deposito.toLowerCase().trim()) || 
                            (target.numEstacion && d.numEstacionConvenio && d.numEstacionConvenio.toLowerCase() === target.numEstacion.toLowerCase());
            if (isMatch) {
              const isStation = d.modalidad === 'VALES_ESTACION' || target.tipo === 'Estación de Servicio';
              if (isStation) {
                current = {
                  ...current,
                  totalCargasLitros: Math.max(0, (current.totalCargasLitros || 0) - (target.cantidad || 0)),
                  cantidadCargas: Math.max(0, (current.cantidadCargas || 1) - 1)
                };
              } else {
                const nextStock = Number(((current.stockActual || 0) + (target.cantidad || 0)).toFixed(3));
                const alertMin = current.nivelAlertaMinimo !== undefined ? current.nivelAlertaMinimo : Math.max(10, current.capacidadTotal * 0.15);
                current = {
                  ...current,
                  stockActual: nextStock,
                  totalDescargasLitros: Math.max(0, Number(((current.totalDescargasLitros || 0) - (target.cantidad || 0)).toFixed(3))),
                  cantidadDescargas: Math.max(0, (current.cantidadDescargas || 1) - 1),
                  estado: nextStock <= alertMin ? 'BAJO_STOCK' : 'OPERATIVO'
                };
              }
            }
          }

          if (target && current.modalidad !== 'VALES_ESTACION') {
            const plate = (target.patente || '').toLowerCase().trim();
            const code = (target.codigoEquipo || '').toLowerCase().trim();
            const model = (target.marcaModelo || '').toLowerCase().trim();
            const isEquipmentDep =
              (plate && current.patenteVehiculo && current.patenteVehiculo.toLowerCase().trim() === plate) ||
              (code && current.codigo && current.codigo.toLowerCase().trim() === code) ||
              (code && current.id && current.id.toLowerCase().trim() === code) ||
              (model && current.nombre && current.nombre.toLowerCase().trim() === model) ||
              (model && current.nombre && (current.nombre.toLowerCase().includes(model) || model.includes(current.nombre.toLowerCase())));
            if (isEquipmentDep) {
              const nextStock = Number(((current.stockActual || 0) - (target.cantidad || 0)).toFixed(3));
              const alertMin = current.nivelAlertaMinimo !== undefined ? current.nivelAlertaMinimo : Math.max(10, current.capacidadTotal * 0.15);
              current = {
                ...current,
                stockActual: nextStock,
                totalCargasLitros: Math.max(0, Number(((current.totalCargasLitros || 0) - (target.cantidad || 0)).toFixed(3))),
                cantidadCargas: Math.max(0, (current.cantidadCargas || 1) - 1),
                estado: nextStock <= alertMin ? 'BAJO_STOCK' : 'OPERATIVO'
              };
            }
          }

          if (current !== d) {
            updatedDepositsToPersist.push(current);
          }
          return current;
        });

        if (updatedDepositsToPersist.length > 0) {
          const depRes = await apiSaveItemsStrict('fuel_deposits', updatedDepositsToPersist);
          if (depRes.ok) {
            setFuelDeposits(nextDeposits);
          }
        }

        showToast(`Expendio ${target?.id || id} eliminado y confirmado en Supabase.`);
      }
    });
  };

  const handleChangeFuelVoucherStatus = async (id: string, newStatus: FuelVoucherStatus) => {
    const target = fuelVouchers.find(v => v.id === id);
    if (!target) return;
    const updated: FuelDispensary = { ...target, estado: newStatus };
    const res = await apiSaveItemsStrict('fuel_vouchers', updated);
    if (!res.ok) {
      showToast(res.error || 'No se pudo actualizar el estado del expendio en Supabase.');
      return;
    }
    setFuelVouchers(prev => prev.map(v => (v.id === id ? updated : v)));
    if (selectedFuelVoucherForDetail?.id === id) {
      setSelectedFuelVoucherForDetail(updated);
    }
    showToast(`Estado de expendio actualizado a ${newStatus} en Supabase.`);
  };

  const handleSaveFleetColumnConfig = (newConfig: TableColumnConfig<TableColumnKey>) => {
    setFleetColumnConfig(newConfig);
    saveFleetColumnConfig(newConfig);
    showToast('Configuración de columnas de flota guardada.');
  };

  const handleResetFleetColumns = () => {
    const defaultCols: Record<TableColumnKey, boolean> = {
      id: true,
      modeloMarca: true,
      anio: true,
      patente: true,
      codigoInterno: true,
      fotografia: true,
      precioCosto: true,
      precioSugerido: true,
      clasificacion: true,
      estado: true,
      horometro: true,
      ubicacionActual: true,
      fechaAlta: true,
      ordenVisibilidad: true,
      publicarEnWeb: true
    };
    const defaultOrder: TableColumnKey[] = [
      'fotografia',
      'id',
      'modeloMarca',
      'anio',
      'patente',
      'codigoInterno',
      'clasificacion',
      'precioCosto',
      'precioSugerido',
      'estado',
      'horometro',
      'ubicacionActual',
      'fechaAlta',
      'ordenVisibilidad',
      'publicarEnWeb'
    ];
    const newConfig: TableColumnConfig<TableColumnKey> = {
      order: defaultOrder,
      visible: defaultCols
    };
    setFleetColumnConfig(newConfig);
    saveFleetColumnConfig(newConfig);
    showToast('Columnas de flota restablecidas al orden y visibilidad inicial.');
  };

  const handleResetPartesDiarios = () => {
    setPendingDeleteConfirm({
      title: '¿Vaciar todos los Partes Diarios en Supabase?',
      itemName: `${partesDiarios.length} Partes Diarios registrados`,
      description: 'Esta acción elimina todos los partes diarios confirmados en Supabase PostgreSQL para comenzar desde cero.',
      confirmLabel: 'Confirmar Borrado en Supabase',
      onConfirm: async () => {
        const res = await apiClearCollectionStrict('partes_diarios');
        if (!res.ok) {
          showToast(res.error || 'No se pudieron limpiar los partes diarios en Supabase.');
          return;
        }
        setPartesDiarios([]);
        showToast('Partes diarios vaciados y confirmados en Supabase.');
      }
    });
  };

  const handleDeleteSelectedDrivers = (ids: string[], skipConfirm = false) => {
    if (ids.length === 0) return;
    const targets = drivers.filter(d => ids.includes(d.id));

    const executeBulkDeletion = async () => {
      const results = await Promise.all(
        ids.map(async (id) => ({ id, ...(await apiDeleteItemStrict('drivers', id)) }))
      );
      const deletedIds = results.filter(r => r.ok).map(r => r.id);
      const failedCount = results.length - deletedIds.length;

      if (deletedIds.length > 0) {
        const remainingDrivers = drivers.filter(d => !deletedIds.includes(d.id));
        setDrivers(remainingDrivers);
        const idsToRemoveFromSup = new Set<string>();
        deletedIds.forEach(id => {
          const t = targets.find(x => x.id === id);
          const tIdLower = id.trim().toLowerCase();
          const tLegDigits = (t?.legajo || t?.codigoEmpleado || '').replace(/\D/g, '').padStart(4, '0');
          const stillHasDuplicate = remainingDrivers.some(rem => {
            if (rem.id.trim().toLowerCase() === tIdLower) return true;
            const remLeg = (rem.legajo || rem.codigoEmpleado || '').replace(/\D/g, '').padStart(4, '0');
            return Boolean(tLegDigits && tLegDigits !== '0000' && remLeg === tLegDigits);
          });
          if (!stillHasDuplicate) {
            idsToRemoveFromSup.add(tIdLower);
            deleteSupabaseUsuario(id, t?.legajo, t?.nombreApellido).catch(() => {});
          }
        });
        if (idsToRemoveFromSup.size > 0) {
          setSupabaseUsuarios(prev => prev.filter(u => !idsToRemoveFromSup.has(u.id.trim().toLowerCase())));
        }
      }

      if (failedCount > 0) {
        const firstErr = results.find(r => !r.ok)?.error || 'Error eliminando en Supabase';
        showToast(`Se eliminaron ${deletedIds.length} empleados, pero fallaron ${failedCount}: ${firstErr}`);
      } else {
        showToast(`${deletedIds.length} empleados eliminados y confirmados en Supabase.`);
      }
    };

    if (skipConfirm) {
      executeBulkDeletion();
    } else {
      setPendingDeleteConfirm({
        title: '¿Realmente desea eliminar los Empleados seleccionados?',
        itemName: `${ids.length} Empleado(s) seleccionados`,
        onConfirm: executeBulkDeletion
      });
    }
  };

  const handleExportFleetCSV = () => {
    exportFleetToCSV(fleet);
    showToast('Flota vehicular exportada a CSV exitosamente.');
  };

  const handleExportDriversCSV = () => {
    exportDriversToCSV(drivers, fleet);
    showToast('Nómina de empleados exportada a CSV exitosamente.');
  };

  const handleExportFuelDepositsCSV = () => {
    exportFuelDepositsToCSV(fuelDeposits);
    showToast('Depósitos de carga exportados a CSV exitosamente.');
  };

  const handleExportFuelVouchersCSV = () => {
    exportFuelVouchersToCSV(fuelVouchers);
    showToast('Expendio de combustible exportado a CSV con las 22 columnas oficiales.');
  };

  const handleExportIssuedVouchersCSV = () => {
    exportIssuedVouchersToCSV(issuedVouchers);
    showToast('Vales emitidos de combustible exportados a CSV exitosamente.');
  };

  const handleExportObrasCSV = () => {
    exportObrasToCSV(obras);
    showToast('Obras exportadas a CSV exitosamente.');
  };

  // --- Handlers for Import & Export Modal ---
  const handleOpenImportExport = (entityType: EntityType) => {
    setImportExportModalState({
      isOpen: true,
      entityType
    });
  };

  const handleImportSuccess = async (importedItems: any[], mode: 'merge' | 'replace', targetEntity?: EntityType) => {
    const entityType = targetEntity || importExportModalState.entityType;
    if (
      entityType === 'expendio' ||
      entityType === 'vales' ||
      entityType === 'partesDiarios' ||
      entityType === 'gastosMantenimiento'
    ) {
      const strictMap: Record<
        'expendio' | 'vales' | 'partesDiarios' | 'gastosMantenimiento',
        { table: 'fuel_vouchers' | 'issued_vouchers' | 'partes_diarios' | 'vehicle_expenses'; label: string; apply: (items: any[]) => void }
      > = {
        expendio: { table: 'fuel_vouchers', label: 'Expendio de Combustible', apply: setFuelVouchers },
        vales: { table: 'issued_vouchers', label: 'Vales de Combustible', apply: setIssuedVouchers },
        partesDiarios: { table: 'partes_diarios', label: 'Partes Diarios', apply: setPartesDiarios },
        gastosMantenimiento: { table: 'vehicle_expenses', label: 'Gastos de Mantenimiento', apply: setExpensesLogs },
      };
      const meta = strictMap[entityType];
      const res = await apiSyncSupabaseStrict<any>(
        meta.table,
        importedItems,
        mode === 'replace' ? 'replace' : 'merge'
      );
      if (!res.ok) {
        showToast(res.error || `No se pudo confirmar la importación de ${meta.label} en Supabase PostgreSQL.`);
        return;
      }
      const persisted = res.items || importedItems;
      meta.apply(persisted);
      showToast(`Se confirmaron ${persisted.length} registros de ${meta.label} en Supabase (${mode === 'merge' ? 'Combinado' : 'Reemplazado'}).`);
      return;
    }

    const colMap: Record<
      'flota' | 'empleados' | 'obras',
      { table: 'vehicles' | 'drivers' | 'obras'; label: string; current: any[]; apply: (items: any[]) => void }
    > = {
      flota: { table: 'vehicles', label: 'Flota Vehicular', current: fleet, apply: setFleet },
      empleados: { table: 'drivers', label: 'Nómina de Empleados', current: drivers, apply: setDrivers },
      obras: { table: 'obras', label: 'Obras', current: obras, apply: setObras },
    };

    const meta = colMap[entityType];
    if (!meta) return;

    if (mode === 'replace') {
      const res = await apiSyncCollectionStrict<any>(meta.table, importedItems, { replace: true });
      if (!res.ok) {
        showToast(res.error || `No se pudo confirmar el reemplazo de ${meta.label} en Supabase PostgreSQL.`);
        return;
      }
      meta.apply(importedItems);
      showToast(`Se confirmaron ${importedItems.length} registros de ${meta.label} en Supabase (Reemplazado).`);
    } else {
      const res = await apiSaveItemsStrict<any>(meta.table, importedItems);
      if (!res.ok) {
        showToast(res.error || `No se pudo confirmar la importación de ${meta.label} en Supabase PostgreSQL.`);
        return;
      }
      const refreshed = await apiFetchCollection<any>(meta.table);
      if (refreshed !== null) {
        meta.apply(refreshed);
        showToast(`Se confirmaron ${refreshed.length} registros de ${meta.label} en Supabase (Combinado).`);
      } else {
        const mergedMap = new Map(meta.current.map((item: any) => [item.id, item]));
        importedItems.forEach((item: any) => mergedMap.set(item.id, item));
        const mergedList = Array.from(mergedMap.values());
        meta.apply(mergedList);
        showToast(`Se confirmaron ${mergedList.length} registros de ${meta.label} en Supabase (Combinado).`);
      }
    }
  };

  const getCurrentDataForImportExport = (entityType: EntityType) => {
    switch (entityType) {
      case 'flota': return fleet;
      case 'empleados': return drivers;
      case 'expendio': return fuelVouchers;
      case 'vales': return issuedVouchers;
      case 'partesDiarios': return partesDiarios;
      case 'gastosMantenimiento': return expensesLogs;
      case 'obras': return obras;
    }
  };

  const handleClearEntityRecords = async (entity: EntityType) => {
    const tableMap: Record<EntityType, { table: string; label: string; clearState: () => void }> = {
      flota: { table: 'vehicles', label: 'Flota Vehicular', clearState: () => setFleet([]) },
      empleados: { table: 'drivers', label: 'Nómina de Empleados', clearState: () => setDrivers([]) },
      expendio: { table: 'fuel_vouchers', label: 'Expendio de Combustible', clearState: () => setFuelVouchers([]) },
      vales: { table: 'issued_vouchers', label: 'Vales de Combustible', clearState: () => setIssuedVouchers([]) },
      partesDiarios: { table: 'partes_diarios', label: 'Partes Diarios', clearState: () => setPartesDiarios([]) },
      gastosMantenimiento: { table: 'vehicle_expenses', label: 'Gastos de Mantenimiento', clearState: () => setExpensesLogs([]) },
      obras: { table: 'obras', label: 'Obras', clearState: () => setObras([]) },
    };

    const meta = tableMap[entity];
    if (!meta) return;

    const res = await apiClearCollectionStrict(meta.table);
    if (!res.ok) {
      const msg = res.error || `Error eliminando ${meta.label} en Supabase PostgreSQL.`;
      showToast(msg);
      throw new Error(msg);
    }
    meta.clearState();
    showToast(`${meta.label} eliminados y confirmados en Supabase PostgreSQL.`);
  };

  const handleClearAllRecords = async () => {
    const ops: Array<{ table: string; clear: () => void }> = [
      { table: 'vehicles', clear: () => setFleet([]) },
      { table: 'drivers', clear: () => setDrivers([]) },
      { table: 'fuel_vouchers', clear: () => setFuelVouchers([]) },
      { table: 'issued_vouchers', clear: () => setIssuedVouchers([]) },
      { table: 'partes_diarios', clear: () => setPartesDiarios([]) },
      { table: 'vehicle_expenses', clear: () => setExpensesLogs([]) },
      { table: 'obras', clear: () => setObras([]) },
      { table: 'fuel_deposits', clear: () => setFuelDeposits([]) },
      { table: 'rentals', clear: () => setRentals([]) },
      { table: 'hardware', clear: () => setHardwareProducts([]) },
      { table: 'aridos', clear: () => setAridos([]) },
      { table: 'soil_services', clear: () => setSoilServices([]) },
    ];
    const results = await Promise.all(ops.map(async op => ({ op, ...(await apiClearCollectionStrict(op.table)) })));
    const failed = results.filter(r => !r.ok);
    results.filter(r => r.ok).forEach(r => r.op.clear());
    if (failed.length > 0) {
      const msg = `Error vaciando en Supabase: ${failed.map(f => f.op.table).join(', ')}`;
      showToast(msg);
      throw new Error(msg);
    }
    showToast('¡Todos los registros operativos fueron eliminados y confirmados en Supabase PostgreSQL!');
  };

  // Find driver assigned to a specific vehicle for details modal
  const assignedDriverForSelectedVehicle = useMemo(
    () => (selectedVehicleForDetail ? drivers.find(d => d.vehiculoAsignadoId === selectedVehicleForDetail.id) || null : null),
    [selectedVehicleForDetail, drivers]
  );

  const pendingIssuedVouchersCount = useMemo(
    () => issuedVouchers.filter(v => v.estado === 'EMITIDO').length,
    [issuedVouchers]
  );

  const expensesCount = useMemo(
    () => expensesLogs.filter(e => e.categoria !== 'MULTAS_INFRACCIONES').length,
    [expensesLogs]
  );

  const finesCount = useMemo(
    () => expensesLogs.filter(e => e.categoria === 'MULTAS_INFRACCIONES').length,
    [expensesLogs]
  );

  const chequesPendientesCount = useMemo(
    () => chequesCartera.filter(c => c.estado === 'EN_CARTERA' || c.estado === 'DEPOSITADO').length,
    [chequesCartera]
  );

  // If Public Website View is active, render the dedicated commercial site
  if (currentView === 'sitio-publico') {
    return (
      <>
        {toastMessage && (
          <div className="fixed bottom-20 right-5 left-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-[#16191F] text-white rounded-xl shadow-2xl border border-amber-500/50 text-xs font-semibold animate-in slide-in-from-bottom-5">
            <div className="w-5 h-5 rounded bg-amber-500 text-black flex items-center justify-center font-black text-xs">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
            <span>{toastMessage}</span>
          </div>
        )}

        <Suspense fallback={<ViewLoadingFallback />}>
          <PublicWebsite
            fleet={fleet}
            hardwareProducts={hardwareProducts}
            aridos={aridos}
            soilServices={soilServices}
            onOpenLogin={() => setIsLoginModalOpen(true)}
            onOpenSiteSettingsModal={(tab) => {
              handleOpenSiteSettings(tab as 'logo' | 'usuarios' | 'contacto' | 'textos' | 'servicios' | 'secciones');
            }}
          />

          {isLoginModalOpen && (
            <LoginModal
              isOpen={true}
              onClose={() => setIsLoginModalOpen(false)}
              onLoginSuccess={handleLoginSuccess}
            />
          )}

          {isSiteSettingsModalOpen && (
            <SiteSettingsModal
              isOpen={true}
              initialTab={siteSettingsInitialTab}
              onClose={() => setIsSiteSettingsModalOpen(false)}
              currentUser={userSession}
              onNavigateToPublicWeb={() => {
                setIsSiteSettingsModalOpen(false);
                setCurrentView('sitio-publico');
              }}
              fleet={fleet}
              onSaveFleet={async (newFleet) => {
                if (newFleet.length > 0) {
                  const res = await apiSaveItemsStrict('vehicles', newFleet);
                  if (!res.ok) {
                    showToast(res.error || 'No se pudo guardar el orden de equipos en Supabase.');
                    return;
                  }
                }
                setFleet(newFleet);
                showToast('Orden de equipos confirmado en Supabase.');
              }}
              onUsersUpdated={syncActiveSessionFromUsersList}
            />
          )}
        </Suspense>
      </>
    );
  }

  // If Chofer Portal View is active, render the dedicated mobile-first Driver App
  if (currentView === 'portal-chofer') {
    return (
      <>
        {toastMessage && (
          <div className="fixed bottom-20 right-5 left-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-[#16191F] text-white rounded-xl shadow-2xl border border-amber-500/50 text-xs font-semibold animate-in slide-in-from-bottom-5">
            <div className="w-5 h-5 rounded bg-amber-500 text-black flex items-center justify-center font-black text-xs">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
            <span>{toastMessage}</span>
          </div>
        )}

        <Suspense fallback={<ViewLoadingFallback />}>
          <DriverAppPortal
            fleet={fleet}
            drivers={drivers}
            obras={obras}
            partesDiarios={partesDiarios}
            onSaveParteDiario={handleSaveParteDiario}
            onExitToAdmin={() => setCurrentView(getDefaultViewForUser(userSession))}
            showToast={showToast}
          />
        </Suspense>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1115] text-slate-200 flex flex-col antialiased selection:bg-[#F0C800] selection:text-[#2D2D2D] font-sans">
      
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-[#16191F] text-white rounded-xl shadow-2xl border border-[#F0C800]/50 text-xs font-semibold animate-in slide-in-from-bottom-5">
          <div className="w-5 h-5 rounded bg-[#F0C800] text-[#2D2D2D] flex items-center justify-center font-black text-xs">
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </div>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onSelectView={(view) => {
          setSelectedObraForDetail(null);
          setSelectedVehicleForDetail(null);
          if (view === 'ferreteria' || view === 'caja_diaria') {
            setActiveCommercialScope('VENTAS_SALON');
          } else if (view === 'alquileres') {
            setActiveCommercialScope('ALQUILERES');
          }
          setCurrentView(view);
        }}
        onSelectModule={(modKey) => {
          if (modKey === 'salon_caja') setActiveCommercialScope('VENTAS_SALON');
          else if (modKey === 'alquileres_facturacion') setActiveCommercialScope('ALQUILERES');
          if (!userSession) return;
          if (modKey === 'stock') ensureCloudGroups(['stock']);
          else if (modKey === 'combustible') ensureCloudGroups(['fuel']);
          else if (modKey === 'mantenimiento') ensureCloudGroups(['maintenance', 'stock']);
          else if (modKey === 'trabajos') ensureCloudGroups(['dispatch']);
          else if (modKey === 'compras') ensureCloudGroups(['purchases', 'stock', 'billing']);
          else if (modKey === 'alquileres_facturacion') ensureCloudGroups(['quotations', 'billing']);
          else if (modKey === 'salon_caja') ensureCloudGroups(['purchases', 'billing', 'quotations']);
          else if (modKey === 'personal') ensureCloudGroups(['attendance_logs']);
          else if (modKey === 'documentos') ensureCloudGroups(['purchases', 'billing']);
        }}
        selectedWarehouseId={selectedWarehouseId}
        onSelectWarehouse={setSelectedWarehouseId}
        onOpenCreateWarehouseModal={() => setCreateWarehouseTrigger(prev => prev + 1)}
        stockWarehouses={stockWarehouses}
        stockItems={stockItems}
        onOpenCreateModal={() => {
          setVehicleToEdit(null);
          setIsCreateVehicleModalOpen(true);
        }}
        onOpenCreateDriverModal={() => {
          setDriverToEdit(null);
          setIsCreateDriverModalOpen(true);
        }}
        onOpenCreateFuelVoucherModal={() => {
          setFuelVoucherToEdit(null);
          setPreselectedDepositForVoucher(null);
          setInitialVoucherIdForExpendio(null);
          setIsCreateFuelVoucherModalOpen(true);
        }}
        onOpenCreateFuelDepositModal={() => {
          setFuelDepositToEdit(null);
          setIsCreateFuelDepositModalOpen(true);
        }}
        onOpenCreateIssuedVoucherModal={() => {
          setIssuedVoucherToEdit(null);
          setIsCreateIssuedVoucherModalOpen(true);
        }}
        onOpenColumnModal={() => setIsColumnModalOpen(true)}
        onOpenCalculatorModal={() => setIsCalculatorModalOpen(true)}
        onOpenCreateObraModal={() => {
          setObraToEdit(null);
          setIsCreateObraModalOpen(true);
        }}
        onExportCSV={handleExportFleetCSV}
        onExportDriversCSV={handleExportDriversCSV}
        onExportObrasCSV={handleExportObrasCSV}
        onExportFuelVouchersCSV={handleExportFuelVouchersCSV}
        onExportFuelDepositsCSV={handleExportFuelDepositsCSV}
        onExportIssuedVouchersCSV={handleExportIssuedVouchersCSV}
        fleet={fleet}
        drivers={drivers}
        obras={obras}
        fuelVouchers={fuelVouchers}
        fuelDeposits={fuelDeposits}
        issuedVouchers={issuedVouchers}
        rentalsCount={rentals.length}
        hardwareCount={hardwareProducts.length}
        stockCount={stockItems.length}
        servicesCount={servicesLogs.length}
        alertasServicesCount={alertasServicesCount}
        expensesCount={expensesCount}
        finesCount={finesCount}
        arcaCount={arcaInvoices.length}
        quotationsCount={quotations.length}
        cajaCount={cajaSessions.length}
        partesDiariosCount={partesDiarios.length}
        dispatchCount={dispatchBoardState.assignments.length}
        fichadasCount={supabaseRegistros.length}
        documentosBolsaCount={bolsaDocumentos.length}
        clientesCount={clientsCount}
        proveedoresCount={proveedores.length}
        fuelContainersCount={fuelContainers.length}
        chequesPendientesCount={chequesPendientesCount}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onOpenDatabaseModal={() => setIsDatabaseModalOpen(true)}
        onOpenTelemetryModal={() => setIsTelemetryModalOpen(true)}
        onOpenSiteSettingsModal={handleOpenSiteSettings}
        onNavigateToPublicWeb={() => setCurrentView('sitio-publico')}
        onOpenClearModal={() => setIsClearRecordsModalOpen(true)}
        onOpenImportExportModal={() => handleOpenImportExport(
          currentView === 'combustible' ? 'expendio' :
          currentView === 'partes-diarios' ? 'partesDiarios' :
          (currentView === 'services' || currentView === 'alertas-mantenimiento' || currentView === 'costos-maquinaria' || currentView === 'gastos-taller' || currentView === 'multas-taller') ? 'gastosMantenimiento' :
          currentView === 'choferes' ? 'empleados' :
          currentView === 'vales' ? 'vales' :
          currentView === 'obras' ? 'obras' : 'flota'
        )}
        userSession={userSession}
        onLogout={handleLogout}
        isSubmenuCollapsed={isSubmenuCollapsed}
        onToggleSubmenuCollapse={() => setIsSubmenuCollapsed(!isSubmenuCollapsed)}
      />

      {/* Main Content Area */}
      <div className={`${isSubmenuCollapsed ? 'lg:pl-16' : 'lg:pl-[304px]'} flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out`}>
        
        {/* Top Navbar */}
        <Navbar
          currentView={currentView}
          onSelectView={(view) => {
            setSelectedObraForDetail(null);
            setSelectedVehicleForDetail(null);
            if (view === 'ferreteria' || view === 'caja_diaria') {
              setActiveCommercialScope('VENTAS_SALON');
            } else if (view === 'alquileres') {
              setActiveCommercialScope('ALQUILERES');
            }
            setCurrentView(view);
          }}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onOpenDatabaseModal={() => setIsDatabaseModalOpen(true)}
          onOpenSiteSettingsModal={handleOpenSiteSettings}
          onOpenClearModal={() => setIsClearRecordsModalOpen(true)}
          onOpenImportExportModal={() => handleOpenImportExport(
            currentView === 'combustible' ? 'expendio' :
            currentView === 'partes-diarios' ? 'partesDiarios' :
            (currentView === 'services' || currentView === 'alertas-mantenimiento' || currentView === 'costos-maquinaria' || currentView === 'gastos-taller' || currentView === 'multas-taller') ? 'gastosMantenimiento' :
            currentView === 'choferes' ? 'empleados' :
            currentView === 'vales' ? 'vales' :
            currentView === 'obras' ? 'obras' : 'flota'
          )}
          onLogout={handleLogout}
          userSession={userSession}
          onOpenCreateModal={() => {
            setVehicleToEdit(null);
            setIsCreateVehicleModalOpen(true);
          }}
          onOpenCreateDriverModal={() => {
            setDriverToEdit(null);
            setIsCreateDriverModalOpen(true);
          }}
          onOpenCreateFuelDepositModal={() => {
            setFuelDepositToEdit(null);
            setIsCreateFuelDepositModalOpen(true);
          }}
          onOpenCreateFuelVoucherModal={() => {
            setFuelVoucherToEdit(null);
            setPreselectedDepositForVoucher(null);
            setInitialVoucherIdForExpendio(null);
            setIsCreateFuelVoucherModalOpen(true);
          }}
          onOpenCreateIssuedVoucherModal={() => {
            setIssuedVoucherToEdit(null);
            setIsCreateIssuedVoucherModalOpen(true);
          }}
          totalVehicles={fleet.length}
          totalDrivers={drivers.length}
          totalFuelDeposits={fuelDeposits.length}
          totalFuelVouchers={fuelVouchers.length}
          totalIssuedVouchers={issuedVouchers.length}
          pendingIssuedVouchersCount={pendingIssuedVouchersCount}
        />

        {/* Dashboard Body — Fluid 100% width with minimal responsive margins */}
        <main className="flex-1 px-2 py-2 sm:px-3 sm:py-2.5 lg:px-3.5 lg:py-3 w-full max-w-none min-w-0 space-y-3">
          <Suspense fallback={<ViewLoadingFallback />}>
          {currentView === 'sin-acceso' ? (
            <div className="bg-[#16191F] border border-slate-800 rounded-2xl p-8 max-w-lg mx-auto mt-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-[#F0C800] flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-black text-white">Sin módulos habilitados</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tu usuario ({userSession?.nombre || 'Invitado'}) aún no tiene módulos ni secciones asignadas. Solicitá al Administrador que active tus permisos desde Configuración → Usuarios & Permisos.
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] text-xs font-black rounded-xl transition cursor-pointer"
              >
                Volver al Sitio Web
              </button>
            </div>
          ) : currentView === 'config-usuarios' ? (
            <UsersPermissionsSection
              currentUser={userSession}
              onUsersUpdated={syncActiveSessionFromUsersList}
              onShowToast={showToast}
            />
          ) : CONFIG_WEB_VIEW_TO_TAB[currentView] ? (
            <SiteSettingsModal
              isOpen={true}
              embedded={true}
              hideTabsBar={true}
              initialTab={CONFIG_WEB_VIEW_TO_TAB[currentView]}
              activeTab={CONFIG_WEB_VIEW_TO_TAB[currentView]}
              onClose={() => setCurrentView(getDefaultViewForUser(userSession))}
              currentUser={userSession}
              onNavigateToPublicWeb={() => setCurrentView('sitio-publico')}
              fleet={fleet}
              onSaveFleet={async (newFleet) => {
                if (newFleet.length > 0) {
                  const res = await apiSaveItemsStrict('vehicles', newFleet);
                  if (!res.ok) {
                    showToast(res.error || 'No se pudo guardar el orden de equipos en Supabase.');
                    return;
                  }
                }
                setFleet(newFleet);
                showToast('Orden de equipos confirmado en Supabase.');
              }}
              onUsersUpdated={syncActiveSessionFromUsersList}
            />
          ) : currentView === 'alquileres' ? (
            /* Gestión de Alquileres de Equipos y Maquinarias */
            <RentalManagementSection
              rentals={rentals}
              fleet={fleet}
              employees={drivers}
              quotations={quotations}
              partesDiarios={partesDiarios}
              arcaInvoices={arcaInvoices}
              fuelVouchers={fuelVouchers}
              preselectedQuotation={preselectedQuotationForRental}
              onClearPreselectedQuotation={() => setPreselectedQuotationForRental(null)}
              onSaveRental={handleSaveRental}
              onDeleteRental={handleDeleteRental}
              onFinalizeRental={handleFinalizeRental}
              onInvoiceRentalInArca={(contract) => {
                setActiveCommercialScope('ALQUILERES');
                setPreselectedRentalForArca(contract);
                setPreselectedQuotationForArca(null);
                setCurrentView('arca');
                showToast(`Contrato ${contract.numeroContrato} cargado en Facturación ARCA.`);
              }}
            />
          ) : currentView === 'ferreteria' ? (
            /* Salón de Ventas & Ferretería */
            <HardwareStoreSection
              products={hardwareProducts}
              proveedores={proveedores}
              onSaveProduct={handleSaveHardwareProduct}
              onSaveProductsBatch={handleSaveHardwareProductsBatch}
              onDeleteProduct={handleDeleteHardwareProduct}
              onClearAllProducts={handleClearHardwareProducts}
              onShowToast={showToast}
            />
          ) : currentView === 'stock' ? (
            /* Gestión de Depósitos (Taller, Ventas, Herramientas, Combustibles y personalizados) */
            <StockInventorySection
              stockItems={stockItems}
              stockMovements={stockMovements}
              stockCategories={stockCategories}
              stockWarehouses={stockWarehouses}
              selectedWarehouseId={selectedWarehouseId}
              onSelectWarehouse={setSelectedWarehouseId}
              fleet={fleet}
              employees={drivers}
              onSaveStockItems={handleSaveStockItems}
              onSaveStockMovements={handleSaveStockMovements}
              onSaveStockCategories={handleSaveStockCategories}
              onSaveStockWarehouses={handleSaveStockWarehouses}
              fuelDepositsCount={fuelDeposits.length}
              externalCreateWarehouseTrigger={createWarehouseTrigger}
              fuelDepositsNode={
                <FuelDepositSection
                  deposits={fuelDeposits}
                  vouchers={fuelVouchers}
                  fleet={fleet}
                  employees={drivers}
                  onOpenCreateModal={() => {
                    setFuelDepositToEdit(null);
                    setIsCreateFuelDepositModalOpen(true);
                  }}
                  onViewDetails={(deposit) => setSelectedFuelDepositForDetail(deposit)}
                  onEditDeposit={(deposit) => {
                    setFuelDepositToEdit(deposit);
                    setIsCreateFuelDepositModalOpen(true);
                  }}
                  onDeleteDeposit={handleDeleteFuelDeposit}
                  onOpenRefill={(deposit) => {
                    setFuelDepositToRefill(deposit);
                    setRefillModalInitialTab('refill');
                    setIsRefillModalOpen(true);
                  }}
                  onOpenStockAdjustment={(deposit) => {
                    setFuelDepositToRefill(deposit);
                    setRefillModalInitialTab('adjustment');
                    setIsRefillModalOpen(true);
                  }}
                  onExportCSV={handleExportFuelDepositsCSV}
                  onNewDispensaryFromDeposit={handleNewDispensaryFromDeposit}
                  onSaveFuelAssignments={async (stationId, fuelNames) => {
                    const updated = assignFuelsToStation(fuelDeposits, stationId, fuelNames);
                    const target = updated.find(d => d.id === stationId);
                    if (target) {
                      const res = await apiSaveItemsStrict('fuel_deposits', target);
                      if (!res.ok) {
                        showToast(res.error || 'No se pudo guardar la asignación en Supabase.');
                        return;
                      }
                    }
                    setFuelDeposits(updated);
                    showToast('Combustibles asignados y confirmados en Supabase.');
                  }}
                  onShowToast={showToast}
                />
              }
            />
          ) : (currentView === 'compras' || currentView === 'proveedores') ? (
            /* Compras, Padrón de Proveedores, Facturas de Compra & Legajitos */
            <ComprasSection
              proveedores={proveedores}
              purchaseInvoices={purchaseInvoices}
              supplierPayments={supplierPayments}
              chequesCartera={chequesCartera}
              fuelVouchers={fuelVouchers}
              fleet={fleet}
              stockItems={stockItems}
              stockWarehouses={stockWarehouses}
              stockCategories={stockCategories}
              onCreateStockItem={handleCreateStockItemStrict}
              onCreateWarehouse={handleCreateStockWarehouseStrict}
              onSaveInvoice={handleSavePurchaseInvoice}
              onDeleteInvoice={handleDeletePurchaseInvoice}
              onSavePayment={handleSaveSupplierPayment}
              onEndorseChequesToSupplier={handleEndorseChequesToSupplier}
              onSaveProveedor={handleSaveProveedor}
              onShowToast={showToast}
              onNavigateToCarteraCheques={() => setCurrentView('cartera-cheques')}
              initialTab={currentView === 'proveedores' ? 'proveedores' : 'facturas'}
            />
          ) : (currentView === 'services' || currentView === 'alertas-mantenimiento' || currentView === 'costos-maquinaria' || currentView === 'gastos-taller' || currentView === 'multas-taller') ? (
            /* Mantenimiento, Services, Alertas, Multas & Centro de Costos Directos por Equipo */
            <ServicesMaintenanceSection
              services={servicesLogs}
              expenses={expensesLogs}
              fleet={fleet}
              drivers={drivers}
              stockItems={stockItems}
              fuelVouchers={fuelVouchers}
              stockMovements={stockMovements}
              onSaveServices={handleSaveVehicleServices}
              onSaveExpenses={handleSaveVehicleExpenses}
              initialTab={
                currentView === 'alertas-mantenimiento' ? 'alerts' :
                currentView === 'costos-maquinaria' ? 'costCenter' :
                currentView === 'multas-taller' ? 'fines' :
                currentView === 'gastos-taller' ? 'expenses' : 'services'
              }
              onNavigateToFlota={() => setCurrentView('flota')}
              onOpenSheetConnector={() => setSheetConnectorEntity('gastosMantenimiento')}
              googleSheetLinkedLabel={linkedSheetConfigs.gastosMantenimiento?.selectedTabTitle}
              onShowToast={showToast}
            />
          ) : currentView === 'cotizador' ? (
            /* Cotizador & Presupuestos Oficial A4 (El Hornocal S.R.L. / La Hormiga) */
            <QuotationSection
              quotations={quotations}
              onSaveQuotations={handleSaveQuotations}
              onDeleteQuotation={handleDeleteQuotation}
              fleet={fleet}
              hardwareProducts={hardwareProducts}
              aridos={aridos}
              activeModuleScope={activeCommercialScope}
              onConvertToRental={(q) => {
                setActiveCommercialScope('ALQUILERES');
                setPreselectedQuotationForRental(q);
                setCurrentView('alquileres');
                showToast(`Cotización de ${q.razonSocialReceptor} cargada para Contrato de Alquiler.`);
              }}
              onInvoiceInArca={(q) => {
                setActiveCommercialScope(resolveQuotationModule(q));
                setPreselectedQuotationForArca(q);
                setPreselectedRentalForArca(null);
                setCurrentView('arca');
                showToast(`Cotización de ${q.razonSocialReceptor} cargada en Facturación ARCA.`);
              }}
            />
          ) : currentView === 'clientes' ? (
            /* Padrón y Ficha de Clientes */
            <ClientesSection
              rentals={rentals}
              arcaInvoices={arcaInvoices}
              quotations={quotations}
              obras={obras}
              partesDiarios={partesDiarios}
              onClientsCountChange={setClientsCount}
              onClientsChanged={(nextClients) => {
                setClients(nextClients);
                setClientsCount(nextClients.length);
              }}
              onCreateObraForClient={(client) => {
                setObraToEdit(null);
                setDefaultClientForNewObra(client);
                setIsCreateObraModalOpen(true);
              }}
              onOpenObra={(obra) => {
                setSelectedObraForDetail(obra);
                setCurrentView('obras');
              }}
              onNavigateToView={(v) => setCurrentView(v)}
              onShowToast={showToast}
            />
          ) : currentView === 'arca' || currentView === 'remitos' ? (
            /* Facturación Electrónica ARCA & Remitos de Entrega */
            <ArcaBillingSection
              invoices={arcaInvoices}
              onSaveInvoices={handleSaveArcaInvoices}
              onDeleteInvoice={handleDeleteArcaInvoice}
              quotations={quotations}
              rentals={rentals}
              partesDiarios={partesDiarios}
              receipts={customerReceipts}
              clients={clients}
              hardwareProducts={hardwareProducts}
              onUpdateRental={(updatedRental) => handleSaveRental(updatedRental)}
              onUpdatePartesBatch={handleSavePartesDiariosBatch}
              onNavigateToCobranzas={() => setCurrentView('cobranzas')}
              fleet={fleet}
              drivers={drivers}
              obras={obras}
              preselectedQuotation={preselectedQuotationForArca}
              preselectedRental={preselectedRentalForArca}
              preselectedResumen={preselectedResumenForArca}
              onClearPreselection={() => {
                setPreselectedQuotationForArca(null);
                setPreselectedRentalForArca(null);
                setPreselectedResumenForArca(null);
              }}
              onMarkQuotationInvoiced={(quotationId) => {
                handleMarkQuotationStatus(quotationId, 'FACTURADA');
              }}
              activeModuleScope={activeCommercialScope}
              initialTab={currentView === 'remitos' ? 'remitos' : 'invoices'}
              onTabNavigate={(tab) => {
                if (tab === 'remitos' && currentView !== 'remitos') setCurrentView('remitos');
                else if (tab === 'invoices' && currentView !== 'arca') setCurrentView('arca');
              }}
            />
          ) : currentView === 'cobranzas' ? (
            /* Cobranzas & Bajar Facturas ARCA */
            <CobranzasSection
              invoices={arcaInvoices}
              rentals={rentals}
              partesDiarios={partesDiarios}
              receipts={customerReceipts}
              cajaSessions={cajaSessions}
              accountingAccounts={accountingAccounts}
              chequesCartera={chequesCartera}
              onSaveInvoices={handleSaveArcaInvoices}
              onUpdateRental={handleSaveRental}
              onUpdatePartesBatch={handleSavePartesDiariosBatch}
              onSaveReceipts={handleSaveCustomerReceipts}
              onSaveCajaSessions={handleSaveCajaSessions}
              onSaveAccountingEntry={handleSaveAccountingEntry}
              onSaveChequesCartera={handleSaveChequesCartera}
              onNavigateToPlanCuentas={() => setCurrentView('plan-cuentas')}
              onNavigateToCarteraCheques={() => setCurrentView('cartera-cheques')}
              activeModuleScope={activeCommercialScope}
            />
          ) : currentView === 'cartera-cheques' ? (
            /* Cartera de Cheques & E-Cheq (Clearing, Endosos y Rechazos) */
            <CarteraChequesSection
              cheques={chequesCartera}
              accountingAccounts={accountingAccounts}
              proveedores={proveedores}
              purchaseInvoices={purchaseInvoices}
              onSaveCheques={handleSaveChequesCartera}
              onDeleteCheque={handleDeleteChequeCartera}
              onSaveAccountingEntry={handleSaveAccountingEntry}
              onEndorseChequeToSupplier={handleEndorseChequesToSupplier}
              onRejectCheque={handleRejectCheque}
              onNavigateToCobranzas={() => setCurrentView('cobranzas')}
              onNavigateToPlanCuentas={() => setCurrentView('plan-cuentas')}
              onNavigateToCompras={() => setCurrentView('compras')}
            />
          ) : currentView === 'plan-cuentas' ? (
            /* Plan de Cuentas, Bancos & Movimientos Contables */
            <PlanDeCuentasSection
              accounts={accountingAccounts}
              entries={accountingEntries}
              customerReceipts={customerReceipts}
              onSaveAccount={handleSaveAccountingAccount}
              onDeleteAccount={handleDeleteAccountingAccount}
              onSaveEntry={handleSaveAccountingEntry}
              onDeleteEntry={handleDeleteAccountingEntry}
              onInitializeDefaultAccounts={handleInitializeDefaultAccountingAccounts}
              onNavigateToCobranzas={() => setCurrentView('cobranzas')}
            />
          ) : currentView === 'caja_diaria' ? (
            /* Caja Diaria & Arqueo de Billetes */
            <CajaDiariaSection
              sessions={cajaSessions}
              onSaveSessions={handleSaveCajaSessions}
            />
          ) : currentView === 'flota' ? (
            selectedVehicleForDetail ? (
              /* Espacio de trabajo completo de la Máquina abierta (igual que Obras) */
              <VehicleDetailModal
                layoutMode="workspace"
                isOpen={true}
                vehicle={selectedVehicleForDetail}
                assignedDriver={assignedDriverForSelectedVehicle}
                onClose={() => setSelectedVehicleForDetail(null)}
                onEdit={(v) => {
                  setVehicleToEdit(v);
                  setIsCreateVehicleModalOpen(true);
                }}
                onArchive={handleArchiveVehicle}
                onChangeStatus={handleChangeVehicleStatus}
                onViewDriver={(d) => {
                  setSelectedDriverForDetail(d);
                }}
                onUpdateVehicle={async (updated) => {
                  await handleSaveVehicle(updated);
                  setSelectedVehicleForDetail(updated);
                }}
                drivers={drivers}
                partesDiarios={partesDiarios}
                rentals={rentals}
                obras={obras}
                arcaInvoices={arcaInvoices}
                servicesLogs={servicesLogs}
                expensesLogs={expensesLogs}
                fuelVouchers={fuelVouchers}
                purchaseInvoices={purchaseInvoices}
                cajaSessions={cajaSessions}
              />
            ) : (
            <>
              {/* Bento Welcome Banner */}
              <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl p-6 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-2 z-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0C800]/10 border border-[#F0C800]/30 text-[#F0C800] text-xs font-black uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-[#F0C800] animate-pulse" />
                    La Hormiga • Control Operativo de Flota
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight font-display">
                    Gestión y Parque de Maquinarias
                  </h2>
                  <p className="text-xs md:text-sm text-slate-400 max-w-xl">
                    Control de flota y maquinaria pesada, alquiler por días/horas y seguimiento con operario de <strong>La Hormiga</strong>.
                  </p>
                </div>

                <div className="hidden sm:block z-10 bg-[#1F2228] p-3 rounded-2xl border border-[#2D2D2D] shadow-inner">
                  <Logo variant="compact" size="md" theme="dark" showSlogan={true} />
                </div>

                {/* Subtle background pattern */}
                <div className="absolute right-0 top-0 bottom-0 w-96 opacity-10 bg-[radial-gradient(#F0C800_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
              </div>

              {/* Bento Quick Metrics */}
              <QuickStatsBanner fleet={fleet} />

              {/* Main Vehicle Table View */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-white tracking-tight font-display">
                      Inventario Operativo de Equipos
                    </h3>
                    <p className="text-xs text-slate-400">
                      Visualización de flota, filtros en tiempo real y tarifas de alquiler
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentView('services')}
                      className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-bold rounded-xl transition cursor-pointer shadow-sm"
                    >
                      <Wrench className="w-4 h-4 text-cyan-400" />
                      <span>Taller & Services ({servicesLogs.length})</span>
                    </button>
                    <button
                      onClick={() => setCurrentView('alertas-mantenimiento')}
                      className={`hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition cursor-pointer shadow-sm border ${
                        alertasServicesCount > 0 
                          ? 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25' 
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      <span>Alertas ({alertasServicesCount})</span>
                    </button>
                    <button
                      id="btn-alta-seccion"
                      onClick={() => {
                        setVehicleToEdit(null);
                        setIsCreateVehicleModalOpen(true);
                      }}
                      className="hidden sm:flex items-center gap-2 px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] active:bg-[#DDA800] text-[#2D2D2D] text-xs font-black rounded-xl shadow-md shadow-[#F0C800]/20 transition cursor-pointer border border-[#DDA800]"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>+ Dar de Alta Vehículo</span>
                    </button>
                  </div>
                </div>

                {/* The Table */}
                <VehicleTable
                  fleet={fleet}
                  visibleColumns={fleetColumnConfig.visible}
                  columnOrder={fleetColumnConfig.order}
                  onReorderColumns={(newOrder) => {
                    const updated = { ...fleetColumnConfig, order: newOrder };
                    setFleetColumnConfig(updated);
                    saveFleetColumnConfig(updated);
                  }}
                  onOpenCreateModal={() => {
                    setVehicleToEdit(null);
                    setIsCreateVehicleModalOpen(true);
                  }}
                  onOpenColumnModal={() => setIsColumnModalOpen(true)}
                  onViewDetails={(vehicle) => handleOpenVehicleDetail(vehicle)}
                  onEditVehicle={(vehicle) => {
                    setVehicleToEdit(vehicle);
                    setIsCreateVehicleModalOpen(true);
                  }}
                  onArchiveVehicle={handleArchiveVehicle}
                  onDeleteVehicle={handleDeleteVehicle}
                  onClearFleet={() => setIsClearRecordsModalOpen(true)}
                  onChangeStatus={handleChangeVehicleStatus}
                  onOpenImportExport={() => handleOpenImportExport('flota')}
                  onExportCSV={handleExportFleetCSV}
                  onToggleDashboard={handleToggleDashboardVehicle}
                  onToggleWeb={handleToggleWebVehicle}
                />
              </section>
            </>
            )
          ) : currentView === 'choferes' ? (
            /* Empleados View */
            <DriverSection
              drivers={drivers}
              fleet={fleet}
              onOpenCreateModal={() => {
                setDriverToEdit(null);
                setIsCreateDriverModalOpen(true);
              }}
              onViewDetails={(driver) => setSelectedDriverForDetail(driver)}
              onEditDriver={(driver) => {
                setDriverToEdit(driver);
                setIsCreateDriverModalOpen(true);
              }}
              onArchiveDriver={handleArchiveDriver}
              onBulkArchiveDrivers={handleBulkArchiveDrivers}
              onToggleAttendance={handleToggleDriverAttendance}
              onDeleteDriver={handleDeleteDriver}
              onChangeStatus={handleChangeDriverStatus}
              onExportCSV={handleExportDriversCSV}
              onOpenImportExport={() => handleOpenImportExport('empleados')}
              onClearAllDrivers={() => setIsClearRecordsModalOpen(true)}
              onDeleteSelectedDrivers={handleDeleteSelectedDrivers}
              onViewVehicle={(v) => handleOpenVehicleDetail(v)}
              onSyncSupabase={() => loadSupabaseData()}
              isSupabaseLoading={isSupabaseLoading}
            />
          ) : currentView === 'sueldos' ? (
            /* Liquidación de Sueldos conectada en vivo con Google Sheets + Respaldo Supabase */
            <PayrollSheetsSection
              employees={drivers}
              partesDiarios={partesDiarios}
              supabaseRegistros={supabaseRegistros}
              supabaseUsuarios={supabaseUsuarios}
              isAttendanceLoading={isSupabaseLoading}
              onUpsertEmployees={handleUpsertDriversFromPayroll}
              onViewEmployee={(emp) => setSelectedDriverForDetail(emp)}
              onShowToast={showToast}
            />
          ) : currentView === 'asistencia' ? (
            /* Vista de Asistencia & Entradas/Salidas con Supabase */
            <AttendanceSection
              registros={supabaseRegistros}
              usuarios={supabaseUsuarios}
              licencias={supabaseLicencias}
              sectores={supabaseSectores}
              empresas={supabaseEmpresas}
              categorias={supabaseCategorias}
              employees={drivers}
              partesDiarios={partesDiarios}
              isLoading={isSupabaseLoading}
              onRefresh={() => loadSupabaseData()}
              onLoadFullHistory={() => loadSupabaseData({ fullHistory: true })}
              onSyncUsersToEmployees={handleSyncSupabaseUsersToEmployees}
              onViewEmployeeDetail={(empId) => {
                const found = drivers.find(d => d.id === empId);
                if (found) setSelectedDriverForDetail(found);
              }}
              onShowToast={showToast}
            />
          ) : currentView === 'contenedores-combustible' ? (
            /* Contenedores de Combustible: Facturas, Resúmenes Proveedor, Cargas y Sub-vínculos Chulengo -> Máquinas */
            <FuelContainersSection
              containers={fuelContainers}
              vouchers={fuelVouchers}
              deposits={fuelDeposits}
              proveedores={proveedores}
              purchaseInvoices={purchaseInvoices}
              fleet={fleet}
              onSaveContainer={handleSaveFuelContainer}
              onDeleteContainer={handleDeleteFuelContainer}
              onShowToast={showToast}
            />
          ) : currentView === 'depositos' ? (
            /* Depósitos de Carga View (3 Modalidades: Ambulante, Bidones, Vales) */
            <FuelDepositSection
              deposits={fuelDeposits}
              vouchers={fuelVouchers}
              fleet={fleet}
              employees={drivers}
              onOpenCreateModal={() => {
                setFuelDepositToEdit(null);
                setIsCreateFuelDepositModalOpen(true);
              }}
              onViewDetails={(deposit) => setSelectedFuelDepositForDetail(deposit)}
              onEditDeposit={(deposit) => {
                setFuelDepositToEdit(deposit);
                setIsCreateFuelDepositModalOpen(true);
              }}
              onDeleteDeposit={handleDeleteFuelDeposit}
              onOpenRefill={(deposit) => {
                setFuelDepositToRefill(deposit);
                setRefillModalInitialTab('refill');
                setIsRefillModalOpen(true);
              }}
              onOpenStockAdjustment={(deposit) => {
                setFuelDepositToRefill(deposit);
                setRefillModalInitialTab('adjustment');
                setIsRefillModalOpen(true);
              }}
              onExportCSV={handleExportFuelDepositsCSV}
              onNewDispensaryFromDeposit={handleNewDispensaryFromDeposit}
              onSaveFuelAssignments={async (stationId, fuelNames) => {
                const updated = assignFuelsToStation(fuelDeposits, stationId, fuelNames);
                const target = updated.find(d => d.id === stationId);
                if (target) {
                  const res = await apiSaveItemsStrict('fuel_deposits', target);
                  if (!res.ok) {
                    showToast(res.error || 'No se pudo guardar la asignación en Supabase.');
                    return;
                  }
                }
                setFuelDeposits(updated);
                showToast('Combustibles asignados y confirmados en Supabase.');
              }}
              onShowToast={showToast}
            />
          ) : currentView === 'vales' ? (
            /* Vales de Combustible (Circuito de Emisión & Rendición) View */
            <IssuedVouchersSection
              vouchers={issuedVouchers}
              fleet={fleet}
              employees={drivers}
              deposits={fuelDeposits}
              onOpenCreateModal={() => {
                setIssuedVoucherToEdit(null);
                setIsCreateIssuedVoucherModalOpen(true);
              }}
              onViewDetails={(voucher) => setSelectedIssuedVoucherForDetail(voucher)}
              onEditVoucher={(voucher) => {
                setIssuedVoucherToEdit(voucher);
                setIsCreateIssuedVoucherModalOpen(true);
              }}
              onDeleteVoucher={handleDeleteIssuedVoucher}
              onProceedToRendicion={handleProceedToRendicion}
              onExportCSV={handleExportIssuedVouchersCSV}
              onOpenImportExport={() => handleOpenImportExport('vales')}
              onOpenGoogleSheet={() => setSheetConnectorEntity('vales')}
              googleSheetLinkedLabel={linkedSheetConfigs.vales?.selectedTabTitle}
              onOpenClearRecords={() => setIsClearRecordsModalOpen(true)}
              onViewExpendio={(expendioId) => {
                const found = fuelVouchers.find(fv => fv.id === expendioId);
                if (found) {
                  setSelectedFuelVoucherForDetail(found);
                }
              }}
            />

          ) : currentView === 'programacion-audio' ? (
            /* Programación del Día por Audio (WhatsApp Baileys + Gemini + Esquema de Empleados y Equipos) */
            <DailyScheduleAudioSection
              fleet={fleet}
              employees={drivers}
              obras={obras}
              partesDiarios={partesDiarios}
              dispatchBoardState={dispatchBoardState}
              userSession={userSession}
              onSaveDispatchBoard={handleSaveDispatchBoard}
              onCreatePartesBatch={handleSavePartesDiariosBatch}
              onNavigateToView={(view) => setCurrentView(view as any)}
              onShowToast={showToast}
            />

          ) : currentView === 'pizarra-despacho' ? (
            /* Pizarra Interactiva de Ubicación (Drag & Drop) */
            <PizarraDespachoSection
              boardState={dispatchBoardState}
              obras={obras}
              employees={drivers}
              fleet={fleet}
              userSession={userSession}
              isSaving={isSavingDispatchBoard}
              saveError={dispatchBoardSaveError}
              onSaveBoardState={handleSaveDispatchBoard}
              onCreateObra={handleSaveObra}
              onOpenObraDetail={(obra) => {
                setSelectedObraForDetail(obra);
                setCurrentView('obras');
              }}
            />

          ) : currentView === 'bolsa-documentos' ? (
            /* Módulo Documentos: Bolsa de Documentos (Captura Móvil + Optimización + Vinculación + IA) */
            <BolsaDocumentosSection
              items={bolsaDocumentos}
              partesDiarios={partesDiarios}
              fuelVouchers={fuelVouchers}
              userSession={userSession}
              analyzingDocId={analyzingBolsaDocId}
              onAddItems={handleAddBolsaDocumentos}
              onUpdateItem={handleUpdateBolsaDocumento}
              onDeleteItem={handleDeleteBolsaDocumento}
              onAnalyzeWithAI={handleAnalyzeBolsaDocumento}
              onOpenParteDetail={(parte) => setSelectedParteForDetail(parte)}
              onOpenFuelVoucherDetail={(voucher) => setSelectedFuelVoucherForDetail(voucher)}
              onShowToast={showToast}
            />

          ) : currentView === 'partes-diarios' ? (
            /* Partes Diarios de Equipos View */
            <PartesDiariosSection
              partes={partesDiarios}
              fleet={fleet}
              employees={drivers}
              obras={obras}
              rentals={rentals}
              arcaInvoices={arcaInvoices}
              fuelVouchers={fuelVouchers}
              onUpdatePartesBatch={handleSavePartesDiariosBatch}
              onNavigateToCobranzas={() => setCurrentView('cobranzas')}
              onOpenCreateModal={() => {
                setParteToEdit(null);
                setIsCreateParteModalOpen(true);
              }}
              onViewDetails={(parte) => setSelectedParteForDetail(parte)}
              onEditParte={(parte) => {
                setParteToEdit(parte);
                setIsCreateParteModalOpen(true);
              }}
              onDeleteParte={handleDeleteParteDiario}
              onExportCSV={() => exportPartesDiariosToCSV(partesDiarios)}
              onOpenImportExport={() => handleOpenImportExport('partesDiarios')}
              onOpenGoogleSheet={() => setSheetConnectorEntity('partesDiarios')}
              googleSheetLinkedLabel={linkedSheetConfigs.partesDiarios?.selectedTabTitle}
              onResetPartesDiarios={handleResetPartesDiarios}
              onClearAllPartesDiarios={() => setIsClearRecordsModalOpen(true)}
              onDeleteSelectedPartes={handleDeleteSelectedPartes}
              onViewVehicle={(codigoEquipo, marcaModelo) => {
                if (codigoEquipo === 'EVENTUAL') {
                  showToast(`Equipo eventual (1 vez, no pertenece a la flota): ${marcaModelo || 'Sin detalle'}`);
                  return;
                }
                const found = fleet.find(v => v.codigo === codigoEquipo || v.id === codigoEquipo || v.modeloMarca === marcaModelo);
                if (found) {
                  handleOpenVehicleDetail(found);
                } else {
                  showToast(`Equipo: ${codigoEquipo || marcaModelo}`);
                }
              }}
              onViewEmployee={(codigoEmpleado, nombreApellido) => {
                if (codigoEmpleado === 'A_PRUEBA' || codigoEmpleado === 'EVENTUAL') {
                  showToast(`No empleado · a prueba por única vez: ${nombreApellido || 'Sin nombre'}`);
                  return;
                }
                const found = drivers.find(d => d.codigoEmpleado === codigoEmpleado || d.legajo === codigoEmpleado || d.nombreApellido === nombreApellido);
                if (found) {
                  setSelectedDriverForDetail(found);
                } else {
                  showToast(`Empleado: ${nombreApellido || codigoEmpleado}`);
                }
              }}
              onViewObra={(obraNombre, codigoObra) => {
                const unifiedList = buildUnifiedObrasList({
                  obras,
                  partesDiarios,
                  rentals,
                  arcaInvoices,
                  clients,
                });
                const nName = obraNombre.toLowerCase().trim();
                const nCod = (codigoObra || '').toLowerCase().trim();
                const found = unifiedList.find(
                  (o) =>
                    o.nombreObra.toLowerCase().trim() === nName ||
                    (nCod && nCod !== 'esporadica' && o.numero.toLowerCase().trim() === nCod)
                );
                if (found) {
                  setSelectedObraInitialTab('info');
                  setSelectedObraForDetail(found);
                  setCurrentView('obras');
                } else {
                  showToast(`Obra: ${obraNombre} [${codigoObra}]`);
                }
              }}
            />

          ) : currentView === 'obras' ? (
            selectedObraForDetail ? (
              /* Espacio de trabajo completo de la Obra abierta */
              <ObraDetailModal
                layoutMode="workspace"
                isOpen={true}
                obra={selectedObraForDetail}
                initialTab={selectedObraInitialTab}
                onClose={() => {
                  setSelectedObraForDetail(null);
                  setSelectedObraInitialTab('info');
                }}
                onEdit={(o) => {
                  setObraToEdit(o);
                  setIsCreateObraModalOpen(true);
                }}
                onArchive={handleArchiveObra}
                onSaveObraLegajo={handleSaveObraLegajo}
                partesDiarios={partesDiarios}
                arcaInvoices={arcaInvoices}
                customerReceipts={customerReceipts}
                rentals={rentals}
                quotations={quotations}
                fleet={fleet}
                fuelVouchers={fuelVouchers}
                stockMovements={stockMovements}
                stockItems={stockItems}
                servicesLogs={servicesLogs}
                expensesLogs={expensesLogs}
                employees={drivers}
                supabaseUsuarios={supabaseUsuarios}
                supabaseCategorias={supabaseCategorias}
                purchaseInvoices={purchaseInvoices}
                onSaveRental={handleSaveRental}
                onNavigateToArca={() => setCurrentView('arca')}
                onNavigateToCobranzas={() => setCurrentView('cobranzas')}
                onInvoiceRentalInArca={(contract, context) => {
                  arcaReturnContextRef.current = context
                    ? { obraId: context.obraId, periodoId: context.periodoId, rentalId: contract.id }
                    : null;
                  setPreselectedRentalForArca(contract);
                  setPreselectedQuotationForArca(null);
                  setPreselectedResumenForArca(null);
                  setCurrentView('arca');
                  showToast(
                    `Contrato ${contract.numeroContrato} cargado en Facturación ARCA. Al emitir la factura se vinculará automáticamente al contenedor.`
                  );
                }}
                onInvoiceResumenInArca={(payload) => {
                  arcaReturnContextRef.current = {
                    obraId: payload.obra.id,
                    periodoId: payload.resumen.periodoId,
                    rentalId: payload.linkedRental?.id,
                    resumenValorizadoId: payload.resumen.id,
                    parteDiarioIds: payload.parteDiarioIds,
                  };
                  setPreselectedResumenForArca(payload);
                  setPreselectedRentalForArca(null);
                  setPreselectedQuotationForArca(null);
                  setCurrentView('arca');
                  showToast(
                    `Resumen Valorizado N° ${payload.resumen.numero} cargado en Facturación ARCA${
                      payload.linkedRental ? ` (vinculado al Contrato ${payload.linkedRental.numeroContrato})` : ''
                    }. Al emitir la factura se vinculará automáticamente.`
                  );
                }}
              />
            ) : (
              /* Obras & Proyectos View */
              <ObrasSection
                obras={obras}
                clients={clients}
                partesDiarios={partesDiarios}
                rentals={rentals}
                arcaInvoices={arcaInvoices}
                customerReceipts={customerReceipts}
                onOpenCreateModal={() => {
                  setObraToEdit(null);
                  setDefaultClientForNewObra(null);
                  setIsCreateObraModalOpen(true);
                }}
                onViewDetails={(
                  obra: Obra,
                  tab: 'info' | 'valorizado' | 'facturas' | 'contenedores' | 'personal' | 'combustible' | 'costos' | 'partes' = 'info'
                ) => {
                  setSelectedObraInitialTab(tab);
                  setSelectedObraForDetail(obra);
                }}
                onEditObra={(obra) => {
                  setObraToEdit(obra);
                  setDefaultClientForNewObra(null);
                  setIsCreateObraModalOpen(true);
                }}
                onArchiveObra={handleArchiveObra}
                onDeleteObra={handleDeleteObra}
                onExportCSV={handleExportObrasCSV}
                onOpenImportExport={() => handleOpenImportExport('obras')}
                onNavigateToArca={() => setCurrentView('arca')}
                onNavigateToCobranzas={() => setCurrentView('cobranzas')}
              />
            )

          ) : currentView === 'costos-combustible' ? (
            /* Vista de Costos Mensuales en Combustibles */
            <FuelCostsSection
              fuelVouchers={fuelVouchers}
              fleet={fleet}
              deposits={fuelDeposits}
              onExportCSV={handleExportFuelVouchersCSV}
            />
          ) : currentView === 'tipos-combustible' ? (
            /* Vista de Gestión de Tipos y Precios de Combustible */
            <FuelTypesManagerSection
              fuelVouchers={fuelVouchers}
              deposits={fuelDeposits}
              onUpdateDeposit={handleSaveFuelDeposit}
              onUpdateDeposits={handleUpdateFuelDepositsList}
              onShowToast={showToast}
            />
          ) : currentView === 'rendimientos' ? (
            /* Rendimientos de Camiones y Maquinarias */
            <RendimientosSection
              trips={truckPerformanceTrips}
              fleet={fleet}
              employees={drivers}
              obras={obras}
              fuelVouchers={fuelVouchers}
              isLoading={isLoadingRendimientos}
              onSaveTrips={handleSaveTruckPerformanceTrips}
              onDeleteTrip={handleDeleteTruckPerformanceTrip}
            />
          ) : (
            /* Expendio de Combustible (22 Columnas) View */
            <FuelVoucherSection
              vouchers={fuelVouchers}
              fleet={fleet}
              employees={drivers}
              deposits={fuelDeposits}
              issuedVouchers={issuedVouchers}
              onOpenCreateModal={() => {
                setFuelVoucherToEdit(null);
                setPreselectedDepositForVoucher(null);
                setInitialVoucherIdForExpendio(null);
                setIsCreateFuelVoucherModalOpen(true);
              }}
              onRendirVale={(voucher) => handleProceedToRendicion(voucher)}
              onSwitchToIssuedVouchers={() => setCurrentView('vales')}
              onViewDetails={(voucher) => setSelectedFuelVoucherForDetail(voucher)}
              onViewIssuedVoucher={(voucher) => setSelectedIssuedVoucherForDetail(voucher)}
              onEditVoucher={(voucher) => {
                setFuelVoucherToEdit(voucher);
                setIsCreateFuelVoucherModalOpen(true);
              }}
              onDeleteVoucher={handleDeleteFuelVoucher}
              onChangeStatus={handleChangeFuelVoucherStatus}
              onExportCSV={handleExportFuelVouchersCSV}
              onOpenImportExport={() => handleOpenImportExport('expendio')}
              onOpenGoogleSheet={() => setSheetConnectorEntity('expendio')}
              googleSheetLinkedLabel={linkedSheetConfigs.expendio?.selectedTabTitle}
              onOpenClearRecords={() => setIsClearRecordsModalOpen(true)}
              onViewVehicle={(v) => handleOpenVehicleDetail(v)}
              onViewEmployee={(e) => setSelectedDriverForDetail(e)}
              onOpenVehicleAnalytics={(code) => setSelectedVehicleCodeForAnalytics(code)}
            />
          )}
          </Suspense>

        </main>
      </div>

      {/* Global Modals — Mounted ONLY when open so closed modals run 0 hooks/memos on every render */}
      <Suspense fallback={null}>
        {isCreateVehicleModalOpen && (
          <VehicleFormModal
            isOpen={true}
            onClose={() => {
              setIsCreateVehicleModalOpen(false);
              setVehicleToEdit(null);
            }}
            onSave={handleSaveVehicle}
            vehicleToEdit={vehicleToEdit}
            existingCount={fleet.length}
          />
        )}

        {Boolean(selectedVehicleCodeForAnalytics) && (
          <VehicleFuelAnalyticsModal
            isOpen={true}
            vehicleCode={selectedVehicleCodeForAnalytics}
            onClose={() => setSelectedVehicleCodeForAnalytics(null)}
            fleet={fleet}
            vouchers={fuelVouchers}
          />
        )}

        {isCreateDriverModalOpen && (
          <DriverFormModal
            isOpen={true}
            onClose={() => {
              setIsCreateDriverModalOpen(false);
              setDriverToEdit(null);
            }}
            onSave={handleSaveDriver}
            driverToEdit={driverToEdit}
            existingDriversCount={drivers.length}
            fleet={fleet}
          />
        )}

        {Boolean(selectedDriverForDetail) && (
          <DriverDetailModal
            isOpen={true}
            driver={selectedDriverForDetail}
            fleet={fleet}
            stockMovements={stockMovements}
            onClose={() => setSelectedDriverForDetail(null)}
            onEdit={(d) => {
              setSelectedDriverForDetail(null);
              setDriverToEdit(d);
              setIsCreateDriverModalOpen(true);
            }}
            onArchive={handleArchiveDriver}
            onDelete={handleDeleteDriver}
            onChangeStatus={handleChangeDriverStatus}
            onViewVehicle={(v) => {
              setSelectedDriverForDetail(null);
              handleOpenVehicleDetail(v);
            }}
          />
        )}

        {isCreateFuelDepositModalOpen && (
          <FuelDepositFormModal
            isOpen={true}
            onClose={() => {
              setIsCreateFuelDepositModalOpen(false);
              setFuelDepositToEdit(null);
            }}
            onSave={handleSaveFuelDeposit}
            depositToEdit={fuelDepositToEdit}
            existingCount={fuelDeposits.length}
            fleet={fleet}
            employees={drivers}
          />
        )}

        {Boolean(selectedFuelDepositForDetail) && (
          <FuelDepositDetailModal
            isOpen={true}
            deposit={selectedFuelDepositForDetail}
            vouchers={fuelVouchers}
            deposits={fuelDeposits}
            onClose={() => setSelectedFuelDepositForDetail(null)}
            onOpenEdit={(d) => {
              setSelectedFuelDepositForDetail(null);
              setFuelDepositToEdit(d);
              setIsCreateFuelDepositModalOpen(true);
            }}
            onOpenRefill={(d) => {
              setSelectedFuelDepositForDetail(null);
              setFuelDepositToRefill(d);
              setRefillModalInitialTab('refill');
              setIsRefillModalOpen(true);
            }}
            onOpenStockAdjustment={(d) => {
              setSelectedFuelDepositForDetail(null);
              setFuelDepositToRefill(d);
              setRefillModalInitialTab('adjustment');
              setIsRefillModalOpen(true);
            }}
            onNewDispensaryFromDeposit={handleNewDispensaryFromDeposit}
            onDelete={handleDeleteFuelDeposit}
            onDeleteVoucher={handleDeleteFuelVoucher}
            onUpdateDeposit={handleSaveFuelDeposit}
            onSaveFuelAssignments={async (stationId, fuelNames) => {
              const updated = assignFuelsToStation(fuelDeposits, stationId, fuelNames);
              const target = updated.find(d => d.id === stationId);
              if (target) {
                const res = await apiSaveItemsStrict('fuel_deposits', target);
                if (!res.ok) {
                  showToast(res.error || 'No se pudo guardar la asignación en Supabase.');
                  return;
                }
              }
              setFuelDeposits(updated);
              if (target) setSelectedFuelDepositForDetail(target);
              showToast('Combustibles asignados y confirmados en Supabase.');
            }}
          />
        )}

        {isRefillModalOpen && (
          <FuelDepositRefillModal
            isOpen={true}
            deposit={fuelDepositToRefill}
            initialTab={refillModalInitialTab}
            onClose={() => {
              setIsRefillModalOpen(false);
              setFuelDepositToRefill(null);
            }}
            onConfirmRefill={handleRefillDeposit}
          />
        )}

        {isCreateFuelVoucherModalOpen && (
          <FuelVoucherFormModal
            isOpen={true}
            onClose={() => {
              setIsCreateFuelVoucherModalOpen(false);
              setFuelVoucherToEdit(null);
              setPreselectedDepositForVoucher(null);
              setInitialVoucherIdForExpendio(null);
              setAiPrefillFuelDraft(null);
              setActiveBagDocForAi(null);
            }}
            onSave={handleSaveFuelVoucher}
            voucherToEdit={fuelVoucherToEdit}
            aiPrefillDraft={aiPrefillFuelDraft}
            existingCount={fuelVouchers.length}
            existingVouchers={fuelVouchers}
            fleet={fleet}
            employees={drivers}
            deposits={fuelDeposits}
            obras={obras}
            preselectedDeposit={preselectedDepositForVoucher}
            issuedVouchers={issuedVouchers}
            initialSelectedVoucherId={initialVoucherIdForExpendio}
            bolsaDocumentos={bolsaDocumentos}
            onLinkBolsaDocument={(docId, targetId, label) => {
              const found = bolsaDocumentosRef.current.find(d => d.id === docId);
              if (found) void markBagDocLinked(found, 'FUEL_VOUCHER', targetId, label);
            }}
          />
        )}

        {Boolean(selectedFuelVoucherForDetail) && (
          <FuelVoucherDetailModal
            isOpen={true}
            voucher={selectedFuelVoucherForDetail}
            fleet={fleet}
            employees={drivers}
            deposits={fuelDeposits}
            issuedVouchers={issuedVouchers}
            linkedDocuments={
              selectedFuelVoucherForDetail
                ? bolsaDocumentos.filter(
                    d => d.linkedTargetType === 'FUEL_VOUCHER' && d.linkedTargetId === selectedFuelVoucherForDetail.id
                  )
                : []
            }
            onUnlinkDocument={handleUnlinkBolsaDocumento}
            onClose={() => setSelectedFuelVoucherForDetail(null)}
            onEdit={(v) => {
              setSelectedFuelVoucherForDetail(null);
              setFuelVoucherToEdit(v);
              setIsCreateFuelVoucherModalOpen(true);
            }}
            onDelete={handleDeleteFuelVoucher}
            onChangeStatus={handleChangeFuelVoucherStatus}
            onViewVehicle={(v) => {
              setSelectedFuelVoucherForDetail(null);
              handleOpenVehicleDetail(v);
            }}
            onViewEmployee={(e) => {
              setSelectedFuelVoucherForDetail(null);
              setSelectedDriverForDetail(e);
            }}
            onViewIssuedVoucher={(iv) => {
              setSelectedFuelVoucherForDetail(null);
              setSelectedIssuedVoucherForDetail(iv);
            }}
          />
        )}

        {isCreateIssuedVoucherModalOpen && (
          <IssuedVoucherFormModal
            isOpen={true}
            onClose={() => {
              setIsCreateIssuedVoucherModalOpen(false);
              setIssuedVoucherToEdit(null);
              setAiPrefillIssuedVoucherDraft(null);
              setActiveBagDocForAi(null);
            }}
            onSave={handleSaveIssuedVoucher}
            voucherToEdit={issuedVoucherToEdit}
            aiPrefillDraft={aiPrefillIssuedVoucherDraft}
            fleet={fleet}
            employees={drivers}
            deposits={fuelDeposits}
            existingCount={issuedVouchers.length}
            bolsaDocumentos={bolsaDocumentos}
            onLinkBolsaDocument={(docId, targetId, label) => {
              const found = bolsaDocumentosRef.current.find(d => d.id === docId);
              if (found) void markBagDocLinked(found, 'ISSUED_VOUCHER', targetId, label);
            }}
          />
        )}

        {Boolean(selectedIssuedVoucherForDetail) && (
          <IssuedVoucherDetailModal
            isOpen={true}
            voucher={selectedIssuedVoucherForDetail}
            fleet={fleet}
            employees={drivers}
            onClose={() => setSelectedIssuedVoucherForDetail(null)}
            onEdit={(v) => {
              setSelectedIssuedVoucherForDetail(null);
              setIssuedVoucherToEdit(v);
              setIsCreateIssuedVoucherModalOpen(true);
            }}
            onDelete={handleDeleteIssuedVoucher}
            onProceedToRendicion={handleProceedToRendicion}
            onViewExpendio={(expendioId) => {
              const found = fuelVouchers.find(fv => fv.id === expendioId);
              if (found) {
                setSelectedIssuedVoucherForDetail(null);
                setSelectedFuelVoucherForDetail(found);
              }
            }}
          />
        )}

        {isCreateParteModalOpen && (
          <ParteDiarioFormModal
            isOpen={true}
            onClose={() => {
              setIsCreateParteModalOpen(false);
              setParteToEdit(null);
              setAiPrefillParteDraft(null);
              setActiveBagDocForAi(null);
            }}
            onSave={handleSaveParteDiario}
            parteToEdit={parteToEdit}
            aiPrefillDraft={aiPrefillParteDraft}
            fleet={fleet}
            employees={drivers}
            obras={obras}
            partesDiarios={partesDiarios}
            clients={clients}
            rentals={rentals}
            invoices={arcaInvoices}
            bolsaDocumentos={bolsaDocumentos}
            onLinkBolsaDocument={(docId, targetId, label) => {
              const found = bolsaDocumentosRef.current.find(d => d.id === docId);
              if (found) void markBagDocLinked(found, 'PARTE_DIARIO', targetId, label);
            }}
          />
        )}

        {Boolean(aiInvoiceRemitoReview) && (
          <AiInvoiceRemitoReviewModal
            isOpen={true}
            mode={aiInvoiceRemitoReview?.mode || 'FACTURA'}
            docItem={aiInvoiceRemitoReview?.docItem || null}
            aiData={aiInvoiceRemitoReview?.aiData || null}
            arcaConfig={loadArcaConfig()}
            proveedores={proveedores}
            rentals={rentals}
            onClose={() => {
              setAiInvoiceRemitoReview(null);
              setActiveBagDocForAi(null);
            }}
            onAcceptVentaInvoice={async (newInvoice, docItem) => {
              const ok = await handleSaveArcaInvoices([newInvoice, ...arcaInvoicesRef.current]);
              if (!ok) return false;
              await markBagDocLinked(
                docItem,
                'FACTURA_VENTA',
                newInvoice.id,
                `${newInvoice.tipoComprobante.replace(/_/g, ' ')} ${formatInvoiceNumber(newInvoice)} · ${newInvoice.esMigradaOtroSistema ? 'Otro Sistema' : 'Del Sistema'}`
              );
              setActiveBagDocForAi(null);
              showToast(
                newInvoice.esMigradaOtroSistema
                  ? `Factura ${formatInvoiceNumber(newInvoice)} (Otro Sistema) guardada en Supabase.`
                  : `Factura ${formatInvoiceNumber(newInvoice)} (Del Sistema) guardada en Supabase.`
              );
              return true;
            }}
            onAcceptPurchaseInvoice={async (newPurchase, newProveedorIfNeeded, docItem) => {
              if (newProveedorIfNeeded) {
                await handleSaveProveedor(newProveedorIfNeeded);
              }
              const ok = await handleSavePurchaseInvoice(newPurchase);
              if (!ok) return false;
              await markBagDocLinked(
                docItem,
                'FACTURA_COMPRA',
                newPurchase.id,
                `Compra ${newPurchase.nroComprobanteCompleto} · ${newPurchase.proveedorNombre}`
              );
              setActiveBagDocForAi(null);
              showToast(`Factura de Compra ${newPurchase.nroComprobanteCompleto} guardada en Compras.`);
              return true;
            }}
            onAcceptRemito={async (remitoPayload, isEditFlagForCustomNumber, docItem) => {
              try {
                const resp = await fetch('/api/remitos/emit', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    remito: remitoPayload,
                    isEdit: isEditFlagForCustomNumber,
                  }),
                });
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok || !data?.success || !data?.remito) {
                  showToast(data?.error || 'No se pudo guardar el Remito en Supabase.');
                  return false;
                }
                const saved: ArcaRemito = data.remito;
                const numLabel = `${String(saved.puntoVenta).padStart(4, '0')}-${String(saved.numeroComprobante).padStart(8, '0')}`;
                await markBagDocLinked(
                  docItem,
                  'REMITO',
                  saved.id,
                  `Remito ${saved.letra || 'R'} ${numLabel} · ${saved.razonSocialReceptor}`
                );
                setActiveBagDocForAi(null);
                showToast(`Remito ${numLabel} guardado y confirmado en Supabase.`);
                return true;
              } catch (err: any) {
                showToast(err?.message || 'Error de conexión al guardar remito.');
                return false;
              }
            }}
          />
        )}

        {Boolean(selectedParteForDetail) && (
          <ParteDiarioDetailModal
            isOpen={true}
            parte={selectedParteForDetail}
            onClose={() => setSelectedParteForDetail(null)}
            onEdit={(p) => {
              setSelectedParteForDetail(null);
              setParteToEdit(p);
              setIsCreateParteModalOpen(true);
            }}
            employees={drivers}
            supabaseRegistros={supabaseRegistros}
            supabaseUsuarios={supabaseUsuarios}
            supabaseLicencias={supabaseLicencias}
            supabaseCategorias={supabaseCategorias}
            rentals={rentals}
            invoices={arcaInvoices}
            fuelVouchers={fuelVouchers}
            fleet={fleet}
            partesDiarios={partesDiarios}
            linkedDocuments={
              selectedParteForDetail
                ? bolsaDocumentos.filter(
                    d =>
                      d.linkedTargetType === 'PARTE_DIARIO' &&
                      (d.linkedTargetId === selectedParteForDetail.id ||
                        (selectedParteForDetail.fotoUrl && d.url === selectedParteForDetail.fotoUrl))
                  )
                : []
            }
            bolsaDocumentos={bolsaDocumentos}
            onLinkBolsaDocument={(docId, targetId, label) => {
              const found = bolsaDocumentosRef.current.find(d => d.id === docId);
              if (found) void markBagDocLinked(found, 'PARTE_DIARIO', targetId, label);
            }}
            onUnlinkDocument={handleUnlinkBolsaDocumento}
            onUpdateParte={async (updatedParte) => {
              const res = await handleSaveParteDiario(updatedParte);
              if (res?.ok) {
                setSelectedParteForDetail(updatedParte);
              }
              return res;
            }}
            onNavigateToCobranzas={() => {
              setSelectedParteForDetail(null);
              setCurrentView('cobranzas');
            }}
          />
        )}

        {isCreateObraModalOpen && (
          <ObraFormModal
            isOpen={true}
            onClose={() => {
              setIsCreateObraModalOpen(false);
              setObraToEdit(null);
              setDefaultClientForNewObra(null);
            }}
            onSave={handleSaveObra}
            editingObra={obraToEdit}
            clients={clients}
            obras={obras}
            defaultClient={defaultClientForNewObra}
            onQuickCreateClient={handleQuickCreateClient}
          />
        )}

        {isColumnModalOpen && (
          <ColumnVisibilityModal
            isOpen={true}
            onClose={() => setIsColumnModalOpen(false)}
            visibleColumns={fleetColumnConfig.visible}
            columnOrder={fleetColumnConfig.order}
            onSaveConfig={handleSaveFleetColumnConfig}
            onResetDefaults={handleResetFleetColumns}
          />
        )}

        {isCalculatorModalOpen && (
          <PricingCalculatorModal
            isOpen={true}
            onClose={() => setIsCalculatorModalOpen(false)}
            fleet={fleet}
          />
        )}

        {importExportModalState.isOpen && (
          <DataImportExportModal
            isOpen={true}
            entityType={importExportModalState.entityType}
            currentData={getCurrentDataForImportExport(importExportModalState.entityType)}
            allAppData={{
              flota: fleet,
              empleados: drivers,
              expendio: fuelVouchers,
              vales: issuedVouchers,
              partesDiarios: partesDiarios,
              gastosMantenimiento: expensesLogs,
              obras: obras
            }}
            onClose={() => setImportExportModalState(prev => ({ ...prev, isOpen: false }))}
            onImportSuccess={handleImportSuccess}
            onClearEntityRecords={handleClearEntityRecords}
            onClearAllRecords={handleClearAllRecords}
          />
        )}

        {sheetConnectorEntity !== null && (
          <GoogleSheetConnectorModal
            isOpen={true}
            onClose={() => setSheetConnectorEntity(null)}
            entity={sheetConnectorEntity || 'expendio'}
            existingData={
              sheetConnectorEntity === 'vales'
                ? issuedVouchers
                : sheetConnectorEntity === 'partesDiarios'
                  ? partesDiarios
                  : sheetConnectorEntity === 'gastosMantenimiento'
                    ? expensesLogs
                    : fuelVouchers
            }
            context={{
              obras,
              fleet,
              employees: drivers,
            }}
            onSyncedSuccess={(persistedItems, savedConfig) => {
              const activeEntity = sheetConnectorEntity || 'expendio';
              setLinkedSheetConfigs(prev => ({ ...prev, [activeEntity]: savedConfig }));
              if (activeEntity === 'expendio') {
                setFuelVouchers(persistedItems);
              } else if (activeEntity === 'vales') {
                setIssuedVouchers(persistedItems);
              } else if (activeEntity === 'partesDiarios') {
                setPartesDiarios(persistedItems);
              } else if (activeEntity === 'gastosMantenimiento') {
                setExpensesLogs(persistedItems);
              }
            }}
            onShowToast={showToast}
          />
        )}

        {isDatabaseModalOpen && (
          <DatabaseStatusModal
            isOpen={true}
            onClose={() => setIsDatabaseModalOpen(false)}
            fleet={fleet}
            drivers={drivers}
            fuelVouchers={fuelVouchers}
            fuelDeposits={fuelDeposits}
            issuedVouchers={issuedVouchers}
            obras={obras}
            partesDiarios={partesDiarios}
            rentals={rentals}
            hardwareProducts={hardwareProducts}
            aridos={aridos}
            soilServices={soilServices}
            supabaseRegistrosCount={supabaseRegistros.length}
            supabaseUsuariosCount={supabaseUsuarios.length}
            onDataSynced={() => showToast('¡Datos migrados y sincronizados con Supabase!')}
            onPullFromCloud={async () => {
              await loadFromSupabaseCloud(true);
              if (loadedCloudGroupsRef.current.has('attendance_logs')) {
                await loadSupabaseData();
              }
            }}
            onClearAllData={handleClearAllRecords}
          />
        )}

        {isTelemetryModalOpen && (
          <ESP32TelemetryModal
            isOpen={true}
            onClose={() => setIsTelemetryModalOpen(false)}
            fleet={fleet}
          />
        )}

        {isLoginModalOpen && (
          <LoginModal
            isOpen={true}
            onClose={() => setIsLoginModalOpen(false)}
            onLoginSuccess={handleLoginSuccess}
          />
        )}

        {isSiteSettingsModalOpen && (
          <SiteSettingsModal
            isOpen={true}
            initialTab={siteSettingsInitialTab}
            onClose={() => setIsSiteSettingsModalOpen(false)}
            currentUser={userSession}
            fleet={fleet}
            onSaveFleet={async (newFleet) => {
              if (newFleet.length > 0) {
                const res = await apiSaveItemsStrict('vehicles', newFleet);
                if (!res.ok) {
                  showToast(res.error || 'No se pudo guardar el orden de equipos en Supabase.');
                  return;
                }
              }
              setFleet(newFleet);
              showToast('Orden de equipos confirmado en Supabase.');
            }}
            onUsersUpdated={syncActiveSessionFromUsersList}
          />
        )}

        {isClearRecordsModalOpen && (
          <ClearRecordsModal
            isOpen={true}
            onClose={() => setIsClearRecordsModalOpen(false)}
            currentView={currentView}
            counts={{
              flota: fleet.length,
              empleados: drivers.length,
              expendio: fuelVouchers.length,
              vales: issuedVouchers.length,
              partesDiarios: partesDiarios.length,
              obras: obras.length,
              depositos: fuelDeposits.length,
              alquileres: rentals.length,
              ferreteria: hardwareProducts.length
            }}
            onClearEntity={handleClearEntityRecords}
            onClearAll={handleClearAllRecords}
            onShowToast={showToast}
          />
        )}
      </Suspense>

      {/* Global Confirmation Modal for Any Delete / Archive Operation */}
      {Boolean(pendingDeleteConfirm) && (
        <ConfirmDeleteModal
          isOpen={true}
          title={pendingDeleteConfirm?.title}
          itemName={pendingDeleteConfirm?.itemName || ''}
          description={pendingDeleteConfirm?.description}
          confirmLabel={pendingDeleteConfirm?.confirmLabel}
          cancelLabel={pendingDeleteConfirm?.cancelLabel}
          onConfirm={() => {
            pendingDeleteConfirm?.onConfirm();
            setPendingDeleteConfirm(null);
          }}
          onCancel={() => setPendingDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
