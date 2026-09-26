/** Disposable-only browser setup. Run with NODE_OPTIONS=--conditions=react-server. */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { loadSelectedPersonalEvidence } from "../lib/server/personal-evidence-candidates";
import { issueEvidenceCitations } from "../lib/server/evidence-citation";

async function main() {
    const path = process.env.CITATION_BROWSER_FIXTURE;
    const api = process.env.DB107_SUPABASE_URL;
    const database = process.env.DB107_ADMIN_DATABASE_URL;
    const anon = process.env.DB107_SUPABASE_ANON_KEY;
    if (!path || !api || !database || !anon) throw new Error("Provide CITATION_BROWSER_FIXTURE and disposable DB107 URL, database and anon key");
    for (const url of [api, database]) {
        if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("Loopback-only disposable fixture");
    }
    const db = new Pool({ connectionString: database });
    const remove = async (userId: string, contentId: string) => {
        await db.query("DELETE FROM public.content_item WHERE id=$1", [contentId]);
        await db.query("DELETE FROM auth.users WHERE id=$1", [userId]);
    };
    try {
        if (process.argv[2] === "cleanup") {
            const saved = z.object({ userId: z.string().uuid(), contentId: z.string().uuid() }).parse(JSON.parse(readFileSync(path, "utf8")));
            await remove(saved.userId, saved.contentId);
            unlinkSync(path);
            return;
        }
        if (process.argv[2] !== "create" || existsSync(path)) throw new Error("Use create with a new fixture path, or cleanup for an existing fixture");
        const cookies: { name: string; value: string }[] = [];
        const client = createServerClient(api, anon, { cookies: {
            getAll: () => cookies,
            setAll: (values: Array<{ name: string; value: string }>) => { for (const value of values) {
                const existing = cookies.findIndex((cookie) => cookie.name === value.name);
                if (existing >= 0) cookies[existing] = value; else cookies.push(value);
            } },
        } });
        const signup = await client.auth.signUp({ email: `citation-${randomUUID()}@example.invalid`, password: `Fixture-${randomUUID()}!` });
        if (signup.error || !signup.data.user) throw new Error("Disposable signup failed");
        const userId = signup.data.user.id, contentId = randomUUID(), id = randomUUID();
        try {
            const text = "Full surrounding context. 🌱 Exact **saved words**, including punctuation. More context follows.";
            await db.query("INSERT INTO public.content_item(id,type,title,author,status) VALUES($1,'article','Citation verification fixture','Synthetic author','verified')", [contentId]);
            await db.query("INSERT INTO public.user_highlights(id,user_id,content_item_id,highlighted_text,note_body) VALUES($1,$2,$3,'A synthetic highlight',$4)", [id, userId, contentId, text]);
            const [evidence] = await loadSelectedPersonalEvidence({ supabase: client, userId, scope: { version: 1, itemType: "all" }, selected: [{ type: "highlight", id }] });
            const start = text.indexOf("🌱"), end = text.indexOf(" More");
            const link = issueEvidenceCitations({ userId, personal: [{ evidence, score: 1, exactQuote: null,
                spans: [{ field: "noteBody", start, end, text: text.slice(start, end), score: 1 }] }] })[0];
            writeFileSync(path, JSON.stringify({ userId, contentId, id, cookies, link, text: text.slice(start, end) }), { mode: 0o600, flag: "wx" });
        } catch (error) { await remove(userId, contentId); throw error; }
    } finally { await db.end(); }
}
main().catch(() => { console.error("Disposable citation fixture failed; check local setup (credentials and tokens omitted)."); process.exitCode = 1; });
