import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import apiApp from './api/server';

async function startLocalServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Use the API logic
  app.use(apiApp);

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
    console.log(`Biker Frozz Development Server: http://localhost:${PORT}`);
  });
}

startLocalServer();
