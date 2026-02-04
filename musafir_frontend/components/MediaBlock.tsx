import { Media } from "../data/reviews";

type MediaBlockProps = {
  media: Media;
  isPlaying: boolean;
  onTogglePlay: () => void;
};

const labelForMedia = (media: Media) => {
  if (media.type === "voice") {
    return `\u25B6\uFE0F Listen (${media.durationSec ?? 0}s)`;
  }
  if (media.type === "photos") {
    return `See moments (${media.count ?? 0})`;
  }
  return `Watch clip (${media.durationSec ?? 0}s)`;
};

const ariaLabelForMedia = (media: Media) => {
  if (media.type === "voice") {
    return `Listen to voice note, ${media.durationSec ?? 0} seconds`;
  }
  if (media.type === "photos") {
    return `Open photo set, ${media.count ?? 0} images`;
  }
  return `Watch video clip, ${media.durationSec ?? 0} seconds`;
};

export default function MediaBlock({ media, isPlaying, onTogglePlay }: MediaBlockProps) {
  const label = labelForMedia(media);
  const helper =
    media.type === "voice"
      ? "Recorded after the trip"
      : media.type === "video"
        ? "Muted by default"
        : undefined;

  return (
    <div className="mt-4 rounded-2xl border border-canvas-line bg-white/70 px-4 py-3">
      <button
        type="button"
        aria-label={ariaLabelForMedia(media)}
        onClick={onTogglePlay}
        className="flex w-full items-center justify-between text-sm font-medium text-semantic-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
      >
        <span>{label}</span>
        <span className="text-xs text-semantic-text-light">
          {isPlaying ? "Playing" : "Tap to play"}
        </span>
      </button>
      {helper ? (
        <p className="mt-1 text-xs text-semantic-text-light">{helper}</p>
      ) : null}
    </div>
  );
}
