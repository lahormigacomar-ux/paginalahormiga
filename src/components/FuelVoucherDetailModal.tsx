import React, { useState } from 'react';
import { FuelDispensary, FuelVoucherStatus, Vehicle, Employee, IssuedFuelVoucher, FuelDeposit, DocumentBagItem } from '../types';
import { FuelVoucherStatusBadge } from './FuelVoucherStatusBadge';
import { IssuedVoucherDetailModal } from './IssuedVoucherDetailModal';
import { formatCurrency, extractFirstNonZeroOdometer, extractFirstNonZeroDistance } from '../services/storage';
import { resolveMovementType } from '../utils/fuelStockReconciliation';
import { 
  X, 
  Edit3, 
  Printer, 
  Fuel, 
  Truck, 
  Calendar, 
  Gauge, 
  DollarSign, 
  Check, 
  Copy,
  Camera,
  Ticket,
  Trash2,
  ExternalLink,
  Receipt,
  Unlink,
  Building2
} from 'lucide-react';

interface FuelVoucherDetailModalProps {
  isOpen: boolean;
  voucher: FuelDispensary | null;
  fleet: Vehicle[];
  employees: Employee[];
  deposits?: FuelDeposit[];
  issuedVouchers?: IssuedFuelVoucher[];
  linkedDocuments?: DocumentBagItem[];
  onUnlinkDocument?: (docId: string) => void;
  onClose: () => void;
  onEdit: (voucher: FuelDispensary) => void;
  onDelete?: (id: string) => void;
  onChangeStatus?: (id: string, newStatus: FuelVoucherStatus) => void;
  onViewVehicle?: (vehicle: Vehicle) => void;
  onViewEmployee?: (employee: Employee) => void;
  onViewIssuedVoucher?: (voucher: IssuedFuelVoucher) => void;
}

export const FuelVoucherDetailModal: React.FC<FuelVoucherDetailModalProps> = ({
  isOpen,
  voucher,
  fleet,
  employees,
  deposits = [],
  issuedVouchers = [],
  linkedDocuments = [],
  onUnlinkDocument,
  onClose,
  onEdit,
  onDelete,
  onViewVehicle,
  onViewEmployee,
  onViewIssuedVoucher,
}) => {
  const [copied, setCopied] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [selectedIssuedVoucher, setSelectedIssuedVoucher] = useState<IssuedFuelVoucher | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  if (!isOpen || !voucher) return null;

  const matchedVehicle = fleet.find(
    v => (voucher.codigoEquipo && (v.codigoEquipo === voucher.codigoEquipo || v.id === voucher.codigoEquipo || v.codigoInterno === voucher.codigoEquipo)) ||
         (voucher.patente && v.patente === voucher.patente)
  );

  const matchedEmployee = employees.find(
    e => (voucher.codigoEmpleado && (e.codigoEmpleado === voucher.codigoEmpleado || e.id === voucher.codigoEmpleado || e.legajo === voucher.codigoEmpleado)) ||
         (voucher.nombreApellido && e.nombreApellido?.toLowerCase() === voucher.nombreApellido?.toLowerCase()) ||
         (voucher.legajo && e.legajo === voucher.legajo)
  );

  const getLinkedIssuedVoucher = (v: FuelDispensary): IssuedFuelVoucher => {
    const orderNum = (v.numOrden || v.numVale || v.numComprobante || '').trim();
    const matched = issuedVouchers.find(iv => 
      (orderNum && (iv.numVale === orderNum || iv.numComprobante === orderNum)) ||
      (v.valeId && iv.id === v.valeId) ||
      (v.id && iv.expendioId === v.id)
    );

    if (matched) return matched;

    return {
      id: `VAL-${orderNum || v.id}`,
      numVale: orderNum || v.numOrden || '00000',
      numComprobante: orderNum || v.numOrden || '00000',
      fechaEmision: v.fecha || new Date().toISOString().slice(0, 10),
      horaEmision: v.hora || '08:00',
      codigoEquipo: v.codigoEquipo || matchedVehicle?.codigoEquipo || 'EQUIPO-01',
      marcaModelo: v.marcaModelo || matchedVehicle?.modeloMarca || 'Equipo de Flota',
      patente: v.patente || matchedVehicle?.patente || 'S/P',
      codigoEmpleado: v.codigoEmpleado || matchedEmployee?.codigoEmpleado || 'CH-001',
      nombreApellido: v.nombreApellido || matchedEmployee?.nombreApellido || 'Chofer Asignado',
      legajo: v.legajo || matchedEmployee?.legajo || 'LEG-000',
      tipoComb: v.tipoComb || 'DIESEL',
      idCombustible: v.idCombustible || 'COMB-D500',
      litrosAutorizados: v.litrosAutorizados || v.cantidad || 0,
      cantidad: v.cantidad || 0,
      litrosReales: v.cantidad || 0,
      tipoCarga: v.carga || 'Tanque Lleno',
      estacionSurtidor: v.deposito || v.numEstacion || 'Estación YPF / Shell Autorizada',
      numEstacion: v.numEstacion || '',
      estado: 'RENDIDO',
      expendioId: v.id,
      numTicket: v.numTicket || v.numEstacion || `TK-${orderNum}`,
      odometroCarga: v.kilometraje || v.kmsHs || v.horometroOdometro || 0,
      odometroSalida: (v.kilometraje || v.kmsHs || v.horometroOdometro) ? Math.max(0, Number(v.kilometraje || v.kmsHs || v.horometroOdometro || 0) - (v.kilometrosRec || 0)) : undefined,
      fotoTicket: v.fotoExpendio,
      fotoOdometro: v.fotoKilometraje,
      importeTotal: v.totalImporte || ((v.cantidad || 0) * (v.precioUnitario || 1350)),
      fechaRendicion: v.fecha,
      horaRendicion: v.hora,
      observaciones: v.observaciones || `Vale vinculado al registro de expendio ${v.id}`
    };
  };

  const copyId = () => {
    navigator.clipboard.writeText(voucher.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const formatDisplayDateExtended = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.includes('-') ? dateStr.split('-') : dateStr.split('/');
      if (parts.length === 3) {
        let y = parts[0], m = parts[1], d = parts[2];
        if (parts[2].length === 4) {
          d = parts[0];
          m = parts[1];
          y = parts[2];
        }
        const meses = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const mesName = meses[parseInt(m, 10) - 1] || m;
        return `${parseInt(d, 10)} de ${mesName} de ${y} (${parseInt(d, 10)}/${parseInt(m, 10)}/${y})`;
      }
    } catch {
      // fallback
    }
    return dateStr;
  };

  const calculatedTotal = voucher.totalImporte || (Math.abs(voucher.cantidad || 0) * (voucher.precioUnitario || 1350));
  const movementType = resolveMovementType(voucher, deposits);
  const isIngreso = movementType === 'INGRESO';

  // Determine Ticket Number from Station
  const ticketNumber = (voucher.numTicket || voucher.numOrden || voucher.numComprobante || '').trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-[#12151B] border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Hero Bar */}
        <div className="relative bg-gradient-to-b from-[#181C25] to-[#12151B] p-5 border-b border-slate-800 overflow-hidden shrink-0">
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <button
              onClick={handlePrint}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition border border-slate-700 cursor-pointer shadow-xs"
              title="Imprimir Ficha"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={() => onEdit(voucher)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-black text-white transition border border-slate-700 cursor-pointer shadow-xs"
              title="Editar Registro"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition border border-slate-700 cursor-pointer shadow-xs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 pr-24">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                <Fuel className="w-6 h-6" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-amber-400 uppercase tracking-widest">
                    FICHA DE EXPENDIO
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[11px] font-bold border border-slate-700 flex items-center gap-1">
                    ID: {voucher.id}
                    <button
                      onClick={copyId}
                      className="text-slate-400 hover:text-amber-400 transition cursor-pointer ml-0.5"
                      title="Copiar ID"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight mt-0.5">
                  {voucher.deposito || 'Estación de Servicio'}
                </h2>

                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400 font-mono">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>{formatDisplayDateExtended(voucher.fecha)}</span>
                  {voucher.hora && <span>• {voucher.hora} hs</span>}
                  {voucher.obraNombre && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-sans font-bold flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {voucher.obraNombre}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-center">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase font-mono border ${
                isIngreso
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}>
                {movementType}
              </span>
              <FuelVoucherStatusBadge status={voucher.estado || 'CARGADO'} />
            </div>
          </div>

          {/* Key Metrics Bar (4 Stats in 1 Row) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            {/* 1. Volumen */}
            <div className="bg-[#0B0D12] border border-amber-500/30 rounded-xl p-3 shadow-inner">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                Volumen
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-white font-mono">
                  {Math.abs(voucher.cantidad || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-bold text-slate-400">Lts</span>
              </div>
              <span className="text-[11px] text-slate-300 font-medium truncate block">
                {voucher.tipoComb || 'Diesel'}
              </span>
            </div>

            {/* 2. Nº Ticket de Estación */}
            <div className="bg-[#0B0D12] border border-emerald-500/40 rounded-xl p-3 shadow-inner relative overflow-hidden">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
                <Receipt className="w-3 h-3 text-emerald-400" />
                <span>Nº Ticket Estación</span>
              </span>
              <div className="mt-0.5">
                <span className="text-lg font-black text-emerald-300 font-mono tracking-wide truncate block" title={ticketNumber}>
                  {ticketNumber ? `Nº ${ticketNumber}` : 'Sin Ticket'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block font-mono truncate">
                {voucher.numEstacion ? `Surtidor: ${voucher.numEstacion}` : 'Estación Registrada'}
              </span>
            </div>

            {/* 3. Importe Total */}
            <div className="bg-[#0B0D12] border border-slate-800 rounded-xl p-3 shadow-inner">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Importe Total
              </span>
              <div className="mt-0.5">
                <span className="text-xl font-black text-emerald-300 font-mono">
                  {formatCurrency(calculatedTotal)}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block">
                ${(voucher.precioUnitario || 1350).toLocaleString('es-AR')}/Lt
              </span>
            </div>

            {/* 4. Odómetro */}
            <div className="bg-[#0B0D12] border border-cyan-500/30 rounded-xl p-3 shadow-inner">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                Odómetro
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-cyan-200 font-mono">
                  {extractFirstNonZeroOdometer(
                    voucher.kilometraje,
                    voucher.kmsHs,
                    voucher.horometroOdometro,
                    (voucher as any)['KMS/HS'],
                    (voucher as any)['KILOMETRAJE']
                  ).toLocaleString('es-AR')}
                </span>
                <span className="text-xs font-bold text-slate-400">km/hs</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono font-bold block truncate">
                +{extractFirstNonZeroDistance(voucher.kilometrosRec, (voucher as any)['KILOMETROS_REC']).toLocaleString('es-AR')} km tramo
              </span>
            </div>
          </div>
        </div>

        {/* Streamlined Main Content - 2 Columns */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Columna 1: Equipo & Chofer */}
            <div className="bg-[#161922] border border-slate-800 rounded-xl p-4 space-y-4">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                <Truck className="w-4 h-4 text-amber-400" />
                <span>Equipo y Conductor</span>
              </h3>

              {/* Móvil / Vehículo */}
              <div className="flex items-center gap-3 bg-[#0E1117] border border-slate-800 p-3 rounded-lg">
                <img
                  src={matchedVehicle?.fotografia || 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=150&q=80'}
                  alt="Vehículo"
                  className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Vehículo / Equipo</span>
                  <div className="text-sm font-bold text-white truncate" title={voucher.marcaModelo || matchedVehicle?.modeloMarca}>
                    {voucher.marcaModelo || matchedVehicle?.modeloMarca || voucher.codigoEquipo || 'Equipo'}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px] font-bold">
                      {voucher.codigoEquipo || 'S/C'}
                    </span>
                    {(voucher.patente || matchedVehicle?.patente) && (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold border border-slate-700">
                        {voucher.patente || matchedVehicle?.patente}
                      </span>
                    )}
                  </div>
                </div>
                {matchedVehicle && onViewVehicle && (
                  <button
                    onClick={() => { onClose(); onViewVehicle(matchedVehicle); }}
                    className="p-1.5 rounded bg-slate-800 hover:bg-amber-500 hover:text-black text-slate-300 transition cursor-pointer shrink-0"
                    title="Ver Ficha del Móvil"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Chofer / Operador */}
              <div className="flex items-center gap-3 bg-[#0E1117] border border-slate-800 p-3 rounded-lg">
                <img
                  src={matchedEmployee?.foto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
                  alt="Chofer"
                  className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Chofer / Operador</span>
                  <div className="text-sm font-bold text-white truncate" title={voucher.nombreApellido || matchedEmployee?.nombreApellido}>
                    {voucher.nombreApellido || matchedEmployee?.nombreApellido || 'Chofer Asignado'}
                  </div>
                  <div className="flex items-center gap-2 mt-1 font-mono text-[10px] text-slate-400">
                    <span>Legajo: <strong className="text-slate-200">{voucher.legajo || matchedEmployee?.legajo || 'S/L'}</strong></span>
                    <span>• Cód: <strong className="text-cyan-400">{voucher.codigoEmpleado || matchedEmployee?.codigoEmpleado || 'S/C'}</strong></span>
                  </div>
                </div>
                {matchedEmployee && onViewEmployee && (
                  <button
                    onClick={() => { onClose(); onViewEmployee(matchedEmployee); }}
                    className="p-1.5 rounded bg-slate-800 hover:bg-cyan-500 hover:text-black text-slate-300 transition cursor-pointer shrink-0"
                    title="Ver Perfil del Chofer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Columna 2: Surtidor & Rendimiento */}
            <div className="bg-[#161922] border border-slate-800 rounded-xl p-4 space-y-4">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <span>Estación & Rendimiento</span>
              </h3>

              {/* Detalle Ticket y Estación */}
              <div className="bg-[#0E1117] border border-slate-800 p-3 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Punto de Carga:</span>
                  <strong className="text-white font-bold">{voucher.deposito || 'Estación de Servicio'}</strong>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Nº Ticket Estación:</span>
                  <strong className="text-emerald-400 font-bold px-1.5 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">
                    {ticketNumber ? `Nº ${ticketNumber}` : 'Sin Ticket'}
                  </strong>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Nº Orden / Vale:</span>
                  <strong className="text-amber-400">{voucher.numOrden || 'S/N'}</strong>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Rendimiento / Autonomía:</span>
                  <strong className="text-cyan-300 font-mono">{voucher.autonom || voucher.autonomiaVt || '-'} km/L</strong>
                </div>
                {voucher.obraNombre && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-emerald-400" />
                      Obra Asignada:
                    </span>
                    <strong className="text-emerald-300 font-bold text-right">{voucher.obraNombre}</strong>
                  </div>
                )}
              </div>

              {/* Botón Popup Vale Vinculado */}
              {voucher.numOrden && (
                <button
                  type="button"
                  onClick={() => {
                    const linked = getLinkedIssuedVoucher(voucher);
                    if (onViewIssuedVoucher) {
                      onViewIssuedVoucher(linked);
                    } else {
                      setSelectedIssuedVoucher(linked);
                    }
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-98"
                >
                  <Ticket className="w-4 h-4 stroke-[2.5]" />
                  <span>Ver Vale Nº {voucher.numOrden} (Talonario)</span>
                </button>
              )}
            </div>
          </div>

          {/* Comprobantes Fotográficos */}
          {(voucher.fotoExpendio || voucher.fotoKilometraje || linkedDocuments.length > 0) && (
            <div className="bg-[#161922] border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                <Camera className="w-4 h-4 text-amber-400" />
                <span>Comprobantes Adjuntos</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {voucher.fotoExpendio && (
                  <div 
                    onClick={() => setActivePhoto(voucher.fotoExpendio!)}
                    className="relative rounded-lg overflow-hidden border border-slate-800 aspect-video bg-black/60 cursor-pointer group"
                  >
                    <img
                      src={voucher.fotoExpendio}
                      alt="Foto Ticket"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <span className="px-3 py-1 bg-black/80 rounded text-xs font-bold text-white shadow border border-slate-700">
                        🔍 Ampliar Ticket Surtidor
                      </span>
                    </div>
                  </div>
                )}

                {voucher.fotoKilometraje && (
                  <div 
                    onClick={() => setActivePhoto(voucher.fotoKilometraje!)}
                    className="relative rounded-lg overflow-hidden border border-slate-800 aspect-video bg-black/60 cursor-pointer group"
                  >
                    <img
                      src={voucher.fotoKilometraje}
                      alt="Foto Odómetro"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <span className="px-3 py-1 bg-black/80 rounded text-xs font-bold text-white shadow border border-slate-700">
                        🔍 Ampliar Tablero / Odómetro
                      </span>
                    </div>
                  </div>
                )}

                {linkedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-lg overflow-hidden border border-emerald-500/35 bg-[#0E1117] flex flex-col"
                  >
                    <div
                      onClick={() => setActivePhoto(doc.url)}
                      className="relative aspect-video bg-black/60 cursor-pointer group overflow-hidden"
                    >
                      <img
                        src={doc.url}
                        alt={doc.nota || doc.categoria}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <span className="px-3 py-1 bg-black/80 rounded text-xs font-bold text-white shadow border border-slate-700">
                          Ampliar Documento ({doc.categoria})
                        </span>
                      </div>
                    </div>
                    <div className="p-2 flex items-center justify-between gap-2 text-[11px]">
                      <div className="min-w-0 truncate text-slate-300">
                        <strong className="text-emerald-400 uppercase mr-1.5">{doc.categoria.replace('_', ' ')}</strong>
                        {doc.nota || doc.fechaCaptura}
                      </div>
                      {onUnlinkDocument && (
                        <button
                          type="button"
                          onClick={() => onUnlinkDocument(doc.id)}
                          className="text-rose-400 hover:text-rose-300 flex items-center gap-1 shrink-0 cursor-pointer"
                          title="Desvincular de este expendio"
                        >
                          <Unlink className="w-3 h-3" />
                          <span>Quitar</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400">
            Comprobante:{' '}
            <strong className="text-white font-mono">{voucher.id}</strong> • Total:{' '}
            <strong className="text-emerald-400 font-mono">
              {formatCurrency(calculatedTotal)}
            </strong>
          </div>

          <div className="flex items-center gap-2">
            {onDelete && (
              isConfirmingDelete ? (
                <div className="flex items-center gap-1.5 bg-red-950/60 border border-red-500/40 rounded-lg p-1">
                  <span className="text-[11px] text-red-300 font-bold px-1.5">¿Eliminar?</span>
                  <button
                    onClick={() => {
                      onDelete(voucher.id);
                      onClose();
                    }}
                    className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded transition cursor-pointer"
                  >
                    Sí
                  </button>
                  <button
                    onClick={() => setIsConfirmingDelete(false)}
                    className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded transition cursor-pointer"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsConfirmingDelete(true)}
                  className="px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </button>
              )
            )}

            <button
              onClick={() => {
                onClose();
                onEdit(voucher);
              }}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Editar</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>

            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition cursor-pointer shadow-md active:scale-98"
            >
              Cerrar Ficha
            </button>
          </div>
        </div>

      </div>

      {/* Photo Lightbox Popup */}
      {activePhoto && (
        <div 
          className="fixed inset-0 z-60 bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setActivePhoto(null)}
        >
          <div className="relative max-w-4xl max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setActivePhoto(null)}
              className="absolute -top-10 right-0 p-1.5 text-white/80 hover:text-white rounded-lg bg-black/50 cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={activePhoto}
              alt="Foto Ampliada"
              className="max-h-[82vh] w-auto rounded-xl object-contain border border-slate-700 shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Popup de Vale Emitido Vinculado */}
      {selectedIssuedVoucher && (
        <IssuedVoucherDetailModal
          isOpen={Boolean(selectedIssuedVoucher)}
          voucher={selectedIssuedVoucher}
          fleet={fleet}
          employees={employees}
          onClose={() => setSelectedIssuedVoucher(null)}
          onEdit={() => {}}
        />
      )}
    </div>
  );
};
