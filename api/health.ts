import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool, initDb } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await initDb();
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ status: 'ok', database: 'connected', message: 'Biker Frozz API is health' });
  } catch (err: any) {
    res.status(503).json({ status: 'error', database: 'disconnected', message: err.message });
  }
}
