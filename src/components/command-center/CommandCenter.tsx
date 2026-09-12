import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { TbCommand, TbDirections, TbSearch } from "react-icons/tb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Kbd, KbdGroup } from "@/components/shadcn/kbd";
import { Skeleton } from "@/components/shadcn/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/shadcn/empty";
import { cn } from "@/lib/utils";
import { useCommandCenterStore } from "@/stores/commandCenterStore";
import {
  useCanvasNavigatorStore,
  type NavigatorMarker,
} from "@/stores/canvasNavigatorStore";
import type { MatchedCommandItem } from "./commandCenterTypes";
import { filterCommands } from "./commandMatching";
import { useCommandCenterItems } from "./useCommandCenterItems";
import TargetDeltaBadge from "../canvas/navigation/TargetDeltaBadge";

/**
 * Palette de commandes globale (Ctrl/Cmd + P).
 *
 * À ne pas confondre avec la recherche (Ctrl/Cmd + K) : celle-ci fouille le
 * contenu d'un canvas, celle-là exécute des actions de l'app. Elle est montée
 * une seule fois à la racine pour rester atteignable depuis n'importe quelle
 * route ; les commandes elles-mêmes viennent de `useCommandCenterItems`.
 *
 * Deux contextes de recherche (cf. `CommandCenterMode`) : les actions de l'app
 * par défaut, les repères de navigation du canvas courant après « go » +
 * espace. Le préfixe ne reste pas dans la saisie, il devient une pastille.
 */
export default function CommandCenter() {
  const isOpen = useCommandCenterStore((state) => state.isOpen);
  const query = useCommandCenterStore((state) => state.query);
  const setQuery = useCommandCenterStore((state) => state.setQuery);
  const close = useCommandCenterStore((state) => state.close);
  const toggle = useCommandCenterStore((state) => state.toggle);
  const mode = useCommandCenterStore((state) => state.mode);
  const setMode = useCommandCenterStore((state) => state.setMode);
  const isGoMode = mode === "go";
  const hasNavigator = useCanvasNavigatorStore(
    (state) => state.navigator !== null,
  );

  // `preventDefault` neutralise la boîte d'impression du navigateur, et les
  // combos Ctrl/Cmd passent par défaut même quand un champ texte a le focus.
  useHotkey("Mod+P", () => toggle(), { preventDefault: true });

  // Les requêtes ne démarrent qu'à la première ouverture, puis restent
  // actives : ça évite la liste vide qui clignote pendant l'animation de
  // fermeture, et les réouvertures sont instantanées.
  const [hasBeenOpened, setHasBeenOpened] = useState(false);
  useEffect(() => {
    if (isOpen) setHasBeenOpened(true);
  }, [isOpen]);

  // Instantané et non abonnement : la liste des repères est lue à l'entrée
  // dans le mode, et ne vit que le temps de quelques frappes. Un titre qui
  // changerait pendant ce laps de temps n'est pas un cas à traiter ; le
  // cadrage, lui, est relu à l'exécution (cf. `run` dans
  // `useCommandCenterItems`), pour ne pas naviguer vers un repère disparu.
  const [markers, setMarkers] = useState<NavigatorMarker[]>([]);
  useEffect(() => {
    if (!isGoMode) {
      setMarkers([]);
      return;
    }
    setMarkers(
      useCanvasNavigatorStore.getState().navigator?.getMarkers() ?? [],
    );
  }, [isGoMode]);

  const { items, isLoading } = useCommandCenterItems({
    enabled: hasBeenOpened,
    mode,
    markers,
  });

  // Les commandes triées par pertinence, puis regroupées par section. L'ordre
  // des sections suit la première apparition : la meilleure correspondance
  // reste ainsi tout en haut de la liste.
  const sections = useMemo(() => {
    const grouped = new Map<string, MatchedCommandItem[]>();
    for (const item of filterCommands(items, query)) {
      const existing = grouped.get(item.group);
      if (existing) existing.push(item);
      else grouped.set(item.group, [item]);
    }
    // `startIndex` mappe une position dans la section vers l'index à plat qui
    // sert à la navigation clavier.
    let startIndex = 0;
    return Array.from(grouped, ([group, groupItems]) => {
      const section = { group, items: groupItems, startIndex };
      startIndex += groupItems.length;
      return section;
    });
  }, [items, query]);

  // Liste à plat : c'est elle qui porte les index de navigation clavier.
  const flatItems = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );

  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    setActiveIndex(0);
  }, [query, isOpen, mode]);
  useEffect(() => {
    setActiveIndex((index) =>
      flatItems.length === 0 ? 0 : Math.min(index, flatItems.length - 1),
    );
  }, [flatItems.length]);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, flatItems.length]);

  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-opt-${index}`;

  const runItem = useCallback(
    (item: MatchedCommandItem) => {
      item.run();
      // Une commande qui prépare une recherche (basculer en mode « go ») doit
      // laisser la modale ouverte : la fermer annulerait ce qu'on demande.
      if (item.keepOpen) {
        setQuery("");
        return;
      }
      close();
    },
    [close, setQuery],
  );

  /**
   * « go » + espace fait basculer en mode repères.
   *
   * Détecté sur la valeur *brute*, avant tout filtrage : `normalizeQuery`
   * supprime les espaces, le préfixe y serait invisible. Ce qui suit le
   * préfixe devient la requête — coller « go réunion » doit chercher
   * « réunion », pas repartir de zéro.
   */
  const handleQueryChange = useCallback(
    (value: string) => {
      if (!isGoMode) {
        const prefix = /^go\s+/i.exec(value);
        if (prefix) {
          setMode("go");
          setQuery(value.slice(prefix[0].length));
          return;
        }
      }
      setQuery(value);
    },
    [isGoMode, setMode, setQuery],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => {
        if (flatItems.length === 0) return 0;
        return Math.min(Math.max(index + delta, 0), flatItems.length - 1);
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = flatItems[activeIndex];
      if (selected) runItem(selected);
    } else if (
      event.key === "Backspace" &&
      isGoMode &&
      query.length === 0
    ) {
      // Sortie du mode : la pastille se comporte comme le dernier caractère
      // de la saisie, on l'efface d'un Backspace.
      event.preventDefault();
      setMode("all");
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[70vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Command center</DialogTitle>
        <DialogDescription className="sr-only">
          Type a command — a canvas name to switch to it, or “go ” then a
          marker name to jump to it on the current canvas.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b px-3 py-2">
          {isGoMode ? (
            <TbDirections className="shrink-0 text-muted-foreground" />
          ) : (
            <TbCommand className="shrink-0 text-muted-foreground" />
          )}
          {/* La pastille remplace le préfixe tapé : le contexte de recherche
              se voit, sans encombrer la saisie. */}
          {isGoMode ? (
            <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-xs font-medium">
              Markers
            </span>
          ) : null}
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listboxId}
            aria-activedescendant={
              flatItems.length > 0 ? optionId(activeIndex) : undefined
            }
            aria-label={isGoMode ? "Marker name" : "Command"}
            placeholder={
              isGoMode ? "Jump to a marker…" : "Go to a canvas…"
            }
            className="min-w-0 flex-1 border-none bg-transparent outline-none placeholder:text-muted-foreground"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div
          ref={listRef}
          role="listbox"
          id={listboxId}
          aria-label="Commands"
          className="flex-1 overflow-auto p-1"
        >
          {isLoading ? (
            <div className="flex flex-col gap-1 p-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          ) : flatItems.length === 0 ? (
            <Empty className="h-full border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {isGoMode ? <TbDirections /> : <TbSearch />}
                </EmptyMedia>
                <EmptyTitle>
                  {isGoMode ? "No marker" : "No command"}
                </EmptyTitle>
                {isGoMode && !hasNavigator ? (
                  <EmptyDescription>
                    Open a canvas to jump to its markers.
                  </EmptyDescription>
                ) : query.trim() ? (
                  <EmptyDescription>
                    No match for “{query.trim()}”.
                  </EmptyDescription>
                ) : isGoMode ? (
                  <EmptyDescription>
                    This canvas has no navigation marker yet.
                  </EmptyDescription>
                ) : null}
              </EmptyHeader>
            </Empty>
          ) : (
            sections.map((section) => (
              <Fragment key={section.group}>
                <h4 className="px-2 pt-2 pb-1 text-xs tracking-wider text-muted-foreground uppercase">
                  {section.group}
                </h4>
                {section.items.map((item, indexInSection) => {
                  const index = section.startIndex + indexInSection;
                  return (
                    <CommandRow
                      key={item.id}
                      optionId={optionId(index)}
                      item={item}
                      active={index === activeIndex}
                      onSelect={() => setActiveIndex(index)}
                      onRun={() => runItem(item)}
                    />
                  );
                })}
              </Fragment>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <KbdGroup>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </KbdGroup>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            run
          </span>
          {isGoMode ? (
            <span className="flex items-center gap-1.5">
              <Kbd>⌫</Kbd>
              all commands
            </span>
          ) : hasNavigator ? (
            <span className="flex items-center gap-1.5">
              <Kbd>go</Kbd>
              markers
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommandRow({
  optionId,
  item,
  active,
  onSelect,
  onRun,
}: {
  optionId: string;
  item: MatchedCommandItem;
  active: boolean;
  onSelect: () => void;
  onRun: () => void;
}) {
  const Icon = item.icon;

  return (
    <div
      id={optionId}
      role="option"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      onMouseMove={onSelect}
      onClick={onRun}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      {Icon ? (
        <Icon size={14} className="shrink-0 text-muted-foreground" />
      ) : null}
      <HighlightedLabel
        label={item.label}
        matchedIndices={item.matchedIndices}
      />
      {/* Cap + distance figés (mode « go » uniquement) : la vue ne bouge pas
          tant que la modale est ouverte — rien quand on est dessus. */}
      {item.delta !== undefined ? (
        <TargetDeltaBadge delta={item.delta} noun="marker" />
      ) : null}
      {item.hint ? (
        <span className="shrink-0 rounded bg-muted px-1.5 text-xs text-muted-foreground">
          {item.hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Surligne les caractères retenus par le filtre flou. `matchedIndices` indexe
 * les *code points* du libellé, d'où le `Array.from` (cf. `commandMatching`).
 */
function HighlightedLabel({
  label,
  matchedIndices,
}: {
  label: string;
  matchedIndices: number[];
}) {
  const characters = useMemo(() => Array.from(label), [label]);
  const matched = useMemo(() => new Set(matchedIndices), [matchedIndices]);

  return (
    <span className="min-w-0 flex-1 truncate text-sm">
      {matched.size === 0
        ? label
        : characters.map((character, index) =>
            matched.has(index) ? (
              <span key={index} className="font-semibold text-foreground">
                {character}
              </span>
            ) : (
              <Fragment key={index}>{character}</Fragment>
            ),
          )}
    </span>
  );
}
