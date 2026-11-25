import https from 'https';
import crypto from 'crypto';
import forge from 'node-forge';

const WSAA_PROD_URL = 'https://wsaa.afip.gov.ar/ws/services/LoginCms';
const WSAA_HOMO_URL = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
const WSFE_PROD_URL = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx';
const WSFE_HOMO_URL = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';

export interface KeyPairValidation {
  match: boolean;
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  error?: string;
}

export interface WsaaAuth {
  token: string;
  sign: string;
  cuit: string;
  expirationTime: string;
}

// In-memory token cache to avoid spamming WSAA on every request
const wsaaCache = new Map<string, WsaaAuth>();

/**
 * Executes a raw HTTPS POST request with AFIP-compatible cipher suite
 */
export function afipSoapCall(url: string, soapAction: string, xmlBody: string, timeoutMs: number = 25000): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    // AFIP requires DEFAULT@SECLEVEL=1 due to legacy Diffie-Hellman parameters
    const agent = new https.Agent({
      ciphers: 'DEFAULT@SECLEVEL=1',
      keepAlive: false
    });

    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': soapAction,
        'Content-Length': Buffer.byteLength(xmlBody, 'utf-8')
      },
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 200, data }));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout de conexión con ARCA / AFIP (${url}) luego de ${timeoutMs / 1000}s`));
    });

    req.on('error', (err) => {
      reject(new Error(`Fallo de red hacia ARCA (${url}): ${err.message}`));
    });

    req.write(xmlBody, 'utf-8');
    req.end();
  });
}

function normalizePem(pem: string): string {
  return String(pem || '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

/**
 * Validates whether the Private Key (.key) matches the X.509 Certificate (.crt)
 * using Node.js native crypto (no external openssl subprocess failures).
 */
export function checkCertificateKeyMatch(certPem: string, keyPem: string): KeyPairValidation {
  try {
    const cleanCert = normalizePem(certPem);
    const cleanKey = normalizePem(keyPem);

    if (!cleanCert.includes('BEGIN CERTIFICATE')) {
      return {
        match: false,
        error: 'El Certificado Digital (.crt) no tiene formato PEM válido.'
      };
    }
    if (!cleanKey.includes('PRIVATE KEY')) {
      return {
        match: false,
        error: 'La Clave Privada (.key) no tiene formato PEM válido.'
      };
    }

    const x509 = new crypto.X509Certificate(cleanCert);
    const privKeyObj = crypto.createPrivateKey(cleanKey);
    const derivedPubKeyObj = crypto.createPublicKey(privKeyObj);

    const certPubDer = x509.publicKey.export({ type: 'spki', format: 'der' });
    const keyPubDer = derivedPubKeyObj.export({ type: 'spki', format: 'der' });
    const isMatch = Buffer.isBuffer(certPubDer) && Buffer.isBuffer(keyPubDer) && certPubDer.equals(keyPubDer);

    return {
      match: isMatch,
      subject: x509.subject.replace(/\n/g, ', '),
      issuer: x509.issuer.replace(/\n/g, ', '),
      validFrom: x509.validFrom,
      validTo: x509.validTo,
      error: isMatch ? undefined : 'La Clave Privada (.key) no coincide con la Clave Pública del Certificado Digital (.crt).'
    };
  } catch (err: any) {
    return {
      match: false,
      error: `Error verificando certificados: ${err?.message || 'Formato PEM inválido'}`
    };
  }
}

function formatWsaaDate(date: Date): string {
  // Convert UTC time to Argentina timezone (UTC-3)
  const tzOffsetMinutes = -3 * 60;
  const d = new Date(date.getTime() + tzOffsetMinutes * 60 * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-03:00`;
}

function signTraCmsBase64(traXml: string, certPem: string, keyPem: string): string {
  const cleanCert = normalizePem(certPem);
  const cleanKey = normalizePem(keyPem);

  let pkcs1KeyPem = cleanKey;
  try {
    pkcs1KeyPem = crypto
      .createPrivateKey(cleanKey)
      .export({ type: 'pkcs1', format: 'pem' }) as string;
  } catch {
    // Fallback to raw PEM if already readable by forge
  }

  const forgeCert = forge.pki.certificateFromPem(cleanCert);
  const forgePrivateKey = forge.pki.privateKeyFromPem(pkcs1KeyPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, 'utf8');
  p7.addCertificate(forgeCert);
  p7.addSigner({
    key: forgePrivateKey,
    certificate: forgeCert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });
  p7.sign({ detached: false });

  const derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Buffer.from(derBytes, 'binary').toString('base64');
}

/**
 * Obtains a WSAA Ticket de Acceso (Token & Sign) directly from AFIP using pure-JS PKCS#7 CMS signing
 */
export async function getWsaaAuth(
  cuit: string, 
  certPem: string, 
  keyPem: string, 
  isProduction: boolean = true,
  service: string = 'wsfe',
  wsaaTimeoutMs: number = 15000
): Promise<WsaaAuth> {
  const cleanCuit = String(cuit).replace(/\D/g, '');
  const cleanService = (service || 'wsfe').trim();
  const cacheKey = `${cleanCuit}_${isProduction ? 'prod' : 'homo'}_${cleanService}`;

  // 1. Check in-memory cache
  const cached = wsaaCache.get(cacheKey);
  if (cached && cached.token && cached.sign) {
    const expiresAt = new Date(cached.expirationTime).getTime();
    // Re-use token if it has at least 5 minutes of remaining life
    if (expiresAt > Date.now() + 5 * 60 * 1000) {
      return cached;
    }
  }

  // 2. Validate key pair before attempting sign
  const check = checkCertificateKeyMatch(certPem, keyPem);
  if (!check.match) {
    throw new Error(
      `ARCA Error Criptográfico: ${check.error || 'Clave y Certificado no coinciden'}. ` +
      `Certificado emitido para: ${check.subject || 'Desconocido'}. ` +
      `Asegúrese de cargar el archivo .key correspondiente a este certificado.`
    );
  }

  // Dates for TRA formatted in exact Argentina local time (UTC-3)
  const now = new Date();
  const genDate = formatWsaaDate(new Date(now.getTime() - 10 * 60 * 1000));
  const expDate = formatWsaaDate(new Date(now.getTime() + 30 * 60 * 1000));
  const uniqueId = Math.floor(now.getTime() / 1000);

  const traXml = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${genDate}</generationTime>
    <expirationTime>${expDate}</expirationTime>
  </header>
  <service>${cleanService}</service>
</loginTicketRequest>`;

  // Sign TRA with PKCS#7 (CMS) in DER format via node-forge (no external openssl binary required)
  const cmsB64 = signTraCmsBase64(traXml, certPem, keyPem);

  // Send SOAP request to WSAA
  const wsaaUrl = isProduction ? WSAA_PROD_URL : WSAA_HOMO_URL;
  const wsaaSoapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cmsB64}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  const resp = await afipSoapCall(wsaaUrl, '""', wsaaSoapEnvelope, wsaaTimeoutMs);

  if (resp.status !== 200 || !resp.data.includes('<loginCmsReturn>')) {
    const faultStringMatch = resp.data.match(/<faultstring>(.*?)<\/faultstring>/);
    const faultCodeMatch = resp.data.match(/<faultcode.*?>(.*?)<\/faultcode>/);
    const faultMsg = faultStringMatch ? faultStringMatch[1] : `HTTP ${resp.status}`;
    const faultCode = faultCodeMatch ? faultCodeMatch[1] : '';
    throw new Error(`WSAA Rechazó Autenticación [${faultCode}]: ${faultMsg}`);
  }

  // Decode entity XML inside loginCmsReturn
  const returnMatch = resp.data.match(/<loginCmsReturn>(.*?)<\/loginCmsReturn>/s);
  let innerXml = returnMatch ? returnMatch[1] : resp.data;
  innerXml = innerXml.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  const tokenMatch = innerXml.match(/<token>(.*?)<\/token>/);
  const signMatch = innerXml.match(/<sign>(.*?)<\/sign>/);
  const expMatch = innerXml.match(/<expirationTime>(.*?)<\/expirationTime>/);

  if (!tokenMatch || !signMatch) {
    throw new Error('Respuesta de WSAA incompleta: No se encontraron los campos Token y Sign.');
  }

  const auth: WsaaAuth = {
    token: tokenMatch[1],
    sign: signMatch[1],
    cuit: cleanCuit,
    expirationTime: expMatch ? expMatch[1] : new Date(now.getTime() + 12 * 3600 * 1000).toISOString()
  };

  wsaaCache.set(cacheKey, auth);
  return auth;
}

/**
 * Queries AFIP WSFEv1 for a specific voucher's official record
 */
export async function wsfeConsultVoucher(
  auth: WsaaAuth,
  ptoVta: number,
  cbteTipo: number,
  cbteNro: number,
  isProduction: boolean = true
): Promise<{ status: number; data: string; parsed: any }> {
  const wsfeUrl = isProduction ? WSFE_PROD_URL : WSFE_HOMO_URL;

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fe="http://ar.gov.afip.dif.FEV1/">
  <soap:Header/>
  <soap:Body>
    <fe:FECompConsultar>
      <fe:Auth>
        <fe:Token>${auth.token}</fe:Token>
        <fe:Sign>${auth.sign}</fe:Sign>
        <fe:Cuit>${auth.cuit}</fe:Cuit>
      </fe:Auth>
      <fe:FeCompConsReq>
        <fe:CbteTipo>${cbteTipo}</fe:CbteTipo>
        <fe:CbteNro>${cbteNro}</fe:CbteNro>
        <fe:PtoVta>${ptoVta}</fe:PtoVta>
      </fe:FeCompConsReq>
    </fe:FECompConsultar>
  </soap:Body>
</soap:Envelope>`;

  const resp = await afipSoapCall(wsfeUrl, 'http://ar.gov.afip.dif.FEV1/FECompConsultar', soapEnvelope);

  const caeMatch = resp.data.match(/<CodAutorizacion>(\d+)<\/CodAutorizacion>/);
  const resultadoMatch = resp.data.match(/<Resultado>([A-Z])<\/Resultado>/);
  const fchProcesoMatch = resp.data.match(/<FchProceso>(.*?)<\/FchProceso>/);
  const cbteFchMatch = resp.data.match(/<CbteFch>(\d{8})<\/CbteFch>/);
  const fchVtoMatch = resp.data.match(/<FchVto>(\d{8})<\/FchVto>/);
  const impTotalMatch = resp.data.match(/<ImpTotal>(.*?)<\/ImpTotal>/);
  const impNetoMatch = resp.data.match(/<ImpNeto>(.*?)<\/ImpNeto>/);
  const impIvaMatch = resp.data.match(/<ImpIVA>(.*?)<\/ImpIVA>/);
  const impTribMatch = resp.data.match(/<ImpTrib>(.*?)<\/ImpTrib>/);
  const monIdMatch = resp.data.match(/<MonId>(.*?)<\/MonId>/);
  const monCotizMatch = resp.data.match(/<MonCotiz>(.*?)<\/MonCotiz>/);
  const docNroMatch = resp.data.match(/<DocNro>(\d+)<\/DocNro>/);
  const docTipoMatch = resp.data.match(/<DocTipo>(\d+)<\/DocTipo>/);
  const ambienteMatch = resp.data.match(/<ambiente>(.*?)<\/ambiente>/);
  const cbteAsocBlock = resp.data.match(/<CbteAsoc>([\s\S]*?)<\/CbteAsoc>/);
  let cbteAsoc: { tipo: number; puntoVenta: number; numero: number } | null = null;
  if (cbteAsocBlock) {
    const aTipo = cbteAsocBlock[1].match(/<Tipo>(\d+)<\/Tipo>/);
    const aPto = cbteAsocBlock[1].match(/<PtoVta>(\d+)<\/PtoVta>/);
    const aNro = cbteAsocBlock[1].match(/<Nro>(\d+)<\/Nro>/);
    if (aTipo && aPto && aNro) {
      cbteAsoc = {
        tipo: Number(aTipo[1]),
        puntoVenta: Number(aPto[1]),
        numero: Number(aNro[1]),
      };
    }
  }
  const obsList: string[] = [];
  const obsRegex = /<Obs>\s*<Code>(\d+)<\/Code>\s*<Msg>(.*?)<\/Msg>\s*<\/Obs>/g;
  let om: RegExpExecArray | null;
  while ((om = obsRegex.exec(resp.data)) !== null) {
    obsList.push(`[Obs ${om[1]}] ${om[2]}`);
  }
  const fmtYmd = (raw?: string | null) =>
    raw && raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : null;

  return {
    status: resp.status,
    data: resp.data,
    parsed: {
      cae: caeMatch ? caeMatch[1] : null,
      resultado: resultadoMatch ? resultadoMatch[1] : null,
      fechaProceso: fchProcesoMatch ? fchProcesoMatch[1] : null,
      cbteFch: fmtYmd(cbteFchMatch ? cbteFchMatch[1] : null),
      fchVto: fmtYmd(fchVtoMatch ? fchVtoMatch[1] : null),
      importeTotal: impTotalMatch ? Number(impTotalMatch[1]) : null,
      impNeto: impNetoMatch ? Number(impNetoMatch[1]) : null,
      impIva: impIvaMatch ? Number(impIvaMatch[1]) : null,
      impTrib: impTribMatch ? Number(impTribMatch[1]) : null,
      monId: monIdMatch ? monIdMatch[1] : 'PES',
      monCotiz: monCotizMatch ? Number(monCotizMatch[1]) : 1,
      docNro: docNroMatch ? docNroMatch[1] : null,
      docTipo: docTipoMatch ? docTipoMatch[1] : null,
      cbteAsoc,
      observaciones: obsList.join(' • '),
      ambiente: ambienteMatch ? ambienteMatch[1] : 'Produccion'
    }
  };
}

/**
 * Queries AFIP WSFEv1 for the last authorized invoice number for a given Punto de Venta and Type
 */
export async function wsfeGetLastVoucher(
  auth: WsaaAuth,
  ptoVta: number,
  cbteTipo: number,
  isProduction: boolean = true
): Promise<number> {
  const wsfeUrl = isProduction ? WSFE_PROD_URL : WSFE_HOMO_URL;

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fe="http://ar.gov.afip.dif.FEV1/">
  <soap:Header/>
  <soap:Body>
    <fe:FECompUltimoAutorizado>
      <fe:Auth>
        <fe:Token>${auth.token}</fe:Token>
        <fe:Sign>${auth.sign}</fe:Sign>
        <fe:Cuit>${auth.cuit}</fe:Cuit>
      </fe:Auth>
      <fe:PtoVta>${ptoVta}</fe:PtoVta>
      <fe:CbteTipo>${cbteTipo}</fe:CbteTipo>
    </fe:FECompUltimoAutorizado>
  </soap:Body>
</soap:Envelope>`;

  const resp = await afipSoapCall(wsfeUrl, 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado', soapEnvelope);

  if (resp.status !== 200) {
    throw new Error(`AFIP WSFEv1 FECompUltimoAutorizado falló con status HTTP ${resp.status}`);
  }

  // Check for Errors
  const errMatch = resp.data.match(/<Err>\s*<Code>(\d+)<\/Code>\s*<Msg>(.*?)<\/Msg>\s*<\/Err>/);
  if (errMatch) {
    throw new Error(`AFIP Error [${errMatch[1]}]: ${errMatch[2]}`);
  }

  const numMatch = resp.data.match(/<CbteNro>(\d+)<\/CbteNro>/);
  if (!numMatch) {
    return 0;
  }

  return parseInt(numMatch[1], 10);
}

/**
 * Queries AFIP WSFEv1 FEParamGetCotizacion for official currency exchange rate (e.g. 'DOL' for USD)
 */
export async function wsfeGetExchangeRate(
  auth: WsaaAuth,
  monedaId: string = 'DOL',
  isProduction: boolean = true
): Promise<{ monedaId: string; cotizacion: number; fecha: string }> {
  const wsfeUrl = isProduction ? WSFE_PROD_URL : WSFE_HOMO_URL;
  const cleanMonId = String(monedaId || 'DOL').toUpperCase().trim();

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fe="http://ar.gov.afip.dif.FEV1/">
  <soap:Header/>
  <soap:Body>
    <fe:FEParamGetCotizacion>
      <fe:Auth>
        <fe:Token>${auth.token}</fe:Token>
        <fe:Sign>${auth.sign}</fe:Sign>
        <fe:Cuit>${auth.cuit}</fe:Cuit>
      </fe:Auth>
      <fe:MonId>${cleanMonId}</fe:MonId>
    </fe:FEParamGetCotizacion>
  </soap:Body>
</soap:Envelope>`;

  const resp = await afipSoapCall(wsfeUrl, 'http://ar.gov.afip.dif.FEV1/FEParamGetCotizacion', soapEnvelope, 8000);
  if (resp.status !== 200) {
    throw new Error(`AFIP FEParamGetCotizacion falló con status HTTP ${resp.status}`);
  }

  const errMatch = resp.data.match(/<Err>\s*<Code>(\d+)<\/Code>\s*<Msg>(.*?)<\/Msg>\s*<\/Err>/);
  if (errMatch) {
    throw new Error(`AFIP Error [${errMatch[1]}]: ${errMatch[2]}`);
  }

  const cotizMatch = resp.data.match(/<MonCotiz>([0-9.]+)<\/MonCotiz>/);
  const fchMatch = resp.data.match(/<FchCotiz>(\d+)<\/FchCotiz>/);

  if (!cotizMatch) {
    throw new Error(`No se encontró cotización vigente en AFIP para moneda ${cleanMonId}.`);
  }

  return {
    monedaId: cleanMonId,
    cotizacion: parseFloat(cotizMatch[1]),
    fecha: fchMatch ? fchMatch[1] : ''
  };
}

export interface InvoiceAuthParams {
  cuitEmisor: string;
  puntoVenta: number;
  tipoComprobante: 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C' | 'NOTA_CREDITO_A' | 'NOTA_CREDITO_B' | 'NOTA_CREDITO_C';
  tipoDocReceptor: 'CUIT' | 'DNI' | 'CONSUMIDOR_FINAL';
  nroDocReceptor: string;
  razonSocialReceptor: string;
  condicionIvaReceptor: string;
  netoGravado: number;
  ivaTotal: number;
  percepcionIibb?: number;
  importeTotal: number;
  items: any[];
  fecha?: string;
  moneda?: 'ARS' | 'USD';
  cotizacionDolar?: number;
  modoProduccion: boolean;
  privateKey: string;
  certificate: string;
  cbteAsociado?: {
    tipo?: number;
    tipoComprobante?: string;
    puntoVenta: number;
    numero?: number;
    numeroComprobante?: number;
    cuit?: string;
  };
}

function round2(val: number): number {
  return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;
}

export function mapTipoComprobanteToCode(tipo: string): number {
  switch (tipo) {
    case 'FACTURA_A': return 1;
    case 'NOTA_CREDITO_A': return 3;
    case 'FACTURA_B': return 6;
    case 'NOTA_CREDITO_B': return 8;
    case 'FACTURA_C': return 11;
    case 'NOTA_CREDITO_C': return 13;
    default: return 1;
  }
}

function mapAlicuotaToAfipId(rate: number): number {
  const r = Number(rate);
  if (r === 0) return 3;
  if (r === 2.5) return 9;
  if (r === 5) return 8;
  if (r === 10.5) return 4;
  if (r === 21) return 5;
  if (r === 27) return 6;
  return 5;
}

/**
 * Live invoice authorization with AFIP WSFEv1 FECAESolicitar
 */
export async function wsfeAuthorizeInvoice(params: InvoiceAuthParams) {
  const {
    cuitEmisor,
    puntoVenta,
    tipoComprobante,
    tipoDocReceptor,
    nroDocReceptor,
    netoGravado,
    ivaTotal,
    percepcionIibb = 0,
    importeTotal,
    items = [],
    fecha,
    moneda = 'ARS',
    cotizacionDolar,
    modoProduccion,
    privateKey,
    certificate,
    cbteAsociado
  } = params;

  const isUsd = moneda === 'USD';
  const afipMonId = isUsd ? 'DOL' : 'PES';
  const afipMonCotiz = isUsd ? Number(cotizacionDolar || 0) : 1;
  if (isUsd && (!Number.isFinite(afipMonCotiz) || afipMonCotiz <= 0)) {
    throw new Error('Debe ingresar una cotización del dólar (mayor a 0) para emitir comprobantes en USD ante ARCA.');
  }

  // 1. Get WSAA Auth Token
  const auth = await getWsaaAuth(cuitEmisor, certificate, privateKey, modoProduccion);

  // 2. Map Types (AFIP Codes: Factura A=1, NC A=3, Factura B=6, NC B=8, Factura C=11, NC C=13)
  const tipoCmpCode = mapTipoComprobanteToCode(tipoComprobante);

  const cleanDoc = String(nroDocReceptor || '').replace(/\D/g, '');
  const hasDocNumber = cleanDoc.length > 0 && Number(cleanDoc) > 0;
  const tipoDocCode = !hasDocNumber || tipoDocReceptor === 'CONSUMIDOR_FINAL'
    ? 99
    : tipoDocReceptor === 'CUIT'
      ? 80
      : 96;
  const docRecNum = tipoDocCode === 99 ? 0 : Number(cleanDoc);

  // 3. Query next invoice number directly from AFIP
  const lastVoucherNum = await wsfeGetLastVoucher(auth, puntoVenta, tipoCmpCode, modoProduccion);
  const nextVoucherNum = lastVoucherNum + 1;

  // 4. Dates
  const nowStr = (fecha || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const cbteFch = parseInt(nowStr, 10);

  // Concepto: 2 = Servicios (La Hormiga: maquinaria vial, alquiler, obras), 1 = Productos
  // For services, AFIP requires FchServDesde, FchServHasta, FchVtoPago
  const isServicio = true;
  const fchVtoPago = parseInt(
    new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10).replace(/-/g, ''),
    10
  );

  // WSFEv1 requires discriminating ImpNeto, ImpIVA and <fe:Iva> for A and B vouchers (1, 3, 6, 8).
  // Only Factura C / NC C (11, 13) omit the <fe:Iva> block with ImpIVA = 0.
  const isTypeC = tipoComprobante === 'FACTURA_C' || tipoComprobante === 'NOTA_CREDITO_C';

  let impNeto = 0;
  let impIva = 0;
  let impTrib = isTypeC ? 0 : round2(Number(percepcionIibb || 0));
  let impTotal = 0;
  let ivaXml = '';
  let tributosXml = '';

  if (isTypeC) {
    impTotal = round2(importeTotal);
    impNeto = impTotal;
    impIva = 0;
    impTrib = 0;
  } else {
    const baseByRate = new Map<number, number>();
    if (Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        const cant = Number(it?.cantidad || 0);
        const precio = Number(it?.precioUnitario || 0);
        const bonif = Number(it?.bonificacionPorcentaje || 0);
        const sub = round2(it?.subtotal !== undefined ? Number(it.subtotal) : cant * precio * (1 - bonif / 100));
        if (sub > 0) {
          const rate = it?.alicuotaIva !== undefined && it?.alicuotaIva !== null && Number.isFinite(Number(it.alicuotaIva))
            ? Number(it.alicuotaIva)
            : 21;
          baseByRate.set(rate, round2((baseByRate.get(rate) || 0) + sub));
        }
      }
    }

    const itemsBaseSum = round2(Array.from(baseByRate.values()).reduce((s, v) => s + v, 0));
    const useItemsBreakdown = itemsBaseSum > 0 && (round2(netoGravado) <= 0 || Math.abs(round2(netoGravado) - itemsBaseSum) <= 0.05);

    let alicEntries: Array<{ id: number; baseImp: number; importe: number }> = [];

    if (useItemsBreakdown) {
      for (const [rate, baseImp] of baseByRate.entries()) {
        if (baseImp > 0) {
          alicEntries.push({
            id: mapAlicuotaToAfipId(rate),
            baseImp: round2(baseImp),
            importe: round2(baseImp * (rate / 100))
          });
        }
      }
      impNeto = round2(alicEntries.reduce((s, a) => s + a.baseImp, 0));
      impIva = round2(alicEntries.reduce((s, a) => s + a.importe, 0));
    } else if (round2(netoGravado) > 0) {
      impNeto = round2(netoGravado);
      impIva = round2(ivaTotal) > 0 ? round2(ivaTotal) : round2(impNeto * 0.21);
      alicEntries = [{ id: 5, baseImp: impNeto, importe: impIva }];
    } else if (round2(importeTotal) > 0) {
      const netWithIva = round2(Math.max(0, round2(importeTotal) - impTrib));
      impNeto = round2(netWithIva / 1.21);
      impIva = round2(netWithIva - impNeto);
      alicEntries = [{ id: 5, baseImp: impNeto, importe: impIva }];
    }

    if (impNeto > 0) {
      if (alicEntries.length === 0) {
        const fallbackIva = impIva > 0 ? impIva : round2(impNeto * 0.21);
        impIva = fallbackIva;
        alicEntries = [{ id: 5, baseImp: impNeto, importe: fallbackIva }];
      }
      ivaXml = `
            <fe:Iva>${alicEntries.map(a => `
              <fe:AlicIva>
                <fe:Id>${a.id}</fe:Id>
                <fe:BaseImp>${a.baseImp.toFixed(2)}</fe:BaseImp>
                <fe:Importe>${a.importe.toFixed(2)}</fe:Importe>
              </fe:AlicIva>`).join('')}
            </fe:Iva>`;
    }

    if (impTrib > 0) {
      const alicTrib = impNeto > 0 ? round2((impTrib / impNeto) * 100) : 0;
      tributosXml = `
            <fe:Tributos>
              <fe:Tributo>
                <fe:Id>7</fe:Id>
                <fe:Desc>Percepcion IIBB</fe:Desc>
                <fe:BaseImp>${impNeto.toFixed(2)}</fe:BaseImp>
                <fe:Alic>${alicTrib.toFixed(2)}</fe:Alic>
                <fe:Importe>${impTrib.toFixed(2)}</fe:Importe>
              </fe:Tributo>
            </fe:Tributos>`;
    }

    impTotal = round2(impNeto + impIva + impTrib);
  }

  let cbtesAsocXml = '';
  const assocNum = Number(cbteAsociado?.numero || cbteAsociado?.numeroComprobante || 0);
  const assocTipo = cbteAsociado?.tipo
    ? Number(cbteAsociado.tipo)
    : cbteAsociado?.tipoComprobante
      ? mapTipoComprobanteToCode(cbteAsociado.tipoComprobante)
      : 0;
  if (cbteAsociado && assocNum > 0 && assocTipo > 0) {
    cbtesAsocXml = `
            <fe:CbtesAsoc>
              <fe:CbteAsoc>
                <fe:Tipo>${assocTipo}</fe:Tipo>
                <fe:PtoVta>${Number(cbteAsociado.puntoVenta || puntoVenta)}</fe:PtoVta>
                <fe:Nro>${assocNum}</fe:Nro>
                ${cbteAsociado.cuit ? `<fe:Cuit>${cbteAsociado.cuit.replace(/\D/g, '')}</fe:Cuit>` : ''}
              </fe:CbteAsoc>
            </fe:CbtesAsoc>`;
  }

  const wsfeUrl = modoProduccion ? WSFE_PROD_URL : WSFE_HOMO_URL;

  const feCaeSoapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fe="http://ar.gov.afip.dif.FEV1/">
  <soap:Header/>
  <soap:Body>
    <fe:FECAESolicitar>
      <fe:Auth>
        <fe:Token>${auth.token}</fe:Token>
        <fe:Sign>${auth.sign}</fe:Sign>
        <fe:Cuit>${auth.cuit}</fe:Cuit>
      </fe:Auth>
      <fe:FeCAEReq>
        <fe:FeCabReq>
          <fe:CantReg>1</fe:CantReg>
          <fe:PtoVta>${puntoVenta}</fe:PtoVta>
          <fe:CbteTipo>${tipoCmpCode}</fe:CbteTipo>
        </fe:FeCabReq>
        <fe:FeDetReq>
          <fe:FECAEDetRequest>
            <fe:Concepto>${isServicio ? 2 : 1}</fe:Concepto>
            <fe:DocTipo>${tipoDocCode}</fe:DocTipo>
            <fe:DocNro>${docRecNum}</fe:DocNro>
            <fe:CbteDesde>${nextVoucherNum}</fe:CbteDesde>
            <fe:CbteHasta>${nextVoucherNum}</fe:CbteHasta>
            <fe:CbteFch>${cbteFch}</fe:CbteFch>
            <fe:ImpTotal>${impTotal.toFixed(2)}</fe:ImpTotal>
            <fe:ImpTotConc>0.00</fe:ImpTotConc>
            <fe:ImpNeto>${impNeto.toFixed(2)}</fe:ImpNeto>
            <fe:ImpOpEx>0.00</fe:ImpOpEx>
            <fe:ImpTrib>${impTrib.toFixed(2)}</fe:ImpTrib>
            <fe:ImpIVA>${impIva.toFixed(2)}</fe:ImpIVA>
            ${isServicio ? `<fe:FchServDesde>${cbteFch}</fe:FchServDesde>` : ''}
            ${isServicio ? `<fe:FchServHasta>${cbteFch}</fe:FchServHasta>` : ''}
            ${isServicio ? `<fe:FchVtoPago>${fchVtoPago}</fe:FchVtoPago>` : ''}
            <fe:MonId>${afipMonId}</fe:MonId>
            <fe:MonCotiz>${isUsd ? afipMonCotiz : 1}</fe:MonCotiz>
            ${cbtesAsocXml}
            ${tributosXml}
            ${ivaXml}
          </fe:FECAEDetRequest>
        </fe:FeDetReq>
      </fe:FeCAEReq>
    </fe:FECAESolicitar>
  </soap:Body>
</soap:Envelope>`;

  const resp = await afipSoapCall(wsfeUrl, 'http://ar.gov.afip.dif.FEV1/FECAESolicitar', feCaeSoapEnvelope);

  if (resp.status !== 200) {
    throw new Error(`AFIP WSFEv1 FECAESolicitar falló con status HTTP ${resp.status}`);
  }

  // Parse global Errors
  const errors: string[] = [];
  const errRegex = /<Err>\s*<Code>(\d+)<\/Code>\s*<Msg>(.*?)<\/Msg>\s*<\/Err>/g;
  let m: RegExpExecArray | null;
  while ((m = errRegex.exec(resp.data)) !== null) {
    errors.push(`[Error ${m[1]}] ${m[2]}`);
  }

  // Parse Observations
  const obs: string[] = [];
  const obsRegex = /<Obs>\s*<Code>(\d+)<\/Code>\s*<Msg>(.*?)<\/Msg>\s*<\/Obs>/g;
  while ((m = obsRegex.exec(resp.data)) !== null) {
    obs.push(`[Obs ${m[1]}] ${m[2]}`);
  }

  const resultadoMatch = resp.data.match(/<Resultado>([A-Z])<\/Resultado>/);
  const caeMatch = resp.data.match(/<CAE>(\d+)<\/CAE>/);
  const caeFchVtoMatch = resp.data.match(/<CAEFchVto>(\d+)<\/CAEFchVto>/);

  const resultado = resultadoMatch ? resultadoMatch[1] : 'R';

  if (resultado !== 'A' || !caeMatch) {
    const errorMsg = errors.length > 0
      ? errors.join(' • ')
      : obs.length > 0
        ? obs.join(' • ')
        : 'ARCA / AFIP rechazó la solicitud del comprobante sin especificar código.';
    throw new Error(`ARCA Rechazó el Comprobante: ${errorMsg}`);
  }

  const realCae = caeMatch[1];
  const realVtoStr = caeFchVtoMatch ? caeFchVtoMatch[1] : '';
  const formattedVto = realVtoStr.length === 8
    ? `${realVtoStr.slice(0, 4)}-${realVtoStr.slice(4, 6)}-${realVtoStr.slice(6, 8)}`
    : new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

  // Official QR Code data format required by AFIP
  const qrObj = {
    ver: 1,
    fecha: fecha || new Date().toISOString().slice(0, 10),
    cuit: Number(auth.cuit),
    ptoVta: puntoVenta,
    tipoCmp: tipoCmpCode,
    nroCmp: nextVoucherNum,
    importe: impTotal,
    moneda: afipMonId,
    ctz: isUsd ? afipMonCotiz : 1,
    tipoDocRec: tipoDocCode,
    nroDocRec: docRecNum,
    tipoCodAut: 'E',
    codAut: Number(realCae)
  };

  const qrData = `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(qrObj)).toString('base64')}`;

  return {
    success: true,
    cae: realCae,
    vencimientoCae: formattedVto,
    numeroComprobante: nextVoucherNum,
    resultado: 'APROBADO',
    observacionesArca: obs.length > 0 ? obs.join(' • ') : 'Comprobante Autorizado por ARCA (WSFEv1)',
    qrData
  };
}

export interface AfipPadronLookupResult {
  success: boolean;
  notDelegated?: boolean;
  cuit?: string;
  razonSocial?: string;
  domicilio?: string;
  localidad?: string;
  zona?: string;
  condicionIva?: string;
  fuente?: string;
  error?: string;
}

function extractXmlTag(xml: string, tagName: string): string {
  const re = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tagName}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : '';
}

const padronNotDelegatedCache = new Map<string, number>();

/**
 * Queries official AFIP Padrón A5 (ws_sr_constancia_inscripcion) or A13 (ws_sr_padron_a13)
 * using the user's configured ARCA certificate & private key.
 */
export async function wsPadronConsultCuit(
  cuitTarget: string,
  cuitRepresentada: string,
  certPem: string,
  keyPem: string,
  isProduction: boolean = true,
  bypassNegativeCache: boolean = false
): Promise<AfipPadronLookupResult> {
  const cleanTarget = String(cuitTarget || '').replace(/\D/g, '');
  const cleanRep = String(cuitRepresentada || '').replace(/\D/g, '');
  if (cleanTarget.length !== 11 || cleanRep.length !== 11) {
    return { success: false, error: 'CUIT inválido para consulta en Padrón ARCA' };
  }

  const negKey = `${cleanRep}_${isProduction ? 'prod' : 'homo'}`;
  const lastDeniedAt = padronNotDelegatedCache.get(negKey);
  if (!bypassNegativeCache && lastDeniedAt && Date.now() - lastDeniedAt < 60 * 1000) {
    return {
      success: false,
      notDelegated: true,
      error: 'Computador no autorizado a acceder al servicio'
    };
  }

  const attempts = [
    {
      service: 'ws_sr_constancia_inscripcion',
      url: isProduction
        ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5'
        : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
      ns: 'http://a5.soap.ws.server.puc.sr/',
      method: 'getPersona_v2'
    },
    {
      service: 'ws_sr_padron_a13',
      url: isProduction
        ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13'
        : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
      ns: 'http://a13.soap.ws.server.puc.sr/',
      method: 'getPersona'
    }
  ];

  const results = await Promise.all(
    attempts.map(async (att): Promise<AfipPadronLookupResult> => {
      try {
        const auth = await getWsaaAuth(cleanRep, certPem, keyPem, isProduction, att.service, 4500);
        const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pad="${att.ns}">
  <soapenv:Header/>
  <soapenv:Body>
    <pad:${att.method}>
      <token>${auth.token}</token>
      <sign>${auth.sign}</sign>
      <cuitRepresentada>${cleanRep}</cuitRepresentada>
      <idPersona>${cleanTarget}</idPersona>
    </pad:${att.method}>
  </soapenv:Body>
</soapenv:Envelope>`;

        const resp = await afipSoapCall(att.url, '""', soapBody, 7000);
        const xml = resp.data || '';

        if (resp.status !== 200 || xml.includes('<faultstring>')) {
          const fault = extractXmlTag(xml, 'faultstring');
          return { success: false, error: fault || `HTTP ${resp.status}` };
        }

        const rsTag = extractXmlTag(xml, 'razonSocial');
        const apellido = extractXmlTag(xml, 'apellido');
        const nombre = extractXmlTag(xml, 'nombre');
        const razonSocial = (rsTag || `${apellido} ${nombre}`.trim()).replace(/\s+/g, ' ').trim().toUpperCase();

        if (!razonSocial) {
          return { success: false, error: 'Sin razón social en respuesta' };
        }

        const domBlocks = xml.match(/<(?:[a-zA-Z0-9_]+:)?domicilio(?:Fiscal)?[^>]*>[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?domicilio(?:Fiscal)?>/gi) || [];
        const fiscalBlock = domBlocks.find(b => /FISCAL/i.test(b)) || domBlocks[0] || xml;

        const direccion = extractXmlTag(fiscalBlock, 'direccion');
        const localidadRaw = extractXmlTag(fiscalBlock, 'localidad');
        const provincia = extractXmlTag(fiscalBlock, 'descripcionProvincia');
        const codPostal = extractXmlTag(fiscalBlock, 'codPostal');

        let condicionIva = '';
        if (/<datosMonotributo>/i.test(xml) || /<idImpuesto>\s*20\s*<\/idImpuesto>/i.test(xml)) {
          condicionIva = 'MONOTRIBUTO';
        } else if (/<idImpuesto>\s*30\s*<\/idImpuesto>/i.test(xml)) {
          condicionIva = 'RESPONSABLE_INSCRIPTO';
        } else if (/<idImpuesto>\s*32\s*<\/idImpuesto>/i.test(xml)) {
          condicionIva = 'EXENTO';
        }

        return {
          success: true,
          cuit: cleanTarget,
          razonSocial,
          domicilio: direccion.toUpperCase(),
          localidad: (localidadRaw || provincia || '').toUpperCase(),
          zona: codPostal ? `CP ${codPostal}` : '',
          condicionIva,
          fuente: att.service === 'ws_sr_constancia_inscripcion' ? 'PADRON_ARCA_A5' : 'PADRON_ARCA_A13'
        };
      } catch (err: any) {
        const msg = err?.message || String(err);
        return {
          success: false,
          notDelegated: /no autorizado|computador/i.test(msg),
          error: msg
        };
      }
    })
  );

  // Prefer A5 result with tax status if successful, else A13
  const succeeded = results.find(r => r.success && r.domicilio) || results.find(r => r.success);
  if (succeeded) {
    return succeeded;
  }

  const sawNotDelegated = results.some(r => r.notDelegated);
  if (sawNotDelegated) {
    padronNotDelegatedCache.set(negKey, Date.now());
  }

  return {
    success: false,
    notDelegated: sawNotDelegated,
    error: results.find(r => r.error)?.error || ''
  };
}
