"use client";

import { useFormStatus } from "react-dom";

// Bouton d'envoi d'un formulaire serveur, après confirmation.
export function ConfirmButton({
  confirm,
  className,
  children,
}: {
  confirm: string;
  className: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
