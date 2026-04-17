import express from 'express';
import { Pool } from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

export async function createServerApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Database setup using PostgreSQL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  async function initDb() {
    try {
      const client = await pool.connect();
      console.log('PostgreSQL Connected successfully - Initializing tables');
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE,
          password TEXT
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS productos (
          id SERIAL PRIMARY KEY,
          nombre TEXT,
          precio REAL,
          stock INTEGER,
          imagen_url TEXT,
          activo BOOLEAN DEFAULT TRUE
        )
      `);

      await client.query("ALTER TABLE productos ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE");

      await client.query(`
        CREATE TABLE IF NOT EXISTS ventas (
          id SERIAL PRIMARY KEY,
          fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          total REAL,
          metodo_pago TEXT
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS detalle_ventas (
          id SERIAL PRIMARY KEY,
          venta_id INTEGER REFERENCES ventas(id),
          producto_id INTEGER REFERENCES productos(id),
          cantidad INTEGER,
          subtotal REAL
        )
      `);

      await client.query("INSERT INTO usuarios (username, password) VALUES ('admin', 'admin') ON CONFLICT (username) DO NOTHING");
      
      const { rows: productCount } = await client.query("SELECT COUNT(*) as count FROM productos");
      if (parseInt(productCount[0].count) === 0) {
        const seedProducts = [
          ["Granizado de Maracuyá", 8000, 50, "https://picsum.photos/seed/maracuya/400/400"],
          ["Granizado de Lulo", 8000, 50, "https://picsum.photos/seed/lulo/400/400"],
          ["Granizado de Fresa", 8000, 50, "https://picsum.photos/seed/strawberry/400/400"],
          ["Granizado de Limonada", 7000, 50, "https://picsum.photos/seed/lemon/400/400"],
          ["Granizado de Café (Frappé)", 9500, 40, "https://picsum.photos/seed/coffee/400/400"],
          ["Granizado de Mango Biche", 8500, 45, "https://picsum.photos/seed/mango/400/400"],
          ["Granizado con Ron", 12000, 30, "https://picsum.photos/seed/rum/400/400"],
          ["Granizado con Tequila", 14000, 25, "https://picsum.photos/seed/tequila/400/400"]
        ];

        for (const p of seedProducts) {
          await client.query("INSERT INTO productos (nombre, precio, stock, imagen_url) VALUES ($1, $2, $3, $4)", p);
        }
      }

      client.release();
      return true;
    } catch (err) {
      console.error('Database initialization error:', err);
      return false;
    }
  }

  if (process.env.DATABASE_URL) {
    initDb();
  }

  // Health check
  app.get('/api/health', async (req, res) => {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      res.json({ status: 'ok', database: 'connected' });
    } catch (err: any) {
      res.status(503).json({ status: 'error', database: 'disconnected', message: err.message });
    }
  });

  // Auth
  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ success: false, message: 'Base de datos no configurada.' });
    }

    const tryLogin = async () => {
      const { rows } = await pool.query("SELECT * FROM usuarios WHERE username = $1 AND password = $2", [username, password]);
      if (rows.length > 0) return { success: true, user: rows[0] };
      return { success: false, message: 'Usuario o contraseña incorrectos' };
    };

    try {
      const result = await tryLogin();
      if (result.success) {
        res.json(result);
      } else {
        res.status(401).json(result);
      }
    } catch (err: any) {
      const errorMsg = err.message || '';
      if (errorMsg.includes('does not exist') && (errorMsg.includes('usuarios') || errorMsg.includes('relation'))) {
        const inited = await initDb();
        if (inited) {
          const result = await tryLogin();
          if (result.success) return res.json(result);
          return res.status(401).json(result);
        }
      }
      res.status(500).json({ success: false, message: 'Error de base de datos', details: err.message });
    }
  });

  // All other API routes...
  app.get('/api/productos', async (req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM productos WHERE activo = TRUE ORDER BY nombre ASC");
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/productos', async (req, res) => {
    const { nombre, precio, stock, imagen_url } = req.body;
    try {
      const { rows } = await pool.query(
        "INSERT INTO productos (nombre, precio, stock, imagen_url) VALUES ($1, $2, $3, $4) RETURNING id",
        [nombre, precio, stock, imagen_url || "https://picsum.photos/seed/slushie/400/400"]
      );
      res.json({ id: rows[0].id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/productos/:id', async (req, res) => {
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

  app.delete('/api/productos/:id', async (req, res) => {
    try {
      await pool.query("UPDATE productos SET activo = FALSE WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/ventas', async (req, res) => {
    const { total, metodo_pago, items } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const saleRes = await client.query(
        "INSERT INTO ventas (total, metodo_pago) VALUES ($1, $2) RETURNING id",
        [total, metodo_pago]
      );
      const ventaId = saleRes.rows[0].id;
      for (const item of items) {
        await client.query(
          "INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, subtotal) VALUES ($1, $2, $3, $4)",
          [ventaId, item.id, item.cantidad, item.precio * item.cantidad]
        );
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

  app.get('/api/ventas', async (req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM ventas ORDER BY fecha DESC");
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stats/products', async (req, res) => {
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

  app.get('/api/stats/daily', async (req, res) => {
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

  return app;
}
