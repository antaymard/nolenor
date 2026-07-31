import { memo, type CSSProperties } from "react";
import type {
  LayoutContainer,
  LayoutFieldPlacement,
  LayoutNode,
} from "@/../convex/config/templateConfig";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import FieldHost from "@/components/fields/FieldHost";
import {
  EditableContainer,
  EditablePlacement,
  type LayoutEditor,
} from "./layoutEditing";

// Rendu d'un arbre de layout de custom node template. Utilisé par les trois
// surfaces : preview du builder (onCommitField absent = lecture seule),
// node canvas et window. Les champs supprimés du template (values
// orphelines) et les fieldIds inconnus sont ignorés silencieusement.

type LayoutRendererProps = {
  tree: LayoutContainer;
  fields: TemplateField[];
  values: Record<string, unknown>;
  surface: "node" | "window";
  onCommitField?: (fieldId: string, value: unknown) => void;
  // Ouvre la window du node depuis un champ edit:"window" (aujourd'hui
  // rich_text.link). Seul CustomNode la fournit ; CustomWindow et la preview
  // du builder la laissent absente — escalader depuis la window serait une
  // auto-escalade illégale.
  onEscalateField?: (fieldId: string) => void;
  // Édition directe sur la maquette (builder de template uniquement). Absente
  // → aucun changement pour CustomNode et CustomWindow : mêmes éléments,
  // mêmes styles. Cf. layoutEditing.tsx.
  editor?: LayoutEditor;
};

const ALIGN_MAP: Record<string, CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

const JUSTIFY_MAP: Record<string, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
};

function containerStyle(container: LayoutContainer): CSSProperties {
  return {
    display: "flex",
    flexDirection: container.direction,
    gap: container.gap ?? 8,
    alignItems: ALIGN_MAP[container.align ?? "stretch"],
    justifyContent: JUSTIFY_MAP[container.justify ?? "start"],
    padding: container.padding,
    flexGrow: container.grow,
    minWidth: 0,
    minHeight: 0,
  };
}

function placementStyle(placement: LayoutFieldPlacement): CSSProperties {
  const style: CSSProperties = { minWidth: 0 };
  if (typeof placement.width === "number") {
    style.width = placement.width;
    style.flexShrink = 0;
  } else if (placement.width === "fill") {
    style.flexGrow = 1;
  }
  if (placement.grow !== undefined) {
    style.flexGrow = placement.grow;
  }
  return style;
}

function FieldSlot({
  placement,
  fields,
  values,
  surface,
  onCommitField,
  onEscalateField,
  editor,
}: {
  placement: LayoutFieldPlacement;
  fields: TemplateField[];
  values: Record<string, unknown>;
  surface: "node" | "window";
  onCommitField?: (fieldId: string, value: unknown) => void;
  onEscalateField?: (fieldId: string) => void;
  editor?: LayoutEditor;
}) {
  const field = fields.find((f) => f.id === placement.fieldId);
  const style = placementStyle(placement);

  // Placement orphelin : ignoré silencieusement au rendu réel, mais rendu
  // visible en édition — sinon il serait ni sélectionnable ni supprimable,
  // et bloquerait le save sans qu'on puisse le joindre.
  if (!field) {
    if (!editor) return null;
    return (
      <EditablePlacement placement={placement} editor={editor} style={style}>
        <span style={{ fontSize: 10, fontStyle: "italic", color: "rgb(220 38 38)" }}>
          Unknown field
        </span>
      </EditablePlacement>
    );
  }

  const onCommit = onCommitField
    ? (value: unknown) => onCommitField(field.id, value)
    : undefined;
  const onEscalate = onEscalateField
    ? () => onEscalateField(field.id)
    : undefined;

  // Le label n'est PAS rendu ici : c'est FieldHost qui le porte, car lui
  // seul connaît le variant résolu et donc si celui-ci affiche le label
  // lui-même (ownsLabel).
  const host = (
    <FieldHost
      field={field}
      value={values[field.id]}
      surface={surface}
      placement={placement}
      onCommit={onCommit}
      onEscalate={onEscalate}
    />
  );

  if (editor) {
    return (
      <EditablePlacement placement={placement} editor={editor} style={style}>
        {host}
      </EditablePlacement>
    );
  }
  return <div style={style}>{host}</div>;
}

function LayoutNodeRenderer({
  node,
  fields,
  values,
  surface,
  onCommitField,
  onEscalateField,
  editor,
  isRoot = false,
}: {
  node: LayoutNode;
  fields: TemplateField[];
  values: Record<string, unknown>;
  surface: "node" | "window";
  onCommitField?: (fieldId: string, value: unknown) => void;
  onEscalateField?: (fieldId: string) => void;
  editor?: LayoutEditor;
  isRoot?: boolean;
}) {
  if (node.kind === "field") {
    return (
      <FieldSlot
        placement={node}
        fields={fields}
        values={values}
        surface={surface}
        onCommitField={onCommitField}
        onEscalateField={onEscalateField}
        editor={editor}
      />
    );
  }

  const style = containerStyle(node);
  const children = node.children.map((child) => (
    <LayoutNodeRenderer
      key={child.id}
      node={child}
      fields={fields}
      values={values}
      surface={surface}
      onCommitField={onCommitField}
      onEscalateField={onEscalateField}
      editor={editor}
    />
  ));

  if (editor) {
    return (
      <EditableContainer
        container={node}
        editor={editor}
        style={style}
        isRoot={isRoot}
      >
        {children}
      </EditableContainer>
    );
  }
  return <div style={style}>{children}</div>;
}

function LayoutRenderer({
  tree,
  fields,
  values,
  surface,
  onCommitField,
  onEscalateField,
  editor,
}: LayoutRendererProps) {
  return (
    <LayoutNodeRenderer
      node={tree}
      fields={fields}
      values={values}
      surface={surface}
      onCommitField={onCommitField}
      onEscalateField={onEscalateField}
      editor={editor}
      isRoot
    />
  );
}

export default memo(LayoutRenderer);
export type { LayoutRendererProps };
