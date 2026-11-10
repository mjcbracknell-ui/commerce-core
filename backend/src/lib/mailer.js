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

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);

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

export async function sendOrderFulfilled(order, store, fulfillment = null) {
  if (!order.email) return { sent: false, reason: 'no_email' };
  const partial = order.fulfillmentStatus === 'partially_fulfilled';
  const trackingNumber = fulfillment?.trackingNumber || order.trackingNumber;
  const itemRows = (fulfillment?.lineItems || [])
    .map(
      (item) =>
        `<tr><td style="padding:6px 0">${escapeHtml(item.title)}${item.variantTitle ? ` - ${escapeHtml(item.variantTitle)}` : ''} × ${Number(item.quantity) || 0}</td></tr>`,
    )
    .join('');
  const tracking = trackingNumber
    ? `<p>Tracking number: <b>${escapeHtml(trackingNumber)}</b></p>`
    : '';
  const trackingLink = fulfillment?.trackingUrl
    ? `<p><a href="${escapeHtml(fulfillment.trackingUrl)}">Track your shipment</a></p>`
    : '';

  return send({
    to: order.email,
    subject: `Order ${order.number} ${partial ? 'partially shipped' : 'shipped'} - ${store?.name || 'Commerce Core'}`,
    html: wrapper(
      partial ? `Part of order ${order.number} is on its way` : `Order ${order.number} is on its way`,
      `<p>${partial ? 'A shipment from your order has been fulfilled.' : 'Your order has been fulfilled.'}</p>${
        itemRows ? `<table width="100%" style="border-collapse:collapse">${itemRows}</table>` : ''
      }${tracking}${trackingLink}`,
    ),
  });
}

export async function sendCustomerVerification({ email, code, store }) {
  return send({
    to: email,
    subject: `Verify your ${store?.name || 'store'} account`,
    html: wrapper(
      'Verify your customer account',
      `<p>Use this code to finish creating your account:</p>
       <p style="font-size:28px;letter-spacing:6px;font-weight:700">${escapeHtml(code)}</p>
       <p style="color:#555">This code expires in 15 minutes. If you did not request it, ignore this email.</p>`,
    ),
  });
}

export async function sendOrderRefunded(order, store, amount = null) {
  if (!order.email) return { sent: false, reason: 'no_email' };
  const refundText =
    amount == null
      ? `We have refunded order ${order.number}.`
      : `We have refunded ${money(amount, order.currency)} for order ${order.number}.`;
  return send({
    to: order.email,
    subject: `Refund issued for order ${order.number} - ${store?.name || 'Commerce Core'}`,
    html: wrapper(`Refund issued`, `<p>${refundText}</p>`),
  });
}

export async function sendCustomerPasswordReset({ email, code, store }) {
  return send({
    to: email,
    subject: `Reset your ${store?.name || 'store'} password`,
    html: wrapper(
      'Reset your password',
      `<p>Use this code to choose a new password:</p>
       <p style="font-size:28px;letter-spacing:6px;font-weight:700">${escapeHtml(code)}</p>
       <p style="color:#555">This code expires in 15 minutes. If you did not request a reset, you can ignore this email.</p>`,
    ),
  });
}

export async function sendCustomerEmailChange({ email, code, store }) {
  return send({
    to: email,
    subject: `Confirm your new ${store?.name || 'store'} email`,
    html: wrapper(
      'Confirm your new email address',
      `<p>Use this code to finish changing the email on your account:</p>
       <p style="font-size:28px;letter-spacing:6px;font-weight:700">${escapeHtml(code)}</p>
       <p style="color:#555">This code expires in 15 minutes. If you did not request this change, ignore this email.</p>`,
    ),
  });
}

export async function sendTestEmail(to) {
  return send({ to, subject: 'Commerce Core SMTP test', html: wrapper('SMTP works', '<p>Your mail settings are correct.</p>') });
}
