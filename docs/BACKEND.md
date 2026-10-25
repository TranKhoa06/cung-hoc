# Supabase backend — Cùng học

Backend source is complete but is not connected to a live project until you perform the setup below. The demo does not pretend to authenticate users or call AI.

## 1. Create and configure Supabase

1. Create your own Supabase project. Keep the database password and server API keys private.
2. In SQL Editor, run migrations in order: `supabase/migrations/202610250001_initial.sql`, then `202610250002_ai_finish.sql`. Alternatively use the Supabase CLI migration workflow for a linked project.
3. Enable Google in Authentication → Providers. Register the OAuth callback URL shown by Supabase in Google Cloud. Set the website's actual GitHub Pages URL (including repository path and trailing slash) as Site URL and an allowed redirect; add `http://localhost:5178/` for development if needed.
4. Add the public project URL and publishable/anon key to `.env.local` using the names in `.env.example`. These public values are safe to build into the frontend only because server-side RLS is enabled. Never put a service-role, Gemini or DeepSeek key in a `VITE_` variable.
5. Sign into the app once using Google. Your profile starts as `pending`.
6. Bootstrap the project owner manually in SQL Editor, replacing the exact email:

```sql
update public.profiles
set role = 'admin', status = 'active'
where email = lower('your-email@example.com');
```

Check exactly one intended row was updated. Refresh the app. Normal users cannot change their own role or status. You then approve/lock members in the app; adding an invitation email allows a future signup with that email, it does not send a mail. Existing pending accounts should be approved from the member list. Never promote users based on editable OAuth metadata or frontend configuration.

## 2. Private images and content

The migration creates the private `source-images` bucket, limited to JPEG/PNG/WebP up to 25 MiB each. Files are stored at `<source UUID>/<safe filename>`. Upload metadata before the object. Admins can upload/read; approved active members can read only image objects explicitly linked in a published question's `questionImageIds` within a published deck.

`sourceIds` is provenance, not permission. Opinion screenshots are not exposed by this mechanism. Only explicitly reviewed question illustrations/crops belong in `questionImageIds`; do not attach a full screenshot that includes answer comments. The server cannot determine from pixels whether a manually selected image includes comments. Review the crop first.

Learners cannot select `questions` directly. `get_learning_questions()` checks live membership and returns only published questions/decks with opinions and AI-check details removed; `sourceIds` is reduced to `questionImageIds`. The learned answer/explanation is deliberately available to approved learners because the product is a study tool, not a secured exam service. No API key, member emails or draft content belongs in GitHub's public files.

All app tables have RLS. Blocked/pending users may still read their own profile to see their membership state, but protected data requests are denied. Previously downloaded data cannot be erased from a user's device by revoking future access.

Do not delete learner history to hide content. Change deck/question status to `draft`. No delete grants are provided for decks, questions or sources; foreign keys restrict accidental deletion of historical rows. Database owners can still perform deliberate maintenance in SQL Editor and should back up before doing so.

## 3. AI: one chosen model per check

Deploy function `verify-answer` from this project. With the Supabase CLI already installed and project linked:

```text
supabase functions deploy verify-answer
```

The repository's `supabase/config.toml` disables the legacy gateway JWT check for this function because the handler explicitly verifies the caller with `auth.getUser()` and then checks the current database profile for active admin status. Do not remove those checks. The function creates its service client only after validating the user token; non-admins cannot spend the API budget or see configuration status.

In Dashboard → Edge Functions → Secrets, add whichever provider you use:

| Secret | Meaning |
| --- | --- |
| `GEMINI_API_KEY` | Your Gemini API key; needed only if using Gemini. |
| `GEMINI_MODEL` | Default Gemini model. Defaults to `gemini-3.8-flash` as documented when this implementation was written; configure a model available in your account. |
| `DEEPSEEK_API_KEY` | Your DeepSeek API key; needed only if using DeepSeek. |
| `DEEPSEEK_MODEL` | Default DeepSeek model; defaults to `deepseek-flash`. |
| `APP_ORIGIN` | Recommended: exact GitHub Pages origin such as `https://your-name.github.io` (no repository path). CORS is an extra browser boundary, not authentication. |
| `GEMINI_VISION_MODELS` | Optional comma-separated list of configured Gemini models that accept images. Default allows default model, `gemini-3.8-flash` and `gemini-2.5-flash`. |
| `DEEPSEEK_VISION_MODELS` | Optional comma-separated image-capable DeepSeek model list; defaults to `deepseek-flash`. |

Supabase normally provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. The function also supports the current server `SUPABASE_SECRET_KEYS` default entry if the legacy service key is absent. Never copy these server secrets into the frontend or commit them. API keys are never returned by status responses, included in content backups or intentionally logged.

The UI selects Gemini OR DeepSeek for a check. The same provider and model handle exactly two successful API calls: (1) solve using only the question, choices and reviewed illustration crops; (2) compare that solution against each source comment. No second model, fallback provider or automatic majority voting is used. If a provider call fails, the check fails without labeling any answer wrong. No automatic provider retries are performed by the function.

The two API calls use provider REST endpoints and JSON outputs. Their output is validated for allowed status values, IDs, duplicate IDs and a complete per-comment assessment. Errors, empty/truncated JSON and unknown choice IDs do not become accepted checks. The server does not execute instructions found in images/comments. AI remains a review aid; only the admin applies the result and approves publication.

Only reviewed `questionImageIds` are fetched server-side. Total inline image input is capped at 8 MiB and 4 MiB per image to fit provider/Edge memory constraints. This is lower than the upload limit intentionally: crop/resize large images before requesting AI. If a prompt explicitly refers to a missing diagram, the function saves an `insufficient` result without a paid provider call. This detection is a conservative text heuristic, not a guarantee it recognizes every missing figure. A model can independently report insufficient evidence.

AI checks are rate-limited to 30 requests per admin in five minutes (an individual check can use two provider calls), with per-call 45-second timeout. The browser runs the queue; closing it does not promise background completion. A running server request may finish and save after the browser closes. Completed results are attached only if the question version remains unchanged and the admin remains active. `finish_ai_check` performs this final write atomically under a row lock. AI never changes `correctIds`, `explanation` or publication status.

API costs and provider data processing follow your account. OCR uses your browser; AI verification transmits the selected question, required crops and source comments to your chosen provider. Remove irrelevant commenter names/avatar content before sending.

## 4. Server contracts

- `submit_attempt(p_question_id uuid, p_selected_ids text[], p_version int)` → array of inserted `attempts` rows. The server validates membership, current version, choice IDs and single/multiple rules, computes exact-set correctness and inserts an immutable attempt. It never accepts correctness from the browser. First vs later attempt is derived by timestamp.
- `review_card(p_question_id uuid, p_rating text, p_version int)` → array of `card_reviews` rows. Ratings: again (10 minutes, interval 0), hard (max 1 day, previous ×1.2 rounded), good (max 1 day, ×2.5 rounded), easy (max 4 days, ×3.5 rounded). New question version resets scheduling history.
- `touch_activity(p_action text, p_deck_id uuid default null)` → void. Inserts activity and updates server-side `last_seen`.
- `get_learning_questions()` → published question rows with private source opinions/AI details stripped; available only to active members, including admins.
- Edge `verify-answer`: POST `{action:'status'}` → `{gemini:boolean,deepseek:boolean,models:{gemini,deepseek}}`; this checks configuration presence, not paid-provider connectivity.
- Edge `verify-answer`: POST `{questionId,provider,model?,inputVersion?}` → an `AICheck`. Canonical question content is read from the database; the browser cannot submit different unpersisted input. Both actions require a currently active admin.
- `reserve_ai_job` and `finish_ai_check` are service-role-only RPCs, never browser operations.

Status checks do not prove the key works. A real AI test requires a saved sample question and a click from the authenticated admin. Do not publish success messages until these live checks pass.

## 5. Validation performed and remaining

Pure tests in `tests/backend-ai.test.ts` verify the independent-input boundary, two calls to one model, no fallback on failure, dynamic choice validation, full comment coverage, insufficient evidence handling and JSON failures. The parent project also runs migrations/RLS/RPC behavior against PGlite PostgreSQL with minimal stand-ins for Supabase platform schemas.

Before inviting the group, test a real Supabase staging project with two learner accounts plus the admin: pending/blocked denial; cross-user history denial; private bucket object read denial; Google redirect; atomic current-version grading; one Gemini or DeepSeek check; source crops; API quota errors; and persistence across devices. Live Supabase/Google/provider deployment cannot be validated without the owner's project configuration. PGlite does not simulate Supabase Storage HTTP behavior, OAuth redirects or the hosted Deno platform.

Official references checked for this implementation: [Supabase function auth](https://supabase.com/docs/guides/functions/auth), [secrets](https://supabase.com/docs/guides/functions/secrets), [Gemini generateContent](https://ai.google.dev/api/generate-content), [DeepSeek JSON output](https://api-docs.deepseek.com/guides/json_mode/), [DeepSeek vision](https://api-docs.deepseek.com/guides/vision/).

## Additional configuration notes

`ALLOWED_ORIGINS` accepts a comma-separated list of exact origins, e.g. `https://your-name.github.io,http://localhost:5178`; `APP_ORIGIN` remains a supported single-origin alias. This restricts browser callers; JWT validation and admin authorization still enforce access on every request. If using current publishable keys, the function reads `SUPABASE_PUBLISHABLE_KEYS` JSON object's `default` when the legacy anon key is absent.

The comparison pass also receives the canonical draft's existing `correctIds` and `explanation`, so imported content with no comment screenshots is checked too. These fields never enter the independent solving pass. The returned optional `draftAssessment` evaluates answer and explanation separately. Explicit answer-ID mismatches are marked `suspect` deterministically even if a model says `agree`; this highlights disagreement, not proof the original answer is wrong.
