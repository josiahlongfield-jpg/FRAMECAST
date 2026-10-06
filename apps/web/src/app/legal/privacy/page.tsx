import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata = { title: "Privacy Policy" };

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold text-slate-900">Privacy Policy</h1>
        <p className="mt-6 text-slate-600">This page will hold the final Privacy Policy, reviewed by counsel before public launch.</p>
      </main>
      <SiteFooter />
    </>
  );
}
