"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Eye, EyeOff, Save, Check, X } from "lucide-react";
import type { HomepageSection } from "@/types/database";

const FILTER_TYPES = [
    { value: "author", label: "Author contains" },
    { value: "title", label: "Title contains" },
    { value: "category", label: "Category equals" },
    { value: "featured", label: "Featured items" },
] as const;

export default function SectionsPage() {
    const [sections, setSections] = useState<HomepageSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Deleting state
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // New section form
    const [showForm, setShowForm] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newFilterType, setNewFilterType] = useState<HomepageSection["filter_type"]>("author");
    const [newFilterValue, setNewFilterValue] = useState("");

    // Fetch sections
    useEffect(() => {
        fetchSections();
    }, []);

    async function fetchSections() {
        try {
            const res = await fetch("/api/admin/sections");
            if (res.ok) {
                const data = await res.json();
                setSections(data);
            }
        } catch (error) {
            console.error("Failed to fetch sections:", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddSection(e: React.FormEvent) {
        e.preventDefault();

        if (!newTitle.trim()) return;
        if (newFilterType !== "featured" && !newFilterValue.trim()) return;

        setSaving(true);
        try {
            const res = await fetch("/api/admin/sections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: newTitle,
                    filter_type: newFilterType,
                    filter_value: newFilterType === "featured" ? "true" : newFilterValue,
                }),
            });

            if (res.ok) {
                await fetchSections();
                setNewTitle("");
                setNewFilterValue("");
                setShowForm(false);
            } else {
                const errorData = await res.json();
                alert(`Error: ${errorData.error}`);
            }
        } catch (error) {
            console.error("Failed to add section:", error);
            alert("Failed to add section");
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleActive(section: HomepageSection) {
        try {
            const res = await fetch(`/api/admin/sections/${section.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !section.is_active }),
            });

            if (res.ok) {
                setSections((prev) =>
                    prev.map((s) =>
                        s.id === section.id ? { ...s, is_active: !s.is_active } : s
                    )
                );
            }
        } catch (error) {
            console.error("Failed to toggle section:", error);
        }
    }

    async function handleDelete(id: string) {
        try {
            const res = await fetch(`/api/admin/sections/${id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                setSections((prev) => prev.filter((s) => s.id !== id));
                setDeletingId(null);
            } else {
                console.error("Failed to delete section");
                alert("Failed to delete section");
            }
        } catch (error) {
            console.error("Failed to delete section:", error);
            alert("Error deleting section");
        }
    }

    async function handleReorder(index: number, direction: "up" | "down") {
        const newIndex = direction === "up" ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= sections.length) return;

        const newSections = [...sections];
        [newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]];

        // Update order_index for both
        setSections(newSections);

        try {
            await Promise.all([
                fetch(`/api/admin/sections/${newSections[index].id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ order_index: index }),
                }),
                fetch(`/api/admin/sections/${newSections[newIndex].id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ order_index: newIndex }),
                }),
            ]);
        } catch (error) {
            console.error("Failed to reorder:", error);
            fetchSections(); // Revert on error
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900">Homepage Sections</h1>
                    <p className="text-zinc-500 mt-1">
                        Manage the content lanes that appear on the homepage
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
                >
                    <Plus className="size-4" />
                    Add Section
                </button>
            </div>

            {/* Add Section Form */}
            {showForm && (
                <form
                    onSubmit={handleAddSection}
                    className="p-6 bg-white rounded-xl border border-zinc-200 space-y-4 shadow-sm"
                >
                    <h3 className="font-semibold text-zinc-900">New Section</h3>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div>
                            <label className="block text-sm font-medium mb-2 text-zinc-700">Section Title</label>
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="e.g., Diary of a CEO"
                                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-zinc-900 placeholder:text-zinc-400"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2 text-zinc-700">Filter Type</label>
                            <select
                                value={newFilterType}
                                onChange={(e) => setNewFilterType(e.target.value as HomepageSection["filter_type"])}
                                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-zinc-900"
                            >
                                {FILTER_TYPES.map((type) => (
                                    <option key={type.value} value={type.value}>
                                        {type.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {newFilterType !== "featured" && (
                            <div>
                                <label className="block text-sm font-medium mb-2 text-zinc-700">Filter Value</label>
                                <input
                                    type="text"
                                    value={newFilterValue}
                                    onChange={(e) => setNewFilterValue(e.target.value)}
                                    placeholder="e.g., Steven Bartlett"
                                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-zinc-900 placeholder:text-zinc-400"
                                    required
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                        >
                            <Save className="size-4" />
                            {saving ? "Saving..." : "Save Section"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="px-4 py-2 bg-white border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* Sections List */}
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                {sections.length === 0 ? (
                    <div className="p-12 text-center text-zinc-500">
                        <p>No sections yet. Add your first section above!</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-zinc-50 border-b border-zinc-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider w-12">Order</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Title</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Filter</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider w-24">Status</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider w-32">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {sections.map((section, index) => (
                                <tr key={section.id} className="hover:bg-zinc-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            <button
                                                onClick={() => handleReorder(index, "up")}
                                                disabled={index === 0}
                                                className="p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-30 transition-colors"
                                            >
                                                ▲
                                            </button>
                                            <button
                                                onClick={() => handleReorder(index, "down")}
                                                disabled={index === sections.length - 1}
                                                className="p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-30 transition-colors"
                                            >
                                                ▼
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 font-medium text-zinc-900">{section.title}</td>
                                    <td className="px-4 py-3 text-zinc-500">
                                        <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-1 rounded border border-zinc-200">
                                            {section.filter_type}
                                        </span>
                                        <span className="ml-2">{section.filter_value}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => handleToggleActive(section)}
                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${section.is_active
                                                ? "bg-green-100 text-green-700 border border-green-200"
                                                : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                                                }`}
                                        >
                                            {section.is_active ? (
                                                <>
                                                    <Eye className="size-3" /> Active
                                                </>
                                            ) : (
                                                <>
                                                    <EyeOff className="size-3" /> Hidden
                                                </>
                                            )}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {deletingId === section.id ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleDelete(section.id)}
                                                    className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                                    title="Confirm Delete"
                                                >
                                                    <Check className="size-4" />
                                                </button>
                                                <button
                                                    onClick={() => setDeletingId(null)}
                                                    className="p-2 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors"
                                                    title="Cancel"
                                                >
                                                    <X className="size-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setDeletingId(section.id)}
                                                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete section"
                                            >
                                                <Trash2 className="size-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
