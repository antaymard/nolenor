import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/RouteComponent')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/settings/RouteComponent"!</div>
}
