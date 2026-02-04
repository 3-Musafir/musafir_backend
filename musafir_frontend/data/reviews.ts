export type Media = {
  type: "voice" | "photos" | "video";
  durationSec?: number;
  count?: number;
};

export type Review = {
  id: string;
  quote: string;
  name?: string;
  city?: string;
  context: string;
  questionTags: string[];
  intensityScore: number;
  helpfulCount: number;
  verifiedTrip?: boolean;
  createdAt: string;
  media?: Media;
  story?: string;
  personaTags?: string[];
};

const seedReviews: Review[] = [
  {
    id: "seed-1",
    quote: "I was nervous at first, but the lead made it feel easy to join in.",
    name: "Sara",
    city: "Lahore",
    context: "Hunza Flagship \u00b7 First-time solo",
    questionTags: ["solo_awkward", "first_experience"],
    intensityScore: 0.68,
    helpfulCount: 18,
    verifiedTrip: true,
    createdAt: "2025-11-12T10:00:00.000Z",
    media: { type: "voice", durationSec: 23 },
    story:
      "I kept my expectations low, but the check-ins and small group moments helped. I was quiet most of the time and it still felt okay.",
    personaTags: ["solo", "lahore", "women"],
  },
  {
    id: "seed-2",
    quote: "Not everything was perfect, but the group handled it together.",
    name: "Ali",
    city: "Karachi",
    context: "Skardu Spring \u00b7 Returning member",
    questionTags: ["community_active", "value_money"],
    intensityScore: 0.78,
    helpfulCount: 22,
    verifiedTrip: true,
    createdAt: "2025-10-04T10:00:00.000Z",
    story:
      "A couple of plans changed, but nobody got left out. The vibe stayed calm and cooperative.",
    personaTags: ["karachi", "community"],
  },
  {
    id: "seed-3",
    quote: "I worried it would be cliquey. It wasn\u2019t.",
    name: "Zainab",
    city: "Islamabad",
    context: "Neelum Valley \u00b7 First-time group travel",
    questionTags: ["inclusive", "comfort_self"],
    intensityScore: 0.52,
    helpfulCount: 15,
    verifiedTrip: true,
    createdAt: "2025-09-18T10:00:00.000Z",
    media: { type: "photos", count: 3 },
    story:
      "There were small circles, but people kept inviting me in. It felt open enough for a quiet person.",
    personaTags: ["islamabad", "introvert"],
  },
  {
    id: "seed-4",
    quote: "I came alone and still had someone to sit with by day two.",
    name: "Umar",
    city: "Rawalpindi",
    context: "Swat Retreat \u00b7 Solo traveler",
    questionTags: ["solo_awkward", "no_one"],
    intensityScore: 0.64,
    helpfulCount: 12,
    verifiedTrip: true,
    createdAt: "2025-08-22T10:00:00.000Z",
    story:
      "The host paired people for meals, which helped me feel less awkward without forcing it.",
    personaTags: ["solo", "rawalpindi"],
  },
  {
    id: "seed-5",
    quote: "Safety was my biggest worry. The check-ins helped.",
    name: "Hina",
    city: "Lahore",
    context: "Hunza Flagship \u00b7 Women-only cabin",
    questionTags: ["safety_women"],
    intensityScore: 0.72,
    helpfulCount: 20,
    verifiedTrip: true,
    createdAt: "2025-07-11T10:00:00.000Z",
    media: { type: "voice", durationSec: 19 },
    story:
      "I liked that the plan was shared in advance and the lead kept checking in without making it a big thing.",
    personaTags: ["women", "safety", "lahore"],
  },
  {
    id: "seed-6",
    quote: "It felt worth the cost because I didn\u2019t have to plan every detail.",
    name: "Bilal",
    city: "Faisalabad",
    context: "Kaghan Trail \u00b7 Budget traveler",
    questionTags: ["value_money"],
    intensityScore: 0.46,
    helpfulCount: 9,
    verifiedTrip: true,
    createdAt: "2025-06-30T10:00:00.000Z",
    story:
      "I could just show up and focus on the people. That saved me time and stress.",
    personaTags: ["value", "faisalabad"],
  },
  {
    id: "seed-7",
    quote: "I was quiet. No one pushed me to be loud.",
    name: "Nida",
    city: "Peshawar",
    context: "Murree Reset \u00b7 Introvert",
    questionTags: ["comfort_self"],
    intensityScore: 0.4,
    helpfulCount: 7,
    verifiedTrip: true,
    createdAt: "2025-05-18T10:00:00.000Z",
    story:
      "People noticed me without forcing conversation. That felt respectful.",
    personaTags: ["introvert", "peshawar"],
  },
  {
    id: "seed-8",
    quote: "I didn\u2019t know anyone. I left with a few numbers.",
    name: "Hamza",
    city: "Multan",
    context: "Swat Retreat \u00b7 First-time solo",
    questionTags: ["no_one"],
    intensityScore: 0.55,
    helpfulCount: 11,
    verifiedTrip: true,
    createdAt: "2025-04-20T10:00:00.000Z",
    media: { type: "photos", count: 4 },
    story:
      "There were quiet moments, but the group dinners made it easy to start talking.",
    personaTags: ["solo", "multan"],
  },
  {
    id: "seed-9",
    quote: "I expected a tour. It felt like a small group of friends.",
    name: "Fatima",
    city: "Islamabad",
    context: "Skardu Spring \u00b7 First group trip",
    questionTags: ["first_experience", "inclusive"],
    intensityScore: 0.66,
    helpfulCount: 16,
    verifiedTrip: true,
    createdAt: "2025-03-14T10:00:00.000Z",
    story:
      "The schedule was clear but not rigid. People made space for each other.",
    personaTags: ["first_time", "islamabad"],
  },
  {
    id: "seed-10",
    quote: "I was nervous about being judged. It felt normal to be myself.",
    name: "Rida",
    city: "Karachi",
    context: "Neelum Valley \u00b7 Creative traveler",
    questionTags: ["comfort_self", "inclusive"],
    intensityScore: 0.61,
    helpfulCount: 14,
    verifiedTrip: true,
    createdAt: "2025-02-07T10:00:00.000Z",
    story:
      "Nobody made a big deal out of small things. That helped me relax.",
    personaTags: ["karachi", "comfort"],
  },
  {
    id: "seed-11",
    quote: "Not everything was perfect, but the lead owned the mistakes.",
    name: "Saad",
    city: "Lahore",
    context: "Kaghan Trail \u00b7 Group of friends",
    questionTags: ["value_money"],
    intensityScore: 0.7,
    helpfulCount: 13,
    verifiedTrip: true,
    createdAt: "2025-01-12T10:00:00.000Z",
    story:
      "A timing slip happened, but the team explained it and adjusted quickly.",
    personaTags: ["lahore", "value"],
  },
  {
    id: "seed-12",
    quote: "I was nervous at first. The first dinner changed that.",
    name: "Sana",
    city: "Hyderabad",
    context: "Swat Retreat \u00b7 Solo traveler",
    questionTags: ["solo_awkward", "first_experience"],
    intensityScore: 0.59,
    helpfulCount: 10,
    verifiedTrip: true,
    createdAt: "2024-12-10T10:00:00.000Z",
    story:
      "Everyone went around sharing why they came. That broke the ice for me.",
    personaTags: ["solo", "hyderabad"],
  },
  {
    id: "seed-13",
    quote: "It felt inclusive without trying too hard.",
    name: "Ayesha",
    city: "Sialkot",
    context: "Neelum Valley \u00b7 First-time traveler",
    questionTags: ["inclusive"],
    intensityScore: 0.45,
    helpfulCount: 8,
    verifiedTrip: true,
    createdAt: "2024-11-06T10:00:00.000Z",
    story:
      "Small gestures like checking in on the quiet people mattered.",
    personaTags: ["sialkot"],
  },
  {
    id: "seed-14",
    quote: "I felt safer because there was a clear plan and check-in points.",
    name: "Maryam",
    city: "Islamabad",
    context: "Hunza Flagship \u00b7 Women-only cabin",
    questionTags: ["safety_women"],
    intensityScore: 0.73,
    helpfulCount: 17,
    verifiedTrip: true,
    createdAt: "2024-10-02T10:00:00.000Z",
    media: { type: "voice", durationSec: 21 },
    story:
      "Knowing what the day looked like reduced my anxiety a lot.",
    personaTags: ["women", "islamabad", "safety"],
  },
  {
    id: "seed-15",
    quote: "I didn\u2019t expect the group to stay in touch, but they did.",
    name: "Hasan",
    city: "Karachi",
    context: "Skardu Spring \u00b7 Returning member",
    questionTags: ["community_active"],
    intensityScore: 0.58,
    helpfulCount: 12,
    verifiedTrip: true,
    createdAt: "2024-09-12T10:00:00.000Z",
    story:
      "A few of us still plan small meetups. That surprised me in a good way.",
    personaTags: ["community", "karachi"],
  },
  {
    id: "seed-16",
    quote: "Some people come for the trip. Most stay for the people.",
    name: "Omar",
    city: "Quetta",
    context: "Kaghan Trail \u00b7 First-time solo",
    questionTags: ["community_active", "first_experience"],
    intensityScore: 0.62,
    helpfulCount: 9,
    verifiedTrip: true,
    createdAt: "2024-08-08T10:00:00.000Z",
    story:
      "I didn\u2019t expect to keep chatting afterward, but here we are.",
    personaTags: ["community", "quetta"],
  },
  {
    id: "seed-17",
    quote: "I was nervous about money. It felt fair for the care I got.",
    name: "Zoya",
    city: "Lahore",
    context: "Neelum Valley \u00b7 Student",
    questionTags: ["value_money"],
    intensityScore: 0.5,
    helpfulCount: 7,
    verifiedTrip: true,
    createdAt: "2024-07-21T10:00:00.000Z",
    story:
      "The team was transparent about costs and what they covered.",
    personaTags: ["student", "lahore"],
  },
  {
    id: "seed-18",
    quote: "I was nervous about going alone. I didn\u2019t feel alone.",
    name: "Daniyal",
    city: "Gujranwala",
    context: "Swat Retreat \u00b7 Solo traveler",
    questionTags: ["solo_awkward", "no_one"],
    intensityScore: 0.67,
    helpfulCount: 13,
    verifiedTrip: true,
    createdAt: "2024-06-09T10:00:00.000Z",
    story:
      "The host introduced me to another solo traveler early on.",
    personaTags: ["solo", "gujranwala"],
  },
  {
    id: "seed-19",
    quote: "It was inclusive in small ways that added up.",
    name: "Hassan",
    city: "Rawalpindi",
    context: "Murree Reset \u00b7 First-time group travel",
    questionTags: ["inclusive"],
    intensityScore: 0.43,
    helpfulCount: 6,
    verifiedTrip: true,
    createdAt: "2024-05-18T10:00:00.000Z",
    story:
      "People checked if I wanted to join, then let me choose.",
    personaTags: ["rawalpindi"],
  },
  {
    id: "seed-20",
    quote: "I was nervous at first, but it felt calm by the second day.",
    name: "Areeba",
    city: "Islamabad",
    context: "Hunza Flagship \u00b7 First-time solo",
    questionTags: ["first_experience"],
    intensityScore: 0.6,
    helpfulCount: 11,
    verifiedTrip: true,
    createdAt: "2024-04-04T10:00:00.000Z",
    story:
      "I found one or two people who matched my pace and that was enough.",
    personaTags: ["solo", "islamabad"],
  },
  {
    id: "seed-21",
    quote: "Not everything was perfect, but I felt looked after.",
    name: "Usman",
    city: "Multan",
    context: "Skardu Spring \u00b7 First-time traveler",
    questionTags: ["safety_women", "first_experience"],
    intensityScore: 0.71,
    helpfulCount: 9,
    verifiedTrip: true,
    createdAt: "2024-03-02T10:00:00.000Z",
    story:
      "Even when weather shifted, the team stayed calm and kept us informed.",
    personaTags: ["multan", "safety"],
  },
  {
    id: "seed-22",
    quote: "I didn\u2019t feel pressured to perform. That mattered to me.",
    name: "Taha",
    city: "Karachi",
    context: "Neelum Valley \u00b7 Quiet traveler",
    questionTags: ["comfort_self"],
    intensityScore: 0.48,
    helpfulCount: 5,
    verifiedTrip: true,
    createdAt: "2024-02-06T10:00:00.000Z",
    story:
      "People were friendly without pushing me. I could just be there.",
    personaTags: ["karachi", "introvert"],
  },
  {
    id: "seed-23",
    quote: "It wasn\u2019t cheap, but it felt organized and fair.",
    name: "Noor",
    city: "Lahore",
    context: "Kaghan Trail \u00b7 Budget traveler",
    questionTags: ["value_money"],
    intensityScore: 0.52,
    helpfulCount: 6,
    verifiedTrip: true,
    createdAt: "2024-01-18T10:00:00.000Z",
    story:
      "I liked knowing what I was paying for before I said yes.",
    personaTags: ["lahore", "value"],
  },
  {
    id: "seed-24",
    quote: "I worried about safety. The group rules were clear.",
    name: "Hafsa",
    city: "Islamabad",
    context: "Hunza Flagship \u00b7 Women-only cabin",
    questionTags: ["safety_women"],
    intensityScore: 0.69,
    helpfulCount: 8,
    verifiedTrip: true,
    createdAt: "2023-12-22T10:00:00.000Z",
    story:
      "Knowing the boundaries and who to reach out to helped me relax.",
    personaTags: ["women", "islamabad", "safety"],
  },
  {
    id: "seed-25",
    quote: "I came for the trip, but the people were the best part.",
    name: "Imran",
    city: "Lahore",
    context: "Skardu Spring \u00b7 Returning member",
    questionTags: ["community_active"],
    intensityScore: 0.63,
    helpfulCount: 10,
    verifiedTrip: true,
    createdAt: "2023-11-19T10:00:00.000Z",
    story:
      "We still share plans in the group chat months later.",
    personaTags: ["community", "lahore"],
  },
];

const names = [
  "Ayesha",
  "Ahmed",
  "Zara",
  "Bilal",
  "Kiran",
  "Hamza",
  "Sana",
  "Usman",
  "Maha",
  "Daniyal",
  "Sadia",
  "Saif",
  "Nimra",
  "Yousuf",
  "Nawal",
  "Haris",
  "Rimsha",
  "Owais",
];

const cities = [
  "Lahore",
  "Karachi",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Peshawar",
  "Hyderabad",
  "Quetta",
  "Sialkot",
  "Gujranwala",
  "Abbottabad",
];

const contexts = [
  "Hunza Flagship \u00b7 First-time solo",
  "Skardu Spring \u00b7 Returning member",
  "Neelum Valley \u00b7 First group trip",
  "Kaghan Trail \u00b7 Budget traveler",
  "Swat Retreat \u00b7 Solo traveler",
  "Murree Reset \u00b7 Introvert",
  "Fairy Meadows \u00b7 First-time traveler",
  "Naran Escape \u00b7 Friends of friends",
];

const quotePool = [
  "I was nervous at first, but I found my rhythm.",
  "Not everything was perfect, but I felt supported.",
  "I didn\u2019t know anyone. It got easier quickly.",
  "I worried it would feel awkward. It didn\u2019t.",
  "I felt safe because things were clearly organized.",
  "It felt worth the money for the care and planning.",
  "I could be quiet and still feel included.",
  "I came alone and left with real connections.",
  "I expected a tour. It felt more human.",
  "I was nervous about being myself. It felt okay.",
  "It wasn\u2019t flawless, but it felt honest.",
  "I was nervous at first, then it felt calm.",
];

const storyPool = [
  "Small group moments made it easier to talk. I didn\u2019t feel rushed.",
  "The team explained the plan clearly, which eased my nerves.",
  "I liked that people checked in without being pushy.",
  "There were quiet moments and that was okay.",
  "The structure helped me relax and enjoy the trip.",
  "I felt seen without needing to be loud.",
];

const questionTagSets: string[][] = [
  ["first_experience"],
  ["solo_awkward"],
  ["no_one"],
  ["safety_women"],
  ["value_money"],
  ["inclusive"],
  ["comfort_self"],
  ["community_active"],
  ["solo_awkward", "no_one"],
  ["first_experience", "inclusive"],
];

const personaSets: string[][] = [
  ["solo"],
  ["safety"],
  ["lahore"],
  ["karachi"],
  ["islamabad"],
  ["introvert"],
  ["students"],
  ["community"],
];

const generated: Review[] = Array.from({ length: 175 }, (_, index) => {
  const intensityBase = ((index * 37) % 100) / 100;
  const intensityScore = Math.min(0.93, Math.max(0.3, intensityBase));
  const helpfulCount = 3 + ((index * 13) % 38);
  const verifiedTrip = index % 4 === 0;
  const name = index % 6 === 0 ? undefined : names[index % names.length];
  const city = index % 5 === 0 ? undefined : cities[index % cities.length];
  const questionTags = questionTagSets[index % questionTagSets.length];
  const personaTags = personaSets[index % personaSets.length];
  const context = contexts[index % contexts.length];
  const quote = quotePool[index % quotePool.length];
  const story = storyPool[index % storyPool.length];
  const createdAt = new Date(Date.UTC(2024, 0, 1 + index * 2)).toISOString();

  let media: Media | undefined;
  if (index % 9 === 0) {
    media = { type: "voice", durationSec: 12 + (index % 18) };
  } else if (index % 7 === 0) {
    media = { type: "photos", count: 2 + (index % 4) };
  } else if (index % 11 === 0) {
    media = { type: "video", durationSec: 6 + (index % 12) };
  }

  return {
    id: `gen-${index + 1}`,
    quote,
    name,
    city,
    context,
    questionTags,
    intensityScore,
    helpfulCount,
    verifiedTrip,
    createdAt,
    media,
    story,
    personaTags,
  };
});

export const REVIEWS: Review[] = [...seedReviews, ...generated];
