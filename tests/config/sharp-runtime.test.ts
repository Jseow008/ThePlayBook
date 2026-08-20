import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

describe("Sharp production runtime packaging", () => {
  it("keeps Sharp as a production dependency", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies?.sharp).toBe("0.35.3");
  });

  it("traces the Linux Sharp runtime into each story-image function", () => {
    const nextConfig = fs.readFileSync(path.join(rootDir, "next.config.ts"), "utf8");

    expect(nextConfig).toContain('"./node_modules/@img/sharp-linux-x64/**/*"');
    expect(nextConfig).toContain('"./node_modules/@img/sharp-libvips-linux-x64/**/*"');
    expect(nextConfig).toContain('"/api/og/content/[id]/story": sharpTraceIncludes');
    expect(nextConfig).toContain('"/api/admin/story-images/process": sharpTraceIncludes');
    expect(nextConfig).toContain('"/api/admin/content": contentProcessingTraceIncludes');
    expect(nextConfig).toContain('"/api/admin/content/[id]": contentProcessingTraceIncludes');
    expect(nextConfig).toContain('"/api/admin/content/bulk": contentProcessingTraceIncludes');
    expect(nextConfig).toContain('serverExternalPackages: ["sharp"]');
  });
});
