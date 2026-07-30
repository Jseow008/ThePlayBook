import { useEffect, useRef } from "react";

type LockTarget = "body" | "documentElement";

interface LockState {
    tokens: Set<symbol>;
    originalOverflow: string | null;
}

interface FrozenBodyState {
    tokens: Set<symbol>;
    originalStyles: {
        position: string;
        top: string;
        left: string;
        right: string;
        width: string;
    } | null;
    scrollX: number;
    scrollY: number;
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

const frozenBodyState: FrozenBodyState = {
    tokens: new Set(),
    originalStyles: null,
    scrollX: 0,
    scrollY: 0,
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

function acquireFrozenBody(token: symbol) {
    if (typeof window === "undefined" || frozenBodyState.tokens.has(token)) {
        return;
    }

    const body = getLockElement("body");
    if (!body) {
        return;
    }

    if (frozenBodyState.tokens.size === 0) {
        frozenBodyState.originalStyles = {
            position: body.style.position,
            top: body.style.top,
            left: body.style.left,
            right: body.style.right,
            width: body.style.width,
        };
        frozenBodyState.scrollX = window.scrollX;
        frozenBodyState.scrollY = window.scrollY;

        body.style.position = "fixed";
        body.style.top = `${-frozenBodyState.scrollY}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
    }

    frozenBodyState.tokens.add(token);
}

function releaseFrozenBody(token: symbol) {
    if (typeof window === "undefined" || !frozenBodyState.tokens.delete(token)) {
        return;
    }

    if (frozenBodyState.tokens.size > 0) {
        return;
    }

    const body = getLockElement("body");
    const originalStyles = frozenBodyState.originalStyles;
    const scrollX = frozenBodyState.scrollX;
    const scrollY = frozenBodyState.scrollY;

    if (body && originalStyles) {
        body.style.position = originalStyles.position;
        body.style.top = originalStyles.top;
        body.style.left = originalStyles.left;
        body.style.right = originalStyles.right;
        body.style.width = originalStyles.width;
    }

    frozenBodyState.originalStyles = null;
    frozenBodyState.scrollX = 0;
    frozenBodyState.scrollY = 0;
    window.scrollTo(scrollX, scrollY);
}

function releaseAllLocks(token: symbol) {
    releaseFrozenBody(token);
    releaseLock("body", token);
    releaseLock("documentElement", token);
}

interface BodyScrollLockOptions {
    freezePosition?: boolean;
    lockDocumentElement?: boolean;
}

export function useBodyScrollLock(
    enabled: boolean,
    options: BodyScrollLockOptions = {}
) {
    const tokenRef = useRef<symbol>(Symbol("body-scroll-lock"));
    const freezePosition = options.freezePosition ?? false;
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
        if (freezePosition) {
            acquireFrozenBody(token);
        }

        return () => {
            releaseAllLocks(token);
        };
    }, [enabled, freezePosition, lockDocumentElement]);
}
