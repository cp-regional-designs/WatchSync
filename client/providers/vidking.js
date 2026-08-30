/**
 * Vidking iframe provider.
 * Cross-origin → no real currentTime API. We estimate time and hard-seek
 * by reloading the embed with &start= when drift is large.
 */
(function (global) {
  const COLOR = (global.WS_CONFIG && global.WS_CONFIG.vidkingColor) || "9D5CFF";

  function embedUrl(video, startAt) {
    const id = video.tmdbId;
    const color = (video.color || COLOR).replace("#", "");
    const start = Math.max(0, Math.floor(startAt || 0));
    const startQ = start > 0 ? `&start=${start}` : "";
    const auto = video._noAuto ? "false" : "true";
    const isTv = video.mediaType === "tv";
    if (isTv) {
      const s = video.season || 1;
      const e = video.episode || 1;
      return `https://www.vidking.net/embed/tv/${id}/${s}/${e}?color=${color}&autoPlay=true&episodeSelector=true&nextEpisode=true${startQ}`;
    }
    return `https://www.vidking.net/embed/movie/${id}?color=${color}&autoPlay=true${startQ}`;
  }

  function create(container) {
    let iframe = null;
    let videoMeta = null;
    let baseTime = 0;
    let baseWall = 0;
    let playing = false;
    let onEvent = () => {};
    let loadTimer = null;
    let lastReloadAt = 0;

    function now() {
      return performance.now() / 1000;
    }

    function estimatedTime() {
      if (!playing) return baseTime;
      return Math.max(0, baseTime + (now() - baseWall));
    }

    function load(video, startAt = 0) {
      videoMeta = video;
      destroyFrame();
      baseTime = Math.max(0, Number(startAt) || 0);
      baseWall = now();
      playing = true;
      iframe = document.createElement("iframe");
      iframe.className = "player-frame";
      iframe.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("referrerpolicy", "no-referrer");
      iframe.src = embedUrl(video, baseTime);
      iframe.addEventListener("load", () => onEvent({ type: "ready", time: baseTime }));
      container.appendChild(iframe);
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => onEvent({ type: "ready", time: baseTime }), 2000);
    }

    function destroyFrame() {
      clearTimeout(loadTimer);
      if (iframe) {
        iframe.remove();
        iframe = null;
      }
    }

    function hardSeek(t) {
      if (!videoMeta) return;
      const target = Math.max(0, Number(t) || 0);
      // Throttle reloads so we don't thrash the embed
      const wall = Date.now();
      if (wall - lastReloadAt < 1500 && Math.abs(estimatedTime() - target) < 8) {
        baseTime = target;
        baseWall = now();
        return;
      }
      lastReloadAt = wall;
      load(videoMeta, target);
    }

    function play() {
      baseTime = estimatedTime();
      baseWall = now();
      const was = playing;
      playing = true;
      // Always reload embed with autoPlay at frozen time so everyone starts together
      if (videoMeta) {
        hardSeek(baseTime);
      }
      // remove paused overlay
      const ov = container.querySelector("[data-vk-paused]");
      if (ov) ov.remove();
      onEvent({ type: "play", time: baseTime });
    }

    function pause() {
      // Freeze estimated time and tear down iframe so video actually stops for viewers
      baseTime = estimatedTime();
      baseWall = now();
      playing = false;
      destroyFrame();
      // Show paused poster overlay so it doesn't look broken
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
      hardSeek(t);
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
