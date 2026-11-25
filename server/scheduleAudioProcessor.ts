import { GoogleGenAI, Type, Schema } from '@google/genai';
import { getDbPool } from './db.js';
import { uploadFileToR2 } from './r2.js';

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
  hora: string;
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
  horario?: string;
  tarea?: string;
  observaciones?: string;
  roturaDetalle?: string;
  historialMovimientos?: DailyScheduleMovementEntry[];
  origenAsignacion?: 'AUDIO_WHATSAPP' | 'AUDIO_WEB' | 'MANUAL' | 'PIZARRA';
  audioLogId?: string;
  parteDiarioId?: string;
  updatedAt: string;
}

export interface DailyScheduleRecord {
  id: string;
  fecha: string;
  estado: 'BORRADOR' | 'CONFIRMADA' | 'CERRADA';
  resumenOperativo?: string;
  items: DailyScheduleAssignmentItem[];
  unmatchedMentions?: Array<{ textoOriginal: string; sugerencia?: string; tarea?: string }>;
  appliedAudioIds: string[];
  syncedToDispatchBoard?: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface WhatsAppAudioLogRecord {
  id: string;
  fecha: string;
  hora: string;
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

const SCHEDULE_EXTRACTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    transcripcion: {
      type: Type.STRING,
      description: 'Transcripción completa y literal en español argentino de todo lo dicho en el audio o mensaje.',
    },
    fechaDetectada: {
      type: Type.STRING,
      description: 'Fecha en formato YYYY-MM-DD si en el audio menciona explícitamente una fecha distinta a hoy (dejar vacío si es para hoy).',
    },
    resumenOperativo: {
      type: Type.STRING,
      description: 'Resumen ejecutivo de 1 a 2 oraciones sobre el esquema operativo armado a partir del audio, incluyendo traslados ("se fue") y roturas si las hubiera.',
    },
    asignaciones: {
      type: Type.ARRAY,
      description: 'Lista de empleados mencionados en el audio (o afectados por rotura de su máquina) con su equipo, obra, estado, acción y detalle de rotura.',
      items: {
        type: Type.OBJECT,
        properties: {
          employeeId: {
            type: Type.STRING,
            description: 'ID exacto del empleado según el catálogo de CHOFERES/EMPLEADOS provisto (vacío si no figura en catálogo).',
          },
          employeeName: {
            type: Type.STRING,
            description: 'Nombre y apellido del empleado del catálogo (o el nombre mencionado si no está en el catálogo).',
          },
          accion: {
            type: Type.STRING,
            description:
              'Una de: ASIGNACION (asignación nueva o continuidad), TRASLADO_SE_FUE (cambió a otra obra respecto a donde estaba), SALIDA_SIN_DESTINO (se fue/retiró de la obra sin destino nuevo), ROTURA_AVERIA (se rompió algo de la máquina u obra), REPARACION (se arregló/reparó algo roto).',
          },
          estado: {
            type: Type.STRING,
            description: 'Uno de: EN_OBRA, ROTURA_AVERIA, TALLER, BASE, EN_FLETE, DISPONIBLE, FRANCO, AUSENTE, VACACIONES.',
          },
          vehicleId: {
            type: Type.STRING,
            description: 'ID exacto de la máquina/vehículo según el catálogo de EQUIPOS provisto (vacío si no usa equipo o no coincide).',
          },
          vehicleCode: {
            type: Type.STRING,
            description: 'Código interno o patente del equipo del catálogo.',
          },
          vehicleName: {
            type: Type.STRING,
            description: 'Modelo/marca del equipo asignado.',
          },
          obraId: {
            type: Type.STRING,
            description: 'ID exacto de la obra según el catálogo de OBRAS provisto (vacío si es taller, base, salida o obra nueva no listada).',
          },
          obraName: {
            type: Type.STRING,
            description: 'Nombre de la obra, cliente o lugar de destino ACTUAL/NUEVO (ej: ROCA GOLF, Taller / Mantenimiento, Base Central / Playón). Vacío si se fue sin nuevo destino.',
          },
          origenObraName: {
            type: Type.STRING,
            description: 'Si en el audio dice explícitamente de qué obra se fue o salió (ej: "se fue de obra Roca"), indicar aquí el nombre de la obra anterior.',
          },
          ubicacion: {
            type: Type.STRING,
            description: 'Ubicación o sector específico mencionado.',
          },
          horario: {
            type: Type.STRING,
            description: 'Horario o turno indicado (ej: "08:00 a 18:00", "Turno Mañana", "Todo el día").',
          },
          tarea: {
            type: Type.STRING,
            description: 'Tarea específica a realizar o novedad operativa.',
          },
          roturaDetalle: {
            type: Type.STRING,
            description: 'Si se rompió algo o hubo falla/avería (ej: "Se rompió manguera hidráulica de la Kobelco", "Pinchó cubierta trasera"), describir exactamente qué se rompió.',
          },
          observaciones: {
            type: Type.STRING,
            description: 'Observaciones adicionales, requerimientos de combustible, herramientas o notas.',
          },
        },
        required: ['employeeName', 'estado'],
      },
    },
    mencionesSinVincular: {
      type: Type.ARRAY,
      description: 'Menciones de equipos, tareas o personas que no pudieron asociarse claramente a un empleado de la nómina.',
      items: {
        type: Type.OBJECT,
        properties: {
          textoOriginal: { type: Type.STRING },
          sugerencia: { type: Type.STRING },
          tarea: { type: Type.STRING },
        },
      },
    },
  },
  required: ['transcripcion', 'resumenOperativo', 'asignaciones'],
};

function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function normalizeStr(s?: string | null): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveServerGeminiApiKey(): string {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.API_KEY,
    process.env.VITE_GEMINI_API_KEY,
  ];
  for (const key of candidates) {
    if (key && typeof key === 'string' && key.trim()) {
      return key.trim();
    }
  }
  return '';
}

let scheduleMutationVersion = Date.now();

export function getScheduleMutationVersion(): number {
  return scheduleMutationVersion;
}

export function bumpScheduleMutationVersion(): number {
  scheduleMutationVersion += 1;
  return scheduleMutationVersion;
}

export async function loadActiveCatalogsFromSupabase() {
  const pool = getDbPool();
  if (!pool) {
    throw new Error('Conexión a Supabase PostgreSQL no disponible.');
  }

  const [driversRes, vehiclesRes, obrasRes] = await Promise.all([
    pool.query('SELECT data FROM drivers ORDER BY updated_at DESC;'),
    pool.query('SELECT data FROM vehicles ORDER BY updated_at DESC;'),
    pool.query('SELECT data FROM obras ORDER BY updated_at DESC;'),
  ]);

  const drivers = driversRes.rows
    .map((r) => r.data)
    .filter((d) => d && d.estado !== 'Inactivo' && d.estado !== 'Baja');
  const vehicles = vehiclesRes.rows.map((r) => r.data).filter(Boolean);
  const obras = obrasRes.rows.map((r) => r.data).filter(Boolean);

  return { drivers, vehicles, obras };
}

async function loadActiveDriversOnlyFromSupabase() {
  const pool = getDbPool();
  if (!pool) {
    throw new Error('Conexión a Supabase PostgreSQL no disponible.');
  }
  const driversRes = await pool.query('SELECT data FROM drivers ORDER BY updated_at DESC;');
  return driversRes.rows
    .map((r) => r.data)
    .filter((d) => d && d.estado !== 'Inactivo' && d.estado !== 'Baja');
}

export async function getOrCreateDailyScheduleInSupabase(
  fecha: string,
  catalogs?: { drivers: any[]; vehicles: any[]; obras: any[] },
  options?: { syncNewDrivers?: boolean }
): Promise<DailyScheduleRecord> {
  const pool = getDbPool();
  if (!pool) {
    throw new Error('Conexión a Supabase PostgreSQL no disponible.');
  }

  const scheduleId = `SCHED-${fecha}`;
  const existingRes = await pool.query(
    'SELECT data FROM daily_schedules WHERE id = $1 OR fecha = $2 ORDER BY updated_at DESC LIMIT 1;',
    [scheduleId, fecha]
  );

  if (existingRes.rows.length > 0) {
    const existing: DailyScheduleRecord = existingRes.rows[0].data;
    if (!options?.syncNewDrivers && !catalogs) {
      return existing;
    }

    const drivers = catalogs ? catalogs.drivers : await loadActiveDriversOnlyFromSupabase();
    const nowIso = new Date().toISOString();
    const existingByEmpId = new Map<string, DailyScheduleAssignmentItem>();
    for (const item of existing.items || []) {
      if (item.employeeId) existingByEmpId.set(item.employeeId.toLowerCase(), item);
    }

    let addedMissing = false;
    const mergedItems: DailyScheduleAssignmentItem[] = [...(existing.items || [])];

    for (const emp of drivers) {
      const empId = String(emp.id || emp.codigo || '').trim();
      if (!empId || existingByEmpId.has(empId.toLowerCase())) continue;
      existingByEmpId.set(empId.toLowerCase(), null as any);
      addedMissing = true;
      mergedItems.push({
        id: `ITEM-${fecha}-${empId}`,
        employeeId: empId,
        employeeName: String(emp.nombreApellido || emp.nombre || 'Sin nombre').trim(),
        employeeCode: String(emp.codigo || emp.legajo || '').trim(),
        employeePhone: String(emp.telefono || emp.celular || '').trim(),
        estado: 'DISPONIBLE',
        horario: '08:00 a 18:00',
        tarea: '',
        observaciones: '',
        roturaDetalle: '',
        historialMovimientos: [],
        origenAsignacion: 'MANUAL',
        updatedAt: nowIso,
      });
    }

    if (addedMissing) {
      existing.items = mergedItems;
      await saveDailyScheduleToSupabase(existing);
    }
    return existing;
  }

  const drivers = catalogs ? catalogs.drivers : await loadActiveDriversOnlyFromSupabase();
  const seenEmpIds = new Set<string>();
  const dedupedDrivers: any[] = [];
  for (const emp of drivers) {
    const empId = String(emp.id || emp.codigo || '').trim();
    if (!empId || seenEmpIds.has(empId.toLowerCase())) continue;
    seenEmpIds.add(empId.toLowerCase());
    dedupedDrivers.push(emp);
  }

  const nowIso = new Date().toISOString();
  const initialItems: DailyScheduleAssignmentItem[] = dedupedDrivers.map((emp) => {
    const empId = String(emp.id || emp.codigo || '').trim();
    return {
      id: `ITEM-${fecha}-${empId}`,
      employeeId: empId,
      employeeName: String(emp.nombreApellido || emp.nombre || 'Sin nombre').trim(),
      employeeCode: String(emp.codigo || emp.legajo || '').trim(),
      employeePhone: String(emp.telefono || emp.celular || '').trim(),
      estado: 'DISPONIBLE',
      horario: '08:00 a 18:00',
      tarea: '',
      observaciones: '',
      roturaDetalle: '',
      historialMovimientos: [],
      origenAsignacion: 'MANUAL',
      updatedAt: nowIso,
    };
  });

  const newSchedule: DailyScheduleRecord = {
    id: scheduleId,
    fecha,
    estado: 'BORRADOR',
    resumenOperativo: `Esquema diario ${fecha} (${initialItems.length} empleados en nómina)`,
    items: initialItems,
    unmatchedMentions: [],
    appliedAudioIds: [],
    syncedToDispatchBoard: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await saveDailyScheduleToSupabase(newSchedule);
  return newSchedule;
}

export async function saveDailyScheduleToSupabase(schedule: DailyScheduleRecord): Promise<DailyScheduleRecord> {
  const pool = getDbPool();
  if (!pool) {
    throw new Error('Conexión a Supabase PostgreSQL no disponible. No se guardó la programación.');
  }

  const updated: DailyScheduleRecord = {
    ...schedule,
    id: schedule.id || `SCHED-${schedule.fecha}`,
    updatedAt: new Date().toISOString(),
  };

  await pool.query(
    `
    INSERT INTO daily_schedules (id, fecha, estado, resumen_operativo, data, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (id) DO UPDATE SET
      fecha = EXCLUDED.fecha,
      estado = EXCLUDED.estado,
      resumen_operativo = EXCLUDED.resumen_operativo,
      data = EXCLUDED.data,
      updated_at = NOW();
    `,
    [
      updated.id,
      updated.fecha,
      updated.estado || 'BORRADOR',
      updated.resumenOperativo || '',
      JSON.stringify(updated),
    ]
  );

  bumpScheduleMutationVersion();
  return updated;
}

export async function saveWhatsAppAudioLogToSupabase(log: WhatsAppAudioLogRecord): Promise<WhatsAppAudioLogRecord> {
  const pool = getDbPool();
  if (!pool) {
    throw new Error('Conexión a Supabase PostgreSQL no disponible. No se guardó el registro de audio.');
  }

  const updated: WhatsAppAudioLogRecord = {
    ...log,
    updatedAt: new Date().toISOString(),
  };

  await pool.query(
    `
    INSERT INTO whatsapp_audio_logs (id, fecha, sender_jid, sender_name, audio_url, transcripcion, schedule_id, estado, data, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (id) DO UPDATE SET
      fecha = EXCLUDED.fecha,
      sender_jid = EXCLUDED.sender_jid,
      sender_name = EXCLUDED.sender_name,
      audio_url = EXCLUDED.audio_url,
      transcripcion = EXCLUDED.transcripcion,
      schedule_id = EXCLUDED.schedule_id,
      estado = EXCLUDED.estado,
      data = EXCLUDED.data,
      updated_at = NOW();
    `,
    [
      updated.id,
      updated.fecha,
      updated.senderJid || '',
      updated.senderName || '',
      updated.audioUrl || '',
      updated.transcripcion || '',
      updated.scheduleId || '',
      updated.estado,
      JSON.stringify(updated),
    ]
  );

  bumpScheduleMutationVersion();
  return updated;
}

const NICKNAME_MAP: Record<string, string[]> = {
  seba: ['sebastian'],
  javi: ['javier'],
  efra: ['efrain'],
  paco: ['francisco'],
  pancho: ['francisco'],
  matias: ['francisco matias'],
  nefta: ['neftali'],
  dani: ['daniel'],
  maxi: ['maximiliano'],
  nico: ['nicolas'],
  ale: ['alejandro'],
  gabi: ['gabriel'],
  fer: ['fernando'],
  leo: ['leonardo', 'leonel'],
  pablo: ['pablo'],
  arcadio: ['arcadio'],
};

const VEHICLE_GENERIC_TOKENS = new Set([
  'para',
  'tipo',
  'modelo',
  'serie',
  'camion',
  'camioneta',
  'maquina',
  'equipo',
  'vehiculo',
  'retro',
  'pala',
  'excavadora',
  'cargadora',
  'volcador',
  'volcadora',
  'chasis',
  'acoplado',
  'compactador',
  'rodillo',
  'autoelevador',
  'manguera',
  'bomba',
  'goma',
  'cubierta',
  'motor',
  'rueda',
  'vidrio',
  'bateria',
  'filtro',
  'correa',
  'aceite',
  'tanque',
  'freno',
  'frenos',
  'hidraulico',
  'hidraulica',
  'depos',
  'deposito',
  'combustible',
  'rojo',
  'azul',
  'blanco',
  'negro',
  'verde',
  'amarillo',
  'gris',
  '440ltsc',
  '2010',
  '2011',
  '2012',
  '2013',
  '2014',
  '2015',
  '2016',
  '2017',
  '2018',
  '2019',
  '2020',
  '2021',
  '2022',
  '2023',
  '2024',
  '2025',
  '2026',
]);

const OBRA_STOP_TOKENS = new Set([
  'obra',
  'barrio',
  'calle',
  'ruta',
  'camino',
  'loteo',
  'sector',
  'zona',
  'etapa',
  'nuevo',
  'nueva',
  'arreglo',
  'frente',
  'para',
  'con',
  'del',
  'las',
  'los',
]);

export function findBestVehicleMatch(queryText: string, vehicles: any[]): any | null {
  const normQuery = normalizeStr(queryText);
  if (!normQuery) return null;

  let bestVehicle: any = null;
  let bestScore = 0;

  for (const v of vehicles) {
    const model = String(v.modeloMarca || '').trim();
    const code = String(v.codigoInterno || v.codigoEquipo || v.codigo || '').trim();
    const plate = String(v.patente || '').trim();
    const normModel = normalizeStr(model);
    const normCode = normalizeStr(code);
    const normPlate = normalizeStr(plate);

    let score = 0;

    if (normPlate && normPlate.length >= 5 && normQuery.includes(normPlate)) {
      score = Math.max(score, 1200);
    }

    if (normCode) {
      if (normCode.length >= 3 && new RegExp(`\\b${escapeRegex(normCode)}\\b`, 'i').test(normQuery)) {
        score = Math.max(score, 1100);
      } else if (
        normCode.length >= 1 &&
        new RegExp(`\\b(?:interno|equipo|maquina|n°|numero|#)\\s*${escapeRegex(normCode)}\\b`, 'i').test(normQuery)
      ) {
        score = Math.max(score, 1050);
      }
    }

    if (normModel) {
      if (new RegExp(`\\b${escapeRegex(normModel)}\\b`, 'i').test(normQuery)) {
        score = Math.max(score, 1000 + normModel.length);
      } else {
        const modelTokens = normModel
          .split(/[\s/()*.,-]+/)
          .filter((t) => t.length >= 3 && !VEHICLE_GENERIC_TOKENS.has(t));
        const allTokens = normModel.split(/[\s/()*.,-]+/).filter((t) => t.length >= 3);

        const specificHits = modelTokens.filter((tk) =>
          new RegExp(`\\b${escapeRegex(tk)}\\b`, 'i').test(normQuery)
        );
        const genericHits = allTokens.filter(
          (tk) => VEHICLE_GENERIC_TOKENS.has(tk) && new RegExp(`\\b${escapeRegex(tk)}\\b`, 'i').test(normQuery)
        );

        if (specificHits.length > 0) {
          const heavyBonus = v.categoriaEquipo !== 'HERRAMIENTA_MENOR' ? 30 : 0;
          const hitScore =
            specificHits.length * 120 + genericHits.length * 25 + specificHits.join('').length * 2 + heavyBonus;
          score = Math.max(score, hitScore);
        } else if (genericHits.length >= 2) {
          score = Math.max(score, genericHits.length * 30);
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestVehicle = v;
    }
  }

  return bestScore > 0 ? bestVehicle : null;
}

export function findBestObraMatch(queryText: string, obras: any[]): any | null {
  const normQuery = normalizeStr(queryText);
  if (!normQuery) return null;

  let bestObra: any = null;
  let bestScore = 0;

  for (const o of obras) {
    const oName = String(o.nombreObra || o.nombre || '').trim();
    const normOName = normalizeStr(oName);
    if (!normOName) continue;

    let score = 0;
    if (normQuery === normOName) {
      score = 2500;
    } else if (new RegExp(`\\b${escapeRegex(normOName)}\\b`, 'i').test(normQuery)) {
      score = 1000 + normOName.length * 4;
    } else {
      const allTokens = normOName.split(/[\s/()*.,-]+/).filter((t) => t.length >= 2);
      const sigTokens = allTokens.filter((t) => t.length >= 4 && !OBRA_STOP_TOKENS.has(t));

      const matched = sigTokens.filter((tk) =>
        new RegExp(`\\b${escapeRegex(tk)}\\b`, 'i').test(normQuery)
      );

      if (matched.length > 0) {
        const ratio = matched.length / Math.max(1, allTokens.length);
        const matchedChars = matched.reduce((acc, t) => acc + t.length, 0);
        score = ratio * 100 + matchedChars * 2;
        if (normOName.startsWith(matched[0])) {
          score += 25;
        }
        if (!/[().]/.test(oName)) {
          score += 10;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestObra = o;
    }
  }

  return bestScore > 0 ? bestObra : null;
}

function extractCustomObraDestination(seg: string): string {
  const match = seg.match(
    /\b(?:a\s+la\s+obra|hacia\s+la\s+obra|para\s+la\s+obra|en\s+la\s+obra|a\s+obra|en\s+obra|hacia|pas[oó]\s+a|cambi[oó]\s+a|va\s+a|fue\s+a)\s+([a-záéíóúñ0-9][a-záéíóúñ0-9\s.-]{2,40})/i
  );
  if (!match || !match[1]) return '';
  const cleaned = match[1]
    .split(/\b(?:porque|ya\s+que|pero|donde|sin|con\s+la|con\s+el|y\s+se|y\s+le|y\s+est[aá])\b/i)[0]
    .replace(/[.,;!?]+$/g, '')
    .trim();
  return cleaned.length >= 2 ? cleaned : '';
}

function extractCustomObraOrigin(seg: string): string {
  const match = seg.match(
    /\b(?:se\s+fue\s+de|sali[oó]\s+de|dej[oó]|se\s+retir[oó]\s+de|termin[oó]\s+en)\s+(?:la\s+obra\s+|obra\s+)?([a-záéíóúñ0-9][a-záéíóúñ0-9\s.-]{2,35})/i
  );
  if (!match || !match[1]) return '';
  const cleaned = match[1]
    .split(/\b(?:a\s+la\s+obra|a\s+obra|hacia|para|y\s|porque|,|\.)\b/i)[0]
    .replace(/[.,;!?]+$/g, '')
    .trim();
  return cleaned.length >= 2 ? cleaned : '';
}

function extractBreakdownDetail(seg: string): string {
  const match = seg.match(
    /\b((?:se\s+(?:le\s+)?rompi[oó]|rompi[oó]|rotura\s+de|se\s+descompus[oó]|fall[aó]\s+(?:en|de|la|el)?|pinch[oó]|perdi[oó]\s+(?:aceite|agua|gasoil|presi[oó]n)|qued[oó]\s+parad[ao]|no\s+arranca|sin\s+freno(?:s)?)[^.;\n]{0,90})/i
  );
  if (match && match[1]) {
    return match[1].trim().replace(/[.,;]+$/g, '');
  }
  return seg.trim();
}

export type ParsedActionType =
  | 'ASIGNACION'
  | 'TRASLADO_SE_FUE'
  | 'SALIDA_SIN_DESTINO'
  | 'ROTURA_AVERIA'
  | 'REPARACION';

/**
 * Deterministic smart parser against live Supabase catalogs (`drivers`, `vehicles`, `obras`)
 * and current day assignments (`currentScheduleItems`).
 */
export function parseScheduleTextWithCatalogs(
  rawText: string,
  targetDate: string,
  catalogs: { drivers: any[]; vehicles: any[]; obras: any[] },
  currentScheduleItems?: DailyScheduleAssignmentItem[]
): {
  transcripcion: string;
  fechaDetectada: string;
  resumenOperativo: string;
  asignaciones: Array<{
    employeeId: string;
    employeeName: string;
    accion: ParsedActionType;
    estado: DailyScheduleEmployeeStatus;
    vehicleId?: string;
    vehicleCode?: string;
    vehicleName?: string;
    obraId?: string;
    obraName?: string;
    origenObraName?: string;
    ubicacion?: string;
    horario?: string;
    tarea?: string;
    roturaDetalle?: string;
    observaciones?: string;
  }>;
  mencionesSinVincular: Array<{ textoOriginal: string; sugerencia?: string; tarea?: string }>;
} {
  const { drivers, vehicles, obras } = catalogs;
  const cleanText = rawText.trim();

  const segments = cleanText
    .split(/(?:[.;\n]+|,\s*(?=[A-ZÁÉÍÓÚÑa-záéíóúñ]+\s+(?:con|va|a\s|en\s|queda|esta|está|tiene|lleva|agarra|se\s+fue|se\s+le|salio|salió|paso|pasó)))/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const asignaciones: Array<{
    employeeId: string;
    employeeName: string;
    accion: ParsedActionType;
    estado: DailyScheduleEmployeeStatus;
    vehicleId?: string;
    vehicleCode?: string;
    vehicleName?: string;
    obraId?: string;
    obraName?: string;
    origenObraName?: string;
    ubicacion?: string;
    horario?: string;
    tarea?: string;
    roturaDetalle?: string;
    observaciones?: string;
  }> = [];

  const mencionesSinVincular: Array<{ textoOriginal: string; sugerencia?: string; tarea?: string }> = [];

  for (const seg of segments) {
    const normSeg = normalizeStr(seg);
    if (!normSeg) continue;

    // 1. Find all drivers mentioned in this segment (deduplicated by lowercased id)
    const matchedDrivers: any[] = [];
    const seenDriverIds = new Set<string>();
    const pushDriver = (d: any) => {
      const key = String(d.id || d.codigo || d.nombreApellido || '').toLowerCase();
      if (!key || seenDriverIds.has(key)) return;
      seenDriverIds.add(key);
      matchedDrivers.push(d);
    };

    for (const d of drivers) {
      const fullName = String(d.nombreApellido || d.nombre || '').trim();
      const normFull = normalizeStr(fullName);
      if (!normFull) continue;

      if (normSeg.includes(normFull)) {
        pushDriver(d);
        continue;
      }

      const nameTokens = normFull.split(/[\s/()*.,-]+/).filter((t) => t.length >= 3);
      const wordBoundaryMatch = nameTokens.some((tk) => {
        if (tk.length < 4) return false;
        const regex = new RegExp(`\\b${escapeRegex(tk)}\\b`, 'i');
        return regex.test(normSeg);
      });
      if (wordBoundaryMatch) {
        pushDriver(d);
        continue;
      }

      for (const [nick, targets] of Object.entries(NICKNAME_MAP)) {
        const nickRegex = new RegExp(`\\b${escapeRegex(nick)}\\b`, 'i');
        if (nickRegex.test(normSeg) && targets.some((t) => normFull.includes(t))) {
          pushDriver(d);
          break;
        }
      }
    }

    // 2. Detect breakdown / repair / departure / status keywords
    const isBreakdown =
      /\b(rompi[oó]|roto|rota|aver[ií]a|fall[aó]|pinch[oó]|perdi[oó]\s+(?:aceite|agua|gasoil|presi[oó]n)|qued[oó]\s+parad[ao]|descompus[oó]|sin\s+freno(?:s)?|no\s+arranca|rotura|manguera\s+rota|cort[oó]\s+(?:correa|manguera|cadena|cable))\b/i.test(
        normSeg
      );
    const isRepaired =
      /\b(repar[oó]|arregl[oó]|solucion[oó]|qued[oó]\s+operativ[ao]|volvi[oó]\s+a\s+trabajar|ya\s+anda|habilitad[ao])\b/i.test(
        normSeg
      );
    const isDeparturePhrase =
      /\b(se\s+fue|se\s+retir[oó]|sali[oó]\s+de|dej[oó]\s+(?:la\s+obra|obra)|pas[oó]\s+a|cambi[oó]\s+(?:a|de)|termin[oó]\s+(?:en|la\s+obra)|lo\s+mand[eé]\s+a)\b/i.test(
        normSeg
      );

    let estado: DailyScheduleEmployeeStatus = 'EN_OBRA';
    if (/\b(franco|descanso|dia libre)\b/i.test(normSeg)) {
      estado = 'FRANCO';
    } else if (/\b(ausente|falto|falta|enfermo|medico)\b/i.test(normSeg)) {
      estado = 'AUSENTE';
    } else if (/\b(vacaciones|licencia)\b/i.test(normSeg)) {
      estado = 'VACACIONES';
    } else if (/\b(taller|mantenimiento|reparando|reparacion|mecanico)\b/i.test(normSeg)) {
      estado = 'TALLER';
    } else if (isBreakdown) {
      estado = 'ROTURA_AVERIA';
    } else if (/\b(base|playon|galpon|deposito central)\b/i.test(normSeg)) {
      estado = 'BASE';
    } else if (/\b(flete|traslado|viaje|carreton)\b/i.test(normSeg)) {
      estado = 'EN_FLETE';
    }

    // 3. Find vehicle mentioned in this segment
    const matchedVehicle = findBestVehicleMatch(seg, vehicles);

    // If breakdown/status update mentions a vehicle WITHOUT naming the driver, recover driver from currentScheduleItems
    if (matchedDrivers.length === 0 && matchedVehicle && currentScheduleItems && currentScheduleItems.length > 0) {
      const mVid = String(matchedVehicle.id || matchedVehicle.codigoInterno || '').toLowerCase();
      const mVCode = normalizeStr(matchedVehicle.codigoInterno || matchedVehicle.patente);
      const assignedUsers = currentScheduleItems.filter(
        (it) =>
          (it.vehicleId && it.vehicleId.toLowerCase() === mVid) ||
          (mVCode && normalizeStr(it.vehicleCode) === mVCode)
      );
      for (const au of assignedUsers) {
        pushDriver({
          id: au.employeeId,
          nombreApellido: au.employeeName,
          codigo: au.employeeCode,
        });
      }
    }

    // 4. Parse origin vs destination obra cleanly (handling "se fue de X a Y" or "se fue de X")
    let matchedObra: any = null;
    let customObraName = '';
    let origenObraName = '';

    // Check if there is an explicit "se fue de <X>" origin phrase
    const rawOriginExtract = extractCustomObraOrigin(seg);
    let destinationScanText = seg;

    if (rawOriginExtract) {
      const originCatalogMatch = findBestObraMatch(rawOriginExtract, obras);
      origenObraName = originCatalogMatch
        ? String(originCatalogMatch.nombreObra || originCatalogMatch.nombre || '')
        : rawOriginExtract;

      // Remove the "se fue de <origin>" clause so we don't confuse origin with destination
      const destSplitMatch = seg.match(/\b(?:a\s+la\s+obra|a\s+obra|hacia|para|y\s+va\s+a|y\s+fue\s+a|y\s+est[aá]\s+en)\s+(.+)$/i);
      destinationScanText = destSplitMatch ? destSplitMatch[0] : '';
    }

    if (estado === 'TALLER') {
      customObraName = 'Taller / Mantenimiento';
    } else if (estado === 'BASE') {
      customObraName = 'Base Central / Playón';
    } else if (['FRANCO', 'AUSENTE', 'VACACIONES'].includes(estado)) {
      customObraName = '';
    } else if (destinationScanText.trim()) {
      const explicitDestPhrase = extractCustomObraDestination(destinationScanText);
      if (explicitDestPhrase) {
        matchedObra = findBestObraMatch(explicitDestPhrase, obras);
        if (!matchedObra) {
          customObraName = explicitDestPhrase;
        }
      }
      if (!matchedObra && !customObraName) {
        // Strip already-matched driver and vehicle tokens so an obra sharing an employee's name doesn't false-match
        let strippedForObra = normalizeStr(destinationScanText);
        for (const emp of matchedDrivers) {
          const empNorm = normalizeStr(String(emp.nombreApellido || emp.nombre || ''));
          for (const tk of empNorm.split(/[\s/()*.,-]+/)) {
            if (tk.length >= 3) {
              strippedForObra = strippedForObra.replace(new RegExp(`\\b${escapeRegex(tk)}\\b`, 'gi'), ' ');
            }
          }
        }
        if (matchedVehicle?.modeloMarca) {
          const vNorm = normalizeStr(String(matchedVehicle.modeloMarca));
          for (const tk of vNorm.split(/[\s/()*.,-]+/)) {
            if (tk.length >= 4 && !VEHICLE_GENERIC_TOKENS.has(tk)) {
              strippedForObra = strippedForObra.replace(new RegExp(`\\b${escapeRegex(tk)}\\b`, 'gi'), ' ');
            }
          }
        }
        matchedObra = findBestObraMatch(strippedForObra, obras);
      }
    }

    // Determine parsed action
    let accion: ParsedActionType = 'ASIGNACION';
    if (isBreakdown && !isRepaired) {
      accion = 'ROTURA_AVERIA';
    } else if (isRepaired && !isBreakdown) {
      accion = 'REPARACION';
    } else if (isDeparturePhrase && !matchedObra && !customObraName && !['TALLER', 'BASE', 'FRANCO', 'AUSENTE', 'VACACIONES'].includes(estado)) {
      accion = 'SALIDA_SIN_DESTINO';
      estado = 'DISPONIBLE';
    } else if (isDeparturePhrase && (matchedObra || customObraName || estado === 'TALLER' || estado === 'BASE')) {
      accion = 'TRASLADO_SE_FUE';
    }

    // 5. Extract schedule time if mentioned
    let horario = '';
    const timeMatch = seg.match(/\b(\d{1,2}(?::\d{2})?\s*(?:a|hasta)\s*\d{1,2}(?::\d{2})?(?:\s*hs)?)\b/i);
    if (timeMatch) {
      horario = timeMatch[1];
    } else if (/\bturno\s+manana\b/i.test(normSeg)) {
      horario = '08:00 a 13:00';
    } else if (/\bturno\s+tarde\b/i.test(normSeg)) {
      horario = '14:00 a 19:00';
    }

    const roturaDetalle = accion === 'ROTURA_AVERIA' ? extractBreakdownDetail(seg) : '';

    if (matchedDrivers.length > 0) {
      for (const emp of matchedDrivers) {
        asignaciones.push({
          employeeId: String(emp.id || emp.codigo || ''),
          employeeName: String(emp.nombreApellido || emp.nombre || ''),
          accion,
          estado,
          vehicleId: matchedVehicle ? String(matchedVehicle.id || matchedVehicle.codigoInterno || '') : '',
          vehicleCode: matchedVehicle ? String(matchedVehicle.codigoInterno || matchedVehicle.patente || '') : '',
          vehicleName: matchedVehicle ? String(matchedVehicle.modeloMarca || '') : '',
          obraId: matchedObra ? String(matchedObra.id || matchedObra.numero || '') : '',
          obraName: matchedObra ? String(matchedObra.nombreObra || matchedObra.nombre || '') : customObraName,
          origenObraName,
          ubicacion: matchedObra ? String(matchedObra.ubicacion || '') : '',
          horario,
          tarea: seg,
          roturaDetalle,
        });
      }
    } else {
      mencionesSinVincular.push({
        textoOriginal: seg,
        tarea: seg,
      });
    }
  }

  return {
    transcripcion: cleanText,
    fechaDetectada: targetDate,
    resumenOperativo:
      asignaciones.length > 0
        ? `Esquema actualizado con ${asignaciones.length} novedad(es)/asignación(es) procesada(s).`
        : `Instrucción registrada (${cleanText.slice(0, 80)}).`,
    asignaciones,
    mencionesSinVincular,
  };
}

export interface ProcessScheduleInput {
  fecha?: string;
  origen: 'WHATSAPP_BAILEYS' | 'WEB_MIC' | 'WEB_UPLOAD' | 'TEXTO';
  audioBuffer?: Buffer;
  audioBase64?: string;
  audioUrl?: string;
  mimeType?: string;
  textInstruction?: string;
  senderJid?: string;
  senderPhone?: string;
  senderName?: string;
  existingLogId?: string;
}

export async function processAudioOrTextToSchedule(input: ProcessScheduleInput): Promise<{
  schedule: DailyScheduleRecord;
  audioLog: WhatsAppAudioLogRecord;
}> {
  const targetDate = input.fecha && /^\d{4}-\d{2}-\d{2}$/.test(input.fecha) ? input.fecha : getTodayISO();
  const nowIso = new Date().toISOString();
  const logId = input.existingLogId || `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  let resolvedAudioBuffer: Buffer | null = input.audioBuffer || null;
  let resolvedMimeType = (input.mimeType || 'audio/ogg').split(';')[0].trim();
  let resolvedAudioUrl = input.audioUrl || '';

  if (!resolvedAudioBuffer && input.audioBase64) {
    const raw = input.audioBase64.trim();
    const match = raw.match(/^data:([^;]+)(?:;[^,]*)?;base64,(.+)$/i);
    if (match) {
      resolvedMimeType = match[1].trim() || resolvedMimeType;
      resolvedAudioBuffer = Buffer.from(match[2], 'base64');
    } else {
      resolvedAudioBuffer = Buffer.from(raw, 'base64');
    }
  }

  const apiKey = resolveServerGeminiApiKey();

  // If reprocessing an existing R2 audio log without text override and GEMINI_API_KEY is missing,
  // fail explicitly BEFORE overwriting the existing log status so we follow strict error reporting.
  if (input.existingLogId && !input.textInstruction?.trim() && !resolvedAudioBuffer && !apiKey) {
    throw new Error(
      'Falta configurar GEMINI_API_KEY en Settings > Secrets del servidor para transcribir automáticamente el audio. Mientras tanto, usá "Editar / Aplicar" para escribir la instrucción.'
    );
  }

  // 1. ALWAYS upload audio binary to Cloudflare R2 FIRST so no incoming WhatsApp audio is ever lost
  if (resolvedAudioBuffer && !resolvedAudioUrl) {
    const ext =
      resolvedMimeType.includes('ogg') || resolvedMimeType.includes('opus')
        ? 'ogg'
        : resolvedMimeType.includes('mp4') || resolvedMimeType.includes('m4a')
        ? 'm4a'
        : resolvedMimeType.includes('mp3') || resolvedMimeType.includes('mpeg')
        ? 'mp3'
        : resolvedMimeType.includes('wav')
        ? 'wav'
        : 'webm';
    const r2Res = await uploadFileToR2(
      resolvedAudioBuffer,
      `programacion_${targetDate}_${Date.now()}.${ext}`,
      resolvedMimeType,
      'programacion-audios'
    );
    if (r2Res.success && r2Res.url) {
      resolvedAudioUrl = r2Res.url;
    }
  }

  // 2. If reprocessing an existing audio from R2 and GEMINI_API_KEY is present, fetch the audio binary
  if (!resolvedAudioBuffer && !input.textInstruction?.trim() && resolvedAudioUrl && apiKey) {
    const audioResp = await fetch(resolvedAudioUrl);
    if (!audioResp.ok) {
      throw new Error(`No se pudo descargar el audio almacenado desde Cloudflare R2 (HTTP ${audioResp.status}).`);
    }
    const arrBuf = await audioResp.arrayBuffer();
    resolvedAudioBuffer = Buffer.from(arrBuf);
    const respType = audioResp.headers.get('content-type');
    if (respType) {
      resolvedMimeType = respType.split(';')[0].trim() || resolvedMimeType;
    }
  }

  // 3. ALWAYS persist the incoming audio log in Supabase PostgreSQL immediately
  const pendingLog: WhatsAppAudioLogRecord = {
    id: logId,
    fecha: targetDate,
    hora: getCurrentHHMM(),
    origen: input.origen,
    senderJid: input.senderJid,
    senderPhone: input.senderPhone,
    senderName: input.senderName || (input.origen === 'WHATSAPP_BAILEYS' ? 'WhatsApp' : 'Panel Web'),
    audioUrl: resolvedAudioUrl,
    mimeType: resolvedMimeType,
    transcripcion: input.textInstruction || 'Procesando audio...',
    detectedCount: 0,
    scheduleId: `SCHED-${targetDate}`,
    estado: 'PROCESANDO',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await saveWhatsAppAudioLogToSupabase(pendingLog);

  try {
    const catalogs = await loadActiveCatalogsFromSupabase();
    const { drivers, vehicles, obras } = catalogs;
    const preloadedSchedule = await getOrCreateDailyScheduleInSupabase(targetDate, catalogs);

    let parsed: {
      transcripcion?: string;
      fechaDetectada?: string;
      resumenOperativo?: string;
      asignaciones?: any[];
      mencionesSinVincular?: any[];
    } | null = null;
    let verbatimTranscript = (input.textInstruction || '').trim();

    if (apiKey) {
      const driversCatalogText = drivers
        .map((d) => {
          const id = d.id || d.codigo || '';
          const name = d.nombreApellido || d.nombre || '';
          const code = d.codigo || d.legajo || '';
          const role = d.puesto || d.categoria || '';
          return `ID:${id} | Nombre:${name} | Legajo:${code} | Puesto:${role}`;
        })
        .join('\n');

      const vehiclesCatalogText = vehicles
        .map((v) => {
          const id = v.id || v.codigoInterno || '';
          const code = v.codigoInterno || v.codigoEquipo || v.codigo || '';
          const model = v.modeloMarca || '';
          const plate = v.patente || '';
          const type = v.clasificacion || '';
          return `ID:${id} | Código:${code} | Equipo:${model} | Patente:${plate} | Tipo:${type}`;
        })
        .join('\n');

      const obrasCatalogText = obras
        .map((o) => {
          const id = o.id || o.codigo || o.numero || '';
          const name = o.nombreObra || o.nombre || '';
          const client = o.clienteNombre || o.cliente || o.pertenece || '';
          const loc = o.ubicacion || '';
          return `ID:${id} | Obra:${name} | Cliente:${client} | Ubicación:${loc}`;
        })
        .join('\n');

      const currentAssignmentsText = preloadedSchedule.items
        .filter((it) => it.estado !== 'DISPONIBLE' || it.obraName || it.vehicleName || it.roturaDetalle)
        .map(
          (it) =>
            `ID:${it.employeeId} | ${it.employeeName} | Estado:${it.estado} | Equipo:${
              [it.vehicleCode, it.vehicleName].filter(Boolean).join(' ') || 'Sin máquina'
            } | Obra actual:${it.obraName || 'Sin obra'}${it.roturaDetalle ? ` | Rotura:${it.roturaDetalle}` : ''}`
        )
        .join('\n');

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      if (resolvedAudioBuffer) {
        try {
          const transResp = await ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: resolvedMimeType,
                    data: resolvedAudioBuffer.toString('base64'),
                  },
                },
                {
                  text: 'Transcribí este audio en español argentino de forma completa y precisa, prestando especial atención a nombres de choferes/empleados, máquinas viales, obras, si alguien se fue o cambió de obra, y si se rompió algo.',
                },
              ],
            },
          });
          if (transResp.text && transResp.text.trim()) {
            verbatimTranscript = transResp.text.trim();
          }
        } catch (transErr: any) {
          console.warn('[ScheduleAudioProcessor] Fallback directo a multimodal gemini-4-hydrogen:', transErr?.message);
        }
      }

      const systemInstruction = `Sos el Jefe de Despacho y Programación Operativa de "El Hornocal S.R.L. / La Hormiga" (empresa de maquinaria vial, camiones, áridos y obras en Jujuy, Argentina).
Tu tarea es escuchar el audio (o leer la transcripción/instrucción) y actualizar el esquema operativo diario cruzando CADA persona o máquina nombrada con:
1. El catálogo real de EMPLEADOS / CHOFERES de la empresa.
2. El catálogo real de EQUIPOS / MÁQUINAS / VEHÍCULOS de la empresa.
3. El catálogo real de OBRAS / DESTINOS de la empresa.
4. El ESTADO ACTUAL DEL ESQUEMA HOY (${targetDate}).

Reglas operativas críticas:
- Empleados por nombre, apellido o apodo ("Neftalí" -> Neftalí Carayuri, "Seba" -> Sebastian Mealla, "Javi" -> Javier Guillermo Coman, "Efra" -> Efrain Rodriguez, "Paco/Francisco" -> Francisco Matias Alanis, etc.): devolvé su "employeeId" y "employeeName" exactos del catálogo.
- Máquinas por marca o número interno ("Kobelco", "Zoomlion", "Doosan", "Ranger", "Amarok", "Foton", "Chulengo"): devolvé "vehicleId", "vehicleCode" y "vehicleName" exactos.
- Obras ("obra Roca" -> ROCA GOLF u obra Roca correspondiente): devolvé "obraId" y "obraName" del catálogo (o el nombre dicho si es obra nueva).
- TRASLADOS / "SE FUE" (MUY IMPORTANTE):
  * Si un empleado YA figuraba hoy en una Obra A en el ESTADO ACTUAL DEL ESQUEMA HOY y el nuevo audio lo nombra en otra Obra B (o en Taller/Base), devolvé accion = "TRASLADO_SE_FUE", poné la Obra A en "origenObraName" y la nueva Obra B en "obraId"/"obraName".
  * Si el audio dice que el empleado "se fue", "se retiró", "salió de la obra", "dejó la obra" SIN destino nuevo, devolvé accion = "SALIDA_SIN_DESTINO", estado = "DISPONIBLE", obraName = "" y el lugar del que se fue en "origenObraName".
- ROTURAS / AVERÍAS (MUY IMPORTANTE):
  * Si el audio dice que se rompió algo, tuvo una falla, pinchó, perdió aceite o quedó parada ("se rompió la manguera", "se rompió la Kobelco", etc.), devolvé estado = "ROTURA_AVERIA", accion = "ROTURA_AVERIA" y describí exactamente qué se rompió en "roturaDetalle".
  * Si solo nombran la máquina que se rompió sin nombrar al empleado (ej: "se rompió la Kobelco"), buscá en ESTADO ACTUAL DEL ESQUEMA HOY qué empleado tiene asignada esa máquina y asignale la novedad a ese empleado.
- Si dicen que ya se reparó o arregló, devolvé accion = "REPARACION" y estado = "EN_OBRA" (o el nuevo estado indicado).
- Taller -> estado = "TALLER", obraName = "Taller / Mantenimiento". Base -> estado = "BASE", obraName = "Base Central / Playón". Flete -> estado = "EN_FLETE". Franco/Ausente/Vacaciones -> estado correspondiente.

ESTADO ACTUAL DEL ESQUEMA HOY (${targetDate}):
${currentAssignmentsText || 'Sin asignaciones previas todavía (todos disponibles).'}

CATÁLOGO DE EMPLEADOS / CHOFERES ACTIVOS:
${driversCatalogText || 'Sin empleados cargados'}

CATÁLOGO DE EQUIPOS / FLOTA:
${vehiclesCatalogText || 'Sin equipos cargados'}

CATÁLOGO DE OBRAS / DESTINOS:
${obrasCatalogText || 'Sin obras cargadas'}`;

      const parts: any[] = [];
      if (resolvedAudioBuffer) {
        parts.push({
          inlineData: {
            mimeType: resolvedMimeType,
            data: resolvedAudioBuffer.toString('base64'),
          },
        });
      }
      if (verbatimTranscript) {
        parts.push({
          text: `Transcripción previa de referencia:\n"${verbatimTranscript}"`,
        });
      }
      parts.push({
        text: `Extraé todas las asignaciones, traslados ("se fue") y roturas/averías para la fecha objetivo (${targetDate}). Respondé en JSON válido respetando el schema.`,
      });

      try {
        const structuredResp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: SCHEDULE_EXTRACTION_SCHEMA,
          },
        });

        const rawJson = (structuredResp.text || '')
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```$/i, '')
          .trim();

        if (rawJson) {
          parsed = JSON.parse(rawJson);
        }
      } catch (aiErr: any) {
        console.warn('[ScheduleAudioProcessor] Fallback a parser determinístico por error en Gemini:', aiErr?.message);
        if (verbatimTranscript) {
          parsed = parseScheduleTextWithCatalogs(
            verbatimTranscript,
            targetDate,
            catalogs,
            preloadedSchedule.items
          );
        } else {
          throw aiErr;
        }
      }
    } else if (verbatimTranscript) {
      parsed = parseScheduleTextWithCatalogs(
        verbatimTranscript,
        targetDate,
        catalogs,
        preloadedSchedule.items
      );
    } else {
      // Binary audio received (e.g. from WhatsApp Baileys) while GEMINI_API_KEY is not present in server env
      const savedAudioOnlyLog: WhatsAppAudioLogRecord = {
        ...pendingLog,
        transcripcion:
          'Audio recibido y guardado en la bandeja. Escuchalo acá y usá "Editar / Aplicar" para dictar/escribir la orden (o configurá GEMINI_API_KEY en Settings > Secrets para transcripción automática).',
        resumenIA: 'Audio almacenado en Cloudflare R2 y Supabase PostgreSQL (pendiente de transcripción).',
        detectedCount: 0,
        detectedAssignments: [],
        scheduleId: preloadedSchedule.id,
        estado: 'APLICADO',
        updatedAt: new Date().toISOString(),
      };
      const savedLog = await saveWhatsAppAudioLogToSupabase(savedAudioOnlyLog);
      return {
        schedule: preloadedSchedule,
        audioLog: savedLog,
      };
    }

    if (!parsed) {
      throw new Error('No se pudieron extraer asignaciones del audio.');
    }

    const finalTranscript = parsed.transcripcion || verbatimTranscript || '(Audio procesado)';
    const effectiveDate =
      !input.fecha && parsed.fechaDetectada && /^\d{4}-\d{2}-\d{2}$/.test(parsed.fechaDetectada)
        ? parsed.fechaDetectada
        : targetDate;

    const currentSchedule =
      effectiveDate === targetDate
        ? preloadedSchedule
        : await getOrCreateDailyScheduleInSupabase(effectiveDate, catalogs);
    const updatedItems = [...currentSchedule.items];

    const findDriverIndex = (empId?: string, empName?: string): number => {
      if (empId) {
        const byExactId = updatedItems.findIndex((it) => it.employeeId === empId);
        if (byExactId !== -1) return byExactId;
        const lowerTarget = empId.toLowerCase();
        const byLowerId = updatedItems.findIndex((it) => it.employeeId.toLowerCase() === lowerTarget);
        if (byLowerId !== -1) return byLowerId;
      }
      if (empName) {
        const normTarget = normalizeStr(empName);
        if (!normTarget) return -1;
        const exactIdx = updatedItems.findIndex((it) => normalizeStr(it.employeeName) === normTarget);
        if (exactIdx !== -1) return exactIdx;
        const tokens = normTarget.split(/\s+/).filter((t) => t.length >= 3);
        if (tokens.length > 0) {
          const allTokensIdx = updatedItems.findIndex((it) => {
            const normCand = normalizeStr(it.employeeName);
            return tokens.every((tk) => normCand.includes(tk));
          });
          if (allTokensIdx !== -1) return allTokensIdx;

          const partialIdx = updatedItems.findIndex((it) => {
            const normCand = normalizeStr(it.employeeName);
            return tokens.some((tk) => tk.length >= 4 && normCand.includes(tk));
          });
          if (partialIdx !== -1) return partialIdx;
        }
      }
      return -1;
    };

    const resolveVehicle = (vId?: string, vCode?: string, vName?: string) => {
      if (!vId && !vCode && !vName) return null;
      for (const v of vehicles) {
        const id = String(v.id || '').trim();
        const code = String(v.codigoInterno || v.codigoEquipo || v.codigo || '').trim();
        const plate = String(v.patente || '').trim();
        const model = String(v.modeloMarca || '').trim();
        if (vId && (id === vId || code === vId)) return { id: id || code, code: code || plate, name: model };
        if (
          vCode &&
          (normalizeStr(code) === normalizeStr(vCode) || normalizeStr(plate) === normalizeStr(vCode))
        ) {
          return { id: id || code, code: code || plate, name: model };
        }
      }
      if (vName) {
        const best = findBestVehicleMatch(vName, vehicles);
        if (best) {
          return {
            id: String(best.id || best.codigoInterno || ''),
            code: String(best.codigoInterno || best.patente || ''),
            name: String(best.modeloMarca || ''),
          };
        }
      }
      return {
        id: vId || '',
        code: vCode || '',
        name: vName || '',
      };
    };

    const resolveObra = (oId?: string, oName?: string) => {
      if (!oId && !oName) return null;
      if (oName === 'Taller / Mantenimiento' || oName === 'Base Central / Playón') {
        return { id: '', name: oName, ubicacion: '' };
      }
      for (const o of obras) {
        const id = String(o.id || o.codigo || o.numero || '').trim();
        const name = String(o.nombreObra || o.nombre || '').trim();
        if (oId && id === oId) return { id, name, ubicacion: String(o.ubicacion || '') };
        if (oName && normalizeStr(name) === normalizeStr(oName))
          return { id, name, ubicacion: String(o.ubicacion || '') };
      }
      if (oName) {
        const best = findBestObraMatch(oName, obras);
        if (best) {
          return {
            id: String(best.id || best.codigo || best.numero || ''),
            name: String(best.nombreObra || best.nombre || ''),
            ubicacion: String(best.ubicacion || ''),
          };
        }
      }
      return { id: oId || '', name: oName || '', ubicacion: '' };
    };

    const detectedList: Array<Partial<DailyScheduleAssignmentItem>> = [];
    const validStatuses: DailyScheduleEmployeeStatus[] = [
      'EN_OBRA',
      'ROTURA_AVERIA',
      'TALLER',
      'BASE',
      'EN_FLETE',
      'DISPONIBLE',
      'FRANCO',
      'AUSENTE',
      'VACACIONES',
    ];
    const horaAhora = getCurrentHHMM();

    for (const rawItem of parsed.asignaciones || []) {
      const idx = findDriverIndex(rawItem.employeeId, rawItem.employeeName);
      const veh = resolveVehicle(rawItem.vehicleId, rawItem.vehicleCode, rawItem.vehicleName);
      const obr = resolveObra(rawItem.obraId, rawItem.obraName);
      const rawStatus = String(rawItem.estado || 'EN_OBRA').toUpperCase() as DailyScheduleEmployeeStatus;
      let status: DailyScheduleEmployeeStatus = validStatuses.includes(rawStatus) ? rawStatus : 'EN_OBRA';

      const rawAccion = String(rawItem.accion || '').toUpperCase() as ParsedActionType;
      const roturaFromItem = String(rawItem.roturaDetalle || '').trim();
      const origenAsignacion =
        input.origen === 'WHATSAPP_BAILEYS' ? 'AUDIO_WHATSAPP' : 'AUDIO_WEB';

      if (idx !== -1) {
        const current = updatedItems[idx];
        const prevObraName = (current.obraName || '').trim();
        const prevEstado = current.estado;
        const prevHistory = Array.isArray(current.historialMovimientos)
          ? [...current.historialMovimientos]
          : [];

        const newObraName = obr?.name || rawItem.obraName || '';
        const newObraId = obr?.id || '';
        const newVehicleId = veh?.id || current.vehicleId || '';
        const newVehicleCode = veh?.code || current.vehicleCode || '';
        const newVehicleName = veh?.name || current.vehicleName || '';

        const isDifferentActiveObra =
          Boolean(prevObraName) &&
          ['EN_OBRA', 'EN_FLETE', 'TALLER', 'BASE', 'ROTURA_AVERIA'].includes(prevEstado) &&
          Boolean(newObraName) &&
          normalizeStr(newObraName) !== normalizeStr(prevObraName);

        const isLeavingWithoutNewObra =
          rawAccion === 'SALIDA_SIN_DESTINO' ||
          (['FRANCO', 'AUSENTE', 'VACACIONES'].includes(status) && Boolean(prevObraName));

        const isBreakdownEvent =
          rawAccion === 'ROTURA_AVERIA' || status === 'ROTURA_AVERIA' || Boolean(roturaFromItem);
        const isRepairEvent = rawAccion === 'REPARACION';

        let finalObraId = newObraId || current.obraId || '';
        let finalObraName = newObraName || prevObraName || '';
        let finalRoturaDetalle = current.roturaDetalle || '';
        let finalObservaciones = rawItem.observaciones || current.observaciones || '';

        if (isBreakdownEvent && !isRepairEvent) {
          if (status !== 'TALLER') {
            status = 'ROTURA_AVERIA';
          }
          // If employee previously was at obra A and the breakdown audio only says "en obra B" (different), record transfer too
          if (isDifferentActiveObra) {
            prevHistory.push({
              id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              hora: horaAhora,
              tipo: 'SE_FUE_TRASLADO',
              estado: status,
              obraName: newObraName,
              vehicleCode: newVehicleCode,
              vehicleName: newVehicleName,
              detalle: `Se fue de ${prevObraName} ➔ ${newObraName}`,
              audioLogId: logId,
            });
            finalObraId = newObraId;
            finalObraName = newObraName;
          }

          finalRoturaDetalle = roturaFromItem || rawItem.tarea || 'Rotura / avería reportada';
          prevHistory.push({
            id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            hora: horaAhora,
            tipo: 'ROTURA',
            estado: status,
            obraName: finalObraName,
            vehicleCode: newVehicleCode,
            vehicleName: newVehicleName,
            detalle: `Se rompió: ${finalRoturaDetalle}`,
            audioLogId: logId,
          });
          const roturaNote = `⚠️ Rotura (${horaAhora}): ${finalRoturaDetalle}`;
          finalObservaciones = [roturaNote, finalObservaciones]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(' · ');
        } else if (isLeavingWithoutNewObra) {
          const leftFrom = String(rawItem.origenObraName || prevObraName || 'la obra').trim();
          if (rawAccion === 'SALIDA_SIN_DESTINO' && !['FRANCO', 'AUSENTE', 'VACACIONES', 'TALLER', 'BASE'].includes(status)) {
            status = 'DISPONIBLE';
          }
          finalObraId = '';
          finalObraName = status === 'TALLER' ? 'Taller / Mantenimiento' : status === 'BASE' ? 'Base Central / Playón' : '';
          finalRoturaDetalle = '';
          prevHistory.push({
            id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            hora: horaAhora,
            tipo: 'SALIDA',
            estado: status,
            obraName: leftFrom,
            vehicleCode: newVehicleCode,
            vehicleName: newVehicleName,
            detalle: `Se fue de ${leftFrom}${status !== 'DISPONIBLE' ? ` (${status})` : ''}`,
            audioLogId: logId,
          });
          finalObservaciones = `Se fue de ${leftFrom} (${horaAhora})`;
        } else if (rawAccion === 'TRASLADO_SE_FUE' || isDifferentActiveObra) {
          const leftFrom = String(rawItem.origenObraName || prevObraName || 'obra anterior').trim();
          finalObraId = newObraId;
          finalObraName = newObraName;
          finalRoturaDetalle = '';
          prevHistory.push({
            id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            hora: horaAhora,
            tipo: 'SE_FUE_TRASLADO',
            estado: status,
            obraName: finalObraName,
            vehicleCode: newVehicleCode,
            vehicleName: newVehicleName,
            detalle: `Se fue de ${leftFrom} ➔ ${finalObraName}`,
            audioLogId: logId,
          });
          const transferNote = `Se fue de ${leftFrom} (${horaAhora}) ➔ ${finalObraName}`;
          finalObservaciones = rawItem.observaciones
            ? `${transferNote} · ${rawItem.observaciones}`
            : transferNote;
        } else if (isRepairEvent) {
          finalRoturaDetalle = '';
          prevHistory.push({
            id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            hora: horaAhora,
            tipo: 'REPARACION',
            estado: status,
            obraName: finalObraName,
            vehicleCode: newVehicleCode,
            vehicleName: newVehicleName,
            detalle: rawItem.tarea || 'Reparado / vuelve a operar',
            audioLogId: logId,
          });
          finalObservaciones = `Reparado / operativo (${horaAhora})`;
        } else {
          // Standard assignment or update
          if (newObraName) {
            finalObraId = newObraId;
            finalObraName = newObraName;
          }
          if (status !== 'DISPONIBLE') {
            prevHistory.push({
              id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              hora: horaAhora,
              tipo: 'ASIGNACION',
              estado: status,
              obraName: finalObraName,
              vehicleCode: newVehicleCode,
              vehicleName: newVehicleName,
              detalle: [
                finalObraName ? `En ${finalObraName}` : status,
                newVehicleName ? `con ${newVehicleName}` : '',
              ]
                .filter(Boolean)
                .join(' '),
              audioLogId: logId,
            });
          }
        }

        const nextItem: DailyScheduleAssignmentItem = {
          ...current,
          estado: status,
          vehicleId: newVehicleId,
          vehicleCode: newVehicleCode,
          vehicleName: newVehicleName,
          obraId: finalObraId,
          obraName: finalObraName,
          ubicacion: rawItem.ubicacion || obr?.ubicacion || current.ubicacion || '',
          horario: rawItem.horario || current.horario || '08:00 a 18:00',
          tarea: rawItem.tarea || current.tarea || '',
          observaciones: finalObservaciones,
          roturaDetalle: finalRoturaDetalle,
          historialMovimientos: prevHistory,
          origenAsignacion,
          audioLogId: logId,
          updatedAt: new Date().toISOString(),
        };
        updatedItems[idx] = nextItem;
        detectedList.push(nextItem);
      } else if (rawItem.employeeName) {
        const customId = `EXT-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const isBreakdownEvent =
          rawAccion === 'ROTURA_AVERIA' || status === 'ROTURA_AVERIA' || Boolean(roturaFromItem);
        if (isBreakdownEvent && status !== 'TALLER') {
          status = 'ROTURA_AVERIA';
        }
        const finalObraName = obr?.name || rawItem.obraName || '';
        const finalRotura = isBreakdownEvent ? roturaFromItem || rawItem.tarea || 'Rotura reportada' : '';
        const customItem: DailyScheduleAssignmentItem = {
          id: `ITEM-${effectiveDate}-${customId}`,
          employeeId: customId,
          employeeName: String(rawItem.employeeName).trim(),
          estado: status,
          vehicleId: veh?.id || '',
          vehicleCode: veh?.code || '',
          vehicleName: veh?.name || '',
          obraId: obr?.id || '',
          obraName: finalObraName,
          ubicacion: rawItem.ubicacion || obr?.ubicacion || '',
          horario: rawItem.horario || '08:00 a 18:00',
          tarea: rawItem.tarea || '',
          observaciones: finalRotura ? `⚠️ Rotura (${horaAhora}): ${finalRotura}` : rawItem.observaciones || '',
          roturaDetalle: finalRotura,
          historialMovimientos: [
            {
              id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              hora: horaAhora,
              tipo: isBreakdownEvent ? 'ROTURA' : 'ASIGNACION',
              estado: status,
              obraName: finalObraName,
              vehicleCode: veh?.code || '',
              vehicleName: veh?.name || '',
              detalle: isBreakdownEvent
                ? `Se rompió: ${finalRotura}`
                : [finalObraName ? `En ${finalObraName}` : status, veh?.name ? `con ${veh.name}` : '']
                    .filter(Boolean)
                    .join(' '),
              audioLogId: logId,
            },
          ],
          origenAsignacion,
          audioLogId: logId,
          updatedAt: new Date().toISOString(),
        };
        updatedItems.push(customItem);
        detectedList.push(customItem);
      }
    }

    const nextSchedule: DailyScheduleRecord = {
      ...currentSchedule,
      fecha: effectiveDate,
      resumenOperativo: parsed.resumenOperativo || currentSchedule.resumenOperativo,
      items: updatedItems,
      unmatchedMentions: [
        ...(currentSchedule.unmatchedMentions || []),
        ...(Array.isArray(parsed.mencionesSinVincular) ? parsed.mencionesSinVincular : []),
      ],
      appliedAudioIds: Array.from(new Set([...(currentSchedule.appliedAudioIds || []), logId])),
      updatedAt: new Date().toISOString(),
    };

    const savedSchedule = await saveDailyScheduleToSupabase(nextSchedule);

    const completedLog: WhatsAppAudioLogRecord = {
      ...pendingLog,
      fecha: effectiveDate,
      transcripcion: finalTranscript,
      resumenIA: parsed.resumenOperativo || '',
      detectedCount: detectedList.length,
      detectedAssignments: detectedList,
      scheduleId: savedSchedule.id,
      estado: 'APLICADO',
      updatedAt: new Date().toISOString(),
    };

    const savedLog = await saveWhatsAppAudioLogToSupabase(completedLog);

    return {
      schedule: savedSchedule,
      audioLog: savedLog,
    };
  } catch (err: any) {
    const failedLog: WhatsAppAudioLogRecord = {
      ...pendingLog,
      estado: 'ERROR',
      errorMsg: err?.message || 'Error al procesar el audio con IA',
      updatedAt: new Date().toISOString(),
    };
    await saveWhatsAppAudioLogToSupabase(failedLog).catch(() => {});
    throw err;
  }
}

export function formatScheduleForWhatsAppText(schedule: DailyScheduleRecord): string {
  const broken = schedule.items.filter(
    (i) => i.estado === 'ROTURA_AVERIA' || Boolean(i.roturaDetalle)
  );
  const assigned = schedule.items.filter(
    (i) => ['EN_OBRA', 'TALLER', 'BASE', 'EN_FLETE'].includes(i.estado) && i.estado !== 'ROTURA_AVERIA' && !i.roturaDetalle
  );
  const available = schedule.items.filter((i) => i.estado === 'DISPONIBLE');
  const absent = schedule.items.filter((i) =>
    ['FRANCO', 'AUSENTE', 'VACACIONES'].includes(i.estado)
  );

  const lines: string[] = [
    `*PROGRAMACIÓN DEL DÍA - ${schedule.fecha}*`,
    schedule.resumenOperativo ? `_${schedule.resumenOperativo}_` : '',
    '',
  ];

  if (broken.length > 0) {
    lines.push(`*⚠️ ROTURAS / AVERÍAS (${broken.length}):*`);
    for (const item of broken) {
      const equipPart =
        item.vehicleName || item.vehicleCode
          ? ` | Equipo: *${[item.vehicleCode, item.vehicleName].filter(Boolean).join(' - ')}*`
          : '';
      const destPart = item.obraName ? ` en *${item.obraName}*` : '';
      const detPart = item.roturaDetalle ? ` — ⚠️ _${item.roturaDetalle}_` : '';
      lines.push(`• *${item.employeeName}*${equipPart}${destPart}${detPart}`);
    }
    lines.push('');
  }

  lines.push(`*ASIGNADOS (${assigned.length}):*`);

  if (assigned.length === 0) {
    lines.push('- Sin asignaciones cargadas aún.');
  } else {
    for (const item of assigned) {
      const equipPart =
        item.vehicleName || item.vehicleCode
          ? ` | Equipo: *${[item.vehicleCode, item.vehicleName].filter(Boolean).join(' - ')}*`
          : '';
      const destPart = item.obraName ? ` ➔ *${item.obraName}*` : ` (${item.estado})`;
      const lastTransfer = [...(item.historialMovimientos || [])]
        .reverse()
        .find((m) => m.tipo === 'SE_FUE_TRASLADO');
      const transferPart = lastTransfer ? ` _(${lastTransfer.detalle} · ${lastTransfer.hora})_` : '';
      const taskPart = item.tarea ? ` — _${item.tarea}_` : '';
      const timePart = item.horario ? ` [${item.horario}]` : '';
      lines.push(`• *${item.employeeName}*${equipPart}${destPart}${transferPart}${taskPart}${timePart}`);
    }
  }

  if (available.length > 0) {
    const leftItems = available.filter((a) =>
      (a.historialMovimientos || []).some((m) => m.tipo === 'SALIDA')
    );
    const plainAvailable = available.filter(
      (a) => !(a.historialMovimientos || []).some((m) => m.tipo === 'SALIDA')
    );

    if (leftItems.length > 0) {
      lines.push('');
      lines.push(`*SE FUERON / SALIERON DE OBRA (${leftItems.length}):*`);
      for (const l of leftItems) {
        const lastSalida = [...(l.historialMovimientos || [])].reverse().find((m) => m.tipo === 'SALIDA');
        lines.push(`• *${l.employeeName}* — ${lastSalida ? `${lastSalida.detalle} (${lastSalida.hora})` : l.observaciones || 'Se fue'}`);
      }
    }

    if (plainAvailable.length > 0) {
      lines.push('');
      lines.push(`*SIN ASIGNAR / DISPONIBLES (${plainAvailable.length}):*`);
      lines.push(plainAvailable.map((a) => a.employeeName).join(', '));
    }
  }

  if (absent.length > 0) {
    lines.push('');
    lines.push(`*FRANCOS / AUSENTES (${absent.length}):*`);
    for (const a of absent) {
      lines.push(`• ${a.employeeName} (${a.estado}${a.observaciones ? `: ${a.observaciones}` : ''})`);
    }
  }

  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
}
