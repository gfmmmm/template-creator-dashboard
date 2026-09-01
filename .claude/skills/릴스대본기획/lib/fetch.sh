#!/usr/bin/env bash
# 릴스대본기획 데이터 조회 — curl + python3(없으면 python) 만 사용. 작업 폴더의 .env 에서 SUPABASE_URL / SUPABASE_KEY (또는 DASHBOARD_DIR) 를 읽는다.
# 사용법:
#   bash lib/fetch.sh mode                   현재 모드(supabase/json/manual) 한 줄 출력
#   bash lib/fetch.sh ctx                    계정 정체성·기둥·평균 조회·카드 번호 범위
#   bash lib/fetch.sh card R-231             발굴 카드 1건 (대본·시각분석·종합분석)
#   bash lib/fetch.sh card M-014             내 게시물 1건 (캡션·대본·시각분석·코칭)
#   bash lib/fetch.sh my_top 500000          내 릴스 중 조회 N 이상 (대본 포함, 조회순)
#   bash lib/fetch.sh refs "건조기 필터"      발굴 대본·캡션에 키워드가 든 카드 — 조회 상위 15건을 키워드 밀도로 재정렬해 최대 7건
#   bash lib/fetch.sh pillars                기둥별 비중 vs 목표
# 모드: .env 에 SUPABASE_URL 이 있으면 supabase 모드, 없고 DASHBOARD_DIR 만 있으면 json 모드(크리에이터 대시보드 data/*.json 직접 읽기), .env 자체가 없으면 수동 모드(안내만 하고 exit 0).
set -euo pipefail

usage() {
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
}

ROOT="$(cd -P "$(dirname "$0")" && cd ../../../.. && pwd)"  # -P: 전역(~/.claude/skills) 심볼릭 링크로 불러도 실제 폴더의 .env 를 찾는다

NOENV_MSG="ℹ️ .env 없음 — 수동 모드입니다. SKILL.md '데이터' 절대로 진행하세요."
# 통합 번들(대시보드 폴더 안에 이 스킬이 들어 있는 경우): 같은 폴더의 data/posts.json 을 .env 없이도 자동으로 읽는다
if [ -f "$ROOT/.env" ]; then
  set -a; . "$ROOT/.env"; set +a
fi
if [ -n "${SUPABASE_URL:-}" ]; then
  MODE="supabase"
elif [ -n "${DASHBOARD_DIR:-}" ]; then
  MODE="json"
elif [ -f "$ROOT/data/posts.json" ]; then
  DASHBOARD_DIR="$ROOT"; MODE="json"
else
  MODE="manual"
fi

if [ "$MODE" = "manual" ]; then
  echo "$NOENV_MSG"
  exit 0
fi

PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo "❌ python3 (없으면 python) 이 필요합니다 — 이 스크립트는 bash + curl + python 만 씁니다"; exit 1; }

cmd="${1:-}"

if [ "$cmd" = "mode" ]; then
  echo "$MODE"
  exit 0
fi

if [ "$MODE" = "supabase" ]; then
  : "${SUPABASE_URL:?❌ .env 에 SUPABASE_URL 이 없습니다}"
  : "${SUPABASE_KEY:?❌ .env 에 SUPABASE_KEY 가 없습니다}"

  H1="apikey: $SUPABASE_KEY"; H2="Authorization: Bearer $SUPABASE_KEY"
  # q 는 반드시 변수에 담아 쓴다 (파이프로 바로 넘기면 실패 시 python 이 빈 입력으로 트레이스백을 뱉는다)
  q() {
    curl -sf "$SUPABASE_URL/rest/v1/$1" -H "$H1" -H "$H2" \
      || { echo "❌ Supabase 조회 실패: $1 (키·네트워크를 확인하세요)" >&2; return 1; }
  }
  appdata() {
    _AD="$(q "ca_app_data?key=eq.$1&select=value")" || return 1
    printf '%s' "$_AD" | "$PY" -c "
import json,sys
d=json.load(sys.stdin)
if not d: sys.stderr.write('❌ ca_app_data 에 $1 키가 없습니다\n'); sys.exit(1)
print(json.dumps(d[0]['value'],ensure_ascii=False))"
  }
  join3() { printf '%s\n' "$1" '@@@SPLIT@@@' "$2" '@@@SPLIT@@@' "$3"; }
  join2() { printf '%s\n' "$1" '@@@SPLIT@@@' "$2"; }
  urlenc() { "$PY" -c "import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=''))" "$1"; }
elif [ "$MODE" = "json" ]; then
  : "${DASHBOARD_DIR:?❌ .env 에 DASHBOARD_DIR 이 없습니다}"
  DDIR="${DASHBOARD_DIR%/}/data"
  [ -f "$DDIR/posts.json" ] || { echo "❌ $DASHBOARD_DIR/data/posts.json 이 없습니다 — 대시보드 폴더가 맞는지 확인"; exit 1; }
fi

case "$cmd" in

ctx)
  if [ "$MODE" = "json" ]; then
    "$PY" -c "
import json,os,sys
ddir=sys.argv[1]
def load(name):
    p=os.path.join(ddir,name)
    if not os.path.exists(p): return {}
    with open(p,encoding='utf-8') as f: return json.load(f)
settings=load('settings.json'); posts_data=load('posts.json'); discoveries=load('discoveries.json')
my=posts_data.get('my') or {}
profile=my.get('profile') or {}
posts=my.get('posts') or []
reels=[p for p in posts if p.get('type')=='reel']
base=reels if reels else posts
views=[p.get('views') or 0 for p in base]
avg=(sum(views)/len(views)) if views else 0
print('# 계정 정체성')
print()
print('- 핸들: @%s (%s)' % (settings.get('handle',''), profile.get('displayName') or profile.get('fullName') or profile.get('name') or ''))
if settings.get('niche'): print('- 니치: %s' % settings['niche'])
if settings.get('audience'): print('- 타깃: %s' % settings['audience'])
if settings.get('sources'): print('- 소스 계정: %s' % ', '.join('@'+str(s) for s in settings['sources']))
print('- 평균 조회: {:,}'.format(int(avg)))
print('- 수집된 게시물: %d개 (릴스 %d개)' % (len(posts), len(reels)))
print()
print('## 브리프')
print()
print((settings.get('brief') or '').strip())
print()
print('## 기둥 (목표 비중)')
print()
for p in settings.get('pillars') or []:
    print('- %s — 목표 %s%%' % (p.get('name'), p.get('targetPercent')))
print()
print('## 카드 번호 범위')
print()
def cardnums(items,prefix):
    nums=[]
    for it in items:
        c=it.get('cardNo') or ''
        if c.startswith(prefix+'-'):
            try: nums.append(int(c.split('-')[1]))
            except Exception: pass
    return nums
items=discoveries.get('items') or []
rnums=cardnums(items,'R')
mnums=cardnums(posts,'M')
print('- 발굴 레퍼런스: R-001 ~ R-%03d (%d건)' % (max(rnums) if rnums else 0, len(rnums)))
print('- 내 게시물: M-001 ~ M-%03d (%d건)' % (max(mnums) if mnums else 0, len(mnums)))
" "$DDIR"
  else
  CFG="$(appdata config)"
  CARDS="$(appdata card_numbers)"
  META="$(q "ca_app_data?key=eq.analytics&select=value->my->avgViews,value->my->posts")"
  join3 "$CFG" "$CARDS" "$META" | "$PY" -c "
import json,sys
cfg,cards,meta=sys.stdin.read().split('@@@SPLIT@@@',2)
cfg=json.loads(cfg); cards=json.loads(cards); meta=json.loads(meta)[0]
a=cfg['accounts'][0]
posts=meta.get('posts') or []
reels=[p for p in posts if p.get('type')=='reel']
print('# 계정 정체성')
print()
print('- 핸들: @%s (%s)' % (a['handle'], a.get('displayName','')))
print('- 니치: %s' % a.get('niche',''))
print('- 타깃: %s' % a.get('audience',''))
print('- 평균 조회: {:,}'.format(int(meta.get('avgViews') or 0)))
print('- 수집된 게시물: %d개 (릴스 %d개)' % (len(posts), len(reels)))
print('- 경쟁 계정: %s' % ', '.join('@'+c for c in a.get('competitors',[])))
print()
print('## 브리프')
print()
print((a.get('brief') or '').strip())
print()
print('## 기둥 (목표 비중)')
print()
for p in a.get('pillars',[]):
    print('- %s — 목표 %s%% (가중치 %s)' % (p['name'], p.get('targetPercent'), p.get('weight')))
print()
print('## 카드 번호 범위')
print()
rs=[v for v in cards['map'].values() if v.startswith('R-')]
ms=[v for v in cards['map'].values() if v.startswith('M-')]
print('- 발굴 레퍼런스: R-001 ~ R-%03d (%d건)' % (int(cards.get('nextR',1))-1, len(rs)))
print('- 내 게시물: M-001 ~ M-%03d (%d건)' % (int(cards.get('nextM',1))-1, len(ms)))
"
  fi
  ;;

pillars)
  if [ "$MODE" = "json" ]; then
    "$PY" -c "
import json,os,sys,datetime
ddir=sys.argv[1]
def load(name):
    p=os.path.join(ddir,name)
    if not os.path.exists(p): return {}
    with open(p,encoding='utf-8') as f: return json.load(f)
settings=load('settings.json'); posts_data=load('posts.json'); analysis=load('analysis.json')
overrides=settings.get('overrides') or {}
pillar_map=analysis.get('pillars') or {}
all_posts=(posts_data.get('my') or {}).get('posts') or []
now=datetime.datetime.now()
ym=now.strftime('%Y-%m')
this_month=[p for p in all_posts if (p.get('timestamp') or '')[:7]==ym]
use_posts=this_month if this_month else all_posts
counts={}
for p in use_posts:
    sc=p.get('shortcode')
    name=overrides.get(sc) or pillar_map.get(sc) or '미분류'
    counts[name]=counts.get(name,0)+1
total=len(use_posts)
print('# 기둥별 비중 vs 목표')
print()
print('기준: %s' % (ym if this_month else '전체 기간 (이번 달 게시물 없음)'))
print()
print('| 기둥 | 이번달 실제 | 목표 | 상태 | 코멘트 |')
print('|---|---|---|---|---|')
for pl in settings.get('pillars') or []:
    name=pl.get('name'); target=pl.get('targetPercent') or 0
    actual=(counts.get(name,0)/total*100) if total else 0
    ok=actual>=target
    comment='충족' if ok else '%.0f%%p 부족' % (target-actual)
    print('| %s | %.0f%% | %s%% | %s | %s |' % (name, actual, target, '✅' if ok else '⚠️ 조정', comment))
unc=counts.get('미분류',0)
if unc: print('| 미분류 | %.0f%% | — | — | 대시보드에서 기둥 분류 필요 |' % (unc/total*100 if total else 0))
" "$DDIR"
  else
  PILV="$(appdata pillars)"
  printf '%s' "$PILV" | "$PY" -c "
import json,sys
v=json.load(sys.stdin)
print('# 기둥별 비중 vs 목표')
print()
print('갱신: %s' % (v.get('generatedAt') or '')[:10])
print()
st=v.get('status') or {}
rows=[st[k] for k in sorted(st.keys(), key=lambda x:(not x.isdigit(), x)) if isinstance(st.get(k),dict) and 'pillar' in st[k]]
print('| 기둥 | 이번달 실제 | 목표 | 상태 | 코멘트 |')
print('|---|---|---|---|---|')
for r in rows:
    print('| %s | %s%% | %s%% | %s | %s |' % (r['pillar'], r.get('actual'), r.get('target'), '✅' if r.get('ok') else '⚠️ 조정', r.get('suggestion','')))
print()
ra=v.get('ratios') or {}
for label,key in (('이번 달','thisMonth'),('지난 달','lastMonth')):
    d=ra.get(key) or {}
    if d:
        print('- %s: %s' % (label, ', '.join('%s %s%%'%(k,x) for k,x in sorted(d.items(), key=lambda kv:-kv[1]))))
"
  fi
  ;;

my_top)
  MIN="${2:-500000}"
  case "$MIN" in ''|*[!0-9]*) echo "❌ my_top 의 최소 조회수는 숫자여야 합니다: $MIN"; exit 1;; esac
  if [ "$MODE" = "json" ]; then
    "$PY" -c "
import json,os,sys
ddir,mn_str=sys.argv[1],sys.argv[2]
mn=int(mn_str)
def load(name):
    p=os.path.join(ddir,name)
    if not os.path.exists(p): return {}
    with open(p,encoding='utf-8') as f: return json.load(f)
settings=load('settings.json'); posts_data=load('posts.json'); analysis=load('analysis.json')
overrides=settings.get('overrides') or {}
pillar_map=analysis.get('pillars') or {}
coaching_map=analysis.get('coaching') or {}
posts=(posts_data.get('my') or {}).get('posts') or []
sel=[p for p in posts if p.get('type')=='reel' and (p.get('views') or 0)>=mn]
sel.sort(key=lambda p:-(p.get('views') or 0))
print('# 내 릴스 조회 {:,} 이상 — {}건 (조회순)'.format(mn,len(sel)))
print()
def block(t,v):
    print('### %s'%t); print()
    if isinstance(v,dict):
        n=0
        for k,x in v.items():
            if x in (None,'',[],{}): continue
            n+=1
            if isinstance(x,list): print('- **%s**'%k); [print('  - %s'%i) for i in x]
            else: print('- **%s**: %s'%(k,x))
        if not n: print('(없음)')
    else: print((v or '(없음)').strip())
    print()
for p in sel:
    sc=p.get('shortcode','')
    pillar=overrides.get(sc) or pillar_map.get(sc) or '미분류'
    print('---')
    print()
    print('## %s · {:,}회 · %s'.format(p.get('views') or 0) % (p.get('cardNo','M-?'), (p.get('timestamp') or '')[:10]))
    print()
    print('- 링크: https://www.instagram.com/reel/%s/' % sc)
    print('- 기둥: %s / 수익유형: %s' % (pillar, p.get('commerceHint') or '일반'))
    print()
    cap=(p.get('caption') or '').strip()
    print('### 캡션(300자)')
    print()
    print(cap[:300] + ('…' if len(cap)>300 else ''))
    print()
    print('### 대본')
    print()
    print((p.get('transcript') or '(무음 또는 미추출)').strip())
    print()
    coaching=coaching_map.get(sc)
    if coaching and coaching.get('video_analysis'):
        block('코칭 시각분석', coaching.get('video_analysis'))
" "$DDIR" "$MIN"
  else
  CARDS="$(appdata card_numbers)"
  PIL="$(appdata pillars)"
  POSTS="$(q "ca_app_data?key=eq.analytics&select=value->my->posts")"
  join3 "$CARDS" "$PIL" "$POSTS" | "$PY" -c "
import json,sys
mn=int(sys.argv[1])
cards,pil,posts=sys.stdin.read().split('@@@SPLIT@@@',2)
cmap=json.loads(cards)['map']; cls=(json.loads(pil).get('classification') or {})
posts=json.loads(posts)[0]['posts']
sel=[p for p in posts if p.get('type')=='reel' and (p.get('views') or 0)>=mn]
sel.sort(key=lambda p:-(p.get('views') or 0))
print('# 내 릴스 조회 {:,} 이상 — {}건 (조회순)'.format(mn,len(sel)))
print()
for p in sel:
    sc=p.get('shortcode','')
    print('---')
    print()
    print('## %s · {:,}회 · %s'.format(p.get('views') or 0) % (cmap.get(sc,'M-?'), (p.get('timestamp') or '')[:10]))
    print()
    print('- 링크: https://www.instagram.com/reel/%s/' % sc)
    print('- 기둥: %s / 수익유형: %s' % (cls.get(sc,'-'), p.get('commerceHint') or '일반'))
    print()
    cap=(p.get('caption') or '').strip()
    print('### 캡션(300자)')
    print()
    print(cap[:300] + ('…' if len(cap)>300 else ''))
    print()
    print('### 대본')
    print()
    print((p.get('transcript') or '(무음 또는 미추출)').strip())
    print()
" "$MIN"
  fi
  ;;

card)
  NUM="${2:-}"
  [ -n "$NUM" ] || { echo "❌ 카드 번호가 필요합니다 (예: card R-231, card M-014)"; exit 1; }
  NUM="$(printf '%s' "$NUM" | tr '[:lower:]' '[:upper:]')"
  case "$NUM" in
    R-*|M-*) ;;
    *) echo "❌ 카드 번호는 R-### 또는 M-### 형식입니다: $NUM"; exit 1;;
  esac

  if [ "$MODE" = "json" ]; then
    "$PY" -c "
import json,os,sys
ddir,num=sys.argv[1],sys.argv[2]
def load(name):
    p=os.path.join(ddir,name)
    if not os.path.exists(p): return {}
    with open(p,encoding='utf-8') as f: return json.load(f)
def block(t,v):
    print('## %s'%t); print()
    if isinstance(v,dict):
        n=0
        for k,x in v.items():
            if x in (None,'',[],{}): continue
            n+=1
            if isinstance(x,list): print('- **%s**'%k); [print('  - %s'%i) for i in x]
            elif isinstance(x,dict): print('- **%s**: %s'%(k, ' / '.join('%s=%s'%(a,b) for a,b in x.items())))
            else: print('- **%s**: %s'%(k,x))
        if not n: print('(없음)')
    else: print((v or '(없음)').strip() if isinstance(v,str) else v)
    print()

if num.startswith('R-'):
    discoveries=load('discoveries.json')
    items=discoveries.get('items') or []
    r=next((it for it in items if it.get('cardNo')==num), None)
    if r is None:
        sys.stderr.write('❌ %s 에 해당하는 카드가 없습니다\n'%num); sys.exit(1)
    print('# %s · @%s · {:,}회'.format(r.get('views') or 0) % (num, r.get('sourceHandle','')))
    print()
    print('- 링크: %s' % (r.get('url') or ''))
    print('- 게시일: %s · 좋아요 %s · 댓글 %s' % ((r.get('takenAt') or '')[:10], r.get('likes'), r.get('comments')))
    print()
    if r.get('status')=='collected':
        print('> 분석 전 — 캡션·대본만')
        print()
    block('캡션', r.get('caption'))
    block('대본 (음성 전사 원문)', r.get('transcript') or '(무음 또는 미추출)')
    if r.get('status')!='collected':
        va=r.get('videoAnalysis') or {}
        order=['인물','컷편집','영상연출','초반3초훅','자막스타일']
        ordered={}
        for k in order:
            if k in va: ordered[k]=va[k]
        for k,x in va.items():
            if k not in ordered: ordered[k]=x
        block('시각 분석', ordered)
        an=r.get('analysis') or {}
        comp={}
        for k in ('주제','후킹','좋은점','차용포인트'):
            if k in an: comp[k]=an[k]
        block('종합 분석', comp)
else:
    posts_data=load('posts.json'); analysis=load('analysis.json'); settings=load('settings.json')
    posts=(posts_data.get('my') or {}).get('posts') or []
    p=next((x for x in posts if x.get('cardNo')==num), None)
    if p is None:
        sys.stderr.write('❌ %s 에 해당하는 카드가 없습니다\n'%num); sys.exit(1)
    sc=p.get('shortcode','')
    overrides=settings.get('overrides') or {}
    pillar_map=analysis.get('pillars') or {}
    pillar=overrides.get(sc) or pillar_map.get(sc) or '미분류'
    reels_views=[x.get('views') or 0 for x in posts if x.get('type')=='reel']
    avg=(sum(reels_views)/len(reels_views)) if reels_views else 0
    v=p.get('views') or 0
    print('# %s · {:,}회 (평균 {:,}회 대비 {:.1f}배)'.format(v,int(avg),(v/avg if avg else 0)) % num)
    print()
    print('- 링크: https://www.instagram.com/reel/%s/' % sc)
    print('- 업로드: %s · 기둥: %s · 수익유형: %s' % ((p.get('timestamp') or '')[:10], pillar, p.get('commerceHint') or '일반'))
    print('- 좋아요 %s · 댓글 %s' % (p.get('likes'), p.get('comments')))
    print()
    block('캡션 (수집 시 300자 상한)', p.get('caption'))
    block('대본 (음성 전사 원문)', p.get('transcript') or '(무음 또는 미추출)')
    coaching=(analysis.get('coaching') or {}).get(sc)
    if coaching:
        block('시각 분석', coaching.get('video_analysis') or {})
        block('AI 코칭', coaching.get('analysis') or {})
" "$DDIR" "$NUM"
  else
  CARDS="$(appdata card_numbers)"
  SC="$(printf '%s' "$CARDS" | "$PY" -c "
import json,sys
m=json.load(sys.stdin)['map']; n=sys.argv[1]
for k,v in m.items():
    if v==n: print(k); break
" "$NUM")"
  [ -n "$SC" ] || { echo "❌ $NUM 에 해당하는 카드가 없습니다 (ctx 로 번호 범위를 확인하세요)"; exit 1; }

  if [ "${NUM%%-*}" = "R" ]; then
    DROW="$(q "ca_discoveries?shortcode=eq.$SC&select=shortcode,source_handle,url,caption,transcript,views,likes,comments,taken_at,video_analysis,analysis")"
    printf '%s' "$DROW" | "$PY" -c "
import json,sys
d=json.load(sys.stdin)
if not d: sys.stderr.write('❌ ca_discoveries 에 자료가 없습니다\n'); sys.exit(1)
r=d[0]; num=sys.argv[1]
def block(t,v):
    print('## %s'%t); print()
    if isinstance(v,dict):
        n=0
        for k,x in v.items():
            if x in (None,'',[],{}): continue
            n+=1
            if isinstance(x,list): print('- **%s**'%k); [print('  - %s'%i) for i in x]
            elif isinstance(x,dict): print('- **%s**: %s'%(k, ' / '.join('%s=%s'%(a,b) for a,b in x.items())))
            else: print('- **%s**: %s'%(k,x))
        if not n: print('(없음)')
    elif isinstance(v,list):
        for i in v: print('- %s'%i)
    else: print((v or '(없음)').strip() if isinstance(v,str) else v)
    print()
print('# %s · @%s · {:,}회'.format(r.get('views') or 0) % (num, r.get('source_handle','')))
print()
print('- 링크: %s' % (r.get('url') or ''))
print('- 게시일: %s · 좋아요 %s · 댓글 %s' % ((r.get('taken_at') or '')[:10], r.get('likes'), r.get('comments')))
print()
block('캡션', r.get('caption'))
block('대본 (음성 전사 원문)', r.get('transcript') or '(무음 또는 미추출)')
block('시각 분석', r.get('video_analysis') or {})
block('종합 분석', r.get('analysis') or {})
" "$NUM"
  else
    PIL="$(appdata pillars)"
    POSTS="$(q "ca_app_data?key=eq.analytics&select=value->my->posts,value->my->avgViews")"
    RA="$(q "ca_reel_analysis?shortcode=eq.$SC&select=video_analysis,analysis,views")"
    join3 "$PIL" "$POSTS" "$RA" | "$PY" -c "
import json,sys
num,sc=sys.argv[1],sys.argv[2]
pil,posts,ra=sys.stdin.read().split('@@@SPLIT@@@',2)
cls=(json.loads(pil).get('classification') or {})
a=json.loads(posts)[0]; avg=a.get('avgViews') or 0
p=next((x for x in a['posts'] if x.get('shortcode')==sc), None)
ra=json.loads(ra); ra=ra[0] if ra else {}
if p is None and not ra: sys.stderr.write('❌ %s 게시물 데이터를 찾지 못했습니다\n'%num); sys.exit(1)
p=p or {}
v=p.get('views') or ra.get('views') or 0
def block(t,v):
    print('## %s'%t); print()
    if isinstance(v,dict):
        n=0
        for k,x in v.items():
            if x in (None,'',[],{}): continue
            n+=1
            if isinstance(x,list): print('- **%s**'%k); [print('  - %s'%i) for i in x]
            else: print('- **%s**: %s'%(k,x))
        if not n: print('(없음)')
    else: print((v or '(없음)').strip())
    print()
print('# %s · {:,}회 (평균 {:,}회 대비 {:.1f}배)'.format(v,int(avg), (v/avg if avg else 0)) % num)
print()
print('- 링크: https://www.instagram.com/reel/%s/' % sc)
print('- 업로드: %s · 기둥: %s · 수익유형: %s' % ((p.get('timestamp') or '')[:10], cls.get(sc,'-'), p.get('commerceHint') or '일반'))
print('- 좋아요 %s · 댓글 %s' % (p.get('likes'), p.get('comments')))
print()
block('캡션 (수집 시 300자 상한)', p.get('caption'))
block('대본 (음성 전사 원문)', p.get('transcript') or '(무음 또는 미추출)')
block('시각 분석', ra.get('video_analysis') or {})
block('AI 코칭', ra.get('analysis') or {})
" "$NUM" "$SC"
  fi
  fi
  ;;

refs)
  KW="${2:-}"
  [ -n "$KW" ] || { echo "❌ 검색 키워드가 필요합니다 (예: refs \"건조기 필터\")"; exit 1; }
  if [ "$MODE" = "json" ]; then
    "$PY" -c "
import json,os,sys
ddir,kw=sys.argv[1],sys.argv[2]
def load(name):
    p=os.path.join(ddir,name)
    if not os.path.exists(p): return {}
    with open(p,encoding='utf-8') as f: return json.load(f)
settings=load('settings.json'); discoveries=load('discoveries.json')
hidden=set(settings.get('hidden') or [])
items=[it for it in (discoveries.get('items') or []) if it.get('cardNo') not in hidden]
kws=[k.lower() for k in kw.split() if k.strip()]

def cnt(s,k):
    return (s or '').lower().count(k)

def matches(it):
    cap=it.get('caption') or ''
    tr=it.get('transcript') or ''
    topic=(it.get('analysis') or {}).get('주제') or ''
    for k in kws:
        if k in cap.lower() or k in tr.lower() or k in topic.lower():
            return True
    return False

def trunc60(s):
    s=s or ''
    return s[:60] + ('…' if len(s)>60 else '')

pool=[it for it in items if matches(it)]
pool.sort(key=lambda it:-(it.get('views') or 0))
pool=pool[:15]

def score(it):
    an=it.get('analysis') or {}
    topic=an.get('주제') or ''
    cap=it.get('caption') or ''
    tr=it.get('transcript') or ''
    head=sum(cnt(topic,k)+cnt(cap,k) for k in kws)
    body=sum(cnt(tr,k) for k in kws)
    return head*3+body, head, body

for it in pool:
    it['_s'],it['_h'],it['_b']=score(it)
kept=[it for it in pool if it['_s']>0]
kept.sort(key=lambda it:(-it['_s'], -(it.get('views') or 0)))
kept=kept[:7]

print('# 레퍼런스 검색: \"%s\" — %d건 (조회 상위 15건을 키워드 밀도로 재정렬, 최대 7건)' % (kw,len(kept)))
print()
if not kept:
    print('결과 없음. 키워드를 짧게 나눠 다시 시도하세요 (예: \"건조기 필터\" → \"건조기\", \"필터\").')
for it in kept:
    an=it.get('analysis') or {}
    va=it.get('videoAnalysis') or {}
    print('---'); print()
    print('## %s · @%s · {:,}회 · %s'.format(it.get('views') or 0) % (it.get('cardNo','R-?'), it.get('sourceHandle',''), (it.get('takenAt') or '')[:10]))
    print()
    print('- 링크: %s' % (it.get('url') or ''))
    print('- [주제] %s' % (an.get('주제') or '(없음)'))
    print('- [점수] %d (주제·캡션 %d회 · 대본 %d회)' % (it['_s'], it['_h'], it['_b']))
    print('- [첫 3초] %s' % trunc60(va.get('초반3초훅') or '(없음)'))
    print('- [후킹] %s' % trunc60(an.get('후킹') or '(없음)'))
    g=an.get('내_채널_관련성') or an.get('내채널_관련성')
    if isinstance(g, dict):
        print('- [관련성] %s — %s' % (g.get('등급') or '?', trunc60(g.get('이유') or '')))
    elif g:
        print('- [관련성] %s' % trunc60(str(g)))
    print()
    cap=(it.get('caption') or '').strip()
    print('### 캡션(200자)'); print()
    print(cap[:200] + ('…' if len(cap)>200 else '')); print()
    t=(it.get('transcript') or '').strip()
    print('### 대본(600자)'); print()
    print((t[:600] + ('…' if len(t)>600 else '')) if t else '(무음 또는 미추출)'); print()
    bp=an.get('차용포인트')
    print('### 차용포인트'); print()
    if isinstance(bp,str) and bp.strip(): print(bp.strip())
    elif isinstance(bp,list) and bp:
        for b in bp: print('- %s'%b)
    else: print('(분석 없음)')
    print()
" "$DDIR" "$KW"
  else
  # 쉼표·괄호가 or=() 파싱을 깨지 않도록 값을 %22 로 감싸고, %·_ 는 LIKE 와일드카드라 이스케이프한다.
  # %22 안에서는 PostgREST 가 백슬래시를 한 겹 먹으므로 LIKE 용 \ 를 다시 \\ 로 이중 이스케이프해야 한다.
  ESC="$(printf '%s' "$KW" | sed -e 's/\\/\\\\/g' -e 's/[%_]/\\&/g' -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
  EKW="%22$(urlenc "*$ESC*")%22"
  # 내 계정 게시물은 레퍼런스가 아니므로 제외 (.env 의 ACCOUNT_HANDLE, 대소문자 무시). 없으면 제외 안 함.
  SELF=""
  [ -n "${ACCOUNT_HANDLE:-}" ] && SELF="&source_handle=not.ilike.$(urlenc "$ACCOUNT_HANDLE")"
  CARDS="$(appdata card_numbers)"
  # 조회순 상위 15건을 받아 키워드 밀도로 재정렬하고 최대 7건만 출력한다.
  ROWS="$(q "ca_discoveries?or=(transcript.ilike.$EKW,caption.ilike.$EKW)$SELF&select=shortcode,source_handle,url,caption,transcript,views,taken_at,video_analysis,analysis&order=views.desc&limit=15")"
  join2 "$CARDS" "$ROWS" | "$PY" -c "
import json,sys
kw=sys.argv[1]
cards,rows=sys.stdin.read().split('@@@SPLIT@@@',1)
cmap=json.loads(cards)['map']; rows=json.loads(rows)
k=kw.lower()
def cnt(s):
    return (s or '').lower().count(k)
def rel(r):
    return ((r.get('analysis') or {}).get('내채널_관련성') or {})
def score(r):
    an=r.get('analysis') or {}
    head=cnt(an.get('주제')) + cnt(r.get('caption'))
    body=cnt(r.get('transcript'))
    return head*3+body, head, body
for r in rows:
    r['_s'], r['_h'], r['_b'] = score(r)
kept=[r for r in rows if r['_s'] > 0]
kept.sort(key=lambda r: (-r['_s'], -(r.get('views') or 0)))
kept=kept[:7]
print('# 레퍼런스 검색: \"%s\" — %d건 (조회 상위 15건을 키워드 밀도로 재정렬, 최대 7건)' % (kw,len(kept)))
print()
if not kept:
    print('결과 없음. 키워드를 짧게 나눠 다시 시도하세요 (예: \"건조기 필터\" → \"건조기\", \"필터\").')
for r in kept:
    sc=r.get('shortcode','')
    an=r.get('analysis') or {}
    va=r.get('video_analysis') or {}
    print('---'); print()
    print('## %s · @%s · {:,}회 · %s'.format(r.get('views') or 0) % (cmap.get(sc,'R-?'), r.get('source_handle',''), (r.get('taken_at') or '')[:10]))
    print()
    print('- 링크: %s' % (r.get('url') or ''))
    print('- [주제] %s' % (an.get('주제') or '(없음)'))
    print('- [점수] %d (주제·캡션 %d회 · 대본 %d회)' % (r['_s'], r['_h'], r['_b']))
    print('- [첫 3초] %s' % (va.get('초반3초훅') or '(없음)'))
    print('- [후킹] %s' % (an.get('후킹') or '(없음)'))
    g=rel(r)
    if g.get('등급'):
        why=(g.get('이유') or '').strip()
        print('- [관련성] %s — %s' % (g['등급'], why[:60] + ('…' if len(why)>60 else '')))
    else:
        print('- [관련성] (미판정)')
    print()
    cap=(r.get('caption') or '').strip()
    print('### 캡션(200자)'); print()
    print(cap[:200] + ('…' if len(cap)>200 else '')); print()
    t=(r.get('transcript') or '').strip()
    print('### 대본(600자)'); print()
    print((t[:600] + ('…' if len(t)>600 else '')) if t else '(무음 또는 미추출)'); print()
    bp=an.get('차용포인트')
    print('### 차용포인트'); print()
    if isinstance(bp,str) and bp.strip(): print(bp.strip())
    elif isinstance(bp,list) and bp:
        for b in bp: print('- %s'%b)
    else: print('(분석 없음)')
    print()
" "$KW"
  fi
  ;;

*)
  [ -n "$cmd" ] && echo "❌ 알 수 없는 명령: $cmd" && echo
  usage
  exit 1
  ;;
esac
