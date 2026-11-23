// @ts-nocheck
// The keyed address of a logo (GLOSSARY: Theme): with no secret at all there is no key, so no address is made.
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashOf, publicLook } from "./brand-logo";
import type { ThemeLook } from "./theme-look";

afterEach(() => vi.unstubAllEnvs());
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("the logo address key", () => {
  it("fails closed when neither ZIFFR_SECRETS_KEY nor the service key is set", () => {
    vi.stubEnv("ZIFFR_SECRETS_KEY", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => hashOf("w", PNG)).toThrow();
    expect(publicLook("00000000-0000-4000-8000-000000000000", { logo: PNG } as ThemeLook).logo).toBeNull();
  });
  it("keys the address by Workspace and by secret", () => {
    vi.stubEnv("ZIFFR_SECRETS_KEY", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "a");
    const a = hashOf("w1", PNG);
    expect(hashOf("w2", PNG)).not.toBe(a);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "b");
    expect(hashOf("w1", PNG)).not.toBe(a);
  });
});
