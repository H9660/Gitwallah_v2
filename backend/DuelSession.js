import crypto from 'crypto';
import factory from './utilities/SandboxFactory.js';  // singleton instance

// ── States ──────────────────────────────────────────────
const STATES = Object.freeze({
  WAITING: 'waiting',   // Room created, waiting for challenger
  READY: 'ready',     // Challenger joined, waiting for host to accept
  PLAYING: 'playing',   // Both players have terminals, game in progress
  FINISHED: 'finished',  // Winner determined or room expired
});

// ── Valid transitions ───────────────────────────────────
const VALID_TRANSITIONS = Object.freeze({
  [STATES.WAITING]: [STATES.READY, STATES.FINISHED],
  [STATES.READY]: [STATES.PLAYING, STATES.FINISHED],
  [STATES.PLAYING]: [STATES.PLAYING, STATES.FINISHED],  // PLAYING → PLAYING: judge attempt fails
  [STATES.FINISHED]: [],                                   // terminal state
});

/**
 * DuelSession — State Pattern for duel room lifecycle.
 *
 * Models a duel room as a Finite State Machine with four states:
 *   WAITING → READY → PLAYING → FINISHED
 *
 * Every action is a *guarded transition* — the method checks the current
 * state before allowing the transition. Illegal transitions return an
 * error result instead of corrupting runtime state.
 *
 * Design Pattern: State
 * - Instead of scattering `if (room.state !== 'playing')` checks across
 *   API handlers, each transition is encapsulated as a method with
 *   pre-condition validation.
 * - The session object is the single source of truth for duel state.
 */
class DuelSession {
  /**
   * @param {string} roomId
   * @param {object} challenge - The challenge object for this duel
   * @param {string} hostName - Display name of the host player
   */
  constructor(roomId, challenge, hostName) {
    this.id = roomId;
    this.state = STATES.WAITING;
    this.challenge = challenge;
    this.winner = null;
    this.createdAt = Date.now();

    // Player slots
    this.host = {
      ws: null,
      sandbox: null,       // Sandbox object from SandboxFactory
      name: hostName || 'Player 1',
    };
    this.challenger = {
      ws: null,
      sandbox: null,
      name: null,
    };

    this._factory = factory;
  }

  // ══════════════════════════════════════════════════════════
  // ── STATE QUERIES ──────────────────────────────────────
  // ══════════════════════════════════════════════════════════

  get isWaiting() { return this.state === STATES.WAITING; }
  get isReady() { return this.state === STATES.READY; }
  get isPlaying() { return this.state === STATES.PLAYING; }
  get isFinished() { return this.state === STATES.FINISHED; }

  /**
   * Get a player's sandbox by role.
   */
  getPlayerSandbox(role) {
    return this[role]?.sandbox || null;
  }

  /**
   * Get serializable room info (safe for API responses).
   */
  getInfo() {
    return {
      roomId: this.id,
      state: this.state,
      difficulty: this.challenge.difficulty,
      hostName: this.host.name,
      challengerName: this.challenger.name,
    };
  }

  /**
   * Get challenge data safe for sending to players.
   */
  getChallengeData() {
    return {
      id: this.challenge.id,
      title: this.challenge.title,
      difficulty: this.challenge.difficulty,
      description: this.challenge.description,
      hints: this.challenge.hints,
      isAIGenerated: this.challenge.isAIGenerated,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── GUARDED TRANSITIONS ────────────────────────────────
  // ══════════════════════════════════════════════════════════

  /**
   * Transition: WAITING → READY
   * Challenger joins the room.
   *
   * @param {WebSocket} ws - Challenger's WebSocket
   * @param {string} playerName - Challenger's display name
   * @returns {{ ok: boolean, error?: string }}
   */
  challengerJoin(ws, playerName) {
    if (!this._canTransition(STATES.READY)) {
      return { ok: false, error: `Cannot join: room is in '${this.state}' state` };
    }

    this.challenger.ws = ws;
    this.challenger.name = playerName || 'Player 2';
    this.state = STATES.READY;

    console.log(`  ⚔️  DuelSession ${this.id}: Challenger "${this.challenger.name}" joined → READY`);
    return { ok: true };
  }

  /**
   * Set the host's WebSocket (called when host connects via WS).
   * This is NOT a state transition — just binding the connection.
   */
  setHostWs(ws, playerName) {
    this.host.ws = ws;
    if (playerName) this.host.name = playerName;
  }

  /**
   * Transition: READY → PLAYING
   * Host accepts the duel. Creates sandboxes for both players.
   *
   * @returns {{ ok: boolean, error?: string }}
   */
  accept() {
    if (!this._canTransition(STATES.PLAYING)) {
      return { ok: false, error: `Cannot accept: room is in '${this.state}' state` };
    }

    // Create sandboxes for both players via the factory
    for (const role of ['host', 'challenger']) {
      try {
        this[role].sandbox = this._factory.createDuelSandbox(this.challenge);
      } catch (e) {
        console.error(`  ❌ DuelSession ${this.id}: Sandbox creation failed for ${role}: ${e.message}`);
        return { ok: false, error: `Sandbox creation failed for ${role}` };
      }
    }

    this.state = STATES.PLAYING;
    console.log(`  🚀 DuelSession ${this.id}: Accepted → PLAYING`);
    return { ok: true };
  }

  /**
   * Transition: PLAYING → FINISHED (on success) or PLAYING → PLAYING (on failure)
   * A player submits their solution for judging.
   *
   * @param {string} role - 'host' or 'challenger'
   * @param {object} judgeResult - { passed, score, feedback, details }
   * @returns {{ ok: boolean, won: boolean, error?: string }}
   */
  submitJudgement(role, judgeResult) {
    if (this.state !== STATES.PLAYING) {
      return { ok: false, won: false, error: `Cannot judge: room is in '${this.state}' state` };
    }

    const passed = judgeResult.passed && judgeResult.score >= 70;

    if (passed) {
      // Transition to FINISHED — this player wins
      this.state = STATES.FINISHED;
      this.winner = role;

      // Kill the opponent's pty (they're done)
      const opponentRole = role === 'host' ? 'challenger' : 'host';
      if (this[opponentRole].sandbox && this[opponentRole].sandbox.ptyProcess) {
        try { this[opponentRole].sandbox.ptyProcess.kill(); } catch (_) { }
        this[opponentRole].sandbox.ptyProcess = null;
      }

      console.log(`  🏆 DuelSession ${this.id}: ${this[role].name} (${role}) wins! → FINISHED`);
      return { ok: true, won: true };
    }

    // Judge failed — stay in PLAYING
    console.log(`  ❌ DuelSession ${this.id}: ${this[role].name} (${role}) judge attempt failed (score=${judgeResult.score})`);
    return { ok: true, won: false };
  }

  /**
   * Transition: any → FINISHED
   * A player disconnected during active play.
   *
   * @param {string} disconnectedRole - 'host' or 'challenger'
   * @returns {{ ok: boolean, opponentRole?: string }}
   */
  playerDisconnected(disconnectedRole) {
    if (this.isFinished) {
      return { ok: false };
    }

    if (this.state === STATES.WAITING) {
      // No one to notify — just clean up
      this.state = STATES.FINISHED;
      console.log(`  🔌 DuelSession ${this.id}: ${disconnectedRole} disconnected in WAITING → FINISHED`);
      return { ok: true };
    }

    const opponentRole = disconnectedRole === 'host' ? 'challenger' : 'host';
    this.state = STATES.FINISHED;
    this.winner = opponentRole;

    console.log(`  🔌 DuelSession ${this.id}: ${disconnectedRole} disconnected → ${opponentRole} wins by default → FINISHED`);
    return { ok: true, opponentRole };
  }

  // ══════════════════════════════════════════════════════════
  // ── CLEANUP ────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════

  /**
   * Destroy all sandboxes and release resources.
   */
  cleanup() {
    this._factory.destroySandbox(this.host.sandbox);
    this.host.sandbox = null;

    this._factory.destroySandbox(this.challenger.sandbox);
    this.challenger.sandbox = null;

    console.log(`  🗑️  DuelSession ${this.id}: Cleaned up`);
  }

  // ══════════════════════════════════════════════════════════
  // ── PRIVATE ────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════

  /**
   * Check if a transition to the target state is valid from the current state.
   * @private
   */
  _canTransition(targetState) {
    const allowed = VALID_TRANSITIONS[this.state];
    return allowed && allowed.includes(targetState);
  }

  // ── Static helpers ─────────────────────────────────────

  static generateRoomId() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  static get STATES() {
    return STATES;
  }
}

export default DuelSession;
