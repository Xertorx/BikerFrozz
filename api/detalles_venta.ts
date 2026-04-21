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
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID de venta requerido' });

      const { rows } = await client.query(`
        SELECT dv.*, p.nombre as producto_nombre 
        FROM detalle_ventas dv 
        JOIN productos p ON dv.producto_id = p.id 
        WHERE dv.venta_id = $1
      `, [id]);
      return res.json(rows);
    }

    res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
