import { ExportPassageSchema, type CitationLink, type ExportPassage } from "@/lib/evidence-citation";

export const CHAT_EXPORT_TTL_SECONDS = 30 * 60;
export const CHAT_EXPORT_TTL_MS = CHAT_EXPORT_TTL_SECONDS * 1000;

export type ChatExportRole = "user" | "assistant";

export interface ChatExportMessage {
    id?: string;
    role: ChatExportRole;
    content: string;
    sources?: Array<ExportPassage & { label: string }>;
    sourceLinksUnavailable?: boolean;
}

export interface ChatExportInputMessage {
    id?: string;
    role: string;
    content: string;
    citations?: readonly CitationLink[];
}

/** Export destination metadata only. Response-scoped verification tokens never leave the chat. */
export function getChatExportMessages(messages: readonly ChatExportInputMessage[]): ChatExportMessage[] {
    return messages.flatMap((message) => {
        if ((message.role !== "user" && message.role !== "assistant") || !message.content.trim()) return [];
        const citations = message.role === "assistant" ? message.citations ?? [] : [];
        return [{ id: message.id, role: message.role, content: message.content,
            ...(citations.length ? {
                sources: citations.flatMap((citation) => citation.exportPassage
                    ? [{ ...citation.exportPassage, label: citation.label }] : []),
                sourceLinksUnavailable: citations.some((citation) => !citation.exportPassage),
            } : {}),
        }];
    });
}

export interface ChatExportPayload {
    version: 1;
    title: string;
    assistantLabel: string;
    scopeSummary?: string;
    noteCount?: number;
    createdAt: string;
    messages: ChatExportMessage[];
}

export interface EncryptedChatExportPayload {
    version: 1;
    ciphertext: string;
    iv: string;
}

export interface StoredChatExportPayload extends EncryptedChatExportPayload {
    createdAt: string;
    expiresAt: string;
    messageCount: number;
}

function normalizeMarkdownText(value: string): string {
    return value.replace(/\r\n/g, "\n").trim();
}

function formatRole(role: ChatExportRole): string {
    return role === "assistant" ? "Assistant" : "You";
}

const unavailableLinks = "Some source links are unavailable in this saved answer. Get a fresh answer to export current passage links.";
const privateAccess = "Source links do not grant access to another person's private highlights or notes.";

/** The same range-based composition is used by the download and shared viewer. */
export function buildChatExportMessageMarkdown(message: ChatExportMessage, origin?: string): string {
    if (message.role !== "assistant") return message.content;
    const sources = message.sources ?? [];
    if (!Array.isArray(sources) || sources.length > 8) return `${message.content}\n\n${unavailableLinks}`;
    let end = 0;
    for (const source of sources) {
        const parsed = ExportPassageSchema.safeParse(source);
        if (!parsed.success || parsed.data.start < end || parsed.data.end > message.content.length) {
            return `${message.content}\n\n${unavailableLinks}`;
        }
        end = parsed.data.end;
    }
    let offset = 0;
    let content = "";
    for (const source of sources) {
        content += message.content.slice(offset, source.end);
        // The schema permits only an internal reader destination, never an expiring /evidence token.
        const href = source.sourceHref && (origin ? new URL(source.sourceHref, origin).href : source.sourceHref);
        content += href ? `\n\n[Open source passage](${href})` : "\n\nSource unavailable.";
        offset = source.end;
    }
    content += message.content.slice(offset);
    if (sources.some((source) => source.sourceHref)) content += `\n\n${privateAccess}`;
    if (message.sourceLinksUnavailable) content += `\n\n${unavailableLinks}`;
    return content;
}

export function buildChatExportMarkdown(payload: ChatExportPayload, origin = "https://www.netflux.blog"): string {
    const lines = [
        `# ${payload.title}`,
        "",
        `Created: ${new Date(payload.createdAt).toLocaleString()}`,
        `Assistant: ${payload.assistantLabel}`,
    ];

    if (payload.scopeSummary) {
        lines.push(`Scope: ${payload.scopeSummary}`);
    }

    if (typeof payload.noteCount === "number") {
        lines.push(`Notes in scope: ${payload.noteCount}`);
    }

    lines.push("", "---", "");

    payload.messages.forEach((message, index) => {
        const content = normalizeMarkdownText(buildChatExportMessageMarkdown(message, origin));
        if (!content) {
            return;
        }

        lines.push(`## ${index + 1}. ${formatRole(message.role)}`, "", content, "");
    });

    return `${lines.join("\n").trimEnd()}\n`;
}

export function getChatExportFilename(payload: Pick<ChatExportPayload, "title" | "createdAt">): string {
    const date = new Date(payload.createdAt);
    const datePart = Number.isNaN(date.getTime())
        ? "conversation"
        : date.toISOString().slice(0, 10);
    const slug = payload.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "netflux-chat";

    return `${slug}-${datePart}.md`;
}
