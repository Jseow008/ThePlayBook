import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AudioPlayer } from "@/components/reader/AudioPlayer";
import { vi } from "vitest";

describe("AudioPlayer", () => {
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
});
