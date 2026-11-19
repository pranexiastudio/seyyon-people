import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

export const inputClass = "h-12 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 aria-invalid:border-red-600";
export function PasswordField(props: ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);
  return <div className="relative"><input {...props} type={visible ? "text" : "password"} className={inputClass + " pr-12"} /><button type="button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 px-3 text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>;
}

