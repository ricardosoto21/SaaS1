type SearchParams = Record<string, string | string[] | undefined>;

function getParam(searchParams: SearchParams | undefined, key: string) {
  const value = searchParams?.[key];
  return typeof value === "string" ? value : "";
}

export function PageNotice({ searchParams }: { searchParams?: SearchParams }) {
  const error = getParam(searchParams, "error");
  const success = getParam(searchParams, "success");

  if (!error && !success) {
    return null;
  }

  return (
    <div
      className={
        error
          ? "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
          : "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
      }
    >
      {error || success}
    </div>
  );
}
