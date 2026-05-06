import { Pool } from 'pg';

// Configuración mínima y robusta para Vercel
// Lazy pool initialization to avoid crashing on boot if env vars are missing
let _pool: Pool | null = null;

export const getPool = () => {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      console.error('CRITICAL: DATABASE_URL is missing in environment variables');
      // Return a dummy pool or throw a descriptive error when used
    }
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5, // A bit more for concurrency but not too much
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
    
    _pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return _pool;
};

// For compatibility with existing imports
export const pool = new Proxy({} as Pool, {
  get: (target, prop: keyof Pool) => {
    const p = getPool();
    const val = p[prop];
    return typeof val === 'function' ? val.bind(p) : val;
  }
});

export async function initDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('DATABASE_URL no configurada, saltando initDb');
    return;
  }
  
  const currentPool = getPool();
  const client = await currentPool.connect();
  try {
    // Migraciones en orden correcto de dependencias
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY, 
        username TEXT UNIQUE, 
        password TEXT,
        nombre_negocio TEXT
      );
      
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY, 
        nombre TEXT, 
        precio REAL, 
        stock INTEGER, 
        imagen_url TEXT, 
        activo BOOLEAN DEFAULT TRUE, 
        usuario_id INTEGER REFERENCES usuarios(id)
      );

      CREATE TABLE IF NOT EXISTS clientes_activos (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id),
        nombre_cliente TEXT NOT NULL,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activo BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS items_cliente (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER REFERENCES clientes_activos(id),
        producto_id INTEGER REFERENCES productos(id),
        cantidad INTEGER NOT NULL,
        precio_unitario DECIMAL(10,2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sesiones_caja (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id),
        fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_cierre TIMESTAMP,
        monto_inicial REAL DEFAULT 0,
        monto_final REAL,
        total_ventas REAL DEFAULT 0,
        comentarios TEXT,
        estado TEXT DEFAULT 'abierta'
      );

      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY, 
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
        total REAL, 
        metodo_pago TEXT, 
        usuario_id INTEGER REFERENCES usuarios(id), 
        sesion_id INTEGER REFERENCES sesiones_caja(id)
      );

      CREATE TABLE IF NOT EXISTS detalle_ventas (
        id SERIAL PRIMARY KEY, 
        venta_id INTEGER REFERENCES ventas(id), 
        producto_id INTEGER REFERENCES productos(id), 
        cantidad INTEGER, 
        subtotal REAL,
        precio_unitario DECIMAL(10,2)
      );

      CREATE TABLE IF NOT EXISTS gastos (
        id SERIAL PRIMARY KEY, 
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
        categoria TEXT, 
        monto REAL, 
        descripcion TEXT, 
        usuario_id INTEGER REFERENCES usuarios(id)
      );
    `);

    // Actualizar esquemas para instalaciones previas
    await client.query(`
      DO $$ BEGIN
        -- Detalle Ventas: agregar precio_unitario si no existe
        IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'detalle_ventas') THEN
           ALTER TABLE detalle_ventas ADD COLUMN IF NOT EXISTS precio_unitario DECIMAL(10,2);
        END IF;
        
        -- Usuarios: agregar nombre_negocio
        IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'usuarios') THEN
          ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre_negocio TEXT;
        END IF;

        -- Productos: agregar usuario_id
        IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'productos') THEN
          ALTER TABLE productos ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id);
        END IF;

        -- Ventas: agregar usuario_id y sesion_id
        IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'ventas') THEN
          ALTER TABLE ventas ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id);
          ALTER TABLE ventas ADD COLUMN IF NOT EXISTS sesion_id INTEGER REFERENCES sesiones_caja(id);
        END IF;

        -- Gastos: agregar usuario_id
        IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'gastos') THEN
          ALTER TABLE gastos ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id);
        END IF;
      END $$;
    `);

    // Datos por defecto e integridad
    await client.query(`
      INSERT INTO usuarios (username, password) VALUES ('admin', 'admin') ON CONFLICT (username) DO NOTHING;
      INSERT INTO usuarios (username, password) VALUES ('negocio2', 'clave123') ON CONFLICT (username) DO NOTHING;
    `);

    const defaultAdmin = await client.query("SELECT id FROM usuarios WHERE username = 'admin' LIMIT 1");
    if (defaultAdmin.rows.length > 0) {
      const adminId = defaultAdmin.rows[0].id;
      await client.query("UPDATE productos SET usuario_id = $1 WHERE usuario_id IS NULL", [adminId]);
      await client.query("UPDATE ventas SET usuario_id = $1 WHERE usuario_id IS NULL", [adminId]);
      await client.query("UPDATE gastos SET usuario_id = $1 WHERE usuario_id IS NULL", [adminId]);
    }
  } finally {
    client.release();
  }
}
