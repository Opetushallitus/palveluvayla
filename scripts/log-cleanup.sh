#!/usr/bin/env bash
set -euo pipefail

: "${ROOT_PATH:?ROOT_PATH must be set}"
: "${RETENTION_DAYS:?RETENTION_DAYS must be set}"
DRY_RUN="${DRY_RUN:-true}"

if [[ ! "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "RETENTION_DAYS must be a non-negative integer" >&2
  exit 1
fi

if [[ "$DRY_RUN" != "true" && "$DRY_RUN" != "false" ]]; then
  echo "DRY_RUN must be true or false" >&2
  exit 1
fi

if [[ ! -d "$ROOT_PATH" ]]; then
  echo "Cleanup root does not exist: $ROOT_PATH" >&2
  exit 1
fi

echo "Starting cleanup root=$ROOT_PATH retention_days=$RETENTION_DAYS dry_run=$DRY_RUN"

manifest="$(mktemp)"
trap 'rm -f "$manifest"' EXIT

find "$ROOT_PATH" \
  -type f \
  \( -name 'mlog-*.zip' -o -name 'mlog-*.zip.gpg' \) \
  -mtime +"$RETENTION_DAYS" \
  -print0 > "$manifest"

found_count=0
found_bytes=0
deleted_count=0
deleted_bytes=0
delete_failures=0

while IFS= read -r -d '' file; do
  size="$(stat -c %s -- "$file")"
  found_count=$((found_count + 1))
  found_bytes=$((found_bytes + size))

  if [[ "$DRY_RUN" == "false" ]]; then
    if rm -- "$file"; then
      deleted_count=$((deleted_count + 1))
      deleted_bytes=$((deleted_bytes + size))
    else
      delete_failures=$((delete_failures + 1))
      printf 'Failed to delete path=%q\n' "$file" >&2
    fi
  fi
done < "$manifest"

echo "Cleanup done found_count=$found_count found_bytes=$found_bytes deleted_count=$deleted_count deleted_bytes=$deleted_bytes delete_failures=$delete_failures dry_run=$DRY_RUN"

if ((delete_failures > 0)); then
  exit 1
fi
