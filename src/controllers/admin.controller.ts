import { User } from "../models/User";
import { TestResult } from "../models/TestResult";
import { Race } from "../models/Race";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";

export const getStats = asyncHandler(async (_req, res) => {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [users, verified, admins, tests, testsToday, races, topResult] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isVerified: true }),
    User.countDocuments({ role: "admin" }),
    TestResult.countDocuments({}),
    TestResult.countDocuments({ createdAt: { $gte: dayAgo } }),
    Race.countDocuments({}),
    TestResult.findOne({}).sort({ wpm: -1 }).select("wpm").lean(),
  ]);

  res.json({
    stats: {
      users,
      verified,
      admins,
      tests,
      testsToday,
      races,
      topWpm: topResult?.wpm ?? 0,
    },
  });
});

export const listUsers = asyncHandler(async (req, res) => {
  const limit = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10));
  const search = String(req.query.search ?? "").trim();

  const filter = search
    ? {
        $or: [
          { username: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }
    : {};

  const users = await User.find(filter)
    .select("username email role isVerified bestWpm testsCompleted createdAt")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({ users });
});

export const setUserRole = asyncHandler(async (req: AuthedRequest, res) => {
  const { userId, role } = req.body as { userId?: string; role?: "user" | "admin" };
  if (!userId || (role !== "user" && role !== "admin")) {
    throw new ApiError(400, "userId and a valid role are required");
  }
  // Refuse to strip your own admin rights - that can lock everyone out.
  if (userId === req.user!.userId && role !== "admin") {
    throw new ApiError(400, "You can't remove your own admin role");
  }

  const user = await User.findByIdAndUpdate(userId, { role }, { new: true }).select(
    "username email role"
  );
  if (!user) throw new ApiError(404, "User not found");

  res.json({ user });
});

export const deleteUser = asyncHandler(async (req: AuthedRequest, res) => {
  const { userId } = req.params as { userId: string };
  if (userId === req.user!.userId) throw new ApiError(400, "You can't delete your own account here");

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");
  if (user.role === "admin") throw new ApiError(400, "Demote this admin before deleting them");

  await TestResult.deleteMany({ user: userId });
  await User.findByIdAndDelete(userId);

  res.json({ message: "User deleted." });
});
