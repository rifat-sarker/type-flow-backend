import { Router } from "express";
import {
  listFriends,
  searchUsers,
  sendRequest,
  respondRequest,
  removeFriend,
  friendsLeaderboard,
} from "../controllers/friends.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", listFriends);
router.get("/search", searchUsers);
router.get("/leaderboard", friendsLeaderboard);
router.post("/request", sendRequest);
router.post("/respond", respondRequest);
router.delete("/:userId", removeFriend);

export default router;
