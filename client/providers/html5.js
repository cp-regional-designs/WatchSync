(function (global) {
  function create(container) {
    let video = null;
    let onEvent = () => {};
    let hostMode = false;

    let pendingSeek = null;
    function load(meta, startAt = 0) {
      destroy();
      pendingSeek = null;
      video = document.createElement("video");
      video.className = "player-frame html5-video";
      video.controls = false; // host toolbar is authoritative
      video.playsInline = true;
      video.src = meta.src;
      const st = startAt || 0;
      if (st > 0) pendingSeek = st;
      video.addEventListener("loadedmetadata", () => {
        if (pendingSeek != null && video) { try { video.currentTime = pendingSeek; } catch(_){} pendingSeek = null; }
      }, { once: true });
      video.addEventListener("play", () => hostMode && onEvent({ type: "play", time: video.currentTime }));
      video.addEventListener("pause", () => hostMode && onEvent({ type: "pause", time: video.currentTime }));
      video.addEventListener("seeked", () => hostMode && onEvent({ type: "seek", time: video.currentTime }));
      video.addEventListener("timeupdate", () => {
        if (hostMode) onEvent({ type: "time", time: video.currentTime, playing: !video.paused });
      });
      video.addEventListener("canplay", () => onEvent({ type: "ready" }));
      video.addEventListener("error", () => {
        const code = video.error && video.error.code;
        onEvent({
          type: "error",
          message:
            "This browser could not play the file (code " +
            (code || "?") +
            "). MKV/HEVC often needs Chrome or an MP4 (H.264) copy.",
        });
      });
      container.appendChild(video);
      video.play().catch(() => {});
    }

    return {
      load,
      play() {
        video?.play().catch(() => {});
      },
      pause() {
        video?.pause();
      },
      seek(t) {
        const n = Math.max(0, Number(t) || 0);
        if (!video) return;
        if (video.readyState >= 1) {
          try { video.currentTime = n; } catch (_) { pendingSeek = n; }
        } else {
          pendingSeek = n;
        }
      },
      getCurrentTime() {
        return video?.currentTime || 0;
      },
      isPlaying() {
        return video ? !video.paused : false;
      },
      destroy() {
        if (video) {
          video.pause();
          video.remove();
        }
        video = null;
      },
      setHandler(fn) {
        onEvent = fn || (() => {});
      },
      setHost(v) {
        hostMode = !!v;
      },
    };
  }

  global.WSProviders = global.WSProviders || {};
  global.WSProviders.html5 = { create };
})(window);
