<div align="center">
  <h1>🚀 Antigravity Remote Controller</h1>
  <p><b>A smart remote controller that lets you seamlessly manage the Google DeepMind Antigravity CLI Agent via Telegram.</b></p>
  <p><a href="#english">English</a> | <a href="#korean">한국어</a></p>
</div>

<br>

<h2 id="english">🇬🇧 English</h2>

## 🌌 Overview

**Antigravity Remote** is an innovative bridge server that allows you to control the `Antigravity CLI`, an advanced AI coding assistant developed by the Google DeepMind team, anytime and anywhere using your smartphone via the Telegram messenger.

Without typing a single keyboard stroke, you can seamlessly navigate through your project folders and receive clean, markdown-formatted terminal outputs—all by just clicking Telegram's **Inline Buttons**!

## ✨ Key Features

- 📱 **Perfect Mobile Remote Control**: You don't need to be in front of your desktop. Command the AI to write code, fix bugs, or write documentation right from your phone.
- 📁 **Interactive Auto Explorer**: Use the `/set_project` command to open an inline file explorer. Navigate through your Windows drives and select your working directory with just a few button clicks.
- 🔄 **Multi-Session Architecture**: Use a single Telegram bot to manage multiple project environments (e.g., backend, frontend) across different chat rooms simultaneously, with perfect state isolation.
- 🧹 **Real-Time TUI De-cluttering**: Completely filters out complex escape codes and ANSI symbols specific to the CLI terminal, delivering only clean, pristine Markdown text—just like ChatGPT.
- ⚙️ **Dynamic Menu Parsing**: The server reads interactive CLI options in real-time and magically renders them as Telegram Inline Keyboard buttons.

## 🛠️ How to Use

### 1. Prerequisites
- Node.js installed (v18 or higher recommended)
- Telegram App & a Bot Token (Get one via BotFather)
- Antigravity CLI installed globally on your local machine

### 2. Project Setup
```bash
git clone https://github.com/dldisud/Antigravity-remote.git
cd Antigravity-remote
npm install
```

### 3. Environment Variables (`.env`)
Create an `.env` file in the root directory and paste your Telegram Bot Token.
```env
TELEGRAM_TOKEN=123456789:YOUR_TELEGRAM_BOT_TOKEN_HERE
```

### 4. Start Server
```bash
npm start
```
> Once the server is running, open your Telegram bot and type `/set_project` to open your first project session!

## 🕹️ Telegram Commands

- `/set_project`: Opens the inline file explorer (with recent-folder shortcuts and drive switching) to set up your working project folder.
- `/status`: Shows the current session folder, uptime, and whether the AI is busy.
- `/stop`: Cancels the AI task currently in progress (sends ESC).
- `/model`: Opens the model menu — it is automatically rendered as Telegram buttons.
- `/skills`: Shows a list of special skills the AI can use as clickable buttons.
- `/clear`: Clears the AI's conversation history context cleanly.
- `/resume`: Browse and resume past conversations (rendered as buttons).
- `/up` `/down` `/enter` `/esc`: Manual key presses for driving TUI menus directly.
- `/close`: Immediately kills the bot session connected to the current chat room to save memory.
- `/help`: Shows the full usage guide.

> Any selection menu that appears in the terminal (folder trust prompt, model picker, permission requests, etc.) is automatically converted into inline buttons.

---

<br>

<h2 id="korean">🇰🇷 한국어</h2>

## 🌌 소개

**Antigravity Remote**는 구글 딥마인드 팀이 개발한 AI 코딩 어시스턴트인 `Antigravity CLI`를 텔레그램 메신저를 통해 언제 어디서든 스마트폰으로 제어할 수 있게 해주는 혁신적인 브릿지 서버입니다.

키보드 타이핑 없이 오직 텔레그램의 **인라인 버튼 클릭만으로 프로젝트 폴더를 탐색**하고, 터미널 출력을 깔끔한 마크다운으로 받아보세요!

## ✨ 주요 기능

- 📱 **완벽한 모바일 원격 제어**: 데스크탑 앞에 앉아있지 않아도 텔레그램으로 AI에게 코딩 지시, 버그 수정, 문서 작성을 명령할 수 있습니다.
- 📁 **인터랙티브 자동 탐색기**: `/set_project` 명령어를 통해 버튼 클릭만으로 윈도우 드라이브 내의 폴더를 요리조리 탐색하고 작업 폴더로 지정할 수 있습니다.
- 🔄 **다중 세션 아키텍처 (Multi-Session)**: 하나의 봇으로 텔레그램 여러 채팅방에서 동시에 각기 다른 프로젝트(백엔드, 프론트엔드 등)를 완전히 격리된 상태로 제어합니다.
- 🧹 **TUI 찌꺼기 실시간 필터링**: CLI 터미널 특유의 복잡한 이스케이프 코드와 잔여물(`\r`, ANSI 기호 등)을 완벽하게 걸러내어, ChatGPT처럼 깔끔한 마크다운 텍스트만을 전송합니다.
- ⚙️ **동적 메뉴 파싱**: 터미널에 뜨는 옵션 선택 메뉴들을 서버가 실시간으로 읽어들여 텔레그램 인라인 버튼(Inline Keyboard)으로 렌더링해 줍니다.

## 🛠️ 설치 및 실행 방법

### 1. 필수 조건
- Node.js 설치 (v18 이상 권장)
- 텔레그램 앱 및 Bot Token (BotFather를 통해 발급)
- 로컬 머신에 Antigravity CLI 글로벌 설치

### 2. 프로젝트 설정
```bash
git clone https://github.com/dldisud/Antigravity-remote.git
cd Antigravity-remote
npm install
```

### 3. 환경 변수 설정 (`.env`)
루트 디렉터리에 `.env` 파일을 생성하고 텔레그램 봇 토큰을 입력하세요.
```env
TELEGRAM_TOKEN=123456789:YOUR_TELEGRAM_BOT_TOKEN_HERE
```

### 4. 서버 실행
```bash
npm start
```
> 서버가 켜지면 텔레그램에서 봇에게 `/set_project`를 입력하여 첫 프로젝트 세션을 열어보세요!

## 🕹️ 텔레그램 명령어 목록

- `/set_project`: 인라인 탐색기를 열어 작업할 프로젝트 폴더를 설정합니다. (최근 폴더 바로가기, 드라이브 전환 지원)
- `/status`: 현재 세션 폴더, 가동 시간, AI 작업 상태를 보여줍니다.
- `/stop`: 진행 중인 AI 작업을 취소합니다 (ESC 전송).
- `/model`: 모델 선택 메뉴를 엽니다 — 자동으로 텔레그램 버튼으로 변환됩니다.
- `/skills`: 봇이 사용할 수 있는 특수 스킬 목록을 버튼 형태로 띄워줍니다.
- `/clear`: AI의 컨텍스트(대화 기록)를 깔끔하게 초기화합니다.
- `/resume`: 이전 대화 목록을 버튼으로 띄워 이어할 수 있습니다.
- `/up` `/down` `/enter` `/esc`: TUI 메뉴를 직접 조작할 수 있는 수동 키 입력.
- `/close`: 현재 연결된 프로젝트 봇 세션을 즉시 종료하여 메모리를 아낍니다.
- `/help`: 전체 사용법을 보여줍니다.

> 터미널에 뜨는 모든 선택 메뉴(폴더 신뢰 확인, 모델 선택, 권한 요청 등)는 자동으로 인라인 버튼으로 변환됩니다.
