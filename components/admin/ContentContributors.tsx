"use client";

import { useActionState, useId, useState } from "react";
import { saveContentContributors } from "@/app/admin/content/[id]/edit/contributors";
import { CONTRIBUTOR_ROLES, isContributorRole, type ContentContributor } from "@/lib/content-contributors";

export function ContentContributors({ contentId, initial }: { contentId: string; initial: ContentContributor[] }) {
    const labelPrefix = useId();
    const [rows, setRows] = useState(initial);
    const [speaker, setSpeaker] = useState(initial.find((person) => person.is_default_speaker)?.id ?? "");
    const [result, save, pending] = useActionState<{ status: "idle" | "saved" | "error"; message?: string }, FormData>(
        saveContentContributors.bind(null, contentId), { status: "idle" },
    );
    const control = "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900";

    function update(id: string, changes: Pick<ContentContributor, "name"> | Pick<ContentContributor, "role">) {
        setRows((current) => current.map((person) => person.id === id ? { ...person, ...changes } : person));
    }

    return (
        <form className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-6" action={save}>
            <h2 className="font-semibold text-zinc-900">Contributors and chat speaker</h2>
            <p className="mt-1 text-sm text-zinc-600">Add the credited participants. Choose a speaker whose views the source clearly attributes to them.</p>
            <input type="hidden" name="contributors" value={JSON.stringify(rows.map(({ id, name, role }) => ({
                name, role, is_default_speaker: speaker === id,
            })))} />
            <fieldset className="mt-4 space-y-3" disabled={pending}>
                {rows.map((person, index) => (
                    <div key={person.id} className="grid items-end gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
                        <label className="min-w-0 text-sm text-zinc-700">
                            Contributor {index + 1}
                            <input className={control} required maxLength={200} value={person.name}
                                onChange={(event) => update(person.id, { name: event.target.value })} />
                        </label>
                        <label className="min-w-0 text-sm text-zinc-700">
                            Role for contributor {index + 1}
                            <select className={control} value={person.role} onChange={(event) => {
                                const role = event.target.value;
                                if (isContributorRole(role)) update(person.id, { role });
                            }}>
                                {CONTRIBUTOR_ROLES.map((role) => (
                                    <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>
                                ))}
                            </select>
                        </label>
                        <button type="button" className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-700"
                            aria-label={`Remove contributor ${index + 1}`} onClick={() => {
                                setRows((current) => current.filter(({ id }) => id !== person.id));
                                if (speaker === person.id) setSpeaker("");
                            }}>Remove</button>
                    </div>
                ))}
                <button type="button" disabled={rows.length >= 100} className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-700"
                    onClick={() => setRows((current) => [...current, {
                        id: crypto.randomUUID(), name: "", role: "contributor", is_default_speaker: false,
                    }])}>Add contributor</button>
                <div className="max-w-sm">
                    <label htmlFor={labelPrefix + "-speaker"} className="text-sm text-zinc-700">Default chat speaker</label>
                    <select id={labelPrefix + "-speaker"} className={control} value={speaker} onChange={(event) => setSpeaker(event.target.value)}>
                        <option value="">No designated contributor</option>
                        {rows.map((person, index) => (
                            <option key={person.id} value={person.id}>{person.name.trim() || `Contributor ${index + 1}`}</option>
                        ))}
                    </select>
                </div>
                <button type="submit" className="min-h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white">
                    {pending ? "Saving contributors…" : "Save contributors"}
                </button>
            </fieldset>
            {result.message && (
                <p role={result.status === "error" ? "alert" : "status"} className={result.status === "error" ? "mt-3 text-sm text-red-700" : "mt-3 text-sm text-zinc-700"}>
                    {result.message}
                </p>
            )}
        </form>
    );
}
