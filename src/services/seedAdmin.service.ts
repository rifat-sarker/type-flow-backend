import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { env } from "../config/env";

// Runs once on startup. Idempotent: if an admin already exists, does nothing -
// so it won't reset a password you've since changed just by restarting the server.
export async function seedAdmin(): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.log("[seed] ADMIN_EMAIL/ADMIN_PASSWORD not set - skipping admin seed");
    return;
  }

  const existingAdmin = await User.findOne({ role: "admin" });
  if (existingAdmin) {
    console.log(`[seed] admin already exists (${existingAdmin.email}) - skipping`);
    return;
  }

  const email = env.ADMIN_EMAIL.toLowerCase();
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

  const existingByEmail = await User.findOne({ email });
  if (existingByEmail) {
    existingByEmail.role = "admin";
    existingByEmail.isVerified = true;
    await existingByEmail.save();
    console.log(`[seed] promoted existing user ${email} to admin`);
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
