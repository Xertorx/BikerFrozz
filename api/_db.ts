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
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT);
      CREATE TABLE IF NOT EXISTS productos (id SERIAL PRIMARY KEY, nombre TEXT, precio REAL, stock INTEGER, imagen_url TEXT, activo BOOLEAN DEFAULT TRUE);
      CREATE TABLE IF NOT EXISTS ventas (id SERIAL PRIMARY KEY, fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP, total REAL, metodo_pago TEXT);
      CREATE TABLE IF NOT EXISTS detalle_ventas (id SERIAL PRIMARY KEY, venta_id INTEGER REFERENCES ventas(id), producto_id INTEGER REFERENCES productos(id), cantidad INTEGER, subtotal REAL);
      
      INSERT INTO usuarios (username, password) VALUES ('admin', 'admin') ON CONFLICT (username) DO NOTHING;
    `);
  } finally {
    client.release();
  }
}
