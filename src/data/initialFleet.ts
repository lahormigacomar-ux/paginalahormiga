import { Vehicle, ColumnDefinition } from "../types";

export const INITIAL_COLUMNS: ColumnDefinition[] = [
  { key: "id", label: "ID", description: "Identificador único del registro", defaultVisible: true },
  { key: "modeloMarca", label: "MODELO / MARCA", description: "Marca y modelo comercial de la máquina o equipo", defaultVisible: true },
  { key: "patente", label: "PATENTE / IDENTIF.", description: "Dominio, chapa patente o código del equipo", defaultVisible: true },
  { key: "codigoInterno", label: "CÓDIGO INTERNO", description: "Código de inventario o seguimiento interno", defaultVisible: true },
  { key: "fotografia", label: "FOTOGRAFÍA", description: "Miniatura y visualización de la unidad", defaultVisible: true },
  { key: "precioCosto", label: "PRECIO COSTO", description: "Costo operativo / amortización por día u hora", defaultVisible: true },
  { key: "precioSugerido", label: "PRECIO SUGERIDO", description: "Tarifa comercial sugerida al cliente", defaultVisible: true },
  { key: "clasificacion", label: "CLASIFICACIÓN", description: "Tipo o familia de maquinaria", defaultVisible: true },
  { key: "estado", label: "ESTADO", description: "Estado operativo actual del equipo", defaultVisible: true },
];

export const INITIAL_FLEET: Vehicle[] = [];

export const PRESET_MACHINERY_IMAGES = [
  { name: "Retroexcavadora", url: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80" },
  { name: "Minicargadora", url: "https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=800&q=80" },
  { name: "Camión Volcador", url: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=800&q=80" },
  { name: "Pala Cargadora", url: "https://images.unsplash.com/photo-1508873696983-2df515122519?auto=format&fit=crop&w=800&q=80" },
  { name: "Autoelevador", url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80" },
  { name: "Rodillo Compactador", url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80" },
  { name: "Grupo Electrógeno", url: "https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80" },
  { name: "Excavadora", url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80" },
  { name: "Camión Grúa", url: "https://images.unsplash.com/photo-1586191582118-2750e32669e0?auto=format&fit=crop&w=800&q=80" },
  { name: "Herramienta Menor", url: "https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80" }
];
