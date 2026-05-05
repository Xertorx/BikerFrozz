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
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID de venta requerido' });

      // Check if sale belongs to user
      const saleCheck = await client.query("SELECT id FROM ventas WHERE id = $1 AND usuario_id = $2", [id, userId]);
      if (saleCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Acceso denegado' });
      }

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
