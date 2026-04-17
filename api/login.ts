import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool, initDb } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  await initDb();
  const { username, password } = req.body;

  try {
    const { rows } = await pool.query("SELECT * FROM usuarios WHERE username = $1 AND password = $2", [username, password]);
    if (rows.length > 0) return res.json({ success: true, user: rows[0] });
    res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Error de servidor', details: err.message });
  }
}
