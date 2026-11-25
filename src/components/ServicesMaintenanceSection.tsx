import React, { useState, useMemo, useEffect } from 'react';
import { 
  VehicleServiceLog, 
  VehicleExpenseLog, 
  Vehicle, 
  Driver,
  StockItem, 
  FuelDispensary, 
  StockMovement,
  ServiceType,
  ExpenseCategory,
  FinePaymentStatus,
  ServiceItemUsed
} from '../types';
import { 
  exportServicesToCSV, 
  exportExpensesToCSV, 
  exportFinesToCSV,
  formatCurrency 
} from '../services/storage';
import {
  apiSaveItemsStrict,
  apiDeleteItemStrict,
  apiClearCollectionStrict,
} from '../services/api';
import { SearchableSelect } from './SearchableSelect';
import { 
  Wrench, 
  Receipt, 
  Truck, 
  PlusCircle, 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  Clock, 
  CheckSquare, 
  Square, 
  DollarSign, 
  BarChart3, 
  X, 
  FileText, 
  FileSpreadsheet,
  Link2,
  Plus, 
  Trash2, 
  Edit3, 
  Droplet, 
  Package, 
  Building, 
  CheckCircle2, 
  AlertCircle,
  Briefcase,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Check,
  Info,
  BookOpen,
  ShieldAlert,
  MapPin,
  UserCheck
} from 'lucide-react';

interface ServicesMaintenanceSectionProps {
  services: VehicleServiceLog[];
  expenses: VehicleExpenseLog[];
  fleet: Vehicle[];
  drivers?: Driver[];
  stockItems: StockItem[];
  fuelVouchers: FuelDispensary[];
  stockMovements: StockMovement[];
  onSaveServices: (services: VehicleServiceLog[]) => void;
  onSaveExpenses: (expenses: VehicleExpenseLog[]) => void;
  initialTab?: 'services' | 'expenses' | 'fines' | 'costCenter' | 'alerts' | 'plan';
  onNavigateToFlota?: () => void;
  onOpenSheetConnector?: () => void;
  googleSheetLinkedLabel?: string;
  onShowToast?: (msg: string) => void;
}

const SERVICE_TYPE_LABELS: Record<ServiceType, { name: string; color: string }> = {
  SERVICE_PREVENTIVO: { name: 'Service Preventivo', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  REPARACION_CORRECTIVA: { name: 'Reparación Correctiva', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  TALLER_EXTERNO: { name: 'Taller Externo', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  REVISION_GENERAL: { name: 'Revisión General', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  CAMBIO_NEUMATICOS_ORUGAS: { name: 'Neumáticos / Orugas', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' }
};

const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  LUBRICANTES_ACEITES: 'Lubricantes & Aceites',
  REPUESTOS_CONSUMIBLES: 'Repuestos & Consumibles',
  MANO_OBRA_TALLER: 'Mano de Obra & Taller',
  NEUMATICOS_ORUGAS: 'Neumáticos & Orugas',
  COMBUSTIBLE_DIRECTO: 'Combustible Directo',
  SEGURO_DOCUMENTACION: 'Seguro & Habilitación',
  MULTAS_INFRACCIONES: 'Multas & Infracciones',
  VARIOS_EQUIPO: 'Varios Equipo'
};

const FINE_STATUS_META: Record<FinePaymentStatus, { label: string; badgeClass: string }> = {
  PENDIENTE: { label: 'Pendiente de Pago', badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
  PAGADA: { label: 'Pagada', badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  DESCARGO: { label: 'En Descargo / Apelada', badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  DESCONTADA_CHOFER: { label: 'Descontada a Chofer', badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' }
};

const FINE_INFRACTION_TYPES: string[] = [
  'Exceso de Velocidad',
  'Exceso de Peso / Balanza',
  'Documentación / RTO / VTV / Seguro',
  'Luces / Elementos de Seguridad',
  'Estacionamiento / Carga y Descarga',
  'Peaje Impago / Telepase',
  'Semáforo / Señalización Vial',
  'Carga Mal Estibada / Sin Lona',
  'Otra Infracción'
];

const isTruckLikeVehicle = (v: Vehicle): boolean =>
  /camion|volcador|batea|tractor|chasis|camioneta|utilitario|furgon|remolque|carreton|semirremolque/i.test(
    `${v.clasificacion || ''} ${v.modeloMarca || ''}`
  );

export const ServicesMaintenanceSection: React.FC<ServicesMaintenanceSectionProps> = ({
  services,
  expenses,
  fleet,
  drivers = [],
  stockItems,
  fuelVouchers,
  stockMovements,
  onSaveServices,
  onSaveExpenses,
  initialTab = 'services',
  onNavigateToFlota,
  onOpenSheetConnector,
  googleSheetLinkedLabel,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'services' | 'expenses' | 'fines' | 'costCenter' | 'alerts' | 'plan'>(initialTab);
  const [alertsStatusFilter, setAlertsStatusFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'OK'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState<string>('ALL');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('ALL');
  const [expenseCompletenessFilter, setExpenseCompletenessFilter] = useState<'ALL' | 'INCOMPLETE' | 'COMPLETE'>('ALL');
  const [fineStatusFilter, setFineStatusFilter] = useState<'ALL' | FinePaymentStatus>('ALL');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Modals
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<VehicleServiceLog | null>(null);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<VehicleExpenseLog | null>(null);

  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'service' | 'expense' | 'all_services' | 'all_expenses';
    id?: string;
    title: string;
  } | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);

  // Service Form State
  const [srvEquipoId, setSrvEquipoId] = useState('');
  const [srvFecha, setSrvFecha] = useState(new Date().toISOString().slice(0, 10));
  const [srvHora, setSrvHora] = useState('09:00');
  const [srvHorometro, setSrvHorometro] = useState<number>(0);
  const [srvTipo, setSrvTipo] = useState<ServiceType>('SERVICE_PREVENTIVO');
  const [srvMecanico, setSrvMecanico] = useState('Esteban Pereyra (Mecánico Pañol)');
  const [srvLugar, setSrvLugar] = useState('Pañol Central - Taller Base');
  const [srvTrabajos, setSrvTrabajos] = useState('');
  
  // Service Checkboxes
  const [chkFiltroAceite, setChkFiltroAceite] = useState(true);
  const [chkFiltroCombustible, setChkFiltroCombustible] = useState(true);
  const [chkFiltroAire, setChkFiltroAire] = useState(false);
  const [chkFiltroHidraulico, setChkFiltroHidraulico] = useState(false);
  const [chkAceiteMotor, setChkAceiteMotor] = useState(true);
  const [chkAceiteHidraulico, setChkAceiteHidraulico] = useState(false);

  // Service Insumos List
  const [srvInsumos, setSrvInsumos] = useState<ServiceItemUsed[]>([]);
  const [srvManoObraCost, setSrvManoObraCost] = useState<number>(0);
  const [srvComprobante, setSrvComprobante] = useState('');
  const [srvProveedor, setSrvProveedor] = useState('Pañol Central');
  const [srvObs, setSrvObs] = useState('');
  const [srvProximoHorometro, setSrvProximoHorometro] = useState<number>(0);

  // Expense Form State
  const [expEquipoId, setExpEquipoId] = useState('');
  const [expFecha, setExpFecha] = useState(new Date().toISOString().slice(0, 10));
  const [expComprobante, setExpComprobante] = useState('');
  const [expProveedor, setExpProveedor] = useState('');
  const [expCategoria, setExpCategoria] = useState<ExpenseCategory>('MANO_OBRA_TALLER');
  const [expConcepto, setExpConcepto] = useState('');
  const [expMonto, setExpMonto] = useState<number>(0);
  const [expCantidad, setExpCantidad] = useState<string>('');
  const [expMarcaRepuesto, setExpMarcaRepuesto] = useState('');
  const [expSubcategoriaOriginal, setExpSubcategoriaOriginal] = useState('');
  const [expResponsableNombre, setExpResponsableNombre] = useState('');
  const [expObs, setExpObs] = useState('');
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [expenseModalError, setExpenseModalError] = useState<string | null>(null);

  // Fine (Multa) Modal State
  const [isFineModalOpen, setIsFineModalOpen] = useState(false);
  const [editingFine, setEditingFine] = useState<VehicleExpenseLog | null>(null);
  const [fineEquipoId, setFineEquipoId] = useState('');
  const [fineFecha, setFineFecha] = useState(new Date().toISOString().slice(0, 10));
  const [fineVencimiento, setFineVencimiento] = useState('');
  const [fineActaNumero, setFineActaNumero] = useState('');
  const [fineOrganismo, setFineOrganismo] = useState('');
  const [fineTipoInfraccion, setFineTipoInfraccion] = useState(FINE_INFRACTION_TYPES[0]);
  const [fineDetalle, setFineDetalle] = useState('');
  const [fineLugar, setFineLugar] = useState('');
  const [fineChoferId, setFineChoferId] = useState('');
  const [fineChoferNombre, setFineChoferNombre] = useState('');
  const [fineEstadoPago, setFineEstadoPago] = useState<FinePaymentStatus>('PENDIENTE');
  const [fineFechaPago, setFineFechaPago] = useState('');
  const [fineMonto, setFineMonto] = useState<number>(0);
  const [fineObs, setFineObs] = useState('');
  const [isSavingFine, setIsSavingFine] = useState(false);
  const [fineModalError, setFineModalError] = useState<string | null>(null);
  const [togglingFineId, setTogglingFineId] = useState<string | null>(null);

  const nonFineExpenses = useMemo(
    () => expenses.filter(e => e.categoria !== 'MULTAS_INFRACCIONES'),
    [expenses]
  );

  const fineExpenses = useMemo(
    () => expenses.filter(e => e.categoria === 'MULTAS_INFRACCIONES'),
    [expenses]
  );

  const sortedFleetForFines = useMemo(
    () =>
      [...fleet].sort((a, b) => {
        const aTruck = isTruckLikeVehicle(a) ? 0 : 1;
        const bTruck = isTruckLikeVehicle(b) ? 0 : 1;
        if (aTruck !== bTruck) return aTruck - bTruck;
        return (a.modeloMarca || '').localeCompare(b.modeloMarca || '', 'es');
      }),
    [fleet]
  );

  // Metrics
  const metrics = useMemo(() => {
    const totalServicesCount = services.length;
    const totalServicesCost = services.reduce((sum, s) => sum + (s.costoTotalService || 0), 0);
    const totalExpensesCost = nonFineExpenses.reduce((sum, e) => sum + (e.montoTotal || 0), 0);
    const totalFinesCost = fineExpenses.reduce((sum, e) => sum + (e.montoTotal || 0), 0);
    const pendingFines = fineExpenses.filter(f => (f.multaEstadoPago || 'PENDIENTE') === 'PENDIENTE');
    const pendingFinesCost = pendingFines.reduce((sum, e) => sum + (e.montoTotal || 0), 0);
    const paidFines = fineExpenses.filter(
      f => f.multaEstadoPago === 'PAGADA' || f.multaEstadoPago === 'DESCONTADA_CHOFER'
    );
    const paidFinesCost = paidFines.reduce((sum, e) => sum + (e.montoTotal || 0), 0);
    const incompleteExpensesCount = nonFineExpenses.filter(
      e => Array.isArray(e.camposIncompletos) && e.camposIncompletos.length > 0
    ).length;

    const uniqueVehiclesServiced = new Set(services.map(s => s.equipoId)).size;
    const uniqueVehiclesFined = new Set(
      fineExpenses.map(f => f.equipoId || f.equipoPatenteOrCodigo || f.equipoModeloMarca).filter(Boolean)
    ).size;

    return {
      totalServicesCount,
      totalServicesCost,
      totalExpensesCost,
      totalFinesCost,
      totalFinesCount: fineExpenses.length,
      pendingFinesCount: pendingFines.length,
      pendingFinesCost,
      paidFinesCount: paidFines.length,
      paidFinesCost,
      uniqueVehiclesServiced,
      uniqueVehiclesFined,
      incompleteExpensesCount
    };
  }, [services, nonFineExpenses, fineExpenses]);

  // Machine Cost Center Cross-Calculations
  const costCenterPerVehicle = useMemo(() => {
    return fleet.map(v => {
      // 1. Fuel Cost for this vehicle
      const vehicleDispensaries = fuelVouchers.filter(fv => 
        fv.codigoEquipo === v.codigoInterno || 
        fv.patente === v.patente || 
        (fv.codigoEquipo || '').toLowerCase().includes((v.modeloMarca || '').toLowerCase()) ||
        fv.id === v.id
      );
      const fuelCost = vehicleDispensaries.reduce((sum, f) => sum + (f.totalImporte || (f.cantidad * (f.precioUnitario || 2509))), 0);
      const fuelLiters = vehicleDispensaries.reduce((sum, f) => sum + (f.cantidad || 0), 0);

      // 2. Stock & Lubricants Movement Cost for this vehicle
      const vehicleStockMovs = stockMovements.filter(sm => 
        sm.equipoId === v.id || 
        (sm.equipoCodigoOrPatente || '').toLowerCase().includes((v.patente || v.modeloMarca || '').toLowerCase())
      );
      const lubricantsCost = vehicleStockMovs.reduce((sum, sm) => sum + (sm.cantidad * 3500), 0); // Est cost per liter/unit

      // 3. Services & Maintenance Cost
      const vehicleServices = services.filter(s => s.equipoId === v.id);
      const servicesCost = vehicleServices.reduce((sum, s) => sum + (s.costoTotalService || 0), 0);

      // 4. Expenses & Invoices (match by equipoId or imported equipoPatenteOrCodigo)
      const normCode = String(v.codigoInterno || '').trim().toUpperCase();
      const normEquipCode = String(v.codigo || '').trim().toUpperCase();
      const normPlate = String(v.patente || '').trim().toUpperCase();
      const allVehicleExpenses = expenses.filter(e => {
        if (e.equipoId === v.id) return true;
        const expCode = String(e.equipoPatenteOrCodigo || '').trim().toUpperCase();
        if (!expCode) return false;
        return (
          (normCode && expCode === normCode) ||
          (normEquipCode && expCode === normEquipCode) ||
          (normPlate && normPlate !== 'S/P' && expCode === normPlate)
        );
      });
      const vehicleExpenses = allVehicleExpenses.filter(e => e.categoria !== 'MULTAS_INFRACCIONES');
      const vehicleFines = allVehicleExpenses.filter(e => e.categoria === 'MULTAS_INFRACCIONES');
      const expensesCost = vehicleExpenses.reduce((sum, e) => sum + (e.montoTotal || 0), 0);
      const finesCost = vehicleFines.reduce((sum, e) => sum + (e.montoTotal || 0), 0);

      const totalDirectCost = fuelCost + lubricantsCost + servicesCost + expensesCost + finesCost;

      return {
        vehicle: v,
        fuelCost,
        fuelLiters,
        lubricantsCost,
        servicesCost,
        expensesCost,
        finesCost,
        totalDirectCost,
        serviceCount: vehicleServices.length,
        expenseCount: vehicleExpenses.length,
        fineCount: vehicleFines.length
      };
    }).sort((a, b) => b.totalDirectCost - a.totalDirectCost);
  }, [fleet, fuelVouchers, stockMovements, services, expenses]);

  // Filtered Services List
  const filteredServices = useMemo(() => {
    return services.filter(s => {
      const q = searchQuery.toLowerCase();
      const matchSearch = (
        s.equipoModeloMarca.toLowerCase().includes(q) ||
        (s.equipoPatenteOrCodigo || '').toLowerCase().includes(q) ||
        s.trabajosRealizados.toLowerCase().includes(q) ||
        s.mecanicoResponsable.toLowerCase().includes(q) ||
        (s.comprobanteFacturaNum || '').toLowerCase().includes(q)
      );
      const matchVehicle = selectedVehicleFilter === 'ALL' || s.equipoId === selectedVehicleFilter;
      return matchSearch && matchVehicle;
    }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [services, searchQuery, selectedVehicleFilter]);

  // Filtered Expenses List
  const filteredExpenses = useMemo(() => {
    const selectedVehicleObj =
      selectedVehicleFilter !== 'ALL' && selectedVehicleFilter !== 'UNASSIGNED'
        ? fleet.find(v => v.id === selectedVehicleFilter)
        : null;
    const selCodes = selectedVehicleObj
      ? new Set(
          [
            selectedVehicleObj.id,
            selectedVehicleObj.codigoInterno,
            selectedVehicleObj.codigo,
            selectedVehicleObj.patente,
          ]
            .map(x => String(x || '').trim().toUpperCase())
            .filter(x => x && x !== 'S/P')
        )
      : null;

    return nonFineExpenses.filter(e => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        (e.equipoModeloMarca || '').toLowerCase().includes(q) ||
        (e.equipoPatenteOrCodigo || '').toLowerCase().includes(q) ||
        (e.concepto || '').toLowerCase().includes(q) ||
        (e.proveedor || '').toLowerCase().includes(q) ||
        (e.numeroComprobante || '').toLowerCase().includes(q) ||
        (e.subcategoriaOriginal || '').toLowerCase().includes(q) ||
        (e.marcaRepuesto || '').toLowerCase().includes(q) ||
        (e.responsableNombre || '').toLowerCase().includes(q);

      let matchVehicle = true;
      if (selectedVehicleFilter === 'UNASSIGNED') {
        matchVehicle = !e.equipoId && (!e.equipoPatenteOrCodigo || e.equipoModeloMarca === 'Sin equipo asignado');
      } else if (selectedVehicleFilter !== 'ALL') {
        const expCode = String(e.equipoPatenteOrCodigo || '').trim().toUpperCase();
        matchVehicle =
          e.equipoId === selectedVehicleFilter ||
          (selCodes !== null && Boolean(expCode && selCodes.has(expCode)));
      }

      const matchCategory = expenseCategoryFilter === 'ALL' || e.categoria === expenseCategoryFilter;
      const isIncomplete = Array.isArray(e.camposIncompletos) && e.camposIncompletos.length > 0;
      const matchCompleteness =
        expenseCompletenessFilter === 'ALL' ||
        (expenseCompletenessFilter === 'INCOMPLETE' && isIncomplete) ||
        (expenseCompletenessFilter === 'COMPLETE' && !isIncomplete);

      return matchSearch && matchVehicle && matchCategory && matchCompleteness;
    }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [nonFineExpenses, fleet, searchQuery, selectedVehicleFilter, expenseCategoryFilter, expenseCompletenessFilter]);

  // Filtered Fines (Multas) List
  const filteredFines = useMemo(() => {
    const selectedVehicleObj =
      selectedVehicleFilter !== 'ALL' && selectedVehicleFilter !== 'UNASSIGNED'
        ? fleet.find(v => v.id === selectedVehicleFilter)
        : null;
    const selCodes = selectedVehicleObj
      ? new Set(
          [
            selectedVehicleObj.id,
            selectedVehicleObj.codigoInterno,
            selectedVehicleObj.codigo,
            selectedVehicleObj.patente,
          ]
            .map(x => String(x || '').trim().toUpperCase())
            .filter(x => x && x !== 'S/P')
        )
      : null;

    return fineExpenses.filter(e => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        (e.equipoModeloMarca || '').toLowerCase().includes(q) ||
        (e.equipoPatenteOrCodigo || '').toLowerCase().includes(q) ||
        (e.multaActaNumero || e.numeroComprobante || '').toLowerCase().includes(q) ||
        (e.multaOrganismo || e.proveedor || '').toLowerCase().includes(q) ||
        (e.multaTipoInfraccion || '').toLowerCase().includes(q) ||
        (e.concepto || '').toLowerCase().includes(q) ||
        (e.multaLugar || '').toLowerCase().includes(q) ||
        (e.multaChoferNombre || e.responsableNombre || '').toLowerCase().includes(q);

      let matchVehicle = true;
      if (selectedVehicleFilter !== 'ALL' && selectedVehicleFilter !== 'UNASSIGNED') {
        const expCode = String(e.equipoPatenteOrCodigo || '').trim().toUpperCase();
        matchVehicle =
          e.equipoId === selectedVehicleFilter ||
          (selCodes !== null && Boolean(expCode && selCodes.has(expCode)));
      }

      const currentStatus: FinePaymentStatus = e.multaEstadoPago || 'PENDIENTE';
      const matchStatus = fineStatusFilter === 'ALL' || currentStatus === fineStatusFilter;

      return matchSearch && matchVehicle && matchStatus;
    }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [fineExpenses, fleet, searchQuery, selectedVehicleFilter, fineStatusFilter]);

  // Preventive Maintenance & Overdue Service Calculations for entire Fleet
  const fleetAlerts = useMemo(() => {
    return fleet.map(v => {
      const vServices = services.filter(s => s.equipoId === v.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const lastService = vServices[0] || null;

      const currentUnit = (v.odometro && v.odometro > 0) ? 'KMS' : 'HORAS';
      const currentUsage = currentUnit === 'KMS' ? (v.odometro || 0) : (v.horometro || 0);

      // Next scheduled service threshold
      let targetUsage: number;
      if (lastService && lastService.proximoServiceHorometro && lastService.proximoServiceHorometro > 0) {
        targetUsage = lastService.proximoServiceHorometro;
      } else if (lastService && lastService.horometroOdometro > 0) {
        const interval = currentUnit === 'KMS' ? 10000 : 250;
        targetUsage = lastService.horometroOdometro + interval;
      } else {
        const interval = currentUnit === 'KMS' ? 10000 : 250;
        targetUsage = currentUsage > 0 ? (currentUsage + interval) : interval;
      }

      const diff = targetUsage - currentUsage;
      const warningThreshold = currentUnit === 'KMS' ? 1000 : 50;

      let status: 'CRITICAL' | 'WARNING' | 'OK';
      let statusLabel: string;
      let statusBadgeColor: string;

      if (diff <= 0) {
        status = 'CRITICAL';
        statusLabel = `VENCIDO (${Math.abs(diff).toLocaleString('es-AR')} ${currentUnit === 'KMS' ? 'km' : 'hs'})`;
        statusBadgeColor = 'bg-red-500/20 text-red-400 border-red-500/40';
      } else if (diff <= warningThreshold) {
        status = 'WARNING';
        statusLabel = `PRÓXIMO (${diff.toLocaleString('es-AR')} ${currentUnit === 'KMS' ? 'km' : 'hs'})`;
        statusBadgeColor = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      } else {
        status = 'OK';
        statusLabel = `Al Día (${diff.toLocaleString('es-AR')} ${currentUnit === 'KMS' ? 'km' : 'hs'})`;
        statusBadgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      }

      const interval = currentUnit === 'KMS' ? 10000 : 250;
      const baseUsage = Math.max(0, targetUsage - interval);
      const usedInInterval = Math.max(0, currentUsage - baseUsage);
      const progressPercent = Math.min(100, Math.max(0, Math.round((usedInInterval / interval) * 100)));

      return {
        vehicle: v,
        currentUsage,
        currentUnit,
        lastService,
        targetUsage,
        diff,
        status,
        statusLabel,
        statusBadgeColor,
        progressPercent,
        totalServices: vServices.length
      };
    }).sort((a, b) => {
      const order = { CRITICAL: 0, WARNING: 1, OK: 2 };
      if (order[a.status] !== order[b.status]) {
        return order[a.status] - order[b.status];
      }
      return a.diff - b.diff;
    });
  }, [fleet, services]);

  const alertCounts = useMemo(() => {
    const critical = fleetAlerts.filter(a => a.status === 'CRITICAL').length;
    const warning = fleetAlerts.filter(a => a.status === 'WARNING').length;
    const ok = fleetAlerts.filter(a => a.status === 'OK').length;
    return { critical, warning, ok, totalAlerts: critical + warning };
  }, [fleetAlerts]);

  const filteredAlerts = useMemo(() => {
    return fleetAlerts.filter(a => {
      const q = searchQuery.toLowerCase();
      const matchSearch = (
        a.vehicle.modeloMarca.toLowerCase().includes(q) ||
        (a.vehicle.patente || '').toLowerCase().includes(q) ||
        (a.vehicle.codigoInterno || '').toLowerCase().includes(q) ||
        (a.vehicle.clasificacion || '').toLowerCase().includes(q)
      );
      const matchVehicle = selectedVehicleFilter === 'ALL' || a.vehicle.id === selectedVehicleFilter;
      const matchStatus = alertsStatusFilter === 'ALL' || a.status === alertsStatusFilter;
      return matchSearch && matchVehicle && matchStatus;
    });
  }, [fleetAlerts, searchQuery, selectedVehicleFilter, alertsStatusFilter]);

  // Handlers for Services
  const handleOpenServiceModal = (srv?: VehicleServiceLog) => {
    if (srv) {
      setEditingService(srv);
      setSrvEquipoId(srv.equipoId);
      setSrvFecha(srv.fecha);
      setSrvHora(srv.hora || '09:00');
      setSrvHorometro(srv.horometroOdometro);
      setSrvTipo(srv.tipoService);
      setSrvMecanico(srv.mecanicoResponsable);
      setSrvLugar(srv.tallerLugar || 'Pañol Central - Taller Base');
      setSrvTrabajos(srv.trabajosRealizados);
      setChkFiltroAceite(!!srv.filtroAceiteCambiado);
      setChkFiltroCombustible(!!srv.filtroCombustibleCambiado);
      setChkFiltroAire(!!srv.filtroAireCambiado);
      setChkFiltroHidraulico(!!srv.filtroHidraulicoCambiado);
      setChkAceiteMotor(!!srv.aceiteMotorCambiado);
      setChkAceiteHidraulico(!!srv.aceiteHidraulicoCambiado);
      setSrvInsumos(srv.insumosUtilizados || []);
      setSrvManoObraCost(srv.costoManoObra || 0);
      setSrvComprobante(srv.comprobanteFacturaNum || '');
      setSrvProveedor(srv.proveedor || 'Pañol Central');
      setSrvObs(srv.observaciones || '');
      setSrvProximoHorometro(srv.proximoServiceHorometro || (srv.horometroOdometro + 500));
    } else {
      setEditingService(null);
      const defaultVehicle = fleet[0];
      setSrvEquipoId(defaultVehicle ? defaultVehicle.id : '');
      setSrvFecha(new Date().toISOString().slice(0, 10));
      setSrvHora('09:00');
      setSrvHorometro(defaultVehicle?.horometro || 2500);
      setSrvTipo('SERVICE_PREVENTIVO');
      setSrvMecanico('Esteban Pereyra (Mecánico Pañol)');
      setSrvLugar('Pañol Central - Taller Base');
      setSrvTrabajos('Service preventivo de motor. Cambio de aceite y filtros de rutina.');
      setChkFiltroAceite(true);
      setChkFiltroCombustible(true);
      setChkFiltroAire(false);
      setChkFiltroHidraulico(false);
      setChkAceiteMotor(true);
      setChkAceiteHidraulico(false);
      setSrvInsumos([]);
      setSrvManoObraCost(25000);
      setSrvComprobante('');
      setSrvProveedor('Pañol Central');
      setSrvObs('');
      setSrvProximoHorometro((defaultVehicle?.horometro || 2500) + 500);
    }
    setIsServiceModalOpen(true);
  };

  const handleOpenServiceForVehicle = (vehicle: Vehicle, currentUsage: number) => {
    setEditingService(null);
    setSrvEquipoId(vehicle.id);
    setSrvFecha(new Date().toISOString().slice(0, 10));
    setSrvHora('09:00');
    setSrvHorometro(currentUsage);
    setSrvTipo('SERVICE_PREVENTIVO');
    setSrvMecanico('Esteban Pereyra (Mecánico Pañol)');
    setSrvLugar('Pañol Central - Taller Base');
    setSrvTrabajos(`Service preventivo de motor y filtros para ${vehicle.modeloMarca}.`);
    setChkFiltroAceite(true);
    setChkFiltroCombustible(true);
    setChkFiltroAire(false);
    setChkFiltroHidraulico(false);
    setChkAceiteMotor(true);
    setChkAceiteHidraulico(false);
    setSrvInsumos([]);
    setSrvManoObraCost(25000);
    setSrvComprobante('');
    setSrvProveedor('Pañol Central');
    setSrvObs('');
    const interval = (vehicle.odometro && vehicle.odometro > 0) ? 10000 : 250;
    setSrvProximoHorometro(currentUsage + interval);
    setIsServiceModalOpen(true);
  };

  const handleSaveService = (e: React.FormEvent) => {
    e.preventDefault();
    const vehicle = fleet.find(v => v.id === srvEquipoId);
    if (!vehicle || !srvTrabajos.trim()) return;

    const insumosCost = srvInsumos.reduce((sum, item) => sum + (item.costoEstimado || 0), 0);
    const totalCost = (Number(srvManoObraCost) || 0) + insumosCost;

    if (editingService) {
      const updated = services.map(s => {
        if (s.id === editingService.id) {
          return {
            ...s,
            equipoId: vehicle.id,
            equipoModeloMarca: vehicle.modeloMarca,
            equipoPatenteOrCodigo: vehicle.patente || vehicle.codigoInterno || vehicle.id,
            fecha: srvFecha,
            hora: srvHora,
            horometroOdometro: Number(srvHorometro),
            tipoService: srvTipo,
            mecanicoResponsable: srvMecanico.trim(),
            tallerLugar: srvLugar.trim() || undefined,
            trabajosRealizados: srvTrabajos.trim(),
            filtroAceiteCambiado: chkFiltroAceite,
            filtroCombustibleCambiado: chkFiltroCombustible,
            filtroAireCambiado: chkFiltroAire,
            filtroHidraulicoCambiado: chkFiltroHidraulico,
            aceiteMotorCambiado: chkAceiteMotor,
            aceiteHidraulicoCambiado: chkAceiteHidraulico,
            insumosUtilizados: srvInsumos,
            costoManoObra: Number(srvManoObraCost) || 0,
            costoInsumos: insumosCost,
            costoTotalService: totalCost,
            comprobanteFacturaNum: srvComprobante.trim() || undefined,
            proveedor: srvProveedor.trim() || undefined,
            observaciones: srvObs.trim() || undefined,
            proximoServiceHorometro: Number(srvProximoHorometro) || undefined
          };
        }
        return s;
      });
      onSaveServices(updated);
    } else {
      const newService: VehicleServiceLog = {
        id: `SRV-${Date.now()}`,
        equipoId: vehicle.id,
        equipoModeloMarca: vehicle.modeloMarca,
        equipoPatenteOrCodigo: vehicle.patente || vehicle.codigoInterno || vehicle.id,
        fecha: srvFecha,
        hora: srvHora,
        horometroOdometro: Number(srvHorometro),
        tipoService: srvTipo,
        mecanicoResponsable: srvMecanico.trim(),
        tallerLugar: srvLugar.trim() || 'Pañol Central',
        trabajosRealizados: srvTrabajos.trim(),
        filtroAceiteCambiado: chkFiltroAceite,
        filtroCombustibleCambiado: chkFiltroCombustible,
        filtroAireCambiado: chkFiltroAire,
        filtroHidraulicoCambiado: chkFiltroHidraulico,
        aceiteMotorCambiado: chkAceiteMotor,
        aceiteHidraulicoCambiado: chkAceiteHidraulico,
        insumosUtilizados: srvInsumos,
        costoManoObra: Number(srvManoObraCost) || 0,
        costoInsumos: insumosCost,
        costoTotalService: totalCost,
        comprobanteFacturaNum: srvComprobante.trim() || undefined,
        proveedor: srvProveedor.trim() || 'Pañol Central',
        observaciones: srvObs.trim() || undefined,
        proximoServiceHorometro: Number(srvProximoHorometro) || (Number(srvHorometro) + 500)
      };
      onSaveServices([newService, ...services]);
    }

    setIsServiceModalOpen(false);
  };

  const handleDeleteService = (id: string) => {
    const srv = services.find(s => s.id === id);
    setDeleteConfirmTarget({
      type: 'service',
      id,
      title: srv ? `${srv.equipoModeloMarca} (${srv.fecha})` : 'este service'
    });
  };

  // Handlers for Expenses
  const handleOpenExpenseModal = (exp?: VehicleExpenseLog) => {
    setExpenseModalError(null);
    if (exp) {
      setEditingExpense(exp);
      const matchedVehicle =
        fleet.find(
          v =>
            v.id === exp.equipoId ||
            (exp.equipoPatenteOrCodigo &&
              (v.codigoInterno === exp.equipoPatenteOrCodigo ||
                v.codigo === exp.equipoPatenteOrCodigo ||
                v.patente === exp.equipoPatenteOrCodigo))
        ) || null;
      setExpEquipoId(matchedVehicle ? matchedVehicle.id : exp.equipoId || '');
      setExpFecha(exp.fecha || '');
      setExpComprobante(exp.numeroComprobante || '');
      setExpProveedor(exp.proveedor || '');
      setExpCategoria(exp.categoria || 'VARIOS_EQUIPO');
      setExpConcepto(exp.concepto || '');
      setExpMonto(exp.montoTotal ?? 0);
      setExpCantidad(exp.cantidad !== undefined ? String(exp.cantidad) : '');
      setExpMarcaRepuesto(exp.marcaRepuesto || '');
      setExpSubcategoriaOriginal(exp.subcategoriaOriginal || '');
      setExpResponsableNombre(exp.responsableNombre || '');
      setExpObs(exp.observaciones || '');
    } else {
      setEditingExpense(null);
      const defaultVehicle = fleet[0];
      setExpEquipoId(defaultVehicle ? defaultVehicle.id : '');
      setExpFecha(new Date().toISOString().slice(0, 10));
      setExpComprobante(`Factura A-0004-${Math.floor(1000 + Math.random() * 9000)}`);
      setExpProveedor('');
      setExpCategoria('REPUESTOS_CONSUMIBLES');
      setExpConcepto('');
      setExpMonto(0);
      setExpCantidad('');
      setExpMarcaRepuesto('');
      setExpSubcategoriaOriginal('');
      setExpResponsableNombre('');
      setExpObs('');
    }
    setIsExpenseModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseModalError(null);

    const vehicle = fleet.find(v => v.id === expEquipoId);
    const isEditing = Boolean(editingExpense);

    // For new records created inside our system, enforce complete required fields.
    // For existing legacy records imported incomplete, allow saving partial improvements too.
    if (!isEditing) {
      if (!vehicle) {
        setExpenseModalError('Seleccioná un equipo afectado.');
        return;
      }
      if (!expFecha.trim()) {
        setExpenseModalError('Ingresá la fecha del comprobante.');
        return;
      }
      if (!expNumeroComprobanteValid(expComprobante)) {
        setExpenseModalError('Ingresá el Nº de Comprobante o Factura.');
        return;
      }
      if (!expProveedor.trim()) {
        setExpenseModalError('Ingresá el Proveedor o Taller.');
        return;
      }
      if (!expConcepto.trim()) {
        setExpenseModalError('Ingresá el Concepto / Detalle.');
        return;
      }
      if (!Number.isFinite(Number(expMonto)) || Number(expMonto) === 0) {
        setExpenseModalError('Ingresá un Monto Total válido (distinto de 0).');
        return;
      }
    }

    const parsedQty = expCantidad.trim() !== '' ? Number(expCantidad.replace(',', '.')) : undefined;
    const resolvedVehicleName = vehicle
      ? vehicle.modeloMarca
      : editingExpense?.equipoModeloMarca || 'Sin equipo asignado';
    const resolvedVehicleCode = vehicle
      ? vehicle.patente || vehicle.codigoInterno || vehicle.id
      : editingExpense?.equipoPatenteOrCodigo || '';

    const missingFields: string[] = [];
    if (!expFecha.trim()) missingFields.push('fecha');
    if (!vehicle && (!resolvedVehicleCode || resolvedVehicleName === 'Sin equipo asignado')) missingFields.push('equipo');
    if (!expComprobante.trim()) missingFields.push('comprobante');
    if (!expProveedor.trim()) missingFields.push('proveedor');
    if (!expConcepto.trim()) missingFields.push('concepto');
    if (!Number.isFinite(Number(expMonto)) || Number(expMonto) === 0) missingFields.push('monto');

    const record: VehicleExpenseLog = editingExpense
      ? {
          ...editingExpense,
          equipoId: vehicle ? vehicle.id : editingExpense.equipoId || '',
          equipoModeloMarca: resolvedVehicleName,
          equipoPatenteOrCodigo: resolvedVehicleCode,
          fecha: expFecha.trim(),
          numeroComprobante: expComprobante.trim(),
          proveedor: expProveedor.trim(),
          categoria: expCategoria,
          concepto: expConcepto.trim(),
          montoTotal: Number(expMonto) || 0,
          cantidad: parsedQty !== undefined && Number.isFinite(parsedQty) ? parsedQty : undefined,
          marcaRepuesto: expMarcaRepuesto.trim() || undefined,
          subcategoriaOriginal: expSubcategoriaOriginal.trim() || editingExpense.subcategoriaOriginal || undefined,
          responsableNombre: expResponsableNombre.trim() || undefined,
          observaciones: expObs.trim() || undefined,
          camposIncompletos: missingFields,
        }
      : {
          id: `EXP-${Date.now()}`,
          equipoId: vehicle!.id,
          equipoModeloMarca: vehicle!.modeloMarca,
          equipoPatenteOrCodigo: vehicle!.patente || vehicle!.codigoInterno || vehicle!.id,
          fecha: expFecha.trim(),
          numeroComprobante: expComprobante.trim(),
          proveedor: expProveedor.trim(),
          categoria: expCategoria,
          concepto: expConcepto.trim(),
          montoTotal: Number(expMonto) || 0,
          cantidad: parsedQty !== undefined && Number.isFinite(parsedQty) ? parsedQty : undefined,
          marcaRepuesto: expMarcaRepuesto.trim() || undefined,
          subcategoriaOriginal: expSubcategoriaOriginal.trim() || undefined,
          responsableNombre: expResponsableNombre.trim() || undefined,
          observaciones: expObs.trim() || undefined,
          fuenteOrigen: 'MANUAL',
          camposIncompletos: [],
        };

    setIsSavingExpense(true);
    const persistRes = await apiSaveItemsStrict<VehicleExpenseLog>('vehicle_expenses', record);
    setIsSavingExpense(false);

    if (!persistRes.ok) {
      setExpenseModalError(
        persistRes.error || 'No se pudo confirmar el guardado del gasto en Supabase PostgreSQL.'
      );
      return;
    }

    const updatedList = editingExpense
      ? expenses.map(ex => (ex.id === editingExpense.id ? record : ex))
      : [record, ...expenses];
    onSaveExpenses(updatedList);
    onShowToast?.(
      editingExpense
        ? 'Factura / gasto actualizado y confirmado en Supabase PostgreSQL.'
        : 'Factura / gasto guardado y confirmado en Supabase PostgreSQL.'
    );
    setIsExpenseModalOpen(false);
  };

  // Handlers for Fines (Multas)
  const handleOpenFineModal = (fine?: VehicleExpenseLog) => {
    setFineModalError(null);
    if (fine) {
      setEditingFine(fine);
      const matchedVehicle =
        fleet.find(
          v =>
            v.id === fine.equipoId ||
            (fine.equipoPatenteOrCodigo &&
              (v.codigoInterno === fine.equipoPatenteOrCodigo ||
                v.codigo === fine.equipoPatenteOrCodigo ||
                v.patente === fine.equipoPatenteOrCodigo))
        ) || null;
      setFineEquipoId(matchedVehicle ? matchedVehicle.id : fine.equipoId || '');
      setFineFecha(fine.fecha || new Date().toISOString().slice(0, 10));
      setFineVencimiento(fine.multaFechaVencimiento || '');
      setFineActaNumero(fine.multaActaNumero || fine.numeroComprobante || '');
      setFineOrganismo(fine.multaOrganismo || fine.proveedor || '');
      const tipo = fine.multaTipoInfraccion || fine.subcategoriaOriginal || FINE_INFRACTION_TYPES[0];
      setFineTipoInfraccion(tipo);
      const prefix = `${tipo} — `;
      const rawConcept = fine.concepto || '';
      setFineDetalle(rawConcept.startsWith(prefix) ? rawConcept.slice(prefix.length) : rawConcept === tipo ? '' : rawConcept);
      setFineLugar(fine.multaLugar || '');
      setFineChoferId(fine.multaChoferId || '');
      setFineChoferNombre(fine.multaChoferNombre || fine.responsableNombre || '');
      setFineEstadoPago(fine.multaEstadoPago || 'PENDIENTE');
      setFineFechaPago(fine.multaFechaPago || '');
      setFineMonto(fine.montoTotal ?? 0);
      setFineObs(fine.observaciones || '');
    } else {
      setEditingFine(null);
      const defaultTruck = sortedFleetForFines[0];
      setFineEquipoId(defaultTruck ? defaultTruck.id : '');
      setFineFecha(new Date().toISOString().slice(0, 10));
      setFineVencimiento('');
      setFineActaNumero('');
      setFineOrganismo('');
      setFineTipoInfraccion(FINE_INFRACTION_TYPES[0]);
      setFineDetalle('');
      setFineLugar('');
      setFineChoferId('');
      setFineChoferNombre('');
      setFineEstadoPago('PENDIENTE');
      setFineFechaPago('');
      setFineMonto(0);
      setFineObs('');
    }
    setIsFineModalOpen(true);
  };

  const handleSaveFine = async (e: React.FormEvent) => {
    e.preventDefault();
    setFineModalError(null);

    const vehicle = fleet.find(v => v.id === fineEquipoId);
    if (!vehicle) {
      setFineModalError('Seleccioná el camión o unidad a la que corresponde imputar la multa.');
      return;
    }
    if (!fineFecha.trim()) {
      setFineModalError('Ingresá la fecha de la infracción.');
      return;
    }
    if (!fineActaNumero.trim()) {
      setFineModalError('Ingresá el Nº de Acta / Causa / Comprobante de la multa.');
      return;
    }
    if (!fineOrganismo.trim()) {
      setFineModalError('Ingresá el Organismo o Jurisdicción emisora (ej: Vialidad, CNRT, Policía Caminera, Juzgado de Faltas).');
      return;
    }
    if (!Number.isFinite(Number(fineMonto)) || Number(fineMonto) <= 0) {
      setFineModalError('Ingresá un importe válido mayor a $0 para imputar el gasto al camión.');
      return;
    }

    const matchedDriver = fineChoferId ? drivers.find(d => d.id === fineChoferId) : undefined;
    const resolvedChoferNombre = matchedDriver?.nombreApellido || fineChoferNombre.trim() || undefined;
    const tipoStr = fineTipoInfraccion.trim() || 'Infracción de tránsito';
    const detalleStr = fineDetalle.trim();
    const conceptoFinal = detalleStr ? `${tipoStr} — ${detalleStr}` : tipoStr;

    const record: VehicleExpenseLog = {
      ...(editingFine || {}),
      id: editingFine ? editingFine.id : `MUL-${Date.now()}`,
      equipoId: vehicle.id,
      equipoModeloMarca: vehicle.modeloMarca,
      equipoPatenteOrCodigo: vehicle.patente || vehicle.codigoInterno || vehicle.id,
      fecha: fineFecha.trim(),
      numeroComprobante: fineActaNumero.trim(),
      proveedor: fineOrganismo.trim(),
      categoria: 'MULTAS_INFRACCIONES',
      concepto: conceptoFinal,
      montoTotal: Number(fineMonto) || 0,
      observaciones: fineObs.trim() || undefined,
      subcategoriaOriginal: tipoStr,
      responsableNombre: resolvedChoferNombre,
      multaActaNumero: fineActaNumero.trim(),
      multaOrganismo: fineOrganismo.trim(),
      multaTipoInfraccion: tipoStr,
      multaLugar: fineLugar.trim() || undefined,
      multaChoferId: matchedDriver?.id || fineChoferId || undefined,
      multaChoferNombre: resolvedChoferNombre,
      multaEstadoPago: fineEstadoPago,
      multaFechaVencimiento: fineVencimiento.trim() || undefined,
      multaFechaPago:
        fineEstadoPago === 'PAGADA' || fineEstadoPago === 'DESCONTADA_CHOFER'
          ? fineFechaPago.trim() || new Date().toISOString().slice(0, 10)
          : undefined,
      fuenteOrigen: 'MANUAL',
      camposIncompletos: [],
    };

    setIsSavingFine(true);
    const persistRes = await apiSaveItemsStrict<VehicleExpenseLog>('vehicle_expenses', record);
    setIsSavingFine(false);

    if (!persistRes.ok) {
      setFineModalError(
        persistRes.error || 'No se pudo confirmar el guardado de la multa en Supabase PostgreSQL.'
      );
      return;
    }

    const updatedList = editingFine
      ? expenses.map(ex => (ex.id === editingFine.id ? record : ex))
      : [record, ...expenses];
    onSaveExpenses(updatedList);
    onShowToast?.(
      editingFine
        ? `Multa actualizada e imputada a ${vehicle.modeloMarca} en Supabase PostgreSQL.`
        : `Multa cargada e imputada como gasto a ${vehicle.modeloMarca} en Supabase PostgreSQL.`
    );
    setIsFineModalOpen(false);
  };

  const handleToggleFinePaid = async (fine: VehicleExpenseLog) => {
    const isCurrentlyPaid = fine.multaEstadoPago === 'PAGADA';
    const nextStatus: FinePaymentStatus = isCurrentlyPaid ? 'PENDIENTE' : 'PAGADA';
    const updated: VehicleExpenseLog = {
      ...fine,
      multaEstadoPago: nextStatus,
      multaFechaPago: nextStatus === 'PAGADA' ? new Date().toISOString().slice(0, 10) : undefined,
    };
    setTogglingFineId(fine.id);
    const res = await apiSaveItemsStrict<VehicleExpenseLog>('vehicle_expenses', updated);
    setTogglingFineId(null);
    if (!res.ok) {
      onShowToast?.(res.error || 'No se pudo actualizar el estado de la multa en Supabase.');
      return;
    }
    onSaveExpenses(expenses.map(ex => (ex.id === fine.id ? updated : ex)));
    onShowToast?.(
      nextStatus === 'PAGADA'
        ? `Multa ${fine.multaActaNumero || fine.numeroComprobante} marcada como PAGADA en Supabase.`
        : `Multa ${fine.multaActaNumero || fine.numeroComprobante} marcada como PENDIENTE.`
    );
  };

  const handleDeleteExpense = (id: string) => {
    const exp = expenses.find(e => e.id === id);
    setDeleteModalError(null);
    const isFine = exp?.categoria === 'MULTAS_INFRACCIONES';
    setDeleteConfirmTarget({
      type: 'expense',
      id,
      title: exp
        ? `${exp.equipoModeloMarca || 'Sin equipo'} - ${exp.numeroComprobante || exp.concepto || exp.id}`
        : isFine
          ? 'esta multa'
          : 'este gasto/factura'
    });
  };

  const handleExecuteDelete = async () => {
    if (!deleteConfirmTarget) return;
    setDeleteModalError(null);

    if (deleteConfirmTarget.type === 'service' && deleteConfirmTarget.id) {
      setIsDeletingRecord(true);
      const res = await apiDeleteItemStrict('vehicle_services', deleteConfirmTarget.id);
      setIsDeletingRecord(false);
      if (!res.ok) {
        setDeleteModalError(res.error || 'Error eliminando el service en Supabase PostgreSQL.');
        return;
      }
      const updated = services.filter(s => s.id !== deleteConfirmTarget.id);
      onSaveServices(updated);
      onShowToast?.('Service eliminado de Supabase PostgreSQL.');
      setDeleteConfirmTarget(null);
      return;
    }

    if (deleteConfirmTarget.type === 'all_services') {
      setIsDeletingRecord(true);
      const res = await apiClearCollectionStrict('vehicle_services');
      setIsDeletingRecord(false);
      if (!res.ok) {
        setDeleteModalError(res.error || 'Error limpiando los services en Supabase PostgreSQL.');
        return;
      }
      onSaveServices([]);
      onShowToast?.('Todos los services fueron eliminados de Supabase PostgreSQL.');
      setDeleteConfirmTarget(null);
      return;
    }

    if (deleteConfirmTarget.type === 'expense' && deleteConfirmTarget.id) {
      const targetExp = expenses.find(e => e.id === deleteConfirmTarget.id);
      setIsDeletingRecord(true);
      const res = await apiDeleteItemStrict('vehicle_expenses', deleteConfirmTarget.id);
      setIsDeletingRecord(false);
      if (!res.ok) {
        setDeleteModalError(res.error || 'Error eliminando el registro en Supabase PostgreSQL.');
        return;
      }
      const updated = expenses.filter(e => e.id !== deleteConfirmTarget.id);
      onSaveExpenses(updated);
      onShowToast?.(
        targetExp?.categoria === 'MULTAS_INFRACCIONES'
          ? 'Multa eliminada de Supabase PostgreSQL.'
          : 'Factura / gasto eliminado de Supabase PostgreSQL.'
      );
      setDeleteConfirmTarget(null);
      return;
    }

    if (deleteConfirmTarget.type === 'all_expenses') {
      setIsDeletingRecord(true);
      if (fineExpenses.length === 0) {
        const res = await apiClearCollectionStrict('vehicle_expenses');
        setIsDeletingRecord(false);
        if (!res.ok) {
          setDeleteModalError(res.error || 'Error limpiando los gastos de mantenimiento en Supabase PostgreSQL.');
          return;
        }
        onSaveExpenses([]);
      } else {
        // Preservar las Multas cargadas y borrar solo facturas/gastos de taller
        for (const item of nonFineExpenses) {
          const res = await apiDeleteItemStrict('vehicle_expenses', item.id);
          if (!res.ok) {
            setIsDeletingRecord(false);
            setDeleteModalError(res.error || 'Error limpiando algunos gastos de mantenimiento en Supabase PostgreSQL.');
            return;
          }
        }
        setIsDeletingRecord(false);
        onSaveExpenses(fineExpenses);
      }
      onShowToast?.('Facturas y gastos de taller eliminados de Supabase PostgreSQL.');
      setDeleteConfirmTarget(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950/90 via-slate-900 to-indigo-900/60 p-6 border border-blue-500/20 shadow-2xl backdrop-blur-md">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/20 rounded-xl border border-blue-500/30 text-blue-400">
              <Wrench className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-wide text-white flex items-center gap-2">
                Services, Taller & Costos por Equipo
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Centro de Costos Directos
                </span>
              </h1>
              <p className="text-sm text-slate-300 mt-0.5">
                Historial de mantenimientos, cambio de filtros/aceites, facturas de repuestos y consolidación de costos por máquina.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenSheetConnector && (
              <button
                onClick={onOpenSheetConnector}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 transition flex items-center gap-1.5 cursor-pointer shadow-lg"
                title="Importar / sincronizar gastos de Mantenimiento desde Google Sheets hacia Supabase"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>{googleSheetLinkedLabel ? `Sheet: ${googleSheetLinkedLabel}` : 'Conectar Google Sheet (Gastos)'}</span>
                {googleSheetLinkedLabel && <Link2 className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
            )}
            {onNavigateToFlota && (
              <button
                onClick={onNavigateToFlota}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition flex items-center gap-1.5 cursor-pointer shadow-lg"
                title="Ver Parque de Maquinaria y Equipos"
              >
                <Truck className="w-4 h-4 text-cyan-400" />
                Parque de Flota ({fleet.length})
              </button>
            )}
            <button
              onClick={() => handleOpenServiceModal()}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-lg shadow-blue-900/30 flex items-center gap-1.5 cursor-pointer"
            >
              <Wrench className="w-4 h-4" />
              + Cargar Service
            </button>
            <button
              onClick={() => handleOpenExpenseModal()}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition shadow-lg shadow-purple-900/30 flex items-center gap-1.5 cursor-pointer"
            >
              <Receipt className="w-4 h-4" />
              + Cargar Factura / Gasto
            </button>
            <button
              onClick={() => handleOpenFineModal()}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow-lg shadow-rose-900/30 flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4" />
              + Cargar Multa
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Services Realizados</span>
            <Wrench className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white">{metrics.totalServicesCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">{metrics.uniqueVehiclesServiced} equipo(s) atendidos</div>
        </div>

        <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Costo Total Mantenimiento</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{formatCurrency(metrics.totalServicesCost)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Mano de obra e insumos</div>
        </div>

        <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Facturas de Repuestos & Taller</span>
            <Receipt className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-300">{formatCurrency(metrics.totalExpensesCost)}</div>
          <div className="text-[11px] text-slate-500 mt-1">{nonFineExpenses.length} comprobante(s)</div>
        </div>

        <div
          onClick={() => setActiveTab('fines')}
          className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 hover:border-rose-500/40 transition shadow-md cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Multas Imputadas</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400">{formatCurrency(metrics.totalFinesCost)}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {metrics.totalFinesCount} acta(s) • {metrics.pendingFinesCount} pendiente(s)
          </div>
        </div>

        <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 shadow-md col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Inversión Total en Flota</span>
            <BarChart3 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400">
            {formatCurrency(metrics.totalServicesCost + metrics.totalExpensesCost + metrics.totalFinesCost)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Services + Facturas + Multas</div>
        </div>
      </div>

      {/* Tabs & Toolbar */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('services')}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'services' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Wrench className="w-4 h-4" />
              Historial Services ({services.length})
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`relative flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'alerts' 
                  ? 'bg-red-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Alertas & Próximos
              {alertCounts.totalAlerts > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950">
                  {alertCounts.totalAlerts}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'expenses' 
                  ? 'bg-purple-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Receipt className="w-4 h-4" />
              Facturas & Gastos ({nonFineExpenses.length})
            </button>
            <button
              onClick={() => setActiveTab('fines')}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'fines' 
                  ? 'bg-rose-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              Multas & Infracciones ({fineExpenses.length})
              {metrics.pendingFinesCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950">
                  {metrics.pendingFinesCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('costCenter')}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'costCenter' 
                  ? 'bg-amber-500 text-slate-950 shadow-md' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Costos por Máquina
            </button>
            <button
              onClick={() => setActiveTab('plan')}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'plan' 
                  ? 'bg-cyan-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Plan Preventivo & Pautas
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {activeTab === 'services' && services.length > 0 && (
              <button
                onClick={() => setDeleteConfirmTarget({ type: 'all_services', title: 'todos los services registrados en el sistema' })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 transition flex items-center gap-1.5 border border-red-500/30 cursor-pointer"
                title="Eliminar todos los services de la base de datos"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpiar Services
              </button>
            )}
            {activeTab === 'expenses' && nonFineExpenses.length > 0 && (
              <button
                onClick={() => setDeleteConfirmTarget({ type: 'all_expenses', title: 'todas las facturas y gastos de taller registrados en el sistema (conserva las multas)' })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 transition flex items-center gap-1.5 border border-red-500/30 cursor-pointer"
                title="Eliminar todas las facturas de taller de la base de datos"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpiar Gastos
              </button>
            )}
            {activeTab === 'fines' ? (
              <button
                onClick={() => exportFinesToCSV(fineExpenses)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" /> Multas CSV
              </button>
            ) : (
              <>
                <button
                  onClick={() => exportServicesToCSV(services)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Services CSV
                </button>
                <button
                  onClick={() => exportExpensesToCSV(nonFineExpenses)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" /> Facturas CSV
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={
                activeTab === 'fines'
                  ? 'Buscar multa por patente, camión, Nº de acta, organismo, chofer, lugar o infracción...'
                  : 'Buscar por equipo, trabajo, repuesto, marca, comprobante, responsable o proveedor...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="w-full sm:w-64">
              <SearchableSelect
                options={[
                  { value: 'ALL', label: activeTab === 'fines' ? 'Todos los Camiones / Unidades' : 'Todos los Equipos de la Flota' },
                  ...(activeTab === 'expenses'
                    ? [{ value: 'UNASSIGNED', label: 'Sin equipo asignado (Histórico)' }]
                    : []),
                  ...(activeTab === 'fines' ? sortedFleetForFines : fleet).map(v => ({
                    value: v.id,
                    label: `${v.modeloMarca} (${v.patente || v.codigoInterno || v.codigo || v.id})`,
                    secondaryText: v.clasificacion || undefined,
                  })),
                ]}
                value={selectedVehicleFilter}
                onChange={val => setSelectedVehicleFilter(val || 'ALL')}
                placeholder={activeTab === 'fines' ? 'Filtrar por camión...' : 'Filtrar por equipo...'}
                searchPlaceholder="Escribí marca, modelo o patente..."
                clearValue="ALL"
                compact
              />
            </div>

            {activeTab === 'fines' && (
              <div className="w-full sm:w-52">
                <SearchableSelect
                  options={[
                    { value: 'ALL', label: 'Todos los Estados' },
                    ...(Object.entries(FINE_STATUS_META) as [FinePaymentStatus, { label: string }][]).map(([k, meta]) => ({
                      value: k,
                      label: meta.label,
                    })),
                  ]}
                  value={fineStatusFilter}
                  onChange={val => setFineStatusFilter((val as 'ALL' | FinePaymentStatus) || 'ALL')}
                  placeholder="Estado de multa..."
                  searchPlaceholder="Filtrar estado..."
                  clearValue="ALL"
                  compact
                />
              </div>
            )}

            {activeTab === 'expenses' && (
              <>
                <div className="w-full sm:w-52">
                  <SearchableSelect
                    options={[
                      { value: 'ALL', label: 'Todas las Categorías' },
                      ...Object.entries(EXPENSE_CATEGORY_LABELS)
                        .filter(([k]) => k !== 'MULTAS_INFRACCIONES')
                        .map(([k, label]) => ({
                          value: k,
                          label,
                        })),
                    ]}
                    value={expenseCategoryFilter}
                    onChange={val => setExpenseCategoryFilter(val || 'ALL')}
                    placeholder="Categoría..."
                    searchPlaceholder="Buscar categoría..."
                    clearValue="ALL"
                    compact
                  />
                </div>

                {metrics.incompleteExpensesCount > 0 && (
                  <div className="w-full sm:w-48">
                    <SearchableSelect
                      options={[
                        { value: 'ALL', label: `Todos (${nonFineExpenses.length})` },
                        { value: 'INCOMPLETE', label: `Incompletos (${metrics.incompleteExpensesCount})` },
                        { value: 'COMPLETE', label: `Completos (${nonFineExpenses.length - metrics.incompleteExpensesCount})` },
                      ]}
                      value={expenseCompletenessFilter}
                      onChange={val =>
                        setExpenseCompletenessFilter((val as 'ALL' | 'INCOMPLETE' | 'COMPLETE') || 'ALL')
                      }
                      placeholder="Estado de carga..."
                      searchPlaceholder="Filtrar estado..."
                      clearValue="ALL"
                      compact
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* TAB 1: Services List Table */}
        {activeTab === 'services' && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                  <th className="py-3 px-4">FECHA / HORA</th>
                  <th className="py-3 px-4">EQUIPO / MAQUINARIA</th>
                  <th className="py-3 px-3">TIPO & HORÓMETRO</th>
                  <th className="py-3 px-4">CAMBIOS & TRABAJOS REALIZADOS</th>
                  <th className="py-3 px-3 text-right">COSTO TOTAL</th>
                  <th className="py-3 px-4 text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No hay registros de services cargados. Haga clic en <strong>"+ Cargar Service"</strong> para agregar el primer mantenimiento.
                    </td>
                  </tr>
                ) : (
                  filteredServices.map(srv => {
                    const typeLabel = SERVICE_TYPE_LABELS[srv.tipoService] || SERVICE_TYPE_LABELS.SERVICE_PREVENTIVO;
                    return (
                      <tr key={srv.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-bold text-white">
                            <Calendar className="w-3.5 h-3.5 text-blue-400" />
                            {srv.fecha}
                          </div>
                          <div className="text-[11px] text-slate-500">{srv.hora || '09:00'} hs</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white text-sm flex items-center gap-1.5">
                            <Truck className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>{srv.equipoModeloMarca}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {srv.equipoPatenteOrCodigo} • {srv.mecanicoResponsable}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${typeLabel.color}`}>
                            {typeLabel.name}
                          </span>
                          <div className="text-[11px] text-slate-300 font-mono font-bold mt-1">
                            ⏱️ {srv.horometroOdometro.toLocaleString()} hs/kms
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {/* Badges of Filters and Oils changed */}
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {srv.filtroAceiteCambiado && <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 text-[10px] font-bold rounded border border-emerald-500/30">✓ Filtro Aceite</span>}
                            {srv.filtroCombustibleCambiado && <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 text-[10px] font-bold rounded border border-emerald-500/30">✓ Filtro Comb.</span>}
                            {srv.filtroAireCambiado && <span className="bg-blue-500/20 text-blue-300 px-1.5 py-0.2 text-[10px] font-bold rounded border border-blue-500/30">✓ Filtro Aire</span>}
                            {srv.filtroHidraulicoCambiado && <span className="bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 text-[10px] font-bold rounded border border-indigo-500/30">✓ Filtro Hidr.</span>}
                            {srv.aceiteMotorCambiado && <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.2 text-[10px] font-bold rounded border border-amber-500/30">✓ Aceite Motor</span>}
                            {srv.aceiteHidraulicoCambiado && <span className="bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 text-[10px] font-bold rounded border border-cyan-500/30">✓ Aceite Hidr.</span>}
                          </div>
                          <p className="text-slate-300 text-xs line-clamp-2">{srv.trabajosRealizados}</p>
                        </td>

                        <td className="py-3.5 px-3 text-right font-black text-sm text-emerald-400 whitespace-nowrap">
                          {formatCurrency(srv.costoTotalService)}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenServiceModal(srv)}
                              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                              title="Editar Service"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteService(srv.id)}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition"
                              title="Eliminar Service"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: Expenses & Invoices Table */}
        {activeTab === 'expenses' && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                  <th className="py-3 px-4">FECHA / COMPROBANTE</th>
                  <th className="py-3 px-4">EQUIPO AFECTADO</th>
                  <th className="py-3 px-3">PROVEEDOR / TALLER</th>
                  <th className="py-3 px-3">CATEGORÍA</th>
                  <th className="py-3 px-4">CONCEPTO / DETALLE</th>
                  <th className="py-3 px-3 text-right">MONTO TOTAL</th>
                  <th className="py-3 px-4 text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      No hay facturas o gastos directos que coincidan con el filtro. Haga clic en <strong>"+ Cargar Factura / Gasto"</strong> o conecte su <strong>Google Sheet</strong>.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map(exp => {
                    const missingFields = Array.isArray(exp.camposIncompletos) ? exp.camposIncompletos : [];
                    const isIncomplete = missingFields.length > 0;
                    return (
                      <tr key={exp.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                          <div className="font-bold text-white">
                            {exp.fecha || <span className="text-amber-400 font-normal italic">Sin fecha</span>}
                          </div>
                          <div className="text-[11px] text-amber-400">
                            {exp.numeroComprobante || <span className="text-slate-500 italic">Sin comprobante</span>}
                          </div>
                          {isIncomplete && (
                            <span
                              className="inline-block mt-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/35"
                              title={`Falta completar: ${missingFields.join(', ')}`}
                            >
                              Incompleto ({missingFields.join(', ')})
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white text-sm">
                            {exp.equipoModeloMarca && exp.equipoModeloMarca !== 'Sin equipo asignado'
                              ? exp.equipoModeloMarca
                              : <span className="text-slate-400 font-normal italic">Sin equipo asignado</span>}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {exp.equipoPatenteOrCodigo || '-'}
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="text-slate-200 font-medium">
                            {exp.proveedor || <span className="text-slate-500 italic">Sin proveedor</span>}
                          </div>
                          {exp.responsableNombre && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Resp: {exp.responsableNombre}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
                            {EXPENSE_CATEGORY_LABELS[exp.categoria] || exp.categoria}
                          </span>
                          {exp.subcategoriaOriginal && (
                            <div className="text-[10px] font-mono text-slate-400 mt-1">
                              {exp.subcategoriaOriginal}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-slate-300">
                          <div>
                            {exp.concepto || <span className="text-slate-500 italic">Sin descripción</span>}
                          </div>
                          {(exp.marcaRepuesto || exp.cantidad !== undefined) && (
                            <div className="flex flex-wrap gap-2 text-[10px] text-slate-400 mt-1">
                              {exp.marcaRepuesto && (
                                <span className="text-sky-300">Marca: {exp.marcaRepuesto}</span>
                              )}
                              {exp.cantidad !== undefined && (
                                <span className="font-mono">Cant: {exp.cantidad}</span>
                              )}
                            </div>
                          )}
                        </td>

                        <td
                          className={`py-3.5 px-3 text-right font-black text-sm whitespace-nowrap ${
                            exp.montoTotal < 0
                              ? 'text-rose-400'
                              : missingFields.includes('monto') && exp.montoTotal === 0
                                ? 'text-amber-400/80'
                                : 'text-purple-300'
                          }`}
                        >
                          {missingFields.includes('monto') && exp.montoTotal === 0
                            ? 'Sin monto'
                            : formatCurrency(exp.montoTotal)}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenExpenseModal(exp)}
                              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                              title="Editar / Completar Factura"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition"
                              title="Eliminar Factura"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2B: Multas & Infracciones Imputadas a Camiones */}
        {activeTab === 'fines' && (
          <div className="space-y-4">
            {/* Sub-header & KPIs de Multas */}
            <div className="bg-slate-950 border border-rose-500/25 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-400 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Registro de Multas e Infracciones de Tránsito / Transporte
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cargá actas de infracción y asignalas directamente al camión correspondiente. Cada multa se imputa automáticamente como gasto de la unidad en el Centro de Costos y en la Rentabilidad del Camión.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleOpenFineModal()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow-lg shadow-rose-950/40 flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Cargar Multa a Camión</span>
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                <div className="text-[11px] font-semibold text-slate-400">Total Multas Cargadas</div>
                <div className="text-xl font-black text-white font-mono mt-1">{metrics.totalFinesCount}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{metrics.uniqueVehiclesFined} unidad(es) afectada(s)</div>
              </div>
              <div className="bg-slate-950 border border-rose-500/30 rounded-xl p-3.5">
                <div className="text-[11px] font-semibold text-rose-300">Pendientes de Pago</div>
                <div className="text-xl font-black text-rose-400 font-mono mt-1">{formatCurrency(metrics.pendingFinesCost)}</div>
                <div className="text-[11px] text-rose-300/70 mt-0.5">{metrics.pendingFinesCount} acta(s) sin abonar</div>
              </div>
              <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-3.5">
                <div className="text-[11px] font-semibold text-emerald-300">Pagadas / Descontadas</div>
                <div className="text-xl font-black text-emerald-400 font-mono mt-1">{formatCurrency(metrics.paidFinesCost)}</div>
                <div className="text-[11px] text-emerald-300/70 mt-0.5">{metrics.paidFinesCount} multa(s) cancelada(s)</div>
              </div>
              <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3.5">
                <div className="text-[11px] font-semibold text-amber-300">Total Imputado a Flota</div>
                <div className="text-xl font-black text-amber-400 font-mono mt-1">{formatCurrency(metrics.totalFinesCost)}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Impacta en gastos por unidad</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                    <th className="py-3 px-4">FECHA / VENCIMIENTO</th>
                    <th className="py-3 px-4">CAMIÓN / UNIDAD</th>
                    <th className="py-3 px-3">ACTA / ORGANISMO</th>
                    <th className="py-3 px-4">INFRACCIÓN / CHOFER</th>
                    <th className="py-3 px-3 text-center">ESTADO</th>
                    <th className="py-3 px-3 text-right">IMPORTE IMPUTADO</th>
                    <th className="py-3 px-4 text-right">ACCIONES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredFines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        No hay multas cargadas que coincidan con el filtro. Hacé clic en{' '}
                        <strong>"+ Cargar Multa"</strong> para registrar e imputar una multa a un camión.
                      </td>
                    </tr>
                  ) : (
                    filteredFines.map(fine => {
                      const statusKey: FinePaymentStatus = fine.multaEstadoPago || 'PENDIENTE';
                      const statusMeta = FINE_STATUS_META[statusKey] || FINE_STATUS_META.PENDIENTE;
                      const todayIso = new Date().toISOString().slice(0, 10);
                      const isOverdue =
                        statusKey === 'PENDIENTE' &&
                        Boolean(fine.multaFechaVencimiento) &&
                        fine.multaFechaVencimiento! < todayIso;
                      const isPaid = statusKey === 'PAGADA';

                      return (
                        <tr key={fine.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 font-bold text-white">
                              <Calendar className="w-3.5 h-3.5 text-rose-400" />
                              <span>{fine.fecha || '-'}</span>
                            </div>
                            {fine.multaFechaVencimiento && (
                              <div className={`text-[11px] mt-0.5 ${isOverdue ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                                Vto: {fine.multaFechaVencimiento}{isOverdue ? ' (Vencida)' : ''}
                              </div>
                            )}
                            {fine.multaFechaPago && (
                              <div className="text-[10px] text-emerald-400 mt-0.5">
                                Pagada: {fine.multaFechaPago}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white text-sm flex items-center gap-1.5">
                              <Truck className="w-4 h-4 text-amber-400 shrink-0" />
                              <span>{fine.equipoModeloMarca || 'Sin unidad'}</span>
                            </div>
                            <div className="text-[11px] text-amber-300 font-mono mt-0.5">
                              {fine.equipoPatenteOrCodigo || '-'}
                            </div>
                          </td>

                          <td className="py-3.5 px-3">
                            <div className="font-mono font-bold text-rose-300">
                              {fine.multaActaNumero || fine.numeroComprobante || 'Sin Nº Acta'}
                            </div>
                            <div className="text-slate-200 font-medium mt-0.5">
                              {fine.multaOrganismo || fine.proveedor || '-'}
                            </div>
                            {fine.multaLugar && (
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                                <span>{fine.multaLugar}</span>
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-slate-300">
                            <div className="font-semibold text-white">
                              {fine.multaTipoInfraccion || fine.subcategoriaOriginal || 'Infracción'}
                            </div>
                            <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                              {fine.concepto}
                            </div>
                            {(fine.multaChoferNombre || fine.responsableNombre) && (
                              <div className="text-[11px] text-cyan-300 flex items-center gap-1 mt-1">
                                <UserCheck className="w-3 h-3 shrink-0" />
                                <span>Chofer: {fine.multaChoferNombre || fine.responsableNombre}</span>
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusMeta.badgeClass}`}>
                              {statusMeta.label}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 text-right font-black text-sm text-rose-400 font-mono whitespace-nowrap">
                            {formatCurrency(fine.montoTotal)}
                          </td>

                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                disabled={togglingFineId === fine.id}
                                onClick={() => handleToggleFinePaid(fine)}
                                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer border ${
                                  isPaid
                                    ? 'bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border-slate-700'
                                    : 'bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border-emerald-500/40'
                                }`}
                                title={isPaid ? 'Volver a Pendiente' : 'Marcar multa como Pagada'}
                              >
                                {isPaid ? <Clock className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                <span>{isPaid ? 'Pendiente' : 'Pagar'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenFineModal(fine)}
                                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
                                title="Editar Multa"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(fine.id)}
                                className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition cursor-pointer"
                                title="Eliminar Multa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Machine Cost Center (Cruce Automático de Gastos) */}
        {activeTab === 'costCenter' && (
          <div className="space-y-4">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  Centro de Costos Directos Consolidados por Maquinaria
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Suma automática en tiempo real de <strong>Combustibles</strong> + <strong>Lubricantes/Pañol</strong> + <strong>Services/Taller</strong> + <strong>Facturas Directas</strong> + <strong>Multas</strong>.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {costCenterPerVehicle.map(item => {
                const { vehicle, fuelCost, fuelLiters, lubricantsCost, servicesCost, expensesCost, finesCost, totalDirectCost, serviceCount, expenseCount, fineCount } = item;

                return (
                  <div key={vehicle.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-amber-500/40 transition">
                    <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                      <div>
                        <div className="font-bold text-white text-base flex items-center gap-2">
                          <Truck className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>{vehicle.modeloMarca}</span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {vehicle.patente || vehicle.codigoInterno || vehicle.id} • {vehicle.clasificacion}
                        </div>
                      </div>
                      <span className="text-xs font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-lg">
                        {vehicle.horometro ? `${vehicle.horometro.toLocaleString()} hs` : 'Activo'}
                      </span>
                    </div>

                    {/* Breakdown List */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between py-1 border-b border-slate-900">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Droplet className="w-3.5 h-3.5 text-amber-400" /> Combustible ({fuelLiters.toLocaleString()} Lts)
                        </span>
                        <span className="font-mono font-bold text-slate-200">{formatCurrency(fuelCost)}</span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-slate-900">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-blue-400" /> Aceites & Pañol
                        </span>
                        <span className="font-mono font-bold text-slate-200">{formatCurrency(lubricantsCost)}</span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-slate-900">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-emerald-400" /> Services & Taller ({serviceCount})
                        </span>
                        <span className="font-mono font-bold text-slate-200">{formatCurrency(servicesCost)}</span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-slate-900">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-purple-400" /> Facturas & Repuestos ({expenseCount})
                        </span>
                        <span className="font-mono font-bold text-slate-200">{formatCurrency(expensesCost)}</span>
                      </div>

                      <div className="flex items-center justify-between py-1 border-b border-slate-900">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Multas e Infracciones ({fineCount})
                        </span>
                        <span className={`font-mono font-bold ${finesCost > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                          {formatCurrency(finesCost)}
                        </span>
                      </div>
                    </div>

                    {/* Total Direct Cost Banner */}
                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">Costo Directo Total:</span>
                      <span className="text-base font-black text-emerald-400 font-mono">
                        {formatCurrency(totalDirectCost)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: Alertas & Vencimientos de Mantenimiento Preventivo */}
        {activeTab === 'alerts' && (
          <div className="space-y-4">
            {/* KPI Cards for Alerts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div 
                onClick={() => setAlertsStatusFilter('CRITICAL')}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  alertsStatusFilter === 'CRITICAL' 
                    ? 'bg-red-500/20 border-red-500 shadow-lg shadow-red-950/40' 
                    : 'bg-slate-950 border-slate-800 hover:border-red-500/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-red-400 mb-1">
                  <span>Services Vencidos</span>
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-red-400 font-mono">{alertCounts.critical}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Atención inmediata requerida</div>
              </div>

              <div 
                onClick={() => setAlertsStatusFilter('WARNING')}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  alertsStatusFilter === 'WARNING' 
                    ? 'bg-amber-500/20 border-amber-500 shadow-lg shadow-amber-950/40' 
                    : 'bg-slate-950 border-slate-800 hover:border-amber-500/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-amber-400 mb-1">
                  <span>Próximos a Vencer</span>
                  <Clock className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-amber-400 font-mono">{alertCounts.warning}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Menos de 50 hs o 1.000 km</div>
              </div>

              <div 
                onClick={() => setAlertsStatusFilter('OK')}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  alertsStatusFilter === 'OK' 
                    ? 'bg-emerald-500/20 border-emerald-500 shadow-lg shadow-emerald-950/40' 
                    : 'bg-slate-950 border-slate-800 hover:border-emerald-500/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-emerald-400 mb-1">
                  <span>Mantenimiento al Día</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-emerald-400 font-mono">{alertCounts.ok}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">En rango operativo normal</div>
              </div>

              <div 
                onClick={() => setAlertsStatusFilter('ALL')}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  alertsStatusFilter === 'ALL' 
                    ? 'bg-cyan-500/20 border-cyan-500 shadow-lg shadow-cyan-950/40' 
                    : 'bg-slate-950 border-slate-800 hover:border-cyan-500/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-cyan-400 mb-1">
                  <span>Parque Evaluado</span>
                  <Truck className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-cyan-300 font-mono">{fleetAlerts.length}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Equipos en seguimiento</div>
              </div>
            </div>

            {/* Sub-toolbar Status Filter */}
            <div className="flex items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtrar Estado:</span>
                <button
                  onClick={() => setAlertsStatusFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    alertsStatusFilter === 'ALL' 
                      ? 'bg-slate-800 text-white' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todos ({fleetAlerts.length})
                </button>
                <button
                  onClick={() => setAlertsStatusFilter('CRITICAL')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    alertsStatusFilter === 'CRITICAL' 
                      ? 'bg-red-600 text-white' 
                      : 'text-red-400 hover:bg-red-500/10'
                  }`}
                >
                  🔴 Vencidos ({alertCounts.critical})
                </button>
                <button
                  onClick={() => setAlertsStatusFilter('WARNING')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    alertsStatusFilter === 'WARNING' 
                      ? 'bg-amber-500 text-slate-950' 
                      : 'text-amber-400 hover:bg-amber-500/10'
                  }`}
                >
                  🟡 Próximos ({alertCounts.warning})
                </button>
                <button
                  onClick={() => setAlertsStatusFilter('OK')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    alertsStatusFilter === 'OK' 
                      ? 'bg-emerald-600 text-white' 
                      : 'text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                >
                  🟢 Al Día ({alertCounts.ok})
                </button>
              </div>

              <div className="text-xs text-slate-400">
                Pauta preventiva estándar: <span className="font-bold text-slate-200">250 hs</span> (Maquinaria) / <span className="font-bold text-slate-200">10.000 km</span> (Rodados)
              </div>
            </div>

            {/* Alerts Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Equipo / Máquina</th>
                    <th className="py-3 px-3">Uso Actual</th>
                    <th className="py-3 px-3">Último Service</th>
                    <th className="py-3 px-3">Próximo Service</th>
                    <th className="py-3 px-3">Desgaste & Margen</th>
                    <th className="py-3 px-3">Semáforo</th>
                    <th className="py-3 px-4 text-right">Acción Rápida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500 italic">
                        No hay equipos en la categoría seleccionada.
                      </td>
                    </tr>
                  ) : (
                    filteredAlerts.map(alert => {
                      const { vehicle, currentUsage, currentUnit, lastService, targetUsage, diff, status, statusLabel, statusBadgeColor, progressPercent } = alert;

                      return (
                        <tr key={vehicle.id} className="hover:bg-slate-900/50 transition">
                          {/* Vehicle Details */}
                          <td className="py-3.5 px-4 font-medium">
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              <Truck className="w-4 h-4 text-cyan-400 shrink-0" />
                              <span>{vehicle.modeloMarca}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              {vehicle.patente || vehicle.codigoInterno || vehicle.id} • <span className="text-slate-300 font-sans">{vehicle.clasificacion}</span>
                            </div>
                          </td>

                          {/* Current Usage */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <div className="text-white font-mono font-bold text-xs">
                              {currentUsage.toLocaleString('es-AR')} {currentUnit === 'KMS' ? 'km' : 'hs'}
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase">Horómetro Actual</div>
                          </td>

                          {/* Last Service */}
                          <td className="py-3.5 px-3">
                            {lastService ? (
                              <div>
                                <div className="text-slate-200 font-bold">{lastService.fecha}</div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  a las {lastService.horometroOdometro.toLocaleString('es-AR')} {currentUnit === 'KMS' ? 'km' : 'hs'}
                                </div>
                                <div className="text-[10px] text-blue-400 truncate max-w-[150px]">
                                  {SERVICE_TYPE_LABELS[lastService.tipoService]?.name || lastService.tipoService}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Sin services registrados</span>
                            )}
                          </td>

                          {/* Next Service */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <div className="font-mono font-bold text-slate-200">
                              {targetUsage.toLocaleString('es-AR')} {currentUnit === 'KMS' ? 'km' : 'hs'}
                            </div>
                            <div className="text-[10px] text-slate-500">Programado</div>
                          </td>

                          {/* Progress & Margin */}
                          <td className="py-3.5 px-3 min-w-[160px]">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="font-mono text-slate-400">{progressPercent}% intervalo</span>
                              <span className={`font-mono font-bold ${diff <= 0 ? 'text-red-400' : diff <= 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {diff <= 0 ? `+${Math.abs(diff)}` : diff} {currentUnit === 'KMS' ? 'km' : 'hs'}
                              </span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-500 rounded-full ${
                                  status === 'CRITICAL' ? 'bg-red-500' : status === 'WARNING' ? 'bg-amber-400' : 'bg-emerald-400'
                                }`} 
                                style={{ width: `${Math.min(100, progressPercent)}%` }}
                              />
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border inline-flex items-center gap-1.5 ${statusBadgeColor}`}>
                              {status === 'CRITICAL' && <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />}
                              {status === 'WARNING' && <Clock className="w-3 h-3 text-amber-400 shrink-0" />}
                              {status === 'OK' && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                              <span>{statusLabel}</span>
                            </span>
                          </td>

                          {/* Action Button */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleOpenServiceForVehicle(vehicle, currentUsage)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow-md shadow-blue-950/40 ml-auto cursor-pointer"
                              title="Registrar service para este equipo"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                              <span>+ Registrar Service</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: Plan Preventivo & Pautas Técnicas de Pañol */}
        {activeTab === 'plan' && (
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/30">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Manual y Protocolos de Mantenimiento Preventivo de Flota</h3>
                  <p className="text-xs text-slate-400">
                    Pautas operativas obligatorias para operarios, mecánicos de base y pañol para garantizar la vida útil de equipos pesados y vehículos.
                  </p>
                </div>
              </div>
            </div>

            {/* Bento Grid: Guidelines by Equipment Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Maquinaria Pesada */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-cyan-500/40 transition">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-amber-400" />
                    <h4 className="font-bold text-white text-sm uppercase tracking-wide">
                      Maquinaria Pesada & Línea Amarilla
                    </h4>
                  </div>
                  <span className="text-[10px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded">
                    Excavadoras, Palas, Minis
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <span className="font-bold text-amber-300">Cada 10 horas / Diario pre-arranque:</span>
                    <p className="text-slate-400">
                      Nivel de aceite de motor y refrigerante. Nivel de fluido hidráulico. Drenaje de agua en filtro trampa de combustible. Engrase diario de articulaciones y pernos de balde.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <span className="font-bold text-cyan-300">Cada 250 horas (Service Rutinario):</span>
                    <p className="text-slate-400">
                      Cambio completo de aceite de motor (Shell Rimula R4 15W40). Reemplazo de filtro de aceite y filtro primario de combustible. Revisión de tensión de orugas y correas.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <span className="font-bold text-blue-300">Cada 500 horas:</span>
                    <p className="text-slate-400">
                      Sustitución de todos los filtros de gasoil (secundario). Filtro de aire primario. Revisión de bornes, alternador y batería. Control de nivel de mandos finales.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <span className="font-bold text-purple-300">Cada 1.000 a 2.000 horas:</span>
                    <p className="text-slate-400">
                      Cambio de aceite de mandos finales y cubos reductores. Sustitución de filtros hidráulicos de retorno y respiradero. Renovación total de aceite hidráulico ISO 68.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 2: Camiones Volcadores & Chasis */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-cyan-500/40 transition">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Truck className="w-5 h-5 text-blue-400" />
                    <h4 className="font-bold text-white text-sm uppercase tracking-wide">
                      Camiones Volcadores, Bateas & Chasis
                    </h4>
                  </div>
                  <span className="text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">
                    Mercedes, Scania, Ford
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <span className="font-bold text-blue-300">Diario / Inicio de Turno:</span>
                    <p className="text-slate-400">
                      Purga de tanques de aire comprimido (frenos). Control de presión de neumáticos (110-120 PSI). Nivel de aceite motor y refrigerante. Luces reglamentarias.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <span className="font-bold text-cyan-300">Cada 10.000 km (Service Programado):</span>
                    <p className="text-slate-400">
                      Cambio de aceite motor y filtros de aceite y gasoil. Engrase de quinta rueda, perno rey, muñones y crucetas de cardán. Control de pastillas y cintas de freno.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-300">Cada 20.000 a 40.000 km:</span>
                    <p className="text-slate-400">
                      Filtro de aire de admisión y filtro de habitáculo. Aceite de caja y diferencial (80W90 / 85W140). Regulación de pulmones de freno y alineación de ejes.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 3: Fluidos Oficiales de Pañol */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-cyan-500/40 transition">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Droplet className="w-5 h-5 text-emerald-400" />
                    <h4 className="font-bold text-white text-sm uppercase tracking-wide">
                      Fluidos & Lubricantes Homologados
                    </h4>
                  </div>
                  <span className="text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">
                    Pañol Central
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                    <span className="font-bold text-slate-200">Aceite Motor Diésel:</span>
                    <span className="font-mono text-cyan-400 font-bold">15W40 CI-4 / CK-4 (Shell Rimula)</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                    <span className="font-bold text-slate-200">Fluido Hidráulico:</span>
                    <span className="font-mono text-cyan-400 font-bold">ISO VG 68 (Tellus S2 MX)</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                    <span className="font-bold text-slate-200">Diferenciales & Caja:</span>
                    <span className="font-mono text-cyan-400 font-bold">SAE 80W90 / 85W140 GL-5</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                    <span className="font-bold text-slate-200">Grasa de Chasis & Pernos:</span>
                    <span className="font-mono text-cyan-400 font-bold">Grasa de Litio EP-2 Extrema Presión</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                    <span className="font-bold text-slate-200">Refrigerante / Anticongelante:</span>
                    <span className="font-mono text-cyan-400 font-bold">Orgánico 50% Dilución Desmineralizada</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Seguridad & Documentación Técnica */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-cyan-500/40 transition">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-purple-400" />
                    <h4 className="font-bold text-white text-sm uppercase tracking-wide">
                      Habilitaciones Técnicas & Seguridad
                    </h4>
                  </div>
                  <span className="text-[10px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded">
                    Normativa Vial & ART
                  </span>
                </div>

                <div className="space-y-2 text-xs text-slate-400">
                  <p className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>VTV / RTO Obligatoria:</strong> Renovación anual para camionetas y semestral para camiones pesados y maquinarias según jurisdicción.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>Matafuegos ABC Vigentes:</strong> Inspección de manómetro en verde y recarga anual con oblea oficial IRAM.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>Póliza de Responsabilidad Civil:</strong> Cobertura de maquinaria vial y vehículos de transporte al día para ingreso a obras y yacimientos.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>Luces de Trabajo & Alarma de Retroceso:</strong> Control obligatorio antes de cada despacho a obra civil o movimiento de suelo.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Cargar / Editar Service */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-400" />
                {editingService ? 'Editar Service de Mantenimiento' : 'Cargar Nuevo Service / Mantenimiento'}
              </h3>
              <button onClick={() => setIsServiceModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveService} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Equipo / Maquinaria *</label>
                  <SearchableSelect
                    options={fleet.map(v => ({
                      value: v.id,
                      label: `${v.modeloMarca} (${v.patente || v.codigoInterno || v.codigo || v.id})`,
                    }))}
                    value={srvEquipoId}
                    onChange={(nextId) => {
                      setSrvEquipoId(nextId);
                      const v = fleet.find(item => item.id === nextId);
                      if (v?.horometro) setSrvHorometro(v.horometro);
                    }}
                    placeholder="Buscar equipo de la flota..."
                    searchPlaceholder="Escribí marca, modelo o patente..."
                    showClear={false}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Tipo de Service *</label>
                  <SearchableSelect
                    options={[
                      { value: 'SERVICE_PREVENTIVO', label: 'Service Preventivo (500hs / 1000hs)' },
                      { value: 'REPARACION_CORRECTIVA', label: 'Reparación Correctiva' },
                      { value: 'TALLER_EXTERNO', label: 'Taller / Service Externo' },
                      { value: 'REVISION_GENERAL', label: 'Revisión General / Inspección' },
                      { value: 'CAMBIO_NEUMATICOS_ORUGAS', label: 'Cambio de Neumáticos / Orugas' },
                    ]}
                    value={srvTipo}
                    onChange={(nextTipo) => setSrvTipo((nextTipo as ServiceType) || 'SERVICE_PREVENTIVO')}
                    placeholder="Seleccionar tipo..."
                    searchPlaceholder="Buscar tipo de service..."
                    showClear={false}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Fecha Service *</label>
                  <input
                    type="date"
                    required
                    value={srvFecha}
                    onChange={(e) => setSrvFecha(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Horómetro / Odómetro *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={srvHorometro}
                    onChange={(e) => setSrvHorometro(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-bold text-amber-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Próximo Service (hs)</label>
                  <input
                    type="number"
                    step="any"
                    value={srvProximoHorometro}
                    onChange={(e) => setSrvProximoHorometro(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Checkboxes for Filter & Oil Changes */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="block text-xs font-bold text-slate-300 mb-2">Checklist de Cambios Realizados:</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chkFiltroAceite}
                      onChange={(e) => setChkFiltroAceite(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0"
                    />
                    Filtro de Aceite
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chkFiltroCombustible}
                      onChange={(e) => setChkFiltroCombustible(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0"
                    />
                    Filtro Combustible
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chkFiltroAire}
                      onChange={(e) => setChkFiltroAire(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0"
                    />
                    Filtro de Aire
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chkFiltroHidraulico}
                      onChange={(e) => setChkFiltroHidraulico(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0"
                    />
                    Filtro Hidráulico
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chkAceiteMotor}
                      onChange={(e) => setChkAceiteMotor(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0"
                    />
                    Aceite de Motor
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chkAceiteHidraulico}
                      onChange={(e) => setChkAceiteHidraulico(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0"
                    />
                    Aceite Hidráulico
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Detalle de Trabajos Realizados *</label>
                <textarea
                  rows={3}
                  required
                  value={srvTrabajos}
                  onChange={(e) => setSrvTrabajos(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  placeholder="Describa los trabajos mecánicos, inspecciones y reparaciones..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Mecánico Responsable</label>
                  <input
                    type="text"
                    value={srvMecanico}
                    onChange={(e) => setSrvMecanico(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Taller / Lugar</label>
                  <input
                    type="text"
                    value={srvLugar}
                    onChange={(e) => setSrvLugar(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Costo Mano de Obra ($)</label>
                  <input
                    type="number"
                    step="any"
                    value={srvManoObraCost}
                    onChange={(e) => setSrvManoObraCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-bold text-emerald-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Nº Comprobante / Factura</label>
                  <input
                    type="text"
                    value={srvComprobante}
                    onChange={(e) => setSrvComprobante(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    placeholder="ej: Factura A-0004-9812"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsServiceModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-lg shadow-blue-900/30"
                >
                  Guardar Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Cargar Factura / Gasto Directo */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-purple-400" />
                {editingExpense ? 'Editar / Completar Factura / Gasto' : 'Imputar Factura o Gasto a Equipo'}
              </h3>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {expenseModalError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{expenseModalError}</span>
                </div>
              )}

              {editingExpense?.camposIncompletos && editingExpense.camposIncompletos.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Registro histórico importado incompleto (falta: <strong>{editingExpense.camposIncompletos.join(', ')}</strong>). Podés completarlo acá o guardar ajustes parciales sin perder el historial.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Equipo Afectado {!editingExpense ? '*' : ''}
                  </label>
                  <SearchableSelect
                    options={[
                      ...(editingExpense && !fleet.some(v => v.id === expEquipoId)
                        ? [{
                            value: expEquipoId || '',
                            label:
                              editingExpense.equipoModeloMarca && editingExpense.equipoModeloMarca !== 'Sin equipo asignado'
                                ? `${editingExpense.equipoModeloMarca} (${editingExpense.equipoPatenteOrCodigo || 'Histórico'})`
                                : 'Sin equipo asignado (Histórico)',
                          }]
                        : []),
                      ...fleet.map(v => ({
                        value: v.id,
                        label: `${v.modeloMarca} (${v.patente || v.codigoInterno || v.codigo || v.id})`,
                      })),
                    ]}
                    value={expEquipoId}
                    onChange={(nextId) => setExpEquipoId(nextId)}
                    placeholder="Buscar equipo afectado..."
                    searchPlaceholder="Escribí marca, modelo o código..."
                    showClear={Boolean(editingExpense)}
                    clearValue=""
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Fecha {!editingExpense ? '*' : ''}
                  </label>
                  <input
                    type="date"
                    required={!editingExpense}
                    value={expFecha}
                    onChange={(e) => setExpFecha(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Nº Comprobante / Factura {!editingExpense ? '*' : ''}
                  </label>
                  <input
                    type="text"
                    required={!editingExpense}
                    value={expComprobante}
                    onChange={(e) => setExpComprobante(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    placeholder="ej: Factura A-0002-8812"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Categoría de Gasto *</label>
                  <SearchableSelect
                    options={Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, label]) => ({
                      value: k,
                      label,
                    }))}
                    value={expCategoria}
                    onChange={(val) => setExpCategoria((val as ExpenseCategory) || 'VARIOS_EQUIPO')}
                    placeholder="Seleccionar categoría..."
                    searchPlaceholder="Buscar categoría..."
                    showClear={false}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Proveedor / Taller {!editingExpense ? '*' : ''}
                  </label>
                  <input
                    type="text"
                    required={!editingExpense}
                    value={expProveedor}
                    onChange={(e) => setExpProveedor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    placeholder="ej: Macrosa CAT / Gomería Pilar"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Monto Total ($) {!editingExpense ? '*' : ''}
                  </label>
                  <input
                    type="number"
                    step="any"
                    required={!editingExpense}
                    value={expMonto}
                    onChange={(e) => setExpMonto(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-black text-purple-300 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Concepto / Detalle {!editingExpense ? '*' : ''}
                </label>
                <input
                  type="text"
                  required={!editingExpense}
                  value={expConcepto}
                  onChange={(e) => setExpConcepto(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  placeholder="ej: Reparación de bomba inyectora / Juego de filtros"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Cantidad</label>
                  <input
                    type="number"
                    step="any"
                    value={expCantidad}
                    onChange={(e) => setExpCantidad(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    placeholder="ej: 1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Marca Repuesto</label>
                  <input
                    type="text"
                    value={expMarcaRepuesto}
                    onChange={(e) => setExpMarcaRepuesto(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    placeholder="ej: BOSCH / SKF"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Responsable</label>
                  <input
                    type="text"
                    value={expResponsableNombre}
                    onChange={(e) => setExpResponsableNombre(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    placeholder="Operario / Mecánico"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  value={expObs}
                  onChange={(e) => setExpObs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  placeholder="Notas adicionales del comprobante..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  disabled={isSavingExpense}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingExpense}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white transition shadow-lg shadow-purple-900/30"
                >
                  {isSavingExpense ? 'Confirmando en Supabase...' : 'Guardar Factura / Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Cargar / Editar Multa e Imputar a Camión */}
      {isFineModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                {editingFine ? 'Editar Multa e Imputación a Unidad' : 'Cargar Multa e Imputar a Camión'}
              </h3>
              <button onClick={() => setIsFineModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFine} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {fineModalError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{fineModalError}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-200/90 text-xs flex items-start gap-2">
                <Info className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  Al guardar, esta multa se imputará automáticamente como gasto directo del camión o unidad en el <strong>Centro de Costos</strong> y en su panel de <strong>Gastos & Rentabilidad</strong>.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Camión / Unidad Imputada *
                  </label>
                  <SearchableSelect
                    options={sortedFleetForFines.map(v => ({
                      value: v.id,
                      label: `${v.modeloMarca} (${v.patente || v.codigoInterno || v.codigo || v.id})`,
                      secondaryText: `${v.clasificacion || 'Unidad'}${v.patente ? ` • Pat: ${v.patente}` : ''}`,
                      extraSearchTerms: `${v.codigoInterno || ''} ${v.patente || ''} ${v.clasificacion || ''}`,
                    }))}
                    value={fineEquipoId}
                    onChange={(nextId) => setFineEquipoId(nextId)}
                    placeholder="Seleccionar camión o unidad..."
                    searchPlaceholder="Buscar por patente, modelo o código..."
                    showClear={false}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Fecha Infracción *
                  </label>
                  <input
                    type="date"
                    required
                    value={fineFecha}
                    onChange={(e) => setFineFecha(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Nº de Acta / Expediente / Boleta *
                  </label>
                  <input
                    type="text"
                    required
                    value={fineActaNumero}
                    onChange={(e) => setFineActaNumero(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    placeholder="ej: Acta 0045-89214 / Causa 1240-26"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Organismo / Jurisdicción Emisora *
                  </label>
                  <input
                    type="text"
                    required
                    value={fineOrganismo}
                    onChange={(e) => setFineOrganismo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    placeholder="ej: Juzgado de Faltas Jujuy / Vialidad / CNRT"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Tipo de Infracción *
                  </label>
                  <SearchableSelect
                    options={FINE_INFRACTION_TYPES.map(t => ({ value: t, label: t }))}
                    value={fineTipoInfraccion}
                    onChange={(val) => setFineTipoInfraccion(val || FINE_INFRACTION_TYPES[0])}
                    placeholder="Seleccionar infracción..."
                    searchPlaceholder="Buscar tipo de infracción..."
                    showClear={false}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Importe a Imputar ($) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={fineMonto}
                    onChange={(e) => setFineMonto(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-black text-rose-400 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Lugar / Ruta / Kilómetro
                  </label>
                  <input
                    type="text"
                    value={fineLugar}
                    onChange={(e) => setFineLugar(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    placeholder="ej: RN 9 Km 1720 / Balanza Cabeza de Buey"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Chofer / Operario Responsable (Opcional)
                  </label>
                  {drivers.length > 0 ? (
                    <SearchableSelect
                      options={[
                        { value: '', label: 'Sin chofer asignado' },
                        ...drivers.map(d => ({
                          value: d.id,
                          label: d.nombreApellido,
                          secondaryText: `${d.categoria || 'Chofer'}${d.legajo ? ` • Leg: ${d.legajo}` : ''}`,
                        })),
                      ]}
                      value={fineChoferId}
                      onChange={(nextId) => {
                        setFineChoferId(nextId);
                        const drv = drivers.find(d => d.id === nextId);
                        setFineChoferNombre(drv ? drv.nombreApellido : '');
                      }}
                      placeholder="Seleccionar chofer..."
                      searchPlaceholder="Buscar chofer por nombre o legajo..."
                      clearValue=""
                    />
                  ) : (
                    <input
                      type="text"
                      value={fineChoferNombre}
                      onChange={(e) => setFineChoferNombre(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                      placeholder="Nombre del chofer"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Estado de la Multa *</label>
                  <SearchableSelect
                    options={(Object.entries(FINE_STATUS_META) as [FinePaymentStatus, { label: string }][]).map(
                      ([k, meta]) => ({ value: k, label: meta.label })
                    )}
                    value={fineEstadoPago}
                    onChange={(val) => setFineEstadoPago((val as FinePaymentStatus) || 'PENDIENTE')}
                    placeholder="Estado..."
                    searchPlaceholder="Buscar estado..."
                    showClear={false}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Vencimiento Pago Voluntario
                  </label>
                  <input
                    type="date"
                    value={fineVencimiento}
                    onChange={(e) => setFineVencimiento(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Fecha de Pago Efectivo
                  </label>
                  <input
                    type="date"
                    value={fineFechaPago}
                    onChange={(e) => setFineFechaPago(e.target.value)}
                    disabled={fineEstadoPago !== 'PAGADA' && fineEstadoPago !== 'DESCONTADA_CHOFER'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-40 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Detalle / Motivo de la Infracción
                </label>
                <input
                  type="text"
                  value={fineDetalle}
                  onChange={(e) => setFineDetalle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                  placeholder="ej: Radar 94 km/h en zona de 80 km/h / Exceso de carga por eje"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  value={fineObs}
                  onChange={(e) => setFineObs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                  placeholder="Notas de descargo, descuento voluntario 50%, comprobante de transferencia..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFineModalOpen(false)}
                  disabled={isSavingFine}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingFine}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition shadow-lg shadow-rose-900/30 cursor-pointer"
                >
                  {isSavingFine ? 'Imputando en Supabase...' : editingFine ? 'Guardar Cambios de Multa' : 'Cargar e Imputar Multa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (In-App, never blocked by iframe sandbox) */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500/15 rounded-xl border border-red-500/30 text-red-400">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">¿Confirmar eliminación?</h3>
                <p className="text-xs text-slate-400">Esta acción impactará directamente en Supabase PostgreSQL.</p>
              </div>
            </div>

            {deleteModalError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{deleteModalError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300">
              Se eliminará de forma permanente: <strong className="text-white block mt-1">{deleteConfirmTarget.title}</strong>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingRecord}
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingRecord}
                onClick={handleExecuteDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition shadow-lg shadow-red-900/30 cursor-pointer"
              >
                {isDeletingRecord ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function expNumeroComprobanteValid(val?: string): boolean {
  return !!val && val.trim().length > 0;
}
