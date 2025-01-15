import NDK, {
  NDKEvent,
  NDKPrivateKeySigner,
  NDKUser,
} from '@nostr-dev-kit/ndk';

interface UnsignedMessage {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

export async function unwrapMessage(event: NDKEvent, ndk: NDK) {
  let sealSender = ndk.getUser({
    pubkey: event.pubkey,
  });

  const signerUser = await ndk.signer?.user();
  if (signerUser && sealSender.pubkey === signerUser.pubkey) {
    sealSender = signerUser;
  }

  if (!ndk.signer) {
    throw new Error('No signer available');
  }

  // Unwrap gift wrap
  const sealedContent = await ndk.signer.decrypt(
    sealSender,
    event.content,
    'nip44'
  );
  const seal = JSON.parse(sealedContent || '{}');

  const messageSender = ndk.getUser({
    pubkey: seal.pubkey,
  });

  // Unwrap seal
  const messageContent = await ndk.signer.decrypt(
    messageSender,
    seal.content,
    'nip44'
  );
  const message = JSON.parse(messageContent || '{}');

  return {
    id: event.id,
    pubkey: seal.pubkey,
    content: message.content,
    created_at: message.created_at,
    tags: message.tags,
    user: messageSender,
  };
}

export async function sendDirectMessage(
  recipientPubkey: string,
  content: string,
  ndk: NDK
) {
  if (!ndk.signer) {
    throw new Error('No signer available');
  }

  // Create unsigned kind 14 message
  const unsignedMsg: UnsignedMessage = {
    kind: 14,
    content,
    tags: [['p', recipientPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  };

  const recipient = await ndk.getUser({
    pubkey: recipientPubkey,
  });

  const signerUser = await ndk.signer.user();
  if (!signerUser) {
    throw new Error('No signer user available');
  }

  const wraps = await Promise.all([
    giftWrapMessage(unsignedMsg, recipient, ndk),
    giftWrapMessage(unsignedMsg, signerUser, ndk),
  ]);

  await Promise.all(wraps.map((wrap) => wrap.publish()));

  return wraps[0].id;
}

export async function giftWrapMessage(
  unsignedMsg: UnsignedMessage,
  targetUser: NDKUser,
  ndk: NDK
) {
  if (!ndk.signer) {
    throw new Error('No signer available');
  }

  // Create seal (kind 13)
  const seal = new NDKEvent(ndk);
  seal.kind = 13;
  seal.created_at = Math.floor(Date.now() / 1000);
  seal.content = await ndk.signer.encrypt(
    targetUser,
    JSON.stringify(unsignedMsg),
    'nip44'
  );
  await seal.sign();

  const randomSigner = NDKPrivateKeySigner.generate();

  // Create gift wrap (kind 1059)
  const giftWrap = new NDKEvent(ndk);
  giftWrap.kind = 1059;
  giftWrap.tags = [['p', targetUser.pubkey]];
  giftWrap.created_at = seal.created_at - Math.round(Math.random() * 600);
  giftWrap.content = await randomSigner.encrypt(
    targetUser,
    JSON.stringify(seal),
    'nip44'
  );
  await giftWrap.sign(randomSigner);

  return giftWrap;
}
