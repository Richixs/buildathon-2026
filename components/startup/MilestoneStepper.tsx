export default function MilestoneStepper({
  milestones,
  current,
}: {
  milestones: string[];
  current: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {milestones.map((m, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={m} className="flex items-center gap-2 font-mono text-xs">
            <span
              className={
                done
                  ? "text-retro-green"
                  : active
                    ? "text-neon-cyan"
                    : "text-off-white/30"
              }
            >
              {done ? "[✓]" : active ? "[▸]" : "[ ]"}
            </span>
            <span
              className={
                done || active ? "text-off-white" : "text-off-white/30"
              }
            >
              {m}
            </span>
          </div>
        );
      })}
    </div>
  );
}
