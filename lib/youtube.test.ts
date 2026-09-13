import {
  extractYoutubeVideoId,
  isYoutubeUrl,
  toYoutubeEmbedUrl,
} from "@/lib/youtube";

const VIDEO_ID = "dQw4w9WgXcQ";

describe("extractYoutubeVideoId", () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtube.com/watch?v=${VIDEO_ID}&t=30s`,
    `https://youtu.be/${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}?t=30`,
    `https://www.youtube.com/embed/${VIDEO_ID}`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `https://m.youtube.com/watch?v=${VIDEO_ID}`,
  ])("extracts the video id from %s", (url) => {
    expect(extractYoutubeVideoId(url)).toBe(VIDEO_ID);
  });

  it.each([
    "https://vimeo.com/123456",
    "not a url",
    "https://www.youtube.com/",
    "https://www.youtube.com/watch?v=short",
  ])("returns null for %s", (url) => {
    expect(extractYoutubeVideoId(url)).toBeNull();
  });
});

describe("isYoutubeUrl", () => {
  it("returns true for a valid link", () => {
    expect(isYoutubeUrl(`https://youtu.be/${VIDEO_ID}`)).toBe(true);
  });

  it("returns false for a non-YouTube link", () => {
    expect(isYoutubeUrl("https://vimeo.com/123456")).toBe(false);
  });
});

describe("toYoutubeEmbedUrl", () => {
  it("builds a privacy-enhanced embed url", () => {
    expect(toYoutubeEmbedUrl(`https://youtu.be/${VIDEO_ID}`)).toBe(
      `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`,
    );
  });

  it("returns null when the url isn't a YouTube link", () => {
    expect(toYoutubeEmbedUrl("https://vimeo.com/123456")).toBeNull();
  });
});
