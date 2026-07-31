import { useState } from "react";
import {
  TbChevronDown,
  TbChevronRight,
  TbLayoutColumns,
  TbLayoutRows,
  TbSeparator,
  TbTypography,
} from "react-icons/tb";
import { cn } from "@/lib/utils";
import { fieldRegistry } from "@/components/fields/registry/fieldRegistry";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import type {
  LayoutContainer,
  LayoutNode,
} from "@/../convex/config/templateConfig";
import { layoutNodeLabel } from "./templateDraft";

// Vue structurelle d'un arbre de layout, repliée par défaut.
//
// En LECTURE-SÉLECTION SEULE, et c'est ce qui la rend bon marché : l'ancien
// LayoutCanvas coûtait cher parce qu'il était un éditeur concurrent de la
// maquette — dnd, zones de dépôt, réordonnancement à maintenir en double.
// Une projection de l'état ne peut pas diverger, et une future capacité de
// mise en page ne se construit pas deux fois.
//
// Ce qu'elle apporte que la maquette ne peut pas : un container dont le `gap`
// et le `padding` valent 0 n'a AUCUN pixel qui lui appartienne en propre — ses
// enfants le recouvrent entièrement. Avec `justify: between`, la ligne est
// même invisible. Ici il est atteignable d'un clic.

type LayoutTreeProps = {
  label: string;
  tree: LayoutContainer;
  fields: TemplateField[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
  defaultOpen?: boolean;
};

// Icône par kind. Les champs gardent celle de leur type (registry) ; les
// éléments de mise en page ont la leur.
function iconForNode(node: LayoutNode, fields: TemplateField[]) {
  switch (node.kind) {
    case "container":
      return node.direction === "row" ? TbLayoutColumns : TbLayoutRows;
    case "divider":
      return TbSeparator;
    case "text":
      return TbTypography;
    case "field": {
      const field = fields.find((f) => f.id === node.fieldId);
      return field ? fieldRegistry[field.type].icon : TbChevronRight;
    }
  }
}

function TreeRow({
  node,
  depth,
  fields,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  isRoot,
}: {
  node: LayoutNode;
  depth: number;
  fields: TemplateField[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
  isRoot?: boolean;
}) {
  const isContainer = node.kind === "container";
  // Un placement dont le champ est introuvable : signalé en rouge, comme dans
  // l'aperçu. Les kinds sans champ (divider, texte) ne sont pas concernés.
  const orphanField =
    node.kind === "field" && !fields.some((f) => f.id === node.fieldId);

  const Icon = iconForNode(node, fields);
  const label = `${layoutNodeLabel(node, fields)}${
    isContainer && isRoot ? " (root)" : ""
  }`;

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
        style={{ paddingLeft: 4 + depth * 12 }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-xs transition-colors",
          selectedId === node.id
            ? "bg-violet-100 text-violet-800"
            : hoveredId === node.id
              ? "bg-gray-100"
              : "hover:bg-gray-50",
        )}
      >
        <Icon size={12} className="shrink-0 text-gray-500" />
        <span
          className={cn(
            "truncate",
            isContainer && "text-gray-500",
            node.kind === "divider" && "text-gray-400",
            node.kind === "text" && !node.content.trim() && "italic text-gray-400",
            orphanField && "italic text-red-500",
          )}
        >
          {label}
        </span>
        {isContainer && node.children.length === 0 && (
          <span className="ml-auto shrink-0 text-[10px] text-gray-400">
            empty
          </span>
        )}
      </button>

      {isContainer &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            fields={fields}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
    </>
  );
}

export default function LayoutTree({
  label,
  tree,
  fields,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  defaultOpen = false,
}: LayoutTreeProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50"
      >
        {open ? <TbChevronDown size={12} /> : <TbChevronRight size={12} />}
        {label}
      </button>
      {open && (
        <div className="border-t border-gray-100 p-1">
          <TreeRow
            node={tree}
            depth={0}
            fields={fields}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={onSelect}
            onHover={onHover}
            isRoot
          />
        </div>
      )}
    </div>
  );
}
