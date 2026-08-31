/**
 * WatchSync server — Express + Socket.IO
 * Serves the client, TMDB proxy, uploads, and real-time room sync.
 * Render: set PORT, TMDB_API_KEY, TMDB_READ_TOKEN then `node server.js`
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Server } = require("socket.io");
const { RoomManager } = require("./rooms");
const { Store } = require("./store");

loadDotEnv();

const PORT = Number(process.env.PORT) || 8080;
const TMDB_KEY = process.env.TMDB_API_KEY || "f9703eb434d9a5ada4c1df7ccf1a8855";
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN || "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmOTcwM2ViNDM0ZDlhNWFkYTRjMWRmN2NjZjFhODg1NSIsIm5iZiI6MTc4NzkwMDM4OC44NjIwMDAyLCJzdWIiOiI2YTkxMzFlNGVjODE3NDBjM2JmN2UyNTYiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.bQRv5SjOWwqI_CbJw47-LJtg3gcbFYjX__CJ3qz8Tqg";
const TMDB_BASE = "https://api.themoviedb.org/3";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"] },
  maxHttpBufferSize: 2e6,
});

const rooms = new RoomManager();
const store = new Store();

/** Push latest profile to any sockets for this user (achievements / XP sync). */
function pushProfile(ioInstance, userId) {
  try {
    if (!ioInstance || !userId) return;
    const profile = store.getProfile(userId);
    if (!profile) return;
    for (const sock of ioInstance.sockets.sockets.values()) {
      if (sock.data && sock.data.user && sock.data.user.id === userId) {
        sock.emit("profile:sync", profile);
      }
    }
  } catch (err) {
    console.warn("pushProfile", err && err.message);
  }
}


function sanitizeName(name) {
  const n = String(name || "Guest")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
  return n || "Guest";
}

function sanitizeAvatar(raw) {
  const s = String(raw || "🎬").trim();
  if (s.startsWith("/") || s.startsWith("http")) return s.slice(0, 512);
  return s.slice(0, 4);
}

/** Unique handle — never shown as the main chat name, used for identity */
const usernameById = new Map(); // id -> username
const idByUsername = new Map(); // username -> id

function sanitizeUsername(raw) {
  let u = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
  if (u.length < 3) u = "";
  return u;
}

function makeUsername(preferred, id) {
  const base =
    sanitizeUsername(preferred) ||
    ("user_" + String(id || "").replace(/[^a-z0-9]/gi, "").slice(-6) || Math.random().toString(36).slice(2, 8));
  let candidate = base.slice(0, 16);
  let n = 0;
  while (idByUsername.has(candidate) && idByUsername.get(candidate) !== id) {
    n += 1;
    candidate = (base.slice(0, 12) + "_" + n).slice(0, 20);
  }
  return candidate;
}

function bindUsername(id, username) {
  const prev = usernameById.get(id);
  if (prev) idByUsername.delete(prev);
  usernameById.set(id, username);
  idByUsername.set(username, id);
}

const chatRate = new Map();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const uploadDir = path.join(__dirname, "uploads", "videos");
const avatarDir = path.join(__dirname, "uploads", "avatars");
const chatImgDir = path.join(__dirname, "uploads", "chat");
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(avatarDir, { recursive: true });
fs.mkdirSync(chatImgDir, { recursive: true });

/** Allowed video containers — extension is authoritative; MIME is secondary (browsers lie about MKV). */
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mkv", ".mov", ".m4v"]);
const VIDEO_MIME_OK = /^(video\/(mp4|webm|quicktime|x-matroska|matroska|mpeg|x-m4v)|application\/(octet-stream|x-matroska))$/i;
const VIDEO_MAX_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

function isAllowedVideoFile(file) {
  const name = String(file?.originalname || "");
  const ext = path.extname(name).toLowerCase();
  const mime = String(file?.mimetype || "").toLowerCase();
  if (VIDEO_EXTS.has(ext)) return true;
  // Some OSes send empty/odd MIME for MKV — still allow if extension matched above
  if (VIDEO_MIME_OK.test(mime) && (ext === "" || VIDEO_EXTS.has(ext))) return true;
  return false;
}

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      let ext = path.extname(file.originalname || "").toLowerCase();
      if (!VIDEO_EXTS.has(ext)) ext = ".mp4";
      // Never trust user path segments — only random name + safe ext
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: VIDEO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedVideoFile(file)) return cb(null, true);
    cb(new Error("Unsupported video format. Use MP4, WebM, MKV, or MOV."));
  },
});


const chatImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, chatImgDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
      const safe = [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext) ? ext : ".png";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safe}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype || "");
    cb(ok ? null : new Error("Images only (png/jpg/gif/webp)"), ok);
  },
});

const avatarImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
      const safe = [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext) ? ext : ".png";
      cb(null, `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype || "");
    cb(ok ? null : new Error("Images only (png/jpg/gif/webp)"), ok);
  },
});

app.post("/api/upload/avatar", avatarImageUpload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  const url = `/uploads/avatars/${req.file.filename}`;
  res.json({ ok: true, url });
});

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".mkv") res.setHeader("Content-Type", "video/x-matroska");
      if (ext === ".mov") res.setHeader("Content-Type", "video/quicktime");
      if (ext === ".mp4") res.setHeader("Content-Type", "video/mp4");
      if (ext === ".webm") res.setHeader("Content-Type", "video/webm");
      // Allow range requests for seeking in rooms
      res.setHeader("Accept-Ranges", "bytes");
    },
  })
);
app.use(express.static(path.join(__dirname, "client")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    tmdb: !!(TMDB_KEY || TMDB_TOKEN),
    rooms: rooms.rooms.size,
  });
});

app.get("/api/rooms", (req, res) => {
  res.json(rooms.listPublic({ q: req.query.q || "", sort: req.query.sort || "viewers" }));
});

app.get("/api/activity", (_req, res) => res.json(store.listActivity()));
app.get("/api/achievements", (_req, res) => res.json(store.achievements()));

app.get("/api/profile/:id", (req, res) => {
  const p = store.getProfile(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

app.post("/api/profile", (req, res) => {
  const { id, name, color, avatar, bio, displayName, settings } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });
  const clean = sanitizeName(name);
  const profile = store.upsertProfile(id, {
    name: clean,
    displayName: sanitizeName(displayName || clean),
    color: color || "#9D5CFF",
    avatar: sanitizeAvatar(avatar),
    bio: String(bio || "").slice(0, 160),
    settings: settings || undefined,
    ownedPacks: req.body?.ownedPacks,
    cosmetics: req.body?.cosmetics,
  });
  if (req.body?.matchingFit) store.recordMatchingFit(id);
  res.json(profile);
});

app.post("/api/friends/request", (req, res) => {
  const { fromId, toName } = req.body || {};
  res.json(store.requestFriend(fromId, toName));
});

app.post("/api/friends/accept", (req, res) => {
  const { id, fromId } = req.body || {};
  res.json(store.acceptFriend(id, fromId));
});

app.get("/api/friends/:id", (req, res) => res.json(store.listFriends(req.params.id)));

app.get("/api/tmdb/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const type = req.query.type === "tv" ? "tv" : "movie";
    const page = Number(req.query.page) || 1;
    if (!q) return res.json({ results: [], page: 1, total_pages: 0 });
    const data = await tmdb(`/search/${type}?query=${encodeURIComponent(q)}&page=${page}`);
    res.json(normalizeTmdb(data, type));
  } catch (err) {
    res.status(502).json({ error: err.message, results: [] });
  }
});

app.get("/api/tmdb/category", async (req, res) => {
  try {
    const cat = req.query.cat || "trending";
    const type = req.query.type === "tv" ? "tv" : "movie";
    const page = Number(req.query.page) || 1;
    const pathMap = {
      trending: `/trending/${type}/week?page=${page}`,
      popular: `/${type}/popular?page=${page}`,
      new: type === "tv" ? `/tv/on_the_air?page=${page}` : `/movie/now_playing?page=${page}`,
      top: `/${type}/top_rated?page=${page}`,
    };
    const data = await tmdb(pathMap[cat] || pathMap.trending);
    res.json(normalizeTmdb(data, type));
  } catch (err) {
    res.status(502).json({ error: err.message, results: [] });
  }
});

app.post("/api/upload", (req, res) => {
  videoUpload.single("video")(req, res, (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "This video is too large. Maximum size is 10 GB."
          : err.message || "Upload failed";
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: "No file" });
    const ext = path.extname(req.file.filename).toLowerCase();
    const mimeByExt = {
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska",
      ".mov": "video/quicktime",
      ".m4v": "video/x-m4v",
    };
    res.json({
      ok: true,
      url: `/uploads/videos/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
      ext,
      contentType: mimeByExt[ext] || req.file.mimetype || "application/octet-stream",
      // Browser may not play MKV natively — client shows a note; file is still stored
      mayNeedCompatiblePlayer: ext === ".mkv",
    });
  });
});

app.post("/api/chat-image", chatImageUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image" });
  res.json({
    url: `/uploads/chat/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size,
  });
});

app.post("/api/rooms/create", (req, res) => {
  try {
    const body = req.body || {};
    const id = String(body.userId || ("u_" + Date.now())).slice(0, 64);
    const displayName = sanitizeName(body.displayName || body.userName || body.name || "Guest");
    const username = makeUsername(body.username || displayName, id);
    bindUsername(id, username);
    const user = {
      id,
      username,
      name: displayName,
      displayName,
      color: body.color || "#9D5CFF",
      avatar: String(body.avatar || "🎬").slice(0, 4),
      cosmetics: body.cosmetics || null,
    };
    store.upsertProfile(id, user);
    const roomType = (body.roomType === "couples" || body.couples || body.isCouples) ? "couples" : "normal";
    const room = rooms.create({
      name: body.roomName || (roomType === "couples" ? `${user.name}'s Date Night` : `${user.name}'s Room`),
      host: user,
      isPublic: roomType === "couples" ? false : !!body.isPublic,
      password: body.password || "",
      maxUsers: roomType === "couples" ? 2 : undefined,
      icon: roomType === "couples" ? "💞" : body.icon || "🍿",
      theme: roomType === "couples" ? "romance" : body.theme || "purple",
      roomType,
    });
    store.recordRoomCreated(user.id, room.name);
    try { if (roomType === "couples") store.recordCouplesRoom(user.id); } catch (_) {}
    try { pushProfile(io, user.id); } catch (_) {}
    console.log("room created", room && room.code);
    res.json({ ok: true, room, user });
  } catch (err) {
    res.status(500).json({ error: err.message || "Create failed" });
  }
});

app.post("/api/rooms/join", (req, res) => {
  try {
    const body = req.body || {};
    const id = String(body.userId || ("u_" + Date.now())).slice(0, 64);
    const displayName = sanitizeName(body.displayName || body.userName || "Guest");
    const username = makeUsername(body.username || displayName, id);
    bindUsername(id, username);
    const user = {
      id,
      username,
      name: displayName,
      displayName,
      color: body.color || "#9D5CFF",
      avatar: sanitizeAvatar(body.avatar),
      cosmetics: body.cosmetics || null,
    };
    store.upsertProfile(id, user);
    const result = rooms.join(body.code, user, body.password || "");
    if (result.error) return res.status(400).json(result);
    res.json({ ok: true, ...result, user });
  } catch (err) {
    res.status(500).json({ error: err.message || "Join failed" });
  }
});

// SPA fallback — never swallow /api
app.get("*", (req, res) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io") || req.path.startsWith("/uploads")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.sendFile(path.join(__dirname, "client", "index.html"));
});

io.on("connection", (socket) => {
  socket.data.user = null;
  socket.data.room = null;

  socket.on("hello", (user, cb) => {
    const id = String(user?.id || socket.id).slice(0, 64);
    // displayName can collide; username must be unique
    const displayName = sanitizeName(user?.displayName || user?.name);
    let username = sanitizeUsername(user?.username);
    if (!username || (idByUsername.has(username) && idByUsername.get(username) !== id)) {
      username = makeUsername(user?.username || displayName, id);
    } else {
      username = makeUsername(username, id);
    }
    bindUsername(id, username);
    socket.data.user = {
      id,
      username,
      name: displayName, // legacy field = display name for chat labels
      displayName,
      color: user?.color || "#9D5CFF",
      avatar: sanitizeAvatar(user?.avatar),
      cosmetics: user?.cosmetics || null,
    };
    store.upsertProfile(id, socket.data.user);
    // If already in a room, refresh member cosmetics so others see equipped rings
    const code = socket.data.room;
    if (code) {
      const room = rooms.get(code);
      if (room && room.users && room.users.has(id)) {
        const prev = room.users.get(id) || {};
        room.users.set(id, {
          ...prev,
          ...socket.data.user,
          isHost: prev.isHost || id === room.hostId,
          joinedAt: prev.joinedAt || Date.now(),
        });
        io.to(code).emit("room:state", rooms.publicRoom(room));
      }
    }
    if (typeof cb === "function") cb({ ok: true, user: socket.data.user });
  });

  socket.on("room:create", (payload, cb) => {
    const user = socket.data.user;
    if (!user) return cb?.({ error: "Say hello first" });
    const roomType = (payload?.roomType === "couples" || payload?.couples || payload?.isCouples) ? "couples" : "normal";
    const room = rooms.create({
      name: payload?.name || (roomType === "couples" ? `${user.name}'s Date Night` : `${user.name}'s Room`),
      host: user,
      isPublic: roomType === "couples" ? false : !!payload?.isPublic,
      password: payload?.password || "",
      maxUsers: roomType === "couples" ? 2 : payload?.maxUsers,
      icon: roomType === "couples" ? "💞" : payload?.icon || "🍿",
      theme: roomType === "couples" ? "romance" : payload?.theme || "purple",
      roomType,
    });
    socket.join(room.code);
    socket.data.room = room.code;
    store.recordRoomCreated(user.id, room.name);
    try { if (roomType === "couples") store.recordCouplesRoom(user.id); } catch (_) {}
    try { pushProfile(io, user.id); } catch (_) {}
    io.emit("rooms:changed");
    cb?.({ ok: true, room });
    socket.to(room.code).emit("room:state", room);
  });

  socket.on("room:join", (payload, cb) => {
    const user = socket.data.user;
    if (!user) return cb?.({ error: "Say hello first" });
    const result = rooms.join(payload?.code, user, payload?.password || "");
    if (result.error) return cb?.(result);
    socket.join(result.room.code);
    socket.data.room = result.room.code;
    store.recordJoin(user.id, result.room.name, result.room.users.length);
    try { pushProfile(io, user.id); } catch (_) {}
    if (result.room.roomType === "couples" && result.room.users.length >= 2) {
      store.recordCouplesWatch(user.id);
      const hostId = result.room.hostId;
      if (hostId) store.recordCouplesWatch(hostId);
    }
    io.to(result.room.code).emit("room:state", result.room);
    io.to(result.room.code).emit("chat:system", {
      text: result.room.roomType === "couples"
        ? `${user.name} joined the date 💞`
        : `${user.name} joined the room`,
    });
    io.emit("rooms:changed");
    cb?.({ ok: true, ...result, sync: rooms.syncPayload(rooms.get(result.room.code)) });
  });

  socket.on("room:leave", () => leaveRoom(socket));

  socket.on("room:meta", (patch, cb) => {
    const room = hostRoom(socket);
    if (!room) return cb?.({ error: "Host only" });
    const next = rooms.updateMeta(room.code, patch || {});
    io.to(room.code).emit("room:state", next);
    io.emit("rooms:changed");
    cb?.({ ok: true, room: next });
  });

  socket.on("room:kick", (targetId, cb) => {
    const room = hostRoom(socket);
    if (!room) return cb?.({ error: "Host only" });
    const next = rooms.kick(room.code, targetId);
    io.to(room.code).emit("room:kick", { targetId });
    io.to(room.code).emit("room:state", next);
    cb?.({ ok: true });
  });

  socket.on("room:transfer", (targetId, cb) => {
    const room = hostRoom(socket);
    if (!room) return cb?.({ error: "Host only" });
    const next = rooms.transfer(room.code, targetId);
    io.to(room.code).emit("room:state", next);
    io.to(room.code).emit("chat:system", { text: "Host transferred" });
    cb?.({ ok: true });
  });

  socket.on("video:load", (video, cb) => {
    const room = hostRoom(socket);
    if (!room) return cb?.({ error: "Host only" });
    const mediaType = video?.mediaType === "tv" ? "tv" : video?.provider === "vidking" && video?.season ? "tv" : "movie";
    const packed = {
      provider: video.provider || "vidking",
      tmdbId: video.tmdbId || null,
      mediaType,
      title: String(video.title || "Untitled").slice(0, 120),
      poster: video.poster || "",
      src: video.src || "",
      season: mediaType === "tv" ? Number(video.season) || 1 : null,
      episode: mediaType === "tv" ? Number(video.episode) || 1 : null,
      color: (video.color || "9D5CFF").replace("#", ""),
    };
    rooms.setVideo(room.code, packed);
    const next = rooms.publicRoom(rooms.get(room.code));
    io.to(room.code).emit("video:load", packed);
    io.to(room.code).emit("room:state", next);
    io.emit("rooms:changed");
    store.recordWatch(socket.data.user.id, packed);
    cb?.({ ok: true });
  });

  socket.on("sync:host", (state) => {
    const room = hostRoom(socket);
    if (!room) return;
    const payload = rooms.setPlayback(room.code, {
      playing: !!state?.playing,
      time: Number(state?.time) || 0,
      rate: Number(state?.rate) || 1,
    });
    const action = state?.action || "tick";
    const msg = {
      ...payload,
      action,
      hostId: socket.data.user?.id,
    };
    // Host is authority: always broadcast to others.
    // Non-tick actions (play/pause/seek/skip/force) go to entire room so late joiners catch up.
    if (action === "tick") {
      socket.to(room.code).emit("sync:state", msg);
    } else {
      io.to(room.code).emit("sync:state", msg);
    }
  });

  socket.on("sync:negotiate", () => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    // Forward to host only — host runs pause/capture/broadcast/resume
    for (const [id, sock] of io.of("/").sockets) {
      if (sock.data && sock.data.room === room.code && sock.data.user && sock.data.user.id === room.hostId) {
        sock.emit("sync:negotiate", { from: socket.data.user && socket.data.user.id });
        return;
      }
    }
    // Fallback: soft resync from server state if host socket not found
    socket.emit("sync:state", { ...rooms.syncPayload(room), action: "force", hostId: room.hostId });
  });

  socket.on("sync:request", (opts) => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    const force = !!(opts && opts.force);
    const action = force ? "force" : "resync";
    // Live extrapolated time from server room state (host authority)
    const payload = rooms.syncPayload(room);
    socket.emit("sync:state", { ...payload, action, hostId: room.hostId });
    if (room.video) socket.emit("video:load", room.video);
  });

  socket.on("chat:send", (msg, cb) => {
    const code = socket.data.room;
    const room = rooms.get(code);
    const user = socket.data.user;
    if (!room || !user) return;
    if (room.chatMuted && user.id !== room.hostId) return cb?.({ error: "Chat muted" });
    if (!allowChat(socket.id)) return cb?.({ error: "Slow down" });
    const text = String(msg?.text || "").slice(0, 400).trim();
    const image = msg?.image ? String(msg.image).slice(0, 300) : null;
    if (!text && !image) return;
    if (image && !image.startsWith("/uploads/chat/")) return cb?.({ error: "Invalid image" });
    store.recordMessage(user.id);
    try { pushProfile(io, user.id); } catch (_) {}
    if (room.roomType === "couples") store.recordCouplesChat(user.id);
    const packed = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: user.id,
      name: user.name,
      color: user.color,
      isHost: user.id === room.hostId,
      text: text || "",
      image,
      replyTo: msg?.replyTo || null,
      at: Date.now(),
      cosmetics: user.cosmetics || null,
      avatar: user.avatar || "🎬",
    };
    io.to(code).emit("chat:message", packed);
    cb?.({ ok: true });
  });

  socket.on("chat:typing", (on) => {
    const code = socket.data.room;
    const user = socket.data.user;
    if (!code || !user) return;
    socket.to(code).emit("chat:typing", { name: user.name, on: !!on });
  });

  socket.on("react", (emoji) => {
    const code = socket.data.room;
    const room = rooms.get(code);
    const user = socket.data.user;
    if (!room || !user || !room.reactionsEnabled) return;
    const em = String(emoji || "❤️").slice(0, 4);
    if (em === "❤️" || em === "💕" || em === "💗" || em === "💖") store.recordHeart(user.id);
    else if (store.recordReact) store.recordReact(user.id);
    try { pushProfile(io, user.id); } catch (_) {}
    io.to(code).emit("react", { emoji: em, name: user.name });
  });


  // WebRTC voice signaling (mesh for small rooms)
  socket.on("voice:join", () => {
    const code = socket.data.room;
    const user = socket.data.user;
    if (!code || !user) return;
    socket.data.inVoice = true;
    if (store.recordVoice) { store.recordVoice(user.id); try { pushProfile(io, user.id); } catch (_) {} }
    socket.to(code).emit("voice:peer-joined", { id: user.id, name: user.name });
    // tell joiner who is already in voice
    const room = rooms.get(code);
    if (!room) return;
    const peers = [];
    for (const [, s] of io.of("/").sockets) {
      if (s.data.room === code && s.data.inVoice && s.id !== socket.id && s.data.user) {
        peers.push({ id: s.data.user.id, name: s.data.user.name });
      }
    }
    socket.emit("voice:peers", peers);
  });

  socket.on("voice:leave", () => {
    const code = socket.data.room;
    const user = socket.data.user;
    socket.data.inVoice = false;
    if (code && user) socket.to(code).emit("voice:peer-left", { id: user.id });
  });

  socket.on("voice:signal", (payload) => {
    const code = socket.data.room;
    const user = socket.data.user;
    if (!code || !user || !payload?.to) return;
    for (const [, s] of io.of("/").sockets) {
      if (s.data.room === code && s.data.user && s.data.user.id === payload.to) {
        s.emit("voice:signal", {
          from: user.id,
          fromName: user.name,
          data: payload.data,
        });
        break;
      }
    }
  });

  socket.on("disconnect", () => leaveRoom(socket));
});

function leaveRoom(socket) {
  const code = socket.data.room;
  const user = socket.data.user;
  if (socket.data.inVoice && code && user) {
    socket.data.inVoice = false;
    socket.to(code).emit("voice:peer-left", { id: user.id });
  }
  if (!code || !user) return;
  const result = rooms.leave(code, user.id);
  socket.leave(code);
  socket.data.room = null;
  if (result && !result.empty) {
    io.to(code).emit("room:state", result.room);
    io.to(code).emit("chat:system", { text: `${user.name} left the room` });
  }
  io.emit("rooms:changed");
}

function hostRoom(socket) {
  const code = socket.data.room;
  const user = socket.data.user;
  if (!code || !user) return null;
  if (!rooms.isHost(code, user.id)) return null;
  return rooms.get(code);
}



function allowChat(id) {
  const t = Date.now();
  const prev = chatRate.get(id) || [];
  const next = prev.filter((x) => t - x < 3000);
  if (next.length >= 6) return false;
  next.push(t);
  chatRate.set(id, next);
  return true;
}

async function tmdb(apiPath) {
  const url = new URL(TMDB_BASE + apiPath);
  const headers = { Accept: "application/json" };
  if (TMDB_TOKEN) {
    headers.Authorization = `Bearer ${TMDB_TOKEN}`;
  } else if (TMDB_KEY) {
    url.searchParams.set("api_key", TMDB_KEY);
  } else {
    throw new Error("TMDB not configured");
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

function normalizeTmdb(data, type) {
  const results = (data.results || []).map((item) => ({
    id: item.id,
    mediaType: item.media_type === "tv" || type === "tv" ? "tv" : "movie",
    title: item.title || item.name || "Untitled",
    year: (item.release_date || item.first_air_date || "").slice(0, 4),
    rating: item.vote_average ? Number(item.vote_average).toFixed(1) : "–",
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
    overview: item.overview || "",
  }));
  return { results, page: data.page || 1, total_pages: data.total_pages || 1 };
}

function loadDotEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

server.listen(PORT, "0.0.0.0", () => {
  const tmdbOn = !!(TMDB_KEY || TMDB_TOKEN);
  console.log(`🎬 WatchSync → http://0.0.0.0:${PORT}`);
  console.log(`   TMDB ${tmdbOn ? "enabled" : "missing — set TMDB_API_KEY on Render"}`);
});
