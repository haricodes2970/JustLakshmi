"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={AlertCircle}
      title="Something went wrong"
      description="This screen could not load. Your data is unaffected. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
