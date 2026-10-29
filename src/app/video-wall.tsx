"use client";

const COLS: number[][] = [
  [1, 9, 17],
  [2, 10, 18],
  [3, 11, 19],
  [4, 12, 20],
];

const DURATIONS = [58, 44, 52, 40];

const pad = (n: number) => `/demos/demo-${String(n).padStart(2, "0")}`;

export function VideoWall() {
  return (
    <div className="video-wall" aria-hidden>
      <div className="video-wall-fade" />
      {COLS.map((col, ci) => (
        <div
          key={ci}
          className="video-wall-col"
          style={{ animationDuration: `${DURATIONS[ci]}s` }}
        >
          {[...col, ...col].map((n, i) => (
            <video
              key={`${n}-${i}`}
              src={`${pad(n)}.mp4`}
              poster={`${pad(n)}.jpg`}
              muted
              loop
              autoPlay
              playsInline
              webkit-playsinline=""
              disablePictureInPicture
              disableRemotePlayback
              className="video-wall-thumb pointer-events-none"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
