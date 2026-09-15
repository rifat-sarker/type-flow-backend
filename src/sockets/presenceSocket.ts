import { Server, Socket } from "socket.io";

// Live "who's here right now" counter. Counting sockets alone would inflate the
// number when one person has several tabs open, so signed-in users are counted
// once per account and anonymous visitors once per socket.
const userSockets = new Map<string, Set<string>>(); // userId -> socket ids
const anonSockets = new Set<string>();

function onlineCount(): number {
  return userSockets.size + anonSockets.size;
}

function broadcast(io: Server): void {
  io.emit("presence:count", { online: onlineCount() });
}

export function registerPresenceSocket(io: Server): void {
  io.on("connection", (socket: Socket) => {
    anonSockets.add(socket.id);
    broadcast(io);

    // Sent once the client knows who it is (or that it's a guest).
    socket.on("presence:identify", ({ userId }: { userId?: string | null }) => {
      const prev = socket.data.presenceUserId as string | undefined;
      if (prev === userId) return;

      // Detach from wherever this socket was counted before.
      if (prev) {
        const set = userSockets.get(prev);
        set?.delete(socket.id);
        if (set && set.size === 0) userSockets.delete(prev);
      } else {
        anonSockets.delete(socket.id);
      }

      if (userId) {
        socket.data.presenceUserId = userId;
        const set = userSockets.get(userId) ?? new Set<string>();
        set.add(socket.id);
        userSockets.set(userId, set);
      } else {
        socket.data.presenceUserId = undefined;
        anonSockets.add(socket.id);
      }

      broadcast(io);
    });

    socket.on("disconnect", () => {
      const uid = socket.data.presenceUserId as string | undefined;
      if (uid) {
        const set = userSockets.get(uid);
        set?.delete(socket.id);
        if (set && set.size === 0) userSockets.delete(uid);
      }
      anonSockets.delete(socket.id);
      broadcast(io);
    });
  });
}
