import { useId, type ReactNode } from "react";

// Icônes pleines en dégradé argenté (graphite en thème clair), posées dans une
// bulle de verre (.glass-bubble, globals.css).

function Glyph({ className = "size-6", children }: { className?: string; children: (fill: string) => ReactNode }) {
  const id = useId();
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--bubble-icon-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--bubble-icon-to)" }} />
        </linearGradient>
      </defs>
      {children(`url(#${id})`)}
    </svg>
  );
}

export function CameraGlyph({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      {(fill) => (
        <>
          <path fill={fill} d="M3 7.5A2.5 2.5 0 0 1 5.5 5h8A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 16.5z" />
          <path fill={fill} d="m17.2 10.1 3.2-1.8c.5-.3 1.1.1 1.1.7v6c0 .6-.6 1-1.1.7l-3.2-1.8z" />
        </>
      )}
    </Glyph>
  );
}

export function HeadGlyph({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      {(fill) => (
        <path
          fill={fill}
          d="M13.6 2.5c-4.3 0-7.4 3.1-7.4 7.2 0 .7.1 1.3.3 1.9l-1.8 2.9c-.3.5 0 1 .5 1.1l1.4.3v2.2c0 1.1.9 1.9 1.9 1.9h1.9v2.5h8.2v-4.9c1.7-1.4 2.8-3.5 2.8-5.9V9.9c0-4.2-3.3-7.4-7.8-7.4z"
        />
      )}
    </Glyph>
  );
}

export function ShirtGlyph({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      {(fill) => (
        <path
          fill={fill}
          d="M8.2 3 3.3 5.3a1 1 0 0 0-.5.6L1.6 9.6a.8.8 0 0 0 .4 1l2.6 1.2a.8.8 0 0 0 1-.3l.6-1v9.9c0 .6.4 1 1 1h9.6c.6 0 1-.4 1-1v-9.9l.6 1c.2.3.6.4 1 .3l2.6-1.2a.8.8 0 0 0 .4-1l-1.2-3.7a1 1 0 0 0-.5-.6L15.8 3c-.5 1.6-2 2.6-3.8 2.6S8.7 4.6 8.2 3z"
        />
      )}
    </Glyph>
  );
}

// Cube en perspective : le dessus plein, les côtés de plus en plus sombres.
export function CubeGlyph({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      {(fill) => (
        <>
          <path fill={fill} d="M12 2.8 20.6 7.3 12 11.6 3.4 7.3z" />
          <path fill={fill} opacity="0.78" d="m2.9 8.2 8.5 4.3v8.8l-8.5-4.4z" />
          <path fill={fill} opacity="0.5" d="M21.1 8.2v8.7l-8.5 4.4v-8.8z" />
        </>
      )}
    </Glyph>
  );
}

export function PlusGlyph({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      {(fill) => <path fill={fill} d="M10.75 4.5h2.5v6.25h6.25v2.5h-6.25v6.25h-2.5v-6.25H4.5v-2.5h6.25z" />}
    </Glyph>
  );
}

export function GlassBubble({ className = "size-14", children }: { className?: string; children: ReactNode }) {
  return <span className={`glass-bubble ${className}`}>{children}</span>;
}
