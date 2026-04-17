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
}

export async function classifyInput(
  content: string,
  existingProjects: ExistingProject[]
): Promise<ClassificationResult> {
  if (existingProjects.length === 0) {
    const title = await inferProjectTitle(content);
    return { projectId: null, newProjectTitle: title.title, newProjectDescription: title.description };
  }

  const projectList = existingProjects
    .map((p) => `- ID ${p.id}: "${p.title}"${p.description ? ` — ${p.description}` : ""}`)
    .join("\n");

  const prompt = `You are a project classifier for a productivity app called Continuity. A user has typed a raw thought, update, or note. Determine which existing project this belongs to, or decide it's a new project entirely.

Existing projects:
${projectList}

New input: "${content}"

Rules:
- Match to an existing project only if the content clearly relates to it
- If the content introduces something genuinely new or unrelated to all existing projects, it's a new project
- If new, infer a concise project title (3-5 words) and a brief one-sentence description
- Do NOT create duplicate projects

Return JSON only, no other text:
{ "projectId": <number or null>, "newProjectTitle": <string or null>, "newProjectDescription": <string or null> }`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.choices[0]?.message?.content ?? "";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]) as ClassificationResult;
    return {
      projectId: typeof parsed.projectId === "number" ? parsed.projectId : null,
      newProjectTitle: parsed.newProjectTitle ?? null,
      newProjectDescription: parsed.newProjectDescription ?? null,
    };
  } catch (err) {
    logger.error({ err, raw }, "Failed to parse classification JSON");
    return { projectId: null, newProjectTitle: "Untitled Project", newProjectDescription: null };
  }
}

async function inferProjectTitle(content: string): Promise<{ title: string; description: string }> {
  const prompt = `A user typed this note into a productivity app: "${content}"

Infer a short project title (3-5 words) and a one-sentence description for what this project is about.

Return JSON only: { "title": "...", "description": "..." }`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 128,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.choices[0]?.message?.content ?? "";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { title: "New Project", description: content.slice(0, 100) };
  }
}
