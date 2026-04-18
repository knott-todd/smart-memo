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

Generate a briefing in this exact JSON format:
{
  "lastKnownState": "1-2 sentences describing where the project stands based ONLY on what the user has written. If there is very little information, say so plainly.",
  "confidenceLevel": "high|medium|low",
  "confidenceLabel": "Must reflect recency and amount of information (e.g. 'Based on your update today', 'Based on info from 3 days ago', 'Very little info captured yet')",
  "blockers": ["Only include if explicitly stated by the user (see rules below)"],
  "nextActions": ["Only include if explicitly stated by the user (see rules below)"]
}

---

STRICT RULES (must be followed exactly):

1. ZERO INFERENCE
- Every word in the output must be directly traceable to the user's text.
- If you cannot point to exact wording or a very close paraphrase, DO NOT include it.

2. LAST KNOWN STATE
- Only restate what the user has said.
- Do NOT expand, interpret, or add missing context.
- If the user provided minimal information, explicitly say that.

3. BLOCKERS (VERY STRICT)
- Only include this field if the user explicitly mentioned a problem.
- Valid signals include phrases like: "blocked", "stuck", "issue", "problem", "can't", "not working".
- Missing information, incomplete plans, or logical gaps DO NOT count as blockers.
- If no explicit blocker is stated, OMIT the entire "blockers" field.

4. NEXT ACTIONS (VERY STRICT)
- Only include this field if the user explicitly stated intent.
- Valid signals include phrases like: "I need to", "I will", "next I", "plan to".
- Goals or ideas DO NOT count as actions.
- Do NOT convert intentions into steps.
- If no explicit actions are stated, OMIT the entire "nextActions" field.

5. CONFIDENCE
- "high" = recent and clear input
- "medium" = slightly stale or somewhat vague
- "low" = very little or outdated information
- The label must match the actual recency and amount of input.

6. MINIMALISM
- When in doubt, output LESS.
- Short and incomplete is correct.
- Adding inferred detail is incorrect.

---

VALID ZERO-INFERENCE EXAMPLE:

User input:
"I want to build a superhero action figure with laser eyes"

Correct output:
{
  "lastKnownState": "The user wants to build a superhero action figure with laser eyes. No further details have been provided.",
  "confidenceLevel": "high",
  "confidenceLabel": "Based on your update today"
}

---

FINAL VERIFICATION STEP (mandatory):
- Check every field before returning.
- If any part is not directly supported by the user's words, remove it.
- Ensure blockers and nextActions are completely omitted if not explicitly present.

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