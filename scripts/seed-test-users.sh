#!/usr/bin/env bash
# seed-test-users.sh
#
# Creates test users test2-test12 (password: aaabbbcc)
# Optionally adds them all to a league with roster assignments.
#
# Usage:
#   ./scripts/seed-test-users.sh                  # just create users
#   ./scripts/seed-test-users.sh <leagueId>       # create users + add to league

set -euo pipefail

API_URL="${API_URL:-http://localhost:5000/api}"
PASSWORD="aaabbbcc"
LEAGUE_ID="${1:-}"

echo "=== TBDFF Test User Seeder ==="
echo "API: $API_URL"
echo ""

# ── Step 1: Register test2-test12 ──────────────────────────────────────────────

declare -A USER_IDS

for i in $(seq 2 12); do
  USERNAME="test${i}"
  EMAIL="test${i}@test.com"

  echo -n "Registering ${USERNAME}... "
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${USERNAME}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" = "201" ]; then
    USER_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    USER_IDS[$USERNAME]="$USER_ID"
    echo "OK (id: ${USER_ID:0:8}...)"
  elif echo "$BODY" | grep -q "already"; then
    echo "SKIPPED (already exists)"
    # Login to get user ID
    LOGIN_RESP=$(curl -s -X POST "${API_URL}/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}")
    USER_ID=$(echo "$LOGIN_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    USER_IDS[$USERNAME]="$USER_ID"
  else
    echo "FAILED (HTTP ${HTTP_CODE})"
    echo "  $BODY"
  fi
done

echo ""
echo "Users ready: ${#USER_IDS[@]}"

# ── Step 2: Add to league (if leagueId provided) ──────────────────────────────

if [ -z "$LEAGUE_ID" ]; then
  echo ""
  echo "No league ID provided. To add users to a league, run:"
  echo "  ./scripts/seed-test-users.sh <leagueId>"
  exit 0
fi

echo ""
echo "=== Adding users to league ${LEAGUE_ID:0:8}... ==="

# Login as test1 (commissioner) to get token for roster assignments
echo -n "Logging in as test1 (commissioner)... "
COMM_RESP=$(curl -s -X POST "${API_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"test1\",\"password\":\"${PASSWORD}\"}")
COMM_TOKEN=$(echo "$COMM_RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$COMM_TOKEN" ]; then
  echo "FAILED - could not log in as test1"
  echo "$COMM_RESP"
  exit 1
fi
echo "OK"

ROSTER_SLOT=2
for i in $(seq 2 12); do
  USERNAME="test${i}"
  USER_ID="${USER_IDS[$USERNAME]:-}"

  if [ -z "$USER_ID" ]; then
    echo "Skipping ${USERNAME} (no user ID)"
    continue
  fi

  # Login as this user
  echo -n "  ${USERNAME}: login... "
  LOGIN_RESP=$(curl -s -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}")
  USER_TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -z "$USER_TOKEN" ]; then
    echo "FAILED login"
    continue
  fi

  # Join league
  echo -n "join... "
  JOIN_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/leagues/${LEAGUE_ID}/members" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${USER_TOKEN}")
  JOIN_CODE=$(echo "$JOIN_RESP" | tail -1)

  if [ "$JOIN_CODE" = "201" ] || echo "$JOIN_RESP" | grep -q "Already"; then
    echo -n "roster ${ROSTER_SLOT}... "

    # Commissioner assigns roster
    ASSIGN_RESP=$(curl -s -w "\n%{http_code}" -X PUT \
      "${API_URL}/leagues/${LEAGUE_ID}/rosters/${ROSTER_SLOT}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${COMM_TOKEN}" \
      -d "{\"user_id\":\"${USER_ID}\"}")
    ASSIGN_CODE=$(echo "$ASSIGN_RESP" | tail -1)

    if [ "$ASSIGN_CODE" = "200" ]; then
      echo "OK"
    else
      echo "roster assign failed (HTTP ${ASSIGN_CODE})"
    fi
  else
    echo "join failed (HTTP ${JOIN_CODE})"
  fi

  ROSTER_SLOT=$((ROSTER_SLOT + 1))
done

echo ""
echo "=== Done! League ${LEAGUE_ID:0:8}... should now have 12 members ==="
