// jsdom has no EventSource, and api.ts is the one module that opens one. This
// stands in for the browser's, records every connection opened, and lets a test
// deliver a frame of a given event type to whoever is listening for it.
import { vi } from "vitest";

export class FakeEventSource {
  closed = false;
  private readonly listeners = new Map<string, Set<EventListener>>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: EventListener): void {
    const forType = this.listeners.get(type) ?? new Set<EventListener>();
    forType.add(listener);
    this.listeners.set(type, forType);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  deliver(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data }));
    }
  }
}

export function installFakeEventSources(): FakeEventSource[] {
  const opened: FakeEventSource[] = [];
  vi.stubGlobal(
    "EventSource",
    class extends FakeEventSource {
      constructor(url: string) {
        super(url);
        opened.push(this);
      }
    },
  );
  return opened;
}
