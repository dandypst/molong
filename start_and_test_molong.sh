#!/bin/bash
# Start Molong Server with new credentials
cd ~/.hermes/profiles/rio/home/rio/work/walrus-s8/membot

echo "🚀 Starting Molong server..."
timeout 120 node membot.mjs > /tmp/molong_after_key_rotation.log 2>&1 &
SERVER_PID=$!

echo "Server PID: $SERVER_PID"

# Wait for server to be ready
sleep 15

echo ""
echo "Testing server health..."
if curl -s http://localhost:8090/api/health | grep -q "ok"; then
    echo "✅ Server started successfully!"
    
    echo ""
    echo "Starting test interactions with username 'tedjo'..."
    python3 /root/.hermes/profiles/rio/home/rio/work/walrus-s8/membot/test_tedjo_interactions.py
    
else
    echo "❌ Server failed to start or health check failed"
    echo "Check logs at: /tmp/molong_after_key_rotation.log"
fi
