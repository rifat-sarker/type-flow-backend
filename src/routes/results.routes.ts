import { Router } from "express";
import { saveResult, myResults } from "../controllers/results.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, saveResult);
router.get("/me", requireAuth, myResults);

export default router;
