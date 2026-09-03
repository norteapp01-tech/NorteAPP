import { createFileRoute } from "@tanstack/react-router";
import { TodayScreen } from "@/components/TodayScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Norte — Hoje" },
      { name: "description", content: "Sua agenda inteligente para hoje." },
    ],
  }),
  component: TodayScreen,
});
