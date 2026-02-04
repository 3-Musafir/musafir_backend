export type Question = {
  id: string;
  text: string;
  tags: string[];
  adjacentTags: string[];
};

export const EXPLORING_ID = "exploring";
export const DEFAULT_QUESTION_ID = "first_experience";

export const DEFAULT_QUESTION: Question = {
  id: DEFAULT_QUESTION_ID,
  text: "What was your first experience like?",
  tags: ["first_experience"],
  adjacentTags: ["solo_awkward", "value_money", "comfort_self"],
};

export const QUESTIONS: Question[] = [
  {
    id: "safety_women",
    text: "Is this actually safe \u2014 especially for women?",
    tags: ["safety_women"],
    adjacentTags: ["comfort_self", "solo_awkward", "first_experience"],
  },
  {
    id: "solo_awkward",
    text: "Will I feel awkward if I come alone?",
    tags: ["solo_awkward"],
    adjacentTags: ["no_one", "first_experience", "comfort_self"],
  },
  {
    id: "value_money",
    text: "Is this worth the money, honestly?",
    tags: ["value_money"],
    adjacentTags: ["first_experience", "community_active"],
  },
  {
    id: "inclusive",
    text: "Is it inclusive, or just good marketing?",
    tags: ["inclusive"],
    adjacentTags: ["comfort_self", "first_experience"],
  },
  {
    id: "no_one",
    text: "What if I don\u2019t know anyone there?",
    tags: ["no_one"],
    adjacentTags: ["solo_awkward", "community_active"],
  },
  {
    id: "comfort_self",
    text: "Will I feel comfortable being myself?",
    tags: ["comfort_self"],
    adjacentTags: ["inclusive", "safety_women", "solo_awkward"],
  },
  {
    id: "community_active",
    text: "Does the community stay active after the trip?",
    tags: ["community_active"],
    adjacentTags: ["value_money", "no_one"],
  },
];

export const EXPLORING_LABEL = "I\u2019m just exploring";
