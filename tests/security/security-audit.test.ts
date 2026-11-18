import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assessAudit } from "../../scripts/security-audit.mjs";

const policy = JSON.parse(readFileSync(resolve("scripts/security-audit-exceptions.json"), "utf8"));
const now = new Date("2026-11-19T00:00:00Z");

function auditReport() {
    return {
        auditReportVersion: 2,
        vulnerabilities: {
            picomatch: {
                severity: "high",
                nodes: [...policy.nodes],
                via: [{ name: "picomatch", severity: "high", url: policy.advisory }],
            },
            "@rollup/plugin-commonjs": {
                severity: "high",
                nodes: ["node_modules/@rollup/plugin-commonjs"],
                via: ["picomatch"],
            },
        },
    };
}

describe("production security audit policy", () => {
    it("accepts only the reviewed advisory and its inherited dependency findings", () => {
        expect(assessAudit(auditReport(), policy.reviewedVersions, now)).toEqual({
            accepted: [policy.advisory],
            blocking: [],
        });
    });

    it("blocks the advisory when the exception expires", () => {
        expect(assessAudit(auditReport(), policy.reviewedVersions, new Date(policy.expiresAt)).blocking)
            .toEqual([`picomatch: ${policy.advisory}`]);
    });

    it("blocks the advisory outside the reviewed dependency paths", () => {
        const report = auditReport();
        report.vulnerabilities.picomatch.nodes.push("node_modules/picomatch");
        expect(assessAudit(report, policy.reviewedVersions, now).blocking).toHaveLength(1);
    });

    it("blocks the advisory after a reviewed dependency version changes", () => {
        const versions = { ...policy.reviewedVersions, "node_modules/@sentry/nextjs": "11.0.0" };
        expect(assessAudit(auditReport(), versions, now).blocking).toHaveLength(1);
    });

    it.each(["high", "critical"])("blocks another %s advisory in the same package", (severity) => {
        const report = auditReport();
        report.vulnerabilities.picomatch.via.push({
            name: "picomatch", severity, url: "https://github.com/advisories/GHSA-other",
        });
        expect(assessAudit(report, policy.reviewedVersions, now).blocking)
            .toEqual(["picomatch: https://github.com/advisories/GHSA-other"]);
    });

    it("blocks an escalated critical severity for the excepted advisory", () => {
        const report = auditReport();
        report.vulnerabilities.picomatch.via[0].severity = "critical";
        expect(assessAudit(report, policy.reviewedVersions, now).accepted).toEqual([]);
        expect(assessAudit(report, policy.reviewedVersions, now).blocking).toHaveLength(1);
    });

    it("does not apply this exception to a different package", () => {
        const report = auditReport();
        report.vulnerabilities.picomatch.via[0].name = "other-package";
        expect(assessAudit(report, policy.reviewedVersions, now).blocking).toHaveLength(1);
    });

    it("retains a critical duplicate even when a high duplicate appears later", () => {
        const report = auditReport();
        report.vulnerabilities.picomatch.via.unshift({
            name: "picomatch", severity: "critical", url: policy.advisory,
        });
        expect(assessAudit(report, policy.reviewedVersions, now).blocking).toHaveLength(1);
    });

    it("rejects a critical package finding explained only by a high source", () => {
        const report = auditReport();
        report.vulnerabilities.picomatch.severity = "critical";
        expect(() => assessAudit(report, policy.reviewedVersions, now)).toThrow("Unexplained blocking severity");
    });

    it("allows a clean audit even after this exception expires", () => {
        expect(assessAudit({ auditReportVersion: 2, vulnerabilities: {} }, {}, new Date(policy.expiresAt)))
            .toEqual({ accepted: [], blocking: [] });
    });

    it.each([
        {},
        { error: { code: "ENOAUDIT" } },
        { auditReportVersion: 2, vulnerabilities: [] },
        { auditReportVersion: 99, vulnerabilities: {} },
    ])("rejects missing, failed, or unsupported scanner output", (report) => {
        expect(() => assessAudit(report, policy.reviewedVersions, now)).toThrow();
    });

    it("rejects an unresolved transitive advisory", () => {
        const report = auditReport();
        report.vulnerabilities["@rollup/plugin-commonjs"].via = ["missing-package"];
        expect(() => assessAudit(report, policy.reviewedVersions, now)).toThrow("Incomplete audit finding");
    });

    it("rejects high severity without an explained high-severity source", () => {
        const report = auditReport();
        report.vulnerabilities.picomatch.via[0].severity = "moderate";
        expect(() => assessAudit(report, policy.reviewedVersions, now)).toThrow("Unexplained blocking severity");
    });

    it("rejects cyclic dependency findings", () => {
        const report = auditReport();
        report.vulnerabilities["@rollup/plugin-commonjs"].via = ["@rollup/plugin-commonjs"];
        expect(() => assessAudit(report, policy.reviewedVersions, now)).toThrow("Cyclic audit dependency");
    });

    it("does not accept the exception when the clock is invalid", () => {
        expect(assessAudit(auditReport(), policy.reviewedVersions, new Date("invalid")).blocking).toHaveLength(1);
    });

    it.each([
        [2, '{"error":{"code":"ENOAUDIT"}}'],
        [1, "scanner returned invalid JSON"],
    ])("keeps the command-line gate closed on scanner failure %s", (status, output) => {
        const directory = mkdtempSync(join(tmpdir(), "netflux-audit-test-"));
        try {
            const executable = join(directory, "npm");
            writeFileSync(executable, `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(output)}); process.exit(${status});\n`);
            chmodSync(executable, 0o700);
            const result = spawnSync(process.execPath, ["scripts/security-audit.mjs"], {
                encoding: "utf8",
                env: { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}` },
            });
            expect(result.status).toBe(1);
            expect(result.stderr).toContain("Security audit failed");
        } finally {
            rmSync(directory, { recursive: true });
        }
    });
});
