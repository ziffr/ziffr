import { describe, expect, it } from "vitest";
import { packVoucher } from "./pack-voucher";

describe("packVoucher", () => {
  it("says what was done with a signed Pack: the handle, the program's checks, and that no person reviewed it", () => {
    const v = packVoucher({ id: "northwind/saas", signed: true, fromMarketplace: true, hasLogo: true });
    expect(v.vouched).toBe(true);
    expect(v.lines).toEqual(["Published through the Marketplace as @northwind. Checked by program. No person reviewed it."]);
  });
  it("drops the last sentence only for a version the statement says a moderator looked at", () => {
    expect(packVoucher({ id: "northwind/saas", signed: true, fromMarketplace: true, hasLogo: false, reviewed: true }).lines).toEqual(["Published through the Marketplace as @northwind. Checked by program."]);
    expect(packVoucher({ id: "northwind/saas", signed: false, fromMarketplace: false, hasLogo: false, reviewed: true }).lines.join(" ")).not.toContain("Checked by program");
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
  it("says one of Ziffr's own Packs comes with this version, and only when the app says so and it is signed", () => {
    expect(packVoucher({ id: "ziffr/sales", signed: true, fromMarketplace: false, hasLogo: false, included: true })).toEqual({ vouched: true, lines: ["Ziffr\u2019s own Pack: it comes with this version of Ziffr."] });
    expect(packVoucher({ id: "ziffr/sales", signed: false, fromMarketplace: false, hasLogo: false, included: true }).vouched).toBe(false);
  });
});
