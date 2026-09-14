import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return v;
}

export const env = {
  PORT: parseInt(process.env.PORT || "4000", 10),
  MONGO_URI: required("MONGO_URI", "mongodb://localhost:27017/typeflow"),
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  CLIENT_ORIGIN: required("CLIENT_ORIGIN", "http://localhost:3000"),
  NODE_ENV: process.env.NODE_ENV || "development",
};
