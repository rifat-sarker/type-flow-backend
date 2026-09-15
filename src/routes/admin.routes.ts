import { Router } from "express";
import { getStats, listUsers, setUserRole, deleteUser } from "../controllers/admin.controller";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// Every admin route sits behind both gates.
router.use(requireAuth, requireAdmin);

router.get("/stats", getStats);
router.get("/users", listUsers);
router.patch("/users/role", setUserRole);
router.delete("/users/:userId", deleteUser);

export default router;
