import { Link, NavLink } from 'react-router-dom'
import { Wordmark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/join', label: 'Join' },
  { to: '/create', label: 'Create' },
]

/**
 * Shared frame for the non-gameplay pages (Home, Create/Edit, Join,
 * Results): skip link, a 64px header with the wordmark, the two entry
 * points and the theme toggle, and a <main> landmark. Gameplay screens
 * (Host, Display, Play) have their own chrome (Decision #55: no theme
 * toggle there).
 */
export function AppShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link to="/" aria-label="Pulz home" className="mr-auto rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
            <Wordmark markClassName="size-8 rounded-[9px] p-[4px]" />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" tabIndex={-1} className={cn('flex-1 outline-none', className)}>
        {children}
      </main>
    </div>
  )
}
