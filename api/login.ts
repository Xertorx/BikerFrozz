import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const { username, password } = req.body;
    const client = await pool.connect();
    try {
      const { rows } = await client.query("SELECT * FROM usuarios WHERE username = $1 AND password = $2", [username, password]);
      if (rows.length > 0) {
        return res.json({ success: true });
      }
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
