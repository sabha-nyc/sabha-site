#!/usr/bin/env bash
# Step 2: prove the anon key can read nothing. Raw output, no interpretation.
#
# An empty array is a FAILED test. We want a permission error on all four.
set -uo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a

URL="${NEXT_PUBLIC_SUPABASE_URL:?}"
ANON="${NEXT_PUBLIC_SUPABASE_ANON_KEY:?}"

case "$ANON" in
  eyJ...*|"") echo "REFUSING: NEXT_PUBLIC_SUPABASE_ANON_KEY is still the placeholder."; exit 2 ;;
esac
echo "# Using the ANON key only. Service-role key is not read by this script."
echo "# Project: $URL"

for rel in dinners signups code_attempts dinner_availability; do
  echo
  echo "──────── GET /rest/v1/$rel?select=* ────────"
  curl -s -i --max-time 15 \
    -H "apikey: $ANON" \
    -H "Authorization: Bearer $ANON" \
    "$URL/rest/v1/$rel?select=*" \
  | sed -e 's/\r$//' -e '/^$/,$!d' -e '1{/^$/d}' -e 's/^/  /' \
  | head -20
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    "$URL/rest/v1/$rel?select=*")
  echo "  [HTTP $code]"
done

echo
echo "──────── RPC probes (should also be denied) ────────"
for fn in hold_seat confirm_payment; do
  echo "  POST /rest/v1/rpc/$fn"
  curl -s --max-time 15 -X POST \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" -d '{}' \
    "$URL/rest/v1/rpc/$fn" | sed 's/^/    /'
  echo
done
