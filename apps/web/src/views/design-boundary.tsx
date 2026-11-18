"use client";
// A View Design that cannot be drawn stays one widget's problem (GLOSSARY: View Design): whatever goes wrong while a
// design is drawn, the widget says so and the rest of the dashboard, Snapshot or View Link is drawn as always.
import { Component, type ReactNode } from "react";

/** Draws its child, or a quiet note in its place when drawing it fails. */
export class DesignBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">This View Design could not be drawn.</div>;
    return this.props.children;
  }
}
