'use client';
import Link from 'next/link';
import type { ChatSessionVerification } from '@/hooks/useVerifiedChatSession';

/** Readiness feedback only; recovery never submits a drafted question. */
export function ChatSessionStatus({ state, onRetry, initial = false }: {
    state: ChatSessionVerification;
    onRetry: () => void;
    initial?: boolean;
}) {
    if (state === 'verified') return null;
    return <div role="status" className="text-sm text-muted-foreground">
        {state === 'signed-out' ? <Link href="/login">Sign in to start a private chat.</Link>
            : state === 'checking' ? (initial ? 'Verifying your chat session…' : 'Checking your session…')
                : <>
                    <span>{state === 'slow' ? 'Your session check is taking longer than expected.' : 'Your session could not be checked. Check your connection and try again.'}</span>{' '}
                    <button type="button" onClick={onRetry} className="font-medium underline underline-offset-4">Check again</button>
                </>}
    </div>;
}
