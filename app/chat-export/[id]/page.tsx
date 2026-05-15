import type { Metadata } from "next";
import { ChatExportClientPage } from "./client-page";

interface PageProps {
    params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
    title: "Chat Export - Netflux",
    robots: {
        index: false,
        follow: false,
    },
};

export default async function ChatExportPage({ params }: PageProps) {
    const { id } = await params;

    return <ChatExportClientPage exportId={id} />;
}
