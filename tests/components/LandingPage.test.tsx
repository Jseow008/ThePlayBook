import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/components/ui/LandingPage";
import type { ContentItem } from "@/types/database";

const { cardClickSpy } = vi.hoisted(() => ({
  cardClickSpy: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
    unoptimized?: boolean;
    }
  ) => {
    const imageProps = { ...props };
    const alt = imageProps.alt;
    const src = imageProps.src;

    delete imageProps.fill;
    delete imageProps.priority;
    delete imageProps.unoptimized;

    return <img alt={alt} src={typeof src === "string" ? src : ""} {...imageProps} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/Logo", () => ({
  Logo: () => <div>Flux</div>,
}));

vi.mock("@/components/ui/ContentCard", () => ({
  ContentCard: ({ item }: { item: ContentItem }) => (
    <a href={`/preview/${item.id}`} onClick={() => cardClickSpy(item.id)}>
      {item.title}
    </a>
  ),
}));

const featuredItems: ContentItem[] = [
  {
    id: "featured-1",
    title: "First featured read",
    type: "article",
    status: "verified",
    quick_mode_json: null,
    duration_seconds: null,
    author: null,
    cover_image_url: null,
    hero_image_url: null,
    category: "Mindset",
    is_featured: true,
    embedding: null,
    audio_url: null,
    source_url: null,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    deleted_at: null,
  },
  {
    id: "featured-2",
    title: "Second featured read",
    type: "book",
    status: "verified",
    quick_mode_json: null,
    duration_seconds: null,
    author: null,
    cover_image_url: null,
    hero_image_url: null,
    category: "Business",
    is_featured: true,
    embedding: null,
    audio_url: null,
    source_url: null,
    created_at: "2026-03-02T00:00:00Z",
    updated_at: "2026-03-02T00:00:00Z",
    deleted_at: null,
  },
];

function mockMatchMedia(prefersReducedMotion = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: prefersReducedMotion && query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function setupRequestAnimationFrame() {
  let frameId = 0;
  let timestamp = 0;
  const frameTimers = new Map<number, ReturnType<typeof setTimeout>>();

  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++frameId;
    const timer = setTimeout(() => {
      frameTimers.delete(id);
      timestamp += 16;
      callback(timestamp);
    }, 16);

    frameTimers.set(id, timer);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const timer = frameTimers.get(id);
    if (!timer) return;

    clearTimeout(timer);
    frameTimers.delete(id);
  });
}

function renderLandingPage() {
  render(
    <LandingPage
      featuredItems={featuredItems}
      categories={[]}
      totalContentCount={featuredItems.length}
    />
  );

  const carousel = screen.getByTestId("featured-reads-carousel") as HTMLDivElement;
  const firstLoop = screen.getByTestId("featured-reads-group-a") as HTMLDivElement;
  const middleLoop = screen.getByTestId("featured-reads-group-b") as HTMLDivElement;
  const lastLoop = screen.getByTestId("featured-reads-group-c") as HTMLDivElement;
  Object.defineProperty(carousel, "clientWidth", { configurable: true, value: 400 });
  Object.defineProperty(carousel, "scrollWidth", { configurable: true, value: 2800 });
  Object.defineProperty(firstLoop, "offsetLeft", { configurable: true, value: 0 });
  Object.defineProperty(middleLoop, "offsetLeft", { configurable: true, value: 800 });
  Object.defineProperty(lastLoop, "offsetLeft", { configurable: true, value: 1600 });
  let scrollLeftValue = 0;
  Object.defineProperty(carousel, "scrollLeft", {
    configurable: true,
    get: () => scrollLeftValue,
    set: (value: number) => {
      scrollLeftValue = Math.max(0, Math.min(2400, Math.trunc(value)));
    },
  });

  act(() => {
    window.dispatchEvent(new Event("resize"));
  });

  fireEvent.scroll(carousel);

  return carousel;
}

function getFirstCarouselCardLink(carousel: HTMLDivElement) {
  return within(carousel).getAllByText("First featured read")[0];
}

describe("LandingPage featured reads carousel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cardClickSpy.mockReset();
    mockMatchMedia();
    setupRequestAnimationFrame();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("autoplay initializes and advances the carousel", () => {
    const carousel = renderLandingPage();

    expect(carousel.scrollLeft).toBe(800);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(carousel.scrollLeft).toBeGreaterThan(820);
  });

  it("matches browse lane vertical padding so hover scaling is not clipped", () => {
    const carousel = renderLandingPage();

    expect(carousel).toHaveClass("pt-3", "pb-3", "md:pt-4", "md:pb-4");
  });

  it("renders three identical carousel groups to keep rebasing away from hard edges", () => {
    renderLandingPage();

    expect(screen.getByTestId("featured-reads-group-a")).toBeInTheDocument();
    expect(screen.getByTestId("featured-reads-group-b")).toBeInTheDocument();
    expect(screen.getByTestId("featured-reads-group-c")).toBeInTheDocument();
  });

  it("pauses on hover and focus, then resumes after the idle delay", () => {
    const carousel = renderLandingPage();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const beforeHover = carousel.scrollLeft;
    fireEvent.mouseEnter(carousel);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(carousel.scrollLeft).toBe(beforeHover);

    fireEvent.mouseLeave(carousel);

    act(() => {
      vi.advanceTimersByTime(1900);
    });

    expect(carousel.scrollLeft).toBe(beforeHover);

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(carousel.scrollLeft).toBeGreaterThan(beforeHover);

    const cardLink = getFirstCarouselCardLink(carousel);
    fireEvent.focus(cardLink);
    const beforeFocus = carousel.scrollLeft;

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(carousel.scrollLeft).toBe(beforeFocus);

    fireEvent.blur(cardLink);

    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(carousel.scrollLeft).toBeGreaterThan(beforeFocus);
  });

  it("lets desktop users drag the carousel horizontally", () => {
    const carousel = renderLandingPage();

    carousel.scrollLeft = 840;

    fireEvent.pointerDown(carousel, {
      button: 0,
      clientX: 200,
      pointerId: 1,
      pointerType: "mouse",
    });

    fireEvent.pointerMove(carousel, {
      clientX: 120,
      pointerId: 1,
      pointerType: "mouse",
    });

    expect(carousel.scrollLeft).toBeGreaterThan(900);

    fireEvent.pointerUp(carousel, {
      pointerId: 1,
      pointerType: "mouse",
    });
  });

  it("suppresses click-through after a drag interaction", () => {
    const carousel = renderLandingPage();
    const cardLink = getFirstCarouselCardLink(carousel);

    fireEvent.pointerDown(carousel, {
      button: 0,
      clientX: 220,
      pointerId: 3,
      pointerType: "mouse",
    });

    fireEvent.pointerMove(carousel, {
      clientX: 160,
      pointerId: 3,
      pointerType: "mouse",
    });

    fireEvent.pointerUp(carousel, {
      pointerId: 3,
      pointerType: "mouse",
    });

    fireEvent.click(cardLink);

    expect(cardClickSpy).not.toHaveBeenCalled();
  });

  it("rebases seamlessly when scrolling past the forward seam", () => {
    const carousel = renderLandingPage();

    carousel.scrollLeft = 1610;
    fireEvent.scroll(carousel);

    expect(carousel.scrollLeft).toBe(810);
  });

  it("rebases seamlessly when scrolling past the backward seam", () => {
    const carousel = renderLandingPage();

    carousel.scrollLeft = 790;
    fireEvent.scroll(carousel);

    expect(carousel.scrollLeft).toBe(1590);
  });

  it("disables autoplay when reduced motion is preferred", () => {
    mockMatchMedia(true);
    const carousel = renderLandingPage();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(carousel.scrollLeft).toBe(800);
  });
});
