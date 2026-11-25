import React, { useState, useEffect } from 'react';
import { Database, Cloud, CheckCircle2, XCircle, AlertTriangle, RefreshCw, UploadCloud, DownloadCloud, Server, ShieldCheck, Copy, Check, Users, Trash2, BarChart3, Sparkles } from 'lucide-react';
import {
  checkSystemStatus,
  DbStatusResponse,
  apiSaveItemsStrict,
  apiFetchDbAudit,
  apiMigrateBase64ToR2,
  DbAuditResponse,
  MigrateBase64Response,
} from '../services/api';
import { Vehicle, Employee, FuelDispensary, FuelDeposit, IssuedFuelVoucher, Obra, ParteDiario, RentalContract, HardwareProduct, AridoProduct, SoilService } from '../types';

interface DatabaseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  fleet: Vehicle[];
  drivers: Employee[];
  fuelVouchers: FuelDispensary[];
  fuelDeposits: FuelDeposit[];
  issuedVouchers: IssuedFuelVoucher[];
  obras: Obra[];
  partesDiarios: ParteDiario[];
  rentals?: RentalContract[];
  hardwareProducts?: HardwareProduct[];
  aridos?: AridoProduct[];
  soilServices?: SoilService[];
  supabaseRegistrosCount?: number;
  supabaseUsuariosCount?: number;
  onDataSynced?: () => void;
  onPullFromCloud?: () => Promise<void> | void;
  onClearAllData?: () => Promise<void> | void;
}

export const DatabaseStatusModal: React.FC<DatabaseStatusModalProps> = ({
  isOpen,
  onClose,
  fleet,
  drivers,
  fuelVouchers,
  fuelDeposits,
  issuedVouchers,
  obras,
  partesDiarios,
  rentals = [],
  hardwareProducts = [],
  aridos = [],
  soilServices = [],
  supabaseRegistrosCount = 0,
  supabaseUsuariosCount = 0,
  onDataSynced,
  onPullFromCloud,
  onClearAllData,
}) => {
  const [status, setStatus] = useState<DbStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditData, setAuditData] = useState<DbAuditResponse | null>(null);
  const [migratingBase64, setMigratingBase64] = useState(false);
  const [migrateResult, setMigrateResult] = useState<MigrateBase64Response | null>(null);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleRunAudit = async () => {
    setAuditLoading(true);
    setMigrateResult(null);
    const res = await apiFetchDbAudit();
    setAuditData(res);
    setAuditLoading(false);
  };

  const handleMigrateBase64 = async () => {
    setMigratingBase64(true);
    const res = await apiMigrateBase64ToR2();
    setMigrateResult(res);
    setMigratingBase64(false);
    if (res.ok) {
      await handleRunAudit();
      if (onPullFromCloud) {
        await onPullFromCloud();
      }
    }
  };

  const loadStatus = async () => {
    setLoading(true);
    const s = await checkSystemStatus();
    setStatus(s);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      setSyncResult(null);
    }
  }, [isOpen]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSyncToDatabase = async () => {
    const isConnected = status?.supabaseDb?.connected;
    if (!isConnected) {
      setSyncResult({
        success: false,
        message: 'No se puede sincronizar: Supabase PostgreSQL no está disponible en este momento. Verificá las credenciales de conexión.',
      });
      return;
    }

    setSyncing(true);
    setSyncResult(null);

    try {
      const syncNonEmpty = <T,>(table: string, items: T[]) =>
        items.length > 0 ? apiSaveItemsStrict(table, items) : Promise.resolve({ ok: true });

      const results = await Promise.all([
        syncNonEmpty('vehicles', fleet),
        syncNonEmpty('fuel_vouchers', fuelVouchers),
        syncNonEmpty('partes_diarios', partesDiarios),
        syncNonEmpty('drivers', drivers),
        syncNonEmpty('obras', obras),
        syncNonEmpty('fuel_deposits', fuelDeposits),
        syncNonEmpty('issued_vouchers', issuedVouchers),
        syncNonEmpty('rentals', rentals),
        syncNonEmpty('hardware', hardwareProducts),
        syncNonEmpty('aridos', aridos),
      ]);

      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        throw new Error(failed.map(f => ('error' in f ? f.error : undefined) || 'Error de escritura').join(' | '));
      }

      setSyncResult({
        success: true,
        message: `¡Sincronización confirmada en Supabase PostgreSQL! (${fleet.length} vehículos, ${fuelVouchers.length} cargas, ${partesDiarios.length} partes diarios, ${drivers.length} choferes, ${fuelDeposits.length} depósitos, ${obras.length} obras, ${rentals.length} alquileres, ${hardwareProducts.length} artículos, ${aridos.length} áridos).`,
      });

      if (onDataSynced) {
        onDataSynced();
      }
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: `Error durante la sincronización con Supabase: ${err.message || 'Error desconocido'}`,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handlePull = async () => {
    if (!onPullFromCloud) return;
    setPulling(true);
    setSyncResult(null);
    try {
      await onPullFromCloud();
      setSyncResult({
        success: true,
        message: '¡Datos actualizados desde la nube con éxito!',
      });
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: `Error al recargar desde la nube: ${err?.message || 'Error desconocido'}`,
      });
    } finally {
      setPulling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#12141A] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Conexión a Base de Datos & Almacenamiento
              </h2>
              <p className="text-xs text-slate-400">Supabase (PostgreSQL Relacional) + Cloudflare R2 (Imágenes & Fotos)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          
          {/* Status Cards - 3 pillars: Supabase DB, Supabase Personal, Cloudflare R2 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            
            {/* 1. Supabase PostgreSQL */}
            <div className="bg-[#0F1115] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">Supabase (SQL)</span>
                  </div>
                  {status?.supabaseDb?.connected ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Conectado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> En Espera
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 leading-tight mb-1">
                  {status?.supabaseDb?.message || 'Proyecto Supabase detectado.'}
                </p>
                <p className="text-[10px] text-slate-500">Flota, Combustible, Obras, Alquileres, Ferretería, Áridos</p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                <code>SUPABASE_DB_URL / DATABASE_URL</code>
              </div>
            </div>

            {/* 2. Supabase Personal & Fichadas */}
            <div className="bg-[#0F1115] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">Supabase Realtime</span>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Activo
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-tight mb-1">
                  Personal, Fichadas y Asistencia en tiempo real.
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {supabaseRegistrosCount} fichadas • {supabaseUsuariosCount} usuarios
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                <code>VITE_SUPABASE_URL</code>
              </div>
            </div>

            {/* 3. Cloudflare R2 */}
            <div className="bg-[#0F1115] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white">Cloudflare R2</span>
                  </div>
                  {status?.cloudflareR2.configured ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Listo
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded-full">
                      <XCircle className="w-3 h-3" /> Pendiente
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 leading-tight mb-1">{status?.cloudflareR2.message}</p>
                {status?.cloudflareR2.bucket && (
                  <p className="text-[10px] text-slate-400 font-mono truncate">
                    Bucket: {status.cloudflareR2.bucket}
                  </p>
                )}
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                <code>R2_ACCOUNT_ID</code>
              </div>
            </div>

          </div>

          {/* Sync Local Data to Supabase */}
          <div className="bg-[#12141A] border border-slate-800 rounded-xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-amber-400" />
                  Sincronización Total con la Base de Datos Central
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Todas las colecciones operan directamente contra Supabase PostgreSQL sin almacenamiento local alternativo:
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {onPullFromCloud && (
                  <button
                    onClick={handlePull}
                    disabled={pulling || !status?.supabaseDb?.connected}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                    title="Cargar los datos más recientes guardados en Supabase"
                  >
                    {pulling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
                    <span>{pulling ? 'Cargando...' : 'Descargar'}</span>
                  </button>
                )}
                <button
                  onClick={handleSyncToDatabase}
                  disabled={syncing || !status?.supabaseDb?.connected}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-black text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-sm"
                >
                  {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                  <span>{syncing ? 'Sincronizando...' : 'Subir Todo a Supabase'}</span>
                </button>
              </div>
            </div>

            {/* Collection Counters Badges */}
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/60">
              <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-300 font-medium border border-slate-700/50">
                Flota: <strong className="text-white">{fleet.length}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-300 font-medium border border-slate-700/50">
                Expendio: <strong className="text-white">{fuelVouchers.length}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-300 font-medium border border-slate-700/50">
                Partes Diarios: <strong className="text-white">{partesDiarios.length}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-300 font-medium border border-slate-700/50">
                Nómina Choferes: <strong className="text-white">{drivers.length}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-300 font-medium border border-slate-700/50">
                Obras: <strong className="text-white">{obras.length}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-300 font-medium border border-slate-700/50">
                Depósitos Combustible: <strong className="text-white">{fuelDeposits.length}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-800/80 text-slate-300 font-medium border border-slate-700/50">
                Vales Emitidos: <strong className="text-white">{issuedVouchers.length}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] bg-amber-500/10 text-amber-300 font-medium border border-amber-500/30">
                Alquileres: <strong className="text-amber-200">{rentals.length}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] bg-amber-500/10 text-amber-300 font-medium border border-amber-500/30">
                Ferretería: <strong className="text-amber-200">{hardwareProducts.length}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] bg-amber-500/10 text-amber-300 font-medium border border-amber-500/30">
                Áridos: <strong className="text-amber-200">{aridos.length}</strong>
              </span>
            </div>

            {syncResult && (
              <div className={`p-3 rounded-lg text-xs mt-3 flex items-start gap-2 ${
                syncResult.success 
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300' 
                  : 'bg-red-500/10 border border-red-500/20 text-red-300'
              }`}>
                {syncResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                <span>{syncResult.message}</span>
              </div>
            )}
          </div>

          {/* Variables guide */}
          <div className="bg-[#0F1115] border border-slate-800 rounded-xl p-4">
            <h4 className="text-xs font-bold text-slate-200 mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              Variables de Entorno Requeridas (.env / Secrets)
            </h4>
            <div className="space-y-2 text-xs font-mono">
              <div className="bg-[#16191F] p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-amber-400 font-bold">DATABASE_URL / SUPABASE_DB_URL</span>
                  <p className="text-[11px] text-slate-400 font-sans mt-0.5">postgresql://postgres:[password]@db.byqzxlrbggdnzvvoigge.supabase.co:5432/postgres</p>
                </div>
                <button 
                  onClick={() => handleCopy('DATABASE_URL=""', 'db')}
                  className="text-slate-400 hover:text-white p-1" 
                  title="Copiar nombre"
                >
                  {copiedKey === 'db' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="bg-[#16191F] p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-cyan-400 font-bold">R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME</span>
                  <p className="text-[11px] text-slate-400 font-sans mt-0.5">Credenciales del bucket de Cloudflare R2 para almacenamiento de imágenes</p>
                </div>
                <button 
                  onClick={() => handleCopy('R2_ACCOUNT_ID=""\nR2_ACCESS_KEY_ID=""\nR2_SECRET_ACCESS_KEY=""\nR2_BUCKET_NAME=""\nR2_PUBLIC_URL=""', 'r2')}
                  className="text-slate-400 hover:text-white p-1" 
                  title="Copiar bloque de variables R2"
                >
                  {copiedKey === 'r2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Auditoría de Peso & Limpieza Base64 -> R2 */}
          <div className="bg-[#0F1115] border border-cyan-500/30 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-black text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  Auditoría de Peso por Tabla & Egress (Supabase)
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Detectá qué tabla pesa más y si quedaron fotos/PDFs viejos en Base64 para pasarlos a Cloudflare R2.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunAudit}
                disabled={auditLoading || !status?.supabaseDb?.connected}
                className="px-3 py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
                <span>{auditLoading ? 'Analizando...' : 'Analizar Peso por Tabla'}</span>
              </button>
            </div>

            {auditData && !auditData.ok && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {auditData.error}
              </div>
            )}

            {auditData && auditData.ok && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#16191F] border border-slate-800 rounded-lg p-2.5">
                    <span className="text-[10px] text-slate-400 block">Peso JSON Total</span>
                    <strong className="text-sm font-mono text-white">{formatBytes(auditData.totalDataBytes)}</strong>
                  </div>
                  <div className="bg-[#16191F] border border-slate-800 rounded-lg p-2.5">
                    <span className="text-[10px] text-slate-400 block">Registros con Base64</span>
                    <strong className={`text-sm font-mono ${auditData.totalBase64Rows > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {auditData.totalBase64Rows}
                    </strong>
                  </div>
                  <div className="bg-[#16191F] border border-slate-800 rounded-lg p-2.5">
                    <span className="text-[10px] text-slate-400 block">Peso Base64 Detectado</span>
                    <strong className={`text-sm font-mono ${auditData.totalBase64Bytes > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {formatBytes(auditData.totalBase64Bytes)}
                    </strong>
                  </div>
                </div>

                {auditData.totalBase64Rows > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <span className="text-[11px] text-amber-200">
                      Se detectaron <strong>{auditData.totalBase64Rows}</strong> registros con imágenes/archivos Base64 adentro de Supabase ({formatBytes(auditData.totalBase64Bytes)}). Podés migrarlos a Cloudflare R2 para ahorrar Egress.
                    </span>
                    <button
                      type="button"
                      onClick={handleMigrateBase64}
                      disabled={migratingBase64 || !auditData.r2Configured}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-400 text-black text-xs font-black flex items-center gap-1.5 transition cursor-pointer shrink-0"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${migratingBase64 ? 'animate-spin' : ''}`} />
                      <span>{migratingBase64 ? 'Migrando...' : 'Migrar Base64 a R2'}</span>
                    </button>
                  </div>
                )}

                {migrateResult && (
                  <div className={`p-2.5 rounded-lg text-xs border ${migrateResult.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                    {migrateResult.ok
                      ? `Migración completada: ${migrateResult.migratedRows} fila(s) y ${migrateResult.migratedSettings} ajuste(s) pasados a R2 (~${formatBytes(migrateResult.freedBytesEstimate)} liberados en Supabase).`
                      : migrateResult.error}
                  </div>
                )}

                <div className="max-h-44 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800/70 text-[11px]">
                  {auditData.tables.filter(t => t.rowCount > 0 || t.dataBytes > 0).map(t => (
                    <div key={t.tableName} className="px-3 py-1.5 flex items-center justify-between bg-[#16191F]/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-slate-200 truncate">{t.tableName}</span>
                        <span className="text-[10px] text-slate-500">({t.rowCount} filas)</span>
                        {t.base64Rows > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[9px] font-bold border border-amber-500/30">
                            {t.base64Rows} Base64
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-slate-300 shrink-0">{formatBytes(t.dataBytes)}</span>
                    </div>
                  ))}
                  {auditData.systemSettingsTop.filter(s => s.bytes > 1024).map(s => (
                    <div key={`cfg_${s.key}`} className="px-3 py-1.5 flex items-center justify-between bg-[#12141A]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-cyan-300 truncate">settings:{s.key}</span>
                        {s.hasBase64 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[9px] font-bold border border-amber-500/30">
                            Base64
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-slate-300 shrink-0">{formatBytes(s.bytes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Zona de Mantenimiento y Limpieza de Registros */}
          <div className="bg-[#0F1115] border border-red-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-400" />
                <h4 className="text-xs font-black text-white">Zona de Vaciado / Limpieza de Registros</h4>
              </div>
              <span className="text-[10px] text-red-400 font-mono font-bold px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                Peligro: Irreversible
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Vacía por completo los registros de todas las tablas operativas en Supabase PostgreSQL para iniciar una nueva carga limpia.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {!confirmClearAll ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="px-3.5 py-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-xs font-black flex items-center gap-2 transition cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpiar TODOS los Registros de Supabase</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 bg-red-500/10 border border-red-500/40 rounded-xl p-2.5 w-full justify-between">
                  <span className="text-[11px] font-bold text-red-200">
                    ¿Confirmás vaciar todas las tablas en Supabase? Acción irreversible.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setConfirmClearAll(false);
                        if (onClearAllData) await onClearAllData();
                      }}
                      className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-black cursor-pointer"
                    >
                      Sí, Vaciar Todo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#12141A] flex items-center justify-between">
          <button
            onClick={loadStatus}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Verificar Conexión</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
