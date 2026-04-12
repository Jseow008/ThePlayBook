import { getAdminClient } from "@/lib/supabase/admin";
import { getAdminContentWorkbenchData } from "@/lib/server/admin-content-workbench";
import { ContentWorkbenchClient } from "@/components/admin/ContentWorkbenchClient";

export async function ContentWorkbench({
    searchParams,
    basePath = "/admin/content",
}: {
    searchParams: Promise<{
        page?: string;
        page_size?: string;
        status?: string;
        type?: string;
        featured?: string;
        q?: string;
        sort?: string;
        ai?: string;
        voice?: string;
        narration_warning?: string;
    }>;
    basePath?: string;
}) {
    const supabase = getAdminClient();
    const params = await searchParams;
    const data = await getAdminContentWorkbenchData(supabase as any, params, basePath);

    return <ContentWorkbenchClient {...data} basePath={basePath} />;
}
