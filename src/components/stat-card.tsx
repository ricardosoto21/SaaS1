import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "orange",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  accent?: "orange" | "teal" | "indigo";
}) {
  const accentClass =
    accent === "teal"
      ? "bg-teal-600/10 text-teal-700"
      : accent === "indigo"
        ? "bg-indigo-600/10 text-indigo-700"
        : "bg-orange-600/10 text-orange-700";

  return (
    <article className="surface rounded-[1.8rem] p-5">
      <div className={`inline-flex rounded-2xl p-3 ${accentClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-5 label">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-sm text-stone-600">{hint}</p>
    </article>
  );
}

