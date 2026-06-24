import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("generated artifact hygiene", () => {
    const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    const gitleaksConfig = readFileSync(join(process.cwd(), ".gitleaks.toml"), "utf8");

    it("ignores local npm caches and test output directories", () => {
        expect(gitignore).toContain("/.npm-cache-temp/");
        expect(gitignore).toContain("/test-results/");
        expect(gitignore).toContain("playwright-report/");
    });

    it("excludes generated artifact paths from secret scanning", () => {
        expect(gitleaksConfig).toContain(".npm-cache-temp");
        expect(gitleaksConfig).toContain("test-results");
        expect(gitleaksConfig).toContain("playwright-report");
        expect(gitleaksConfig).toContain(".next");
        expect(gitleaksConfig).toContain("node_modules");
    });

    it("does not track generated npm cache or test result artifacts", () => {
        if (!existsSync(join(process.cwd(), ".git"))) {
            return;
        }

        const trackedArtifacts = execFileSync(
            "git",
            ["ls-files", ".npm-cache-temp", "test-results"],
            { cwd: process.cwd(), encoding: "utf8" },
        );

        expect(trackedArtifacts).toBe("");
    });
});
