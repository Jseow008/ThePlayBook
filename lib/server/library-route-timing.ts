import "server-only";

type Phase = "auth" | "admission" | "library";

/** Numeric, request-local diagnostics only: no identifiers, SQL or user content. */
export function createLibraryRouteTiming() {
    const started = performance.now();
    const phases: string[] = [];
    return {
        async measure<T>(phase: Phase, operation: () => PromiseLike<T>): Promise<T> {
            const before = performance.now();
            try {
                return await operation();
            } finally {
                phases.push(`${phase};dur=${Math.max(0, performance.now() - before).toFixed(1)}`);
            }
        },
        // Handler time excludes platform startup, transport and response serialization.
        header() {
            return [...phases, `handler;dur=${Math.max(0, performance.now() - started).toFixed(1)}`].join(", ");
        },
    };
}
