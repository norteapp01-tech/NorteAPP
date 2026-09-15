import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
const key = "norte-appearance";
const event = "norte-appearance-change";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#000000" : "#f8faf9");
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(key, theme);
  } catch {
    /* Keep the current session choice. */
  }
  window.dispatchEvent(new Event(event));
}

function subscribe(callback: () => void) {
  const sync = (e: StorageEvent) => {
    if (e.key === key || e.key === null) {
      applyTheme(e.newValue === "light" ? "light" : "dark");
      callback();
    }
  };
  window.addEventListener(event, callback);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(event, callback);
    window.removeEventListener("storage", sync);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark",
  );
}

// Runs before the first paint so a saved light theme never flashes dark.
export const themeBootScript = `(function(){var t='dark';try{if(localStorage.getItem('norte-appearance')==='light')t='light'}catch(e){}var r=document.documentElement;r.dataset.theme=t;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=t==='dark'?'#000000':'#f8faf9'})()`;
