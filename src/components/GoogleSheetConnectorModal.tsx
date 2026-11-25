import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ArrowRightLeft,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Upload,
  Download,
  AlertTriangle,
  Link2,
  Database,
  Calendar,
  Truck,
  Search,
  Filter,
  RotateCcw,
  Save,
  Sparkles,
  CheckSquare,
  Square,
  Layers,
  GitMerge,
  Copy,
} from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';
import {
  CombinedItemEntry,
  ENTITY_CONFIGS,
  ImportTransformContext,
  SheetJoinStrategy,
  TwoSheetCombineStats,
  combineTwoSheetTransformedItems,
  detectDateOrderFromSamples,
  extractDateFromRawRow,
  getEntityJoinKey,
  getSmartColumnMapping,
  getSystemFieldDefinitions,
  mergeEntityRecords,
  normalizeDateValue,
  transformImportedRows,
} from '../services/importExportService';
import {
  ModuleSheetConfigKey,
  OperationalSheetConfig,
  SecondarySheetConfig,
  SheetTabInfo,
  extractSpreadsheetId,
  fetchOperationalSheetConfigFromDb,
  fetchSheetTabValues,
  fetchSpreadsheetMetadata,
  getAccessToken,
  getCurrentGoogleUser,
  googleSignIn,
  logoutGoogle,
  PUBLIC_LINK_TOKEN,
  fetchPublicWorkbookMetadata,
  saveOperationalSheetConfigToDb,
  syncCollectionStrictToSupabase,
  writeTableToGoogleSheetTab,
} from '../services/googleSheetsAuth';
import {
  buildSheetMatrixFromEntities,
  detectBestHeaderRow,
  sheetGridToRawObjects,
} from '../utils/sheetTableParser';

export type SheetSyncEntity = 'expendio' | 'vales' | 'partesDiarios' | 'gastosMantenimiento';

interface GoogleSheetConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: SheetSyncEntity;
  existingData: any[];
  context?: ImportTransformContext;
  onSyncedSuccess: (persistedItems: any[], savedConfig: OperationalSheetConfig) => void;
  onShowToast?: (message: string) => void;
}

const SPANISH_MONTH_LABELS: Record<string, string> = {
  '01': 'Enero',
  '02': 'Febrero',
  '03': 'Marzo',
  '04': 'Abril',
  '05': 'Mayo',
  '06': 'Junio',
  '07': 'Julio',
  '08': 'Agosto',
  '09': 'Septiembre',
  '10': 'Octubre',
  '11': 'Noviembre',
  '12': 'Diciembre',
};

const ENTITY_META: Record<
  SheetSyncEntity,
  {
    title: string;
    subtitle: string;
    configKey: ModuleSheetConfigKey;
    tableName: 'fuel_vouchers' | 'issued_vouchers' | 'partes_diarios' | 'vehicle_expenses';
  }
> = {
  expendio: {
    title: 'Google Sheet — Expendio de Combustible',
    subtitle:
      'Emparejá columnas, filtrá por fecha o vehículo, elegí las filas exactas y sincronizá directo con Supabase.',
    configKey: 'fuel_sheets_config',
    tableName: 'fuel_vouchers',
  },
  vales: {
    title: 'Google Sheet — Vales de Combustible',
    subtitle:
      'Emparejá columnas, filtrá por fecha o vehículo, elegí qué vales importar y sincronizá con Supabase.',
    configKey: 'vales_sheets_config',
    tableName: 'issued_vouchers',
  },
  partesDiarios: {
    title: 'Google Sheet — Partes Diarios de Equipos',
    subtitle:
      'Conectá una hoja de Google Sheets, filtrá por fecha o equipo, elegí filas y sincronizá en Supabase.',
    configKey: 'partes_sheets_config',
    tableName: 'partes_diarios',
  },
  gastosMantenimiento: {
    title: 'Google Sheet — Gastos de Mantenimiento & Repuestos',
    subtitle:
      'Adaptá tu hoja histórica de Mantenimiento a nuestro sistema, ignorá columnas sobrantes (ej. FOTO), dejá datos viejos incompletos sin perder historial y sincronizá en Supabase.',
    configKey: 'maintenance_sheets_config',
    tableName: 'vehicle_expenses',
  },
};

interface IndexedSheetRow {
  entryKey: string;
  sourceOrigin: 'H1' | 'H2' | 'H1+H2';
  rowNumber: number;
  secondaryRowNumber?: number;
  raw: Record<string, string>;
  secondaryRaw?: Record<string, string>;
  previewItem: any;
  isoDate: string;
  monthKey: string;
  marcaModelo: string;
  codigoEquipo: string;
  sheetTipo: string;
  joinId: string;
  searchText: string;
}

export const GoogleSheetConnectorModal: React.FC<GoogleSheetConnectorModalProps> = ({
  isOpen,
  onClose,
  entity,
  existingData,
  context,
  onSyncedSuccess,
  onShowToast,
}) => {
  const meta = ENTITY_META[entity];
  const systemFields = useMemo(() => getSystemFieldDefinitions(entity), [entity]);

  // Auth session (strictly in-memory token via googleSheetsAuth.ts)
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string>('');

  // Primary Spreadsheet & Tab Config
  const [sheetUrlInput, setSheetUrlInput] = useState<string>('');
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>('');
  const [tabs, setTabs] = useState<SheetTabInfo[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>('');
  const [savedConfig, setSavedConfig] = useState<OperationalSheetConfig | null>(null);

  // Primary Grid & Column Mapping
  const [rawGrid, setRawGrid] = useState<string[][]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [showMappingPanel, setShowMappingPanel] = useState<boolean>(true);
  const [mappingSearch, setMappingSearch] = useState<string>('');
  const [dateOrderPref, setDateOrderPref] = useState<'auto' | 'dmy' | 'mdy'>('auto');
  const [syncMode, setSyncMode] = useState<'merge' | 'replace'>('merge');

  // Secondary Spreadsheet & Tab Config (for combining 2 sheets by shared ID)
  const [enableSecondarySheet, setEnableSecondarySheet] = useState<boolean>(false);
  const [secUrlInput, setSecUrlInput] = useState<string>('');
  const [secSpreadsheetId, setSecSpreadsheetId] = useState<string>('');
  const [secSpreadsheetTitle, setSecSpreadsheetTitle] = useState<string>('');
  const [secTabs, setSecTabs] = useState<SheetTabInfo[]>([]);
  const [secSelectedTab, setSecSelectedTab] = useState<string>('');
  const [secRawGrid, setSecRawGrid] = useState<string[][]>([]);
  const [secHeaderRowIndex, setSecHeaderRowIndex] = useState<number>(0);
  const [secColumnMapping, setSecColumnMapping] = useState<Record<string, string>>({});
  const [secDateOrderPref, setSecDateOrderPref] = useState<'auto' | 'dmy' | 'mdy'>('auto');
  const [secSelectedTipo, setSecSelectedTipo] = useState<string>('ALL');
  const [joinStrategy, setJoinStrategy] = useState<SheetJoinStrategy>('outer');
  const [isLoadingSecSheet, setIsLoadingSecSheet] = useState<boolean>(false);
  const [secErrorMsg, setSecErrorMsg] = useState<string | null>(null);

  // Row Filtering & Selection
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedMarcasModelos, setSelectedMarcasModelos] = useState<string[]>([]);
  const [selectedSheetTipo, setSelectedSheetTipo] = useState<string>('ALL');
  const [vehicleTypeSearch, setVehicleTypeSearch] = useState<string>('');
  const [generalSearch, setGeneralSearch] = useState<string>('');
  const [onlyShowSelected, setOnlyShowSelected] = useState<boolean>(false);
  const [onlyIncompleteRows, setOnlyIncompleteRows] = useState<boolean>(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());

  // UI Status
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(false);
  const [isLoadingSheet, setIsLoadingSheet] = useState<boolean>(false);
  const [isSavingMappingOnly, setIsSavingMappingOnly] = useState<boolean>(false);
  const [isSavingSupabase, setIsSavingSupabase] = useState<boolean>(false);
  const [isWritingSheet, setIsWritingSheet] = useState<boolean>(false);
  const [showPushConfirm, setShowPushConfirm] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetFilters = () => {
    setSelectedMonth('ALL');
    setDateFrom('');
    setDateTo('');
    setSelectedMarcasModelos([]);
    setSelectedSheetTipo('ALL');
    setVehicleTypeSearch('');
    setGeneralSearch('');
    setOnlyShowSelected(false);
    setOnlyIncompleteRows(false);
  };

  // Load persisted config from Supabase & check active Google token whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    setErrorMsg(null);
    setSuccessMsg(null);
    setSecErrorMsg(null);
    setRawGrid([]);
    setSecRawGrid([]);
    setShowPushConfirm(false);
    setShowMappingPanel(true);
    setMappingSearch('');
    resetFilters();
    setSelectedRowKeys(new Set());

    const bootstrap = async () => {
      setIsLoadingConfig(true);
      try {
        const [token, user, cfg] = await Promise.all([
          getAccessToken(),
          Promise.resolve(getCurrentGoogleUser()),
          fetchOperationalSheetConfigFromDb(meta.configKey),
        ]);

        if (cancelled) return;

        if (token) {
          setAccessToken(token);
          setConnectedEmail(user?.email || cfg?.connectedEmail || 'Cuenta Google Conectada');
        } else {
          setAccessToken(null);
          setConnectedEmail(cfg?.connectedEmail || '');
        }

        if (cfg) {
          setSavedConfig(cfg);
          setSheetUrlInput(cfg.spreadsheetUrl || cfg.spreadsheetId || '');
          setSpreadsheetId(cfg.spreadsheetId || extractSpreadsheetId(cfg.spreadsheetUrl || ''));
          setSpreadsheetTitle(cfg.spreadsheetTitle || '');
          setTabs(Array.isArray(cfg.availableTabs) ? cfg.availableTabs : []);
          setSelectedTab(cfg.selectedTabTitle || '');
          if (typeof cfg.headerRowIndex === 'number') setHeaderRowIndex(cfg.headerRowIndex);
          if (cfg.columnMapping) setColumnMapping(cfg.columnMapping);
          if (cfg.dateOrder) setDateOrderPref(cfg.dateOrder);
          if (cfg.syncMode) setSyncMode(cfg.syncMode);

          const secCfg = cfg.secondarySheet;
          if (secCfg) {
            setEnableSecondarySheet(Boolean(secCfg.enabled));
            setSecUrlInput(secCfg.spreadsheetUrl || secCfg.spreadsheetId || '');
            setSecSpreadsheetId(secCfg.spreadsheetId || extractSpreadsheetId(secCfg.spreadsheetUrl || ''));
            setSecSpreadsheetTitle(secCfg.spreadsheetTitle || '');
            setSecTabs(Array.isArray(secCfg.availableTabs) ? secCfg.availableTabs : []);
            setSecSelectedTab(secCfg.selectedTabTitle || '');
            setSecHeaderRowIndex(typeof secCfg.headerRowIndex === 'number' ? secCfg.headerRowIndex : 0);
            const rawSecMap = secCfg.columnMapping || {};
            const cleanedSecMap =
              rawSecMap['VIAJES_CANTIDAD'] === 'CANTIDAD' &&
              rawSecMap['HORAS TRABAJADAS'] === 'CANTIDAD'
                ? { ...rawSecMap, VIAJES_CANTIDAD: '' }
                : rawSecMap;
            setSecColumnMapping(cleanedSecMap);
            setSecDateOrderPref(secCfg.dateOrder || 'auto');
            setSecSelectedTipo(secCfg.selectedTipo || 'ALL');
            setJoinStrategy(secCfg.joinStrategy || 'outer');
          } else {
            setEnableSecondarySheet(false);
            setSecUrlInput('');
            setSecSpreadsheetId('');
            setSecSpreadsheetTitle('');
            setSecTabs([]);
            setSecSelectedTab('');
            setSecHeaderRowIndex(0);
            setSecColumnMapping({});
            setSecDateOrderPref('auto');
            setSecSelectedTipo('ALL');
            setJoinStrategy('outer');
          }
        } else {
          setSavedConfig(null);
          setSheetUrlInput('');
          setSpreadsheetId('');
          setSpreadsheetTitle('');
          setTabs([]);
          setSelectedTab('');
          setHeaderRowIndex(0);
          setColumnMapping({});
          setDateOrderPref('auto');
          setSyncMode('merge');
          setEnableSecondarySheet(false);
          setSecUrlInput('');
          setSecSpreadsheetId('');
          setSecSpreadsheetTitle('');
          setSecTabs([]);
          setSecSelectedTab('');
          setSecHeaderRowIndex(0);
          setSecColumnMapping({});
          setSecDateOrderPref('auto');
          setSecSelectedTipo('ALL');
          setJoinStrategy('outer');
        }
      } finally {
        if (!cancelled) setIsLoadingConfig(false);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [isOpen, entity, meta.configKey]);

  // Parse primary rawGrid whenever rawGrid or headerRowIndex changes
  const parsedTable = useMemo(() => {
    if (!rawGrid || rawGrid.length === 0) {
      return {
        headers: [] as string[],
        rawRows: [] as Record<string, string>[],
        rowNumbers: [] as number[],
      };
    }
    return sheetGridToRawObjects(rawGrid, headerRowIndex);
  }, [rawGrid, headerRowIndex]);

  // Parse secondary rawGrid whenever secRawGrid or secHeaderRowIndex changes
  const secParsedTable = useMemo(() => {
    if (!enableSecondarySheet || !secRawGrid || secRawGrid.length === 0) {
      return {
        headers: [] as string[],
        rawRows: [] as Record<string, string>[],
        rowNumbers: [] as number[],
      };
    }
    return sheetGridToRawObjects(secRawGrid, secHeaderRowIndex);
  }, [enableSecondarySheet, secRawGrid, secHeaderRowIndex]);

  // Detect TIPO column for mixed sheets like GASTOS POR EQUIPOS (VENTA vs COMBUSTIBLE vs MANTENIMIENTO)
  const sheetTipoCol = useMemo(() => {
    return parsedTable.headers.find(h => h.trim().toUpperCase() === 'TIPO') || '';
  }, [parsedTable.headers]);

  const sheetTipoAnalysis = useMemo(() => {
    const counts = new Map<string, number>();
    if (!sheetTipoCol) {
      return { options: [] as { value: string; count: number }[], isMixedGastosSheet: false };
    }
    parsedTable.rawRows.forEach(r => {
      const val = String(r[sheetTipoCol] || '').trim().toUpperCase() || 'SIN_TIPO';
      counts.set(val, (counts.get(val) || 0) + 1);
    });
    const options = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
    const hasVenta = counts.has('VENTA');
    const hasOtherOps = counts.has('COMBUSTIBLE') || counts.has('MANTENIMIENTO') || counts.has('GASTO') || counts.size > 1;
    const isMixedGastosSheet = entity === 'partesDiarios' && hasVenta && hasOtherOps;
    return { options, isMixedGastosSheet };
  }, [parsedTable.rawRows, sheetTipoCol, entity]);

  // Detect TIPO column on Secondary Sheet
  const secTipoCol = useMemo(() => {
    return secParsedTable.headers.find(h => h.trim().toUpperCase() === 'TIPO') || '';
  }, [secParsedTable.headers]);

  const secTipoAnalysis = useMemo(() => {
    const counts = new Map<string, number>();
    if (!secTipoCol) {
      return { options: [] as { value: string; count: number }[], isMixedGastosSheet: false };
    }
    secParsedTable.rawRows.forEach(r => {
      const val = String(r[secTipoCol] || '').trim().toUpperCase() || 'SIN_TIPO';
      counts.set(val, (counts.get(val) || 0) + 1);
    });
    const options = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
    const hasVenta = counts.has('VENTA');
    const hasOtherOps = counts.has('COMBUSTIBLE') || counts.has('MANTENIMIENTO') || counts.has('GASTO') || counts.size > 1;
    const isMixedGastosSheet = entity === 'partesDiarios' && hasVenta && hasOtherOps;
    return { options, isMixedGastosSheet };
  }, [secParsedTable.rawRows, secTipoCol, entity]);

  useEffect(() => {
    if (secParsedTable.rawRows.length > 0 && secTipoAnalysis.isMixedGastosSheet) {
      setSecSelectedTipo('VENTA');
    } else if (secParsedTable.rawRows.length > 0) {
      setSecSelectedTipo('ALL');
    }
  }, [secParsedTable.rawRows, secTipoAnalysis.isMixedGastosSheet]);

  // Resolve active Date column & effective DMY/MDY order for Primary & Secondary sheets
  const primaryDateSysKey = entity === 'vales' ? 'FECHA_EMISION' : 'FECHA';
  const mappedDateCol =
    columnMapping[primaryDateSysKey] ||
    columnMapping['FECHA'] ||
    columnMapping['FECHA_EMISION'] ||
    '';

  const secMappedDateCol =
    secColumnMapping[primaryDateSysKey] ||
    secColumnMapping['FECHA'] ||
    secColumnMapping['FECHA_EMISION'] ||
    '';

  const effectiveDateOrder = useMemo<'dmy' | 'mdy'>(() => {
    if (dateOrderPref === 'dmy' || dateOrderPref === 'mdy') return dateOrderPref;
    if (parsedTable.rawRows.length === 0) return 'dmy';
    const sampleVals = parsedTable.rawRows
      .slice(0, 80)
      .map(r => (mappedDateCol ? r[mappedDateCol] : r['FECHA'] || r['Fecha'] || r['FECHA_EMISION']));
    return detectDateOrderFromSamples(sampleVals);
  }, [dateOrderPref, parsedTable.rawRows, mappedDateCol]);

  const secEffectiveDateOrder = useMemo<'dmy' | 'mdy'>(() => {
    if (secDateOrderPref === 'dmy' || secDateOrderPref === 'mdy') return secDateOrderPref;
    if (secParsedTable.rawRows.length === 0) return 'dmy';
    const sampleVals = secParsedTable.rawRows
      .slice(0, 80)
      .map(r => (secMappedDateCol ? r[secMappedDateCol] : r['FECHA'] || r['Fecha'] || r['FECHA_EMISION']));
    return detectDateOrderFromSamples(sampleVals);
  }, [secDateOrderPref, secParsedTable.rawRows, secMappedDateCol]);

  // Build fleet lookup map so MARCA_MODELO enriches from Fleet even when Excel only brings CODIGO_EQUIPO or PATENTE
  const fleetLookup = useMemo(() => {
    const byCode = new Map<string, string>();
    const byPlate = new Map<string, string>();
    if (Array.isArray(context?.fleet)) {
      context.fleet.forEach((v: any) => {
        const model = String(v?.modeloMarca || '').trim();
        if (!model) return;
        [v.codigoEquipo, v.codigo, v.id, v.codigoInterno].forEach(c => {
          const norm = String(c || '').trim().toUpperCase();
          if (norm) byCode.set(norm, model);
        });
        const pat = String(v?.patente || '').trim().toUpperCase();
        if (pat && pat !== 'S/P') byPlate.set(pat, model);
      });
    }
    return { byCode, byPlate };
  }, [context?.fleet]);

  // First non-empty example value for every Excel column (Primary & Secondary)
  const columnSampleValues = useMemo(() => {
    const samples: Record<string, string> = {};
    for (const h of parsedTable.headers) {
      for (let i = 0; i < Math.min(parsedTable.rawRows.length, 40); i++) {
        const val = String(parsedTable.rawRows[i]?.[h] || '').trim();
        if (val) {
          samples[h] = val;
          break;
        }
      }
    }
    return samples;
  }, [parsedTable.headers, parsedTable.rawRows]);

  const secColumnSampleValues = useMemo(() => {
    const samples: Record<string, string> = {};
    for (const h of secParsedTable.headers) {
      for (let i = 0; i < Math.min(secParsedTable.rawRows.length, 40); i++) {
        const val = String(secParsedTable.rawRows[i]?.[h] || '').trim();
        if (val) {
          samples[h] = val;
          break;
        }
      }
    }
    return samples;
  }, [secParsedTable.headers, secParsedTable.rawRows]);

  // Transform Primary sheet rows once per sheet/mapping/dateOrder change
  const primaryTransformedItems = useMemo(() => {
    if (parsedTable.rawRows.length === 0) return [] as any[];
    return transformImportedRows(
      entity,
      parsedTable.rawRows,
      [],
      'replace',
      columnMapping,
      { ...context, dateOrder: effectiveDateOrder }
    ).validItems;
  }, [entity, parsedTable.rawRows, columnMapping, context, effectiveDateOrder]);

  // Filter & transform Secondary sheet rows (respecting TIPO = VENTA filter when mixed Gastos sheet)
  const secFilteredMeta = useMemo(() => {
    if (!enableSecondarySheet || secParsedTable.rawRows.length === 0) {
      return {
        rawRows: [] as Record<string, string>[],
        rowNumbers: [] as number[],
        transformedItems: [] as any[],
      };
    }

    const filteredRaw: Record<string, string>[] = [];
    const filteredRowNums: number[] = [];

    secParsedTable.rawRows.forEach((raw, idx) => {
      if (secSelectedTipo !== 'ALL' && secTipoCol) {
        const val = String(raw[secTipoCol] || '').trim().toUpperCase() || 'SIN_TIPO';
        if (val !== secSelectedTipo) return;
      }
      filteredRaw.push(raw);
      filteredRowNums.push(secParsedTable.rowNumbers[idx] ?? idx + secHeaderRowIndex + 2);
    });

    const transformedItems =
      filteredRaw.length > 0
        ? transformImportedRows(
            entity,
            filteredRaw,
            [],
            'replace',
            secColumnMapping,
            { ...context, dateOrder: secEffectiveDateOrder }
          ).validItems
        : [];

    return {
      rawRows: filteredRaw,
      rowNumbers: filteredRowNums,
      transformedItems,
    };
  }, [
    enableSecondarySheet,
    secParsedTable.rawRows,
    secParsedTable.rowNumbers,
    secHeaderRowIndex,
    secSelectedTipo,
    secTipoCol,
    entity,
    secColumnMapping,
    context,
    secEffectiveDateOrder,
  ]);

  // Combine Primary & Secondary transformed items by shared ID when 2-sheet combine is enabled
  const twoSheetCombinedState = useMemo<{
    active: boolean;
    entries: CombinedItemEntry<any>[];
    stats: TwoSheetCombineStats | null;
  }>(() => {
    if (
      !enableSecondarySheet ||
      parsedTable.rawRows.length === 0 ||
      secFilteredMeta.rawRows.length === 0
    ) {
      return { active: false, entries: [], stats: null };
    }

    const priIdCol = columnMapping['ID'] || '';
    const secIdCol = secColumnMapping['ID'] || '';

    const priPairs = primaryTransformedItems.map((item, idx) => {
      const raw = parsedTable.rawRows[idx] || {};
      const joinId = String((priIdCol ? raw[priIdCol] : raw['ID']) || '').trim();
      return { item, joinId };
    });

    const secPairs = secFilteredMeta.transformedItems.map((item, idx) => {
      const raw = secFilteredMeta.rawRows[idx] || {};
      const joinId = String((secIdCol ? raw[secIdCol] : raw['ID']) || '').trim();
      return { item, joinId };
    });

    const result = combineTwoSheetTransformedItems(entity, priPairs, secPairs, joinStrategy);
    return {
      active: true,
      entries: result.entries,
      stats: result.stats,
    };
  }, [
    enableSecondarySheet,
    parsedTable.rawRows,
    secFilteredMeta.rawRows,
    secFilteredMeta.transformedItems,
    primaryTransformedItems,
    columnMapping,
    secColumnMapping,
    entity,
    joinStrategy,
  ]);

  // Build unified indexed rows (supporting both 1-sheet and combined 2-sheet modes)
  const indexedRows: IndexedSheetRow[] = useMemo(() => {
    const resolveEquipDisplay = (raw: Record<string, string>, mapCfg: Record<string, string>, item: any) => {
      const marcaCol = mapCfg['MARCA_MODELO'] || '';
      const eqCol = mapCfg['CODIGO_EQUIPO'] || '';
      const patCol = mapCfg['PATENTE'] || '';

      const codigoEquipo = String(
        item?.codigoEquipo ||
          item?.equipoPatenteOrCodigo ||
          (eqCol ? raw[eqCol] : raw['CODIGO_EQUIPO'] || raw['EQUIPO']) ||
          ''
      ).trim();
      const patente = String(item?.patente || (patCol ? raw[patCol] : raw['PATENTE']) || '').trim();
      let marcaModelo = String(
        item?.marcaModelo ||
          item?.equipoModeloMarca ||
          (marcaCol
            ? raw[marcaCol]
            : raw['MARCA_MODELO'] || raw['MODELO_MARCA'] || raw['MODELO'] || raw['VEHICULO']) ||
          ''
      ).trim();

      if (!marcaModelo || marcaModelo.toUpperCase() === 'EQUIPO FLOTA' || marcaModelo.toUpperCase() === 'SIN EQUIPO ASIGNADO') {
        const fromCode = codigoEquipo ? fleetLookup.byCode.get(codigoEquipo.toUpperCase()) : '';
        const fromPat =
          patente && patente.toUpperCase() !== 'S/P'
            ? fleetLookup.byPlate.get(patente.toUpperCase())
            : '';
        marcaModelo = fromCode || fromPat || marcaModelo;
      }

      return {
        codigoEquipo,
        marcaModelo: marcaModelo || 'Sin Marca/Modelo',
      };
    };

    if (twoSheetCombinedState.active) {
      const priIdCol = columnMapping['ID'] || '';
      const secIdCol = secColumnMapping['ID'] || '';

      return twoSheetCombinedState.entries.map((entry, idx) => {
        const hasPri = entry.primaryIndex !== undefined;
        const hasSec = entry.secondaryIndex !== undefined;
        const priRaw = hasPri ? parsedTable.rawRows[entry.primaryIndex!] || {} : {};
        const secRaw = hasSec ? secFilteredMeta.rawRows[entry.secondaryIndex!] || {} : {};

        const priRowNum = hasPri
          ? parsedTable.rowNumbers[entry.primaryIndex!] ?? entry.primaryIndex! + headerRowIndex + 2
          : 0;
        const secRowNum = hasSec
          ? secFilteredMeta.rowNumbers[entry.secondaryIndex!] ?? entry.secondaryIndex! + secHeaderRowIndex + 2
          : 0;

        const entryKey = hasPri ? `H1:${priRowNum}` : `H2:${secRowNum || idx + 1}`;
        const item = entry.item;

        const itemIso = String(item?.fecha || item?.fechaEmision || '').trim();
        const rawDatePri = hasPri && mappedDateCol ? priRaw[mappedDateCol] : '';
        const rawDateSec = hasSec && secMappedDateCol ? secRaw[secMappedDateCol] : '';
        const isoDate =
          (/^\d{4}-\d{2}-\d{2}$/.test(itemIso) ? itemIso : '') ||
          (rawDatePri ? normalizeDateValue(rawDatePri, effectiveDateOrder) : '') ||
          (rawDateSec ? normalizeDateValue(rawDateSec, secEffectiveDateOrder) : '') ||
          extractDateFromRawRow(hasPri ? priRaw : secRaw, entity, hasPri ? effectiveDateOrder : secEffectiveDateOrder);
        const monthKey = /^\d{4}-\d{2}/.test(isoDate) ? isoDate.slice(0, 7) : 'SIN_FECHA';

        const eqDisplay = resolveEquipDisplay(
          hasPri ? priRaw : secRaw,
          hasPri ? columnMapping : secColumnMapping,
          item
        );

        const priTipo =
          hasPri && sheetTipoCol
            ? String(priRaw[sheetTipoCol] || '').trim().toUpperCase()
            : '';
        const secTipo =
          hasSec && secTipoCol
            ? String(secRaw[secTipoCol] || '').trim().toUpperCase()
            : '';
        const sheetTipo = priTipo || secTipo || '';

        const joinId = String(
          (hasPri ? (priIdCol ? priRaw[priIdCol] : priRaw['ID']) : '') ||
            (hasSec ? (secIdCol ? secRaw[secIdCol] : secRaw['ID']) : '') ||
            item?.id ||
            ''
        ).trim();

        const searchText = [
          ...Object.values(priRaw),
          ...Object.values(secRaw),
          item?.detalleTipo || '',
          item?.detalle2 || '',
          item?.estadoCobro || '',
          item?.obra || '',
          joinId,
        ]
          .join(' ')
          .toLowerCase();

        return {
          entryKey,
          sourceOrigin: entry.sourceTag,
          rowNumber: hasPri ? priRowNum : secRowNum,
          secondaryRowNumber: hasSec ? secRowNum : undefined,
          raw: hasPri ? priRaw : secRaw,
          secondaryRaw: hasSec ? secRaw : undefined,
          previewItem: item,
          isoDate,
          monthKey,
          marcaModelo: eqDisplay.marcaModelo,
          codigoEquipo: eqDisplay.codigoEquipo,
          sheetTipo,
          joinId,
          searchText,
        };
      });
    }

    // Single-sheet mode (Hoja 1)
    const idCol = columnMapping['ID'] || '';
    return parsedTable.rawRows.map((raw, i) => {
      const rowNumber = parsedTable.rowNumbers[i] ?? i + headerRowIndex + 2;
      const item = primaryTransformedItems[i];
      const rawDateVal = mappedDateCol ? raw[mappedDateCol] : '';
      const isoDate = rawDateVal
        ? normalizeDateValue(rawDateVal, effectiveDateOrder)
        : extractDateFromRawRow(raw, entity, effectiveDateOrder);
      const monthKey = /^\d{4}-\d{2}/.test(isoDate) ? isoDate.slice(0, 7) : 'SIN_FECHA';

      const eqDisplay = resolveEquipDisplay(raw, columnMapping, item);
      const searchText = Object.values(raw).join(' ').toLowerCase();
      const sheetTipo = sheetTipoCol
        ? String(raw[sheetTipoCol] || '').trim().toUpperCase() || 'SIN_TIPO'
        : '';
      const joinId = String((idCol ? raw[idCol] : raw['ID']) || item?.id || '').trim();

      return {
        entryKey: `H1:${rowNumber}`,
        sourceOrigin: 'H1' as const,
        rowNumber,
        raw,
        previewItem: item,
        isoDate,
        monthKey,
        marcaModelo: eqDisplay.marcaModelo,
        codigoEquipo: eqDisplay.codigoEquipo,
        sheetTipo,
        joinId,
        searchText,
      };
    });
  }, [
    twoSheetCombinedState,
    parsedTable.rawRows,
    parsedTable.rowNumbers,
    primaryTransformedItems,
    secFilteredMeta.rawRows,
    secFilteredMeta.rowNumbers,
    headerRowIndex,
    secHeaderRowIndex,
    mappedDateCol,
    secMappedDateCol,
    effectiveDateOrder,
    secEffectiveDateOrder,
    entity,
    columnMapping,
    secColumnMapping,
    fleetLookup,
    sheetTipoCol,
    secTipoCol,
  ]);

  // Auto-select rows cleanly whenever indexedRows or TIPO mix changes
  useEffect(() => {
    if (indexedRows.length === 0) {
      setSelectedSheetTipo('ALL');
      setSelectedRowKeys(new Set());
      return;
    }

    if (!twoSheetCombinedState.active && sheetTipoAnalysis.isMixedGastosSheet) {
      setSelectedSheetTipo('VENTA');
      const ventaKeys = indexedRows
        .filter(r => r.sheetTipo === 'VENTA')
        .map(r => r.entryKey);
      setSelectedRowKeys(new Set(ventaKeys));
    } else {
      setSelectedSheetTipo('ALL');
      setSelectedRowKeys(new Set(indexedRows.map(r => r.entryKey)));
    }
  }, [indexedRows, twoSheetCombinedState.active, sheetTipoAnalysis.isMixedGastosSheet]);

  // Available months extracted from mapped Date column
  const monthOptions = useMemo(() => {
    const counts = new Map<string, number>();
    indexedRows.forEach(r => {
      counts.set(r.monthKey, (counts.get(r.monthKey) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([key, count]) => {
        if (key === 'SIN_FECHA') {
          return { key, label: `Sin fecha válida (${count})`, count };
        }
        const [y, m] = key.split('-');
        const mLabel = SPANISH_MONTH_LABELS[m] || m;
        return { key, label: `${mLabel} ${y} (${count})`, count };
      })
      .sort((a, b) => {
        if (a.key === 'SIN_FECHA') return 1;
        if (b.key === 'SIN_FECHA') return -1;
        return b.key.localeCompare(a.key);
      });
  }, [indexedRows]);

  // Available MARCA_MODELO options extracted from mapped column + Fleet enrichment
  const marcaModeloOptions = useMemo(() => {
    const counts = new Map<string, number>();
    indexedRows.forEach(r => {
      counts.set(r.marcaModelo, (counts.get(r.marcaModelo) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [indexedRows]);

  const hasActiveFilter = Boolean(
    selectedMonth !== 'ALL' ||
      dateFrom ||
      dateTo ||
      selectedMarcasModelos.length > 0 ||
      (sheetTipoAnalysis.isMixedGastosSheet && !twoSheetCombinedState.active
        ? selectedSheetTipo !== 'VENTA'
        : selectedSheetTipo !== 'ALL') ||
      vehicleTypeSearch.trim() ||
      generalSearch.trim() ||
      onlyShowSelected ||
      onlyIncompleteRows
  );

  // Filtered rows according to Fecha, TIPO (VENTA/RUBRO), MARCA_MODELO (multi-select), vehicle type search, general search, and optional selection filter
  const filteredEntries = useMemo(() => {
    const vQuery = vehicleTypeSearch.trim().toLowerCase();
    const gQuery = generalSearch.trim().toLowerCase();
    const selectedModelsSet = new Set(selectedMarcasModelos);

    return indexedRows.filter(entry => {
      if (selectedSheetTipo !== 'ALL' && entry.sheetTipo !== selectedSheetTipo) return false;
      if (selectedMonth !== 'ALL' && entry.monthKey !== selectedMonth) return false;
      if (dateFrom && (!entry.isoDate || entry.isoDate < dateFrom)) return false;
      if (dateTo && (!entry.isoDate || entry.isoDate > dateTo)) return false;
      if (selectedModelsSet.size > 0 && !selectedModelsSet.has(entry.marcaModelo)) return false;
      if (vQuery) {
        const hay = `${entry.marcaModelo} ${entry.codigoEquipo}`.toLowerCase();
        if (!hay.includes(vQuery)) return false;
      }
      if (gQuery && !entry.searchText.includes(gQuery)) return false;
      if (onlyShowSelected && !selectedRowKeys.has(entry.entryKey)) return false;
      if (onlyIncompleteRows && !(entry.previewItem?.camposIncompletos?.length > 0)) return false;
      return true;
    });
  }, [
    indexedRows,
    selectedSheetTipo,
    selectedMonth,
    dateFrom,
    dateTo,
    selectedMarcasModelos,
    vehicleTypeSearch,
    generalSearch,
    onlyShowSelected,
    onlyIncompleteRows,
    selectedRowKeys,
  ]);

  const incompleteIndexedCount = useMemo(
    () => indexedRows.filter(e => Array.isArray(e.previewItem?.camposIncompletos) && e.previewItem.camposIncompletos.length > 0).length,
    [indexedRows]
  );

  const unmappedPrimaryHeaders = useMemo(() => {
    const mappedSet = new Set(Object.values(columnMapping).filter(Boolean));
    return parsedTable.headers.filter(h => !mappedSet.has(h));
  }, [parsedTable.headers, columnMapping]);

  // Active selected rows inside the current filtered view (what gets imported!)
  const selectedFilteredEntries = useMemo(
    () => filteredEntries.filter(entry => selectedRowKeys.has(entry.entryKey)),
    [filteredEntries, selectedRowKeys]
  );

  const allVisibleSelected =
    filteredEntries.length > 0 &&
    filteredEntries.every(entry => selectedRowKeys.has(entry.entryKey));

  // Recompute smart mapping when headers change, preserving saved custom mappings that match
  const handleApplySmartMapping = (
    headers: string[],
    priorSavedMapping?: Record<string, string>
  ) => {
    const autoMap = getSmartColumnMapping(entity, headers);
    const merged: Record<string, string> = { ...autoMap };
    if (priorSavedMapping) {
      Object.entries(priorSavedMapping).forEach(([sysKey, colName]) => {
        if (colName && headers.includes(colName)) {
          merged[sysKey] = colName;
        }
      });
    }
    setColumnMapping(merged);
  };

  const handleApplySecSmartMapping = (
    headers: string[],
    priorSavedMapping?: Record<string, string>
  ) => {
    const autoMap = getSmartColumnMapping(entity, headers);
    const merged: Record<string, string> = { ...autoMap };
    if (priorSavedMapping) {
      Object.entries(priorSavedMapping).forEach(([sysKey, colName]) => {
        if (colName === '') {
          merged[sysKey] = '';
        } else if (colName && headers.includes(colName)) {
          merged[sysKey] = colName;
        }
      });
    }
    if (merged['VIAJES_CANTIDAD'] === 'CANTIDAD' && merged['HORAS TRABAJADAS'] === 'CANTIDAD') {
      merged['VIAJES_CANTIDAD'] = '';
    }
    setSecColumnMapping(merged);
  };

  // Visible slice for snappy table rendering (capped at 150 rows)
  const visiblePreviewSlice = useMemo(() => filteredEntries.slice(0, 150), [filteredEntries]);

  const hasSecondSheetColumns = enableSecondarySheet && secParsedTable.headers.length > 0;

  const matchedColumnsCount = useMemo(
    () => Object.values(columnMapping).filter(Boolean).length,
    [columnMapping]
  );

  const secMatchedColumnsCount = useMemo(
    () => Object.values(secColumnMapping).filter(Boolean).length,
    [secColumnMapping]
  );

  const combinedMatchedColumnsCount = useMemo(
    () =>
      systemFields.filter(
        f => Boolean(columnMapping[f.key]) || (hasSecondSheetColumns && Boolean(secColumnMapping[f.key]))
      ).length,
    [systemFields, columnMapping, secColumnMapping, hasSecondSheetColumns]
  );

  const filteredSystemFields = useMemo(() => {
    const q = mappingSearch.trim().toLowerCase();
    if (!q) return systemFields;
    return systemFields.filter(f => {
      const h1Col = (columnMapping[f.key] || '').toLowerCase();
      const h2Col = hasSecondSheetColumns ? (secColumnMapping[f.key] || '').toLowerCase() : '';
      return (
        f.label.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        (f.group || '').toLowerCase().includes(q) ||
        h1Col.includes(q) ||
        h2Col.includes(q)
      );
    });
  }, [systemFields, mappingSearch, columnMapping, secColumnMapping, hasSecondSheetColumns]);

  if (!isOpen) return null;

  const ensureGoogleToken = async (): Promise<{ token: string; email: string } | null> => {
    if (accessToken) {
      return { token: accessToken, email: connectedEmail };
    }
    const targetId = extractSpreadsheetId(sheetUrlInput) || spreadsheetId;
    try {
      const res = await googleSignIn();
      if (res?.accessToken) {
        const email = res.user?.email || 'Cuenta Google';
        setAccessToken(res.accessToken);
        setConnectedEmail(email);
        return { token: res.accessToken, email };
      }
    } catch (err) {
      if (targetId) {
        try {
          await fetchPublicWorkbookMetadata(targetId, true);
          const pubEmail = 'Enlace compartido (Lectura directa)';
          setAccessToken(PUBLIC_LINK_TOKEN);
          setConnectedEmail(pubEmail);
          return { token: PUBLIC_LINK_TOKEN, email: pubEmail };
        } catch {
          // Rethrow original error if public link also fails
        }
      }
      throw err;
    }
    return null;
  };

  const handleSignInOnly = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const targetId = extractSpreadsheetId(sheetUrlInput) || spreadsheetId;
    try {
      const res = await googleSignIn();
      if (res?.accessToken) {
        setAccessToken(res.accessToken);
        setConnectedEmail(res.user?.email || 'Cuenta Google');
        if (sheetUrlInput.trim()) {
          await handleConnectAndLoadTabs(res.accessToken, res.user?.email || '');
        }
      }
    } catch (err: any) {
      if (targetId) {
        try {
          await fetchPublicWorkbookMetadata(targetId, true);
          const pubEmail = 'Enlace compartido (Lectura directa)';
          setAccessToken(PUBLIC_LINK_TOKEN);
          setConnectedEmail(pubEmail);
          await handleConnectAndLoadTabs(PUBLIC_LINK_TOKEN, pubEmail);
          return;
        } catch {
          // Fall through to error message
        }
      }
      setErrorMsg(err?.message || 'No se pudo iniciar sesión con Google.');
    }
  };

  const handleSignOutGoogle = async () => {
    await logoutGoogle();
    setAccessToken(null);
    setConnectedEmail('');
  };

  const handleReadTab = async (
    targetSpreadsheetId: string,
    tabTitle: string,
    tokenOverride?: string,
    priorMapping?: Record<string, string>
  ) => {
    const token = tokenOverride || accessToken;
    if (!token) {
      setErrorMsg('Conectá tu cuenta de Google primero para leer la hoja.');
      return;
    }
    if (!targetSpreadsheetId || !tabTitle) return;

    setIsLoadingSheet(true);
    setErrorMsg(null);
    resetFilters();
    try {
      const { formattedValues } = await fetchSheetTabValues(
        targetSpreadsheetId,
        tabTitle,
        token,
        0
      );
      if (!formattedValues || formattedValues.length === 0) {
        setRawGrid([]);
        setErrorMsg(`La pestaña "${tabTitle}" está vacía o no tiene filas legibles.`);
        return;
      }

      const detected = detectBestHeaderRow(formattedValues, entity);
      setRawGrid(formattedValues);
      setHeaderRowIndex(detected.headerRowIndex);

      const { headers } = sheetGridToRawObjects(formattedValues, detected.headerRowIndex);
      handleApplySmartMapping(headers, priorMapping ?? savedConfig?.columnMapping);
    } catch (err: any) {
      const msg = err?.message || 'Error leyendo los datos de la pestaña.';
      if (msg.startsWith('SESSION_EXPIRED:') || msg.startsWith('SCOPE_INSUFFICIENT:')) {
        setAccessToken(null);
      }
      setErrorMsg(msg.replace(/^(SESSION_EXPIRED:|SCOPE_INSUFFICIENT:)\s*/, ''));
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const handleConnectAndLoadTabs = async (tokenOverride?: string, emailOverride?: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const extractedId = extractSpreadsheetId(sheetUrlInput);
    if (!extractedId) {
      setErrorMsg('Pegá el link o el ID de tu Google Sheet antes de conectar.');
      return;
    }

    setIsLoadingSheet(true);
    try {
      const authInfo = tokenOverride
        ? { token: tokenOverride, email: emailOverride || connectedEmail }
        : await ensureGoogleToken();

      if (!authInfo) {
        setIsLoadingSheet(false);
        return;
      }

      const metadata = await fetchSpreadsheetMetadata(extractedId, authInfo.token);
      setSpreadsheetId(metadata.spreadsheetId);
      setSpreadsheetTitle(metadata.title);
      setTabs(metadata.sheets);

      const initialTab =
        (selectedTab && metadata.sheets.some(s => s.title === selectedTab) ? selectedTab : '') ||
        (savedConfig?.selectedTabTitle &&
        metadata.sheets.some(s => s.title === savedConfig.selectedTabTitle)
          ? savedConfig.selectedTabTitle
          : '') ||
        metadata.sheets[0]?.title ||
        '';

      setSelectedTab(initialTab);

      if (initialTab) {
        await handleReadTab(
          metadata.spreadsheetId,
          initialTab,
          authInfo.token,
          savedConfig?.columnMapping
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'No se pudo cargar la planilla de Google Sheets.';
      if (msg.startsWith('SESSION_EXPIRED:') || msg.startsWith('SCOPE_INSUFFICIENT:')) {
        setAccessToken(null);
      }
      setErrorMsg(msg.replace(/^(SESSION_EXPIRED:|SCOPE_INSUFFICIENT:)\s*/, ''));
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const handleReadSecTab = async (
    targetSpreadsheetId: string,
    tabTitle: string,
    tokenOverride?: string,
    priorMapping?: Record<string, string>
  ) => {
    const token = tokenOverride || accessToken;
    if (!token) {
      setSecErrorMsg('Conectá tu cuenta de Google primero para leer la 2ª hoja.');
      return;
    }
    if (!targetSpreadsheetId || !tabTitle) return;

    setIsLoadingSecSheet(true);
    setSecErrorMsg(null);
    try {
      const { formattedValues } = await fetchSheetTabValues(
        targetSpreadsheetId,
        tabTitle,
        token,
        0
      );
      if (!formattedValues || formattedValues.length === 0) {
        setSecRawGrid([]);
        setSecErrorMsg(`La pestaña "${tabTitle}" de la 2ª hoja está vacía o no tiene filas legibles.`);
        return;
      }

      const detected = detectBestHeaderRow(formattedValues, entity);
      setSecRawGrid(formattedValues);
      setSecHeaderRowIndex(detected.headerRowIndex);

      const { headers } = sheetGridToRawObjects(formattedValues, detected.headerRowIndex);
      handleApplySecSmartMapping(headers, priorMapping ?? savedConfig?.secondarySheet?.columnMapping);
    } catch (err: any) {
      const msg = err?.message || 'Error leyendo los datos de la 2ª hoja.';
      if (msg.startsWith('SESSION_EXPIRED:') || msg.startsWith('SCOPE_INSUFFICIENT:')) {
        setAccessToken(null);
      }
      setSecErrorMsg(msg.replace(/^(SESSION_EXPIRED:|SCOPE_INSUFFICIENT:)\s*/, ''));
    } finally {
      setIsLoadingSecSheet(false);
    }
  };

  const handleConnectSecSheetAndLoadTabs = async () => {
    setSecErrorMsg(null);
    const extractedId = extractSpreadsheetId(secUrlInput);
    if (!extractedId) {
      setSecErrorMsg('Pegá el link o el ID de la 2ª planilla antes de cargar.');
      return;
    }

    setIsLoadingSecSheet(true);
    try {
      const authInfo = await ensureGoogleToken();
      if (!authInfo) {
        setIsLoadingSecSheet(false);
        return;
      }

      const metadata = await fetchSpreadsheetMetadata(extractedId, authInfo.token);
      setSecSpreadsheetId(metadata.spreadsheetId);
      setSecSpreadsheetTitle(metadata.title);
      setSecTabs(metadata.sheets);

      const initialTab =
        (secSelectedTab && metadata.sheets.some(s => s.title === secSelectedTab) ? secSelectedTab : '') ||
        (savedConfig?.secondarySheet?.selectedTabTitle &&
        metadata.sheets.some(s => s.title === savedConfig.secondarySheet.selectedTabTitle)
          ? savedConfig.secondarySheet.selectedTabTitle
          : '') ||
        metadata.sheets[0]?.title ||
        '';

      setSecSelectedTab(initialTab);
      if (initialTab) {
        await handleReadSecTab(
          metadata.spreadsheetId,
          initialTab,
          authInfo.token,
          savedConfig?.secondarySheet?.columnMapping
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'No se pudo cargar la 2ª planilla de Google Sheets.';
      if (msg.startsWith('SESSION_EXPIRED:') || msg.startsWith('SCOPE_INSUFFICIENT:')) {
        setAccessToken(null);
      }
      setSecErrorMsg(msg.replace(/^(SESSION_EXPIRED:|SCOPE_INSUFFICIENT:)\s*/, ''));
    } finally {
      setIsLoadingSecSheet(false);
    }
  };

  const handleUseSameSpreadsheetForSec = async () => {
    if (!spreadsheetId) return;
    setEnableSecondarySheet(true);
    setSecErrorMsg(null);
    setSecUrlInput(sheetUrlInput || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
    setSecSpreadsheetId(spreadsheetId);
    setSecSpreadsheetTitle(spreadsheetTitle);
    setSecTabs(tabs);

    const otherTab = tabs.find(t => t.title !== selectedTab)?.title || tabs[0]?.title || '';
    setSecSelectedTab(otherTab);
    if (otherTab && accessToken) {
      await handleReadSecTab(spreadsheetId, otherTab, accessToken, savedConfig?.secondarySheet?.columnMapping);
    }
  };

  const handleHeaderRowChange = (oneBasedRow: number) => {
    const idx = Math.max(0, Math.min(oneBasedRow - 1, Math.max(0, rawGrid.length - 1)));
    setHeaderRowIndex(idx);
    const { headers } = sheetGridToRawObjects(rawGrid, idx);
    handleApplySmartMapping(headers);
  };

  const handleSecHeaderRowChange = (oneBasedRow: number) => {
    const idx = Math.max(0, Math.min(oneBasedRow - 1, Math.max(0, secRawGrid.length - 1)));
    setSecHeaderRowIndex(idx);
    const { headers } = sheetGridToRawObjects(secRawGrid, idx);
    handleApplySecSmartMapping(headers);
  };

  const handleToggleRowSelection = (entryKey: string) => {
    setSelectedRowKeys(prev => {
      const next = new Set(prev);
      if (next.has(entryKey)) next.delete(entryKey);
      else next.add(entryKey);
      return next;
    });
  };

  const handleToggleAllVisible = () => {
    setSelectedRowKeys(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredEntries.forEach(e => next.delete(e.entryKey));
      } else {
        filteredEntries.forEach(e => next.add(e.entryKey));
      }
      return next;
    });
  };

  const handleSelectVisibleOnly = () => {
    setSelectedRowKeys(new Set(filteredEntries.map(e => e.entryKey)));
  };

  const handleClearVisibleSelection = () => {
    setSelectedRowKeys(prev => {
      const next = new Set(prev);
      filteredEntries.forEach(e => next.delete(e.entryKey));
      return next;
    });
  };

  const handleInvertVisibleSelection = () => {
    setSelectedRowKeys(prev => {
      const next = new Set(prev);
      filteredEntries.forEach(e => {
        if (next.has(e.entryKey)) next.delete(e.entryKey);
        else next.add(e.entryKey);
      });
      return next;
    });
  };

  const buildSecondarySheetConfigPayload = (): SecondarySheetConfig | undefined => {
    if (!enableSecondarySheet && !secSpreadsheetId && !secUrlInput.trim()) return undefined;
    const targetSecId = secSpreadsheetId || extractSpreadsheetId(secUrlInput);
    return {
      enabled: enableSecondarySheet,
      spreadsheetId: targetSecId,
      spreadsheetUrl:
        secUrlInput.trim() ||
        (targetSecId ? `https://docs.google.com/spreadsheets/d/${targetSecId}/edit` : ''),
      spreadsheetTitle: secSpreadsheetTitle,
      selectedTabTitle: secSelectedTab,
      availableTabs: secTabs,
      headerRowIndex: secHeaderRowIndex,
      columnMapping: secColumnMapping,
      dateOrder: secDateOrderPref,
      selectedTipo: secSelectedTipo,
      joinStrategy,
    };
  };

  const handleSaveMappingConfigOnly = async () => {
    const targetId = spreadsheetId || extractSpreadsheetId(sheetUrlInput);
    if (!targetId) {
      setErrorMsg('Primero cargá una planilla de Google Sheets para guardar el emparejamiento.');
      return;
    }

    setIsSavingMappingOnly(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const nextConfig: OperationalSheetConfig = {
      spreadsheetId: targetId,
      spreadsheetUrl:
        sheetUrlInput.trim() || `https://docs.google.com/spreadsheets/d/${targetId}/edit`,
      spreadsheetTitle,
      selectedTabTitle: selectedTab,
      availableTabs: tabs,
      headerRowIndex,
      columnMapping,
      dateOrder: dateOrderPref,
      syncMode,
      connectedEmail,
      lastSyncedAt: savedConfig?.lastSyncedAt,
      lastSyncedCount: savedConfig?.lastSyncedCount,
      secondarySheet: buildSecondarySheetConfigPayload(),
    };

    const res = await saveOperationalSheetConfigToDb(meta.configKey, nextConfig);
    setIsSavingMappingOnly(false);

    if (!res.ok) {
      setErrorMsg(res.error || 'No se pudo guardar el mapeo en Supabase.');
      return;
    }

    setSavedConfig(nextConfig);
    const msg = 'Matcheo de columnas y vínculo guardados y confirmados en Supabase.';
    setSuccessMsg(msg);
    onShowToast?.(msg);
  };

  const handleSyncToSupabase = async () => {
    if (parsedTable.rawRows.length === 0) {
      setErrorMsg('Primero leé una pestaña con filas válidas de Google Sheets.');
      return;
    }

    if (selectedFilteredEntries.length === 0) {
      setErrorMsg(
        'No hay ninguna fila marcada dentro de la vista actual. Marcá al menos una fila con su casilla antes de sincronizar.'
      );
      return;
    }

    setIsSavingSupabase(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let itemsToPersist: any[] = [];
      let syncedSelectionCount = 0;

      if (twoSheetCombinedState.active) {
        const selectedCombined = selectedFilteredEntries
          .map(e => e.previewItem)
          .filter(Boolean);

        if (selectedCombined.length === 0) {
          setErrorMsg(
            'No se pudieron transformar filas válidas combinadas. Verificá la fila de encabezados o el matcheo de ID y columnas.'
          );
          setIsSavingSupabase(false);
          return;
        }

        syncedSelectionCount = selectedCombined.length;

        if (syncMode === 'replace') {
          itemsToPersist = selectedCombined;
        } else {
          const existingMap = new Map<string, any>();
          const existingNaturalParteMap = new Map<string, string>();

          const buildNaturalKey = (item: any): string => {
            if (entity !== 'partesDiarios' || !item?.numParte) return '';
            const np = String(item.numParte).toUpperCase().trim();
            const eq = String(item.codigoEquipo || item.marcaModelo || '').toUpperCase().trim();
            const dt = String(item.fecha || '').trim();
            return np ? `NP:${np}__${eq}__${dt}` : '';
          };

          existingData.forEach(item => {
            const k = getEntityJoinKey(entity, item);
            if (k) {
              existingMap.set(k, item);
              const natK = buildNaturalKey(item);
              if (natK) existingNaturalParteMap.set(natK, k);
            }
          });

          const mergedBatch = new Map<string, any>();
          selectedCombined.forEach((incoming, i) => {
            const joinId = selectedFilteredEntries[i]?.joinId || '';
            let k = getEntityJoinKey(entity, incoming, joinId) || String(incoming.id || i);
            const natK = buildNaturalKey(incoming);
            if (!existingMap.has(k) && natK && existingNaturalParteMap.has(natK)) {
              k = existingNaturalParteMap.get(natK)!;
            }
            const existingMatch = existingMap.get(k);
            const merged = existingMatch
              ? mergeEntityRecords(entity, existingMatch, incoming)
              : incoming;
            if (existingMatch?.id) merged.id = existingMatch.id;
            mergedBatch.set(k, merged);
          });

          itemsToPersist = Array.from(mergedBatch.values());
        }
      } else {
        const rowsToTransform = selectedFilteredEntries.map(e => e.raw);
        const transformed = transformImportedRows(
          entity,
          rowsToTransform,
          existingData,
          syncMode,
          columnMapping,
          { ...context, dateOrder: effectiveDateOrder }
        );

        if (transformed.validItems.length === 0) {
          setErrorMsg(
            'No se pudieron transformar filas válidas. Verificá la fila de encabezados o el matcheo de columnas.'
          );
          setIsSavingSupabase(false);
          return;
        }

        syncedSelectionCount = transformed.count;
        itemsToPersist = transformed.validItems;
      }

      // 1. Confirm real persistence of operational records in Supabase PostgreSQL
      const syncRes = await syncCollectionStrictToSupabase(
        meta.tableName,
        itemsToPersist,
        syncMode
      );

      if (!syncRes.ok) {
        setErrorMsg(syncRes.error || 'Supabase rechazó o no pudo confirmar el guardado.');
        setIsSavingSupabase(false);
        return;
      }

      // 2. Confirm persistence of Sheet connection metadata & column mapping (including 2nd sheet) in Supabase system_settings
      const nextConfig: OperationalSheetConfig = {
        spreadsheetId: spreadsheetId || extractSpreadsheetId(sheetUrlInput),
        spreadsheetUrl:
          sheetUrlInput.trim() ||
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        spreadsheetTitle,
        selectedTabTitle: selectedTab,
        availableTabs: tabs,
        headerRowIndex,
        columnMapping,
        dateOrder: dateOrderPref,
        syncMode,
        connectedEmail,
        lastSyncedAt: new Date().toISOString(),
        lastSyncedCount: syncedSelectionCount,
        secondarySheet: buildSecondarySheetConfigPayload(),
      };

      const cfgSaveRes = await saveOperationalSheetConfigToDb(meta.configKey, nextConfig);
      if (!cfgSaveRes.ok) {
        setErrorMsg(
          `Los ${syncRes.count} registros se guardaron en Supabase, pero falló guardar el vínculo de la planilla: ${cfgSaveRes.error}`
        );
        onSyncedSuccess(syncRes.items || itemsToPersist, nextConfig);
        setIsSavingSupabase(false);
        return;
      }

      setSavedConfig(nextConfig);
      const confirmedItems = syncRes.items || itemsToPersist;
      onSyncedSuccess(confirmedItems, nextConfig);

      const sourceLabel = twoSheetCombinedState.active
        ? `"${selectedTab}" + "${secSelectedTab}" (${twoSheetCombinedState.stats?.matchedCount || 0} IDs vinculados)`
        : `"${selectedTab}"`;
      const okText = `Sincronizado y confirmado en Supabase PostgreSQL: ${syncedSelectionCount} filas elegidas importadas (${confirmedItems.length} registros totales en tabla) desde ${sourceLabel}.`;
      setSuccessMsg(okText);
      onShowToast?.(okText);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error inesperado sincronizando con Supabase.');
    } finally {
      setIsSavingSupabase(false);
    }
  };

  const handleConfirmPushToSheet = async () => {
    setShowPushConfirm(false);
    if (!spreadsheetId || !selectedTab) {
      setErrorMsg('Seleccioná una planilla y pestaña destino antes de escribir en Google Sheets.');
      return;
    }

    setIsWritingSheet(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const authInfo = await ensureGoogleToken();
      if (!authInfo) {
        setIsWritingSheet(false);
        return;
      }

      const customHeaders =
        parsedTable.headers.length > 0 ? parsedTable.headers : ENTITY_CONFIGS[entity].baseHeaders;

      const { headers, matrix } = buildSheetMatrixFromEntities(
        entity,
        existingData,
        customHeaders
      );

      const writeRes = await writeTableToGoogleSheetTab(
        spreadsheetId,
        selectedTab,
        headers,
        matrix,
        authInfo.token
      );

      // Update sync metadata in Supabase
      const nextConfig: OperationalSheetConfig = {
        spreadsheetId,
        spreadsheetUrl:
          sheetUrlInput.trim() || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        spreadsheetTitle,
        selectedTabTitle: selectedTab,
        availableTabs: tabs,
        headerRowIndex: 0,
        columnMapping,
        dateOrder: dateOrderPref,
        syncMode,
        connectedEmail: authInfo.email,
        lastSyncedAt: new Date().toISOString(),
        lastSyncedCount: writeRes.updatedRows,
      };
      await saveOperationalSheetConfigToDb(meta.configKey, nextConfig);
      setSavedConfig(nextConfig);

      const msg = `Se escribieron ${writeRes.updatedRows} registros del sistema en la pestaña "${selectedTab}" de Google Sheets.`;
      setSuccessMsg(msg);
      onShowToast?.(msg);
    } catch (err: any) {
      const msg = err?.message || 'Error escribiendo datos en Google Sheets.';
      if (msg.startsWith('SESSION_EXPIRED:') || msg.startsWith('SCOPE_INSUFFICIENT:')) {
        setAccessToken(null);
      }
      setErrorMsg(msg.replace(/^(SESSION_EXPIRED:|SCOPE_INSUFFICIENT:)\s*/, ''));
    } finally {
      setIsWritingSheet(false);
    }
  };

  const renderSelectableRowCells = (entry: IndexedSheetRow) => {
    const item = entry.previewItem;

    if (entity === 'expendio') {
      return (
        <>
          <td className="px-3 py-2 font-mono text-slate-200 whitespace-nowrap">
            {entry.isoDate || item?.fecha || '-'}
          </td>
          <td className="px-3 py-2 font-mono font-bold text-amber-300 whitespace-nowrap">
            {item?.numOrden || '-'}
          </td>
          <td className="px-3 py-2 text-slate-200 font-semibold whitespace-nowrap">
            {item?.codigoEquipo || entry.codigoEquipo || '-'}
          </td>
          <td className="px-3 py-2 text-sky-300 font-medium max-w-[180px] truncate" title={entry.marcaModelo}>
            {item?.marcaModelo && item.marcaModelo !== 'Equipo Flota'
              ? item.marcaModelo
              : entry.marcaModelo}
          </td>
          <td className="px-3 py-2 text-slate-300 max-w-[150px] truncate">
            {item?.nombreApellido || '-'}
          </td>
          <td className="px-3 py-2 font-mono text-emerald-400 font-bold text-right whitespace-nowrap">
            {item ? `${Number(item.cantidad || 0).toLocaleString('es-AR')} L` : '-'}
          </td>
          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item?.tipoComb || '-'}</td>
          <td className="px-3 py-2 font-mono text-slate-400 text-right whitespace-nowrap">
            {item?.kilometraje ? Number(item.kilometraje).toLocaleString('es-AR') : '-'}
          </td>
        </>
      );
    }

    if (entity === 'vales') {
      return (
        <>
          <td className="px-3 py-2 font-mono text-slate-200 whitespace-nowrap">
            {entry.isoDate || item?.fechaEmision || '-'}
          </td>
          <td className="px-3 py-2 font-mono font-bold text-amber-300 whitespace-nowrap">
            {item?.numVale || '-'}
          </td>
          <td className="px-3 py-2 text-slate-200 font-semibold whitespace-nowrap">
            {item?.codigoEquipo || entry.codigoEquipo || '-'}
          </td>
          <td className="px-3 py-2 text-sky-300 font-medium max-w-[180px] truncate" title={entry.marcaModelo}>
            {item?.marcaModelo && item.marcaModelo !== 'Equipo Flota'
              ? item.marcaModelo
              : entry.marcaModelo}
          </td>
          <td className="px-3 py-2 text-slate-300 max-w-[150px] truncate">
            {item?.nombreApellido || '-'}
          </td>
          <td className="px-3 py-2 font-mono text-emerald-400 font-bold text-right whitespace-nowrap">
            {item
              ? `${Number(item.litrosReales ?? item.litrosAutorizados ?? 0).toLocaleString('es-AR')} L`
              : '-'}
          </td>
          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item?.estado || '-'}</td>
          <td className="px-3 py-2 text-slate-400 max-w-[140px] truncate">
            {item?.estacionSurtidor || '-'}
          </td>
        </>
      );
    }

    if (entity === 'gastosMantenimiento') {
      const missingFields: string[] = Array.isArray(item?.camposIncompletos) ? item.camposIncompletos : [];
      const montoVal = Number(item?.montoTotal ?? 0);
      return (
        <>
          <td className="px-3 py-2 font-mono text-slate-200 whitespace-nowrap">
            <div>
              {entry.isoDate || item?.fecha ? (
                entry.isoDate || item.fecha
              ) : (
                <span className="text-amber-400 italic">Sin fecha</span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {entry.joinId && (
                <span className="text-[10px] font-mono text-slate-500">ID: {entry.joinId}</span>
              )}
              {missingFields.length > 0 && (
                <span
                  className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/35"
                  title={`Falta completar: ${missingFields.join(', ')}`}
                >
                  Incompleto
                </span>
              )}
            </div>
          </td>
          <td className="px-3 py-2 whitespace-nowrap">
            <div className="font-mono font-bold text-amber-300">
              {item?.numeroComprobante || <span className="text-slate-500 font-normal italic">Sin comp.</span>}
            </div>
            {(item?.subcategoriaOriginal || entry.sheetTipo) && (
              <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {item?.subcategoriaOriginal || entry.sheetTipo}
              </span>
            )}
          </td>
          <td
            className="px-3 py-2 text-sky-300 font-medium max-w-[180px] truncate"
            title={`${item?.equipoPatenteOrCodigo || entry.codigoEquipo} - ${item?.equipoModeloMarca || entry.marcaModelo}`}
          >
            <div className="truncate">
              {item?.equipoModeloMarca && item.equipoModeloMarca !== 'Sin equipo asignado'
                ? item.equipoModeloMarca
                : entry.marcaModelo !== 'Sin Marca/Modelo'
                  ? entry.marcaModelo
                  : <span className="text-slate-500 italic">Sin equipo</span>}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              {item?.equipoPatenteOrCodigo || entry.codigoEquipo || '-'}
            </div>
          </td>
          <td className="px-3 py-2 text-slate-300 max-w-[160px] truncate">
            <div className="truncate">
              {item?.proveedor || <span className="text-slate-500 italic">Sin proveedor</span>}
            </div>
            {item?.responsableNombre && (
              <div className="text-[10px] text-slate-500 truncate">Resp: {item.responsableNombre}</div>
            )}
          </td>
          <td className="px-3 py-2 text-slate-300 max-w-[230px]">
            <div className="truncate" title={item?.concepto}>
              {item?.concepto || <span className="text-slate-500 italic">Sin descripción</span>}
            </div>
            {item?.marcaRepuesto && (
              <div className="text-[10px] text-sky-300 truncate">Marca: {item.marcaRepuesto}</div>
            )}
          </td>
          <td className="px-3 py-2 font-mono text-slate-300 text-right whitespace-nowrap">
            {item?.cantidad !== undefined ? Number(item.cantidad).toLocaleString('es-AR') : '-'}
          </td>
          <td
            className={`px-3 py-2 font-mono font-bold text-right whitespace-nowrap ${
              montoVal < 0
                ? 'text-rose-400'
                : missingFields.includes('monto') && montoVal === 0
                  ? 'text-amber-400/80'
                  : 'text-emerald-400'
            }`}
          >
            {missingFields.includes('monto') && montoVal === 0
              ? 'Sin monto'
              : `$${montoVal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </td>
        </>
      );
    }

    // partesDiarios
    return (
      <>
        <td className="px-3 py-2 font-mono text-slate-200 whitespace-nowrap">
          <div>{entry.isoDate || item?.fecha || '-'}</div>
          {entry.joinId && (
            <div className="text-[10px] font-mono text-slate-500">ID: {entry.joinId}</div>
          )}
        </td>
        <td className="px-3 py-2 font-mono font-bold text-amber-300 whitespace-nowrap">
          <div>{item?.numParte || '-'}</div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {entry.sheetTipo && (
              <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold ${
                entry.sheetTipo === 'VENTA'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {entry.sheetTipo}
              </span>
            )}
            {item?.estadoCobro && (
              <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold ${
                String(item.estadoCobro).toUpperCase().includes('PAG')
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}>
                {item.estadoCobro}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-sky-300 font-medium max-w-[180px] truncate" title={`${item?.codigoEquipo || entry.codigoEquipo} - ${item?.marcaModelo || entry.marcaModelo}`}>
          <div className="truncate">{item?.marcaModelo || entry.marcaModelo}</div>
          <div className="text-[10px] font-mono text-slate-500">{item?.codigoEquipo || entry.codigoEquipo || '-'}</div>
        </td>
        <td className="px-3 py-2 text-slate-300 max-w-[150px] truncate">
          {item?.nombreApellido || '-'}
        </td>
        <td className="px-3 py-2 text-slate-300 truncate max-w-[150px]">{item?.obra || '-'}</td>
        <td className="px-3 py-2 text-slate-300 max-w-[210px]">
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
              item?.tipo === 'VIAJES'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : item?.tipo === 'DIA'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : item?.tipo === 'TRABAJO'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}>
              {item?.tipo || 'HORAS'}
            </span>
            {item?.extraccionEntregas && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-300">
                {item.extraccionEntregas}
              </span>
            )}
            {item?.separarCobranzaMaterial && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-300" title="Se contabiliza únicamente el viaje/flete del equipo sin incluir material">
                Solo Viaje
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 truncate mt-0.5" title={item?.detalleTipo}>
            {item?.tipoMaterial ? `${item.tipoMaterial} • ` : ''}{item?.detalleTipo || '-'}
          </div>
        </td>
        <td className="px-3 py-2 font-mono text-emerald-400 font-bold text-right whitespace-nowrap">
          <div>
            {item
              ? item.tipo === 'VIAJES'
                ? `${item.viajesCantidad || 0} vjs${item.totalM3 ? ` (${item.totalM3} m³)` : ''}`
                : `${Number(item.horasTrabajadas || 0).toFixed(1)} hs`
              : '-'}
          </div>
          {(Number(item?.precioUnitario || 0) > 0 || Number(item?.totalSheet || 0) > 0) && (
            <div className="text-[10px] text-amber-300 font-semibold">
              ${Number(item?.totalSheet || item?.precioUnitario || 0).toLocaleString('es-AR')}
            </div>
          )}
        </td>
        <td className="px-3 py-2 font-mono text-slate-400 text-right whitespace-nowrap">
          {item?.odomKilom ? Number(item.odomKilom).toLocaleString('es-AR') : '-'}
        </td>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-[#12151B] border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-[#16191F] border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight truncate">
                {meta.title}
              </h2>
              <p className="text-xs text-slate-400 truncate">{meta.subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {isLoadingConfig ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-[#F0C800]" />
              <span>Consultando configuración vinculada en Supabase...</span>
            </div>
          ) : (
            <>
              {/* 1. Google Session & Sheet Link Card */}
              <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                    <Link2 className="w-4 h-4" />
                    <span>1. Conexión a Google Sheets / Excel en Drive</span>
                  </div>

                  {accessToken ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {connectedEmail || 'Google Conectado'}
                      </span>
                      <button
                        type="button"
                        onClick={handleSignOutGoogle}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                      >
                        <LogOut className="w-3 h-3" /> Cambiar cuenta
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSignInOnly}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 48 48">
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                      </svg>
                      <span>Sign in with Google</span>
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
                    placeholder="Pegá el link completo de tu Google Sheet (ej. https://docs.google.com/spreadsheets/d/...)"
                    className="flex-1 bg-[#0B0D11] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F0C800]"
                  />
                  <button
                    type="button"
                    onClick={() => handleConnectAndLoadTabs()}
                    disabled={isLoadingSheet || !sheetUrlInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] disabled:opacity-50 text-black font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSheet ? 'animate-spin' : ''}`} />
                    <span>{accessToken ? 'Cargar Hojas' : 'Conectar Google y Cargar'}</span>
                  </button>
                </div>

                {savedConfig?.spreadsheetTitle && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
                    <span>
                      Último vínculo guardado en Supabase:{' '}
                      <strong className="text-slate-200">{savedConfig.spreadsheetTitle}</strong>
                      {savedConfig.selectedTabTitle ? ` → Pestaña "${savedConfig.selectedTabTitle}"` : ''}
                    </span>
                    {savedConfig.lastSyncedAt && (
                      <span className="font-mono text-emerald-400">
                        Última sync: {new Date(savedConfig.lastSyncedAt).toLocaleString('es-AR')}
                        {savedConfig.lastSyncedCount ? ` (${savedConfig.lastSyncedCount} filas)` : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Tab & Header Row Picker */}
              {(tabs.length > 0 || spreadsheetTitle) && (
                <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#F0C800]">
                      2. Elegir Pestaña / Hoja — {spreadsheetTitle || 'Planilla'}
                    </span>
                    {rawGrid.length > 0 && (
                      <span className="text-[11px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                        {parsedTable.rawRows.length} filas leídas • {parsedTable.headers.length} columnas
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-6">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Pestaña de la Planilla
                      </label>
                      <SearchableSelect
                        options={tabs.map(t => ({ value: t.title, label: t.title }))}
                        value={selectedTab}
                        onChange={nextTab => {
                          setSelectedTab(nextTab);
                          if (nextTab && accessToken) {
                            handleReadTab(spreadsheetId, nextTab);
                          }
                        }}
                        placeholder="Seleccionar pestaña..."
                        searchPlaceholder="Buscar pestaña..."
                        showClear={false}
                        compact
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Fila de Encabezados
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={25}
                        value={headerRowIndex + 1}
                        onChange={e => handleHeaderRowChange(Number(e.target.value) || 1)}
                        className="w-full bg-[#0B0D11] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#F0C800]"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <button
                        type="button"
                        onClick={() => handleReadTab(spreadsheetId, selectedTab)}
                        disabled={isLoadingSheet || !selectedTab}
                        className="w-full px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Releer Pestaña</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 2B. Optional 2nd Sheet Combiner by Shared ID */}
              {(tabs.length > 0 || spreadsheetId) && (
                <div className={`rounded-xl p-4 space-y-3 border transition ${
                  enableSecondarySheet
                    ? 'bg-[#16191F] border-sky-500/45 shadow-lg shadow-sky-950/20'
                    : 'bg-[#16191F]/70 border-slate-800'
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GitMerge className={`w-4 h-4 ${enableSecondarySheet ? 'text-sky-400' : 'text-slate-400'}`} />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-100">
                        2B. Combinar con 2ª Hoja por ID Compartido (Opcional)
                      </span>
                      {twoSheetCombinedState.active && twoSheetCombinedState.stats && (
                        <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/35">
                          {twoSheetCombinedState.stats.matchedCount} IDs vinculados
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!enableSecondarySheet && spreadsheetId && (
                        <button
                          type="button"
                          onClick={handleUseSameSpreadsheetForSec}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                          title="Usar otra pestaña dentro de esta misma planilla de Google Sheets"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Combinar otra pestaña de este archivo</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEnableSecondarySheet(prev => !prev)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                          enableSecondarySheet
                            ? 'bg-sky-500 text-black'
                            : 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>{enableSecondarySheet ? '2ª Hoja Activa' : 'Agregar 2ª Hoja para Combinar'}</span>
                      </button>
                    </div>
                  </div>

                  {!enableSecondarySheet ? (
                    <p className="text-[11px] text-slate-400">
                      Si tenés parte de los datos en <strong className="text-slate-300">REPORTE_DIARIO</strong> (horarios, hs, firma, viajes) y otra parte en <strong className="text-slate-300">GASTOS POR EQUIPOS</strong> (precios, estado pagado/debe, detalle 2) compartiendo la columna <strong className="text-sky-300 font-mono">ID</strong>, activá esta opción para unirlas en una sola importación.
                    </p>
                  ) : (
                    <div className="space-y-3 pt-1">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={secUrlInput}
                          onChange={e => {
                            setSecUrlInput(e.target.value);
                            setSecSpreadsheetId(extractSpreadsheetId(e.target.value));
                          }}
                          placeholder="Pegá el link completo de la 2ª planilla (ej. GASTOS POR EQUIPOS)..."
                          className="flex-1 bg-[#0B0D11] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                        />
                        {spreadsheetId && secSpreadsheetId !== spreadsheetId && (
                          <button
                            type="button"
                            onClick={handleUseSameSpreadsheetForSec}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold whitespace-nowrap cursor-pointer transition"
                          >
                            Misma Planilla
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleConnectSecSheetAndLoadTabs}
                          disabled={isLoadingSecSheet || !secUrlInput.trim()}
                          className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-black font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSecSheet ? 'animate-spin' : ''}`} />
                          <span>Cargar 2ª Hoja</span>
                        </button>
                      </div>

                      {secErrorMsg && (
                        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px] flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>{secErrorMsg}</span>
                        </div>
                      )}

                      {(secTabs.length > 0 || secSpreadsheetTitle) && (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end bg-[#0B0D11] p-3 rounded-xl border border-slate-800">
                          <div className="md:col-span-4">
                            <label className="block text-[11px] font-semibold text-sky-300 mb-1">
                              Pestaña 2ª Hoja ({secSpreadsheetTitle || 'Planilla 2'})
                            </label>
                            <SearchableSelect
                              options={secTabs.map(t => ({ value: t.title, label: t.title }))}
                              value={secSelectedTab}
                              onChange={nextTab => {
                                setSecSelectedTab(nextTab);
                                if (nextTab && accessToken) {
                                  handleReadSecTab(secSpreadsheetId, nextTab);
                                }
                              }}
                              placeholder="Seleccionar pestaña..."
                              searchPlaceholder="Buscar pestaña..."
                              showClear={false}
                              compact
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Encabezados
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={25}
                              value={secHeaderRowIndex + 1}
                              onChange={e => handleSecHeaderRowChange(Number(e.target.value) || 1)}
                              className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-sky-400"
                            />
                          </div>

                          <div className="md:col-span-4">
                            <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                              Cómo combinar por ID
                            </label>
                            <SearchableSelect
                              options={[
                                {
                                  value: 'outer',
                                  label: 'Combinar todas por ID (H1 + H2, sin perder filas)',
                                },
                                {
                                  value: 'left',
                                  label: 'Base Hoja 1 + enriquecer coincidencias de Hoja 2',
                                },
                                {
                                  value: 'inner',
                                  label: 'Solo filas con el mismo ID en AMBAS hojas',
                                },
                              ]}
                              value={joinStrategy}
                              onChange={val => setJoinStrategy((val as SheetJoinStrategy) || 'outer')}
                              placeholder="Estrategia de combinación..."
                              searchPlaceholder="Buscar modo..."
                              showClear={false}
                              compact
                            />
                          </div>

                          <div className="md:col-span-2">
                            <button
                              type="button"
                              onClick={() => handleReadSecTab(secSpreadsheetId, secSelectedTab)}
                              disabled={isLoadingSecSheet || !secSelectedTab}
                              className="w-full px-2.5 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/35 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition disabled:opacity-50"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Releer</span>
                            </button>
                          </div>

                          {secParsedTable.headers.length > 0 && (
                            <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                              <div className="flex flex-wrap items-center gap-2">
                                {secTipoAnalysis.options.length > 0 && entity === 'partesDiarios' && (
                                  <div className="w-56">
                                    <SearchableSelect
                                      options={[
                                        { value: 'ALL', label: `2ª Hoja TIPO: Todos (${secParsedTable.rawRows.length})` },
                                        ...secTipoAnalysis.options.map(opt => ({
                                          value: opt.value,
                                          label: opt.value === 'VENTA' ? `2ª Hoja: Solo VENTA (${opt.count}) ★` : `${opt.value} (${opt.count})`,
                                        })),
                                      ]}
                                      value={secSelectedTipo}
                                      onChange={val => setSecSelectedTipo(val || 'ALL')}
                                      placeholder="Filtrar TIPO 2ª Hoja..."
                                      searchPlaceholder="Buscar TIPO..."
                                      clearValue="ALL"
                                      compact
                                    />
                                  </div>
                                )}

                                <div className="w-44">
                                  <SearchableSelect
                                    options={[
                                      { value: 'auto', label: `Fecha 2ª: Auto (${secEffectiveDateOrder === 'dmy' ? 'DD/MM' : 'MM/DD'})` },
                                      { value: 'dmy', label: 'Fecha 2ª: DD/MM/AAAA' },
                                      { value: 'mdy', label: 'Fecha 2ª: MM/DD/AAAA' },
                                    ]}
                                    value={secDateOrderPref}
                                    onChange={val => setSecDateOrderPref((val as 'auto' | 'dmy' | 'mdy') || 'auto')}
                                    placeholder="Formato fecha..."
                                    searchPlaceholder="Buscar formato..."
                                    showClear={false}
                                    compact
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-2 text-[11px] font-mono text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2.5 py-1 rounded-lg">
                                <span>
                                  2ª Hoja lista: {secParsedTable.rawRows.length} filas • {secParsedTable.headers.length} columnas ({secMatchedColumnsCount}/{systemFields.length} emparejadas en Paso 3 ↓)
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {twoSheetCombinedState.active && twoSheetCombinedState.stats && (
                        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-bold">
                              ✓ {twoSheetCombinedState.stats.matchedCount} IDs combinados (Hoja 1 + Hoja 2)
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-semibold">
                              {twoSheetCombinedState.stats.onlyPrimaryCount} solo en Hoja 1
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                              {twoSheetCombinedState.stats.onlySecondaryCount} solo en Hoja 2
                            </span>
                          </div>
                          <span className="text-[11px] text-sky-200 font-mono">
                            Total resultante: {twoSheetCombinedState.stats.totalCombinedCount} registros
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 3. Interactive Column Matcher (Hoja 1 + Hoja 2 <-> Our System Columns) */}
              {(parsedTable.headers.length > 0 || secParsedTable.headers.length > 0) && (
                <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-[#F0C800]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-100">
                        {hasSecondSheetColumns
                          ? '3. Matcheo de Columnas (Hoja 1 + Hoja 2 ⇄ Nuestro Sistema)'
                          : '3. Matcheo de Columnas (Excel / Sheet ⇄ Nuestro Sistema)'}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
                        {combinedMatchedColumnsCount}/{systemFields.length} emparejadas
                      </span>
                      {hasSecondSheetColumns && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono">
                          H1: {matchedColumnsCount} • H2: {secMatchedColumnsCount}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (parsedTable.headers.length > 0) {
                            handleApplySmartMapping(parsedTable.headers);
                          }
                          if (hasSecondSheetColumns) {
                            handleApplySecSmartMapping(secParsedTable.headers);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                        title="Detectar automáticamente según los nombres de las columnas de las hojas cargadas"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{hasSecondSheetColumns ? 'Auto-emparejar Ambas' : 'Auto-emparejar'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveMappingConfigOnly}
                        disabled={isSavingMappingOnly}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{isSavingMappingOnly ? 'Guardando...' : 'Guardar Matcheo'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowMappingPanel(prev => !prev)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <span>{showMappingPanel ? 'Ocultar' : 'Editar Matcheo'}</span>
                        {showMappingPanel ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {showMappingPanel && (
                    <div className="space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-400">
                          {hasSecondSheetColumns
                            ? 'Tenés las columnas de Hoja 1 y Hoja 2 lado a lado. Si un dato está en una sola planilla (ej. Total, Estado, Detalle 2 o Horarios), se completa desde esa hoja.'
                            : 'Elegí qué columna de tu Excel corresponde a cada campo de nuestro sistema. Podés verificar el valor real de ejemplo de tu hoja a la derecha.'}
                        </p>
                        <div className="relative w-full sm:w-64">
                          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={mappingSearch}
                            onChange={e => setMappingSearch(e.target.value)}
                            placeholder="Buscar campo o columna..."
                            className="w-full bg-[#0B0D11] border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F0C800]"
                          />
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0B0D11] max-h-80 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900/95 text-[10px] uppercase tracking-wider text-slate-400 sticky top-0 z-10">
                            <tr>
                              <th className="px-3 py-2">Columna Nuestro Sistema</th>
                              <th className="px-3 py-2 text-amber-300">
                                ⇄ {hasSecondSheetColumns ? `Hoja 1 (${selectedTab || 'Principal'})` : 'Columna en Tu Excel / Sheet'}
                              </th>
                              {hasSecondSheetColumns && (
                                <th className="px-3 py-2 text-sky-300">
                                  ⇄ Hoja 2 ({secSelectedTab || 'Complementaria'})
                                </th>
                              )}
                              <th className="px-3 py-2">
                                {hasSecondSheetColumns ? 'Ejemplo Real (H1 / H2)' : 'Ejemplo Real en la Hoja'}
                              </th>
                              <th className="px-3 py-2 text-center">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {filteredSystemFields.map(field => {
                              const mappedCol = columnMapping[field.key] || '';
                              const sampleVal = mappedCol ? columnSampleValues[mappedCol] || '' : '';
                              const mappedSecCol = hasSecondSheetColumns ? secColumnMapping[field.key] || '' : '';
                              const secSampleVal = mappedSecCol ? secColumnSampleValues[mappedSecCol] || '' : '';
                              const hasH1 = Boolean(mappedCol);
                              const hasH2 = Boolean(mappedSecCol);

                              return (
                                <tr key={field.key} className="hover:bg-slate-800/30">
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-slate-200">
                                        {field.label}
                                      </span>
                                      {field.required && (
                                        <span className="text-amber-400 font-bold" title="Campo requerido">*</span>
                                      )}
                                    </div>
                                    <div className="text-[10px] font-mono text-slate-500">
                                      {field.key}
                                      {field.group ? ` • ${field.group}` : ''}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 min-w-[215px]">
                                    <SearchableSelect
                                      options={[
                                        { value: '', label: '-- Sin asignar --' },
                                        ...parsedTable.headers.map(h => ({ value: h, label: h })),
                                      ]}
                                      value={mappedCol}
                                      onChange={nextVal =>
                                        setColumnMapping(prev => ({
                                          ...prev,
                                          [field.key]: nextVal,
                                        }))
                                      }
                                      placeholder="-- Sin asignar --"
                                      searchPlaceholder={hasSecondSheetColumns ? 'Buscar en Hoja 1...' : 'Buscar columna del Excel...'}
                                      clearValue=""
                                      compact
                                    />
                                  </td>
                                  {hasSecondSheetColumns && (
                                    <td className="px-3 py-2 min-w-[215px]">
                                      <SearchableSelect
                                        options={[
                                          { value: '', label: '-- Sin asignar en H2 --' },
                                          ...secParsedTable.headers.map(h => ({ value: h, label: h })),
                                        ]}
                                        value={mappedSecCol}
                                        onChange={nextVal =>
                                          setSecColumnMapping(prev => ({
                                            ...prev,
                                            [field.key]: nextVal,
                                          }))
                                        }
                                        placeholder="-- Sin asignar en H2 --"
                                        searchPlaceholder="Buscar en Hoja 2..."
                                        clearValue=""
                                        compact
                                      />
                                    </td>
                                  )}
                                  <td className="px-3 py-2 text-[11px] font-mono text-slate-300 max-w-[220px]">
                                    {hasSecondSheetColumns ? (
                                      <div className="space-y-0.5">
                                        {mappedCol && (
                                          <div className="truncate" title={sampleVal || 'Vacía'}>
                                            <span className="text-amber-400 font-bold mr-1">H1:</span>
                                            {sampleVal ? (
                                              <span className="text-amber-200/90">"{sampleVal}"</span>
                                            ) : (
                                              <span className="text-slate-600 italic">Vacía</span>
                                            )}
                                          </div>
                                        )}
                                        {mappedSecCol && (
                                          <div className="truncate" title={secSampleVal || 'Vacía'}>
                                            <span className="text-sky-400 font-bold mr-1">H2:</span>
                                            {secSampleVal ? (
                                              <span className="text-sky-200/90">"{secSampleVal}"</span>
                                            ) : (
                                              <span className="text-slate-600 italic">Vacía</span>
                                            )}
                                          </div>
                                        )}
                                        {!mappedCol && !mappedSecCol && (
                                          <span className="text-slate-600 italic">—</span>
                                        )}
                                      </div>
                                    ) : sampleVal ? (
                                      <div className="truncate">
                                        <span className="text-amber-200/90" title={sampleVal}>
                                          "{sampleVal}"
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-600 italic">
                                        {mappedCol ? 'Celda vacía en primeras filas' : '—'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center whitespace-nowrap">
                                    {hasSecondSheetColumns ? (
                                      hasH1 && hasH2 ? (
                                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 text-[10px] font-bold">
                                          H1 + H2
                                        </span>
                                      ) : hasH1 ? (
                                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                                          Solo H1
                                        </span>
                                      ) : hasH2 ? (
                                        <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/35 text-[10px] font-bold">
                                          Solo H2
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700 text-[10px] font-semibold">
                                          Sin asignar
                                        </span>
                                      )
                                    ) : mappedCol ? (
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                        OK
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700 text-[10px] font-semibold">
                                        Sin asignar
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {unmappedPrimaryHeaders.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-300">
                            Columnas de tu hoja ignoradas ({unmappedPrimaryHeaders.length}):
                          </span>
                          {unmappedPrimaryHeaders.map(col => (
                            <span
                              key={col}
                              className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px] border border-slate-700/70"
                            >
                              {col}
                            </span>
                          ))}
                          <span className="text-slate-500 ml-1">
                            (No se importan salvo que las asignes arriba; si tu Sheet cambia a futuro, podés mapearlas cuando quieras.)
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Date Filter + MARCA_MODELO Filter + Row Selection */}
              {indexedRows.length > 0 && (
                <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-100">
                        4. Filtrar y Elegir Filas a Importar
                      </span>
                      <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {selectedFilteredEntries.length} seleccionadas para importar
                      </span>
                    </div>

                    {hasActiveFilter && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Limpiar Filtros</span>
                      </button>
                    )}
                  </div>

                  {/* Auto-detected Mixed Sheet / TIPO Filter Banner */}
                  {sheetTipoAnalysis.options.length > 0 &&
                    (entity === 'partesDiarios' || entity === 'gastosMantenimiento') && (
                      <div
                        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                          sheetTipoAnalysis.isMixedGastosSheet
                            ? 'bg-amber-500/10 border-amber-500/35'
                            : 'bg-[#0B0D11] border-slate-800'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                            <Filter className="w-3.5 h-3.5" />
                            <span>
                              {sheetTipoAnalysis.isMixedGastosSheet
                                ? 'Planilla "Gastos por Equipos" detectada: Filtrado por TIPO (Solo VENTA)'
                                : entity === 'gastosMantenimiento'
                                  ? 'Filtro por rubro / columna TIPO de Mantenimiento'
                                  : 'Filtro por columna TIPO de la hoja'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300">
                            {sheetTipoAnalysis.isMixedGastosSheet
                              ? 'Esta planilla agrupa COMBUSTIBLE, mantenimiento y VENTA. Para Partes Diarios se seleccionaron únicamente las filas TIPO = VENTA.'
                              : entity === 'gastosMantenimiento'
                                ? 'Podés filtrar los gastos históricos por tipo de gasto del Sheet (ej. CARROCERIA, ACEITES, COMBUSTIBLE, etc.).'
                                : 'Podés acotar las filas por el valor de la columna TIPO del Sheet.'}
                          </p>
                        </div>
                        <div className="min-w-[240px]">
                          <SearchableSelect
                            options={[
                              { value: 'ALL', label: `Todos los tipos (${indexedRows.length})` },
                              ...sheetTipoAnalysis.options.map(opt => ({
                                value: opt.value,
                                label:
                                  opt.value === 'VENTA' && entity === 'partesDiarios'
                                    ? `Solo VENTA (${opt.count}) ★`
                                    : `${opt.value} (${opt.count})`,
                              })),
                            ]}
                            value={selectedSheetTipo}
                            onChange={val => setSelectedSheetTipo(val || 'ALL')}
                            placeholder="Filtrar columna TIPO..."
                            searchPlaceholder="Buscar TIPO..."
                            clearValue="ALL"
                            compact
                          />
                        </div>
                      </div>
                    )}

                  {/* Filter Bar: Fecha + MARCA_MODELO (Tipo Vehículo) + Búsqueda */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 p-3 rounded-xl bg-[#0B0D11] border border-slate-800">
                    {/* Mes / Período */}
                    <div className="lg:col-span-3">
                      <label className="flex items-center gap-1 text-[11px] font-semibold text-amber-300 mb-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Mes / Período ({mappedDateCol || 'Fecha'})</span>
                      </label>
                      <SearchableSelect
                        options={[
                          { value: 'ALL', label: `Todos los meses (${indexedRows.length})` },
                          ...monthOptions.map(m => ({ value: m.key, label: m.label })),
                        ]}
                        value={selectedMonth}
                        onChange={val => setSelectedMonth(val || 'ALL')}
                        placeholder="Todos los meses..."
                        searchPlaceholder="Buscar mes/año..."
                        clearValue="ALL"
                        compact
                      />
                    </div>

                    {/* Rango Desde / Hasta */}
                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Fecha Desde
                      </label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#F0C800]"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Fecha Hasta
                      </label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#F0C800]"
                      />
                    </div>

                    {/* Filtro MARCA_MODELO multi-selección */}
                    <div className="lg:col-span-3">
                      <label className="flex items-center justify-between text-[11px] font-semibold text-sky-300 mb-1">
                        <span className="flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5" />
                          <span>Marca / Modelo (Varios Equipos)</span>
                        </span>
                        {selectedMarcasModelos.length > 0 && (
                          <span className="text-[10px] font-mono text-amber-300">
                            {selectedMarcasModelos.length} elegidos
                          </span>
                        )}
                      </label>
                      <SearchableSelect
                        options={[
                          { value: 'ALL', label: `Todos los vehículos (${marcaModeloOptions.length} tipos)` },
                          ...marcaModeloOptions.map(opt => ({
                            value: opt.value,
                            label: `${opt.value} (${opt.count})`,
                          })),
                        ]}
                        value={selectedMarcasModelos[0] || 'ALL'}
                        onChange={val => setSelectedMarcasModelos(val && val !== 'ALL' ? [val] : [])}
                        multiple
                        selectedValues={selectedMarcasModelos}
                        onChangeMultiple={vals => setSelectedMarcasModelos(vals)}
                        placeholder="Seleccionar uno o varios equipos..."
                        searchPlaceholder="Escribí para filtrar y tildar equipos..."
                        clearValue="ALL"
                        compact
                      />
                    </div>

                    {/* Formato Fecha del Excel */}
                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Formato Fecha Sheet
                      </label>
                      <SearchableSelect
                        options={[
                          { value: 'auto', label: `Auto (${effectiveDateOrder === 'dmy' ? 'DD/MM' : 'MM/DD'})` },
                          { value: 'dmy', label: 'DD/MM/AAAA' },
                          { value: 'mdy', label: 'MM/DD/AAAA' },
                        ]}
                        value={dateOrderPref}
                        onChange={val => setDateOrderPref((val as 'auto' | 'dmy' | 'mdy') || 'auto')}
                        placeholder="Formato fecha..."
                        searchPlaceholder="Buscar formato..."
                        showClear={false}
                        compact
                      />
                    </div>

                    {/* Sub-row: Texto Tipo Vehículo / MARCA_MODELO + Búsqueda General */}
                    <div className="sm:col-span-1 lg:col-span-6 relative">
                      <Truck className="w-3.5 h-3.5 text-sky-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={vehicleTypeSearch}
                        onChange={e => setVehicleTypeSearch(e.target.value)}
                        placeholder="Filtrar por tipo/marca/modelo (ej. HILUX, CAMION, EXCAVADORA, CAT)..."
                        className="w-full bg-[#16191F] border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                      />
                    </div>

                    <div className="sm:col-span-1 lg:col-span-6 relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={generalSearch}
                        onChange={e => setGeneralSearch(e.target.value)}
                        placeholder="Buscar texto en la hoja (chofer, N° vale/orden, patente, estación)..."
                        className="w-full bg-[#16191F] border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F0C800]"
                      />
                    </div>

                    {selectedMarcasModelos.length > 0 && (
                      <div className="sm:col-span-2 lg:col-span-12 flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300 mr-1">
                          Equipos filtrados ({selectedMarcasModelos.length}):
                        </span>
                        {selectedMarcasModelos.map(eq => (
                          <span
                            key={eq}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-500/15 text-sky-200 border border-sky-500/35 text-[11px] font-medium"
                          >
                            <span>{eq}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedMarcasModelos(prev => prev.filter(item => item !== eq))
                              }
                              className="text-sky-300 hover:text-white cursor-pointer"
                              title={`Quitar ${eq}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={() => setSelectedMarcasModelos([])}
                          className="text-[11px] text-amber-300 hover:text-amber-200 font-semibold ml-1 cursor-pointer"
                        >
                          Ver todos
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Row Selection Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectVisibleOnly}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>Marcar visibles ({filteredEntries.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClearVisibleSelection}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <Square className="w-3.5 h-3.5" />
                        <span>Desmarcar visibles</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleInvertVisibleSelection}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold cursor-pointer transition"
                      >
                        Invertir selección
                      </button>
                      <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0B0D11] border border-slate-800 text-[11px] text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={onlyShowSelected}
                          onChange={e => setOnlyShowSelected(e.target.checked)}
                          className="accent-emerald-400 rounded cursor-pointer"
                        />
                        <span>Ver solo seleccionadas</span>
                      </label>
                      {entity === 'gastosMantenimiento' && incompleteIndexedCount > 0 && (
                        <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={onlyIncompleteRows}
                            onChange={e => setOnlyIncompleteRows(e.target.checked)}
                            className="accent-amber-400 rounded cursor-pointer"
                          />
                          <span>Solo incompletos ({incompleteIndexedCount})</span>
                        </label>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Mostrando{' '}
                      <strong className="text-white">{filteredEntries.length}</strong> de{' '}
                      <strong className="text-slate-300">{indexedRows.length}</strong> filas
                      {filteredEntries.length > 150 ? ' (primeras 150 en tabla)' : ''}
                    </div>
                  </div>

                  {/* Selectable Rows Table */}
                  <div className="overflow-auto max-h-[340px] rounded-xl border border-slate-800 bg-[#0B0D11]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/95 text-[10px] uppercase tracking-wider text-slate-400 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2.5 w-10">
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              onChange={handleToggleAllVisible}
                              className="accent-emerald-400 w-3.5 h-3.5 cursor-pointer"
                              title="Seleccionar / deseleccionar todas las filas filtradas"
                            />
                          </th>
                          <th className="px-2.5 py-2.5">{twoSheetCombinedState.active ? 'Origen / #Fila' : '#Fila'}</th>
                          {entity === 'expendio' ? (
                            <>
                              <th className="px-3 py-2.5">Fecha</th>
                              <th className="px-3 py-2.5">Nº Orden</th>
                              <th className="px-3 py-2.5">Equipo</th>
                              <th className="px-3 py-2.5">Marca / Modelo</th>
                              <th className="px-3 py-2.5">Chofer</th>
                              <th className="px-3 py-2.5 text-right">Litros</th>
                              <th className="px-3 py-2.5">Combustible</th>
                              <th className="px-3 py-2.5 text-right">Odómetro</th>
                            </>
                          ) : entity === 'vales' ? (
                            <>
                              <th className="px-3 py-2.5">Fecha</th>
                              <th className="px-3 py-2.5">Nº Vale</th>
                              <th className="px-3 py-2.5">Equipo</th>
                              <th className="px-3 py-2.5">Marca / Modelo</th>
                              <th className="px-3 py-2.5">Chofer</th>
                              <th className="px-3 py-2.5 text-right">Litros</th>
                              <th className="px-3 py-2.5">Estado</th>
                              <th className="px-3 py-2.5">Estación</th>
                            </>
                          ) : entity === 'gastosMantenimiento' ? (
                            <>
                              <th className="px-3 py-2.5">Fecha / ID</th>
                              <th className="px-3 py-2.5">Nº Comp. / Tipo</th>
                              <th className="px-3 py-2.5">Equipo</th>
                              <th className="px-3 py-2.5">Proveedor / Resp.</th>
                              <th className="px-3 py-2.5">Descripción / Marca</th>
                              <th className="px-3 py-2.5 text-right">Cant.</th>
                              <th className="px-3 py-2.5 text-right">Monto ($)</th>
                            </>
                          ) : (
                            <>
                              <th className="px-3 py-2.5">Fecha / ID</th>
                              <th className="px-3 py-2.5">Nº Parte / Estado</th>
                              <th className="px-3 py-2.5">Equipo</th>
                              <th className="px-3 py-2.5">Operador</th>
                              <th className="px-3 py-2.5">Obra</th>
                              <th className="px-3 py-2.5">Modalidad / Detalle / Material</th>
                              <th className="px-3 py-2.5 text-right">Hs / Viajes / Importe</th>
                              <th className="px-3 py-2.5 text-right">Horóm / Km</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {visiblePreviewSlice.length === 0 ? (
                          <tr>
                            <td
                              colSpan={10}
                              className="px-4 py-8 text-center text-slate-500 text-xs"
                            >
                              Ninguna fila coincide con los filtros de Fecha / Marca-Modelo seleccionados.
                            </td>
                          </tr>
                        ) : (
                          visiblePreviewSlice.map(entry => {
                            const isChecked = selectedRowKeys.has(entry.entryKey);
                            return (
                              <tr
                                key={entry.entryKey}
                                onClick={() => handleToggleRowSelection(entry.entryKey)}
                                className={`border-t border-slate-800/80 cursor-pointer transition ${
                                  isChecked
                                    ? 'bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12]'
                                    : 'opacity-55 hover:opacity-85 hover:bg-slate-800/30'
                                }`}
                              >
                                <td
                                  className="px-3 py-2"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleRowSelection(entry.entryKey)}
                                    className="accent-emerald-400 w-3.5 h-3.5 cursor-pointer"
                                  />
                                </td>
                                <td className="px-2.5 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                  <div>#{entry.rowNumber}</div>
                                  {twoSheetCombinedState.active && (
                                    <span
                                      className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                        entry.sourceOrigin === 'H1+H2'
                                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                                          : entry.sourceOrigin === 'H2'
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                                            : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                                      }`}
                                      title={
                                        entry.sourceOrigin === 'H1+H2'
                                          ? `Combinado por ID (Hoja 1 #${entry.rowNumber} + Hoja 2 #${entry.secondaryRowNumber})`
                                          : entry.sourceOrigin === 'H2'
                                            ? 'Solo en 2ª Hoja'
                                            : 'Solo en 1ª Hoja'
                                      }
                                    >
                                      {entry.sourceOrigin}
                                    </span>
                                  )}
                                </td>
                                {renderSelectableRowCells(entry)}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 5. Sync Mode */}
              <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-emerald-400" />
                      Modo de Sincronización con Supabase
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Solo se importarán las{' '}
                      <strong className="text-emerald-300">
                        {selectedFilteredEntries.length} filas marcadas
                      </strong>
                      , esperando confirmación real de Supabase PostgreSQL.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 bg-[#0B0D11] p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSyncMode('merge')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        syncMode === 'merge'
                          ? 'bg-emerald-500 text-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Combinar (Sin borrar)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSyncMode('replace')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        syncMode === 'replace'
                          ? 'bg-rose-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Reemplazar Tabla
                    </button>
                  </div>
                </div>

                {syncMode === 'merge' ? (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 text-[11px] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>Anti-duplicados activo:</strong> Si importás 2 veces el mismo parte o registro (mismo ID de Sheet o mismo Nº de Parte + Equipo + Fecha), <strong>no se duplica</strong>; únicamente se actualiza y completa el registro existente en Supabase.
                    </span>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      Atención: "Reemplazar Tabla" sustituirá los {existingData.length} registros actuales en Supabase únicamente por las {selectedFilteredEntries.length} filas seleccionadas.
                    </span>
                  </div>
                )}
              </div>

              {/* Alerts */}
              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-200 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="flex-1">{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-emerald-200 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="flex-1">{successMsg}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 bg-[#16191F] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {spreadsheetId && selectedTab && (
              <button
                type="button"
                onClick={() => setShowPushConfirm(true)}
                disabled={isWritingSheet || isSavingSupabase || existingData.length === 0}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-bold flex items-center gap-2 border border-slate-700 transition cursor-pointer"
                title="Escribir los registros actuales del sistema hacia la pestaña seleccionada de Google Sheets"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {isWritingSheet
                    ? 'Escribiendo en Sheet...'
                    : `Enviar Sistema → Sheet (${existingData.length})`}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleSyncToSupabase}
              disabled={
                isSavingSupabase ||
                isLoadingSheet ||
                selectedFilteredEntries.length === 0
              }
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-black flex items-center gap-2 shadow-lg transition cursor-pointer"
            >
              <ArrowRightLeft className={`w-4 h-4 ${isSavingSupabase ? 'animate-spin' : ''}`} />
              <span>
                {isSavingSupabase
                  ? 'Confirmando en Supabase...'
                  : `Sincronizar Selección → Supabase (${selectedFilteredEntries.length} filas)`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Explicit Confirmation Modal before modifying/overwriting user's Google Sheet */}
      {showPushConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#16191F] border border-amber-500/40 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">
                  Confirmar escritura en Google Sheets
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Vas a actualizar el contenido de la pestaña{' '}
                  <strong className="text-amber-300">"{selectedTab}"</strong> en la planilla{' '}
                  <strong className="text-white">"{spreadsheetTitle || spreadsheetId}"</strong> con{' '}
                  <strong className="text-emerald-400">{existingData.length} registros</strong> del sistema.
                </p>
                <p className="text-[11px] text-slate-400 mt-2">
                  Las celdas actuales de esa pestaña serán reemplazadas por la tabla exportada. ¿Querés continuar?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPushConfirm(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPushToSheet}
                className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] text-black text-xs font-black cursor-pointer"
              >
                Confirmar y Escribir en Google Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
