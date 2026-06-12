// 실제 agy를 띄워 메뉴 파싱 → 화살표+Enter 선택이 동작하는지 종단 검증
// 모델을 Claude Sonnet으로 바꿨다가 원래대로 되돌립니다.
const AgyExecutor = require('./executor');
const { cleanTuiLine, extractMenu } = require('./tui_parser');

const agy = new AgyExecutor('d:\\remote\\backend');
let buf = '';
agy.on('output', d => { buf += d; });
agy.start();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const lines = () => buf.split('\n').map(cleanTuiLine);

function selectOption(menu, targetText) {
  const idx = menu.options.findIndex(o => o === targetText);
  if (idx === -1) throw new Error(`option not found: ${targetText} in ${JSON.stringify(menu.options)}`);
  const delta = idx - menu.cursorIndex;
  const arrow = delta >= 0 ? '\x1b[B' : '\x1b[A';
  if (delta !== 0) agy.write(arrow.repeat(Math.abs(delta)));
  return sleep(200).then(() => agy.write('\r'));
}

(async () => {
  try {
    await sleep(15000); // 시작 대기
    buf = '';
    agy.execute('/model');
    await sleep(5000);

    let menu = extractMenu(lines());
    console.log('menu#1:', JSON.stringify(menu));
    if (!menu) throw new Error('model menu not detected');

    await selectOption(menu, 'Claude Sonnet 4.6 (Thinking)');
    await sleep(3000);
    const afterSwitch = buf;
    const switched = afterSwitch.includes('Claude Sonnet 4.6 (Thinking)');
    console.log('switched to Claude?', switched);

    // 원복
    buf = '';
    agy.execute('/model');
    await sleep(5000);
    menu = extractMenu(lines());
    console.log('menu#2 cursor:', menu && menu.cursorIndex, 'option at cursor:', menu && menu.options[menu.cursorIndex]);
    if (!menu) throw new Error('model menu #2 not detected');
    const cursorOnClaude = menu.options[menu.cursorIndex] === 'Claude Sonnet 4.6 (Thinking)';
    console.log('cursor tracks current model?', cursorOnClaude);

    await selectOption(menu, 'Gemini 3.5 Flash (Medium)');
    await sleep(3000);
    console.log('restored. tail:', JSON.stringify(buf.slice(-300)));

    console.log(switched && cursorOnClaude ? 'E2E_PASS' : 'E2E_PARTIAL');
  } catch (e) {
    console.error('E2E_FAIL:', e.message);
  } finally {
    agy.kill();
    process.exit(0);
  }
})();
