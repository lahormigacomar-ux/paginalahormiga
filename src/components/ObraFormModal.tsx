import React, { useState, useEffect, useMemo } from 'react';
import { ClientRecord, Obra, ObraDuracionCategoria } from '../types';
import { SearchableSelect } from './SearchableSelect';
import {
  X,
  Building2,
  MapPin,
  Hash,
  DollarSign,
  Calendar,
  UserCheck,
  CheckCircle,
  Plus,
  Loader2,
  Users,
} from 'lucide-react';

interface ObraFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (obra: Obra) => void;
  editingObra?: Obra | null;
  clients?: ClientRecord[];
  obras?: Obra[];
  defaultClient?: ClientRecord | null;
  onQuickCreateClient?: (payload: Partial<ClientRecord>) => Promise<ClientRecord | null>;
}

const cleanCuit = (val?: string) => String(val || '').replace(/\D/g, '');
const cleanText = (val?: string) => String(val || '').trim().toUpperCase();

export const ObraFormModal: React.FC<ObraFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingObra,
  clients = [],
  obras = [],
  defaultClient = null,
  onQuickCreateClient,
}) => {
  const [numero, setNumero] = useState('');
  const [nombreObra, setNombreObra] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [pertenece, setPertenece] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [clienteCodigo, setClienteCodigo] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteCuit, setClienteCuit] = useState('');
  const [activa, setActiva] = useState(true);
  const [plazo, setPlazo] = useState('');
  const [montoEstimado, setMontoEstimado] = useState<number>(0);
  const [categoriaDuracion, setCategoriaDuracion] = useState<ObraDuracionCategoria>('LARGA');
  const [observaciones, setObservaciones] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Quick-create client inline drawer
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [quickClientName, setQuickClientName] = useState('');
  const [quickClientCuit, setQuickClientCuit] = useState('');
  const [quickClientTel, setQuickClientTel] = useState('');
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  useEffect(() => {
    setFormError(null);
    setShowQuickClient(false);
    setQuickClientName('');
    setQuickClientCuit('');
    setQuickClientTel('');

    if (editingObra) {
      setNumero(editingObra.numero || '');
      setNombreObra(editingObra.nombreObra || '');
      setUbicacion(editingObra.ubicacion || '');
      setPertenece(editingObra.pertenece || '');
      setActiva(editingObra.activa ?? true);
      setPlazo(editingObra.plazo || '');
      setMontoEstimado(editingObra.montoEstimado || 0);
      setCategoriaDuracion(editingObra.categoriaDuracion || 'LARGA');
      setObservaciones(editingObra.observaciones || '');

      // Resolve linked client (direct clienteId or fallback match by CUIT / Razón Social)
      let matchedClient = editingObra.clienteId
        ? clients.find((c) => c.id === editingObra.clienteId)
        : undefined;
      if (!matchedClient && editingObra.clienteCuit) {
        const cDigits = cleanCuit(editingObra.clienteCuit);
        if (cDigits.length >= 7) {
          matchedClient = clients.find((c) => cleanCuit(c.cuit) === cDigits);
        }
      }
      if (!matchedClient && (editingObra.clienteNombre || editingObra.pertenece)) {
        const targetName = cleanText(editingObra.clienteNombre || editingObra.pertenece);
        matchedClient = clients.find((c) => cleanText(c.razonSocial) === targetName);
      }

      if (matchedClient) {
        setClienteId(matchedClient.id);
        setClienteCodigo(matchedClient.codigo || '');
        setClienteNombre(matchedClient.razonSocial || '');
        setClienteCuit(matchedClient.cuit || '');
      } else {
        setClienteId(editingObra.clienteId || '');
        setClienteCodigo(editingObra.clienteCodigo || '');
        setClienteNombre(editingObra.clienteNombre || '');
        setClienteCuit(editingObra.clienteCuit || '');
      }
    } else {
      setNumero(`OBRA-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
      setNombreObra('');
      setUbicacion('');
      setActiva(true);
      setPlazo('6 meses');
      setMontoEstimado(10000000);
      setCategoriaDuracion('LARGA');
      setObservaciones('');

      if (defaultClient) {
        setClienteId(defaultClient.id);
        setClienteCodigo(defaultClient.codigo || '');
        setClienteNombre(defaultClient.razonSocial || '');
        setClienteCuit(defaultClient.cuit || '');
        setPertenece(defaultClient.razonSocial || '');
      } else {
        setClienteId('');
        setClienteCodigo('');
        setClienteNombre('');
        setClienteCuit('');
        setPertenece('');
      }
    }
  }, [editingObra, defaultClient, isOpen, clients]);

  // Count how many obras each client already has
  const obrasByClientId = useMemo(() => {
    const map = new Map<string, Obra[]>();
    for (const c of clients) {
      const cCuit = cleanCuit(c.cuit);
      const cName = cleanText(c.razonSocial);
      const list = obras.filter((o) => {
        if (editingObra && o.id === editingObra.id) return false;
        if (o.clienteId && o.clienteId === c.id) return true;
        if (cCuit.length >= 7 && cleanCuit(o.clienteCuit) === cCuit) return true;
        const oName = cleanText(o.clienteNombre || o.pertenece);
        return Boolean(cName && oName && cName === oName);
      });
      map.set(c.id, list);
    }
    return map;
  }, [clients, obras, editingObra]);

  const selectedClient = useMemo(
    () => (clienteId ? clients.find((c) => c.id === clienteId) || null : null),
    [clients, clienteId]
  );

  const selectedClientOtherObras = useMemo(
    () => (clienteId ? obrasByClientId.get(clienteId) || [] : []),
    [obrasByClientId, clienteId]
  );

  const clientOptions = useMemo(() => {
    return [
      { value: '', label: '-- Sin cliente vinculado / Obra propia --' },
      ...clients.map((c) => {
        const count = (obrasByClientId.get(c.id) || []).length;
        return {
          value: c.id,
          label: `${c.razonSocial}${c.codigo ? ` [${c.codigo}]` : ''}`,
          secondaryText: `${c.cuit ? `CUIT: ${c.cuit} · ` : ''}${count > 0 ? `${count} obra(s) vinculada(s)` : 'Sin obras previas'}`,
          extraSearchTerms: `${c.cuit || ''} ${c.codigo || ''} ${c.localidad || ''}`,
        };
      }),
    ];
  }, [clients, obrasByClientId]);

  if (!isOpen) return null;

  const handleSelectClient = (newClientId: string) => {
    if (!newClientId) {
      const prevClientName = clienteNombre;
      setClienteId('');
      setClienteCodigo('');
      setClienteNombre('');
      setClienteCuit('');
      if (cleanText(pertenece) === cleanText(prevClientName)) {
        setPertenece('');
      }
      return;
    }
    const found = clients.find((c) => c.id === newClientId);
    if (!found) return;
    const prevClientName = clienteNombre;
    setClienteId(found.id);
    setClienteCodigo(found.codigo || '');
    setClienteNombre(found.razonSocial || '');
    setClienteCuit(found.cuit || '');
    if (!pertenece.trim() || cleanText(pertenece) === cleanText(prevClientName) || pertenece === 'Empresa Principal') {
      setPertenece(found.razonSocial || '');
    }
  };

  const handleQuickCreate = async () => {
    if (!onQuickCreateClient) return;
    if (!quickClientName.trim() && !cleanCuit(quickClientCuit)) {
      setFormError('Ingresá al menos Razón Social o CUIT/DNI para el nuevo cliente.');
      return;
    }
    setIsCreatingClient(true);
    setFormError(null);
    try {
      const created = await onQuickCreateClient({
        razonSocial: quickClientName.trim(),
        cuit: cleanCuit(quickClientCuit),
        telefono: quickClientTel.trim(),
      });
      if (created) {
        setClienteId(created.id);
        setClienteCodigo(created.codigo || '');
        setClienteNombre(created.razonSocial || '');
        setClienteCuit(created.cuit || '');
        if (!pertenece.trim() || pertenece === 'Empresa Principal') {
          setPertenece(created.razonSocial || '');
        }
        setShowQuickClient(false);
        setQuickClientName('');
        setQuickClientCuit('');
        setQuickClientTel('');
      }
    } finally {
      setIsCreatingClient(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreObra.trim()) {
      setFormError('Por favor ingrese el nombre de la obra.');
      return;
    }

    const resolvedClienteNombre = selectedClient?.razonSocial || clienteNombre.trim();
    const resolvedPertenece = pertenece.trim() || resolvedClienteNombre || 'Empresa Principal';

    const obraToSave: Obra = {
      ...(editingObra || {}),
      id: editingObra ? editingObra.id : `obra-${Date.now()}`,
      numero: numero.trim() || `OBRA-${Date.now().toString().slice(-4)}`,
      nombreObra: nombreObra.trim(),
      ubicacion: ubicacion.trim(),
      pertenece: resolvedPertenece,
      clienteId: clienteId || undefined,
      clienteCodigo: (selectedClient?.codigo || clienteCodigo) || undefined,
      clienteNombre: resolvedClienteNombre || undefined,
      clienteCuit: (selectedClient?.cuit || clienteCuit) || undefined,
      activa,
      plazo: plazo.trim() || 'Sin especificar',
      montoEstimado: Number(montoEstimado) || 0,
      categoriaDuracion,
      fechaAlta: editingObra?.fechaAlta || new Date().toISOString().slice(0, 10),
      observaciones: observaciones.trim(),
      archivado: editingObra?.archivado,
      fechaArchivado: editingObra?.fechaArchivado,
      motivoArchivado: editingObra?.motivoArchivado,
      facturasLegajo: editingObra?.facturasLegajo,
      gastosManuales: editingObra?.gastosManuales,
      costosConfig: editingObra?.costosConfig,
    };

    onSave(obraToSave);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1a1d24] border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">
                {editingObra ? 'Editar Obra / Proyecto' : 'Nueva Obra / Proyecto'}
              </h3>
              <p className="text-xs text-slate-400">
                {editingObra
                  ? `Actualizando ${editingObra.numero}`
                  : 'Vinculá la obra a un Cliente (un mismo cliente puede tener múltiples obras)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {formError && (
            <div className="bg-red-500/15 border border-red-500/40 text-red-200 rounded-xl px-3 py-2 text-xs font-semibold">
              {formError}
            </div>
          )}

          {/* Cliente Vinculado (1 Cliente -> Muchas Obras) */}
          <div className="bg-slate-900/90 border border-amber-500/25 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-amber-300 uppercase flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>Cliente Vinculado (1 Cliente → Muchas Obras)</span>
              </label>
              {onQuickCreateClient && (
                <button
                  type="button"
                  onClick={() => setShowQuickClient((prev) => !prev)}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  <Plus className="w-3 h-3" />
                  {showQuickClient ? 'Cerrar Alta Rápida' : '+ Nuevo Cliente'}
                </button>
              )}
            </div>

            <SearchableSelect
              options={clientOptions}
              value={clienteId}
              onChange={handleSelectClient}
              placeholder="-- Seleccionar Cliente del Padrón (opcional) --"
              searchPlaceholder="Buscar cliente por Razón Social, CUIT o CLI-XXXX..."
              clearValue=""
            />

            {selectedClient && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedClient.codigo && (
                    <span className="font-mono font-black px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {selectedClient.codigo}
                    </span>
                  )}
                  <span className="font-bold text-white">{selectedClient.razonSocial}</span>
                  {selectedClient.cuit && (
                    <span className="font-mono text-emerald-400">CUIT: {selectedClient.cuit}</span>
                  )}
                </div>
                <span className="text-cyan-300 font-semibold">
                  {selectedClientOtherObras.length > 0
                    ? `Ya tiene ${selectedClientOtherObras.length} obra(s) más (${selectedClientOtherObras
                        .slice(0, 2)
                        .map((o) => o.nombreObra)
                        .join(', ')}${selectedClientOtherObras.length > 2 ? '…' : ''})`
                    : 'Primera obra vinculada a este cliente'}
                </span>
              </div>
            )}

            {showQuickClient && onQuickCreateClient && (
              <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3 space-y-2.5 animate-fade-in">
                <div className="text-[11px] font-bold text-amber-300">
                  Alta rápida de Cliente (se guarda en el Padrón de Clientes y queda vinculado a esta obra)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={quickClientName}
                    onChange={(e) => setQuickClientName(e.target.value)}
                    placeholder="Razón Social / Nombre *"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white uppercase focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    value={quickClientCuit}
                    onChange={(e) => setQuickClientCuit(e.target.value)}
                    placeholder="CUIT / DNI (opcional)"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={quickClientTel}
                      onChange={(e) => setQuickClientTel(e.target.value)}
                      placeholder="Teléfono"
                      className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      disabled={isCreatingClient}
                      onClick={handleQuickCreate}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {isCreatingClient ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Crear'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Número de Obra / Expediente
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  placeholder="Ej. OBRA-2026-001"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Nombre de la Obra *
              </label>
              <input
                type="text"
                required
                value={nombreObra}
                onChange={(e) => setNombreObra(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-medium"
                placeholder="Ej. Pavimentación Acceso Norte"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Ubicación
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={ubicacion}
                  onChange={(e) => setUbicacion(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="Ej. Ruta 9 Km 45, Parque Industrial"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                ¿A quién le pertenece? (Comitente / Referencia)
              </label>
              <div className="relative">
                <UserCheck className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={pertenece}
                  onChange={(e) => setPertenece(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="Ej. Constructora San Cayetano S.A."
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Plazo Estimado
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={plazo}
                  onChange={(e) => setPlazo(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="Ej. 12 meses"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Monto Estimado ($ ARS)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={montoEstimado}
                  onChange={(e) => setMontoEstimado(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  placeholder="45000000"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Estado Actual
              </label>
              <div className="flex items-center h-10 px-3 bg-slate-900 border border-slate-700 rounded-xl">
                <label className="relative flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={activa}
                    onChange={(e) => setActiva(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                  <span className={`text-xs font-bold ${activa ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {activa ? 'ACTIVA (En ejecución)' : 'INACTIVA / Finalizada'}
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
              Clasificación / Duración de la Obra
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { key: 'LARGA' as ObraDuracionCategoria, title: '🏗️ Obra Larga', desc: 'Meses / proyecto estable', activeCls: 'bg-indigo-500/20 border-indigo-400 text-indigo-200' },
                { key: 'CORTA' as ObraDuracionCategoria, title: '⏱️ Obra Corta', desc: 'Días o pocas semanas', activeCls: 'bg-cyan-500/20 border-cyan-400 text-cyan-200' },
                { key: 'ESPORADICA' as ObraDuracionCategoria, title: '⚡ Esporádica', desc: 'Trabajo puntual / horas', activeCls: 'bg-amber-500/20 border-amber-400 text-amber-200' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setCategoriaDuracion(opt.key)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    categoriaDuracion === opt.key
                      ? opt.activeCls
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-black">{opt.title}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Todas las obras mantienen el mismo peso en costos, legajos y rentabilidad; esta clasificación te permite distinguir rápido obras cortas, largas o esporádicas.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Observaciones / Notas
            </label>
            <textarea
              rows={3}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
              placeholder="Detalles adicionales, contactos o condiciones contractuales..."
            />
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-sm font-medium transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-sm font-bold transition cursor-pointer shadow-lg shadow-amber-500/20 flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {editingObra ? 'Guardar Cambios' : 'Registrar Obra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
