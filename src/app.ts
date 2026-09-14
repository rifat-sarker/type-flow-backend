import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import resultsRoutes from "./routes/results.routes";
import leaderboardRoutes from "./routes/leaderboard.routes";
import raceRoutes from "./routes/race.routes";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ ok: true, env: env.NODE_ENV });
});

app.use("/api/auth", authRoutes);
app.use("/api/results", resultsRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/races", raceRoutes);

app.use(errorHandler);
