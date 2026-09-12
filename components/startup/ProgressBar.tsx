export default function ProgressBar({ value }: { value: number }) {
  return (
    <div className="border-neon-cyan/30 bg-crt-black h-3 w-full border">
      <div
        className="bg-retro-green h-full"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}
