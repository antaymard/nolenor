"use client";

import { LinkRules } from "@platejs/link";
import { LinkPlugin } from "@platejs/link/react";

import { LinkElement } from "@/components/plate/link-node";
import { LinkFloatingToolbar } from "@/components/plate/link-toolbar";

// See basic-blocks-kit.tsx for why .configure() must take a function.
export const LinkKit = [
  LinkPlugin.configure(() => ({
    inputRules: [
      LinkRules.markdown(),
      LinkRules.autolink({ variant: "paste" }),
      LinkRules.autolink({ variant: "space" }),
      LinkRules.autolink({ variant: "break" }),
    ],
    render: {
      node: LinkElement,
      afterEditable: () => <LinkFloatingToolbar />,
    },
  })),
];
