import React from 'react';
import { Vehicle } from '../types';
import { formatCurrency } from '../services/storage';
import { 
  Truck, 
  CheckCircle2, 
  Clock, 
  Wrench, 
  TrendingUp, 
  DollarSign 
} from 'lucide-react';

interface QuickStatsBannerProps {
  fleet: Vehicle[];
}

export const QuickStatsBanner: React.FC<QuickStatsBannerProps> = ({ fleet }) => {
  const total = fleet.length;
  const disponibles = fleet.filter(v => v.estado === 'DISPONIBLE').length;
  const alquilados = fleet.filter(v => v.estado === 'ALQUILADO').length;
  const enTaller = fleet.filter(v => v.estado === 'EN_MANTENIMIENTO' || v.estado === 'TALLER').length;
  
  const facturacionSugeridaTotal = fleet.reduce((acc, curr) => acc + (curr.precioSugerido || 0), 0);
  const costoTotalFlota = fleet.reduce((acc, curr) => acc + (curr.precioCosto || 0), 0);
  const margenPromedio = costoTotalFlota > 0 
    ? Math.round(((facturacionSugeridaTotal - costoTotalFlota) / facturacionSugeridaTotal) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Unidades */}
      <div className="bg-[#16191F] border border-[#2D2D2D] p-4 rounded-2xl hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400 uppercase font-black tracking-wider">Total Unidades</div>
          <Truck className="w-4 h-4 text-slate-500" />
        </div>
        <div className="text-2xl font-black mt-1 text-white font-display">{total}</div>
        <div className="mt-1 text-[11px] text-slate-500">Parque completo activo</div>
      </div>

      {/* En Alquiler */}
      <div className="bg-[#16191F] border border-[#2D2D2D] p-4 rounded-2xl hover:border-[#F0C800]/40 transition">
        <div className="flex items-center justify-between">
          <div className="text-xs text-[#F0C800] uppercase font-black tracking-wider">En Alquiler</div>
          <Clock className="w-4 h-4 text-[#F0C800]" />
        </div>
        <div className="text-2xl font-black mt-1 text-[#F0C800] font-display">{alquilados}</div>
        <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1 font-medium">
          <span>En obras y clientes</span>
          <span className="text-[#F0C800] font-black">({total > 0 ? Math.round((alquilados / total) * 100) : 0}%)</span>
        </div>
      </div>

      {/* Mantenimiento */}
      <div className="bg-[#16191F] border border-[#2D2D2D] p-4 rounded-2xl hover:border-red-500/40 transition">
        <div className="flex items-center justify-between">
          <div className="text-xs text-red-400 uppercase font-black tracking-wider">Mantenimiento</div>
          <Wrench className="w-4 h-4 text-red-500" />
        </div>
        <div className="text-2xl font-black mt-1 text-red-400 font-display">
          {String(enTaller).padStart(2, '0')}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">En revisión o taller</div>
      </div>

      {/* Disponibles */}
      <div className="bg-[#16191F] border border-[#2D2D2D] p-4 rounded-2xl hover:border-emerald-500/40 transition">
        <div className="flex items-center justify-between">
          <div className="text-xs text-emerald-400 uppercase font-black tracking-wider">Disponibles</div>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="text-2xl font-black mt-1 text-emerald-400 font-display">
          {String(disponibles).padStart(2, '0')}
        </div>
        <div className="mt-1 text-[11px] text-emerald-400/90 font-medium">Entrega inmediata</div>
      </div>
    </div>
  );
};
