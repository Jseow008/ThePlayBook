import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ReflectionComposer } from "@/components/reader/ReflectionComposer";

vi.mock("@/hooks/useReflections", () => ({
    useSaveReflection: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteReflection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/analytics", () => ({ captureAnalyticsEvent: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

it("labels the reflection field, describes its limit, and restores focus on Escape", async () => {
    function Harness() {
        const [open, setOpen] = useState(false);
        return <><button onClick={() => setOpen(true)}>Write reflection</button>
            <ReflectionComposer contentId="synthetic" contentTitle="Synthetic source" readerTheme="dark"
                isOpen={open} isAuthenticated existingReflection={null} onClose={() => setOpen(false)} onSaved={() => {}} />
        </>;
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Write reflection" });
    opener.focus();
    fireEvent.click(opener);
    const field = await screen.findByRole("textbox", { name: "What idea do you want to remember from this?" });
    expect(field).toHaveAccessibleDescription("Private to you. Maximum 1000 characters.");
    await waitFor(() => expect(field).toHaveFocus());
    fireEvent.change(field, { target: { value: "One synthetic idea" } });
    expect(screen.getByText("18 / 1000")).not.toHaveAttribute("aria-live");
    fireEvent.keyDown(field, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
});
