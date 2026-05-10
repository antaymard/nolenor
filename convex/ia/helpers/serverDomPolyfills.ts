/* eslint-disable @typescript-eslint/no-explicit-any */

function makeEl(): any {
  const el: any = {
    style: {},
    nodeType: 1,
    nodeName: "DIV",
    tagName: "DIV",
    childNodes: [] as any[],
    children: [] as any[],
    setAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
    removeAttribute() {},
    appendChild(c: any) {
      el.childNodes.push(c);
      return c;
    },
    removeChild() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
    getBoundingClientRect: () => ({
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    }),
    cloneNode: () => makeEl(),
    contains: () => false,
    closest: () => null,
    matches: () => false,
    querySelectorAll: () => [],
    querySelector: () => null,
    ownerDocument: null as any,
  };
  return el;
}

export function installServerDomPolyfills() {
  const g = globalThis as any;
  if (g.document !== undefined) return;

  g.document = {
    createElement: (_tag: string) => makeEl(),
    createTextNode: (data: string) => ({
      nodeType: 3,
      textContent: data,
      nodeValue: data,
      data,
    }),
    createDocumentFragment: () => {
      const fragment: any = {
        nodeType: 11,
        childNodes: [] as any[],
        children: [] as any[],
      };
      fragment.appendChild = (child: any) => {
        fragment.childNodes.push(child);
        return child;
      };
      return fragment;
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    body: makeEl(),
    head: makeEl(),
    documentElement: makeEl(),
  };

  g.window = {
    getSelection: () => null,
    document: g.document,
    addEventListener() {},
    removeEventListener() {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  };

  if (!g.Node) {
    g.Node = class Node {
      nodeType = 0;
    };
  }
  if (!g.Element) {
    g.Element = class Element {
      nodeType = 1;
    };
  }
  if (!g.Text) {
    g.Text = class Text {
      nodeType = 3;
    };
  }
}
