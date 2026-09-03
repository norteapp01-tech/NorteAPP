import { BookOpen } from "lucide-react";
import type { Book } from "@/lib/reading-store";

/** Capa real quando existe; placeholder consistente com o design quando não. */
export function BookCover({
  book,
  className = "h-16 w-12",
}: {
  book: Pick<Book, "title" | "coverUrl" | "coverImage">;
  className?: string;
}) {
  const src = book.coverImage ?? book.coverUrl;
  if (src) {
    return (
      <img
        src={src}
        alt={book.title}
        className={`shrink-0 rounded-lg object-cover shadow-lg ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.4_0.12_250)] to-[oklch(0.25_0.08_250)] shadow-lg ${className}`}
    >
      <BookOpen className="h-1/3 w-1/3 text-white/70" />
    </div>
  );
}
