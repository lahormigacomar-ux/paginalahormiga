import * as XLSX from 'xlsx';
import React, { useState, useMemo } from 'react';
import { 
  CajaDiariaSession, 
  CajaDiariaEntry, 
  ArqueoBilletes,
  CajaCategoria
} from '../types';
import { exportCajaDiariaToCSV } from '../services/storage';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { 
  DollarSign, 
  Plus, 
  Trash2, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  Download, 
  UploadCloud,
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet, 
  Building2, 
  CreditCard, 
  FileSpreadsheet,
  Lock,
  Unlock,
  Coins,
  RefreshCw,
  Search,
  Tag,
  Edit2,
  History
} from 'lucide-react';

interface CajaDiariaSectionProps {
  sessions: CajaDiariaSession[];
  onSaveSessions: (updatedSessions: CajaDiariaSession[]) => void;
}

export const CajaDiariaSection: React.FC<CajaDiariaSectionProps> = ({
  sessions,
  onSaveSessions
}) => {
  // Sort sessions by date descending
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [sessions]);

  // Direct access: Only top 5 most recent sessions
  const recentSessions = useMemo(() => {
    return sortedSessions.slice(0, 5);
  }, [sortedSessions]);

  // Active Session Date
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return sortedSessions.length > 0 ? sortedSessions[0].fecha : new Date().toISOString().slice(0, 10);
  });

  // Current active session
  const activeSession = useMemo(() => {
    return sessions.find(s => s.fecha === selectedDate) || null;
  }, [sessions, selectedDate]);

  // Modal State for New/Edit Entry, Arqueo Modal & History Modal
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CajaDiariaEntry | null>(null);
  const [isArqueoModalOpen, setIsArqueoModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [importFeedback, setImportFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Helper: Get Day of Week Full Name in Spanish (e.g., "Jueves")
  const getDayOfWeekFull = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return '';
    const date = new Date(y, m - 1, d);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[date.getDay()] || '';
  };

  // Helper: Get Day of Week Short Name in Spanish (e.g., "Jue")
  const getDayOfWeekShort = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return '';
    const date = new Date(y, m - 1, d);
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return days[date.getDay()] || '';
  };

  // Helper: Format Date as DD/MM/YYYY
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Entry Form State
  const [formTipo, setFormTipo] = useState<'INGRESO' | 'EGRESO'>('INGRESO');
  const [formComprobante, setFormComprobante] = useState('');
  const [formConcepto, setFormConcepto] = useState('');
  const [formCategoria, setFormCategoria] = useState<CajaCategoria>('EFECTIVO');
  const [formMonto, setFormMonto] = useState<string>('');
  const [formFormaPago, setFormFormaPago] = useState('EFECTIVO'); // EFECTIVO, TARJETA_TRANSF, CUENTA_CORRIENTE, ARIDOS, GASTOS_ADM
  const [formDetallePago, setFormDetallePago] = useState(''); // ej: QR NACION, CREDITO VIUMI
  const [formProveedorCliente, setFormProveedorCliente] = useState('');

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTipo, setFilterTipo] = useState<'ALL' | 'INGRESO' | 'EGRESO'>('ALL');

  // Helper: Format Currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 2
    }).format(val || 0);
  };

  // Excel Parser and Import Handler
  const handleImportExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const newSessions: CajaDiariaSession[] = [];

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (!data || data.length < 2) continue;

        let dateStr = '';
        if (/^\d{8}$/.test(sheetName)) {
          const d = sheetName.slice(0, 2);
          const m = sheetName.slice(2, 4);
          const y = sheetName.slice(4, 8);
          dateStr = `${y}-${m}-${d}`;
        }

        let apertura = 0;
        let foundDateCell = '';

        for (let r = 0; r < Math.min(10, data.length); r++) {
          const row = data[r] || [];
          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '');
            if (val.toUpperCase().includes('APERTURA')) {
              const nextVal = parseFloat(String(row[c + 1] || '0').replace(/[^0-9.-]/g, ''));
              if (!isNaN(nextVal) && nextVal > 0) apertura = nextVal;
            }
            if (!dateStr && typeof row[c] === 'string' && row[c].match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
              foundDateCell = row[c];
            }
          }
        }

        if (!dateStr && foundDateCell) {
          const parts = foundDateCell.split('/');
          if (parts.length === 3) {
            const d = parts[0].padStart(2, '0');
            const m = parts[1].padStart(2, '0');
            const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            dateStr = `${y}-${m}-${d}`;
          }
        }

        if (!dateStr) {
          dateStr = new Date().toISOString().slice(0, 10);
        }

        const entries: CajaDiariaEntry[] = [];
        let rIndex = 0;
        for (const row of data) {
          rIndex++;
          if (rIndex < 3 || !row || row.length === 0) continue;

          const comprobante = String(row[0] || '').trim();
          if (!comprobante || comprobante.startsWith('SUMATORIA') || comprobante.startsWith('VENTA TOTAL') || comprobante.startsWith('DINERO EN')) {
            continue;
          }

          const ef = parseFloat(String(row[1] || '0').replace(/[^0-9.-]/g, '')) || 0;
          const fp = String(row[2] || '').trim();
          const alqHerr = parseFloat(String(row[3] || '0').replace(/[^0-9.-]/g, '')) || 0;
          const transfMaq = parseFloat(String(row[4] || '0').replace(/[^0-9.-]/g, '')) || 0;
          const aridos = parseFloat(String(row[5] || '0').replace(/[^0-9.-]/g, '')) || 0;
          const alqEq = parseFloat(String(row[6] || '0').replace(/[^0-9.-]/g, '')) || 0;
          const tarjTransf = parseFloat(String(row[7] || '0').replace(/[^0-9.-]/g, '')) || 0;
          const ctaCte = parseFloat(String(row[8] || '0').replace(/[^0-9.-]/g, '')) || 0;
          const gastos = parseFloat(String(row[9] || '0').replace(/[^0-9.-]/g, '')) || 0;
          const concepto = String(row[10] || '').trim();

          if (ef === 0 && alqHerr === 0 && transfMaq === 0 && aridos === 0 && alqEq === 0 && tarjTransf === 0 && ctaCte === 0 && gastos === 0) {
            continue;
          }

          const isEgreso = gastos > 0;
          const total = isEgreso ? gastos : (ef + alqHerr + transfMaq + aridos + alqEq + tarjTransf + ctaCte);

          entries.push({
            id: `MOV-IMP-${dateStr}-${rIndex}`,
            fecha: dateStr,
            tipoMovimiento: isEgreso ? 'EGRESO' : 'INGRESO',
            comprobante: comprobante || (isEgreso ? 'GASTO' : 'REC-ING'),
            concepto: concepto || (isEgreso ? 'Gasto de Administración' : 'Venta de Mostrador'),
            categoria: isEgreso ? 'GASTOS_ADM' : (ef > 0 ? 'EFECTIVO' : tarjTransf > 0 ? 'TARJETA_TRANSF' : ctaCte > 0 ? 'CUENTA_CORRIENTE' : aridos > 0 ? 'ARIDOS' : 'OTRO'),
            montoEfectivo: ef,
            montoTarjetaTransf: tarjTransf,
            montoCtaCte: ctaCte,
            montoAridos: aridos,
            montoAlquilerEquipo: alqEq,
            montoGasto: gastos,
            montoTotal: total,
            formaPagoDetalle: fp || undefined
          });
        }

        if (entries.length > 0) {
          newSessions.push({
            id: `CAJA-${dateStr}`,
            fecha: dateStr,
            estado: 'CERRADA',
            aperturaCaja: apertura,
            entradas: entries,
            arqueo: {
              b20000: 0, b10000: 0, b2000: 0, b1000: 0, b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, b10: 0
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }

      if (newSessions.length > 0) {
        const updated = [...sessions];
        newSessions.forEach(ns => {
          const idx = updated.findIndex(s => s.fecha === ns.fecha);
          if (idx !== -1) {
            updated[idx] = ns;
          } else {
            updated.push(ns);
          }
        });
        onSaveSessions(updated);
        setSelectedDate(newSessions[0].fecha);
        setImportFeedback({ ok: true, msg: `Se importaron ${newSessions.length} hojas/fechas de caja desde tu archivo Excel.` });
      } else {
        setImportFeedback({ ok: false, msg: 'No se encontraron registros de caja válidos en el archivo Excel.' });
      }
    } catch (err: any) {
      setImportFeedback({ ok: false, msg: 'Error procesando el archivo Excel: ' + (err.message || err) });
    } finally {
      e.target.value = '';
    }
  };

  // Switch or Create New Date Session
  const handleSelectOrCreateDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    const existing = sessions.find(s => s.fecha === dateStr);
    if (!existing) {
      // Find previous session for initial cash balance inheritance
      const previousSession = sortedSessions.find(s => s.fecha < dateStr);
      const inheritedApertura = previousSession ? (previousSession.cierreEfectivoFisico || previousSession.cierreEfectivoCalculado || 0) : 0;

      const newSession: CajaDiariaSession = {
        id: `CAJA-${dateStr}`,
        fecha: dateStr,
        estado: 'ABIERTA',
        aperturaCaja: inheritedApertura,
        entradas: [],
        arqueo: {
          b20000: 0,
          b10000: 0,
          b2000: 0,
          b1000: 0,
          b500: 0,
          b200: 0,
          b100: 0,
          b50: 0,
          b20: 0,
          b10: 0
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      onSaveSessions([...sessions, newSession]);
    }
  };

  // Update Apertura de Caja
  const handleUpdateApertura = (newApertura: number) => {
    if (!activeSession) return;
    const updated = sessions.map(s => {
      if (s.fecha === activeSession.fecha) {
        return {
          ...s,
          aperturaCaja: newApertura,
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });
    onSaveSessions(updated);
  };

  // Update Arqueo Billetes count
  const handleUpdateArqueo = (denomination: keyof ArqueoBilletes, count: number) => {
    if (!activeSession) return;
    const cleanCount = Math.max(0, count || 0);
    const updatedArqueo: ArqueoBilletes = {
      ...activeSession.arqueo,
      [denomination]: cleanCount
    };

    const updated = sessions.map(s => {
      if (s.fecha === activeSession.fecha) {
        // Calculate physical closing cash
        const cierreFisico = (
          (updatedArqueo.b20000 * 20000) +
          (updatedArqueo.b10000 * 10000) +
          (updatedArqueo.b2000 * 2000) +
          (updatedArqueo.b1000 * 1000) +
          (updatedArqueo.b500 * 500) +
          (updatedArqueo.b200 * 200) +
          (updatedArqueo.b100 * 100) +
          (updatedArqueo.b50 * 50) +
          (updatedArqueo.b20 * 20) +
          (updatedArqueo.b10 * 10)
        );

        return {
          ...s,
          arqueo: updatedArqueo,
          cierreEfectivoFisico: cierreFisico,
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });
    onSaveSessions(updated);
  };

  // Open modal for new entry
  const handleOpenNewEntryModal = () => {
    setEditingEntry(null);
    setFormTipo('INGRESO');
    setFormComprobante('');
    setFormConcepto('');
    setFormCategoria('EFECTIVO');
    setFormMonto('');
    setFormFormaPago('EFECTIVO');
    setFormDetallePago('');
    setFormProveedorCliente('');
    setIsEntryModalOpen(true);
  };

  // Open modal for editing entry
  const handleOpenEditEntryModal = (entry: CajaDiariaEntry) => {
    setEditingEntry(entry);
    setFormTipo(entry.tipoMovimiento);
    setFormComprobante(entry.comprobante);
    setFormConcepto(entry.concepto);
    setFormCategoria(entry.categoria);
    setFormMonto(String(entry.montoTotal || 0));
    setFormFormaPago(entry.categoria);
    setFormDetallePago(entry.formaPagoDetalle || '');
    setFormProveedorCliente(entry.proveedorCliente || '');
    setIsEntryModalOpen(true);
  };

  // Save Entry (Add or Update)
  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    const monto = parseFloat(formMonto) || 0;
    if (monto <= 0) return;

    let montoEfectivo = 0;
    let montoTarjetaTransf = 0;
    let montoCtaCte = 0;
    let montoAridos = 0;
    let montoAlquilerEquipo = 0;
    let montoGasto = 0;

    if (formTipo === 'EGRESO') {
      montoGasto = monto;
    } else {
      switch (formFormaPago) {
        case 'EFECTIVO':
          montoEfectivo = monto;
          break;
        case 'TARJETA_TRANSF':
          montoTarjetaTransf = monto;
          break;
        case 'CUENTA_CORRIENTE':
          montoCtaCte = monto;
          break;
        case 'ARIDOS':
          montoAridos = monto;
          break;
        case 'ALQUILER_EQUIPOS':
          montoAlquilerEquipo = monto;
          break;
        default:
          montoEfectivo = monto;
      }
    }

    const newEntry: CajaDiariaEntry = {
      id: editingEntry ? editingEntry.id : `MOV-${Date.now()}`,
      fecha: activeSession.fecha,
      tipoMovimiento: formTipo,
      comprobante: formComprobante || (formTipo === 'INGRESO' ? 'REC-ING' : 'REC-EGR'),
      concepto: formConcepto || (formTipo === 'INGRESO' ? 'Ingreso de Caja' : 'Gasto / Egreso de Caja'),
      categoria: formTipo === 'EGRESO' ? 'GASTOS_ADM' : (formFormaPago as CajaCategoria),
      montoEfectivo,
      montoTarjetaTransf,
      montoCtaCte,
      montoAridos,
      montoAlquilerEquipo,
      montoGasto,
      montoTotal: monto,
      formaPagoDetalle: formDetallePago || undefined,
      proveedorCliente: formProveedorCliente || undefined
    };

    let updatedEntradas: CajaDiariaEntry[];
    if (editingEntry) {
      updatedEntradas = activeSession.entradas.map(it => it.id === editingEntry.id ? newEntry : it);
    } else {
      updatedEntradas = [...activeSession.entradas, newEntry];
    }

    const updatedSessions = sessions.map(s => {
      if (s.fecha === activeSession.fecha) {
        return {
          ...s,
          entradas: updatedEntradas,
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });

    onSaveSessions(updatedSessions);
    setIsEntryModalOpen(false);
  };

  const [entryToDelete, setEntryToDelete] = useState<CajaDiariaEntry | null>(null);

  // Delete Entry
  const handleDeleteEntry = (entryId: string) => {
    if (!activeSession) return;
    const found = activeSession.entradas.find(it => it.id === entryId);
    if (!found) return;
    setEntryToDelete(found);
  };

  const confirmDeleteEntry = () => {
    if (!activeSession || !entryToDelete) return;
    const updatedEntradas = activeSession.entradas.filter(it => it.id !== entryToDelete.id);
    const updatedSessions = sessions.map(s => {
      if (s.fecha === activeSession.fecha) {
        return {
          ...s,
          entradas: updatedEntradas,
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });
    onSaveSessions(updatedSessions);
    setEntryToDelete(null);
  };

  // Toggle Session Open / Closed
  const handleToggleEstadoSession = () => {
    if (!activeSession) return;
    const nuevoEstado: 'ABIERTA' | 'CERRADA' = activeSession.estado === 'ABIERTA' ? 'CERRADA' : 'ABIERTA';
    const updatedSessions = sessions.map(s => {
      if (s.fecha === activeSession.fecha) {
        return {
          ...s,
          estado: nuevoEstado,
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });
    onSaveSessions(updatedSessions);
  };

  // Calculations for current active session
  const calculations = useMemo(() => {
    if (!activeSession) {
      return {
        apertura: 0,
        totalEfectivoIngreso: 0,
        totalTarjetaTransf: 0,
        totalCtaCte: 0,
        totalAridos: 0,
        totalAlquilerEquipo: 0,
        totalGastos: 0,
        ventaTotalMostrador: 0,
        cierreEfectivoCalculado: 0,
        cierreEfectivoFisico: 0,
        diferencia: 0,
        sumatoriaVentasMasCajaInicial: 0
      };
    }

    const apertura = activeSession.aperturaCaja || 0;
    let totalEfectivoIngreso = 0;
    let totalTarjetaTransf = 0;
    let totalCtaCte = 0;
    let totalAridos = 0;
    let totalAlquilerEquipo = 0;
    let totalGastos = 0;

    activeSession.entradas.forEach(it => {
      if (it.tipoMovimiento === 'EGRESO') {
        totalGastos += (it.montoGasto || it.montoTotal || 0);
      } else {
        totalEfectivoIngreso += (it.montoEfectivo || 0);
        totalTarjetaTransf += (it.montoTarjetaTransf || 0);
        totalCtaCte += (it.montoCtaCte || 0);
        totalAridos += (it.montoAridos || 0);
        totalAlquilerEquipo += (it.montoAlquilerEquipo || 0);
      }
    });

    const ventaTotalMostrador = totalEfectivoIngreso + totalTarjetaTransf;
    const cierreEfectivoCalculado = apertura + totalEfectivoIngreso - totalGastos;

    const arqueo = activeSession.arqueo || {
      b20000: 0, b10000: 0, b2000: 0, b1000: 0, b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, b10: 0
    };
    const cierreEfectivoFisico = (
      (arqueo.b20000 * 20000) +
      (arqueo.b10000 * 10000) +
      (arqueo.b2000 * 2000) +
      (arqueo.b1000 * 1000) +
      (arqueo.b500 * 500) +
      (arqueo.b200 * 200) +
      (arqueo.b100 * 100) +
      (arqueo.b50 * 50) +
      (arqueo.b20 * 20) +
      (arqueo.b10 * 10)
    );

    const diferencia = cierreEfectivoFisico - cierreEfectivoCalculado;
    const sumatoriaVentasMasCajaInicial = apertura + ventaTotalMostrador + totalAridos + totalCtaCte;

    return {
      apertura,
      totalEfectivoIngreso,
      totalTarjetaTransf,
      totalCtaCte,
      totalAridos,
      totalAlquilerEquipo,
      totalGastos,
      ventaTotalMostrador,
      cierreEfectivoCalculado,
      cierreEfectivoFisico,
      diferencia,
      sumatoriaVentasMasCajaInicial
    };
  }, [activeSession]);

  // Filtered Entries List
  const filteredEntries = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.entradas.filter(it => {
      const q = searchQuery.toLowerCase();
      const matchSearch = (
        it.comprobante.toLowerCase().includes(q) ||
        it.concepto.toLowerCase().includes(q) ||
        (it.proveedorCliente || '').toLowerCase().includes(q) ||
        (it.formaPagoDetalle || '').toLowerCase().includes(q)
      );
      const matchTipo = filterTipo === 'ALL' || it.tipoMovimiento === filterTipo;
      return matchSearch && matchTipo;
    });
  }, [activeSession, searchQuery, filterTipo]);

  return (
    <div className="space-y-6">
      {/* Top Header & Date Navigation */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Caja Diaria & Arqueo de Efectivo
                {activeSession && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {getDayOfWeekFull(activeSession.fecha)} {formatDateDisplay(activeSession.fecha)}
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400">
                Planilla diaria de ingresos, ventas mostrador, gastos de administración y desglose físico de billetes.
              </p>
            </div>
          </div>
        </div>

        {/* Date Selector & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <Calendar className="w-4 h-4 text-amber-400 ml-2" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleSelectOrCreateDate(e.target.value)}
              className="bg-transparent text-white font-mono text-xs font-bold focus:outline-none pr-2 cursor-pointer"
            />
          </div>

          <button
            onClick={() => handleSelectOrCreateDate(new Date().toISOString().slice(0, 10))}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            title="Ir a Caja de Hoy"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" /> Hoy
          </button>

          {activeSession && (
            <button
              onClick={handleToggleEstadoSession}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                activeSession.estado === 'ABIERTA'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
              }`}
            >
              {activeSession.estado === 'ABIERTA' ? (
                <>
                  <Unlock className="w-3.5 h-3.5" /> Caja Abierta (Cerrar)
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" /> Caja Cerrada (Reabrir)
                </>
              )}
            </button>
          )}

          <label className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl border border-emerald-500 transition flex items-center gap-1.5 cursor-pointer shadow-md">
            <UploadCloud className="w-4 h-4" />
            <span>Importar Excel</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={handleImportExcelFile}
              className="hidden"
            />
          </label>

          {activeSession && (
            <button
              onClick={() => setIsArqueoModalOpen(true)}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer border border-amber-400"
            >
              <Coins className="w-4 h-4" />
              <span>Desglose de Billetes ({formatCurrency(calculations.cierreEfectivoFisico)})</span>
            </button>
          )}

          {activeSession && (
            <button
              onClick={() => exportCajaDiariaToCSV(activeSession)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-blue-400" /> Imprimir
          </button>
        </div>
      </div>

      {importFeedback && (
        <div className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
          importFeedback.ok
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          <span>{importFeedback.msg}</span>
          <button
            type="button"
            onClick={() => setImportFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Available Session Tabs (Quick Switcher: 5 Direct Buttons + History Button) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider whitespace-nowrap mr-1">
          Últimas Cajas:
        </span>
        {recentSessions.map(s => {
          const isSelected = s.fecha === selectedDate;
          const dayShort = getDayOfWeekShort(s.fecha);
          const formattedDate = formatDateDisplay(s.fecha).slice(0, 5); // ej "05/11"
          return (
            <button
              key={s.id}
              onClick={() => setSelectedDate(s.fecha)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer border flex items-center gap-2 ${
                isSelected
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-lg shadow-amber-500/10'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-[10px] font-mono uppercase opacity-80">{dayShort}</span>
              <span className="font-mono">{formattedDate}</span>
              <span className={`w-2 h-2 rounded-full ${s.estado === 'ABIERTA' ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
            </button>
          );
        })}

        {/* If selected date is older than top 5, show indicator */}
        {!recentSessions.some(s => s.fecha === selectedDate) && activeSession && (
          <div className="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap bg-amber-500 text-slate-950 border border-amber-400 flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase">{getDayOfWeekShort(activeSession.fecha)}</span>
            <span className="font-mono">{formatDateDisplay(activeSession.fecha)}</span>
            <span className="text-[9px] bg-slate-950 text-amber-400 px-1 rounded font-mono">HISTÓRICO</span>
          </div>
        )}

        <button
          onClick={() => setIsHistoryModalOpen(true)}
          className="px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer border flex items-center gap-1.5 bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700 shadow-md ml-auto"
        >
          <History className="w-3.5 h-3.5 text-amber-400" />
          <span>Historial Completo ({sortedSessions.length})</span>
        </button>
      </div>

      {activeSession && (
        <>
          {/* Top KPI Metrics Dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Apertura de Caja */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>APERTURA DE CAJA</span>
                <Coins className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-center justify-between">
                <input
                  type="number"
                  value={activeSession.aperturaCaja || 0}
                  onChange={(e) => handleUpdateApertura(parseFloat(e.target.value) || 0)}
                  className="text-xl font-black font-mono text-white bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 w-36 focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-500 font-mono">Efectivo Inicial</span>
              </div>
            </div>

            {/* 2. Venta Total Mostrador */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>VENTA TOTAL MOSTRADOR</span>
                <CreditCard className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-black font-mono text-emerald-400">
                {formatCurrency(calculations.ventaTotalMostrador)}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>Ef: <b>{formatCurrency(calculations.totalEfectivoIngreso)}</b></span>
                <span>•</span>
                <span>Tarj/Transf: <b>{formatCurrency(calculations.totalTarjetaTransf)}</b></span>
              </div>
            </div>

            {/* 3. Gastos y Egresos */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>GASTOS / CAJA ADM</span>
                <ArrowDownRight className="w-4 h-4 text-red-400" />
              </div>
              <div className="text-xl font-black font-mono text-red-400">
                {formatCurrency(calculations.totalGastos)}
              </div>
              <div className="text-[11px] text-slate-400">
                Total de egresos registrados
              </div>
            </div>

            {/* 4. Dinero en Caja (Arqueo Físico vs Teórico) - Clickable to open Arqueo Modal */}
            <div 
              onClick={() => setIsArqueoModalOpen(true)}
              className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2 shadow-lg hover:border-amber-500/50 transition cursor-pointer group"
            >
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span className="group-hover:text-amber-300 transition font-bold">DINERO EN CAJA (ARQUEO)</span>
                <Coins className="w-4 h-4 text-amber-400 group-hover:scale-110 transition" />
              </div>
              <div className="text-xl font-black font-mono text-amber-400 flex items-center justify-between">
                <span>{formatCurrency(calculations.cierreEfectivoFisico)}</span>
                <span className="text-[10px] font-sans font-bold px-2 py-0.5 bg-amber-500/10 text-amber-300 rounded border border-amber-500/20">
                  Ver Billetes ↗
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Teórico: <b>{formatCurrency(calculations.cierreEfectivoCalculado)}</b></span>
                {calculations.diferencia === 0 ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Cuadra
                  </span>
                ) : calculations.diferencia > 0 ? (
                  <span className="text-amber-400 font-bold">
                    +${calculations.diferencia} Sobrante
                  </span>
                ) : (
                  <span className="text-red-400 font-bold">
                    -${Math.abs(calculations.diferencia)} Faltante
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Secondary Metric Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800 text-xs">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400">Cuentas Corrientes (Obra/Clientes):</span>
              <span className="font-bold text-amber-300 font-mono text-sm">{formatCurrency(calculations.totalCtaCte)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400">Venta Áridos / Suelos:</span>
              <span className="font-bold text-cyan-300 font-mono text-sm">{formatCurrency(calculations.totalAridos)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400">Sumatoria Ventas + Caja Inicial:</span>
              <span className="font-bold text-white font-mono text-sm">{formatCurrency(calculations.sumatoriaVentasMasCajaInicial)}</span>
            </div>
          </div>

          {/* Main Layout: Full Width Spreadsheet Table */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              {/* Table Header & Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                    Planilla de Ingresos & Gastos ({filteredEntries.length})
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Buscar comprobante, concepto..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-44 sm:w-56"
                    />
                  </div>

                  <select
                    value={filterTipo}
                    onChange={(e: any) => setFilterTipo(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
                  >
                    <option value="ALL">Todos los Movimientos</option>
                    <option value="INGRESO">Solo Ingresos</option>
                    <option value="EGRESO">Solo Gastos/Egresos</option>
                  </select>

                  <button
                    onClick={handleOpenNewEntryModal}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Nuevo Movimiento
                  </button>
                </div>
              </div>

              {/* Spreadsheet Table (Full Width) */}
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-[10px] uppercase tracking-wider font-semibold border-b border-slate-800">
                      <th className="py-2.5 px-3">COMPROBANTE</th>
                      <th className="py-2.5 px-3 text-right">EFECTIVO</th>
                      <th className="py-2.5 px-3 text-right">TARJETA / TRANSF</th>
                      <th className="py-2.5 px-3 text-right">ÁRIDOS</th>
                      <th className="py-2.5 px-3 text-right">CTA CTE</th>
                      <th className="py-2.5 px-3 text-right">GASTOS ADM</th>
                      <th className="py-2.5 px-3">CONCEPTO / OBSERVACIONES</th>
                      <th className="py-2.5 px-2 text-right">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredEntries.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-500 font-sans">
                          No hay movimientos registrados para esta fecha. Haga clic en <strong>"+ Nuevo Movimiento"</strong>.
                        </td>
                      </tr>
                    ) : (
                      filteredEntries.map(it => {
                        const isEgreso = it.tipoMovimiento === 'EGRESO';
                        return (
                          <tr key={it.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className={`font-bold ${isEgreso ? 'text-red-400' : 'text-emerald-400'}`}>
                                {it.comprobante}
                              </span>
                              {it.formaPagoDetalle && (
                                <span className="ml-1.5 px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[9px] font-sans">
                                  {it.formaPagoDetalle}
                                </span>
                              )}
                            </td>

                            <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                              {it.montoEfectivo > 0 ? formatCurrency(it.montoEfectivo) : '-'}
                            </td>

                            <td className="py-2.5 px-3 text-right text-purple-300 font-bold">
                              {it.montoTarjetaTransf > 0 ? formatCurrency(it.montoTarjetaTransf) : '-'}
                            </td>

                            <td className="py-2.5 px-3 text-right text-cyan-300 font-bold">
                              {it.montoAridos > 0 ? formatCurrency(it.montoAridos) : '-'}
                            </td>

                            <td className="py-2.5 px-3 text-right text-amber-300 font-bold">
                              {it.montoCtaCte > 0 ? formatCurrency(it.montoCtaCte) : '-'}
                            </td>

                            <td className="py-2.5 px-3 text-right text-red-400 font-bold">
                              {it.montoGasto > 0 ? formatCurrency(it.montoGasto) : '-'}
                            </td>

                            <td className="py-2.5 px-3 font-sans text-slate-200">
                              <div className="font-medium">{it.concepto}</div>
                              {it.proveedorCliente && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Ref: {it.proveedorCliente}
                                </div>
                              )}
                            </td>

                            <td className="py-2.5 px-2 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleOpenEditEntryModal(it)}
                                  className="p-1 text-slate-400 hover:text-amber-400 transition"
                                  title="Editar Movimiento"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteEntry(it.id)}
                                  className="p-1 text-slate-400 hover:text-red-400 transition cursor-pointer"
                                  title="Eliminar Movimiento"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {/* Totals Footer Row */}
                  <tfoot>
                    <tr className="bg-slate-950 font-mono font-bold text-white border-t border-slate-700">
                      <td className="py-3 px-3 uppercase text-[10px] tracking-wider text-slate-400 font-sans">
                        TOTALES DEL DÍA
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-400">
                        {formatCurrency(calculations.totalEfectivoIngreso)}
                      </td>
                      <td className="py-3 px-3 text-right text-purple-300">
                        {formatCurrency(calculations.totalTarjetaTransf)}
                      </td>
                      <td className="py-3 px-3 text-right text-cyan-300">
                        {formatCurrency(calculations.totalAridos)}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-300">
                        {formatCurrency(calculations.totalCtaCte)}
                      </td>
                      <td className="py-3 px-3 text-right text-red-400">
                        {formatCurrency(calculations.totalGastos)}
                      </td>
                      <td colSpan={2} className="py-3 px-3 text-right text-amber-400 font-sans text-xs">
                        Venta Mostrador: <strong>{formatCurrency(calculations.ventaTotalMostrador)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* MODAL: Desglose de Billetes / Arqueo Físico */}
      {isArqueoModalOpen && activeSession && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Desglose de Billetes - Arqueo Físico</h3>
                  <p className="text-xs text-slate-400">Conteo de billetes para la caja del {activeSession.fecha}</p>
                </div>
              </div>
              <button
                onClick={() => setIsArqueoModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Bill denomination inputs grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                { denom: 'b20000', label: '$20.000', val: 20000 },
                { denom: 'b10000', label: '$10.000', val: 10000 },
                { denom: 'b2000', label: '$2.000', val: 2000 },
                { denom: 'b1000', label: '$1.000', val: 1000 },
                { denom: 'b500', label: '$500', val: 500 },
                { denom: 'b200', label: '$200', val: 200 },
                { denom: 'b100', label: '$100', val: 100 },
                { denom: 'b50', label: '$50', val: 50 },
                { denom: 'b20', label: '$20', val: 20 },
                { denom: 'b10', label: '$10', val: 10 }
              ].map(({ denom, label, val }) => {
                const count = activeSession.arqueo[denom as keyof ArqueoBilletes] || 0;
                const subtotal = count * val;
                return (
                  <div key={denom} className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="font-mono font-bold text-amber-300 text-xs w-16">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 text-[10px]">×</span>
                      <input
                        type="number"
                        min="0"
                        value={count || ''}
                        onChange={(e) => handleUpdateArqueo(denom as keyof ArqueoBilletes, parseInt(e.target.value, 10) || 0)}
                        className="w-16 bg-slate-900 border border-slate-700 text-white font-mono text-xs font-bold rounded-lg px-2 py-1 text-center focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <span className="font-mono text-xs text-white w-24 text-right font-semibold">
                      {subtotal > 0 ? `$${subtotal.toLocaleString('es-AR')}` : '-'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Summary card inside modal */}
            <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/30 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Total Billetes (Conteo Físico):</span>
                <span className="font-mono font-black text-amber-400 text-base">
                  {formatCurrency(calculations.cierreEfectivoFisico)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-slate-800 pt-2">
                <span className="text-slate-400">Efectivo Teórico (Apertura + Ef.Ventas - Gastos):</span>
                <span className="font-mono text-slate-200 font-bold">
                  {formatCurrency(calculations.cierreEfectivoCalculado)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
                <span className="text-slate-300 font-bold">Diferencia de Arqueo:</span>
                {calculations.diferencia === 0 ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" /> $0 (Cuadra Perfecto)
                  </span>
                ) : calculations.diferencia > 0 ? (
                  <span className="text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    +${calculations.diferencia.toLocaleString('es-AR')} (Sobrante)
                  </span>
                ) : (
                  <span className="text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                    -${Math.abs(calculations.diferencia).toLocaleString('es-AR')} (Faltante)
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsArqueoModalOpen(false)}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition cursor-pointer"
              >
                Listo / Cerrar Desglose
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Nuevo / Editar Movimiento de Caja */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-amber-400" />
                {editingEntry ? 'Editar Movimiento de Caja' : 'Nuevo Movimiento de Caja'}
              </h3>
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="space-y-4">
              {/* Type Switcher: INGRESO vs EGRESO */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setFormTipo('INGRESO');
                    setFormCategoria('EFECTIVO');
                  }}
                  className={`py-2 rounded-lg font-bold text-xs transition ${
                    formTipo === 'INGRESO'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🟢 INGRESO / VENTA
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormTipo('EGRESO');
                    setFormCategoria('GASTOS_ADM');
                  }}
                  className={`py-2 rounded-lg font-bold text-xs transition ${
                    formTipo === 'EGRESO'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🔴 GASTO / EGRESO
                </button>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Nº Comprobante / Referencia *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={formTipo === 'INGRESO' ? 'FACT B 05-2734' : 'FACT 017-5275'}
                    value={formComprobante}
                    onChange={(e) => setFormComprobante(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Monto Total ($ ARS) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0.01"
                    placeholder="0.00"
                    value={formMonto}
                    onChange={(e) => setFormMonto(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Category / Payment method selector */}
              {formTipo === 'INGRESO' && (
                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-xs">
                    Forma de Pago / Destino de Registro *
                  </label>
                  <select
                    value={formFormaPago}
                    onChange={(e) => setFormFormaPago(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="EFECTIVO">💵 EFECTIVO (Mostrador)</option>
                    <option value="TARJETA_TRANSF">💳 TARJETA / TRANSFERENCIA (QR / Débito / Crédito)</option>
                    <option value="CUENTA_CORRIENTE">📋 CUENTA CORRIENTE (Obra / Factura Pendiente)</option>
                    <option value="ARIDOS">🏗️ VENTA ÁRIDOS / MOV. SUELOS</option>
                    <option value="ALQUILER_EQUIPOS">🚜 ALQUILER MAQUINARIA EQUIPO</option>
                  </select>
                </div>
              )}

              {/* Detalle Medio de Pago (QR Nacion, Credito Viumi, etc.) */}
              {formTipo === 'INGRESO' && formFormaPago === 'TARJETA_TRANSF' && (
                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-xs">
                    Detalle Medio de Pago
                  </label>
                  <input
                    type="text"
                    placeholder="ej: QR NACION, CREDITO VIUMI, DEBITO NACION"
                    value={formDetallePago}
                    onChange={(e) => setFormDetallePago(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* Concepto / Descripción */}
              <div>
                <label className="block text-slate-400 font-medium mb-1 text-xs">
                  Concepto / Descripción del Movimiento *
                </label>
                <input
                  type="text"
                  required
                  placeholder={formTipo === 'INGRESO' ? 'Alquiler de herramienta / Venta mostrador' : 'COMPRA DE PAPEL PARA OBRA FORBICE'}
                  value={formConcepto}
                  onChange={(e) => setFormConcepto(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Proveedor / Cliente */}
              <div>
                <label className="block text-slate-400 font-medium mb-1 text-xs">
                  Proveedor / Cliente / Obra (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="ej: FORBICE S.R.L., LEONEL FERNANDEZ, TOYOTA"
                  value={formProveedorCliente}
                  onChange={(e) => setFormProveedorCliente(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEntryModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition"
                >
                  {editingEntry ? 'Guardar Cambios' : 'Registrar Movimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Historial Completo de Cajas */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Historial Completo de Cajas Diarias</h3>
                  <p className="text-xs text-slate-400">Consulte y seleccione cualquier caja registrada anteriormente</p>
                </div>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por fecha (ej: 05/11), día (ej: Jueves)..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {/* History Sessions List */}
            <div className="space-y-2">
              {sortedSessions
                .filter(s => {
                  const q = historySearchQuery.toLowerCase();
                  const fullDay = getDayOfWeekFull(s.fecha).toLowerCase();
                  const formatted = formatDateDisplay(s.fecha);
                  return s.fecha.includes(q) || formatted.includes(q) || fullDay.includes(q);
                })
                .map(s => {
                  const isSelected = s.fecha === selectedDate;
                  const dayFull = getDayOfWeekFull(s.fecha);
                  const formatted = formatDateDisplay(s.fecha);
                  const totalVentas = (s.entradas || []).reduce((acc, it) => acc + (it.montoEfectivo || 0) + (it.montoTarjetaTransf || 0), 0);
                  const totalGastos = (s.entradas || []).reduce((acc, it) => acc + (it.montoGasto || 0), 0);
                  const cierreFisico = s.cierreEfectivoFisico || (
                    ((s.arqueo?.b20000 || 0) * 20000) +
                    ((s.arqueo?.b10000 || 0) * 10000) +
                    ((s.arqueo?.b2000 || 0) * 2000) +
                    ((s.arqueo?.b1000 || 0) * 1000) +
                    ((s.arqueo?.b500 || 0) * 500) +
                    ((s.arqueo?.b200 || 0) * 200) +
                    ((s.arqueo?.b100 || 0) * 100) +
                    ((s.arqueo?.b50 || 0) * 50) +
                    ((s.arqueo?.b20 || 0) * 20) +
                    ((s.arqueo?.b10 || 0) * 10)
                  );

                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedDate(s.fecha);
                        setIsHistoryModalOpen(false);
                      }}
                      className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/50 shadow-md'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-center w-20 px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
                          <div className="text-[10px] font-bold text-amber-400 uppercase font-mono">{getDayOfWeekShort(s.fecha)}</div>
                          <div className="text-xs font-mono font-black text-white">{s.fecha.slice(8, 10)}/{s.fecha.slice(5, 7)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span>{dayFull} {formatted}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              s.estado === 'ABIERTA' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {s.estado}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-1 flex flex-wrap items-center gap-x-2">
                            <span>Apertura: <b className="text-slate-200">{formatCurrency(s.aperturaCaja || 0)}</b></span>
                            <span>•</span>
                            <span>Ventas: <b className="text-emerald-400">{formatCurrency(totalVentas)}</b></span>
                            <span>•</span>
                            <span>Gastos: <b className="text-red-400">{formatCurrency(totalGastos)}</b></span>
                            <span>•</span>
                            <span>Físico: <b className="text-amber-300">{formatCurrency(cierreFisico)}</b></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 shadow-md'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                          }`}
                        >
                          {isSelected ? 'Caja Activa' : 'Abrir Caja'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
              <span className="text-slate-400">Total de cajas en historial: <b>{sortedSessions.length}</b></span>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-xl font-bold transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={!!entryToDelete}
        title="¿Realmente desea eliminar este movimiento de Caja Diaria?"
        itemName={entryToDelete ? `${entryToDelete.concepto} ($${(entryToDelete.montoTotal || 0).toLocaleString('es-AR')})` : ''}
        onConfirm={confirmDeleteEntry}
        onCancel={() => setEntryToDelete(null)}
      />
    </div>
  );
};
