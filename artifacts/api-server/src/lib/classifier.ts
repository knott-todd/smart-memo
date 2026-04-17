import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

interface ExistingProject {
  id: number;
  title: string;
  description: string | null;
}

export interface ClassificationResult {
  projectId: number | null;
  newProjectTitle: string | null;
  newProjectDescription: string | null;
  isNote: boolean; // true = save as a loose note, don't touch projects
}

export async function classifyInput(
  content: string,
  existingProjects: ExistingProject[]
): Promise<ClassificationResult> {
  const projectList =
    existingProjects.length > 0
      ? existingProjects
          .map((p) => `- ID ${p.id}: "${p.title}"${p.description ? ` — ${p.description}` : ""}`)
          .join("\n")
      : "(none)";

  const prompt = `You are a project classifier for a productivity app. A user typed a raw thought, update, or note.

Existing projects:
${projectList}

New input: "${content}"

Decide ONE of three outcomes:
1. MATCH — this clearly belongs to an existing project
2. NEW — this introduces a genuinely new project worth tracking
3. NOTE — this is a loose thought, random idea, reminder, or personal note that doesn't warrant its own project

Rules:
- Use NOTE liberally for journal entries, reminders, random thoughts, single-line observations, or anything that doesn't have a clear ongoing scope
- Match to an existing project only if the content clearly relates to it
- Create a new project only when the input describes something with ongoing scope (e.g. building a product, running a campaign, a multi-step task)
- Do NOT create duplicate projects
- If NEW: infer a concise title (3-5 words) and a brief one-sentence description

Return JSON only, no other text:
{ "outcome": "match" | "new" | "note", "projectId": <number or null>, "newProjectTitle": <string or null>, "newProjectDescription": <string or null> }`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 256,
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
    };

    if (parsed.outcome === "note") {
      return { projectId: null, newProjectTitle: null, newProjectDescription: null, isNote: true };
    }

    if (parsed.outcome === "match" && typeof parsed.projectId === "number") {
      return {
        projectId: parsed.projectId,
        newProjectTitle: null,
        newProjectDescription: null,
        isNote: false,
      };
    }

    // outcome === "new"
    return {
      projectId: null,
      newProjectTitle: parsed.newProjectTitle ?? "Untitled Project",
      newProjectDescription: parsed.newProjectDescription ?? null,
      isNote: false,
    };
  } catch (err) {
    logger.error({ err }, "Failed to parse classification JSON — defaulting to note");
    return { projectId: null, newProjectTitle: null, newProjectDescription: null, isNote: true };
  }
}
