import { useQuery } from "@tanstack/react-query";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
export type Circle = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  invite_token: string;
  archived: boolean;
  auto_approve: boolean;
};
export type Member = {
  circle_id: string;
  user_id: string;
  alias: string;
  status: "pending" | "active" | "removed";
  muted: boolean;
};
export type Post = {
  id: string;
  user_id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
};
export type Challenge = {
  id: string;
  title: string;
  mode: "cooperative" | "competitive";
  target: number;
  unit: string;
  start_date: string;
  end_date: string;
};
export type SharedProgress = {
  user_id: string;
  habit_id: string;
  name: string;
  unit: string;
  value: number;
};
export type ChallengeProgress = { user_id: string; alias: string; value: number };
export type Notice = {
  id: string;
  circle_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};
function checked<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
export async function communityAction(
  action: string,
  circle: string | null,
  data: Record<string, unknown> = {},
) {
  await ensureSession();
  const result = checked(
    await supabase.rpc("norte_community_action", {
      p_action: action,
      p_circle: circle,
      p_data: data,
    }),
  );
  await queryClient.invalidateQueries({ queryKey: ["community"] });
  return result as { id: string | null; status?: string };
}
export function useCommunity(circle?: string, page = 0) {
  const user = useSupabaseUserId();
  return useQuery({
    queryKey: ["community", user, circle, page],
    enabled: !!user,
    queryFn: async () => {
      const [groups, members, notices] = await Promise.all([
        supabase
          .from("norte_circles")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        circle
          ? supabase.from("norte_circle_members").select("*").eq("circle_id", circle)
          : supabase.from("norte_circle_members").select("*").eq("user_id", user!),
        supabase
          .from("norte_social_notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      const base = {
        circles: checked(groups) as Circle[],
        members: checked(members) as Member[],
        notices: checked(notices) as Notice[],
      };
      if (!circle)
        return {
          ...base,
          posts: [] as Post[],
          reactions: [] as { post_id: string; user_id: string }[],
          challenges: [] as Challenge[],
          shares: [] as SharedProgress[],
          reports: [] as { post_id: string; reason: string }[],
          hasMore: false,
        };
      const [posts, challenges, shares, reports] = await Promise.all([
        supabase
          .from("norte_circle_posts")
          .select("*")
          .eq("circle_id", circle)
          .is("parent_id", null)
          .order("created_at", { ascending: false })
          .order("id")
          .range(page * 20, page * 20 + 20),
        supabase
          .from("norte_challenges")
          .select("*")
          .eq("circle_id", circle)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.rpc("norte_circle_progress", { p_circle: circle }),
        supabase
          .from("norte_circle_reports")
          .select("post_id,reason")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      const list = checked(posts) as Post[];
      const ids = list.slice(0, 20).map((p) => p.id);
      const reactions = ids.length
        ? checked(await supabase.from("norte_circle_reactions").select("*").in("post_id", ids))
        : [];
      return {
        ...base,
        posts: list.slice(0, 20),
        reactions: reactions as { post_id: string; user_id: string }[],
        challenges: checked(challenges) as Challenge[],
        shares: checked(shares) as SharedProgress[],
        reports: checked(reports) as { post_id: string; reason: string }[],
        hasMore: list.length > 20,
      };
    },
  });
}
export function useComments(post: string) {
  const user = useSupabaseUserId();
  return useQuery({
    queryKey: ["community", user, "comments", post],
    enabled: !!user,
    queryFn: async () =>
      checked(
        await supabase
          .from("norte_circle_posts")
          .select("*")
          .eq("parent_id", post)
          .order("created_at")
          .limit(200),
      ) as Post[],
  });
}
export function useChallengeProgress(id: string) {
  const user = useSupabaseUserId();
  return useQuery({
    queryKey: ["community", user, "challenge", id],
    enabled: !!user,
    queryFn: async () =>
      checked(
        await supabase.rpc("norte_challenge_progress", { p_challenge: id }),
      ) as ChallengeProgress[],
  });
}
