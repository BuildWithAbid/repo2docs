import express from "express";
import { registerUserRoutes } from "./routes/users";

export function createApp() {
  const app = express();
  app.use(express.json());
  registerUserRoutes(app);
  return app;
}

export function startServer(port = Number(process.env.PORT ?? 3000)) {
  const app = createApp();
  return app.listen(port);
}

if (require.main === module) {
  startServer();
}

