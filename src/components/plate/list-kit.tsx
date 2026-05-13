"use client";

import {
  BulletedListRules,
  OrderedListRules,
  TaskListRules,
} from "@platejs/list";
import { ListPlugin } from "@platejs/list/react";
import { KEYS } from "platejs";

import { IndentKit } from "@/components/plate/indent-kit";
import { BlockList } from "@/components/plate/block-list";

// See basic-blocks-kit.tsx for why .configure() must take a function.
export const ListKit = [
  ...IndentKit,
  ListPlugin.configure(() => ({
    inputRules: [
      BulletedListRules.markdown({ variant: "*" }),
      BulletedListRules.markdown({ variant: "-" }),
      OrderedListRules.markdown({ variant: "." }),
      OrderedListRules.markdown({ variant: ")" }),
      TaskListRules.markdown(),
      TaskListRules.markdown({ checked: true }),
    ],
    inject: {
      targetPlugins: [
        ...KEYS.heading,
        KEYS.p,
        KEYS.blockquote,
        KEYS.codeBlock,
        KEYS.toggle,
        KEYS.img,
      ],
    },
    render: {
      belowNodes: BlockList,
    },
  })),
];
