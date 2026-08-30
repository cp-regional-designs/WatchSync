/**
 * Player wrapper:
 *  - Vidking / YouTube / HTML5
 *  - Click-lock on Vidking blocks ad / malware redirects
 *  - ONLY THE HOST can unlock (viewers stay locked — safer)
 *  - Host-authoritative sync
 */
(function (global) {
  function mount(root, { isHost, onHostEvent }) {
    const stage = root.querySelector("[data-stage]");
    const loading = root.querySelector("[data-loading]");
    const titleEl = root.querySelector("[data-title]");
    const lockEl = root.querySelector("[data-lock]");
    const posterEl = root.querySelector("[data-poster]");

    let provider = null;
    let current = null;
    let locked = false;
    let unlockTimer = null;
    let kindNow = null;

    function showLoading(on, poster) {
      if (loading) loading.hidden = !on;
      if (posterEl && poster) posterEl.style.backgroundImage = `url(${poster})`;
    }

    function updateLockUI() {
      const host = typeof isHost === "function" ? isHost() : !!isHost;
      const isVk = kindNow === "vidking";

      if (lockEl) {
        lockEl.hidden = !locked;
        // Shield always blocks clicks when locked
        if (locked) {
          if (host) {
            // Host: empty shield + unlock control sitting on top (pointer-events on button only)
            lockEl.innerHTML =
              '<button type="button" class="lock-host-unlock" data-unlock>Unlock 15s</button>';
            lockEl.querySelector("[data-unlock]").addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              unlockFor(15000);
            });
          } else {
            // Viewer: tiny corner label, no big card
            lockEl.innerHTML =
              '<span class="lock-tiny">Player locked</span>';
          }
        } else {
          lockEl.innerHTML = "";
        }
      }

      const chip = document.getElementById("unlockPlayerBtn");
      if (chip) {
        // Host only, only for Vidking
        const show = isVk && host;
        chip.classList.toggle("hidden", !show);
        chip.style.display = show ? "" : "none";
        chip.classList.toggle("is-unlocked", show && !locked);
        chip.textContent = locked ? "Unlock player" : "Unlocked · 15s";
        if (!chip._wsBound) {
          chip._wsBound = true;
          chip.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!(typeof isHost === "function" ? isHost() : isHost)) return;
            unlockFor(15000);
          });
        }
      }
    }

    function setLocked(on) {
      locked = !!on;
      updateLockUI();
    }

    function unlockFor(ms) {
      if (!(typeof isHost === "function" ? isHost() : isHost)) return;
      setLocked(false);
      clearTimeout(unlockTimer);
      unlockTimer = setTimeout(() => {
        if (kindNow === "vidking") setLocked(true);
      }, ms || 15000);
    }

    function attach(kind) {
      if (provider) provider.destroy();
      stage.querySelectorAll(".player-frame, video, iframe").forEach((n) => n.remove());
      const factory = global.WSProviders[kind];
      provider = factory.create(stage);
      provider.setHandler?.((ev) => {
        if (ev.type === "ready") showLoading(false);
        if ((typeof isHost === "function" ? isHost() : isHost) && ev.type && ev.type !== "ready") {
          onHostEvent(ev);
        }
      });
      provider.setHost?.(typeof isHost === "function" ? isHost() : isHost);
    }

    function load(video, startAt = 0) {
      current = video;
      if (titleEl) titleEl.textContent = video.title || "Now playing";
      showLoading(true, video.poster);
      kindNow =
        video.provider === "youtube"
          ? "youtube"
          : video.provider === "html5"
            ? "html5"
            : "vidking";
      attach(kindNow);
      provider.load(video, startAt);
      // Always lock Vidking for everyone — host may unlock briefly
      setLocked(kindNow === "vidking");
    }

    return {
      load,
      play() {
        provider?.play();
      },
      pause() {
        provider?.pause();
      },
      seek(t) {
        provider?.seek(t);
      },
      getCurrentTime() {
        return provider?.getCurrentTime?.() || 0;
      },
      isPlaying() {
        return provider?.isPlaying?.() || false;
      },
      reloadAt(t) {
        if (!current) return;
        load(current, t);
      },
      current() {
        return current;
      },
      unlock: unlockFor,
      isLocked() {
        return locked;
      },
      refreshLock() {
        updateLockUI();
      },
      destroy() {
        clearTimeout(unlockTimer);
        provider?.destroy();
        provider = null;
      },
    };
  }

  global.WSPlayer = { mount };
})(window);
