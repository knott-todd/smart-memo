import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

interface ExistingThread {
  id: number;
  title: string;
  description: string | null;
}

interface RecentEntry {
  content: string;
  projectTitle: string | null;
}

export interface ClassificationResult {
  projectId: number | null;
  newProjectTitle: string | null;
  newProjectDescription: string | null;
  updatedTitle: string | null;
  updatedDescription: string | null;
  isNote: false; // Always false — everything gets a thread now
}

export async function classifyInput(
  content: string,
  existingThreads: ExistingThread[],
  recentHistory: RecentEntry[] = []
): Promise<ClassificationResult> {
  const threadList =
    existingThreads.length > 0
      ? existingThreads
          .map((t) => `- ID ${t.id}: "${t.title}"${t.description ? ` — ${t.description}` : ""}`)
          .join("\n")
      : "(none yet)";

  const lastEntry = recentHistory[0];
  const olderHistory = recentHistory.slice(1);

  const immediateContext = lastEntry
    ? `\nThe entry logged immediately before this one: "${lastEntry.content}"${lastEntry.projectTitle ? ` [→ ${lastEntry.projectTitle}]` : ""}`
    : "";

  const olderContext =
    olderHistory.length > 0
      ? "\nEarlier context:\n" +
        olderHistory
          .map((e) => `- "${e.content}"${e.projectTitle ? ` [→ ${e.projectTitle}]` : ""}`)
          .join("\n")
      : "";

  const prompt = `You are the threading engine for Continuity — a personal log app. Every entry the user types must be assigned to a thread. Threads are named clusters of related entries. They can be projects, topics, people, recurring ideas — anything.

Existing threads:
${threadList}
${immediateContext}
${olderContext}

New entry: "${content}"

Decide ONE of two outcomes:

1. MATCH — this entry continues or relates to an existing thread. Use the immediate prior entry as the strongest signal — if this entry feels like a continuation, match it to the same thread. Err heavily toward MATCH when there's any reasonable connection.

2. NEW — no existing thread fits at all. Create a new one with a specific, natural name. Thread names should be concrete and descriptive (e.g. "dentist appointment", "Continuity app", "half marathon training", "side project pricing"), not vague buckets like "health" or "misc". Even a single one-off thought gets its own thread if it doesn't fit anything existing — it may accumulate more entries later.

Rules:
- The prior entry is the strongest context signal. Follow-ups, corrections, and continuations all belong to the same thread.
- Mixed messages (project thought + personal aside) → MATCH to the project thread.
- There is no NOTE or discard option. Every entry gets a thread.
- If MATCH: also check whether the entry reveals a better title or description for the thread.
- If NEW: infer a concise title (2–5 words, lowercase preferred) and a one-sentence description.

Return JSON only, no other text:
{
  "outcome": "match" | "new",
  "projectId": <number or null>,
  "newProjectTitle": <string or null>,
  "newProjectDescription": <string or null>,
  "updatedTitle": <string or null>,
  "updatedDescription": <string or null>
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]) as {
      outcome: "match" | "new";
      projectId?: number | null;
      newProjectTitle?: string | null;
      newProjectDescription?: string | null;
      updatedTitle?: string | null;
      updatedDescription?: string | null;
    };

    if (parsed.outcome === "match" && typeof parsed.projectId === "number") {
      return {
        projectId: parsed.projectId,
        newProjectTitle: null,
        newProjectDescription: null,
        updatedTitle: parsed.updatedTitle ?? null,
        updatedDescription: parsed.updatedDescription ?? null,
        isNote: false,
      };
    }

    // outcome === "new"
    return {
      projectId: null,
      newProjectTitle: parsed.newProjectTitle ?? "untitled thread",
      newProjectDescription: parsed.newProjectDescription ?? null,
      updatedTitle: null,
      updatedDescription: null,
      isNote: false,
    };
  } catch (err) {
    logger.error({ err }, "Failed to parse classification JSON — creating new thread as fallback");
    return {
      projectId: null,
      newProjectTitle: "untitled thread",
      newProjectDescription: null,
      updatedTitle: null,
      updatedDescription: null,
      isNote: false,
    };
  }
}
