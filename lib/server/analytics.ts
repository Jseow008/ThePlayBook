import "server-only";

import { PostHog } from "posthog-node";
import {
    sanitizeAnalyticsProperties,
    type AnalyticsEvent,
    type AnalyticsEventProperties,
    type AnalyticsPropertyValue,
} from "@/lib/analytics-events";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
let sharedClient: { token: string; host: string; client: PostHog } | undefined;

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
    if (sharedClient?.token === config.projectToken && sharedClient.host === config.host) {
        return sharedClient.client;
    }
    const client = new PostHog(config.projectToken, {
        host: config.host,
        requestTimeout: 5_000,
        fetchRetryCount: 0,
        flushAt: 20,
        flushInterval: 10_000,
        preloadFeatureFlags: false,
        sendFeatureFlagEvent: false,
        disableRemoteConfig: true,
        disableSurveys: true,
    });
    sharedClient = { token: config.projectToken, host: config.host, client };
    return client;
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
        posthog.capture({
            distinctId,
            event,
            properties: sanitizedProperties,
        });
        await posthog.flush();
    } catch (error) {
        console.warn("[analytics] Server event capture failed.", { event, error });
    }

}
