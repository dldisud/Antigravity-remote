// tui_parser를 실제 agy 출력 캡처(probe_*.txt)로 검증하는 테스트
const fs = require('fs');
const { stripAnsi } = require('./executor');
const { cleanTuiLine, extractMenu, isNoiseLine } = require('./tui_parser');

let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log(`✅ ${name}`);
  else { console.log(`❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

function toLines(raw) {
  return stripAnsi(raw).split('\n').map(cleanTuiLine);
}

// ===== 1. /model 메뉴 (실제 캡처) =====
if (fs.existsSync('./fixture_model_menu.txt')) {
  const raw = fs.readFileSync('./fixture_model_menu.txt', 'utf8');
  const menu = extractMenu(toLines(raw));
  check('model 메뉴 감지됨', !!menu);
  if (menu) {
    console.log('   옵션:', JSON.stringify(menu.options));
    console.log('   커서:', menu.cursorIndex);
    check('model 옵션 8개', menu.options.length === 8, `실제 ${menu.options.length}개`);
    check('첫 옵션 = Gemini 3.5 Flash (Medium)', menu.options[0] === 'Gemini 3.5 Flash (Medium)');
    check('마지막 옵션 = GPT-OSS 120B (Medium)', menu.options[7] === 'GPT-OSS 120B (Medium)');
    check('커서가 current 항목(0)에 위치', menu.cursorIndex === 0);
    check('자동완성 찌꺼기 없음', !menu.options.some(o => o.includes('Set a model') || o.startsWith('/')));
  }
}

// ===== 2. 폴더 신뢰 프롬프트 (실제 캡처 기반 fixture) =====
const trustFixture = [
  'Accessing workspace:', '', 'd:\\remote\\backend', '',
  'Do you trust the contents of this project?', '',
  'Antigravity CLI requires permission to read, edit, and execute files here.', '',
  '> Yes, I trust this folder',
  '  No, exit', '',
  '  ↑/↓ Navigate · enter Confirm',
  '                       Gemini 3.5 Flash (Medium)'
].join('\n');
{
  const menu = extractMenu(trustFixture.split('\n').map(cleanTuiLine));
  check('신뢰 프롬프트 메뉴 감지됨', !!menu);
  if (menu) {
    console.log('   옵션:', JSON.stringify(menu.options), '커서:', menu.cursorIndex);
    check('신뢰 옵션 2개', menu.options.length === 2);
    check('Yes가 첫 번째 + 커서 위치', menu.options[0] === 'Yes, I trust this folder' && menu.cursorIndex === 0);
  }
}

// ===== 3. 자동완성 드롭다운은 메뉴로 오인하지 않음 =====
const autocompleteFixture = [
  '> /add-dir          Add a directory to the workspace',
  '  /agents           List available custom agents',
  '',
  '  ↑/↓ Navigate · enter Select · tab Complete',
  '? for shortcuts'
].join('\n');
{
  const menu = extractMenu(autocompleteFixture.split('\n').map(cleanTuiLine));
  check('자동완성 드롭다운 무시됨', menu === null);
}

// ===== 4. 스킬 라인 파싱 (네임스페이스 콜론 포함) =====
{
  const m = '  superpowers:brainstorming: You MUST use this before any creative work'.match(/^\s{2}(\S+):\s+(.+)$/);
  check('스킬 이름에 콜론 포함 파싱', !!m && m[1] === 'superpowers:brainstorming', m && m[1]);
}

// ===== 5. 노이즈 필터 =====
if (fs.existsSync('./probe_startup.txt')) {
  const raw = fs.readFileSync('./probe_startup.txt', 'utf8');
  const kept = toLines(raw).filter(l => !isNoiseLine(l));
  console.log('   startup에서 남은 라인:', JSON.stringify(kept.slice(0, 10)));
  check('배너/스피너 대부분 제거됨', kept.length < 8, `남은 라인 ${kept.length}개`);
}

process.exit(failed > 0 ? 1 : 0);
