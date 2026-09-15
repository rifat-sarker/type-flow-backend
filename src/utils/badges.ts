export type BadgeTier = "bronze" | "silver" | "gold" | "platinum";

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  tier: BadgeTier;
  emoji: string;
}

export interface BadgeContext {
  wpm: number;
  accuracy: number;
  testsCompleted: number;
  lessonsCompleted: number;
  totalLessons: number;
  streakDays: number;
}

/** Every badge, plus the rule that unlocks it. Order = display order. */
export const BADGES: (BadgeDef & { earned: (c: BadgeContext) => boolean })[] = [
  // ── Speed ──
  { id: "speed-30", name: "Getting Going", description: "Hit 30 WPM in a test", tier: "bronze", emoji: "🚶", earned: (c) => c.wpm >= 30 },
  { id: "speed-50", name: "Cruising", description: "Hit 50 WPM in a test", tier: "bronze", emoji: "🏃", earned: (c) => c.wpm >= 50 },
  { id: "speed-70", name: "Fast Fingers", description: "Hit 70 WPM in a test", tier: "silver", emoji: "⚡", earned: (c) => c.wpm >= 70 },
  { id: "speed-90", name: "Blazing", description: "Hit 90 WPM in a test", tier: "gold", emoji: "🔥", earned: (c) => c.wpm >= 90 },
  { id: "speed-120", name: "Keyboard Demon", description: "Hit 120 WPM in a test", tier: "platinum", emoji: "👹", earned: (c) => c.wpm >= 120 },

  // ── Accuracy ──
  { id: "acc-95", name: "Steady Hands", description: "Finish a test at 95% accuracy", tier: "bronze", emoji: "🎯", earned: (c) => c.accuracy >= 95 },
  { id: "acc-99", name: "Sharpshooter", description: "Finish a test at 99% accuracy", tier: "silver", emoji: "🏹", earned: (c) => c.accuracy >= 99 },
  { id: "acc-100", name: "Flawless", description: "Finish a test with zero mistakes", tier: "gold", emoji: "💎", earned: (c) => c.accuracy >= 100 },

  // ── Volume ──
  { id: "tests-10", name: "Warmed Up", description: "Complete 10 tests", tier: "bronze", emoji: "🌱", earned: (c) => c.testsCompleted >= 10 },
  { id: "tests-50", name: "Regular", description: "Complete 50 tests", tier: "silver", emoji: "🌿", earned: (c) => c.testsCompleted >= 50 },
  { id: "tests-250", name: "Dedicated", description: "Complete 250 tests", tier: "gold", emoji: "🌳", earned: (c) => c.testsCompleted >= 250 },

  // ── Learning ──
  { id: "lesson-first", name: "First Step", description: "Pass your first lesson", tier: "bronze", emoji: "📖", earned: (c) => c.lessonsCompleted >= 1 },
  { id: "lesson-half", name: "Halfway There", description: "Pass half the course", tier: "silver", emoji: "📗", earned: (c) => c.totalLessons > 0 && c.lessonsCompleted >= Math.ceil(c.totalLessons / 2) },
  { id: "lesson-all", name: "Graduate", description: "Pass every lesson in the course", tier: "platinum", emoji: "🎓", earned: (c) => c.totalLessons > 0 && c.lessonsCompleted >= c.totalLessons },

  // ── Consistency ──
  { id: "streak-3", name: "Building a Habit", description: "Practise 3 days in a row", tier: "bronze", emoji: "📅", earned: (c) => c.streakDays >= 3 },
  { id: "streak-7", name: "Week Strong", description: "Practise 7 days in a row", tier: "silver", emoji: "🗓️", earned: (c) => c.streakDays >= 7 },
  { id: "streak-30", name: "Unstoppable", description: "Practise 30 days in a row", tier: "platinum", emoji: "🏆", earned: (c) => c.streakDays >= 30 },
];

export const BADGE_MAP: Record<string, BadgeDef> = Object.fromEntries(
  BADGES.map(({ earned, ...def }) => [def.id, def])
);

/** Badge ids the context qualifies for that aren't already held. */
export function newlyEarnedBadges(ctx: BadgeContext, alreadyHave: string[]): string[] {
  const have = new Set(alreadyHave);
  return BADGES.filter((b) => !have.has(b.id) && b.earned(ctx)).map((b) => b.id);
}
