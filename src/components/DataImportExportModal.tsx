import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  EntityType, 
  ENTITY_CONFIGS, 
  exportBaseTableTemplate, 
  exportEntityData, 
  parseFileToObjects, 
  parseCsvString,
  detectEntityTypeFromHeaders,
  transformImportedRows,
  getDisplayValueForHeader,
  analyzeImportDates,
  extractDateFromRawRow,
  SPANISH_MONTH_NAMES,
  MonthlySegment,
  DateAnalysisResult,
  SystemFieldDefinition,
  getSystemFieldDefinitions,
  getSmartColumnMapping
} from '../services/importExportService';
import { clearCollectionInCloudAndLocal } from '../services/storage';
import { 
  X, 
  UploadCloud, 
  FileSpreadsheet, 
  Download, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Layers, 
  RefreshCw, 
  Trash2,
  Table as TableIcon,
  Info,
  ClipboardPaste,
  Sparkles,
  ArrowRight,
  Eye,
  Calendar,
  Filter,
  CalendarRange,
  Check,
  AlertTriangle,
  Zap,
  ArrowRightLeft,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  HelpCircle
} from 'lucide-react';

interface DataImportExportModalProps {
  isOpen: boolean;
  entityType: EntityType;
  currentData: any[];
  allAppData?: {
    flota?: any[];
    empleados?: any[];
    expendio?: any[];
    vales?: any[];
    partesDiarios?: any[];
    obras?: any[];
    gastosMantenimiento?: any[];
  };
  onClose: () => void;
  onImportSuccess: (importedItems: any[], mode: 'merge' | 'replace', targetEntity?: EntityType) => void;
  onClearEntityRecords?: (entity: EntityType) => Promise<void> | void;
  onClearAllRecords?: () => Promise<void> | void;
}

export const DataImportExportModal: React.FC<DataImportExportModalProps> = ({
  isOpen,
  entityType,
  currentData,
  allAppData,
  onClose,
  onImportSuccess,
  onClearEntityRecords,
  onClearAllRecords
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [importInputMethod, setImportInputMethod] = useState<'file' | 'paste'>('file');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [targetEntity, setTargetEntity] = useState<EntityType>(entityType);
  
  // File & text state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [totalParsedCount, setTotalParsedCount] = useState<number>(0);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [detectedEntity, setDetectedEntity] = useState<EntityType | null>(null);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [rawParsedData, setRawParsedData] = useState<any[]>([]);
  const [previewMode, setPreviewMode] = useState<'transformed' | 'raw'>('transformed');

  // Date segmentation & filtering state
  const [dateAnalysis, setDateAnalysis] = useState<DateAnalysisResult | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [dateViewMode, setDateViewMode] = useState<'filter' | 'splitMonths'>('filter');
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<string[]>([]);

  // Column mapping states
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isMappingSectionOpen, setIsMappingSectionOpen] = useState<boolean>(true);
  const [mappingFilter, setMappingFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [mappingSearch, setMappingSearch] = useState<string>('');

  // Clear records modal state
  const [isClearModalOpen, setIsClearModalOpen] = useState<boolean>(false);
  const [clearTarget, setClearTarget] = useState<'entity' | 'all'>('entity');
  const [clearConfirmText, setClearConfirmText] = useState<string>('');
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [clearFeedback, setClearFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync targetEntity when entityType prop changes
  useEffect(() => {
    if (isOpen) {
      setTargetEntity(entityType);
    }
  }, [isOpen, entityType]);

  const currentEntityConfig = ENTITY_CONFIGS[targetEntity] || ENTITY_CONFIGS[entityType];

  const systemFields: SystemFieldDefinition[] = useMemo(() => {
    return getSystemFieldDefinitions(targetEntity);
  }, [targetEntity]);

  const mappingStats = useMemo(() => {
    const total = systemFields.length;
    let mapped = 0;
    let unmappedRequired = 0;

    systemFields.forEach(f => {
      const col = columnMapping[f.key];
      if (col && col !== '__none__') {
        mapped++;
      } else if (f.required) {
        unmappedRequired++;
      }
    });

    return {
      total,
      mapped,
      unmapped: total - mapped,
      unmappedRequired,
      isFullyMapped: unmappedRequired === 0
    };
  }, [systemFields, columnMapping]);

  const filteredSystemFields = useMemo(() => {
    return systemFields.filter(field => {
      // Search query
      if (mappingSearch.trim()) {
        const q = mappingSearch.toLowerCase();
        const matchesLabel = field.label.toLowerCase().includes(q);
        const matchesKey = field.key.toLowerCase().includes(q);
        const matchesDesc = (field.description || '').toLowerCase().includes(q);
        if (!matchesLabel && !matchesKey && !matchesDesc) return false;
      }
      // Filter status
      const currentMapped = columnMapping[field.key];
      const isMapped = Boolean(currentMapped && currentMapped !== '__none__' && currentMapped !== '');
      if (mappingFilter === 'mapped' && !isMapped) return false;
      if (mappingFilter === 'unmapped' && isMapped) return false;
      return true;
    });
  }, [systemFields, columnMapping, mappingFilter, mappingSearch]);

  const getSampleValueForFileColumn = (colName: string): string => {
    if (!colName || !rawParsedData || rawParsedData.length === 0) return '';
    for (let i = 0; i < Math.min(rawParsedData.length, 10); i++) {
      const val = rawParsedData[i]?.[colName];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const str = String(val).trim();
        return str.length > 30 ? `${str.slice(0, 30)}...` : str;
      }
    }
    return '';
  };

  const handleColumnMapChange = (systemKey: string, fileCol: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [systemKey]: fileCol
    }));
  };

  const handleAutoMatchColumns = () => {
    if (detectedColumns.length > 0) {
      const smart = getSmartColumnMapping(targetEntity, detectedColumns);
      setColumnMapping(smart);
    }
  };

  const handleClearAllMappings = () => {
    const cleared: Record<string, string> = {};
    systemFields.forEach(f => {
      cleared[f.key] = '';
    });
    setColumnMapping(cleared);
  };

  const getEntityData = (ent: EntityType) => {
    if (ent === targetEntity && currentData) return currentData;
    if (allAppData) {
      return (allAppData as any)[ent] || [];
    }
    return [];
  };

  // Compute filtered rows according to date controls
  const filteredRows = useMemo(() => {
    if (!rawParsedData || rawParsedData.length === 0) return [];
    if (!dateAnalysis || !dateAnalysis.hasDates) return rawParsedData;

    if (dateViewMode === 'splitMonths') {
      if (selectedMonthKeys.length === 0) return [];
      return rawParsedData.filter(row => {
        const d = extractDateFromRawRow(row, targetEntity);
        if (!d || !/^\d{4}-\d{2}/.test(d)) return false;
        const key = d.slice(0, 7);
        return selectedMonthKeys.includes(key);
      });
    }

    // Filter mode: Year & Month dropdowns
    return rawParsedData.filter(row => {
      const d = extractDateFromRawRow(row, targetEntity);
      if (!d || !/^\d{4}-\d{2}/.test(d)) {
        // Only include rows without date if "Todos" is selected in both
        return selectedYear === 'all' && selectedMonth === 'all';
      }
      const y = d.slice(0, 4);
      const m = d.slice(5, 7);

      if (selectedYear !== 'all' && y !== selectedYear) return false;
      if (selectedMonth !== 'all' && m !== selectedMonth) return false;
      return true;
    });
  }, [rawParsedData, dateAnalysis, dateViewMode, selectedMonthKeys, selectedYear, selectedMonth, targetEntity]);

  // Update preview whenever filteredRows, preview mode or columnMapping changes
  useEffect(() => {
    if (filteredRows.length > 0) {
      const existing = getEntityData(targetEntity);
      const result = transformImportedRows(targetEntity, filteredRows.slice(0, 10), existing, importMode, columnMapping);
      setPreviewRows(result.validItems.slice(0, 5));
    } else {
      setPreviewRows([]);
    }
  }, [filteredRows, targetEntity, importMode, columnMapping]);

  const processParsedData = (parsed: any[], sourceName: string, activeEnt: EntityType = targetEntity) => {
    if (!parsed || parsed.length === 0) {
      setErrorMessages(['El archivo o texto no contiene filas de datos o está vacío.']);
      setPreviewRows([]);
      setRawParsedData([]);
      setTotalParsedCount(0);
      setDetectedColumns([]);
      setDetectedEntity(null);
      setDateAnalysis(null);
      setColumnMapping({});
      return;
    }

    setRawParsedData(parsed);
    setTotalParsedCount(parsed.length);
    
    const cols = Object.keys(parsed[0] || {});
    setDetectedColumns(cols);

    // Auto-match columns between file and system
    const smartMapping = getSmartColumnMapping(activeEnt, cols);
    setColumnMapping(smartMapping);

    // Auto-detect entity type from headers
    const autoDetected = detectEntityTypeFromHeaders(cols);
    setDetectedEntity(autoDetected);

    // Analyze dates in parsed rows
    const analysis = analyzeImportDates(parsed, activeEnt);
    setDateAnalysis(analysis);
    if (analysis.monthlySegments.length > 0) {
      setSelectedMonthKeys(analysis.monthlySegments.map(s => s.key));
    } else {
      setSelectedMonthKeys([]);
    }
    setSelectedYear('all');
    setSelectedMonth('all');

    const entityToUse = activeEnt;
    const existing = getEntityData(entityToUse);

    // Transform preview with column mapping applied
    const result = transformImportedRows(entityToUse, parsed.slice(0, 10), existing, importMode, smartMapping);
    setPreviewRows(result.validItems.slice(0, 5));
    if (result.errors.length > 0) {
      setErrorMessages(result.errors.slice(0, 4));
    } else {
      setErrorMessages([]);
    }
  };

  const handleFileSelect = async (file: File) => {
    setErrorMessages([]);
    setSelectedFile(file);
    setIsProcessing(true);

    try {
      const parsed = await parseFileToObjects(file);
      processParsedData(parsed, file.name, targetEntity);
    } catch (err: any) {
      console.error('Error parsing file:', err);
      setErrorMessages([`Error al leer el archivo: ${err.message || 'Formato no soportado'}`]);
      setPreviewRows([]);
      setRawParsedData([]);
      setTotalParsedCount(0);
      setDateAnalysis(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessPastedText = () => {
    if (!pastedText.trim()) {
      setErrorMessages(['Por favor pega el contenido CSV o tabla antes de procesar.']);
      return;
    }
    setErrorMessages([]);
    setIsProcessing(true);

    try {
      const parsed = parseCsvString(pastedText);
      processParsedData(parsed, 'Texto pegado', targetEntity);
    } catch (err: any) {
      setErrorMessages([`Error al procesar texto CSV: ${err.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSwitchTargetEntity = (newEntity: EntityType) => {
    setTargetEntity(newEntity);
    if (rawParsedData.length > 0) {
      const smart = getSmartColumnMapping(newEntity, detectedColumns);
      setColumnMapping(smart);
      const analysis = analyzeImportDates(rawParsedData, newEntity);
      setDateAnalysis(analysis);
      if (analysis.monthlySegments.length > 0) {
        setSelectedMonthKeys(analysis.monthlySegments.map(s => s.key));
      }
      const existing = getEntityData(newEntity);
      const result = transformImportedRows(newEntity, rawParsedData.slice(0, 10), existing, importMode, smart);
      setPreviewRows(result.validItems.slice(0, 5));
      if (result.errors.length > 0) {
        setErrorMessages(result.errors.slice(0, 4));
      } else {
        setErrorMessages([]);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleConfirmImport = (customRows?: any[]) => {
    const rowsToProcess = customRows || filteredRows;
    if (rowsToProcess.length === 0) return;

    setIsProcessing(true);
    try {
      const existing = getEntityData(targetEntity);
      const result = transformImportedRows(targetEntity, rowsToProcess, existing, importMode, columnMapping);
      onImportSuccess(result.validItems, importMode, targetEntity);
      handleReset();
      onClose();
    } catch (err: any) {
      setErrorMessages([`Error procesando importación: ${err.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportSingleMonth = (segment: MonthlySegment) => {
    handleConfirmImport(segment.rows);
  };

  const toggleMonthSelection = (key: string) => {
    setSelectedMonthKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllMonths = () => {
    if (dateAnalysis) {
      setSelectedMonthKeys(dateAnalysis.monthlySegments.map(s => s.key));
    }
  };

  const handleDeselectAllMonths = () => {
    setSelectedMonthKeys([]);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPastedText('');
    setPreviewRows([]);
    setRawParsedData([]);
    setTotalParsedCount(0);
    setDetectedColumns([]);
    setDetectedEntity(null);
    setErrorMessages([]);
    setDateAnalysis(null);
    setSelectedYear('all');
    setSelectedMonth('all');
    setSelectedMonthKeys([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Execution of clearing records
  const handleExecuteClearRecords = async () => {
    setIsClearing(true);
    setClearFeedback(null);
    try {
      if (clearTarget === 'entity') {
        if (onClearEntityRecords) {
          await onClearEntityRecords(targetEntity);
        } else {
          const res = await clearCollectionInCloudAndLocal(targetEntity);
          if (!res.success) {
            throw new Error(res.error || 'No se pudieron limpiar los registros en Supabase.');
          }
        }
        setClearFeedback({
          success: true,
          message: `Todos los registros de ${currentEntityConfig.title} fueron eliminados y confirmados en Supabase PostgreSQL.`
        });
      } else {
        if (onClearAllRecords) {
          await onClearAllRecords();
        } else {
          const res = await clearCollectionInCloudAndLocal('all');
          if (!res.success) {
            throw new Error(res.error || 'No se pudieron limpiar las tablas en Supabase.');
          }
        }
        setClearFeedback({
          success: true,
          message: '¡Todos los registros de todas las tablas fueron eliminados y confirmados en Supabase PostgreSQL!'
        });
      }
      setTimeout(() => {
        setIsClearModalOpen(false);
        setClearConfirmText('');
        setClearFeedback(null);
      }, 1800);
    } catch (err: any) {
      setClearFeedback({
        success: false,
        message: `Error al limpiar registros: ${err.message || 'Error desconocido'}`
      });
    } finally {
      setIsClearing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-[#12151B] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#161922]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-white tracking-tight">
                  Importar y Exportar Datos
                </h2>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Destino:</span>
                  <select
                    value={targetEntity}
                    onChange={(e) => handleSwitchTargetEntity(e.target.value as EntityType)}
                    className="px-2 py-0.5 rounded text-xs font-bold bg-[#1F2228] text-amber-300 border border-amber-500/40 focus:outline-none cursor-pointer"
                  >
                    <option value="partesDiarios">Partes Diarios de Equipos</option>
                    <option value="gastosMantenimiento">Gastos de Mantenimiento & Repuestos</option>
                    <option value="expendio">Expendio de Combustible (22 Col)</option>
                    <option value="vales">Vales de Combustible</option>
                    <option value="flota">Flota Vehicular & Maquinaria</option>
                    <option value="empleados">Nómina de Empleados / Choferes</option>
                    <option value="obras">Registro de Obras</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Carga masiva, importación por fecha (año/mes), segmentación mensual y exportación sincronizada con la base de datos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Limpiar Registros Button */}
            <button
              type="button"
              onClick={() => {
                setClearTarget('entity');
                setClearConfirmText('');
                setClearFeedback(null);
                setIsClearModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/30 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Limpiar registros existentes en la base de datos"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpiar Registros</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleReset();
                onClose();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-800/80 bg-[#12151B]">
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'import'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>1. Importar Archivo / Pegar Texto</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'export'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>2. Descargar Plantilla Base / Exportar</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-300">
          
          {/* TAB 1: IMPORT */}
          {activeTab === 'import' && (
            <div className="space-y-5">
              
              {/* Plantilla Base Quick Helper Banner */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs text-slate-300">
                    Importando a: <strong>{currentEntityConfig.title}</strong>. Puedes subir un archivo <strong>.csv / .xlsx</strong> o pegar el texto directamente.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => exportBaseTableTemplate(targetEntity, 'xlsx')}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar Plantilla Base (.xlsx)</span>
                </button>
              </div>

              {/* Sub-tab: File upload vs Paste text */}
              <div className="flex items-center gap-2 bg-[#161922] p-1 rounded-xl border border-slate-800 w-fit">
                <button
                  type="button"
                  onClick={() => setImportInputMethod('file')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    importInputMethod === 'file'
                      ? 'bg-amber-500 text-black shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Subir Archivo (.csv, .xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportInputMethod('paste')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    importInputMethod === 'paste'
                      ? 'bg-amber-500 text-black shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>Pegar Texto CSV / Tabla</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              {importInputMethod === 'file' && (
                !selectedFile ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition ${
                      isDragging
                        ? 'border-amber-500 bg-amber-500/10 scale-[0.99]'
                        : 'border-slate-800 hover:border-slate-700 bg-[#161922]/60 hover:bg-[#161922]'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileSelect(e.target.files[0]);
                        }
                      }}
                    />
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 shadow-inner">
                      <UploadCloud className="w-7 h-7" />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">
                      Arrastra tu archivo aquí o haz clic para seleccionarlo
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md">
                      Formatos soportados: <strong>Excel (.xlsx, .xls)</strong> y <strong>CSV / Texto (.csv, .txt)</strong> con delimitadores estándar (, ; \t).
                    </p>
                  </div>
                ) : (
                  /* Selected File Card */
                  <div className="p-4 rounded-xl bg-[#161922] border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <span>{selectedFile.name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        <p className="text-xs text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Se detectaron {totalParsedCount} filas de datos para procesar</span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Cambiar archivo</span>
                    </button>
                  </div>
                )
              )}

              {/* Paste CSV Text Area */}
              {importInputMethod === 'paste' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <ClipboardPaste className="w-4 h-4 text-amber-400" />
                      <span>Pega aquí tu contenido CSV o datos separados por punto y coma (;) o comas:</span>
                    </label>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {pastedText ? `${pastedText.split('\n').length} líneas` : 'Vacío'}
                    </span>
                  </div>

                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder='ID;CARGA;TIPO;ID_COMBUSTIBLE;DEPOSITO;CANTIDAD;TIPO_COMB;FECHA;...\n"c6ca9015";"TANQUE LLENO";"EGRESO";"50b15e07";"Estación YPF";-694;"DIESEL";"2026-03-15";...'
                    rows={6}
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
                  />

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleProcessPastedText}
                      disabled={!pastedText.trim() || isProcessing}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:pointer-events-none text-black text-xs font-black flex items-center gap-2 transition cursor-pointer shadow-md shadow-amber-500/20"
                    >
                      {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>Procesar y Reconocer Columnas</span>
                    </button>

                    {rawParsedData.length > 0 && (
                      <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{totalParsedCount} filas procesadas</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Smart Auto-Detection Banner */}
              {detectedEntity && detectedEntity !== targetEntity && (
                <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500 text-black shrink-0 font-bold">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                        <span>Formato Reconocido Automáticamente</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Las columnas de este archivo coinciden con <strong>{ENTITY_CONFIGS[detectedEntity]?.title}</strong>. ¿Deseas redirigir la importación a esa tabla?
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSwitchTargetEntity(detectedEntity)}
                    className="shrink-0 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-md"
                  >
                    <span>Importar como {ENTITY_CONFIGS[detectedEntity]?.singularTitle}</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
              )}

              {/* COLUMN MAPPING / MATCHEO DE COLUMNAS SECTION */}
              {rawParsedData.length > 0 && detectedColumns.length > 0 && (
                <div className="p-4.5 rounded-2xl bg-[#161922] border border-amber-500/30 space-y-4 shadow-lg shadow-black/40 animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <ArrowRightLeft className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5">
                            <span>Matcheo de Columnas ({currentEntityConfig.title})</span>
                          </h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            {mappingStats.mapped} de {mappingStats.total} emparejadas
                          </span>
                          {mappingStats.unmappedRequired > 0 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                              {mappingStats.unmappedRequired} obligatorios sin asignar
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Empareja las columnas de tu archivo Excel/CSV con los campos del sistema. Si los nombres no coinciden, cámbialos aquí.
                        </p>
                      </div>
                    </div>

                    {/* Action buttons & collapse toggle */}
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={handleAutoMatchColumns}
                        title="Reconocer automáticamente nombres de columnas por sinónimos y similitud"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Auto-emparejar</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleClearAllMappings}
                        title="Despejar todas las asignaciones para mapear desde cero"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                      >
                        <span>Limpiar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsMappingSectionOpen(prev => !prev)}
                        className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                        title={isMappingSectionOpen ? "Contraer mapeo" : "Expandir mapeo"}
                      >
                        {isMappingSectionOpen ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Body when open */}
                  {isMappingSectionOpen && (
                    <div className="space-y-3">
                      {/* Search and Filters toolbar */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#0F1115] p-2.5 rounded-xl border border-slate-800">
                        {/* Search input */}
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={mappingSearch}
                            onChange={e => setMappingSearch(e.target.value)}
                            placeholder="Buscar campo (ej: vale, litros, fecha, chofer, móvil, equipo...)"
                            className="w-full bg-[#161922] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                          />
                          {mappingSearch && (
                            <button
                              type="button"
                              onClick={() => setMappingSearch('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Status filter pills */}
                        <div className="flex items-center gap-1 bg-[#161922] p-1 rounded-lg border border-slate-800 text-[11px]">
                          <button
                            type="button"
                            onClick={() => setMappingFilter('all')}
                            className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                              mappingFilter === 'all'
                                ? 'bg-amber-500 text-black shadow-xs'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Todos ({systemFields.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setMappingFilter('mapped')}
                            className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                              mappingFilter === 'mapped'
                                ? 'bg-amber-500 text-black shadow-xs'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Emparejados ({mappingStats.mapped})
                          </button>
                          <button
                            type="button"
                            onClick={() => setMappingFilter('unmapped')}
                            className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                              mappingFilter === 'unmapped'
                                ? 'bg-amber-500 text-black shadow-xs'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Sin Asignar ({mappingStats.unmapped})
                          </button>
                        </div>
                      </div>

                      {/* Mapping rows grid */}
                      <div className="max-h-80 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-800/40">
                        {filteredSystemFields.length === 0 ? (
                          <div className="text-center py-6 text-slate-500 text-xs">
                            No se encontraron campos con el criterio de búsqueda o filtro seleccionado.
                          </div>
                        ) : (
                          filteredSystemFields.map((field) => {
                            const mappedCol = columnMapping[field.key] || '';
                            const isAssigned = mappedCol !== '' && mappedCol !== '__none__';
                            const sampleValue = isAssigned ? getSampleValueForFileColumn(mappedCol) : '';

                            return (
                              <div
                                key={field.key}
                                className={`pt-2.5 pb-2.5 px-3 rounded-xl transition flex flex-col md:flex-row md:items-center justify-between gap-3 border ${
                                  !isAssigned && field.required
                                    ? 'bg-red-500/5 border-red-500/30'
                                    : isAssigned
                                    ? 'bg-[#0F1115]/60 border-slate-800 hover:border-slate-700'
                                    : 'bg-[#0F1115]/30 border-slate-800/60 opacity-80'
                                }`}
                              >
                                {/* Left: System Field Information */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-white">
                                      {field.label}
                                    </span>
                                    <span className="font-mono text-[10px] text-slate-500 bg-slate-800/70 px-1.5 py-0.5 rounded">
                                      {field.key}
                                    </span>
                                    {field.required ? (
                                      <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-1.5 py-0.2 rounded">
                                        * Requerido
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-500">
                                        Opcional
                                      </span>
                                    )}
                                  </div>
                                  {field.description && (
                                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                      {field.description}
                                    </p>
                                  )}
                                </div>

                                {/* Center: Arrow separator */}
                                <div className="hidden md:flex items-center text-slate-600 px-1">
                                  <ArrowRightLeft className="w-4 h-4 text-amber-500/50" />
                                </div>

                                {/* Right: File Header Dropdown & Sample Preview */}
                                <div className="flex-1 min-w-0 md:max-w-xs space-y-1">
                                  <select
                                    value={mappedCol}
                                    onChange={(e) => handleColumnMapChange(field.key, e.target.value)}
                                    className={`w-full text-xs rounded-lg px-2.5 py-1.5 font-medium transition focus:outline-none cursor-pointer ${
                                      isAssigned
                                        ? 'bg-slate-900 border border-amber-500/50 text-amber-300 focus:border-amber-400'
                                        : field.required
                                        ? 'bg-red-950/30 border border-red-500/40 text-red-300 focus:border-red-400'
                                        : 'bg-slate-900 border border-slate-700 text-slate-400 focus:border-slate-500'
                                    }`}
                                  >
                                    <option value="">-- No importar / Dejar vacío --</option>
                                    {detectedColumns.map((col) => (
                                      <option key={col} value={col}>
                                        {col}
                                      </option>
                                    ))}
                                  </select>

                                  {/* Live Sample snippet */}
                                  {isAssigned ? (
                                    <div className="text-[10px] text-slate-400 flex items-center gap-1 truncate font-mono">
                                      <span className="text-amber-400 font-bold">Ej:</span>
                                      <span className="text-slate-300 truncate">
                                        {sampleValue !== '' ? `"${sampleValue}"` : '(campo vacío en filas iniciales)'}
                                      </span>
                                    </div>
                                  ) : field.required ? (
                                    <div className="text-[10px] text-red-400 flex items-center gap-1 font-semibold">
                                      <span>⚠️ Se requiere para validar {currentEntityConfig.singularTitle}</span>
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-slate-500">
                                      Se dejará en blanco o valor por defecto
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Informational tip */}
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200/90 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>Previsualización en tiempo real:</strong> Al cambiar cualquier mapeo de columna arriba, la tabla de previsualización inferior se actualiza al instante con los datos transformados.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* DATE SEGMENTATION & MONTH-BY-MONTH IMPORT SECTION */}
              {rawParsedData.length > 0 && dateAnalysis && dateAnalysis.hasDates && (
                <div className="p-4.5 rounded-2xl bg-[#161922] border border-cyan-500/30 space-y-4 shadow-lg shadow-black/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5">
                            <span>Importación por Fecha & Segmentación Temporal</span>
                          </h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                            {filteredRows.length} de {rawParsedData.length} seleccionadas
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Filtra por año, mes o segmenta la carga mes a mes para importar en lotes organizados.
                        </p>
                      </div>
                    </div>

                    {/* Mode switcher: Filter vs Split Months */}
                    <div className="flex items-center bg-[#0F1115] p-1 rounded-xl border border-slate-800 text-xs">
                      <button
                        type="button"
                        onClick={() => setDateViewMode('filter')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                          dateViewMode === 'filter'
                            ? 'bg-cyan-500 text-black shadow-xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Filter className="w-3.5 h-3.5" />
                        <span>Filtro Año / Mes</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDateViewMode('splitMonths')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                          dateViewMode === 'splitMonths'
                            ? 'bg-cyan-500 text-black shadow-xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <CalendarRange className="w-3.5 h-3.5" />
                        <span>Dividir Mes a Mes ({dateAnalysis.monthlySegments.length})</span>
                      </button>
                    </div>
                  </div>

                  {/* OPTION A: Filter by Year and Month */}
                  {dateViewMode === 'filter' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Year Selector */}
                        <div>
                          <label className="text-[11px] font-bold text-slate-300 block mb-1">
                            Filtrar por Año:
                          </label>
                          <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="w-full bg-[#0F1115] border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500 transition cursor-pointer"
                          >
                            <option value="all">Todos los Años ({rawParsedData.length} registros)</option>
                            {dateAnalysis.availableYears.map(year => {
                              const count = rawParsedData.filter(r => {
                                const d = extractDateFromRawRow(r, targetEntity);
                                return d && d.startsWith(year);
                              }).length;
                              return (
                                <option key={year} value={year}>
                                  Año {year} ({count} registros)
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {/* Month Selector */}
                        <div>
                          <label className="text-[11px] font-bold text-slate-300 block mb-1">
                            Filtrar por Mes:
                          </label>
                          <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="w-full bg-[#0F1115] border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500 transition cursor-pointer"
                          >
                            <option value="all">Todos los Meses</option>
                            {SPANISH_MONTH_NAMES.map((mName, idx) => {
                              const mNum = String(idx + 1).padStart(2, '0');
                              const count = rawParsedData.filter(r => {
                                const d = extractDateFromRawRow(r, targetEntity);
                                if (!d || d.length < 7) return false;
                                if (selectedYear !== 'all' && !d.startsWith(selectedYear)) return false;
                                return d.slice(5, 7) === mNum;
                              }).length;
                              if (count === 0 && selectedYear !== 'all') return null;
                              return (
                                <option key={mNum} value={mNum}>
                                  {mName} ({count} registros)
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {/* Active Filter Pill */}
                      {(selectedYear !== 'all' || selectedMonth !== 'all') && (
                        <div className="flex items-center justify-between bg-cyan-500/10 border border-cyan-500/30 rounded-xl px-3 py-2 text-xs">
                          <span className="text-cyan-300 font-medium">
                            Filtro activo: {selectedYear !== 'all' ? `Año ${selectedYear}` : 'Todos los años'} • {selectedMonth !== 'all' ? SPANISH_MONTH_NAMES[parseInt(selectedMonth, 10) - 1] : 'Todos los meses'} (<strong>{filteredRows.length}</strong> de {rawParsedData.length} filas coinciden)
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedYear('all');
                              setSelectedMonth('all');
                            }}
                            className="text-[11px] font-bold text-cyan-400 hover:text-white underline cursor-pointer"
                          >
                            Limpiar filtros de fecha
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* OPTION B: Split Month-by-Month (Batch Cards) */}
                  {dateViewMode === 'splitMonths' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          Selecciona los meses que deseas importar o utiliza el botón <strong>"Importar este mes"</strong> en cada tarjeta:
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSelectAllMonths}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition cursor-pointer"
                          >
                            Seleccionar todos
                          </button>
                          <button
                            type="button"
                            onClick={handleDeselectAllMonths}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition cursor-pointer"
                          >
                            Deseleccionar todos
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-64 overflow-y-auto p-1">
                        {dateAnalysis.monthlySegments.map(segment => {
                          const isSelected = selectedMonthKeys.includes(segment.key);
                          return (
                            <div
                              key={segment.key}
                              className={`p-3.5 rounded-xl border transition flex flex-col justify-between gap-3 ${
                                isSelected
                                  ? 'bg-cyan-500/10 border-cyan-500/50 shadow-xs'
                                  : 'bg-[#0F1115] border-slate-800 opacity-70 hover:opacity-100'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleMonthSelection(segment.key)}
                                    className="accent-cyan-500 rounded"
                                  />
                                  <span className="text-xs font-black text-white">
                                    {segment.label}
                                  </span>
                                </label>
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                                  {segment.count} filas
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleImportSingleMonth(segment)}
                                className="w-full py-1.5 px-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-black flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer active:scale-95"
                                title={`Importar exclusivamente los ${segment.count} registros de ${segment.label}`}
                              >
                                <Zap className="w-3 h-3 text-cyan-200" />
                                <span>Importar sólo este mes</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* Import Mode Radio Switcher */}
              <div className="p-4 rounded-xl bg-[#161922] border border-slate-800 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Modo de Importación en {currentEntityConfig.title}:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Merge option */}
                  <label 
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                      importMode === 'merge'
                        ? 'bg-amber-500/10 border-amber-500/50 text-white shadow-xs'
                        : 'bg-[#12151B] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="mt-1 accent-amber-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span>Combinar y Actualizar (Recomendado)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Mantiene los registros existentes, añade los nuevos y actualiza los que coincidan por ID o código.
                      </p>
                    </div>
                  </label>

                  {/* Replace option */}
                  <label 
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                      importMode === 'replace'
                        ? 'bg-red-500/10 border-red-500/50 text-white shadow-xs'
                        : 'bg-[#12151B] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="mt-1 accent-red-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 text-red-400" />
                        <span>Reemplazar Tabla Completa</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Borra todos los registros actuales de {currentEntityConfig.title.toLowerCase()} y los reemplaza con los del archivo.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Error messages if any */}
              {errorMessages.length > 0 && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>Avisos durante la lectura:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-300">
                    {errorMessages.map((msg, idx) => (
                      <li key={idx}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Data Preview Table */}
              {previewRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-300 flex items-center gap-1.5">
                        <TableIcon className="w-3.5 h-3.5 text-amber-400" />
                        <span>Previsualización (Primeras {previewRows.length} de {filteredRows.length} filas a importar):</span>
                      </span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        ({detectedColumns.length} columnas en archivo)
                      </span>
                    </div>

                    {/* View mode toggle */}
                    <div className="flex items-center bg-[#161922] p-0.5 rounded-lg border border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setPreviewMode('transformed')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                          previewMode === 'transformed'
                            ? 'bg-amber-500 text-black shadow-xs font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Mapeo a {currentEntityConfig.singularTitle}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode('raw')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                          previewMode === 'raw'
                            ? 'bg-amber-500 text-black shadow-xs font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Eye className="w-3 h-3" />
                        <span>Columnas Originales ({detectedColumns.length})</span>
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-800 rounded-xl overflow-x-auto bg-[#0F1115] max-h-60">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-[#161922] text-slate-400 border-b border-slate-800 font-mono text-[10px] uppercase sticky top-0 z-10 shadow-xs">
                        <tr>
                          <th className="px-3 py-2 bg-[#161922]">#</th>
                          {previewMode === 'transformed' ? (
                            currentEntityConfig.baseHeaders.slice(0, 10).map(h => (
                              <th key={h} className="px-3 py-2 text-slate-300 bg-[#161922]">{h}</th>
                            ))
                          ) : (
                            detectedColumns.slice(0, 12).map(h => (
                              <th key={h} className="px-3 py-2 text-amber-300 bg-[#161922] font-semibold">{h}</th>
                            ))
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] text-slate-300">
                        {previewRows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-800/30">
                            <td className="px-3 py-2 text-slate-500 font-bold">{rIdx + 1}</td>
                            {previewMode === 'transformed' ? (
                              currentEntityConfig.baseHeaders.slice(0, 10).map(h => {
                                const val = getDisplayValueForHeader(row, h);
                                return (
                                  <td key={h} className="px-3 py-2 max-w-[160px] truncate">
                                    {typeof val === 'object' ? JSON.stringify(val) : String(val !== undefined && val !== null ? val : '-')}
                                  </td>
                                );
                              })
                            ) : (
                              detectedColumns.slice(0, 12).map(h => {
                                const rawRow = filteredRows[rIdx] || {};
                                const val = rawRow[h];
                                return (
                                  <td key={h} className="px-3 py-2 max-w-[160px] truncate text-slate-200">
                                    {typeof val === 'object' ? JSON.stringify(val) : String(val !== undefined && val !== null && val !== '' ? val : '-')}
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: EXPORT & TEMPLATE */}
          {activeTab === 'export' && (
            <div className="space-y-6">
              
              {/* Option A: Base Table Template */}
              <div className="p-5 rounded-2xl bg-[#161922] border border-slate-800 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                    <TableIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Plantilla Base de {currentEntityConfig.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Descarga una planilla vacía con la estructura exacta de columnas ({currentEntityConfig.baseHeaders.length} campos) y una fila de ejemplo para que puedas completarla en Excel o cualquier software de hoja de cálculo.
                    </p>
                  </div>
                </div>

                {/* Column list preview */}
                <div className="bg-[#0F1115] border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-2">
                    Estructura oficial de columnas:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentEntityConfig.baseHeaders.map((col) => (
                      <span key={col} className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 text-[11px] font-mono border border-slate-700">
                        {col}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => exportBaseTableTemplate(targetEntity, 'xlsx')}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-md transition cursor-pointer active:scale-95"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Descargar Plantilla Base Excel (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportBaseTableTemplate(targetEntity, 'csv')}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span>Descargar Plantilla Base CSV (.csv)</span>
                  </button>
                </div>
              </div>

              {/* Option B: Export Current Live Data */}
              <div className="p-5 rounded-2xl bg-[#161922] border border-slate-800 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                    <Download className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Exportar Datos Actuales ({currentData.length} registros)
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Genera un archivo completo con todos los registros guardados actualmente en la base de datos de {currentEntityConfig.title.toLowerCase()}.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => exportEntityData(targetEntity, currentData, 'xlsx')}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-md transition cursor-pointer active:scale-95"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Exportar Datos en Excel (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportEntityData(targetEntity, currentData, 'csv')}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>Exportar Datos en CSV (.csv)</span>
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-[#161922] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {activeTab === 'import' && totalParsedCount > 0 && (
              <span>
                Listo para importar <strong>{filteredRows.length}</strong> de {totalParsedCount} filas en <strong>{currentEntityConfig.title}</strong> (Modo: <strong>{importMode === 'merge' ? 'Combinar' : 'Reemplazar'}</strong>)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                handleReset();
                onClose();
              }}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Cerrar
            </button>

            {activeTab === 'import' && (
              <button
                type="button"
                disabled={filteredRows.length === 0 || isProcessing}
                onClick={() => handleConfirmImport()}
                className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:pointer-events-none text-black text-xs font-black shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <UploadCloud className="w-4 h-4 stroke-[2.5]" />
                )}
                <span>Confirmar e Importar en {currentEntityConfig.singularTitle} ({filteredRows.length} filas)</span>
              </button>
            )}
          </div>
        </div>

      </div>

      {/* CONFIRMATION MODAL TO CLEAR RECORDS (MASTER & ENTITY SAFEGUARD) */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#141720] border border-red-500/40 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 text-white">
            
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="p-3 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/40">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  Limpieza y Vaciado de Registros
                </h3>
                <p className="text-xs text-red-300 font-medium">
                  Sincronizado al 100% con la base de datos Supabase y almacenamiento local
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Selecciona el alcance de la limpieza. Los registros seleccionados se borrarán de forma <strong>permanente e irreversible</strong>:
              </p>

              {/* Target Radios */}
              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  clearTarget === 'entity'
                    ? 'bg-red-500/15 border-red-500/50 text-white'
                    : 'bg-[#0F1115] border-slate-800 text-slate-400'
                }`}>
                  <input
                    type="radio"
                    name="clearTarget"
                    checked={clearTarget === 'entity'}
                    onChange={() => setClearTarget('entity')}
                    className="mt-0.5 accent-red-500"
                  />
                  <div>
                    <span className="font-bold text-white block">
                      Limpiar sólo: {currentEntityConfig.title}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Eliminará los {getEntityData(targetEntity).length} registros actuales de esta tabla tanto en la nube como localmente.
                    </span>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  clearTarget === 'all'
                    ? 'bg-red-500/20 border-red-500/60 text-white ring-1 ring-red-500/40'
                    : 'bg-[#0F1115] border-slate-800 text-slate-400'
                }`}>
                  <input
                    type="radio"
                    name="clearTarget"
                    checked={clearTarget === 'all'}
                    onChange={() => setClearTarget('all')}
                    className="mt-0.5 accent-red-500"
                  />
                  <div>
                    <span className="font-black text-red-400 block flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpiar TODOS los registros del sistema (Base de datos completa)</span>
                    </span>
                    <span className="text-[11px] text-slate-300">
                      Vaciará absolutamente todas las colecciones: Flota, Empleados, Expendio, Vales, Partes Diarios, Obras, Depósitos, Alquileres, Ferretería y Áridos.
                    </span>
                  </div>
                </label>
              </div>

              {/* Confirmation input */}
              <div className="pt-2 space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 block">
                  Para confirmar la acción, escribe la palabra <strong className="text-red-400 font-mono">LIMPIAR</strong> a continuación:
                </label>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value.toUpperCase())}
                  placeholder="Escribe LIMPIAR"
                  className="w-full bg-[#0F1115] border border-red-500/40 rounded-xl px-3 py-2 text-xs font-mono font-bold text-red-300 focus:outline-none focus:border-red-500"
                />
              </div>

              {clearFeedback && (
                <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  clearFeedback.success ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}>
                  {clearFeedback.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{clearFeedback.message}</span>
                </div>
              )}
            </div>

            {/* Modal actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={clearConfirmText.trim() !== 'LIMPIAR' || isClearing}
                onClick={handleExecuteClearRecords}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:pointer-events-none text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-red-600/30 transition cursor-pointer active:scale-95"
              >
                {isClearing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Confirmar y Vaciar Registros</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
