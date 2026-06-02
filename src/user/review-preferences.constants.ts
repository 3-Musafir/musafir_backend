export const REVIEW_PREFERENCE_LIMITS = {
  preferredReviewIds: 100,
  questionTags: 20,
  personaTags: 20,
} as const;

export const REVIEW_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,140}$/;

export const ALLOWED_REVIEW_QUESTION_TAGS = [
  'first_experience',
  'safety_women',
  'solo_awkward',
  'value_money',
  'inclusive',
  'no_one',
  'comfort_self',
  'community_active',
] as const;

export const ALLOWED_REVIEW_PERSONA_TAGS = [
  'solo',
  'women',
  'introvert',
  'safety',
  'community',
] as const;

export type ReviewQuestionTag = (typeof ALLOWED_REVIEW_QUESTION_TAGS)[number];
export type ReviewPersonaTag = (typeof ALLOWED_REVIEW_PERSONA_TAGS)[number];

