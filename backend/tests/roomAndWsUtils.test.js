import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import WebSocket from 'ws';
import { generateRoomId, cleanupPlayer, cleanupRoom, cleanupSoloChallenge, rooms } from '../utilities/roomUtils.js';
import { wsSend } from '../utilities/wsUtils.js';
import { createTempDir } from '../utilities/dirUtils.js';
import { fakePty, makeTempDir, rmDir } from './helpers.js';

let dir;
afterEach(() => { rmDir(dir); rooms.clear(); });

describe('roomUtils', () => {
  it('generateRoomId returns 6 upper-case hex characters', () => {
    expect(generateRoomId()).toMatch(/^[0-9A-F]{6}$/);
  });

  it('cleanupPlayer kills the pty and removes the challenge directory', () => {
    dir = makeTempDir();
    const pty = fakePty();
    const player = { ptyProcess: pty, challengeDir: dir };
    cleanupPlayer(player);
    expect(pty.kill).toHaveBeenCalled();
    expect(player.ptyProcess).toBeNull();
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('cleanupPlayer tolerates null players and pty errors', () => {
    expect(() => cleanupPlayer(null)).not.toThrow();
    const pty = fakePty();
    pty.kill.mockImplementation(() => { throw new Error('gone'); });
    expect(() => cleanupPlayer({ ptyProcess: pty, challengeDir: null })).not.toThrow();
  });

  it('cleanupRoom cleans both players and forgets the room', () => {
    const host = { ptyProcess: fakePty(), challengeDir: null };
    const challenger = { ptyProcess: fakePty(), challengeDir: null };
    rooms.set('AAAAAA', { id: 'AAAAAA', host, challenger });
    cleanupRoom('AAAAAA');
    expect(rooms.has('AAAAAA')).toBe(false);
    expect(host.ptyProcess).toBeNull();
    expect(challenger.ptyProcess).toBeNull();
  });

  it('cleanupRoom ignores unknown rooms', () => {
    expect(() => cleanupRoom('NOPE')).not.toThrow();
  });

  it('cleanupSoloChallenge returns a reset state and removes the directory', () => {
    dir = makeTempDir();
    const pty = fakePty();
    const next = cleanupSoloChallenge({ ptyProcess: pty, challengeDir: dir, terminalHistory: 'abc' });
    expect(next).toEqual({ ptyProcess: null, challengeDir: null, terminalHistory: '' });
    expect(pty.kill).toHaveBeenCalled();
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe('wsSend', () => {
  it('sends JSON to an open socket', () => {
    const ws = { readyState: WebSocket.OPEN, send: vi.fn() };
    wsSend(ws, { type: 'output', data: 'hi' });
    expect(ws.send).toHaveBeenCalledWith('{"type":"output","data":"hi"}');
  });

  it('does nothing for closed or missing sockets', () => {
    const ws = { readyState: WebSocket.CLOSED, send: vi.fn() };
    wsSend(ws, { type: 'x' });
    wsSend(null, { type: 'x' });
    expect(ws.send).not.toHaveBeenCalled();
  });
});

describe('createTempDir', () => {
  it('creates a fresh directory under the git-challenges temp folder', () => {
    dir = createTempDir();
    expect(fs.existsSync(dir)).toBe(true);
    expect(dir).toMatch(/git-challenges/);
    const other = createTempDir();
    expect(other).not.toBe(dir);
    rmDir(other);
  });
});
