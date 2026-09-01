# 크리에이터 대시보드 (template-creator-dashboard)

내 인스타그램 계정의 게시물·팔로워 추이·콘텐츠 기둥과, 참고할 계정들의 대박 릴스(레퍼런스)를 한 화면에 모아 보는 대시보드입니다. 서버·데이터베이스 없이 파일로만 돌아가고, GitHub이 매일·3일·매주 대신 수집해 Vercel 주소로 보여줍니다.

이 저장소는 템플릿입니다. 개인 데이터는 비어 있고(샘플만), 다운로드해서 실행하면 Claude Code가 단계별로 본인 것을 채워 넣습니다.

## 시작 — Claude Code에 이 한 줄을 붙여넣으세요

> https://github.com/gfmmmm/template-creator-dashboard 에 있는 대시보드를 다운받아서 구축 가이드(SETUP.md)대로 한 단계씩 진행해줘. 나는 AI 초보자니까 쉽게 설명해줘.

> **AI 에이전트에게:** `SETUP.md` 를 열어 0단계부터 진행하세요. `.setup-progress.json` 이 있으면 그 다음 단계부터 이어갑니다. 수업 중이라 "N단계까지 진행해줘"라고 했다면 N단계 검증을 통과한 뒤 멈춥니다.

## Claude Code에게 — 사용자가 이 링크를 주면서 "다운받아서 구축 가이드대로 진행해줘"라고 했다면

1. 사용자에게 폴더를 어디에 둘지 묻는다(기본: 바탕화면의 `creator-dashboard`).
2. ZIP을 받아 푼다: `curl -L -o cd.zip https://github.com/gfmmmm/template-creator-dashboard/archive/refs/heads/main.zip && unzip -q cd.zip && mv template-creator-dashboard-main <폴더> && rm cd.zip`
3. 사용자에게 딱 두 줄 안내한다 — "폴더가 생겼어요. VS Code에서 위 메뉴 파일 → 폴더 열기로 그 폴더를 연 다음, 왼쪽 Claude 패널에서 새 대화를 시작해 '구축 가이드대로 진행해줘'라고 말해주세요." (이 폴더의 규칙과 가이드는 그 폴더를 열어야 읽힌다. 터미널을 쓰는 사람이면 그 폴더에서 `claude`를 실행해도 같다.)
4. 그 폴더에서 열린 Claude Code는 `SETUP.md`를 읽고 0단계부터 진행한다.

## 필요한 것

- VS Code(또는 Antigravity 같은 VS Code 계열) + Claude Code 확장, 로그인까지(유료 플랜). 설치: https://docs.claude.com/ko/docs/claude-code/overview
- 공개 상태의 인스타그램 계정
- 계정 4개 — 세팅 중에 Claude가 하나씩 만들게 안내합니다: GitHub(보관·자동화) · Vercel(웹 주소) · ScrapeCreators(수집) · Gemini(분석, 무료)
- Mac 또는 Windows(Windows는 Git for Windows가 있어야 함 — Claude Code 요구사항). Node 22는 없으면 Claude가 설치 안내

## 설치 — 세 줄

1. 오른쪽 위 초록 `Code` → `Download ZIP` → 압축을 풀어 원하는 곳에 둡니다
2. VS Code에서 파일 → 폴더 열기로 그 폴더를 열고, 왼쪽 Claude 패널을 켭니다
3. 이렇게 말합니다: **"구축 가이드대로 진행해줘"**

Claude Code가 [SETUP.md](SETUP.md)의 8단계를 하나씩 이끌어 줍니다. 넉넉히 50분. 컴퓨터 쪽 일은 Claude가 하고, 본인은 가입·클릭·붙여넣기만 합니다. 중간에 쉬어도 돼요 — "이어서 해줘".

## 일상에서 쓰는 말

| 말 | 하는 일 |
|---|---|
| 대시보드 열어줘 | 내 컴퓨터에서 보기 |
| 데이터 가져와줘 | 내 계정 최신 수집 (ScrapeCreators 약 10크레딧) |
| 레퍼런스 가져와줘 | 소스 계정에서 대박 릴스 찾기 |
| 레퍼런스 분석해줘 | 발굴된 릴스가 왜 터졌는지 AI 분석 |
| 내 릴스 코칭해줘 | 상위 릴스를 AI가 보고 강점·개선점 → 게시물 모달 |
| 채널 정체성 자동 분석해줘 | 내 채널이 어떤 채널인지 글로 정리 → 설정 탭 |
| 기둥 정해서 분류해줘 | 콘텐츠 기둥 4~5개 정하고 전체 분류 |
| 발굴 기준을 5만으로 낮춰줘 | 레퍼런스가 잘 안 잡힐 때 문턱 낮추기 |
| 올려줘 | 인터넷 주소에 반영 (push → Vercel 자동 배포) |
| 자동화 켜줘 | GitHub Actions에 키 등록 + 첫 실행 |
| 되돌려줘 | 뭔가 이상해지면 직전 상태로 |

## 자동으로 도는 것

손 안 대도 매일 아침 팔로워 기록, 3일마다 레퍼런스 발굴, 월요일마다 전체 수집·분석이 GitHub Actions에서 돕니다. 저장소 **Actions** 탭에서 확인할 수 있어요.

두 달 동안 아무 활동이 없으면 GitHub이 자동화를 잠재웁니다. **두 달에 한 번은 "올려줘"** 한 번 해주세요.

## 화면

- 🏠 내 계정 — 프로필 · 팔로워/업로드 추이 · 콘텐츠 기둥 도넛 · 전체 게시물(정렬·필터·검색) · 게시물 모달(대본 · 영상 코칭)
- 🔬 레퍼런스 — 소스 계정들의 대박 릴스 그리드 · 모달(왜 터졌나 · 대본)
- ⚙️ 설정 — 채널 정체성 · 기둥 · 소스 계정 · 자동화 상태 · 크레딧. 읽기 전용이고 각 항목에 "Claude에게 이렇게 말하세요"

## 폴더 구조

```
(이 폴더)
├── SETUP.md                 구축 가이드 — Claude Code가 읽고 안내
├── index.html · js/         화면 (빌드 없음, 라이브러리 없음)
├── data/                    데이터 4개 + 썸네일. settings.json만 사람이, 나머지는 봇이
├── scripts/                 수집·분석 9개 (의존성 0, Node 22)
├── .github/workflows/       매일 · 3일 · 매주 자동 실행
├── .claude/CLAUDE.md        이 폴더에서 Claude Code가 지킬 규칙·명령
├── docs/                    결정 기록 · 기능 레시피
├── sample/                  교체용 샘플 데이터(뷰티·지식·일상) — 수집이 막혔을 때 "샘플 뷰티 데이터로 바꿔줘" (sample/교체방법.md)
└── .env.example             키 2개 양식 (실제 값은 .env, 커밋 안 됨)
```

## 비용

- ScrapeCreators: 월 370크레딧 안팎(매일 스냅샷 30 + 3일 발굴 200 + 주간 수집 80 + 분석 60). 아래 "크레딧 채우기" 참조
- Gemini: 무료 한도 안
- GitHub·Vercel: 무료

## 크레딧 채우기 (ScrapeCreators)

가입하면 주는 무료 100개는 첫 주 분량입니다. app.scrapecreators.com → Dashboard 의 **Bonus credits** 로 최대 **7,000개**를 무료로 더 받을 수 있어요 — 피드백 남기기 · GitHub 스타 · G2 후기. 그래도 모자라면 **$47에 25,000개**(이 대시보드 기준 5년치)입니다.

## 파일 주인 — 누가 어느 파일을 고치는가

- `data/settings.json` 은 **내가**(정확히는 Claude가 나 대신) 고치는 파일입니다 — 채널 정체성 · 기둥 · 소스 계정 · 숨김 · 발굴 기준.
- `data/posts.json` · `discoveries.json` · `analysis.json` 은 **스크립트와 자동화 봇이** 쓰는 파일입니다. 직접 고치지 마세요 — 다음 자동 실행 때 충돌합니다. 바꾸고 싶으면 "M-012는 ○○ 기둥으로 바꿔줘"처럼 말로 시키면 Claude가 `settings.json` 쪽에 기록합니다.
- `.env` 는 키를 담은 파일이라 GitHub에 올라가지 않습니다.

## 막힐 때

- 화면이 안 뜸 → 브라우저로 `index.html` 을 직접 열면 안 됩니다. "대시보드 열어줘"라고 말하세요.
- "비공개 계정" → 인스타 설정에서 계정을 공개로 바꾸세요.
- 레퍼런스가 0건 → "발굴 기준을 5만으로 낮춰줘".
- Actions에 빨간 X → 키가 만료됐거나 크레딧이 0입니다. "자동화 켜줘"로 키를 다시 등록하세요.
- 그래도 안 되면 → 대화 화면을 캡처해서 강사님께 보여주세요.

## 기능을 더 붙이고 싶을 때

Claude에게 말로 시키면 됩니다. Claude는 [.claude/CLAUDE.md](.claude/CLAUDE.md)의 분류표대로 "바로 되는 것 / 크레딧이 드는 것 / 이 구조에선 안 되는 것(저장·로그인·실시간)"을 구분해 답합니다. 예시는 [docs/기능-레시피.md](docs/기능-레시피.md).

## 함께 쓰는 도구

- 릴스 대본 기획 — 이 대시보드의 데이터로 훅·대본·촬영 표: https://github.com/gfmmmm/template-reels-planner
- 대본추출 — 릴스 주소에서 음성을 글로: https://github.com/gfmmmm/claude-video-transcript
