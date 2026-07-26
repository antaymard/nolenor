import type {
  FieldViewComponent,
  FieldViewProps,
} from "@/components/fields/fieldHostTypes";

// edit:"none" : rendu figé, jamais interactif. `onCommit` n'est même pas
// reçu ici — StaticShell ne peut pas l'ignorer par erreur. Pas de `nodrag` :
// rien ici ne capte de clic, un node canvas entièrement couvert de champs
// statiques doit rester déplaçable (cf. plan : le nodrag inconditionnel
// d'aujourd'hui est un bug, pas une garantie à reproduire).
export default function StaticShell({
  View,
  ...viewProps
}: FieldViewProps & { View: FieldViewComponent }) {
  return <View {...viewProps} />;
}
