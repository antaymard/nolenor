import { useEffect, useCallback, useRef } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { useFileUpload } from "./useFilesUpload";
import { useCreateNode } from "./useCreateNode";
import toast from "react-hot-toast";
import prebuiltNodesConfig from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { useAction, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useCanvasStore } from "@/stores/canvasStore";
import { markdownToPlateValue } from "@/lib/plateMarkdownConverter";
import { extractAudioMetadata } from "@/lib/audioMetadata";

const PASTE_GUARD_WINDOW_MS = 300;

type PasteGuardState = {
  inFlight: boolean;
  lastSignature: string;
  lastAt: number;
};

function runWithPasteGuard(
  guardState: PasteGuardState,
  signature: string,
  action: () => Promise<void>,
): boolean {
  const now = Date.now();
  const inGuardWindow = now - guardState.lastAt < PASTE_GUARD_WINDOW_MS;

  if (
    (guardState.inFlight && inGuardWindow) ||
    (guardState.lastSignature === signature && inGuardWindow)
  ) {
    return false;
  }

  guardState.inFlight = true;
  guardState.lastSignature = signature;
  guardState.lastAt = now;

  void (async () => {
    try {
      await action();
    } finally {
      guardState.inFlight = false;
      guardState.lastAt = Date.now();
    }
  })();

  return true;
}

/**
 * Hook to handle paste events on the canvas
 * - Detects images and uploads them to R2, then creates an ImageNode
 * - Detects URLs and creates ImageNode (if image URL) or LinkNode (if web URL)
 */
export function useCanvasPasteHandler() {
  const { setNodes } = useReactFlow();
  const { x: canvasX, y: canvasY, zoom: canvasZoom } = useViewport();
  const { uploadFile } = useFileUpload();
  const { createNode } = useCreateNode();
  const fetchLinkMetadata = useAction(api.links.fetchLinkMetadata);
  const updateNodeDataValues = useMutation(api.nodeDatas.updateValues);
  const focus = useCanvasStore((s) => s.focus);
  const pasteGuardRef = useRef<PasteGuardState>({
    inFlight: false,
    lastSignature: "",
    lastAt: 0,
  });
  /**
   * Calculate the center position of the current viewport
   */
  const getViewportCenter = useCallback(() => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    return {
      x: (screenWidth / 2 - canvasX) / canvasZoom,
      y: (screenHeight / 2 - canvasY) / canvasZoom,
    };
  }, [canvasX, canvasY, canvasZoom]);

  /**
   * Check if a URL points to an image based on file extension
   */
  const isImageUrl = useCallback((url: string): boolean => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      const imageExtensions = [
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".svg",
        ".bmp",
        ".ico",
      ];
      return imageExtensions.some((ext) => pathname.endsWith(ext));
    } catch {
      return false;
    }
  }, []);

  /**
   * Create an ImageNode with optional initial URL
   * Returns nodeId and nodeDataId for later updates
   */
  const createImageNode = useCallback(
    async (
      url: string = "",
    ): Promise<{ nodeId: string; nodeDataId: Id<"nodeDatas"> } | null> => {
      const position = getViewportCenter();

      // Get ImageNode config from prebuilt nodes
      const imageNodeConfig = prebuiltNodesConfig.find(
        (config) => config.node.type === "image",
      );
      if (!imageNodeConfig) {
        toast.error("Error: ImageNode configuration not found");
        return null;
      }

      // Use createNode hook - it handles nodeData creation and node selection
      const { nodeId, nodeDataId } = await createNode({
        node: imageNodeConfig.node,
        position,
        initialValues: { images: url ? [{ url }] : [] },
      });

      return { nodeId, nodeDataId: nodeDataId! };
    },
    [getViewportCenter, createNode],
  );

  /**
   * Create a LinkNode with a URL and fetch metadata
   */
  const createLinkNode = useCallback(
    async (url: string) => {
      const position = getViewportCenter();

      // Get LinkNode config from prebuilt nodes
      const linkNodeConfig = prebuiltNodesConfig.find(
        (config) => config.node.type === "link",
      );
      if (!linkNodeConfig) {
        toast.error("Error: LinkNode configuration not found");
        return null;
      }

      // Use createNode hook - it handles nodeData creation and node selection
      const { nodeId, nodeDataId } = await createNode({
        node: linkNodeConfig.node,
        position,
        initialValues: {
          link: {
            href: url,
            pageTitle: url, // Temporary title
          },
        },
      });

      // Fetch metadata in background and update the nodeData
      if (nodeDataId) {
        try {
          const metadata = await fetchLinkMetadata({ url });
          await updateNodeDataValues({
            _id: nodeDataId,
            values: {
              link: {
                href: url,
                pageTitle: metadata.title || url,
                pageImage: metadata.image || "",
                pageDescription: metadata.description || "",
              },
            },
          });
        } catch (error) {
          console.error("Failed to fetch link metadata:", error);
          // Keep the nodeData with URL as title
        }
      }

      return nodeId;
    },
    [getViewportCenter, createNode, fetchLinkMetadata, updateNodeDataValues],
  );

  /**
   * Create a DocumentNode with plain text content
   */
  const createDocumentNode = useCallback(
    async (text: string) => {
      const position = getViewportCenter();

      const documentNodeConfig = prebuiltNodesConfig.find(
        (config) => config.node.type === "document",
      );
      if (!documentNodeConfig) {
        toast.error("Error: DocumentNode configuration not found");
        return null;
      }

      const doc = markdownToPlateValue(text);

      await createNode({
        node: documentNodeConfig.node,
        position,
        initialValues: { doc },
      });
    },
    [getViewportCenter, createNode],
  );

  /**
   * Handle image file paste
   */
  const handleImageFilePaste = useCallback(
    async (file: File) => {
      // Create the node first (with empty URL)
      const result = await createImageNode("");
      if (!result) return;

      const { nodeId, nodeDataId } = result;

      try {
        // Upload to R2
        const fileData = await uploadFile(file);

        // Update the nodeData with the uploaded URL and metadata
        await updateNodeDataValues({
          _id: nodeDataId,
          values: { images: [fileData] },
        });
        toast.success("Image added to canvas");
      } catch (error) {
        console.error("Upload failed:", error);
        toast.error("Error uploading image");

        // Remove the node since upload failed
        setNodes((nodes) => nodes.filter((n) => n.id !== nodeId));
      }
    },
    [createImageNode, uploadFile, updateNodeDataValues, setNodes],
  );

  /**
   * Handle audio file paste
   */
  const handleAudioFilePaste = useCallback(
    async (file: File) => {
      const position = getViewportCenter();

      const audioNodeConfig = prebuiltNodesConfig.find(
        (config) => config.node.type === "audio",
      );
      if (!audioNodeConfig) {
        toast.error("Error: AudioNode configuration not found");
        return;
      }

      // Create the node first so the upload has somewhere visible to land.
      const { nodeId, nodeDataId } = await createNode({
        node: audioNodeConfig.node,
        position,
      });
      if (!nodeDataId) return;

      try {
        const fileData = await uploadFile(file);
        const tags = await extractAudioMetadata(file);

        let cover: { url: string; key: string } | null = null;
        if (tags.cover) {
          try {
            const extension = tags.cover.mimeType.split("/")[1] ?? "jpg";
            const uploaded = await uploadFile(
              new File([tags.cover.blob], `cover.${extension}`, {
                type: tags.cover.mimeType,
              }),
            );
            cover = { url: uploaded.url, key: uploaded.key };
          } catch (error) {
            console.warn("Cover upload failed", error);
          }
        }

        await updateNodeDataValues({
          _id: nodeDataId,
          values: {
            audio: {
              ...fileData,
              duration: 0,
              peaks: [],
              title: tags.title,
              artist: tags.artist,
              cover,
            },
            loop: { start: 0, end: 0, enabled: false },
          },
        });
        toast.success("Audio added to canvas");
      } catch (error) {
        console.error("Upload failed:", error);
        toast.error("Error uploading audio");

        setNodes((nodes) => nodes.filter((n) => n.id !== nodeId));
      }
    },
    [
      getViewportCenter,
      createNode,
      uploadFile,
      updateNodeDataValues,
      setNodes,
    ],
  );

  /**
   * Handle URL paste (image URL or web URL)
   */
  const handleUrlPaste = useCallback(
    async (url: string) => {
      // Check if it's a valid URL
      try {
        new URL(url);
      } catch {
        // Not a valid URL, ignore
        return;
      }

      if (isImageUrl(url)) {
        // Create ImageNode with the URL
        await createImageNode(url);
        toast.success("Image added to canvas");
      } else {
        // Create LinkNode (async - fetches metadata in background)
        await createLinkNode(url);
        toast.success("Link added to canvas");
      }
    },
    [isImageUrl, createImageNode, createLinkNode],
  );

  /**
   * Main paste event handler
   */
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      // Only paste onto the canvas when the canvas is what has focus. Tested
      // positively (`!== "canvas"`) and not against a list of other values:
      // with the old `=== "richtext-editor"` check, any new Focus value fell
      // through to canvas behaviour — a paste over an open modal created a
      // node behind it.
      if (focus !== "canvas") {
        return;
      }
      // Ignore paste events in input/textarea/contenteditable elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Check for image files first
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/")) {
          const signature = `image:${file.type}:${file.size}:${file.lastModified}`;
          e.preventDefault();
          runWithPasteGuard(pasteGuardRef.current, signature, async () => {
            await handleImageFilePaste(file);
          });
          return;
        }
        if (file.type.startsWith("audio/")) {
          const signature = `audio:${file.type}:${file.size}:${file.lastModified}`;
          e.preventDefault();
          runWithPasteGuard(pasteGuardRef.current, signature, async () => {
            await handleAudioFilePaste(file);
          });
          return;
        }
      }

      // Check for text (URL or plain text)
      const text = e.clipboardData?.getData("text");
      if (text && text.trim()) {
        const trimmedText = text.trim();
        const signature = `text:${trimmedText.slice(0, 500)}`;
        e.preventDefault();

        if (
          trimmedText.startsWith("http://") ||
          trimmedText.startsWith("https://")
        ) {
          runWithPasteGuard(pasteGuardRef.current, signature, async () => {
            await handleUrlPaste(trimmedText);
          });
        } else {
          runWithPasteGuard(pasteGuardRef.current, signature, async () => {
            await createDocumentNode(trimmedText);
            toast.success("Document created");
          });
        }
      }
    },
    [
      focus,
      handleImageFilePaste,
      handleAudioFilePaste,
      handleUrlPaste,
      createDocumentNode,
    ],
  );

  // Register paste event listener
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);
}
