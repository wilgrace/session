export const metadata = {
  title: "Privacy Policy – Session",
  robots: { index: true, follow: true },
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <a
          href="/"
          className="text-sm text-sky-600 hover:underline mb-10 inline-block"
        >
          ← Back
        </a>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-500 mb-10">
          Last updated: 3 March 2026
        </p>

        <div className="space-y-10 text-slate-700 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              1. Who We Are
            </h2>
            <p>
              Session (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates the Session
              platform at bookasession.org. We are the data controller for
              personal data collected through the Platform.
            </p>
            <p className="mt-3">
              ICO Registration Number: [ICO Number]
            </p>
            <p className="mt-3">
              Contact:{" "}
              <a
                href="mailto:wil.grace@gmail.com"
                className="text-sky-600 underline"
              >
                wil.grace@gmail.com
              </a>
            </p>
            <p className="mt-3">
              This policy explains what personal data we collect, why we collect
              it, how we use it, and your rights under the UK General Data
              Protection Regulation (&ldquo;UK GDPR&rdquo;) and the Data Protection Act
              2018.
            </p>
            <p className="mt-3">
              Please note that individual Organisations using the Platform to
              offer sessions may also act as independent data controllers for
              their own End Users. You should also review the privacy notice of
              the Organisation whose sessions you are booking.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              2. What Personal Data We Collect
            </h2>

            <h3 className="font-medium text-slate-800 mt-4 mb-2">
              Account and profile data
            </h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Name and email address (required to create an account)</li>
              <li>
                Optional demographic information: date of birth, gender,
                ethnicity, work situation, housing situation, and location
                (collected only if you choose to share it in your community
                profile)
              </li>
              <li>Authentication data managed by Clerk (see Section 5)</li>
            </ul>

            <h3 className="font-medium text-slate-800 mt-4 mb-2">
              Booking and transaction data
            </h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Session bookings you make, including dates, times, and quantities</li>
              <li>
                Payment information (processed by Stripe — we do not store raw
                card details)
              </li>
              <li>Membership subscription status and billing history</li>
              <li>Cancellation and refund records</li>
            </ul>

            <h3 className="font-medium text-slate-800 mt-4 mb-2">
              Usage and technical data
            </h3>
            <ul className="list-disc list-inside space-y-1">
              <li>IP address and browser/device information</li>
              <li>Pages visited and actions taken on the Platform</li>
              <li>Error logs and diagnostic information</li>
            </ul>

            <h3 className="font-medium text-slate-800 mt-4 mb-2">
              Communications
            </h3>
            <ul className="list-disc list-inside space-y-1">
              <li>
                Emails we send you (booking confirmations, membership
                confirmations, session cancellation notices)
              </li>
              <li>
                Any correspondence you send us
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              3. Lawful Basis for Processing
            </h2>
            <p>
              We process your personal data on the following legal bases under
              the UK GDPR:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-2">
              <li>
                <strong>Contract</strong> — to create and manage your account,
                process bookings and payments, and fulfil our obligations to you
              </li>
              <li>
                <strong>Legitimate interests</strong> — to operate, maintain,
                and improve the Platform; to detect and prevent fraud; to send
                transactional communications; and to ensure Platform security
              </li>
              <li>
                <strong>Legal obligation</strong> — to comply with applicable
                laws (e.g. accounting, tax, and anti-money-laundering
                requirements)
              </li>
              <li>
                <strong>Consent</strong> — for optional demographic data you
                share in your community profile; you may withdraw consent at
                any time by updating or deleting that information in your
                account settings
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              4. How We Use Your Data
            </h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Creating and managing your account</li>
              <li>Processing session bookings and payments</li>
              <li>Sending booking confirmations, receipts, and notifications</li>
              <li>Managing membership subscriptions and billing</li>
              <li>Providing customer support</li>
              <li>Ensuring the security and integrity of the Platform</li>
              <li>
                Complying with legal and regulatory obligations
              </li>
              <li>
                Analysing usage to improve Platform features and performance
                (using aggregated or anonymised data where possible)
              </li>
            </ul>
            <p className="mt-3">
              We do not sell your personal data to third parties and we do not
              use it for advertising purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              5. Third-Party Processors
            </h2>
            <p>
              We use the following third-party sub-processors to help us deliver
              the Platform. Each is bound by appropriate data processing
              agreements:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-2">
              <li>
                <strong>Clerk</strong> (Clerk Inc., USA) — authentication and
                user identity management. Data is processed in the US under
                standard contractual clauses.
              </li>
              <li>
                <strong>Supabase</strong> (Supabase Inc., USA) — database and
                back-end infrastructure. Data is stored in AWS EU regions where
                available.
              </li>
              <li>
                <strong>Stripe</strong> (Stripe Payments Europe, Ltd., Ireland)
                — payment processing and subscription billing. Stripe is PCI-DSS
                compliant. Review{" "}
                <a
                  href="https://stripe.com/gb/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-600 underline"
                >
                  Stripe&rsquo;s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Resend</strong> (Resend Inc., USA) — transactional
                email delivery.
              </li>
              <li>
                <strong>Vercel</strong> (Vercel Inc., USA) — application hosting
                and content delivery.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              6. Data Retention
            </h2>
            <p>
              We retain your personal data for as long as your account is active
              or as needed to provide the Platform. If you close your account,
              we will delete or anonymise your personal data within 90 days,
              except where we are required to retain it for longer by law (for
              example, financial records are retained for 7 years in line with
              UK tax law).
            </p>
            <p className="mt-3">
              Booking and payment records may be retained for up to 7 years for
              accounting and legal compliance purposes. After this period they
              are securely deleted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              7. Your Rights
            </h2>
            <p>
              Under the UK GDPR you have the following rights in relation to
              your personal data:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-2">
              <li>
                <strong>Right of access</strong> — to request a copy of the
                personal data we hold about you
              </li>
              <li>
                <strong>Right to rectification</strong> — to ask us to correct
                inaccurate or incomplete data
              </li>
              <li>
                <strong>Right to erasure</strong> — to request deletion of your
                personal data (subject to our legal retention obligations)
              </li>
              <li>
                <strong>Right to restriction</strong> — to ask us to restrict
                processing of your data in certain circumstances
              </li>
              <li>
                <strong>Right to data portability</strong> — to receive your
                data in a structured, machine-readable format
              </li>
              <li>
                <strong>Right to object</strong> — to object to processing based
                on legitimate interests
              </li>
              <li>
                <strong>Right to withdraw consent</strong> — where processing
                is based on consent, to withdraw it at any time without
                affecting the lawfulness of prior processing
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{" "}
              <a
                href="mailto:wil.grace@gmail.com"
                className="text-sky-600 underline"
              >
                wil.grace@gmail.com
              </a>
              . We will respond within one month. You also have the right to
              lodge a complaint with the{" "}
              <a
                href="https://ico.org.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 underline"
              >
                Information Commissioner&rsquo;s Office (ICO)
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              8. Cookies
            </h2>
            <p>
              The Platform uses essential cookies to maintain your session and
              authentication state. These cookies are strictly necessary and
              cannot be disabled without breaking Platform functionality.
            </p>
            <p className="mt-3">
              We do not use advertising or tracking cookies. If we introduce
              non-essential cookies in future, we will update this policy and
              request your consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              9. International Data Transfers
            </h2>
            <p>
              Some of our third-party processors are based outside the UK/EEA
              (primarily the United States). Where we transfer personal data
              internationally, we ensure appropriate safeguards are in place,
              such as the UK International Data Transfer Agreement (IDTA) or
              standard contractual clauses approved by the ICO.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              10. Children&rsquo;s Privacy
            </h2>
            <p>
              The Platform is not directed at children under the age of 13. We
              do not knowingly collect personal data from children under 13. If
              you believe a child has provided us with personal data, please
              contact us and we will delete it promptly.
            </p>
            <p className="mt-3">
              Individual Organisations may set their own age restrictions for
              specific sessions. Please check the Organisation&rsquo;s booking terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              11. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. For material
              changes, we will give you at least 30 days&rsquo; notice by email or by
              displaying a prominent notice on the Platform. The &ldquo;Last updated&rdquo;
              date at the top of this page indicates when the policy was last
              revised.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              12. Contact Us
            </h2>
            <p>
              For any questions, requests, or complaints relating to this Privacy
              Policy or our data processing practices, please contact:
            </p>
            <div className="mt-3 space-y-1">
              <p>
                <strong>Session</strong>
              </p>
              <p>[Address]</p>
              <p>
                Email:{" "}
                <a
                  href="mailto:wil.grace@gmail.com"
                  className="text-sky-600 underline"
                >
                  wil.grace@gmail.com
                </a>
              </p>
            </div>
          </section>

          <div className="border-t border-slate-100 pt-8 text-slate-400">
            <p>
              See also:{" "}
              <a href="/terms-of-service" className="text-sky-600 underline">
                Terms of Service
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
