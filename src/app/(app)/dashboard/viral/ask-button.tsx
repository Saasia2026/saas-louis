"use client";

export const ASK_EVENT = "viral-ask";

// Bouton hors du chat (colonne des tendances) qui lui pose une question.
export function AskButton({
  question,
  className,
  children,
}: {
  question: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: question }))}
    >
      {children}
    </button>
  );
}
