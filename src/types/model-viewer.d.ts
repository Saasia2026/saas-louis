// Balise <model-viewer> (@google/model-viewer), chargée côté client dans
// twin-model-viewer.tsx. Seuls les attributs utilisés sont déclarés.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        poster?: string;
        alt?: string;
        "camera-controls"?: boolean;
        "auto-rotate"?: boolean;
        "shadow-intensity"?: string;
        exposure?: string;
        "touch-action"?: string;
      };
    }
  }
}
