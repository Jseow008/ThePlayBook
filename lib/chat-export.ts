export const CHAT_EXPORT_TTL_SECONDS = 30 * 60;
export const CHAT_EXPORT_TTL_MS = CHAT_EXPORT_TTL_SECONDS * 1000;

export type ChatExportRole = "user" | "assistant";

export interface ChatExportMessage {
    id?: string;
    role: ChatExportRole;
    content: string;
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

export function buildChatExportMarkdown(payload: ChatExportPayload): string {
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
        const content = normalizeMarkdownText(message.content);
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
