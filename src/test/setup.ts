import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Date helpers format in the process time zone; pin it so day boundaries are the same on every machine.
process.env.TZ = "UTC";

// Testing Library only unmounts on its own with Vitest globals enabled; this project imports from "vitest" explicitly.
afterEach(() => {
  cleanup();
});
