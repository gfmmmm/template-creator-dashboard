# 크리에이터 대시보드 — 이 폴더에서 Claude Code가 지킬 것

이 폴더는 인스타 크리에이터의 개인 대시보드다. 사용자는 AI 초보자다. 존댓말로, 전문 용어에는 괄호 설명을 붙이고, 명령어는 사용자가 아니라 Claude가 실행한다.

## 처음 온 사람

사용자가 "구축 가이드대로 진행해줘", "이어서 진행해줘", "세팅해줘", "처음이에요", "이어서 해줘"라고 하면 `SETUP.md`를 열고 그 문서의 원칙과 단계를 그대로 따른다. 한 단계씩, 확인 후 다음으로. `.setup-progress.json`이 있으면 거기서 이어간다.

SETUP.md는 두 부다 — **1부(0~7단계) 대시보드**, **2부(8~10단계) 릴스 대본 기획 도구**. "구축 가이드대로 진행해줘"는 1부다. 7단계 완료 카드 뒤에는 멈춘다 — 2부를 이어 붙이지도, 하자고 묻지도 않는다(한 줄 안내만). 사용자가 "대본 기획 세팅해줘" 또는 "2부 진행해줘"라고 하면 SETUP.md 2부(8단계)부터.

"3단계까지 진행해줘"처럼 **"N단계까지 진행해줘"**라고 하면 N단계의 검증을 통과한 뒤 멈추고 "여기까지입니다. 강사님 지시를 기다려 주세요"라고 말한다(수업에서 구간을 끊어 진행할 때 쓴다 — `SETUP.md` 맨 아래 "수업에서 쓸 때" 절).

## 명령 (사용자가 말로 시키면 이걸 실행)

| 말 | 실행 |
|---|---|
| "대시보드 열어줘" | `node scripts/serve.js` 백그라운드 실행 후 http://localhost:8787 열기 (파일을 직접 열면 fetch가 막힌다) |
| "데이터 가져와줘" | `node scripts/collect.js` |
| "소스 계정으로 @a @b 등록해줘" | `data/settings.json`의 `sources`에 추가(@ 제거, 최대 10) |
| "레퍼런스 가져와줘" | `node scripts/discover.js` |
| "레퍼런스 분석해줘" | `node scripts/analyze.js` |
| "내 릴스 코칭해줘" | `node scripts/coach.js` |
| "채널 정체성 자동 분석해줘" | `node scripts/brief.js` → 결과를 요약해 보여주고 "고칠 곳 있나요?" 묻기 |
| "기둥 정해서 분류해줘" | 사용자와 기둥 4~5개·목표% 합의 → `settings.pillars`에 쓰기 → `node scripts/classify.js` |
| "M-012는 ○○ 기둥으로 바꿔줘" | cardNo로 `posts.json`에서 shortcode를 찾아 `settings.overrides["<shortcode>"] = "○○"` 기록 (analysis.json은 건드리지 않는다) |
| "R-012 숨겨줘" | `settings.hidden`에 "R-012" 추가 |
| "발굴 기준을 5만으로 낮춰줘" | `settings.minViews = 50000` 으로 고치고 `node scripts/discover.js` 재실행 |
| "올려줘" | `git add -A && git commit -m "갱신 YYYY-MM-DD"` → **push 전에 `git pull --rebase` 먼저** → `git push`. 충돌이 data/posts·discoveries·analysis.json에서 나면 원격(봇) 것을 받고(`git checkout --theirs <파일>` → `git add` → `git rebase --continue`) 해당 로컬 스크립트를 다시 실행 |
| "자동화 켜줘" | `.env`의 키 2개를 `gh secret set SCRAPECREATORS_API_KEY -R <owner/repo>` · `GEMINI_API_KEY`로 등록(저장소는 `gh repo view --json nameWithOwner`로 확인, 값은 파일에서 파이프로 — 채팅 출력 금지) → `gh workflow run weekly.yml` → "Actions 탭에서 5~10분 뒤 커밋이 생기고 Vercel이 다시 배포합니다" 안내. 자동화 커밋의 작성자는 워크플로가 저장소 소유자로 맞추므로(무료 Vercel이 봇 커밋을 배포하지 않는다) 따로 할 일은 없다. gh 미로그인이면 `SETUP.md` 5단계의 로그인 절차를 안내한다(그 한 줄만 사용자가 직접 친다) |
| "배포해줘" (GitHub 없이) | `vercel --prod --yes` |
| "점검해줘" | `npm test`(순수 함수 단위 테스트 + 화면↔스크립트 로직 동기화 대조) → `node --check js/*.js scripts/*.js` → 4개 JSON 파싱 → serve.js 띄워 200 확인 → 결과 한 줄씩 |
| "되돌려줘" | 직전에 고친 파일을 원래대로. git이 있으면 `git checkout -- <파일>` 또는 `git revert HEAD`(커밋된 경우). 무엇을 되돌렸는지 한 줄 보고 |
| "대본 기획 세팅해줘" / "2부 진행해줘" | SETUP.md 2부(8~10단계). 1부 4단계 이전이면 "먼저 1부 4단계까지"라고 안내 |
| "대본 써줘" / "R-012 참고해서 기획해줘" / "이 주제로 릴스" | `/릴스대본기획` 스킬. `계정/<핸들>/`이 없으면 "먼저 '대본 기획 세팅해줘'"라고 안내하고 시작하지 않는다 |
| "프로필 다시 만들어줘" | `/계정세팅` 스킬(재갱신) |
| "이건 하지 마" / "이 훅 추가해" / "이 말투 쓰자" / "대표대본 갱신" | `/릴스대본기획`의 성장 동작 — `계정/<핸들>/` 문서만 고친다 |
| "템플릿 업데이트 받아줘" | 원본 템플릿의 최신 ZIP을 받아 `index.html`·`js/`·`scripts/`·`.github/`·`SETUP.md`·`.claude/`·`계정/_template/`만 교체. `data/`·`.env`·`.setup-progress.json`·`계정/<핸들>/`·`기획/`은 절대 건드리지 않는다. 교체 전 현재 것을 `.template-backup/`에 두고, 끝나면 무엇이 바뀌었는지 한 줄 보고 |

## 데이터 — 파일 4개, 주인이 다르다

- 2부(릴스 대본 기획) 파일: `계정/<핸들>/`·`기획/`은 사용자 것 — 스킬의 성장 동작으로만 고친다. `계정/_template/`은 빈 양식(고치지 않음). `.claude/skills/`는 도구 본체.
- 사람(Claude Code)이 고치는 파일은 `data/settings.json` 하나. 나머지 셋(`posts.json`·`discoveries.json`·`analysis.json`)은 스크립트만 쓴다. Claude가 이 셋을 직접 편집하지 않는다 — 봇 커밋과 충돌한다.
- 게시물은 cardNo로 부른다(M-001 내 게시물 / R-001 발굴). 썸네일 경로·shortcode·cardNo는 바꾸지 않는다.
- 기획 도구가 읽는 것: `settings.brief`, `posts.json`, `discoveries.json`(caption·transcript·analysis), `analysis.json`(coaching).
- `.env`는 채팅에 출력하거나 커밋하지 않는다. `.github/workflows`는 건드리지 않는다.

## 기능 요청이 오면 — 이 순서로 분류하고 답한다

| 요청이 이런 거면 | 하는 것 |
|---|---|
| 있는 데이터를 다르게 보여주기(색·문구·카드 순서·새 정렬·새 카드·새 필터) | 바로 만든다. `index.html`·`js/app.js`만 고친다. 라이브러리 추가 금지(CDN 포함). 새 카드는 `.card` 재사용. 고친 뒤 "점검해줘"를 스스로 돌리고, 브라우저 콘솔(Mac Cmd+Option+J / Windows F12)에 빨간 오류가 없는지 사용자에게 확인 부탁 |
| 인스타에서 새 데이터가 필요 | `scripts/`에 새 스크립트(lib.js의 SC 래퍼 사용). 크레딧이 얼마 드는지 먼저 말하고 허락받는다. 매일 돌릴 거면 워크플로우에 넣기 전에 한 번 더 확인 |
| Gemini 분석이 필요 | `analyze.js`·`coach.js` 패턴 복제. 결과는 `analysis.json`의 새 키에 |
| 저장·로그인·여러 명 동시 사용·실시간 반영·웹 화면에서 직접 고치기 | 만들지 않는다. "이 대시보드는 서버 없이 파일로 돌아서, 웹 화면에서 저장하는 기능은 안 돼요. 대신 저한테 말로 시키면 파일을 고치고 올려드려요"라고 말한다. 반쪽(브라우저에만 저장되는 버튼)을 만들지 않는다 |
| 새 외부 서비스 가입이 필요 | 어떤 계정·비용·키가 필요한지 먼저 말하고 사용자가 결정 |

기능을 추가하면 `docs/결정기록.md`에 한 줄 남긴다 — 날짜 · 무엇 · 어느 파일 · 비용(크레딧) · 이유.

## 화면을 고칠 때

- 빌드 없음. `index.html`·`js/app.js`만. 라이브러리 추가 금지(CDN 포함). 새 카드는 `.card` 재사용.
- 날짜 계산·입력 정규화처럼 DOM을 안 쓰는 로직은 `js/app.js`의 `PURE-BLOCK-START ~ PURE-BLOCK-END` 사이에 둔다. `scripts/test/app-pure.test.js`가 그 블록을 떼어 Node에서 검증한다(표식 줄은 지우지 않는다).
- 화면과 스크립트에 같은 규칙이 두 벌 있으면(상업성 정규식·기둥 우선순위) 양쪽을 같이 고친다. `scripts/test/app-sync.test.js`가 어긋남을 잡는다.
- 고친 뒤 `node --check js/app.js`와 serve.js 200 확인. 사용자에게 콘솔 빨간 오류 여부 확인 부탁.

## 하지 않는 것

- 사용자를 부르는 호칭. 존댓말.
- `.env` 값 출력·복사. 봇 파일 3개 직접 편집. 워크플로우 수정.
- "될 것 같아요"로 넘어가기 — 검증 명령을 돌린 결과로만 말한다.
