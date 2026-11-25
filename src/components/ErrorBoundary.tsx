import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  private static isChunkLoadError(error: Error | null): boolean {
    const msg = String(error?.message || '');
    return (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('ChunkLoadError') ||
      msg.includes('Loading chunk')
    );
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    if (ErrorBoundary.isChunkLoadError(error) && typeof window !== 'undefined') {
      try {
        const key = 'lh_chunk_reload_ts';
        const last = Number(window.sessionStorage.getItem(key) || 0);
        const now = Date.now();
        if (!last || now - last > 15000) {
          window.sessionStorage.setItem(key, String(now));
          window.location.reload();
        }
      } catch {
        // Ignore storage errors
      }
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    if (ErrorBoundary.isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  public override render() {
    if (this.state.hasError) {
      const isChunkError = ErrorBoundary.isChunkLoadError(this.state.error);
      return (
        <div className="min-h-screen bg-[#0F1115] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#16191F] border border-amber-500/30 rounded-2xl p-6 text-center shadow-2xl space-y-4">
            <div className="w-14 h-14 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-white">
              {isChunkError
                ? 'Actualización detectada o conexión interrumpida'
                : 'Se produjo un problema en la pantalla'}
            </h2>
            <p className="text-xs text-slate-400">
              {isChunkError
                ? 'No se pudo cargar este módulo porque el servidor se actualizó o hubo un corte breve de conexión. Recargá la página para continuar.'
                : this.state.error?.message || 'Ocurrió un error inesperado al mostrar esta sección.'}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              {!isChunkError && (
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                >
                  Volver a intentar
                </button>
              )}
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Recargar página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
