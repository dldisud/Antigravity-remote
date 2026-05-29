require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const localtunnel = require('localtunnel');
const TelegramBot = require('node-telegram-bot-api');
const AgyExecutor = require('./executor');
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

// TUI 텍스트에서 옵션 항목들을 파싱하는 함수
function extractMenuOptions(buffer) {
    const lines = buffer.split('\n');
    const options = [];
    let inMenu = false;
    for (let line of lines) {
      if (line.includes('Navigate') && line.includes('Select')) inMenu = true;
      if (inMenu && line.includes('Keyboard:')) break;
      if (inMenu && line.includes('> ')) {
         let optionText = line.split('> ')[1].trim().replace(/\s+\(current\)$/, '');
         if (optionText && !options.includes(optionText)) options.push(optionText);
      }
      const match = line.match(/^\s{2}(?!esc)(.+)$/);
      if (inMenu && match) {
        let optionText = match[1].trim().replace(/\s+\(current\)$/, '');
        if (optionText && !options.includes(optionText) && !optionText.includes('Navigate')) {
           options.push(optionText);
        }
      }
    }
    return options;
}

// 터미널 출력에서 권한 요청(Permission) 프롬프트를 파싱하는 함수
function extractPermissionOptions(buffer) {
    if (!buffer.includes('Do you want to proceed?')) return [];
    
    const lines = buffer.split('\n');
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

// transcript.jsonl 파일에서 가장 최근 AI의 깨끗한 마크다운 응답을 가져오는 함수
function getLatestTranscriptResponse(sentText) {
    try {
        const brainDir = path.join(process.env.USERPROFILE || process.env.HOME, '.gemini', 'antigravity-ide', 'brain');
        if (!fs.existsSync(brainDir)) return null;
        const dirs = fs.readdirSync(brainDir).filter(f => fs.statSync(path.join(brainDir, f)).isDirectory());
        if (dirs.length === 0) return null;
        const validDirs = dirs.map(d => {
            const tPath = path.join(brainDir, d, '.system_generated', 'logs', 'transcript.jsonl');
            return { dir: d, transcriptPath: tPath, exists: fs.existsSync(tPath) };
        }).filter(d => d.exists);
        if (validDirs.length === 0) return null;
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
            if (lastModelResponse && lastUserInput.includes(sentText)) {
                return lastModelResponse;
            }
        }
    } catch (err) {
        console.error('Transcript read error:', err.message);
    }
    return null;
}

// Initialize Telegram Bot
let bot = null;

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
        
        inlineKeyboard.push([{ text: `📂 ${state.currentPath}`, callback_data: 'NAV_IGNORE' }]);
        
        inlineKeyboard.push([
            { text: '⬆️ 상위 폴더로', callback_data: 'NAV_UP' },
            { text: '✅ 이 폴더를 프로젝트로 선택', callback_data: 'NAV_SEL' }
        ]);

        for (let i = 0; i < Math.min(dirs.length, 50); i += 2) {
            const row = [];
            row.push({ text: `📁 ${dirs[i]}`, callback_data: `NAV_${i}` });
            if (i + 1 < dirs.length && i + 1 < 50) {
                row.push({ text: `📁 ${dirs[i+1]}`, callback_data: `NAV_${i+1}` });
            }
            inlineKeyboard.push(row);
        }

        const opts = { reply_markup: { inline_keyboard: inlineKeyboard } };
        
        if (messageId) {
            opts.chat_id = chatId;
            opts.message_id = messageId;
            bot.editMessageText("탐색기를 사용하여 작업할 폴더를 선택하세요:", opts).catch(err => console.error(err));
        } else {
            bot.sendMessage(chatId, "탐색기를 사용하여 작업할 폴더를 선택하세요:", opts).catch(err => console.error(err));
        }
    } catch (err) {
        bot.sendMessage(chatId, `경로를 읽을 수 없습니다: ${err.message}`);
    }
}

if (TELEGRAM_TOKEN && TELEGRAM_TOKEN !== 'your_telegram_bot_token_here') {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  
  const telegramCommands = [
    { command: 'set_project', description: '새로운 프로젝트 폴더에서 봇 세션 열기' },
    { command: 'close', description: '현재 봇 세션 종료' },
    { command: 'skills', description: '사용 가능한 스킬 목록 확인 (버튼 지원)' },
    { command: 'model', description: 'AI 모델 변경 (버튼 지원)' },
    { command: 'artifact', description: '생성된 산출물(Artifacts) 확인' },
    { command: 'tasks', description: '현재 진행 중인 백그라운드 작업 보기' },
    { command: 'clear', description: '대화 기록 지우고 새로 시작하기' }
  ];
  bot.setMyCommands(telegramCommands).catch(err => console.error('Set commands error:', err.message));
  
  const models = [
    "Gemini 3.5 Flash (Medium)", "Gemini 3.5 Flash (High)", "Gemini 3.5 Flash (Low)",
    "Gemini 3.1 Pro (Low)", "Gemini 3.1 Pro (High)", "Claude Sonnet 4.6 (Thinking)",
    "Claude Opus 4.6 (Thinking)", "GPT-OSS 120B (Medium)"
  ];

  class ChatSession {
    constructor(chatId, cwd) {
      this.chatId = chatId;
      this.cwd = cwd;
      this.agy = new AgyExecutor(cwd);
      this.outputBuffer = '';
      this.debounceTimer = null;
      this.isMutedForTelegram = false;
      this.isAiThinking = false;
      this.dynamicMenuOptions = [];
      this.lastUserMessage = '';
      this.lastSentStepIndex = -1;
      this.skillList = [];
      
      this.setupListeners();
      this.agy.start();
    }

    setupListeners() {
      this.agy.on('output', (data) => {
        this.outputBuffer += data;
        if (this.isMutedForTelegram) return;
        
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          if (this.outputBuffer.includes('Navigate') && this.outputBuffer.includes('Select')) {
             const options = extractMenuOptions(this.outputBuffer);
             if (options.length > 0) {
                const inlineKeyboard = options.map((opt, idx) => [{ text: opt, callback_data: `DYN_${idx}` }]);
                inlineKeyboard.push([{ text: '❌ 취소 (Cancel)', callback_data: 'DYN_CANCEL' }]);
                this.dynamicMenuOptions = options;
                bot.sendMessage(this.chatId, "✨ 텔레그램 전용 UI: 원하는 항목을 선택하세요", {
                  reply_markup: { inline_keyboard: inlineKeyboard }
                }).catch(err => console.error(err));
                this.outputBuffer = '';
                return;
             }
          }

          if (this.outputBuffer.includes('Do you want to proceed?')) {
             const permOptions = extractPermissionOptions(this.outputBuffer);
             if (permOptions.length > 0) {
                const inlineKeyboard = permOptions.map(opt => [{ 
                    text: `${opt.number}. ${opt.text}`, 
                    callback_data: `PERM_${opt.number}` 
                }]);
                
                bot.sendMessage(this.chatId, "⚠️ **권한 요청 (Permission Required)**", {
                  reply_markup: { inline_keyboard: inlineKeyboard },
                  parse_mode: 'Markdown'
                }).catch(err => console.error(err));
                this.outputBuffer = '';
                return;
             }
          }

          // 항상 트랜스크립트를 확인해서 새로운 AI 답변(DONE)이 완성되었다면 가장 우선적으로 전송
          const latestResponse = getLatestTranscriptResponse(this.lastUserMessage);
          if (latestResponse && latestResponse.step_index > this.lastSentStepIndex) {
              this.lastSentStepIndex = latestResponse.step_index;
              this.isAiThinking = false; // AI 작업 완료!
              if (latestResponse.content) {
                  const chunks = latestResponse.content.match(/[\s\S]{1,4000}/g) || [];
                  chunks.forEach(chunk => bot.sendMessage(this.chatId, chunk));
                  this.outputBuffer = '';
                  return;
              }
              // 만약 content가 없으면(undefined), AI가 도구만 사용하고 마크다운 메시지를 생성하지 않은 경우입니다.
              // 이때는 버퍼를 지우지 않고 아래의 TUI Fallback 로직이 터미널 화면을 보내도록 넘깁니다!
          }

          // AI가 아직 생각 중이라면 중간 TUI 찌꺼기를 보내지 않고 대기합니다!
          if (this.isAiThinking && !this.outputBuffer.toLowerCase().includes('error')) {
              return; 
          }

          if (this.outputBuffer.trim()) {
            let cleanedText = this.outputBuffer.split('\n').map(line => {
              let cleanLine = line.replace(/\r$/, '');
              const parts = cleanLine.split('\r');
              let finalLine = parts[parts.length - 1];
              finalLine = finalLine.replace(/^[\u2800-\u28FF]\s*/, '');
              finalLine = finalLine.replace(/\]0;.*?(\x07|\\x07|)/g, '');
              // 줄 끝에 붙는 TUI 클리어 문자 'X' 제거 (예: 작업 요약X -> 작업 요약)
              finalLine = finalLine.replace(/X$/, '');
              return finalLine;
            }).filter(line => {
              if (line.includes('Generating...')) return false;
              if (line.includes('Tip: ')) return false;
              if (line.includes('esc to cancel')) return false;
              if (line.includes('? for shortcuts')) return false;
              if (line.includes('─────────────────────')) return false;
              if (line.trim() === 'X' || line.trim() === '') return false;
              if (line.trim() === '>') return false;
              // 스팸 차단: AI 중간 생각 및 도구 호출 과정 필터링
              if (line.includes('Working...')) return false;
              if (line.includes('▶ Thought Process')) return false;
              if (line.includes('Interpreting User Intent')) return false;
              if (line.match(/^●\s+[A-Za-z0-9_]+\(/)) return false; // 예: "● ListDir("
              if (line.match(/^(I will|Thinking|Evaluating)\s/)) return false; // 생각 과정
              return true;
            }).join('\n').trim();

            if (cleanedText) {
              const chunks = cleanedText.match(/[\s\S]{1,4000}/g) || [];
              chunks.forEach(chunk => bot.sendMessage(this.chatId, chunk));
            }
          }
          this.outputBuffer = '';
        }, 1500);
      });

      this.agy.on('error', (err) => {
        bot.sendMessage(this.chatId, `[ERROR]\n${err}`);
      });
    }

    close() {
      if (this.agy.ptyProcess) {
        this.agy.ptyProcess.kill();
      }
      clearTimeout(this.debounceTimer);
    }
  }

  bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    let text = msg.text || '';
    if (!text) return;

    if (text.startsWith('/')) {
      text = text.replace(/_/, '-');
    }

    if (text.startsWith('/set-project')) {
      const parts = text.split(' ');
      if (parts.length > 1) {
         // 기존 방식 (직접 타이핑)
         const targetDir = parts.slice(1).join(' ').trim();
         if (!fs.existsSync(targetDir)) {
            bot.sendMessage(chatId, `해당 경로를 찾을 수 없습니다: ${targetDir}`);
            return;
         }
         if (sessions.has(chatId)) {
            sessions.get(chatId).close();
            sessions.delete(chatId);
         }
         const newSession = new ChatSession(chatId, targetDir);
         sessions.set(chatId, newSession);
         bot.sendMessage(chatId, `✅ 새로운 봇 세션이 시작되었습니다!\n작업 폴더: ${targetDir}\n\n이제 자유롭게 질문하고 코딩을 시작하세요.`);
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
         bot.sendMessage(chatId, `✅ 현재 세션이 종료되었습니다.`);
      } else {
         bot.sendMessage(chatId, `현재 실행 중인 세션이 없습니다.`);
      }
      return;
    }

    const session = sessions.get(chatId);
    if (!session) {
      if (text === '/start') {
         bot.sendMessage(chatId, `Antigravity CLI Remote Controller에 오신 것을 환영합니다!\n\n먼저 작업을 시작할 프로젝트 폴더를 설정해주세요.\n명령어: /set_project`);
      } else {
         bot.sendMessage(chatId, `먼저 /set_project 명령어를 사용하여 세션을 열어주세요.`);
      }
      return;
    }

    session.lastUserMessage = text;

    if (text === '/model') {
      const inlineKeyboard = models.map((model, index) => [{ text: model, callback_data: `MODEL_${index}` }]);
      bot.sendMessage(chatId, "✨ 텔레그램 전용 UI: 모델을 선택하세요", { reply_markup: { inline_keyboard: inlineKeyboard } });
      return;
    }

    if (text === '/skill' || text === '/skills') {
      session.isMutedForTelegram = true;
      clearTimeout(session.debounceTimer);
      session.outputBuffer = '';
      
      if (session.agy.ptyProcess) session.agy.ptyProcess.write('\x03'); 
      setTimeout(() => session.agy.execute('/skills'), 300);
      
      const loadingMsg = bot.sendMessage(chatId, "⏳ 스킬 목록을 분석하는 중입니다...");
      
      setTimeout(() => {
        session.isMutedForTelegram = false;
        const cleanedLines = session.outputBuffer.split('\n').map(line => {
          let cleanLine = line.replace(/\r$/, '');
          const parts = cleanLine.split('\r');
          return parts[parts.length - 1];
        });
        
        const skills = [];
        for (const line of cleanedLines) {
           const match = line.match(/^\s*(.+?):\s+(.+)$/);
           if (match && !line.includes('/') && !line.includes('\\') && !line.includes('Built-in')) {
             skills.push({ name: match[1].trim(), desc: match[2].trim() });
           }
        }
        
        loadingMsg.then(msgInfo => {
          if (skills.length > 0) {
             const keyboard = skills.map((s, idx) => [{ text: s.name, callback_data: `SKILL_${idx}` }]);
             session.skillList = skills;
             bot.editMessageText("✨ 텔레그램 전용 UI: 원하는 스킬의 상세 설명을 보려면 클릭하세요", {
               chat_id: chatId, message_id: msgInfo.message_id, reply_markup: { inline_keyboard: keyboard }
             }).catch(err => console.error(err));
          } else {
             bot.editMessageText("스킬 목록 파싱 실패. 터미널 출력이 없습니다.", { chat_id: chatId, message_id: msgInfo.message_id });
          }
        }).catch(err => console.error(err));
        
        session.outputBuffer = '';
      }, 3000);
      return;
    }

    bot.sendChatAction(chatId, 'typing').catch(() => {});
    
    // 명령어가 아닌 일반 메시지면 AI가 생각하기 시작한 것으로 간주 (스팸 뮤트 활성화)
    if (!text.startsWith('/')) {
        session.isAiThinking = true;
    }
    
    if (session.agy.ptyProcess) session.agy.ptyProcess.write('\x03');
    setTimeout(() => session.agy.execute(text), 100);
  });

  bot.on('callback_query', (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (data.startsWith('NAV_')) {
      if (data === 'NAV_IGNORE') {
         bot.answerCallbackQuery(query.id).catch(err => {});
         return;
      }
      
      const state = navStates.get(chatId);
      if (!state) {
         bot.answerCallbackQuery(query.id, { text: "탐색기 세션이 만료되었습니다. /set_project를 다시 입력하세요." }).catch(err => {});
         return;
      }

      if (data === 'NAV_UP') {
         state.currentPath = path.dirname(state.currentPath);
         renderFileExplorer(chatId, messageId);
      } else if (data === 'NAV_SEL') {
         const targetDir = state.currentPath;
         if (sessions.has(chatId)) {
             sessions.get(chatId).close();
             sessions.delete(chatId);
         }
         const newSession = new ChatSession(chatId, targetDir);
         sessions.set(chatId, newSession);
         bot.editMessageText(`✅ 새로운 봇 세션이 시작되었습니다!\n작업 폴더: ${targetDir}\n\n이제 자유롭게 질문하고 코딩을 시작하세요.`, {
             chat_id: chatId, message_id: messageId
         }).catch(err => console.error(err));
         navStates.delete(chatId);
      } else {
         const idx = parseInt(data.replace('NAV_', ''), 10);
         if (state.directories && state.directories[idx]) {
             state.currentPath = path.join(state.currentPath, state.directories[idx]);
             renderFileExplorer(chatId, messageId);
         }
      }
      bot.answerCallbackQuery(query.id).catch(err => {});
      return;
    }

    const session = sessions.get(chatId);
    if (!session) return;

    if (data.startsWith('PERM_')) {
      const number = data.replace('PERM_', '');
      
      session.isMutedForTelegram = true;
      setTimeout(() => { session.isMutedForTelegram = false; }, 2000);
      
      // 권한 응답 시에는 메뉴 탈출용 Ctrl+C를 보내면 안 됨! 바로 응답 숫자 전송
      if (session.agy.ptyProcess) session.agy.ptyProcess.write(number + '\r');
      
      bot.editMessageText(`✅ 권한 승인 완료: 선택 ${number}`, {
        chat_id: chatId, message_id: messageId
      }).catch(err => {});
      bot.answerCallbackQuery(query.id).catch(err => {});
      return;
    }

    if (data.startsWith('MODEL_')) {
      const modelIndex = parseInt(data.replace('MODEL_', ''), 10);
      const selectedModel = models[modelIndex];
      
      session.isMutedForTelegram = true;
      setTimeout(() => { session.isMutedForTelegram = false; }, 2000);

      if (session.agy.ptyProcess) session.agy.ptyProcess.write('\x03');
      setTimeout(() => session.agy.execute('/model'), 100);
      setTimeout(() => {
        if (session.agy.ptyProcess) session.agy.ptyProcess.write(selectedModel + '\r');
      }, 600);

      bot.editMessageText(`✅ 모델이 성공적으로 변경되었습니다:\n\n**${selectedModel}**`, {
        chat_id: chatId, message_id: messageId, parse_mode: 'Markdown'
      }).catch(err => console.error(err));
      bot.answerCallbackQuery(query.id).catch(err => {});
    }
    
    if (data.startsWith('SKILL_')) {
      const idx = parseInt(data.replace('SKILL_', ''), 10);
      const skill = session.skillList[idx];
      
      bot.editMessageText(`✅ **${skill.name}**\n\n${skill.desc}`, {
        chat_id: chatId, message_id: messageId, parse_mode: 'Markdown'
      }).catch(err => console.error(err));
      bot.answerCallbackQuery(query.id).catch(err => {});
    }
    
    if (data.startsWith('DYN_')) {
      if (data === 'DYN_CANCEL') {
         session.isMutedForTelegram = true;
         setTimeout(() => { session.isMutedForTelegram = false; }, 2000);
         if (session.agy.ptyProcess) session.agy.ptyProcess.write('\x03');
         bot.editMessageText(`❌ 선택이 취소되었습니다.`, { chat_id: chatId, message_id: messageId });
         bot.answerCallbackQuery(query.id);
         return;
      }

      const index = parseInt(data.replace('DYN_', ''), 10);
      const selectedOption = session.dynamicMenuOptions ? session.dynamicMenuOptions[index] : null;
      
      if (selectedOption) {
        session.isMutedForTelegram = true;
        setTimeout(() => { session.isMutedForTelegram = false; }, 2000);
        if (session.agy.ptyProcess) session.agy.ptyProcess.write('\x03');
        setTimeout(() => {
           if (session.agy.ptyProcess) session.agy.ptyProcess.write(selectedOption + '\r');
        }, 100);
        
        bot.editMessageText(`✅ 선택 완료:\n\n**${selectedOption}**`, {
          chat_id: chatId, message_id: messageId, parse_mode: 'Markdown'
        });
      }
      bot.answerCallbackQuery(query.id).catch(err => {});
    }
  });

  console.log('Telegram bot initialized.');
} else {
  console.log('Telegram token not provided. Bot is disabled.');
}

let webSession = null;
io.on('connection', (socket) => {
  console.log('Web client connected:', socket.id);
  
  if (!webSession) {
    webSession = new ChatSession('web', process.cwd());
    sessions.set('web', webSession);
    webSession.agy.on('output', (data) => io.emit('output', data));
    webSession.agy.on('error', (err) => io.emit('error', err));
    webSession.agy.on('exit', (code) => io.emit('exit', code));
  }

  socket.on('execute', (commandStr) => {
    webSession.agy.execute(commandStr);
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
    console.error('Localtunnel error:', err);
  }
});
