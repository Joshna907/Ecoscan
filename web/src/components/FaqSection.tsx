import './FaqSection.css'

const questions = [
  {
    question: 'Can a photo tell me my clothing’s exact footprint?',
    answer: 'No. EcoScan identifies a clothing category and applies an illustrative estimate. A photo cannot show the garment’s materials, factory, transport, or full lifecycle.',
  },
  {
    question: 'What if EcoScan identifies an item incorrectly?',
    answer: 'You can change the category, quantity, or item list before confirming a scan. In demo recognition mode, every photo gets an example T-shirt suggestion rather than a real identification.',
  },
  {
    question: 'How do I earn demo points?',
    answer: 'If wearing an item again replaces a new purchase you planned, the demo treats half its estimated production footprint as potentially avoided and awards 10 points per kg. If it does not replace a purchase, the scan awards zero points.',
  },
  {
    question: 'Can I redeem these offers in a real shop?',
    answer: 'No. The offers and points are fictional examples. Redeeming one changes only your demo balance; it does not issue a voucher or a carbon credit.',
  },
  {
    question: 'What happens to my photo?',
    answer: 'When AI recognition is enabled, EcoScan sends the photo to OpenAI for analysis. Queued photos are stored temporarily and deleted after processing, final failure, or expiry within one day. Camera access stops when you finish or close it.',
  },
  {
    question: 'Will my result and points still be here later?',
    answer: 'Yes. Your latest confirmed estimate and demo points can be reopened after a refresh. An anonymous browser session expires after inactivity; a signed-in account keeps its latest estimate and balance across visits. EcoScan does not yet show a full scan history.',
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
