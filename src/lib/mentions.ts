
export function parseMentionIds(html: string): string[] {
  const regex = /data-type="mention"[^>]*data-id="([^"]+)"/g;
  const ids: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}
