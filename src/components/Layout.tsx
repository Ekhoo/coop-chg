import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Package, ShoppingCart, Tag, Users, BarChart3, Flame } from 'lucide-react'
import { useAuth } from '@/lib/auth'

export function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-brand-600 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <Flame className="h-6 w-6" />
            Coop Nico
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-sm text-right hidden sm:block">
              <div className="font-medium">{profile?.display_name}</div>
              <div className="text-xs opacity-80">
                {profile?.role === 'admin' ? 'Administrateur' : 'Vendeur'}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="btn-ghost text-white hover:bg-brand-700"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-4 pb-4">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <NavItem to="/" label="Vente" icon={<ShoppingCart className="h-4 w-4" />} end />
            {isAdmin && (
              <>
                <NavItem
                  to="/admin/products"
                  label="Articles"
                  icon={<Package className="h-4 w-4" />}
                />
                <NavItem
                  to="/admin/categories"
                  label="Catégories"
                  icon={<Tag className="h-4 w-4" />}
                />
                <NavItem
                  to="/admin/users"
                  label="Comptes"
                  icon={<Users className="h-4 w-4" />}
                />
                <NavItem
                  to="/admin/sales"
                  label="Ventes"
                  icon={<BarChart3 className="h-4 w-4" />}
                />
              </>
            )}
          </div>
        </nav>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-4">
        <Outlet />
      </main>
    </div>
  )
}

function NavItem({
  to,
  label,
  icon,
  end,
}: {
  to: string
  label: string
  icon: React.ReactNode
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
          isActive
            ? 'bg-white text-brand-700 shadow-lg shadow-black/10 ring-1 ring-black/5'
            : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
