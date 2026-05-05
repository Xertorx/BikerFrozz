import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const client = await pool.connect();
  try {
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({ error: 'No user ID provided' });
    }

    if (req.method === 'GET') {
      const { rows } = await client.query("SELECT * FROM ventas WHERE usuario_id = $1 ORDER BY fecha DESC", [userId]);
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { total, metodo_pago, items } = req.body;
      await client.query('BEGIN');
      
      // Obtener la sesión activa
      const activeSession = await client.query(
        "SELECT id FROM sesiones_caja WHERE usuario_id = $1 AND estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1",
        [userId]
      );
      
      const sesionId = activeSession.rows.length > 0 ? activeSession.rows[0].id : null;

      const saleRes = await client.query(
        "INSERT INTO ventas (total, metodo_pago, usuario_id, sesion_id) VALUES ($1, $2, $3, $4) RETURNING id",
        [total, metodo_pago, userId, sesionId]
      );
      const ventaId = saleRes.rows[0].id;

      for (const item of items) {
        await client.query(
          "INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, subtotal) VALUES ($1, $2, $3, $4)",
          [ventaId, item.id, item.cantidad, item.precio * item.cantidad]
        );
        await client.query(
          "UPDATE productos SET stock = stock - $1 WHERE id = $2 AND usuario_id = $3",
          [item.cantidad, item.id, userId]
        );
      }
      await client.query('COMMIT');
      return res.json({ id: ventaId });
    }

    if (req.method === 'DELETE') {
      await client.query('BEGIN');
      // Delete details belonging to user's sales
      await client.query("DELETE FROM detalle_ventas WHERE venta_id IN (SELECT id FROM ventas WHERE usuario_id = $1)", [userId]);
      await client.query("DELETE FROM ventas WHERE usuario_id = $1", [userId]);
      await client.query('COMMIT');
      return res.json({ success: true });
    }

    res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    if (req.method === 'POST' || req.method === 'DELETE') await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
