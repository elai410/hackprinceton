interface HeaderProps {
  connected: boolean;
  manifestId: string;
  adapter: string;
  robotLabel: string;
}

export default function Header({ connected, manifestId, adapter, robotLabel }: HeaderProps) {
  return (
    <header className="bg-plum text-cream border-b border-rule">
      {/* multi-tone accent strip at the very top */}
      <div className="flex h-[3px]">
        <span className="flex-1 bg-clay" />
        <span className="flex-1 bg-sage" />
        <span className="flex-1 bg-sky" />
        <span className="flex-1 bg-sand" />
      </div>

      <div className="px-8 py-7 flex items-end justify-between gap-8">
        <div className="flex items-end gap-6">
          <h1 className="display text-[48px] leading-none">
            Re<span className="text-clay">w</span>ire
          </h1>
          <p className="hidden sm:block max-w-md text-sm text-cream/80 leading-snug pb-1">
            Natural-language control for robots.
            <span className="block italic text-cream/60">
              <span className="text-sand">Compose</span> &middot;{" "}
              <span className="text-sand">Verify</span> &middot;{" "}
              <span className="text-sand">Run</span>.
            </span>
          </p>
        </div>

        <div className="flex items-end gap-8 text-right">
          <Meta label="Robot" value={robotLabel} accent="text-sand" />
          <Meta label="Manifest" value={manifestId} accent="text-sand" mono />
          <Meta label="Adapter" value={adapter} accent="text-sand" mono />
          <div className="flex items-center gap-2 pb-1">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-sage" : "bg-clay animate-pulse"
              }`}
            />
            <span className="font-sans text-[11px] uppercase tracking-widest2 text-cream/80">
              {connected ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function Meta({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`font-sans text-[11px] uppercase tracking-widest2 ${accent}`}>
        {label}
      </span>
      <span className={`text-sm text-cream ${mono ? "font-mono text-[12px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}
