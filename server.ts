import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { pool, initDb } from './api/_db';

async function startLocalServer() {
  const app = express();
  app.use(express.json());
  const PORT = Number(process.env.PORT) || 3000;

  // Sync DB
  await initDb();

  // API Routes (Manual replication of /api lambda logic)
  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
      const { rows } = await pool.query("SELECT * FROM usuarios WHERE username = $1 AND password = $2", [username, password]);
      if (rows.length > 0) return res.json({ success: true, user: rows[0] });
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

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
      const { rows } = await pool.query("INSERT INTO productos (nombre, precio, stock, imagen_url) VALUES ($1, $2, $3, $4) RETURNING id", [nombre, precio, stock, imagen_url]);
      res.json({ id: rows[0].id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/productos/:id', async (req, res) => {
    const { nombre, precio, stock, imagen_url } = req.body;
    try {
      await pool.query("UPDATE productos SET nombre = $1, precio = $2, stock = $3, imagen_url = $4 WHERE id = $5", [nombre, precio, stock, imagen_url, req.params.id]);
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
      const { rows } = await pool.query(`SELECT p.nombre, SUM(dv.cantidad) as total_vendido FROM detalle_ventas dv JOIN productos p ON dv.producto_id = p.id GROUP BY p.id, p.nombre ORDER BY total_vendido DESC`);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stats/daily', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT DATE(fecha) as date, SUM(total) as revenue FROM ventas GROUP BY DATE(fecha) ORDER BY date`);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/ventas', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("DELETE FROM detalle_ventas");
      await client.query("DELETE FROM ventas");
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Biker Frozz Development: http://localhost:${PORT}`);
  });
}

startLocalServer();
