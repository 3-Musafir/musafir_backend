type BreatherCardProps = {
  text: string;
};

export default function BreatherCard({ text }: BreatherCardProps) {
  return (
    <div className="rounded-2xl border border-canvas-line bg-canvas-soft px-5 py-4 text-sm text-semantic-heading">
      {text}
    </div>
  );
}
