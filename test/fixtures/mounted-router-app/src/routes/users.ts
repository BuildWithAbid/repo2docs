import { Router } from "express";

const router = Router();

router.get("/users", listUsers);
router.post("/users", createUser);

export function listUsers() {
  return [];
}

export function createUser() {
  return { created: true };
}

export default router;
