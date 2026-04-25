import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const updatesTable = pgTable("updates", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  sourceType: text("source_type").notNull().default("text"), // text | voice | worksheet
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUpdateSchema = createInsertSchema(updatesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUpdate = z.infer<typeof insertUpdateSchema>;
export type Update = typeof updatesTable.$inferSelect;
