import { Pool } from 'pg';

// Configuración mínima y robusta para Vercel
const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 15000, // Darle más tiempo para despertar
  idleTimeoutMillis: 30000,
});

export async function initDb() {
  if (!connectionString) {
    throw new Error('DATABASE_URL no configurada en las variables de entorno de Vercel');
  }
  
  const client = await pool.connect();
  try {
    // Migraciones para tablas existentes
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY, 
        username TEXT UNIQUE, 
        password TEXT,
        nombre_negocio TEXT
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
    `);

    // Actualizar tablas existentes si existen
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'usuarios') THEN
          ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre_negocio TEXT;
        END IF;
        IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'productos') THEN
          ALTER TABLE productos ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id);
        END IF;
        IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'ventas') THEN
          ALTER TABLE ventas ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id);
          ALTER TABLE ventas ADD COLUMN IF NOT EXISTS sesion_id INTEGER REFERENCES sesiones_caja(id);
        END IF;
        IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'gastos') THEN
          ALTER TABLE gastos ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id);
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS productos (id SERIAL PRIMARY KEY, nombre TEXT, precio REAL, stock INTEGER, imagen_url TEXT, activo BOOLEAN DEFAULT TRUE, usuario_id INTEGER REFERENCES usuarios(id));
      CREATE TABLE IF NOT EXISTS ventas (id SERIAL PRIMARY KEY, fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP, total REAL, metodo_pago TEXT, usuario_id INTEGER REFERENCES usuarios(id), sesion_id INTEGER REFERENCES sesiones_caja(id));
      CREATE TABLE IF NOT EXISTS detalle_ventas (id SERIAL PRIMARY KEY, venta_id INTEGER REFERENCES ventas(id), producto_id INTEGER REFERENCES productos(id), cantidad INTEGER, subtotal REAL);
      CREATE TABLE IF NOT EXISTS gastos (id SERIAL PRIMARY KEY, fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP, categoria TEXT, monto REAL, descripcion TEXT, usuario_id INTEGER REFERENCES usuarios(id));
      
      INSERT INTO usuarios (username, password) VALUES ('admin', 'admin') ON CONFLICT (username) DO NOTHING;
      INSERT INTO usuarios (username, password) VALUES ('negocio2', 'clave123') ON CONFLICT (username) DO NOTHING;
    `);

    const productosUpdate = await client.query("UPDATE productos SET usuario_id = (SELECT id FROM usuarios WHERE username = 'admin' LIMIT 1) WHERE usuario_id IS NULL");
    const ventasUpdate = await client.query("UPDATE ventas SET usuario_id = (SELECT id FROM usuarios WHERE username = 'admin' LIMIT 1) WHERE usuario_id IS NULL");
    const gastosUpdate = await client.query("UPDATE gastos SET usuario_id = (SELECT id FROM usuarios WHERE username = 'admin' LIMIT 1) WHERE usuario_id IS NULL");
    console.log(`Migración: Prod(${productosUpdate.rowCount}), Ventas(${ventasUpdate.rowCount}), Gastos(${gastosUpdate.rowCount})`);
  } finally {
    client.release();
  }
}
