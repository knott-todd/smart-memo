import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import type { ThreadType } from "@workspace/db";

interface ExistingThread {
  id: number;
  title: string;
  description: string | null;
  threadType: string;
  lastActivityAt: Date | null;
}

interface RecentEntry {
  content: string;
  projectTitle: string | null;
  projectId: number | null;
  createdAt: Date;
}

export interface ClassificationResult {
  outcome: "match" | "new" | "ambiguous";
  projectId: number | null;
  newProjectTitle: string | null;
  newProjectDescription: string | null;
  threadType: ThreadType;
  updatedTitle: string | null;
  updatedDescription: string | null;
  clarificationQuestion: string | null;
  isNote: false;
}

export async function classifyInput(
  content: string,
  existingThreads: ExistingThread[],
  recentHistory: RecentEntry[] = []
): Promise<ClassificationResult> {
  const now = new Date();

  const threadList =
    existingThreads.length > 0
      ? existingThreads
          .map((t) => {
            const minsAgo = t.lastActivityAt
              ? Math.floor((now.getTime() - new Date(t.lastActivityAt).getTime()) / 60000)
              : null;
            const recency =
              minsAgo !== null
                ? minsAgo < 60
                  ? `(active ${minsAgo}m ago)`
                  : minsAgo < 1440
                  ? `(active ${Math.floor(minsAgo / 60)}h ago)`
                  : `(active ${Math.floor(minsAgo / 1440)}d ago)`
                : "";
            return `- ID ${t.id}: "${t.title}" [${t.threadType}] ${recency}${t.description ? ` — ${t.description}` : ""}`;
          })
          .join("\n")
      : "(none yet)";

  const recentContext =
    recentHistory.length > 0
      ? "\nRecent log entries (newest first):\n" +
        recentHistory
          .map((e) => {
            const minsAgo = Math.floor(
              (now.getTime() - new Date(e.createdAt).getTime()) / 60000
            );
            const when =
              minsAgo < 1
                ? "just now"
                : minsAgo < 60
                ? `${minsAgo}m ago`
                : `${Math.floor(minsAgo / 60)}h ago`;
            return `  [${when}${e.projectTitle ? ` → ${e.projectTitle}` : ""}] "${e.content}"`;
          })
          .join("\n")
      : "";

  const prompt = `You are the classification engine for Continuity — a personal log app.

Every entry must be assigned to a thread. Threads are named clusters of related entries.

Existing threads:
${threadList}
${recentContext}

New entry: "${content}"

THREAD TYPE — assign one:
- project: something being actively built or worked on over time
- idea: concept, creative thought, something to explore later
- admin: logistics, appointments, applications, bureaucracy
- reminder: one-off action item ("call X", "return Y")
- reference: notes from conversations, resources, external info

OUTCOME — choose one:

MATCH: entry continues an existing thread.
  - You must state a clear content reason — not just timing
  - Temporal proximity alone is NOT sufficient
  - "Call Learie" and a hardware wiring note same evening = unrelated
  - Recent activity in same thread raises signal only if content is consistent

NEW: no existing thread fits.
  - Name: concrete, 2-5 words, lowercase
  - Even a one-off thought gets its own thread
  - Include a one-sentence description

AMBIGUOUS: genuinely cannot determine correct thread AND consequence of wrong answer is significant.
  - Use sparingly — short tasks and reminders should just get NEW threads
  - Still pick a best-guess thread
  - Provide a short direct clarification question (not "can you provide more context")

Return JSON only:
{
  "outcome": "match" | "new" | "ambiguous",
  "projectId": <number | null>,
  "newProjectTitle": <string | null>,
  "newProjectDescription": <string | null>,
  "threadType": "project" | "idea" | "admin" | "reminder" | "reference",
  "updatedTitle": <string | null>,
  "updatedDescription": <string | null>,
  "clarificationQuestion": <string | null>
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]) as {
      outcome?: string;
      projectId?: number | null;
      newProjectTitle?: string | null;
      newProjectDescription?: string | null;
      threadType?: string;
      updatedTitle?: string | null;
      updatedDescription?: string | null;
      clarificationQuestion?: string | null;
    };

    const threadType = (
      ["project", "idea", "admin", "reminder", "reference"].includes(parsed.threadType ?? "")
        ? parsed.threadType
        : "idea"
    ) as ThreadType;

    const outcome =
      parsed.outcome === "match" || parsed.outcome === "ambiguous" ? parsed.outcome : "new";

    return {
      outcome,
      projectId: parsed.projectId ?? null,
      newProjectTitle: parsed.newProjectTitle ?? "untitled thread",
      newProjectDescription: parsed.newProjectDescription ?? null,
      threadType,
      updatedTitle: parsed.updatedTitle ?? null,
      updatedDescription: parsed.updatedDescription ?? null,
      clarificationQuestion: parsed.clarificationQuestion ?? null,
      isNote: false,
    };
  } catch (err) {
    logger.error({ err }, "Classifier failed — fallback to new thread");
    return {
      outcome: "new",
      projectId: null,
      newProjectTitle: "untitled thread",
      newProjectDescription: null,
      threadType: "idea",
      updatedTitle: null,
      updatedDescription: null,
      clarificationQuestion: null,
      isNote: false,
    };
  }
}
