import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
const baseline = [
  {
    "path": "app/api/chat/author/route.ts",
    "name": "systemPrompt",
    "hash": "ab93ddb07aa732be144355c43dfc0470c85c764af03a486d9ca57392b9835dcd"
  },
  {
    "path": "lib/server/personal-evidence-selector.ts",
    "name": "SYSTEM",
    "hash": "4f78540c6ca5ff98bc6876e3592dd380a2af7dc15596eb571f47afc76a8f6542"
  },
  {
    "path": "lib/server/personal-evidence-selector.ts",
    "name": "ASSESSMENT_CONTRACT",
    "hash": "257e80e2b90e7512807e20ab58136d1b29e11d9bd188b9860d76513018ba4a3a"
  }
];
it.each(baseline)('keeps the parent PR prompt text unchanged: $name', ({path,name,hash}) => {
 const source=readFileSync(new URL('../../'+path, import.meta.url),'utf8');
 const marker='const '+name+' = '+String.fromCharCode(96);
 const start=source.indexOf(marker)+marker.length;const end=source.indexOf(String.fromCharCode(96),start);
 expect(createHash('sha256').update(source.slice(start,end)).digest('hex')).toBe(hash);
});
