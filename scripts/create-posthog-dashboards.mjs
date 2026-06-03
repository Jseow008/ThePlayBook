#!/usr/bin/env node

import { netfluxPostHogDashboards } from "../config/posthog/netflux-dashboard-spec.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const updateExisting = !args.has("--no-update");

const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const environmentId = process.env.POSTHOG_ENVIRONMENT_ID ?? process.env.POSTHOG_PROJECT_ID;
const host = (process.env.POSTHOG_HOST ?? "https://us.posthog.com").replace(/\/$/, "");

function usage() {
  return [
    "Usage:",
    "  POSTHOG_PERSONAL_API_KEY=phx_... POSTHOG_ENVIRONMENT_ID=450488 npm run posthog:dashboards",
    "",
    "Options:",
    "  --dry-run     Print planned dashboard and insight operations without calling PostHog.",
    "  --no-update   Reuse existing insights without PATCHing their query/description.",
    "",
    "Required personal API key scopes:",
    "  dashboard:read, dashboard:write, insight:read, insight:write",
  ].join("\n");
}

function assertConfig() {
  if (dryRun) {
    return;
  }

  const missing = [];
  if (!apiKey) missing.push("POSTHOG_PERSONAL_API_KEY");
  if (!environmentId) missing.push("POSTHOG_ENVIRONMENT_ID");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}\n\n${usage()}`);
  }
}

async function posthogApi(path, options = {}) {
  const url = path.startsWith("http")
    ? path
    : `${host}/api/environments/${environmentId}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.detail || body?.error || body?.message || text || response.statusText;
    throw new Error(`${options.method ?? "GET"} ${url} failed (${response.status}): ${message}`);
  }

  return body;
}

async function findByExactName(resourcePath, name) {
  let nextPath = `${resourcePath}?search=${encodeURIComponent(name)}&limit=100`;

  while (nextPath) {
    const result = await posthogApi(nextPath);
    const rows = Array.isArray(result?.results) ? result.results : [];
    const exactMatch = rows.find((row) => row?.name === name && row?.deleted !== true);

    if (exactMatch) {
      return exactMatch;
    }

    nextPath = typeof result?.next === "string" && result.next.length > 0
      ? result.next
      : "";
  }

  return null;
}

async function ensureDashboard(dashboard) {
  if (dryRun) {
    console.log(`[dry-run] dashboard: ${dashboard.name}`);
    return { id: `dry-run:${dashboard.name}`, name: dashboard.name };
  }

  const existing = await findByExactName("/dashboards/", dashboard.name);
  if (existing) {
    console.log(`dashboard exists: ${dashboard.name} (${existing.id})`);
    return existing;
  }

  const created = await posthogApi("/dashboards/", {
    method: "POST",
    body: JSON.stringify({
      name: dashboard.name,
      description: dashboard.description,
      pinned: false,
      tags: dashboard.tags,
    }),
  });

  console.log(`dashboard created: ${dashboard.name} (${created.id})`);
  return created;
}

async function ensureInsight(dashboard, dashboardId, insight, order) {
  const payload = {
    name: insight.name,
    description: insight.description,
    query: insight.query,
    dashboards: [dashboardId],
    order,
    tags: dashboard.tags,
    saved: true,
  };

  if (dryRun) {
    console.log(`  [dry-run] insight: ${insight.name}`);
    return;
  }

  const existing = await findByExactName("/insights/", insight.name);
  if (existing) {
    if (!updateExisting) {
      console.log(`  insight exists: ${insight.name} (${existing.id})`);
      return;
    }

    const updated = await posthogApi(`/insights/${existing.id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    console.log(`  insight updated: ${insight.name} (${updated.id})`);
    return;
  }

  const created = await posthogApi("/insights/", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  console.log(`  insight created: ${insight.name} (${created.id})`);
}

async function main() {
  assertConfig();

  console.log(`PostHog host: ${host}`);
  console.log(`Environment: ${environmentId ?? "dry-run"}`);
  console.log(`Mode: ${dryRun ? "dry-run" : updateExisting ? "create/update" : "create/reuse"}`);

  for (const dashboard of netfluxPostHogDashboards) {
    const createdDashboard = await ensureDashboard(dashboard);
    for (const [index, insight] of dashboard.insights.entries()) {
      await ensureInsight(dashboard, createdDashboard.id, insight, index);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
