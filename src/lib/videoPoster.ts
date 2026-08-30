/**
 * Capture d'une image de preview pour un fichier vidéo.
 *
 * Convex n'a pas ffmpeg : l'extraction de frame se fait donc dans le
 * navigateur, au moment de l'upload. Même approche que la pochette audio
 * (`audioMetadata.ts`) — décoder, réduire, encoder en webp — et le résultat
 * part sur R2 comme un objet à part entière, jamais inline dans les values :
 * `updateValues` recopie `values` dans une ligne `nodeDataVersions` à chaque
 * écriture, et une data URI gonflerait tous les checkpoints du node.
 *
 * La capture lit le `File` local via `createObjectURL`, jamais l'URL R2 : un
 * `<video>` cross-origin *taint* le canvas et ferait échouer `toBlob`.
 */

/** Une preview s'affiche au plus dans une window : 640px suffisent largement. */
const MAX_POSTER_SIZE = 640;

/**
 * Au-delà, on renonce : le fichier est illisible par ce navigateur, ou la
 * frame ne vient pas. Un node sans vignette reste parfaitement utilisable.
 */
const CAPTURE_TIMEOUT_MS = 15_000;

/**
 * La toute première frame est très souvent noire (fondu d'ouverture, slate).
 * On vise un peu plus loin, sans dépasser le dixième d'un fichier court.
 */
const SEEK_TARGET_SECONDS = 1;
const SEEK_MAX_RATIO = 0.1;

export interface VideoPosterResult {
  poster?: { blob: Blob; mimeType: string };
  duration?: number;
  width?: number;
  height?: number;
}

function once(
  el: HTMLVideoElement,
  event: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`video ${event} failed`));
    };
    const onAbort = () => {
      cleanup();
      reject(new Error("aborted"));
    };
    const cleanup = () => {
      el.removeEventListener(event, onDone);
      el.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    el.addEventListener(event, onDone, { once: true });
    el.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function encode(canvas: HTMLCanvasElement): Promise<
  { blob: Blob; mimeType: string } | undefined
> {
  // Même cascade que la pochette audio : webp, puis jpeg si l'encodeur webp
  // n'est pas disponible.
  for (const mimeType of ["image/webp", "image/jpeg"]) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), mimeType, 0.8);
    });
    if (blob) return { blob, mimeType };
  }
  return undefined;
}

/**
 * Lit les dimensions, la durée et une frame représentative d'un fichier vidéo.
 *
 * Délibérément best-effort : un codec que le navigateur ne décode pas (HEVC
 * sur Chrome, Matroska partout) renvoie un objet vide plutôt qu'une erreur.
 * L'appelant crée alors un node sans vignette, ce qui est un état prévu.
 */
export async function captureVideoPoster(
  file: File,
): Promise<VideoPosterResult> {
  const objectUrl = URL.createObjectURL(file);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);

  const el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.preload = "metadata";
  // Sans ça Safari refuse de peindre quoi que ce soit sur un élément détaché.
  el.setAttribute("playsinline", "");

  const result: VideoPosterResult = {};

  try {
    el.src = objectUrl;
    await once(el, "loadedmetadata", controller.signal);

    if (Number.isFinite(el.duration) && el.duration > 0) {
      result.duration = el.duration;
    }
    if (el.videoWidth > 0 && el.videoHeight > 0) {
      result.width = el.videoWidth;
      result.height = el.videoHeight;
    }

    // Une vidéo sans piste image (un mp4 qui ne contient que de l'audio) n'a
    // pas de frame à capturer, et les métadonnées relevées suffisent.
    if (!result.width || !result.height) return result;

    const duration = result.duration ?? 0;
    el.currentTime = duration
      ? Math.min(SEEK_TARGET_SECONDS, duration * SEEK_MAX_RATIO)
      : 0;
    await once(el, "seeked", controller.signal);

    const scale = Math.min(
      1,
      MAX_POSTER_SIZE / Math.max(el.videoWidth, el.videoHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(el.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(el.videoHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) return result;
    context.drawImage(el, 0, 0, canvas.width, canvas.height);

    result.poster = await encode(canvas);
    return result;
  } catch (error) {
    console.warn("[videoPoster] no frame could be captured", error);
    return result;
  } finally {
    clearTimeout(timeout);
    el.removeAttribute("src");
    el.load();
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Le `File` à uploader pour une vignette capturée, nommé d'après la vidéo dont
 * il vient.
 */
export function posterFileFrom(
  poster: { blob: Blob; mimeType: string },
): File {
  const extension = poster.mimeType.split("/")[1] ?? "webp";
  return new File([poster.blob], `poster.${extension}`, {
    type: poster.mimeType,
  });
}
