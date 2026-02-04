type PersonalizationPromptProps = {
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
};

const options = [
  { label: "Im traveling solo", tag: "solo" },
  { label: "Safety matters to me", tag: "safety" },
  { label: "Im from Lahore", tag: "lahore" },
  { label: "Karachi", tag: "karachi" },
  { label: "Islamabad", tag: "islamabad" },
  { label: "Other", tag: "other" },
];

export default function PersonalizationPrompt({
  selectedTags,
  onToggleTag,
}: PersonalizationPromptProps) {
  return (
    <div className="rounded-2xl border border-canvas-line bg-white px-5 py-5 shadow-soft">
      <p className="text-sm font-medium text-semantic-heading">
        Want stories closer to your situation?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selectedTags.includes(option.tag);
          return (
            <button
              key={option.tag}
              type="button"
              onClick={() => onToggleTag(option.tag)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                active
                  ? "border-brand-primary bg-brand-primary-light text-semantic-heading"
                  : "border-canvas-line bg-white text-semantic-text"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
