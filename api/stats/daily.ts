import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool, initDb } from '../_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });
  await initDb();

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
}
