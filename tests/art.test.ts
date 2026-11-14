import { describe, expect, it } from "vitest";
import { ART_LIMITS, artProblems, cleanArt, factionArtProblems, imageDataUrlInfo } from "../src/engine/data/unitArt";

// Real 1x1 images (PNG, WebP) and a JPEG header: only the magic bytes matter for validation.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const WEBP = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP8=";
const b64 = (s: string) => btoa(s);
const PNG_MAGIC = "\x89PNG\r\n\x1a\n";
/** A base64 "PNG" of `n` bytes: the right magic number followed by zeros. */
const fakePng = (n: number) => btoa(PNG_MAGIC + "\0".repeat(n - PNG_MAGIC.length));

describe("image data URLs", () => {
  it("accepts PNG, JPEG and WebP whose bytes match their type", () => {
    expect(imageDataUrlInfo(PNG)?.mime).toBe("image/png");
    expect(imageDataUrlInfo(WEBP)?.mime).toBe("image/webp");
    expect(imageDataUrlInfo(JPEG)?.mime).toBe("image/jpeg");
    expect(imageDataUrlInfo(PNG)!.bytes).toBe(atob(PNG.split(",")[1]!).length);
  });

  it("refuses SVG, mislabelled bytes, other types and non-base64 data", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;
    expect(imageDataUrlInfo(`data:image/svg+xml;base64,${b64(svg)}`)).toBeNull();
    expect(imageDataUrlInfo(`data:image/svg+xml,${encodeURIComponent(svg)}`)).toBeNull();
    // SVG bytes dressed up as a PNG
    expect(imageDataUrlInfo(`data:image/png;base64,${b64(svg)}`)).toBeNull();
    // a PNG claiming to be a JPEG
    expect(imageDataUrlInfo(PNG.replace("image/png", "image/jpeg"))).toBeNull();
    expect(imageDataUrlInfo(`data:image/gif;base64,${b64("GIF89a....")}`)).toBeNull();
    expect(imageDataUrlInfo(`data:text/html;base64,${b64("<b>hi</b>")}`)).toBeNull();
    expect(imageDataUrlInfo(`${PNG}"><img src=x onerror=alert(1)>`)).toBeNull();
    expect(imageDataUrlInfo("javascript:alert(1)")).toBeNull();
    expect(imageDataUrlInfo(42)).toBeNull();
  });

  it("caps the stored size", () => {
    const big = `data:image/png;base64,${fakePng(ART_LIMITS.imageBytes + 10)}`;
    expect(imageDataUrlInfo(big)!.bytes).toBeGreaterThan(ART_LIMITS.imageBytes);
    expect(artProblems({ kind: "image", dataUrl: big }, "Grunts")[0]).toMatch(/larger than/);
    expect(cleanArt({ kind: "image", dataUrl: big })).toBeUndefined();
    // absurdly long strings are refused before any parsing
    expect(imageDataUrlInfo(`data:image/png;base64,${"A".repeat(ART_LIMITS.imageBytes * 5)}`)).toBeNull();
  });

  it("budgets all the uploads in a faction together", () => {
    const one = fakePng(ART_LIMITS.imageBytes - 100);
    const art = { kind: "image", dataUrl: `data:image/png;base64,${one}` };
    const n = Math.ceil(ART_LIMITS.factionImageBytes / ART_LIMITS.imageBytes);
    expect(factionArtProblems(Array.from({ length: n - 1 }, () => ({ art })))).toEqual([]);
    expect(factionArtProblems(Array.from({ length: n + 1 }, () => ({ art })))[0]).toMatch(/uploaded images take/);
  });
});

describe("miniature recipes", () => {
  const good = { body: "brute", head: "beast", headgear: "horns", weapon: "claws", back: "banner", primary: 0x336699, secondary: 0xffc23a, scale: 1.2 };

  it("validates every part", () => {
    expect(artProblems({ kind: "parts", recipe: good }, "X")).toEqual([]);
    expect(artProblems(undefined, "X")).toEqual([]);
    expect(artProblems({ kind: "parts", recipe: { ...good, body: "dragon" } }, "X")[0]).toMatch(/body "dragon"/);
    expect(artProblems({ kind: "parts", recipe: { ...good, scale: 9 } }, "X")[0]).toMatch(/size/);
    expect(artProblems({ kind: "parts", recipe: { ...good, secondary: "red" } }, "X")[0]).toMatch(/trim colour/);
    expect(artProblems({ kind: "video" }, "X")[0]).toMatch(/unknown kind/);
    expect(artProblems("<svg/>", "X")[0]).toMatch(/isn't valid/);
  });

  it("cleans untrusted recipes: known parts only, clamped size, extra fields dropped", () => {
    const notes: string[] = [];
    const out = cleanArt({ kind: "parts", recipe: { ...good, body: "dragon", scale: 7, primary: "#00ff00", onload: "alert(1)" }, extra: "<script>" }, notes, "Grunts");
    expect(out).toEqual({ kind: "parts", recipe: { body: "trooper", head: "beast", headgear: "horns", weapon: "claws", back: "banner", primary: 0x00ff00, secondary: 0xffc23a, scale: ART_LIMITS.scale[1] } });
    expect(notes.some((n) => n.includes("dragon"))).toBe(true);
    expect(artProblems(out, "Grunts")).toEqual([]);
    // no main colour means "use the faction colour"
    const { primary: _p, ...noPrimary } = good;
    expect((cleanArt({ kind: "parts", recipe: noPrimary }) as { recipe: object }).recipe).not.toHaveProperty("primary");
  });

  it("drops junk art with a note", () => {
    const notes: string[] = [];
    expect(cleanArt("nope", notes)).toBeUndefined();
    expect(cleanArt({ kind: "image", dataUrl: "data:image/svg+xml;base64,PHN2Zy8+" }, notes)).toBeUndefined();
    expect(cleanArt({ kind: "gif" }, notes)).toBeUndefined();
    expect(notes).toHaveLength(3);
    expect(cleanArt({ kind: "image", dataUrl: WEBP, zoom: 3 })).toEqual({ kind: "image", dataUrl: WEBP });
  });
});
