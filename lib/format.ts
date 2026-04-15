export function sanitizeDecimal(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "");
  const dotIdx = v.indexOf(".");
  if (dotIdx !== -1) {
    v = v.slice(0, dotIdx + 1) + v.slice(dotIdx + 1).replace(/\./g, "");
    const parts = v.split(".");
    if (parts[1] && parts[1].length > 2) {
      parts[1] = parts[1].slice(0, 2);
      v = parts.join(".");
    }
  }
  return v;
}

export function sanitizeInteger(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}
