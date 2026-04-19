import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import Header from "./components/Header";
import ConversationPane from "./components/ConversationPane/ConversationPane";
import WorkflowPane from "./components/WorkflowPane/WorkflowPane";
import { useStore } from "./state/store";

export default function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 10_000,
  });

  const manifest = useQuery({
    queryKey: ["manifest"],
    queryFn: api.manifest,
  });

  const turnCount = useStore((s) => s.turns.length);
  const phase = useStore((s) => s.phase);
  const plan = useStore((s) => s.plan);

  // Hero mode: nothing has happened yet. The workflow pane is hidden so the
  // user can focus on describing the interaction they want.
  const heroMode = turnCount === 0 && !plan && phase === "idle";

  return (
    <div className="min-h-screen flex flex-col bg-cream text-ink">
      <Header
        connected={health.isSuccess}
        manifestId={health.data?.manifest_id ?? manifest.data?.manifest_id ?? "—"}
        adapter={health.data?.adapter ?? "—"}
        robotLabel={manifest.data?.robot_label ?? "Adeept 5 DOF"}
      />

      {heroMode ? (
        <main className="flex-1 bg-cream">
          <ConversationPane manifest={manifest.data ?? null} mode="hero" />
        </main>
      ) : (
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-px bg-rule">
          <section className="bg-cream min-h-[60vh] lg:min-h-0 flex flex-col">
            <ConversationPane manifest={manifest.data ?? null} mode="compact" />
          </section>
          <section className="bg-linen min-h-[60vh] lg:min-h-0 flex flex-col">
            <WorkflowPane manifest={manifest.data ?? null} />
          </section>
        </main>
      )}

      <footer className="border-t border-rule bg-sand px-8 py-4 flex items-center justify-between text-[11px] uppercase tracking-widest2 text-graphite">
        <span>
          Rewire <span className="text-clay">●</span> Princeton 2026
        </span>
        <span className="text-plum">Compose &middot; Verify &middot; Run</span>
      </footer>
    </div>
  );
}
