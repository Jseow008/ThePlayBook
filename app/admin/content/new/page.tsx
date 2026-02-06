/**
 * New Content Page
 * 
 * Create new content for Lifebook.
 */

import { ContentForm } from "@/components/admin/ContentForm";

export default function NewContentPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-zinc-900">New Content</h1>
                <p className="text-zinc-500 mt-1">
                    Create a new summary for a podcast, book, or article.
                </p>
            </div>

            <ContentForm />
        </div>
    );
}
