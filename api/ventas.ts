import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool, initDb } from './_db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await initDb();

    if (req.method === 'GET') {
      const { rows } = await pool.query("SELECT * FROM ventas ORDER BY fecha DESC");
      return res.json(rows);
    }

    if (req.method === 'POST') {
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
        throw err;
      } finally {
        client.release();
      }
      return;
    }

    if (req.method === 'DELETE') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("DELETE FROM detalle_ventas");
        await client.query("DELETE FROM ventas");
        await client.query('COMMIT');
        return res.json({ success: true });
      } catch (err: any) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
