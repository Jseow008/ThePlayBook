import { buildCanonicalReadPath } from "@/lib/content-paths";
import { getAdminClient } from "@/lib/supabase/admin";

export const CONTENT_REQUEST_NOTIFICATION_BATCH_SIZE = 20;

const MAX_NOTIFICATION_ATTEMPTS = 3;
const STALE_PROCESSING_MINUTES = 15;
const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

type NotificationStatus = "queued" | "processing" | "sent" | "failed" | "skipped";

interface ClaimedNotificationRow {
    id: string;
    request_id: string;
    user_id: string;
    attempts: number;
}

interface NotificationDetailRow extends ClaimedNotificationRow {
    request: {
        id: string;
        title: string;
        published_content: {
            id: string;
            title: string;
        } | Array<{
            id: string;
            title: string;
        }> | null;
    } | Array<{
        id: string;
        title: string;
        published_content: {
            id: string;
            title: string;
        } | Array<{
            id: string;
            title: string;
        }> | null;
    }> | null;
    profile: {
        email: string | null;
    } | Array<{
        email: string | null;
    }> | null;
}

interface NotificationPreferenceRow {
    user_id: string;
    request_published_email_enabled: boolean;
    unsubscribe_token: string;
}

interface ProcessSummary {
    claimed: number;
    sent: number;
    skipped: number;
    failed: number;
    retried: number;
}

class EmailConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "EmailConfigurationError";
    }
}

function getRelation<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value;
}

function truncateError(value: unknown) {
    const message = value instanceof Error ? value.message : String(value);
    return message.slice(0, 1000);
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getSiteUrl() {
    const rawUrl = process.env.NEXT_PUBLIC_SITE_URL
        || process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    return rawUrl.replace(/\/+$/, "");
}

function getResendConfig() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.REQUEST_NOTIFICATION_FROM_EMAIL?.trim();
    const replyTo = process.env.REQUEST_NOTIFICATION_REPLY_TO_EMAIL?.trim();

    if (!apiKey) {
        throw new EmailConfigurationError("RESEND_API_KEY is not configured.");
    }

    if (!from) {
        throw new EmailConfigurationError("REQUEST_NOTIFICATION_FROM_EMAIL is not configured.");
    }

    return { apiKey, from, replyTo: replyTo || null };
}

function buildAbsoluteUrl(path: string) {
    return new URL(path, `${getSiteUrl()}/`).toString();
}

function buildPublishedEmail(params: {
    requestTitle: string;
    contentTitle: string;
    readUrl: string;
    unsubscribeUrl: string;
}) {
    const requestTitle = escapeHtml(params.requestTitle);
    const contentTitle = escapeHtml(params.contentTitle);
    const readUrl = escapeHtml(params.readUrl);
    const unsubscribeUrl = escapeHtml(params.unsubscribeUrl);

    const text = [
        `The Netflux summary you requested is now live: ${params.contentTitle}`,
        "",
        `Read it here: ${params.readUrl}`,
        "",
        `You are receiving this because you voted for or submitted "${params.requestTitle}" on the Netflux request board.`,
        `Turn off these request notification emails: ${params.unsubscribeUrl}`,
    ].join("\n");

    const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f6f6f6;font-family:Inter,Arial,sans-serif;color:#171717;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;padding:28px;">
            <tr>
              <td>
                <p style="margin:0 0 12px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#737373;">Netflux Request Board</p>
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#171717;">The summary you requested is now live.</h1>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#404040;">The Netflux summary for <strong>${contentTitle}</strong> is available now.</p>
                <p style="margin:0 0 28px;">
                  <a href="${readUrl}" style="display:inline-block;border-radius:8px;background:#171717;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 16px;">Read summary</a>
                </p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#737373;">You are receiving this because you voted for or submitted "${requestTitle}" on the Netflux request board.</p>
                <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#737373;">
                  <a href="${unsubscribeUrl}" style="color:#525252;">Turn off request notification emails</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    return { html, text };
}

async function sendPublishedRequestEmail(params: {
    notificationId: string;
    to: string;
    requestTitle: string;
    contentTitle: string;
    readUrl: string;
    unsubscribeUrl: string;
}) {
    const config = getResendConfig();
    const email = buildPublishedEmail(params);
    const response = await fetch(RESEND_EMAIL_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `content-request-published-${params.notificationId}`,
        },
        body: JSON.stringify({
            from: config.from,
            to: [params.to],
            subject: "The Netflux summary you requested is now live",
            html: email.html,
            text: email.text,
            ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        }),
    });

    const payload = await response.json().catch(() => null) as { id?: string; message?: string; error?: string } | null;

    if (!response.ok) {
        throw new Error(payload?.message || payload?.error || `Resend returned ${response.status}.`);
    }

    return payload?.id ?? null;
}

export async function queueContentRequestPublishedNotifications(requestId: string) {
    const supabase = getAdminClient();
    const { data, error } = await (supabase as any).rpc("queue_content_request_published_notifications", {
        p_request_id: requestId,
    });

    if (error) {
        throw error;
    }

    return Number(data ?? 0);
}

async function resetStaleProcessingNotifications() {
    const supabase = getAdminClient();
    const staleBefore = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000).toISOString();
    const { error } = await (supabase as any).from("content_request_notifications")
        .update({
            status: "queued" satisfies NotificationStatus,
            processing_started_at: null,
        })
        .eq("status", "processing")
        .lt("processing_started_at", staleBefore)
        .lt("attempts", MAX_NOTIFICATION_ATTEMPTS);

    if (error) {
        throw error;
    }
}

async function claimNotifications(limit: number) {
    const supabase = getAdminClient();
    const { data, error } = await (supabase as any).rpc("claim_content_request_notifications", {
        p_limit: limit,
    });

    if (error) {
        throw error;
    }

    return (data ?? []) as ClaimedNotificationRow[];
}

async function fetchNotificationDetails(notificationIds: string[]) {
    if (notificationIds.length === 0) {
        return [];
    }

    const supabase = getAdminClient();
    const { data, error } = await (supabase as any).from("content_request_notifications")
        .select(`
            id,
            request_id,
            user_id,
            attempts,
            request:content_requests!content_request_notifications_request_id_fkey (
                id,
                title,
                published_content:content_item!content_requests_published_content_id_fkey (
                    id,
                    title
                )
            ),
            profile:profiles!content_request_notifications_user_id_fkey (
                email
            )
        `)
        .in("id", notificationIds);

    if (error) {
        throw error;
    }

    return (data ?? []) as NotificationDetailRow[];
}

async function fetchNotificationPreferences(userIds: string[]) {
    if (userIds.length === 0) {
        return new Map<string, NotificationPreferenceRow>();
    }

    const supabase = getAdminClient();
    const { data, error } = await (supabase as any).from("user_notification_preferences")
        .select("user_id, request_published_email_enabled, unsubscribe_token")
        .in("user_id", userIds);

    if (error) {
        throw error;
    }

    return new Map<string, NotificationPreferenceRow>(
        ((data ?? []) as NotificationPreferenceRow[]).map((row) => [row.user_id, row])
    );
}

async function markNotificationSent(notificationId: string, providerMessageId: string | null) {
    const supabase = getAdminClient();
    const { error } = await (supabase as any).from("content_request_notifications")
        .update({
            status: "sent" satisfies NotificationStatus,
            provider_message_id: providerMessageId,
            sent_at: new Date().toISOString(),
            processing_started_at: null,
            last_error: null,
        })
        .eq("id", notificationId);

    if (error) {
        throw error;
    }
}

async function markNotificationSkipped(notificationId: string, reason: string) {
    const supabase = getAdminClient();
    const { error } = await (supabase as any).from("content_request_notifications")
        .update({
            status: "skipped" satisfies NotificationStatus,
            skipped_at: new Date().toISOString(),
            processing_started_at: null,
            last_error: reason,
        })
        .eq("id", notificationId);

    if (error) {
        throw error;
    }
}

async function markNotificationFailed(notificationId: string, currentAttempts: number, error: unknown) {
    const nextAttempts = currentAttempts + 1;
    const status: NotificationStatus = nextAttempts >= MAX_NOTIFICATION_ATTEMPTS ? "failed" : "queued";
    const supabase = getAdminClient();
    const { error: updateError } = await (supabase as any).from("content_request_notifications")
        .update({
            status,
            attempts: nextAttempts,
            processing_started_at: null,
            last_error: truncateError(error),
        })
        .eq("id", notificationId);

    if (updateError) {
        throw updateError;
    }

    return status;
}

export async function processQueuedContentRequestNotifications(
    batchSize = CONTENT_REQUEST_NOTIFICATION_BATCH_SIZE
): Promise<ProcessSummary> {
    getResendConfig();
    await resetStaleProcessingNotifications();

    const claimed = await claimNotifications(batchSize);
    const details = await fetchNotificationDetails(claimed.map((row) => row.id));
    const detailById = new Map(details.map((row) => [row.id, row]));
    const preferences = await fetchNotificationPreferences([...new Set(details.map((row) => row.user_id))]);
    const summary: ProcessSummary = {
        claimed: claimed.length,
        sent: 0,
        skipped: 0,
        failed: 0,
        retried: 0,
    };

    for (const claimedRow of claimed) {
        const row = detailById.get(claimedRow.id);

        try {
            if (!row) {
                await markNotificationSkipped(claimedRow.id, "Notification row could not be loaded after claim.");
                summary.skipped += 1;
                continue;
            }

            const request = getRelation(row.request);
            const profile = getRelation(row.profile);
            const publishedContent = request ? getRelation(request.published_content) : null;
            const preference = preferences.get(row.user_id);

            if (!profile?.email) {
                await markNotificationSkipped(row.id, "Recipient profile has no email address.");
                summary.skipped += 1;
                continue;
            }

            if (!preference?.request_published_email_enabled) {
                await markNotificationSkipped(row.id, "Recipient disabled request published emails.");
                summary.skipped += 1;
                continue;
            }

            if (!preference.unsubscribe_token) {
                await markNotificationSkipped(row.id, "Recipient notification preference has no unsubscribe token.");
                summary.skipped += 1;
                continue;
            }

            if (!request || !publishedContent) {
                await markNotificationSkipped(row.id, "Request is missing linked published content.");
                summary.skipped += 1;
                continue;
            }

            const readPath = buildCanonicalReadPath(publishedContent.id, publishedContent.title);
            const providerMessageId = await sendPublishedRequestEmail({
                notificationId: row.id,
                to: profile.email,
                requestTitle: request.title,
                contentTitle: publishedContent.title,
                readUrl: buildAbsoluteUrl(readPath),
                unsubscribeUrl: buildAbsoluteUrl(`/api/notification-preferences/request-published/unsubscribe?token=${encodeURIComponent(preference.unsubscribe_token)}`),
            });

            await markNotificationSent(row.id, providerMessageId);
            summary.sent += 1;
        } catch (error) {
            const nextStatus = await markNotificationFailed(claimedRow.id, claimedRow.attempts, error);
            if (nextStatus === "failed") {
                summary.failed += 1;
            } else {
                summary.retried += 1;
            }
        }
    }

    return summary;
}

export { EmailConfigurationError };
