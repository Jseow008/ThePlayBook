"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CitationResolutionSchema, type CitationResolution } from "@/lib/evidence-citation";
import { useVerifiedChatSession } from "@/hooks/useVerifiedChatSession";

const messages = {
    available: "This passage matches the evidence used in your answer.",
    changed: "This evidence has changed since your answer. Any personal extract below is the context used then, not the current version. Ask again for current evidence.",
    withdrawn: "The source is no longer available. Only your still-owned personal extract, if any, is shown.",
    unavailable: "This reference has expired, was removed, or is no longer accessible. Return to your answer and ask again for a current reference.",
};
export function EvidencePage() {
    const { ownerKey, isCurrent, resolved } = useVerifiedChatSession();
    const [token, setToken] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState<{ owner: string; data: CitationResolution } | null>(null);
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const requestGeneration = useRef(0);
    const activeRequest = useRef<AbortController | null>(null);
    const initialToken = useRef<string | null>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        const stored = window.history.state?.evidenceReference;
        const reference = initialToken.current ?? (window.location.hash.slice(1) || (typeof stored === "string" ? stored : ""));
        initialToken.current = reference;
        setToken(reference);
        // Keep only the opaque reference across reload/remount, never a data payload.
        window.history.replaceState({ ...window.history.state, evidenceReference: reference }, "", window.location.pathname);
    }, []);
    useEffect(() => {
        if (token === null || !ownerKey || !isCurrent(ownerKey)) return;
        const owner = ownerKey;
        const controller = new AbortController();
        activeRequest.current = controller;
        const generation = ++requestGeneration.current;
        setLoading(true); setFailed(false); setResult(null);
        void (async () => {
            try {
                const response = await fetch("/api/evidence/resolve", { method: "POST", credentials: "same-origin", cache: "no-store",
                    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
                if (!response.ok) throw new Error("Evidence could not be checked");
                const data = CitationResolutionSchema.parse(await response.json());
                if (!controller.signal.aborted && generation === requestGeneration.current && isCurrent(owner)) { setResult({ owner, data }); setLoading(false); heading.current?.focus(); }
            } catch {
                if (!controller.signal.aborted && generation === requestGeneration.current && isCurrent(owner)) { setFailed(true); setLoading(false); }
            }
        })();
        return () => controller.abort();
    }, [token, ownerKey, isCurrent, attempt]);
    useEffect(() => {
        const invalidate = () => { requestGeneration.current++; activeRequest.current?.abort(); setResult(null); };
        const recheck = () => { invalidate(); setAttempt((value) => value + 1); };
        const visibility = () => { if (document.visibilityState === "hidden") invalidate(); else recheck(); };
        window.addEventListener("focus", recheck);
        window.addEventListener("pageshow", recheck);
        document.addEventListener("visibilitychange", visibility);
        return () => {
            window.removeEventListener("focus", recheck);
            window.removeEventListener("pageshow", recheck);
            document.removeEventListener("visibilitychange", visibility);
        };
    }, []);
    const data = result && result.owner === ownerKey ? result.data : null;
    return <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight">Verified passage</h1>
        {!resolved ? <p role="status" className="mt-4 text-muted-foreground">Checking your session…</p>
            : !ownerKey ? <p role="status" className="mt-4">Sign in, then reopen this passage from your answer. <Link href="/login" className="text-primary underline">Sign in</Link></p>
                : <>
                    {loading && <p role="status" className="mt-4 text-muted-foreground">Checking access and evidence…</p>}
                    {failed && <div role="alert" className="mt-4"><p>We could not check this passage. Please retry.</p>
                        <button onClick={() => setAttempt((value) => value + 1)} className="mt-3 rounded-md border border-border px-4 py-2 focus-visible:outline focus-visible:outline-2">Retry</button></div>}
                    {data && <section className="mt-6 space-y-5" aria-label="Verified evidence">
                        <p role="status" className="text-sm text-muted-foreground">{messages[data.state]}</p>
                        {data.title && <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{data.title}</h2>}
                        {data.passages?.map((passage, index) => <section key={index} className="rounded-xl border border-border bg-card p-4 sm:p-6">
                            <h3 className="mb-3 text-sm font-medium">{passage.label}</h3>
                            <p className="whitespace-pre-wrap leading-7 [overflow-wrap:anywhere]">{passage.before}
                                <mark className="bg-primary/15 text-foreground">{passage.text}</mark>{passage.after}</p>
                        </section>)}
                        {data.sourceHref && <Link href={data.sourceHref} className="inline-block text-primary underline underline-offset-4">Read source</Link>}
                    </section>}
                </>}
    </div>;
}
