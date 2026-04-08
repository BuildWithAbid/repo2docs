import express from "express";
import usersRouter from "./routes/users";

export function createApp() {
  const app = express();
  app.use("/api", usersRouter);
  return app;
}
