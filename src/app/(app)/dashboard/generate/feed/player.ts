// Ce que le fil pilote sur la vidéo affichée : lecture, pause, son, position.
export type FeedPlayer = {
  play(): Promise<void>;
  pause(): void;
  readonly paused: boolean;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  progress(): { current: number; duration: number } | null;
  seek(seconds: number): void;
};

export function videoPlayer(video: HTMLVideoElement): FeedPlayer {
  return {
    play: () => video.play(),
    pause: () => video.pause(),
    get paused() {
      return video.paused;
    },
    get muted() {
      return video.muted;
    },
    setMuted(muted) {
      video.muted = muted;
    },
    progress: () => (video.duration ? { current: video.currentTime, duration: video.duration } : null),
    seek(seconds) {
      video.currentTime = seconds;
    },
  };
}
