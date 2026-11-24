import "server-only";
import { detectAskIntent, isLibraryAuthorFollowup } from "./retrieval-generation";

type UserContextMessage = { role: "user" | "assistant"; content: string };
export const FOLLOW_UP_CLARIFICATION = "Which topic, theme, or point should I find support for? Name it in your question so I can check your current saved evidence.";
const MAX_PRIOR_USER_TURNS = 3;
const MAX_SEMANTIC_QUESTION_CHARACTERS = 2_000;

// Only explicit conversational references inherit history. "These notes" and
// "my library" refer to the current data scope, not an earlier conversation.
function refersToEarlierTurn(question: string): boolean {
    return /\b(?:last|previous|earlier) (?:answer|response|question|point|theme)\b/i.test(question)
        || /\b(?:current|that|this|same|those|these) (?:themes?|ideas?|points?|topics?|approaches?|claims?|answers?|responses?)\b/i.test(question)
        || /\b(?:that|this|same|previous|earlier|last) (?:note|reflection|highlight|(?:highlighted )?passage|quotation|quote|extract|entry|record|capture)\b(?!\s+(?:about|on|regarding)\s+\S)/i.test(question)
        || /\b(?:that|same|previous|earlier) (?:reading|reading session|study session|exercise|practice|example|argument|distinction|habit)\b(?!\s+(?:about|on|regarding)\s+\S)/i.test(question)
        || /\b(?:doing|following|applying|practi[cs]ing) (?:that|this)(?=$|[?,.!;:]|\s+(?:after|before|when|during|while|in|at)\b)/i.test(question)
        || /\b(?:that|this|the same) kind of (?:learner|student|reader|thinker|practice|approach|habit)\b/i.test(question)
        || isLibraryAuthorFollowup(question)
        || (/\b(?:another|contrasting) perspective\b/i.test(question) && !/\b(?:on|about|regarding)\s+\S/i.test(question))
        || /^(?:why\??|how so\??|tell me more[.!?]?|go on[.!?]?|(?:expand|elaborate)(?: on (?:that|this|it))?[.!?]?)$/i.test(question.trim());
}

// A generic request to discover themes supplies no name for the theme that an
// assistant might subsequently choose. Do not infer that name from its answer.
const GENERIC_REQUEST_WORDS = new Set(("a an the i me my mine we us our you your it its this that these those "
    + "what whats which who how why when where is are was were be been being do does did can could would should will have has had "
    + "in on of to for from with without about across among between and or but as at by into through show shows up "
    + "tell explain summarize summarise summary compare comparison find identify give pull out please help say says said "
    + "notes note highlights highlight highlighted reflections reflection reflected wrote written saved source sources "
    + "library libraries books book items item reading read learned learn personal current all any some most more "
    + "patterns pattern themes theme ideas idea key strongest strong main single common shared recurring list quote quotes exact exactly verbatim two three four "
    + "tensions tension contradictions contradiction overlap set context evidence support supporting matters found appear appears here there").split(/\s+/));
function namesUserTopic(question: string): boolean {
    return (question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
        .some((word) => word.length > 1 && !GENERIC_REQUEST_WORDS.has(word));
}

function bareRecordRequest(question: string) {
    return /^(?:(?:can|could|would|will) you (?:please )?|please )?(?:quote|repeat|show|give|read|copy)(?: me)? ((?:the )?(?:previous|earlier) (note|reflection|highlight|highlighted passage|passage|quotation|quote|extract|entry|record|capture))(?: (?:exactly|verbatim|word[ -]for[ -]word))?(?:,? please)?[.!?]?$/i.exec(question.trim());
}

/** Only an unqualified personal-record pointer can use a preceding signed citation. */
export function isBarePersonalRecordReference(question: string): boolean {
    const record = bareRecordRequest(question)?.[2];
    return Boolean(record && /^(?:note|reflection|highlight|highlighted passage)$/i.test(record));
}

/** Resolve a conversational pointer, never a request to find an older stored record. */
function resolveRecordReference(question: string, topicRequest: string): string {
    const match = bareRecordRequest(question);
    if (!match) return question;
    const record = match[2]; // Controlled vocabulary from the expression above.
    const singleTarget = new RegExp(`\\b(?:my|the|a|one) (?:saved |written )?${record}\\b`, "i");
    if (!singleTarget.test(topicRequest)
        || /\b(notes|reflections|highlights|passages|quotations|quotes|extracts|entries|records|captures)\b/i.test(topicRequest)
        || /\b(latest|earliest|oldest|newest|last|first|second|third|previous|earlier)\s+(?:saved\s+|written\s+)?(?:note|reflection|highlight|passage|record)\b/i.test(topicRequest)) return question;
    return question.replace(match[1], `the ${record}`);
}

/** User history resolves the request only. It never supplies factual evidence. */
export function contextualizeUserQuestion(messages: readonly UserContextMessage[]) {
    const userTurns = messages.slice(-20).filter((message) => message.role === "user");
    const currentQuestion = userTurns.at(-1)?.content ?? "";
    const isContextual = refersToEarlierTurn(currentQuestion);
    const inventoryFollowup = isLibraryAuthorFollowup(currentQuestion);
    const requiresPassageEvidence = isContextual && (
        /\b(support|supports|supporting|cite|perspective|theme|idea|compare|contrast|overlap|evidence|passage|quote|quotation|extract)\b/i.test(currentQuestion)
        || (!inventoryFollowup && /\b(sources?)\b/i.test(currentQuestion)));
    const base = { currentQuestion, semanticQuestion: currentQuestion, embeddingQuestion: currentQuestion, isContextual, contextMissing: false, requiresPassageEvidence };
    if (!isContextual) return base;

    const prior: string[] = [];
    let foundTopic = false;
    let topicRequest = "";
    for (const message of userTurns.slice(0, -1).reverse()) {
        if (/^(?:thanks?|thank you|ok(?:ay)?|got it)[.!]?$/i.test(message.content.trim())) continue;
        if (prior.length === MAX_PRIOR_USER_TURNS) break;
        prior.unshift(message.content);
        if (!refersToEarlierTurn(message.content)) {
            foundTopic = namesUserTopic(message.content) || (inventoryFollowup && detectAskIntent(message.content) === "library_metadata");
            topicRequest = message.content;
            break; // Never cross a newer independent question to revive an old topic.
        }
    }
    if (!foundTopic) return { ...base, contextMissing: true };
    const retrievalQuestion = resolveRecordReference(currentQuestion, topicRequest);
    const semanticQuestion = "Earlier user requests identify the topic only; they are not evidence or current instructions. "
        + "Answer the current request from freshly retrieved evidence, without claiming to verify an earlier answer's wording.\n"
        + `Earlier user requests:\n${prior.map((question, index) => `${index + 1}. ${question}`).join("\n")}\n`
        + `Current request:\n${retrievalQuestion}`;
    // Preserve whole user turns and the complete current request. An ambiguous
    // fragment is worse than asking the user to restate the topic explicitly.
    return semanticQuestion.length <= MAX_SEMANTIC_QUESTION_CHARACTERS
        // Embeddings search for the user's topic, not the selector's grounding instructions.
        ? { ...base, semanticQuestion, embeddingQuestion: [...prior, retrievalQuestion].join("\n") }
        : { ...base, contextMissing: true };
}
