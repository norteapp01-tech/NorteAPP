import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, setTheme, themeBootScript } from "./theme";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  applyTheme("dark");
});

describe("appearance preference", () => {
  it("persists a light selection and updates native controls and dark variants", () => {
    setTheme("light");
    expect(localStorage.getItem("norte-appearance")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
  it("restores the selected theme before hydration", () => {
    localStorage.setItem("norte-appearance", "light");
    applyTheme("dark");
    window.eval(themeBootScript);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("uses the dark brand theme when the stored value is invalid", () => {
    localStorage.setItem("norte-appearance", "invalid");
    window.eval(themeBootScript);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("still switches when the browser denies persistent storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => setTheme("light")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
