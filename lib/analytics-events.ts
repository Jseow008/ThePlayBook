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
  library_saved: AnalyticsCommonProperties & {
    content_id: string;
    content_type?: string;
    save_state?: "saved";
  };
  share_clicked: AnalyticsCommonProperties & {
    source: string;
    content_id?: string;
    content_type?: string;
    share_method?: "native" | "copy_link" | "download" | "qr";
    share_target?: string;
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
  library_saved: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User saves a content item to their library.",
    requiredProperties: ["content_id"],
    allowedProperties: eventProperties(["save_state"]),
    privacy: "behavioral_metadata",
    delivery: "server_confirmed",
  },
  share_clicked: {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    description: "User initiates a share action.",
    requiredProperties: ["source"],
    allowedProperties: eventProperties(["share_method", "share_target"]),
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
