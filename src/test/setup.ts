import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only unmounts on its own with Vitest globals enabled; this project imports from "vitest" explicitly.
afterEach(() => {
  cleanup();
});
