import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentForm } from "@/components/admin/ContentForm";

const routerPushMock = vi.fn();
const routerRefreshMock = vi.fn();

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: routerPushMock,
        refresh: routerRefreshMock,
    }),
}));

vi.mock("@/components/admin/ArtifactEditor", () => ({
    ArtifactEditor: () => <div data-testid="artifact-editor" />,
}));

vi.mock("@/components/admin/GenerateNarrationButton", () => ({
    GenerateNarrationButton: () => <div data-testid="generate-narration-button" />,
}));

vi.mock("@dnd-kit/core", () => ({
    DndContext: ({ children }: { children: ReactNode }) => <>{children}</>,
    closestCenter: vi.fn(),
    KeyboardSensor: class {},
    PointerSensor: class {},
    useSensor: () => ({}),
    useSensors: (...sensors: unknown[]) => sensors,
}));

vi.mock("@dnd-kit/sortable", () => ({
    arrayMove: <T,>(items: T[]) => items,
    SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
    sortableKeyboardCoordinates: vi.fn(),
    verticalListSortingStrategy: vi.fn(),
    useSortable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: null,
    }),
}));

vi.mock("@dnd-kit/utilities", () => ({
    CSS: {
        Transform: {
            toString: () => "",
        },
    },
}));

const seriesOptions = [
    {
        id: "11111111-1111-1111-1111-111111111111",
        slug: "test-series",
        title: "Test Series",
    },
];

function createInitialData() {
    return {
        id: "22222222-2222-2222-2222-222222222222",
        title: "Existing Content",
        author: "Test Author",
        type: "podcast" as const,
        category: "Business",
        series_id: "",
        series_order: null,
        source_url: "",
        cover_image_url: "",
        hero_image_url: "",
        audio_url: "",
        narration_status: "idle" as const,
        narration_error: null,
        narration_requested_at: null,
        narration_started_at: null,
        narration_completed_at: null,
        duration_seconds: null,
        status: "draft" as const,
        is_featured: false,
        quick_mode_json: {
            hook: "",
            big_idea: "",
            key_takeaways: ["", "", ""],
        },
        segments: [],
        artifacts: [],
    };
}

describe("ContentForm", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it("renders multiline quick mode editors and supports takeaway add/remove", () => {
        render(<ContentForm initialData={createInitialData()} seriesOptions={seriesOptions} />);

        const hookField = screen.getByPlaceholderText("One attention-grabbing sentence");
        const bigIdeaField = screen.getByPlaceholderText("The core thesis or main takeaway");
        const takeawayOne = screen.getByPlaceholderText("Takeaway 1");

        expect(hookField.tagName).toBe("TEXTAREA");
        expect(bigIdeaField.tagName).toBe("TEXTAREA");
        expect(takeawayOne.tagName).toBe("TEXTAREA");
        expect(takeawayOne).toHaveAttribute("rows", "2");

        fireEvent.click(screen.getByRole("button", { name: /add takeaway/i }));
        const takeawayFour = screen.getByPlaceholderText("Takeaway 4");
        expect(takeawayFour).toBeInTheDocument();
        expect(takeawayFour).toHaveAttribute("rows", "2");

        fireEvent.click(screen.getByRole("button", { name: "Remove takeaway 4" }));
        expect(screen.queryByPlaceholderText("Takeaway 4")).not.toBeInTheDocument();
    });

    it("includes pregnancy and parenthood in the category options", () => {
        render(<ContentForm initialData={createInitialData()} seriesOptions={seriesOptions} />);

        expect(screen.getByRole("option", { name: "Pregnancy" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Parenthood" })).toBeInTheDocument();
    });

    it("enables series order only when a series is selected and clears it when reset to standalone", () => {
        render(<ContentForm initialData={createInitialData()} seriesOptions={seriesOptions} />);

        const comboboxes = screen.getAllByRole("combobox");
        const seriesSelect = comboboxes[1];
        const seriesOrderInput = screen.getByPlaceholderText("Select a series first") as HTMLInputElement;

        expect(seriesOrderInput).toBeDisabled();

        fireEvent.change(seriesSelect, { target: { value: seriesOptions[0].id } });
        expect(seriesOrderInput).not.toBeDisabled();

        fireEvent.change(seriesOrderInput, { target: { value: "3" } });
        expect(seriesOrderInput.value).toBe("3");

        fireEvent.change(seriesSelect, { target: { value: "" } });
        expect(seriesOrderInput).toBeDisabled();
        expect(seriesOrderInput.value).toBe("");
    });

    it("clears indexed takeaway validation errors after the takeaway is edited", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            json: async () => ({
                success: false,
                error: {
                    details: [
                        {
                            path: ["quick_mode_json", "key_takeaways", 0],
                            message: "Takeaway 1 cannot be empty",
                        },
                    ],
                },
            }),
        }) as any;

        render(<ContentForm initialData={createInitialData()} seriesOptions={seriesOptions} />);

        fireEvent.click(screen.getByRole("button", { name: "Publish" }));

        expect(await screen.findByText("Takeaway 1 cannot be empty")).toBeInTheDocument();
        expect(screen.getByText(/please fix 1 validation error/i)).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText("Takeaway 1"), {
            target: { value: "Updated takeaway" },
        });

        await waitFor(() => {
            expect(screen.queryByText("Takeaway 1 cannot be empty")).not.toBeInTheDocument();
            expect(screen.queryByText(/please fix 1 validation error/i)).not.toBeInTheDocument();
        });
    });

    it("uploads a dropped cover image instead of letting the browser open it", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                url: "https://example.com/cover-uploaded.png",
            }),
        }) as any;

        render(<ContentForm initialData={createInitialData()} seriesOptions={seriesOptions} />);

        const dropZone = screen.getByTestId("cover-upload-dropzone");
        const file = new File(["cover"], "cover.png", { type: "image/png" });
        const dropEvent = createEvent.drop(dropZone, {
            dataTransfer: {
                files: [file],
            },
        });

        fireEvent(dropZone, dropEvent);

        expect(dropEvent.defaultPrevented).toBe(true);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/admin/upload",
                expect.objectContaining({
                    method: "POST",
                    body: expect.any(FormData),
                })
            );
        });

        expect(screen.getByDisplayValue("https://example.com/cover-uploaded.png")).toBeInTheDocument();
    });

    it("rejects invalid dropped files for the cover image zone", async () => {
        render(<ContentForm initialData={createInitialData()} seriesOptions={seriesOptions} />);

        const dropZone = screen.getByTestId("cover-upload-dropzone");
        const file = new File(["audio"], "voice.mp3", { type: "audio/mpeg" });
        const dropEvent = createEvent.drop(dropZone, {
            dataTransfer: {
                files: [file],
            },
        });

        fireEvent(dropZone, dropEvent);

        expect(dropEvent.defaultPrevented).toBe(true);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(await screen.findByText("Please drop an image file here.")).toBeInTheDocument();
    });
});
