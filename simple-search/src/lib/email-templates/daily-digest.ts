// Email template for daily research digest
// Professional, clean design matching Evidentia branding

interface Paper {
  id: string
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  venue: string | null
  citationCount: number | null
  url: string | null
  publicationDate: string | null
}

interface DailyDigestData {
  userName: string
  papers: Paper[]
  feedUrl: string
  unsubscribeUrl: string
}

export function generateDailyDigestEmail(data: DailyDigestData): { subject: string; html: string } {
  const { userName, papers, feedUrl, unsubscribeUrl } = data
  const paperCount = papers.length
  const hasUpdates = paperCount > 0

  const subject = hasUpdates
    ? `Your Daily Research Digest - ${paperCount} New ${paperCount === 1 ? 'Paper' : 'Papers'}`
    : 'Your Daily Research Digest - No New Papers Today'

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.05em;">EVIDENTIA</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Your Daily Research Digest</p>
        </div>

        <!-- Main Content -->
        <div style="margin-bottom: 30px;">
          <p style="margin: 0 0 20px 0; color: #1e293b; font-size: 16px;">
            Hello ${escapeHtml(userName)},
          </p>
          <p style="margin: 0 0 30px 0; color: #475569; font-size: 15px;">
            ${hasUpdates
              ? "Here's what's new in your research areas today:"
              : "We didn't find any brand new papers for your topics in the last 24 hours. We'll keep looking and let you know as soon as something publishes."}
          </p>

          <!-- Papers -->
          ${hasUpdates
            ? papers.map(paper => generatePaperCard(paper)).join('\n')
            : `<div style="background: #f1f5f9; border-radius: 12px; padding: 24px; border: 1px dashed #cbd5f5; text-align: center; color: #64748b; font-size: 14px;">
                No fresh papers today. Take this moment to review your saved lists or broaden your keywords to catch more results.
              </div>`}
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 40px 0;">
          <a href="${feedUrl}" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            View Your Full Feed
          </a>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
          <p style="margin: 0 0 10px 0; color: #94a3b8; font-size: 12px; text-align: center;">
            Evidentia Academic Research Aggregator<br/>
            Powered by Semantic Scholar, Supabase & Resend
          </p>
          <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center;">
            <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe from daily digests</a>
          </p>
        </div>
      </body>
    </html>
  `

  return { subject, html }
}

function generatePaperCard(paper: Paper): string {
  const authors = paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' et al.' : '')
  const abstract = paper.abstract ? truncateText(paper.abstract, 200) : 'No abstract available.'
  const venue = paper.venue || 'Unknown venue'
  const year = paper.year || 'Unknown year'
  const citations = paper.citationCount !== null ? `${paper.citationCount} citations` : ''
  const paperUrl = paper.url || '#'

  return `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 12px 0; font-size: 17px; font-weight: 600; line-height: 1.4;">
        <a href="${paperUrl}" style="color: #0f172a; text-decoration: none;">
          ${escapeHtml(paper.title)}
        </a>
      </h3>

      <p style="margin: 0 0 12px 0; color: #64748b; font-size: 13px;">
        ${escapeHtml(authors)}
      </p>

      <p style="margin: 0 0 12px 0; color: #475569; font-size: 14px; line-height: 1.5;">
        ${escapeHtml(abstract)}
      </p>

      <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
        <span style="color: #64748b; font-size: 13px;">
          ${escapeHtml(venue)} • ${year}
        </span>
        ${citations ? `
          <span style="color: #0ea5e9; font-size: 13px; font-weight: 500;">
            ${escapeHtml(citations)}
          </span>
        ` : ''}
      </div>
    </div>
  `
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '...'
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}
