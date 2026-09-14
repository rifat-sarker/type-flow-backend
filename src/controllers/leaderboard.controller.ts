import { TestResult } from "../models/TestResult";
import { asyncHandler } from "../utils/asyncHandler";

const VALID_MODES = new Set(["time", "words", "quote", "zen"]);
const VALID_PERIODS = new Set(["all", "daily", "weekly"]);

function periodCutoff(period: string): Date | null {
  const now = Date.now();
  if (period === "daily") return new Date(now - 24 * 60 * 60 * 1000);
  if (period === "weekly") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  return null;
}

export const getLeaderboard = asyncHandler(async (req, res) => {
  const mode = VALID_MODES.has(String(req.query.mode)) ? String(req.query.mode) : "time";
  const period = VALID_PERIODS.has(String(req.query.period)) ? String(req.query.period) : "all";
  const limit = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10));

  const match: Record<string, unknown> = { mode };
  const cutoff = periodCutoff(period);
  if (cutoff) match.createdAt = { $gte: cutoff };

  const leaderboard = await TestResult.aggregate([
    { $match: match },
    { $sort: { wpm: -1 } },
    {
      $group: {
        _id: "$user",
        bestWpm: { $first: "$wpm" },
        accuracy: { $first: "$accuracy" },
        achievedAt: { $first: "$createdAt" },
      },
    },
    { $sort: { bestWpm: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        username: "$user.username",
        bestWpm: 1,
        accuracy: { $round: ["$accuracy", 1] },
        achievedAt: 1,
      },
    },
  ]);

  res.json({ mode, period, leaderboard });
});
