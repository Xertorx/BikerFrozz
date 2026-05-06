import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServer } from '../server';

let cachedApp: any = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!cachedApp) {
      console.log('[BOOT] Initializing Express app...');
      cachedApp = await createServer();
      console.log('[BOOT] App initialized successfully');
    }
    
    // We wrap in a promise to ensure Vercel waits if it's not doing so automatically
    // Although for Express on Vercel, simply calling cachedApp(req, res) usually suffices
    // as Vercel's res object is a Node ServerResponse.
    return new Promise((resolve, reject) => {
      // res.on('finish') is a standard Node event that happens when the response is sent
      res.on('finish', resolve);
      res.on('error', reject);
      
      try {
        cachedApp(req, res);
      } catch (e) {
        reject(e);
      }
    });
  } catch (err: any) {
    console.error('[BOOT_ERROR] Critical failure:', err);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Critical Server Error', 
        message: err.message,
        env: process.env.VERCEL ? 'vercel' : 'local'
      });
    }
  }
}
