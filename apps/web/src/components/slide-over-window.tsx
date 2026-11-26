"use client";
// GLOSSARY: Slide-over. A window that used to be a modal Dialog, drawn in the side panel instead (spec 0050,
// docs/guides/side-panel.md). The screen keeps its own "is it open" state and renders <SlideOverWindow> while it is;
// the window opens the panel when it mounts, closes it when the screen stops rendering it, and tells the screen
// (`onClose`) when the person closes the panel some other way (Escape, the close button, another page).
import { useEffect, useRef } from "react";
import { useSlideOver } from "@/components/slide-over-host";

// Runs `cb` once when the component is gone for good: not on the unmount-and-mount React's strict mode simulates in development.
function useOnUnmount(cb: () => void) {
  const alive = useRef(false);
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      setTimeout(() => { if (!alive.current) latest.current(); }, 0);
    };
  }, []);
}

// Sits in the panel around the content, so the window learns the panel no longer shows it.
function Watch({ onGone, children }: { onGone: () => void; children: React.ReactNode }) {
  useOnUnmount(onGone);
  return <>{children}</>;
}

/** Shows `children` in the side panel while mounted. `children` is read once, when the window opens: give it state of its own rather than props that change. */
export function SlideOverWindow({ title, description, short, onClose, children }: { title: string; description?: string; /** A bottom sheet on a phone (see SlideOverContent). */ short?: boolean; onClose: () => void; children: React.ReactNode }) {
  const { open, replace, close } = useSlideOver();
  const alive = useRef(false);
  const gone = useRef(false);
  const started = useRef(false);
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    alive.current = true;
    gone.current = false;
    // The second run is strict mode's: replace, so the panel does not get a step back to a copy of itself.
    (started.current ? replace : open)({
      title,
      description,
      short,
      content: <Watch onGone={() => { gone.current = true; latest.current(); }}>{children}</Watch>,
    });
    started.current = true;
    return () => {
      alive.current = false;
      // The screen stopped rendering the window (done, or cancelled): close the panel unless the panel was already closed from its own side.
      setTimeout(() => { if (!alive.current && !gone.current) close(); }, 0);
    };
    // Read once, as said above: a later change of title or children must not reopen the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
