import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import { getAdminContentWorkbenchData } from "@/lib/server/admin-content-workbench";
import { ContentWorkbenchClient } from "@/components/admin/ContentWorkbenchClient";
import {
    ADMIN_CONTENT_PERMANENT_FILTERS_COOKIE,
    applyAdminContentViewStateToParams,
    hasExplicitAdminContentParams,
    isDefaultAdminContentViewState,
    parseAdminContentPermanentFilters,
} from "@/lib/admin-content-permanent-filters";

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
    const cookieStore = await cookies();
    const permanentFilters = parseAdminContentPermanentFilters(
        cookieStore.get(ADMIN_CONTENT_PERMANENT_FILTERS_COOKIE)?.value
    );
    const permanentFiltersEnabled = Boolean(permanentFilters);

    if (
        permanentFilters
        && !isDefaultAdminContentViewState(permanentFilters)
        && !hasExplicitAdminContentParams(params)
    ) {
        const nextParams = new URLSearchParams();
        if (params.narration_warning) {
            nextParams.set("narration_warning", params.narration_warning);
        }
        applyAdminContentViewStateToParams(nextParams, permanentFilters);
        redirect(`${basePath}?${nextParams.toString()}`);
    }

    const data = await getAdminContentWorkbenchData(supabase as any, params, basePath);

    return (
        <ContentWorkbenchClient
            {...data}
            basePath={basePath}
            permanentFiltersEnabled={permanentFiltersEnabled}
        />
    );
}
