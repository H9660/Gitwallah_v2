---
id: B2
kind: bug
github_issue: "#<fill after opening>"
title: "Judge gives 0 points with 'generateChallengeWithLocalModel is not defined' when OpenRouter is down"
---

When OpenRouter rate-limits us (429) or the key is missing, every solution is judged as failed with score 0. The feedback shown to the player is:

```
generateChallengeWithLocalModel is not defined
```

The server log says `Gemini API is not working ... Falling back to local model...`, so the fallback is supposed to kick in, but it crashes instead. Challenge *generation* falls back to the local model fine; only *judging* is broken.

Expected: when the hosted model fails, `judgeRepo` should use the local model's verdict, the same way challenge generation does. If the local model also fails, the current safe answer (not passed, score 0) is fine.
