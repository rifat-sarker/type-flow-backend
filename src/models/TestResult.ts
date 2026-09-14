import mongoose, { Schema, Document, Model } from "mongoose";

export type TestMode = "time" | "words" | "quote" | "zen";

export interface ITestResult extends Document {
  user: mongoose.Types.ObjectId;
  mode: TestMode;
  amount: number;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  correct: number;
  incorrect: number;
  extra: number;
  missed: number;
  createdAt: Date;
}

const testResultSchema = new Schema<ITestResult>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    mode: { type: String, enum: ["time", "words", "quote", "zen"], required: true },
    amount: { type: Number, required: true },
    wpm: { type: Number, required: true },
    rawWpm: { type: Number, default: 0 },
    accuracy: { type: Number, default: 100 },
    consistency: { type: Number, default: 100 },
    correct: { type: Number, default: 0 },
    incorrect: { type: Number, default: 0 },
    extra: { type: Number, default: 0 },
    missed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Powers the leaderboard's "best score per mode" aggregation.
testResultSchema.index({ mode: 1, wpm: -1 });

export const TestResult: Model<ITestResult> = mongoose.model<ITestResult>("TestResult", testResultSchema);
