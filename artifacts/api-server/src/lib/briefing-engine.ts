import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export interface BriefingOutput {
  lastKnownState: string;
  confidenceLevel: "high" | "medium" | "low";
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

  const prompt = `You are Continuity — a patient, intelligent collaborator helping someone re-enter a project. Analyze the project updates and generate a precise, honest briefing. Be concise and direct. Never invent information not present in the updates.

Project: "${projectTitle}"${stalenessNote}${lastBriefingSection}

Recent updates:
${updatesText || "(No updates yet — this is a new project)"}

Generate a briefing in this exact JSON format:
{
  "lastKnownState": "1-2 sentence description of where the project stands right now, based only on available information",
  "confidenceLevel": "high|medium|low (high = active updates in last 2 days, medium = 3-7 days or sparse updates, low = 8+ days or minimal information)",
  "blockers": ["array of specific blockers or obstacles — be precise, max 3", "..."],
  "nextActions": ["1-3 concrete next actions the person should take — be specific", "..."]
}

Confidence guidelines:
- high: recent activity, clear picture of project state
- medium: some activity but gaps, or inferred state
- low: stale data, no recent activity, or insufficient information

Return ONLY the JSON object, no additional text.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
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
      blockers: [],
      nextActions: ["Add a project update to get a better briefing"],
    };
  }

  return {
    lastKnownState: parsed.lastKnownState || "",
    confidenceLevel: (["high", "medium", "low"].includes(parsed.confidenceLevel)
      ? parsed.confidenceLevel
      : "low") as BriefingOutput["confidenceLevel"],
    blockers: Array.isArray(parsed.blockers) ? parsed.blockers : [],
    nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions : [],
    rawOutput: raw,
  };
}
