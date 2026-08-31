# 크리에이터 대시보드 (template-creator-dashboard)

내 인스타그램 계정의 게시물·팔로워 추이·콘텐츠 기둥과, 참고할 계정들의 대박 릴스(레퍼런스)를 한 화면에 모아 보는 대시보드입니다. 서버·데이터베이스 없이 파일로만 돌아가고, GitHub이 매일·3일·매주 대신 수집해 Vercel 주소로 보여줍니다.

이 저장소는 템플릿입니다. 개인 데이터는 비어 있고(샘플만), 다운로드해서 실행하면 Claude Code가 단계별로 본인 것을 채워 넣습니다.

## Claude Code에게 — 사용자가 이 링크를 주면서 "다운받아서 구축 가이드대로 진행해줘"라고 했다면

1. 사용자에게 폴더를 어디에 둘지 묻는다(기본: 바탕화면의 `creator-dashboard`).
2. ZIP을 받아 푼다: `curl -L -o cd.zip https://github.com/<소유자>/template-creator-dashboard/archive/refs/heads/main.zip && unzip -q cd.zip && mv template-creator-dashboard-main <폴더> && rm cd.zip`
3. 사용자에게 딱 두 줄 안내한다 — "폴더가 생겼어요. 터미널에서 `cd <폴더>` 를 치고 `claude` 를 다시 실행한 뒤, '구축 가이드대로 진행해줘'라고 말해주세요." (이 폴더의 규칙과 가이드는 그 폴더에서 열어야 읽힌다.)
4. 그 폴더에서 열린 Claude Code는 `SETUP.md`를 읽고 0단계부터 진행한다.

## 필요한 것

- Claude Code (유료 플랜). 설치: https://docs.claude.com/ko/docs/claude-code/overview
- 공개 상태의 인스타그램 계정
- 계정 4개 — 세팅 중에 Claude가 하나씩 만들게 안내합니다: GitHub(보관·자동화) · Vercel(웹 주소) · ScrapeCreators(수집) · Gemini(분석, 무료)
- Mac 또는 Windows(Git Bash). Node 22 (없으면 Claude가 설치 안내)

## 설치 — 세 줄

1. 오른쪽 위 초록 `Code` → `Download ZIP` → 압축을 풀어 원하는 곳에 둡니다
2. 그 폴더에서 터미널을 열고 `claude` 실행
3. 이렇게 말합니다: **"구축 가이드대로 진행해줘"**

Claude Code가 [SETUP.md](SETUP.md)의 8단계를 하나씩 이끌어 줍니다. 넉넉히 50분. 컴퓨터 쪽 일은 Claude가 하고, 본인은 가입·클릭·붙여넣기만 합니다. 중간에 쉬어도 돼요 — "이어서 해줘".

## 쓰는 법 — 다섯 마디

- "대시보드 열어줘" — 내 컴퓨터에서 보기
- "데이터 가져와줘" → "올려줘" — 지금 갱신해서 웹에 반영
- "내 릴스 코칭해줘" — 내 릴스 영상을 AI가 보고 강점·개선점
- "레퍼런스 분석해줘" — 발굴된 릴스가 왜 터졌는지
- "되돌려줘" — 뭔가 이상해지면

손 안 대도 매일 아침 팔로워 기록, 3일마다 레퍼런스 발굴, 월요일마다 전체 수집·분석이 GitHub에서 알아서 돕니다. 두 달 동안 활동이 없으면 GitHub이 자동화를 잠재우니, 두 달에 한 번 "올려줘".

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

- ScrapeCreators: 월 370크레딧 안팎(매일 스냅샷 30 + 3일 발굴 200 + 주간 수집 80 + 분석 60). 무료 100 + 보너스(피드백·GitHub 스타 등) 최대 수천. 부족하면 $47에 25,000(수 년치)
- Gemini: 무료 한도 안
- GitHub·Vercel: 무료

## 기능을 더 붙이고 싶을 때

Claude에게 말로 시키면 됩니다. Claude는 [.claude/CLAUDE.md](.claude/CLAUDE.md)의 분류표대로 "바로 되는 것 / 크레딧이 드는 것 / 이 구조에선 안 되는 것(저장·로그인·실시간)"을 구분해 답합니다. 예시는 [docs/기능-레시피.md](docs/기능-레시피.md).

## 함께 쓰는 도구

- 릴스 대본 기획 — 이 대시보드의 데이터로 훅·대본·촬영 표: https://github.com/gfmmmm/template-reels-planner
- 대본추출 — 릴스 주소에서 음성을 글로: https://github.com/gfmmmm/claude-video-transcript
