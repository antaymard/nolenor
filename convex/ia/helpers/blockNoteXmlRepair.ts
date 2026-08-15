// Repair pass for the BlockNote XML v1 payloads a model actually writes.
//
// The wire format asks the model to emit XML whose *text content is Markdown*,
// which puts two grammars in tension: prose is full of characters that are
// markup in XML. Three failure modes were observed repeatedly in production,
// and all three produced a DOMParser diagnostic that pointed nowhere near the
// real problem — so the model could only guess, and usually retried by
// deleting content until something stuck:
//
//   1. A bare `&` in prose ("R&D", "la mécanique & l'UX"). saxes swallows the
//      rest of the document looking for the `;` that ends the entity, then
//      reports `unclosed tag: block` at the LAST line of the payload.
//   2. A bare `<` ("si a < b"). Reported as `disallowed character in tag name`.
//   3. Missing `</block>` closing tags on a long run of blocks. Reported as
//      `unclosed tag: block` at EOF, or `documents may contain only one root`.
//
// None of these are ambiguous: an `&` that does not open a valid entity
// reference is text, a `<` that does not open a known BlockNote element is
// text, and a `<block>` can never directly contain another `<block>` (nesting
// goes through `<children>`), so a second `<block` start tag ends the first.
// This module resolves each of them mechanically, which is strictly better
// than an error message the model has to reverse-engineer.
//
// The repair is only ever applied to a payload that ALREADY failed to parse
// (see `parseFragmentOrDocument` in blockNoteMarkdown.ts), so a well-formed
// document is never rewritten.
//
// Deliberately DOM-free: a single string scan, no jsdom, no editor. That keeps
// it cheap enough to run on the failure path without touching the global
// jsdom lock, and testable on its own.

/**
 * The BlockNote XML v1 vocabulary, plus the HTML table spellings a model
 * reaches for when it has never seen a `<table>` in `read_nodes` output.
 * A `<` followed by anything else is prose, not markup.
 */
const KNOWN_ELEMENTS: ReadonlySet<string> = new Set([
  "blocknote",
  "block",
  "children",
  "table",
  "columns",
  "column",
  "row",
  "cell",
  // HTML aliases — normalized to row/cell by parseTableElement.
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
]);

/**
 * Start tags that imply the end of an unclosed sibling. Each entry lists the
 * element names that may be auto-closed when this one opens; the scanner pops
 * while the innermost open element is in the set.
 *
 * `<block>` is the important one: block nesting always goes through
 * `<children>`, so a `<block` start tag while a `<block>` is innermost can only
 * mean the previous one was never closed. `<children>` is absent on purpose —
 * it legitimately sits between two blocks.
 */
const AUTO_CLOSE_ON_OPEN: Record<string, ReadonlySet<string>> = {
  block: new Set(["block"]),
  row: new Set(["row", "tr", "cell", "td", "th"]),
  tr: new Set(["row", "tr", "cell", "td", "th"]),
  cell: new Set(["cell", "td", "th"]),
  td: new Set(["cell", "td", "th"]),
  th: new Set(["cell", "td", "th"]),
  column: new Set(["column"]),
};

/** The only named entities XML predefines. Everything else is "undefined entity". */
const PREDEFINED_ENTITIES: ReadonlySet<string> = new Set([
  "amp",
  "lt",
  "gt",
  "quot",
  "apos",
]);

/**
 * HTML named entities that have no XML definition but that a model trained on
 * HTML still emits. Decoded to the character they meant rather than escaped to
 * literal `&nbsp;` text.
 */
const HTML_ENTITY_CHARS: Record<string, string> = {
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  deg: "°",
  times: "×",
  euro: "€",
  pound: "£",
  copy: "©",
  reg: "®",
  trade: "™",
};

const NUMERIC_ENTITY_RE = /^&#(?:[0-9]+|[xX][0-9a-fA-F]+);/;
const NAMED_ENTITY_RE = /^&([A-Za-z][A-Za-z0-9]*);/;
const ELEMENT_NAME_RE = /^[A-Za-z][A-Za-z0-9]*/;
const ATTRIBUTE_NAME_RE = /^[A-Za-z_:][-A-Za-z0-9._:]*/;

/** Constructs copied through untouched, each keyed by its terminator. */
const PASSTHROUGH: ReadonlyArray<{ open: string; close: string }> = [
  { open: "<!--", close: "-->" },
  { open: "<![CDATA[", close: "]]>" },
  { open: "<?", close: "?>" },
];

type Tag = {
  kind: "open" | "close" | "self";
  /** Lower-cased element name — XML is case-sensitive, the model is not. */
  name: string;
  /** The normalized tag text to emit (attributes re-quoted and escaped). */
  text: string;
  /** Index just past the tag's `>`. */
  end: number;
};

/**
 * Escape a `&` that does not open a valid entity reference, decoding the HTML
 * named entities XML does not know about. Returns how many input characters
 * were consumed.
 */
function copyEntity(xml: string, at: number, out: string[]): number {
  const rest = xml.slice(at, at + 12);
  if (NUMERIC_ENTITY_RE.test(rest)) {
    const end = xml.indexOf(";", at);
    out.push(xml.slice(at, end + 1));
    return end + 1 - at;
  }
  const named = NAMED_ENTITY_RE.exec(rest);
  if (named) {
    if (PREDEFINED_ENTITIES.has(named[1])) {
      out.push(named[0]);
      return named[0].length;
    }
    const decoded = HTML_ENTITY_CHARS[named[1]];
    if (decoded !== undefined) {
      out.push(decoded);
      return named[0].length;
    }
  }
  out.push("&amp;");
  return 1;
}

/** Escape a value for a double-quoted attribute. */
function escapeAttributeValue(value: string): string {
  const out: string[] = [];
  for (let i = 0; i < value.length; ) {
    const ch = value[i];
    if (ch === "&") {
      i += copyEntity(value, i, out);
      continue;
    }
    if (ch === "<") {
      out.push("&lt;");
    } else if (ch === '"') {
      out.push("&quot;");
    } else {
      out.push(ch);
    }
    i += 1;
  }
  return out.join("");
}

/**
 * Index of the quote that really closes the attribute value opened at `start`,
 * or -1. The naive "first matching quote" reading breaks on the shape a model
 * writes constantly — `props='{"label":"l'IA"}'`, where the apostrophe belongs
 * to the French text — and losing the tag loses the whole block. A closing
 * quote is always followed by whitespace, `/` or `>`; anything else means the
 * quote was part of the value, so keep looking.
 */
function findAttributeClose(xml: string, start: number): number {
  const quote = xml[start];
  for (let i = start + 1; i < xml.length; i++) {
    if (xml[i] !== quote) continue;
    const next = xml[i + 1];
    if (next === undefined || /[\s/>]/.test(next)) return i;
  }
  return -1;
}

/**
 * Read a start/end tag at `start`, or return null when the `<` is prose.
 *
 * Also repairs the two attribute shapes a model writes that XML rejects:
 * unquoted values (`props={"level":2}`, JSX habit) and values holding an
 * unescaped `&` — both re-emitted as properly quoted, escaped attributes.
 */
function readTag(xml: string, start: number): Tag | null {
  let i = start + 1;
  const closing = xml[i] === "/";
  if (closing) i += 1;

  const nameMatch = ELEMENT_NAME_RE.exec(xml.slice(i, i + 32));
  if (!nameMatch) return null;
  const name = nameMatch[0].toLowerCase();
  if (!KNOWN_ELEMENTS.has(name)) return null;
  i += nameMatch[0].length;

  // The name must be delimited: `<blocky>` is not a `<block>`.
  const after = xml[i];
  if (after !== undefined && !/[\s/>]/.test(after)) return null;

  const attributes: string[] = [];
  while (i < xml.length) {
    while (i < xml.length && /\s/.test(xml[i])) i += 1;

    if (xml[i] === ">") {
      const text = `<${closing ? "/" : ""}${name}${attributes.join("")}>`;
      return { kind: closing ? "close" : "open", name, text, end: i + 1 };
    }
    if (xml.startsWith("/>", i)) {
      if (closing) return null;
      return {
        kind: "self",
        name,
        text: `<${name}${attributes.join("")}/>`,
        end: i + 2,
      };
    }
    // An end tag holds nothing but its name.
    if (closing) return null;

    const attrMatch = ATTRIBUTE_NAME_RE.exec(xml.slice(i, i + 64));
    if (!attrMatch) return null;
    const attrName = attrMatch[0];
    i += attrName.length;

    while (i < xml.length && /\s/.test(xml[i])) i += 1;
    if (xml[i] !== "=") {
      // Valueless attribute (`<block hidden>`): XML has no such thing, and an
      // empty value keeps the tag parseable for the per-block validation to
      // reject on its own terms.
      attributes.push(` ${attrName}=""`);
      continue;
    }
    i += 1;
    while (i < xml.length && /\s/.test(xml[i])) i += 1;

    const quote = xml[i];
    let raw: string;
    if (quote === '"' || quote === "'") {
      const close = findAttributeClose(xml, i);
      if (close === -1) return null;
      raw = xml.slice(i + 1, close);
      i = close + 1;
    } else {
      const valueEnd = (() => {
        for (let j = i; j < xml.length; j++) {
          if (/\s/.test(xml[j]) || xml[j] === ">") return j;
        }
        return xml.length;
      })();
      if (valueEnd === i) return null;
      raw = xml.slice(i, valueEnd);
      i = valueEnd;
    }
    attributes.push(` ${attrName}="${escapeAttributeValue(raw)}"`);
  }

  // Ran off the end without ever closing the tag: this `<` was prose.
  return null;
}

/** Length of a comment / CDATA / processing instruction at `at`, or 0. */
function passthroughLength(xml: string, at: number): number {
  for (const { open, close } of PASSTHROUGH) {
    if (!xml.startsWith(open, at)) continue;
    const end = xml.indexOf(close, at + open.length);
    if (end === -1) return 0;
    return end + close.length - at;
  }
  return 0;
}

/**
 * Rewrite an LLM-authored BlockNote XML payload into well-formed XML:
 * stray `&`/`<`/`]]>` in text become their escapes, unquoted or unescaped
 * attribute values are re-quoted, unknown `<tags>` in prose become literal
 * text, and unclosed elements are closed (implicitly at the next sibling
 * start tag, and at end of input).
 *
 * Structurally invalid input stays invalid — the result is well-formed XML,
 * not necessarily a valid document — so the per-block validation in
 * `parseBlockElement` is still what decides whether the payload is accepted.
 */
export function repairBlockNoteXml(xml: string): string {
  const out: string[] = [];
  const open: string[] = [];
  let i = 0;

  while (i < xml.length) {
    const ch = xml[i];

    if (ch === "&") {
      i += copyEntity(xml, i, out);
      continue;
    }
    // `]]>` is disallowed in character data even outside a CDATA section.
    if (ch === "]" && xml.startsWith("]]>", i)) {
      out.push("]]&gt;");
      i += 3;
      continue;
    }
    if (ch !== "<") {
      out.push(ch);
      i += 1;
      continue;
    }

    const skip = passthroughLength(xml, i);
    if (skip > 0) {
      out.push(xml.slice(i, i + skip));
      i += skip;
      continue;
    }

    const tag = readTag(xml, i);
    if (!tag) {
      out.push("&lt;");
      i += 1;
      continue;
    }

    if (tag.kind === "close") {
      const opened = open.lastIndexOf(tag.name);
      // A close tag with nothing to close is noise: drop it rather than let it
      // break the whole payload.
      if (opened !== -1) {
        for (let k = open.length - 1; k > opened; k--) out.push(`</${open[k]}>`);
        open.length = opened;
        out.push(tag.text);
      }
      i = tag.end;
      continue;
    }

    const autoClose = AUTO_CLOSE_ON_OPEN[tag.name];
    if (autoClose) {
      while (open.length > 0 && autoClose.has(open[open.length - 1])) {
        out.push(`</${open.pop()}>`);
      }
    }
    out.push(tag.text);
    if (tag.kind === "open") open.push(tag.name);
    i = tag.end;
  }

  for (let k = open.length - 1; k >= 0; k--) out.push(`</${open[k]}>`);
  return out.join("");
}
