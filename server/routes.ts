import express from 'express';
import https from 'https';
import forge from 'node-forge';
import { getDbPool, checkDbConnection, getConnectionString, isCockroachClusterDisabled, markClusterDisabled } from './db.js';
import { checkCertificateKeyMatch, getWsaaAuth, wsfeGetLastVoucher, wsfeAuthorizeInvoice, wsfeConsultVoucher, wsfeGetExchangeRate, wsPadronConsultCuit, mapTipoComprobanteToCode } from './afip.js';
import { getR2Client, uploadFileToR2 } from './r2.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import * as XLSX from 'xlsx';
import { analyzeDocumentImageWithGemini } from './geminiDocumentAnalyzer.js';
import {
  getOrCreateDailyScheduleInSupabase,
  saveDailyScheduleToSupabase,
  processAudioOrTextToSchedule,
  formatScheduleForWhatsAppText,
  bumpScheduleMutationVersion,
} from './scheduleAudioProcessor.js';
import {
  getBaileysStatus,
  startBaileysConnection,
  disconnectBaileysSession,
  saveBaileysConfigToSupabase,
  sendWhatsAppMessageViaBaileys,
  autoResumeBaileysSessionIfStored,
} from './whatsappBaileys.js';

const router = express.Router();

// --- In-Memory Read Cache (temporary invalidatable optimization only, never source of truth) ---
interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}
const serverMemoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds TTL

function getFromCache<T = any>(key: string): T | null {
  const entry = serverMemoryCache.get(key);
  if (entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS) {
    return entry.data as T;
  }
  return null;
}

function setInCache(key: string, data: any): void {
  serverMemoryCache.set(key, { data, timestamp: Date.now() });
}

function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    serverMemoryCache.clear();
    return;
  }
  for (const k of serverMemoryCache.keys()) {
    if (k.startsWith(keyPrefix)) {
      serverMemoryCache.delete(k);
    }
  }
}

// 1. Status & Diagnostics Endpoint (cached for 30s to avoid RU waste on poll)
router.get('/status', async (req, res) => {
  const cachedStatus = getFromCache('db_status_diagnostics');
  if (cachedStatus) {
    return res.json(cachedStatus);
  }

  const dbStatus = await checkDbConnection();
  const r2 = getR2Client();

  const isConfigured = !!getConnectionString();
  const statusPayload = {
    supabaseDb: {
      configured: isConfigured,
      connected: dbStatus.connected,
      message: dbStatus.message,
      version: dbStatus.version,
    },
    cockroachDb: {
      configured: isConfigured,
      connected: dbStatus.connected,
      message: dbStatus.message,
      version: dbStatus.version,
    },
    cloudflareR2: {
      configured: !!r2,
      bucket: r2?.bucket || null,
      publicUrl: r2?.publicUrl || null,
      message: r2 ? 'Cloudflare R2 configurado y listo' : 'Variables de Cloudflare R2 pendientes',
    },
  };

  setInCache('db_status_diagnostics', statusPayload);
  res.json(statusPayload);
});

// Enforce Cloudflare R2 storage for any embedded binary DataURI (never persist base64 blobs into DB)
const DATA_URI_BINARY_REGEX = /^data:((?:image|application|video|audio)\/[^;]+);base64,(.+)$/i;

function guessExtensionFromMime(mime: string): string {
  const clean = mime.toLowerCase().split(';')[0].trim();
  if (clean === 'image/webp') return 'webp';
  if (clean === 'image/png') return 'png';
  if (clean === 'image/jpeg' || clean === 'image/jpg') return 'jpg';
  if (clean === 'image/svg+xml') return 'svg';
  if (clean === 'application/pdf') return 'pdf';
  return clean.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'bin';
}

function hasDataUriBase64(payload: unknown): boolean {
  if (payload === null || payload === undefined) return false;
  if (typeof payload === 'string') {
    return payload.length > 32 && payload.startsWith('data:') && DATA_URI_BINARY_REGEX.test(payload);
  }
  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) {
      if (hasDataUriBase64(payload[i])) return true;
    }
    return false;
  }
  if (typeof payload === 'object') {
    const values = Object.values(payload as Record<string, unknown>);
    for (let i = 0; i < values.length; i++) {
      if (hasDataUriBase64(values[i])) return true;
    }
  }
  return false;
}

async function enforceR2OnPayload<T>(payload: T, folder: string): Promise<T> {
  if (payload === null || payload === undefined) return payload;
  if (!hasDataUriBase64(payload)) return payload;

  if (typeof payload === 'string') {
    const match = payload.match(DATA_URI_BINARY_REGEX);
    if (!match) return payload;

    const mime = match[1];
    const base64Body = match[2];
    const buffer = Buffer.from(base64Body, 'base64');
    const ext = guessExtensionFromMime(mime);
    const uploadRes = await uploadFileToR2(buffer, `auto_${Date.now()}.${ext}`, mime, folder);
    if (!uploadRes.success || !uploadRes.url) {
      throw new Error(
        uploadRes.error ||
        'No se pudo subir el archivo adjunto a Cloudflare R2. No se guardó en la base de datos.'
      );
    }
    return uploadRes.url as unknown as T;
  }

  if (Array.isArray(payload)) {
    const mapped = await Promise.all(payload.map(item => enforceR2OnPayload(item, folder)));
    return mapped as unknown as T;
  }

  if (typeof payload === 'object') {
    const entries = await Promise.all(
      Object.entries(payload as Record<string, any>).map(async ([k, v]) => [
        k,
        await enforceR2OnPayload(v, folder),
      ])
    );
    return Object.fromEntries(entries) as T;
  }

  return payload;
}

// Helper for multi-row bulk insert (combines N separate inserts into a single parameterized SQL statement to drastically cut RUs)
async function executeMultiRowBatchUpsert(
  pool: any,
  tableName: string,
  idField: string,
  items: any[],
  extraColumnsExtractor?: (item: any) => Record<string, any>
) {
  if (!items || items.length === 0) return;

  // Deduplicate by primary key to prevent PostgreSQL error:
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" (SQLSTATE 21000)
  const dedupedMap = new Map<string, any>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const rawId = item[idField] ?? item.id;
    if (rawId === undefined || rawId === null) continue;
    const idStr = String(rawId).trim();
    if (!idStr) continue;

    if (!dedupedMap.has(idStr)) {
      dedupedMap.set(idStr, item);
    } else {
      const existing = dedupedMap.get(idStr);
      const existingTs = String(existing?.updatedAt || existing?.createdAt || '');
      const incomingTs = String(item?.updatedAt || item?.createdAt || '');
      if (incomingTs && (!existingTs || incomingTs > existingTs)) {
        dedupedMap.set(idStr, item);
      }
    }
  }
  const uniqueItems = Array.from(dedupedMap.values());
  if (uniqueItems.length === 0) return;

  const CHUNK_SIZE = 50;
  for (let i = 0; i < uniqueItems.length; i += CHUNK_SIZE) {
    const chunk = uniqueItems.slice(i, i + CHUNK_SIZE);
    const sampleExtra = extraColumnsExtractor && chunk[0] ? extraColumnsExtractor(chunk[0]) : {};
    const extraColKeys = Object.keys(sampleExtra);
    const colNames = ['id', 'data', 'updated_at', ...extraColKeys];

    const valueRows: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    for (const item of chunk) {
      const id = String(item[idField] ?? item.id ?? '').trim();
      if (!id) continue;

      const extraCols = extraColumnsExtractor ? extraColumnsExtractor(item) : {};
      const rowValues = [id, JSON.stringify(item), new Date(), ...extraColKeys.map(k => extraCols[k] ?? null)];
      const placeholders = rowValues.map(() => `$${paramIdx++}`).join(', ');
      valueRows.push(`(${placeholders})`);
      params.push(...rowValues);
    }

    if (valueRows.length === 0) continue;

    const updateSets = colNames
      .filter(c => c !== 'id')
      .map(c => `${c} = EXCLUDED.${c}`)
      .join(', ');

    const query = `
      INSERT INTO ${tableName} (${colNames.join(', ')})
      VALUES ${valueRows.join(', ')}
      ON CONFLICT (id) DO UPDATE SET ${updateSets};
    `;

    await pool.query(query, params);
  }
}

// Helper for strict Supabase PostgreSQL table CRUD (zero local disk fallback)
function createEntityRoutes(tableName: string, idField: string = 'id', extraColumnsExtractor?: (item: any) => Record<string, any>) {
  // GET all (Supabase PostgreSQL with 30s invalidatable read cache)
  router.get(`/${tableName}`, async (req, res) => {
    const bypassCache = req.query.nocache === '1' || req.query.fresh === '1';
    const cacheKey = `collection_${tableName}`;
    if (!bypassCache) {
      const cached = getFromCache<any[]>(cacheKey);
      if (cached !== null) {
        return res.json(cached);
      }
    }

    const pool = getDbPool();
    if (!pool || isCockroachClusterDisabled()) {
      return res.status(503).json({
        error: `Conexión a Supabase PostgreSQL no disponible para consultar ${tableName}.`,
      });
    }
    try {
      const result = await pool.query(`SELECT data FROM ${tableName} ORDER BY updated_at DESC;`);
      const items = result.rows.map(r => r.data);
      setInCache(cacheKey, items);
      return res.json(items);
    } catch (error: any) {
      console.error(`[DB] Error consultando ${tableName} en Supabase:`, error.message);
      return res.status(500).json({
        error: error?.message || `Error consultando ${tableName} en Supabase PostgreSQL.`,
      });
    }
  });

  // POST (Upsert / Save item or batch)
  router.post(`/${tableName}`, async (req, res) => {
    try {
      let payload: any;
      try {
        payload = await enforceR2OnPayload(req.body, `uploads/${tableName}`);
      } catch (r2Err: any) {
        return res.status(502).json({ error: r2Err?.message || 'No se pudo subir el archivo a Cloudflare R2' });
      }
      const incomingList = Array.isArray(payload) ? payload : [payload];

      const pool = getDbPool();
      if (!pool || isCockroachClusterDisabled()) {
        return res.status(503).json({
          error: `Conexión a Supabase PostgreSQL no disponible. No se confirmó el guardado en ${tableName}.`,
        });
      }

      if (Array.isArray(payload)) {
        await executeMultiRowBatchUpsert(pool, tableName, idField, payload, extraColumnsExtractor);
      } else {
        const item = payload;
        const id = item?.[idField] || item?.id;
        if (id) {
          const extraCols = extraColumnsExtractor ? extraColumnsExtractor(item) : {};
          const colNames = ['id', 'data', 'updated_at', ...Object.keys(extraCols)];
          const colPlaceholders = colNames.map((_, i) => `$${i + 1}`).join(', ');
          const colValues = [id, JSON.stringify(item), new Date(), ...Object.values(extraCols)];
          const updateSets = colNames
            .filter(c => c !== 'id')
            .map(c => `${c} = EXCLUDED.${c}`)
            .join(', ');

          await pool.query(
            `INSERT INTO ${tableName} (${colNames.join(', ')})
             VALUES (${colPlaceholders})
             ON CONFLICT (id) DO UPDATE SET ${updateSets};`,
            colValues
          );
        }
      }

      if (tableName === 'rentals') {
        const list = Array.isArray(payload) ? payload : [payload];
        for (const r of list) {
          if (r && (r.clienteNombre || r.clienteDocumento)) {
            await autoUpsertClientInDb(pool, {
              cuit: r.clienteDocumento,
              razonSocial: r.clienteNombre,
              condicionIva: r.clienteCondicionIva,
              condicionVenta: r.condicionVenta,
              domicilio: r.direccionObra,
              localidad: r.localidadObra,
              zona: r.zonaObra,
              telefono: r.clienteTelefono,
              email: r.clienteEmail,
              fuente: 'ALQUILER',
              ultimoComprobante: r.numeroContrato || r.id,
            }).catch(() => {});
          }
        }
      } else if (tableName === 'arca_invoices') {
        const list = Array.isArray(payload) ? payload : [payload];
        for (const inv of list) {
          if (inv && (inv.razonSocialReceptor || inv.nroDocReceptor)) {
            await autoUpsertClientInDb(pool, {
              cuit: inv.nroDocReceptor,
              razonSocial: inv.razonSocialReceptor,
              condicionIva: inv.condicionIvaReceptor,
              condicionVenta: inv.condicionVenta,
              domicilio: inv.domicilioReceptor,
              fuente: 'FACTURA_ARCA',
              ultimoComprobante: inv.id,
            }).catch(() => {});
          }
        }
      }

      invalidateCache(`table_${tableName}`);
      invalidateCache(`collection_${tableName}`);
      return res.json({ success: true, count: incomingList.length });
    } catch (error: any) {
      console.error(`Error procesando POST en ${tableName}:`, error);
      return res.status(500).json({ error: error?.message || `Error guardando en Supabase (${tableName}).` });
    }
  });

  // PUT (Non-destructive upsert by default; full collection replace ONLY if explicit allowReplace header/query is sent)
  router.put([`/${tableName}`, `/${tableName}/sync`], async (req, res) => {
    try {
      let payload: any;
      try {
        payload = await enforceR2OnPayload(req.body, `uploads/${tableName}`);
      } catch (r2Err: any) {
        return res.status(502).json({ error: r2Err?.message || 'No se pudo subir el archivo a Cloudflare R2' });
      }
      const items = Array.isArray(payload) ? payload : [];
      const allowReplace =
        req.headers['x-allow-replace'] === '1' ||
        req.query.replace === '1' ||
        req.query.replace === 'true';

      const pool = getDbPool();
      if (!pool || isCockroachClusterDisabled()) {
        return res.status(503).json({
          error: `Conexión a Supabase PostgreSQL no disponible. No se confirmó la sincronización en ${tableName}.`,
        });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (items.length === 0) {
          if (allowReplace) {
            await client.query(`DELETE FROM ${tableName};`);
          }
        } else {
          if (allowReplace) {
            const ids: string[] = Array.from(
              new Set(
                items
                  .map(item => String(item?.[idField] ?? item?.id ?? '').trim())
                  .filter(id => id.length > 0)
              )
            );

            if (ids.length > 0) {
              const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
              await client.query(
                `DELETE FROM ${tableName} WHERE id NOT IN (${placeholders});`,
                ids
              );
            }
          }
          await executeMultiRowBatchUpsert(client, tableName, idField, items, extraColumnsExtractor);
        }
        await client.query('COMMIT');
      } catch (txErr) {
        try { await client.query('ROLLBACK'); } catch {}
        throw txErr;
      } finally {
        client.release();
      }

      invalidateCache(`table_${tableName}`);
      invalidateCache(`collection_${tableName}`);
      return res.json({ success: true, count: items.length });
    } catch (error: any) {
      console.error(`Error procesando PUT en ${tableName}:`, error);
      return res.status(500).json({ error: error?.message || `Error sincronizando en Supabase (${tableName}).` });
    }
  });

  // DELETE ALL
  router.delete(`/${tableName}`, async (_req, res) => {
    try {
      const pool = getDbPool();
      if (!pool || isCockroachClusterDisabled()) {
        return res.status(503).json({
          error: `Conexión a Supabase PostgreSQL no disponible. No se confirmó el borrado en ${tableName}.`,
        });
      }

      await pool.query(`DELETE FROM ${tableName};`);
      invalidateCache(`table_${tableName}`);
      invalidateCache(`collection_${tableName}`);

      return res.json({ success: true, message: `Todos los registros de ${tableName} fueron eliminados de Supabase` });
    } catch (error: any) {
      console.error(`Error borrando ${tableName}:`, error);
      return res.status(500).json({ error: error?.message || `Error borrando ${tableName} en Supabase.` });
    }
  });

  // DELETE by ID
  router.delete(`/${tableName}/:id`, async (req, res) => {
    try {
      const { id } = req.params;
      const pool = getDbPool();
      if (!pool || isCockroachClusterDisabled()) {
        return res.status(503).json({
          error: `Conexión a Supabase PostgreSQL no disponible. No se confirmó el borrado del registro ${id}.`,
        });
      }

      await pool.query(`DELETE FROM ${tableName} WHERE id = $1;`, [id]);
      invalidateCache(`table_${tableName}`);
      invalidateCache(`collection_${tableName}`);

      return res.json({ success: true, deletedId: id });
    } catch (error: any) {
      console.error(`Error borrando en ${tableName}:`, error);
      return res.status(500).json({ error: error?.message || `Error eliminando en Supabase (${tableName}).` });
    }
  });
}

// 2. Register standard entity routes
createEntityRoutes('vehicles', 'id', (v) => ({
  modelo_marca: v.modeloMarca || '',
  patente: v.patente || '',
  codigo_interno: v.codigoInterno || '',
  clasificacion: v.clasificacion || '',
  estado: v.estado || '',
  fotografia: v.fotografia || '',
}));

createEntityRoutes('fuel_vouchers', 'id', (v) => ({
  numero_vale: v.numeroVale || '',
  fecha: v.fecha || '',
  codigo_equipo: v.codigoEquipo || '',
  patente: v.patente || '',
  deposito_origen: v.depositoOrigen || '',
  tipo_combustible: v.tipoCombustible || '',
  cantidad: Number(v.cantidad || 0),
  kilometraje: Number(v.kilometraje || 0),
}));

createEntityRoutes('partes_diarios', 'id', (p) => ({
  fecha: p.fecha || '',
  codigo_equipo: p.codigoEquipo || '',
  obra: p.obra || '',
  chofer: p.nombreApellido || p.chofer || '',
  horas_trabajadas: Number(p.horasTrabajadas ?? p.hsCantidad ?? 0),
}));

createEntityRoutes('truck_performance_trips', 'id', (t) => ({
  fecha: t.fecha || '',
  categoria_equipo: t.categoriaEquipo || 'CAMIONES',
  codigo_equipo: t.codigoEquipo || '',
  patente: t.patente || '',
  chofer_nombre: t.choferNombre || '',
  lugar_inicio: t.lugarInicio || '',
  lugar_final: t.lugarFinal || '',
  kilometros: Number(t.kilometros || 0),
  fuel_voucher_id: t.fuelVoucherId || '',
}));

createEntityRoutes('drivers', 'id', (d) => ({
  nombre_completo: d.nombreCompleto || '',
  dni: d.dni || '',
  legajo: d.legajo || '',
}));

createEntityRoutes('obras', 'id', (o) => ({
  nombre: o.nombreObra || o.nombre || '',
  ubicacion: o.ubicacion || '',
}));

// Helper: guarantee zero base64 DataURLs ever get stored inside Supabase JSONB
async function offloadAttachmentsListToR2(adjuntos: any[] | undefined, folder: string): Promise<any[] | undefined> {
  if (!Array.isArray(adjuntos) || adjuntos.length === 0) return adjuntos;
  const processed: any[] = [];
  for (const att of adjuntos) {
    if (att && typeof att.url === 'string' && att.url.startsWith('data:')) {
      const match = att.url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new Error(`Formato de adjunto inválido para "${att.nombre || 'archivo'}".`);
      }
      const mimeType = match[1] || 'application/octet-stream';
      const buffer = Buffer.from(match[2], 'base64');
      const r2Res = await uploadFileToR2(buffer, att.nombre || 'adjunto', mimeType, folder);
      if (!r2Res.success || !r2Res.url) {
        throw new Error(r2Res.error || `No se pudo subir "${att.nombre}" a Cloudflare R2.`);
      }
      processed.push({ ...att, url: r2Res.url });
    } else {
      processed.push(att);
    }
  }
  return processed;
}

// Strict Supabase-confirmed save for Obra Legajos, Facturas, Gastos y Costos
router.post('/obras/:id/legajo', express.json({ limit: '25mb' }), async (req, res) => {
  try {
    const { id } = req.params;
    const rawObra = req.body;
    if (!rawObra || String(rawObra.id) !== String(id)) {
      return res.status(400).json({ error: 'Datos de obra inválidos o ID no coincide.' });
    }

    const pool = getDbPool();
    if (!pool || isCockroachClusterDisabled()) {
      return res.status(503).json({
        error: 'Conexión a Supabase PostgreSQL no disponible. No se confirmó el guardado.'
      });
    }

    // Offload any remaining DataURL attachments to Cloudflare R2 so Supabase only stores R2 URLs
    const obra = { ...rawObra };
    if (Array.isArray(obra.facturasLegajo)) {
      const nextFacturas = [];
      for (const f of obra.facturasLegajo) {
        const cleanAdj = await offloadAttachmentsListToR2(f.adjuntos, 'obras-legajos');
        nextFacturas.push({ ...f, adjuntos: cleanAdj });
      }
      obra.facturasLegajo = nextFacturas;
    }
    if (Array.isArray(obra.gastosManuales)) {
      const nextGastos = [];
      for (const g of obra.gastosManuales) {
        const cleanAdj = await offloadAttachmentsListToR2(g.adjuntos, 'obras-legajos');
        nextGastos.push({ ...g, adjuntos: cleanAdj });
      }
      obra.gastosManuales = nextGastos;
    }

    const nombre = obra.nombreObra || obra.nombre || '';
    const ubicacion = obra.ubicacion || '';
    const result = await pool.query(
      `INSERT INTO obras (id, nombre, ubicacion, data, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         ubicacion = EXCLUDED.ubicacion,
         data = EXCLUDED.data,
         updated_at = NOW()
       RETURNING data;`,
      [id, nombre, ubicacion, JSON.stringify(obra)]
    );

    const savedObra = result.rows[0]?.data || obra;
    invalidateCache('table_obras');
    invalidateCache('collection_obras');

    return res.json({ success: true, obra: savedObra });
  } catch (error: any) {
    console.error('[DB] Error guardando legajo de obra en Supabase:', error);
    return res.status(500).json({ error: error?.message || 'Error persistiendo obra en Supabase PostgreSQL' });
  }
});

createEntityRoutes('fuel_deposits', 'id', (d) => ({
  nombre: d.nombre || '',
  capacidad_total: Number(d.capacidadTotal || 0),
  nivel_actual: Number(d.nivelActual || 0),
}));

createEntityRoutes('issued_vouchers', 'id', (v) => ({
  numero_vale: v.numeroVale || '',
  fecha: v.fecha || '',
  destinatario: v.destinatario || '',
}));

createEntityRoutes('rentals', 'id', (r) => ({
  numero_contrato: r.numeroContrato || '',
  cliente: r.clienteNombre || '',
  equipo_id: r.equipoId || '',
  estado: r.estado || '',
}));

createEntityRoutes('hardware', 'id', (h) => ({
  codigo: h.codigo || '',
  nombre: h.nombre || '',
  categoria: h.categoria || '',
}));

createEntityRoutes('aridos', 'id', (a) => ({
  material: a.material || '',
  unidad: a.unidadMedida || '',
}));

createEntityRoutes('stock_items', 'id', (item) => ({
  codigo: item.codigo || '',
  nombre: item.nombre || '',
  categoria: item.categoriaId || item.categoria || '',
}));

createEntityRoutes('stock_movements', 'id', (m) => ({
  item_id: m.itemId || '',
  tipo: m.tipo || '',
  fecha: m.fecha || '',
}));

createEntityRoutes('stock_categories', 'id', (c) => ({
  nombre: c.nombre || '',
  slug: c.slug || '',
}));

createEntityRoutes('stock_warehouses', 'id', (w) => ({
  codigo: w.codigo || '',
  nombre: w.nombre || '',
  tipo: w.tipo || '',
}));

createEntityRoutes('vehicle_services', 'id', (s) => ({
  equipo_codigo: s.equipoCodigo || '',
  fecha: s.fecha || '',
  tipo_servicio: s.tipoServicio || '',
}));

createEntityRoutes('vehicle_expenses', 'id', (e) => ({
  equipo_codigo: e.equipoPatenteOrCodigo || e.equipoCodigo || e.equipoId || '',
  fecha: e.fecha || '',
  tipo_gasto: e.subcategoriaOriginal || e.categoria || e.tipoGasto || '',
  monto: Number(e.montoTotal ?? e.monto ?? 0),
}));

createEntityRoutes('arca_invoices', 'id', (inv) => ({
  tipo_comprobante: inv.tipoComprobante || '',
  punto_venta: Number(inv.puntoVenta || 1),
  numero_comprobante: Number(inv.numeroComprobante || 1),
  fecha: inv.fecha || '',
  cuit_emisor: inv.cuitEmisor || '',
  receptor: inv.razonSocialReceptor || '',
  cae: inv.cae || '',
  importe_total: Number(inv.importeTotal || 0),
}));

// Server-authoritative automatic numbering & persistence for Quotations in Supabase PostgreSQL
router.get('/quotations/next-number', async (req, res) => {
  const pool = getDbPool();
  if (!pool || isCockroachClusterDisabled()) {
    return res.status(503).json({ error: 'Conexión a Supabase PostgreSQL no disponible para cotizaciones.' });
  }
  try {
    const result = await pool.query('SELECT data FROM quotations ORDER BY numero_comprobante DESC, updated_at DESC;');
    const items = result.rows.map((r: any) => r.data).filter(Boolean);
    const maxNum = items.length > 0
      ? Math.max(...items.map((q: any) => Number(q.numeroComprobante) || 0))
      : 0;
    const nextNumeroComprobante = maxNum + 1;
    const latestPtoVta = items.length > 0 ? Number(items[0].puntoVenta || 1) : Number(req.query.puntoVenta || 1);

    return res.json({
      puntoVenta: latestPtoVta,
      nextNumeroComprobante,
      formatted: `${String(latestPtoVta).padStart(4, '0')}-${String(nextNumeroComprobante).padStart(8, '0')}`,
      quotations: items
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error consultando numeración en Supabase.' });
  }
});

router.post('/quotations/emit', async (req, res) => {
  try {
    const { quotation, isEdit } = req.body || {};
    if (!quotation) {
      return res.status(400).json({ error: 'Datos de cotización requeridos.' });
    }

    const pool = getDbPool();
    if (!pool || isCockroachClusterDisabled()) {
      return res.status(503).json({ error: 'Conexión a Supabase PostgreSQL no disponible. La cotización no fue guardada.' });
    }

    const cleanQuotation = await enforceR2OnPayload(quotation, 'uploads/quotations');
    const currentRes = await pool.query('SELECT data FROM quotations ORDER BY numero_comprobante DESC, updated_at DESC;');
    const existingItems: any[] = currentRes.rows.map((r: any) => r.data).filter(Boolean);

    const ptoVta = Number(cleanQuotation.puntoVenta || (existingItems[0]?.puntoVenta) || 1);
    let finalNumero = Number(cleanQuotation.numeroComprobante || 1);
    let finalId = String(cleanQuotation.id || '');

    if (!isEdit) {
      const maxNum = existingItems.length > 0
        ? Math.max(...existingItems.map((q: any) => Number(q.numeroComprobante) || 0))
        : 0;
      finalNumero = maxNum + 1;
      finalId = `COT-${String(ptoVta).padStart(4, '0')}-${String(finalNumero).padStart(8, '0')}`;
    } else if (!finalId) {
      finalId = `COT-${String(ptoVta).padStart(4, '0')}-${String(finalNumero).padStart(8, '0')}`;
    }

    const savedQuotation = {
      ...cleanQuotation,
      id: finalId,
      puntoVenta: ptoVta,
      numeroComprobante: finalNumero
    };

    await pool.query(
      `INSERT INTO quotations (id, punto_venta, numero_comprobante, fecha_emision, receptor, cuit_receptor, importe_total, estado, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET
         punto_venta = EXCLUDED.punto_venta,
         numero_comprobante = EXCLUDED.numero_comprobante,
         fecha_emision = EXCLUDED.fecha_emision,
         receptor = EXCLUDED.receptor,
         cuit_receptor = EXCLUDED.cuit_receptor,
         importe_total = EXCLUDED.importe_total,
         estado = EXCLUDED.estado,
         data = EXCLUDED.data,
         updated_at = CURRENT_TIMESTAMP;`,
      [
        savedQuotation.id,
        Number(savedQuotation.puntoVenta || 1),
        Number(savedQuotation.numeroComprobante || 1),
        savedQuotation.fechaEmision || '',
        savedQuotation.razonSocialReceptor || '',
        savedQuotation.cuitReceptor || '',
        Number(savedQuotation.importeTotal || 0),
        savedQuotation.estado || 'PENDIENTE',
        JSON.stringify(savedQuotation)
      ]
    );

    const updatedRes = await pool.query('SELECT data FROM quotations ORDER BY numero_comprobante DESC, updated_at DESC;');
    const allQuotations = updatedRes.rows.map((r: any) => r.data).filter(Boolean);
    invalidateCache('collection_quotations');

    return res.json({
      success: true,
      quotation: savedQuotation,
      quotations: allQuotations
    });
  } catch (err: any) {
    console.error('[Quotations Emit] Error guardando en Supabase:', err);
    return res.status(500).json({ error: err?.message || 'Error guardando cotización en la base de datos.' });
  }
});

createEntityRoutes('quotations', 'id', (q) => ({
  punto_venta: Number(q.puntoVenta || 1),
  numero_comprobante: Number(q.numeroComprobante || 1),
  fecha_emision: q.fechaEmision || '',
  receptor: q.razonSocialReceptor || '',
  cuit_receptor: q.cuitReceptor || '',
  importe_total: Number(q.importeTotal || 0),
  estado: q.estado || 'PENDIENTE',
}));

createEntityRoutes('caja_diaria', 'id', (c) => ({
  fecha: c.fecha || '',
  apertura: Number(c.apertura || 0),
  total_efectivo: Number(c.totalEfectivo || c.efectivoTeorico || 0),
}));

createEntityRoutes('proveedores', 'id', (p) => ({
  codigo: p.codigo || '',
  razon_social: p.razonSocial || '',
  cuit: p.cuit || '',
  condicion_iva: p.condicionIva || '',
  localidad: p.localidad || '',
}));

createEntityRoutes('purchase_invoices', 'id', (inv) => ({
  nro_comprobante: inv.nroComprobanteCompleto || inv.numeroComprobante || '',
  fecha_emision: inv.fechaEmision || '',
  proveedor_id: inv.proveedorId || '',
  proveedor_nombre: inv.proveedorNombre || '',
  monto_total: Number(inv.montoTotal || 0),
  estado: inv.estado || 'PENDIENTE_PAGO',
}));

createEntityRoutes('supplier_payments', 'id', (pay) => ({
  numero_orden: pay.numeroOrdenPago || '',
  fecha_pago: pay.fechaPago || '',
  proveedor_id: pay.proveedorId || '',
  monto_total: Number(pay.montoTotal || 0),
}));

createEntityRoutes('clients', 'id', (cli) => ({
  codigo: cli.codigo || '',
  cuit: cli.cuit || '',
  razon_social: cli.razonSocial || '',
  condicion_iva: cli.condicionIva || '',
}));

createEntityRoutes('arca_remitos', 'id', (rem) => ({
  punto_venta: Number(rem.puntoVenta || 8),
  numero_comprobante: Number(rem.numeroComprobante || 1),
  fecha: rem.fecha || '',
  cuit_emisor: rem.cuitEmisor || '',
  receptor: rem.razonSocialReceptor || '',
  cuit_receptor: rem.nroDocReceptor || '',
  cai: rem.cai || '',
  estado_entrega: rem.estadoEntrega || 'EMITIDO_EN_TRANSITO',
}));

createEntityRoutes('fuel_containers', 'id', (c) => ({
  codigo: c.codigo || '',
  titulo: c.titulo || '',
  proveedor_nombre: c.proveedorNombre || '',
  estado: c.estado || 'ABIERTO',
}));

createEntityRoutes('accounting_accounts', 'id', (a) => ({
  codigo: a.codigo || '',
  nombre: a.nombre || '',
  rubro: a.rubro || 'ACTIVO',
  subrubro: a.subrubro || '',
  activa: a.activa !== false,
}));

createEntityRoutes('accounting_entries', 'id', (e) => ({
  fecha: e.fecha || '',
  concepto: e.concepto || '',
  origen: e.origen || 'MANUAL',
  referencia_id: e.referenciaId || '',
  total: Number(e.totalDebe || e.total || 0),
}));

createEntityRoutes('cheques_cartera', 'id', (c) => ({
  numero_cheque: c.numeroCheque || '',
  tipo: c.tipo || 'FISICO',
  banco_emisor: c.bancoEmisor || '',
  fecha_cobro: c.fechaCobro || '',
  importe: Number(c.importe || 0),
  estado: c.estado || 'EN_CARTERA',
  cliente_nombre: c.clienteNombre || '',
  proveedor_nombre: c.proveedorNombre || '',
}));

createEntityRoutes('daily_schedules', 'id', (s) => ({
  fecha: s.fecha || '',
  estado: s.estado || 'BORRADOR',
  resumen_operativo: s.resumenOperativo || '',
}));

createEntityRoutes('whatsapp_audio_logs', 'id', (l) => ({
  fecha: l.fecha || '',
  sender_jid: l.senderJid || '',
  sender_name: l.senderName || '',
  audio_url: l.audioUrl || '',
  transcripcion: l.transcripcion || '',
  schedule_id: l.scheduleId || '',
  estado: l.estado || 'PROCESANDO',
}));

// Server-authoritative sequential numbering & persistence for Remitos Digitales ARCA (Punto de Venta 8 - Cód. 091)
router.get('/remitos/next-number', async (req, res) => {
  const pool = getDbPool();
  const ptoVta = Number(req.query.puntoVenta || 8);
  if (!pool || isCockroachClusterDisabled()) {
    return res.status(503).json({ error: 'Conexión a Supabase PostgreSQL no disponible para remitos.' });
  }

  try {
    const result = await pool.query('SELECT data FROM arca_remitos ORDER BY numero_comprobante DESC, updated_at DESC;');
    const items = result.rows.map((r: any) => r.data).filter(Boolean);
    const ptoItems = items.filter((r: any) => Number(r.puntoVenta || 8) === ptoVta);
    const maxNum = ptoItems.length > 0
      ? Math.max(...ptoItems.map((r: any) => Number(r.numeroComprobante) || 0))
      : 0;
    const nextNumeroComprobante = maxNum + 1;

    return res.json({
      puntoVenta: ptoVta,
      nextNumeroComprobante,
      formatted: `${String(ptoVta).padStart(5, '0')}-${String(nextNumeroComprobante).padStart(8, '0')}`,
      remitos: items
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error consultando numeración de remitos en Supabase.' });
  }
});

router.post('/remitos/emit', async (req, res) => {
  try {
    const { remito, isEdit } = req.body || {};
    if (!remito) {
      return res.status(400).json({ error: 'Datos del remito requeridos.' });
    }

    const pool = getDbPool();
    if (!pool || isCockroachClusterDisabled()) {
      return res.status(503).json({ error: 'Conexión a Supabase PostgreSQL no disponible. El remito no fue guardado.' });
    }

    const cleanRemito = await enforceR2OnPayload(remito, 'uploads/remitos');
    const currentRes = await pool.query('SELECT data FROM arca_remitos ORDER BY numero_comprobante DESC, updated_at DESC;');
    const existingItems: any[] = currentRes.rows.map((r: any) => r.data).filter(Boolean);

    const ptoVta = Number(cleanRemito.puntoVenta || 8);
    let finalNumero = Number(cleanRemito.numeroComprobante || 1);
    let finalId = String(cleanRemito.id || '');

    if (!isEdit) {
      const ptoItems = existingItems.filter((r: any) => Number(r.puntoVenta || 8) === ptoVta);
      const maxNum = ptoItems.length > 0
        ? Math.max(...ptoItems.map((r: any) => Number(r.numeroComprobante) || 0))
        : 0;
      finalNumero = maxNum + 1;
      finalId = `REM-${String(ptoVta).padStart(4, '0')}-${String(finalNumero).padStart(8, '0')}`;
    } else if (!finalId) {
      finalId = `REM-${String(ptoVta).padStart(4, '0')}-${String(finalNumero).padStart(8, '0')}`;
    }

    const savedRemito = {
      ...cleanRemito,
      id: finalId,
      puntoVenta: ptoVta,
      numeroComprobante: finalNumero,
      codigoAfip: cleanRemito.codigoAfip || '091',
      letra: cleanRemito.letra || 'R',
      createdAt: cleanRemito.createdAt || new Date().toISOString()
    };

    await pool.query(
      `INSERT INTO arca_remitos (id, punto_venta, numero_comprobante, fecha, cuit_emisor, receptor, cuit_receptor, cai, estado_entrega, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET
         punto_venta = EXCLUDED.punto_venta,
         numero_comprobante = EXCLUDED.numero_comprobante,
         fecha = EXCLUDED.fecha,
         cuit_emisor = EXCLUDED.cuit_emisor,
         receptor = EXCLUDED.receptor,
         cuit_receptor = EXCLUDED.cuit_receptor,
         cai = EXCLUDED.cai,
         estado_entrega = EXCLUDED.estado_entrega,
         data = EXCLUDED.data,
         updated_at = CURRENT_TIMESTAMP;`,
      [
        savedRemito.id,
        Number(savedRemito.puntoVenta || 8),
        Number(savedRemito.numeroComprobante || 1),
        savedRemito.fecha || '',
        savedRemito.cuitEmisor || '',
        savedRemito.razonSocialReceptor || '',
        savedRemito.nroDocReceptor || '',
        savedRemito.cai || '',
        savedRemito.estadoEntrega || 'EMITIDO_EN_TRANSITO',
        JSON.stringify(savedRemito)
      ]
    );

    const updatedRes = await pool.query('SELECT data FROM arca_remitos ORDER BY numero_comprobante DESC, updated_at DESC;');
    const allRemitos = updatedRes.rows.map((r: any) => r.data).filter(Boolean);
    invalidateCache('collection_arca_remitos');

    return res.json({
      success: true,
      remito: savedRemito,
      remitos: allRemitos
    });
  } catch (err: any) {
    console.error('[Remitos Emit] Error guardando remito en Supabase:', err);
    return res.status(500).json({ error: err?.message || 'Error guardando remito digital en la base de datos.' });
  }
});

// ARCA Connection Test Endpoint
router.post('/arca/test-connection', async (req, res) => {
  try {
    const { cuit, puntoVenta, puntoVentaRemito, modoProduccion, hasKey, hasCert, certificateText, privateKeyText } = req.body;
    
    if (modoProduccion && (!hasKey || !hasCert)) {
      return res.json({
        success: false,
        error: 'En Modo Producción es necesario cargar la Clave Privada (.key) y el Certificado Digital (.crt) emitido por ARCA.'
      });
    }

    if (!certificateText || !privateKeyText) {
      return res.json({
        success: false,
        error: 'Debe cargar tanto la Clave Privada (.key) como el Certificado Digital (.crt).'
      });
    }

    // 1. Verify if private key matches certificate
    const keyPairValidation = checkCertificateKeyMatch(certificateText, privateKeyText);
    if (!keyPairValidation.match) {
      return res.json({
        success: false,
        keyPairValidation,
        error: `❌ Incompatibilidad de Claves: El Certificado Digital (.crt) subido (emitido para "${keyPairValidation.subject || 'Sistema'}") no coincide con la Clave Privada (.key) configurada. Debe subir el archivo .key con el que se tramitó este certificado en AFIP, o generar un nuevo CSR y tramitarlo en AFIP.`
      });
    }

    // 2. Perform live authentication test against official AFIP WSAA
    let auth;
    try {
      auth = await getWsaaAuth(cuit || '30-71499982-2', certificateText, privateKeyText, Boolean(modoProduccion));
    } catch (wsaaErr: any) {
      return res.json({
        success: false,
        keyPairValidation,
        error: `Fallo al autenticar en ARCA WSAA: ${wsaaErr?.message || wsaaErr}`
      });
    }

    // 3. Perform live query of last authorized invoice on WSFEv1 for Punto de Venta
    // Note: Punto de Venta 8 is Factuweb/CAI for Remitos R (Cód. 091), while Pto Vta 7 (or 5) is WSFEv1 Facturación
    const rawPtoVta = Number(puntoVenta || 7);
    const ptoVtaRemito = Number(puntoVentaRemito || (rawPtoVta === 8 ? 8 : 8));
    const ptoVtaFacturacion = rawPtoVta === 8 ? 7 : rawPtoVta;

    let lastVoucherA = 0;
    let lastVoucherB = 0;
    try {
      lastVoucherA = await wsfeGetLastVoucher(auth, ptoVtaFacturacion, 1, Boolean(modoProduccion));
      lastVoucherB = await wsfeGetLastVoucher(auth, ptoVtaFacturacion, 6, Boolean(modoProduccion));
    } catch (wsfeErr: any) {
      return res.json({
        success: false,
        keyPairValidation,
        error: `Autenticación WSAA OK, pero WSFEv1 rechazó la consulta del Punto de Venta ${ptoVtaFacturacion}: ${wsfeErr?.message || wsfeErr}`
      });
    }

    res.json({
      success: true,
      message: `✅ ¡Conexión con ARCA / AFIP 100% OPERATIVA! Autenticación WSAA exitosa (${modoProduccion ? 'Producción Oficial' : 'Homologación'}). Punto de Venta #${String(ptoVtaFacturacion).padStart(4, '0')} activo para Facturas (Última Factura A: Nº ${lastVoucherA}, Última Factura B: Nº ${lastVoucherB}) y Punto de Venta #${String(ptoVtaRemito).padStart(5, '0')} conectado para Remitos Digitales R (Cód. 091). Certificado: ${keyPairValidation.subject}.`,
      cuit: cuit || '30-71499982-2',
      puntoVenta: ptoVtaFacturacion,
      puntoVentaRemito: ptoVtaRemito,
      serverTime: new Date().toISOString(),
      wsaaStatus: 'AUTORIZADO_OK',
      wsfeStatus: 'OPERATIVO',
      lastVoucherA,
      lastVoucherB,
      keyPairValidation
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: `Error verificando conexión con ARCA: ${error?.message || error}`
    });
  }
});

// ARCA Next/Last Voucher Number Lookup (FECompUltimoAutorizado)
router.post('/arca/last-voucher', async (req, res) => {
  try {
    const {
      cuitEmisor,
      puntoVenta,
      tipoComprobante,
      modoProduccion,
      privateKey,
      certificate
    } = req.body || {};

    let cuit = cuitEmisor;
    let cert = certificate;
    let key = privateKey;
    let prod = modoProduccion;

    // Validate incoming certs first; if missing or invalid/stale from client state, fall back to authoritative Supabase arca_config
    const incomingValid = Boolean(cert && key && checkCertificateKeyMatch(String(cert), String(key)).match);
    if (!incomingValid || !cuit) {
      const pool = getDbPool();
      if (pool && !isCockroachClusterDisabled()) {
        const cfgRes = await pool.query(`SELECT value FROM system_settings WHERE key = 'arca_config' LIMIT 1`);
        const settings: any = cfgRes.rows[0]?.value || {};
        cuit = settings.cuit || cuit;
        if (!incomingValid && settings.certificate && settings.privateKey) {
          cert = settings.certificate;
          key = settings.privateKey;
        }
        if (prod === undefined) prod = settings.modoProduccion ?? true;
      }
    }

    if (!cuit || !cert || !key) {
      return res.status(400).json({
        success: false,
        error: 'Faltan credenciales ARCA (.crt / .key) para consultar el último comprobante.'
      });
    }

    const ptoVta = Number(puntoVenta || 7);
    if (!Number.isFinite(ptoVta) || ptoVta <= 0) {
      return res.status(400).json({ success: false, error: 'Punto de Venta inválido.' });
    }

    const cbteTipo = mapTipoComprobanteToCode(String(tipoComprobante || 'FACTURA_B'));
    const auth = await getWsaaAuth(String(cuit), String(cert), String(key), Boolean(prod ?? true));
    const lastVoucher = await wsfeGetLastVoucher(auth, ptoVta, cbteTipo, Boolean(prod ?? true));

    return res.json({
      success: true,
      puntoVenta: ptoVta,
      cbteTipo,
      lastVoucher,
      nextVoucher: lastVoucher + 1
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error?.message || 'No se pudo consultar el último número en ARCA.'
    });
  }
});

// ARCA Authorize Invoice Endpoint (Direct communication with official ARCA WSFEv1)
router.post('/arca/authorize-invoice', async (req, res) => {
  try {
    const { 
      cuitEmisor, 
      puntoVenta, 
      tipoComprobante, 
      tipoDocReceptor, 
      nroDocReceptor, 
      razonSocialReceptor, 
      condicionIvaReceptor,
      netoGravado, 
      ivaTotal, 
      percepcionIibb,
      importeTotal, 
      items, 
      fecha,
      moneda,
      cotizacionDolar,
      modoProduccion,
      privateKey,
      certificate,
      cbteAsociado
    } = req.body;

    let effectiveCuit = cuitEmisor;
    let effectiveCert = certificate;
    let effectiveKey = privateKey;
    let effectiveProd = modoProduccion;

    const bodyPairValid = Boolean(effectiveCert && effectiveKey && checkCertificateKeyMatch(String(effectiveCert), String(effectiveKey)).match);
    if (!bodyPairValid || !effectiveCuit) {
      const pool = getDbPool();
      if (pool && !isCockroachClusterDisabled()) {
        const cfgRes = await pool.query(`SELECT value FROM system_settings WHERE key = 'arca_config' LIMIT 1`);
        const settings: any = cfgRes.rows[0]?.value || {};
        effectiveCuit = effectiveCuit || settings.cuit;
        if (!bodyPairValid && settings.certificate && settings.privateKey) {
          effectiveCert = settings.certificate;
          effectiveKey = settings.privateKey;
        }
        if (effectiveProd === undefined) effectiveProd = settings.modoProduccion ?? true;
      }
    }

    const cleanCuit = String(effectiveCuit || '').replace(/\D/g, '');
    const cleanDoc = String(nroDocReceptor || '').replace(/\D/g, '');

    // Strict validation 1: Missing digital certificate or private key
    if (!effectiveCert || !effectiveKey) {
      return res.status(400).json({
        success: false,
        error: 'ARCA Rechazó la Operación: Falta la Clave Privada (.key) o el Certificado Digital (.crt) emitido por AFIP en la pestaña de Configuración. No se puede generar la firma digital del comprobante.'
      });
    }

    // Strict validation 2: Factura A / NC A cannot be issued to Consumidor Final
    if ((tipoComprobante === 'FACTURA_A' || tipoComprobante === 'NOTA_CREDITO_A') && (condicionIvaReceptor === 'CONSUMIDOR_FINAL' || tipoDocReceptor !== 'CUIT' || cleanDoc.length !== 11)) {
      return res.status(400).json({
        success: false,
        error: 'ARCA Rechazó la Operación [Código 10015]: Los comprobantes tipo "A" solo pueden emitirse a clientes con CUIT válido (11 dígitos) y condición "Responsable Inscripto". Para Consumidor Final o DNI debe emitir tipo "B".'
      });
    }

    // Strict validation 3: Check Point of Sale
    if (!puntoVenta || puntoVenta <= 0) {
      return res.status(400).json({
        success: false,
        error: 'ARCA Rechazó la Operación [Código 10004]: El Punto de Venta es inválido o no está habilitado en AFIP para Facturación Electrónica Web Services.'
      });
    }

    // Strict validation 4: Check key-pair match
    const keyPairValidation = checkCertificateKeyMatch(effectiveCert, effectiveKey);
    if (!keyPairValidation.match) {
      return res.status(400).json({
        success: false,
        error: `ARCA Rechazó la Operación: La Clave Privada (.key) no coincide con el Certificado Digital (.crt) emitido para "${keyPairValidation.subject || 'Sistema'}". Suba el archivo .key original con el que se tramitó en AFIP.`
      });
    }

    // Authorize directly with AFIP WSFEv1
    const authResult = await wsfeAuthorizeInvoice({
      cuitEmisor: cleanCuit,
      puntoVenta: Number(puntoVenta),
      tipoComprobante,
      tipoDocReceptor,
      nroDocReceptor: cleanDoc,
      razonSocialReceptor,
      condicionIvaReceptor,
      netoGravado: Number(netoGravado || 0),
      ivaTotal: Number(ivaTotal || 0),
      percepcionIibb: Number(percepcionIibb || 0),
      importeTotal: Number(importeTotal || 0),
      items: items || [],
      fecha,
      moneda: moneda === 'USD' ? 'USD' : 'ARS',
      cotizacionDolar: cotizacionDolar !== undefined ? Number(cotizacionDolar) : undefined,
      modoProduccion: Boolean(effectiveProd ?? true),
      privateKey: effectiveKey,
      certificate: effectiveCert,
      cbteAsociado
    });

    if (authResult?.success) {
      const pool = getDbPool();
      if (pool && !isCockroachClusterDisabled()) {
        await autoUpsertClientInDb(pool, {
          cuit: cleanDoc,
          razonSocial: razonSocialReceptor,
          condicionIva: condicionIvaReceptor,
          condicionVenta: req.body?.condicionVenta,
          domicilio: req.body?.domicilioReceptor,
          fuente: 'FACTURA_ARCA',
          ultimoComprobante: `${String(puntoVenta).padStart(4, '0')}-${String(authResult.numeroComprobante || '').padStart(8, '0')}`,
        }).catch(() => {});
      }
    }

    return res.json(authResult);
  } catch (error: any) {
    console.error('Error autorizando factura en ARCA:', error);
    return res.status(400).json({
      success: false,
      error: error?.message || 'Error autorizando comprobante en ARCA / AFIP'
    });
  }
});

// ARCA Exchange Rate Lookup (Queries AFIP WSFEv1 FEParamGetCotizacion)
router.get('/arca/exchange-rate/:moneda', async (req, res) => {
  try {
    const monParam = String(req.params.moneda || 'DOL').toUpperCase();
    const monId = monParam === 'USD' || monParam === 'DOL' ? 'DOL' : monParam;
    const pool = getDbPool();
    let settings: any = null;
    if (pool && !isCockroachClusterDisabled()) {
      const cfgRes = await pool.query(`SELECT value FROM system_settings WHERE key = 'arca_config' LIMIT 1`);
      settings = cfgRes.rows[0]?.value || {};
    } else {
      settings = {};
    }

    const cuit = settings.cuit || '30-71499982-2';
    const cert = settings.certificate;
    const key = settings.privateKey;
    const modoProduccion = settings.modoProduccion ?? true;

    if (!cert || !key) {
      return res.status(400).json({ error: 'Credenciales de ARCA no configuradas para consultar cotización BNA/AFIP.' });
    }

    const auth = await getWsaaAuth(cuit, cert, key, Boolean(modoProduccion));
    const rate = await wsfeGetExchangeRate(auth, monId, Boolean(modoProduccion));
    return res.json({ success: true, ...rate });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'No se pudo consultar la cotización en AFIP' });
  }
});

// ARCA Live Voucher Audit Endpoint (Queries AFIP FECompConsultar directly)
router.get('/arca/consult-voucher/:ptoVta/:tipo/:nro', async (req, res) => {
  try {
    const { ptoVta, tipo, nro } = req.params;
    const pool = getDbPool();
    let settings: any = {};
    if (pool && !isCockroachClusterDisabled()) {
      const cfgRes = await pool.query(`SELECT value FROM system_settings WHERE key = 'arca_config' LIMIT 1`);
      settings = cfgRes.rows[0]?.value || {};
    }
    const cuit = settings.cuit || '30-71499982-2';
    const cert = settings.certificate;
    const key = settings.privateKey;
    const modoProduccion = settings.modoProduccion ?? true;

    if (!cert || !key) {
      return res.status(400).json({ error: 'Credenciales de ARCA no configuradas en el sistema' });
    }

    const auth = await getWsaaAuth(cuit, cert, key, Boolean(modoProduccion));
    const numericTipo = Number(tipo);
    const tipoCode = Number.isFinite(numericTipo) && numericTipo > 0
      ? numericTipo
      : mapTipoComprobanteToCode(String(tipo));
    const result = await wsfeConsultVoucher(auth, Number(ptoVta), tipoCode, Number(nro), Boolean(modoProduccion));

    res.json({
      success: true,
      ptoVta: Number(ptoVta),
      tipoCode,
      nro: Number(nro),
      ...result
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error consultando comprobante en AFIP' });
  }
});

// ARCA Recovery / Sync Missing Vouchers Endpoint (Queries AFIP WSFEv1 and restores missing vouchers into Supabase)
router.post('/arca/sync-missing', async (req, res) => {
  try {
    const pool = getDbPool();
    if (!pool || isCockroachClusterDisabled()) {
      return res.status(503).json({ success: false, error: 'Conexión a Supabase PostgreSQL no disponible.' });
    }

    const cfgRes = await pool.query(`SELECT value FROM system_settings WHERE key = 'arca_config' LIMIT 1`);
    const settings: any = cfgRes.rows[0]?.value || {};
    const cuit = req.body?.cuitEmisor || settings.cuit || '30-71499982-2';
    const cert = req.body?.certificate || settings.certificate;
    const key = req.body?.privateKey || settings.privateKey;
    const modoProduccion = req.body?.modoProduccion ?? settings.modoProduccion ?? true;
    const ptoVta = Number(req.body?.puntoVenta || settings.puntoVenta || 7);

    if (!cert || !key) {
      return res.status(400).json({ success: false, error: 'Credenciales de ARCA no configuradas en el sistema.' });
    }

    const auth = await getWsaaAuth(String(cuit), String(cert), String(key), Boolean(modoProduccion));

    const existingRes = await pool.query(`SELECT id, data FROM arca_invoices;`);
    const existingInvoices: any[] = existingRes.rows.map(r => r.data).filter(Boolean);
    const existingIds = new Set<string>(existingRes.rows.map(r => String(r.id)));
    const existingByKey = new Set<string>(
      existingInvoices.map(i => `${i.tipoComprobante}|${Number(i.puntoVenta)}|${Number(i.numeroComprobante)}`)
    );

    const clientsRes = await pool.query(`SELECT data FROM clients;`).catch(() => ({ rows: [] as any[] }));
    const clientsList: any[] = clientsRes.rows.map(r => r.data).filter(Boolean);

    const typesToCheck: Array<{ tipo: string; code: number; prefix: string }> = [
      { tipo: 'FACTURA_A', code: 1, prefix: '' },
      { tipo: 'FACTURA_B', code: 6, prefix: 'FB-' },
      { tipo: 'FACTURA_C', code: 11, prefix: 'FC-' },
      { tipo: 'NOTA_CREDITO_A', code: 3, prefix: 'NCA-' },
      { tipo: 'NOTA_CREDITO_B', code: 8, prefix: 'NCB-' },
      { tipo: 'NOTA_CREDITO_C', code: 13, prefix: 'NCC-' },
    ];

    const codeToTipoMap: Record<number, string> = {
      1: 'FACTURA_A',
      3: 'NOTA_CREDITO_A',
      6: 'FACTURA_B',
      8: 'NOTA_CREDITO_B',
      11: 'FACTURA_C',
      13: 'NOTA_CREDITO_C',
    };

    const recoveredInvoices: any[] = [];
    const checkedTypes: Array<{ tipo: string; lastVoucher: number; missingFound: number }> = [];

    for (const entry of typesToCheck) {
      let lastVoucher = 0;
      try {
        lastVoucher = await wsfeGetLastVoucher(auth, ptoVta, entry.code, Boolean(modoProduccion));
      } catch {
        continue;
      }

      let missingFound = 0;
      const startNro = Math.max(1, lastVoucher - 49);
      for (let nro = startNro; nro <= lastVoucher; nro++) {
        const keyStr = `${entry.tipo}|${ptoVta}|${nro}`;
        if (existingByKey.has(keyStr)) continue;

        try {
          const consulted = await wsfeConsultVoucher(auth, ptoVta, entry.code, nro, Boolean(modoProduccion));
          const p = consulted.parsed;
          if (!p?.cae || p.resultado !== 'A') continue;

          const docClean = String(p.docNro || '').replace(/\D/g, '');
          const matchedClient = docClean
            ? clientsList.find(c => String(c.cuit || '').replace(/\D/g, '') === docClean)
            : null;
          const matchedPrevInv = docClean
            ? existingInvoices.find(i => String(i.nroDocReceptor || '').replace(/\D/g, '') === docClean)
            : null;

          const razonSocialReceptor =
            matchedClient?.razonSocial ||
            matchedPrevInv?.razonSocialReceptor ||
            (docClean ? `CLIENTE CUIT ${docClean}` : 'CONSUMIDOR FINAL');
          const domicilioReceptor =
            [matchedClient?.domicilio, matchedClient?.localidad].filter(Boolean).join(' - ') ||
            matchedPrevInv?.domicilioReceptor ||
            'SAN SALVADOR DE JUJUY';
          const codigoCliente = matchedClient?.codigo || matchedPrevInv?.codigoCliente || undefined;

          const docTipoNum = Number(p.docTipo || 99);
          const tipoDocReceptor = docTipoNum === 80 ? 'CUIT' : docTipoNum === 96 ? 'DNI' : 'CONSUMIDOR_FINAL';
          const rawCondIva = String(matchedClient?.condicionIva || matchedPrevInv?.condicionIvaReceptor || '').toUpperCase();
          const condicionIvaReceptor =
            rawCondIva.includes('INSCRIPTO')
              ? 'RESPONSABLE_INSCRIPTO'
              : rawCondIva.includes('MONOTRIB')
                ? 'MONOTRIBUTO'
                : rawCondIva.includes('EXENTO')
                  ? 'EXENTO'
                  : entry.tipo === 'FACTURA_A' || entry.tipo === 'NOTA_CREDITO_A'
                    ? 'RESPONSABLE_INSCRIPTO'
                    : 'CONSUMIDOR_FINAL';

          const paddedPto = String(ptoVta).padStart(4, '0');
          const paddedNum = String(nro).padStart(8, '0');
          let id = `ARCA-${entry.prefix}${paddedPto}-${paddedNum}`;
          if (existingIds.has(id)) {
            id = `${id}-${Date.now().toString().slice(-4)}`;
          }

          const impNeto = Number(p.impNeto || 0);
          const impIva = Number(p.impIva || 0);
          const impTrib = Number(p.impTrib || 0);
          const impTotal = Number(p.importeTotal || impNeto + impIva + impTrib);
          const moneda = p.monId === 'DOL' ? 'USD' : 'ARS';
          const fecha = p.cbteFch || new Date().toISOString().slice(0, 10);
          const vencimientoCae = p.fchVto || fecha;

          const qrObj = {
            ver: 1,
            fecha,
            cuit: Number(String(cuit).replace(/\D/g, '')),
            ptoVta,
            tipoCmp: entry.code,
            nroCmp: nro,
            importe: impTotal,
            moneda: p.monId || 'PES',
            ctz: Number(p.monCotiz || 1),
            tipoDocRec: docTipoNum,
            nroDocRec: Number(docClean || 0),
            tipoCodAut: 'E',
            codAut: Number(p.cae) || 0,
          };
          const qrData = `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(qrObj)).toString('base64')}`;

          const cbteAsociadoInfo = p.cbteAsoc
            ? {
                tipoComprobante: codeToTipoMap[p.cbteAsoc.tipo] || 'FACTURA_B',
                puntoVenta: p.cbteAsoc.puntoVenta,
                numeroComprobante: p.cbteAsoc.numero,
                fecha,
              }
            : undefined;

          const isCreditNote = entry.tipo.startsWith('NOTA_CREDITO');
          const recovered = {
            id,
            tipoComprobante: entry.tipo,
            puntoVenta: ptoVta,
            numeroComprobante: nro,
            fecha,
            cuitEmisor: String(cuit),
            razonSocialEmisor: settings.razonSocial || 'EL HORNOCAL S.R.L.',
            condicionIvaEmisor: settings.condicionIva || 'RESPONSABLE_INSCRIPTO',
            tipoDocReceptor,
            nroDocReceptor: docClean || '0',
            razonSocialReceptor,
            condicionIvaReceptor,
            domicilioReceptor,
            codigoCliente,
            condicionVenta: matchedClient?.condicionVenta || 'CONTADO',
            moneda,
            cotizacionDolar: moneda === 'USD' ? Number(p.monCotiz || 1) : undefined,
            items: [
              {
                codigo: '00000001',
                descripcion: isCreditNote
                  ? 'NOTA DE CRÉDITO RECUPERADA DESDE ARCA (WSFEv1)'
                  : 'SERVICIOS / ALQUILERES RECUPERADOS DESDE ARCA (WSFEv1)',
                cantidad: 1,
                unidadMedida: 'UNI',
                precioUnitario: impNeto > 0 ? impNeto : impTotal,
                bonificacionPorcentaje: 0,
                subtotal: impNeto > 0 ? impNeto : impTotal,
                alicuotaIva: impNeto > 0 && impIva > 0 ? Math.round((impIva / impNeto) * 1000) / 10 : 0,
              },
            ],
            netoGravado: impNeto,
            ivaTotal: impIva,
            bonificacionTotal: 0,
            percepcionIibb: impTrib,
            importeTotal: impTotal,
            cae: p.cae,
            vencimientoCae,
            resultado: 'APROBADO',
            observacionesArca: p.observaciones
              ? `Recuperado desde ARCA WSFEv1 · ${p.observaciones}`
              : 'Comprobante recuperado oficialmente desde ARCA (WSFEv1)',
            qrData,
            cbteAsociadoInfo,
            estadoCobro: 'PENDIENTE_PAGO',
            montoCobrado: 0,
            saldoPendiente: impTotal,
            createdAt: new Date().toISOString(),
          };

          await pool.query(
            `INSERT INTO arca_invoices (id, tipo_comprobante, punto_venta, numero_comprobante, fecha, cuit_emisor, receptor, cae, importe_total, data, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             ON CONFLICT (id) DO UPDATE SET
               tipo_comprobante = EXCLUDED.tipo_comprobante,
               punto_venta = EXCLUDED.punto_venta,
               numero_comprobante = EXCLUDED.numero_comprobante,
               fecha = EXCLUDED.fecha,
               cuit_emisor = EXCLUDED.cuit_emisor,
               receptor = EXCLUDED.receptor,
               cae = EXCLUDED.cae,
               importe_total = EXCLUDED.importe_total,
               data = EXCLUDED.data,
               updated_at = NOW();`,
            [
              recovered.id,
              recovered.tipoComprobante,
              recovered.puntoVenta,
              recovered.numeroComprobante,
              recovered.fecha,
              recovered.cuitEmisor,
              recovered.razonSocialReceptor,
              recovered.cae,
              recovered.importeTotal,
              JSON.stringify(recovered),
            ]
          );

          existingIds.add(recovered.id);
          existingByKey.add(keyStr);
          recoveredInvoices.push(recovered);
          missingFound++;
        } catch (innerErr: any) {
          console.warn(`[ARCA Sync] Error consultando ${entry.tipo} ${ptoVta}-${nro}:`, innerErr?.message);
        }
      }

      checkedTypes.push({ tipo: entry.tipo, lastVoucher, missingFound });
    }

    if (recoveredInvoices.length > 0) {
      invalidateCache('table_arca_invoices');
      invalidateCache('collection_arca_invoices');
    }

    return res.json({
      success: true,
      puntoVenta: ptoVta,
      recoveredCount: recoveredInvoices.length,
      recoveredInvoices,
      checkedTypes,
    });
  } catch (err: any) {
    console.error('[ARCA Sync] Error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Error sincronizando comprobantes desde ARCA' });
  }
});

// ARCA CSR & Private Key Generation Endpoint (Automates Certificate Request creation)
router.post('/arca/generate-csr', (req, res) => {
  try {
    const { cuit, razonSocial, alias = 'lahormiga' } = req.body;
    const cleanCuit = String(cuit || '').replace(/\D/g, '');
    
    if (!cleanCuit || cleanCuit.length !== 11) {
      return res.status(400).json({ error: 'Debe ingresar un CUIT válido de 11 dígitos.' });
    }

    const org = String(razonSocial || 'LA HORMIGA SRL').replace(/[/\\=]/g, ' ').trim();
    const cleanAlias = String(alias || 'lahormiga').replace(/[/\\=]/g, ' ').trim();

    // 1. Generate 2048-bit RSA Private Key in pure JS (no external openssl binary required)
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // 2. Generate CSR (Certificate Signing Request) formatted for ARCA / AFIP
    // Subject format required by AFIP: /C=AR/O=RAZON_SOCIAL/CN=ALIAS/serialNumber=CUIT CUIT_NUM
    const csrObj = forge.pki.createCertificationRequest();
    csrObj.publicKey = keys.publicKey;
    csrObj.setSubject([
      { name: 'countryName', value: 'AR' },
      { name: 'organizationName', value: org },
      { name: 'commonName', value: cleanAlias },
      { type: '2.5.4.5', value: `CUIT ${cleanCuit}` },
    ]);
    csrObj.sign(keys.privateKey, forge.md.sha256.create());

    const privateKey = forge.pki.privateKeyToPem(keys.privateKey);
    const csr = forge.pki.certificationRequestToPem(csrObj);

    res.json({
      success: true,
      message: 'Clave privada y Solicitud CSR generadas con éxito según el estándar de ARCA.',
      privateKey,
      csr,
      cuit: cleanCuit,
      razonSocial: org,
      fileNameKey: `lahormiga_${cleanCuit}.key`,
      fileNameCsr: `solicitud_arca_${cleanCuit}.csr`
    });
  } catch (error: any) {
    console.error('Error generando CSR:', error);
    res.status(500).json({ error: error.message || 'Error al generar clave privada y solicitud CSR' });
  }
});

// Helper: Fetch JSON over HTTPS ignoring government root CA chain issues (needed for api.bcra.gob.ar)
function fetchHttpsJson(url: string, timeoutMs: number = 4500): Promise<any> {
  return new Promise((resolve) => {
    try {
      const req = https.get(
        url,
        {
          rejectUnauthorized: false,
          timeout: timeoutMs,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          }
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(body));
              } catch {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

// Helper: Compute valid 11-digit Argentine CUIT/CUIL candidates from a 7 or 8 digit DNI using Modulo-11
function buildCuitCandidatesFromDni(dniRaw: string): string[] {
  const dni = dniRaw.padStart(8, '0');
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const candidates: string[] = [];

  for (const prefix of ['20', '27', '23', '24']) {
    const base = prefix + dni;
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += Number(base[i]) * weights[i];
    }
    const mod = 11 - (sum % 11);
    if (mod === 11) {
      candidates.push(`${base}0`);
    } else if (mod === 10) {
      // Prefix 23 uses verifier 9 (male) or 4 (female)
      if (prefix === '23') {
        candidates.push(`${base}9`, `${base}4`);
      }
    } else {
      candidates.push(`${base}${mod}`);
    }
  }
  return Array.from(new Set(candidates));
}

// ARCA Padrón CUIT Lookup (Autofills Razón Social, Condición IVA, Domicilio, Localidad y Teléfono)
router.get('/arca/padron/:cuit', async (req, res) => {
  try {
    const rawInput = String(req.params.cuit || '').replace(/\D/g, '');
    if (rawInput.length < 7 || rawInput.length > 11) {
      return res.status(400).json({ error: 'Ingrese un CUIT de 11 dígitos o un DNI de 7 u 8 dígitos.' });
    }

    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const cachedPadron = !forceRefresh ? getFromCache(`padron_${rawInput}`) : null;
    if (cachedPadron) {
      return res.json(cachedPadron);
    }

    const cuitCandidates = rawInput.length === 11
      ? [rawInput]
      : buildCuitCandidatesFromDni(rawInput);

    let resolvedCuit = cuitCandidates[0] || rawInput;
    let razonSocial = '';
    let domicilio = '';
    let localidad = '';
    let zona = '';
    let telefono = '';
    let condicionIva = '';
    let fuente = '';

    // 1. Search in Supabase PostgreSQL historical records (Quotations, ARCA Invoices, Proveedores, Obras, Rentals)
    const pool = getDbPool();
    if (pool && !isCockroachClusterDisabled()) {
      try {
        const docSearchTargets = Array.from(
          new Set([
            rawInput,
            ...(rawInput.length <= 8 ? [rawInput.padStart(8, '0')] : []),
            ...cuitCandidates
          ])
        );
        const dbQueries = await Promise.allSettled([
          pool.query(`SELECT data FROM quotations WHERE REGEXP_REPLACE(COALESCE(data->>'cuitReceptor', ''), '[^0-9]', '', 'g') = ANY($1::text[]) ORDER BY updated_at DESC LIMIT 5`, [docSearchTargets]),
          pool.query(`SELECT data FROM arca_invoices WHERE REGEXP_REPLACE(COALESCE(data->>'nroDocReceptor', ''), '[^0-9]', '', 'g') = ANY($1::text[]) ORDER BY updated_at DESC LIMIT 5`, [docSearchTargets]),
          pool.query(`SELECT data FROM proveedores WHERE REGEXP_REPLACE(COALESCE(data->>'cuit', ''), '[^0-9]', '', 'g') = ANY($1::text[]) ORDER BY updated_at DESC LIMIT 5`, [docSearchTargets]),
          pool.query(`SELECT data FROM obras WHERE REGEXP_REPLACE(COALESCE(data->>'cuitCliente', ''), '[^0-9]', '', 'g') = ANY($1::text[]) ORDER BY updated_at DESC LIMIT 5`, [docSearchTargets]),
          pool.query(`SELECT data FROM rentals WHERE REGEXP_REPLACE(COALESCE(data->>'clienteDocumento', ''), '[^0-9]', '', 'g') = ANY($1::text[]) ORDER BY updated_at DESC LIMIT 5`, [docSearchTargets])
        ]);

        for (const qRes of dbQueries) {
          if (qRes.status === 'fulfilled' && qRes.value.rows.length > 0) {
            for (const row of qRes.value.rows) {
              const d = row.data || {};
              razonSocial = razonSocial || d.razonSocialReceptor || d.razonSocial || d.cliente || d.clienteNombre || '';
              domicilio =
                domicilio ||
                d.domicilioReceptor ||
                d.domicilio ||
                d.domicilioFiscal ||
                d.direccionObra ||
                d.direccion ||
                d.ubicacion ||
                d.obraUbicacion ||
                '';
              localidad = localidad || d.localidadReceptor || d.localidadObra || d.localidad || '';
              zona = zona || d.zonaReceptor || d.zonaObra || d.zona || '';
              telefono = telefono || d.telefonoReceptor || d.telefono || d.telefonoContacto || d.clienteTelefono || '';
              condicionIva = condicionIva || d.condicionIvaReceptor || d.condicionIva || d.clienteCondicionIva || '';
              const docFound = String(d.cuitReceptor || d.nroDocReceptor || d.cuit || d.cuitCliente || d.clienteDocumento || '').replace(/\D/g, '');
              if (docFound.length === 11) {
                resolvedCuit = docFound;
              }
              if (razonSocial && !fuente) {
                fuente = 'BASE_DE_DATOS';
              }
            }
          }
        }
      } catch {
        // Ignore DB lookup errors and continue to external Padrón
      }
    }

    // 2. Official ARCA / AFIP Padrón WebServices (ws_sr_constancia_inscripcion A5 / ws_sr_padron_a13)
    // Provides official Razón Social, Domicilio Fiscal, Localidad, Código Postal & Condición IVA
    let padronNotDelegated = false;
    let padronAuthError = '';
    if (!razonSocial || !domicilio) {
      try {
        let arcaCfg: any = null;
        if (pool && !isCockroachClusterDisabled()) {
          const cfgRes = await pool.query(`SELECT value FROM system_settings WHERE key = 'arca_config' LIMIT 1`);
          arcaCfg = cfgRes.rows[0]?.value || null;
        }

        if (arcaCfg?.certificate && arcaCfg?.privateKey) {
          const repCuit = arcaCfg.cuit || '30-71499982-2';
          const isProd = arcaCfg.modoProduccion ?? true;
          for (const candidateCuit of cuitCandidates) {
            const padronRes = await wsPadronConsultCuit(
              candidateCuit,
              repCuit,
              arcaCfg.certificate,
              arcaCfg.privateKey,
              Boolean(isProd),
              req.query.recheck_afip === '1'
            );
            if (padronRes.success && padronRes.razonSocial) {
              razonSocial = razonSocial || padronRes.razonSocial;
              domicilio = domicilio || padronRes.domicilio || '';
              localidad = localidad || padronRes.localidad || '';
              zona = zona || padronRes.zona || '';
              condicionIva = condicionIva || padronRes.condicionIva || '';
              resolvedCuit = padronRes.cuit || candidateCuit;
              fuente = padronRes.fuente || 'PADRON_ARCA_OFICIAL';
              break;
            }
            if (padronRes.notDelegated) {
              padronNotDelegated = true;
              padronAuthError = padronRes.error || '';
              break;
            }
          }
        }
      } catch {
        // Continue to public BCRA fallback
      }
    }

    // 3. Official BCRA Padrón API (Central de Deudores / Históricas - queried in parallel for all DNI->CUIT candidates)
    if (!razonSocial) {
      const bcraResults = await Promise.all(
        cuitCandidates.map(async (candidateCuit) => {
          const [deudasData, histData] = await Promise.all([
            fetchHttpsJson(`https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/${candidateCuit}`),
            fetchHttpsJson(`https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/Historicas/${candidateCuit}`)
          ]);
          const denom = deudasData?.results?.denominacion || histData?.results?.denominacion;
          return {
            candidateCuit,
            denom:
              denom && String(denom).trim().length > 0
                ? String(denom).replace(/\s+/g, ' ').trim().toUpperCase()
                : ''
          };
        })
      );
      const firstBcraMatch = bcraResults.find((r) => Boolean(r.denom));
      if (firstBcraMatch) {
        razonSocial = firstBcraMatch.denom;
        resolvedCuit = firstBcraMatch.candidateCuit;
        fuente = fuente || 'PADRON_OFICIAL_BCRA_ARCA';
      }
    }

    // 4. Known common companies fallback
    const knownDatabase: Record<string, { razonSocial: string; condicionIva: string; domicilio: string; localidad?: string }> = {
      '30714999822': { razonSocial: 'EL HORNOCAL SRL', condicionIva: 'RESPONSABLE_INSCRIPTO', domicilio: 'Salta, Argentina', localidad: 'SALTA' },
      '23282502429': { razonSocial: 'ZARZOSO BERNIS FRANCISCO ALBERTO', condicionIva: 'RESPONSABLE_INSCRIPTO', domicilio: 'Zenta 1271, Salta', localidad: 'SALTA' },
      '20131219750': { razonSocial: 'ZARIF MARCELO HORACIO', condicionIva: 'RESPONSABLE_INSCRIPTO', domicilio: 'San Salvador de Jujuy, Argentina', localidad: 'SAN SALVADOR DE JUJUY' },
      '30716294519': { razonSocial: 'LA HORMIGA SERVICIOS VIALES SRL', condicionIva: 'RESPONSABLE_INSCRIPTO', domicilio: 'Ruta Nac. 9 Km 1148, Salta', localidad: 'SALTA' },
      '20161836053': { razonSocial: 'MONTALVO MIGUEL ANGEL', condicionIva: 'CONSUMIDOR_FINAL', domicilio: '', localidad: 'SAN SALVADOR DE JUJUY' }
    };

    for (const candidateCuit of cuitCandidates) {
      if (knownDatabase[candidateCuit]) {
        const k = knownDatabase[candidateCuit];
        razonSocial = razonSocial || k.razonSocial;
        domicilio = domicilio || k.domicilio;
        localidad = localidad || k.localidad || '';
        condicionIva = condicionIva || k.condicionIva;
        resolvedCuit = candidateCuit;
        fuente = fuente || 'PADRON_VERIFICADO';
        break;
      }
    }

    // Determine default IVA condition by CUIT prefix (30/33/34 = Persona Jurídica = Responsable Inscripto)
    const prefix = resolvedCuit.slice(0, 2);
    const isCompany = prefix === '30' || prefix === '33' || prefix === '34';
    const rawIvaNorm = String(condicionIva || '').trim().toUpperCase();
    const normalizedCondicionIva = !rawIvaNorm
      ? ''
      : rawIvaNorm.includes('INSCRIPTO')
        ? 'RESPONSABLE_INSCRIPTO'
        : rawIvaNorm.includes('MONOTRIB')
          ? 'MONOTRIBUTO'
          : rawIvaNorm.includes('EXENTO')
            ? 'EXENTO'
            : rawIvaNorm.includes('CONSUMIDOR')
              ? 'CONSUMIDOR_FINAL'
              : condicionIva;
    const finalCondicionIva = normalizedCondicionIva || (isCompany ? 'RESPONSABLE_INSCRIPTO' : 'CONSUMIDOR_FINAL');

    if (razonSocial) {
      const addressUnavailableReason = !domicilio
        ? padronNotDelegated
          ? 'El BCRA solo informa Razón Social. Para traer el domicilio fiscal automático desde AFIP, habilitá el servicio "ws_sr_constancia_inscripcion" (o "ws_sr_padron_a13") para tu certificado en ARCA > Administrador de Relaciones.'
          : padronAuthError
            ? `No se pudo obtener domicilio desde AFIP (${padronAuthError}).`
            : 'El padrón público BCRA no provee dirección postal para clientes nuevos.'
        : '';

      const payload = {
        found: true,
        cuit: resolvedCuit,
        razonSocial,
        domicilio,
        localidad,
        zona,
        telefono,
        condicionIva: finalCondicionIva,
        tipoDoc: 'CUIT',
        fuente,
        ...(addressUnavailableReason ? { addressUnavailableReason } : {})
      };
      if (domicilio) {
        setInCache(`padron_${rawInput}`, payload);
        setInCache(`padron_${resolvedCuit}`, payload);
      }
      return res.json(payload);
    }

    return res.json({
      found: false,
      cuit: resolvedCuit,
      tipoDoc: 'CUIT',
      condicionIva: finalCondicionIva
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error consultando padrón de CUIT' });
  }
});

// Automatic Client Upsert Helper (invoked when invoicing, creating rentals, or registering clients)
async function autoUpsertClientInDb(
  pool: any,
  entry: {
    id?: string;
    codigo?: string;
    cuit?: string;
    razonSocial?: string;
    condicionIva?: string;
    condicionVenta?: string;
    domicilio?: string;
    localidad?: string;
    zona?: string;
    telefono?: string;
    email?: string;
    notas?: string;
    fuente?: string;
    ultimoComprobante?: string;
  }
) {
  const rs = String(entry.razonSocial || '').trim().toUpperCase();
  const cuitClean = String(entry.cuit || '').replace(/\D/g, '');
  if (!rs && !cuitClean) return null;
  if ((rs === 'CONSUMIDOR FINAL' || rs === 'CONSUMIDOR FINAL.') && cuitClean.length < 7) return null;

  try {
    let existingRow: any = null;
    if (entry.id) {
      const r = await pool.query('SELECT id, data FROM clients WHERE id = $1 LIMIT 1;', [entry.id]);
      existingRow = r.rows[0] || null;
    }
    if (!existingRow && cuitClean.length >= 7) {
      const r = await pool.query(
        "SELECT id, data FROM clients WHERE REGEXP_REPLACE(COALESCE(cuit, ''), '[^0-9]', '', 'g') = $1 LIMIT 1;",
        [cuitClean]
      );
      existingRow = r.rows[0] || null;
    }
    if (!existingRow && rs) {
      const r = await pool.query(
        'SELECT id, data FROM clients WHERE UPPER(TRIM(COALESCE(razon_social, \'\'))) = $1 LIMIT 1;',
        [rs]
      );
      existingRow = r.rows[0] || null;
    }

    const existing = existingRow?.data || {};
    let codigo = String(entry.codigo || existing.codigo || '').trim().toUpperCase();
    if (!codigo) {
      const maxRes = await pool.query(`
        SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(COALESCE(codigo, ''), '[^0-9]', '', 'g'), '')::int), 0) AS max_num
        FROM clients;
      `);
      const nextNum = Number(maxRes.rows[0]?.max_num || 0) + 1;
      codigo = `CLI-${String(nextNum).padStart(4, '0')}`;
    }

    const deterministicId =
      existingRow?.id ||
      entry.id ||
      (cuitClean.length >= 7 ? `CLI-${cuitClean}` : `CLI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

    const prefix = cuitClean.slice(0, 2);
    const defaultIva = prefix === '30' || prefix === '33' || prefix === '34' ? 'RESPONSABLE_INSCRIPTO' : 'CONSUMIDOR_FINAL';
    const now = new Date().toISOString();

    const record = {
      id: deterministicId,
      codigo,
      cuit: cuitClean || existing.cuit || '',
      razonSocial: rs || existing.razonSocial || '',
      condicionIva: entry.condicionIva || existing.condicionIva || defaultIva,
      condicionVenta: entry.condicionVenta || existing.condicionVenta || 'CONTADO / TRANSFERENCIA',
      domicilio: entry.domicilio || existing.domicilio || '',
      localidad: entry.localidad || existing.localidad || 'SAN SALVADOR DE JUJUY',
      zona: entry.zona || existing.zona || '',
      telefono: entry.telefono || existing.telefono || '',
      email: entry.email || existing.email || '',
      notas: entry.notas !== undefined ? entry.notas : (existing.notas || ''),
      fuente: existing.fuente || entry.fuente || 'CLIENTES',
      ultimoComprobante: entry.ultimoComprobante || existing.ultimoComprobante || '',
      createdAt: existing.createdAt || now,
      updatedAt: now,
    };

    await pool.query(
      `INSERT INTO clients (id, codigo, cuit, razon_social, condicion_iva, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         codigo = EXCLUDED.codigo,
         cuit = EXCLUDED.cuit,
         razon_social = EXCLUDED.razon_social,
         condicion_iva = EXCLUDED.condicion_iva,
         data = EXCLUDED.data,
         updated_at = NOW();`,
      [record.id, record.codigo, record.cuit, record.razonSocial, record.condicionIva, JSON.stringify(record)]
    );

    return record;
  } catch (err) {
    console.warn('[autoUpsertClientInDb] Error:', err);
    return null;
  }
}

// Unified Client / Razón Social Directory & Search in Supabase PostgreSQL
router.get('/clients/search', async (req, res) => {
  try {
    const qRaw = String(req.query.q || '').trim().toUpperCase();
    const qDigits = qRaw.replace(/\D/g, '');
    const pool = getDbPool();

    const clientMap = new Map<string, {
      id?: string;
      codigo?: string;
      cuit: string;
      razonSocial: string;
      condicionIva: string;
      condicionVenta: string;
      domicilio: string;
      localidad: string;
      zona: string;
      telefono: string;
      email: string;
      notas?: string;
      fuente: string;
      savedInClientsTable?: boolean;
      ultimoComprobante?: string;
    }>();

    const upsertClient = (entry: {
      id?: string;
      codigo?: string;
      cuit?: string;
      razonSocial?: string;
      condicionIva?: string;
      condicionVenta?: string;
      domicilio?: string;
      localidad?: string;
      zona?: string;
      telefono?: string;
      email?: string;
      notas?: string;
      fuente: string;
      savedInClientsTable?: boolean;
      ultimoComprobante?: string;
    }) => {
      const rs = String(entry.razonSocial || '').trim().toUpperCase();
      const cuitClean = String(entry.cuit || '').replace(/\D/g, '');
      if (!rs && !cuitClean) return;
      if (rs === 'CONSUMIDOR FINAL' && !cuitClean) return;

      const key = cuitClean.length >= 7 ? `CUIT:${cuitClean}` : `RS:${rs}`;
      const existing = clientMap.get(key);
      const prefix = cuitClean.slice(0, 2);
      const defaultIva = (prefix === '30' || prefix === '33' || prefix === '34') ? 'RESPONSABLE_INSCRIPTO' : 'CONSUMIDOR_FINAL';

      clientMap.set(key, {
        id: existing?.id || entry.id,
        codigo: existing?.codigo || entry.codigo,
        cuit: cuitClean || existing?.cuit || '',
        razonSocial: existing?.savedInClientsTable ? (existing.razonSocial || rs) : (rs || existing?.razonSocial || ''),
        condicionIva: existing?.savedInClientsTable ? (existing.condicionIva || entry.condicionIva || defaultIva) : (entry.condicionIva || existing?.condicionIva || defaultIva),
        condicionVenta: existing?.savedInClientsTable ? (existing.condicionVenta || entry.condicionVenta || 'CONTADO / TRANSFERENCIA') : (entry.condicionVenta || existing?.condicionVenta || 'CONTADO / TRANSFERENCIA'),
        domicilio: existing?.savedInClientsTable ? (existing.domicilio || entry.domicilio || '') : (entry.domicilio || existing?.domicilio || ''),
        localidad: existing?.savedInClientsTable ? (existing.localidad || entry.localidad || 'SAN SALVADOR DE JUJUY') : (entry.localidad || existing?.localidad || 'SAN SALVADOR DE JUJUY'),
        zona: existing?.savedInClientsTable ? (existing.zona || entry.zona || '') : (entry.zona || existing?.zona || ''),
        telefono: existing?.savedInClientsTable ? (existing.telefono || entry.telefono || '') : (entry.telefono || existing?.telefono || ''),
        email: existing?.savedInClientsTable ? (existing.email || entry.email || '') : (entry.email || existing?.email || ''),
        notas: existing?.notas || entry.notas,
        fuente: existing?.fuente || entry.fuente,
        savedInClientsTable: Boolean(existing?.savedInClientsTable || entry.savedInClientsTable),
        ultimoComprobante: entry.ultimoComprobante || existing?.ultimoComprobante
      });
    };

    if (pool && !isCockroachClusterDisabled()) {
      const [clientsRes, quotRes, arcaRes, rentRes, provRes, obraRes] = await Promise.allSettled([
        pool.query('SELECT data FROM clients ORDER BY updated_at DESC LIMIT 500;'),
        pool.query('SELECT data FROM quotations ORDER BY updated_at DESC LIMIT 200;'),
        pool.query('SELECT data FROM arca_invoices ORDER BY updated_at DESC LIMIT 200;'),
        pool.query('SELECT data FROM rentals ORDER BY updated_at DESC LIMIT 200;'),
        pool.query('SELECT data FROM proveedores ORDER BY updated_at DESC LIMIT 200;'),
        pool.query('SELECT data FROM obras ORDER BY updated_at DESC LIMIT 200;')
      ]);

      if (clientsRes.status === 'fulfilled') {
        for (const r of clientsRes.value.rows) {
          const d = r.data || {};
          upsertClient({
            id: d.id,
            codigo: d.codigo,
            cuit: d.cuit,
            razonSocial: d.razonSocial,
            condicionIva: d.condicionIva,
            condicionVenta: d.condicionVenta,
            domicilio: d.domicilio,
            localidad: d.localidad,
            zona: d.zona,
            telefono: d.telefono,
            email: d.email,
            notas: d.notas,
            fuente: d.fuente || 'CLIENTES',
            savedInClientsTable: true,
            ultimoComprobante: d.ultimoComprobante
          });
        }
      }

      if (quotRes.status === 'fulfilled') {
        for (const r of quotRes.value.rows) {
          const d = r.data || {};
          upsertClient({
            cuit: d.cuitReceptor,
            razonSocial: d.razonSocialReceptor,
            condicionVenta: d.condicionVenta,
            domicilio: d.domicilioReceptor,
            localidad: d.localidadReceptor,
            zona: d.zonaReceptor,
            telefono: d.telefonoReceptor,
            fuente: 'COTIZACION',
            ultimoComprobante: d.id
          });
        }
      }
      if (arcaRes.status === 'fulfilled') {
        for (const r of arcaRes.value.rows) {
          const d = r.data || {};
          upsertClient({
            cuit: d.nroDocReceptor,
            razonSocial: d.razonSocialReceptor,
            condicionIva: d.condicionIvaReceptor,
            condicionVenta: d.condicionVenta,
            domicilio: d.domicilioReceptor,
            fuente: 'FACTURA_ARCA',
            ultimoComprobante: d.id
          });
        }
      }
      if (rentRes.status === 'fulfilled') {
        for (const r of rentRes.value.rows) {
          const d = r.data || {};
          upsertClient({
            cuit: d.clienteDocumento,
            razonSocial: d.clienteNombre,
            condicionIva: d.clienteCondicionIva,
            condicionVenta: d.condicionVenta,
            domicilio: d.direccionObra,
            localidad: d.localidadObra,
            zona: d.zonaObra,
            telefono: d.clienteTelefono,
            email: d.clienteEmail,
            fuente: 'ALQUILER',
            ultimoComprobante: d.numeroContrato || d.id
          });
        }
      }
      if (provRes.status === 'fulfilled') {
        for (const r of provRes.value.rows) {
          const d = r.data || {};
          upsertClient({
            cuit: d.cuit,
            razonSocial: d.razonSocial,
            condicionIva: d.condicionIva,
            domicilio: d.direccion,
            localidad: d.localidad,
            telefono: d.telefono,
            email: d.email,
            fuente: 'AGENDA_EMPRESAS'
          });
        }
      }
      if (obraRes.status === 'fulfilled') {
        for (const r of obraRes.value.rows) {
          const d = r.data || {};
          upsertClient({
            cuit: d.cuitCliente,
            razonSocial: d.pertenece || d.nombreObra,
            domicilio: d.ubicacion,
            fuente: 'OBRA'
          });
        }
      }
    }

    let clients = Array.from(clientMap.values());
    if (qRaw) {
      clients = clients.filter(c =>
        c.razonSocial.includes(qRaw) ||
        (c.codigo || '').toUpperCase().includes(qRaw) ||
        (qDigits.length >= 2 && c.cuit.includes(qDigits)) ||
        c.domicilio.toUpperCase().includes(qRaw) ||
        c.localidad.toUpperCase().includes(qRaw)
      );
    }

    res.json({ clients });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error buscando clientes en la base de datos', clients: [] });
  }
});

// Explicit manual Create / Update client in Supabase (auto-assigns CLI-XXXX if codigo is omitted)
router.post('/clients/upsert', async (req, res) => {
  try {
    const pool = getDbPool();
    if (!pool || isCockroachClusterDisabled()) {
      return res.status(503).json({
        success: false,
        error: 'Conexión a Supabase PostgreSQL no disponible para guardar el cliente.',
      });
    }

    const body = req.body || {};
    const rs = String(body.razonSocial || '').trim();
    const cuitClean = String(body.cuit || '').replace(/\D/g, '');
    if (!rs && !cuitClean) {
      return res.status(400).json({
        success: false,
        error: 'Ingresá al menos la Razón Social o el CUIT / DNI del cliente.',
      });
    }

    const saved = await autoUpsertClientInDb(pool, {
      id: body.id,
      codigo: body.codigo,
      cuit: body.cuit,
      razonSocial: body.razonSocial,
      condicionIva: body.condicionIva,
      condicionVenta: body.condicionVenta,
      domicilio: body.domicilio,
      localidad: body.localidad,
      zona: body.zona,
      telefono: body.telefono,
      email: body.email,
      notas: body.notas,
      fuente: body.fuente || 'ALTA_MANUAL',
      ultimoComprobante: body.ultimoComprobante,
    });

    if (!saved) {
      return res.status(400).json({
        success: false,
        error: 'No se pudo registrar el cliente (verificá que no sea Consumidor Final anónimo sin DNI/CUIT).',
      });
    }

    invalidateCache('table_clients');
    invalidateCache('collection_clients');
    return res.json({ success: true, client: saved });
  } catch (error: any) {
    console.error('[POST /api/clients/upsert] Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Error guardando cliente en Supabase.',
    });
  }
});

// Sync & automatically register all clients who have Rental Contracts and/or ARCA Invoices in Supabase
router.post('/clients/sync-from-history', async (_req, res) => {
  try {
    const pool = getDbPool();
    if (!pool || isCockroachClusterDisabled()) {
      return res.status(503).json({
        success: false,
        error: 'Conexión a Supabase PostgreSQL no disponible.',
      });
    }

    const [clientsRes, rentalsRes, arcaRes] = await Promise.all([
      pool.query('SELECT id, cuit, razon_social, data FROM clients;'),
      pool.query('SELECT data FROM rentals ORDER BY updated_at DESC;'),
      pool.query('SELECT data FROM arca_invoices ORDER BY updated_at DESC;'),
    ]);

    const existingCuits = new Set<string>();
    const existingNames = new Set<string>();
    const existingDataByKey = new Map<string, any>();

    for (const row of clientsRes.rows) {
      const d = row.data || {};
      const c = String(row.cuit || d.cuit || '').replace(/\D/g, '');
      const n = String(row.razon_social || d.razonSocial || '').trim().toUpperCase();
      if (c.length >= 7) {
        existingCuits.add(c);
        existingDataByKey.set(`CUIT:${c}`, d);
      }
      if (n) {
        existingNames.add(n);
        existingDataByKey.set(`RS:${n}`, d);
      }
    }

    interface CandidateClient {
      cuit: string;
      razonSocial: string;
      condicionIva?: string;
      condicionVenta?: string;
      domicilio?: string;
      localidad?: string;
      zona?: string;
      telefono?: string;
      email?: string;
      fuente: string;
      ultimoComprobante?: string;
      hasContrato: boolean;
      hasFactura: boolean;
    }

    const candidates = new Map<string, CandidateClient>();

    const mergeCandidate = (incoming: Omit<CandidateClient, 'hasContrato' | 'hasFactura'> & { isContrato?: boolean; isFactura?: boolean }) => {
      const rs = String(incoming.razonSocial || '').trim().toUpperCase();
      const cuitClean = String(incoming.cuit || '').replace(/\D/g, '');
      if (!rs && cuitClean.length < 7) return;
      if ((rs === 'CONSUMIDOR FINAL' || rs === 'CONSUMIDOR FINAL.') && cuitClean.length < 7) return;

      const key = cuitClean.length >= 7 ? `CUIT:${cuitClean}` : `RS:${rs}`;
      const prev = candidates.get(key);
      const hasContrato = Boolean(prev?.hasContrato || incoming.isContrato);
      const hasFactura = Boolean(prev?.hasFactura || incoming.isFactura);
      const fuente =
        hasContrato && hasFactura
          ? 'CONTRATO_Y_FACTURA'
          : hasContrato
          ? 'CONTRATO'
          : 'FACTURA_ARCA';

      const cleanVal = (v?: string) => {
        const s = String(v || '').trim();
        return s && s !== '-' ? s : '';
      };

      candidates.set(key, {
        cuit: cuitClean || prev?.cuit || '',
        razonSocial: rs || prev?.razonSocial || '',
        condicionIva: cleanVal(incoming.condicionIva) || prev?.condicionIva,
        condicionVenta: cleanVal(incoming.condicionVenta) || prev?.condicionVenta,
        domicilio: cleanVal(incoming.domicilio) || prev?.domicilio,
        localidad: cleanVal(incoming.localidad) || prev?.localidad,
        zona: cleanVal(incoming.zona) || prev?.zona,
        telefono: cleanVal(incoming.telefono) || prev?.telefono,
        email: cleanVal(incoming.email) || prev?.email,
        fuente,
        ultimoComprobante: cleanVal(incoming.ultimoComprobante) || prev?.ultimoComprobante,
        hasContrato,
        hasFactura,
      });
    };

    for (const row of rentalsRes.rows) {
      const d = row.data || {};
      mergeCandidate({
        cuit: d.clienteDocumento,
        razonSocial: d.clienteNombre,
        condicionIva: d.clienteCondicionIva,
        condicionVenta: d.condicionVenta,
        domicilio: d.direccionObra,
        localidad: d.localidadObra,
        zona: d.zonaObra,
        telefono: d.clienteTelefono,
        email: d.clienteEmail,
        fuente: 'CONTRATO',
        ultimoComprobante: d.numeroContrato || d.id,
        isContrato: true,
      });
    }

    for (const row of arcaRes.rows) {
      const d = row.data || {};
      mergeCandidate({
        cuit: d.nroDocReceptor,
        razonSocial: d.razonSocialReceptor,
        condicionIva: d.condicionIvaReceptor,
        condicionVenta: d.condicionVenta,
        domicilio: d.domicilioReceptor,
        fuente: 'FACTURA_ARCA',
        ultimoComprobante:
          d.nroComprobanteCompleto ||
          (d.puntoVenta && d.numeroComprobante
            ? `${String(d.puntoVenta).padStart(4, '0')}-${String(d.numeroComprobante).padStart(8, '0')}`
            : d.id),
        isFactura: true,
      });
    }

    let createdCount = 0;
    let enrichedCount = 0;
    const processedClients: any[] = [];

    for (const cand of candidates.values()) {
      const existsAlready =
        (cand.cuit.length >= 7 && existingCuits.has(cand.cuit)) ||
        (cand.razonSocial && existingNames.has(cand.razonSocial));

      const existing =
        (cand.cuit.length >= 7 ? existingDataByKey.get(`CUIT:${cand.cuit}`) : null) ||
        (cand.razonSocial ? existingDataByKey.get(`RS:${cand.razonSocial}`) : null) ||
        null;

      const saved = await autoUpsertClientInDb(pool, {
        id: existing?.id,
        codigo: existing?.codigo,
        cuit: existing?.cuit || cand.cuit,
        razonSocial: existing?.razonSocial || cand.razonSocial,
        condicionIva: existing?.condicionIva || cand.condicionIva,
        condicionVenta: existing?.condicionVenta || cand.condicionVenta,
        domicilio: existing?.domicilio || cand.domicilio,
        localidad: existing?.localidad || cand.localidad,
        zona: existing?.zona || cand.zona,
        telefono: existing?.telefono || cand.telefono,
        email: existing?.email || cand.email,
        notas: existing?.notas,
        fuente: cand.fuente,
        ultimoComprobante: existing?.ultimoComprobante || cand.ultimoComprobante,
      });

      if (saved) {
        processedClients.push(saved);
        if (existsAlready) enrichedCount++;
        else createdCount++;
      }
    }

    invalidateCache('table_clients');
    invalidateCache('collection_clients');

    const finalClientsRes = await pool.query('SELECT data FROM clients ORDER BY codigo ASC, updated_at DESC;');
    const allClients = finalClientsRes.rows.map((r: any) => r.data).filter(Boolean);

    return res.json({
      success: true,
      totalFound: candidates.size,
      createdCount,
      enrichedCount,
      clients: allClients,
    });
  } catch (error: any) {
    console.error('[POST /api/clients/sync-from-history] Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Error sincronizando clientes desde contratos y facturas.',
    });
  }
});

// Server-authoritative automatic contract numbering for Rentals in Supabase PostgreSQL
router.get('/rentals/next-number', async (_req, res) => {
  try {
    const pool = getDbPool();
    if (!pool || isCockroachClusterDisabled()) {
      return res.status(503).json({ error: 'Conexión a Supabase PostgreSQL no disponible para alquileres.' });
    }

    const [rRes, qRes] = await Promise.all([
      pool.query('SELECT data FROM rentals ORDER BY updated_at DESC;'),
      pool.query('SELECT data FROM quotations ORDER BY numero_comprobante DESC, updated_at DESC;')
    ]);
    const rentalsList = rRes.rows.map((r: any) => r.data).filter(Boolean);
    const quotationsList = qRes.rows.map((r: any) => r.data).filter(Boolean);

    let maxNum = 0;
    for (const r of rentalsList) {
      const numStr = String(r.numeroContrato || r.id || '').replace(/\D/g, '');
      const n = parseInt(numStr, 10);
      if (!isNaN(n) && n < 100000 && n > maxNum) {
        maxNum = n;
      }
    }
    const nextNum = Math.max(rentalsList.length + 1, maxNum + 1);
    const formatted = `ALQ-${String(nextNum).padStart(4, '0')}`;

    return res.json({
      nextNumber: nextNum,
      numeroContrato: formatted,
      rentals: rentalsList,
      quotations: quotationsList
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error calculando próximo contrato de alquiler en Supabase' });
  }
});

// 3. Settings endpoint backed strictly by Supabase PostgreSQL + Cloudflare R2
router.get('/settings/:key', async (req, res) => {
  const key = req.params.key;
  const bypassCache = req.query.nocache === '1' || req.query.fresh === '1';
  const cacheKey = `setting_${key}`;
  if (!bypassCache) {
    const cached = getFromCache(cacheKey);
    if (cached !== null) {
      return res.json(cached);
    }
  }

  const pool = getDbPool();
  if (!pool || isCockroachClusterDisabled()) {
    return res.status(503).json({ error: 'Conexión a Supabase PostgreSQL no disponible.' });
  }

  try {
    const result = await pool.query('SELECT value FROM system_settings WHERE key = $1;', [key]);
    if (result.rows.length > 0) {
      setInCache(cacheKey, result.rows[0].value);
      return res.json(result.rows[0].value);
    }
    return res.status(404).json({ error: 'Configuración no encontrada' });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || `Error consultando configuración "${key}" en Supabase.` });
  }
});

router.post('/settings/:key', async (req, res) => {
  const key = req.params.key;
  const pool = getDbPool();
  if (!pool || isCockroachClusterDisabled()) {
    return res.status(503).json({
      error: 'Conexión a Supabase PostgreSQL no disponible. No se pudo confirmar el guardado de configuración.',
    });
  }

  let value: any;
  try {
    value = await enforceR2OnPayload(req.body, 'uploads/settings');
  } catch (r2Err: any) {
    return res.status(502).json({ error: r2Err?.message || 'No se pudo subir el archivo a Cloudflare R2' });
  }

  try {
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
      [key, JSON.stringify(value)]
    );
    invalidateCache(`setting_${key}`);
    return res.json({ success: true, source: 'database' });
  } catch (error: any) {
    console.error(`[Settings] Error guardando ${key} en Supabase:`, error);
    return res.status(500).json({
      error: error?.message || `Error guardando configuración "${key}" en Supabase PostgreSQL.`,
    });
  }
});

// Strict Supabase PostgreSQL transactional sync for Google Sheets & confirmed bulk operations
const STRICT_SYNC_TABLES: Record<string, (item: any) => Record<string, any>> = {
  fuel_vouchers: (v) => ({
    numero_vale: v.numOrden || v.numeroVale || '',
    fecha: v.fecha || '',
    codigo_equipo: v.codigoEquipo || '',
    patente: v.patente || '',
    deposito_origen: v.deposito || v.depositoOrigen || '',
    tipo_combustible: v.tipoComb || v.tipoCombustible || '',
    cantidad: Number(v.cantidad || 0),
    kilometraje: Number(v.kilometraje || 0),
  }),
  issued_vouchers: (v) => ({
    numero_vale: v.numVale || v.numeroVale || v.numComprobante || '',
    fecha: v.fechaEmision || v.fecha || '',
    destinatario: v.nombreApellido || v.destinatario || '',
  }),
  partes_diarios: (p) => ({
    fecha: p.fecha || '',
    codigo_equipo: p.codigoEquipo || '',
    obra: p.obra || '',
    chofer: p.nombreApellido || p.chofer || '',
    horas_trabajadas: Number(p.horasTrabajadas || p.hsCantidad || 0),
  }),
  vehicle_expenses: (e) => ({
    equipo_codigo: e.equipoPatenteOrCodigo || e.equipoCodigo || e.equipoId || '',
    fecha: e.fecha || '',
    tipo_gasto: e.subcategoriaOriginal || e.categoria || e.tipoGasto || '',
    monto: Number(e.montoTotal ?? e.monto ?? 0),
  }),
};

router.post('/supabase-sync/:tableName', express.json({ limit: '25mb' }), async (req, res) => {
  const { tableName } = req.params;
  const extractor = STRICT_SYNC_TABLES[tableName];
  if (!extractor) {
    return res.status(400).json({ error: `Tabla "${tableName}" no habilitada para sincronización estricta.` });
  }

  const pool = getDbPool();
  if (!pool || isCockroachClusterDisabled()) {
    return res.status(503).json({
      error: 'Conexión a Supabase PostgreSQL no disponible. Los registros no fueron guardados.',
    });
  }

  const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

  let cleanItems: any[];
  try {
    cleanItems = await enforceR2OnPayload(rawItems, `uploads/${tableName}`);
  } catch (r2Err: any) {
    return res.status(502).json({
      error: r2Err?.message || 'No se pudieron procesar adjuntos hacia Cloudflare R2.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (mode === 'replace') {
      await client.query(`DELETE FROM ${tableName};`);
    }

    if (cleanItems.length > 0) {
      await executeMultiRowBatchUpsert(client, tableName, 'id', cleanItems, extractor);
    }

    await client.query('COMMIT');

    const verifyRes = await pool.query(`SELECT data FROM ${tableName} ORDER BY updated_at DESC;`);
    const persistedItems = verifyRes.rows.map((r: any) => r.data).filter(Boolean);

    invalidateCache(`table_${tableName}`);
    invalidateCache(`collection_${tableName}`);

    return res.json({
      success: true,
      count: persistedItems.length,
      syncedCount: cleanItems.length,
      items: persistedItems,
    });
  } catch (dbErr: any) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error(`[Supabase Sync Strict] Error guardando en ${tableName}:`, dbErr);
    return res.status(500).json({
      error: dbErr?.message || `Error confirmando sincronización en Supabase (${tableName}).`,
    });
  } finally {
    client.release();
  }
});

// 4. Cloudflare R2 Universal File & Image Upload Endpoint (PDFs, Images, Docs, etc.)
router.post('/upload', express.json({ limit: '25mb' }), async (req, res) => {
  try {
    const {
      fileBase64,
      imageBase64,
      fileName = 'archivo',
      contentType = 'application/octet-stream',
      folder = 'uploads',
    } = req.body;

    const rawPayload = fileBase64 || imageBase64;
    if (!rawPayload) {
      return res.status(400).json({ error: 'Se requiere el campo fileBase64 o imageBase64' });
    }

    // Strip any data:<mime>;base64, prefix (PDF, images, office docs, etc.)
    const mimeMatch = typeof rawPayload === 'string' ? rawPayload.match(/^data:([^;]+);base64,/) : null;
    const detectedMime = mimeMatch?.[1] || contentType;
    const base64Data = String(rawPayload).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const result = await uploadFileToR2(buffer, fileName, detectedMime, folder);

    if (!result.success) {
      return res.status(502).json({ error: result.error });
    }

    res.json({ success: true, url: result.url, key: result.key, sizeBytes: buffer.length });
  } catch (error: any) {
    console.error('Error handling upload:', error);
    res.status(500).json({ error: error.message || 'Error en el servidor al subir archivo a R2' });
  }
});

// 5. Proxy endpoint for R2 objects if public domain is not configured
router.get('/files/:key', async (req, res) => {
  const r2 = getR2Client();
  if (!r2) {
    return res.status(503).json({ error: 'Cloudflare R2 no configurado' });
  }

  try {
    const key = decodeURIComponent(req.params.key);
    const command = new GetObjectCommand({
      Bucket: r2.bucket,
      Key: key,
    });

    const response = await r2.client.send(command);
    if (response.ContentType) {
      res.setHeader('Content-Type', response.ContentType);
    }
    if (response.ContentLength) {
      res.setHeader('Content-Length', response.ContentLength);
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000');
    (response.Body as any).pipe(res);
  } catch (error: any) {
    console.error('Error fetching file from R2:', error);
    res.status(404).send('Archivo no encontrado');
  }
});

// 6. Safe Image Proxy for same-origin PDF embedding (logos alojados en R2)
router.get('/image-proxy', async (req, res) => {
  try {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      return res.status(400).json({ error: 'Falta el parámetro url' });
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'URL inválida' });
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return res.status(400).json({ error: 'Protocolo no permitido' });
    }

    const host = parsed.hostname.toLowerCase();
    const r2PublicHost = process.env.R2_PUBLIC_URL
      ? (() => {
          try {
            return new URL(process.env.R2_PUBLIC_URL!).hostname.toLowerCase();
          } catch {
            return '';
          }
        })()
      : '';

    const isAllowedHost =
      host.endsWith('.r2.dev') ||
      host.endsWith('.r2.cloudflarestorage.com') ||
      (r2PublicHost !== '' && host === r2PublicHost);

    if (!isAllowedHost) {
      return res.status(403).json({ error: 'Dominio de imagen no autorizado' });
    }

    const upstream = await fetch(parsed.toString());
    if (!upstream.ok) {
      return res.status(upstream.status).send('No se pudo obtener la imagen');
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ error: 'El recurso no es una imagen válida' });
    }

    const arrayBuf = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: 'Imagen demasiado grande' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (error: any) {
    console.error('Error en image-proxy:', error);
    res.status(500).json({ error: 'Error cargando imagen' });
  }
});

// 7. Server-side Google Sheets Reader (bypasses browser CORS & Firebase unauthorized-domain on Vercel)
router.get('/sheets/public-workbook', async (req, res) => {
  try {
    const spreadsheetId = String(req.query.spreadsheetId || '').trim();
    const tabTitle = typeof req.query.tabTitle === 'string' ? req.query.tabTitle.trim() : '';
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';

    if (!spreadsheetId) {
      return res.status(400).json({ ok: false, error: 'Falta spreadsheetId' });
    }

    const cacheKey = `gsheet_wb_${spreadsheetId}`;
    let parsedWorkbook = !forceRefresh ? getFromCache<{
      spreadsheetId: string;
      title: string;
      sheets: Array<{ sheetId: number; title: string; index: number; rowCount: number; columnCount: number }>;
      tabsData: Record<string, { formattedValues: string[][]; formulaValues: string[][] }>;
    }>(cacheKey) : null;

    if (!parsedWorkbook) {
      const exportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=xlsx`;
      const upstream = await fetch(exportUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LaHormigaERP/1.0)',
        },
      });

      if (!upstream.ok) {
        return res.status(upstream.status).json({
          ok: false,
          status: upstream.status,
          error:
            upstream.status === 401 || upstream.status === 403
              ? 'SHEET_PRIVATE: La planilla requiere permiso de lectura o cuenta Google conectada.'
              : `No se pudo descargar la planilla (HTTP ${upstream.status}).`,
        });
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) {
        return res.status(403).json({
          ok: false,
          status: 403,
          error: 'SHEET_PRIVATE: La planilla está restringida. En Google Sheets tocá "Compartir → Cualquier persona con el enlace (Lector)" o autorizá con tu cuenta Google.',
        });
      }

      const contentDisposition = upstream.headers.get('content-disposition') || '';
      let docTitle = 'Planilla Google Sheets';
      const fileMatch =
        contentDisposition.match(/filename\*=UTF-8''([^;]+)/i) ||
        contentDisposition.match(/filename="?([^";]+)"?/i);
      if (fileMatch && fileMatch[1]) {
        try {
          docTitle = decodeURIComponent(fileMatch[1]).replace(/\.xlsx$/i, '');
        } catch {
          docTitle = fileMatch[1].replace(/\.xlsx$/i, '');
        }
      }

      const arrayBuf = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const wb = XLSX.read(buffer, {
        type: 'buffer',
        cellFormula: true,
        cellText: true,
        cellNF: true,
      });

      const sheetsMeta: Array<{
        sheetId: number;
        title: string;
        index: number;
        rowCount: number;
        columnCount: number;
      }> = [];
      const tabsData: Record<string, { formattedValues: string[][]; formulaValues: string[][] }> = {};

      wb.SheetNames.forEach((name, idx) => {
        const ws = wb.Sheets[name];
        const ref = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
        const maxRows = ws['!ref'] ? Math.min(2500, ref.e.r + 1) : 0;
        const maxCols = ws['!ref'] ? Math.min(120, ref.e.c + 1) : 0;

        const formattedValues: string[][] = [];
        const formulaValues: string[][] = [];

        for (let r = 0; r < maxRows; r++) {
          const fRow: string[] = [];
          const mRow: string[] = [];
          let lastNonEmptyCol = -1;
          for (let c = 0; c < maxCols; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr];
            if (!cell) {
              fRow.push('');
              mRow.push('');
              continue;
            }
            const formattedStr =
              cell.w !== undefined && cell.w !== null
                ? String(cell.w)
                : cell.v !== undefined && cell.v !== null
                  ? String(cell.v)
                  : '';
            const formulaStr = cell.f ? `=${cell.f}` : formattedStr;
            if (formattedStr !== '' || formulaStr !== '') {
              lastNonEmptyCol = c;
            }
            fRow.push(formattedStr);
            mRow.push(formulaStr);
          }
          if (lastNonEmptyCol >= 0) {
            formattedValues.push(fRow);
            formulaValues.push(mRow);
          } else {
            formattedValues.push(new Array(maxCols).fill(''));
            formulaValues.push(new Array(maxCols).fill(''));
          }
        }

        // Trim trailing completely empty rows
        while (
          formattedValues.length > 0 &&
          formattedValues[formattedValues.length - 1].every(v => v === '')
        ) {
          formattedValues.pop();
          formulaValues.pop();
        }

        sheetsMeta.push({
          sheetId: idx,
          title: name,
          index: idx,
          rowCount: Math.max(100, formattedValues.length),
          columnCount: Math.max(26, maxCols),
        });
        tabsData[name] = { formattedValues, formulaValues };
      });

      parsedWorkbook = {
        spreadsheetId,
        title: docTitle,
        sheets: sheetsMeta,
        tabsData,
      };
      setInCache(cacheKey, parsedWorkbook);
    }

    if (tabTitle) {
      const exactTab =
        parsedWorkbook.tabsData[tabTitle] ||
        Object.entries(parsedWorkbook.tabsData).find(
          ([k]) => k.trim().toUpperCase() === tabTitle.trim().toUpperCase()
        )?.[1];

      if (!exactTab) {
        return res.status(404).json({
          ok: false,
          error: `No se encontró la pestaña "${tabTitle}" en la planilla.`,
        });
      }
      return res.json({
        ok: true,
        spreadsheetId: parsedWorkbook.spreadsheetId,
        title: parsedWorkbook.title,
        tabTitle,
        formattedValues: exactTab.formattedValues,
        formulaValues: exactTab.formulaValues,
      });
    }

    return res.json({
      ok: true,
      spreadsheetId: parsedWorkbook.spreadsheetId,
      title: parsedWorkbook.title,
      sheets: parsedWorkbook.sheets,
    });
  } catch (error: any) {
    console.error('Error en /api/sheets/public-workbook:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Error al leer Google Sheet desde el servidor.',
    });
  }
});

// ==================== AI DOCUMENT ANALYSIS (GEMINI MULTIMODAL SERVER-SIDE) ====================
router.post('/documents/analyze', async (req, res) => {
  try {
    const { documentType, imageUrl, imageBase64, mimeType, context } = req.body || {};
    if (!documentType) {
      return res.status(400).json({
        success: false,
        error: 'Indicá qué tipo de documento querés analizar (PARTE_DIARIO, COMBUSTIBLE, VALE_COMBUSTIBLE, FACTURA o REMITO).',
      });
    }
    const result = await analyzeDocumentImageWithGemini({
      documentType,
      imageUrl,
      imageBase64,
      mimeType,
      context,
    });
    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[Gemini AI /documents/analyze] Error:', err);
    const status = Number(err?.statusCode || err?.status || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      success: false,
      error: err?.message || 'No se pudo analizar el documento con IA.',
    });
  }
});

// ==================== SUPABASE EGRESS / WEIGHT AUDIT & LEGACY BASE64 -> R2 MIGRATION ====================
const AUDITABLE_ENTITY_TABLES = [
  'vehicles',
  'fuel_vouchers',
  'partes_diarios',
  'drivers',
  'obras',
  'fuel_deposits',
  'issued_vouchers',
  'rentals',
  'hardware',
  'aridos',
  'stock_items',
  'stock_movements',
  'stock_categories',
  'stock_warehouses',
  'vehicle_services',
  'vehicle_expenses',
  'arca_invoices',
  'quotations',
  'caja_diaria',
  'proveedores',
  'clients',
  'purchase_invoices',
  'supplier_payments',
  'customer_receipts',
  'arca_remitos',
  'accounting_accounts',
  'accounting_entries',
  'cheques_cartera',
  'truck_performance_trips',
] as const;

const BASE64_REGEX_SQL = 'data:(image|application|video|audio)/[^;]+;base64,';

router.get('/db-audit', async (_req, res) => {
  const pool = getDbPool();
  if (!pool || isCockroachClusterDisabled()) {
    return res.status(503).json({
      ok: false,
      error: 'Conexión a Supabase PostgreSQL no disponible para auditar.',
    });
  }

  try {
    const tables: Array<{
      tableName: string;
      rowCount: number;
      dataBytes: number;
      totalBytes: number;
      base64Rows: number;
      base64Bytes: number;
    }> = [];

    for (const tableName of AUDITABLE_ENTITY_TABLES) {
      try {
        const extraFotografiaExpr = tableName === 'vehicles' ? ` OR COALESCE(fotografia, '') ~ '^data:'` : '';
        const extraFotografiaBytesExpr =
          tableName === 'vehicles'
            ? ` + CASE WHEN COALESCE(fotografia, '') ~ '^data:' THEN octet_length(fotografia) ELSE 0 END`
            : '';

        const q = await pool.query(
          `SELECT
            COUNT(*)::int AS row_count,
            COALESCE(SUM(octet_length(data::text)), 0)::bigint AS data_bytes,
            COALESCE(pg_total_relation_size('${tableName}'::regclass), 0)::bigint AS total_bytes,
            COUNT(*) FILTER (WHERE data::text ~ $1${extraFotografiaExpr})::int AS base64_rows,
            COALESCE(SUM(
              CASE
                WHEN data::text ~ $1 THEN octet_length(data::text)${extraFotografiaBytesExpr}
                ${tableName === 'vehicles' ? "WHEN COALESCE(fotografia, '') ~ '^data:' THEN octet_length(fotografia)" : ''}
                ELSE 0
              END
            ), 0)::bigint AS base64_bytes
          FROM ${tableName};`,
          [BASE64_REGEX_SQL]
        );
        const r = q.rows[0] || {};
        tables.push({
          tableName,
          rowCount: Number(r.row_count || 0),
          dataBytes: Number(r.data_bytes || 0),
          totalBytes: Number(r.total_bytes || 0),
          base64Rows: Number(r.base64_rows || 0),
          base64Bytes: Number(r.base64_bytes || 0),
        });
      } catch {
        // Ignore tables not yet initialized
      }
    }

    const settingsList: Array<{
      key: string;
      bytes: number;
      hasBase64: boolean;
    }> = [];
    let settingsTotalBytes = 0;
    let settingsBase64Count = 0;

    try {
      const settingsRes = await pool.query(
        `SELECT
          key,
          octet_length(value::text)::bigint AS bytes,
          (value::text ~ $1) AS has_base64
        FROM system_settings
        ORDER BY octet_length(value::text) DESC;`,
        [BASE64_REGEX_SQL]
      );
      for (const row of settingsRes.rows) {
        const b = Number(row.bytes || 0);
        const hasB64 = Boolean(row.has_base64);
        settingsTotalBytes += b;
        if (hasB64) settingsBase64Count += 1;
        settingsList.push({
          key: String(row.key),
          bytes: b,
          hasBase64: hasB64,
        });
      }
    } catch {
      // ignore
    }

    tables.sort((a, b) => b.dataBytes - a.dataBytes);

    const totalDataBytes = tables.reduce((acc, t) => acc + t.dataBytes, 0) + settingsTotalBytes;
    const totalBase64Rows = tables.reduce((acc, t) => acc + t.base64Rows, 0) + settingsBase64Count;
    const totalBase64Bytes =
      tables.reduce((acc, t) => acc + t.base64Bytes, 0) +
      settingsList.filter(s => s.hasBase64).reduce((acc, s) => acc + s.bytes, 0);

    return res.json({
      ok: true,
      totalDataBytes,
      totalBase64Rows,
      totalBase64Bytes,
      tables,
      systemSettingsTop: settingsList.slice(0, 12),
      r2Configured: Boolean(getR2Client()),
    });
  } catch (err: any) {
    console.error('[DB Audit] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Error auditando tablas de Supabase.',
    });
  }
});

router.post('/migrate-base64-to-r2', async (_req, res) => {
  const pool = getDbPool();
  if (!pool || isCockroachClusterDisabled()) {
    return res.status(503).json({
      ok: false,
      error: 'Conexión a Supabase PostgreSQL no disponible.',
    });
  }
  if (!getR2Client()) {
    return res.status(400).json({
      ok: false,
      error: 'Cloudflare R2 no está configurado en el servidor. Configurá las variables R2_* antes de migrar.',
    });
  }

  try {
    let migratedRows = 0;
    let migratedSettings = 0;
    let bytesBefore = 0;
    let bytesAfter = 0;
    const details: Array<{ target: string; rows: number; savedBytes: number }> = [];

    for (const tableName of AUDITABLE_ENTITY_TABLES) {
      const whereClause =
        tableName === 'vehicles'
          ? `WHERE data::text ~ $1 OR COALESCE(fotografia, '') ~ '^data:'`
          : `WHERE data::text ~ $1`;

      let rowsRes;
      try {
        rowsRes = await pool.query(`SELECT id, data FROM ${tableName} ${whereClause} LIMIT 100;`, [
          BASE64_REGEX_SQL,
        ]);
      } catch {
        continue;
      }

      if (!rowsRes.rows || rowsRes.rows.length === 0) continue;

      let tableMigrated = 0;
      let tableSavedBytes = 0;

      for (const row of rowsRes.rows) {
        const rawJson = JSON.stringify(row.data);
        const beforeLen = Buffer.byteLength(rawJson, 'utf8');
        const cleaned = await enforceR2OnPayload(row.data, `uploads/${tableName}`);
        const cleanedJson = JSON.stringify(cleaned);
        const afterLen = Buffer.byteLength(cleanedJson, 'utf8');

        if (tableName === 'vehicles') {
          const cleanFoto = typeof cleaned?.fotografia === 'string' ? cleaned.fotografia : null;
          await pool.query(
            `UPDATE vehicles SET data = $2::jsonb, fotografia = COALESCE($3, fotografia), updated_at = NOW() WHERE id = $1;`,
            [row.id, cleanedJson, cleanFoto]
          );
        } else {
          await pool.query(
            `UPDATE ${tableName} SET data = $2::jsonb, updated_at = NOW() WHERE id = $1;`,
            [row.id, cleanedJson]
          );
        }

        bytesBefore += beforeLen;
        bytesAfter += afterLen;
        tableSavedBytes += Math.max(0, beforeLen - afterLen);
        tableMigrated += 1;
        migratedRows += 1;
      }

      if (tableMigrated > 0) {
        invalidateCache(`table_${tableName}`);
        invalidateCache(`collection_${tableName}`);
        details.push({ target: tableName, rows: tableMigrated, savedBytes: tableSavedBytes });
      }
    }

    // Also migrate any base64 inside system_settings (e.g. site_settings logos/banners)
    try {
      const settingsRes = await pool.query(
        `SELECT key, value FROM system_settings WHERE value::text ~ $1 LIMIT 50;`,
        [BASE64_REGEX_SQL]
      );
      for (const row of settingsRes.rows) {
        const beforeLen = Buffer.byteLength(JSON.stringify(row.value), 'utf8');
        const cleaned = await enforceR2OnPayload(row.value, 'uploads/settings');
        const cleanedJson = JSON.stringify(cleaned);
        const afterLen = Buffer.byteLength(cleanedJson, 'utf8');

        await pool.query(
          `UPDATE system_settings SET value = $2::jsonb, updated_at = NOW() WHERE key = $1;`,
          [row.key, cleanedJson]
        );
        bytesBefore += beforeLen;
        bytesAfter += afterLen;
        migratedSettings += 1;
        details.push({
          target: `system_settings:${row.key}`,
          rows: 1,
          savedBytes: Math.max(0, beforeLen - afterLen),
        });
      }
    } catch {
      // ignore
    }

    const freedBytesEstimate = Math.max(0, bytesBefore - bytesAfter);
    return res.json({
      ok: true,
      migratedRows,
      migratedSettings,
      freedBytesEstimate,
      details,
    });
  } catch (err: any) {
    console.error('[Migrate Base64 -> R2] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Error migrando adjuntos Base64 hacia Cloudflare R2.',
    });
  }
});

// ============================================================================
// PROGRAMACIÓN DEL DÍA POR AUDIO (WHATSAPP BAILEYS + GEMINI + SUPABASE)
// ============================================================================

// Reanudar sesión previa de Baileys desde Supabase PostgreSQL al iniciar el servidor
setTimeout(() => {
  autoResumeBaileysSessionIfStored().catch(() => {});
}, 3000);

router.get('/baileys/status', async (_req, res) => {
  try {
    const status = await getBaileysStatus();
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error consultando estado de WhatsApp Baileys.' });
  }
});

router.post('/baileys/connect', async (req, res) => {
  try {
    const { resetSession, pairingPhone } = req.body || {};
    const status = await startBaileysConnection({
      resetSession: Boolean(resetSession),
      pairingPhone: pairingPhone ? String(pairingPhone) : undefined,
    });
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'No se pudo iniciar la conexión con WhatsApp Baileys.' });
  }
});

router.post('/baileys/disconnect', async (_req, res) => {
  try {
    const status = await disconnectBaileysSession(true);
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error al desconectar sesión de WhatsApp Baileys.' });
  }
});

router.post('/baileys/config', async (req, res) => {
  try {
    await saveBaileysConfigToSupabase(req.body || {});
    const status = await getBaileysStatus();
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'No se pudo guardar la configuración de Baileys en Supabase.' });
  }
});

router.post('/baileys/send-schedule', async (req, res) => {
  try {
    const { phone, text } = req.body || {};
    if (!phone || !text) {
      return res.status(400).json({ error: 'Debés indicar el número de destino y el texto del esquema.' });
    }
    const result = await sendWhatsAppMessageViaBaileys(String(phone), String(text));
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'No se pudo enviar el mensaje por Baileys.' });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error enviando mensaje por WhatsApp Baileys.' });
  }
});

router.get('/daily-schedule/:fecha', async (req, res) => {
  const pool = getDbPool();
  if (!pool) {
    return res.status(503).json({ error: 'Conexión a Supabase PostgreSQL no disponible.' });
  }
  try {
    const fecha = String(req.params.fecha || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ error: 'Formato de fecha inválido (use YYYY-MM-DD).' });
    }
    const syncDrivers = req.query.sync === '1' || req.query.sync === 'true';
    const schedule = await getOrCreateDailyScheduleInSupabase(fecha, undefined, {
      syncNewDrivers: syncDrivers,
    });
    const logsRes = await pool.query(
      'SELECT data FROM whatsapp_audio_logs WHERE fecha = $1 ORDER BY created_at DESC LIMIT 50;',
      [fecha]
    );
    const audioLogs = logsRes.rows.map((r) => r.data).filter(Boolean);
    return res.json({
      schedule,
      audioLogs,
      whatsappText: formatScheduleForWhatsAppText(schedule),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error cargando programación diaria desde Supabase.' });
  }
});

router.put('/daily-schedule/:fecha', async (req, res) => {
  const pool = getDbPool();
  if (!pool) {
    return res.status(503).json({ error: 'Conexión a Supabase PostgreSQL no disponible. No se guardó el cambio.' });
  }
  try {
    const fecha = String(req.params.fecha || '').trim();
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Datos de programación inválidos.' });
    }
    const saved = await saveDailyScheduleToSupabase({
      ...payload,
      id: payload.id || `SCHED-${fecha}`,
      fecha,
    });
    return res.json({
      schedule: saved,
      whatsappText: formatScheduleForWhatsAppText(saved),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error guardando programación diaria en Supabase.' });
  }
});

router.post('/daily-schedule/process-audio', async (req, res) => {
  try {
    const {
      fecha,
      origen = 'WEB_MIC',
      audioBase64,
      audioUrl,
      mimeType,
      textInstruction,
      senderName,
    } = req.body || {};

    if (!audioBase64 && !audioUrl && !textInstruction) {
      return res.status(400).json({
        error: 'Enviá un audio grabado, archivo de audio de WhatsApp o instrucción de texto para armar el esquema.',
      });
    }

    const result = await processAudioOrTextToSchedule({
      fecha,
      origen,
      audioBase64,
      audioUrl,
      mimeType,
      textInstruction,
      senderName,
    });

    return res.json({
      schedule: result.schedule,
      audioLog: result.audioLog,
      whatsappText: formatScheduleForWhatsAppText(result.schedule),
    });
  } catch (err: any) {
    console.error('[DailySchedule ProcessAudio] Error:', err?.message || err);
    return res.status(500).json({
      error: err?.message || 'No se pudo transcribir o procesar el audio de programación.',
    });
  }
});

router.post('/daily-schedule/reprocess-log/:id', async (req, res) => {
  const pool = getDbPool();
  if (!pool) {
    return res.status(503).json({ error: 'Conexión a Supabase PostgreSQL no disponible.' });
  }
  try {
    const id = String(req.params.id || '').trim();
    const { textInstruction, fecha } = req.body || {};
    const existingRes = await pool.query('SELECT data FROM whatsapp_audio_logs WHERE id = $1 LIMIT 1;', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Registro de audio no encontrado en Supabase.' });
    }
    const existingLog = existingRes.rows[0].data;
    const result = await processAudioOrTextToSchedule({
      fecha: fecha || existingLog.fecha,
      origen: existingLog.origen || 'WHATSAPP_BAILEYS',
      audioUrl: existingLog.audioUrl,
      mimeType: existingLog.mimeType,
      textInstruction: textInstruction ? String(textInstruction).trim() : undefined,
      senderJid: existingLog.senderJid,
      senderPhone: existingLog.senderPhone,
      senderName: existingLog.senderName,
      existingLogId: id,
    });
    return res.json({
      schedule: result.schedule,
      audioLog: result.audioLog,
      whatsappText: formatScheduleForWhatsAppText(result.schedule),
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Error al reprocesar el registro de audio en Supabase.',
    });
  }
});

router.delete('/daily-schedule/audio-log/:id', async (req, res) => {
  const pool = getDbPool();
  if (!pool) {
    return res.status(503).json({ error: 'Conexión a Supabase PostgreSQL no disponible.' });
  }
  try {
    const id = String(req.params.id || '').trim();
    await pool.query('DELETE FROM whatsapp_audio_logs WHERE id = $1;', [id]);
    bumpScheduleMutationVersion();
    return res.json({ ok: true, id });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error eliminando registro de audio en Supabase.' });
  }
});

export default router;

