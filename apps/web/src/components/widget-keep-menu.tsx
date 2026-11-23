// The Widget menu's two submenus by intent (GLOSSARY: Widget, View Design): "Add to…" puts a copy where it is shown
// (a dashboard, a deck), "Save as…" keeps it for later (a Widget in the Pool, a Widget Template, a View Design).
// One definition for the ⋯ menu and the right-click menu: the caller passes whichever menu primitives it renders with.
import type { ReactNode } from "react";
import { Copy, FileDown, BookmarkPlus, LayoutDashboard, LayoutTemplate, Presentation, Plus } from "lucide-react";

/** The menu primitives the submenus need; the dropdown and the context menu both provide them. */
export type KeepMenuKit = {
  Item: (p: { onClick?: () => void; children?: ReactNode }) => ReactNode;
  Separator: () => ReactNode;
  Sub: (p: { children?: ReactNode }) => ReactNode;
  SubTrigger: (p: { children?: ReactNode }) => ReactNode;
  SubContent: (p: { className?: string; children?: ReactNode }) => ReactNode;
};

type Props = {
  K: KeepMenuKit;
  /** Dashboards the viewer may add a copy to; none hides "Dashboard". */
  targets: { id: number; name: string }[];
  /** Whether the Widget is saved on a dashboard: a deck copy and a template need it. */
  saved: boolean;
  /** A Free layout cannot become a Widget Template. */
  canSaveTemplate: boolean;
  /** Whether the Widget is drawn with a View Design to save or download. */
  hasDesign: boolean;
  onAddToDashboard: (d: { id: number; name: string }) => void;
  onAddToDeck: () => void;
  onSaveWidget: () => void;
  onSaveTemplate: () => void;
  onSaveDesign: () => void;
  onDownloadDesign: () => void;
};

/** "Add to…" and "Save as…", each only when it has an entry the person may use. */
export function WidgetKeepMenu({ K, targets, saved, canSaveTemplate, hasDesign, onAddToDashboard, onAddToDeck, onSaveWidget, onSaveTemplate, onSaveDesign, onDownloadDesign }: Props) {
  return (
    <>
      {(targets.length > 0 || saved) && (
        <K.Sub>
          <K.SubTrigger><Plus /> Add to…</K.SubTrigger>
          <K.SubContent className="max-w-72">
            {targets.length > 0 && (
              <K.Sub>
                <K.SubTrigger><LayoutDashboard /> Dashboard</K.SubTrigger>
                <K.SubContent>
                  {targets.map((d) => <K.Item key={d.id} onClick={() => onAddToDashboard(d)}>{d.name}</K.Item>)}
                </K.SubContent>
              </K.Sub>
            )}
            {/* A copy onto a slide of a deck the person may change (ticket #1); the core checks the rest. */}
            {saved && <K.Item onClick={onAddToDeck}><Presentation /> Deck…</K.Item>}
          </K.SubContent>
        </K.Sub>
      )}
      <K.Sub>
        <K.SubTrigger><BookmarkPlus /> Save as…</K.SubTrigger>
        <K.SubContent className="max-w-72">
          <K.Item onClick={onSaveWidget}><BookmarkPlus /> Widget</K.Item>
          {saved && canSaveTemplate && <K.Item onClick={onSaveTemplate}><LayoutTemplate /> Template…</K.Item>}
          {hasDesign && (
            <>
              <K.Item onClick={onSaveDesign}><Copy /> View Design</K.Item>
              <K.Separator />
              <K.Item onClick={onDownloadDesign}><FileDown /> Download View Design file</K.Item>
            </>
          )}
        </K.SubContent>
      </K.Sub>
    </>
  );
}
