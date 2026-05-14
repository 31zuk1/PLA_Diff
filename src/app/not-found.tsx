import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
          Not found
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-stone-950">トピックが見つかりません</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          指定されたクラスターIDは現在のモックデータに存在しません。
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex text-sm font-semibold text-stone-950 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-950"
        >
          ダッシュボードへ戻る
        </Link>
      </div>
    </main>
  );
}
