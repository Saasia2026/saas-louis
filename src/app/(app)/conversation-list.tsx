"use client";

import { MessageSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/i18n/provider";
import type { ConversationSummary } from "@/lib/conversations";
import { deleteConversation } from "./dashboard/generate/conversation-actions";

// Discussions du Director dans la barre latérale, comme dans Claude ou
// ChatGPT : un clic rouvre la discussion dans le studio.
export function ConversationList({ conversations }: { conversations: ConversationSummary[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = pathname.startsWith("/dashboard/generate") ? searchParams.get("c") : null;
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);

  if (!conversations.length) {
    return <p className="px-3 text-xs text-faint">{t.shell.noConversations}</p>;
  }

  function remove(id: string) {
    if (!window.confirm(t.shell.deleteConversationConfirm)) return;
    setRemoving(id);
    startTransition(async () => {
      await deleteConversation(id);
      if (id === activeId) router.push("/dashboard/generate");
      setRemoving(null);
    });
  }

  return (
    <nav className="-mr-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto pr-1">
      {conversations.map((c) => {
        const active = c.id === activeId;
        return (
          <div
            key={c.id}
            className={`group relative flex items-center rounded-lg text-sm transition-colors ${
              active ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-2 hover:text-text"
            } ${pending && removing === c.id ? "opacity-50" : ""}`}
          >
            <Link
              href={`/dashboard/generate?c=${c.id}`}
              aria-current={active ? "page" : undefined}
              title={c.title}
              className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pr-1 pl-3"
            >
              <MessageSquare
                className={`size-3.5 shrink-0 ${active ? "text-accent-light" : "text-faint"}`}
              />
              <span className="truncate">{c.title || t.shell.untitledConversation}</span>
            </Link>
            <button
              type="button"
              onClick={() => remove(c.id)}
              disabled={pending}
              title={t.shell.deleteConversation}
              aria-label={t.shell.deleteConversation}
              className="mr-1 shrink-0 rounded-md p-1 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        );
      })}
    </nav>
  );
}
