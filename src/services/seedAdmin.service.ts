import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { env } from "../config/env";

// Runs on every startup. The .env values are the source of truth for the seeded
// admin: if ADMIN_PASSWORD changes, the account's password is re-synced on the next
// restart, so editing .env is all it takes to regain access.
//
// Everything here uses atomic updates rather than load-then-save(): save() carries
// a __v version check, and simply loading a document that predates a newly added
// schema field counts as "modified", so a restart could throw VersionError and -
// because this runs during boot - take the whole server down with it.
export async function seedAdmin(): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.log("[seed] ADMIN_EMAIL/ADMIN_PASSWORD not set - skipping admin seed");
    return;
  }

  const email = env.ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email }).select("passwordHash");

  if (existing) {
    const matches = await bcrypt.compare(env.ADMIN_PASSWORD, existing.passwordHash);
    const update: Record<string, unknown> = { role: "admin", isVerified: true };
    if (!matches) update.passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

    await User.updateOne({ _id: existing._id }, { $set: update });
    console.log(`[seed] admin ${email} ready${matches ? "" : " (password re-synced from .env)"}`);
    return;
  }

  let username = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || "admin";
  if (await User.exists({ username })) {
    username = `${username}${Math.floor(Math.random() * 10000)}`.slice(0, 20);
  }

  await User.create({
    username,
    email,
    passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12),
    role: "admin",
    isVerified: true,
  });
  console.log(`[seed] created admin account ${email} (username: ${username})`);
}
