import { TestResult } from "../models/TestResult";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { ApiError } from "../utils/ApiError";

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

  await User.findByIdAndUpdate(req.user!.userId, {
    $inc: { testsCompleted: 1 },
    $max: { bestWpm: body.wpm },
  });

  res.status(201).json({ result });
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
