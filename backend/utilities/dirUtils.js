import fs from 'fs';
import os from 'os';
import path from 'path';


export function createTempDir() {
    const base = path.join(os.tmpdir(), 'git-challenges');
    fs.mkdirSync(base, { recursive: true });
    return fs.mkdtempSync(path.join(base, 'ch-'));
}

export function setupChallengeInDir(challenge, dir) {
    if (challenge.setupCommands) {
        executeSetupCommands(dir, challenge.setupCommands);
    } else if (challenge.setup) {
        challenge.setup(dir);
    }
}