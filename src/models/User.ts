import mongoose, { Schema, Document, Model } from "mongoose";

export type UserRole = "user" | "admin";
export type OtpPurpose = "verify" | "reset";

export interface IOtp {
  codeHash: string;
  purpose: OtpPurpose;
  expiresAt: Date;
}

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  bestWpm: number;
  testsCompleted: number;
  role: UserRole;
  isVerified: boolean;
  otp?: IOtp;
  completedLessons: string[];
  badges: string[];
  /** Per-character hit/miss totals, accumulated across tests. */
  keyStats: Map<string, { hits: number; misses: number }>;
  /** Mutual friendships - both sides hold each other's id. */
  friends: mongoose.Types.ObjectId[];
  /** Incoming requests awaiting this user's decision. */
  friendRequests: mongoose.Types.ObjectId[];
  streakDays: number;
  lastPracticeDay?: string; // YYYY-MM-DD, used to advance the streak
  createdAt: Date;
  updatedAt: Date;
}

const otpSchema = new Schema<IOtp>(
  {
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ["verify", "reset"], required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    bestWpm: { type: Number, default: 0 },
    testsCompleted: { type: Number, default: 0 },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isVerified: { type: Boolean, default: false },
    otp: { type: otpSchema, default: undefined },
    completedLessons: { type: [String], default: [] },
    badges: { type: [String], default: [] },
    friends: [{ type: Schema.Types.ObjectId, ref: "User" }],
    friendRequests: [{ type: Schema.Types.ObjectId, ref: "User" }],
    keyStats: {
      type: Map,
      of: new Schema({ hits: Number, misses: Number }, { _id: false }),
      default: () => new Map(),
    },
    streakDays: { type: Number, default: 0 },
    lastPracticeDay: { type: String },
  },
  { timestamps: true }
);

export const User: Model<IUser> = mongoose.model<IUser>("User", userSchema);
