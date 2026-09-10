#!/usr/bin/env bash
# Forward test-mode Stripe events to the local dev server.
#
# Deliberately does NOT use `stripe login`: CLI OAuth is disabled on this
# account for every environment. Authenticating with the test secret key from
# .env.local reaches the same place, and cannot touch live data because the
# key itself is test-mode.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a

case "${STRIPE_SECRET_KEY:-}" in
  sk_test_*|rk_test_*) ;;
  *) echo "REFUSING: STRIPE_SECRET_KEY is not a test key."; exit 2 ;;
esac

export STRIPE_API_KEY="$STRIPE_SECRET_KEY"
exec stripe listen --forward-to "localhost:3000/api/stripe/webhook"
