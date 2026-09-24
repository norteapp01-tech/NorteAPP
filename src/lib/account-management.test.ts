import { beforeEach, expect, it, vi } from "vitest";
import { deleteAccountPermanently, resetAccountContent } from "./account-management";
import { supabase } from "./supabase/client";
import { clearRecordingState } from "./sport-recording-db";

vi.mock("./supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() }, auth: { signOut: vi.fn() } },
}));
vi.mock("./sport-recording-db", () => ({ clearRecordingState: vi.fn() }));
vi.mock("./query-client", () => ({ queryClient: { cancelQueries: vi.fn(), clear: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

it("não limpa conteúdo local se o reset remoto falhar", async () => {
  vi.mocked(supabase.functions.invoke).mockResolvedValue({
    data: null,
    error: new Error("offline"),
  } as never);
  await expect(resetAccountContent("user-1")).rejects.toThrow();
  expect(clearRecordingState).not.toHaveBeenCalled();
});

it("reseta o conteúdo sem encerrar a identidade", async () => {
  vi.mocked(supabase.functions.invoke).mockResolvedValue({
    data: { ok: true },
    error: null,
  } as never);
  localStorage.setItem("norte-chat:user-1", "conteúdo");
  await resetAccountContent("user-1");
  expect(supabase.functions.invoke).toHaveBeenCalledWith("reset-account");
  expect(localStorage.getItem("norte-chat:user-1")).toBeNull();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});

it("só remove a marca da conta depois da exclusão confirmada pelo servidor", async () => {
  vi.mocked(supabase.functions.invoke).mockResolvedValue({
    data: { ok: true },
    error: null,
  } as never);
  vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as never);
  localStorage.setItem("norte_has_account", "1");
  await deleteAccountPermanently("user-1");
  expect(supabase.functions.invoke).toHaveBeenCalledWith("delete-account");
  expect(localStorage.getItem("norte_has_account")).toBeNull();
});
