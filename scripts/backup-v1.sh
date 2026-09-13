#!/usr/bin/env bash
set -euo pipefail
cd /www/wwwroot
zip -r "ship24go_v1_files_$(date +%F_%H%M).zip" ship24go.com \
  -x "ship24go.com/node_modules/*" \
  -x "ship24go.com/.git/*" \
  -x "ship24go.com/.env" \
  -x "ship24go.com/*.log"
mysqldump -u ship24go -p --single-transaction --routines --triggers ship24go | gzip > "/root/ship24go_v1_db_$(date +%F_%H%M).sql.gz"
