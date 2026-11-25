import { Employee } from '../types';

/**
 * Nómina oficial del sistema La Hormiga:
 * 100% gobernada por la Base de Datos (Supabase PostgreSQL).
 * Se eliminaron todos los registros mock o de demostración iniciales.
 * Si un empleado no está registrado en la base de datos, no se muestra.
 */
export const INITIAL_EMPLOYEES: Employee[] = [];
export const INITIAL_DRIVERS: Employee[] = [];

export const EMPLOYEE_CATEGORIES = [
  'Oficial Maquinista Especializado',
  'Chofer de Primera (Pesados / Batea)',
  'Operador de Grúa Telescópica',
  'Maquinista Minicargadora & Vial',
  'Oficial Mecánico de Taller',
  'Capataz / Supervisor de Obra',
  'Operador de Autoelevador / Clark',
  'Operador de Retroexcavadora',
  'Operador de Excavadora de Orugas',
  'Operador de Pala Cargadora',
  'Ayudante / Operario General',
  'Técnico Electricista / Hidráulico'
];

export const EMPLOYEE_SECTORS = [
  'Movimiento de Suelos',
  'Operaciones & Flota',
  'Operaciones & Izaje',
  'Logística & Transporte',
  'Mantenimiento & Taller',
  'Obras Civiles & Viales',
  'Servicios & Auxilio',
  'Administración & Despacho'
];

export const EMPLOYEE_OBRAS = [
  'Autopista Pte. Perón - Tramo II',
  'Parque Industrial Pilar',
  'Base Central Tigre (Taller/Base)',
  'Barrio Cerrado Santa María - Nordelta',
  'Corredor Logístico Zárate',
  'Ampliación Ruta Provincial 6',
  'Obra Hidráulica Cuenca Luján',
  'Sin Asignar / Disponible'
];

export const EMPLOYEE_AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80',
];
