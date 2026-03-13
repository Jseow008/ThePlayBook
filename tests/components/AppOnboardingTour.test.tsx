import { fireEvent, render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { AppOnboardingTour } from "@/components/ui/AppOnboardingTour";
import { APP_ONBOARDING_SLIDES } from "@/lib/onboarding";
import { vi } from "vitest";

vi.mock("next/image", () => ({
    default: (props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
        const { alt, src, fill, priority, ...safeProps } = props;
        void fill;
        void priority;
        return <img alt={alt} src={src} {...safeProps} />;
    },
}));

describe("AppOnboardingTour", () => {
    it("renders a viewport-safe body and pinned footer shell for mobile", () => {
        render(<AppOnboardingTour isOpen isSaving={false} onFinish={vi.fn()} slides={APP_ONBOARDING_SLIDES} />);

        expect(screen.getByTestId("app-onboarding-body")).toHaveClass("min-h-0", "overflow-hidden");
        expect(screen.getByTestId("app-onboarding-footer")).toHaveClass("flex-none");
        expect(screen.getByTestId("app-onboarding-track")).toHaveClass("min-w-0");
        const mobileCards = screen.getAllByTestId("app-onboarding-mobile-card");
        const mobileFrames = screen.getAllByTestId("app-onboarding-mobile-media-frame");
        expect(mobileCards).toHaveLength(6);
        expect(mobileFrames).toHaveLength(6);
        mobileCards.forEach((card) => {
            expect(card).toHaveClass("h-full", "flex-col", "lg:h-auto");
        });
        mobileFrames.forEach((frame) => {
            expect(frame).toHaveClass("h-[15.75rem]", "sm:h-[17rem]", "lg:hidden");
        });
        expect(screen.queryByText("Swipe or click through")).not.toBeInTheDocument();
        expect(screen.queryByText("Built for the real app")).not.toBeInTheDocument();
    });

    it("does not render per-slide decorative icons", () => {
        render(<AppOnboardingTour isOpen isSaving={false} onFinish={vi.fn()} slides={APP_ONBOARDING_SLIDES} />);

        expect(document.body.querySelectorAll('[data-testid^="app-onboarding-slide-"] svg')).toHaveLength(0);
    });

    it("uses the expected workflow screenshots", () => {
        render(<AppOnboardingTour isOpen isSaving={false} onFinish={vi.fn()} slides={APP_ONBOARDING_SLIDES} />);

        const imageSources = Array.from(document.body.querySelectorAll("img")).map((image) =>
            image.getAttribute("src")
        );

        expect(imageSources).toEqual(expect.arrayContaining([
            "/images/hero-section.png",
            "/images/reading-experience-info-view.png",
            "/images/reading-experience-reader-view.png",
            "/images/highlighting-and-annotation.png",
            "/images/notes.png",
            "/images/ai-chat.png",
        ]));
        expect(APP_ONBOARDING_SLIDES[4]?.imageSrc).toBe("/images/notes.png");
    });

    it("uses screenshot-safe mobile image framing across slides", () => {
        render(<AppOnboardingTour isOpen isSaving={false} onFinish={vi.fn()} slides={APP_ONBOARDING_SLIDES} />);

        const mobileImages = screen.getAllByTestId("app-onboarding-mobile-image");

        expect(mobileImages).toHaveLength(6);
        mobileImages.forEach((image) => {
            expect(image).toHaveClass("object-contain", "object-center", "bg-[#0b1220]");
            expect(image).not.toHaveClass("object-cover");
        });
    });

    it("uses the shorter desktop screenshot frame instead of the old tall min-height", () => {
        render(<AppOnboardingTour isOpen isSaving={false} onFinish={vi.fn()} slides={APP_ONBOARDING_SLIDES} />);

        const frames = screen.getAllByTestId("app-onboarding-desktop-image-frame");

        expect(frames).toHaveLength(6);
        frames.forEach((frame) => {
            expect(frame).toHaveClass("lg:block", "h-[300px]");
        });
    });

    it("moves between slides using next, back, and dot navigation", () => {
        render(<AppOnboardingTour isOpen isSaving={false} onFinish={vi.fn()} slides={APP_ONBOARDING_SLIDES} />);

        expect(screen.getByText("Find your next read.")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(screen.getByText("Preview the thesis first.")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("tab", { name: "Go to slide 4" }));
        expect(screen.getByText("Save what matters.")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(screen.getByText("Read in clean sections.")).toBeInTheDocument();
    });

    it("sends dismissed when skipped and completed on the final slide", () => {
        const onFinish = vi.fn();
        render(<AppOnboardingTour isOpen isSaving={false} onFinish={onFinish} slides={APP_ONBOARDING_SLIDES} />);

        fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
        expect(onFinish).toHaveBeenCalledWith("dismissed");

        onFinish.mockClear();

        for (let index = 0; index < 5; index += 1) {
            fireEvent.click(screen.getByRole("button", { name: "Next" }));
        }

        fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
        expect(onFinish).toHaveBeenCalledWith("completed");
    });

    it("changes slides from swipe gestures", () => {
        render(<AppOnboardingTour isOpen isSaving={false} onFinish={vi.fn()} slides={APP_ONBOARDING_SLIDES} />);

        const track = screen.getByTestId("app-onboarding-track");

        fireEvent.touchStart(track, { changedTouches: [{ clientX: 280 }] });
        fireEvent.touchEnd(track, { changedTouches: [{ clientX: 180 }] });
        expect(screen.getByText("Preview the thesis first.")).toBeInTheDocument();

        fireEvent.touchStart(track, { changedTouches: [{ clientX: 180 }] });
        fireEvent.touchEnd(track, { changedTouches: [{ clientX: 280 }] });
        expect(screen.getByText("Find your next read.")).toBeInTheDocument();
    });

    it("keeps keyboard focus inside the dialog when tabbing", () => {
        render(<AppOnboardingTour isOpen isSaving={false} onFinish={vi.fn()} slides={APP_ONBOARDING_SLIDES} />);

        const skipButton = screen.getByRole("button", { name: "Skip tour" });
        const nextButton = screen.getByRole("button", { name: "Next" });

        nextButton.focus();
        fireEvent.keyDown(document, { key: "Tab" });
        expect(skipButton).toHaveFocus();

        skipButton.focus();
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(nextButton).toHaveFocus();
    });

});
