export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line pb-6">
      <p className="label-mono">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {children && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{children}</p>}
    </header>
  );
}
