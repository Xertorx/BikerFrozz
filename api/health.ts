import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const client = await pool.connect();
    // Migraciones para tablas existentes
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT);
      CREATE TABLE IF NOT EXISTS sesiones_caja (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id),
        fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_cierre TIMESTAMP,
        monto_inicial REAL DEFAULT 0,
        monto_final REAL,
        total_ventas REAL DEFAULT 0,
        comentarios TEXT,
        estado TEXT DEFAULT 'abierta' -- 'abierta', 'cerrada'
      );

      DO $$ BEGIN
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
      
      -- Asignar registros huérfanos al administrador por defecto
      UPDATE productos SET usuario_id = (SELECT id FROM usuarios WHERE username = 'admin' LIMIT 1) WHERE usuario_id IS NULL;
      UPDATE ventas SET usuario_id = (SELECT id FROM usuarios WHERE username = 'admin' LIMIT 1) WHERE usuario_id IS NULL;
      UPDATE gastos SET usuario_id = (SELECT id FROM usuarios WHERE username = 'admin' LIMIT 1) WHERE usuario_id IS NULL;
    `);

    // Inicializar tablas si no existen
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT);
      CREATE TABLE IF NOT EXISTS productos (id SERIAL PRIMARY KEY, nombre TEXT, precio REAL, stock INTEGER, imagen_url TEXT, activo BOOLEAN DEFAULT TRUE, usuario_id INTEGER REFERENCES usuarios(id));
      CREATE TABLE IF NOT EXISTS ventas (id SERIAL PRIMARY KEY, fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP, total REAL, metodo_pago TEXT, usuario_id INTEGER REFERENCES usuarios(id));
      CREATE TABLE IF NOT EXISTS detalle_ventas (id SERIAL PRIMARY KEY, venta_id INTEGER REFERENCES ventas(id), producto_id INTEGER REFERENCES productos(id), cantidad INTEGER, subtotal REAL);
      CREATE TABLE IF NOT EXISTS gastos (id SERIAL PRIMARY KEY, fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP, categoria TEXT, monto REAL, descripcion TEXT, usuario_id INTEGER REFERENCES usuarios(id));
      INSERT INTO usuarios (username, password) VALUES ('admin', 'admin') ON CONFLICT (username) DO NOTHING;
      INSERT INTO usuarios (username, password) VALUES ('negocio2', 'clave123') ON CONFLICT (username) DO NOTHING;
    `);
    client.release();
    res.json({ status: 'ok', database: 'connected' });
  } catch (err: any) {
    res.status(503).json({ status: 'error', message: err.message });
  }
}
