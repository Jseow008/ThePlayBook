export function escapePostgrestLikeValue(value: string) {
    const escapedValue = value
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_")
        .replace(/"/g, '\\"');
    const escaped = `%${escapedValue}%`;

    if (/[",.:()\\]/.test(value)) {
        return `"${escaped}"`;
    }

    return escaped;
}
