"use client";

import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-primary" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <CircleAlertIcon className="size-4 text-destructive" />,
        loading: <LoaderCircleIcon className="size-4 animate-spin text-primary" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border !border-border !bg-background !text-foreground !shadow-card !font-sans !gap-3 !py-3.5",
          title: "!text-sm !font-medium",
          description: "!text-[13px] !text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground !rounded-md",
          closeButton: "!bg-background !border-border",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
