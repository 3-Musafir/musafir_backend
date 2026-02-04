import { Review } from "../data/reviews";

export type RankOptions = {
  questionTags: string[];
  adjacentTags: string[];
  biasTags?: string[];
  now?: Date;
};

export type RankResult = {
  items: Review[];
  usedAdjacentTags: boolean;
};

const MIN_MATCHES = 18;
const HIGH_INTENSITY_THRESHOLD = 0.75;

const intersects = (source: string[], target: string[]) =>
  source.some((tag) => target.includes(tag));

const mediaBonus = (review: Review) => {
  if (!review.media) return 0;
  if (review.media.type === "voice") return 2;
  if (review.media.type === "photos") return 1;
  return 0.5;
};

const recencyBonus = (createdAt: string, now: Date) => {
  const created = new Date(createdAt).getTime();
  const ageDays = Math.max(0, (now.getTime() - created) / (1000 * 60 * 60 * 24));
  const decay = Math.min(1, ageDays / 365);
  return 0.5 * (1 - decay);
};

const biasBoost = (review: Review, biasTags: string[]) => {
  if (!biasTags.length) return 0;
  const tags = [...review.questionTags, ...(review.personaTags ?? [])];
  const overlap = tags.filter((tag) => biasTags.includes(tag)).length;
  return Math.min(2, overlap * 0.6);
};

const scoreReview = (
  review: Review,
  questionTags: string[],
  adjacentTags: string[],
  biasTags: string[],
  now: Date
) => {
  const questionMatch = intersects(review.questionTags, questionTags)
    ? 1
    : intersects(review.questionTags, adjacentTags)
      ? 0.6
      : 0;

  return (
    questionMatch * 5 +
    review.intensityScore * 2 +
    mediaBonus(review) +
    review.helpfulCount * 0.1 +
    (review.verifiedTrip ? 1 : 0) +
    recencyBonus(review.createdAt, now) +
    biasBoost(review, biasTags)
  );
};

const paceHighIntensity = (reviews: Review[]) => {
  const pool = [...reviews];
  const paced: Review[] = [];
  let highStreak = 0;

  while (pool.length) {
    let pickIndex = 0;

    if (highStreak >= 3) {
      const lowIndex = pool.findIndex(
        (review) => review.intensityScore <= HIGH_INTENSITY_THRESHOLD
      );
      pickIndex = lowIndex === -1 ? 0 : lowIndex;
    }

    const [next] = pool.splice(pickIndex, 1);
    paced.push(next);
    highStreak =
      next.intensityScore > HIGH_INTENSITY_THRESHOLD ? highStreak + 1 : 0;
  }

  return paced;
};

export const rankReviews = (
  reviews: Review[],
  { questionTags, adjacentTags, biasTags = [], now = new Date() }: RankOptions
): RankResult => {
  const primary = reviews.filter((review) =>
    intersects(review.questionTags, questionTags)
  );

  let gated = primary;
  let usedAdjacentTags = false;

  if (primary.length < MIN_MATCHES && adjacentTags.length) {
    usedAdjacentTags = true;
    const adjacent = reviews.filter(
      (review) =>
        !primary.includes(review) &&
        intersects(review.questionTags, adjacentTags)
    );
    gated = [...primary, ...adjacent];
  }

  const scored = gated
    .map((review, index) => ({
      review,
      score: scoreReview(review, questionTags, adjacentTags, biasTags, now),
      index,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.review.createdAt !== a.review.createdAt) {
        return b.review.createdAt > a.review.createdAt ? 1 : -1;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.review);

  const paced = paceHighIntensity(scored);

  return { items: paced, usedAdjacentTags };
};
