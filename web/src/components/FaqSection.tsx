import './FaqSection.css'

const questions = [
  {
    question: 'Can a photo tell me my clothing’s exact footprint?',
    answer: 'No. EcoScan identifies a clothing category and applies an illustrative estimate. A photo cannot show the garment’s materials, factory, transport, or full lifecycle.',
  },
  {
    question: 'What if EcoScan identifies an item incorrectly?',
    answer: 'You can change the category, quantity, or item list before confirming a scan and still receive an estimate. Because edited or manual entries cannot be verified from the photo, they do not earn points. A clearly labelled mock suggestion also earns no points.',
  },
  {
    question: 'How do I earn demo points?',
    answer: 'An unchanged live AI suggestion can earn demo points when it replaces a new purchase you had already planned. Similar images are checked across browser sessions for 90 days, including common rotations and background crops. Daily demo earnings are capped at 250 points per browser session. Edited, manual, duplicate, mock, or non-replacement scans still show an estimate but earn zero points.',
  },
  {
    question: 'What is a partner-confirmed activity?',
    answer: 'An approved partner can confirm its own completed repair, secondhand purchase, accepted donation, or recycling transaction using a short-lived code. Only the partner can confirm it; photos and self-declarations cannot. Activity credits are recorded separately from demo points and cannot redeem offers. Partner activity does not prove exact CO₂ savings or garment ownership.',
  },
  {
    question: 'Can I redeem these offers in a real shop?',
    answer: 'No. The offers and points are fictional examples. Redeeming one changes only your demo balance; it does not issue a voucher or a carbon credit.',
  },
  {
    question: 'What happens to my photo?',
    answer: 'When AI recognition is enabled, EcoScan sends the photo to OpenAI for analysis. EcoScan deletes its temporary queued copy after processing, final failure, or scheduled expiry cleanup, but keeps pixel and perceptual fingerprints for 90 days to reduce repeated claims across browser sessions. OpenAI may retain API content in abuse-monitoring logs for up to 30 days by default. Do not upload people, documents, or sensitive information.',
  },
  {
    question: 'Will my result and points still be here later?',
    answer: 'Your latest estimate and demo points survive a refresh while this anonymous session remains active. Results and balances cannot be recovered after session expiry. For each redeemed offer, you can separately generate and download a private recovery key before losing the session. That key retrieves a read-only receipt for 180 days after issuance, including on another browser. It does not restore points, permit voucher use or refunds, or require an account.',
  },
]

export function FaqSection() {
  return <section className="faq-section" id="faq" aria-labelledby="faq-title">
    <p className="faq-eyebrow">A few useful answers</p>
    <h2 id="faq-title">Questions, answered.</h2>
    <div className="faq-list">
      {questions.map(({ question, answer }) => <details className="faq-item" key={question}>
        <summary><span>{question}</span><span className="faq-toggle" aria-hidden="true">+</span></summary>
        <p>{answer}</p>
      </details>)}
    </div>
  </section>
}
