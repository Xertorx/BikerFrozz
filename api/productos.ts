import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool, initDb } from './_db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await initDb();
    const { id } = req.query;

    if (req.method === 'GET') {
      const { rows } = await pool.query("SELECT * FROM productos WHERE activo = TRUE ORDER BY nombre ASC");
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { nombre, precio, stock, imagen_url } = req.body;
      const { rows } = await pool.query(
        "INSERT INTO productos (nombre, precio, stock, imagen_url) VALUES ($1, $2, $3, $4) RETURNING id",
        [nombre, precio, stock, imagen_url]
      );
      return res.json({ id: rows[0].id });
    }

    if (req.method === 'PUT') {
      const { nombre, precio, stock, imagen_url } = req.body;
      await pool.query(
        "UPDATE productos SET nombre = $1, precio = $2, stock = $3, imagen_url = $4 WHERE id = $5",
        [nombre, precio, stock, imagen_url, id]
      );
      return res.json({ success: true });
    }

    if (req.method === 'DELETE') {
      await pool.query("UPDATE productos SET activo = FALSE WHERE id = $1", [id]);
      return res.json({ success: true });
    }

    res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
