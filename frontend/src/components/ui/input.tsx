import * as React from "react"
import { cn } from "../../lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full border border-[#d1d5db] rounded-sm bg-transparent px-3 py-1 text-sm transition-colors placeholder:font-mono placeholder:text-[#737373] focus:border-[#58a6ff] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#808080] dark:text-[#ededed] dark:placeholder:text-[#808080]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }