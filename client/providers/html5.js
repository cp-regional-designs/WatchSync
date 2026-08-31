(function (global) {
  function create(container) {
    let video = null;
    let onEvent = () => {};
    let hostMode = false;

    function load(meta, startAt = 0) {
      destroy();
      video = document.createElement("video");
      video.className = "player-frame html5-video";
      video.controls = true;
      video.playsInline = true;
      video.src = meta.src;
      video.currentTime = startAt || 0;
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
        if (video) video.currentTime = t;
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
