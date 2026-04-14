import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center font-mono font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "rounded-sm bg-gray-100 text-gray-700 border border-[#d1d5db]",
        secondary:
          "rounded-sm bg-gray-50 text-gray-600 border border-[#d1d5db]",
        outline: "rounded-sm text-gray-700 border border-[#d1d5db]",
        pill: "rounded-lg bg-gray-100 text-gray-700 border border-[#d1d5db]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
      size?: "sm" | "md"
    }

function Badge({ className, variant, size = "sm", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        badgeVariants({ variant }),
        size === "sm" ? "px-1.5 py-px text-[10px]" : "px-2.5 py-0.5 text-xs",
        className
      )}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
