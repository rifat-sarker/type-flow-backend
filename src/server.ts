import http from "http";
import { Server } from "socket.io";
import { app } from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { registerRaceSocket } from "./sockets/raceSocket";
import { registerPresenceSocket } from "./sockets/presenceSocket";
import { seedAdmin } from "./services/seedAdmin.service";

async function main(): Promise<void> {
  await connectDB();
  // Seeding is a convenience, not a prerequisite - a failure here must never stop
  // the API from coming up.
  await seedAdmin().catch((err) => console.error("[seed] admin seed failed", err));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
  });

  registerRaceSocket(io);
  registerPresenceSocket(io);

  server.listen(env.PORT, () => {
    console.log(`[server] listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = () => {
    console.log("[server] shutting down gracefully...");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[server] fatal startup error", err);
  process.exit(1);
});
