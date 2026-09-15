import { User } from "../models/User";
import { TestResult } from "../models/TestResult";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { newlyEarnedBadges, BADGE_MAP, BADGES } from "../utils/badges";

const TOTAL_LESSONS = 11;

export const getProgress = asyncHandler(async (req: AuthedRequest, res) => {
  const user = await User.findById(req.user!.userId).select("completedLessons");
  if (!user) throw new ApiError(404, "User not found");
  res.json({ completedLessons: user.completedLessons ?? [] });
});

export const completeLesson = asyncHandler(async (req: AuthedRequest, res) => {
  const { lessonId } = req.body as { lessonId?: string };
  if (!lessonId) throw new ApiError(400, "lessonId is required");

  // $addToSet keeps this idempotent - replaying a lesson won't duplicate it.
  const user = await User.findByIdAndUpdate(
    req.user!.userId,
    { $addToSet: { completedLessons: lessonId } },
    { new: true }
  );
  if (!user) throw new ApiError(404, "User not found");

  // Passing a lesson can unlock the learning badges, so re-check them here too.
  const earned = newlyEarnedBadges(
    {
      wpm: 0,
      accuracy: 0,
      testsCompleted: user.testsCompleted ?? 0,
      lessonsCompleted: user.completedLessons.length,
      totalLessons: TOTAL_LESSONS,
      streakDays: user.streakDays ?? 0,
    },
    user.badges ?? []
  );
  if (earned.length) {
    user.badges = (user.badges ?? []).concat(earned);
    await user.save();
  }

  res.json({
    completedLessons: user.completedLessons,
    earnedBadges: earned.map((id) => BADGE_MAP[id]).filter(Boolean),
  });
});

export const getBadges = asyncHandler(async (req: AuthedRequest, res) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "User not found");

  // Badges are normally granted as results come in, but anyone who practised
  // before badges existed (or whose best run predates a new badge) would see an
  // empty wall. Backfill from their all-time bests so the page is never a lie.
  const best = await TestResult.findOne({ user: user._id }).sort({ accuracy: -1 }).select("accuracy").lean();
  const backfill = newlyEarnedBadges(
    {
      wpm: user.bestWpm ?? 0,
      accuracy: best?.accuracy ?? 0,
      testsCompleted: user.testsCompleted ?? 0,
      lessonsCompleted: user.completedLessons?.length ?? 0,
      totalLessons: TOTAL_LESSONS,
      streakDays: user.streakDays ?? 0,
    },
    user.badges ?? []
  );
  if (backfill.length) {
    user.badges = (user.badges ?? []).concat(backfill);
    await user.save();
  }

  const owned = new Set(user.badges ?? []);
  res.json({
    badges: BADGES.map(({ earned, ...def }) => ({ ...def, owned: owned.has(def.id) })),
    streakDays: user.streakDays ?? 0,
  });
});
