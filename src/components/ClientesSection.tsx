import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  DollarSign,
  Edit3,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { ArcaInvoice, ClientRecord, Obra, ParteDiario, Quotation, RentalContract } from '../types';

interface ClientesSectionProps {
  rentals: RentalContract[];
  arcaInvoices: ArcaInvoice[];
  quotations: Quotation[];
  obras?: Obra[];
  partesDiarios?: ParteDiario[];
  onClientsCountChange?: (count: number) => void;
  onClientsChanged?: (clients: ClientRecord[]) => void;
  onCreateObraForClient?: (client: ClientRecord) => void;
  onOpenObra?: (obra: Obra) => void;
  onNavigateToView?: (view: string) => void;
  onShowToast?: (msg: string) => void;
}

const IVA_CONDITIONS = [
  { value: 'RESPONSABLE_INSCRIPTO', label: 'IVA Responsable Inscripto' },
  { value: 'MONOTRIBUTO', label: 'Responsable Monotributo' },
  { value: 'EXENTO', label: 'IVA Sujeto Exento' },
  { value: 'CONSUMIDOR_FINAL', label: 'Consumidor Final' },
  { value: 'NO_RESPONSABLE', label: 'No Responsable' },
];

const cleanCuit = (val?: string): string => String(val || '').replace(/\D/g, '');
const cleanName = (val?: string): string => String(val || '').trim().toUpperCase();

const isCreditNote = (tipo?: string): boolean =>
  String(tipo || '').toUpperCase().startsWith('NC_');

export const ClientesSection: React.FC<ClientesSectionProps> = ({
  rentals,
  arcaInvoices,
  quotations,
  obras = [],
  partesDiarios = [],
  onClientsCountChange,
  onClientsChanged,
  onCreateObraForClient,
  onOpenObra,
  onNavigateToView,
  onShowToast,
}) => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'TODOS' | 'CONTRATO' | 'FACTURADO' | 'PENDIENTE'>('TODOS');

  // Create / Edit Modal
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpPadron, setIsLookingUpPadron] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

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

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/clients');
      if (res.ok) {
        const list = await res.json();
        const normalized: ClientRecord[] = Array.isArray(list) ? list : [];
        normalized.sort((a, b) =>
          (a.codigo || a.razonSocial || '').localeCompare(b.codigo || b.razonSocial || '', 'es', {
            numeric: true,
          })
        );
        setClients(normalized);
        onClientsCountChange?.(normalized.length);
        onClientsChanged?.(normalized);
      }
    } catch (err) {
      console.warn('Error cargando clientes desde Supabase:', err);
    } finally {
      setIsLoading(false);
    }
  }, [onClientsCountChange, onClientsChanged]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleSyncFromHistory = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/clients/sync-from-history', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onShowToast?.(data?.error || 'No se pudo sincronizar clientes desde contratos y facturas.');
        return;
      }
      const list: ClientRecord[] = Array.isArray(data.clients) ? data.clients : [];
      list.sort((a, b) =>
        (a.codigo || a.razonSocial || '').localeCompare(b.codigo || b.razonSocial || '', 'es', {
          numeric: true,
        })
      );
      setClients(list);
      onClientsCountChange?.(list.length);
      onClientsChanged?.(list);
      onShowToast?.(
        data.createdCount > 0
          ? `${data.createdCount} cliente(s) nuevo(s) dado(s) de alta desde Contratos y Facturas.`
          : 'Padrón de Clientes al día con todos los Contratos y Facturas.'
      );
    } catch {
      onShowToast?.('Error de red al sincronizar clientes.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenNewModal = () => {
    setFormError(null);
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
    setIsFormModalOpen(true);
  };

  const handleEditClient = (c: ClientRecord) => {
    setFormError(null);
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
    setIsFormModalOpen(true);
  };

  const handleLookupPadron = async () => {
    const clean = cleanCuit(formState.cuit);
    if (clean.length < 7) {
      setFormError('Ingresá un CUIT o DNI válido (mínimo 7 dígitos) para consultar ARCA/AFIP.');
      return;
    }
    setIsLookingUpPadron(true);
    setFormError(null);
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
        onShowToast?.(`Datos cargados desde ${data.fuente || 'Padrón AFIP'}.`);
      } else {
        setFormError(data?.error || 'No se encontraron datos en Padrón AFIP para ese CUIT.');
      }
    } catch {
      setFormError('Error de conexión consultando Padrón AFIP.');
    } finally {
      setIsLookingUpPadron(false);
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const rs = String(formState.razonSocial || '').trim();
    const cuit = cleanCuit(formState.cuit);
    if (!rs && !cuit) {
      setFormError('Ingresá al menos la Razón Social o el CUIT / DNI del cliente.');
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/clients/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formState,
          razonSocial: rs,
          cuit,
          fuente: formState.id ? undefined : 'ALTA_MANUAL',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data?.error || 'No se pudo guardar el cliente en Supabase.');
        return;
      }
      setIsFormModalOpen(false);
      await loadClients();
      onShowToast?.(`Cliente ${data.client?.razonSocial || rs} guardado en Supabase.`);
    } catch {
      setFormError('Error de red guardando cliente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClient = async (id: string) => {
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirmId(null);
        await loadClients();
        onShowToast?.('Cliente eliminado del padrón.');
      } else {
        onShowToast?.('No se pudo eliminar el cliente.');
      }
    } catch {
      onShowToast?.('Error de red al eliminar el cliente.');
    }
  };

  // Enrich each client with cross-referenced Rentals, ARCA Invoices and Quotations
  const enrichedClients = useMemo(() => {
    return clients.map((c) => {
      const cCuit = cleanCuit(c.cuit);
      const cName = cleanName(c.razonSocial);

      const matchesEntity = (doc?: string, name?: string) => {
        const d = cleanCuit(doc);
        const n = cleanName(name);
        if (cCuit.length >= 7 && d.length >= 7 && cCuit === d) return true;
        if (cName && n && cName === n) return true;
        return false;
      };

      const clientRentals = rentals.filter((r) => matchesEntity(r.clienteDocumento, r.clienteNombre));
      const clientInvoices = arcaInvoices.filter((inv) =>
        matchesEntity(inv.nroDocReceptor, inv.razonSocialReceptor || inv.receptorRazonSocial)
      );
      const clientQuotations = quotations.filter((q) =>
        matchesEntity(q.cuitReceptor, q.razonSocialReceptor)
      );
      const clientObras = obras.filter((o) => {
        if (o.clienteId && o.clienteId === c.id) return true;
        return matchesEntity(o.clienteCuit, o.clienteNombre || o.pertenece);
      });
      const clientSporadicPartes = partesDiarios.filter(
        (p) =>
          (p.esObraEsporadica || p.codigoObra === 'ESPORADICA') &&
          ((p.clienteId && p.clienteId === c.id) || matchesEntity(p.clienteCuit, p.clienteNombre))
      );

      let totalFacturado = 0;
      let saldoPendiente = 0;
      for (const inv of clientInvoices) {
        const sign = isCreditNote(inv.tipoComprobante) ? -1 : 1;
        const total = Number(inv.importeTotal || inv.impTotal || 0);
        const cobrado = Number(inv.montoCobrado || 0);
        totalFacturado += sign * total;
        if (sign > 0) {
          const pending =
            inv.saldoPendiente !== undefined
              ? Number(inv.saldoPendiente)
              : inv.estadoCobro === 'PAGADO'
              ? 0
              : Math.max(0, total - cobrado);
          saldoPendiente += pending;
        }
      }

      return {
        client: c,
        clientRentals,
        clientInvoices,
        clientQuotations,
        clientObras,
        clientSporadicPartes,
        totalFacturado,
        saldoPendiente,
      };
    });
  }, [clients, rentals, arcaInvoices, quotations, obras, partesDiarios]);

  const metrics = useMemo(() => {
    const conContrato = enrichedClients.filter((e) => e.clientRentals.length > 0).length;
    const facturados = enrichedClients.filter((e) => e.clientInvoices.length > 0).length;
    const totalFacturadoGlobal = enrichedClients.reduce((sum, e) => sum + e.totalFacturado, 0);
    const totalPendienteGlobal = enrichedClients.reduce((sum, e) => sum + e.saldoPendiente, 0);
    return {
      totalClientes: enrichedClients.length,
      conContrato,
      facturados,
      totalFacturadoGlobal,
      totalPendienteGlobal,
    };
  }, [enrichedClients]);

  const filteredClients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const qDigits = cleanCuit(q);

    return enrichedClients.filter(({ client, clientRentals, clientInvoices, saldoPendiente }) => {
      if (filterMode === 'CONTRATO' && clientRentals.length === 0) return false;
      if (filterMode === 'FACTURADO' && clientInvoices.length === 0) return false;
      if (filterMode === 'PENDIENTE' && saldoPendiente <= 0) return false;

      if (!q) return true;
      return (
        (client.razonSocial || '').toLowerCase().includes(q) ||
        (client.codigo || '').toLowerCase().includes(q) ||
        (qDigits.length >= 2 && cleanCuit(client.cuit).includes(qDigits)) ||
        (client.domicilio || '').toLowerCase().includes(q) ||
        (client.localidad || '').toLowerCase().includes(q) ||
        (client.telefono || '').toLowerCase().includes(q)
      );
    });
  }, [enrichedClients, searchTerm, filterMode]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#16191F] border border-[#2D2D2D] rounded-2xl p-6 shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0C800]/10 border border-[#F0C800]/30 text-[#F0C800] text-xs font-bold uppercase tracking-wider">
            <Users className="w-3.5 h-3.5" />
            Ventas & Facturación • Padrón de Clientes
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight font-display">
            Gestión & Ficha Oficial de Clientes
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Clientes registrados en Supabase ({clients.length} activos) vinculados con sus Contratos de Alquiler, Presupuestos y Facturas ARCA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSyncFromHistory}
            disabled={isSyncing}
            className="px-4 py-2 bg-[#262930] hover:bg-slate-700 text-emerald-300 text-xs font-bold rounded-xl border border-emerald-500/30 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="Trae automáticamente los clientes con contratos de alquiler o facturas ARCA"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>Sincronizar Contratos / Facturas</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNewModal}
            className="px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] text-xs font-black rounded-xl border border-[#DDA800] transition flex items-center gap-2 cursor-pointer shadow-md shadow-[#F0C800]/10"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Clientes en Padrón</span>
            <p className="text-xl font-black text-[#F0C800] mt-1 font-mono">
              {metrics.totalClientes} <span className="text-xs font-normal text-slate-400">fichas</span>
            </p>
          </div>
          <div className="p-3 bg-[#F0C800]/10 border border-[#F0C800]/20 rounded-xl text-[#F0C800]">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Con Contrato Alquiler</span>
            <p className="text-xl font-black text-cyan-400 mt-1 font-mono">
              {metrics.conContrato} <span className="text-xs font-normal text-slate-400">clientes</span>
            </p>
          </div>
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Facturado ARCA</span>
            <p className="text-xl font-black text-emerald-400 mt-1 font-mono">
              ${metrics.totalFacturadoGlobal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Saldo Pendiente Cobro</span>
            <p className="text-xl font-black text-amber-400 mt-1 font-mono">
              ${metrics.totalPendienteGlobal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-[#16191F] border border-[#2D2D2D] rounded-xl p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar cliente por Razón Social, CUIT, código CLI-XXXX, domicilio o teléfono..."
            className="w-full pl-9 pr-4 py-2 bg-[#0F1115] border border-[#2D2D2D] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'TODOS', label: `Todos (${enrichedClients.length})` },
              { id: 'CONTRATO', label: `Con Contrato (${metrics.conContrato})` },
              { id: 'FACTURADO', label: `Facturados (${metrics.facturados})` },
              {
                id: 'PENDIENTE',
                label: `Con Saldo (${enrichedClients.filter((e) => e.saldoPendiente > 0).length})`,
              },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterMode(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterMode === f.id
                  ? 'bg-[#F0C800] text-black font-black'
                  : 'bg-[#0F1115] text-slate-300 border border-slate-800 hover:border-slate-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Client Cards List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="py-14 text-center bg-[#16191F] border border-[#2D2D2D] rounded-2xl text-slate-400 text-xs flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#F0C800]" />
            <span>Cargando padrón de clientes desde Supabase...</span>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="py-14 text-center bg-[#16191F] border border-dashed border-slate-800 rounded-2xl space-y-3">
            <Building2 className="w-9 h-9 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">No se encontraron clientes con ese criterio</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleSyncFromHistory}
                className="px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer"
              >
                Importar de Contratos y Facturas
              </button>
              <button
                type="button"
                onClick={handleOpenNewModal}
                className="px-4 py-2 rounded-xl bg-[#F0C800] text-black text-xs font-black cursor-pointer"
              >
                + Nuevo Cliente
              </button>
            </div>
          </div>
        ) : (
          filteredClients.map(({ client, clientRentals, clientInvoices, clientQuotations, clientObras, clientSporadicPartes, totalFacturado, saldoPendiente }) => {
            const isExpanded = expandedClientId === client.id;
            return (
              <div
                key={client.id}
                className="bg-[#16191F] border border-[#2D2D2D] hover:border-slate-700 rounded-xl overflow-hidden transition"
              >
                <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Identity & Contact */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {client.codigo && (
                        <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded bg-[#F0C800]/15 text-[#F0C800] border border-[#F0C800]/30">
                          {client.codigo}
                        </span>
                      )}
                      <h3 className="text-sm sm:text-base font-black text-white truncate">
                        {client.razonSocial || 'SIN NOMBRE'}
                      </h3>
                      {client.cuit && (
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          CUIT/DNI: {client.cuit}
                        </span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {client.condicionIva || 'RESPONSABLE_INSCRIPTO'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      {client.domicilio && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          {client.domicilio}
                          {client.localidad ? ` (${client.localidad})` : ''}
                        </span>
                      )}
                      {client.telefono && client.telefono !== '-' && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          {client.telefono}
                        </span>
                      )}
                      {client.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          {client.email}
                        </span>
                      )}
                      {client.condicionVenta && (
                        <span className="text-[11px] text-slate-500">
                          Condición: <strong className="text-slate-300">{client.condicionVenta}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle: Activity Badges */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="px-3 py-1.5 rounded-lg bg-[#0F1115] border border-slate-800 text-center min-w-[78px]">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Obras</div>
                      <div className="text-xs font-black text-amber-400 font-mono">
                        {clientObras.length}
                      </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg bg-[#0F1115] border border-slate-800 text-center min-w-[85px]">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Contratos</div>
                      <div className="text-xs font-black text-cyan-400 font-mono">
                        {clientRentals.length}
                      </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg bg-[#0F1115] border border-slate-800 text-center min-w-[90px]">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Facturas ARCA</div>
                      <div className="text-xs font-black text-emerald-400 font-mono">
                        {clientInvoices.length}
                      </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg bg-[#0F1115] border border-slate-800 text-right min-w-[125px]">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Facturado</div>
                      <div className="text-xs font-black text-white font-mono">
                        ${totalFacturado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    {saldoPendiente > 0 && (
                      <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-right min-w-[120px]">
                        <div className="text-[10px] uppercase font-bold text-amber-300">Saldo Pend.</div>
                        <div className="text-xs font-black text-amber-400 font-mono">
                          ${saldoPendiente.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onCreateObraForClient && (
                      <button
                        type="button"
                        onClick={() => onCreateObraForClient(client)}
                        className="px-2.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                        title="Crear nueva obra vinculada a este cliente"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Obra</span>
                      </button>
                    )}

                    {(clientObras.length > 0 || clientSporadicPartes.length > 0 || clientRentals.length > 0 || clientInvoices.length > 0 || clientQuotations.length > 0) && (
                      <button
                        type="button"
                        onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#F0C800]" />
                        <span>{isExpanded ? 'Ocultar' : 'Ver Obras / Mov.'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleEditClient(client)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    {deleteConfirmId === client.id ? (
                      <div className="flex items-center gap-1 bg-rose-950/70 border border-rose-500/40 rounded-xl px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteClient(client.id)}
                          className="text-[11px] font-black text-rose-300 hover:text-white px-1.5 cursor-pointer"
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
                        onClick={() => setDeleteConfirmId(client.id)}
                        className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        title="Eliminar cliente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded History: Obras Vinculadas + Contratos + Facturas ARCA */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 bg-[#0F1115]/80 border-t border-slate-800 space-y-4">
                    {/* Obras Vinculadas (1 Cliente -> Muchas Obras) */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5" />
                          Obras Vinculadas al Cliente ({clientObras.length})
                          {clientSporadicPartes.length > 0 && (
                            <span className="ml-1 text-cyan-300 font-normal">
                              + {clientSporadicPartes.length} trabajo(s) esporádico(s)
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          {onCreateObraForClient && (
                            <button
                              type="button"
                              onClick={() => onCreateObraForClient(client)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold cursor-pointer"
                            >
                              + Nueva Obra para este Cliente
                            </button>
                          )}
                          {onNavigateToView && (
                            <button
                              type="button"
                              onClick={() => onNavigateToView('obras')}
                              className="text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer"
                            >
                              Ir a Obras →
                            </button>
                          )}
                        </div>
                      </div>
                      {clientObras.length === 0 && clientSporadicPartes.length === 0 ? (
                        <div className="text-xs text-slate-500 italic">
                          Sin obras vinculadas todavía. Podés crear una o varias obras para este cliente.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {clientObras.map((o) => (
                            <div
                              key={o.id}
                              onClick={() => onOpenObra?.(o)}
                              className={`p-2.5 rounded-lg bg-[#16191F] border border-slate-800 hover:border-amber-500/50 transition flex items-center justify-between gap-2 text-xs ${
                                onOpenObra ? 'cursor-pointer' : ''
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-white flex items-center gap-1.5 truncate">
                                  <span className="font-mono text-amber-400 shrink-0">{o.numero}</span>
                                  <span className="truncate">{o.nombreObra}</span>
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {o.ubicacion || 'Sin ubicación'} · {o.categoriaDuracion || 'LARGA'}
                                </div>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                  o.archivado
                                    ? 'bg-amber-500/15 text-amber-300'
                                    : o.activa
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {o.archivado ? 'ARCHIVADA' : o.activa ? 'ACTIVA' : 'INACTIVA'}
                              </span>
                            </div>
                          ))}
                          {clientSporadicPartes.map((p) => (
                            <div
                              key={p.id}
                              className="p-2.5 rounded-lg bg-[#16191F] border border-cyan-500/25 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-cyan-300 flex items-center gap-1.5 truncate">
                                  <span>⚡ Parte #{p.numParte}</span>
                                  <span className="text-white truncate">{p.obra}</span>
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {p.fecha} · {p.marcaModelo}
                                </div>
                              </div>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0">
                                ESPORÁDICA
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
                    {/* Contratos */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400">
                          Contratos de Alquiler ({clientRentals.length})
                        </span>
                        {onNavigateToView && (
                          <button
                            type="button"
                            onClick={() => onNavigateToView('alquileres')}
                            className="text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer"
                          >
                            Ir a Alquileres →
                          </button>
                        )}
                      </div>
                      {clientRentals.length === 0 ? (
                        <div className="text-xs text-slate-500 italic">Sin contratos de alquiler.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {clientRentals.map((r) => (
                            <div
                              key={r.id}
                              className="p-2.5 rounded-lg bg-[#16191F] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-white flex items-center gap-2">
                                  <span className="font-mono text-cyan-300">{r.numeroContrato || r.id}</span>
                                  <span className="truncate">{r.equipoModelo}</span>
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {r.fechaInicio} → {r.fechaFinEstimada} · {r.obraDestino || r.direccionObra}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-mono font-black text-white">
                                  ${Number(r.totalGeneral || r.totalAlquiler || 0).toLocaleString('es-AR')}
                                </div>
                                <div className="text-[10px] text-slate-400">{r.estadoFacturacion || r.estado}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Facturas ARCA */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
                          Comprobantes Facturados ARCA ({clientInvoices.length})
                        </span>
                        {onNavigateToView && (
                          <button
                            type="button"
                            onClick={() => onNavigateToView('arca')}
                            className="text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer"
                          >
                            Ir a Facturación ARCA →
                          </button>
                        )}
                      </div>
                      {clientInvoices.length === 0 ? (
                        <div className="text-xs text-slate-500 italic">Sin facturas emitidas en ARCA.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {clientInvoices.map((inv) => {
                            const nro = `${String(inv.puntoVenta).padStart(4, '0')}-${String(inv.numeroComprobante).padStart(8, '0')}`;
                            const isNc = isCreditNote(inv.tipoComprobante);
                            return (
                              <div
                                key={inv.id}
                                className="p-2.5 rounded-lg bg-[#16191F] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="font-bold text-white flex items-center gap-2">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-emerald-300">
                                      {inv.tipoComprobante}
                                    </span>
                                    <span className="font-mono">{nro}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    Fecha: {inv.fecha} · CAE: {inv.cae || 'Pendiente'}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className={`font-mono font-black ${isNc ? 'text-rose-400' : 'text-white'}`}>
                                    {isNc ? '-' : ''}${Number(inv.importeTotal || inv.impTotal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                  </div>
                                  <div className="text-[10px] text-slate-400">{inv.estadoCobro || 'PENDIENTE_PAGO'}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit Client Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="bg-[#12151B] border border-slate-700/80 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-5 py-4 bg-black/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-[#F0C800]" />
                <h3 className="text-base font-black text-white">
                  {formState.id ? 'Editar Ficha de Cliente' : 'Alta de Nuevo Cliente'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs font-bold text-rose-300">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Código Cliente</label>
                  <input
                    type="text"
                    value={formState.codigo || ''}
                    onChange={(e) => setFormState({ ...formState, codigo: e.target.value.toUpperCase() })}
                    placeholder="Auto (CLI-XXXX)"
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
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Condición IVA</label>
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

                <div className="sm:col-span-12">
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Notas / Observaciones</label>
                  <input
                    type="text"
                    value={formState.notas || ''}
                    onChange={(e) => setFormState({ ...formState, notas: e.target.value })}
                    placeholder="Contacto de pagos, requerimientos de orden de compra, etc."
                    className="w-full bg-[#0F1115] border border-slate-700 focus:border-[#F0C800] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-[#F0C800] hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Guardar Cliente en Supabase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
