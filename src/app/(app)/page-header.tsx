export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  // Boutons ou indicateurs alignés à droite du titre.
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex animate-fade-up flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="text-gradient mt-4 font-headline text-[2.4rem] leading-[0.92] sm:text-5xl">
          {title}
        </h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
