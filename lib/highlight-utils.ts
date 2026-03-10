export const HIGHLIGHT_COLOR_CLASSES = {
    yellow: {
        bg: "bg-highlight-yellow hover:bg-highlight-yellow-hover",
        border: "border-highlight-yellow",
        text: "text-highlight-yellow",
        accent: "bg-highlight-yellow",
        swatch: "bg-highlight-swatch-yellow",
    },
    blue: {
        bg: "bg-highlight-blue hover:bg-highlight-blue-hover",
        border: "border-highlight-blue",
        text: "text-highlight-blue",
        accent: "bg-highlight-blue",
        swatch: "bg-highlight-swatch-blue",
    },
    green: {
        bg: "bg-highlight-green hover:bg-highlight-green-hover",
        border: "border-highlight-green",
        text: "text-highlight-green",
        accent: "bg-highlight-green",
        swatch: "bg-highlight-swatch-green",
    },
    red: {
        bg: "bg-highlight-red hover:bg-highlight-red-hover",
        border: "border-highlight-red",
        text: "text-highlight-red",
        accent: "bg-highlight-red",
        swatch: "bg-highlight-swatch-red",
    },
    purple: {
        bg: "bg-highlight-purple hover:bg-highlight-purple-hover",
        border: "border-highlight-purple",
        text: "text-highlight-purple",
        accent: "bg-highlight-purple",
        swatch: "bg-highlight-swatch-purple",
    },
} as const;

export type HighlightColor = keyof typeof HIGHLIGHT_COLOR_CLASSES;

export function normalizeHighlightColor(color: string | null | undefined): HighlightColor {
    switch (color) {
        case "blue":
        case "green":
        case "red":
        case "purple":
        case "yellow":
            return color;
        default:
            return "yellow";
    }
}
