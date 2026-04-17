import { Pool } from 'pg';

// Vercel auto-populates process.env, no need for dotenv here.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

let isInitialized = false;

export async function initDb() {
  if (isInitialized || !process.env.DATABASE_URL) return;
  
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT);
      CREATE TABLE IF NOT EXISTS productos (id SERIAL PRIMARY KEY, nombre TEXT, precio REAL, stock INTEGER, imagen_url TEXT, activo BOOLEAN DEFAULT TRUE);
      CREATE TABLE IF NOT EXISTS ventas (id SERIAL PRIMARY KEY, fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP, total REAL, metodo_pago TEXT);
      CREATE TABLE IF NOT EXISTS detalle_ventas (id SERIAL PRIMARY KEY, venta_id INTEGER REFERENCES ventas(id), producto_id INTEGER REFERENCES productos(id), cantidad INTEGER, subtotal REAL);
      INSERT INTO usuarios (username, password) VALUES ('admin', 'admin') ON CONFLICT (username) DO NOTHING;
    `);
    isInitialized = true;
  } catch (e) {
    console.error("DB Init error", e);
  } finally {
    client.release();
  }
}
