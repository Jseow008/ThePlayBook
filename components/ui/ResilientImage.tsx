"use client";

import type { ReactNode, SyntheticEvent } from "react";
import { useEffect, useState } from "react";
import Image, { type ImageProps } from "next/image";
import {
    reportImageFallback,
    type ImageSurface,
} from "@/lib/image-fallback";

type ResilientImageMode = "optimized" | "direct" | "failed";

export interface ResilientImageProps extends Omit<ImageProps, "onError" | "src" | "unoptimized"> {
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
    ...props
}: ResilientImageProps) {
    const [mode, setMode] = useState<ResilientImageMode>("optimized");

    useEffect(() => {
        setMode("optimized");
    }, [src]);

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
            alt={alt}
            key={`${mode}:${src}`}
            src={src}
            unoptimized={mode === "direct"}
            onError={(event) => {
                onError?.(event);

                if (mode === "optimized" && enableDirectRetry) {
                    setMode("direct");
                    return;
                }

                setMode("failed");
            }}
        />
    );
}
