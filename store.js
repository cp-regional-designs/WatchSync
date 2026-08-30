/**
 * Lightweight JSON store for profiles, friends, activity, achievements.
 * Swap this file later for Mongo / Firebase / Supabase.
 */

const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "data");
const FILES = {
  profiles: path.join(DATA, "profiles.json"),
  friends: path.join(DATA, "friends.json"),
  activity: path.join(DATA, "activity.json"),
};

function load(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function save(file, data) {
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn("store save failed", err.message);
  }
}

const ACHIEVEMENTS = [
  { id: "first_watch", name: "First Watch Party", emoji: "🍿", desc: "Finish your first movie", pack: "pack_cinema", xp: 30 },
  { id: "marathon", name: "Movie Marathon", emoji: "🎬", desc: "Watch 3 movies", pack: "pack_marathon", xp: 40 },
  { id: "five_movies", name: "Cinema Master", emoji: "⭐", desc: "Watch 5 movies", pack: "pack_legend", xp: 60 },
  { id: "first_room", name: "Host Debut", emoji: "👑", desc: "Create your first room", pack: "pack_host", xp: 20 },
  { id: "ten_rooms", name: "Party Planner", emoji: "🎉", desc: "Create 10 rooms", pack: "pack_party", xp: 50 },
  { id: "with_friends", name: "Social Butterfly", emoji: "🦋", desc: "Watch with a friend", pack: "pack_social", xp: 25 },
  { id: "chatter", name: "Active Chatter", emoji: "💬", desc: "Send 20 chat messages", pack: "pack_chatty", xp: 25 },
  { id: "premium", name: "Premium Viewer", emoji: "💎", desc: "Reach level 5", pack: "pack_premium", xp: 50 },
  { id: "first_heart", name: "First Heart", emoji: "💗", desc: "Send a heart reaction", pack: "pack_sweetheart", xp: 15 },
  { id: "couples_room", name: "Date Night Host", emoji: "💞", desc: "Create a couples room", pack: "pack_date_night", xp: 30 },
  { id: "couples_watch", name: "Movie Date", emoji: "🌹", desc: "Watch in a couples room", pack: "pack_rose_garden", xp: 30 },
  { id: "love_chatter", name: "Sweet Talker", emoji: "💌", desc: "10 couples-room messages", pack: "pack_love_letters", xp: 30 },
  { id: "matching_fit", name: "Matching Fit", emoji: "✨", desc: "Equip couple cosmetic", pack: "pack_twin_flame", xp: 30 },
  { id: "long_date", name: "All Nighter", emoji: "🌙", desc: "Couples room 30+ min", pack: "pack_midnight", xp: 40 },
  { id: "voice_first", name: "Mic Drop", emoji: "🎙️", desc: "Join voice lobby", pack: "pack_voice", xp: 20 },
  { id: "react_spam", name: "Reaction King", emoji: "🤩", desc: "Send 15 reactions", pack: "pack_hype", xp: 25 },
  { id: "uploader", name: "Film Collector", emoji: "📁", desc: "Upload an MP4", pack: "pack_collector", xp: 30 },
  { id: "night_owl", name: "Night Owl", emoji: "🦉", desc: "Online past midnight", pack: "pack_night", xp: 20 },
];

const OWNER_USERNAMES = new Set(["shadowspark7615"]);
const ALL_PACKS = [
  "pack_starter","pack_cinema","pack_marathon","pack_legend","pack_host","pack_party",
  "pack_social","pack_chatty","pack_premium","pack_sweetheart","pack_date_night",
  "pack_rose_garden","pack_love_letters","pack_twin_flame","pack_midnight",
  "pack_voice","pack_hype","pack_collector","pack_night","pack_fonts","pack_banners_plus","pack_owner",
];
function isOwnerProfile(p) {
  if (!p) return false;
  const u = String(p.username || "").toLowerCase().replace(/^@/, "");
  return OWNER_USERNAMES.has(u);
}
function grantEverything(p) {
  p.achievements = ACHIEVEMENTS.map((a) => a.id);
  p.ownedPacks = ALL_PACKS.slice();
  p.orbs = Math.max(p.orbs || 0, 99999);
  p.xp = Math.max(p.xp || 0, 5000);
  p.level = Math.max(p.level || 1, 50);
  p.owner = true;
  return p;
}

class Store {
  constructor() {
    this.profiles = load(FILES.profiles, {});
    this.friends = load(FILES.friends, {});
    this.activity = load(FILES.activity, []);
  }

  persist() {
    save(FILES.profiles, this.profiles);
    save(FILES.friends, this.friends);
    save(FILES.activity, this.activity.slice(0, 200));
  }

  getProfile(id) {
    return this.profiles[id] || null;
  }

  upsertProfile(id, patch) {
    const prev = this.profiles[id] || {
      id,
      name: "Guest",
      displayName: "Guest",
      color: "#9D5CFF",
      avatar: "🎬",
      bio: "",
      joinedAt: Date.now(),
      xp: 0,
      level: 1,
      watchTime: 0,
      moviesCompleted: 0,
      roomsCreated: 0,
      roomsJoined: 0,
      messagesSent: 0,
      favorites: [],
      history: [],
      achievements: [],
      ownedPacks: ["pack_starter"],
      settings: { theme: "purple", animations: true, online: true },
    };
    const next = { ...prev, ...patch, id };
    if (isOwnerProfile(next)) grantEverything(next);
    this.profiles[id] = next;
    this.persist();
    return next;
  }

  addXp(id, amount, reason) {
    const p = this.getProfile(id) || this.upsertProfile(id, {});
    p.xp = (p.xp || 0) + amount;
    p.level = Math.max(1, Math.floor(p.xp / 100) + 1);
    if (p.level >= 5) this.unlock(id, "premium");
    this.persist();
    return p;
  }

  unlock(id, achId) {
    const p = this.getProfile(id) || this.upsertProfile(id, {});
    if (isOwnerProfile(p)) {
      grantEverything(p);
      this.persist();
      return ACHIEVEMENTS.find((a) => a.id === achId) || { id: achId };
    }
    if (!p.achievements) p.achievements = [];
    if (p.achievements.includes(achId)) return null;
    p.achievements.push(achId);
    const ach = ACHIEVEMENTS.find((a) => a.id === achId);
    p.ownedPacks = p.ownedPacks || ["pack_starter"];
    if (ach && ach.pack && !p.ownedPacks.includes(ach.pack)) p.ownedPacks.push(ach.pack);
    if (ach && ach.xp) p.xp = (p.xp || 0) + ach.xp;
    p.orbs = (p.orbs || 0) + 25;
    p.level = Math.max(1, Math.floor((p.xp || 0) / 100) + 1);
    this.pushActivity({
      type: "achievement",
      user: p.displayName || p.name,
      text: `${p.displayName || p.name} unlocked ${ach ? ach.name : achId}` + (ach && ach.pack ? " · pack unlocked!" : ""),
    });
    this.persist();
    return ach || { id: achId };
  }

  recordHeart(id) {
    this.unlock(id, "first_heart");
    this.addXp(id, 5, "heart");
    this.recordReact(id);
  }
  recordReact(id) {
    const p = this.getProfile(id) || this.upsertProfile(id, {});
    p.reactCount = (p.reactCount || 0) + 1;
    if (p.reactCount >= 15) this.unlock(id, "react_spam");
    this.persist();
  }
  recordVoice(id) { this.unlock(id, "voice_first"); this.addXp(id, 10, "voice"); }
  recordUpload(id) { this.unlock(id, "uploader"); this.addXp(id, 20, "upload"); }


  recordCouplesRoom(id) {
    this.unlock(id, "couples_room");
  }

  recordCouplesWatch(id) {
    this.unlock(id, "couples_watch");
  }

  recordCouplesChat(id) {
    const p = this.getProfile(id) || this.upsertProfile(id, {});
    p.couplesMessages = (p.couplesMessages || 0) + 1;
    if (p.couplesMessages >= 10) this.unlock(id, "love_chatter");
    this.persist();
  }

  recordMatchingFit(id) {
    this.unlock(id, "matching_fit");
  }


  recordWatch(id, movie) {
    const p = this.getProfile(id) || this.upsertProfile(id, {});
    p.history = [{ ...movie, at: Date.now() }, ...(p.history || [])].slice(0, 40);
    p.moviesCompleted = (p.moviesCompleted || 0) + 1;
    if (p.moviesCompleted >= 1) this.unlock(id, "first_watch");
    if (p.moviesCompleted >= 3) this.unlock(id, "marathon");
    if (p.moviesCompleted >= 5) this.unlock(id, "five_movies");
    this.addXp(id, 25, "watch");
    this.pushActivity({ type: "watch", user: p.name, text: `${p.name} watched ${movie.title || "a movie"}` });
    return p;
  }

  recordRoomCreated(id, roomName) {
    const p = this.getProfile(id) || this.upsertProfile(id, {});
    p.roomsCreated = (p.roomsCreated || 0) + 1;
    this.unlock(id, "first_room");
    if (p.roomsCreated >= 10) this.unlock(id, "ten_rooms");
    this.addXp(id, 15, "room");
    this.pushActivity({ type: "room", user: p.name, text: `${p.name} created ${roomName}` });
  }

  recordJoin(id, roomName, viewerCount) {
    const p = this.getProfile(id) || this.upsertProfile(id, {});
    p.roomsJoined = (p.roomsJoined || 0) + 1;
    if (viewerCount >= 2) this.unlock(id, "with_friends");
    this.addXp(id, 5, "join");
    this.pushActivity({ type: "join", user: p.name, text: `${p.name} joined ${roomName}` });
  }

  recordMessage(id) {
    const p = this.getProfile(id) || this.upsertProfile(id, {});
    p.messagesSent = (p.messagesSent || 0) + 1;
    if (p.messagesSent >= 20) this.unlock(id, "chatter");
    this.persist();
  }

  requestFriend(fromId, toName) {
    const target = Object.values(this.profiles).find(
      (p) => p.name.toLowerCase() === String(toName).toLowerCase()
    );
    if (!target) return { error: "User not found" };
    if (target.id === fromId) return { error: "That's you" };
    this.friends[target.id] = this.friends[target.id] || { incoming: [], accepted: [] };
    this.friends[fromId] = this.friends[fromId] || { incoming: [], accepted: [] };
    if (!this.friends[target.id].incoming.includes(fromId)) this.friends[target.id].incoming.push(fromId);
    this.persist();
    return { ok: true, to: target.name };
  }

  acceptFriend(id, fromId) {
    const me = this.friends[id] || { incoming: [], accepted: [] };
    me.incoming = me.incoming.filter((x) => x !== fromId);
    if (!me.accepted.includes(fromId)) me.accepted.push(fromId);
    this.friends[id] = me;
    const them = this.friends[fromId] || { incoming: [], accepted: [] };
    if (!them.accepted.includes(id)) them.accepted.push(id);
    this.friends[fromId] = them;
    this.persist();
    return { ok: true };
  }

  listFriends(id) {
    const pack = this.friends[id] || { incoming: [], accepted: [] };
    return {
      incoming: pack.incoming.map((fid) => this.profiles[fid]).filter(Boolean),
      friends: pack.accepted.map((fid) => this.profiles[fid]).filter(Boolean),
    };
  }

  pushActivity(item) {
    this.activity.unshift({ ...item, at: Date.now() });
    this.activity = this.activity.slice(0, 80);
    this.persist();
  }

  listActivity() {
    return this.activity.slice(0, 30);
  }

  achievements() {
    return ACHIEVEMENTS;
  }
}

module.exports = { Store, ACHIEVEMENTS };
