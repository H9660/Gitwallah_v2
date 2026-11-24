---
id: F1
kind: feature
github_issue: "#<fill after opening>"
title: "Filter the contest challenge picker by difficulty"
---

When I create a contest from static challenges, the picker calls `GET /api/contests/challenges` and gets all 15 challenges. I only want Beginner ones for my class.

Could the endpoint accept `?difficulty=Beginner` (or `Intermediate` / `Advanced`) and return only challenges of that difficulty? Without the parameter it should keep returning everything, as now.

If someone passes a difficulty that does not exist (e.g. `?difficulty=Expert`), please answer with HTTP 400 and an `error` message instead of an empty list, so the UI can show what went wrong.
