import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_14px_26px_-18px_rgba(15,23,42,0.65)] hover:-translate-y-0.5 hover:bg-primary/95",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_14px_24px_-18px_rgba(220,38,38,0.65)] hover:bg-destructive/92",
        outline:
          "border border-border/80 bg-card/85 text-foreground shadow-[0_10px_22px_-18px_rgba(15,23,42,0.5)] hover:border-border hover:bg-accent/55",
        secondary:
          "bg-secondary/90 text-secondary-foreground shadow-[0_10px_22px_-18px_rgba(15,23,42,0.5)] hover:bg-secondary",
        ghost: "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        success: "bg-success text-success-foreground shadow-[0_14px_24px_-18px_rgba(5,150,105,0.65)] hover:bg-success/92",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
