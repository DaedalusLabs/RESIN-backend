import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import * as secp from '@noble/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';

function normalizeKey(key: string): string {
  // Remove '02' or '03' prefix if present (compressed format)
  if (key.length === 66 && (key.startsWith('02') || key.startsWith('03'))) {
    return key.slice(2);
  }
  // Remove '04' prefix if present (uncompressed format)
  if (key.length === 130 && key.startsWith('04')) {
    return key.slice(2, 66);
  }
  return key;
}

interface EncryptionResult {
  ciphertext: string; // The encrypted message in NIP-04 format
  pubkey: string; // The public key used for encryption (needed for decryption)
}

/**
 * NIP-04 compliant message encryption
 * Compatible with window.nostr.nip04.encrypt
 * Returns both the encrypted message and the public key needed for decryption
 */
export async function encryptMessage(
  pubkeyHex: string,
  message: string
): Promise<EncryptionResult> {
  try {
    // Normalize and validate the public key
    pubkeyHex = normalizeKey(pubkeyHex);
    if (pubkeyHex.length !== 64) {
      throw new Error('Invalid public key length');
    }

    // Validate the public key by attempting to use it
    try {
      secp.getPublicKey(Buffer.from(pubkeyHex, 'hex'));
    } catch {
      throw new Error('Invalid public key: Point is not on curve');
    }

    // Generate 32 bytes of random data for the encryption
    const privkey = randomBytes(32);
    // Get the corresponding public key that will be needed for decryption
    const ourPubkey = bytesToHex(secp.getPublicKey(privkey, true));

    // Calculate shared point
    const sharedPoint = secp.getSharedSecret(
      bytesToHex(privkey),
      '02' + pubkeyHex, // Add back compressed format prefix
      true
    );
    const sharedX = sharedPoint.slice(1, 33);

    // Generate 16 random bytes for IV
    const iv = randomBytes(16);

    // Create cipher
    const cipher = createCipheriv('aes-256-cbc', sharedX, iv);
    let encryptedMessage = cipher.update(message, 'utf8', 'base64');
    encryptedMessage += cipher.final('base64');

    // Return both the encrypted message and our public key
    return {
      ciphertext: `${iv.toString('base64')}?${encryptedMessage}`,
      pubkey: ourPubkey,
    };
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * NIP-04 compliant message decryption
 * Compatible with window.nostr.nip04.decrypt
 * @param privkeyHex - The private key to decrypt with
 * @param pubkeyHex - The public key of the sender
 * @param encryptedData - The encrypted message in NIP-04 format (base64(iv) + "?" + base64(ciphertext))
 */
export async function decryptMessage(
  privkeyHex: string,
  pubkeyHex: string,
  encryptedData: string
): Promise<string> {
  try {
    // Validate private key
    if (!secp.utils.isValidPrivateKey(privkeyHex)) {
      throw new Error('Invalid private key');
    }

    // Normalize and validate the public key
    pubkeyHex = normalizeKey(pubkeyHex);
    if (pubkeyHex.length !== 64) {
      throw new Error('Invalid public key length');
    }

    // Split IV and encrypted message
    const [ivBase64, encryptedMessage] = encryptedData.split('?');
    if (!ivBase64 || !encryptedMessage) {
      throw new Error('Invalid encrypted data format');
    }

    // Convert IV from base64
    const iv = Buffer.from(ivBase64, 'base64');

    // Calculate shared point
    const sharedPoint = secp.getSharedSecret(
      privkeyHex,
      '02' + pubkeyHex, // Add back compressed format prefix
      true
    );
    const sharedX = sharedPoint.slice(1, 33);

    // Create decipher
    const decipher = createDecipheriv('aes-256-cbc', sharedX, iv);
    let decrypted = decipher.update(encryptedMessage, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
