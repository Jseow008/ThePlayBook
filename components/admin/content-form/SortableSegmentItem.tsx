import { GripVertical, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Segment } from "@/components/admin/content-form/types";

export function SortableSegmentItem({
    segment,
    index,
    expanded,
    onToggle,
    onUpdate,
    onRemove,
}: {
    segment: Segment;
    index: number;
    expanded: boolean;
    onToggle: () => void;
    onUpdate: (updates: Partial<Segment>) => void;
    onRemove: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: segment.client_id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="border border-zinc-200 rounded-lg overflow-hidden bg-white mb-3"
        >
            <div
                className="flex items-center gap-3 px-4 py-3 bg-zinc-50 cursor-pointer"
                onClick={onToggle}
            >
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab hover:text-zinc-700 text-zinc-400 touch-none"
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical className="w-5 h-5" />
                </div>

                <span className="w-6 h-6 flex items-center justify-center bg-zinc-200 rounded text-xs font-medium text-zinc-600">
                    {index + 1}
                </span>
                <span className="flex-1 font-medium text-zinc-900 truncate">
                    {segment.title || `Segment ${index + 1}`}
                </span>

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                        className="p-1 text-zinc-400 hover:text-red-600"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="p-4 space-y-4 border-t border-zinc-200 bg-white">
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Segment Title
                        </label>
                        <input
                            type="text"
                            value={segment.title}
                            onChange={(e) => onUpdate({ title: e.target.value })}
                            placeholder="Segment title"
                            className="w-full px-4 py-2 bg-white text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Content (Markdown)
                        </label>
                        <textarea
                            value={segment.markdown_body}
                            onChange={(e) => onUpdate({ markdown_body: e.target.value })}
                            placeholder="Write segment content in Markdown..."
                            rows={10}
                            className="w-full px-4 py-2 bg-white text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent font-mono text-sm resize-y"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
