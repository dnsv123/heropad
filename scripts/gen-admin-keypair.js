import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
const kp = Keypair.generate();
console.log('PUBLIC KEY :', kp.publicKey.toBase58());
console.log('PRIVATE KEY (base58):', bs58.encode(kp.secretKey));
console.log('\n⚠️  Salvează private key în 1Password ACUM. Niciodată în git, niciodată în chat.');