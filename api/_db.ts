import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

export async function initDb() {
  if (!process.env.DATABASE_URL) return;
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT
      );
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        nombre TEXT,
        precio REAL,
        stock INTEGER,
        imagen_url TEXT,
        activo BOOLEAN DEFAULT TRUE
      );
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;
      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total REAL,
        metodo_pago TEXT
      );
      CREATE TABLE IF NOT EXISTS detalle_ventas (
        id SERIAL PRIMARY KEY,
        venta_id INTEGER REFERENCES ventas(id),
        producto_id INTEGER REFERENCES productos(id),
        cantidad INTEGER,
        subtotal REAL
      );
      INSERT INTO usuarios (username, password) VALUES ('admin', 'admin') ON CONFLICT (username) DO NOTHING;
    `);
    client.release();
  } catch (e) {
    console.error("DB Init Error:", e);
  }
}
