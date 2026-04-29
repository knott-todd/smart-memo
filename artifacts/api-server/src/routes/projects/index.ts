import { Router, type IRouter } from "express";
import { eq, desc, count, and, ne, gte } from "drizzle-orm";
import { z } from "zod";
import { db, projectsTable, updatesTable, briefingsTable } from "@workspace/db";
import {
  CreateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  UpdateProjectBody,
  DeleteProjectParams,
  ListProjectUpdatesParams,
  CreateUpdateBody,
  CreateUpdateParams,
  GenerateBriefingParams,
  ListProjectBriefingsParams,
} from "@workspace/api-zod";
import { generateBriefing } from "../../lib/briefing-engine";
import { classifyInput } from "../../lib/classifier";
import { generateSubcategories } from "../../lib/subcategory-engine";
import { extractTodos } from "../../lib/todo-extractor";

const router: IRouter = Router();

// ─── Projects ─────────────────────────────────────────────────────────────────

router.get("/projects", async (_req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable)
    .where(ne(projectsTable.title, "__notes__"))
    .orderBy(desc(projectsTable.updatedAt));
  res.json(projects);
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [project] = await db.insert(projectsTable).values({
    title: parsed.data.title,
    description: parsed.data.description,
    projectType: parsed.data.projectType ?? "other",
  }).returning();
  res.status(201).json(project);
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, params.data.id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  const recentUpdates = await db.select().from(updatesTable)
    .where(eq(updatesTable.projectId, params.data.id))
    .orderBy(desc(updatesTable.createdAt)).limit(10);
  const [latestBriefing] = await db.select().from(briefingsTable)
    .where(eq(briefingsTable.projectId, params.data.id))
    .orderBy(desc(briefingsTable.createdAt)).limit(1);
  res.json({ ...project, recentUpdates, latestBriefing: latestBriefing ?? null });
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [project] = await db.update(projectsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(projectsTable.id, params.data.id)).returning();
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  res.json(project);
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [project] = await db.delete(projectsTable).where(eq(projectsTable.id, params.data.id)).returning();
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

router.get("/projects/:id/updates", async (req, res): Promise<void> => {
  const params = ListProjectUpdatesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const updates = await db.select().from(updatesTable)
    .where(eq(updatesTable.projectId, params.data.id))
    .orderBy(desc(updatesTable.createdAt));
  res.json(updates);
});

router.post("/projects/:id/updates", async (req, res): Promise<void> => {
  const params = CreateUpdateParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateUpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [update] = await db.insert(updatesTable).values({
    projectId: params.data.id,
    content: parsed.data.content,
    sourceType: parsed.data.sourceType ?? "text",
    tags: [],
  }).returning();
  await db.update(projectsTable)
    .set({ lastActivityAt: new Date(), status: "active", updatedAt: new Date() })
    .where(eq(projectsTable.id, params.data.id));
  res.status(201).json(update);
});

// ─── Clarification ────────────────────────────────────────────────────────────

router.post("/updates/:id/clarify", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = z.object({
    action: z.enum(["answer", "dismiss"]),
    answer: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(updatesTable).set({
    clarificationStatus: parsed.data.action === "dismiss" ? "dismissed" : "answered",
    clarificationAnswer: parsed.data.answer ?? null,
  }).where(eq(updatesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ─── Briefings ────────────────────────────────────────────────────────────────

router.post("/projects/:id/briefing", async (req, res): Promise<void> => {
  const params = GenerateBriefingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, params.data.id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  const updates = await db.select().from(updatesTable)
    .where(eq(updatesTable.projectId, params.data.id))
    .orderBy(desc(updatesTable.createdAt)).limit(20);
  const [lastBriefing] = await db.select().from(briefingsTable)
    .where(eq(briefingsTable.projectId, params.data.id))
    .orderBy(desc(briefingsTable.createdAt)).limit(1);
  const daysSinceActivity = project.lastActivityAt
    ? Math.floor((Date.now() - new Date(project.lastActivityAt).getTime()) / 86400000)
    : undefined;
  const out = await generateBriefing(
    project.title,
    updates.map((u) => ({ content: u.content, sourceType: u.sourceType, createdAt: u.createdAt })),
    lastBriefing ? { lastKnownState: lastBriefing.lastKnownState, confidenceLevel: lastBriefing.confidenceLevel, rawOutput: lastBriefing.rawOutput, createdAt: lastBriefing.createdAt } : null,
    daysSinceActivity
  );
  const [briefing] = await db.insert(briefingsTable).values({
    projectId: params.data.id,
    lastKnownState: out.lastKnownState,
    confidenceLevel: out.confidenceLevel,
    confidenceLabel: out.confidenceLabel,
    blockers: out.blockers,
    nextActions: out.nextActions,
    rawOutput: out.rawOutput,
    stateSnapshot: JSON.stringify({ updatesCount: updates.length }),
  }).returning();
  await db.update(projectsTable)
    .set({ confidenceLevel: out.confidenceLevel, updatedAt: new Date() })
    .where(eq(projectsTable.id, params.data.id));
  res.json(briefing);
});

router.get("/projects/:id/briefings", async (req, res): Promise<void> => {
  const params = ListProjectBriefingsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const briefings = await db.select().from(briefingsTable)
    .where(eq(briefingsTable.projectId, params.data.id))
    .orderBy(desc(briefingsTable.createdAt));
  res.json(briefings);
});

// ─── Global log ───────────────────────────────────────────────────────────────

router.get("/updates", async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: updatesTable.id,
    content: updatesTable.content,
    sourceType: updatesTable.sourceType,
    tags: updatesTable.tags,
    clarificationStatus: updatesTable.clarificationStatus,
    clarificationQuestion: updatesTable.clarificationQuestion,
    clarificationAnswer: updatesTable.clarificationAnswer,
    createdAt: updatesTable.createdAt,
    projectId: projectsTable.id,
    projectTitle: projectsTable.title,
    threadType: projectsTable.threadType,
  })
    .from(updatesTable)
    .innerJoin(projectsTable, eq(updatesTable.projectId, projectsTable.id))
    .orderBy(updatesTable.createdAt);
  res.json(rows.filter((r) => r.projectTitle !== "__notes__"));
});

// ─── Brain dump ───────────────────────────────────────────────────────────────

router.post("/brain-dump", async (req, res): Promise<void> => {
  const parsed = z.object({ content: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Content required" }); return; }

  const { content } = parsed.data;

  const allThreads = await db.select().from(projectsTable)
    .where(ne(projectsTable.title, "__notes__"))
    .orderBy(desc(projectsTable.updatedAt));

  const recentRows = await db.select({
    content: updatesTable.content,
    projectTitle: projectsTable.title,
    projectId: projectsTable.id,
    createdAt: updatesTable.createdAt,
  })
    .from(updatesTable)
    .innerJoin(projectsTable, eq(updatesTable.projectId, projectsTable.id))
    .orderBy(desc(updatesTable.createdAt))
    .limit(8);

  const recentHistory = recentRows
    .filter((u) => u.projectTitle !== "__notes__")
    .map((u) => ({ content: u.content, projectTitle: u.projectTitle, projectId: u.projectId, createdAt: u.createdAt }));

  const classification = await classifyInput(content, allThreads, recentHistory);

  let thread: typeof allThreads[0] | undefined;
  let isNew = false;

  if (classification.projectId) {
    thread = allThreads.find((t) => t.id === classification.projectId);
  }

  if (!thread) {
    isNew = true;
    const [created] = await db.insert(projectsTable).values({
      title: classification.newProjectTitle ?? "untitled thread",
      description: classification.newProjectDescription ?? "",
      threadType: classification.threadType,
      status: "early",
      projectType: "other",
    }).returning();
    thread = created;
  } else {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (classification.updatedTitle) updates.title = classification.updatedTitle;
    if (classification.updatedDescription) updates.description = classification.updatedDescription;
    if (thread.threadType === "idea" && classification.threadType !== "idea") {
      updates.threadType = classification.threadType;
    }
    if (Object.keys(updates).length > 1) {
      const [upd] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, thread.id)).returning();
      if (upd) thread = upd;
    }
  }

  const [update] = await db.insert(updatesTable).values({
    projectId: thread.id,
    content,
    sourceType: "text",
    tags: [],
    clarificationStatus: classification.outcome === "ambiguous" ? "pending" : null,
    clarificationQuestion: classification.clarificationQuestion,
  }).returning();

  await db.update(projectsTable)
    .set({ lastActivityAt: new Date(), status: isNew ? "early" : "active", updatedAt: new Date() })
    .where(eq(projectsTable.id, thread.id));

  // Background subcategory job
  if (isNew) {
    const sameType = allThreads.filter((t) => t.threadType === thread!.threadType);
    if (sameType.length + 1 >= 5) {
      setImmediate(async () => {
        try {
          const groups = await generateSubcategories([...sameType, thread!].map((t) => ({
            id: t.id, title: t.title, description: t.description ?? null,
          })));
          for (const g of groups) {
            for (const tid of g.threadIds) {
              await db.update(projectsTable).set({ subcategory: g.subcategory }).where(eq(projectsTable.id, tid));
            }
          }
        } catch { /* non-critical */ }
      });
    }
  }

  res.status(201).json({
    update,
    project: thread,
    isNew,
    isAmbiguous: classification.outcome === "ambiguous",
    clarificationQuestion: classification.clarificationQuestion,
  });
});

// ─── Now view ─────────────────────────────────────────────────────────────────

router.get("/now", async (_req, res): Promise<void> => {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db.select({
    id: updatesTable.id,
    content: updatesTable.content,
    createdAt: updatesTable.createdAt,
    projectId: projectsTable.id,
    projectTitle: projectsTable.title,
    threadType: projectsTable.threadType,
  })
    .from(updatesTable)
    .innerJoin(projectsTable, eq(updatesTable.projectId, projectsTable.id))
    .where(and(
      ne(projectsTable.title, "__notes__"),
      ne(projectsTable.status, "dark"),
      gte(updatesTable.createdAt, cutoff)
    ))
    .orderBy(desc(updatesTable.createdAt))
    .limit(60);

  if (rows.length === 0) {
    res.json({ urgent: [], active: [], deferred: [] });
    return;
  }

  const todos = await extractTodos(rows);
  res.json({
    urgent: todos.filter((t) => t.priority === "urgent"),
    active: todos.filter((t) => t.priority === "active"),
    deferred: todos.filter((t) => t.priority === "deferred"),
  });
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get("/dashboard", async (_req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable);
  const visible = projects.filter((p) => p.title !== "__notes__");
  const [{ totalUpdates }] = await db.select({ totalUpdates: count() }).from(updatesTable);
  const [{ totalBriefings }] = await db.select({ totalBriefings: count() }).from(briefingsTable);
  const recentActivity = await db.select().from(updatesTable).orderBy(desc(updatesTable.createdAt)).limit(5);
  res.json({
    totalProjects: visible.length,
    activeProjects: visible.filter((p) => p.status === "active").length,
    coastingProjects: visible.filter((p) => p.status === "stalled").length,
    darkProjects: visible.filter((p) => p.status === "dark").length,
    totalUpdates: Number(totalUpdates),
    totalBriefings: Number(totalBriefings),
    recentActivity,
  });
});

export default router;
