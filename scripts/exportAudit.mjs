export const FORBIDDEN_EXPORT_FIELDS = [
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
];

const FORBIDDEN_FIELD_SET = new Set(FORBIDDEN_EXPORT_FIELDS);

export function validateExportPayload(value) {
  const seen = new WeakSet();

  const visit = (current, path) => {
    if (!current || typeof current !== "object") {
      return;
    }

    if (seen.has(current)) {
      return;
    }

    seen.add(current);

    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }

    for (const [key, nested] of Object.entries(current)) {
      if (FORBIDDEN_FIELD_SET.has(key.toLowerCase())) {
        throw new Error(`Forbidden export field detected at ${path}.${key}`);
      }

      visit(nested, `${path}.${key}`);
    }
  };

  visit(value, "root");
}
