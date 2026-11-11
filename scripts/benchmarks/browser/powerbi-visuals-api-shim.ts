// The real package is Node-only metadata; pbiviz externalises it and inlines
// its const enums. Browser bundles of src/ modules only need the namespace.
export default (globalThis as any).powerbi;
