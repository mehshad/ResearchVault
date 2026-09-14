/**
 * The message under a field that failed validation.
 *
 * For the hand-rolled forms (the grant editor, the RA-200 forms) that hold
 * their values in useState rather than react-hook-form, and so cannot use
 * FormMessage. Renders nothing when there is nothing to say, so it can sit
 * under every field unconditionally.
 */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}
