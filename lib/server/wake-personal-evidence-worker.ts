import "server-only";
import { afterResponse } from "./after-response";
import { processPersonalEvidenceIndex } from "./personal-evidence-indexer";

// The database trigger has already durably queued the new revision. Wake the
// existing leased worker after commit; scheduled sweeps recover missed wakeups.
export function wakePersonalEvidenceWorker() {
    afterResponse(async () => {
        try {
            const result = await processPersonalEvidenceIndex({ seed: false });
            if (result.failed || result.deferred) console.warn("Personal evidence indexing deferred", result);
        } catch {
            console.error("Personal evidence worker wakeup failed");
        }
    });
}
