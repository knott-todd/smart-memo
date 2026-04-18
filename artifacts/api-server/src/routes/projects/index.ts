import { Router, type IRouter } from "express";
import { eq, desc, count } from "drizzle-orm";
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
  SubmitWorksheetBody,
  SubmitWorksheetParams,
} from "@workspace/api-zod";
import { generateBriefing } from "../../lib/briefing-engine";
import { classifyInput } from "../../lib/classifier";

const router: IRouter = Router();

// GET /projects
router.get("/projects", async (_req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(projectsTable.updatedAt));
  // Hide the internal notes bucket from UI
  res.json(projects.filter((p) => p.title !== "__notes__"));
});

// POST /projects
router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .insert(projectsTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      projectType: parsed.data.projectType ?? "other",
    })
    .returning();

  res.status(201).json(project);
});

// GET /projects/:id
router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const recentUpdates = await db
    .select()
    .from(updatesTable)
    .where(eq(updatesTable.projectId, params.data.id))
    .orderBy(desc(updatesTable.createdAt))
    .limit(10);

  const [latestBriefing] = await db
    .select()
    .from(briefingsTable)
    .where(eq(briefingsTable.projectId, params.data.id))
    .orderBy(desc(briefingsTable.createdAt))
    .limit(1);

  res.json({ ...project, recentUpdates, latestBriefing: latestBriefing ?? null });
});

// PATCH /projects/:id
router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .update(projectsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json(project);
});

// DELETE /projects/:id
router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.sendStatus(204);
});

// GET /projects/:id/updates
router.get("/projects/:id/updates", async (req, res): Promise<void> => {
  const params = ListProjectUpdatesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const updates = await db
    .select()
    .from(updatesTable)
    .where(eq(updatesTable.projectId, params.data.id))
    .orderBy(desc(updatesTable.createdAt));

  res.json(updates);
});

// POST /projects/:id/updates
router.post("/projects/:id/updates", async (req, res): Promise<void> => {
  const params = CreateUpdateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateUpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [update] = await db
    .insert(updatesTable)
    .values({
      projectId: params.data.id,
      content: parsed.data.content,
      sourceType: parsed.data.sourceType ?? "text",
      tags: [],
    })
    .returning();

  // Update project lastActivityAt and status to active
  await db
    .update(projectsTable)
    .set({ lastActivityAt: new Date(), status: "active", updatedAt: new Date() })
    .where(eq(projectsTable.id, params.data.id));

  res.status(201).json(update);
});

// POST /projects/:id/briefing
router.post("/projects/:id/briefing", async (req, res): Promise<void> => {
  const params = GenerateBriefingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const updates = await db
    .select()
    .from(updatesTable)
    .where(eq(updatesTable.projectId, params.data.id))
    .orderBy(desc(updatesTable.createdAt))
    .limit(20);

  const [lastBriefing] = await db
    .select()
    .from(briefingsTable)
    .where(eq(briefingsTable.projectId, params.data.id))
    .orderBy(desc(briefingsTable.createdAt))
    .limit(1);

  const daysSinceActivity = project.lastActivityAt
    ? Math.floor((Date.now() - new Date(project.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
    : undefined;

  const briefingOutput = await generateBriefing(
    project.title,
    updates.map((u) => ({
      content: u.content,
      sourceType: u.sourceType,
      createdAt: u.createdAt,
    })),
    lastBriefing
      ? {
          lastKnownState: lastBriefing.lastKnownState,
          confidenceLevel: lastBriefing.confidenceLevel,
          rawOutput: lastBriefing.rawOutput,
          createdAt: lastBriefing.createdAt,
        }
      : null,
    daysSinceActivity
  );

  const stateSnapshot = JSON.stringify({
    updatesCount: updates.length,
    projectStatus: project.status,
    daysSinceActivity,
  });

  const [briefing] = await db
    .insert(briefingsTable)
    .values({
      projectId: params.data.id,
      lastKnownState: briefingOutput.lastKnownState,
      confidenceLevel: briefingOutput.confidenceLevel,
      confidenceLabel: briefingOutput.confidenceLabel,
      blockers: briefingOutput.blockers,
      nextActions: briefingOutput.nextActions,
      rawOutput: briefingOutput.rawOutput,
      stateSnapshot,
    })
    .returning();

  // Update project confidence level
  await db
    .update(projectsTable)
    .set({ confidenceLevel: briefingOutput.confidenceLevel, updatedAt: new Date() })
    .where(eq(projectsTable.id, params.data.id));

  res.json(briefing);
});

// GET /projects/:id/briefings
router.get("/projects/:id/briefings", async (req, res): Promise<void> => {
  const params = ListProjectBriefingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const briefings = await db
    .select()
    .from(briefingsTable)
    .where(eq(briefingsTable.projectId, params.data.id))
    .orderBy(desc(briefingsTable.createdAt));

  res.json(briefings);
});

// POST /projects/:id/worksheet
router.post("/projects/:id/worksheet", async (req, res): Promise<void> => {
  const params = SubmitWorksheetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SubmitWorksheetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { momentumRating, currentStatus, mainBlocker, nextStep, sameAsLast } = parsed.data;

  const content = sameAsLast
    ? `[Worksheet] Same as last update — still accurate.`
    : [
        `[Worksheet] Momentum: ${momentumRating}/5`,
        `Status: ${currentStatus}`,
        mainBlocker ? `Blocker: ${mainBlocker}` : null,
        `Next step: ${nextStep}`,
      ]
        .filter(Boolean)
        .join("\n");

  const [update] = await db
    .insert(updatesTable)
    .values({
      projectId: params.data.id,
      content,
      sourceType: "worksheet",
      tags: ["worksheet"],
    })
    .returning();

  // Update project status
  await db
    .update(projectsTable)
    .set({ lastActivityAt: new Date(), status: "active", updatedAt: new Date() })
    .where(eq(projectsTable.id, params.data.id));

  res.status(201).json(update);
});

// GET /updates — all updates across all projects, with project info
router.get("/updates", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: updatesTable.id,
      content: updatesTable.content,
      sourceType: updatesTable.sourceType,
      tags: updatesTable.tags,
      createdAt: updatesTable.createdAt,
      projectId: projectsTable.id,
      projectTitle: projectsTable.title,
    })
    .from(updatesTable)
    .innerJoin(projectsTable, eq(updatesTable.projectId, projectsTable.id))
    .orderBy(updatesTable.createdAt);

  // Mark rows from the internal __notes__ bucket as notes
  const normalised = rows.map((row) => ({
    ...row,
    isNote: row.projectTitle === "__notes__",
    projectId: row.projectTitle === "__notes__" ? null : row.projectId,
    projectTitle: row.projectTitle === "__notes__" ? null : row.projectTitle,
  }));

  res.json(normalised);
});

// POST /brain-dump — global input with AI project classification
router.post("/brain-dump", async (req, res): Promise<void> => {
  const parsed = z.object({ content: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Content required" });
    return;
  }

  const { content } = parsed.data;

  // Fetch all projects, explicitly excluding the internal notes bucket
  const allProjects = await db.select().from(projectsTable).orderBy(desc(projectsTable.updatedAt));
  const existingProjects = allProjects.filter((p) => p.title !== "__notes__");

  // Fetch last 5 updates across all projects for context
  const recentUpdates = await db
    .select({
      content: updatesTable.content,
      projectTitle: projectsTable.title,
    })
    .from(updatesTable)
    .innerJoin(projectsTable, eq(updatesTable.projectId, projectsTable.id))
    .where(eq(projectsTable.title, projectsTable.title)) // all projects
    .orderBy(desc(updatesTable.createdAt))
    .limit(5);

  const recentHistory = recentUpdates
    .filter((u) => u.projectTitle !== "__notes__")
    .map((u) => ({ content: u.content, projectTitle: u.projectTitle }));

  const classification = await classifyInput(content, existingProjects, recentHistory);

  // ── Note: save without attaching to any real project ──────────────────────
  if (classification.isNote) {
    let notesProject = allProjects.find((p) => p.title === "__notes__");
    if (!notesProject) {
      [notesProject] = await db
        .insert(projectsTable)
        .values({
          title: "__notes__",
          description: "Internal bucket for loose notes",
          projectType: "other",
        })
        .returning();
    }

    const [update] = await db
      .insert(updatesTable)
      .values({
        projectId: notesProject.id,
        content,
        sourceType: "text",
        tags: ["note"],
      })
      .returning();

    res.status(201).json({ update, project: null, isNew: false, isNote: true });
    return;
  }

  // ── Project match or creation ──────────────────────────────────────────────
  let project;
  let isNew = false;

  if (classification.projectId) {
    const found = existingProjects.find((p) => p.id === classification.projectId);
    if (found) project = found;
  }

  if (!project) {
    isNew = true;
    [project] = await db
      .insert(projectsTable)
      .values({
        title: classification.newProjectTitle ?? "Untitled Project",
        description: classification.newProjectDescription ?? "",
        projectType: "other",
      })
      .returning();
  } else if (classification.updatedTitle || classification.updatedDescription) {
    // Dynamic field update — user revealed new info about an existing project
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (classification.updatedTitle) updateData.title = classification.updatedTitle;
    if (classification.updatedDescription) updateData.description = classification.updatedDescription;
    const [updated] = await db
      .update(projectsTable)
      .set(updateData)
      .where(eq(projectsTable.id, project.id))
      .returning();
    if (updated) project = updated;
  }

  const [update] = await db
    .insert(updatesTable)
    .values({
      projectId: project.id,
      content,
      sourceType: "text",
      tags: [],
    })
    .returning();

  await db
    .update(projectsTable)
    .set({ lastActivityAt: new Date(), status: "active", updatedAt: new Date() })
    .where(eq(projectsTable.id, project.id));

  res.status(201).json({ update, project, isNew, isNote: false });
});

// GET /dashboard
router.get("/dashboard", async (_req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable);

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const coastingProjects = projects.filter((p) => p.status === "coasting").length;
  const darkProjects = projects.filter((p) => p.status === "dark").length;

  const [{ totalUpdates }] = await db
    .select({ totalUpdates: count() })
    .from(updatesTable);

  const [{ totalBriefings }] = await db
    .select({ totalBriefings: count() })
    .from(briefingsTable);

  const recentActivity = await db
    .select()
    .from(updatesTable)
    .orderBy(desc(updatesTable.createdAt))
    .limit(5);

  res.json({
    totalProjects: projects.length,
    activeProjects,
    coastingProjects,
    darkProjects,
    totalUpdates: Number(totalUpdates),
    totalBriefings: Number(totalBriefings),
    recentActivity,
  });
});

export default router;