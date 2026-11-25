import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { googleSignIn, saveSharedGoogleSessionToDb } from './services/googleSheetsAuth.ts';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', event => {
    event.preventDefault();
    try {
      const key = 'lh_chunk_reload_ts';
      const last = Number(window.sessionStorage.getItem(key) || 0);
      const now = Date.now();
      if (!last || now - last > 15000) {
        window.sessionStorage.setItem(key, String(now));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  });
}

const isGoogleAuthBridge =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('google_auth_bridge') === '1';

const GoogleAuthBridgePopup: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorText, setErrorText] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  const handleAuthorize = async () => {
    setStatus('loading');
    setErrorText('');
    try {
      const res = await googleSignIn({ forceDirectPopup: true });
      if (!res?.accessToken) {
        setStatus('error');
        setErrorText('No se recibió el token de autorización de Google.');
        return;
      }
      const userEmail = res.user?.email || 'Cuenta Google';
      setEmail(userEmail);
      await saveSharedGoogleSessionToDb(res.accessToken, userEmail);

      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: 'LA_HORMIGA_GOOGLE_AUTH_SUCCESS',
              accessToken: res.accessToken,
              email: userEmail,
            },
            '*'
          );
        }
      } catch {
        // Ignore cross-origin postMessage issues; Supabase polling handles it
      }

      setStatus('success');
      setTimeout(() => {
        window.close();
      }, 900);
    } catch (err: any) {
      setStatus('error');
      setErrorText(err?.message || 'Error al autorizar con Google.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#161616] border border-[#F0C800]/40 rounded-2xl p-6 shadow-2xl space-y-5 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F0C800]/15 border border-[#F0C800]/40 flex items-center justify-center text-2xl font-black text-[#F0C800]">
          LH
        </div>
        <div>
          <h1 className="text-lg font-black uppercase tracking-wide text-white">
            Conectar Google Sheets — La Hormiga
          </h1>
          <p className="text-xs text-gray-400 mt-1.5">
            Tocá el botón amarillo para autorizar tu cuenta de Google y sincronizar tus hojas de cálculo con la app en producción.
          </p>
        </div>

        {status === 'success' ? (
          <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
            ¡Conectado como {email}! Cerrando ventana y sincronizando...
          </div>
        ) : (
          <button
            type="button"
            onClick={handleAuthorize}
            disabled={status === 'loading'}
            className="w-full py-3.5 px-5 rounded-xl bg-[#F0C800] hover:bg-[#d8b400] text-black font-black text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer disabled:opacity-60"
          >
            {status === 'loading' ? 'Abriendo ventana de Google...' : 'Autorizar Cuenta de Google'}
          </button>
        )}

        {errorText && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs text-left">
            {errorText}
          </div>
        )}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isGoogleAuthBridge ? <GoogleAuthBridgePopup /> : <App />}
    </ErrorBoundary>
  </StrictMode>
);

