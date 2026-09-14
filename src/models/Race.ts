import mongoose, { Schema, Document, Model } from "mongoose";

export type RaceMode = "words" | "time";
export type RaceStatus = "waiting" | "active" | "finished";

export interface IRaceParticipantResult {
  user: mongoose.Types.ObjectId;
  username: string;
  wpm: number;
  accuracy: number;
  finishedAt?: Date;
  place?: number;
}

export interface IRace extends Document {
  code: string;
  host: mongoose.Types.ObjectId;
  mode: RaceMode;
  amount: number;
  text: string[];
  status: RaceStatus;
  participants: IRaceParticipantResult[];
  createdAt: Date;
}

const participantSchema = new Schema<IRaceParticipantResult>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    username: String,
    wpm: Number,
    accuracy: Number,
    finishedAt: Date,
    place: Number,
  },
  { _id: false }
);

const raceSchema = new Schema<IRace>(
  {
    code: { type: String, required: true, unique: true, index: true },
    host: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mode: { type: String, enum: ["words", "time"], default: "words" },
    amount: { type: Number, default: 25 },
    text: [{ type: String }],
    status: { type: String, enum: ["waiting", "active", "finished"], default: "waiting" },
    participants: [participantSchema],
  },
  { timestamps: true }
);

export const Race: Model<IRace> = mongoose.model<IRace>("Race", raceSchema);
