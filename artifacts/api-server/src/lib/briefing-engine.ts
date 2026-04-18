import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export interface BriefingOutput {
  lastKnownState: string;
  confidenceLevel: "high" | "medium" | "low";
  confidenceLabel: string;
  blockers?: string[];
  nextActions?: string[];
  rawOutput: string;
}

interface Update {
  content: string;
  sourceType: string;
  createdAt: Date;
}

interface LastBriefing {
  lastKnownState: string;
  confidenceLevel: string;
  rawOutput: string;
  createdAt: Date;
}

export async function generateBriefing(
  projectTitle: string,
  updates: Update[],
  lastBriefing?: LastBriefing | null,
  daysSinceActivity?: number
): Promise<BriefingOutput> {
  const updatesText = updates
    .slice(-20)
    .map((u) => `[${new Date(u.createdAt).toLocaleDateString()} - ${u.sourceType}] ${u.content}`)
    .join("\n\n");

  const stalenessNote =
    daysSinceActivity != null && daysSinceActivity > 2
      ? `\nNote: This project has had no activity for ${daysSinceActivity} days. Confidence should reflect this staleness.`
      : "";

  const lastBriefingSection = lastBriefing
    ? `\n\nPrevious last-known state (${new Date(lastBriefing.createdAt).toLocaleDateString()}): ${lastBriefing.lastKnownState}`
    : "";

  const prompt = `You are Continuity — a tool that helps people re-enter projects.

Your job is to extract and restate ONLY what the user has explicitly said.
You are NOT allowed to infer, assume, suggest, or fill in missing details.

---

Project: "${projectTitle}"${stalenessNote}${lastBriefingSection}

User inputs (chronological):
${updatesText || "(No inputs yet)"}

---

Generate a briefing with these fields:
- "lastKnownState" (always required): 1-2 sentences based ONLY on what the user has written.
- "confidenceLevel" (always required): "high" | "medium" | "low"
- "confidenceLabel" (always required): reflects recency and amount of info (e.g. "Based on your update today", "Very little info captured yet")
- "blockers" (ONLY if the user explicitly used words like "blocked", "stuck", "can't", "issue", "problem", "not working")
- "nextActions" (ONLY if the user explicitly stated intent with phrases like "I need to", "I will", "plan to", "next I")

If blockers or nextActions are not explicitly present in the user's words, do not include those fields at all.

---

EXAMPLES:

User input: "I want to build a superhero action figure with laser eyes"

CORRECT output:
{
  "lastKnownState": "The user wants to build a superhero action figure with laser eyes. No further details have been provided.",
  "confidenceLevel": "high",
  "confidenceLabel": "Based on your update today"
}

WRONG output (do not do this — blockers and nextActions were invented, not stated):
{
  "lastKnownState": "The user wants to build a superhero action figure with laser eyes.",
  "confidenceLevel": "high",
  "confidenceLabel": "Based on your update today",
  "blockers": ["No defined materials or tools", "No design plan"],
  "nextActions": ["Sketch a concept", "Choose materials", "Define laser eye mechanism"]
}

---

Return ONLY the JSON object. No extra text.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.3",
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "You produce minimal JSON briefings. CRITICAL: Omit the 'blockers' field entirely unless the user explicitly used words like 'blocked', 'stuck', 'can't', 'issue', or 'problem'. Omit the 'nextActions' field entirely unless the user explicitly stated intent with phrases like 'I need to', 'I will', 'plan to', or 'next I'. Do not infer, suggest, or add anything not directly stated. When in doubt, output less.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";

  let parsed: Omit<BriefingOutput, "rawOutput">;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.error({ err, raw }, "Failed to parse briefing JSON");
    parsed = {
      lastKnownState: "Unable to generate briefing. Please add more project updates.",
      confidenceLevel: "low",
      confidenceLabel: "No data available yet",
      blockers: [],
      nextActions: ["Add a project update to get a better briefing"],
    };
  }

  return {
    lastKnownState: parsed.lastKnownState || "",
    confidenceLevel: (["high", "medium", "low"].includes(parsed.confidenceLevel)
      ? parsed.confidenceLevel
      : "low") as BriefingOutput["confidenceLevel"],
    confidenceLabel: parsed.confidenceLabel || `Based on info from ${daysSinceActivity != null ? `${daysSinceActivity} days ago` : "recently"}`,
    blockers: Array.isArray(parsed.blockers) ? parsed.blockers : undefined,
    nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions : undefined,
    rawOutput: raw,
  };
}