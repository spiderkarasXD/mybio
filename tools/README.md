# Bottom input: adding words and answers

1. Open `tools/secret.html` (locally, or at `/tools/secret.html` on the site).
2. Type the trigger words, comma separated, and the answer. Case, `ё` and punctuation don't matter.
3. Press the button and copy the generated lines.
4. In `index.html`, paste them inside `m: { ... }` in the "input at the very bottom" script.
5. Commit and push.

The salt and iteration count in `tools/secret.html` must match `V.s` / `V.n` in `index.html`.
