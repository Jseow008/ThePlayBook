"use client";

import { useEffect, useRef, useState } from "react";

const VISITOR_ID_STORAGE_KEY = "flux_reader_visitor_id";
const HEARTBEAT_BATCH_SECONDS = 60;

function getOrCreateVisitorId() {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const existing = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);
        if (existing) {
            return existing;
        }

        const visitorId = window.crypto?.randomUUID?.() ?? crypto.randomUUID();
        window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, visitorId);
        return visitorId;
    } catch {
        return null;
    }
}

/**
 * Hook to track reading time and send heartbeats to the server.
 * Tracks time only when the window is focused and user is "active" (optional).
 */
export function useReadingTimer(contentId?: string) {
    const [secondsRead, setSecondsRead] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const pendingSecondsRef = useRef(0);
    const trackingEnabledRef = useRef(true);
    const heartbeatInFlightRef = useRef(false);

    useEffect(() => {
        if (!contentId) return;

        const startTimer = () => {
            if (intervalRef.current) return;

            intervalRef.current = setInterval(() => {
                if (document.visibilityState === 'visible') {
                    setSecondsRead(prev => prev + 1);
                    pendingSecondsRef.current += 1;

                    if (pendingSecondsRef.current >= HEARTBEAT_BATCH_SECONDS) {
                        void sendHeartbeat();
                    }
                }
            }, 1000);
        };

        const stopTimer = () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };

        const sendHeartbeat = async (flushShortSession = false) => {
            if (!trackingEnabledRef.current || heartbeatInFlightRef.current) return;

            const toSend = pendingSecondsRef.current;

            if (toSend === 0) return;

            if (toSend < HEARTBEAT_BATCH_SECONDS && !flushShortSession) {
                return;
            }

            heartbeatInFlightRef.current = true;
            try {
                const visitorId = getOrCreateVisitorId();
                pendingSecondsRef.current = 0;
                const payload: {
                    duration_seconds: number;
                    content_id: string;
                    visitor_id?: string;
                } = {
                    duration_seconds: toSend,
                    content_id: contentId,
                };

                if (visitorId) {
                    payload.visitor_id = visitorId;
                }

                const response = await fetch('/api/activity/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true, // Ensure request survives page unload
                    body: JSON.stringify(payload)
                });

                if (response.status === 401 || response.status === 403) {
                    trackingEnabledRef.current = false;
                    return;
                }

                if (!response.ok) {
                    throw new Error(`Failed to log activity (${response.status})`);
                }
            } catch (error) {
                console.error("Failed to send reading heartbeat", error);
                pendingSecondsRef.current += toSend;
            } finally {
                heartbeatInFlightRef.current = false;
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                startTimer();
            } else {
                stopTimer();
                void sendHeartbeat();
            }
        };

        const flushSession = () => {
            stopTimer();
            void sendHeartbeat(true);
        };

        startTimer();

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', flushSession);
        window.addEventListener('beforeunload', flushSession);

        return () => {
            stopTimer();
            flushSession();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', flushSession);
            window.removeEventListener('beforeunload', flushSession);
        };
    }, [contentId]);

    return { secondsRead, formattedTime: formatTime(secondsRead) };
}

/**
 * Helper to format seconds into MM:SS or HH:MM:SS
 */
function formatTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
