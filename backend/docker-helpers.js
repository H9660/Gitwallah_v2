import { execSync } from 'child_process';
import path from 'path';
import pty from 'node-pty';

let dockerAvailable = null;

export function isDockerAvailable() {
    if (dockerAvailable !== null) return dockerAvailable;
    try {
        execSync('docker info', { stdio: 'pipe', timeout: 5000 });
        dockerAvailable = true;
        console.log('  🐳 Docker detected — container sandboxing active');
    } catch {
        dockerAvailable = false;
        console.log('  ⚠️  Docker not available — falling back to local pty (UNSAFE)');
    }
    return dockerAvailable;
}

/**
 * Build the sandbox image if it doesn't exist.
 */
export function buildSandboxImage(dockerfilePath) {
    if (!isDockerAvailable()) return false;
    try {
        execSync('docker image inspect gitwallah-sandbox', { stdio: 'pipe', timeout: 5000 });
        console.log('  🐳 gitwallah-sandbox image ready');
        return true;
    } catch {
        try {
            const dir = path.dirname(dockerfilePath);
            console.log('  🔨 Building gitwallah-sandbox image...');
            execSync(
                `docker build -t gitwallah-sandbox -f "${dockerfilePath}" "${dir}"`,
                { stdio: 'inherit', timeout: 120000 }
            );
            console.log('  ✅ gitwallah-sandbox image built');
            return true;
        } catch (e) {
            console.error('  ❌ Failed to build sandbox image:', e.message);
            return false;
        }
    }
}

/**
 * Create a Docker container for a challenge session.
 * Returns the container ID string, or null on failure.
 */
export function createContainer(challengeDir) {
    if (!isDockerAvailable()) return null;
    try {
        const absDir = path.resolve(challengeDir);
        const name = `gitwallah-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const containerId = execSync(
            `docker run -d ` +
            `--name ${name} ` +
            `--memory=8m ` +
            `--cpus=0.5 ` +
            `--pids-limit=50 ` +
            `--network=none ` +
            `--read-only ` +
            `--tmpfs /tmp:rw,noexec,nosuid,size=64m ` +
            `--tmpfs /home/player:rw,nosuid,size=16m,uid=1000,gid=1000 ` +
            `-v "${absDir}:/workspace:rw" ` +
            `-w /workspace ` +
            `gitwallah-sandbox tail -f /dev/null`,
            { encoding: 'utf-8', timeout: 15000 }
        ).trim();
        console.log(`  🐳 Container ${containerId.slice(0, 12)} created`);
        return containerId;
    } catch (e) {
        console.error('  ❌ Container creation failed:', e.message);
        return null;
    }
}

/**
 * Spawn an interactive PTY session INSIDE a Docker container.
 * This is the magic — node-pty wraps "docker exec -it <id> bash"
 * giving us full bidirectional terminal I/O with resize support.
 *
 * Returns a node-pty process (same interface as pty.spawn('bash')).
 */
export function spawnContainerPty(containerId, cols = 120, rows = 30) {
    return pty.spawn('docker', [
        'exec',
        '-it',
        '-u', 'player',               // Run as non-root user
        '-e', `COLUMNS=${cols}`,
        '-e', `LINES=${rows}`,
        '-e', 'TERM=xterm-256color',
        '-e', 'GIT_AUTHOR_NAME=Git Player',
        '-e', 'GIT_AUTHOR_EMAIL=player@gitwallah.dev',
        '-e', 'GIT_COMMITTER_NAME=Git Player',
        '-e', 'GIT_COMMITTER_EMAIL=player@gitwallah.dev',
        '-e', 'EDITOR=nano',
        containerId,
        'bash'
    ], {
        name: 'xterm-256color',
        cols,
        rows,
    });
}

/**
 * Execute setup commands inside the container (used for challenge init).
 */
export function execInContainer(containerId, command, timeout = 10000) {
    return execSync(
        `docker exec ${containerId} bash -c "${command.replace(/"/g, '\\"')}"`,
        { encoding: 'utf-8', timeout }
    );
}

/**
 * Force-remove a container.
 */
export function destroyContainer(containerId) {
    if (!containerId) return;
    try {
        execSync(`docker rm -f ${containerId}`, { stdio: 'pipe', timeout: 5000 });
        console.log(`  🗑️  Container ${containerId.slice(0, 12)} destroyed`);
    } catch (e) {
        console.error(`  ❌ Container destroy failed:`, e.message);
    }
}
