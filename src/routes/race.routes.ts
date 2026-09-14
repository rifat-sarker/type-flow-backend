import { Router } from "express";
import { createRace, getRace } from "../controllers/race.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, createRace);
router.get("/:code", getRace);

export default router;
