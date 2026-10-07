import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { LEGAL, operatorLine } from "@/lib/legal";

export const metadata = { title: "Terms of Service" };

export default function Page() {
  const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;
  return (
    <LegalPage title="Terms of Service">
      <p>
        {operatorLine()} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). These terms apply when you use {LEGAL.product} at {LEGAL.website} or in our apps. By creating an account
        or using the service, you agree to them.
      </p>

      <h2>1. Who can use {LEGAL.product}</h2>
      <p>
        You must be {LEGAL.minimumAge} or older. If you use {LEGAL.product} for a business, you confirm you&rsquo;re allowed to accept these terms for that business,
        and &ldquo;you&rdquo; includes the business.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>Keep your sign-in details safe. You&rsquo;re responsible for what happens in your account and in the accounts of staff you invite.</li>
        <li>Tell us straight away at {mail} if you think someone has accessed your account without permission.</li>
      </ul>

      <h2>3. Encryption and your recovery key</h2>
      <p>
        Your videos, replies, to-dos and notes are end-to-end encrypted, and we never hold the keys. That means we can&rsquo;t recover your content if you lose your
        recovery key and no signed-in device still has it unlocked. Keep your recovery key somewhere safe. We&rsquo;re not responsible for content that can&rsquo;t be
        decrypted because a key was lost.
      </p>

      <h2>4. Your clients</h2>
      <ul>
        <li>Clients you invite use {LEGAL.product} free of charge, through their personal links.</li>
        <li>
          You&rsquo;re responsible for your relationship with your clients, including having their permission to contact them, to send them content and to store their
          details with us.
        </li>
        <li>Keep client links private. Anyone with a client&rsquo;s link can see what was shared with that client.</li>
      </ul>

      <h2>5. Plans, billing and cancelling</h2>
      <ul>
        <li>
          Paid plans are subscriptions billed in advance, monthly or yearly, in US dollars, and renew automatically until cancelled. Prices are on our{" "}
          <Link href="/pricing">pricing page</Link>.
        </li>
        <li>Payments are processed by Stripe, which may appear on your statement as the seller. Taxes are added where they apply.</li>
        <li>
          When you change plans, we show you the cost before you confirm. Your new plan starts straight away, you&rsquo;re credited for unused time on your old plan,
          and your billing date moves to the day of the change.
        </li>
        <li>
          You can cancel any time in Settings &gt; Billing. Your plan stays active until the end of the period you&rsquo;ve paid for, then your workspace moves to the
          Free plan.
        </li>
        <li>
          Payments aren&rsquo;t refundable for partial periods, except where the law requires a refund. If you think you&rsquo;ve been charged in error, email {mail}.
        </li>
        <li>We may change our prices. We&rsquo;ll give you at least 30 days&rsquo; notice by email, and the new price applies from your next renewal.</li>
        <li>If a payment fails, we may limit paid features until it&rsquo;s resolved.</li>
      </ul>

      <h2>6. Free plan</h2>
      <p>
        The Free plan has the limits shown on our pricing page. Clients of Free workspaces see a short {LEGAL.product} introduction before videos. We may change or end
        the Free plan with reasonable notice.
      </p>

      <h2>7. Storage</h2>
      <p>
        Without cloud backup, the encrypted copy of a video on our servers is deleted {LEGAL.retentionDays} days after it&rsquo;s recorded, and the original stays on the
        recording device. With cloud backup, content is kept until you delete it or close your account. Please keep your own copies of anything important.
      </p>

      <h2>8. Your content</h2>
      <p>
        You own what you create and upload. You give us permission to store, encrypt, copy and deliver it only as needed to run {LEGAL.product} for you. Because content
        is encrypted, we don&rsquo;t view or review it.
      </p>

      <h2>9. Acceptable use</h2>
      <p>You agree not to use {LEGAL.product} to:</p>
      <ul>
        <li>break the law, or send content that is unlawful, harassing, threatening or infringes anyone else&rsquo;s rights;</li>
        <li>send spam or unwanted messages to people who haven&rsquo;t agreed to hear from you;</li>
        <li>distribute malware, or try to break into, overload or disrupt the service or other people&rsquo;s accounts;</li>
        <li>copy, resell or reverse-engineer the service, except as the law allows.</li>
      </ul>
      <p>We may suspend or close accounts that break these rules. Where it&rsquo;s reasonable, we&rsquo;ll warn you first and give you a chance to fix the problem.</p>

      <h2>10. Help chat</h2>
      <p>
        Our help chat is answered first by an AI assistant, which can make mistakes. It gives general help with using {LEGAL.product} only and isn&rsquo;t legal,
        financial or other professional advice. A person from our team will step in when needed.
      </p>

      <h2>11. Availability and changes</h2>
      <p>
        We work hard to keep {LEGAL.product} running and your recordings safe, but we can&rsquo;t promise the service will always be available or error-free. We may
        improve, change or remove features over time, and we&rsquo;ll tell you in advance about changes that significantly affect you.
      </p>

      <h2>12. Australian Consumer Law</h2>
      <p>
        Nothing in these terms excludes, restricts or modifies any rights you have under the Australian Consumer Law or other laws that can&rsquo;t be excluded. Where
        we&rsquo;re allowed to limit our liability for failing to meet a consumer guarantee, our liability is limited to supplying the service again or paying the cost
        of having it supplied again.
      </p>

      <h2>13. Limit of liability</h2>
      <p>
        To the extent the law allows, we&rsquo;re not liable for indirect or consequential loss, such as lost profits, revenue or data. Our total liability for any
        claim relating to {LEGAL.product} is limited to the amount you paid us in the 12 months before the claim arose.
      </p>

      <h2>14. Closing your account</h2>
      <p>
        You can delete your account at any time in Settings &gt; Account. Deleting it cancels your subscription and permanently removes your workspace and content, so
        export anything you want to keep first. We may close accounts that seriously or repeatedly break these terms.
      </p>

      <h2>15. Changes to these terms</h2>
      <p>
        We may update these terms. If a change is significant, we&rsquo;ll email you at least 30 days before it takes effect. Continuing to use {LEGAL.product} after
        that means you accept the new terms.
      </p>

      <h2>16. Governing law</h2>
      <p>
        These terms are governed by the laws of {LEGAL.state}, {LEGAL.country}, and the courts of {LEGAL.state} have jurisdiction. If you&rsquo;re a consumer in
        another country, you keep any protections your local law gives you.
      </p>

      <h2>17. Contact</h2>
      <p>Questions about these terms? Email {mail}.</p>
      {LEGAL.postalAddress && <p>Postal address: {LEGAL.postalAddress}</p>}
    </LegalPage>
  );
}
