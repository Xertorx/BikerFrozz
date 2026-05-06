import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServer } from '../server.js';

let cachedApp: any = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!cachedApp) {
      cachedApp = await createServer();
    }
    return cachedApp(req, res);
  } catch (err: any) {
    console.error('[BOOT_ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server Boot Error', message: err.message });
    }
  }
}
