import "server-only";

import { PostHog } from "posthog-node";
import {
    sanitizeAnalyticsProperties,
    type AnalyticsEvent,
    type AnalyticsEventProperties,
    type AnalyticsPropertyValue,
} from "@/lib/analytics-events";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const SERVER_ANALYTICS_SHUTDOWN_TIMEOUT_MS = 5_000;

type ServerAnalyticsCapture<E extends AnalyticsEvent> = {
    event: E;
    distinctId: string;
    properties: AnalyticsEventProperties<E>;
    insertId?: string;
};

function getServerPostHogConfig() {
    const projectToken = process.env.POSTHOG_PROJECT_TOKEN
        ?? process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

    if (!projectToken) {
        return null;
    }

    return {
        projectToken,
        host: process.env.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST,
    };
}

function createServerPostHogClient(config: NonNullable<ReturnType<typeof getServerPostHogConfig>>) {
    return new PostHog(config.projectToken, {
        host: config.host,
        flushAt: 1,
        flushInterval: 0,
        preloadFeatureFlags: false,
        sendFeatureFlagEvent: false,
        disableRemoteConfig: true,
        disableSurveys: true,
    });
}

export async function captureServerAnalyticsEvent<E extends AnalyticsEvent>({
    event,
    distinctId,
    properties,
    insertId,
}: ServerAnalyticsCapture<E>) {
    const config = getServerPostHogConfig();
    if (!config || !distinctId) {
        return;
    }

    const posthog = createServerPostHogClient(config);
    const sanitizedProperties: Record<string, AnalyticsPropertyValue> = {
        ...sanitizeAnalyticsProperties(event, properties),
    };

    if (insertId) {
        sanitizedProperties.$insert_id = insertId;
    }

    try {
        await posthog.captureImmediate({
            distinctId,
            event,
            properties: sanitizedProperties,
        });
    } catch (error) {
        console.warn("[analytics] Server event capture failed.", { event, error });
    }

    try {
        await posthog.shutdown(SERVER_ANALYTICS_SHUTDOWN_TIMEOUT_MS);
    } catch (error) {
        console.warn("[analytics] Server event shutdown failed.", { event, error });
    }
}
