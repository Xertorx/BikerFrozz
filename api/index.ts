import { createServerApp } from '../src/server_app';

let app: any = null;

export default async (req: any, res: any) => {
  if (!app) {
    app = await createServerApp();
  }
  return app(req, res);
};
