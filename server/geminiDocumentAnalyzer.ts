import { GoogleGenAI, Type, Schema } from '@google/genai';

export type AnalyzableDocumentType =
  | 'PARTE_DIARIO'
  | 'COMBUSTIBLE'
  | 'VALE_COMBUSTIBLE'
  | 'FACTURA'
  | 'REMITO';

export interface AnalyzeContextCatalog {
  vehicles?: Array<{ codigo?: string; modeloMarca?: string; patente?: string }>;
  drivers?: Array<{ codigo?: string; legajo?: string; nombreApellido?: string }>;
  obras?: Array<{ codigo?: string; nombreObra?: string; ubicacion?: string }>;
  proveedores?: Array<{ id?: string; razonSocial?: string; cuit?: string }>;
  deposits?: Array<{ id?: string; nombre?: string; empresaBandera?: string; numEstacion?: string }>;
}

export interface AnalyzeDocumentRequest {
  documentType: AnalyzableDocumentType;
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  context?: AnalyzeContextCatalog;
}

const PARTE_DIARIO_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    fecha: { type: Type.STRING, description: 'Fecha del parte en formato YYYY-MM-DD' },
    numParte: { type: Type.STRING, description: 'Número del parte diario tal como figura en el comprobante' },
    codigoEquipo: { type: Type.STRING, description: 'Código interno o patente del equipo/máquina si coincide con el catálogo o figura en el papel' },
    marcaModelo: { type: Type.STRING, description: 'Nombre, marca o modelo de la máquina o vehículo' },
    nombreApellido: { type: Type.STRING, description: 'Nombre completo del operario o chofer' },
    codigoEmpleado: { type: Type.STRING, description: 'Código o legajo del empleado si está en el catálogo' },
    obra: { type: Type.STRING, description: 'Nombre de la obra, cliente o frente de trabajo' },
    codigoObra: { type: Type.STRING, description: 'Código de obra si figura o coincide con el catálogo' },
    ubicacion: { type: Type.STRING, description: 'Ubicación o lugar de trabajo' },
    horaInicioMañana: { type: Type.STRING, description: 'Hora inicio turno mañana en formato HH:MM (ej: 08:00), vacío si no aplica' },
    horaFinMañana: { type: Type.STRING, description: 'Hora fin turno mañana en formato HH:MM (ej: 12:00), vacío si no aplica' },
    horaInicioTarde: { type: Type.STRING, description: 'Hora inicio turno tarde en formato HH:MM (ej: 13:00), vacío si no aplica' },
    horaFinTarde: { type: Type.STRING, description: 'Hora fin turno tarde en formato HH:MM (ej: 17:00), vacío si no aplica' },
    hsCantidad: { type: Type.NUMBER, description: 'Cantidad total de horas trabajadas si figura explicitada' },
    odomKilom: { type: Type.NUMBER, description: 'Lectura de horómetro o kilometraje/odómetro final' },
    servMant: { type: Type.STRING, description: 'ALQUILER, TRASLADO DE MAQUINA, MANTENIMIENTO, o OTRO' },
    tipo: { type: Type.STRING, description: 'Modalidad principal: HORAS, VIAJES, DIA, TRABAJO, o OTRO' },
    detalleTipo: { type: Type.STRING, description: 'Descripción de la tarea o trabajo realizado' },
    viajesCantidad: { type: Type.NUMBER, description: 'Cantidad de viajes si modalidad es VIAJES' },
    tipoMaterial: { type: Type.STRING, description: 'Tipo de árido o material transportado (ej: Ripio Común, Arena, Tierra)' },
    m3PorViaje: { type: Type.NUMBER, description: 'Metros cúbicos por viaje si figura' },
    cantidadDias: { type: Type.NUMBER, description: 'Cantidad de días si modalidad es DIA' },
    encargadoObra: { type: Type.STRING, description: 'Nombre del encargado o supervisor de obra que autoriza/firma' },
    firma: { type: Type.STRING, description: 'Firmado si tiene firma manuscrita visible, o No firmado si está sin firmar' },
    novedades: { type: Type.STRING, description: 'Observaciones, novedades mecánicas o aclaraciones escritas en el parte' },
  },
};

const COMBUSTIBLE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    fecha: { type: Type.STRING, description: 'Fecha del ticket de combustible en formato YYYY-MM-DD' },
    hora: { type: Type.STRING, description: 'Hora del ticket en formato HH:MM' },
    deposito: { type: Type.STRING, description: 'Nombre de la estación de servicio (ej: YPF, Shell, Axion) o depósito' },
    numEstacion: { type: Type.STRING, description: 'Número o código de estación de servicio si figura' },
    numTicket: { type: Type.STRING, description: 'Número de ticket, despacho o comprobante fiscal de surtidor' },
    numVale: { type: Type.STRING, description: 'Número de vale o autorización si figura en el ticket' },
    numOrden: { type: Type.STRING, description: 'Número de orden o referencia si figura' },
    tipoComb: { type: Type.STRING, description: 'Normalizado a uno de: DIESEL COMUN, DIESEL INFINIA, NAFTA SUPER, NAFTA INFINIA' },
    cantidad: { type: Type.NUMBER, description: 'Cantidad de litros cargados (ej: 120.5)' },
    precioUnitario: { type: Type.NUMBER, description: 'Precio por litro en pesos' },
    totalImporte: { type: Type.NUMBER, description: 'Importe total del ticket en pesos' },
    codigoEquipo: { type: Type.STRING, description: 'Código interno del equipo o vehículo coincidente' },
    marcaModelo: { type: Type.STRING, description: 'Marca/modelo del vehículo o maquinaria' },
    patente: { type: Type.STRING, description: 'Patente o dominio si figura' },
    nombreApellido: { type: Type.STRING, description: 'Nombre del chofer o conductor si figura' },
    codigoEmpleado: { type: Type.STRING, description: 'Código o legajo del chofer si coincide' },
    kilometraje: { type: Type.NUMBER, description: 'Kilometraje u horómetro anotado en el ticket' },
    carga: { type: Type.STRING, description: 'Completa (Tanque Lleno) o Carga Parcial' },
    observaciones: { type: Type.STRING, description: 'Notas adicionales legibles en el ticket (CUIT estación, domicilio, etc.)' },
  },
};

const VALE_COMBUSTIBLE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    numVale: { type: Type.STRING, description: 'Número impreso o manuscrito del vale de combustible' },
    numComprobante: { type: Type.STRING, description: 'Número de talonario o comprobante auxiliar si existe' },
    fechaEmision: { type: Type.STRING, description: 'Fecha de emisión del vale en formato YYYY-MM-DD' },
    horaEmision: { type: Type.STRING, description: 'Hora de emisión en formato HH:MM' },
    estacionSurtidor: { type: Type.STRING, description: 'Estación de servicio destinataria del vale' },
    numEstacion: { type: Type.STRING, description: 'Código o número de estación' },
    tipoComb: { type: Type.STRING, description: 'Normalizado a: DIESEL COMUN, DIESEL INFINIA, NAFTA SUPER, NAFTA INFINIA' },
    litrosAutorizados: { type: Type.NUMBER, description: 'Litros autorizados en el vale (si dice tanque lleno dejar 0 o estimado si indica)' },
    tipoCarga: { type: Type.STRING, description: 'Completa (Tanque Lleno) o Carga Parcial' },
    codigoEquipo: { type: Type.STRING, description: 'Código interno del equipo autorizado' },
    marcaModelo: { type: Type.STRING, description: 'Marca/modelo de la máquina o camioneta' },
    patente: { type: Type.STRING, description: 'Patente del vehículo' },
    nombreApellido: { type: Type.STRING, description: 'Chofer o persona autorizada a retirar combustible' },
    codigoEmpleado: { type: Type.STRING, description: 'Código de empleado si coincide con catálogo' },
    legajo: { type: Type.STRING, description: 'Legajo o DNI del chofer si figura' },
    odometroSalida: { type: Type.NUMBER, description: 'Odómetro u horómetro anotado en el vale' },
    observaciones: { type: Type.STRING, description: 'Observaciones, obra o firma autorizante en el vale' },
  },
};

const FACTURA_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    sugerenciaNaturaleza: { type: Type.STRING, description: 'VENTA si el emisor es El Hornocal SRL / La Hormiga (CUIT 30-71499982-2 o similar), COMPRA si es factura recibida de un proveedor' },
    tipoComprobante: { type: Type.STRING, description: 'Uno de: FACTURA_A, FACTURA_B, FACTURA_C, FACTURA_X, NOTA_CREDITO_A, NOTA_CREDITO_B, NOTA_CREDITO_C' },
    puntoVenta: { type: Type.NUMBER, description: 'Punto de venta numérico (ej: 5, 7, 19)' },
    numeroComprobante: { type: Type.NUMBER, description: 'Número de comprobante numérico sin ceros iniciales' },
    fecha: { type: Type.STRING, description: 'Fecha de emisión en formato YYYY-MM-DD' },
    fechaVencimiento: { type: Type.STRING, description: 'Fecha de vencimiento de pago en formato YYYY-MM-DD si figura' },
    cuitEmisor: { type: Type.STRING, description: 'CUIT del emisor de la factura' },
    razonSocialEmisor: { type: Type.STRING, description: 'Razón social o nombre comercial del emisor' },
    condicionIvaEmisor: { type: Type.STRING, description: 'RESPONSABLE_INSCRIPTO, MONOTRIBUTO, EXENTO o CONSUMIDOR_FINAL' },
    tipoDocReceptor: { type: Type.STRING, description: 'CUIT, DNI o CONSUMIDOR_FINAL' },
    nroDocReceptor: { type: Type.STRING, description: 'CUIT o DNI del receptor/cliente' },
    razonSocialReceptor: { type: Type.STRING, description: 'Nombre o Razón Social del receptor/cliente' },
    condicionIvaReceptor: { type: Type.STRING, description: 'RESPONSABLE_INSCRIPTO, MONOTRIBUTO, EXENTO o CONSUMIDOR_FINAL' },
    domicilioReceptor: { type: Type.STRING, description: 'Domicilio del receptor' },
    condicionVenta: { type: Type.STRING, description: 'Contado, Cuenta Corriente, Transferencia, etc.' },
    remitoPedido: { type: Type.STRING, description: 'Número de remito/orden/contrato asociado si figura' },
    moneda: { type: Type.STRING, description: 'ARS o USD' },
    cae: { type: Type.STRING, description: 'Número de CAE de 14 dígitos si figura' },
    vencimientoCae: { type: Type.STRING, description: 'Fecha vencimiento CAE en YYYY-MM-DD si figura' },
    netoGravado: { type: Type.NUMBER, description: 'Subtotal neto gravado antes de IVA e impuestos' },
    ivaTotal: { type: Type.NUMBER, description: 'Total de IVA discriminado' },
    percepcionIibb: { type: Type.NUMBER, description: 'Percepciones de Ingresos Brutos (IIBB) si hay' },
    percepcionIva: { type: Type.NUMBER, description: 'Percepciones de IVA si hay' },
    impuestoIcl: { type: Type.NUMBER, description: 'Impuesto combustibles líquidos (ICL) si aplica' },
    impuestoIdc: { type: Type.NUMBER, description: 'Impuesto dióxido de carbono (IDC) si aplica' },
    tasaVial: { type: Type.NUMBER, description: 'Tasa vial municipal/provincial si aplica' },
    otrosImpuestos: { type: Type.NUMBER, description: 'Otros tributos / impuestos internos no incluidos arriba' },
    importeTotal: { type: Type.NUMBER, description: 'Importe total final de la factura' },
    observaciones: { type: Type.STRING, description: 'Notas relevantes detectadas en el comprobante' },
    items: {
      type: Type.ARRAY,
      description: 'Líneas o ítems de detalle facturados',
      items: {
        type: Type.OBJECT,
        properties: {
          codigo: { type: Type.STRING },
          descripcion: { type: Type.STRING },
          cantidad: { type: Type.NUMBER },
          unidadMedida: { type: Type.STRING },
          precioUnitario: { type: Type.NUMBER },
          alicuotaIva: { type: Type.NUMBER, description: 'Porcentaje de IVA: 21, 10.5, 27 o 0' },
          subtotal: { type: Type.NUMBER },
        },
      },
    },
  },
};

const REMITO_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    fecha: { type: Type.STRING, description: 'Fecha del remito en formato YYYY-MM-DD' },
    letra: { type: Type.STRING, description: 'Letra R o X' },
    puntoVenta: { type: Type.NUMBER, description: 'Punto de venta numérico' },
    numeroComprobante: { type: Type.NUMBER, description: 'Número de remito numérico' },
    cai: { type: Type.STRING, description: 'Número de CAI si figura en el pie' },
    vencimientoCai: { type: Type.STRING, description: 'Vencimiento del CAI YYYY-MM-DD si figura' },
    cuitEmisor: { type: Type.STRING, description: 'CUIT de quien emite el remito' },
    razonSocialEmisor: { type: Type.STRING, description: 'Razón social emisora' },
    tipoDocReceptor: { type: Type.STRING, description: 'CUIT, DNI o CONSUMIDOR_FINAL' },
    nroDocReceptor: { type: Type.STRING, description: 'CUIT o DNI del destinatario' },
    razonSocialReceptor: { type: Type.STRING, description: 'Nombre o razón social del destinatario/cliente' },
    condicionIvaReceptor: { type: Type.STRING, description: 'RESPONSABLE_INSCRIPTO, MONOTRIBUTO, EXENTO o CONSUMIDOR_FINAL' },
    domicilioReceptor: { type: Type.STRING, description: 'Domicilio del destinatario' },
    localidadReceptor: { type: Type.STRING, description: 'Localidad/ciudad del destinatario' },
    obraDestino: { type: Type.STRING, description: 'Nombre de la obra o lugar de destino' },
    lugarEntrega: { type: Type.STRING, description: 'Dirección exacta de entrega' },
    motivoTraslado: { type: Type.STRING, description: 'Uno de: ALQUILER_MAQUINARIA_OBRA, TRASLADO_SERVICIO_VIAL, RETIRO_DEVOLUCION_EQUIPO, ENTREGA_ARIDOS_MATERIALES, TRASLADO_INTERNO_TALLER' },
    origenTraslado: { type: Type.STRING, description: 'Dirección o base de origen' },
    transportistaNombre: { type: Type.STRING, description: 'Empresa transportista si figura' },
    transportistaCuit: { type: Type.STRING, description: 'CUIT transportista si figura' },
    choferNombre: { type: Type.STRING, description: 'Nombre del chofer o conductor' },
    choferDni: { type: Type.STRING, description: 'DNI del chofer si figura' },
    vehiculoTransporte: { type: Type.STRING, description: 'Camión o carretón de transporte' },
    patenteChasis: { type: Type.STRING, description: 'Dominio/patente chasis' },
    patenteAcoplado: { type: Type.STRING, description: 'Dominio/patente acoplado o carretón' },
    comprobanteAsociadoTexto: { type: Type.STRING, description: 'Orden de compra, contrato o factura vinculada si figura' },
    observaciones: { type: Type.STRING, description: 'Observaciones, firma de conformidad o notas del remito' },
    items: {
      type: Type.ARRAY,
      description: 'Detalle de bienes, áridos, materiales o maquinarias trasladadas',
      items: {
        type: Type.OBJECT,
        properties: {
          codigo: { type: Type.STRING },
          descripcion: { type: Type.STRING },
          cantidad: { type: Type.NUMBER },
          unidadMedida: { type: Type.STRING, description: 'UNI, M3, KG, HS, DIAS, VIAJES, LTS' },
          detalleSerieOrInterno: { type: Type.STRING },
        },
      },
    },
  },
};

function getSchemaForType(docType: AnalyzableDocumentType): Schema {
  switch (docType) {
    case 'PARTE_DIARIO':
      return PARTE_DIARIO_SCHEMA;
    case 'COMBUSTIBLE':
      return COMBUSTIBLE_SCHEMA;
    case 'VALE_COMBUSTIBLE':
      return VALE_COMBUSTIBLE_SCHEMA;
    case 'FACTURA':
      return FACTURA_SCHEMA;
    case 'REMITO':
      return REMITO_SCHEMA;
  }
}

function buildSystemInstruction(docType: AnalyzableDocumentType, context?: AnalyzeContextCatalog): string {
  const vehiclesHint = (context?.vehicles || [])
    .slice(0, 80)
    .map(v => `${v.codigo || ''} | ${v.modeloMarca || ''} | ${v.patente || ''}`.trim())
    .join('\n');

  const driversHint = (context?.drivers || [])
    .slice(0, 90)
    .map(d => `${d.codigo || d.legajo || ''} | ${d.nombreApellido || ''}`.trim())
    .join('\n');

  const obrasHint = (context?.obras || [])
    .slice(0, 70)
    .map(o => `${o.codigo || ''} | ${o.nombreObra || ''} | ${o.ubicacion || ''}`.trim())
    .join('\n');

  const proveedoresHint = (context?.proveedores || [])
    .slice(0, 70)
    .map(p => `${p.cuit || ''} | ${p.razonSocial || ''}`.trim())
    .join('\n');

  const depositsHint = (context?.deposits || [])
    .slice(0, 40)
    .map(d => `${d.nombre || ''} | ${d.empresaBandera || ''} | ${d.numEstacion || ''}`.trim())
    .join('\n');

  const baseRules = `Sos un asistente experto en lectura OCR y carga administrativa de una empresa argentina de maquinaria vial y movimiento de suelos llamada "El Hornocal S.R.L. / La Hormiga" (CUIT 30-71499982-2).
Reglas estrictas:
- Extraé UNICAMENTE datos legibles o inferibles con alta certeza desde la imagen. Si un campo no figura o es ilegible, dejalo como cadena vacía "" o 0 (en números), NUNCA inventes datos ni números de comprobante falsos.
- Fechas SIEMPRE en formato ISO YYYY-MM-DD (convertí DD/MM/AA o DD/MM/AAAA a YYYY-MM-DD; si solo dice día/mes sin año, asumí el año actual).
- Números decimales con punto (ej: 1250.50). Eliminá símbolos "$" y separadores de miles.
- Si el texto manuscrito o impreso menciona una máquina, chofer, obra, proveedor o estación que se parezca a uno del catálogo de la empresa abajo, devolvé preferentemente el código/nombre exacto del catálogo.
- Respondé exclusivamente con JSON válido siguiendo el schema.`;

  const catalogBlocks: string[] = [];
  if (vehiclesHint) catalogBlocks.push(`CATÁLOGO DE EQUIPOS / FLOTA (código | modelo | patente):\n${vehiclesHint}`);
  if (driversHint) catalogBlocks.push(`CATÁLOGO DE CHOFERES / OPERARIOS (código | nombre):\n${driversHint}`);
  if (obrasHint && (docType === 'PARTE_DIARIO' || docType === 'REMITO')) {
    catalogBlocks.push(`CATÁLOGO DE OBRAS (código | nombre | ubicación):\n${obrasHint}`);
  }
  if (depositsHint && (docType === 'COMBUSTIBLE' || docType === 'VALE_COMBUSTIBLE')) {
    catalogBlocks.push(`ESTACIONES Y DEPÓSITOS DE COMBUSTIBLE:\n${depositsHint}`);
  }
  if (proveedoresHint && docType === 'FACTURA') {
    catalogBlocks.push(`PROVEEDORES REGISTRADOS (cuit | razón social):\n${proveedoresHint}`);
  }

  return `${baseRules}\n\n${catalogBlocks.join('\n\n')}`;
}

function buildUserPrompt(docType: AnalyzableDocumentType): string {
  switch (docType) {
    case 'PARTE_DIARIO':
      return 'Analizá esta foto de un PARTE DIARIO de maquinaria o camión. Extraé fecha, número de parte, máquina/vehículo, operario/chofer, obra, horarios de mañana y tarde, lectura de horómetro/odómetro, modalidad (HORAS, VIAJES, DIA, TRABAJO), cantidad de viajes/material/m3 si corresponde, encargado, si está firmado y observaciones.';
    case 'COMBUSTIBLE':
      return 'Analizá esta foto de un TICKET o COMPROBANTE DE CARGA DE COMBUSTIBLE (surtidor o despacho). Extraé fecha, hora, estación/depósito, número de ticket, número de vale si figura, tipo de combustible normalizado (DIESEL COMUN, DIESEL INFINIA, NAFTA SUPER o NAFTA INFINIA), litros cargados, precio por litro, importe total, patente/equipo, chofer y kilometraje/horómetro.';
    case 'VALE_COMBUSTIBLE':
      return 'Analizá esta foto de un VALE DE COMBUSTIBLE autorizado. Extraé número de vale, fecha, hora, estación surtidor, tipo de combustible normalizado (DIESEL COMUN, DIESEL INFINIA, NAFTA SUPER o NAFTA INFINIA), litros autorizados, tipo de carga, equipo/patente, chofer/legajo, odómetro de salida y observaciones.';
    case 'FACTURA':
      return 'Analizá esta foto de una FACTURA o comprobante fiscal argentino (puede ser de nuestro sistema, de otro sistema, o factura de compra de un proveedor). Determiná sugerenciaNaturaleza ("VENTA" si el emisor es El Hornocal SRL / La Hormiga, "COMPRA" si es un proveedor externo), tipo de comprobante, punto de venta, número, fecha, CAE, datos completos de emisor y receptor, cada ítem de detalle, neto gravado, IVA, percepciones/impuestos de combustible si hubiera y total final.';
    case 'REMITO':
      return 'Analizá esta foto de un REMITO (traslado de maquinaria, entrega de áridos/materiales o insumos). Extraé fecha, letra (R o X), punto de venta, número de remito, CAI si figura, destinatario/cliente, CUIT, obra/lugar de entrega, motivo de traslado, chofer/vehículo/patente, todos los ítems/cantidades/unidades y observaciones.';
  }
}

async function resolveImageData(req: AnalyzeDocumentRequest): Promise<{ base64: string; mimeType: string }> {
  if (req.imageBase64 && req.imageBase64.trim()) {
    const raw = req.imageBase64.trim();
    const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      return { mimeType: dataUrlMatch[1] || 'image/webp', base64: dataUrlMatch[2] };
    }
    return { mimeType: req.mimeType || 'image/webp', base64: raw };
  }

  if (req.imageUrl && /^https?:\/\//i.test(req.imageUrl)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(req.imageUrl, { signal: controller.signal });
      if (!resp.ok) {
        throw new Error(`No se pudo descargar la imagen (${resp.status}) desde el almacenamiento.`);
      }
      const contentType = resp.headers.get('content-type') || req.mimeType || 'image/webp';
      const arrayBuf = await resp.arrayBuffer();
      const base64 = Buffer.from(arrayBuf).toString('base64');
      return {
        mimeType: contentType.split(';')[0].trim() || 'image/webp',
        base64,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Debés enviar una imagen (imageUrl o imageBase64) para analizar.');
}

export async function analyzeDocumentImageWithGemini(req: AnalyzeDocumentRequest): Promise<{
  documentType: AnalyzableDocumentType;
  data: Record<string, any>;
  model: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    const err: any = new Error('GEMINI_API_KEY no está configurada en el servidor.');
    err.statusCode = 503;
    throw err;
  }

  const validTypes: AnalyzableDocumentType[] = [
    'PARTE_DIARIO',
    'COMBUSTIBLE',
    'VALE_COMBUSTIBLE',
    'FACTURA',
    'REMITO',
  ];
  if (!validTypes.includes(req.documentType)) {
    const err: any = new Error(`Tipo de documento no soportado para análisis IA: ${req.documentType}`);
    err.statusCode = 400;
    throw err;
  }

  const { base64, mimeType } = await resolveImageData(req);
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const model = 'gemini-4-hydrogen';
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64,
          },
        },
        {
          text: buildUserPrompt(req.documentType),
        },
      ],
    },
    config: {
      systemInstruction: buildSystemInstruction(req.documentType, req.context),
      responseMimeType: 'application/json',
      responseSchema: getSchemaForType(req.documentType),
    },
  });

  const rawText = (response.text || '').trim();
  if (!rawText) {
    throw new Error('La IA no devolvió texto analizado para esta imagen. Intentá sacar una foto más nítida.');
  }

  const cleanedJson = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const parsed = JSON.parse(cleanedJson);
  return {
    documentType: req.documentType,
    data: parsed,
    model,
  };
}
