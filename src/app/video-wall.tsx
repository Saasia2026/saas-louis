"use client";

const COLS: number[][] = [
  [1, 5, 9, 13, 17, 21],
  [2, 6, 10, 14, 18, 22],
  [3, 7, 11, 15, 19, 23],
  [4, 8, 12, 16, 20, 3],
];

const DURATIONS = [58, 44, 52, 40];

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
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${n}-${i}`}
              src={`/demos/demo-${String(n).padStart(2, "0")}.jpg`}
              alt=""
              loading="lazy"
              className="video-wall-thumb"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
