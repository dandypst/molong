#!/usr/bin/env python3
"""Test Molong demo interaction with username 'tedjo'"""
import requests
import json
from datetime import datetime

BASE = "http://localhost:8090"
LOG_FILE = "/root/.hermes/profiles/rio/home/rio/work/walrus-s8/membot/tedjo_interaction_log.json"

def send_message(user, text):
    """Send message to Molong API"""
    try:
        response = requests.post(
            f"{BASE}/api/chat",
            json={"text": text, "user": user},
            timeout=60
        )
        return response.json()
    except Exception as e:
        return {"error": str(e)}

def main():
    print("=" * 80)
    print("  🤖 MOLONG DEMO TEST - Username: 'tedjo'")
    print(f"  Date: {datetime.now().isoformat()}")
    print("=" * 80)
    
    tests = [
        ("First intro", "Hello Molong! My name is Tedjo. I live in Indonesia."),
        ("Add preferences", "My favorite color is blue and I love coffee."),
        ("Add work info", "I'm working on bug bounty projects this week."),
        ("Recall test 1", "What did I tell you about myself?"),
        ("Add more detail", "I also have a project called Molong using Walrus Memory."),
        ("Final recall", "Remember what I told you earlier? Tell me everything."),
    ]
    
    results = []
    for i, (test_name, message) in enumerate(tests, 1):
        print(f"\n[{i}/{len(tests)}] Test: {test_name}")
        print(f"   Message: '{message}'")
        
        result = send_message("tedjo", message)
        results.append({
            "timestamp": datetime.now().isoformat(),
            "step": i,
            "test_name": test_name,
            "input": message,
            "output": result
        })
        
        if "reply" in result:
            reply_preview = result["reply"][:200] + "..." if len(result["reply"]) > 200 else result["reply"]
            print(f"   ✅ Reply: {reply_preview}")
            if result.get("memoriesRecalled"):
                print(f"   📝 Memories recalled: {result['memoriesRecalled']}")
        elif "error" in result:
            print(f"   ❌ Error: {result['error']}")
        
        # Small delay between messages
        import time
        time.sleep(2)
    
    # Save full log
    with open(LOG_FILE, "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n{'='*80}")
    print("  ✅ TEST COMPLETE!")
    print(f"{'='*80}")
    print(f"\nFull logs saved to: {LOG_FILE}")
    print("\nNext steps:")
    print("1. Review logs to see if memory is being stored/recalled")
    print("2. Check auth status - if all recalls show empty, auth issue persists")
    print("3. Share results with team for assessment")

if __name__ == "__main__":
    main()
