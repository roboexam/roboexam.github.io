import type { Plugin } from "vite";
import { redact, redactionsFor } from "./static-redactions.mjs";

// GITHUB_PAGES builds only: rewrites app sources and data (as raw text, before the JSON plugin) so the
// bundles and the prerendered pages never contain the redacted strings.
export function staticRedaction(): Plugin {
  const rules = redactionsFor();
  return {
    name: "static-redaction",
    enforce: "pre",
    apply: () => process.env.GITHUB_PAGES === "true",
    transform(code, id) {
      if (!/\/app\/.*\.(?:tsx?|json)(?:\?|$)/.test(id)) return null;
      const next = redact(code, rules);
      return next === code ? null : { code: next, map: null };
    },
  };
}
