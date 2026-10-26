/**
 * Builds a srcset for responsive poster derivatives that follow the
 * `name-<width>.webp` convention produced for bundled campaign artwork.
 * Uploaded posters that do not match the convention simply use their own URL.
 */
export function posterSrcSet(url: string): string | undefined {
  const match = /^(.*)-\d+\.webp$/.exec(url);
  if (!match) return undefined;
  const base = match[1];
  return [480, 800, 1200, 1672].map((width) => `${base}-${width}.webp ${width}w`).join(', ');
}
