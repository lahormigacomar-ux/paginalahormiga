import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let isInitialized = false;

// Supabase Project Ref: byqzxlrbggdnzvvoigge (US East - N. Virginia)
export const SUPABASE_PROJECT_REF = 'byqzxlrbggdnzvvoigge';
export const SUPABASE_URL = process.env.SUPABASE_URL || `https://${SUPABASE_PROJECT_REF}.supabase.co`;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5cXp4bHJiZ2dkbnp2dm9pZ2dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MzQ1NTAsImV4cCI6MjEwOTIxMDU1MH0.Cnf6UGaREquyptYb7ukppSKSRIPFHFUZwSXEeVaFk7E';

export function isCockroachClusterDisabled(): boolean {
  return false;
}

export function markClusterDisabled(_reason: string): void {
  // CockroachDB has been completely removed.
}

export function getConnectionString(): string | null {
  if (
    process.env.SUPABASE_DB_URL &&
    !process.env.SUPABASE_DB_URL.includes('cockroachlabs.cloud') &&
    !process.env.SUPABASE_DB_URL.includes(`db.${SUPABASE_PROJECT_REF}.supabase.co`)
  ) {
    return process.env.SUPABASE_DB_URL;
  }
  if (
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes('cockroachlabs.cloud') &&
    !process.env.DATABASE_URL.includes('elixir-dog') &&
    !process.env.DATABASE_URL.includes(`db.${SUPABASE_PROJECT_REF}.supabase.co`)
  ) {
    return process.env.DATABASE_URL;
  }
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || 'Bu4271879jxcyh';
  if (dbPassword) {
    const pwd = encodeURIComponent(dbPassword);
    // Use Supabase Supavisor IPv4 pooler (us-east-1) so both local and Vercel Serverless (IPv4-only) connect reliably
    return `postgresql://postgres.${SUPABASE_PROJECT_REF}:${pwd}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  }
  return null;
}

export function getDbPool(): pg.Pool | null {
  const connectionString = getConnectionString();
  if (!connectionString) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=disable')
        ? false
        : { rejectUnauthorized: false }, // Supabase PostgreSQL requires SSL
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });

    pool.on('error', (err) => {
      console.warn('Alerta en cliente PostgreSQL Supabase:', err?.message || err);
    });
  }

  return pool;
}

export async function checkDbConnection(): Promise<{ connected: boolean; message: string; version?: string; isLocalFallback?: boolean }> {
  const p = getDbPool();
  if (!p) {
    return { 
      connected: false, 
      isLocalFallback: true, 
      message: 'Supabase: Proyecto detectado (byqxxlrbggdnzvvoigge). Ingrese la contraseña de la BD o DATABASE_URL para conectar. Persistencia local activa.' 
    };
  }

  try {
    const res = await p.query('SELECT version();');
    return { 
      connected: true, 
      message: 'Conectado a Supabase (PostgreSQL) exitosamente',
      version: res.rows[0]?.version || 'PostgreSQL (Supabase)'
    };
  } catch (error: any) {
    return { 
      connected: false, 
      isLocalFallback: true, 
      message: `Supabase en espera: ${error?.message || 'Fallo de autenticación'}. Almacenamiento local activo sin pérdida de datos.` 
    };
  }
}

export async function initDatabaseSchema(): Promise<void> {
  if (isInitialized) return;
  const p = getDbPool();
  if (!p) return;

  try {
    console.log('Inicializando tablas en Supabase (PostgreSQL)...');

    // Execute schema creation in a single query batch to minimize Serverless RUs
    await p.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id VARCHAR(100) PRIMARY KEY,
        modelo_marca VARCHAR(255),
        patente VARCHAR(100),
        codigo_interno VARCHAR(100),
        clasificacion VARCHAR(100),
        estado VARCHAR(100),
        fotografia TEXT,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS fuel_vouchers (
        id VARCHAR(100) PRIMARY KEY,
        numero_vale VARCHAR(100),
        fecha VARCHAR(50),
        codigo_equipo VARCHAR(100),
        patente VARCHAR(100),
        deposito_origen VARCHAR(255),
        tipo_combustible VARCHAR(100),
        cantidad NUMERIC,
        kilometraje NUMERIC,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS partes_diarios (
        id VARCHAR(100) PRIMARY KEY,
        fecha VARCHAR(50),
        codigo_equipo VARCHAR(100),
        obra VARCHAR(255),
        chofer VARCHAR(255),
        horas_trabajadas NUMERIC,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS drivers (
        id VARCHAR(100) PRIMARY KEY,
        nombre_completo VARCHAR(255),
        dni VARCHAR(50),
        legajo VARCHAR(50),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS obras (
        id VARCHAR(100) PRIMARY KEY,
        nombre VARCHAR(255),
        ubicacion VARCHAR(255),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS fuel_deposits (
        id VARCHAR(100) PRIMARY KEY,
        nombre VARCHAR(255),
        capacidad_total NUMERIC,
        nivel_actual NUMERIC,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS issued_vouchers (
        id VARCHAR(100) PRIMARY KEY,
        numero_vale VARCHAR(100),
        fecha VARCHAR(50),
        destinatario VARCHAR(255),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rentals (
        id VARCHAR(100) PRIMARY KEY,
        numero_contrato VARCHAR(100),
        cliente VARCHAR(255),
        equipo_id VARCHAR(100),
        estado VARCHAR(100),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS hardware (
        id VARCHAR(100) PRIMARY KEY,
        codigo VARCHAR(100),
        nombre VARCHAR(255),
        categoria VARCHAR(100),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS aridos (
        id VARCHAR(100) PRIMARY KEY,
        material VARCHAR(255),
        unidad VARCHAR(100),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS stock_items (
        id VARCHAR(100) PRIMARY KEY,
        codigo VARCHAR(100),
        nombre VARCHAR(255),
        categoria VARCHAR(100),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id VARCHAR(100) PRIMARY KEY,
        item_id VARCHAR(100),
        tipo VARCHAR(50),
        fecha VARCHAR(50),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS stock_categories (
        id VARCHAR(100) PRIMARY KEY,
        nombre VARCHAR(255),
        slug VARCHAR(100),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS stock_warehouses (
        id VARCHAR(100) PRIMARY KEY,
        codigo VARCHAR(100),
        nombre VARCHAR(255),
        tipo VARCHAR(100),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vehicle_services (
        id VARCHAR(100) PRIMARY KEY,
        equipo_codigo VARCHAR(100),
        fecha VARCHAR(50),
        tipo_servicio VARCHAR(100),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vehicle_expenses (
        id VARCHAR(100) PRIMARY KEY,
        equipo_codigo VARCHAR(100),
        fecha VARCHAR(50),
        tipo_gasto VARCHAR(100),
        monto NUMERIC,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS arca_invoices (
        id VARCHAR(100) PRIMARY KEY,
        tipo_comprobante VARCHAR(50),
        punto_venta INT,
        numero_comprobante INT,
        fecha VARCHAR(50),
        cuit_emisor VARCHAR(50),
        receptor VARCHAR(255),
        cae VARCHAR(50),
        importe_total NUMERIC,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS arca_remitos (
        id VARCHAR(100) PRIMARY KEY,
        punto_venta INT,
        numero_comprobante INT,
        fecha VARCHAR(50),
        cuit_emisor VARCHAR(50),
        receptor VARCHAR(255),
        cuit_receptor VARCHAR(50),
        cai VARCHAR(50),
        estado_entrega VARCHAR(50),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS quotations (
        id VARCHAR(100) PRIMARY KEY,
        punto_venta INT,
        numero_comprobante INT,
        fecha_emision VARCHAR(50),
        receptor VARCHAR(255),
        cuit_receptor VARCHAR(50),
        importe_total NUMERIC,
        estado VARCHAR(50),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS caja_diaria (
        id VARCHAR(100) PRIMARY KEY,
        fecha VARCHAR(50),
        apertura NUMERIC,
        total_efectivo NUMERIC,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS proveedores (
        id VARCHAR(100) PRIMARY KEY,
        codigo VARCHAR(100),
        razon_social VARCHAR(255),
        cuit VARCHAR(50),
        condicion_iva VARCHAR(100),
        localidad VARCHAR(255),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id VARCHAR(100) PRIMARY KEY,
        nro_comprobante VARCHAR(100),
        fecha_emision VARCHAR(50),
        proveedor_id VARCHAR(100),
        proveedor_nombre VARCHAR(255),
        monto_total NUMERIC,
        estado VARCHAR(50),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS supplier_payments (
        id VARCHAR(100) PRIMARY KEY,
        numero_orden VARCHAR(100),
        fecha_pago VARCHAR(50),
        proveedor_id VARCHAR(100),
        monto_total NUMERIC,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(100) PRIMARY KEY,
        codigo VARCHAR(50),
        cuit VARCHAR(50),
        razon_social VARCHAR(255),
        condicion_iva VARCHAR(100),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS fuel_containers (
        id VARCHAR(100) PRIMARY KEY,
        codigo VARCHAR(50),
        titulo VARCHAR(255),
        proveedor_nombre VARCHAR(255),
        estado VARCHAR(50),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS accounting_accounts (
        id VARCHAR(100) PRIMARY KEY,
        codigo VARCHAR(50),
        nombre VARCHAR(255),
        rubro VARCHAR(50),
        subrubro VARCHAR(100),
        activa BOOLEAN DEFAULT TRUE,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS accounting_entries (
        id VARCHAR(100) PRIMARY KEY,
        fecha VARCHAR(50),
        concepto VARCHAR(255),
        origen VARCHAR(50),
        referencia_id VARCHAR(100),
        total NUMERIC,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cheques_cartera (
        id VARCHAR(100) PRIMARY KEY,
        numero_cheque VARCHAR(100),
        tipo VARCHAR(30),
        banco_emisor VARCHAR(120),
        fecha_cobro VARCHAR(50),
        importe NUMERIC,
        estado VARCHAR(50),
        cliente_nombre VARCHAR(255),
        proveedor_nombre VARCHAR(255),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS daily_schedules (
        id VARCHAR(100) PRIMARY KEY,
        fecha VARCHAR(50) NOT NULL,
        estado VARCHAR(50) NOT NULL DEFAULT 'BORRADOR',
        resumen_operativo TEXT,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS whatsapp_audio_logs (
        id VARCHAR(100) PRIMARY KEY,
        fecha VARCHAR(50) NOT NULL,
        sender_jid VARCHAR(100),
        sender_name VARCHAR(255),
        audio_url TEXT,
        transcripcion TEXT,
        schedule_id VARCHAR(100),
        estado VARCHAR(50) NOT NULL DEFAULT 'PROCESANDO',
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS truck_performance_trips (
        id VARCHAR(100) PRIMARY KEY,
        fecha VARCHAR(50),
        categoria_equipo VARCHAR(50),
        codigo_equipo VARCHAR(100),
        patente VARCHAR(100),
        chofer_nombre VARCHAR(255),
        lugar_inicio VARCHAR(255),
        lugar_final VARCHAR(255),
        kilometros NUMERIC,
        fuel_voucher_id VARCHAR(100),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    isInitialized = true;
    console.log('Esquema de tablas en Supabase verificado correctamente.');
  } catch (error: any) {
    console.warn('Esquema Supabase en espera:', error?.message);
  }
}

// Backward-compatible alias
export const initCockroachSchema = initDatabaseSchema;

