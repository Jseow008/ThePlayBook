"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bookmark, Check, Compass, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/ResilientImage";
import { APP_ONBOARDING_TOUR_KEY, APP_ONBOARDING_VERSION } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/client";

export interface WelcomeContentItem {
    id: string;
    title: string;
    author: string | null;
    category: string | null;
    cover_image_url: string | null;
    type: string;
}

interface WelcomeActivationProps {
    items: WelcomeContentItem[];
    nextUrl: string;
    preview?: boolean;
}

const INTERESTS = ["Psychology", "Business", "Creativity", "Health", "Philosophy", "Technology"] as const;
const MIN_SAVED_ITEMS = 3;
const ASK_PROMPT = "What themes connect the summaries I just saved?";

export function WelcomeActivation({ items, nextUrl, preview = false }: WelcomeActivationProps) {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [interests, setInterests] = useState<string[]>([]);
    const [savedIds, setSavedIds] = useState<string[]>([]);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [isFinishing, setIsFinishing] = useState(false);

    const suggestedItems = useMemo(() => {
        const normalizedInterests = interests.map((interest) => interest.toLowerCase());
        const matchingItems = items.filter((item) =>
            normalizedInterests.some((interest) => item.category?.toLowerCase().includes(interest))
        );
        const remainingItems = items.filter((item) => !matchingItems.some((match) => match.id === item.id));
        return [...matchingItems, ...remainingItems].slice(0, 9);
    }, [interests, items]);

    const toggleInterest = (interest: string) => {
        setInterests((current) => {
            if (current.includes(interest)) return current.filter((item) => item !== interest);
            if (current.length === 4) return current;
            return [...current, interest];
        });
    };

    const completeActivation = async (destination: string) => {
        if (preview) {
            toast.success("Preview complete. No changes were saved.");
            return;
        }

        setIsFinishing(true);

        try {
            const supabase = createClient();
            const { error } = await supabase.rpc("set_onboarding_state", {
                p_tour: APP_ONBOARDING_TOUR_KEY,
                p_version: APP_ONBOARDING_VERSION,
                p_status: "completed",
            } as never);

            if (error) {
                console.error("Failed to complete activation", error);
                toast.error("We couldn't save your progress. Please try again.");
                return;
            }

            router.replace(destination);
        } catch (error) {
            console.error("Failed to complete activation", error);
            toast.error("We couldn't save your progress. Please try again.");
        } finally {
            setIsFinishing(false);
        }
    };

    const saveItem = async (item: WelcomeContentItem) => {
        if (savedIds.includes(item.id) || savingId) return;

        if (preview) {
            setSavedIds((current) => [...current, item.id]);
            return;
        }

        setSavingId(item.id);

        try {
            const response = await fetch("/api/library/bookmarks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content_item_id: item.id }),
            });

            if (!response.ok) throw new Error("Failed to save item");
            setSavedIds((current) => [...current, item.id]);
        } catch (error) {
            console.error("Failed to save welcome item", error);
            toast.error("We couldn't save that summary. Please try again.");
        } finally {
            setSavingId(null);
        }
    };

    const renderStep = () => {
        if (step === 1) {
            return (
                <>
                    <StepHeading
                        eyebrow="Start with your interests"
                        title="What do you want to explore?"
                        description="Choose two to four topics. We’ll use them to give your library a useful beginning."
                    />
                    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {INTERESTS.map((interest) => {
                            const selected = interests.includes(interest);
                            return (
                                <button
                                    key={interest}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => toggleInterest(interest)}
                                    className={`rounded-xl border px-4 py-4 text-sm font-medium transition-colors ${selected
                                        ? "border-primary bg-primary/12 text-primary"
                                        : "border-border/60 bg-card/35 text-foreground hover:border-primary/45 hover:bg-card/60"
                                        }`}
                                >
                                    {interest}
                                    {selected && <Check className="ml-2 inline h-3.5 w-3.5" />}
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-4 text-center text-xs text-muted-foreground">{interests.length}/4 selected · Choose at least 2</p>
                    <StepActions
                        primaryLabel="See your starter shelf"
                        onPrimary={() => setStep(2)}
                        primaryDisabled={interests.length < 2}
                        onSkip={() => void completeActivation(nextUrl)}
                        isFinishing={isFinishing}
                    />
                </>
            );
        }

        if (step === 2) {
            return (
                <>
                    <StepHeading
                        eyebrow="Build your starter shelf"
                        title="Save a few ideas to return to."
                        description="Choose at least three summaries. They’ll become the starting point for Ask My Library."
                    />
                    {suggestedItems.length > 0 ? (
                        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {suggestedItems.map((item) => {
                                const saved = savedIds.includes(item.id);
                                const isSaving = savingId === item.id;
                                return (
                                    <article key={item.id} className="flex gap-3 rounded-xl border border-border/55 bg-card/30 p-3 text-left sm:block">
                                        <div className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-primary sm:h-24 sm:w-full">
                                            {item.cover_image_url ? <ResilientImage src={item.cover_image_url} alt="" fill sizes="(max-width: 640px) 48px, 260px" className="object-cover" surface="content-card" /> : <Compass className="h-5 w-5" />}
                                        </div>
                                        <div className="min-w-0 flex-1 sm:mt-3">
                                            <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                                            <p className="mt-1 truncate text-xs text-muted-foreground">{item.author || item.category || item.type}</p>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={saved ? "secondary" : "outline"}
                                                className="mt-3 h-8 w-full text-xs"
                                                onClick={() => void saveItem(item)}
                                                disabled={saved || Boolean(savingId)}
                                            >
                                                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <><Check className="mr-1.5 h-3.5 w-3.5" />Saved</> : <><Bookmark className="mr-1.5 h-3.5 w-3.5" />Save</>}
                                            </Button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="mt-8 rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                            Your starter shelf is being prepared. You can explore the full library for now.
                        </p>
                    )}
                    <p className="mt-4 text-center text-xs text-muted-foreground">{savedIds.length}/{MIN_SAVED_ITEMS} saved</p>
                    <StepActions
                        primaryLabel="Try Ask My Library"
                        onPrimary={() => setStep(3)}
                        primaryDisabled={savedIds.length < MIN_SAVED_ITEMS}
                        secondaryLabel="Back"
                        onSecondary={() => setStep(1)}
                        onSkip={() => void completeActivation(nextUrl)}
                        isFinishing={isFinishing}
                    />
                </>
            );
        }

        return (
            <>
                <StepHeading
                    eyebrow="Make it useful"
                    title="Ask your library a better question."
                    description="Your first saved summaries are ready. Start by looking for the idea that connects them."
                />
                <div className="mt-8 rounded-xl border border-primary/25 bg-primary/8 p-5 text-left">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <p className="mt-4 text-sm font-medium leading-6 text-foreground">“{ASK_PROMPT}”</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">We’ll place this in Ask My Library so you can review it before sending.</p>
                </div>
                <StepActions
                    primaryLabel="Open Ask My Library"
                    onPrimary={() => void completeActivation(`/ask?prompt=${encodeURIComponent(ASK_PROMPT)}`)}
                    secondaryLabel="Back"
                    onSecondary={() => setStep(2)}
                    onSkip={() => void completeActivation(nextUrl)}
                    isFinishing={isFinishing}
                />
            </>
        );
    };

    return (
        <div className="min-h-screen bg-background px-4 py-8 sm:flex sm:items-center sm:justify-center sm:py-12">
            <section className="mx-auto w-full max-w-3xl rounded-2xl border border-border/50 bg-card/35 p-6 shadow-sm backdrop-blur-sm sm:p-9">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Compass className="h-5 w-5" /></div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step {step} of 3</p>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2" aria-label={`Step ${step} of 3`}>
                    {[1, 2, 3].map((item) => <span key={item} className={`h-1 rounded-full ${item <= step ? "bg-primary" : "bg-border/70"}`} />)}
                </div>
                {renderStep()}
            </section>
        </div>
    );
}

function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
    return (
        <div className="mt-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
        </div>
    );
}

function StepActions({ primaryLabel, onPrimary, primaryDisabled, secondaryLabel, onSecondary, onSkip, isFinishing }: {
    primaryLabel: string;
    onPrimary: () => void;
    primaryDisabled?: boolean;
    secondaryLabel?: string;
    onSecondary?: () => void;
    onSkip: () => void;
    isFinishing: boolean;
}) {
    return (
        <div className="mt-8 flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-2">
                {secondaryLabel && <Button type="button" variant="ghost" onClick={onSecondary} disabled={isFinishing}>{secondaryLabel}</Button>}
                <Button type="button" variant="ghost" className="text-muted-foreground" onClick={onSkip} disabled={isFinishing}>Skip for now</Button>
            </div>
            <Button type="button" className="h-11 w-full bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto" onClick={onPrimary} disabled={primaryDisabled || isFinishing}>
                {isFinishing ? "Preparing your library…" : primaryLabel}
                {!isFinishing && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
        </div>
    );
}
