import { env } from "@crikket/env/server"
import { render } from "@react-email/render"
import type { ReactElement } from "react"
import { Resend } from "resend"
import nodemailer from "nodemailer"

type SendAuthEmailInput = {
  to: string
  subject: string
  text: string
  react: ReactElement
}

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null
const fromEmail = env.RESEND_FROM_EMAIL
const fromName = "Crikket"

let smtpTransporter: nodemailer.Transporter | null = null

if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
  smtpTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE ?? false,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  })
}

export const sendAuthEmail = async ({
  to,
  subject,
  text,
  react,
}: SendAuthEmailInput): Promise<void> => {
  const html = await render(react)

  // 1. Try sending via SMTP if configured
  if (smtpTransporter) {
    const from = env.SMTP_FROM || fromEmail || `${fromName} <${env.SMTP_USER}>`
    try {
      await smtpTransporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
      })
      return
    } catch (smtpError: any) {
      throw new Error(`Failed to send auth email via SMTP: ${smtpError?.message || smtpError}`)
    }
  }

  // 2. Try sending via Resend if configured
  if (resendClient) {
    if (!fromEmail) {
      throw new Error(
        "Missing RESEND_FROM_EMAIL. Set RESEND_FROM_EMAIL in apps/server/.env."
      )
    }

    const { error } = await resendClient.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      html,
      text,
    })

    if (error) {
      throw new Error(`Failed to send auth email via Resend: ${error.message}`)
    }
    return
  }

  // 3. Fallback to console logging if neither SMTP nor Resend is configured
  console.warn(
    `\n==================================================\n` +
    `[EMAIL MOCK] No email provider configured. Email details:\n` +
    `TO: ${to}\n` +
    `SUBJECT: ${subject}\n` +
    `BODY: ${text}\n` +
    `==================================================\n`
  )

  if (env.NODE_ENV === "production" && process.env.ALLOW_EMAIL_MOCK !== "true") {
    throw new Error(
      "Missing email configuration. Please configure either Resend (RESEND_API_KEY) or SMTP (SMTP_HOST, SMTP_USER, SMTP_PASSWORD) in apps/server/.env."
    )
  }
}
