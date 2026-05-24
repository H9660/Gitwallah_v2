import fs from 'fs';
import crypto from 'crypto';

// ── Duel room store ─────────────────────────────────────
export const rooms = new Map(); // roomId -> Room object

// Room structure:
// {
//   id: string,
//   state: 'waiting' | 'ready' | 'playing' | 'finished',
//   challenge: object,
//   host: { ws, ptyProcess, challengeDir, terminalHistory, name },
//   challenger: { ws, ptyProcess, challengeDir, terminalHistory, name },
//   winner: null | 'host' | 'challenger',
//   createdAt: Date
// }

/**
 * Generate a random 6-character room ID.
 */
export function generateRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/**
 * Clean up a single player's resources (PTY + temp dir).
 */
export function cleanupPlayer(player) {
  if (!player) return;
  if (player.ptyProcess) {
    try { player.ptyProcess.kill(); } catch (_) { }
    player.ptyProcess = null;
  }
  if (player.challengeDir && fs.existsSync(player.challengeDir)) {
    try { fs.rmSync(player.challengeDir, { recursive: true, force: true }); } catch (_) { }
  }
}

/**
 * Clean up an entire room (both players + remove from map).
 */
export function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  cleanupPlayer(room.host);
  cleanupPlayer(room.challenger);
  rooms.delete(roomId);
  console.log(`  🗑️  Room ${roomId} cleaned up`);
}

/**
 * Clean up solo challenge resources.
 * @param {object} soloState - { ptyProcess, challengeDir, terminalHistory }
 * @returns {object} - reset state values
 */
export function cleanupSoloChallenge(soloState) {
  if (soloState.ptyProcess) {
    try { soloState.ptyProcess.kill(); } catch (_) { }
  }
  if (soloState.challengeDir && fs.existsSync(soloState.challengeDir)) {
    try { fs.rmSync(soloState.challengeDir, { recursive: true, force: true }); } catch (_) { }
  }
  return { ptyProcess: null, challengeDir: null, terminalHistory: '' };
}
