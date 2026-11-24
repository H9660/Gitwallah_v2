---
id: F2
kind: feature
github_issue: "#<fill after opening>"
title: "Show when a duel room expires"
---

Duel rooms are deleted 30 minutes after they are created, but the join page has no way to know that. My friend opened a link after 35 minutes and only got "Room not found".

Please add an `expiresAt` field to the room info returned by `GET /api/duel/:roomId`: the time the room expires (creation time + 30 minutes) as an ISO 8601 string, e.g. `"2026-11-20T10:30:00.000Z"`. Then the frontend can show a countdown.

The 30 minutes should stay in one place so the cleanup timer and this field can't drift apart.
