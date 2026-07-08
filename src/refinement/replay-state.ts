/**
 * Replay-state normalizer shared by every consumer of a RefinementSession
 * (compliance renderer, rescore, external API callers). Sessions written
 * before the honest-replay change (#184) have a numeric `scoreboard.after`
 * and no `replay` field; live-mode ones among them carry a FABRICATED
 * after-state. Treating "replay missing" as measured therefore fails open —
 * the exact bug #184 removed. Inference order:
 *
 *   1. explicit `scoreboard.replay` wins;
 *   2. a recorded live run (any event with data.mode === 'live') is
 *      'deferred' — pre-#184 live runs never truly replayed;
 *   3. otherwise a null/absent after-score is 'deferred', a numeric one is a
 *      genuinely measured mock replay.
 */

import type {RefinementSession} from './types';

export function normalizeReplayState(session: Pick<RefinementSession, 'events'> & {scoreboard: Partial<RefinementSession['scoreboard']>}): 'measured' | 'deferred' {
  if (session.scoreboard.replay) {
    return session.scoreboard.replay;
  }

  if (session.events?.some(e => e.data?.mode === 'live')) {
    return 'deferred';
  }

  return (session.scoreboard.after ?? null) === null ? 'deferred' : 'measured';
}
