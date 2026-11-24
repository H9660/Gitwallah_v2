# workflow/ - copy of the fork's workflow and agent code

Copied from the fork at the commit named in the top-level README. The fork is the source of truth; this copy exists so the submission is self-contained.

| Here | In the fork |
|---|---|
| `github/workflows/autose.yml` | `.github/workflows/autose.yml` - the GitCore pipeline (11 jobs) |
| `github/workflows/ci.yml` | `.github/workflows/ci.yml` - CI (backend build + tests, harness tests); also called by autose.yml |
| `github/actions/gitcore-setup/` | `.github/actions/gitcore-setup/` - shared setup step |
| `autose/gitcore/` | `.autose/gitcore/` - agent code (see `autose/README.md`) |
| `autose/prompts/` | `.autose/prompts/` - one prompt per agent + shared guard |
| `autose/tests/` | `.autose/tests/` - harness tests and the scripted B1 run |

The folders are named `github/` and `autose/` (without the dot) so they are visible and do not act as a live workflow in the submission repo.

Re-sync after changing the fork:

```bash
rm -rf workflow/github workflow/autose
cp -r <fork>/.github workflow/github && cp -r <fork>/.autose workflow/autose
```
