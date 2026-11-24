export const CONTRIBUTOR_ROLES = [
    "author", "host", "guest", "interviewer", "interviewee", "moderator", "contributor",
] as const;

export type ContributorRole = typeof CONTRIBUTOR_ROLES[number];

export type ContentContributor = {
    id: string;
    name: string;
    role: ContributorRole;
    is_default_speaker: boolean;
};

export function isContributorRole(value: string): value is ContributorRole {
    return CONTRIBUTOR_ROLES.some((role) => role === value);
}

type ContributorVoice = Pick<ContentContributor, "name" | "is_default_speaker">;

export function getContentChatSpeaker(source: { author: string | null; type: string; content_contributor?: readonly ContributorVoice[] }): string | null {
    const credits = source.content_contributor ?? [];
    const designated = credits.find((person) => person.is_default_speaker);
    if (designated) return designated.name;
    // Legacy single-author bylines still identify a person. Interview and
    // combined credits require an explicit choice before using a persona.
    return credits.length === 0 && source.type !== "podcast"
        && source.author && !/[,;]|\s(?:with|and|&|featuring|feat\.?)\s/i.test(source.author) ? source.author : null;
}
