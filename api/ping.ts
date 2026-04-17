import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.json({ 
    pong: true, 
    time: new Date().toISOString(),
    env: process.env.NODE_ENV,
    db_config_present: !!process.env.DATABASE_URL
  });
}
