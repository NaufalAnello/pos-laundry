#!/bin/bash
# Script untuk deploy update ke hg680p
# Password: admin

HOST="192.168.88.233"
USER="root"
PASS="admin"
APP_DIR="/root/pos-laundry"

echo "🚀 Deploying to hg680p (${HOST})..."
echo ""

# Function untuk execute command via SSH
ssh_exec() {
  sshpass -p "${PASS}" ssh -o StrictHostKeyChecking=no ${USER}@${HOST} "$1"
}

# 1. Cek koneksi
echo "1️⃣  Checking connection..."
if ! ping -c 1 ${HOST} &> /dev/null; then
  echo "❌ Cannot reach ${HOST}"
  exit 1
fi
echo "✅ Connection OK"
echo ""

# 2. Pull latest code
echo "2️⃣  Pulling latest code from GitHub..."
ssh_exec "cd ${APP_DIR} && git pull"
echo ""

# 3. Install dependencies (if any new)
echo "3️⃣  Installing dependencies..."
ssh_exec "cd ${APP_DIR} && npm install --production"
echo ""

# 4. Run migrations
echo "4️⃣  Running database migrations..."
ssh_exec "cd ${APP_DIR} && npm run migrate"
echo ""

# 5. Restart PM2
echo "5️⃣  Restarting application..."
ssh_exec "pm2 restart pos-laundry"
echo ""

# 6. Check status
echo "6️⃣  Checking application status..."
ssh_exec "pm2 status pos-laundry"
echo ""

echo "✨ Deployment complete!"
echo ""
echo "📋 Updates deployed:"
echo "  • Fix bug estimasi tampil semua '2 hr'"
echo "  • Searchable dropdown layanan di order baru"
echo ""
echo "🌐 Access at: http://${HOST}:3001"
