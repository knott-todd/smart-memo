# Continuity

## Overview

Continuity is a re-entry briefing app. When you come back to a project after any gap, it gives you an intelligent briefing on where you left off, why it matters, and what to do next. The core idea: people don't fail at projects because they can't list tasks — they fail because they lose context, momentum, and intent between work sessions.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/continuity), deployed at `/`
- **API framework**: Express 5 (artifacts/api-server), deployed at `/api`
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: OpenAI GPT via Replit AI Integrations (briefing generation)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Architecture

### Three Operating Modes (project statuses)
- **Active** — user is regularly updating; briefing is generated from rich recent context
- **Coasting** — some activity but gaps; briefing inferred from available signals
- **Dark** — no signal for 5+ days; app surfaces last known state with staleness indicator

### Data Model
- `projects` — projects with status (active/coasting/dark), confidence level, project type
- `updates` — immutable append-only event log of all user inputs (text/voice/worksheet)
- `briefings` — point-in-time briefing snapshots with 4-field schema (lastKnownState, confidenceLevel, blockers, nextActions)

### Briefing Engine
A prompt sent to GPT-5.2 that receives all recent updates for a project and the last known briefing. Output is always the fixed 4-field schema. Every briefing is stored with a state snapshot for future training.

### API Endpoints
- `GET /api/projects` — list all projects
- `POST /api/projects` — create project
- `GET /api/projects/:id` — project detail with latest briefing and recent updates
- `PATCH /api/projects/:id` — update project
- `DELETE /api/projects/:id` — delete project
- `GET /api/projects/:id/updates` — list updates
- `POST /api/projects/:id/updates` — brain dump (text update)
- `POST /api/projects/:id/briefing` — generate new AI briefing
- `GET /api/projects/:id/briefings` — briefing history
- `POST /api/projects/:id/worksheet` — re-entry worksheet check-in
- `GET /api/dashboard` — dashboard stats

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Phase Roadmap

- **Phase 1 (current)**: Manual input only (text, worksheets). AI briefing generation.
- **Phase 2**: Git + calendar integrations. Personal cognitive model.
- **Phase 3**: Slack bot, VS Code sidebar. Paying users.
- **Phase 4**: Predictive nudges. Behavioral pattern library.
