"use client";

import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Checkbox({ checked, onCheckedChange, disabled, id, className }: CheckboxProps) {
  return (
    <RadixCheckbox.Root
      id={id}
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      disabled={disabled}
      className={`
        flex h-5 w-5 items-center justify-center rounded border-2 transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1
        disabled:cursor-not-allowed disabled:opacity-40
        ${checked
          ? "border-blue-600 bg-blue-600"
          : "border-slate-300 bg-white hover:border-blue-400"}
        ${className ?? ""}
      `}
    >
      <RadixCheckbox.Indicator>
        <Check className="h-3 w-3 text-white stroke-[3]" />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
