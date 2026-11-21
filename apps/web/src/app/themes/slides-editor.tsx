"use client";
// The slide part of a Theme (GLOSSARY: Theme): what every slide of a deck shows, previewed at slide size.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
// The browser's own words for an image it will not take, shown as a refusal.
import { Refused, shown } from "@/lib/action-error";
import { ImagePlus, Trash2 } from "lucide-react";
import { MasterArt } from "@/decks/master";
import { SLIDE_H, SLIDE_W } from "@/decks/layouts";
import { Input } from "@/components/ui/input";
import type { LogoPosition, SlideDesign, ThemeSlides } from "@ziffr/core/types";
import { cn } from "@/lib/utils";

const POSITIONS: { id: LogoPosition; label: string }[] = [
  { id: "top-left", label: "Top left" }, { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" }, { id: "bottom-right", label: "Bottom right" },
];

/** Scales a 1280 × 720 slide to whatever width its box has. */
export function SlidePreview({ design }: { design: SlideDesign }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / SLIDE_W));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-input)] shadow-[0_0_0_1px_var(--color-rule)]">
      <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: "0 0", position: "absolute" }}>
        <MasterArt master={design} w={SLIDE_W} h={SLIDE_H} index={1} sample />
      </div>
    </div>
  );
}

function readImage(file: File, max: number, logo = false): Promise<{ url: string; ratio: number }> {
  return new Promise((resolve, reject) => {
    // A logo goes into emails and onto public pages: smaller and without WebP (the server holds it to the same limits).
    if (!(logo ? /^image\/(png|jpeg|svg\+xml)$/ : /^image\/(png|jpeg|webp|svg\+xml)$/).test(file.type)) return reject(new Refused(logo ? "Use a PNG, JPEG or SVG image for the logo." : "Use a PNG, JPEG, WebP or SVG image."));
    if (file.size > max) return reject(new Refused(`Use an image under ${max >= 1_000_000 ? `${Math.round(max / 1_000_000)} MB` : `${Math.round(max / 1000)} KB`}.`));
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      const img = new Image();
      img.onload = () => (logo && file.type !== "image/svg+xml" && Math.max(img.naturalWidth, img.naturalHeight) > 512 ? reject(new Refused("Use a logo of at most 512 × 512 pixels.")) : resolve({ url, ratio: img.naturalWidth / Math.max(1, img.naturalHeight) || 3 }));
      img.onerror = () => resolve({ url, ratio: 3 });
      img.src = url;
    };
    r.onerror = () => reject(new Refused("Could not read the file."));
    r.readAsDataURL(file);
  });
}

export function SlidesEditor({ s, onChange }: { s: ThemeSlides; onChange: (s: ThemeSlides) => void }) {
  const set = <K extends keyof ThemeSlides>(k: K, v: ThemeSlides[K]) => onChange({ ...s, [k]: v });
  const upload = (kind: "logo" | "background_image") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const { url, ratio } = await readImage(f, kind === "logo" ? 256_000 : 2_000_000, kind === "logo");
      onChange(kind === "logo" ? { ...s, logo: url, logo_ratio: ratio } : { ...s, background_image: url });
    } catch (err) {
      toast.error("Image not added", { description: shown(err) });
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ImageButton label={s.logo ? "Replace logo" : "Add logo"} onChange={upload("logo")} />
        {s.logo && <RemoveButton label="Remove logo" onClick={() => set("logo", null)} />}
        <ImageButton label={s.background_image ? "Replace background" : "Background image"} onChange={upload("background_image")} />
        {s.background_image && <RemoveButton label="Remove background image" onClick={() => set("background_image", null)} />}
      </div>
      {s.logo && (
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-end gap-3">
          <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-input)] bg-muted p-1" role="radiogroup" aria-label="Logo position">
            {POSITIONS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={s.logo_position === p.id} onClick={() => set("logo_position", p.id)} className={cn("min-h-8 rounded-[var(--radius-input)] text-xs", s.logo_position === p.id ? "bg-card font-medium shadow-[0_0_0_1px_var(--color-rule)]" : "text-muted-foreground hover:text-foreground")}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="block text-xs text-muted-foreground">
            Logo width <span className="fig text-foreground">{s.logo_width}px</span>
            <input type="range" min={40} max={400} step={10} value={s.logo_width} onChange={(e) => set("logo_width", Number(e.target.value))} className="mt-1 w-full accent-[var(--color-ink)]" />
          </label>
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium">Footer</span>
        <Input value={s.footer} placeholder="e.g. Company name, internal" onChange={(e) => set("footer", e.target.value)} />
        <span className="mt-1 block text-xs text-muted-foreground">A deck can set its own footer.</span>
      </label>
      <div className="grid grid-cols-3 items-end gap-2 text-xs">
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={s.show_slide_number} onChange={(e) => set("show_slide_number", e.target.checked)} className="size-4 accent-[var(--color-ink)]" />
          Numbers
        </label>
        <label className="block text-muted-foreground">Title px<Input type="number" min={24} max={96} value={s.title_size} onChange={(e) => set("title_size", Number(e.target.value))} className="mt-1" /></label>
        <label className="block text-muted-foreground">Body px<Input type="number" min={12} max={48} value={s.body_size} onChange={(e) => set("body_size", Number(e.target.value))} className="mt-1" /></label>
      </div>
    </div>
  );
}

function ImageButton({ label, onChange }: { label: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-input)] border border-input bg-card px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
      <ImagePlus aria-hidden className="size-4" /> {label}
      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onChange} className="sr-only" />
    </label>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex size-9 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground">
      <Trash2 className="size-4" />
    </button>
  );
}
