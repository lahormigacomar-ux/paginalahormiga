/**
 * Servicio de Integración en Tiempo Real con Supabase (Asistencia & Nómina)
 * Fuente de verdad exclusiva: Supabase REST sin cachés en localStorage ni IndexedDB.
 */

import {
  SupabaseRegistro,
  SupabaseUsuario,
  SupabaseLicencia,
  SupabaseSector,
  SupabaseEmpresa,
  SupabaseCategoria,
  Employee
} from '../types';

export const SUPABASE_URL = 'https://vnavitagxxtlmdguaabm.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_UwKWw6w28iRiGvbRD5NOPg_5ccD5zF9';

const HEADERS: HeadersInit = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

/**
 * Obtener listado de registros / fichadas desde Supabase
 * Por defecto trae los últimos 60 días (máx. 1200 filas) para evitar alto consumo de Egress,
 * o el histórico completo cuando se pasa un límite numérico explícito (ej: 4000).
 */
export async function fetchSupabaseRegistros(
  options: number | { limit?: number; daysBack?: number | null } = { daysBack: 60, limit: 1200 }
): Promise<SupabaseRegistro[]> {
  const limit = typeof options === 'number' ? options : (options.limit ?? 1200);
  const daysBack = typeof options === 'number' ? null : (options.daysBack ?? 60);

  let dateFilter = '';
  if (typeof daysBack === 'number' && daysBack > 0) {
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    dateFilter = `&fecha=gte.${encodeURIComponent(sinceDate)}`;
  }

  const url = `${SUPABASE_URL}/rest/v1/registros?order=fecha.desc${dateFilter}&limit=${limit}`;
  const res = await fetch(url, { headers: HEADERS });

  if (!res.ok) {
    throw new Error(`Error al consultar fichadas en Supabase: ${res.status} ${res.statusText}`);
  }

  const data: SupabaseRegistro[] = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Obtener registros / fichadas de Supabase para un rango de fechas específico (YYYY-MM-DD a YYYY-MM-DD)
 * y opcionalmente filtrado por usuario_id. Agrega ±1 día de margen por zona horaria (ART UTC-3).
 */
export async function fetchSupabaseRegistrosByDateRange(
  startDate: string,
  endDate: string,
  usuarioId?: string,
  limit = 2000
): Promise<SupabaseRegistro[]> {
  if (!startDate || !endDate) return [];
  const dStart = startDate <= endDate ? startDate : endDate;
  const dEnd = startDate <= endDate ? endDate : startDate;

  // Margen de 1 día antes y 1 día después para no perder fichadas por huso horario UTC-3
  const startObj = new Date(`${dStart}T00:00:00Z`);
  startObj.setUTCDate(startObj.getUTCDate() - 1);
  const endObj = new Date(`${dEnd}T23:59:59.999Z`);
  endObj.setUTCDate(endObj.getUTCDate() + 1);

  const params = [
    'order=fecha.asc',
    `fecha=gte.${encodeURIComponent(startObj.toISOString())}`,
    `fecha=lte.${encodeURIComponent(endObj.toISOString())}`,
    `limit=${limit}`,
  ];
  if (usuarioId) {
    params.push(`usuario_id=eq.${encodeURIComponent(usuarioId)}`);
  }

  const url = `${SUPABASE_URL}/rest/v1/registros?${params.join('&')}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Error al consultar marcaciones por rango: ${res.status} ${res.statusText}`);
  }
  const data: SupabaseRegistro[] = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Obtener nómina de usuarios desde Supabase
 */
export async function fetchSupabaseUsuarios(): Promise<SupabaseUsuario[]> {
  const url = `${SUPABASE_URL}/rest/v1/usuarios?order=nombre.asc`;
  const res = await fetch(url, { headers: HEADERS });

  if (!res.ok) {
    throw new Error(`Error al consultar usuarios en Supabase: ${res.status} ${res.statusText}`);
  }

  const data: SupabaseUsuario[] = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Obtener licencias de Supabase
 */
export async function fetchSupabaseLicencias(): Promise<SupabaseLicencia[]> {
  const url = `${SUPABASE_URL}/rest/v1/licencias?order=fecha_inicio.desc`;
  const res = await fetch(url, { headers: HEADERS });

  if (!res.ok) {
    throw new Error(`Error al consultar licencias en Supabase: ${res.status} ${res.statusText}`);
  }

  const data: SupabaseLicencia[] = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Obtener sectores de Supabase
 */
export async function fetchSupabaseSectores(): Promise<SupabaseSector[]> {
  const url = `${SUPABASE_URL}/rest/v1/sectores?order=id.asc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Error al consultar sectores en Supabase: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Obtener empresas de Supabase
 */
export async function fetchSupabaseEmpresas(): Promise<SupabaseEmpresa[]> {
  const url = `${SUPABASE_URL}/rest/v1/empresas?order=id.asc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Error al consultar empresas en Supabase: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Obtener categorías de Supabase
 */
export async function fetchSupabaseCategorias(): Promise<SupabaseCategoria[]> {
  const url = `${SUPABASE_URL}/rest/v1/categorias?order=id.asc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Error al consultar categorías en Supabase: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Registrar una nueva Fichada (Entrada o Salida) en Supabase
 */
export async function createSupabaseRegistro(data: {
  usuario_id: string;
  tipo: 'Entrada' | 'Salida';
  observacion?: string | null;
  fecha?: string;
}): Promise<SupabaseRegistro> {
  const payload = {
    usuario_id: data.usuario_id,
    tipo: data.tipo,
    fecha: data.fecha || new Date().toISOString(),
    observacion: data.observacion || null
  };

  const url = `${SUPABASE_URL}/rest/v1/registros`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al registrar fichada en Supabase: ${errText || res.statusText}`);
  }

  const result = await res.json();
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Actualizar una Fichada existente en Supabase
 */
export async function updateSupabaseRegistro(id: number, data: Partial<SupabaseRegistro>): Promise<SupabaseRegistro> {
  const url = `${SUPABASE_URL}/rest/v1/registros?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...HEADERS,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al actualizar fichada en Supabase: ${errText || res.statusText}`);
  }

  const result = await res.json();
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Eliminar una Fichada en Supabase
 */
export async function deleteSupabaseRegistro(id: number): Promise<boolean> {
  const url = `${SUPABASE_URL}/rest/v1/registros?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: HEADERS
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al eliminar fichada en Supabase: ${errText || res.statusText}`);
  }

  return true;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Crear o vincular un nuevo usuario en Supabase
 */
export async function createSupabaseUsuario(usuario: Partial<SupabaseUsuario>): Promise<SupabaseUsuario> {
  const isUuid = usuario.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuario.id);
  const payload = {
    ...usuario,
    id: isUuid ? usuario.id : generateUUID()
  };

  const url = `${SUPABASE_URL}/rest/v1/usuarios`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al crear usuario en Supabase: ${errText || res.statusText}`);
  }

  const result = await res.json();
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Actualizar un usuario existente en Supabase (por ID o legajo)
 */
export async function updateSupabaseUsuario(
  identifier: { id?: string; legajo?: string },
  data: Partial<SupabaseUsuario>
): Promise<SupabaseUsuario | null> {
  const rawId = (identifier.id || '').trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
  let queryParam = '';
  if (isUuid) {
    queryParam = `id=eq.${encodeURIComponent(rawId.toLowerCase())}`;
  } else if (identifier.legajo) {
    const cleanDigits = identifier.legajo.replace(/\D/g, '');
    if (cleanDigits) {
      queryParam = `legajo=eq.${encodeURIComponent(cleanDigits)}`;
    }
  }
  if (!queryParam) return null;

  const url = `${SUPABASE_URL}/rest/v1/usuarios?${queryParam}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...HEADERS,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al actualizar usuario en Supabase: ${errText || res.statusText}`);
  }

  const result = await res.json();
  if (Array.isArray(result)) {
    return result[0] || null;
  }
  return result || null;
}

/**
 * Eliminar usuario en Supabase (por ID o legajo)
 */
export async function deleteSupabaseUsuario(id: string, legajo?: string, _nombre?: string): Promise<boolean> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  let queryParam = `id=eq.${encodeURIComponent(id)}`;
  if (!isUuid && legajo) {
    const cleanDigits = legajo.replace(/\D/g, '');
    queryParam = `legajo=eq.${encodeURIComponent(cleanDigits || legajo)}`;
  }
  const url = `${SUPABASE_URL}/rest/v1/usuarios?${queryParam}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: HEADERS
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al eliminar usuario en Supabase: ${errText || res.statusText}`);
  }
  return true;
}

function normalizeEmployeeName(rawName?: string | null): string {
  return (rawName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function extractLegajoDigits(rawLegajo?: string | null): string {
  const digits = (rawLegajo || '').replace(/\D/g, '');
  return digits.length > 0 ? digits.padStart(4, '0') : '';
}

/**
 * Genera una clave única priorizando ID (case-insensitive), luego legajo y por último nombre normalizado.
 */
export function getCanonicalEmployeeKey(item: {
  id?: string;
  legajo?: string | null;
  nombreApellido?: string | null;
  nombre?: string | null;
  codigoEmpleado?: string | null;
}): string {
  const rawId = (item.id || '').trim();
  if (rawId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) {
    return `id:${rawId.toLowerCase()}`;
  }

  const legDigits = extractLegajoDigits(item.legajo || item.codigoEmpleado);
  if (legDigits.length > 0) {
    return `legajo:${legDigits}`;
  }

  const normalized = normalizeEmployeeName(item.nombreApellido || item.nombre);
  if (normalized.length > 2) {
    return `name:${normalized}`;
  }

  return `id:${rawId.toLowerCase() || Math.random().toString(36).slice(2)}`;
}

/**
 * Convertir y sincronizar usuarios de Supabase a la nómina de empleados en memoria
 * Conserva todas las filas reales por ID exacto en `drivers`, y vincula usuarios de Supabase
 * priorizando ID (case-insensitive) -> legajo -> nombre, evitando duplicados al renombrar.
 */
export function convertSupabaseUsersToEmployees(
  supabaseUsers: SupabaseUsuario[],
  currentEmployees: Employee[] = []
): Employee[] {
  const employeeMap = new Map<string, Employee>();
  const idLowerIndex = new Map<string, string>();
  const legajoIndex = new Map<string, string>();
  const nameIndex = new Map<string, string>();

  currentEmployees.forEach(emp => {
    if (!emp || !emp.id) return;
    const mapKey = emp.id;
    const isArchived = Boolean(emp.archivado);

    if (!employeeMap.has(mapKey)) {
      employeeMap.set(mapKey, { ...emp });
    } else {
      const existing = employeeMap.get(mapKey)!;
      const mergedArchived = Boolean(isArchived || existing.archivado);
      employeeMap.set(mapKey, {
        ...existing,
        ...emp,
        archivado: mergedArchived,
        fechaArchivado: emp.fechaArchivado || existing.fechaArchivado,
        estado: mergedArchived ? 'INACTIVO' : (emp.estado || existing.estado),
        mostrarEnAsistencia: mergedArchived
          ? false
          : emp.mostrarEnAsistencia !== undefined
          ? emp.mostrarEnAsistencia
          : existing.mostrarEnAsistencia !== undefined
          ? existing.mostrarEnAsistencia
          : true,
      });
    }

    const idLower = emp.id.trim().toLowerCase();
    // Si hay dos filas con el mismo UUID en distinto case (ej: viejo lowercase y duplicado uppercase),
    // indexar preferentemente el UUID en minúsculas (original de Supabase) para el vínculo con `usuarios`.
    const prevIdTarget = idLowerIndex.get(idLower);
    if (!prevIdTarget || (emp.id === idLower && prevIdTarget !== idLower)) {
      idLowerIndex.set(idLower, mapKey);
    }

    const legDigits = extractLegajoDigits(emp.legajo || emp.codigoEmpleado);
    if (legDigits && (!legajoIndex.has(legDigits) || emp.id === idLower)) {
      legajoIndex.set(legDigits, mapKey);
    }

    const normName = normalizeEmployeeName(emp.nombreApellido);
    if (normName.length > 2 && !nameIndex.has(normName)) {
      nameIndex.set(normName, mapKey);
    }
  });

  if (Array.isArray(supabaseUsers) && supabaseUsers.length > 0) {
    supabaseUsers.forEach((user) => {
      if (!user) return;
      const userIdLower = (user.id || '').trim().toLowerCase();
      const userLegDigits = extractLegajoDigits(user.legajo);
      const userNormName = normalizeEmployeeName(user.nombre);

      const cleanLegDigits = user.legajo ? user.legajo.replace(/\D/g, '').padStart(4, '0') : null;
      const cleanLegajo = cleanLegDigits ? `LEG-${cleanLegDigits}` : undefined;
      const cleanCodigo = cleanLegDigits ? `EMP-${cleanLegDigits}` : undefined;

      const matchedKey =
        (userIdLower && idLowerIndex.get(userIdLower)) ||
        (userLegDigits && legajoIndex.get(userLegDigits)) ||
        (userNormName.length > 2 && nameIndex.get(userNormName)) ||
        null;

      if (matchedKey && employeeMap.has(matchedKey)) {
        const existing = employeeMap.get(matchedKey)!;
        const isArchived = Boolean(existing.archivado);
        employeeMap.set(matchedKey, {
          ...existing,
          id: existing.id || user.id,
          // Respetar siempre el nombre editado en `drivers` si ya existe
          nombreApellido: existing.nombreApellido || user.nombre,
          legajo: existing.legajo || cleanLegajo,
          codigoEmpleado: existing.codigoEmpleado || cleanCodigo,
          sector: existing.sector || user.sector,
          email: existing.email || user.email,
          archivado: isArchived,
          fechaArchivado: existing.fechaArchivado,
          estado: isArchived ? 'INACTIVO' : existing.estado,
          mostrarEnAsistencia: isArchived
            ? false
            : existing.mostrarEnAsistencia !== undefined
            ? existing.mostrarEnAsistencia
            : true,
        });
      } else {
        const newKey = user.id || `usr-${Math.random().toString(36).slice(2)}`;
        const newEmployee: Employee = {
          id: user.id,
          codigoEmpleado: cleanCodigo || `EMP-${user.id.slice(0, 5)}`,
          nombreApellido: user.nombre,
          legajo: cleanLegajo || `LEG-${user.id.slice(0, 4)}`,
          categoria: user.sector ? `${user.sector} (${user.empresa || 'La Hormiga'})` : 'Operario / Chofer',
          foto: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80`,
          sector: user.sector || 'Choferes',
          obra: user.empresa ? `Base ${user.empresa}` : 'Base Central - La Hormiga',
          estado: user.aprobado !== false ? 'ACTIVO' : 'INACTIVO',
          email: user.email || undefined,
          mostrarEnAsistencia: true,
          observaciones: `Sincronizado desde Supabase. Empresa: ${user.empresa || 'N/A'}`
        };
        employeeMap.set(newKey, newEmployee);
        if (userIdLower) idLowerIndex.set(userIdLower, newKey);
        if (userLegDigits) legajoIndex.set(userLegDigits, newKey);
        if (userNormName.length > 2) nameIndex.set(userNormName, newKey);
      }
    });
  }

  return Array.from(employeeMap.values());
}

/**
 * Sincroniza empleados que no existan aún en Supabase hacia la tabla `usuarios`
 */
export async function syncLocalEmployeesToSupabase(
  employees: Employee[],
  supabaseUsers: SupabaseUsuario[]
): Promise<SupabaseUsuario[]> {
  const createdUsers: SupabaseUsuario[] = [];

  const existingIds = new Set<string>();
  const existingLegajos = new Set<string>();
  const existingNames = new Set<string>();

  (supabaseUsers || []).forEach(u => {
    if (!u) return;
    if (u.id) existingIds.add(u.id.trim().toLowerCase());
    const leg = extractLegajoDigits(u.legajo);
    if (leg) existingLegajos.add(leg);
    const nm = normalizeEmployeeName(u.nombre);
    if (nm.length > 2) existingNames.add(nm);
  });

  for (const emp of employees) {
    if (!emp || !emp.nombreApellido) continue;
    const empIdLower = (emp.id || '').trim().toLowerCase();
    const empLeg = extractLegajoDigits(emp.legajo || emp.codigoEmpleado);
    const empName = normalizeEmployeeName(emp.nombreApellido);

    const alreadyInSupabase =
      (empIdLower && existingIds.has(empIdLower)) ||
      (empLeg && existingLegajos.has(empLeg)) ||
      (empName.length > 2 && existingNames.has(empName));

    if (!alreadyInSupabase) {
      try {
        const cleanLegDigits = (emp.legajo || emp.codigoEmpleado || '').replace(/\D/g, '') || Math.floor(1000 + Math.random() * 9000).toString();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(emp.id || '');
        const payload: Partial<SupabaseUsuario> = {
          ...(isUuid ? { id: emp.id.trim().toLowerCase() } : {}),
          nombre: emp.nombreApellido,
          legajo: cleanLegDigits,
          sector: emp.sector || 'Choferes',
          empresa: emp.obra?.includes('Hornocal') ? 'EL HORNOCAL SRL' : 'LA HORMIGA',
          aprobado: emp.estado !== 'INACTIVO',
          email: emp.email || `${emp.nombreApellido.toLowerCase().replace(/[^a-z0-9]/g, '.')}@lahormiga.com`
        };

        const created = await createSupabaseUsuario(payload);
        if (created) {
          createdUsers.push(created);
          if (created.id) existingIds.add(created.id.trim().toLowerCase());
          const createdLeg = extractLegajoDigits(created.legajo);
          if (createdLeg) existingLegajos.add(createdLeg);
          const createdName = normalizeEmployeeName(created.nombre);
          if (createdName.length > 2) existingNames.add(createdName);
        }
      } catch (err) {
        console.warn(`No se pudo crear empleado ${emp.nombreApellido} en Supabase:`, err);
      }
    }
  }

  return createdUsers;
}

