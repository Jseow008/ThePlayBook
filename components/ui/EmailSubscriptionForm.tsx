"use client";

import { useId, useState } from "react";
import { track } from "@vercel/analytics";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type EmailSubscriptionSource = "landing_final_cta";

interface EmailSubscriptionFormProps {
  source: EmailSubscriptionSource;
  className?: string;
  align?: "left" | "center";
  title?: string;
  description?: string;
}

type SubmitState = "idle" | "submitting" | "success" | "error";

export function EmailSubscriptionForm({
  source,
  className,
  align = "left",
  title = "Get the best ideas from non-fiction, weekly.",
  description = "A short email with useful ideas to remember, revisit, and apply.",
}: EmailSubscriptionFormProps) {
  const emailInputId = useId();
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setSubmitState("error");
      setMessage("Enter your email address.");
      return;
    }

    setSubmitState("submitting");
    setMessage(null);

    try {
      const response = await fetch("/api/email-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          source,
          page_path: window.location.pathname,
          referrer: document.referrer,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        const apiMessage = result?.error?.message;
        throw new Error(typeof apiMessage === "string" ? apiMessage : "Could not save your subscription.");
      }

      track("Email Subscription Created", { source });
      setSubmitState("success");
      setMessage("You're subscribed. We'll send the weekly best ideas soon.");
      setEmail("");
    } catch (error) {
      setSubmitState("error");
      setMessage(error instanceof Error ? error.message : "Could not save your subscription. Please try again.");
    }
  }

  const isSubmitting = submitState === "submitting";
  const isSuccess = submitState === "success";

  return (
    <div
      className={cn(
        "max-w-xl",
        align === "center" && "mx-auto text-center",
        className
      )}
    >
      <div className="space-y-2">
        <h3 className="text-base font-semibold leading-6 text-white">{title}</h3>
        <p className="text-sm leading-6 text-zinc-400">{description}</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className={cn(
          "mt-5 flex flex-col gap-3 sm:flex-row",
          align === "center" && "sm:justify-center"
        )}
      >
        <label htmlFor={emailInputId} className="sr-only">
          Email address
        </label>
        <input
          id={emailInputId}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={isSubmitting || isSuccess}
          className="focus-ring min-h-12 w-full rounded-full border border-white/10 bg-[rgb(var(--landing-surface-rgb)_/_0.5)] px-5 text-base text-white outline-none transition-[border-color,background-color,box-shadow] duration-300 placeholder:text-zinc-500 hover:border-white/18 focus:border-white/35 disabled:cursor-not-allowed disabled:opacity-70 sm:max-w-xs"
        />
        <button
          type="submit"
          disabled={isSubmitting || isSuccess}
          className="focus-ring group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-18px_rgba(255,255,255,0.45)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-80"
        >
          {isSubmitting ? "Subscribing..." : isSuccess ? "Subscribed" : "Subscribe"}
          {isSuccess ? (
            <Check className="size-4" />
          ) : (
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </form>

      <div
        role="status"
        aria-live="polite"
        className={cn(
          "mt-3 min-h-5 text-sm leading-5",
          submitState === "error" ? "text-red-300" : "text-zinc-400"
        )}
      >
        {message}
      </div>
    </div>
  );
}
