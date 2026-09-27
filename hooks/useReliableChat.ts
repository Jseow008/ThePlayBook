"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatInit, UIMessage } from "ai";

const INCOMPLETE_ANSWER = "The answer could not be completed. Please try again.";

/** Keep interrupted answers out of saved transcripts and subsequent requests. */
export function useReliableChat<M extends UIMessage = UIMessage>(options: ChatInit<M>) {
    const [failure, setFailure] = useState<{ chatId: string | undefined; error: Error }>();
    const active = useRef(true);
    const currentMessages = useRef<M[]>([]);
    const currentId = useRef(options.id);
    const requestChatId = useRef(options.id);
    const retiredQuestions = useRef(new Set<string>());
    useLayoutEffect(() => {
        if (currentId.current === options.id) return;
        for (const message of currentMessages.current) {
            if (message.role === "user") retiredQuestions.current.add(message.id);
        }
        currentId.current = options.id;
    }, [options.id]);
    const chat = useChat<M>({
        ...options,
        onFinish: (result) => {
            if (!active.current || currentId.current !== options.id) return;
            // SDK callbacks can arrive after a Notes chat instance is replaced.
            const resultQuestion = result.messages.findLast((message) => message.role === "user");
            if (!resultQuestion || requestChatId.current !== options.id || retiredQuestions.current.has(resultQuestion.id)) return;
            const text = result.message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
            if (result.isAbort || result.isDisconnect || result.isError || result.finishReason !== "stop" || !text.trim()) {
                setFailure({ chatId: options.id, error: new Error(INCOMPLETE_ANSWER) });
            }
            options.onFinish?.(result);
        },
    });
    useLayoutEffect(() => { currentMessages.current = chat.messages; }, [chat.messages]);
    const { stop } = chat;
    useEffect(() => {
        active.current = true;
        return () => { active.current = false; void stop?.(); };
    }, [stop]);

    const error = chat.error || (failure?.chatId === options.id ? failure?.error : undefined);
    const streaming = chat.status === "streaming" || chat.status === "submitted";
    const last = chat.messages.at(-1);
    const withoutPendingAnswer = () => last?.role === "assistant" ? chat.messages.slice(0, -1) : chat.messages;
    const messages = error ? withoutPendingAnswer() : chat.messages;
    const completedMessages = streaming || error ? withoutPendingAnswer() : chat.messages;
    const sendMessage: typeof chat.sendMessage = async (...args) => {
        if (error) chat.setMessages?.(messages);
        requestChatId.current = options.id;
        setFailure(undefined);
        return chat.sendMessage(...args);
    };
    const regenerate: typeof chat.regenerate = async (...args) => {
        if (error) chat.setMessages?.(messages);
        requestChatId.current = options.id;
        setFailure(undefined);
        return chat.regenerate(...args);
    };
    return { ...chat, messages, completedMessages, error, sendMessage, regenerate };
}
