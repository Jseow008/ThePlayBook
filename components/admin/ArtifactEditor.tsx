"use client";

/**
 * Artifact Editor Component
 * 
 * Allows creating and editing interactive learning artifacts (checklists).
 * Used in the ContentForm for admin content management.
 */

import { useState } from "react";
import {
    Plus,
    Trash2,
    GripVertical,
    CheckSquare,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Checklist item structure matching the database schema
export interface ChecklistItem {
    id: string;
    label: string;
    mandatory: boolean;
}

export interface ChecklistPayload {
    title: string;
    items: ChecklistItem[];
}

export interface Artifact {
    id?: string;
    client_id: string; // For DnD keys
    type: "checklist";
    payload_schema: ChecklistPayload;
}

interface ArtifactEditorProps {
    artifacts: Artifact[];
    onChange: (artifacts: Artifact[]) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

// Sortable Checklist Item
function SortableChecklistItem({
    item,
    onUpdate,
    onRemove,
}: {
    item: ChecklistItem;
    onUpdate: (updates: Partial<ChecklistItem>) => void;
    onRemove: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-2 p-2 bg-zinc-50 rounded-lg border border-zinc-200"
        >
            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab hover:text-zinc-700 text-zinc-400 touch-none"
            >
                <GripVertical className="w-4 h-4" />
            </div>

            {/* Checkbox Icon */}
            <div className={`w-5 h-5 rounded border flex items-center justify-center ${item.mandatory ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300"
                }`}>
                {item.mandatory && <CheckSquare className="w-3 h-3" />}
            </div>

            {/* Label Input */}
            <input
                type="text"
                value={item.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
                placeholder="Checklist item..."
                className="flex-1 px-2 py-1 bg-white text-zinc-900 border border-zinc-200 rounded focus:outline-none focus:ring-1 focus:ring-zinc-900 text-sm"
            />

            {/* Mandatory Toggle */}
            <button
                type="button"
                onClick={() => onUpdate({ mandatory: !item.mandatory })}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${item.mandatory
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    }`}
            >
                {item.mandatory ? "Required" : "Optional"}
            </button>

            {/* Remove Button */}
            <button
                type="button"
                onClick={onRemove}
                className="p-1 text-zinc-400 hover:text-red-600"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}

// Single Artifact Card
function ArtifactCard({
    artifact,
    expanded,
    onToggle,
    onUpdate,
    onRemove,
}: {
    artifact: Artifact;
    expanded: boolean;
    onToggle: () => void;
    onUpdate: (artifact: Artifact) => void;
    onRemove: () => void;
}) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const items = artifact.payload_schema.items;

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id) {
            const oldIndex = items.findIndex((i) => i.id === active.id);
            const newIndex = items.findIndex((i) => i.id === over?.id);
            const newItems = arrayMove(items, oldIndex, newIndex);

            onUpdate({
                ...artifact,
                payload_schema: {
                    ...artifact.payload_schema,
                    items: newItems,
                },
            });
        }
    };

    const updateItem = (index: number, updates: Partial<ChecklistItem>) => {
        const newItems = items.map((item, i) =>
            i === index ? { ...item, ...updates } : item
        );
        onUpdate({
            ...artifact,
            payload_schema: {
                ...artifact.payload_schema,
                items: newItems,
            },
        });
    };

    const removeItem = (index: number) => {
        const newItems = items.filter((_, i) => i !== index);
        onUpdate({
            ...artifact,
            payload_schema: {
                ...artifact.payload_schema,
                items: newItems,
            },
        });
    };

    const addItem = () => {
        const newItem: ChecklistItem = {
            id: `task_${generateId()}`,
            label: "",
            mandatory: false,
        };
        onUpdate({
            ...artifact,
            payload_schema: {
                ...artifact.payload_schema,
                items: [...items, newItem],
            },
        });
    };

    const updateTitle = (title: string) => {
        onUpdate({
            ...artifact,
            payload_schema: {
                ...artifact.payload_schema,
                title,
            },
        });
    };

    return (
        <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white">
            {/* Header */}
            <div
                className="flex items-center gap-3 px-4 py-3 bg-zinc-50 cursor-pointer"
                onClick={onToggle}
            >
                <CheckSquare className="w-5 h-5 text-zinc-600" />
                <div className="flex-1">
                    <span className="font-medium text-zinc-900">
                        {artifact.payload_schema.title || "Untitled Checklist"}
                    </span>
                    <span className="text-sm text-zinc-500 ml-2">
                        • {items.length} {items.length === 1 ? "item" : "items"}
                    </span>
                </div>
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
                {expanded ? (
                    <ChevronDown className="w-5 h-5 text-zinc-400" />
                ) : (
                    <ChevronRight className="w-5 h-5 text-zinc-400" />
                )}
            </div>

            {/* Expanded Content */}
            {expanded && (
                <div className="p-4 space-y-4 border-t border-zinc-200">
                    {/* Checklist Title */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Checklist Title
                        </label>
                        <input
                            type="text"
                            value={artifact.payload_schema.title}
                            onChange={(e) => updateTitle(e.target.value)}
                            placeholder="e.g., Daily Deep Work Protocol"
                            className="w-full px-4 py-2 bg-white text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                        />
                    </div>

                    {/* Checklist Items */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-zinc-700">
                                Items
                            </label>
                            <button
                                type="button"
                                onClick={addItem}
                                className="flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
                            >
                                <Plus className="w-4 h-4" />
                                Add Item
                            </button>
                        </div>

                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={items.map((i) => i.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="space-y-2">
                                    {items.length > 0 ? (
                                        items.map((item, index) => (
                                            <SortableChecklistItem
                                                key={item.id}
                                                item={item}
                                                onUpdate={(updates) => updateItem(index, updates)}
                                                onRemove={() => removeItem(index)}
                                            />
                                        ))
                                    ) : (
                                        <p className="text-sm text-zinc-400 text-center py-4">
                                            No items yet. Add your first checklist item.
                                        </p>
                                    )}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>
            )}
        </div>
    );
}

// Main Artifact Editor Component
export function ArtifactEditor({ artifacts, onChange }: ArtifactEditorProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const addChecklist = () => {
        const newArtifact: Artifact = {
            client_id: generateId(),
            type: "checklist",
            payload_schema: {
                title: "",
                items: [],
            },
        };
        onChange([...artifacts, newArtifact]);
        setExpandedId(newArtifact.client_id);
    };

    const updateArtifact = (index: number, updated: Artifact) => {
        const newArtifacts = artifacts.map((a, i) => (i === index ? updated : a));
        onChange(newArtifacts);
    };

    const removeArtifact = (index: number) => {
        const newArtifacts = artifacts.filter((_, i) => i !== index);
        onChange(newArtifacts);
        setExpandedId(null);
    };

    return (
        <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-zinc-900">
                        Interactive Learning
                    </h2>
                    <p className="text-sm text-zinc-500">
                        Checklists and action items that readers can interact with.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={addChecklist}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Checklist
                </button>
            </div>

            <div className="space-y-3">
                {artifacts.length > 0 ? (
                    artifacts.map((artifact, index) => (
                        <ArtifactCard
                            key={artifact.client_id}
                            artifact={artifact}
                            expanded={expandedId === artifact.client_id}
                            onToggle={() =>
                                setExpandedId(
                                    expandedId === artifact.client_id ? null : artifact.client_id
                                )
                            }
                            onUpdate={(updated) => updateArtifact(index, updated)}
                            onRemove={() => removeArtifact(index)}
                        />
                    ))
                ) : (
                    <div className="text-center py-8 text-zinc-400">
                        <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p>No interactive learning content yet.</p>
                        <p className="text-sm">Add a checklist to help readers take action.</p>
                    </div>
                )}
            </div>
        </section>
    );
}
