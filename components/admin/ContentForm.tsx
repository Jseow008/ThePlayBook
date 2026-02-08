"use client";

/**
 * Content Form Component
 * 
 * Reusable form for creating and editing content items.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Loader2,
    Plus,
    Trash2,
    GripVertical,
    AlertCircle,
    BookOpen,
    Headphones,
    FileText,
    UploadCloud,
    Image as ImageIcon,
    Music,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ArtifactEditor, Artifact } from "./ArtifactEditor";

// DnD Kit Imports
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

interface Segment {
    id?: string;
    client_id: string; // Used for DnD keys
    order_index: number;
    title: string;
    markdown_body: string;
    start_time_sec?: number;
    end_time_sec?: number;
}

interface QuickModeJson {
    hook: string;
    big_idea: string;
    key_takeaways: string[];
}

interface ContentFormData {
    id?: string;
    title: string;
    author: string;
    type: "podcast" | "book" | "article";
    category: string;
    source_url: string;
    cover_image_url: string;
    audio_url: string;
    duration_seconds: number | null;
    status: "draft" | "verified";
    is_featured: boolean;
    quick_mode_json: QuickModeJson | null;
    segments: Segment[];
    artifacts: Artifact[];
}

interface ContentFormProps {
    initialData?: Omit<ContentFormData, "segments" | "artifacts"> & {
        segments: Omit<Segment, "client_id">[];
        artifacts?: Array<{ id?: string; type: "checklist"; payload_schema: { title: string; items: Array<{ id: string; label: string; mandatory: boolean }> } }>;
    };
    isEditing?: boolean;
}

const defaultQuickMode: QuickModeJson = {
    hook: "",
    big_idea: "",
    key_takeaways: ["", "", ""],
};

const CATEGORIES = [
    "Health",
    "Fitness",
    "Wealth",
    "Finance",
    "Productivity",
    "Mindset",
    "Relationships",
    "Science",
    "Business",
    "Philosophy",
    "Technology",
    "Lifestyle",
];

const generateId = () => Math.random().toString(36).substr(2, 9);

const defaultFormData: ContentFormData = {
    title: "",
    author: "",
    type: "podcast",
    category: "",
    source_url: "",
    cover_image_url: "",
    audio_url: "",
    duration_seconds: null,
    status: "draft",
    is_featured: false,
    quick_mode_json: defaultQuickMode,
    segments: [],
    artifacts: [],
};

// Sortable Segment Item Component
function SortableSegmentItem({
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
            {/* Segment Header */}
            <div
                className="flex items-center gap-3 px-4 py-3 bg-zinc-50 cursor-pointer"
                onClick={onToggle}
            >
                {/* Drag Handle */}
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab hover:text-zinc-700 text-zinc-400 touch-none"
                    onClick={(e) => e.stopPropagation()} // Prevent expansion when clicking handle
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

            {/* Segment Content (Expanded) */}
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

export function ContentForm({ initialData, isEditing = false }: ContentFormProps) {
    const router = useRouter();

    // Initialize form data with client_ids for segments and artifacts if missing
    const [formData, setFormData] = useState<ContentFormData>(() => {
        const data = initialData ? (initialData as unknown as ContentFormData) : defaultFormData;
        return {
            ...data,
            segments: (data.segments || []).map((s) => ({
                ...s,
                client_id: s.client_id || s.id || generateId(),
            })),
            artifacts: (data.artifacts || []).map((a) => ({
                ...a,
                client_id: a.client_id || a.id || generateId(),
            })),
        };
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [expandedSegment, setExpandedSegment] = useState<string | null>(null); // Use ID instead of index
    const [isUploading, setIsUploading] = useState(false);
    const [isUploadingAudio, setIsUploadingAudio] = useState(false);

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const updateField = <K extends keyof ContentFormData>(
        field: K,
        value: ContentFormData[K]
    ) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (fieldErrors[field]) {
            setFieldErrors((prev) => {
                const next = { ...prev };
                delete next[field];
                return next;
            });
        }
    };

    const updateQuickMode = <K extends keyof QuickModeJson>(
        field: K,
        value: QuickModeJson[K]
    ) => {
        setFormData((prev) => ({
            ...prev,
            quick_mode_json: {
                ...(prev.quick_mode_json || defaultQuickMode),
                [field]: value,
            },
        }));
    };

    const updateTakeaway = (index: number, value: string) => {
        const takeaways = [...(formData.quick_mode_json?.key_takeaways || [])];
        takeaways[index] = value;
        updateQuickMode("key_takeaways", takeaways);
    };

    const addTakeaway = () => {
        const takeaways = [...(formData.quick_mode_json?.key_takeaways || []), ""];
        updateQuickMode("key_takeaways", takeaways);
    };

    const removeTakeaway = (index: number) => {
        const takeaways = (formData.quick_mode_json?.key_takeaways || []).filter(
            (_, i) => i !== index
        );
        updateQuickMode("key_takeaways", takeaways);
    };

    const addSegment = () => {
        const newSegment: Segment = {
            client_id: generateId(),
            order_index: formData.segments.length + 1,
            title: "",
            markdown_body: "",
        };
        setFormData((prev) => ({
            ...prev,
            segments: [...prev.segments, newSegment],
        }));
        setExpandedSegment(newSegment.client_id);
    };

    const updateSegment = (index: number, updates: Partial<Segment>) => {
        setFormData((prev) => ({
            ...prev,
            segments: prev.segments.map((seg, i) =>
                i === index ? { ...seg, ...updates } : seg
            ),
        }));
    };

    const removeSegment = (index: number) => {
        setFormData((prev) => ({
            ...prev,
            segments: prev.segments
                .filter((_, i) => i !== index)
                .map((seg, i) => ({ ...seg, order_index: i + 1 })),
        }));
        setExpandedSegment(null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id) {
            setFormData((prev) => {
                const oldIndex = prev.segments.findIndex((s) => s.client_id === active.id);
                const newIndex = prev.segments.findIndex((s) => s.client_id === over?.id);

                const newSegments = arrayMove(prev.segments, oldIndex, newIndex);

                // Re-assign order indices
                return {
                    ...prev,
                    segments: newSegments.map((s, i) => ({ ...s, order_index: i + 1 })),
                };
            });
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setError(""); // Clear previous errors

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch("/api/admin/upload", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Upload failed");
            }

            const data = await response.json();
            updateField("cover_image_url", data.url);
        } catch (err: any) {
            console.error("Upload failed:", err);
            setError(err.message || "Failed to upload image. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingAudio(true);
        setError("");

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch("/api/admin/upload-audio", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Upload failed");
            }

            const data = await response.json();
            updateField("audio_url", data.url);
        } catch (err: any) {
            console.error("Audio upload failed:", err);
            setError(err.message || "Failed to upload audio. Please try again.");
        } finally {
            setIsUploadingAudio(false);
        }
    };

    const handleSubmit = async (status: "draft" | "verified") => {
        setError("");
        setIsSubmitting(true);

        // Remove client_id before submitting
        const segmentsToSubmit = formData.segments.map(({ client_id, ...rest }) => rest);
        const artifactsToSubmit = formData.artifacts.map(({ client_id, ...rest }) => rest);

        const dataToSubmit = {
            ...formData,
            status,
            segments: segmentsToSubmit,
            artifacts: artifactsToSubmit,
            is_featured: formData.is_featured || false,
            duration_seconds: formData.duration_seconds || null,
            source_url: formData.source_url || null,
            cover_image_url: formData.cover_image_url || null,
            audio_url: formData.audio_url || null,
            category: formData.category || null,
        };

        try {
            const url = isEditing
                ? `/api/admin/content/${formData.id}`
                : "/api/admin/content";
            const method = isEditing ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dataToSubmit),
            });

            const data = await response.json();

            if (data.success) {
                router.push("/admin");
                router.refresh();
            } else {
                if (data.error?.details && Array.isArray(data.error.details)) {
                    const errors: Record<string, string> = {};
                    data.error.details.forEach((err: { path: string[]; message: string }) => {
                        const fieldName = err.path.join('.');
                        errors[fieldName] = err.message;
                    });
                    setFieldErrors(errors);
                    setError(`Please fix ${Object.keys(errors).length} validation error(s) below.`);
                } else {
                    setError(data.error?.message || "Failed to save content");
                }
            }
        } catch {
            setError("An error occurred. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const typeIcons = {
        podcast: Headphones,
        book: BookOpen,
        article: FileText,
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Error Message */}
            {error && (
                <div className="flex flex-col gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                    {Object.keys(fieldErrors).length > 0 && (
                        <ul className="list-disc list-inside text-sm pl-7">
                            {Object.entries(fieldErrors).map(([field, msg]) => (
                                <li key={field}>
                                    <span className="font-semibold">{field}:</span> {msg}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Featured Toggle */}
            <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-zinc-200 shadow-sm">
                <div>
                    <h3 className="text-sm font-medium text-zinc-900">Featured Content</h3>
                    <p className="text-xs text-zinc-500">Show this item in the Homepage Hero Carousel.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        checked={formData.is_featured}
                        onChange={(e) => updateField("is_featured", e.target.checked)}
                        className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-zinc-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                </label>
            </div>

            {/* Basic Info */}
            <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-6">
                <h2 className="text-lg font-semibold text-zinc-900">Basic Information</h2>

                <div className="grid gap-6 md:grid-cols-2">
                    {/* Title */}
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Title <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => updateField("title", e.target.value)}
                            placeholder="Enter content title"
                            className={`w-full px-4 py-2 bg-white text-zinc-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent ${fieldErrors.title ? 'border-red-500 bg-red-50' : 'border-zinc-300'}`}
                        />
                        {fieldErrors.title && (
                            <p className="mt-1 text-sm text-red-600">{fieldErrors.title}</p>
                        )}
                    </div>

                    {/* Author */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Author
                        </label>
                        <input
                            type="text"
                            value={formData.author}
                            onChange={(e) => updateField("author", e.target.value)}
                            placeholder="Author name"
                            className="w-full px-4 py-2 bg-white text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Category
                        </label>
                        <select
                            value={formData.category}
                            onChange={(e) => updateField("category", e.target.value)}
                            className="w-full px-4 py-2 bg-white text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                        >
                            <option value="">Select a category</option>
                            {CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Type <span className="text-red-500">*</span>
                        </label>
                        <div className={`flex gap-2 ${fieldErrors.type ? 'ring-2 ring-red-500 rounded-lg' : ''}`}>
                            {(["podcast", "book", "article"] as const).map((type) => {
                                const Icon = typeIcons[type];
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => updateField("type", type)}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${formData.type === type
                                            ? "border-zinc-900 bg-zinc-900 text-white"
                                            : "border-zinc-300 text-zinc-600 hover:border-zinc-400"
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="capitalize">{type}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {fieldErrors.type && (
                            <p className="mt-1 text-sm text-red-600">{fieldErrors.type}</p>
                        )}
                    </div>

                    {/* Source URL */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Original Source Link <span className="text-zinc-400 font-normal">(Optional)</span>
                        </label>
                        <input
                            type="url"
                            value={formData.source_url}
                            onChange={(e) => updateField("source_url", e.target.value)}
                            placeholder="https://..."
                            className={`w-full px-4 py-2 bg-white text-zinc-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent ${fieldErrors.source_url ? 'border-red-500 bg-red-50' : 'border-zinc-300'}`}
                        />
                        {fieldErrors.source_url && (
                            <p className="mt-1 text-sm text-red-600">{fieldErrors.source_url}</p>
                        )}
                    </div>

                    {/* Cover Image */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Cover Image
                        </label>
                        <div className="space-y-4">
                            {/* Upload Area */}
                            <label
                                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isUploading
                                    ? "bg-zinc-50 border-zinc-300"
                                    : "border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400"
                                    }`}
                            >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    {isUploading ? (
                                        <>
                                            <Loader2 className="w-8 h-8 mb-2 text-zinc-500 animate-spin" />
                                            <p className="text-sm text-zinc-500">Uploading...</p>
                                        </>
                                    ) : (
                                        <>
                                            <UploadCloud className="w-8 h-8 mb-2 text-zinc-400" />
                                            <p className="text-sm text-zinc-500 font-medium">Click to upload cover image</p>
                                            <p className="text-xs text-zinc-400 mt-1">SVG, PNG, JPG or GIF</p>
                                        </>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    disabled={isUploading}
                                />
                            </label>

                            {/* Manual URL Input (Optional / Fallback) */}
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                    <ImageIcon className="w-4 h-4 text-zinc-400" />
                                </div>
                                <input
                                    type="url"
                                    value={formData.cover_image_url}
                                    onChange={(e) => updateField("cover_image_url", e.target.value)}
                                    placeholder="Or paste image URL directly..."
                                    className={`w-full pl-10 pr-4 py-2 bg-white text-zinc-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent ${fieldErrors.cover_image_url ? 'border-red-500 bg-red-50' : 'border-zinc-300'}`}
                                />
                            </div>

                            {/* Preview */}
                            {formData.cover_image_url && (
                                <div className="relative w-40 aspect-[2/3] rounded-lg overflow-hidden border border-zinc-200 bg-zinc-50 shadow-sm">
                                    <img
                                        src={formData.cover_image_url}
                                        alt="Preview"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect fill='%23f4f4f5' width='200' height='300'/%3E%3Ctext x='50%25' y='50%25' fill='%23a1a1aa' font-family='sans-serif' font-size='14' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E";
                                        }}
                                    />
                                    {/* Remove Button */}
                                    <button
                                        type="button"
                                        onClick={() => updateField("cover_image_url", "")}
                                        className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-red-600 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                        {fieldErrors.cover_image_url && (
                            <p className="mt-1 text-sm text-red-600">{fieldErrors.cover_image_url}</p>
                        )}
                    </div>

                    {/* Audio File (Read For Me) */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Audio Narration <span className="text-zinc-400 font-normal">(Optional - "Read For Me")</span>
                        </label>
                        <div className="space-y-4">
                            {/* Upload Area */}
                            <label
                                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isUploadingAudio
                                    ? "bg-zinc-50 border-zinc-300"
                                    : "border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400"
                                    }`}
                            >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    {isUploadingAudio ? (
                                        <>
                                            <Loader2 className="w-8 h-8 mb-2 text-zinc-500 animate-spin" />
                                            <p className="text-sm text-zinc-500">Uploading audio...</p>
                                        </>
                                    ) : (
                                        <>
                                            <Music className="w-8 h-8 mb-2 text-zinc-400" />
                                            <p className="text-sm text-zinc-500 font-medium">Click to upload audio file</p>
                                            <p className="text-xs text-zinc-400 mt-1">MP3, WAV, or M4A (max 50MB)</p>
                                        </>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="audio/*"
                                    onChange={handleAudioUpload}
                                    disabled={isUploadingAudio}
                                />
                            </label>

                            {/* Manual URL Input */}
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                    <Music className="w-4 h-4 text-zinc-400" />
                                </div>
                                <input
                                    type="url"
                                    value={formData.audio_url}
                                    onChange={(e) => updateField("audio_url", e.target.value)}
                                    placeholder="Or paste audio URL directly..."
                                    className="w-full pl-10 pr-4 py-2 bg-white text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                                />
                            </div>

                            {/* Audio Preview */}
                            {formData.audio_url && (
                                <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                                    <Music className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                                    <audio
                                        controls
                                        className="flex-1 h-10"
                                        src={formData.audio_url}
                                    >
                                        Your browser does not support the audio element.
                                    </audio>
                                    <button
                                        type="button"
                                        onClick={() => updateField("audio_url", "")}
                                        className="p-1 text-zinc-400 hover:text-red-600 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Duration */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Duration (minutes) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            value={formData.duration_seconds ? Math.round(formData.duration_seconds / 60) : ""}
                            onChange={(e) =>
                                updateField(
                                    "duration_seconds",
                                    e.target.value ? parseInt(e.target.value) * 60 : null
                                )
                            }
                            placeholder="60"
                            min="1"
                            className="w-full px-4 py-2 bg-white text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                        />
                    </div>
                </div>
            </section>

            {/* Quick Mode */}
            <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-6">
                <h2 className="text-lg font-semibold text-zinc-900">Quick Mode Content</h2>
                <p className="text-sm text-zinc-500">
                    This is the summary view that readers see first.
                </p>

                <div className="space-y-4">
                    {/* Hook */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Hook
                        </label>
                        <input
                            type="text"
                            value={formData.quick_mode_json?.hook || ""}
                            onChange={(e) => updateQuickMode("hook", e.target.value)}
                            placeholder="One attention-grabbing sentence"
                            className={`w-full px-4 py-2 bg-white text-zinc-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent ${fieldErrors['quick_mode_json.hook'] ? 'border-red-500 bg-red-50' : 'border-zinc-300'}`}
                        />
                        {fieldErrors['quick_mode_json.hook'] && (
                            <p className="mt-1 text-sm text-red-600">{fieldErrors['quick_mode_json.hook']}</p>
                        )}
                    </div>

                    {/* Big Idea */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Big Idea
                        </label>
                        <textarea
                            value={formData.quick_mode_json?.big_idea || ""}
                            onChange={(e) => updateQuickMode("big_idea", e.target.value)}
                            placeholder="The core thesis or main takeaway"
                            rows={2}
                            className={`w-full px-4 py-2 bg-white text-zinc-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-none ${fieldErrors['quick_mode_json.big_idea'] ? 'border-red-500 bg-red-50' : 'border-zinc-300'}`}
                        />
                        {fieldErrors['quick_mode_json.big_idea'] && (
                            <p className="mt-1 text-sm text-red-600">{fieldErrors['quick_mode_json.big_idea']}</p>
                        )}
                    </div>

                    {/* Key Takeaways */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Key Takeaways
                        </label>
                        <div className="space-y-2">
                            {(formData.quick_mode_json?.key_takeaways || []).map(
                                (takeaway, index) => (
                                    <div key={index} className="flex gap-2">
                                        <input
                                            type="text"
                                            value={takeaway}
                                            onChange={(e) => updateTakeaway(index, e.target.value)}
                                            placeholder={`Takeaway ${index + 1}`}
                                            className="flex-1 px-4 py-2 bg-white text-zinc-900 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeTakeaway(index)}
                                            className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )
                            )}
                            <button
                                type="button"
                                onClick={addTakeaway}
                                className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900"
                            >
                                <Plus className="w-4 h-4" />
                                Add takeaway
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Segments (Deep Mode) */}
            <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-zinc-900">
                            Segments (Deep Mode)
                        </h2>
                        <p className="text-sm text-zinc-500">
                            Full content broken into readable sections. Drag to reorder.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={addSegment}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Segment
                    </button>
                </div>

                <div className="space-y-3">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={formData.segments.map((s) => s.client_id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {formData.segments.length > 0 ? (
                                formData.segments.map((segment, index) => (
                                    <SortableSegmentItem
                                        key={segment.client_id}
                                        segment={segment}
                                        index={index}
                                        expanded={expandedSegment === segment.client_id}
                                        onToggle={() =>
                                            setExpandedSegment(
                                                expandedSegment === segment.client_id ? null : segment.client_id
                                            )
                                        }
                                        onUpdate={(updates) => updateSegment(index, updates)}
                                        onRemove={() => removeSegment(index)}
                                    />
                                ))
                            ) : (
                                <div className="text-center py-8 text-zinc-500 bg-zinc-50 rounded-lg border border-dashed border-zinc-300">
                                    <p>No segments yet.</p>
                                    <button
                                        type="button"
                                        onClick={addSegment}
                                        className="text-zinc-900 font-medium hover:underline mt-1"
                                    >
                                        Add your first segment
                                    </button>
                                </div>
                            )}
                        </SortableContext>
                    </DndContext>
                </div>
            </section>

            {/* Interactive Learning (Artifacts) */}
            <ArtifactEditor
                artifacts={formData.artifacts}
                onChange={(artifacts) => updateField("artifacts", artifacts)}
            />

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
                <button
                    type="button"
                    onClick={() => router.push("/admin")}
                    className="px-4 py-2 text-zinc-600 hover:text-zinc-900 font-medium transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => handleSubmit("draft")}
                    disabled={isSubmitting || !formData.title}
                    className="px-4 py-2 border border-zinc-300 rounded-lg font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                >
                    {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        "Save as Draft"
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => handleSubmit("verified")}
                    disabled={isSubmitting || !formData.title}
                    className="px-4 py-2 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                    {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        "Publish"
                    )}
                </button>
            </div>
        </div>
    );
}
