import { useState, useEffect } from "react";

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const media = window.matchMedia(query);
        const listener = () => setMatches(media.matches);

        listener();

        if (typeof media.addEventListener === "function") {
            media.addEventListener("change", listener);
            return () => media.removeEventListener("change", listener);
        }

        media.addListener(listener);
        return () => media.removeListener(listener);
    }, [query]);

    return matches;
}
