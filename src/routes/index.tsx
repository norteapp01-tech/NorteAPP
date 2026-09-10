import { createFileRoute } from "@tanstack/react-router";
import { TodayScreen } from "@/components/TodayScreen";
import { useRef, useState } from "react";
import { NorteChat } from "@/components/NorteChat";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Norte — Hoje" },
      { name: "description", content: "Sua agenda inteligente para hoje." },
    ],
  }),
  component: HomeWithChat,
});

function HomeWithChat() {
  const [chat, setChat] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      onTouchStart={(e) => {
        if ((e.target as HTMLElement).closest("button,input,textarea,a,[role=dialog]")) return;
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0],
          s = start.current;
        start.current = null;
        if (!s || Math.abs(t.clientY - s.y) > 45 || Math.abs(t.clientX - s.x) < 90) return;
        if (t.clientX < s.x) setChat(true);
        else setChat(false);
      }}
    >
      {chat ? (
        <NorteChat onBack={() => setChat(false)} />
      ) : (
        <TodayScreen onOpenChat={() => setChat(true)} />
      )}
    </div>
  );
}
