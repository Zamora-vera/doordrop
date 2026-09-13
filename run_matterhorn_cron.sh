#!/bin/bash
# Matterhorn Wholesale -> DoorDrop Marketplace Hourly Sync
PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH

echo "=== [$(date '+%Y-%m-%d %H:%M:%S')] Starting Matterhorn Hourly Sync ==="
docker exec -w /app ship24go-doordrop node /app/matterhorn_cron.cjs --batch=10 >> /www/wwwroot/doordrop.lat/matterhorn_sync.log 2>&1
echo "=== [$(date '+%Y-%m-%d %H:%M:%S')] Finished Matterhorn Hourly Sync ==="
