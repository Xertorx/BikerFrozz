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
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({ error: 'No user ID provided' });
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [ingresosRes, gastosRes] = await Promise.all([
      client.query("SELECT SUM(total) as total FROM ventas WHERE fecha >= $1 AND usuario_id = $2", [monthStart, userId]),
      client.query("SELECT SUM(monto) as total FROM gastos WHERE fecha >= $1 AND usuario_id = $2", [monthStart, userId])
    ]);

    const ingresos = parseFloat(ingresosRes.rows[0].total || '0');
    const gastos = parseFloat(gastosRes.rows[0].total || '0');

    return res.json({
      ingresos,
      gastos,
      utilidad: ingresos - gastos,
      mes: monthStart.toLocaleString('es-ES', { month: 'long' })
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
