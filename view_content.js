const fs = require('fs');
const path = require('path');

const brainDir = path.join(process.env.USERPROFILE || process.env.HOME, '.gemini', 'antigravity-ide', 'brain');
const tPath = path.join(brainDir, '96af34af-015c-492c-aafa-8e6832f9988d', '.system_generated', 'logs', 'transcript.jsonl');
const lines = fs.readFileSync(tPath, 'utf8').trim().split('\n');

for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
    if (!lines[i]) continue;
    try {
        const step = JSON.parse(lines[i]);
        if (step.source === 'MODEL' && step.type === 'PLANNER_RESPONSE' && step.status === 'DONE') {
            console.log(`Step: ${step.step_index}`);
            console.log(`Content: "${step.content}"`);
            console.log('---');
        }
    } catch(e) {}
}
