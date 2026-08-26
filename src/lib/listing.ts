import { isAfter, isBefore, parseISO } from "date-fns";

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export interface PaginationResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
}

const allowedPageSizes = [10, 25, 50, 100];

export function getParam(params: SearchParamsRecord, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

function getPositiveNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getPageSize(params: SearchParamsRecord, defaultSize = 25, pageSizeParam = "pageSize") {
  const requested = getPositiveNumber(getParam(params, pageSizeParam), defaultSize);
  return allowedPageSizes.includes(requested) ? requested : defaultSize;
}

export function paginateItems<T>(
  items: T[],
  params: SearchParamsRecord,
  pageParam = "page",
  pageSizeParam = "pageSize",
): PaginationResult<T> {
  const pageSize = getPageSize(params, 25, pageSizeParam);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = getPositiveNumber(getParam(params, pageParam), 1);
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;
  const pagedItems = items.slice(start, start + pageSize);

  return {
    items: pagedItems,
    page,
    pageSize,
    total,
    totalPages,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  };
}

export function isInsideOptionalRange(value: string, from: string, to: string) {
  const date = parseISO(value);
  const fromDate = from ? parseISO(`${from}T00:00:00`) : null;
  const toDate = to ? parseISO(`${to}T23:59:59`) : null;

  if (fromDate && isBefore(date, fromDate)) {
    return false;
  }

  if (toDate && isAfter(date, toDate)) {
    return false;
  }

  return true;
}

export function matchesQuery(q: string, values: Array<string | number | null | undefined>) {
  const query = q.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

export function uniqueValues(values: string[]) {
  return values.filter((value, index, list) => value && list.indexOf(value) === index).sort((a, b) => a.localeCompare(b, "es-CL"));
}

export function buildHref(path: string, params: SearchParamsRecord, updates: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string" && value) {
      query.set(key, value);
    }
  });

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      query.delete(key);
    } else {
      query.set(key, String(value));
    }
  });

  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}
