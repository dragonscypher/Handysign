const FORBIDDEN_KEYS = new Set([
  "rawvideo",
  "videoblob",
  "framepixels",
  "imagedata",
  "canvasdata",
  "dataurl",
  "jpeg",
  "jpg",
  "png",
  "webp",
  "base64",
]);

export function assertNoRawVideoFields(value: unknown): void {
  const seen = new WeakSet<object>();

  const visit = (current: unknown, path: string) => {
    if (!current || typeof current !== "object") {
      return;
    }

    if (seen.has(current as object)) {
      return;
    }

    seen.add(current as object);

    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }

    for (const [key, nested] of Object.entries(current)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new Error(`Forbidden raw video field detected at ${path}.${key}`);
      }

      visit(nested, `${path}.${key}`);
    }
  };

  visit(value, "root");
}
