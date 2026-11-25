const fs = require('fs');
const readline = require('readline');
const { Pool } = require('pg');

const SUPABASE_PROJECT_REF = 'byqzxlrbggdnzvvoigge';
const dbPassword = process.env.SUPABASE_DB_PASSWORD || 'Bu4271879jxcyh';
const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`;

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseNumber(str) {
  if (!str) return 0;
  const clean = String(str).replace(/,/g, '').trim();
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

function parseDateToISO(fechaStr) {
  if (!fechaStr) return '';
  const parts = fechaStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }
  return fechaStr;
}

async function runImport() {
  console.log('[Expendio Import] Reading CSV file...');
  const csvPath = 'public/assets/aistudio/AppSheet.ViewData.2026-11-02__1__5e1cf972.csv';
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at ${csvPath}`);
  }

  // Load existing collections for cross-referencing
  const issuedVouchers = fs.existsSync('data/collections/issued_vouchers.json')
    ? JSON.parse(fs.readFileSync('data/collections/issued_vouchers.json', 'utf8'))
    : [];
  const vehicles = fs.existsSync('data/collections/vehicles.json')
    ? JSON.parse(fs.readFileSync('data/collections/vehicles.json', 'utf8'))
    : [];

  const ivByVale = new Map();
  const ivByExpendioId = new Map();
  issuedVouchers.forEach(iv => {
    if (iv.numVale) ivByVale.set(String(iv.numVale).trim(), iv);
    if (iv.expendioId) ivByExpendioId.set(String(iv.expendioId).trim(), iv);
  });

  const vehByCode = new Map();
  vehicles.forEach(v => {
    if (v.codigoInterno) vehByCode.set(v.codigoInterno.toUpperCase().trim(), v);
    if (v.modeloMarca) vehByCode.set(v.modeloMarca.toUpperCase().trim(), v);
    if (v.codigoEquipo) vehByCode.set(v.codigoEquipo.toUpperCase().trim(), v);
  });

  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = null;
  const expendios = [];
  const ids = new Set();

  for await (const line of rl) {
    if (!headers) {
      headers = parseCSVLine(line.replace(/^\ufeff/, ''));
      continue;
    }
    if (!line.trim()) continue;
    const cols = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = cols[idx] ? cols[idx].trim() : '';
    });

    const fechaStr = row['FECHA'] || '';
    const parts = fechaStr.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);

      // Only records from month 6 (June) of 2026 onwards
      if ((year === 2026 && month >= 6) || year > 2026) {
        if (ids.has(row['ID'])) continue;
        ids.add(row['ID']);

        const isoDate = parseDateToISO(fechaStr);
        const cantCargaRaw = parseNumber(row['CANT_CARGA']);
        const cantidad = Math.abs(cantCargaRaw);
        const kmsHs = parseNumber(row['KMS/HS']);
        const kilometrosRec = parseNumber(row['KILOMETROS_REC']);
        const numOrden = (row['Nº DE ORDEN'] || row['NUMERO DE ORDEN'] || '').trim();

        const matchedIv = (numOrden && ivByVale.get(numOrden)) || ivByExpendioId.get(row['ID']);
        const eqCode = (row['CODIGO_EQUIPO'] || '').toUpperCase().trim();
        const matchedVeh = vehByCode.get(eqCode);
        const patente = (matchedIv && matchedIv.patente) || (matchedVeh && matchedVeh.patente) || '';

        const item = {
          id: row['ID'],
          valeId: matchedIv ? matchedIv.id : undefined,
          numVale: numOrden,
          numeroVale: numOrden,
          numOrden: numOrden,
          numComprobante: numOrden,
          carga: row['CARGA'] || 'TANQUE LLENO',
          tipoCarga: row['CARGA'] || 'TANQUE LLENO',
          tipo: row['TIPO'] || 'EGRESO',
          deposito: row['DEPOSITO'] || 'ESTACION DE SERVICIO',
          depositoOrigen: row['DEPOSITO'] || 'ESTACION DE SERVICIO',
          cantidad: cantidad,
          cantCarga: cantCargaRaw,
          tipoComb: (row['TIPO_COMB'] || '').trim() || 'DIESEL COMUN',
          tipoCombustible: (row['TIPO_COMB'] || '').trim() || 'DIESEL COMUN',
          codigoEmpleado: row['CODIGO_EMPLEADO'] || '',
          nombreApellido: row['NOMBRE_APELLIDO'] || row['NOMBRE_VIRTUAL'] || row['CODIGO_EMPLEADO'] || '',
          legajo: row['LEGAJO'] || '',
          codigoEquipo: row['CODIGO_EQUIPO'] || '',
          marcaModelo: row['MARCA_MODELO'] || row['CODIGO_EQUIPO'] || '',
          patente: patente,
          clasificacion: row['CLASIFICACION'] || '',
          fecha: isoDate,
          fechaEmision: isoDate,
          kilometraje: kmsHs,
          kmsHs: kmsHs,
          kilometrosRec: kilometrosRec,
          autonom: row['AUTONOM'] || '',
          autonomiaVt: row['AUTONOMIA_VT'] || '',
          numEstacion: row['NUM_ESTACION'] || '',
          fotoExpendio: row['FOTO_EXPENDIO'] || '',
          fotoKilometraje: row['FOTO_KILOMETRAJE'] || '',
          empresa: matchedIv ? matchedIv.empresa : 'LA HORMIGA',
          estado: matchedIv ? 'RENDIDO' : 'CARGADO',
        };

        expendios.push(item);
      }
    }
  }

  console.log(`[Expendio Import] Filtered ${expendios.length} expendios from June 2026 onwards.`);

  // Write local fallback collection
  if (!fs.existsSync('data/collections')) {
    fs.mkdirSync('data/collections', { recursive: true });
  }
  fs.writeFileSync('data/collections/fuel_vouchers.json', JSON.stringify(expendios, null, 2), 'utf8');
  console.log('[Expendio Import] data/collections/fuel_vouchers.json updated.');

  // Connect to Supabase
  console.log('[Expendio Import] Connecting to Supabase PostgreSQL...');
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    console.log('[Expendio Import] Connected to Supabase!');

    // Clean table to insert clean expendios
    await client.query('DELETE FROM fuel_vouchers;');

    // Batch insert
    const BATCH_SIZE = 50;
    for (let i = 0; i < expendios.length; i += BATCH_SIZE) {
      const chunk = expendios.slice(i, i + BATCH_SIZE);
      const valueRows = [];
      const params = [];
      let paramIdx = 1;

      for (const item of chunk) {
        valueRows.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW(), NOW())`);
        params.push(
          item.id,
          item.numVale || '',
          item.fecha || '',
          item.codigoEquipo || '',
          item.patente || '',
          item.depositoOrigen || item.deposito || '',
          item.tipoCombustible || item.tipoComb || '',
          item.cantidad || 0,
          item.kilometraje || 0,
          JSON.stringify(item)
        );
      }

      const query = `
        INSERT INTO fuel_vouchers (id, numero_vale, fecha, codigo_equipo, patente, deposito_origen, tipo_combustible, cantidad, kilometraje, data, created_at, updated_at)
        VALUES ${valueRows.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          numero_vale = EXCLUDED.numero_vale,
          fecha = EXCLUDED.fecha,
          codigo_equipo = EXCLUDED.codigo_equipo,
          patente = EXCLUDED.patente,
          deposito_origen = EXCLUDED.deposito_origen,
          tipo_combustible = EXCLUDED.tipo_combustible,
          cantidad = EXCLUDED.cantidad,
          kilometraje = EXCLUDED.kilometraje,
          data = EXCLUDED.data,
          updated_at = NOW();
      `;
      await client.query(query, params);
    }
    console.log('[Expendio Import] fuel_vouchers inserted successfully into Supabase.');

    const countFv = await client.query('SELECT COUNT(*) FROM fuel_vouchers;');
    console.log(`[Expendio Import] Supabase fuel_vouchers row count: ${countFv.rows[0].count}`);

    client.release();
  } finally {
    await pool.end();
  }

  console.log('[Expendio Import] Done!');
}

runImport().catch(err => {
  console.error('[Expendio Import] Error:', err);
  process.exit(1);
});
