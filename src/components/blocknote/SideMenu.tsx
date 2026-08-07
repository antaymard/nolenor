import { SideMenu, DragHandleButton, type SideMenuProps } from "@blocknote/react";

// Retire le bouton "+" (insertion de bloc) du side menu par défaut de
// BlockNote, ne garde que la poignée de drag — ajouter un bloc reste
// possible via "/" ou Entrée.
export function SideMenuWithoutAddButton(props: SideMenuProps) {
  return (
    <SideMenu {...props}>
      <DragHandleButton dragHandleMenu={props.dragHandleMenu} />
    </SideMenu>
  );
}
