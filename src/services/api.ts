import { optimizeImage, OptimizeOptions } from './imageOptimizer';

export interface DbStatusResponse {
  supabaseDb?: {
    configured: boolean;
    connected: boolean;
    message: string;
    version?: string;
  };
  cockroachDb: {
    configured: boolean;
    connected: boolean;
    message: string;
    version?: string;
  };
  cloudflareR2: {
    configured: boolean;
    bucket: string | null;
    publicUrl: string | null;
    message: string;
  };
}

export async function checkSystemStatus(): Promise<DbStatusResponse> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('Status endpoint error');
    return await res.json();
  } catch (err: any) {
    return {
      supabaseDb: {
        configured: false,
        connected: false,
        message: 'Servidor backend o conexión no disponible',
      },
      cockroachDb: {
        configured: false,
        connected: false,
        message: 'Servidor backend o conexión no disponible',
      },
      cloudflareR2: {
        configured: false,
        bucket: null,
        publicUrl: null,
        message: 'Servidor backend o conexión no disponible',
      },
    };
  }
}

// Upload image to Cloudflare R2 with automatic browser-side optimization (WebP, resizing & compression)
export async function uploadImageToCloudflareR2(
  imageInput: File | Blob | string,
  fileName: string = 'foto.jpg',
  contentType: string = 'image/jpeg',
  optimizeOptions?: OptimizeOptions,
  folder: string = 'uploads'
): Promise<{ 
  success: boolean; 
  url?: string; 
  optimizedSizeKB?: number; 
  originalSizeKB?: number; 
  reductionPercentage?: number;
  error?: string 
}> {
  try {
    let base64ToSend = typeof imageInput === 'string' ? imageInput : '';
    let targetFileName = fileName;
    let targetContentType = contentType;
    let originalSizeKB: number | undefined;
    let optimizedSizeKB: number | undefined;
    let reductionPercentage: number | undefined;

    // Automatic Client-Side Optimization (WebP + Dimensions + Quality)
    try {
      const optimized = await optimizeImage(imageInput, {
        fileName,
        maxWidth: optimizeOptions?.maxWidth ?? 1280,
        maxHeight: optimizeOptions?.maxHeight ?? 1280,
        quality: optimizeOptions?.quality ?? 0.78,
        format: optimizeOptions?.format ?? 'image/webp',
      });
      base64ToSend = optimized.base64;
      targetFileName = optimized.fileName;
      targetContentType = optimized.contentType;
      originalSizeKB = optimized.originalSizeKB;
      optimizedSizeKB = optimized.optimizedSizeKB;
      reductionPercentage = optimized.reductionPercentage;
      console.log(`[Optimizador R2] ${fileName}: ${originalSizeKB}KB -> ${optimizedSizeKB}KB (-${optimized.reductionPercentage}%)`);
    } catch (optErr) {
      console.warn('[Optimizador R2] Fallback al original:', optErr);
      if (!base64ToSend && typeof imageInput !== 'string') {
        base64ToSend = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(imageInput as Blob);
        });
      }
    }

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        imageBase64: base64ToSend, 
        fileName: targetFileName, 
        contentType: targetContentType,
        folder
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error al subir imagen a R2');
    }

    return { 
      success: true, 
      url: data.url,
      originalSizeKB,
      optimizedSizeKB,
      reductionPercentage
    };
  } catch (error: any) {
    console.error('Error subiendo imagen a R2:', error);
    return { success: false, error: error.message || 'Error en la subida' };
  }
}

export async function uploadPreoptimizedImageToCloudflareR2(
  base64DataUrl: string,
  fileName: string,
  contentType: string = 'image/webp',
  folder: string = 'uploads'
): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64DataUrl,
        fileName,
        contentType,
        folder,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      throw new Error(data?.error || 'Error al subir imagen optimizada a R2');
    }
    return { success: true, url: data.url };
  } catch (error: any) {
    console.error('Error subiendo imagen pre-optimizada a R2:', error);
    return { success: false, error: error?.message || 'Error en la subida' };
  }
}

// Universal Cloudflare R2 uploader for PDFs, Documents, and Images (never stores base64 in Supabase)
export async function uploadFileToCloudflareR2(
  fileInput: File | Blob,
  fileName?: string,
  contentType?: string,
  folder: string = 'uploads',
  optimizeOptions?: OptimizeOptions
): Promise<{
  success: boolean;
  url?: string;
  key?: string;
  originalSizeKB?: number;
  optimizedSizeKB?: number;
  reductionPercentage?: number;
  error?: string;
}> {
  try {
    const targetName = fileName || (fileInput instanceof File ? fileInput.name : 'archivo');
    const targetMime = contentType || fileInput.type || 'application/octet-stream';
    const rawSizeKB = Math.max(1, Math.round(fileInput.size / 1024));

    // Raster images get WebP optimization; PDFs and other docs upload raw bytes to R2
    if (
      targetMime.startsWith('image/') &&
      !targetMime.includes('svg') &&
      !targetMime.includes('gif')
    ) {
      const optRes = await uploadImageToCloudflareR2(
        fileInput,
        targetName,
        targetMime,
        optimizeOptions,
        folder
      );
      if (optRes.success && optRes.url) {
        return {
          success: true,
          url: optRes.url,
          originalSizeKB: optRes.originalSizeKB ?? rawSizeKB,
          optimizedSizeKB: optRes.optimizedSizeKB,
          reductionPercentage: optRes.reductionPercentage,
        };
      }
      return { success: false, error: optRes.error || 'Error al subir imagen a Cloudflare R2' };
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado'));
      reader.readAsDataURL(fileInput);
    });

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64: dataUrl,
        fileName: targetName,
        contentType: targetMime,
        folder,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success || !data?.url) {
      throw new Error(data?.error || `Error (${res.status}) al subir archivo a Cloudflare R2`);
    }

    return {
      success: true,
      url: data.url,
      key: data.key,
      originalSizeKB: rawSizeKB,
      optimizedSizeKB: rawSizeKB,
      reductionPercentage: 0,
    };
  } catch (error: any) {
    console.error('Error subiendo archivo a R2:', error);
    return { success: false, error: error?.message || 'Error al subir archivo a Cloudflare R2' };
  }
}

// Generic API CRUD
export async function apiFetchCollection<T>(endpoint: string): Promise<T[] | null> {
  try {
    const res = await fetch(`/api/${endpoint}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function apiSaveItems<T>(endpoint: string, items: T[] | T): Promise<boolean> {
  try {
    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function apiDeleteItem(endpoint: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/${endpoint}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function apiClearCollection(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/${endpoint}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function apiSaveItemsStrict<T>(
  endpoint: string,
  items: T[] | T
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/${endpoint}?strict=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-strict-supabase': '1',
      },
      body: JSON.stringify(items),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || `Error (${res.status}) confirmando guardado en Supabase`,
      };
    }
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Error de conexión con el servidor al guardar en Supabase',
    };
  }
}

export async function apiDeleteItemStrict(
  endpoint: string,
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/${endpoint}/${encodeURIComponent(id)}?strict=1`, {
      method: 'DELETE',
      headers: { 'x-strict-supabase': '1' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || `Error (${res.status}) confirmando eliminación en Supabase`,
      };
    }
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Error de conexión con el servidor al eliminar en Supabase',
    };
  }
}

export async function apiClearCollectionStrict(
  endpoint: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/${endpoint}?strict=1`, {
      method: 'DELETE',
      headers: { 'x-strict-supabase': '1' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || `Error (${res.status}) confirmando limpieza en Supabase`,
      };
    }
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Error de conexión con el servidor al limpiar en Supabase',
    };
  }
}

export async function apiSyncSupabaseStrict<T>(
  tableName: 'fuel_vouchers' | 'issued_vouchers' | 'partes_diarios' | 'vehicle_expenses',
  items: T[],
  mode: 'merge' | 'replace' = 'merge'
): Promise<{ ok: boolean; items?: T[]; count?: number; error?: string }> {
  try {
    const res = await fetch(`/api/supabase-sync/${tableName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, mode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || `Error (${res.status}) confirmando sincronización en Supabase`,
      };
    }
    return {
      ok: true,
      items: Array.isArray(data.items) ? data.items : items,
      count: data.count ?? items.length,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Error de red confirmando sincronización en Supabase',
    };
  }
}

export async function apiSyncCollection<T>(endpoint: string, items: T[]): Promise<boolean> {
  try {
    const res = await fetch(`/api/${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function apiSyncCollectionStrict<T>(
  endpoint: string,
  items: T[],
  options?: { replace?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-strict-supabase': '1',
    };
    if (options?.replace) {
      headers['x-allow-replace'] = '1';
    }
    const res = await fetch(`/api/${endpoint}?strict=1${options?.replace ? '&replace=1' : ''}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(items),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || `Error (${res.status}) confirmando sincronización en Supabase`,
      };
    }
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Error de conexión con el servidor al sincronizar con Supabase',
    };
  }
}

// System Settings API (Supabase PostgreSQL)
export async function apiFetchSetting<T>(key: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/settings/${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[API] Error fetching setting ${key}:`, err);
    return null;
  }
}

export async function apiSaveSetting<T>(key: string, value: T): Promise<boolean> {
  const res = await apiSaveSettingStrict(key, value);
  return res.ok;
}

export async function apiSaveSettingStrict<T>(
  key: string,
  value: T
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || `Error (${res.status}) confirmando configuración '${key}' en Supabase`,
      };
    }
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || `Error de red al guardar '${key}' en Supabase`,
    };
  }
}

export type AiAnalyzableDocType =
  | 'PARTE_DIARIO'
  | 'COMBUSTIBLE'
  | 'VALE_COMBUSTIBLE'
  | 'FACTURA'
  | 'REMITO';

export interface AiDocumentAnalyzeContext {
  vehicles?: Array<{ codigo?: string; modeloMarca?: string; patente?: string }>;
  drivers?: Array<{ codigo?: string; legajo?: string; nombreApellido?: string }>;
  obras?: Array<{ codigo?: string; nombreObra?: string; ubicacion?: string }>;
  proveedores?: Array<{ id?: string; razonSocial?: string; cuit?: string }>;
  deposits?: Array<{ id?: string; nombre?: string; empresaBandera?: string; numEstacion?: string }>;
}

export async function apiAnalyzeDocumentWithAI(params: {
  documentType: AiAnalyzableDocType;
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  context?: AiDocumentAnalyzeContext;
}): Promise<{
  success: boolean;
  documentType?: AiAnalyzableDocType;
  data?: Record<string, any>;
  model?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/documents/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      return {
        success: false,
        error: json?.error || `Error (${res.status}) al analizar el documento con IA`,
      };
    }
    return {
      success: true,
      documentType: json.documentType,
      data: json.data || {},
      model: json.model,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Error de conexión con el servidor de análisis IA',
    };
  }
}

export interface DbTableAuditEntry {
  tableName: string;
  rowCount: number;
  dataBytes: number;
  totalBytes: number;
  base64Rows: number;
  base64Bytes: number;
}

export interface DbSettingAuditEntry {
  key: string;
  bytes: number;
  hasBase64: boolean;
}

export interface DbAuditResponse {
  ok: boolean;
  totalDataBytes: number;
  totalBase64Rows: number;
  totalBase64Bytes: number;
  tables: DbTableAuditEntry[];
  systemSettingsTop: DbSettingAuditEntry[];
  r2Configured: boolean;
  error?: string;
}

export interface MigrateBase64Response {
  ok: boolean;
  migratedRows: number;
  migratedSettings: number;
  freedBytesEstimate: number;
  details: Array<{ target: string; rows: number; savedBytes: number }>;
  error?: string;
}

export async function apiFetchDbAudit(): Promise<DbAuditResponse> {
  try {
    const res = await fetch('/api/db-audit');
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        totalDataBytes: 0,
        totalBase64Rows: 0,
        totalBase64Bytes: 0,
        tables: [],
        systemSettingsTop: [],
        r2Configured: false,
        error: json?.error || `Error (${res.status}) auditando base de datos`,
      };
    }
    return json as DbAuditResponse;
  } catch (err: any) {
    return {
      ok: false,
      totalDataBytes: 0,
      totalBase64Rows: 0,
      totalBase64Bytes: 0,
      tables: [],
      systemSettingsTop: [],
      r2Configured: false,
      error: err?.message || 'Error de red consultando auditoría de base de datos',
    };
  }
}

export async function apiMigrateBase64ToR2(): Promise<MigrateBase64Response> {
  try {
    const res = await fetch('/api/migrate-base64-to-r2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        migratedRows: 0,
        migratedSettings: 0,
        freedBytesEstimate: 0,
        details: [],
        error: json?.error || `Error (${res.status}) migrando archivos Base64 a R2`,
      };
    }
    return json as MigrateBase64Response;
  } catch (err: any) {
    return {
      ok: false,
      migratedRows: 0,
      migratedSettings: 0,
      freedBytesEstimate: 0,
      details: [],
      error: err?.message || 'Error de red migrando archivos a Cloudflare R2',
    };
  }
}
