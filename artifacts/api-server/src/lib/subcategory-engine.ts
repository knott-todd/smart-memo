import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

interface ThreadForGrouping {
  id: number;
  title: string;
  description: string | null;
}

export interface SubcategoryAssignment {
  subcategory: string;
  threadIds: number[];
}

/**
 * Given a list of threads in the same top-level category bucket,
 * generate subcategory groupings.
 *
 * Rules (from design doc):
 * - Only generate a subcategory if 3+ threads share a clear observable attribute
 * - Names are concrete nouns derived from thread titles — no interpretation
 * - Max one level deep
 * - Err toward NOT creating a subcategory over creating a spurious one
 * - Threads that don't fit any subcategory return subcategory: null
 */
export async function generateSubcategories(
  threads: ThreadForGrouping[]
): Promise<SubcategoryAssignment[]> {
  if (threads.length < 3) return [];

  const threadList = threads
    .map((t) => `- ID ${t.id}: "${t.title}"${t.description ? ` — ${t.description}` : ""}`)
    .join("\n");

  const prompt = `You are grouping threads for a personal note app into subcategories.

Threads:
${threadList}

Rules:
1. Only create a subcategory if 3 or more threads share a clear, observable attribute
2. Names must be concrete nouns derived directly from thread titles — no interpretation
   ✓ "Python scripts", "dentist appointments", "job applications"
   ✗ "Technical work", "Health matters", "Career stuff"
3. A thread belongs to at most one subcategory
4. Threads that don't fit any group go uncategorised (omit them)
5. If no valid groupings exist, return an empty array
6. Err toward fewer, cleaner groups over many spurious ones

Return JSON only — an array of groups (can be empty):
[
  { "subcategory": "name", "threadIds": [1, 2, 3] }
]`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as { subcategory: string; threadIds: number[] }[];
    return parsed.filter((g) => g.threadIds.length >= 3);
  } catch (err) {
    logger.error({ err }, "Subcategory generation failed");
    return [];
  }
}
