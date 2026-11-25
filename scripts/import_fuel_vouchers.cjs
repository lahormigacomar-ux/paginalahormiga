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
  console.log('[Import] Reading CSV file...');
  const csvPath = 'public/assets/aistudio/AppSheet.ViewData.2026-11-02_7f0a6470.csv';
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at ${csvPath}`);
  }

  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = null;
  const issuedVouchers = [];
  const fuelVouchers = [];

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

    const fechaStr = row['FECHA_EMISION'] || '';
    const parts = fechaStr.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);

      // Condition requested by user: "desde el mes 6 de 2026 en adelante"
      // Month 6 is June. Thus year === 2026 and month >= 6, or year > 2026
      if ((year === 2026 && month >= 6) || year > 2026) {
        const isoDate = parseDateToISO(fechaStr);
        const rawQty = parseFloat(row['CANTIDAD'] || '0');
        const qty = isNaN(rawQty) ? 0 : Math.abs(rawQty);
        const cantCarga = isNaN(rawQty) ? 0 : rawQty;

        const relatedExpendios = (row['Related ESPENDIO_COMBUSTIBLEs'] || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const primaryExpendioId = relatedExpendios[0] || ('EXP-' + row['ID']);

        // 1. Issued Voucher (Vales de Combustible)
        const iv = {
          id: row['ID'],
          numVale: row['NUM. COMPROBANTE'] || row['ID'],
          numComprobante: row['NUM. COMPROBANTE'] || '',
          fechaEmision: isoDate,
          fecha: isoDate,
          horaEmision: '08:00',
          codigoEquipo: row['CODIGO_EQUIPO'] || '',
          marcaModelo: row['MARCA_MODELO'] || row['CODIGO_EQUIPO'] || '',
          patente: row['PATENTE'] || '',
          codigoEmpleado: row['EMPLEADO'] || '',
          nombreApellido: row['NOMBRE_APELLIDO'] || row['EMPLEADO'] || '',
          tipoComb: row['COMBUSTIBLE'] || 'DIESEL INFINIA',
          litrosAutorizados: qty,
          cantidad: qty,
          tipoCarga: row['TIPO DE CARGA'] || 'Tanque Lleno',
          numEstacion: row['NUM_ESTACION'] || '',
          estacionSurtidor: row['NUM_ESTACION'] ? `Estación ${row['NUM_ESTACION']}` : 'Estación de Servicio',
          empresa: row['EMPRESA'] || 'LA HORMIGA',
          archivo: row['ARCHIVO'] || '',
          fileUrl: row['ARCHIVO'] || '',
          estado: 'RENDIDO',
          fechaRendicion: isoDate,
          observaciones: 'Importado de AppSheet VALES_COMBUSTIBLE',
          expendioId: primaryExpendioId,
        };
        issuedVouchers.push(iv);

        // 2. Fuel Dispensary Voucher (Expendio de Combustible)
        const fv = {
          id: primaryExpendioId,
          valeId: row['ID'],
          carga: row['TIPO DE CARGA'] || 'Tanque Lleno',
          tipoCarga: row['TIPO DE CARGA'] || 'Tanque Lleno',
          tipo: 'EGRESO',
          deposito: row['NUM_ESTACION'] ? `Estación ${row['NUM_ESTACION']}` : 'Estación de Servicio',
          depositoOrigen: row['NUM_ESTACION'] ? `Estación ${row['NUM_ESTACION']}` : 'Estación de Servicio',
          cantidad: qty,
          cantCarga: cantCarga,
          tipoComb: row['COMBUSTIBLE'] || 'DIESEL INFINIA',
          tipoCombustible: row['COMBUSTIBLE'] || 'DIESEL INFINIA',
          codigoEmpleado: row['EMPLEADO'] || '',
          nombreApellido: row['NOMBRE_APELLIDO'] || row['EMPLEADO'] || '',
          codigoEquipo: row['CODIGO_EQUIPO'] || '',
          marcaModelo: row['MARCA_MODELO'] || row['CODIGO_EQUIPO'] || '',
          patente: row['PATENTE'] || '',
          numOrden: row['NUM. COMPROBANTE'] || '',
          numComprobante: row['NUM. COMPROBANTE'] || '',
          numVale: row['NUM. COMPROBANTE'] || '',
          numeroVale: row['NUM. COMPROBANTE'] || '',
          fecha: isoDate,
          fechaEmision: isoDate,
          numEstacion: row['NUM_ESTACION'] || '',
          fotoExpendio: row['ARCHIVO'] || '',
          fotoKilometraje: '',
          archivo: row['ARCHIVO'] || '',
          fileUrl: row['ARCHIVO'] || '',
          empresa: row['EMPRESA'] || 'LA HORMIGA',
          estado: 'RENDIDO',
          kilometraje: 0,
        };
        fuelVouchers.push(fv);
      }
    }
  }

  console.log(`[Import] Filtered ${issuedVouchers.length} vouchers from June 2026 onwards.`);

  // Write to local fallback collections
  if (!fs.existsSync('data/collections')) {
    fs.mkdirSync('data/collections', { recursive: true });
  }
  fs.writeFileSync('data/collections/issued_vouchers.json', JSON.stringify(issuedVouchers, null, 2), 'utf8');
  fs.writeFileSync('data/collections/fuel_vouchers.json', JSON.stringify(fuelVouchers, null, 2), 'utf8');
  console.log('[Import] Local disk backups updated.');

  // Connect to Supabase
  console.log('[Import] Connecting to Supabase PostgreSQL...');
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    console.log('[Import] Connected to Supabase!');

    // 1. Batch upsert issued_vouchers
    console.log(`[Import] Upserting ${issuedVouchers.length} issued_vouchers...`);
    const BATCH_SIZE = 50;
    for (let i = 0; i < issuedVouchers.length; i += BATCH_SIZE) {
      const chunk = issuedVouchers.slice(i, i + BATCH_SIZE);
      const valueRows = [];
      const params = [];
      let paramIdx = 1;

      for (const item of chunk) {
        valueRows.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW(), NOW())`);
        params.push(
          item.id,
          item.numVale || '',
          item.fechaEmision || item.fecha || '',
          item.nombreApellido || item.codigoEmpleado || '',
          JSON.stringify(item)
        );
      }

      const query = `
        INSERT INTO issued_vouchers (id, numero_vale, fecha, destinatario, data, created_at, updated_at)
        VALUES ${valueRows.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          numero_vale = EXCLUDED.numero_vale,
          fecha = EXCLUDED.fecha,
          destinatario = EXCLUDED.destinatario,
          data = EXCLUDED.data,
          updated_at = NOW();
      `;
      await client.query(query, params);
    }
    console.log('[Import] issued_vouchers upserted successfully.');

    // 2. Batch upsert fuel_vouchers
    console.log(`[Import] Upserting ${fuelVouchers.length} fuel_vouchers...`);
    for (let i = 0; i < fuelVouchers.length; i += BATCH_SIZE) {
      const chunk = fuelVouchers.slice(i, i + BATCH_SIZE);
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
    console.log('[Import] fuel_vouchers upserted successfully.');

    // Verify row counts
    const countIv = await client.query('SELECT COUNT(*) FROM issued_vouchers;');
    const countFv = await client.query('SELECT COUNT(*) FROM fuel_vouchers;');
    console.log(`[Import] Supabase issued_vouchers count: ${countIv.rows[0].count}`);
    console.log(`[Import] Supabase fuel_vouchers count: ${countFv.rows[0].count}`);

    client.release();
  } finally {
    await pool.end();
  }

  console.log('[Import] All done!');
}

runImport().catch(err => {
  console.error('[Import] Error:', err);
  process.exit(1);
});
