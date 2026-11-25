import { VehicleClassification, EquipmentCategory } from '../types';

export const SIMPLIFIED_CLASSIFICATIONS: VehicleClassification[] = [
  'Herramientas Eléctricas',
  'Vehículos / Camionetas',
  'Camiones',
  'Acoplados / Carretones',
  'Máquinas',
  'Equipamiento Gastronómico',
  'Vehículos de Terceros',
];

/**
 * Normaliza cualquier clasificación previa o texto libre a una de las 6 clasificaciones oficiales
 */
export function normalizeEquipmentClassification(raw?: string, modelo?: string): VehicleClassification {
  if (!raw && !modelo) return 'Máquinas';

  const text = `${raw || ''} ${modelo || ''}`.toLowerCase().trim();

  // 1. Chequeo exacto si ya es una de las 7 clasificaciones
  const exact = SIMPLIFIED_CLASSIFICATIONS.find(c => c.toLowerCase() === (raw || '').toLowerCase().trim());
  if (exact) return exact;

  // 1.1 Vehículos de Terceros / Subcontratados / Fleteros
  if (
    text.includes('tercero') ||
    text.includes('terceros') ||
    text.includes('subcontrat') ||
    text.includes('fletero') ||
    text.includes('tercerizado') ||
    text.includes('terceriz') ||
    text.includes('externo')
  ) {
    return 'Vehículos de Terceros';
  }

  // 2. Acoplados / Carretones / Batanes / Semis
  if (
    text.includes('acoplado') ||
    text.includes('carreton') ||
    text.includes('carretón') ||
    text.includes('semi') ||
    text.includes('batan') ||
    text.includes('batán') ||
    text.includes('trailer') ||
    text.includes('tráiler') ||
    text.includes('batea')
  ) {
    return 'Acoplados / Carretones';
  }

  // 3. Camiones (Volcadores, Chasis, Grúas)
  if (
    text.includes('camión') ||
    text.includes('camion') ||
    text.includes('volcador') ||
    text.includes('chasis') ||
    text.includes('grúa') ||
    text.includes('grua') ||
    text.includes('iveco') ||
    text.includes('mercedes') ||
    text.includes('cargo')
  ) {
    return 'Camiones';
  }

  // 4. Vehículos / Camionetas (Pickups, Autos, Utilitarios)
  if (
    text.includes('camioneta') ||
    text.includes('vehiculo') ||
    text.includes('vehículo') ||
    text.includes('hilux') ||
    text.includes('ranger') ||
    text.includes('amarok') ||
    text.includes('fiorino') ||
    text.includes('clio') ||
    text.includes('gol') ||
    text.includes('suran') ||
    text.includes('f-100') ||
    text.includes('pickup') ||
    text.includes('pick-up') ||
    text.includes('auto') ||
    text.includes('utilitario') ||
    text.includes('currier') ||
    text.includes('courier') ||
    text.includes('megane') ||
    text.includes('logan') ||
    text.includes('twingo') ||
    text.includes('cruze') ||
    text.includes('fiesta') ||
    text.includes('isuzu') ||
    text.includes('izuzu') ||
    text.includes('nissan') ||
    text.includes('trafic') ||
    text.includes('jeep') ||
    text.includes('land rover') ||
    text.includes('volkswagen') ||
    text.includes('chevrolet') ||
    text.includes('moto')
  ) {
    return 'Vehículos / Camionetas';
  }

  // 5. Equipamiento Gastronómico
  if (
    text.includes('gastronom') ||
    text.includes('freezer') ||
    text.includes('heladera') ||
    text.includes('horno') ||
    text.includes('pizzero') ||
    text.includes('panchera') ||
    text.includes('frío') ||
    text.includes('frio') ||
    text.includes('convector')
  ) {
    return 'Equipamiento Gastronómico';
  }

  // 6. Herramientas Eléctricas & Menores
  if (
    text.includes('rotomartillo') ||
    text.includes('demoledor') ||
    text.includes('trompito') ||
    text.includes('hormigonera') ||
    text.includes('chancha') ||
    text.includes('vibrocompactador') ||
    text.includes('vibrador') ||
    text.includes('grupo electrógeno') ||
    text.includes('electrógeno') ||
    text.includes('electrogeno') ||
    text.includes('generador') ||
    text.includes('compresor') ||
    text.includes('amoladora') ||
    text.includes('soldadora') ||
    text.includes('herramienta') ||
    text.includes('eléctrica') ||
    text.includes('electrica') ||
    text.includes('fusora') ||
    text.includes('holladora')
  ) {
    return 'Herramientas Eléctricas';
  }

  // 7. Máquinas (Vial, Pesada, Movimiento de Suelos)
  if (
    text.includes('minicargadora') ||
    text.includes('retroexcavadora') ||
    text.includes('excavadora') ||
    text.includes('pala') ||
    text.includes('rodillo') ||
    text.includes('compactador') ||
    text.includes('autoelevador') ||
    text.includes('clark') ||
    text.includes('manipulador') ||
    text.includes('telescópico') ||
    text.includes('telescopico') ||
    text.includes('plataforma') ||
    text.includes('motoniveladora') ||
    text.includes('oruga') ||
    text.includes('vial') ||
    text.includes('maquina') ||
    text.includes('máquina') ||
    text.includes('bobcat') ||
    text.includes('caterpillar') ||
    text.includes('cat') ||
    text.includes('komatsu') ||
    text.includes('new holland') ||
    text.includes('case') ||
    text.includes('deutz') ||
    text.includes('liugong') ||
    text.includes('sany') ||
    text.includes('xcmg')
  ) {
    return 'Máquinas';
  }

  return 'Máquinas';
}

/**
 * Obtiene la categoría macro (EquipmentCategory) a partir de la clasificación simplificada
 */
export function getCategoryFromClassification(clasif: VehicleClassification): EquipmentCategory {
  switch (clasif) {
    case 'Herramientas Eléctricas':
      return 'HERRAMIENTA_MENOR';
    case 'Vehículos / Camionetas':
    case 'Camiones':
    case 'Acoplados / Carretones':
      return 'TRANSPORTE';
    case 'Equipamiento Gastronómico':
      return 'EVENTOS_GASTRONOMIA';
    case 'Vehículos de Terceros':
      return 'VEHICULOS_TERCEROS';
    case 'Máquinas':
    default:
      return 'VIAL_PESADA';
  }
}
