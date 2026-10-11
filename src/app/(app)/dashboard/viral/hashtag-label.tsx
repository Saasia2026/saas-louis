// Hashtag avec son « # » en couleur.
export function HashtagLabel({ tag }: { tag: string }) {
  return (
    <>
      <span className="text-accent-hot">#</span>
      {tag.replace(/^#/, "")}
    </>
  );
}
