/**
 * SandboxFactory — Factory Pattern for container lifecycle management.
 *
 * Encapsulates the creation of fully-initialized sandbox environments
 * for different game modes. Each factory method returns a Sandbox object
 * with a consistent interface, hiding the complexity of Docker container
 * setup, pty spawning, and challenge initialization.
 *
 * Design Pattern: Factory
 * - Clients call `createSoloSandbox()` or `createDuelSandbox()` without
 *   knowing the internal orchestration steps.
 * - Each method returns the same Sandbox shape, but with mode-specific
 *   wiring (e.g., solo broadcasts to all WS clients, duel sends to one).
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import pty from 'node-pty';
import { execSync } from 'child_process';
import * as docker from '../docker-helpers.js';

// ── Sandbox object shape ─────────────────────────────────
// {
//   containerId: string | null,
//   ptyProcess:  object | null,
//   challengeDir: string | null,
//   terminalHistory: string,
// }

class SandboxFactory {
  // ══════════════════════════════════════════════════════════
  // ── PUBLIC FACTORY METHODS ─────────────────────────────
  // ══════════════════════════════════════════════════════════

  /**
   * Create a fully-initialized sandbox for solo mode.
   * Orchestration steps:
   *   1. Create temp directory
   *   2. Setup challenge files (AI commands or static setup fn)
   *   3. Create Docker container (or null if Docker unavailable)
   *   4. Spawn pty (inside container or local fallback)
   *
   * @param {object} challenge - The challenge object with setupCommands or setup()
   * @returns {object} Sandbox instance
   */
  createSoloSandbox(challenge) {
    /**
     * return {
      containerId: null,
      ptyProcess: null,
      challengeDir,
      terminalHistory: '',
    };
     */
    const sandbox = this._createBase();

    this._setupChallenge(sandbox, challenge);

    sandbox.containerId = docker.createContainer(sandbox.challengeDir);
    sandbox.ptyProcess = this._spawnPty(sandbox.challengeDir, sandbox.containerId);
    console.log(`  🏭 SandboxFactory: Solo sandbox created [container=${sandbox.containerId ? sandbox.containerId.slice(0, 12) : 'local'}]`);
    return sandbox;
  }

  /**
   * Create a fully-initialized sandbox for one duel player.
   * Same lifecycle as solo, but returned without output wiring —
   * the caller (DuelSession) handles wiring pty output to the
   * specific player's WebSocket.
   *
   * @param {object} challenge - The challenge object
   * @returns {object} Sandbox instance
   */
  createDuelSandbox(challenge) {
    const sandbox = this._createBase();

    this._setupChallenge(sandbox, challenge);

    sandbox.containerId = docker.createContainer(sandbox.challengeDir);
    sandbox.ptyProcess = this._spawnPty(sandbox.challengeDir, sandbox.containerId);

    console.log(`  🏭 SandboxFactory: Duel sandbox created [container=${sandbox.containerId ? sandbox.containerId.slice(0, 12) : 'local'}]`);
    return sandbox;
  }

  /**
   * Destroy a sandbox: kill pty → destroy container → remove temp dir.
   * Safe to call with null/partial sandbox fields.
   *
   * @param {object} sandbox - Sandbox instance to destroy
   */
  destroySandbox(sandbox) {
    if (!sandbox) return;

    // 1. Kill pty process
    if (sandbox.ptyProcess) {
      try { sandbox.ptyProcess.kill(); } catch (_) { }
      sandbox.ptyProcess = null;
    }

    // 2. Destroy Docker container
    if (sandbox.containerId) {
      docker.destroyContainer(sandbox.containerId);
      sandbox.containerId = null;
    }

    // 3. Remove temp directory
    if (sandbox.challengeDir && fs.existsSync(sandbox.challengeDir)) {
      try { fs.rmSync(sandbox.challengeDir, { recursive: true, force: true }); } catch (_) { }
    }
    sandbox.challengeDir = null;
    sandbox.terminalHistory = '';
  }

  // ══════════════════════════════════════════════════════════
  // ── PRIVATE HELPERS ────────────────────────────────────
  // ══════════════════════════════════════════════════════════

  /**
   * Create the base sandbox object with a fresh temp directory.
   * This is the shared first step for all factory methods.
   * @private
   */
  _createBase() {
    const base = path.join(os.tmpdir(), 'git-challenges');
    fs.mkdirSync(base, { recursive: true });
    const challengeDir = fs.mkdtempSync(path.join(base, 'ch-'));

    return {
      containerId: null,
      ptyProcess: null,
      challengeDir,
      terminalHistory: '',
    };
  }

  /**
   * Run challenge setup commands in the sandbox directory.
   * Supports two modes:
   *   - AI-generated challenges: array of shell commands (setupCommands)
   *   - Static challenges: a setup(dir) function
   * @private
   */
  _setupChallenge(sandbox, challenge) {
    if (challenge.setupCommands) {
      this._executeSetupCommands(sandbox.challengeDir, challenge.setupCommands, sandbox.containerId);
    } else if (challenge.setup) {
      challenge.setup(sandbox.challengeDir);
    }
  }

  /**
   * Execute an array of shell commands in a directory or container.
   * @private
   */
  _executeSetupCommands(dir, commands, containerId = null) {
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Git Player',
      GIT_AUTHOR_EMAIL: 'player@gitdojo.dev',
      GIT_COMMITTER_NAME: 'Git Player',
      GIT_COMMITTER_EMAIL: 'player@gitdojo.dev',
    };

    for (let cmd of commands) {
      try {
        if (containerId) {
          docker.execInContainer(containerId, cmd);
        } else {
          if (os.platform() === 'win32') {
            cmd = cmd.replace(/'([^']*)'/g, '"$1"');
          }
          execSync(cmd, { cwd: dir, encoding: 'utf-8', timeout: 10000, env: gitEnv });
        }
      } catch (e) {
        console.error(`Setup command failed: "${cmd}" → ${e.message}`);
      }
    }
  }

  /**
   * Spawn a pty process — inside Docker container if available,
   * local shell fallback otherwise.
   * @private
   */
  _spawnPty(dir, containerId = null) {
    if (containerId) {
      return docker.spawnContainerPty(containerId);
    }
    // Local fallback (development only — no sandbox!)

    const shell = os.platform() === 'win32' ? 'cmd.exe' : 'bash';
    return pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: dir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Git Player',
        GIT_AUTHOR_EMAIL: 'player@gitdojo.dev',
        GIT_COMMITTER_NAME: 'Git Player',
        GIT_COMMITTER_EMAIL: 'player@gitdojo.dev',
        EDITOR: 'nano',
        VISUAL: 'nano',
      },
    });
  }
}

// ── Singleton Export ─────────────────────────────────────
// ESM caches module scope, so this singleton is safe.
// Use `SandboxFactory` (the named export) only if you need
// a separate factory instance (e.g., in tests).
const instance = new SandboxFactory();

export default instance;
export { SandboxFactory };
