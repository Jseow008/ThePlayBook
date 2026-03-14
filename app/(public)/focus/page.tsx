import type { Metadata } from "next";
import { FocusFeed } from "@/components/focus/FocusFeed";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
    title: `Focus Mode — ${APP_NAME}`,
    description: "Swipe through quick takes and open the full summary when you want to go deeper.",
};

export default function FocusPage() {
    return <FocusFeed />;
}
