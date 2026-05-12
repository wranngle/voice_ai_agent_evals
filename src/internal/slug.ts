/**
 * @wranngle/voice-evals/internal/slug — ReDoS-safe slug helper.
 *
 * Replaces the chained `[^\w-]+` / `-+/g` / `^-+|-+$` regex idiom we had
 * scattered through baseline.ts and post-call-import.ts. CodeQL flagged
 * those as polynomial-regex risk on user-controlled input (caller-supplied
 * conversation IDs, agent names); this imperative scan is linear in
 * input length and has no backtracking.
 */

export type SlugOptions = {
  /** Max output length. Default 48. */
  maxLength?: number;
  /** Additional chars allowed alongside [a-z0-9]. Default ''. */
  allowedExtra?: string;
};

export function slugify(value: string, options: SlugOptions = {}): string {
  const maxLength = options.maxLength ?? 48;
  const extra = options.allowedExtra ?? '';
  const out: string[] = [];
  let lastWasDash = false;

  for (const ch of value.toLowerCase()) {
    const isAllowed
      = (ch >= 'a' && ch <= 'z')
        || (ch >= '0' && ch <= '9')
        || extra.includes(ch);
    if (isAllowed) {
      out.push(ch);
      lastWasDash = false;
    } else if (!lastWasDash && out.length > 0) {
      out.push('-');
      lastWasDash = true;
    }
  }

  while (out.length > 0 && out.at(-1) === '-') {
    out.pop();
  }

  return out.slice(0, maxLength).join('');
}
