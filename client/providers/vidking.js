/**
 * Vidking embed provider
 * IMPORTANT: Do NOT reload the iframe on every play/tick — that causes
 * "Loading content… / Refreshes…" loops. Only recreate the iframe when
 * the media changes or a real seek is required.
 */
(function (global) {
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

    function now() {
      return Date.now();
    }

    function estimatedTime() {
      if (!playing) return baseTime;
      return Math.max(0, baseTime + ((now() - baseWall) / 1000));
    }

    function embedUrl(video, startAt) {
      const id = video.tmdbId || video.id;
      const mediaType = video.mediaType === "tv" || video.season ? "tv" : "movie";
      let url;
      if (mediaType === "tv") {
        const s = Number(video.season) || 1;
        const e = Number(video.episode) || 1;
        url = `https://www.vidking.net/embed/tv/${id}/${s}/${e}`;
      } else {
        url = `https://www.vidking.net/embed/movie/${id}`;
      }
      const params = new URLSearchParams();
      params.set("color", (video.color || "9D5CFF").replace("#", ""));
      if (startAt && startAt > 1) params.set("t", Math.floor(startAt));
      // autoPlay only when we intend to play
      if (playing) params.set("autoPlay", "true");
      return `${url}?${params.toString()}`;
    }

    function destroyFrame() {
      clearTimeout(loadTimer);
      if (iframe) {
        try {
          iframe.src = "about:blank";
        } catch (_) {}
        iframe.remove();
        iframe = null;
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

      iframe = document.createElement("iframe");
      iframe.className = "player-frame";
      iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
      iframe.allowFullscreen = true;
      iframe.setAttribute("referrerpolicy", "no-referrer");
      iframe.src = embedUrl(videoMeta, t);
      iframe.addEventListener("load", () => onEvent({ type: "ready", time: baseTime }));
      container.appendChild(iframe);
      clearTimeout(loadTimer);
      // ready fallback so loading UI clears even if load event is flaky
      loadTimer = setTimeout(() => onEvent({ type: "ready", time: baseTime }), 2500);
    }

    function load(video, startAt = 0) {
      videoMeta = video;
      playing = true; // initial load starts in playing mode for host start
      const ov = container.querySelector("[data-vk-paused]");
      if (ov) ov.remove();
      buildFrame(startAt || 0);
      onEvent({ type: "load", time: baseTime });
    }

    /**
     * Recreate iframe only when necessary (real seek / first load).
     * Throttled to prevent Loading content loops.
     */
    function hardSeek(t, { force } = {}) {
      if (!videoMeta) return;
      const target = Math.max(0, Number(t) || 0);
      const wall = now();
      const est = estimatedTime();
      // Skip reload if we recently loaded near this time
      if (
        !force &&
        iframe &&
        wall - lastReloadAt < 4000 &&
        Math.abs(est - target) < 12 &&
        Math.abs(lastSeekTarget - target) < 12
      ) {
        baseTime = target;
        baseWall = wall;
        return;
      }
      // Also skip if target is essentially "now" while already playing with a live frame
      if (!force && iframe && playing && Math.abs(est - target) < 5 && wall - lastReloadAt < 8000) {
        baseTime = target;
        baseWall = wall;
        return;
      }
      buildFrame(target);
    }

    function play() {
      // Resume without reloading when possible
      baseTime = estimatedTime();
      baseWall = now();
      const wasPlaying = playing;
      playing = true;
      const ov = container.querySelector("[data-vk-paused]");
      if (ov) ov.remove();

      if (!iframe) {
        // Frame was destroyed on pause — rebuild once
        if (videoMeta) buildFrame(baseTime);
      } else if (!wasPlaying) {
        // Already have a frame: do NOT reload. Embed may still be paused internally;
        // a soft rebuild only if frozen for a long time is handled by explicit seek/force.
      }
      onEvent({ type: "play", time: baseTime });
    }

    function pause() {
      baseTime = estimatedTime();
      baseWall = now();
      playing = false;
      // Tear down iframe so third-party player actually stops (no silent desync)
      destroyFrame();
      let ov = container.querySelector("[data-vk-paused]");
      if (!ov) {
        ov = document.createElement("div");
        ov.setAttribute("data-vk-paused", "1");
        ov.className = "vk-paused";
        ov.innerHTML = "<span>Paused</span>";
        container.appendChild(ov);
      }
      onEvent({ type: "pause", time: baseTime });
    }

    function seek(t) {
      hardSeek(t, { force: false });
      onEvent({ type: "seek", time: estimatedTime() });
    }

    return {
      load,
      play,
      pause,
      seek,
      getCurrentTime: estimatedTime,
      isPlaying() {
        return playing;
      },
      /** Force reload at time — used only for manual Sync / large drift */
      forceSeek(t) {
        hardSeek(t, { force: true });
      },
      destroy() {
        destroyFrame();
        videoMeta = null;
      },
      setHandler(fn) {
        onEvent = fn || (() => {});
      },
      setHost() {},
    };
  }

  global.WSProviders = global.WSProviders || {};
  global.WSProviders.vidking = { create };
})(window);
