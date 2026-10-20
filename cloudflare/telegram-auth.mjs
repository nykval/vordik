const encoder = new TextEncoder();
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function bytesFromHex(value) {
  if (!/^[a-f\d]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

function safeEqual(left, right) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function verifyTelegramInitData(initData, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = bytesFromHex(params.get('hash') ?? '');
  const authDate = Number(params.get('auth_date'));
  if (!receivedHash || !Number.isFinite(authDate)) return null;
  if (authDate > nowSeconds + 60 || nowSeconds - authDate > MAX_AGE_SECONDS) return null;
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = await hmacSha256(encoder.encode('WebAppData'), botToken);
  const calculatedHash = await hmacSha256(secretKey, dataCheckString);
  if (!safeEqual(receivedHash, calculatedHash)) return null;
  try {
    const user = JSON.parse(params.get('user') ?? 'null');
    if (!user || !Number.isSafeInteger(Number(user.id))) return null;
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
      .replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 80);
    return { id: `telegram:${user.id}`, name: name || 'Пользователь Вордик' };
  } catch { return null; }
}
