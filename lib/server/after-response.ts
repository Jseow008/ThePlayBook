import "server-only";

import { after } from "next/server";

/**
 * Schedule non-critical work after a route has sent its response.
 *
 * Route handlers are invoked directly in unit tests, outside Next's request
 * scope. Run the task without awaiting it in that environment so those tests
 * retain the same response behavior.
 */
export function afterResponse(task: () => Promise<void>) {
    try {
        after(task);
    } catch (error) {
        if (process.env.NODE_ENV === "test") {
            void task();
            return;
        }

        throw error;
    }
}
