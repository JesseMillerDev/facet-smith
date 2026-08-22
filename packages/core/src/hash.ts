/**
 * FNV-1a over UTF-16 code units. `Math.imul` fixes multiplication to unsigned
 * 32-bit semantics, making this identical in browsers and Node.js.
 */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashToBucket(input: string): number {
  return stableHash(input) / 0x1_0000_0000;
}

export function assignmentKey(
  experimentId: string,
  subjectId: string,
  salt = "",
  iteration = "",
): string {
  const frame = (value: string): string => `${value.length}:${value}`;
  const legacyKey = `${frame(experimentId)}|${frame(subjectId)}|${frame(salt)}`;
  return iteration ? `${legacyKey}|${frame(iteration)}` : legacyKey;
}
