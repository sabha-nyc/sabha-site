#!/usr/bin/env bash
# Step 2: prove the anon key can read nothing and execute nothing.
# Raw output, no interpretation. An empty array is a FAILED test.
set -uo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a

URL="${NEXT_PUBLIC_SUPABASE_URL:?}"
ANON="${NEXT_PUBLIC_SUPABASE_ANON_KEY:?}"

case "$ANON" in
  eyJ...*|"") echo "REFUSING: NEXT_PUBLIC_SUPABASE_ANON_KEY is still the placeholder."; exit 2 ;;
esac

echo "# ANON key only. The service-role key is never read by this script."
echo "# Project: $URL"

probe() { # method path [body]
  local method="$1" path="$2" body="${3:-}"
  echo
  echo "──────── $method $path ────────"
  if [ -n "$body" ]; then
    echo "  request body: $body"
    curl -s -w '\n  [HTTP %{http_code}]\n' --max-time 20 -X "$method" \
      -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
      -H "Content-Type: application/json" -d "$body" \
      "$URL$path" | sed 's/^/  /'
  else
    curl -s -w '\n  [HTTP %{http_code}]\n' --max-time 20 \
      -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
      "$URL$path" | sed 's/^/  /'
  fi
}

for rel in dinners signups code_attempts dinner_availability; do
  probe GET "/rest/v1/$rel?select=*"
done

# Correct arity, so PostgREST actually resolves the function and we learn about
# EXECUTE rather than about the signature. Both take a non-existent id, so even
# if the call were permitted it reads, raises and writes nothing:
#   hold_seat       -> 'dinner_not_found'
#   confirm_payment -> 'signup_not_found'
probe POST /rest/v1/rpc/hold_seat \
  '{"p_dinner_id":"00000000-0000-0000-0000-000000000000","p_name":"PROBE","p_phone":"+15550000000","p_diet":"","p_hold_minutes":1}'

probe POST /rest/v1/rpc/confirm_payment \
  '{"p_session_id":"cs_probe_does_not_exist","p_payment_intent":"pi_probe","p_amount_cents":0}'
