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
    if (req.method === 'GET') {
      const { rows } = await client.query("SELECT * FROM ventas ORDER BY fecha DESC");
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { total, metodo_pago, items } = req.body;
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
        await client.query(
          "UPDATE productos SET stock = stock - $1 WHERE id = $2",
          [item.cantidad, item.id]
        );
      }
      await client.query('COMMIT');
      return res.json({ id: ventaId });
    }

    if (req.method === 'DELETE') {
      await client.query('BEGIN');
      await client.query("DELETE FROM detalle_ventas");
      await client.query("DELETE FROM ventas");
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
