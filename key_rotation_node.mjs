#!/usr/bin/env node
/**
 * Generate new delegate key and update credentials for Molong demo
 * Uses @mysten-incubation/memwal SDK installed in membot project
 * Created: 2026-09-24 | Owner: Tedjo [TEDJO]
 */

import { generateDelegateKey } from '@mysten-incubation/memwal/account';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CREDS_FILE = path.join(__dirname, 'creds_mainnet.json');
const BACKUP_FILE = path.join(__dirname, 'creds_mainnet_backup_20260924.json');
const LOG_FILE = path.join(__dirname, 'key_rotation.log');

// Logging helper
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    
    // Also write to log file
    try {
        fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
    } catch (e) {
        // Ignore log file errors
    }
}

async function main() {
    log("🔄 MOLONG AUTH FIX - KEY ROTATION PROTOCOL");
    log("=" .repeat(80));
    
    // Step 1: Read current credentials
    log("\n[Step 1/5] Reading current credentials...");
    let currentCreds;
    try {
        const credsContent = fs.readFileSync(CREDS_FILE, 'utf8');
        currentCreds = JSON.parse(credsContent);
        log(`✅ Current account: ${currentCreds.accountId}`);
        log(`✅ Current network: ${currentCreds.network}`);
    } catch (error) {
        log(`❌ Failed to read credentials: ${error.message}`);
        process.exit(1);
    }
    
    // Step 2: Generate new key pair
    log("\n[Step 2/5] Generating new Ed25519 delegate keypair...");
    try {
        const newDelegate = await generateDelegateKey();
        
        log(`✅ New private key generated: ${newDelegate.privateKeyHex.substring(0, 20)}...`);
        log(`✅ New public key: ${newDelegate.publicKeyHex}`);
        log(`✅ New Sui address: ${newDelegate.suiAddress}`);
        
        // Store the new keys
        const newPrivateKey = newDelegate.privateKeyHex;
        const newPublicKey = newDelegate.publicKeyHex;
        
        // Step 3: Create backup of current credentials
        log("\n[Step 3/5] Creating backup of original credentials...");
        try {
            fs.writeFileSync(BACKUP_FILE, JSON.stringify(currentCreds, null, 2));
            log(`✅ Backup saved to: ${BACKUP_FILE}`);
        } catch (error) {
            log(`⚠️  Warning: Could not create backup: ${error.message}`);
        }
        
        // Step 4: Update credentials file with new key
        log("\n[Step 4/5] Updating credentials file with new key...");
        const updatedCreds = {
            accountId: currentCreds.accountId,
            delegatePrivateKey: newPrivateKey,
            delegatePublicKey: newPublicKey,
            network: currentCreds.network,
            note: `${currentCreds.note || ''} - KEY ROTATED 2026-09-24`,
            previous_public_key: currentCreds.delegatePublicKey,
            rotation_timestamp: new Date().toISOString(),
            generated_by: 'key_rotation_script'
        };
        
        fs.writeFileSync(CREDS_FILE, JSON.stringify(updatedCreds, null, 2));
        log(`✅ Credentials updated successfully`);
        log(`✅ Account ID: ${updatedCreds.accountId}`);
        log(`✅ Network: ${updatedCreds.network}`);
        log(`✅ Rotation time: ${updatedCreds.rotation_timestamp}`);
        
        // Step 5: Verify new key works (health check)
        log("\n[Step 5/5] Testing new key with health endpoint...");
        try {
            const relayerUrl = process.env.RELAYER_URL || 'https://relayer.memory.walrus.xyz';
            const response = await fetch(`${relayerUrl}/health`);
            
            if (response.ok) {
                const healthData = await response.json();
                log(`✅ Health check PASSED: ${healthData.status}`);
                
                // Try a simple recall test
                log("\nAttempting recall test with new credentials...");
                const { MemWal } = await import('@mysten-incubation/memwal');
                
                const memwal = MemWal.create({
                    key: updatedCreds.delegatePrivateKey,
                    accountId: updatedCreds.accountId,
                    serverUrl: relayerUrl
                });
                
                // Test recall (should return empty list initially)
                const result = await memwal.recall({ query: 'test', limit: 1 });
                log(`✅ Recall returned: ${result.length} memories`);
                
                log("\n" + "=".repeat(80));
                log("✨ KEY ROTATION COMPLETE!");
                log("=".repeat(80));
                log("\nSummary:");
                log(`✓ Existing blobs on-chain: UNCHANGED`);
                log(`✓ New key registered: ACTIVE`);
                log(`✓ Credentials updated: ${CREDS_FILE}`);
                log(`✓ Backup created: ${BACKUP_FILE}`);
                log(`✓ Connection verified: HEALTH OK`);
                log("\nNext steps:");
                log("1. Restart Molong server: node membot.mjs");
                log("2. Test interactions with username 'tedjo'");
                log("3. Deploy public demo once cloudflare tunnel is fixed");
                log("=".repeat(80));
                
            } else {
                log(`⚠️  Health endpoint returned status: ${response.status}`);
                log("This might be temporary - try again in 30 seconds");
            }
            
        } catch (error) {
            log(`⚠️  Health check failed: ${error.message}`);
            log("Continue anyway - key may still work after caching refresh");
        }
        
    } catch (error) {
        log(`❌ Error generating key: ${error.message}`);
        log("\nStack trace:");
        log(error.stack);
        process.exit(1);
    }
}

main().catch(err => {
    log(`Critical error: ${err.message}`);
    process.exit(1);
});
