require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const localtunnel = require('localtunnel');
const TelegramBot = require('node-telegram-bot-api');
const AgyExecutor = require('./executor');
const { cleanTuiLine, isNoiseLine, extractMenu, extractPermissionOptions } = require('./tui_parser');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// 다중 세션 관리
const sessions = new Map();
// 탐색기 상태 관리
const navStates = new Map();

// ===== 최근 프로젝트 기억 =====
const RECENT_FILE = path.join(__dirname, 'recent_projects.json');

function loadRecentProjects() {
  try { return JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8')); } catch (e) { return {}; }
}

function saveRecentProject(chatId, dir) {
  const all = loadRecentProjects();
  const key = String(chatId);
  const list = (all[key] || []).filter(p => p !== dir);
  list.unshift(dir);
  all[key] = list.slice(0, 3);
  try { fs.writeFileSync(RECENT_FILE, JSON.stringify(all, null, 2)); } catch (e) {}
}

function shortenPath(p, max = 32) {
  return p.length <= max ? p : '…' + p.slice(-(max - 1));
}

// transcript.jsonl 파일에서 가장 최근 AI의 깨끗한 마크다운 응답을 가져오는 함수
// minMtimeMs: 이 시각 이전에 갱신이 멈춘 트랜스크립트(=옛 대화)는 무시
function getLatestTranscriptResponse(sentText, minMtimeMs = 0) {
    try {
        const brainDir = path.join(process.env.USERPROFILE || process.env.HOME, '.gemini', 'antigravity-ide', 'brain');
        if (!fs.existsSync(brainDir)) return null;
        const validDirs = fs.readdirSync(brainDir)
            .map(d => path.join(brainDir, d, '.system_generated', 'logs', 'transcript.jsonl'))
            .filter(p => fs.existsSync(p))
            .map(p => ({ transcriptPath: p, mtimeMs: fs.statSync(p).mtimeMs }))
            .filter(t => t.mtimeMs >= minMtimeMs)
            .sort((a, b) => b.mtimeMs - a.mtimeMs);

        for (const t of validDirs.slice(0, 5)) {
            const lines = fs.readFileSync(t.transcriptPath, 'utf8').trim().split('\n');
            let lastUserInput = '';
            let lastModelResponse = null;
            for (let i = lines.length - 1; i >= 0; i--) {
                if (!lines[i].trim()) continue;
                let step;
                try { step = JSON.parse(lines[i]); } catch (e) { continue; }
                if (step.source === 'MODEL' && (step.type === 'PLANNER_RESPONSE' || step.type === 'AGENT_RESPONSE') && step.status === 'DONE' && !lastModelResponse) {
                    lastModelResponse = step;
                }
                if (step.source === 'USER_EXPLICIT' && step.type === 'USER_INPUT') {
                    lastUserInput = step.content || '';
                    break;
                }
            }
            if (lastModelResponse && sentText && lastUserInput.includes(sentText)) {
                return { step: lastModelResponse, transcriptPath: t.transcriptPath };
            }
        }
    } catch (err) {
        console.error('Transcript read error:', err.message);
    }
    return null;
}

function listWindowsDrives() {
    const drives = [];
    for (let c = 67; c <= 90; c++) { // C: ~ Z:
        const letter = String.fromCharCode(c);
        try { if (fs.existsSync(letter + ':\\')) drives.push(letter); } catch (e) {}
    }
    return drives;
}

// Initialize Telegram Bot
let bot = null;

if (TELEGRAM_TOKEN && TELEGRAM_TOKEN !== 'your_telegram_bot_token_here') {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

  bot.on('polling_error', (err) => console.error('Polling error:', err.message));

  const telegramCommands = [
    { command: 'set_project', description: '📂 프로젝트 폴더 선택 (탐색기/최근 목록)' },
    { command: 'status', description: '📊 현재 세션 상태 확인' },
    { command: 'stop', description: '⏹ 진행 중인 작업 취소' },
    { command: 'model', description: '🤖 AI 모델 변경 (버튼)' },
    { command: 'skills', description: '🧩 스킬 목록 (버튼)' },
    { command: 'clear', description: '🧹 대화 기록 초기화' },
    { command: 'resume', description: '🔄 이전 대화 이어하기' },
    { command: 'tasks', description: '⚙️ 백그라운드 작업 보기' },
    { command: 'artifact', description: '📦 생성된 산출물 확인' },
    { command: 'usage', description: '📈 사용량 확인' },
    { command: 'enter', description: '⏎ Enter 키 전송' },
    { command: 'esc', description: '⎋ ESC 키 전송' },
    { command: 'up', description: '↑ 키 전송' },
    { command: 'down', description: '↓ 키 전송' },
    { command: 'close', description: '🚪 현재 세션 종료' },
    { command: 'help', description: '❓ 도움말' }
  ];
  bot.setMyCommands(telegramCommands).catch(err => console.error('Set commands error:', err.message));

  const HELP_TEXT = [
    '🚀 Antigravity Remote 사용법',
    '',
    '기본:',
    '• /set_project — 폴더 탐색기로 프로젝트 선택 (최근 폴더 바로가기 지원)',
    '• 그냥 메시지를 보내면 AI에게 전달됩니다',
    '• /stop — 진행 중인 AI 작업 취소',
    '• /status — 세션 상태 확인',
    '• /close — 세션 종료',
    '',
    '자주 쓰는 기능:',
    '• /model — 모델 변경 (메뉴가 버튼으로 표시됨)',
    '• /skills — 스킬 목록 보기',
    '• /clear — 대화 초기화',
    '• /resume — 이전 대화 이어하기',
    '',
    '수동 키 입력 (메뉴 직접 조작용):',
    '• /up /down /enter /esc',
    '',
    '💡 터미널에 선택 메뉴가 뜨면 자동으로 버튼으로 변환됩니다.',
    '💡 권한 요청도 버튼으로 표시되니 클릭만 하면 됩니다.'
  ].join('\n');

  // 긴 텍스트를 4000자 단위로 순서 보장하며 전송
  async function sendLong(chatId, text) {
    const chunks = text.match(/[\s\S]{1,4000}/g) || [];
    for (const chunk of chunks) {
      try { await bot.sendMessage(chatId, chunk); }
      catch (err) { console.error('Send error:', err.message); }
    }
  }

  function renderFileExplorer(chatId, messageId = null) {
    const state = navStates.get(chatId);
    if (!state) return;

    try {
        const items = fs.readdirSync(state.currentPath, { withFileTypes: true });
        const dirs = items
            .filter(item => item.isDirectory() && !item.name.startsWith('.'))
            .map(item => item.name)
            .sort();

        state.directories = dirs;

        const inlineKeyboard = [];

        const recents = loadRecentProjects()[String(chatId)] || [];
        recents.forEach((p, i) => {
            inlineKeyboard.push([{ text: `🕘 최근: ${shortenPath(p)}`, callback_data: `NAVR_${i}` }]);
        });

        inlineKeyboard.push([
            { text: '⬆️ 상위 폴더', callback_data: 'NAV_UP' },
            { text: '💽 드라이브', callback_data: 'NAV_DRV' }
        ]);
        inlineKeyboard.push([{ text: '✅ 이 폴더를 프로젝트로 선택', callback_data: 'NAV_SEL' }]);

        for (let i = 0; i < Math.min(dirs.length, 50); i += 2) {
            const row = [];
            row.push({ text: `📁 ${dirs[i]}`, callback_data: `NAV_${i}` });
            if (i + 1 < dirs.length && i + 1 < 50) {
                row.push({ text: `📁 ${dirs[i+1]}`, callback_data: `NAV_${i+1}` });
            }
            inlineKeyboard.push(row);
        }

        const text = `📂 현재 위치: ${state.currentPath}\n\n이동할 폴더를 누르거나, 이 폴더를 프로젝트로 선택하세요.`;
        const opts = { reply_markup: { inline_keyboard: inlineKeyboard } };

        if (messageId) {
            opts.chat_id = chatId;
            opts.message_id = messageId;
            bot.editMessageText(text, opts).catch(err => console.error('Explorer edit error:', err.message));
        } else {
            bot.sendMessage(chatId, text, opts).catch(err => console.error('Explorer send error:', err.message));
        }
    } catch (err) {
        bot.sendMessage(chatId, `경로를 읽을 수 없습니다: ${err.message}`).catch(() => {});
    }
  }

  function renderDriveList(chatId, messageId) {
    const drives = listWindowsDrives();
    const inlineKeyboard = [];
    for (let i = 0; i < drives.length; i += 3) {
        inlineKeyboard.push(drives.slice(i, i + 3).map(d => ({ text: `💽 ${d}:`, callback_data: `NAVD_${d}` })));
    }
    const opts = { reply_markup: { inline_keyboard: inlineKeyboard } };
    if (messageId) {
        opts.chat_id = chatId;
        opts.message_id = messageId;
        bot.editMessageText('이동할 드라이브를 선택하세요:', opts).catch(err => console.error(err.message));
    } else {
        bot.sendMessage(chatId, '이동할 드라이브를 선택하세요:', opts).catch(err => console.error(err.message));
    }
  }

  class ChatSession {
    constructor(chatId, cwd) {
      this.chatId = chatId;
      this.cwd = cwd;
      this.startedAt = Date.now();
      this.agy = new AgyExecutor(cwd);
      this.outputBuffer = '';
      this.debounceTimer = null;
      this.isMutedForTelegram = false;
      this.isAiThinking = false;
      this.thinkingSince = 0;
      this.awaitingResponse = false;
      this.lastUserMessage = '';
      this.lastMessageSentAt = 0;
      this.lastSentKey = '';
      this.activeMenu = null;
      this.skillList = [];
      this.closing = false;

      this.setupListeners();
      this.agy.start();
    }

    // 사용자 일반 메시지를 보냈음을 기록 (transcript 응답 대기 시작)
    markUserMessage(text) {
      this.lastUserMessage = text;
      this.lastMessageSentAt = Date.now();
      this.isAiThinking = true;
      this.thinkingSince = Date.now();
      this.awaitingResponse = true;
    }

    setupListeners() {
      this.agy.on('output', (data) => {
        this.outputBuffer += data;
        if (this.outputBuffer.length > 300000) {
          this.outputBuffer = this.outputBuffer.slice(-150000);
        }
        if (this.isMutedForTelegram) return;

        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.processBuffer(), 1500);
      });

      this.agy.on('error', (err) => {
        bot.sendMessage(this.chatId, `[ERROR]\n${err}`).catch(() => {});
      });

      this.agy.on('exit', (code) => {
        if (this.closing) return;
        sessions.delete(this.chatId);
        bot.sendMessage(this.chatId, `⚠️ Antigravity CLI 프로세스가 종료되었습니다 (code: ${code}).\n/set_project 로 세션을 다시 시작해주세요.`).catch(() => {});
      });
    }

    processBuffer() {
      const buffer = this.outputBuffer;
      if (!buffer.trim()) { this.outputBuffer = ''; return; }
      const lines = buffer.split('\n').map(cleanTuiLine);

      // 1) 권한 요청 프롬프트 → 버튼
      if (buffer.includes('Do you want to proceed?')) {
        const permOptions = extractPermissionOptions(buffer);
        if (permOptions.length > 0) {
          const inlineKeyboard = permOptions.map(opt => [{
            text: `${opt.number}. ${opt.text}`,
            callback_data: `PERM_${opt.number}`
          }]);
          bot.sendMessage(this.chatId, '⚠️ 권한 요청 (Permission Required)', {
            reply_markup: { inline_keyboard: inlineKeyboard }
          }).catch(err => console.error(err.message));
          this.outputBuffer = '';
          return;
        }
      }

      // 2) TUI 선택 메뉴 → 버튼 (폴더 신뢰 확인, 모델 선택 등 모두 자동 감지)
      const menu = extractMenu(lines);
      if (menu && menu.options.length > 0 && menu.options.length <= 30) {
        this.activeMenu = menu;
        let caption = '✨ 원하는 항목을 선택하세요';
        if (buffer.includes('Do you trust')) caption = '⚠️ 폴더 신뢰 확인 — 계속하려면 선택하세요';
        else if (buffer.includes('Switch Model')) caption = '🤖 모델을 선택하세요';

        const inlineKeyboard = menu.options.map((opt, idx) => [{
          text: (idx === menu.cursorIndex ? '▸ ' : '') + opt,
          callback_data: `DYN_${idx}`
        }]);
        inlineKeyboard.push([{ text: '❌ 닫기 (esc)', callback_data: 'DYN_CANCEL' }]);

        bot.sendMessage(this.chatId, caption, {
          reply_markup: { inline_keyboard: inlineKeyboard }
        }).catch(err => console.error(err.message));
        this.outputBuffer = '';
        return;
      }

      // 3) transcript에서 완성된 AI 응답 확인 (내가 보낸 메시지에 대한 응답만)
      if (this.awaitingResponse && this.lastUserMessage) {
        const found = getLatestTranscriptResponse(this.lastUserMessage, this.lastMessageSentAt - 5000);
        if (found) {
          const key = `${found.transcriptPath}:${found.step.step_index}`;
          if (key !== this.lastSentKey) {
            this.lastSentKey = key;
            this.isAiThinking = false;
            this.awaitingResponse = false;
            if (found.step.content) {
              sendLong(this.chatId, found.step.content);
              this.outputBuffer = '';
              return;
            }
            // content가 없으면 AI가 도구만 사용한 경우 → 아래 TUI Fallback으로 화면 전송
          }
        }
      }

      // 4) AI가 생각 중이면 중간 TUI 찌꺼기를 보내지 않고 대기 (4분 안전장치 포함)
      if (this.isAiThinking && !buffer.toLowerCase().includes('error')) {
        if (Date.now() - this.thinkingSince < 4 * 60 * 1000) return;
        this.isAiThinking = false; // 너무 오래 걸리면 화면이라도 보여줌
      }

      // 5) TUI Fallback: 노이즈 걸러내고 전송
      const cleanedText = lines.filter(l => !isNoiseLine(l)).join('\n').trim();
      if (cleanedText) {
        sendLong(this.chatId, cleanedText);
      }
      this.outputBuffer = '';
    }

    mute(ms) {
      this.isMutedForTelegram = true;
      setTimeout(() => { this.isMutedForTelegram = false; }, ms);
    }

    close() {
      this.closing = true;
      clearTimeout(this.debounceTimer);
      this.agy.removeAllListeners();
      this.agy.kill();
    }
  }

  function startSession(chatId, targetDir, messageId = null) {
    if (sessions.has(chatId)) {
      sessions.get(chatId).close();
      sessions.delete(chatId);
    }
    const newSession = new ChatSession(chatId, targetDir);
    sessions.set(chatId, newSession);
    saveRecentProject(chatId, targetDir);
    navStates.delete(chatId);

    const text = `✅ 새로운 봇 세션이 시작되었습니다!\n📂 작업 폴더: ${targetDir}\n\n처음 여는 폴더면 잠시 후 신뢰 확인 버튼이 표시됩니다.\n이제 자유롭게 질문하고 코딩을 시작하세요.`;
    if (messageId) {
      bot.editMessageText(text, { chat_id: chatId, message_id: messageId }).catch(err => console.error(err.message));
    } else {
      bot.sendMessage(chatId, text).catch(err => console.error(err.message));
    }
  }

  bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    let text = (msg.text || '').trim();
    if (!text) return;

    if (text.startsWith('/')) {
      // 그룹 채팅의 /cmd@BotName 형태 정리
      text = text.replace(/^\/([a-zA-Z0-9_]+)@\S+/, '/$1');
      // 명령어 토큰 안의 _ 만 - 로 변환 (인자의 _ 는 보존)
      text = text.replace(/^\/(\S+)/, (m) => m.replace(/_/g, '-'));
    }

    if (text === '/start' || text === '/help') {
      bot.sendMessage(chatId, HELP_TEXT).catch(() => {});
      return;
    }

    if (text.startsWith('/set-project')) {
      const parts = text.split(' ');
      if (parts.length > 1) {
         // 기존 방식 (직접 타이핑)
         const targetDir = parts.slice(1).join(' ').trim();
         let isDir = false;
         try { isDir = fs.statSync(targetDir).isDirectory(); } catch (e) {}
         if (!isDir) {
            bot.sendMessage(chatId, `해당 경로를 찾을 수 없습니다: ${targetDir}`).catch(() => {});
            return;
         }
         startSession(chatId, targetDir);
      } else {
         // 인자 없이 실행하면 파일 탐색기 표시
         let defaultPath = process.cwd();
         try {
             const parent = path.resolve(process.cwd(), '..');
             if (fs.existsSync(parent)) defaultPath = parent;
         } catch (e) {}

         navStates.set(chatId, { currentPath: defaultPath, directories: [] });
         renderFileExplorer(chatId);
      }
      return;
    }

    if (text === '/close') {
      if (sessions.has(chatId)) {
         sessions.get(chatId).close();
         sessions.delete(chatId);
         bot.sendMessage(chatId, `✅ 현재 세션이 종료되었습니다.`).catch(() => {});
      } else {
         bot.sendMessage(chatId, `현재 실행 중인 세션이 없습니다.`).catch(() => {});
      }
      return;
    }

    const session = sessions.get(chatId);
    if (!session) {
      bot.sendMessage(chatId, `먼저 /set_project 명령어를 사용하여 세션을 열어주세요.`).catch(() => {});
      return;
    }

    if (text === '/status') {
      const mins = Math.floor((Date.now() - session.startedAt) / 60000);
      const state = session.isAiThinking ? '🤔 AI 작업 중...' : '💤 대기 중';
      bot.sendMessage(chatId, `📊 세션 상태\n📂 ${session.cwd}\n⏱ 가동 시간: ${mins}분\n${state}`).catch(() => {});
      return;
    }

    if (text === '/stop') {
      session.agy.write('\x1b');
      session.isAiThinking = false;
      session.awaitingResponse = false;
      session.isMutedForTelegram = false;
      clearTimeout(session.debounceTimer);
      session.outputBuffer = '';
      bot.sendMessage(chatId, '⏹ 진행 중인 작업을 취소했습니다.').catch(() => {});
      return;
    }

    if (text === '/skill' || text === '/skills') {
      session.isMutedForTelegram = true;
      clearTimeout(session.debounceTimer);
      session.outputBuffer = '';

      session.agy.write('\x1b'); // 열려있을지 모르는 메뉴 정리
      setTimeout(() => session.agy.execute('/skills'), 200);

      const loadingMsg = bot.sendMessage(chatId, '⏳ 스킬 목록을 불러오는 중입니다...');

      const parseSkills = () => {
        const lines = session.outputBuffer.split('\n').map(cleanTuiLine);
        const skills = [];
        for (const line of lines) {
          // 예: "  superpowers:brainstorming: You MUST use this before..."
          const m = line.match(/^\s{2}(\S+):\s+(.+)$/);
          if (!m) continue;
          const name = m[1];
          if (name.includes('/') || name.includes('\\')) continue;
          if (['Workspace', 'Global', 'Shared'].includes(name)) continue;
          if (!skills.some(s => s.name === name)) skills.push({ name, desc: m[2].trim() });
        }
        return skills;
      };

      const finish = (skills) => {
        session.isMutedForTelegram = false;
        session.outputBuffer = '';
        session.agy.write('\x1b'); // 스킬 화면 닫기

        loadingMsg.then(msgInfo => {
          if (skills.length > 0) {
            session.skillList = skills;
            const keyboard = skills.map((s, idx) => [{ text: s.name, callback_data: `SKILL_${idx}` }]);
            bot.editMessageText(`🧩 스킬 ${skills.length}개 — 상세 설명을 보려면 클릭하세요`, {
              chat_id: chatId, message_id: msgInfo.message_id, reply_markup: { inline_keyboard: keyboard }
            }).catch(err => console.error(err.message));
          } else {
            bot.editMessageText('스킬 목록을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.', {
              chat_id: chatId, message_id: msgInfo.message_id
            }).catch(err => console.error(err.message));
          }
        }).catch(err => console.error(err.message));
      };

      setTimeout(() => {
        const skills = parseSkills();
        if (skills.length > 0) finish(skills);
        else setTimeout(() => finish(parseSkills()), 3000); // 한 번 더 기다렸다 재시도
      }, 3500);
      return;
    }

    // 가상 키 입력은 전처리(ESC) 없이 즉시 전달 — 메뉴 조작 중 ESC가 메뉴를 닫아버리는 것 방지
    const cmd = text.split(/\s+/)[0].toLowerCase();
    if (['/up', '/down', '/enter', '/esc', '/tab'].includes(cmd)) {
      session.agy.execute(text);
      return;
    }

    bot.sendChatAction(chatId, 'typing').catch(() => {});

    // 명령어가 아닌 일반 메시지면 AI가 생각하기 시작한 것으로 간주 (스팸 뮤트 활성화)
    if (!text.startsWith('/')) {
        session.markUserMessage(text);
    }

    // ESC로 열려있을지 모르는 메뉴/자동완성을 정리 후 입력
    // (기존 Ctrl+C 방식은 연타 시 agy가 통째로 종료되는 문제가 있었음)
    session.agy.write('\x1b');
    setTimeout(() => session.agy.execute(text), 150);
  });

  bot.on('callback_query', (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    // ===== 파일 탐색기 =====
    if (data.startsWith('NAV')) {
      if (data.startsWith('NAVR_')) {
        // 최근 프로젝트 바로가기
        const idx = parseInt(data.replace('NAVR_', ''), 10);
        const recents = loadRecentProjects()[String(chatId)] || [];
        const dir = recents[idx];
        let isDir = false;
        try { isDir = dir && fs.statSync(dir).isDirectory(); } catch (e) {}
        if (!isDir) {
          bot.answerCallbackQuery(query.id, { text: '폴더가 더 이상 존재하지 않습니다.' }).catch(() => {});
          return;
        }
        startSession(chatId, dir, messageId);
        bot.answerCallbackQuery(query.id).catch(() => {});
        return;
      }

      if (data.startsWith('NAVD_')) {
        const letter = data.replace('NAVD_', '');
        const state = navStates.get(chatId) || { currentPath: letter + ':\\', directories: [] };
        state.currentPath = letter + ':\\';
        navStates.set(chatId, state);
        renderFileExplorer(chatId, messageId);
        bot.answerCallbackQuery(query.id).catch(() => {});
        return;
      }

      const state = navStates.get(chatId);
      if (!state) {
         bot.answerCallbackQuery(query.id, { text: '탐색기 세션이 만료되었습니다. /set_project를 다시 입력하세요.' }).catch(() => {});
         return;
      }

      if (data === 'NAV_DRV') {
         renderDriveList(chatId, messageId);
      } else if (data === 'NAV_UP') {
         const parent = path.dirname(state.currentPath);
         if (parent === state.currentPath) {
            renderDriveList(chatId, messageId); // 드라이브 루트에서 위로 → 드라이브 목록
         } else {
            state.currentPath = parent;
            renderFileExplorer(chatId, messageId);
         }
      } else if (data === 'NAV_SEL') {
         startSession(chatId, state.currentPath, messageId);
      } else {
         const idx = parseInt(data.replace('NAV_', ''), 10);
         if (!isNaN(idx) && state.directories && state.directories[idx]) {
             state.currentPath = path.join(state.currentPath, state.directories[idx]);
             renderFileExplorer(chatId, messageId);
         }
      }
      bot.answerCallbackQuery(query.id).catch(() => {});
      return;
    }

    const session = sessions.get(chatId);
    if (!session) {
      bot.answerCallbackQuery(query.id, { text: '세션이 없습니다. /set_project로 시작하세요.' }).catch(() => {});
      return;
    }

    // ===== 권한 요청 응답 =====
    if (data.startsWith('PERM_')) {
      const number = data.replace('PERM_', '');
      session.mute(2000);
      // 권한 응답 시에는 메뉴 탈출 키를 보내면 안 됨! 바로 응답 숫자 전송
      session.agy.write(number + '\r');

      bot.editMessageText(`✅ 권한 응답 완료: 선택 ${number}`, {
        chat_id: chatId, message_id: messageId
      }).catch(() => {});
      bot.answerCallbackQuery(query.id).catch(() => {});
      return;
    }

    // ===== 스킬 상세 보기 =====
    if (data.startsWith('SKILL_')) {
      const idx = parseInt(data.replace('SKILL_', ''), 10);
      const skill = session.skillList && session.skillList[idx];
      if (!skill) {
        bot.answerCallbackQuery(query.id, { text: '목록이 만료되었습니다. /skills를 다시 실행하세요.' }).catch(() => {});
        return;
      }
      bot.editMessageText(`🧩 ${skill.name}\n\n${skill.desc}`, {
        chat_id: chatId, message_id: messageId
      }).catch(err => console.error(err.message));
      bot.answerCallbackQuery(query.id).catch(() => {});
      return;
    }

    // ===== 동적 TUI 메뉴 선택 =====
    if (data.startsWith('DYN_')) {
      if (data === 'DYN_CANCEL') {
         session.mute(2000);
         session.activeMenu = null;
         session.agy.write('\x1b');
         bot.editMessageText(`❌ 선택이 취소되었습니다.`, { chat_id: chatId, message_id: messageId }).catch(() => {});
         bot.answerCallbackQuery(query.id).catch(() => {});
         return;
      }

      const index = parseInt(data.replace('DYN_', ''), 10);
      const menu = session.activeMenu;

      if (!menu || !menu.options[index]) {
        bot.answerCallbackQuery(query.id, { text: '메뉴가 만료되었습니다.' }).catch(() => {});
        return;
      }

      const selectedOption = menu.options[index];
      session.activeMenu = null;
      session.mute(2500);

      // 메뉴가 열려있는 상태이므로 화살표 키로 커서를 이동한 뒤 Enter로 선택
      const delta = index - menu.cursorIndex;
      const arrow = delta >= 0 ? '\x1b[B' : '\x1b[A';
      if (delta !== 0) session.agy.write(arrow.repeat(Math.abs(delta)));
      setTimeout(() => session.agy.write('\r'), 200);

      bot.editMessageText(`✅ 선택 완료: ${selectedOption}`, {
        chat_id: chatId, message_id: messageId
      }).catch(err => console.error(err.message));
      bot.answerCallbackQuery(query.id).catch(() => {});
      return;
    }
  });

  console.log('Telegram bot initialized.');
} else {
  console.log('Telegram token not provided. Bot is disabled.');
}

// ===== 웹 클라이언트 (socket.io) =====
// 텔레그램과 무관하게 동작하도록 AgyExecutor를 직접 사용
let webExecutor = null;
io.on('connection', (socket) => {
  console.log('Web client connected:', socket.id);

  if (!webExecutor) {
    webExecutor = new AgyExecutor(process.cwd());
    webExecutor.on('output', (data) => io.emit('output', data));
    webExecutor.on('error', (err) => io.emit('error', err));
    webExecutor.on('exit', (code) => { io.emit('exit', code); webExecutor = null; });
    webExecutor.start();
  }

  socket.on('execute', (commandStr) => {
    if (webExecutor) webExecutor.execute(String(commandStr));
  });

  socket.on('disconnect', () => {
    console.log('Web client disconnected:', socket.id);
  });
});

server.listen(PORT, async () => {
  console.log(`Server running locally on http://localhost:${PORT}`);
  try {
    const tunnel = await localtunnel({ port: PORT });
    console.log(`\n======================================================`);
    console.log(`🌍 PUBLIC WEB URL: ${tunnel.url}`);
    console.log(`프론트엔드 앱에서 소켓 연결 주소로 위 URL을 사용하세요.`);
    console.log(`======================================================\n`);
    tunnel.on('close', () => console.log('Localtunnel closed'));
  } catch (err) {
    console.error('Localtunnel error:', err.message);
  }
});
