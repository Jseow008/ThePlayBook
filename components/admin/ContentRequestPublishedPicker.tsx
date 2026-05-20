"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { PublishedContentOption } from "@/lib/server/content-requests";

function formatTypeLabel(type: string) {
    return type.charAt(0).toUpperCase() + type.slice(1);
}

function normalizeSearch(value: string) {
    return value.trim().toLowerCase();
}

export function ContentRequestPublishedPicker({
    name,
    options,
    defaultValue,
}: {
    name: string;
    options: PublishedContentOption[];
    defaultValue?: string | null;
}) {
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState(defaultValue ?? "");
    const normalizedQuery = normalizeSearch(query);
    const selectedOption = options.find((option) => option.id === selectedId) ?? null;
    const filteredOptions = useMemo(() => {
        if (!normalizedQuery) {
            return options.slice(0, 80);
        }

        return options
            .filter((option) => {
                const haystack = `${option.title} ${option.author ?? ""} ${option.type}`.toLowerCase();
                return haystack.includes(normalizedQuery);
            })
            .slice(0, 80);
    }, [normalizedQuery, options]);
    const selectOptions = selectedOption && !filteredOptions.some((option) => option.id === selectedOption.id)
        ? [selectedOption, ...filteredOptions]
        : filteredOptions;

    return (
        <div className="grid gap-2">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search published content..."
                    className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
            </div>
            <select
                name={name}
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="h-10 rounded-md border border-input bg-white px-3 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
                <option value="">No published content selected</option>
                {selectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.title} {option.author ? `by ${option.author}` : ""} ({formatTypeLabel(option.type)})
                    </option>
                ))}
            </select>
        </div>
    );
}
