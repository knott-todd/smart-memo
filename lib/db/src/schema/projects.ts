import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// threadType — what kind of thing this thread is
// project | idea | admin | reminder | reference
export const THREAD_TYPES = ["project", "idea", "admin", "reminder", "reference"] as const;
export type ThreadType = (typeof THREAD_TYPES)[number];

// status — lifecycle state
// active | stalled | urgent | early | waiting | reference | needs_you | dark
export const THREAD_STATUSES = [
  "active",
  "stalled",
  "urgent",
  "early",
  "waiting",
  "reference",
  "needs_you",
  "dark", // archived
] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),

  // New: semantic type of thread
  threadType: text("thread_type").notNull().default("idea"), // ThreadType

  // Status (extended from original active | coasting | dark)
  status: text("status").notNull().default("early"), // ThreadStatus

  // AI-generated subcategory within a top-level category bucket
  subcategory: text("subcategory"),

  // Legacy fields kept for backwards compat
  confidenceLevel: text("confidence_level").notNull().default("high"),
  projectType: text("project_type").notNull().default("other"),

  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
