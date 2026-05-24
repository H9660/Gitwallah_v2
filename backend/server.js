import express from 'express';
import os from 'os';
import cors from 'cors';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import userRoutes from './routes/userRoutes.js';
import challengeRoutes from './routes/challengeRoutes.js';
import connectDB from './utilities/dbUtil.js';
import * as docker from './docker-helpers.js';
import DuelSession from './DuelSession.js';
import { getOrGenerateChallenge } from './utilities/challengeUtils.js';
import { judgeRepo } from './utilities/gitUtils.js';
import contestRoutes from './routes/contestRoutes.js';

const JWT_SECRET = process.env.JWT_SECRET || 'GitWallah-secret-change-in-production';
console.log("JWT_SECRET is ", JWT_SECRET)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Detect LAN IP ─────────────────────────────────────
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIp();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Allow cross-origin requests — needed when challenger joins from another machine
// and their browser calls http://<hostLanIp>:3000/api directly (not via Vite proxy)
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


let soloSandbox = null;     // Sandbox object from SandboxFactory
let currentChallenge = null; // Current solo challenge object
const sessions = new Map(); // roomId -> DuelSession

// ── Solo state management via app.locals ────────────────
// Controllers access solo state through these helpers instead
// of needing direct access to wss or module-level variables.
app.locals.getSoloState = () => ({
  currentChallenge,
  soloSandbox,
  challengeDir: soloSandbox?.challengeDir || null,
  terminalHistory: soloSandbox?.terminalHistory || '',
});

app.locals.setSoloState = (sandbox, challenge) => {
  soloSandbox = sandbox;
  currentChallenge = challenge;
};

app.locals.broadcastToSolo = (msg) => {
  const payload = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    // console.log('Checking client for solo broadcast:', {
    //   readyState: client.readyState,
    //   isDuel: !!client._duelRoom,
    //   isContest: !!client._contestMode,
    // });

    // console.log('  → Broadcast to solo clients:', WebSocket.OPEN, !client._duelRoom, !client._contestMode);
    if (client.readyState === WebSocket.OPEN && !client._duelRoom && !client._contestMode) {
      client.send(payload);
    }
  });
};

// ── Per-user contest sandbox management ─────────────────
// Map key: "userId:contestId" → { sandbox, challenge }
const contestUserSandboxes = new Map();

function getContestSandboxKey(userId, contestId) {
  return `${userId}:${contestId}`;
}

app.locals.setContestSandbox = (userId, contestId, sandbox, challenge) => {
  const key = getContestSandboxKey(userId, contestId);
  contestUserSandboxes.set(key, { sandbox, challenge });
};

app.locals.getContestSandbox = (userId, contestId) => {
  const key = getContestSandboxKey(userId, contestId);
  return contestUserSandboxes.get(key) || null;
};

// Send a message to a specific user's WS connections in a specific contest
app.locals.broadcastToContestUser = (userId, contestId, msg) => {
  const payload = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      client._contestMode &&
      client._userId === userId &&
      client._contestId === contestId
    ) {
      client.send(payload);
    }
  });
};

// Broadcast to ALL users in a specific contest
app.locals.broadcastToContest = (contestId, msg) => {
  const payload = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      client._contestMode &&
      client._contestId === contestId
    ) {
      client.send(payload);
    }
  });
};

function cleanupSession(roomId) {
  const session = sessions.get(roomId);
  if (!session) return;
  session.cleanup();
  sessions.delete(roomId);
}

function wsSend(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ══════════════════════════════════════════════════════════
// ── SOLO API ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

app.use("/api/auth/", userRoutes);
app.use('/api/challenge', challengeRoutes);
app.use('/api/contests', contestRoutes);

// Returns the server's LAN IP so the frontend can build cross-device share links
app.get('/api/server-info', (req, res) => {
  res.json({ ip: LOCAL_IP, port: PORT });
});

// Returns the server's LAN IP so the frontend can build cross-device share links
app.get('/api/server-info', (req, res) => {
  res.json({ ip: LOCAL_IP, port: PORT });
});

// app.post('/api/resize', (req, res) => {
//   const { cols, rows } = req.body;
//   if (soloSandbox && soloSandbox.ptyProcess && cols && rows) {
//     try { soloSandbox.ptyProcess.resize(cols, rows); } catch (_) { }
//   }
//   res.json({ ok: true });
// });

// ══════════════════════════════════════════════════════════
// ── DUEL API (uses DuelSession State Pattern) ────────────
// ══════════════════════════════════════════════════════════

// Create a duel room
app.post('/api/duel/create', async (req, res) => {
  const { difficulty, playerName, model: modelName } = req.body;
  const roomId = DuelSession.generateRoomId();

  const result = await getOrGenerateChallenge(difficulty, modelName || 'gemini-2.0-flash');
  if (!result) return res.status(500).json({ error: 'Failed to generate challenge' });

  const session = new DuelSession(roomId, result.challenge, playerName);
  sessions.set(roomId, session);

  console.log(`  ⚔️  Duel room ${roomId} created [${result.challenge.difficulty}] "${result.challenge.title}"`);
  res.json({
    roomId,
    difficulty: result.challenge.difficulty,
    challengeTitle: result.challenge.title,
  });
});

// Get room info (for join page)
app.get('/api/duel/:roomId', (req, res) => {
  const session = sessions.get(req.params.roomId);
  if (!session) return res.status(404).json({ error: 'Room not found' });
  res.json(session.getInfo());
});
// http://localhost:5173/api/challenge?difficulty=&model=gemini-3.1-pro-p
// Challenger accepts — starts the game for both
app.post('/api/duel/:roomId/accept', (req, res) => {
  const session = sessions.get(req.params.roomId);
  if (!session) return res.status(404).json({ error: 'Room not found' });

  // ── Guarded transition: READY → PLAYING ──
  const result = session.accept();
  if (!result.ok) return res.status(400).json({ error: result.error });

  // Wire pty output for both players
  for (const role of ['host', 'challenger']) {
    const player = session[role];
    const sandbox = player.sandbox;
    const playerRef = player;

    sandbox.ptyProcess.onData((data) => {
      sandbox.terminalHistory += data;
      if (sandbox.terminalHistory.length > 50000) {
        sandbox.terminalHistory = sandbox.terminalHistory.slice(-40000);
      }
      wsSend(playerRef.ws, { type: 'output', data });
    });
  }

  // Notify both players: game starts
  const challengeData = { type: 'duel-start', challenge: session.getChallengeData() };
  wsSend(session.host.ws, challengeData);
  wsSend(session.challenger.ws, challengeData);

  res.json({ ok: true });
});

// Judge a player's solution in a duel
app.post('/api/duel/:roomId/judge', async (req, res) => {
  const session = sessions.get(req.params.roomId);
  if (!session) return res.status(404).json({ error: 'Room not found' });

  if (!session.isPlaying) {
    return res.status(400).json({ error: 'Duel not in playing state' });
  }

  const { role } = req.body;
  const sandbox = session.getPlayerSandbox(role);
  if (!sandbox || !sandbox.challengeDir) {
    return res.status(400).json({ error: 'Invalid player' });
  }

  // Notify opponent that this player is being judged
  const opponentRole = role === 'host' ? 'challenger' : 'host';
  wsSend(session[opponentRole].ws, { type: 'opponent-judging' });

  try {
    const modelName = req.body.model || 'gemini-2.0-flash';
    const judgeResult = await judgeRepo(session.challenge, sandbox.challengeDir, sandbox.terminalHistory, modelName);

    // ── Guarded transition: PLAYING → FINISHED or PLAYING → PLAYING ──
    const transition = session.submitJudgement(role, judgeResult);

    if (transition.won) {
      // Notify winner
      wsSend(session[role].ws, {
        type: 'duel-result',
        won: true,
        result: judgeResult,
      });

      // Notify loser
      wsSend(session[opponentRole].ws, {
        type: 'duel-result',
        won: false,
        winnerName: session[role].name,
        result: { score: judgeResult.score, feedback: `${session[role].name} solved the challenge first!` },
      });

      // Cleanup after 30 seconds
      setTimeout(() => cleanupSession(session.id), 30000);
    } else {
      // Player didn't pass — notify opponent
      wsSend(session[opponentRole].ws, { type: 'opponent-judge-failed' });
    }

    res.json(judgeResult);
  } catch (e) {
    console.error('Duel judge error:', e.message);
    res.status(500).json({ error: `LLM error: ${e.message}` });
  }
});

// ══════════════════════════════════════════════════════════
// ── WEBSOCKET HANDLER ────────────────────────────────────
// ══════════════════════════════════════════════════════════
wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (_) {
      // Raw input for solo mode
      if (soloSandbox && soloSandbox.ptyProcess && !ws._duelRoom) {
        soloSandbox.ptyProcess.write(msg.toString());
      }
      return;
    }

    // ── Duel join ──
    if (data.type === 'duel-join') {
      const session = sessions.get(data.roomId);
      if (!session) {
        wsSend(ws, { type: 'error', error: 'Room not found' });
        return;
      }

      ws._duelRoom = data.roomId;
      ws._duelRole = data.role;

      if (data.role === 'host') {
        session.setHostWs(ws, data.playerName);
      } else if (data.role === 'challenger') {
        // ── Guarded transition: WAITING → READY ──
        const result = session.challengerJoin(ws, data.playerName);
        if (!result.ok) {
          wsSend(ws, { type: 'error', error: result.error });
          return;
        }

        // Notify host that challenger joined
        wsSend(session.host.ws, {
          type: 'opponent-joined',
          opponentName: session.challenger.name,
        });

        // Confirm to challenger
        wsSend(ws, {
          type: 'joined-room',
          roomId: session.id,
          hostName: session.host.name,
          difficulty: session.challenge.difficulty,
        });
      }
      return;
    }

    // ── Contest init — per-user WS authentication ──
    if (data.type === 'contest-init') {
      const { contestId, token } = data;
      if (!contestId || !token) {
        console.log("we are outt here")
        wsSend(ws, { type: 'error', error: 'Missing contestId or token' });
        return;
      }

      try {
        console.log('Contest WS init:', { contestId, hasToken: token});
        const decoded = jwt.verify(token, JWT_SECRET);
        ws._contestMode = true;
        ws._contestId = contestId;
        ws._userId = decoded.userId;
        
        // Send any existing terminal history
        const entry = contestUserSandboxes.get(getContestSandboxKey(decoded.userId, contestId));
        console.log("Entries are ", entry)
        if (entry && entry.sandbox && entry.sandbox.terminalHistory) {
          wsSend(ws, { type: 'output', data: entry.sandbox.terminalHistory });
        }
        
        wsSend(ws, { type: 'contest-connected', contestId });
      } catch (err) {
        console.log("Contest WS init error:", err);
        console.log('Contest WS init:', { contestId, hasToken: !!token });
        wsSend(ws, { type: 'error', error: 'Invalid token' });
      }
      return;
    }

    // ── Terminal input ──
    if (data.type === 'input') {
      if (ws._duelRoom) {
        const session = sessions.get(ws._duelRoom);
        if (session && session.isPlaying) {
          const sandbox = session.getPlayerSandbox(ws._duelRole);
          if (sandbox && sandbox.ptyProcess) {
            sandbox.ptyProcess.write(data.data);
          }
        }
      } else if (ws._contestMode) {
        // Per-user contest sandbox routing
        const entry = contestUserSandboxes.get(getContestSandboxKey(ws._userId, ws._contestId));
        if (entry && entry.sandbox && entry.sandbox.ptyProcess) {
          entry.sandbox.ptyProcess.write(data.data);
        }
      } else {
        if (soloSandbox && soloSandbox.ptyProcess) soloSandbox.ptyProcess.write(data.data);
      }
      return;
    }

    // ── Resize ──
    if (data.type === 'resize') {
      if (ws._duelRoom) {
        const session = sessions.get(ws._duelRoom);
        if (session) {
          const sandbox = session.getPlayerSandbox(ws._duelRole);
          if (sandbox && sandbox.ptyProcess) {
            try { sandbox.ptyProcess.resize(data.cols, data.rows); } catch (_) { }
          }
        }
      } else if (ws._contestMode) {
        // Per-user contest sandbox resize
        const entry = contestUserSandboxes.get(getContestSandboxKey(ws._userId, ws._contestId));
        if (entry && entry.sandbox && entry.sandbox.ptyProcess) {
          try { entry.sandbox.ptyProcess.resize(data.cols, data.rows); } catch (_) { }
        }
      } else {
        if (soloSandbox && soloSandbox.ptyProcess) {
          try { soloSandbox.ptyProcess.resize(data.cols, data.rows); } catch (_) { }
        }
      }
      return;
    }
  });

  ws.on('close', () => {
    if (ws._duelRoom) {
      const session = sessions.get(ws._duelRoom);
      if (!session) return;

      // ── Guarded transition: any → FINISHED ──
      const result = session.playerDisconnected(ws._duelRole);
      if (result.ok && result.opponentRole) {
        wsSend(session[result.opponentRole].ws, {
          type: 'opponent-disconnected',
          message: `${session[ws._duelRole].name || 'Your opponent'} disconnected`,
        });

        wsSend(session[result.opponentRole].ws, {
          type: 'duel-result',
          won: true,
          result: { score: 100, feedback: 'Your opponent disconnected. You win by default!' },
        });

        setTimeout(() => cleanupSession(session.id), 10000);
      } else if (session.isFinished) {
        // Host disconnected in WAITING — just clean up
        cleanupSession(session.id);
      }
    }
    // } else {
    //   // Solo mode: clean up container when the last solo client disconnects
    //   const soloClients = [...wss.clients].filter(
    //     c => c !== ws && c.readyState === WebSocket.OPEN && !c._duelRoom
    //   );
    //   if (soloClients.length === 0) {
    //     console.log('  🔌 Solo client disconnected — cleaning up container');
    //     cleanupSoloChallenge();
    //     currentChallenge = null;
    //   }
    // }
  });
});

// ── Cleanup stale rooms every 10 minutes ───────────────
setInterval(() => {
  const now = Date.now();
  for (const [roomId, session] of sessions) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      console.log(`  ⏰ Room ${roomId} expired`);
      cleanupSession(roomId);
    }
  }
}, 10 * 60 * 1000);

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  docker.buildSandboxImage(path.join(__dirname, 'Dockerfile.sandbox'));
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  🎮 Git Skills Tester running at http://localhost:${PORT}`);
    console.log(`  🌐 LAN URL: http://${LOCAL_IP}:${PORT}  ← share this for duel links`);
    console.log(`  🤖 AI challenges: ENABLED (Using local deepseek-coder)`);
    console.log(`  ⚔️  Duel mode: ENABLED\n`);
    console.log(`  🐳 Docker sandbox: ${docker.isDockerAvailable() ? 'ENABLED' : 'DISABLED (UNSAFE!)'}`);
  });
}).catch((err) => {
  console.log("The following error occured while connecting withe the database.")
});
