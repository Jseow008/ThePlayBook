"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hook to track reading time and send heartbeats to the server.
 * Tracks time only when the window is focused and user is "active" (optional).
 */
export function useReadingTimer(contentId?: string) {
    const [secondsRead, setSecondsRead] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);


    // Accumulator for unsent seconds
    const pendingSecondsRef = useRef(0);
    // Disable server syncing after unauthorized response to avoid repeated 401 spam for guests.
    const trackingEnabledRef = useRef(true);

    useEffect(() => {
        if (!contentId) return;

        const startTimer = () => {
            if (intervalRef.current) return;

            intervalRef.current = setInterval(() => {
                if (document.visibilityState === 'visible') {
                    setSecondsRead(prev => prev + 1);
                    pendingSecondsRef.current += 1;
                }
            }, 1000);
        };

        const stopTimer = () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };

        const sendHeartbeat = async (isUnmount = false) => {
            if (!trackingEnabledRef.current) return;

            const toSend = pendingSecondsRef.current;

            if (toSend === 0) return;

            // Threshold: If less than 60 seconds, discard on unmount, otherwise keep accumulating
            if (toSend < 60) {
                if (isUnmount) {
                    pendingSecondsRef.current = 0;
                }
                return;
            }

            try {
                pendingSecondsRef.current = 0; // Reset pending
                const response = await fetch('/api/activity/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true, // Ensure request survives page unload
                    body: JSON.stringify({
                        duration_seconds: toSend,
                        content_id: contentId,
                        activity_date: new Date().toISOString().split('T')[0],
                    })
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
                // Ideally restore pending seconds on failure, but for simple analytics it's okay to drop
                pendingSecondsRef.current += toSend;
            }
        };

        // Window focus handling
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                startTimer();
            } else {
                stopTimer();
                sendHeartbeat(false); // Flush pending on blur
            }
        };

        const handleBeforeUnload = () => sendHeartbeat(true);

        // Start initially
        startTimer();

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            stopTimer();
            sendHeartbeat(true);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
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
