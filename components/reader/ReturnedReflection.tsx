"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useReflections } from "@/hooks/useReflections";
import type { ReaderTheme } from "@/hooks/useReaderSettings";
import { REFLECTION_RESUME_PARAM } from "@/lib/auth-redirect";
import { ReflectionComposer } from "./ReflectionComposer";

export function ReturnedReflection({
    contentId,
    contentTitle,
    readerTheme,
}: {
    contentId: string;
    contentTitle: string;
    readerTheme: ReaderTheme;
}) {
    const user = useAuthUser();
    const { data: reflections = [] } = useReflections(contentId);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [dismissed, setDismissed] = useState(false);

    const close = () => {
        setDismissed(true);
        const params = new URLSearchParams(searchParams.toString());
        params.delete(REFLECTION_RESUME_PARAM);
        router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
    };

    return (
        <ReflectionComposer
            contentId={contentId}
            contentTitle={contentTitle}
            readerTheme={readerTheme}
            isOpen={Boolean(user) && !dismissed}
            isAuthenticated={Boolean(user)}
            existingReflection={reflections[0] ?? null}
            returningFromSignIn
            onClose={close}
            onSaved={() => {}}
        />
    );
}
