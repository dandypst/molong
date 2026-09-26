#!/usr/bin/env node
/**
 * Quick Key Generation Test - Debug only
 */
import { generateDelegateKey } from '@mysten-incubation/memwal/account';

async function test() {
    const delegate = await generateDelegateKey();
    console.log("Full object:", JSON.stringify(delegate, null, 2));
    console.log("\nKeys:");
    console.log("- privateKeyHex:", typeof delegate.privateKeyHex);
    console.log("- publicKeyHex:", typeof delegate.publicKeyHex);
    console.log("- suiAddress:", typeof delegate.suiAddress);
}

test().catch(err => {
    console.error("Error:", err.message);
});
