import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export interface BriefingOutput {
  lastKnownState: string;
  confidenceLevel: "high" | "medium" | "low";
  confidenceLabel: string;
  blockers: string[];
  nextActions: string[];
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
    ? `\n\nLast briefing (${new Date(lastBriefing.createdAt).toLocaleDateString()}):\n${lastBriefing.rawOutput}`
    : "";

  const prompt = `You are Continuity — a tool that helps people re-enter projects. Your job is to summarize what the user has actually told you, nothing more.

Project: "${projectTitle}"${stalenessNote}${lastBriefingSection}

User inputs (chronological):
${updatesText || "(No inputs yet)"}

Generate a briefing in this exact JSON format:
{
  "lastKnownState": "1-2 sentences describing where the project stands based ONLY on what the user has written. If there is very little information, say so plainly.",
  "confidenceLevel": "high|medium|low",
  "confidenceLabel": "e.g. 'Based on your update today' or 'Based on info from 3 days ago' or 'Very little info captured yet'",
  "blockers": ["Only include if the user explicitly mentioned something is blocked, stuck, or a problem. If they did not mention a blocker, omit this field entirely — do NOT infer or suggest blockers."],
  "nextActions": ["Only include actions the user explicitly stated they need or want to do. Do NOT suggest, infer, or generate actions that the user did not mention. If no actions were stated, omit this field entirely."]
}

Critical rules:
- NEVER invent content. Every word in the output must be traceable to something the user actually wrote.
- NEVER suggest blockers or next actions that the user did not explicitly state.
- If the user has only written one or two things, the briefing will be short. That is correct behaviour.
- Omit blockers and nextActions fields entirely if the user did not provide that information.
- The confidenceLabel must reflect the actual recency and quantity of information provided.
- Weight more recent inputs over older ones when there are contradictions.

Return ONLY the JSON object, no additional text.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
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
    blockers: Array.isArray(parsed.blockers) ? parsed.blockers : [],
    nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions : [],
    rawOutput: raw,
  };
}