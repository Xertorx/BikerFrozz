import express from 'express';
import { Pool } from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function initDb() {
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
    
    const { rows } = await client.query("SELECT COUNT(*) FROM productos");
    if (parseInt(rows[0].count) === 0) {
      const seed = [
        ["Raspado de Maracuyá", 8000, 50, "https://picsum.photos/seed/shavedice_maracuya/400/400"],
        ["Raspado de Lulo", 8000, 50, "https://picsum.photos/seed/shavedice_lulo/400/400"],
        ["Raspado de Fresa", 8000, 50, "https://picsum.photos/seed/shavedice_strawberry/400/400"]
      ];
      for (const p of seed) {
        await client.query("INSERT INTO productos (nombre, precio, stock, imagen_url) VALUES ($1, $2, $3, $4)", p);
      }
    }
    client.release();
  } catch (e) {
    console.error("DB Init Error:", e);
  }
}

// Initial DB check
initDb();

const api = express.Router();

api.get('/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ status: 'ok', db: 'connected' });
  } catch (err: any) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

api.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await pool.query("SELECT * FROM usuarios WHERE username = $1 AND password = $2", [username, password]);
    if (rows.length > 0) return res.json({ success: true, user: rows[0] });
    res.status(401).json({ success: false, message: 'Credenciales inválidas' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

api.get('/productos', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM productos WHERE activo = TRUE ORDER BY nombre ASC");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

api.post('/productos', async (req, res) => {
  const { nombre, precio, stock, imagen_url } = req.body;
  try {
    const { rows } = await pool.query(
      "INSERT INTO productos (nombre, precio, stock, imagen_url) VALUES ($1, $2, $3, $4) RETURNING id",
      [nombre, precio, stock, imagen_url]
    );
    res.json({ id: rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

api.put('/productos/:id', async (req, res) => {
  const { nombre, precio, stock, imagen_url } = req.body;
  try {
    await pool.query(
      "UPDATE productos SET nombre = $1, precio = $2, stock = $3, imagen_url = $4 WHERE id = $5",
      [nombre, precio, stock, imagen_url, req.params.id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

api.delete('/productos/:id', async (req, res) => {
  try {
    await pool.query("UPDATE productos SET activo = FALSE WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

api.post('/ventas', async (req, res) => {
  const { total, metodo_pago, items } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query("INSERT INTO ventas (total, metodo_pago) VALUES ($1, $2) RETURNING id", [total, metodo_pago]);
    const ventaId = rows[0].id;
    for (const item of items) {
      await client.query("INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, subtotal) VALUES ($1, $2, $3, $4)", [ventaId, item.id, item.cantidad, item.precio * item.cantidad]);
      await client.query("UPDATE productos SET stock = stock - $1 WHERE id = $2", [item.cantidad, item.id]);
    }
    await client.query('COMMIT');
    res.json({ success: true, ventaId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

api.get('/ventas', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ventas ORDER BY fecha DESC");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

api.get('/stats/products', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.nombre, SUM(dv.cantidad) as total_vendido
      FROM detalle_ventas dv
      JOIN productos p ON dv.producto_id = p.id
      GROUP BY p.id, p.nombre
      ORDER BY total_vendido DESC
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

api.get('/stats/daily', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DATE(fecha) as date, SUM(total) as revenue
      FROM ventas
      GROUP BY DATE(fecha)
      ORDER BY date
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Handle both /api prefix and direct access
app.use('/api', api);
app.use('/', api);

export default app;
