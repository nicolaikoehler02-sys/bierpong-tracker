import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Getestet wird ausschließlich der Erkennungskern — nicht die Seiten, nicht die Datenbank.
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
