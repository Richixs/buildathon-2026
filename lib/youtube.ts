// Matches the video id out of the YouTube URL shapes people actually paste:
// watch?v=, youtu.be/, embed/, shorts/ — with or without extra query params
// (t=, list=, etc.) or a trailing slash after the id.
const YOUTUBE_URL_REGEX =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[/?&#].*)?$/;

export function extractYoutubeVideoId(url: string): string | null {
  const match = url.trim().match(YOUTUBE_URL_REGEX);
  return match ? match[1] : null;
}

export function isYoutubeUrl(url: string): boolean {
  return extractYoutubeVideoId(url) !== null;
}

export function toYoutubeEmbedUrl(url: string): string | null {
  const videoId = extractYoutubeVideoId(url);
  return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
}
