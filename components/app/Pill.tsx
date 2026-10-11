const tones = {
  good: "bg-cyan/15 text-cyan", warn: "bg-warn/15 text-warn", violet: "bg-violet/20 text-violet", muted: "bg-white/8 text-muted",
} as const;
export type Tone = keyof typeof tones;

export function Pill({ tone = "muted", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}
