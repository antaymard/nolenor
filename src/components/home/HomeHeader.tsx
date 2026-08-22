import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { HiOutlineCog } from "react-icons/hi";
import { TbPlayerPlay, TbSearch } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/shadcn/button";
import { Kbd, KbdGroup } from "@/components/shadcn/kbd";
import { useCommandCenterStore } from "@/stores/commandCenterStore";

interface HomeHeaderProps {
  onStartTour: () => void;
  /** Rien à parcourir tant que le compte n'a aucun canvas : le raccourci
   *  ouvrirait une liste vide, autant ne pas le proposer. */
  canJump: boolean;
}

export default function HomeHeader({ onStartTour, canJump }: HomeHeaderProps) {
  const me = useQuery(api.users.me);
  const openCommandCenter = useCommandCenterStore((state) => state.open);

  // `me` est `undefined` tant que la query charge : on n'affiche pas « Hello,
  // undefined » le temps d'un aller-retour, on affiche juste le nom quand il
  // arrive.
  const name = me?.displayName ?? null;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <img src="/favicon.svg" alt="Nolënor" className="h-8 w-8" />
        <h1 className="text-xl font-semibold text-gray-900">
          {name ? `Hello, ${name}` : "Your workspaces"}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {canJump && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => openCommandCenter()}
            className="gap-2 font-normal text-gray-500"
          >
            <TbSearch size={15} />
            Jump to a workspace
            <KbdGroup className="ml-1 max-sm:hidden">
              <Kbd>⌘</Kbd>
              <Kbd>P</Kbd>
            </KbdGroup>
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onStartTour}
          title="Take the tour"
          aria-label="Take the tour"
        >
          <TbPlayerPlay size={16} />
        </Button>

        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/settings" title="Settings" aria-label="Settings">
            <HiOutlineCog size={18} />
          </Link>
        </Button>
      </div>
    </header>
  );
}
