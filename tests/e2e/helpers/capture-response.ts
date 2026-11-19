import type { Response } from '@playwright/test';

type ResponseSource = {
    on(event: 'response', listener: (response: Response) => void): unknown;
    on(event: 'close', listener: () => void): unknown;
    off(event: 'response', listener: (response: Response) => void): unknown;
    off(event: 'close', listener: () => void): unknown;
};

/** Capture before navigation; start the bounded wait only when its phase begins. */
export function captureResponse(source: ResponseSource, matches: (response: Response) => boolean, label: string) {
    let captured: Response | undefined;
    let waiting: ((response: Response) => void) | undefined;
    let rejectWaiting: ((error: Error) => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const stop = () => {
        source.off('response', onResponse);
        source.off('close', onClose);
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        waiting = undefined;
        rejectWaiting = undefined;
    };
    const onResponse = (response: Response) => {
        if (captured || !matches(response)) return;
        captured = response;
        waiting?.(response);
        stop();
    };
    const onClose = () => {
        disposed = true;
        rejectWaiting?.(new Error(`${label}: page closed`));
        stop();
    };
    source.on('response', onResponse);
    source.on('close', onClose);

    return {
        wait(timeoutMs: number): Promise<Response> {
            if (disposed) return Promise.reject(new Error(`${label}: capture disposed`));
            if (captured) return Promise.resolve(captured);
            if (waiting) return Promise.reject(new Error(`${label}: already waiting`));
            return new Promise((resolve, reject) => {
                waiting = resolve;
                rejectWaiting = reject;
                timer = setTimeout(() => {
                    stop();
                    reject(new Error(`${label}: no matching response within ${timeoutMs} ms`));
                }, timeoutMs);
            });
        },
        dispose() {
            disposed = true;
            rejectWaiting?.(new Error(`${label}: capture disposed`));
            stop();
        },
    };
}
