import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "./cn";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  required?: boolean;
};

export type FieldProps = {
  /** Id of the control; the label, help and error are wired to it. */
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Visually hides the label (it stays available to assistive tech). Use sparingly, e.g. a search box with a visible button. */
  hideLabel?: boolean;
  className?: string;
  /** Exactly one control: Input, Textarea or Select. */
  children: ReactElement<ControlProps>;
};

/**
 * Label + control + help + error. A visible <label> is always present (never placeholder-as-label).
 * The control receives `id`, `aria-describedby` (help, then error), `aria-invalid` and `required`.
 */
export function Field({ id, label, help, error, required, hideLabel, className, children }: FieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId, children.props["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  const control = Children.only(children);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={cn("text-body-sm font-medium text-fg", hideLabel && "sr-only")}>
        {label}
        {required && (
          <span className="text-danger-700" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {help && (
        <p id={helpId} className="text-body-sm text-fg-secondary">
          {help}
        </p>
      )}
      {isValidElement(control)
        ? cloneElement(control, {
            id,
            "aria-describedby": describedBy,
            "aria-invalid": error ? true : control.props["aria-invalid"],
            required: required ?? control.props.required,
          })
        : control}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-body-sm font-medium text-danger-700">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export type FieldGroupProps = {
  legend: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  /** Used to build the help / error ids. */
  id: string;
  className?: string;
  children: ReactNode;
};

/** <fieldset> + <legend> for checkbox, radio and switch groups. */
export function FieldGroup({ legend, help, error, id, className, children }: FieldGroupProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <fieldset
      className={cn("flex flex-col gap-1", className)}
      aria-describedby={[helpId, errorId].filter(Boolean).join(" ") || undefined}
    >
      <legend className="mb-1 text-body-sm font-medium text-fg">{legend}</legend>
      {help && (
        <p id={helpId} className="mb-1 text-body-sm text-fg-secondary">
          {help}
        </p>
      )}
      {children}
      {error && (
        <p id={errorId} className="mt-1 flex items-start gap-1.5 text-body-sm font-medium text-danger-700">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
}
