import { notFound } from "next/navigation";
import { WelcomeActivation, type WelcomeContentItem } from "@/components/ui/WelcomeActivation";

const PREVIEW_ITEMS: WelcomeContentItem[] = [
    { id: "11111111-1111-4111-8111-111111111111", title: "The Psychology of Money", author: "Morgan Housel", category: "Psychology", cover_image_url: null, type: "book" },
    { id: "22222222-2222-4222-8222-222222222222", title: "Thinking in Systems", author: "Donella Meadows", category: "Business", cover_image_url: null, type: "book" },
    { id: "33333333-3333-4333-8333-333333333333", title: "Deep Work", author: "Cal Newport", category: "Creativity", cover_image_url: null, type: "book" },
    { id: "44444444-4444-4444-8444-444444444444", title: "Why We Sleep", author: "Matthew Walker", category: "Health", cover_image_url: null, type: "book" },
    { id: "55555555-5555-4555-8555-555555555555", title: "Meditations", author: "Marcus Aurelius", category: "Philosophy", cover_image_url: null, type: "book" },
    { id: "66666666-6666-4666-8666-666666666666", title: "The Innovators", author: "Walter Isaacson", category: "Technology", cover_image_url: null, type: "book" },
];

export default function WelcomePreviewPage() {
    if (process.env.NODE_ENV !== "development") {
        notFound();
    }

    return <WelcomeActivation items={PREVIEW_ITEMS} nextUrl="/browse" preview />;
}
