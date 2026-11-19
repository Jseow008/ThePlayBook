import { EventEmitter } from 'node:events';
import type { Response } from '@playwright/test';
import { afterEach, expect, it, vi } from 'vitest';
import { captureResponse } from '../e2e/helpers/capture-response';

const matching = { status: () => 200 } as Response;
const unrelated = { status: () => 201 } as Response;
const setup = () => {
    vi.useFakeTimers();
    const source = new EventEmitter();
    const capture = captureResponse(source, response => response === matching, 'Library hydration');
    return { source, capture };
};
afterEach(() => { vi.useRealTimers(); });

it('buffers an early response until its phase is reached, without losing it during slow navigation', async () => {
    const { source, capture } = setup();
    source.emit('response', matching);
    vi.advanceTimersByTime(31_000);
    await expect(capture.wait(30_000)).resolves.toBe(matching);
    expect(source.listenerCount('response')).toBe(0);
    capture.dispose();
});

it('gives a late-starting library phase its existing budget after navigation and creation', async () => {
    const { source, capture } = setup();
    // Reproduced chronology: snapshot becomes ready around29.2s; the library
    // response arrives after the old pre-navigation30s deadline.
    vi.advanceTimersByTime(29_200);
    const response = capture.wait(30_000);
    vi.advanceTimersByTime(2_000);
    source.emit('response', matching);
    await expect(response).resolves.toBe(matching);
    capture.dispose();
});

it('still fails a missing response at exactly30 seconds from the phase start', async () => {
    const { source, capture } = setup();
    vi.advanceTimersByTime(20_000);
    const settled = vi.fn();
    const response = capture.wait(30_000);
    void response.catch(settled);
    vi.advanceTimersByTime(29_999);
    source.emit('response', unrelated);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await expect(response).rejects.toThrow('no matching response within 30000 ms');
    expect(source.listenerCount('response')).toBe(0);
    capture.dispose();
});

it('disposes an active capture without leaving a timer or listener', async () => {
    const { source, capture } = setup();
    const response = capture.wait(30_000);
    capture.dispose();
    await expect(response).rejects.toThrow('capture disposed');
    expect(source.listenerCount('response')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
});


it('fails promptly when the page closes and cleans up its observer', async () => {
    const { source, capture } = setup();
    const response = capture.wait(30_000);
    source.emit('close');
    await expect(response).rejects.toThrow('page closed');
    expect(source.listenerCount('response')).toBe(0);
    expect(source.listenerCount('close')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
});
