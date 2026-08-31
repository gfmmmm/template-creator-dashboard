# 구축 가이드 — Claude Code가 읽고 사용자를 이끄는 대본

이 문서는 사람이 읽는 설명서이면서, 동시에 이 폴더에서 실행된 Claude Code가 그대로 따라가는 실행 지시서다.
사용자가 "구축 가이드대로 진행해줘", "세팅해줘", "처음이에요", "이어서 해줘"라고 하면 Claude Code는 이 문서를 열고 0단계부터 한 단계씩 진행한다.

아직 이 폴더를 받기 전(링크만 있는 상태)이면 README.md의 "Claude Code에게" 절이 먼저다.

## Claude Code가 지킬 원칙 (전 단계 공통)

1. 터미널은 Claude가, 브라우저는 사용자가. 사용자에게 명령어를 치게 하거나 파일을 열어 고치게 하지 않는다. 키·경로는 채팅에 붙이면 Claude가 파일에 쓴다.
2. 한 메시지에 행동 하나. 단계 끝은 항상 "다 되셨으면 '됐어요'라고 답해주세요" 한 문장으로 끝낸다.
3. 확인 전에는 다음 단계로 가지 않는다. 단계마다 "검증" 항목을 기계로 확인한다.
4. 왜 하는지 한 줄. 길면 안 읽는다.
5. 진행 상태를 `.setup-progress.json`에 기록한다. 창을 닫고 나중에 "이어서 해줘"라고 하면 거기서 다시 시작한다.
6. 사용자를 부르는 호칭은 쓰지 않는다. 존댓말. 전문 용어는 괄호로 풀어 쓴다 — 예: API 키(서비스를 쓰게 해주는 열쇠).
7. `.env`의 값은 채팅에 다시 출력하지 않는다. 사용자가 키를 붙이면 "저장했어요"만 말한다.
8. 화면이 설명과 다르다고 하면 스크린샷을 부탁하고 그걸 보고 안내한다. 추측으로 넘어가지 않는다.
9. 한 단계가 15분을 넘기면 "여기서 잠깐 쉬어도 돼요. 나중에 '이어서 해줘'라고 하시면 됩니다"라고 말한다.

진행 파일 형식:

```json
{ "step": 3, "done": [0, 1, 2], "handle": "", "repo": "", "url": "", "os": "mac | windows", "updatedAt": "YYYY-MM-DD" }
```

전체 8단계, 넉넉히 50분. 계정을 만들 때마다 화면에 새 기능이 켜지는 순서로 짰다 — 5분 안에 내 화면을 먼저 보고, 계정 하나 만들 때마다 데이터가 하나씩 들어온다.

---

## 0단계 · 준비 확인 (3~10분)

Claude가 말없이 확인한다. 하나라도 없으면 그것만 설치한다.

| 도구 | 확인 | 없으면 (Mac) | 없으면 (Windows, Git Bash) |
|---|---|---|---|
| Node 22 이상 | `node -v` | `brew install node` (brew 없으면 https://nodejs.org 에서 LTS 설치 안내) | https://nodejs.org 에서 LTS 설치 안내 → 터미널 다시 열기 |
| git | `git --version` | Mac은 기본 있음. 없으면 `xcode-select --install` | Git for Windows에 포함 |
| gh (GitHub 도구) | `gh --version` | `brew install gh` | `winget install GitHub.cli` |
| vercel (배포 도구) | `vercel --version` | `npm i -g vercel` | `npm i -g vercel` |

설치는 Claude가 실행한다. 관리자 비밀번호 창이 뜨면 "컴퓨터 비밀번호를 입력해주세요(화면에는 안 보여요)"라고 안내한다.
gh·vercel은 5·6단계에서 쓰니 0단계에서 설치가 안 되면 그때 다시 시도하고 넘어간다.

`.setup-progress.json`이 있으면 읽고 "지난번에 N단계까지 하셨네요. 이어서 갈게요".

사용자에게 할 말:

> 크리에이터 대시보드를 세팅할게요. 8단계, 넉넉히 50분이에요. 컴퓨터 쪽은 제가 다 하고, 회원가입 같은 브라우저 일만 부탁드릴게요. 중간에 쉬어도 돼요 — 다음에 "이어서 해줘"라고 하시면 됩니다.

검증: `node -v`가 v22 이상. 진행 파일 생성(os 기록).

---

## 1단계 · 로컬에서 먼저 보기 (3분)

계정 하나도 만들기 전에 화면을 먼저 보게 한다. 지금 들어 있는 건 샘플 데이터다.

Claude가 한다: `node scripts/serve.js`를 백그라운드로 실행 → 브라우저가 열린다(안 열리면 http://localhost:8787 을 안내).

> 지금 보이는 건 샘플 계정 화면이에요. 탭이 세 개죠 — 내 계정, 레퍼런스, 설정. 잠시 둘러보시고, 다음 단계부터 이걸 회원님 데이터로 바꿔요. 다 보셨으면 '됐어요'라고 해주세요.

검증: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/`가 200. 서버는 계속 켜 둔다(3단계에서 새로고침으로 변화를 보여준다).

---

## 2단계 · ScrapeCreators 가입·키 (7분)

인스타그램 데이터를 대신 읽어주는 서비스다. 이게 있어야 내 릴스가 대시보드에 뜬다.

> 2단계예요. 인스타 데이터를 대신 읽어주는 서비스 ScrapeCreators에 가입해서 열쇠(API 키)를 하나 받아올게요. 약 7분이에요.
>
> 1. 새 탭에서 열어주세요: https://scrapecreators.com
> 2. 오른쪽 위 Sign Up(또는 Get Started)으로 이메일 가입. 구글 로그인이 보이면 그걸 쓰셔도 돼요.
> 3. 로그인하면 대시보드에 API Key라고 적힌 긴 글자열이 보여요. 옆의 복사 버튼을 눌러주세요.
> 4. 복사한 걸 이 채팅창에 붙여넣고 엔터. 제가 안전한 파일에 저장하고 채팅에서는 다시 안 보이게 할게요.

키가 오면 Claude가 한다: `.env`에 `SCRAPECREATORS_API_KEY=<값>` 기록(파일 없으면 `.env.example`을 복사해 만든다). 키 검증 — 프로필 조회 1회(`node -e`로 lib.js의 SC 래퍼를 불러 아무 공개 계정 하나 조회, 1크레딧). 응답에서 남은 크레딧을 읽어 말해준다.

> 잘 됐어요. 무료 크레딧이 N개 남아 있어요. 한 달에 약 370개가 들어서, 무료로 더 받는 방법을 알려드릴게요 — ScrapeCreators 대시보드의 Bonus Credits(피드백 남기기·GitHub 스타 등, 최대 수천 개 무료). 지금 할까요, 세팅 끝나고 할까요?

검증: `.env`에 키 있음, 조회 200, 크레딧 잔량 숫자 확인. 진행 파일에 step=2.

막힐 때: 401이면 키를 잘못 복사한 것 — "키 전체를 다시 복사해 붙여주세요(앞뒤 공백 없이)". 가입 이메일 인증이 안 끝났으면 메일함 확인 안내.

---

## 3단계 · 내 데이터 수집 (3분)

> 인스타그램 아이디(@ 뒤의 영문)를 알려주세요. 계정이 공개 상태여야 읽을 수 있어요 — 비공개면 설정에서 잠시 공개로 바꿔주세요.

Claude가 한다:
1. `data/settings.json`의 `handle`을 그 값으로(샘플 값 교체). `sources`는 비운다(4단계 뒤에 채움). `pillars`는 샘플 그대로 두되 4단계에서 다시 정한다
2. `TRANSCRIPT_MAX=5 node scripts/collect.js` (첫 수집 — 대본은 5건만 뽑아 크레딧 절약)
3. 끝나면 `posts.json`을 읽어 "게시물 N건, 팔로워 N명, 역대 최고 조회 N" 말해주고 브라우저 새로고침을 부탁

> 회원님 계정이 들어왔어요. 브라우저를 새로고침(Mac: Cmd+R, Windows: F5)해 보세요. 내 계정 탭에 회원님 게시물이 보이면 '됐어요'.

검증: `posts.json`의 `my.profile.handle`이 입력값, `my.posts` 1건 이상. 진행 파일에 handle.

막힐 때: 0건이면 계정이 비공개거나 아이디 오타 — 인스타 앱에서 프로필 → 설정 → 계정 공개 범위 확인. SC 크레딧 4xx면 잔량 출력 후 2단계의 보너스 크레딧 안내.

---

## 4단계 · Gemini 키 + 채널 정체성 (5분)

Gemini는 구글의 AI다. 릴스 영상을 보고 분석하고, 내 채널이 어떤 채널인지 글로 정리해 준다. 무료다.

> 4단계예요. 구글 AI(Gemini) 열쇠를 받아올게요. 무료고 2분이면 돼요.
>
> 1. 새 탭: https://aistudio.google.com
> 2. 구글 계정으로 로그인 → 왼쪽 위 또는 화면 중앙의 Get API key → Create API key
> 3. 프로젝트를 고르라고 하면 "Create API key in new project"
> 4. 나온 키(AIza… 또는 AQ.… 로 시작)를 복사해서 여기 붙여주세요.

키가 오면 Claude가 한다: `.env`에 `GEMINI_API_KEY` 기록 → 텍스트 1회 호출로 검증 → `node scripts/brief.js`(채널 정체성 400~700자 생성) → 결과를 보여주고 묻는다.

> 회원님 채널을 이렇게 읽었어요. (brief 전문) — 틀린 곳이 있으면 말씀해 주세요. 고쳐서 저장할게요.

고치면 `settings.brief`에 반영. 이어서 기둥을 정한다.

> 콘텐츠 기둥(내 콘텐츠를 나누는 큰 갈래)을 4~5개 정할게요. 게시물을 보고 제가 제안할게요: (제안 4~5개와 목표 비율). 이대로 갈까요, 바꿀까요?

합의되면 `settings.pillars` 기록 → `node scripts/classify.js` → "설정 탭의 도넛이 채워졌어요. 새로고침해 보세요."

마지막으로 소스 계정(레퍼런스로 삼을 잘 되는 계정)을 묻는다.

> 참고하고 싶은 인스타 계정을 5~10개 알려주세요(@아이디). 비슷한 분야에서 잘 되는 계정이면 좋아요.

`settings.sources`에 기록(@ 제거, 최대 10) → `node scripts/discover.js`(첫 수집, 2분 안팎) → "레퍼런스 탭에 N건이 들어왔어요."

검증: `.env`에 GEMINI 키, `settings.brief` 400자 이상, `analysis.pillars`에 분류 있음, `discoveries.json` items 1건 이상. 진행 파일 step=4.

막힐 때: Gemini 지역 제한 오류면 구글 계정의 국가 설정 확인 안내. 발굴 0건이면 두 가지를 차례로 — ① `settings.minViews`를 절반으로(사용자에게 "기준을 5만으로 낮춰볼까요?") ② 그래도 0건이면 `DISCOVER_MEDIAN_MULT=1 node scripts/discover.js`(소스 계정 평소 조회의 1배부터 걸리게). 소스 계정이 작은 채널이면 흔한 일이라고 안심시킨다.

---

## 5단계 · GitHub — 저장소 만들기 (10분)

지금까지 만든 데이터는 이 컴퓨터에만 있다. GitHub에 올려두면 컴퓨터가 꺼져도 남고, 7단계의 자동화가 여기서 돈다. 5·6단계에서 가장 많이 막히니 천천히 간다.

> 5단계예요. 코드와 데이터를 보관해 주는 GitHub에 가입하고, 회원님 전용 저장소(폴더)를 만들게요. 10분이에요.
>
> 1. 새 탭: https://github.com/signup — 이메일·비밀번호·사용자명(영문)으로 가입. 인증 메일의 코드를 입력하면 끝.
> 2. 가입이 끝났으면 '됐어요'라고 해주세요. 그다음 제가 터미널에서 로그인 창을 열 거예요.

'됐어요'가 오면 Claude가 한다: `gh auth login --web -p https` 실행 → 화면에 8자리 코드(XXXX-XXXX)가 뜬다.

> 화면에 코드가 떴어요: XXXX-XXXX. 엔터를 누르면 브라우저가 열려요(안 열리면 https://github.com/login/device). 거기에 이 코드를 넣고 Authorize를 눌러주세요.

로그인 확인(`gh auth status`) 후:
1. `git init`(이미 있으면 생략), `git config user.name/email`을 GitHub 계정 값으로(`gh api user`에서 읽음)
2. `git add -A && git commit -m "첫 세팅"` — `.env`는 .gitignore로 빠진다. 커밋 전 `git status`에 `.env`가 없는지 반드시 확인
3. `gh repo create creator-dashboard --private --source=. --remote=origin --push`
4. `gh repo view --web`로 저장소 페이지를 열어 보여준다

> 회원님 저장소가 생겼어요: https://github.com/<아이디>/creator-dashboard — 비공개라 회원님만 봅니다. 이제 컴퓨터가 꺼져도 데이터가 안 사라져요.

검증: `gh repo view <아이디>/creator-dashboard --json name`, `git status`가 clean, 원격에 `.env` 없음(`gh api repos/.../contents/.env`가 404). 진행 파일 repo.

막힐 때:
- Windows에서 `gh auth login`이 브라우저를 못 열면 주소를 직접 안내(https://github.com/login/device)
- "Repository name already exists" → 이름 뒤에 숫자를 붙여 다시(`creator-dashboard-2`)
- push가 인증 오류면 `gh auth setup-git` 후 재시도
- 30분 넘게 막히면 5·7단계를 건너뛰고 6단계를 CLI 방식(아래)으로 간다. 자동화는 나중에

---

## 6단계 · Vercel — 웹 주소 만들기 (7분)

Vercel은 GitHub에 있는 파일을 웹 주소로 보여주는 서비스다. 무료. 한 번 연결하면 GitHub이 바뀔 때마다 알아서 갱신된다.

> 6단계예요. 대시보드를 인터넷 주소로 만들게요. 폰에서도 열 수 있어요. 7분이에요.
>
> 1. 새 탭: https://vercel.com/signup — Continue with GitHub 을 눌러 아까 만든 GitHub 계정으로 가입(비밀번호 새로 안 만들어도 돼요).
> 2. 가입 후 Add New… → Project.
> 3. 왼쪽 Import Git Repository 목록에 creator-dashboard 가 보이면 옆의 Import. 안 보이면 "Adjust GitHub App Permissions"를 눌러 저장소 접근을 허용해주세요.
> 4. 설정 화면에서 Framework Preset은 Other 그대로, 다른 건 건드리지 말고 Deploy.
> 5. 1분쯤 뒤 축하 화면이 나오면 Continue to Dashboard → 화면 위쪽 Domains 아래 주소(…vercel.app)를 복사해서 여기 붙여주세요.

주소가 오면 Claude가 한다: `curl -s -o /dev/null -w "%{http_code}" <주소>` → 200이면 성공. 진행 파일 url.

> 됐어요: <주소>. 폰에서 이 주소를 열어 보세요 — 같은 화면이 나오면 성공이에요. 이제 GitHub에 올릴 때마다 이 주소가 자동으로 새로워져요.

검증: 주소 200, 본문에 "크리에이터 대시보드" 문자열.

막힐 때:
- 401이 나오면 Vercel의 보호 설정이 켜진 것 → "Vercel 프로젝트 → Settings → Deployment Protection → Vercel Authentication 을 Disabled 로 → Save" 안내 후 다시 curl
- 저장소가 목록에 안 보이면 GitHub App 권한(3번) 재안내
- GitHub 없이 가는 경우(5단계 실패): `vercel login`(브라우저 확인) → `vercel --prod --yes` → 나온 주소. 이 경우 갱신은 "배포해줘"로 수동

---

## 7단계 · 자동화 켜기 (5분)

이제부터는 손 안 대도 매일·3일·매주 GitHub이 대신 수집하고 Vercel이 갱신한다.

Claude가 한다(사용자는 할 일 없음):
1. `.env`의 키 2개를 저장소 시크릿으로: `gh secret set SCRAPECREATORS_API_KEY -R <아이디>/creator-dashboard < (값)` , `GEMINI_API_KEY`도 같이. 값은 파일에서 읽어 파이프로 넘긴다 — 채팅에 출력 금지
2. `gh workflow run weekly.yml -R <아이디>/creator-dashboard`
3. `gh run list -R … -L 1`로 실행 시작 확인 → Actions 탭 주소 안내

> 자동화를 켰어요. 지금 첫 실행이 돌고 있어요(5~10분). 여기서 볼 수 있어요: https://github.com/<아이디>/creator-dashboard/actions — 초록 체크가 뜨면 성공이고, 몇 분 뒤 웹 주소도 새로워져요.
> 앞으로는 매일 아침 팔로워 기록, 3일마다 레퍼런스 발굴, 월요일마다 전체 수집·분석이 알아서 돕니다.

검증: `gh run list` 에 in_progress 또는 completed. 진행 파일 step=7.

마지막 안내 (사용자가 기억할 다섯 마디):

> 세팅 끝이에요. 기억하실 건 다섯 마디예요.
> - "대시보드 열어줘" — 내 컴퓨터에서 보기
> - "데이터 가져와줘" → "올려줘" — 지금 당장 갱신하고 웹에 반영
> - "내 릴스 코칭해줘" — 내 릴스 영상을 AI가 보고 강점·개선점
> - "R-012 참고해서 기획해줘" — 레퍼런스 번호로 기획(릴스 대본 기획 도구가 있으면)
> - "되돌려줘" — 뭔가 이상해지면
>
> 두 달 동안 아무 활동이 없으면 GitHub이 자동화를 잠재워요. 두 달에 한 번은 "올려줘" 한 번 해주세요.

---

## 막힐 때 — 자주 걸리는 것

| 증상 | 원인 | Claude가 하는 것 |
|---|---|---|
| 브라우저에 화면이 안 뜨고 "데이터 로딩 중" | JSON 파싱 오류 또는 캐시 | `python3 -c "import json; json.load(open('data/posts.json'))"`로 4개 파일 확인 → 시크릿 창으로 열기 안내 |
| 수집 0건 | 인스타 비공개 / 아이디 오타 / 크레딧 소진 | 3단계 막힐 때 참조. 크레딧이면 잔량 출력 |
| SC 4xx | 크레딧 소진 | 보너스 크레딧 안내. Actions는 다음 주기에 재시도됨 |
| Gemini 오류 | 무료 한도·지역 | 그 단계만 건너뛰고 나중에 "레퍼런스 분석해줘"로 재시도 |
| Vercel 401 | Deployment Protection | 6단계 막힐 때 |
| Vercel 배포가 "Blocked — commit email …" | 커밋 이메일이 GitHub 계정과 불일치 | `git config user.email`을 GitHub 계정 이메일로 맞추고 빈 커밋 후 push |
| "올려줘"에서 충돌 | 봇 커밋과 겹침 | `git pull --rebase` → data/posts·discoveries·analysis.json 충돌은 원격(봇) 것을 받고(`git checkout --theirs`) 로컬 스크립트 재실행 |
| Actions 빨간 X 메일 | 시크릿 누락 또는 크레딧 | 7단계 시크릿 재등록. Actions 로그 마지막 20줄을 읽고 안내 |
| 두 달 뒤 자동화 멈춤 | GitHub 60일 무활동 비활성 | "올려줘" 한 번, 또는 Actions 탭에서 Enable |
