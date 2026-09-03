// Serviço isolado de busca de metadados de livro — sem estado, sem UI.
// Google Books é a fonte principal; Open Library é o fallback quando a
// primeira falha ou não retorna nada. As duas são normalizadas pro mesmo formato.

export type SearchBookResult = {
  externalId: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  isbn?: string;
  pageCount?: number;
  publishedYear?: number;
  provider: "google_books" | "open_library";
};

type GoogleBooksItem = {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    imageLinks?: { thumbnail?: string };
    industryIdentifiers?: { type: string; identifier: string }[];
    pageCount?: number;
    publishedDate?: string;
  };
};
type GoogleBooksResponse = { items?: GoogleBooksItem[] };

type OpenLibraryDoc = {
  key: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  isbn?: string[];
  number_of_pages_median?: number;
  first_publish_year?: number;
};
type OpenLibraryResponse = { docs?: OpenLibraryDoc[] };

async function searchGoogleBooks(query: string): Promise<SearchBookResult[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`google_books:${res.status}`);
  const data = (await res.json()) as GoogleBooksResponse;
  return (data.items ?? [])
    .map((item): SearchBookResult => {
      const info = item.volumeInfo ?? {};
      const isbnEntry =
        (info.industryIdentifiers ?? []).find((i) => i.type === "ISBN_13") ??
        (info.industryIdentifiers ?? [])[0];
      return {
        externalId: item.id,
        title: info.title ?? "",
        authors: info.authors ?? [],
        coverUrl: info.imageLinks?.thumbnail?.replace("http://", "https://"),
        isbn: isbnEntry?.identifier,
        pageCount: info.pageCount,
        publishedYear: info.publishedDate
          ? parseInt(info.publishedDate.slice(0, 4), 10) || undefined
          : undefined,
        provider: "google_books",
      };
    })
    .filter((r) => r.title);
}

async function searchOpenLibrary(query: string): Promise<SearchBookResult[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=12`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`open_library:${res.status}`);
  const data = (await res.json()) as OpenLibraryResponse;
  return (data.docs ?? [])
    .map((doc): SearchBookResult => ({
      externalId: doc.key,
      title: doc.title ?? "",
      authors: doc.author_name ?? [],
      coverUrl: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : undefined,
      isbn: doc.isbn?.[0],
      pageCount: doc.number_of_pages_median,
      publishedYear: doc.first_publish_year,
      provider: "open_library",
    }))
    .filter((r) => r.title);
}

/** Google Books primeiro; se falhar ou vier vazio, cai para Open Library. Nunca lança — retorna [] no pior caso. */
export async function searchBooks(query: string): Promise<SearchBookResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const google = await searchGoogleBooks(trimmed);
    if (google.length > 0) return google;
  } catch {
    // segue pro fallback
  }
  try {
    return await searchOpenLibrary(trimmed);
  } catch {
    return [];
  }
}
