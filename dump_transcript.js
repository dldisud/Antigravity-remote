const fs = require('fs');
const path = require('path');

const brainDir = path.join(process.env.USERPROFILE || process.env.HOME, '.gemini', 'antigravity-ide', 'brain');
const dirs = fs.readdirSync(brainDir).filter(f => fs.statSync(path.join(brainDir, f)).isDirectory());
const validDirs = dirs.map(d => {
    const tPath = path.join(brainDir, d, '.system_generated', 'logs', 'transcript.jsonl');
    return { dir: d, transcriptPath: tPath, exists: fs.existsSync(tPath), mtimeMs: fs.existsSync(tPath) ? fs.statSync(tPath).mtimeMs : 0 };
}).filter(d => d.exists);

validDirs.sort((a, b) => b.mtimeMs - a.mtimeMs);

const latest = validDirs[0];
const lines = fs.readFileSync(latest.transcriptPath, 'utf8').trim().split('\n');

const out = [];
for (let i = lines.length - 1; i >= Math.max(0, lines.length - 100); i--) {
    if (!lines[i]) continue;
    try {
        const step = JSON.parse(lines[i]);
        if (step.source === 'MODEL') {
            out.push({ type: step.type, status: step.status, step_index: step.step_index });
        }
    } catch(e) {}
}

fs.writeFileSync('d:/remote/backend/dump.json', JSON.stringify(out, null, 2));
