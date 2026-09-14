import mongoose from "mongoose";
import { Server, Socket } from "socket.io";
import { Race } from "../models/Race";

interface Participant {
  socketId: string;
  userId: string;
  username: string;
  progress: number; // 0-100
  wpm: number;
  accuracy: number;
  finished: boolean;
  place?: number;
}

interface Spectator {
  socketId: string;
  userId: string;
  username: string;
}

interface LiveRace {
  code: string;
  hostId: string;
  status: "waiting" | "countdown" | "active" | "finished";
  participants: Map<string, Participant>; // keyed by socket id
  spectators: Map<string, Spectator>; // keyed by socket id
  finishedCount: number;
}

// In-memory only: fine for a single backend instance. If you scale to multiple
// instances behind a load balancer, move this to Redis (or the @socket.io/redis-adapter)
// so all instances see the same race state.
const liveRaces = new Map<string, LiveRace>();

function roomFor(code: string): string {
  return `race:${code}`;
}

function serialize(live: LiveRace) {
  return {
    code: live.code,
    status: live.status,
    participants: Array.from(live.participants.values()).map((p) => ({
      userId: p.userId,
      username: p.username,
      progress: p.progress,
      wpm: p.wpm,
      accuracy: p.accuracy,
      finished: p.finished,
      place: p.place,
    })),
    spectatorCount: live.spectators.size,
  };
}

export function registerRaceSocket(io: Server): void {
  io.on("connection", (socket: Socket) => {
    socket.on("race:join", async (payload: { code: string; userId: string; username: string }) => {
      try {
        const code = String(payload.code || "").toUpperCase();
        let live = liveRaces.get(code);

        if (!live) {
          const raceDoc = await Race.findOne({ code });
          if (!raceDoc) {
            socket.emit("race:error", "Race not found");
            return;
          }
          if (raceDoc.status === "finished") {
            socket.emit("race:error", "This race has already finished");
            return;
          }
          live = {
            code,
            hostId: String(raceDoc.host),
            status: "waiting",
            participants: new Map(),
            spectators: new Map(),
            finishedCount: 0,
          };
          liveRaces.set(code, live);
        }

        socket.join(roomFor(code));
        socket.data.code = code;
        socket.data.userId = payload.userId;

        // Anyone joining after the race is already underway (or finished) missed the
        // countdown and has no fair shot at the text, so they watch instead of race.
        const alreadyRacing = Array.from(live.participants.values()).some((p) => p.userId === payload.userId);
        const asSpectator = live.status !== "waiting" && !alreadyRacing;

        if (asSpectator) {
          live.spectators.set(socket.id, { socketId: socket.id, userId: payload.userId, username: payload.username });
          socket.data.spectator = true;
        } else {
          live.participants.set(socket.id, {
            socketId: socket.id,
            userId: payload.userId,
            username: payload.username,
            progress: 0,
            wpm: 0,
            accuracy: 100,
            finished: false,
          });
        }

        socket.emit("race:role", { spectator: asSpectator });
        io.to(roomFor(code)).emit("race:update", serialize(live));
      } catch (err) {
        console.error("[race:join] error", err);
        socket.emit("race:error", "Failed to join race");
      }
    });

    socket.on("race:start", ({ code }: { code: string }) => {
      const live = liveRaces.get(code);
      if (!live) return;
      if (live.status !== "waiting") return;
      if (socket.data.userId !== live.hostId) {
        socket.emit("race:error", "Only the host can start the race");
        return;
      }

      live.status = "countdown";
      let count = 3;
      io.to(roomFor(code)).emit("race:countdown", count);

      const interval = setInterval(() => {
        count -= 1;
        if (count > 0) {
          io.to(roomFor(code)).emit("race:countdown", count);
          return;
        }
        clearInterval(interval);
        live!.status = "active";
        io.to(roomFor(code)).emit("race:go");
        Race.findOneAndUpdate({ code }, { status: "active" }).catch((err) =>
          console.error("[race:start] failed to persist status", err)
        );
      }, 1000);
    });

    socket.on(
      "race:progress",
      ({ code, progress, wpm, accuracy }: { code: string; progress: number; wpm: number; accuracy: number }) => {
        const live = liveRaces.get(code);
        if (!live || live.status !== "active") return;
        const p = live.participants.get(socket.id);
        if (!p || p.finished) return;
        p.progress = Math.max(0, Math.min(100, progress));
        p.wpm = wpm;
        p.accuracy = accuracy;
        io.to(roomFor(code)).emit("race:update", serialize(live));
      }
    );

    socket.on("race:finish", async ({ code, wpm, accuracy }: { code: string; wpm: number; accuracy: number }) => {
      const live = liveRaces.get(code);
      if (!live) return;
      const p = live.participants.get(socket.id);
      if (!p || p.finished) return;

      p.finished = true;
      p.wpm = wpm;
      p.accuracy = accuracy;
      p.progress = 100;
      live.finishedCount += 1;
      p.place = live.finishedCount;

      io.to(roomFor(code)).emit("race:update", serialize(live));

      const allFinished = Array.from(live.participants.values()).every((x) => x.finished);
      if (allFinished) {
        live.status = "finished";
        const standings = Array.from(live.participants.values()).sort(
          (a, b) => (a.place ?? 99) - (b.place ?? 99)
        );
        io.to(roomFor(code)).emit("race:finished", serialize(live).participants);

        try {
          await Race.findOneAndUpdate(
            { code },
            {
              status: "finished",
              // Guest ids aren't valid Mongo ObjectIds - omit `user` for them rather
              // than let the whole standings write fail on a cast error.
              participants: standings.map((s) => ({
                ...(mongoose.isValidObjectId(s.userId) ? { user: s.userId } : {}),
                username: s.username,
                wpm: s.wpm,
                accuracy: s.accuracy,
                finishedAt: new Date(),
                place: s.place,
              })),
            }
          );
        } catch (err) {
          console.error("[race:finish] failed to persist results", err);
        }
      }
    });

    socket.on("race:chat", ({ code, text }: { code: string; text: string }) => {
      const live = liveRaces.get(code);
      if (!live) return;
      const sender =
        live.participants.get(socket.id)?.username ?? live.spectators.get(socket.id)?.username;
      if (!sender) return;
      const trimmed = String(text ?? "").trim().slice(0, 240);
      if (!trimmed) return;
      io.to(roomFor(code)).emit("race:chat", {
        username: sender,
        text: trimmed,
        spectator: !!socket.data.spectator,
        ts: Date.now(),
      });
    });

    socket.on("disconnect", () => {
      const code = socket.data.code as string | undefined;
      if (!code) return;
      const live = liveRaces.get(code);
      if (!live) return;
      live.participants.delete(socket.id);
      live.spectators.delete(socket.id);
      io.to(roomFor(code)).emit("race:update", serialize(live));
      if (live.participants.size === 0 && live.spectators.size === 0) {
        liveRaces.delete(code);
      }
    });
  });
}
