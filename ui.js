/* Shared shell behaviour: theme preference and the mobile navigation drawer.
   Kept separate from application logic so it can never affect data handling. */
(() => {
  "use strict";
  const KEY = "camus-theme";
  const root = document.documentElement;

  function readTheme() {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  }
  function applyTheme(theme) {
    if (theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f2eee6" : "#0b0d11");
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const light = theme === "light";
      button.setAttribute("aria-pressed", String(light));
      button.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
      const label = button.querySelector("[data-theme-label]");
      if (label) label.textContent = light ? "Dark" : "Light";
    });
  }

  // Apply as early as possible to avoid a flash of the wrong theme.
  applyTheme(readTheme() === "light" ? "light" : "dark");

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(readTheme() === "light" ? "light" : "dark");
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
        try { localStorage.setItem(KEY, next); } catch (_) { /* private mode */ }
        applyTheme(next);
      });
    });

    const nav = document.querySelector("[data-nav-drawer]");
    const scrim = document.querySelector("[data-nav-scrim]");
    const toggles = document.querySelectorAll("[data-nav-toggle]");
    if (!nav || !toggles.length) return;
    const setOpen = (open) => {
      nav.classList.toggle("open", open);
      if (scrim) scrim.hidden = !open;
      toggles.forEach((t) => t.setAttribute("aria-expanded", String(open)));
    };
    toggles.forEach((t) => t.addEventListener("click", () => setOpen(!nav.classList.contains("open"))));
    if (scrim) scrim.addEventListener("click", () => setOpen(false));
    nav.addEventListener("click", (event) => {
      if (event.target.closest("[data-page]")) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("open")) setOpen(false);
    });
  });
})();
