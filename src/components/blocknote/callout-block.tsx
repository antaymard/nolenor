import { createReactBlockSpec } from "@blocknote/react";

import {
  CALLOUT_DEFAULT_ICON,
  CalloutControls,
  CalloutLayout,
} from "./callout-components";

/**
 * Static (read-only) rendering of a callout: rounded colored box with a plain
 * emoji icon and the inline content as children. Used by the canvas read-only
 * renderer (BlockNoteStatic) AND by the spec's `toExternalHTML` (clipboard /
 * HTML export) so the two never diverge.
 *
 * `icon`/`color` default to the spec defaults when undefined.
 */
export function CalloutView({
  color,
  icon,
  contentRef,
  children,
}: {
  color?: string;
  icon?: string;
  contentRef?: (node: HTMLElement | null) => void;
  children?: React.ReactNode;
}) {
  return (
    <CalloutLayout
      color={color ?? "default"}
      control={
        <span
          className="flex size-6 shrink-0 items-center justify-center select-none text-[18px] leading-none"
          style={{
            fontFamily:
              '"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols',
          }}
        >
          {icon || CALLOUT_DEFAULT_ICON}
        </span>
      }
      contentRef={contentRef}
    >
      {children}
    </CalloutLayout>
  );
}

/**
 * Callout block (`/callout` in the slash menu), like the Plate.js one:
 * rounded colored box with a clickable emoji icon and rich text content.
 * Stored as `{ type: "callout", props: { color, icon } }`.
 *
 * The color prop is named `color` (not `backgroundColor`) on purpose: BlockNote
 * auto-styles blocks exposing a `backgroundColor` prop on the outer square
 * wrapper, which would break the rounded look. Backgrounds are the predefined
 * canvas node colors (lightBg), `bg-muted` for "default".
 *
 * `render` is the editable editor version (icon/color popover);
 * `toExternalHTML` is the static version (canvas previews, clipboard) and
 * reuses `CalloutView` so both surfaces stay identical.
 */
export const createCalloutBlockSpec = createReactBlockSpec(
  {
    type: "callout",
    propSchema: {
      color: { default: "default" },
      icon: { default: CALLOUT_DEFAULT_ICON },
    },
    content: "inline",
  },
  {
    render: (props) => (
      <CalloutLayout
        color={props.block.props.color}
        control={
          <CalloutControls
            icon={props.block.props.icon}
            color={props.block.props.color}
            onSelectIcon={(icon) =>
              props.editor.updateBlock(props.block, { props: { icon } })
            }
            onSelectColor={(color) =>
              props.editor.updateBlock(props.block, { props: { color } })
            }
          />
        }
        contentRef={props.contentRef}
      />
    ),
    toExternalHTML: (props) => (
      <CalloutView
        color={props.block.props.color}
        icon={props.block.props.icon}
        contentRef={props.contentRef}
      />
    ),
  },
);
