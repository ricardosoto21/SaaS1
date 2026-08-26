export function PageHeader({
  eyebrow,
  title,
  description,
  side,
}: {
  eyebrow: string;
  title: string;
  description: string;
  side?: React.ReactNode;
}) {
  return (
    <header className="surface-strong pattern-panel rounded-[2rem] px-6 py-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="label">{eyebrow}</p>
          <h1 className="mt-2 text-4xl leading-tight font-semibold md:text-5xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600 md:text-base">{description}</p>
        </div>
        {side ? <div className="lg:min-w-[260px]">{side}</div> : null}
      </div>
    </header>
  );
}

