/* Real Go Salon PWA screens, captured at 390×844 from services/frontend.
   Files are named `<screen>-<dark|light>.jpg` in ./screens. */
const files = import.meta.glob("./screens/*.jpg", { eager: true, import: "default" });

const byName = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.replace(/^.*\/(.+)\.jpg$/, "$1"), url]),
);

/** A screen as `{ src, theme }`, preferring the requested theme and falling
    back to the other one; null when the screen was never captured. */
export const screen = (name, theme = "dark") => {
  const other = theme === "dark" ? "light" : "dark";
  for (const t of [theme, other]) {
    const src = byName[`${name}-${t}`];
    if (src) return { src, theme: t };
  }
  return null;
};
