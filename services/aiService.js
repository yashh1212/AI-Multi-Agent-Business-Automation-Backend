async function generateReply(emailText) {
  return `
Hi,

Thanks for your email.
I have reviewed your message and will get back to you shortly.

Best regards,
AI Agent
`;
}

module.exports = { generateReply };