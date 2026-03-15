import React from "react";

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f0fdf4_45%,_#ffffff_100%)]">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[32px] border border-white/70 bg-white/85 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-6 py-8 text-white sm:px-8">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
                Elume Legal
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Legal & Privacy
              </h1>
              <p className="mt-3 text-sm leading-6 text-white/90 sm:text-base">
                Clear information about how Elume works, how personal data is handled,
                and the terms that apply when you use the platform.
              </p>
              <p className="mt-3 text-xs font-medium text-white/80 sm:text-sm">
                Last updated: 2 March 2026
              </p>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="border-b border-slate-100 bg-slate-50/80 p-6 lg:border-b-0 lg:border-r">
              <div className="sticky top-6">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  On this page
                </h2>
                <nav className="space-y-2 text-sm">
                  <a href="#overview" className="block rounded-xl px-3 py-2 text-slate-700 transition hover:bg-white hover:text-emerald-700">
                    Overview
                  </a>
                  <a href="#privacy" className="block rounded-xl px-3 py-2 text-slate-700 transition hover:bg-white hover:text-emerald-700">
                    Privacy Policy
                  </a>
                  <a href="#terms" className="block rounded-xl px-3 py-2 text-slate-700 transition hover:bg-white hover:text-emerald-700">
                    Terms of Use
                  </a>
                  <a href="#cookies" className="block rounded-xl px-3 py-2 text-slate-700 transition hover:bg-white hover:text-emerald-700">
                    Cookie Policy
                  </a>
                  <a href="#contact" className="block rounded-xl px-3 py-2 text-slate-700 transition hover:bg-white hover:text-emerald-700">
                    Contact & Data Rights
                  </a>
                </nav>
              </div>
            </aside>

            <main className="px-6 py-8 sm:px-8">
              <section id="overview" className="scroll-mt-24">
                <h2 className="text-2xl font-bold text-slate-900">Overview</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700 sm:text-[15px]">
                  <p>
                    Elume is an online teaching platform designed for secondary school teachers.
                    This page explains the key legal terms that apply when you use Elume, how
                    personal data is handled, and how to contact us about privacy or support matters.
                  </p>
                  <p>
                    Elume is currently offered directly to teachers. Users are responsible for
                    the content they upload and for keeping their own backups of important materials.
                    While reasonable steps are taken to operate and secure the service, Elume does
                    not guarantee uninterrupted availability, permanent storage, or recovery of lost content.
                  </p>
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                    <p className="font-semibold">Operator</p>
                    <p className="mt-1">
                      Peter Fitzgerald trading as Elume
                    </p>
                    <p className="mt-2 font-semibold">Contact</p>
                    <p className="mt-1">
                      <a href="mailto:admin@elume.ie" className="font-medium text-emerald-700 underline underline-offset-2">
                        admin@elume.ie
                      </a>
                    </p>
                  </div>
                </div>
              </section>

              <section id="privacy" className="mt-12 scroll-mt-24">
                <h2 className="text-2xl font-bold text-slate-900">Privacy Policy</h2>
                <div className="mt-4 space-y-5 text-sm leading-7 text-slate-700 sm:text-[15px]">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">1. Who we are</h3>
                    <p className="mt-2">
                      Elume is operated by <strong>Peter Fitzgerald trading as Elume</strong>, based in Ireland.
                      For privacy and data protection queries, please contact{" "}
                      <a href="mailto:admin@elume.ie" className="font-medium text-emerald-700 underline underline-offset-2">
                        admin@elume.ie
                      </a>.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">2. Scope</h3>
                    <p className="mt-2">
                      This Privacy Policy explains how Elume collects, uses, stores, and protects
                      personal data when you use the website, login area, and platform services.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">3. Data we may collect</h3>
                    <p className="mt-2">
                      Depending on how you use Elume, we may collect account information such as your
                      name, email address, login details, and account settings; technical and usage
                      information such as sign-in activity, browser or device information, and service logs;
                      content you choose to upload or create; and communications you send to us for support.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">4. How we use personal data</h3>
                    <p className="mt-2">
                      We use personal data to provide and secure Elume, authenticate users, store and
                      display user-created content, respond to support requests, monitor and improve the
                      platform, detect misuse or technical issues, and comply with legal obligations.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">5. Legal bases</h3>
                    <p className="mt-2">
                      Personal data is processed where necessary for the performance of a contract with
                      you, for legitimate interests in operating and improving Elume, for compliance with
                      legal obligations, or on the basis of consent where consent is required by law.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">6. Hosting and location of data</h3>
                    <p className="mt-2">
                      Elume aims to store primary service data on infrastructure located within the
                      European Economic Area where possible. Some service providers may process limited
                      personal data on our behalf to help us operate the service.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">7. AI features and uploaded content</h3>
                    <p className="mt-2">
                      Elume may use AI-assisted features to generate educational outputs from content that
                      users upload or create. Users should only upload content they are entitled to use and
                      should avoid including unnecessary personal data. Users are responsible for reviewing
                      AI-generated outputs before relying on them.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">8. Retention</h3>
                    <p className="mt-2">
                      Personal data is kept only for as long as reasonably necessary to provide the service,
                      maintain appropriate records, resolve disputes, enforce our terms, and comply with legal obligations.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">9. User responsibility for backups</h3>
                    <p className="mt-2">
                      Users are responsible for keeping their own backups of any content they consider important.
                      Elume does not guarantee permanent storage, uninterrupted access, or recovery of deleted or lost content.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">10. Sharing of data</h3>
                    <p className="mt-2">
                      Elume does not sell personal data. Personal data may be shared with service providers
                      who help operate the platform, where required by law, or where reasonably necessary to
                      protect the rights, security, or integrity of Elume and its users.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">11. Security</h3>
                    <p className="mt-2">
                      Reasonable technical and organisational measures are used to protect personal data.
                      However, no online service can guarantee absolute security.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">12. Your rights</h3>
                    <p className="mt-2">
                      Subject to applicable law, you may have rights to access, correct, delete, restrict,
                      object to, or request portability of your personal data. To make a request, contact{" "}
                      <a href="mailto:admin@elume.ie" className="font-medium text-emerald-700 underline underline-offset-2">
                        admin@elume.ie
                      </a>.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">13. Complaints</h3>
                    <p className="mt-2">
                      If you believe your data protection rights have been infringed, you may contact the
                      Irish Data Protection Commission.
                    </p>
                  </div>
                </div>
              </section>

              <section id="terms" className="mt-12 scroll-mt-24">
                <h2 className="text-2xl font-bold text-slate-900">Terms of Use</h2>
                <div className="mt-4 space-y-5 text-sm leading-7 text-slate-700 sm:text-[15px]">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">1. Using Elume</h3>
                    <p className="mt-2">
                      By creating an account or using Elume, you agree to these terms. Elume is intended
                      for teachers and educational use.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">2. Your account</h3>
                    <p className="mt-2">
                      You are responsible for keeping your login credentials secure and for activity that
                      takes place through your account.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">3. Acceptable use</h3>
                    <p className="mt-2">
                      You agree not to use Elume for unlawful purposes, to upload harmful or infringing
                      content, to interfere with the platform, or to process data you do not have the right to use.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">4. User content</h3>
                    <p className="mt-2">
                      You remain responsible for content you upload, create, or store in Elume. You grant
                      Elume a limited right to host, process, transmit, and display that content only as
                      needed to operate the service.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">5. AI-generated outputs</h3>
                    <p className="mt-2">
                      AI-assisted outputs may contain errors or unsuitable content. You are responsible for
                      reviewing and validating generated outputs before using them in teaching or sharing them with others.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">6. Backups, outages, and data loss</h3>
                    <p className="mt-2">
                      Elume is provided on an <strong>as available</strong> basis. Users are responsible
                      for maintaining their own backups of important materials. To the maximum extent permitted
                      by law, Elume is not responsible for loss of data, interruption of access, service downtime,
                      or failure to store or recover content where this arises from user actions, third-party outages,
                      hosting failures, internet disruptions, or events outside reasonable control.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">7. Availability</h3>
                    <p className="mt-2">
                      Elume does not guarantee uninterrupted or error-free availability. Features may be
                      changed, suspended, or discontinued for maintenance, security, or development reasons.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">8. Intellectual property</h3>
                    <p className="mt-2">
                      Except for user content, all rights in Elume, including software, branding, design,
                      and platform materials, remain the property of Elume or its licensors.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">9. Limitation of liability</h3>
                    <p className="mt-2">
                      To the maximum extent permitted by law, Elume shall not be liable for indirect,
                      incidental, consequential, or loss-of-profit damages, or for loss of data, downtime,
                      or business interruption arising from use of the service. Nothing in these terms excludes
                      liability that cannot legally be excluded.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">10. Governing law</h3>
                    <p className="mt-2">
                      These terms are governed by the laws of Ireland, subject to any mandatory rights that apply.
                    </p>
                  </div>
                </div>
              </section>

              <section id="cookies" className="mt-12 scroll-mt-24">
                <h2 className="text-2xl font-bold text-slate-900">Cookie Policy</h2>
                <div className="mt-4 space-y-5 text-sm leading-7 text-slate-700 sm:text-[15px]">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">1. What cookies are</h3>
                    <p className="mt-2">
                      Cookies are small text files stored on your device when you visit a website or use an online service.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">2. How Elume uses cookies</h3>
                    <p className="mt-2">
                      Elume may use cookies or similar technologies for essential login, session management,
                      security, and service functionality.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">3. Strictly necessary cookies</h3>
                    <p className="mt-2">
                      Some cookies are strictly necessary for Elume to function properly and do not require consent
                      where they are essential to provide the service requested by the user.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">4. Analytics and non-essential cookies</h3>
                    <p className="mt-2">
                      If Elume uses analytics or other non-essential cookies, they should only be used where any required consent has been obtained.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">5. Managing cookies</h3>
                    <p className="mt-2">
                      You can manage cookies through your browser settings. Where non-essential cookies are used,
                      users should also be able to withdraw or change consent.
                    </p>
                  </div>
                </div>
              </section>

              <section id="contact" className="mt-12 scroll-mt-24">
                <h2 className="text-2xl font-bold text-slate-900">Contact & Data Rights</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700 sm:text-[15px]">
                  <p>
                    For general support, legal, privacy, or data protection queries, contact:
                  </p>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <p className="font-semibold text-slate-900">Peter Fitzgerald trading as Elume</p>
                    <p className="mt-2">
                      Email:{" "}
                      <a href="mailto:admin@elume.ie" className="font-medium text-emerald-700 underline underline-offset-2">
                        admin@elume.ie
                      </a>
                    </p>
                  </div>
                  <p>
                    When making a data request, please include your name, the email address linked to your
                    account, and a short description of the request.
                  </p>
                </div>
              </section>

              <div className="mt-12 border-t border-slate-100 pt-6 text-xs text-slate-500">
                © 2026 Elume. All rights reserved.
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
