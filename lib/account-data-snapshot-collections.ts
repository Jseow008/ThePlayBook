/** Stable public names for the account-owned export collections. */
export const ACCOUNT_DATA_SNAPSHOT_COLLECTIONS = [
    "preferences",
    "user_library",
    "highlights",
    "reflections",
    "reading_activity",
    "feedback",
    "submitted_requests",
    "request_votes",
    "notification_preferences",
    "request_notifications",
    "ai_usage",
] as const;

export type AccountDataSnapshotCollection = (typeof ACCOUNT_DATA_SNAPSHOT_COLLECTIONS)[number];

export const ACCOUNT_DATA_EXPORT_COLLECTIONS = ACCOUNT_DATA_SNAPSHOT_COLLECTIONS;
