import { Plus, Trash2 } from "lucide-react";
import type { QuickModeJson } from "@/components/admin/content-form/types";

export function QuickModeSection({
    quickMode,
    fieldErrors,
    onUpdateQuickMode,
    onUpdateTakeaway,
    onRemoveTakeaway,
    onAddTakeaway,
}: {
    quickMode: QuickModeJson | null;
    fieldErrors: Record<string, string>;
    onUpdateQuickMode: <K extends keyof QuickModeJson>(field: K, value: QuickModeJson[K]) => void;
    onUpdateTakeaway: (index: number, value: string) => void;
    onRemoveTakeaway: (index: number) => void;
    onAddTakeaway: () => void;
}) {
    return (
        <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-6">
            <h2 className="text-lg font-semibold text-zinc-900">Quick Mode Content</h2>
            <p className="text-sm text-zinc-500">
                This is the summary view that readers see first.
            </p>
            <p className="text-sm text-zinc-500">
                Longer entries use multiline fields so you can review the full copy while editing.
            </p>

            <div className="space-y-4">
                <div>
                    <label htmlFor="quick-mode-hook" className="block text-sm font-medium text-zinc-700 mb-2">
                        Hook
                    </label>
                    <textarea
                        id="quick-mode-hook"
                        value={quickMode?.hook || ""}
                        onChange={(e) => onUpdateQuickMode("hook", e.target.value)}
                        placeholder="One attention-grabbing sentence"
                        rows={3}
                        className={`w-full px-4 py-3 bg-white text-zinc-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-y ${fieldErrors["quick_mode_json.hook"] ? "border-red-500 bg-red-50" : "border-zinc-300"}`}
                    />
                    {fieldErrors["quick_mode_json.hook"] && (
                        <p className="mt-1 text-sm text-red-600">{fieldErrors["quick_mode_json.hook"]}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="quick-mode-big-idea" className="block text-sm font-medium text-zinc-700 mb-2">
                        Big Idea
                    </label>
                    <textarea
                        id="quick-mode-big-idea"
                        value={quickMode?.big_idea || ""}
                        onChange={(e) => onUpdateQuickMode("big_idea", e.target.value)}
                        placeholder="The core thesis or main takeaway"
                        rows={6}
                        className={`w-full min-h-40 px-4 py-3 bg-white text-zinc-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-y ${fieldErrors["quick_mode_json.big_idea"] ? "border-red-500 bg-red-50" : "border-zinc-300"}`}
                    />
                    {fieldErrors["quick_mode_json.big_idea"] && (
                        <p className="mt-1 text-sm text-red-600">{fieldErrors["quick_mode_json.big_idea"]}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                        Key Takeaways
                    </label>
                    <div className="space-y-2">
                        {(quickMode?.key_takeaways || []).map((takeaway, index) => (
                            <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                <textarea
                                    id={`quick-mode-takeaway-${index}`}
                                    aria-label={`Key takeaway ${index + 1}`}
                                    value={takeaway}
                                    onChange={(e) => onUpdateTakeaway(index, e.target.value)}
                                    placeholder={`Takeaway ${index + 1}`}
                                    rows={2}
                                    className="flex-1 px-4 py-3 bg-white text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-y"
                                />
                                <button
                                    type="button"
                                    onClick={() => onRemoveTakeaway(index)}
                                    aria-label={`Remove takeaway ${index + 1}`}
                                    className="self-end p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors sm:self-start sm:mt-1"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={onAddTakeaway}
                            className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900"
                        >
                            <Plus className="w-4 h-4" />
                            Add takeaway
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
