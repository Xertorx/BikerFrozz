import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool, initDb } from './_db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    await initDb();
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Faltan credenciales' });
    }

    const { rows } = await pool.query("SELECT * FROM usuarios WHERE username = $1 AND password = $2", [username, password]);
    if (rows.length > 0) return res.json({ success: true, user: rows[0] });
    res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
  } catch (err: any) {
    console.error("Login Error:", err);
    res.status(500).json({ 
      success: false, 
      message: 'Error en el servidor de base de datos', 
      debug: err.message 
    });
  }
}
