// Minimal repro: does blocksToFullHTML render custom React blocks/inline content?
import { createRequire } from "node:module";

const require = createRequire(
  "C:/Users/AntAy/Documents/Coding/entropie/package.json",
);
(globalThis as any).require = require;

const { JSDOM } = require("jsdom");
const jsdom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const w = jsdom.window as unknown as Window & typeof globalThis;
(globalThis as any).document = w.document;
(globalThis as any).window = w;

const React = require("react") as typeof import("react");
const h = React.createElement;

const core = await import("@blocknote/core");
const reactBN = await import("@blocknote/react");

const {
  BlockNoteEditor,
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} = core;
const { createReactBlockSpec, createReactInlineContentSpec } = reactBN;

const dateSpec = createReactInlineContentSpec(
  { type: "date", propSchema: { date: { default: "" } }, content: "none" },
  {
    render: (p: any) =>
      h("span", { className: "date-pill" }, "📅 " + p.inlineContent.props.date),
    toExternalHTML: (p: any) =>
      h("span", null, "📅 " + p.inlineContent.props.date),
  },
);

const calloutSpec = createReactBlockSpec(
  {
    type: "callout",
    propSchema: { color: { default: "default" }, icon: { default: "💡" } },
    content: "inline",
  },
  {
    render: (p: any) =>
      h(
        "div",
        { className: "callout", "data-color": p.block.props.color },
        h("span", null, p.block.props.icon),
        h("div", { ref: p.contentRef, className: "bn-inline-content" }),
      ),
    toExternalHTML: (p: any) =>
      h(
        "div",
        { className: "callout", "data-color": p.block.props.color },
        h("span", null, p.block.props.icon),
        h("div", { ref: p.contentRef, className: "bn-inline-content" }),
      ),
  },
);

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, callout: calloutSpec() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, date: dateSpec },
});

const editor = BlockNoteEditor.create({ schema });
console.log("headless:", editor.headless);
console.log("elementRenderer:", typeof (editor as any).elementRenderer);

const doc = [
  {
    id: "p1",
    type: "paragraph",
    content: [
      { type: "text", text: "Rdv le ", styles: {} },
      { type: "date", props: { date: "Fri Jul 24 2026" } },
      { type: "text", text: " ok", styles: {} },
    ],
  },
  {
    id: "c1",
    type: "callout",
    props: { color: "yellow", icon: "⚠️" },
    content: [{ type: "text", text: "Attention", styles: {} }],
  },
  {
    id: "p2",
    type: "paragraph",
    props: { backgroundColor: "red", textColor: "blue" },
    content: [{ type: "text", text: "couleur", styles: {} }],
  },
];

console.log("=== blocksToFullHTML (canvas preview path) ===");
console.log(editor.blocksToFullHTML(doc as any));
