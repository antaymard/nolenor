import { memo, type CSSProperties } from "react";
import type {
  LayoutContainer,
  LayoutDivider,
  LayoutFieldPlacement,
  LayoutNode,
  LayoutStaticText,
} from "@/../convex/config/templateConfig";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import { cn } from "@/lib/utils";
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
  // Classe de bordure des dividers. Seul CustomNode la fournit, depuis la
  // couleur du node : le trait suit alors la couleur, y compris quand elle
  // change. Absente ailleurs → gris neutre.
  dividerClassName?: string;
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

// Dimensions d'une FEUILLE de l'arbre. Prend les seules propriétés de taille et
// non le nœud entier : placements de champ et textes statiques les partagent
// sans partager leur forme.
//
// En COLONNE, `width` porte sur l'axe transverse — une largeur explicite prend
// alors naturellement le pas sur `alignItems: stretch` du container, il n'y a
// rien à neutraliser. En ROW elle porte sur l'axe principal.
function sizingStyle(sizing: {
  width?: number | "auto" | "fill";
  grow?: number;
  maxWidth?: number;
}): CSSProperties {
  const style: CSSProperties = { minWidth: 0 };
  if (typeof sizing.width === "number") {
    style.width = sizing.width;
    // Sans quoi le flex reprend aussitôt la largeur qu'on vient de fixer.
    style.flexShrink = 0;
  } else if (sizing.width === "fill") {
    style.flexGrow = 1;
  }
  if (sizing.grow !== undefined) {
    style.flexGrow = sizing.grow;
  }
  if (sizing.maxWidth !== undefined) {
    style.maxWidth = sizing.maxWidth;
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
  const style = sizingStyle(placement);

  // Placement orphelin : ignoré silencieusement au rendu réel, mais rendu
  // visible en édition — sinon il serait ni sélectionnable ni supprimable,
  // et bloquerait le save sans qu'on puisse le joindre.
  if (!field) {
    if (!editor) return null;
    return (
      <EditablePlacement nodeId={placement.id} editor={editor} style={style}>
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
      <EditablePlacement nodeId={placement.id} editor={editor} style={style}>
        {host}
      </EditablePlacement>
    );
  }
  return <div style={style}>{host}</div>;
}

// Trait de séparation. S'oriente contre son parent : vertical dans une ligne,
// horizontal dans une colonne — sans quoi un divider posé dans une row se
// rendrait en trait horizontal écrasé à zéro.
//
// La couleur vient de `dividerClassName`, que seul CustomNode fournit (elle
// suit alors la couleur du node). Aperçu et window la laissent absente et
// retombent sur un gris neutre, comme leurs propres bordures.
function DividerSlot({
  divider,
  parentDirection,
  dividerClassName,
  editor,
}: {
  divider: LayoutDivider;
  parentDirection: "row" | "column";
  dividerClassName?: string;
  editor?: LayoutEditor;
}) {
  const vertical = parentDirection === "row";
  const style: CSSProperties = vertical
    ? { alignSelf: "stretch", borderLeftWidth: 1, minWidth: 1, flexShrink: 0 }
    : { alignSelf: "stretch", borderTopWidth: 1, minHeight: 1, flexShrink: 0 };

  const className = dividerClassName ?? "border-slate-200";

  if (editor) {
    return (
      <EditablePlacement
        nodeId={divider.id}
        editor={editor}
        style={style}
        className={className}
      >
        {null}
      </EditablePlacement>
    );
  }
  return <div style={style} className={className} />;
}

// Texte de mise en page. Son contenu s'édite depuis l'inspecteur, jamais en
// place : il appartient au template, pas aux données du node.
function StaticTextSlot({
  text,
  editor,
}: {
  text: LayoutStaticText;
  editor?: LayoutEditor;
}) {
  const style = sizingStyle(text);
  const content = text.content.trim();
  // Un texte vide n'a aucune hauteur : en édition il deviendrait
  // insélectionnable, exactement comme un container vide. On lui donne alors
  // un substitut visible — jamais dans le rendu réel, qui doit rester fidèle.
  // `line-clamp-1` et surtout PAS `truncate` : ce dernier pose
  // `white-space: nowrap`, qui entre en conflit frontal avec le `pre-wrap`
  // ci-dessous — deux utilitaires sur la même propriété, départagés par l'ordre
  // du CSS généré et non par l'ordre dans la chaîne de classes. `line-clamp-1`
  // ne touche pas à `white-space` et apporte l'ellipse.
  //
  // Le clamp s'applique AUSSI dans l'aperçu de l'éditeur : règle de fidélité,
  // l'auteur doit voir ce que verront les viewers. Le contenu s'édite de toute
  // façon dans l'inspecteur, jamais en place.
  const body = content ? (
    <span className={cn("whitespace-pre-wrap", text.singleLine && "line-clamp-1")}>
      {text.content}
    </span>
  ) : editor ? (
    // Non clampé : c'est une aide d'édition, pas du contenu.
    <span className="text-[10px] italic text-gray-400">Empty text</span>
  ) : null;

  if (editor) {
    return (
      <EditablePlacement nodeId={text.id} editor={editor} style={style}>
        {body}
      </EditablePlacement>
    );
  }
  // Infobulle sur le rendu réel SEULEMENT : dans l'éditeur elle surgirait en
  // plein glisser-déposer. Posée sans vérifier que le texte déborde vraiment —
  // le savoir demanderait un ref et un ResizeObserver pour un gain nul quand le
  // texte est court. Même choix que TableNode.
  return (
    <div style={style} title={text.singleLine && content ? text.content : undefined}>
      {body}
    </div>
  );
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
  parentDirection = "column",
  dividerClassName,
}: {
  node: LayoutNode;
  fields: TemplateField[];
  values: Record<string, unknown>;
  surface: "node" | "window";
  onCommitField?: (fieldId: string, value: unknown) => void;
  onEscalateField?: (fieldId: string) => void;
  editor?: LayoutEditor;
  isRoot?: boolean;
  parentDirection?: "row" | "column";
  dividerClassName?: string;
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

  if (node.kind === "divider") {
    return (
      <DividerSlot
        divider={node}
        parentDirection={parentDirection}
        dividerClassName={dividerClassName}
        editor={editor}
      />
    );
  }

  if (node.kind === "text") {
    return <StaticTextSlot text={node} editor={editor} />;
  }

  const style = containerStyle(node);
  const children = node.children?.map((child) => (
    <LayoutNodeRenderer
      key={child.id}
      node={child}
      fields={fields}
      values={values}
      surface={surface}
      onCommitField={onCommitField}
      onEscalateField={onEscalateField}
      editor={editor}
      // Un divider doit s'orienter CONTRE son parent : trait vertical dans une
      // ligne, horizontal dans une colonne. Le nœud ne connaît pas son parent,
      // on lui passe donc sa direction.
      parentDirection={node.direction}
      dividerClassName={dividerClassName}
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
  dividerClassName,
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
      dividerClassName={dividerClassName}
      isRoot
    />
  );
}

export default memo(LayoutRenderer);
export type { LayoutRendererProps };
