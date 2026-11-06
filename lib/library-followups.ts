/** Follow-up questions are navigation aids, never evidence or instructions. */
export const LIBRARY_FOLLOWUP_LIMIT = 2;
export const LIBRARY_FOLLOWUP_CHARACTERS = 240;
export type LibraryFollowups = { status: 'pending' | 'ready'; questions: string[] };

export function normalizeLibraryFollowups(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const questions: string[] = [];
    for (const item of value.slice(0, LIBRARY_FOLLOWUP_LIMIT)) {
        if (typeof item !== 'string') continue;
        const question = item.trim();
        if (question.length < 8 || question.length > LIBRARY_FOLLOWUP_CHARACTERS
            || /[\p{Cc}\p{Cf}<>]|https?:\/\//u.test(question) || /\b(?:you|your|yours)\b/i.test(question)) continue;
        // English questions must explicitly explore records/status, not invent a personal-advice task.
        if (/^(?:what|which|how|where|when|why|can|could|do|does|did|is|are|have|has)\b/i.test(question)
            && !/\b(?:sav(?:e|ed)|notes?|noted|library|record(?:ed|s)?|documented|highlights?|reflections?|passages?|completed|in progress)\b/i.test(question)) continue;
        if (!questions.some(existing => existing.toLocaleLowerCase() === question.toLocaleLowerCase())) questions.push(question);
    }
    return questions;
}

export function getLibraryFollowups(message: { parts?: readonly { type: string; data?: unknown }[] }): LibraryFollowups | null {
    const part = message.parts?.findLast(part => part.type === 'data-library-followups');
    if (!part) return null; // Older recovered conversations retain their original actions.
    const data = part.data;
    if (!data || typeof data !== 'object') return { status: 'ready', questions: [] };
    return { status: 'status' in data && data.status === 'pending' ? 'pending' : 'ready',
        questions: normalizeLibraryFollowups('questions' in data ? data.questions : undefined) };
}

export const LIBRARY_CLARIFICATION_FOLLOWUPS = [
    'Find my saved passages about discipline.',
    'Find my saved passages about focus.',
] as const;
export const LIBRARY_NO_EVIDENCE_FOLLOWUPS = [
    'What themes show up across my saved items?',
    'Which authors show up most in my saved items?',
] as const;
