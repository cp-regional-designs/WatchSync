/**
 * Multi-source embed provider (Vidking + fallbacks).
 * If one embed is blocked/empty, host can cycle sources; viewers follow via room video.embedIndex.
 */
(function (global) {
  const SOURCES = [
    {
      id: "vidking",
      label: "Vidking",
      movie: (id, t, color) => {
        const p = new URLSearchParams();
        if (color) p.set("color", color);
        if (t > 0) p.set("progress", String(t));
        p.set("autoPlay", "true");
        return `https://www.vidking.net/embed/movie/${id}?${p}`;
      },
      tv: (id, s, e, t, color) => {
        const p = new URLSearchParams();
        if (color) p.set("color", color);
        if (t > 0) p.set("progress", String(t));
        p.set("autoPlay", "true");
        return `https://www.vidking.net/embed/tv/${id}/${s}/${e}?${p}`;
      },
    },
    {
      id: "vidsrc",
      label: "VidSrc",
      movie: (id, t) => {
        const base = `https://vidsrc.to/embed/movie/${id}`;
        return t > 0 ? `${base}?t=${t}` : base;
      },
      tv: (id, s, e, t) => {
        const base = `https://vidsrc.to/embed/tv/${id}/${s}/${e}`;
        return t > 0 ? `${base}?t=${t}` : base;
      },
    },
    {
      id: "vidsrcpk",
      label: "VidSrc PK",
      movie: (id) => `https://embed.vidsrc.pk/movie/${id}`,
      tv: (id, s, e) => `https://embed.vidsrc.pk/tv/${id}/${s}/${e}`,
    },
    {
      id: "2embed",
      label: "2Embed",
      movie: (id) => `https://www.2embed.cc/embed/${id}`,
      tv: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
    },
    {
      id: "vidlink",
      label: "VidLink",
      movie: (id) => `https://vidlink.pro/movie/${id}`,
      tv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
    },
  ];

  function create(container) {
    let iframe = null;
    let videoMeta = null;
    let onEvent = () => {};
    let playing = false;
    let baseTime = 0;
    let baseWall = Date.now();
    let loadTimer = null;
    let lastReloadAt = 0;
    let lastSeekTarget = -1;
    let sourceIndex = 0;
    let statusEl = null;

    function now() {
      return Date.now();
    }

    function estimatedTime() {
      if (!playing) return baseTime;
      return Math.max(0, baseTime + (now() - baseWall) / 1000);
    }

    function ensureStatus() {
      if (statusEl && statusEl.isConnected) return statusEl;
      statusEl = container.querySelector("[data-embed-status]");
      if (!statusEl) {
        statusEl = document.createElement("div");
        statusEl.setAttribute("data-embed-status", "1");
        statusEl.className = "embed-status";
        statusEl.hidden = true;
        container.appendChild(statusEl);
      }
      return statusEl;
    }

    function setStatus(msg, opts) {
      const el = ensureStatus();
      if (!msg) {
        el.hidden = true;
        el.innerHTML = "";
        return;
      }
      el.hidden = false;
      const src = SOURCES[sourceIndex] || SOURCES[0];
      const canSwitch = !!(opts && opts.switchable);
      el.innerHTML =
        '<div class="embed-status-card">' +
        "<p>" +
        msg +
        "</p>" +
        '<p class="embed-status-meta">Source: <b>' +
        src.label +
        "</b> (" +
        (sourceIndex + 1) +
        "/" +
        SOURCES.length +
        ")</p>" +
        (canSwitch
          ? '<button type="button" class="btn-primary sm" data-next-src>Try next source</button>'
          : "") +
        "</div>";
      const btn = el.querySelector("[data-next-src]");
      if (btn) {
        btn.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          cycleSource();
        };
      }
    }

    function resolveUrl(startAt) {
      if (!videoMeta) return "";
      const id = videoMeta.tmdbId || videoMeta.id;
      if (!id) return "";
      const t = Math.floor(Math.max(0, Number(startAt) || 0));
      const color = String(videoMeta.color || (global.WS_CONFIG && global.WS_CONFIG.vidkingColor) || "9D5CFF").replace("#", "");
      const isTv = videoMeta.mediaType === "tv" || videoMeta.season;
      if (typeof videoMeta.embedIndex === "number" && videoMeta.embedIndex >= 0 && videoMeta.embedIndex < SOURCES.length) {
        sourceIndex = videoMeta.embedIndex;
      }
      const active = SOURCES[sourceIndex] || SOURCES[0];
      if (isTv) {
        const s = Number(videoMeta.season) || 1;
        const e = Number(videoMeta.episode) || 1;
        return active.tv(id, s, e, t, color);
      }
      return active.movie(id, t, color);
    }

    function destroyFrame() {
      clearTimeout(loadTimer);
      if (iframe) {
        try {
          iframe.src = "about:blank";
        } catch (_) {}
        try {
          iframe.remove();
        } catch (_) {}
        iframe = null;
      }
    }

    function showPausedOverlay(on) {
      let ov = container.querySelector("[data-vk-paused]");
      if (on) {
        if (!ov) {
          ov = document.createElement("div");
          ov.setAttribute("data-vk-paused", "1");
          ov.className = "vk-paused";
          ov.innerHTML = "<span>Paused</span>";
          container.appendChild(ov);
        }
      } else if (ov) {
        ov.remove();
      }
    }

    function buildFrame(startAt) {
      destroyFrame();
      if (!videoMeta) return;
      const t = Math.max(0, Number(startAt) || 0);
      baseTime = t;
      baseWall = now();
      lastSeekTarget = t;
      lastReloadAt = now();

      const src = resolveUrl(t);
      if (!src) {
        setStatus("Missing TMDB id — cannot embed.", { switchable: false });
        onEvent({ type: "error", message: "Missing TMDB id" });
        return;
      }

      setStatus("Loading stream…", { switchable: false });

      iframe = document.createElement("iframe");
      iframe.className = "player-frame";
      iframe.setAttribute("allow", "autoplay; fullscreen; encrypted-media; picture-in-picture");
      iframe.allowFullscreen = true;
      iframe.setAttribute("referrerpolicy", "origin-when-cross-origin");
      iframe.setAttribute("loading", "eager");
      iframe.src = src;

      iframe.addEventListener("load", function () {
        setTimeout(function () {
          if (iframe && iframe.src && iframe.src !== "about:blank") {
            setStatus("", null);
          }
        }, 1200);
        onEvent({ type: "ready", time: baseTime });
      });
      iframe.addEventListener("error", function () {
        setStatus("This source failed to load.", { switchable: true });
        onEvent({ type: "error", message: "iframe error" });
      });

      container.appendChild(iframe);
      clearTimeout(loadTimer);
      loadTimer = setTimeout(function () {
        onEvent({ type: "ready", time: baseTime });
        setStatus(
          "If the player is still black, this source may be blocked or empty. Try the next source.",
          { switchable: true }
        );
      }, 8000);
    }

    function cycleSource() {
      if (!videoMeta) return;
      sourceIndex = (sourceIndex + 1) % SOURCES.length;
      videoMeta.embedIndex = sourceIndex;
      const t = estimatedTime();
      buildFrame(t);
      onEvent({
        type: "source",
        time: t,
        embedIndex: sourceIndex,
        sourceId: SOURCES[sourceIndex].id,
      });
    }

    function load(video, startAt) {
      videoMeta = video;
      if (typeof video.embedIndex === "number") {
        sourceIndex = Math.max(0, Math.min(SOURCES.length - 1, video.embedIndex));
      } else {
        sourceIndex = 0;
      }
      playing = true;
      showPausedOverlay(false);
      buildFrame(startAt || 0);
      onEvent({ type: "load", time: baseTime, embedIndex: sourceIndex });
    }

    function hardSeek(t, opts) {
      if (!videoMeta) return;
      const force = opts && opts.force;
      const target = Math.max(0, Number(t) || 0);
      const wall = now();
      const est = estimatedTime();

      if (
        !force &&
        iframe &&
        wall - lastReloadAt < 5000 &&
        Math.abs(est - target) < 15 &&
        Math.abs(lastSeekTarget - target) < 15
      ) {
        baseTime = target;
        baseWall = wall;
        return;
      }
      if (!force && iframe && playing && Math.abs(est - target) < 6 && wall - lastReloadAt < 10000) {
        baseTime = target;
        baseWall = wall;
        return;
      }
      buildFrame(target);
    }

    function play() {
      baseTime = estimatedTime();
      baseWall = now();
      playing = true;
      showPausedOverlay(false);
      if (!iframe && videoMeta) buildFrame(baseTime);
      onEvent({ type: "play", time: baseTime });
    }

    function pause() {
      baseTime = estimatedTime();
      baseWall = now();
      playing = false;
      destroyFrame();
      showPausedOverlay(true);
      setStatus("", null);
      onEvent({ type: "pause", time: baseTime });
    }

    function seek(t) {
      hardSeek(t, { force: false });
      onEvent({ type: "seek", time: estimatedTime() });
    }

    return {
      load: load,
      play: play,
      pause: pause,
      seek: seek,
      getCurrentTime: estimatedTime,
      isPlaying: function () {
        return playing;
      },
      forceSeek: function (t) {
        hardSeek(t, { force: true });
      },
      nextSource: cycleSource,
      getSource: function () {
        return SOURCES[sourceIndex] || SOURCES[0];
      },
      destroy: function () {
        destroyFrame();
        showPausedOverlay(false);
        setStatus("", null);
        videoMeta = null;
      },
      setHandler: function (fn) {
        onEvent = fn || function () {};
      },
      setHost: function () {},
    };
  }

  global.WSProviders = global.WSProviders || {};
  global.WSProviders.vidking = { create: create, SOURCES: SOURCES };
})(window);
