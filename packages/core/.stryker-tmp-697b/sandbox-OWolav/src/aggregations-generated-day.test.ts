// @ts-nocheck
// Generated daily series against the reference, by every longer Display Period (spec 0022; GLOSSARY: Aggregation).
import { describe } from "vitest";
import { generatedTests } from "./test/reference/generated";

describe("combining a daily Metric", () => generatedTests("day"));
