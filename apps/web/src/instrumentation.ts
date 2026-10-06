import type { Instrumentation } from "next";

export function register() {}

/** Every server error lands in Vercel's runtime logs as one searchable line with its route. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      message: e?.message,
      digest: e?.digest,
      stack: e?.stack?.split("\n").slice(0, 8).join("\n"),
      method: request.method,
      path: request.path,
      route: context.routePath,
      kind: context.routeType,
    }),
  );
};
