export const ANALYTICS_SCHEMA_VERSION = 1;

export type AnalyticsPropertyValue = string | number | boolean | null | undefined;
export type AnalyticsUserState = "anonymous" | "authenticated";
export type AnalyticsPrivacyClassification =
  | "non_sensitive_metadata"
  | "behavioral_metadata";
export type AnalyticsDeliveryMode =
  | "client_only"
  | "server_confirmed"
  | "client_intent_server_truth";

const COMMON_ALLOWED_PROPERTIES = [
  "source",
  "path",
  "route",
  "user_state",
  "content_id",
  "content_type",
  "category",
] as const;

const SENSITIVE_PROPERTY_NAMES = new Set([
  "email",
  "highlighted_text",
  "message",
  "messages",
  "note",
  "note_body",
  "prompt",
  "query",
  "raw_query",
  "search_query",
]);

export interface AnalyticsEventContract {
  schemaVersion: typeof ANALYTICS_SCHEMA_VERSION;
  description: string;
  requiredProperties: readonly AnalyticsEventProperty[];
  allowedProperties: readonly AnalyticsEventProperty[];
  privacy: AnalyticsPrivacyClassification;
  delivery: AnalyticsDeliveryMode;
}

export interface AnalyticsCommonProperties {
  source?: string;
  path?: string;
  route?: string;
  user_state?: AnalyticsUserState;
  content_id?: string;
  content_type?: string;
  category?: string;
}

export interface AnalyticsEventPropertiesByName {
  email_subscribed: AnalyticsCommonProperties & {
    source: string;
  };
  signup_started: AnalyticsCommonProperties & {
    source: string;
    auth_method: "email" | "google";
  };
  signup_completed: AnalyticsCommonProperties & {
    source: string;
    auth_method?: "email" | "google";
  };
  content_opened: AnalyticsCommonProperties & {
    content_id: string;
    content_type?: string;
    category?: string;
  };
  content_completed: AnalyticsCommonProperties & {
    content_id: string;
    content_type?: string;
    completion_percent?: number;
  };
  highlight_created: AnalyticsCommonProperties & {
    content_id: string;
    content_type?: string;
    color?: string;
    has_note?: boolean;
  };
  note_created: AnalyticsCommonProperties & {
    content_id: string;
    content_type?: string;
    highlight_id?: string;
    note_length?: number;
  };
  reflection_opened: AnalyticsCommonProperties;
  reflection_skipped: AnalyticsCommonProperties;
  reflection_saved: AnalyticsCommonProperties & {
    reflection_length: number;
  };
  ai_chat_started: AnalyticsCommonProperties & {
    source: string;
    chat_scope?: "content" | "notes" | "library" | "global";
    content_id?: string;
    note_count?: number;
  };
  search_performed: AnalyticsCommonProperties & {
    source: string;
    search_scope?: "content" | "notes" | "library" | "global";
    query_present: boolean;
    query_length?: number;
    result_count?: number;
    filters_count?: number;
  };
  search_results: AnalyticsCommonProperties & {
    source: string;
    search_scope: "content" | "notes" | "library" | "global";
    query_present: boolean;
    query_length?: number;
    result_count: number;
    filters_count?: number;
  };
  search_no_results: AnalyticsCommonProperties & {
    source: string;
    search_scope: "content" | "notes" | "library" | "global";
    query_present: boolean;
    query_length?: number;
    filters_count?: number;
  };
  search_input_empty: AnalyticsCommonProperties & {
    source: string;
    search_scope: "content" | "notes" | "library" | "global";
    query_present: boolean;
    query_length?: number;
    filters_count?: number;
  };
  search_failed: AnalyticsCommonProperties & {
    source: string;
    search_scope: "content" | "notes" | "library" | "global";
    query_present: boolean;
    query_length?: number;
    filters_count?: number;
    failure_kind: "unavailable" | "invalid_input";
  };
  search_action_started: AnalyticsCommonProperties & {
    source: string;
    journey_id: string;
    action_kind: "query" | "filter";
    filter_kind?: "topic" | "type" | "sort" | "other";
    trigger: "submit" | "debounced" | "recent" | "clear" | "link" | "select";
    query_present: boolean;
  };
  search_action_superseded: AnalyticsCommonProperties & {
    source: string;
    journey_id: string;
    action_kind: "query" | "filter";
    filter_kind?: "topic" | "type" | "sort" | "other";
  };
  search_journey_settled: AnalyticsCommonProperties & {
    source: string;
    journey_id: string;
    action_kind: "query" | "filter" | "initial_load";
    filter_kind?: "topic" | "type" | "sort" | "other";
    navigation_kind: "in_app" | "document";
    outcome: "results" | "no_results" | "failed" | "input_empty";
    elapsed_ms: number;
    visibility_state: "foreground" | "backgrounded" | "unknown";
    result_count: number;
    filters_count: number;
    query_present: boolean;
  };
  search_result_clicked: AnalyticsCommonProperties & {
    source: string;
    journey_id: string;
    action_kind: "query" | "filter" | "initial_load";
    navigation_kind: "in_app" | "document";
    position: number;
  };
  library_saved: AnalyticsCommonProperties & {
    content_id: string;
    content_type?: string;
    save_state?: "saved";
  };
  focus_card_impression: AnalyticsCommonProperties & {
    measurement_version: 2;
    focus_visit_id: string;
    content_id: string;
    variant: "control" | "ranked";
    entry_kind: "fresh" | "restored";
    selection_source: "personalized" | "discovery" | "unknown";
    personalization_ready: boolean;
    device_class: "mobile" | "desktop";
    position: number;
    readable_ms: number;
  };
  focus_visit_started: AnalyticsCommonProperties & {
    measurement_version: 2;
    focus_visit_id: string;
    variant: "control" | "ranked";
    assignment_stable: boolean;
    entry_kind: "fresh" | "restored";
    personalization_ready: boolean;
    device_class: "mobile" | "desktop";
  };
  focus_opening_batch: AnalyticsCommonProperties & {
    measurement_version: 2;
    focus_visit_id: string;
    variant: "control" | "ranked";
    assignment_stable: boolean;
    device_class: "mobile" | "desktop";
    personalization_ready: boolean;
    outcome: "loaded" | "empty" | "failed";
    contains_personalized: boolean | "unknown";
    item_count: number;
  };
  focus_card_action: AnalyticsCommonProperties & {
    measurement_version: 2;
    focus_visit_id: string;
    content_id: string;
    variant: "control" | "ranked";
    entry_kind: "fresh" | "restored";
    selection_source: "personalized" | "discovery" | "unknown";
    personalization_ready: boolean;
    device_class: "mobile" | "desktop";
    position: number;
    action: "summary_opened" | "saved" | "rapid_skip";
  };
  focus_feed_timing: AnalyticsCommonProperties & {
    measurement_version: 2;
    focus_visit_id: string;
    variant: "control" | "ranked";
    entry_kind: "fresh" | "restored";
    device_class: "mobile" | "desktop";
    measure: "first_readable" | "cover_visible" | "cover_failed" | "cover_absent" | "cover_left_before_ready" | "end_wait";
    elapsed_ms: number;
    outcome?: "ready" | "failed" | "abandoned" | "moved_away" | "backgrounded" | "exhausted";
  };
  share_clicked: AnalyticsCommonProperties & {
    source: string;
    content_id?: string;
    content_type?: string;
    share_method?: "native" | "copy_link" | "download" | "qr";
    share_target?: string;
  };
  account_data_export_completed: AnalyticsCommonProperties & {
    source: string;
    snapshot_preparation_ms: number;
    collection_retrieval_ms: number;
    verification_ms: number;
    file_creation_ms: number;
    total_ms: number;
  };
}

export type AnalyticsEvent = keyof AnalyticsEventPropertiesByName;
export type AnalyticsEventProperties<E extends AnalyticsEvent> =
  AnalyticsEventPropertiesByName[E];
type UnionKeys<T> = T extends unknown ? keyof T : never;
export type AnalyticsEventProperty =
  UnionKeys<AnalyticsEventPropertiesByName[AnalyticsEvent]> | "schema_version";

function eventProperties<const T extends readonly AnalyticsEventProperty[]>(
  properties: T
) {
  return [...COMMON_ALLOWED_PROPERTIES, ...properties] as const;
}

// Keep requiredProperties in sync with the Phase 9 data-quality HogQL rules in
// config/posthog/netflux-dashboard-spec.mjs.
export const ANALYTICS_EVENT_CONTRACTS = {
  email_subscribed: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "Visitor successfully subscribes to a Netflux email list.",
    requiredProperties: ["source"],
    allowedProperties: eventProperties([]),
    privacy: "behavioral_metadata",
    delivery: "client_intent_server_truth",
  },
  signup_started: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "Visitor starts an authentication or signup flow.",
    requiredProperties: ["source", "auth_method"],
    allowedProperties: eventProperties(["auth_method"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  signup_completed: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User completes account creation or first authenticated entry.",
    requiredProperties: ["source"],
    allowedProperties: eventProperties(["auth_method"]),
    privacy: "behavioral_metadata",
    delivery: "server_confirmed",
  },
  content_opened: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User opens a content item.",
    requiredProperties: ["content_id"],
    allowedProperties: eventProperties([]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  content_completed: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User completes a content item.",
    requiredProperties: ["content_id"],
    allowedProperties: eventProperties(["completion_percent"]),
    privacy: "behavioral_metadata",
    delivery: "server_confirmed",
  },
  highlight_created: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User creates a highlight. Never include highlighted text.",
    requiredProperties: ["content_id"],
    allowedProperties: eventProperties(["color", "has_note"]),
    privacy: "behavioral_metadata",
    delivery: "server_confirmed",
  },
  note_created: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User creates a note. Never include note text.",
    requiredProperties: ["content_id"],
    allowedProperties: eventProperties(["highlight_id", "note_length"]),
    privacy: "behavioral_metadata",
    delivery: "server_confirmed",
  },
  reflection_opened: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "Reader opens the optional reflection composer. Never include reflection text.",
    requiredProperties: ["content_id"],
    allowedProperties: eventProperties([]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  reflection_skipped: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "Reader closes the reflection composer without saving. Never include reflection text.",
    requiredProperties: ["content_id"],
    allowedProperties: eventProperties([]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  reflection_saved: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "Reader saves a reflection. Never include reflection text or prompt text.",
    requiredProperties: ["content_id", "reflection_length"],
    allowedProperties: eventProperties(["reflection_length"]),
    privacy: "behavioral_metadata",
    delivery: "server_confirmed",
  },
  ai_chat_started: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User sends the first message in an AI chat context.",
    requiredProperties: ["source"],
    allowedProperties: eventProperties(["chat_scope", "note_count"]),
    privacy: "behavioral_metadata",
    delivery: "client_intent_server_truth",
  },
  search_performed: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User performs a search. Do not include raw query text.",
    requiredProperties: ["source", "query_present"],
    allowedProperties: eventProperties([
      "search_scope",
      "query_present",
      "query_length",
      "result_count",
      "filters_count",
    ]),
    privacy: "behavioral_metadata",
    delivery: "client_intent_server_truth",
  },
  search_results: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "A catalog or notes search returned one or more results. Do not include raw query text.",
    requiredProperties: ["source", "search_scope", "query_present", "result_count"],
    allowedProperties: eventProperties(["search_scope", "query_present", "query_length", "result_count", "filters_count"]),
    privacy: "behavioral_metadata",
    delivery: "client_intent_server_truth",
  },
  search_no_results: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "A catalog or notes search completed with no results. Do not include raw query text.",
    requiredProperties: ["source", "search_scope", "query_present"],
    allowedProperties: eventProperties(["search_scope", "query_present", "query_length", "filters_count"]),
    privacy: "behavioral_metadata",
    delivery: "client_intent_server_truth",
  },
  search_input_empty: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "A catalog query parsed to no searchable terms. Do not include raw query text.",
    requiredProperties: ["source", "search_scope", "query_present"],
    allowedProperties: eventProperties(["search_scope", "query_present", "query_length", "filters_count"]),
    privacy: "behavioral_metadata",
    delivery: "client_intent_server_truth",
  },
  search_failed: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "A catalog or notes search could not complete. Do not include raw query text or error details.",
    requiredProperties: ["source", "search_scope", "query_present", "failure_kind"],
    allowedProperties: eventProperties(["search_scope", "query_present", "query_length", "filters_count", "failure_kind"]),
    privacy: "behavioral_metadata",
    delivery: "client_intent_server_truth",
  },
  search_action_started: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "A catalog query or filter navigation begins. Never include the URL or query text.",
    requiredProperties: ["source", "journey_id", "action_kind", "trigger", "query_present"],
    allowedProperties: eventProperties(["journey_id", "action_kind", "filter_kind", "trigger", "query_present"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  search_action_superseded: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "A newer catalog action replaces one that has not produced an outcome. Never include the URL or query text.",
    requiredProperties: ["source", "journey_id", "action_kind"],
    allowedProperties: eventProperties(["journey_id", "action_kind", "filter_kind"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  search_journey_settled: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "Catalog results, empty state, or error painted after an action or document load. A result count does not establish relevance.",
    requiredProperties: ["source", "journey_id", "action_kind", "navigation_kind", "outcome", "elapsed_ms", "visibility_state", "result_count", "filters_count", "query_present"],
    allowedProperties: eventProperties(["journey_id", "action_kind", "filter_kind", "navigation_kind", "outcome", "elapsed_ms", "visibility_state", "result_count", "filters_count", "query_present"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  search_result_clicked: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "A visible catalog result link is clicked; this is selection intent, not relevance or destination-load proof.",
    requiredProperties: ["source", "journey_id", "action_kind", "navigation_kind", "position"],
    allowedProperties: eventProperties(["journey_id", "action_kind", "navigation_kind", "position"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  library_saved: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User saves a content item to their library.",
    requiredProperties: ["content_id"],
    allowedProperties: eventProperties(["save_state"]),
    privacy: "behavioral_metadata",
    delivery: "server_confirmed",
  },
  focus_card_impression: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "Focus card remains at least 75% visible for 500 ms in a foreground tab.",
    requiredProperties: ["measurement_version", "focus_visit_id", "content_id", "variant", "entry_kind", "selection_source", "personalization_ready", "device_class", "position", "readable_ms"],
    allowedProperties: eventProperties(["measurement_version", "focus_visit_id", "variant", "entry_kind", "selection_source", "personalization_ready", "device_class", "position", "readable_ms"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  focus_visit_started: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "Focus visit begins, including visits with no card impression.",
    requiredProperties: ["measurement_version", "focus_visit_id", "variant", "assignment_stable", "entry_kind", "personalization_ready", "device_class"],
    allowedProperties: eventProperties(["measurement_version", "focus_visit_id", "variant", "assignment_stable", "entry_kind", "personalization_ready", "device_class"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  focus_opening_batch: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "Pre-order Focus opening batch availability, including failed and empty openings.",
    requiredProperties: ["measurement_version", "focus_visit_id", "variant", "assignment_stable", "device_class", "personalization_ready", "outcome", "contains_personalized", "item_count"],
    allowedProperties: eventProperties(["measurement_version", "focus_visit_id", "variant", "assignment_stable", "device_class", "personalization_ready", "outcome", "contains_personalized", "item_count"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  focus_card_action: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "Focus summary actually opens, a save succeeds, or a card is skipped rapidly.",
    requiredProperties: ["measurement_version", "focus_visit_id", "content_id", "variant", "entry_kind", "selection_source", "personalization_ready", "device_class", "position", "action"],
    allowedProperties: eventProperties(["measurement_version", "focus_visit_id", "variant", "entry_kind", "selection_source", "personalization_ready", "device_class", "position", "action"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  focus_feed_timing: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User-visible Focus paint, cover and end-of-feed wait timing.",
    requiredProperties: ["measurement_version", "focus_visit_id", "variant", "entry_kind", "device_class", "measure", "elapsed_ms"],
    allowedProperties: eventProperties(["measurement_version", "focus_visit_id", "variant", "entry_kind", "device_class", "measure", "elapsed_ms", "outcome"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  share_clicked: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User initiates a share action.",
    requiredProperties: ["source"],
    allowedProperties: eventProperties(["share_method", "share_target"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
  account_data_export_completed: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User completes a verified personal-data export. Never include exported values, IDs, or collection counts.",
    requiredProperties: ["source", "snapshot_preparation_ms", "collection_retrieval_ms", "verification_ms", "file_creation_ms", "total_ms"],
    allowedProperties: eventProperties(["snapshot_preparation_ms", "collection_retrieval_ms", "verification_ms", "file_creation_ms", "total_ms"]),
    privacy: "behavioral_metadata",
    delivery: "client_only",
  },
} as const satisfies Record<AnalyticsEvent, AnalyticsEventContract>;

function shouldWarn() {
  return process.env.NODE_ENV !== "production";
}

function warnAnalyticsContract(message: string) {
  if (!shouldWarn()) return;
  console.warn(`[analytics] ${message}`);
}

function isAllowedPropertyValue(value: unknown): value is AnalyticsPropertyValue {
  return (
    value === null
    || value === undefined
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  );
}

export function sanitizeAnalyticsProperties<E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEventProperties<E>
) {
  const contract = ANALYTICS_EVENT_CONTRACTS[event];
  const propertyRecord = properties as unknown as Record<string, AnalyticsPropertyValue>;
  const allowedProperties = new Set<AnalyticsEventProperty>([
    ...contract.allowedProperties,
    "schema_version",
  ]);
  const sanitized: Record<string, AnalyticsPropertyValue> = {
    schema_version: ANALYTICS_SCHEMA_VERSION,
  };

  for (const requiredProperty of contract.requiredProperties) {
    const value = propertyRecord[String(requiredProperty)];
    if (value === undefined || value === null) {
      warnAnalyticsContract(
        `${event} missing required property "${String(requiredProperty)}".`
      );
    }
  }

  for (const [key, value] of Object.entries(properties)) {
    const property = key as AnalyticsEventProperty;

    if (SENSITIVE_PROPERTY_NAMES.has(key)) {
      warnAnalyticsContract(`${event} dropped sensitive property "${key}".`);
      continue;
    }

    if (!allowedProperties.has(property)) {
      warnAnalyticsContract(`${event} dropped unregistered property "${key}".`);
      continue;
    }

    if (!isAllowedPropertyValue(value)) {
      warnAnalyticsContract(`${event} dropped non-primitive property "${key}".`);
      continue;
    }

    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
