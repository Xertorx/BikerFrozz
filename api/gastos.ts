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
    const { id } = req.query;
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({ error: 'No user ID provided' });
    }

    if (req.method === 'GET') {
      const { rows } = await client.query("SELECT * FROM gastos WHERE usuario_id = $1 ORDER BY fecha DESC", [userId]);
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { categoria, monto, descripcion } = req.body;
      await client.query("INSERT INTO gastos (categoria, monto, descripcion, usuario_id) VALUES ($1, $2, $3, $4)", [categoria, monto, descripcion, userId]);
      return res.json({ success: true });
    }

    if (req.method === 'DELETE' && id) {
      await client.query("DELETE FROM gastos WHERE id = $1 AND usuario_id = $2", [id, userId]);
      return res.json({ success: true });
    }

    res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
