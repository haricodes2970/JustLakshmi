import type { Metadata } from "next";
import { RoutinesView } from "@/features/routines/routines-view";

export const metadata: Metadata = { title: "Routines" };

export default function RoutinesPage() {
  return <RoutinesView />;
}
