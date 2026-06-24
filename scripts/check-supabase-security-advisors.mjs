#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const allowlistPath = join(root, "scripts", "supabase-security-advisor-allowlist.json");

function readAllowlist() {
  return JSON.parse(readFileSync(allowlistPath, "utf8"));
}

function getLintMetadataValue(lint, key) {
  const value = lint.metadata?.[key];
  return typeof value === "string" ? value : String(value ?? "");
}

function isAllowed(lint, allowlist) {
  return allowlist.some((entry) => {
    if (entry.name !== lint.name) {
      return false;
    }

    return Object.entries(entry.metadata ?? {}).every(
      ([key, value]) => getLintMetadataValue(lint, key) === value,
    );
  });
}

function normalizeAdvisorPayload(payload) {
  if (Array.isArray(payload?.lints)) {
    return payload.lints;
  }

  if (Array.isArray(payload?.result?.lints)) {
    return payload.result.lints;
  }

  return [];
}

function formatLint(lint) {
  const metadata = lint.metadata ?? {};
  const functionName = metadata.name
    ? `${metadata.schema ?? "unknown"}.${metadata.name}(${metadata.arguments ?? ""})`
    : "";
  const target = functionName ? ` ${functionName}` : "";
  return `${lint.level ?? "UNKNOWN"} ${lint.name ?? "unknown"}:${target} ${lint.detail ?? lint.title ?? ""}`.trim();
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF;

if (!token || !projectRef) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF");
  process.exit(2);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);
const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/advisors/security`;

try {
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: controller.signal,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`Supabase security advisor request failed: ${response.status} ${response.statusText}`);
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  const allowlist = readAllowlist();
  const lints = normalizeAdvisorPayload(payload);
  const accepted = [];
  const blocking = [];

  for (const lint of lints) {
    const level = String(lint.level ?? "").toUpperCase();

    if (isAllowed(lint, allowlist)) {
      accepted.push(lint);
      continue;
    }

    if (level === "ERROR" || level === "WARN") {
      blocking.push(lint);
    }
  }

  console.log(`Supabase security advisors returned ${lints.length} finding(s).`);

  if (accepted.length > 0) {
    console.log("");
    console.log("Accepted advisor findings:");
    for (const lint of accepted) {
      console.log(`- ${formatLint(lint)}`);
    }
  }

  if (blocking.length > 0) {
    console.log("");
    console.log("Blocking advisor findings:");
    for (const lint of blocking) {
      console.log(`- ${formatLint(lint)}`);
    }
    process.exit(1);
  }

  console.log("Status: ok");
} finally {
  clearTimeout(timeout);
}
