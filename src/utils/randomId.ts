const rand = () => crypto.getRandomValues(new Uint32Array(1))[0];

// Generate a random ID that can be used in the database.
//
export function randomId(): string {
  const randomBits = 22;
  const randomBitMask = 2 ** randomBits - 1; // 0000111111111...

  const time = new Date();
  const now = Math.floor((time.getTime() / 1000) * 1024);
  const entropy = rand() & randomBitMask; // truncate from 32 to `randomBits` bits

  return ((BigInt(now) << BigInt(randomBits)) | BigInt(entropy)).toString(10);
};