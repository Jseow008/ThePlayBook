import { getAdminClient } from "@/lib/supabase/admin";

export interface AdminSeriesOption {
    id: string;
    slug: string;
    title: string;
}

export async function getAdminSeriesOptions(): Promise<AdminSeriesOption[]> {
    const supabase = getAdminClient();
    const { data, error } = await supabase
        .from("content_series")
        .select("id, slug, title")
        .order("title", { ascending: true });

    if (error || !data) {
        return [];
    }

    return data as AdminSeriesOption[];
}
