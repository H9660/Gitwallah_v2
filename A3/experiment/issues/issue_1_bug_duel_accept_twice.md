---
id: B1
kind: bug
github_issue: "#<fill after opening>"
title: "Duel: clicking Accept twice resets both terminals and leaks containers"
---

**Describe the bug**
In duel mode, if the host clicks **Accept** again (I double-clicked, and it also happens when the accept request is retried after a slow network), both players' terminals go blank and everything we typed is gone. `docker ps` shows the old `gitwallah-*` containers still running next to the new ones, so every double click leaks two containers.

**To reproduce**
1. Create a duel room, let a second player join.
2. Click Accept. The game starts.
3. Send `POST /api/duel/<roomId>/accept` again (or double-click Accept).
4. Both terminals reset; `docker ps` shows 4 containers instead of 2.

**Expected**
Accepting a duel that is already running should be refused (like accepting before anyone joined is refused) and should not touch the running sandboxes.

GitWallah backend at commit `<pinned hash>`.
