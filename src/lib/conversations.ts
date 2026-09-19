import "server-only";
import { z } from "zod";
import { HandoffSchema, type DirectorHandoff, type DirectorMessage } from "@/lib/director";
import { createClient } from "@/lib/supabase/server";

// Discussions du mode Director enregistrées (voir directorChat).

export const SIDEBAR_CONVERSATIONS = 30;

export type ConversationSummary = { id: string; title: string };

export type Conversation = {
  id: string;
  messages: DirectorMessage[];
  handoff: DirectorHandoff | null;
  ideas: string[];
};

const MessagesSchema = z.array(
  z.object({ role: z.enum(["user", "assistant"]), content: z.string() }),
);

// Les plus récentes d'abord, pour la barre latérale.
export async function listConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("director_conversations")
    .select("id, title")
    .order("updated_at", { ascending: false })
    .limit(SIDEBAR_CONVERSATIONS);
  return data ?? [];
}

export async function getConversation(id: string): Promise<Conversation | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("director_conversations")
    .select("id, messages, handoff, ideas")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const messages = MessagesSchema.safeParse(data.messages);
  const handoff = HandoffSchema.safeParse(data.handoff);
  const ideas = z.array(z.string()).safeParse(data.ideas);
  return {
    id: data.id,
    messages: messages.success ? messages.data : [],
    handoff: handoff.success ? (handoff.data as DirectorHandoff) : null,
    ideas: ideas.success ? ideas.data : [],
  };
}
