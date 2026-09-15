import mongoose from "mongoose";
import { User } from "../models/User";
import { TestResult } from "../models/TestResult";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";

export const listFriends = asyncHandler(async (req: AuthedRequest, res) => {
  const user = await User.findById(req.user!.userId)
    .populate("friends", "username bestWpm")
    .populate("friendRequests", "username bestWpm");
  if (!user) throw new ApiError(404, "User not found");

  res.json({ friends: user.friends, requests: user.friendRequests });
});

export const searchUsers = asyncHandler(async (req: AuthedRequest, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json({ users: [] });

  const me = await User.findById(req.user!.userId).select("friends friendRequests");
  const exclude = [
    new mongoose.Types.ObjectId(req.user!.userId),
    ...(me?.friends ?? []),
  ];

  const users = await User.find({
    username: { $regex: q, $options: "i" },
    _id: { $nin: exclude },
  })
    .select("username bestWpm")
    .limit(10)
    .lean();

  res.json({ users });
});

export const sendRequest = asyncHandler(async (req: AuthedRequest, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId || !mongoose.isValidObjectId(userId)) throw new ApiError(400, "A valid userId is required");
  if (userId === req.user!.userId) throw new ApiError(400, "You can't friend yourself");

  const target = await User.findById(userId);
  if (!target) throw new ApiError(404, "User not found");

  const meId = new mongoose.Types.ObjectId(req.user!.userId);
  if (target.friends.some((f) => f.equals(meId))) throw new ApiError(409, "Already friends");

  // $addToSet so spamming the button doesn't stack duplicate requests.
  await User.findByIdAndUpdate(userId, { $addToSet: { friendRequests: meId } });
  res.json({ message: "Request sent." });
});

export const respondRequest = asyncHandler(async (req: AuthedRequest, res) => {
  const { userId, accept } = req.body as { userId?: string; accept?: boolean };
  if (!userId || !mongoose.isValidObjectId(userId)) throw new ApiError(400, "A valid userId is required");

  const meId = new mongoose.Types.ObjectId(req.user!.userId);
  const me = await User.findById(meId);
  if (!me) throw new ApiError(404, "User not found");
  if (!me.friendRequests.some((r) => r.equals(userId))) throw new ApiError(404, "No such request");

  await User.findByIdAndUpdate(meId, { $pull: { friendRequests: userId } });
  if (accept) {
    // Friendship is mutual, so write both sides.
    await User.findByIdAndUpdate(meId, { $addToSet: { friends: userId } });
    await User.findByIdAndUpdate(userId, { $addToSet: { friends: meId } });
  }

  res.json({ message: accept ? "Friend added." : "Request declined." });
});

export const removeFriend = asyncHandler(async (req: AuthedRequest, res) => {
  const { userId } = req.params as { userId: string };
  const meId = new mongoose.Types.ObjectId(req.user!.userId);
  await User.findByIdAndUpdate(meId, { $pull: { friends: userId } });
  await User.findByIdAndUpdate(userId, { $pull: { friends: meId } });
  res.json({ message: "Friend removed." });
});

/** Leaderboard limited to you + your friends. */
export const friendsLeaderboard = asyncHandler(async (req: AuthedRequest, res) => {
  const mode = String(req.query.mode ?? "time");
  const me = await User.findById(req.user!.userId).select("friends");
  if (!me) throw new ApiError(404, "User not found");

  const ids = [new mongoose.Types.ObjectId(req.user!.userId), ...me.friends];

  const leaderboard = await TestResult.aggregate([
    { $match: { mode, user: { $in: ids } } },
    { $sort: { wpm: -1 } },
    { $group: { _id: "$user", bestWpm: { $first: "$wpm" }, accuracy: { $first: "$accuracy" }, achievedAt: { $first: "$createdAt" } } },
    { $sort: { bestWpm: -1 } },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    { $project: { _id: 0, userId: "$_id", username: "$user.username", bestWpm: 1, accuracy: { $round: ["$accuracy", 1] }, achievedAt: 1 } },
  ]);

  res.json({ mode, leaderboard });
});
