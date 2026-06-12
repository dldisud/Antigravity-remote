// agy TUI 출력 파싱 유틸 — server.js에서 사용, test_parser.js로 검증

// 한 줄에서 캐리지리턴 잔여물·스피너·창제목 시퀀스 제거
function cleanTuiLine(line) {
  let l = line.replace(/\r$/, '');
  const parts = l.split('\r');
  l = parts[parts.length - 1];
  l = l.replace(/[⠀-⣿]/g, ''); // 점자 스피너
  l = l.replace(/\]0;[^\x07]*\x07?/g, ''); // 창 제목 잔여물
  return l;
}

// 텔레그램으로 보낼 가치가 없는 TUI 노이즈 라인 판별
function isNoiseLine(line) {
  const t = line.trim();
  if (!t || t === '>') return true;
  if (/^[\s▀▄·]+$/.test(line)) return true; // 로고 아스키아트
  if (t.includes('Antigravity CLI') && /\d+\.\d+/.test(t)) return true; // 배너 헤더
  if (t.includes('(Google AI Pro)')) return true;
  if (t.includes('Signing in')) return true;
  if (t.includes('Generating...')) return true;
  if (t.startsWith('Tip: ')) return true;
  if (t.includes('esc to cancel') || t.includes('esc to interrupt')) return true;
  if (t.includes('? for shortcuts')) return true;
  if (t.includes('─────────────────────')) return true;
  if (t.includes('↑/↓ Navigate') || t.startsWith('Keyboard:')) return true;
  // 스팸 차단: AI 중간 생각 및 도구 호출 과정 필터링
  if (t.includes('Working...')) return true;
  if (t.includes('▶ Thought Process')) return true;
  if (t.includes('Interpreting User Intent')) return true;
  if (t.match(/^●\s+[A-Za-z0-9_]+\(/)) return true; // 예: "● ListDir("
  if (t.match(/^(I will|Thinking|Evaluating)\s/)) return true;
  return false;
}

// TUI 메뉴 파싱: 마지막 푸터("↑/↓ Navigate ...")를 기준으로 위로 거슬러 올라가며 옵션 수집
// 실제 agy 형식 — 옵션이 먼저, 푸터가 나중:
//   > Gemini 3.5 Flash (Medium)    (current)
//     Gemini 3.5 Flash (High)
//   Keyboard: ↑/↓ Navigate  enter Select  esc Go Back
function extractMenu(lines) {
  let footerIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('Navigate') && /Select|Confirm|View/.test(lines[i])) {
      footerIdx = i;
      break;
    }
  }
  if (footerIdx === -1) return null;
  // 슬래시 명령어 자동완성 드롭다운은 메뉴가 아님
  if (lines[footerIdx].includes('tab Complete')) return null;

  const collected = []; // 역순으로 수집
  let cursorPosFromBottom = -1;
  for (let i = footerIdx - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) {
      if (collected.length === 0) continue; // 푸터와 옵션 사이 빈 줄
      break;
    }
    const sel = line.match(/^\s*>\s+(.+)$/);
    const plain = line.match(/^\s{2}(\S.*)$/);
    const body = sel ? sel[1] : plain ? plain[1] : null;
    if (body === null) break; // 옵션 블록의 끝 (제목 등)
    const text = body.trim().replace(/\s+\(current\)$/, '');
    if (!text || /^↓\s*\d+\s*more/.test(text) || text.includes('Navigate')) continue;
    collected.push(text);
    if (sel) cursorPosFromBottom = collected.length - 1;
  }
  if (collected.length === 0) return null;

  const options = collected.slice().reverse();
  const cursorIndex = cursorPosFromBottom === -1 ? 0 : options.length - 1 - cursorPosFromBottom;
  return { options, cursorIndex };
}

// 터미널 출력에서 권한 요청(Permission) 프롬프트를 파싱하는 함수
function extractPermissionOptions(buffer) {
    if (!buffer.includes('Do you want to proceed?')) return [];

    const lines = buffer.split('\n').map(cleanTuiLine);
    const options = [];
    let inPrompt = false;

    for (let line of lines) {
        if (line.includes('Do you want to proceed?')) {
            inPrompt = true;
            continue;
        }
        if (inPrompt) {
            // 예: "> 1. Yes", "  2. Yes, and always allow..."
            const match = line.match(/^\s*(>)?\s*(\d+)\.\s+(.+)$/);
            if (match) {
                options.push({
                    number: match[2],
                    text: match[3].trim()
                });
            } else if (line.trim() === '' && options.length > 0) {
                break; // 옵션이 끝난 빈 줄
            }
        }
    }
    return options;
}

module.exports = { cleanTuiLine, isNoiseLine, extractMenu, extractPermissionOptions };
