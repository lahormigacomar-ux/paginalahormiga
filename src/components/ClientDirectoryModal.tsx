import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  Edit3,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  X
} from 'lucide-react';
import { ClientRecord } from '../types';

interface ClientDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectClient?: (client: ClientRecord) => void;
  onClientsUpdated?: (clients: ClientRecord[]) => void;
  initialEditClient?: Partial<ClientRecord> | null;
  title?: string;
}

const IVA_CONDITIONS = [
  { value: 'RESPONSABLE_INSCRIPTO', label: 'IVA Responsable Inscripto' },
  { value: 'MONOTRIBUTO', label: 'Responsable Monotributo' },
  { value: 'EXENTO', label: 'IVA Sujeto Exento' },
  { value: 'CONSUMIDOR_FINAL', label: 'Consumidor Final' },
  { value: 'NO_RESPONSABLE', label: 'No Responsable' },
];

export const ClientDirectoryModal: React.FC<ClientDirectoryModalProps> = ({
  isOpen,
  onClose,
  onSelectClient,
  onClientsUpdated,
  initialEditClient = null,
  title = 'Agenda & Alta de Clientes (Supabase)',
}) => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyFormalClients, setOnlyFormalClients] = useState(false);

  // Create / Edit Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpPadron, setIsLookingUpPadron] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [formState, setFormState] = useState<Partial<ClientRecord>>({
    id: '',
    codigo: '',
    cuit: '',
    razonSocial: '',
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    condicionVenta: 'CONTADO / TRANSFERENCIA',
    domicilio: '',
    localidad: 'SAN SALVADOR DE JUJUY',
    zona: '',
    telefono: '',
    email: '',
    notas: '',
  });

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/clients/search');
      if (res.ok) {
        const data = await res.json();
        const list: ClientRecord[] = Array.isArray(data.clients) ? data.clients : [];
        setClients(list);
        if (onClientsUpdated) onClientsUpdated(list);
      }
    } catch (err) {
      console.warn('Error cargando clientes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setStatusMessage(null);
      setDeleteConfirmId(null);
      loadClients();
      if (initialEditClient) {
        setFormState({
          id: initialEditClient.id || '',
          codigo: initialEditClient.codigo || '',
          cuit: initialEditClient.cuit || '',
          razonSocial: initialEditClient.razonSocial || '',
          condicionIva: initialEditClient.condicionIva || 'RESPONSABLE_INSCRIPTO',
          condicionVenta: initialEditClient.condicionVenta || 'CONTADO / TRANSFERENCIA',
          domicilio: initialEditClient.domicilio || '',
          localidad: initialEditClient.localidad || 'SAN SALVADOR DE JUJUY',
          zona: initialEditClient.zona || '',
          telefono: initialEditClient.telefono || '',
          email: initialEditClient.email || '',
          notas: initialEditClient.notas || '',
        });
        setIsFormOpen(true);
      } else {
        setIsFormOpen(false);
      }
    }
  }, [isOpen, initialEditClient]);

  const handleOpenNewForm = () => {
    setStatusMessage(null);
    setFormState({
      id: '',
      codigo: '',
      cuit: '',
      razonSocial: '',
      condicionIva: 'RESPONSABLE_INSCRIPTO',
      condicionVenta: 'CONTADO / TRANSFERENCIA',
      domicilio: '',
      localidad: 'SAN SALVADOR DE JUJUY',
      zona: '',
      telefono: '',
      email: '',
      notas: '',
    });
    setIsFormOpen(true);
  };

  const handleEditClient = (c: ClientRecord) => {
    setStatusMessage(null);
    setFormState({
      id: c.id || '',
      codigo: c.codigo || '',
      cuit: c.cuit || '',
      razonSocial: c.razonSocial || '',
      condicionIva: c.condicionIva || 'RESPONSABLE_INSCRIPTO',
      condicionVenta: c.condicionVenta || 'CONTADO / TRANSFERENCIA',
      domicilio: c.domicilio || '',
      localidad: c.localidad || 'SAN SALVADOR DE JUJUY',
      zona: c.zona || '',
      telefono: c.telefono || '',
      email: c.email || '',
      notas: c.notas || '',
    });
    setIsFormOpen(true);
  };

  const handleLookupPadron = async () => {
    const clean = String(formState.cuit || '').replace(/\D/g, '');
    if (clean.length < 7) {
      setStatusMessage({ type: 'err', text: 'Ingresá un CUIT o DNI válido (mínimo 7 dígitos) para consultar AFIP/ARCA.' });
      return;
    }
    setIsLookingUpPadron(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/arca/padron/${clean}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setFormState((prev) => ({
          ...prev,
          cuit: data.cuit || clean,
          razonSocial: data.razonSocial || prev.razonSocial || '',
          condicionIva: data.condicionIva || prev.condicionIva || 'RESPONSABLE_INSCRIPTO',
          domicilio: data.domicilio || prev.domicilio || '',
          localidad: data.localidad || prev.localidad || 'SAN SALVADOR DE JUJUY',
          zona: data.zona || prev.zona || '',
        }));
        setStatusMessage({
          type: 'ok',
          text: `Datos importados desde ${data.fuente || 'Padrón ARCA/AFIP'}.`,
        });
      } else {
        setStatusMessage({
          type: 'err',
          text: data?.error || 'No se encontraron datos en Padrón AFIP para ese CUIT.',
        });
      }
    } catch {
      setStatusMessage({ type: 'err', text: 'Error de conexión consultando Padrón AFIP.' });
    } finally {
      setIsLookingUpPadron(false);
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const rs = String(formState.razonSocial || '').trim();
    const cuit = String(formState.cuit || '').replace(/\D/g, '');
    if (!rs && !cuit) {
      setStatusMessage({ type: 'err', text: 'Ingresá al menos la Razón Social o el CUIT / DNI del cliente.' });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/clients/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formState,
          razonSocial: rs,
          cuit,
          fuente: 'ALTA_MANUAL',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStatusMessage({ type: 'err', text: data?.error || 'No se pudo guardar el cliente en Supabase.' });
        return;
      }

      setStatusMessage({
        type: 'ok',
        text: `Cliente ${data.client.razonSocial} guardado (${data.client.codigo || 'Registrado'}).`,
      });
      setIsFormOpen(false);
      await loadClients();
    } catch {
      setStatusMessage({ type: 'err', text: 'Error de red al guardar cliente en Supabase.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClient = async (id: string) => {
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirmId(null);
        setStatusMessage({ type: 'ok', text: 'Cliente eliminado de la agenda oficial.' });
        await loadClients();
      } else {
        setStatusMessage({ type: 'err', text: 'No se pudo eliminar el cliente.' });
      }
    } catch {
      setStatusMessage({ type: 'err', text: 'Error de red eliminando cliente.' });
    }
  };

  const filteredClients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return clients.filter((c) => {
      if (onlyFormalClients && !c.savedInClientsTable) return false;
      if (!q) return true;
      return (
        (c.razonSocial || '').toLowerCase().includes(q) ||
        (c.codigo || '').toLowerCase().includes(q) ||
        (qDigits.length >= 2 && (c.cuit || '').includes(qDigits)) ||
        (c.domicilio || '').toLowerCase().includes(q) ||
        (c.localidad || '').toLowerCase().includes(q)
      );
    });
  }, [clients, searchTerm, onlyFormalClients]);

  const savedCount = useMemo(() => clients.filter((c) => c.savedInClientsTable).length, [clients]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-[#12151B] border border-slate-700/80 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-black/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>{title}</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {savedCount} en ficha • {clients.length} total
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Los clientes también se crean automáticamente con código CLI-XXXX al facturar o generar contratos de alquiler.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenNewForm}
              className="px-3.5 py-2 rounded-xl bg-[#F0C800] hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nuevo Cliente
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`px-5 py-2.5 text-xs font-semibold border-b flex items-center justify-between ${
              statusMessage.type === 'ok'
                ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/60 border-rose-800/60 text-rose-300'
            }`}
          >
            <span>{statusMessage.text}</span>
            <button type="button" onClick={() => setStatusMessage(null)} className="text-xs opacity-70 hover:opacity-100 cursor-pointer">
              Cerrar
            </button>
          </div>
        )}

        {/* Create / Edit Client Form */}
        {isFormOpen && (
          <form onSubmit={handleSaveClient} className="p-5 bg-[#16191F] border-b border-slate-800 space-y-4 overflow-y-auto max-h-[55vh]">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#F0C800] flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                {formState.id ? 'Editar Ficha de Cliente' : 'Alta Manual de Nuevo Cliente'}
              </h4>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Ocultar formulario
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Código Cliente</label>
                <input
                  type="text"
                  value={formState.codigo || ''}
                  onChange={(e) => setFormState({ ...formState, codigo: e.target.value.toUpperCase() })}
                  placeholder="Auto (Ej: CLI-0001)"
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl px-3 py-2 text-xs text-amber-300 font-mono font-bold focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-300 mb-1">CUIT / DNI *</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={formState.cuit || ''}
                    onChange={(e) => setFormState({ ...formState, cuit: e.target.value })}
                    placeholder="Ej: 30717657167"
                    className="flex-1 bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleLookupPadron}
                    disabled={isLookingUpPadron}
                    className="px-2.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Consultar CUIT en AFIP / ARCA"
                  >
                    {isLookingUpPadron ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    AFIP
                  </button>
                </div>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Razón Social / Nombre *</label>
                <input
                  type="text"
                  required
                  value={formState.razonSocial || ''}
                  onChange={(e) => setFormState({ ...formState, razonSocial: e.target.value })}
                  placeholder="Ej: ELECTROMONTAJES NOA S.R.L."
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl px-3 py-2 text-xs text-white font-bold uppercase focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Condición Frente al IVA</label>
                <select
                  value={formState.condicionIva || 'RESPONSABLE_INSCRIPTO'}
                  onChange={(e) => setFormState({ ...formState, condicionIva: e.target.value })}
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  {IVA_CONDITIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Condición de Venta</label>
                <input
                  type="text"
                  value={formState.condicionVenta || ''}
                  onChange={(e) => setFormState({ ...formState, condicionVenta: e.target.value })}
                  placeholder="CONTADO / CTA CTE 30 DÍAS"
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Domicilio Fiscal / Obra</label>
                <input
                  type="text"
                  value={formState.domicilio || ''}
                  onChange={(e) => setFormState({ ...formState, domicilio: e.target.value })}
                  placeholder="Dirección completa"
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Localidad</label>
                <input
                  type="text"
                  value={formState.localidad || ''}
                  onChange={(e) => setFormState({ ...formState, localidad: e.target.value })}
                  placeholder="SAN SALVADOR DE JUJUY"
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Teléfono / WhatsApp</label>
                <input
                  type="text"
                  value={formState.telefono || ''}
                  onChange={(e) => setFormState({ ...formState, telefono: e.target.value })}
                  placeholder="Ej: 388-..."
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={formState.email || ''}
                  onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                  placeholder="administracion@empresa.com"
                  className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar Cliente en Supabase
              </button>
            </div>
          </form>
        )}

        {/* Search & Filter Toolbar */}
        <div className="px-5 py-3 bg-[#16191F] border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por Razón Social, CUIT, código CLI-XXXX o domicilio..."
              className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setOnlyFormalClients((p) => !p)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
              onlyFormalClients
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : 'bg-[#0F1115] text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
          >
            {onlyFormalClients ? 'Solo Ficha Oficial (Clientes)' : 'Todos (Ficha + Historial BD)'}
          </button>

          <button
            type="button"
            onClick={loadClients}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Client List */}
        <div className="flex-1 overflow-y-auto p-5 bg-[#0B0D11] space-y-2.5">
          {isLoading && clients.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#F0C800]" />
              <span>Consultando clientes en Supabase...</span>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-800 rounded-2xl space-y-2">
              <Building2 className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">No se encontraron clientes con ese criterio</p>
              <button
                type="button"
                onClick={handleOpenNewForm}
                className="px-4 py-2 rounded-xl bg-[#F0C800] text-black text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Dar de alta un cliente
              </button>
            </div>
          ) : (
            filteredClients.map((c, idx) => {
              const key = c.id || `${c.cuit}-${c.razonSocial}-${idx}`;
              const isFormal = Boolean(c.savedInClientsTable);
              return (
                <div
                  key={key}
                  className="p-3.5 rounded-xl bg-[#16191F] border border-slate-800 hover:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3 transition"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {c.codigo ? (
                        <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded bg-amber-500/15 text-[#F0C800] border border-amber-500/30">
                          {c.codigo}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          Historial {c.fuente || 'BD'}
                        </span>
                      )}
                      <span className="text-sm font-black text-white truncate">{c.razonSocial || 'SIN NOMBRE'}</span>
                      {c.cuit && (
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          CUIT/DNI: {c.cuit}
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {c.condicionIva || 'RESPONSABLE_INSCRIPTO'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                      {c.domicilio && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          {c.domicilio} {c.localidad ? `(${c.localidad})` : ''}
                        </span>
                      )}
                      {c.telefono && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-500" />
                          {c.telefono}
                        </span>
                      )}
                      {c.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-500" />
                          {c.email}
                        </span>
                      )}
                      {c.ultimoComprobante && (
                        <span className="text-slate-500 font-mono">Último comp.: {c.ultimoComprobante}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onSelectClient && (
                      <button
                        type="button"
                        onClick={async () => {
                          // If selecting a historical entry not yet saved in formal clients table, register it cleanly too
                          if (!isFormal && (c.razonSocial || c.cuit)) {
                            try {
                              const res = await fetch('/api/clients/upsert', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(c),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                if (data?.client) {
                                  onSelectClient(data.client);
                                  onClose();
                                  return;
                                }
                              }
                            } catch {
                              // fallback to c
                            }
                          }
                          onSelectClient(c);
                          onClose();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Seleccionar
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleEditClient(c)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      title={isFormal ? 'Editar cliente' : 'Guardar en ficha oficial de Clientes'}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{isFormal ? 'Editar' : 'Dar de Alta'}</span>
                    </button>

                    {isFormal && c.id && (
                      deleteConfirmId === c.id ? (
                        <div className="flex items-center gap-1 bg-rose-950/70 border border-rose-500/40 rounded-xl px-2 py-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteClient(c.id)}
                            className="text-[11px] font-black text-rose-300 hover:text-white px-1.5 py-0.5 cursor-pointer"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-[11px] text-slate-400 hover:text-white px-1 cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(c.id)}
                          className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                          title="Eliminar de Clientes"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
