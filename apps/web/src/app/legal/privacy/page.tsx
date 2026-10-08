import LegalPage from "@/components/LegalPage";
import { LEGAL, operatorLine } from "@/lib/legal";

export const metadata = { title: "Privacy Policy" };

export default function Page() {
  const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;
  return (
    <LegalPage title="Privacy Policy">
      <p>
        {operatorLine()} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy explains what personal information we collect when you use {LEGAL.product}, why, and what
        choices you have. We handle personal information in line with the Australian Privacy Principles in the Privacy Act 1988 (Cth).
      </p>

      <h2>The short version</h2>
      <ul>
        <li>Your videos, replies, to-dos and notes are end-to-end encrypted in your browser. We can&rsquo;t open them, and neither can anyone we work with.</li>
        <li>
          If a business switches on our optional AI transcripts and summaries, the text of each video&rsquo;s transcript (never the audio or video) is sent to our AI
          provider to write a summary. It&rsquo;s off unless the business turns it on.
        </li>
        <li>We collect only what we need to run your account, bill you and help you.</li>
        <li>We don&rsquo;t sell personal information, show ads or use advertising trackers.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address, business name, branding and settings.</li>
        <li>
          <strong>Team details:</strong> for businesses with staff, each team member&rsquo;s name, email address and role, which clients they look after, what
          they&rsquo;re allowed to see and do, and their own email and reminder settings (such as a reply-to address for their clients). Reminders that owners and admins send to staff are stored and emailed as written, so
          they aren&rsquo;t end-to-end encrypted.
        </li>
        <li><strong>Client details you add:</strong> the names and email addresses of clients you invite, so we can send them links and reminders.</li>
        <li>
          <strong>Encrypted content:</strong> videos, replies, to-dos, notes and schedules. These are encrypted on your device before they reach us, and the keys stay with
          you and your clients, so we only ever hold scrambled data. We do keep basic information about them, such as when they were created, their size and length,
          and who they were sent to.
        </li>
        <li>
          <strong>Billing:</strong> your plan and subscription status. Card details go straight to our payment provider, Stripe, and we never see or store them.
        </li>
        <li>
          <strong>Support conversations:</strong> what you type into our help chat, and the email address you give us there.
        </li>
        <li>
          <strong>Technical information:</strong> IP address, browser type and logs of requests, used to keep the service secure, prevent abuse and fix problems.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>
          To provide {LEGAL.product}: storing and delivering your videos, and sending client links, reminders, sign-in emails, team emails (such as a client
          replying, or a staff member sending videos) and a warning before a recording is deleted from our servers.
        </li>
        <li>To bill you and manage your subscription.</li>
        <li>To answer support requests.</li>
        <li>To keep the service secure, prevent misuse and meet our legal obligations.</li>
        <li>To tell you about important changes to the service. We&rsquo;ll only send marketing emails if you&rsquo;ve agreed to them, and you can opt out at any time.</li>
      </ul>

      <h2>Within a business&rsquo;s team</h2>
      <p>If a business has staff on {LEGAL.product}, some information is shared inside that business:</p>
      <ul>
        <li>
          <strong>What staff can see:</strong> staff see the clients assigned to them, those clients&rsquo; videos and conversations, and the videos they recorded
          themselves, unless the owner or an admin gives them access to more. Owners and admins can see every client and video in the business.
        </li>
        <li>
          <strong>Names:</strong> everyone on a team can see the others&rsquo; names, email addresses and roles. If a team member has set their name, clients see it on
          the videos that person sends, as &ldquo;Name from Business&rdquo;, but never their email address.
        </li>
        <li>
          <strong>Team overview:</strong> owners and admins can see how the team is keeping up with clients, worked out from dates and who sent what: for example
          videos each staff member sent, clients who haven&rsquo;t had a video for a while, client replies waiting for an answer and average reply times. They can
          choose to be emailed when staff send videos or clients reply, can see each staff member&rsquo;s own email and reminder settings, and can send staff
          reminders and see whether they were dismissed. None of this involves
          reading encrypted content.
        </li>
        <li>The business is responsible for telling its staff how their activity is shown to owners and admins.</li>
      </ul>

      <h2>Our AI support assistant</h2>
      <p>
        The help chat is answered first by an AI assistant provided by Anthropic. Your messages, and for signed-in customers a summary of your plan and usage, are sent
        to Anthropic to generate replies. The assistant can&rsquo;t see your videos, replies, to-dos or notes. Anything it can&rsquo;t resolve is passed to a person on our
        team, who can read the conversation. Please don&rsquo;t share passwords, recovery keys or card numbers in the chat. We don&rsquo;t use your content or chats to train AI models, and Anthropic doesn&rsquo;t use them to train its models either.
      </p>

      <h2>AI transcripts and summaries (optional)</h2>
      <p>
        Businesses can choose to add AI transcripts and summaries to their videos. It&rsquo;s off by default; only the workspace owner can switch it on, and
        they can switch it off again at any time in Settings &gt; Billing. When it&rsquo;s on:
      </p>
      <ul>
        <li>
          <strong>On the device:</strong> when a team member chooses to make one, the transcript is made in their browser from the decrypted recording. The audio and
          video don&rsquo;t leave that device for this. The speech model is downloaded from our own servers or storage, not from a public model site.
        </li>
        <li>
          <strong>Sent to our AI provider:</strong> the transcript text is sent through our servers to Anthropic, which provides the Claude AI model that writes the
          summary. Anthropic acts as our service provider (sub-processor) and processes it in the United States or other countries where it operates. Anthropic
          doesn&rsquo;t use it to train its models. It may keep it for a limited time to detect misuse and then deletes it, in line with its commercial terms. The
          transcript may include anything said in the video, including personal information about the business, its clients or others.
        </li>
        <li>
          <strong>Stored encrypted:</strong> we don&rsquo;t keep a readable copy of the transcript or summary or put them in our logs. The browser encrypts both with
          the video&rsquo;s key before saving them, so, like replies, only the business&rsquo;s team members who can see the video and the clients it was sent to can read them.
        </li>
        <li>
          <strong>Removing them:</strong> the team can remove a video&rsquo;s transcript and summary at any time. They&rsquo;re also deleted when the video is
          deleted or the account is closed.
        </li>
        <li>
          <strong>Clients:</strong> clients of a business using the add-on see a note saying so. The business is responsible for telling its clients and getting any
          consent the law requires. Questions about a business&rsquo;s use of it are best sent to that business first.
        </li>
      </ul>
      <p>Transcripts and summaries are made by machines and can contain mistakes.</p>

      <h2>Who we share it with</h2>
      <p>We use trusted service providers to run {LEGAL.product}. They may only use your information to provide their service to us:</p>
      <ul>
        <li>Vercel (hosting) and our database and file storage providers, which store your account data and encrypted content.</li>
        <li>Stripe (payments and subscription management).</li>
        <li>Our email delivery provider (sign-in links, client links, reminders and team emails).</li>
        <li>Anthropic (the AI support assistant, and summaries for businesses that use AI transcripts and summaries).</li>
        <li>Google Workspace (our support inbox).</li>
      </ul>
      <p>
        We may also disclose information if the law requires it, or to protect the rights and safety of our users or others. Because content is end-to-end encrypted,
        we can only ever hand over account details and information about content, never the content itself.
      </p>
      <p>If our business is sold or transferred, your information may pass to the new owner, who must keep handling it in line with this policy.</p>

      <h2>Overseas storage</h2>
      <p>
        Our providers store and process information outside Australia, mainly in the United States. We choose providers with strong security and privacy practices.
        Your encrypted content stays encrypted wherever it&rsquo;s stored. The exception is transcript text sent for AI summaries (only for businesses that switch
        them on), which Anthropic must be able to read to write the summary; it&rsquo;s sent over an encrypted connection and processed mainly in the United States.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          Without cloud backup, the encrypted copy of a video on our servers is deleted {LEGAL.retentionDays} days after it&rsquo;s recorded. The original stays on the
          device it was recorded on. We try to email the person who recorded it about a day before, but please don&rsquo;t rely on that email alone.
        </li>
        <li>With cloud backup, encrypted content is kept until you delete it or close your account.</li>
        <li>
          Records of team emails (who was told about which reply or video) are deleted about 30 days after the email is sent. Reminders sent to staff are kept
          with the account as a history for owners and admins.
        </li>
        <li>Account details are kept while your account is open. When you delete your account, we delete your workspace and its content.</li>
        <li>We keep billing records for as long as tax law requires, usually 5 years.</li>
      </ul>

      <h2>Cookies and local storage</h2>
      <p>We only use cookies needed to run {LEGAL.product}:</p>
      <ul>
        <li>
          <strong>Sign-in cookie:</strong> keeps you signed in to your account.
        </li>
        <li>
          <strong>sf_active:</strong> records the time of your last activity. It&rsquo;s deleted when you close your browser, and together with the sign-in cookie it
          signs you out when the browser is closed or after 8 hours without use.
        </li>
        <li>
          <strong>sf_signed_out:</strong> set for 5 minutes after we sign you out this way, so the sign-in page can explain why.
        </li>
        <li>
          <strong>Client link cookie</strong> (fc_client_&hellip;): remembers a client&rsquo;s personal link on their device for up to a year, so they can get back to
          their videos without an account.
        </li>
      </ul>
      <p>
        We also use your browser&rsquo;s storage to hold your encryption keys and unsent recordings on your device, and, for businesses using AI transcripts, a copy
        of the speech model so it doesn&rsquo;t download again. We don&rsquo;t use advertising or tracking cookies.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>You can view and update your account details in Settings.</li>
        <li>You can export your data, or delete your account, from Settings &gt; Account.</li>
        <li>You can ask us for a copy of the personal information we hold about you, or ask us to correct it, by emailing {mail}.</li>
        <li>Clients can turn off reminder emails from the link in any reminder.</li>
      </ul>

      <h2>Clients of businesses using {LEGAL.product}</h2>
      <p>
        If a business invited you as a client, that business decides what to send you and holds your details, and it&rsquo;s responsible for handling them
        lawfully. We store them on the business&rsquo;s behalf. Contact them first about your information. You can also
        email us and we&rsquo;ll help.
      </p>

      <h2>Security</h2>
      <p>
        We use end-to-end encryption for content, encryption in transit, and access controls on our systems. No system is perfectly secure. If a data breach is likely
        to cause you serious harm, we&rsquo;ll notify you and the Office of the Australian Information Commissioner as the law requires.
      </p>

      <h2>Age</h2>
      <p>{LEGAL.product} is for people aged {LEGAL.minimumAge} and over. We don&rsquo;t knowingly collect information from children.</p>

      <h2>Changes</h2>
      <p>We&rsquo;ll update this page when our practices change, and tell you by email about significant changes.</p>

      <h2>Contact and complaints</h2>
      <p>
        Email {mail} with any question or complaint about privacy, and we&rsquo;ll reply within 30 days. If you&rsquo;re not satisfied with our response, you can
        contact the Office of the Australian Information Commissioner at <a href="https://www.oaic.gov.au">oaic.gov.au</a>.
      </p>
      {LEGAL.postalAddress && <p>Postal address: {LEGAL.postalAddress}</p>}
    </LegalPage>
  );
}
