<div align="center">
  <h1>🚀 Antigravity Remote Controller</h1>
  <p><b>강력한 AI 코딩 에이전트 Antigravity CLI를 텔레그램으로 완벽하게 제어하는 스마트 원격 컨트롤러</b></p>
</div>

## 🌌 소개 (Overview)

**Antigravity Remote**는 구글 딥마인드 팀이 개발한 AI 코딩 어시스턴트인 `Antigravity CLI`를 텔레그램 메신저를 통해 언제 어디서든 스마트폰으로 제어할 수 있게 해주는 혁신적인 브릿지 서버입니다.

키보드 타이핑 없이 오직 텔레그램의 **인라인 버튼 클릭만으로 프로젝트 폴더를 탐색**하고, 터미널 출력을 깔끔한 마크다운으로 받아보세요!

## ✨ 주요 기능 (Key Features)

- 📱 **완벽한 모바일 원격 제어**: 데스크탑 앞에 앉아있지 않아도 텔레그램으로 AI에게 코딩 지시, 버그 수정, 문서 작성을 명령할 수 있습니다.
- 📁 **인터랙티브 자동 탐색기**: `/set_project` 명령어를 통해 버튼 클릭만으로 윈도우 드라이브 내의 폴더를 요리조리 탐색하고 작업 폴더로 지정할 수 있습니다.
- 🔄 **다중 세션 아키텍처 (Multi-Session)**: 하나의 봇으로 텔레그램 여러 채팅방에서 동시에 각기 다른 프로젝트(백엔드, 프론트엔드 등)를 완전히 격리된 상태로 제어합니다.
- 🧹 **TUI 찌꺼기 실시간 필터링**: CLI 터미널 특유의 복잡한 이스케이프 코드와 잔여물(`\r`, ANSI 기호 등)을 완벽하게 걸러내어, ChatGPT처럼 깔끔한 마크다운 텍스트만을 전송합니다.
- ⚙️ **동적 메뉴 파싱**: 터미널에 뜨는 옵션 선택 메뉴들을 서버가 실시간으로 읽어들여 텔레그램 인라인 버튼(Inline Keyboard)으로 렌더링해 줍니다.

## 🛠️ 설치 및 실행 방법 (How to Use)

### 1. 필수 조건
- Node.js 설치 (v18 이상 권장)
- 텔레그램 앱 및 Bot Token (BotFather를 통해 발급)
- 로컬 머신에 Antigravity CLI 글로벌 설치

### 2. 프로젝트 설정
```bash
# 레포지토리 클론
git clone https://github.com/dldisud/Antigravity-remote.git
cd Antigravity-remote

# 패키지 설치
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

## 🕹️ 텔레그램 명령어 목록 (Commands)

- `/set_project`: 인라인 탐색기를 열어 작업할 프로젝트 폴더를 설정합니다.
- `/close`: 현재 연결된 프로젝트 봇 세션을 즉시 종료하여 메모리를 아낍니다.
- `/skills`: 봇이 사용할 수 있는 특수 스킬 목록을 버튼 형태로 띄워줍니다.
- `/model`: AI 모델(Gemini, Claude 등)을 변경할 수 있는 버튼을 띄워줍니다.
- `/clear`: AI의 컨텍스트(대화 기록)를 깔끔하게 초기화합니다.

## 👨‍💻 제작 및 기여 (Credits)

- Built with ❤️ using Node.js & node-telegram-bot-api & node-pty.
- 원본 AI 엔진: Antigravity CLI (Google DeepMind)
