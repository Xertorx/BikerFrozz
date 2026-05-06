import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServer } from '../server';

let cachedApp: any = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!cachedApp) {
      console.log('Initializing Express app for Vercel...');
      cachedApp = await createServer();
    }
    return cachedApp(req, res);
  } catch (err: any) {
    console.error('SERVERLESS_BOOT_ERROR:', err);
    res.status(500).json({ 
      error: 'Failed to boot server', 
      details: err.message,
      stack: err.stack 
    });
  }
}
