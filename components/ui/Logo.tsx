import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
    className?: string;
    width?: number;
    height?: number;
    priority?: boolean;
}

export function Logo({
    className,
    width = 120,
    height = 40,
    priority = false
}: LogoProps) {
    return (
        <div className={cn("relative flex items-center justify-center", className)}>
            <Image
                src="/images/netflux-logo.png"
                alt="Netflux Logo"
                width={width}
                height={height}
                priority={priority}
                className="object-contain"
                style={{ width: 'auto', height: '100%' }}
            />
        </div>
    );
}
