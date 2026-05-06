import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { pool, initDb } from './api/_db';

// Ensure uploads directory exists (use /tmp for serverless if needed, but here we just try)
const uploadsDir = path.join(process.cwd(), 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create uploads directory, might be in a read-only environment:', e);
}

// Multer configuration: Use memory storage on Vercel/Production to avoid read-only filesystem issues
const storage = process.env.VERCEL 
  ? multer.memoryStorage() 
  : multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, 'uploads/');
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
      }
    });

const upload = multer({ storage: storage });

export async function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  const PORT = Number(process.env.PORT) || 3000;

  // Serve static uploads
  app.use('/uploads', express.static(uploadsDir));

  // Sync DB (Lazy and safe)
  if (process.env.DATABASE_URL) {
    // We don't await initDb here to avoid blocking the cold start response
    // Peticiones posteriores funcionarán una vez termine la migración
    initDb().then(() => {
      console.log('✅ Migración de base de datos completada en segundo plano');
    }).catch(err => {
      console.error('❌ Error en la migración de base de datos:', err);
    });
  } else {
    console.warn('⚠️ DATABASE_URL no está definida. Las peticiones a la API fallarán.');
  }

  // API Routes
  app.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', message: 'pong', timestamp: new Date().toISOString() });
  });

  app.get('/api/health', async (req, res) => {
    try {
      console.log('[API] Health check start');
      if (!process.env.DATABASE_URL) {
        return res.json({ status: 'warning', message: 'DATABASE_URL missing', env: 'vercel' });
      }
      
      const p = pool;
      const start = Date.now();
      await p.query('SELECT 1');
      const duration = Date.now() - start;
      
      console.log(`[API] Health check success (${duration}ms)`);
      res.json({ 
        database: 'connected', 
        status: 'ok', 
        env: process.env.VERCEL ? 'vercel' : 'local',
        latency: duration
      });
    } catch (err: any) {
      console.error('[API] Health check error:', err);
      res.status(500).json({ 
        database: 'error', 
        error: err.message,
        hint: 'Check if your database has SSL enabled or if credentials are correct.'
      });
    }
  });

  app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    if (process.env.VERCEL && req.file.buffer) {
      // In a real vercel app you'd upload this to S3/Cloudinary
      // For now, we'll return a base64 or just indicate it's in memory
      const base64 = req.file.buffer.toString('base64');
      return res.json({ imageUrl: `data:${req.file.mimetype};base64,${base64}` });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  });

  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
      const { rows } = await pool.query("SELECT id, username, nombre_negocio FROM usuarios WHERE username = $1 AND password = $2", [username, password]);
      if (rows.length > 0) return res.json({ success: true, user: rows[0] });
      res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/api/usuario', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { nombre_negocio, password } = req.body;
    try {
      if (password) {
        await pool.query("UPDATE usuarios SET nombre_negocio = $1, password = $2 WHERE id = $3", [nombre_negocio, password, userId]);
      } else {
        await pool.query("UPDATE usuarios SET nombre_negocio = $1 WHERE id = $2", [nombre_negocio, userId]);
      }
      const { rows } = await pool.query("SELECT id, username, nombre_negocio FROM usuarios WHERE id = $1", [userId]);
      res.json({ success: true, user: rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/caja', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { current, history } = req.query;
    try {
      if (current === 'true') {
        const { rows } = await pool.query(
          "SELECT * FROM sesiones_caja WHERE usuario_id = $1 AND estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1",
          [userId]
        );
        return res.json(rows[0] || null);
      }
      if (history === 'true') {
        const { rows } = await pool.query(
          "SELECT * FROM sesiones_caja WHERE usuario_id = $1 ORDER BY fecha_apertura DESC",
          [userId]
        );
        return res.json(rows);
      }
      res.status(400).json({ error: 'Faltan parámetros' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/caja', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { action } = req.body;
    try {
      if (action === 'open') {
        const { monto_inicial } = req.body;
        const openSession = await pool.query(
          "SELECT id FROM sesiones_caja WHERE usuario_id = $1 AND estado = 'abierta'",
          [userId]
        );
        if (openSession.rows.length > 0) return res.status(400).json({ error: 'Ya existe una sesión abierta' });

        const { rows } = await pool.query(
          "INSERT INTO sesiones_caja (usuario_id, monto_inicial, estado) VALUES ($1, $2, 'abierta') RETURNING *",
          [userId, monto_inicial]
        );
        return res.json(rows[0]);
      }
      if (action === 'close') {
        const { session_id, monto_final, comentarios } = req.body;
        const salesRes = await pool.query("SELECT SUM(total) as total FROM ventas WHERE sesion_id = $1", [session_id]);
        const total_ventas = parseFloat(salesRes.rows[0].total || '0');
        const { rows } = await pool.query(
          "UPDATE sesiones_caja SET fecha_cierre = CURRENT_TIMESTAMP, monto_final = $1, total_ventas = $2, comentarios = $3, estado = 'cerrada' WHERE id = $4 AND usuario_id = $5 RETURNING *",
          [monto_final, total_ventas, comentarios, session_id, userId]
        );
        return res.json(rows[0]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/productos', async (req, res) => {
    const userId = req.headers['x-user-id'];
    try {
      const { rows } = await pool.query("SELECT * FROM productos WHERE activo = TRUE AND usuario_id = $1 ORDER BY nombre ASC", [userId]);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/productos', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { nombre, precio, stock, imagen_url } = req.body;
    try {
      const { rows } = await pool.query("INSERT INTO productos (nombre, precio, stock, imagen_url, usuario_id) VALUES ($1, $2, $3, $4, $5) RETURNING id", [nombre, precio, stock, imagen_url, userId]);
      res.json({ id: rows[0].id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/productos', async (req, res) => {
    const { id } = req.query;
    const userId = req.headers['x-user-id'];
    const { nombre, precio, stock, imagen_url } = req.body;
    try {
      await pool.query("UPDATE productos SET nombre = $1, precio = $2, stock = $3, imagen_url = $4 WHERE id = $5 AND usuario_id = $6", [nombre, precio, stock, imagen_url, id, userId]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/productos', async (req, res) => {
    const { id } = req.query;
    const userId = req.headers['x-user-id'];
    try {
      await pool.query("UPDATE productos SET activo = FALSE WHERE id = $1 AND usuario_id = $2", [id, userId]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/ventas', async (req, res) => {
    const { total, metodo_pago, items } = req.body;
    const userId = req.headers['x-user-id'];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const activeSessionRes = await client.query(
        "SELECT id FROM sesiones_caja WHERE usuario_id = $1 AND estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1",
        [userId]
      );
      const sesionId = activeSessionRes.rows[0]?.id || null;

      const { rows } = await client.query(
        "INSERT INTO ventas (total, metodo_pago, usuario_id, sesion_id) VALUES ($1, $2, $3, $4) RETURNING id", 
        [total, metodo_pago, userId, sesionId]
      );
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

  app.get('/api/clientes', async (req, res) => {
    const userId = req.headers['x-user-id'];
    try {
      const { rows } = await pool.query(
        `SELECT c.*, COALESCE(SUM(i.cantidad * i.precio_unitario), 0) as total 
         FROM clientes_activos c 
         LEFT JOIN items_cliente i ON c.id = i.cliente_id 
         WHERE c.usuario_id = $1 AND c.activo = TRUE 
         GROUP BY c.id ORDER BY c.fecha_creacion DESC`, 
        [userId]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/clientes', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { nombre } = req.body;
    try {
      const { rows } = await pool.query(
        "INSERT INTO clientes_activos (usuario_id, nombre_cliente) VALUES ($1, $2) RETURNING *",
        [userId, nombre]
      );
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/clientes/:id/items', async (req, res) => {
    const { id } = req.params;
    try {
      const { rows } = await pool.query(
        `SELECT i.*, p.nombre 
         FROM items_cliente i 
         JOIN productos p ON i.producto_id = p.id 
         WHERE i.cliente_id = $1`,
        [id]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/clientes/:id/items', async (req, res) => {
    const { id } = req.params;
    const { producto_id, cantidad, precio_unitario } = req.body;
    try {
      // Verificar si ya existe el producto en la cuenta para sumar cantidad
      const existing = await pool.query(
        "SELECT * FROM items_cliente WHERE cliente_id = $1 AND producto_id = $2",
        [id, producto_id]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          "UPDATE items_cliente SET cantidad = cantidad + $1 WHERE id = $2",
          [cantidad, existing.rows[0].id]
        );
      } else {
        await pool.query(
          "INSERT INTO items_cliente (cliente_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)",
          [id, producto_id, cantidad, precio_unitario]
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/clientes/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query("UPDATE clientes_activos SET activo = FALSE WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/clientes/:id/vender', async (req, res) => {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    const { total, metodo_pago } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 1. Crear la venta principal
      const ventaRes = await client.query(
        "INSERT INTO ventas (usuario_id, total, metodo_pago) VALUES ($1, $2, $3) RETURNING id",
        [userId, total, metodo_pago]
      );
      const ventaId = ventaRes.rows[0].id;

      // 2. Mover items de la cuenta a la venta
      const itemsRes = await client.query("SELECT * FROM items_cliente WHERE cliente_id = $1", [id]);
      for (const item of itemsRes.rows) {
        await client.query(
          "INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)",
          [ventaId, item.producto_id, item.cantidad, item.precio_unitario]
        );
        // Descontar stock
        await client.query("UPDATE productos SET stock = stock - $1 WHERE id = $2", [item.cantidad, item.producto_id]);
      }

      // 3. Cerrar la cuenta del cliente
      await client.query("UPDATE clientes_activos SET activo = FALSE WHERE id = $1", [id]);
      
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
    const userId = req.headers['x-user-id'];
    try {
      const { rows } = await pool.query("SELECT * FROM ventas WHERE usuario_id = $1 ORDER BY fecha DESC", [userId]);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/detalles_venta', async (req, res) => {
    const userId = req.headers['x-user-id'];
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID de venta requerido' });

      const { rows } = await pool.query(`
        SELECT dv.*, p.nombre as producto_nombre 
        FROM detalle_ventas dv 
        JOIN productos p ON dv.producto_id = p.id 
        JOIN ventas v ON dv.venta_id = v.id
        WHERE dv.venta_id = $1 AND v.usuario_id = $2
      `, [id, userId]);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/reporte_detallado', async (req, res) => {
    const userId = req.headers['x-user-id'];
    try {
      const { rows } = await pool.query(`
        SELECT 
          v.id, 
          v.fecha, 
          v.total as total_venta, 
          v.metodo_pago,
          dv.cantidad,
          p.nombre as producto,
          dv.subtotal
        FROM ventas v
        JOIN detalle_ventas dv ON v.id = dv.venta_id
        JOIN productos p ON dv.producto_id = p.id
        WHERE v.usuario_id = $1
        ORDER BY v.fecha DESC
      `, [userId]);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/ventas/:id/detalles', async (req, res) => {
    const userId = req.headers['x-user-id'];
    try {
      const { rows } = await pool.query(`
        SELECT dv.*, p.nombre as producto_nombre 
        FROM detalle_ventas dv 
        JOIN productos p ON dv.producto_id = p.id 
        JOIN ventas v ON dv.venta_id = v.id
        WHERE dv.venta_id = $1 AND v.usuario_id = $2
      `, [req.params.id, userId]);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stats/products', async (req, res) => {
    const userId = req.headers['x-user-id'];
    try {
      const { rows } = await pool.query(`
        SELECT p.nombre, SUM(dv.cantidad) as total_vendido 
        FROM detalle_ventas dv 
        JOIN productos p ON dv.producto_id = p.id 
        WHERE p.usuario_id = $1
        GROUP BY p.id, p.nombre 
        ORDER BY total_vendido DESC
      `, [userId]);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stats/daily', async (req, res) => {
    const userId = req.headers['x-user-id'];
    try {
      const { rows } = await pool.query(`
        SELECT DATE(fecha) as date, SUM(total) as revenue 
        FROM ventas 
        WHERE usuario_id = $1
        GROUP BY DATE(fecha) 
        ORDER BY date
      `, [userId]);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/ventas', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Usuario no identificado' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Subquery to delete only user's details
      await client.query("DELETE FROM detalle_ventas WHERE venta_id IN (SELECT id FROM ventas WHERE usuario_id = $1)", [userId]);
      await client.query("DELETE FROM ventas WHERE usuario_id = $1", [userId]);
      await client.query('COMMIT');
      res.json({ success: true, message: 'Historial de ventas eliminado para el usuario' });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // Gastos API
  app.get('/api/gastos', async (req, res) => {
    const userId = req.headers['x-user-id'];
    try {
      const { rows } = await pool.query("SELECT * FROM gastos WHERE usuario_id = $1 ORDER BY fecha DESC", [userId]);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/gastos', async (req, res) => {
    const { categoria, monto, descripcion } = req.body;
    const userId = req.headers['x-user-id'];
    try {
      await pool.query("INSERT INTO gastos (categoria, monto, descripcion, usuario_id) VALUES ($1, $2, $3, $4)", [categoria, monto, descripcion, userId]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/gastos', async (req, res) => {
    const { id } = req.query;
    const userId = req.headers['x-user-id'];
    try {
      await pool.query("DELETE FROM gastos WHERE id = $1 AND usuario_id = $2", [id, userId]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Balance API
  app.get('/api/balance', async (req, res) => {
    const userId = req.headers['x-user-id'];
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [ingresosRes, gastosRes] = await Promise.all([
        pool.query("SELECT SUM(total) as total FROM ventas WHERE fecha >= $1 AND usuario_id = $2", [monthStart, userId]),
        pool.query("SELECT SUM(monto) as total FROM gastos WHERE fecha >= $1 AND usuario_id = $2", [monthStart, userId])
      ]);

      const ingresos = parseFloat(ingresosRes.rows[0].total || '0');
      const gastos = parseFloat(gastosRes.rows[0].total || '0');

      res.json({
        ingresos,
        gastos,
        utilidad: ingresos - gastos,
        mes: monthStart.toLocaleString('es-ES', { month: 'long' })
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Global Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('[EXPRESS_ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Unhandled Internal Error', 
        message: err.message 
      });
    }
  });

  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Biker Frozz Development: http://localhost:${PORT}`);
    });
  }

  return app;
}

if (!process.env.VERCEL) {
  createServer();
}
