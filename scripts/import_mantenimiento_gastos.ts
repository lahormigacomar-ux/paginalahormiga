import fs from 'fs';
import { getDbPool, initDatabaseSchema } from '../server/db';
import {
  parseCsvString,
  getSmartColumnMapping,
  transformImportedRows,
} from '../src/services/importExportService';

const CSV_PATH = 'public/assets/aistudio/MANTENIMIENTO_ac965cdb';

async function runImport() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`No se encontró el archivo CSV en ${CSV_PATH}`);
  }

  const pool = getDbPool();
  if (!pool) {
    throw new Error('No se pudo obtener el pool de conexión a Supabase PostgreSQL.');
  }

  await initDatabaseSchema();

  console.log('[Import Mantenimiento] Leyendo flota y empleados desde Supabase...');
  const [vehRes, drvRes] = await Promise.all([
    pool.query('SELECT data FROM vehicles;'),
    pool.query('SELECT data FROM drivers;'),
  ]);
  const fleet = vehRes.rows.map((r: any) => r.data).filter(Boolean);
  const employees = drvRes.rows.map((r: any) => r.data).filter(Boolean);
  console.log(`[Import Mantenimiento] Flota cargada: ${fleet.length} | Empleados: ${employees.length}`);

  console.log(`[Import Mantenimiento] Parseando ${CSV_PATH}...`);
  const rawCsv = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsvString(rawCsv);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const mapping = getSmartColumnMapping('gastosMantenimiento', headers);

  const transformed = transformImportedRows(
    'gastosMantenimiento',
    rows,
    [],
    'merge',
    mapping,
    {
      fleet,
      employees,
      dateOrder: 'dmy',
    }
  );

  if (transformed.errors.length > 0) {
    console.warn('[Import Mantenimiento] Advertencias durante transformación:', transformed.errors.slice(0, 10));
  }

  const items = transformed.validItems;
  console.log(`[Import Mantenimiento] Filas transformadas listas para Supabase: ${items.length}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const BATCH_SIZE = 50;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      const valueRows: string[] = [];
      const params: any[] = [];
      let pIdx = 1;

      for (const item of chunk) {
        const equipoCodigo = item.equipoPatenteOrCodigo || item.equipoCodigo || item.equipoId || '';
        const fecha = item.fecha || '';
        const tipoGasto = item.subcategoriaOriginal || item.categoria || item.tipoGasto || '';
        const monto = Number(item.montoTotal ?? item.monto ?? 0);

        valueRows.push(
          `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}::jsonb, NOW(), NOW())`
        );
        params.push(
          String(item.id),
          String(equipoCodigo),
          String(fecha),
          String(tipoGasto),
          Number.isFinite(monto) ? monto : 0,
          JSON.stringify(item)
        );
      }

      const sql = `
        INSERT INTO vehicle_expenses (id, equipo_codigo, fecha, tipo_gasto, monto, data, created_at, updated_at)
        VALUES ${valueRows.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          equipo_codigo = EXCLUDED.equipo_codigo,
          fecha = EXCLUDED.fecha,
          tipo_gasto = EXCLUDED.tipo_gasto,
          monto = EXCLUDED.monto,
          data = EXCLUDED.data,
          updated_at = NOW();
      `;
      await client.query(sql, params);
    }

    await client.query('COMMIT');

    const countRes = await pool.query('SELECT COUNT(*) AS total FROM vehicle_expenses;');
    const incompRes = await pool.query(
      "SELECT COUNT(*) AS total FROM vehicle_expenses WHERE data->'camposIncompletos' IS NOT NULL AND jsonb_array_length(data->'camposIncompletos') > 0;"
    );
    const sumRes = await pool.query('SELECT COALESCE(SUM(monto), 0) AS suma_total FROM vehicle_expenses;');

    console.log('[Import Mantenimiento] Confirmado en Supabase PostgreSQL:');
    console.log({
      totalEnSupabase: Number(countRes.rows[0].total),
      incompletosPreservados: Number(incompRes.rows[0].total),
      sumaTotalPesos: Number(sumRes.rows[0].suma_total),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runImport().catch((err) => {
  console.error('[Import Mantenimiento] Error fatal:', err);
  process.exit(1);
});
