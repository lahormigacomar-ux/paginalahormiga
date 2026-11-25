import type { DispatchBoardPlace, DispatchBoardState } from '../types';

export const DEFAULT_DISPATCH_PLACES: DispatchBoardPlace[] = [
  {
    id: 'place-base-central',
    nombre: 'Base Central / Playón',
    tipo: 'BASE',
    ubicacion: 'Predio Principal',
    color: 'slate',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'place-taller',
    nombre: 'Taller / Mantenimiento',
    tipo: 'TALLER',
    ubicacion: 'Box de Reparaciones',
    color: 'cyan',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'place-deposito',
    nombre: 'Depósito / Galpón',
    tipo: 'DEPOSITO',
    ubicacion: 'Depósito Operativo',
    color: 'emerald',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export function createInitialDispatchBoardState(): DispatchBoardState {
  return {
    places: [...DEFAULT_DISPATCH_PLACES],
    assignments: [],
    dailySegments: [],
    history: [],
    hiddenObraIds: [],
    hiddenEmployeeIds: [],
    hiddenVehicleIds: [],
    updatedAt: new Date().toISOString(),
  };
}
