/**
 * The landing page FAQ, and the source of its FAQPage structured data.
 *
 * Rewritten for partners. refery.xyz used to carry the founder pitch, which
 * meant the only people who ever reached it, scouts and independent recruiters,
 * read answers about agency fees and hiring timelines that were addressed to
 * somebody else. Hiring managers are served by refery.io.
 *
 * Kept in one file because app/page.tsx renders it twice: once as visible copy
 * and once as JSON-LD. Two copies would drift.
 */
export const faqItems = [
  {
    q: 'What does it pay?',
    a: 'Our client fee is 10% to 20% of the hire’s first-year base salary, depending on the search, and 70% of that fee is yours. You are paid once the client settles, and there is no cap on how many introductions you make.',
  },
  {
    q: 'Do I need to be a recruiter?',
    a: 'No. Most of our scouts have never recruited. If you know people worth backing and are willing to put your name to them, that is the job. Independent recruiters get a second track, with live searches at companies we are already retained by.',
  },
  {
    q: 'What if I only ever refer one person?',
    a: 'That is fine, and it is the common case. There is no quota, no exclusivity and no obligation to keep going. One exceptional introduction is worth more to us than a batch of maybes.',
  },
  {
    q: 'What happens to someone I introduce?',
    a: 'We read every profile. If they are a fit we speak to them, take them through our talent committee, and represent them to the founders we work with. Your claim on that candidate stands for 24 months, whether they are placed next week or next year.',
  },
  {
    q: 'Do I need an open role to refer someone?',
    a: 'No. Introduce anyone you would vouch for and we match them against the searches we are running now and the ones that come next. Waiting for a perfect role to appear is how good people get missed.',
  },
  {
    q: 'Is my network exposed to anyone?',
    a: 'No. The candidates you introduce stay yours, client names stay confidential, and nothing about a person reaches a company until they have agreed to it.',
  },
  {
    q: 'Who do you actually place?',
    a: 'Hands-on builders and sellers at the individual contributor level, usually two to five years in, for seed to Series B startups in San Francisco and New York. Engineering and go-to-market. We do not place people who mainly want to manage, remote-only candidates, or candidates who need new visa sponsorship.',
  },
  {
    q: 'What does it cost me?',
    a: 'Nothing. There is no fee to join, no subscription and no software to buy. We only make money when a placement happens, which is the same moment you do.',
  },
]
