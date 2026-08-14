import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AudioPlayer } from "@/components/reader/AudioPlayer";
import { vi } from "vitest";

describe("AudioPlayer", () => {
    let intersectionCallback: IntersectionObserverCallback | null = null;

    const mockIntersectionObserver = () => {
        intersectionCallback = null;
        const observe = vi.fn();
        const disconnect = vi.fn();

        vi.stubGlobal(
            "IntersectionObserver",
            vi.fn(function (this: IntersectionObserver, callback: IntersectionObserverCallback) {
                intersectionCallback = callback;
                return {
                    observe,
                    disconnect,
                    unobserve: vi.fn(),
                    takeRecords: vi.fn(() => []),
                    root: null,
                    rootMargin: "",
                    thresholds: [],
                };
            })
        );
    };

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("provides mobile-sized touch targets for the full player controls", () => {
        render(<AudioPlayer src="https://example.com/audio.mp3" />);

        expect(screen.getByTitle("Change playback speed")).toHaveClass("size-11");
        expect(screen.getByRole("button", { name: "Mute" })).toHaveClass("size-11", "sm:size-auto");
    });

    it("shows an unavailable duration and disables seeking until metadata loads", async () => {
        const { container } = render(
            <AudioPlayer src="https://example.com/audio.mp3" />
        );

        const audio = container.querySelector("audio");
        expect(audio).not.toBeNull();
        if (!audio) {
            return;
        }

        const seekInput = screen.getByLabelText("Seek timeline");
        expect(screen.getByText("--:--")).toBeInTheDocument();
        expect(seekInput).toBeDisabled();

        Object.defineProperty(audio, "duration", {
            configurable: true,
            value: 120,
        });

        fireEvent(audio, new Event("loadedmetadata"));

        await waitFor(() => {
            expect(screen.getByText("2:00")).toBeInTheDocument();
            expect(seekInput).toBeEnabled();
        });
    });

    it("restores the provided initial playback time after metadata loads", async () => {
        const onTimeChange = vi.fn();
        const { container } = render(
            <AudioPlayer
                src="https://example.com/audio.mp3"
                initialTimeSec={45}
                onTimeChange={onTimeChange}
            />
        );

        const audio = container.querySelector("audio");
        expect(audio).not.toBeNull();
        if (!audio) {
            return;
        }

        Object.defineProperty(audio, "duration", {
            configurable: true,
            value: 120,
        });

        Object.defineProperty(audio, "currentTime", {
            configurable: true,
            writable: true,
            value: 0,
        });

        fireEvent(audio, new Event("loadedmetadata"));

        await waitFor(() => {
            expect(screen.getByText("0:45")).toBeInTheDocument();
            expect(onTimeChange).toHaveBeenCalledWith(45, {
                durationSec: 120,
                isEnded: false,
            });
        });
    });

    it("reports seek changes with duration metadata", async () => {
        const onTimeChange = vi.fn();
        const { container } = render(
            <AudioPlayer
                src="https://example.com/audio.mp3"
                onTimeChange={onTimeChange}
            />
        );

        const audio = container.querySelector("audio");
        expect(audio).not.toBeNull();
        if (!audio) {
            return;
        }

        Object.defineProperty(audio, "duration", {
            configurable: true,
            value: 90,
        });

        Object.defineProperty(audio, "currentTime", {
            configurable: true,
            writable: true,
            value: 0,
        });

        fireEvent(audio, new Event("loadedmetadata"));

        const seekInput = screen.getByLabelText("Seek timeline");
        fireEvent.change(seekInput, { target: { value: "30" } });

        await waitFor(() => {
            expect(onTimeChange).toHaveBeenCalledWith(30, {
                durationSec: 90,
                isEnded: false,
            });
            expect(screen.getByText("0:30")).toBeInTheDocument();
        });
    });

    it("reports playback state changes from native media events", async () => {
        const onPlaybackStateChange = vi.fn();
        const { container } = render(
            <AudioPlayer
                src="https://example.com/audio.mp3"
                onPlaybackStateChange={onPlaybackStateChange}
            />
        );

        const audio = container.querySelector("audio");
        expect(audio).not.toBeNull();
        if (!audio) {
            return;
        }

        fireEvent(audio, new Event("play"));
        fireEvent(audio, new Event("pause"));

        await waitFor(() => {
            expect(onPlaybackStateChange).toHaveBeenCalledWith(true);
            expect(onPlaybackStateChange).toHaveBeenCalledWith(false);
        });
    });

    it("shows a compact mini-player after the hero player leaves view", async () => {
        mockIntersectionObserver();
        const onMiniPlayerVisibilityChange = vi.fn();

        const { container } = render(
            <AudioPlayer
                src="https://example.com/audio.mp3"
                title="Listen to this summary"
                mediaTitle="Competence Versus Power Dynamics"
                mediaAuthor="Jordan Peterson"
                readerTheme="sepia"
                onMiniPlayerVisibilityChange={onMiniPlayerVisibilityChange}
            />
        );

        const audio = container.querySelector("audio");
        expect(audio).not.toBeNull();
        if (!audio) {
            return;
        }

        Object.defineProperty(audio, "duration", {
            configurable: true,
            value: 120,
        });
        Object.defineProperty(audio, "currentTime", {
            configurable: true,
            writable: true,
            value: 24,
        });

        fireEvent(audio, new Event("loadedmetadata"));
        fireEvent(audio, new Event("timeupdate"));
        fireEvent(audio, new Event("play"));

        await act(async () => {
            intersectionCallback?.(
                [{ isIntersecting: false } as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });

        expect(screen.getByRole("region", { name: "Audio mini player" })).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Audio mini player" })).toHaveClass("reader-sepia");
        const miniPlayerTitle = screen.getByText("Competence Versus Power Dynamics by Jordan Peterson");
        expect(miniPlayerTitle).toBeInTheDocument();
        expect(miniPlayerTitle.parentElement).toHaveClass(
            "col-span-5",
            "col-start-1",
            "row-start-1",
            "pr-12",
            "sm:col-auto",
            "sm:row-auto",
            "sm:pr-0"
        );
        expect(screen.getByRole("button", { name: "Pause mini player" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pause mini player" })).toHaveClass(
            "col-start-3",
            "row-start-2",
            "size-11",
            "sm:col-auto",
            "sm:row-auto",
            "sm:size-9"
        );
        expect(screen.getByRole("button", { name: "Rewind 10 seconds" })).toHaveClass(
            "col-start-2",
            "row-start-2",
            "size-11",
            "sm:size-7"
        );
        expect(screen.getByRole("button", { name: "Forward 10 seconds" })).toHaveClass(
            "col-start-4",
            "row-start-2",
            "size-11",
            "sm:size-7"
        );
        expect(screen.getByRole("button", { name: "Change mini player playback speed" })).toHaveClass(
            "col-start-5",
            "row-start-2",
            "size-11"
        );
        expect(screen.getByRole("button", { name: "Change mini player playback speed" })).toHaveTextContent("1x");
        expect(screen.getByRole("button", { name: "Close audio mini player" })).toHaveClass(
            "col-start-5",
            "row-start-1",
            "size-11"
        );
        expect(onMiniPlayerVisibilityChange).toHaveBeenLastCalledWith(true);
    });

    it("uses the visual viewport bottom inset in one opaque mini-player dock", async () => {
        mockIntersectionObserver();
        const onMiniPlayerBottomInsetChange = vi.fn();
        vi.stubGlobal("innerHeight", 800);
        vi.stubGlobal("visualViewport", {
            height: 704,
            offsetTop: 0,
            scale: 1,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });

        const { container } = render(
            <AudioPlayer
                src="https://example.com/audio.mp3"
                readerTheme="sepia"
                onMiniPlayerBottomInsetChange={onMiniPlayerBottomInsetChange}
            />
        );

        const audio = container.querySelector("audio");
        expect(audio).not.toBeNull();
        if (!audio) {
            return;
        }

        Object.defineProperty(audio, "duration", {
            configurable: true,
            value: 120,
        });
        Object.defineProperty(audio, "currentTime", {
            configurable: true,
            writable: true,
            value: 24,
        });

        fireEvent(audio, new Event("loadedmetadata"));
        fireEvent(audio, new Event("timeupdate"));
        fireEvent(audio, new Event("play"));

        await act(async () => {
            intersectionCallback?.(
                [{ isIntersecting: false } as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });

        const miniPlayer = screen.getByRole("region", { name: "Audio mini player" });
        expect(miniPlayer).toHaveClass("reader-audio-mini-dock", "reader-sepia");
        await waitFor(() => {
            expect(miniPlayer).toHaveStyle("--reader-audio-viewport-bottom: 96px");
            expect(onMiniPlayerBottomInsetChange).toHaveBeenLastCalledWith(96);
        });
    });

    it("supports compact mini-player transport controls", async () => {
        mockIntersectionObserver();
        const onTimeChange = vi.fn();

        const { container } = render(
            <AudioPlayer
                src="https://example.com/audio.mp3"
                mediaTitle="Short title"
                onTimeChange={onTimeChange}
            />
        );

        const audio = container.querySelector("audio");
        expect(audio).not.toBeNull();
        if (!audio) {
            return;
        }

        Object.defineProperty(audio, "duration", {
            configurable: true,
            value: 120,
        });
        Object.defineProperty(audio, "currentTime", {
            configurable: true,
            writable: true,
            value: 24,
        });
        Object.defineProperty(audio, "playbackRate", {
            configurable: true,
            writable: true,
            value: 1,
        });

        fireEvent(audio, new Event("loadedmetadata"));
        fireEvent(audio, new Event("timeupdate"));
        fireEvent(audio, new Event("play"));

        await act(async () => {
            intersectionCallback?.(
                [{ isIntersecting: false } as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });

        fireEvent.click(screen.getByRole("button", { name: "Rewind 10 seconds" }));
        expect(onTimeChange).toHaveBeenLastCalledWith(14, {
            durationSec: 120,
            isEnded: false,
        });

        fireEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
        expect(onTimeChange).toHaveBeenLastCalledWith(24, {
            durationSec: 120,
            isEnded: false,
        });

        fireEvent.click(screen.getByRole("button", { name: "Change mini player playback speed" }));
        expect(screen.getByRole("button", { name: "Change mini player playback speed" })).toHaveTextContent("1.25x");
        expect(audio.playbackRate).toBe(1.25);
    });

    it("hides the mini-player while the notes drawer is open", async () => {
        mockIntersectionObserver();

        const { container } = render(
            <AudioPlayer
                src="https://example.com/audio.mp3"
                title="Listen to this summary"
                isNotesDrawerOpen
            />
        );

        const audio = container.querySelector("audio");
        expect(audio).not.toBeNull();
        if (!audio) {
            return;
        }

        Object.defineProperty(audio, "duration", {
            configurable: true,
            value: 120,
        });
        Object.defineProperty(audio, "currentTime", {
            configurable: true,
            writable: true,
            value: 24,
        });

        fireEvent(audio, new Event("loadedmetadata"));
        fireEvent(audio, new Event("timeupdate"));
        fireEvent(audio, new Event("play"));

        await act(async () => {
            intersectionCallback?.(
                [{ isIntersecting: false } as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });

        expect(screen.queryByRole("region", { name: "Audio mini player" })).not.toBeInTheDocument();
    });

    it("pauses audio and hides the mini-player when dismissed", async () => {
        mockIntersectionObserver();
        const onPlaybackStateChange = vi.fn();

        const { container } = render(
            <AudioPlayer
                src="https://example.com/audio.mp3"
                title="Listen to this summary"
                onPlaybackStateChange={onPlaybackStateChange}
            />
        );

        const audio = container.querySelector("audio");
        expect(audio).not.toBeNull();
        if (!audio) {
            return;
        }

        const pauseSpy = vi.spyOn(audio, "pause").mockImplementation(() => undefined);
        Object.defineProperty(audio, "duration", {
            configurable: true,
            value: 120,
        });
        Object.defineProperty(audio, "currentTime", {
            configurable: true,
            writable: true,
            value: 24,
        });

        fireEvent(audio, new Event("loadedmetadata"));
        fireEvent(audio, new Event("timeupdate"));
        fireEvent(audio, new Event("play"));

        await act(async () => {
            intersectionCallback?.(
                [{ isIntersecting: false } as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });

        fireEvent.click(screen.getByRole("button", { name: "Close audio mini player" }));

        expect(pauseSpy).toHaveBeenCalled();
        expect(onPlaybackStateChange).toHaveBeenCalledWith(false);
        expect(screen.queryByRole("region", { name: "Audio mini player" })).not.toBeInTheDocument();
    });
});
