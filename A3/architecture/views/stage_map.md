# Stage map — agent, artifact and check per stage

System name: **GitCore**, a LangGraph state machine (deterministic routing) that calls LLM workers through one brain adapter, spread over separate GitHub Actions jobs with different permissions.

| # | Stage | Who does the work | Actions job (token permissions) | Artifact | Check before hand-over (who decides) | On failure |
|---|---|---|---|---|---|---|
| 0 | Gate | Code only | `gate` (issues: write, contents: read) | `gate.json` | Sender is OWNER/MEMBER/COLLABORATOR; the trigger is the `autose` label or a `/autose` comment; no other run for this issue (concurrency group) | Comment "not authorised", stop |
| 1 | Requirements | **Spec agent** (LLM, prompt = A1 skill condensed) | `build` (contents: read) | `spec.md` + `spec.json` | Code: at least 1 AC; every AC has Given/When/Then, an exact expected value and a "verify by" target; no ambiguity-lexicon words; no `PENDING`; `testable == true`; `safety_flag == false` | `needs-clarification`: post the open questions on the issue, add the label `autose:needs-info`, stop |
| 2 | Design | **Design agent** (LLM + read-only repo tools, reads `ARCHITECTURE.md`) | `build` | `design.md` + `design.json` | Code: every listed file exists (or is marked `new`), every listed function is found in its file by grep (or marked `new`), every AC maps to at least one change and one test file, and paths stay inside `backend/` | Retry once with the check errors as feedback, then stop |
| 3 | Implementation | **Implementer agent** (LLM + read/write tools; writes only to files in the design) | `build` | `diff.patch` | Code: `npm run build` exits 0; diff not empty; touched files ⊆ design files ∪ `backend/tests/` | Retry within budget (max 3 attempts), then back to Design once, then stop |
| 4 | Testing | **Test agent** (LLM, writes one test per AC; has not seen the implementer's conversation) | `build` | `test_report.md` + `junit.json` | Code: `npm test` exits 0 (old + new); each AC id appears in at least one passing test name; no existing test deleted or skipped | Failure in implementation → back to 3 (counts toward the attempt budget). Failure in the test itself → test agent fixes it once. Budget used up → stop |
| 5 | Release | Code only (no LLM) | `release` (contents: write, pull-requests: write) → `ci` (reusable `ci.yml`, contents: read) | `pr.md` + PR link | Code: PR open (`gh pr view`), CI job conclusion = success | Comment on the issue with the reason, stop |
| 6 | Review | **Reviewer agent** (different model, own prompt, read + run only) | `review` (contents: read, pull-requests: write, used only by the posting step) | `review.md` + `review.json` | Code: verdict parsed; `approve` → done; `request_changes` and round < 2 → `fix` job re-enters at Design (`approach` issues) or Implementation (`code` issues); round = 2 → done | A missing or unparsable verdict counts as `request_changes` with reason "reviewer failed" |
| — | Human | Maintainer | — | — | Merge or close. **The workflow never merges.** | — |

Back-edges, and who owns them. All are decided by code in `graph.py` routers, never by an LLM's self-report:

- 4 → 3: tests fail and the failure is not in a new test file (attempt budget = 3).
- 3/4 → 2: implementation budget used up once → redesign with the failure log (max 1 redesign).
- 6 → 2 or 6 → 3: reviewer verdict `request_changes`, routed by the reviewer's `category` field (`approach` → 2, `code`/`tests` → 3). Max 2 review rounds.
