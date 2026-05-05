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
      const { rows } = await client.query("SELECT * FROM productos WHERE activo = TRUE AND usuario_id = $1 ORDER BY nombre ASC", [userId]);
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { nombre, precio, stock, imagen_url } = req.body;
      const { rows } = await client.query(
        "INSERT INTO productos (nombre, precio, stock, imagen_url, usuario_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [nombre, precio, stock, imagen_url, userId]
      );
      return res.json(rows[0]);
    }

    if (req.method === 'PUT' && id) {
      const { nombre, precio, stock, imagen_url } = req.body;
      const { rows } = await client.query(
        "UPDATE productos SET nombre=$1, precio=$2, stock=$3, imagen_url=$4 WHERE id=$5 AND usuario_id=$6 RETURNING *",
        [nombre, precio, stock, imagen_url, id, userId]
      );
      return res.json(rows[0]);
    }

    if (req.method === 'DELETE' && id) {
      await client.query("UPDATE productos SET activo = FALSE WHERE id = $1 AND usuario_id = $2", [id, userId]);
      return res.json({ success: true });
    }

    res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
