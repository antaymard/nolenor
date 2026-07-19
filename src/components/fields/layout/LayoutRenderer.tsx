import { memo, type CSSProperties } from "react";
import type {
  LayoutContainer,
  LayoutFieldPlacement,
  LayoutNode,
} from "@/../convex/config/templateConfig";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import { getFieldComponent } from "@/components/fields/registry/fieldRegistry";

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
}: {
  placement: LayoutFieldPlacement;
  fields: TemplateField[];
  values: Record<string, unknown>;
  surface: "node" | "window";
  onCommitField?: (fieldId: string, value: unknown) => void;
}) {
  const field = fields.find((f) => f.id === placement.fieldId);
  if (!field) return null;

  const Component = getFieldComponent(field.type, surface);
  const onCommit = onCommitField
    ? (value: unknown) => onCommitField(field.id, value)
    : undefined;

  return (
    <div style={placementStyle(placement)}>
      {placement.showLabel && (
        <div className="text-[11px] font-medium text-muted-foreground mb-0.5 truncate">
          {field.name}
        </div>
      )}
      <Component
        field={field}
        value={values[field.id]}
        surface={surface}
        placement={placement}
        onCommit={onCommit}
      />
    </div>
  );
}

function LayoutNodeRenderer({
  node,
  fields,
  values,
  surface,
  onCommitField,
}: {
  node: LayoutNode;
  fields: TemplateField[];
  values: Record<string, unknown>;
  surface: "node" | "window";
  onCommitField?: (fieldId: string, value: unknown) => void;
}) {
  if (node.kind === "field") {
    return (
      <FieldSlot
        placement={node}
        fields={fields}
        values={values}
        surface={surface}
        onCommitField={onCommitField}
      />
    );
  }

  return (
    <div style={containerStyle(node)}>
      {node.children.map((child) => (
        <LayoutNodeRenderer
          key={child.id}
          node={child}
          fields={fields}
          values={values}
          surface={surface}
          onCommitField={onCommitField}
        />
      ))}
    </div>
  );
}

function LayoutRenderer({
  tree,
  fields,
  values,
  surface,
  onCommitField,
}: LayoutRendererProps) {
  return (
    <LayoutNodeRenderer
      node={tree}
      fields={fields}
      values={values}
      surface={surface}
      onCommitField={onCommitField}
    />
  );
}

export default memo(LayoutRenderer);
export type { LayoutRendererProps };
