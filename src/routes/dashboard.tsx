import { createFileRoute } from "@tanstack/react-router";
import { MirrorDashboard } from "@/components/MirrorDashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Espelho de hábitos — Norte" }] }),
  component: MirrorDashboard,
});
