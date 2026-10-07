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
        <li>
          You&rsquo;re responsible for following the privacy, spam and recording laws that apply to you, including getting any consent needed before recording people
          and taking extra care with sensitive information such as health details.
        </li>
        <li>If you&rsquo;re a client using {LEGAL.product} through a business&rsquo;s link, these terms apply to you too, apart from the sections about plans and billing.</li>
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

      <h2>7. Storage and lost recordings</h2>
      <p>
        Without cloud backup, the encrypted copy of a video on our servers is deleted {LEGAL.retentionDays} days after it&rsquo;s recorded, and the original stays on the
        recording device. With cloud backup, content is kept until you delete it or close your account. Please keep your own copies of anything important.
      </p>
      <p>
        {LEGAL.product} is built to protect recordings from crashes and dropped connections, but no system can rule out every loss. A recording or other content can
        still be lost, for example if a device is lost, damaged or out of storage before an upload finishes, if browser data is cleared, if a recovery key is lost, or
        because of a fault on our side or at one of our providers. We don&rsquo;t promise that content will never be lost, damaged or unavailable, and you&rsquo;re
        responsible for keeping copies of anything you can&rsquo;t afford to lose. To the extent the law allows, we&rsquo;re not liable for lost or damaged content,
        and section 16 (limit of liability) applies to any claim about it.
      </p>

      <h2>8. Your content</h2>
      <p>
        You own what you create and upload. You give us permission to store, encrypt, copy and deliver it only as needed to run {LEGAL.product} for you. Because content
        is encrypted, we don&rsquo;t view or review it.
      </p>
      <p>
        We own {LEGAL.product}, including its software, design, name and logo. We give you a personal, non-transferable right to use it under these terms. If you send us
        ideas or feedback, we may use them freely without paying you.
      </p>

      <h2>9. Acceptable use</h2>
      <p>You agree not to use {LEGAL.product} to:</p>
      <ul>
        <li>break the law, or send content that is unlawful, harassing, threatening, defamatory or infringes anyone else&rsquo;s rights;</li>
        <li>share child sexual abuse material, or content that promotes terrorism or violent extremism. We report this to the authorities;</li>
        <li>record or share images of people without the consent the law requires, or impersonate anyone;</li>
        <li>scam, defraud or mislead anyone, including your clients;</li>
        <li>send spam or unwanted messages to people who haven&rsquo;t agreed to hear from you;</li>
        <li>distribute malware, or try to break into, overload or disrupt the service or other people&rsquo;s accounts;</li>
        <li>copy, resell or reverse-engineer the service, except as the law allows;</li>
        <li>use automated tools to access the service or create accounts, except through features we provide for that;</li>
        <li>use the service where it&rsquo;s prohibited by Australian or other applicable sanctions laws.</li>
      </ul>
      <p>
        We may suspend or close accounts that break these rules, or that put {LEGAL.product}, our users or the public at risk. Where it&rsquo;s reasonable, we&rsquo;ll
        warn you first and give you a chance to fix the problem. We won&rsquo;t refund fees for accounts closed because of a serious breach, except where the law
        requires.
      </p>

      <h2>10. Fair use of plans</h2>
      <ul>
        <li>Each business may have one Free workspace. Don&rsquo;t create extra accounts or workspaces to get around plan limits.</li>
        <li>Staff logins are for one person each. Don&rsquo;t share a login between people.</li>
        <li>We may delete Free workspaces that haven&rsquo;t been used for 12 months, after emailing you at least 30 days beforehand.</li>
        <li>
          If you dispute a valid charge with your bank instead of contacting us, or a payment turns out to be fraudulent, we may suspend your account until it&rsquo;s
          resolved.
        </li>
      </ul>

      <h2>11. Reporting content</h2>
      <p>
        To report content you believe is unlawful or infringes your rights, email {mail} with the link and details. Because content is encrypted, we can&rsquo;t review
        it ourselves, but we can disable links, suspend accounts and cooperate with authorities where the law requires.
      </p>

      <h2>12. Your responsibility for your use</h2>
      <p>
        To the extent the law allows, if you use {LEGAL.product} for a business, you agree to cover our reasonable losses and costs from claims by others (including
        your clients and staff) that arise from your content, your dealings with your clients, or your breach of these terms or the law. This doesn&rsquo;t apply to
        the extent a loss was caused by us.
      </p>

      <h2>13. Help chat</h2>
      <p>
        Our help chat is answered first by an AI assistant, which can make mistakes. It gives general help with using {LEGAL.product} only and isn&rsquo;t legal,
        financial or other professional advice. A person from our team will step in when needed.
      </p>
      <p>
        {LEGAL.product} relies on third-party services such as hosting, payments and email. We&rsquo;re not responsible for their own terms or for outages on their side,
        though we&rsquo;ll do what we reasonably can to keep you working.
      </p>

      <h2>14. Availability and changes</h2>
      <p>
        We work hard to keep {LEGAL.product} running and your recordings safe, but we can&rsquo;t promise the service will always be available or error-free. We may
        improve, change or remove features over time, and we&rsquo;ll tell you in advance about changes that significantly affect you.
      </p>

      <h2>15. Australian Consumer Law</h2>
      <p>
        Nothing in these terms excludes, restricts or modifies any rights you have under the Australian Consumer Law or other laws that can&rsquo;t be excluded. Where
        we&rsquo;re allowed to limit our liability for failing to meet a consumer guarantee, our liability is limited to supplying the service again or paying the cost
        of having it supplied again.
      </p>

      <h2>16. Limit of liability</h2>
      <p>
        To the extent the law allows, we&rsquo;re not liable for indirect or consequential loss, such as lost profits, revenue or data. Our total liability for any
        claim relating to {LEGAL.product} is limited to the greater of the amount you paid us in the 12 months before the claim arose and US$50.
      </p>
      <p>
        We&rsquo;re not responsible for delays or failures caused by events outside our reasonable control, such as outages at our providers, internet failures,
        natural disasters or government action.
      </p>

      <h2>17. Closing your account</h2>
      <p>
        You can delete your account at any time in Settings &gt; Account. Deleting it cancels your subscription and permanently removes your workspace and content, so
        export anything you want to keep first. We may close accounts that seriously or repeatedly break these terms.
      </p>

      <h2>18. Changes to these terms</h2>
      <p>
        We may update these terms. If a change is significant, we&rsquo;ll email you at least 30 days before it takes effect. Continuing to use {LEGAL.product} after
        that means you accept the new terms.
      </p>

      <h2>19. Disputes</h2>
      <p>
        If you have a problem with {LEGAL.product}, please email {mail} first. We&rsquo;ll both try in good faith to sort it out within 30 days before starting any
        formal claim. This doesn&rsquo;t stop either of us seeking urgent relief from a court.
      </p>

      <h2>20. Governing law</h2>
      <p>
        These terms are governed by the laws of {LEGAL.state}, {LEGAL.country}, and the courts of {LEGAL.state} have jurisdiction. If you&rsquo;re a consumer in
        another country, you keep any protections your local law gives you.
      </p>

      <h2>21. General</h2>
      <ul>
        <li>These terms, with our privacy policy and pricing page, are the whole agreement between you and us about {LEGAL.product}.</li>
        <li>If part of these terms can&rsquo;t be enforced, the rest still applies. If we don&rsquo;t enforce a term straight away, we can still enforce it later.</li>
        <li>
          We may transfer these terms to someone who takes over {LEGAL.product} or our business, and we&rsquo;ll tell you if that happens. You can&rsquo;t transfer your
          account without our written permission.
        </li>
        <li>We&rsquo;ll send notices to the email address on your account. Send notices to us at {mail}.</li>
      </ul>

      <h2>22. Contact</h2>
      <p>Questions about these terms? Email {mail}.</p>
      {LEGAL.postalAddress && <p>Postal address: {LEGAL.postalAddress}</p>}
    </LegalPage>
  );
}
