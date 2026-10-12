import {
  BookOpen,
  Briefcase,
  Cake,
  Dumbbell,
  Heart,
  Home,
  Plane,
  Star,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { LabelIcon as LabelIconName } from "@/lib/agenda-labels-store";

const ICONS: Record<LabelIconName, LucideIcon> = {
  briefcase: Briefcase,
  home: Home,
  heart: Heart,
  user: User,
  book: BookOpen,
  dumbbell: Dumbbell,
  cake: Cake,
  star: Star,
  plane: Plane,
  users: Users,
};

export function LabelGlyph({ icon, className }: { icon?: string; className?: string }) {
  const Icon = icon ? ICONS[icon as LabelIconName] : undefined;
  return Icon ? <Icon className={className ?? "h-3.5 w-3.5"} aria-hidden /> : null;
}
