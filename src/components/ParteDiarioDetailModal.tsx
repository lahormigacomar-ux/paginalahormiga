import React, { useMemo, useRef, useState } from 'react';
import { 
  ParteDiario, 
  Employee, 
  SupabaseRegistro, 
  SupabaseUsuario, 
  SupabaseLicencia, 
  SupabaseCategoria,
  RentalContract,
  ArcaInvoice,
  FuelDispensary,
  Vehicle,
  DocumentBagItem
} from '../types';
import { 
  X, 
  ClipboardList, 
  Calendar, 
  Wrench, 
  Users, 
  MapPin, 
  Clock, 
  Truck, 
  ShieldCheck,
  UserCheck,
  ArrowUpRight,
  ArrowDownLeft,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Info,
  CalendarDays,
  User,
  Link2,
  Receipt,
  FileCheck2,
  Fuel,
  Camera,
  ExternalLink,
  Unlink,
  FileText,
  FolderOpen,
  Paperclip,
  Upload,
  Loader2,
  Trash2
} from 'lucide-react';
import { resolveParteDiarioLinks, resolveRentalContractLinks, formatInvoiceLabel, formatInvoiceNumber, isExternalMigratedInvoice } from '../utils/crossLinks';
import { buildPartesKilometrajeCrossMap, formatCrossDateDDMMYYYY } from '../utils/parteKilometrajeCross';
import { uploadFileToCloudflareR2 } from '../services/api';
import { BolsaDocumentosPickerModal } from './common/BolsaDocumentosPickerModal';

const isPdfUrl = (url?: string): boolean => {
  if (!url) return false;
  const clean = url.split('?')[0].toLowerCase();
  return clean.endsWith('.pdf') || url.toLowerCase().includes('application/pdf');
};

interface ParteDiarioDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  parte: ParteDiario | null;
  onEdit?: (parte: ParteDiario) => void;
  employees?: Employee[];
  supabaseRegistros?: SupabaseRegistro[];
  supabaseUsuarios?: SupabaseUsuario[];
  supabaseLicencias?: SupabaseLicencia[];
  supabaseCategorias?: SupabaseCategoria[];
  rentals?: RentalContract[];
  invoices?: ArcaInvoice[];
  fuelVouchers?: FuelDispensary[];
  fleet?: Vehicle[];
  partesDiarios?: ParteDiario[];
  linkedDocuments?: DocumentBagItem[];
  bolsaDocumentos?: DocumentBagItem[];
  onLinkBolsaDocument?: (docId: string, targetId: string, targetLabel: string) => void;
  onUnlinkDocument?: (docId: string) => void;
  onUpdateParte?: (parte: ParteDiario) => void;
  onNavigateToCobranzas?: () => void;
}

export const ParteDiarioDetailModal: React.FC<ParteDiarioDetailModalProps> = ({
  isOpen,
  onClose,
  parte,
  onEdit,
  employees = [],
  supabaseRegistros = [],
  supabaseUsuarios = [],
  supabaseLicencias = [],
  supabaseCategorias = [],
  rentals = [],
  invoices = [],
  fuelVouchers = [],
  fleet = [],
  partesDiarios = [],
  linkedDocuments = [],
  bolsaDocumentos = [],
  onLinkBolsaDocument,
  onUnlinkDocument,
  onUpdateParte,
  onNavigateToCobranzas,
}) => {
  const [activeDocPhoto, setActiveDocPhoto] = useState<DocumentBagItem | null>(null);
  const [isDocsPickerOpen, setIsDocsPickerOpen] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [uploadAttachmentError, setUploadAttachmentError] = useState<string | null>(null);
  const attachmentsSectionRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper to normalize strings for robust fuzzy comparison
  const normalizeText = (s?: string) => {
    if (!s) return '';
    return String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Helper to check if two names match (handles inverted names: "RAMOS CARLOS" vs "Carlos Ramos")
  const areNamesFuzzyMatch = (a?: string, b?: string): boolean => {
    const normA = normalizeText(a);
    const normB = normalizeText(b);
    if (!normA || !normB) return false;
    if (normA === normB) return true;
    if (normA.includes(normB) || normB.includes(normA)) return true;

    const tokensA = normA.split(' ').filter(t => t.length > 1);
    const tokensB = normB.split(' ').filter(t => t.length > 1);
    if (tokensA.length === 0 || tokensB.length === 0) return false;

    // Check if tokens overlap significantly
    const matchingTokens = tokensA.filter(t => tokensB.includes(t) || tokensB.some(tb => tb.startsWith(t) || t.startsWith(tb)));
    if (matchingTokens.length >= 2) return true;
    if (matchingTokens.length === 1 && (tokensA.length === 1 || tokensB.length === 1)) return true;

    return false;
  };

  // Helper to extract comparable date keys (YYYY-MM-DD) supporting DD/MM/YYYY, D/M/YYYY, ISO strings and timezones
  const getDateKeys = (dStr?: string): string[] => {
    if (!dStr) return [];
    const clean = String(dStr).trim();
    const keys = new Set<string>();

    // 1. If contains slash (e.g. 3/9/2026, 03/09/2026, 2026/09/03)
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        let year = parts[2];
        if (year.length === 2) year = `20${year}`;
        if (year.length === 4) {
          // DD/MM/YYYY (Latin America)
          const p0 = parts[0].padStart(2, '0');
          const p1 = parts[1].padStart(2, '0');
          keys.add(`${year}-${p1}-${p0}`);
          // Also check MM/DD/YYYY in case of US formatted source
          keys.add(`${year}-${p0}-${p1}`);
        } else if (parts[0].length === 4) {
          // YYYY/MM/DD
          keys.add(`${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`);
        }
      }
    }

    // 2. If contains hyphen (e.g. 2026-09-03 or 03-09-2026)
    if (clean.includes('-')) {
      const parts = clean.split('T')[0].split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          keys.add(`${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`);
        } else if (parts[2].length === 4) {
          keys.add(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
        }
      }
    }

    // 3. Date object parsing for UTC & Local Argentina timezone
    try {
      const d = new Date(clean);
      if (!isNaN(d.getTime())) {
        const utcYear = d.getUTCFullYear();
        const utcMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
        const utcDay = String(d.getUTCDate()).padStart(2, '0');
        keys.add(`${utcYear}-${utcMonth}-${utcDay}`);

        const locYear = d.getFullYear();
        const locMonth = String(d.getMonth() + 1).padStart(2, '0');
        const locDay = String(d.getDate()).padStart(2, '0');
        keys.add(`${locYear}-${locMonth}-${locDay}`);
      }
    } catch {}

    if (keys.size === 0 && clean.length >= 8) {
      keys.add(clean.slice(0, 10));
    }

    return Array.from(keys);
  };

  // Helper to format clean HH:mm from ISO or time string
  const formatTimeClean = (timeVal?: string): string => {
    if (!timeVal) return '';
    const clean = String(timeVal).trim();
    if (clean.includes('T')) {
      try {
        const d = new Date(clean);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        }
      } catch {}
    }
    // If format like "08:00:00" or "08:00"
    const match = clean.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`;
    }
    return clean;
  };

  // Calculate operator attendance from Supabase
  const operatorAttendance = useMemo(() => {
    if (!parte) return null;

    const targetDateKeys = getDateKeys(parte.fecha);
    const opName = (parte.nombreApellido || (parte as any).chofer || (parte as any).operador || '').trim();
    const opCode = (parte.codigoEmpleado || '').trim();
    const opCodeClean = normalizeText(opCode);

    // 1. Find in employees list
    const emp = employees.find(e => {
      const eId = (e.id || '').trim();
      const eCode = (e.codigoEmpleado || '').trim();
      const eLegajo = (e.legajo || '').trim();
      const eName = e.nombreApellido || e.nombre || '';

      if (opCode && (eCode === opCode || eLegajo === opCode || eId === opCode || eId.startsWith(opCode))) return true;
      if (opName && areNamesFuzzyMatch(eName, opName)) return true;
      return false;
    });

    // 2. Find in Supabase Users (direct UUID, short prefix, legajo or fuzzy name)
    const supUser = supabaseUsuarios.find(u => {
      const uId = (u.id || '').trim();
      const uLegajo = (u.legajo || '').trim();
      const uName = (u.nombre || '').trim();

      // Direct match with matched employee
      if (emp && (u.id === emp.id || (emp.legajo && u.legajo === emp.legajo) || areNamesFuzzyMatch(uName, emp.nombreApellido))) {
        return true;
      }

      // Match by opCode (supports full UUID, short UUID prefix e.g. "f65fdici", or legajo)
      if (opCode) {
        if (uId.toLowerCase() === opCode.toLowerCase()) return true;
        if (uId.toLowerCase().startsWith(opCode.toLowerCase())) return true;
        if (opCode.toLowerCase().startsWith(uId.slice(0, 8).toLowerCase())) return true;
        if (uLegajo && uLegajo.toLowerCase() === opCode.toLowerCase()) return true;
        if (opCodeClean && uId.toLowerCase().includes(opCodeClean)) return true;
      }

      // Match by operator name (supports inverted names "RAMOS CARLOS" vs "Carlos Ramos")
      if (opName && areNamesFuzzyMatch(uName, opName)) {
        return true;
      }

      return false;
    });

    // Collect all candidate user IDs to search for fichadas
    const candidateUserIds = new Set<string>();
    if (supUser?.id) candidateUserIds.add(supUser.id);
    if (emp?.id) candidateUserIds.add(emp.id);
    if (opCode && opCode.length >= 6) {
      // Find any supabase user starting with or containing this code
      supabaseUsuarios.forEach(u => {
        if (u.id.toLowerCase().startsWith(opCode.toLowerCase()) || (u.legajo && u.legajo.toLowerCase() === opCode.toLowerCase())) {
          candidateUserIds.add(u.id);
        }
      });
    }
    // Also add by name match from supabaseUsuarios
    if (opName) {
      supabaseUsuarios.forEach(u => {
        if (areNamesFuzzyMatch(u.nombre, opName)) {
          candidateUserIds.add(u.id);
        }
      });
    }

    const userId = supUser ? supUser.id : (emp ? emp.id : (candidateUserIds.size > 0 ? Array.from(candidateUserIds)[0] : null));

    // 3. Find licencias for that day
    const licencia = userId ? supabaseLicencias.find(l => {
      if (l.usuario_id !== userId || l.estado === 'Rechazado') return false;
      return targetDateKeys.some(k => k >= l.fecha_inicio && k <= l.fecha_fin);
    }) : undefined;

    // 4. Find fichadas for that day across candidate user IDs and matching date keys
    let fichadas: SupabaseRegistro[] = [];
    if (candidateUserIds.size > 0) {
      fichadas = supabaseRegistros
        .filter(r => {
          if (!candidateUserIds.has(r.usuario_id)) return false;
          if (!r.fecha) return false;
          const regKeys = getDateKeys(r.fecha);
          return regKeys.some(rk => targetDateKeys.includes(rk));
        })
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    }

    const entradas = fichadas.filter(f => f.tipo === 'Entrada');
    const salidas = fichadas.filter(f => f.tipo === 'Salida');

    let primeraEntradaStr: string | null = null;
    let ultimaSalidaStr: string | null = null;
    let horasFichadas = 0;
    let estadoPresencia = 'SIN_REGISTRO';

    if (licencia) {
      estadoPresencia = 'EN_LICENCIA';
    } else if (fichadas.length > 0) {
      // If we have actual punches
      if (entradas.length > 0) {
        primeraEntradaStr = formatTimeClean(entradas[0].fecha);
      } else if (fichadas.length > 0) {
        primeraEntradaStr = formatTimeClean(fichadas[0].fecha);
      }

      if (salidas.length > 0) {
        ultimaSalidaStr = formatTimeClean(salidas[salidas.length - 1].fecha);
      } else if (entradas.length > 0) {
        // Active shift if today
        const isToday = targetDateKeys.includes(new Date().toISOString().slice(0, 10));
        if (isToday) {
          ultimaSalidaStr = 'En curso';
        }
      }

      // Calculate total presence hours
      if (entradas.length > 0 && salidas.length > 0) {
        // Calculate interval pairs if multiple punches (e.g. morning + afternoon)
        let totalMs = 0;
        let lastEntryTime: number | null = null;

        fichadas.forEach(f => {
          const t = new Date(f.fecha).getTime();
          if (f.tipo === 'Entrada') {
            lastEntryTime = t;
          } else if (f.tipo === 'Salida' && lastEntryTime !== null) {
            const diff = t - lastEntryTime;
            if (diff > 0 && diff < 16 * 60 * 60 * 1000) {
              totalMs += diff;
            }
            lastEntryTime = null;
          }
        });

        // If simple first entry to last exit
        if (totalMs === 0) {
          const pEntrada = new Date(entradas[0].fecha);
          const uSalida = new Date(salidas[salidas.length - 1].fecha);
          const diff = uSalida.getTime() - pEntrada.getTime();
          if (diff > 0) totalMs = diff;
        }

        horasFichadas = Math.max(0, Number((totalMs / (1000 * 60 * 60)).toFixed(2)));
        estadoPresencia = 'JORNADA_COMPLETA';
      } else if (entradas.length > 0) {
        const pEntrada = new Date(entradas[0].fecha);
        const isToday = targetDateKeys.includes(new Date().toISOString().slice(0, 10));
        if (isToday) {
          const now = new Date();
          const diffMs = now.getTime() - pEntrada.getTime();
          horasFichadas = Math.max(0, Number((diffMs / (1000 * 60 * 60)).toFixed(2)));
        }
        estadoPresencia = 'PRESENTE_ACTIVO';
      } else if (salidas.length > 0) {
        estadoPresencia = 'SOLO_SALIDA';
      }
    }

    const horasMaquina = Number(parte.horasTrabajadas || (parte as any).hsCantidad || 0);
    const ratioUso = horasFichadas > 0 ? Math.min(100, Math.round((horasMaquina / horasFichadas) * 100)) : (horasMaquina > 0 ? 100 : 0);

    return {
      usuario: supUser,
      empleado: emp,
      nombre: supUser?.nombre || emp?.nombreApellido || opName,
      legajo: supUser?.legajo || emp?.legajo || opCode || '-',
      sector: supUser?.sector || emp?.sector || 'Operaciones',
      empresa: supUser?.empresa || 'La Hormiga',
      fichadas,
      entradasCount: entradas.length,
      salidasCount: salidas.length,
      primeraEntrada: primeraEntradaStr,
      ultimaSalida: ultimaSalidaStr,
      horasFichadas,
      horasMaquina,
      ratioUso,
      estadoPresencia,
      licencia
    };
  }, [parte, employees, supabaseRegistros, supabaseUsuarios, supabaseLicencias]);

  const horasMaquinaTotal = Number(parte?.horasTrabajadas || (parte as any)?.hsCantidad || 0);

  const crossInfo = useMemo(() => {
    if (!parte || !fuelVouchers.length) return undefined;
    const sourcePartes = partesDiarios.length > 0 ? partesDiarios : [parte];
    const map = buildPartesKilometrajeCrossMap(sourcePartes, fuelVouchers, fleet);
    return map.get(parte.id);
  }, [parte, partesDiarios, fuelVouchers, fleet]);

  // Early return MUST come after all React hooks to avoid React error #310
  if (!isOpen || !parte) return null;

  const resolvedLinks = resolveParteDiarioLinks(parte, rentals, invoices);

  const uniqueLinkedDocs = linkedDocuments;
  const hasDirectFoto = Boolean(parte.fotoUrl && !uniqueLinkedDocs.some(d => d.url === parte.fotoUrl));
  const attachmentsCount = uniqueLinkedDocs.length + (hasDirectFoto ? 1 : 0);

  const handleDirectUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUpdateParte) return;
    setIsUploadingAttachment(true);
    setUploadAttachmentError(null);
    try {
      const uploaded = await uploadFileToCloudflareR2(
        file,
        file.name,
        file.type || 'application/octet-stream',
        'partes-diarios'
      );
      if (!uploaded.success || !uploaded.url) {
        setUploadAttachmentError(uploaded.error || 'No se pudo subir el adjunto a R2.');
        return;
      }
      onUpdateParte({
        ...parte,
        fotoUrl: uploaded.url,
      });
    } catch (err: any) {
      setUploadAttachmentError(err?.message || 'No se pudo subir el adjunto.');
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  // Determine display values for Primer Ingreso and Última Salida
  const primerIngresoDisplay = operatorAttendance?.primeraEntrada || 
    (parte.horaInicioMañana && parte.horaInicioMañana.trim() !== '' ? parte.horaInicioMañana : (parte.horaInicioTarde && parte.horaInicioTarde.trim() !== '' ? parte.horaInicioTarde : '-'));
  
  const primerIngresoSub = operatorAttendance?.primeraEntrada 
    ? 'Fichada Supabase (Real)' 
    : ((parte.horaInicioMañana || parte.horaInicioTarde) ? 'Declarado en Parte' : 'Sin registro');

  const ultimaSalidaDisplay = operatorAttendance?.ultimaSalida || 
    (parte.horaFinTarde && parte.horaFinTarde.trim() !== '' ? parte.horaFinTarde : (parte.horaFinMañana && parte.horaFinMañana.trim() !== '' ? parte.horaFinMañana : '-'));
  
  const ultimaSalidaSub = operatorAttendance?.ultimaSalida 
    ? 'Fichada Supabase (Real)' 
    : ((parte.horaFinTarde || parte.horaFinMañana) ? 'Declarado en Parte' : 'Sin registro');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono font-bold">Parte #{parte.numParte} (ID: {parte.id})</div>
              <h2 className="text-lg font-bold text-white">{parte.marcaModelo || parte.codigoEquipo}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Status and Date Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center gap-2 text-sm text-slate-300 font-mono">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>Fecha del Parte: <strong className="text-white">{parte.fecha}</strong></span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => attachmentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer transition ${
                  attachmentsCount > 0
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Ir a la sección de adjuntos y fotos"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>{attachmentsCount > 0 ? `${attachmentsCount} Adjunto(s)` : 'Adjuntos (0)'}</span>
              </button>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                parte.autorizado === 'CONTROLADO' || parte.autorizado === 'AUTORIZADO'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              }`}>
                {parte.autorizado}
              </span>
            </div>
          </div>

          {/* Core Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
            <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Obra y Código</span>
                {(parte.esObraEsporadica || parte.codigoObra === 'ESPORADICA' || parte.categoriaObra === 'ESPORADICA') ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    ⚡ Esporádica {parte.esObraEsporadica ? '(Tipeada)' : ''}
                  </span>
                ) : parte.categoriaObra === 'CORTA' ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    ⏱️ Obra Corta
                  </span>
                ) : parte.categoriaObra === 'LARGA' ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    🏗️ Obra Larga
                  </span>
                ) : null}
              </div>
              <div className="text-sm font-bold text-white">{parte.obra}</div>
              {parte.clienteNombre && (
                <div className="text-xs text-emerald-300 font-semibold">
                  👤 Cliente: {parte.clienteNombre}
                  {parte.clienteCuit ? <span className="text-slate-400 font-normal"> ({parte.clienteCuit})</span> : null}
                </div>
              )}
              <div className="text-xs text-slate-400">Código Obra: {parte.codigoObra || '-'}</div>
              <div className="text-xs text-slate-400">Serv / Mant: {parte.servMant || '-'}</div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Equipo Asignado</span>
                {(parte.esEquipoEventual || parte.codigoEquipo === 'EVENTUAL') && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-orange-500/20 text-orange-300 border border-orange-500/50">
                    ⚡ Equipo Eventual (1 vez · No Flota)
                  </span>
                )}
              </div>
              <div className={`text-sm font-bold ${(parte.esEquipoEventual || parte.codigoEquipo === 'EVENTUAL') ? 'text-orange-300' : 'text-amber-400'}`}>
                {parte.codigoEquipo} {parte.marcaModelo ? `(${parte.marcaModelo})` : ''}
              </div>
              <div className="text-xs text-slate-300 flex items-center gap-1.5 flex-wrap mt-1">
                <User className={`w-3.5 h-3.5 inline ${(parte.esEmpleadoEventual || parte.codigoEmpleado === 'A_PRUEBA' || parte.codigoEmpleado === 'EVENTUAL') ? 'text-fuchsia-400' : 'text-amber-400'}`} />
                <span className={(parte.esEmpleadoEventual || parte.codigoEmpleado === 'A_PRUEBA' || parte.codigoEmpleado === 'EVENTUAL') ? 'text-fuchsia-300 font-bold' : ''}>
                  Operador: <strong>{parte.nombreApellido}</strong>
                </span>
                {(parte.esEmpleadoEventual || parte.codigoEmpleado === 'A_PRUEBA' || parte.codigoEmpleado === 'EVENTUAL') ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/50">
                    ⚠️ NO EMPLEADO · A PRUEBA (1 VEZ)
                  </span>
                ) : (
                  parte.codigoEmpleado && <span className="text-slate-500">[{parte.codigoEmpleado}]</span>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECCIÓN DE VÍNCULO COMERCIAL: CONTRATO DE ALQUILER Y FACTURA ARCA         */}
          {/* ========================================================================= */}
          <div className="bg-indigo-950/20 border border-indigo-500/35 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-indigo-500/20">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-500/15 border border-indigo-500/30 rounded-xl text-indigo-300">
                  <Link2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-indigo-200 uppercase tracking-wider flex items-center gap-2">
                    <span>Vínculo Comercial: Contrato de Alquiler & Factura ARCA</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Trazabilidad directa entre este Parte Diario, su Contrato de Alquiler y su Factura ARCA / Cobranza.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-black border ${
                  resolvedLinks.estadoCobro === 'PAGADO'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : resolvedLinks.estadoCobro === 'PARCIAL'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}>
                  {resolvedLinks.estadoCobro === 'PAGADO'
                    ? '✓ COBRADO / PAGADO'
                    : resolvedLinks.estadoCobro === 'PARCIAL'
                    ? '⏳ PAGO PARCIAL'
                    : '⏳ PENDIENTE DE PAGO'}
                </span>
                {onNavigateToCobranzas && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToCobranzas();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-bold cursor-pointer transition"
                  >
                    Ir a Cobranzas →
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
              {/* 1° Jerarquía: Factura ARCA */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-emerald-300 flex items-center gap-1">
                    <Receipt className="w-3.5 h-3.5" />
                    1° Factura ARCA (AFIP)
                  </span>
                  {resolvedLinks.facturaNumero ? (
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-black ${
                      isExternalMigratedInvoice(resolvedLinks.linkedInvoice)
                        ? 'bg-orange-500/25 text-orange-200 border-orange-400/60'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    }`}>
                      🧾 FACTURA {resolvedLinks.facturaNumero}{isExternalMigratedInvoice(resolvedLinks.linkedInvoice) ? ' (OTRO SISTEMA)' : ''}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px]">
                      Sin facturar
                    </span>
                  )}
                </div>

                {resolvedLinks.linkedInvoice ? (
                  <div className="text-[11px] text-slate-300 space-y-0.5 font-sans">
                    {isExternalMigratedInvoice(resolvedLinks.linkedInvoice) && (
                      <div className="px-2 py-0.5 rounded bg-orange-500/20 border border-orange-400/50 text-orange-200 font-black text-[10px] uppercase inline-block mb-1">
                        ⚠️ Cargada de Otro Sistema ({resolvedLinks.linkedInvoice.sistemaOrigenNombre || 'Migración'})
                      </div>
                    )}
                    <div className="font-bold text-white">{resolvedLinks.linkedInvoice.razonSocialReceptor || resolvedLinks.linkedInvoice.receptorRazonSocial}</div>
                    <div className="text-slate-400">
                      {formatInvoiceLabel(resolvedLinks.linkedInvoice)} • Fecha: {resolvedLinks.linkedInvoice.fecha || resolvedLinks.linkedInvoice.fechaCbte}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-mono">
                      Total Factura: ${Number(resolvedLinks.linkedInvoice.importeTotal || resolvedLinks.linkedInvoice.impTotal || 0).toLocaleString('es-AR')}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 font-sans">
                    Este parte diario aún no está vinculado a ninguna Factura ARCA.
                  </p>
                )}

                {onUpdateParte && (
                  <div className="pt-1 border-t border-slate-800/80">
                    <select
                      value={resolvedLinks.linkedInvoice?.id || parte.facturaId || ''}
                      onChange={(e) => {
                        const fId = e.target.value;
                        const fObj = invoices.find(inv => inv.id === fId);
                        onUpdateParte({
                          ...parte,
                          facturaId: fId || undefined,
                          facturaNumero: fObj ? formatInvoiceNumber(fObj) : undefined,
                          estadoCobro: fObj?.estadoCobro === 'PAGADO' ? 'PAGADO' : parte.estadoCobro,
                        });
                      }}
                      className="w-full bg-[#0F1117] border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">-- Vincular / Cambiar Factura ARCA --</option>
                      {invoices.map(inv => (
                        <option key={inv.id} value={inv.id}>
                          {isExternalMigratedInvoice(inv) ? '[OTRO SISTEMA] ' : ''}{formatInvoiceLabel(inv)} • {inv.razonSocialReceptor || inv.receptorRazonSocial} (${Number(inv.importeTotal || inv.impTotal || 0).toLocaleString('es-AR')})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 2° Jerarquía: Contrato de Alquiler */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-indigo-300 flex items-center gap-1">
                    <FileCheck2 className="w-3.5 h-3.5" />
                    2° Contrato de Alquiler
                  </span>
                  {resolvedLinks.rentalNumero ? (
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-black">
                      🔗 {resolvedLinks.rentalNumero}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px]">
                      Sin vincular
                    </span>
                  )}
                </div>

                {resolvedLinks.linkedRental ? (
                  <div className="text-[11px] text-slate-300 space-y-0.5 font-sans">
                    <div className="font-bold text-white">{resolvedLinks.linkedRental.clienteNombre}</div>
                    <div className="text-slate-400">Obra: {resolvedLinks.linkedRental.obraDestino || resolvedLinks.linkedRental.direccionObra || '-'}</div>
                    <div className="text-[10px] text-emerald-400 font-mono">
                      Total Alquiler: ${Number(resolvedLinks.linkedRental.totalAlquiler || resolvedLinks.linkedRental.totalGeneral || 0).toLocaleString('es-AR')}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 font-sans">
                    Este parte diario aún no está asociado a un contrato de alquiler.
                  </p>
                )}

                {onUpdateParte && (
                  <div className="pt-1 border-t border-slate-800/80">
                    <select
                      value={resolvedLinks.linkedRental?.id || parte.rentalId || ''}
                      onChange={(e) => {
                        const rId = e.target.value;
                        const rObj = rentals.find(r => r.id === rId);
                        const inheritedInv = rObj && !parte.facturaId
                          ? resolveRentalContractLinks(rObj, partesDiarios, invoices).primaryInvoice
                          : null;
                        onUpdateParte({
                          ...parte,
                          rentalId: rId || undefined,
                          rentalNumero: rObj ? (rObj.numeroContrato || rObj.numero) : undefined,
                          facturaId: parte.facturaId || inheritedInv?.id,
                          facturaNumero: parte.facturaNumero || (inheritedInv ? formatInvoiceNumber(inheritedInv) : undefined),
                        });
                      }}
                      className="w-full bg-[#0F1117] border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Vincular / Cambiar Contrato --</option>
                      {rentals.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.numeroContrato || r.numero} • {r.clienteNombre} ({r.obraDestino || r.direccionObra || '-'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECCIÓN ESPECIAL: HORAS TRABAJADAS POR EL OPERARIO (ENTRADAS Y SALIDAS)   */}
          {/* ========================================================================= */}
          <div className="bg-gradient-to-b from-[#181C24] to-[#12141A] border border-amber-500/30 rounded-2xl p-4.5 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <span>Horas Trabajadas por el Operario (Entradas y Salidas)</span>
                    <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/30">
                      Control de Asistencia
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Operador: <strong className="text-slate-200">{operatorAttendance?.nombre || parte.nombreApellido}</strong> 
                    {operatorAttendance?.legajo && operatorAttendance.legajo !== '-' && (
                      <span className="text-slate-500 font-mono ml-1.5">(Legajo: {operatorAttendance.legajo})</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div>
                {operatorAttendance?.estadoPresencia === 'JORNADA_COMPLETA' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Jornada Completa ({operatorAttendance.fichadas.length} fichadas)</span>
                  </span>
                )}
                {operatorAttendance?.estadoPresencia === 'PRESENTE_ACTIVO' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Presente / En Turno Activo</span>
                  </span>
                )}
                {operatorAttendance?.estadoPresencia === 'SOLO_SALIDA' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Solo Marca de Salida</span>
                  </span>
                )}
                {operatorAttendance?.estadoPresencia === 'EN_LICENCIA' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono bg-purple-500/15 text-purple-400 border border-purple-500/30">
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span>En Licencia ({operatorAttendance.licencia?.tipo})</span>
                  </span>
                )}
                {(!operatorAttendance || operatorAttendance.estadoPresencia === 'SIN_REGISTRO') && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono bg-slate-800 text-slate-400 border border-slate-700">
                    <Info className="w-3.5 h-3.5 text-slate-500" />
                    <span>Horarios del Parte Diario</span>
                  </span>
                )}
              </div>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              {/* 1. Horas Fichadas en Entradas y Salidas */}
              <div className="bg-[#12141A] border border-slate-800/90 p-3 rounded-xl">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">
                  Hs Presencia Fichadas
                </span>
                <div className="text-lg font-black text-amber-400 mt-1 flex items-baseline gap-1">
                  {operatorAttendance && operatorAttendance.horasFichadas > 0 ? (
                    <>
                      <span>{operatorAttendance.horasFichadas.toFixed(1)}</span>
                      <span className="text-xs text-amber-300">h</span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 font-sans">
                      {parte.horasTrabajadas ? `${Number(parte.horasTrabajadas).toFixed(1)} h (Parte)` : 'Sin fichada'}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                  {operatorAttendance?.entradasCount || 0} entr. / {operatorAttendance?.salidasCount || 0} sal.
                </span>
              </div>

              {/* 2. Horas Máquina del Parte */}
              <div className="bg-[#12141A] border border-slate-800/90 p-3 rounded-xl">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">
                  Hs Máquina (Parte)
                </span>
                <div className="text-lg font-black text-blue-400 mt-1 flex items-baseline gap-1">
                  <span>{horasMaquinaTotal.toFixed(1)}</span>
                  <span className="text-xs text-blue-300">h</span>
                </div>
                <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                  Horómetro / Trabajo
                </span>
              </div>

              {/* 3. Primer Ingreso */}
              <div className="bg-[#12141A] border border-slate-800/90 p-3 rounded-xl">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">
                  Primer Ingreso
                </span>
                <div className="text-sm font-bold text-emerald-400 mt-1.5 flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">
                    {primerIngresoDisplay}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                  {primerIngresoSub}
                </span>
              </div>

              {/* 4. Última Salida */}
              <div className="bg-[#12141A] border border-slate-800/90 p-3 rounded-xl">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">
                  Última Salida
                </span>
                <div className="text-sm font-bold text-rose-400 mt-1.5 flex items-center gap-1">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="truncate">
                    {ultimaSalidaDisplay}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                  {ultimaSalidaSub}
                </span>
              </div>
            </div>

            {/* Fichadas Logs Timeline */}
            {operatorAttendance && operatorAttendance.fichadas.length > 0 ? (
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 font-bold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Registro Cronológico de Fichadas del Día ({operatorAttendance.fichadas.length}):</span>
                  </span>
                  <span className="text-[11px] text-slate-500">Supabase ID: #{operatorAttendance.usuario?.id ? operatorAttendance.usuario.id.slice(0, 8) : '-'}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {operatorAttendance.fichadas.map((fichada, fIdx) => {
                    const timeStr = fichada.fecha 
                      ? new Date(fichada.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : '-';
                    const isEntrada = fichada.tipo === 'Entrada';
                    return (
                      <div 
                        key={fichada.id || fIdx} 
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs font-mono ${
                          isEntrada 
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
                            : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`p-1 rounded-lg ${isEntrada ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {isEntrada ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                          </span>
                          <div>
                            <span className="font-bold">{fichada.tipo}</span>
                            {fichada.observacion && (
                              <span className="text-[10px] text-slate-400 block truncate max-w-[160px]">
                                {fichada.observacion}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-black text-white text-xs">{timeStr}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3 text-xs text-slate-400">
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  No se registraron marcas biométricas/móviles para este operario en la fecha <strong>{parte.fecha}</strong>. Se toman como referencia las horas declaradas en el parte ({horasMaquinaTotal.toFixed(1)} h).
                </span>
              </div>
            )}
          </div>

          {/* Horarios Declarados en el Parte Diario */}
          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-2 font-mono text-xs">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Turnos Declarados en el Formulario del Parte</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-800/80 p-2 rounded">
                <span className="text-[10px] text-slate-500 block">H. Ini Mañana</span>
                <span className="text-white font-bold">{parte.horaInicioMañana || '-'}</span>
              </div>
              <div className="bg-slate-800/80 p-2 rounded">
                <span className="text-[10px] text-slate-500 block">H. Fin Mañana</span>
                <span className="text-white font-bold">{parte.horaFinMañana || '-'}</span>
              </div>
              <div className="bg-slate-800/80 p-2 rounded">
                <span className="text-[10px] text-slate-500 block">H. Ini Tarde</span>
                <span className="text-white font-bold">{parte.horaInicioTarde || '-'}</span>
              </div>
              <div className="bg-slate-800/80 p-2 rounded">
                <span className="text-[10px] text-slate-500 block">H. Fin Tarde</span>
                <span className="text-white font-bold">{parte.horaFinTarde || '-'}</span>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-sm">
              <span>Horas Trabajadas Declaradas: <strong className="text-amber-400">{(parte.horasTrabajadas || 0).toFixed(1)} h</strong></span>
              <span>Odómetro / Km Final: <strong className="text-white">{parte.odomKilom ? parte.odomKilom.toLocaleString() : '-'}</strong></span>
            </div>
          </div>

          {/* Cruce de Kilometraje / Horómetro con Combustible */}
          {crossInfo && crossInfo.status !== 'NO_FUEL_DATA' && (
            <div className="bg-slate-900/75 border border-cyan-500/30 p-4 rounded-xl space-y-3 font-mono text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Fuel className="w-4 h-4 text-cyan-400" />
                  <span className="text-[11px] uppercase tracking-wider text-cyan-300 font-bold">
                    Cruce Odómetro / Horómetro por Combustible
                  </span>
                </div>
                {crossInfo.unit === 'hs' && crossInfo.coincidencia && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    crossInfo.coincidencia === 'COINCIDE'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : crossInfo.coincidencia === 'DESVIO_LEVE'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  }`}>
                    {crossInfo.coincidencia === 'COINCIDE'
                      ? '✓ Coincide con partes'
                      : crossInfo.coincidencia === 'DESVIO_LEVE'
                      ? '⚠ Desvío leve'
                      : '⚠ Desfasaje vs partes'}
                    {crossInfo.diferenciaHoras !== undefined && ` (${crossInfo.diferenciaHoras > 0 ? '+' : ''}${crossInfo.diferenciaHoras} hs)`}
                  </span>
                )}
              </div>

              {crossInfo.status === 'PENDING_NEXT_LOAD' ? (
                <div className="text-slate-300 text-xs font-sans">
                  Última carga registrada el <strong>{formatCrossDateDDMMYYYY(crossInfo.prevLoadDate)}</strong> con lectura{' '}
                  <strong className="text-white font-mono">{(crossInfo.prevLoadReading || 0).toLocaleString('es-AR')} {crossInfo.unit}</strong>.
                  Aún no hay una carga posterior para cerrar y prorratear este tramo.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-[#12141A] border border-slate-800 p-2.5 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">Odóm./Hs Aprox. Día</span>
                    <span className="text-sm font-black text-cyan-300">
                      {crossInfo.isFuelLoadDay && crossInfo.lecturaCargaDia !== undefined
                        ? `${crossInfo.lecturaCargaDia.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${crossInfo.unit}`
                        : crossInfo.odomAproxFin !== undefined
                        ? `~${crossInfo.odomAproxFin.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${crossInfo.unit}`
                        : '-'}
                    </span>
                    {crossInfo.odomAproxInicio !== undefined && crossInfo.odomAproxFin !== undefined && (
                      <span className="text-[10px] text-slate-500 block">
                        Ini: ~{crossInfo.odomAproxInicio.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
                      </span>
                    )}
                  </div>

                  <div className="bg-[#12141A] border border-slate-800 p-2.5 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">Prorrateo del Parte</span>
                    <span className="text-sm font-black text-sky-300">
                      {crossInfo.kmProrrateadoDia !== undefined
                        ? `+${crossInfo.kmProrrateadoDia.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${crossInfo.unit}`
                        : '-'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {crossInfo.tramoDiasTrabajo ? `${crossInfo.tramoDiasTrabajo} día(s) / ${crossInfo.tramoPartesCount} parte(s)` : 'Lectura directa'}
                    </span>
                  </div>

                  <div className="bg-[#12141A] border border-slate-800 p-2.5 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">Tramo Combustible</span>
                    <span className="text-sm font-black text-white">
                      {crossInfo.tramoDelta !== undefined
                        ? `+${crossInfo.tramoDelta.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${crossInfo.unit}`
                        : '-'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {crossInfo.prevLoadReading ? `${crossInfo.prevLoadReading.toLocaleString('es-AR')} → ` : ''}
                      {crossInfo.nextLoadReading ? crossInfo.nextLoadReading.toLocaleString('es-AR') : ''}
                    </span>
                  </div>

                  <div className="bg-[#12141A] border border-slate-800 p-2.5 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">Hs Partes Tramo</span>
                    <span className="text-sm font-black text-amber-300">
                      {crossInfo.tramoHorasPartes !== undefined ? `${crossInfo.tramoHorasPartes.toFixed(1)} hs` : '-'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {crossInfo.kmPorHora !== undefined
                        ? `${crossInfo.kmPorHora} km/h`
                        : crossInfo.tramoLitros
                        ? `${crossInfo.tramoLitros.toLocaleString('es-AR')} L cargados`
                        : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tipo de Trabajo y Ubicación */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
            <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase text-slate-500 font-semibold">Tipo y Modalidad</span>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {parte.servMant || 'ALQUILER'}
                </span>
              </div>
              <div className="text-sm font-bold text-amber-400">
                {parte.tipo === 'HORAS' && `Por Hora - ${parte.detalleTipo || 'Trabajos Generales'}`}
                {parte.tipo === 'VIAJES' && (
                  parte.viajesDetalle && parte.viajesDetalle.length > 1
                    ? `Por Viajes - ${parte.viajesDetalle.length} líneas (${parte.viajesCantidad || 0} viajes)`
                    : `Por Viajes - ${parte.tipoMaterial || 'Áridos / Carga'}`
                )}
                {parte.tipo === 'DIA' && `Por Día - ${parte.detalleTipo || 'Jornada Diaria'}`}
                {parte.tipo === 'TRABAJO' && `Por Trabajo - ${parte.detalleTipo || parte.detalleOtro || 'Trabajo en Obra'}`}
                {parte.tipo === 'OTRO' && `Otro - ${parte.detalleOtro || parte.detalleTipo || 'Servicio Especial'}`}
              </div>

              {parte.detalle2 && (
                <div className="text-[11px] text-slate-300 font-sans">
                  Sub-detalle: <span className="text-white">{parte.detalle2}</span>
                </div>
              )}

              {parte.tipo === 'VIAJES' && (
                <div className="space-y-2 pt-1.5 border-t border-slate-800 text-xs">
                  {Array.isArray(parte.viajesDetalle) && parte.viajesDetalle.length > 0 ? (
                    <div className="space-y-1.5">
                      {parte.viajesDetalle.map((linea, idx) => (
                        <div
                          key={linea.id || idx}
                          className="p-2 rounded-lg bg-[#0F1117] border border-slate-800 space-y-1"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="font-bold text-amber-300">
                              #{idx + 1} · {linea.tipoMaterial}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-200 border border-purple-500/30 text-[10px]">
                              {linea.extraccionEntregas}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
                            <span>
                              <strong className="text-white">{linea.viajesCantidad}</strong> vjs × {linea.m3PorViaje} m³ ={' '}
                              <strong className="text-purple-400">{linea.totalM3} M³</strong>
                            </span>
                            <div className="flex items-center gap-2">
                              {linea.valorViajeEquipo !== undefined && linea.valorViajeEquipo > 0 && (
                                <span className="text-emerald-400 font-bold">
                                  Flete: ${Number(linea.valorViajeEquipo).toLocaleString('es-AR')}
                                </span>
                              )}
                              {linea.valorMaterialAparte !== undefined && linea.valorMaterialAparte > 0 && (
                                <span className="text-slate-400">
                                  Mat: ${Number(linea.valorMaterialAparte).toLocaleString('es-AR')}
                                </span>
                              )}
                            </div>
                          </div>
                          {linea.observacion && (
                            <div className="text-[10px] text-slate-400 font-sans">
                              {linea.observacion}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-300">
                        <span>
                          Total Parte: <strong className="text-white">{parte.viajesCantidad || parte.cantidad || 0} viajes</strong>
                        </span>
                        {parte.totalM3 ? <strong className="text-purple-400">{parte.totalM3} M³ totales</strong> : null}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-slate-300">
                        Viajes: <strong className="text-white">{parte.viajesCantidad || parte.cantidad || 1}</strong>
                        {parte.m3PorViaje ? ` × ${parte.m3PorViaje} M³/viaje = ` : ''}
                        {parte.totalM3 ? <strong className="text-purple-400"> {parte.totalM3} M³ totales</strong> : ''}
                      </div>
                      {parte.tipoMaterial && <div className="text-slate-300">Material: <strong className="text-amber-300">{parte.tipoMaterial}</strong></div>}
                      {parte.extraccionEntregas && <div className="text-purple-300">Operación: <strong className="text-purple-200">{parte.extraccionEntregas}</strong></div>}
                    </>
                  )}
                  {(parte.separarCobranzaMaterial || parte.valorViajeEquipo !== undefined || parte.valorMaterialAparte !== undefined) && (
                    <div className="mt-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 space-y-0.5 text-[11px]">
                      <div className="font-bold text-emerald-300">
                        {parte.separarCobranzaMaterial
                          ? 'Contabilidad: Solo Viaje del Equipo (Material separado)'
                          : 'Contabilidad: Tarifa Global'}
                      </div>
                      {parte.valorViajeEquipo !== undefined && (
                        <div className="text-slate-200">
                          Valor Viaje Equipo Total: <strong className="text-emerald-400">${Number(parte.valorViajeEquipo).toLocaleString('es-AR')}</strong>
                        </div>
                      )}
                      {parte.valorMaterialAparte !== undefined && (
                        <div className="text-slate-400">
                          Material Aparte (no suma al equipo): <strong>${Number(parte.valorMaterialAparte).toLocaleString('es-AR')}</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {parte.tipo === 'DIA' && (
                <div className="pt-1 border-t border-slate-800 text-xs text-slate-300">
                  Cantidad de Días: <strong className="text-amber-400">{parte.cantidadDias || parte.cantidad || 1} días</strong>
                </div>
              )}

              {(parte.tipo === 'OTRO' || parte.tipo === 'TRABAJO') && (
                <div className="pt-1 border-t border-slate-800 text-xs text-slate-300">
                  Cantidad / Detalle: <strong className="text-amber-400">{parte.cantidadOtro || parte.cantidad || 1}</strong> - {parte.detalleOtro || parte.detalleTipo || '-'}
                </div>
              )}

              {(parte.fuenteOrigen || parte.grasa || parte.aceite || parte.reparacionMant || parte.estadoCobro) && (
                <div className="pt-1.5 border-t border-slate-800 flex flex-wrap gap-1.5 text-[10px]">
                  {parte.fuenteOrigen && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      Origen: {parte.fuenteOrigen === 'GASTOS_EQUIPOS' ? 'Gastos por Equipos (VENTA)' : parte.fuenteOrigen}
                    </span>
                  )}
                  {parte.estadoCobro && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Cobro: {parte.estadoCobro}
                    </span>
                  )}
                  {parte.grasa && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">Grasa: {parte.grasa}</span>
                  )}
                  {parte.aceite && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">Aceite: {parte.aceite}</span>
                  )}
                  {parte.reparacionMant && (
                    <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300">Mant.: {parte.reparacionMant}</span>
                  )}
                </div>
              )}
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl space-y-1.5">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Ubicación, Obra y Firma</div>
              <div className="text-xs text-white">Obra: <strong className="text-amber-300">{parte.obra || '-'}</strong> [{parte.codigoObra || '-'}]</div>
              <div className="text-xs text-slate-300">Ubicación: {parte.ubicacion || '-'}</div>
              <div className="text-xs text-slate-300">Encargado de Obra: <strong className="text-white">{parte.encargadoObra || '-'}</strong></div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">Estado de Firma:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  parte.firma === 'Firmado' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {parte.firma === 'Firmado' ? '✓ Firmado' : '✗ No firmado'}
                </span>
              </div>
              {parte.novedades && (
                <div className="pt-1 border-t border-slate-800 text-slate-400 text-[11px]">
                  Novedades: <span className="text-slate-200">{parte.novedades}</span>
                </div>
              )}
            </div>
          </div>

          {/* Checklist Preoperacional */}
          {parte.checklist && (
            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Checklist Pre-Operacional al Arrancar
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Horómetro Inicial: {parte.odometroInicial || parte.checklist.odometroInicial || '-'}
                </span>
              </div>

              {/* Fluids & checks status tags */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px] font-mono">
                <div className={`p-1.5 rounded border ${parte.checklist.nivelAceiteMotor ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/30 border-rose-500/30 text-rose-300'}`}>
                  Aceite Motor: {parte.checklist.nivelAceiteMotor ? 'OK' : 'Bajo'}
                </div>
                <div className={`p-1.5 rounded border ${parte.checklist.nivelRefrigerante ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/30 border-rose-500/30 text-rose-300'}`}>
                  Refrigerante: {parte.checklist.nivelRefrigerante ? 'OK' : 'Bajo'}
                </div>
                <div className={`p-1.5 rounded border ${parte.checklist.nivelAceiteHidraulico ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/30 border-rose-500/30 text-rose-300'}`}>
                  Hidráulico: {parte.checklist.nivelAceiteHidraulico ? 'OK' : 'Bajo'}
                </div>
                <div className={`p-1.5 rounded border ${parte.checklist.fugasFluidos ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/30 border-rose-500/30 text-rose-300'}`}>
                  Fugas: {parte.checklist.fugasFluidos ? 'Sin Fugas' : 'Pérdida'}
                </div>
              </div>

              {/* Photos Gallery */}
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <span className="text-[10px] text-slate-400 font-mono font-bold block">
                  Fotos de Inspección Inicial:
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { label: 'Frente', url: parte.checklist.fotoFrente },
                    { label: 'Atrás', url: parte.checklist.fotoAtras },
                    { label: 'Lat. Izq.', url: parte.checklist.fotoLateralIzquierdo },
                    { label: 'Lat. Der.', url: parte.checklist.fotoLateralDerecho },
                    { label: 'Cabina', url: parte.checklist.fotoCabinaInterior },
                    { label: 'Odómetro', url: parte.checklist.fotoTableroOdometro },
                  ].map((p, idx) => (
                    <div key={idx} className="aspect-square bg-slate-800 rounded-lg overflow-hidden border border-slate-700 relative group">
                      {p.url ? (
                        <button
                          type="button"
                          onClick={() =>
                            setActiveDocPhoto({
                              id: `checklist-${parte.id}-${idx}`,
                              categoria: 'PARTE_DIARIO',
                              url: p.url!,
                              nota: `Checklist · ${p.label} (Parte #${parte.numParte})`,
                              fechaCaptura: parte.fecha,
                              createdAt: parte.fecha,
                              estado: 'VINCULADO',
                            })
                          }
                          className="w-full h-full cursor-pointer block"
                          title={`Ampliar ${p.label}`}
                        >
                          <img
                            src={p.url}
                            alt={p.label}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                        </button>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-500 text-center p-1">
                          Sin foto
                        </div>
                      )}
                      <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] text-white text-center py-0.5 truncate pointer-events-none">
                        {p.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {parte.novedades && (
            <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Novedades y Observaciones</div>
              <p className="text-xs text-slate-300 font-sans">{parte.novedades}</p>
            </div>
          )}

          {/* Documentos vinculados desde Bolsa de Documentos / Foto adjunta */}
          <div
            ref={attachmentsSectionRef}
            className={`bg-slate-900/80 border p-4 rounded-xl space-y-3 ${
              attachmentsCount > 0 ? 'border-emerald-500/35' : 'border-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Camera className={`w-4 h-4 ${attachmentsCount > 0 ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Adjuntos, Fotos y Documentos Vinculados ({attachmentsCount})
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {onUpdateParte && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={handleDirectUploadAttachment}
                    />
                    <button
                      type="button"
                      disabled={isUploadingAttachment}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                    >
                      {isUploadingAttachment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>{isUploadingAttachment ? 'Subiendo...' : 'Subir Foto / PDF'}</span>
                    </button>
                  </>
                )}
                {onLinkBolsaDocument && (
                  <button
                    type="button"
                    onClick={() => setIsDocsPickerOpen(true)}
                    className="px-2.5 py-1 rounded-lg bg-[#F0C800]/15 hover:bg-[#F0C800]/25 text-[#F0C800] border border-[#F0C800]/40 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Elegir de Docs ({bolsaDocumentos.length})</span>
                  </button>
                )}
              </div>
            </div>

            {uploadAttachmentError && (
              <div className="px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300">
                {uploadAttachmentError}
              </div>
            )}

            {attachmentsCount === 0 ? (
              <div className="bg-[#101318] border border-dashed border-slate-700/80 rounded-xl p-4 text-center text-xs text-slate-400">
                Este parte diario no tiene fotos ni archivos adjuntos todavía.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {hasDirectFoto && parte.fotoUrl && (
                  <div className="bg-[#101318] border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveDocPhoto({
                          id: `parte-foto-${parte.id}`,
                          categoria: 'PARTE_DIARIO',
                          url: parte.fotoUrl!,
                          nota: `Parte #${parte.numParte}`,
                          fechaCaptura: parte.fecha,
                          createdAt: parte.fecha,
                          estado: 'VINCULADO',
                        })
                      }
                      className="aspect-[4/3] w-full bg-black overflow-hidden cursor-pointer group flex items-center justify-center"
                    >
                      {isPdfUrl(parte.fotoUrl) ? (
                        <div className="flex flex-col items-center justify-center gap-1.5 text-rose-300 p-3">
                          <FileText className="w-9 h-9" />
                          <span className="text-[11px] font-bold uppercase">Documento PDF</span>
                        </div>
                      ) : (
                        <img
                          src={parte.fotoUrl}
                          alt={`Parte #${parte.numParte}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                      )}
                    </button>
                    <div className="p-2 text-[11px] space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-cyan-400 uppercase">PARTE DIARIO</span>
                        <span className="text-slate-400 font-mono">{parte.fecha}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <a
                          href={parte.fotoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-slate-300 hover:text-white flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Abrir</span>
                        </a>
                        {onUpdateParte && (
                          <button
                            type="button"
                            onClick={() => onUpdateParte({ ...parte, fotoUrl: undefined })}
                            className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Quitar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {uniqueLinkedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="bg-[#101318] border border-slate-800 rounded-xl overflow-hidden flex flex-col"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveDocPhoto(doc)}
                      className="aspect-[4/3] w-full bg-black overflow-hidden cursor-pointer group flex items-center justify-center"
                    >
                      {isPdfUrl(doc.url) ? (
                        <div className="flex flex-col items-center justify-center gap-1.5 text-rose-300 p-3">
                          <FileText className="w-9 h-9" />
                          <span className="text-[11px] font-bold uppercase">Documento PDF</span>
                        </div>
                      ) : (
                        <img
                          src={doc.url}
                          alt={doc.nota || doc.categoria}
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                      )}
                    </button>
                    <div className="p-2 text-[11px] space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-emerald-400 uppercase">{doc.categoria.replace('_', ' ')}</span>
                        <span className="text-slate-500 font-mono">{doc.fechaCaptura}</span>
                      </div>
                      {doc.nota && <div className="text-slate-300 truncate">{doc.nota}</div>}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-slate-300 hover:text-white flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Abrir</span>
                        </a>
                        {onUnlinkDocument && (
                          <button
                            type="button"
                            onClick={() => onUnlinkDocument(doc.id)}
                            className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Unlink className="w-3 h-3" />
                            <span>Desvincular</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            {onEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(parte);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Editar Parte
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {activeDocPhoto && (
        <div
          className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setActiveDocPhoto(null)}
        >
          <div className="relative max-w-4xl max-h-[88vh] flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 text-xs text-white">
              <span className="font-bold text-emerald-400 truncate">
                {activeDocPhoto.categoria.replace('_', ' ')} · {activeDocPhoto.fechaCaptura} {activeDocPhoto.nota ? `· ${activeDocPhoto.nota}` : ''}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={activeDocPhoto.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir</span>
                </a>
                <button
                  onClick={() => setActiveDocPhoto(null)}
                  className="p-1.5 text-white/80 hover:text-white rounded-lg bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {isPdfUrl(activeDocPhoto.url) ? (
              <iframe
                src={activeDocPhoto.url}
                title="Documento PDF adjunto"
                className="w-[85vw] max-w-4xl h-[76vh] rounded-xl border border-slate-700 bg-white shadow-2xl"
              />
            ) : (
              <img
                src={activeDocPhoto.url}
                alt="Documento vinculado"
                className="max-h-[78vh] w-auto rounded-xl object-contain border border-slate-700 shadow-2xl"
              />
            )}
          </div>
        </div>
      )}

      {onLinkBolsaDocument && (
        <BolsaDocumentosPickerModal
          isOpen={isDocsPickerOpen}
          onClose={() => setIsDocsPickerOpen(false)}
          documents={bolsaDocumentos}
          defaultCategory="PARTE_DIARIO"
          selectedUrl={parte.fotoUrl}
          onSelect={(doc) => {
            onLinkBolsaDocument(
              doc.id,
              parte.id,
              `Parte #${parte.numParte} · ${parte.marcaModelo}`
            );
            if (!parte.fotoUrl && onUpdateParte) {
              onUpdateParte({ ...parte, fotoUrl: doc.url });
            }
            setIsDocsPickerOpen(false);
          }}
        />
      )}
    </div>
  );
};
