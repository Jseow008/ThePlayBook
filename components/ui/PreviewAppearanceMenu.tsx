"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, SunMoon, X } from "lucide-react";
import { useReaderSettings, type ReaderTheme } from "@/hooks/useReaderSettings";
import { useOverlayInteractions } from "@/hooks/useOverlayInteractions";
import { cn } from "@/lib/utils";

// Match the reader's Theme row without exposing its reading-only controls.
const themes: { value: ReaderTheme; label: string; preview: string }[] = [
    { value: "light", label: "Light", preview: "bg-[hsl(0,0%,98%)] border-gray-300" },
    { value: "sepia", label: "Sepia", preview: "bg-[hsl(36,33%,94%)] border-amber-300" },
    { value: "dark", label: "Dark", preview: "bg-[hsl(240,10%,3.9%)] border-zinc-600" },
];

export function PreviewAppearanceMenu() {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const id = useId();
    const theme = useReaderSettings((state) => state.readerTheme);
    const setTheme = useReaderSettings((state) => state.setReaderTheme);

    useOverlayInteractions({
        enabled: open,
        containerRef: panelRef,
        initialFocusRef: closeRef,
        restoreFocusRef: triggerRef,
        preventInitialFocusScroll: true,
        onEscape: () => setOpen(false),
    });

    useEffect(() => {
        if (!open) return;
        const dismissOutside = (event: PointerEvent) => {
            if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("pointerdown", dismissOutside);
        return () => document.removeEventListener("pointerdown", dismissOutside);
    }, [open]);

    return (
        <div className="relative" ref={rootRef}>
            <button
                ref={triggerRef}
                type="button"
                aria-expanded={open}
                aria-controls={`${id}-panel`}
                aria-haspopup="dialog"
                onClick={() => setOpen((value) => !value)}
                className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground sm:min-h-9"
            >
                <SunMoon aria-hidden="true" className="size-4" />
                Appearance
                <ChevronDown aria-hidden="true" className="size-3.5" />
            </button>
            {open && (
                <div
                    ref={panelRef}
                    id={`${id}-panel`}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={`${id}-title`}
                    aria-describedby={`${id}-description`}
                    className="absolute right-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2.5rem))] rounded-xl border border-border bg-background p-4 text-foreground shadow-2xl"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <h2 id={`${id}-title`} className="text-sm font-semibold">Appearance</h2>
                        <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close Appearance" className="focus-ring -mr-2 inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground sm:size-8">
                            <X aria-hidden="true" className="size-4" />
                        </button>
                    </div>
                    <span id={`${id}-theme`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Theme</span>
                    <div role="group" aria-labelledby={`${id}-theme`} className="mt-2 grid grid-cols-3 gap-2">
                        {themes.map((option) => (
                            <button key={option.value} type="button" aria-pressed={theme === option.value} onClick={() => setTheme(option.value)} className={cn(
                                "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                                theme === option.value ? "border-primary text-primary ring-1 ring-primary" : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                            )}>
                                <span aria-hidden="true" className={cn("h-5 w-8 rounded border", option.preview)} />
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <p id={`${id}-description`} className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">Applies to Preview and the reader.</p>
                </div>
            )}
        </div>
    );
}
