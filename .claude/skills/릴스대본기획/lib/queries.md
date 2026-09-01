# 조회 레시피 (스킬이 언제 무엇을 부르는지)

| 시점 | 명령 | 용도 |
|---|---|---|
| 모드 확인이 필요할 때 | `bash lib/fetch.sh mode` | `supabase` / `json` / `manual` 중 현재 모드를 한 줄로 출력 |
| 시작 직후 항상 | `bash lib/fetch.sh ctx` | 정체성·기둥·평균 조회·카드 번호 범위 |
| 시작 직후 항상 | `bash lib/fetch.sh pillars` | 기둥 미달 확인 → 기획 포인트에 반영 |
| R 번호 입력 시 | `bash lib/fetch.sh card R-###` | 레퍼런스 카드 전문 |
| 자유 주제 입력 시 | `bash lib/fetch.sh refs "키워드"` | 조회 상위 15건을 키워드 밀도로 재정렬해 최대 7건 자동 로드 (키워드 2~3개로 나눠 여러 번 가능) |
| 대표대본 갱신 요청 시 | `bash lib/fetch.sh my_top 500000` | 50만+ 릴스 대본 → 계정 폴더/대표대본/ 갱신 |

실행 위치: 항상 작업 폴더(`.env` 가 있는 곳)에서 `bash .claude/skills/릴스대본기획/lib/fetch.sh ...`.
의존: bash, curl(supabase 모드만), python3.

## 모드

`.env` 내용에 따라 세 모드 중 하나로 자동 전환된다. 다섯 명령(ctx·pillars·card·my_top·refs)의 **출력 형식은 모드와 무관하게 동일**하다 — 스킬은 어느 모드인지 신경 쓰지 않고 그대로 읽으면 된다.

| 모드 | 조건 | 동작 |
|---|---|---|
| `supabase` | `.env`에 `SUPABASE_URL`이 있음 | Supabase REST(`SUPABASE_URL`/`SUPABASE_KEY`)로 조회 |
| `json` | `SUPABASE_URL`은 없고 `DASHBOARD_DIR=<경로>`만 있음 | `<경로>/data/settings.json · posts.json · discoveries.json · analysis.json` 을 python3로 직접 읽어 같은 형식으로 출력 |
| `manual` | `.env` 파일 자체가 없음(또는 둘 다 없음) | 모든 명령이 `ℹ️ .env 없음 — 수동 모드입니다. SKILL.md '데이터' 절대로 진행하세요.` 한 줄을 내고 exit 0 (❌·exit 1 아님 — 스킬이 여기서 멈추지 않게) |

`bash lib/fetch.sh mode` 로 현재 모드를 바로 확인할 수 있다. `json` 모드에서 `DASHBOARD_DIR/data/posts.json`이 없으면(대시보드 폴더 경로가 틀린 경우) `❌ ... 이 없습니다 — 대시보드 폴더가 맞는지 확인` 후 exit 1.

모드 자동 판별 순서: `.env`의 `SUPABASE_URL` → `DASHBOARD_DIR` → 같은 폴더의 `data/posts.json`(통합 번들, .env 불필요) → 그 외 수동 모드.
