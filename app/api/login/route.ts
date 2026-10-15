export function POST() {
  return Response.json({ error: "login_disabled" }, { status: 410 });
}
