import React, { useState, useMemo, useEffect } from 'react';
import {
  RentalContract,
  RentalContractStatus,
  Vehicle,
  Employee,
  EquipmentCategory,
  Quotation,
  ParteDiario,
  ArcaInvoice,
  FuelDispensary
} from '../../types';
import { formatCurrency } from '../../services/storage';
import { RentalFormModal, getCleanEquipmentCodes } from './RentalFormModal';
import { RentalDetailModal } from './RentalDetailModal';
import { ClientDirectoryModal } from '../ClientDirectoryModal';
import { resolveRentalContractLinks, isExternalMigratedInvoice } from '../../utils/crossLinks';
import {
  Plus,
  Search,
  FileText,
  Truck,
  UserCheck,
  Calendar,
  Clock,
  CheckCircle2,
  Eye,
  Edit3,
  Trash2,
  MapPin,
  Phone,
  DollarSign,
  Link2,
  Receipt,
  Camera,
  Paperclip,
  ClipboardList,
  AlertCircle,
  Users
} from 'lucide-react';

interface RentalManagementSectionProps {
  rentals: RentalContract[];
  fleet: Vehicle[];
  employees: Employee[];
  quotations?: Quotation[];
  partesDiarios?: ParteDiario[];
  arcaInvoices?: ArcaInvoice[];
  fuelVouchers?: FuelDispensary[];
  preselectedQuotation?: Quotation | null;
  onClearPreselectedQuotation?: () => void;
  onSaveRental: (contract: RentalContract, linkedQuotationId?: string) => void;
  onDeleteRental: (id: string) => void;
  onFinalizeRental: (id: string) => void;
  onInvoiceRentalInArca?: (contract: RentalContract) => void;
  onNavigateToCobranzas?: () => void;
}

export const RentalManagementSection: React.FC<RentalManagementSectionProps> = ({
  rentals,
  fleet,
  employees,
  quotations = [],
  partesDiarios = [],
  arcaInvoices = [],
  fuelVouchers = [],
  preselectedQuotation = null,
  onClearPreselectedQuotation,
  onSaveRental,
  onDeleteRental,
  onFinalizeRental,
  onInvoiceRentalInArca,
  onNavigateToCobranzas
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<RentalContractStatus | 'ALL'>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'FACTURADO' | 'SIN_FACTURAR' | 'PAGADO' | 'PENDIENTE_PAGO'>('ALL');
  const [categoryFilter] = useState<EquipmentCategory | 'ALL'>('ALL');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [contractToEdit, setContractToEdit] = useState<RentalContract | null>(null);
  const [selectedContract, setSelectedContract] = useState<RentalContract | null>(null);
  const [isClientDirectoryOpen, setIsClientDirectoryOpen] = useState(false);

  // Automatically open form modal if user clicked "Pasar a Alquiler" from a Quotation
  useEffect(() => {
    if (preselectedQuotation) {
      setContractToEdit(null);
      setIsFormOpen(true);
    }
  }, [preselectedQuotation]);

  const enrichedRentals = useMemo(() => {
    return rentals.map(r => ({
      rental: r,
      links: resolveRentalContractLinks(r, partesDiarios, arcaInvoices)
    }));
  }, [rentals, partesDiarios, arcaInvoices]);

  const stats = useMemo(() => {
    const activos = rentals.filter(r => r.estado === 'ACTIVO').length;
    const pendientes = rentals.filter(r => r.estado === 'PENDIENTE_ENTREGA').length;
    const finalizados = rentals.filter(r => r.estado === 'FINALIZADO').length;
    const facturadosCount = enrichedRentals.filter(e => e.links.estadoFacturacion === 'FACTURADO').length;
    const pagadosCount = enrichedRentals.filter(e => e.links.estadoCobro === 'PAGADO').length;
    const pendingEntries = enrichedRentals.filter(
      e => e.rental.estado !== 'CANCELADO' && e.links.estadoCobro !== 'PAGADO'
    );
    const pendientesPagoCount = pendingEntries.length;
    const pendienteCobroArs = pendingEntries
      .filter(e => (e.links.primaryInvoice?.moneda || e.rental.moneda) !== 'USD')
      .reduce((acc, e) => acc + e.links.saldoPendiente, 0);
    const pendienteCobroUsd = pendingEntries
      .filter(e => (e.links.primaryInvoice?.moneda || e.rental.moneda) === 'USD')
      .reduce((acc, e) => acc + e.links.saldoPendiente, 0);

    const facturacionActiva = rentals
      .filter(r => (r.estado === 'ACTIVO' || r.estado === 'PENDIENTE_ENTREGA') && r.moneda !== 'USD')
      .reduce((acc, r) => acc + (r.totalAlquiler || 0), 0);
    const facturacionActivaUsd = rentals
      .filter(r => (r.estado === 'ACTIVO' || r.estado === 'PENDIENTE_ENTREGA') && r.moneda === 'USD')
      .reduce((acc, r) => acc + (r.totalAlquiler || 0), 0);
    const facturacionTotal = rentals
      .filter(r => r.estado !== 'CANCELADO' && r.moneda !== 'USD')
      .reduce((acc, r) => acc + (r.totalAlquiler || 0), 0);
    const facturacionTotalUsd = rentals
      .filter(r => r.estado !== 'CANCELADO' && r.moneda === 'USD')
      .reduce((acc, r) => acc + (r.totalAlquiler || 0), 0);

    return {
      total: rentals.length,
      activos,
      pendientes,
      finalizados,
      facturadosCount,
      pagadosCount,
      pendientesPagoCount,
      pendienteCobroArs,
      pendienteCobroUsd,
      facturacionActiva,
      facturacionActivaUsd,
      facturacionTotal,
      facturacionTotalUsd
    };
  }, [rentals, enrichedRentals]);

  const filteredRentals = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return enrichedRentals.filter(({ rental: r, links }) => {
      if (statusFilter !== 'ALL' && r.estado !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && r.equipoCategoria !== categoryFilter) return false;
      if (paymentFilter === 'FACTURADO' && links.estadoFacturacion !== 'FACTURADO') return false;
      if (paymentFilter === 'SIN_FACTURAR' && links.estadoFacturacion === 'FACTURADO') return false;
      if (paymentFilter === 'PAGADO' && links.estadoCobro !== 'PAGADO') return false;
      if (paymentFilter === 'PENDIENTE_PAGO' && links.estadoCobro === 'PAGADO') return false;

      if (!q) return true;
      return (
        r.numeroContrato?.toLowerCase().includes(q) ||
        r.titulo?.toLowerCase().includes(q) ||
        r.cotizacionNumero?.toLowerCase().includes(q) ||
        links.facturaNumero?.toLowerCase().includes(q) ||
        r.clienteNombre?.toLowerCase().includes(q) ||
        r.clienteDocumento?.toLowerCase().includes(q) ||
        r.equipoModelo?.toLowerCase().includes(q) ||
        r.equipoCodigoInterno?.toLowerCase().includes(q) ||
        r.equipoCodigo?.toLowerCase().includes(q) ||
        r.direccionObra?.toLowerCase().includes(q) ||
        r.operarioNombre?.toLowerCase().includes(q) ||
        links.linkedPartes.some(p => (p.numParte || '').toLowerCase().includes(q))
      );
    });
  }, [enrichedRentals, searchTerm, statusFilter, categoryFilter, paymentFilter]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#16191F] border border-zinc-800 rounded-2xl p-6 text-white shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0C800]/15 border border-[#F0C800]/30 text-[#F0C800] text-xs font-black uppercase tracking-wider">
            <Truck className="w-3.5 h-3.5" />
            La Hormiga • Circuito Comercial Partes Diarios ↔ Alquiler ↔ Facturación ARCA ↔ Cobranzas
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            Gestión de Alquileres de Equipos y Maquinarias
          </h2>
          <p className="text-zinc-400 text-xs md:text-sm max-w-2xl">
            Vinculá Partes Diarios y Facturas ARCA a cada contrato, controlá qué alquileres ya están <strong className="text-cyan-300">FACTURADOS</strong> y cuáles están <strong className="text-emerald-400">PAGADOS</strong> o <strong className="text-rose-400">PENDIENTES DE PAGO</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onNavigateToCobranzas && (
            <button
              onClick={onNavigateToCobranzas}
              className="px-4 py-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 font-black text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
            >
              <DollarSign className="w-4 h-4" />
              Ir a Cobranzas / Bajar Facturas ({stats.pendientesPagoCount} pend.)
            </button>
          )}
          <button
            onClick={() => setIsClientDirectoryOpen(true)}
            className="px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-[#F0C800] border border-[#F0C800]/40 font-black text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
          >
            <Users className="w-4 h-4" />
            Clientes / Alta Cliente
          </button>
          <button
            onClick={() => {
              if (onClearPreselectedQuotation) onClearPreselectedQuotation();
              setContractToEdit(null);
              setIsFormOpen(true);
            }}
            className="px-5 py-3 rounded-xl bg-[#F0C800] hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-[#F0C800]/20 flex items-center gap-2 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            + Nuevo Contrato / Llamar Cotización
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#16191F] border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black text-zinc-400 uppercase tracking-wider">
              Equipos en Obra (Activos)
            </p>
            <p className="text-2xl font-black text-emerald-400 mt-1">{stats.activos}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Contratos en curso</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black text-zinc-400 uppercase tracking-wider">
              Facturación & Cobranza
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-black text-cyan-400">{stats.facturadosCount} Facturados</span>
              <span className="text-zinc-600">•</span>
              <span className="text-sm font-black text-emerald-400">{stats.pagadosCount} Pagados</span>
            </div>
            <p className="text-[11px] text-rose-400 mt-0.5 font-semibold">
              {stats.pendientesPagoCount} pendiente(s) de cobro
            </p>
            {(stats.pendienteCobroArs > 0 || stats.pendienteCobroUsd > 0) && (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-black text-rose-400 font-mono">
                  Pendiente: {formatCurrency(stats.pendienteCobroArs, 'ARS')}
                </span>
                {stats.pendienteCobroUsd > 0 && (
                  <span className="text-xs font-black text-amber-300 font-mono">
                    + {formatCurrency(stats.pendienteCobroUsd, 'USD')}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="w-11 h-11 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20 shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black text-zinc-400 uppercase tracking-wider">
              Liquidación Activa
            </p>
            <p className="text-xl font-black text-[#F0C800] mt-1 font-mono">
              {formatCurrency(stats.facturacionActiva, 'ARS')}
            </p>
            {stats.facturacionActivaUsd > 0 && (
              <p className="text-xs font-black text-emerald-400 font-mono">
                + {formatCurrency(stats.facturacionActivaUsd, 'USD')}
              </p>
            )}
            <p className="text-[11px] text-zinc-500 mt-0.5">En alquileres vigentes</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#F0C800]/10 text-[#F0C800] flex items-center justify-center border border-[#F0C800]/20">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#16191F] border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black text-zinc-400 uppercase tracking-wider">
              Acumulado Histórico
            </p>
            <p className="text-xl font-black text-white mt-1 font-mono">
              {formatCurrency(stats.facturacionTotal, 'ARS')}
            </p>
            {stats.facturacionTotalUsd > 0 && (
              <p className="text-xs font-black text-emerald-400 font-mono">
                + {formatCurrency(stats.facturacionTotalUsd, 'USD')}
              </p>
            )}
            <p className="text-[11px] text-zinc-500 mt-0.5">{stats.total} contratos totales</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-zinc-800 text-zinc-300 flex items-center justify-center border border-zinc-700">
            <FileText className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="bg-[#16191F] border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar contrato por Nº, título, Factura ARCA, Parte Diario, Razón Social, CUIT, máquina o dirección..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#F0C800]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: `Todos (${rentals.length})` },
              { id: 'ACTIVO', label: `En Obra (${stats.activos})` },
              { id: 'PENDIENTE_ENTREGA', label: `Reservados (${stats.pendientes})` },
              { id: 'FINALIZADO', label: `Finalizados (${stats.finalizados})` }
            ].map(st => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  statusFilter === st.id
                    ? 'bg-[#F0C800] text-zinc-950 border-[#F0C800]'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Billing & Payment Filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-800/70">
          <span className="text-[10px] font-bold text-zinc-500 uppercase mr-1">
            Filtro Facturación / Pago:
          </span>
          {(
            [
              { id: 'ALL', label: 'Todos' },
              { id: 'FACTURADO', label: `Facturados (${stats.facturadosCount})` },
              { id: 'SIN_FACTURAR', label: `Sin Facturar (${rentals.length - stats.facturadosCount})` },
              { id: 'PAGADO', label: `Pagados (${stats.pagadosCount})` },
              { id: 'PENDIENTE_PAGO', label: `Pendientes de Pago (${stats.pendientesPagoCount})` }
            ] as const
          ).map(pf => (
            <button
              key={pf.id}
              onClick={() => setPaymentFilter(pf.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                paymentFilter === pf.id
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              {pf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contracts Table */}
      <div className="bg-[#16191F] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950/90 border-b border-zinc-800 text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Contrato / Vínculos</th>
                <th className="py-3.5 px-4">Máquina / Código Interno</th>
                <th className="py-3.5 px-4">Cliente / Razón Social & Obra</th>
                <th className="py-3.5 px-3">Partes Diarios</th>
                <th className="py-3.5 px-3">Modalidad & Plazo</th>
                <th className="py-3.5 px-3 text-right">Total Contrato</th>
                <th className="py-3.5 px-3 text-center">Facturación & Pago</th>
                <th className="py-3.5 px-3 text-center">Estado Obra</th>
                <th className="py-3.5 px-4 text-right">Acciones / Facturar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70 text-xs">
              {filteredRentals.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-zinc-400">
                    No se encontraron contratos de alquiler con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredRentals.map(({ rental: r, links }) => {
                  const matchedVeh = fleet.find(v => v.id === r.equipoId);
                  const cleanCodes = matchedVeh ? getCleanEquipmentCodes(matchedVeh) : null;
                  const displayInterno =
                    r.equipoCodigoInterno || cleanCodes?.codigoInterno || r.equipoPatenteOrCodigo || '';
                  const displayNumEq = r.equipoCodigo || cleanCodes?.numeroEquipo || '';

                  return (
                    <tr key={r.id} className="hover:bg-zinc-800/40 transition">
                      <td className="py-3.5 px-4">
                        <span className="font-black text-[#F0C800] font-mono block">
                          {r.numeroContrato}
                        </span>
                        {r.titulo && (
                          <span
                            className="block text-[11px] font-bold text-cyan-200 mt-0.5 leading-snug max-w-[190px] truncate"
                            title={r.titulo}
                          >
                            {r.titulo}
                          </span>
                        )}
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {r.cotizacionNumero ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                              <Link2 className="w-2.5 h-2.5" /> COT {r.cotizacionNumero}
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500">{r.fechaInicio}</span>
                          )}
                          {Array.isArray(r.adjuntos) && r.adjuntos.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedContract(r)}
                              title="Ver fotos de salida y documentos firmados"
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-[#F0C800] bg-[#F0C800]/15 hover:bg-[#F0C800]/25 border border-[#F0C800]/30 px-1.5 py-0.5 rounded cursor-pointer transition"
                            >
                              <Camera className="w-2.5 h-2.5" />
                              {r.adjuntos.length}
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{r.equipoModelo}</div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {displayInterno && (
                            <span className="px-1.5 py-0.5 rounded bg-[#F0C800]/15 text-[#F0C800] font-mono text-[10px] font-bold border border-[#F0C800]/30">
                              Cód. Int: {displayInterno}
                            </span>
                          )}
                          {displayNumEq && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px]">
                              N° Eq: {displayNumEq}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{r.clienteNombre}</div>
                        {r.clienteDocumento && (
                          <div className="text-[10px] font-mono text-zinc-400">
                            CUIT/DNI: {r.clienteDocumento}
                          </div>
                        )}
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1 truncate max-w-[220px]">
                          <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                          {r.direccionObra}
                        </div>
                      </td>

                      {/* Partes Diarios Vinculados */}
                      <td className="py-3.5 px-3">
                        {links.linkedPartes.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setSelectedContract(r)}
                            className="inline-flex flex-col items-start px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] font-bold cursor-pointer transition"
                            title="Clic para ver los Partes Diarios vinculados a este contrato"
                          >
                            <span className="flex items-center gap-1">
                              <ClipboardList className="w-3 h-3" />
                              {links.linkedPartes.length} Parte(s)
                            </span>
                            <span className="text-[9px] text-cyan-200">
                              {links.totalHorasPartes > 0 ? `${links.totalHorasPartes.toFixed(1)} hs` : ''}
                              {links.totalViajesPartes > 0 ? ` ${links.totalViajesPartes} vjs` : ''}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedContract(r)}
                            className="text-[10px] text-zinc-500 hover:text-cyan-300 underline cursor-pointer"
                          >
                            + Vincular partes
                          </button>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="font-black text-white flex items-center gap-1">
                          {r.modalidad === 'DIAS' ? (
                            <Calendar className="w-3.5 h-3.5 text-[#F0C800]" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-[#F0C800]" />
                          )}
                          {r.duracion} {r.modalidad === 'DIAS' ? 'Días' : 'Horas'}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {r.fechaInicio} → {r.fechaFinEstimada}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right">
                        <span className="font-black text-emerald-400 font-mono text-sm">
                          {formatCurrency(r.totalAlquiler, r.moneda)}
                        </span>
                        <span className="block text-[10px] text-zinc-400 font-mono">
                          {formatCurrency(r.tarifaEquipoUnitaria, r.moneda)}/
                          {r.modalidad === 'DIAS' ? 'día' : 'hr'}
                          {r.moneda === 'USD' ? ' • USD' : ''}
                        </span>
                      </td>

                      {/* Facturación & Estado de Cobro */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {links.estadoFacturacion === 'FACTURADO' ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                                links.linkedInvoices.some(i => isExternalMigratedInvoice(i))
                                  ? 'bg-orange-500/20 text-orange-200 border-orange-400/50'
                                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              }`}>
                                <Receipt className="w-3 h-3" />
                                FACTURA {links.facturaNumero || 'EMITIDA'}
                              </span>
                              {links.linkedInvoices.some(i => isExternalMigratedInvoice(i)) && (
                                <span className="text-[9px] font-black text-orange-300 uppercase">
                                  ⚠️ OTRO SISTEMA
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                              SIN FACTURAR
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const nextCobro =
                                links.estadoCobro === 'PAGADO' ? 'PENDIENTE_PAGO' : 'PAGADO';
                              onSaveRental(
                                {
                                  ...r,
                                  estadoCobro: nextCobro,
                                  montoCobrado: nextCobro === 'PAGADO' ? r.totalAlquiler : 0,
                                  fechaCobro:
                                    nextCobro === 'PAGADO'
                                      ? new Date().toISOString().slice(0, 10)
                                      : undefined
                                },
                                r.cotizacionId
                              );
                            }}
                            title="Clic para alternar PAGADO / PENDIENTE DE PAGO"
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black cursor-pointer transition border ${
                              links.estadoCobro === 'PAGADO'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                                : links.estadoCobro === 'COBRADO_PARCIAL'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                            }`}
                          >
                            {links.estadoCobro === 'PAGADO' ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" /> PAGADO
                              </>
                            ) : links.estadoCobro === 'COBRADO_PARCIAL' ? (
                              <>
                                <Clock className="w-3 h-3" /> PAGO PARCIAL
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3 h-3" /> PENDIENTE DE PAGO
                              </>
                            )}
                          </button>
                          {links.estadoCobro !== 'PAGADO' && links.saldoPendiente > 0 && (
                            <span className="text-[10px] font-mono font-bold text-rose-400">
                              Por cobrar: {formatCurrency(links.saldoPendiente, links.primaryInvoice?.moneda || r.moneda)}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
                            r.estado === 'ACTIVO'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : r.estado === 'PENDIENTE_ENTREGA'
                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {r.estado === 'ACTIVO'
                            ? 'EN OBRA'
                            : r.estado === 'PENDIENTE_ENTREGA'
                              ? 'RESERVADO'
                              : 'FINALIZADO'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onInvoiceRentalInArca && links.estadoFacturacion !== 'FACTURADO' && (
                            <button
                              onClick={() => onInvoiceRentalInArca(r)}
                              title="Llamar este Contrato para Facturar en ARCA"
                              className="px-2.5 py-1.5 rounded-lg bg-[#F0C800]/15 hover:bg-[#F0C800] text-[#F0C800] hover:text-zinc-950 border border-[#F0C800]/40 text-[11px] font-black transition flex items-center gap-1 cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              Facturar
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedContract(r)}
                            title="Ver Detalle, Partes Vinculados y Adjuntos"
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (onClearPreselectedQuotation) onClearPreselectedQuotation();
                              setContractToEdit(r);
                              setIsFormOpen(true);
                            }}
                            title="Editar Contrato y Vínculos"
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-cyan-400 border border-zinc-700 cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {r.estado === 'ACTIVO' && (
                            <button
                              onClick={() => onFinalizeRental(r.id)}
                              title="Finalizar y Devolver Equipo"
                              className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => onDeleteRental(r.id)}
                            title="Eliminar Contrato"
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950/60 text-rose-400 border border-zinc-700 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      <RentalFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setContractToEdit(null);
          if (onClearPreselectedQuotation) onClearPreselectedQuotation();
        }}
        onSave={onSaveRental}
        contractToEdit={contractToEdit}
        fleet={fleet}
        employees={employees}
        existingCount={rentals.length}
        quotations={quotations}
        preselectedQuotation={preselectedQuotation}
        partesDiarios={partesDiarios}
        invoices={arcaInvoices}
      />

      {/* Detail Modal */}
      <RentalDetailModal
        isOpen={Boolean(selectedContract)}
        contract={selectedContract}
        onClose={() => setSelectedContract(null)}
        onEdit={c => {
          setContractToEdit(c);
          setIsFormOpen(true);
        }}
        onFinalize={onFinalizeRental}
        onInvoiceInArca={onInvoiceRentalInArca}
        onUpdateContract={updatedContract => {
          onSaveRental(updatedContract, updatedContract.cotizacionId);
          setSelectedContract(updatedContract);
        }}
        partesDiarios={partesDiarios}
        invoices={arcaInvoices}
        fuelVouchers={fuelVouchers}
        fleet={fleet}
        onNavigateToCobranzas={onNavigateToCobranzas}
      />

      <ClientDirectoryModal
        isOpen={isClientDirectoryOpen}
        onClose={() => setIsClientDirectoryOpen(false)}
      />
    </div>
  );
};
