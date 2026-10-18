/**
 * Vidking embed provider
 *
 * Critical rules:
 *  - Never reload the iframe on every play/tick (causes "Loading content…" loops).
 *  - Start-time param is `progress` (seconds), NOT `t`.
 *  - Pause hides the frame so third-party audio actually stops; play rebuilds once.
 *  - Soft seeks only update the local clock; hard seeks rebuild with progress=.
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
    let ready = false;

    function now() {
      return Date.now();
    }

    function estimatedTime() {
      if (!playing) return baseTime;
      return Math.max(0, baseTime + (now() - baseWall) / 1000);
    }

    function embedUrl(video, startAt) {
      const id = video.tmdbId || video.id;
      if (!id) return "";
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
      const color = String(video.color || global.WS_CONFIG?.vidkingColor || "9D5CFF").replace("#", "");
      params.set("color", color);
      // Vidking docs: `progress` = start time in seconds (NOT `t`)
      const t = Math.floor(Math.max(0, Number(startAt) || 0));
      if (t > 0) params.set("progress", String(t));
      if (playing) params.set("autoPlay", "true");
      return `${url}?${params.toString()}`;
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
      ready = false;
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
      ready = false;

      const src = embedUrl(videoMeta, t);
      if (!src) {
        onEvent({ type: "error", message: "Missing TMDB id for Vidking embed" });
        return;
      }

      iframe = document.createElement("iframe");
      iframe.className = "player-frame";
      iframe.setAttribute("allow", "autoplay; fullscreen; encrypted-media; picture-in-picture");
      iframe.allowFullscreen = true;
      // no-referrer can break some CDN chains; default referrer is safer for embeds
      iframe.setAttribute("referrerpolicy", "origin-when-cross-origin");
      iframe.setAttribute("loading", "eager");
      iframe.src = src;
      iframe.addEventListener("load", () => {
        ready = true;
        onEvent({ type: "ready", time: baseTime });
      });
      container.appendChild(iframe);
      clearTimeout(loadTimer);
      // Fallback so loading UI clears even if load event is delayed
      loadTimer = setTimeout(() => {
        ready = true;
        onEvent({ type: "ready", time: baseTime });
      }, 3500);
    }

    function load(video, startAt = 0) {
      videoMeta = video;
      playing = true;
      showPausedOverlay(false);
      buildFrame(startAt || 0);
      onEvent({ type: "load", time: baseTime });
    }

    /**
     * Rebuild iframe only when necessary.
     * Throttled hard to avoid Loading-content loops during sync ticks.
     */
    function hardSeek(t, { force } = {}) {
      if (!videoMeta) return;
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
      const wasPlaying = playing;
      playing = true;
      showPausedOverlay(false);

      if (!iframe) {
        if (videoMeta) buildFrame(baseTime);
      } else if (!wasPlaying) {
        // Frame still present from soft-pause path — leave it.
        // If it was torn down, buildFrame above already ran.
      }
      onEvent({ type: "play", time: baseTime });
    }

    function pause() {
      baseTime = estimatedTime();
      baseWall = now();
      playing = false;
      // Tear down so third-party player actually stops (no silent audio desync)
      destroyFrame();
      showPausedOverlay(true);
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
      forceSeek(t) {
        hardSeek(t, { force: true });
      },
      destroy() {
        destroyFrame();
        showPausedOverlay(false);
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
