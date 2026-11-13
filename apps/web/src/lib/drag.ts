// The item currently dragged from the Pool. HTML5 drag data isn't readable during dragover,
// so canvases read the source from here to size the drop preview.
import type { DropSource } from "@/app/canvas-actions";

let current: DropSource | null = null;
export const setDrag = (s: DropSource | null) => (current = s);
export const getDrag = () => current;
