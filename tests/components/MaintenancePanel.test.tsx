import { fireEvent, render, screen } from "@testing-library/react";
import { MaintenancePanel } from "@/components/admin/MaintenancePanel";

vi.mock("@/components/admin/SyncEmbeddingsButton", () => ({
    SyncEmbeddingsButton: () => <div>Content embedding controls</div>,
}));

vi.mock("@/components/admin/SyncSegmentEmbeddingsButton", () => ({
    SyncSegmentEmbeddingsButton: () => <div>Segment coverage controls</div>,
}));

vi.mock("@/components/admin/DrainNarrationJobsButton", () => ({
    DrainNarrationJobsButton: () => <div>Narration recovery controls</div>,
}));

describe("MaintenancePanel", () => {
    it("lazy-mounts each tool under its matching section", () => {
        render(<MaintenancePanel />);

        expect(screen.queryByText("Content embedding controls")).not.toBeInTheDocument();
        expect(screen.queryByText("Segment coverage controls")).not.toBeInTheDocument();
        expect(screen.queryByText("Narration recovery controls")).not.toBeInTheDocument();

        const sectionButtons = screen.getAllByRole("button", { name: "Show details" });
        fireEvent.click(sectionButtons[0]);

        expect(screen.getByText("Content embedding controls")).toBeInTheDocument();
        expect(screen.queryByText("Segment coverage controls")).not.toBeInTheDocument();
        expect(screen.queryByText("Narration recovery controls")).not.toBeInTheDocument();
    });

    it("expands and collapses all sections from the header control", () => {
        render(<MaintenancePanel />);

        fireEvent.click(screen.getByRole("button", { name: "Show all details" }));

        expect(screen.getByText("Content embedding controls")).toBeInTheDocument();
        expect(screen.getByText("Segment coverage controls")).toBeInTheDocument();
        expect(screen.getByText("Narration recovery controls")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Hide all details" }));

        expect(screen.queryByText("Content embedding controls")).not.toBeInTheDocument();
        expect(screen.queryByText("Segment coverage controls")).not.toBeInTheDocument();
        expect(screen.queryByText("Narration recovery controls")).not.toBeInTheDocument();
    });
});
