import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.EMAIL_HOST || !env.EMAIL_USER || !env.EMAIL_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_PORT === 465,
      auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS },
    });
  }
  return transporter;
}

export async function sendOtpEmail(to: string, code: string, purpose: "verify" | "reset"): Promise<void> {
  const subject = purpose === "verify" ? "Verify your Typist account" : "Reset your Typist password";
  const heading = purpose === "verify" ? "Verify your email" : "Reset your password";
  const body = purpose === "verify" ? "Enter this code to verify your account:" : "Enter this code to reset your password:";
  const html = `
    <div style="font-family:monospace;max-width:420px;margin:0 auto">
      <h2>${heading}</h2>
      <p>${body}</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p>
      <p style="color:#888">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
    </div>
  `;

  const t = getTransporter();
  if (!t) {
    // No SMTP configured (e.g. local dev) - log instead of failing the request.
    console.log(`[email] (no SMTP configured) OTP for ${to} (${purpose}): ${code}`);
    return;
  }

  await t.sendMail({ from: env.EMAIL_USER, to, subject, html });
}
