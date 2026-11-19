import type { ComponentPropsWithRef } from "react";
import { Search, X } from "lucide-react";

type SearchBoxProps = Omit<ComponentPropsWithRef<"input">, "value" | "defaultValue"> & {
    value: string;
    searchIconClassName?: string;
    clear?: {
        label: string;
        onClick: () => void;
        buttonClassName: string;
        iconClassName: string;
    };
};

export function SearchBox({ className, value, searchIconClassName, clear, ...inputProps }: SearchBoxProps) {
    return (
        <>
            {searchIconClassName && <Search aria-hidden="true" className={searchIconClassName} />}
            <input
                {...inputProps}
                value={value}
                className={`[--ios-input-font-size:var(--text-lg)] ${className ?? ""}`}
            />
            {clear && value && (
                <button type="button" onClick={clear.onClick} className={clear.buttonClassName} aria-label={clear.label}>
                    <X aria-hidden="true" className={clear.iconClassName} />
                </button>
            )}
        </>
    );
}
