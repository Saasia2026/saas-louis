export function PageHeader({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  // Boutons ou indicateurs alignés à droite du titre.
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex animate-fade-up flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="text-gradient mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        {children && (
          <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">{children}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
