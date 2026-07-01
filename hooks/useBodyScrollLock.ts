import { useEffect, useRef } from "react";

type LockTarget = "body" | "documentElement";

interface LockState {
    tokens: Set<symbol>;
    originalOverflow: string | null;
}

const lockStates: Record<LockTarget, LockState> = {
    body: {
        tokens: new Set(),
        originalOverflow: null,
    },
    documentElement: {
        tokens: new Set(),
        originalOverflow: null,
    },
};

function getLockElement(target: LockTarget): HTMLElement | null {
    if (typeof document === "undefined") {
        return null;
    }

    return target === "body" ? document.body : document.documentElement;
}

function acquireLock(target: LockTarget, token: symbol) {
    const element = getLockElement(target);
    if (!element) {
        return;
    }

    const state = lockStates[target];
    if (state.tokens.has(token)) {
        return;
    }

    if (state.tokens.size === 0) {
        state.originalOverflow = element.style.overflow;
        element.style.overflow = "hidden";
    }

    state.tokens.add(token);
}

function releaseLock(target: LockTarget, token: symbol) {
    const element = getLockElement(target);
    if (!element) {
        return;
    }

    const state = lockStates[target];
    if (!state.tokens.delete(token)) {
        return;
    }

    if (state.tokens.size === 0) {
        element.style.overflow = state.originalOverflow ?? "";
        state.originalOverflow = null;
    }
}

function releaseAllLocks(token: symbol) {
    releaseLock("body", token);
    releaseLock("documentElement", token);
}

interface BodyScrollLockOptions {
    lockDocumentElement?: boolean;
}

export function useBodyScrollLock(
    enabled: boolean,
    options: BodyScrollLockOptions = {}
) {
    const tokenRef = useRef<symbol>(Symbol("body-scroll-lock"));
    const lockDocumentElement = options.lockDocumentElement ?? false;

    useEffect(() => {
        const token = tokenRef.current;

        if (!enabled) {
            releaseAllLocks(token);
            return;
        }

        acquireLock("body", token);
        if (lockDocumentElement) {
            acquireLock("documentElement", token);
        }

        return () => {
            releaseAllLocks(token);
        };
    }, [enabled, lockDocumentElement]);
}
