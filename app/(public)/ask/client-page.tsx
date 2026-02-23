"use client";

import { useRef, useEffect } from "react";
import { useChat } from "ai/react";
import { Bot, User, Send, Sparkles, Loader2, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

export function AskClientPage() {
    const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
        api: "/api/chat",
        initialMessages: [
            {
                id: "welcome",
                role: "assistant",
                content: "Hi! I'm your Second Brain. Ask me anything about the books you've saved in your library, and I'll find the answers for you.",
            },
        ],
    });

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    return (
        <div className="flex flex-col h-[100dvh] bg-background">
            {/* Header */}
            <header className="flex-shrink-0 h-16 border-b border-border bg-card/50 flex items-center px-4 sm:px-6 sticky top-0 z-10 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Sparkles className="size-4.5 text-primary" />
                    </div>
                    <h1 className="text-lg font-bold tracking-tight">Ask My Library</h1>
                </div>
            </header>

            {/* Chat Area */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-32">
                <div className="max-w-3xl mx-auto space-y-6">
                    {messages.map((m: any) => (
                        <div
                            key={m.id}
                            className={cn(
                                "flex gap-4 w-full animate-in fade-in slide-in-from-bottom-2",
                                m.role === "user" ? "justify-end" : "justify-start"
                            )}
                        >
                            {/* Assistant Avatar */}
                            {m.role === "assistant" && (
                                <div className="flex-shrink-0 size-8 rounded-full bg-primary/20 flex items-center justify-center mt-1">
                                    <Bot className="size-4.5 text-primary" />
                                </div>
                            )}

                            {/* Message Bubble */}
                            <div
                                className={cn(
                                    "max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-4 shadow-sm",
                                    m.role === "user"
                                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                                        : "bg-card border border-border/50 rounded-tl-sm text-foreground"
                                )}
                            >
                                <div
                                    className={cn(
                                        "prose prose-sm max-w-none",
                                        m.role === "user" ? "text-primary-foreground dark:prose-invert" : "dark:prose-invert"
                                    )}
                                >
                                    {m.role === "user" ? (
                                        <p className="m-0 leading-relaxed text-[0.95rem]">{m.content}</p>
                                    ) : (
                                        <ReactMarkdown>{m.content}</ReactMarkdown>
                                    )}
                                </div>

                                {/* Citation Pattern matching if needed */}
                                {/* For MVP, we let markdown handle standard links if the LLM generates them. */}
                            </div>

                            {/* User Avatar */}
                            {m.role === "user" && (
                                <div className="flex-shrink-0 size-8 rounded-full bg-zinc-700 flex items-center justify-center mt-1">
                                    <User className="size-4.5 text-zinc-300" />
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Loading Indicator */}
                    {isLoading && messages[messages.length - 1]?.role === "user" && (
                        <div className="flex gap-4 w-full animate-in fade-in">
                            <div className="flex-shrink-0 size-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <Bot className="size-4.5 text-primary" />
                            </div>
                            <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-2">
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                <span className="text-sm text-muted-foreground font-medium">Reading your library...</span>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </main>

            {/* Input Fixed at Bottom */}
            <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-10 pb-6 px-4">
                <div className="max-w-3xl mx-auto">
                    <form
                        onSubmit={handleSubmit}
                        className="relative flex items-end gap-2 bg-card rounded-2xl border border-border/60 shadow-xl overflow-hidden focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all"
                    >
                        <textarea
                            value={input}
                            onChange={handleInputChange}
                            placeholder="Ask about your books..."
                            className="flex-1 max-h-48 min-h-[56px] w-full resize-none bg-transparent px-5 py-4 text-[0.95rem] outline-none placeholder:text-muted-foreground/70 scrollbar-thin overflow-y-auto"
                            rows={1}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    if (input.trim() && !isLoading) {
                                        handleSubmit(e as any);
                                    }
                                }
                            }}
                        />
                        <div className="mb-2 mr-2">
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors focus-ring"
                            >
                                <Send className="size-4 ml-0.5" />
                            </button>
                        </div>
                    </form>
                    <div className="mt-3 text-center">
                        <p className="text-[0.65rem] text-muted-foreground font-medium flex items-center justify-center gap-1.5 opacity-60">
                            <BookOpen className="size-3" />
                            Second Brain searches only your saved library content.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
