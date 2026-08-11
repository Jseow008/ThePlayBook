"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function Template({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const ownsFixedViewportAction = pathname === "/preview" || pathname.startsWith("/preview/");

    return (
        <div className={ownsFixedViewportAction ? undefined : "animate-fade-in"}>
            {children}
        </div>
    );
}
