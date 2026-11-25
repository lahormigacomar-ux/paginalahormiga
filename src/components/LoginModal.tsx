import React, { useState } from 'react';
import { 
  X, 
  Lock, 
  User, 
  ArrowRight, 
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import { UserSession } from '../types';
import { Logo } from './Logo';
import { authenticateUser, syncSystemUsersFromCloud } from '../services/siteConfig';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (session: UserSession) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await syncSystemUsersFromCloud();
      const result = authenticateUser(username, password);

      if (!result.success || !result.user) {
        setError(result.error || 'Credenciales inválidas. Verifique su usuario y contraseña.');
        setLoading(false);
        return;
      }

      const user = result.user;
      const session: UserSession = {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        permisos: user.permisos,
        accesoTotal: user.accesoTotal,
        fechaIngreso: new Date().toISOString(),
      };

      onLoginSuccess(session);
      setLoading(false);
      onClose();
    } catch {
      setError('No se pudo validar el acceso contra el servidor.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
      <div 
        id="login-modal-container"
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Header */}
        <div className="bg-[#16191F] px-6 py-5 text-white flex items-center justify-between border-b border-[#2D2D2D]">
          <div className="flex items-center space-x-3">
            <Logo variant="compact" size="sm" theme="dark" showSlogan={false} />
            <div className="h-6 w-px bg-slate-700 hidden sm:block" />
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                Acceso al Sistema ERP
              </h3>
              <p className="text-[11px] text-[#F0C800] font-black uppercase tracking-wider">
                Pequeños grandes movimientos
              </p>
            </div>
          </div>
          <button
            id="close-login-modal-btn"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Instructions */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center space-x-2.5 text-slate-700">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-[#F0C800] flex items-center justify-center font-black shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block leading-tight">
                Acceso Restringido
              </span>
              <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                Ingrese sus credenciales de usuario maestro o administrador
              </span>
            </div>
          </div>

          {/* Credentials Inputs */}
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Usuario o Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="login-username-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ingrese su usuario o correo"
                  autoComplete="username"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white text-slate-900 font-medium"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contraseña de Acceso
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white text-slate-900 font-medium"
                  required
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              id="submit-login-btn"
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-[#F0C800] hover:bg-[#F6D84C] active:bg-[#DDA800] text-[#2D2D2D] font-black rounded-xl transition-all shadow-md shadow-[#F0C800]/20 flex items-center justify-center space-x-2 text-sm disabled:opacity-50 cursor-pointer"
            >
              <span>{loading ? 'Validando credenciales...' : 'Ingresar al Panel de Gestión'}</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
            <p className="text-center text-[11px] text-slate-500 mt-2 font-medium">
              LA HORMIGA • Pequeños grandes movimientos
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
