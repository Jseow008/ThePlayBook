"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Pencil, Trash2, X, Layers3 } from "lucide-react";

interface AdminSeriesRow {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    content_count: number;
    created_at: string;
    updated_at: string;
}

function slugify(value: string) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export default function AdminSeriesPage() {
    const [series, setSeries] = useState<AdminSeriesRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [description, setDescription] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [slugTouched, setSlugTouched] = useState(false);

    const generatedSlug = useMemo(() => slugify(title), [title]);
    const resolvedSlug = slugTouched ? slug : generatedSlug;

    useEffect(() => {
        void fetchSeries();
    }, []);

    async function fetchSeries() {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch("/api/admin/series", { method: "GET" });
            if (!response.ok) {
                throw new Error("Failed to fetch series");
            }

            const data = await response.json();
            setSeries(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to fetch series";
            setError(message);
        } finally {
            setLoading(false);
        }
    }

    function resetForm() {
        setTitle("");
        setSlug("");
        setDescription("");
        setEditingId(null);
        setShowForm(false);
        setSlugTouched(false);
    }

    function startCreate() {
        resetForm();
        setShowForm(true);
    }

    function startEdit(row: AdminSeriesRow) {
        setEditingId(row.id);
        setTitle(row.title);
        setSlug(row.slug);
        setDescription(row.description ?? "");
        setShowForm(true);
        setSlugTouched(true);
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();

        const payload = {
            title: title.trim(),
            slug: resolvedSlug.trim(),
            description: description.trim() || null,
        };

        if (!payload.title || !payload.slug) {
            setError("Title and slug are required.");
            return;
        }

        try {
            setSaving(true);
            setError(null);
            const response = await fetch(editingId ? `/api/admin/series/${editingId}` : "/api/admin/series", {
                method: editingId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error?.message ?? "Failed to save series");
            }

            await fetchSeries();
            resetForm();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to save series";
            setError(message);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        try {
            setSaving(true);
            setError(null);
            const response = await fetch(`/api/admin/series/${id}`, { method: "DELETE" });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error?.message ?? "Failed to delete series");
            }

            await fetchSeries();
            setDeleteId(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to delete series";
            setError(message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900">Content Series</h1>
                    <p className="mt-1 text-zinc-500">Create reusable series like Matthew, then assign content items to them from the content editor.</p>
                </div>
                <button
                    type="button"
                    onClick={startCreate}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                >
                    <Plus className="size-4" />
                    New Series
                </button>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {showForm && (
                <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-zinc-900">
                            {editingId ? "Edit Series" : "New Series"}
                        </h2>
                        <button
                            type="button"
                            onClick={resetForm}
                            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-zinc-700">Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Matthew"
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-900"
                                required
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium text-zinc-700">Slug</label>
                            <input
                                type="text"
                                value={resolvedSlug}
                                onChange={(e) => {
                                    setSlugTouched(true);
                                    setSlug(e.target.value);
                                }}
                                placeholder="matthew"
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-900"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-zinc-700">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Optional description shown on the public series page."
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-900"
                        />
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                        >
                            <Save className="size-4" />
                            {saving ? "Saving..." : editingId ? "Save Changes" : "Create Series"}
                        </button>
                        <button
                            type="button"
                            onClick={resetForm}
                            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                {loading ? (
                    <div className="flex min-h-[220px] items-center justify-center text-zinc-500">Loading series...</div>
                ) : series.length === 0 ? (
                    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center text-zinc-500">
                        <Layers3 className="size-10 text-zinc-300" />
                        <p>No series yet. Create one, then assign content items to it from the content editor.</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="border-b border-zinc-200 bg-zinc-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Series</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Slug</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Items</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                            {series.map((row) => (
                                <tr key={row.id} className="align-top">
                                    <td className="px-4 py-4">
                                        <div className="font-medium text-zinc-900">{row.title}</div>
                                        {row.description && (
                                            <p className="mt-1 max-w-xl text-sm text-zinc-500">{row.description}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 text-sm text-zinc-600">{row.slug}</td>
                                    <td className="px-4 py-4 text-sm text-zinc-600">{row.content_count}</td>
                                    <td className="px-4 py-4">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => startEdit(row)}
                                                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                                            >
                                                <Pencil className="size-4" />
                                                Edit
                                            </button>
                                            {deleteId === row.id ? (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(row.id)}
                                                        disabled={saving}
                                                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                                                    >
                                                        Confirm
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteId(null)}
                                                        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setDeleteId(row.id)}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                                                >
                                                    <Trash2 className="size-4" />
                                                    Delete
                                                </button>
                                            )}
                                        </div>
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
