import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function for merging Tailwind CSS classes
 * Combines clsx for conditional classes with tailwind-merge to resolve conflicts
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Calculates estimated reading time based on an average 200 WPM reading speed.
 * @param text The text content to analyze.
 * @returns Estimated reading time as a string (e.g., "< 1" or "2").
 */
export function calculateReadingTime(text: string): string {
    const wpm = 200;
    const words = text.trim().split(/\s+/).length;
    const minutes = words / wpm;
    if (minutes < 1) {
        return "< 1";
    }
    return Math.round(minutes).toString();
}
