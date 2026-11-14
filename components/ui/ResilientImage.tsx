"use client";

import type { ReactNode, SyntheticEvent } from "react";
import { useEffect, useState } from "react";
import Image, { type ImageProps } from "next/image";
import { coverImageLoader, publicCoverPath } from "@/lib/cover-image";
import {
    reportImageFallback,
    type ImageSurface,
} from "@/lib/image-fallback";

type ResilientImageMode = "initial" | "direct" | "failed";

export interface ResilientImageProps extends Omit<ImageProps, "onError" | "src"> {
    enableDirectRetry?: boolean;
    fallback?: ReactNode;
    onError?: (event: SyntheticEvent<HTMLImageElement, Event>) => void;
    src: string;
    surface: ImageSurface;
}

export function ResilientImage({
    alt,
    enableDirectRetry = true,
    fallback = null,
    onError,
    src,
    surface,
    loader,
    unoptimized,
    ...props
}: ResilientImageProps) {
    const directSource = unoptimized ?? (!loader && !publicCoverPath(src));
    const [mode, setMode] = useState<ResilientImageMode>("initial");

    useEffect(() => {
        setMode("initial");
    }, [src, unoptimized]);

    useEffect(() => {
        if (mode === "direct") {
            reportImageFallback({ src, stage: "direct_retry", surface });
            return;
        }

        if (mode === "failed") {
            reportImageFallback({ src, stage: "final_failure", surface });
        }
    }, [mode, src, surface]);

    if (mode === "failed") {
        return fallback ? <>{fallback}</> : null;
    }

    return (
        <Image
            {...props}
            loader={loader ?? (publicCoverPath(src) ? coverImageLoader : undefined)}
            alt={alt}
            key={`${mode}:${src}`}
            src={src}
            unoptimized={directSource || mode === "direct"}
            onError={(event) => {
                onError?.(event);

                if (mode === "initial" && !directSource && enableDirectRetry) {
                    setMode("direct");
                    return;
                }

                setMode("failed");
            }}
        />
    );
}
