import Link from "next/link";
import { BookOpen, Home, Search } from "lucide-react";
import { APP_NAME } from "@/lib/brand";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
            <div className="max-w-md w-full text-center space-y-8">
                {/* Logo */}
                <div className="inline-flex items-center gap-2 text-primary">
                    <BookOpen className="size-6" />
                    <span className="font-bold text-lg tracking-wider font-brand">{APP_NAME}</span>
                </div>

                {/* 404 */}
                <div className="space-y-3">
                    <p className="text-8xl font-black text-primary/20 select-none leading-none">404</p>
                    <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 h-10 px-6 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        <Home className="size-4" />
                        Browse Library
                    </Link>
                    <Link
                        href="/search"
                        className="inline-flex items-center gap-2 h-10 px-6 rounded-full border border-border text-sm font-medium hover:bg-secondary/50 transition-colors"
                    >
                        <Search className="size-4" />
                        Search
                    </Link>
                </div>
            </div>
        </div>
    );
}
