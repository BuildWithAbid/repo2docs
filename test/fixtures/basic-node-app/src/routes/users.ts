import type { Express, Request, Response } from "express";
import { createUser, listUsers } from "../services/user-service";

/** Register user endpoints for the HTTP API. */
export function registerUserRoutes(app: Pick<Express, "get" | "post">): void {
  app.get("/users", (_request: Request, response: Response) => {
    response.json({ users: listUsers() });
  });

  app.post("/users", (request: Request, response: Response) => {
    const name = String(request.body?.name ?? "guest");
    response.status(201).json({ user: createUser(name) });
  });
}

