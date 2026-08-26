"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/ResilientImage";
import {
  APP_ONBOARDING_TOUR_KEY,
  APP_ONBOARDING_VERSION,
  WELCOME_PERSONALIZATION_TOUR_KEY,
  WELCOME_PERSONALIZATION_VERSION,
} from "@/lib/onboarding";
import {
  ONBOARDING_TOPICS,
  ONBOARDING_TOPIC_MAX_SELECTIONS,
  ONBOARDING_TOPIC_MIN_SELECTIONS,
  type OnboardingTopicKey,
} from "@/lib/onboarding-topics";
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
  initialTopicKeys?: OnboardingTopicKey[];
  items?: WelcomeContentItem[];
  nextUrl: string;
  preview?: boolean;
}
const MIN_SAVED_ITEMS = 3;

export function WelcomeActivation({
  initialTopicKeys = [],
  items: initialItems = [],
  nextUrl,
  preview = false,
}: WelcomeActivationProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [topicKeys, setTopicKeys] =
    useState<OnboardingTopicKey[]>(initialTopicKeys);
  const [items, setItems] = useState(initialItems);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [isLoadingShelf, setIsLoadingShelf] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  const toggleTopic = (topicKey: OnboardingTopicKey) =>
    setTopicKeys((current) => {
      if (current.includes(topicKey))
        return current.filter((key) => key !== topicKey);
      return current.length === ONBOARDING_TOPIC_MAX_SELECTIONS
        ? current
        : [...current, topicKey];
    });

  const saveTopicsAndLoadShelf = async () => {
    if (topicKeys.length < ONBOARDING_TOPIC_MIN_SELECTIONS) return;
    if (preview) {
      setStep(2);
      return;
    }
    setIsLoadingShelf(true);
    try {
      const preferences = await fetch("/api/onboarding/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicKeys }),
      });
      if (!preferences.ok) throw new Error("Unable to save topics");
      const response = await fetch(
        `/api/onboarding/starter-content?topics=${encodeURIComponent(topicKeys.join(","))}`,
      );
      if (!response.ok) throw new Error("Unable to load starter shelf");
      const payload = (await response.json()) as {
        items: WelcomeContentItem[];
      };
      setItems(payload.items);
      setStep(2);
    } catch (error) {
      console.error("Failed to prepare welcome shelf", error);
      toast.error("We couldn't prepare your starter shelf. Please try again.");
    } finally {
      setIsLoadingShelf(false);
    }
  };

  const finish = async () => {
    if (preview) {
      toast.success("Preview complete. No changes were saved.");
      return;
    }
    setIsFinishing(true);
    try {
      const supabase = createClient();
      const results = await Promise.all([
        supabase.rpc("set_onboarding_state", {
          p_tour: WELCOME_PERSONALIZATION_TOUR_KEY,
          p_version: WELCOME_PERSONALIZATION_VERSION,
          p_status: "completed",
        } as never),
        supabase.rpc("set_onboarding_state", {
          p_tour: APP_ONBOARDING_TOUR_KEY,
          p_version: APP_ONBOARDING_VERSION,
          p_status: "completed",
        } as never),
      ]);
      if (results.some(({ error }) => error))
        throw new Error("Unable to save onboarding state");
      router.replace(nextUrl);
    } catch (error) {
      console.error("Failed to complete activation", error);
      toast.error("We couldn't save your progress. Please try again.");
    } finally {
      setIsFinishing(false);
    }
  };

  const toggleSavedItem = async (item: WelcomeContentItem) => {
    if (savingId) return;
    const isSaved = savedIds.includes(item.id);
    if (preview) {
      setSavedIds((current) =>
        isSaved
          ? current.filter((savedId) => savedId !== item.id)
          : [...current, item.id],
      );
      return;
    }
    setSavingId(item.id);
    try {
      const response = await fetch("/api/library/bookmarks", {
        method: isSaved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_item_id: item.id }),
      });
      if (!response.ok) throw new Error("Failed to update saved item");
      setSavedIds((current) =>
        isSaved
          ? current.filter((savedId) => savedId !== item.id)
          : [...current, item.id],
      );
    } catch (error) {
      console.error("Failed to update welcome item", error);
      toast.error("We couldn't update that summary. Please try again.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:flex sm:items-center sm:justify-center sm:py-12">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-border/50 bg-card/35 p-6 shadow-sm backdrop-blur-sm sm:p-9">
        <div className="flex justify-end">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Step {step} of 2
          </p>
        </div>
        <div
          className="mt-5 grid grid-cols-2 gap-2"
          aria-label={`Step ${step} of 2`}
        >
          {[1, 2].map((item) => (
            <span
              key={item}
              className={`h-1 rounded-full ${item <= step ? "bg-primary" : "bg-border/70"}`}
            />
          ))}
        </div>
        {step === 1 ? (
          <>
            <StepHeading
              eyebrow="Personalize your library"
              title="What are you interested in?"
              description={`Choose ${ONBOARDING_TOPIC_MIN_SELECTIONS} to ${ONBOARDING_TOPIC_MAX_SELECTIONS} topics. We’ll use them to shape your first recommendations.`}
            />
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ONBOARDING_TOPICS.map((topic) => {
                const selected = topicKeys.includes(topic.key);
                return (
                  <button
                    key={topic.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleTopic(topic.key)}
                    className={`rounded-xl border px-4 py-4 text-sm font-medium transition-all duration-200 ${selected ? "border-primary bg-primary/20 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_10px_24px_hsl(var(--primary)/0.12)]" : "border-border/60 bg-card/35 text-foreground hover:border-primary/45 hover:bg-card/60"}`}
                  >
                    {topic.label}
                    {selected && (
                      <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground align-middle">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              {topicKeys.length}/{ONBOARDING_TOPIC_MAX_SELECTIONS} selected ·
              Choose at least {ONBOARDING_TOPIC_MIN_SELECTIONS}
            </p>
            <div className="mt-8 flex justify-end">
              <Button
                type="button"
                className="h-11 bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90"
                onClick={() => void saveTopicsAndLoadShelf()}
                disabled={
                  topicKeys.length < ONBOARDING_TOPIC_MIN_SELECTIONS ||
                  isLoadingShelf
                }
              >
                {isLoadingShelf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Build your starter shelf{" "}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <StepHeading
              eyebrow="Build your starter shelf"
              title="Save a few ideas to return to."
              description="Based on your selected topics. Pick three summaries to make your library useful from the start, or skip and explore on your own."
            />
            {items.length > 0 ? (
              <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {items.map((item) => {
                  const saved = savedIds.includes(item.id);
                  const isSaving = savingId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={saved}
                      aria-label={`${saved ? "Remove" : "Save"} ${item.title} ${saved ? "from" : "to"} your library`}
                      className={`relative flex w-full gap-3 rounded-xl border p-3 text-left transition-all duration-200 sm:block ${saved ? "border-primary bg-primary/15 shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_10px_24px_hsl(var(--primary)/0.1)]" : "border-border/55 bg-card/30 hover:border-primary/45 hover:bg-card/50"}`}
                      onClick={() => void toggleSavedItem(item)}
                      disabled={Boolean(savingId)}
                    >
                      <div className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/45 sm:h-24 sm:w-full">
                        {item.cover_image_url ? (
                          <ResilientImage
                            src={item.cover_image_url}
                            alt=""
                            fill
                            sizes="(max-width: 640px) 48px, 260px"
                            className="object-cover"
                            surface="content-card"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 sm:mt-3">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {item.title}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {item.author || item.category || item.type}
                        </p>
                        <p
                          className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${saved ? "text-primary" : "text-muted-foreground"}`}
                        >
                          {isSaving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : saved ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : null}
                          {isSaving
                            ? saved
                              ? "Removing…"
                              : "Saving…"
                            : saved
                              ? "Selected · click to remove"
                              : "Select to save"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-8 rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                Your starter shelf is being prepared. You can explore the
                library for now.
              </p>
            )}
            <p className="mt-4 text-center text-xs text-muted-foreground">
              {savedIds.length}/{MIN_SAVED_ITEMS} saved
            </p>
            <div className="mt-8 flex flex-col-reverse items-center justify-end gap-3 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => void finish()}
                disabled={isFinishing}
              >
                Skip for now
              </Button>
              <Button
                type="button"
                className="h-11 w-full bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
                onClick={() => void finish()}
                disabled={savedIds.length < MIN_SAVED_ITEMS || isFinishing}
              >
                {isFinishing ? (
                  "Preparing your library…"
                ) : (
                  <>
                    Explore your library <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function StepHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mt-8 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
        {description}
      </p>
    </div>
  );
}
