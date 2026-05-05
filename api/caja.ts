import { VercelRequest, VercelResponse } from '@vercel/node';
import { pool, initDb } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const client = await pool.connect();
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'No user ID provided' });
    }

    await initDb();

    if (req.method === 'GET') {
      const { current, history } = req.query;

      if (current === 'true') {
        const { rows } = await client.query(
          "SELECT * FROM sesiones_caja WHERE usuario_id = $1 AND estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1",
          [userId]
        );
        return res.json(rows[0] || null);
      }

      if (history === 'true') {
        const { rows } = await client.query(
          "SELECT * FROM sesiones_caja WHERE usuario_id = $1 ORDER BY fecha_apertura DESC",
          [userId]
        );
        return res.json(rows);
      }
    }

    if (req.method === 'POST') {
      const { action } = req.body;

      if (action === 'open') {
        const { monto_inicial } = req.body;
        // Check if there is already an open session
        const openSession = await client.query(
          "SELECT id FROM sesiones_caja WHERE usuario_id = $1 AND estado = 'abierta'",
          [userId]
        );
        if (openSession.rows.length > 0) {
          return res.status(400).json({ error: 'Ya existe una sesión de caja abierta' });
        }

        const { rows } = await client.query(
          "INSERT INTO sesiones_caja (usuario_id, monto_inicial, estado) VALUES ($1, $2, 'abierta') RETURNING *",
          [userId, monto_inicial]
        );
        return res.json(rows[0]);
      }

      if (action === 'close') {
        const { session_id, monto_final, comentarios } = req.body;
        
        // Calculate total sales for this session
        const salesRes = await client.query(
          "SELECT SUM(total) as total FROM ventas WHERE sesion_id = $1",
          [session_id]
        );
        const total_ventas = parseFloat(salesRes.rows[0].total || '0');

        const { rows } = await client.query(
          "UPDATE sesiones_caja SET fecha_cierre = CURRENT_TIMESTAMP, monto_final = $1, total_ventas = $2, comentarios = $3, estado = 'cerrada' WHERE id = $4 AND usuario_id = $5 RETURNING *",
          [monto_final, total_ventas, comentarios, session_id, userId]
        );
        return res.json(rows[0]);
      }
    }

    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
