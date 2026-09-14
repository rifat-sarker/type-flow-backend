import { Race, RaceMode } from "../models/Race";
import { generateWords } from "../utils/wordBank";
import { generateRaceCode } from "../utils/raceCode";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { ApiError } from "../utils/ApiError";

export const createRace = asyncHandler(async (req: AuthedRequest, res) => {
  const { mode, amount } = req.body as { mode?: RaceMode; amount?: number };
  const raceMode: RaceMode = mode === "time" ? "time" : "words";
  const raceAmount = amount && amount > 0 ? Math.min(amount, 200) : 25;

  const text = raceMode === "time" ? generateWords(80) : generateWords(raceAmount);

  // Retry on the (very unlikely) chance of a code collision.
  let code = generateRaceCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await Race.exists({ code });
    if (!clash) break;
    code = generateRaceCode();
  }

  const race = await Race.create({
    code,
    host: req.user!.userId,
    mode: raceMode,
    amount: raceAmount,
    text,
    status: "waiting",
  });

  res.status(201).json({ race });
});

export const getRace = asyncHandler(async (req, res) => {
  const race = await Race.findOne({ code: req.params.code.toUpperCase() });
  if (!race) throw new ApiError(404, "Race not found. Check the invite link.");
  res.json({ race });
});
