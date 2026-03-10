import Image from "next/image";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";

interface LogoProps {
  className?: string;
  width?: number; // Kept for backwards compatibility but we'll prioritize height for aspect ratio
  height?: number;
  priority?: boolean;
}

export function Logo({
  className,
  width,
  height = 40,
  priority = false,
}: LogoProps) {
  // Source crop ratio is 2518 / 716 roughly = 3.51
  const aspectRatio = 2518 / 716;

  // If height is provided (which it defaults to 40), calculate the intrinsic width
  const calculatedWidth = width || Math.round(height * aspectRatio);

  return (
    <div
      className={cn("inline-flex items-center justify-start relative", className)}
      style={{ width: calculatedWidth, height: height }}
      aria-label={APP_NAME}
    >
      <Image
        src="/images/flux-logo.png"
        alt={`${APP_NAME} logo`}
        fill
        unoptimized
        sizes={`${calculatedWidth}px`}
        priority={priority}
        className="object-contain object-left"
      />
    </div>
  );
}
