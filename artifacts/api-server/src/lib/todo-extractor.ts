import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

interface UpdateForExtraction {
  id: number;
  content: string;
  createdAt: Date;
  projectId: number;
  projectTitle: string;
  threadType: string;
}

export interface ExtractedTodo {
  content: string;         // the task text
  priority: "urgent" | "active" | "deferred";
  projectId: number;
  projectTitle: string;
  threadType: string;
  sourceUpdateId: number;
  appearedCount: number;   // how many times this has surfaced (for deferred logic)
}

export async function extractTodos(
  updates: UpdateForExtraction[],
  previousTodos: ExtractedTodo[] = []
): Promise<ExtractedTodo[]> {
  if (updates.length === 0) return [];

  const updateList = updates
    .map((u) => `[ID:${u.id} thread:"${u.projectTitle}" type:${u.threadType}] ${u.content}`)
    .join("\n");

  const prevList =
    previousTodos.length > 0
      ? "\nPreviously surfaced todos (for deferred detection):\n" +
        previousTodos
          .map((t) => `- "${t.content}" (appeared ${t.appearedCount}x)`)
          .join("\n")
      : "";

  const prompt = `You are extracting actionable todos from a personal log for the user's "Now" view — what they should do today.

Log entries:
${updateList}
${prevList}

Rules:
- Extract only clearly actionable items (tasks, calls, decisions needed)
- Ignore: pure notes, ideas with no action, reference material, completed items
- Classify priority:
  - urgent: time-sensitive or explicitly urgent
  - active: in-progress work or clearly intended for soon
  - deferred: appeared in previous todos list without resolution (copy appearedCount + 1)
- Keep task text concise — rephrase if needed, but preserve meaning
- Do NOT invent tasks not implied by the log entries
- Return empty array if nothing is actionable

Return JSON only:
[
  {
    "content": "task text",
    "priority": "urgent" | "active" | "deferred",
    "projectId": <number>,
    "projectTitle": "string",
    "threadType": "string",
    "sourceUpdateId": <number>,
    "appearedCount": <number, default 1>
  }
]`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    return JSON.parse(jsonMatch[0]) as ExtractedTodo[];
  } catch (err) {
    logger.error({ err }, "Todo extraction failed");
    return [];
  }
}
