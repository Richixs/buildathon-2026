import { toYoutubeEmbedUrl } from "@/lib/youtube";

export default function PitchVideo({ url }: { url: string }) {
  const embedUrl = toYoutubeEmbedUrl(url);

  if (!embedUrl) return null;

  return (
    <div className="bg-terminal-gray border-neon-cyan/30 shadow-brutal-sm flex flex-col gap-3 border p-6">
      <span className="text-off-white/40 font-mono text-xs tracking-widest">
        PITCH_DEMO
      </span>
      <div className="border-neon-cyan/20 relative aspect-video w-full border">
        <iframe
          src={embedUrl}
          title="Video del pitch"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  );
}
