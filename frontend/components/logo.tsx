import { cn } from "@/lib/utils";

/**
 * InsightFlow mark.
 *
 * Three ascending bars crossed by a flowing line: measurement plus movement.
 * It is drawn with `currentColor` so it inherits from its surroundings and
 * works on any background, at 16px in a favicon and at 96px on a login page,
 * without a second asset.
 */
export function LogoMark({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="InsightFlow"
      className={cn("size-8", className)}
      {...props}
    >
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <rect x="7" y="18" width="3.5" height="7" rx="1.25" fill="white" fillOpacity="0.55" />
      <rect x="14.25" y="13" width="3.5" height="12" rx="1.25" fill="white" fillOpacity="0.78" />
      <rect x="21.5" y="8" width="3.5" height="17" rx="1.25" fill="white" />
      <path
        d="M6 14.5C9.5 14.5 10.5 9 15 9C19.5 9 20 5.5 26 5.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
    </svg>
  );
}

export function Logo({
  className,
  showWordmark = true,
  size = "default",
}: {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "default" | "lg";
}) {
  const markSize = { sm: "size-6", default: "size-7", lg: "size-9" }[size];
  const textSize = { sm: "text-sm", default: "text-[15px]", lg: "text-xl" }[size];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={cn(markSize, "text-foreground")} />
      {showWordmark ? (
        <span className={cn("font-semibold tracking-tight text-foreground", textSize)}>
          InsightFlow
          <span className="ml-1 font-normal text-muted-foreground">AI</span>
        </span>
      ) : null}
    </span>
  );
}
