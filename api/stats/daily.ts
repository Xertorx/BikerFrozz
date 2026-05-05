import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool, initDb } from '../_db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });
  await initDb();

  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'No user ID provided' });
  }

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
}
