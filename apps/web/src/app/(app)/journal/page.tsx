import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { JournalView } from "@/features/journal/journal-view";

export const metadata: Metadata = { title: "Journal" };

export default function JournalPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <JournalView />
    </Suspense>
  );
}
