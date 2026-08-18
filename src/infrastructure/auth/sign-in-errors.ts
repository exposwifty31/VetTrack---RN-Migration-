/**
 * Maps the v4 `errors.fields` surface to framework-free display FLAGS. The
 * mapper answers only WHICH field errored — screens render their own localized
 * copy; the provider's `message`/`longMessage` are deliberately not part of
 * the return value, so raw authorization internals cannot leak into the render
 * path through this seam. (Structurally typed: no Clerk import — the import
 * boundary applies to the adapter, not this pure helper.)
 */
import type { SignInFieldErrorFlags } from "@/core/ports/sign-in-flow.port";

interface FieldErrorLike {
  code: string;
  message: string;
}

export interface SignInErrorsLike {
  fields: {
    identifier?: FieldErrorLike | null;
    password?: FieldErrorLike | null;
  };
  raw: unknown[] | null;
  global: unknown[] | null;
}

export function resolveSignInFieldErrors(
  errors: SignInErrorsLike | null | undefined,
): SignInFieldErrorFlags {
  return {
    identifier: errors?.fields?.identifier != null,
    password: errors?.fields?.password != null,
  };
}
