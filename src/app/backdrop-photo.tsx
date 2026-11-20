import b from "./backdrop-photo.module.css";

// Photo de fond (voir backdrop-photo.module.css) : plein cadre sur
// téléphone, panneau fondu d'un côté sur grand écran. `focus` règle le
// cadrage (object-position), `side` le côté du panneau, `contained` la pose
// dans son bloc au lieu de tout l'écran.
export function BackdropPhoto({
  src,
  focus = "50% 30%",
  side = "right",
  contained = false,
}: {
  src: string;
  focus?: string;
  side?: "left" | "right";
  contained?: boolean;
}) {
  return (
    <div aria-hidden className={`${b.root} ${contained ? b.absolute : b.fixed} ${side === "left" ? b.left : b.right}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className={b.ambient} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className={b.photo} style={{ objectPosition: focus }} fetchPriority="high" />
      <div className={b.veil} />
    </div>
  );
}
