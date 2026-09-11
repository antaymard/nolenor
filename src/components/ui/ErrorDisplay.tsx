import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/shadcn/empty";
import { ConvexError } from "convex/values";

import { TbError404 } from "react-icons/tb";

export default function ErrorDisplay({
  title,
  message,
  error,
  cta = null,
}: {
  cta?: React.ReactNode;
  title?: string;
  message?: string;
  error?: Error | null;
}) {
  // Extract message from error if provided
  const displayMessage =
    message ||
    (error instanceof ConvexError
      ? (error.data as string)
      : error?.message || "An error occurred");

  const displayTitle = title || "Error";

  return (
    <div className="h-full w-full flex items-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TbError404 />
          </EmptyMedia>
          <EmptyTitle>{displayTitle}</EmptyTitle>
          <EmptyDescription className="text-base">
            {displayMessage}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{cta}</EmptyContent>
      </Empty>
    </div>
  );
}
