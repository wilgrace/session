export const metadata = {
  title: "Terms of Service – Session",
  robots: { index: true, follow: true },
}

export default function TermsOfServicePage() {
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
          Terms of Service
        </h1>
        <p className="text-sm text-slate-500 mb-10">
          Last updated: 3 March 2026
        </p>

        <div className="space-y-10 text-slate-700 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              1. Introduction and Acceptance
            </h2>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the Session
              platform (&ldquo;Platform&rdquo;), a multi-tenant session booking service
              operated by Session (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;). By creating an
              account or using the Platform in any way, you (&ldquo;User&rdquo;) agree to
              be bound by these Terms.
            </p>
            <p className="mt-3">
              If you are accessing the Platform on behalf of a business or
              organisation (&ldquo;Organisation&rdquo;), you represent that you have
              authority to bind that Organisation to these Terms. In that case,
              &ldquo;you&rdquo; and &ldquo;your&rdquo; also refers to that Organisation.
            </p>
            <p className="mt-3">
              If you do not agree to these Terms, you must not use the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              2. Description of Service
            </h2>
            <p>
              Session is a software-as-a-service (SaaS) platform that enables
              Organisations to create, manage and sell bookable time-based
              sessions (such as sauna sessions, fitness classes, or similar
              activities) to their customers (&ldquo;End Users&rdquo;). The Platform
              provides tools for session scheduling, booking management, payment
              processing, and user communication.
            </p>
            <p className="mt-3">
              Session acts as a technology intermediary. We are not a party to
              any booking transaction between an Organisation and its End Users.
              Each Organisation is solely responsible for the sessions it offers,
              including their safety, quality, and compliance with applicable
              laws.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              3. Account Registration and Security
            </h2>
            <p>
              To use certain features of the Platform, you must create an
              account. You agree to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>
                Notify us immediately of any unauthorised access to your account
              </li>
              <li>
                Not share your account with any third party or allow others to
                access it
              </li>
            </ul>
            <p className="mt-3">
              You are responsible for all activity that occurs under your
              account. We reserve the right to suspend or terminate accounts
              that we reasonably believe are being misused.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              4. Acceptable Use
            </h2>
            <p>You agree not to use the Platform to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>
                Violate any applicable law or regulation, including UK and EU
                data protection law
              </li>
              <li>
                Infringe any intellectual property rights of Session or any
                third party
              </li>
              <li>
                Transmit any material that is defamatory, offensive, or
                otherwise objectionable
              </li>
              <li>
                Attempt to gain unauthorised access to the Platform or its
                underlying systems
              </li>
              <li>
                Introduce malware, viruses, or any other harmful code
              </li>
              <li>
                Engage in any automated scraping or data extraction without
                our prior written consent
              </li>
              <li>
                Use the Platform for fraudulent purposes or to facilitate
                money laundering
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              5. Subscriptions and Payments
            </h2>
            <p>
              Certain features of the Platform are available to Organisations
              on a subscription basis. Subscription fees are billed in advance
              on a recurring basis (monthly or annually, as selected). All fees
              are exclusive of VAT, which will be added where applicable.
            </p>
            <p className="mt-3">
              End Users may purchase session bookings or memberships through the
              Platform. Payments are processed by Stripe, a third-party payment
              provider. By making a payment, you also agree to{" "}
              <a
                href="https://stripe.com/gb/legal/end-users"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 underline"
              >
                Stripe&rsquo;s Terms of Service
              </a>
              . We are not responsible for any errors, failures, or delays
              caused by Stripe&rsquo;s systems.
            </p>
            <p className="mt-3">
              Prices displayed on the Platform are set by the relevant
              Organisation. Session does not control Organisation pricing and
              accepts no liability for pricing errors made by Organisations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              6. Cancellations and Refunds
            </h2>
            <p>
              Cancellation and refund policies for individual sessions are set
              by each Organisation and will be displayed on the relevant booking
              page. Session facilitates refunds on behalf of Organisations but
              is not itself responsible for honouring any particular refund
              policy.
            </p>
            <p className="mt-3">
              If an Organisation cancels a session, affected End Users will be
              notified by email and, where a payment was made, a full refund
              will be processed to the original payment method. Refunds may take
              5–10 business days to appear, depending on your bank.
            </p>
            <p className="mt-3">
              For Organisation subscriptions to the Platform, you may cancel at
              any time. Cancellations take effect at the end of the current
              billing period; no partial refunds are issued for unused time
              unless required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              7. Intellectual Property
            </h2>
            <p>
              The Platform, including its software, design, trademarks, and
              content (excluding Organisation and User content), is owned by or
              licensed to Session and is protected by intellectual property
              laws. You are granted a limited, non-exclusive, non-transferable
              licence to use the Platform for its intended purpose in accordance
              with these Terms.
            </p>
            <p className="mt-3">
              You retain ownership of any content you upload or submit to the
              Platform (&ldquo;User Content&rdquo;). By submitting User Content, you
              grant Session a non-exclusive, royalty-free licence to use, store,
              and display that content solely for the purpose of providing the
              Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              8. Data Protection and Privacy
            </h2>
            <p>
              We process personal data in accordance with our{" "}
              <a href="/privacy-policy" className="text-sky-600 underline">
                Privacy Policy
              </a>{" "}
              and applicable data protection law, including the UK GDPR and the
              Data Protection Act 2018. By using the Platform, you acknowledge
              and agree to our data processing practices as described in the
              Privacy Policy.
            </p>
            <p className="mt-3">
              Organisations acting as data controllers for their End Users&rsquo;
              personal data are responsible for having a lawful basis for
              processing and for providing their own privacy notices to End
              Users where required.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              9. Disclaimer and Limitation of Liability
            </h2>
            <p>
              The Platform is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
              warranty of any kind, express or implied. To the fullest extent
              permitted by English law, we disclaim all warranties, including
              warranties of merchantability, fitness for a particular purpose,
              and non-infringement.
            </p>
            <p className="mt-3">
              Nothing in these Terms excludes or limits our liability for death
              or personal injury caused by our negligence, fraud or fraudulent
              misrepresentation, or any other liability that cannot lawfully be
              excluded or limited.
            </p>
            <p className="mt-3">
              Subject to the above, our total aggregate liability to you in
              connection with these Terms or your use of the Platform shall not
              exceed the greater of (a) the amount you paid to us in the 12
              months preceding the claim, or (b) £100. We are not liable for
              any indirect, consequential, special, or punitive damages, or for
              loss of profits, revenue, data, or goodwill.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              10. Indemnification
            </h2>
            <p>
              You agree to indemnify and hold harmless Session and its officers,
              directors, employees, and agents from and against any claims,
              damages, losses, and expenses (including reasonable legal fees)
              arising out of or in connection with: (a) your use of the
              Platform; (b) your User Content; (c) your breach of these Terms;
              or (d) your violation of any applicable law or third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              11. Termination
            </h2>
            <p>
              We may suspend or terminate your access to the Platform at any
              time, with or without notice, if we reasonably believe you have
              breached these Terms or if we are required to do so by law. You
              may stop using the Platform and delete your account at any time.
            </p>
            <p className="mt-3">
              On termination, all licences granted to you cease immediately.
              Sections 7, 8, 9, 10, 13, and 14 survive termination.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              12. Changes to These Terms
            </h2>
            <p>
              We may update these Terms from time to time. For material changes,
              we will give you at least 30 days&rsquo; notice by email or by
              displaying a prominent notice on the Platform. Your continued use
              of the Platform after the effective date of any changes constitutes
              your acceptance of the revised Terms. If you do not agree to the
              changes, you must stop using the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              13. Third-Party Services
            </h2>
            <p>
              The Platform integrates with third-party services including Stripe
              (payments), Clerk (authentication), and others. Your use of those
              services is subject to their own terms and privacy policies. We
              are not responsible for the practices of any third-party service
              providers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              14. Governing Law and Disputes
            </h2>
            <p>
              These Terms are governed by and construed in accordance with the
              laws of England and Wales. Any dispute arising out of or in
              connection with these Terms shall be subject to the exclusive
              jurisdiction of the courts of England and Wales.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              15. Contact
            </h2>
            <p>
              If you have any questions about these Terms, please contact us:
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
              <a href="/privacy-policy" className="text-sky-600 underline">
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
