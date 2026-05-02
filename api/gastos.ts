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

    if (req.method === 'GET') {
      const { rows } = await client.query("SELECT * FROM gastos ORDER BY fecha DESC");
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { categoria, monto, descripcion } = req.body;
      await client.query("INSERT INTO gastos (categoria, monto, descripcion) VALUES ($1, $2, $3)", [categoria, monto, descripcion]);
      return res.json({ success: true });
    }

    if (req.method === 'DELETE' && id) {
      await client.query("DELETE FROM gastos WHERE id = $1", [id]);
      return res.json({ success: true });
    }

    res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
