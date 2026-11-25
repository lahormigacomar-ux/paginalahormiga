import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
  RefreshCw,
} from 'lucide-react';
import { SystemUser, UserRole, UserSession } from '../types';
import {
  loadSystemUsers,
  saveSystemUsersAsync,
  syncSystemUsersFromCloud,
} from '../services/siteConfig';
import {
  ALL_PERMISSION_VIEW_IDS,
  SYSTEM_PERMISSION_MODULES,
  getDefaultPermissionsForRole,
  getEffectivePermissions,
} from '../services/permissions';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface UsersPermissionsSectionProps {
  currentUser?: UserSession | null;
  onUsersUpdated?: (users: SystemUser[]) => void;
  onShowToast?: (msg: string) => void;
  compact?: boolean;
}

export const UsersPermissionsSection: React.FC<UsersPermissionsSectionProps> = ({
  currentUser,
  onUsersUpdated,
  onShowToast,
  compact = false,
}) => {
  const [users, setUsers] = useState<SystemUser[]>(() => loadSystemUsers());
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // User Create / Edit Modal state
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [userFormData, setUserFormData] = useState<{
    username: string;
    password: string;
    nombre: string;
    email: string;
    rol: UserRole;
    telefono: string;
    activo: boolean;
    accesoTotal: boolean;
    permisos: string[];
  }>({
    username: '',
    password: '',
    nombre: '',
    email: '',
    rol: 'ENCARGADO_OBRA',
    telefono: '',
    activo: true,
    accesoTotal: false,
    permisos: getDefaultPermissionsForRole('ENCARGADO_OBRA').permisos,
  });

  const [deleteTarget, setDeleteTarget] = useState<{
    title: string;
    itemName: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const refreshFromCloud = async () => {
    setLoadingCloud(true);
    setBannerError(null);
    try {
      const cloudUsers = await syncSystemUsersFromCloud();
      if (cloudUsers && cloudUsers.length > 0) {
        setUsers(cloudUsers);
        onUsersUpdated?.(cloudUsers);
      }
    } catch {
      setBannerError('No se pudo sincronizar la lista de usuarios con el servidor.');
    } finally {
      setLoadingCloud(false);
    }
  };

  useEffect(() => {
    refreshFromCloud();
  }, []);

  const showTempSuccess = (msg: string) => {
    setBannerError(null);
    setBannerSuccess(msg);
    onShowToast?.(msg);
    setTimeout(() => {
      setBannerSuccess(prev => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleOpenCreateUser = () => {
    const defaults = getDefaultPermissionsForRole('ENCARGADO_OBRA');
    setEditingUser(null);
    setFormError(null);
    setShowPassword(false);
    setUserFormData({
      username: '',
      password: '',
      nombre: '',
      email: '',
      rol: 'ENCARGADO_OBRA',
      telefono: '',
      activo: true,
      accesoTotal: defaults.accesoTotal,
      permisos: [...defaults.permisos],
    });
    setIsUserFormOpen(true);
  };

  const handleOpenEditUser = (u: SystemUser) => {
    const effective = getEffectivePermissions(u);
    const isMaster = u.username === 'ideasinfernal' || u.rol === 'SUPER_ADMIN';
    setEditingUser(u);
    setFormError(null);
    setShowPassword(false);
    setUserFormData({
      username: u.username,
      password: u.password,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      telefono: u.telefono || '',
      activo: u.activo,
      accesoTotal: isMaster ? true : Boolean(u.accesoTotal),
      permisos: isMaster ? [...ALL_PERMISSION_VIEW_IDS] : [...effective],
    });
    setIsUserFormOpen(true);
  };

  const handleRoleChange = (newRol: UserRole) => {
    const defaults = getDefaultPermissionsForRole(newRol);
    setUserFormData(prev => ({
      ...prev,
      rol: newRol,
      // For brand-new users (or when toggling to SUPER_ADMIN), apply the role preset cleanly;
      // for existing users changing roles, also update preset unless they prefer adjusting checkboxes afterwards
      accesoTotal: defaults.accesoTotal,
      permisos: [...defaults.permisos],
    }));
  };

  const togglePartPermission = (partId: string) => {
    if (userFormData.accesoTotal) {
      // Switching off full-access when unchecking a specific part
      const next = ALL_PERMISSION_VIEW_IDS.filter(id => id !== partId);
      setUserFormData(prev => ({ ...prev, accesoTotal: false, permisos: next }));
      return;
    }

    setUserFormData(prev => {
      const exists = prev.permisos.includes(partId);
      const next = exists
        ? prev.permisos.filter(id => id !== partId)
        : [...prev.permisos, partId];
      return {
        ...prev,
        accesoTotal: next.length === ALL_PERMISSION_VIEW_IDS.length,
        permisos: next,
      };
    });
  };

  const toggleModuleAllParts = (partIds: string[]) => {
    const currentEffective = userFormData.accesoTotal
      ? ALL_PERMISSION_VIEW_IDS
      : userFormData.permisos;
    const allSelected = partIds.every(id => currentEffective.includes(id));

    let next: string[];
    if (allSelected) {
      next = currentEffective.filter(id => !partIds.includes(id));
    } else {
      const set = new Set([...currentEffective, ...partIds]);
      next = Array.from(set);
    }

    setUserFormData(prev => ({
      ...prev,
      accesoTotal: next.length === ALL_PERMISSION_VIEW_IDS.length,
      permisos: next,
    }));
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUsername = userFormData.username.trim();
    if (!cleanUsername) {
      setFormError('El nombre de usuario es obligatorio.');
      return;
    }
    if (!userFormData.password.trim()) {
      setFormError('La contraseña de acceso no puede estar vacía.');
      return;
    }

    const exists = users.find(
      u => u.username.toLowerCase() === cleanUsername.toLowerCase() && u.id !== editingUser?.id
    );
    if (exists) {
      setFormError('Ya existe otro usuario con ese nombre de acceso.');
      return;
    }

    const isSuperAdminAccount =
      editingUser?.username === 'ideasinfernal' || userFormData.rol === 'SUPER_ADMIN';
    const finalAccesoTotal = isSuperAdminAccount ? true : userFormData.accesoTotal;
    const finalPermisos = finalAccesoTotal
      ? [...ALL_PERMISSION_VIEW_IDS]
      : [...userFormData.permisos];

    if (!finalAccesoTotal && finalPermisos.length === 0) {
      setFormError('Seleccioná al menos un módulo o parte del sistema para que este usuario pueda operar.');
      return;
    }

    let updatedUsers: SystemUser[];
    if (editingUser) {
      updatedUsers = users.map(u => {
        if (u.id === editingUser.id) {
          return {
            ...u,
            username: cleanUsername,
            password: userFormData.password,
            nombre: userFormData.nombre.trim() || cleanUsername,
            email: userFormData.email.trim() || `${cleanUsername}@lahormiga.com`,
            rol: userFormData.rol,
            telefono: userFormData.telefono.trim(),
            activo: u.username === 'ideasinfernal' ? true : userFormData.activo,
            accesoTotal: finalAccesoTotal,
            permisos: finalPermisos,
          };
        }
        return u;
      });
    } else {
      const newUser: SystemUser = {
        id: `USR-${Date.now()}`,
        username: cleanUsername,
        password: userFormData.password,
        nombre: userFormData.nombre.trim() || cleanUsername,
        email: userFormData.email.trim() || `${cleanUsername}@lahormiga.com`,
        rol: userFormData.rol,
        telefono: userFormData.telefono.trim(),
        activo: userFormData.activo,
        accesoTotal: finalAccesoTotal,
        permisos: finalPermisos,
        createdAt: new Date().toISOString(),
      };
      updatedUsers = [...users, newUser];
    }

    setSaving(true);
    const res = await saveSystemUsersAsync(updatedUsers);
    setSaving(false);

    if (!res.ok) {
      setFormError(res.error || 'No se pudo guardar en Supabase.');
      return;
    }

    setUsers(updatedUsers);
    onUsersUpdated?.(updatedUsers);
    setIsUserFormOpen(false);
    showTempSuccess(
      editingUser
        ? `Usuario "${cleanUsername}" y permisos actualizados en Supabase.`
        : `Usuario "${cleanUsername}" creado con permisos asignados en Supabase.`
    );
  };

  const handleToggleUserActive = async (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    if (target.username === 'ideasinfernal') {
      setBannerError('No se puede desactivar al Super Administrador principal.');
      return;
    }

    const updated = users.map(u => (u.id === userId ? { ...u, activo: !u.activo } : u));
    setSaving(true);
    const res = await saveSystemUsersAsync(updated);
    setSaving(false);

    if (!res.ok) {
      setBannerError(res.error || 'No se pudo actualizar el estado en Supabase.');
      return;
    }

    setUsers(updated);
    onUsersUpdated?.(updated);
    showTempSuccess(
      `Usuario @${target.username} ${!target.activo ? 'habilitado' : 'desactivado'} correctamente.`
    );
  };

  const handleDeleteUser = (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    if (target.username === 'ideasinfernal') {
      setBannerError('No es posible eliminar la cuenta del Super Administrador principal.');
      return;
    }
    if (currentUser?.id === userId) {
      setBannerError('No podés eliminar el usuario con el que estás logueado actualmente.');
      return;
    }

    setDeleteTarget({
      title: '¿Realmente desea eliminar este usuario del sistema?',
      itemName: `Usuario: ${target.nombre || target.username} (@${target.username})`,
      onConfirm: async () => {
        const updated = users.filter(u => u.id !== userId);
        const res = await saveSystemUsersAsync(updated);
        if (!res.ok) {
          setBannerError(res.error || 'No se pudo eliminar el usuario en Supabase.');
          return;
        }
        setUsers(updated);
        onUsersUpdated?.(updated);
        showTempSuccess(`Usuario @${target.username} eliminado de Supabase.`);
      },
    });
  };

  const getModuleSummaryBadges = (u: SystemUser) => {
    if (u.username === 'ideasinfernal' || u.rol === 'SUPER_ADMIN' || u.accesoTotal) {
      return { isFull: true, labels: ['Acceso Total a todos los módulos'] };
    }
    const effective = getEffectivePermissions(u);
    const labels = SYSTEM_PERMISSION_MODULES.filter(m =>
      m.parts.some(p => effective.includes(p.id))
    ).map(m => {
      const count = m.parts.filter(p => effective.includes(p.id)).length;
      const total = m.parts.length;
      return count === total ? m.label.split('&')[0].trim() : `${m.label.split('&')[0].trim()} (${count}/${total})`;
    });
    return { isFull: false, labels, count: effective.length };
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      {!compact && (
        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0C800]/10 border border-[#F0C800]/30 text-[#F0C800] text-[11px] font-black uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Control de Acceso & Permisos</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight font-display">
              Usuarios y Permisos por Módulo
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Creá cuentas de acceso para tu equipo y elegí exactamente a qué módulos y secciones del sistema puede entrar cada persona. Guardado en Supabase.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={refreshFromCloud}
              disabled={loadingCloud}
              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title="Actualizar usuarios desde Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCloud ? 'animate-spin' : ''}`} />
              <span>Sincronizar</span>
            </button>
            <button
              type="button"
              onClick={handleOpenCreateUser}
              className="px-4 py-2.5 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] rounded-xl text-xs font-black flex items-center gap-2 transition shadow-md shadow-[#F0C800]/20 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Crear Usuario</span>
            </button>
          </div>
        </div>
      )}

      {compact && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1A1E26] border border-slate-800 rounded-2xl p-5">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#F0C800]" />
              <span>Usuarios y Permisos de Acceso por Módulo</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Creá usuarios y tildá exactamente qué módulos y partes del sistema puede ver cada persona.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateUser}
            className="px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] rounded-xl text-xs font-black flex items-center space-x-1.5 transition shadow-md cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4 stroke-[2.5]" />
            <span>Crear Nuevo Usuario</span>
          </button>
        </div>
      )}

      {/* Alerts */}
      {bannerError && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{bannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="text-rose-300 hover:text-white p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {bannerSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{bannerSuccess}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111317] text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <th className="py-3.5 px-4">Usuario / Persona</th>
                <th className="py-3.5 px-4">Rol</th>
                <th className="py-3.5 px-4">Módulos y Partes Habilitadas</th>
                <th className="py-3.5 px-4">Contacto</th>
                <th className="py-3.5 px-4 text-center">Estado</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs text-slate-300">
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    {loadingCloud
                      ? 'Cargando usuarios autorizados desde Supabase...'
                      : 'No hay usuarios cargados todavía o no se pudo sincronizar con Supabase.'}
                  </td>
                </tr>
              )}
              {users.map(u => {
                const isSuperAdmin = u.username === 'ideasinfernal';
                const summary = getModuleSummaryBadges(u);
                return (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-amber-400 shrink-0">
                          {u.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                            <span>{u.nombre}</span>
                            {isSuperAdmin && (
                              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-black border border-amber-500/30">
                                SUPER ADMIN
                              </span>
                            )}
                            {currentUser?.id === u.id && (
                              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold border border-emerald-500/30">
                                TÚ
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase border ${
                          u.rol === 'SUPER_ADMIN' || u.rol === 'ADMINISTRADOR'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : u.rol === 'ENCARGADO_OBRA'
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                            : u.rol === 'OPERARIO_CHOFER'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                        }`}
                      >
                        {u.rol.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      {summary.isFull ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/30 text-[10px] font-black">
                          <Unlock className="w-3 h-3" />
                          <span>Acceso Total (Todos los módulos)</span>
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {summary.labels.length > 0 ? (
                            summary.labels.map(lbl => (
                              <span
                                key={lbl}
                                className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px] text-slate-200 font-medium"
                              >
                                {lbl}
                              </span>
                            ))
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-bold">
                              <Lock className="w-3 h-3" />
                              Sin módulos habilitados
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div>{u.email}</div>
                      {u.telefono && <div className="text-[11px] text-slate-500">{u.telefono}</div>}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleUserActive(u.id)}
                        disabled={isSuperAdmin || saving}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                          u.activo
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                        } ${isSuperAdmin ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {u.activo ? 'ACTIVO' : 'INACTIVO'}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditUser(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-200 hover:text-[#2D2D2D] bg-slate-800 hover:bg-[#F0C800] text-[11px] font-bold transition cursor-pointer"
                        title="Editar usuario, contraseña y permisos"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Permisos / Editar</span>
                      </button>
                      {!isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer align-middle"
                          title="Eliminar usuario"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Creación / Edición de Usuario + Matriz de Permisos */}
      {isUserFormOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-[#1C2028] border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl my-auto flex flex-col max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#14171D] border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F0C800]/15 border border-[#F0C800]/30 text-[#F0C800] flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white">
                    {editingUser ? `Editar Usuario: @${editingUser.username}` : 'Crear Nuevo Usuario & Permisos'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Definí las credenciales y elegí los módulos y sub-partes habilitadas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUserFormOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              {/* Credenciales y Datos Básicos */}
              <div className="bg-[#14171D] border border-slate-800 rounded-2xl p-4 space-y-3.5">
                <h5 className="text-xs font-black uppercase tracking-wider text-[#F0C800]">
                  1. Datos de Ingreso y Rol Base
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Usuario (Login) *
                    </label>
                    <input
                      type="text"
                      value={userFormData.username}
                      onChange={e => setUserFormData({ ...userFormData, username: e.target.value })}
                      placeholder="ej: juanperez"
                      disabled={editingUser?.username === 'ideasinfernal'}
                      className="w-full bg-[#0F1115] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800] focus:outline-none disabled:opacity-60"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Contraseña *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={userFormData.password}
                        onChange={e => setUserFormData({ ...userFormData, password: e.target.value })}
                        placeholder="••••••••••••"
                        className="w-full bg-[#0F1115] border border-slate-700 rounded-xl px-3 py-2 pr-9 text-xs text-white focus:border-[#F0C800] focus:outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nombre y Apellido *
                    </label>
                    <input
                      type="text"
                      value={userFormData.nombre}
                      onChange={e => setUserFormData({ ...userFormData, nombre: e.target.value })}
                      placeholder="ej: Juan Pérez"
                      className="w-full bg-[#0F1115] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800] focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Rol Base (Plantilla rápida)
                    </label>
                    <select
                      value={userFormData.rol}
                      onChange={e => handleRoleChange(e.target.value as UserRole)}
                      disabled={editingUser?.username === 'ideasinfernal'}
                      className="w-full bg-[#0F1115] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800] focus:outline-none disabled:opacity-60"
                    >
                      <option value="ENCARGADO_OBRA">Encargado de Obra</option>
                      <option value="ADMINISTRADOR">Administrador</option>
                      <option value="VENTAS_FERRETERIA">Ventas & Facturación</option>
                      <option value="OPERARIO_CHOFER">Operario / Chofer</option>
                      <option value="SUPER_ADMIN">Super Administrador</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={userFormData.email}
                      onChange={e => setUserFormData({ ...userFormData, email: e.target.value })}
                      placeholder="usuario@lahormiga.com"
                      className="w-full bg-[#0F1115] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Teléfono
                    </label>
                    <input
                      type="text"
                      value={userFormData.telefono}
                      onChange={e => setUserFormData({ ...userFormData, telefono: e.target.value })}
                      placeholder="+54 9 388 ..."
                      className="w-full bg-[#0F1115] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-[#F0C800] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userFormData.activo}
                      onChange={e => setUserFormData({ ...userFormData, activo: e.target.checked })}
                      disabled={editingUser?.username === 'ideasinfernal'}
                      className="w-4 h-4 rounded accent-[#F0C800]"
                    />
                    <span className="text-xs text-slate-200 font-semibold">
                      Usuario habilitado para ingresar al sistema
                    </span>
                  </label>

                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F0C800]/10 border border-[#F0C800]/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userFormData.accesoTotal}
                      disabled={
                        editingUser?.username === 'ideasinfernal' || userFormData.rol === 'SUPER_ADMIN'
                      }
                      onChange={e => {
                        const checked = e.target.checked;
                        setUserFormData(prev => ({
                          ...prev,
                          accesoTotal: checked,
                          permisos: checked ? [...ALL_PERMISSION_VIEW_IDS] : prev.permisos,
                        }));
                      }}
                      className="w-4 h-4 rounded accent-[#F0C800]"
                    />
                    <span className="text-xs text-[#F0C800] font-black">
                      Acceso Total a todo el Sistema
                    </span>
                  </label>
                </div>
              </div>

              {/* Matriz de Acceso a Módulos y Partes */}
              <div className="bg-[#14171D] border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h5 className="text-xs font-black uppercase tracking-wider text-[#F0C800]">
                      2. Acceso por Módulos y Partes del Sistema
                    </h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tildá los módulos completos o partes específicas que este usuario podrá ver y usar.
                    </p>
                  </div>

                  {editingUser?.username !== 'ideasinfernal' && userFormData.rol !== 'SUPER_ADMIN' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setUserFormData(prev => ({
                            ...prev,
                            accesoTotal: true,
                            permisos: [...ALL_PERMISSION_VIEW_IDS],
                          }))
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-700 cursor-pointer"
                      >
                        Marcar Todo
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setUserFormData(prev => ({
                            ...prev,
                            accesoTotal: false,
                            permisos: [],
                          }))
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 cursor-pointer"
                      >
                        Limpiar Todo
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {SYSTEM_PERMISSION_MODULES.map(mod => {
                    const effectiveList = userFormData.accesoTotal
                      ? ALL_PERMISSION_VIEW_IDS
                      : userFormData.permisos;
                    const partIds = mod.parts.map(p => p.id);
                    const selectedCount = partIds.filter(id => effectiveList.includes(id)).length;
                    const allChecked = selectedCount === partIds.length;
                    const isLockedMaster =
                      editingUser?.username === 'ideasinfernal' || userFormData.rol === 'SUPER_ADMIN';

                    return (
                      <div
                        key={mod.key}
                        className={`rounded-xl border p-3.5 transition ${
                          selectedCount > 0
                            ? 'bg-[#191D25] border-[#F0C800]/35'
                            : 'bg-[#111317] border-slate-800 opacity-85'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800/80">
                          <label className="flex items-start gap-2.5 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={allChecked}
                              disabled={isLockedMaster}
                              onChange={() => toggleModuleAllParts(partIds)}
                              className="mt-0.5 w-4 h-4 rounded accent-[#F0C800]"
                            />
                            <div>
                              <span className="text-xs font-black text-white block">
                                {mod.label}
                              </span>
                              <span className="text-[10px] text-slate-400 block leading-tight mt-0.5">
                                {mod.description}
                              </span>
                            </div>
                          </label>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0 ${
                              selectedCount > 0
                                ? 'bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/30'
                                : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {selectedCount}/{partIds.length}
                          </span>
                        </div>

                        <div className="space-y-1.5 pl-1">
                          {mod.parts.map(part => {
                            const checked = effectiveList.includes(part.id);
                            return (
                              <label
                                key={part.id}
                                className={`flex items-start gap-2 p-1.5 rounded-lg transition cursor-pointer ${
                                  checked ? 'bg-slate-800/60' : 'hover:bg-slate-800/30'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={isLockedMaster}
                                  onChange={() => togglePartPermission(part.id)}
                                  className="mt-0.5 w-3.5 h-3.5 rounded accent-[#F0C800]"
                                />
                                <div className="min-w-0 flex-1">
                                  <span className="text-[11px] font-bold text-slate-200 block leading-tight">
                                    {part.label}
                                  </span>
                                  <span className="text-[10px] text-slate-500 block leading-tight">
                                    {part.description}
                                  </span>
                                </div>
                                {checked && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsUserFormOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] text-xs font-black rounded-xl transition shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando en Supabase...</span>
                    </>
                  ) : (
                    <span>{editingUser ? 'Guardar Usuario y Permisos' : 'Crear Usuario y Guardar'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        title={deleteTarget?.title}
        itemName={deleteTarget?.itemName || ''}
        onConfirm={async () => {
          const fn = deleteTarget?.onConfirm;
          setDeleteTarget(null);
          if (fn) await fn();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
