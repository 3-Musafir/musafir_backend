import { useEffect } from "react";
import { Review } from "../data/reviews";
import MediaBlock from "./MediaBlock";

type ReviewCardProps = {
  review: Review;
  expanded: boolean;
  onToggleExpand: () => void;
  onHelped: () => void;
  helped: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStopMedia: () => void;
};

const helpedLabel = "\u2764\uFE0F This helped me";
const thanksMessage = "Thanks \u2014 we\u2019ll show more stories like this.";

export default function ReviewCard({
  review,
  expanded,
  onToggleExpand,
  onHelped,
  helped,
  isPlaying,
  onTogglePlay,
  onStopMedia,
}: ReviewCardProps) {
  useEffect(() => {
    if (!expanded && isPlaying) {
      onStopMedia();
    }
  }, [expanded, isPlaying, onStopMedia]);

  const name = review.name ?? "Musafir";
  const city = review.city;

  return (
    <article className="rounded-2xl border border-canvas-line bg-white px-6 py-5 shadow-soft">
      <p
        className={`text-sm leading-relaxed text-semantic-heading ${
          expanded ? "" : "line-clamp-2"
        }`}
      >
        {review.quote}
      </p>
      <div className="mt-3 text-sm text-semantic-heading">
        <span className="font-semibold">{name}</span>
        {city ? <span className="text-semantic-text"> \u00b7 {city}</span> : null}
      </div>
      <p className="mt-1 text-xs text-semantic-text-light">{review.context}</p>

      {review.media ? (
        <MediaBlock
          media={review.media}
          isPlaying={isPlaying}
          onTogglePlay={onTogglePlay}
        />
      ) : null}

      {expanded && review.story ? (
        <p className="mt-4 text-sm leading-relaxed text-semantic-text">
          {review.story}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggleExpand}
          className="rounded-full border border-canvas-line px-4 py-1.5 text-xs font-semibold text-semantic-heading transition hover:border-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          {expanded ? "Show less" : "Read their story"}
        </button>
        <button
          type="button"
          onClick={onHelped}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
            helped
              ? "bg-brand-primary-light text-semantic-heading"
              : "border border-brand-primary text-semantic-heading"
          }`}
        >
          {helpedLabel}
        </button>
      </div>

      {helped ? (
        <p className="mt-2 text-xs text-semantic-text-light">{thanksMessage}</p>
      ) : null}
    </article>
  );
}
