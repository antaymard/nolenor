import { createReactBlockSpec } from "@blocknote/react";

import {
  CALLOUT_DEFAULT_ICON,
  CalloutControls,
  CalloutLayout,
} from "./callout-components";

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
 * `toExternalHTML` is the static version (canvas previews, clipboard).
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
      <CalloutLayout
        color={props.block.props.color}
        control={
          <span
            className="size-6 shrink-0 select-none p-1 text-[18px] leading-none"
            style={{
              fontFamily:
                '"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols',
            }}
          >
            {props.block.props.icon || CALLOUT_DEFAULT_ICON}
          </span>
        }
        contentRef={props.contentRef}
      />
    ),
  },
);
