import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    // Get email from request body
    const body = await request.json().catch(() => ({}))
    const toEmail = typeof body.email === 'string' ? body.email : null

    if (!toEmail) {
      return NextResponse.json(
        { error: 'Email address required in request body' },
        { status: 400 }
      )
    }

    // Send test email
    const { data, error } = await resend.emails.send({
      from: 'Evidentia <onboarding@resend.dev>', // Use Resend's test domain
      to: [toEmail],
      subject: 'Evidentia Test Email - Setup Successful! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">EVIDENTIA</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Academic Research Aggregator</p>
            </div>

            <div style="background: #f8fafc; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0;">
              <h2 style="color: #0f172a; margin: 0 0 20px 0; font-size: 20px;">Test Email Successful!</h2>

              <p style="margin: 0 0 15px 0; color: #475569;">
                Great news! Your Resend integration is working correctly. You're now ready to send daily research digest emails to your users.
              </p>

              <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                <p style="margin: 0; color: #64748b; font-size: 14px; font-weight: 600;">Next Steps:</p>
                <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #475569; font-size: 14px;">
                  <li>Create database migration for email preferences</li>
                  <li>Build daily digest endpoint</li>
                  <li>Set up Vercel Cron job</li>
                  <li>Add user controls in profile settings</li>
                </ul>
              </div>

              <p style="margin: 20px 0 0 0; color: #64748b; font-size: 13px;">
                This is a test email sent from your Evidentia development environment.
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                Evidentia Academic Research Aggregator<br/>
                Powered by Semantic Scholar, Supabase & Resend
              </p>
            </div>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error('Resend API error:', error)
      return NextResponse.json(
        { error: 'Failed to send email', details: error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Test email sent successfully!',
      emailId: data?.id,
    })
  } catch (error) {
    console.error('Unexpected error sending test email:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}