import "@testing-library/jest-dom/vitest";

const storage = (() => {
  let values: Record<string, string> = {};

  return {
    clear: () => {
      values = {};
    },
    getItem: (key: string) => values[key] ?? null,
    key: (index: number) => Object.keys(values)[index] ?? null,
    removeItem: (key: string) => {
      delete values[key];
    },
    setItem: (key: string, value: string) => {
      values[key] = String(value);
    },
    get length() {
      return Object.keys(values).length;
    },
  };
})();

// Testes de servidor (// @vitest-environment node) não têm window.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}
