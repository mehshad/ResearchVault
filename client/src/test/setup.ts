// Loaded before every component test: adds the DOM matchers
// (toBeInTheDocument, toBeDisabled, ...) to vitest's expect, and unmounts
// whatever a test rendered so the next one starts on an empty document.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
