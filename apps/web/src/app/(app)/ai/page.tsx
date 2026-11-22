import type { Metadata } from "next";
import { AiView } from "@/features/ai/ai-view";

export const metadata: Metadata = { title: "Lakshmi AI" };

export default function AiPage() {
  return <AiView />;
}
