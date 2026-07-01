export const BREAKPOINTS = {
    sm: 640,
    md: 768,
    lg: 1024,
} as const;

const minWidth = (width: number) => `(min-width: ${width}px)`;
const maxWidth = (width: number) => `(max-width: ${width - 1}px)`;

export const MEDIA_QUERIES = {
    smUp: minWidth(BREAKPOINTS.sm),
    mdUp: minWidth(BREAKPOINTS.md),
    lgUp: minWidth(BREAKPOINTS.lg),
    belowSm: maxWidth(BREAKPOINTS.sm),
    belowMd: maxWidth(BREAKPOINTS.md),
    belowLg: maxWidth(BREAKPOINTS.lg),
} as const;

// md is content-layout desktop, lg is app chrome/sidebar/full-layout desktop,
// and sm is reader interaction desktop rather than generic desktop.
export const VIEWPORT_QUERIES = {
    contentDesktop: MEDIA_QUERIES.mdUp,
    focusDesktop: MEDIA_QUERIES.mdUp,

    readerInteractionDesktop: MEDIA_QUERIES.smUp,
    compactReaderControls: MEDIA_QUERIES.belowSm,

    askFullLayout: MEDIA_QUERIES.lgUp,
    appDesktopChrome: MEDIA_QUERIES.lgUp,
    notesAskSidebarAvailable: MEDIA_QUERIES.lgUp,

    landingMobileMotion: MEDIA_QUERIES.belowMd,
} as const;
