(function (global) {
  let apiReady = null;

  function loadApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (apiReady) return apiReady;
    apiReady = new Promise((resolve) => {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") prev();
        resolve();
      };
    });
    return apiReady;
  }

  function parseId(src) {
    if (!src) return "";
    const m =
      String(src).match(/[?&]v=([\w-]{11})/) ||
      String(src).match(/youtu\.be\/([\w-]{11})/) ||
      String(src).match(/youtube\.com\/embed\/([\w-]{11})/) ||
      String(src).match(/^([\w-]{11})$/);
    return m ? m[1] : "";
  }

  function create(container) {
    let player = null;
    let onEvent = () => {};
    let ready = false;
    let hostMode = false;

    function load(video, startAt = 0) {
      destroy();
      const id = parseId(video.src || video.tmdbId);
      const mount = document.createElement("div");
      mount.id = "yt-" + Math.random().toString(36).slice(2, 8);
      mount.className = "player-frame";
      container.appendChild(mount);
      loadApi().then(() => {
        player = new YT.Player(mount.id, {
          videoId: id,
          playerVars: { autoplay: 1, rel: 0, modestbranding: 1, start: Math.floor(startAt || 0), playsinline: 1 },
          events: {
            onReady: () => {
              ready = true;
              onEvent({ type: "ready" });
            },
            onStateChange: (e) => {
              if (!hostMode) return;
              const t = player.getCurrentTime();
              if (e.data === YT.PlayerState.PLAYING) onEvent({ type: "play", time: t });
              if (e.data === YT.PlayerState.PAUSED) onEvent({ type: "pause", time: t });
            },
          },
        });
      });
    }

    function play() {
      try {
        player?.playVideo();
      } catch {}
    }
    function pause() {
      try {
        player?.pauseVideo();
      } catch {}
    }
    function seek(t) {
      try {
        player?.seekTo(t, true);
      } catch {}
    }
    function getCurrentTime() {
      try {
        return player?.getCurrentTime?.() || 0;
      } catch {
        return 0;
      }
    }
    function isPlaying() {
      try {
        return player?.getPlayerState?.() === 1;
      } catch {
        return false;
      }
    }
    function destroy() {
      try {
        player?.destroy?.();
      } catch {}
      player = null;
      ready = false;
      container.innerHTML = "";
    }

    return {
      load,
      play,
      pause,
      seek,
      getCurrentTime,
      isPlaying,
      destroy,
      setHandler(fn) {
        onEvent = fn || (() => {});
      },
      setHost(v) {
        hostMode = !!v;
      },
    };
  }

  global.WSProviders = global.WSProviders || {};
  global.WSProviders.youtube = { create, parseId };
})(window);
