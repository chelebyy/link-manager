import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-base font-normal font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[#58a6ff] text-white hover:opacity-90 active:opacity-80",
        destructive:
          "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
        outline:
          "border border-[#d1d5db] bg-transparent text-[#374151] hover:bg-gray-100 active:bg-gray-200 dark:text-[#e5e7eb] dark:hover:bg-gray-800 dark:active:bg-gray-700",
        secondary:
          "border border-[#d1d5db] bg-transparent text-[#374151] hover:bg-gray-100 active:bg-gray-200 dark:text-[#e5e7eb] dark:hover:bg-gray-800 dark:active:bg-gray-700",
        ghost: "hover:bg-gray-100 hover:text-[#374151] active:bg-gray-200 dark:hover:bg-gray-800 dark:hover:text-[#e5e7eb] dark:active:bg-gray-700",
        link: "text-[#58a6ff] underline-offset-4 hover:underline active:opacity-80",
      },
      size: {
        default: "h-11 px-4 py-2 min-h-[44px]",
        sm: "h-11 px-4 py-2 min-h-[44px]",
        lg: "h-12 px-6 py-3 min-h-[48px]",
        icon: "h-11 w-11 min-h-[44px] min-w-[44px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
