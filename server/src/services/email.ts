export const sendTransactionalEmail = async (
  to: string,
  subject: string,
  textContent: string,
  htmlContent: string,
) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_FROM_ADDRESS;

  if (
    !apiKey ||
    !senderEmail ||
    apiKey === 'your_brevo_api_key' ||
    senderEmail === 'your_verified_sender@example.com'
  ) {
    throw new Error('Email service is not configured');
  }

  const response = await fetch(
    'https://api.brevo.com/v3/smtp/email',
    {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: process.env.EMAIL_FROM_NAME || 'JogQuest',
          email: senderEmail,
        },
        to: [{ email: to }],
        subject,
        textContent,
        htmlContent,
      }),
    },
  );

  if (!response.ok) {
    console.error(
      'Brevo delivery failed:',
      response.status,
    );
    throw new Error('Email delivery failed');
  }
};
