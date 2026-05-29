const fs = require('fs');
const path = require('path');

function getLatestTranscriptResponse(sentText) {
    try {
        const brainDir = path.join(process.env.USERPROFILE || process.env.HOME, '.gemini', 'antigravity-ide', 'brain');
        const dirs = fs.readdirSync(brainDir).filter(f => fs.statSync(path.join(brainDir, f)).isDirectory());
        const validDirs = dirs.map(d => {
            const tPath = path.join(brainDir, d, '.system_generated', 'logs', 'transcript.jsonl');
            return { dir: d, transcriptPath: tPath, exists: fs.existsSync(tPath) };
        }).filter(d => d.exists);
        
        validDirs.sort((a, b) => fs.statSync(b.transcriptPath).mtimeMs - fs.statSync(a.transcriptPath).mtimeMs);
        
        for (let k = 0; k < Math.min(5, validDirs.length); k++) {
            const transcriptPath = validDirs[k].transcriptPath;
            const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
            let lastUserInput = '';
            let lastModelResponse = null;
            for (let i = lines.length - 1; i >= 0; i--) {
                if (!lines[i].trim()) continue;
                const step = JSON.parse(lines[i]);
                if (step.source === 'MODEL' && (step.type === 'PLANNER_RESPONSE' || step.type === 'AGENT_RESPONSE') && step.status === 'DONE' && !lastModelResponse) {
                    lastModelResponse = step;
                }
                if (step.source === 'USER_EXPLICIT' && step.type === 'USER_INPUT') {
                    lastUserInput = step.content;
                    break;
                }
            }
            console.log(`Checking dir: ${validDirs[k].dir}`);
            console.log(`lastUserInput: "${lastUserInput}"`);
            console.log(`sentText: "${sentText}"`);
            console.log(`includes?: ${lastUserInput.includes(sentText)}`);
            if (lastModelResponse && lastUserInput.includes(sentText)) {
                return lastModelResponse;
            }
        }
    } catch (err) {
        console.error('Transcript read error:', err.message);
    }
    return null;
}

const result = getLatestTranscriptResponse('테스트 폴더는 잘 만들어지고 있어');
console.log('Result:', result ? result.step_index : 'null');
