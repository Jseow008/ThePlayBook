import { afterEach, describe, expect, it, vi } from "vitest";
import { isConfidentBookMatch, resolveBookCover } from "@/lib/server/request-thumbnails";

const originalEnv = { ...process.env };

function jsonResponse(payload: unknown, ok = true) {
    return {
        ok,
        json: vi.fn().mockResolvedValue(payload),
    } as unknown as Response;
}

afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
});

describe("request thumbnail resolution", () => {
    it("uses a confident Google Books cover and forces HTTPS", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            items: [
                {
                    volumeInfo: {
                        title: "Never Finished",
                        subtitle: "Unshackle Your Mind and Win the War Within",
                        authors: ["David Goggins"],
                        imageLinks: {
                            thumbnail: "http://books.google.com/books/content?id=abc&printsec=frontcover&img=1",
                        },
                    },
                },
            ],
        }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(resolveBookCover({
            title: "Never Finished: Unshackle Your Mind and Win the War Within",
            author: "David Goggins",
        })).resolves.toBe("https://books.google.com/books/content?id=abc&printsec=frontcover&img=1");

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("falls back to Open Library when Google Books has no confident cover", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ items: [] }))
            .mockResolvedValueOnce(jsonResponse({
                docs: [
                    {
                        title: "Atomic Habits",
                        author_name: ["James Clear"],
                        cover_i: 12345,
                    },
                ],
            }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(resolveBookCover({
            title: "Atomic Habits",
            author: "James Clear",
        })).resolves.toBe("https://covers.openlibrary.org/b/id/12345-L.jpg");

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("accepts a shorter Open Library title when it matches the requested title core", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ items: [] }))
            .mockResolvedValueOnce(jsonResponse({
                docs: [
                    {
                        title: "Beyond Order",
                        author_name: ["Jordan B. Peterson"],
                        cover_i: 10517194,
                    },
                ],
            }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(resolveBookCover({
            title: "Beyond Order: 12 More Rules for Life",
        })).resolves.toBe("https://covers.openlibrary.org/b/id/10517194-L.jpg");

        const openLibraryUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
        expect(openLibraryUrl.searchParams.get("q")).toBe("Beyond Order: 12 More Rules for Life");
    });

    it("rejects weak title and author matches", () => {
        expect(isConfidentBookMatch({
            requestedTitle: "Zero to One",
            requestedAuthor: "Peter Thiel",
            candidateTitle: "Summary of Zero to One",
            candidateAuthors: ["Book Notes Press"],
        })).toBe(false);

        expect(isConfidentBookMatch({
            requestedTitle: "Zero to One",
            requestedAuthor: "Peter Thiel",
            candidateTitle: "Zero to One",
            candidateAuthors: ["Peter Thiel", "Blake Masters"],
        })).toBe(true);
    });

    it("sends optional Google Books API key and Open Library user agent", async () => {
        process.env.GOOGLE_BOOKS_API_KEY = "books-key";
        process.env.OPEN_LIBRARY_USER_AGENT = "NetfluxTest/1.0 (test@example.com)";
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ items: [] }))
            .mockResolvedValueOnce(jsonResponse({ docs: [] }));
        vi.stubGlobal("fetch", fetchMock);

        await resolveBookCover({ title: "Missing Book", author: "Nobody" });

        const googleUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
        expect(googleUrl.searchParams.get("key")).toBe("books-key");

        const openLibraryHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
        expect(openLibraryHeaders["user-agent"]).toBe("NetfluxTest/1.0 (test@example.com)");
    });

    it("does not return cover URLs that exceed the database limit", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({
                items: [
                    {
                        volumeInfo: {
                            title: "Deep Work",
                            authors: ["Cal Newport"],
                            imageLinks: {
                                thumbnail: `https://books.google.com/${"x".repeat(1_000)}`,
                            },
                        },
                    },
                ],
            }))
            .mockResolvedValueOnce(jsonResponse({ docs: [] }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(resolveBookCover({
            title: "Deep Work",
            author: "Cal Newport",
        })).resolves.toBeNull();
    });
});
