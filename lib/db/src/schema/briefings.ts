import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const briefingsTable = pgTable("briefings", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  lastKnownState: text("last_known_state").notNull(),
  confidenceLevel: text("confidence_level").notNull().default("medium"), // high | medium | low
  confidenceLabel: text("confidence_label").notNull().default(""),
  blockers: text("blockers").array().notNull().default([]),
  nextActions: text("next_actions").array().notNull().default([]),
  rawOutput: text("raw_output").notNull(),
  stateSnapshot: text("state_snapshot"), // JSON snapshot of project state at time of briefing
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBriefingSchema = createInsertSchema(briefingsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBriefing = z.infer<typeof insertBriefingSchema>;
export type Briefing = typeof briefingsTable.$inferSelect;