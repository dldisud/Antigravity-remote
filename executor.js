const pty = require('node-pty');
const EventEmitter = require('events');

// 허용된 명령어 목록
const WHITELIST = [
  '/add-dir', '/agents', '/artifact', '/btw', '/changelog', '/clear', '/config', '/settings', '/context',
  '/copy', '/credits', '/diff', '/exit', '/quit', '/fast', '/feedback', '/fork', '/branch', '/help', '/hooks',
  '/keybindings', '/logout', '/mcp', '/model', '/open', '/permissions', '/planning', '/rename',
  '/resume', '/switch', '/rewind', '/undo', '/skills', '/skill', '/statusline', '/tasks', '/title', '/usage', '/quota', '/goal',
  '/schedule', '/grill-me', '/up', '/down', '/enter', '/esc', '/tab', '/stop'
];

// 가상 키보드 입력 매핑
const VIRTUAL_KEYS = {
  '/up': '\x1b[A',
  '/down': '\x1b[B',
  '/enter': '\r',
  '/esc': '\x1b',
  '/stop': '\x1b',
  '/tab': '\t'
};

// 커서 이동(CUP) 시퀀스 — TUI에서 줄바꿈 대용으로 쓰이므로 개행으로 변환
const CUP_RE = new RegExp('[\\u001B\\u009B]\\[\\d{0,4};?\\d{0,4}H', 'g');

// ANSI 이스케이프 시퀀스 제거 (CSI / OSC / DCS / 문자셋 / 기타 단일 시퀀스)
const ANSI_RE = new RegExp([
  '[\\u001B\\u009B]\\[[0-9;?=<>]*[ -\\/]*[@-~]',          // CSI (커서 이동, 색상, [1 q, [=1;1u 등)
  '\\u001B\\][^\\u0007\\u001B]*(?:\\u0007|\\u001B\\\\)?', // OSC (창 제목 ]0;... 등)
  '\\u001B[PX^_][\\s\\S]*?\\u001B\\\\',                   // DCS / PM / APC
  '\\u001B[()][0-9A-Za-z]',                               // 문자셋 지정
  '\\u001B[=>NOMD78Hc]'                                   // 기타 단일 바이트 시퀀스
].join('|'), 'g');

function stripAnsi(str) {
  return str.replace(CUP_RE, '\n').replace(ANSI_RE, '');
}

class AgyExecutor extends EventEmitter {
  constructor(cwd) {
    super();
    this.ptyProcess = null;
    this.cwd = cwd || process.cwd();
  }

  start() {
    if (this.ptyProcess) return;

    const shell = process.env.comspec || 'cmd.exe';

    this.ptyProcess = pty.spawn(shell, ['/c', 'chcp 65001 > nul && agy'], {
      name: 'dumb',
      cols: 120,
      rows: 40,
      cwd: this.cwd,
      env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' }
    });

    this.ptyProcess.onData((data) => {
      const cleanData = stripAnsi(data);
      if (cleanData) {
        this.emit('output', cleanData);
      }
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this.ptyProcess = null;
      this.emit('exit', exitCode);
    });
  }

  // 원시 키 입력 전송 (화살표, ESC 등)
  write(raw) {
    if (this.ptyProcess) this.ptyProcess.write(raw);
  }

  isRunning() {
    return !!this.ptyProcess;
  }

  kill() {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  execute(commandStr) {
    if (!this.ptyProcess) {
      this.emit('error', '[System] Agy shell is not running.\n');
      return;
    }

    const parts = commandStr.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (VIRTUAL_KEYS[cmd]) {
      this.ptyProcess.write(VIRTUAL_KEYS[cmd]);
      return;
    }

    if (cmd.startsWith('/') && !WHITELIST.includes(cmd)) {
        this.emit('error', `[System] Error: Command '${cmd}' is not allowed.\n`);
        return;
    }

    // 텔레그램에서 줄임말(Partial Command)을 입력하고 엔터를 치면
    // agy 내부에서 자동완성(Autocomplete) 모드로 빠져버리고 실행이 안 되는 문제를 해결하기 위해
    // 줄임말을 전체 명령어로 강제 변환합니다.
    const aliases = {
      '/skill': '/skills',
      '/switch': '/resume',
      '/quit': '/exit',
      '/branch': '/fork',
      '/undo': '/rewind',
      '/settings': '/config',
      '/quota': '/usage'
    };

    let finalCommandStr = commandStr;
    if (aliases[cmd]) {
      // 대소문자 무시하고 명령어 부분만 치환 (인자는 그대로 유지)
      finalCommandStr = commandStr.replace(new RegExp('^' + cmd, 'i'), aliases[cmd]);
    }

    // 여러 줄 메시지는 첫 줄에서 잘려 전송되지 않도록 bracketed paste로 감싸서 전달
    if (finalCommandStr.includes('\n')) {
      this.ptyProcess.write('\x1b[200~' + finalCommandStr + '\x1b[201~');
      this.ptyProcess.write('\r');
    } else {
      this.ptyProcess.write(finalCommandStr + '\r');
    }
  }
}

module.exports = AgyExecutor;
module.exports.stripAnsi = stripAnsi;
