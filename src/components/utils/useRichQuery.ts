import { makeUseQueryWithStatus } from "convex-helpers/react";
import { useQueries } from "convex/react";
// Do this once somewhere, name it whatever you want.
const useRichQuery = makeUseQueryWithStatus(useQueries);

export default useRichQuery;

/*
type ret =
  | {
      status: "success";
      data: FunctionReturnType<Query>;
      error: undefined;
      isSuccess: true;
      isPending: false;
      isError: false;
    }
  | {
      status: "pending";
      data: undefined;
      error: undefined;
      isSuccess: false;
      isPending: true;
      isError: false;
    }
  | {
      status: "error";
      data: undefined;
      error: Error;
      isSuccess: false;
      isPending: false;
      isError: true;
    };
*/
