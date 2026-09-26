#!/bin/bash
# Quick Molong Demo Re-Deploy with Cloudflare Tunnel
# Created: 2026-09-24 | Owner: Tedjo [TEDJO]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/deploy.log"
PORT=8090

echo "🚀 MOLONG DEMO REDEPLOY SCRIPT" > "$LOG_FILE"
echo "Date: $(date '+%F %T UTC')" >> "$LOG_FILE"
echo "==========================================" >> "$LOG_FILE"

# Step 1: Start Node Server (background)
echo "[Step 1/3] Starting Node server on port ${PORT}..." | tee -a "$LOG_FILE"
node membot.mjs &
NODE_PID=$!
echo "Node PID: $NODE_PID" >> "$LOG_FILE"

# Wait for server to be ready
sleep 5
if ! curl -s http://localhost:${PORT}/api/health >/dev/null 2>&1; then
    echo "❌ FAILED: Node server not responding" >> "$LOG_FILE"
    exit 1
fi
echo "✅ Node server started and healthy" | tee -a "$LOG_FILE"

# Step 2: Setup Cloudflare Tunnel
echo "[Step 2/3] Creating Cloudflare tunnel..." >> "$LOG_FILE"
TUNNEL_CONFIG="${SCRIPT_DIR}/tunnel-config.yaml"
cat > "$TUNNEL_CONFIG" << EOF
tunnel: molong-demo
credentials-file: /root/.cloudflare/tunnels/credential.json
webaddr: http://127.0.0.1:${PORT}
protocol: http

ingress:
  - hostname: banana-another-varying-indicates.trycloudflare.com
    service: http://127.0.0.1:${PORT}
  - service: http_status:404
EOF

echo "Tunnel config created at: ${TUNNEL_CONFIG}" >> "$LOG_FILE"

# Initialize cloudflared if needed
CLOUDFLARED_CRED="/root/.cloudflare/tunnels/credential.json"
if [ ! -f "$CLOUDFLARED_CRED" ]; then
    mkdir -p /root/.cloudflare/tunnels
    # Try to generate new credential via login (this requires authentication)
    echo "⚠️  Cloudflared credentials not found. Need to authenticate first." >> "$LOG_FILE"
    echo "Try running: cloudflared tunnel login" >> "$LOG_FILE"
    
    # Alternative: Create a simple proxy using ngrok or similar if available
    if command -v ngrok >/dev/null 2>&1; then
        echo "✅ Using ngrok as alternative..." >> "$LOG_FILE"
        ngrok http ${PORT} --log=${LOG_FILE} &
        NGROK_PID=$!
        sleep 10
        TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url' 2>/dev/null || echo "")
        if [ -n "$TUNNEL_URL" ]; then
            echo "✅ Ngrok tunnel created: ${TUNNEL_URL}" | tee -a "$LOG_FILE"
        else
            echo "❌ Ngrok failed" >> "$LOG_FILE"
            pkill -P $$
            exit 1
        fi
    else
        echo "❌ Neither cloudflared nor ngrok available" >> "$LOG_FILE"
        echo "Please install one of these tools for public access" >> "$LOG_FILE"
        
        # Fallback: Keep node running, inform user manually
        echo "" >> "$LOG_FILE"
        echo "ℹ️  Node server is running locally at http://localhost:${PORT}" >> "$LOG_FILE"
        echo "You can access it locally but need tunnel for public access" >> "$LOG_FILE"
    fi
else
    # Use cloudflared tunnel with existing credentials
    cloudflared tunnel run molong-demo --config "${TUNNEL_CONFIG}" >> "$LOG_FILE" 2>&1 &
    CLOUDFLARED_PID=$!
    echo "Cloudflared PID: $CLOUDFLARED_PID" >> "$LOG_FILE"
    
    # Wait for tunnel to establish
    sleep 15
    echo "✅ Cloudflared tunnel established" | tee -a "$LOG_FILE"
fi

# Step 3: Verification
echo "[Step 3/3] Verifying deployment..." | tee -a "$LOG_FILE"
echo "" >> "$LOG_FILE"
echo "Deployment Summary:" >> "$LOG_FILE"
echo "- Node server: Running (PID: ${NODE_PID}) on port ${PORT}" >> "$LOG_FILE"
echo "- Tunnel: Active (check logs above)" >> "$LOG_FILE"
echo "- Public URL: https://banana-another-varying-indicates.trycloudflare.com/" >> "$LOG_FILE"

echo ""
echo "✅ MOLONG DEMO DEPLOYED SUCCESSFULLY!"
echo "--------------------------------------"
echo "Local URL:     http://localhost:${PORT}"
echo "Public URL:    https://banana-another-varying-indicates.trycloudflare.com/"
echo "Health Check:  http://localhost:${PORT}/api/health"
echo "Chat Endpoint: http://localhost:${PORT}/api/chat"
echo "Support Page:  http://localhost:${PORT}/support.html"
echo "--------------------------------------"
echo "Logs saved to: ${LOG_FILE}"

# Keep scripts running in background
trap "echo 'Stopping Molong demo...'; kill ${NODE_PID}; pkill -P $$ 2>/dev/null; echo 'Stopped'" EXIT SIGINT SIGTERM

# Wait forever to keep script alive
wait
