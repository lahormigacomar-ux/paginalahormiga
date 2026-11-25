import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { ClothingDeliveryReason, Employee, StockItem, StockMovement } from '../../types';
import { exportClothingDeliveriesToCSV } from '../../services/storage';
import { CLOTHING_MOTIVO_LABELS } from './IndumentariaDeliveryModal';
import {
  AlertTriangle,
  Calendar,
  Download,
  FileText,
  Printer,
  RotateCcw,
  Search,
  Shirt,
  Users,
} from 'lucide-react';

interface IndumentariaRegistryTabProps {
  deliveries: StockMovement[];
  indumentariaItems: StockItem[];
  employees: Employee[];
  onOpenNewDelivery: () => void;
}

export function generateIndumentariaConstanciaPDF(params: {
  movements: StockMovement[];
  employeeName: string;
  legajo?: string;
  dni?: string;
  sector?: string;
  responsable?: string;
  warehouseName?: string;
}): void {
  const {
    movements,
    employeeName,
    legajo,
    dni,
    sector,
    responsable,
    warehouseName = 'Depósito Ropa e Indumentaria (EPP)',
  } = params;

  if (movements.length === 0) return;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  // Header
  pdf.setFillColor(22, 25, 31);
  pdf.rect(margin, y, pageW - margin * 2, 20, 'F');
  pdf.setTextColor(240, 200, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('CONSTANCIA DE ENTREGA DE INDUMENTARIA Y EPP', margin + 5, y + 8);
  pdf.setTextColor(210, 215, 225);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text(
    `LA HORMIGA — Registro de Dotación y Protección Personal (Ref. Res. SRT 299/11) · ${warehouseName}`,
    margin + 5,
    y + 15
  );
  y += 26;

  // Employee Info Box
  pdf.setDrawColor(200, 205, 215);
  pdf.setFillColor(248, 250, 252);
  pdf.rect(margin, y, pageW - margin * 2, 22, 'FD');

  pdf.setTextColor(30, 41, 59);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.text(`Trabajador / Receptor: ${employeeName}`, margin + 4, y + 7);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text(`Legajo: ${legajo || 'S/D'}`, margin + 4, y + 13);
  pdf.text(`DNI / CUIT: ${dni || 'S/D'}`, margin + 55, y + 13);
  pdf.text(`Sector / Puesto: ${sector || 'Operativo'}`, margin + 110, y + 13);
  pdf.text(
    `Fecha de emisión: ${new Date().toISOString().slice(0, 10)} · Responsable: ${responsable || movements[0]?.responsableEntrega || 'Encargado de Depósito'}`,
    margin + 4,
    y + 19
  );
  y += 28;

  // Table Header
  const colWidths = [24, 68, 20, 18, 36, 16]; // sum = 182mm (210 - 28 = 182)
  const headers = ['Fecha', 'Prenda / Calzado / EPP', 'Talle', 'Cant.', 'Motivo', 'Dev. Ant.'];

  const drawTableHeader = (currY: number) => {
    pdf.setFillColor(30, 41, 59);
    pdf.rect(margin, currY, pageW - margin * 2, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    let cx = margin + 2;
    headers.forEach((h, i) => {
      pdf.text(h, cx, currY + 5.5);
      cx += colWidths[i];
    });
    return currY + 8;
  };

  y = drawTableHeader(y);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);

  movements.forEach((mov, idx) => {
    if (y > 245) {
      pdf.addPage();
      y = 18;
      y = drawTableHeader(y);
    }

    if (idx % 2 === 1) {
      pdf.setFillColor(244, 246, 250);
      pdf.rect(margin, y, pageW - margin * 2, 8, 'F');
    }

    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, y + 8, pageW - margin, y + 8);

    const motivoText = mov.motivoEntrega
      ? CLOTHING_MOTIVO_LABELS[mov.motivoEntrega] || mov.motivoConcepto
      : mov.motivoConcepto;

    const cells = [
      mov.fecha || '-',
      (mov.stockItemNombre || '').slice(0, 38),
      mov.talle || '-',
      `${mov.cantidad} ${mov.unidad}`,
      (motivoText || '-').slice(0, 22),
      mov.devuelveAnterior ? 'Sí' : 'No',
    ];

    pdf.setTextColor(15, 23, 42);
    let cx = margin + 2;
    cells.forEach((txt, i) => {
      pdf.text(String(txt), cx, y + 5.5);
      cx += colWidths[i];
    });

    y += 8;
  });

  y += 8;
  if (y > 245) {
    pdf.addPage();
    y = 20;
  }

  // Legal Note & Signature Lines
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);
  const note =
    'El trabajador abajo firmante declara recibir de conformidad la indumentaria de trabajo y/o elementos de protección personal detallados en la presente constancia, comprometiéndose a su correcto uso y cuidado durante la jornada laboral.';
  const splitNote = pdf.splitTextToSize(note, pageW - margin * 2);
  pdf.text(splitNote, margin, y);
  y += splitNote.length * 4 + 18;

  pdf.setDrawColor(100, 116, 139);
  pdf.line(margin + 6, y, margin + 78, y);
  pdf.line(pageW - margin - 78, y, pageW - margin - 6, y);

  pdf.setFontSize(8.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Firma y Aclaración del Trabajador', margin + 14, y + 5);
  pdf.text('Firma Responsable de Depósito / HyS', pageW - margin - 72, y + 5);
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`${employeeName} (Leg: ${legajo || 'S/D'})`, margin + 14, y + 10);

  const safeName = employeeName.replace(/[^a-zA-Z0-9_-]/g, '_');
  pdf.save(`Constancia_Indumentaria_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export const IndumentariaRegistryTab: React.FC<IndumentariaRegistryTabProps> = ({
  deliveries,
  indumentariaItems,
  employees,
  onOpenNewDelivery,
}) => {
  const [subView, setSubView] = useState<'history' | 'by_employee'>('history');
  const [search, setSearch] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('ALL');
  const [filterItem, setFilterItem] = useState('ALL');
  const [filterMotivo, setFilterMotivo] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const uniqueEmployeesInLogs = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    deliveries.forEach(d => {
      const name = (d.recibeEmpleadoNombre || '').trim();
      if (!name) return;
      const key = (d.recibeEmpleadoLegajo && d.recibeEmpleadoLegajo !== 'EVENTUAL')
        ? d.recibeEmpleadoLegajo
        : name.toUpperCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: d.recibeEmpleadoLegajo ? `${name} (Leg: ${d.recibeEmpleadoLegajo})` : name,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [deliveries]);

  const uniqueItemsInLogs = useMemo(() => {
    const map = new Map<string, string>();
    deliveries.forEach(d => {
      if (d.stockItemId && d.stockItemNombre) {
        map.set(d.stockItemId, d.stockItemNombre);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [deliveries]);

  const filteredDeliveries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...deliveries]
      .filter(m => {
        if (filterEmployee !== 'ALL') {
          const empKey = (m.recibeEmpleadoLegajo && m.recibeEmpleadoLegajo !== 'EVENTUAL')
            ? m.recibeEmpleadoLegajo
            : (m.recibeEmpleadoNombre || '').trim().toUpperCase();
          if (empKey !== filterEmployee) return false;
        }
        if (filterItem !== 'ALL' && m.stockItemId !== filterItem) return false;
        if (filterMotivo !== 'ALL' && m.motivoEntrega !== filterMotivo) return false;
        if (dateFrom && m.fecha < dateFrom) return false;
        if (dateTo && m.fecha > dateTo) return false;
        if (q) {
          const hay = [
            m.recibeEmpleadoNombre,
            m.recibeEmpleadoLegajo,
            m.recibeEmpleadoSector,
            m.stockItemNombre,
            m.talle,
            m.motivoConcepto,
            m.observaciones,
            m.responsableEntrega,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => `${b.fecha} ${b.hora || '00:00'}`.localeCompare(`${a.fecha} ${a.hora || '00:00'}`));
  }, [deliveries, filterEmployee, filterItem, filterMotivo, dateFrom, dateTo, search]);

  const metrics = useMemo(() => {
    const groupSet = new Set<string>();
    const empSet = new Set<string>();
    let totalUnits = 0;

    filteredDeliveries.forEach(m => {
      groupSet.add(m.entregaGrupoId || `${m.fecha}_${m.hora}_${m.recibeEmpleadoNombre || m.id}`);
      if (m.recibeEmpleadoNombre) {
        empSet.add((m.recibeEmpleadoLegajo && m.recibeEmpleadoLegajo !== 'EVENTUAL')
          ? m.recibeEmpleadoLegajo
          : m.recibeEmpleadoNombre.trim().toUpperCase());
      }
      totalUnits += Number(m.cantidad) || 0;
    });

    const lowStock = indumentariaItems.filter(i => i.stockActual <= i.stockMinimoAlerta).length;

    return {
      totalActos: groupSet.size,
      totalUnits,
      uniqueWorkers: empSet.size,
      lowStock,
    };
  }, [filteredDeliveries, indumentariaItems]);

  const summaryByEmployee = useMemo(() => {
    const map = new Map<string, {
      key: string;
      nombre: string;
      legajo?: string;
      dni?: string;
      sector?: string;
      lastDate: string;
      totalUnits: number;
      groups: Set<string>;
      items: StockMovement[];
    }>();

    filteredDeliveries.forEach(m => {
      const nombre = m.recibeEmpleadoNombre || 'Sin especificar';
      const key = (m.recibeEmpleadoLegajo && m.recibeEmpleadoLegajo !== 'EVENTUAL')
        ? m.recibeEmpleadoLegajo
        : nombre.trim().toUpperCase();

      const matchedEmp = employees.find(
        e => (m.recibeEmpleadoLegajo && e.legajo === m.recibeEmpleadoLegajo) || e.nombreApellido === nombre
      );

      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          nombre,
          legajo: m.recibeEmpleadoLegajo || matchedEmp?.legajo,
          dni: m.recibeEmpleadoDni || matchedEmp?.dni || matchedEmp?.cuit,
          sector: m.recibeEmpleadoSector || matchedEmp?.sector || matchedEmp?.categoria,
          lastDate: m.fecha,
          totalUnits: 0,
          groups: new Set(),
          items: [],
        };
        map.set(key, entry);
      }

      if (m.fecha > entry.lastDate) entry.lastDate = m.fecha;
      entry.totalUnits += Number(m.cantidad) || 0;
      entry.groups.add(m.entregaGrupoId || m.id);
      entry.items.push(m);
    });

    return Array.from(map.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [filteredDeliveries, employees]);

  const hasActiveFilters =
    search !== '' || filterEmployee !== 'ALL' || filterItem !== 'ALL' || filterMotivo !== 'ALL' || dateFrom !== '' || dateTo !== '';

  const handleClearFilters = () => {
    setSearch('');
    setFilterEmployee('ALL');
    setFilterItem('ALL');
    setFilterMotivo('ALL');
    setDateFrom('');
    setDateTo('');
  };

  const handlePrintGroupOrRow = (mov: StockMovement) => {
    const groupMovs = mov.entregaGrupoId
      ? deliveries.filter(d => d.entregaGrupoId === mov.entregaGrupoId)
      : [mov];

    const matchedEmp = employees.find(
      e => (mov.recibeEmpleadoLegajo && e.legajo === mov.recibeEmpleadoLegajo) || e.nombreApellido === mov.recibeEmpleadoNombre
    );

    generateIndumentariaConstanciaPDF({
      movements: groupMovs,
      employeeName: mov.recibeEmpleadoNombre || 'Personal',
      legajo: mov.recibeEmpleadoLegajo || matchedEmp?.legajo,
      dni: mov.recibeEmpleadoDni || matchedEmp?.dni || matchedEmp?.cuit,
      sector: mov.recibeEmpleadoSector || matchedEmp?.sector || matchedEmp?.categoria,
      responsable: mov.responsableEntrega,
      warehouseName: mov.depositoNombre,
    });
  };

  return (
    <div className="space-y-4">
      {/* KPI Strip (Single elevation, tabular-nums) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-400">Entregas Realizadas</div>
          <div className="text-xl font-black font-mono tabular-nums text-white mt-1">
            {metrics.totalActos}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Actos de entrega registrados</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-400">Prendas / EPP Entregados</div>
          <div className="text-xl font-black font-mono tabular-nums text-amber-400 mt-1">
            {metrics.totalUnits.toLocaleString()} u.
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Total unidades / pares</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-400">Personal con Registro</div>
          <div className="text-xl font-black font-mono tabular-nums text-emerald-400 mt-1">
            {metrics.uniqueWorkers}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Trabajadores con indumentaria</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-400">Alertas de Reposición</div>
          <div className={`text-xl font-black font-mono tabular-nums mt-1 flex items-center gap-1.5 ${metrics.lowStock > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
            {metrics.lowStock > 0 && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {metrics.lowStock}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Prendas/tallajes bajo mínimo</div>
        </div>
      </div>

      {/* Sub-navigation + Export Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setSubView('history')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              subView === 'history'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            Historial Detallado ({filteredDeliveries.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView('by_employee')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              subView === 'by_employee'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            Resumen por Empleado ({summaryByEmployee.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportClothingDeliveriesToCSV(filteredDeliveries)}
            disabled={filteredDeliveries.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Entregas CSV
          </button>
          <button
            type="button"
            onClick={onOpenNewDelivery}
            className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] transition flex items-center gap-1.5 cursor-pointer"
          >
            <Shirt className="w-3.5 h-3.5" />
            + Entregar Indumentaria
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
        <div className="relative lg:col-span-2">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar empleado, prenda, talle u observación..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <select
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
        >
          <option value="ALL">Todos los empleados</option>
          {uniqueEmployeesInLogs.map(emp => (
            <option key={emp.key} value={emp.key}>
              {emp.label}
            </option>
          ))}
        </select>

        <select
          value={filterItem}
          onChange={(e) => setFilterItem(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
        >
          <option value="ALL">Todas las prendas / EPP</option>
          {uniqueItemsInLogs.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={filterMotivo}
          onChange={(e) => setFilterMotivo(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
        >
          <option value="ALL">Todos los motivos</option>
          {Object.entries(CLOTHING_MOTIVO_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Desde fecha"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] font-mono tabular-nums text-slate-200 focus:outline-none focus:border-amber-500"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Hasta fecha"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] font-mono tabular-nums text-slate-200 focus:outline-none focus:border-amber-500"
          />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              title="Limpiar filtros"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table Views */}
      {subView === 'history' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                <th className="py-2.5 px-3">Fecha / Hora</th>
                <th className="py-2.5 px-3">Trabajador Receptor</th>
                <th className="py-2.5 px-3">Prenda / Calzado / EPP</th>
                <th className="py-2.5 px-3">Talle</th>
                <th className="py-2.5 px-3 text-right">Cant.</th>
                <th className="py-2.5 px-3">Motivo / Dev.</th>
                <th className="py-2.5 px-3">Responsable</th>
                <th className="py-2.5 px-3 text-right">Constancia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredDeliveries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2.5">
                      <Shirt className="w-10 h-10 text-slate-700 mx-auto" />
                      <div className="text-sm font-bold text-slate-300">
                        {hasActiveFilters
                          ? 'No hay entregas que coincidan con los filtros aplicados'
                          : 'Todavía no se registraron entregas de indumentaria al personal'}
                      </div>
                      <p className="text-xs text-slate-500">
                        Desde aquí podrá auditar qué prenda y talle recibió cada empleado y emitir la constancia firmada.
                      </p>
                      <button
                        type="button"
                        onClick={onOpenNewDelivery}
                        className="px-4 py-2 rounded-xl bg-[#F0C800] hover:bg-[#F6D84C] text-[#2D2D2D] font-black text-xs transition cursor-pointer"
                      >
                        Registrar Primera Entrega
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDeliveries.map(mov => {
                  const motivoLabel = mov.motivoEntrega
                    ? CLOTHING_MOTIVO_LABELS[mov.motivoEntrega]
                    : mov.motivoConcepto;

                  return (
                    <tr key={mov.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {mov.fecha}
                        </div>
                        <div className="text-[11px] text-slate-500 pl-5">{mov.hora || '00:00'} hs</div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-bold text-white">{mov.recibeEmpleadoNombre || 'Sin especificar'}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {mov.recibeEmpleadoLegajo ? `Leg: ${mov.recibeEmpleadoLegajo}` : 'Sin legajo'}
                          {mov.recibeEmpleadoSector ? ` · ${mov.recibeEmpleadoSector}` : ''}
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-100">{mov.stockItemNombre}</div>
                        {mov.observaciones && (
                          <div className="text-[11px] text-slate-400 truncate max-w-[240px]" title={mov.observaciones}>
                            {mov.observaciones}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-amber-400 font-bold whitespace-nowrap">
                        {mov.talle || '-'}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-black tabular-nums text-emerald-400 whitespace-nowrap">
                        {mov.cantidad} {mov.unidad}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="text-slate-200 font-medium">{motivoLabel}</div>
                        {mov.devuelveAnterior && (
                          <div className="text-[10px] text-cyan-400 font-semibold">
                            Con devolución de prenda anterior
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-slate-300">
                        {mov.responsableEntrega || '-'}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handlePrintGroupOrRow(mov)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-[#F0C800] hover:text-slate-950 text-slate-200 border border-slate-700 text-[11px] font-bold transition inline-flex items-center gap-1 cursor-pointer"
                          title="Descargar Constancia de Entrega en PDF (Res. SRT 299/11)"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          PDF
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
                <th className="py-2.5 px-3">Trabajador / Legajo</th>
                <th className="py-2.5 px-3">Sector</th>
                <th className="py-2.5 px-3">Última Entrega</th>
                <th className="py-2.5 px-3 text-right">Actos</th>
                <th className="py-2.5 px-3 text-right">Prendas / EPP</th>
                <th className="py-2.5 px-3">Detalle Reciente</th>
                <th className="py-2.5 px-3 text-right">Historial PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {summaryByEmployee.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No hay empleados con entregas registradas para el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                summaryByEmployee.map(row => (
                  <tr key={row.key} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white">{row.nombre}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Leg: {row.legajo || 'S/D'} {row.dni ? `· DNI: ${row.dni}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{row.sector || '-'}</td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {row.lastDate}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200 font-bold">
                      {row.groups.size}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-400 font-black">
                      {row.totalUnits} u.
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate">
                      {row.items
                        .slice(0, 3)
                        .map(it => `${it.cantidad}x ${it.stockItemNombre}${it.talle ? ` (${it.talle})` : ''}`)
                        .join(' · ')}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          generateIndumentariaConstanciaPDF({
                            movements: row.items,
                            employeeName: row.nombre,
                            legajo: row.legajo,
                            dni: row.dni,
                            sector: row.sector,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-[#F0C800] hover:text-slate-950 text-slate-200 border border-slate-700 text-[11px] font-bold transition inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Constancia Completa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
