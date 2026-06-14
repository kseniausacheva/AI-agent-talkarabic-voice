/** Мягкий бренд-фон для экранов входа/регистрации: размытые цветовые пятна. */
export function AuthBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="brand-rule absolute inset-x-0 top-0" />
      <div className="absolute -right-28 -top-24 h-80 w-80 rounded-full bg-tint opacity-80 blur-3xl" />
      <div
        className="absolute -bottom-28 -left-24 h-72 w-72 rounded-full blur-3xl"
        style={{
          background: "color-mix(in oklab, var(--color-accent) 9%, transparent)",
        }}
      />
    </div>
  );
}
