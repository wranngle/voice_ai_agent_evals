/**
 * Structured event emitter for a Refinement session. Every step in the
 * pipeline emits to this — the surfaced experience promise in the pitch is
 * delivered by replaying this log into the proof console.
 */

import type {SessionEvent} from './types';

export type EventListener = (event: SessionEvent) => void;

export class SessionLog {
  private readonly events: SessionEvent[] = [];
  private readonly listeners: EventListener[] = [];

  emit(step: string, status: SessionEvent['status'], detail: string, data?: Record<string, unknown>): void {
    const event: SessionEvent = {
      at: new Date().toISOString(),
      step,
      status,
      detail,
      ...(data ? {data} : {}),
    };
    this.events.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: EventListener): void {
    this.listeners.push(listener);
  }

  snapshot(): SessionEvent[] {
    return [...this.events];
  }
}

const STATUS_GLYPH: Record<SessionEvent['status'], string> = {
  start: '→',
  ok: '✓',
  warn: '!',
  fail: '✗',
};

export function renderEventForConsole(event: SessionEvent): string {
  const time = event.at.slice(11, 19);
  return `${time} ${STATUS_GLYPH[event.status]} ${event.step.padEnd(28)} ${event.detail}`;
}
