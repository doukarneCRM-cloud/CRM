// Tiny {{path.to.value}} renderer — no external dependency. Missing keys render
// as empty string so a half-filled ctx never leaks `undefined` to the customer.
export function render(body: string, ctx: Record<string, unknown>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = path
      .split('.')
      .reduce<unknown>((acc, key) => (acc == null ? acc : (acc as Record<string, unknown>)[key]), ctx);
    return value == null ? '' : String(value);
  });
}
