// Everything the E2E suite needs from .env.test, in one place. Scenarios that talk to OpenRouter call
// `requireOpenRouterKey()` and skip themselves when the key is not configured.
import { test } from "@playwright/test";

// The cheapest paid model on OpenRouter: the scenarios only check that a reply arrives, never what it says.
export const E2E_MODEL_ID = "meta-llama/llama-3.2-1b-instruct";
export const GUEST_STATE = { cookies: [], origins: [] };

export const e2eAccount = () => {
  const email = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error("E2E_USERNAME and E2E_PASSWORD are required (see .env.test.example)");
  }
  return { email, password };
};

export const openRouterKey = () => process.env.E2E_OPENROUTER_KEY?.trim() || null;

export const requireOpenRouterKey = () => {
  test.skip(!openRouterKey(), "E2E_OPENROUTER_KEY is not set: this scenario talks to OpenRouter");
};

// Unique per run, so list assertions never hit leftovers from an earlier run.
export const runTag = () => `e2e-${Date.now().toString(36)}`;
