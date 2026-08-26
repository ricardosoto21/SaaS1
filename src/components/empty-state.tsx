export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="surface-muted rounded-[1.6rem] border border-dashed p-6 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
    </div>
  );
}

