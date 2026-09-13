#!/usr/bin/env bash
# MindAgora API smoke suite — the integration layer of the test pyramid (context/foundation/test-plan.md §6.2).
# Every endpoint is exercised end-to-end against the LOCAL Supabase stack and the real OpenRouter API, with
# Bearer tokens and, since lesson 3x1 (decision E3), the cookie session through /api/auth/* as well.
# Required env: SUPA_URL, ANON, OR_KEY. Optional: BASE_URL (default http://localhost:3000).
# The dev server must be running (npm run dev) and `npx supabase start` done; the local DB is disposable.
set -u
BASE_URL=${BASE_URL:-http://localhost:3000}
SUPA_URL=${SUPA_URL:?}; ANON=${ANON:?}; OR_KEY=${OR_KEY:?}
OR_INVALID="sk-or-v1-invalid"
SCRATCH=$(mktemp -d -t mindagora-smoke.XXXXXX); trap 'rm -rf "$SCRATCH"' EXIT; BODY="$SCRATCH/body.json"; HDR="$SCRATCH/headers.txt"
PASSWORD="SmokeTest-2026!"
EMAIL_A="smoke-a@mindagora.local"; EMAIL_B="smoke-b@mindagora.local"; EMAIL_C="smoke-c@mindagora.local"
PASS=0; FAIL=0; SKIP=0; ROWS=()

json() { python3 -c "import json,sys
try:
  d=json.load(open('$BODY'))
except Exception as e:
  print(''); sys.exit()
v=d
for k in sys.argv[1].split('.'):
  if k=='' : continue
  if isinstance(v,list): v=v[int(k)]
  else: v=v.get(k) if isinstance(v,dict) else None
  if v is None: break
print('' if v is None else (v if isinstance(v,str) else json.dumps(v)))" "$1" 2>/dev/null; }

req() { # method path auth ctype data
  local m=$1 p=$2 auth=${3:-} ct=${4:-} data=${5:-}
  local args=(-s --max-time 90 -o "$BODY" -D "$HDR" -w '%{http_code}' -X "$m" "$BASE_URL$p")
  [ -n "$auth" ] && args+=(-H "Authorization: $auth")
  [ -n "$ct" ] && args+=(-H "Content-Type: $ct")
  [ -n "$data" ] && args+=(--data-binary "$data")
  curl "${args[@]}"
}
cc() { grep -qi '^cache-control: no-store' "$HDR" && echo "ns" || echo "--"; }
check() { # id expected actual [note]
  local id=$1 exp=$2 act=$3 note=${4:-}
  local label; label=$(json error); [ -z "$label" ] && label="-"
  local mark; if [ "$exp" = "$act" ]; then mark="PASS"; PASS=$((PASS+1)); else mark="FAIL"; FAIL=$((FAIL+1)); fi
  ROWS+=("$(printf '%-4s %-12s exp=%s act=%s cc=%s label=%s %s' "$mark" "$id" "$exp" "$act" "$(cc)" "$label" "$note")")
}
skip() { SKIP=$((SKIP+1)); ROWS+=("$(printf 'SKIP %-12s %s' "$1" "$2")"); }
checkval() { # id expected actual — compares values, not HTTP statuses
  local id=$1 exp=$2 act=$3 mark
  if [ "$exp" = "$act" ]; then mark="PASS"; PASS=$((PASS+1)); else mark="FAIL"; FAIL=$((FAIL+1)); fi
  ROWS+=("$(printf '%-4s %-12s exp=%s act=%s' "$mark" "$id" "'$exp'" "'$act'")")
}
note() { ROWS+=("     $*"); }

auth_user() { # email -> prints "access_token user_id"
  local email=$1 tok uid
  curl -s -o "$BODY" -X POST "$SUPA_URL/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}" >/dev/null
  tok=$(json access_token)
  if [ -z "$tok" ]; then
    curl -s -o "$BODY" -X POST "$SUPA_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
      -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}" >/dev/null
    tok=$(json access_token)
  fi
  uid=$(json user.id)
  echo "$tok $uid"
}
db() { docker exec supabase_db_MindAgora psql -U postgres -d postgres -At -c "$1"; }

echo "== fixtures: wipe the test users of the previous run (local, disposable DB) =="
db "delete from auth.users where email in ('$EMAIL_A','$EMAIL_B','$EMAIL_C');" >/dev/null   # CASCADE removes settings/participants/conversations
echo "== fixtures: users =="
read -r JWT_A UID_A < <(auth_user "$EMAIL_A"); read -r JWT_B UID_B < <(auth_user "$EMAIL_B")
[ -z "$JWT_A" ] || [ -z "$JWT_B" ] && { echo "!!! no JWT (A='${JWT_A:0:8}' B='${JWT_B:0:8}')"; cat "$BODY"; exit 1; }
echo "A=$UID_A B=$UID_B"
BA="Bearer $JWT_A"; BB="Bearer $JWT_B"; CT="application/json"
NONEX_P="00000000-0000-0000-0000-000000000003"; NONEX_C="00000000-0000-0000-0000-000000000012"

echo "== AUTH: cookie session (/api/auth/*, decision E3) =="
JAR="$SCRATCH/jar.txt"; rm -f "$JAR"
reqc() { # method path [data] — cookie-jar variant (browser session); data = JSON
  local m=$1 p=$2 data=${3:-}
  local args=(-s --max-time 90 -o "$BODY" -D "$HDR" -w '%{http_code}' -X "$m" -b "$JAR" -c "$JAR" "$BASE_URL$p")
  [ -n "$data" ] && args+=(-H "Content-Type: $CT" --data-binary "$data")
  curl "${args[@]}"
}
loc() { grep -i '^location:' "$HDR" | tr -d '\r' | awk '{print $2}'; }
check AUTH-1 400 "$(req POST /api/auth/login "" "" '{}')" "(no Content-Type)"
check AUTH-2 400 "$(req POST /api/auth/login "" "$CT" '{"email":')" "(malformed JSON)"
check AUTH-3 400 "$(req POST /api/auth/login "" "$CT" '{"email":"nope","password":"123"}')" "details=$(json details)"
check AUTH-4 201 "$(reqc POST /api/auth/register "{\"email\":\"$EMAIL_C\",\"password\":\"$PASSWORD\"}")" "confirmation_required=$(json confirmation_required) cookies_httponly_lax=$(grep -i '^set-cookie: sb-' "$HDR" | grep -ci 'httponly; samesite=lax')"
check AUTH-5 200 "$(reqc GET /api/user-settings)" "(cookie instead of Bearer)"
check AUTH-6 302 "$(reqc GET /login)" "(signed in on /login → $(loc))"
check AUTH-7 409 "$(req POST /api/auth/register "" "$CT" "{\"email\":\"$EMAIL_C\",\"password\":\"$PASSWORD\"}")" "details=$(json details)"
check AUTH-8 401 "$(req POST /api/auth/login "" "$CT" "{\"email\":\"$EMAIL_C\",\"password\":\"wrong-password\"}")" "details=$(json details)"
rm -f "$JAR"
check AUTH-9 200 "$(reqc POST /api/auth/login "{\"email\":\"$EMAIL_C\",\"password\":\"$PASSWORD\"}")" "user=$(json user.email)"
check AUTH-10 200 "$(reqc GET /api/ai-participants)" "(cookie)"
check AUTH-11 401 "$(req POST /api/auth/logout)" "(no session)"
check AUTH-12 200 "$(reqc POST /api/auth/logout)" "msg=$(json message)"
check AUTH-13 401 "$(reqc GET /api/user-settings)" "(after logout)"
check AUTH-14 302 "$(reqc GET /)" "(page without a session → $(loc))"
check AUTH-15 302 "$(req GET /)" "(guest: / → $(loc))"

echo "== GET /api/user-settings =="
check US-1 401 "$(req GET /api/user-settings)"
check US-2 401 "$(req GET /api/user-settings "Token $JWT_A")"
check US-3 401 "$(req GET /api/user-settings "Bearer INVALID_TOKEN")"
check US-4 200 "$(req GET /api/user-settings "$BA")" "key=$(json openrouter_api_key | cut -c1-6)"
skip US-5 "404 needs the user_settings row removed"

echo "== PUT /api/user-settings =="
check PUT-1 401 "$(req PUT /api/user-settings "" "$CT" "{\"openrouter_api_key\":\"$OR_KEY\"}")"
check PUT-2 400 "$(req PUT /api/user-settings "$BA" "" "{\"openrouter_api_key\":\"$OR_KEY\"}")"
check PUT-3 400 "$(req PUT /api/user-settings "$BA" "$CT" '{"openrouter_api_key":')"
check PUT-4 400 "$(req PUT /api/user-settings "$BA" "$CT" '{}')"
check PUT-5 400 "$(req PUT /api/user-settings "$BA" "$CT" '{"openrouter_api_key":"   "}')"
check PUT-6 400 "$(req PUT /api/user-settings "$BA" "$CT" "{\"openrouter_api_key\":\"$OR_INVALID\"}")" "details=$(json details | cut -c1-70)"
check PUT-7 200 "$(req PUT /api/user-settings "$BA" "$CT" "{\"openrouter_api_key\":\"$OR_KEY\"}")"
skip PUT-8 "408 timeout needs a network failure"

echo "== GET /api/openrouter-models =="
check MOD-1 401 "$(req GET /api/openrouter-models)"
check MOD-2 401 "$(req GET /api/openrouter-models "Token $JWT_A")"
check MOD-3 412 "$(req GET /api/openrouter-models "$BB")" "(user B without a key)"
check MOD-4 200 "$(req GET /api/openrouter-models "$BA")" "models=$(python3 -c "import json;print(len(json.load(open('$BODY'))['data']))" 2>/dev/null)"
MODEL=$(python3 -c "
import json; ids=[m['id'] for m in json.load(open('$BODY'))['data']]
for p in ['openai/gpt-4o-mini','openai/gpt-4.1-nano','openai/gpt-5-nano','google/gemini-2.5-flash-lite','google/gemini-2.0-flash-001']:
  if p in ids: print(p); break
else: print(ids[0])" 2>/dev/null)
note "model chosen for the run: $MODEL"
skip MOD-5 "502 timeout needs a network failure"

echo "== GET /api/ai-participants =="
check GAIP-1 401 "$(req GET /api/ai-participants)"
check GAIP-2 401 "$(req GET /api/ai-participants "Token $JWT_A")"
check GAIP-3 401 "$(req GET /api/ai-participants "Bearer INVALID_TOKEN")"
check GAIP-4 200 "$(req GET /api/ai-participants "$BA")" "count=$(python3 -c "import json;print(len(json.load(open('$BODY'))))" 2>/dev/null)"

echo "== POST /api/conversations 0a (user B: 0 participants) =="
check CONV-0a 400 "$(req POST /api/conversations "$BB" "$CT" "{\"user_message\":\"Hello\",\"ai_participant_id\":\"$NONEX_P\"}")" "details=$(json details | cut -c1-60)"

echo "== POST /api/ai-participants =="
P='{"alias":"Alpha","model_id":"'"$MODEL"'","color":"#00AEEF"}'
check PAIP-1 401 "$(req POST /api/ai-participants "" "$CT" "$P")"
check PAIP-2 400 "$(req POST /api/ai-participants "$BA" "" "$P")"
check PAIP-3 400 "$(req POST /api/ai-participants "$BA" "$CT" '{"alias":"Alpha"')"
check PAIP-4 400 "$(req POST /api/ai-participants "$BA" "$CT" '{"alias":"___","model_id":"'"$MODEL"'","color":"#00AEEF"}')" "details=$(json details)"
check PAIP-5 400 "$(req POST /api/ai-participants "$BA" "$CT" '{"alias":"Alpha","model_id":"'"$MODEL"'","color":"#ZZZZZZ"}')"
check PAIP-6 400 "$(req POST /api/ai-participants "$BA" "$CT" '{"alias":"Alpha","model_id":"'"$(printf 'x%.0s' $(seq 1 151))"'","color":"#00AEEF"}')"
check PAIP-7 201 "$(req POST /api/ai-participants "$BA" "$CT" "$P")"; AIP_A1=$(json id)
check PAIP-8 409 "$(req POST /api/ai-participants "$BA" "$CT" "$P")" "details=$(json details)"
req POST /api/ai-participants "$BA" "$CT" '{"alias":"Beta","model_id":"'"$MODEL"'","color":"#FF8800"}' >/dev/null; AIP_A2=$(json id)
req POST /api/ai-participants "$BA" "$CT" '{"alias":"Temp","model_id":"'"$MODEL"'","color":"#123456"}' >/dev/null; AIP_TMP=$(json id)
req POST /api/ai-participants "$BB" "$CT" '{"alias":"Gamma","model_id":"'"$MODEL"'","color":"#00FF00"}' >/dev/null; AIP_B1=$(json id)
req POST /api/ai-participants "$BB" "$CT" '{"alias":"Delta","model_id":"'"$MODEL"'","color":"#0000FF"}' >/dev/null; AIP_B2=$(json id)
note "fixtures: A1=$AIP_A1 A2=$AIP_A2 TMP=$AIP_TMP B1=$AIP_B1 B2=$AIP_B2"

echo "== DELETE /api/ai-participants/:id =="
check DAIP-1 401 "$(req DELETE /api/ai-participants/$AIP_TMP)"
check DAIP-2 401 "$(req DELETE /api/ai-participants/$AIP_TMP "Token $JWT_A")"
check DAIP-3 401 "$(req DELETE /api/ai-participants/$AIP_TMP "Bearer INVALID_TOKEN")"
check DAIP-4 400 "$(req DELETE /api/ai-participants/not-a-uuid "$BA")"
check DAIP-5 200 "$(req DELETE /api/ai-participants/$AIP_TMP "$BA")"
check DAIP-6 404 "$(req DELETE /api/ai-participants/$NONEX_P "$BA")"
check DAIP-7 404 "$(req DELETE /api/ai-participants/$AIP_B1 "$BA")" "(user B's participant)"

echo "== POST /api/conversations =="
C='{"user_message":"Hello","ai_participant_id":"'"$AIP_A1"'"}'
check CONV-1 401 "$(req POST /api/conversations "" "$CT" "$C")"
check CONV-2 400 "$(req POST /api/conversations "$BA" "" "$C")"
check CONV-3 400 "$(req POST /api/conversations "$BA" "$CT" '{"user_message":')"
check CONV-4 400 "$(req POST /api/conversations "$BA" "$CT" '{"user_message":"   ","ai_participant_id":"'"$AIP_A1"'"}')" "details=$(json details)"
check CONV-5 400 "$(req POST /api/conversations "$BA" "$CT" '{"user_message":"Hello","ai_participant_id":"not-a-uuid"}')"
check CONV-7 404 "$(req POST /api/conversations "$BA" "$CT" '{"user_message":"Hello","ai_participant_id":"'"$NONEX_P"'"}')"
check CONV-7b 404 "$(req POST /api/conversations "$BA" "$CT" '{"user_message":"Hello","ai_participant_id":"'"$AIP_B1"'"}')" "(user B's participant)"
check CONV-8 201 "$(req POST /api/conversations "$BA" "$CT" '{"title":"Test conversation","user_message":"Answer in one sentence: what is the event loop in JS?","ai_participant_id":"'"$AIP_A1"'"}')" "title=$(json title) msgs=$(python3 -c "import json;print(len(json.load(open('$BODY'))['messages']))" 2>/dev/null)"
CONV_A=$(json id)
note "AI: $(json messages.1.content | cut -c1-90)"
check CONV-8b 201 "$(req POST /api/conversations "$BA" "$CT" '{"user_message":"Hi","ai_participant_id":"'"$AIP_A2"'"}')" "(auto-title, message <= 50 characters)"
CONV_A2=$(json id)
checkval CONV-8bt "Hi" "$(json title)"
LONG_MSG="In one sentence: what is the event loop in JavaScript and why does it exist at all?"
check CONV-8d 201 "$(req POST /api/conversations "$BA" "$CT" '{"user_message":"'"$LONG_MSG"'","ai_participant_id":"'"$AIP_A2"'"}')" "(auto-title, message of ${#LONG_MSG} characters)"
checkval CONV-8dt "${LONG_MSG:0:50}..." "$(json title)"
# user B: key + conversation (fixture: somebody else's conversation)
req PUT /api/user-settings "$BB" "$CT" "{\"openrouter_api_key\":\"$OR_KEY\"}" >/dev/null
check CONV-8c 201 "$(req POST /api/conversations "$BB" "$CT" '{"user_message":"Ping","ai_participant_id":"'"$AIP_B1"'"}')" "(user B's conversation)"
CONV_B=$(json id)
skip CONV-10 "504 timeout needs a network failure"

echo "== GET /api/conversations =="
check GCONV-1 401 "$(req GET /api/conversations)"
check GCONV-2 401 "$(req GET /api/conversations "Token $JWT_A")"
check GCONV-3 401 "$(req GET /api/conversations "Bearer INVALID_TOKEN")"
check GCONV-4 200 "$(req GET /api/conversations "$BA")"
check GCONV-5 200 "$(req GET "/api/conversations?foo=bar&limit=10&page=2" "$BA")"
req GET /api/conversations "$BA" >/dev/null
note "GCONV-6 $(python3 -c "
import json; L=json.load(open('$BODY'))
ok_fields=all(set(['id','user_id','title','created_at','updated_at','message_count'])<=set(x) for x in L)
ok_num=all(isinstance(x['message_count'],int) for x in L)
ok_sort=[x['updated_at'] for x in L]==sorted([x['updated_at'] for x in L],reverse=True)
print(f'n={len(L)} fields={ok_fields} count_int={ok_num} counts={[x[\"message_count\"] for x in L]} sort_desc={ok_sort}')")"

echo "== GET /api/conversations/:id =="
check GCID-1 401 "$(req GET /api/conversations/$CONV_A)"
check GCID-2 401 "$(req GET /api/conversations/$CONV_A "Token $JWT_A")"
check GCID-3 401 "$(req GET /api/conversations/$CONV_A "Bearer INVALID_TOKEN")"
check GCID-4 400 "$(req GET /api/conversations/not-a-uuid "$BA")"
check GCID-5 404 "$(req GET /api/conversations/$NONEX_C "$BA")"
check GCID-6 404 "$(req GET /api/conversations/$CONV_B "$BA")" "(user B's conversation)"
check GCID-7 200 "$(req GET /api/conversations/$CONV_A "$BA")"
note "GCID-7 $(python3 -c "
import json; d=json.load(open('$BODY')); M=d['messages']
print(f'msgs={len(M)} roles={[m[\"role\"] for m in M]} user_null={all(m[\"ai_participant\"] is None and m[\"ai_participant_id\"] is None for m in M if m[\"role\"]==\"user\")} asst_has_participant={all(m[\"ai_participant\"] is not None for m in M if m[\"role\"]==\"assistant\")} sorted_asc={[m[\"created_at\"] for m in M]==sorted(m[\"created_at\"] for m in M)}')")"
check GCID-8 200 "$(req GET "/api/conversations/$CONV_A?foo=bar" "$BA")"

echo "== PUT /api/conversations/:id =="
T='{"title":"New title"}'
check PCID-1 401 "$(req PUT /api/conversations/$CONV_A "" "$CT" "$T")"
check PCID-2 400 "$(req PUT /api/conversations/not-a-uuid "$BA" "$CT" "$T")"
check PCID-3 400 "$(req PUT /api/conversations/$CONV_A "$BA" "" "$T")"
check PCID-4 400 "$(req PUT /api/conversations/$CONV_A "$BA" "$CT" '{"title":')"
check PCID-5 400 "$(req PUT /api/conversations/$CONV_A "$BA" "$CT" '{"title":"   "}')"
check PCID-6 400 "$(req PUT /api/conversations/$CONV_A "$BA" "$CT" "{\"title\":\"$(printf 'x%.0s' $(seq 1 101))\"}")"
check PCID-7 404 "$(req PUT /api/conversations/$NONEX_C "$BA" "$CT" "$T")"
check PCID-8 404 "$(req PUT /api/conversations/$CONV_B "$BA" "$CT" "$T")" "(user B's conversation)"
UPD_BEFORE=$(req GET /api/conversations/$CONV_A "$BA" >/dev/null; json updated_at)
check PCID-9 200 "$(req PUT /api/conversations/$CONV_A "$BA" "$CT" '{"title":"New conversation title"}')" "title=$(json title) updated_at_unchanged=$([ "$(json updated_at)" = "$UPD_BEFORE" ] && echo yes || echo NO)"

echo "== POST /api/conversations/:id/messages =="
M='{"content":"Ping","ai_participant_id":"'"$AIP_A2"'"}'
check MSG-1 401 "$(req POST /api/conversations/$CONV_A/messages "" "$CT" "$M")"
check MSG-2 401 "$(req POST /api/conversations/$CONV_A/messages "Token $JWT_A" "$CT" "$M")"
check MSG-3 401 "$(req POST /api/conversations/$CONV_A/messages "Bearer INVALID_TOKEN" "$CT" "$M")"
check MSG-4 400 "$(req POST /api/conversations/not-a-uuid/messages "$BA" "$CT" "$M")"
check MSG-5 400 "$(req POST /api/conversations/$CONV_A/messages "$BA" "" "$M")"
check MSG-6 400 "$(req POST /api/conversations/$CONV_A/messages "$BA" "$CT" '{"content":')"
check MSG-7 400 "$(req POST /api/conversations/$CONV_A/messages "$BA" "$CT" '{"content":"   ","ai_participant_id":"'"$AIP_A2"'"}')"
check MSG-8 400 "$(req POST /api/conversations/$CONV_A/messages "$BA" "$CT" "{\"content\":\"$(printf 'x%.0s' $(seq 1 10001))\",\"ai_participant_id\":\"$AIP_A2\"}")" "details=$(json details)"
check MSG-9 400 "$(req POST /api/conversations/$CONV_A/messages "$BA" "$CT" '{"content":"Ping","ai_participant_id":"not-a-uuid"}')"
check MSG-10 404 "$(req POST /api/conversations/$NONEX_C/messages "$BA" "$CT" "$M")"
check MSG-11 404 "$(req POST /api/conversations/$CONV_B/messages "$BA" "$CT" "$M")" "(user B's conversation)"
check MSG-12 404 "$(req POST /api/conversations/$CONV_A/messages "$BA" "$CT" '{"content":"Ping","ai_participant_id":"'"$AIP_B1"'"}')" "(user B's participant)"
check MSG-14 201 "$(req POST /api/conversations/$CONV_A/messages "$BA" "$CT" '{"content":"Now in one sentence: what did the previous participant say about the event loop?","ai_participant_id":"'"$AIP_A2"'"}')" "roles=$(json user_message.role)/$(json ai_message.role) alias=$(json ai_message.ai_participant.alias)"
note "AI (Beta, full context): $(json ai_message.content | cut -c1-110)"
req GET /api/conversations "$BA" >/dev/null
note "message_count after MSG-14: $(python3 -c "import json;print([(x['title'][:20],x['message_count']) for x in json.load(open('$BODY'))])")"
skip MSG-16 "504 timeout needs a network failure"

echo "== user B: invalid key (DB) → OpenRouter 4xx → 500 =="
db "update public.user_settings set openrouter_api_key='$OR_INVALID' where user_id='$UID_B';" >/dev/null
check MOD-6 200 "$(req GET /api/openrouter-models "$BB")" "(OpenRouter /models is public: an invalid key is not an error)"
check CONV-9 500 "$(req POST /api/conversations "$BB" "$CT" '{"user_message":"Hello","ai_participant_id":"'"$AIP_B1"'"}')" "details=$(json details | cut -c1-60)"
check MSG-15 500 "$(req POST /api/conversations/$CONV_B/messages "$BB" "$CT" '{"content":"Ping","ai_participant_id":"'"$AIP_B1"'"}')" "details=$(json details | cut -c1-60)"
echo "== user B: NULL key (DB) → No API key =="
db "update public.user_settings set openrouter_api_key=NULL where user_id='$UID_B';" >/dev/null
check CONV-6 412 "$(req POST /api/conversations "$BB" "$CT" '{"user_message":"Hello","ai_participant_id":"'"$AIP_B1"'"}')"
check MSG-13 412 "$(req POST /api/conversations/$CONV_B/messages "$BB" "$CT" '{"content":"Ping","ai_participant_id":"'"$AIP_B1"'"}')"

echo "== ON DELETE SET NULL: delete Alpha (has a message in CONV_A) =="
check SETNULL-1 200 "$(req DELETE /api/ai-participants/$AIP_A1 "$BA")"
req GET /api/conversations/$CONV_A "$BA" >/dev/null
note "SETNULL-2 $(python3 -c "
import json; M=json.load(open('$BODY'))['messages']
a=[(m['ai_participant_id'],m['ai_participant']) for m in M if m['role']=='assistant']
print(f'assistant_msgs={len(a)} first(deleted)={a[0]} second(Beta)={(a[1][1] or {}).get(\"alias\")}')")"

echo "== DELETE /api/conversations/:id =="
check DCID-1 401 "$(req DELETE /api/conversations/$CONV_A2)"
check DCID-2 400 "$(req DELETE /api/conversations/not-a-uuid "$BA")"
check DCID-3 404 "$(req DELETE /api/conversations/$NONEX_C "$BA")"
check DCID-4 404 "$(req DELETE /api/conversations/$CONV_B "$BA")" "(user B's conversation)"
check DCID-5 200 "$(req DELETE /api/conversations/$CONV_A2 "$BA")" "msg=$(json message)"
check DCID-6 404 "$(req GET /api/conversations/$CONV_A2 "$BA")" "(CASCADE)"
note "CASCADE in the DB: messages of CONV_A2 = $(db "select count(*) from public.messages where conversation_id='$CONV_A2';")"

echo; echo "=============== RESULTS ==============="
printf '%s\n' "${ROWS[@]}"
echo "======================================="
echo "PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
