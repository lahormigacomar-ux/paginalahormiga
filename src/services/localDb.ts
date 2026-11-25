/**
 * Purga de residuos locales heredados en el navegador.
 * Según la Política de Persistencia, ningún dato funcional ni de negocio
 * debe persistirse en localStorage, sessionStorage ni IndexedDB.
 * La única excepción delimitada es la clave mínima de sesión de autenticación (`la_hormiga_user_session_v1`).
 */

const AUTH_SESSION_KEY = 'la_hormiga_user_session_v1';
const LEGACY_IDB_NAME = 'la_hormiga_db';

export function purgeLegacyLocalFunctionalStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    if (window.localStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k || k === AUTH_SESSION_KEY) continue;
        if (
          k.startsWith('la_hormiga_') ||
          k.startsWith('supabase_offline_') ||
          k === 'driver_app_selected_id' ||
          k === 'erp_table_density' ||
          k === 'fuel_prices_catalog'
        ) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => {
        try {
          window.localStorage.removeItem(k);
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore storage access errors
  }

  try {
    if (window.indexedDB && typeof window.indexedDB.deleteDatabase === 'function') {
      window.indexedDB.deleteDatabase(LEGACY_IDB_NAME);
    }
  } catch {
    // ignore IndexedDB cleanup errors
  }
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    purgeLegacyLocalFunctionalStorage();
  }, 0);
}
