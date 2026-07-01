export const OVERLAY_LAYER_CLASS = {
    shell: "z-40",
    readerFloating: "z-[45]",
    drawer: "z-50",
    composerBackdrop: "z-[60]",
    composer: "z-[61]",
    panel: "z-[70]",
    sheet: "z-[80]",
    popover: "z-[100]",
    sheetRaised: "z-[101]",
    dialog: "z-[120]",
} as const;

export const OVERLAY_LAYER_DESCRIPTION = {
    shell: "Persistent app chrome and floating shell actions.",
    readerFloating: "Reader floating regions that must sit above content but below blocking overlays.",
    drawer: "Side drawers and drawer backdrops.",
    composerBackdrop: "Mobile composer or low sheet backdrops.",
    composer: "Mobile composer and low sheet panels.",
    panel: "Route-local blocking panels.",
    sheet: "Mobile sheets and sheet backdrops.",
    popover: "Reader popovers, toolbars, and non-route dialogs.",
    sheetRaised: "Sheet panels that must sit above their backdrop.",
    dialog: "Top-level blocking dialogs and tours.",
} as const;
