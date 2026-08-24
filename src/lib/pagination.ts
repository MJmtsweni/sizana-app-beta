// Shared page size for every paginated list fetch, so behavior stays
// consistent across screens (and there's one place to tune it).
export const PAGE_SIZE = 20;

export function pageRange(page: number, pageSize: number = PAGE_SIZE): [number, number] {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  return [from, to];
}
