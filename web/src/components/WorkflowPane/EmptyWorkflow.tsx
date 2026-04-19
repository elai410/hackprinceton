export default function EmptyWorkflow() {
  return (
    <div className="hairline-soft p-12 flex flex-col items-center text-center gap-4 animate-fadeUp">
      <div className="w-16 h-16 hairline flex items-center justify-center">
        <span className="font-display italic text-3xl text-mute">∅</span>
      </div>
      <p className="font-display italic text-2xl text-graphite leading-snug max-w-sm">
        Composing your workflow…
      </p>
      <p className="text-sm text-mute max-w-xs">
        Blocks will appear here as soon as the planner is done.
      </p>
    </div>
  );
}
