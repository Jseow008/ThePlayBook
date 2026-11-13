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

    it("saves a cover change without resubmitting unchanged reading content", async () => {
        const item = {
            ...createInitialData(),
            quick_mode_json: {
                hook: "Original hook", big_idea: "Original idea", key_takeaways: ["Original takeaway"],
                category: "Investing", notebook_id: "legacy-notebook",
            },
            segments: [{ id: "33333333-3333-4333-8333-333333333333", order_index: 0, title: "Original", markdown_body: "Original passage" }],
        };
        vi.mocked(fetch).mockResolvedValue({ json: async () => ({ success: true }) } as Response);
        render(<ContentForm initialData={item} isEditing />);
        fireEvent.change(screen.getByPlaceholderText("Or paste image URL directly..."), {
            target: { value: "https://example.com/new-cover.jpg" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Publish" }));
        await waitFor(() => expect(routerPushMock).toHaveBeenCalled());
        const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
        expect(payload.cover_image_url).toBe("https://example.com/new-cover.jpg");
        expect(payload).not.toHaveProperty("quick_mode_json");
        expect(payload).not.toHaveProperty("segments");
        expect(item.quick_mode_json.notebook_id).toBe("legacy-notebook");
    });

    it("submits a published text edit and displays the version-protection conflict", async () => {
        vi.mocked(fetch).mockResolvedValue({ json: async () => ({
            success: false, error: { message: "Published reading text is protected." },
        }) } as Response);
        render(<ContentForm initialData={createInitialData()} isEditing />);
        fireEvent.change(screen.getByLabelText("Big Idea"), { target: { value: "Rewritten idea" } });
        fireEvent.click(screen.getByRole("button", { name: "Publish" }));
        expect(await screen.findByText("Published reading text is protected.")).toBeInTheDocument();
        const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
        expect(payload.quick_mode_json.big_idea).toBe("Rewritten idea");
        expect(routerPushMock).not.toHaveBeenCalled();
    });

    it("submits a reversion after an updated-version draft was saved for review", async () => {
        const item = createInitialData();
        vi.mocked(fetch).mockImplementation(async (url) => ({
            ok: true,
            json: async () => String(url).endsWith("/version")
                ? { source: { id: "old", title: "Old", updated_at: "old-time" }, replacement: { id: item.id, title: "New", updated_at: "new-time" }, preserved: { libraryRecords: 0, highlights: 0, reflections: 0 } }
                : { success: true },
        }) as Response);
        render(<ContentForm initialData={item} isEditing isVersionDraft />);
        fireEvent.change(screen.getByLabelText("Big Idea"), { target: { value: "Draft rewrite" } });
        fireEvent.click(screen.getByRole("button", { name: "Save and review updated version" }));
        await screen.findByRole("button", { name: "Publish updated version" });
        fireEvent.change(screen.getByLabelText("Big Idea"), { target: { value: item.quick_mode_json.big_idea } });
        fireEvent.click(screen.getByRole("button", { name: "Save as Draft" }));
        await waitFor(() => expect(routerPushMock).toHaveBeenCalled());
        const saves = vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === "PUT");
        expect(saves).toHaveLength(2);
        expect(JSON.parse(String(saves[1][1]?.body)).quick_mode_json.big_idea).toBe(item.quick_mode_json.big_idea);
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

    it("includes the canonical taxonomy in the category options", () => {
        render(<ContentForm initialData={createInitialData()} seriesOptions={seriesOptions} />);

        expect(screen.getByRole("option", { name: "Personal Development" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Money & Investments" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Christianity" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Health & Fitness" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Religion & Spirituality" })).not.toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Parenting" })).not.toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Mindset" })).not.toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Christian" })).not.toBeInTheDocument();
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
    it("saves an updated version privately before review and invalidates review when editing resumes", async () => {
        const item = createInitialData();
        vi.mocked(fetch).mockResolvedValueOnce({json: async () => ({success:true})} as Response)
            .mockResolvedValueOnce({ok:true,json:async () => ({source:{id:"old",title:"Old",updated_at:"old-time"},replacement:{id:item.id,title:"New",updated_at:"new-time"},preserved:{libraryRecords:1,highlights:1,reflections:0}})} as Response);
        render(<ContentForm initialData={item} isEditing isVersionDraft />);
        fireEvent.change(screen.getByLabelText("Big Idea"),{target:{value:"Unpublished rewrite"}});
        fireEvent.click(screen.getByRole("button",{name:"Save and review updated version"}));
        const publish = await screen.findByRole("button",{name:"Publish updated version"});
        await waitFor(() => expect(publish).toBeEnabled());
        expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({status:"draft",quick_mode_json:{big_idea:"Unpublished rewrite"}});
        expect(routerPushMock).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText("Big Idea"),{target:{value:"Newer unsaved rewrite"}});
        await waitFor(() => expect(screen.queryByRole("button",{name:"Publish updated version"})).not.toBeInTheDocument());
        expect(fetch).toHaveBeenCalledTimes(2);
    });

});
