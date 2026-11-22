import { describe, expect, it } from "vitest";
import { packVoucher } from "./pack-voucher";

describe("packVoucher", () => {
  it("says only what the signature proves about a signed Pack: the handle, never a review", () => {
    const v = packVoucher({ id: "northwind/saas", signed: true, fromMarketplace: true, hasLogo: true });
    expect(v.vouched).toBe(true);
    expect(v.lines).toEqual(["Published through the Marketplace as @northwind."]);
  });
  it("says an uploaded file is self-declared, and shows its id as written", () => {
    const v = packVoucher({ id: "northwind/saas", signed: false, fromMarketplace: false, hasLogo: true });
    expect(v.vouched).toBe(false);
    expect(v.lines[0]).toMatch(/^Uploaded file\. The Marketplace did not check it\./);
    expect(v.lines[1]).toContain("northwind/saas");
    expect(v.lines).toHaveLength(2);
  });
  it("says an unsigned file that claims to be from Ziffr is not", () => {
    const v = packVoucher({ id: "ziffr/saas-metrics", signed: false, fromMarketplace: false, hasLogo: false });
    expect(v.lines.at(-1)).toBe("This file says it is from Ziffr. It is not signed by the Marketplace.");
  });
  it("an upload never reads as vouched, even when it says it is signed", () => {
    expect(packVoucher({ id: "ziffr/x", signed: true, fromMarketplace: false, hasLogo: true }).vouched).toBe(false);
  });
});
