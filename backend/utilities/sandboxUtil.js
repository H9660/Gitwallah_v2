import factory from './SandboxFactory.js';  // singleton instance

export function cleanupSoloChallenge(soloSandbox) {
    factory.destroySandbox(soloSandbox);
    console.log("Container destroyed");
    soloSandbox = null;
}
