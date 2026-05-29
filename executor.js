const pty = require('node-pty');
const EventEmitter = require('events');

// 허용된 명령어 목록
const WHITELIST = [
  '/add-dir', '/agents', '/artifact', '/btw', '/changelog', '/clear', '/config', '/settings', '/context',
  '/copy', '/credits', '/diff', '/exit', '/quit', '/fast', '/feedback', '/fork', '/branch', '/help', '/hooks',
  '/keybindings', '/logout', '/mcp', '/model', '/open', '/permissions', '/planning', '/rename',
  '/resume', '/switch', '/rewind', '/undo', '/skills', '/skill', '/statusline', '/tasks', '/title', '/usage', '/quota', '/goal',
  '/schedule', '/grill-me', '/up', '/down', '/enter', '/esc'
];

// ANSI 이스케이프 코드(색상 및 커서 이동) 제거용 정규식
function stripAnsi(str) {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ''
  );
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
      this.emit('exit', exitCode);
      this.ptyProcess = null;
    });
  }

  execute(commandStr) {
    if (!this.ptyProcess) {
      this.emit('error', '[System] Agy shell is not running.\n');
      return;
    }

    const parts = commandStr.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    
    // 가상 키보드 입력 처리
    if (cmd === '/up') { this.ptyProcess.write('\x1b[A'); return; }
    if (cmd === '/down') { this.ptyProcess.write('\x1b[B'); return; }
    if (cmd === '/enter') { this.ptyProcess.write('\r'); return; }
    if (cmd === '/esc') { this.ptyProcess.write('\x1b'); return; }
    
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

    this.ptyProcess.write(finalCommandStr + '\r');
  }
}

module.exports = AgyExecutor;
