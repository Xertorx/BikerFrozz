import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServer } from '../server';

let cachedApp: any = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cachedApp) {
    cachedApp = await createServer();
  }
  return cachedApp(req, res);
}
