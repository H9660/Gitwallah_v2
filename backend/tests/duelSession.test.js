import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakePty } from './helpers.js';

vi.mock('../utilities/SandboxFactory.js', () => ({
  default: {
    createDuelSandbox: vi.fn(),
    destroySandbox: vi.fn(),
  },
}));

const { default: factory } = await import('../utilities/SandboxFactory.js');
const { default: DuelSession } = await import('../DuelSession.js');

const challenge = {
  id: 'c1',
  title: 'Branch Out',
  difficulty: 'Beginner',
  description: 'Create a branch',
  hints: ['h1'],
  isAIGenerated: false,
  setupCommands: ['git init'],
  validationContext: 'secret judging criteria',
};

function sandbox() {
  return { containerId: null, ptyProcess: fakePty(), challengeDir: '/tmp/x', terminalHistory: '' };
}

function playingSession() {
  const s = new DuelSession('ABC123', challenge, 'Alice');
  s.challengerJoin({}, 'Bob');
  s.accept();
  return s;
}

beforeEach(() => {
  vi.clearAllMocks();
  factory.createDuelSandbox.mockImplementation(() => sandbox());
});

describe('DuelSession construction and queries', () => {
  it('starts in WAITING with the host name and an empty challenger slot', () => {
    const s = new DuelSession('ROOM01', challenge, 'Alice');
    expect(s.state).toBe('waiting');
    expect(s.isWaiting).toBe(true);
    expect(s.host.name).toBe('Alice');
    expect(s.challenger.name).toBeNull();
    expect(s.winner).toBeNull();
  });

  it('defaults the host name to "Player 1"', () => {
    expect(new DuelSession('R', challenge).host.name).toBe('Player 1');
  });

  it('getInfo exposes only public room info', () => {
    const s = new DuelSession('ROOM01', challenge, 'Alice');
    expect(s.getInfo()).toEqual({
      roomId: 'ROOM01', state: 'waiting', difficulty: 'Beginner', hostName: 'Alice', challengerName: null,
      expiresAt: new Date(s.createdAt + 30 * 60 * 1000).toISOString(),
    });
  });

  it('getChallengeData does not leak setup commands or judging criteria', () => {
    const data = new DuelSession('R', challenge, 'A').getChallengeData();
    expect(data).toEqual({
      id: 'c1', title: 'Branch Out', difficulty: 'Beginner', description: 'Create a branch', hints: ['h1'], isAIGenerated: false,
    });
    expect(data).not.toHaveProperty('setupCommands');
    expect(data).not.toHaveProperty('validationContext');
  });

  it('getPlayerSandbox returns null for an unknown role', () => {
    expect(new DuelSession('R', challenge, 'A').getPlayerSandbox('spectator')).toBeNull();
  });

  it('generateRoomId returns 6 upper-case hex characters', () => {
    for (let i = 0; i < 20; i++) expect(DuelSession.generateRoomId()).toMatch(/^[0-9A-F]{6}$/);
  });

  it('STATES is frozen', () => {
    expect(Object.isFrozen(DuelSession.STATES)).toBe(true);
    expect(Object.values(DuelSession.STATES)).toEqual(['waiting', 'ready', 'playing', 'finished']);
  });
});

describe('WAITING -> READY (challengerJoin)', () => {
  it('moves to READY and stores the challenger', () => {
    const s = new DuelSession('R', challenge, 'Alice');
    const ws = { id: 'ws' };
    expect(s.challengerJoin(ws, 'Bob')).toEqual({ ok: true });
    expect(s.isReady).toBe(true);
    expect(s.challenger.ws).toBe(ws);
    expect(s.challenger.name).toBe('Bob');
  });

  it('defaults the challenger name to "Player 2"', () => {
    const s = new DuelSession('R', challenge, 'Alice');
    s.challengerJoin({});
    expect(s.challenger.name).toBe('Player 2');
  });

  it('rejects a second challenger', () => {
    const s = new DuelSession('R', challenge, 'Alice');
    s.challengerJoin({}, 'Bob');
    const r = s.challengerJoin({}, 'Eve');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ready/);
    expect(s.challenger.name).toBe('Bob');
  });

  it('setHostWs binds the socket without changing state', () => {
    const s = new DuelSession('R', challenge);
    const ws = {};
    s.setHostWs(ws, 'Alice');
    expect(s.host.ws).toBe(ws);
    expect(s.host.name).toBe('Alice');
    expect(s.state).toBe('waiting');
  });
});

describe('READY -> PLAYING (accept)', () => {
  it('cannot accept while still WAITING', () => {
    const s = new DuelSession('R', challenge, 'Alice');
    const r = s.accept();
    expect(r.ok).toBe(false);
    expect(s.isWaiting).toBe(true);
    expect(factory.createDuelSandbox).not.toHaveBeenCalled();
  });

  it('creates one sandbox per player and moves to PLAYING', () => {
    const s = new DuelSession('R', challenge, 'Alice');
    s.challengerJoin({}, 'Bob');
    expect(s.accept()).toEqual({ ok: true });
    expect(s.isPlaying).toBe(true);
    expect(factory.createDuelSandbox).toHaveBeenCalledTimes(2);
    expect(factory.createDuelSandbox).toHaveBeenCalledWith(challenge);
    expect(s.getPlayerSandbox('host')).not.toBeNull();
    expect(s.getPlayerSandbox('challenger')).not.toBeNull();
  });

  it('stays READY and reports an error when sandbox creation fails', () => {
    factory.createDuelSandbox.mockImplementation(() => { throw new Error('docker down'); });
    const s = new DuelSession('R', challenge, 'Alice');
    s.challengerJoin({}, 'Bob');
    const r = s.accept();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/host/);
    expect(s.isReady).toBe(true);
  });
});

describe('PLAYING -> FINISHED (submitJudgement)', () => {
  it('rejects judgement when not playing', () => {
    const s = new DuelSession('R', challenge, 'Alice');
    const r = s.submitJudgement('host', { passed: true, score: 100 });
    expect(r).toMatchObject({ ok: false, won: false });
  });

  it('a pass with score >= 70 wins, finishes the duel and kills the opponent terminal', () => {
    const s = playingSession();
    const opponentPty = s.challenger.sandbox.ptyProcess;
    const r = s.submitJudgement('host', { passed: true, score: 85 });
    expect(r).toEqual({ ok: true, won: true });
    expect(s.isFinished).toBe(true);
    expect(s.winner).toBe('host');
    expect(opponentPty.kill).toHaveBeenCalled();
    expect(s.challenger.sandbox.ptyProcess).toBeNull();
    expect(s.host.sandbox.ptyProcess).not.toBeNull();
  });

  it('score of exactly 70 is a win', () => {
    const s = playingSession();
    expect(s.submitJudgement('challenger', { passed: true, score: 70 }).won).toBe(true);
    expect(s.winner).toBe('challenger');
  });

  it('passed=true with score 69 is not a win and stays PLAYING', () => {
    const s = playingSession();
    expect(s.submitJudgement('host', { passed: true, score: 69 })).toEqual({ ok: true, won: false });
    expect(s.isPlaying).toBe(true);
    expect(s.winner).toBeNull();
  });

  it('passed=false is not a win even with a high score', () => {
    const s = playingSession();
    expect(s.submitJudgement('host', { passed: false, score: 100 }).won).toBe(false);
    expect(s.isPlaying).toBe(true);
  });

  it('no further judgement is accepted after the duel is finished', () => {
    const s = playingSession();
    s.submitJudgement('host', { passed: true, score: 90 });
    const r = s.submitJudgement('challenger', { passed: true, score: 100 });
    expect(r.ok).toBe(false);
    expect(s.winner).toBe('host');
  });

  it('tolerates an opponent pty whose kill() throws', () => {
    const s = playingSession();
    s.challenger.sandbox.ptyProcess.kill.mockImplementation(() => { throw new Error('already dead'); });
    expect(() => s.submitJudgement('host', { passed: true, score: 90 })).not.toThrow();
    expect(s.isFinished).toBe(true);
  });
});

describe('disconnects and cleanup', () => {
  it('host disconnect while WAITING finishes the room with no opponent to notify', () => {
    const s = new DuelSession('R', challenge, 'Alice');
    expect(s.playerDisconnected('host')).toEqual({ ok: true });
    expect(s.isFinished).toBe(true);
    expect(s.winner).toBeNull();
  });

  it('disconnect while PLAYING awards the win to the opponent', () => {
    const s = playingSession();
    expect(s.playerDisconnected('host')).toEqual({ ok: true, opponentRole: 'challenger' });
    expect(s.winner).toBe('challenger');
    expect(s.isFinished).toBe(true);
  });

  it('disconnect while READY awards the win to the opponent', () => {
    const s = new DuelSession('R', challenge, 'Alice');
    s.challengerJoin({}, 'Bob');
    expect(s.playerDisconnected('challenger')).toEqual({ ok: true, opponentRole: 'host' });
    expect(s.winner).toBe('host');
  });

  it('disconnect after the duel finished is a no-op', () => {
    const s = playingSession();
    s.submitJudgement('host', { passed: true, score: 90 });
    expect(s.playerDisconnected('challenger')).toEqual({ ok: false });
    expect(s.winner).toBe('host');
  });

  it('cleanup destroys both sandboxes and clears the slots', () => {
    const s = playingSession();
    const hostSb = s.host.sandbox;
    const chSb = s.challenger.sandbox;
    s.cleanup();
    expect(factory.destroySandbox).toHaveBeenCalledWith(hostSb);
    expect(factory.destroySandbox).toHaveBeenCalledWith(chSb);
    expect(s.host.sandbox).toBeNull();
    expect(s.challenger.sandbox).toBeNull();
  });
});
