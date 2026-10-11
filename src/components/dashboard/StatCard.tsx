type StatCardProps = {
    label: string;
    value: string | number;
    detail: string;
    icon: string;
  };
  
  export function StatCard({
    label,
    value,
    detail,
    icon,
  }: StatCardProps) {
    return (
      <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-lg text-emerald-700"
            aria-hidden="true"
          >
            {icon}
          </span>
        </div>
  
        <p className="mt-4 text-2xl font-bold tracking-tight text-gray-900">
          {value}
        </p>
  
        <p className="mt-1 text-sm text-gray-500">{detail}</p>
      </article>
    );
  }