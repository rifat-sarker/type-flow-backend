import { Router } from "express";
import { saveResult, myResults, getWeakKeys } from "../controllers/results.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, saveResult);
router.get("/me", requireAuth, myResults);

router.get("/weak-keys", requireAuth, getWeakKeys);

export default router;
