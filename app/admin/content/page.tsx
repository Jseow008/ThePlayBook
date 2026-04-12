import { ContentWorkbench } from "@/components/admin/ContentWorkbench";

export default async function AdminContentPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; status?: string; type?: string; featured?: string; q?: string; sort?: string; narration_warning?: string }>;
}) {
    return <ContentWorkbench searchParams={searchParams} basePath="/admin/content" />;
}
