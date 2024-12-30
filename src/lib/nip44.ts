import NDK, {
  NDKEvent,
  NDKPrivateKeySigner,
  NDKUser,
} from '@nostr-dev-kit/ndk';

export async function unwrapMessage(event: NDKEvent, ndk: NDK) {
  let sealSender = ndk.getUser({
    pubkey: event.pubkey,
  });

  if (sealSender.pubkey == (await ndk.signer?.user())?.pubkey) {
    sealSender = await ndk.signer?.user()!;
  }

  // Unwrap gift wrap
  const sealedContent = await ndk.signer?.decrypt(
    sealSender,
    event.content,
    'nip44'
  );
  const seal = JSON.parse(sealedContent || '{}');

  const messageSender = ndk.getUser({
    pubkey: seal.pubkey,
  });

  // Unwrap seal
  const messageContent = await ndk.signer?.decrypt(
    messageSender,
    seal.content,
    'nip44'
  );
  const message = JSON.parse(messageContent || '{}');

  await messageSender.fetchProfile();

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
  // Create unsigned kind 14 message
  const unsignedMsg = {
    kind: 14,
    content,
    tags: [['p', recipientPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  };

  const recipient = await ndk.getUser({
    pubkey: recipientPubkey,
  });

  const wraps = await Promise.all([
    giftWrapMessage(unsignedMsg, recipient, ndk),
    giftWrapMessage(unsignedMsg, await ndk?.signer?.user()!, ndk),
  ]);

  await Promise.all(wraps.map((wrap) => wrap.publish()));

  return wraps[0].id;
}

export async function giftWrapMessage(
  unsignedMsg: string,
  targetUser: NDKUser,
  ndk: NDK
) {
  if (!ndk?.signer) {
    console.log('no signer');
  }

  const signer = await ndk?.signer;

  // Create seal (kind 13)
  const seal = new NDKEvent(ndk);
  seal.kind = 13;
  seal.content = await signer?.encrypt(
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

  // Send to recipient's preferred relays
  return giftWrap;
}
