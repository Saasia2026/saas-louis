// Titre en deux temps, comme sur la landing : la première partie en gras, la
// suite en italique fine. « Une vidéo, mille versions » ->
// « Une vidéo, » + « mille versions ». Coupe après le premier point ou la
// première virgule ; sans coupure possible, le titre reste en un bloc.
export function TitleLines({ text, stacked = true }: { text: string; stacked?: boolean }) {
  const match = /^(.+?[.,:!?])\s+(.+)$/.exec(text);
  if (!match) return <>{text}</>;
  return (
    <>
      <span className={stacked ? "block" : undefined}>{match[1]}</span>
      {stacked ? null : " "}
      <span className={`text-shine ${stacked ? "block" : ""}`}>{match[2]}</span>
    </>
  );
}
