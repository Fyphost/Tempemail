import { SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Plain GET form so filters live in the URL and work without JavaScript. */
export function SearchForm({
  action,
  query,
  placeholder,
  children,
}: {
  action: string;
  query?: string;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-center gap-2" role="search">
      <div className="relative min-w-60 flex-1">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          name="q"
          defaultValue={query}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-9"
        />
      </div>
      {children}
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}
