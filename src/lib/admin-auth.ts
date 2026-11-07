export function verifyAdminToken(request: Request): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7);
  return token === process.env.ADMIN_SECRET;
}

export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "認証が必要です" }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
}
