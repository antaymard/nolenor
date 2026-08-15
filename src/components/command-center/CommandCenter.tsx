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
import { TbCommand, TbSearch } from "react-icons/tb";
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
import type { MatchedCommandItem } from "./commandCenterTypes";
import { filterCommands } from "./commandMatching";
import { useCommandCenterItems } from "./useCommandCenterItems";

/**
 * Palette de commandes globale (Ctrl/Cmd + P).
 *
 * À ne pas confondre avec la recherche (Ctrl/Cmd + K) : celle-ci fouille le
 * contenu d'un canvas, celle-là exécute des actions de l'app. Elle est montée
 * une seule fois à la racine pour rester atteignable depuis n'importe quelle
 * route ; les commandes elles-mêmes viennent de `useCommandCenterItems`.
 */
export default function CommandCenter() {
  const isOpen = useCommandCenterStore((state) => state.isOpen);
  const query = useCommandCenterStore((state) => state.query);
  const setQuery = useCommandCenterStore((state) => state.setQuery);
  const close = useCommandCenterStore((state) => state.close);
  const toggle = useCommandCenterStore((state) => state.toggle);

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

  const { items, isLoading } = useCommandCenterItems({
    enabled: hasBeenOpened,
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
  }, [query, isOpen]);
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
      close();
    },
    [close],
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
          Taper une commande, par exemple le nom d'un canvas pour basculer
          dessus.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b px-3 py-2">
          <TbCommand className="shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listboxId}
            aria-activedescendant={
              flatItems.length > 0 ? optionId(activeIndex) : undefined
            }
            aria-label="Commande"
            placeholder="Aller à un canvas…"
            className="min-w-0 flex-1 border-none bg-transparent outline-none placeholder:text-muted-foreground"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div
          ref={listRef}
          role="listbox"
          id={listboxId}
          aria-label="Commandes"
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
                  <TbSearch />
                </EmptyMedia>
                <EmptyTitle>Aucune commande</EmptyTitle>
                {query.trim() ? (
                  <EmptyDescription>
                    Aucune correspondance pour « {query.trim()} ».
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
            naviguer
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            exécuter
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            fermer
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
