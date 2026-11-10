import nodemailer from 'nodemailer';
import config from '../config.js';

let transporter;
let warned = false;

function getTransport() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

async function send({ to, subject, html }) {
  const transport = getTransport();
  if (!transport) {
    if (!warned) {
      console.log('[mail] SMTP_HOST not configured - emails are logged only');
      warned = true;
    }
    console.log(`[mail] to=${to} subject="${subject}"`);
    return { sent: false, reason: 'smtp_not_configured' };
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, html });
    return { sent: true };
  } catch (error) {
    console.error('[mail] send failed:', error.message);
    return { sent: false, reason: error.message };
  }
}

const money = (value, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value) || 0);

const wrapper = (title, body) => `<!doctype html>
<html><body style="margin:0;background:#f6f7f9;font-family:Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <h2 style="margin:0 0 16px">${title}</h2>
    <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e6e8ec">${body}</div>
    <p style="color:#888;font-size:12px;margin-top:20px">Sent by Commerce Core</p>
  </div>
</body></html>`;

export async function sendOrderConfirmation(order, store) {
  if (!order.email) return { sent: false, reason: 'no_email' };
  const items = (order.lineItems || [])
    .map(
      (item) =>
        `<tr><td style="padding:6px 0">${item.title}${item.variantTitle ? ` - ${item.variantTitle}` : ''} × ${item.quantity}</td>
         <td align="right">${money(item.price * item.quantity, order.currency)}</td></tr>`,
    )
    .join('');
  return send({
    to: order.email,
    subject: `Order ${order.number} confirmed - ${store?.name || 'Commerce Core'}`,
    html: wrapper(
      `Thanks, your order ${order.number} is confirmed`,
      `<table width="100%" style="border-collapse:collapse">${items}
        <tr><td style="padding-top:12px;border-top:1px solid #eee">Total</td>
        <td align="right" style="padding-top:12px;border-top:1px solid #eee"><b>${money(order.total, order.currency)}</b></td></tr>
      </table>
      <p style="color:#555">We will email you again when your order ships.</p>`,
    ),
  });
}

export async function sendOrderFulfilled(order, store) {
  if (!order.email) return { sent: false, reason: 'no_email' };
  return send({
    to: order.email,
    subject: `Order ${order.number} shipped - ${store?.name || 'Commerce Core'}`,
    html: wrapper(
      `Order ${order.number} is on its way`,
      `<p>Your order has been fulfilled.</p>${
        order.trackingNumber ? `<p>Tracking number: <b>${order.trackingNumber}</b></p>` : ''
      }`,
    ),
  });
}

export async function sendOrderRefunded(order, store) {
  if (!order.email) return { sent: false, reason: 'no_email' };
  return send({
    to: order.email,
    subject: `Refund issued for order ${order.number} - ${store?.name || 'Commerce Core'}`,
    html: wrapper(`Refund issued`, `<p>We have refunded order ${order.number}.</p>`),
  });
}

export async function sendTestEmail(to) {
  return send({ to, subject: 'Commerce Core SMTP test', html: wrapper('SMTP works', '<p>Your mail settings are correct.</p>') });
}
