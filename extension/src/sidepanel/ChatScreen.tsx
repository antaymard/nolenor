import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  TbPlus,
  TbSend,
  TbX,
  TbLoader,
  TbBrain,
  TbCheck,
  TbGlobe,
  TbSelector,
  TbHistory,
  TbPhoto,
} from "react-icons/tb";
import { HiMiniXMark } from "react-icons/hi2";
import { cn } from "./utils";
import ChatInterface from "./ChatInterface";
import { useExtensionNoleChat } from "./useExtensionNoleChat";
import { useExtensionStore } from "./store";
import type { PageContext } from "../shared/types";
import toast from "react-hot-toast";

const INPUT_MAX_HEIGHT_PX = 182;

export default function ChatScreen() {
  const {
    threadId,
    isLoading,
    userInput,
    setUserInput,
    sendCurrentMessage,
    isSending,
    isAssistantResponding,
    setIsAssistantResponding,
    isCancelling,
    stopAssistantResponse,
    selectThread,
    startNewThread,
    modelOptions,
    selectedModel,
    setSelectedModel,
  } = useExtensionNoleChat();

  const selectedCanvasId = useExtensionStore((s) => s.selectedCanvasId);
  const canvasName = useExtensionStore((s) => s.canvasName);
  const setSelectedCanvas = useExtensionStore((s) => s.setSelectedCanvas);
  const attachedPage = useExtensionStore((s) => s.attachedPage);
  const attachPage = useExtensionStore((s) => s.attachPage);
  const removeAttachedPage = useExtensionStore((s) => s.removeAttachedPage);

  const [modelOpen, setModelOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canvases = useQuery(api.canvases.listUserCanvases, {}) as
    | Array<{ _id: Id<"canvases">; name: string; shared?: boolean }>
    | undefined;

  useEffect(() => {
    if (canvases && canvases.length > 0 && !selectedCanvasId) {
      const stored = localStorage.getItem("nolenor-canvas-id");
      const found = stored ? canvases.find((c) => c._id === stored) : null;
      if (found) {
        setSelectedCanvas(found._id, found.name);
      } else {
        setSelectedCanvas(canvases[0]._id, canvases[0].name);
      }
    }
  }, [canvases, selectedCanvasId, setSelectedCanvas]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const newHeight = Math.min(textarea.scrollHeight, INPUT_MAX_HEIGHT_PX);
    textarea.style.height = `${newHeight}px`;
  }, [userInput]);

  const handleCanvasChange = useCallback(
    (canvasId: string, name: string) => {
      setSelectedCanvas(canvasId, name);
      localStorage.setItem("nolenor-canvas-id", canvasId);
    },
    [setSelectedCanvas],
  );

  const handleAttachPage = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        toast.error("No active tab found");
        return;
      }
      if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) {
        toast.error("Cannot read browser pages");
        return;
      }
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const body = document.body;
          return {
            title: document.title,
            url: window.location.href,
            text: body ? body.innerText.substring(0, 15000) : "",
            favIconUrl: (document.querySelector('link[rel*="icon"]') as HTMLLinkElement | null)?.href || "",
          };
        },
      });
      if (result?.result) {
        attachPage(result.result as PageContext);
      } else {
        toast.error("Unable to read page content");
      }
    } catch (error) {
      console.error("Error extracting page content:", error);
      toast.error(`Unable to read page: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [attachPage]);

  const handleSend = useCallback(() => {
    if (isAssistantResponding || isSending || !userInput.trim() || !selectedCanvasId) return;
    void sendCurrentMessage();
  }, [isAssistantResponding, isSending, userInput, selectedCanvasId, sendCurrentMessage]);

  const handleRetry = useCallback(
    (userMessage: string) => setUserInput(userMessage),
    [setUserInput],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <TbLoader className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!threadId) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">Loading chat...</div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <CanvasSelector
            canvases={canvases ?? []}
            selectedId={selectedCanvasId}
            selectedName={canvasName}
            onSelect={handleCanvasChange}
          />
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => void startNewThread()}
            className="p-1.5 rounded-md hover:bg-gray-100 text-slate-400 hover:text-slate-600"
            title="New conversation"
          >
            <TbPlus size={15} />
          </button>
          <ThreadSelector currentThreadId={threadId} onSelectThread={selectThread} />
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 min-h-0">
        <ChatInterface
          threadId={threadId}
          onRetry={handleRetry}
          onAssistantRespondingChange={setIsAssistantResponding}
        />
      </div>

      {/* Input */}
      <div className="shrink-0 p-2 pt-0">
        <div className="bg-gray-100 border border-gray-300 shadow rounded-lg flex flex-col gap-2 mt-2">
          {attachedPage && (
            <div className="p-2 pb-0 flex flex-wrap gap-1">
              <PageAttachment page={attachedPage} onRemove={removeAttachedPage} />
            </div>
          )}
          <div className="p-2">
            <textarea
              ref={textareaRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Nolê..."
              disabled={isSending || isAssistantResponding}
              rows={1}
              className="w-full resize-none bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none min-h-6"
            />
          </div>
          <div className="flex items-center justify-between gap-2 pr-2 pb-2">
            <div className="flex items-center gap-2 pl-2">
              <button
                type="button"
                onClick={handleAttachPage}
                disabled={isSending || isAssistantResponding}
                className="p-1 rounded hover:bg-gray-200 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                title="Attach current page"
              >
                <TbGlobe size={14} />
              </button>

              {modelOptions && modelOptions.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setModelOpen(!modelOpen)}
                    disabled={
                      isSending ||
                      isAssistantResponding ||
                      (modelOptions?.length ?? 0) === 0
                    }
                    className="p-1 rounded hover:bg-gray-200 text-slate-500 text-xs disabled:opacity-30"
                  >
                    <TbBrain size={14} />
                  </button>
                  {modelOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setModelOpen(false)} />
                      <div className="absolute bottom-full left-0 mb-1 z-20 w-52 bg-white border rounded-lg shadow-lg py-1 max-h-60 overflow-y-auto">
                        {(modelOptions ?? []).map((model) => (
                          <button
                            key={model.value}
                            type="button"
                            onClick={() => {
                              setSelectedModel(model.value);
                              setModelOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between",
                              selectedModel === model.value && "font-medium bg-gray-50",
                            )}
                          >
                            <span className="flex items-center gap-1.5">
                              <span>{model.label}</span>
                              {model.isMultimodal && (
                                <TbPhoto size={10} className="text-slate-400" />
                              )}
                            </span>
                            <span className="text-xs text-slate-400 ml-2 shrink-0">
                              {model.price.replace("_", " - ")}
                            </span>
                            {selectedModel === model.value && (
                              <TbCheck size={12} className="shrink-0 text-green-500 ml-1" />
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isAssistantResponding && (
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => void stopAssistantResponse()}
                  className="flex items-center gap-1 px-2.5 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Stop
                  {isCancelling ? (
                    <TbLoader size={14} className="animate-spin" />
                  ) : (
                    <TbX size={14} />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleSend}
                disabled={
                  !userInput.trim() ||
                  isAssistantResponding ||
                  isSending ||
                  !selectedCanvasId
                }
                className="flex items-center gap-1 px-2.5 py-1 text-sm rounded-md text-white disabled:opacity-30"
                style={{ backgroundColor: "oklch(0.623 0.214 259.815)" }}
              >
                Send
                {isSending ? (
                  <TbLoader size={14} className="animate-spin" />
                ) : (
                  <TbSend size={14} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CanvasSelector({
  canvases,
  selectedId,
  selectedName,
  onSelect,
}: {
  canvases: Array<{ _id: string; name: string; shared?: boolean }>;
  selectedId: string | null;
  selectedName: string;
  onSelect: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (canvases.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-slate-600 font-medium hover:text-slate-800 truncate max-w-[160px]"
      >
        <span className="truncate">{selectedName || canvases[0]?.name || "Canvas"}</span>
        <TbSelector size={12} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 w-48 bg-white border rounded-lg shadow-lg py-1 max-h-60 overflow-y-auto">
            {canvases.map((c) => (
              <button
                key={c._id}
                type="button"
                onClick={() => {
                  onSelect(c._id, c.name);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between",
                  c._id === selectedId && "font-medium text-gray-900",
                )}
              >
                <span className="truncate">{c.name}</span>
                {c._id === selectedId && <TbCheck size={12} className="shrink-0 text-green-500" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ThreadSelector({
  currentThreadId,
  onSelectThread,
}: {
  currentThreadId: string;
  onSelectThread: (threadId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const threadsResult = useQuery(api.threads.listUserThreads, {
    paginationOpts: { numItems: 20, cursor: null },
  });
  const deleteThread = useAction(api.threads.deleteThread);

  const threads =
    threadsResult && !Array.isArray(threadsResult) && "threads" in threadsResult
      ? (threadsResult as { threads: { page: Array<{ _id: string; title?: string; _creationTime: number }> } }).threads.page
      : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-md hover:bg-gray-100 text-slate-400"
        title="Previous conversations"
      >
        <TbHistory size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 z-20 w-56 bg-white border rounded-lg shadow-lg py-1 max-h-72 overflow-y-auto">
            {threads.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400 text-center">No conversations yet</div>
            )}
            {threads.map((thread) => (
              <div
                key={thread._id}
                className={cn(
                  "flex items-center justify-between px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer",
                  thread._id === currentThreadId && "bg-gray-50 font-medium",
                )}
                onClick={() => {
                  onSelectThread(thread._id);
                  setOpen(false);
                }}
              >
                <div className="flex-1 min-w-0 mr-2">
                  <div className="truncate">{thread.title || "Untitled"}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(thread._creationTime).toLocaleDateString()}
                  </div>
                </div>
                {thread._id !== currentThreadId && (
                  <button
                    type="button"
                    className="p-0.5 rounded hover:text-red-500 shrink-0"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await deleteThread({ threadId: thread._id });
                      } catch (error) {
                        console.error("Error deleting thread:", error);
                      }
                    }}
                  >
                    <HiMiniXMark size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function PageAttachment({
  page,
  onRemove,
}: {
  page: PageContext;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600 max-w-full">
      <button
        type="button"
        onClick={onRemove}
        className="text-slate-400 hover:text-red-500 shrink-0"
      >
        <HiMiniXMark size={13} />
      </button>
      <TbGlobe size={12} className="shrink-0 text-slate-400" />
      <span className="truncate">
        {page.title || page.url || "Current page"}
      </span>
    </div>
  );
}
