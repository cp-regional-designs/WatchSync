/* WatchSync V1.0.0 */

  function recoverCreateBtn() {
    document.querySelectorAll("button").forEach((b) => {
      if (/creating/i.test(b.textContent || "")) {
        b.disabled = false;
        b.textContent = b.dataset.label || "Create";
      }
    });
  }
/* WatchSync client — rooms, library, chat, host sync, persistent guest profile */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const PROFILE_KEY = "ws_profile_v3";
  const COOKIE = "ws_uid";

  const state = {
    me: null,
    page: "home",
    room: null,
    isHost: false,
    socket: null,
    player: null,
    lib: { type: "movie", cat: "trending", q: "", page: 1, loading: false, more: true },
    lastSync: Date.now(),
    applying: false,
    voice: null,
  };

  function uid() {
    // Stable unique id per browser profile (not the display name)
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return "u_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    }
    return "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function makeLocalUsername(seed) {
    const adj = ["cool","swift","neon","cosmic","quiet","brave","lucky","hyper","vivid","pixel"];
    const noun = ["fox","wave","nova","byte","spark","orbit","ember","luna","kite","drift"];
    const a = adj[Math.floor(Math.random() * adj.length)];
    const n = noun[Math.floor(Math.random() * noun.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const base = String(seed || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8);
    return ((base || a + n) + num).slice(0, 18);
  }

  function cookie(name) {
    const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? m[2] : "";
  }

    function loadMe() {
    let me = null;
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) me = JSON.parse(raw);
    } catch (_) {}
    if (!me || typeof me !== "object") {
      me = {
        id: uid(),
        username: makeLocalUsername(""),
        name: "",
        displayName: "",
        avatar: "🎬",
        color: "#9D5CFF",
        bio: "",
        xp: 0,
        level: 1,
        history: [],
        achievements: [],
        moviesCompleted: 0,
        roomsCreated: 0,
        joinedAt: Date.now(),
      };
    }
    // Permanent unique id — never tied to display name
    if (!me.id || me.id.length < 8) me.id = uid();
    if (!me.username) me.username = makeLocalUsername(me.name || me.displayName || "");
    // displayName is what others see; may collide
    me.displayName = me.displayName || me.name || "";
    me.name = me.displayName; // keep legacy field in sync for older UI
    if (String(me.username || "").toLowerCase().replace(/^@/, "") === "shadowspark7615") {
      me.owner = true;
      me.username = "shadowspark7615";
    }
    if (window.WSCosmetics) WSCosmetics.ensureCosmetics(me);
    return me;
  }


  /** Render PFP + equipped ring via shared WSCosmetics path (never dump URL as text). */
  function paintAvatar(el, me, sizeClass) {
    if (!el) return;
    const user = me || state.me;
    if (window.WSCosmetics && WSCosmetics.renderAvatar) {
      el.innerHTML = WSCosmetics.renderAvatar(user, sizeClass || "md");
      el.classList.add("avatar-host");
    } else {
      const photo =
        user.avatarUrl ||
        (user.avatar && (String(user.avatar).startsWith("/") || String(user.avatar).startsWith("http"))
          ? user.avatar
          : null);
      const letter = String(user.displayName || user.name || "?").charAt(0).toUpperCase();
      el.innerHTML = photo
        ? `<img class="avatar" src="${esc(photo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`
        : `<span>${esc(user.avatar && String(user.avatar).length <= 3 ? user.avatar : letter)}</span>`;
    }
  }

  function saveMe() {
    state.me.id = state.me.id || uid();
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(state.me));
    } catch {}
    fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.me),
    }).catch(() => {});
  }

  function icons(root) {
    try {
      if (window.lucide && lucide.createIcons) lucide.createIcons({ root: root || document });
    } catch (_) {}
  }

  function toast(msg) {
    const el = $("#toast");
    if (!el) {
      console.log(msg);
      return;
    }
    el.textContent = msg;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 2400);
  }

  function showModal(html) {
    $("#modalCard").innerHTML = html;
    $("#modal").classList.remove("hidden");
  }
  function hideModal() {
    $("#modal").classList.add("hidden");
  }
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") hideModal();
  });

  function setPage(name) {
    state.page = name;
    $$(".page").forEach((p) => p.classList.toggle("active", p.dataset.page === name));
    $$("#tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.nav === name));
    if (name === "library") loadLibrary(true);
    if (name === "discover") loadRooms();
    if (name === "friends") loadFriends();
    if (name === "profile") renderProfile();
    if (name === "home") refreshHome();
  }

  function enterApp() {
    $("#gate").classList.add("hidden");
    $("#shell").classList.remove("hidden");
    $("#meName").textContent = state.me.displayName || state.me.name || "Guest";
    paintAvatar($("#meAvatar"), state.me, "sm");
    document.documentElement.style.setProperty("--purple", state.me.color || "#9D5CFF");
    connect();
    refreshHome();
    renderProfile();
    icons();
  }

  function connect() {
    if (state.socket && state.socket.connected) {
      state.socket.emit("hello", state.me, function (res) {
        state.helloOk = true;
        if (res && res.user && res.user.username) {
          state.me.username = res.user.username;
          saveMe();
        }
      });
      return state.socket;
    }
    if (typeof io !== "function") {
      toast("Socket.IO failed to load — refresh the page");
      return null;
    }
    const url = (window.WS_CONFIG && window.WS_CONFIG.socketUrl) || location.origin;
    if (state.socket) {
      try { state.socket.removeAllListeners(); state.socket.disconnect(); } catch (_) {}
    }
    const socket = io(url, { transports: ["websocket", "polling"], reconnection: true });
    state.socket = socket;
    state.helloOk = false;
    socket.on("connect", () => {
      setSyncConnection("ok");
      socket.emit("hello", state.me, function (res) {
        state.helloOk = !!(res && res.ok !== false);
        if (res && res.user) {
          if (res.user.username) state.me.username = res.user.username;
          if (res.user.id) state.me.id = res.user.id;
          saveMe();
        }
        // On reconnect, rejoin the room
        if (state.room && state.room.code) {
          socket.emit("room:join", { code: state.room.code, password: state.room.password || "" }, (jr) => {
            if (jr && jr.room) applyRoom(jr.room);
          });
        }
      });
      setTimeout(function () { if (socket.connected) state.helloOk = true; }, 300);
    });
    socket.on("rooms:changed", () => {
      if (state.page === "home" || state.page === "discover") loadRooms();
    });
    socket.on("room:state", onRoomState);
    socket.on("video:load", (video) => loadVideo(video, 0, false));
    socket.on("sync:state", onSync);
    socket.on("sync:negotiate", onSyncNegotiate);
    socket.on("chat:message", addMessage);
    socket.on("chat:system", (m) => addSystem(m.text));
    socket.on("chat:typing", (t) => {
      $("#typing").textContent = t.on ? `${t.name} is typing…` : "";
      $("#typing").classList.toggle("hidden", !t.on);
    });
    socket.on("react", spawnReact);
    socket.on("profile:sync", (data) => {
      if (!data) return;
      if (data.achievements) state.me.achievements = data.achievements;
      if (data.ownedPacks) state.me.ownedPacks = data.ownedPacks;
      if (typeof data.xp === "number") state.me.xp = data.xp;
      if (typeof data.level === "number") state.me.level = data.level;
      if (typeof data.orbs === "number") state.me.orbs = data.orbs;
      if (data.owner) state.me.owner = true;
      saveMe();
      if (window.WSCosmetics) WSCosmetics.ensureCosmetics(state.me);
      try { renderProfile(); } catch (_) {}
      try { renderHome(); } catch (_) {}
    });
    socket.on("room:kick", ({ targetId }) => {
      if (targetId === state.me.id) {
        toast("You were kicked");
        leaveRoom();
      }
    });
    socket.on("voice:peers", (list) => state.voice?.onPeers(list));
    socket.on("voice:peer-joined", (p) => state.voice?.onPeerJoined(p));
    socket.on("voice:peer-left", (p) => state.voice?.onPeerLeft(p));
    socket.on("voice:signal", (p) => state.voice?.onSignal(p));
    socket.on("disconnect", () => setSyncConnection("lost"));
    socket.on("reconnect_attempt", () => setSyncConnection("reconnect"));
  }

  /* ---------- Home / rooms ---------- */
  async function refreshHome() {
    const nm = state.me.displayName || state.me.name || "Guest";
    $("#welcomeTitle").textContent = `Welcome back ${nm}`;
    paintAvatar($("#homeAvatar"), state.me, "md");
    $("#homeLevel").textContent = `Lv ${state.me.level || 1}`;
    $("#homeXp").textContent = `${state.me.xp || 0} XP`;
    const hist = state.me.history || [];
    $("#continueRow").innerHTML = hist.slice(0, 8).map((h) => WSMovies.cardHtml({
      id: h.tmdbId || 0,
      mediaType: h.mediaType || "movie",
      title: h.title,
      poster: h.poster,
      rating: "",
      year: "",
    })).join("") || `<p class="muted">Nothing yet — open the library.</p>`;
    try {
      const act = await (await fetch("/api/activity")).json();
      $("#activityList").innerHTML = act.slice(0, 8).map((a) => `<div>${esc(a.text)}</div>`).join("") || "<div>No activity yet</div>";
    } catch {
      $("#activityList").innerHTML = "<div>No activity yet</div>";
    }
    loadRooms();
  }

  async function loadRooms() {
    const q = $("#roomSearch")?.value || "";
    const sort = $("#roomSort")?.value || "viewers";
    try {
      const list = await (await fetch(`/api/rooms?q=${encodeURIComponent(q)}&sort=${sort}`)).json();
      const html = list.map(roomCard).join("") || `<p class="muted">No public rooms right now.</p>`;
      $("#homeRooms").innerHTML = html;
      $("#discoverRooms").innerHTML = html;
    } catch {
      $("#homeRooms").innerHTML = `<p class="muted">Could not load rooms.</p>`;
    }
  }

  function roomCard(r) {
    return `<div class="room-card glass">
      <div class="icon">${r.icon || "🍿"}</div>
      <div class="grow">
        <h4>${esc(r.name)}</h4>
        <p>Host · ${esc(r.host)} ${r.movie ? " · " + esc(r.movie) : ""}</p>
        <p>${r.viewers}/${r.maxUsers}</p>
      </div>
      <button class="join" data-join="${r.code}">Join</button>
    </div>`;
  }

  /* ---------- Library ---------- */
  async function loadLibrary(reset) {
    const L = state.lib;
    if (L.loading) return;
    if (reset) {
      L.page = 1;
      L.more = true;
      $("#libGrid").innerHTML = `<div class="muted">Loading…</div>`;
    }
    if (!L.more && !reset) return;
    L.loading = true;
    $("#libMore").classList.toggle("hidden", reset);
    try {
      const data = L.q
        ? await WSMovies.search(L.q, L.type, L.page)
        : await WSMovies.fetchCategory(L.cat, L.type, L.page);
      const items = data.results || [];
      if (reset) $("#libGrid").innerHTML = "";
      if (!items.length && L.page === 1) {
        $("#libGrid").innerHTML = `<p class="muted">${data.error || "No results. Set TMDB_API_KEY on the server."}</p>`;
      } else {
        $("#libGrid").insertAdjacentHTML("beforeend", items.map(WSMovies.cardHtml).join(""));
      }
      L.more = L.page < (data.total_pages || 1);
      L.page += 1;
    } catch {
      if (reset) $("#libGrid").innerHTML = `<p class="muted">Library failed to load.</p>`;
    }
    L.loading = false;
    $("#libMore").classList.add("hidden");
  }

  $("#pages").addEventListener("scroll", () => {
    if (state.page !== "library") return;
    const el = $("#pages");
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 400) loadLibrary(false);
  });

  /* ---------- Profile / friends ---------- */
    function renderProfile() {
    if (window.WSCosmetics) WSCosmetics.ensureCosmetics(state.me);
    const hero = $("#profCosmoHero");
    const fallback = $("#profHeroFallback");
    if (hero && window.WSCosmetics) {
      // Single structured header — no duplicate floating @user / level nodes
      hero.innerHTML = WSCosmetics.renderProfileCard(state.me);
      if (fallback) fallback.classList.add("hidden");
    } else if (fallback) {
      fallback.classList.remove("hidden");
      const av = $("#profAvatar");
      if (av) paintAvatar(av, state.me, "lg");
      const pn = $("#profName");
      if (pn) pn.textContent = state.me.displayName || state.me.name;
      const pl = $("#profLevel");
      if (pl) pl.textContent = `Lv ${state.me.level || 1} · ${titleFor(state.me.level)}`;
      const pb = $("#profBio");
      if (pb) pb.textContent = state.me.bio || "";
    }
    $("#statMovies").textContent = state.me.moviesCompleted || 0;
    $("#statRooms").textContent = state.me.roomsCreated || 0;
    $("#statXp").textContent = state.me.xp || 0;
    $("#setName").value = state.me.displayName || state.me.name;
    const su = $("#setUsername");
    if (su) su.textContent = "@" + (state.me.username || "user");
    $("#setAvatar").value = state.me.avatar;
    $("#setBio").value = (window.WSCosmetics && WSCosmetics.cleanBio
      ? WSCosmetics.cleanBio(state.me.bio)
      : (state.me.bio || ""));
    $("#setColor").value = state.me.color || "#9D5CFF";
    const cosmoRoot = $("#cosmoRoot");
    if (cosmoRoot && window.WSCosmetics) {
      const packs = WSCosmetics.listPacks(state.me);
      const packHtml = `<div class="pack-grid">${packs
        .map(
          (p) =>
            `<div class="pack-card ${p.owned ? "owned" : "locked"}">
              <b>${esc(p.name)}</b>
              <span>${esc(p.desc || "")}</span>
              <em>${p.owned ? "Unlocked" : "Locked — earn achievement"}</em>
            </div>`
        )
        .join("")}</div>`;
      cosmoRoot.innerHTML = packHtml + WSCosmetics.renderPicker(state.me);
      WSCosmetics.bindPicker(cosmoRoot, state.me, () => {
        saveMe();
        if (state.me._lastRomanceEquip && state.socket) {
          fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...state.me, matchingFit: true }),
          }).catch(() => {});
        }
        renderProfile();
        $("#meName").textContent = state.me.displayName || state.me.name;
        paintAvatar($("#meAvatar"), state.me, "sm");
        paintAvatar($("#homeAvatar"), state.me, "md");
        if (state.socket) state.socket.emit("hello", state.me);
      });
    }
    const grid = $("#achGrid");
    if (grid) {
      fetch("/api/achievements")
        .then((r) => r.json())
        .then((list) => {
          const have = new Set(state.me.achievements || []);
          grid.innerHTML = list
            .map(
              (a) =>
                `<div class="ach ${have.has(a.id) ? "" : "off"}"><b>${a.emoji} ${esc(a.name)}</b><span>${esc(a.desc)}</span></div>`
            )
            .join("");
        })
        .catch(() => {});
    }
  }

  function titleFor(lv) {
    if (lv >= 50) return "Cinema Master";
    if (lv >= 10) return "Movie Fan";
    return "New Viewer";
  }

  async function loadFriends() {
    try {
      const data = await (await fetch(`/api/friends/${state.me.id}`)).json();
      $("#friendIncoming").innerHTML =
        (data.incoming || [])
          .map((p) => `<div>${esc(p.name)} <button data-accept="${p.id}">Accept</button></div>`)
          .join("") || "<div>No requests</div>";
      $("#friendList").innerHTML =
        (data.friends || []).map((p) => `<div>${p.avatar || "🎬"} ${esc(p.name)}</div>`).join("") ||
        "<div>No friends yet</div>";
    } catch {
      $("#friendList").innerHTML = "<div>Could not load friends</div>";
    }
  }

  /* ---------- Room ---------- */
  function ensureSocket(cb) {
    if (!state.me) state.me = loadMe();
    const label = (state.me && (state.me.displayName || state.me.name || "")).trim();
    if (!label) {
      toast("Enter your name first");
      return;
    }
    state.me.name = state.me.displayName || state.me.name || label;
    connect();
    const sock = state.socket;
    if (!sock) {
      toast("Not connected — refresh the page");
      return;
    }
    let done = false;
    const finish = function () {
      if (done) return;
      done = true;
      try {
        sock.emit("hello", state.me);
      } catch (_) {}
      if (typeof cb === "function") cb(sock);
    };
    if (sock.connected) {
      finish();
      return;
    }
    sock.once("connect", finish);
    setTimeout(function () {
      if (!done) {
        if (sock.connected) finish();
        else if (typeof cb === "function") {
          // still hand back socket so callers can retry emit after connect
          cb(sock);
        }
      }
    }, 5000);
  }

  async function openCreate() {
    if (!state.me) state.me = loadMe();
    if (!state.me.name) {
      toast("Enter your name first");
      return;
    }
    const roomName = (state.me.name || "Guest") + "'s Room";
    showModal(`<h3>Create room</h3>
      <div class="ws-field">
        <span class="label">Room name</span>
        <input class="ws-input" id="crName" value="${esc(roomName)}" maxlength="48" autocomplete="off" />
      </div>
      <label class="ws-toggle">
        <span><span class="tog-label">Couples room</span><span class="tog-hint">Max 2 people · private date night</span></span>
        <input type="checkbox" id="crCouples" />
        <span class="track" aria-hidden="true"></span>
      </label>
      <label class="ws-toggle">
        <span><span class="tog-label">Public</span><span class="tog-hint">Show in room browser</span></span>
        <input type="checkbox" id="crPublic" />
        <span class="track" aria-hidden="true"></span>
      </label>
      <div class="ws-field">
        <span class="label">Password (optional)</span>
        <input class="ws-input" id="crPass" type="password" autocomplete="new-password" />
      </div>
      <div class="row">
        <button class="btn-ghost" type="button" id="crCancel">Cancel</button>
        <button class="btn-primary" type="button" id="crGo">Create</button>
      </div>`);
    const crC = $("#crCouples");
    const crP = $("#crPublic");
    if (crC && crP) {
      crC.onchange = () => {
        if (crC.checked) {
          crP.checked = false;
          crP.disabled = true;
          const n = $("#crName");
          if (n && !/date|couple/i.test(n.value)) n.value = (state.me.displayName || state.me.name || "Our") + "'s Date Night";
        } else {
          crP.disabled = false;
        }
      };
    }
    icons();
    $("#crCancel").onclick = hideModal;
    $("#crGo").onclick = () => createRoomNow();
  }

  async function createRoomNow() {
    const btn = $("#crGo");
    if (btn) {
      btn.dataset.label = "Create";
      btn.disabled = true;
      btn.textContent = "Creating…";
    }
    const restore = () => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Create";
      }
      recoverCreateBtn();
    };

    if (!state.me) state.me = loadMe();
    const display = (state.me.displayName || state.me.name || "").trim();
    if (!display) {
      restore();
      toast("Enter your name first");
      return;
    }
    state.me.displayName = display;
    state.me.name = display;

    const couples = !!(document.querySelector("#crCouples") && document.querySelector("#crCouples").checked);
    const payload = {
      roomName: ($("#crName") && $("#crName").value.trim()) || (display + "'s Room"),
      name: ($("#crName") && $("#crName").value.trim()) || (display + "'s Room"),
      isPublic: !!($("#crPublic") && $("#crPublic").checked),
      password: ($("#crPass") && $("#crPass").value) || "",
      couples: couples,
      isCouples: couples,
      roomType: couples ? "couples" : "normal",
      maxUsers: couples ? 2 : 8,
      userId: state.me.id,
      userName: display,
      displayName: display,
      username: state.me.username,
      color: state.me.color,
      avatar: state.me.avatar,
      cosmetics: state.me.cosmetics || null,
    };

    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 25000);
      let res;
      try {
        res = await fetch("/api/rooms/create", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
          signal: ac.signal,
        });
      } finally {
        clearTimeout(to);
      }

      const raw = await res.text();
      if (!raw || raw.trim().startsWith("<")) {
        throw new Error("API route missing (got HTML). On Render: Root Directory empty, Start = node server.js, Clear cache & deploy this zip.");
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch (_) {
        throw new Error("Invalid server response");
      }
      if (!res.ok || data.error) {
        throw new Error(data.error || ("HTTP " + res.status));
      }
      if (!data.room || !data.room.code) {
        throw new Error("Room created but no code returned");
      }

      hideModal();
      // Enter immediately — don't wait on socket
      enterRoom(data.room, true);
      // Attach socket in background
      try {
        connect();
        const sock = state.socket;
        if (sock) {
          const join = () => {
            sock.emit("hello", state.me, () => {
              sock.emit("room:join", { code: data.room.code, password: payload.password || "" }, () => {});
            });
          };
          if (sock.connected) join();
          else sock.once("connect", join);
        }
      } catch (_) {}
      restore();
      toast("Room " + data.room.code);
      return;
    } catch (err) {
      console.error("create room", err);
      restore();
      if (err && err.name === "AbortError") {
        toast("Timed out — Render may be waking up. Wait 10s and try once more.");
      } else {
        toast((err && err.message) || "Could not create room");
      }
    }
  }

  function attachSocketToRoom(room, password, asHost) {
    return new Promise((resolve) => {
      connect();
      const go = () => {
        const sock = state.socket;
        if (!sock) {
          enterRoom(room, asHost);
          resolve();
          return;
        }
        sock.emit("hello", state.me);
        sock.emit("room:join", { code: room.code, password: password || "" }, (jr) => {
          enterRoom((jr && jr.room) || room, asHost || !!(jr && jr.isHost));
          resolve();
        });
        setTimeout(() => {
          if (!state.room) enterRoom(room, asHost);
          resolve();
        }, 1200);
      };
      if (state.socket && state.socket.connected) go();
      else if (state.socket) state.socket.once("connect", go);
      else {
        enterRoom(room, asHost);
        resolve();
      }
    });
  }

  function openJoin(code) {
    showModal(`<h3>Join room</h3>
      <input id="jnCode" placeholder="Room code" value="${code || ""}" style="text-transform:uppercase" />
      <input id="jnPass" placeholder="Password if needed" type="password" style="margin-top:8px" />
      <div class="row">
        <button class="btn-ghost" id="jnCancel">Cancel</button>
        <button class="btn-primary" id="jnGo" style="margin:0">Join</button>
      </div>`);
    $("#jnCancel").onclick = hideModal;
    $("#jnGo").onclick = () => joinRoom($("#jnCode").value, $("#jnPass").value);
  }

  function joinRoom(code, password) {
    const payload = {
      code: String(code || "").toUpperCase().trim(),
      password: password || "",
      userId: state.me.id,
      userName: state.me.displayName || state.me.name,
      displayName: state.me.displayName || state.me.name,
      username: state.me.username,
      color: state.me.color,
      avatar: state.me.avatar,
      cosmetics: state.me.cosmetics,
    };
    if (!payload.code) return toast("Enter a room code");
    fetch("/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok || d.error) throw new Error(d.error || "Join failed");
        connect();
        const go = () => {
          const sock = state.socket;
          if (sock) {
            sock.emit("hello", state.me);
            sock.emit("room:join", { code: payload.code, password: payload.password }, (jr) => {
              hideModal();
              enterRoom((jr && jr.room) || d.room, !!(jr && jr.isHost) || !!(d.isHost));
              if (d.room && d.room.video) loadVideo(d.room.video, 0, false);
            });
          } else {
            hideModal();
            enterRoom(d.room, !!d.isHost);
          }
        };
        if (state.socket && state.socket.connected) go();
        else if (state.socket) state.socket.once("connect", go);
        else {
          hideModal();
          enterRoom(d.room, !!d.isHost);
        }
      })
      .catch((err) => toast(err.message || "Join failed"));
  }

  function enterRoom(room, isHost) {
    // idle player — no fake loading spinner
    try {
      const ld = document.querySelector("#playerRoot [data-loading]");
      if (ld) ld.hidden = true;
      const lk = document.querySelector("#playerRoot [data-lock]");
      if (lk) lk.hidden = true;
    } catch (_) {}
    document.body.classList.toggle("couples-mode", room && room.roomType === "couples");

    state.room = room;
    state.isHost = isHost;
    if (!isHost && state.socket) {
      setTimeout(() => state.socket.emit("sync:request", { force: true }), 400);
    }
    if (state.player && state.player.refreshLock) state.player.refreshLock();
    $("#shell").classList.add("hidden");
    $("#room").classList.remove("hidden");
    applyRoom(room);
    if (!state.player) {
      state.player = WSPlayer.mount($("#playerRoot"), {
        isHost: () => state.isHost,
        onHostEvent: hostEvent,
      });
    }
    $$(".host-only").forEach((el) => el.classList.toggle("hidden", !isHost));
    addSystem(`Welcome to ${room.name}`);
    setupVoice();
    updateVoiceUi({ inVoice: false, muted: false, peerCount: 0, peers: [] });
  }

  function setupVoice() {
    if (state.voice) return;
    if (!window.WSVoice) return;
    state.voice = WSVoice.create({
      socket: state.socket,
      getMyId: () => state.me.id,
      onState: updateVoiceUi
    });
  }

  function updateVoiceUi(vs) {
    const status = $("#voiceStatus");
    if (status) status.textContent = vs.inVoice ? "Connected" : "Off";
    $("#voiceJoin")?.classList.toggle("hidden", vs.inVoice);
    $("#voiceLeave")?.classList.toggle("hidden", !vs.inVoice);
    $("#voiceMute")?.classList.toggle("hidden", !vs.inVoice);
    if ($("#voiceMute")) $("#voiceMute").textContent = vs.muted ? "Unmute" : "Mute";
    const vp = $("#voicePeers");
    if (vp) {
      vp.innerHTML = vs.peers.map(p => `<div><i data-lucide="mic"></i> Peer ${p.slice(0,4)}</div>`).join("");
      icons(vp);
    }
  }

  function applyRoom(room) {
    state.room = room;
    state.isHost = room.hostId === state.me.id || room.users.some((u) => u.id === state.me.id && u.isHost);
    document.body.classList.toggle("is-host", !!state.isHost);
    $("#roomName").textContent = room.name;
    const ri = $("#roomIcon");
    if (ri) {
      ri.innerHTML = room.icon && room.icon.length <= 2
        ? room.icon
        : '<i data-lucide="popcorn"></i>';
      icons(ri.parentElement || document);
    }
    $("#roomCode").textContent = room.code;
    $("#roleBadge").textContent = state.isHost ? "HOST" : "VIEWER";
    $("#roleBadge").classList.toggle("host", state.isHost);
    $$(".host-only").forEach((el) => el.classList.toggle("hidden", !state.isHost));
    if (state.player && state.player.refreshLock) state.player.refreshLock();
    const n = room.users.length;
    if ($("#userCount")) $("#userCount").textContent = n;
    if ($("#headerUserCount")) $("#headerUserCount").textContent = n;
    $("#userList").innerHTML = room.users
      .map((u) => {
        const name =
          u.cosmetics && window.WSCosmetics
            ? `<span class="${WSCosmetics.nameClass(u.cosmetics.nameplate)}" style="${WSCosmetics.styleVars(WSCosmetics.getItem(u.cosmetics.nameplate))};${WSCosmetics.fontStyle ? WSCosmetics.fontStyle(u.cosmetics.font) : ''}">${esc(u.name)}</span>`
            : esc(u.name);
        const av =
          u.cosmetics && window.WSCosmetics
            ? WSCosmetics.renderAvatar({ name: u.name, avatar: u.avatar || "🎬", cosmetics: u.cosmetics }, "sm")
            : `<span class="dot"></span>`;
        return `<div class="user-row">${av}<span class="user-name">${name}</span>${
          u.isHost ? '<span class="badge host">HOST</span>' : ""
        }${
          state.isHost && !u.isHost
            ? `<button class="btn-ghost sm" data-kick="${u.id}">Kick</button>`
            : ""
        }</div>`;
      })
      .join("");
  }

  function onRoomState(room) {
    if (!state.room || room.code !== state.room.code) return;
    applyRoom(room);
  }

  function leaveRoom() {
    document.body.classList.remove("couples-mode", "is-host");
    try { state.voice?.destroy(); } catch {}
    state.voice = null;
    if (state.socket) state.socket.emit("room:leave");
    state.player?.destroy();
    state.player = null;
    state.room = null;
    $("#chatLog").innerHTML = "";
    $("#room").classList.add("hidden");
    $("#shell").classList.remove("hidden");
    setPage("home");
  }

  function loadVideo(video, startAt, asHostAction) {
    if (!state.player || !video) return;
    const key = videoKey(video);
    const cur = state.player.current && state.player.current();
    const same = cur && videoKey(cur) === key;
    // Avoid reloading the same media (prevents Vidking "Loading content" loops)
    if (same && !asHostAction) {
      if (startAt && startAt > 1 && Math.abs((state.player.getCurrentTime() || 0) - startAt) > 5) {
        try { state.player.seek(startAt); } catch (_) {}
      }
      return;
    }
    state.player.load(video, startAt || 0);
    if (asHostAction && state.socket) {
      state.socket.emit("video:load", video);
    }
    state.me.history = [{ ...video, at: Date.now() }, ...(state.me.history || [])].slice(0, 20);
    saveMe();
  }

  /* ============================================================
   * HIGH-PRECISION SYNC ENGINE
   * - Host is authority; sends ticks + immediate play/pause/seek
   * - Viewers extrapolate with serverTime latency compensation
   * - Soft seek for small drift, hard reload for large drift
   * ============================================================ */
  
  /* HOST-AUTHORITATIVE SYNC — host broadcasts; viewers apply with latency compensation */
  state.sync = state.sync || {
    targetTime: 0,
    targetPlaying: false,
    targetRate: 1,
    lastServerTime: 0,
    skew: 0,
    lastApply: 0,
    _baseTarget: 0,
    _forceUntil: 0,
    videoKey: null,
  };

  function videoKey(v) {
    if (!v) return "";
    return [v.provider || "", v.tmdbId || "", v.src || "", v.season || "", v.episode || ""].join("|");
  }

  function setSyncBtn(mode, label) {
    const btn = $("#syncToHost");
    if (!btn) return;
    btn.classList.remove("is-synced", "is-error");
    if (mode === "syncing") {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2"></i> Syncing…';
    } else if (mode === "synced") {
      btn.disabled = false;
      btn.classList.add("is-synced");
      btn.innerHTML = '<i data-lucide="check"></i> ' + (label || "Synced");
      setTimeout(() => {
        if (!btn.classList.contains("is-error")) {
          btn.classList.remove("is-synced");
          btn.innerHTML = '<i data-lucide="refresh-cw"></i> Sync to Host';
        }
      }, 2000);
    } else if (mode === "error") {
      btn.disabled = false;
      btn.classList.add("is-error");
      btn.innerHTML = '<i data-lucide="alert-circle"></i> ' + (label || "Failed");
      setTimeout(() => {
        btn.classList.remove("is-error");
        btn.innerHTML = '<i data-lucide="refresh-cw"></i> Sync to Host';
      }, 2500);
    } else {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="refresh-cw"></i> Sync to Host';
    }
    try { if (window.lucide) lucide.createIcons(); } catch (_) {}
  }

  state.sync.seq = state.sync.seq || 0;
  state.sync.txActive = false;
  state.sync.hostWasPlaying = false;

  function requestHostSync(force) {
    if (!state.socket || !state.room) {
      setSyncBtn("error", "No room");
      toast("Not connected to a room");
      return;
    }
    if (state.sync.txActive) return;
    if (state.isHost) {
      // Host can run the same transaction to snap the room to themselves
      beginHostSyncTransaction();
      return;
    }
    setSyncBtn("syncing");
    state.sync.txActive = true;
    state.sync._forceUntil = Date.now() + 6000;
    // Ask host to pause, capture, broadcast, then resume
    state.socket.emit("sync:negotiate", { force: true });
    clearTimeout(state.sync._reqTimer);
    state.sync._reqTimer = setTimeout(() => {
      if (state.sync.txActive) {
        state.sync.txActive = false;
        setSyncBtn("error", "Timed out");
        toast("Sync timed out — try again");
      }
    }, 5500);
  }

  /** Host-only: pause → capture → broadcast → short settle → resume */
  function beginHostSyncTransaction() {
    if (!state.isHost || !state.player || !state.socket) return;
    if (state.sync.txActive) return;
    state.sync.txActive = true;
    setSyncBtn("syncing");

    const wasPlaying = !!state.player.isPlaying();
    state.sync.hostWasPlaying = wasPlaying;
    state.applying = true; // block hostEvent loops while we pause

    try {
      state.player.pause();
    } catch (_) {}

    // Capture after pause settles
    const captureAndBroadcast = () => {
      const time = Number(state.player.getCurrentTime() || 0);
      state.sync.seq = (state.sync.seq || 0) + 1;
      const seq = state.sync.seq;
      state.socket.emit("sync:host", {
        playing: false, // everyone holds pause at the barrier
        time,
        rate: 1,
        action: "commit",
        seq,
      });

      // After clients had time to seek, resume if host was playing
      clearTimeout(state.sync._txResume);
      state.sync._txResume = setTimeout(() => {
        state.applying = false;
        if (state.sync.hostWasPlaying && state.isHost) {
          try { state.player.play(); } catch (_) {}
          state.socket.emit("sync:host", {
            playing: true,
            time: Number(state.player.getCurrentTime() || time),
            rate: 1,
            action: "play",
            seq: state.sync.seq,
          });
        } else {
          hostBroadcast("pause");
        }
        state.sync.txActive = false;
        setSyncBtn("synced");
        toast("Room synced");
      }, 450);
    };

    // Brief pause so capture is stable (media seeked/paused)
    clearTimeout(state.sync._txCapture);
    state.sync._txCapture = setTimeout(captureAndBroadcast, 120);

    // Safety: never leave host paused forever
    clearTimeout(state.sync._txSafety);
    state.sync._txSafety = setTimeout(() => {
      if (!state.sync.txActive) return;
      state.applying = false;
      state.sync.txActive = false;
      if (state.sync.hostWasPlaying) {
        try { state.player.play(); } catch (_) {}
        hostBroadcast("play");
      }
      setSyncBtn("error", "Recovered");
    }, 4000);
  }

  function onSyncNegotiate() {
    // Host receives negotiate request from a client
    if (!state.isHost) return;
    beginHostSyncTransaction();
  }

  function onSync(payload) {
    if (!payload) return;
    const recvAt = Date.now();
    state.lastSync = recvAt;
    $("#syncDot")?.classList.remove("red");
    setSyncConnection("ok");

    if (state.isHost) return;
    if (!state.player) return;

    const serverTime = Number(payload.serverTime) || recvAt;
    const offsetMs = recvAt - serverTime;
    const rate = Number(payload.rate) || 1;
    let target = Number(payload.time) || 0;

    if (payload.playing) {
      const oneWay = Math.max(0, Math.min(1.5, offsetMs / 1000));
      target += oneWay * rate;
    }

    state.sync.targetTime = target;
    state.sync._baseTarget = target;
    state.sync.targetPlaying = !!payload.playing;
    state.sync.targetRate = rate;
    state.sync.lastServerTime = serverTime;
    state.sync.skew = offsetMs;

    if (payload.video) {
      const want = videoKey(payload.video);
      const have = videoKey(state.player.current && state.player.current());
      if (want && want !== have) {
        state.player.load(payload.video, target);
        state.sync.videoKey = want;
      }
    }

    const action = payload.action || "tick";
    const seq = Number(payload.seq) || 0;
    if (seq && state.sync.lastSeq && seq < state.sync.lastSeq) {
      // Stale transaction — ignore
      return;
    }
    if (seq) state.sync.lastSeq = seq;

    const forced =
      action === "force" ||
      action === "resync" ||
      action === "commit" ||
      Date.now() < (state.sync._forceUntil || 0);

    // Commit barrier: pause first, then seek
    if (action === "commit") {
      state.applying = true;
      try { state.player.pause(); } catch (_) {}
      state.sync.targetPlaying = false;
      applySyncNow("force");
      clearTimeout(state.sync._reqTimer);
      state.sync._forceUntil = 0;
      state.sync.txActive = false;
      setSyncBtn("synced");
      setTimeout(() => { state.applying = false; }, 300);
      return;
    }

    applySyncNow(forced ? "force" : action);

    if (forced) {
      clearTimeout(state.sync._reqTimer);
      state.sync._forceUntil = 0;
      state.sync.txActive = false;
      setSyncBtn("synced");
    }
  }

  function applySyncNow(action) {
    if (state.isHost || !state.player) return;
    const target = state.sync.targetTime;
    const shouldPlay = state.sync.targetPlaying;
    const local = Number(state.player.getCurrentTime() || 0);
    const abs = Math.abs(local - target);
    const nowMs = Date.now();
    const cur = state.player.current && state.player.current();
    const isVidking = !!(cur && (cur.provider === "vidking" || (!cur.provider && cur.tmdbId)));
    const isHtml5 = !!(cur && cur.provider === "html5");

    // Vidking iframe reloads are expensive — use wide thresholds to avoid
    // "Loading content… / Refreshes…" loops.
    const softThresh = isHtml5 ? 0.4 : isVidking ? 8.0 : 0.8;
    const hardThresh = isHtml5 ? 1.25 : isVidking ? 20.0 : 2.5;
    const isForce = action === "force" || action === "resync" || action === "load";
    const isControl = action === "play" || action === "pause" || action === "seek" || action === "skip";

    // Tick path: only fix play/pause unless drift is huge
    if (!isForce && action === "tick") {
      const minGap = isVidking ? 5000 : 350;
      if (nowMs - state.sync.lastApply < minGap && abs < hardThresh) {
        try {
          if (shouldPlay && !state.player.isPlaying()) state.player.play();
          else if (!shouldPlay && state.player.isPlaying()) state.player.pause();
        } catch (_) {}
        setSyncDot(abs);
        return;
      }
    }

    state.applying = true;
    state.sync.lastApply = nowMs;

    try {
      // Pause must tear down / stop without a seek storm
      if (isControl && action === "pause") {
        state.player.pause();
        setSyncDot(abs);
        setTimeout(() => { state.applying = false; }, 200);
        return;
      }

      const needSeek = isForce || (isControl && action !== "play") || abs > softThresh;

      if (needSeek) {
        if (isVidking) {
          if (isForce || abs > hardThresh) {
            // Hard path only for manual Sync / huge drift
            if (typeof state.player.reloadAt === "function") state.player.reloadAt(target);
            else state.player.seek(target);
          } else {
            // Soft: update estimated clock only via seek() which is throttled inside provider
            state.player.seek(target);
          }
        } else {
          state.player.seek(target);
        }
      }

      // Match play state WITHOUT forcing another iframe reload when possible
      if (shouldPlay) {
        if (!state.player.isPlaying()) state.player.play();
      } else {
        if (state.player.isPlaying()) state.player.pause();
      }
    } catch (err) {
      console.warn("[sync] apply failed", err);
      setSyncBtn("error", "Seek failed");
    }

    setSyncDot(abs);
    setTimeout(() => { state.applying = false; }, isVidking ? 1200 : 200);
  }

  function setSyncDot(absDrift) {
    const d = $("#syncDot");
    if (!d) return;
    d.classList.remove("green", "yellow", "red");
    if (absDrift < 0.75) d.classList.add("green");
    else if (absDrift < 2.5) d.classList.add("yellow");
    else d.classList.add("red");
  }

  function setSyncConnection(kind) {
    const d = $("#syncDot");
    if (!d) return;
    if (kind === "ok") d.classList.remove("red");
  }

  function fmt(t) {
    t = Math.max(0, Math.floor(Number(t) || 0));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function hostBroadcast(action) {
    if (!state.isHost || !state.socket || !state.player) return;
    if (state.applying && action === "tick") return;
    const time = Number(state.player.getCurrentTime() || 0);
    const playing = !!state.player.isPlaying();
    state.socket.emit("sync:host", {
      playing,
      time,
      action: action || "tick",
      rate: 1,
    });
    const label = $("#timeLabel");
    if (label) label.textContent = fmt(time);
  }

  function hostEvent(ev) {
    if (!state.isHost || state.applying) return;
    const type = (ev && ev.type) || "tick";
    const action =
      type === "play" ? "play" :
      type === "pause" ? "pause" :
      type === "seek" ? "seek" :
      type === "time" ? "tick" : type;
    hostBroadcast(action);
  }

  setInterval(() => {
    if (!state.isHost) return;
    hostBroadcast("tick");
  }, 2000);

  setInterval(() => {
    if (state.isHost || !state.player || !state.room) return;
    if (!state.sync.lastServerTime) return;
    if (state.sync.targetPlaying) {
      const elapsed = (Date.now() - state.lastSync) / 1000;
      if (elapsed > 0.15 && elapsed < 6) {
        const base = state.sync._baseTarget != null ? state.sync._baseTarget : state.sync.targetTime;
        const rate = state.sync.targetRate || 1;
        state.sync.targetTime = base + elapsed * rate;
      }
    }
    applySyncNow("tick");
  }, 1000);

  setInterval(() => {
    if (state.isHost || !state.room || !state.socket) return;
    if (Date.now() - (state.lastSync || 0) > 12000) {
      // Soft resync only — never force-reload embed on quiet link
      state.socket.emit("sync:request", { force: false });
      $("#syncDot")?.classList.add("red");
    }
  }, 8000);

  function addMessage(m) {
    const log = $("#chatLog");
    if (!log) return;
    const div = document.createElement("div");
    div.className = "msg";
    const img = m.image
      ? `<a href="${esc(m.image)}" target="_blank" rel="noopener"><img class="chat-shot" src="${esc(m.image)}" alt="screenshot" loading="lazy" /></a>`
      : "";
    const nameHtml =
      m.cosmetics && window.WSCosmetics
        ? `<span class="${WSCosmetics.nameClass(m.cosmetics.nameplate)}" style="${WSCosmetics.styleVars(WSCosmetics.getItem(m.cosmetics.nameplate))};${WSCosmetics.fontStyle ? WSCosmetics.fontStyle(m.cosmetics.font) : ''}">${esc(m.name)}</span>`
        : esc(m.name);
    div.innerHTML = `<div class="who" style="color:${esc(m.color)}">${nameHtml}${
      m.isHost ? '<span class="host">HOST</span>' : ""
    }<span class="at">${new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
      <div class="body">${esc(m.text || "")}</div>${img}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }
  function addSystem(text) {
    const log = $("#chatLog");
    const div = document.createElement("div");
    div.className = "sys";
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }
  function spawnReact({ emoji }) {
    const box = $("#floatReacts");
    if (!box) return;
    const el = document.createElement("div");
    const isLove = emoji === "ILOVEYOU" || emoji === "I LOVE YOU";
    el.className = "floater" + (isLove ? " love-text" : "");
    el.textContent = isLove ? "I LOVE YOU" : emoji;
    el.style.left = 20 + Math.random() * 60 + "%";
    box.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function pickMovie(card) {
    const video = {
      provider: "vidking",
      tmdbId: card.dataset.id,
      mediaType: card.dataset.type === "tv" ? "tv" : "movie",
      title: card.dataset.title,
      poster: card.dataset.poster,
      season: card.dataset.type === "tv" ? 1 : null,
      episode: card.dataset.type === "tv" ? 1 : null,
    };
    if (state.room && state.isHost) {
      loadVideo(video, 0, true);
      toast("Loading " + video.title);
    } else if (state.room) {
      toast("Only the host can change the movie");
    } else {
      openCreate();
      toast("Create a room first, then pick a title");
    }
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fmt(t) {
    t = Math.max(0, Math.floor(t || 0));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  /* events */
  function doEnter() {
    try {
      const input = $("#gateName");
      const name = (input && input.value ? input.value : "").trim();
      if (name.length < 2) {
        toast("Display name too short");
        return;
      }
      if (!state.me) state.me = loadMe();
      // Unique permanent identity — never changes with display name
      state.me.id = state.me.id || uid();
      state.me.username = state.me.username || makeLocalUsername(name);
      // Display name can match other people
      state.me.displayName = name.slice(0, 18);
      state.me.name = state.me.displayName;
      saveMe();
      enterApp();
    } catch (err) {
      console.error("Enter failed", err);
      alert("Could not enter: " + (err && err.message ? err.message : err));
    }
  }
  const gateGo = $("#gateGo");
  if (gateGo) {
    gateGo.onclick = doEnter;
    gateGo.addEventListener("click", function (e) { e.preventDefault(); doEnter(); });
  }
  const gateName = $("#gateName");
  if (gateName) {
    gateName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doEnter();
      }
    });
  }
  window.__wsEnter = function (e) {
    try { if (e && e.preventDefault) e.preventDefault(); } catch (_) {}
    doEnter();
    return false;
  };
  window.addEventListener("ws-entered", function (ev) {
    try {
      if (ev && ev.detail) {
        state.me = Object.assign(loadMe(), ev.detail);
        saveMe();
      }
      // Inline gate may have shown shell already — still connect sockets
      if (!state.me.name && ev && ev.detail) state.me.name = ev.detail.name;
      connect();
      refreshHome();
      renderProfile();
      const mn = $("#meName");
      if (mn) mn.textContent = state.me.displayName || state.me.name || "Guest";
      paintAvatar($("#meAvatar"), state.me, "sm");
      paintAvatar($("#homeAvatar"), state.me, "md");
    } catch (err) {
      console.error("ws-entered failed", err);
    }
  });

  $$("#tabbar button").forEach((b) => (b.onclick = () => setPage(b.dataset.nav)));
  $$("[data-nav]").forEach((b) => {
    if (b.closest("#tabbar")) return;
    b.addEventListener("click", () => setPage(b.dataset.nav));
  });
  $$("[data-go]").forEach((b) => {
    b.onclick = () => {
      try {
        if (b.dataset.go === "create") openCreate();
        else if (b.dataset.go === "couples") {
          openCreate();
          setTimeout(() => {
            const c = $("#crCouples");
            if (c) { c.checked = true; c.dispatchEvent(new Event("change")); }
          }, 50);
        } else openJoin("");
      } catch (err) {
        console.error(err);
        toast(err.message || "Action failed");
      }
    };
  });
  $("#meBtn").onclick = () => setPage("profile");

  document.addEventListener("click", (e) => {
    const join = e.target.closest("[data-join]");
    if (join) openJoin(join.dataset.join);
    const card = e.target.closest(".movie-card");
    if (card) pickMovie(card);
    const kick = e.target.closest("[data-kick]");
    if (kick) state.socket.emit("room:kick", kick.dataset.kick);
    const acc = e.target.closest("[data-accept]");
    if (acc) {
      fetch("/api/friends/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: state.me.id, fromId: acc.dataset.accept }),
      }).then(loadFriends);
    }
    if (e.target.closest("[data-open-lib]")) {
      openRoomLibrary();
    }
  });

  $$(".typeBtn").forEach((b) => {
    b.onclick = () => {
      $$(".typeBtn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      state.lib.type = b.dataset.type;
      state.lib.q = "";
      loadLibrary(true);
    };
  });
  $$("#libCats .chip").forEach((b) => {
    b.onclick = () => {
      $$("#libCats .chip").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      state.lib.cat = b.dataset.cat;
      state.lib.q = "";
      loadLibrary(true);
    };
  });
  $("#libSearchBtn").onclick = () => {
    state.lib.q = $("#libSearch").value.trim();
    loadLibrary(true);
  };
  $("#libSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#libSearchBtn").click();
  });
  $("#roomSearch")?.addEventListener("input", () => loadRooms());
  $("#roomSort")?.addEventListener("change", () => loadRooms());

  $("#saveProfile").onclick = () => {
    state.me.name = $("#setName").value.trim().slice(0, 18) || state.me.name;
    state.me.displayName = state.me.name;
    const typedAvatar = $("#setAvatar").value.trim();
    if (typedAvatar && !typedAvatar.startsWith("/") && !typedAvatar.startsWith("http")) {
      delete state.me.avatarUrl;
      state.me.avatar = typedAvatar.slice(0, 4);
    } else if (state.me.avatarUrl) {
      state.me.avatar = state.me.avatarUrl;
    } else if (typedAvatar) {
      state.me.avatar = typedAvatar;
    }
    state.me.bio = (window.WSCosmetics && WSCosmetics.cleanBio
      ? WSCosmetics.cleanBio($("#setBio").value)
      : $("#setBio").value.slice(0, 160));
    if (/^[A-Za-z0-9+/=]{12,}$/.test(String(state.me.bio || "").replace(/\s/g, ""))) state.me.bio = "";
    state.me.color = $("#setColor").value;
    saveMe();
    $("#meName").textContent = state.me.displayName || state.me.name || "Guest";
    paintAvatar($("#meAvatar"), state.me, "sm");
    toast("Profile saved!");
    renderProfile();
    if (state.socket && state.socket.connected) state.socket.emit("hello", state.me);
  };

  const pfpBtn = $("#pfpUploadBtn");
  const pfpInput = $("#pfpFileInput");
  if (pfpBtn && pfpInput) {
    pfpBtn.onclick = () => pfpInput.click();
    pfpInput.onchange = () => {
      const file = pfpInput.files && pfpInput.files[0];
      if (!file) return;
      const status = $("#pfpStatus");
      if (status) status.textContent = "Uploading…";
      const formData = new FormData();
      formData.append("avatar", file);
      fetch("/api/upload/avatar", {
        method: "POST",
        body: formData,
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.ok && d.url) {
            state.me.avatarUrl = d.url;
            state.me.avatar = d.url;
            saveMe();
            renderProfile();
            if (status) status.textContent = "Uploaded!";
            toast("Profile picture updated!");
            if (state.socket && state.socket.connected) state.socket.emit("hello", state.me);
          } else {
            if (status) status.textContent = "Failed";
            toast(d.error || "Upload failed");
          }
        })
        .catch((err) => {
          if (status) status.textContent = "Error";
          toast(err.message || "Upload error");
        });
    };
  }

  $("#friendAdd").onclick = () => {
    fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromId: state.me.id, toName: $("#friendName").value }),
    })
      .then((r) => r.json())
      .then((d) => toast(d.error || "Request sent"));
  };

  $("#leaveBtn").onclick = leaveRoom;

  /* Room sidebar tabs */
  $$("[data-side-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.getAttribute("data-side-tab");
      $$("[data-side-tab]").forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      $$("[data-side-panel]").forEach((p) => {
        const on = p.getAttribute("data-side-panel") === id;
        p.classList.toggle("active", on);
        p.hidden = !on;
      });
    });
  });

  $("#copyCodeBtn")?.addEventListener("click", async () => {
    const code = ($("#roomCode")?.textContent || "").trim();
    if (!code || code === "------") return;
    const link = `${location.origin}/?join=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(`${code}\n${link}`);
      toast("Room code + link copied");
    } catch (_) {
      toast(code);
    }
  });

  $("#playBtn").onclick = () => {
    state.player?.play();
    hostEvent({ type: "play", time: state.player.getCurrentTime() });
  };
  $("#pauseBtn").onclick = () => {
    state.player?.pause();
    hostEvent({ type: "pause", time: state.player.getCurrentTime() });
  };
  $("#skipBack").onclick = () => {
    const t = Math.max(0, state.player.getCurrentTime() - 5);
    state.player.seek(t);
    hostEvent({ type: "seek", time: t });
  };
  $("#skipFwd").onclick = () => {
    const t = state.player.getCurrentTime() + 5;
    state.player.seek(t);
    hostEvent({ type: "seek", time: t });
  };
  $("#skipIntro").onclick = () => {
    if (!state.isHost || !state.player) return toast("Host only");
    const t = Number(state.player.getCurrentTime() || 0) + 90;
    state.player.seek(t);
    hostBroadcast("skip");
    toast("Skipped ~90s");
  };

  $("#syncToHost").onclick = () => {
    requestHostSync(true);
  };

  $$("[data-react]").forEach((b) => (b.onclick = () => {
    if (state.socket && state.socket.connected) state.socket.emit("react", b.dataset.react);
  }));

  $("#chatForm").onsubmit = (e) => {
    e.preventDefault();
    const text = $("#chatInput").value.trim();
    if (!text) return;
    if (!state.socket || !state.socket.connected) { toast("Not connected — reconnecting…"); connect(); return; }
    if (!state.room) { toast("Join a room first"); return; }
    state.socket.emit("chat:send", { text });
    $("#chatInput").value = "";
  };
  const chatImg = $("#chatImageInput");
  if (chatImg) {
    chatImg.addEventListener("change", () => {
      const f = chatImg.files && chatImg.files[0];
      if (f) uploadChatImage(f);
      chatImg.value = "";
    });
  }
  const chatInput = $("#chatInput");
  if (chatInput) {
    chatInput.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) uploadChatImage(file);
          break;
        }
      }
    });
  }
  $("#voiceJoin")?.addEventListener("click", async () => {
    try {
      if (!state.voice) setupVoice();
      await state.voice.join();
      toast("Joined voice lobby");
    } catch (err) {
      toast(err.message || "Mic blocked");
    }
  });
  $("#voiceMute")?.addEventListener("click", () => state.voice?.toggleMute());
  $("#voiceLeave")?.addEventListener("click", () => {
    state.voice?.leave();
    toast("Left voice");
  });
  let typingT;
  $("#chatInput").addEventListener("input", () => {
    state.socket.emit("chat:typing", true);
    clearTimeout(typingT);
    typingT = setTimeout(() => state.socket.emit("chat:typing", false), 800);
  });

  $("#loadUrl").onclick = () => {
    const src = $("#urlInput").value.trim();
    if (!src) return;
    const yt = window.WSProviders.youtube.parseId(src);
    if (yt) loadVideo({ provider: "youtube", src, title: "YouTube" }, 0, true);
    else loadVideo({ provider: "html5", src, title: "Video" }, 0, true);
  };
  $("#fileInput").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f || !state.isHost) return;
    const name = String(f.name || "");
    const ext = (name.match(/\.([a-z0-9]+)$/i) || ["", ""])[1].toLowerCase();
    const allowed = ["mp4", "webm", "mkv", "mov", "m4v"];
    if (!allowed.includes(ext)) {
      toast("Unsupported video format. Use MP4, WebM, MKV, or MOV.");
      e.target.value = "";
      return;
    }
    if (f.size > 10 * 1024 * 1024 * 1024) {
      toast("This video is too large. Maximum size is 10 GB.");
      e.target.value = "";
      return;
    }
    const fd = new FormData();
    fd.append("video", f);
    $("#uploadProg").classList.remove("hidden");
    $("#uploadProg").textContent = "Uploading " + (f.size > 1024*1024*1024 ? (f.size/(1024*1024*1024)).toFixed(2) + " GB" : (f.size/(1024*1024)).toFixed(1) + " MB") + "…";
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
      loadVideo(
        {
          provider: "html5",
          src: data.url,
          title: data.name || name,
          ext: data.ext || ("." + ext),
          mayNeedCompatiblePlayer: !!(data.mayNeedCompatiblePlayer || ext === "mkv"),
        },
        0,
        true
      );
      $("#uploadProg").textContent =
        ext === "mkv"
          ? "Uploaded (MKV — playback depends on browser/codecs)"
          : "Uploaded";
      if (ext === "mkv") {
        toast("MKV uploaded. If it will not play, convert to MP4 (H.264) for wider browser support.");
      }
    } catch (err) {
      toast(err.message || "Upload failed");
      $("#uploadProg").textContent = "Failed";
    }
    e.target.value = "";
  };

  async function openRoomLibrary() {
    if (!state.isHost) return toast("Host only");
    showModal(`<h3>Pick a title</h3>
      <div class="search-row"><input id="rmLibQ" placeholder="Search..." /><button class="btn-primary sm" id="rmLibGo">Go</button></div>
      <div id="rmLibGrid" class="movie-grid" style="max-height:50vh;overflow:auto"></div>
      <div class="row"><button class="btn-ghost" id="rmLibClose">Close</button></div>`);
    $("#rmLibClose").onclick = hideModal;
    const fill = async (q) => {
      const data = q
        ? await WSMovies.search(q, "movie", 1)
        : await WSMovies.fetchCategory("trending", "movie", 1);
      $("#rmLibGrid").innerHTML = (data.results || []).map(WSMovies.cardHtml).join("") || "<p class='muted'>No results</p>";
    };
    fill("");
    $("#rmLibGo").onclick = () => fill($("#rmLibQ").value.trim());
    $("#rmLibGrid").onclick = (e) => {
      const card = e.target.closest(".movie-card");
      if (!card) return;
      e.stopPropagation();
      hideModal();
      pickMovie(card);
    };
  }

  $("#hostBtn").onclick = () => {
    if (!state.isHost || !state.room) return;
    const r = state.room;
    showModal(`<h3>Host panel</h3>
      <div class="ws-field">
        <span class="label">Room name</span>
        <input class="ws-input" id="hpName" value="${esc(r.name || "")}" maxlength="48" autocomplete="off" />
      </div>
      <div class="hp-section">Room options</div>
      <label class="ws-toggle">
        <span><span class="tog-label">Public</span><span class="tog-hint">Listed in room browser</span></span>
        <input type="checkbox" id="hpPub" ${r.isPublic ? "checked" : ""} />
        <span class="track" aria-hidden="true"></span>
      </label>
      <label class="ws-toggle">
        <span><span class="tog-label">Lock</span><span class="tog-hint">Block new joins</span></span>
        <input type="checkbox" id="hpLock" ${r.locked ? "checked" : ""} />
        <span class="track" aria-hidden="true"></span>
      </label>
      <label class="ws-toggle">
        <span><span class="tog-label">Mute chat</span><span class="tog-hint">Only host can send messages</span></span>
        <input type="checkbox" id="hpMute" ${r.chatMuted ? "checked" : ""} />
        <span class="track" aria-hidden="true"></span>
      </label>
      <div class="row">
        <button type="button" class="btn-ghost" id="hpClose">Close</button>
        <button type="button" class="btn-primary" id="hpSave">Save</button>
      </div>`);
    $("#hpClose").onclick = hideModal;
    $("#hpSave").onclick = () => {
      state.socket.emit("room:meta", {
        name: $("#hpName").value.trim(),
        isPublic: $("#hpPub").checked,
        locked: $("#hpLock").checked,
        chatMuted: $("#hpMute").checked,
      });
      hideModal();
      toast("Room settings saved");
    };
  };


  /* Fix: picking from library while in a room — stay in room */
  const origPick = pickMovie;
  document.addEventListener("click", () => {}, true);

  /* boot */
  state.me = loadMe();
  icons();
  if (state.me.name) {
    $("#gateName").value = state.me.name;
    enterApp();
  }
})();
