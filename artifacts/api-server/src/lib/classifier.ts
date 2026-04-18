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
  updatedTitle: string | null;       // if input reveals a better title for an existing project
  updatedDescription: string | null; // if input reveals better description for an existing project
  isNote: boolean;
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

  const prompt = `You are a project classifier for a productivity app called Continuity. A user dumped a raw thought or update.

Existing projects:
${projectList}

New input: "${content}"

Decide ONE of three outcomes:

1. MATCH — this input relates to an existing project. Use this whenever the input mentions, updates, or continues work on something that matches an existing project title or description. Err on the side of matching.

2. NEW — this input describes something genuinely new with ongoing scope: building a product, running a campaign, a multi-step task, a project with a goal. Only use NEW if no existing project fits.

3. NOTE — this is a loose thought with no ongoing project scope: a reminder, a one-off observation, a random idea that doesn't connect to anything being built or worked on.

Important rules:
- Prefer MATCH over NEW if there is any reasonable connection to an existing project
- Only use NOTE for things that clearly have no project scope at all
- If MATCH: also check whether the input reveals a better title or description for the project (e.g. user says "actually I'm calling this X" or provides more context about what the project is)
- If NEW: infer a concise title (2-5 words) and a one-sentence description

Return JSON only, no other text:
{
  "outcome": "match" | "new" | "note",
  "projectId": <number or null>,
  "newProjectTitle": <string or null>,
  "newProjectDescription": <string or null>,
  "updatedTitle": <string or null — only if outcome is match and input reveals a better title>,
  "updatedDescription": <string or null — only if outcome is match and input reveals better description>
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