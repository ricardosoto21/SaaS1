import Link from "next/link";

import { buildHref, type SearchParamsRecord } from "@/lib/listing";
import { cn } from "@/lib/utils";

interface PaginationProps {
  basePath: string;
  page: number;
  pageSize: number;
  pageParam?: string;
  pageSizeParam?: string;
  searchParams: SearchParamsRecord;
  total: number;
  totalPages: number;
  from: number;
  to: number;
}

const pageSizes = [10, 25, 50, 100];

export function Pagination({
  basePath,
  from,
  page,
  pageParam = "page",
  pageSize,
  pageSizeParam = "pageSize",
  searchParams,
  to,
  total,
  totalPages,
}: PaginationProps) {
  const canGoBack = page > 1;
  const canGoForward = page < totalPages;

  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-stone-200/70 pt-4 text-sm text-stone-600 lg:flex-row lg:items-center lg:justify-between">
      <p>
        {total ? `Mostrando ${from}-${to} de ${total}` : "Sin resultados"}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2" method="get">
          {Object.entries(searchParams).map(([key, value]) =>
            typeof value === "string" && value && key !== pageSizeParam && key !== pageParam ? (
              <input key={key} name={key} type="hidden" value={value} />
            ) : null,
          )}
          <select className="select-base !w-auto !py-2 !pr-10" defaultValue={pageSize} name={pageSizeParam}>
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <button className="btn-secondary !py-2" type="submit">
            Ver
          </button>
        </form>

        <Link
          aria-disabled={!canGoBack}
          className={cn("btn-secondary !py-2", !canGoBack && "pointer-events-none opacity-45")}
          href={buildHref(basePath, searchParams, { [pageParam]: page - 1 })}
        >
          Anterior
        </Link>
        <span className="rounded-full bg-white/70 px-3 py-2 font-semibold text-stone-800">
          {page}/{totalPages}
        </span>
        <Link
          aria-disabled={!canGoForward}
          className={cn("btn-secondary !py-2", !canGoForward && "pointer-events-none opacity-45")}
          href={buildHref(basePath, searchParams, { [pageParam]: page + 1 })}
        >
          Siguiente
        </Link>
      </div>
    </div>
  );
}
