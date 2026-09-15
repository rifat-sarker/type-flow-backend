import { Router } from "express";
import { getProgress, completeLesson, getBadges } from "../controllers/lessons.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/progress", requireAuth, getProgress);
router.post("/complete", requireAuth, completeLesson);
router.get("/badges", requireAuth, getBadges);

export default router;
