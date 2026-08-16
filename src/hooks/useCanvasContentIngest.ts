import { useCallback } from "react";
import { useReactFlow, type XYPosition } from "@xyflow/react";
import { useAction, useMutation } from "convex/react";
import toast from "react-hot-toast";
import { useFileUpload } from "./useFilesUpload";
import { useCreateNode } from "./useCreateNode";
import prebuiltNodesConfig from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { NodeType } from "@/types/domain";
import { markdownToBlockNoteBlocks } from "@/lib/blockNoteMarkdownConverter";
import { extractAudioMetadata } from "@/lib/audioMetadata";
import { buildTableFromParsedCsv, parseCsvFile } from "@/components/table/csv";
import { isImageUrl, resolveFileNodeType } from "@/lib/nodeTypeForFile";

/** Espacement entre deux nodes lors d'un drop multi-fichiers. */
const GRID_GAP = 24;
/** Nombre de nodes par ligne dans la grille d'un drop multi-fichiers. */
const GRID_COLUMNS = 4;

function getNodeConfig(type: NodeType) {
  return prebuiltNodesConfig.find((config) => config.node.type === type);
}

/**
 * Positions en grille depuis le point de drop. Les dimensions viennent du
 * `defaultDimensions` de chaque type, donc une ligne mêlant une image et un PDF
 * ne se chevauche pas.
 */
function layoutPositions(
  types: NodeType[],
  origin: XYPosition,
): XYPosition[] {
  const positions: XYPosition[] = [];
  let rowTop = origin.y;
  let rowIndex = 0;

  while (rowIndex * GRID_COLUMNS < types.length) {
    const row = types.slice(
      rowIndex * GRID_COLUMNS,
      (rowIndex + 1) * GRID_COLUMNS,
    );
    let x = origin.x;
    let rowHeight = 0;

    for (const type of row) {
      const dimensions = getNodeConfig(type)?.defaultDimensions;
      const width = dimensions?.width ?? 220;
      const height = dimensions?.height ?? 120;
      positions.push({ x, y: rowTop });
      x += width + GRID_GAP;
      rowHeight = Math.max(rowHeight, height);
    }

    rowTop += rowHeight + GRID_GAP;
    rowIndex += 1;
  }

  return positions;
}

/**
 * Fabrique partagée « contenu externe → node sur le canvas ».
 *
 * Utilisée par le coller (`useCanvasPasteHandler`, position = centre du
 * viewport) et par le glisser-déposer (`useCanvasDropHandler`, position = point
 * de drop). Toute la création passe par `useCreateNode`, et les fichiers par
 * `useFileUpload` (R2).
 */
export function useCanvasContentIngest() {
  const { setNodes } = useReactFlow();
  const { uploadFile } = useFileUpload();
  const { createNode } = useCreateNode();
  const fetchLinkMetadata = useAction(api.links.fetchLinkMetadata);
  const updateNodeDataValues = useMutation(api.nodeDatas.updateValues);

  /**
   * Create an ImageNode with optional initial URL
   * Returns nodeId and nodeDataId for later updates
   */
  const createImageNode = useCallback(
    async (
      position: XYPosition,
      url: string = "",
    ): Promise<{ nodeId: string; nodeDataId: Id<"nodeDatas"> } | null> => {
      const imageNodeConfig = getNodeConfig("image");
      if (!imageNodeConfig) {
        toast.error("Error: ImageNode configuration not found");
        return null;
      }

      const { nodeId, nodeDataId } = await createNode({
        node: imageNodeConfig.node,
        position,
        initialValues: { images: url ? [{ url }] : [] },
      });

      return { nodeId, nodeDataId };
    },
    [createNode],
  );

  /**
   * Create a LinkNode with a URL and fetch metadata
   */
  const createLinkNode = useCallback(
    async (url: string, position: XYPosition) => {
      const linkNodeConfig = getNodeConfig("link");
      if (!linkNodeConfig) {
        toast.error("Error: LinkNode configuration not found");
        return null;
      }

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
    [createNode, fetchLinkMetadata, updateNodeDataValues],
  );

  /**
   * Create a BlocknoteNode from markdown / plain text content
   */
  const createBlocknoteNode = useCallback(
    async (text: string, position: XYPosition) => {
      const blocknoteNodeConfig = getNodeConfig("blocknote");
      if (!blocknoteNodeConfig) {
        toast.error("Error: BlocknoteNode configuration not found");
        return null;
      }

      const doc = markdownToBlockNoteBlocks(text);

      return createNode({
        node: blocknoteNodeConfig.node,
        position,
        initialValues: { doc },
      });
    },
    [createNode],
  );

  /**
   * Create a TableNode from a CSV file. Columns are named after the header row
   * and their type is inferred from the values — no mapping dialog, the user
   * can still adjust everything once the node is on the canvas.
   */
  const createTableNodeFromCsv = useCallback(
    async (file: File, position: XYPosition) => {
      const tableNodeConfig = getNodeConfig("table");
      if (!tableNodeConfig) {
        toast.error("Error: TableNode configuration not found");
        return null;
      }

      const parsed = await parseCsvFile(file);
      const { columns, rows } = buildTableFromParsedCsv(parsed);

      return createNode({
        node: tableNodeConfig.node,
        position,
        initialValues: {
          table: {
            columns,
            rows,
            title: file.name.replace(/\.csv$/i, ""),
          },
        },
      });
    },
    [createNode],
  );

  /**
   * Handle an image file: create the node first so the upload has somewhere
   * visible to land, then patch it with the uploaded URL.
   */
  const createImageNodeFromFile = useCallback(
    async (file: File, position: XYPosition) => {
      const result = await createImageNode(position, "");
      if (!result) return;

      const { nodeId, nodeDataId } = result;

      try {
        const fileData = await uploadFile(file);
        await updateNodeDataValues({
          _id: nodeDataId,
          values: { images: [fileData] },
        });
      } catch (error) {
        console.error("Upload failed:", error);
        // Remove the node since upload failed
        setNodes((nodes) => nodes.filter((n) => n.id !== nodeId));
        throw error;
      }
    },
    [createImageNode, uploadFile, updateNodeDataValues, setNodes],
  );

  /**
   * Handle an audio file: node first, then upload + tags + cover art.
   */
  const createAudioNodeFromFile = useCallback(
    async (file: File, position: XYPosition) => {
      const audioNodeConfig = getNodeConfig("audio");
      if (!audioNodeConfig) {
        toast.error("Error: AudioNode configuration not found");
        return;
      }

      const { nodeId, nodeDataId } = await createNode({
        node: audioNodeConfig.node,
        position,
      });

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
      } catch (error) {
        console.error("Upload failed:", error);
        setNodes((nodes) => nodes.filter((n) => n.id !== nodeId));
        throw error;
      }
    },
    [createNode, uploadFile, updateNodeDataValues, setNodes],
  );

  /**
   * Handle a PDF — or any file type we don't have a dedicated node for. The
   * `pdf` node is the generic file holder: it stores `values.files` and knows
   * how to preview PDFs and download the rest.
   */
  const createFileNodeFromFile = useCallback(
    async (file: File, position: XYPosition) => {
      const pdfNodeConfig = getNodeConfig("pdf");
      if (!pdfNodeConfig) {
        toast.error("Error: PdfNode configuration not found");
        return;
      }

      const { nodeId, nodeDataId } = await createNode({
        node: pdfNodeConfig.node,
        position,
      });

      try {
        const fileData = await uploadFile(file);
        await updateNodeDataValues({
          _id: nodeDataId,
          values: { files: [fileData] },
        });
      } catch (error) {
        console.error("Upload failed:", error);
        setNodes((nodes) => nodes.filter((n) => n.id !== nodeId));
        throw error;
      }
    },
    [createNode, uploadFile, updateNodeDataValues, setNodes],
  );

  /**
   * Create the node matching a single file's type at the given position.
   * Rejects if the upload (or the CSV parsing) fails — callers report.
   */
  const createNodeFromFile = useCallback(
    async (file: File, position: XYPosition) => {
      switch (resolveFileNodeType(file)) {
        case "image":
          return createImageNodeFromFile(file, position);
        case "audio":
          return createAudioNodeFromFile(file, position);
        case "table":
          await createTableNodeFromCsv(file, position);
          return;
        case "blocknote":
          await createBlocknoteNode(await file.text(), position);
          return;
        default:
          return createFileNodeFromFile(file, position);
      }
    },
    [
      createImageNodeFromFile,
      createAudioNodeFromFile,
      createTableNodeFromCsv,
      createBlocknoteNode,
      createFileNodeFromFile,
    ],
  );

  /**
   * Create one node per file, laid out in a grid from `origin`. Uploads run in
   * parallel; a failed file drops its own node and is counted in the toast.
   */
  const createNodesFromFiles = useCallback(
    async (files: File[], origin: XYPosition) => {
      if (files.length === 0) return;

      const positions = layoutPositions(files.map(resolveFileNodeType), origin);
      const results = await Promise.allSettled(
        files.map((file, index) => createNodeFromFile(file, positions[index])),
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      const created = results.length - failed;

      if (created === 1) {
        const type = resolveFileNodeType(
          files[results.findIndex((r) => r.status === "fulfilled")],
        );
        toast.success(`${getNodeConfig(type)?.label ?? "Node"} added to canvas`);
      } else if (created > 1) {
        toast.success(`${created} nodes added to canvas`);
      }
      if (failed > 0) {
        toast.error(
          failed === 1 ? "A file could not be added" : `${failed} files failed`,
        );
      }
    },
    [createNodeFromFile],
  );

  /**
   * Handle a URL (image URL or web URL)
   */
  const createNodeFromUrl = useCallback(
    async (url: string, position: XYPosition) => {
      // Check if it's a valid URL
      try {
        new URL(url);
      } catch {
        // Not a valid URL, ignore
        return;
      }

      if (isImageUrl(url)) {
        await createImageNode(position, url);
        toast.success("Image added to canvas");
      } else {
        // Create LinkNode (async - fetches metadata in background)
        await createLinkNode(url, position);
        toast.success("Link added to canvas");
      }
    },
    [createImageNode, createLinkNode],
  );

  /**
   * Handle plain text: URLs become links/images, anything else a document.
   */
  const createNodeFromText = useCallback(
    async (text: string, position: XYPosition) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        await createNodeFromUrl(trimmed, position);
        return;
      }

      await createBlocknoteNode(trimmed, position);
      toast.success("Document created");
    },
    [createNodeFromUrl, createBlocknoteNode],
  );

  return {
    createNodeFromFile,
    createNodesFromFiles,
    createNodeFromUrl,
    createNodeFromText,
  };
}
