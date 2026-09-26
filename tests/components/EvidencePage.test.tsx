import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { EvidencePage } from "@/app/(public)/evidence/client-page";
import { EvidenceCitations } from "@/components/evidence/EvidenceCitations";
const identity = vi.hoisted(() => ({ ownerKey: "account:session" as string | null, valid: true }));
const isCurrent = (key: string) => identity.valid && identity.ownerKey === key;
vi.mock("@/hooks/useVerifiedChatSession", () => ({ useVerifiedChatSession: () => ({ ownerKey: identity.ownerKey, isCurrent, resolved: true }) }));
const fetcher = vi.fn<typeof fetch>();
const result = { state: "available", title: "Source", passages: [{ label: "Your note", text: '<script>Exact 🌱 **words**</script>', before: "before ", after: " after" }], sourceHref: "/read/11111111-1111-4111-8111-111111111111" };
beforeEach(() => { identity.ownerKey = "account:session"; identity.valid = true; fetcher.mockReset(); vi.stubGlobal("fetch", fetcher); window.history.replaceState(null, "", "/evidence#opaque"); });
afterEach(() => vi.unstubAllGlobals());
it("survives StrictMode, marks literal text and removes the token from the address bar", async () => {
    fetcher.mockImplementation(async () => Response.json(result));
    render(<StrictMode><EvidencePage /></StrictMode>);
    expect(await screen.findByText(result.passages[0].text)).toHaveProperty("tagName", "MARK");
    expect(document.querySelector("main script")).toBeNull(); expect(window.location.hash).toBe("");
    for (const [, options] of fetcher.mock.calls) expect(JSON.parse(String(options?.body))).toEqual({ token: "opaque" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
});
it("ignores delayed responses after account changes and clears displayed content on logout", async () => {
    let complete!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; })).mockResolvedValue(Response.json({ state: "unavailable" }));
    const { rerender } = render(<EvidencePage />);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    identity.ownerKey = "other:session"; rerender(<EvidencePage />);
    await act(async () => complete(Response.json(result)));
    expect(screen.queryByText(result.passages[0].text)).not.toBeInTheDocument();
    identity.ownerKey = null; rerender(<EvidencePage />);
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
});
it("gives a retryable failure distinct from withdrawn evidence and rechecks on return", async () => {
    fetcher.mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValue(Response.json({ state: "withdrawn" }));
    render(<EvidencePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/source is no longer available/)).toBeInTheDocument();
    const calls = fetcher.mock.calls.length;
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(calls));
});
it("labels keyboard-accessible citation links and new-tab behavior", () => {
    render(<EvidenceCitations citations={[{ label: "Your note", href: "/evidence#opaque" }]} />);
    const link = screen.getByRole("link", { name: /Your note.*opens in a new tab/ });
    link.focus(); expect(link).toHaveFocus(); expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

it("rejects a response delivered after the page becomes hidden", async () => {
    let complete!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    render(<EvidencePage />);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => complete(Response.json(result)));
    expect(screen.queryByText(result.passages[0].text)).not.toBeInTheDocument();
    visibility.mockRestore();
});
