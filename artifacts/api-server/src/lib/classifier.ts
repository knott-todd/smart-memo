import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

interface ExistingProject {
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
  isNote: boolean;
}

export async function classifyInput(
  content: string,
  existingProjects: ExistingProject[],
  recentHistory: RecentEntry[] = []
): Promise<ClassificationResult> {
  const projectList =
    existingProjects.length > 0
      ? existingProjects
          .map((p) => `- ID ${p.id}: "${p.title}"${p.description ? ` — ${p.description}` : ""}`)
          .join("\n")
      : "(none)";

  const lastEntry = recentHistory[0];
  const olderHistory = recentHistory.slice(1);

  const immediateContext = lastEntry
    ? `\nThe message sent immediately before this one: "${lastEntry.content}"${lastEntry.projectTitle ? ` [→ ${lastEntry.projectTitle}]` : ""}`
    : "";

  const olderContext =
    olderHistory.length > 0
      ? "\nEarlier context (less relevant):\n" +
        olderHistory
          .map((e) => `- "${e.content}"${e.projectTitle ? ` [→ ${e.projectTitle}]` : ""}`)
          .join("\n")
      : "";

  const prompt = `You are a project classifier for a productivity app called Continuity. A user dumped a raw thought or update.

Existing projects:
${projectList}
${immediateContext}
${olderContext}

New input: "${content}"

Decide ONE of three outcomes:

1. MATCH — this input relates to an existing project. Use this whenever the input mentions, updates, or continues work on something that matches an existing project. Also use MATCH when the input is a follow-up or correction to something in the recent conversation context that was logged to a project (e.g. "actually it should be black" after discussing a lamp design). Err strongly on the side of matching.

2. NEW — this input describes something genuinely new with ongoing scope: building a product, running a campaign, a multi-step task. Only use NEW if no existing project fits at all.

3. NOTE — this is a loose thought with no ongoing project scope: a one-off reminder, random observation, or idea that clearly doesn't connect to anything being built or worked on. Use NOTE sparingly.

Rules:
- The message sent immediately before this one is the strongest context signal — if the new input feels like a continuation of it, match to the same project
- If the input contains BOTH a project-related thought AND a personal/unrelated aside (e.g. "I need to plan the architecture. Also call John."), treat the whole message as MATCH to the relevant project — do not let the aside push it to NOTE
- Strongly prefer MATCH if there is any reasonable connection to an existing project
- Only use NOTE for things that clearly have no project scope whatsoever
- If MATCH: also check whether the input reveals a better title or description for the project
- If NEW: infer a concise title (2-5 words) and one-sentence description

Return JSON only, no other text:
{
  "outcome": "match" | "new" | "note",
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
      outcome: "match" | "new" | "note";
      projectId?: number | null;
      newProjectTitle?: string | null;
      newProjectDescription?: string | null;
      updatedTitle?: string | null;
      updatedDescription?: string | null;
    };

    if (parsed.outcome === "note") {
      return {
        projectId: null,
        newProjectTitle: null,
        newProjectDescription: null,
        updatedTitle: null,
        updatedDescription: null,
        isNote: true,
      };
    }

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
      newProjectTitle: parsed.newProjectTitle ?? "Untitled Project",
      newProjectDescription: parsed.newProjectDescription ?? null,
      updatedTitle: null,
      updatedDescription: null,
      isNote: false,
    };
  } catch (err) {
    logger.error({ err }, "Failed to parse classification JSON — defaulting to note");
    return {
      projectId: null,
      newProjectTitle: null,
      newProjectDescription: null,
      updatedTitle: null,
      updatedDescription: null,
      isNote: true,
    };
  }
}