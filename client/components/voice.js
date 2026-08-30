/**
 * Mesh WebRTC voice lobby for small rooms.
 * Signaling goes through Socket.IO (voice:join / voice:signal / voice:leave).
 */
(function (global) {
  const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

  function create({ socket, getMyId, onState }) {
    let localStream = null;
    let muted = false;
    let inVoice = false;
    const peers = new Map(); // peerId -> { pc, audio }

    function emitState() {
      onState?.({
        inVoice,
        muted,
        peerCount: peers.size,
        peers: [...peers.keys()],
      });
    }

    async function join() {
      if (inVoice) return;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      } catch (err) {
        throw new Error("Microphone permission denied");
      }
      inVoice = true;
      muted = false;
      socket.emit("voice:join");
      emitState();
    }

    function leave() {
      inVoice = false;
      socket.emit("voice:leave");
      for (const [id] of peers) closePeer(id);
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        localStream = null;
      }
      emitState();
    }

    function setMuted(v) {
      muted = !!v;
      if (localStream) localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
      emitState();
    }

    function toggleMute() {
      setMuted(!muted);
    }

    async function ensurePc(peerId) {
      if (peers.has(peerId)) return peers.get(peerId);
      const pc = new RTCPeerConnection({ iceServers: ICE });
      const entry = { pc, audio: null };
      peers.set(peerId, entry);
      if (localStream) localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("voice:signal", { to: peerId, data: { type: "ice", candidate: e.candidate } });
        }
      };
      pc.ontrack = (e) => {
        let audio = entry.audio;
        if (!audio) {
          audio = document.createElement("audio");
          audio.autoplay = true;
          audio.playsInline = true;
          audio.dataset.peer = peerId;
          document.body.appendChild(audio);
          entry.audio = audio;
        }
        audio.srcObject = e.streams[0];
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
          // keep for brief network blips; hard close on closed/failed
          if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(peerId);
        }
        emitState();
      };
      emitState();
      return entry;
    }

    async function callPeer(peerId) {
      if (!inVoice || peerId === getMyId()) return;
      const { pc } = await ensurePc(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("voice:signal", { to: peerId, data: { type: "offer", sdp: offer } });
    }

    async function onSignal({ from, data }) {
      if (!inVoice || !from || !data) return;
      const { pc } = await ensurePc(from);
      if (data.type === "offer") {
        await pc.setRemoteDescription(data.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("voice:signal", { to: from, data: { type: "answer", sdp: answer } });
      } else if (data.type === "answer") {
        await pc.setRemoteDescription(data.sdp);
      } else if (data.type === "ice" && data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch {}
      }
    }

    function onPeerJoined({ id }) {
      if (!inVoice || !id || id === getMyId()) return;
      // existing members call the new joiner
      callPeer(id);
    }

    function onPeers(list) {
      // new joiner waits for offers from existing; optional proactive call
      (list || []).forEach((p) => callPeer(p.id));
    }

    function onPeerLeft({ id }) {
      closePeer(id);
    }

    function closePeer(id) {
      const entry = peers.get(id);
      if (!entry) return;
      try {
        entry.pc.close();
      } catch {}
      if (entry.audio) {
        entry.audio.srcObject = null;
        entry.audio.remove();
      }
      peers.delete(id);
      emitState();
    }

    function destroy() {
      leave();
    }

    return {
      join,
      leave,
      toggleMute,
      setMuted,
      onSignal,
      onPeerJoined,
      onPeers,
      onPeerLeft,
      destroy,
      get inVoice() {
        return inVoice;
      },
      get muted() {
        return muted;
      },
    };
  }

  global.WSVoice = { create };
})(window);
