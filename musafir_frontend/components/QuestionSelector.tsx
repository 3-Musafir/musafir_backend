import { Question, EXPLORING_ID, EXPLORING_LABEL } from "../data/questions";

type QuestionSelectorProps = {
  questions: Question[];
  selectedId: string;
  showAll: boolean;
  onSelect: (id: string) => void;
  onToggleShowAll: () => void;
};

export default function QuestionSelector({
  questions,
  selectedId,
  showAll,
  onSelect,
  onToggleShowAll,
}: QuestionSelectorProps) {
  return (
    <div className="frosted border-y border-canvas-line px-4 py-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSelect(EXPLORING_ID)}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
              selectedId === EXPLORING_ID
                ? "border-brand-primary bg-brand-primary-light text-semantic-heading"
                : "border-canvas-line bg-white text-semantic-text"
            }`}
          >
            {EXPLORING_LABEL}
          </button>
          {questions.map((question, index) => {
            const isHiddenOnMobile = !showAll && index > 2;
            return (
            <button
              key={question.id}
              type="button"
              onClick={() => onSelect(question.id)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                selectedId === question.id
                  ? "border-brand-primary bg-brand-primary-light text-semantic-heading"
                  : "border-canvas-line bg-white text-semantic-text"
              } ${isHiddenOnMobile ? "hidden md:inline-flex" : ""}`}
            >
              {question.text}
            </button>
          );
          })}
        </div>
        <div className="flex items-center justify-between text-xs text-semantic-text-light">
          <button
            type="button"
            onClick={onToggleShowAll}
            className="md:hidden"
          >
            {showAll ? "See fewer" : "See more"}
          </button>
          <button
            type="button"
            onClick={onToggleShowAll}
            className="text-semantic-text"
          >
            Change question
          </button>
        </div>
      </div>
    </div>
  );
}
