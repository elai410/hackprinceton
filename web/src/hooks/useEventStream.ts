import { useEffect } from "react";

import { COMPANION_BASE_URL } from "../api";
import { useStore } from "../state/store";
import type { RecentEvent, RecentFire } from "../types";

interface SnapshotPayload {
  events: RecentEvent[];
  fires: RecentFire[];
}

/**
 * Subscribe to /events/stream (SSE) and pipe everything into the global store.
 *
 * Mount once near the root of the app. EventSource auto-reconnects on
 * disconnect, and the snapshot the server sends on every reconnect repairs
 * any gap in the stream so we never need to poll for missed events.
 */
export function useEventStream(): void {
  const setEventsSnapshot = useStore((s) => s.setEventsSnapshot);
  const pushRecentEvent = useStore((s) => s.pushRecentEvent);
  const pushRecentFire = useStore((s) => s.pushRecentFire);
  const setEventsConnected = useStore((s) => s.setEventsConnected);

  useEffect(() => {
    const url = `${COMPANION_BASE_URL}/events/stream`;
    let es: EventSource | null = null;
    let cancelled = false;

    const open = () => {
      if (cancelled) return;
      es = new EventSource(url);

      es.addEventListener("snapshot", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as SnapshotPayload;
          setEventsSnapshot(data.events ?? [], data.fires ?? []);
        } catch {
          /* ignore malformed frames */
        }
      });

      es.addEventListener("event", (e) => {
        try {
          const ev = JSON.parse((e as MessageEvent).data) as RecentEvent;
          pushRecentEvent(ev);
        } catch {
          /* ignore */
        }
      });

      es.addEventListener("fire", (e) => {
        try {
          const fr = JSON.parse((e as MessageEvent).data) as RecentFire;
          pushRecentFire(fr);
        } catch {
          /* ignore */
        }
      });

      es.onerror = () => {
        // EventSource handles reconnection itself, but mark us as
        // disconnected so the UI can show a subtle "reconnecting" hint.
        setEventsConnected(false);
      };
    };

    open();

    return () => {
      cancelled = true;
      if (es) {
        es.close();
        es = null;
      }
      setEventsConnected(false);
    };
    // setX functions from the zustand store are stable references — no need
    // to declare them as deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
