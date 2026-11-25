import type {
  AuthenticationCreds,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { getDbPool } from './db.js';
import {
  formatScheduleForWhatsAppText,
  getScheduleMutationVersion,
  processAudioOrTextToSchedule,
} from './scheduleAudioProcessor.js';

export interface BaileysWhatsAppConfig {
  authorizedPhones: string[];
  autoProcessAudios: boolean;
  autoProcessTexts: boolean;
  autoReplySummary: boolean;
  targetDateMode: 'TODAY' | 'AUTO_DETECT';
}

export interface BaileysConnectionStatus {
  state: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';
  qrDataUrl?: string | null;
  pairingCode?: string | null;
  connectedPhone?: string | null;
  connectedName?: string | null;
  lastEventAt?: string;
  lastError?: string | null;
  scheduleVersion?: number;
  config: BaileysWhatsAppConfig;
}

const CONFIG_KEY = 'baileys_whatsapp_config';
const CREDS_KEY = 'baileys_auth_creds';
const KEYS_PREFIX = 'baileys_key_';

const DEFAULT_CONFIG: BaileysWhatsAppConfig = {
  authorizedPhones: [],
  autoProcessAudios: true,
  autoProcessTexts: false,
  autoReplySummary: true,
  targetDateMode: 'AUTO_DETECT',
};

let activeSocket: any = null;
let connectionState: BaileysConnectionStatus['state'] = 'DISCONNECTED';
let currentQrDataUrl: string | null = null;
let currentPairingCode: string | null = null;
let connectedPhone: string | null = null;
let connectedName: string | null = null;
let lastEventAt: string = new Date().toISOString();
let lastError: string | null = null;
let cachedConfig: BaileysWhatsAppConfig | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let manuallyDisconnected = false;
const processedMessageIds = new Set<string>();

// Native ESM dynamic loader so both tsx and esbuild CJS bundles resolve ESM-only sub-packages (whatsapp-rust-bridge)
let baileysModulePromise: Promise<typeof import('@whiskeysockets/baileys')> | null = null;
async function getBaileysModule(): Promise<typeof import('@whiskeysockets/baileys')> {
  if (!baileysModulePromise) {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    baileysModulePromise = dynamicImport('@whiskeysockets/baileys');
  }
  return baileysModulePromise!;
}

// Minimal silent logger compatible with Baileys pino interface
const silentLogger: any = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
};

function cleanDigits(val?: string | null): string {
  return (val || '').replace(/\D/g, '');
}

export async function loadBaileysConfigFromSupabase(): Promise<BaileysWhatsAppConfig> {
  if (cachedConfig) return cachedConfig;
  const pool = getDbPool();
  if (!pool) return { ...DEFAULT_CONFIG };
  try {
    const res = await pool.query('SELECT value FROM system_settings WHERE key = $1 LIMIT 1;', [CONFIG_KEY]);
    if (res.rows.length > 0 && res.rows[0].value) {
      const raw = res.rows[0].value;
      cachedConfig = {
        authorizedPhones: Array.isArray(raw.authorizedPhones)
          ? raw.authorizedPhones.map((p: string) => cleanDigits(p)).filter(Boolean)
          : [],
        autoProcessAudios: raw.autoProcessAudios !== false,
        autoProcessTexts: Boolean(raw.autoProcessTexts),
        autoReplySummary: raw.autoReplySummary !== false,
        targetDateMode: raw.targetDateMode === 'TODAY' ? 'TODAY' : 'AUTO_DETECT',
      };
      return cachedConfig;
    }
  } catch (err: any) {
    console.warn('[Baileys] No se pudo leer configuración desde Supabase:', err?.message);
  }
  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

export async function saveBaileysConfigToSupabase(
  partial: Partial<BaileysWhatsAppConfig>
): Promise<BaileysWhatsAppConfig> {
  const pool = getDbPool();
  if (!pool) {
    throw new Error('Conexión a Supabase PostgreSQL no disponible para guardar configuración de WhatsApp.');
  }
  const current = await loadBaileysConfigFromSupabase();
  const next: BaileysWhatsAppConfig = {
    ...current,
    ...partial,
    authorizedPhones: Array.isArray(partial.authorizedPhones)
      ? partial.authorizedPhones.map((p) => cleanDigits(p)).filter(Boolean)
      : current.authorizedPhones,
  };

  await pool.query(
    `
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    `,
    [CONFIG_KEY, JSON.stringify(next)]
  );

  cachedConfig = next;
  return next;
}

/**
 * Custom Baileys Auth State persisted in Supabase PostgreSQL (system_settings table)
 */
async function useSupabaseBaileysAuthState(): Promise<{
  state: {
    creds: AuthenticationCreds;
    keys: {
      get: <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[]
      ) => Promise<{ [id: string]: SignalDataTypeMap[T] }>;
      set: (data: any) => Promise<void>;
    };
  };
  saveCreds: () => Promise<void>;
  clearAuth: () => Promise<void>;
}> {
  const pool = getDbPool();
  if (!pool) {
    throw new Error('Supabase PostgreSQL no está disponible para almacenar la sesión de Baileys.');
  }

  const { BufferJSON, initAuthCreds, proto } = await getBaileysModule();

  const readData = async (key: string): Promise<any | null> => {
    try {
      const res = await pool.query('SELECT value FROM system_settings WHERE key = $1 LIMIT 1;', [key]);
      if (res.rows.length === 0 || res.rows[0].value === null || res.rows[0].value === undefined) return null;
      const rawJson = JSON.stringify(res.rows[0].value);
      return JSON.parse(rawJson, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const writeData = async (key: string, data: any): Promise<void> => {
    const serialized = JSON.stringify(data, BufferJSON.replacer);
    await pool.query(
      `
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
      `,
      [key, serialized]
    );
  };

  const removeData = async (key: string): Promise<void> => {
    await pool.query('DELETE FROM system_settings WHERE key = $1;', [key]);
  };

  const creds: AuthenticationCreds = (await readData(CREDS_KEY)) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: any } = {};
          if (!ids || ids.length === 0) return data;
          const keyNames = ids.map((id) => `${KEYS_PREFIX}${type}_${id}`);
          try {
            const res = await pool.query(
              'SELECT key, value FROM system_settings WHERE key = ANY($1::text[]);',
              [keyNames]
            );
            const prefixLen = `${KEYS_PREFIX}${type}_`.length;
            for (const row of res.rows) {
              const id = String(row.key || '').slice(prefixLen);
              if (!id || row.value === null || row.value === undefined) continue;
              const rawJson = JSON.stringify(row.value);
              let value = JSON.parse(rawJson, BufferJSON.reviver);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              if (value !== null && value !== undefined) {
                data[id] = value;
              }
            }
          } catch {
            // Fallback to empty if query fails
          }
          return data;
        },
        set: async (data) => {
          const upserts: Array<{ key: string; serialized: string }> = [];
          const deletes: string[] = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const keyName = `${KEYS_PREFIX}${category}_${id}`;
              if (value) {
                upserts.push({
                  key: keyName,
                  serialized: JSON.stringify(value, BufferJSON.replacer),
                });
              } else {
                deletes.push(keyName);
              }
            }
          }

          if (upserts.length > 0) {
            const CHUNK_SIZE = 200;
            for (let i = 0; i < upserts.length; i += CHUNK_SIZE) {
              const chunk = upserts.slice(i, i + CHUNK_SIZE);
              const valuesSql: string[] = [];
              const params: any[] = [];
              chunk.forEach((item, idx) => {
                const pKey = idx * 2 + 1;
                const pVal = idx * 2 + 2;
                valuesSql.push(`($${pKey}, $${pVal}::jsonb, NOW())`);
                params.push(item.key, item.serialized);
              });
              await pool.query(
                `INSERT INTO system_settings (key, value, updated_at)
                 VALUES ${valuesSql.join(', ')}
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
                params
              );
            }
          }

          if (deletes.length > 0) {
            await pool.query('DELETE FROM system_settings WHERE key = ANY($1::text[]);', [deletes]);
          }
        },
      },
    },
    saveCreds: async () => {
      await writeData(CREDS_KEY, creds);
    },
    clearAuth: async () => {
      await pool.query(
        'DELETE FROM system_settings WHERE key = $1 OR key LIKE $2;',
        [CREDS_KEY, `${KEYS_PREFIX}%`]
      );
    },
  };
}

function unwrapWaMessage(rawMessage: any): any {
  let curr = rawMessage;
  for (let depth = 0; depth < 6 && curr; depth++) {
    if (curr.ephemeralMessage?.message) {
      curr = curr.ephemeralMessage.message;
    } else if (curr.viewOnceMessage?.message) {
      curr = curr.viewOnceMessage.message;
    } else if (curr.viewOnceMessageV2?.message) {
      curr = curr.viewOnceMessageV2.message;
    } else if (curr.viewOnceMessageV2Extension?.message) {
      curr = curr.viewOnceMessageV2Extension.message;
    } else if (curr.documentWithCaptionMessage?.message) {
      curr = curr.documentWithCaptionMessage.message;
    } else if (curr.editedMessage?.message) {
      curr = curr.editedMessage.message;
    } else if (curr.deviceSentMessage?.message) {
      curr = curr.deviceSentMessage.message;
    } else if (curr.associatedChildMessage?.message) {
      curr = curr.associatedChildMessage.message;
    } else {
      break;
    }
  }
  return curr;
}

async function resolveSenderPhoneDigits(sock: any, msg: any): Promise<string> {
  const candidates = [
    msg?.key?.participantAlt,
    msg?.key?.remoteJidAlt,
    msg?.key?.participant,
    msg?.key?.remoteJid,
  ].filter(Boolean) as string[];

  // 1. Prefer explicit phone JIDs (@s.whatsapp.net / @c.us)
  for (const jid of candidates) {
    if (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us')) {
      const digits = cleanDigits(jid.split('@')[0]?.split(':')[0]);
      if (digits) return digits;
    }
  }

  // 2. Resolve @lid JIDs via Baileys signalRepository lidMapping or Supabase reverse mapping
  for (const jid of candidates) {
    if (!jid.includes('@lid')) continue;
    try {
      const mapped = await sock?.signalRepository?.lidMapping?.getPNForLID?.(jid);
      if (mapped) {
        const digits = cleanDigits(String(mapped).split('@')[0]?.split(':')[0]);
        if (digits) return digits;
      }
    } catch {}

    const lidDigits = cleanDigits(jid.split('@')[0]?.split(':')[0]);
    if (lidDigits) {
      try {
        const pool = getDbPool();
        if (pool) {
          const revRes = await pool.query(
            'SELECT value FROM system_settings WHERE key = $1 LIMIT 1;',
            [`${KEYS_PREFIX}lid-mapping_${lidDigits}_reverse`]
          );
          if (revRes.rows.length > 0 && revRes.rows[0].value) {
            const digits = cleanDigits(String(revRes.rows[0].value));
            if (digits) return digits;
          }
        }
      } catch {}
    }
  }

  const fallbackJid = candidates[0] || '';
  return cleanDigits(fallbackJid.split('@')[0]?.split(':')[0]);
}

function isSenderAuthorized(senderPhoneDigits: string, fromMe: boolean, config: BaileysWhatsAppConfig): boolean {
  if (fromMe) return true;
  if (!config.authorizedPhones || config.authorizedPhones.length === 0) {
    return true;
  }
  const cleanSender = cleanDigits(senderPhoneDigits);
  if (!cleanSender) return false;
  return config.authorizedPhones.some((auth) => {
    const cleanAuth = cleanDigits(auth);
    if (!cleanAuth) return false;
    const tailLen = Math.min(8, cleanAuth.length, cleanSender.length);
    return (
      cleanSender === cleanAuth ||
      cleanSender.endsWith(cleanAuth.slice(-tailLen)) ||
      cleanAuth.endsWith(cleanSender.slice(-tailLen))
    );
  });
}

export async function getBaileysStatus(): Promise<BaileysConnectionStatus> {
  const config = await loadBaileysConfigFromSupabase();
  return {
    state: connectionState,
    qrDataUrl: currentQrDataUrl,
    pairingCode: currentPairingCode,
    connectedPhone,
    connectedName,
    lastEventAt,
    lastError,
    scheduleVersion: getScheduleMutationVersion(),
    config,
  };
}

export async function startBaileysConnection(options?: {
  resetSession?: boolean;
  pairingPhone?: string;
}): Promise<BaileysConnectionStatus> {
  manuallyDisconnected = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const baileys = await getBaileysModule();
  const makeWASocket = (baileys as any).default || (baileys as any).makeWASocket || baileys;
  const { DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion } = baileys;

  const auth = await useSupabaseBaileysAuthState();

  if (options?.resetSession) {
    try {
      if (activeSocket) {
        activeSocket.end(undefined);
        activeSocket = null;
      }
    } catch {}
    await auth.clearAuth();
    currentQrDataUrl = null;
    currentPairingCode = null;
    connectedPhone = null;
    connectedName = null;
    lastError = null;
  }

  if (activeSocket && (connectionState === 'CONNECTED' || connectionState === 'QR_READY')) {
    if (options?.pairingPhone && connectionState === 'QR_READY') {
      const cleanPhone = cleanDigits(options.pairingPhone);
      if (cleanPhone) {
        try {
          currentPairingCode = await activeSocket.requestPairingCode(cleanPhone);
        } catch (err: any) {
          lastError = `No se pudo generar código de vinculación: ${err?.message || 'Error'}`;
        }
      }
    }
    return getBaileysStatus();
  }

  connectionState = 'CONNECTING';
  lastError = null;
  lastEventAt = new Date().toISOString();

  let version: [number, number, number] = [2, 3000, 1017531287];
  try {
    const latest = await fetchLatestBaileysVersion();
    if (latest?.version) {
      version = latest.version;
    }
  } catch {}

  const freshAuth = options?.resetSession ? await useSupabaseBaileysAuthState() : auth;

  const sock = makeWASocket({
    version,
    auth: freshAuth.state,
    printQRInTerminal: false,
    logger: silentLogger,
    browser: ['La Hormiga ERP', 'Chrome', '2.22.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  activeSocket = sock;

  if (sock?.ws && typeof sock.ws.on === 'function') {
    sock.ws.on('error', (wsErr: any) => {
      console.warn('[Baileys] Error transitorio en WebSocket:', wsErr?.message || wsErr);
    });
  }

  if (options?.pairingPhone && !sock.authState.creds.registered) {
    const cleanPhone = cleanDigits(options.pairingPhone);
    if (cleanPhone) {
      setTimeout(async () => {
        try {
          if (activeSocket === sock && !sock.authState.creds.registered) {
            currentPairingCode = await sock.requestPairingCode(cleanPhone);
            lastEventAt = new Date().toISOString();
          }
        } catch (pairErr: any) {
          lastError = pairErr?.message || 'No se pudo solicitar el código de emparejamiento.';
        }
      }, 2500);
    }
  }

  sock.ev.on('creds.update', async () => {
    await freshAuth.saveCreds().catch((e) => {
      console.warn('[Baileys] Error guardando credenciales en Supabase:', e?.message);
    });
  });

  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect, qr } = update;
    lastEventAt = new Date().toISOString();

    if (qr) {
      try {
        currentQrDataUrl = await QRCode.toDataURL(qr, {
          margin: 2,
          width: 320,
          color: {
            dark: '#0F172A',
            light: '#FFFFFF',
          },
        });
        connectionState = 'QR_READY';
        lastError = null;
      } catch (qrErr: any) {
        lastError = qrErr?.message || 'Error al generar imagen QR';
      }
    }

    if (connection === 'open') {
      connectionState = 'CONNECTED';
      currentQrDataUrl = null;
      currentPairingCode = null;
      lastError = null;
      const rawId = sock.user?.id || '';
      connectedPhone = cleanDigits(rawId.split(':')[0]?.split('@')[0]);
      connectedName = sock.user?.name || 'WhatsApp Conectado';
      console.log(`[Baileys] Conectado exitosamente como ${connectedPhone} (${connectedName})`);
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = !manuallyDisconnected && statusCode !== DisconnectReason.loggedOut;

      if (activeSocket === sock) {
        activeSocket = null;
      }
      currentQrDataUrl = null;

      if (manuallyDisconnected) {
        connectionState = 'DISCONNECTED';
        connectedPhone = null;
        connectedName = null;
        lastError = null;
        return;
      }

      if (statusCode === DisconnectReason.loggedOut) {
        connectionState = 'DISCONNECTED';
        connectedPhone = null;
        connectedName = null;
        lastError = 'Sesión cerrada desde WhatsApp. Escaneá un nuevo código QR para vincular.';
        await freshAuth.clearAuth().catch(() => {});
      } else if (shouldReconnect) {
        connectionState = 'CONNECTING';
        lastError = `Reconectando con WhatsApp (código ${statusCode || 'red'})...`;
        reconnectTimer = setTimeout(() => {
          startBaileysConnection().catch(() => {});
        }, 4000);
      } else {
        connectionState = 'DISCONNECTED';
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
    const config = await loadBaileysConfigFromSupabase();

    for (const msg of messages) {
      try {
        if (!msg.message || !msg.key?.id) continue;
        if (processedMessageIds.has(msg.key.id)) continue;

        // Allow 'notify' always, or 'append' only for fresh messages (< 3 min old) received right during reconnect
        if (type !== 'notify') {
          const ts = Number(msg.messageTimestamp || 0);
          const ageSec = ts > 0 ? Math.floor(Date.now() / 1000) - ts : 999999;
          if (ageSec > 180) continue;
        }

        const remoteJid = msg.key.remoteJid || '';
        if (remoteJid === 'status@broadcast') continue;

        const innerMessage = unwrapWaMessage(msg.message);
        const audioMsg =
          innerMessage?.audioMessage ||
          (innerMessage?.documentMessage?.mimetype?.startsWith('audio/')
            ? innerMessage.documentMessage
            : null);
        const textMsg =
          innerMessage?.conversation ||
          innerMessage?.extendedTextMessage?.text ||
          '';

        if (!audioMsg && !textMsg) continue;

        const fromMe = Boolean(msg.key.fromMe);
        if (
          textMsg &&
          (textMsg.startsWith('✅ *Audio') ||
            textMsg.startsWith('✅ *Esquema') ||
            textMsg.startsWith('*PROGRAMACIÓN DEL DÍA'))
        ) {
          continue;
        }

        const senderPhone = await resolveSenderPhoneDigits(sock, msg);
        console.log(
          `[Baileys] Mensaje entrante (${type}) de jid=${remoteJid} alt=${
            msg.key.remoteJidAlt || msg.key.participantAlt || '-'
          } -> phone=${senderPhone}, fromMe=${fromMe}, audio=${Boolean(audioMsg)}, text=${Boolean(textMsg)}`
        );

        if (!isSenderAuthorized(senderPhone, fromMe, config)) {
          console.warn(
            `[Baileys] Remitente ${senderPhone || remoteJid} no autorizado. Lista actual: ${JSON.stringify(
              config.authorizedPhones
            )}`
          );
          continue;
        }

        if (audioMsg && config.autoProcessAudios) {
          processedMessageIds.add(msg.key.id);
          console.log(`[Baileys] Audio recibido de ${senderPhone || remoteJid}, descargando y procesando...`);

          const buffer = (await downloadMediaMessage(
            msg,
            'buffer',
            {},
            {
              logger: silentLogger,
              reuploadRequest: sock.updateMediaMessage,
            }
          )) as Buffer;

          const mimeType = audioMsg.mimetype || 'audio/ogg; codecs=opus';
          const senderName = msg.pushName || (fromMe ? 'Propio (WhatsApp)' : `WhatsApp +${senderPhone}`);

          const result = await processAudioOrTextToSchedule({
            origen: 'WHATSAPP_BAILEYS',
            audioBuffer: buffer,
            mimeType,
            senderJid: remoteJid,
            senderPhone,
            senderName,
          });

          if (config.autoReplySummary && activeSocket) {
            const summaryText =
              result.audioLog.detectedCount > 0
                ? `✅ *Audio procesado en La Hormiga ERP (${result.audioLog.detectedCount} novedades)*\n` +
                  `📝 _"${result.audioLog.transcripcion}"_\n\n` +
                  formatScheduleForWhatsAppText(result.schedule)
                : `📥 *Audio recibido y guardado en La Hormiga ERP (${result.schedule.fecha})*\n` +
                  `⚠️ El servidor aún no tiene configurada *GEMINI_API_KEY* (en _Settings > Secrets_) para transcribir automáticamente notas de voz.\n` +
                  `👉 Podés escucharlo y aplicarlo desde la Bandeja web, o responder acá con *!programacion* seguido del detalle (ej: _!programacion neftali esta con la kobelco en obra roca_).`;
            await activeSocket.sendMessage(remoteJid, { text: summaryText });
          }
        } else if (
          textMsg &&
          (config.autoProcessTexts || /^(!programacion|#programacion|programacion:)/i.test(textMsg.trim()))
        ) {
          processedMessageIds.add(msg.key.id);
          const cleanInstruction = textMsg
            .trim()
            .replace(/^(!programacion|#programacion|programacion:)\s*/i, '')
            .trim();
          if (!cleanInstruction) continue;

          const senderName = msg.pushName || (fromMe ? 'Propio (WhatsApp)' : `WhatsApp +${senderPhone}`);
          const result = await processAudioOrTextToSchedule({
            origen: 'TEXTO',
            textInstruction: cleanInstruction,
            senderJid: remoteJid,
            senderPhone,
            senderName,
          });

          if (config.autoReplySummary && activeSocket) {
            const summaryText =
              `✅ *Esquema actualizado en La Hormiga ERP*\n\n` +
              formatScheduleForWhatsAppText(result.schedule);
            await activeSocket.sendMessage(remoteJid, { text: summaryText });
          }
        }
      } catch (msgErr: any) {
        console.error('[Baileys] Error procesando mensaje entrante:', msgErr?.message || msgErr);
      }
    }
  });

  return getBaileysStatus();
}

export async function disconnectBaileysSession(clearCredentials: boolean = true): Promise<BaileysConnectionStatus> {
  manuallyDisconnected = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const sockToClose = activeSocket;
  activeSocket = null;
  try {
    if (sockToClose) {
      if (clearCredentials) {
        await sockToClose.logout().catch(() => {});
      }
      sockToClose.end(undefined);
    }
  } catch {}

  if (clearCredentials) {
    try {
      const auth = await useSupabaseBaileysAuthState();
      await auth.clearAuth();
    } catch {}
  }

  connectionState = 'DISCONNECTED';
  currentQrDataUrl = null;
  currentPairingCode = null;
  connectedPhone = null;
  connectedName = null;
  lastError = null;
  lastEventAt = new Date().toISOString();
  return getBaileysStatus();
}

export async function sendWhatsAppMessageViaBaileys(
  targetPhoneOrJid: string,
  text: string
): Promise<{ success: boolean; jid?: string; error?: string }> {
  if (!activeSocket || connectionState !== 'CONNECTED') {
    return {
      success: false,
      error: 'WhatsApp Baileys no está conectado en este momento. Vinculá el QR primero.',
    };
  }
  const jid = targetPhoneOrJid.includes('@')
    ? targetPhoneOrJid
    : `${cleanDigits(targetPhoneOrJid)}@s.whatsapp.net`;

  if (!jid || jid === '@s.whatsapp.net') {
    return { success: false, error: 'Número de teléfono de destino inválido.' };
  }

  try {
    await activeSocket.sendMessage(jid, { text });
    return { success: true, jid };
  } catch (err: any) {
    return { success: false, error: err?.message || 'No se pudo enviar el mensaje por WhatsApp.' };
  }
}

export async function autoResumeBaileysSessionIfStored(): Promise<void> {
  try {
    const pool = getDbPool();
    if (!pool) return;
    const res = await pool.query('SELECT key FROM system_settings WHERE key = $1 LIMIT 1;', [CREDS_KEY]);
    if (res.rows.length > 0) {
      console.log('[Baileys] Credenciales previas detectadas en Supabase. Reanudando conexión WhatsApp...');
      await startBaileysConnection();
    }
  } catch (err: any) {
    console.warn('[Baileys] No se pudo reanudar sesión automática:', err?.message);
  }
}
