// Public content, segments, artifact templates and series context only.
// Content mutations and series changes hard-expire this shared dependency tag.
export const PUBLIC_READER_CACHE_TAG = "public-reader-v1";
export const PUBLIC_READER_MAX_AGE_MS = 60_000;
