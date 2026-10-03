/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { key: string; namespace: string },
        boolean,
        Name
      >;
      flush: FunctionReference<
        "mutation",
        "internal",
        { key: string; namespace: string },
        boolean,
        Name
      >;
      schedule: FunctionReference<
        "mutation",
        "internal",
        {
          delay: number;
          functionArgs: any;
          functionHandle: string;
          functionName: string;
          key: string;
          maxWait?: number;
          mode: "sliding" | "fixed" | "eager";
          namespace: string;
        },
        { executedNow: boolean; runAt: number },
        Name
      >;
      status: FunctionReference<
        "query",
        "internal",
        { key: string; namespace: string },
        null | {
          calls: number;
          functionName: string;
          mode: "sliding" | "fixed" | "eager";
          pending: boolean;
          runAt: number;
        },
        Name
      >;
    };
  };
