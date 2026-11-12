import { createFileRoute } from "@tanstack/react-router";
import { HabitsScreen } from "@/components/habits/HabitsScreen";

export const Route = createFileRoute("/rotinas")({
  head: () => ({ meta: [{ title: "Rotinas — Norte" }] }),
  component: HabitsScreen,
});
