export function ThemeToggle() {
  return (
    <button
      type="button"
      data-theme-toggle
      aria-label="Toggle dark mode"
      className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-700 shadow-sm transition hover:border-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-stone-500"
    >
      <span className="text-stone-500 dark:text-stone-400">Dark</span>
      <span className="relative h-4 w-8 rounded-full bg-stone-200 dark:bg-stone-700">
        <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-stone-950 transition-all dark:left-4 dark:bg-teal-300" />
      </span>
    </button>
  );
}
