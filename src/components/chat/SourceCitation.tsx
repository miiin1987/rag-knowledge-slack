"use client";

import { Badge } from "@/components/ui/badge";
import type { Source } from "@/types";

interface SourceCitationProps {
  sources: Source[];
}

export function SourceCitation({ sources }: SourceCitationProps) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-muted-foreground mb-1.5">出典</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source, i) => (
          <Badge key={i} variant="secondary" className="text-xs font-normal">
            {source.original_name} — p.{source.page_number}
          </Badge>
        ))}
      </div>
    </div>
  );
}
