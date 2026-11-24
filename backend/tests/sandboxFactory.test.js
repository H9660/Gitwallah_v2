import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { rmDir } from './helpers.js';

vi.mock('../docker-helpers.js', () => ({
  createContainer: vi.fn(() => null),
  destroyContainer: vi.fn(),
  execInContainer: vi.fn(),
  spawnContainerPty: vi.fn(() => ({ kill: vi.fn(), onData: vi.fn(), write: vi.fn() })),
  isDockerAvailable: vi.fn(() => false),
}));

const docker = await import('../docker-helpers.js');
const { default: pty } = await import('node-pty');
const { default: factory, SandboxFactory } = await import('../utilities/SandboxFactory.js');

let sandbox;
beforeEach(() => vi.clearAllMocks());
afterEach(() => { if (sandbox) rmDir(sandbox.challengeDir); sandbox = null; });

describe('SandboxFactory', () => {
  it('exports a singleton and the class', () => {
    expect(factory).toBeInstanceOf(SandboxFactory);
  });

  it('createSoloSandbox makes a temp dir, runs a static setup() and spawns a local pty without Docker', () => {
    const setup = vi.fn();
    sandbox = factory.createSoloSandbox({ setup });
    expect(fs.existsSync(sandbox.challengeDir)).toBe(true);
    expect(sandbox.challengeDir).toMatch(/git-challenges/);
    expect(setup).toHaveBeenCalledWith(sandbox.challengeDir);
    expect(sandbox.containerId).toBeNull();
    expect(pty.spawn).toHaveBeenCalledWith(expect.any(String), [], expect.objectContaining({ cwd: sandbox.challengeDir }));
    expect(sandbox.terminalHistory).toBe('');
  });

  it('runs AI setupCommands in the challenge directory', () => {
    sandbox = factory.createDuelSandbox({ setupCommands: ['git init -q'] });
    expect(fs.existsSync(path.join(sandbox.challengeDir, '.git'))).toBe(true);
  });

  it('prefers setupCommands over setup()', () => {
    const setup = vi.fn();
    sandbox = factory.createSoloSandbox({ setupCommands: ['git init -q'], setup });
    expect(setup).not.toHaveBeenCalled();
  });

  it('spawns the pty inside the container when Docker gives a container id', () => {
    docker.createContainer.mockReturnValueOnce('abcdef1234567890');
    sandbox = factory.createSoloSandbox({ setup() {} });
    expect(sandbox.containerId).toBe('abcdef1234567890');
    expect(docker.spawnContainerPty).toHaveBeenCalledWith('abcdef1234567890');
    expect(pty.spawn).not.toHaveBeenCalled();
  });

  it('destroySandbox kills the pty, removes the container and the directory', () => {
    docker.createContainer.mockReturnValueOnce('cid-1');
    sandbox = factory.createSoloSandbox({ setup() {} });
    const proc = sandbox.ptyProcess;
    const dir = sandbox.challengeDir;
    factory.destroySandbox(sandbox);
    expect(proc.kill).toHaveBeenCalled();
    expect(docker.destroyContainer).toHaveBeenCalledWith('cid-1');
    expect(fs.existsSync(dir)).toBe(false);
    expect(sandbox).toEqual({ containerId: null, ptyProcess: null, challengeDir: null, terminalHistory: '' });
  });

  it('destroySandbox is safe on null and partial sandboxes', () => {
    expect(() => factory.destroySandbox(null)).not.toThrow();
    expect(() => factory.destroySandbox({ ptyProcess: null, containerId: null, challengeDir: '/does/not/exist' })).not.toThrow();
    expect(docker.destroyContainer).not.toHaveBeenCalled();
  });
});
