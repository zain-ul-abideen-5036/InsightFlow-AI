import { cn } from "@/lib/utils";

/**
 * Loading placeholder.
 *
 * Hidden from assistive technology: announcing every shimmering block is noise.
 * The surrounding region carries one aria-busy announcement instead.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("shimmer rounded-md", className)} {...props} />;
}

export { Skeleton };
