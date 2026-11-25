import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Save,
  Copy,
  Check,
  Users,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Trash2,
  Calculator,
  Search,
  Edit3,
  Printer,
  LayoutGrid,
  Table as TableIcon,
  Upload,
  ChevronDown,
  ChevronUp,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  X,
  UserPlus,
  Layers,
  CheckSquare,
  Square,
  Wallet,
  Link2,
  UserCheck,
  ExternalLink,
  Clock,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Employee, ParteDiario, SupabaseRegistro, SupabaseUsuario } from '../types';
import { SearchableSelect } from './SearchableSelect';
import { PayrollEmployeeActivityPanel } from './PayrollEmployeeActivityPanel';
import {
  googleSignIn,
  logoutGoogle,
  extractSpreadsheetId,
  syncSlipEditsToGoogleSheet,
  syncRSummaryPaymentsToGoogleSheet,
  PUBLIC_LINK_TOKEN,
  loadSharedGoogleSessionFromDb,
  fetchPublicWorkbookMetadata,
  fetchPublicWorkbookTabValues,
  SheetTabInfo,
} from '../services/googleSheetsAuth';
import {
  EmployeePayrollSlip,
  PayrollBasicItem,
  PayrollExtraItem,
  PayrollMovementCategory,
  PayrollPeriodRecord,
  STANDARD_WEEKS,
  recalculatePayrollSlip,
  createDefaultSlipTemplate,
  parseSheetGridIntoPayrollSlips,
  summarizeSlipsByWeek,
  consolidateSlipsByEmployee,
  detectWeekNumberFromText,
  getCanonicalWeekBanner,
  classifyPayrollExtraItem,
  orderPayrollExtraItems,
  getSlipSummaryBreakdown,
  findCompanionSummaryTabTitle,
  findMonthTabForRSheet,
  doesRSheetMatchMonthPeriod,
  stripMismatchedRSheetData,
  parseRSummaryGridIntoUpdates,
  mergeCompanionRSheetFields,
  getEmployeeBankTokenKey,
  ConsolidatedEmployeeMonthlySummary,
  parsePayrollHeaderMetadata,
  matchPayrollSlipToEmployee,
  PayrollNominaMatchResult,
  ParsedPayrollHeaderMetadata,
  PayrollCompanyGroup,
  PAYROLL_COMPANY_GROUPS,
  classifyPayrollGroupFromBanner,
  getPayrollGroupDisplayName,
  getStandardWeeksForGroup,
} from '../utils/payrollParser';

interface PayrollSheetsSectionProps {
  employees: Employee[];
  partesDiarios?: ParteDiario[];
  supabaseRegistros?: SupabaseRegistro[];
  supabaseUsuarios?: SupabaseUsuario[];
  isAttendanceLoading?: boolean;
  onUpsertEmployees?: (employeesToSave: Employee[]) => Promise<boolean>;
  onViewEmployee?: (employee: Employee) => void;
  currentUserEmail?: string;
  onShowToast?: (message: string) => void;
}

interface GoogleSheetsAuthSession {
  email: string;
  accessToken: string;
}

interface StoredPayrollConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string;
  lastTabTitle?: string;
  lastActiveTab?: string;
  connectedEmail?: string;
  selectedSheetTabs?: string[];
  availableTabsCache?: SheetTabInfo[];
  employeeBankDirectory?: Record<string, { alias?: string; cbu?: string }>;
  employeeDirectoryLinks?: Record<string, string>;
  snapshotsByTab?: Record<
    string,
    {
      headers: string[];
      rows: string[][];
      syncedAt: string;
    }
  >;
  updatedAt?: string;
}

const DEFAULT_SHEET_URL = '';

const formatARS = (val: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(val) || 0);

interface PayrollGroupVisualTheme {
  bannerGradient: string;
  bannerBorder: string;
  accentText: string;
  badgeSolid: string;
  badgeSoft: string;
  boxBorderSoft: string;
  cardHoverBorder: string;
  cardActiveBorder: string;
  headerGradient: string;
  footerGradient: string;
  buttonPrimary: string;
  buttonSoft: string;
  ringActive: string;
}

function getPayrollGroupVisualTheme(group: PayrollCompanyGroup | 'ALL'): PayrollGroupVisualTheme {
  if (group === 'TUBOMUNDO') {
    return {
      bannerGradient: 'bg-gradient-to-r from-sky-400 via-cyan-400 to-sky-500',
      bannerBorder: 'border-sky-200/60',
      accentText: 'text-sky-400',
      badgeSolid: 'bg-sky-400 text-black',
      badgeSoft: 'bg-sky-500/15 text-sky-300 border-sky-400/40',
      boxBorderSoft: 'bg-sky-500/15 border-sky-400/40',
      cardHoverBorder: 'hover:border-sky-400/60',
      cardActiveBorder: 'border-sky-400/60 ring-1 ring-sky-400/20',
      headerGradient: 'from-sky-500/20 via-[#1f1f1f] to-[#161616]',
      footerGradient: 'from-sky-500/20 via-sky-500/10 to-transparent border-sky-400/50',
      buttonPrimary: 'bg-sky-400 hover:bg-sky-300 text-black',
      buttonSoft: 'bg-sky-500/15 hover:bg-sky-500/30 text-sky-300 border-sky-400/35',
      ringActive: 'border-sky-400 ring-1 ring-sky-400',
    };
  }
  if (group === 'GRUPO_IDN') {
    return {
      bannerGradient: 'bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500',
      bannerBorder: 'border-emerald-200/60',
      accentText: 'text-emerald-400',
      badgeSolid: 'bg-emerald-400 text-black',
      badgeSoft: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40',
      boxBorderSoft: 'bg-emerald-500/15 border-emerald-400/40',
      cardHoverBorder: 'hover:border-emerald-400/60',
      cardActiveBorder: 'border-emerald-400/60 ring-1 ring-emerald-400/20',
      headerGradient: 'from-emerald-500/20 via-[#1f1f1f] to-[#161616]',
      footerGradient: 'from-emerald-500/20 via-emerald-500/10 to-transparent border-emerald-400/50',
      buttonPrimary: 'bg-emerald-400 hover:bg-emerald-300 text-black',
      buttonSoft: 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border-emerald-400/35',
      ringActive: 'border-emerald-400 ring-1 ring-emerald-400',
    };
  }
  return {
    bannerGradient: 'bg-gradient-to-r from-[#F0C800] via-[#e2bc00] to-[#c9a700]',
    bannerBorder: 'border-yellow-300/60',
    accentText: 'text-[#F0C800]',
    badgeSolid: 'bg-[#F0C800] text-black',
    badgeSoft: 'bg-[#F0C800]/15 text-[#F0C800] border-[#F0C800]/40',
    boxBorderSoft: 'bg-[#F0C800]/15 border-[#F0C800]/40',
    cardHoverBorder: 'hover:border-[#F0C800]/60',
    cardActiveBorder: 'border-[#F0C800]/60 ring-1 ring-[#F0C800]/20',
    headerGradient: 'from-[#F0C800]/15 via-[#1f1f1f] to-[#161616]',
    footerGradient: 'from-[#F0C800]/20 via-[#F0C800]/10 to-transparent border-[#F0C800]/50',
    buttonPrimary: 'bg-[#F0C800] hover:bg-[#d8b400] text-black',
    buttonSoft: 'bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] border-[#F0C800]/30',
    ringActive: 'border-[#F0C800] ring-1 ring-[#F0C800]',
  };
}

function buildPeriodsFromSnapshots(
  snapshotsByTab?: StoredPayrollConfig['snapshotsByTab']
): PayrollPeriodRecord[] {
  if (!snapshotsByTab || typeof snapshotsByTab !== 'object') return [];
  const entries = Object.entries(snapshotsByTab)
    .filter(([, v]) => Array.isArray(v?.rows) && v.rows.length > 0)
    .sort((a, b) => {
      const ta = new Date(a[1]?.syncedAt || 0).getTime();
      const tb = new Date(b[1]?.syncedAt || 0).getTime();
      return tb - ta;
    });

  const built: PayrollPeriodRecord[] = [];
  for (const [tabTitle, snap] of entries) {
    const parsedSlips = parseSheetGridIntoPayrollSlips(snap.rows, tabTitle, { onlyLaHormiga: false });
    if (parsedSlips.length === 0) continue;
    built.push({
      id: `PER-GSHEET-${tabTitle.toUpperCase().replace(/\s+/g, '-')}`,
      nombrePeriodo: tabTitle.toUpperCase(),
      rangoDefault: parsedSlips[0]?.rangoFecha || '01 AL 31',
      grupoDefault: parsedSlips[0]?.grupoSemana || '1ERA SEMANA - LA HORMIGA',
      sheetTabName: tabTitle,
      slips: parsedSlips,
      updatedAt: snap.syncedAt || new Date().toISOString(),
    });
  }
  return built;
}

export const PayrollSheetsSection: React.FC<PayrollSheetsSectionProps> = ({
  employees,
  partesDiarios = [],
  supabaseRegistros = [],
  supabaseUsuarios = [],
  isAttendanceLoading = false,
  onUpsertEmployees,
  onViewEmployee,
  onShowToast,
}) => {
  // Persisted Payroll Periods in Supabase (system_settings: payroll_periods_data)
  const [periods, setPeriods] = useState<PayrollPeriodRecord[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<string>('');
  const [isSavingData, setIsSavingData] = useState<boolean>(false);
  const [storedSheetConfig, setStoredSheetConfig] = useState<StoredPayrollConfig | null>(null);
  const storedSheetConfigRef = useRef<StoredPayrollConfig | null>(null);

  // Nómina de Personal Linking & Sync Modal
  const [showNominaLinkModal, setShowNominaLinkModal] = useState<boolean>(false);
  const [nominaModalSearch, setNominaModalSearch] = useState<string>('');
  const [isSyncingNomina, setIsSyncingNomina] = useState<boolean>(false);

  // Filters & View Modes:
  // 'cards' = Fichas agrupadas por Semana (1°, 2°, 3°, 4° Semana)
  // 'consolidated' = Suma Mensual por Empleado (1° + 2° + 3° + 4° Semana)
  // 'table' = Tabla detallada de todas las fichas
  const [viewMode, setViewMode] = useState<'cards' | 'consolidated' | 'table'>('cards');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedGroupTab, setSelectedGroupTab] = useState<PayrollCompanyGroup | 'ALL'>('LA_HORMIGA');
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<number | 'ALL'>('ALL');
  // 3-Level Card Density & Progressive Disclosure:
  // 1 = Super Compacta (1 click -> 2, 2 clicks -> 3, 3rd click -> 1)
  // 2 = Resumen (click toggles 2 <-> 3)
  // 3 = Todo el Detalle (always expanded, click does nothing)
  const [defaultCardLevel, setDefaultCardLevel] = useState<1 | 2 | 3>(1);
  const [slipCardLevelOverrides, setSlipCardLevelOverrides] = useState<Record<string, 1 | 2 | 3>>({});
  // Transient UI state for table/consolidated row dropdowns
  const [expandedSlipIds, setExpandedSlipIds] = useState<Record<string, boolean>>({});
  const [expandedConsolidatedKeys, setExpandedConsolidatedKeys] = useState<Record<string, boolean>>({});

  const getSlipCardLevel = (slipId: string): 1 | 2 | 3 => {
    if (defaultCardLevel === 3) return 3;
    const raw = slipCardLevelOverrides[slipId] ?? defaultCardLevel;
    if (defaultCardLevel === 2 && raw < 2) return 2;
    return raw;
  };

  const cycleSlipCardLevel = (slipId: string) => {
    if (defaultCardLevel === 3) return;
    setSlipCardLevelOverrides(prev => {
      const current = prev[slipId] ?? defaultCardLevel;
      let next: 1 | 2 | 3;
      if (defaultCardLevel === 2) {
        next = current === 2 ? 3 : 2;
      } else {
        next = current === 1 ? 2 : current === 2 ? 3 : 1;
      }
      return { ...prev, [slipId]: next };
    });
  };

  const handleChangeDefaultCardLevel = (level: 1 | 2 | 3) => {
    setDefaultCardLevel(level);
    setSlipCardLevelOverrides({});
  };

  const toggleSlipExpanded = (slipId: string) => {
    setExpandedSlipIds(prev => ({ ...prev, [slipId]: !prev[slipId] }));
  };

  const toggleConsolidatedExpanded = (empKey: string) => {
    setExpandedConsolidatedKeys(prev => ({ ...prev, [empKey]: !prev[empKey] }));
  };

  const setSlipsExpandedBatch = (slipIds: string[], expand: boolean) => {
    setExpandedSlipIds(prev => {
      const next = { ...prev };
      slipIds.forEach(id => {
        next[id] = expand;
      });
      return next;
    });
  };

  // Notifications
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit / Create Employee Liquidation Modal
  const [editingSlip, setEditingSlip] = useState<EmployeePayrollSlip | null>(null);
  const [originalEditingSlip, setOriginalEditingSlip] = useState<EmployeePayrollSlip | null>(null);
  const [isNewSlip, setIsNewSlip] = useState<boolean>(false);
  const [syncToSheetOnSave, setSyncToSheetOnSave] = useState<boolean>(true);
  const [isSyncingToSheet, setIsSyncingToSheet] = useState<boolean>(false);
  const [highlightedExtraId, setHighlightedExtraId] = useState<string | null>(null);
  const [showActivitySidePopup, setShowActivitySidePopup] = useState<boolean>(true);

  // Copy Month Modal ("Nuevo Mes copiando el anterior")
  const [showNewPeriodModal, setShowNewPeriodModal] = useState<boolean>(false);
  const [newPeriodName, setNewPeriodName] = useState<string>('NOVIEMBRE 2026');
  const [newPeriodMesTexto, setNewPeriodMesTexto] = useState<string>('NOVIEMBRE');
  const [newPeriodRango, setNewPeriodRango] = useState<string>('01.11 AL 30.11');
  const [resetExtrasOnCopy, setResetExtrasOnCopy] = useState<boolean>(true);

  // Print Receipt Modal (Single Slip OR Consolidated Monthly Employee Summary)
  const [printingSlip, setPrintingSlip] = useState<EmployeePayrollSlip | null>(null);
  const [printingConsolidatedEmp, setPrintingConsolidatedEmp] =
    useState<ConsolidatedEmployeeMonthlySummary | null>(null);

  // Google Sheets / Excel Importer Panel (open by default so user can 1-click read exact values from their sheet)
  const [showImporterPanel, setShowImporterPanel] = useState<boolean>(true);
  const [session, setSession] = useState<GoogleSheetsAuthSession | null>(null);
  const [sheetUrlInput, setSheetUrlInput] = useState<string>(DEFAULT_SHEET_URL);
  const [spreadsheetId, setSpreadsheetId] = useState<string>(
    extractSpreadsheetId(DEFAULT_SHEET_URL)
  );
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>('');
  const [tabs, setTabs] = useState<SheetTabInfo[]>([]);
  const [selectedTabForImport, setSelectedTabForImport] = useState<string>('');
  const [isLoadingSheet, setIsLoadingSheet] = useState<boolean>(false);
  const [showTabsSelectorModal, setShowTabsSelectorModal] = useState<boolean>(false);
  const [draftSelectedTabs, setDraftSelectedTabs] = useState<string[]>([]);
  const [reReadSelectedTabs, setReReadSelectedTabs] = useState<boolean>(true);
  const [isApplyingTabsSelection, setIsApplyingTabsSelection] = useState<boolean>(false);
  const [tabsSelectionProgress, setTabsSelectionProgress] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Hoja R (Resumen semanal + pagos/saldo + acumulado mensual)
  const [consolidatedSubView, setConsolidatedSubView] = useState<'r_semanal' | 'acumulado_mensual'>('r_semanal');
  const [dirtyRSlipIds, setDirtyRSlipIds] = useState<Record<string, boolean>>({});
  const [isSyncingRSheet, setIsSyncingRSheet] = useState<boolean>(false);
  const [copiedBankKey, setCopiedBankKey] = useState<string | null>(null);
  const [selectedRSheetTabOverride, setSelectedRSheetTabOverride] = useState<string>('');

  // Load saved periods & sheet config from Supabase on mount
  useEffect(() => {
    loadSharedGoogleSessionFromDb()
      .then(shared => {
        if (shared?.accessToken) {
          setSession({
            email: shared.email || 'Cuenta Google',
            accessToken: shared.accessToken,
          });
        }
      })
      .catch(() => {});

    const loadFromSupabase = async () => {
      try {
        const [resPeriods, resConfig] = await Promise.all([
          fetch('/api/settings/payroll_periods_data'),
          fetch('/api/settings/payroll_sheets_config'),
        ]);

        let cfg: StoredPayrollConfig | null = null;
        if (resConfig.ok) {
          const rawCfg = await resConfig.json();
          cfg = rawCfg?.value || rawCfg;
          if (cfg && typeof cfg === 'object') {
            storedSheetConfigRef.current = cfg;
            setStoredSheetConfig(cfg);
            if (cfg.spreadsheetUrl) {
              setSheetUrlInput(cfg.spreadsheetUrl);
              setSpreadsheetId(cfg.spreadsheetId || extractSpreadsheetId(cfg.spreadsheetUrl));
            }
            if (cfg.spreadsheetTitle) setSpreadsheetTitle(cfg.spreadsheetTitle);
            if (Array.isArray(cfg.availableTabsCache) && cfg.availableTabsCache.length > 0) {
              setTabs(cfg.availableTabsCache);
            }
          }
        }

        let loadedPeriods: PayrollPeriodRecord[] | null = null;
        if (resPeriods.ok) {
          const raw = await resPeriods.json();
          if (Array.isArray(raw) && raw.length > 0) {
            loadedPeriods = raw;
          } else if (Array.isArray(raw?.value) && raw.value.length > 0) {
            loadedPeriods = raw.value;
          }
        }

        const allowedTabSet =
          Array.isArray(cfg?.selectedSheetTabs) && cfg.selectedSheetTabs.length > 0
            ? new Set(cfg.selectedSheetTabs.map(t => t.toUpperCase()))
            : null;

        const snapshotPeriods = buildPeriodsFromSnapshots(cfg?.snapshotsByTab).filter(
          sp =>
            !allowedTabSet ||
            allowedTabSet.has((sp.sheetTabName || sp.nombrePeriodo).toUpperCase())
        );
        const hasOnlyStaleDemo =
          !loadedPeriods ||
          loadedPeriods.length === 0 ||
          loadedPeriods.every(p => p.id === 'PER-2026-10');

        if (snapshotPeriods.length > 0 && hasOnlyStaleDemo) {
          setPeriods(snapshotPeriods);
          setActivePeriodId(snapshotPeriods[0].id);
          await fetch('/api/settings/payroll_periods_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: snapshotPeriods }),
          });
          return;
        }

        if (loadedPeriods && loadedPeriods.length > 0) {
          let merged = loadedPeriods.filter(p => {
            if (p.id === 'PER-2026-10' && snapshotPeriods.length > 0) return false;
            if (allowedTabSet && p.id.startsWith('PER-GSHEET-')) {
              const tabKey = (p.sheetTabName || p.nombrePeriodo).toUpperCase();
              return allowedTabSet.has(tabKey);
            }
            return true;
          });
          let didUpdate = merged.length !== loadedPeriods.length;

          // If any snapshot in Supabase is newer than its corresponding GSHEET period (or missing), sync exact sheet values preserving Hoja R fields
          for (const snapP of snapshotPeriods) {
            const existingIdx = merged.findIndex(p => p.id === snapP.id);
            if (existingIdx < 0) {
              merged = [
                {
                  ...snapP,
                  slips: mergeCompanionRSheetFields(
                    snapP.slips,
                    [],
                    cfg?.employeeBankDirectory
                  ),
                },
                ...merged,
              ];
              didUpdate = true;
            } else {
              const existingUpdated = new Date(merged[existingIdx].updatedAt || 0).getTime();
              const snapUpdated = new Date(snapP.updatedAt || 0).getTime();
              // Also upgrade automatically if the saved period missed slips present in the snapshot (e.g. Tubomundo / Grupo IDN / 1ra Semana Administrativos)
              const existingSlips = merged[existingIdx].slips || [];
              const existingCount = existingSlips.length;
              const existingSlipIds = new Set(existingSlips.map(s => s.id));
              const snapHasMoreGroups =
                snapP.slips.length > existingCount ||
                snapP.slips.some(s => !existingSlipIds.has(s.id));
              if (snapUpdated > existingUpdated || snapHasMoreGroups) {
                const prevP = merged[existingIdx];
                merged[existingIdx] = {
                  ...snapP,
                  companionRSheetTabName:
                    snapP.companionRSheetTabName || prevP.companionRSheetTabName,
                  slips: mergeCompanionRSheetFields(
                    snapP.slips,
                    prevP.slips || [],
                    cfg?.employeeBankDirectory
                  ),
                };
                didUpdate = true;
              }
            }
          }

          const normalized = merged.map(p => {
            const rawSlips = p.slips || [];
            const periodTab = p.sheetTabName || p.nombrePeriodo || '';
            const cleanCompanionTab =
              p.companionRSheetTabName &&
              doesRSheetMatchMonthPeriod(p.companionRSheetTabName, periodTab)
                ? p.companionRSheetTabName
                : undefined;
            if (p.companionRSheetTabName !== cleanCompanionTab) {
              didUpdate = true;
            }
            const stripped = stripMismatchedRSheetData(rawSlips, periodTab);
            if (stripped.changed) {
              didUpdate = true;
            }
            const withDir = mergeCompanionRSheetFields(
              stripped.slips.map(s => recalculatePayrollSlip(s)),
              stripped.slips,
              cfg?.employeeBankDirectory
            );
            return {
              ...p,
              companionRSheetTabName: cleanCompanionTab,
              slips: withDir,
            };
          });
          setPeriods(normalized);
          if (normalized.length > 0) {
            setActivePeriodId(normalized[0].id);
          }

          if (didUpdate) {
            await fetch('/api/settings/payroll_periods_data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: normalized }),
            });
          }
        } else if (snapshotPeriods.length > 0) {
          setPeriods(snapshotPeriods);
          setActivePeriodId(snapshotPeriods[0].id);
          await fetch('/api/settings/payroll_periods_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: snapshotPeriods }),
          });
        } else {
          setPeriods([]);
          setActivePeriodId('');
        }
      } catch (err) {
        console.error('Error cargando liquidaciones desde Supabase:', err);
        setErrorMsg('No se pudieron cargar las liquidaciones desde Supabase.');
      }
    };
    loadFromSupabase();
  }, []);

  const persistPeriodsToSupabase = async (
    updatedPeriods: PayrollPeriodRecord[],
    toastText?: string
  ) => {
    setPeriods(updatedPeriods);
    setIsSavingData(true);
    try {
      const res = await fetch('/api/settings/payroll_periods_data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: updatedPeriods }),
      });
      if (!res.ok) throw new Error('No se pudo guardar en Supabase');
      if (toastText) {
        setSuccessMsg(toastText);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al sincronizar con Supabase.');
    } finally {
      setIsSavingData(false);
    }
  };

  const saveConfigToSupabase = async (partial: Partial<StoredPayrollConfig>) => {
    try {
      const currentCfg: Partial<StoredPayrollConfig> =
        storedSheetConfigRef.current || storedSheetConfig || {};
      const payload: StoredPayrollConfig = {
        ...currentCfg,
        spreadsheetId,
        spreadsheetUrl: sheetUrlInput,
        spreadsheetTitle: partial.spreadsheetTitle || spreadsheetTitle || currentCfg.spreadsheetTitle,
        ...partial,
        employeeDirectoryLinks: {
          ...(currentCfg.employeeDirectoryLinks || {}),
          ...(partial.employeeDirectoryLinks || {}),
        },
        snapshotsByTab: {
          ...(currentCfg.snapshotsByTab || {}),
          ...(partial.snapshotsByTab || {}),
        },
        updatedAt: new Date().toISOString(),
      };
      storedSheetConfigRef.current = payload;
      setStoredSheetConfig(payload);
      await fetch('/api/settings/payroll_sheets_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Error guardando config de Sheets:', err);
    }
  };

  const handleRebuildFromSavedSnapshot = async () => {
    const allowedTabSet =
      Array.isArray(storedSheetConfig?.selectedSheetTabs) &&
      storedSheetConfig.selectedSheetTabs.length > 0
        ? new Set(storedSheetConfig.selectedSheetTabs.map(t => t.toUpperCase()))
        : null;
    const rawSnapPeriods = buildPeriodsFromSnapshots(storedSheetConfig?.snapshotsByTab).filter(
      sp => !allowedTabSet || allowedTabSet.has((sp.sheetTabName || sp.nombrePeriodo).toUpperCase())
    );
    const snapPeriods = rawSnapPeriods.map(sp => {
      const existingP = periods.find(p => p.id === sp.id);
      return {
        ...sp,
        companionRSheetTabName: existingP?.companionRSheetTabName,
        slips: mergeCompanionRSheetFields(
          sp.slips,
          existingP?.slips || [],
          storedSheetConfigRef.current?.employeeBankDirectory
        ),
      };
    });
    if (snapPeriods.length === 0) {
      setErrorMsg('No hay snapshots de Google Sheets guardados todavía. Conectá Google y leé la hoja primero.');
      return;
    }
    const manualPeriods = periods.filter(
      p => p.id !== 'PER-2026-10' && !p.id.startsWith('PER-GSHEET-') && !snapPeriods.some(sp => sp.id === p.id)
    );
    const nextPeriods = [...snapPeriods, ...manualPeriods];
    setActivePeriodId(snapPeriods[0].id);
    setSelectedWeekFilter('ALL');
    await persistPeriodsToSupabase(
      nextPeriods,
      `Datos reconstruidos al 100% desde tu Google Sheet (La Hormiga, Tubomundo y Grupo IDN: ${snapPeriods.map(p => `${p.nombrePeriodo}: ${p.slips.length} fichas`).join(' • ')}).`
    );
  };

  const activePeriod = useMemo(() => {
    return periods.find(p => p.id === activePeriodId) || periods[0];
  }, [periods, activePeriodId]);

  // Count and totals per PayrollCompanyGroup across the active period
  const groupStatsByTab = useMemo(() => {
    const list = activePeriod?.slips || [];
    const counts: Record<PayrollCompanyGroup | 'ALL', { count: number; neto: number; ingresos: number }> = {
      LA_HORMIGA: { count: 0, neto: 0, ingresos: 0 },
      TUBOMUNDO: { count: 0, neto: 0, ingresos: 0 },
      GRUPO_IDN: { count: 0, neto: 0, ingresos: 0 },
      ALL: { count: list.length, neto: 0, ingresos: 0 },
    };
    for (const s of list) {
      const grp = classifyPayrollGroupFromBanner(s.grupoSemana);
      const ing = Number(s.totalIngresos) || 0;
      const net = Number(s.netoACobrar) || 0;
      counts[grp].count += 1;
      counts[grp].ingresos += ing;
      counts[grp].neto += net;
      counts.ALL.ingresos += ing;
      counts.ALL.neto += net;
    }
    return counts;
  }, [activePeriod]);

  // Slips in the active period filtered by the selected Group Tab (LA HORMIGA, TUBOMUNDO, GRUPO IDN, or ALL)
  const groupFilteredSlips = useMemo(() => {
    const list = activePeriod?.slips || [];
    if (selectedGroupTab === 'ALL') return list;
    return list.filter(s => classifyPayrollGroupFromBanner(s.grupoSemana) === selectedGroupTab);
  }, [activePeriod, selectedGroupTab]);

  // Slips in the selected group matching search query
  const searchMatchedSlips = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return groupFilteredSlips.filter(slip => {
      if (!q) return true;
      return (
        slip.empleadoNombre.toLowerCase().includes(q) ||
        slip.grupoSemana.toLowerCase().includes(q) ||
        slip.mesTexto.toLowerCase().includes(q)
      );
    });
  }, [groupFilteredSlips, searchTerm]);

  // Weekly breakdown across ALL weeks (1° a 4°/5° Semana) for the top summary cards
  const weeklySummaries = useMemo(() => {
    return summarizeSlipsByWeek(searchMatchedSlips, selectedGroupTab);
  }, [searchMatchedSlips, selectedGroupTab]);

  // Slips filtered by selectedWeekFilter ('ALL' or 1, 2, 3, 4, 5)
  const filteredSlips = useMemo(() => {
    if (selectedWeekFilter === 'ALL') return searchMatchedSlips;
    return searchMatchedSlips.filter(
      s => (s.numeroSemana || detectWeekNumberFromText(s.grupoSemana)) === selectedWeekFilter
    );
  }, [searchMatchedSlips, selectedWeekFilter]);

  // Consolidated Monthly Totals per Employee (Summing Week 1 + Week 2 + Week 3 + Week 4)
  const consolidatedEmployees = useMemo(() => {
    return consolidateSlipsByEmployee(searchMatchedSlips);
  }, [searchMatchedSlips]);

  // Smart Nómina de Personal Matching per Slip & Unique Employee Directory
  const savedEmployeeDirectoryLinks = useMemo(() => {
    return storedSheetConfig?.employeeDirectoryLinks || {};
  }, [storedSheetConfig]);

  const slipNominaMatches = useMemo(() => {
    const map: Record<string, PayrollNominaMatchResult<Employee>> = {};
    const list = activePeriod?.slips || [];
    for (const slip of list) {
      map[slip.id] = matchPayrollSlipToEmployee(
        slip,
        employees,
        savedEmployeeDirectoryLinks
      );
    }
    return map;
  }, [activePeriod, employees, savedEmployeeDirectoryLinks]);

  const partesCountByEmployeeId = useMemo(() => {
    const map: Record<string, { count: number; totalHours: number }> = {};
    for (const emp of employees) {
      map[emp.id] = { count: 0, totalHours: 0 };
    }
    for (const p of partesDiarios) {
      const resp = (p.nombreApellido || p.driverName || p.codigoEmpleado || '').trim();
      if (!resp) continue;
      const m = matchPayrollSlipToEmployee(resp, employees);
      if (m.employee) {
        const entry = map[m.employee.id] || { count: 0, totalHours: 0 };
        entry.count += 1;
        entry.totalHours += Number(p.horasTrabajadas) || 0;
        map[m.employee.id] = entry;
      }
    }
    return map;
  }, [partesDiarios, employees]);

  const uniquePayrollEmployeesList = useMemo(() => {
    const list = activePeriod?.slips || [];
    const byKey = new Map<
      string,
      {
        tokenKey: string;
        rawHeaderName: string;
        slipsCount: number;
        slipIds: string[];
        valorBaseJornal: number;
        aliasBancario?: string;
        cbuBancario?: string;
        metadata: ParsedPayrollHeaderMetadata;
        match: PayrollNominaMatchResult<Employee>;
      }
    >();

    for (const slip of list) {
      const match =
        slipNominaMatches[slip.id] ||
        matchPayrollSlipToEmployee(
          slip,
          employees,
          savedEmployeeDirectoryLinks
        );
      const key = match.tokenKey || slip.empleadoNombre.trim().toUpperCase();
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          tokenKey: key,
          rawHeaderName: slip.empleadoNombre,
          slipsCount: 1,
          slipIds: [slip.id],
          valorBaseJornal: Number(slip.valorBaseJornal) || 0,
          aliasBancario: slip.aliasBancario,
          cbuBancario: slip.cbuBancario,
          metadata: match.metadata,
          match,
        });
      } else {
        existing.slipsCount += 1;
        existing.slipIds.push(slip.id);
        if ((Number(slip.valorBaseJornal) || 0) > existing.valorBaseJornal) {
          existing.valorBaseJornal = Number(slip.valorBaseJornal) || 0;
        }
        if (!existing.metadata.fechaIngresoISO && match.metadata.fechaIngresoISO) {
          existing.metadata = match.metadata;
        }
        if (!existing.aliasBancario && slip.aliasBancario) {
          existing.aliasBancario = slip.aliasBancario;
        }
        if (!existing.cbuBancario && slip.cbuBancario) {
          existing.cbuBancario = slip.cbuBancario;
        }
        if (!existing.match.employee && match.employee) {
          existing.match = match;
        }
      }
    }
    return Array.from(byKey.values());
  }, [activePeriod, slipNominaMatches, employees, savedEmployeeDirectoryLinks]);

  const nominaStats = useMemo(() => {
    const total = uniquePayrollEmployeesList.length;
    const linked = uniquePayrollEmployeesList.filter(x => Boolean(x.match.employee)).length;
    const unlinked = total - linked;
    return { total, linked, unlinked };
  }, [uniquePayrollEmployeesList]);

  const nominaSelectOptions = useMemo(() => {
    return [
      { value: '__NONE__', label: '-- Sin vincular a Nómina --', sublabel: 'Desvincular ficha' },
      ...employees.map(emp => ({
        value: emp.id,
        label: `${emp.nombreApellido || emp.nombre || 'Sin Nombre'} (${emp.codigoEmpleado || emp.legajo || 'S/C'})`,
        sublabel: [
          emp.categoria,
          emp.fechaAlta ? `F.I: ${emp.fechaAlta}` : '',
          emp.costoPorDia ? `Jornal: ${formatARS(emp.costoPorDia)}` : '',
        ]
          .filter(Boolean)
          .join(' • '),
      })),
    ];
  }, [employees]);

  const handleAssignNominaEmployee = async (
    entry: (typeof uniquePayrollEmployeesList)[number],
    targetEmployeeId: string
  ) => {
    const isUnlink = !targetEmployeeId || targetEmployeeId === '__NONE__';
    const nextLinks = { ...(storedSheetConfigRef.current?.employeeDirectoryLinks || {}) };
    if (isUnlink) {
      nextLinks[entry.tokenKey] = '__UNLINKED__';
      nextLinks[entry.rawHeaderName.trim().toUpperCase()] = '__UNLINKED__';
    } else {
      nextLinks[entry.tokenKey] = targetEmployeeId;
      nextLinks[entry.rawHeaderName.trim().toUpperCase()] = targetEmployeeId;
    }

    await saveConfigToSupabase({ employeeDirectoryLinks: nextLinks });

    if (activePeriod) {
      const slipIdSet = new Set(entry.slipIds);
      const updatedPeriods = periods.map(p => {
        if (p.id !== activePeriod.id) return p;
        return {
          ...p,
          slips: p.slips.map(s =>
            slipIdSet.has(s.id)
              ? { ...s, empleadoId: isUnlink ? undefined : targetEmployeeId }
              : s
          ),
          updatedAt: new Date().toISOString(),
        };
      });
      const targetEmp = employees.find(e => e.id === targetEmployeeId);
      await persistPeriodsToSupabase(
        updatedPeriods,
        isUnlink
          ? `Se desvinculó "${entry.metadata.cleanName}" de la Nómina.`
          : `Vinculado "${entry.metadata.cleanName}" -> ${targetEmp?.nombreApellido || targetEmp?.nombre} en Supabase.`
      );
    }
  };

  const handleCreateEmployeeInNomina = async (
    entry: (typeof uniquePayrollEmployeesList)[number]
  ) => {
    if (!onUpsertEmployees) return;
    setIsSyncingNomina(true);
    try {
      const maxEmpNum = employees.reduce((max, e) => {
        const m = String(e.codigoEmpleado || '').match(/(\d+)/);
        const n = m ? parseInt(m[1], 10) : 0;
        return n > max ? n : max;
      }, 1000);
      const nextCodeNum = maxEmpNum + 1;
      const newEmpId = crypto.randomUUID();
      const formattedName = entry.metadata.cleanName
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());

      const bankText = [entry.aliasBancario, entry.cbuBancario].filter(Boolean).join(' / ');
      const newEmployee: Employee = {
        id: newEmpId,
        codigoEmpleado: `EMP-${nextCodeNum}`,
        legajo: `LEG-${nextCodeNum}`,
        nombreApellido: formattedName,
        foto: '',
        dni: '',
        fechaAlta: entry.metadata.fechaIngresoISO || new Date().toISOString().slice(0, 10),
        categoria: 'Operario / Chofer (La Hormiga)',
        sector: 'Obras y Mantenimiento',
        obra: 'Base Central La Hormiga',
        estado: 'ACTIVO',
        mostrarEnAsistencia: true,
        costoPorDia: entry.valorBaseJornal > 0 ? entry.valorBaseJornal : undefined,
        observaciones: [
          `Creado desde Liquidación (${activePeriod?.nombrePeriodo || 'Sueldos'})`,
          entry.metadata.horarioTexto ? `Horario: ${entry.metadata.horarioTexto}` : '',
          bankText ? `Banco: ${bankText}` : '',
        ]
          .filter(Boolean)
          .join(' • '),
      };

      const ok = await onUpsertEmployees([newEmployee]);
      if (!ok) {
        setErrorMsg('Supabase no confirmó el alta del empleado en Nómina.');
        return;
      }

      await handleAssignNominaEmployee(entry, newEmpId);
      onShowToast?.(
        `Empleado "${formattedName}" dado de alta en Nómina (${newEmployee.codigoEmpleado}) y vinculado.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al crear empleado en Nómina.');
    } finally {
      setIsSyncingNomina(false);
    }
  };

  const handleSyncSingleEmployeeToNomina = async (
    entry: (typeof uniquePayrollEmployeesList)[number]
  ) => {
    const matched = entry.match.employee;
    if (!matched || !onUpsertEmployees) return;
    setIsSyncingNomina(true);
    try {
      const updatedEmp: Employee = {
        ...matched,
        fechaAlta: entry.metadata.fechaIngresoISO || matched.fechaAlta,
        costoPorDia: entry.valorBaseJornal > 0 ? entry.valorBaseJornal : matched.costoPorDia,
        observaciones:
          entry.metadata.horarioTexto &&
          !String(matched.observaciones || '').includes(entry.metadata.horarioTexto)
            ? [matched.observaciones, `Horario Liquidación: ${entry.metadata.horarioTexto}`]
                .filter(Boolean)
                .join(' • ')
            : matched.observaciones,
      };
      const ok = await onUpsertEmployees([updatedEmp]);
      if (!ok) {
        setErrorMsg('No se pudo actualizar el legajo en Supabase.');
        return;
      }
      await handleAssignNominaEmployee(entry, matched.id);
      onShowToast?.(
        `Legajo de ${matched.nombreApellido || matched.nombre} actualizado en Nómina (Fecha Ingreso / Jornal Base).`
      );
    } finally {
      setIsSyncingNomina(false);
    }
  };

  const handleSyncAllLinkedToNomina = async () => {
    if (!onUpsertEmployees) return;
    setIsSyncingNomina(true);
    try {
      const employeesToUpdateMap = new Map<string, Employee>();
      const nextLinks = { ...(storedSheetConfigRef.current?.employeeDirectoryLinks || {}) };
      const slipIdToEmpId = new Map<string, string>();

      for (const entry of uniquePayrollEmployeesList) {
        const matched = entry.match.employee;
        if (!matched) continue;
        nextLinks[entry.tokenKey] = matched.id;
        nextLinks[entry.rawHeaderName.trim().toUpperCase()] = matched.id;
        entry.slipIds.forEach(id => slipIdToEmpId.set(id, matched.id));

        const baseEmp = employeesToUpdateMap.get(matched.id) || matched;
        const nextEmp: Employee = {
          ...baseEmp,
          fechaAlta: entry.metadata.fechaIngresoISO || baseEmp.fechaAlta,
          costoPorDia: entry.valorBaseJornal > 0 ? entry.valorBaseJornal : baseEmp.costoPorDia,
          observaciones:
            entry.metadata.horarioTexto &&
            !String(baseEmp.observaciones || '').includes(entry.metadata.horarioTexto)
              ? [baseEmp.observaciones, `Horario Liquidación: ${entry.metadata.horarioTexto}`]
                  .filter(Boolean)
                  .join(' • ')
              : baseEmp.observaciones,
        };
        employeesToUpdateMap.set(matched.id, nextEmp);
      }

      const toSave = Array.from(employeesToUpdateMap.values());
      if (toSave.length > 0) {
        const ok = await onUpsertEmployees(toSave);
        if (!ok) {
          setErrorMsg('Supabase no confirmó la actualización de legajos en Nómina.');
          return;
        }
      }

      await saveConfigToSupabase({ employeeDirectoryLinks: nextLinks });

      if (activePeriod && slipIdToEmpId.size > 0) {
        const updatedPeriods = periods.map(p => {
          if (p.id !== activePeriod.id) return p;
          return {
            ...p,
            slips: p.slips.map(s =>
              slipIdToEmpId.has(s.id) ? { ...s, empleadoId: slipIdToEmpId.get(s.id) } : s
            ),
            updatedAt: new Date().toISOString(),
          };
        });
        await persistPeriodsToSupabase(
          updatedPeriods,
          `Se sincronizaron ${toSave.length} legajos con Nómina de Personal (Fecha de Ingreso, Jornal Base y vínculo ID) en Supabase.`
        );
      }
      onShowToast?.(`Sincronizados ${toSave.length} empleados con la Nómina en Supabase.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al sincronizar con Nómina en Supabase.');
    } finally {
      setIsSyncingNomina(false);
    }
  };

  // Period KPI Totals (reflecting current view / week filter)
  const periodMetrics = useMemo(() => {
    const list = filteredSlips;
    const totalBasico = list.reduce((acc, s) => acc + (s.totalBasicoIngresos || 0), 0);
    const totalExtra = list.reduce((acc, s) => acc + (s.totalExtraIngresos || 0), 0);
    const totalDescuentos = list.reduce((acc, s) => acc + (s.totalEgresos || 0), 0);
    const totalNeto = list.reduce((acc, s) => acc + (s.netoACobrar || 0), 0);
    const totalHorasExtrasCount = list.reduce(
      (acc, s) =>
        acc +
        s.extraItems.reduce((hAcc, it) => hAcc + (it.ingreso > 0 ? Number(it.cantidad) || 0 : 0), 0),
      0
    );
    return {
      fichasCount: list.length,
      empleadosUnicosCount: consolidatedEmployees.length,
      totalBasico,
      totalExtra,
      totalDescuentos,
      totalNeto,
      totalHorasExtrasCount,
    };
  }, [filteredSlips, consolidatedEmployees]);

  // Grand Monthly Total across ALL weeks (1° + 2° + 3° + 4° Semana) + Hoja R Payment/Saldo Totals
  const grandMonthTotals = useMemo(() => {
    const all = searchMatchedSlips;
    let basico = 0;
    let extras = 0;
    let ingresos = 0;
    let descuentosReales = 0;
    let totalACobrar = 0;
    let transf = 0;
    let efectivo = 0;
    let saldo = 0;
    let descuentos = 0;
    let neto = 0;
    for (const s of all) {
      const bd = getSlipSummaryBreakdown(s);
      basico += bd.basico;
      extras += bd.extras;
      ingresos += bd.total;
      descuentosReales += bd.descuentos;
      totalACobrar += bd.totalACobrar;
      transf += bd.pagoTransferencia;
      efectivo += bd.pagoEfectivo;
      saldo += bd.saldo;
      descuentos += s.totalEgresos || 0;
      neto += s.netoACobrar || 0;
    }
    return {
      fichas: all.length,
      basico: Math.round(basico * 100) / 100,
      extras: Math.round(extras * 100) / 100,
      ingresos: Math.round(ingresos * 100) / 100,
      descuentosReales: Math.round(descuentosReales * 100) / 100,
      totalACobrar: Math.round(totalACobrar * 100) / 100,
      transf: Math.round(transf * 100) / 100,
      efectivo: Math.round(efectivo * 100) / 100,
      pagadoTotal: Math.round((transf + efectivo) * 100) / 100,
      saldo: Math.round(saldo * 100) / 100,
      descuentos: Math.round(descuentos * 100) / 100,
      neto: Math.round(neto * 100) / 100,
    };
  }, [searchMatchedSlips]);

  const detectedCompanionRTab = useMemo(() => {
    const monthTab = activePeriod?.sheetTabName || activePeriod?.nombrePeriodo || '';
    const savedValid =
      activePeriod?.companionRSheetTabName &&
      doesRSheetMatchMonthPeriod(activePeriod.companionRSheetTabName, monthTab)
        ? activePeriod.companionRSheetTabName
        : '';
    const overrideValid =
      selectedRSheetTabOverride &&
      doesRSheetMatchMonthPeriod(selectedRSheetTabOverride, monthTab)
        ? selectedRSheetTabOverride
        : '';
    return (
      overrideValid ||
      savedValid ||
      findCompanionSummaryTabTitle(monthTab, tabs) ||
      ''
    );
  }, [selectedRSheetTabOverride, activePeriod, tabs]);

  useEffect(() => {
    setSelectedRSheetTabOverride('');
  }, [activePeriod?.id]);

  const rTabCandidates = useMemo(() => {
    return tabs.filter(t => /^R[\s._-]|RESUMEN/i.test(t.title.trim()));
  }, [tabs]);

  // Handlers for Creating / Editing a Single Employee Slip (in a specific week)
  const handleOpenNewSlipModal = (targetWeekNum?: number) => {
    if (!activePeriod) return;
    const weekToUse =
      targetWeekNum || (selectedWeekFilter !== 'ALL' ? selectedWeekFilter : 1);
    const activeGrp = selectedGroupTab === 'ALL' ? 'LA_HORMIGA' : selectedGroupTab;
    const weekBanner = getCanonicalWeekBanner(weekToUse, undefined, activeGrp);
    const defaultSlip = createDefaultSlipTemplate(
      'NUEVO EMPLEADO',
      activePeriod.nombrePeriodo.split(' ')[0] || 'OCTUBRE',
      activePeriod.rangoDefault || '01.10 AL 31.10',
      weekBanner,
      60000
    );
    setEditingSlip(defaultSlip);
    setOriginalEditingSlip(null);
    setIsNewSlip(true);
  };

  // Clone employees from previous week into target week (e.g. Copy 1° Semana -> 2° Semana)
  const handleClonePreviousWeekIntoWeek = async (targetWeekNum: number) => {
    if (!activePeriod) return;
    const sourceWeekNum = targetWeekNum > 1 ? targetWeekNum - 1 : 1;
    const activeGrp = selectedGroupTab === 'ALL' ? 'LA_HORMIGA' : selectedGroupTab;
    const sourceSlips = groupFilteredSlips.filter(
      s => (s.numeroSemana || detectWeekNumberFromText(s.grupoSemana)) === sourceWeekNum
    );
    const fallbackSlips =
      sourceSlips.length > 0 ? sourceSlips : groupFilteredSlips.slice(0, 2);

    if (fallbackSlips.length === 0) {
      handleOpenNewSlipModal(targetWeekNum);
      return;
    }

    const targetBanner = getCanonicalWeekBanner(targetWeekNum, undefined, activeGrp);
    const clonedForWeek: EmployeePayrollSlip[] = fallbackSlips.map(orig => {
      const copy: EmployeePayrollSlip = JSON.parse(JSON.stringify(orig));
      copy.id = `SLIP-W${targetWeekNum}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      copy.numeroSemana = targetWeekNum;
      copy.grupoSemana = targetBanner;
      // Reset extra hours & one-off deductions so the user can enter that week's hours
      copy.extraItems = copy.extraItems
        .filter(it => it.tarifaUnitaria > 0)
        .map(it => ({
          ...it,
          cantidad: 0,
          ingreso: 0,
          egreso: 0,
        }));
      return recalculatePayrollSlip(copy);
    });

    const updatedPeriods = periods.map(p => {
      if (p.id !== activePeriod.id) return p;
      return {
        ...p,
        slips: [...p.slips, ...clonedForWeek],
        updatedAt: new Date().toISOString(),
      };
    });

    setSelectedWeekFilter(targetWeekNum);
    await persistPeriodsToSupabase(
      updatedPeriods,
      `Se generaron ${clonedForWeek.length} fichas en "${targetBanner}" copiando la base de la ${sourceWeekNum}° Semana.`
    );
  };

  const formatTodaySlash = () => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const buildNewMovementItem = (
    kind: PayrollMovementCategory,
    presetConcept?: string
  ): PayrollExtraItem => {
    const uid = `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (kind === 'HORA_EXTRA') {
      return {
        id: uid,
        cantidad: 1,
        concepto: (presetConcept || 'HORA EXTRA ADICIONAL').toUpperCase(),
        tarifaUnitaria: 5000,
        ingreso: 5000,
        egreso: 0,
        tipoMovimiento: 'HORA_EXTRA',
      };
    }
    if (kind === 'TRANSFERENCIA') {
      return {
        id: uid,
        fechaDetalle: formatTodaySlash(),
        cantidad: 0,
        concepto: (presetConcept || 'TRANSFERENCIA A CTA.').toUpperCase(),
        tarifaUnitaria: 0,
        ingreso: 0,
        egreso: 0,
        manualMonto: true,
        tipoMovimiento: 'TRANSFERENCIA',
      };
    }
    if (kind === 'ANTICIPO') {
      return {
        id: uid,
        fechaDetalle: formatTodaySlash(),
        cantidad: 0,
        concepto: (presetConcept || 'ANTICIPO').toUpperCase(),
        tarifaUnitaria: 0,
        ingreso: 0,
        egreso: 0,
        manualMonto: true,
        tipoMovimiento: 'ANTICIPO',
      };
    }
    return {
      id: uid,
      fechaDetalle: '',
      cantidad: 0,
      concepto: (presetConcept || 'DESCUENTO').toUpperCase(),
      tarifaUnitaria: 0,
      ingreso: 0,
      egreso: 0,
      manualMonto: true,
      tipoMovimiento: 'DESCUENTO',
    };
  };

  const handleOpenEditSlipModal = (
    slip: EmployeePayrollSlip,
    quickAddKind?: PayrollMovementCategory,
    presetConcept?: string
  ) => {
    const copy: EmployeePayrollSlip = JSON.parse(JSON.stringify(slip));
    copy.extraItems = orderPayrollExtraItems(copy.extraItems);
    let focusId: string | null = null;
    if (quickAddKind) {
      const newItem = buildNewMovementItem(quickAddKind, presetConcept);
      copy.extraItems = orderPayrollExtraItems([...copy.extraItems, newItem]);
      focusId = newItem.id;
    }
    setEditingSlip(recalculatePayrollSlip(copy));
    setOriginalEditingSlip(JSON.parse(JSON.stringify(slip)));
    setHighlightedExtraId(focusId);
    setSyncToSheetOnSave(true);
    setIsNewSlip(false);
    setShowActivitySidePopup(true);
  };

  const handleAddMovementToEditingSlip = (
    kind: PayrollMovementCategory,
    presetConcept?: string
  ) => {
    const newItem = buildNewMovementItem(kind, presetConcept);
    setHighlightedExtraId(newItem.id);
    setEditingSlip(prev => {
      if (!prev) return null;
      const ordered = orderPayrollExtraItems([...prev.extraItems, newItem]);
      return recalculatePayrollSlip({
        ...prev,
        extraItems: ordered,
      });
    });
  };

  const fetchSpreadsheetTabsOnly = async (
    token: string,
    targetSpreadsheetId: string
  ): Promise<{ docTitle: string; sheetList: SheetTabInfo[] }> => {
    if (!token || token === PUBLIC_LINK_TOKEN) {
      const pubMeta = await fetchPublicWorkbookMetadata(targetSpreadsheetId, true);
      setSpreadsheetTitle(pubMeta.title);
      setTabs(pubMeta.sheets);
      await saveConfigToSupabase({
        spreadsheetId: targetSpreadsheetId,
        spreadsheetUrl: sheetUrlInput,
        spreadsheetTitle: pubMeta.title,
        availableTabsCache: pubMeta.sheets,
      });
      return { docTitle: pubMeta.title, sheetList: pubMeta.sheets };
    }

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        targetSpreadsheetId
      )}?fields=properties.title,sheets.properties`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      try {
        const pubMeta = await fetchPublicWorkbookMetadata(targetSpreadsheetId, true);
        setSpreadsheetTitle(pubMeta.title);
        setTabs(pubMeta.sheets);
        await saveConfigToSupabase({
          spreadsheetId: targetSpreadsheetId,
          spreadsheetUrl: sheetUrlInput,
          spreadsheetTitle: pubMeta.title,
          availableTabsCache: pubMeta.sheets,
        });
        return { docTitle: pubMeta.title, sheetList: pubMeta.sheets };
      } catch {
        // Continue to standard Google error handling
      }
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `Error HTTP ${res.status}`;
      if (res.status === 401) {
        setSession(null);
        throw new Error('Tu sesión de Google expiró. Volvé a conectar tu cuenta.');
      }
      if (res.status === 403 && msg.toLowerCase().includes('insufficient authentication scopes')) {
        setSession(null);
        throw new Error(
          'Faltó tildar el permiso de Google Sheets en la ventana de Google. Hacé clic en "Conectar Google y Leer" y marcá la casilla de Hojas de cálculo.'
        );
      }
      throw new Error(`No se pudo leer la lista de libros/hojas: ${msg}`);
    }

    const data = await res.json();
    const docTitle = data.properties?.title || 'Planilla de Sueldos';
    setSpreadsheetTitle(docTitle);

    const sheetList: SheetTabInfo[] = (data.sheets || []).map((s: any) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      index: s.properties.index,
    }));
    setTabs(sheetList);

    await saveConfigToSupabase({
      spreadsheetId: targetSpreadsheetId,
      spreadsheetUrl: sheetUrlInput,
      spreadsheetTitle: docTitle,
      availableTabsCache: sheetList,
    });

    return { docTitle, sheetList };
  };

  const handleOpenTabsSelectorModal = async () => {
    setErrorMsg(null);
    let activeToken = session?.accessToken || '';
    const targetId = extractSpreadsheetId(sheetUrlInput) || spreadsheetId;

    if (!activeToken) {
      try {
        const result = await googleSignIn();
        if (result) {
          activeToken = result.accessToken;
          setSession({
            email: result.user.email || 'Cuenta Google',
            accessToken: result.accessToken,
          });
          setSyncToSheetOnSave(true);
        }
      } catch (err: any) {
        // Try public workbook fallback if link sharing is enabled
        try {
          await fetchPublicWorkbookMetadata(targetId, true);
          activeToken = PUBLIC_LINK_TOKEN;
          setSession({
            email: 'Enlace compartido (Lectura directa)',
            accessToken: PUBLIC_LINK_TOKEN,
          });
        } catch {
          setErrorMsg(err?.message || 'No se pudo conectar con Google para listar los libros.');
          return;
        }
      }
    }

    let currentTabs = tabs;
    if (activeToken && targetId) {
      setIsLoadingSheet(true);
      try {
        const meta = await fetchSpreadsheetTabsOnly(activeToken, targetId);
        currentTabs = meta.sheetList;
      } catch (err: any) {
        setErrorMsg(err?.message || 'No se pudo obtener la lista de hojas del Google Sheet.');
        setIsLoadingSheet(false);
        return;
      } finally {
        setIsLoadingSheet(false);
      }
    }

    const loadedSheetTabKeys = new Set(
      periods
        .filter(p => p.id.startsWith('PER-GSHEET-'))
        .map(p => (p.sheetTabName || p.nombrePeriodo).toUpperCase())
    );
    const savedSelectedKeys = new Set(
      (storedSheetConfig?.selectedSheetTabs || []).map(t => t.toUpperCase())
    );

    const initialChecked = currentTabs
      .filter(t => {
        const up = t.title.toUpperCase();
        return loadedSheetTabKeys.has(up) || savedSelectedKeys.has(up);
      })
      .map(t => t.title);

    setDraftSelectedTabs(initialChecked);
    setReReadSelectedTabs(true);
    setTabsSelectionProgress('');
    setShowTabsSelectorModal(true);
  };

  const handleApplyTabsSelection = async () => {
    if (draftSelectedTabs.length === 0) {
      setErrorMsg('Seleccioná al menos un libro/hoja para mostrar en la barra "MES:".');
      return;
    }
    const targetId = extractSpreadsheetId(sheetUrlInput) || spreadsheetId;
    let activeToken = session?.accessToken || '';
    if (!activeToken) {
      try {
        const result = await googleSignIn();
        if (!result) return;
        activeToken = result.accessToken;
        setSession({
          email: result.user.email || 'Cuenta Google',
          accessToken: result.accessToken,
        });
      } catch (err: any) {
        setErrorMsg(err?.message || 'No se pudo conectar con Google.');
        return;
      }
    }

    setIsApplyingTabsSelection(true);
    setErrorMsg(null);
    setTabsSelectionProgress('');

    try {
      const selectedSet = new Set(draftSelectedTabs.map(t => t.toUpperCase()));
      // Keep Google Sheet tab order (newest/last month first or sheet order — keep reverse sheet order so latest months appear first, or sheet order)
      const orderedTabs = tabs
        .filter(t => selectedSet.has(t.title.toUpperCase()))
        .map(t => t.title);
      const finalTabList = orderedTabs.length > 0 ? orderedTabs : draftSelectedTabs;

      const updatedSnapshots: Record<
        string,
        { headers: string[]; rows: string[][]; syncedAt: string }
      > = {};
      const importedPeriods: PayrollPeriodRecord[] = [];
      const emptyTabs: string[] = [];

      for (let i = 0; i < finalTabList.length; i++) {
        const tabTitle = finalTabList[i];
        const periodId = `PER-GSHEET-${tabTitle.toUpperCase().replace(/\s+/g, '-')}`;
        const existingPeriod = periods.find(p => p.id === periodId);
        const existingSnap = storedSheetConfig?.snapshotsByTab?.[tabTitle];

        if (!reReadSelectedTabs && existingPeriod && existingSnap) {
          importedPeriods.push(existingPeriod);
          continue;
        }

        setTabsSelectionProgress(`Leyendo "${tabTitle}" (${i + 1} de ${finalTabList.length})...`);
        let rawValues: string[][] = [];

        if (activeToken === PUBLIC_LINK_TOKEN) {
          const pubTab = await fetchPublicWorkbookTabValues(targetId, tabTitle, false);
          rawValues = pubTab.formattedValues;
        } else {
          const range = `'${tabTitle.replace(/'/g, "''")}'!A1:ZZ600`;
          const res = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
              targetId
            )}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
            {
              headers: { Authorization: `Bearer ${activeToken}` },
            }
          );

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            if (res.status === 401) {
              setSession(null);
              throw new Error('Tu sesión de Google expiró. Volvé a conectar tu cuenta.');
            }
            throw new Error(errBody?.error?.message || `Error al leer la hoja "${tabTitle}"`);
          }

          const data = await res.json();
          rawValues = data.values || [];
        }

        const parsedRawSlips = parseSheetGridIntoPayrollSlips(rawValues, tabTitle, {
          onlyLaHormiga: false,
        });
        const existingValidSlips = existingPeriod
          ? stripMismatchedRSheetData(existingPeriod.slips || [], tabTitle).slips
          : [];
        let parsedSlips = mergeCompanionRSheetFields(
          parsedRawSlips,
          existingValidSlips,
          storedSheetConfigRef.current?.employeeBankDirectory
        );

        let companionTabName =
          existingPeriod?.companionRSheetTabName &&
          doesRSheetMatchMonthPeriod(existingPeriod.companionRSheetTabName, tabTitle)
            ? existingPeriod.companionRSheetTabName
            : findCompanionSummaryTabTitle(tabTitle, tabs) || undefined;

        if (companionTabName && parsedSlips.length > 0) {
          try {
            setTabsSelectionProgress(
              `Leyendo "${tabTitle}" + "${companionTabName}" (${i + 1} de ${finalTabList.length})...`
            );
            let rValues: string[][] = [];
            if (activeToken === PUBLIC_LINK_TOKEN) {
              const pubR = await fetchPublicWorkbookTabValues(targetId, companionTabName, false);
              rValues = pubR.formattedValues;
            } else {
              const rRange = `'${companionTabName.replace(/'/g, "''")}'!A1:Z300`;
              const rRes = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
                  targetId
                )}/values/${encodeURIComponent(rRange)}?valueRenderOption=FORMATTED_VALUE`,
                { headers: { Authorization: `Bearer ${activeToken}` } }
              );
              if (rRes.ok) {
                const rJson = await rRes.json();
                rValues = rJson.values || [];
              }
            }
            if (rValues.length > 0) {
              const { updates: rUpdates, bankDirectory } = parseRSummaryGridIntoUpdates(
                rValues,
                companionTabName,
                parsedSlips
              );
              const nextBankDir = {
                ...(storedSheetConfigRef.current?.employeeBankDirectory || {}),
                ...bankDirectory,
              };
              await saveConfigToSupabase({ employeeBankDirectory: nextBankDir });
              if (rUpdates.length > 0) {
                const updMap = new Map(rUpdates.map(u => [u.slipId, u]));
                parsedSlips = parsedSlips.map(s => {
                  const u = updMap.get(s.id);
                  const tok = getEmployeeBankTokenKey(s.empleadoNombre);
                  const dir = tok ? nextBankDir[tok] : undefined;
                  if (!u) {
                    return {
                      ...s,
                      aliasBancario: s.aliasBancario || dir?.alias,
                      cbuBancario: s.cbuBancario || dir?.cbu,
                    };
                  }
                  return {
                    ...s,
                    pagoTransferencia: u.pagoTransferencia,
                    pagoEfectivo: u.pagoEfectivo,
                    observacionesPago: u.observacionesPago,
                    aliasBancario: u.aliasBancario || s.aliasBancario || dir?.alias,
                    cbuBancario: u.cbuBancario || s.cbuBancario || dir?.cbu,
                    rSheetSource: u.rSheetSource,
                    rSheetValues: u.rSheetValues,
                  };
                });
              }
            }
          } catch {
            // Non-fatal if R tab cannot be fetched
          }
        }

        const nowIso = new Date().toISOString();
        updatedSnapshots[tabTitle] = {
          headers: rawValues[0] || [],
          rows: rawValues,
          syncedAt: nowIso,
        };

        if (parsedSlips.length === 0) {
          emptyTabs.push(tabTitle);
          continue;
        }

        importedPeriods.push({
          id: periodId,
          nombrePeriodo: tabTitle.toUpperCase(),
          rangoDefault: parsedSlips[0]?.rangoFecha || '01 AL 31',
          grupoDefault: parsedSlips[0]?.grupoSemana || '1ERA SEMANA - LA HORMIGA',
          sheetTabName: tabTitle,
          companionRSheetTabName: companionTabName,
          slips: parsedSlips,
          updatedAt: nowIso,
        });
      }

      // Latest months first (reverse tab order so October appears before January)
      const orderedPeriods = [...importedPeriods].reverse();
      const manualPeriods = periods.filter(
        p => p.id !== 'PER-2026-10' && !p.id.startsWith('PER-GSHEET-')
      );
      const nextPeriods = [...orderedPeriods, ...manualPeriods];

      const effectiveSelectedNames = importedPeriods.map(
        p => p.sheetTabName || p.nombrePeriodo
      );

      await saveConfigToSupabase({
        selectedSheetTabs: effectiveSelectedNames,
        lastTabTitle: orderedPeriods[0]?.sheetTabName || storedSheetConfig?.lastTabTitle,
        lastActiveTab: orderedPeriods[0]?.sheetTabName || storedSheetConfig?.lastActiveTab,
        snapshotsByTab: updatedSnapshots,
      });

      if (nextPeriods.length > 0) {
        const stillExists = nextPeriods.some(p => p.id === activePeriodId);
        if (!stillExists) {
          setActivePeriodId(nextPeriods[0].id);
          setSelectedWeekFilter('ALL');
        }
      }

      setShowTabsSelectorModal(false);
      setTabsSelectionProgress('');

      const summaryLabels = orderedPeriods
        .map(p => `${p.nombrePeriodo} (${p.slips.length} fichas)`)
        .join(' • ');
      const emptyNote =
        emptyTabs.length > 0
          ? ` (Sin bloques de liquidación en: ${emptyTabs.join(', ')})`
          : '';

      await persistPeriodsToSupabase(
        nextPeriods,
        orderedPeriods.length > 0
          ? `¡Lista "MES:" actualizada! Mostrando La Hormiga, Tubomundo y Grupo IDN: ${summaryLabels}${emptyNote}.`
          : `No se encontraron liquidaciones en las hojas seleccionadas.${emptyNote}`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al aplicar la selección de hojas.');
    } finally {
      setIsApplyingTabsSelection(false);
      setTabsSelectionProgress('');
    }
  };

  const handleConnectGoogleOnly = async () => {
    setErrorMsg(null);
    const targetId = extractSpreadsheetId(sheetUrlInput) || spreadsheetId;
    try {
      const result = await googleSignIn();
      if (!result) return;
      setSession({
        email: result.user.email || 'Cuenta Google',
        accessToken: result.accessToken,
      });
      setSyncToSheetOnSave(true);
      let loadedTabsCount = tabs.length;
      if (targetId) {
        try {
          const meta = await fetchSpreadsheetTabsOnly(result.accessToken, targetId);
          loadedTabsCount = meta.sheetList.length;
        } catch {
          // Non-fatal if metadata fails; editing session is still active
        }
      }
      setSuccessMsg(
        `Sesión de Google conectada (${result.user.email}).${loadedTabsCount > 0 ? ` Se detectaron ${loadedTabsCount} libros/hojas: ya podés abrir "Elegir Libros / Meses" o editar directo en el Sheet.` : ' Ya podés guardar cambios al instante en tu Google Sheet.'}`
      );
    } catch (err: any) {
      if (targetId) {
        try {
          const meta = await fetchSpreadsheetTabsOnly(PUBLIC_LINK_TOKEN, targetId);
          setSession({
            email: 'Enlace compartido (Lectura directa)',
            accessToken: PUBLIC_LINK_TOKEN,
          });
          setSuccessMsg(
            `Planilla conectada por enlace directo (${meta.sheetList.length} libros/hojas detectados). Ya podés abrir "Elegir Libros / Meses".`
          );
          return;
        } catch {
          // Fall through to show error message
        }
      }
      setErrorMsg(err?.message || 'No se pudo conectar con Google para escribir en el Sheet.');
    }
  };

  const handleSaveSlipFromModal = async (options?: {
    tokenOverride?: string;
    skipSheetSync?: boolean;
  }) => {
    if (!editingSlip || !activePeriod) return;
    setErrorMsg(null);
    const origIds = new Set((originalEditingSlip?.extraItems || []).map(it => it.id));
    const cleanedExtraItems = orderPayrollExtraItems(
      editingSlip.extraItems.filter(it => {
        if (origIds.has(it.id)) return true;
        return it.cantidad > 0 || it.ingreso > 0 || it.egreso > 0;
      })
    );
    const recalculated = recalculatePayrollSlip({
      ...editingSlip,
      extraItems: cleanedExtraItems,
      rSheetValues: undefined,
    });
    const activeToken = options?.tokenOverride || session?.accessToken || '';
    const wantsSheetSync =
      !options?.skipSheetSync &&
      (Boolean(options?.tokenOverride) || syncToSheetOnSave) &&
      Boolean(recalculated.sheetSource) &&
      Boolean(spreadsheetId);

    if (wantsSheetSync && !activeToken) {
      setErrorMsg(
        'Tu sesión de Google no está conectada en esta pestaña. Tocá "Conectar Google y Guardar en Sheet" para aplicarlo en tu planilla ahora mismo, o elegí "Solo Guardar en Sistema".'
      );
      return;
    }

    let syncedCellsCount = 0;
    let sheetWarnings: string[] = [];

    if (wantsSheetSync && activeToken && recalculated.sheetSource) {
      setIsSyncingToSheet(true);
      try {
        const syncRes = await syncSlipEditsToGoogleSheet(
          spreadsheetId,
          recalculated,
          activeToken,
          originalEditingSlip
        );
        syncedCellsCount = syncRes.updatedCells;
        sheetWarnings = syncRes.warnings;

        // Re-read this tab from Google Sheets so Sheet formulas (TOTAL BASICO, A COBRAR, etc.) & Supabase stay 100% identical
        const tabTitle = recalculated.sheetSource.tabTitle;
        const range = `'${tabTitle.replace(/'/g, "''")}'!A1:ZZ600`;
        const readRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            spreadsheetId
          )}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
          {
            headers: { Authorization: `Bearer ${activeToken}` },
          }
        );

        if (readRes.ok) {
          const readData = await readRes.json();
          const rawValues: string[][] = readData.values || [];
          const reparsedRawSlips = parseSheetGridIntoPayrollSlips(rawValues, tabTitle, {
            onlyLaHormiga: false,
          });
          if (reparsedRawSlips.length > 0) {
            const reparsedSlips = mergeCompanionRSheetFields(
              reparsedRawSlips,
              activePeriod.slips.map(s =>
                s.id === recalculated.id ? { ...s, rSheetValues: undefined } : s
              ),
              storedSheetConfigRef.current?.employeeBankDirectory
            );
            const nowIso = new Date().toISOString();
            await saveConfigToSupabase({
              lastTabTitle: tabTitle,
              lastActiveTab: tabTitle,
              snapshotsByTab: {
                [tabTitle]: {
                  headers: rawValues[0] || [],
                  rows: rawValues,
                  syncedAt: nowIso,
                },
              },
            });
            const refreshedPeriods = periods.map(p =>
              p.id === activePeriod.id
                ? { ...p, slips: reparsedSlips, updatedAt: nowIso }
                : p
            );
            setEditingSlip(null);
            setOriginalEditingSlip(null);
            const droppedCount = Math.max(0, activePeriod.slips.length - reparsedSlips.length);
            if (droppedCount > 0) {
              await persistPeriodsToSupabase(refreshedPeriods);
              setErrorMsg(
                `Atención: al releer "${tabTitle}" desde Google Sheets aparecieron ${reparsedSlips.length} fichas (antes había ${activePeriod.slips.length}). Revisá tu planilla de Google Sheets (Historial de versiones) por si falta un encabezado FECHA | CONCEPTO.`
              );
              return;
            }
            const warnNote =
              sheetWarnings.length > 0 ? ` Aviso: ${sheetWarnings.join(' ')}` : '';
            await persistPeriodsToSupabase(
              refreshedPeriods,
              `¡Listo! Se actualizó al instante la ficha de "${recalculated.empleadoNombre}" en tu Google Sheet (${syncedCellsCount} celdas) y en el sistema.${warnNote}`
            );
            return;
          }
        }
      } catch (err: any) {
        const rawErr = String(err?.message || 'Error desconocido');
        if (rawErr.includes('SESSION_EXPIRED') || rawErr.includes('SCOPE_INSUFFICIENT')) {
          setSession(null);
        }
        setErrorMsg(
          `No se pudo modificar el Google Sheet: ${rawErr.replace(/^(SESSION_EXPIRED|SCOPE_INSUFFICIENT):\s*/, '')}`
        );
        return;
      } finally {
        setIsSyncingToSheet(false);
      }
    }

    const updatedPeriods = periods.map(p => {
      if (p.id !== activePeriod.id) return p;
      const exists = p.slips.some(s => s.id === recalculated.id);
      const nextSlips = exists
        ? p.slips.map(s => (s.id === recalculated.id ? recalculated : s))
        : [...p.slips, recalculated];
      return {
        ...p,
        slips: nextSlips,
        updatedAt: new Date().toISOString(),
      };
    });

    setEditingSlip(null);
    setOriginalEditingSlip(null);
    const msg =
      syncedCellsCount > 0
        ? `Ficha de "${recalculated.empleadoNombre}" guardada en Google Sheet (${syncedCellsCount} celdas) y en Supabase.${sheetWarnings.length ? ` Aviso: ${sheetWarnings.join(' ')}` : ''}`
        : recalculated.sheetSource
          ? `Guardado SOLO en el sistema (${recalculated.empleadoNombre}). Tu Google Sheet NO se modificó porque se guardó sin conexión a Google.`
          : `Ficha de "${recalculated.empleadoNombre}" (${recalculated.grupoSemana}) guardada en el sistema (Supabase).`;
    await persistPeriodsToSupabase(updatedPeriods, msg);
  };

  const handleConnectGoogleAndSaveSheet = async () => {
    setErrorMsg(null);
    setIsSyncingToSheet(true);
    try {
      const result = await googleSignIn();
      if (!result) {
        setIsSyncingToSheet(false);
        return;
      }
      setSession({
        email: result.user.email || 'Cuenta Google',
        accessToken: result.accessToken,
      });
      setSyncToSheetOnSave(true);
      await handleSaveSlipFromModal({ tokenOverride: result.accessToken });
    } catch (err: any) {
      setIsSyncingToSheet(false);
      setErrorMsg(
        err?.message || 'No se pudo conectar con Google para actualizar el Sheet.'
      );
    }
  };

  const handleDeleteSlip = async (slipId: string, nombre: string) => {
    if (!activePeriod) return;
    const updatedPeriods = periods.map(p => {
      if (p.id !== activePeriod.id) return p;
      return {
        ...p,
        slips: p.slips.filter(s => s.id !== slipId),
        updatedAt: new Date().toISOString(),
      };
    });
    await persistPeriodsToSupabase(
      updatedPeriods,
      `Ficha de "${nombre}" eliminada del período ${activePeriod.nombrePeriodo}.`
    );
  };

  // Handler for "Nuevo Mes (Copiar Mes Anterior)"
  const handleCreatePeriodFromPrevious = async () => {
    if (!activePeriod || !newPeriodName.trim()) return;
    const clonedSlips: EmployeePayrollSlip[] = activePeriod.slips.map(orig => {
      const copy: EmployeePayrollSlip = JSON.parse(JSON.stringify(orig));
      copy.id = `SLIP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      copy.mesTexto = newPeriodMesTexto.trim().toUpperCase() || copy.mesTexto;
      copy.rangoFecha = newPeriodRango.trim().toUpperCase() || copy.rangoFecha;
      if (resetExtrasOnCopy) {
        copy.extraItems = copy.extraItems
          .filter(it => it.tarifaUnitaria > 0)
          .map(it => ({
            ...it,
            cantidad: 0,
            ingreso: 0,
            egreso: 0,
          }));
      }
      return recalculatePayrollSlip(copy);
    });

    const newRecord: PayrollPeriodRecord = {
      id: `PER-${Date.now()}`,
      nombrePeriodo: newPeriodName.trim().toUpperCase(),
      rangoDefault: newPeriodRango.trim().toUpperCase(),
      grupoDefault: activePeriod.grupoDefault || '1ERA SEMANA - LA HORMIGA',
      slips: clonedSlips,
      updatedAt: new Date().toISOString(),
    };

    const nextPeriods = [newRecord, ...periods];
    setActivePeriodId(newRecord.id);
    setShowNewPeriodModal(false);
    await persistPeriodsToSupabase(
      nextPeriods,
      `Período "${newRecord.nombrePeriodo}" creado copiando ${clonedSlips.length} fichas semanales de "${activePeriod.nombrePeriodo}".`
    );
  };

  // Excel (.xlsx) Local File Upload & Multi-Week Block Parser
  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const importedPeriods: PayrollPeriodRecord[] = [];

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rawGrid = XLSX.utils.sheet_to_json<any[]>(worksheet, {
          header: 1,
          defval: '',
          raw: false,
        });
        const stringGrid: string[][] = rawGrid.map(row =>
          (Array.isArray(row) ? row : []).map(cell => String(cell ?? ''))
        );
        const parsedSlips = parseSheetGridIntoPayrollSlips(stringGrid, sheetName);
        if (parsedSlips.length > 0) {
          importedPeriods.push({
            id: `PER-XLSX-${sheetName.toUpperCase()}-${Date.now()}`,
            nombrePeriodo: `${sheetName.toUpperCase()}`,
            rangoDefault: parsedSlips[0]?.rangoFecha || '01 AL 31',
            grupoDefault: parsedSlips[0]?.grupoSemana || '1ERA SEMANA - LA HORMIGA',
            sheetTabName: sheetName,
            slips: parsedSlips,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      if (importedPeriods.length === 0) {
        setErrorMsg(
          'No se detectaron bloques con formato "FECHA | CONCEPTO | INGRESOS | EGRESOS" en el archivo seleccionado.'
        );
        return;
      }

      const withoutDemo = periods.filter(p => p.id !== 'PER-2026-10');
      const merged = [...importedPeriods, ...withoutDemo];
      setActivePeriodId(importedPeriods[0].id);
      setSelectedWeekFilter('ALL');
      setShowImporterPanel(false);
      const totalEmp = importedPeriods.reduce((acc, p) => acc + p.slips.length, 0);
      await persistPeriodsToSupabase(
        merged,
        `Se leyeron ${totalEmp} fichas exactas (1° a 4° Semana) desde tu archivo Excel y se actualizaron todos los valores del sistema.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al procesar el archivo Excel.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Google Sheets OAuth + Multi-Week Block Parser
  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const id = extractSpreadsheetId(sheetUrlInput);
    try {
      const result = await googleSignIn();
      if (!result) return;
      const authSession: GoogleSheetsAuthSession = {
        email: result.user.email || 'Cuenta Google',
        accessToken: result.accessToken,
      };
      setSession(authSession);
      if (id) {
        await fetchGoogleSheetMetadataAndParse(authSession.accessToken, id);
      }
    } catch (err: any) {
      if (id) {
        try {
          const authSession: GoogleSheetsAuthSession = {
            email: 'Enlace compartido (Lectura directa)',
            accessToken: PUBLIC_LINK_TOKEN,
          };
          await fetchGoogleSheetMetadataAndParse(PUBLIC_LINK_TOKEN, id);
          setSession(authSession);
          return;
        } catch {
          // Fall through to error message
        }
      }
      setErrorMsg(err?.message || 'No se pudo iniciar sesión con Google.');
    }
  };

  const handleGoogleSignOut = async () => {
    await logoutGoogle();
    setSession(null);
    setTabs([]);
  };

  const fetchGoogleSheetMetadataAndParse = async (
    token: string,
    targetSpreadsheetId: string
  ) => {
    setIsLoadingSheet(true);
    setErrorMsg(null);
    try {
      const { sheetList } = await fetchSpreadsheetTabsOnly(token, targetSpreadsheetId);

      if (sheetList.length > 0) {
        const monthRegex =
          /\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b/i;
        const preferredTab =
          (activePeriod?.sheetTabName &&
            sheetList.find(
              s => s.title.toUpperCase() === activePeriod.sheetTabName!.toUpperCase()
            )?.title) ||
          (selectedTabForImport &&
            sheetList.find(
              s => s.title.toUpperCase() === selectedTabForImport.toUpperCase()
            )?.title) ||
          [...sheetList].reverse().find(s => monthRegex.test(s.title))?.title ||
          sheetList[sheetList.length - 1].title;

        setSelectedTabForImport(preferredTab);
        await importTabFromGoogleSheet(token, targetSpreadsheetId, preferredTab);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al conectar con Google Sheets.');
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const importTabFromGoogleSheet = async (
    token: string,
    targetSpreadsheetId: string,
    tabTitle: string
  ) => {
    setIsLoadingSheet(true);
    setErrorMsg(null);
    try {
      let rawValues: string[][] = [];
      if (!token || token === PUBLIC_LINK_TOKEN) {
        const pubData = await fetchPublicWorkbookTabValues(targetSpreadsheetId, tabTitle, false);
        rawValues = pubData.formattedValues;
      } else {
        // Read up to 600 rows vertically and ZZ columns horizontally so we capture 1ERA, 2DA, 3ERA, 4TA and 5TA SEMANA
        const range = `'${tabTitle.replace(/'/g, "''")}'!A1:ZZ600`;
        const res = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            targetSpreadsheetId
          )}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          try {
            const pubData = await fetchPublicWorkbookTabValues(targetSpreadsheetId, tabTitle, false);
            rawValues = pubData.formattedValues;
          } catch {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody?.error?.message || `Error al leer la pestaña ${tabTitle}`);
          }
        } else {
          const data = await res.json();
          rawValues = data.values || [];
        }
      }

      const rawSlips = parseSheetGridIntoPayrollSlips(rawValues, tabTitle);

      if (rawSlips.length === 0) {
        setErrorMsg(
          `Se leyó la pestaña "${tabTitle}" pero no se encontraron bloques con estructura "FECHA | CONCEPTO | INGRESOS | EGRESOS".`
        );
        return;
      }

      const periodId = `PER-GSHEET-${tabTitle.toUpperCase().replace(/\s+/g, '-')}`;
      const existingSamePeriod = periods.find(p => p.id === periodId);
      const validExistingSlips = existingSamePeriod
        ? stripMismatchedRSheetData(existingSamePeriod.slips || [], tabTitle).slips
        : [];
      let parsedSlips = mergeCompanionRSheetFields(
        rawSlips,
        validExistingSlips,
        storedSheetConfigRef.current?.employeeBankDirectory
      );

      // Auto-sync companion R-summary tab (e.g. R-10.2026 next to OCTUBRE 2026) if present
      let companionNote = '';
      let detectedRTabName =
        existingSamePeriod?.companionRSheetTabName &&
        doesRSheetMatchMonthPeriod(existingSamePeriod.companionRSheetTabName, tabTitle)
          ? existingSamePeriod.companionRSheetTabName
          : undefined;
      const candidateRTab =
        detectedRTabName || findCompanionSummaryTabTitle(tabTitle, tabs);
      let mergedBankDir = { ...(storedSheetConfigRef.current?.employeeBankDirectory || {}) };

      if (candidateRTab) {
        try {
          let rValues: string[][] = [];
          if (!token || token === PUBLIC_LINK_TOKEN) {
            const pubR = await fetchPublicWorkbookTabValues(
              targetSpreadsheetId,
              candidateRTab,
              false
            );
            rValues = pubR.formattedValues;
          } else {
            const rRange = `'${candidateRTab.replace(/'/g, "''")}'!A1:Z300`;
            const rRes = await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
                targetSpreadsheetId
              )}/values/${encodeURIComponent(rRange)}?valueRenderOption=FORMATTED_VALUE`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (rRes.ok) {
              const rJson = await rRes.json();
              rValues = rJson.values || [];
            }
          }
          if (rValues.length > 0) {
            const { updates: rUpdates, bankDirectory } = parseRSummaryGridIntoUpdates(
              rValues,
              candidateRTab,
              parsedSlips
            );
            mergedBankDir = { ...mergedBankDir, ...bankDirectory };
            if (rUpdates.length > 0) {
              const updMap = new Map(rUpdates.map(u => [u.slipId, u]));
              parsedSlips = parsedSlips.map(s => {
                const u = updMap.get(s.id);
                const tok = getEmployeeBankTokenKey(s.empleadoNombre);
                const dir = tok ? mergedBankDir[tok] : undefined;
                if (!u) {
                  return {
                    ...s,
                    aliasBancario: s.aliasBancario || dir?.alias,
                    cbuBancario: s.cbuBancario || dir?.cbu,
                  };
                }
                return {
                  ...s,
                  pagoTransferencia: u.pagoTransferencia,
                  pagoEfectivo: u.pagoEfectivo,
                  observacionesPago: u.observacionesPago,
                  aliasBancario: u.aliasBancario || s.aliasBancario || dir?.alias,
                  cbuBancario: u.cbuBancario || s.cbuBancario || dir?.cbu,
                  rSheetSource: u.rSheetSource,
                  rSheetValues: u.rSheetValues,
                };
              });
              detectedRTabName = candidateRTab;
              companionNote = ` También se importaron pagos, saldos, alias y CBU desde "${candidateRTab}" (${rUpdates.length} filas).`;
            }
          }
        } catch {
          // Non-fatal: monthly sheet still imports cleanly even if companion R-tab isn't accessible
        }
      }

      const nowIso = new Date().toISOString();
      const prevSelected = storedSheetConfigRef.current?.selectedSheetTabs;
      const nextSelected =
        Array.isArray(prevSelected) && prevSelected.length > 0
          ? prevSelected.some(t => t.toUpperCase() === tabTitle.toUpperCase())
            ? prevSelected
            : [...prevSelected, tabTitle]
          : undefined;
      await saveConfigToSupabase({
        lastTabTitle: tabTitle,
        lastActiveTab: tabTitle,
        employeeBankDirectory: mergedBankDir,
        ...(nextSelected ? { selectedSheetTabs: nextSelected } : {}),
        snapshotsByTab: {
          [tabTitle]: {
            headers: rawValues[0] || [],
            rows: rawValues,
            syncedAt: nowIso,
          },
        },
      });

      const weeksDetected = new Set(parsedSlips.map(s => s.numeroSemana || 1)).size;
      const newPeriod: PayrollPeriodRecord = {
        id: periodId,
        nombrePeriodo: `${tabTitle.toUpperCase()}`,
        rangoDefault: parsedSlips[0]?.rangoFecha || '01 AL 31',
        grupoDefault: parsedSlips[0]?.grupoSemana || '1ERA SEMANA - LA HORMIGA',
        sheetTabName: tabTitle,
        companionRSheetTabName: detectedRTabName,
        slips: parsedSlips,
        updatedAt: nowIso,
      };

      const basePeriods = periods.filter(p => p.id !== 'PER-2026-10');
      const existsIdx = basePeriods.findIndex(p => p.id === periodId);
      const nextPeriods =
        existsIdx >= 0
          ? basePeriods.map((p, i) => (i === existsIdx ? newPeriod : p))
          : [newPeriod, ...basePeriods];

      setActivePeriodId(periodId);
      setSelectedWeekFilter('ALL');
      setShowImporterPanel(false);
      await persistPeriodsToSupabase(
        nextPeriods,
        `¡Listo! Se leyeron ${parsedSlips.length} fichas exactas distribuidas en ${weeksDetected} semana(s) directo desde tu Google Sheet ("${tabTitle}").${companionNote}`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al importar la pestaña desde Google Sheets.');
    } finally {
      setIsLoadingSheet(false);
    }
  };

  // Update inline Hoja R fields (Transf., Efectivo, Observaciones, Alias, CBU) in state
  const handleInlineRSummaryFieldChange = (
    slipId: string,
    field: 'pagoTransferencia' | 'pagoEfectivo' | 'observacionesPago' | 'aliasBancario' | 'cbuBancario',
    rawValue: string
  ) => {
    if (!activePeriod) return;
    setPeriods(prev =>
      prev.map(p => {
        if (p.id !== activePeriod.id) return p;
        return {
          ...p,
          slips: p.slips.map(s => {
            if (s.id !== slipId) return s;
            if (field === 'pagoTransferencia') {
              const trimmed = rawValue.trim();
              const parsed = trimmed === '' ? undefined : parseFloat(trimmed) || 0;
              return { ...s, pagoTransferencia: parsed };
            }
            if (field === 'pagoEfectivo') {
              const trimmed = rawValue.trim();
              const parsed = trimmed === '' ? 0 : parseFloat(trimmed) || 0;
              return { ...s, pagoEfectivo: parsed };
            }
            return { ...s, [field]: rawValue };
          }),
        };
      })
    );
    setDirtyRSlipIds(prev => ({ ...prev, [slipId]: true }));
  };

  const handleImportCompanionRSheet = async (
    tabOverride?: string,
    targetPeriodOverride?: PayrollPeriodRecord
  ) => {
    const targetPeriod = targetPeriodOverride || activePeriod;
    if (!targetPeriod) return;
    const targetId = extractSpreadsheetId(sheetUrlInput) || spreadsheetId;
    if (!targetId) {
      setErrorMsg('Ingresá el link de tu Google Sheet para leer la Hoja R.');
      return;
    }

    setErrorMsg(null);
    setIsSyncingRSheet(true);
    try {
      let activeToken = session?.accessToken || '';
      if (!activeToken) {
        const result = await googleSignIn();
        if (!result) return;
        activeToken = result.accessToken;
        setSession({
          email: result.user.email || 'Cuenta Google',
          accessToken: result.accessToken,
        });
      }

      let currentTabs = tabs;
      if (currentTabs.length === 0) {
        const meta = await fetchSpreadsheetTabsOnly(activeToken, targetId);
        currentTabs = meta.sheetList;
      }

      const monthTab = targetPeriod.sheetTabName || targetPeriod.nombrePeriodo;
      const savedMatchingR =
        targetPeriod.companionRSheetTabName &&
        doesRSheetMatchMonthPeriod(targetPeriod.companionRSheetTabName, monthTab)
          ? targetPeriod.companionRSheetTabName
          : '';
      const targetRTab =
        tabOverride ||
        (selectedRSheetTabOverride &&
        doesRSheetMatchMonthPeriod(selectedRSheetTabOverride, monthTab)
          ? selectedRSheetTabOverride
          : '') ||
        savedMatchingR ||
        findCompanionSummaryTabTitle(monthTab, currentTabs) ||
        '';

      if (!targetRTab) {
        setErrorMsg(
          `No se encontró automáticamente una hoja resumen correspondiente a "${monthTab}". Verificá el nombre de la pestaña "R-..." en Google Sheets.`
        );
        return;
      }

      // Strictly prevent reading a wrong-month R-sheet (e.g. R-09.2026) onto OCTUBRE 2026!
      if (!doesRSheetMatchMonthPeriod(targetRTab, monthTab)) {
        const expectedMonthTab = findMonthTabForRSheet(targetRTab, currentTabs);
        const matchingLoadedPeriod = periods.find(p =>
          doesRSheetMatchMonthPeriod(targetRTab, p.sheetTabName || p.nombrePeriodo)
        );
        if (matchingLoadedPeriod) {
          setActivePeriodId(matchingLoadedPeriod.id);
          setSelectedRSheetTabOverride(targetRTab);
          setIsSyncingRSheet(false);
          await handleImportCompanionRSheet(targetRTab, matchingLoadedPeriod);
          return;
        }
        if (expectedMonthTab) {
          setIsSyncingRSheet(false);
          await importTabFromGoogleSheet(activeToken, targetId, expectedMonthTab);
          return;
        }
        setErrorMsg(
          `La hoja "${targetRTab}" no corresponde a "${monthTab}". Elegí o importá primero el mes de "${targetRTab}" en MES:.`
        );
        return;
      }

      const rRange = `'${targetRTab.replace(/'/g, "''")}'!A1:Z300`;
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          targetId
        )}/values/${encodeURIComponent(rRange)}?valueRenderOption=FORMATTED_VALUE`,
        { headers: { Authorization: `Bearer ${activeToken}` } }
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setSession(null);
          throw new Error('Tu sesión de Google expiró. Volvé a conectar tu cuenta.');
        }
        throw new Error(errBody?.error?.message || `No se pudo leer la pestaña "${targetRTab}".`);
      }

      const data = await res.json();
      const rawValues: string[][] = data.values || [];
      const { updates, bankDirectory, scannedRowsCount } = parseRSummaryGridIntoUpdates(
        rawValues,
        targetRTab,
        targetPeriod.slips
      );

      if (updates.length === 0) {
        setErrorMsg(
          `Se leyó "${targetRTab}" (${scannedRowsCount} filas), pero no coincidieron empleados de LA HORMIGA con "${targetPeriod.nombrePeriodo}". Verificá que la pestaña corresponda a este mes.`
        );
        return;
      }

      const mergedBankDir = {
        ...(storedSheetConfigRef.current?.employeeBankDirectory || {}),
        ...bankDirectory,
      };
      await saveConfigToSupabase({ employeeBankDirectory: mergedBankDir });

      const updMap = new Map(updates.map(u => [u.slipId, u]));
      const nowIso = new Date().toISOString();
      const updatedPeriods = periods.map(p => {
        if (p.id !== targetPeriod.id) return p;
        return {
          ...p,
          companionRSheetTabName: targetRTab,
          updatedAt: nowIso,
          slips: p.slips.map(s => {
            const u = updMap.get(s.id);
            const tok = getEmployeeBankTokenKey(s.empleadoNombre);
            const dir = tok ? mergedBankDir[tok] : undefined;
            if (!u) {
              return {
                ...s,
                aliasBancario: s.aliasBancario || dir?.alias,
                cbuBancario: s.cbuBancario || dir?.cbu,
              };
            }
            return {
              ...s,
              pagoTransferencia: u.pagoTransferencia,
              pagoEfectivo: u.pagoEfectivo,
              observacionesPago: u.observacionesPago,
              aliasBancario: u.aliasBancario || s.aliasBancario || dir?.alias,
              cbuBancario: u.cbuBancario || s.cbuBancario || dir?.cbu,
              rSheetSource: u.rSheetSource,
              rSheetValues: u.rSheetValues,
            };
          }),
        };
      });

      setDirtyRSlipIds({});
      await persistPeriodsToSupabase(
        updatedPeriods,
        `¡Hoja R "${targetRTab}" sincronizada! Se actualizaron ${updates.length} filas de pagos, saldos, alias y CBU para empleados de La Hormiga.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al sincronizar la Hoja R desde Google Sheets.');
    } finally {
      setIsSyncingRSheet(false);
    }
  };

  const handleSaveRSummaryChanges = async (options?: { alsoSyncSheet?: boolean }) => {
    if (!activePeriod) return;
    setErrorMsg(null);
    setIsSyncingRSheet(true);
    try {
      const nextBankDir = { ...(storedSheetConfigRef.current?.employeeBankDirectory || {}) };
      for (const s of activePeriod.slips) {
        if (s.aliasBancario || s.cbuBancario) {
          const tok = getEmployeeBankTokenKey(s.empleadoNombre);
          if (tok) {
            nextBankDir[tok] = {
              alias: s.aliasBancario?.trim() || nextBankDir[tok]?.alias,
              cbu: s.cbuBancario?.trim() || nextBankDir[tok]?.cbu,
            };
          }
        }
      }

      // Propagate any newly entered Alias/CBU to other weeks of the same employee if empty
      const propagatedPeriods = periods.map(p => {
        if (p.id !== activePeriod.id) return p;
        return {
          ...p,
          updatedAt: new Date().toISOString(),
          slips: p.slips.map(s => {
            const tok = getEmployeeBankTokenKey(s.empleadoNombre);
            const dir = tok ? nextBankDir[tok] : undefined;
            return {
              ...s,
              aliasBancario: s.aliasBancario || dir?.alias,
              cbuBancario: s.cbuBancario || dir?.cbu,
            };
          }),
        };
      });

      await saveConfigToSupabase({ employeeBankDirectory: nextBankDir });

      let sheetMsg = '';
      if (options?.alsoSyncSheet && detectedCompanionRTab) {
        let activeToken = session?.accessToken || '';
        if (!activeToken) {
          const sign = await googleSignIn();
          if (sign) {
            activeToken = sign.accessToken;
            setSession({
              email: sign.user.email || 'Cuenta Google',
              accessToken: sign.accessToken,
            });
          }
        }
        const dirtyList = (
          propagatedPeriods.find(p => p.id === activePeriod.id)?.slips || []
        ).filter(s => dirtyRSlipIds[s.id] && s.rSheetSource?.tabTitle === detectedCompanionRTab);

        if (activeToken && dirtyList.length > 0 && spreadsheetId) {
          const writeRes = await syncRSummaryPaymentsToGoogleSheet(
            spreadsheetId,
            detectedCompanionRTab,
            dirtyList,
            activeToken
          );
          sheetMsg = ` y actualizado en "${detectedCompanionRTab}" (${writeRes.updatedCells} celdas, fórmulas intactas)`;
        }
      }

      setDirtyRSlipIds({});
      await persistPeriodsToSupabase(
        propagatedPeriods,
        `¡Resumen Hoja R guardado en Supabase${sheetMsg}!`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al guardar cambios del Resumen Hoja R.');
    } finally {
      setIsSyncingRSheet(false);
    }
  };

  const handleCopyBankField = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedBankKey(key);
      setTimeout(() => {
        setCopiedBankKey(prev => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  const handlePrintRSummaryReport = () => {
    if (!activePeriod) return;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const visibleWeeks = weeklySummaries.filter(w =>
      selectedWeekFilter === 'ALL' ? w.fichasCount > 0 : w.numeroSemana === selectedWeekFilter
    );

    const weeksHtml = visibleWeeks
      .map(w => {
        let sumB = 0;
        let sumE = 0;
        let sumT = 0;
        let sumD = 0;
        let sumCob = 0;
        let sumTr = 0;
        let sumEf = 0;
        let sumSal = 0;

        const rows = w.slips
          .map(s => {
            const bd = getSlipSummaryBreakdown(s);
            sumB += bd.basico;
            sumE += bd.extras;
            sumT += bd.total;
            sumD += bd.descuentos;
            sumCob += bd.totalACobrar;
            sumTr += bd.pagoTransferencia;
            sumEf += bd.pagoEfectivo;
            sumSal += bd.saldo;
            return `
              <tr>
                <td><strong>${s.empleadoNombre}</strong></td>
                <td style="text-align:right;">${formatARS(bd.basico)}</td>
                <td style="text-align:right;">${bd.extras > 0 ? formatARS(bd.extras) : '-'}</td>
                <td style="text-align:right;"><strong>${formatARS(bd.total)}</strong></td>
                <td style="text-align:right;">${bd.descuentos > 0 ? formatARS(bd.descuentos) : '-'}</td>
                <td style="text-align:right;"><strong>${formatARS(bd.totalACobrar)}</strong></td>
                <td style="text-align:right;">${bd.pagoTransferencia > 0 ? formatARS(bd.pagoTransferencia) : '-'}</td>
                <td style="text-align:right;">${bd.pagoEfectivo > 0 ? formatARS(bd.pagoEfectivo) : '-'}</td>
                <td style="text-align:right; font-weight:bold;">${formatARS(bd.saldo)}</td>
                <td>${s.observacionesPago || ''}</td>
                <td style="font-size:9px;">${s.aliasBancario ? `<div>${s.aliasBancario}</div>` : ''}${s.cbuBancario ? `<div>${s.cbuBancario}</div>` : ''}</td>
              </tr>
            `;
          })
          .join('');

        return `
          <div style="margin-top:12px;">
            <div style="font-weight:bold; background:#eee; border:1px solid #000; border-bottom:none; padding:4px 6px; font-size:11px;">
              ${w.numeroSemana}° SEMANA — ${w.grupoSemana} (${w.fichasCount} empleados)
            </div>
            <table>
              <thead>
                <tr>
                  <th style="text-align:left;">Empleado</th>
                  <th style="text-align:right;">Básico</th>
                  <th style="text-align:right;">Extras</th>
                  <th style="text-align:right;">Total</th>
                  <th style="text-align:right;">Descuentos</th>
                  <th style="text-align:right;">Total a Cobrar</th>
                  <th style="text-align:right;">Transf.</th>
                  <th style="text-align:right;">Efectivo</th>
                  <th style="text-align:right;">Saldo</th>
                  <th style="text-align:left;">Observaciones</th>
                  <th style="text-align:left;">Alias / CBU</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="subtotal">
                  <td>TOTALES ${w.numeroSemana}° SEMANA</td>
                  <td style="text-align:right;">${formatARS(sumB)}</td>
                  <td style="text-align:right;">${formatARS(sumE)}</td>
                  <td style="text-align:right;">${formatARS(sumT)}</td>
                  <td style="text-align:right;">${formatARS(sumD)}</td>
                  <td style="text-align:right;">${formatARS(sumCob)}</td>
                  <td style="text-align:right;">${formatARS(sumTr)}</td>
                  <td style="text-align:right;">${formatARS(sumEf)}</td>
                  <td style="text-align:right;">${formatARS(sumSal)}</td>
                  <td colspan="2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Resumen Hoja R - ${activePeriod.nombrePeriodo}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: Arial, sans-serif; color: #000; background: #fff; font-size: 10px; margin: 0; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 6px; }
          .title { font-size: 14px; font-weight: bold; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 3px 5px; font-size: 9.5px; }
          th { background: #f2f2f2; text-transform: uppercase; font-weight: bold; }
          .subtotal { font-weight: bold; background: #f7f7f7; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">LA HORMIGA — RESUMEN GENERAL DE PAGOS Y SALDOS (${activePeriod.nombrePeriodo})</div>
          <div>${detectedCompanionRTab ? `Hoja ref.: ${detectedCompanionRTab} | ` : ''}Impreso: ${formatTodaySlash()}</div>
        </div>
        ${weeksHtml}
        <table style="margin-top:12px;">
          <tr class="subtotal">
            <td>GRAN TOTAL DEL PERÍODO (${grandMonthTotals.fichas} fichas)</td>
            <td style="text-align:right;">Básico: ${formatARS(grandMonthTotals.basico)}</td>
            <td style="text-align:right;">Extras: ${formatARS(grandMonthTotals.extras)}</td>
            <td style="text-align:right;">Descuentos: ${formatARS(grandMonthTotals.descuentosReales)}</td>
            <td style="text-align:right;">A Cobrar: ${formatARS(grandMonthTotals.totalACobrar)}</td>
            <td style="text-align:right;">Transf.: ${formatARS(grandMonthTotals.transf)}</td>
            <td style="text-align:right;">Efectivo: ${formatARS(grandMonthTotals.efectivo)}</td>
            <td style="text-align:right;">SALDO: ${formatARS(grandMonthTotals.saldo)}</td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1500);
      }, 250);
    }
  };

  // Eco B&W Print Helper via hidden iframe (supports single weekly slip OR consolidated 4-week employee summary)
  const handlePrintSlipReceipt = (slip: EmployeePayrollSlip) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const basicRowsHtml = slip.basicItems
      .filter(it => it.unidades > 0 || it.ingreso > 0 || it.egreso > 0)
      .map(
        it => `
        <tr>
          <td>${it.concepto}</td>
          <td style="text-align:center;">${it.unidades || '-'}</td>
          <td style="text-align:right;">${it.ingreso > 0 ? formatARS(it.ingreso) : '-'}</td>
          <td style="text-align:right;">${it.egreso > 0 ? formatARS(it.egreso) : '-'}</td>
        </tr>`
      )
      .join('');

    const extraRowsHtml = orderPayrollExtraItems(slip.extraItems)
      .filter(it => it.cantidad > 0 || it.ingreso > 0 || it.egreso > 0)
      .map(
        it => `
        <tr>
          <td>${it.fechaDetalle ? `[${it.fechaDetalle}] ` : ''}${it.concepto} ${it.tarifaUnitaria > 0 ? `(Tarifa: ${formatARS(it.tarifaUnitaria)})` : ''}</td>
          <td style="text-align:center;">${it.cantidad > 0 ? `${it.cantidad} hs/u` : '-'}</td>
          <td style="text-align:right;">${it.ingreso > 0 ? formatARS(it.ingreso) : '-'}</td>
          <td style="text-align:right;">${it.egreso > 0 ? formatARS(it.egreso) : '-'}</td>
        </tr>`
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Liquidación - ${slip.empleadoNombre}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: Arial, sans-serif; color: #000; background: #fff; font-size: 12px; margin: 0; }
          .box { border: 2px solid #000; padding: 14px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
          .title { font-size: 16px; font-weight: bold; text-transform: uppercase; }
          .meta { font-size: 11px; margin-top: 3px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #000; padding: 5px 7px; font-size: 11px; }
          th { background: #f2f2f2; text-transform: uppercase; font-weight: bold; }
          .subtotal { font-weight: bold; background: #f9f9f9; }
          .neto-box { margin-top: 12px; border: 2px solid #000; padding: 10px; display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; }
          .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
          .sig-line { width: 42%; border-top: 1px solid #000; text-align: center; padding-top: 5px; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="header">
            <div>
              <div class="title">LA HORMIGA - DETALLE DE LIQUIDACIÓN</div>
              <div class="meta">Semana: ${slip.grupoSemana} | Período: ${slip.mesTexto} (${slip.rangoFecha})</div>
            </div>
            <div style="text-align:right;">
              <div class="title">${slip.empleadoNombre}</div>
              <div class="meta">Base Jornal Referencia: ${formatARS(slip.valorBaseJornal)}</div>
            </div>
          </div>

          <div style="font-weight:bold; margin-top:6px;">1. CONCEPTOS DEL BÁSICO</div>
          <table>
            <thead>
              <tr>
                <th style="text-align:left;">Concepto</th>
                <th style="width:80px;">Unidades</th>
                <th style="width:120px; text-align:right;">Ingresos</th>
                <th style="width:120px; text-align:right;">Egresos</th>
              </tr>
            </thead>
            <tbody>
              ${basicRowsHtml}
              <tr class="subtotal">
                <td colspan="2">SUBTOTAL BÁSICO</td>
                <td style="text-align:right;">${formatARS(slip.totalBasicoIngresos)}</td>
                <td style="text-align:right;">${formatARS(slip.totalBasicoEgresos)}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-weight:bold; margin-top:12px;">2. HORAS EXTRAS, ADICIONALES Y DESCUENTOS</div>
          <table>
            <thead>
              <tr>
                <th style="text-align:left;">Concepto / Detalle</th>
                <th style="width:80px;">Cant. / Hs</th>
                <th style="width:120px; text-align:right;">Ingresos</th>
                <th style="width:120px; text-align:right;">Egresos</th>
              </tr>
            </thead>
            <tbody>
              ${extraRowsHtml || '<tr><td colspan="4" style="text-align:center;">Sin horas extras ni descuentos adicionales</td></tr>'}
              <tr class="subtotal">
                <td colspan="2">SUBTOTAL EXTRAS Y DESCUENTOS</td>
                <td style="text-align:right;">${formatARS(slip.totalExtraIngresos)}</td>
                <td style="text-align:right;">${formatARS(slip.totalExtraEgresos)}</td>
              </tr>
              <tr class="subtotal">
                <td colspan="2">TOTALES DE LA FICHA</td>
                <td style="text-align:right;">${formatARS(slip.totalIngresos)}</td>
                <td style="text-align:right;">${formatARS(slip.totalEgresos)}</td>
              </tr>
            </tbody>
          </table>

          <div class="neto-box">
            <span>${slip.etiquetaNeto || 'NETO A COBRAR'} (${slip.grupoSemana})</span>
            <span>${formatARS(slip.netoACobrar)}</span>
          </div>

          <div class="signatures">
            <div class="sig-line">Firma Empleador / Administración</div>
            <div class="sig-line">Firma y Aclaración del Empleado (${slip.empleadoNombre})</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1500);
      }, 250);
    }
  };

  // Print Consolidated Monthly Receipt (Sum of 1° + 2° + 3° + 4° Semana for an Employee)
  const handlePrintConsolidatedMonthlyReceipt = (emp: ConsolidatedEmployeeMonthlySummary) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const weeksRowsHtml = [1, 2, 3, 4, 5]
      .filter(w => emp.porSemana[w])
      .map(w => {
        const wData = emp.porSemana[w];
        return `
          <tr>
            <td><strong>${w}° SEMANA - LA HORMIGA</strong></td>
            <td style="text-align:right;">${formatARS(wData.basico)}</td>
            <td style="text-align:right;">+ ${formatARS(wData.extras)} (${wData.horasExtrasCant} hs)</td>
            <td style="text-align:right;">- ${formatARS(wData.descuentosReales)}</td>
            <td style="text-align:right; font-weight:bold;">${formatARS(wData.totalACobrar)}</td>
            <td style="text-align:right;">${formatARS(wData.pagoTransferencia)}</td>
            <td style="text-align:right;">${formatARS(wData.pagoEfectivo)}</td>
            <td style="text-align:right; font-weight:bold;">${formatARS(wData.saldo)}</td>
          </tr>
        `;
      })
      .join('');

    const bankMeta = [
      emp.aliasBancario ? `Alias: ${emp.aliasBancario}` : '',
      emp.cbuBancario ? `CBU: ${emp.cbuBancario}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Cierre Mensual - ${emp.empleadoNombre}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: Arial, sans-serif; color: #000; background: #fff; font-size: 12px; margin: 0; }
          .box { border: 2px solid #000; padding: 14px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
          .title { font-size: 16px; font-weight: bold; text-transform: uppercase; }
          .meta { font-size: 11px; margin-top: 3px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #000; padding: 5px 6px; font-size: 10.5px; }
          th { background: #f2f2f2; text-transform: uppercase; font-weight: bold; }
          .subtotal { font-weight: bold; background: #f9f9f9; }
          .neto-box { margin-top: 12px; border: 2px solid #000; padding: 10px; display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; }
          .signatures { margin-top: 44px; display: flex; justify-content: space-between; }
          .sig-line { width: 42%; border-top: 1px solid #000; text-align: center; padding-top: 5px; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="header">
            <div>
              <div class="title">LA HORMIGA - CIERRE MENSUAL ACUMULADO (HOJA R)</div>
              <div class="meta">Período: ${activePeriod?.nombrePeriodo || 'MENSUAL'} | Fichas sumadas: ${emp.fichasCount}</div>
              ${bankMeta ? `<div class="meta">${bankMeta}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <div class="title">${emp.empleadoNombre}</div>
              <div class="meta">Jornal Base Ref.: ${formatARS(emp.valorBaseJornal)}</div>
            </div>
          </div>

          <div style="font-weight:bold; margin-top:6px;">DESGLOSE Y CONTROL DE PAGOS POR SEMANA</div>
          <table>
            <thead>
              <tr>
                <th style="text-align:left;">Semana</th>
                <th style="text-align:right;">Básico</th>
                <th style="text-align:right;">Extras</th>
                <th style="text-align:right;">Descuentos</th>
                <th style="text-align:right;">Total a Cobrar</th>
                <th style="text-align:right;">Transf.</th>
                <th style="text-align:right;">Efectivo</th>
                <th style="text-align:right;">Saldo</th>
              </tr>
            </thead>
            <tbody>
              ${weeksRowsHtml}
              <tr class="subtotal">
                <td>TOTALES ACUMULADOS DEL MES</td>
                <td style="text-align:right;">${formatARS(emp.totalBasicoMes)}</td>
                <td style="text-align:right;">+ ${formatARS(emp.totalExtrasMes)}</td>
                <td style="text-align:right;">- ${formatARS(emp.totalDescuentosRealesMes)}</td>
                <td style="text-align:right;">${formatARS(emp.totalACobrarMes)}</td>
                <td style="text-align:right;">${formatARS(emp.totalTransfMes)}</td>
                <td style="text-align:right;">${formatARS(emp.totalEfectivoMes)}</td>
                <td style="text-align:right;">${formatARS(emp.totalSaldoMes)}</td>
              </tr>
            </tbody>
          </table>

          <div class="neto-box">
            <span>TOTAL A COBRAR MES: ${formatARS(emp.totalACobrarMes)} | PAGADO (TRANSF.+EFEC.): ${formatARS(emp.totalTransfMes + emp.totalEfectivoMes)}</span>
            <span>SALDO: ${formatARS(emp.totalSaldoMes)}</span>
          </div>

          <div class="signatures">
            <div class="sig-line">Firma Empleador / Administración</div>
            <div class="sig-line">Firma y Aclaración (${emp.empleadoNombre})</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1500);
      }, 250);
    }
  };

  // Render helper for a single Employee Slip Card (3 progressive levels: 1° Compacta -> 2° Resumen -> 3° Todo Detalle)
  const renderSlipCard = (slip: EmployeePayrollSlip) => {
    const activeExtras = slip.extraItems.filter(
      it => (it.cantidad > 0 || it.ingreso > 0) && it.egreso === 0
    );
    const activeDeductions = orderPayrollExtraItems(
      slip.extraItems.filter(it => it.egreso > 0)
    );
    const activeDiscountsUp = activeDeductions.filter(
      it => classifyPayrollExtraItem(it) !== 'TRANSFERENCIA'
    );
    const activeTransfersDown = activeDeductions.filter(
      it => classifyPayrollExtraItem(it) === 'TRANSFERENCIA'
    );
    const activeBasicItems = slip.basicItems.filter(
      it => it.unidades > 0 || it.ingreso > 0
    );
    const totalUnitsBasic = slip.basicItems.reduce(
      (acc, it) => acc + (Number(it.unidades) || 0),
      0
    );
    const totalExtraHours = activeExtras.reduce(
      (a, b) => a + (Number(b.cantidad) || 0),
      0
    );
    const cardLevel = getSlipCardLevel(slip.id);
    const isInteractive = defaultCardLevel !== 3;
    const nominaMatch =
      slipNominaMatches[slip.id] ||
      matchPayrollSlipToEmployee(
        slip,
        employees,
        savedEmployeeDirectoryLinks
      );
    const linkedEmp = nominaMatch.employee;
    const empPartesInfo = linkedEmp ? partesCountByEmployeeId[linkedEmp.id] : undefined;
    const slipGrp = classifyPayrollGroupFromBanner(slip.grupoSemana);
    const sTheme = getPayrollGroupVisualTheme(slipGrp);

    // LEVEL 1: SUPER COMPACTA (1 single sleek tight row; 1st click -> Level 2, 2nd click -> Level 3)
    if (cardLevel === 1) {
      return (
        <div
          key={slip.id}
          onClick={() => cycleSlipCardLevel(slip.id)}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              cycleSlipCardLevel(slip.id);
            }
          }}
          className={`bg-[#161616] border border-white/15 ${sTheme.cardHoverBorder} hover:bg-[#1c1c1c] rounded-xl px-3.5 py-2 shadow transition-all cursor-pointer select-none flex items-center justify-between gap-2.5`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className={`p-1 rounded-md shrink-0 border ${sTheme.badgeSoft}`}>
              <ChevronDown className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs sm:text-sm font-black text-white uppercase truncate">
                  {slip.empleadoNombre}
                </span>
                {linkedEmp ? (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      if (onViewEmployee) {
                        onViewEmployee(linkedEmp);
                      } else {
                        setShowNominaLinkModal(true);
                      }
                    }}
                    title={`Vinculado a Nómina: ${linkedEmp.nombreApellido || linkedEmp.nombre} (${linkedEmp.codigoEmpleado || 'S/C'}) — Clic para abrir legajo`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[9px] font-bold uppercase transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-2.5 h-2.5" />
                    <span>{linkedEmp.codigoEmpleado || 'Nómina'}</span>
                    {nominaMatch.metadata.fechaIngresoDisplay && (
                      <span className="text-emerald-200/80">
                        • F.I {nominaMatch.metadata.fechaIngresoDisplay}
                      </span>
                    )}
                    {empPartesInfo && empPartesInfo.count > 0 && (
                      <span className="text-sky-300">
                        • {empPartesInfo.count} partes ({empPartesInfo.totalHours}h)
                      </span>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setShowNominaLinkModal(true);
                    }}
                    title="Este empleado aún no está vinculado a tu Nómina de Personal — Clic para vincular o dar de alta"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[9px] font-bold uppercase transition-colors cursor-pointer"
                  >
                    <Link2 className="w-2.5 h-2.5" />
                    <span>Sin vincular — Vincular / Crear</span>
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] font-mono text-gray-400">
                <span className="text-sky-300">Bás {formatARS(slip.totalBasicoIngresos)}</span>
                {slip.totalExtraIngresos > 0 && (
                  <span className="text-emerald-400">Ext +{formatARS(slip.totalExtraIngresos)}</span>
                )}
                {slip.totalEgresos > 0 && (
                  <span className="text-rose-400">Egr -{formatARS(slip.totalEgresos)}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className={`text-right px-2.5 py-1 rounded-lg border ${sTheme.boxBorderSoft}`}>
              <div className={`text-[9px] font-black uppercase leading-none opacity-85 ${sTheme.accentText}`}>
                {slip.etiquetaNeto || 'A COBRAR'}
              </div>
              <div className={`text-xs sm:text-sm font-black font-mono leading-tight ${sTheme.accentText}`}>
                {formatARS(slip.netoACobrar)}
              </div>
            </div>

            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => handleOpenEditSlipModal(slip)}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${sTheme.buttonSoft}`}
                title="Editar ficha"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPrintingSlip(slip)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 transition-all cursor-pointer"
                title="Imprimir recibo"
              >
                <Printer className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDeleteSlip(slip.id, slip.empleadoNombre)}
                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 transition-all cursor-pointer"
                title="Eliminar"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    const isLevel3 = cardLevel === 3;

    // LEVEL 2 (RESUMEN COMPACTO) & LEVEL 3 (TODO EL DETALLE CON LÍNEAS COMPACTAS)
    return (
      <div
        key={slip.id}
        className={`bg-[#161616] border rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between transition-all ${
          isLevel3
            ? sTheme.cardActiveBorder
            : `border-white/15 ${sTheme.cardHoverBorder}`
        }`}
      >
        <div>
          {/* Clickable Summary Header */}
          <div
            onClick={() => cycleSlipCardLevel(slip.id)}
            role={isInteractive ? 'button' : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            onKeyDown={e => {
              if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                cycleSlipCardLevel(slip.id);
              }
            }}
            className={`${
              isInteractive ? 'cursor-pointer' : ''
            } select-none bg-gradient-to-r ${sTheme.headerGradient} border-b border-white/10 p-3.5 transition-all`}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${sTheme.badgeSolid}`}>
                    {slip.grupoSemana}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/10 text-gray-300 text-[10px] font-bold uppercase">
                    {slip.mesTexto} • {slip.rangoFecha}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black text-white mt-1.5 tracking-tight uppercase truncate">
                  {slip.empleadoNombre}
                </h2>
                <div className="flex items-center gap-1.5 flex-wrap mt-1" onClick={e => e.stopPropagation()}>
                  {linkedEmp ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (onViewEmployee) {
                          onViewEmployee(linkedEmp);
                        } else {
                          setShowNominaLinkModal(true);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold uppercase transition-colors cursor-pointer"
                    >
                      <UserCheck className="w-3 h-3" />
                      <span>
                        {linkedEmp.codigoEmpleado || 'EMP'} • {linkedEmp.nombreApellido || linkedEmp.nombre}
                      </span>
                      {nominaMatch.metadata.fechaIngresoDisplay && (
                        <span className="text-emerald-200/80">
                          | F.I: {nominaMatch.metadata.fechaIngresoDisplay}
                        </span>
                      )}
                      {nominaMatch.metadata.horarioTexto && (
                        <span className="text-amber-200/90">
                          | Hor: {nominaMatch.metadata.horarioTexto}
                        </span>
                      )}
                      {empPartesInfo && empPartesInfo.count > 0 && (
                        <span className="text-sky-300">
                          | {empPartesInfo.count} partes ({empPartesInfo.totalHours} hs)
                        </span>
                      )}
                      <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-80" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNominaLinkModal(true)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase transition-colors cursor-pointer"
                    >
                      <Link2 className="w-3 h-3" />
                      <span>Sin vincular a Nómina — Clic para Vincular o Crear</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5">
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                  Base Jornal
                </div>
                <div className={`text-sm font-black font-mono ${sTheme.accentText}`}>
                  {formatARS(slip.valorBaseJornal)}
                </div>
              </div>
            </div>

            {/* Compact Summary Strip */}
            <div className="grid grid-cols-3 gap-2 mt-2.5">
              <div className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5">
                <div className="text-[9px] font-bold uppercase text-gray-400">
                  Básico ({totalUnitsBasic.toFixed(1)} u.)
                </div>
                <div className="text-xs font-black font-mono text-sky-300">
                  {formatARS(slip.totalBasicoIngresos)}
                </div>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5">
                <div className="text-[9px] font-bold uppercase text-gray-400">
                  Extras ({totalExtraHours} hs)
                </div>
                <div className="text-xs font-black font-mono text-emerald-400">
                  + {formatARS(slip.totalExtraIngresos)}
                </div>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5">
                <div className="text-[9px] font-bold uppercase text-gray-400">
                  Egresos ({activeDeductions.length} mov.)
                </div>
                <div className="text-xs font-black font-mono text-rose-400">
                  - {formatARS(slip.totalEgresos)}
                </div>
              </div>
            </div>
          </div>

          {/* Dropdown Toggle Bar (only clickable when defaultCardLevel !== 3) */}
          {defaultCardLevel !== 3 && (
            <button
              type="button"
              onClick={() => cycleSlipCardLevel(slip.id)}
              className={`w-full px-3.5 py-1.5 flex items-center justify-between text-[11px] font-black uppercase tracking-wider border-b transition-all cursor-pointer ${
                isLevel3
                  ? 'bg-[#F0C800]/15 text-[#F0C800] border-[#F0C800]/30'
                  : 'bg-black/30 hover:bg-white/5 text-gray-300 border-white/10'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {isLevel3 ? (
                  <ChevronUp className="w-3.5 h-3.5 text-[#F0C800]" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-[#F0C800]" />
                )}
                {isLevel3
                  ? defaultCardLevel === 1
                    ? 'Volver a Vista Compacta'
                    : 'Ocultar Detalle de Liquidación'
                  : 'Desplegar Detalle de Liquidación'}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-gray-300 normal-case tracking-normal">
                {activeBasicItems.length} básico • {activeExtras.length} extras • {activeDeductions.length} egresos
              </span>
            </button>
          )}

          {/* LEVEL 3: FULL DETAIL WITH ULTRA-COMPACT SINGLE-LINE ROWS */}
          {isLevel3 && (
            <div className="p-3 space-y-2.5 bg-black/15">
              {/* Section 1: Conceptos del Básico */}
              <div className="bg-black/35 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-3 py-1.5 bg-white/5 border-b border-white/10 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-200">
                    1. Liquidación Básica (Unidades × Base)
                  </span>
                  <span className="text-[10px] font-bold text-gray-400">
                    Total Unid: {totalUnitsBasic.toFixed(2)} u.
                  </span>
                </div>

                <div className="divide-y divide-white/5">
                  {slip.basicItems.map(item => {
                    const hasValue = item.unidades > 0 || item.ingreso > 0;
                    return (
                      <div
                        key={item.id}
                        className={`px-3 py-1 flex items-center justify-between gap-2 text-[11px] leading-tight ${
                          hasValue ? 'text-gray-200' : 'text-gray-500'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <span className="font-semibold truncate">{item.concepto}</span>
                          {item.referenciaBase && (
                            <span className="px-1 py-0.5 rounded bg-white/5 text-[9px] text-gray-400 font-mono shrink-0">
                              Ref: {item.referenciaBase}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-mono text-gray-300 min-w-[46px] text-center">
                            {item.unidades > 0 ? `${item.unidades} u.` : '-'}
                          </span>
                          <span
                            className={`font-mono font-bold min-w-[92px] text-right ${
                              item.ingreso > 0 ? 'text-white' : 'text-gray-600'
                            }`}
                          >
                            {item.ingreso > 0 ? formatARS(item.ingreso) : '$ -'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="px-3 py-1.5 bg-sky-500/10 border-t border-sky-500/20 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-sky-300">
                    Subtotal Básico
                  </span>
                  <span className="text-xs font-black font-mono text-sky-300">
                    {formatARS(slip.totalBasicoIngresos)}
                  </span>
                </div>
              </div>

              {/* Section 2: Horas Extras y Adicionales */}
              <div className="bg-black/35 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-3 py-1.5 bg-white/5 border-b border-white/10 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-200">
                    2. Horas Extras y Adicionales
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400">
                    {activeExtras.length > 0
                      ? `${totalExtraHours} hs cargadas`
                      : 'Sin horas extras'}
                  </span>
                </div>

                <div className="divide-y divide-white/5">
                  {slip.extraItems
                    .filter(it => it.egreso === 0)
                    .map(item => {
                      const isActive = item.cantidad > 0 || item.ingreso > 0;
                      return (
                        <div
                          key={item.id}
                          className={`px-3 py-1 flex items-center justify-between gap-2 text-[11px] leading-tight ${
                            isActive ? 'text-white bg-emerald-500/5' : 'text-gray-500'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 truncate">
                            <span className="font-semibold truncate">{item.concepto}</span>
                            {item.tarifaUnitaria > 0 && (
                              <span className="text-[9px] text-gray-400 font-mono shrink-0">
                                ({formatARS(item.tarifaUnitaria)}/h)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono min-w-[46px] text-center ${
                                isActive
                                  ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                                  : 'bg-white/5 text-gray-500'
                              }`}
                            >
                              {item.cantidad > 0 ? `${item.cantidad} hs` : '-'}
                            </span>
                            <span
                              className={`font-mono font-bold min-w-[92px] text-right ${
                                item.ingreso > 0 ? 'text-emerald-400' : 'text-gray-600'
                              }`}
                            >
                              {item.ingreso > 0 ? formatARS(item.ingreso) : '$ -'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className="px-3 py-1.5 bg-emerald-500/10 border-t border-emerald-500/20 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
                    Total Extras / Adicionales
                  </span>
                  <span className="text-xs font-black font-mono text-emerald-300">
                    + {formatARS(slip.totalExtraIngresos)}
                  </span>
                </div>
              </div>

              {/* Section 3: Descuentos, Anticipos (arriba) y Transferencias a Cuenta (abajo) */}
              <div className="bg-black/35 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-3 py-1.5 bg-white/5 border-b border-white/10 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-200">
                    3. Descuentos, Anticipos y Transferencias
                  </span>
                  <div
                    className="flex items-center gap-1 flex-wrap"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenEditSlipModal(slip, 'DESCUENTO')}
                      className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/30 text-[10px] font-black text-rose-300 uppercase transition-all cursor-pointer"
                      title="Agregar nuevo descuento arriba en el Sheet"
                    >
                      + Descuento
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditSlipModal(slip, 'ANTICIPO')}
                      className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/30 text-[10px] font-black text-amber-300 uppercase transition-all cursor-pointer"
                      title="Agregar nuevo anticipo arriba en el Sheet"
                    >
                      + Anticipo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditSlipModal(slip, 'TRANSFERENCIA')}
                      className="px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-500/30 text-[10px] font-black text-sky-300 uppercase transition-all cursor-pointer"
                      title="Agregar nueva transferencia abajo cerca de TOTAL EXTRA"
                    >
                      + Transferencia
                    </button>
                  </div>
                </div>

                {activeDeductions.length > 0 ? (
                  <div className="divide-y divide-white/5">
                    {activeDiscountsUp.map(ded => {
                      const cat = classifyPayrollExtraItem(ded);
                      return (
                        <div
                          key={ded.id}
                          className="px-3 py-1 flex items-center justify-between gap-2 text-[11px] leading-tight bg-rose-500/5 text-rose-200"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 truncate">
                            <span
                              className={`px-1 py-0.5 rounded text-[8px] font-black uppercase shrink-0 ${
                                cat === 'ANTICIPO'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {cat === 'ANTICIPO' ? 'ANT' : 'DESC'}
                            </span>
                            {ded.fechaDetalle && (
                              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-mono text-gray-300 shrink-0">
                                {ded.fechaDetalle}
                              </span>
                            )}
                            {ded.cantidad > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-[9px] font-mono text-rose-300 shrink-0">
                                {ded.cantidad} u.
                              </span>
                            )}
                            <span className="font-semibold truncate">{ded.concepto}</span>
                          </div>
                          <span className="font-mono font-bold text-rose-400 shrink-0">
                            - {formatARS(ded.egreso)}
                          </span>
                        </div>
                      );
                    })}

                    {activeTransfersDown.length > 0 && (
                      <>
                        {activeDiscountsUp.length > 0 && (
                          <div className="px-3 py-0.5 bg-sky-500/10 text-[9px] font-black uppercase tracking-wider text-sky-300/90 flex items-center justify-between">
                            <span>Transferencias / Cancelaciones</span>
                            <span>{activeTransfersDown.length} mov.</span>
                          </div>
                        )}
                        {activeTransfersDown.map(ded => (
                          <div
                            key={ded.id}
                            className="px-3 py-1 flex items-center justify-between gap-2 text-[11px] leading-tight bg-sky-500/5 text-sky-100"
                          >
                            <div className="flex items-center gap-1.5 min-w-0 truncate">
                              <span className="px-1 py-0.5 rounded text-[8px] font-black uppercase shrink-0 bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                TRANSF
                              </span>
                              {ded.fechaDetalle && (
                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-mono text-gray-300 shrink-0">
                                  {ded.fechaDetalle}
                                </span>
                              )}
                              <span className="font-semibold truncate">{ded.concepto}</span>
                            </div>
                            <span className="font-mono font-bold text-rose-400 shrink-0">
                              - {formatARS(ded.egreso)}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-1.5 text-[11px] text-gray-500 italic">
                    Sin descuentos ni transferencias en esta semana.
                  </div>
                )}

                <div className="px-3 py-1.5 bg-rose-500/10 border-t border-rose-500/20 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-rose-300">
                    Total Egresos / Descuentos
                  </span>
                  <span className="text-xs font-black font-mono text-rose-300">
                    - {formatARS(slip.totalEgresos)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card Footer */}
        <div className="p-3.5 pt-2.5 space-y-2">
          <div className={`bg-gradient-to-r ${sTheme.footerGradient} border-2 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2`}>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-300">
                Ingresos: {formatARS(slip.totalIngresos)} • Egresos: {formatARS(slip.totalEgresos)}
              </div>
              <div className={`text-[11px] font-black uppercase tracking-wider ${sTheme.accentText}`}>
                {slip.etiquetaNeto || 'NETO A COBRAR'} ({slip.numeroSemana || 1}° SEMANA)
              </div>
            </div>
            <div className={`text-xl font-black font-mono ${sTheme.accentText}`}>
              {formatARS(slip.netoACobrar)}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => handleOpenEditSlipModal(slip)}
              className={`flex-1 py-1.5 px-3 rounded-xl font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${sTheme.buttonPrimary}`}
            >
              <Edit3 className="w-3.5 h-3.5" /> Editar Ficha
            </button>

            <button
              onClick={() => setPrintingSlip(slip)}
              className="py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 border border-white/15 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
              title="Ver e imprimir recibo económico B&W"
            >
              <Printer className={`w-3.5 h-3.5 ${sTheme.accentText}`} /> Recibo
            </button>

            <button
              onClick={() => handleDeleteSlip(slip.id, slip.empleadoNombre)}
              className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all cursor-pointer"
              title="Eliminar liquidación"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner Header - Native ERP Style */}
      <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#F0C800]/15 border border-[#F0C800]/40 flex items-center justify-center shrink-0">
              <Calculator className="w-6 h-6 text-[#F0C800]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black text-white tracking-tight uppercase">
                  Liquidación de Sueldos por Semanas (1° a 4° Semana)
                </h1>
                <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-[#F0C800]/20 text-[#F0C800] border border-[#F0C800]/30 rounded-md">
                  Suma Semanal + Cierre Mensual
                </span>
                {session?.accessToken ? (
                  <>
                    <span
                      className="px-2.5 py-0.5 text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded-md flex items-center gap-1.5"
                      title="Los cambios que guardes en cualquier ficha se escriben en el momento en Google Sheets"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Google Sheet conectado ({session.email}) — Edición en vivo
                    </span>
                    <button
                      type="button"
                      onClick={handleOpenTabsSelectorModal}
                      disabled={isLoadingSheet}
                      className="px-2.5 py-0.5 text-[11px] font-black uppercase bg-[#F0C800]/20 hover:bg-[#F0C800] text-[#F0C800] hover:text-black border border-[#F0C800]/50 rounded-md flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Abrir listado completo de libros/hojas para elegir cuáles aparecen en MES:"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      Elegir Libros / Meses{tabs.length > 0 ? ` (${tabs.length})` : ''}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectGoogleOnly}
                    className="px-2.5 py-0.5 text-[11px] font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/40 rounded-md flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Conectá tu cuenta Google sin sobrescribir tus cambios para elegir libros y editar el Google Sheet al instante"
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                    Sheet desconectado (tocar para conectar y elegir libros)
                  </button>
                )}
                {isSavingData && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin text-[#F0C800]" /> Guardando...
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Lee y organiza las fichas de la <strong>1° Semana, 2° Semana, 3° Semana y 4° Semana</strong>, sumando subtotales por semana y el acumulado mensual por empleado.
              </p>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setNewPeriodName('NOVIEMBRE 2026');
                setNewPeriodMesTexto('NOVIEMBRE');
                setNewPeriodRango('01.11 AL 30.11');
                setShowNewPeriodModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/15 text-xs font-bold uppercase tracking-wider transition-all"
              title="Copia las fichas del período actual para liquidar el nuevo mes"
            >
              <Copy className="w-4 h-4 text-[#F0C800]" />
              Nuevo Mes (Copiar Anterior)
            </button>

            <button
              onClick={() => setShowImporterPanel(prev => !prev)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${
                showImporterPanel
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-white/5 hover:bg-white/10 border-white/15 text-gray-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Importar Hoja Completa (1° a 4° Semana)
              {showImporterPanel ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              onClick={() => handleOpenNewSlipModal()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] text-black text-xs font-black uppercase tracking-wider transition-all shadow-lg"
            >
              <UserPlus className="w-4 h-4" />
              + Nueva Ficha Semanal
            </button>
          </div>
        </div>

        {/* Collapsible Importer Panel (Google Sheets or Excel .xlsx -> All 4 Weeks Parsed & Summed) */}
        {showImporterPanel && (
          <div className="mt-5 pt-5 border-t border-white/10 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Option A: Upload Excel (.xlsx) directly */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#F0C800] flex items-center gap-1.5">
                  <Upload className="w-4 h-4" /> Opción 1: Subir Archivo Excel (.xlsx)
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  El sistema recorre toda la hoja de arriba hacia abajo detectando la{' '}
                  <strong className="text-white">1° Semana, 2° Semana, 3° Semana y 4° Semana</strong> y suma todas las fichas automáticamente.
                </p>
              </div>
              <div className="mt-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                >
                  <Upload className="w-4 h-4" /> Seleccionar Excel (.xlsx) y Sumar Todas las Semanas
                </button>
              </div>
            </div>

            {/* Option B: Read directly from Google Sheets */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" /> Opción 2: Leer todas las semanas de tu Google Sheet
                </span>
                {session && (
                  <button
                    onClick={handleGoogleSignOut}
                    className="text-[11px] text-gray-400 hover:text-red-400 flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" /> Cambiar cuenta ({session.email})
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={sheetUrlInput}
                  onChange={e => {
                    setSheetUrlInput(e.target.value);
                    setSpreadsheetId(extractSpreadsheetId(e.target.value));
                  }}
                  placeholder="Pegá el link de tu Google Sheet de sueldos..."
                  className="flex-1 bg-[#141414] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                />
                {!session ? (
                  <button
                    onClick={handleGoogleSignIn}
                    className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] text-black font-bold text-xs uppercase whitespace-nowrap"
                  >
                    Conectar Google y Leer
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      fetchGoogleSheetMetadataAndParse(
                        session.accessToken,
                        extractSpreadsheetId(sheetUrlInput)
                      )
                    }
                    disabled={isLoadingSheet}
                    className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] text-black font-bold text-xs uppercase whitespace-nowrap flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSheet ? 'animate-spin' : ''}`} />
                    Leer "{selectedTabForImport || activePeriod?.sheetTabName || 'Hoja Activa'}"
                  </button>
                )}
              </div>

              {session && (
                <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleOpenTabsSelectorModal}
                      disabled={isLoadingSheet}
                      className="px-3 py-1.5 rounded-lg bg-[#F0C800]/20 hover:bg-[#F0C800] text-[#F0C800] hover:text-black border border-[#F0C800]/50 text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      Elegir qué libros mostrar en "MES:"{tabs.length > 0 ? ` (${tabs.length})` : ''}
                    </button>
                  </div>
                </div>
              )}

              {storedSheetConfig?.snapshotsByTab && Object.keys(storedSheetConfig.snapshotsByTab).length > 0 && (
                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-emerald-300">
                    Sheet vinculado: <strong>{storedSheetConfig.spreadsheetTitle || 'GRUPO IDN SUELDOS 2026'}</strong> ({Object.keys(storedSheetConfig.snapshotsByTab).join(', ')})
                  </span>
                  <button
                    type="button"
                    onClick={handleRebuildFromSavedSnapshot}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Recalcular desde Sheet Guardado
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notifications */}
        {errorMsg && (
          <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 text-red-200 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="mt-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-emerald-200 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Period Selector & View Mode Bar */}
      <div className="bg-[#161616] border border-white/10 rounded-2xl p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Period Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mr-1 shrink-0">
            <Calendar className="w-4 h-4 text-[#F0C800]" /> Mes:
          </span>
          {periods.map(p => {
            const isActive = p.id === activePeriod?.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setActivePeriodId(p.id);
                  setSelectedWeekFilter('ALL');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 flex items-center gap-2 ${
                  isActive
                    ? 'bg-[#F0C800] text-black shadow-md'
                    : 'bg-black/40 text-gray-300 border border-white/10 hover:border-white/30'
                }`}
              >
                <span>{p.nombrePeriodo}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    isActive ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {p.slips.length} fichas
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleOpenTabsSelectorModal}
            disabled={isLoadingSheet}
            className="px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider shrink-0 flex items-center gap-1.5 bg-[#F0C800]/15 hover:bg-[#F0C800] text-[#F0C800] hover:text-black border border-[#F0C800]/40 transition-all cursor-pointer"
            title={
              session?.accessToken
                ? 'Abrir popup con todos los libros/hojas de Google Sheets para elegir cuáles aparecen en MES:'
                : 'Conectá Google y elegí qué libros/hojas querés mostrar en MES:'
            }
          >
            <CheckSquare className="w-3.5 h-3.5" />
            {session?.accessToken
              ? `Elegir Libros (${tabs.length || 'Sheets'})`
              : '+ Elegir Libros'}
          </button>
          {periods.length === 0 && (
            <span className="text-[11px] text-amber-300/90 font-semibold whitespace-nowrap">
              Sin períodos en Supabase — conectá Google Sheets o importá un archivo
            </span>
          )}
        </div>

        {/* Search & 3 View Modes */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={`Buscar empleado en ${getPayrollGroupDisplayName(selectedGroupTab)}...`}
              className="w-full bg-black/50 border border-white/15 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#F0C800]"
            />
          </div>

          <div className="flex items-center bg-black/50 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'cards'
                  ? 'bg-[#F0C800] text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Fichas por Semana
            </button>
            <button
              onClick={() => setViewMode('consolidated')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'consolidated'
                  ? 'bg-[#F0C800] text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Hoja R / Acumulado
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'table'
                  ? 'bg-[#F0C800] text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" /> Tabla General
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowNominaLinkModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase border transition-all cursor-pointer ${
              nominaStats.unlinked > 0
                ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300'
                : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-300'
            }`}
            title="Vincular empleados de las planillas de liquidación con tu Nómina de Personal en Supabase"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>
              Vínculo Nómina ({nominaStats.linked}/{nominaStats.total})
            </span>
            {nominaStats.unlinked > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500 text-black text-[10px] font-black">
                {nominaStats.unlinked} sin vincular
              </span>
            )}
          </button>

          {viewMode === 'cards' && filteredSlips.length > 0 && (
            <div
              className="flex items-center bg-black/50 p-1 rounded-xl border border-white/10"
              title="Nivel de detalle inicial de las fichas (hacé clic en cada ficha para avanzar de nivel)"
            >
              <span className="text-[10px] font-black uppercase text-gray-400 px-2">Vista:</span>
              <button
                type="button"
                onClick={() => handleChangeDefaultCardLevel(1)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  defaultCardLevel === 1
                    ? 'bg-[#F0C800] text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Vista súper compacta (2 clics para ver todo el detalle)"
              >
                1° Compacta
              </button>
              <button
                type="button"
                onClick={() => handleChangeDefaultCardLevel(2)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  defaultCardLevel === 2
                    ? 'bg-[#F0C800] text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Vista resumen (1 clic para desplegar o contraer el detalle)"
              >
                2° Resumen
              </button>
              <button
                type="button"
                onClick={() => handleChangeDefaultCardLevel(3)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  defaultCardLevel === 3
                    ? 'bg-[#F0C800] text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Todo el detalle siempre desplegado"
              >
                3° Detalle
              </button>
            </div>
          )}

          {viewMode === 'table' && filteredSlips.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSlipsExpandedBatch(filteredSlips.map(s => s.id), true)}
                className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-[11px] font-bold text-gray-200 flex items-center gap-1 transition-all cursor-pointer"
                title="Desplegar el detalle de todas las liquidaciones"
              >
                <ChevronDown className="w-3.5 h-3.5 text-[#F0C800]" /> Desplegar todas
              </button>
              <button
                type="button"
                onClick={() => setSlipsExpandedBatch(filteredSlips.map(s => s.id), false)}
                className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-[11px] font-bold text-gray-300 flex items-center gap-1 transition-all cursor-pointer"
                title="Contraer todas las liquidaciones"
              >
                <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> Contraer todas
              </button>
            </div>
          )}
        </div>
      </div>

      {/* PESTAÑAS POR GRUPO DE LIQUIDACIÓN: LA HORMIGA • TUBOMUNDO • GRUPO IDN */}
      <div className="bg-[#161616] border border-white/10 rounded-2xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2 shrink-0">
          <Users className="w-4 h-4 text-[#F0C800]" />
          <span className="text-xs font-black uppercase tracking-wider text-gray-300">
            Grupo de Liquidación:
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 flex-1">
          {(
            [
              {
                id: 'LA_HORMIGA' as const,
                title: 'LA HORMIGA',
                subtitle: '1° a 4° Semana - La Hormiga',
                badgeBg: 'bg-[#F0C800] text-black',
                activeClass: 'bg-[#F0C800]/15 border-[#F0C800] text-white ring-1 ring-[#F0C800]',
              },
              {
                id: 'TUBOMUNDO' as const,
                title: 'TUBOMUNDO',
                subtitle: '1° a 4° Semana - Tubomundo',
                badgeBg: 'bg-sky-400 text-black',
                activeClass: 'bg-sky-500/15 border-sky-400 text-white ring-1 ring-sky-400',
              },
              {
                id: 'GRUPO_IDN' as const,
                title: 'GRUPO IDN',
                subtitle: 'Administrativos • Maestranza • IDN',
                badgeBg: 'bg-emerald-400 text-black',
                activeClass: 'bg-emerald-500/15 border-emerald-400 text-white ring-1 ring-emerald-400',
              },
              {
                id: 'ALL' as const,
                title: 'TODOS LOS GRUPOS',
                subtitle: 'La Hormiga + Tubomundo + Grupo IDN',
                badgeBg: 'bg-white text-black',
                activeClass: 'bg-white/10 border-white/60 text-white ring-1 ring-white/50',
              },
            ]
          ).map(tab => {
            const isSelected = selectedGroupTab === tab.id;
            const stats = groupStatsByTab[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedGroupTab(tab.id);
                  setSelectedWeekFilter('ALL');
                }}
                className={`px-4 py-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? tab.activeClass
                    : 'bg-black/40 border-white/10 text-gray-300 hover:border-white/30 hover:bg-black/60'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider truncate">
                      {tab.title}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 truncate mt-0.5">
                    {tab.subtitle}
                  </div>
                  <div className="text-xs font-mono font-bold text-[#F0C800] mt-1">
                    {formatARS(stats.ingresos)}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                      isSelected ? tab.badgeBg : 'bg-white/10 text-gray-300'
                    }`}
                  >
                    {stats.count} {stats.count === 1 ? 'ficha' : 'fichas'}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    Neto: {formatARS(stats.neto)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* TABLERO DE SUMATORIA POR SEMANAS (1ERA, 2DA, 3ERA, 4TA SEMANA + SUMA TOTAL DEL MES) */}
      {(() => {
        const activeTheme = getPayrollGroupVisualTheme(selectedGroupTab);
        return (
          <>
            <div className="bg-[#161616] border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className={`w-4 h-4 ${activeTheme.accentText}`} />
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">
                    Desglose y Sumatoria por Semanas — {getPayrollGroupDisplayName(selectedGroupTab)} — {activePeriod?.nombrePeriodo}
                  </h2>
                </div>
                <span className="text-xs text-gray-400">
                  Hacé clic en una semana para filtrarla o en <strong>"Todas las Semanas"</strong> para ver la suma completa
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {/* Card 0: TODAS LAS SEMANAS (GRAN SUMA MENSUAL) */}
                <div
                  onClick={() => setSelectedWeekFilter('ALL')}
                  className={`cursor-pointer rounded-xl p-4 border-2 transition-all flex flex-col justify-between ${
                    selectedWeekFilter === 'ALL'
                      ? `${activeTheme.boxBorderSoft} shadow-lg`
                      : 'bg-black/40 border-white/10 hover:border-white/30'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-black uppercase tracking-wider ${activeTheme.accentText}`}>
                        SUMA 1° A 4° SEMANA
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${activeTheme.badgeSolid}`}>
                        {grandMonthTotals.fichas} fichas
                      </span>
                    </div>
                    <div className="text-[10px] uppercase font-bold text-gray-400 mt-1.5">
                      Total Liquidado (Ingresos)
                    </div>
                    <div className="text-xl font-black font-mono text-white">
                      {formatARS(grandMonthTotals.ingresos)}
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/10 text-[11px] text-gray-300 space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Básicos:</span>
                      <span className="font-mono">{formatARS(grandMonthTotals.basico)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Extras:</span>
                      <span className="font-mono text-emerald-400">+{formatARS(grandMonthTotals.extras)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Egresos/Transf:</span>
                      <span className="font-mono text-rose-400">-{formatARS(grandMonthTotals.descuentos)}</span>
                    </div>
                    <div className={`flex justify-between pt-1 border-t border-white/10 font-bold ${activeTheme.accentText}`}>
                      <span>A Cobrar:</span>
                      <span className="font-mono">{formatARS(grandMonthTotals.neto)}</span>
                    </div>
                  </div>
                </div>

                {/* Cards 1 to 4: 1ERA, 2DA, 3ERA, 4TA SEMANA */}
                {weeklySummaries.map(w => {
                  const isSelected = selectedWeekFilter === w.numeroSemana;
                  return (
                    <div
                      key={w.numeroSemana}
                      onClick={() => setSelectedWeekFilter(w.numeroSemana)}
                      className={`cursor-pointer rounded-xl p-4 border transition-all flex flex-col justify-between ${
                        isSelected
                          ? `bg-white/10 ${activeTheme.ringActive}`
                          : 'bg-black/40 border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-black uppercase tracking-wider text-white">
                            {w.numeroSemana}° SEMANA
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              w.fichasCount > 0
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-white/5 text-gray-500'
                            }`}
                          >
                            {w.fichasCount} {w.fichasCount === 1 ? 'ficha' : 'fichas'}
                          </span>
                        </div>
                        <div className="text-[10px] uppercase font-bold text-gray-400 mt-1.5">
                          Total Liquidado Semana
                        </div>
                        <div
                          className={`text-lg font-black font-mono ${
                            w.fichasCount > 0 ? activeTheme.accentText : 'text-gray-600'
                          }`}
                        >
                          {formatARS(w.totalIngresos)}
                        </div>
                      </div>

                      {w.fichasCount > 0 ? (
                        <div className="mt-3 pt-2 border-t border-white/10 text-[11px] text-gray-400 space-y-0.5">
                          <div className="flex justify-between">
                            <span>Básico:</span>
                            <span className="font-mono text-gray-200">{formatARS(w.totalBasico)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Extras:</span>
                            <span className="font-mono text-emerald-400">+{formatARS(w.totalExtras)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Egresos/Transf:</span>
                            <span className="font-mono text-rose-400">-{formatARS(w.totalDescuentos)}</span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-white/10 font-bold text-white">
                            <span>A Cobrar:</span>
                            <span className={`font-mono ${activeTheme.accentText}`}>{formatARS(w.totalNeto)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 pt-2 border-t border-white/10 flex flex-col gap-1.5">
                          <button
                            onClick={ev => {
                              ev.stopPropagation();
                              handleClonePreviousWeekIntoWeek(w.numeroSemana);
                            }}
                            className={`w-full py-1.5 px-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 ${activeTheme.buttonSoft}`}
                          >
                            <Copy className="w-3 h-3" /> Copiar de {w.numeroSemana - 1 || 1}° Sem
                          </button>
                          <button
                            onClick={ev => {
                              ev.stopPropagation();
                              handleOpenNewSlipModal(w.numeroSemana);
                            }}
                            className="w-full py-1 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-[10px] font-bold uppercase"
                          >
                            + Cargar Ficha {w.numeroSemana}° Sem
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* VIEW MODE 1: FICHAS AGRUPADAS POR SEMANA CON SU SEPARADOR DEL COLOR DEL GRUPO (AMARILLO LA HORMIGA, CELESTE TUBOMUNDO, VERDE GRUPO IDN) */}
            {viewMode === 'cards' && (
              <div className="space-y-10">
                {weeklySummaries
                  .filter(w =>
                    selectedWeekFilter === 'ALL'
                      ? w.fichasCount > 0 || w.numeroSemana <= 4
                      : w.numeroSemana === selectedWeekFilter
                  )
                  .map(weekBucket => {
                    const bucketGroup =
                      selectedGroupTab === 'ALL'
                        ? classifyPayrollGroupFromBanner(weekBucket.slips[0]?.grupoSemana || weekBucket.grupoSemana)
                        : selectedGroupTab;
                    const wTheme =
                      selectedGroupTab === 'ALL' ? activeTheme : getPayrollGroupVisualTheme(bucketGroup);
                    return (
                      <div key={weekBucket.numeroSemana} className="space-y-4">
                        {/* Section Separator Banner for Each Semana (colored per group) */}
                        <div className={`${wTheme.bannerGradient} text-black rounded-2xl px-6 py-4 shadow-xl border-2 ${wTheme.bannerBorder} flex flex-col lg:flex-row lg:items-center justify-between gap-4`}>
                          <div className="flex items-center gap-3.5">
                            <span className={`px-3 py-1.5 rounded-xl bg-black ${wTheme.accentText} text-xs font-black uppercase tracking-wider`}>
                              SEPARADOR {weekBucket.numeroSemana}° SEMANA
                            </span>
                            <div>
                              <h3 className="text-lg font-black uppercase tracking-tight">
                                {weekBucket.grupoSemana}
                              </h3>
                              <p className="text-xs font-bold text-black/80">
                                {weekBucket.fichasCount}{' '}
                                {weekBucket.fichasCount === 1
                                  ? 'ficha de empleado en este bloque semanal'
                                  : 'fichas de empleados en este bloque semanal'}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="bg-black/15 rounded-xl px-3.5 py-1.5 text-right">
                              <div className="text-[10px] font-black uppercase text-black/75">
                                Total Liquidado (Ingresos)
                              </div>
                              <div className="text-base font-black font-mono text-black">
                                {formatARS(weekBucket.totalIngresos)}
                              </div>
                            </div>

                            <div className="bg-black/15 rounded-xl px-3.5 py-1.5 text-right">
                              <div className="text-[10px] font-black uppercase text-black/75">
                                Egresos / Transferencias
                              </div>
                              <div className="text-base font-black font-mono text-black">
                                - {formatARS(weekBucket.totalDescuentos)}
                              </div>
                            </div>

                            <div className={`bg-black ${wTheme.accentText} rounded-xl px-4 py-1.5 text-right shadow`}>
                              <div className={`text-[10px] font-black uppercase opacity-85 ${wTheme.accentText}`}>
                                Saldo A Cobrar ({weekBucket.numeroSemana}° Sem)
                              </div>
                              <div className={`text-base font-black font-mono ${wTheme.accentText}`}>
                                {formatARS(weekBucket.totalNeto)}
                              </div>
                            </div>

                            <button
                              onClick={() => handleOpenNewSlipModal(weekBucket.numeroSemana)}
                              className="px-3.5 py-2.5 rounded-xl bg-black hover:bg-black/85 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              <Plus className={`w-3.5 h-3.5 ${wTheme.accentText}`} /> + Ficha
                            </button>
                          </div>
                        </div>

                        {/* Employee Cards for this Week */}
                        {weekBucket.slips.length > 0 ? (
                          <div
                            className={`grid grid-cols-1 xl:grid-cols-2 items-start ${
                              defaultCardLevel === 1 ? 'gap-2.5' : 'gap-4'
                            }`}
                          >
                            {weekBucket.slips.map(slip => renderSlipCard(slip))}
                          </div>
                        ) : (
                          <div className="bg-[#161616] border border-dashed border-white/15 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                              <div className="text-sm font-bold text-gray-300">
                                Todavía no hay fichas cargadas en la {weekBucket.numeroSemana}° Semana ({weekBucket.grupoSemana})
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                Podés copiar los empleados de la semana anterior en 1 clic, agregar una ficha manual o importar tu hoja completa desde Google Sheets / Excel.
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleClonePreviousWeekIntoWeek(weekBucket.numeroSemana)}
                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer ${wTheme.buttonPrimary}`}
                              >
                                <Copy className="w-3.5 h-3.5" /> Copiar Empleados de{' '}
                                {weekBucket.numeroSemana - 1 || 1}° Semana
                              </button>
                              <button
                                onClick={() => handleOpenNewSlipModal(weekBucket.numeroSemana)}
                                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 border border-white/15 text-xs font-bold uppercase cursor-pointer"
                              >
                                + Ficha Vacía
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        );
      })()}

      {/* VIEW MODE 2: HOJA R DE RESUMEN, PAGOS Y SALDO + ACUMULADO MENSUAL (estilo R-10.2026) */}
      {viewMode === 'consolidated' && (
        <div className="space-y-5">
          {/* Top Control & Sub-view Bar */}
          <div className="bg-[#161616] border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-black uppercase text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-[#F0C800]" />
                  Planilla Resumen y Pagos (Hoja R) — {activePeriod?.nombrePeriodo}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Control semanal de <strong>Básico, Extras, Descuentos, Total a Cobrar, Transferencias, Efectivo, Saldo, Alias y CBU</strong> igual a tu hoja paralela del mes{detectedCompanionRTab ? ` (${detectedCompanionRTab})` : ''}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Sub-view Switcher: Por Semana (Hoja R) vs Acumulado Mensual */}
                <div className="flex items-center bg-black/60 p-1 rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setConsolidatedSubView('r_semanal')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      consolidatedSubView === 'r_semanal'
                        ? 'bg-[#F0C800] text-black'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Por Semana (Hoja R)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsolidatedSubView('acumulado_mensual')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      consolidatedSubView === 'acumulado_mensual'
                        ? 'bg-[#F0C800] text-black'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Acumulado Mensual (1° a 4° Sem)
                  </button>
                </div>

                {/* Companion R-Tab Selector & Sync Button */}
                {tabs.length > 0 && (
                  <select
                    value={detectedCompanionRTab}
                    onChange={async e => {
                      const val = e.target.value;
                      if (!val || !activePeriod) {
                        setSelectedRSheetTabOverride(val);
                        return;
                      }
                      const curMonthTab =
                        activePeriod.sheetTabName || activePeriod.nombrePeriodo;
                      if (doesRSheetMatchMonthPeriod(val, curMonthTab)) {
                        setSelectedRSheetTabOverride(val);
                        return;
                      }
                      // If user picks an R-sheet from another month (e.g. R-09.2026), switch cleanly to that month!
                      const matchingLoaded = periods.find(p =>
                        doesRSheetMatchMonthPeriod(val, p.sheetTabName || p.nombrePeriodo)
                      );
                      if (matchingLoaded) {
                        setActivePeriodId(matchingLoaded.id);
                        setSelectedRSheetTabOverride(val);
                        return;
                      }
                      const expectedMonthTab = findMonthTabForRSheet(val, tabs);
                      const targetId = extractSpreadsheetId(sheetUrlInput) || spreadsheetId;
                      if (expectedMonthTab && targetId && session?.accessToken) {
                        await importTabFromGoogleSheet(
                          session.accessToken,
                          targetId,
                          expectedMonthTab
                        );
                        return;
                      }
                      setErrorMsg(
                        `La hoja "${val}" pertenece a ${expectedMonthTab || 'otro mes'} (no a ${activePeriod.nombrePeriodo}). Agregá o seleccioná ${expectedMonthTab || 'ese mes'} en "MES:" para verla con sus liquidaciones reales.`
                      );
                    }}
                    className="bg-black/60 border border-white/15 rounded-xl px-2.5 py-2 text-xs text-gray-200 font-bold focus:outline-none focus:border-[#F0C800]"
                    title="Hoja R correspondiente al mes activo en Google Sheets"
                  >
                    <option value="">Elegir hoja R...</option>
                    {(rTabCandidates.length > 0 ? rTabCandidates : tabs).map(t => {
                      const curMonthTab =
                        activePeriod?.sheetTabName || activePeriod?.nombrePeriodo || '';
                      const isMatch = doesRSheetMatchMonthPeriod(t.title, curMonthTab);
                      return (
                        <option key={t.sheetId} value={t.title}>
                          {isMatch ? t.title : `${t.title} (otro mes)`}
                        </option>
                      );
                    })}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => handleImportCompanionRSheet()}
                  disabled={isSyncingRSheet}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-60 border border-emerald-500/40 text-emerald-300 text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Leer Transferencias, Efectivo, Alias, CBU y Observaciones desde tu hoja R en Google Sheets"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingRSheet ? 'animate-spin' : ''}`} />
                  {detectedCompanionRTab
                    ? `Leer ${detectedCompanionRTab}`
                    : 'Leer Hoja R'}
                </button>

                <button
                  type="button"
                  onClick={handlePrintRSummaryReport}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[#F0C800]" /> Imprimir Hoja R
                </button>
              </div>
            </div>

            {/* 5-KPI Financial Control Strip (Matching R-10.2026) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5">
                <div className="text-[10px] font-bold uppercase text-gray-400">
                  Total Liquidado (Bás + Ext)
                </div>
                <div className="text-base font-black font-mono text-white mt-0.5">
                  {formatARS(grandMonthTotals.ingresos)}
                </div>
                <div className="text-[10px] text-gray-500 font-mono">
                  Bás {formatARS(grandMonthTotals.basico)}
                </div>
              </div>

              <div className="bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5">
                <div className="text-[10px] font-bold uppercase text-gray-400">
                  Descuentos y Anticipos
                </div>
                <div className="text-base font-black font-mono text-rose-400 mt-0.5">
                  - {formatARS(grandMonthTotals.descuentosReales)}
                </div>
                <div className="text-[10px] text-gray-500">
                  Descontado previo al pago
                </div>
              </div>

              <div className="bg-[#F0C800]/10 border border-[#F0C800]/30 rounded-xl px-3.5 py-2.5">
                <div className="text-[10px] font-bold uppercase text-[#F0C800]">
                  Total a Cobrar
                </div>
                <div className="text-base font-black font-mono text-[#F0C800] mt-0.5">
                  {formatARS(grandMonthTotals.totalACobrar)}
                </div>
                <div className="text-[10px] text-[#F0C800]/70">
                  Neto a liquidar al personal
                </div>
              </div>

              <div className="bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5">
                <div className="text-[10px] font-bold uppercase text-sky-300">
                  Pagado (Transf. + Efec.)
                </div>
                <div className="text-base font-black font-mono text-sky-300 mt-0.5">
                  {formatARS(grandMonthTotals.pagadoTotal)}
                </div>
                <div className="text-[10px] text-gray-400 font-mono truncate">
                  Tr {formatARS(grandMonthTotals.transf)} • Ef {formatARS(grandMonthTotals.efectivo)}
                </div>
              </div>

              <div
                className={`rounded-xl px-3.5 py-2.5 border ${
                  Math.abs(grandMonthTotals.saldo) < 1
                    ? 'bg-emerald-500/10 border-emerald-500/40'
                    : grandMonthTotals.saldo < 0
                      ? 'bg-rose-500/15 border-rose-500/40'
                      : 'bg-amber-500/15 border-amber-500/40'
                }`}
              >
                <div className="text-[10px] font-bold uppercase text-gray-300">
                  Saldo Pendiente
                </div>
                <div
                  className={`text-base font-black font-mono mt-0.5 ${
                    Math.abs(grandMonthTotals.saldo) < 1
                      ? 'text-emerald-400'
                      : grandMonthTotals.saldo < 0
                        ? 'text-rose-400'
                        : 'text-amber-300'
                  }`}
                >
                  {formatARS(grandMonthTotals.saldo)}
                </div>
                <div className="text-[10px] font-bold uppercase text-gray-400">
                  {Math.abs(grandMonthTotals.saldo) < 1
                    ? 'Todo saldado'
                    : grandMonthTotals.saldo < 0
                      ? 'Pagado de más / a favor'
                      : 'Pendiente de pago'}
                </div>
              </div>
            </div>

            {/* Unsaved Inline Edits Save Bar */}
            {Object.keys(dirtyRSlipIds).length > 0 && (
              <div className="bg-[#F0C800]/15 border border-[#F0C800]/50 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-[#F0C800] font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Tenés <strong>{Object.keys(dirtyRSlipIds).length}</strong> fila(s) modificadas en pagos, observaciones o datos bancarios sin guardar.
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveRSummaryChanges({ alsoSyncSheet: false })}
                    disabled={isSyncingRSheet}
                    className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase cursor-pointer"
                  >
                    Guardar en Sistema
                  </button>
                  {detectedCompanionRTab && (
                    <button
                      type="button"
                      onClick={() => handleSaveRSummaryChanges({ alsoSyncSheet: true })}
                      disabled={isSyncingRSheet}
                      className="px-4 py-1.5 rounded-lg bg-[#F0C800] hover:bg-[#d8b400] text-black text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSyncingRSheet
                        ? 'Guardando...'
                        : `Guardar en Sistema y ${detectedCompanionRTab}`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* SUB-VIEW A: PLANILLA SEMANAL ESTILO HOJA R (R-10.2026) */}
          {consolidatedSubView === 'r_semanal' && (
            <div className="space-y-6">
              {weeklySummaries
                .filter(w =>
                  selectedWeekFilter === 'ALL'
                    ? w.fichasCount > 0
                    : w.numeroSemana === selectedWeekFilter
                )
                .map(weekBucket => {
                  let wBasico = 0;
                  let wExtras = 0;
                  let wTotal = 0;
                  let wDescuentos = 0;
                  let wACobrar = 0;
                  let wTransf = 0;
                  let wEfectivo = 0;
                  let wSaldo = 0;

                  weekBucket.slips.forEach(s => {
                    const bd = getSlipSummaryBreakdown(s);
                    wBasico += bd.basico;
                    wExtras += bd.extras;
                    wTotal += bd.total;
                    wDescuentos += bd.descuentos;
                    wACobrar += bd.totalACobrar;
                    wTransf += bd.pagoTransferencia;
                    wEfectivo += bd.pagoEfectivo;
                    wSaldo += bd.saldo;
                  });

                  const weekHasActiveRValues = weekBucket.slips.some(
                    s =>
                      s.rSheetValues &&
                      (s.rSheetValues.basico !== undefined ||
                        s.rSheetValues.total !== undefined ||
                        s.rSheetValues.totalACobrar !== undefined)
                  );
                  const rTabDisplayLabel =
                    detectedCompanionRTab ||
                    activePeriod.companionRSheetTabName ||
                    'Hoja R';
                  const monthTabDisplayLabel =
                    activePeriod.sheetTabName || activePeriod.nombrePeriodo;

                  return (
                    <div
                      key={weekBucket.numeroSemana}
                      className="bg-[#161616] border border-white/10 rounded-2xl overflow-hidden shadow-xl"
                    >
                      {/* Signature Yellow Banner matching Cards & Hoja R */}
                      <div className="bg-gradient-to-r from-[#F0C800] via-[#e2bc00] to-[#c9a700] text-black px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="px-2.5 py-1 rounded-lg bg-black text-[#F0C800] text-[11px] font-black uppercase">
                            {weekBucket.numeroSemana}° SEMANA
                          </span>
                          <span className="text-sm font-black uppercase tracking-tight">
                            {weekBucket.grupoSemana}
                          </span>
                          <span className="text-xs font-bold text-black/75">
                            • {weekBucket.fichasCount} empleado(s)
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-black/15 text-black/85 text-[10px] font-bold">
                            {weekHasActiveRValues
                              ? `Origen: ${rTabDisplayLabel}`
                              : `Origen: Fichas ${monthTabDisplayLabel} (${rTabDisplayLabel} sin montos)`}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs font-black font-mono">
                          <span className="px-2.5 py-1 rounded-lg bg-black/15">
                            A Cobrar: {formatARS(wACobrar)}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-black text-[#F0C800]">
                            Saldo: {formatARS(wSaldo)}
                          </span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-black/60 border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-gray-400">
                              <th className="py-2.5 px-3 min-w-[170px]">Empleado</th>
                              <th className="py-2.5 px-2.5 text-right text-sky-300">Básico</th>
                              <th className="py-2.5 px-2.5 text-right text-emerald-400">Extras</th>
                              <th className="py-2.5 px-2.5 text-right text-white">Total</th>
                              <th className="py-2.5 px-2.5 text-right text-rose-400">Descuentos</th>
                              <th className="py-2.5 px-2.5 text-right text-[#F0C800]">Total a Cobrar</th>
                              <th className="py-2.5 px-2.5 text-right text-sky-300 w-32">Transf.</th>
                              <th className="py-2.5 px-2.5 text-right text-emerald-300 w-28">Efectivo</th>
                              <th className="py-2.5 px-2.5 text-right">Saldo</th>
                              <th className="py-2.5 px-2.5 min-w-[140px]">Observaciones</th>
                              <th className="py-2.5 px-3 min-w-[190px]">Alias / CBU</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10 text-xs">
                            {weekBucket.slips.map(slip => {
                              const bd = getSlipSummaryBreakdown(slip);
                              const isDirty = Boolean(dirtyRSlipIds[slip.id]);
                              const saldoZero = Math.abs(bd.saldo) < 1;
                              const saldoNeg = bd.saldo <= -1;
                              return (
                                <tr
                                  key={slip.id}
                                  className={`transition-colors ${
                                    isDirty ? 'bg-[#F0C800]/10' : 'hover:bg-white/[0.03]'
                                  }`}
                                >
                                  <td className="py-2 px-3">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditSlipModal(slip)}
                                      className="text-left group cursor-pointer"
                                      title="Abrir ficha detallada para editar conceptos"
                                    >
                                      <div className="font-black text-white uppercase group-hover:text-[#F0C800] transition-colors">
                                        {slip.empleadoNombre}
                                      </div>
                                    </button>
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-mono text-sky-300 whitespace-nowrap">
                                    {formatARS(bd.basico)}
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-mono text-emerald-400 whitespace-nowrap">
                                    {bd.extras > 0 ? formatARS(bd.extras) : <span className="text-gray-600">-</span>}
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-mono font-bold text-white whitespace-nowrap">
                                    {formatARS(bd.total)}
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-mono text-rose-400 whitespace-nowrap">
                                    {bd.descuentos > 0 ? formatARS(bd.descuentos) : <span className="text-gray-600">-</span>}
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-mono font-black text-[#F0C800] bg-[#F0C800]/5 whitespace-nowrap">
                                    {formatARS(bd.totalACobrar)}
                                  </td>
                                  <td className="py-2 px-2">
                                    <input
                                      type="number"
                                      step="100"
                                      value={
                                        slip.pagoTransferencia !== undefined
                                          ? slip.pagoTransferencia
                                          : bd.transferenciasEnFicha > 0
                                            ? bd.transferenciasEnFicha
                                            : ''
                                      }
                                      placeholder="0"
                                      onChange={e =>
                                        handleInlineRSummaryFieldChange(
                                          slip.id,
                                          'pagoTransferencia',
                                          e.target.value
                                        )
                                      }
                                      className="w-full bg-[#121212] border border-white/15 focus:border-[#F0C800] rounded-lg px-2 py-1 text-right font-mono text-xs font-bold text-sky-300 focus:outline-none"
                                    />
                                  </td>
                                  <td className="py-2 px-2">
                                    <input
                                      type="number"
                                      step="100"
                                      value={slip.pagoEfectivo ? slip.pagoEfectivo : ''}
                                      placeholder="0"
                                      onChange={e =>
                                        handleInlineRSummaryFieldChange(
                                          slip.id,
                                          'pagoEfectivo',
                                          e.target.value
                                        )
                                      }
                                      className="w-full bg-[#121212] border border-white/15 focus:border-[#F0C800] rounded-lg px-2 py-1 text-right font-mono text-xs font-bold text-emerald-300 focus:outline-none"
                                    />
                                  </td>
                                  <td className="py-2 px-2.5 text-right whitespace-nowrap">
                                    <span
                                      className={`inline-block px-2 py-1 rounded-lg font-mono text-xs font-black border ${
                                        saldoZero
                                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                          : saldoNeg
                                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                            : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                                      }`}
                                    >
                                      {saldoZero ? '$ 0,00' : formatARS(bd.saldo)}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2">
                                    <input
                                      type="text"
                                      value={slip.observacionesPago || ''}
                                      placeholder="Obs..."
                                      onChange={e =>
                                        handleInlineRSummaryFieldChange(
                                          slip.id,
                                          'observacionesPago',
                                          e.target.value
                                        )
                                      }
                                      className="w-full bg-[#121212] border border-white/10 focus:border-[#F0C800] rounded-lg px-2 py-1 text-[11px] text-gray-200 focus:outline-none"
                                    />
                                  </td>
                                  <td className="py-2 px-2.5">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={slip.aliasBancario || ''}
                                          placeholder="Alias..."
                                          onChange={e =>
                                            handleInlineRSummaryFieldChange(
                                              slip.id,
                                              'aliasBancario',
                                              e.target.value
                                            )
                                          }
                                          className="flex-1 min-w-0 bg-[#121212] border border-white/10 focus:border-[#F0C800] rounded px-1.5 py-0.5 text-[10px] font-mono text-sky-300 focus:outline-none"
                                        />
                                        {slip.aliasBancario && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleCopyBankField(
                                                slip.aliasBancario!,
                                                `al-${slip.id}`
                                              )
                                            }
                                            className="p-1 rounded bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white cursor-pointer shrink-0"
                                            title="Copiar Alias"
                                          >
                                            {copiedBankKey === `al-${slip.id}` ? (
                                              <Check className="w-3 h-3 text-emerald-400" />
                                            ) : (
                                              <Copy className="w-3 h-3" />
                                            )}
                                          </button>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={slip.cbuBancario || ''}
                                          placeholder="CBU / CVU..."
                                          onChange={e =>
                                            handleInlineRSummaryFieldChange(
                                              slip.id,
                                              'cbuBancario',
                                              e.target.value
                                            )
                                          }
                                          className="flex-1 min-w-0 bg-[#121212] border border-white/10 focus:border-[#F0C800] rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-300 focus:outline-none"
                                        />
                                        {slip.cbuBancario && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleCopyBankField(
                                                slip.cbuBancario!,
                                                `cbu-${slip.id}`
                                              )
                                            }
                                            className="p-1 rounded bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white cursor-pointer shrink-0"
                                            title="Copiar CBU / CVU"
                                          >
                                            {copiedBankKey === `cbu-${slip.id}` ? (
                                              <Check className="w-3 h-3 text-emerald-400" />
                                            ) : (
                                              <Copy className="w-3 h-3" />
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-black/75 border-t-2 border-[#F0C800]/50 text-xs font-black uppercase">
                              <td className="py-3 px-3 text-white">TOTALES {weekBucket.numeroSemana}° SEM</td>
                              <td className="py-3 px-2.5 text-right font-mono text-sky-300">
                                {formatARS(wBasico)}
                              </td>
                              <td className="py-3 px-2.5 text-right font-mono text-emerald-400">
                                {formatARS(wExtras)}
                              </td>
                              <td className="py-3 px-2.5 text-right font-mono text-white">
                                {formatARS(wTotal)}
                              </td>
                              <td className="py-3 px-2.5 text-right font-mono text-rose-400">
                                {formatARS(wDescuentos)}
                              </td>
                              <td className="py-3 px-2.5 text-right font-mono text-[#F0C800] bg-[#F0C800]/10">
                                {formatARS(wACobrar)}
                              </td>
                              <td className="py-3 px-2.5 text-right font-mono text-sky-300">
                                {formatARS(wTransf)}
                              </td>
                              <td className="py-3 px-2.5 text-right font-mono text-emerald-300">
                                {formatARS(wEfectivo)}
                              </td>
                              <td
                                className={`py-3 px-2.5 text-right font-mono ${
                                  Math.abs(wSaldo) < 1
                                    ? 'text-emerald-400'
                                    : wSaldo < 0
                                      ? 'text-rose-400'
                                      : 'text-amber-300'
                                }`}
                              >
                                {formatARS(wSaldo)}
                              </td>
                              <td colSpan={2} className="py-3 px-3 text-[10px] text-gray-500 font-normal normal-case">
                                Editá Transf., Efectivo, Alias o CBU y guardá para actualizar Supabase{detectedCompanionRTab ? ` y ${detectedCompanionRTab}` : ''}.
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* SUB-VIEW B: ACUMULADO MENSUAL CONSOLIDADO POR EMPLEADO (1° + 2° + 3° + 4° SEMANA) */}
          {consolidatedSubView === 'acumulado_mensual' && (
            <div className="bg-[#161616] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-black/50 border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-gray-400">
                      <th className="py-3.5 px-4">Empleado</th>
                      <th className="py-3.5 px-2.5 text-right">1° Sem</th>
                      <th className="py-3.5 px-2.5 text-right">2° Sem</th>
                      <th className="py-3.5 px-2.5 text-right">3° Sem</th>
                      <th className="py-3.5 px-2.5 text-right">4° Sem</th>
                      <th className="py-3.5 px-2.5 text-right text-sky-300">Básico Mes</th>
                      <th className="py-3.5 px-2.5 text-right text-emerald-400">Extras Mes</th>
                      <th className="py-3.5 px-2.5 text-right text-rose-400">Descuentos</th>
                      <th className="py-3.5 px-3 text-right text-[#F0C800]">Total a Cobrar</th>
                      <th className="py-3.5 px-2.5 text-right text-sky-300">Transf. + Efec.</th>
                      <th className="py-3.5 px-2.5 text-right">Saldo Mes</th>
                      <th className="py-3.5 px-3 text-center">Recibo Mes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-xs">
                    {consolidatedEmployees.map(emp => {
                      const isEmpExpanded = Boolean(expandedConsolidatedKeys[emp.empleadoKey]);
                      const paidMes = emp.totalTransfMes + emp.totalEfectivoMes;
                      const saldoZero = Math.abs(emp.totalSaldoMes) < 1;
                      return (
                        <React.Fragment key={emp.empleadoKey}>
                          <tr
                            onClick={() => toggleConsolidatedExpanded(emp.empleadoKey)}
                            className={`cursor-pointer transition-colors ${
                              isEmpExpanded ? 'bg-[#F0C800]/10' : 'hover:bg-white/5'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <span className="p-1 rounded-lg bg-white/5 border border-white/10 text-[#F0C800]">
                                  {isEmpExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </span>
                                <div>
                                  <div className="font-black text-white uppercase">{emp.empleadoNombre}</div>
                                  <div className="text-[10px] text-gray-500">
                                    {emp.fichasCount} {emp.fichasCount === 1 ? 'semana' : 'semanas'} • Base {formatARS(emp.valorBaseJornal)}
                                    {emp.aliasBancario ? ` • ${emp.aliasBancario}` : ''}
                                  </div>
                                </div>
                              </div>
                            </td>
                            {[1, 2, 3, 4].map(wNum => {
                              const cell = emp.porSemana[wNum];
                              return (
                                <td key={wNum} className="py-3 px-2.5 text-right font-mono">
                                  {cell ? (
                                    <span className="text-white font-bold">{formatARS(cell.totalACobrar)}</span>
                                  ) : (
                                    <span className="text-gray-600">$ -</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-3 px-2.5 text-right font-mono font-bold text-sky-300">
                              {formatARS(emp.totalBasicoMes)}
                            </td>
                            <td className="py-3 px-2.5 text-right font-mono font-bold text-emerald-400">
                              + {formatARS(emp.totalExtrasMes)}
                            </td>
                            <td className="py-3 px-2.5 text-right font-mono font-bold text-rose-400">
                              - {formatARS(emp.totalDescuentosRealesMes)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-black text-sm text-[#F0C800] bg-[#F0C800]/5">
                              {formatARS(emp.totalACobrarMes)}
                            </td>
                            <td className="py-3 px-2.5 text-right font-mono text-sky-300">
                              <div>{formatARS(paidMes)}</div>
                              {emp.totalEfectivoMes > 0 && (
                                <div className="text-[9px] text-gray-400">
                                  Ef {formatARS(emp.totalEfectivoMes)}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-2.5 text-right font-mono font-black">
                              <span
                                className={
                                  saldoZero
                                    ? 'text-emerald-400'
                                    : emp.totalSaldoMes < 0
                                      ? 'text-rose-400'
                                      : 'text-amber-300'
                                }
                              >
                                {formatARS(emp.totalSaldoMes)}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => setPrintingConsolidatedEmp(emp)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#F0C800]/20 hover:bg-[#F0C800] text-[#F0C800] hover:text-black font-bold text-[10px] uppercase inline-flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" /> Imprimir
                              </button>
                            </td>
                          </tr>
                          {isEmpExpanded && (
                            <tr className="bg-black/60">
                              <td colSpan={12} className="p-4 border-t border-white/10">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {emp.slips.map(wSlip => {
                                    const wExtras = wSlip.extraItems.filter(it => (it.cantidad > 0 || it.ingreso > 0) && it.egreso === 0);
                                    const wDeds = orderPayrollExtraItems(wSlip.extraItems.filter(it => it.egreso > 0));
                                    const bd = getSlipSummaryBreakdown(wSlip);
                                    return (
                                      <div key={wSlip.id} className="bg-[#161616] border border-white/10 rounded-xl p-3.5 space-y-2.5">
                                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                          <div>
                                            <span className="px-2 py-0.5 rounded bg-[#F0C800] text-black text-[10px] font-black uppercase">
                                              {wSlip.numeroSemana || 1}° Semana
                                            </span>
                                            <span className="ml-2 text-[11px] text-gray-400">{wSlip.grupoSemana}</span>
                                          </div>
                                          <div className="text-right">
                                            <span className="font-mono font-black text-sm text-[#F0C800]">
                                              {formatARS(bd.totalACobrar)}
                                            </span>
                                            <div className="text-[10px] font-mono text-gray-400">
                                              Saldo: {formatARS(bd.saldo)}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="space-y-1 text-[11px]">
                                          {wSlip.basicItems.filter(b => b.unidades > 0 || b.ingreso > 0).map(b => (
                                            <div key={b.id} className="flex justify-between text-gray-300">
                                              <span>{b.concepto} ({b.unidades} u.)</span>
                                              <span className="font-mono">{formatARS(b.ingreso)}</span>
                                            </div>
                                          ))}
                                          {wExtras.map(ex => (
                                            <div key={ex.id} className="flex justify-between text-emerald-300">
                                              <span>+ {ex.concepto} ({ex.cantidad} hs)</span>
                                              <span className="font-mono">+{formatARS(ex.ingreso)}</span>
                                            </div>
                                          ))}
                                          {wDeds.map(dd => (
                                            <div key={dd.id} className="flex justify-between text-rose-300">
                                              <span>- {dd.concepto}</span>
                                              <span className="font-mono">-{formatARS(dd.egreso)}</span>
                                            </div>
                                          ))}
                                          {(bd.pagoTransferencia > 0 || bd.pagoEfectivo > 0) && (
                                            <div className="pt-1 mt-1 border-t border-white/10 flex justify-between text-sky-300 font-bold">
                                              <span>Pagado (Tr {formatARS(bd.pagoTransferencia)} • Ef {formatARS(bd.pagoEfectivo)})</span>
                                              <span className="font-mono">Saldo {formatARS(bd.saldo)}</span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                                          <button
                                            onClick={() => handleOpenEditSlipModal(wSlip)}
                                            className="px-2.5 py-1 rounded bg-[#F0C800]/20 hover:bg-[#F0C800] text-[#F0C800] hover:text-black text-[10px] font-bold uppercase cursor-pointer"
                                          >
                                            Editar
                                          </button>
                                          <button
                                            onClick={() => setPrintingSlip(wSlip)}
                                            className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-gray-200 text-[10px] font-bold uppercase cursor-pointer"
                                          >
                                            Recibo
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-black/70 border-t-2 border-[#F0C800]/50 text-xs font-black uppercase">
                      <td className="py-4 px-4 text-white">
                        TOTALES DEL MES ({consolidatedEmployees.length} empleados)
                      </td>
                      {[1, 2, 3, 4].map(wNum => {
                        const wBucket = weeklySummaries.find(x => x.numeroSemana === wNum);
                        const wCobrar = (wBucket?.slips || []).reduce(
                          (acc, s) => acc + getSlipSummaryBreakdown(s).totalACobrar,
                          0
                        );
                        return (
                          <td key={wNum} className="py-4 px-2.5 text-right font-mono text-gray-200">
                            {formatARS(wCobrar)}
                          </td>
                        );
                      })}
                      <td className="py-4 px-2.5 text-right font-mono text-sky-300">
                        {formatARS(grandMonthTotals.basico)}
                      </td>
                      <td className="py-4 px-2.5 text-right font-mono text-emerald-400">
                        + {formatARS(grandMonthTotals.extras)}
                      </td>
                      <td className="py-4 px-2.5 text-right font-mono text-rose-400">
                        - {formatARS(grandMonthTotals.descuentosReales)}
                      </td>
                      <td className="py-4 px-3 text-right font-mono text-base text-[#F0C800]">
                        {formatARS(grandMonthTotals.totalACobrar)}
                      </td>
                      <td className="py-4 px-2.5 text-right font-mono text-sky-300">
                        {formatARS(grandMonthTotals.pagadoTotal)}
                      </td>
                      <td className="py-4 px-2.5 text-right font-mono text-amber-300">
                        {formatARS(grandMonthTotals.saldo)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 3: EXECUTIVE SUMMARY TABLE OF ALL FICHAS */}
      {viewMode === 'table' && (
        <div className="bg-[#161616] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/50 border-b border-white/10 text-[11px] font-black uppercase tracking-wider text-gray-400">
                  <th className="py-3.5 px-4">Semana</th>
                  <th className="py-3.5 px-4">Empleado</th>
                  <th className="py-3.5 px-4 text-right">Jornal Base</th>
                  <th className="py-3.5 px-4 text-right">Total Básico</th>
                  <th className="py-3.5 px-4 text-right">Horas Extras</th>
                  <th className="py-3.5 px-4 text-right">Total Ingresos</th>
                  <th className="py-3.5 px-4 text-right">Descuentos</th>
                  <th className="py-3.5 px-4 text-right text-[#F0C800]">Neto Ficha</th>
                  <th className="py-3.5 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-xs">
                {filteredSlips.map(slip => {
                  const isRowExpanded = Boolean(expandedSlipIds[slip.id]);
                  const rowExtras = slip.extraItems.filter(it => (it.cantidad > 0 || it.ingreso > 0) && it.egreso === 0);
                  const rowDeds = orderPayrollExtraItems(slip.extraItems.filter(it => it.egreso > 0));
                  return (
                    <React.Fragment key={slip.id}>
                      <tr
                        onClick={() => toggleSlipExpanded(slip.id)}
                        className={`cursor-pointer transition-colors ${
                          isRowExpanded ? 'bg-[#F0C800]/10' : 'hover:bg-white/5'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded bg-white/5 border border-white/10 text-[#F0C800]">
                              {isRowExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </span>
                            <div>
                              <span className="px-2 py-0.5 rounded bg-[#F0C800]/20 text-[#F0C800] font-black text-[10px] uppercase">
                                {slip.numeroSemana || 1}° Semana
                              </span>
                              <div className="text-[10px] text-gray-500 mt-0.5">{slip.grupoSemana}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-black text-white uppercase">
                          {slip.empleadoNombre}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-gray-300">
                          {formatARS(slip.valorBaseJornal)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-sky-300">
                          {formatARS(slip.totalBasicoIngresos)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                          + {formatARS(slip.totalExtraIngresos)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                          {formatARS(slip.totalIngresos)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-400">
                          - {formatARS(slip.totalEgresos)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-black text-sm text-[#F0C800]">
                          {formatARS(slip.netoACobrar)}
                        </td>
                        <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditSlipModal(slip)}
                              className="p-1.5 rounded-lg bg-[#F0C800]/20 text-[#F0C800] hover:bg-[#F0C800] hover:text-black transition-all cursor-pointer"
                              title="Editar"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setPrintingSlip(slip)}
                              className="p-1.5 rounded-lg bg-white/10 text-gray-200 hover:bg-white/20 transition-all cursor-pointer"
                              title="Recibo B&W"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isRowExpanded && (
                        <tr className="bg-black/60">
                          <td colSpan={9} className="p-4 border-t border-white/10">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="bg-[#161616] border border-white/10 rounded-xl p-3 space-y-1.5">
                                <div className="text-[11px] font-black uppercase text-sky-300 border-b border-white/10 pb-1.5 flex justify-between">
                                  <span>1. Liquidación Básica</span>
                                  <span className="font-mono">{formatARS(slip.totalBasicoIngresos)}</span>
                                </div>
                                {slip.basicItems.filter(b => b.unidades > 0 || b.ingreso > 0).map(b => (
                                  <div key={b.id} className="flex justify-between text-[11px] text-gray-300">
                                    <span>{b.concepto} ({b.unidades} u.)</span>
                                    <span className="font-mono font-bold text-white">{formatARS(b.ingreso)}</span>
                                  </div>
                                ))}
                              </div>

                              <div className="bg-[#161616] border border-white/10 rounded-xl p-3 space-y-1.5">
                                <div className="text-[11px] font-black uppercase text-emerald-300 border-b border-white/10 pb-1.5 flex justify-between">
                                  <span>2. Horas Extras y Adicionales</span>
                                  <span className="font-mono">+{formatARS(slip.totalExtraIngresos)}</span>
                                </div>
                                {rowExtras.length > 0 ? rowExtras.map(ex => (
                                  <div key={ex.id} className="flex justify-between text-[11px] text-emerald-200">
                                    <span>{ex.concepto} ({ex.cantidad} hs)</span>
                                    <span className="font-mono font-bold text-emerald-400">+{formatARS(ex.ingreso)}</span>
                                  </div>
                                )) : (
                                  <div className="text-[11px] text-gray-500 italic">Sin horas extras cargadas</div>
                                )}
                              </div>

                              <div className="bg-[#161616] border border-white/10 rounded-xl p-3 space-y-1.5">
                                <div className="text-[11px] font-black uppercase text-rose-300 border-b border-white/10 pb-1.5 flex justify-between">
                                  <span>3. Egresos y Transferencias</span>
                                  <span className="font-mono">-{formatARS(slip.totalEgresos)}</span>
                                </div>
                                {rowDeds.length > 0 ? rowDeds.map(dd => (
                                  <div key={dd.id} className="flex justify-between text-[11px] text-rose-200">
                                    <span>{dd.fechaDetalle ? `[${dd.fechaDetalle}] ` : ''}{dd.concepto}</span>
                                    <span className="font-mono font-bold text-rose-400">-{formatARS(dd.egreso)}</span>
                                  </div>
                                )) : (
                                  <div className="text-[11px] text-gray-500 italic">Sin descuentos ni transferencias</div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-black/60 border-t-2 border-[#F0C800]/40 text-xs font-black uppercase">
                  <td colSpan={3} className="py-4 px-4 text-gray-300">
                    SUMA TOTAL ({filteredSlips.length} fichas listadas)
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-sky-300">
                    {formatARS(periodMetrics.totalBasico)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-emerald-400">
                    + {formatARS(periodMetrics.totalExtra)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-white">
                    {formatARS(periodMetrics.totalBasico + periodMetrics.totalExtra)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-rose-400">
                    - {formatARS(periodMetrics.totalDescuentos)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-base text-[#F0C800]">
                    {formatARS(periodMetrics.totalNeto)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: DUAL SIDE-BY-SIDE POPUP — LEFT: EDITAR FICHA | RIGHT: MARCACIONES Y PARTES TRABAJADOS */}
      {editingSlip && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div
            className={`w-full flex flex-col lg:flex-row gap-4 items-stretch justify-center ${
              showActivitySidePopup ? 'max-w-[98vw] 2xl:max-w-[1640px]' : 'max-w-4xl'
            }`}
          >
            {/* LEFT POPUP: EDITAR FICHA */}
            <div className="bg-[#161616] border border-white/15 rounded-2xl flex-1 min-w-0 max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-black/50 border-b border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Calculator className="w-5 h-5 text-[#F0C800] shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-base font-black uppercase text-white truncate">
                      {isNewSlip
                        ? `Nueva Ficha (${editingSlip.grupoSemana})`
                        : `Editar Ficha: ${editingSlip.empleadoNombre} (${editingSlip.grupoSemana})`}
                    </h3>
                    <p className="text-xs text-gray-400">
                      Elegí la semana (1°, 2°, 3° o 4° Semana), ajustá días/unidades u horas extras y el sistema suma todo automáticamente.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowActivitySidePopup(prev => !prev)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase flex items-center gap-1.5 border transition cursor-pointer ${
                      showActivitySidePopup
                        ? 'bg-[#F0C800]/15 text-[#F0C800] border-[#F0C800]/40 hover:bg-[#F0C800]/25'
                        : 'bg-white/5 text-gray-300 border-white/15 hover:bg-white/10 hover:text-white'
                    }`}
                    title={showActivitySidePopup ? 'Ocultar panel derecho de Marcaciones y Partes' : 'Mostrar panel derecho de Marcaciones y Partes'}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {showActivitySidePopup ? 'Ocultar Marcaciones' : 'Ver Marcaciones y Partes'}
                    </span>
                  </button>
                  <button
                    onClick={() => setEditingSlip(null)}
                    className="text-gray-400 hover:text-white p-1 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-between gap-3 text-red-200 text-xs">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                  <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {/* Top Fields: Semana selector, Employee selector/name, Valor Base Jornal, Rango */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-black/30 p-4 rounded-xl border border-white/10">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#F0C800] mb-1">
                    Semana y Grupo
                  </label>
                  <select
                    value={editingSlip.numeroSemana || detectWeekNumberFromText(editingSlip.grupoSemana)}
                    onChange={e => {
                      const wNum = Number(e.target.value) || 1;
                      const currentGrp = classifyPayrollGroupFromBanner(editingSlip.grupoSemana);
                      setEditingSlip(prev =>
                        prev
                          ? {
                              ...prev,
                              numeroSemana: wNum,
                              grupoSemana: getCanonicalWeekBanner(wNum, undefined, currentGrp),
                            }
                          : null
                      );
                    }}
                    className="w-full bg-[#121212] border border-[#F0C800]/50 rounded-xl px-3 py-2 text-xs font-black text-[#F0C800] focus:outline-none"
                  >
                    {getStandardWeeksForGroup(classifyPayrollGroupFromBanner(editingSlip.grupoSemana)).map(w => (
                      <option key={w.num} value={w.num}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1 mt-1.5">
                    {PAYROLL_COMPANY_GROUPS.map(g => {
                      const isGrp = classifyPayrollGroupFromBanner(editingSlip.grupoSemana) === g.id;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            const wNum =
                              editingSlip.numeroSemana ||
                              detectWeekNumberFromText(editingSlip.grupoSemana);
                            setEditingSlip(prev =>
                              prev
                                ? {
                                    ...prev,
                                    grupoSemana: getCanonicalWeekBanner(wNum, undefined, g.id),
                                  }
                                : null
                            );
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition cursor-pointer ${
                            isGrp
                              ? 'bg-[#F0C800] text-black'
                              : 'bg-white/5 text-gray-400 hover:text-white'
                          }`}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold uppercase text-gray-400 mb-1">
                    Nombre del Empleado (o elegir de Nómina)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editingSlip.empleadoNombre}
                      onChange={e =>
                        setEditingSlip(prev =>
                          prev ? { ...prev, empleadoNombre: e.target.value.toUpperCase() } : null
                        )
                      }
                      className="flex-1 bg-[#121212] border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-white uppercase focus:border-[#F0C800] focus:outline-none"
                    />
                    {employees.length > 0 && (
                      <select
                        onChange={e => {
                          const emp = employees.find(x => x.id === e.target.value);
                          if (emp) {
                            const fullName = (emp.nombreApellido || emp.nombre || '').toUpperCase();
                            const base = Number(emp.costoPorDia) || editingSlip.valorBaseJornal;
                            setEditingSlip(prev =>
                              prev
                                ? recalculatePayrollSlip({
                                    ...prev,
                                    empleadoNombre: fullName,
                                    empleadoId: emp.id,
                                    valorBaseJornal: base,
                                  })
                                : null
                            );
                          }
                        }}
                        defaultValue=""
                        className="bg-[#121212] border border-white/15 rounded-xl px-2.5 py-2 text-xs text-gray-300"
                      >
                        <option value="" disabled>
                          Nómina...
                        </option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>
                            {emp.nombreApellido || emp.nombre}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#F0C800] mb-1">
                    Valor Base Jornal ($)
                  </label>
                  <input
                    type="number"
                    value={editingSlip.valorBaseJornal}
                    onChange={e => {
                      const nextBase = parseFloat(e.target.value) || 0;
                      setEditingSlip(prev =>
                        prev
                          ? recalculatePayrollSlip({
                              ...prev,
                              valorBaseJornal: nextBase,
                            })
                          : null
                      );
                    }}
                    className="w-full bg-[#121212] border border-[#F0C800]/50 rounded-xl px-3 py-2 text-xs font-black text-[#F0C800] font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-gray-400 mb-1">
                    Rango de Fechas
                  </label>
                  <input
                    type="text"
                    value={editingSlip.rangoFecha}
                    onChange={e =>
                      setEditingSlip(prev =>
                        prev ? { ...prev, rangoFecha: e.target.value.toUpperCase() } : null
                      )
                    }
                    className="w-full bg-[#121212] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Block 1 Editor: Conceptos del Básico */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-sky-300">
                    1. Conceptos del Básico (Unidades × Valor Base Jornal)
                  </h4>
                  <button
                    onClick={() => {
                      setEditingSlip(prev => {
                        if (!prev) return null;
                        const nextBasic: PayrollBasicItem = {
                          id: `b-${Date.now()}`,
                          concepto: 'NUEVO CONCEPTO BÁSICO',
                          unidades: 1,
                          ingreso: prev.valorBaseJornal,
                          egreso: 0,
                        };
                        return recalculatePayrollSlip({
                          ...prev,
                          basicItems: [...prev.basicItems, nextBasic],
                        });
                      });
                    }}
                    className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar Concepto Básico
                  </button>
                </div>

                <div className="bg-black/30 border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5 text-gray-400 text-[10px] uppercase">
                        <th className="py-2 px-3 text-left">Concepto</th>
                        <th className="py-2 px-3 text-center w-28">Unidades / Días</th>
                        <th className="py-2 px-3 text-right w-40">Ingreso Calculado ($)</th>
                        <th className="py-2 px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {editingSlip.basicItems.map((item, idx) => (
                        <tr key={item.id}>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.concepto}
                              onChange={e => {
                                const val = e.target.value.toUpperCase();
                                setEditingSlip(prev => {
                                  if (!prev) return null;
                                  const next = [...prev.basicItems];
                                  next[idx] = { ...next[idx], concepto: val };
                                  return recalculatePayrollSlip({ ...prev, basicItems: next });
                                });
                              }}
                              className="w-full bg-[#141414] border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-semibold"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              value={item.unidades}
                              onChange={e => {
                                const u = parseFloat(e.target.value) || 0;
                                setEditingSlip(prev => {
                                  if (!prev) return null;
                                  const next = [...prev.basicItems];
                                  next[idx] = {
                                    ...next[idx],
                                    unidades: u,
                                    manualMonto: false,
                                  };
                                  return recalculatePayrollSlip({ ...prev, basicItems: next });
                                });
                              }}
                              className="w-full bg-[#141414] border border-white/15 rounded-lg px-2.5 py-1.5 text-center font-mono text-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="100"
                              value={item.ingreso}
                              onChange={e => {
                                const monto = parseFloat(e.target.value) || 0;
                                setEditingSlip(prev => {
                                  if (!prev) return null;
                                  const next = [...prev.basicItems];
                                  next[idx] = {
                                    ...next[idx],
                                    ingreso: monto,
                                    manualMonto: true,
                                  };
                                  return recalculatePayrollSlip({ ...prev, basicItems: next });
                                });
                              }}
                              className="w-full bg-[#141414] border border-white/10 rounded-lg px-2.5 py-1.5 text-right font-mono text-sky-300 font-bold"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() =>
                                setEditingSlip(prev => {
                                  if (!prev) return null;
                                  return recalculatePayrollSlip({
                                    ...prev,
                                    basicItems: prev.basicItems.filter((_, i) => i !== idx),
                                  });
                                })
                              }
                              className="text-gray-500 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Block 2 Editor: Horas Extras, Descuentos, Anticipos (arriba) y Transferencias (abajo) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                      2. Horas Extras, Descuentos, Anticipos y Transferencias
                    </h4>
                    <p className="text-[10px] text-gray-400">
                      En tu Google Sheet, los <strong>Descuentos y Anticipos</strong> se generan arriba (debajo de las horas extras) y las <strong>Transferencias</strong> abajo (cerca de TOTAL EXTRA).
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleAddMovementToEditingSlip('HORA_EXTRA')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Hora Extra
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddMovementToEditingSlip('DESCUENTO')}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-bold text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nuevo Descuento
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddMovementToEditingSlip('ANTICIPO')}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-bold text-amber-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nuevo Anticipo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddMovementToEditingSlip('TRANSFERENCIA')}
                      className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-xs font-bold text-sky-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nueva Transferencia
                    </button>
                  </div>
                </div>

                {/* Quick concept presets (adds ordered line or sets concept of active untouched new row) */}
                <div className="flex items-center gap-1.5 flex-wrap bg-black/25 border border-white/10 rounded-xl px-3 py-2">
                  <span className="text-[10px] font-bold uppercase text-gray-400 mr-1">
                    Rápidos:
                  </span>
                  {[
                    { label: 'COMBUSTIBLE', kind: 'DESCUENTO' as PayrollMovementCategory, tone: 'rose' },
                    { label: 'PRESENTISMO', kind: 'DESCUENTO' as PayrollMovementCategory, tone: 'rose' },
                    { label: 'AUSENTE', kind: 'DESCUENTO' as PayrollMovementCategory, tone: 'rose' },
                    { label: 'ALMUERZO', kind: 'DESCUENTO' as PayrollMovementCategory, tone: 'rose' },
                    { label: 'SUPER', kind: 'DESCUENTO' as PayrollMovementCategory, tone: 'rose' },
                    { label: 'ANTICIPO', kind: 'ANTICIPO' as PayrollMovementCategory, tone: 'amber' },
                    { label: 'TRANSFERENCIA A CTA.', kind: 'TRANSFERENCIA' as PayrollMovementCategory, tone: 'sky' },
                    { label: 'CANCELACION TRANSFERENCIA', kind: 'TRANSFERENCIA' as PayrollMovementCategory, tone: 'sky' },
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const activeNew = editingSlip.extraItems.find(
                          it =>
                            it.id === highlightedExtraId &&
                            it.egreso === 0 &&
                            it.ingreso === 0
                        );
                        if (activeNew) {
                          setEditingSlip(prev => {
                            if (!prev) return null;
                            const next = prev.extraItems.map(it =>
                              it.id === activeNew.id
                                ? {
                                    ...it,
                                    concepto: preset.label,
                                    tipoMovimiento: preset.kind,
                                    fechaDetalle:
                                      it.fechaDetalle ||
                                      (preset.kind === 'ANTICIPO' || preset.kind === 'TRANSFERENCIA'
                                        ? formatTodaySlash()
                                        : ''),
                                  }
                                : it
                            );
                            return recalculatePayrollSlip({
                              ...prev,
                              extraItems: orderPayrollExtraItems(next),
                            });
                          });
                        } else {
                          handleAddMovementToEditingSlip(preset.kind, preset.label);
                        }
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border transition-all cursor-pointer ${
                        preset.tone === 'sky'
                          ? 'bg-sky-500/10 hover:bg-sky-500/25 border-sky-500/25 text-sky-300'
                          : preset.tone === 'amber'
                            ? 'bg-amber-500/10 hover:bg-amber-500/25 border-amber-500/25 text-amber-300'
                            : 'bg-rose-500/10 hover:bg-rose-500/25 border-rose-500/25 text-rose-300'
                      }`}
                    >
                      + {preset.label}
                    </button>
                  ))}
                </div>

                <div className="bg-black/30 border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5 text-gray-400 text-[10px] uppercase">
                        <th className="py-2 px-2 text-center w-24">Tipo / Zona</th>
                        <th className="py-2 px-2 text-center w-28">Cant. Hs / Fecha</th>
                        <th className="py-2 px-3 text-left">Concepto</th>
                        <th className="py-2 px-2 text-right w-28">Tarifa ($)</th>
                        <th className="py-2 px-2 text-right w-32">Ingreso (+)</th>
                        <th className="py-2 px-2 text-right w-32">Descuento (-)</th>
                        <th className="py-2 px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {editingSlip.extraItems.map((item, idx) => {
                        const cat = classifyPayrollExtraItem(item);
                        const isHighlighted = item.id === highlightedExtraId;
                        const isEgresoCategory = cat !== 'HORA_EXTRA' || item.egreso > 0;
                        return (
                          <tr
                            key={item.id}
                            className={
                              isHighlighted
                                ? 'bg-[#F0C800]/10 ring-1 ring-inset ring-[#F0C800]/50'
                                : cat === 'TRANSFERENCIA'
                                  ? 'bg-sky-500/[0.04]'
                                  : cat === 'DESCUENTO' || cat === 'ANTICIPO'
                                    ? 'bg-rose-500/[0.03]'
                                    : ''
                            }
                          >
                            <td className="p-2 text-center">
                              {isEgresoCategory ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextCat: PayrollMovementCategory =
                                      cat === 'DESCUENTO'
                                        ? 'ANTICIPO'
                                        : cat === 'ANTICIPO'
                                          ? 'TRANSFERENCIA'
                                          : 'DESCUENTO';
                                    setEditingSlip(prev => {
                                      if (!prev) return null;
                                      const next = prev.extraItems.map((it, i) =>
                                        i === idx ? { ...it, tipoMovimiento: nextCat } : it
                                      );
                                      return recalculatePayrollSlip({
                                        ...prev,
                                        extraItems: orderPayrollExtraItems(next),
                                      });
                                    });
                                  }}
                                  title="Tocá para cambiar entre Descuento (arriba), Anticipo (arriba) o Transferencia (abajo)"
                                  className={`w-full px-1.5 py-1 rounded text-[9px] font-black uppercase border cursor-pointer transition-all ${
                                    cat === 'TRANSFERENCIA'
                                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                      : cat === 'ANTICIPO'
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  }`}
                                >
                                  {cat === 'TRANSFERENCIA'
                                    ? 'TRANSF ↓'
                                    : cat === 'ANTICIPO'
                                      ? 'ANTICIPO ↑'
                                      : 'DESCUENTO ↑'}
                                </button>
                              ) : (
                                <span className="inline-block w-full px-1.5 py-1 rounded text-[9px] font-black uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  EXTRA
                                </span>
                              )}
                            </td>
                            <td className="p-2">
                              {isEgresoCategory || item.fechaDetalle !== undefined ? (
                                <input
                                  type="text"
                                  placeholder="Fecha (ej 14/11)"
                                  value={item.fechaDetalle || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setEditingSlip(prev => {
                                      if (!prev) return null;
                                      const next = [...prev.extraItems];
                                      next[idx] = { ...next[idx], fechaDetalle: val };
                                      return recalculatePayrollSlip({ ...prev, extraItems: next });
                                    });
                                  }}
                                  className="w-full bg-[#141414] border border-white/15 rounded-lg px-2 py-1.5 text-center font-mono text-white text-[11px]"
                                />
                              ) : (
                                <input
                                  type="number"
                                  step="0.5"
                                  autoFocus={isHighlighted}
                                  value={item.cantidad}
                                  onChange={e => {
                                    const cant = parseFloat(e.target.value) || 0;
                                    setEditingSlip(prev => {
                                      if (!prev) return null;
                                      const next = [...prev.extraItems];
                                      const cur = next[idx];
                                      const nextIngreso =
                                        cur.egreso === 0 && cur.tarifaUnitaria > 0
                                          ? Math.round(cant * cur.tarifaUnitaria * 100) / 100
                                          : cur.ingreso;
                                      next[idx] = {
                                        ...cur,
                                        cantidad: cant,
                                        ingreso: nextIngreso,
                                        manualMonto: cur.egreso > 0 || cur.tarifaUnitaria === 0,
                                      };
                                      return recalculatePayrollSlip({ ...prev, extraItems: next });
                                    });
                                  }}
                                  className="w-full bg-[#141414] border border-white/15 rounded-lg px-2 py-1.5 text-center font-mono text-white"
                                />
                              )}
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.concepto}
                                onChange={e => {
                                  const val = e.target.value.toUpperCase();
                                  setEditingSlip(prev => {
                                    if (!prev) return null;
                                    const next = [...prev.extraItems];
                                    next[idx] = { ...next[idx], concepto: val };
                                    return recalculatePayrollSlip({ ...prev, extraItems: next });
                                  });
                                }}
                                className="w-full bg-[#141414] border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-semibold"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="250"
                                value={item.tarifaUnitaria}
                                onChange={e => {
                                  const tarifa = parseFloat(e.target.value) || 0;
                                  setEditingSlip(prev => {
                                    if (!prev) return null;
                                    const next = [...prev.extraItems];
                                    const cur = next[idx];
                                    const nextIngreso =
                                      cur.egreso === 0 && cur.cantidad > 0
                                        ? Math.round(cur.cantidad * tarifa * 100) / 100
                                        : cur.ingreso;
                                    next[idx] = {
                                      ...cur,
                                      tarifaUnitaria: tarifa,
                                      ingreso: nextIngreso,
                                      manualMonto: false,
                                    };
                                    return recalculatePayrollSlip({ ...prev, extraItems: next });
                                  });
                                }}
                                className="w-full bg-[#141414] border border-white/10 rounded-lg px-2 py-1.5 text-right font-mono text-gray-300"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                value={item.ingreso}
                                onChange={e => {
                                  const ing = parseFloat(e.target.value) || 0;
                                  setEditingSlip(prev => {
                                    if (!prev) return null;
                                    const next = [...prev.extraItems];
                                    next[idx] = { ...next[idx], ingreso: ing, manualMonto: true };
                                    return recalculatePayrollSlip({ ...prev, extraItems: next });
                                  });
                                }}
                                className="w-full bg-[#141414] border border-white/10 rounded-lg px-2 py-1.5 text-right font-mono text-emerald-400 font-bold"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                autoFocus={isHighlighted && isEgresoCategory}
                                onFocus={e => {
                                  if (isHighlighted) e.target.select();
                                }}
                                placeholder="0"
                                value={item.egreso}
                                onChange={e => {
                                  const eg = parseFloat(e.target.value) || 0;
                                  setEditingSlip(prev => {
                                    if (!prev) return null;
                                    const next = [...prev.extraItems];
                                    next[idx] = { ...next[idx], egreso: eg };
                                    return recalculatePayrollSlip({ ...prev, extraItems: next });
                                  });
                                }}
                                className={`w-full bg-[#141414] border rounded-lg px-2 py-1.5 text-right font-mono font-bold ${
                                  isHighlighted && isEgresoCategory
                                    ? 'border-[#F0C800] text-rose-300'
                                    : 'border-white/10 text-rose-400'
                                }`}
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingSlip(prev => {
                                    if (!prev) return null;
                                    return recalculatePayrollSlip({
                                      ...prev,
                                      extraItems: prev.extraItems.filter((_, i) => i !== idx),
                                    });
                                  })
                                }
                                className="text-gray-500 hover:text-red-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Grouped Totals Breakdown Footer */}
                  <div className="px-3 py-2 bg-white/[0.03] border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-emerald-400 font-bold">
                      Extras: + {formatARS(editingSlip.totalExtraIngresos)}
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-rose-300 font-bold">
                        Descuentos/Anticipos (arriba): -{' '}
                        {formatARS(
                          editingSlip.extraItems
                            .filter(it => classifyPayrollExtraItem(it) !== 'TRANSFERENCIA')
                            .reduce((a, b) => a + (Number(b.egreso) || 0), 0)
                        )}
                      </span>
                      <span className="text-sky-300 font-bold">
                        Transferencias (abajo): -{' '}
                        {formatARS(
                          editingSlip.extraItems
                            .filter(it => classifyPayrollExtraItem(it) === 'TRANSFERENCIA')
                            .reduce((a, b) => a + (Number(b.egreso) || 0), 0)
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer with Live Recalculated Preview + Google Sheet Write-Back */}
            <div className="px-6 py-4 bg-black/70 border-t border-white/10 space-y-3">
              {editingSlip.sheetSource ? (
                session?.accessToken ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3.5 py-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer text-emerald-200 font-semibold">
                      <input
                        type="checkbox"
                        checked={syncToSheetOnSave}
                        onChange={e => setSyncToSheetOnSave(e.target.checked)}
                        className="rounded border-emerald-400 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span>
                        Modificar al instante en tu Google Sheet (<strong>{editingSlip.sheetSource.tabTitle}</strong>) respetando fórmulas y formato
                      </span>
                    </label>
                    <span className="text-[11px] text-emerald-300 font-bold shrink-0">
                      Conectado ({session.email})
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-500/15 border border-amber-500/40 rounded-xl px-3.5 py-2 text-xs">
                    <div className="flex items-center gap-2 text-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        <strong>Sesión de Google desconectada</strong> (se reinicia al recargar la página). Usá el botón amarillo para conectar y modificar tu <strong>Google Sheet ({editingSlip.sheetSource.tabTitle})</strong> al instante.
                      </span>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-[11px] text-gray-300">
                  <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>
                    Ficha manual del sistema (no tiene bloque vinculado en el Google Sheet; se guarda en Supabase).
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div>
                    <span className="text-gray-400">Básico: </span>
                    <span className="font-mono font-bold text-sky-300">
                      {formatARS(editingSlip.totalBasicoIngresos)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Extras: </span>
                    <span className="font-mono font-bold text-emerald-400">
                      +{formatARS(editingSlip.totalExtraIngresos)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Descuentos: </span>
                    <span className="font-mono font-bold text-rose-400">
                      -{formatARS(editingSlip.totalEgresos)}
                    </span>
                  </div>
                  <div className="px-3 py-1 rounded-lg bg-[#F0C800]/20 border border-[#F0C800]/40">
                    <span className="text-[#F0C800] font-black uppercase mr-2">A Cobrar:</span>
                    <span className="font-mono font-black text-sm text-[#F0C800]">
                      {formatARS(editingSlip.netoACobrar)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingSlip(null);
                      setOriginalEditingSlip(null);
                      setErrorMsg(null);
                    }}
                    disabled={isSyncingToSheet}
                    className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold uppercase cursor-pointer"
                  >
                    Cancelar
                  </button>

                  {editingSlip.sheetSource && !session?.accessToken ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSaveSlipFromModal({ skipSheetSync: true })}
                        disabled={isSyncingToSheet}
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-200 border border-white/15 text-xs font-bold uppercase cursor-pointer"
                        title="Guarda los cambios únicamente en el sistema sin modificar el Google Sheet"
                      >
                        Solo Guardar en Sistema
                      </button>
                      <button
                        type="button"
                        onClick={handleConnectGoogleAndSaveSheet}
                        disabled={isSyncingToSheet}
                        className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] disabled:opacity-60 text-black text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer shadow-lg"
                      >
                        <Save className="w-4 h-4" />
                        {isSyncingToSheet
                          ? 'Conectando y Escribiendo...'
                          : 'Conectar Google y Guardar en Sheet'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSaveSlipFromModal()}
                      disabled={isSyncingToSheet}
                      className="px-5 py-2 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] disabled:opacity-60 text-black text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      {isSyncingToSheet
                        ? 'Escribiendo en Sheet...'
                        : syncToSheetOnSave && session?.accessToken && editingSlip.sheetSource
                          ? 'Guardar y Actualizar Sheet'
                          : editingSlip.sheetSource
                            ? 'Solo Guardar en Sistema'
                            : 'Guardar Ficha'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            </div>

            {/* RIGHT POPUP: MARCACIONES POR DÍA (1 LÍNEA + TOTAL HS) Y PARTES TRABAJADOS */}
            {showActivitySidePopup && (
              <PayrollEmployeeActivityPanel
                slip={editingSlip}
                periodName={activePeriod?.nombrePeriodo}
                employees={employees}
                matchedEmployee={
                  (editingSlip.empleadoId
                    ? employees.find(e => e.id === editingSlip.empleadoId) || null
                    : null) ||
                  slipNominaMatches[editingSlip.id]?.employee ||
                  matchPayrollSlipToEmployee(editingSlip, employees, savedEmployeeDirectoryLinks).employee
                }
                partesDiarios={partesDiarios}
                supabaseRegistros={supabaseRegistros}
                supabaseUsuarios={supabaseUsuarios}
                isAttendanceLoading={isAttendanceLoading}
                onClose={() => setShowActivitySidePopup(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: "NUEVO MES (COPIAR MES ANTERIOR)" */}
      {showNewPeriodModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161616] border border-white/15 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black uppercase text-white flex items-center gap-2">
                <Copy className="w-5 h-5 text-[#F0C800]" />
                Nuevo Mes (Copiar {activePeriod?.nombrePeriodo})
              </h3>
              <button
                onClick={() => setShowNewPeriodModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Se copiarán las{' '}
              <strong className="text-white">{activePeriod?.slips.length || 0} fichas</strong> del
              período actual manteniendo su Jornal Base y conceptos básicos para que liquides el
              nuevo mes en segundos.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-gray-400 mb-1">
                  Nombre del Período (ej. NOVIEMBRE 2026)
                </label>
                <input
                  type="text"
                  value={newPeriodName}
                  onChange={e => setNewPeriodName(e.target.value.toUpperCase())}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-bold uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-gray-400 mb-1">
                    Mes (ej. NOVIEMBRE)
                  </label>
                  <input
                    type="text"
                    value={newPeriodMesTexto}
                    onChange={e => setNewPeriodMesTexto(e.target.value.toUpperCase())}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-gray-400 mb-1">
                    Rango (ej. 01.11 AL 30.11)
                  </label>
                  <input
                    type="text"
                    value={newPeriodRango}
                    onChange={e => setNewPeriodRango(e.target.value.toUpperCase())}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white uppercase"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 pt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetExtrasOnCopy}
                  onChange={e => setResetExtrasOnCopy(e.target.checked)}
                  className="rounded border-white/20 text-[#F0C800] focus:ring-[#F0C800]"
                />
                <span className="text-xs text-gray-300">
                  Reiniciar en 0 las horas extras y descuentos eventuales del mes pasado (recomendado)
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                onClick={() => setShowNewPeriodModal(false)}
                className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-xs font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreatePeriodFromPrevious}
                className="px-5 py-2 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] text-black text-xs font-black uppercase"
              >
                Crear Período y Copiar Fichas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3A: ECO B&W SINGLE WEEKLY RECEIPT PREVIEW & PRINT */}
      {printingSlip && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161616] border border-white/15 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-black uppercase text-white">
                  Vista Previa de Recibo ({printingSlip.grupoSemana}) — {printingSlip.empleadoNombre}
                </h3>
                <p className="text-xs text-gray-400">
                  Formato Económico Blanco y Negro listo para imprimir y firmar.
                </p>
              </div>
              <button
                onClick={() => setPrintingSlip(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white text-black p-5 rounded-xl border-2 border-black space-y-3 text-xs max-h-[65vh] overflow-y-auto">
              <div className="flex justify-between border-b-2 border-black pb-2">
                <div>
                  <div className="font-black text-sm uppercase">
                    LA HORMIGA — LIQUIDACIÓN DE HABERES
                  </div>
                  <div className="text-[11px]">
                    {printingSlip.grupoSemana} | {printingSlip.mesTexto} ({printingSlip.rangoFecha})
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-sm uppercase">{printingSlip.empleadoNombre}</div>
                  <div className="text-[11px]">
                    Jornal Base: {formatARS(printingSlip.valorBaseJornal)}
                  </div>
                </div>
              </div>

              <div className="font-bold uppercase text-[11px]">1. Conceptos del Básico</div>
              <table className="w-full border-collapse border border-black text-[11px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black p-1 text-left">Concepto</th>
                    <th className="border border-black p-1 text-center">Unidades</th>
                    <th className="border border-black p-1 text-right">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {printingSlip.basicItems
                    .filter(it => it.unidades > 0 || it.ingreso > 0)
                    .map(it => (
                      <tr key={it.id}>
                        <td className="border border-black p-1">{it.concepto}</td>
                        <td className="border border-black p-1 text-center">{it.unidades}</td>
                        <td className="border border-black p-1 text-right font-mono">
                          {formatARS(it.ingreso)}
                        </td>
                      </tr>
                    ))}
                  <tr className="font-bold bg-gray-50">
                    <td colSpan={2} className="border border-black p-1">
                      SUBTOTAL BÁSICO
                    </td>
                    <td className="border border-black p-1 text-right font-mono">
                      {formatARS(printingSlip.totalBasicoIngresos)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="font-bold uppercase text-[11px] pt-1">
                2. Horas Extras y Descuentos
              </div>
              <table className="w-full border-collapse border border-black text-[11px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black p-1 text-left">Concepto</th>
                    <th className="border border-black p-1 text-center">Cant. / Hs</th>
                    <th className="border border-black p-1 text-right">Ingresos</th>
                    <th className="border border-black p-1 text-right">Egresos</th>
                  </tr>
                </thead>
                <tbody>
                  {orderPayrollExtraItems(printingSlip.extraItems)
                    .filter(it => it.cantidad > 0 || it.ingreso > 0 || it.egreso > 0)
                    .map(it => (
                      <tr key={it.id}>
                        <td className="border border-black p-1">
                          {it.fechaDetalle ? `[${it.fechaDetalle}] ` : ''}
                          {it.concepto}
                        </td>
                        <td className="border border-black p-1 text-center">
                          {it.cantidad > 0 ? `${it.cantidad} hs` : '-'}
                        </td>
                        <td className="border border-black p-1 text-right font-mono">
                          {it.ingreso > 0 ? formatARS(it.ingreso) : '-'}
                        </td>
                        <td className="border border-black p-1 text-right font-mono">
                          {it.egreso > 0 ? formatARS(it.egreso) : '-'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              <div className="border-2 border-black p-2.5 flex justify-between items-center font-black text-sm">
                <span>
                  {printingSlip.etiquetaNeto || 'NETO A COBRAR'} ({printingSlip.grupoSemana})
                </span>
                <span className="font-mono">{formatARS(printingSlip.netoACobrar)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPrintingSlip(null)}
                className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-xs font-bold uppercase"
              >
                Cerrar
              </button>
              <button
                onClick={() => handlePrintSlipReceipt(printingSlip)}
                className="px-5 py-2 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] text-black text-xs font-black uppercase flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> Imprimir Recibo A4 B&W
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3B: CONSOLIDATED MONTHLY RECEIPT (SUMA 1° A 4° SEMANA POR EMPLEADO) */}
      {printingConsolidatedEmp && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161616] border border-white/15 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-black uppercase text-white">
                  Cierre Mensual Acumulado (1° a 4° Semana) — {printingConsolidatedEmp.empleadoNombre}
                </h3>
                <p className="text-xs text-gray-400">
                  Suma todas las fichas semanales del empleado en el período {activePeriod?.nombrePeriodo}.
                </p>
              </div>
              <button
                onClick={() => setPrintingConsolidatedEmp(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white text-black p-5 rounded-xl border-2 border-black space-y-3 text-xs max-h-[65vh] overflow-y-auto">
              <div className="flex justify-between border-b-2 border-black pb-2">
                <div>
                  <div className="font-black text-sm uppercase">
                    LA HORMIGA — RESUMEN MENSUAL DE HABERES (HOJA R)
                  </div>
                  <div className="text-[11px]">
                    Período: {activePeriod?.nombrePeriodo} | Semanas liquidadas:{' '}
                    {printingConsolidatedEmp.fichasCount}
                  </div>
                  {(printingConsolidatedEmp.aliasBancario || printingConsolidatedEmp.cbuBancario) && (
                    <div className="text-[10px] font-mono mt-0.5">
                      {printingConsolidatedEmp.aliasBancario
                        ? `Alias: ${printingConsolidatedEmp.aliasBancario} `
                        : ''}
                      {printingConsolidatedEmp.cbuBancario
                        ? `| CBU: ${printingConsolidatedEmp.cbuBancario}`
                        : ''}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-black text-sm uppercase">
                    {printingConsolidatedEmp.empleadoNombre}
                  </div>
                  <div className="text-[11px]">
                    Jornal Base: {formatARS(printingConsolidatedEmp.valorBaseJornal)}
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse border border-black text-[10.5px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black p-1.5 text-left">Semana</th>
                    <th className="border border-black p-1.5 text-right">Básico</th>
                    <th className="border border-black p-1.5 text-right">Extras</th>
                    <th className="border border-black p-1.5 text-right">Descuentos</th>
                    <th className="border border-black p-1.5 text-right">Total a Cobrar</th>
                    <th className="border border-black p-1.5 text-right">Transf.</th>
                    <th className="border border-black p-1.5 text-right">Efectivo</th>
                    <th className="border border-black p-1.5 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5]
                    .filter(w => printingConsolidatedEmp.porSemana[w])
                    .map(w => {
                      const row = printingConsolidatedEmp.porSemana[w];
                      return (
                        <tr key={w}>
                          <td className="border border-black p-1.5 font-bold">
                            {w}° SEM
                          </td>
                          <td className="border border-black p-1.5 text-right font-mono">
                            {formatARS(row.basico)}
                          </td>
                          <td className="border border-black p-1.5 text-right font-mono">
                            + {formatARS(row.extras)}
                          </td>
                          <td className="border border-black p-1.5 text-right font-mono">
                            - {formatARS(row.descuentosReales)}
                          </td>
                          <td className="border border-black p-1.5 text-right font-mono font-bold">
                            {formatARS(row.totalACobrar)}
                          </td>
                          <td className="border border-black p-1.5 text-right font-mono">
                            {formatARS(row.pagoTransferencia)}
                          </td>
                          <td className="border border-black p-1.5 text-right font-mono">
                            {formatARS(row.pagoEfectivo)}
                          </td>
                          <td className="border border-black p-1.5 text-right font-mono font-bold">
                            {formatARS(row.saldo)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
                <tfoot>
                  <tr className="font-bold bg-gray-100">
                    <td className="border border-black p-1.5">TOTAL MES</td>
                    <td className="border border-black p-1.5 text-right font-mono">
                      {formatARS(printingConsolidatedEmp.totalBasicoMes)}
                    </td>
                    <td className="border border-black p-1.5 text-right font-mono">
                      + {formatARS(printingConsolidatedEmp.totalExtrasMes)}
                    </td>
                    <td className="border border-black p-1.5 text-right font-mono">
                      - {formatARS(printingConsolidatedEmp.totalDescuentosRealesMes)}
                    </td>
                    <td className="border border-black p-1.5 text-right font-mono">
                      {formatARS(printingConsolidatedEmp.totalACobrarMes)}
                    </td>
                    <td className="border border-black p-1.5 text-right font-mono">
                      {formatARS(printingConsolidatedEmp.totalTransfMes)}
                    </td>
                    <td className="border border-black p-1.5 text-right font-mono">
                      {formatARS(printingConsolidatedEmp.totalEfectivoMes)}
                    </td>
                    <td className="border border-black p-1.5 text-right font-mono">
                      {formatARS(printingConsolidatedEmp.totalSaldoMes)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div className="border-2 border-black p-2.5 flex flex-wrap justify-between items-center gap-2 font-black text-xs">
                <span>
                  TOTAL A COBRAR: {formatARS(printingConsolidatedEmp.totalACobrarMes)} | PAGADO:{' '}
                  {formatARS(
                    printingConsolidatedEmp.totalTransfMes +
                      printingConsolidatedEmp.totalEfectivoMes
                  )}
                </span>
                <span className="font-mono text-sm">
                  SALDO: {formatARS(printingConsolidatedEmp.totalSaldoMes)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPrintingConsolidatedEmp(null)}
                className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-xs font-bold uppercase"
              >
                Cerrar
              </button>
              <button
                onClick={() => handlePrintConsolidatedMonthlyReceipt(printingConsolidatedEmp)}
                className="px-5 py-2 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] text-black text-xs font-black uppercase flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> Imprimir Resumen Mensual A4 B&W
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 4: POPUP SELECTOR DE LIBROS / HOJAS DE GOOGLE SHEETS PARA "MES:" */}
      {showTabsSelectorModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161616] border border-white/15 rounded-2xl max-w-xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-black/60 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-[#F0C800]" />
                <div>
                  <h3 className="text-base font-black uppercase text-white">
                    Elegir Libros / Hojas para "MES:"
                  </h3>
                  <p className="text-xs text-gray-400">
                    Planilla: <strong className="text-gray-200">{spreadsheetTitle || 'GRUPO IDN SUELDOS 2026'}</strong> ({tabs.length} libros encontrados)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isApplyingTabsSelection && setShowTabsSelectorModal(false)}
                className="text-gray-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-3 bg-black/30 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-gray-300">
                Marcá los libros que querés ver en la barra <strong className="text-[#F0C800]">MES:</strong> ({draftSelectedTabs.length} seleccionados)
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const monthRegex =
                      /\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b/i;
                    setDraftSelectedTabs(
                      tabs.filter(t => monthRegex.test(t.title)).map(t => t.title)
                    );
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] border border-[#F0C800]/30 text-[11px] font-bold cursor-pointer"
                >
                  Solo Meses
                </button>
                <button
                  type="button"
                  onClick={() => setDraftSelectedTabs(tabs.map(t => t.title))}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-200 text-[11px] font-bold cursor-pointer"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setDraftSelectedTabs([])}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-[11px] font-bold cursor-pointer"
                >
                  Ninguno
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-1.5">
              {tabs.map(t => {
                const isChecked = draftSelectedTabs.includes(t.title);
                const loadedPeriod = periods.find(
                  p =>
                    p.id === `PER-GSHEET-${t.title.toUpperCase().replace(/\s+/g, '-')}` ||
                    (p.sheetTabName || '').toUpperCase() === t.title.toUpperCase()
                );
                return (
                  <button
                    key={t.sheetId}
                    type="button"
                    onClick={() => {
                      setDraftSelectedTabs(prev =>
                        prev.includes(t.title)
                          ? prev.filter(x => x !== t.title)
                          : [...prev, t.title]
                      );
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isChecked
                        ? 'bg-[#F0C800]/15 border-[#F0C800]/50 text-white'
                        : 'bg-black/30 border-white/10 text-gray-400 hover:border-white/25 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-[#F0C800] shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-500 shrink-0" />
                      )}
                      <span className="text-xs font-black uppercase truncate">
                        {t.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {loadedPeriod ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                          En sistema ({loadedPeriod.slips.length} fichas)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-white/5 text-gray-500 text-[10px] font-semibold">
                          Sin cargar
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="px-6 py-4 bg-black/70 border-t border-white/10 space-y-3">
              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={reReadSelectedTabs}
                  onChange={e => setReReadSelectedTabs(e.target.checked)}
                  className="rounded border-white/20 text-[#F0C800] focus:ring-[#F0C800]"
                />
                <span>
                  Releer desde Google Sheets al aplicar (trae montos y fórmulas actualizadas de cada libro marcado)
                </span>
              </label>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-[#F0C800] font-semibold">
                  {tabsSelectionProgress}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTabsSelectorModal(false)}
                    disabled={isApplyingTabsSelection}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold uppercase cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyTabsSelection}
                    disabled={isApplyingTabsSelection}
                    className="px-5 py-2 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] disabled:opacity-60 text-black text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
                  >
                    {isApplyingTabsSelection ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Aplicando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Mostrar Seleccionados en "MES:" ({draftSelectedTabs.length})
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VINCULACIÓN INTELIGENTE CON NÓMINA DE PERSONAL */}
      {showNominaLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#F0C800]/40 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-[#F0C800]/20 via-[#1b1b1b] to-[#141414] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-[#F0C800]" />
                  <h3 className="text-base sm:text-lg font-black uppercase text-white tracking-tight">
                    Vinculación de Planilla de Sueldos con Nómina de Personal
                  </h3>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Detectamos automáticamente el nombre limpio, la fecha de ingreso (F.I.) y el horario desde los encabezados del Sheet y los cruzamos con tus {employees.length} legajos en Supabase.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncAllLinkedToNomina}
                  disabled={isSyncingNomina || nominaStats.linked === 0}
                  className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] disabled:opacity-50 text-black text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer shadow-lg"
                >
                  {isSyncingNomina ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Sincronizando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Sincronizar Todo con Nómina en Supabase ({nominaStats.linked})
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNominaLinkModal(false)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* KPIs & Search Bar */}
            <div className="px-6 py-3 bg-black/50 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-200 font-bold">
                  Empleados en Período ({activePeriod?.nombrePeriodo || 'Actual'}):{' '}
                  <strong className="text-white">{nominaStats.total}</strong>
                </span>
                <span className="px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                  Vinculados a Nómina: <strong>{nominaStats.linked}</strong>
                </span>
                {nominaStats.unlinked > 0 && (
                  <span className="px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                    Sin vincular (nuevos): <strong>{nominaStats.unlinked}</strong>
                  </span>
                )}
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={nominaModalSearch}
                  onChange={e => setNominaModalSearch(e.target.value)}
                  placeholder="Filtrar por nombre en Sheet o legajo..."
                  className="w-full bg-[#1a1a1a] border border-white/15 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                />
              </div>
            </div>

            {/* Table of Employees */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-black/40 border border-white/10 rounded-xl overflow-visible">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-white/10">
                      <th className="py-3 px-3">Encabezado en Sheet</th>
                      <th className="py-3 px-3">Datos Extraídos (Nombre / F.I. / Horario)</th>
                      <th className="py-3 px-3 text-right">Jornal Base Sheet</th>
                      <th className="py-3 px-3 w-80">Legajo Vinculado en Nómina (Supabase)</th>
                      <th className="py-3 px-3 text-center">Partes Diarios</th>
                      <th className="py-3 px-3 text-right">Acciones en Nómina</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-xs">
                    {uniquePayrollEmployeesList
                      .filter(entry => {
                        const q = nominaModalSearch.trim().toLowerCase();
                        if (!q) return true;
                        const matchedName =
                          entry.match.employee?.nombreApellido ||
                          entry.match.employee?.nombre ||
                          '';
                        return (
                          entry.rawHeaderName.toLowerCase().includes(q) ||
                          entry.metadata.cleanName.toLowerCase().includes(q) ||
                          matchedName.toLowerCase().includes(q)
                        );
                      })
                      .map(entry => {
                        const matched = entry.match.employee;
                        const partesInfo = matched ? partesCountByEmployeeId[matched.id] : undefined;
                        return (
                          <tr
                            key={entry.tokenKey}
                            className={`transition-colors ${
                              matched ? 'hover:bg-white/[0.03]' : 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08]'
                            }`}
                          >
                            {/* Raw Header */}
                            <td className="py-3 px-3 align-middle">
                              <div className="font-black text-white uppercase">{entry.rawHeaderName}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {entry.slipsCount} {entry.slipsCount === 1 ? 'ficha semanal' : 'fichas semanales'}
                              </div>
                            </td>

                            {/* Extracted Metadata */}
                            <td className="py-3 px-3 align-middle">
                              <div className="font-bold text-[#F0C800] uppercase">
                                {entry.metadata.cleanName}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {entry.metadata.fechaIngresoDisplay ? (
                                  <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[10px] font-mono">
                                    F.I: {entry.metadata.fechaIngresoDisplay}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-500">Sin fecha en título</span>
                                )}
                                {entry.metadata.horarioTexto && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-mono">
                                    Hor: {entry.metadata.horarioTexto}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Valor Base Jornal */}
                            <td className="py-3 px-3 align-middle text-right font-mono font-bold text-[#F0C800]">
                              {entry.valorBaseJornal > 0 ? formatARS(entry.valorBaseJornal) : '—'}
                            </td>

                            {/* SearchableSelect to Link/Change Employee */}
                            <td className="py-3 px-3 align-middle">
                              <SearchableSelect
                                options={nominaSelectOptions}
                                value={matched?.id || '__NONE__'}
                                onChange={val => handleAssignNominaEmployee(entry, val)}
                                placeholder="Buscar empleado en Nómina..."
                              />
                              {matched && (
                                <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1 px-1">
                                  <span>
                                    {matched.codigoEmpleado || matched.legajo || 'S/C'} •{' '}
                                    {matched.fechaAlta ? `Alta: ${matched.fechaAlta}` : 'Sin F.Alta en legajo'}
                                  </span>
                                  <span className="text-emerald-400 font-semibold">
                                    {entry.match.matchType === 'manual'
                                      ? 'Vínculo Manual'
                                      : 'Auto-Match Inteligente'}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Partes Diarios count */}
                            <td className="py-3 px-3 align-middle text-center">
                              {matched && partesInfo && partesInfo.count > 0 ? (
                                <span className="inline-flex flex-col items-center px-2 py-0.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[10px] font-mono">
                                  <strong>{partesInfo.count} partes</strong>
                                  <span>{partesInfo.totalHours} hs</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-500">—</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-3 align-middle text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {matched ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleSyncSingleEmployeeToNomina(entry)}
                                      disabled={isSyncingNomina}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase transition-colors cursor-pointer"
                                      title="Actualizar Fecha de Ingreso y Jornal Base en el legajo de este empleado en Supabase"
                                    >
                                      Actualizar Legajo
                                    </button>
                                    {onViewEmployee && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowNominaLinkModal(false);
                                          onViewEmployee(matched);
                                        }}
                                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition-colors cursor-pointer"
                                        title="Abrir ficha completa en Nómina de Personal"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleCreateEmployeeInNomina(entry)}
                                    disabled={isSyncingNomina}
                                    className="px-3 py-1.5 rounded-lg bg-[#F0C800] hover:bg-[#d8b400] disabled:opacity-50 text-black text-[10px] font-black uppercase flex items-center gap-1 transition-colors cursor-pointer shadow"
                                    title="Dar de alta automáticamente en la tabla de Nómina de Personal (drivers) en Supabase con su nombre limpio, fecha de ingreso y jornal base"
                                  >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    <span>+ Alta en Nómina</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-black/70 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-gray-400">
                Todos los vínculos y altas impactan directamente en las tablas <code className="text-[#F0C800]">drivers</code> y{' '}
                <code className="text-[#F0C800]">system_settings</code> de Supabase PostgreSQL.
              </div>
              <button
                type="button"
                onClick={() => setShowNominaLinkModal(false)}
                className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-black uppercase cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
