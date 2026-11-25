import {
  ArcaInvoice,
  CommercialModuleScope,
  CustomerPaymentReceipt,
  HardwareCategory,
  HardwareProduct,
  Quotation,
  SalonFamilia,
  SalonPriceList,
  SalonVentasConfig,
} from '../types';
import { apiFetchSetting, apiSaveSettingStrict } from './api';

export const SALON_CONFIG_SETTING_KEY = 'salon_ventas_config';
const SALON_CONFIG_LOCAL_KEY = 'la_hormiga_salon_ventas_config_v1';

export const DEFAULT_SALON_CONFIG: SalonVentasConfig = {
  familias: [
    {
      id: 'fam-001',
      codigo: '001',
      nombre: 'Herramientas Manuales',
      grupos: [
        { id: 'grp-001-001', codigo: '001', nombre: 'Llaves, Pinzas y Alicates' },
        { id: 'grp-001-002', codigo: '002', nombre: 'Destornilladores y Puntas' },
        { id: 'grp-001-003', codigo: '003', nombre: 'Martillos, Palas y Mazas' },
        { id: 'grp-001-004', codigo: '004', nombre: 'Medición y Nivelación' },
      ],
    },
    {
      id: 'fam-002',
      codigo: '002',
      nombre: 'Herramientas Eléctricas',
      grupos: [
        { id: 'grp-002-001', codigo: '001', nombre: 'Amoladoras y Cortadoras' },
        { id: 'grp-002-002', codigo: '002', nombre: 'Taladros y Rotomartillos' },
        { id: 'grp-002-003', codigo: '003', nombre: 'Soldadoras y Compresores' },
      ],
    },
    {
      id: 'fam-003',
      codigo: '003',
      nombre: 'Bulonería y Fijaciones',
      grupos: [
        { id: 'grp-003-001', codigo: '001', nombre: 'Bulones y Tornillos' },
        { id: 'grp-003-002', codigo: '002', nombre: 'Tuercas y Arandelas' },
        { id: 'grp-003-003', codigo: '003', nombre: 'Tarugos, Brocas y Anclajes' },
      ],
    },
    {
      id: 'fam-004',
      codigo: '004',
      nombre: 'Abrasivos y Corte',
      grupos: [
        { id: 'grp-004-001', codigo: '001', nombre: 'Discos de Corte Metal / Hormigón' },
        { id: 'grp-004-002', codigo: '002', nombre: 'Discos Flap y Desbaste' },
        { id: 'grp-004-003', codigo: '003', nombre: 'Mechas y Sierras Copa' },
      ],
    },
    {
      id: 'fam-005',
      codigo: '005',
      nombre: 'Pinturas, Selladores y Químicos',
      grupos: [
        { id: 'grp-005-001', codigo: '001', nombre: 'Pinturas y Diluyentes' },
        { id: 'grp-005-002', codigo: '002', nombre: 'Siliconas y Adhesivos' },
        { id: 'grp-005-003', codigo: '003', nombre: 'Lubricantes y Aerosoles' },
      ],
    },
    {
      id: 'fam-006',
      codigo: '006',
      nombre: 'Electricidad y Plomería',
      grupos: [
        { id: 'grp-006-001', codigo: '001', nombre: 'Cables, Fichas y Térmicas' },
        { id: 'grp-006-002', codigo: '002', nombre: 'Caños, Codos y Accesorios' },
      ],
    },
  ],
  unidadesMedida: [
    {
      id: 'um-presentacion',
      nombre: 'Presentación / Envase',
      abreviatura: 'PRES',
      valores: [
        { id: 'val-uni', nombre: 'Unidad' },
        { id: 'val-blister', nombre: 'Blíster' },
        { id: 'val-caja10', nombre: 'Caja x 10' },
        { id: 'val-caja50', nombre: 'Caja x 50' },
        { id: 'val-caja100', nombre: 'Caja x 100' },
        { id: 'val-kit', nombre: 'Kit / Juego' },
      ],
    },
    {
      id: 'um-pulgadas',
      nombre: 'Medida / Pulgadas',
      abreviatura: 'PULG',
      valores: [
        { id: 'val-14', nombre: '1/4"' },
        { id: 'val-38', nombre: '3/8"' },
        { id: 'val-12', nombre: '1/2"' },
        { id: 'val-34', nombre: '3/4"' },
        { id: 'val-1', nombre: '1"' },
        { id: 'val-112', nombre: '1 1/2"' },
        { id: 'val-2', nombre: '2"' },
      ],
    },
    {
      id: 'um-diametro',
      nombre: 'Diámetro / Disco',
      abreviatura: 'DIAM',
      valores: [
        { id: 'val-115', nombre: '4.5" (115mm)' },
        { id: 'val-180', nombre: '7" (180mm)' },
        { id: 'val-230', nombre: '9" (230mm)' },
        { id: 'val-355', nombre: '14" (355mm)' },
      ],
    },
    {
      id: 'um-peso',
      nombre: 'Peso / Capacidad',
      abreviatura: 'PESO',
      valores: [
        { id: 'val-250g', nombre: '250 g' },
        { id: 'val-500g', nombre: '500 g' },
        { id: 'val-1kg', nombre: '1 Kg' },
        { id: 'val-5kg', nombre: '5 Kg' },
        { id: 'val-1l', nombre: '1 Litro' },
        { id: 'val-4l', nombre: '4 Litros' },
        { id: 'val-20l', nombre: '20 Litros' },
      ],
    },
    {
      id: 'um-acabado',
      nombre: 'Acabado / Material',
      abreviatura: 'MAT',
      valores: [
        { id: 'val-negro', nombre: 'Negro Pavonado' },
        { id: 'val-zincado', nombre: 'Zincado' },
        { id: 'val-inox', nombre: 'Acero Inoxidable' },
        { id: 'val-galv', nombre: 'Galvanizado' },
      ],
    },
  ],
  sectores: [
    {
      id: 'sec-salon',
      nombre: 'Salón Principal',
      subsectores: [
        { id: 'sub-g1', nombre: 'Góndola 1 - Herramientas Manuales' },
        { id: 'sub-g2', nombre: 'Góndola 2 - Herramientas Eléctricas' },
        { id: 'sub-g3', nombre: 'Góndola 3 - Abrasivos y Discos' },
        { id: 'sub-most', nombre: 'Mostrador / Exhibidor' },
      ],
    },
    {
      id: 'sec-buloneria',
      nombre: 'Sector Bulonería',
      subsectores: [
        { id: 'sub-caj-a', nombre: 'Cajonera A - Tornillos y Bulones' },
        { id: 'sub-caj-b', nombre: 'Cajonera B - Tuercas, Arandelas y Tarugos' },
      ],
    },
    {
      id: 'sec-deposito',
      nombre: 'Depósito Salón',
      subsectores: [
        { id: 'sub-est-1', nombre: 'Estantería 1 - Stock Cerrado' },
        { id: 'sub-est-2', nombre: 'Estantería 2 - Pinturas y Químicos' },
      ],
    },
  ],
  marcas: [
    'Bahco',
    'Bosch',
    'Bremen',
    'Bulit',
    'Crossmaster',
    'DeWalt',
    'Fischer',
    'Gherardi',
    'Makita',
    'Sika',
    'Stanley',
    'Tyrolit',
    '3M',
  ],
  listasPrecios: [
    {
      id: 'lista-publico',
      nombre: 'Lista Público (Mostrador)',
      margenPorcentaje: 45,
      activa: true,
      esPredeterminada: true,
    },
    {
      id: 'lista-contratista',
      nombre: 'Lista Contratista / Obra',
      margenPorcentaje: 30,
      activa: true,
    },
    {
      id: 'lista-mayorista',
      nombre: 'Lista Mayorista / Gremio',
      margenPorcentaje: 20,
      activa: true,
    },
  ],
};

export function loadSalonConfigLocal(): SalonVentasConfig {
  if (typeof window === 'undefined') return DEFAULT_SALON_CONFIG;
  try {
    const raw = window.localStorage.getItem(SALON_CONFIG_LOCAL_KEY);
    if (!raw) return DEFAULT_SALON_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SalonVentasConfig>;
    return normalizeSalonConfig(parsed);
  } catch {
    return DEFAULT_SALON_CONFIG;
  }
}

export function normalizeSalonConfig(raw?: Partial<SalonVentasConfig> | null): SalonVentasConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_SALON_CONFIG;
  return {
    familias: Array.isArray(raw.familias) && raw.familias.length > 0 ? raw.familias : DEFAULT_SALON_CONFIG.familias,
    unidadesMedida:
      Array.isArray(raw.unidadesMedida) && raw.unidadesMedida.length > 0
        ? raw.unidadesMedida
        : DEFAULT_SALON_CONFIG.unidadesMedida,
    sectores: Array.isArray(raw.sectores) && raw.sectores.length > 0 ? raw.sectores : DEFAULT_SALON_CONFIG.sectores,
    marcas: Array.isArray(raw.marcas) ? raw.marcas : DEFAULT_SALON_CONFIG.marcas,
    listasPrecios:
      Array.isArray(raw.listasPrecios) && raw.listasPrecios.length > 0
        ? raw.listasPrecios
        : DEFAULT_SALON_CONFIG.listasPrecios,
  };
}

export async function fetchSalonConfigFromCloud(): Promise<SalonVentasConfig> {
  const remote = await apiFetchSetting<SalonVentasConfig>(SALON_CONFIG_SETTING_KEY);
  if (remote && typeof remote === 'object' && Array.isArray((remote as any).familias)) {
    const normalized = normalizeSalonConfig(remote);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SALON_CONFIG_LOCAL_KEY, JSON.stringify(normalized));
      } catch {}
    }
    return normalized;
  }
  return loadSalonConfigLocal();
}

export async function saveSalonConfig(
  config: SalonVentasConfig
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SALON_CONFIG_LOCAL_KEY, JSON.stringify(config));
    } catch {}
  }
  return await apiSaveSettingStrict(SALON_CONFIG_SETTING_KEY, config);
}

/** Pad numeric code cleanly */
export function padCode(num: number | string, digits: number): string {
  const clean = String(num).replace(/\D/g, '');
  const n = clean ? parseInt(clean, 10) : 0;
  return String(Math.max(0, n)).padStart(digits, '0').slice(-digits);
}

/** Get next 3-digit family code */
export function getNextFamiliaCode(familias: SalonFamilia[]): string {
  let max = 0;
  familias.forEach(f => {
    const n = parseInt(String(f.codigo || '0').replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return padCode(max + 1, 3);
}

/** Get next 3-digit group code inside a family */
export function getNextGrupoCode(familia?: SalonFamilia | null): string {
  if (!familia) return '001';
  let max = 0;
  (familia.grupos || []).forEach(g => {
    const n = parseInt(String(g.codigo || '0').replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return padCode(max + 1, 3);
}

/**
 * Generates the next sequential 11-digit base code:
 * 3 digits Familia + 3 digits Grupo + 5 digits Product correlative
 * Example: 00100200001
 */
export function generateNextBaseProductCode(
  familiaCodigo: string,
  grupoCodigo: string,
  existingProducts: HardwareProduct[]
): string {
  const fam = padCode(familiaCodigo || '001', 3);
  const grp = padCode(grupoCodigo || '001', 3);
  const prefix = `${fam}${grp}`;

  let maxSeq = 0;
  existingProducts.forEach(p => {
    const candidate = (p.codigoBase || p.codigo || '').split('-')[0].replace(/\D/g, '');
    if (candidate.startsWith(prefix) && candidate.length >= 11) {
      const seqPart = parseInt(candidate.slice(6, 11), 10);
      if (!isNaN(seqPart) && seqPart > maxSeq) {
        maxSeq = seqPart;
      }
    }
  });

  return `${prefix}${padCode(maxSeq + 1, 5)}`;
}

/** Map a family name silently to legacy HardwareCategory for PublicWebsite compatibility */
export function deriveLegacyCategory(familiaNombre?: string): HardwareCategory {
  const text = (familiaNombre || '').toLowerCase();
  if (text.includes('eléctric') || text.includes('electric') || text.includes('taladro') || text.includes('amoladora')) {
    if (text.includes('cable') || text.includes('ilumin') || text.includes('plomer')) {
      return 'ELECTRICIDAD_ILUMINACION';
    }
    return 'HERRAMIENTAS_ELECTRICAS';
  }
  if (text.includes('bulon') || text.includes('fijac') || text.includes('tornill')) return 'BULONERIA_FIJACIONES';
  if (text.includes('abrasiv') || text.includes('disco') || text.includes('corte')) return 'DISCOS_ABRASIVOS';
  if (text.includes('pintur') || text.includes('químic') || text.includes('quimic') || text.includes('sellador')) {
    return 'PINTURAS_QUIMICOS';
  }
  if (text.includes('plomer') || text.includes('cañ')) return 'PLOMERIA_ACCESORIOS';
  if (text.includes('construc') || text.includes('pala')) return 'CONSTRUCCION_PALAS';
  if (text.includes('segur') || text.includes('epp')) return 'SEGURIDAD_EPP';
  return 'HERRAMIENTAS_MANO';
}

/** Calculate prices across all configured price lists from the single Costo Unitario / Precio Base */
export function calculatePricesFromCost(
  costoUnitario: number,
  listasPrecios: SalonPriceList[]
): {
  precioVenta: number;
  preciosPorLista: Record<string, number>;
  listasDePrecios: { lista1: number; lista2: number; lista3: number; margenPorcentaje: number };
} {
  const cost = Math.max(0, Number(costoUnitario) || 0);
  const activeLists = listasPrecios.filter(l => l.activa !== false);
  const effectiveLists = activeLists.length > 0 ? activeLists : DEFAULT_SALON_CONFIG.listasPrecios;

  const preciosPorLista: Record<string, number> = {};
  effectiveLists.forEach(list => {
    const pct = Number(list.margenPorcentaje) || 0;
    preciosPorLista[list.id] = Math.round(cost * (1 + pct / 100) * 100) / 100;
  });

  const defaultList = effectiveLists.find(l => l.esPredeterminada) || effectiveLists[0];
  const precioVenta = defaultList ? preciosPorLista[defaultList.id] : cost;

  const l1 = effectiveLists[0] ? preciosPorLista[effectiveLists[0].id] : precioVenta;
  const l2 = effectiveLists[1] ? preciosPorLista[effectiveLists[1].id] : precioVenta;
  const l3 = effectiveLists[2] ? preciosPorLista[effectiveLists[2].id] : precioVenta;

  return {
    precioVenta,
    preciosPorLista,
    listasDePrecios: {
      lista1: l1,
      lista2: l2,
      lista3: l3,
      margenPorcentaje: defaultList?.margenPorcentaje ?? 0,
    },
  };
}

/**
 * Resolves which commercial module owns a Quotation.
 * Legacy records without `origenModulo` default to `'ALQUILERES'`.
 */
export function resolveQuotationModule(q: Pick<Quotation, 'origenModulo'>): CommercialModuleScope {
  return q.origenModulo === 'VENTAS_SALON' ? 'VENTAS_SALON' : 'ALQUILERES';
}

/**
 * Resolves which commercial module owns an ARCA Invoice.
 * Respects explicit `origenModulo`, falls back to `vinculadoTipo === 'FERRETERIA'`,
 * and defaults legacy records to `'ALQUILERES'`.
 */
export function resolveInvoiceModule(
  inv: Pick<ArcaInvoice, 'origenModulo' | 'vinculadoTipo'>
): CommercialModuleScope {
  if (inv.origenModulo === 'VENTAS_SALON' || inv.origenModulo === 'ALQUILERES') {
    return inv.origenModulo;
  }
  if (inv.vinculadoTipo === 'FERRETERIA') {
    return 'VENTAS_SALON';
  }
  return 'ALQUILERES';
}

/**
 * Resolves which commercial module owns a CustomerPaymentReceipt.
 * Respects explicit `origenModulo`, falls back to linked invoice's module,
 * and defaults legacy records to `'ALQUILERES'`.
 */
export function resolveReceiptModule(
  rec: Pick<CustomerPaymentReceipt, 'origenModulo' | 'facturasIds'>,
  invoicesById?: Map<string, Pick<ArcaInvoice, 'origenModulo' | 'vinculadoTipo'>>
): CommercialModuleScope {
  if (rec.origenModulo === 'VENTAS_SALON' || rec.origenModulo === 'ALQUILERES') {
    return rec.origenModulo;
  }
  if (invoicesById && Array.isArray(rec.facturasIds)) {
    for (const invId of rec.facturasIds) {
      const matched = invoicesById.get(invId);
      if (matched) return resolveInvoiceModule(matched);
    }
  }
  return 'ALQUILERES';
}

