import { dasApi, type DasApiInterface } from '@metaplex-foundation/digital-asset-standard-api';
import { getAssetWithProof, transfer } from '@metaplex-foundation/mpl-bubblegum';
import { createNoopSigner, publicKey, type Umi } from '@metaplex-foundation/umi';
import bs58 from 'bs58';

import { getBubblegumTreeAddress } from './metaplex.js';
import { getAdminUmi } from './solana-admin.js';

// Moving a trophy out.
// ---------------------------------------------------------------------------
// A trophy is a compressed NFT whose leaf owner is the customer's embedded
// wallet. Moving it to a wallet they control elsewhere is a Bubblegum
// `transfer`, which only the leaf owner can authorise — so the customer has
// to sign, and the customer's wallet holds no SOL. The split:
//
//   prepare: the server fetches the asset + its Merkle proof, builds the
//            transfer with the ADMIN as fee payer, signs as fee payer, and
//            hands the half-signed transaction to the browser.
//   (browser: Privy signs with the embedded wallet — the only signature the
//            program actually checks for ownership.)
//   send:    the server checks the message is one it signed — nothing can
//            have been altered without breaking the admin signature — then
//            submits and confirms.
//
// The server never sees a customer key, and the relay cannot be used to send
// arbitrary transactions on the admin's dime: only messages carrying a valid
// admin signature over the exact bytes are forwarded.

/** Umi whose rpc also speaks DAS (asset + proof lookups). */
type UmiDas = Umi & { rpc: DasApiInterface };

let cachedUmi: UmiDas | null = null;

function umiWithDas(): UmiDas {
  if (!cachedUmi) cachedUmi = getAdminUmi().use(dasApi()) as UmiDas;
  return cachedUmi;
}

/** Sanity check for a base58 Solana address: 32 bytes once decoded. */
export function isSolanaAddress(value: string): boolean {
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}

export interface PreparedTransfer {
  /** Base64 transaction, signed by the admin fee payer, awaiting the owner. */
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
  owner: string;
}

export class TransferError extends Error {
  constructor(
    public code: 'not_found' | 'not_our_tree' | 'not_your_trophy' | 'bad_address' | 'same_wallet' | 'not_prepared_here' | 'unsigned',
    message: string
  ) {
    super(message);
  }
}

/**
 * Builds the transfer of `assetId` from one of `ownerWallets` to `to`, paid
 * for by the admin. Throws TransferError for every caller-caused refusal.
 */
export async function prepareTransfer(
  ownerWallets: string[],
  assetId: string,
  to: string
): Promise<PreparedTransfer> {
  if (!isSolanaAddress(assetId)) throw new TransferError('not_found', 'Unknown trophy.');
  if (!isSolanaAddress(to)) throw new TransferError('bad_address', 'That is not a valid address.');

  const umi = umiWithDas();
  const tree = await getBubblegumTreeAddress();

  let asset;
  try {
    asset = await getAssetWithProof(umi, publicKey(assetId), { truncateCanopy: true });
  } catch (err) {
    throw new TransferError('not_found', `Trophy not found: ${(err as Error).message}`);
  }

  if (asset.merkleTree.toString() !== tree) {
    throw new TransferError('not_our_tree', 'That asset was not issued by HeroPad.');
  }
  const owner = asset.leafOwner.toString();
  if (!ownerWallets.includes(owner)) {
    throw new TransferError('not_your_trophy', 'That trophy is not in your vault.');
  }
  if (owner === to) throw new TransferError('same_wallet', 'That is the vault it is already in.');

  const builder = transfer(umi, {
    // The owner must sign, but not here: a no-op signer marks the account as
    // a signer in the message and leaves the slot empty for the browser.
    leafOwner: createNoopSigner(asset.leafOwner),
    leafDelegate: asset.leafDelegate,
    newLeafOwner: publicKey(to),
    merkleTree: asset.merkleTree,
    root: asset.root,
    dataHash: asset.dataHash,
    creatorHash: asset.creatorHash,
    nonce: asset.nonce,
    index: asset.index,
    proof: asset.proof,
  });

  const { blockhash, lastValidBlockHeight } = await umi.rpc.getLatestBlockhash();
  const built = builder.setFeePayer(umi.identity).setBlockhash(blockhash).build(umi);
  const signed = await umi.identity.signTransaction(built);

  return {
    transaction: Buffer.from(umi.transactions.serialize(signed)).toString('base64'),
    blockhash,
    lastValidBlockHeight: Number(lastValidBlockHeight),
    owner,
  };
}

/**
 * Submits a transaction the browser finished signing. Refuses anything the
 * admin did not sign as fee payer, and anything still missing a signature.
 * Returns the base58 signature once confirmed.
 */
export async function sendPreparedTransfer(
  transactionBase64: string,
  lastValidBlockHeight: number
): Promise<string> {
  const umi = umiWithDas();
  const admin = umi.identity.publicKey;

  let tx;
  try {
    tx = umi.transactions.deserialize(Buffer.from(transactionBase64, 'base64'));
  } catch {
    throw new TransferError('not_prepared_here', 'Malformed transaction.');
  }

  if (tx.message.accounts[0] !== admin) {
    throw new TransferError('not_prepared_here', 'Not a HeroPad transaction.');
  }
  const messageBytes = umi.transactions.serializeMessage(tx.message);
  if (!umi.eddsa.verify(messageBytes, tx.signatures[0], admin)) {
    throw new TransferError('not_prepared_here', 'Not a HeroPad transaction.');
  }
  if (tx.signatures.some((s) => s.every((b) => b === 0))) {
    throw new TransferError('unsigned', 'The owner has not signed yet.');
  }

  const signature = await umi.rpc.sendTransaction(tx);
  await umi.rpc.confirmTransaction(signature, {
    strategy: { type: 'blockhash', blockhash: tx.message.blockhash, lastValidBlockHeight },
    commitment: 'confirmed',
  });
  return bs58.encode(signature);
}
