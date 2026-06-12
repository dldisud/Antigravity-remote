// agy TUI 출력 형식 확인용 일회성 프로브 스크립트
const pty = require('node-pty');
const fs = require('fs');

const shell = process.env.comspec || 'cmd.exe';
const proc = pty.spawn(shell, ['/c', 'chcp 65001 > nul && agy'], {
  name: 'dumb',
  cols: 120,
  rows: 40,
  cwd: 'd:\\remote\\backend',
  env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' }
});

let raw = '';
proc.onData(d => { raw += d; });

setTimeout(() => {
  fs.writeFileSync('d:/remote/backend/probe_startup.txt', raw);
  raw = '';
  proc.write('/model\r');
  setTimeout(() => {
    fs.writeFileSync('d:/remote/backend/probe_model.txt', raw);
    raw = '';
    proc.write('\x1b'); // esc → 메뉴 닫기
    setTimeout(() => {
      proc.write('/skills\r');
      setTimeout(() => {
        fs.writeFileSync('d:/remote/backend/probe_skills.txt', raw);
        proc.kill();
        process.exit(0);
      }, 5000);
    }, 1000);
  }, 6000);
}, 15000);
