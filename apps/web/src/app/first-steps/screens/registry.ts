// Which component draws which screen of First Steps (spec 0067; GLOSSARY: First Steps): one file per screen.
import type { ComponentType } from "react";
import type { FirstStepsScreen } from "@ziffr/core/first-steps-screens";
import { BusinessScreen } from "./business";
import { CustomersScreen } from "./customers";
import { DoneScreen } from "./done";
import { FirstScreen } from "./first";
import { OwnScreen } from "./own";
import { RoleScreen } from "./role";
import { SenderScreen } from "./sender";
import { SetScreen } from "./set";
import { SetsScreen } from "./sets";
import { StartScreen } from "./start";
import { TopicScreen } from "./topic";
import type { ScreenProps } from "./types";
import { ValueScreen } from "./value";
import { WhoScreen } from "./who";
import { WorkspaceScreen } from "./workspace";

/** Every screen, by the name `?step=` takes. */
export const SCREENS: Record<FirstStepsScreen, ComponentType<ScreenProps>> = {
  who: WhoScreen, role: RoleScreen, business: BusinessScreen, customers: CustomersScreen, topic: TopicScreen, workspace: WorkspaceScreen, start: StartScreen,
  sets: SetsScreen, set: SetScreen, first: FirstScreen, own: OwnScreen, value: ValueScreen, sender: SenderScreen, done: DoneScreen,
};
