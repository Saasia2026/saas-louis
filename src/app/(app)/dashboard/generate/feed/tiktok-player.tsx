"use client";

import { useEffect, useRef } from "react";
import type { FeedPlayer } from "./player";

const ORIGIN = "https://www.tiktok.com";

type Message = { type?: unknown; value?: unknown };

function parse(data: unknown): Message | null {
  if (typeof data === "string") {
    try {
      return parse(JSON.parse(data));
    } catch {
      return null;
    }
  }
  return data && typeof data === "object" ? (data as Message) : null;
}

// Vidéo TikTok lue par le lecteur officiel, jamais téléchargée : seule la
// vidéo affichée a son iframe. Le fil la pilote par messages (lecture, pause,
// son, position) ; elle ne reçoit aucun geste, la couche des gestes du fil
// est posée par-dessus pour que le glissement et le double toucher marchent.
export function TikTokPlayer({
  id,
  index,
  title,
  loop,
  registerPlayer,
  onPlayState,
  onEnded,
}: {
  id: string;
  index: number;
  title: string;
  loop: boolean;
  registerPlayer: (index: number, player: FeedPlayer | null) => void;
  onPlayState: (index: number, playing: boolean) => void;
  onEnded: (index: number) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    // Ce que le fil demande, appliqué dès que le lecteur est prêt.
    const state = { ready: false, paused: true, wantPlay: true, muted: true, current: 0, duration: 0 };
    const send = (type: string, value?: unknown) =>
      iframe.contentWindow?.postMessage(
        { "x-tiktok-player": true, type, ...(value === undefined ? {} : { value }) },
        ORIGIN,
      );

    const player: FeedPlayer = {
      async play() {
        state.wantPlay = true;
        if (state.ready) send("play");
      },
      pause() {
        state.wantPlay = false;
        if (state.ready) send("pause");
      },
      get paused() {
        return state.paused;
      },
      get muted() {
        return state.muted;
      },
      setMuted(muted) {
        state.muted = muted;
        if (state.ready) send(muted ? "mute" : "unMute");
      },
      progress: () => (state.duration ? { current: state.current, duration: state.duration } : null),
      seek(seconds) {
        if (state.ready) send("seekTo", seconds);
      },
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== ORIGIN || e.source !== iframe.contentWindow) return;
      const message = parse(e.data);
      if (!message) return;
      switch (message.type) {
        case "onPlayerReady":
          state.ready = true;
          send(state.muted ? "mute" : "unMute");
          send(state.wantPlay ? "play" : "pause");
          break;
        // -1 chargement, 0 fin, 1 lecture, 2 pause, 3 mise en mémoire.
        case "onStateChange":
          if (message.value === 1) {
            state.paused = false;
            onPlayState(index, true);
          } else if (message.value === 2) {
            state.paused = true;
            onPlayState(index, false);
          } else if (message.value === 0) {
            onEnded(index);
          }
          break;
        case "onCurrentTime": {
          const time = message.value as { currentTime?: number; duration?: number } | undefined;
          state.current = Number(time?.currentTime) || 0;
          state.duration = Number(time?.duration) || 0;
          break;
        }
        case "onMute":
          state.muted = Boolean(message.value);
          break;
      }
    };

    window.addEventListener("message", onMessage);
    registerPlayer(index, player);
    return () => {
      window.removeEventListener("message", onMessage);
      registerPlayer(index, null);
    };
  }, [index, registerPlayer, onPlayState, onEnded]);

  const params = new URLSearchParams({
    controls: "0",
    description: "0",
    music_info: "0",
    rel: "0",
    loop: loop ? "1" : "0",
    autoplay: "1",
    muted: "1",
  });

  return (
    <iframe
      ref={frame}
      src={`${ORIGIN}/player/v1/${id}?${params}`}
      title={title}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      className="absolute inset-0 size-full border-0"
    />
  );
}
