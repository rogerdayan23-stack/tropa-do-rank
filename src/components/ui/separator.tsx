import * as React from "react";
import { cn } from "@/lib/utils";

interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {}

const Separator = React.forwardRef<HTMLHRElement, SeparatorProps>(({ className, ...props }, ref) => (
  <hr ref={ref} className={cn("mx-px h-[1px] bg-border", className)} {...props} />
));
Separator.displayName = "Separator";

export { Separator };
