import { TestResult } from "../models/TestResult";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { ApiError } from "../utils/ApiError";
import { newlyEarnedBadges, BADGE_MAP } from "../utils/badges";

// Kept in sync with the frontend course length (frontend/src/lib/lessons.ts).
const TOTAL_LESSONS = 11;

interface SaveResultBody {
  mode: "time" | "words" | "quote" | "zen";
  amount: number;
  wpm: number;
  rawWpm?: number;
  accuracy: number;
  consistency?: number;
  correct?: number;
  incorrect?: number;
  extra?: number;
  missed?: number;
}

export const saveResult = asyncHandler(async (req: AuthedRequest, res) => {
  const body = req.body as SaveResultBody;
  if (typeof body.wpm !== "number" || typeof body.accuracy !== "number" || !body.mode) {
    throw new ApiError(400, "mode, wpm and accuracy are required");
  }

  const result = await TestResult.create({
    user: req.user!.userId,
    mode: body.mode,
    amount: body.amount ?? 0,
    wpm: body.wpm,
    rawWpm: body.rawWpm ?? body.wpm,
    accuracy: body.accuracy,
    consistency: body.consistency ?? 100,
    correct: body.correct ?? 0,
    incorrect: body.incorrect ?? 0,
    extra: body.extra ?? 0,
    missed: body.missed ?? 0,
  });

  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");

  user.testsCompleted = (user.testsCompleted ?? 0) + 1;
  user.bestWpm = Math.max(user.bestWpm ?? 0, body.wpm);

  // Streak: same day changes nothing, the next day extends it, any longer gap
  // restarts at 1. Dates are compared as plain YYYY-MM-DD strings.
  const today = new Date().toISOString().slice(0, 10);
  if (user.lastPracticeDay !== today) {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    user.streakDays = user.lastPracticeDay === yesterday ? (user.streakDays ?? 0) + 1 : 1;
    user.lastPracticeDay = today;
  }

  const earned = newlyEarnedBadges(
    {
      wpm: body.wpm,
      accuracy: body.accuracy,
      testsCompleted: user.testsCompleted,
      lessonsCompleted: user.completedLessons?.length ?? 0,
      totalLessons: TOTAL_LESSONS,
      streakDays: user.streakDays ?? 0,
    },
    user.badges ?? []
  );
  if (earned.length) user.badges = (user.badges ?? []).concat(earned);

  await user.save();

  // The client uses `earnedBadges` to pop a celebration on the results screen.
  res.status(201).json({
    result,
    earnedBadges: earned.map((id) => BADGE_MAP[id]).filter(Boolean),
    streakDays: user.streakDays,
  });
});

export const myResults = asyncHandler(async (req: AuthedRequest, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(50, parseInt(String(req.query.limit ?? "20"), 10));

  const [results, total] = await Promise.all([
    TestResult.find({ user: req.user!.userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    TestResult.countDocuments({ user: req.user!.userId }),
  ]);

  res.json({ results, page, limit, total });
});
