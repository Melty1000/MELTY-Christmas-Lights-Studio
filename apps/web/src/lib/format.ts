export function formatToken(token: string): string {
  return token
    .toLowerCase()
    .split(/[_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
