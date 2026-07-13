import { useEffect, useRef, useState } from "react";

/**
 * Inline text editor for an edge label, rendered inside `<EdgeLabelRenderer>`.
 *
 * - Auto-focuses and selects the existing value on mount.
 * - Enter or blur = submit (empty value deletes the label).
 * - Escape = cancel without saving.
 * - Stops propagation on key / pointer events so canvas hotkeys and pan
 *   do not interfere while typing.
 */
export default function EdgeLabelEditor({
  initialValue,
  labelX,
  labelY,
  fontSize,
  color,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  labelX: number;
  labelY: number;
  fontSize: number;
  color: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={commit}
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
        pointerEvents: "all",
        fontSize: `${fontSize}px`,
        color,
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: 4,
        padding: "2px 6px",
        outline: "none",
        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        minWidth: 80,
        textAlign: "center",
      }}
      className="nodrag nopan"
      maxLength={80}
    />
  );
}
