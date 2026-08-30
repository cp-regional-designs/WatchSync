/**
 * WatchSync V1.0.0 — Cosmetics
 * Frames: optional image rings (None by default).
 * Fonts / nameplates / banners: real styles, animated where noted.
 */
(function (global) {
  const CATS = [
    { id: "frame", name: "Avatar Frames" },
    { id: "font", name: "Fonts" },
    { id: "nameplate", name: "Nameplates" },
    { id: "banner", name: "Banners" },
    { id: "effect", name: "Profile Effects" },
    { id: "orb", name: "Status Orbs" },
  ];

  /* No image frames by default — only "None" */
  const IMAGE_FRAMES = [
    {
      id: "frame_none",
      name: "None",
      src: "",
      rarity: "common",
      free: true,
      image: false,
      cat: "frame",
      colors: ["#9D5CFF", "#6D28D9"],
    },
    {
      id: "frame_pink_hearts",
      name: "Pink Hearts Ring",
      src: "/assets/frames/ring_pink_hearts.png",
      rarity: "legendary",
      image: true,
      cat: "frame",
      colors: ["#ff4d8d", "#ff8fab"]
    }
  ];

  /* Real Google Fonts + CSS motion for "animated" styles */
  const FONTS = [
    { id: "font_outfit", name: "Outfit", family: "'Outfit', system-ui, sans-serif", rarity: "common", cat: "font", style: "font-family:'Outfit',system-ui,sans-serif;font-weight:700", previewClass: "" },
    { id: "font_inter", name: "Inter", family: "'Inter', system-ui, sans-serif", rarity: "common", cat: "font", style: "font-family:'Inter',system-ui,sans-serif;font-weight:600", previewClass: "" },
    { id: "font_poppins", name: "Poppins", family: "'Poppins', system-ui, sans-serif", rarity: "common", cat: "font", style: "font-family:'Poppins',system-ui,sans-serif;font-weight:600", previewClass: "" },
    { id: "font_nunito", name: "Nunito Soft", family: "'Nunito', system-ui, sans-serif", rarity: "uncommon", cat: "font", style: "font-family:'Nunito',system-ui,sans-serif;font-weight:700;letter-spacing:0.02em", previewClass: "" },
    { id: "font_quicksand", name: "Quicksand", family: "'Quicksand', system-ui, sans-serif", rarity: "uncommon", cat: "font", style: "font-family:'Quicksand',system-ui,sans-serif;font-weight:600", previewClass: "" },
    { id: "font_comfortaa", name: "Comfortaa", family: "'Comfortaa', system-ui, sans-serif", rarity: "uncommon", cat: "font", style: "font-family:'Comfortaa',system-ui,sans-serif;font-weight:700", previewClass: "" },
    { id: "font_jakarta", name: "Jakarta", family: "'Plus Jakarta Sans', system-ui, sans-serif", rarity: "common", cat: "font", style: "font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-weight:700", previewClass: "" },
    { id: "font_space", name: "Space Grotesk", family: "'Space Grotesk', system-ui, sans-serif", rarity: "rare", cat: "font", style: "font-family:'Space Grotesk',system-ui,sans-serif;font-weight:600;letter-spacing:-0.02em", previewClass: "" },
    { id: "font_mono", name: "JetBrains Mono", family: "'JetBrains Mono', ui-monospace, monospace", rarity: "rare", cat: "font", style: "font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600;font-size:0.92em", previewClass: "" },
    { id: "font_pixel", name: "8-Bit", family: "'Press Start 2P', monospace", rarity: "epic", cat: "font", style: "font-family:'Press Start 2P',monospace;font-weight:400;font-size:0.72em;letter-spacing:0.04em", previewClass: "" },
    { id: "font_vt323", name: "Retro CRT", family: "'VT323', monospace", rarity: "uncommon", cat: "font", style: "font-family:'VT323',monospace;font-weight:400;font-size:1.15em", previewClass: "" },
    { id: "font_dancing", name: "Dancing Script", family: "'Dancing Script', cursive", rarity: "rare", cat: "font", style: "font-family:'Dancing Script',cursive;font-weight:600;font-size:1.15em", previewClass: "" },
    { id: "font_pacifico", name: "Pacifico", family: "'Pacifico', cursive", rarity: "rare", cat: "font", style: "font-family:'Pacifico',cursive;font-weight:400;font-size:1.05em", previewClass: "" },
    { id: "font_rubik", name: "Rubik", family: "'Rubik', system-ui, sans-serif", rarity: "common", cat: "font", style: "font-family:'Rubik',system-ui,sans-serif;font-weight:700", previewClass: "" },
    /* Animated text styles */
    { id: "font_shimmer", name: "Pink Shimmer", family: "'Outfit', system-ui, sans-serif", rarity: "legendary", cat: "font", animated: true, style: "font-family:'Outfit',system-ui,sans-serif;font-weight:800", previewClass: "txt-shimmer" },
    { id: "font_aurora", name: "Aurora", family: "'Poppins', system-ui, sans-serif", rarity: "legendary", cat: "font", animated: true, style: "font-family:'Poppins',system-ui,sans-serif;font-weight:800", previewClass: "txt-aurora" },
    { id: "font_neon_pulse", name: "Neon Pulse", family: "'Space Grotesk', system-ui, sans-serif", rarity: "epic", cat: "font", animated: true, style: "font-family:'Space Grotesk',system-ui,sans-serif;font-weight:700", previewClass: "txt-neon-pulse" },
    { id: "font_gold_glow", name: "Gold Glow", family: "'Outfit', system-ui, sans-serif", rarity: "epic", cat: "font", animated: true, style: "font-family:'Outfit',system-ui,sans-serif;font-weight:800", previewClass: "txt-gold-glow" },
    { id: "font_candy", name: "Candy Wave", family: "'Nunito', system-ui, sans-serif", rarity: "legendary", cat: "font", animated: true, style: "font-family:'Nunito',system-ui,sans-serif;font-weight:800", previewClass: "txt-candy" },
    { id: "font_shine_sweep", name: "Shine Sweep", family: "'Outfit', system-ui, sans-serif", rarity: "legendary", cat: "font", animated: true, style: "font-family:'Outfit',system-ui,sans-serif;font-weight:800", previewClass: "txt-shine-sweep" },
    { id: "font_silver_wave", name: "Silver Wave", family: "'Inter', system-ui, sans-serif", rarity: "epic", cat: "font", animated: true, style: "font-family:'Inter',system-ui,sans-serif;font-weight:700", previewClass: "txt-silver-wave" },
    { id: "font_hot_pink", name: "Hot Pink Glow", family: "'Poppins', system-ui, sans-serif", rarity: "legendary", cat: "font", animated: true, style: "font-family:'Poppins',system-ui,sans-serif;font-weight:800", previewClass: "txt-hot-pink" },
    { id: "font_ice", name: "Ice Glow", family: "'Inter', system-ui, sans-serif", rarity: "rare", cat: "font", animated: true, style: "font-family:'Inter',system-ui,sans-serif;font-weight:700", previewClass: "txt-ice" },
  ];

  const NAMEPLATES = [
    { id: "np_classic", name: "Classic", rarity: "common", cat: "nameplate", colors: ["#C084FC", "#9D5CFF"], style: "", previewClass: "np-classic" },
    { id: "np_pink_princess", name: "Pink Princess 👑", rarity: "legendary", cat: "nameplate", colors: ["#FF94C2", "#FFB2D6"], style: "color:#FF94C2;text-shadow:0 0 12px rgba(255,148,194,.8),0 0 24px rgba(255,182,193,.6);font-weight:800", previewClass: "np-pink-princess" },
    { id: "np_sweetheart", name: "Sweetheart 💖", rarity: "legendary", cat: "nameplate", colors: ["#FF4D8D", "#FF8FAB"], style: "color:#FF4D8D;text-shadow:0 0 14px rgba(255,77,141,.7);font-weight:800", previewClass: "np-sweetheart" },
    { id: "np_coquette", name: "Coquette Dream 🎀", rarity: "epic", cat: "nameplate", colors: ["#FFB6C1", "#FFF0F5"], style: "color:#FFB6C1;font-family:'Dancing Script',cursive;font-size:1.15em;font-weight:700", previewClass: "np-coquette" },
    { id: "np_cupid", name: "Cupid's Arrow 💘", rarity: "epic", cat: "nameplate", colors: ["#FF1493", "#FF69B4"], style: "color:#FF1493;text-shadow:0 0 10px rgba(255,20,147,.6)", previewClass: "np-cupid" },
    { id: "np_sakura", name: "Sakura Bloom 🌸", rarity: "rare", cat: "nameplate", colors: ["#FFC0CB", "#FFB6C1"], style: "color:#FFC0CB;text-shadow:0 0 8px rgba(255,192,203,.8)", previewClass: "np-sakura" },
    { id: "np_love_letter", name: "Love Letter 💌", rarity: "rare", cat: "nameplate", colors: ["#FF6FAE", "#FFB4D9"], style: "background:linear-gradient(90deg,#ff6fae,#ffb4d9);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800", previewClass: "np-love-letter" },
    { id: "np_neon", name: "Neon Violet", rarity: "rare", cat: "nameplate", colors: ["#E879F9", "#9D5CFF"], style: "text-shadow:0 0 12px rgba(157,92,255,.85),0 0 24px rgba(232,121,249,.4);color:#F5D0FE", previewClass: "np-neon" },
    { id: "np_cinema", name: "Cinema Gold", rarity: "rare", cat: "nameplate", colors: ["#FBBF24", "#F59E0B"], style: "color:#FDE68A;text-shadow:0 1px 0 #92400E,0 0 16px rgba(251,191,36,.35)", previewClass: "np-cinema" },
    { id: "np_pixel", name: "Pixel Tag", rarity: "epic", cat: "nameplate", colors: ["#4ADE80", "#22C55E"], style: "font-family:'Press Start 2P',monospace;font-size:0.7em;color:#86EFAC;letter-spacing:0.06em", previewClass: "np-pixel" },
    { id: "np_romantic", name: "Romantic", rarity: "epic", cat: "nameplate", colors: ["#FF6FAE", "#FF8FAB"], style: "color:#FFB4D9;text-shadow:0 0 14px rgba(255,111,174,.55)", previewClass: "np-romantic" },
    { id: "np_midnight", name: "Midnight", rarity: "uncommon", cat: "nameplate", colors: ["#6366F1", "#312E81"], style: "color:#A5B4FC;letter-spacing:0.04em", previewClass: "np-midnight" },
    { id: "np_premium", name: "Premium", rarity: "legendary", cat: "nameplate", colors: ["#F472B6", "#C084FC"], style: "background:linear-gradient(90deg,#F472B6,#C084FC,#63B3FF);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800", previewClass: "np-premium" },
    { id: "np_soft", name: "Soft Pink", rarity: "uncommon", cat: "nameplate", colors: ["#FDA4AF", "#FB7185"], style: "color:#FECDD3;font-weight:600", previewClass: "np-soft" },
    { id: "np_cyber", name: "Cyber", rarity: "epic", cat: "nameplate", colors: ["#22D3EE", "#A78BFA"], style: "color:#67E8F9;text-shadow:0 0 10px rgba(34,211,238,.6),0 0 2px #22D3EE;letter-spacing:0.08em;text-transform:uppercase;font-size:0.88em", previewClass: "np-cyber" },
    { id: "np_ember", name: "Ember", rarity: "rare", cat: "nameplate", colors: ["#FB923C", "#EF4444"], style: "color:#FDBA74;text-shadow:0 0 12px rgba(239,68,68,.45)", previewClass: "np-ember" },
    { id: "np_mint", name: "Mint", rarity: "uncommon", cat: "nameplate", colors: ["#6EE7B7", "#34D399"], style: "color:#A7F3D0", previewClass: "np-mint" },
    { id: "np_shine", name: "Shine Bar", rarity: "legendary", cat: "nameplate", colors: ["#F5D0FE", "#C084FC"], style: "", previewClass: "np-shine" },
    { id: "np_glow_pink", name: "Pink Glow", rarity: "epic", cat: "nameplate", colors: ["#FF6FAE", "#FF8FAB"], style: "color:#FFB4D9", previewClass: "np-glow-pink" },
    { id: "np_laser", name: "Laser Sweep", rarity: "legendary", cat: "nameplate", colors: ["#67E8F9", "#C084FC"], style: "", previewClass: "np-laser" },
    { id: "np_ghost", name: "Ghost", rarity: "rare", cat: "nameplate", colors: ["#E2E8F0", "#94A3B8"], style: "color:#E2E8F0;opacity:0.92;letter-spacing:0.12em;font-weight:500", previewClass: "np-ghost" },
  ];

  const BANNERS = [
    { id: "bn_void", name: "Void", rarity: "common", cat: "banner", css: "linear-gradient(135deg,#0E0E15 0%,#1a1028 50%,#0E0E15 100%)" },
    { id: "bn_valentines", name: "Valentine Hearts 💖", rarity: "legendary", cat: "banner", css: "linear-gradient(135deg,#ff1493 0%,#ff69b4 50%,#ffb6c1 100%)" },
    { id: "bn_pink_glitter", name: "Pink Velvet ✨", rarity: "legendary", cat: "banner", css: "linear-gradient(120deg,#2a0015 0%,#800040 40%,#ff69b4 70%,#ffc0cb 100%)" },
    { id: "bn_coquette_bow", name: "Coquette Ribbon 🎀", rarity: "epic", cat: "banner", css: "linear-gradient(135deg,#4a001a 0%,#990033 50%,#ff80ab 100%)" },
    { id: "bn_strawberry_dream", name: "Strawberry Milk 🍓", rarity: "epic", cat: "banner", css: "linear-gradient(120deg,#ff80bf 0%,#ffb3d9 50%,#ffe6f2 100%)" },
    { id: "bn_cupid_cloud", name: "Cupid Sky ☁️", rarity: "rare", cat: "banner", css: "linear-gradient(135deg,#ff99cc 0%,#ffccff 50%,#ffe6f2 100%)" },
    { id: "bn_aurora", name: "Aurora", rarity: "rare", cat: "banner", css: "linear-gradient(120deg,#1a0533 0%,#6D28D9 40%,#FF6FAE 100%)" },
    { id: "bn_rose", name: "Rose Night", rarity: "epic", cat: "banner", css: "linear-gradient(135deg,#1a0510 0%,#9D174D 45%,#FF6FAE 100%)" },
    { id: "bn_cinema", name: "Cinema Glow", rarity: "uncommon", cat: "banner", css: "linear-gradient(90deg,#0a0a0f 0%,#2a1840 50%,#0a0a0f 100%)" },
    { id: "bn_ocean", name: "Deep Ocean", rarity: "rare", cat: "banner", css: "linear-gradient(135deg,#020617 0%,#1e3a5f 50%,#0ea5e9 100%)" },
    { id: "bn_neon", name: "Neon Grid", rarity: "legendary", cat: "banner", css: "linear-gradient(135deg,#0f0518 0%,#4c1d95 40%,#db2777 100%)" },
    { id: "bn_sunset", name: "Sunset", rarity: "epic", cat: "banner", css: "linear-gradient(120deg,#1c0a0a 0%,#9a3412 35%,#f472b6 70%,#c084fc 100%)" },
    { id: "bn_mint", name: "Mint Dusk", rarity: "rare", cat: "banner", css: "linear-gradient(135deg,#022c22 0%,#0f766e 50%,#5eead4 100%)" },
    { id: "bn_gold", name: "Gold Hour", rarity: "legendary", cat: "banner", css: "linear-gradient(120deg,#1c1408 0%,#854d0e 40%,#fbbf24 100%)" },
    { id: "bn_ice", name: "Ice Field", rarity: "uncommon", cat: "banner", css: "linear-gradient(135deg,#0c1222 0%,#1e3a5f 45%,#93c5fd 100%)" },
    { id: "bn_candy", name: "Candy Pop", rarity: "epic", cat: "banner", css: "linear-gradient(120deg,#2a0a1f 0%,#be185d 40%,#f9a8d4 70%,#c084fc 100%)" },
    { id: "bn_matrix", name: "Matrix", rarity: "rare", cat: "banner", css: "linear-gradient(180deg,#020617 0%,#052e16 60%,#16a34a 100%)" },
  ];

  const EFFECTS = [
    { id: "fx_none", name: "None", rarity: "common", cat: "effect", effect: null },
    { id: "fx_glow", name: "Soft Glow", rarity: "uncommon", cat: "effect", effect: "glow" },
    { id: "fx_pulse", name: "Pulse", rarity: "rare", cat: "effect", effect: "pulse" },
    { id: "fx_sparkle", name: "Sparkle", rarity: "epic", cat: "effect", effect: "sparkle" },
  ];

  const ORBS = [
    { id: "orb_online", name: "Online", rarity: "common", cat: "orb", colors: ["#3ddc84", "#22c55e"] },
    { id: "orb_pink_heart", name: "Sweet Heart 💖", rarity: "legendary", cat: "orb", colors: ["#FF4D8D", "#FF8FAB"] },
    { id: "orb_in_love", name: "In Love 💕", rarity: "legendary", cat: "orb", colors: ["#FF1493", "#FF69B4"] },
    { id: "orb_cupid", name: "Cupid's Touch 💘", rarity: "epic", cat: "orb", colors: ["#FFB6C1", "#FFF0F5"] },
    { id: "orb_watching", name: "Watching", rarity: "uncommon", cat: "orb", colors: ["#9D5CFF", "#6D28D9"] },
    { id: "orb_busy", name: "Busy", rarity: "common", cat: "orb", colors: ["#ef4444", "#b91c1c"] },
    { id: "orb_away", name: "Away", rarity: "common", cat: "orb", colors: ["#FBBF24", "#D97706"] },
    { id: "orb_invisible", name: "Invisible", rarity: "rare", cat: "orb", colors: ["#6b6b80", "#3f3f50"] },
  ];

  const CATALOG = {
    frame: IMAGE_FRAMES.slice(),
    font: FONTS.slice(),
    nameplate: NAMEPLATES.slice(),
    banner: BANNERS.slice(),
    effect: EFFECTS.slice(),
    orb: ORBS.slice(),
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Hide accidental base64 / garbage bios */
  function cleanBio(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    if (s.length > 12 && /^[A-Za-z0-9+/=]+$/.test(s) && !/\s/.test(s)) return "";
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s)) return "";
    return s.slice(0, 160);
  }

  function allItems() {
    return CATS.flatMap((c) => CATALOG[c.id] || []);
  }

  function getItem(id) {
    if (!id) return null;
    return allItems().find((x) => x.id === id) || null;
  }

  function defaultLoadout() {
    return {
      frame: "frame_none",
      font: "font_shine_sweep",
      nameplate: "np_classic",
      banner: "bn_aurora",
      effect: "fx_none",
      orb: "orb_online",
    };
  }

  function ensureCosmetics(me) {
    if (!me) return me;
    me.cosmetics = me.cosmetics || {};
    const d = defaultLoadout();
    Object.keys(d).forEach((k) => {
      if (!me.cosmetics[k] || !getItem(me.cosmetics[k])) me.cosmetics[k] = d[k];
    });
    // Migrate removed frames → none
    if (me.cosmetics.frame && !getItem(me.cosmetics.frame)) me.cosmetics.frame = "frame_none";
    me.ownedPacks = me.ownedPacks || ["pack_starter"];
    me.ownedCosmetics = me.ownedCosmetics || allItems().map((x) => x.id);
    me.bio = cleanBio(me.bio);
    return me;
  }

  function listPacks() {
    return [];
  }

  function styleVars(item) {
    if (!item || !item.colors) return "";
    return `--c1:${item.colors[0]};--c2:${item.colors[1] || item.colors[0]}`;
  }

  function nameClass() {
    return "profile-display-name";
  }

  function fontStyle(id) {
    const it = getItem(id);
    return (it && it.style) || "";
  }

  function activeEffect(me) {
    ensureCosmetics(me);
    const fx = getItem(me.cosmetics.effect);
    return (fx && fx.effect) || null;
  }

  function renderAvatar(me, sizeClass) {
    ensureCosmetics(me);
    const outerMap = { sm: 40, md: 56, lg: 96, xl: 112, profile: 112 };
    const outer = outerMap[sizeClass] || 56;
    const frame = getItem(me.cosmetics.frame);
    const orb = getItem(me.cosmetics.orb);
    const hasRing = frame && frame.src && frame.id !== "frame_none";
    const name = me.displayName || me.name || "?";
    const letter = String(name).charAt(0).toUpperCase();
    const color = me.color || "#9D5CFF";
    const photo =
      me.avatarUrl ||
      (me.avatar && (String(me.avatar).startsWith("/") || String(me.avatar).startsWith("http")) ? me.avatar : null);
    const core = photo
      ? `<img class="avatar" src="${esc(photo)}" alt="" />`
      : `<div class="avatar avatar-fallback" style="background:${esc(color)}">${esc(
          me.avatar && String(me.avatar).length <= 3 ? me.avatar : letter
        )}</div>`;
    const ringHtml = hasRing
      ? `<img class="avatar-ring" src="${esc(frame.src)}" alt="" draggable="false" />`
      : "";
    const fxId = activeEffect(me);
    const orbHtml = orb
      ? `<span class="status-orb" style="background:${esc((orb.colors && orb.colors[0]) || "#3ddc84")}" title="${esc(orb.name)}"></span>`
      : "";
    return `<div class="avatar-wrapper ${sizeClass || "md"}${hasRing ? " has-ring" : ""}" style="--avatar-outer:${outer}px" data-frame="${esc((frame && frame.id) || "")}">
      <div class="avatar-core">${core}</div>
      ${ringHtml}
      ${orbHtml}
    </div>`;
  }

  function renderName(me) {
    ensureCosmetics(me);
    const font = getItem(me.cosmetics.font);
    const np = getItem(me.cosmetics.nameplate);
    const name = esc(me.displayName || me.name || "Guest");
    const classes = ["profile-display-name"];
    if (font && font.previewClass) classes.push(font.previewClass);
    if (np && np.previewClass) classes.push(np.previewClass);
    let style = "";
    // Base font family only — animation classes handle color/shine
    if (font && font.family) style += "font-family:" + font.family + ";font-weight:800;";
    else if (font && font.style && !font.previewClass) style += font.style + ";";
    if (np && np.style && !(np.previewClass && (np.previewClass.includes("shine") || np.previewClass.includes("laser") || np.previewClass.includes("glow") || np.previewClass.includes("premium")))) {
      style += np.style + ";";
    }
    return `<span class="${classes.join(" ")}" style="${style}">${name}</span>`;
  }

  function renderProfileCard(me) {
    ensureCosmetics(me);
    const ban = getItem(me.cosmetics.banner);
    const bannerCss = (ban && ban.css) || BANNERS[0].css;
    const un = me.username ? "@" + me.username : "";
    const level = me.level || 1;
    const xp = me.xp || 0;
    const orbs = me.orbs != null ? me.orbs : 0;
    const bioText = cleanBio(me.bio);
    const bio = bioText ? `<p class="profile-bio">${esc(bioText)}</p>` : "";
    return `<div class="profile-header">
      <div class="profile-banner" style="background:${bannerCss}" aria-hidden="true"></div>
      <div class="profile-header-main">
        ${renderAvatar(me, "lg")}
        <div class="profile-header-info">
          <div class="profile-name-row">${renderName(me)}</div>
          <div class="profile-user-row">
            <span class="profile-handle">${esc(un)}</span>
          </div>
          <div class="profile-meta-row">
            <span class="profile-level">Lv ${level}</span>
            <span class="profile-dot">·</span>
            <span>⬡ ${orbs} Orbs</span>
            <span class="profile-dot">·</span>
            <span>${xp} XP</span>
          </div>
          ${bio}
        </div>
      </div>
    </div>`;
  }

  function rarityLabel(r) {
    return r ? r.charAt(0).toUpperCase() + r.slice(1) : "";
  }

  function renderPicker(me) {
    ensureCosmetics(me);
    const tabs = CATS.map(
      (c, i) =>
        `<button type="button" class="cosmo-tab ${i === 0 ? "active" : ""}" data-cat="${esc(c.id)}">${esc(c.name)}</button>`
    ).join("");

    const panels = CATS.map((c, i) => {
      const items = CATALOG[c.id] || [];
      let body;
      if (c.id === "frame") {
        const cards = items
          .map((it) => {
            const eq = me.cosmetics.frame === it.id;
            return `<button type="button" class="cosmo-item cos-card ${eq ? "equipped" : ""}" data-cat="frame" data-id="${esc(it.id)}">
              <div class="cos-preview frame-prev none-prev">${it.id === "frame_none" ? "○" : ""}</div>
              <span class="cos-name">${esc(it.name)}</span>
              <span class="cos-rarity">${esc(rarityLabel(it.rarity))}</span>
              ${eq ? '<em class="cos-eq">Equipped</em>' : ""}
            </button>`;
          })
          .join("");
        body =
          cards;
      } else {
        body = items
          .map((it) => {
            const eq = me.cosmetics[c.id] === it.id;
            let prev = "";
            if (c.id === "font") {
              prev = `<div class="cos-preview cosmo-font-preview ${esc(it.previewClass || "")}" style="${esc(it.style || "")}">Aa</div>`;
            } else if (c.id === "nameplate") {
              prev = `<div class="cos-preview nameplate-prev ${esc(it.previewClass || "")}" style="${esc(it.style || "")}">Name</div>`;
            } else if (c.id === "banner") {
              prev = `<div class="cos-preview banner-prev" style="background:${esc(it.css)}"></div>`;
            } else if (c.id === "orb") {
              prev = `<div class="cos-preview orb-prev" style="background:${esc((it.colors && it.colors[0]) || "#3ddc84")}"></div>`;
            } else if (c.id === "effect") {
              prev = `<div class="cos-preview effect-prev">${esc(it.name.charAt(0))}</div>`;
            }
            return `<button type="button" class="cosmo-item cos-card ${eq ? "equipped" : ""}" data-cat="${esc(c.id)}" data-id="${esc(it.id)}">
              ${prev}
              <span class="cos-name">${esc(it.name)}</span>
              <span class="cos-rarity">${esc(rarityLabel(it.rarity))}${it.animated ? " · Animated" : ""}</span>
              ${eq ? '<em class="cos-eq">Equipped</em>' : ""}
            </button>`;
          })
          .join("");
      }
      return `<div class="cosmo-panel ${i === 0 ? "active" : ""}" data-panel="${esc(c.id)}">${body}</div>`;
    }).join("");

    return `<div class="cosmo-tabs">${tabs}</div>${panels}`;
  }

  function bindPicker(root, me, onChange) {
    if (!root) return;
    ensureCosmetics(me);
    root.querySelectorAll(".cosmo-tab").forEach((tab) => {
      tab.onclick = () => {
        root.querySelectorAll(".cosmo-tab").forEach((t) => t.classList.remove("active"));
        root.querySelectorAll(".cosmo-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        const panel = root.querySelector(`.cosmo-panel[data-panel="${tab.dataset.cat}"]`);
        if (panel) panel.classList.add("active");
      };
    });
    root.querySelectorAll(".cosmo-item[data-id]").forEach((btn) => {
      btn.onclick = () => {
        const cat = btn.dataset.cat;
        const id = btn.dataset.id;
        equip(me, cat, id);
        try {
          const raw = JSON.parse(localStorage.getItem("ws_profile_v3") || "{}");
          raw.cosmetics = me.cosmetics;
          raw.bio = cleanBio(raw.bio || me.bio);
          localStorage.setItem("ws_profile_v3", JSON.stringify(raw));
        } catch (_) {}
        root.innerHTML = renderPicker(me);
        bindPicker(root, me, onChange);
        if (typeof onChange === "function") onChange(me);
      };
    });
  }

  function equip(me, cat, id) {
    ensureCosmetics(me);
    if (!getItem(id)) return;
    me.cosmetics[cat] = id;
  }

  function startAvatarFX() {
    /* No floating hearts until a ring asset is equipped again */
  }

  global.WSCosmetics = {
    CATS,
    ensureCosmetics,
    getItem,
    listPacks,
    styleVars,
    nameClass,
    fontStyle,
    renderAvatar,
    renderName,
    renderProfileCard,
    renderPicker,
    bindPicker,
    equip,
    cleanBio,
    startAvatarFX,
    RING_GUIDE: {
      canvas: "1024x1024",
      hole: "55-58%",
      format: "PNG transparent",
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAvatarFX);
  } else {
    startAvatarFX();
  }
})(window);
