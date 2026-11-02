import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletionCelebration } from '@/components/reader/CompletionCelebration';

describe('CompletionCelebration', () => {
    let notify: IntersectionObserverCallback;
    let motionChange: () => void;
    let reduced: boolean;
    const cancel = vi.fn();
    const animate = vi.fn<HTMLElement['animate']>(() => ({ cancel } as unknown as Animation));
    const consume = vi.fn();
    const disconnect = vi.fn();
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        reduced = false;
        vi.stubGlobal('IntersectionObserver', class {
            constructor(callback: IntersectionObserverCallback) { notify = callback; }
            observe() { }
            disconnect = disconnect;
        });
        vi.spyOn(window, 'matchMedia').mockImplementation(() => ({
            get matches() { return reduced; },
            addEventListener: (_: string, callback: () => void) => { motionChange = callback; },
            removeEventListener: vi.fn(),
        } as unknown as MediaQueryList));
        Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    });
    function show(ratio = 1) {
        act(() => notify([{ isIntersecting: ratio > 0, intersectionRatio: ratio }] as IntersectionObserverEntry[], {} as IntersectionObserver));
    }
    function mount(requested = true) {
        return render(<div><CompletionCelebration requested={requested} onConsumed={consume} /></div>);
    }
    it('does nothing for restored completion without an explicit new request', () => {
        const { container } = mount(false);
        expect(container.querySelector('[aria-hidden]')).toBeNull();
        expect(animate).not.toHaveBeenCalled();
        expect(consume).not.toHaveBeenCalled();
    });
    it('waits for visibility then runs 24 particles once and consumes the request', () => {
        mount();
        show(.1);
        expect(animate).not.toHaveBeenCalled();
        show();
        show();
        expect(animate).toHaveBeenCalledTimes(24);
        expect(animate.mock.calls[0][1]).toEqual(expect.objectContaining({ duration: 800 }));
        act(() => { vi.advanceTimersByTime(850); });
        expect(consume).toHaveBeenCalledTimes(1);
        expect(cancel).toHaveBeenCalledTimes(24);
    });
    it('waits for a background tab to become visible', () => {
        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        mount();
        show();
        expect(animate).not.toHaveBeenCalled();
        visibility.mockReturnValue('visible');
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(animate).toHaveBeenCalledTimes(24);
    });
    it('cancels a pending request before it becomes visible', () => {
        const { rerender } = mount();
        rerender(<div><CompletionCelebration requested={false} onConsumed={consume} /></div>);
        show();
        expect(animate).not.toHaveBeenCalled();
        expect(consume).not.toHaveBeenCalled();
    });
    it('suppresses particles for reduced motion', () => {
        reduced = true;
        mount();
        expect(animate).not.toHaveBeenCalled();
        expect(consume).toHaveBeenCalledTimes(1);
    });
    it('stops immediately when reduced motion is enabled during playback', () => {
        mount();
        show();
        reduced = true;
        act(() => motionChange());
        expect(cancel).toHaveBeenCalledTimes(24);
        expect(consume).toHaveBeenCalledTimes(1);
    });
    it('cancels particles and pending callbacks on Undo or unmount', () => {
        const { unmount } = mount();
        show();
        unmount();
        act(() => { vi.advanceTimersByTime(1000); });
        expect(cancel).toHaveBeenCalledTimes(24);
        expect(disconnect).toHaveBeenCalled();
        expect(consume).not.toHaveBeenCalled();
    });
});
