import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import apiHandler from './api/index';

async function startLocalServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Mount the same API handler used in Vercel
  app.use(apiHandler);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Biker Frozz Local: http://localhost:${PORT}`);
  });
}

startLocalServer();
