/**
 * Tests for src/lib/encrypt.ts and src/lib/soft-delete.ts
 * All functions are pure (no DB, no Prisma).
 */

import { encrypt, decrypt, maskCredential } from "../lib/encrypt";
import { notDeleted, ACTIVE } from "../lib/soft-delete";

// ── encrypt / decrypt round-trip ──────────────────────────────────────────────

describe("encrypt / decrypt", () => {
  test("empty string encrypts to empty string", () => {
    expect(encrypt("")).toBe("");
  });

  test("empty string decrypts to empty string", () => {
    expect(decrypt("")).toBe("");
  });

  test("non-base64 string without colons decrypts to empty string", () => {
    expect(decrypt("not-encrypted")).toBe("");
  });

  test("round-trip: decrypt(encrypt(x)) === x for a short string", () => {
    const plaintext = "Hello, DentalOS!";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  test("round-trip: preserves unicode and special characters", () => {
    const plaintext = "Doctor: Ng Wai Loon — RM1,200.00 💊";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  test("round-trip: preserves long strings", () => {
    const plaintext = "A".repeat(1000);
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  test("two encryptions of the same plaintext produce different ciphertext (random IV)", () => {
    const a = encrypt("secret");
    const b = encrypt("secret");
    expect(a).not.toBe(b);
  });

  test("encrypted output is colon-delimited base64 (IV:authTag:ciphertext)", () => {
    const enc = encrypt("test");
    const parts = enc.split(":");
    expect(parts).toHaveLength(3);
    // Each part must be valid base64 (no exception when parsed)
    parts.forEach((p) => {
      expect(() => Buffer.from(p, "base64")).not.toThrow();
      expect(p.length).toBeGreaterThan(0);
    });
  });

  test("tampered ciphertext decrypts to empty string (GCM auth tag mismatch)", () => {
    const enc = encrypt("sensitive");
    const [iv, authTag, data] = enc.split(":");
    // Flip last character of ciphertext
    const tampered = `${iv}:${authTag}:${data.slice(0, -1)}A`;
    expect(decrypt(tampered)).toBe("");
  });
});

// ── maskCredential ────────────────────────────────────────────────────────────

describe("maskCredential", () => {
  test("null returns empty string", () => {
    expect(maskCredential(null)).toBe("");
  });

  test("undefined returns empty string", () => {
    expect(maskCredential(undefined)).toBe("");
  });

  test("empty string returns empty string", () => {
    expect(maskCredential("")).toBe("");
  });

  test("short value (< 8 chars) returns ****", () => {
    expect(maskCredential("abc")).toBe("****");
    expect(maskCredential("1234567")).toBe("****");
  });

  test("value of exactly 8 chars is masked as first4 + **** + last4", () => {
    expect(maskCredential("12345678")).toBe("1234****5678");
  });

  test("long plain value shows first 4 and last 4 with **** in between", () => {
    expect(maskCredential("ABCDEFGHIJKLMNOP")).toBe("ABCD****MNOP");
  });

  test("encrypted value: decrypts first, then masks the plaintext", () => {
    const plaintext = "super-secret-api-key";
    const enc = encrypt(plaintext);
    const masked = maskCredential(enc);
    // Decrypted plaintext is 20 chars → first 4 + **** + last 4
    expect(masked).toBe("supe****-key");
  });
});

// ── notDeleted ────────────────────────────────────────────────────────────────

describe("notDeleted", () => {
  test("returns { deletedAt: null } when no where clause provided", () => {
    expect(notDeleted()).toEqual({ deletedAt: null });
  });

  test("merges deletedAt:null into an existing where clause", () => {
    expect(notDeleted({ clinicId: "clinic-1", active: true })).toEqual({
      deletedAt: null,
      clinicId: "clinic-1",
      active: true,
    });
  });

  test("deletedAt:null always present even when where has other keys", () => {
    const result = notDeleted({ id: "x" });
    expect(result.deletedAt).toBeNull();
    expect(result.id).toBe("x");
  });

  test("empty object argument produces { deletedAt: null }", () => {
    expect(notDeleted({})).toEqual({ deletedAt: null });
  });
});

// ── ACTIVE constant ───────────────────────────────────────────────────────────

describe("ACTIVE", () => {
  test("is { deletedAt: null }", () => {
    expect(ACTIVE).toEqual({ deletedAt: null });
  });
});
