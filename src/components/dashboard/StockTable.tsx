"use client";

import { useMemo, useState } from "react";

export type StockItem = {
  id: string;
  itemCode: string;
  productName: string;
  quantity: number;
  unit: string;
  updatedAt?: string | null;
};

type StockTableProps = {
  items: StockItem[];
  loading?: boolean;
};

export function StockTable({ items, loading = false }: StockTableProps) {
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return items;
    }

    return items.filter((item) =>
      `${item.itemCode} ${item.productName}`.toLowerCase().includes(query),
    );
  }, [items, search]);

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Stock summary
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Consumables recorded at the selected nest.
          </p>
        </div>

        <label className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 sm:w-64">
          <span className="text-gray-400" aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search stock"
            aria-label="Search by item code or product name"
            className="w-full border-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
          />
        </label>
      </div>

      {loading ? (
        <p className="p-8 text-center text-sm text-gray-500">
          Loading stock…
        </p>
      ) : filteredItems.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">
          {items.length === 0
            ? "No stock items have been added for this nest."
            : "No items match your search."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">Item code</th>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Quantity</th>
                <th className="px-5 py-3 font-medium">Last updated</th>
              </tr>
            </thead>

            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="px-5 py-4 font-mono text-xs text-gray-600">
                    {item.itemCode}
                  </td>
                  <td className="px-5 py-4 font-medium text-gray-900">
                    {item.productName}
                  </td>
                  <td className="px-5 py-4 text-gray-700">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="px-5 py-4 text-gray-500">
                    {item.updatedAt
                      ? new Date(item.updatedAt).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
        Showing {filteredItems.length}{" "}
        {filteredItems.length === 1 ? "item" : "items"}
      </div>
    </section>
  );
}