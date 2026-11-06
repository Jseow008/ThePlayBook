import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { RequestBoard } from "@/components/requests/RequestBoard";
import RequestsPage from "@/app/(public)/requests/page";

const { authUser, fetchMock } = vi.hoisted(() => ({
    authUser: { value: null as { id: string } | null },
    fetchMock: vi.fn(),
}));

vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: () => authUser.value }));
vi.mock("@/components/ui/SignInLink", () => ({
    SignInLink: ({ children, onClick, ...props }: ComponentPropsWithoutRef<"a"> & { children: ReactNode }) => (
        <a {...props} href="/login?next=%2Frequests" onClick={(event) => {
            onClick?.(event);
            event.preventDefault();
        }}>{children}</a>
    ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function deferredResponse() {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Response>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function completedResponse(duplicate: boolean, title = "Completed request A") {
    return new Response(JSON.stringify({ data: { duplicate, request: { title } } }), {
        status: duplicate ? 200 : 201,
        headers: { "Content-Type": "application/json" },
    });
}

function enterRequest(title = "Request A", creator = "Creator A", format = "book") {
    fireEvent.change(screen.getByRole("combobox", { name: "Format" }), { target: { value: format } });
    fireEvent.change(screen.getByPlaceholderText("Paste a URL or type a title by author"), { target: { value: title } });
    fireEvent.change(screen.getByPlaceholderText("Optional"), { target: { value: creator } });
}

describe("RequestBoard sign-in return", () => {
    beforeEach(() => {
        authUser.value = null;
        window.sessionStorage.clear();
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });

    it.each(["book", "video", "podcast"])("requires an explicit format after a %s Search handoff", async (type) => {
        render(await RequestsPage({ searchParams: Promise.resolve({ prefill: "Requested source", type }) }));

        const format = screen.getByRole("combobox", { name: "Format" });
        expect(format).toHaveValue("");
        expect(screen.getByRole("option", { name: "Please Select" })).toHaveValue("");
        expect(format).toBeInvalid();
        expect(screen.getByPlaceholderText("Paste a URL or type a title by author")).toHaveValue("Requested source");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("restores the entered request after sign-in and clears it only after submission", async () => {
        const view = render(<RequestBoard />);
        fireEvent.change(screen.getByRole("combobox", { name: "Format" }), { target: { value: "book" } });
        fireEvent.change(screen.getByPlaceholderText("Paste a URL or type a title by author"), { target: { value: "A requested book" } });
        fireEvent.change(screen.getByPlaceholderText("Optional"), { target: { value: "A writer" } });
        fireEvent.click(screen.getByRole("link", { name: "Sign in to submit" }));

        expect(JSON.parse(window.sessionStorage.getItem("netflux_request_draft:v1")!)).toEqual({
            returnPath: `${window.location.pathname}${window.location.search}`,
            input: "A requested book",
            author: "A writer",
            contentType: "book",
        });

        view.unmount();
        authUser.value = { id: "reader-1" };
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ data: { duplicate: false } }),
        });
        render(<RequestBoard />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText("Paste a URL or type a title by author")).toHaveValue("A requested book");
        });
        expect(screen.getByPlaceholderText("Optional")).toHaveValue("A writer");
        expect(screen.getByRole("combobox", { name: "Format" })).toHaveValue("book");
        expect(fetchMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            input: "A requested book",
            author: "A writer",
            content_type: "book",
        });
        await waitFor(() => expect(window.sessionStorage.getItem("netflux_request_draft:v1")).toBeNull());
    });

    it.each([false, true])("clears only an unchanged submitted form after duplicate=%s and names its returned title", async (duplicate) => {
        authUser.value = { id: "reader-1" };
        const pending = deferredResponse();
        fetchMock.mockReturnValueOnce(pending.promise);
        render(<RequestBoard />);
        enterRequest("https://example.com/source-a");
        fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
        expect(screen.getByRole("button", { name: "Submit request" })).toBeDisabled();

        await act(async () => pending.resolve(completedResponse(duplicate)));

        expect(screen.getByPlaceholderText("Paste a URL or type a title by author")).toHaveValue("");
        expect(screen.getByPlaceholderText("Optional")).toHaveValue("");
        expect(screen.getByText("Completed request A")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Completed request A");
        expect(screen.getByText(duplicate ? "We already have this request." : "Request received.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Submit request" })).toBeEnabled();
    });

    it.each([false, true])("retains exact newer edits unsaved after duplicate=%s and keeps the confirmation attached to A", async (duplicate) => {
        authUser.value = { id: "reader-1" };
        const pending = deferredResponse();
        fetchMock.mockReturnValueOnce(pending.promise);
        render(<RequestBoard />);
        enterRequest();
        fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
        enterRequest("Newer request B — exact text", "Creator B", "video");
        fireEvent.submit(screen.getByRole("button", { name: "Submit request" }).closest("form")!);
        expect(fetchMock).toHaveBeenCalledOnce();

        await act(async () => pending.resolve(completedResponse(duplicate)));

        expect(screen.getByPlaceholderText("Paste a URL or type a title by author")).toHaveValue("Newer request B — exact text");
        expect(screen.getByPlaceholderText("Optional")).toHaveValue("Creator B");
        expect(screen.getByRole("combobox", { name: "Format" })).toHaveValue("video");
        expect(screen.getByText("Completed request A")).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ input: "Request A", author: "Creator A", content_type: "book" });
        expect(window.sessionStorage.getItem("netflux_request_draft:v1")).toBeNull();
        expect(screen.getByRole("button", { name: "Submit request" })).toBeEnabled();
    });

    it.each(["title", "creator", "format"])("preserves the whole current form when only %s changes while pending", async (field) => {
        authUser.value = { id: "reader-1" };
        const pending = deferredResponse();
        fetchMock.mockReturnValueOnce(pending.promise);
        render(<RequestBoard />);
        enterRequest();
        fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
        if (field === "title") fireEvent.change(screen.getByPlaceholderText("Paste a URL or type a title by author"), { target: { value: "Request B" } });
        if (field === "creator") fireEvent.change(screen.getByPlaceholderText("Optional"), { target: { value: "Creator B" } });
        if (field === "format") fireEvent.change(screen.getByRole("combobox", { name: "Format" }), { target: { value: "video" } });

        await act(async () => pending.resolve(completedResponse(false)));

        expect(screen.getByPlaceholderText("Paste a URL or type a title by author")).toHaveValue(field === "title" ? "Request B" : "Request A");
        expect(screen.getByPlaceholderText("Optional")).toHaveValue(field === "creator" ? "Creator B" : "Creator A");
        expect(screen.getByRole("combobox", { name: "Format" })).toHaveValue(field === "format" ? "video" : "book");
    });

    it.each(["validation", "server", "network"])("retains newer text after %s failure and sends it only on explicit retry", async (failure) => {
        authUser.value = { id: "reader-1" };
        const pending = deferredResponse();
        fetchMock.mockReturnValueOnce(pending.promise);
        render(<RequestBoard />);
        enterRequest();
        fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
        enterRequest("Unsent B", "Creator B", "video");
        await act(async () => {
            if (failure === "network") pending.reject(new Error("Failed to fetch"));
            else pending.resolve(new Response(JSON.stringify({ error: { message: "Try again later." } }), { status: failure === "validation" ? 422 : 503 }));
        });

        expect(screen.getByPlaceholderText("Paste a URL or type a title by author")).toHaveValue("Unsent B");
        expect(screen.getByPlaceholderText("Optional")).toHaveValue("Creator B");
        expect(screen.getByRole("combobox", { name: "Format" })).toHaveValue("video");
        expect(screen.queryByText("Completed request A")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Submit request" })).toBeEnabled();
        expect(fetchMock).toHaveBeenCalledOnce();

        fetchMock.mockResolvedValueOnce(completedResponse(false, "Completed request B"));
        fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
        await screen.findByText("Completed request B");
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ input: "Unsent B", author: "Creator B", content_type: "video" });
        expect(screen.getByPlaceholderText("Paste a URL or type a title by author")).toHaveValue("");
    });
});
