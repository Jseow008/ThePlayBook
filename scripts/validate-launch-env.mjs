#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { config as loadEnvFile } from "dotenv";

const REQUIRED_ALL = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "AI_PROVIDER",
    "AI_MODEL",
    "GEMINI_API_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "ERROR_REPORTING_WEBHOOK_URL",
];

const REQUIRED_ONE_OF = [
    ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
];

const RECOMMENDED = [
    "NEXT_PUBLIC_APP_URL",
    "OPENAI_FALLBACK_MODEL",
];

const URL_VARS = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_APP_URL",
    "UPSTASH_REDIS_REST_URL",
    "ERROR_REPORTING_WEBHOOK_URL",
];

function usage() {
    console.log(`Usage: node scripts/validate-launch-env.mjs [--env-file <path>]

Checks production launch environment variables in the current process.
Use --env-file only when you want to validate an explicit file source.

Required:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_KEY
- NEXT_PUBLIC_SITE_URL
- AI_PROVIDER
- AI_MODEL
- GEMINI_API_KEY
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
- ERROR_REPORTING_WEBHOOK_URL
- at least one of ANTHROPIC_API_KEY or OPENAI_API_KEY

Recommended:
- NEXT_PUBLIC_APP_URL
- OPENAI_FALLBACK_MODEL

The script exits non-zero when required values are missing or when any provided URL is invalid.
`);
}

function valueOf(name) {
    const value = process.env[name];
    return typeof value === "string" ? value.trim() : "";
}

function isValidHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

function formatEnvList(names) {
    return names.join(", ");
}

function resolveEnvFile(argv) {
    const index = argv.indexOf("--env-file");
    if (index === -1) {
        return null;
    }

    const value = argv[index + 1];
    if (!value) {
        throw new Error("Missing value for --env-file");
    }

    return path.resolve(process.cwd(), value);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    process.exit(0);
}

try {
    const envFile = resolveEnvFile(process.argv.slice(2));
    if (envFile && fs.existsSync(envFile)) {
        loadEnvFile({ path: envFile, override: false });
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    usage();
    process.exit(1);
}

const errors = [];
const warnings = [];

for (const name of REQUIRED_ALL) {
    if (!valueOf(name)) {
        errors.push(`Missing required env var: ${name}`);
    }
}

for (const names of REQUIRED_ONE_OF) {
    if (!names.some((name) => valueOf(name))) {
        errors.push(`Missing required env var: one of ${formatEnvList(names)}`);
    }
}

for (const name of URL_VARS) {
    const value = valueOf(name);
    if (value && !isValidHttpUrl(value)) {
        errors.push(`Invalid URL in ${name}: ${value}`);
    }
}

for (const name of RECOMMENDED) {
    if (!valueOf(name)) {
        warnings.push(`Recommended env var is missing: ${name}`);
    }
}

console.log("Launch environment validation");

if (errors.length === 0) {
    console.log("Status: ok");
} else {
    console.log("Status: failed");
}

if (errors.length > 0) {
    console.log("");
    console.log("Errors:");
    for (const error of errors) {
        console.log(`- ${error}`);
    }
}

if (warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of warnings) {
        console.log(`- ${warning}`);
    }
}

if (errors.length > 0) {
    process.exit(1);
}
