/**
 * In-memory room store.
 * Host is authoritative for playback. Viewers receive sync commands only.
 */

const MAX_USERS = 8;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function now() {
  return Date.now();
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  create({ name, host, isPublic = false, password = "", maxUsers = MAX_USERS, icon = "🍿", theme = "purple", roomType = "normal" }) {
    let code = makeCode();
    while (this.rooms.has(code)) code = makeCode();

    const room = {
      code,
      name: String(name || `${host.name}'s Room`).slice(0, 48),
      icon: icon || "🍿",
      theme: theme || "purple",
      isPublic: !!isPublic,
      password: password ? String(password).slice(0, 32) : "",
      locked: false,
      chatMuted: false,
      reactionsEnabled: true,
      maxUsers: roomType === "couples" ? 2 : Math.min(Math.max(Number(maxUsers) || MAX_USERS, 2), 16),
      roomType: roomType === "couples" ? "couples" : "normal",
      createdAt: now(),
      hostId: host.id,
      users: new Map(),
      video: null,
      playback: { playing: false, time: 0, updatedAt: now(), rate: 1 },
      syncSession: null,
      queue: [],
    };
    room.users.set(host.id, { ...host, isHost: true, joinedAt: now() });
    this.rooms.set(code, room);
    return this.publicRoom(room);
  }

  get(code) {
    return this.rooms.get(String(code || "").toUpperCase()) || null;
  }

  join(code, user, password = "") {
    const room = this.get(code);
    if (!room) return { error: "Room not found" };
    if (room.locked && user.id !== room.hostId) return { error: "Room is locked" };
    if (room.password && password !== room.password && user.id !== room.hostId) {
      return { error: "Wrong password" };
    }
    if (room.users.size >= room.maxUsers && !room.users.has(user.id)) {
      return { error: "Room is full" };
    }
    const isHost = user.id === room.hostId;
    room.users.set(user.id, { ...user, isHost, joinedAt: now() });
    return { room: this.publicRoom(room), isHost };
  }

  leave(code, userId) {
    const room = this.get(code);
    if (!room) return null;
    room.users.delete(userId);
    if (room.users.size === 0) {
      this.rooms.delete(room.code);
      return { empty: true, room: null };
    }
    if (userId === room.hostId) {
      const next = room.users.values().next().value;
      if (next) {
        room.hostId = next.id;
        for (const u of room.users.values()) u.isHost = false;
        next.isHost = true;
      }
    }
    return { empty: false, room: this.publicRoom(room), newHostId: room.hostId };
  }

  isHost(code, userId) {
    const room = this.get(code);
    return !!(room && room.hostId === userId);
  }

  setVideo(code, video) {
    const room = this.get(code);
    if (!room) return null;
    room.video = video;
    room.playback = { playing: false, time: 0, updatedAt: now(), rate: 1 };
    return this.publicRoom(room);
  }

  setPlayback(code, { playing, time, rate }) {
    const room = this.get(code);
    if (!room) return null;
    const live = this.liveTime(room);
    room.playback = {
      playing: playing ?? room.playback.playing,
      time: typeof time === "number" ? time : live,
      rate: rate ?? room.playback.rate ?? 1,
      updatedAt: now(),
    };
    return this.syncPayload(room);
  }

  liveTime(room) {
    if (!room?.playback) return 0;
    const { playing, time, updatedAt, rate } = room.playback;
    if (!playing) return time;
    return Math.max(0, time + ((now() - updatedAt) / 1000) * (rate || 1));
  }

  syncPayload(room) {
    return {
      playing: room.playback.playing,
      time: this.liveTime(room),
      rate: room.playback.rate || 1,
      serverTime: now(),
      video: room.video,
    };
  }

  updateMeta(code, patch) {
    const room = this.get(code);
    if (!room) return null;
    if (patch.name != null) room.name = String(patch.name).slice(0, 48);
    if (patch.icon != null) room.icon = patch.icon;
    if (patch.theme != null) room.theme = patch.theme;
    if (typeof patch.isPublic === "boolean") room.isPublic = patch.isPublic;
    if (typeof patch.locked === "boolean") room.locked = patch.locked;
    if (typeof patch.chatMuted === "boolean") room.chatMuted = patch.chatMuted;
    if (typeof patch.reactionsEnabled === "boolean") room.reactionsEnabled = patch.reactionsEnabled;
    if (patch.password != null) room.password = String(patch.password).slice(0, 32);
    return this.publicRoom(room);
  }

  kick(code, targetId) {
    const room = this.get(code);
    if (!room || targetId === room.hostId) return null;
    room.users.delete(targetId);
    return this.publicRoom(room);
  }

  transfer(code, targetId) {
    const room = this.get(code);
    if (!room || !room.users.has(targetId)) return null;
    const prev = room.users.get(room.hostId);
    if (prev) prev.isHost = false;
    room.hostId = targetId;
    room.users.get(targetId).isHost = true;
    return this.publicRoom(room);
  }

  listPublic({ q = "", sort = "viewers" } = {}) {
    const query = String(q).toLowerCase();
    let list = [...this.rooms.values()]
      .filter((r) => r.isPublic && !r.locked)
      .map((r) => this.card(r));
    if (query) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          (r.movie || "").toLowerCase().includes(query) ||
          (r.host || "").toLowerCase().includes(query)
      );
    }
    if (sort === "newest") list.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === "trending") list.sort((a, b) => b.viewers * 2 + (b.createdAt > now() - 600000 ? 5 : 0) - a.viewers);
    else list.sort((a, b) => b.viewers - a.viewers);
    return list;
  }

  card(room) {
    const host = room.users.get(room.hostId);
    return {
      code: room.code,
      name: room.name,
      icon: room.icon,
      host: host?.name || "Host",
      hostColor: host?.color || "#9D5CFF",
      movie: room.video?.title || "",
      poster: room.video?.poster || "",
      viewers: room.users.size,
      maxUsers: room.maxUsers,
      isPublic: room.isPublic,
      locked: room.locked,
      roomType: room.roomType || "normal",
      createdAt: room.createdAt,
    };
  }

  publicRoom(room) {
    return {
      code: room.code,
      name: room.name,
      icon: room.icon,
      theme: room.theme,
      isPublic: room.isPublic,
      locked: room.locked,
      roomType: room.roomType || "normal",
      chatMuted: room.chatMuted,
      reactionsEnabled: room.reactionsEnabled,
      hasPassword: !!room.password,
      maxUsers: room.maxUsers,
      createdAt: room.createdAt,
      hostId: room.hostId,
      video: room.video,
      playback: this.syncPayload(room),
      queue: room.queue,
      users: [...room.users.values()].map((u) => ({
        id: u.id,
        username: u.username || null,
        name: u.displayName || u.name,
        displayName: u.displayName || u.name,
        color: u.color,
        avatar: u.avatar,
        cosmetics: u.cosmetics || null,
        isHost: u.id === room.hostId,
      })),
    };
  }
}

module.exports = { RoomManager };
