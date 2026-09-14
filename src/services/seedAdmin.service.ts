import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { env } from "../config/env";

// Runs on every startup. The .env values are the source of truth for the seeded
// admin: if ADMIN_PASSWORD changes, the account's password is re-synced on the next
// restart, so editing .env is all it takes to regain access.
export async function seedAdmin(): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.log("[seed] ADMIN_EMAIL/ADMIN_PASSWORD not set - skipping admin seed");
    return;
  }

  const email = env.ADMIN_EMAIL.toLowerCase();
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

  const existingByEmail = await User.findOne({ email });
  if (existingByEmail) {
    const passwordMatches = await bcrypt.compare(env.ADMIN_PASSWORD, existingByEmail.passwordHash);
    existingByEmail.role = "admin";
    existingByEmail.isVerified = true;
    if (!passwordMatches) existingByEmail.passwordHash = passwordHash;
    await existingByEmail.save();
    console.log(
      `[seed] admin ${email} ready${passwordMatches ? "" : " (password re-synced from .env)"}`
    );
    return;
  }

  let username = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || "admin";
  if (await User.findOne({ username })) {
    username = `${username}${Math.floor(Math.random() * 10000)}`.slice(0, 20);
  }

  await User.create({
    username,
    email,
    passwordHash,
    role: "admin",
    isVerified: true,
  });
  console.log(`[seed] created admin account ${email} (username: ${username})`);
}
