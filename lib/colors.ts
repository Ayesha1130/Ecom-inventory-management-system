const SWATCHES: Record<string, string> = {
  sand: "#d8c7a6", ink: "#1f2430", olive: "#6b6b3a", moss: "#5a6b46", rust: "#a4502f", grey: "#9a9a96",
  gray: "#9a9a96", oat: "#e3d9c3", tan: "#b58a5a", black: "#171717", slate: "#4b5a68", white: "#f4f1ea",
  navy: "#1f2a44", cream: "#efe6d2", red: "#a83232", blue: "#3a5a8c", green: "#3f6b4a", brown: "#6b4a32",
};
const FALLBACK = "#cfc8ba";

export function swatchColor(name: string | null | undefined): string {
  return (name && SWATCHES[name.trim().toLowerCase()]) || FALLBACK;
}

/** Pick a readable text color for a given background. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1c1b18" : "#f6f2ea";
}
