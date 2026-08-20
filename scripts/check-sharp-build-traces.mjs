import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const nextDir = path.join(rootDir, ".next");
const platformPackage = `@img/sharp-${process.platform}-${process.arch}`;
const libvipsPackage = `@img/sharp-libvips-${process.platform}-${process.arch}`;
const routeTraces = [
  "server/app/api/og/content/[id]/story/route.js.nft.json",
  "server/app/api/admin/story-images/process/route.js.nft.json",
  "server/app/api/admin/content/route.js.nft.json",
  "server/app/api/admin/content/[id]/route.js.nft.json",
  "server/app/api/admin/content/bulk/route.js.nft.json",
];

const failures = [];

for (const relativeTracePath of routeTraces) {
  const tracePath = path.join(nextDir, relativeTracePath);
  if (!fs.existsSync(tracePath)) {
    failures.push(`${relativeTracePath}: trace file is missing`);
    continue;
  }

  const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
  const files = Array.isArray(trace.files) ? trace.files : [];
  const requiredFragments = [
    "node_modules/sharp/package.json",
    `node_modules/${platformPackage}/`,
    `node_modules/${libvipsPackage}/`,
  ];

  for (const fragment of requiredFragments) {
    if (!files.some((file) => file.includes(fragment))) {
      failures.push(`${relativeTracePath}: missing ${fragment}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Sharp production trace check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Sharp production trace check passed for ${routeTraces.length} routes (${platformPackage}, ${libvipsPackage}).`,
);
