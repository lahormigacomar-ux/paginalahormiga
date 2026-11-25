import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  parseSheetGridIntoPayrollSlips,
  normalizeEmployeeKey,
  detectWeekNumberFromText,
  classifyPayrollExtraItem,
  type EmployeePayrollSlip,
  type PayrollExtraItem,
} from '../utils/payrollParser';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
export const PUBLIC_LINK_TOKEN = 'PUBLIC_LINK_ACCESS';
export const AUTHORIZED_BRIDGE_ORIGIN =
  'https://ais-pre-uxzpwtzxbvzydews4zg2ut-122189531223.us-east1.run.app';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedUserEmail: string | null = null;

function createSheetsAuthProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  SCOPES.forEach(scope => provider.addScope(scope));
  // Force both account selection AND the consent screen so the user can tick the Google Sheets permission checkbox
  provider.setCustomParameters({
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
  });
  return provider;
}

export async function verifyTokenHasSheetsScope(accessToken: string): Promise<boolean> {
  if (accessToken === PUBLIC_LINK_TOKEN) return true;
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    if (!res.ok) return false;
    const data = await res.json();
    const grantedScopes = String(data?.scope || '');
    return grantedScopes.includes('spreadsheets') || grantedScopes.includes('drive');
  } catch {
    return false;
  }
}

export async function saveSharedGoogleSessionToDb(
  accessToken: string,
  email: string
): Promise<void> {
  if (!accessToken || accessToken === PUBLIC_LINK_TOKEN) return;
  try {
    await fetch('/api/settings/google_sheets_oauth_session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken,
        email: email || 'Cuenta Google',
        obtainedAt: Date.now(),
        updatedAt: new Date().toISOString(),
      }),
    });
  } catch {
    // Non-fatal if saving shared session fails
  }
}

export async function loadSharedGoogleSessionFromDb(
  minObtainedAt: number = 0
): Promise<{ email: string; accessToken: string } | null> {
  try {
    const res = await fetch('/api/settings/google_sheets_oauth_session');
    if (!res.ok) return null;
    const raw = await res.json();
    const data = raw?.value && typeof raw.value === 'object' ? raw.value : raw;
    const token = typeof data?.accessToken === 'string' ? data.accessToken.trim() : '';
    const email = typeof data?.email === 'string' ? data.email.trim() : 'Cuenta Google';
    const obtainedAt = Number(data?.obtainedAt || 0);

    if (!token || token === PUBLIC_LINK_TOKEN) return null;
    if (minObtainedAt > 0 && obtainedAt < minObtainedAt) return null;
    // OAuth access tokens expire after ~3600s (check 54 min window)
    if (obtainedAt > 0 && Date.now() - obtainedAt > 54 * 60 * 1000) {
      return null;
    }

    const valid = await verifyTokenHasSheetsScope(token);
    if (!valid) return null;

    cachedAccessToken = token;
    cachedUserEmail = email;
    return { email, accessToken: token };
  } catch {
    return null;
  }
}

async function openCrossDomainGoogleAuthBridge(): Promise<{
  email: string;
  accessToken: string;
}> {
  const bridgeStartedAt = Date.now() - 2000;
  const bridgeUrl = `${AUTHORIZED_BRIDGE_ORIGIN}/?google_auth_bridge=1&origin=${encodeURIComponent(
    window.location.origin
  )}`;
  const width = 520;
  const height = 650;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

  const popup = window.open(
    bridgeUrl,
    'la_hormiga_google_auth_bridge',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
    };

    const finishSuccess = (accessToken: string, email: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      cachedAccessToken = accessToken;
      cachedUserEmail = email || 'Cuenta Google';
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        // Ignore cross-origin close errors
      }
      resolve({ email: cachedUserEmail, accessToken });
    };

    const finishError = (msg: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(msg));
    };

    const onMessage = (ev: MessageEvent) => {
      const payload = ev.data;
      if (
        payload &&
        typeof payload === 'object' &&
        payload.type === 'LA_HORMIGA_GOOGLE_AUTH_SUCCESS' &&
        typeof payload.accessToken === 'string' &&
        payload.accessToken
      ) {
        finishSuccess(payload.accessToken, payload.email || 'Cuenta Google');
      }
    };

    window.addEventListener('message', onMessage);

    const pollTimer = setInterval(async () => {
      try {
        const shared = await loadSharedGoogleSessionFromDb(bridgeStartedAt);
        if (shared?.accessToken) {
          finishSuccess(shared.accessToken, shared.email);
          return;
        }
        if (popup && popup.closed) {
          // One final check in Supabase in case popup just closed after saving
          const finalCheck = await loadSharedGoogleSessionFromDb(bridgeStartedAt);
          if (finalCheck?.accessToken) {
            finishSuccess(finalCheck.accessToken, finalCheck.email);
          } else {
            finishError(
              `Para usar el login directo en ${window.location.hostname}, autorizá en la ventana puente o agregá "${window.location.hostname}" en Firebase Console → Authentication → Settings → Dominios autorizados (proyecto gen-lang-client-0387747698). También podés compartir tu Google Sheet como "Cualquier persona con el enlace: Lector" para leerlo sin login.`
            );
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 1500);

    const timeoutTimer = setTimeout(() => {
      finishError('Tiempo de espera agotado al conectar con Google.');
    }, 120000);
  });
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      return;
    }
    if (!isSigningIn) {
      const shared = await loadSharedGoogleSessionFromDb();
      if (shared) {
        const pseudoUser = (user || { email: shared.email }) as User;
        if (onAuthSuccess) onAuthSuccess(pseudoUser, shared.accessToken);
        return;
      }
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (options?: {
  forceDirectPopup?: boolean;
}): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const provider = createSheetsAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google Sheets.');
    }

    const hasScope = await verifyTokenHasSheetsScope(credential.accessToken);
    if (!hasScope) {
      cachedAccessToken = null;
      throw new Error(
        'Faltó marcar el permiso de Google Sheets: Cuando se abre la ventana de Google, tenés que TILDAR EL CUADRADITO (casilla) que dice "Ver, editar, crear y eliminar todas tus hojas de cálculo de Google" antes de tocar Continuar.'
      );
    }

    cachedAccessToken = credential.accessToken;
    cachedUserEmail = result.user.email || 'Cuenta Google';
    await saveSharedGoogleSessionToDb(cachedAccessToken, cachedUserEmail);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    const errCode = String(error?.code || '');
    const errMsg = String(error?.message || '');
    const isUnauthorizedDomain =
      errCode.includes('unauthorized-domain') || errMsg.includes('unauthorized-domain');

    if (isUnauthorizedDomain && !options?.forceDirectPopup) {
      // 1. Check if a valid token is already stored in Supabase from a previous session
      const existingShared = await loadSharedGoogleSessionFromDb();
      if (existingShared) {
        return {
          user: { email: existingShared.email } as User,
          accessToken: existingShared.accessToken,
        };
      }
      // 2. Open cross-domain auth bridge on the authorized *.run.app domain
      const bridged = await openCrossDomainGoogleAuthBridge();
      return {
        user: { email: bridged.email } as User,
        accessToken: bridged.accessToken,
      };
    }

    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  const shared = await loadSharedGoogleSessionFromDb();
  return shared?.accessToken || null;
};

export const clearCachedAccessToken = (): void => {
  cachedAccessToken = null;
};

export const getCurrentGoogleUser = (): User | null => {
  if (auth.currentUser) return auth.currentUser;
  if (cachedUserEmail) return { email: cachedUserEmail } as User;
  return null;
};

export const logoutGoogle = async () => {
  try {
    await auth.signOut();
  } catch {
    // Ignore signOut errors
  }
  cachedAccessToken = null;
  cachedUserEmail = null;
  try {
    await fetch('/api/settings/google_sheets_oauth_session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: '', email: '', obtainedAt: 0 }),
    });
  } catch {
    // Ignore
  }
};

export interface SheetTabInfo {
  sheetId: number;
  title: string;
  index: number;
  rowCount?: number;
  columnCount?: number;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: SheetTabInfo[];
}

export interface PayrollSheetsPersistedConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string;
  lastActiveTab?: string;
  connectedEmail?: string;
  updatedAt?: string;
  snapshotsByTab?: Record<
    string,
    {
      headers: string[];
      rows: string[][];
      syncedAt: string;
    }
  >;
}

export const DEFAULT_PAYROLL_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1oBPQWkfY84nyl6MfdXyZFzlZs4PjW-pGPFsu-3A-7-g/edit?usp=drive_link';

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

export async function fetchPublicWorkbookMetadata(
  spreadsheetId: string,
  refresh: boolean = false
): Promise<SpreadsheetMetadata> {
  const res = await fetch(
    `/api/sheets/public-workbook?spreadsheetId=${encodeURIComponent(spreadsheetId)}${
      refresh ? '&refresh=1' : ''
    }`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(
      data?.error ||
        'La planilla requiere autorización de Google o compartirla con "Cualquier persona con el enlace (Lector)".'
    );
  }
  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    title: data.title || 'Planilla Google Sheets',
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheets: Array.isArray(data.sheets) ? data.sheets : [],
  };
}

export async function fetchPublicWorkbookTabValues(
  spreadsheetId: string,
  sheetTitle: string,
  refresh: boolean = false
): Promise<{ formattedValues: string[][]; formulaValues: string[][] }> {
  const res = await fetch(
    `/api/sheets/public-workbook?spreadsheetId=${encodeURIComponent(
      spreadsheetId
    )}&tabTitle=${encodeURIComponent(sheetTitle)}${refresh ? '&refresh=1' : ''}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(
      data?.error || `No se pudo leer la pestaña "${sheetTitle}" por enlace directo.`
    );
  }
  return {
    formattedValues: Array.isArray(data.formattedValues) ? data.formattedValues : [],
    formulaValues: Array.isArray(data.formulaValues) ? data.formulaValues : [],
  };
}

export async function fetchPayrollSheetsConfigFromDb(): Promise<PayrollSheetsPersistedConfig | null> {
  try {
    const res = await fetch('/api/settings/payroll_sheets_config');
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data === 'object' && data.spreadsheetId) {
      return data as PayrollSheetsPersistedConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export async function savePayrollSheetsConfigToDb(
  config: PayrollSheetsPersistedConfig
): Promise<boolean> {
  try {
    const res = await fetch('/api/settings/payroll_sheets_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...config,
        updatedAt: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function translateGoogleSheetsError(rawMessage: string, status: number): string {
  const msg = String(rawMessage || '');
  if (
    status === 401 ||
    /invalid authentication credentials/i.test(msg) ||
    /UNAUTHENTICATED/i.test(msg)
  ) {
    cachedAccessToken = null;
    return 'SESSION_EXPIRED: Tu sesión de Google venció o se desconectó. Hacé clic en "Conectar Google y Guardar en Sheet" para reconectar en 1 segundo.';
  }
  if (
    /insufficient authentication scopes/i.test(msg) ||
    /ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(msg)
  ) {
    cachedAccessToken = null;
    return 'SCOPE_INSUFFICIENT: Faltó tildar el permiso de Google Sheets en la ventana de Google. Hacé clic en "Habilitar Permiso de Hojas de Cálculo" y asegurate de MARCAR LA CASILLA (cuadradito) de Google Sheets antes de tocar Continuar.';
  }
  if (status === 403 || /caller does not have permission/i.test(msg)) {
    return 'La cuenta de Google con la que iniciaste sesión no tiene permiso sobre esta planilla. Tocá "Cambiar Cuenta" y elegí la cuenta de Google dueña del archivo (o compartilo con esta cuenta).';
  }
  if (status === 400 && /not supported for this document/i.test(msg)) {
    return 'Este archivo está subido como Excel (.xlsx) en Google Drive en lugar de formato nativo de Google Sheets. En Google Sheets andá a "Archivo → Guardar como hojas de cálculo de Google" y pegá el link nuevo.';
  }
  if (status === 404 || /Requested entity was not found/i.test(msg)) {
    return 'No se encontró la planilla con ese link o ID. Verificá que el enlace esté completo y que hayas iniciado sesión con la cuenta dueña.';
  }
  return msg || 'No se pudo conectar con Google Sheets.';
}

export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadata> {
  if (!accessToken || accessToken === PUBLIC_LINK_TOKEN) {
    return fetchPublicWorkbookMetadata(spreadsheetId, true);
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?includeGridData=false`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const data = await res.json();
  if (!res.ok) {
    // Fallback to server-side public workbook reader if link sharing is enabled
    try {
      return await fetchPublicWorkbookMetadata(spreadsheetId, true);
    } catch {
      // Throw original Google API error if public fallback also fails
    }
    const rawMsg = data?.error?.message || '';
    if (
      /insufficient authentication scopes/i.test(rawMsg) ||
      /ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(rawMsg)
    ) {
      cachedAccessToken = null;
    }
    throw new Error(translateGoogleSheetsError(rawMsg, res.status));
  }

  const sheets: SheetTabInfo[] = Array.isArray(data.sheets)
    ? data.sheets.map((s: any, idx: number) => ({
        sheetId: Number(s?.properties?.sheetId ?? idx),
        title: String(s?.properties?.title || `Hoja ${idx + 1}`),
        index: Number(s?.properties?.index ?? idx),
        rowCount: Number(s?.properties?.gridProperties?.rowCount || 100),
        columnCount: Number(s?.properties?.gridProperties?.columnCount || 26),
      }))
    : [];

  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    title: data?.properties?.title || 'Planilla de Sueldos',
    spreadsheetUrl:
      data?.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheets,
  };
}

export async function fetchSheetTabValues(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string,
  rowLimit: number = 600
): Promise<{ formattedValues: string[][]; formulaValues: string[][] }> {
  if (!accessToken || accessToken === PUBLIC_LINK_TOKEN) {
    return fetchPublicWorkbookTabValues(spreadsheetId, sheetTitle, false);
  }

  const escapedTitle = `'${sheetTitle.replace(/'/g, "''")}'`;
  const a1Range =
    rowLimit <= 0
      ? `${escapedTitle}!A:ZZ`
      : `${escapedTitle}!A1:ZZ${Math.max(100, Math.floor(rowLimit))}`;
  const encodedRange = encodeURIComponent(a1Range);
  const [resFormatted, resFormulas] = await Promise.all([
    fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),
    fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodedRange}?valueRenderOption=FORMULA`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),
  ]);

  const dataFormatted = await resFormatted.json();
  if (!resFormatted.ok) {
    try {
      return await fetchPublicWorkbookTabValues(spreadsheetId, sheetTitle, false);
    } catch {
      // Fall through to standard error
    }
    const rawMsg = dataFormatted?.error?.message || '';
    if (/insufficient authentication scopes/i.test(rawMsg)) {
      cachedAccessToken = null;
    }
    throw new Error(translateGoogleSheetsError(rawMsg, resFormatted.status));
  }

  const dataFormulas = resFormulas.ok ? await resFormulas.json() : { values: [] };

  const rawFormatted: any[][] = Array.isArray(dataFormatted.values) ? dataFormatted.values : [];
  const rawFormulas: any[][] = Array.isArray(dataFormulas.values) ? dataFormulas.values : [];

  const maxCols = Math.max(
    1,
    ...rawFormatted.map(r => (Array.isArray(r) ? r.length : 0)),
    ...rawFormulas.map(r => (Array.isArray(r) ? r.length : 0))
  );
  const maxRows = Math.max(rawFormatted.length, rawFormulas.length);

  const formattedValues: string[][] = [];
  const formulaValues: string[][] = [];

  for (let r = 0; r < maxRows; r++) {
    const fRow = Array.isArray(rawFormatted[r]) ? rawFormatted[r] : [];
    const mRow = Array.isArray(rawFormulas[r]) ? rawFormulas[r] : [];
    const normFormatted: string[] = [];
    const normFormula: string[] = [];
    for (let c = 0; c < maxCols; c++) {
      normFormatted.push(fRow[c] !== undefined && fRow[c] !== null ? String(fRow[c]) : '');
      normFormula.push(
        mRow[c] !== undefined && mRow[c] !== null
          ? String(mRow[c])
          : fRow[c] !== undefined && fRow[c] !== null
            ? String(fRow[c])
            : ''
      );
    }
    formattedValues.push(normFormatted);
    formulaValues.push(normFormula);
  }

  return { formattedValues, formulaValues };
}

export async function updateSheetTabValues(
  spreadsheetId: string,
  sheetTitle: string,
  values: string[][],
  accessToken: string
): Promise<void> {
  const safeTitle = `'${sheetTitle.replace(/'/g, "''")}'`;
  const clearRange = encodeURIComponent(`${safeTitle}!A1:ZZ500`);

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${clearRange}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  const updateRange = encodeURIComponent(`${safeTitle}!A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${updateRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values,
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(translateGoogleSheetsError(data?.error?.message || '', res.status));
  }
}

export async function duplicateSheetTabForNewMonth(
  spreadsheetId: string,
  sourceSheetId: number,
  newSheetName: string,
  insertIndex: number,
  accessToken: string
): Promise<SheetTabInfo> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            duplicateSheet: {
              sourceSheetId,
              insertSheetIndex: insertIndex,
              newSheetName: newSheetName.trim(),
            },
          },
        ],
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(translateGoogleSheetsError(data?.error?.message || '', res.status));
  }

  const replyProps = data?.replies?.[0]?.duplicateSheet?.properties;
  return {
    sheetId: Number(replyProps?.sheetId ?? Date.now()),
    title: String(replyProps?.title || newSheetName.trim()),
    index: Number(replyProps?.index ?? insertIndex),
  };
}

export function colIndexToA1(colIdx: number): string {
  let n = colIdx + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface SheetSlipSyncResult {
  updatedCells: number;
  warnings: string[];
}

/**
 * Writes edits from an EmployeePayrollSlip back into its LIVE block in the Google Sheet.
 * Always re-locates the block in the live Sheet first so row insertions/deletions in Sheets
 * never cause stale-row overwrites of FECHA/CONCEPTO headers or TOTAL BASICO / TOTAL EXTRA rows.
 */
export async function syncSlipEditsToGoogleSheet(
  spreadsheetId: string,
  slip: EmployeePayrollSlip,
  accessToken: string,
  originalSlip?: EmployeePayrollSlip | null
): Promise<SheetSlipSyncResult> {
  if (!slip.sheetSource) {
    throw new Error('Esta ficha no está vinculada a una ubicación específica del Google Sheet.');
  }

  const { tabTitle } = slip.sheetSource;
  const safeTab = `'${tabTitle.replace(/'/g, "''")}'`;

  // 1. Read LIVE tab values AND formulas so we resolve exact current row coordinates
  const { formattedValues, formulaValues } = await fetchSheetTabValues(
    spreadsheetId,
    tabTitle,
    accessToken
  );

  const liveSlips = parseSheetGridIntoPayrollSlips(formattedValues, tabTitle, {
    onlyLaHormiga: false,
  });

  const targetWeek = slip.numeroSemana || detectWeekNumberFromText(slip.grupoSemana);
  const origKey = normalizeEmployeeKey(originalSlip?.empleadoNombre || slip.empleadoNombre);
  const currKey = normalizeEmployeeKey(slip.empleadoNombre);
  const expectedCol = slip.sheetSource.startColIndex;
  const expectedRow = slip.sheetSource.headerRowIndex;

  let liveSlip =
    liveSlips.find(
      s =>
        normalizeEmployeeKey(s.empleadoNombre) === origKey &&
        (s.numeroSemana || detectWeekNumberFromText(s.grupoSemana)) === targetWeek &&
        s.sheetSource?.startColIndex === expectedCol
    ) ||
    liveSlips.find(
      s =>
        (normalizeEmployeeKey(s.empleadoNombre) === origKey ||
          normalizeEmployeeKey(s.empleadoNombre) === currKey) &&
        (s.numeroSemana || detectWeekNumberFromText(s.grupoSemana)) === targetWeek
    ) ||
    liveSlips
      .filter(
        s =>
          s.sheetSource?.startColIndex === expectedCol &&
          (s.numeroSemana || detectWeekNumberFromText(s.grupoSemana)) === targetWeek &&
          Math.abs((s.sheetSource?.headerRowIndex ?? 9999) - expectedRow) <= 5
      )
      .sort(
        (a, b) =>
          Math.abs((a.sheetSource?.headerRowIndex ?? 0) - expectedRow) -
          Math.abs((b.sheetSource?.headerRowIndex ?? 0) - expectedRow)
      )[0];

  if (!liveSlip?.sheetSource) {
    throw new Error(
      `No se pudo ubicar el bloque vivo de "${originalSlip?.empleadoNombre || slip.empleadoNombre}" en "${tabTitle}". Por seguridad no se modificó ninguna celda. Hacé clic en "Conectar Google y Leer" para resincronizar las posiciones.`
    );
  }

  const liveHeaderRow = liveSlip.sheetSource.headerRowIndex;
  const startColIndex = liveSlip.sheetSource.startColIndex;
  const liveTableHeaderRow = liveHeaderRow + 1;
  const liveTotalBasicoRow = liveSlip.sheetSource.totalBasicoRowIndex;
  const liveTotalExtraRow = liveSlip.sheetSource.totalExtraRowIndex;

  // Verify the live table header row actually says FECHA | CONCEPTO (or "" | CONCEPTO | ... | INGRESOS | EGRESOS) before writing anything
  const hdrCol0 = String(formattedValues[liveTableHeaderRow]?.[startColIndex] || '')
    .trim()
    .toUpperCase();
  const hdrCol1 = String(formattedValues[liveTableHeaderRow]?.[startColIndex + 1] || '')
    .trim()
    .toUpperCase();
  const hdrCol3 = String(formattedValues[liveTableHeaderRow]?.[startColIndex + 3] || '')
    .trim()
    .toUpperCase();
  const hdrCol4 = String(formattedValues[liveTableHeaderRow]?.[startColIndex + 4] || '')
    .trim()
    .toUpperCase();

  const isValidLiveTableHeader =
    hdrCol1 === 'CONCEPTO' &&
    /INGRESO/.test(hdrCol3) &&
    (hdrCol0 === 'FECHA' || (hdrCol0 === '' && /EGRESO/.test(hdrCol4)));

  if (!isValidLiveTableHeader) {
    throw new Error(
      `La fila de encabezado FECHA | CONCEPTO de "${liveSlip.empleadoNombre}" no coincide en el Sheet (fila ${liveTableHeaderRow + 1}). Por seguridad se canceló la escritura.`
    );
  }

  if (
    liveTotalBasicoRow === undefined ||
    liveTotalExtraRow === undefined ||
    liveTotalBasicoRow <= liveTableHeaderRow + 1 ||
    liveTotalExtraRow <= liveTotalBasicoRow
  ) {
    throw new Error(
      `No se pudieron confirmar los límites de TOTAL BASICO / TOTAL EXTRA para "${liveSlip.empleadoNombre}" en el Sheet. Por seguridad no se escribió nada.`
    );
  }

  const getCellFormulaVal = (sheetRow0: number, localCol: number): string => {
    const row = formulaValues[sheetRow0];
    if (!row) return '';
    return String(row[startColIndex + localCol] ?? '').trim();
  };
  const isFormulaCell = (sheetRow0: number, localCol: number): boolean =>
    getCellFormulaVal(sheetRow0, localCol).startsWith('=');

  const protectedRows = new Set<number>([
    liveTableHeaderRow,
    liveTotalBasicoRow,
    liveTotalExtraRow,
  ]);

  const updates: Array<{ range: string; values: any[][] }> = [];
  const warnings: string[] = [];

  const pushCell = (sheetRow0: number, localCol: number, val: string | number) => {
    // Hard boundary guard: NEVER overwrite FECHA/CONCEPTO header, TOTAL BASICO, TOTAL EXTRA, TOTALES or A COBRAR
    if (
      sheetRow0 < liveHeaderRow ||
      sheetRow0 >= liveTotalExtraRow ||
      protectedRows.has(sheetRow0)
    ) {
      return;
    }
    const colA1 = colIndexToA1(startColIndex + localCol);
    updates.push({
      range: `${safeTab}!${colA1}${sheetRow0 + 1}`,
      values: [[val]],
    });
  };

  // 2. Header cells: Name, Base Jornal, Mes, Rango (anchored strictly to liveTableHeaderRow)
  const nameInCol1 =
    getCellFormulaVal(liveHeaderRow, 1) !== '' || Boolean(liveSlip.codigoCabecera);
  const nameCol = nameInCol1 ? 1 : 0;
  if (!isFormulaCell(liveHeaderRow, nameCol)) {
    pushCell(liveHeaderRow, nameCol, slip.empleadoNombre);
  }
  if (!isFormulaCell(liveHeaderRow, 3)) {
    pushCell(liveHeaderRow, 3, slip.valorBaseJornal);
  }
  if (!isFormulaCell(liveTableHeaderRow + 1, 0)) {
    pushCell(liveTableHeaderRow + 1, 0, slip.mesTexto);
  }
  if (!isFormulaCell(liveTableHeaderRow + 2, 0)) {
    pushCell(liveTableHeaderRow + 2, 0, slip.rangoFecha);
  }

  // 3. Basic items matched strictly against LIVE rows inside [liveTableHeaderRow + 1 .. liveTotalBasicoRow - 1]
  const basicStart0 = liveTableHeaderRow + 1;
  const basicEnd0 = liveTotalBasicoRow - 1;
  const liveBasicPool = liveSlip.basicItems.filter(
    b => b.sheetRowIndex !== undefined && b.sheetRowIndex >= basicStart0 && b.sheetRowIndex <= basicEnd0
  );
  const claimedLiveBasicRows = new Set<number>();

  const claimLiveBasicRow = (itemConcept: string, idx: number): number | undefined => {
    const normTarget = itemConcept.trim().toUpperCase();
    const origConcept = originalSlip?.basicItems[idx]?.concepto?.trim().toUpperCase();

    // Exact index + same concept match
    const atSameIdx = liveBasicPool[idx];
    if (
      atSameIdx?.sheetRowIndex !== undefined &&
      !claimedLiveBasicRows.has(atSameIdx.sheetRowIndex) &&
      (atSameIdx.concepto.trim().toUpperCase() === normTarget ||
        (origConcept && atSameIdx.concepto.trim().toUpperCase() === origConcept))
    ) {
      claimedLiveBasicRows.add(atSameIdx.sheetRowIndex);
      return atSameIdx.sheetRowIndex;
    }

    // Any unclaimed live row with matching concept (current or original)
    const byConcept = liveBasicPool.find(
      b =>
        b.sheetRowIndex !== undefined &&
        !claimedLiveBasicRows.has(b.sheetRowIndex) &&
        (b.concepto.trim().toUpperCase() === normTarget ||
          (origConcept && b.concepto.trim().toUpperCase() === origConcept))
    );
    if (byConcept?.sheetRowIndex !== undefined) {
      claimedLiveBasicRows.add(byConcept.sheetRowIndex);
      return byConcept.sheetRowIndex;
    }

    return undefined;
  };

  for (let idx = 0; idx < slip.basicItems.length; idx++) {
    const item = slip.basicItems[idx];
    const targetRow = claimLiveBasicRow(item.concepto, idx);

    if (targetRow !== undefined) {
      if (!isFormulaCell(targetRow, 1)) {
        pushCell(targetRow, 1, item.concepto);
      }
      if (!isFormulaCell(targetRow, 2)) {
        pushCell(targetRow, 2, item.unidades > 0 ? item.unidades : '');
      }
      const formulaIng = isFormulaCell(targetRow, 3);
      const formulaExpected = Math.round(item.unidades * slip.valorBaseJornal * 100) / 100;
      const origBasic = originalSlip?.basicItems[idx] || originalSlip?.basicItems.find(b => b.id === item.id);
      const userOverrodeFormula =
        formulaIng &&
        origBasic &&
        Math.abs(item.ingreso - formulaExpected) > 1 &&
        Math.abs(item.unidades - origBasic.unidades) < 0.001;

      if (!formulaIng || userOverrodeFormula) {
        pushCell(targetRow, 3, item.ingreso > 0 ? item.ingreso : '');
      }
    } else {
      // Newly added basic concept: find an empty row strictly before liveTotalBasicoRow
      let freeRow = -1;
      for (let rr = basicStart0; rr <= basicEnd0; rr++) {
        if (claimedLiveBasicRows.has(rr)) continue;
        const emptyRow = [1, 2, 3, 4].every(col => getCellFormulaVal(rr, col) === '');
        if (emptyRow) {
          freeRow = rr;
          break;
        }
      }
      if (freeRow !== -1) {
        claimedLiveBasicRows.add(freeRow);
        pushCell(freeRow, 1, item.concepto);
        pushCell(freeRow, 2, item.unidades > 0 ? item.unidades : '');
        if (!isFormulaCell(freeRow, 3)) {
          pushCell(freeRow, 3, item.ingreso > 0 ? item.ingreso : '');
        }
      } else {
        warnings.push(
          `No quedaron filas vacías antes de TOTAL BASICO para agregar "${item.concepto}" en el Sheet.`
        );
      }
    }
  }

  // Clear deleted basic items
  for (const liveB of liveBasicPool) {
    if (liveB.sheetRowIndex !== undefined && !claimedLiveBasicRows.has(liveB.sheetRowIndex)) {
      const r = liveB.sheetRowIndex;
      if (!isFormulaCell(r, 1)) pushCell(r, 1, '');
      if (!isFormulaCell(r, 2)) pushCell(r, 2, '');
      if (!isFormulaCell(r, 3)) pushCell(r, 3, '');
    }
  }

  // 4. Extra items & Deductions matched strictly against LIVE rows inside [liveTotalBasicoRow + 1 .. liveTotalExtraRow - 1]
  //    2-pass placement so Discounts/Anticipos go UP (arriba) and Transfers go DOWN (abajo, near TOTAL EXTRA).
  const extraStart0 = liveTotalBasicoRow + 1;
  const extraEnd0 = liveTotalExtraRow - 1;
  const liveExtraPool = liveSlip.extraItems.filter(
    e => e.sheetRowIndex !== undefined && e.sheetRowIndex >= extraStart0 && e.sheetRowIndex <= extraEnd0
  );
  const claimedLiveExtraRows = new Set<number>();
  const origExtraById = new Map<string, PayrollExtraItem>();
  if (originalSlip) {
    for (const oe of originalSlip.extraItems) {
      origExtraById.set(oe.id, oe);
    }
  }

  const claimLiveExtraRow = (item: PayrollExtraItem, idx: number): number | undefined => {
    const normTarget = item.concepto.trim().toUpperCase();
    const origExtra = origExtraById.get(item.id) || originalSlip?.extraItems[idx];
    const origConcept = origExtra?.concepto?.trim().toUpperCase();

    // 1. Exact sheetRowIndex match when concept matches current or original name
    if (item.sheetRowIndex !== undefined) {
      const byExactRow = liveExtraPool.find(
        e =>
          e.sheetRowIndex === item.sheetRowIndex &&
          !claimedLiveExtraRows.has(e.sheetRowIndex) &&
          (e.concepto.trim().toUpperCase() === normTarget ||
            (origConcept && e.concepto.trim().toUpperCase() === origConcept))
      );
      if (byExactRow?.sheetRowIndex !== undefined) {
        claimedLiveExtraRows.add(byExactRow.sheetRowIndex);
        return byExactRow.sheetRowIndex;
      }
    }

    // 2. Positional match at original index if available
    const atSameIdx = liveExtraPool[idx];
    if (
      atSameIdx?.sheetRowIndex !== undefined &&
      !claimedLiveExtraRows.has(atSameIdx.sheetRowIndex) &&
      (atSameIdx.concepto.trim().toUpperCase() === normTarget ||
        (origConcept && atSameIdx.concepto.trim().toUpperCase() === origConcept))
    ) {
      claimedLiveExtraRows.add(atSameIdx.sheetRowIndex);
      return atSameIdx.sheetRowIndex;
    }

    // 3. Any unclaimed live row with matching concept (current or original)
    const byConcept = liveExtraPool.find(
      e =>
        e.sheetRowIndex !== undefined &&
        !claimedLiveExtraRows.has(e.sheetRowIndex) &&
        (e.concepto.trim().toUpperCase() === normTarget ||
          (origConcept && e.concepto.trim().toUpperCase() === origConcept))
    );
    if (byConcept?.sheetRowIndex !== undefined) {
      claimedLiveExtraRows.add(byConcept.sheetRowIndex);
      return byConcept.sheetRowIndex;
    }

    return undefined;
  };

  const writeExtraRowCells = (
    targetRow: number,
    item: PayrollExtraItem,
    origExtra?: PayrollExtraItem
  ) => {
    if (!isFormulaCell(targetRow, 0)) {
      pushCell(
        targetRow,
        0,
        item.fechaDetalle ? item.fechaDetalle : item.cantidad > 0 ? item.cantidad : ''
      );
    }
    if (!isFormulaCell(targetRow, 1)) {
      pushCell(targetRow, 1, item.concepto);
    }
    if (!isFormulaCell(targetRow, 2)) {
      pushCell(targetRow, 2, item.tarifaUnitaria > 0 ? item.tarifaUnitaria : '');
    }

    const formulaIng = isFormulaCell(targetRow, 3);
    const formulaExpected = Math.round(item.cantidad * item.tarifaUnitaria * 100) / 100;
    const userOverrodeFormula =
      formulaIng &&
      item.egreso === 0 &&
      origExtra &&
      Math.abs(item.ingreso - formulaExpected) > 1 &&
      Math.abs(item.cantidad - origExtra.cantidad) < 0.001 &&
      Math.abs(item.tarifaUnitaria - origExtra.tarifaUnitaria) < 0.01;

    if (!formulaIng || userOverrodeFormula) {
      pushCell(targetRow, 3, item.ingreso > 0 ? item.ingreso : '');
    }
    if (!isFormulaCell(targetRow, 4)) {
      pushCell(targetRow, 4, item.egreso > 0 ? item.egreso : '');
    }
  };

  const unmatchedNewItems: Array<{ item: PayrollExtraItem; idx: number }> = [];
  const claimedHoraRows: number[] = [];
  const claimedDiscountRows: number[] = [];
  const claimedTransferRows: number[] = [];

  // Pass 1: Match existing items first (prioritize items that existed in originalSlip so new items never steal existing rows)
  const sortedMatchOrder = slip.extraItems
    .map((item, idx) => ({
      item,
      idx,
      hadOriginal: originalSlip ? origExtraById.has(item.id) : true,
    }))
    .sort((a, b) => Number(b.hadOriginal) - Number(a.hadOriginal));

  const matchedAssignments = new Map<number, number>();
  for (const entry of sortedMatchOrder) {
    const { item, idx, hadOriginal } = entry;
    // If originalSlip exists and this item wasn't in it, treat it strictly as a brand-new row in Pass 2
    if (originalSlip && !hadOriginal) {
      unmatchedNewItems.push({ item, idx });
      continue;
    }
    const targetRow = claimLiveExtraRow(item, idx);
    if (targetRow !== undefined) {
      matchedAssignments.set(idx, targetRow);
      const origExtra = origExtraById.get(item.id) || originalSlip?.extraItems[idx];
      writeExtraRowCells(targetRow, item, origExtra);

      const cat = classifyPayrollExtraItem(item);
      if (cat === 'TRANSFERENCIA') {
        claimedTransferRows.push(targetRow);
      } else if (cat === 'DESCUENTO' || cat === 'ANTICIPO') {
        claimedDiscountRows.push(targetRow);
      } else {
        claimedHoraRows.push(targetRow);
      }
    } else {
      unmatchedNewItems.push({ item, idx });
    }
  }

  // Clear deleted extra items before computing free rows
  const deletedRowPool: number[] = [];
  for (const liveE of liveExtraPool) {
    if (liveE.sheetRowIndex !== undefined && !claimedLiveExtraRows.has(liveE.sheetRowIndex)) {
      const r = liveE.sheetRowIndex;
      if (!isFormulaCell(r, 0)) pushCell(r, 0, '');
      if (!isFormulaCell(r, 1)) pushCell(r, 1, '');
      if (!isFormulaCell(r, 2)) pushCell(r, 2, '');
      if (!isFormulaCell(r, 3)) pushCell(r, 3, '');
      if (!isFormulaCell(r, 4)) pushCell(r, 4, '');
      if (![0, 1, 2, 3, 4].some(col => isFormulaCell(r, col))) {
        deletedRowPool.push(r);
      }
    }
  }

  // Build available empty rows strictly inside [extraStart0 .. extraEnd0]
  const freeRows: number[] = [];
  for (let rr = extraStart0; rr <= extraEnd0; rr++) {
    if (claimedLiveExtraRows.has(rr)) continue;
    const isDeletedCleared = deletedRowPool.includes(rr);
    const isEmptyCell = [0, 1, 2, 3, 4].every(col => getCellFormulaVal(rr, col) === '');
    if (isEmptyCell || isDeletedCleared) {
      freeRows.push(rr);
    }
  }

  const firstDiscOrTransRow =
    claimedDiscountRows.length > 0 || claimedTransferRows.length > 0
      ? Math.min(...claimedDiscountRows, ...claimedTransferRows)
      : Infinity;
  const headerHoras = claimedHoraRows.filter(r => r < firstDiscOrTransRow);
  let lastHeaderHoraRow =
    headerHoras.length > 0
      ? Math.max(...headerHoras)
      : claimedHoraRows.length > 0
        ? Math.max(...claimedHoraRows)
        : extraStart0 - 1;

  // Pass 2: Place new Discounts/Anticipos/Extras FIRST (top-down below Hora Extra rows), then Transfers LAST (bottom-up near TOTAL EXTRA)
  const newTopItems = unmatchedNewItems.filter(
    u => classifyPayrollExtraItem(u.item) !== 'TRANSFERENCIA'
  );
  const newBottomItems = unmatchedNewItems.filter(
    u => classifyPayrollExtraItem(u.item) === 'TRANSFERENCIA'
  );

  for (const { item } of newTopItems) {
    const cat = classifyPayrollExtraItem(item);
    const firstTransferRow =
      claimedTransferRows.length > 0 ? Math.min(...claimedTransferRows) : Infinity;

    const picked =
      freeRows.find(rr => rr > lastHeaderHoraRow && rr < firstTransferRow) ??
      freeRows.find(rr => rr < firstTransferRow) ??
      freeRows[0];

    if (picked !== undefined) {
      const idxInFree = freeRows.indexOf(picked);
      if (idxInFree > -1) freeRows.splice(idxInFree, 1);
      claimedLiveExtraRows.add(picked);
      writeExtraRowCells(picked, item);
      if (cat === 'HORA_EXTRA') {
        lastHeaderHoraRow = Math.max(lastHeaderHoraRow, picked);
      } else {
        claimedDiscountRows.push(picked);
      }
    } else {
      warnings.push(
        `No quedaron filas vacías antes de TOTAL EXTRA en la ficha de ${slip.empleadoNombre} para agregar "${item.concepto}".`
      );
    }
  }

  for (const { item } of newBottomItems) {
    const minAllowedRow = Math.max(
      lastHeaderHoraRow,
      claimedDiscountRows.length > 0 ? Math.max(...claimedDiscountRows) : extraStart0 - 1
    );
    const belowZoneFree = freeRows.filter(rr => rr > minAllowedRow);
    const candidatePool = belowZoneFree.length > 0 ? belowZoneFree : freeRows;

    let picked: number | undefined;
    if (candidatePool.length > 0) {
      if (claimedTransferRows.length > 0) {
        const lastTrRow = Math.max(...claimedTransferRows);
        picked =
          candidatePool.find(rr => rr > lastTrRow) ??
          candidatePool[candidatePool.length - 1];
      } else if (candidatePool.length >= 4) {
        // Leave 1 optional blank line right above TOTAL EXTRA (like GARCIA DANIEL) and keep upper rows free for Discounts/Anticipos
        picked = candidatePool[candidatePool.length - 2];
      } else {
        picked = candidatePool[candidatePool.length - 1];
      }
    }

    if (picked !== undefined) {
      const idxInFree = freeRows.indexOf(picked);
      if (idxInFree > -1) freeRows.splice(idxInFree, 1);
      claimedLiveExtraRows.add(picked);
      writeExtraRowCells(picked, item);
      claimedTransferRows.push(picked);
    } else {
      warnings.push(
        `No quedaron filas vacías antes de TOTAL EXTRA en la ficha de ${slip.empleadoNombre} para agregar "${item.concepto}".`
      );
    }
  }

  if (updates.length === 0) {
    return { updatedCells: 0, warnings };
  }

  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updates,
      }),
    }
  );

  const batchJson = await batchRes.json();
  if (!batchRes.ok) {
    throw new Error(translateGoogleSheetsError(batchJson?.error?.message || '', batchRes.status));
  }

  return {
    updatedCells: Number(batchJson?.totalUpdatedCells ?? updates.length),
    warnings,
  };
}

/**
 * Writes updated TRANSF., EFECTIVO, OBSERVACIONES, ALIAS, and CBU cells
 * back to the companion R-summary tab (e.g. "R-10.2026") WITHOUT overwriting
 * formula cells (BASICO, EXTRAS, TOTAL, DESCUENTOS, TOTAL A COBRAR, SALDO).
 */
export async function syncRSummaryPaymentsToGoogleSheet(
  spreadsheetId: string,
  tabTitle: string,
  slipsToSync: EmployeePayrollSlip[],
  accessToken: string
): Promise<{ updatedCells: number; skippedFormulaCells: number }> {
  const targeted = slipsToSync.filter(
    s => s.rSheetSource && s.rSheetSource.tabTitle === tabTitle
  );
  if (targeted.length === 0) {
    return { updatedCells: 0, skippedFormulaCells: 0 };
  }

  const safeTab = `'${tabTitle.replace(/'/g, "''")}'`;
  const formulaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${safeTab}!A1:Z300`)}?valueRenderOption=FORMULA`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!formulaRes.ok) {
    const errJson = await formulaRes.json().catch(() => ({}));
    throw new Error(translateGoogleSheetsError(errJson?.error?.message || '', formulaRes.status));
  }
  const formulaJson = await formulaRes.json();
  const formulaGrid: any[][] = formulaJson.values || [];

  const isFormula = (row0: number, col0: number): boolean => {
    const raw = String(formulaGrid[row0]?.[col0] ?? '').trim();
    return raw.startsWith('=');
  };

  const dataUpdates: Array<{ range: string; values: any[][] }> = [];
  let skippedFormulaCells = 0;

  const pushIfEditable = (row0: number, col0: number | undefined, value: string | number) => {
    if (col0 === undefined || col0 < 0) return;
    if (isFormula(row0, col0)) {
      skippedFormulaCells++;
      return;
    }
    const colA1 = colIndexToA1(col0);
    dataUpdates.push({
      range: `${safeTab}!${colA1}${row0 + 1}`,
      values: [[value]],
    });
  };

  for (const slip of targeted) {
    const src = slip.rSheetSource!;
    const r0 = src.rowIndex;
    if (r0 < 1) continue;

    // Verify row still corresponds to an employee line (not TOTALES)
    const liveNameCell = String(formulaGrid[r0]?.[src.colMap.empleado] ?? '').trim().toUpperCase();
    if (!liveNameCell || liveNameCell === 'TOTALES' || liveNameCell === 'TOTAL') {
      continue;
    }

    if (slip.pagoTransferencia !== undefined) {
      pushIfEditable(
        r0,
        src.colMap.transf,
        slip.pagoTransferencia > 0 ? slip.pagoTransferencia : ''
      );
    }
    if (slip.pagoEfectivo !== undefined) {
      pushIfEditable(r0, src.colMap.efectivo, slip.pagoEfectivo > 0 ? slip.pagoEfectivo : '');
    }
    if (slip.observacionesPago !== undefined) {
      pushIfEditable(r0, src.colMap.obs, slip.observacionesPago);
    }
    if (slip.aliasBancario !== undefined) {
      pushIfEditable(r0, src.colMap.alias, slip.aliasBancario);
    }
    if (slip.cbuBancario !== undefined) {
      pushIfEditable(r0, src.colMap.cbu, slip.cbuBancario);
    }
  }

  if (dataUpdates.length === 0) {
    return { updatedCells: 0, skippedFormulaCells };
  }

  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: dataUpdates,
      }),
    }
  );
  const batchJson = await batchRes.json();
  if (!batchRes.ok) {
    throw new Error(translateGoogleSheetsError(batchJson?.error?.message || '', batchRes.status));
  }

  return {
    updatedCells: Number(batchJson?.totalUpdatedCells ?? dataUpdates.length),
    skippedFormulaCells,
  };
}

export type ModuleSheetConfigKey =
  | 'fuel_sheets_config'
  | 'vales_sheets_config'
  | 'partes_sheets_config'
  | 'maintenance_sheets_config';

export type SheetJoinStrategy = 'outer' | 'left' | 'inner';

export interface SecondarySheetConfig {
  enabled: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string;
  selectedTabTitle?: string;
  availableTabs?: SheetTabInfo[];
  headerRowIndex?: number;
  columnMapping?: Record<string, string>;
  dateOrder?: 'auto' | 'dmy' | 'mdy';
  selectedTipo?: string;
  joinStrategy?: SheetJoinStrategy;
}

export interface OperationalSheetConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string;
  selectedTabTitle?: string;
  availableTabs?: SheetTabInfo[];
  headerRowIndex?: number;
  columnMapping?: Record<string, string>;
  dateOrder?: 'auto' | 'dmy' | 'mdy';
  syncMode?: 'merge' | 'replace';
  connectedEmail?: string;
  lastSyncedAt?: string;
  lastSyncedCount?: number;
  updatedAt?: string;
  secondarySheet?: SecondarySheetConfig;
}

export async function fetchOperationalSheetConfigFromDb(
  key: ModuleSheetConfigKey
): Promise<OperationalSheetConfig | null> {
  try {
    const res = await fetch(`/api/settings/${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const raw = await res.json();
    const cfg = raw?.value && typeof raw.value === 'object' ? raw.value : raw;
    if (cfg && typeof cfg === 'object' && (cfg.spreadsheetId || cfg.spreadsheetUrl)) {
      return cfg as OperationalSheetConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveOperationalSheetConfigToDb(
  key: ModuleSheetConfigKey,
  config: OperationalSheetConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/settings/${encodeURIComponent(key)}?strict=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...config,
        updatedAt: new Date().toISOString(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || `Error (${res.status}) al guardar configuración en Supabase.`,
      };
    }
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Error de red al guardar configuración en Supabase.',
    };
  }
}

export async function syncCollectionStrictToSupabase<T>(
  tableName: 'fuel_vouchers' | 'issued_vouchers' | 'partes_diarios' | 'vehicle_expenses',
  items: T[],
  mode: 'merge' | 'replace'
): Promise<{ ok: boolean; items?: T[]; count?: number; error?: string }> {
  try {
    const res = await fetch(`/api/supabase-sync/${encodeURIComponent(tableName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, mode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || `Error (${res.status}) confirmando guardado en Supabase (${tableName}).`,
      };
    }
    return {
      ok: true,
      items: Array.isArray(data.items) ? (data.items as T[]) : items,
      count: Number(data.count ?? items.length),
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Error de conexión con el servidor al guardar en Supabase.',
    };
  }
}

export async function writeTableToGoogleSheetTab(
  spreadsheetId: string,
  sheetTitle: string,
  headers: string[],
  rows: (string | number)[][],
  accessToken: string
): Promise<{ updatedRows: number }> {
  const stringMatrix: string[][] = [
    headers.map(h => String(h ?? '')),
    ...rows.map(row => row.map(cell => (cell === null || cell === undefined ? '' : String(cell)))),
  ];
  await updateSheetTabValues(spreadsheetId, sheetTitle, stringMatrix, accessToken);
  return { updatedRows: rows.length };
}

