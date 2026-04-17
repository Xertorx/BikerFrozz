import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createServerApp } from './src/server_app';

async function startLocalServer() {
  const app = await createServerApp();
  const PORT = Number(process.env.PORT) || 3000;

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
    console.log(`Biker Frozz Local Server: http://localhost:${PORT}`);
  });
}

// Only run if locally or explicitly starting a server process
if (process.env.NODE_ENV !== 'test') {
  startLocalServer();
}
