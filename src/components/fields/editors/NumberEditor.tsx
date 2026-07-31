import type { FieldEditorProps } from "@/components/fields/fieldHostTypes";

export default function NumberEditor({
  value,
  commit,
  cancel,
}: FieldEditorProps) {
  const num = typeof value === "number" ? value : undefined;

  return (
    <input
      autoFocus
      type="number"
      defaultValue={num ?? ""}
      className="nodrag w-full min-w-0 bg-transparent border-b border-blue-300 outline-none text-sm py-0.5"
      onBlur={(e) => {
        const raw = e.target.value.trim();
        // Champ vidé = null (les clés des values ne sont jamais retirées,
        // le merge serveur ne supprime pas — null marque l'effacement).
        const next = raw === "" ? null : Number(raw);
        if (next === null && num !== undefined) {
          commit(null);
        } else if (next !== null && Number.isFinite(next) && next !== num) {
          commit(next);
        } else {
          cancel();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") cancel();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
