"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_QUESTION,
  EXPLORING_ID,
  EXPLORING_LABEL,
  QUESTIONS,
} from "../data/questions";
import { REVIEWS, Review } from "../data/reviews";
import { rankReviews } from "../lib/rankReviews";
import QuestionSelector from "./QuestionSelector";
import ReviewCard from "./ReviewCard";
import BreatherCard from "./BreatherCard";
import PersonalizationPrompt from "./PersonalizationPrompt";
import ConversionCard from "./ConversionCard";

const INITIAL_COUNT = 6;
const LOAD_MORE_COUNT = 6;

const breatherMessages = [
  "Most Musafirs join alone.",
  "Its okay to be nervous. Many were.",
  "Some people come for the trip. Most stay for the people.",
];

const completenessMessages = [
  "Youre seeing a mix of common experiences.",
  "These aren\u2019t rare stories.",
];

const breatherThresholds = [5, 6, 7];

const reviewById = new Map(REVIEWS.map((review) => [review.id, review]));

const matchesSearch = (review: Review, query: string) => {
  const haystack = [
    review.quote,
    review.name,
    review.city,
    review.context,
    review.story,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
};

export default function ReviewFeed() {
  const [selectedQuestionId, setSelectedQuestionId] = useState(EXPLORING_ID);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [displayedIds, setDisplayedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [helpedIds, setHelpedIds] = useState<Set<string>>(new Set());
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [personalizationTags, setPersonalizationTags] = useState<Set<string>>(
    new Set()
  );
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [scrolledPastSix, setScrolledPastSix] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const activeQuestion =
    selectedQuestionId === EXPLORING_ID
      ? DEFAULT_QUESTION
      : QUESTIONS.find((question) => question.id === selectedQuestionId) ??
        DEFAULT_QUESTION;

  const biasTags = useMemo(() => {
    const tags = new Set<string>();
    personalizationTags.forEach((tag) => tags.add(tag));

    const interactionIds = new Set([
      ...expandedIds,
      ...helpedIds,
      ...playedIds,
    ]);

    interactionIds.forEach((id) => {
      const review = reviewById.get(id);
      if (!review) return;
      review.questionTags.forEach((tag) => tags.add(tag));
      review.personaTags?.forEach((tag) => tags.add(tag));
    });

    return Array.from(tags);
  }, [expandedIds, helpedIds, playedIds, personalizationTags]);

  const rankResult = useMemo(
    () =>
      rankReviews(REVIEWS, {
        questionTags: activeQuestion.tags,
        adjacentTags: activeQuestion.adjacentTags,
        biasTags,
      }),
    [activeQuestion.id, biasTags]
  );

  const rankedReviews = useMemo(() => {
    if (!searchQuery.trim()) return rankResult.items;
    return rankResult.items.filter((review) => matchesSearch(review, searchQuery));
  }, [rankResult.items, searchQuery]);

  useEffect(() => {
    setDisplayedIds(rankedReviews.slice(0, INITIAL_COUNT).map((review) => review.id));
    setExpandedIds(new Set());
    setHelpedIds(new Set());
    setPlayedIds(new Set());
    setPlayingId(null);
    setScrolledPastSix(false);
  }, [selectedQuestionId, searchQuery]);

  useEffect(() => {
    if (displayedIds.length >= 7) {
      setScrolledPastSix(true);
    }
  }, [displayedIds.length]);

  const loadMore = useCallback(() => {
    setDisplayedIds((prev) => {
      const remaining = rankedReviews.filter((review) => !prev.includes(review.id));
      const next = remaining.slice(0, LOAD_MORE_COUNT).map((review) => review.id);
      return [...prev, ...next];
    });
  }, [rankedReviews]);

  useEffect(() => {
    if (!loadMoreRef.current) return undefined;
    const node = loadMoreRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && displayedIds.length < rankedReviews.length) {
          loadMore();
        }
      },
      { rootMargin: "120px" }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [displayedIds.length, rankedReviews.length, loadMore]);

  const visibleReviews = displayedIds
    .map((id) => reviewById.get(id))
    .filter(Boolean) as Review[];

  const hasIntent =
    scrolledPastSix || expandedIds.size > 0 || playedIds.size > 0 || helpedIds.size > 0;

  const showConversionCard =
    expandedIds.size >= 3 || playedIds.size > 0 || personalizationTags.size > 0;

  const blocks = useMemo(() => {
    const items: Array<
      | { type: "review"; review: Review }
      | { type: "breather"; text: string }
      | { type: "prompt" }
      | { type: "conversion" }
      | { type: "completeness"; text: string }
    > = [];

    let intenseCount = 0;
    let breatherIndex = 0;
    let nextBreatherAt = breatherThresholds[0];
    let insertedPrompt = false;
    let insertedConversion = false;
    let insertedCompleteness = false;
    const completenessMessage =
      completenessMessages[selectedQuestionId.length % completenessMessages.length];

    visibleReviews.forEach((review, index) => {
      items.push({ type: "review", review });

      if (scrolledPastSix && index === 4) {
        items.push({ type: "completeness", text: completenessMessage });
        insertedCompleteness = true;
      }

      if (hasIntent && index === 5) {
        items.push({ type: "prompt" });
        insertedPrompt = true;
      }

      if (showConversionCard && index === 7) {
        items.push({ type: "conversion" });
        insertedConversion = true;
      }

      if (review.intensityScore >= 0.7) {
        intenseCount += 1;
        if (intenseCount >= nextBreatherAt) {
          items.push({
            type: "breather",
            text: breatherMessages[breatherIndex % breatherMessages.length],
          });
          breatherIndex += 1;
          intenseCount = 0;
          nextBreatherAt = breatherThresholds[breatherIndex % breatherThresholds.length];
        }
      }
    });

    if (scrolledPastSix && !insertedCompleteness && visibleReviews.length) {
      items.push({ type: "completeness", text: completenessMessage });
    }

    if (hasIntent && !insertedPrompt && visibleReviews.length) {
      items.push({ type: "prompt" });
    }

    if (showConversionCard && !insertedConversion && visibleReviews.length) {
      items.push({ type: "conversion" });
    }

    return items;
  }, [
    visibleReviews,
    hasIntent,
    scrolledPastSix,
    showConversionCard,
    selectedQuestionId.length,
  ]);

  const contextLine =
    selectedQuestionId === EXPLORING_ID
      ? "Here\u2019s how people describe their first experience:"
      : "People who asked this said:";

  const showClosestExperiencesLabel = rankResult.usedAdjacentTags;

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleHelped = (id: string) => {
    setHelpedIds((prev) => new Set(prev).add(id));
  };

  const handleTogglePlay = (id: string) => {
    setPlayingId((prev) => (prev === id ? null : id));
    setPlayedIds((prev) => new Set(prev).add(id));
  };

  const handleStopMedia = () => {
    setPlayingId(null);
  };

  const handleTogglePersonalization = (tag: string) => {
    setPersonalizationTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  return (
    <section className="min-h-screen bg-canvas-base pb-16">
      <div className="mx-auto max-w-5xl px-4">
        <header className="pt-12">
          <h1 className="text-3xl font-semibold text-semantic-heading sm:text-4xl">
            If youre wondering
          </h1>
          <p className="mt-2 text-base text-semantic-text sm:text-lg">
            Youre probably not the first. Here\u2019s what real Musafirs said.
          </p>
          <p className="mt-3 text-sm text-semantic-text-light">
            These questions came from real Musafirs before their first trip.
          </p>
        </header>
      </div>

      <div className="sticky top-0 z-20">
        <QuestionSelector
          questions={QUESTIONS}
          selectedId={selectedQuestionId}
          showAll={showAllQuestions}
          onSelect={(id) => setSelectedQuestionId(id)}
          onToggleShowAll={() => setShowAllQuestions((prev) => !prev)}
        />
      </div>

      <div className="mx-auto mt-6 max-w-5xl px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-semantic-text-light">{contextLine}</p>
          {showClosestExperiencesLabel ? (
            <span className="text-xs font-medium text-semantic-text">
              Showing closest experiences
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <label className="text-xs text-semantic-text-light" htmlFor="review-search">
            Search
          </label>
          <input
            id="review-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by city, trip, or keyword\u2026"
            className="w-full rounded-2xl border border-canvas-line bg-white px-4 py-3 text-sm text-semantic-heading placeholder:text-semantic-text-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          />
          {searchQuery.trim() ? (
            <span className="text-xs text-semantic-text">Matches your search</span>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-4">
          {blocks.map((block, index) => {
            if (block.type === "review") {
              const review = block.review;
              const expanded = expandedIds.has(review.id);
              const helped = helpedIds.has(review.id);
              const isPlaying = playingId === review.id;

              return (
                <ReviewCard
                  key={review.id}
                  review={review}
                  expanded={expanded}
                  onToggleExpand={() => handleToggleExpand(review.id)}
                  onHelped={() => handleHelped(review.id)}
                  helped={helped}
                  isPlaying={isPlaying}
                  onTogglePlay={() => handleTogglePlay(review.id)}
                  onStopMedia={handleStopMedia}
                />
              );
            }

            if (block.type === "breather") {
              return <BreatherCard key={`breather-${index}`} text={block.text} />;
            }

            if (block.type === "completeness") {
              return (
                <BreatherCard key={`completeness-${index}`} text={block.text} />
              );
            }

            if (block.type === "prompt") {
              return (
                <PersonalizationPrompt
                  key="personalization"
                  selectedTags={[...personalizationTags]}
                  onToggleTag={handleTogglePersonalization}
                />
              );
            }

            return <ConversionCard key="conversion" />;
          })}

          {!blocks.length ? (
            <div className="rounded-2xl border border-canvas-line bg-white px-6 py-5 text-sm text-semantic-text">
              No matches right now. Try a different word.
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          {displayedIds.length < rankedReviews.length ? (
            <button
              type="button"
              onClick={loadMore}
              className="rounded-full border border-canvas-line px-5 py-2 text-xs font-semibold text-semantic-heading transition hover:border-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              Load more stories
            </button>
          ) : null}
          <div ref={loadMoreRef} aria-hidden="true" />
        </div>
      </div>

      <div className="sr-only">{EXPLORING_LABEL}</div>
    </section>
  );
}
