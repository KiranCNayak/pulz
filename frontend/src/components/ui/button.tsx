import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Pulz button (DESIGN_SYSTEM.md §4): the primary is a Signal Lime "game
// button" whose darker bottom edge compresses on press, echoing the answer
// tiles. Transitions name their properties (never `transition: all`).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_3px_0_var(--color-primary-edge)] hover:brightness-[1.04] active:not-aria-[haspopup]:translate-y-[2px] active:not-aria-[haspopup]:shadow-[0_1px_0_var(--color-primary-edge)]",
        outline:
          "border-border bg-card text-foreground shadow-xs hover:border-foreground/20 hover:bg-muted active:not-aria-[haspopup]:translate-y-px aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_7%)] active:not-aria-[haspopup]:translate-y-px",
        ghost:
          "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/18 focus-visible:ring-destructive/30",
        link: "text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground",
      },
      size: {
        default: "h-10 gap-2 px-4",
        xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-5 text-base [&_svg:not([class*='size-'])]:size-5",
        xl: "h-14 gap-2.5 px-7 text-lg [&_svg:not([class*='size-'])]:size-5",
        icon: "size-10",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
