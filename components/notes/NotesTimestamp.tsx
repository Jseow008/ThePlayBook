"use client";

import { useSyncExternalStore } from "react";
import { format } from "date-fns";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const utcFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    hour12: true, timeZone: "UTC",
});

export function NotesTimestamp({ createdAt }: { createdAt?: string | null }) {
    // Each streamed instance must match its server HTML on its first browser pass.
    const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
    const date = createdAt ? new Date(createdAt) : null;
    if (!date || Number.isNaN(date.getTime())) return <time>Saved passage</time>;

    return (
        <time dateTime={createdAt ?? undefined}>
            {hydrated ? format(date, "MMM d, h:mm a") : `${utcFormatter.format(date)} UTC`}
        </time>
    );
}
