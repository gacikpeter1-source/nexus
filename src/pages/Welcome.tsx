/**
 * Welcome — the short, bilingual "at a glance" pitch for people who haven't
 * signed up yet, embedded from public/welcome.html. Public route (outside
 * App.tsx's ProtectedRoute block, alongside /login), linked from the login
 * screen for prospective users. Full-bleed rather than wrapped in
 * Container/AppLayout — this page has its own self-contained design and no
 * nav chrome makes sense before someone is signed in.
 */

export default function Welcome() {
  return (
    <iframe
      src="/welcome.html"
      title="Nexus"
      className="w-full h-dvh border-0 block"
    />
  );
}
