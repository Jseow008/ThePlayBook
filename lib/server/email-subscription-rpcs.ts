import type { Database } from "@/types/database";
import { getAdminClient } from "@/lib/supabase/admin";

type Functions = Database["public"]["Functions"];

export function subscribeEmailSubscription(
    args: Functions["subscribe_email_subscription"]["Args"],
) {
    return getAdminClient().rpc("subscribe_email_subscription", args);
}

export function unsubscribeEmailSubscriptionByToken(
    args: Functions["unsubscribe_email_subscription_by_token"]["Args"],
) {
    return getAdminClient().rpc("unsubscribe_email_subscription_by_token", args);
}

export function unsubscribeRequestPublishedNotificationsByToken(
    args: Functions["unsubscribe_request_published_notifications_by_token"]["Args"],
) {
    return getAdminClient().rpc(
        "unsubscribe_request_published_notifications_by_token",
        args,
    );
}
