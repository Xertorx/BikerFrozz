import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverless from 'serverless-http';
import { createServer } from '../server';

let cachedHandler: any = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!cachedHandler) {
      console.log('Initializing Express app for Vercel...');
      const app = await createServer();
      cachedHandler = serverless(app);
    }
    
    // Serverless-http expects a lambda-style event/context or standard Node req/res.
    // Vercel handlers are already very close to Node req/res.
    // However, serverless-http handles the promise mapping correctly.
    return cachedHandler(req, res);
  } catch (err: any) {
    console.error('SERVERLESS_BOOT_ERROR:', err);
    res.status(500).json({ 
      error: 'Failed to boot server', 
      details: err.message,
      stack: err.stack 
    });
  }
}
