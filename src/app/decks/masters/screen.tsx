"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ImagePlus, Plus, Star, Trash2 } from "lucide-react";
import { MasterArt } from "@/decks/master";
import { SLIDE_H, SLIDE_W } from "@/decks/layouts";
import { makeDefaultMaster, saveMaster } from "@/app/master-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LogoPosition, Master, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

const BLANK: Master = {
  id: 0, owner_id: "", name: "New master", background_color: "#F7F4F0", background_image: null, logo: null, logo_ratio: 3,
  logo_position: "top-right", logo_width: 140, footer: "", show_slide_number: true, text_color: "#2B2420", title_size: 56, body_size: 24, is_default: false,
};

const POSITIONS: { id: LogoPosition; label: string }[] = [
  { id: "top-left", label: "Top left" }, { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" }, { id: "bottom-right", label: "Bottom right" },
];

/** Scales a 1280 × 720 slide to whatever width its box has. */
function Preview({ master, sample = true }: { master: Master; sample?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / SLIDE_W));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-input)] shadow-[var(--edge-stock)]">
      <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: "0 0", position: "absolute" }}>
        <MasterArt master={master} w={SLIDE_W} h={SLIDE_H} index={1} sample={sample} />
      </div>
    </div>
  );
}

function readImage(file: File, max: number): Promise<{ url: string; ratio: number }> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return reject(new Error("Use a PNG, JPEG, WebP or SVG image."));
    if (file.size > max) return reject(new Error(`Keep it under ${Math.round(max / 1_000_000)} MB for the prototype.`));
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      const img = new Image();
      img.onload = () => resolve({ url, ratio: img.naturalWidth / Math.max(1, img.naturalHeight) || 3 });
      img.onerror = () => resolve({ url, ratio: 3 });
      img.src = url;
    };
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}

export function MastersScreen({ masters, current, isNew, people, viewer }: { masters: Master[]; current: Master | null; isNew: boolean; people: Profile[]; viewer: string }) {
  const router = useRouter();
  const [m, setM] = useState<Master>(isNew || !current ? { ...BLANK, owner_id: viewer } : current);
  useEffect(() => setM(isNew || !current ? { ...BLANK, owner_id: viewer } : current), [current, isNew, viewer]);
  const [pending, start] = useTransition();
  const canEdit = isNew || m.owner_id === viewer;
  const owner = people.find((p) => p.id === m.owner_id);
  const set = <K extends keyof Master>(k: K, v: Master[K]) => setM((x) => ({ ...x, [k]: v }));

  const upload = (kind: "logo" | "background_image") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const { url, ratio } = await readImage(f, kind === "logo" ? 1_000_000 : 2_000_000);
      setM((x) => ({ ...x, [kind]: url, ...(kind === "logo" ? { logo_ratio: ratio } : {}) }));
    } catch (err) {
      toast.error("Image not added", { description: (err as Error).message });
    }
  };

  const save = () =>
    start(async () => {
      try {
        const { id, owner_id, is_default, ...input } = m;
        void owner_id; void is_default;
        const saved = await saveMaster(isNew ? null : id, input);
        toast.success("Master saved", { description: "Every deck using it shows the change." });
        router.push(`/decks/masters?id=${saved}`);
      } catch (err) {
        toast.error("Not saved", { description: (err as Error).message });
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-3">
        {masters.map((x) => (
          <Link key={x.id} href={`/decks/masters?id=${x.id}`} aria-current={!isNew && x.id === m.id ? "page" : undefined} className={cn("block rounded-[var(--radius-card)] p-2 no-underline transition-colors", !isNew && x.id === m.id ? "stock" : "hover:bg-muted")}>
            <Preview master={x} sample={false} />
            <div className="mt-2 flex items-center gap-1.5 px-1 text-sm font-medium">
              {x.name}
              {x.is_default && <span className="text-xs font-normal text-muted-foreground">default</span>}
            </div>
          </Link>
        ))}
        <Link href="/decks/masters?new=1" className="flex min-h-10 items-center gap-1.5 rounded-[var(--radius-stock)] px-3 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground"><Plus aria-hidden className="size-4" /> New master</Link>
        <Link href="/decks" className="block px-3 text-sm underline">Back to decks</Link>
      </aside>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <Preview master={m} />
          <p className="mt-2 text-xs text-muted-foreground">
            Preview at slide size with sample text. {canEdit ? "Changes show here as you make them; save to apply them to every deck." : `${owner?.name ?? "Its creator"} made this master. Only they can edit it; you can use it in any deck.`}
          </p>
        </div>

        <fieldset disabled={!canEdit || pending} className="stock space-y-4 rounded-[var(--radius-card)] p-4 disabled:opacity-80">
          <legend className="sr-only">Master settings</legend>
          <Field label="Name"><Input value={m.name} onChange={(e) => set("name", e.target.value)} /></Field>

          <Field label="Background">
            <div className="flex items-center gap-2">
              <input type="color" aria-label="Background colour" value={m.background_color} onChange={(e) => set("background_color", e.target.value)} className="h-9 w-12 rounded-[var(--radius-input)] border border-input bg-card p-1" />
              <ImageButton label={m.background_image ? "Replace image" : "Add image"} onChange={upload("background_image")} />
              {m.background_image && <IconButton label="Remove background image" onClick={() => set("background_image", null)} />}
            </div>
          </Field>

          <Field label="Logo">
            <div className="flex items-center gap-2">
              <ImageButton label={m.logo ? "Replace logo" : "Add logo"} onChange={upload("logo")} />
              {m.logo && <IconButton label="Remove logo" onClick={() => set("logo", null)} />}
            </div>
            {m.logo && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-muted p-1 shadow-[var(--press-groove)]" role="radiogroup" aria-label="Logo position">
                  {POSITIONS.map((p) => (
                    <button key={p.id} type="button" role="radio" aria-checked={m.logo_position === p.id} onClick={() => set("logo_position", p.id)} className={cn("min-h-8 rounded-[var(--radius-input)] text-xs transition-colors", m.logo_position === p.id ? "stock font-medium" : "text-muted-foreground hover:text-foreground")}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <label className="block text-xs text-muted-foreground">
                  Width <span className="fig text-foreground">{m.logo_width}px</span>
                  <input type="range" min={40} max={400} step={10} value={m.logo_width} onChange={(e) => set("logo_width", Number(e.target.value))} className="mt-1 w-full accent-[var(--color-ink)]" />
                </label>
              </div>
            )}
          </Field>

          <Field label="Footer"><Input value={m.footer} placeholder="e.g. Northwind Goods, internal" onChange={(e) => set("footer", e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={m.show_slide_number} onChange={(e) => set("show_slide_number", e.target.checked)} className="size-4 accent-[var(--color-ink)]" />
            Slide numbers
          </label>

          <Field label="Type">
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <label>Colour<input type="color" value={m.text_color} onChange={(e) => set("text_color", e.target.value)} className="mt-1 block h-9 w-full rounded-[var(--radius-input)] border border-input bg-card p-1" /></label>
              <label>Title px<Input type="number" min={24} max={96} value={m.title_size} onChange={(e) => set("title_size", Number(e.target.value))} className="mt-1" /></label>
              <label>Body px<Input type="number" min={12} max={48} value={m.body_size} onChange={(e) => set("body_size", Number(e.target.value))} className="mt-1" /></label>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Sizes apply to slides you add from now on; the colour applies to the footer and number.</p>
          </Field>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" onClick={save}>{isNew ? "Create master" : "Save master"}</Button>
            {!isNew && !m.is_default && (
              <Button type="button" variant="outline" onClick={() => start(async () => { await makeDefaultMaster(m.id); toast.success(`${m.name} is now the default for new decks`); })}>
                <Star aria-hidden /> Make default
              </Button>
            )}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}

function ImageButton({ label, onChange }: { label: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="stock inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-stock)] px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
      <ImagePlus aria-hidden className="size-4" /> {label}
      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onChange} className="sr-only" />
    </label>
  );
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex size-9 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground">
      <Trash2 className="size-4" />
    </button>
  );
}
